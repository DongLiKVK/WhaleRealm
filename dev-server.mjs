#!/usr/bin/env node
/**
 * 鲸域 · 本地开发服务器（零依赖）
 *
 * 为什么需要它：前端 js/api.js 与 js/auth.js 的 fetch 都用 credentials:'same-origin'，
 * 登录态是 httpOnly Cookie（jingyu_token）。所以页面和 API 必须同源 ——
 * 「静态起一个端口、API 起另一个端口」这种起法 Cookie 根本不会被带上，
 * 表现就是「登录成功但刷新又变游客」或直接「连不上服务端」。
 *
 * 这个脚本做三件事，全部走 node:http，不装任何包：
 *   1. 静态托管仓库根目录（index.html / css / js / whale / docs ...）
 *   2. 把 /api/* 反向代理到后端（默认 127.0.0.1:3000）
 *   3. 把 /ws 的 WebSocket 升级请求也转过去
 * 于是浏览器只看到 http://127.0.0.1:8777 一个源，Cookie 自然生效。
 *
 * 用法：
 *   node dev-server.mjs                # 顺手把后端也拉起来（默认）
 *   DEV_NO_API=1 node dev-server.mjs   # 后端你自己起，这个只做静态+代理
 *   DEV_PORT=9000 node dev-server.mjs  # 换端口
 *
 * 依赖：Node ≥ 20（用到 fs/promises 与 crypto.randomUUID 之类的稳定 API）
 * 后端准备：cd server && npm install && npm run seed（种子脚本会建演示账号）
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.DEV_HOST || '127.0.0.1';
const PORT = Number(process.env.DEV_PORT || 8777);

/* 后端地址：与 server/.env 里的 PORT/HOST 对齐 */
const API_HOST = process.env.API_HOST || '127.0.0.1';
const API_PORT = Number(process.env.API_PORT || 3000);

/* 本地降级上传的落盘目录（server/.env 的 UPLOAD_LOCAL_DIR 指向 server/uploads） */
const UPLOAD_DIR = path.join(ROOT, 'server', 'uploads');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const log = (...a) => console.log('[dev]', ...a);

/* ------------------------------------------------------------------ *
 * 静态文件
 * ------------------------------------------------------------------ */

/**
 * 把 URL 里的路径还原成文件系统路径；不合法一律返回 null（调用方回 400/404）。
 *
 * 三道闸，顺序不能换：
 *   1. 解码 —— 先按字节还原成 UTF-8，再做百分号解码。Node 的 req.url 是非 ASCII
 *      字节逐个按 latin1 映射出来的字符串，直接 decodeURIComponent 会让
 *      `whale/clips-rand/三球抛接.webm` 这种中文文件名变成乱码而 404。
 *   2. 拒绝列表 —— dotfile、node_modules、数据库文件不对外。
 *   3. 目录穿越 —— 解析后必须还在允许的根里。
 */
function resolve(urlPath) {
  const raw = String(urlPath || '').split('?')[0].split('#')[0];

  /* 1) 字节还原 + 百分号解码 */
  const asUtf8 = Buffer.from(raw, 'latin1').toString('utf8');
  let p;
  try {
    p = decodeURIComponent(asUtf8);
  } catch {
    /* 非法百分号编码（例如路径里真有个裸 %）：不要 400，退回未解码的形态 */
    p = asUtf8;
  }
  if (p === '/' || p === '') p = '/index.html';

  /* 2) 拒绝列表 */
  for (const seg of p.split('/')) {
    /* dotfile：.env / .git / .gitignore；.well-known 是标准例外 */
    if (seg.startsWith('.') && seg !== '.' && seg !== '..' && seg !== '.well-known') return null;
    /* 依赖与源码目录不对外：node_modules 里几万个小文件，浏览器不该碰 */
    if (seg === 'node_modules') return null;
  }
  /* 数据库与上传落盘目录：/uploads/* 是唯一允许进 server/ 的入口 */
  if (p.startsWith('/server/') && !p.startsWith('/server/uploads/')) return null;
  if (/\.(db|db-wal|db-shm|sqlite|sqlite3|pem|key|p12|env)$/i.test(p)) return null;

  /* 3) 目录穿越：/uploads/* 落在 server/，其余落在仓库根 */
  const base = p.startsWith('/uploads/') ? path.join(ROOT, 'server') : ROOT;
  const abs = path.resolve(base, '.' + p);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** 解析 Range: bytes=0-1023；返回 null 表示不支持/无需分段 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return null;
  let start;
  let end;
  if (m[1] === '') {
    // bytes=-500 → 最后 500 字节
    const tail = Number(m[2]);
    if (!Number.isFinite(tail) || tail <= 0) return null;
    start = Math.max(0, size - tail);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Number(m[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function serveStatic(req, res, urlPath) {
  const abs = resolve(urlPath);
  if (!abs) return sendText(res, 400, '请求路径不合法');

  let stat;
  try {
    stat = await fsp.stat(abs);
    if (stat.isDirectory()) {
      const idx = path.join(abs, 'index.html');
      stat = await fsp.stat(idx);
      return sendFile(req, res, idx, stat);
    }
  } catch {
    return sendText(res, 404, '找不到这个文件：' + urlPath);
  }
  return sendFile(req, res, abs, stat);
}

function sendFile(req, res, abs, stat) {
  const type = mimeOf(abs);
  const range = req.headers.range ? parseRange(req.headers.range, stat.size) : null;

  /* 视频要能拖动进度条，就必须回 206；否则 Chrome 会把整段吐完才播 */
  if (range) {
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': range.end - range.start + 1,
      'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs, { start: range.start, end: range.end }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(abs).pipe(res);
}

function sendText(res, status, text) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

/* ------------------------------------------------------------------ *
 * 反向代理：/api/* 与 /ws
 * ------------------------------------------------------------------ */

function proxyHttp(req, res) {
  const headers = Object.assign({}, req.headers);
  /* Host 要改成后端的，否则 Fastify 的 trustProxy/绝对 URL 会拿到前端端口 */
  headers.host = API_HOST + ':' + API_PORT;

  const upstream = http.request(
    { host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );

  upstream.on('error', (e) => {
    /* 后端没起来时给前端一个「像网断了」的响应，页面就会挂「离线演示模式」胶囊，
       而不是一直转圈。文案与 js/api.js 的判定路径一致（非 2xx 即失败）。 */
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      error: { code: 'API_DOWN', message: '后端没起来（' + e.code + '）：先在 server 目录跑 npm start' }
    }));
  });

  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
  const up = net.connect(API_PORT, API_HOST, () => {
    /* 原样转发握手请求，只把 Host 换掉 */
    const headers = Object.assign({}, req.headers, { host: API_HOST + ':' + API_PORT });
    const lines = [req.method + ' ' + req.url + ' HTTP/1.1'];
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) for (const one of v) lines.push(k + ': ' + one);
      else lines.push(k + ': ' + v);
    }
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

/* ------------------------------------------------------------------ *
 * 主服务
 * ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api/')) return proxyHttp(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, '静态服务只接受 GET/HEAD');
  return serveStatic(req, res, url);
});

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').startsWith('/ws')) return proxyUpgrade(req, socket, head);
  socket.destroy();
});

/* ------------------------------------------------------------------ *
 * 可选：把后端一起拉起来
 * ------------------------------------------------------------------ */

function probeApi() {
  return new Promise((resolve) => {
    const r = http.get({ host: API_HOST, port: API_PORT, path: '/api/healthz', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}

async function waitApi(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await probeApi()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

let child = null;

async function ensureApi() {
  if (await probeApi()) {
    log('后端已在运行，直接复用 ' + API_HOST + ':' + API_PORT);
    return true;
  }
  if (process.env.DEV_NO_API === '1') {
    log('DEV_NO_API=1，跳过启动后端（/api 请求会返回 502）');
    return false;
  }

  const entry = path.join(ROOT, 'server', 'src', 'index.js');
  if (!fs.existsSync(entry)) {
    log('没找到 server/src/index.js，只做静态托管');
    return false;
  }
  if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules'))) {
    log('server/node_modules 不存在 —— 先跑：cd server && npm install');
  }

  log('启动后端：node src/index.js（cwd=server）');
  /* stdio:inherit 让后端日志直接打在同一个窗口，省得开两个终端 */
  child = spawn(process.execPath, [entry], {
    cwd: path.join(ROOT, 'server'),
    stdio: 'inherit',
    windowsHide: true
  });
  child.on('exit', (code) => {
    child = null;
    if (code !== 0 && code !== null) log('后端退出，code=' + code);
  });

  const ok = await waitApi(15000);
  if (!ok) log('后端 15 秒内没起来 —— /api 会返回 502，看上面的报错');
  return ok;
}

function shutdown(sig) {
  log('收到 ' + sig + '，正在关闭…');
  try { server.close(); } catch { /* 忽略 */ }
  if (child) {
    try { child.kill('SIGTERM'); } catch { /* 忽略 */ }
  }
  process.exit(0);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(sig));

(async () => {
  await ensureApi();
  server.listen(PORT, HOST, () => {
    log('前端  http://' + HOST + ':' + PORT + '/');
    log('接口  http://' + HOST + ':' + PORT + '/api  →  ' + API_HOST + ':' + API_PORT);
    log('演示账号 demo1@jingyu.local ~ demo8@jingyu.local / jingyu1234');
  });
})();
