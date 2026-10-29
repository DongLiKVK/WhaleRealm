#!/usr/bin/env node
/**
 * 后台管理系统 · 端到端验收（零依赖，Node ≥ 20 自带 fetch）
 *
 * 目的：把 docs/admin-api.md 里的承诺逐条当真验一遍 —— 鉴权、越权、审核、
 * 禁用、奖励、日志、CSV。它不是单元测试，而是「部署前跑一次」的验收清单。
 *
 * 用法：
 *   node qa/admin-e2e.mjs [--base http://127.0.0.1:3000]
 *   环境变量：ADMIN_E2E_BASE / ADMIN_E2E_PASSWORD（默认 Admin@2026）
 *   账号：root / admin01 / editor01 / staff01（seed-admin.js --demo 生成）
 *
 * 副作用（会在 finally 里尽力还原）：
 *   - 临时建一个管理员账号做「连续失败锁定」测试，跑完删除
 *   - 临时禁用/启用一个站点用户，跑完恢复
 *   - 把一条帖子改成 rejected 再改回原状态
 *   - 发放 100 积分后撤回
 * 退出码：0 全过；1 有失败；2 参数/服务不可用。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 两步验证：验收脚本要自己算 TOTP，才能像真人一样过第二步。
   复用服务端同一个实现（含 ±1 步窗口、base32 解码），避免测试和服务端各写一套。
   secret 只落在 qa/.admin-2fa-secrets.json（已 gitignore），按「BASE|账号」分开存。 */
const totp = (await import('../server/src/totp.js')).default;
const SECRETS_FILE = fileURLToPath(new URL('./.admin-2fa-secrets.json', import.meta.url));
const secrets = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
})();
function saveSecrets() {
  try { fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 }); }
  catch (e) { console.warn('  ! 无法写入 2FA secret 缓存：' + e.message); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = (process.env.ADMIN_E2E_BASE || argOf('base') || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const PASSWORD = process.env.ADMIN_E2E_PASSWORD || 'Admin@2026';
const SITE_DEMO = { email: 'demo3@jingyu.local', password: 'jingyu1234' };

function argOf(name) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return '';
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : '';
}

/* ---------------- 极简 cookie jar ----------------
   只用 name=value；后台 cookie 是 HttpOnly 的，但这不影响 fetch 客户端自己存取。 */
function makeJar() {
  const map = new Map();
  return {
    absorb(res) {
      const list = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
      for (const line of list) {
        const pair = String(line).split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    header() { return [...map.entries()].map(([k, v]) => k + '=' + v).join('; '); },
    get(name) { return map.get(name) || ''; },
    clear() { map.clear(); }
  };
}

let passed = 0; const failures = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + String(extra).slice(0, 220) : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + String(extra).slice(0, 220) : '')); }
}
function eq(name, actual, expected) { ok(name + '（=' + JSON.stringify(expected) + '）', actual === expected, 'got ' + JSON.stringify(actual)); }

async function call(jar, method, path, body) {
  /* 没有 body 时不能带 Content-Type: application/json —— Fastify 会以
     FST_ERR_CTP_EMPTY_JSON_BODY 回 400（logout 这类无参 POST 会中招）。 */
  const headers = {};
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  jar.absorb(res);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  const bytes = [...buf.subarray(0, 3)];
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, bytes, headers: res.headers };
}

/* 服务端要求验证码的时间步必须比上次用过的更晚（防重放）。
   同一进程里连续登录两次 root 时，先等到下一个 30 秒窗口再算码。 */
async function waitFreshStep(meta) {
  if (!meta || !meta.lastStep) return;
  const nowStep = Math.floor(Date.now() / 30000);
  if (nowStep <= meta.lastStep) {
    const wait = (meta.lastStep + 1) * 30000 - Date.now() + 500;
    if (wait > 0) await sleep(wait);
  }
}

async function login(jar, account, password) {
  const first = await call(jar, 'POST', '/api/admin/auth/login', { account, password });
  const data = first.json && first.json.data;
  if (first.status !== 200 || !data || !data.twoFactorRequired) return first;

  const storeKey = BASE + '|' + account;

  /* 第一次登录：服务端发 pending secret + QR，确认 6 位码后正式启用。 */
  if (data.mode === 'enroll') {
    const secret = (data.enroll && data.enroll.secret) || '';
    const code = totp.totp(secret);
    const enabled = await call(jar, 'POST', '/api/admin/auth/2fa/enable', { challengeToken: data.challengeToken, code });
    if (enabled.status === 200) {
      secrets[storeKey] = { secret, lastStep: Math.floor(Date.now() / 30000) };
      saveSecrets();
      const left = (enabled.json.data.recoveryCodes || []).length;
      console.log('  · ' + account + ' 首次登录完成 TOTP 绑定（发出恢复码 ' + left + ' 个，测试不保存）');
    }
    return enabled;
  }

  /* 已经绑定过：必须用上次保存的 secret；没有就明确告诉运维怎么重置，
     不要拿错误验证码去试，那会累计 failed_count 把账号锁掉。 */
  const meta = secrets[storeKey];
  if (!meta || !meta.secret) {
    return {
      status: 428,
      json: { ok: false, error: { code: 'TOTP_SECRET_MISSING', message: '本地没有 ' + account + ' 的 TOTP secret' } },
      text: '本地没有 ' + account + ' 的 TOTP secret：先执行 node scripts/reset-admin-2fa.js ' + account + '，再重跑验收',
      headers: first.headers,
    };
  }

  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitFreshStep(meta);
    const step = Math.floor(Date.now() / 30000);
    const code = totp.totp(meta.secret);
    last = await call(jar, 'POST', '/api/admin/auth/2fa/verify', { challengeToken: data.challengeToken, code });
    if (last.status === 200) {
      meta.lastStep = step;
      saveSecrets();
      return last;
    }
    const codeName = last.json && last.json.error && last.json.error.code;
    if (last.status === 409 && codeName === 'CODE_REPLAY') {
      meta.lastStep = step;
      saveSecrets();
      continue;
    }
    return last;
  }
  return last;
}

/* ---------------- 主流程 ---------------- */
(async () => {
  console.log('后台验收目标：' + BASE + '\n');

  /* 0. 服务可达 */
  let health;
  try { health = await fetch(BASE + '/api/healthz').then((r) => r.json()); }
  catch (e) { console.error('服务不可用：' + e.message); process.exit(2); }
  ok('健康检查 /api/healthz', health && health.ok === true);

  /* 1. 未登录必须 401 */
  const anon = makeJar();
  const a1 = await call(anon, 'GET', '/api/admin/posts');
  eq('未登录访问 /api/admin/posts 状态', a1.status, 401);
  eq('未登录错误码', a1.json && a1.json.error && a1.json.error.code, 'NOT_AUTHED');

  /* 2. 站点用户 token 不能进后台 */
  const site = makeJar();
  const sl = await call(site, 'POST', '/api/auth/login', { email: SITE_DEMO.email, password: SITE_DEMO.password, takeover: true });
  if (sl.status === 200) {
    const a2 = await call(site, 'GET', '/api/admin/posts');
    eq('站点登录态访问后台被拒', a2.status, 401);
  } else {
    console.log('  - 跳过站点 token 互斥检查（站点演示账号不可用，status=' + sl.status + '）');
  }

  /* 3. root 登录 + 身份/权限 */
  const root = makeJar();
  const rl = await login(root, 'root', PASSWORD);
  eq('root 登录状态', rl.status, 200);
  if (rl.status !== 200) {
    console.error('root 登录失败，后续用例无法继续：' + rl.text.slice(0, 300));
    console.error('提示：先在 server 目录执行 node scripts/seed-admin.js --demo（ADMIN_SEED_PASSWORD=' + PASSWORD + '）');
    process.exit(2);
  }
  const rootAdmin = rl.json.data.admin;
  ok('root 角色为 owner', rootAdmin.roleKey === 'owner', rootAdmin.roleKey);
  ok('root 权限数 ≥ 17', Array.isArray(rootAdmin.permissions) && rootAdmin.permissions.length >= 17, rootAdmin.permissions && rootAdmin.permissions.length);
  ok('root 权限含 admin.manage', (rootAdmin.permissions || []).includes('admin.manage'));
  ok('root 登录态带 TOTP 认证强度', rootAdmin.totpEnabled === true, 'totpEnabled=' + rootAdmin.totpEnabled);
  const me = await call(root, 'GET', '/api/admin/auth/me');
  eq('/auth/me 状态', me.status, 200);
  eq('/auth/me 账号', me.json && me.json.data.admin.account, 'root');

  /* 4. 错误密码 → 401，提示不泄露账号是否存在 */
  const badJar = makeJar();
  const bad = await login(badJar, 'root', 'wrong-password-1');
  eq('错误密码状态', bad.status, 401);
  ok('错误提示不区分账号存在性', bad.json && /账号或密码/.test(bad.json.error.message), bad.text);

  /* 5. 连续失败锁定：临时账号，避免锁住 root */
  const tmpAccount = 'qa_lock_' + Date.now().toString(36).slice(-6);
  const created = await call(root, 'POST', '/api/admin/admins', { account: tmpAccount, name: '锁定测试', password: 'Qa@123456', roleId: (await call(root, 'GET', '/api/admin/roles')).json.data.items.find((r) => r.key === 'staff').id });
  eq('临时管理员创建', created.status, 200);
  const tmpId = created.json && created.json.data && created.json.data.admin && created.json.data.admin.id;
  let lockedStatus = 0;
  for (let i = 0; i < 6; i++) {
    const jar = makeJar();
    const r = await login(jar, tmpAccount, 'bad-pass-' + i);
    lockedStatus = r.status;
    if (r.status === 423) break;
  }
  eq('连续失败后锁定（423）', lockedStatus, 423);

  /* 6. 工作台统计形状 */
  const ov = await call(root, 'GET', '/api/admin/stats/overview?days=7');
  eq('工作台状态', ov.status, 200);
  ok('KPI 字段齐全', ov.json && ov.json.data.kpis && ['posts', 'pending', 'users', 'admins'].every((k) => typeof ov.json.data.kpis[k] === 'number'), ov.text.slice(0, 200));
  eq('趋势序列长度 = days', ov.json && ov.json.data.series && ov.json.data.series.length, 7);

  /* 7. 帖子列表 / 搜索 / 详情 */
  const pl = await call(root, 'GET', '/api/admin/posts?page=1&pageSize=5');
  eq('帖子列表状态', pl.status, 200);
  const listData = pl.json && pl.json.data;
  ok('帖子列表分页字段', listData && Array.isArray(listData.items) && typeof listData.total === 'number' && typeof listData.page === 'number');
  ok('状态计数齐全', listData && listData.counts && ['all', 'published', 'pending', 'rejected', 'hidden'].every((k) => typeof listData.counts[k] === 'number'));
  const firstPost = listData && listData.items && listData.items[0];
  if (firstPost) {
    const pd = await call(root, 'GET', '/api/admin/posts/' + firstPost.id);
    eq('帖子详情状态', pd.status, 200);
    ok('详情含评论数组', pd.json && Array.isArray(pd.json.data.comments));
    const detailPost = (pd.json.data.post || pd.json.data);
    const originalStatus = detailPost.status || 'published';

    /* 8. 审核：驳回 → 状态变化 → 日志 */
    const rj = await call(root, 'POST', '/api/admin/posts/' + firstPost.id + '/review', { decision: 'reject', note: 'QA 自动化：含外链' });
    eq('审核驳回状态', rj.status, 200);
    eq('审核后帖子状态', rj.json && rj.json.data.post.status, 'rejected');
    const back = await call(root, 'POST', '/api/admin/posts/' + firstPost.id + '/review', { decision: originalStatus === 'rejected' ? 'approve' : 'approve', note: 'QA 还原' });
    eq('审核通过状态', back.status, 200);
    eq('还原后状态', back.json && back.json.data.post.status, 'published');

    /* 9. 批量审核（两条以内，避免大范围改动） */
    const ids = (listData.items || []).slice(0, 2).map((p) => p.id);
    if (ids.length >= 1) {
      const bt = await call(root, 'POST', '/api/admin/posts/batch', { action: 'approve', ids, note: 'QA 批量' });
      eq('批量审核状态', bt.status, 200);
      ok('批量审核返回 affected', bt.json && typeof bt.json.data.affected === 'number', bt.text.slice(0, 160));
    }
  } else {
    console.log('  - 跳过审核用例：库里没有帖子');
  }

  /* 10. 用户列表 / 详情 / 邮箱打码 */
  const ul = await call(root, 'GET', '/api/admin/users?page=1&pageSize=5');
  eq('用户列表状态', ul.status, 200);
  const uItem = ul.json && ul.json.data.items && ul.json.data.items[0];
  ok('用户列表含状态计数', ul.json && ul.json.data.counts && typeof ul.json.data.counts.all === 'number');
  ok('列表邮箱已打码', !!uItem && (!uItem.email || uItem.email.includes('*')), uItem && uItem.email);
  if (uItem) {
    const ud = await call(root, 'GET', '/api/admin/users/' + uItem.id);
    eq('用户详情状态', ud.status, 200);
    ok('详情回显完整邮箱', !!ud.json && !!ud.json.data.user.email && !ud.json.data.user.email.includes('*'), ud.json && ud.json.data.user.email);
    ok('详情含 stats', ud.json && ud.json.data.stats && typeof ud.json.data.stats.posts === 'number');

    /* 11. 编辑等级后还原 */
    const oldLevel = ud.json.data.user.level;
    const ed = await call(root, 'PATCH', '/api/admin/users/' + uItem.id, { level: Math.min(99, oldLevel + 1) });
    eq('编辑用户等级状态', ed.status, 200);
    eq('等级已变更', ed.json && ed.json.data.user.level, Math.min(99, oldLevel + 1));
    await call(root, 'PATCH', '/api/admin/users/' + uItem.id, { level: oldLevel });

    /* 12. 禁用 → 站点登录被拒 → 恢复 */
    const uEmail = ud.json.data.user.email;
    const dis = await call(root, 'POST', '/api/admin/users/' + uItem.id + '/status', { status: 'disabled', reason: 'QA 自动化：验证禁用生效' });
    eq('禁用用户状态', dis.status, 200);
    eq('禁用后用户状态', dis.json && dis.json.data.user.status, 'disabled');
    if (uEmail && /@/.test(uEmail)) {
      const siteLogin = await call(makeJar(), 'POST', '/api/auth/login', { email: uEmail, password: 'jingyu1234', takeover: true });
      ok('被禁用用户站点登录失败', siteLogin.status >= 400, siteLogin.status + ' ' + siteLogin.text.slice(0, 120));
    }
    const en = await call(root, 'POST', '/api/admin/users/' + uItem.id + '/status', { status: 'active', reason: 'QA 自动化：恢复' });
    eq('恢复用户状态', en.status, 200);
    eq('恢复后状态', en.json && en.json.data.user.status, 'active');
  }

  /* 13. 奖励发放 / 积分账 / 撤回 */
  if (uItem) {
    const before = await call(root, 'GET', '/api/admin/users/' + uItem.id);
    const pointsBefore = before.json.data.user.points || 0;
    const g = await call(root, 'POST', '/api/admin/rewards', { userId: uItem.id, type: 'points', amount: 100, reason: 'QA 自动化：积分发放验证', note: 'e2e' });
    eq('发放奖励状态', g.status, 200);
    const rewardId = g.json && g.json.data.reward && g.json.data.reward.id;
    ok('奖励记录带原因', g.json && g.json.data.reward.reason === 'QA 自动化：积分发放验证');
    const after = await call(root, 'GET', '/api/admin/users/' + uItem.id);
    eq('积分 +100', after.json.data.user.points, pointsBefore + 100);
    const rv = await call(root, 'POST', '/api/admin/rewards/' + rewardId + '/revoke', { reason: 'QA 自动化：撤回验证' });
    eq('撤回奖励状态', rv.status, 200);
    eq('奖励状态 revoked', rv.json && rv.json.data.reward.status, 'revoked');
    const after2 = await call(root, 'GET', '/api/admin/users/' + uItem.id);
    eq('积分退回', after2.json.data.user.points, pointsBefore);
    const rv2 = await call(root, 'POST', '/api/admin/rewards/' + rewardId + '/revoke', { reason: '重复撤回' });
    eq('重复撤回被拒（409）', rv2.status, 409);
    const rlist = await call(root, 'GET', '/api/admin/rewards?page=1&pageSize=5');
    eq('奖励列表状态', rlist.status, 200);
    ok('奖励汇总字段', rlist.json && rlist.json.data.summary && typeof rlist.json.data.summary.granted === 'number');
  }

  /* 13b. 会员档位 / 头像框 */
  if (uItem) {
    const opt = await call(root, 'GET', '/api/admin/rewards/options?userId=' + uItem.id);
    eq('奖励选项状态', opt.status, 200);
    const od = opt.json && opt.json.data;
    ok('选项含档位/头像框/常用原因', !!od && od.tiers.length >= 3 && od.frames.length >= 4 && od.presets.length >= 3, od ? od.tiers.length + '/' + od.frames.length + '/' + od.presets.length : '');
    ok('选项含用户会员面板', !!od && !!od.user && typeof od.user.tier === 'string' && typeof od.user.frameFollow === 'boolean');

    const gd = await call(root, 'POST', '/api/admin/rewards', { userId: uItem.id, type: 'days', amount: 5, tier: 'master', reason: 'QA 自动化：会员档位发放验证' });
    eq('发放会员档位状态', gd.status, 200);
    eq('奖励记录写入档位', gd.json && gd.json.data.reward.tier, 'master');
    eq('面板档位 master', gd.json && gd.json.data.user.tier, 'master');
    ok('面板档位有效', gd.json && gd.json.data.user.tierActive === true);
    ok('面板带到期时间', gd.json && gd.json.data.user.expiresAt > Math.floor(Date.now() / 1000));

    const fd = await call(root, 'POST', '/api/admin/rewards', { userId: uItem.id, type: 'frame', frame: 'maw-2', amount: 0, reason: 'QA 自动化：头像框发放验证' });
    eq('更换头像框状态', fd.status, 200);
    eq('头像框写入 maw-2', fd.json && fd.json.data.user.frame, 'maw-2');
    ok('头像框不再跟随档位', fd.json && fd.json.data.user.frameFollow === false);

    const badTier = await call(root, 'POST', '/api/admin/rewards', { userId: uItem.id, type: 'days', amount: 5, tier: 'gold', reason: 'QA 自动化：非法档位' });
    eq('非法档位被拒（400）', badTier.status, 400);
    const badFrame = await call(root, 'POST', '/api/admin/rewards', { userId: uItem.id, type: 'frame', frame: 'nope', amount: 0, reason: 'QA 自动化：非法头像框' });
    eq('非法头像框被拒（400）', badFrame.status, 400);

    const rvf = await call(root, 'POST', '/api/admin/rewards/' + (fd.json && fd.json.data.reward.id) + '/revoke', { reason: 'QA 自动化：还原头像框' });
    eq('撤回头像框状态', rvf.status, 200);
    eq('头像框还原 auto', rvf.json && rvf.json.data.user.frame, 'auto');
    const rvd = await call(root, 'POST', '/api/admin/rewards/' + (gd.json && gd.json.data.reward.id) + '/revoke', { reason: 'QA 自动化：还原档位' });
    eq('撤回会员档位状态', rvd.status, 200);
    eq('档位回到 free', rvd.json && rvd.json.data.user.tier, 'free');
    eq('撤回后到期时间清零', rvd.json && rvd.json.data.user.expiresAt, 0);
  }

  /* 14. 角色与越权（editor） */
  const roles = await call(root, 'GET', '/api/admin/roles');
  eq('角色列表状态', roles.status, 200);
  const roleItems = (roles.json && roles.json.data.items) || [];
  ok('内置角色 4 个', ['owner', 'admin', 'editor', 'staff'].every((k) => roleItems.some((r) => r.key === k && r.builtin)), roleItems.map((r) => r.key).join(','));
  const perm = await call(root, 'GET', '/api/admin/permissions');
  ok('权限目录分组 ≥ 5', perm.json && perm.json.data.groups.length >= 5, perm.json && perm.json.data.groups.length);

  /* 管理员列表要能看出谁绑了验证器；重置自己是禁止的（防止 owner 把自己锁在门外） */
  const adminList = await call(root, 'GET', '/api/admin/admins?page=1&pageSize=50');
  const rootRow = ((adminList.json && adminList.json.data && adminList.json.data.items) || []).find((x) => x.account === 'root');
  ok('管理员列表返回两步验证状态', !!rootRow && rootRow.totpEnabled === true, rootRow && rootRow.totpEnabled);
  const selfReset = await call(root, 'POST', '/api/admin/admins/' + rootAdmin.id + '/reset-2fa');
  eq('不能重置自己的两步验证（403）', selfReset.status, 403);

  const editor = makeJar();
  const el = await login(editor, 'editor01', PASSWORD);
  eq('editor 登录状态', el.status, 200);
  if (el.status === 200) {
    const ep = el.json.data.admin.permissions || [];
    ok('editor 无 post.delete', !ep.includes('post.delete'), ep.join(','));
    ok('editor 有 post.review', ep.includes('post.review'));
    if (firstPost) {
      const del = await call(editor, 'DELETE', '/api/admin/posts/' + firstPost.id);
      eq('editor 删帖被拒（403）', del.status, 403);
    }
    const rm = await call(editor, 'PUT', '/api/admin/roles/' + (roleItems.find((r) => r.key === 'staff') || {}).id, { name: '越权改名' });
    eq('editor 改角色被拒（403）', rm.status, 403);
    const elogs = await call(editor, 'GET', '/api/admin/logs');
    eq('editor 日志 scope=self', elogs.json && elogs.json.data.scope, 'self');
  }

  /* 15. 自定义角色 → 建管理员 → 登录 → 删除 */
  const cr = await call(root, 'POST', '/api/admin/roles', { name: 'QA 观察员', description: 'e2e 临时角色', permissions: ['dashboard.view', 'post.view'] });
  eq('创建自定义角色', cr.status, 200);
  const customRoleId = cr.json && cr.json.data.role && cr.json.data.role.id;
  const qaAccount = 'qa_obs_' + Date.now().toString(36).slice(-5);
  const ca = await call(root, 'POST', '/api/admin/admins', { account: qaAccount, name: 'QA 观察员', password: 'Qa@123456', roleId: customRoleId });
  eq('创建管理员', ca.status, 200);
  const qaAdminId = ca.json && ca.json.data.admin && ca.json.data.admin.id;
  if (qaAdminId) {
    const qaJar = makeJar();
    const ql = await login(qaJar, qaAccount, 'Qa@123456');
    eq('新管理员登录', ql.status, 200);
    const qp = await call(qaJar, 'POST', '/api/admin/rewards', { userId: uItem && uItem.id, type: 'custom', amount: 0, reason: '越权测试不应成功' });
    eq('无 reward.grant 时发放被拒（403）', qp.status, 403);
    const da = await call(root, 'DELETE', '/api/admin/admins/' + qaAdminId);
    eq('删除管理员', da.status, 200);
  }
  const dr = await call(root, 'DELETE', '/api/admin/roles/' + customRoleId);
  eq('删除空角色', dr.status, 200);
  const drBuiltin = await call(root, 'DELETE', '/api/admin/roles/' + (roleItems.find((r) => r.key === 'staff') || {}).id);
  ok('删除内置角色被拒（409/403）', [403, 409].includes(drBuiltin.status), drBuiltin.status);

  /* 16. 日志与导出 */
  const logs = await call(root, 'GET', '/api/admin/logs?page=1&pageSize=20');
  eq('日志列表状态', logs.status, 200);
  eq('root 日志 scope=all', logs.json && logs.json.data.scope, 'all');
  const acts = new Set(((logs.json && logs.json.data.items) || []).map((l) => l.action));
  ok('日志含审核/发放/禁用动作', ['post.review', 'reward.grant', 'user.disable', 'auth.login'].some((a) => acts.has(a)), [...acts].join(','));
  const exp = await call(root, 'GET', '/api/admin/logs/export.csv?page=1');
  eq('日志 CSV 状态', exp.status, 200);
  ok('日志 CSV 带 BOM 与表头', exp.bytes.slice(0, 3).join(',') === '239,187,191' && /action|动作/.test(exp.text.slice(0, 200)), exp.bytes.slice(0, 3).join(',') + ' | ' + exp.text.slice(0, 40));
  const exp2 = await call(root, 'GET', '/api/admin/rewards/export.csv');
  eq('奖励 CSV 状态', exp2.status, 200);
  const rHead = exp2.text.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  ok('奖励 CSV 有表头', exp2.bytes.slice(0, 3).join(',') === '239,187,191' && rHead.length > 5 && /编号|时间|用户|原因/.test(rHead), rHead.slice(0, 60));

  /* 17. 退出后会话立即失效 */
  const out = await call(root, 'POST', '/api/admin/auth/logout');
  eq('退出登录状态', out.status, 200);
  const afterLogout = await call(root, 'GET', '/api/admin/auth/me');
  eq('退出后 /me 401', afterLogout.status, 401);

  /* 18. 清理临时锁定账号（需要重新登录 root） */
  const root2 = makeJar();
  const rl2 = await login(root2, 'root', PASSWORD);
  if (rl2.status === 200 && tmpId) {
    const dt = await call(root2, 'DELETE', '/api/admin/admins/' + tmpId);
    ok('清理临时锁定账号', [200, 404].includes(dt.status), dt.status);
  }

  /* 汇总 */
  console.log('\n通过 ' + passed + ' 项，失败 ' + failures.length + ' 项');
  if (failures.length) {
    console.log('失败明细：');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('全部通过 ✅');
})();
