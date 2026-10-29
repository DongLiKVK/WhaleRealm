/**
 * 后台管理 · 权限目录 / 角色 / 管理员账号
 * 契约：docs/admin-api.md 第 2 节
 *
 * 为什么权限不进 JWT、角色改完立刻生效：
 * 后台是「小团队、改权限即刻生效」的场景。如果把权限烤进 token，改一次角色就得让
 * 所有人重新登录，还会出现「已经降权的人还能删数据」的窗口期。这里每个请求都回表
 * 算权限（admin_accounts → admin_roles），改完下一个请求就是新权限。
 *
 * 为什么 owner 要单独保护：
 * owner 是唯一能改角色/建号的角色。允许改自己的角色或删掉最后一个 owner，就等于
 * 给系统留了一个「自己把自己锁在门外」的按钮——线上真出过这种事，恢复只能改库。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const {
  PERMISSIONS,
  GROUPS,
  ALL_KEYS,
  requireAdmin,
  requirePermission,
  writeAdminLog,
  hashPassword,
  validPassword,
  validAccount,
  shapeRole,
  shapeAdmin,
  revokeAdminSessions,
  parsePermissions,
  paging,
  likeTerm,
  LIKE_ESC,
  orderBy,
  clip
} = require('../admin-guard');

const ADMIN_STATUS = ['active', 'disabled'];
const ROLE_SORTS = { id: 'id ASC' };
const ADMIN_SORTS = { new: 'a.created_at DESC, a.id DESC', old: 'a.created_at ASC, a.id ASC' };

const STMT = {
  roleById: db.prepare('SELECT * FROM admin_roles WHERE id = ?'),
  roleByKey: db.prepare('SELECT * FROM admin_roles WHERE key = ?'),
  roleMembers: db.prepare('SELECT COUNT(*) AS n FROM admin_accounts WHERE role_id = ?'),
  insertRole: db.prepare(
    'INSERT INTO admin_roles (key, name, description, permissions, builtin, created_at, updated_at)' +
    ' VALUES (?, ?, ?, ?, 0, ?, ?)'
  ),
  renameRoleKey: db.prepare('UPDATE admin_roles SET key = ? WHERE id = ?'),
  updateRole: db.prepare('UPDATE admin_roles SET name = ?, description = ?, permissions = ?, updated_at = ? WHERE id = ?'),
  deleteRole: db.prepare('DELETE FROM admin_roles WHERE id = ?'),
  adminById: db.prepare('SELECT * FROM admin_accounts WHERE id = ?'),
  adminByAccount: db.prepare('SELECT * FROM admin_accounts WHERE account = ?'),
  insertAdmin: db.prepare(
    'INSERT INTO admin_accounts (account, name, password_hash, role_id, status, created_at, updated_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  updateAdmin: db.prepare('UPDATE admin_accounts SET name = ?, role_id = ?, status = ?, updated_at = ? WHERE id = ?'),
  setPassword: db.prepare('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE id = ?'),
  deleteAdmin: db.prepare('DELETE FROM admin_accounts WHERE id = ?'),
  // 重置两步验证：清掉已绑定与待绑定的 secret，顺手解开因验证码错误造成的锁定
  clearTotp: db.prepare(
    "UPDATE admin_accounts SET totp_secret = '', totp_enabled = 0, totp_confirmed_at = 0, totp_last_step = 0," +
    " totp_pending_secret = '', totp_pending_at = 0, failed_count = 0, locked_until = 0, updated_at = ? WHERE id = ?"
  ),
  deleteRecovery: db.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?'),
  // 最后一个 owner 的判定：只统计 active 的 owner（停用的等于不在岗）
  ownerCount: db.prepare(
    "SELECT COUNT(*) AS n FROM admin_accounts a JOIN admin_roles r ON r.id = a.role_id" +
    " WHERE r.key = 'owner' AND a.status = 'active'"
  ),
  ownerCountExcept: db.prepare(
    "SELECT COUNT(*) AS n FROM admin_accounts a JOIN admin_roles r ON r.id = a.role_id" +
    " WHERE r.key = 'owner' AND a.status = 'active' AND a.id <> ?"
  )
};

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 权限数组清洗：只留目录里存在的 key，去重，并按目录顺序排（前端按钮顺序才稳定） */
function cleanPermissions(list) {
  if (!Array.isArray(list)) return null;
  const set = new Set(list.filter((k) => typeof k === 'string'));
  return ALL_KEYS.filter((k) => set.has(k));
}

function shapeAdminItem(row) {
  return {
    id: row.id,
    account: row.account,
    name: row.name || '',
    roleId: row.role_id,
    roleKey: row.role_key || '',
    roleName: row.role_name || '',
    status: row.status || 'active',
    lastLoginAt: row.last_login_at || 0,
    lastLoginIp: row.last_login_ip || '',
    totpEnabled: !!row.totp_enabled,
    totpConfirmedAt: row.totp_confirmed_at || 0,
    createdAt: row.created_at
  };
}

/** 这个账号是不是 owner 角色（用来做「最后一个 owner」保护） */
function isOwnerRole(roleId) {
  const role = STMT.roleById.get(roleId);
  return !!role && role.key === 'owner';
}

module.exports = async function adminRoleRoutes(fastify) {
  /** 权限目录：登录就能看（前端要按它渲染菜单/按钮），不含任何账号数据 */
  fastify.get('/permissions', { preHandler: requireAdmin }, async () => {
    const groups = GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      items: PERMISSIONS.filter((p) => p.group === g.key).map((p) => ({ key: p.key, label: p.label, desc: p.desc }))
    }));
    return { ok: true, data: { groups } };
  });

  fastify.get('/roles', { preHandler: requirePermission('role.view') }, async () => {
    const rows = db.prepare(
      'SELECT r.*, (SELECT COUNT(*) FROM admin_accounts a WHERE a.role_id = r.id) AS member_count' +
      ' FROM admin_roles r ORDER BY ' + ROLE_SORTS.id
    ).all();
    return { ok: true, data: { items: rows.map((r) => shapeRole(r, r.member_count)) } };
  });

  /** 新建角色。key 是给代码/日志看的稳定标识，由后端生成，不让用户填（避免 key 全角/重复/带空格） */
  fastify.post('/roles', { preHandler: requirePermission('role.manage') }, async (req, reply) => {
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 1 || name.length > 30) return bad(reply, '角色名称要 1~30 个字');
    let description = '';
    if (b.description !== undefined && b.description !== null) {
      if (typeof b.description !== 'string') return bad(reply, '描述必须是字符串');
      description = b.description.trim();
      if (description.length > 100) return bad(reply, '描述最多 100 个字');
    }
    const perms = cleanPermissions(b.permissions);
    if (!perms) return bad(reply, 'permissions 必须是数组');

    const at = now();
    let id = 0;
    db.transaction(() => {
      // 先插一个临时 key 拿到自增 id，再改成 role_<id>：key 有 UNIQUE 约束，不能插空
      const info = STMT.insertRole.run('tmp_' + Math.random().toString(36).slice(2, 10), name, description, JSON.stringify(perms), at, at);
      id = Number(info.lastInsertRowid);
      STMT.renameRoleKey.run('role_' + id, id);
    })();

    const role = shapeRole(STMT.roleById.get(id), 0);

    writeAdminLog(req, {
      action: 'role.create',
      targetType: 'role',
      targetId: id,
      summary: '新建角色「' + name + '」，包含 ' + perms.length + ' 项权限',
      detail: { before: null, after: { name, description, permissions: perms } }
    });

    return { ok: true, data: { role } };
  });

  /** 编辑角色（可部分更新）。owner 角色一律 403：它必须永远是全量权限 */
  fastify.put('/roles/:id', { preHandler: requirePermission('role.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个角色');
    const row = STMT.roleById.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个角色');
    if (row.key === 'owner') return fail(reply, 403, 'FORBIDDEN', { role: 'owner' }, '超级管理员的权限不能改');

    const b = req.body || {};
    let name = row.name;
    if (b.name !== undefined) {
      if (typeof b.name !== 'string') return bad(reply, '角色名称必须是字符串');
      name = b.name.trim();
      if (name.length < 1 || name.length > 30) return bad(reply, '角色名称要 1~30 个字');
    }
    let description = row.description || '';
    if (b.description !== undefined) {
      if (typeof b.description !== 'string') return bad(reply, '描述必须是字符串');
      description = b.description.trim();
      if (description.length > 100) return bad(reply, '描述最多 100 个字');
    }
    let perms = parsePermissions(row.permissions);
    if (b.permissions !== undefined) {
      const cleaned = cleanPermissions(b.permissions);
      if (!cleaned) return bad(reply, 'permissions 必须是数组');
      perms = cleaned;
    }

    STMT.updateRole.run(name, description, JSON.stringify(perms), now(), id);
    const role = shapeRole(STMT.roleById.get(id), STMT.roleMembers.get(id).n);

    writeAdminLog(req, {
      action: 'role.update',
      targetType: 'role',
      targetId: id,
      summary: '修改角色「' + row.name + '」：名称「' + name + '」，' + perms.length + ' 项权限',
      detail: {
        before: { name: row.name, description: row.description || '', permissions: parsePermissions(row.permissions) },
        after: { name, description, permissions: perms }
      }
    });

    return { ok: true, data: { role } };
  });

  /** 删除角色：内置角色、仍有人在用的角色都不能删（否则那些账号会失去权限来源） */
  fastify.delete('/roles/:id', { preHandler: requirePermission('role.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个角色');
    const row = STMT.roleById.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个角色');
    if (row.builtin) return fail(reply, 409, 'CONFLICT', null, '内置角色不能删除');
    const members = STMT.roleMembers.get(id).n;
    if (members > 0) return fail(reply, 409, 'CONFLICT', { memberCount: members }, '这个角色下还有 ' + members + ' 个管理员，先把他俩换成别的角色');

    STMT.deleteRole.run(id);

    writeAdminLog(req, {
      action: 'role.delete',
      targetType: 'role',
      targetId: id,
      summary: '删除角色「' + row.name + '」',
      detail: { before: { key: row.key, name: row.name, permissions: parsePermissions(row.permissions) }, after: null }
    });

    return { ok: true, data: {} };
  });

  /* ---------------- 管理员账号 ---------------- */

  fastify.get('/admins', { preHandler: requirePermission('admin.view') }, async (req, reply) => {
    const q0 = req.query || {};

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && ADMIN_STATUS.indexOf(status) < 0) return bad(reply, 'status 只能是 all、active、disabled');

    const sortKey = q0.sort == null || q0.sort === '' ? 'new' : String(q0.sort);
    if (!Object.prototype.hasOwnProperty.call(ADMIN_SORTS, sortKey)) return bad(reply, 'sort 只能是 new、old');

    const { page, pageSize, offset } = paging(q0);

    const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
    if (kw.length > 80) return bad(reply, '搜索词最多 80 个字');

    let roleId = 0;
    if (q0.roleId != null && q0.roleId !== '') {
      roleId = readId(q0.roleId);
      if (!roleId) return bad(reply, 'roleId 不对');
    }

    const parts = [];
    const params = [];
    if (kw) {
      const like = likeTerm(kw);
      parts.push('(a.account LIKE ? ' + LIKE_ESC + ' OR a.name LIKE ? ' + LIKE_ESC + ')');
      params.push(like, like);
    }
    if (roleId) { parts.push('a.role_id = ?'); params.push(roleId); }
    if (status !== 'all') { parts.push('a.status = ?'); params.push(status); }
    const where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';

    const total = db.prepare('SELECT COUNT(*) AS n FROM admin_accounts a' + where).get(...params).n;
    const rows = db.prepare(
      'SELECT a.*, r.key AS role_key, r.name AS role_name FROM admin_accounts a' +
      ' LEFT JOIN admin_roles r ON r.id = a.role_id' + where +
      ' ORDER BY ' + orderBy(ADMIN_SORTS, sortKey, 'new') + ' LIMIT ? OFFSET ?'
    ).all(...params, pageSize, offset);

    return { ok: true, data: { items: rows.map(shapeAdminItem), total, page, pageSize } };
  });

  /** 建号。account 用 UNIQUE NOCASE 兜底，这里再预查一次是为了给出中文提示而不是 500 */
  fastify.post('/admins', { preHandler: requirePermission('admin.manage') }, async (req, reply) => {
    const b = req.body || {};
    const account = typeof b.account === 'string' ? b.account.trim() : '';
    if (!validAccount(account)) return bad(reply, '账号要 3~32 位，只能用字母、数字、下划线、点和短横线');

    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 1 || name.length > 20) return bad(reply, '姓名要 1~20 个字');

    const password = typeof b.password === 'string' ? b.password : '';
    if (!validPassword(password)) return bad(reply, '密码要 8~64 位，并且同时包含字母和数字');

    const roleId = readId(b.roleId);
    if (!roleId) return bad(reply, 'roleId 不对');
    const role = STMT.roleById.get(roleId);
    if (!role) return bad(reply, '角色不存在');

    if (STMT.adminByAccount.get(account)) return fail(reply, 409, 'CONFLICT', null, '这个账号已经有人用了');

    const hash = await hashPassword(password);
    const at = now();
    let id = 0;
    try {
      const info = STMT.insertAdmin.run(account, name, hash, roleId, 'active', at, at);
      id = Number(info.lastInsertRowid);
    } catch (err) {
      if (String(err && err.message).indexOf('UNIQUE') >= 0) return fail(reply, 409, 'CONFLICT', null, '这个账号已经有人用了');
      throw err;
    }

    const row = db.prepare(
      'SELECT a.*, r.key AS role_key, r.name AS role_name FROM admin_accounts a' +
      ' LEFT JOIN admin_roles r ON r.id = a.role_id WHERE a.id = ?'
    ).get(id);

    writeAdminLog(req, {
      action: 'admin.create',
      targetType: 'admin',
      targetId: id,
      summary: '新建管理员「' + account + '」（' + name + '），角色「' + role.name + '」',
      detail: { before: null, after: { account, name, roleId, roleKey: role.key, status: 'active' } }
    });

    return { ok: true, data: { admin: shapeAdminItem(row) } };
  });

  /**
   * 改管理员：姓名 / 角色 / 状态。
   * 三条硬约束（契约）：不能改自己；不能把最后一个 active owner 降级或停用。
   */
  fastify.patch('/admins/:id', { preHandler: requirePermission('admin.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    const row = db.prepare(
      'SELECT a.*, r.key AS role_key FROM admin_accounts a LEFT JOIN admin_roles r ON r.id = a.role_id WHERE a.id = ?'
    ).get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');

    const self = id === req.admin.id;
    const b = req.body || {};

    let name = row.name || '';
    if (b.name !== undefined) {
      if (typeof b.name !== 'string') return bad(reply, '姓名必须是字符串');
      name = b.name.trim();
      if (name.length < 1 || name.length > 20) return bad(reply, '姓名要 1~20 个字');
    }

    let roleId = row.role_id;
    if (b.roleId !== undefined) {
      const next = readId(b.roleId);
      if (!next) return bad(reply, 'roleId 不对');
      const role = STMT.roleById.get(next);
      if (!role) return bad(reply, '角色不存在');
      if (self && next !== row.role_id) return fail(reply, 403, 'FORBIDDEN', null, '不能修改自己的角色');
      // 把 owner 降级 = 少一个 owner，必须确保还有别人
      if (row.role_key === 'owner' && role.key !== 'owner' && STMT.ownerCountExcept.get(id).n === 0) {
        return fail(reply, 409, 'CONFLICT', null, '这是最后一个超级管理员，不能降级');
      }
      roleId = next;
    }

    let status = row.status || 'active';
    if (b.status !== undefined) {
      if (typeof b.status !== 'string' || ADMIN_STATUS.indexOf(b.status) < 0) return bad(reply, 'status 只能是 active、disabled');
      if (self && b.status !== row.status) return fail(reply, 403, 'FORBIDDEN', null, '不能停用自己的账号');
      if (b.status === 'disabled' && row.role_key === 'owner' && STMT.ownerCountExcept.get(id).n === 0) {
        return fail(reply, 409, 'CONFLICT', null, '这是最后一个超级管理员，不能停用');
      }
      status = b.status;
    }

    const at = now();
    db.transaction(() => {
      STMT.updateAdmin.run(name, roleId, status, at, id);
      // 停用必须立刻把人踢下线，否则他手里的 token 还能用 8 小时
      if (status === 'disabled' && row.status !== 'disabled') revokeAdminSessions(id);
    })();

    const next = db.prepare(
      'SELECT a.*, r.key AS role_key, r.name AS role_name FROM admin_accounts a' +
      ' LEFT JOIN admin_roles r ON r.id = a.role_id WHERE a.id = ?'
    ).get(id);

    writeAdminLog(req, {
      action: 'admin.update',
      targetType: 'admin',
      targetId: id,
      summary: '修改管理员「' + row.account + '」：' + name + ' / 角色 ' + row.role_key + '→' + (next.role_key || '') + ' / ' + status,
      detail: {
        before: { name: row.name || '', roleId: row.role_id, roleKey: row.role_key || '', status: row.status || 'active' },
        after: { name, roleId, roleKey: next.role_key || '', status }
      }
    });

    return { ok: true, data: { admin: shapeAdminItem(next) } };
  });

  /** 重置密码：改完撤销该账号全部会话（他不知道旧密码也能被踢下线） */
  fastify.post('/admins/:id/reset-password', { preHandler: requirePermission('admin.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    const row = STMT.adminById.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');

    const b = req.body || {};
    const pw = typeof b.newPassword === 'string' ? b.newPassword : '';
    if (!validPassword(pw)) return bad(reply, '新密码要 8~64 位，并且同时包含字母和数字');

    const hash = await hashPassword(pw);
    db.transaction(() => {
      STMT.setPassword.run(hash, now(), id);
      revokeAdminSessions(id);
    })();

    writeAdminLog(req, {
      action: 'admin.reset_password',
      targetType: 'admin',
      targetId: id,
      summary: '重置管理员「' + row.account + '」的密码，该账号所有登录已失效',
      detail: { before: null, after: { account: row.account } }
    });

    return { ok: true, data: {} };
  });

  /**
   * 重置某个管理员的两步验证（设备丢失 / 换手机 / 恢复码也用完）。
   * 只清空 2FA 材料并撤销会话，不解锁任何人：对方下次登录会重新走绑定流程。
   * 不允许重置自己——自己没设备时进不了后台，应该用 scripts/reset-admin-2fa.js。
   */
  fastify.post('/admins/:id/reset-2fa', { preHandler: requirePermission('admin.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    const row = STMT.adminById.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    if (id === req.admin.id) {
      return fail(reply, 403, 'FORBIDDEN', null, '不能重置自己的两步验证，请用命令行脚本 reset-admin-2fa');
    }
    if (!row.totp_enabled && !row.totp_pending_secret) {
      return fail(reply, 409, 'CONFLICT', null, '这个账号还没有绑定两步验证');
    }

    const at = now();
    db.transaction(() => {
      STMT.clearTotp.run(at, id);
      STMT.deleteRecovery.run(id);
      // 认证强度被重置，旧会话必须立刻失效
      revokeAdminSessions(id);
    })();

    writeAdminLog(req, {
      action: 'auth.2fa_reset',
      targetType: 'admin',
      targetId: id,
      summary: '重置管理员「' + row.account + '」的两步验证，该账号所有登录已失效',
      detail: { before: { account: row.account, totpEnabled: !!row.totp_enabled }, after: { totpEnabled: false } }
    });

    return { ok: true, data: {} };
  });

  /** 删号：不能删自己；不能删最后一个 owner；会话随外键级联删除 */
  fastify.delete('/admins/:id', { preHandler: requirePermission('admin.manage') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    const row = db.prepare(
      'SELECT a.*, r.key AS role_key FROM admin_accounts a LEFT JOIN admin_roles r ON r.id = a.role_id WHERE a.id = ?'
    ).get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个管理员');
    if (id === req.admin.id) return fail(reply, 403, 'FORBIDDEN', null, '不能删除自己的账号');
    if (row.role_key === 'owner' && STMT.ownerCountExcept.get(id).n === 0) {
      return fail(reply, 409, 'CONFLICT', null, '这是最后一个超级管理员，不能删除');
    }

    STMT.deleteAdmin.run(id);

    writeAdminLog(req, {
      action: 'admin.delete',
      targetType: 'admin',
      targetId: id,
      summary: '删除管理员「' + row.account + '」（' + (row.name || '') + '）',
      detail: { before: { account: row.account, name: row.name || '', roleKey: row.role_key || '', status: row.status }, after: null }
    });

    return { ok: true, data: {} };
  });
};

module.exports.isOwnerRole = isOwnerRole;
