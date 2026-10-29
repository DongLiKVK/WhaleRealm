/**
 * 后台管理 · 共用基建（会话 / 权限 / 审计 / 形状）
 * 契约：docs/admin-api.md 第 0~2 节
 *
 * 设计要点（为什么这样，而不是别处）：
 * 1. 权限不进 JWT：契约要求「角色改完下一次请求立即生效」。所以每个请求都做
 *    admin_accounts → admin_roles 两次回表，token 里只放 aid / sid / scope。
 * 2. scope 必须校验：@fastify/jwt 与前台共用密钥，站点用户签出来的 token 能被验签通过，
 *    没有 scope:'admin' 这一关，前台用户就能直接调后台接口。
 * 3. 会话回表校验 token_hash：JWT 本身不可撤销，删 admin_sessions 行才是真正的踢下线。
 * 4. 写操作日志失败只 warn：审计是旁路，不能让「日志表写不进去」把已经生效的业务变成 500。
 */
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { db, now } = require('./db');
const { fail } = require('./http');
const { PERMISSIONS, GROUPS, ALL_KEYS, normalizePermissions } = require('./admin-db');

/* ---------- 常量 ---------- */
const ADMIN_COOKIE = 'whale_admin_token';
const SESSION_SECONDS = 8 * 3600;      // 契约：Max-Age 28800
const BCRYPT_ROUNDS = 10;
/* SITE_ORIGIN 是 https 时才加 Secure。本地 http 调试若带上 Secure，浏览器会直接丢掉
   cookie，表现为「登录成功但下一次请求又 401」—— 这是最容易踩且最难查的一脚。 */
const SECURE_COOKIE = /^https:\/\//i.test(String(process.env.SITE_ORIGIN || ''));

/* 动作名 → 中文（契约第 6 节，前端只显示 actionLabel，不自己翻译） */
const ACTION_LABELS = {
  'auth.login': '登录',
  'auth.login_fail': '登录失败',
  'auth.logout': '退出登录',
  'auth.password': '修改密码',
  'auth.2fa_enroll': '生成绑定二维码',
  'auth.2fa_fail': '两步验证失败',
  'auth.2fa_recovery_codes': '重新生成恢复码',
  'auth.2fa_enable': '启用两步验证',
  'auth.2fa_disable': '关闭两步验证',
  'auth.2fa_recovery': '使用恢复码登录',
  'auth.2fa_reset': '重置两步验证',
  'post.edit': '编辑帖子',
  'post.review': '审核帖子',
  'post.delete': '删除帖子',
  'post.batch_review': '批量审核',
  'post.batch_delete': '批量删除',
  'plugin.review': '审核插件',
  'plugin.batch_review': '批量审核插件',
  'report.handle': '处理举报',
  'report.hide_target': '下架被举报对象',
  'user.edit': '编辑用户',
  'user.disable': '禁用用户',
  'user.enable': '启用用户',
  'user.delete': '删除用户',
  'reward.grant': '发放奖励',
  'reward.frame': '更换头像框',
  'reward.revoke': '撤回奖励',
  'role.create': '新建角色',
  'role.update': '修改角色',
  'role.delete': '删除角色',
  'admin.create': '新建管理员',
  'admin.update': '修改管理员',
  'admin.reset_password': '重置密码',
  'admin.delete': '删除管理员'
};
const ACTION_KEYS = Object.keys(ACTION_LABELS);

const REWARD_TYPES = { points: '积分', days: '会员天数', frame: '头像框', custom: '自定义' };

/* 头像框目录（后台唯一事实来源；站点 js/avatar-frame.js 的绘制键必须与这里对齐）。
   为什么后台也要有一份名字：发放历史里「maw-3」对运营没有意义，
   台账要能直接读出「赤金 Lv3」。键刻意不改 —— 老记录存的也是这些键。 */
const FRAMES = [
  { key: 'auto', name: '跟随会员档位', short: '跟随档位', level: 0, tier: '' },
  { key: 'maw-1', name: '血契 · 冷钢', short: '冷钢 Lv1', level: 1, tier: 'diamond' },
  { key: 'maw-2', name: '裂颚 · 紫铜', short: '紫铜 Lv2', level: 2, tier: 'master' },
  { key: 'maw-3', name: '屠场 · 赤金', short: '赤金 Lv3', level: 3, tier: 'grandmaster' },
  { key: 'maw-4', name: '猎杀 · 血铁', short: '血铁 Lv4', level: 4, tier: 'hunt' },
  { key: 'none', name: '不戴头像框', short: '不戴', level: 0, tier: '' }
];
const FRAME_BY_KEY = FRAMES.reduce((m, f) => { m[f.key] = f; return m; }, {});

/* 与 server/src/routes/membership.js 的 TIERS 同名同序；后台只读名字，不重复定价。 */
const TIER_NAMES = { diamond: '钻石', master: '大师', grandmaster: '宗师', hunt: '猎杀' };

function frameName(key, short) {
  const f = FRAME_BY_KEY[key];
  if (!f) return key || '';
  return short ? f.short : f.name;
}

/* ---------- 预编译语句 ----------
   后台表有可能没建起来（db.js 那边只 warn 不阻断启动）。这里整体包 try/catch：
   失败时 READY=false，后台路由统一回 500，而不是让 require 阶段把整个进程带走。 */
const STMT = {};
let READY = false;

function prepareAll() {
  try {
    STMT.adminById = db.prepare('SELECT * FROM admin_accounts WHERE id = ?');
    STMT.roleById = db.prepare('SELECT * FROM admin_roles WHERE id = ?');
    STMT.sessionById = db.prepare('SELECT * FROM admin_sessions WHERE id = ?');
    STMT.insertSession = db.prepare(
      'INSERT INTO admin_sessions (id, admin_id, token_hash, ua, ip, expires_at, created_at)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    STMT.deleteSessionById = db.prepare('DELETE FROM admin_sessions WHERE id = ?');
    STMT.deleteSessionByHash = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
    STMT.deleteSessionsByAdmin = db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?');
    STMT.deleteExpired = db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?');
    STMT.insertLog = db.prepare(
      'INSERT INTO admin_logs (admin_id, admin_name, role_key, action, target_type, target_id,' +
      ' summary, detail, result, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    READY = true;
  } catch (err) {
    READY = false;
    console.warn('[admin] 后台数据表不可用（后台接口将返回 500，先跑 node scripts/seed-admin.js）：' + (err && err.message));
  }
}
prepareAll();

/* ---------- 基础小工具 ---------- */

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

/** 定长比较：token_hash 是唯一凭据，别用 === 泄漏时序 */
function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

function clip(v, max) {
  const s = String(v == null ? '' : v);
  return s.length > max ? s.slice(0, max) : s;
}

function clientIp(req) {
  const s = req && (req.ip || (req.socket && req.socket.remoteAddress) || '');
  return clip(s, 64);
}

function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash || typeof hash !== 'string') return false;
  try {
    return await bcrypt.compare(String(plain), hash);
  } catch {
    return false;
  }
}

/** 密码策略：8~64 位且至少一个字母 + 一个数字（契约第 1 节） */
function validPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < 8 || pw.length > 64) return false;
  return /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

/** 登录账号：3~32 位字母数字下划线点短横线（契约「管理员账号」约束） */
const ACCOUNT_RE = /^[A-Za-z0-9_.-]{3,32}$/;
function validAccount(s) {
  return typeof s === 'string' && ACCOUNT_RE.test(s);
}

/** 邮箱打码：前 2 位 + *** + @域名。后台列表、奖励列表、日志都只给这个形态 */
function maskEmail(email) {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at <= 0) return s ? s.slice(0, 1) + '***' : '';
  return s.slice(0, 2) + '***' + s.slice(at);
}

/* ---------- 时间 / 分页 / LIKE / CSV ---------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 本地时区 YYYY-MM-DD（后台所有日期都按服务器本地时区展示，与 series 口径一致） */
function formatDate(tsv) {
  const d = new Date(tsv * 1000);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function formatDateTime(tsv) {
  if (!tsv) return '';
  const d = new Date(tsv * 1000);
  return formatDate(tsv) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/** CSV 文件名用的 YYYYMMDD */
function ymd(tsv) {
  const d = new Date(tsv * 1000);
  return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

function startOfDay(tsv) {
  const d = new Date(tsv * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function toPositiveInt(v, def) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.floor(n);
  return i > 0 ? i : def;
}

/** 分页参数：非法值一律夹到合法区间，不 400 —— 列表页翻页时地址栏被手改不应整页报错 */
function paging(query) {
  const q = query || {};
  const page = toPositiveInt(q.page, 1);
  const pageSize = Math.min(100, toPositiveInt(q.pageSize, 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** LIKE 转义：% _ \ 三个都要转，转完必须配合 ESCAPE '\' 使用，否则反斜杠又成了普通字符 */
function likeEscape(s) {
  return String(s == null ? '' : s).replace(/[\\%_]/g, (m) => '\\' + m);
}

function likeTerm(q) {
  return '%' + likeEscape(q) + '%';
}

const LIKE_ESC = "ESCAPE '\\'";

/** 时间筛选：空 → {state:'empty'}；非法 → {state:'bad'}；合法 → {state:'ok',value} */
function parseTime(v, endOfDay) {
  if (v == null || v === '') return { state: 'empty', value: 0 };
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return { state: 'ok', value: Number(s) };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { state: 'bad', value: 0 };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return { state: 'bad', value: 0 };
  const base = Math.floor(d.getTime() / 1000);
  return { state: 'ok', value: endOfDay ? base + 86399 : base };
}

/** 排序白名单：把 query 里的 sort 映射成整段 ORDER BY，绝不把用户输入拼进 SQL */
function orderBy(map, key, defKey) {
  const k = Object.prototype.hasOwnProperty.call(map, key) ? key : defKey;
  return map[k];
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** CSV 响应：UTF-8 BOM（Excel 才认得中文）+ CRLF（RFC 4180）+ 附件名 */
function sendCsv(reply, filename, rows) {
  const body = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', 'attachment; filename="' + filename + '"');
  reply.header('Cache-Control', 'no-store');
  return reply.send(body);
}

/** 批量 IN 查询的占位符（只拼 '?' 个数，不拼值） */
function marks(n) {
  return new Array(n).fill('?').join(',');
}

/* ---------- 形状 ---------- */

function parsePermissions(text) {
  let list = [];
  try {
    list = JSON.parse(text || '[]');
  } catch {
    list = [];
  }
  return normalizePermissions(list);
}

function shapeRole(row, memberCount) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    permissions: parsePermissions(row.permissions),
    builtin: !!row.builtin,
    memberCount: Number(memberCount) || 0,
    createdAt: row.created_at
  };
}

function shapeAdmin(row, role) {
  return {
    id: row.id,
    account: row.account,
    name: row.name || '',
    roleId: row.role_id,
    roleKey: role ? role.key : '',
    roleName: role ? role.name : '',
    permissions: role ? parsePermissions(role.permissions) : [],
    status: row.status || 'active',
    totpEnabled: !!row.totp_enabled,
    totpConfirmedAt: row.totp_confirmed_at || 0,
    /* owner / admin 是强制 2FA 的角色；其余角色一旦自己启用，也同样要求。
       前端用这个字段决定登录后进「扫码绑定」还是「输 6 位码」。 */
    twoFactorRequired: (role ? (role.key === 'owner' || role.key === 'admin') : false) || !!row.totp_enabled,
    lastLoginAt: row.last_login_at || 0,
    lastLoginIp: row.last_login_ip || '',
    createdAt: row.created_at
  };
}

function loadAdmin(id) {
  if (!READY) return null;
  const row = STMT.adminById.get(id);
  if (!row) return null;
  return shapeAdmin(row, STMT.roleById.get(row.role_id));
}

function shapeLog(row) {
  const action = row.action || '';
  return {
    id: row.id,
    adminId: row.admin_id,
    adminName: row.admin_name || '',
    roleKey: row.role_key || '',
    action,
    actionLabel: ACTION_LABELS[action] || action,
    targetType: row.target_type || '',
    targetId: row.target_id,
    summary: row.summary || '',
    result: row.result || 'ok',
    ip: row.ip || '',
    createdAt: row.created_at
  };
}

/** 批量取用户 / 管理员，避免列表页 N+1（20 行 × 2 张表 = 40 次查询，页面会明显卡） */
function usersByIds(ids) {
  const out = new Map();
  const list = Array.from(new Set((ids || []).filter((n) => Number.isInteger(n) && n > 0)));
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const rows = db.prepare('SELECT * FROM users WHERE id IN (' + marks(chunk.length) + ')').all(...chunk);
    for (const row of rows) out.set(row.id, row);
  }
  return out;
}

function adminsByIds(ids) {
  const out = new Map();
  const list = Array.from(new Set((ids || []).filter((n) => Number.isInteger(n) && n > 0)));
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const rows = db.prepare('SELECT id, account, name FROM admin_accounts WHERE id IN (' + marks(chunk.length) + ')').all(...chunk);
    for (const row of rows) out.set(row.id, row);
  }
  return out;
}

/** 奖励行 → 契约第 5 节的 item（批量补用户与发放人，避免 N+1） */
function shapeRewardRows(rows) {
  if (!rows || !rows.length) return [];
  const users = usersByIds(rows.map((r) => r.user_id));
  const admins = adminsByIds(rows.flatMap((r) => [r.granted_by, r.revoked_by]));
  return rows.map((r) => {
    const u = users.get(r.user_id);
    const by = admins.get(r.granted_by);
    const rev = admins.get(r.revoked_by);
    return {
      id: r.id,
      userId: r.user_id,
      user: u
        ? { id: u.id, name: u.name || '', email: maskEmail(u.email), avatar: u.avatar || '' }
        : { id: r.user_id, name: '已注销用户', email: '', avatar: '' },
      type: r.type,
      typeLabel: REWARD_TYPES[r.type] || r.type,
      amount: r.amount,
      /* 会员档位 / 头像框快照：老记录没有这两列的值，回空串让前端回退到旧文案 */
      tier: r.tier || '',
      tierLabel: r.tier ? (TIER_NAMES[r.tier] || r.tier) : '',
      frame: r.frame || '',
      frameLabel: r.frame ? frameName(r.frame, false) : '',
      frameShort: r.frame ? frameName(r.frame, true) : '',
      prevFrame: r.prev_frame || '',
      reason: r.reason || '',
      note: r.note || '',
      status: r.status,
      grantedBy: by ? { id: by.id, name: by.name || by.account } : null,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at || 0,
      revokedBy: rev ? { id: rev.id, name: rev.name || rev.account } : null,
      revokedReason: r.revoked_reason || ''
    };
  });
}

/* ---------- 会话 ---------- */

function readAdminToken(req) {
  if (!req) return null;
  if (req.cookies && req.cookies[ADMIN_COOKIE]) return req.cookies[ADMIN_COOKIE];
  const h = req.headers && req.headers.authorization;
  if (h && String(h).startsWith('Bearer ')) return String(h).slice(7);
  return null;
}

function setAdminCookie(reply, token) {
  reply.setCookie(ADMIN_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_SECONDS,
    secure: SECURE_COOKIE
  });
}

function clearAdminCookie(reply) {
  reply.clearCookie(ADMIN_COOKIE, { path: '/' });
}

function createAdminSession(fastify, reply, req, admin, amr) {
  const at = now();
  const sid = crypto.randomBytes(24).toString('hex');
  /* amr（authentication methods references）记录这次登录实际过了哪些关：
     ['pwd'] 只有密码，['pwd','totp'] 还过了 TOTP。
     不把权限放进 JWT，但「是否过了 2FA」必须放进 JWT —— 它描述的是这次认证事件，
     而不是可变的角色权限；否则 8 小时内的旧会话无法与刚登录的会话区分。 */
  const methods = Array.isArray(amr) ? amr.filter((m) => m === 'pwd' || m === 'totp') : ['pwd'];
  const token = fastify.jwt.sign({ aid: admin.id, sid, scope: 'admin', amr: methods }, { expiresIn: SESSION_SECONDS });
  const expiresAt = at + SESSION_SECONDS;
  // 顺手清理过期行：后台登录次数极少，一次 DELETE 就能让会话表永远保持个位数
  STMT.deleteExpired.run(at);
  STMT.insertSession.run(
    sid,
    admin.id,
    sha256(token),
    clip(req.headers && req.headers['user-agent'], 300),
    clientIp(req),
    expiresAt,
    at
  );
  setAdminCookie(reply, token);
  return { sid, token, expiresAt };
}

/**
 * 从请求解析后台身份：cookie → JWT 验签 → scope → 会话行 → 过期 → token_hash → 账号状态。
 * 任何一步不满足都回 null（不抛异常，也不写响应）。
 */
function adminFromRequest(req) {
  if (!req || !READY) return null;
  const token = readAdminToken(req);
  if (!token) return null;

  let payload = null;
  try {
    payload = req.server.jwt.verify(token);
  } catch {
    return null;
  }
  if (!payload || payload.scope !== 'admin') return null;

  const sid = typeof payload.sid === 'string' ? payload.sid : '';
  if (!/^[0-9a-f]{48}$/.test(sid)) return null;

  const s = STMT.sessionById.get(sid);
  if (!s) return null;                                   // 行被删 = 立即失效
  if (Number(s.admin_id) !== Number(payload.aid)) return null;
  if (Number(s.expires_at) <= now()) {
    STMT.deleteSessionById.run(sid);
    return null;
  }
  if (!sameHash(s.token_hash, sha256(token))) return null;

  const admin = loadAdmin(s.admin_id);
  if (!admin) return null;
  if (admin.status !== 'active') {
    // 停用账号时已经删过会话；这里再兜一次，防止手工改库留下的「停用但在线」
    STMT.deleteSessionsByAdmin.run(admin.id);
    return null;
  }

  /* 强制 2FA 的账号（owner/admin，或自己启用过 2FA 的人）必须持有一张
     amr 含 totp 的会话。旧版本签出的 token 没有 amr，角色一旦被提升到 owner/admin，
     下一次请求就会在这里失效并被迫重新登录 —— 这正是「提权不能继承旧认证强度」的意思。 */
  if (requiresTwoFactor(admin)) {
    const amr = Array.isArray(payload.amr) ? payload.amr : [];
    if (!admin.totpEnabled || amr.indexOf('totp') < 0) {
      STMT.deleteSessionById.run(sid);
      return null;
    }
  }

  req.admin = admin;
  req.adminSession = s;
  return admin;
}

/** 这个账号是否必须走两步验证（角色强制或本人已启用） */
function requiresTwoFactor(admin) {
  if (!admin) return false;
  return admin.roleKey === 'owner' || admin.roleKey === 'admin' || !!admin.totpEnabled;
}

function destroyAdminSession(req, reply) {
  const token = readAdminToken(req);
  if (token && READY) {
    try { STMT.deleteSessionByHash.run(sha256(token)); } catch { /* 删不掉也要把 cookie 清掉 */ }
  }
  const sid = req && req.adminSession ? req.adminSession.id : '';
  if (sid && READY) {
    try { STMT.deleteSessionById.run(sid); } catch { /* 同上 */ }
  }
  if (reply) clearAdminCookie(reply);
}

/** 撤销某个后台账号的全部会话（停用 / 删号 / 重置密码时用） */
function revokeAdminSessions(adminId) {
  if (!READY || !adminId) return 0;
  return STMT.deleteSessionsByAdmin.run(adminId).changes;
}

/* ---------- 权限 ---------- */

function adminCan(admin, key) {
  if (!admin || !Array.isArray(admin.permissions)) return false;
  return admin.permissions.indexOf(key) >= 0;
}

/** 只要求登录（/auth/me、/auth/logout、/permissions 用它） */
async function requireAdmin(req, reply) {
  if (!READY) return fail(reply, 500, 'INTERNAL', null, '后台数据表还没建好，先跑一次 seed-admin');
  const admin = adminFromRequest(req);
  if (!admin) return fail(reply, 401, 'NOT_AUTHED', null, '请先登录后台');
  return undefined;
}

/**
 * preHandler 工厂：登录 + 单项权限。
 * 权限在 preHandler 里判而不是 handler 里判，是为了「新加接口时不可能忘记挂」——
 * 挂 route 时看得到 requirePermission('xxx')，漏了会很明显。
 */
function requirePermission(key) {
  return async function guard(req, reply) {
    if (!READY) return fail(reply, 500, 'INTERNAL', null, '后台数据表还没建好，先跑一次 seed-admin');
    const admin = adminFromRequest(req);
    if (!admin) return fail(reply, 401, 'NOT_AUTHED', null, '请先登录后台');
    if (!adminCan(admin, key)) {
      return fail(reply, 403, 'FORBIDDEN', { need: key }, '当前角色没有这个操作的权限');
    }
    return undefined;
  };
}

/* ---------- 审计 ---------- */

/**
 * 写一条操作日志。无论成功失败都不抛 —— 业务已经落库了，日志表出问题只能留痕，
 * 不能把 200 变 500（契约第 0 节明确要求）。
 * opt: { action, targetType, targetId, summary, result:'ok'|'fail', detail:{before,after,note},
 *        adminId?, adminAccount?, roleKey? }
 * roleKey 只在登录成功那一刻需要传：那时 req.admin 还没挂上（会话刚建、中间件还没跑过），
 * 不传的话日志里的「角色」列是空的，事后翻日志分不清是哪类管理员干的。
 */
function writeAdminLog(req, opt) {
  const o = opt || {};
  if (!READY) return;
  try {
    const admin = req && req.admin ? req.admin : null;
    STMT.insertLog.run(
      admin ? admin.id : Number(o.adminId) || 0,
      clip(admin ? admin.account : (o.adminAccount || ''), 64),
      clip(admin ? admin.roleKey || '' : (o.roleKey || ''), 32),
      clip(o.action || '', 40),
      clip(o.targetType || '', 20),
      Number(o.targetId) || 0,
      clip(o.summary || '', 300),
      o.detail == null ? '' : clip(JSON.stringify(o.detail), 8000),
      o.result === 'fail' ? 'fail' : 'ok',
      clientIp(req),
      now()
    );
  } catch (err) {
    console.warn('[admin] 写操作日志失败（业务已生效）: ' + (err && err.message));
  }
}

module.exports = {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  SECURE_COOKIE,
  READY: () => READY,
  // 权限目录（admin-db 是唯一来源，这里转出给路由用）
  PERMISSIONS,
  GROUPS,
  ALL_KEYS,
  ACTION_LABELS,
  ACTION_KEYS,
  REWARD_TYPES,
  FRAMES,
  FRAME_BY_KEY,
  frameName,
  TIER_NAMES,
  // 密码
  hashPassword,
  verifyPassword,
  validPassword,
  validAccount,
  ACCOUNT_RE,
  // 会话
  createAdminSession,
  requiresTwoFactor,
  destroyAdminSession,
  revokeAdminSessions,
  adminFromRequest,
  loadAdmin,
  // 权限
  requireAdmin,
  requirePermission,
  adminCan,
  // 审计
  writeAdminLog,
  // 形状
  shapeAdmin,
  shapeRole,
  shapeLog,
  shapeRewardRows,
  parsePermissions,
  usersByIds,
  adminsByIds,
  // 工具
  sha256,
  sameHash,
  clip,
  maskEmail,
  clientIp,
  pad2,
  formatDate,
  formatDateTime,
  ymd,
  startOfDay,
  toPositiveInt,
  paging,
  likeEscape,
  likeTerm,
  LIKE_ESC,
  parseTime,
  orderBy,
  csvCell,
  sendCsv,
  marks
};