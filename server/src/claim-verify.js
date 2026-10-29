'use strict';
/**
 * 认领校验：证明「操作者控制这个 GitHub 仓库」，不需要用户给任何 token。
 *
 * 思路（三种方法里先落两种能纯服务端验的）：
 *   readme —— 平台按 raw.githubusercontent.com 读仓库 README，找验证串；
 *   issue  —— 平台按 api.github.com 读仓库最近 30 个 issue 的标题与正文，找验证串；
 *   gist   —— 需要知道用户的 GitHub 账号（要 OAuth），暂时不支持，路由层如实拒绝。
 *
 * 安全边界：
 *   · 只读公开内容，不写仓库、不要 token、不碰私有仓库；
 *   · 验证串是 32 位十六进制随机串，绑定 (plugin, user)，24 小时过期；
 *   · 这里只回答「串在不在」，认领是否生效由路由层写库决定。
 */

/* 两个地址都可用环境变量覆盖：一是自建镜像/加速（raw.githubusercontent.com 在部分网络不可达），
   二是本地联调时把「仓库」换成 fixtures 服务器。默认就是 GitHub 官方地址。 */
function rawBase() { return (process.env.CLAIM_RAW_BASE || 'https://raw.githubusercontent.com').replace(/\/+$/, ''); }
function apiBase() { return (process.env.CLAIM_API_BASE || 'https://api.github.com').replace(/\/+$/, ''); }

const README_CANDIDATES = ['README.md', 'README.markdown', 'readme.md', 'README', 'README.rst', 'README.txt'];
const TOKEN_RE = /^[a-f0-9]{32}$/;

/** 从各种写法里取出 { owner, name }：https://github.com/o/r、github.com/o/r、git@github.com:o/r.git */
function parseRepo(repo) {
  const s = String(repo || '').trim();
  if (!s) return null;
  const m = s.match(/github\.com[\/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[?#].*)?$/);
  if (!m) return null;
  const owner = m[1];
  const name = m[2];
  if (!owner || !name || owner === '.' || name === '.') return null;
  return { owner, name };
}

async function withTimeout(fetchImpl, url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchImpl(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 走 GitHub Contents API 读文件（raw.githubusercontent.com 在部分网络不可达时的兜底）。
    api.github.com 未认证每小时 60 次，认领是低频动作，够用；超了会返回 RATE_LIMITED。 */
async function readmeViaApi({ owner, name, token, fetchImpl, timeoutMs }) {
  for (const file of README_CANDIDATES) {
    const url = apiBase() + '/repos/' + owner + '/' + name + '/contents/' + file + '?ref=HEAD';
    let res;
    try {
      res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-claim', Accept: 'application/vnd.github+json' } }, timeoutMs);
    } catch (e) {
      return { ok: false, code: 'NETWORK', message: '读不到仓库 README（网络超时或 GitHub 不可达）' };
    }
    if (res.status === 404) continue;
    if (res.status === 403 || res.status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'GitHub 限流了，过几分钟再试' };
    if (!res.ok) continue;
    let meta;
    try { meta = await res.json(); } catch (e) { continue; }
    if (!meta || meta.type !== 'file' || !meta.content) continue;
    let text = '';
    try { text = Buffer.from(String(meta.content).replace(/\s+/g, ''), 'base64').toString('utf8'); } catch (e) { continue; }
    if (text.includes(token)) return { ok: true, where: file + '（Contents API）' };
  }
  return { ok: false, code: 'TOKEN_NOT_FOUND', message: '在 README 里没找到验证串：可能还没推送、改动在别的分支，或者仓库是私有的' };
}

async function checkReadme({ owner, name, token, fetchImpl, timeoutMs }) {
  for (const file of README_CANDIDATES) {
    const url = rawBase() + '/' + owner + '/' + name + '/HEAD/' + file;
    let res;
    try {
      res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-claim' } }, timeoutMs);
    } catch (e) {
      continue; // 这一档读不到（常见于 raw 被墙），交给 Contents API 兜底
    }
    if (res.status === 403 || res.status === 429) {
      return { ok: false, code: 'RATE_LIMITED', message: 'GitHub 限流了，过几分钟再试' };
    }
    if (!res.ok) continue;
    const text = await res.text();
    if (text.includes(token)) return { ok: true, where: file };
  }
  if (process.env.CLAIM_RAW_BASE) {
    return { ok: false, code: 'TOKEN_NOT_FOUND', message: '在 README 里没找到验证串：可能还没推送、改动在别的分支，或者仓库是私有的' };
  }
  return readmeViaApi({ owner, name, token, fetchImpl, timeoutMs });
}

async function checkIssues({ owner, name, token, fetchImpl, timeoutMs }) {
  const url = apiBase() + '/repos/' + owner + '/' + name + '/issues?state=all&per_page=30';
  let res;
  try {
    res = await withTimeout(fetchImpl, url, { headers: { 'User-Agent': 'whalerealm-claim', Accept: 'application/vnd.github+json' } }, timeoutMs);
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: '读不到仓库 issue 列表（网络超时或 GitHub 不可达）' };
  }
  if (res.status === 404) return { ok: false, code: 'REPO_NOT_FOUND', message: '仓库不存在或是私有的' };
  if (res.status === 403 || res.status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'GitHub 限流了，过几分钟再试' };
  if (!res.ok) return { ok: false, code: 'GITHUB_ERROR', message: 'GitHub 返回 ' + res.status };
  let list;
  try {
    list = await res.json();
  } catch (e) {
    return { ok: false, code: 'GITHUB_ERROR', message: 'GitHub 返回的不是 JSON' };
  }
  if (!Array.isArray(list)) return { ok: false, code: 'GITHUB_ERROR', message: 'GitHub 返回格式不对' };
  for (const it of list) {
    const hay = String(it.title || '') + '\n' + String(it.body || '');
    if (hay.includes(token)) return { ok: true, where: 'issue #' + it.number };
  }
  return { ok: false, code: 'TOKEN_NOT_FOUND', message: '最近 30 个 issue 里没找到验证串：可能建在了别的仓库，或者 issue 被转成了私密' };
}

/**
 * @returns {Promise<{ok:boolean, where?:string, code?:string, message?:string}>}
 */
async function verifyClaimToken({ repo, token, method = 'readme', fetchImpl = fetch, timeoutMs = 8000 }) {
  const target = parseRepo(repo);
  if (!target) return { ok: false, code: 'REPO_NOT_GITHUB', message: '这个条目没有可校验的 GitHub 仓库地址' };
  if (!TOKEN_RE.test(String(token || ''))) return { ok: false, code: 'BAD_TOKEN', message: '验证串格式不对' };
  if (method === 'issue') return checkIssues({ ...target, token, fetchImpl, timeoutMs });
  if (method === 'readme') return checkReadme({ ...target, token, fetchImpl, timeoutMs });
  return { ok: false, code: 'METHOD_UNSUPPORTED', message: '这种验证方式还没开放，先用 README 或 Issue' };
}

module.exports = { parseRepo, verifyClaimToken, README_CANDIDATES, TOKEN_RE };
