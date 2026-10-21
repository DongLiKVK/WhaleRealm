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

/** 按扩展名推 contentType，用于本地降级模式 */
function extOf(type) {
  const m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
  return m[type] || 'bin';
}

/** 生成 COS 对象键：u/YYYY/MM/随机.jpg，按日期分目录便于生命周期规则 */
function makeKey(type) {
  const d = new Date();
  const ym = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `u/${ym}/${crypto.randomBytes(12).toString('hex')}.${extOf(type)}`;
}

/**
 * 图片对外 URL
 * style: thumb（动态流 750px）/ thumb-sm（列表 320px）/ origin（原图）
 * 生产环境走 CDN 域名 + COS 图片样式，否则回退到本地 /uploads 路径
 */
function imageUrl(key, style) {
  const s = style || 'thumb';
  const q = s === 'origin' ? '' : `?style=${s}`;
  if (CDN && hasCos) {
    return `${CDN}/${key}${q}`;
  }
  // 本地降级：URL 形状与生产完全一致（带 ?style=），只是 Nginx 静态服务会忽略这个参数，
  // 仍返回原文件。这样前端不用改一行代码，配好 COS 后自动变成真缩略图。
  return `/uploads/${key}${q}`;
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

    const key = makeKey(contentType);
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
    if (!key || key.includes('..') || key.startsWith('/')) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_KEY', message: 'key 不合法' } });
    }

    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.length === 0) {
      return reply.code(400).send({ ok: false, error: { code: 'EMPTY_BODY', message: '没有收到文件内容' } });
    }
    if (buf.length > MAX_SIZE) {
      return reply.code(413).send({ ok: false, error: { code: 'TOO_LARGE', message: '文件超过 5 MB' } });
    }
    const dest = path.join(LOCAL_DIR, key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);

    return { ok: true, data: { key, size: buf.length, url: imageUrl(key, 'origin') } };
  });
}

module.exports = routes;
module.exports.imageUrl = imageUrl;
module.exports.hasCos = hasCos;
