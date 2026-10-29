/**
 * 后台 · 命令行重置两步验证
 *
 * 使用场景：owner/admin 换了手机、恢复码也用完了，进不了后台；后台里又不能
 * 「重置自己」（那等于把最后一把钥匙锁在屋里）。这个脚本在服务器上直接清掉
 * 指定账号的 TOTP 材料并撤销它的全部会话，下次登录会重新走扫码绑定。
 *
 * 用法：
 *   node scripts/reset-admin-2fa.js --list
 *   node scripts/reset-admin-2fa.js root
 *   DB_PATH=/var/www/jingyu/server/data/jingyu.db node scripts/reset-admin-2fa.js root
 *
 * 注意：不改变密码、不改变角色、不解锁其它账号；只动 2FA 字段 + 会话 + 恢复码。
 */
'use strict';

const { db, now } = require('../src/db');
const { initAdminSchema } = require('../src/admin-db');
const { writeAdminLog, revokeAdminSessions } = require('../src/admin-guard');

const USAGE = [
  '用法：node scripts/reset-admin-2fa.js <账号>',
  '      node scripts/reset-admin-2fa.js --list',
  '',
  '示例：node scripts/reset-admin-2fa.js root',
  '      DB_PATH=data/jingyu.db node scripts/reset-admin-2fa.js admin01'
].join('\n');

function main() {
  const arg = String(process.argv[2] || '').trim();
  if (!arg || arg === '--help' || arg === '-h') {
    console.log(USAGE);
    return;
  }

  const init = initAdminSchema(db);
  for (const w of init.warnings || []) console.warn('[reset-2fa] ' + w);

  if (arg === '--list') {
    const rows = db.prepare(
      'SELECT a.id, a.account, a.name, a.totp_enabled, a.totp_confirmed_at, r.key AS role_key' +
      ' FROM admin_accounts a LEFT JOIN admin_roles r ON r.id = a.role_id ORDER BY a.id'
    ).all();
    if (!rows.length) {
      console.log('还没有任何后台账号。');
      return;
    }
    console.log('ID\t账号\t姓名\t角色\t两步验证\t绑定时间');
    for (const r of rows) {
      const at = r.totp_confirmed_at ? new Date(r.totp_confirmed_at * 1000).toISOString().slice(0, 19).replace('T', ' ') : '—';
      console.log([r.id, r.account, r.name || '', r.role_key || '', r.totp_enabled ? '已启用' : '未绑定', at].join('\t'));
    }
    return;
  }

  const row = db.prepare(
    'SELECT a.*, r.key AS role_key FROM admin_accounts a LEFT JOIN admin_roles r ON r.id = a.role_id WHERE a.account = ?'
  ).get(arg);
  if (!row) {
    console.error('[reset-2fa] 找不到账号「' + arg + '」；先用 --list 看现有账号。');
    process.exitCode = 1;
    return;
  }

  const hadTotp = !!row.totp_enabled;
  const hadPending = !!row.totp_pending_secret;
  const at = now();
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE admin_accounts SET totp_secret = '', totp_enabled = 0, totp_confirmed_at = 0, totp_last_step = 0," +
      " totp_pending_secret = '', totp_pending_at = 0, failed_count = 0, locked_until = 0, updated_at = ? WHERE id = ?"
    ).run(at, row.id);
    db.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?').run(row.id);
    return revokeAdminSessions(row.id);
  });
  const revoked = tx();

  writeAdminLog({ ip: '127.0.0.1' }, {
    action: 'auth.2fa_reset',
    targetType: 'admin',
    targetId: row.id,
    adminId: 0,
    adminAccount: 'cli',
    roleKey: '',
    summary: '命令行重置管理员「' + row.account + '」的两步验证，撤销 ' + revoked + ' 个登录',
    detail: { before: { totpEnabled: hadTotp, pending: hadPending }, after: { totpEnabled: false }, via: 'scripts/reset-admin-2fa.js' }
  });

  console.log('[reset-2fa] 已重置账号「' + row.account + '」（' + (row.name || '') + '）');
  console.log('  两步验证：' + (hadTotp ? '已启用 → 未绑定' : (hadPending ? '待绑定 → 已清空' : '本来未绑定')));
  console.log('  恢复码：已全部删除');
  console.log('  已撤销会话：' + revoked + ' 个');
  console.log('  下次登录：重新扫码绑定（owner/admin 仍强制两步验证）。');
}

main();
