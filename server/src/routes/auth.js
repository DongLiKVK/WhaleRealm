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
  revokeDeviceForUser,
  revokeSessionByKey,
  liveSessionFor,
  sessionsForUser,
  deviceOf,
  sessionView,
  userView
} = require('../auth');
// 错误码表与统一响应形状抽到 ../http：手机号、第三方登录两个路由也要用同一套 code+message，
// 前端 js/auth.js 的 MSG 是逐字比对的，只允许存在一个来源。
const { fail, rateLimitError } = require('../http');
// 账号级锁定：IP 限流只能挡单点猛攻，分布式慢速爆破要靠「按邮箱计数 + 指数退避」。
const lockout = require('../lockout');

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
  if (typeof s !== 'string' || s.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return false;
  // 以下三条是收紧：原正则放行 admin@x.com.（尾点）、a..b@x.com（连续点）、.a@x.com（首点），
  // 这三种在部分解析器里与正常地址等价，等于给了同一个人多把注册钥匙。
  const at = s.lastIndexOf('@');
  if (at <= 0) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..') || domain.includes('..')) return false;
  if (domain.endsWith('.')) return false;
  return true;
}

/**
 * 归一化邮箱：同一个真实收件地址只能存在一个账号。
 * 三种变体在这里被折平，注册与登录都走本函数，保证两边算出的地址一致：
 *   1. 大小写        Admin@X.com   -> admin@x.com
 *   2. plus 别名     admin+1@x.com -> admin@x.com   （Gmail/QQ 的 + 寻址语义）
 *   3. 域名尾点      admin@x.com.  -> admin@x.com   （尾点在某些解析器里被忽略，是经典绕过手法）
 * 攻击者正是用 2 和 3 在同一台机器上注册出 admin+1@jingyu.com 与 admin@jingyu.com. 两个小号。
 */
function normEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at <= 0) return s;
  let local = s.slice(0, at);
  const domain = s.slice(at + 1).replace(/\.+$/, '');
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  return local + '@' + domain;
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

    /* v37：注册不再随机分配 emoji / grad。
       空值 = 未自定义，前端统一落到 js/default-avatar.js 的默认鲸鱼图。
       预设头像仍然可选，但只有用户主动点击才会写 emoji + grad。 */
    const info = STMT.insertUser.run(
      email, hash, nick,
      '', '', 1, ts, ts
    );

    const user = STMT.userById.get(info.lastInsertRowid);

    // 注册即登录：会话落库后才回 cookie，表里不会出现没有 token 的孤儿行
    const s = createSession(fastify, reply, req, user);

    return {
      ok: true,
      data: {
        user: userView(user),
        session: { sid: s.sid, ua: s.ua, device: s.device, createdAt: s.createdAt, expiresAt: s.expiresAt }
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

    /* 账号级锁定必须在「查库之前」判，并且对不存在的邮箱同样生效：
       否则攻击者能靠 NOT_REGISTERED / BAD_CREDENTIALS 的差异枚举出哪些邮箱注册过，
       而且对不存在邮箱的爆破根本不会被记账。 */
    const lock = lockout.state(email);
    if (lock.locked) {
      const mins = Math.max(1, Math.ceil(lock.retryAfter / 60));
      return fail(reply, 429, 'AUTH_LOCKED_OUT',
        { retryAfter: lock.retryAfter, lockCount: lock.lockCount },
        '登录失败次数过多，这个账号暂时锁定了，' + mins + ' 分钟后再试');
    }

    const row = STMT.userByEmail.get(email);
    // 注册前置：没有这条账号记录，密码对错都无从谈起，明确告诉用户先去注册
    // 注意：这里也记一次失败 —— 否则「拿不存在的邮箱试探」是不计成本的。
    if (!row) {
      lockout.noteFail(email, req.ip);
      return fail(reply, 401, 'NOT_REGISTERED');
    }

    const okPwd = await verifyPassword(password, row.password_hash);
    if (!okPwd) {
      const st = lockout.noteFail(email, req.ip);
      // 刚好跨过阈值的那一次：直接把锁定信息回给客户端，省得他再试一次才发现
      if (st.locked) {
        const mins = Math.max(1, Math.ceil(st.retryAfter / 60));
        return fail(reply, 429, 'AUTH_LOCKED_OUT',
          { retryAfter: st.retryAfter, lockCount: st.lockCount },
          '登录失败次数过多，这个账号暂时锁定了，' + mins + ' 分钟后再试');
      }
      return fail(reply, 401, 'BAD_CREDENTIALS', { left: Math.max(0, lockout.MAX_FAILS - st.fails) });
    }

    // 密码对了：清掉该邮箱的历史失败计数，正常用户永远看不到这张表
    lockout.reset(email);

    /* 被后台禁用的账号：密码是对的也要拦。
       放在 lockout.reset 之后才判，是为了让「禁用」不会顺带把失败计数留成 5 次 ——
       解禁后第一次登录就又被锁，运营会被这个坑反复投诉。
       提示语不写「你被封了」而是给出原因，用户才知道去找谁。 */
    if (row.status === 'disabled') {
      return fail(reply, 403, 'ACCOUNT_DISABLED',
        { reason: row.disabled_reason || '' },
        row.disabled_reason
          ? '这个账号已被禁用：' + row.disabled_reason
          : '这个账号已被禁用，有疑问可以联系站务');
    }

    /* 多端同时在线（v46）：先按 UA 认设备桶，再看「这一台」是不是已经在线。
       手机登录不该被电脑上那条挡下来 —— 这就是本轮的整个诉求。 */
    const ua = String((req.headers && req.headers['user-agent']) || '');
    const device = deviceOf(ua);
    const live = liveSessionFor(row.id, device);
    if (live && !takeover) {
      return fail(reply, 409, 'ALREADY_ONLINE',
        { canTakeover: true, ua: live.ua || '浏览器', device, label: device === 'mobile' ? '手机' : '电脑' });
    }

    // 顶替只顶这一台：同一设备桶先删旧行再签新会话，另一台设备的会话原封不动
    if (live) revokeDeviceForUser(row.id, device);
    const s = createSession(fastify, reply, req, row, { device });

    return {
      ok: true,
      data: {
        user: userView(row),
        replaced: !!live,
        device: s.device,
        session: { sid: s.sid, ua: s.ua, device: s.device, createdAt: s.createdAt, expiresAt: s.expiresAt }
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

  // ---------------- 登录设备（v46 多端同时在线） ----------------
  /* 一个账号最多两条并行会话：手机一条、电脑一条。这里把还活着的都列出来，
     让用户看得见「另一台是什么设备、什么时候登的」，并能单独踢掉它。
     sid 只回前 8 位：够用来指名，又不足以拼出别人的 token。 */
  fastify.get('/sessions', { preHandler: requireAuth }, async (req) => {
    return {
      ok: true,
      data: { sessions: sessionsForUser(req.user.id, req.sessionSid), limit: 2 }
    };
  });

  /* 退出指定设备（body.key）或「除当前之外的全部」（body.others）。
     两条路径都走 revokeSessionByKey，而它只在本人会话里找 —— 拿别人的 key 来踢是无效的。 */
  fastify.post('/sessions/revoke', { preHandler: requireAuth }, async (req, reply) => {
    const body = safeBody(req);

    if (body.others === true) {
      let n = 0;
      for (const s of sessionsForUser(req.user.id, req.sessionSid)) {
        if (!s.current) n += revokeSessionByKey(req.user.id, s.key);
      }
      return { ok: true, data: { revoked: n, others: true } };
    }

    const key = typeof body.key === 'string' ? body.key : '';
    if (!/^[0-9a-f]{8}$/.test(key)) return fail(reply, 400, 'BAD_ID');
    const n = revokeSessionByKey(req.user.id, key);
    if (!n) return fail(reply, 404, 'SESSION_NOT_FOUND');
    return { ok: true, data: { revoked: n } };
  });

  // ---------------- 改资料（昵称 / 签名 / 城市 / 头像） ----------------
  /*
   * 为什么需要这个端点：注册之后昵称、签名、头像此前只写进 localStorage，
   * 换个浏览器就全丢，别人看到的也永远是你注册时那个名字 —— 那就不能算「能用」。
   *
   * 校验原则：只允许白名单字段，逐项长度上限，头像只收 http(s) 链接
   * （前端会把它塞进 <img src>，javascript:/data: 一律不收；预设头像走 emoji + grad 两个字段）。
   * 头像本身不在这里上传：先走 POST /upload/sign 直传 COS，拿到 URL 再回来登记这个 URL。
   * 空字符串是合法值（= 清空该项），只有 name 不允许改成空。
   */
  fastify.patch('/me', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const body = safeBody(req);
    const sets = [];
    const args = [];

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name == null ? '' : body.name).trim();
      if (!name) return fail(reply, 400, 'NAME_REQUIRED');
      if (name.length > 16) return fail(reply, 400, 'NAME_TOO_LONG');
      sets.push('name = ?'); args.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sig')) {
      const sig = String(body.sig == null ? '' : body.sig).trim();
      if (sig.length > 60) return fail(reply, 400, 'SIG_TOO_LONG');
      sets.push('sig = ?'); args.push(sig);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'city')) {
      const city = String(body.city == null ? '' : body.city).trim();
      if (city.length > 20) return fail(reply, 400, 'CITY_TOO_LONG');
      sets.push('city = ?'); args.push(city);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'emoji')) {
      const emoji = String(body.emoji == null ? '' : body.emoji).trim();
      if (emoji.length > 16) return fail(reply, 400, 'EMOJI_TOO_LONG');
      sets.push('emoji = ?'); args.push(emoji);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'grad')) {
      const grad = String(body.grad == null ? '' : body.grad).trim();
      /* 渐变会进 style 属性：只接受本应用自己那一种函数写法，且不许出现引号/尖括号/分号 */
      if (grad && !/^linear-gradient\([^<>"';{}]{1,120}\)$/.test(grad)) {
        return fail(reply, 400, 'BAD_GRAD');
      }
      sets.push('grad = ?'); args.push(grad);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
      const av = String(body.avatar == null ? '' : body.avatar).trim();
      /* 生产走 COS 时是 https 绝对地址；本地降级模式返回 /uploads/...，
         它同样会进 <img src>，所以只放行严格的本站上传路径形状，
         不接受任意相对路径、data:、javascript: 或带引号/空白的值。 */
      const localUpload = /^\/uploads\/u\/\d{1,10}\/\d{4}\/\d{2}\/[0-9a-f]{24}\.(jpg|png|gif|webp)(\?style=(thumb|thumb-sm|origin))?$/.test(av);
      if (av && !localUpload && (!/^https?:\/\//i.test(av) || av.length > 500)) {
        return fail(reply, 400, 'BAD_AVATAR');
      }
      sets.push('avatar = ?'); args.push(av);
    }

    if (!sets.length) return fail(reply, 400, 'NOTHING_TO_UPDATE');

    sets.push('updated_at = ?'); args.push(now(), req.user.id);
    const upd = db.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?');
    upd.run(...args);
    const row = STMT.userById.get(req.user.id);
    return { ok: true, data: { user: userView(row) } };
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

module.exports = routes;