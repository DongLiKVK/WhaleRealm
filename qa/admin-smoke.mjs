#!/usr/bin/env node
'use strict';
/**
 * 后台管理：只读冒烟（可安全跑在生产库上）
 *
 * 与 qa/admin-e2e.mjs 的分工：
 *   e2e 会建临时管理员、改帖子审核状态、发/撤奖励，必须在隔离库跑；
 *   本脚本只做 GET 与登录/登出，不写业务数据，用来确认「生产链路真的接上了」：
 *   静态入口能开、cookie 能种、18 项权限回表、7 个列表接口都 200。
 *
 * 用法：
 *   node qa/admin-smoke.mjs                       # 默认 http://127.0.0.1:3000
 *   node qa/admin-smoke.mjs --base http://127.0.0.1:8777
 *   ADMIN_SMOKE_PASSWORD=xxx node qa/admin-smoke.mjs
 *   node qa/admin-smoke.mjs --secret BASE32       # owner/admin 已绑定 2FA 时
 *
 * 2FA 账号：优先用 --secret / ADMIN_SMOKE_SECRET，其次读 qa/.admin-2fa-secrets.json
 * （e2e 生成的缓存）。未绑定账号会直接提示先完成绑定，不会替你在生产上绑定。
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SECRETS_FILE = new URL('./.admin-2fa-secrets.json', import.meta.url);

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const BASE = (argOf('base', process.env.ADMIN_SMOKE_BASE || 'http://127.0.0.1:3000')).replace(/\/$/, '');
const ACCOUNT = argOf('account', 'root');
const PASSWORD = argOf('password', process.env.ADMIN_SMOKE_PASSWORD || 'Admin@2026');
const EXPLICIT_SECRET = (argOf('secret', process.env.ADMIN_SMOKE_SECRET || '') || '').replace(/\s+/g, '').toUpperCase();

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); }
}

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
}
function absorb(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const line of list) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function req(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.size) headers.Cookie = cookieHeader();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  absorb(res);
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch { /* CSV/HTML */ }
  return { status: res.status, json, buf, text: buf.toString('utf8'), headers: res.headers };
}

const data = (r) => (r.json && r.json.data) || {};

function readTotpSecret() {
  if (EXPLICIT_SECRET) return EXPLICIT_SECRET;
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    const exact = raw[BASE + '|' + ACCOUNT];
    if (exact && exact.secret) return String(exact.secret).toUpperCase();
    for (const [key, value] of Object.entries(raw)) {
      if (key.endsWith('|' + ACCOUNT) && value && value.secret) return String(value.secret).toUpperCase();
    }
  } catch { /* 没有缓存 */ }
  return '';
}

async function loginWithTwoFactor() {
  const first = await req('POST', '/api/admin/auth/login', { account: ACCOUNT, password: PASSWORD });
  const d = data(first);
  if (first.status !== 200 || !d.twoFactorRequired) return { res: first, admin: d.admin || {} };

  if (d.mode === 'enroll') {
    console.error('\n  该账号还没有绑定两步验证：先用浏览器登录完成扫码绑定，');
    console.error('  或换一个已绑定的账号，或给脚本 --secret BASE32。');
    return { res: first, admin: null, enroll: true };
  }

  const secret = readTotpSecret();
  if (!secret) {
    console.error('\n  该账号已绑定两步验证，但脚本没有 secret。');
    console.error('  传 --secret BASE32，或设置 ADMIN_SMOKE_SECRET，或先跑本地 e2e 生成缓存。');
    return { res: first, admin: null, missingSecret: true };
  }

  const totp = require('../server/src/totp.js');
  const now = Math.floor(Date.now() / 1000);
  for (const step of [now, now + 30]) {
    const code = totp.totp(secret, step);
    const second = await req('POST', '/api/admin/auth/2fa/verify', { challengeToken: d.challengeToken, code });
    if (second.status === 200) return { res: second, admin: data(second).admin || {} };
    if (second.status !== 409) return { res: second, admin: null };
  }
  return { res: first, admin: null };
}

(async () => {
  console.log('后台只读冒烟 · ' + BASE + ' · 账号 ' + ACCOUNT);

  const hz = await req('GET', '/api/healthz');
  ok('健康检查 200', hz.status === 200, hz.status);

  const anon = await req('GET', '/api/admin/auth/me');
  ok('未登录 /auth/me 401', anon.status === 401, anon.status);

  const bad = await req('POST', '/api/admin/auth/login', { account: ACCOUNT, password: 'definitely-wrong-' + Date.now() });
  ok('错误密码 401 且不回显账号是否存在', bad.status === 401, bad.status);

  const login = await loginWithTwoFactor();
  ok('登录成功 200（含 2FA）', login.res.status === 200 && login.admin, login.res.status);
  const admin = login.admin || {};
  ok('账号有 18 项权限', Array.isArray(admin.permissions) && admin.permissions.length === 18, admin.permissions && admin.permissions.length);
  ok('响应不含密码哈希字段', !JSON.stringify(login.res.json || {}).includes('password_hash'), null);

  const me = await req('GET', '/api/admin/auth/me');
  ok('/auth/me 回显当前管理员', me.status === 200 && data(me).admin && data(me).admin.account === ACCOUNT, me.status);

  const stats = await req('GET', '/api/admin/stats/overview?days=7');
  const kpis = data(stats).kpis || {};
  ok('工作台统计 200 且有 9 项 KPI', stats.status === 200 && Object.keys(kpis).length === 9, Object.keys(kpis));
  ok('趋势序列长度 = days', Array.isArray(data(stats).series) && data(stats).series.length === 7, data(stats).series && data(stats).series.length);

  const posts = await req('GET', '/api/admin/posts?page=1&pageSize=5');
  ok('帖子列表 200', posts.status === 200 && Array.isArray(data(posts).items), posts.status);
  const pid = data(posts).items && data(posts).items[0] && data(posts).items[0].id;
  if (pid) {
    const detail = await req('GET', '/api/admin/posts/' + pid);
    const dd = data(detail);
    ok('帖子详情返回 {post, comments}', detail.status === 200 && dd.post && Array.isArray(dd.comments), Object.keys(dd));
  }

  const users = await req('GET', '/api/admin/users?page=1&pageSize=5');
  ok('用户列表 200 且邮箱已打码', users.status === 200 && (data(users).items || []).every((u) => !u.email || u.email.includes('*')), (data(users).items || [])[0] && data(users).items[0].email);

  const rewards = await req('GET', '/api/admin/rewards?page=1&pageSize=5');
  ok('奖励记录 200', rewards.status === 200 && Array.isArray(data(rewards).items), rewards.status);

  const roles = await req('GET', '/api/admin/roles');
  ok('角色列表 200（4 个内置）', roles.status === 200 && (data(roles).items || data(roles).roles || []).length >= 4, roles.status);

  const logs = await req('GET', '/api/admin/logs?page=1&pageSize=5');
  ok('日志列表 200', logs.status === 200 && Array.isArray(data(logs).items), logs.status);

  const csv = await req('GET', '/api/admin/logs/export.csv');
  ok('日志 CSV 带 BOM', csv.status === 200 && csv.buf.slice(0, 3).toString('hex') === 'efbbbf', csv.status + ' ' + csv.buf.slice(0, 3).toString('hex'));

  const rcsv = await req('GET', '/api/admin/rewards/export.csv');
  ok('奖励 CSV 带 BOM 且是附件', rcsv.status === 200 && rcsv.buf.slice(0, 3).toString('hex') === 'efbbbf' && /attachment/i.test(rcsv.headers.get('content-disposition') || ''), rcsv.status);

  const out = await req('POST', '/api/admin/auth/logout');
  ok('登出 200', out.status === 200, out.status);
  const after = await req('GET', '/api/admin/auth/me');
  ok('登出后 /auth/me 401', after.status === 401, after.status);

  console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + ' · 通过 ' + pass + ' 项 · 失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('冒烟脚本异常：', err);
  process.exit(2);
});
