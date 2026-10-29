#!/usr/bin/env node
/**
 * 鲸域 · GitHub 外链条目导入（幂等）
 *
 * 把 server/scripts/github-index.json 里的 DSH 生态项目写进 plugins 表，
 * 一律按「外链条目」处理：
 *   tier = 'link'    —— 本站不存包，只挂 GitHub 外链
 *   source = 'none'  —— 没有作者上传的包
 *   claimed = 0      —— 等作者本人来认领
 *   mirror = 'off'   —— 不镜像、不分发
 *   why              —— 条目页写明「还没认领，包去作者仓库拿」
 *
 * 幂等规则：
 *   · 按 slug（= 仓库名小写）upsert，重复执行只更新元数据，不会产生重复条目；
 *   · 只更新 claimed = 0 的条目 —— 作者认领过之后，版本 / 分类 / 描述以作者与运营为准，
 *     脚本不许再覆盖；
 *   · 占位作者「鲸域索引」只建一次（按邮箱查），所有外链条目挂在它名下。
 *
 * 用法：
 *   node scripts/import-github.mjs            # 写库
 *   node scripts/import-github.mjs --dry      # 只看会改什么，不落库
 *   DB_PATH=../tmp/test-fix.db node scripts/import-github.mjs
 */
/* 描述是给人看的：截断必须落在词/句边界上并留省略号，
   否则页面上会出现 "no login, no sign-up, no API key — t" 这种半截话。 */
function normalizeDesc(input) {
  let s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= 197) return s;
  const cut = s.slice(0, 197);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('、'), cut.lastIndexOf('—'));
  return (at > 120 ? cut.slice(0, at) : cut).replace(/[\s,，、;；:：—-]+$/, '') + '…';
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'jingyu.db');

const dataFile = path.join(__dirname, 'github-index.json');
const { items, source } = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const INDEX_EMAIL = 'index@whalerealm.top';
const INDEX_NAME = '鲸域索引';
const WHY = '作者还没来鲸域认领：这里只挂 GitHub 外链，安装包、版本与许可证以作者仓库为准。';

if (!fs.existsSync(dbPath)) {
  console.error('数据库不存在：' + dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
const now = Math.floor(Date.now() / 1000);

/* ---------- 1. 占位作者 ---------- */
let indexUser = db.prepare('SELECT id, name FROM users WHERE email = ?').get(INDEX_EMAIL);
if (!indexUser) {
  if (!dry) {
    const info = db.prepare(`INSERT INTO users (email,password_hash,name,emoji,grad,level,badge,sig,city,fans,follows,visits,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      INDEX_EMAIL, '', INDEX_NAME, '🐋', 'linear-gradient(135deg,#7be0c9,#3fa9f5)', 1, '',
      '把 GitHub 上的 DSH 插件整理成条目，等作者本人来认领。', '', 0, 0, 0, now, now
    );
    indexUser = { id: info.lastInsertRowid, name: INDEX_NAME };
  } else {
    indexUser = { id: null, name: INDEX_NAME };
  }
  console.log('创建占位作者：' + INDEX_NAME + '（' + INDEX_EMAIL + '）');
} else {
  console.log('占位作者已存在：' + indexUser.name + ' (id=' + indexUser.id + ')');
}

/* ---------- 2. 条目 upsert ---------- */
const findSlug = db.prepare('SELECT id, claimed, tier, author_id FROM plugins WHERE slug = ?');
const ins = db.prepare(`INSERT INTO plugins
  (slug,icon,grad,author_id,ver,cat,desc,stars,installs,tags,hot,license,repo,homepage,
   tier,source,claimed,mirror,freshness,why,collected_at,synced_at,created_at,updated_at)
  VALUES (?,?,?,?,'',?,?,?,0,?,?,?,?,?,'link','none',0,'off','none',?,?,?,?,?)`);
const upd = db.prepare(`UPDATE plugins SET
  icon=?, grad=?, cat=?, desc=?, stars=?, license=?, repo=?, homepage=?, tags=?, hot=?, why=?, updated_at=?
  WHERE slug=? AND claimed=0 AND tier='link'`);

let created = 0, updated = 0, skipped = 0;
const tx = db.transaction(() => {
  for (const it of items) {
    const row = findSlug.get(it.slug);
    const tags = JSON.stringify(it.tags || []);
    if (!row) {
      if (!dry) {
        ins.run(it.slug, it.icon, it.grad, indexUser.id, it.cat, normalizeDesc(it.desc), it.stars, tags, it.hot,
          it.license, it.repo, it.homepage || '', WHY, now, now, now, now);
      }
      created++;
    } else if (row.claimed === 0 && row.tier === 'link') {
      if (!dry) {
        upd.run(it.icon, it.grad, it.cat, normalizeDesc(it.desc), it.stars, it.license, it.repo, it.homepage || '',
          tags, it.hot, WHY, now, it.slug);
      }
      updated++;
    } else {
      skipped++;
    }
  }
});
tx();

const total = db.prepare('SELECT COUNT(*) AS n FROM plugins').get().n;
const links = db.prepare("SELECT COUNT(*) AS n FROM plugins WHERE tier='link' AND claimed=0").get().n;
const claimed = db.prepare('SELECT COUNT(*) AS n FROM plugins WHERE claimed=1').get().n;

console.log((dry ? '[dry-run] ' : '') + '外链条目导入完成（来源：' + source + '）');
console.log('  新增 ' + created + ' · 更新 ' + updated + ' · 跳过（已认领或非外链）' + skipped);
console.log('  库内合计 ' + total + ' 条：未认领外链 ' + links + ' · 已认领 ' + claimed);
db.close();
