#!/usr/bin/env node
/**
 * 鲸域 · 条目 npm 包名核对
 *
 * 干什么：把 plugins.slug 逐个拿去问 npm registry「这个包到底存不存在、最新版本是多少」，
 *         结果写进 plugin_npm 表。条目页的 npm 下载胶囊只对 exists=1 的包渲染。
 *
 * 为什么需要这一步：6716 条索引里的 slug 是按仓库名/包名整理的，实测取样 31 条里
 *         18 条在 registry 上存在、13 条 404（作者没发 npm、改了名，或者只有 GitHub）。
 *         直接拼 https://www.npmjs.com/package/<slug> 会有四成死链，
 *         而「点开 404」比「没有这颗按钮」更伤信任。
 *
 * 用法：
 *   node scripts/check-npm.js                     # 全量核对（跳过 7 天内查过的）
 *   node scripts/check-npm.js --force             # 全量强制重查
 *   node scripts/check-npm.js --ids=1,2,3         # 只查指定条目
 *   node scripts/check-npm.js --limit=200         # 只查前 200 条（试跑）
 *   node scripts/check-npm.js --dry-run           # 只打印，不写库
 *
 * 参数：--concurrency=24  --timeout=8000  --stale-days=7  --log-every=200  --registry=<url>
 *
 * registry 顺序：npmmirror（国内快）→ registry.npmjs.org（兜底）。
 * 两个都超时/429 的条目**不写库**：写 0 等于把「网络抖了」记成「包不存在」，
 * 下次运行会重试。只有拿到明确的 404 才写 exists=0。
 */
'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
function flag(name, def) {
  const hit = args.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  if (eq < 0) return true;
  return hit.slice(eq + 1);
}

const CONCURRENCY = Math.max(1, Number(flag('concurrency', 24)) || 24);
const TIMEOUT = Math.max(1000, Number(flag('timeout', 8000)) || 8000);
const STALE_DAYS = Number(flag('stale-days', 7));
const LOG_EVERY = Math.max(1, Number(flag('log-every', 200)) || 200);
const LIMIT = Number(flag('limit', 0)) || 0;
const FORCE = !!flag('force', false);
const DRY = !!flag('dry-run', false);
const IDS = String(flag('ids', '') || '').split(',').map((s) => Number(s.trim())).filter(Boolean);

const REGISTRIES = flag('registry', '')
  ? [String(flag('registry', ''))]
  : ['https://registry.npmmirror.com/', 'https://registry.npmjs.org/'];

const DB_PATH = process.env.JINGYU_DB || path.join(__dirname, '..', 'data', 'jingyu.db');
const db = new Database(DB_PATH);

/* 表由 src/schema.sql 建；这里再兜一次，方便单独在裸库上跑 */
db.exec(`CREATE TABLE IF NOT EXISTS plugin_npm (
  slug       TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  version    TEXT    NOT NULL DEFAULT '',
  found      INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0
)`);

const now = () => Math.floor(Date.now() / 1000);

/* ---------- 选条目 ---------- */
let rows;
if (IDS.length) {
  const ph = IDS.map(() => '?').join(',');
  rows = db.prepare(`SELECT id, slug FROM plugins WHERE id IN (${ph}) ORDER BY id`).all(...IDS);
} else {
  rows = db.prepare('SELECT id, slug FROM plugins ORDER BY id').all();
}

const checkedAt = new Map(
  db.prepare('SELECT slug, checked_at FROM plugin_npm').all().map((r) => [r.slug, r.checked_at])
);
const cutoff = now() - STALE_DAYS * 86400;
if (!FORCE) rows = rows.filter((r) => (checkedAt.get(r.slug) || 0) < cutoff);
if (LIMIT) rows = rows.slice(0, LIMIT);

if (!rows.length) {
  console.log('没有需要核对的条目（都在 ' + STALE_DAYS + ' 天内查过；要重查加 --force）');
  process.exit(0);
}

/* ---------- 单个包 ---------- */
async function probe(slug) {
  const url = (base) => base + encodeURIComponent(slug).replace(/^%40/, '@');
  let sawNotFound = false;
  let lastErr = '';
  for (const base of REGISTRIES) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const res = await fetch(url(base), {
        signal: ac.signal,
        headers: {
          /* abbreviated：registry 的「安装用」精简元数据，比完整 doc 小一个数量级 */
          accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8',
          'user-agent': 'jingyu-npm-check/1.0 (+https://whalerealm.top)'
        }
      });
      if (res.status === 404) {
        sawNotFound = true;
        lastErr = 'HTTP 404';
        continue; /* 换个 registry 复核，避免镜像同步延迟造成假阴性 */
      }
      if (!res.ok) {
        lastErr = 'HTTP ' + res.status;
        continue;
      }
      const doc = await res.json();
      const tags = (doc && doc['dist-tags']) || {};
      return { exists: 1, name: doc.name || slug, version: String(tags.latest || '') };
    } catch (e) {
      lastErr = e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e);
    } finally {
      clearTimeout(timer);
    }
  }
  /* 只有「所有 registry 都明确 404」才算不存在；有网络错误就当作未知，不写库 */
  if (sawNotFound && lastErr === 'HTTP 404') return { exists: 0, name: slug, version: '' };
  return null;
}

/* ---------- 并发池 ---------- */
const upsert = db.prepare(`INSERT INTO plugin_npm (slug, name, version, found, checked_at)
  VALUES (@slug, @name, @version, @found, @checked_at)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    version = excluded.version,
    found = excluded.found,
    checked_at = excluded.checked_at`);

const tally = { yes: 0, no: 0, unknown: 0, failed: 0 };
const started = Date.now();
let done = 0;
let cursor = 0;

async function worker() {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    let out = null;
    try {
      out = await probe(row.slug);
    } catch (e) {
      out = null;
    }
    done++;
    if (!out) {
      tally.unknown++;
    } else {
      if (out.exists) tally.yes++;
      else tally.no++;
      if (!DRY) {
        try {
          upsert.run({ slug: row.slug, name: out.name, version: out.version, found: out.exists, checked_at: now() });
        } catch (e) {
          tally.failed++;
        }
      }
    }
    if (done % LOG_EVERY === 0 || done === rows.length) {
      const sec = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `[${done}/${rows.length}] 存在 ${tally.yes} · 不存在 ${tally.no} · 未知 ${tally.unknown} · 写库失败 ${tally.failed} · ${sec}s`
      );
    }
  }
}

(async () => {
  console.log(
    `核对 ${rows.length} 条 · 并发 ${CONCURRENCY} · registry ${REGISTRIES.join(' → ')}` + (DRY ? ' · dry-run' : '')
  );
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  const total = db.prepare('SELECT COUNT(*) c FROM plugin_npm WHERE found = 1').get().c;
  console.log(`完成：存在 ${tally.yes} · 不存在 ${tally.no} · 未知(未写库) ${tally.unknown} · 库内 found=1 共 ${total} 条`);
  db.close();
})();