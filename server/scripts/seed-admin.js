/**
 * 后台账号种子
 *
 * 为什么单独一个脚本：生产环境的后台账号不能随源码进库（更不能写进 schema），
 * 首发时由运维跑一次这个脚本，把 4 个内置角色和 owner 账号准备好即可。
 *
 * 幂等：重复执行不会覆盖已有账号的密码 —— 只有显式给了 ADMIN_SEED_PASSWORD 才会
 * 重置密码（相当于「忘了密码就重跑一次」的兜底手段），也不会删任何数据。
 *
 * 用法：
 *   node scripts/seed-admin.js                      # 只保证角色 + root
 *   node scripts/seed-admin.js --demo               # 另建 admin01/editor01/staff01 联调用
 *   ADMIN_SEED_PASSWORD='Admin@2026' node scripts/seed-admin.js --demo
 *   DB_PATH=data/admin-test.db node scripts/seed-admin.js --demo
 */
'use strict';

const crypto = require('crypto');
const { db, now } = require('../src/db');
const { initAdminSchema } = require('../src/admin-db');
const { hashPassword, validPassword } = require('../src/admin-guard');

/* 密码字符集去掉了 0/O/1/l/I 这类容易抄错的分不清字符：运维是要手抄到登录框里的 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * 随机一次性密码。
 * 前后的 Wk / 7 是刻意的：密码策略要求同时含字母与数字，纯随机抽样理论上有极小概率
 * 抽不到数字，那样刚生成的密码会直接被 validPassword 判死。
 */
function randomPassword() {
  const bytes = crypto.randomBytes(12);
  let body = '';
  for (let i = 0; i < bytes.length; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return 'Wk' + body + '7';
}

const OWNER = { account: 'root', name: '站长', role: 'owner' };

/* --demo 的三个联调账号：用一个角色各建一个，方便验证「权限矩阵真的生效」
   而不是每次都用 root 全权限自欺欺人 */
const DEMO = [
  { account: 'admin01', name: '管理员一号', role: 'admin' },
  { account: 'editor01', name: '内容编辑', role: 'editor' },
  { account: 'staff01', name: '值班客服', role: 'staff' }
];

const STMT = {
  roleByKey: () => db.prepare('SELECT id, key, name FROM admin_roles WHERE key = ?'),
  account: () => db.prepare('SELECT * FROM admin_accounts WHERE account = ?'),
  insert: () => db.prepare(
    'INSERT INTO admin_accounts (account, name, password_hash, role_id, status, created_at, updated_at)' +
    " VALUES (?, ?, ?, ?, 'active', ?, ?)"
  ),
  updateRole: () => db.prepare('UPDATE admin_accounts SET role_id = ?, name = ?, updated_at = ? WHERE id = ?'),
  updatePassword: () => db.prepare(
    'UPDATE admin_accounts SET password_hash = ?, failed_count = 0, locked_until = 0, updated_at = ? WHERE id = ?'
  ),
  count: () => db.prepare('SELECT COUNT(*) AS n FROM admin_accounts')
};

async function main() {
  const demo = process.argv.indexOf('--demo') >= 0;
  const at = now();

  /* 直接调 initAdminSchema 而不是指望 db.js 已经跑过：单独执行本脚本时
     数据表可能还不存在（新机器第一次初始化就是这个场景）。 */
  const init = initAdminSchema(db);
  for (const w of init.warnings || []) console.warn('[seed-admin] ' + w);

  const roles = {};
  for (const row of db.prepare('SELECT id, key, name FROM admin_roles').all()) roles[row.key] = row;
  const missing = ['owner', 'admin', 'editor', 'staff'].filter((k) => !roles[k]);
  if (missing.length) {
    console.error('[seed-admin] 内置角色缺失：' + missing.join(', ') + '（schema-admin.sql 没执行成功？）');
    process.exitCode = 1;
    return;
  }

  const envPw = String(process.env.ADMIN_SEED_PASSWORD || '');
  if (envPw && !validPassword(envPw)) {
    console.error('[seed-admin] ADMIN_SEED_PASSWORD 不合规：要 8~64 位且同时含字母和数字');
    process.exitCode = 1;
    return;
  }

  const targets = [OWNER].concat(demo ? DEMO : []);
  const report = [];
  const generated = !envPw ? randomPassword() : '';

  for (const t of targets) {
    const role = roles[t.role];
    const existing = db.prepare('SELECT * FROM admin_accounts WHERE account = ?').get(t.account);

    if (existing) {
      /* 角色自愈：有人把 root 的角色改错了，重跑一次就该回到 owner，
         否则下次谁都没法进后台改回来 */
      if (existing.role_id !== role.id || existing.name !== t.name) {
        STMT.updateRole().run(role.id, t.name, at, existing.id);
      }
      if (envPw) {
        const hash = await hashPassword(envPw);
        STMT.updatePassword().run(hash, at, existing.id);
        report.push({ account: t.account, role: t.role, state: '密码已重置', password: envPw });
      } else {
        report.push({ account: t.account, role: t.role, state: '已存在（密码未改动）', password: '' });
      }
      continue;
    }

    const plain = envPw || generated;
    const hash = await hashPassword(plain);
    const info = STMT.insert().run(t.account, t.name, hash, role.id, at, at);
    if (info.changes !== 1) throw new Error('创建账号失败：' + t.account);
    report.push({ account: t.account, role: t.role, state: '已创建', password: plain });
  }

  const total = STMT.count().get().n;
  console.log('');
  console.log('鲸域后台 · 账号种子完成（' + new Date(at * 1000).toLocaleString('zh-CN') + '）');
  console.log('数据库：' + (process.env.DB_PATH || '默认 data/jingyu.db') + '　账号总数：' + total);
  console.log('');
  console.log('账号            角色      状态                密码');
  console.log('---------------------------------------------------------------');
  for (const r of report) {
    const acc = r.account + ' '.repeat(Math.max(0, 16 - r.account.length));
    const roleName = r.role + ' '.repeat(Math.max(0, 10 - r.role.length));
    const state = r.state + ' '.repeat(Math.max(0, 20 - r.state.length));
    console.log(acc + roleName + state + (r.password || '（未知，你之前设过）'));
  }
  console.log('');

  if (!envPw) {
    console.log('密码是随机生成的，只在这里打印这一次 —— 请立刻保存，登录后到「账号」页改掉。');
  }
  if (demo) {
    console.log('已建联调账号：admin01（管理员）/ editor01（编辑）/ staff01（值班），密码同上。');
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('[seed-admin] 失败：' + (err && err.message ? err.message : err));
    if (err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .then(() => {
    try { db.close(); } catch { /* 关不掉不影响退出码 */ }
  });
