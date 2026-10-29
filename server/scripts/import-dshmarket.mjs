#!/usr/bin/env node
/* ============================================================================
   把 dshmarket.com 收录的 DSH 插件接进鲸域条目库（外链形态）
   ----------------------------------------------------------------------------
   数据源：https://awesome-dsh-plugin.com/plugins.json （dshmarket.com 的索引，
   站点页面上直接引用的就是它）。每条都带 owner / url / category / 中英描述 /
   stars / capabilities / added。

   纪律（与 import-github.mjs 一致）：
     · 只登记「条目信息 + 指向插件自己的 GitHub 仓库」，不镜像代码、不登记安装包；
     · tier='link'、source='none'、claimed=0、mirror='off'、ver=''、file_* 全空；
     · 幂等：按 slug upsert，且只更新 claimed=0 AND tier='link' 的行 ——
       作者认领之后这里不会再把手改回去；
     · 已经手工收录过的仓库（repo 相同）直接跳过，不产生重复条目。

   用法：
     node scripts/import-dshmarket.mjs                # 联网拉索引 → 写库
     node scripts/import-dshmarket.mjs --dry          # 只看会写多少
     node scripts/import-dshmarket.mjs --file x.json  # 用本地快照
     node scripts/import-dshmarket.mjs --min-stars 10 # 只要 10 星以上
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jingyu.db');
const SOURCE_URL = process.env.DSHMARKET_URL || 'https://awesome-dsh-plugin.com/plugins.json';
const CACHE = path.join(__dirname, 'cache', 'dshmarket.json');

const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const MIN_STARS = Number(argOf('--min-stars') || 0);
const FILE = argOf('--file');

/* dshmarket 的 23 个分类与鲸域的 23 个分类正好一一对应；图标与配色沿用站内
   github-index.json 里已有的那套，同一类在两个来源里长得一样。 */
const CAT = {
  agi: ['AGI 架构探索', '🧬', 'linear-gradient(135deg,#38bdf8,#6366f1)'],
  ui: ['UI 增强', '📚', 'linear-gradient(135deg,#7be0c9,#3fa9f5)'],
  usage: ['用量与计费', '🐋', 'linear-gradient(135deg,#ffd36c,#ff8a3d)'],
  theme: ['主题与外观', '🪟', 'linear-gradient(135deg,#9be15d,#00c3a5)'],
  model: ['模型与账号接入', '🆓', 'linear-gradient(135deg,#6c9bff,#4f6bff)'],
  identity: ['身份与通信', '🪪', 'linear-gradient(135deg,#7dd3fc,#0ea5e9)'],
  session: ['会话与消息', '📊', 'linear-gradient(135deg,#8f7bff,#5b6cff)'],
  memory: ['记忆', '🧠', 'linear-gradient(135deg,#a3c4ff,#6f8dff)'],
  tools: ['工具与能力', '⚙️', 'linear-gradient(135deg,#f7c948,#f58c3a)'],
  wsl: ['WSL 与 Windows 互操作', '🪟', 'linear-gradient(135deg,#93c5fd,#3b82f6)'],
  browser: ['浏览器与网页', '🔎', 'linear-gradient(135deg,#74e0ff,#3b82f6)'],
  vision: ['视觉与多模态', '👁️', 'linear-gradient(135deg,#ff9a6c,#ff5f8f)'],
  voice: ['语音与音频', '🔊', 'linear-gradient(135deg,#c3a0ff,#7a5bff)'],
  docs: ['文档与渲染', '📄', 'linear-gradient(135deg,#ffc46b,#ff8f4d)'],
  skill: ['技能包', '🧩', 'linear-gradient(135deg,#a7f3d0,#10b981)'],
  workflow: ['工作流与自动化', '👥', 'linear-gradient(135deg,#5ee7a0,#2fb37a)'],
  git: ['Git 与代码评审', '🔀', 'linear-gradient(135deg,#b8c6db,#7b8aa3)'],
  notify: ['通知与集成', '🤖', 'linear-gradient(135deg,#5fd0ff,#2f8bff)'],
  dev: ['开发与运行时', '🧪', 'linear-gradient(135deg,#9aa7ff,#6c7bff)'],
  security: ['安全与权限', '🛡️', 'linear-gradient(135deg,#ff9f6b,#ff5b5b)'],
  remote: ['远程与移动端', '🌉', 'linear-gradient(135deg,#8ee6ff,#3aa0ff)'],
  market: ['插件市场与管理', '🏪', 'linear-gradient(135deg,#ffd166,#ef8354)'],
  fun: ['娱乐', '🐾', 'linear-gradient(135deg,#ff8fd0,#a86bff)']
};
const FALLBACK = CAT.tools;

const WHY = '条目来自 dshmarket.com 索引，作者还没来鲸域认领：这里只挂 GitHub 外链，安装包、版本与许可证以作者仓库为准。';

/* 描述统一压成一行，超长在词/句边界截断并补省略号（和 import-github 同一口径） */
function normalizeDesc(input) {
  let s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= 197) return s;
  const cut = s.slice(0, 197);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('、'), cut.lastIndexOf('—'));
  return (at > 120 ? cut.slice(0, at) : cut).replace(/[\s,，、;；:：—-]+$/, '') + '…';
}

function repoOf(url) {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/i.exec(String(url || ''));
  if (!m) return null;
  return { owner: m[1], name: m[2].replace(/\.git$/i, ''), url: 'https://github.com/' + m[1] + '/' + m[2].replace(/\.git$/i, '') };
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

async function loadSource() {
  if (FILE) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  try {
    const res = await fetch(SOURCE_URL, { headers: { 'user-agent': 'whalerealm-import/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(json));
    console.log('已拉取索引并缓存：' + CACHE);
    return json;
  } catch (err) {
    if (fs.existsSync(CACHE)) {
      console.warn('联网失败（' + err.message + '），改用本地缓存：' + CACHE);
      return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    }
    throw err;
  }
}

(async () => {
  const raw = await loadSource();
  const list = Array.isArray(raw) ? raw : (raw.plugins || []);
  console.log('索引条目：' + list.length + ' 条（' + (raw.updated || '?') + '）');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  /* 占位作者：鲸域索引（和 import-github 用同一个账号） */
  const INDEX_EMAIL = 'index@whalerealm.top';
  let indexUser = db.prepare('SELECT id, name FROM users WHERE email = ?').get(INDEX_EMAIL);
  if (!indexUser) {
    if (DRY) { indexUser = { id: null, name: '鲸域索引' }; }
    else {
      const now = Math.floor(Date.now() / 1000);
      const info = db.prepare("INSERT INTO users (email, password_hash, name, emoji, sig, created_at) VALUES (?, '', ?, '🐋', ?, ?)")
        .run(INDEX_EMAIL, '鲸域索引', '把 GitHub 上的 DSH 插件整理成条目，等作者本人来认领。', now);
      indexUser = { id: info.lastInsertRowid, name: '鲸域索引' };
      console.log('已创建占位作者：鲸域索引 (id=' + indexUser.id + ')');
    }
  }

  /* 已有条目：按仓库 URL 去重（手工收录过的、作者认领过的都不动） */
  const existingRepos = new Set(
    db.prepare("SELECT repo FROM plugins WHERE repo IS NOT NULL AND repo <> ''").all()
      .map((r) => String(r.repo).toLowerCase().replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/+$/, ''))
  );
  const takenSlugs = new Set(db.prepare('SELECT slug FROM plugins').all().map((r) => r.slug));
  const findSlug = db.prepare('SELECT id, claimed, tier FROM plugins WHERE slug = ?');

  const ins = db.prepare(`INSERT INTO plugins
    (slug,icon,grad,author_id,ver,cat,desc,stars,installs,tags,hot,license,repo,homepage,
     tier,source,claimed,mirror,freshness,why,collected_at,synced_at,created_at,updated_at)
    VALUES (?,?,?,?,'',?,?,?,0,?,?,?,?,?,'link','none',0,'off','none',?,?,?,?,?)`);

  const now = Math.floor(Date.now() / 1000);
  const seenRepo = new Set();
  let created = 0, skippedRepo = 0, skippedStars = 0, badUrl = 0;
  const byCat = {};

  const tx = db.transaction(() => {
    for (const it of list) {
      const rp = repoOf(it.url);
      if (!rp) { badUrl++; continue; }
      const key = rp.owner.toLowerCase() + '/' + rp.name.toLowerCase();
      if (existingRepos.has(key) || seenRepo.has(key)) { skippedRepo++; continue; }
      if ((it.stars || 0) < MIN_STARS) { skippedStars++; continue; }
      const [cat, icon, grad] = CAT[it.category] || FALLBACK;
      const desc = normalizeDesc((it.description && (it.description.zh || it.description.en)) || '');
      /* slug：仓库名优先；撞名再加 owner 前缀；还撞就加序号 */
      let base = slugify(rp.name) || 'plugin';
      if (!/^[a-z0-9]/.test(base)) base = 'p-' + base;
      let slug = base;
      if (takenSlugs.has(slug) || findSlug.get(slug)) slug = slugify(rp.owner + '-' + rp.name);
      let n = 2;
      while (takenSlugs.has(slug) || findSlug.get(slug)) slug = base + '-' + (n++);
      takenSlugs.add(slug); seenRepo.add(key);
      const tags = JSON.stringify((it.capabilities || []).slice(0, 6));
      const hot = (it.stars || 0) >= 500 ? 1 : 0;
      if (!DRY) {
        ins.run(slug, icon, grad, indexUser.id, cat, desc, it.stars || 0, tags, hot, '', rp.url, '', WHY, now, now, now, now);
      }
      created++;
      byCat[cat] = (byCat[cat] || 0) + 1;
    }
  });
  tx();

  const total = db.prepare('SELECT COUNT(*) AS n FROM plugins').get().n;
  const links = db.prepare("SELECT COUNT(*) AS n FROM plugins WHERE tier='link' AND claimed=0").get().n;
  console.log((DRY ? '（dry-run，未写库）' : '') + '新增 ' + created + ' · 跳过（仓库已在库里）' + skippedRepo +
    (MIN_STARS ? ' · 低于 ' + MIN_STARS + ' 星 ' + skippedStars : '') + (badUrl ? ' · 非 GitHub ' + badUrl : ''));
  console.log('  分类分布：' + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('  库内合计 ' + total + ' 条：未认领外链 ' + links + ' 条');
  db.close();
})().catch((err) => { console.error('导入失败：' + err.message); process.exit(1); });
