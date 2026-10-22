/**
 * 上传签名路由
 *
 * 核心约束：服务器全程不接触图片二进制。这里只签一个预签名 URL 给浏览器，
 * 浏览器自己 PUT 到 COS，服务器带宽几乎不动。
 *
 * 无 COS 凭据时的降级：返回 local:true，前端改走 /api/upload/local 落盘到
 * /var/www/jingyu/uploads（仅供开发/演示，生产必须配 COS）。
 */
'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../auth');
const { now } = require('../db');
const gif2webp = require('../lib/gif2webp');

const MAX_SIZE = Number(process.env.UPLOAD_MAX_SIZE || 5242880); // 5MB
const ALLOWED = String(process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,image/webp')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TTL = Number(process.env.UPLOAD_URL_TTL || 300);
const CDN = String(process.env.COS_CDN_DOMAIN || '').replace(/\/+$/, '');
const LOCAL_DIR = process.env.UPLOAD_LOCAL_DIR || '/var/www/jingyu/uploads';

const COS_ID = process.env.COS_SECRET_ID || '';
const COS_KEY = process.env.COS_SECRET_KEY || '';
const COS_BUCKET = process.env.COS_BUCKET || '';
const COS_REGION = process.env.COS_REGION || 'ap-shanghai';

const hasCos = !!(COS_ID && COS_KEY && COS_BUCKET);

let cosClient = null;
if (hasCos) {
  const COS = require('cos-nodejs-sdk-v5');
  cosClient = new COS({ SecretId: COS_ID, SecretKey: COS_KEY });
}

/** 反向表：本地降级时按 key 的扩展名推出「这个文件应该是什么图片」 */
const TYPE_OF_EXT = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/**
 * 文件头验真：只看前 12 字节，确认字节流确实是它自称的那种图片。
 *
 * 为什么必须做：/upload/local 是原样落盘的，不做解码。攻击者把 32 字节的 "data" 存成
 * .png 后，浏览器按扩展名当图片加载会走解码器（历史上 GIFAR 就是把 HTML 塞进 GIF 的
 * 头部当脚本用）。nginx 已有 nosniff + inline 兜底，但那是第二道闸；第一道闸应该在
 * 落盘之前就把非图片字节挡掉，不留任何可疑文件在 web 根目录下。
 *
 * 这里刻意只验魔数不验完整解码 —— 完整解码要引入图像库，而本轮的目标是「排除明显伪造」，
 * 不是「保证图片可正常显示」（显示失败由前端 onerror 兜底）。
 */
function sniffImage(buf, type) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  /* 8 字节签名不够：实测抓到过「89 50 4E 47 0D 0A 1A 0A + RESTART_TEST_6816」这种
     25 字节文件 —— 签名是真的，后面是任意载荷。所以每种格式都要再验一层结构块。 */
  if (type === 'image/png') {
    // PNG 的签名之后紧跟第一个块，规范强制它是 IHDR（长度 13、类型 IHDR）
    const sigOk = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
    if (!sigOk) return false;
    if (buf.length < 33) return false; // 签名 8 + IHDR 块 25
    const ihdr = buf.readUInt32BE(8) === 13 && buf.toString('latin1', 12, 16) === 'IHDR';
    if (!ihdr) return false;
    // 宽高必须非 0 且有上限（防 1e9 宽的解码炸弹）
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return w > 0 && h > 0 && w <= 12000 && h <= 12000;
  }

  if (type === 'image/jpeg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return false;
    if (buf.length < 128) return false;
    // SOI 之后必须是某个合法 marker（排除随机三段 FF D8 FF 之后跟垃圾）
    const m = buf[3];
    if (m < 0xc0 || m > 0xfe) return false;
    // 必须出现 SOF 段（C0-CF，排除 C4 DHT / C8 JPG / CC DAC）
    for (let i = 2; i + 1 < buf.length; i++) {
      if (buf[i] === 0xff) {
        const mk = buf[i + 1];
        if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return true;
      }
    }
    return false;
  }

  if (type === 'image/gif') {
    const head = buf.toString('latin1', 0, 6);
    if (head !== 'GIF87a' && head !== 'GIF89a') return false;
    if (buf.length < 32) return false;
    const w = buf.readUInt16LE(6);
    const h = buf.readUInt16LE(8);
    return w > 0 && h > 0 && w <= 12000 && h <= 12000;
  }

  if (type === 'image/webp') {
    if (buf.toString('latin1', 0, 4) !== 'RIFF') return false;
    if (buf.toString('latin1', 8, 12) !== 'WEBP') return false;
    if (buf.length < 32) return false;
    const sub = buf.toString('latin1', 12, 16);
    return sub === 'VP8 ' || sub === 'VP8L' || sub === 'VP8X';
  }
  return false;
}

/** 按扩展名推 contentType，用于本地降级模式 */
function extOf(type) {
  const m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
  return m[type] || 'bin';
}

/** 换扩展名但保持路径不变：u/1/2026/10/abc.gif → u/1/2026/10/abc.webp。
 *  为什么只换尾巴：这样新键仍然满足 IMG_KEY_RE、仍然带同一个 userId 段，
 *  归属校验不用重写一遍，也不会因为重新随机而丢掉「同一张图」的语义。 */
function swapExt(key, ext) {
  return key.slice(0, key.lastIndexOf('.')) + '.' + ext;
}

/**
 * 从 WebP 字节里读出宽高（只读文件头，不解码像素）。
 * 三种子块都可能出现，libwebp_anim 产出的动图通常是 VP8X。
 * 读不出来就返回 0/0 —— 前端拿 0 会退化成「不写死宽高」，不影响显示。
 */
function webpSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return { w: 0, h: 0 };
  const sub = buf.toString('latin1', 12, 16);
  if (sub === 'VP8X') {
    // 扩展头：24 位小端存 (宽-1) 与 (高-1)，各占 3 字节
    const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { w, h };
  }
  if (sub === 'VP8L') {
    // 无损：14 位宽 + 14 位高，从第 21 字节起
    const b = buf.readUInt32LE(21);
    return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
  }
  if (sub === 'VP8 ') {
    // 有损静图：跳过 3 字节起始码 9d 01 2a 后是 16 位宽、16 位高
    for (let i = 20; i + 9 < buf.length; i++) {
      if (buf[i] === 0x9d && buf[i + 1] === 0x01 && buf[i + 2] === 0x2a) {
        return { w: buf.readUInt16LE(i + 3) & 0x3fff, h: buf.readUInt16LE(i + 5) & 0x3fff };
      }
    }
  }
  return { w: 0, h: 0 };
}

/**
 * 对象键的唯一合法形状：u/<userId>/YYYY/MM/<24位小写hex>.<jpg|png|gif|webp>
 *
 * 这里把 userId 编进键里，是为了让「谁签发的键」在字符串本身上可验证：
 * /api/posts 收到 images[].key 时会用同一个正则 + 比对 userId 段，
 * 于是客户端没法凭一把 "\(quote)" 之类的字符伪造出别的路径 —— 任何不合形状的键
 * 都写不进 post_images，imageUrl() 也就不可能拼出带引号的 src 属性（存储型 XSS 的根）。
 * 正则本身只含 [0-9a-f] / 数字 / 斜杠 / 点，天然排除 " < > 空格 与换行。
 */
const IMG_KEY_RE = /^u\/(\d+)\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{24}\.(jpg|png|gif|webp)$/;

/** 生成 COS 对象键：u/<userId>/YYYY/MM/随机.jpg，按日期分目录便于生命周期规则 */
function makeKey(userId, type) {
  const d = new Date();
  const ym = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const uid = Number(userId);
  const owner = Number.isInteger(uid) && uid > 0 ? String(uid) : '0';
  return `u/${owner}/${ym}/${crypto.randomBytes(12).toString('hex')}.${extOf(type)}`;
}

/**
 * 校验一个键：形状必须匹配 IMG_KEY_RE，且 u/ 后第一段必须是本请求的用户 id。
 * 返回 true 才允许落库或写盘。属于「签发者绑定」而不是「有没有 COS」。
 */
function ownsKey(key, userId) {
  const m = IMG_KEY_RE.exec(String(key || ''));
  if (!m) return false;
  return m[1] === String(Number(userId));
}

/**
 * 图片对外 URL
 * style: thumb（动态流 750px）/ thumb-sm（列表 320px）/ origin（原图）
 * 生产环境走 CDN 域名 + COS 图片样式，否则回退到本地 /uploads 路径
 */
/* COS 图片样式分隔符 —— 必须与 COS 控制台「图片处理 → 图片处理样式 → 样式分隔符」完全一致。
   当前控制台设置是 !（感叹号），所以这里也是 !。
   改控制台后要同步改这里，或者直接跑：sudo jingyu-cos-sep bang | query */
const COS_STYLE_SEP = '!';

/* COS 控制台的样式名只接受「大小写字母、数字和 $ + . _ ( )」—— 连字符 - 会被直接拒绝
   （提示原文：仅支持大小写字母、数字和 $+._() 的组合）。
   所以业务代码里继续用 thumb-sm 这种好读的语义名，拼 URL 前在这里映射成控制台真名。 */
const COS_STYLE_ALIAS = { 'thumb': 'thumb', 'thumb-sm': 'thumb_sm', 'thumb_sm': 'thumb_sm' };
function cosStyle(name) {
  return COS_STYLE_ALIAS[name] || name;
}

function imageUrl(key, style) {
  const s = style || 'thumb';
  if (hasCos) {
    /* 配了 COS 就必须返回 COS 域名：即使没绑 CDN，也要用桶的默认域名回退。
       否则图片在 COS 上、URL 却指向本站 /uploads（那是空的），线上全部裂图。 */
    const base = CDN || `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`;
    return `${base}/${key}${s === 'origin' ? '' : COS_STYLE_SEP + cosStyle(s)}`;
  }
  /* 本地降级：这里绝不能用 ! 作分隔符 —— 静态文件服务会把它当成文件名的一部分
     （/uploads/a.jpg!thumb → 404）。固定用查询串，Nginx 忽略它，直接返回原图。
     前端因此不用改一行代码：配好 COS 当天自动切换成真缩略图。 */
  return `/uploads/${key}${s === 'origin' ? '' : '?style=' + s}`;
}

async function routes(fastify) {
  // 本地降级上传是二进制流，Fastify 默认只解析 JSON，必须显式声明这几个类型
  // 生产走 COS 直传时这个解析器不会被触发，留着无害
  for (const t of ALLOWED) {
    fastify.addContentTypeParser(t, { parseAs: 'buffer', bodyLimit: MAX_SIZE }, (req, body, done) => done(null, body));
  }

  // 签发上传凭证
  fastify.post('/upload/sign', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['filename', 'contentType', 'size'],
        properties: {
          filename: { type: 'string', maxLength: 255 },
          contentType: { type: 'string' },
          size: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const { contentType, size } = req.body;

    if (!ALLOWED.includes(contentType)) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'BAD_TYPE', message: `不支持的格式。允许：${ALLOWED.join('、')}` }
      });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_SIZE', message: '文件大小不对' } });
    }
    if (size > MAX_SIZE) {
      const mb = (MAX_SIZE / 1048576).toFixed(0);
      return reply.code(413).send({ ok: false, error: { code: 'TOO_LARGE', message: `文件超过 ${mb} MB，先压缩一下再传` } });
    }

    const key = makeKey(req.user.id, contentType);
    const expiresAt = now() + TTL;

    // 无 COS 凭据：走本地降级，明确告诉前端
    if (!hasCos) {
      return {
        ok: true,
        data: {
          local: true,
          key,
          uploadUrl: `/api/upload/local?key=${encodeURIComponent(key)}`,
          method: 'POST',
          headers: { 'Content-Type': contentType },
          url: imageUrl(key, 'thumb'),
          formUrl: imageUrl(key, 'origin'),
          expiresAt
        }
      };
    }

    // 生产：COS 预签名 PUT
    const uploadUrl = cosClient.getObjectUrl({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Sign: true,
      Expires: TTL,
      Method: 'PUT'
    });

    return {
      ok: true,
      data: {
        local: false,
        key,
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        url: imageUrl(key, 'thumb'),
        formUrl: imageUrl(key, 'origin'),
        expiresAt
      }
    };
  });

  // 本地降级接收（仅开发/无 COS 时用；生产走 COS 直传不经过这里）
  fastify.post('/upload/local', { preHandler: requireAuth }, async (req, reply) => {
    if (hasCos) {
      return reply.code(400).send({ ok: false, error: { code: 'COS_ENABLED', message: '生产模式请直传 COS' } });
    }
    const key = String(req.query.key || '');
    /* 形状 + 归属双校验：光挡 '..' 挡不住 u/1/../../etc/x，也挡不住拿别人的键写文件 */
    if (!ownsKey(key, req.user.id)) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_KEY', message: 'key 不合法或不属于当前账号' } });
    }

    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.length === 0) {
      return reply.code(400).send({ ok: false, error: { code: 'EMPTY_BODY', message: '没有收到文件内容' } });
    }
    if (buf.length > MAX_SIZE) {
      return reply.code(413).send({ ok: false, error: { code: 'TOO_LARGE', message: '文件超过 5 MB' } });
    }
    // 落盘前验真：字节流必须真是 key 扩展名对应的那种图片
    const ext = key.slice(key.lastIndexOf('.') + 1);
    const expectType = TYPE_OF_EXT[ext];
    if (!expectType || !sniffImage(buf, expectType)) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'BAD_IMAGE', message: '文件内容不是有效的图片，或与扩展名不符' }
      });
    }

    /* GIF 顺手转 WebP（规范第 3 条）：≤5MB / ≤10s / 长边 ≤800。
       只在本地降级模式做 —— COS 直传时服务器根本碰不到二进制，
       那种情况靠 COS 图片处理或前端完成，这里不越界。
       转成功就换成 .webp 键并把新键返回给前端；转不动（超时/更大/忙）
       一律保留原 GIF，绝不让发帖失败。 */
    let finalKey = key;
    let finalBuf = buf;
    let finalType = expectType;
    let note = '';
    if (expectType === 'image/gif') {
      try {
        const conv = await gif2webp.gifToWebp(buf);
        if (conv.ok) {
          finalKey = swapExt(key, 'webp');
          finalBuf = conv.buf;
          finalType = 'image/webp';
          note = 'gif2webp ' + conv.from + '→' + conv.to;
          req.log.info({ from: conv.from, to: conv.to }, 'GIF 已转 WebP 动图');
        } else {
          note = 'gif2webp skip:' + conv.reason;
          req.log.info({ reason: conv.reason, size: conv.size }, 'GIF 保留原格式');
        }
      } catch (e) {
        // 转码失败不影响上传：原 GIF 照常落盘
        note = 'gif2webp error';
        req.log.warn({ err: e.message }, 'GIF 转码失败，保留原图');
      }
    }

    const dest = path.join(LOCAL_DIR, finalKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, finalBuf);

    const size = finalType === 'image/webp' ? webpSize(finalBuf) : { w: 0, h: 0 };
    return {
      ok: true,
      data: {
        key: finalKey,
        size: finalBuf.length,
        type: finalType,
        w: size.w,
        h: size.h,
        converted: finalKey !== key,
        note,
        url: imageUrl(finalKey, 'origin')
      }
    };
  });
}

module.exports = routes;
module.exports.imageUrl = imageUrl;
module.exports.hasCos = hasCos;
module.exports.IMG_KEY_RE = IMG_KEY_RE;
module.exports.ownsKey = ownsKey;
