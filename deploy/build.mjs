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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
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
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
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

// HTML 本身不哈希，靠短缓存策略更新
writeFileSync(join(DIST, ENTRY), html, 'utf8');
const htmlBuf = Buffer.from(html, 'utf8');

// 写一份清单，便于部署脚本核对和回滚
writeFileSync(join(DIST, 'build-manifest.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  assets: manifest
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
