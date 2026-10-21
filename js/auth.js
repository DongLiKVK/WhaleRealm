/* ================= 鲸域 · 登录内核（前端演示态） ================= */
/*
  这一层的职责：把「谁能登录、登录后能不能换号」的规则关在一个地方，
  页面只读它的结论，不自己判断身份。

  三条硬规则（与后端 server/src/auth.js + routes/auth.js 一一对应）：
    1. 注册前置：邮箱不在注册表里，登录直接拒绝（NOT_REGISTERED）。
    2. 单账号单会话：一个账号在同一时间只允许一条有效会话；
       换一台「设备」登录会拒绝（ALREADY_ONLINE），除非显式顶替（takeover）。
    3. 会话建立后不允许换账号：同一浏览器已有会话时，再登录别的账号
       或点「切换账号」一律拒绝（ALREADY_AUTHED / AUTH_LOCKED）。

  为什么不是「前端藏按钮」了事：
    会话记录里存了 sid + 由 sid/uid/email 派生的签名 sig。
    手改 localStorage 把 uid 改成别人，sig 对不上，state() 直接判定会话失效并清空。
    真正的权威在后端（sessions 表 + 每个请求校验 sid），前端这层只是没有后端时的同契约演示态。
*/
(function () {
  'use strict';

  var KEY = 'jy-auth-v1';
  var SECRET = 'jingyu-demo-2026';
  var TTL = 7 * 24 * 3600 * 1000;      /* 7 天，和后端 JWT_EXPIRES 默认值一致 */
  var LOCK_MAX = 10;                   /* 10 分钟内最多 10 次失败登录 */
  var LOCK_WINDOW = 10 * 60 * 1000;

  /* ---------- 哈希：不引第三方，两个 32 位混合，输出 32 位十六进制 ---------- */
  function h32(s, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function h64(s) {
    return h32(s, 0x811c9dc5) + h32(s, 0x01000193) + h32(s.split('').reverse().join(''), 0x9e3779b9) + h32('#' + s, 0x85ebca6b);
  }
  function digest(s) { return h64('jy1|' + s) + h64('jy2|' + s); }
  function sid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function nowMs() { return Date.now(); }

  /* ---------- 错误：code 供程序判断，message 直接给人看 ---------- */
  function AuthError(code, message, extra) {
    var e = new Error(message);
    e.name = 'AuthError';
    e.code = code;
    e.status = extra && extra.status ? extra.status : 400;
    if (extra) for (var k in extra) if (k !== 'status') e[k] = extra[k];
    return e;
  }
  var MSG = {
    BAD_EMAIL: '邮箱格式不对，检查一下有没有漏掉 @ 或域名',
    WEAK_PASSWORD: '密码至少 8 位',
    PASSWORD_TOO_LONG: '密码太长了，200 位以内',
    NAME_REQUIRED: '昵称不能为空',
    EMAIL_TAKEN: '这个邮箱已经注册过了，直接登录或换个邮箱',
    NOT_REGISTERED: '这个邮箱还没注册，先去注册一个账号',
    BAD_CREDENTIALS: '邮箱或密码不对',
    ALREADY_AUTHED: '当前已经登录，同一时间只能登录一个账户；要换账号请先退出登录',
    ALREADY_ONLINE: '这个账号已经在另一处登录，同一时间只允许一条会话',
    AUTH_LOCKED: '登录状态已建立，不能在本会话内切换账户；要换账号请先退出登录',
    NOT_AUTHED: '请先登录再操作',
    SESSION_INVALID: '登录状态已失效，请重新登录',
    TOO_MANY: '尝试太频繁了，过几分钟再试',
    /* 手机号认证（登录后强制闸门，与后端 /api/auth/phone 的错误码同名） */
    BAD_PHONE: '手机号格式不对，填 11 位大陆号码就行',
    CODE_EXPIRED: '验证码过期了，重新获取一条',
    CODE_WRONG: '验证码不对，再看一眼短信',
    CODE_TOO_MANY: '这个验证码错太多次了，重新获取一条',
    PHONE_TAKEN: '这个手机号已经绑过别的账号了',
    PHONE_REQUIRED: '先把手机号认证走完，再进站内',
    /* 第三方登录 */
    OAUTH_OFF: '这个第三方登录还没配置，需要先填 Client ID 与回调域名',
    OAUTH_FAILED: '第三方授权没有完成，再试一次'
  };

  /* ---------- 存储 ---------- */
  /* codes：手机验证码（键是手机号），演示态存在本地；真实实现里它在服务端 phone_codes 表。
     cooldown：同一手机号的发送冷却，避免连点把短信通道打爆。 */
  function blank() { return { accounts: {}, sessions: {}, device: null, fails: { n: 0, at: 0 }, codes: {}, seeded: false }; }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var db = JSON.parse(raw);
      if (!db || typeof db !== 'object' || !db.accounts) return null;
      if (!db.sessions) db.sessions = {};
      if (!db.fails) db.fails = { n: 0, at: 0 };
      if (!db.codes) db.codes = {};
      return db;
    } catch (err) { return null; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (err) {}
  }

  /* ---------- 播种：八个演示账号，密码统一 ----------
     只在第一次访问（没有 jy-auth-v1）时跑，之后用户自己注册的账号不会被覆盖。
     u1 顺手建立一条会话 —— 这是「演示站点打开就是林深见鹿」的来由，
     不是「已登录还能换号」，换号的入口已经被规则 3 关掉了。 */
  var DEMO_PW = 'jingyu2026';
  function demoAccounts() {
    var out = [];
    var users = (window.DATA && window.DATA.users) || {};
    ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].forEach(function (uid) {
      if (!users[uid]) return;
      out.push({ uid: uid, email: uid + '@jingyu.dev', password: DEMO_PW, name: users[uid].name });
    });
    return out;
  }
  function seed(db) {
    if (db.seeded) return db;
    demoAccounts().forEach(function (a) {
      db.accounts[a.email] = {
        uid: a.uid, email: a.email, name: a.name,
        pass: digest(a.password + '|' + a.email), at: nowMs()
      };
    });
    /* u1 预置会话：演示站点打开即已登录。
       顺手把手机号认证标成已完成 —— 否则第一次访问就会被认证闸门拦在门外，
       连内容都看不到。用户自己注册 / 登录 / 第三方登录的账号照旧要过闸门。 */
    if (db.accounts['u1@jingyu.dev']) {
      /* 号码要同时写进账号本身 —— 只写会话的话，用户退出再登录时
         登录接口读 acc.phone 读不到，会把一个「演示已认证」的账号重新推去认证页。 */
      db.accounts['u1@jingyu.dev'].phone = '13800008888';
      var s1 = newSession('u1', 'u1@jingyu.dev', { phone: '13800008888' });
      db.sessions.u1 = s1;
      db.device = { sid: s1.sid, uid: 'u1' };
    }
    db.seeded = true;
    return db;
  }
  function uaOf() {
    var ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua)) return 'Safari';
    return '浏览器';
  }
  function sigOf(sess) { return digest(sess.sid + '|' + sess.uid + '|' + sess.email + '|' + SECRET); }
  /* 每建一条会话都必须盖签名 —— current() 会逐条校验，漏盖的会话等于「登录即失效」。
     所以建会话只走这一个出口，不在各处手写字面量。 */
  function newSession(uid, email, acc) {
    var s = sid();
    return {
      sid: s, at: nowMs(), ua: uaOf(), email: email,
      phone: (acc && acc.phone) || '', phoneOk: !!(acc && acc.phone),
      sig: sigOf({ sid: s, uid: uid, email: email })
    };
  }

  var DB = load();
  if (!DB) { DB = seed(blank()); save(DB); }
  else if (!DB.seeded) { DB = seed(DB); save(DB); }
  /* 旧存档迁移：早期会话记录没盖 sig，补上，否则老用户刷新一次就被判失效 */
  (function ensureSigs() {
    var dirty = false;
    for (var uid in DB.sessions) {
      var sess = DB.sessions[uid];
      if (sess && !sess.sig) { sess.sig = sigOf({ sid: sess.sid, uid: uid, email: sess.email }); dirty = true; }
    }
    if (dirty) save(DB);
  })();

  /* ---------- 会话校验：每次取状态都过一遍，篡改即失效 ---------- */
  function clearDevice() {
    DB.device = null;
    save(DB);
  }
  function current() {
    var d = DB.device;
    if (!d || !d.uid) return null;
    var sess = DB.sessions[d.uid];
    if (!sess || sess.sid !== d.sid) { clearDevice(); return null; }
    if (!sess.at || nowMs() - sess.at > TTL) { clearDevice(); return null; }
    if (sess.sig !== sigOf({ sid: sess.sid, uid: d.uid, email: sess.email })) { clearDevice(); return null; }
    var acc = DB.accounts[sess.email];
    if (!acc || acc.uid !== d.uid) { clearDevice(); return null; }
    return {
      uid: d.uid, email: sess.email, name: acc.name, sid: sess.sid, at: sess.at, ua: sess.ua,
      /* 手机号认证是「登录流程的最后一步」：闸门状态跟着会话走，刷新也丢不掉 */
      phoneOk: !!sess.phoneOk, phone: sess.phone || ''
    };
  }

  function failLock() {
    var f = DB.fails;
    if (nowMs() - f.at > LOCK_WINDOW) { DB.fails = { n: 0, at: nowMs() }; return false; }
    return f.n >= LOCK_MAX;
  }
  function bumpFail() {
    var f = DB.fails;
    if (nowMs() - f.at > LOCK_WINDOW) { f.n = 0; f.at = nowMs(); }
    f.n += 1;
    save(DB);
  }
  function resetFail() { DB.fails = { n: 0, at: 0 }; }

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254; }
  function normEmail(v) { return String(v || '').trim().toLowerCase(); }

  /* ---------- 注册 ---------- */
  function register(input) {
    var email = normEmail(input && input.email);
    var password = String((input && input.password) || '');
    var name = String((input && input.name) || '').trim();

    /* 已登录时注册 = 「注册个小号再切过去」，是绕过规则 3 的路，必须堵死 */
    var cur = current();
    if (cur) throw AuthError('ALREADY_AUTHED', MSG.ALREADY_AUTHED, { status: 409, nick: cur.name });

    if (!validEmail(email)) throw AuthError('BAD_EMAIL', MSG.BAD_EMAIL, { field: 'email' });
    if (password.length < 8) throw AuthError('WEAK_PASSWORD', MSG.WEAK_PASSWORD, { field: 'password' });
    if (password.length > 200) throw AuthError('PASSWORD_TOO_LONG', MSG.PASSWORD_TOO_LONG, { field: 'password' });
    if (!name) throw AuthError('NAME_REQUIRED', MSG.NAME_REQUIRED, { field: 'name' });
    if (name.length > 16) throw AuthError('NAME_REQUIRED', '昵称最多 16 个字符', { field: 'name' });
    if (DB.accounts[email]) throw AuthError('EMAIL_TAKEN', MSG.EMAIL_TAKEN, { status: 409, field: 'email' });

    var uid = 'n' + Date.now().toString(36);
    var acc = { uid: uid, email: email, name: name, pass: digest(password + '|' + email), at: nowMs() };
    DB.accounts[email] = acc;

    /* 注册即建立会话（与后端一致）：注册完就是这个身份，不需要再输一次密码 */
    var ns = newSession(uid, email, acc);
    DB.sessions[uid] = ns;
    DB.device = { sid: ns.sid, uid: uid };
    resetFail();
    save(DB);
    return {
      ok: true, autoLogin: true,
      /* needPhone：注册等于直接登录，同样要先过手机号认证这一关 */
      needPhone: !acc.phone,
      user: { uid: uid, email: email, name: name }
    };
  }

  /* ---------- 登录 ---------- */
  function login(input) {
    var email = normEmail(input && input.email);
    var password = String((input && input.password) || '');
    var takeover = !!(input && input.takeover);

    var cur = current();
    if (cur) throw AuthError('ALREADY_AUTHED', MSG.ALREADY_AUTHED, { status: 409, nick: cur.name });

    if (failLock()) throw AuthError('TOO_MANY', MSG.TOO_MANY, { status: 429 });
    if (!validEmail(email)) { bumpFail(); throw AuthError('BAD_EMAIL', MSG.BAD_EMAIL, { field: 'email' }); }

    var acc = DB.accounts[email];
    /* 注册前置：没有这条账号记录，密码对错都无从谈起 */
    if (!acc) { bumpFail(); throw AuthError('NOT_REGISTERED', MSG.NOT_REGISTERED, { status: 401, field: 'email' }); }
    if (acc.pass !== digest(password + '|' + email)) {
      bumpFail();
      throw AuthError('BAD_CREDENTIALS', MSG.BAD_CREDENTIALS, { status: 401, field: 'password' });
    }

    var live = DB.sessions[acc.uid];
    if (live && (!takeover || live.sid === (DB.device && DB.device.sid))) {
      /* 同一账号还有一条没退出的会话：默认拒绝，takeover 才顶替 —— 任一时刻会话数恒为 1 */
      throw AuthError('ALREADY_ONLINE', MSG.ALREADY_ONLINE, { status: 409, canTakeover: true, ua: live.ua || '浏览器' });
    }
    var ns = newSession(acc.uid, email, acc);
    DB.sessions[acc.uid] = ns;
    DB.device = { sid: ns.sid, uid: acc.uid };
    resetFail();
    save(DB);
    return { ok: true, replaced: !!live, needPhone: !acc.phone, user: { uid: acc.uid, email: email, name: acc.name } };
  }

  /* ---------- 退出 ---------- */
  function logout() {
    var cur = current();
    if (!cur) { clearDevice(); return { ok: true, already: true }; }
    delete DB.sessions[cur.uid];
    DB.device = null;
    save(DB);
    return { ok: true, uid: cur.uid, name: cur.name };
  }

  /* ---------- 切换账号：这个动作在设计上就不存在成功路径 ---------- */
  function switchTo(uid) {
    var cur = current();
    if (!cur) throw AuthError('NOT_AUTHED', MSG.NOT_AUTHED, { status: 401 });
    throw AuthError('AUTH_LOCKED', MSG.AUTH_LOCKED, { status: 409, from: cur.uid, to: uid || '' });
  }

  function requireLogin() {
    var cur = current();
    if (!cur) throw AuthError('NOT_AUTHED', MSG.NOT_AUTHED, { status: 401 });
    return cur;
  }

  /* 供页面渲染：guest 时不返回任何身份字段，避免「没登录但读得到别人资料」 */
  function state() {
    var cur = current();
    if (!cur) return { mode: 'guest', uid: '', email: '', name: '', sid: '', at: 0, phoneOk: false, phone: '' };
    return {
      mode: 'authed', uid: cur.uid, email: cur.email, name: cur.name, sid: cur.sid, at: cur.at, ua: cur.ua,
      phoneOk: cur.phoneOk, phone: maskPhone(cur.phone)
    };
  }

  /* ---------- 手机号 ----------
     需求：登录之后必须先过手机号认证，才能进站内。
     这一层只管「认证状态」，不碰页面：页面读 state().phoneOk 决定画什么。
     演示态没有短信通道，验证码回显在接口返回值里（devCode），真实实现换成服务商即可。 */
  var PHONE_RE = /^1[3-9]\d{9}$/;
  var CODE_TTL = 5 * 60 * 1000;        /* 验证码 5 分钟有效 */
  var CODE_COOLDOWN = 60 * 1000;       /* 同一号码 60 秒内不许重发 */
  var CODE_MAX_TRY = 5;                /* 一条验证码最多试 5 次 */

  function maskPhone(p) {
    var s = String(p || '');
    if (!PHONE_RE.test(s)) return '';
    return s.slice(0, 3) + '****' + s.slice(7);
  }

  /* 发码：先校验格式 → 冷却 → 换新码。旧码直接作废，不给「新旧两个都能用」的窗口 */
  function sendPhoneCode(rawPhone) {
    var cur = current();
    if (!cur) throw AuthError('NOT_AUTHED', MSG.NOT_AUTHED, { status: 401 });
    var phone = String(rawPhone || '').replace(/\s|-/g, '');
    if (!PHONE_RE.test(phone)) throw AuthError('BAD_PHONE', MSG.BAD_PHONE, { status: 400, field: 'phone' });

    /* 一个手机号只能绑一个账号：已经属于别人的号，发码之前就拦住 */
    for (var email in DB.accounts) {
      var a = DB.accounts[email];
      if (a && a.phone === phone && a.uid !== cur.uid) {
        throw AuthError('PHONE_TAKEN', MSG.PHONE_TAKEN, { status: 409, field: 'phone' });
      }
    }

    var old = DB.codes[phone];
    if (old && nowMs() - old.at < CODE_COOLDOWN) {
      var wait = Math.ceil((CODE_COOLDOWN - (nowMs() - old.at)) / 1000);
      throw AuthError('CODE_TOO_MANY', '验证码刚发过，' + wait + ' 秒后再试', { status: 429, field: 'phone', wait: wait });
    }

    var code = String(Math.floor(100000 + Math.random() * 900000));
    DB.codes[phone] = { code: code, at: nowMs(), expires: nowMs() + CODE_TTL, tries: 0 };
    save(DB);
    /* devCode 只在演示态回显：没有短信通道，不回显就没法走完认证 */
    return { ok: true, phone: phone, masked: maskPhone(phone), ttl: CODE_TTL / 1000, cooldown: CODE_COOLDOWN / 1000, devCode: code };
  }

  /* 校验验证码：码对了才写 phoneOk，并把号码挂到账号上（下次登录就不用再验） */
  function verifyPhoneCode(rawPhone, rawCode) {
    var cur = current();
    if (!cur) throw AuthError('NOT_AUTHED', MSG.NOT_AUTHED, { status: 401 });
    var phone = String(rawPhone || '').replace(/\s|-/g, '');
    var code = String(rawCode || '').replace(/\s/g, '');
    if (!PHONE_RE.test(phone)) throw AuthError('BAD_PHONE', MSG.BAD_PHONE, { status: 400, field: 'phone' });

    var rec = DB.codes[phone];
    if (!rec || nowMs() > rec.expires) {
      delete DB.codes[phone];
      save(DB);
      throw AuthError('CODE_EXPIRED', MSG.CODE_EXPIRED, { status: 400, field: 'code' });
    }
    if (rec.tries >= CODE_MAX_TRY) {
      delete DB.codes[phone];
      save(DB);
      throw AuthError('CODE_TOO_MANY', MSG.CODE_TOO_MANY, { status: 429, field: 'code' });
    }
    if (rec.code !== code) {
      rec.tries += 1;
      save(DB);
      var left = CODE_MAX_TRY - rec.tries;
      throw AuthError('CODE_WRONG', MSG.CODE_WRONG + (left > 0 ? '（还能试 ' + left + ' 次）' : ''), { status: 400, field: 'code', left: left });
    }

    var sess = DB.sessions[cur.uid];
    if (!sess) throw AuthError('SESSION_INVALID', MSG.SESSION_INVALID, { status: 401 });
    sess.phone = phone;
    sess.phoneOk = true;
    var acc = DB.accounts[sess.email];
    if (acc) acc.phone = phone;
    delete DB.codes[phone];
    save(DB);
    return { ok: true, phone: maskPhone(phone), verified: true };
  }

  /* 认证闸门：已登录但没过手机号，除了认证页哪儿都不许进 */
  function needPhone() {
    var cur = current();
    return !!cur && !cur.phoneOk;
  }

  /* ---------- 第三方登录 ----------
     QQ / 微信 / GitHub 三家。真实实现是「跳授权页 → 回调拿 code → 后端换 token」，
     演示态没有 client id，这里用同一条状态机跑本地模拟：
       oauthStart(provider) 生成 state 并返回跳转目标（演示态是站内回调）
       oauthComplete(provider, profile) 建/取账号 → 建会话 → needPhone = true
     接真通道时只换掉这两个函数的内部，页面与闸门不用改。 */
  var PROVIDERS = [
    { id: 'qq', name: 'QQ', icon: '🐧', color: '#12b7f5' },
    { id: 'wechat', name: '微信', icon: '💬', color: '#07c160' },
    { id: 'github', name: 'GitHub', icon: '🐙', color: '#24292f' }
  ];
  function providerOf(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return null;
  }
  function oauthStart(providerId) {
    var p = providerOf(providerId);
    if (!p) throw AuthError('OAUTH_OFF', MSG.OAUTH_OFF, { status: 501 });
    var cur = current();
    if (cur) throw AuthError('ALREADY_AUTHED', MSG.ALREADY_AUTHED, { status: 409, nick: cur.name });
    var state = 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    DB.oauthState = { state: state, provider: p.id, at: nowMs() };
    save(DB);
    return { ok: true, provider: p.id, name: p.name, state: state, demo: true };
  }
  /* 演示态用固定昵称池，保证「同一个人再点一次」拿到同一个 openid（续登而不是造新号） */
  function oauthComplete(providerId, profile) {
    var p = providerOf(providerId);
    if (!p) throw AuthError('OAUTH_OFF', MSG.OAUTH_OFF, { status: 501 });
    var cur = current();
    if (cur) throw AuthError('ALREADY_AUTHED', MSG.ALREADY_AUTHED, { status: 409, nick: cur.name });

    var st = DB.oauthState;
    if (!st || st.provider !== p.id) throw AuthError('OAUTH_FAILED', MSG.OAUTH_FAILED, { status: 400 });
    delete DB.oauthState;

    var prof = profile || {};
    var openId = prof.openId || (p.id + '_' + nowMs().toString(36));
    var email = p.id + '_' + openId + '@oauth.local';
    var acc = DB.accounts[email];
    if (!acc) {
      acc = {
        uid: 'o' + Date.now().toString(36),
        email: email,
        name: (prof.name || p.name + '用户').slice(0, 16),
        pass: '',                       /* 第三方账号没有密码，登录入口只有授权 */
        provider: p.id,
        openId: openId,
        at: nowMs()
      };
      DB.accounts[email] = acc;
    }
    var ns = newSession(acc.uid, email, acc);
    DB.sessions[acc.uid] = ns;
    DB.device = { sid: ns.sid, uid: acc.uid };
    resetFail();
    save(DB);
    return { ok: true, provider: p.id, name: p.name, needPhone: !acc.phone, user: { uid: acc.uid, email: email, name: acc.name } };
  }

  /* 当前账号完整档案（设置页要用邮箱、会话创建时间、设备与手机号） */
  function accountInfo() {
    var cur = current();
    if (!cur) return null;
    var sess = DB.sessions[cur.uid] || {};
    return {
      uid: cur.uid, email: cur.email, name: cur.name,
      provider: (DB.accounts[cur.email] || {}).provider || '',
      phone: maskPhone(sess.phone), phoneOk: !!sess.phoneOk,
      sid: cur.sid, ua: cur.ua, at: cur.at, expiresAt: (cur.at || 0) + TTL
    };
  }

  window.AUTH = {
    MSG: MSG,
    demoAccounts: demoAccounts,
    demoPassword: DEMO_PW,
    state: state,
    me: function () { var s = state(); return s.mode === 'authed' ? s.uid : null; },
    register: register,
    login: login,
    logout: logout,
    switchTo: switchTo,
    requireLogin: requireLogin,
    /* 手机号认证 */
    sendPhoneCode: sendPhoneCode,
    verifyPhoneCode: verifyPhoneCode,
    needPhone: needPhone,
    maskPhone: maskPhone,
    /* 第三方 */
    providers: PROVIDERS,
    providerOf: providerOf,
    oauthStart: oauthStart,
    oauthComplete: oauthComplete,
    /* 设置页 */
    accountInfo: accountInfo,
    /* 只给测试用：读整份存储，验证「会话表里每个账号至多一条」 */
    _dump: function () { return JSON.parse(JSON.stringify(DB)); },
    _reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} DB = seed(blank()); save(DB); }
  };
})();
