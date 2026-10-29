#!/usr/bin/env node
/**
 * 鲸域 · 从 awesome-dsh-plugin.com 补录缺失插件
 *
 * 数据源：https://awesome-dsh-plugin.com/zh/catalog.json
 *   —— 这个站提供结构化 JSON（7557 条），比解析 HTML 稳定得多。
 *   —— 它也给了 robots.txt Allow: /，是公开可抓的目录站。
 *
 * 为什么不用它们的 name 字段做唯一键：
 *   实测 name 有 751 条含 `#`（monorepo 子包，如 dsh-web#packages/dsh-skill-explorer），
 *   还有 381 个 name 重复、7 条含空格。直接拿来当 slug 会污染库。
 *   真正的唯一键是 slug（owner/repo 或 owner/repo--子路径，始终干净、无 #）。
 *
 * 为什么也不用 slug 直接当鲸域的 slug：
 *   鲸域的 slug 是 npm 包名形态（如 dsh-blender-plugin），而对方的 slug 是 owner/repo。
 *   所以判重走三重：
 *     ① repo 地址是否已在库（最可靠，认领后作者会改 repo）
 *     ② 由 slug 解析出的 repo 名是否已作为 slug 存在
 *     ③ 由 slug 解析出的 pkg 名是否已作为 slug 存在
 *   任一命中即视为已有，不重复插入。
 *
 * 写入策略：
 *   status = 'pending'（而非直接 published）。
 *   理由：这是从第三方目录站抓来的元数据，没经过我们自己的合规筛查。
 *   直接 published 会把上次整批下架的高危条目（成人向、免杀、翻墙代理一类）
 *   原样重新灌回公开面 —— 那等于把合规整改当场作废。
 *   先进 pending，由后台「插件审核」页人工过一遍再上架。
 *
 * 用法：
 *   node scripts/import-awesome.mjs              # 抓取并补录
 *   node scripts/import-awesome.mjs --dry-run    # 只看会新增多少条，不写库
 *   node scripts/import-awesome.mjs --url URL    # 换数据源（自建镜像/本地文件）
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB_PATH = process.env.DB_PATH && path.isAbsolute(process.env.DB_PATH)
  ? process.env.DB_PATH
  : path.join(SERVER_DIR, 'data', 'jingyu.db');
const Database = require(path.join(SERVER_DIR, 'node_modules', 'better-sqlite3'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const urlArg = args.indexOf('--url');
const SOURCE_URL = urlArg >= 0
  ? args[urlArg + 1]
  : process.env.AWESOME_URL || 'https://awesome-dsh-plugin.com/zh/catalog.json';
/* 本地文件兜底：境内直连这个站要 60 秒以上（实测超时），
   所以生产上由境外机先落一份 JSON，境内读本地文件。 */
const LOCAL_JSON = '/var/lib/jingyu-import/awesome-catalog.json';

const CAT_MAP = {
  ui: 'UI 增强', theme: '主题与外观', session: '会话与消息', memory: '记忆',
  tool: '工具与能力', workflow: '工作流与自动化', notify: '通知与集成',
  model: '模型与账号接入', dev: '开发与运行时', skill: '技能包',
  security: '安全与权限', usage: '用量与计费', remote: '远程与移动端',
  fun: '娱乐', doc: '文档与渲染', browser: '浏览器与网页',
  integration: '通知与集成', identity: '身份与通信'
};

/** owner/repo--sub → { owner, repo, sub } */
function parseSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0].trim();
  let repo = parts.slice(1).join('/');
  let sub = '';
  if (repo.includes('--')) {
    const i = repo.indexOf('--');
    sub = repo.slice(i + 2);
    repo = repo.slice(0, i);
  }
  if (!owner || !repo) return null;
  return { owner, repo, sub };
}

/** slug → 适合做鲸域 slug 的小写包名：去掉 owner、去掉子路径、只留 repo */
function pkgOf(slug) {
  const p = parseSlug(slug);
  if (!p) return '';
  return p.repo.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function loadCatalog() {
  if (SOURCE_URL.startsWith('file:' + '//') || SOURCE_URL.startsWith('/')) {
    const p = SOURCE_URL.replace(/^file:\/\//, '');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  /* 优先用本地已落盘的副本：境内直连对方站要 60s+，每次都拉不现实。
     落盘副本由做同步的那台机器（或 cron）提前准备好，这里只读不拉。 */
  if (fs.existsSync(LOCAL_JSON)) {
    console.log('[import] 使用本地副本 ' + LOCAL_JSON);
    return JSON.parse(fs.readFileSync(LOCAL_JSON, 'utf8'));
  }
  console.log('[import] 本地无副本，尝试直连 ' + SOURCE_URL);
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'whalerealm-import' }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('抓取失败 HTTP ' + res.status);
  return res.json();
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const stmt = {
  allSlugs: db.prepare('SELECT id, slug, repo FROM plugins'),
  insert: db.prepare(`
    INSERT INTO plugins (slug, icon, grad, author_id, ver, cat, desc, stars, installs, tags, hot,
      license, repo, homepage, tier, source, claimed, mirror, freshness, why, status,
      review_note, reviewed_by, reviewed_at, created_at, updated_at)
    VALUES (?, ?, '', NULL, '', ?, ?, ?, 0, ?, 0, ?, ?, '', 'link', 'none', 0, 'off', 'none', ?, 'pending',
      '', 0, 0, ?, ?)
  `)
};

console.log('[import] 源: ' + SOURCE_URL);
const cat = await loadCatalog();
const items = Array.isArray(cat) ? cat : (cat.items || []);
console.log('[import] 源条目数: ' + items.length);

/* 建三重索引 */
const knownSlug = new Set();
const knownRepo = new Set();
for (const r of stmt.allSlugs.all()) {
  if (r.slug) knownSlug.add(r.slug.toLowerCase());
  const m = /github\.com\/([^/]+\/[^/#?]+)/i.exec(String(r.repo || ''));
  if (m) knownRepo.add(m[1].toLowerCase().replace(/\/+$/, ''));
}
console.log('[import] 库内 slug=' + knownSlug.size + '  repo=' + knownRepo.size);

const toAdd = [];
const seenSlug = new Set();
for (const it of items) {
  const slug = String(it.slug || '').trim();
  const p = parseSlug(slug);
  if (!p) continue;
  const repoFull = (p.owner + '/' + p.repo).toLowerCase();
  const pkg = pkgOf(slug);
  if (!pkg) continue;
  if (seenSlug.has(slug.toLowerCase())) continue;
  seenSlug.add(slug.toLowerCase());

  /* 三重判重 */
  if (knownRepo.has(repoFull)) continue;
  if (knownSlug.has(repoFull)) continue;
  if (knownSlug.has(pkg)) continue;

  toAdd.push({
    slug: pkg,
    cat: CAT_MAP[it.cat] || it.tag || '其他',
    desc: String(it.desc || it.short || it.name || '').slice(0, 500),
    stars: Number(it.stars) || 0,
    tags: JSON.stringify([].concat(it.tag ? [it.tag] : []).slice(0, 8)),
    license: String(it.license || ''),
    repo: 'https://github.com/' + p.owner + '/' + p.repo,
    why: ''
  });
}

console.log('[import] 待新增: ' + toAdd.length);

if (dryRun) {
  for (const x of toAdd.slice(0, 25)) console.log('  + ' + x.slug + '  [' + x.cat + ']  ' + x.repo);
  if (toAdd.length > 25) console.log('  … 其余 ' + (toAdd.length - 25) + ' 条');
  db.close();
  process.exit(0);
}

const now = Math.floor(Date.now() / 1000);
let added = 0, skipped = 0;
const tx = db.transaction((rows) => {
  for (const x of rows) {
    try {
      stmt.insert.run(x.slug, '🧩', x.cat, x.desc, x.stars, x.tags, x.license, x.repo, x.why, now, now);
      added++;
    } catch (e) {
      skipped++;
      if (skipped <= 5) console.log('  ! ' + x.slug + ' → ' + e.message.slice(0, 60));
    }
  }
});
/* 分批提交：整批一个事务会让 WAL 涨得很大，且中途失败要全回滚 */
for (let i = 0; i < toAdd.length; i += 500) {
  tx(toAdd.slice(i, i + 500));
  console.log('[import] 进度 ' + Math.min(i + 500, toAdd.length) + '/' + toAdd.length);
}

db.pragma('wal_checkpoint(TRUNCATE)');
const total = db.prepare('SELECT COUNT(*) n FROM plugins').get().n;
const pend = db.prepare("SELECT COUNT(*) n FROM plugins WHERE status='pending'").get().n;
console.log('[import] 完成：新增 ' + added + '  跳过 ' + skipped);
console.log('[import] 库内合计 ' + total + ' 条，其中待审核 ' + pend + ' 条');
db.close();