'use strict';
/**
 * README 里的配图代理。
 *
 * 为什么必须代理，而不是让浏览器直接去 raw.githubusercontent.com 拉：
 *   · 生产 CSP 是 img-src 'self' data: blob: https://avatars.githubusercontent.com，
 *     README 里的图会被浏览器直接拦掉，条目页只剩一片空白；
 *   · 就算放宽 CSP，raw.githubusercontent.com 在国内基本不可达，访客看到的是碎图标；
 *   · 每个访客各拉一次，等于把 6700 个仓库当 CDN 用，也没法做缓存。
 * 所以图统一走本站 /api/img?u=<原始地址>：服务端取一次、落盘缓存、按长缓存头回给浏览器，
 * 浏览器只和 whalerealm.top 打交道（CSP 与墙都不成问题）。
 *
 * 这是「按 URL 取外部资源」的接口，天生有被当开放代理/SSRF 跳板的风险，所以：
 *   · 只放行图片站的固定白名单（GitHub 资源域 + 常见徽章站），IP 字面量一律不收；
 *   · 只接受 http/https，最多跟 3 次跳转且每一跳都重新校验；
 *   · 响应必须是 image/*，上限 8MB，超了就断；
 *   · 回给浏览器的响应带 nosniff + CSP default-src 'none'，SVG 也执行不了脚本。
 */

const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const fsp = require('fs/promises');
const net = require('net');
const path = require('path');

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_HOPS = 3;
const UA = 'whalerealm-img/1.0 (+https://whalerealm.top)';

/* 白名单：GitHub 的图片域（raw / objects / user-images / camo / media / avatars 都在
   *.githubusercontent.com 下）+ README 里最常见的徽章、图床。故意只列域名，不做通配。 */
const SUFFIX_HOSTS = ['.githubusercontent.com'];
const EXACT_HOSTS = new Set([
  'github.com',
  'img.shields.io',
  'shields.io',
  'badgen.net',
  'i.imgur.com',
  'imgur.com',
  'cdn.jsdelivr.net',
  'codecov.io',
  'travis-ci.org',
  'travis-ci.com',
  'cirrus-ci.com',
  'github-readme-stats.vercel.app',
  'star-history.com',
  'api.star-history.com',
  'simpleicons.org',
]);

const CACHE_DIR = process.env.IMG_CACHE_DIR || path.join(__dirname, '..', 'data', 'imgcache');
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

/* 内网/保留网段：命中任何一条都不许取。README 的图全在公网，没必要为了多几张图
   把 127.0.0.1、169.254.169.254、10.x 这些地址暴露给别人的 README。 */
const PRIVATE_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const BLOCK_SUFFIX = ['.local', '.internal', '.localdomain', '.home.arpa', '.lan', '.corp', '.intranet', '.onion'];
const BLOCK_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal']);

function ipv4Num(ip) {
  return ip.split('.').reduce(function (acc, part) { return (acc << 8) + (Number(part) & 255); }, 0) >>> 0;
}
function privateV4(ip) {
  const n = ipv4Num(ip);
  for (let i = 0; i < PRIVATE_V4.length; i++) {
    const base = ipv4Num(PRIVATE_V4[i][0]);
    const bits = PRIVATE_V4[i][1];
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) >>> 0 === (base & mask) >>> 0) return true;
  }
  return false;
}
function privateIp(ip) {
  const s = String(ip || '');
  if (net.isIPv4(s)) return privateV4(s);
  if (!net.isIPv6(s)) return true;              /* 认不出的当不安全处理 */
  const low = s.toLowerCase();
  if (low === '::1' || low === '::') return true;
  const mapped = low.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return privateV4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(low)) return true;          /* fc00::/7 唯一本地 */
  if (/^fe[89ab][0-9a-f]:/.test(low)) return true;          /* fe80::/10 链路本地 */
  if (/^ff[0-9a-f]{2}:/.test(low)) return true;             /* 组播 */
  return false;
}

/* 名字层面的白名单：命中就直接放行（少一次 DNS，也避开偶尔查不通的公共 DNS） */
function hostAllowed(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  if (net.isIP(h)) return false;                              /* IP 字面量一律不收 */
  if (EXACT_HOSTS.has(h)) return true;
  return SUFFIX_HOSTS.some(function (suf) { return h.length > suf.length && h.slice(-suf.length) === suf; });
}

/* 白名单之外的域名：解析一次，落在公网才放行。README 里的图床五花八门
   （trendshift.io、cdn.supercode.sh、各种赞助商 CDN），只按固定名单放行会让三成配图变碎图标；
   所以改成「公网可达 + 非内网地址」的通用规则，仍然拒绝 IP 字面量与内网域名。 */
async function hostResolvesPublic(host) {
  const h = String(host || '').toLowerCase();
  if (!h || net.isIP(h)) return false;
  if (BLOCK_HOSTS.has(h)) return false;
  if (BLOCK_SUFFIX.some(function (suf) { return h === suf.slice(1) || (h.length > suf.length && h.slice(-suf.length) === suf); })) return false;
  let list;
  try {
    list = await dns.promises.lookup(h, { all: true, verbatim: true });
  } catch (e) {
    return false;
  }
  if (!list || !list.length) return false;
  for (let i = 0; i < list.length; i++) {
    if (privateIp(list[i].address)) return false;             /* 任何一个解析结果在内网都不放行 */
  }
  return true;
}

/* 校验一个候选地址；返回规范化后的 URL 或 null */
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!hostAllowed(u.hostname)) return null;
  if (u.href.length > 2048) return null;
  u.hash = '';
  return u;
}

/* 完整校验（含公网解析）：fetchImage 与跳转链都用它 */
async function checkUrlSafe(raw) {
  const u = checkUrl(raw);
  if (u) return u;
  let probe;
  try { probe = new URL(String(raw || '')); } catch (e) { return null; }
  if (probe.protocol !== 'http:' && probe.protocol !== 'https:') return null;
  if (probe.href.length > 2048) return null;
  if (!(await hostResolvesPublic(probe.hostname))) return null;
  probe.hash = '';
  return probe;
}

function extFor(type) {
  const t = String(type || '').toLowerCase();
  if (t.indexOf('image/svg') >= 0) return '.svg';
  if (t.indexOf('image/png') >= 0) return '.png';
  if (t.indexOf('image/jpeg') >= 0) return '.jpg';
  if (t.indexOf('image/gif') >= 0) return '.gif';
  if (t.indexOf('image/webp') >= 0) return '.webp';
  if (t.indexOf('image/avif') >= 0) return '.avif';
  if (t.indexOf('image/x-icon') >= 0 || t.indexOf('image/vnd.microsoft.icon') >= 0) return '.ico';
  return '.bin';
}

function keyOf(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex');
}

function cachePath(key) {
  return path.join(CACHE_DIR, key.slice(0, 2), key);
}

async function readCache(key) {
  const base = cachePath(key);
  try {
    const st = await fsp.stat(base + '.bin');
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null;
    const body = await fsp.readFile(base + '.bin');
    const type = (await fsp.readFile(base + '.type', 'utf8')).trim() || 'application/octet-stream';
    return { body: body, contentType: type, bytes: body.length, cached: true };
  } catch (e) {
    return null;
  }
}

async function writeCache(key, body, type) {
  const base = cachePath(key);
  try {
    await fsp.mkdir(path.dirname(base), { recursive: true });
    const tmp = base + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, body);
    await fsp.writeFile(tmp + '.type', type);
    await fsp.rename(tmp, base + '.bin');
    await fsp.rename(tmp + '.type', base + '.type');
  } catch (e) {
    /* 缓存写不进去不该影响这次请求 */
  }
}

async function readBodyLimited(res) {
  const chunks = [];
  let total = 0;
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (reader) {
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.length;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch (e) {}
        return { tooLarge: true, body: null };
      }
      chunks.push(Buffer.from(step.value));
    }
  } else {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_BYTES) return { tooLarge: true, body: null };
      chunks.push(Buffer.from(chunk));
    }
  }
  return { tooLarge: false, body: Buffer.concat(chunks) };
}

/**
 * 取一张图。成功 → { ok:true, body, contentType, bytes, url, cached }
 * 失败 → { ok:false, code, message }（BAD_URL / HOST_NOT_ALLOWED / UPSTREAM_STATUS /
 *        NOT_IMAGE / TOO_LARGE / TIMEOUT / FETCH_FAILED）
 */
async function fetchImage(raw, opts) {
  const options = opts || {};
  let url = await checkUrlSafe(raw);
  if (!url) {
    const probe = (function () { try { return new URL(String(raw || '')); } catch (e) { return null; } })();
    if (!probe || (probe.protocol !== 'http:' && probe.protocol !== 'https:')) {
      return { ok: false, code: 'BAD_URL', message: '这个地址不是 http/https 链接' };
    }
    return { ok: false, code: 'HOST_NOT_ALLOWED', message: '这个地址不是公网图片地址：' + probe.hostname };
  }

  const key = keyOf(url.href);
  if (options.cache !== false) {
    const hit = await readCache(key);
    if (hit) return { ok: true, body: hit.body, contentType: hit.contentType, bytes: hit.bytes, url: url.href, cached: true };
  }

  let hops = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url.href, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/svg+xml,image/*;q=0.8,*/*;q=0.5' },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e && (e.name === 'AbortError' || String(e).indexOf('aborted') >= 0);
      return { ok: false, code: aborted ? 'TIMEOUT' : 'FETCH_FAILED', message: aborted ? '取图超时' : '取图失败：' + String(e && e.message || e) };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ok: false, code: 'UPSTREAM_STATUS', message: '上游返回了跳转但没有目标地址' };
      hops += 1;
      if (hops > MAX_HOPS) return { ok: false, code: 'UPSTREAM_STATUS', message: '跳转次数过多' };
      const next = await checkUrlSafe(new URL(loc, url.href).href);
      if (!next) return { ok: false, code: 'HOST_NOT_ALLOWED', message: '跳转目标不是公网图片地址' };
      url = next;
      continue;
    }
    if (!res.ok) {
      return { ok: false, code: 'UPSTREAM_STATUS', message: '上游返回 ' + res.status };
    }

    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type.indexOf('image/') !== 0) {
      try { await res.body.cancel(); } catch (e) {}
      return { ok: false, code: 'NOT_IMAGE', message: '上游返回的不是图片（' + (type || '未知类型') + '）' };
    }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > MAX_BYTES) {
      try { await res.body.cancel(); } catch (e) {}
      return { ok: false, code: 'TOO_LARGE', message: '图片超过 ' + Math.round(MAX_BYTES / 1024) + 'KB' };
    }
    const got = await readBodyLimited(res);
    if (got.tooLarge) return { ok: false, code: 'TOO_LARGE', message: '图片超过 ' + Math.round(MAX_BYTES / 1024) + 'KB' };

    if (options.cache !== false) await writeCache(key, got.body, type);
    return { ok: true, body: got.body, contentType: type, bytes: got.body.length, url: url.href, cached: false };
  }
}

module.exports = { fetchImage, checkUrl, checkUrlSafe, hostAllowed, hostResolvesPublic, privateIp, MAX_BYTES, CACHE_DIR };
