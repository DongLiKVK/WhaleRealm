/* ═══════════════════════════════════════════════════════════════════════════
   鲸域 · 控制台 — 外壳（shell.js）
   ---------------------------------------------------------------------------
   两块东西：
   1) 登录页：整屏左右分栏。左侧是"产品是谁"（深蓝、鲸鱼线稿、三条能力），
      右侧是"怎么进去"（380px 卡）。登录成功把身份交给 boot，由 boot 决定
      是否保留 hash。
   2) 应用外壳：侧栏 + 顶栏 + 路由分发。导航按权限过滤（无权限的项直接不渲染，
      而不是禁用 —— 看不见的入口比灰掉的按钮更少困扰）。
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  VERSION, api, store, can, setAdmin, router, theme,
  toast, openModal, confirmDialog, icon, whaleMark, avatar,
  esc, fmt, on, logout, delegate, errText, DEMO,
} from './core.js';

import dashboard from './page-dashboard.js';
import posts from './page-posts.js';
import users from './page-users.js';
import rewards from './page-rewards.js';
import roles from './page-roles.js';
import logs from './page-logs.js';
import plugins from './page-plugins.js';
import reports from './page-reports.js';

/* 页面元信息集中在这里：路由、导航、面包屑、标题都读同一份，
   少一个"改了导航忘了改标题"的机会。
   插件审核与举报处理放在「运营」组紧跟帖子管理之后：它们和帖子的审核是同一类日常动作
   （看 backlog → 判 → 记理由），而举报是内容风险的入口，运营每天要先看它。 */
const PAGES = { dashboard, posts, plugins, reports, users, rewards, roles, logs };

const NAV = [
  { group: '运营', items: [
    { name: 'dashboard', label: '工作台', kind: 'dashboard' },
    { name: 'posts', label: '帖子管理', kind: 'posts' },
    { name: 'plugins', label: '插件审核', kind: 'inbox' },
    { name: 'reports', label: '举报处理', kind: 'alert' },
    { name: 'users', label: '用户管理', kind: 'users' },
    { name: 'rewards', label: '奖励发放', kind: 'rewards' },
  ] },
  { group: '账号', items: [
    { name: 'roles', label: '权限管理', kind: 'roles' },
  ] },
  { group: '系统', items: [
    { name: 'logs', label: '操作日志', kind: 'logs' },
  ] },
];

function pageMeta(name) {
  const m = PAGES[name] || {};
  return { title: m.title || name, perm: m.perm || '', desc: m.desc || '' };
}
function groupOf(name) {
  for (const g of NAV) if (g.items.some((i) => i.name === name)) return g.group;
  return '';
}
function navAllowed(item) {
  const meta = pageMeta(item.name);
  return !meta.perm || can(meta.perm);
}
function firstAllowed() {
  for (const g of NAV) for (const it of g.items) if (navAllowed(it)) return it.name;
  return '';
}

/* ───────────────────────── 登录页 ───────────────────────── */
export function showLogin(root, opts) {
  const o = opts || {};
  theme.restore();
  document.title = '登录 · 鲸域控制台';
  const demo = !!store.mock;

  root.innerHTML =
    '<div class="login">' +
      '<section class="login-brand">' +
        '<div class="login-whale" aria-hidden="true">' + whaleMark() + '</div>' +
        '<div class="login-top">' +
          '<span class="login-mark">' + whaleMark() + '</span>' +
          '<div class="login-word"><b>鲸域</b><span>控制台</span></div>' +
        '</div>' +
        '<div class="login-hero">' +
          '<h1>让社区的秩序，<br>有一套清楚的做法。</h1>' +
          '<p>内容审核、成员管理、积分发放与权限分配，收敛在同一个后台里。每天打开它，就知道今天该处理什么。</p>' +
        '</div>' +
        '<div class="login-caps">' +
          '<div class="login-cap">' + icon('posts') + '<div><b>内容审核有闭环</b><p>待审队列、批量处理、审核备注，每一次判断都留下记录。</p></div></div>' +
          '<div class="login-cap">' + icon('users') + '<div><b>成员与积分一处管理</b><p>用户画像、等级徽章、奖励发放与撤回，不用在几个页面之间跳。</p></div></div>' +
          '<div class="login-cap">' + icon('shield') + '<div><b>权限与审计分得清</b><p>18 项权限按角色分配，操作日志可追溯到人、可导出备查。</p></div></div>' +
        '</div>' +
        '<div class="login-fine"><span>whalerealm.top</span><span>独立后台管理系统</span></div>' +
      '</section>' +
      '<section class="login-side">' +
        '<form class="login-card" id="login-form" novalidate>' +
          '<div class="login-eyebrow">管理后台</div>' +
          '<h2 id="lg-title">登录控制台</h2>' +
          '<p class="login-lead" id="lg-lead">使用管理员账号继续。连续 5 次失败会锁定 15 分钟。</p>' +
          '<div class="login-alerts">' +
            '<div class="login-err hide" id="login-err" role="alert"></div>' +
            '<div class="login-lock hide" id="login-lock">' + icon('clock') + '<span>尝试次数过多，请在 <b class="num" id="lock-num">--</b> 后再试</span></div>' +
          '</div>' +
          '<div class="login-form" id="step-password">' +
            '<div class="field">' +
              '<label for="lg-account">账号</label>' +
              '<input class="input" id="lg-account" name="account" type="text" autocomplete="username" spellcheck="false" autofocus placeholder="管理员账号">' +
            '</div>' +
            '<div class="field">' +
              '<label for="lg-password">密码</label>' +
              '<div class="input-wrap">' +
                icon('shield') +
                '<input class="input" id="lg-password" name="password" type="password" autocomplete="current-password" placeholder="登录密码">' +
                '<span class="trail"><button class="icon-btn" type="button" id="pw-toggle" aria-label="显示密码" aria-pressed="false">' + icon('eye') + '</button></span>' +
              '</div>' +
              '<div class="hint hide" id="caps-hint">大写锁定已开启</div>' +
            '</div>' +
            '<button class="btn btn--primary btn--lg btn--block login-submit" type="submit" id="login-submit">登录控制台</button>' +
          '</div>' +
          '<div class="login-form hide" id="step-2fa">' +
            '<div class="twofa-enroll hide" id="twofa-enroll">' +
              '<div class="qr-box" id="twofa-qr" aria-label="两步验证二维码"></div>' +
              '<div class="secret-line"><span>手动输入密钥</span><code id="twofa-secret"></code></div>' +
              '<p class="login-note">用验证器 App（Google Authenticator / 1Password / Microsoft Authenticator）扫描二维码；扫不了就手动输入上面的密钥。绑定后每次登录都要输 6 位码。</p>' +
            '</div>' +
            '<div class="field">' +
              '<div class="label-row"><label for="lg-code" id="code-label">6 位验证码</label><button class="link-btn" type="button" id="twofa-alt">使用恢复码</button></div>' +
              '<input class="input code-input" id="lg-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" spellcheck="false">' +
            '</div>' +
            '<button class="btn btn--primary btn--lg btn--block login-submit" type="submit" id="twofa-submit">验证并登录</button>' +
            '<button class="login-back" type="button" id="twofa-back">返回上一步</button>' +
          '</div>' +
          '<div class="login-form hide" id="step-codes">' +
            '<p class="login-note login-note--warn">这些恢复码只显示这一次。每个只能用一次，请现在抄到离线位置；设备丢失时用它登录。</p>' +
            '<div class="recovery-list" id="recovery-list"></div>' +
            '<label class="check-line"><input type="checkbox" id="codes-saved"> 我已保存这些恢复码</label>' +
            '<button class="btn btn--primary btn--lg btn--block login-submit" type="button" id="codes-continue" disabled>进入控制台</button>' +
          '</div>' +
          (demo
            ? '<div class="login-demo">后端接口尚未接入，当前运行在<b>演示数据</b>：账号 <code>' + DEMO.account + '</code> · 密码 <code>' + DEMO.password + '</code></div>'
            : '') +
          '<div class="login-card-ft"><span>仅限授权管理员</span><span class="ver">' + VERSION + '</span></div>' +
        '</form>' +
      '</section>' +
    '</div>';

  const form = root.querySelector('#login-form');
  const accEl = root.querySelector('#lg-account');
  const pwEl = root.querySelector('#lg-password');
  const errEl = root.querySelector('#login-err');
  const lockEl = root.querySelector('#login-lock');
  const lockNum = root.querySelector('#lock-num');
  const submit = root.querySelector('#login-submit');
  const caps = root.querySelector('#caps-hint');
  const toggle = root.querySelector('#pw-toggle');

  const titleEl = root.querySelector('#lg-title');
  const leadEl = root.querySelector('#lg-lead');
  const stepPw = root.querySelector('#step-password');
  const step2 = root.querySelector('#step-2fa');
  const stepCodes = root.querySelector('#step-codes');
  const enrollBox = root.querySelector('#twofa-enroll');
  const qrEl = root.querySelector('#twofa-qr');
  const secretEl = root.querySelector('#twofa-secret');
  const codeEl = root.querySelector('#lg-code');
  const codeLabel = root.querySelector('#code-label');
  const twoSubmit = root.querySelector('#twofa-submit');
  const twoAlt = root.querySelector('#twofa-alt');
  const twoBack = root.querySelector('#twofa-back');
  const recoveryList = root.querySelector('#recovery-list');
  const codesSaved = root.querySelector('#codes-saved');
  const codesContinue = root.querySelector('#codes-continue');

  const STEP_TEXT = {
    password: ['登录控制台', '使用管理员账号继续。连续 5 次失败会锁定 15 分钟。'],
    verify: ['两步验证', '输入验证器 App 里的 6 位数字，完成这次登录。'],
    enroll: ['绑定两步验证', '这个账号必须开启两步验证。扫码后输入验证器显示的 6 位数字。'],
    codes: ['恢复码', '这 8 个码只显示一次，请离线保存；每个只能用一次。']
  };

  let busy = false;
  let lockTimer = 0;
  let lockUntil = 0;
  let step = 'password';
  let challenge = '';
  let mode = '';
  let usingRecovery = false;
  let pendingAdmin = null;
  let pendingCodes = [];

  function setErr(msg) {
    if (!msg) { errEl.classList.add('hide'); errEl.innerHTML = ''; return; }
    errEl.innerHTML = icon('alert') + '<span>' + esc(msg) + '</span>';
    errEl.classList.remove('hide');
  }

  function paintBusy() {
    const locked = lockUntil > Date.now();
    const dis = busy || locked;
    submit.disabled = dis;
    twoSubmit.disabled = dis;
    const spin = '<span class="btn-spinner"></span>';
    if (locked) {
      submit.innerHTML = spin + '已锁定，稍后再试';
      twoSubmit.innerHTML = spin + '已锁定，稍后再试';
      return;
    }
    submit.innerHTML = busy && step === 'password' ? spin + '正在验证…' : '登录控制台';
    twoSubmit.innerHTML = busy && step === '2fa' ? spin + '正在验证…' : '验证并登录';
  }

  function setBusy(v) { busy = v; paintBusy(); }

  function setStep(name) {
    step = name;
    stepPw.classList.toggle('hide', name !== 'password');
    step2.classList.toggle('hide', name !== '2fa');
    stepCodes.classList.toggle('hide', name !== 'codes');
    /* 步骤名 '2fa' 是「哪一块表单」，文案还要按 enroll/verify 再分一次：
       首次绑定要讲扫码，日常登录只讲 6 位码，两者提示不能混。 */
    const textKey = name === '2fa' ? (mode === 'enroll' ? 'enroll' : 'verify') : name;
    const t = STEP_TEXT[textKey] || STEP_TEXT.password;
    titleEl.textContent = t[0];
    leadEl.textContent = t[1];
    paintBusy();
  }

  function focusCurrent() {
    const el = step === 'password' ? accEl : (step === '2fa' ? codeEl : null);
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function startLock(sec) {
    const left = Math.max(1, Math.round(Number(sec) || 900));
    lockUntil = Date.now() + left * 1000;
    lockEl.classList.remove('hide');
    clearInterval(lockTimer);
    const tick = () => {
      const rest = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      lockNum.textContent = fmt.countdown(rest);
      if (rest <= 0) {
        clearInterval(lockTimer);
        lockUntil = 0;
        lockEl.classList.add('hide');
        setErr('');
        setBusy(false);
        focusCurrent();
      } else {
        paintBusy();
      }
    };
    paintBusy();
    tick();
    lockTimer = setInterval(tick, 500);
  }

  function setRecoveryMode(on) {
    usingRecovery = !!on;
    codeEl.value = '';
    codeEl.maxLength = usingRecovery ? 9 : 6;
    codeEl.inputMode = usingRecovery ? 'text' : 'numeric';
    codeEl.placeholder = usingRecovery ? 'XXXX-XXXX' : '000000';
    codeEl.classList.toggle('code-input', !usingRecovery);
    codeLabel.textContent = usingRecovery ? '恢复码' : '6 位验证码';
    twoAlt.textContent = usingRecovery ? '改用验证器验证码' : '使用恢复码';
  }

  function resetToPassword() {
    challenge = '';
    mode = '';
    pendingAdmin = null;
    pendingCodes = [];
    setRecoveryMode(false);
    codeEl.value = '';
    setStep('password');
    setErr('');
    setBusy(false);
    requestAnimationFrame(() => { try { accEl.focus({ preventScroll: true }); accEl.select(); } catch (e) { accEl.focus(); } });
  }

  function finish(admin) {
    if (!admin) {
      setErr('登录响应异常，请重新登录');
      setBusy(false);
      return;
    }
    setAdmin(admin);
    clearInterval(lockTimer);
    toast('欢迎回来，' + (admin.name || admin.account), 'ok');
    if (o.onSuccess) o.onSuccess(admin);
  }

  function apply2fa(data) {
    challenge = String(data.challengeToken || '');
    mode = data.mode === 'enroll' ? 'enroll' : 'verify';
    const enroll = data.enroll || {};
    if (mode === 'enroll') {
      const svg = String(enroll.qrSvg || '');
      qrEl.innerHTML = svg.indexOf('<svg') === 0 ? svg : '';
      secretEl.textContent = enroll.secret || '';
      enrollBox.classList.remove('hide');
      twoAlt.classList.add('hide');
    } else {
      enrollBox.classList.add('hide');
      twoAlt.classList.remove('hide');
    }
    setRecoveryMode(false);
    setStep('2fa');
    setErr('');
    setBusy(false);
    requestAnimationFrame(() => { try { codeEl.focus({ preventScroll: true }); } catch (e) { codeEl.focus(); } });
  }

  function renderCodes(codes) {
    pendingCodes = Array.isArray(codes) ? codes.slice() : [];
    recoveryList.innerHTML = pendingCodes.length
      ? pendingCodes.map((c) => '<code>' + esc(c) + '</code>').join('')
      : '<span class="muted">没有拿到恢复码，请联系超级管理员重置。</span>';
    codesSaved.checked = false;
    codesContinue.disabled = true;
    setStep('codes');
  }

  async function doLogin() {
    const account = accEl.value.trim();
    const password = pwEl.value;
    if (!account) { setErr('请输入管理员账号'); accEl.focus(); return; }
    if (!password) { setErr('请输入登录密码'); pwEl.focus(); return; }
    setErr('');
    setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { account, password } });
      if (data && data.twoFactorRequired) { apply2fa(data); return; }
      finish(data && data.admin);
    } catch (e) {
      if (e && e.code === 'LOCKED') {
        const wait = e.retryAfter || (e.data && e.data.retryAfter) || 900;
        startLock(wait);
        setErr('账号已临时锁定，请稍后再试或联系超级管理员');
      } else {
        setErr(errText(e, '登录失败，请重试'));
        setBusy(false);
        pwEl.select();
      }
    }
  }

  async function doTwoFactor() {
    const value = codeEl.value.trim();
    if (!value) { setErr(usingRecovery ? '请输入恢复码' : '请输入 6 位验证码'); codeEl.focus(); return; }
    if (!usingRecovery && !/^\d{6}$/.test(value)) { setErr('验证码是 6 位数字'); codeEl.select(); return; }
    if (usingRecovery && value.replace(/-/g, '').length !== 8) { setErr('恢复码是 8 位字母数字，例如 ABCD-EFGH'); codeEl.select(); return; }
    setErr('');
    setBusy(true);
    try {
      const path = mode === 'enroll' ? '/auth/2fa/enable' : '/auth/2fa/verify';
      const data = await api(path, { method: 'POST', body: { challengeToken: challenge, code: value } });
      if (mode === 'enroll') {
        pendingAdmin = data && data.admin ? data.admin : null;
        renderCodes((data && data.recoveryCodes) || []);
        setBusy(false);
        return;
      }
      if (data && data.usedRecovery) {
        toast('恢复码已使用，还剩 ' + (data.recoveryRemaining || 0) + ' 个', 'ok');
      }
      finish(data && data.admin);
    } catch (e) {
      if (e && e.code === 'LOCKED') {
        startLock(e.retryAfter || (e.data && e.data.retryAfter) || 900);
        setErr('验证码错误次数过多，账号已锁定');
        return;
      }
      if (e && e.code === 'CHALLENGE_INVALID') {
        resetToPassword();
        setErr('这次验证已过期，请重新输入账号密码');
        return;
      }
      if (e && e.code === 'CODE_REPLAY') {
        setErr('这个验证码刚刚已经用过了，等下一个 30 秒再试');
        codeEl.value = '';
        codeEl.focus();
        setBusy(false);
        return;
      }
      let msg = errText(e, '验证失败，请重试');
      if (e && e.code === 'BAD_2FA' && e.data && e.data.attemptsLeft != null) {
        msg += '（还可以试 ' + e.data.attemptsLeft + ' 次）';
      }
      setErr(msg);
      setBusy(false);
      codeEl.select();
    }
  }

  toggle.addEventListener('click', () => {
    const show = pwEl.type === 'password';
    pwEl.type = show ? 'text' : 'password';
    toggle.innerHTML = icon(show ? 'eyeOff' : 'eye');
    toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    pwEl.focus();
  });
  pwEl.addEventListener('keyup', (ev) => {
    if (typeof ev.getModifierState !== 'function') return;
    caps.classList.toggle('hide', !ev.getModifierState('CapsLock'));
  });
  pwEl.addEventListener('blur', () => caps.classList.add('hide'));

  twoAlt.addEventListener('click', () => {
    if (mode === 'enroll') return;
    setRecoveryMode(!usingRecovery);
    setErr('');
    codeEl.focus();
  });
  twoBack.addEventListener('click', () => resetToPassword());
  codesSaved.addEventListener('change', () => {
    codesContinue.disabled = !codesSaved.checked || !pendingAdmin;
  });
  codesContinue.addEventListener('click', () => {
    if (!codesSaved.checked) { toast('先勾选「我已保存这些恢复码」', 'err'); return; }
    finish(pendingAdmin);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy || lockUntil > Date.now()) return;
    if (step === 'password') { await doLogin(); return; }
    if (step === '2fa') { await doTwoFactor(); return; }
    if (step === 'codes') {
      if (!codesSaved.checked) { toast('先勾选「我已保存这些恢复码」', 'err'); return; }
      finish(pendingAdmin);
    }
  });

  setStep('password');
  /* 首屏把焦点给账号框：登录页只有一个任务，别让用户先 Tab 找输入框 */
  requestAnimationFrame(() => { try { accEl.focus({ preventScroll: true }); } catch (e) { accEl.focus(); } });

  return function destroy() { clearInterval(lockTimer); };
}

/* ───────────────────────── 应用外壳 ───────────────────────── */
export function showApp(root, opts) {
  const o = opts || {};
  /* 登录页可能停留过一段时间，或 hash 在同一文档里变化；进外壳前再恢复一次，
     保证 data-theme 与 localStorage 一致（首绘守卫只在整页加载时跑）。 */
  theme.restore();
  const admin = store.admin || {};
  const allowed = NAV.map((g) => ({ group: g.group, items: g.items.filter(navAllowed) })).filter((g) => g.items.length);
  const fallback = can('dashboard.view') ? 'dashboard' : (firstAllowed() || 'dashboard');

  document.title = '控制台 · 鲸域';

  let mini = false;
  try { mini = localStorage.getItem('whale-admin-side') === 'mini'; } catch (e) {}
  root.innerHTML =
    '<div class="app' + (mini ? ' is-mini' : '') + '">' +
      '<aside class="side" id="side" aria-label="主导航">' +
        '<div class="side-hd">' +
          '<a class="side-logo" href="#/' + fallback + '" title="鲸域 · 控制台">' +
            '<span class="side-mark">' + whaleMark() + '</span>' +
            '<b>鲸域</b><span>控制台</span>' +
          '</a>' +
          '<button class="icon-btn side-collapse" type="button" data-act="collapse" aria-label="折叠侧栏" title="折叠侧栏">' + icon('chevronLeft') + '</button>' +
        '</div>' +
        '<nav class="side-nav">' +
          allowed.map((g) => (
            '<div class="nav-grp">' + esc(g.group) + '</div>' +
            g.items.map((it) => (
              '<a class="nav-item" href="#/' + it.name + '" data-nav="' + it.name + '">' +
                icon(it.kind) + '<span>' + esc(it.label) + '</span>' +
              '</a>'
            )).join('')
          )).join('') +
        '</nav>' +
        '<div class="side-ft">' +
          '<div class="side-user">' +
            avatar({ name: admin.name, emoji: '🐳' }) +
            '<div class="su-txt"><b>' + esc(admin.name || admin.account || '管理员') + '</b><small>' + esc(admin.roleName || '未分配角色') + '</small></div>' +
            '<button class="icon-btn" type="button" data-act="logout" aria-label="退出登录" title="退出登录">' + icon('logout') + '</button>' +
          '</div>' +
        '</div>' +
      '</aside>' +
      '<div class="side-scrim" data-act="close-side"></div>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<button class="icon-btn topbar-menu" type="button" data-act="open-side" aria-label="打开导航菜单" aria-expanded="false">' + icon('menu') + '</button>' +
          '<div class="topbar-titles">' +
            '<nav class="crumb" aria-label="面包屑" id="crumb"></nav>' +
            '<h1 class="top-title" id="top-title">控制台</h1>' +
          '</div>' +
          '<div class="topbar-actions">' +
            '<button class="icon-btn" type="button" data-act="refresh" aria-label="刷新当前页面" title="刷新">' + icon('refresh') + '</button>' +
            '<button class="icon-btn" type="button" data-act="theme" id="theme-btn" aria-label="切换深浅主题" title="切换主题">' + icon(theme.get() === 'night' ? 'sun' : 'moon') + '</button>' +
            '<span class="sep-v" aria-hidden="true"></span>' +
            '<div class="acct">' +
              '<button class="acct-btn" type="button" data-act="acct" aria-haspopup="menu" aria-expanded="false">' +
                avatar({ name: admin.name, emoji: '🐳' }) +
                '<span class="ab-txt"><b>' + esc(admin.name || '') + '</b><small>' + esc(admin.roleName || '') + '</small></span>' +
                icon('chevronDown') +
              '</button>' +
              '<div class="acct-menu" role="menu" id="acct-menu">' +
                '<div class="acct-head"><b>' + esc(admin.name || '') + '</b><small>' + esc(admin.account || '') + ' · ' + esc(admin.roleName || '') + '</small></div>' +
                '<button class="acct-item" type="button" role="menuitem" data-act="password">' + icon('key') + '修改密码</button>' +
                '<button class="acct-item acct-item--danger" type="button" role="menuitem" data-act="logout">' + icon('logout') + '退出登录</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</header>' +
        '<main class="page" id="page" tabindex="-1"></main>' +
      '</div>' +
    '</div>';

  const app = root.querySelector('.app');
  const side = root.querySelector('#side');
  const scrim = root.querySelector('.side-scrim');
  const pageEl = root.querySelector('#page');
  const crumbEl = root.querySelector('#crumb');
  const titleEl = root.querySelector('#top-title');
  const acctBtn = root.querySelector('[data-act="acct"]');
  const acctMenu = root.querySelector('#acct-menu');
  const menuBtn = root.querySelector('[data-act="open-side"]');
  const themeBtn = root.querySelector('#theme-btn');


  /* 路由注册：把模块的 title/perm 与 NAV 合并成一条定义 */
  Object.keys(PAGES).forEach((name) => {
    const mod = PAGES[name];
    router.add(name, {
      name,
      title: mod.title || name,
      perm: mod.perm || '',
      render: mod.render,
    });
  });
  router.setFallback(fallback);

  /* ── 侧栏折叠 / 移动端抽屉 ── */
  function persistMini() {
    try { localStorage.setItem('whale-admin-side', app.classList.contains('is-mini') ? 'mini' : 'full'); } catch (e) {}
  }
  function closeSide() {
    side.classList.remove('is-open');
    scrim.classList.remove('is-on');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleSide() {
    const open = !side.classList.contains('is-open');
    side.classList.toggle('is-open', open);
    scrim.classList.toggle('is-on', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ── 账号菜单 ── */
  function closeAcct() {
    acctMenu.classList.remove('is-open');
    acctBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleAcct() {
    const open = !acctMenu.classList.contains('is-open');
    acctMenu.classList.toggle('is-open', open);
    acctBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const first = acctMenu.querySelector('.acct-item');
      if (first) first.focus();
    }
  }
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.acct')) closeAcct();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && acctMenu.classList.contains('is-open')) {
      closeAcct();
      acctBtn.focus();
    }
  });

  /* ── 修改密码 ── */
  function openPassword() {
    closeAcct();
    const idOld = 'pw-old', idNew = 'pw-new', idCnf = 'pw-cnf';
    const ctx = openModal({
      size: 'sm',
      title: '修改密码',
      subtitle: '修改后当前登录保持有效，下次登录使用新密码。',
      body:
        '<div class="field"><label for="' + idOld + '">原密码</label><input class="input" id="' + idOld + '" type="password" autocomplete="current-password"></div>' +
        '<div class="field"><label for="' + idNew + '">新密码</label><input class="input" id="' + idNew + '" type="password" autocomplete="new-password"><div class="hint">8～64 位，需同时包含字母和数字</div></div>' +
        '<div class="field"><label for="' + idCnf + '">确认新密码</label><input class="input" id="' + idCnf + '" type="password" autocomplete="new-password"></div>' +
        '<div class="err-tip hide" id="pw-err"></div>',
      footer:
        '<button class="btn" type="button" data-close="1">取消</button>' +
        '<button class="btn btn--primary" type="button" id="pw-ok">保存新密码</button>',
    });
    const oldEl = ctx.body.querySelector('#' + idOld);
    const newEl = ctx.body.querySelector('#' + idNew);
    const cnfEl = ctx.body.querySelector('#' + idCnf);
    const errEl = ctx.body.querySelector('#pw-err');
    /* 按钮在 footer：ctx.body 只是 .modal-bd，用 body 查会永远拿不到 */
    const okEl = ctx.footer.querySelector('#pw-ok');
    const fail = (msg) => { errEl.textContent = msg; errEl.classList.remove('hide'); };
    let busy = false;
    async function submit() {
      if (busy) return;
      errEl.classList.add('hide');
      if (!oldEl.value) { fail('请输入原密码'); oldEl.focus(); return; }
      if (!newEl.value) { fail('请输入新密码'); newEl.focus(); return; }
      if (newEl.value.length < 8 || newEl.value.length > 64) { fail('新密码需为 8～64 位'); newEl.focus(); return; }
      if (!/[A-Za-z]/.test(newEl.value) || !/[0-9]/.test(newEl.value)) { fail('新密码需同时包含字母和数字'); newEl.focus(); return; }
      if (newEl.value !== cnfEl.value) { fail('两次输入的新密码不一致'); cnfEl.focus(); return; }
      busy = true;
      okEl.disabled = true;
      okEl.innerHTML = '<span class="btn-spinner"></span>保存中…';
      try {
        await api('/auth/password', { method: 'POST', body: { oldPassword: oldEl.value, newPassword: newEl.value } });
        toast('密码已更新', 'ok');
        ctx.close();
      } catch (e) {
        fail(errText(e, '修改失败'));
        busy = false;
        okEl.disabled = false;
        okEl.textContent = '保存新密码';
      }
    }
    okEl.addEventListener('click', submit);
    [oldEl, newEl, cnfEl].forEach((el) => {
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
      });
    });
    oldEl.focus();
  }

  async function doLogout() {
    closeAcct();
    const yes = await confirmDialog({
      title: '退出登录',
      message: '退出后需要重新输入账号密码才能进入控制台。',
      okText: '退出登录',
    });
    if (!yes) return;
    await logout();
    if (o.onSignOut) o.onSignOut();
  }

  /* ── 外壳内的点击委托：一处处理，避免每页各绑一次 ── */
  delegate(root, 'click', '[data-act]', (ev, el) => {
    const act = el.getAttribute('data-act');
    if (act === 'collapse') {
      app.classList.toggle('is-mini');
      persistMini();
      el.setAttribute('aria-label', app.classList.contains('is-mini') ? '展开侧栏' : '折叠侧栏');
    } else if (act === 'open-side') {
      toggleSide();
    } else if (act === 'close-side') {
      closeSide();
    } else if (act === 'refresh') {
      el.classList.add('is-spin');
      setTimeout(() => el.classList.remove('is-spin'), 700);
      router.refresh();
    } else if (act === 'theme') {
      const t = theme.toggle();
      el.innerHTML = icon(t === 'night' ? 'sun' : 'moon');
      el.setAttribute('aria-label', t === 'night' ? '切换到浅色主题' : '切换到深色主题');
    } else if (act === 'acct') {
      toggleAcct();
    } else if (act === 'password') {
      openPassword();
    } else if (act === 'logout') {
      doLogout();
    }
  });
  on('wr:theme', (ev) => {
    const t = ev.detail && ev.detail.theme;
    if (themeBtn) themeBtn.innerHTML = icon(t === 'night' ? 'sun' : 'moon');
  });

  /* ── 路由 ── */
  let renderSeq = 0;
  let firstRender = true;
  let cleanup = null;

  function setChrome(def) {
    const meta = pageMeta(def.name);
    const group = groupOf(def.name);
    titleEl.textContent = meta.title;
    document.title = meta.title + ' · 鲸域控制台';
    crumbEl.innerHTML =
      '<a class="hide-sm" href="#/' + fallback + '">鲸域控制台</a>' +
      '<span class="sep hide-sm">/</span>' +
      (group ? '<span class="hide-sm">' + esc(group) + '</span><span class="sep hide-sm">/</span>' : '') +
      '<span class="cur" aria-current="page">' + esc(meta.title) + '</span>';
    root.querySelectorAll('.nav-item').forEach((a) => {
      if (a.getAttribute('data-nav') === def.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function skeleton() {
    return '<div class="skel-page" aria-hidden="true">' +
      '<div class="skel-row" style="width:180px;height:20px"></div>' +
      '<div class="skel-card" style="height:74px"></div>' +
      '<div class="skel-table">' +
        Array.from({ length: 7 }).map(() => '<div class="skel-row"></div>').join('') +
      '</div>' +
    '</div>';
  }

  function renderForbidden(def) {
    const meta = pageMeta(def.name);
    pageEl.innerHTML =
      '<div class="empty" style="padding:72px 20px">' +
        '<div class="empty-art">' + icon('shield') + '</div>' +
        '<h3>当前角色没有这个操作的权限</h3>' +
        '<p>「' + esc(meta.title) + '」需要对应权限。可以联系超级管理员在「权限管理」里为该角色勾选，再回来刷新页面。</p>' +
        '<button class="btn btn--primary" type="button" data-act="go-home">返回工作台</button>' +
      '</div>';
    const b = pageEl.querySelector('[data-act="go-home"]');
    if (b) b.addEventListener('click', () => { if (can('dashboard.view')) router.go('dashboard'); else toast('当前角色没有工作台权限', 'err'); });
  }

  function renderError(e) {
    pageEl.innerHTML =
      '<div class="empty" style="padding:64px 20px">' +
        '<div class="empty-art">' + icon('alert') + '</div>' +
        '<h3>页面没能加载出来</h3>' +
        '<p>' + esc(errText(e, '接口暂时没有响应，请稍后重试。')) + '</p>' +
        '<button class="btn" type="button" data-act="retry">重新加载</button>' +
      '</div>';
    pageEl.querySelector('[data-act="retry"]').addEventListener('click', () => router.refresh());
  }

  async function renderRoute(def, params) {
    const seq = ++renderSeq;
    closeSide();
    closeAcct();
    setChrome(def);

    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} cleanup = null; }

    if (def.perm && !can(def.perm)) {
      pageEl.innerHTML = '';
      renderForbidden(def);
      pageEl.focus({ preventScroll: true });
      return;
    }

    pageEl.innerHTML = skeleton();
    pageEl.setAttribute('aria-busy', 'true');
    const ctx = {
      name: def.name,
      params: params || {},
      refresh: () => router.refresh(),
      go: (n, p) => router.go(n, p),
      cleanup: (fn) => { cleanup = fn; },
    };
    try {
      await def.render(pageEl, ctx);
      if (seq !== renderSeq) return;
      pageEl.removeAttribute('aria-busy');
      if (!firstRender) { try { pageEl.focus({ preventScroll: true }); } catch (e) {} }
      firstRender = false;
    } catch (e) {
      if (seq !== renderSeq) return;
      pageEl.removeAttribute('aria-busy');
      if (e && e.name === 'AbortError') return;
      if (e && (e.isForbidden)) renderForbidden(def);
      else renderError(e);
    }
  }

  router.start(renderRoute);

  return {
    destroy() {
      if (typeof cleanup === 'function') cleanup();
    },
  };
}