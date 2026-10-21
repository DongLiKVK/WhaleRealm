/** 认证路由：注册 / 登录 / 登出 / 当前用户 / 换号（恒拒绝） */
'use strict';

const { db, now } = require('../db');
const {
  hashPassword,
  verifyPassword,
  clearToken,
  requireAuth,
  currentUser,
  createSession,
  revokeSession,
  revokeAllForUser,
  liveSessionFor,
  sessionView,
  userView
} = require('../auth');
// 错误码表与统一响应形状抽到 ../http：手机号、第三方登录两个路由也要用同一套 code+message，
// 前端 js/auth.js 的 MSG 是逐字比对的，只允许存在一个来源。
const { fail, rateLimitError } = require('../http');

/* ---------- 语句缓存：模块加载时 prepare 一次 ---------- */
const STMT = {
  userIdByEmail: db.prepare('SELECT id FROM users WHERE email = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  insertUser: db.prepare(`
    INSERT INTO users (email, password_hash, name, emoji, grad, level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  userById: db.prepare('SELECT * FROM users WHERE id = ?')
};

/** 简单邮箱校验，不做 RFC 全量 */
function validEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

/** 归一化邮箱：去空格、转小写（与 users.email 的存法一致） */
function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

/** req.body 可能是 undefined / null / 字符串 / 数组，一律折成对象，绝不因此抛 500 */
function safeBody(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

async function routes(fastify) {
  // ---------------- 注册 ----------------
  // 已登录时注册 = 「注册个小号再切过去」，是绕过「已登录不许换号」的路，必须堵死
  // 刻意不挂 body schema：一旦挂了，body 缺字段/是 null 会先被 fastify 判成 400 BAD_REQUEST，
  // 抢在「已登录 409 ALREADY_AUTHED」前面 —— 那条判定的意义正是「带着会话的请求一律先拒」，
  // 不能因为 body 写歪就走别的分支。字段校验全部在下面手写，保证对外只有本表里的错误码。
  fastify.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    if (currentUser(req)) return fail(reply, 409, 'ALREADY_AUTHED');

    const body = safeBody(req);
    const email = normEmail(body.email);
    const password = body.password;
    const name = String(body.name == null ? '' : body.name).trim();

    if (!validEmail(email)) return fail(reply, 400, 'BAD_EMAIL');
    if (typeof password !== 'string' || password.length < 8) return fail(reply, 400, 'WEAK_PASSWORD');
    if (password.length > 200) return fail(reply, 400, 'PASSWORD_TOO_LONG');

    const exists = STMT.userIdByEmail.get(email);
    if (exists) return fail(reply, 409, 'EMAIL_TAKEN');

    const hash = await hashPassword(password);
    const ts = now();
    // 昵称空则回退成邮箱前缀，超 24 截断（保持原有行为，NAME_REQUIRED 留给以后需要必填昵称的场景）
    const nick = name.slice(0, 24) || email.split('@')[0].slice(0, 24);

    const info = STMT.insertUser.run(
      email, hash, nick,
      pickEmoji(), pickGrad(), 1, ts, ts
    );

    const user = STMT.userById.get(info.lastInsertRowid);

    // 注册即登录：会话落库后才回 cookie，表里不会出现没有 token 的孤儿行
    const s = createSession(fastify, reply, req, user);

    return {
      ok: true,
      data: {
        user: userView(user),
        session: { sid: s.sid, ua: s.ua, createdAt: s.createdAt, expiresAt: s.expiresAt }
      }
    };
  });

  // ---------------- 登录 ----------------
  // 同 /register：不挂 body schema，确保「已登录」判定永远排在字段校验前面
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    // 本浏览器已经有有效会话：一律不许换号
    if (currentUser(req)) return fail(reply, 409, 'ALREADY_AUTHED');

    const body = safeBody(req);
    const email = normEmail(body.email);
    const password = body.password;
    // 只认字面量 true：字符串 "true" / 1 / "1" 都不算，免得前端拼错 body 就把别人的会话顶掉
    const takeover = body.takeover === true;

    if (!validEmail(email)) return fail(reply, 400, 'BAD_EMAIL');

    const row = STMT.userByEmail.get(email);
    // 注册前置：没有这条账号记录，密码对错都无从谈起，明确告诉用户先去注册
    if (!row) return fail(reply, 401, 'NOT_REGISTERED');

    const okPwd = await verifyPassword(password, row.password_hash);
    if (!okPwd) return fail(reply, 401, 'BAD_CREDENTIALS');

    // 单账号单会话：另一处还活着就拒绝，只有显式 takeover 才顶替
    const live = liveSessionFor(row.id);
    if (live && !takeover) {
      return fail(reply, 409, 'ALREADY_ONLINE', { canTakeover: true, ua: live.ua || '浏览器' });
    }

    // 顶替：先删旧行再签新会话，任一时刻该账号在 sessions 里只有一行
    if (live) revokeAllForUser(row.id);
    const s = createSession(fastify, reply, req, row);

    return {
      ok: true,
      data: {
        user: userView(row),
        replaced: !!live,
        session: { sid: s.sid, ua: s.ua, createdAt: s.createdAt, expiresAt: s.expiresAt }
      }
    };
  });

  // ---------------- 登出 ----------------
  // 幂等：没登录也返回成功；有会话则删行 + 清 cookie，token 立刻作废
  fastify.post('/logout', async (req, reply) => {
    revokeSession(req);
    clearToken(reply);
    return { ok: true, data: { loggedOut: true } };
  });

  // ---------------- 当前用户 ----------------
  // phoneMasked / phoneVerified 由 userView 统一给：号码只回打码值，前端拿到也拼不出真号
  fastify.get('/me', { preHandler: requireAuth }, async (req) => {
    return { ok: true, data: { user: userView(req.user), session: sessionView(req.session, req.sessionSid) } };
  });

  // ---------------- 切换账号 ----------------
  /*
   * 这个端点存在的唯一目的，是让换号在协议层没有成功分支：
   *   - 没登录 -> 401 NOT_AUTHED（没得换）
   *   - 已登录 -> 恒 409 AUTH_LOCKED（有会话就不许换，只能先 logout）
   * 不读 body 里的 uid 做任何事，连查询都不做，所以不存在「换个参数就成功」的路径。
   * 前端就算直接构造请求、改 localStorage 里的身份，服务端这一层也不会改签 token。
   */
  // 故意不挂 body schema：body 缺失/畸形时也要走到 401/409，不能先被 400 挡在前面
  fastify.post('/switch', {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const cur = currentUser(req);
    const rawTo = req.body && typeof req.body === 'object' ? req.body.uid : undefined;
    const to = rawTo == null ? '' : String(rawTo).slice(0, 64);
    if (!cur) return fail(reply, 401, 'NOT_AUTHED', { from: '', to });
    return fail(reply, 409, 'AUTH_LOCKED', { from: cur.id, to });
  });
}

/** 注册时随机分配一个头像表情，省得用户一开始就是空白头像 */
function pickEmoji() {
  const list = ['🐳', '🦌', '🍊', '🧊', '🐱', '🍋', '🌙', '🌿', '🛸', '🎈', '🌊', '🍀'];
  return list[Math.floor(Math.random() * list.length)];
}

function pickGrad() {
  const list = [
    'linear-gradient(135deg,#7aa2ff,#a46bff)',
    'linear-gradient(135deg,#ffb36b,#ff6b9d)',
    'linear-gradient(135deg,#5ad1c8,#3f8bff)',
    'linear-gradient(135deg,#c084fc,#f472b6)',
    'linear-gradient(135deg,#fde68a,#f59e0b)'
  ];
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = routes;
