/* ================= 鲸域 · 登录内核（服务端会话版） ================= */
/*
  这一层的职责没变：把「谁能登录、登录后能不能换号、手机号认证过没过」关在一个地方，
  页面只读它的结论（AUTH.state()），不自己判断身份。

  变的是权威从哪来 —— v18 起服务端是唯一权威：
    · 身份来自 httpOnly Cookie（jingyu_token）+ GET /api/auth/me，
      前端再也拿不到 token，也就没法「改 localStorage 把自己改成别人」；
    · 登录 / 注册 / 登出 / 发码 / 验码 全部落库（sessions / phone_codes 表），
      前端只负责把结果翻译成页面要的形状；
    · 本地只保留一份内存快照 CACHE，作用仅有两个：同步渲染（页面要同步知道「我是谁」）、
      以及在 /me 还没回来时不要闪一帧错误状态。它不写 localStorage，刷新即失效，
      所以不存在「离线改身份」这条路。

  对外契约（js/app.js 依赖，别改签名）：
    state() 同步返回当前身份快照；login/register/logout/... 返回 Promise；
    失败抛 Error，带 .code（与服务端错误码同名）与 .message（给人看的中文）。
*/
(function () {
  'use strict';

  var BASE = (window.DSH_API_BASE || '') + '/api';

  /* 内存快照：{ user, session }，只由 refresh()/login()/register() 写 */
  var CACHE = { user: null, session: null, at: 0 };

  /* ---------- 错误码 → 人话 ----------
     服务端 server/src/http.js 的 MSG 是同一套码；这里保留自己的文案，
     因为前端要控制语气（比如未注册时顺手把用户推去注册 tab）。 */
  var MSG = {
    BAD_EMAIL: '邮箱格式不对，检查一下有没有漏掉 @ 或域名',
    WEAK_PASSWORD: '密码至少 8 位',
    PASSWORD_TOO_LONG: '密码太长了，200 位以内',
    PASSWORD_MISMATCH: '两次输入的密码不一样',
    NAME_REQUIRED: '昵称不能为空',
    EMAIL_TAKEN: '这个邮箱已经注册过了，直接登录或换个邮箱',
    NOT_REGISTERED: '这个邮箱还没注册，先去注册一个账号',
    BAD_CREDENTIALS: '邮箱或密码不对',
    ALREADY_AUTHED: '当前已经登录，同一时间只能登录一个账户；要换账号请先退出登录',
    ALREADY_ONLINE: '这个账号在这台设备上已经登录了，同一设备同一时间只保留一条会话（手机和电脑可以同时在线）',
    AUTH_LOCKED: '登录状态已建立，不能在本会话内切换账户；要换账号请先退出登录',
    NOT_AUTHED: '请先登录再操作',
    SESSION_INVALID: '登录状态已失效，请重新登录',
    TOO_MANY: '尝试太频繁了，过几分钟再试',
    BAD_PHONE: '手机号格式不对，填 11 位大陆号码就行',
    CODE_EXPIRED: '验证码过期了，重新获取一条',
    CODE_WRONG: '验证码不对，再看一眼短信',
    CODE_TOO_MANY: '这个验证码错太多次了，重新获取一条',
    PHONE_TAKEN: '这个手机号已经绑过别的账号了',
    PHONE_REQUIRED: '先把手机号认证走完，再进站内',
    OAUTH_OFF: '这个第三方登录还没配置，需要先填 Client ID 与回调域名',
    OAUTH_FAILED: '第三方授权没有完成，再试一次',
    NETWORK: '连不上服务端，检查网络后重试'
  };

  /* ---------- 基础请求：cookie 同源带上，永不把 token 放进 JS ---------- */
  function req(path, opts) {
    var o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
    if (o.body && typeof o.body !== 'string') {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    return fetch(BASE + path, o).then(function (res) {
      return res.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        if (!res.ok || !json || json.ok === false) {
          var code = (json && json.error && json.error.code) || ('HTTP_' + res.status);
          var err = new Error((json && json.error && json.error.message) || ('请求失败 ' + res.status));
          err.code = code;
          err.status = res.status;
          err.data = (json && json.data) || null;
          throw err;
        }
        return json.data;
      });
    }, function () {
      var e = new Error(MSG.NETWORK);
      e.code = 'NETWORK';
      e.status = 0;
      throw e;
    });
  }

  /** 把服务端错误码翻成本地文案；调用方只关心 code 与 message */
  function translate(err) {
    if (!err) return err;
    if (err.code && MSG[err.code]) err.message = MSG[err.code];
    /* 顶替登录需要的元信息在 data 里（服务端 fail() 把 extras 放 data） */
    if (err.data) {
      if (err.data.canTakeover) err.canTakeover = true;
      if (err.data.ua) err.ua = err.data.ua;
      /* v46：顶替只在「同一设备」上发生，提示里得说清楚是哪一台 */
      if (err.data.device) err.device = err.data.device;
      if (err.data.label) err.label = err.data.label;
      if (typeof err.data.wait === 'number') err.wait = err.data.wait;
    }
    return err;
  }
  function fail(err) { throw translate(err); }

  /* ---------- 快照 ---------- */
  function setSession(user, session) {
    CACHE.user = user || null;
    CACHE.session = session || null;
    CACHE.at = Date.now();
  }
  function clearSession() { setSession(null, null); }

  /** 服务端用户 id 是数字，前端 users 表的键是 's'+id（v41 起与 data.js 的演示账号 u1..u8 分开，
   * 否则 id<=8 的真实账号会直接继承演示人的粉丝数、签名和城市；js/api.js 的 remember() 用同一规则） */
  function viewUser(u) {
    if (!u) return null;
    return {
      uid: 's' + u.id,
      id: u.id,
      email: CACHE.user && CACHE.user.email ? CACHE.user.email : '',
      name: u.name || '',
      emoji: u.emoji || '',
      /* 资料字段从服务端带出来：app.js 的 adoptAccount() 拿它回填 users 表，
         否则改名/换头像之后刷新页面又变回注册时那份（本地存档只活在这台机器上）。 */
      sig: u.sig || '',
      city: u.city || '',
      grad: u.grad || '',
      avatar: u.avatar || '',
      phoneMasked: u.phoneMasked || '',
      phoneVerified: !!u.phoneVerified
    };
  }

  /** 同步身份快照：页面每一帧都会读它，所以只能是同步的 */
  function state() {
    var u = CACHE.user;
    if (!u) return { mode: 'guest', uid: '', email: '', name: '', sid: '', at: 0, ua: '', phoneOk: false, phone: '' };
    var s = CACHE.session || {};
    return {
      mode: 'authed',
      uid: 's' + u.id,
      email: u.email || '',
      name: u.name || '',
      sig: u.sig || '',
      city: u.city || '',
      emoji: u.emoji || '',
      grad: u.grad || '',
      avatar: u.avatar || '',
      sid: s.sid || '',
      /* 会话建立时间取自 /auth/me 的 session.createdAt（服务端给的是秒），
         不是账号注册时间 —— 设置页写的是「建立于」，得对得上。 */
      at: s.createdAt || 0,
      ua: s.ua || '浏览器',
      phoneOk: !!u.phoneVerified,
      phone: u.phoneMasked || ''
    };
  }

  /* ---------- 与后端的身份同步 ---------- */
  function refresh() {
    return req('/auth/me').then(function (d) {
      setSession(d.user, d.session);
      return state();
    }, function (err) {
      /* 401 = 本来就没登录，不是错误；其他错误保持快照不变（网络抖动不该把人踢下线） */
      if (err && err.status === 401) clearSession();
      return state();
    });
  }

  function register(input) {
    var email = String((input && input.email) || '').trim().toLowerCase();
    var password = String((input && input.password) || '');
    var password2 = input && input.password2 != null ? String(input.password2) : null;
    var name = String((input && input.name) || '').trim();

    if (!name) return Promise.reject(translate(new Error(MSG.NAME_REQUIRED)));
    if (password2 !== null && password2 !== '' && password2 !== password) {
      var m = new Error(MSG.PASSWORD_MISMATCH);
      m.code = 'PASSWORD_MISMATCH';
      return Promise.reject(m);
    }
    return req('/auth/register', { method: 'POST', body: { email: email, password: password, name: name } })
      .then(function (d) {
        setSession(d.user, d.session);
        return { ok: true, autoLogin: true, needPhone: false, user: viewUser(d.user) };
      }, fail);
  }

  function login(input) {
    var email = String((input && input.email) || '').trim().toLowerCase();
    var password = String((input && input.password) || '');
    var body = { email: email, password: password };
    if (input && input.takeover) body.takeover = true;
    return req('/auth/login', { method: 'POST', body: body }).then(function (d) {
      setSession(d.user, d.session);
      return { ok: true, replaced: !!d.replaced, needPhone: false, user: viewUser(d.user) };
    }, fail);
  }

  function logout() {
    return req('/auth/logout', { method: 'POST' }).then(function () {
      clearSession();
      return { ok: true };
    }, function (err) {
      /* 服务端 5xx 时本地也要退：留着快照只会让界面显示一个已经不像话的登录态 */
      clearSession();
      return Promise.reject(translate(err));
    });
  }

  /* ---------- 登录设备（v46 多端同时在线） ----------
     服务端一个账号最多两条并行会话：手机一条、电脑一条。
     这里三个函数都给「当前账号自己的」会话用，key 只是 sid 前 8 位，拼不出可用的 token。 */
  function devices() {
    return req('/auth/sessions').then(function (d) { return (d && d.sessions) || []; }, fail);
  }

  /** 退出指定那台设备（同设备新登录也会顶掉它，这个是手动踢） */
  function kickDevice(key) {
    return req('/auth/sessions/revoke', { method: 'POST', body: { key: String(key || '') } })
      .then(function (d) { return { ok: true, revoked: (d && d.revoked) || 0 }; }, fail);
  }

  /** 退出「除当前这台以外」的全部设备 */
  function kickOthers() {
    return req('/auth/sessions/revoke', { method: 'POST', body: { others: true } })
      .then(function (d) { return { ok: true, revoked: (d && d.revoked) || 0 }; }, fail);
  }

  /** 换号在设计上就没有成功分支：服务端恒 409 AUTH_LOCKED */
  function switchTo(uid) {
    return req('/auth/switch', { method: 'POST', body: { uid: String(uid || '') } }).then(function (d) {
      return d;
    }, fail).then(function () {
      var e = new Error(MSG.AUTH_LOCKED);
      e.code = 'AUTH_LOCKED';
      throw e;
    });
  }

  function requireLogin() {
    if (!CACHE.user) {
      var e = new Error(MSG.NOT_AUTHED);
      e.code = 'NOT_AUTHED';
      e.status = 401;
      throw e;
    }
    return state();
  }

  /* ---------- 手机号认证 ---------- */
  var PHONE_RE = /^1[3-9]\d{9}$/;

  function maskPhone(v) {
    var s = String(v == null ? '' : v);
    if (!PHONE_RE.test(s)) return '';
    return s.slice(0, 3) + '****' + s.slice(-4);
  }

  function sendPhoneCode(rawPhone) {
    var phone = String(rawPhone || '').replace(/[\s-]/g, '');
    if (!PHONE_RE.test(phone)) {
      var e = new Error(MSG.BAD_PHONE);
      e.code = 'BAD_PHONE';
      return Promise.reject(e);
    }
    return req('/auth/phone/send', { method: 'POST', body: { phone: phone } }).then(function (d) {
      /* delivered 由服务端判定：没接短信通道时是 false，上层据此改文案，别对用户说「已发送」 */
      return { ok: true, phone: d.phone, masked: d.phoneMasked || maskPhone(phone), ttl: d.ttl, cooldown: d.cooldown, devCode: d.devCode || '', delivered: d.delivered !== false, channel: d.channel || '' };
    }, fail);
  }

  function verifyPhoneCode(rawPhone, rawCode) {
    var phone = String(rawPhone || '').replace(/[\s-]/g, '');
    var code = String(rawCode || '').replace(/\s/g, '');
    return req('/auth/phone/verify', { method: 'POST', body: { phone: phone, code: code } }).then(function (d) {
      if (CACHE.user) CACHE.user.phoneVerified = true;
      if (CACHE.user) CACHE.user.phoneMasked = d.phone || maskPhone(phone);
      return { ok: true, phone: d.phone || maskPhone(phone), verified: true };
    }, fail);
  }

  function needPhone() {
    /* 手机号认证已下线，不再把「没绑手机」当条件 */
    return false;
  }

  /* ---------- 第三方登录 ----------
     provider 列表来自服务端 /api/auth/oauth/providers：只有服务端配了 Client ID
     的渠道才会 enabled=true，前端据此决定按钮是否可点 —— 不再有「点了弹一句没配置」。 */
  var PROVIDERS = [
    { id: 'qq', name: 'QQ', icon: '🐧', color: '#12b7f5', enabled: false },
    { id: 'wechat', name: '微信', icon: '💬', color: '#2aae67', enabled: false },
    { id: 'github', name: 'GitHub', icon: '🐙', color: '#24292f', enabled: false }
  ];

  function loadProviders() {
    return req('/auth/oauth/providers').then(function (d) {
      var list = (d && d.providers) || [];
      if (!list.length) return PROVIDERS;
      var merged = list.map(function (p) {
        var base = PROVIDERS.filter(function (x) { return x.id === p.id; })[0] || {};
        return {
          id: p.id,
          name: p.name || base.name || p.id,
          icon: p.icon || base.icon || '🔗',
          color: p.color || base.color || '#5b6b7f',
          enabled: !!p.enabled
        };
      });
      PROVIDERS.length = 0;
      merged.forEach(function (p) { PROVIDERS.push(p); });
      return PROVIDERS;
    }, function () { return PROVIDERS; });
  }

  function providerOf(id) {
    return PROVIDERS.filter(function (p) { return p.id === id; })[0] || null;
  }

  /** 整页跳转到服务端的授权地址；回调由服务端处理并回写 Cookie */
  function oauthStart(id) {
    var p = providerOf(id);
    if (!p || !p.enabled) {
      var e = new Error(MSG.OAUTH_OFF);
      e.code = 'OAUTH_OFF';
      throw e;
    }
    var back = encodeURIComponent(location.pathname + location.hash);
    location.assign(BASE + '/auth/oauth/' + encodeURIComponent(id) + '/start?redirect=' + back);
    return { ok: true, redirecting: true };
  }

  /** 回调页回来之后收尾：服务端已经写好 Cookie，这里只需要把身份拉回来 */
  function oauthComplete(id) {
    return refresh().then(function (st) {
      if (st.mode !== 'authed') {
        var e = new Error(MSG.OAUTH_FAILED);
        e.code = 'OAUTH_FAILED';
        throw e;
      }
      var p = providerOf(id);
      return { ok: true, provider: (p && p.name) || id, needPhone: false, user: { uid: st.uid, name: st.name } };
    });
  }

  /* ---------- 设置页要用完整档案 ---------- */
  function accountInfo() {
    var u = CACHE.user;
    if (!u) return null;
    var s = CACHE.session || {};
    return {
      uid: 's' + u.id,
      id: u.id,
      email: u.email || '',
      name: u.name || '',
      provider: u.provider || '',
      phone: u.phoneMasked || '',
      phoneOk: !!u.phoneVerified,
      sid: s.sid || '',
      ua: s.ua || '浏览器',
      at: s.createdAt || 0,
      expiresAt: s.expiresAt || 0
    };
  }

  /* ---------- 启动：一次 /me + 一次 providers ----------
     app.js 会等 AUTH.ready 再画第一帧（带 1.2s 超时兜底），
     这样不会出现「先画未登录、再跳成已登录」的闪烁。 */
  var READY = false;
  var ready = Promise.all([refresh(), loadProviders()]).then(function (r) {
    READY = true;
    return r[0];
  }, function () {
    READY = true;
    return state();
  });

  window.AUTH = {
    MSG: MSG,
    state: state,
    me: function () { var s = state(); return s.mode === 'authed' ? s.uid : null; },
    refresh: refresh,
    ready: ready,
    isReady: function () { return READY; },
    register: register,
    login: login,
    logout: logout,
    devices: devices,
    kickDevice: kickDevice,
    kickOthers: kickOthers,
    switchTo: switchTo,
    requireLogin: requireLogin,
    sendPhoneCode: sendPhoneCode,
    verifyPhoneCode: verifyPhoneCode,
    needPhone: needPhone,
    maskPhone: maskPhone,
    providers: PROVIDERS,
    providerOf: providerOf,
    oauthStart: oauthStart,
    oauthComplete: oauthComplete,
    accountInfo: accountInfo,
    /* 调试用：不落盘，只回内存快照 */
    _dump: function () { return JSON.parse(JSON.stringify(CACHE)); }
  };
})();
