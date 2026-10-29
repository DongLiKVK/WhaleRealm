#!/usr/bin/env node
/**
 * 鲸域 · README 缓存续期（warm）
 *
 * 为什么需要它：plugin_readmes 的 TTL 是 7 天。6716 条是同一批抓的，
 * 所以会在同一时刻集体过期 —— 那天所有条目页都会退回到「现抓」，
 * 配额瞬间打满，等于把缓存白建了。
 *
 * 做法：每次只续一小批（默认 40 条），挑「最久没抓」的优先。
 * 定时器每 30 分钟跑一次 → 一天 48 次 × 40 条 = 1920 条/天，
 * 全量 6716 条约 3.5 天一轮，正好在 7 天 TTL 到期前全部刷新一遍。
 *
 * 配额账：无 Token 60 次/小时，每 30 分钟 40 条 × 约 2 次/条（README+许可证）
 * = 80 次/半小时 —— 超了。所以无 Token 时自动降到 10 条/次（20 次/半小时）。
 * 配了 GITHUB_TOKEN 就按 40 条跑。
 *
 * 用法：
 *   node scripts/warm-readmes.js            # 跑一批
 *   node scripts/warm-readmes.js --limit 80 # 自定义批量
 *   node scripts/warm-readmes.js --dry-run  # 只列出会抓哪些
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(SERVER_DIR, 'data', 'jingyu.db');

const Database = require(path.join(SERVER_DIR, 'node_modules', 'better-sqlite3'));
const { fetchReadmes } = require(path.join(SERVER_DIR, 'src', 'readme-fetch.js'));

const TTL = 7 * 86400;
const args = process.argv.slice(2);
const hasToken = !!(process.env.GITHUB_TOKEN || process.env.CLAIM_GITHUB_TOKEN);
const DEFAULT_LIMIT = hasToken ? 40 : 10;
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) || DEFAULT_LIMIT : DEFAULT_LIMIT;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const now = Math.floor(Date.now() / 1000);

/* 续期阈值为什么是 TTL 的一半而不是接近 TTL：
   这批 6716 条是同一时间抓的，age 几乎一致（实测 3.5–3.7 天）。
   若等快到 7 天才开始续，那 3 天里要干完 6716 条，
   而无 Token 一次只能跑 10 条 × 48 次/天 = 480 条/天，根本追不上。
   设成 3.5 天（TTL 的 50%）意味着「一半寿命用完就开始轮转」，
   每条约 3.5 天被刷一次，永远走不到 7 天过期。 */
const RENEW_AFTER = Math.floor(TTL * 0.5);

/* 挑「最久没抓」的：既有缓存但快过期的排最前，其次是从来没抓过的。
   这样一轮下来既救了快过期的，也补齐了缺的。 */
const rows = db.prepare(`
  SELECT p.id, p.slug, p.repo, r.fetched_at
  FROM plugins p
  LEFT JOIN plugin_readmes r ON r.plugin_id = p.id
  WHERE p.status = 'published'
    AND p.repo <> ''
    AND (r.plugin_id IS NULL OR (? - r.fetched_at) > ?)
  ORDER BY COALESCE(r.fetched_at, 0) ASC
  LIMIT ?
`).all(now, RENEW_AFTER, LIMIT);

console.log('[warm] 待续期 ' + rows.length + ' 条（limit=' + LIMIT + '，token=' + (hasToken ? 'on' : 'off') + '）');
if (dryRun) {
  for (const r of rows) console.log('  #' + r.id + ' ' + r.slug);
  process.exit(0);
}

const save = db.prepare(`
  INSERT INTO plugin_readmes (plugin_id, repo, path, url, status, code, message, body, bytes, truncated, doc_count, kinds, fetched_at)
  VALUES (?, ?, ?, ?, 'ok', '', '', ?, ?, ?, ?, ?, ?)
  ON CONFLICT(plugin_id) DO UPDATE SET
    repo=excluded.repo, path=excluded.path, url=excluded.url, status='ok',
    body=excluded.body, bytes=excluded.bytes, truncated=excluded.truncated,
    doc_count=excluded.doc_count, kinds=excluded.kinds, fetched_at=excluded.fetched_at
`);
const delDocs = db.prepare('DELETE FROM plugin_readme_docs WHERE plugin_id = ?');
/* 列名是 body 不是 markdown —— 别按 readme-fetch 返回对象的字段名去猜表结构。
   实际表结构（PRAGMA table_info 确认）：
     plugin_readme_docs(plugin_id, path, label, lang, body, bytes, truncated, fetched_at, kind) */
const insDoc = db.prepare(`
  INSERT INTO plugin_readme_docs (plugin_id, path, kind, label, lang, body, bytes, truncated, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let ok = 0, fail = 0;

/* 为什么要包 async IIFE：脚本是 .cjs（CommonJS），而 await 只能出现在 async 函数里。
   直接写在顶层会被 Node 报 SyntaxError: await is only valid in async functions。 */
(async () => {
for (const r of rows) {
  try {
    const res = await fetchReadmes({ repo: r.repo });
    if (res.ok) {
      const primary = res.primary || res.docs[0] || {};
      const ts = Math.floor(Date.now() / 1000);
      const tx = db.transaction(() => {
        save.run(r.id, r.repo, primary.path || '', primary.url || '',
          primary.markdown || '', primary.bytes || 0, primary.truncated ? 1 : 0,
          (res.docs || []).filter(d => d.kind === 'readme').length,
          (res.kinds || []).join(','), ts);
        delDocs.run(r.id);
        for (const d of res.docs || []) {
          insDoc.run(r.id, d.path || '', d.kind || 'readme', d.label || '', d.lang || '',
            d.markdown || '', d.bytes || 0, d.truncated ? 1 : 0, ts);
        }
      });
      tx();
      ok++;
    } else {
      fail++;
      console.log('  #' + r.id + ' ' + r.slug + ' → ' + (res.code || 'unknown'));
      if (res.code === 'RATE_LIMITED') { console.log('[warm] 配额耗尽，本轮提前结束'); break; }
    }
  } catch (e) {
    fail++;
    console.log('  #' + r.id + ' ' + r.slug + ' → ERR ' + e.message);
  }
}

db.pragma('wal_checkpoint(TRUNCATE)');
console.log('[warm] 完成：成功 ' + ok + '  失败 ' + fail);
db.close();
})().catch((e) => { console.error('[warm] 失败：' + e.message); process.exit(1); });