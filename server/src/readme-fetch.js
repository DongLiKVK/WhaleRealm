'use strict';
/**
 * 读作者仓库里的说明文档：README（可能有多份）+ 许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则。
 *
 * 为什么要单独一个模块：条目页要把「这个插件到底怎么用、能不能放心用」讲清楚，而 6716 条
 * 索引数据里只有一句 description。真正的说明在作者仓库里。这些正文不能在前端直接去
 * raw.githubusercontent.com 拉：
 *   · 浏览器直连 GitHub 在国内常被墙，条目页会一直转圈；
 *   · 每个访客各拉一次，等于把 6700 个仓库当 CDN 用，也没法缓存；
 *   · 这些正文都是不可信外部内容，必须由服务端取、落库、限长，前端只负责转义渲染。
 *
 * 为什么要「多份 README」：中文/英文双 README 在插件仓库里非常常见
 * （README.md + README.zh-CN.md、README.md + docs/README_CN.md），只取一份等于
 * 把另一半读者挡在外面。发现顺序：
 *   ① GitHub Trees 接口列一次目录（1 次请求就能拿到全部路径，含 docs/ 下的本地化版本，
 *      顺带把 LICENSE / SECURITY.md / CONTRIBUTING.md / CHANGELOG.md 一起找出来）；
 *   ② Trees 不可用（403/429/网络）时退回候选文件名探测 —— 没有 API 限流，只覆盖根目录常见写法。
 * 抓取仍然走 raw.githubusercontent.com（无 API 限流）。
 *
 * 两个地址都能用环境变量覆盖（CLAIM_RAW_BASE / CLAIM_API_BASE 沿用认领校验那套配置），
 * 自建加速或本地 fixtures 都能接。设置 GITHUB_TOKEN 可把 Trees 的限额从 60 次/小时提到 5000。
 */

const { parseRepo } = require('./claim-verify');

/* Trees 不可用时的兜底候选：只覆盖根目录最常见的写法，按命中率排序。 */
const README_FILES = [
  'README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.markdown', 'README.rst', 'README.txt', 'README',
  'README.zh-CN.md', 'README_zh.md', 'README.zh.md', 'README-zh.md', 'README_CN.md',
  'README.en.md', 'README_EN.md'
];

/* 单份正文上限 320KB：最大的几个 README 也就 100KB 上下，再大基本是塞了 base64 图片。
   超了截断并标记 truncated，页面提示「去仓库看全文」，不把整页撑爆。 */
const MAX_BYTES = 320 * 1024;

/* 一个条目最多给几份 README、合计多大：8 份 × 320KB 会变成 2.5MB 的 JSON，
   条目页首屏等不起。多语言 README 一般 2~3 份，6 份/800KB 已经覆盖绝大多数仓库。 */
const MAX_DOCS = 6;
const TOTAL_BUDGET = 800 * 1024;

/* 附带的规范类文档：许可证、安全策略、贡献指南、更新日志、行为准则。
   每种最多一份（同一仓库里 LICENSE 与 LICENSE-MIT 同时存在时只取排序靠前的那份），
   合计预算 400KB —— GPL 全文也就 35KB，足够。 */
const MAX_META = 5;
const META_BUDGET = 400 * 1024;

/* 只认这些目录层级：根目录，以及一层子目录（docs/README.zh-CN.md）。
   更深的 README 基本是示例/子包文档，跟「这个插件怎么用」无关。 */
const MAX_DEPTH = 2;

/* 明显不是「项目说明」的目录，直接跳过 */
const SKIP_DIRS = /^(node_modules|vendor|third_party|third-party|examples?|samples?|tests?|__tests__|fixtures?|dist|build|coverage|\.github\/ISSUE_TEMPLATE)\.?\//i;

const README_NAME = /^readme(?:[._-][^/]*)?\.(md|markdown|rst|txt|adoc|org)$/i;

/* 规范类文档的文件名规则（去掉扩展名后的 stem 参与匹配）。顺序即标签顺序。 */
const META_KINDS = [
  { kind: 'license',      label: '许可证',   test: /^(licen[cs]e|copying)([._-][^/]*)?$/i },
  { kind: 'security',     label: '安全',     test: /^security([._-][^/]*)?$/i },
  { kind: 'contributing', label: '贡献指南', test: /^contributing([._-][^/]*)?$/i },
  { kind: 'changelog',    label: '更新日志', test: /^(changelog|changes|history|releases|news)([._-][^/]*)?$/i },
  { kind: 'conduct',      label: '行为准则', test: /^code[._-]?of[._-]?conduct([._-][^/]*)?$/i }
];

/* 规范类文档允许出现的目录：根目录、.github/、docs/（GitHub 官方推荐放 .github/） */
const META_DIR = /^(\.github|docs?|documentation)$/i;

const DOC_EXT = /\.(md|markdown|rst|txt|adoc|org)$/i;

/* 文件名里的语言后缀 → 中文标签。命中不了就原样显示后缀（大写）。 */
const LANG_LABELS = [
  [/^(zh[-_]?(cn|hans|sg|chs)|cn|chinese|zh)$/i, '中文'],
  [/^(zh[-_]?(tw|hk|hant|cht)|tw)$/i, '繁體'],
  [/^(en([-_][a-z]{2})?|english)$/i, 'English'],
  [/^ja$/i, '日本語'],
  [/^ko$/i, '한국어'],
  [/^ru$/i, 'Русский'],
  [/^es$/i, 'Español'],
  [/^fr$/i, 'Français'],
  [/^de$/i, 'Deutsch'],
  [/^pt([-_]br)?$/i, 'Português'],
  [/^it$/i, 'Italiano'],
  [/^nl$/i, 'Nederlands'],
  [/^pl$/i, 'Polski'],
  [/^tr$/i, 'Türkçe'],
  [/^vi$/i, 'Tiếng Việt'],
  [/^id$/i, 'Bahasa'],
  [/^th$/i, 'ไทย'],
  [/^ar$/i, 'العربية'],
  [/^hi$/i, 'हिन्दी'],
  [/^uk$/i, 'Українська'],
  [/^fa$/i, 'فارسی']
];

function rawBase() { return (process.env.CLAIM_RAW_BASE || 'https://raw.githubusercontent.com').replace(/\/+$/, ''); }
function apiBase() { return (process.env.CLAIM_API_BASE || 'https://api.github.com').replace(/\/+$/, ''); }
function apiToken() { return process.env.GITHUB_TOKEN || process.env.CLAIM_GITHUB_TOKEN || ''; }

/* ---------- raw 可用性：境内会整段被墙，必须能切到 Contents API ----------
   实测（2026-10-29，境内机 43.142.153.74）：
     https://api.github.com               200  0.29s  ✓
     https://raw.githubusercontent.com    000  11.2s  ✗（硬超时）
   而本模块原本每次都走 raw 取正文，于是条目页的 README 请求会串成
   9s × 多份的等待，最终被 nginx 60s 读超时截断，前端拿到空响应。

   处理方式：进程级探测一次 raw 是否可达（结果缓存 10 分钟），不可达就把
   正文通道切到 api.github.com 的 Contents API（返回 base64，解码即得原文）。
   为什么不每次都试 raw 再回落：raw 的超时是 9s，一次请求白等 9s 不如先探一次。
   为什么缓存而不是永久记住：机房线路会变，若哪天 raw 恢复，10 分钟内自动切回。 */
const RAW_PROBE_TTL = 10 * 60 * 1000;
let rawProbe = { ok: null, at: 0, code: '' };

async function rawReachable(fetchImpl, timeoutMs) {
  /* CLAIM_RAW_FORCE=1：显式声明 raw 通道可用，直接跳过探测。
     境外反代（CLAIM_RAW_BASE 指向自建 nginx）首包要 4~5 秒，而这里的探测超时上限
     只有 5 秒 —— 抖动一次就判 TIMEOUT，整批抓取被迫切到早就耗尽的 Contents API
     （实测 493 条全灭）。配了稳定反代就不该再靠探测赌运气。 */
  if (process.env.CLAIM_RAW_FORCE === '1') return true;
  const t = Date.now();
  if (rawProbe.ok !== null && t - rawProbe.at < RAW_PROBE_TTL) return rawProbe.ok;
  /* 探一个必定存在的公开文件：github/gitignore 的 README，几百字节，命中即代表 raw 通 */
  const url = rawBase() + '/github/gitignore/HEAD/README.md';
  let ok = false;
  let code = '';
  try {
    const res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-readme' }, redirect: 'follow' }, Math.min(timeoutMs, 8000));
    ok = !!res.ok;
    code = res.ok ? '' : 'HTTP_' + res.status;
  } catch (e) {
    ok = false;
    code = 'TIMEOUT';
  }
  rawProbe = { ok, at: t, code };
  if (!ok) console.warn('[readme] raw.githubusercontent.com 不可达（' + code + '），正文通道切到 Contents API');
  return ok;
}

/** 走 Contents API 取单份正文（raw 不可达时的替代通道）。
 *  API 返回 JSON，正文在 content（base64，可能带换行）。超 1MB 的单个文件 API 不给内容，
 *  这种情况按「取不到」处理 —— 320KB 上限本来就只要更小的那些。 */
async function fetchOneViaApi({ owner, name, file, fetchImpl, timeoutMs, maxBytes }) {
  const url = apiBase() + '/repos/' + owner + '/' + name + '/contents/' +
    file.split('/').map(encodeURIComponent).join('/') + '?ref=HEAD';
  const headers = { 'User-Agent': 'whalerealm-readme', Accept: 'application/vnd.github+json' };
  const token = apiToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await withTimeout(fetchImpl, url, { headers, redirect: 'follow' }, timeoutMs);
  } catch (e) {
    return null;
  }
  if (!res.ok) return null;
  let json;
  try { json = await res.json(); } catch (e) { return null; }
  if (!json || json.type !== 'file' || typeof json.content !== 'string') return null;
  let text = '';
  try {
    text = Buffer.from(json.content.replace(/\s+/g, ''), 'base64').toString('utf8');
  } catch (e) { return null; }
  if (!looksText(text)) return null;
  const c = clip(text, maxBytes);
  return { markdown: c.text, bytes: c.bytes, truncated: c.truncated, url };
}

function withTimeout(fetchImpl, url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  /* 定时器必须活到请求 settle 为止：之前写在 finally 里，函数一返回 Promise 就
     clearTimeout，超时保护等于没开（慢请求会一路拖到 nginx 的 60 秒读超时）。 */
  return Promise.resolve(fetchImpl(url, Object.assign({}, opts, { signal: ctl.signal })))
    .finally(() => clearTimeout(timer));
}

/** 二进制/HTML 当失败处理：正文里混进 \u0000 说明取到的不是文本 */
function looksText(s) {
  if (!s) return false;
  if (s.indexOf('\u0000') >= 0) return false;
  /* 只把「整篇就是一张 HTML 错误页」当失败：去掉 BOM 与首部空白后，前 200 字符
     以 <!doctype html 或 <html 开头。以前是「前 400 字符里出现过 <html 就算」——
     README 里写一句 `<html>` 行内代码就整份被丢，实测 dsh-eva-mari-skin 因此读不到。 */
  const lead = s.replace(/^\uFEFF/, '').trimStart().slice(0, 200).toLowerCase();
  if (lead.indexOf('<!doctype html') === 0 || lead.indexOf('<html') === 0) return false;
  return true;
}

function clip(text, maxBytes) {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false, bytes: buf.length };
  /* 按字节截断可能切开一个多字节字符，toString 会变成 \uFFFD —— 去掉末尾的替换符 */
  let out = buf.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/, '');
  const cut = out.lastIndexOf('\n');
  if (cut > maxBytes * 0.5) out = out.slice(0, cut);
  return { text: out, truncated: true, bytes: buf.length };
}

/** README.zh-CN.md / README_zh.md / README.md → 语言标签（默认那份给「默认」） */
function langOf(filePath) {
  const base = String(filePath || '').split('/').pop() || '';
  const m = base.match(/^readme[._-]([^/]*?)\.(?:md|markdown|rst|txt|adoc|org)$/i);
  if (!m) return { lang: 'default', label: '默认' };
  const suffix = m[1];
  for (let i = 0; i < LANG_LABELS.length; i++) {
    if (LANG_LABELS[i][0].test(suffix)) return { lang: suffix.toLowerCase(), label: LANG_LABELS[i][1] };
  }
  return { lang: suffix.toLowerCase(), label: suffix };
}

/** 排序权重：根目录的默认 README 永远第一，其次根目录中文，再其它语言，最后子目录 */
function rankOf(filePath) {
  const parts = String(filePath).split('/');
  const depth = parts.length - 1;
  const { lang } = langOf(filePath);
  const base = lang === 'default' ? 0 : (lang === 'zh' || /^zh/.test(lang) || lang === 'cn' ? 1 : 2);
  return depth * 10 + base;
}

function tidyPath(p) {
  return String(p || '').replace(/^\.?\/+/, '');
}

/** 规范类文档：路径 → {kind,label}；不是规范类文档返回 null */
function metaKindOf(filePath) {
  const base = String(filePath || '').split('/').pop() || '';
  const stem = base.replace(DOC_EXT, '');
  for (let i = 0; i < META_KINDS.length; i++) {
    if (META_KINDS[i].test.test(stem)) return META_KINDS[i];
  }
  return null;
}

/** 规范类文档的排序：先看扩展名（.md 最像正经文档，其次无扩展名，再次 .txt），再看目录深浅。
    扩展名权重压过目录，是因为 GitHub 官方推荐把安全策略放 .github/SECURITY.md ——
    根目录放一份 SECURITY.txt 的仓库极少，不能因为「在根目录」就压过 .github 里那份 .md。
    许可证反过来也成立：根目录的 LICENSE（无扩展名）仍然胜过 docs/LICENSE.txt。 */
function metaRank(filePath) {
  const parts = String(filePath).split('/');
  const depth = parts.length - 1;
  const base = parts[parts.length - 1].toLowerCase();
  let ext = 1;
  if (/\.md$/.test(base)) ext = 0;
  else if (/\.markdown$/.test(base)) ext = 0.5;
  else if (DOC_EXT.test(base)) ext = 2;
  return ext * 10 + depth;
}

/** 从 Trees 结果里挑出所有 README 路径 */
function pickReadmePaths(tree) {
  const out = [];
  const noExt = [];
  const seen = new Set();
  for (const node of tree || []) {
    if (!node || node.type !== 'blob') continue;
    const p = tidyPath(node.path);
    if (!p || seen.has(p.toLowerCase())) continue;
    if (p.split('/').length > MAX_DEPTH) continue;
    if (SKIP_DIRS.test(p)) continue;
    /* 点目录（.agents/.github/.devcontainer…）里放的是工具链说明，不是项目说明书 */
    const dir = p.indexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/')) : '';
    if (dir && /(^|\/)\./.test(dir)) continue;
    const base = p.split('/').pop();
    /* 没有扩展名的 README 单独收：它和 README.md 同时存在时是重复的一份，
       只有当仓库里再没有别的 README 时才拿出来用（见下面的兜底） */
    if (!README_NAME.test(base) && !/^readme$/i.test(base)) continue;
    seen.add(p.toLowerCase());
    if (/^readme$/i.test(base)) noExt.push(p);
    else out.push(p);
  }
  if (!out.length) out.push.apply(out, noExt);

  /* 子目录里的 README 只收「文档目录」里的：client/、worker/、dataset/、community/ 这类是子包/社区说明，
     不是「这个项目怎么用」。文档目录里如果根目录已经有同语言正文，也不再重复摆一个标签。 */
  const DOC_DIR = /^(docs?|documentation|wiki|i18n|translations?|locales?|lang|langs)$/i;
  const rootLabels = new Set();
  for (const p of out) {
    if (p.indexOf('/') < 0) rootLabels.add(langOf(p).label);
  }
  return out.filter((p) => {
    if (p.indexOf('/') < 0) return true;
    const first = p.split('/')[0];
    if (!DOC_DIR.test(first)) return false;
    return !rootLabels.has(langOf(p).label);
  });
}

/** 从 Trees 结果里挑出规范类文档：每种只留排序最靠前的一份 */
function pickMetaPaths(tree) {
  const best = new Map();
  for (const node of tree || []) {
    if (!node || node.type !== 'blob') continue;
    const p = tidyPath(node.path);
    if (!p) continue;
    const parts = p.split('/');
    if (parts.length > 2) continue;
    const dir = parts.length === 2 ? parts[0] : '';
    if (dir && !META_DIR.test(dir)) continue;
    const hit = metaKindOf(p);
    if (!hit) continue;
    const score = metaRank(p);
    const cur = best.get(hit.kind);
    if (!cur || score < cur.score) best.set(hit.kind, { kind: hit.kind, label: hit.label, path: p, score });
  }
  return Array.from(best.values()).sort((a, b) => a.score - b.score);
}

/** ① Trees 接口：一次请求拿到全部路径（含 docs/ 下的本地化 README 与规范类文档） */
async function listViaTree({ owner, name, fetchImpl, timeoutMs }) {
  const url = apiBase() + '/repos/' + owner + '/' + name + '/git/trees/HEAD?recursive=1';
  const headers = { 'User-Agent': 'whalerealm-readme', Accept: 'application/vnd.github+json' };
  const token = apiToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await withTimeout(fetchImpl, url, { headers, redirect: 'follow' }, timeoutMs);
  } catch (e) {
    return { ok: false, code: 'NETWORK' };
  }
  if (res.status === 403 || res.status === 429) return { ok: false, code: 'RATE_LIMITED' };
  if (res.status === 404) return { ok: false, code: 'REPO_NOT_FOUND' };
  /* 401/403 常被当成普通错误，但未带 Token 时它就是「限额耗尽」。
     区分出来是因为处理方式完全不同：限额要等一小时，网络抖一下重试就好。 */
  if (res.status === 401) return { ok: false, code: 'RATE_LIMITED' };
  if (!res.ok) return { ok: false, code: 'GITHUB_ERROR' };
  let json;
  try { json = await res.json(); } catch (e) { return { ok: false, code: 'GITHUB_ERROR' }; }
  const tree = (json && json.tree) || [];
  return {
    ok: true,
    paths: pickReadmePaths(tree),
    meta: pickMetaPaths(tree),
    partial: !!(json && json.truncated)
  };
}

/** ② raw 候选探测：Trees 不可用时的兜底，没有 API 限流 */
async function probeCandidates({ owner, name, fetchImpl, timeoutMs, maxBytes }) {
  /* 这条路只在 Trees 不可用时走。先问一次 raw 是否可达：
     不可达就整段走 Contents API —— 否则 16 个候选文件名 × 9s 超时 = 两分钟纯等待，
     而 nginx 的 proxy_read_timeout 只有 60s，用户只会看到一个空响应。 */
  const useRaw = await rawReachable(fetchImpl, timeoutMs);
  /* 串行探测在跨境链路上是灾难：16 个候选名 × 每次 2~4 秒往返，实测单条目 67 秒，
     正好撞上 nginx 的 60 秒读超时。改成 6 路并发；结果仍按 README_FILES 的顺序收纳，
     所以「根目录 README.md 优先」的语义没变。403/429 一旦出现就置限流标志，
     未开始的候选不再发请求（和串行版的 break 等价）。 */
  let blocked = false;
  let netFailed = false;
  const results = await mapLimit(README_FILES, 6, async (file) => {
    if (blocked) return null;
    const url = useRaw
      ? rawBase() + '/' + owner + '/' + name + '/HEAD/' + file
      : apiBase() + '/repos/' + owner + '/' + name + '/contents/' + encodeURIComponent(file) + '?ref=HEAD';
    let res;
    try {
      res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-readme' }, redirect: 'follow' }, timeoutMs);
    } catch (e) {
      netFailed = true;
      return null;
    }
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) { blocked = true; return null; }
    if (!res.ok) return null;

    let body = null;
    if (useRaw) {
      const len = Number(res.headers.get('content-length') || 0);
      if (len && len > maxBytes * 4) return null;
      let text = '';
      try { text = await res.text(); } catch (e) { return null; }
      if (!looksText(text)) return null;
      const c = clip(text, maxBytes);
      body = { markdown: c.text, bytes: c.bytes, truncated: c.truncated, url };
    } else {
      let json;
      try { json = await res.json(); } catch (e) { return null; }
      if (!json || json.type !== 'file' || typeof json.content !== 'string') return null;
      let text = '';
      try { text = Buffer.from(json.content.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch (e) { return null; }
      if (!looksText(text)) return null;
      const c = clip(text, maxBytes);
      body = { markdown: c.text, bytes: c.bytes, truncated: c.truncated, url };
    }

    const meta = langOf(file);
    return {
      kind: 'readme', path: file, lang: meta.lang, label: meta.label,
      markdown: body.markdown, bytes: body.bytes, truncated: body.truncated,
      url: body.url, via: useRaw ? 'raw' : 'api'
    };
  });
  const found = results.filter(Boolean).slice(0, MAX_DOCS);
  if (!found.length && netFailed) return { ok: false, docs: [], code: 'NETWORK' };
  return { ok: found.length > 0, docs: found };
}

/* 兜底探测用的规范类文档候选（Trees 不可达时才走这条路） */
const META_FILES = [
  { kind: 'license', label: '许可证', files: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING'] },
  { kind: 'security', label: '安全', files: ['SECURITY.md', '.github/SECURITY.md', 'SECURITY.txt'] },
  { kind: 'contributing', label: '贡献指南', files: ['CONTRIBUTING.md', '.github/CONTRIBUTING.md'] },
  { kind: 'changelog', label: '更新日志', files: ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md'] },
  { kind: 'conduct', label: '行为准则', files: ['CODE_OF_CONDUCT.md', '.github/CODE_OF_CONDUCT.md'] }
];

/** raw 通道取正文 */
async function fetchOneViaRaw({ owner, name, file, fetchImpl, timeoutMs, maxBytes }) {
  const url = rawBase() + '/' + owner + '/' + name + '/HEAD/' + file.split('/').map(encodeURIComponent).join('/');
  let res;
  try {
    res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-readme' }, redirect: 'follow' }, timeoutMs);
  } catch (e) {
    return null;
  }
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes * 4) return null;
  let text = '';
  try { text = await res.text(); } catch (e) { return null; }
  if (!looksText(text)) return null;
  const c = clip(text, maxBytes);
  return { markdown: c.text, bytes: c.bytes, truncated: c.truncated, url };
}

/** 抓一份指定路径的正文：按 raw 可达性选通道，取不到再换另一条试一次。
 *  「先 raw 后 API」的次序保留给 raw 可达的机器（raw 不消耗 API 限额）；
 *  raw 不可达时直接走 API，不再白等 9 秒。 */
async function fetchOne({ owner, name, file, kind, label, fetchImpl, timeoutMs, maxBytes }) {
  const useRaw = await rawReachable(fetchImpl, timeoutMs);
  const body = useRaw
    ? (await fetchOneViaRaw({ owner, name, file, fetchImpl, timeoutMs, maxBytes })
        || await fetchOneViaApi({ owner, name, file, fetchImpl, timeoutMs, maxBytes }))
    : (await fetchOneViaApi({ owner, name, file, fetchImpl, timeoutMs, maxBytes })
        || await fetchOneViaRaw({ owner, name, file, fetchImpl, timeoutMs, maxBytes }));
  if (!body) return null;

  const isReadme = !kind || kind === 'readme';
  const meta = isReadme ? langOf(file) : { lang: 'default', label: label || '' };
  return {
    kind: isReadme ? 'readme' : kind,
    path: file, lang: meta.lang, label: meta.label,
    markdown: body.markdown, bytes: body.bytes, truncated: body.truncated,
    url: body.url, via: useRaw ? 'raw' : 'api'
  };
}

/** 并发上限：一个仓库最多 6 份 README + 5 份规范文档，一次 3 个够快，也不会把 raw 打疼 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 兜底：Trees 不可用时逐个探测规范类文档 */
async function probeMeta(base) {
  /* 类内仍按候选顺序串行（第一个命中就停，避免多抓），类与类之间并发：
     5 类串行时最坏 15 次往返，跨境链路下又是 30 秒以上，和 README 探测叠起来
     就顶到 nginx 的 60 秒读超时了。 */
  const groups = await mapLimit(META_FILES, 5, async (spec) => {
    for (const file of spec.files) {
      const doc = await fetchOne(Object.assign({}, base, { file, kind: spec.kind, label: spec.label }));
      if (doc && doc.markdown) return doc;
    }
    return null;
  });
  return groups.filter(Boolean);
}

/**
 * 取一个仓库里所有可读的 README + 规范类文档。
 * @returns {Promise<{ok:boolean, docs?:Array, primary?:object, kinds?:string[], discovery?:string,
 *                    code?:string, message?:string}>}
 */
/* ---------- 配额预算：无 Token 时 60 次/小时，必须省着用 ----------
   实测成本（2026-10-29 境内机，无 Token）：
     Trees 列目录           1 次
     每份正文（README/许可证…） 1 次
   抓满 6 份 README + 5 份规范文档 = 12 次/仓库 → 60 次只够 5 个仓库，一个访客随手点几下就没了。

   所以按「有没有 Token」分两档预算：
     有 Token（5000/h）→ 按原设定抓全量（6 份 README + 5 份规范文档）
     无 Token          → 只抓 2 份 README + 1 份许可证，约 4 次/仓库，覆盖 15 个仓库/小时
   这是「宁可少给几份文档，也别让整条功能因为配额用完而全站失效」的取舍。
   想拿全量就配 GITHUB_TOKEN（也顺带把 Trees 的限额从 60 提到 5000）。 */
function budgetFor(token) {
  if (token) return { maxDocs: MAX_DOCS, maxMeta: MAX_META };
  return { maxDocs: 2, maxMeta: 1 };
}

async function fetchReadmes({
  repo, fetchImpl = fetch, timeoutMs = 9000, maxBytes = MAX_BYTES,
  maxDocs = null, totalBudget = TOTAL_BUDGET, maxMeta = null, metaBudget = META_BUDGET
} = {}) {
  /* 调用方没显式指定时，按 Token 有无决定预算 */
  const budget = budgetFor(apiToken());
  if (maxDocs == null) maxDocs = budget.maxDocs;
  if (maxMeta == null) maxMeta = budget.maxMeta;
  const target = parseRepo(repo);
  if (!target) {
    return { ok: false, code: 'REPO_NOT_GITHUB', message: '这个条目没有 GitHub 仓库地址，读不到 README' };
  }
  const { owner, name } = target;
  const base = { owner, name, fetchImpl, timeoutMs, maxBytes };

  /* ① 先探根目录候选名（纯 raw，不耗 API 配额）。
     绝大多数仓库根里就躺着 README.md：这一步不到 1 秒命中，省下 Trees 的 1 次配额
     （无 Token 时每小时只有 60 次）。反过来先问 Trees，会让「本来直接就能拿到」的
     条目也白白吃掉一次配额 —— 实测 80 条缺口里 3/4 属于这一类。 */
  let docs = [];
  let metaDocs = [];
  let discovery = '';
  let treeCode = '';
  let tree = null;

  const probe = await probeCandidates(base);
  if (probe.docs && probe.docs.length) {
    docs = probe.docs;
    discovery = 'probe';
  } else if (probe.code === 'NETWORK') {
    treeCode = 'NETWORK';
  }

  /* ② 根目录没有 → 才花 1 次 Trees 配额，定位 docs/README.zh-CN.md 这类深层路径 */
  if (!docs.length) {
    tree = await listViaTree(base);
    if (tree.ok && ((tree.paths && tree.paths.length) || (tree.meta && tree.meta.length))) {
      discovery = tree.partial ? 'tree-partial' : 'tree';
      const paths = (tree.paths || [])
        .slice()
        .sort((a, b) => rankOf(a) - rankOf(b))
        .slice(0, maxDocs);
      const fetched = await mapLimit(paths, 3, (file) => fetchOne(Object.assign({}, base, { file })));
      docs = fetched.filter(Boolean);

      /* 规范类文档：Trees 已经列出了路径，逐份抓正文即可 */
      const metaList = (tree.meta || []).slice(0, maxMeta);
      const gotMeta = await mapLimit(metaList, 3, (m) =>
        fetchOne(Object.assign({}, base, { file: m.path, kind: m.kind, label: m.label })));
      metaDocs = gotMeta.filter(Boolean);
    } else if (treeCode !== 'NETWORK') {
      treeCode = tree.code || (tree.ok ? 'EMPTY_TREE' : 'GITHUB_ERROR');
    }
  }

  /* ③ 分类收口：仓库不存在 → 让上层记 none 负缓存，别再让用户看到「限流」这种误导文案 */
  if (!docs.length) {
    if (treeCode === 'REPO_NOT_FOUND') {
      return { ok: false, code: 'REPO_NOT_FOUND', message: '这个 GitHub 仓库不存在或已改名' };
    }
    if (treeCode === 'NETWORK') {
      return { ok: false, code: 'NETWORK', message: '读不到仓库 README（GitHub 不可达或超时）' };
    }
    if (treeCode === 'RATE_LIMITED') {
      /* 配额耗尽只说明「列不出深层路径」，而 raw 已经把全部常见候选名探过一遍且都是
         404（走到这里时 probe 没有网络错误）—— 对访客来说这就是「仓库里没有可展示的
         README」，回 error 文案反而会误导。记 none 负缓存，1 天后自动重试。 */
      return { ok: false, code: 'README_NOT_FOUND', message: '作者仓库里没有可展示的 README' };
    }
    return { ok: false, code: 'README_NOT_FOUND', message: '作者仓库里没有 README' };
  }
  /* 兜底路径下规范类文档也要试一次（Trees 没给我们路径） */
  if (!metaDocs.length && !(tree && tree.ok && tree.meta && tree.meta.length)) {
    metaDocs = await probeMeta(base);
  }

  /* 总量预算：超了就从尾部砍，保证首屏 JSON 不被撑爆 */
  let used = 0;
  const kept = [];
  for (const d of docs) {
    if (kept.length >= maxDocs) break;
    if (kept.length && used + d.bytes > totalBudget) break;
    used += d.bytes;
    kept.push(d);
  }
  kept.sort((a, b) => rankOf(a.path) - rankOf(b.path));

  /* 规范类文档单独算预算：许可证全文有时几十 KB，不该挤掉 README */
  let metaUsed = 0;
  const keptMeta = [];
  for (const d of metaDocs) {
    if (keptMeta.length >= maxMeta) break;
    if (keptMeta.length && metaUsed + d.bytes > metaBudget) break;
    metaUsed += d.bytes;
    keptMeta.push(d);
  }
  /* 按 META_KINDS 的声明顺序摆：许可证 → 安全 → 贡献 → 更新日志 → 行为准则 */
  const order = new Map(META_KINDS.map((m, i) => [m.kind, i]));
  keptMeta.sort((a, b) => (order.get(a.kind) || 0) - (order.get(b.kind) || 0));

  const all = kept.concat(keptMeta);
  const kinds = [];
  for (const d of all) if (kinds.indexOf(d.kind) < 0) kinds.push(d.kind);
  return { ok: true, docs: all, primary: kept[0], kinds, discovery };
}

/** 兼容旧调用：只要一份（排序后的第一份 = 根目录默认 README） */
async function fetchReadme(opts = {}) {
  const all = await fetchReadmes(opts);
  if (!all.ok) return all;
  const p = all.primary;
  return {
    ok: true, markdown: p.markdown, path: p.path, url: p.url, via: 'raw',
    bytes: p.bytes, truncated: p.truncated, docs: all.docs, kinds: all.kinds, discovery: all.discovery
  };
}

module.exports = {
  fetchReadme, fetchReadmes, README_FILES, MAX_BYTES, MAX_DOCS, MAX_META,
  langOf, rankOf, pickReadmePaths, pickMetaPaths, metaKindOf, META_KINDS
};
