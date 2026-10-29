/**
 * 后台管理 · 身份与会话 + TOTP 两步验证
 * 契约：docs/admin-api.md 第 1 节（/auth/login /auth/logout /auth/me /auth/password /auth/2fa/*）
 *
 * 为什么登录失败要「先查账号、失败也跑一次 bcrypt」：
 * 如果账号不存在时立刻返回，攻击者用响应时间就能枚举出哪些账号真的存在。
 * 统一跑一次 bcrypt.compare，两条路耗时接近，「账号或密码不对」才真的不泄漏信息。
 *
 * 为什么锁定状态记在 admin_accounts 而不是内存：
 * 后台是单进程部署，但重启（部署 / 崩溃自愈）不能让攻击者的失败次数清零。
 *
 * 为什么两步验证拆成「密码换挑战令牌 → 再换会话」：
 * 密码正确只证明第一因子，此时不能下发可用的 admin cookie；挑战令牌是短命（10 分钟）、
 * scope='admin_2fa' 的 JWT，只能调用 /2fa/verify 或 /2fa/enable。它绑 UA，不能当会话用。
 */
'use strict';

const crypto = require('crypto');
const { db, now } = require('../db');
const { fail, rateLimitError } = require('../http');
const totp = require('../totp');
const {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  READY,
  hashPassword,
  verifyPassword,
  validPassword,
  createAdminSession,
  destroyAdminSession,
  loadAdmin,
  requireAdmin,
  requiresTwoFactor,
  writeAdminLog,
  sha256,
  clip,
  clientIp
} = require('../admin-guard');

const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;

/* 挑战令牌只活 10 分钟；用户从输密码到打开验证器、抄 6 位码，通常 1 分钟内。 */
const CHALLENGE_SECONDS = 10 * 60;
const CHALLENGE_SCOPE = 'admin_2fa';
const PENDING_SECONDS = 15 * 60;

/* 账号不存在时拿来「陪跑」的哈希。值本身没有意义，只要是一个合法的 bcrypt 串，
   compare 就会老老实实算满 10 轮，让失败路径的耗时与真实账号一致。 */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8QdQ0dQ0dQ0dQ0dQ0dQ0dQ0dQ0dQ';

const STMT = {
  byAccount: db.prepare('SELECT * FROM admin_accounts WHERE account = ?'),
  byId: db.prepare('SELECT * FROM admin_accounts WHERE id = ?'),
  failOnce: db.prepare(
    'UPDATE admin_accounts SET failed_count = failed_count + 1, locked_until = ?, updated_at = ? WHERE id = ?'
  ),
  lock: db.prepare('UPDATE admin_accounts SET failed_count = 0, locked_until = ?, updated_at = ? WHERE id = ?'),
  clearLock: db.prepare('UPDATE admin_accounts SET failed_count = 0, locked_until = 0, updated_at = ? WHERE id = ?'),
  loginOk: db.prepare(
    'UPDATE admin_accounts SET failed_count = 0, locked_until = 0, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?'
  ),
  setPassword: db.prepare('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE id = ?'),
  // 改密码要踢掉别的设备：只留当前这一条会话
  deleteOtherSessions: db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id <> ?'),
  deleteAllSessions: db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?'),
  // 扫码后、输码前的临时 secret（同样加密落库）
  setPending: db.prepare(
    'UPDATE admin_accounts SET totp_pending_secret = ?, totp_pending_at = ?, updated_at = ? WHERE id = ?'
  ),
  // 只有「还没启用」的行才能被启用；同时清掉 pending 和失败计数
  enableTotp: db.prepare(
    'UPDATE admin_accounts SET totp_secret = ?, totp_enabled = 1, totp_confirmed_at = ?, totp_last_step = ?,' +
    " totp_pending_secret = '', totp_pending_at = 0, failed_count = 0, locked_until = 0, updated_at = ?" +
    ' WHERE id = ? AND totp_enabled = 0'
  ),
  disableTotp: db.prepare(
    "UPDATE admin_accounts SET totp_secret = '', totp_enabled = 0, totp_confirmed_at = 0, totp_last_step = 0," +
    " totp_pending_secret = '', totp_pending_at = 0, updated_at = ? WHERE id = ?"
  ),
  // 原子推进时间步：WHERE totp_last_step < ? 保证并发/双击时只有一个请求能成功
  advanceStep: db.prepare(
    'UPDATE admin_accounts SET totp_last_step = ?, failed_count = 0, locked_until = 0, updated_at = ?' +
    ' WHERE id = ? AND totp_last_step < ?'
  ),
  insertRecovery: db.prepare(
    'INSERT INTO admin_recovery_codes (admin_id, code_hash, used_at, created_at) VALUES (?, ?, 0, ?)'
  ),
  deleteRecovery: db.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?'),
  recoveryByHash: db.prepare(
    'SELECT * FROM admin_recovery_codes WHERE admin_id = ? AND code_hash = ? AND used_at = 0'
  ),
  useRecovery: db.prepare('UPDATE admin_recovery_codes SET used_at = ? WHERE id = ? AND used_at = 0'),
  countRecovery: db.prepare('SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = ? AND used_at = 0')
};

const WRONG = '账号或密码不对';

/** 登录体：只取字符串，避免 body 里塞对象/数组把后续逻辑打穿 */
function readLogin(body) {
  const b = body || {};
  return {
    account: typeof b.account === 'string' ? b.account.trim() : '',
    password: typeof b.password === 'string' ? b.password : ''
  };
}

function readString(body, key) {
  const v = body && body[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * 挑战令牌绑 UA（不绑 IP）：手机从 Wi-Fi 切 4G 时 IP 会变，绑 IP 会让用户莫名失败；
 * UA 在一次登录过程中不会变。sha256 截断只作为「同一浏览器」的弱绑定，不是密钥。
 */
function uaBinding(req) {
  const ua = clip(req.headers && req.headers['user-agent'], 300);
  return sha256(ua).slice(0, 24);
}

function signChallenge(fastify, req, row, mode) {
  const at = now();
  const token = fastify.jwt.sign(
    {
      aid: row.id,
      scope: CHALLENGE_SCOPE,
      mode,
      ua: uaBinding(req),
      jti: crypto.randomBytes(8).toString('hex')
    },
    { expiresIn: CHALLENGE_SECONDS }
  );
  return { token, expiresAt: at + CHALLENGE_SECONDS };
}

/** 校验挑战令牌；失败一律 null，调用方统一回 CHALLENGE_INVALID */
function readChallenge(fastify, req, raw, mode) {
  if (typeof raw !== 'string' || !raw) return null;
  let p = null;
  try {
    p = fastify.jwt.verify(raw);
  } catch {
    return null;
  }
  if (!p || p.scope !== CHALLENGE_SCOPE) return null;
  if (p.mode !== mode) return null;
  if (!Number.isInteger(p.aid) || p.aid <= 0) return null;
  if (p.ua !== uaBinding(req)) return null;
  return p;
}

/** 锁定检查：返回 retryAfter 秒数；0 表示没锁 */
function lockLeft(row) {
  const left = Number(row && row.locked_until) - now();
  return left > 0 ? left : 0;
}

/** 两步验证失败：与密码失败共用 failed_count / locked_until 这一道闸 */
function fail2fa(req, reply, row, note, extra) {
  const at = now();
  const fails = Number(row.failed_count || 0) + 1;
  const shaped = loadAdmin(row.id) || {};
  if (fails >= MAX_FAILS) {
    STMT.lock.run(at + LOCK_SECONDS, at, row.id);
    writeAdminLog(req, {
      action: 'auth.2fa_fail',
      targetType: 'admin',
      targetId: row.id,
      adminId: row.id,
      adminAccount: row.account,
      roleKey: shaped.roleKey,
      summary: '两步验证失败：账号「' + row.account + '」连续 ' + MAX_FAILS + ' 次验证码错误，已锁定 15 分钟',
      result: 'fail',
      detail: Object.assign({ note: note || 'bad_code', lockedNow: true, retryAfter: LOCK_SECONDS }, extra || {})
    });
    return fail(reply, 423, 'LOCKED', { retryAfter: LOCK_SECONDS }, '两步验证码连续错误，账号已锁定 15 分钟');
  }

  STMT.failOnce.run(0, at, row.id);
  writeAdminLog(req, {
    action: 'auth.2fa_fail',
    targetType: 'admin',
    targetId: row.id,
    adminId: row.id,
    adminAccount: row.account,
    roleKey: shaped.roleKey,
    summary: '两步验证失败：账号「' + row.account + '」验证码错误（第 ' + fails + ' 次）',
    result: 'fail',
    detail: Object.assign({ note: note || 'bad_code', failedCount: fails }, extra || {})
  });
  return fail(reply, 401, 'BAD_2FA', { attemptsLeft: MAX_FAILS - fails });
}

/** 完成登录：写 last_login、建会话（带 amr）、写登录日志 */
function completeLogin(fastify, req, reply, row, amr, method) {
  const at = now();
  STMT.loginOk.run(at, clientIp(req), at, row.id);
  const admin = loadAdmin(row.id);
  const sess = createAdminSession(fastify, reply, req, admin, amr);
  writeAdminLog(req, {
    action: 'auth.login',
    targetType: 'admin',
    targetId: row.id,
    adminId: row.id,
    adminAccount: row.account,
    roleKey: admin.roleKey,
    summary: '管理员「' + (row.name || row.account) + '」登录后台',
    detail: { after: { lastLoginAt: at, ip: clientIp(req), method: method || 'password' } }
  });
  return { ok: true, data: { admin, expiresAt: sess.expiresAt } };
}

module.exports = async function adminAuthRoutes(fastify) {
  /**
   * 登录第一步：账号密码。公开接口 + 路由级限流（30 次 / 5 分钟 / IP）。
   * 账号级锁定与 IP 级限流是两道不同的闸：前者防「逮住一个账号暴力猜」，
   * 后者防「换账号广撒网」，只有一道都会漏。
   */
  fastify.post('/login', {
    config: {
      rateLimit: { max: 30, timeWindow: '5 minutes', errorResponseBuilder: rateLimitError }
    }
  }, async (req, reply) => {
    if (!READY()) return fail(reply, 500, 'INTERNAL', null, '后台数据表还没建好，先跑一次 seed-admin');

    const { account, password } = readLogin(req.body);
    if (!account || !password) return fail(reply, 400, 'BAD_REQUEST', null, '请填写账号和密码');
    if (account.length > 32 || password.length > 64) return fail(reply, 401, 'BAD_CREDENTIALS', null, WRONG);

    const at = now();
    const row = STMT.byAccount.get(account);

    // 已锁定：直接 423，并且照样写一条失败日志（运维排查「谁在猜密码」全靠它）
    if (row && Number(row.locked_until) > at) {
      writeAdminLog(req, {
        action: 'auth.login_fail',
        targetType: 'admin',
        targetId: row.id,
        summary: '登录失败：账号「' + account + '」处于锁定中',
        result: 'fail',
        adminAccount: account,
        detail: { note: 'locked', retryAfter: Number(row.locked_until) - at }
      });
      return fail(reply, 423, 'LOCKED', { retryAfter: Number(row.locked_until) - at });
    }

    const okPwd = await verifyPassword(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !okPwd) {
      if (!row) {
        writeAdminLog(req, {
          action: 'auth.login_fail',
          targetType: 'admin',
          targetId: 0,
          summary: '登录失败：账号「' + account + '」不存在',
          result: 'fail',
          adminAccount: account,
          detail: { note: 'unknown_account' }
        });
        return fail(reply, 401, 'BAD_CREDENTIALS', null, WRONG);
      }

      const fails = Number(row.failed_count || 0) + 1;
      if (fails >= MAX_FAILS) {
        // 第 5 次失败当场锁：客户端这一把就能拿到 retryAfter，不用再猜一次才知道被锁
        STMT.lock.run(at + LOCK_SECONDS, at, row.id);
        writeAdminLog(req, {
          action: 'auth.login_fail',
          targetType: 'admin',
          targetId: row.id,
          summary: '登录失败：账号「' + account + '」连续 ' + MAX_FAILS + ' 次密码错误，已锁定 15 分钟',
          result: 'fail',
          adminAccount: account,
          detail: { note: 'locked_now', retryAfter: LOCK_SECONDS }
        });
        return fail(reply, 423, 'LOCKED', { retryAfter: LOCK_SECONDS });
      }

      STMT.failOnce.run(0, at, row.id);
      writeAdminLog(req, {
        action: 'auth.login_fail',
        targetType: 'admin',
        targetId: row.id,
        summary: '登录失败：账号「' + account + '」密码错误（第 ' + fails + ' 次）',
        result: 'fail',
        adminAccount: account,
        detail: { note: 'bad_password', failedCount: fails }
      });
      return fail(reply, 401, 'BAD_CREDENTIALS', null, WRONG);
    }

    if (row.status !== 'active') {
      writeAdminLog(req, {
        action: 'auth.login_fail',
        targetType: 'admin',
        targetId: row.id,
        summary: '登录失败：账号「' + account + '」已停用',
        result: 'fail',
        adminAccount: account,
        detail: { note: 'disabled' }
      });
      return fail(reply, 403, 'FORBIDDEN', null, '这个管理员账号已停用');
    }

    const admin = loadAdmin(row.id);
    if (!admin) return fail(reply, 401, 'NOT_AUTHED', null, '请先登录后台');

    /* 角色强制（owner/admin）或本人已启用 2FA：密码只是第一因子 */
    if (requiresTwoFactor(admin)) {
      if (!row.totp_enabled) {
        /* 第一次绑定：生成 secret 存进 pending，把二维码和明文密钥返回给当前登录者。
           此时还没有下发 admin cookie；只有 /2fa/enable 验证 6 位码成功后才建会话。 */
        const secret = totp.randomSecret();
        STMT.setPending.run(totp.encryptSecret(secret), at, at, row.id);
        const uri = totp.otpauthUri(secret, row.account);
        const ch = signChallenge(fastify, req, row, 'enroll');
        writeAdminLog(req, {
          action: 'auth.2fa_enroll',
          targetType: 'admin',
          targetId: row.id,
          adminId: row.id,
          adminAccount: row.account,
          roleKey: admin.roleKey,
          summary: '管理员「' + (row.name || row.account) + '」开始绑定两步验证',
          detail: { note: 'secret_generated' }
        });
        return {
          ok: true,
          data: {
            twoFactorRequired: true,
            mode: 'enroll',
            challengeToken: ch.token,
            expiresAt: ch.expiresAt,
            account: row.account,
            enroll: { secret, otpauthUri: uri, qrSvg: totp.qrSvg(uri) }
          }
        };
      }

      const ch = signChallenge(fastify, req, row, 'verify');
      return {
        ok: true,
        data: {
          twoFactorRequired: true,
          mode: 'verify',
          challengeToken: ch.token,
          expiresAt: ch.expiresAt,
          account: row.account
        }
      };
    }

    return completeLogin(fastify, req, reply, row, ['pwd'], 'password');
  });

  /**
   * 登录第二步（已绑定）：6 位 TOTP 或一次性恢复码。
   * 10 分钟内可重试，验证码错误会累计到同一个 failed_count 并可能锁号。
   */
  fastify.post('/2fa/verify', {
    config: { rateLimit: { max: 30, timeWindow: '5 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    if (!READY()) return fail(reply, 500, 'INTERNAL', null, '后台数据表还没建好，先跑一次 seed-admin');
    const token = readString(req.body, 'challengeToken');
    const code = readString(req.body, 'code');
    if (!token || !code) return fail(reply, 400, 'BAD_REQUEST', null, '请填写 6 位验证码');

    const ch = readChallenge(fastify, req, token, 'verify');
    if (!ch) return fail(reply, 401, 'CHALLENGE_INVALID');
    const row = STMT.byId.get(ch.aid);
    if (!row) return fail(reply, 401, 'CHALLENGE_INVALID');
    if (row.status !== 'active') return fail(reply, 403, 'FORBIDDEN', null, '这个管理员账号已停用');
    const left = lockLeft(row);
    if (left) return fail(reply, 423, 'LOCKED', { retryAfter: left }, '账号已临时锁定，稍后再试');
    if (!row.totp_enabled || !row.totp_secret) return fail(reply, 401, 'CHALLENGE_INVALID');

    /* 恢复码是 8 位字母数字（带不带横线都行），与 6 位数字验证码不冲突 */
    if (totp.validRecoveryFormat(code) && !/^\d{6}$/.test(code)) {
      const hash = totp.hashRecovery(code);
      const rec = STMT.recoveryByHash.get(row.id, hash);
      if (!rec) return fail2fa(req, reply, row, 'recovery_bad');
      const used = STMT.useRecovery.run(now(), rec.id);
      if (!used.changes) return fail2fa(req, reply, row, 'recovery_used');
      const remaining = Number((STMT.countRecovery.get(row.id) || {}).n || 0);
      writeAdminLog(req, {
        action: 'auth.2fa_recovery',
        targetType: 'admin',
        targetId: row.id,
        adminId: row.id,
        adminAccount: row.account,
        roleKey: (loadAdmin(row.id) || {}).roleKey,
        summary: '管理员「' + (row.name || row.account) + '」使用恢复码登录',
        detail: { remaining }
      });
      const res = completeLogin(fastify, req, reply, row, ['pwd', 'totp'], 'recovery');
      res.data.usedRecovery = true;
      res.data.recoveryRemaining = remaining;
      return res;
    }

    if (!/^\d{6}$/.test(code)) return fail2fa(req, reply, row, 'format');
    let secret = '';
    try {
      secret = totp.decryptSecret(row.totp_secret);
    } catch (err) {
      writeAdminLog(req, {
        action: 'auth.2fa_fail',
        targetType: 'admin',
        targetId: row.id,
        adminId: row.id,
        adminAccount: row.account,
        summary: '两步验证失败：secret 无法解密，需要重置 2FA',
        result: 'fail',
        detail: { note: 'secret_broken', error: String(err && err.message).slice(0, 120) }
      });
      return fail(reply, 500, 'INTERNAL', null, '两步验证配置损坏，请联系超级管理员重置');
    }

    /* lastStep 防重放：同一个 30 秒窗口内的码只能用一次 */
    const v = totp.verifyTotp(secret, code, { lastStep: Number(row.totp_last_step || 0) });
    if (!v.ok) return fail2fa(req, reply, row, v.reason || 'mismatch');

    const at = now();
    const advanced = STMT.advanceStep.run(v.step, at, row.id, v.step);
    if (!advanced.changes) {
      return fail(reply, 409, 'CODE_REPLAY', null, '这个验证码刚刚已经用过了，等下一个 30 秒再试');
    }
    return completeLogin(fastify, req, reply, row, ['pwd', 'totp'], 'totp');
  });

  /**
   * 登录第二步（首次绑定）：验证当前 6 位码，启用 2FA、生成 8 个恢复码并直接建会话。
   * 恢复码只在这次响应里出现，刷新后无法再取；前端必须让用户明确保存。
   */
  fastify.post('/2fa/enable', {
    config: { rateLimit: { max: 30, timeWindow: '5 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    if (!READY()) return fail(reply, 500, 'INTERNAL', null, '后台数据表还没建好，先跑一次 seed-admin');
    const token = readString(req.body, 'challengeToken');
    const code = readString(req.body, 'code');
    if (!token || !code) return fail(reply, 400, 'BAD_REQUEST', null, '请填写 6 位验证码');

    const ch = readChallenge(fastify, req, token, 'enroll');
    if (!ch) return fail(reply, 401, 'CHALLENGE_INVALID');
    const row = STMT.byId.get(ch.aid);
    if (!row) return fail(reply, 401, 'CHALLENGE_INVALID');
    if (row.status !== 'active') return fail(reply, 403, 'FORBIDDEN', null, '这个管理员账号已停用');
    const left = lockLeft(row);
    if (left) return fail(reply, 423, 'LOCKED', { retryAfter: left }, '账号已临时锁定，稍后再试');
    if (row.totp_enabled) return fail(reply, 409, 'CONFLICT', null, '这个账号已经启用两步验证，请直接输码登录');
    if (!row.totp_pending_secret) return fail(reply, 401, 'CHALLENGE_INVALID');
    if (now() - Number(row.totp_pending_at || 0) > PENDING_SECONDS) {
      return fail(reply, 401, 'CHALLENGE_INVALID', null, '绑定二维码已过期，请重新登录获取');
    }
    if (!/^\d{6}$/.test(code)) return fail2fa(req, reply, row, 'format');

    let secret = '';
    try {
      secret = totp.decryptSecret(row.totp_pending_secret);
    } catch (err) {
      return fail(reply, 500, 'INTERNAL', null, '绑定信息损坏，请重新登录获取二维码');
    }
    const v = totp.verifyTotp(secret, code, { lastStep: 0 });
    if (!v.ok) return fail2fa(req, reply, row, v.reason || 'mismatch');

    const at = now();
    const codes = totp.generateRecoveryCodes(8);
    const tx = db.transaction(() => {
      const upd = STMT.enableTotp.run(totp.encryptSecret(secret), at, v.step, at, row.id);
      if (!upd.changes) throw new Error('TOTP_ALREADY_ENABLED');
      STMT.deleteRecovery.run(row.id);
      for (const c of codes) STMT.insertRecovery.run(row.id, c.hash, at);
      /* 启用 2FA 会提升账号的认证强度，顺手踢掉所有旧会话；当前这次登录随后会新建一条。 */
      STMT.deleteAllSessions.run(row.id);
    });
    try {
      tx();
    } catch (err) {
      if (String(err && err.message) === 'TOTP_ALREADY_ENABLED') {
        return fail(reply, 409, 'CONFLICT', null, '这个账号已经启用两步验证，请直接输码登录');
      }
      throw err;
    }

    const res = completeLogin(fastify, req, reply, row, ['pwd', 'totp'], 'enroll');
    writeAdminLog(req, {
      action: 'auth.2fa_enable',
      targetType: 'admin',
      targetId: row.id,
      adminId: row.id,
      adminAccount: row.account,
      roleKey: (res.data.admin || {}).roleKey,
      summary: '管理员「' + (row.name || row.account) + '」启用两步验证',
      detail: { recoveryCodes: codes.length }
    });
    res.data.recoveryCodes = codes.map((c) => c.plain);
    res.data.recoveryRemaining = codes.length;
    return res;
  });

  /** 退出：删会话行（JWT 还没过期也立刻失效），清 cookie，留痕 */
  fastify.post('/logout', { preHandler: requireAdmin }, async (req, reply) => {
    const admin = req.admin;
    writeAdminLog(req, {
      action: 'auth.logout',
      targetType: 'admin',
      targetId: admin.id,
      summary: '管理员「' + (admin.name || admin.account) + '」退出后台'
    });
    destroyAdminSession(req, reply);
    return { ok: true, data: {} };
  });

  /** 当前身份：前端刷新页面后靠它恢复菜单与权限，权限每次都是现算的 */
  fastify.get('/me', { preHandler: requireAdmin }, async (req) => {
    return { ok: true, data: { admin: req.admin } };
  });

  /** 当前账号的 2FA 状态（账号菜单 / 权限页展示用） */
  fastify.get('/2fa/status', { preHandler: requireAdmin }, async (req, reply) => {
    const row = STMT.byId.get(req.admin.id);
    if (!row) return fail(reply, 401, 'NOT_AUTHED', null, '请先登录后台');
    return {
      ok: true,
      data: {
        enabled: !!row.totp_enabled,
        required: requiresTwoFactor(req.admin),
        confirmedAt: row.totp_confirmed_at || 0,
        recoveryRemaining: Number((STMT.countRecovery.get(row.id) || {}).n || 0)
      }
    };
  });

  /**
   * 关闭两步验证。owner/admin 强制开启，不允许关；其余角色可选。
   * 需要密码 + 当前 TOTP 双确认，防止「会话被偷后一键关掉」。
   */
  fastify.post('/2fa/disable', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 20, timeWindow: '5 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const admin = req.admin;
    if (admin.roleKey === 'owner' || admin.roleKey === 'admin') {
      return fail(reply, 403, 'FORBIDDEN', null, '超级管理员与管理员必须保留两步验证，不能关闭');
    }
    const row = STMT.byId.get(admin.id);
    if (!row || !row.totp_enabled) return fail(reply, 400, 'BAD_REQUEST', null, '当前账号还没有启用两步验证');
    const password = readString(req.body, 'password');
    const code = readString(req.body, 'code');
    if (!password || !code) return fail(reply, 400, 'BAD_REQUEST', null, '请输入登录密码和当前验证码');
    if (!(await verifyPassword(password, row.password_hash))) {
      return fail(reply, 400, 'BAD_CREDENTIALS', null, '登录密码不对');
    }
    let secret = '';
    try {
      secret = totp.decryptSecret(row.totp_secret);
    } catch {
      return fail(reply, 500, 'INTERNAL', null, '两步验证配置损坏，请联系超级管理员重置');
    }
    const v = totp.verifyTotp(secret, code, { lastStep: 0 });
    if (!v.ok) return fail2fa(req, reply, row, 'disable_' + (v.reason || 'mismatch'));

    const at = now();
    const tx = db.transaction(() => {
      STMT.disableTotp.run(at, row.id);
      STMT.deleteRecovery.run(row.id);
      STMT.deleteOtherSessions.run(row.id, req.adminSession ? req.adminSession.id : '');
    });
    tx();
    writeAdminLog(req, {
      action: 'auth.2fa_disable',
      targetType: 'admin',
      targetId: row.id,
      summary: '管理员「' + (row.name || row.account) + '」关闭两步验证',
      detail: { note: '其它设备会话已撤销' }
    });
    return { ok: true, data: { enabled: false } };
  });

  /**
   * 重新生成恢复码：旧码立即全部作废。
   * 同样要求密码 + 当前 TOTP；这里不推进 last_step，因为 step-up 不是新建会话。
   */
  fastify.post('/2fa/recovery-codes', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 20, timeWindow: '5 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const row = STMT.byId.get(req.admin.id);
    if (!row || !row.totp_enabled) return fail(reply, 400, 'BAD_REQUEST', null, '当前账号还没有启用两步验证');
    const password = readString(req.body, 'password');
    const code = readString(req.body, 'code');
    if (!password || !code) return fail(reply, 400, 'BAD_REQUEST', null, '请输入登录密码和当前验证码');
    if (!(await verifyPassword(password, row.password_hash))) {
      return fail(reply, 400, 'BAD_CREDENTIALS', null, '登录密码不对');
    }
    let secret = '';
    try {
      secret = totp.decryptSecret(row.totp_secret);
    } catch {
      return fail(reply, 500, 'INTERNAL', null, '两步验证配置损坏，请联系超级管理员重置');
    }
    const v = totp.verifyTotp(secret, code, { lastStep: 0 });
    if (!v.ok) return fail2fa(req, reply, row, 'recovery_regen_' + (v.reason || 'mismatch'));

    const at = now();
    const codes = totp.generateRecoveryCodes(8);
    const tx = db.transaction(() => {
      STMT.deleteRecovery.run(row.id);
      for (const c of codes) STMT.insertRecovery.run(row.id, c.hash, at);
    });
    tx();
    writeAdminLog(req, {
      action: 'auth.2fa_recovery_codes',
      targetType: 'admin',
      targetId: row.id,
      summary: '管理员「' + (row.name || row.account) + '」重新生成恢复码',
      detail: { count: codes.length }
    });
    return { ok: true, data: { recoveryCodes: codes.map((c) => c.plain), recoveryRemaining: codes.length } };
  });

  /**
   * 改密码。成功后撤销「其它」会话：密码泄漏的场景下，攻击者手里的旧会话必须
   * 一起死掉，但当前这台设备不该被自己踢出去。
   */
  fastify.post('/password', { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body || {};
    const oldPassword = typeof b.oldPassword === 'string' ? b.oldPassword : '';
    const newPassword = typeof b.newPassword === 'string' ? b.newPassword : '';
    if (!oldPassword || !newPassword) return fail(reply, 400, 'BAD_REQUEST', null, '请填写原密码和新密码');
    if (!validPassword(newPassword)) {
      return fail(reply, 400, 'WEAK_PASSWORD', null, '新密码要 8~64 位，并且同时包含字母和数字');
    }

    const row = STMT.byId.get(req.admin.id);
    if (!row) return fail(reply, 401, 'NOT_AUTHED', null, '请先登录后台');
    const okOld = await verifyPassword(oldPassword, row.password_hash);
    if (!okOld) return fail(reply, 400, 'BAD_CREDENTIALS', null, '原密码不对');

    const hash = await hashPassword(newPassword);
    const at = now();
    const tx = db.transaction(() => {
      STMT.setPassword.run(hash, at, row.id);
      STMT.deleteOtherSessions.run(row.id, req.adminSession ? req.adminSession.id : '');
    });
    tx();

    writeAdminLog(req, {
      action: 'auth.password',
      targetType: 'admin',
      targetId: row.id,
      summary: '管理员「' + (row.name || row.account) + '」修改了后台密码',
      detail: { note: '其它设备会话已撤销' }
    });

    return { ok: true, data: {} };
  });
};

module.exports.ADMIN_COOKIE = ADMIN_COOKIE;
module.exports.SESSION_SECONDS = SESSION_SECONDS;
module.exports.MAX_FAILS = MAX_FAILS;
module.exports.LOCK_SECONDS = LOCK_SECONDS;
module.exports.CHALLENGE_SECONDS = CHALLENGE_SECONDS;
