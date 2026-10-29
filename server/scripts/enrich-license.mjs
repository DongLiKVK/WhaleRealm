#!/usr/bin/env node
/* 许可证回填：把 plugins.license 从「一片空白」补成真实值。
 *
 * 两个数据源，按可靠性从高到低：
 *   1) npm registry —— 条目自带 npm 包名时，registry 的 latest.license 是作者自己写的 SPDX；
 *   2) 仓库根目录的 LICENSE / COPYING 原文 —— 抓下来按条款特征词判 SPDX。
 *
 * 为什么不在导入时做：导入是「一次把 6896 条塞进库」，抓许可证要几万次网络请求，
 * 会拖成几小时；这里做成独立、可中断、可续跑的补数据脚本，只碰 license 为空的条目。
 *
 * 用法：
 *   node server/scripts/enrich-license.mjs --stage npm --db ../tmp/fresh2.db
 *   node server/scripts/enrich-license.mjs --stage raw --db ../tmp/fresh2.db --limit 200
 *   node server/scripts/enrich-license.mjs --stage all --concurrency 12 --dry
 * 环境变量：DB_PATH 覆盖库路径；GITHUB_TOKEN 可选（raw 阶段用 api 列目录时更稳）
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const STAGE = String(arg('stage', 'all'));
const LIMIT = Number(arg('limit', 0)) || 0;
const CONC = Number(arg('concurrency', 12)) || 12;
const DRY = !!arg('dry', false);
const DB_PATH = path.resolve(REPO_ROOT, String(arg('db', process.env.DB_PATH || 'server/data/jingyu.db')));
/* dshmarket 索引里带 npm 包名，但导入时没落库（plugins 表没有 npm 列）。
   所以 npm 阶段改为「索引文件按仓库地址查包名」，而不是从库里读。 */
const SRC = path.resolve(REPO_ROOT, String(arg('src', process.env.DSHM_SRC || 'server/scripts/cache/dshmarket.json')));

if (!fs.existsSync(DB_PATH)) {
  console.error('库不存在：' + DB_PATH);
  process.exit(1);
}
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ---------- SPDX 归一化 ---------- */
/* npm 上写什么的都有：'MIT'、'mit'、'(MIT OR Apache-2.0)'、'SEE LICENSE IN LICENSE.txt'、
   {type:'MIT'}、licenses:[{type:'MIT'}]。这里只做「能确定的就归一，确定不了就保留原样」。 */
const CANON = {
  'mit': 'MIT',
  'apache-2.0': 'Apache-2.0', 'apache 2.0': 'Apache-2.0', 'apache2': 'Apache-2.0', 'apache-2': 'Apache-2.0',
  'gpl-3.0': 'GPL-3.0', 'gpl-3.0-only': 'GPL-3.0', 'gpl-3.0-or-later': 'GPL-3.0', 'gplv3': 'GPL-3.0', 'gpl-3': 'GPL-3.0',
  'gpl-2.0': 'GPL-2.0', 'gpl-2.0-only': 'GPL-2.0', 'gpl-2.0-or-later': 'GPL-2.0', 'gplv2': 'GPL-2.0',
  'agpl-3.0': 'AGPL-3.0', 'agpl-3.0-only': 'AGPL-3.0', 'agpl-3.0-or-later': 'AGPL-3.0', 'agplv3': 'AGPL-3.0',
  'lgpl-3.0': 'LGPL-3.0', 'lgpl-3.0-only': 'LGPL-3.0', 'lgpl-3.0-or-later': 'LGPL-3.0',
  'lgpl-2.1': 'LGPL-2.1', 'lgpl-2.1-only': 'LGPL-2.1',
  'mpl-2.0': 'MPL-2.0', 'mpl2': 'MPL-2.0',
  'bsd-3-clause': 'BSD-3-Clause', 'bsd-2-clause': 'BSD-2-Clause', 'bsd': 'BSD-3-Clause',
  'isc': 'ISC', 'unlicense': 'Unlicense', 'the unlicense': 'Unlicense',
  'cc0-1.0': 'CC0-1.0', 'cc-by-4.0': 'CC-BY-4.0', 'cc-by-sa-4.0': 'CC-BY-SA-4.0',
  'wtfpl': 'WTFPL', '0bsd': '0BSD', 'zlib': 'Zlib', 'artistic-2.0': 'Artistic-2.0',
  'epl-2.0': 'EPL-2.0', 'bsl-1.0': 'BSL-1.0', 'psf-2.0': 'PSF-2.0',
  'unlicensed': 'UNLICENSED', 'none': '', 'see license in license': '',
};
function normLicense(raw) {
  if (!raw) return '';
  let s = raw;
  if (Array.isArray(s)) s = s.map(function (x) { return x && x.type ? x.type : x; }).filter(Boolean).join(' OR ');
  if (s && typeof s === 'object') s = s.type || s.name || '';
  s = String(s).trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (CANON[low] !== undefined) return CANON[low];
  /* 「(MIT OR Apache-2.0)」这类双许可：两边都能归一就保留成 MIT OR Apache-2.0 */
  const or = s.match(/^\(?\s*([A-Za-z0-9.\-+]+)\s+OR\s+([A-Za-z0-9.\-+]+)\s*\)?$/i);
  if (or) {
    const a = CANON[or[1].toLowerCase()] || or[1];
    const b = CANON[or[2].toLowerCase()] || or[2];
    return a + ' OR ' + b;
  }
  if (/^see license/i.test(s)) return '';
  return s.slice(0, 40);
}

/* ---------- 条款特征词 → SPDX ---------- */
/* 顺序要紧：AGPL 的正文里也含 "GNU General Public License"，LGPL 同理，
   所以必须先判 AGPL/LGPL，再判 GPL，最后才轮到 MIT/BSD 这种短条款。 */
const SIGNATURES = [
  ['AGPL-3.0', /GNU AFFERO GENERAL PUBLIC LICENSE\s*[\r\n\s]*Version 3/i],
  ['LGPL-3.0', /GNU LESSER GENERAL PUBLIC LICENSE\s*[\r\n\s]*Version 3/i],
  ['LGPL-2.1', /GNU LESSER GENERAL PUBLIC LICENSE\s*[\r\n\s]*Version 2\.1/i],
  ['GPL-3.0', /GNU GENERAL PUBLIC LICENSE\s*[\r\n\s]*Version 3/i],
  ['GPL-2.0', /GNU GENERAL PUBLIC LICENSE\s*[\r\n\s]*Version 2/i],
  ['Apache-2.0', /Apache License\s*[,]?\s*[\r\n\s]*Version 2\.0/i],
  ['MPL-2.0', /Mozilla Public License Version 2\.0/i],
  ['CC0-1.0', /CC0 1\.0 Universal/i],
  /* Creative Commons 系列：文件里写的是完整名称，没有 SPDX 短码。
     长的先判 —— 「Attribution-NonCommercial-ShareAlike」里也含「Attribution-NonCommercial」。 */
  ['CC-BY-NC-SA-4.0', /Attribution-NonCommercial-ShareAlike 4\.0 International/i],
  ['CC-BY-NC-SA-3.0', /Attribution-NonCommercial-ShareAlike 3\.0/i],
  ['CC-BY-NC-ND-4.0', /Attribution-NonCommercial-NoDerivatives 4\.0/i],
  ['CC-BY-NC-4.0', /Attribution-NonCommercial 4\.0 International/i],
  ['CC-BY-SA-4.0', /Attribution-ShareAlike 4\.0 International/i],
  ['CC-BY-SA-3.0', /Attribution-ShareAlike 3\.0/i],
  ['CC-BY-ND-4.0', /Attribution-NoDerivatives 4\.0/i],
  ['CC-BY-4.0', /Attribution 4\.0 International/i],
  ['CC-BY-3.0', /Attribution 3\.0/i],
  ['BSL-1.0', /Boost Software License - Version 1\.0/i],
  ['MS-PL', /Microsoft Public License/i],
  ['Elastic-2.0', /Elastic License 2\.0/i],
  ['PolyForm-Noncommercial-1.0.0', /PolyForm Noncommercial License 1\.0\.0/i],
  ['EUPL-1.2', /European Union Public Licence/i],
  ['Unlicense', /This is free and unencumbered software released into the public domain/i],
  ['WTFPL', /DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i],
  ['0BSD', /Zero-Clause BSD/i],
  ['BSD-3-Clause', /Redistribution and use in source and binary forms[\s\S]{0,2000}?Neither the name/i],
  ['BSD-2-Clause', /Redistribution and use in source and binary forms/i],
  ['ISC', /Permission to use, copy, modify, and\/or distribute this software for any purpose/i],
  ['MIT', /Permission is hereby granted, free of charge, to any person obtaining a copy/i],
  ['Artistic-2.0', /The Artistic License 2\.0/i],
  ['EPL-2.0', /Eclipse Public License - v 2\.0/i],
  ['Zlib', /This software is provided 'as-is', without any express or implied warranty/i],
];
/* 有人把文件存成了「77 73 84 32 76 …」这种十进制字节码（等于把 ASCII 数字敲进去了），
   先还原成正常文本再判，否则永远认不出。 */
function undumpBytes(text) {
  const s = String(text || '');
  if (!/^(\s*\d{2,3}){12,}/.test(s)) return s;
  const nums = s.trim().split(/\s+/).slice(0, 4000);
  let out = '';
  for (let i = 0; i < nums.length; i++) {
    const n = Number(nums[i]);
    if (!Number.isFinite(n) || n < 9 || n > 126) { out = ''; break; }
    out += String.fromCharCode(n);
  }
  return out || s;
}
function sniffLicense(text) {
  const head = undumpBytes(text).slice(0, 20000);
  for (let i = 0; i < SIGNATURES.length; i++) {
    if (SIGNATURES[i][1].test(head)) return SIGNATURES[i][0];
  }
  return '';
}

/* ---------- 网络 ---------- */
const UA = 'whalerealm-license/1.0 (+https://whalerealm.top)';
/* 有人把 LICENSE 存成 UTF-16（记事本另存为 Unicode），直接当 UTF-8 读会变成
   「M\u0000I\u0000T」这种带 NUL 的乱码，特征词永远匹配不上。 */
function decodeBytes(buf) {
  try {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
    let nul = 0;
    const n = Math.min(buf.length, 800);
    for (let i = 0; i < n; i++) if (buf[i] === 0) nul++;
    if (nul > n * 0.2) return new TextDecoder('utf-16le').decode(buf);
    return buf.toString('utf8');
  } catch (e) {
    return buf.toString('utf8');
  }
}
async function getText(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(function () { ac.abort(); }, ms || 9000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*' } });
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: 200, text: decodeBytes(buf) };
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
async function pool(items, n, worker) {
  let i = 0, done = 0;
  const runners = [];
  for (let k = 0; k < n; k++) {
    runners.push((async function () {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx], idx);
        done++;
        if (done % 100 === 0) process.stdout.write('  ' + done + '/' + items.length + '\n');
      }
    })());
  }
  await Promise.all(runners);
}

/* ---------- 阶段 1：npm ---------- */
function repoKey(u) {
  const m = String(u || '').match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (!m) return '';
  return (m[1] + '/' + m[2].replace(/\.git$/i, '')).toLowerCase();
}
function loadNpmMap() {
  const file = fs.existsSync(SRC) ? SRC : path.resolve(REPO_ROOT, 'tmp/dshm-plugins.json');
  if (!fs.existsSync(file)) return { map: new Map(), file: '' };
  let j = null;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { map: new Map(), file: '' }; }
  const arr = Array.isArray(j) ? j : (j.plugins || []);
  const map = new Map();
  arr.forEach(function (x) {
    const k = repoKey(x && x.url);
    const npm = x && x.npm ? String(x.npm).trim() : '';
    if (k && npm && !map.has(k)) map.set(k, npm);
  });
  return { map: map, file: file };
}

async function stageNpm() {
  const src = loadNpmMap();
  console.log('[npm] 索引：' + (src.file || '（没找到索引文件）') + ' · 可用包名 ' + src.map.size);
  const rows = db.prepare("SELECT id,slug,repo FROM plugins WHERE COALESCE(license,'')='' AND COALESCE(repo,'')<>''").all()
    .filter(function (r) { return src.map.has(repoKey(r.repo)); });
  const list = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log('[npm] 待补 ' + list.length + ' 条（空许可证 + 索引里有 npm 包名）');
  const upd = db.prepare("UPDATE plugins SET license=?, updated_at=datetime('now') WHERE id=? AND COALESCE(license,'')=''");
  const stats = { hit: 0, miss: 0, empty: 0 };
  await pool(list, CONC, async function (row) {
    const pkg = String(src.map.get(repoKey(row.repo)) || '').trim();
    if (!pkg) { stats.empty++; return; }
    const url = 'https://registry.npmjs.org/' + pkg.replace('/', '%2F') + '/latest';
    const r = await getText(url, 8000);
    if (r.status !== 200) { stats.miss++; return; }
    let j = null;
    try { j = JSON.parse(r.text); } catch (e) { stats.miss++; return; }
    const lic = normLicense(j.license || j.licenses || '');
    if (!lic) { stats.empty++; return; }
    stats.hit++;
    if (!DRY) upd.run(lic, row.id);
  });
  console.log('[npm] 命中 ' + stats.hit + ' · 包不存在 ' + stats.miss + ' · 包没写许可证 ' + stats.empty);
}

/* ---------- 阶段 2：仓库 LICENSE 原文 ---------- */
function ownerRepo(repo) {
  const m = String(repo || '').match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  return { owner: m[1], name: m[2].replace(/\.git$/i, '') };
}
/* 常见命名按「根目录优先、越靠前越可能是真的」排；只抓前几个能命中的。
   LICENSE-MIT / LICENSE-APACHE 这类是双许可拆分写法，单独判。 */
const CANDIDATES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING', 'COPYING.md', 'LICENSE-MIT', 'LICENSE-APACHE'];
async function stageRaw() {
  const rows = db.prepare("SELECT id,slug,repo FROM plugins WHERE COALESCE(license,'')='' AND COALESCE(repo,'')<>''").all();
  const list = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log('[raw] 待探测 ' + list.length + ' 条');
  const upd = db.prepare("UPDATE plugins SET license=?, updated_at=datetime('now') WHERE id=? AND COALESCE(license,'')=''");
  const stats = { hit: 0, nofile: 0, unknown: 0, err: 0 };
  await pool(list, Math.max(4, Math.min(CONC, 10)), async function (row) {
    const or = ownerRepo(row.repo);
    if (!or) { stats.nofile++; return; }
    let found = '';
    let sawAny = false;
    for (const f of CANDIDATES) {
      const url = 'https://raw.githubusercontent.com/' + or.owner + '/' + or.name + '/HEAD/' + f;
      const r = await getText(url, 9000);
      if (r.status === 429) { await new Promise(function (s) { setTimeout(s, 2500); }); continue; }
      if (r.status !== 200) { if (r.status === 0) stats.err++; continue; }
      sawAny = true;
      if (r.text.length > 200 * 1024) continue;
      const lic = sniffLicense(r.text);
      if (lic) { found = lic; break; }
      /* LICENSE-MIT + LICENSE-APACHE 两个文件都在 → 双许可 */
      if (/LICENSE-MIT/i.test(f)) found = 'MIT OR Apache-2.0';
    }
    /* 有 LICENSE 文件但认不出 SPDX：不能写「未标注」——作者明明写了条款，
       只是不是标准模板（自定义商用许可、双许可说明、中文自制协议）。
       统一记成 Custom，前端显示「自定义许可」，点进去看原文。 */
    if (!found && sawAny) { found = 'Custom'; stats.custom = (stats.custom || 0) + 1; }
    if (found) { stats.hit++; if (!DRY) upd.run(found, row.id); }
    else if (sawAny) stats.unknown++;
    else stats.nofile++;
  });
  console.log('[raw] 命中 ' + stats.hit + '（其中自定义 ' + (stats.custom || 0) + '）· 没有许可证文件 ' + stats.nofile + ' · 网络错误 ' + stats.err);
}

(async function main() {
  console.log('库：' + DB_PATH + (DRY ? '（dry-run，不写库）' : ''));
  if (STAGE === 'npm' || STAGE === 'all') await stageNpm();
  if (STAGE === 'raw' || STAGE === 'all') await stageRaw();
  const left = db.prepare("SELECT count(*) n FROM plugins WHERE COALESCE(license,'')=''").get().n;
  const total = db.prepare('SELECT count(*) n FROM plugins').get().n;
  console.log('完成：仍有 ' + left + '/' + total + ' 条没有许可证（' + (100 * left / total).toFixed(1) + '%）');
  db.close();
})().catch(function (e) { console.error(e); process.exit(1); });
