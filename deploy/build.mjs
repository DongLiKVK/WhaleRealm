#!/usr/bin/env node
/**
 * 鲸域静态资源构建脚本
 *
 * 作用：给 css/js 加上内容哈希文件名，并重写 index.html 的引用。
 * 原因：CDN 上给 js/css 配长缓存（1 年）后，如果文件名不变，
 *       更新内容用户永远拿不到旧缓存之外的新版本。加哈希后文件名随内容变，
 *       缓存自然失效，不需要手动刷 CDN。
 *
 * 用法：node deploy/build.mjs
 * 产物：dist/
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, cpSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const ASSETS = 'assets';

const ENTRY = 'index.html';
const HASH_LEN = 8;

function hash8(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);
}

function kb(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

// 清理产物目录
// 注意：Windows 上 dist 偶尔会被 Explorer / 索引器 / 杀软短暂占用，
// 此时 rmSync 会抛 EPERM 或 EBUSY，连带 rmdir 也失败。产物是按内容哈希命名的、
// 写文件本身是覆盖语义，所以清不掉时降级为增量写入，不能因为删目录失败就整个构建失败。
if (existsSync(DIST)) {
  try {
    rmSync(DIST, { recursive: true, force: true });
  } catch (e) {
    console.warn(`⚠ 无法清空 dist（${e.code}：目录被占用），改为增量覆盖`);
  }
}
mkdirSync(join(DIST, ASSETS), { recursive: true });

let html = readFileSync(join(ROOT, ENTRY), 'utf8');

// 收集 index.html 里所有本地 css/js 引用
const refRe = /(?:href|src)="((?:css|js)\/[^"]+\.(?:css|js))"/g;
const refs = [...new Set([...html.matchAll(refRe)].map((m) => m[1]))];

if (refs.length === 0) {
  console.error('未在 index.html 中找到 css/js 引用，构建中止');
  process.exit(1);
}

const manifest = {};
const report = [];

for (const rel of refs) {
  const src = join(ROOT, rel);
  if (!existsSync(src)) {
    console.error(`引用文件不存在: ${rel}`);
    process.exit(1);
  }

  const buf = readFileSync(src);
  const ext = extname(rel);
  const base = rel.slice(rel.lastIndexOf('/') + 1, rel.length - ext.length);
  const hashed = `${base}.${hash8(buf)}${ext}`;
  const outRel = `${ASSETS}/${hashed}`;

  const outPath = join(DIST, outRel);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);

  // 用正则精确替换这一处引用，避免误伤同名的其它字符串
  const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`((?:href|src)=")${esc}(")`, 'g'), `$1${outRel}$2`);

  manifest[rel] = outRel;
  report.push({
    file: rel,
    out: outRel,
    raw: buf.length,
    gzip: gzipSync(buf).length
  });
}

// favicon.ico：浏览器会无条件请求 /favicon.ico，页面里虽有内联 SVG 兜底，
// 但静态托管若没有这个文件会留下一条 404。有就一起复制过去。
if (existsSync(join(ROOT, 'favicon.ico'))) {
  copyFileSync(join(ROOT, 'favicon.ico'), join(DIST, 'favicon.ico'));
}

// 鲸鱼娘人物卡：登录页左卡是 iframe 指向 whale/index.html，整目录原样搬进 dist/whale。
// 里面是 index.html + assets（静态立绘/角标）+ clips-rand（107 段 webm，约 60MB）。
// 素材不入库（见 .gitignore），先把 webm 片段放进 whale/clips-rand 才能构建出完整站点。
const WHALE = join(ROOT, 'whale');
if (existsSync(join(WHALE, 'index.html'))) {
  cpSync(WHALE, join(DIST, 'whale'), { recursive: true });
  const clipsDir = join(WHALE, 'clips-rand');
  const nClips = existsSync(clipsDir) ? readdirSync(clipsDir).filter(n => n.endsWith('.webm')).length : 0;
  if (!nClips) console.warn('⚠ whale/clips-rand/ 为空：登录页左卡会没有动画素材（需要先放进 whale/clips-rand）');
  else console.log(`  鲸鱼娘卡片: whale/（clips-rand ${nClips} 段）`);
} else {
  console.warn('⚠ 未找到 whale/index.html：登录页左卡会退化成空框');
}

// HTML 本身不哈希，靠短缓存策略更新
writeFileSync(join(DIST, ENTRY), html, 'utf8');
const htmlBuf = Buffer.from(html, 'utf8');

// —— CSP 内联脚本哈希对账 ——
// 线上 /etc/nginx/snippets/security-headers.conf 里硬编码了 3 条 sha256
// （index.html 的主题守卫 + whale/index.html 的引擎两段）。这与构建完全解耦：
// 只改内联脚本、不重算 snippet，线上整段内联 JS 会被 CSP 拦掉 —— 白屏，
// 而本地构建全绿、index.html 的 md5 还可能一致，极难发现。
// 这里把每条内联脚本的哈希写进 dist/csp-hashes.json，部署时和线上 snippet 对账。
const inlineHashes = [];
function collectInline(src, where) {
  const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    const code = m[1];
    if (!code.trim()) continue;
    inlineHashes.push({
      where,
      len: Buffer.byteLength(code, 'utf8'),
      hash: 'sha256-' + createHash('sha256').update(code, 'utf8').digest('base64')
    });
  }
}
collectInline(html, 'index.html');
const whaleEntry = join(DIST, 'whale', 'index.html');
if (existsSync(whaleEntry)) collectInline(readFileSync(whaleEntry, 'utf8'), 'whale/index.html');
writeFileSync(join(DIST, 'csp-hashes.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  note: 'sha256 必须与 nginx snippets/security-headers.conf 的 script-src 三条一致，否则内联 JS 被拦',
  inline: inlineHashes
}, null, 2) + '\n', 'utf8');

// 写一份清单，便于部署脚本核对和回滚
writeFileSync(join(DIST, 'build-manifest.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  assets: manifest,
  cspInlineHashes: inlineHashes
}, null, 2) + '\n', 'utf8');

// 输出报告
console.log('\n构建完成 -> dist/\n');
console.log('文件'.padEnd(22) + '原始'.padStart(10) + 'gzip'.padStart(10));
console.log('-'.repeat(44));

let totalRaw = htmlBuf.length;
let totalGz = gzipSync(htmlBuf).length;

console.log(ENTRY.padEnd(22) + kb(htmlBuf.length).padStart(10) + kb(gzipSync(htmlBuf).length).padStart(10));

for (const r of report) {
  console.log(r.out.padEnd(22) + kb(r.raw).padStart(10) + kb(r.gzip).padStart(10));
  totalRaw += r.raw;
  totalGz += r.gzip;
}

console.log('-'.repeat(44));
console.log('合计'.padEnd(22) + kb(totalRaw).padStart(10) + kb(totalGz).padStart(10));
console.log(`\n首屏传输量（gzip）: ${kb(totalGz)}`);
console.log(`资源数: ${refs.length + 1}\n`);
