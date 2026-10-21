/**
 * 鉴权工具
 * - bcryptjs 哈希密码（纯 JS，不需要编译，省掉 node-gyp 风险）
 * - JWT 放在 httpOnly cookie 里，前端 JS 读不到，防 XSS 窃取
 * - JWT 只说明「这张票是谁签的」，真正的权威在 sessions 表：payload 里带 sid，
 *   每个受保护请求都按 sid 回表校验「行还在 / 没过期 / token_hash 对得上」。
 *   删掉那一行，token 立刻作废 —— 前端改 localStorage、改 cookie 都绕不过服务端。
 * - 单账号单会话：每次签发都在同一个事务里「先删该账号的旧行、再插新行」，
 *   任一时刻 sessions 里每个 user_id 最多一行。
 * - requireAuth / optionalAuth 直接挂 preHandler，签名是 (req, reply)
 */
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, now, publicUser } = require('./db');
const { maskPhone } = require('./http');

const BCRYPT_ROUNDS = 10;
const COOKIE_NAME = 'jingyu_token';
const JWT_EXPIRES = Number(process.env.JWT_EXPIRES || 604800); // 秒，默认 7 天

const SID_BYTES = 16;            // 128 位随机 sid，放进 JWT
const SID_RE = /^[0-9a-f]{32}$/; // 只认 32 位小写十六进制
const ID_HEX = 12;               // sessions.id 取 sid 的前 12 个十六进制字符（48 位）
const UA_MAX = 200;
const IP_MAX = 64;
const SID_ATTEMPTS = 3;          // 行号撞车时重抽（概率 ~2^-48，纯兜底）

/* ---------- 语句缓存：模块加载时 prepare 一次，热路径只做 bind ---------- */
const STMT = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  sessionById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  sessionByUser: db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
  insertSession: db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, ua, ip, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  deleteSessionById: db.prepare('DELETE FROM sessions WHERE id = ?'),
  deleteSessionByHash: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteSessionsByUser: db.prepare('DELETE FROM sessions WHERE user_id = ?')
};

/**
 * 签发一条会话的写入动作：一个事务里先清旧行再插新行。
 * 事务保证了「行数恒 <= 1」不会出现中间态（better-sqlite3 是同步的，事务内不会让出事件循环）。
 */
const TXN_ISSUE = db.transaction((row) => {
  if (row.replace) STMT.deleteSessionsByUser.run(row.user_id);
  STMT.insertSession.run(row.id, row.user_id, row.token_hash, row.ua, row.ip, row.expires_at, row.created_at);
});

/* ---------- 库级兜底：sessions.user_id 唯一 ----------
   应用层靠「事务内先删后插」保证每个账号至多一行；这里再给它加一条数据库唯一索引，
   就算将来谁绕过 createSession 直接写库，也插不进第二行。
   老库若已有多行（旧版本遗留），先只留最新一行再建索引；任何失败都吞掉，
   绝不因为这一条索引让服务起不来。 */
(function enforceSingleSessionPerUser() {
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_per_user ON sessions(user_id)');
  } catch {
    try {
      db.exec('DELETE FROM sessions WHERE id NOT IN (SELECT MAX(id) FROM sessions GROUP BY user_id)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_per_user ON sessions(user_id)');
    } catch (err) {
      console.warn('[auth] sessions(user_id) 唯一索引建立失败，单会话约束仅由应用层保证：' + err.message);
    }
  }
})();

/* ---------- 库级兜底：老库补列 ----------
   schema.sql 里全是 CREATE TABLE IF NOT EXISTS，对已经存在的 users 表它不会加列，
   所以手机号三列必须在这里幂等地补一次：PRAGMA table_info 查不到才 ALTER TABLE。
   为什么放在 auth.js 而不是 db.js：db.js 只管连接与执行 schema，改它牵连所有路由；
   而手机号列是「认证闸门」的一部分，跟着 auth 模块启动最贴近职责。
   失败只 warn —— 最坏情况是手机号功能不可用，绝不能让登录主流程起不来。 */
const USER_COLUMNS = [
  ['phone', "TEXT NOT NULL DEFAULT ''"],
  ['phone_verified', 'INTEGER NOT NULL DEFAULT 0'],
  ['phone_at', 'INTEGER NOT NULL DEFAULT 0']
];

/** 幂等补列：列已存在返回 false，真加了返回 true
    注意：PRAGMA 不缓存成模块级语句 —— ALTER TABLE 会让它失效，每次现 prepare 最稳。 */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (cols.some((c) => c && c.name === column)) return false;
  // table / column / ddl 全部是模块内常量，不来自请求，拼接不存在注入面
  db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
  return true;
}

(function ensureUserColumns() {
  for (const [column, ddl] of USER_COLUMNS) {
    try {
      if (ensureColumn('users', column, ddl)) console.log('[auth] users 已补列：' + column);
    } catch (err) {
      console.warn('[auth] users 补列失败 ' + column + '：' + err.message);
    }
  }
})();

/* ---------- 小工具 ---------- */

/** sha256(token)：库里只存哈希，拿到 DB 也还原不出可用 token */
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** 定长字符串比较，避免用 === 比哈希泄露前缀时序 */
function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function clip(v, max) {
  return (typeof v === 'string' ? v : '').slice(0, max);
}

/**
 * sessions.id 的取值：sid 的前 12 个十六进制字符（48 位）。
 * 为什么不用 AUTOINCREMENT？
 *   规则要求「先 jwt.sign 拿到 token，再 sha256 落库」，也就是 token 里必须先有 sid，
 *   插入才发生 —— 那时自增主键还不存在。用 sid 派生行号，既保住「先签后插、
 *   表里永远不出现无主行」，又让 SELECT * FROM sessions WHERE id = ? 直接成立。
 *   sid 本身是 128 位随机、完整值只在签名 token 里，行号只是它的可索引前缀。
 */
function sessionIdOf(sid) {
  if (typeof sid !== 'string' || !SID_RE.test(sid)) return null;
  return parseInt(sid.slice(0, ID_HEX), 16);
}

/** 会话对外的形状（sid 库里不留明文，由调用方从请求自己的 token 回填） */
function sessionView(s, sid) {
  const x = s || {};
  return {
    sid: x.sid || sid || '',
    ua: x.ua || '',
    createdAt: x.createdAt || x.created_at || 0,
    expiresAt: x.expiresAt || x.expires_at || 0
  };
}

/** 写 cookie：httpOnly，JS 读不到 */
function setTokenCookie(reply, token) {
  const secure = process.env.SITE_ORIGIN && process.env.SITE_ORIGIN.startsWith('https');
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!secure,
    path: '/',
    maxAge: JWT_EXPIRES
  });
}

/* ---------- 密码 ---------- */

/** 密码哈希 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** 校验密码 */
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/* ---------- 会话 ---------- */

/**
 * 开一条新会话：生成 sid → 签 token → 算 hash → 落库 → 写 cookie。
 * 顺序是刻意的：签名在前、插入在后，任何一步抛错都不会在表里留下没有 token 的孤儿行。
 * opts: { ua, ip, replace }，replace 默认 true（顶掉该账号已有的会话）。
 * 返回 { sid, token, hash, ua, ip, createdAt, expiresAt }
 */
function createSession(fastify, reply, req, user, opts) {
  const o = opts || {};
  const ts = now();
  const expiresAt = ts + JWT_EXPIRES;

  const rawUa = o.ua !== undefined ? o.ua : (req && req.headers ? req.headers['user-agent'] : '');
  const rawIp = o.ip !== undefined ? o.ip : (req ? req.ip : '');
  const ua = clip(rawUa, UA_MAX);
  const ip = clip(rawIp, IP_MAX);
  const replace = o.replace !== false;

  let sid = '';
  let token = '';
  let hash = '';

  for (let attempt = 0; attempt < SID_ATTEMPTS; attempt++) {
    sid = crypto.randomBytes(SID_BYTES).toString('hex');
    token = fastify.jwt.sign({ uid: user.id, sid }, { expiresIn: JWT_EXPIRES });
    hash = sha256(token);
    try {
      TXN_ISSUE({
        id: sessionIdOf(sid),
        user_id: user.id,
        token_hash: hash,
        ua,
        ip,
        expires_at: expiresAt,
        created_at: ts,
        replace
      });
      break;
    } catch (err) {
      // 48 位行号撞车的概率可以忽略，真撞上就重抽一次，不把 500 抛给用户
      sid = '';
      token = '';
      hash = '';
      const conflict = !!err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
      if (!conflict || attempt === SID_ATTEMPTS - 1) throw err;
    }
  }

  setTokenCookie(reply, token);
  return { sid, token, hash, ua, ip, createdAt: ts, expiresAt };
}

/**
 * 取当前请求对应的 sessions 行；任何一项对不上都返回 null（不抛异常）。
 * 校验顺序：token 有没有 → JWT 验签 → sid 形状 → 行在不在 → 是不是本人的 →
 *           过没过期 → token_hash 是否等于 sha256(token)。
 */
function findSession(req) {
  if (!req) return null;
  const token = readToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = req.server.jwt.verify(token);
  } catch {
    return null;
  }

  const sid = typeof payload.sid === 'string' ? payload.sid : '';
  const id = sessionIdOf(sid);
  if (id === null) return null;

  const row = STMT.sessionById.get(id);
  if (!row) return null;
  if (row.user_id !== payload.uid) return null;

  // 顺手把过期行删掉：下一次连查询都省了
  if (row.expires_at <= now()) {
    STMT.deleteSessionById.run(row.id);
    return null;
  }
  if (!sameHash(row.token_hash, sha256(token))) return null;

  req.sessionSid = sid;
  return row;
}

/** 撤销当前请求的会话（按 token_hash 删；JWT 过期也删得掉）。返回是否真的删了一行 */
function revokeSession(req) {
  if (!req) return false;
  const token = readToken(req);
  if (!token) return false;

  let changed = STMT.deleteSessionByHash.run(sha256(token)).changes > 0;

  let payload = null;
  try {
    payload = req.server.jwt.verify(token);
  } catch {
    payload = null;
  }
  if (payload && typeof payload.sid === 'string') {
    const id = sessionIdOf(payload.sid);
    if (id !== null) {
      // 只删「自己的」那一行：sid 与 uid 必须对得上，避免拿别人的 sid 替对方注销
      const row = STMT.sessionById.get(id);
      if (row && row.user_id === payload.uid && STMT.deleteSessionById.run(id).changes > 0) changed = true;
    }
  }
  return changed;
}

/** 撤销某个用户的全部会话（改密、封号、顶替登录时用） */
function revokeAllForUser(userId) {
  if (!userId) return 0;
  return STMT.deleteSessionsByUser.run(userId).changes;
}

/** 该用户当前还有没有活着的会话：{ id, ua, ip, created_at, expires_at } 或 null */
function liveSessionFor(userId) {
  if (!userId) return null;
  const row = STMT.sessionByUser.get(userId);
  if (!row) return null;
  if (row.expires_at <= now()) {
    STMT.deleteSessionById.run(row.id);
    return null;
  }
  return {
    id: row.id,
    ua: row.ua,
    ip: row.ip,
    created_at: row.created_at,
    expires_at: row.expires_at
  };
}

/**
 * 兼容旧调用点：等价于「给这个用户开一条会话」，仍然会落 sessions 行，
 * 不会产出查不到会话的裸 token。
 */
function issueToken(fastify, reply, user, req, opts) {
  return createSession(fastify, reply, req || null, user, opts).token;
}

/** 清除 cookie */
function clearToken(reply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

/** 从 cookie 或 Authorization 头取 token */
function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/**
 * 当前用户：JWT 验签 + sessions 行双检，两道都过才算登录。
 * 顺带把 req.user / req.session / req.sessionSid 铺好，路由直接用。
 */
function currentUser(req) {
  const s = findSession(req);
  if (!s) return null;
  const row = STMT.userById.get(s.user_id);
  if (!row) return null;
  req.user = row;
  req.session = s;
  return row;
}

/** preHandler：必须登录，否则 401 */
async function requireAuth(req, reply) {
  const u = currentUser(req);
  if (!u) {
    reply.code(401).send({ ok: false, error: { code: 'NOT_AUTHED', message: '请先登录' } });
    return reply;
  }
  req.user = u;
}

/** preHandler：可选登录，取不到就放过 */
async function optionalAuth(req) {
  req.user = currentUser(req);
}

/**
 * 对外的用户对象：publicUser 的基础上补手机号两项。
 * 只给「打码后的号码」和布尔值 —— 完整号码在任何接口里都不回显，
 * 前端要做「换绑」只能重新走一遍验证码，拿不到旧号也就没法拿去撞别的站。
 */
function userView(row) {
  const u = publicUser(row);
  if (!u) return null;
  const raw = row && typeof row.phone === 'string' ? row.phone : '';
  u.phoneMasked = maskPhone(raw);
  u.phoneVerified = !!(row && row.phone_verified === 1);
  return u;
}

/** 管理权限判断 */
function isAdmin(user) {
  return !!user && (user.level >= 15 || user.badge === '版主');
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  clearToken,
  readToken,
  currentUser,
  requireAuth,
  optionalAuth,
  isAdmin,
  createSession,
  findSession,
  revokeSession,
  revokeAllForUser,
  liveSessionFor,
  sessionView,
  sessionIdOf,
  userView,
  ensureColumn,
  COOKIE_NAME,
  JWT_EXPIRES
};
