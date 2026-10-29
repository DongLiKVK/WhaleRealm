'use strict';
/**
 * 鲸域 · 安装命令索引（读 awesome-dsh-plugin.com 的 catalog.json）
 *
 * 为什么需要这个模块：条目页那颗「安装命令」胶囊原先按仓库名猜 `npm i <slug>`。
 * 猜错的代价由读者承担，而且不是小事 ——
 *   · api-relay-audit 的真实包名是 dsh-api-relay-audit；
 *   · dsh-market 的真实包名是 dshmarket；
 *   · pearjelly/deep-blend--packages-deepblend-bundle 的真实包名是 @deepblend/dsh-blender-bundle。
 * 这些从 slug 一律推不出来，粘进终端就是 404。awesome-dsh-plugin.com 的目录里每条都带
 * 抓过 npm 元数据后写下的 cmd（形如 `dsh plugin --profile web add <包名>`），
 * 包名就在最后一个 token 上，比我们从仓库名推断准得多。所以这里认它为准。
 *
 * 为什么不在这里联网：境内直连那个站实测要 60 秒以上（import-awesome.mjs 里同一个结论），
 * 让每个条目页请求去等它是不可能的。生产上由境外机定时把 catalog.json 落到
 * /var/lib/jingyu-import/awesome-catalog.json，这里只读本地文件。
 * 文件缺失、被截断、JSON 坏了 —— 一律降级成空索引：页面退回「按仓库名推断」的老行为，
 * 绝不因为一颗锦上添花的按钮把条目页打成 500。
 *
 * 键怎么取：catalog 的 slug 是 owner/repo（大小写不定），name 是包名（751 条带 `#` 子包形态），
 * short 是展示名。三种键全进 map、统一小写；查的时候按 repo → slug → pkg → name 依次试。
 */

const fs = require('node:fs');
const path = require('node:path');

/* 候选文件，按顺序试。AWESOME_CATALOG_FILE 供本地开发指向仓库里的副本。 */
const CANDIDATES = [
  process.env.AWESOME_CATALOG_FILE,
  '/var/lib/jingyu-import/awesome-catalog.json',
  path.join(__dirname, '..', 'data', 'awesome-catalog.json')
].filter(Boolean);

/* 索引缓存 10 分钟：文件由外部定时任务重写，重写频率远低于这个值，
   而一次重新解析 4.2MB JSON 要几十毫秒 —— 不值得每个请求都做。 */
const TTL = 10 * 60 * 1000;

let index = null;      // Map<string, {cmd, pkg, dl, npm, slug, name}>
let builtAt = 0;
let building = null;
let lastError = '';

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

/** GitHub 地址 → owner/repo 小写键；非 GitHub 地址返回空串 */
function repoKey(repo) {
  const m = /github\.com[/:]([^/]+)\/([^/#?\s]+)/i.exec(String(repo == null ? '' : repo));
  if (!m) return '';
  return norm(m[1] + '/' + m[2].replace(/\.git$/i, ''));
}

/** 从 cmd 里取包名：`dsh plugin --profile web add 包名` 的最后一个 token */
function pkgOf(cmd) {
  const m = /\badd\s+(.+)$/.exec(String(cmd == null ? '' : cmd).trim());
  return (m ? m[1] : '').trim();
}

function build(raw) {
  const data = JSON.parse(raw);
  const items = Array.isArray(data) ? data : (data && data.items) || [];
  const map = new Map();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const pkg = pkgOf(it.cmd);
    if (!pkg) continue;
    const rec = {
      cmd: String(it.cmd).trim(),
      pkg,
      dl: Number(it.dl) || 0,
      npm: it.npm ? 1 : 0,
      slug: String(it.slug || ''),
      name: String(it.name || '')
    };
    /* 三种键都指向同一条记录；先到先得，别让后面的同名字段覆盖先匹配上的。 */
    for (const k of [it.slug, it.name, it.short]) {
      const key = norm(k);
      if (key && !map.has(key)) map.set(key, rec);
    }
  }
  return map;
}

/** 异步装载：并发调用共享同一个 Promise，避免启动瞬间重复解析 4.2MB */
function load() {
  if (building) return building;
  building = (async () => {
    for (const file of CANDIDATES) {
      try {
        const raw = await fs.promises.readFile(file, 'utf8');
        const map = build(raw);
        if (!map.size) throw new Error('目录里没有可用的 cmd 字段');
        index = map;
        builtAt = Date.now();
        lastError = '';
        return map;
      } catch (err) {
        lastError = file + ': ' + err.message;
      }
    }
    /* 全部失败：保留旧索引（如果有），没有就空表 —— 前端会退回推断文案 */
    if (!index) {
      index = new Map();
      builtAt = Date.now();
    }
    return index;
  })().finally(() => { building = null; });
  return building;
}

/**
 * 查一条插件的安装命令。同步返回，未装载时先返回 null 并在后台装载
 * （首个请求会漏一次，之后都有；条目页不能为了这个字段阻塞）。
 */
function installOf(p) {
  if (!p) return null;
  if (!index || Date.now() - builtAt > TTL) load().catch(() => {});
  if (!index || !index.size) return null;
  const keys = [repoKey(p.repo), norm(p.slug), norm(p.pkg), norm(p.name)];
  for (const key of keys) {
    if (!key) continue;
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

/** 启动预热 + 状态自检（/healthz 之类要看时用） */
function warm() {
  return load().catch(() => null);
}

function stats() {
  return {
    ready: !!(index && index.size),
    keys: index ? index.size : 0,
    ageMs: builtAt ? Date.now() - builtAt : 0,
    files: CANDIDATES,
    error: lastError
  };
}

module.exports = { installOf, warm, stats, repoKey, pkgOf };
