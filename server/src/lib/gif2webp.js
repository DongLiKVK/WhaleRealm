/**
 * GIF → WebP 动图转码
 *
 * 规范第 3 条：GIF 转 WebP 动图，≤5MB / ≤10s / 长边 ≤800px。
 * 服务器只做「落盘前顺手转一次」，不做批量转码队列 —— 转不动就保留原 GIF，绝不阻塞发帖。
 *
 * 为什么用子进程而不是纯 JS 库：
 *   纯 JS 的 gif→webp 要么不支持动图（webp 的 ANMF 帧块），要么要把整个帧序列解到内存里。
 *   ffmpeg 的 libwebp_anim 是唯一天然支持「动图 + 有损 + 调色板」的现成实现，实测 3 秒 640x480
 *   GIF 转一次 1 秒出头。代价是引入一个外部进程 —— 所以下面每一条限制都必须到位。
 *
 * 血泪教训（2026-10-21 事故）：
 *   测试时用了 `-f lavfi -i mandelbrot` 这种**无限生成源**，并把 `-t 4` 放在输出侧。
 *   palettegen 滤镜要读完整个输入流才能算调色板 → 输入无限 → ffmpeg 永不退出 →
 *   2 核被吃满 → 整机用户态卡死，SSH/HTTP 全部无响应（SYN 能回，应用层不干活）。
 *   因此本模块强制三条：**只用文件输入**、**`-t` 同时给输入侧和输出侧**、**`-threads 1`**。
 */
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

/** 三条硬上限，与 DSH任务提示词.md 第 3 条一致 */
const MAX_OUT_BYTES = 5242880;  // 5 MB
const MAX_SECONDS = 10;         // 10 秒
const MAX_EDGE = 800;           // 长边 800 px

/** 单次转码的墙钟上限：超了直接 SIGKILL，绝不让它赖在机器上 */
const TIMEOUT_MS = Number(process.env.GIF2WEBP_TIMEOUT_MS || 25000);
/** 有损质量：实测 75 是「肉眼看不出 + 体积降一半」的平衡点 */
const QUALITY = Number(process.env.GIF2WEBP_QUALITY || 75);

/** 关掉转码的总开关（配 GIF2WEBP=0 即可回退到「GIF 原样落盘」） */
const ENABLED = String(process.env.GIF2WEBP || '1') !== '0';

/**
 * 并发闸门：这台机器只有 2 核 / 3.7GB，一个 ffmpeg 就能吃到 2GB 内存。
 * 两个并发 = 直接 OOM（2026-10-21 就是这么把整机卡死的，dmesg 有 oom_kill 记录）。
 * 所以硬性限制同时只跑 1 个，后来的排队；队列太长就直接放弃转码保留原图，
 * 宁可慢一点，也不能让发帖把机器拖死。
 */
const MAX_CONCURRENT = Number(process.env.GIF2WEBP_CONCURRENCY || 1);
const MAX_QUEUE = Number(process.env.GIF2WEBP_QUEUE || 4);
let running = 0;
const waiters = [];

function acquire() {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve(true);
  }
  if (waiters.length >= MAX_QUEUE) return Promise.resolve(false); // 排队满了，直接放弃
  return new Promise((resolve) => waiters.push(resolve));
}

function release() {
  const next = waiters.shift();
  if (next) next(true);          // 名额直接转交，不先减再加（避免竞态）
  else running--;
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), 'jyg-' + crypto.randomBytes(8).toString('hex') + ext);
}

/** 跑一次 ffmpeg：execFile 不经过 shell，参数原样传给进程，省掉一层引号地狱 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, {
      timeout: TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || '').trim() || err.message || String(err);
        if (err.killed || err.signal === 'SIGKILL') {
          return reject(new Error('转码超时（' + TIMEOUT_MS + 'ms），已强制结束'));
        }
        return reject(new Error('ffmpeg 失败：' + detail.slice(0, 300)));
      }
      resolve();
    });
  });
}

/**
 * 把一段 GIF 字节流转成 WebP 动图。
 * @param {Buffer} buf 原 GIF 字节
 * @returns {Promise<{ok:true, buf:Buffer, from:number, to:number} | {ok:false, reason:string, size?:number}>}
 *   注意：失败时**抛异常**表示「转码本身出错」，返回 ok:false 表示「转成了但不符合规范」
 *   （比如超 5MB），调用方对两者的处理都是「保留原 GIF」，但日志要分开。
 */
async function gifToWebp(buf) {
  if (!ENABLED) return { ok: false, reason: 'DISABLED' };
  if (!Buffer.isBuffer(buf) || buf.length < 32) return { ok: false, reason: 'BAD_INPUT' };

  const slot = await acquire();
  if (!slot) return { ok: false, reason: 'BUSY' };  // 排队满了，让调用方保留原 GIF

  const inp = tmpFile('.gif');
  const out = tmpFile('.webp');

  try {
    fs.writeFileSync(inp, buf);

    /* 参数逐条说明：
       -nostdin        别去读 stdin，后台进程读 stdin 会直接挂死
       -y              覆盖输出（临时文件名是随机的，其实不会撞）
       -threads 1      **关键**：只许用 1 个核。这台机器总共 2 核，转码把核吃满
                       会让 sshd/nginx 拿不到 CPU 时间 —— 就是那次事故的直接原因
       -t N (输入侧)   限制「读多少秒的输入」，对无限源也安全
       -t N (输出侧)   双保险：输出时长也不超过 N 秒
       -vf scale=...   长边压到 800，等比缩放；单引号让 ffmpeg 自己处理 min() 里的逗号
       -loop 0         无限循环播放（动图）
       -c:v libwebp_anim  动图 WebP 编码器（libwebp 是静图用的，不认多帧）
       -lossless 0     有损；无损体积会暴涨到和 GIF 差不多，失去意义
       -q:v 75         有损质量
       -an             丢掉音频轨（GIF 本来也没有，防止奇怪输入带出音频） */
    await runFfmpeg([
      '-nostdin', '-y', '-hide_banner', '-loglevel', 'error',
      '-threads', '1',
      '-filter_threads', '1',
      '-t', String(MAX_SECONDS),
      '-i', inp,
      '-t', String(MAX_SECONDS),
      /* -fs 让 ffmpeg 写到超过 5MB 就自己停手 —— 防的是「超大 GIF 解出几百帧
         把 /tmp 写爆」。写满了它仍然正常退出，下面按体积判定 TOO_LARGE。 */
      '-fs', String(MAX_OUT_BYTES),
      '-vf', "scale='min(" + MAX_EDGE + ",iw)':-1:flags=lanczos",
      '-loop', '0',
      '-c:v', 'libwebp_anim',
      '-lossless', '0',
      '-q:v', String(QUALITY),
      '-an',
      '-f', 'webp', out
    ]);

    if (!fs.existsSync(out)) throw new Error('ffmpeg 退出码正常但没有产出文件');
    const outBuf = fs.readFileSync(out);
    if (outBuf.length < 32) throw new Error('产出文件为空');
    if (outBuf.toString('latin1', 0, 4) !== 'RIFF' || outBuf.toString('latin1', 8, 12) !== 'WEBP') {
      throw new Error('产出不是合法的 WebP');
    }
    // 转完反而更大（小尺寸 GIF 常见）：没有收益，保留原图
    if (outBuf.length >= buf.length) {
      return { ok: false, reason: 'NOT_SMALLER', size: outBuf.length };
    }
    if (outBuf.length > MAX_OUT_BYTES) {
      return { ok: false, reason: 'TOO_LARGE', size: outBuf.length };
    }

    return { ok: true, buf: outBuf, from: buf.length, to: outBuf.length };
  } finally {
    // 临时文件一定要清，转码失败时也不能留垃圾在 /tmp
    try { fs.unlinkSync(inp); } catch (e) { /* 已被清理 */ }
    try { fs.unlinkSync(out); } catch (e) { /* 没生成过 */ }
    release();   // 名额必须归还，否则一次失败就把转码通道永久锁死
  }
}

/** 探测 ffmpeg 是否可用（部署脚本 / 启动自检用） */
function available() {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message });
      const first = String(stdout || '').split('\n')[0].trim();
      resolve({ ok: true, version: first });
    });
  });
}

module.exports = { gifToWebp, available, ENABLED, MAX_OUT_BYTES, MAX_SECONDS, MAX_EDGE };
