/**
 * 第三方登录骨架（挂在 /api/auth/oauth）
 * - GET /providers            三家渠道的可用状态，前端据此决定按钮是亮还是灰
 * - GET /:provider/start      302 到渠道授权页；没配 Client ID 就 501，绝不给 500
 * - GET /:provider/callback   回调：拿 code 换 token、换 openid、绑定或建号、开单会话
 *
 * 为什么是「骨架」而不是完整实现：三家都要先在各自开放平台备案回调域名、拿到
 * AppID/AppSecret 才能真跑通，这些资料只有站点主人能提供（清单见 server/README.md）。
 * 代码路径全部写完，填上 .env 里的六个变量即生效；没填时按钮是灰的，点了回 501 可读原因。
 *
 * 与设备会话规则的关系：第三方登录最终同样走 createSession —— 一个账号每类设备（pc/mobile）各一条会话。
 * 因此 /start 与 /callback 都先查 currentUser(req)：已登录再走一遍第三方授权，等于
 * 「用别人的号登录、把当前号顶掉」，是绕过「已登录不许换号」的后门，两处都堵死。
 */
'use strict';

const crypto = require('crypto');
const { db, now } = require('../db');
const { currentUser, createSession } = require('../auth');
const { fail, rateLimitError } = require('../http');

const SITE = String(process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
const STATE_COOKIE = 'jingyu_oauth_state';
// /providers 里对外暴露的授权地址模板用它占位：下划线在 encodeURIComponent 之后原样保留，
// 前端直接 replace('__STATE__', 真实 state) 即可，不必关心编码细节。
const STATE_PLACEHOLDER = '__STATE__';
const STATE_TTL = 600;       // 授权往返给 10 分钟，够慢网络点同意书
const HTTP_TIMEOUT = 10000;  // 渠道接口一律 10 秒超时，卡住就当我方失败，不拖挂事件循环

/* ---------- 渠道定义 ----------
   每家只描述「差异」，换 token / 取用户信息的差异放进 fetchIdentity 的分支。
   env 前缀统一 OAUTH_<ID>_CLIENT_ID / OAUTH_<ID>_CLIENT_SECRET；回调地址默认按
   SITE_ORIGIN 推导，可用 OAUTH_<ID>_CALLBACK 整串覆盖（同域多域名部署时有用）。 */
const PROVIDERS = [
  {
    id: 'qq',
    name: 'QQ',
    clientIdEnv: 'OAUTH_QQ_CLIENT_ID',
    clientSecretEnv: 'OAUTH_QQ_CLIENT_SECRET',
    scope: 'get_user_info',
    // QQ 互联的授权页域名是 graph.qq.com，显示名与 scope 都按官方文档给
    authorize: 'https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id={clientId}&redirect_uri={redirectUri}&state={state}&scope={scope}'
  },
  {
    id: 'wechat',
    name: '微信',
    clientIdEnv: 'OAUTH_WECHAT_CLIENT_ID',
    clientSecretEnv: 'OAUTH_WECHAT_CLIENT_SECRET',
    scope: 'snsapi_login',
    // 微信扫码登录走 open.weixin.qq.com；末尾的 #wechat_redirect 是官方硬要求，少了会白屏
    authorize: 'https://open.weixin.qq.com/connect/qrconnect?appid={clientId}&redirect_uri={redirectUri}&response_type=code&scope={scope}&state={state}#wechat_redirect'
  },
  {
    id: 'github',
    name: 'GitHub',
    clientIdEnv: 'OAUTH_GITHUB_CLIENT_ID',
    clientSecretEnv: 'OAUTH_GITHUB_CLIENT_SECRET',
    scope: 'read:user',
    // GitHub OAuth App 是标准 PKCE 之前的流程，不需要 code_challenge
    authorize: 'https://github.com/login/oauth/authorize?client_id={clientId}&redirect_uri={redirectUri}&state={state}&scope={scope}'
  }
];

const BY_ID = new Map(PROVIDERS.map(function (p) { return [p.id, p]; }));

/* ---------- 语句缓存 ---------- */
const STMT = {
  linkByOpenId: db.prepare('SELECT * FROM oauth_links WHERE provider = ? AND open_id = ?'),
  insertLink: db.prepare('INSERT INTO oauth_links (provider, open_id, user_id, nick, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  insertUser: db.prepare('INSERT INTO users (email, password_hash, name, emoji, grad, avatar, level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
};

/** 建号 + 绑 link 放在一个事务里：不允许出现「有用户没绑定」或「有绑定没用户」的半截状态 */
const TXN_SIGNUP = db.transaction(function (row) {
  const info = STMT.insertUser.run(row.email, '', row.name, row.emoji, row.grad, row.avatar || '', 1, row.ts, row.ts);
  STMT.insertLink.run(row.provider, row.openId, info.lastInsertRowid, row.nick, row.avatar, row.ts);
  return info.lastInsertRowid;
});

/* ---------- 小工具 ---------- */

function envName(p, kind) {
  return kind === 'secret' ? p.clientSecretEnv : p.clientIdEnv;
}

function clientIdOf(p) { return String(process.env[envName(p)] || '').trim(); }
function clientSecretOf(p) { return String(process.env[envName(p, 'secret')] || '').trim(); }

/** 渠道是否可用：Client ID 与 Secret 都得有，只有 ID 换不来 token */
function isEnabled(p) { return !!(clientIdOf(p) && clientSecretOf(p)); }

function callbackOf(p) {
  const override = String(process.env['OAUTH_' + p.id.toUpperCase() + '_CALLBACK'] || '').trim();
  if (override) return override;
  return SITE + '/api/auth/oauth/' + p.id + '/callback';
}

/** 授权地址模板填充；三个占位都做 encodeURIComponent，state/redirect 里带 & 也不会串参数 */
function authorizeUrlOf(p, state) {
  return p.authorize
    .split('{clientId}').join(encodeURIComponent(clientIdOf(p)))
    .split('{redirectUri}').join(encodeURIComponent(callbackOf(p)))
    .split('{state}').join(encodeURIComponent(state))
    .split('{scope}').join(encodeURIComponent(p.scope));
}

/** 定长比较 state，避免用 === 泄露前缀时序 */
function sameStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * 302 跳转。显式先设状态码再调 redirect()：Fastify 各版本对 redirect(dest, code)
 * 与 redirect(code, dest) 的取舍不一样，写死 302 就不必赌版本。
 */
function go(reply, url) {
  reply.code(302);
  return reply.redirect(url);
}

/** 取渠道 JSON；非 2xx 或非 JSON 一律抛错，由上层折成 OAUTH_FAILED */
async function httpJson(url, init) {
  const opts = Object.assign({ headers: { accept: 'application/json' } }, init || {});
  opts.signal = AbortSignal.timeout(HTTP_TIMEOUT);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
  try {
    return JSON.parse(text);
  } catch {
    // QQ 的 token 接口在不带 fmt=json 时返回 query string，这里兜一层
    const out = {};
    for (const pair of text.split('&')) {
      const i = pair.indexOf('=');
      if (i > 0) out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    }
    return out;
  }
}

/**
 * 拿渠道身份：统一返回 { openId, unionId, nick, avatar, email }。
 * openId 是「这个渠道里的用户唯一标识」，微信优先用 unionid —— 同一个人在公众号/小程序/
 * 开放平台里 openid 各不相同，只有 unionid 稳定，用 openid 建号会导致同一个人开出多个账号。
 */
async function fetchIdentity(p, code) {
  if (p.id === 'qq') {
    const tokenUrl = 'https://graph.qq.com/oauth2.0/token?grant_type=authorization_code&fmt=json' +
      '&client_id=' + encodeURIComponent(clientIdOf(p)) +
      '&client_secret=' + encodeURIComponent(clientSecretOf(p)) +
      '&code=' + encodeURIComponent(code) +
      '&redirect_uri=' + encodeURIComponent(callbackOf(p));
    const tok = await httpJson(tokenUrl);
    if (!tok || !tok.access_token) throw new Error('qq: no access_token');
    const meUrl = 'https://graph.qq.com/oauth2.0/me?fmt=json&access_token=' + encodeURIComponent(tok.access_token);
    const me = await httpJson(meUrl);
    if (!me || !me.openid) throw new Error('qq: no openid');
    let nick = '';
    let avatar = '';
    try {
      const infoUrl = 'https://graph.qq.com/user/get_user_info?access_token=' + encodeURIComponent(tok.access_token) +
        '&oauth_consumer_key=' + encodeURIComponent(clientIdOf(p)) +
        '&openid=' + encodeURIComponent(me.openid);
      const info = await httpJson(infoUrl);
      nick = String(info.nickname || '');
      avatar = String(info.figureurl_qq_1 || info.figureurl_qq_2 || '');
    } catch {
      // 昵称取不到不该阻断登录：账号建好，昵称留空由用户在个人资料里补
    }
    return { openId: String(me.openid), unionId: '', nick: nick, avatar: avatar, email: '' };
  }

  if (p.id === 'wechat') {
    const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?grant_type=authorization_code' +
      '&appid=' + encodeURIComponent(clientIdOf(p)) +
      '&secret=' + encodeURIComponent(clientSecretOf(p)) +
      '&code=' + encodeURIComponent(code);
    const tok = await httpJson(tokenUrl);
    if (!tok || !tok.access_token || !tok.openid) throw new Error('wechat: ' + String((tok && tok.errmsg) || 'no openid'));
    let nick = '';
    let avatar = '';
    try {
      const infoUrl = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + encodeURIComponent(tok.access_token) +
        '&openid=' + encodeURIComponent(tok.openid);
      const info = await httpJson(infoUrl);
      nick = String(info.nickname || '');
      avatar = String(info.headimgurl || '');
    } catch {
      // 同上：用户信息拿不到不影响建号
    }
    return { openId: String(tok.openid), unionId: String(tok.unionid || ''), nick: nick, avatar: avatar, email: '' };
  }

  // github
  const body = new URLSearchParams({
    client_id: clientIdOf(p),
    client_secret: clientSecretOf(p),
    code: code,
    redirect_uri: callbackOf(p)
  });
  const tok = await httpJson('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!tok || !tok.access_token) throw new Error('github: ' + String((tok && tok.error) || 'no access_token'));
  const gh = await httpJson('https://api.github.com/user', {
    headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + tok.access_token, 'user-agent': 'jingyu-oauth' }
  });
  if (!gh || !gh.id) throw new Error('github: no id');
  return {
    openId: String(gh.id),
    unionId: '',
    nick: String(gh.name || gh.login || ''),
    avatar: String(gh.avatar_url || ''),
    email: String(gh.email || '')
  };
}

/** 回调失败一律 302 回前端登录页带错误码：这是浏览器跳转端点，回 JSON 用户只会看到一屏白字 */
function backToLogin(reply, code, extra) {
  let url = SITE + '/#/login?oauth=error&code=' + encodeURIComponent(code);
  if (extra) url += '&' + extra;
  return go(reply, url);
}

function clearStateCookie(reply) {
  reply.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' });
}

/**
 * 建号用的占位邮箱：第三方账号没有邮箱，也必须满足 users.email NOT NULL UNIQUE。
 *
 * 域名故意写成 "oauth"（没有点）而不是 oauth.local：注册/登录接口的邮箱正则要求
 * "xxx@yyy.zz" 形状，所以任何人对这个地址调 /register 或 /login 都会先被
 * BAD_EMAIL 挡住 —— 占位账号因此永远不会被密码通道碰到。
 *
 * 为什么要在意这件事：如果占位邮箱是可注册形状（比如 @oauth.local），攻击者可以抢先用
 * 「猜出来的 openid」注册一个带自己密码的账号；等真正的第三方用户第一次登录时复用
 * 这一行，攻击者手里的密码就和别人的账号绑在同一个 user 上了。
 */
function oauthEmail(p, openId) {
  return p.id + '_' + openId + '@oauth';
}

async function routes(fastify) {
  // ---------------- 渠道可用状态 ----------------
  fastify.get('/providers', async function () {
    const list = PROVIDERS.map(function (p) {
      const enabled = isEnabled(p);
      return {
        id: p.id,
        name: p.name,
        enabled: enabled,
        // 未启用时也给个空模板，前端可以先把按钮画出来再置灰，不用为两种状态写两套 UI
        authorizeUrl: enabled ? authorizeUrlOf(p, STATE_PLACEHOLDER) : '',
        startUrl: '/api/auth/oauth/' + p.id + '/start'
      };
    });
    return { ok: true, data: { providers: list, configured: list.filter(function (x) { return x.enabled; }).length } };
  });

  // ---------------- 发起授权 ----------------
  fastify.get('/:provider/start', {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async function (req, reply) {
    const p = BY_ID.get(String(req.params.provider || '').toLowerCase());
    if (!p) return fail(reply, 400, 'OAUTH_UNKNOWN_PROVIDER');

    // 已登录还发起第三方授权 = 想拿别人的身份顶掉当前会话，属于换号后门，直接拒
    if (currentUser(req)) return fail(reply, 409, 'ALREADY_AUTHED');

    if (!isEnabled(p)) {
      const missing = [];
      if (!clientIdOf(p)) missing.push(envName(p));
      if (!clientSecretOf(p)) missing.push(envName(p, 'secret'));
      return fail(reply, 501, 'OAUTH_NOT_CONFIGURED', { provider: p.id, missing: missing },
        '还没配置' + p.name + '登录：缺少 ' + missing.join(' 与 ') + '，以及开放平台里备案的回调域名 ' + callbackOf(p));
    }

    const state = crypto.randomBytes(16).toString('hex');
    // state 与渠道名绑在一起存：换渠道重放同一个 state 也会被识别出来
    reply.setCookie(STATE_COOKIE, p.id + '.' + state, {
      httpOnly: true,
      sameSite: 'lax',   // 必须 lax：渠道回跳是顶层 GET 导航，strict 会导致 cookie 不带
      secure: SITE.indexOf('https') === 0,
      path: '/api/auth/oauth',
      maxAge: STATE_TTL
    });
    return go(reply, authorizeUrlOf(p, state));
  });

  // ---------------- 回调 ----------------
  fastify.get('/:provider/callback', {
    config: { rateLimit: { max: 60, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async function (req, reply) {
    const p = BY_ID.get(String(req.params.provider || '').toLowerCase());
    if (!p) return backToLogin(reply, 'OAUTH_UNKNOWN_PROVIDER');
    if (!isEnabled(p)) return backToLogin(reply, 'OAUTH_NOT_CONFIGURED', 'provider=' + p.id);

    const q = req.query || {};
    // 用户点了「取消」：渠道会带 error=access_denied 回来，这不是故障，别再报 500
    if (q.error) return backToLogin(reply, 'OAUTH_DENIED', 'provider=' + p.id);

    // 回调时若本浏览器已有会话，同样不允许借第三方身份换号
    if (currentUser(req)) return backToLogin(reply, 'ALREADY_AUTHED');

    const cookieVal = String((req.cookies && req.cookies[STATE_COOKIE]) || '');
    clearStateCookie(reply);
    const dot = cookieVal.indexOf('.');
    const cookieProvider = dot > 0 ? cookieVal.slice(0, dot) : '';
    const cookieState = dot > 0 ? cookieVal.slice(dot + 1) : '';
    const state = String(q.state || '');
    if (!cookieState || cookieProvider !== p.id || !sameStr(cookieState, state)) {
      // state 不符 = CSRF 或这次授权不是本浏览器发起的，宁可不登也不冒险
      return backToLogin(reply, 'OAUTH_STATE', 'provider=' + p.id);
    }

    const code = String(q.code || '');
    if (!code) return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);

    let idn;
    try {
      idn = await fetchIdentity(p, code);
    } catch (err) {
      // 渠道侧 4xx/5xx、超时、返回垃圾都在这里；日志留原因，前端只看到可读的一句
      req.log.warn({ provider: p.id, err: err && err.message }, '[oauth] 换取身份失败');
      return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);
    }

    // 微信有 unionid 就用它，跨端同一个人只开一个号
    const openId = idn.unionId || idn.openId;
    if (!openId) return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);

    let user = null;
    const link = STMT.linkByOpenId.get(p.id, openId);
    if (link) {
      user = STMT.userById.get(link.user_id);
      // 绑定的用户被删了（外键 CASCADE 理论上会一起删 link，这里只是兜底）
      if (!user) return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);
    } else {
      const ts = now();
      const nick = (idn.nick || '').slice(0, 24) || (p.name + '用户');
      const email = oauthEmail(p, openId);
      const dup = STMT.userByEmail.get(email);
      // 占位邮箱已存在：只可能是我们自己建的（历史上建过但 link 没写成，事务外崩溃等）。
      // 复用前必须确认它确实是「无密码占位账号」—— password_hash 非空说明这行被密码
      // 通道动过，那就不是我们的占位行，宁可让这次登录失败，也不把别人的账号交出去。
      if (dup && dup.password_hash) {
        req.log.warn({ provider: p.id, userId: dup.id }, '[oauth] 占位邮箱对应账号带密码，拒绝复用');
        return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);
      }
      if (dup) {
        user = dup;
        STMT.insertLink.run(p.id, openId, dup.id, nick, idn.avatar || '', ts);
      } else {
        const uid = TXN_SIGNUP({
          /* v37：第三方注册与邮箱注册一致，初始头像统一走前端默认鲸鱼图，
             不再从渠道里随机挑 emoji / 渐变。 */
          email: email, name: nick, emoji: '', grad: '',
          provider: p.id, openId: openId, nick: nick, avatar: idn.avatar || '', ts: ts
        });
        user = STMT.userById.get(uid);
      }
    }
    if (!user) return backToLogin(reply, 'OAUTH_FAILED', 'provider=' + p.id);

    /* 头像跟着渠道走：users.avatar 为空时用渠道头像回填（首次绑定与历史账号都补一次）。
       用户自己上传过头像就绝不覆盖 —— 那才是他自己的选择。 */
    if (!user.avatar && idn.avatar) {
      try {
        db.prepare('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?')
          .run(String(idn.avatar).slice(0, 500), now(), user.id);
        user = STMT.userById.get(user.id) || user;
      } catch (err) {
        req.log.warn({ err: err && err.message, userId: user.id }, '[oauth] 头像回填失败');
      }
    }

    // 单会话：createSession 内部就是一个事务「先删该账号旧行、再插新行」，
    // 所以第三方登录同样顶替旧会话，不需要在这里额外再删一次。
    createSession(fastify, reply, req, user, { replace: true });

    // 第三方账号没有密码，phone_verified 也是 0：前端落地后应引导去绑手机号
    return go(reply, SITE + '/#/login?oauth=ok&provider=' + p.id);
  });
}

module.exports = routes;
module.exports.PROVIDERS = PROVIDERS;
module.exports.isEnabled = isEnabled;
