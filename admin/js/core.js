/* ═══════════════════════════════════════════════════════════════════════════
   鲸域 · 控制台 — 核心层（core.js）
   ---------------------------------------------------------------------------
   这一层只做六件事：请求、身份、路由、格式化、基础浮层、图标。
   页面模块不直接 fetch，也不自己拼 URL —— 后端字段的唯一来源是
   docs/admin-api.md，路径拼装、错误码归一、401 回登录都收在这里，
   换后端时只改这一个文件。

   约定：
   - 所有时间戳是 Unix 秒（后端契约），格式化在这里统一转；
   - api() 成功返回 data 本体（已剥掉 {ok:true,data}），失败抛 ApiError；
   - 401 不抛给页面：清身份 + 广播 auth:expired，由 boot/shell 切回登录页，
     否则每个页面都要写一遍"我未登录"的兜底。
   ═══════════════════════════════════════════════════════════════════════════ */

export const VERSION = 'v1.0.0';

/* 站点部署在子路径时（window.DSH_API_BASE），后台跟着走 */
export const API_PREFIX = (window.DSH_API_BASE || '') + '/api/admin';

/* ───────────────────────── 错误 ───────────────────────── */
export class ApiError extends Error {
  constructor(code, message, status, data, extra) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.status = status || 0;
    this.data = data || null;
    Object.assign(this, extra || {});
  }
  get isAuth() { return this.code === 'NOT_AUTHED' || this.status === 401; }
  get isForbidden() { return this.code === 'FORBIDDEN' || this.status === 403; }
}

/* ───────────────────────── 字符串 / DOM ───────────────────────── */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* 属性值再兜一层：esc 已经转义了引号，这里只做语义命名 */
export function escAttr(v) { return esc(v); }

export function cx() {
  const out = [];
  for (const a of arguments) if (a) out.push(a);
  return out.join(' ');
}

/* HTML 字符串 → 元素。只用于我们自己生成的模板，不接受用户输入直接进 innerHTML */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function uid(prefix) {
  return (prefix || 'wr') + '-' + Math.random().toString(36).slice(2, 9);
}

/* 事件委托：selector 命中的最近祖先才触发，省掉一屏几十个 addEventListener */
export function delegate(root, type, selector, fn) {
  const handler = (ev) => {
    const t = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (!t || !root.contains(t)) return;
    fn(ev, t);
  };
  root.addEventListener(type, handler);
  return () => root.removeEventListener(type, handler);
}

/* ───────────────────────── 节流 / 防抖 ───────────────────────── */
export function debounce(fn, wait) {
  let t = 0;
  const wrapped = function () {
    const args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(self, args), wait || 240);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
export function throttle(fn, wait) {
  let last = 0, timer = 0, lastArgs = null;
  return function () {
    lastArgs = arguments;
    const now = Date.now();
    const rest = (wait || 120) - (now - last);
    if (rest <= 0) { last = now; fn.apply(this, lastArgs); }
    else if (!timer) {
      const self = this;
      timer = setTimeout(() => { timer = 0; last = Date.now(); fn.apply(self, lastArgs); }, rest);
    }
  };
}

/* ───────────────────────── 格式化 ───────────────────────── */
const pad2 = (n) => (n < 10 ? '0' : '') + n;

function toDate(sec) {
  const n = Number(sec);
  if (!n || !isFinite(n)) return null;
  return new Date(n * 1000);
}

export const fmt = {
  int(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  /* 大数用"万/亿"，只用于 KPI 与图表轴，表格里坚持原值 */
  short(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(n % 1e8 === 0 ? 0 : 1) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(n % 1e3 === 0 ? 0 : 1).replace(/\.0$/, '') + '万';
    return fmt.int(n);
  },
  date(sec) {
    const d = toDate(sec); if (!d) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  },
  dateTime(sec) {
    const d = toDate(sec); if (!d) return '—';
    return fmt.date(sec) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  },
  time(sec) {
    const d = toDate(sec); if (!d) return '—';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  },
  /* 相对时间：后台一眼看到"多久以前"，比绝对时间更有用；超过 30 天回日期 */
  rel(sec) {
    const d = toDate(sec); if (!d) return '—';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < -60) return fmt.dateTime(sec);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 2) return '昨天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
    return fmt.date(sec);
  },
  /* 剩余秒 → "12 分 30 秒"；锁定提示用 */
  countdown(sec) {
    let s = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(s / 60);
    s = s % 60;
    return m > 0 ? (m + ' 分 ' + (s ? s + ' 秒' : '')) : (s + ' 秒');
  },
  pct(v, total) {
    const t = Number(total) || 0;
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(v) || 0) / t * 100)));
  },
};

/* 日期输入（YYYY-MM-DD，本地时区）→ Unix 秒，闭区间用 */
export function dayStart(str) {
  if (!str) return '';
  const p = String(str).split('-').map(Number);
  if (p.length !== 3) return '';
  return Math.floor(new Date(p[0], p[1] - 1, p[2], 0, 0, 0).getTime() / 1000);
}
export function dayEnd(str) {
  if (!str) return '';
  const p = String(str).split('-').map(Number);
  if (p.length !== 3) return '';
  return Math.floor(new Date(p[0], p[1] - 1, p[2], 23, 59, 59).getTime() / 1000);
}
export function todayInput() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* ───────────────────────── 身份 / 权限 ───────────────────────── */
export const store = {
  admin: null,
  perms: new Set(),
  /* 权限目录（/permissions）缓存：矩阵与导航共用，避免每页各拉一次 */
  permCatalog: null,
  mock: false,
  route: null,
};

export function setAdmin(admin) {
  store.admin = admin || null;
  store.perms = new Set((admin && admin.permissions) || []);
}
export function clearAdmin() {
  store.admin = null;
  store.perms = new Set();
}
export function can(key) {
  if (!key) return true;
  return store.perms.has(key);
}
export function canAny() {
  for (const k of arguments) if (k && store.perms.has(k)) return true;
  return false;
}
/* owner 的权限矩阵在契约里是只读的，界面要据此锁勾选框 */
export function isOwner() { return !!store.admin && store.admin.roleKey === 'owner'; }

/* ───────────────────────── 主题 ───────────────────────── */
/* 主题有三层来源，优先级从高到低：
   1) localStorage：管理员明确点过切换，必须尊重；
   2) html[data-theme]：index.html 的首绘守卫已经算好，刷新时没有白闪；
   3) 系统偏好：第一次访问时的默认值。
   以前只读 (2)，于是同一文档内改了 localStorage（自动化截图、另一标签页）后
   页面仍停在白天；刷新虽然能恢复，但用户会觉得“设置没保存”。 */
export const theme = {
  KEY: 'whale-admin-theme',
  stored() {
    try {
      const t = localStorage.getItem(this.KEY);
      return (t === 'night' || t === 'day') ? t : '';
    } catch (e) { return ''; }
  },
  preferred() {
    const saved = this.stored();
    if (saved) return saved;
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'night' || attr === 'day') return attr;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'; }
    catch (e) { return 'day'; }
  },
  get() { return this.preferred(); },
  /* persist=false 用于启动恢复：只把主题铺到 DOM，不把“自动推断”写回存储，
     否则第一次访问就会把系统偏好固化成用户选择，之后系统换主题也不再跟随。 */
  apply(t, options) {
    const v = t === 'night' ? 'night' : 'day';
    const persist = !options || options.persist !== false;
    document.documentElement.setAttribute('data-theme', v);
    document.documentElement.style.colorScheme = v === 'night' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v === 'night' ? '#0b131c' : '#0a1b2b');
    if (persist) { try { localStorage.setItem(this.KEY, v); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('wr:theme', { detail: { theme: v } }));
  },
  /* 页面挂载时调用：处理“同一文档内 hash 跳转”以及 CSP 拦掉首绘内联脚本的兜底。
     注意这里不写 localStorage，避免每次 boot 都覆盖用户的自动/系统偏好。 */
  restore() {
    const v = this.preferred();
    this.apply(v, { persist: false });
    return v;
  },
  toggle() {
    const next = this.get() === 'night' ? 'day' : 'night';
    this.apply(next);
    return next;
  },
};

/* ───────────────────────── 事件总线 ───────────────────────── */
const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { bus.addEventListener(name, fn); return () => bus.removeEventListener(name, fn); }

/* ───────────────────────── 请求 ───────────────────────── */
export function buildQuery(query) {
  const p = new URLSearchParams();
  if (query) {
    for (const k of Object.keys(query)) {
      const v = query[k];
      /* 契约：空字符串视为未传。null/undefined 同理 */
      if (v === '' || v === null || v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else p.append(k, v);
    }
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

let mockLatency = 140;

/**
 * api('/posts', { query:{page:1}, method:'POST', body:{...} })
 * 成功 → data 本体；失败 → ApiError。401 额外广播 auth:expired。
 */
export async function api(path, opts) {
  const o = opts || {};
  const method = (o.method || 'GET').toUpperCase();
  const qs = buildQuery(o.query);
  const url = API_PREFIX + path + qs;

  if (store.mock) {
    /* 演示模式：走内存数据，延迟一点让骨架屏真的出现（也验证 loading 链路） */
    await new Promise((r) => setTimeout(r, mockLatency));
    return mockRequest(method, path, o.body || null, o.query || {});
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: o.body ? { 'Content-Type': 'application/json' } : undefined,
      body: o.body ? JSON.stringify(o.body) : undefined,
      signal: o.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError('NETWORK', '网络不可用，请检查连接后重试', 0, null, { network: true });
  }

  let json = null;
  const text = await res.text().catch(() => '');
  if (text) {
    try { json = JSON.parse(text); } catch (e) { json = null; }
  }

  if (!res.ok || !json || json.ok === false) {
    /* 后端还没上线时，静态服务器通常回一页 HTML 404 —— 这不是业务失败，
       标记 notReady，让 boot 决定是否切演示模式，而不是甩一个看不懂的错。 */
    if (!json) {
      throw new ApiError('NOT_READY', '后台接口尚未就绪', res.status, null, { notReady: true });
    }
    const err = (json && json.error) || {};
    const e = new ApiError(err.code || 'INTERNAL', err.message || ('请求失败（' + res.status + '）'), res.status, json.data || null, {
      retryAfter: json.data && json.data.retryAfter,
    });
    /* 登录与两步验证是「还没有会话」的接口：401 是业务结果（密码错/验证码错），
       不是会话过期。这里如果把 401 当成过期处理，输错一次验证码就会被踢回
       登录页、挑战令牌也丢了，用户永远过不了第二步。 */
    const preSession = path === '/auth/login' || path.indexOf('/auth/2fa/') === 0;
    if (e.isAuth && !preSession) {
      clearAdmin();
      emit('auth:expired', { path });
    }
    throw e;
  }
  return json.data;
}

/* 统一的错误文案：后端 message 优先，其次按 code 兜底 */
export function errText(e, fallback) {
  if (!e) return fallback || '操作失败';
  if (e.name === 'ApiError') {
    if (e.code === 'FORBIDDEN') return '当前角色没有这个操作的权限';
    return e.message || fallback || '操作失败';
  }
  return (e && e.message) || fallback || '操作失败';
}

/* CSV 导出：用 fetch 而不是直接 location.href，才能把 401/403 变成可读提示。
   服务端文件名优先（Content-Disposition），拿不到就用 fallback。 */
export async function downloadCsv(path, query, fallbackName) {
  const qs = buildQuery(query);
  if (store.mock) {
    const csv = mockCsv(path, query || {});
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fallbackName || 'export.csv');
    return;
  }
  const res = await fetch(API_PREFIX + path + qs, { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = '导出失败';
    try {
      const j = await res.json();
      msg = (j.error && j.error.message) || msg;
      if (j.error && j.error.code === 'FORBIDDEN') msg = '当前角色没有导出权限';
    } catch (e) {}
    throw new ApiError('EXPORT_FAILED', msg, res.status);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : (fallbackName || 'export.csv');
  saveBlob(await res.blob(), name);
}
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ───────────────────────── toast ───────────────────────── */
let toastHost = null;
export function toast(message, type, ms) {
  const host = toastHost || (toastHost = document.getElementById('wr-toast'));
  if (!host) return;
  const kind = type === 'ok' || type === 'error' ? (type === 'ok' ? 'ok' : 'err') : (type || 'info');
  const el = h(
    '<div class="toast toast--' + kind + '" role="' + (kind === 'err' ? 'alert' : 'status') + '">' +
      icon(kind === 'ok' ? 'checkCircle' : kind === 'err' ? 'alert' : 'info') +
      '<div class="toast-msg">' + esc(message) + '</div>' +
    '</div>'
  );
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const life = ms || (kind === 'err' ? 4600 : 3000);
  const timer = setTimeout(close, life);
  function close() {
    clearTimeout(timer);
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }
  el.addEventListener('click', close);
  /* 最多同时挂 4 条，超出把最老的挤掉，避免刷屏时盖住页面 */
  while (host.children.length > 4) host.firstElementChild.remove();
}

/* ───────────────────────── 浮层（抽屉 / 弹窗 / 确认） ───────────────────────── */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const layerStack = [];
let scrollLocks = 0;

function lockScroll() {
  if (scrollLocks === 0) {
    const sw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sw > 0) document.body.style.paddingRight = sw + 'px';
  }
  scrollLocks++;
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

function layerRoot() {
  return document.getElementById('wr-layer') || document.body;
}

function focusFirst(container) {
  const list = Array.from(container.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
  const target = list.find((n) => !n.hasAttribute('data-no-autofocus')) || list[0];
  if (target) {
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }
}

function trapFocus(container) {
  return (ev) => {
    if (ev.key !== 'Tab') return;
    const list = Array.from(container.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };
}

function pushLayer(ctx) {
  layerStack.push(ctx);
  lockScroll();
  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      if (layerStack[layerStack.length - 1] !== ctx) return;
      ev.stopPropagation();
      ctx.close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  ctx._offKey = () => document.removeEventListener('keydown', onKey, true);
  ctx._offTrap = null;
}
function popLayer(ctx) {
  const i = layerStack.indexOf(ctx);
  if (i >= 0) layerStack.splice(i, 1);
  if (ctx._offKey) ctx._offKey();
  if (ctx._offTrap) ctx._offTrap();
  unlockScroll();
}

/**
 * 抽屉：从右滑入 240ms（任务书指定），遮罩点击关闭，Esc 关闭，焦点归还。
 * 返回句柄给页面：{ el, body, footer, close, setTitle, setBody, setFooter }
 */
export function openDrawer(opt) {
  const o = opt || {};
  const prevFocus = document.activeElement;
  const mask = h('<div class="layer-mask" data-close="1"></div>');
  const el = h(
    '<aside class="drawer' + (o.wide ? ' drawer--wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + (o.id || uid('dtitle')) + '">' +
      '<header class="drawer-hd">' +
        '<div><h2 id="' + (o.id || uid('dtitle')) + '">' + esc(o.title || '详情') + '</h2>' +
        (o.subtitle ? '<div class="sub">' + o.subtitle + '</div>' : '') + '</div>' +
        '<button class="icon-btn" type="button" data-close="1" aria-label="关闭">' + icon('close') + '</button>' +
      '</header>' +
      '<div class="drawer-bd"></div>' +
      '<footer class="drawer-ft"></footer>' +
    '</aside>'
  );
  const body = el.querySelector('.drawer-bd');
  const footer = el.querySelector('.drawer-ft');
  body.innerHTML = o.body || '';
  footer.innerHTML = o.footer || '';
  if (!footer.innerHTML.trim()) footer.style.display = 'none';

  layerRoot().appendChild(mask);
  layerRoot().appendChild(el);
  requestAnimationFrame(() => { mask.classList.add('is-open'); el.classList.add('is-open'); });

  let closed = false;
  const ctx = {
    el, body, footer,
    setTitle(t) { const h2 = el.querySelector('.drawer-hd h2'); if (h2) h2.textContent = t; },
    setSubtitle(html) { const s = el.querySelector('.drawer-hd .sub'); if (s) s.innerHTML = html; },
    setBody(html) { body.innerHTML = html; },
    setFooter(html) {
      footer.innerHTML = html || '';
      footer.style.display = (html || '').trim() ? '' : 'none';
    },
    close,
  };
  function close() {
    if (closed) return;
    closed = true;
    popLayer(ctx);
    mask.classList.remove('is-open');
    el.classList.remove('is-open');
    setTimeout(() => { mask.remove(); el.remove(); }, 280);
    if (o.onClose) o.onClose();
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  mask.addEventListener('click', close);
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) close();
  });
  pushLayer(ctx);
  ctx._offTrap = (() => {
    const fn = trapFocus(el);
    el.addEventListener('keydown', fn);
    return () => el.removeEventListener('keydown', fn);
  })();
  focusFirst(el);
  return ctx;
}

/**
 * 弹窗：用于表单与二次确认。返回 { el, body, footer, close, setBody, setFooter }
 * size: 'sm' | '' | 'wide'
 */
export function openModal(opt) {
  const o = opt || {};
  const prevFocus = document.activeElement;
  const id = o.id || uid('mtitle');
  const mask = h('<div class="layer-mask" data-close="1"></div>');
  const el = h(
    '<div class="modal' + (o.size ? ' modal--' + o.size : '') + (o.danger ? ' modal--danger' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
      '<header class="modal-hd">' +
        '<div><h2 id="' + id + '">' + esc(o.title || '提示') + '</h2>' +
        (o.subtitle ? '<div class="sub">' + o.subtitle + '</div>' : '') + '</div>' +
        (o.closable === false ? '' : '<button class="icon-btn" type="button" data-close="1" aria-label="关闭">' + icon('close') + '</button>') +
      '</header>' +
      '<div class="modal-bd"></div>' +
      '<div class="modal-ft"></div>' +
    '</div>'
  );
  const body = el.querySelector('.modal-bd');
  const footer = el.querySelector('.modal-ft');
  body.innerHTML = o.body || '';
  footer.innerHTML = o.footer || '';
  if (!footer.innerHTML.trim()) footer.style.display = 'none';

  layerRoot().appendChild(mask);
  layerRoot().appendChild(el);
  requestAnimationFrame(() => { mask.classList.add('is-open'); el.classList.add('is-open'); });

  let closed = false;
  const ctx = {
    el, body, footer,
    setBody(html) { body.innerHTML = html; },
    setFooter(html) { footer.innerHTML = html || ''; footer.style.display = (html || '').trim() ? '' : 'none'; },
    close,
  };
  function close() {
    if (closed) return;
    closed = true;
    popLayer(ctx);
    mask.classList.remove('is-open');
    el.classList.remove('is-open');
    setTimeout(() => { mask.remove(); el.remove(); }, 220);
    if (o.onClose) o.onClose();
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  mask.addEventListener('click', () => { if (o.dismissible !== false) close(); });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) close();
  });
  pushLayer(ctx);
  ctx._offTrap = (() => {
    const fn = trapFocus(el);
    el.addEventListener('keydown', fn);
    return () => el.removeEventListener('keydown', fn);
  })();
  focusFirst(el);
  return ctx;
}

/** 二次确认 → Promise<boolean> */
export function confirmDialog(opt) {
  const o = opt || {};
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); ctx.close(); };
    const ctx = openModal({
      size: o.size || '',
      danger: !!o.danger,
      title: o.title || '确认操作',
      subtitle: o.subtitle || '',
      body: '<div style="font-size:12.5px;line-height:1.75;color:var(--txt-2)">' + (o.message || '') + '</div>' +
        (o.extra ? o.extra : ''),
      footer:
        '<button class="btn" type="button" data-act="cancel">' + (o.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '" type="button" data-act="ok">' + (o.okText || '确定') + '</button>',
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
    ctx.footer.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'ok') finish(true);
      else finish(false);
    });
  });
}

/** 单行/多行输入 → Promise<string|null>（取消返回 null） */
export function promptDialog(opt) {
  const o = opt || {};
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); ctx.close(); };
    const inputId = uid('pin');
    const ctx = openModal({
      size: o.size || '',
      title: o.title || '填写原因',
      subtitle: o.subtitle || '',
      body:
        '<div class="field">' +
          '<label for="' + inputId + '">' + esc(o.label || '原因') + (o.required === false ? '' : '<span class="req">*</span>') + '</label>' +
          (o.multiline
            ? '<textarea class="textarea" id="' + inputId + '" maxlength="' + (o.maxlength || 200) + '" placeholder="' + escAttr(o.placeholder || '') + '"></textarea>'
            : '<input class="input" id="' + inputId + '" maxlength="' + (o.maxlength || 200) + '" placeholder="' + escAttr(o.placeholder || '') + '" autocomplete="off">') +
          '<div class="hint" data-role="hint">' + esc(o.hint || '') + '</div>' +
          '<div class="err-tip hide" data-role="err"></div>' +
        '</div>',
      footer:
        '<button class="btn" type="button" data-act="cancel">取消</button>' +
        '<button class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '" type="button" data-act="ok">' + (o.okText || '确定') + '</button>',
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    const input = ctx.body.querySelector('#' + inputId);
    const errEl = ctx.body.querySelector('[data-role="err"]');
    input.focus();
    const submit = () => {
      const v = input.value.trim();
      const min = o.min || 2;
      if ((o.required !== false) && v.length < min) {
        errEl.textContent = o.minTip || ('请至少填写 ' + min + ' 个字');
        errEl.classList.remove('hide');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      finish(v);
    };
    ctx.footer.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'ok') submit();
      else finish(null);
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !o.multiline) { ev.preventDefault(); submit(); }
      if (ev.key === 'Enter' && o.multiline && (ev.metaKey || ev.ctrlKey)) submit();
    });
    input.addEventListener('input', () => {
      errEl.classList.add('hide');
      input.removeAttribute('aria-invalid');
    });
  });
}

/* ───────────────────────── 路由 ───────────────────────── */
const routes = new Map();
let fallbackName = 'dashboard';
let onChange = null;

export const router = {
  add(name, def) { routes.set(name, def); return this; },
  setFallback(name) { fallbackName = name; return this; },
  parse() {
    let raw = location.hash.replace(/^#\/?/, '');
    const qi = raw.indexOf('?');
    const name = (qi >= 0 ? raw.slice(0, qi) : raw) || fallbackName;
    const params = {};
    if (qi >= 0) {
      const sp = new URLSearchParams(raw.slice(qi + 1));
      sp.forEach((v, k) => { params[k] = v; });
    }
    return { name, params };
  },
  current() { return this.parse(); },
  start(cb) {
    onChange = cb;
    /* 退出登录再登录会重新 start 一次；先摘掉上一条监听，
       否则同一个 hashchange 会触发多次渲染（页面接口被打两遍）。 */
    if (this._onHash) window.removeEventListener('hashchange', this._onHash);
    this._onHash = () => this.dispatch();
    window.addEventListener('hashchange', this._onHash);
    this.dispatch(true);
  },
  /* 外壳销毁时调用：登录页不需要继续监听地址栏 */
  stop() {
    if (this._onHash) window.removeEventListener('hashchange', this._onHash);
    this._onHash = null;
    onChange = null;
  },
  dispatch(first) {
    const { name, params } = this.parse();
    const def = routes.get(name);
    if (!def) {
      this.replace(fallbackName);
      return;
    }
    store.route = name;
    if (onChange) onChange(def, params, { first: !!first });
  },
  go(name, params, opt) {
    const q = buildQuery(params);
    const target = '#/' + name + q;
    if (location.hash === target) { this.dispatch(); return; }
    if (opt && opt.replace) this.replace(name, params);
    else location.hash = target;
  },
  replace(name, params) {
    const q = buildQuery(params);
    const target = '#/' + name + q;
    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search + target);
      this.dispatch();
    } else location.hash = target;
  },
  refresh() { this.dispatch(); },
};

/* ───────────────────────── 图标 ───────────────────────── */
/* 内联 SVG：零依赖、可继承 currentColor、不额外发请求。
   统一 24 网格 + 1.7 描边，视觉重量与 13px 正文匹配。 */
const ICONS = {
  dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  posts: '<rect x="4" y="3.5" width="16" height="17" rx="2.4"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.6 19.4c.5-3 2.7-4.8 5.4-4.8s4.9 1.8 5.4 4.8"/><path d="M16 5.6a2.9 2.9 0 0 1 0 5.7M17.4 14.9c2 .5 3.3 2 3.7 4.2"/>',
  rewards: '<rect x="3.5" y="8.5" width="17" height="11.5" rx="2"/><path d="M2.8 8.5h18.4v3.2H2.8zM12 8.5v11.5"/><path d="M12 8.5C10.4 8.5 8 7.6 8 5.6A2.1 2.1 0 0 1 12 5c.6-1.6 1.6-2.1 2.6-1.6 1.4.7 1 2.7-2.6 5.1z"/>',
  roles: '<path d="M12 3.2 4.8 5.6v5.2c0 4.4 3 8.2 7.2 9.9 4.2-1.7 7.2-5.5 7.2-9.9V5.6z"/><path d="m8.9 11.6 2.2 2.2 4-4.2"/>',
  logs: '<path d="M5 4.5h14v15H5z"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V9h-4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.3 4.3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.8 4.4 4.4L19 6.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.3 2.6 2.6 4.8-5.2"/>',
  xCircle: '<circle cx="12" cy="12" r="8.6"/><path d="m9 9 6 6M15 9l-6 6"/>',
  trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.4 7l.8 12.2c.05.9.8 1.6 1.7 1.6h6.2c.9 0 1.65-.7 1.7-1.6L17.6 7"/><path d="M10.2 10.8v6.4M13.8 10.8v6.4"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17 4 20z"/><path d="m14.8 6.4 3 3"/>',
  download: '<path d="M12 3.8v11.4"/><path d="m7.8 11.4 4.2 4.2 4.2-4.2"/><path d="M4.5 19.6h15"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12 17.6 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5.6 0 9.2 6 9.2 6a17 17 0 0 1-3.1 3.7M6.4 7.6A17 17 0 0 0 2.8 12s3.6 6 9.2 6c1.2 0 2.3-.3 3.3-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  pin: '<path d="M9 3.5h6l-.7 5.1 3.2 3.2v1.4H6.5v-1.4l3.2-3.2z"/><path d="M12 13.2v7.3"/>',
  chevronLeft: '<path d="m14.2 6.5-5.5 5.5 5.5 5.5"/>',
  chevronRight: '<path d="m9.8 6.5 5.5 5.5-5.5 5.5"/>',
  chevronDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  logout: '<path d="M9.5 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3.5"/><path d="M15 8.5 18.5 12 15 15.5M18.5 12H9"/>',
  alert: '<path d="M12 4.2 21 19.8H3z"/><path d="M12 9.6v4.4M12 17.1v.6"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.9v.6"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 1.9"/>',
  sort: '<path d="M7 4.5v15M7 4.5 4 7.6M7 4.5l3 3.1"/><path d="M17 19.5v-15M17 19.5l-3-3.1M17 19.5l3-3.1"/>',
  filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.4 3.2-5.3 7-5.3s6.4 1.9 7 5.3"/>',
  shield: '<path d="M12 3.2 4.8 5.6v5.2c0 4.4 3 8.2 7.2 9.9 4.2-1.7 7.2-5.5 7.2-9.9V5.6z"/>',
  heart: '<path d="M12 20s-7.4-4.3-7.4-9.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.4 3.1C19.4 15.7 12 20 12 20z"/>',
  comment: '<path d="M20 12.4c0 3.8-3.6 6.9-8 6.9-1 0-2-.2-2.9-.5L4.5 20l1.2-3.6A6.4 6.4 0 0 1 4 12.4C4 8.6 7.6 5.5 12 5.5s8 3.1 8 6.9z"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6.2" r="2.4"/><circle cx="18" cy="17.8" r="2.4"/><path d="m8.2 10.8 7.6-3.5M8.2 13.2l7.6 3.5"/>',
  ban: '<circle cx="12" cy="12" r="8.6"/><path d="m6.4 6.4 11.2 11.2"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.6a4 4 0 0 1 7.8-1.3"/>',
  key: '<circle cx="8.5" cy="15.5" r="3.5"/><path d="m11 13 8.5-8.5M16.4 6.6l2.2 2.2M14.2 8.8l2.2 2.2"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.5"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  trendUp: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
  wave: '<path d="M3 9.5c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 3.4-2.2 4.8-.6M3 15c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 3.4-2.2 4.8-.6"/>',
  inbox: '<path d="M3.5 12.5 6 5.2h12l2.5 7.3v5.7a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M3.5 12.5h4.2l1.2 2.4h6.2l1.2-2.4h4.2"/>',
};

export function icon(name, cls) {
  const body = ICONS[name] || ICONS.info;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : '') + '>' + body + '</svg>';
}

/* 鲸域鲸鱼线稿：取自站点 favicon 的同一条路径（同一族的记号），
   只换描边色，保证后台与站点是同一个品牌而不是"另一个系统"。 */
const WHALE_PATH = 'M27.1 57.8 C27.3 57.4 28.1 56.2 28.6 55.4 C29.0 54.6 29.4 53.9 29.8 52.9 C30.1 52.0 30.3 51.5 30.8 49.9 C31.2 48.3 32.1 44.8 32.5 43.4 C32.9 42.0 33.0 42.1 33.3 41.6 C33.6 41.0 33.9 40.6 34.2 40.2 C34.6 39.7 35.0 39.3 35.4 39.0 C35.9 38.6 35.1 38.8 36.8 38.0 C38.6 37.3 44.0 35.4 46.0 34.5 C48.0 33.6 48.1 33.4 49.0 32.8 C50.0 32.1 50.7 31.6 51.6 30.8 C52.6 29.9 53.7 28.8 54.6 27.8 C55.4 26.7 56.1 25.7 56.7 24.6 C57.3 23.6 57.8 22.2 58.1 21.5 C58.3 20.7 58.3 20.6 58.3 20.2 C58.3 19.9 58.3 19.5 58.2 19.2 C58.1 19.0 58.0 18.8 57.9 18.7 C57.7 18.5 58.2 18.4 57.1 18.4 C56.1 18.4 53.7 19.0 51.6 18.9 C49.5 18.8 46.2 18.1 44.6 17.9 C42.9 17.7 42.6 17.7 41.6 17.8 C40.6 17.8 40.0 17.8 38.6 18.1 C37.3 18.4 34.8 19.4 33.7 19.7 C32.7 20.0 32.7 19.8 32.3 19.7 C31.8 19.6 31.8 19.6 31.2 19.1 C30.5 18.5 29.2 17.1 28.4 16.4 C27.7 15.8 27.3 15.5 26.5 15.1 C25.8 14.7 25.3 14.4 23.9 13.9 C22.5 13.4 19.5 12.7 18.0 12.3 C16.6 11.8 16.2 11.6 15.3 11.2 C14.5 10.7 13.8 10.4 12.9 9.6 C12.0 8.9 10.5 7.4 9.7 6.8 C9.0 6.3 8.7 6.3 8.4 6.2 C8.0 6.1 7.8 6.2 7.5 6.4 C7.2 6.6 6.9 6.9 6.6 7.3 C6.4 7.7 6.2 8.1 6.1 8.7 C5.9 9.3 5.8 10.0 5.7 10.7 C5.7 11.4 5.7 12.3 5.7 13.1 C5.8 14.0 5.9 15.0 6.0 15.8 C6.1 16.6 6.3 17.3 6.5 18.1 C6.7 18.9 6.9 19.5 7.4 20.5 C7.8 21.5 8.6 23.0 9.3 24.1 C10.1 25.3 11.0 26.4 11.9 27.4 C12.7 28.4 13.2 28.9 14.5 30.0 C15.7 31.0 18.3 32.9 19.4 33.8 C20.5 34.7 20.6 34.8 21.0 35.4 C21.5 36.0 21.9 36.7 22.1 37.4 C22.4 38.0 22.5 38.6 22.5 39.3 C22.6 39.9 22.5 40.5 22.4 41.2 C22.3 41.9 22.1 42.7 21.8 43.4 C21.5 44.2 21.1 45.0 20.7 45.8 C20.3 46.6 19.8 47.3 19.3 48.0 C18.8 48.8 18.2 49.5 17.6 50.1 C17.0 50.8 16.8 51.1 15.6 52.0 C14.5 53.0 11.5 55.2 10.6 55.8';

export function whaleMark(cls) {
  return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<path d="' + WHALE_PATH + '"/></svg>';
}

/* ───────────────────────── 头像 ───────────────────────── */
/* 站点用户有 emoji / grad / avatar 三种兜底：图片优先，其次 emoji，最后昵称首字 */
export function avatar(person, sizeClass) {
  const p = person || {};
  const cls = 'avatar' + (sizeClass ? ' ' + sizeClass : '');
  const face = p.emoji || (p.name ? String(p.name).slice(0, 1) : '鲸');
  if (p.avatar) {
    /* 头像图可能来自外部存储而 404：先铺一层文字兜底，图片加载成功才盖住它。
       加载失败由模块底部的全局 error 监听移除 img，避免浏览器画出破图标。 */
    return '<span class="' + cls + '"><span class="av-fb" aria-hidden="true">' + esc(face) + '</span>' +
      '<img src="' + escAttr(p.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
  }
  return '<span class="' + cls + '" aria-hidden="true">' + esc(face) + '</span>';
}

/* 图片 404 时把 <img> 摘掉，露出底下的文字头像。error 不冒泡，必须用捕获。 */
if (typeof document !== 'undefined') {
  document.addEventListener('error', function (ev) {
    const t = ev.target;
    if (t && t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('avatar')) {
      t.remove();
    }
  }, true);
}


/* ───────────────────────── 业务共用的小零件 ───────────────────────── */
/* 状态文案与 pill 类名放在一处：六个页面说同一个状态时必须用同一个词，
   否则"待审核"在列表里和抽屉里会有两种叫法。 */
export const STATUS_TEXT = {
  post: { published: '已发布', pending: '待审核', rejected: '已驳回', hidden: '已隐藏' },
  /* 插件条目的四态与帖子同名同义，但它是「公开面还在不在」的唯一开关：
     published 之外的三态都会让条目从 /api/plugins 与条目页一起消失。 */
  plugin: { published: '已上架', pending: '待审核', rejected: '已驳回', hidden: '已下架' },
  /* 举报五态：open 是刚收到，handling 是有人接了，resolved 是处理完，rejected 是不成立。 */
  report: { open: '待处理', handling: '处理中', resolved: '已处理', rejected: '不予处理' },
  user: { active: '正常', disabled: '已禁用' },
  reward: { active: '已发放', revoked: '已撤回' },
  admin: { active: '启用', disabled: '停用' },
};

/* 状态 → pill 配色。为什么要有这张表：statusPill 直接把状态名当 class 名用
   （pill--published / pill--pending …），而 report 的四个状态名里只有 rejected 是
   已有配色，open/handling/resolved 在 admin.css 里没有对应 class，会渲染成灰色默认。
   open 用 warn 黄、handling 用 brand 蓝、resolved 用 ok 绿，语义与帖子/用户两套一致。
   只覆写需要的键，其余一律沿用原名 —— 不动已有调用方。 */
const PILL_CLASS = {
  open: 'pending',
  handling: 'brand',
  resolved: 'published',
};

export function statusPill(kind, status, text) {
  const t = text || (STATUS_TEXT[kind] && STATUS_TEXT[kind][status]) || status || '未知';
  const cls = PILL_CLASS[status] || status || 'plain';
  return '<span class="pill pill--' + esc(cls) + '">' + esc(t) + '</span>';
}

/* 空态：插画位默认用鲸鱼记号，跟品牌同源；文案由页面给，避免出现
   "暂无数据"这种说了等于没说的句子。 */
export function emptyHTML(opt) {
  const o = opt || {};
  return '<div class="empty">' +
    '<div class="empty-art">' + (o.icon ? icon(o.icon) : whaleMark()) + '</div>' +
    '<h3>' + esc(o.title || '这里还没有内容') + '</h3>' +
    (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
    (o.action ? '<button class="btn ' + (o.action.kind || 'btn--primary') + '" type="button" data-empty-act="' + escAttr(o.action.act || '') + '">' + esc(o.action.label) + '</button>' : '') +
    '</div>';
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

/**
 * 分页条：页码只露首尾与当前邻位，中间用省略号，40 页也不会撑爆一行。
 * 事件统一交给 bindPager，页面不必给每个按钮挂监听。
 */
export function pagerHTML(page, total, pageSize) {
  const size = Number(pageSize) || 20;
  const count = Number(total) || 0;
  if (count <= 0) return '';
  const pages = Math.max(1, Math.ceil(count / size));
  const cur = clamp(page || 1, 1, pages);
  const nums = [];
  const push = (n) => { if (n >= 1 && n <= pages && nums.indexOf(n) < 0) nums.push(n); };
  push(1); push(cur - 1); push(cur); push(cur + 1); push(pages);
  nums.sort((a, b) => a - b);
  let list = '';
  let prev = 0;
  nums.forEach((n) => {
    if (prev && n - prev > 1) list += '<span class="pager-gap">…</span>';
    list += '<button class="pager-btn" type="button" data-pager="' + n + '"' + (n === cur ? ' aria-current="page"' : '') + '>' + n + '</button>';
    prev = n;
  });
  return '<div class="pager">' +
    '<div class="pager-info">共 <b class="num">' + fmt.int(count) + '</b> 条 · 第 ' + cur + ' / ' + pages + ' 页</div>' +
    '<div class="pager-list">' +
      '<button class="pager-btn" type="button" data-pager="' + (cur - 1) + '"' + (cur <= 1 ? ' disabled' : '') + ' aria-label="上一页">' + icon('chevronLeft') + '</button>' +
      list +
      '<button class="pager-btn" type="button" data-pager="' + (cur + 1) + '"' + (cur >= pages ? ' disabled' : '') + ' aria-label="下一页">' + icon('chevronRight') + '</button>' +
    '</div>' +
  '</div>';
}

export function bindPager(root, onGo) {
  return delegate(root, 'click', '[data-pager]', (ev, el) => {
    if (el.disabled) return;
    const n = Number(el.getAttribute('data-pager'));
    if (n > 0) onGo(n);
  });
}

/* 筛选条"清空"按钮：只在真有筛选条件时出现，避免常驻一个没用的按钮 */
export function hasFilter() {
  for (let i = 0; i < arguments.length; i += 1) {
    const a = arguments[i];
    if (a !== '' && a != null && a !== 'all') return true;
  }
  return false;
}

/* 让字符串安全地进 data-* 属性 */
export function dataAttr(v) { return escAttr(v == null ? '' : v); }

/* 日期分组标签：日志按天分段时用 */
export function dayLabel(sec) {
  const d = new Date((Number(sec) || 0) * 1000);
  const today = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return '今天';
  const y = new Date(today.getTime() - 86400000);
  if (same(d, y)) return '昨天';
  return fmt.date(sec);
}

/* 文本缩略：中文按字算，不按字节，避免"…"出现在半个词中间 */
export function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!max || s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/* 奖励数量的人类说法，三个页面各写一遍容易不一致 */
export function rewardAmount(r) {
  if (!r) return '';
  if (r.type === 'points') return '+' + fmt.int(r.amount) + ' 积分';
  if (r.type === 'days') {
    return '+' + fmt.int(r.amount) + ' 天' + (r.tierLabel ? '「' + r.tierLabel + '」会员' : '会员');
  }
  /* 头像框：新记录带 frameShort（赤金 Lv3），老记录没有就回中性说法 */
  if (r.type === 'frame') return '头像框 · ' + (r.frameShort || r.frameLabel || '已更换');
  return '自定义奖励';
}


/* ───────────────────────── 演示数据 ───────────────────────── */
/* 后端未就绪时用它把整个 UI 跑通。数据是确定性的（固定种子），
   截图每次一致；写操作会真的改动内存数据，方便验收交互链路。 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_DB = { ready: false, users: [], posts: [], rewards: [], roles: [], admins: [], logs: [], session: null, seq: 9000 };
const MOCK_PASSWORD = 'whale1234';

const PERM_CATALOG = [
  { key: '工作台', label: '工作台', items: [
    { key: 'dashboard.view', label: '查看工作台', desc: '概览指标与待办' },
  ] },
  { key: '内容', label: '内容', items: [
    { key: 'post.view', label: '查看帖子', desc: '列表、详情、搜索' },
    { key: 'post.edit', label: '编辑帖子', desc: '改正文 / 置顶' },
    { key: 'post.review', label: '审核帖子', desc: '通过 / 驳回 / 打回待审' },
    { key: 'post.delete', label: '删除帖子', desc: '单条删除、批量删除' },
  ] },
  { key: '用户', label: '用户', items: [
    { key: 'user.view', label: '查看用户', desc: '列表、注册信息、详情' },
    { key: 'user.edit', label: '编辑用户', desc: '改等级、徽章' },
    { key: 'user.status', label: '禁用 / 启用用户', desc: '需填写原因' },
    { key: 'user.delete', label: '删除用户', desc: '级联删除，二次确认' },
  ] },
  { key: '运营', label: '运营', items: [
    { key: 'reward.view', label: '查看奖励', desc: '发放历史与导出' },
    { key: 'reward.grant', label: '发放奖励', desc: '新增一条奖励记录' },
    { key: 'reward.revoke', label: '撤回奖励', desc: '撤回并写原因' },
  ] },
  { key: '权限', label: '权限', items: [
    { key: 'role.view', label: '查看角色', desc: '角色与权限矩阵只读' },
    { key: 'role.manage', label: '管理角色', desc: '新建 / 编辑 / 删除角色' },
    { key: 'admin.view', label: '查看管理员', desc: '管理员账号列表' },
    { key: 'admin.manage', label: '管理管理员', desc: '建号 / 改角色 / 停用 / 重置密码 / 删除' },
  ] },
  { key: '系统', label: '系统', items: [
    { key: 'log.viewAll', label: '查看全部日志', desc: '没有此权限时只能看自己的日志' },
    { key: 'log.export', label: '导出日志', desc: 'CSV 导出' },
  ] },
];
const ALL_PERMS = PERM_CATALOG.reduce((a, g) => a.concat(g.items.map((i) => i.key)), []);

const ACTION_LABEL = {
  'auth.login': '登录', 'auth.login_fail': '登录失败', 'auth.logout': '退出登录', 'auth.password': '修改密码',
  'post.edit': '编辑帖子', 'post.review': '审核帖子', 'post.delete': '删除帖子',
  'post.batch_review': '批量审核', 'post.batch_delete': '批量删除',
  'user.edit': '编辑用户', 'user.disable': '禁用用户', 'user.enable': '启用用户', 'user.delete': '删除用户',
  'reward.grant': '发放奖励', 'reward.frame': '更换头像框', 'reward.revoke': '撤回奖励',
  'role.create': '新建角色', 'role.update': '修改角色', 'role.delete': '删除角色',
  'admin.create': '新建管理员', 'admin.update': '修改管理员', 'admin.reset_password': '重置密码', 'admin.delete': '删除管理员',
};

const POST_TEXTS = [
  '把 DSH 的插件市场接进来之后，我终于不用在三个仓库之间来回翻了。今天整理了一份「常用插件清单」，需要的自取。',
  '第一次用鲸域的夜间模式，深蓝配色的对比度比想象中舒服，盯着看两小时不累。就是希望评论区能记住上次的滚动位置。',
  '求助：上传 12MB 的 GIF 一直失败，是前端限制还是存储配额？已经试过压缩到 8MB 还是不行。',
  '分享一个写更新日志的小习惯：先写「用户会遇到什么变化」，再写「我们改了什么」。读者其实只关心前半句。',
  '这两周把站点的图片全部转成 WebP，首屏时间从 2.4s 降到 1.1s，流量账单也降了一大截。附一张对比图。',
  '刚看到社群版块有人组织线下聚会，杭州场有人去吗？想顺便聊聊插件开发的踩坑。',
  '把收藏夹做成了「稍后再看」的风格，结果发现自己收藏了 200 多条再也没打开过……有没有清理工具推荐。',
  '今天第一次给别人 review 代码，才意识到「说清楚为什么」比「指出哪里错」难得多。',
  '建议：成员列表能不能加一个「最近活跃」排序？现在找人基本靠搜索，有点费劲。',
  '插件详情页的截图预览做得不错，但希望支持键盘左右切换，用触控板横滑也行。',
  '整理了一份 2026 年还在维护的开源社群项目清单，按活跃度排了序，欢迎补充。',
  '已经连续签到 180 天了，纪念一下。顺便问问积分除了换徽章还能干嘛？',
  '把家里的旧笔记本装成了 Linux 当家庭服务器，跑站点备份，功耗 8W，比想象中安静。',
  '文本审核误判有点多，这篇讲技术方案的帖子被拦了三次。建议给「技术讨论」加个白名单关键词。',
  '新写的插件「潮汐日历」上架了：把社群活动和更新日志合成一条时间线，欢迎试用。',
  '有人对比过 SQLite 和 Postgres 在十万级帖子下的表现吗？想听听真实数据。',
];

const REVIEW_NOTES = ['含外链广告', '与版块主题不符', '疑似重复发布', '图片版权存疑', '内容完整，通过', '语气过激，建议修改后重发'];
const GRANT_REASONS = ['社区活跃奖励', '优质内容激励', '活动获奖发放', '内测贡献回馈', '签到补发', '线下聚会补贴'];

/* 演示库的会员档位与头像框目录：与 server/src/routes/admin-rewards.js 的 tierOptions()/FRAMES 对齐，
   本地不带后端也能把「档位 + 头像框」两个入口点到底。 */
const MOCK_TIERS = [
  { key: 'diamond', name: '钻石', accent: '#38bdf8', tagline: '轻度支持者', rank: 1, priceCents: 1200, days: 30 },
  { key: 'master', name: '大师', accent: '#8b7cf6', tagline: '稳定同行者', rank: 2, priceCents: 3600, days: 30 },
  { key: 'grandmaster', name: '宗师', accent: '#f0a63c', tagline: '深度共建者', rank: 3, priceCents: 9800, days: 30 },
  { key: 'hunt', name: '猎杀', accent: '#f2557a', tagline: '最高档位', rank: 4, priceCents: 19800, days: 30 },
];
const MOCK_FRAMES = [
  { key: 'auto', name: '跟随会员档位', short: '跟随档位', level: 0 },
  { key: 'maw-1', name: '血契 · 冷钢', short: '冷钢 Lv1', level: 1 },
  { key: 'maw-2', name: '裂颚 · 紫铜', short: '紫铜 Lv2', level: 2 },
  { key: 'maw-3', name: '屠场 · 赤金', short: '赤金 Lv3', level: 3 },
  { key: 'maw-4', name: '猎杀 · 血铁', short: '血铁 Lv4', level: 4 },
  { key: 'none', name: '不戴头像框', short: '不戴', level: 0 },
];
const MOCK_TIER_NAMES = { diamond: '钻石', master: '大师', grandmaster: '宗师', hunt: '猎杀' };
function mockTier(key) {
  return MOCK_TIERS.find((t) => t.key === key) || MOCK_TIERS[0];
}
function mockFrameName(key, short) {
  const f = MOCK_FRAMES.find((x) => x.key === key);
  if (!f) return key || '跟随会员档位';
  return short ? f.short : f.name;
}
/* 发放对象面板：与后端 userPanel() 同形，前端两种模式共用一套渲染 */
function mockPanel(u) {
  if (!u) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = Number(u.memberExpiresAt) || 0;
  const tierActive = !!u.memberTier && expiresAt > nowSec;
  const t = mockTier(u.memberTier || 'diamond');
  return {
    id: u.id, name: u.name, email: maskEmail(u.email), points: u.points || 0,
    frame: u.frame || 'auto', frameLabel: mockFrameName(u.frame || 'auto'),
    frameFollow: !u.frame || u.frame === 'auto',
    tier: u.memberTier || 'free', tierName: MOCK_TIER_NAMES[u.memberTier] || '旅人',
    tierActive, tierAccent: tierActive ? t.accent : '',
    expiresAt, daysLeft: expiresAt > nowSec ? Math.ceil((expiresAt - nowSec) / 86400) : 0,
    expired: !!expiresAt && expiresAt <= nowSec,
  };
}
const DISABLE_REASONS = ['批量刷屏，多次提醒无效', '发布违规外链', '账号被盗用，临时冻结'];

function seedMock() {
  if (MOCK_DB.ready) return;
  const rnd = mulberry32(20261024);
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;

  const names = ['鲸友', '海盐汽水', '深蓝信标', '潮汐观察员', '鲸落', '南屿', '北纬三十度', '小满', '阿澜', '空镜', '白噪音', '折光', '雾港', '蓝鲸不唱歌', '一只咸鱼', '舟', '拾光', '海雾', '林深', '矢量', '余温', '橘子汽水', '慢速列车', '沉船与星', '回声室', '小舟'];
  const emojis = ['🐳', '🌊', '🐋', '🧭', '🪸', '🌙', '⚓', '🐚', '🫧', '🛶'];
  const badges = ['', '', '早期成员', '优质作者', '活动之星', '内测贡献'];
  const cities = ['杭州', '上海', '成都', '广州', '北京', '武汉', '深圳', '南京', '西安', '长沙'];

  MOCK_DB.users = names.map((name, i) => {
    const id = i + 1;
    const disabled = i === 6 || i === 13 || i === 21;
    const created = now - Math.floor((700 - i * 17) * day) - Math.floor(rnd() * day);
    return {
      id, name,
      email: (['haiyan', 'whale', 'tide', 'blue', 'echo', 'south', 'lat30', 'xiaoman', 'alan', 'void', 'noise', 'prism', 'fog', 'singer', 'fish', 'zhou', 'light', 'mist', 'forest', 'vector', 'warm', 'orange', 'train', 'star', 'echo2', 'boat'][i] || 'user' + id) + '@' + (i % 3 === 0 ? 'qq.com' : i % 3 === 1 ? '163.com' : 'gmail.com'),
      phoneMasked: '1' + (38 + (i % 4)) + '****' + String(1000 + i * 7).slice(-4),
      phoneVerified: i % 4 !== 3,
      avatar: '',
      emoji: emojis[i % emojis.length],
      grad: '',
      level: 1 + ((i * 3) % 9),
      badge: badges[i % badges.length],
      sig: i % 3 === 0 ? '在海边写代码。' : '',
      city: cities[i % cities.length],
      fans: Math.floor(rnd() * 240),
      follows: Math.floor(rnd() * 80) + 3,
      visits: 20 + Math.floor(rnd() * 900),
      status: disabled ? 'disabled' : 'active',
      disabledReason: disabled ? DISABLE_REASONS[i % DISABLE_REASONS.length] : '',
      disabledAt: disabled ? now - Math.floor(rnd() * 20 * day) : 0,
      points: Math.floor(rnd() * 780),
      postCount: 0,
      createdAt: created,
      /* 演示数据：每 4 个用户给一个付费档位（部分已过期），头像框分布在 auto/具体档/不戴 */
      frame: ['auto', 'maw-3', 'none', 'maw-1', '', 'maw-4'][i % 6],
      memberTier: i % 3 === 2 ? '' : ['diamond', 'master', 'grandmaster', 'hunt'][i % 4],
      memberExpiresAt: i % 3 === 2 ? 0 : now - Math.floor((i % 5 === 1 ? -1 : 1) * (i % 7 + 1) * 9 * day),
    };
  });

  const statuses = ['published', 'published', 'published', 'pending', 'published', 'rejected', 'published', 'hidden', 'pending', 'published', 'published', 'rejected', 'published', 'pending', 'published', 'published', 'published', 'hidden', 'published', 'pending', 'published', 'rejected', 'published', 'published', 'pending', 'published', 'published', 'pending', 'published', 'rejected', 'published', 'hidden', 'published', 'published', 'pending', 'published', 'hidden', 'published', 'published', 'pending'];
  MOCK_DB.posts = statuses.map((status, i) => {
    const id = 101 + i;
    const u = MOCK_DB.users[(i * 5 + 2) % MOCK_DB.users.length];
    const hasImg = i % 5 === 0 || i % 7 === 3;
    const imgs = hasImg ? [0, 1, 2].slice(0, 1 + (i % 3)).map((k) => ({
      key: 'u/2026/10/mock-' + id + '-' + k + '.jpg',
      url: mockImageData(id + k),
      full: mockImageData(id + k),
      w: 1080, h: 720, type: 'image/jpeg',
    })) : [];
    const reviewed = status !== 'pending';
    return {
      id, userId: u.id,
      author: { id: u.id, name: u.name, avatar: u.avatar, emoji: u.emoji, grad: u.grad, level: u.level, badge: u.badge, status: u.status },
      text: POST_TEXTS[(i * 3 + 1) % POST_TEXTS.length],
      images: imgs,
      pluginSlug: i % 6 === 0 ? 'tide-calendar' : '',
      pluginVer: i % 6 === 0 ? '1.2.0' : '',
      pinned: i === 3 || i === 11,
      likes: Math.floor(rnd() * 90),
      shares: Math.floor(rnd() * 18),
      comments: Math.floor(rnd() * 26),
      status,
      reviewNote: reviewed ? REVIEW_NOTES[i % REVIEW_NOTES.length] : '',
      reviewedAt: reviewed ? now - Math.floor(rnd() * 30 * day) : 0,
      reviewedBy: reviewed ? 1 : 0,
      createdAt: now - Math.floor((i < 12 ? rnd() * 3 : rnd() * 120) * day) - Math.floor(rnd() * 40000),
    };
  });
  /* 作者帖子数回填，保持列表与详情一致 */
  MOCK_DB.posts.forEach((p) => { const u = MOCK_DB.users.find((x) => x.id === p.userId); if (u) u.postCount++; });

  MOCK_DB.roles = [
    { id: 1, key: 'owner', name: '超级管理员', description: '站点所有者，拥有全部权限，权限矩阵不可编辑', permissions: ALL_PERMS.slice(), builtin: 1, memberCount: 1, createdAt: now - 400 * day },
    { id: 2, key: 'admin', name: '管理员', description: '日常运营与内容管理，不能管理角色与管理员账号', permissions: ALL_PERMS.filter((k) => k !== 'role.manage' && k !== 'admin.manage'), builtin: 1, memberCount: 1, createdAt: now - 400 * day },
    { id: 3, key: 'editor', name: '编辑', description: '负责内容审核与编辑，不可删除内容与用户', permissions: ['dashboard.view', 'post.view', 'post.edit', 'post.review', 'user.view', 'reward.view'], builtin: 1, memberCount: 1, createdAt: now - 400 * day },
    { id: 4, key: 'staff', name: '普通员工', description: '只读查看，适合客服与实习生', permissions: ['dashboard.view', 'post.view', 'user.view', 'reward.view'], builtin: 1, memberCount: 1, createdAt: now - 400 * day },
    { id: 7, key: 'role_7', name: '内容审核员', description: '只看内容队列，可以审核但不能编辑正文', permissions: ['dashboard.view', 'post.view', 'post.review', 'user.view'], builtin: 0, memberCount: 0, createdAt: now - 90 * day },
    { id: 8, key: 'role_8', name: '运营助理', description: '奖励发放与日志查看', permissions: ['dashboard.view', 'user.view', 'reward.view', 'reward.grant', 'log.viewAll'], builtin: 0, memberCount: 1, createdAt: now - 45 * day },
  ];

  MOCK_DB.admins = [
    { id: 1, account: 'root', name: '站长', roleId: 1, roleKey: 'owner', roleName: '超级管理员', status: 'active', lastLoginAt: now - 3600, lastLoginIp: '203.0.113.24', createdAt: now - 400 * day },
    { id: 2, account: 'alan', name: '阿澜', roleId: 2, roleKey: 'admin', roleName: '管理员', status: 'active', lastLoginAt: now - 7200, lastLoginIp: '198.51.100.8', createdAt: now - 210 * day },
    { id: 3, account: 'xiaoman', name: '小满', roleId: 3, roleKey: 'editor', roleName: '编辑', status: 'active', lastLoginAt: now - 86400, lastLoginIp: '192.0.2.77', createdAt: now - 120 * day },
    { id: 4, account: 'zhou', name: '小舟', roleId: 4, roleKey: 'staff', roleName: '普通员工', status: 'active', lastLoginAt: now - 3 * day, lastLoginIp: '203.0.113.91', createdAt: now - 30 * day },
    { id: 5, account: 'intern08', name: '实习生（已停用）', roleId: 4, roleKey: 'staff', roleName: '普通员工', status: 'disabled', lastLoginAt: now - 60 * day, lastLoginIp: '198.51.100.44', createdAt: now - 300 * day },
  ];

  MOCK_DB.rewards = Array.from({ length: 18 }, (_, i) => {
    const u = MOCK_DB.users[(i * 3 + 1) % MOCK_DB.users.length];
    const revoked = i % 7 === 4;
    const type = i % 5 === 0 ? 'days' : i % 11 === 3 ? 'frame' : i % 9 === 0 ? 'custom' : 'points';
    const tier = type === 'days' ? MOCK_TIERS[i % MOCK_TIERS.length].key : '';
    const frame = type === 'frame' ? MOCK_FRAMES[1 + (i % 5)].key : '';
    return {
      id: 301 + i, userId: u.id,
      user: { id: u.id, name: u.name, email: maskEmail(u.email), avatar: u.avatar },
      type, typeLabel: type === 'points' ? '积分' : type === 'days' ? '会员天数' : type === 'frame' ? '头像框' : '自定义',
      tier, tierLabel: tier ? MOCK_TIER_NAMES[tier] : '',
      frame, frameLabel: frame ? mockFrameName(frame) : '',
      frameShort: frame ? mockFrameName(frame, true) : '',
      prevFrame: frame ? 'auto' : '',
      amount: type === 'custom' || type === 'frame' ? 0 : (type === 'days' ? 7 + (i % 4) * 7 : 50 * (1 + (i % 6))),
      reason: GRANT_REASONS[i % GRANT_REASONS.length],
      note: i % 4 === 0 ? '与十月活动一并结算' : '',
      status: revoked ? 'revoked' : 'active',
      grantedBy: { id: i % 2 ? 1 : 2, name: i % 2 ? '站长' : '阿澜' },
      grantedAt: now - Math.floor((i * 1.7 + 0.4) * day) - Math.floor(rnd() * 20000),
      revokedAt: revoked ? now - Math.floor(rnd() * 5 * day) : 0,
      revokedBy: revoked ? { id: 1, name: '站长' } : null,
      revokedReason: revoked ? '重复发放，已撤回' : '',
    };
  });

  const logSeeds = [
    ['post.review', 'post', '驳回帖子 #112：含外链广告', 'fail'], ['auth.login', 'admin', '登录后台', 'ok'],
    ['post.review', 'post', '通过帖子 #104', 'ok'], ['reward.grant', 'reward', '向用户 #9 发放 200 积分：社区活跃奖励', 'ok'],
    ['user.disable', 'user', '禁用用户 #7（北纬三十度）：批量刷屏', 'ok'], ['post.delete', 'post', '删除帖子 #118', 'ok'],
    ['role.update', 'role', '修改角色「内容审核员」权限：+post.review', 'ok'], ['admin.reset_password', 'admin', '重置管理员 alan 的密码', 'ok'],
    ['user.enable', 'user', '启用用户 #22（橘子汽水）', 'ok'], ['auth.login_fail', 'admin', '登录失败：账号或密码不对', 'fail'],
    ['post.edit', 'post', '编辑帖子 #121：更新正文', 'ok'], ['reward.revoke', 'reward', '撤回奖励 #305：重复发放', 'ok'],
    ['admin.create', 'admin', '新建管理员 zhou（普通员工）', 'ok'], ['post.batch_review', 'post', '批量通过 6 条帖子', 'ok'],
    ['post.batch_delete', 'post', '批量删除 3 条帖子', 'ok'], ['user.edit', 'user', '编辑用户 #3 等级 6 → 7', 'ok'],
    ['role.create', 'role', '新建角色「内容审核员」', 'ok'], ['auth.logout', 'admin', '退出登录', 'ok'],
    ['admin.update', 'admin', '调整管理员 xiaoman 的角色为编辑', 'ok'], ['user.delete', 'user', '删除用户 #18', 'ok'],
    ['auth.password', 'admin', '修改自己的登录密码', 'ok'], ['role.delete', 'role', '删除角色「临时审核」', 'fail'],
    ['admin.delete', 'admin', '删除管理员 intern08', 'ok'], ['post.review', 'post', '将帖子 #127 打回待审', 'ok'],
    ['reward.grant', 'reward', '向用户 #2 发放 30 天会员：活动获奖发放', 'ok'], ['user.disable', 'user', '禁用用户 #14：发布违规外链', 'ok'],
    ['post.delete', 'post', '删除帖子 #133', 'ok'], ['auth.login', 'admin', '登录后台', 'ok'],
    ['post.review', 'post', '通过帖子 #109', 'ok'], ['reward.grant', 'reward', '向用户 #6 发放 100 积分：优质内容激励', 'ok'],
  ];
  MOCK_DB.logs = logSeeds.map((s, i) => {
    const admin = MOCK_DB.admins[i % 3];
    return {
      id: 501 + i, adminId: admin.id, adminName: admin.name, roleKey: admin.roleKey,
      action: s[0], actionLabel: ACTION_LABEL[s[0]] || s[0], targetType: s[1], targetId: String(100 + i),
      summary: s[2], result: s[3],
      ip: '203.0.113.' + (20 + i), createdAt: now - i * 4200 - Math.floor(rnd() * 900),
      detail: s[3] === 'fail'
        ? { before: null, after: null, note: s[2], error: '目标状态冲突' }
        : { before: { status: 'pending' }, after: { status: s[0].indexOf('delete') >= 0 ? 'deleted' : 'published' }, note: s[2] },
    };
  });
  MOCK_DB.logs.forEach((l, i) => { l.createdAt = now - i * 2400 - (i % 5) * 613; });

  MOCK_DB.ready = true;
}

function maskEmail(v) {
  const s = String(v || '');
  const at = s.indexOf('@');
  if (at < 0) return s;
  return s.slice(0, 2) + '***' + s.slice(at);
}

/* 演示图片：内联 SVG（不连外网，也不依赖仓库里的静态资源）。
   画面上故意留一个编号，方便截图核对是哪条帖子的图。 */
function mockImageData(seed) {
  const n = Number(seed) || 1;
  const hue = 196 + (n * 13) % 40;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="hsl(' + hue + ' 45% 24%)"/><stop offset="1" stop-color="hsl(' + (hue + 18) + ' 52% 40%)"/></linearGradient></defs>' +
    '<rect width="480" height="480" fill="url(#g)"/>' +
    '<g fill="none" stroke="rgba(225,244,255,.42)" stroke-width="2">' +
    '<path d="M0 300c60-46 110-46 170 0s110 46 170 0 110-46 170 0"/>' +
    '<path d="M0 350c60-46 110-46 170 0s110 46 170 0 110-46 170 0"/>' +
    '<path d="M0 250c60-46 110-46 170 0s110 46 170 0 110-46 170 0"/></g>' +
    '<circle cx="356" cy="116" r="46" fill="rgba(255,255,255,.16)"/>' +
    '<text x="32" y="448" fill="rgba(235,248,255,.75)" font-family="monospace" font-size="22">mock ' + n + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}



/* ───────────────────────── 演示模式的请求分发 ───────────────────────── */
/* 只覆盖 docs/admin-api.md 里列出的端点与字段；真实后端上线后这段不会被执行。
   写操作会改内存数据并追加一条日志，这样"操作完刷新还能看到"的链路是通的。 */

export const DEMO = { account: 'root', password: 'whale1234' };

const SESSION_KEY = 'whale-admin-mock-session';
const loginFails = new Map();

function sessionGet() {
  try { return Number(sessionStorage.getItem(SESSION_KEY) || 0) || 0; } catch (e) { return 0; }
}
function sessionSet(id) {
  try { if (id) sessionStorage.setItem(SESSION_KEY, String(id)); else sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function sessionClear() { sessionSet(0); }

function adminOf(id) {
  seedMock();
  return MOCK_DB.admins.find((a) => a.id === id) || null;
}
function roleOf(id) {
  return MOCK_DB.roles.find((r) => r.id === id) || null;
}
function permsOf(admin) {
  const r = roleOf(admin.roleId);
  return r ? r.permissions.slice() : [];
}
function sessionAdmin() {
  const a = adminOf(sessionGet());
  if (!a || a.status !== 'active') return null;
  const r = roleOf(a.roleId);
  return {
    id: a.id, account: a.account, name: a.name,
    roleId: a.roleId, roleKey: r ? r.key : 'staff', roleName: r ? r.name : '未分配',
    permissions: permsOf(a),
    lastLoginAt: a.lastLoginAt, createdAt: a.createdAt,
  };
}
function need(perm) {
  const me = sessionAdmin();
  if (!me) throw new ApiError('NOT_AUTHED', '登录状态已失效，请重新登录', 401);
  if (perm && me.permissions.indexOf(perm) < 0) {
    throw new ApiError('FORBIDDEN', '当前角色没有这个操作的权限', 403);
  }
  return me;
}
function pushLog(action, targetType, targetId, summary, result, detail) {
  const me = sessionAdmin();
  const now = Math.floor(Date.now() / 1000);
  const row = {
    id: ++MOCK_DB.seq, adminId: me ? me.id : 0, adminName: me ? me.name : '系统', roleKey: me ? me.roleKey : 'system',
    action, actionLabel: ACTION_LABEL[action] || action, targetType, targetId: String(targetId == null ? '' : targetId),
    summary, result: result || 'ok', ip: '203.0.113.24', createdAt: now,
    detail: detail || { before: null, after: null, note: summary },
  };
  MOCK_DB.logs.unshift(row);
  if (MOCK_DB.logs.length > 400) MOCK_DB.logs.length = 400;
  return row;
}

function num(v, d) { const n = Number(v); return isFinite(n) ? n : (d || 0); }
function contains(s, q) { return String(s == null ? '' : s).toLowerCase().indexOf(String(q).toLowerCase()) >= 0; }
function pageOf(list, q) {
  const page = Math.max(1, num(q.page, 1));
  const pageSize = Math.min(100, Math.max(1, num(q.pageSize, 20)));
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
}
function stamp(sec) {
  const d = new Date(sec * 1000);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(headers, rows) {
  return '\uFEFF' + [headers.map(csvCell).join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\r\n');
}

const ROLE_LABEL = { owner: '超级管理员', admin: '管理员', editor: '编辑', staff: '普通员工', system: '系统' };

function postFull(p) {
  const rnd = mulberry32(p.id * 977);
  const comments = Array.from({ length: 3 + Math.floor(rnd() * 5) }, (_, i) => {
    const u = MOCK_DB.users[(p.id + i * 3) % MOCK_DB.users.length];
    return {
      id: p.id * 100 + i, userId: u.id, name: u.name,
      text: ['同意这个思路。', '我这边也遇到过，重启一下就好了。', '补充一个数据：我们的首屏从 2.4s 降到 1.1s。', '这条是不是应该发到「站长问答」？', '写得很清楚，收藏了。', '图片好像挂了，能重传一下吗？'][i % 6],
      likes: Math.floor(rnd() * 12), createdAt: p.createdAt + 900 * (i + 1),
    };
  });
  return Object.assign({}, p, { comments });
}

function mockRequest(method, path, body, query) {
  seedMock();
  const q = query || {};
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const head = seg[0] || '';
  const id2 = seg[1] ? Number(seg[1]) : 0;
  const tail = seg[2] || '';

  /* ── 认证 ── */
  if (head === 'auth') {
    if (seg[1] === 'login' && method === 'POST') {
      const account = String((body && body.account) || '').trim();
      const password = String((body && body.password) || '');
      const failKey = account.toLowerCase();
      const rec = loginFails.get(failKey) || { n: 0, until: 0 };
      const now = Math.floor(Date.now() / 1000);
      if (rec.until > now) {
        throw new ApiError('LOCKED', '尝试次数过多，账号已临时锁定', 423, { retryAfter: rec.until - now }, { retryAfter: rec.until - now });
      }
      const a = MOCK_DB.admins.find((x) => x.account.toLowerCase() === failKey);
      if (!a || password !== MOCK_PASSWORD || a.status !== 'active') {
        rec.n += 1;
        if (rec.n >= 5) { rec.until = now + 900; rec.n = 0; }
        loginFails.set(failKey, rec);
        const left = 5 - rec.n;
        throw new ApiError('NOT_AUTHED', '账号或密码不对' + (left > 0 && left <= 2 ? '（再错 ' + left + ' 次将锁定 15 分钟）' : ''), 401);
      }
      loginFails.delete(failKey);
      a.lastLoginAt = now;
      sessionSet(a.id);
      pushLog('auth.login', 'admin', a.id, '登录后台', 'ok');
      return { admin: sessionAdmin(), expiresAt: now + 7 * 86400 };
    }
    if (seg[1] === 'me') {
      const me = sessionAdmin();
      if (!me) throw new ApiError('NOT_AUTHED', '尚未登录', 401);
      return { admin: me };
    }
    if (seg[1] === 'logout' && method === 'POST') {
      const me = sessionAdmin();
      if (me) pushLog('auth.logout', 'admin', me.id, '退出登录', 'ok');
      sessionClear();
      return {};
    }
    if (seg[1] === 'password' && method === 'POST') {
      const me = need();
      const oldPw = String((body && body.oldPassword) || '');
      const newPw = String((body && body.newPassword) || '');
      if (oldPw !== MOCK_PASSWORD) throw new ApiError('BAD_REQUEST', '原密码不正确', 400);
      if (newPw.length < 8) throw new ApiError('BAD_REQUEST', '新密码至少 8 位', 400);
      pushLog('auth.password', 'admin', me.id, '修改自己的登录密码', 'ok');
      return {};
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 权限目录 ── */
  if (head === 'permissions') {
    need();
    return { groups: PERM_CATALOG };
  }

  /* ── 统计 ── */
  if (head === 'stats' && seg[1] === 'overview') {
    need('dashboard.view');
    const days = [7, 14, 30].indexOf(num(q.days, 7)) >= 0 ? num(q.days, 7) : 7;
    const now = Math.floor(Date.now() / 1000);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today0 = Math.floor(dayStart.getTime() / 1000);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const from = today0 - i * 86400;
      const to = from + 86400;
      const j = (n) => Math.floor(mulberry32((today0 / 86400 + i) * 97 + n * 13)() * 4);
      series.push({
        date: stamp(from),
        posts: MOCK_DB.posts.filter((p) => p.createdAt >= from && p.createdAt < to).length + j(1),
        users: MOCK_DB.users.filter((u) => u.createdAt >= from && u.createdAt < to).length + j(2),
        rewards: MOCK_DB.rewards.filter((r) => r.grantedAt >= from && r.grantedAt < to).length + j(3),
      });
    }
    const actionMap = new Map();
    MOCK_DB.logs.forEach((l) => {
      const k = l.action;
      const cur = actionMap.get(k) || { action: k, label: l.actionLabel, count: 0 };
      cur.count += 1;
      actionMap.set(k, cur);
    });
    return {
      kpis: {
        posts: MOCK_DB.posts.length,
        postsToday: MOCK_DB.posts.filter((p) => p.createdAt >= today0).length,
        pending: MOCK_DB.posts.filter((p) => p.status === 'pending').length,
        users: MOCK_DB.users.length,
        usersToday: MOCK_DB.users.filter((u) => u.createdAt >= today0).length,
        rewardsToday: MOCK_DB.rewards.filter((r) => r.grantedAt >= today0 && r.status === 'active').length,
        pointsGranted: MOCK_DB.rewards.filter((r) => r.status === 'active' && r.type === 'points').reduce((a, r) => a + r.amount, 0),
        disabledUsers: MOCK_DB.users.filter((u) => u.status === 'disabled').length,
        admins: MOCK_DB.admins.length,
      },
      series,
      pendingPreview: MOCK_DB.posts.filter((p) => p.status === 'pending').slice(0, 6),
      recentLogs: MOCK_DB.logs.slice(0, 8),
      recentRewards: MOCK_DB.rewards.slice(0, 5),
      actionBars: Array.from(actionMap.values()).sort((a, b) => b.count - a.count).slice(0, 7),
    };
  }

  /* ── 帖子 ── */
  if (head === 'posts') {
    if (seg[1] === 'batch' && method === 'POST') {
      need((body && body.action === 'delete') ? 'post.delete' : 'post.review');
      const ids = ((body && body.ids) || []).map(Number).filter(Boolean);
      if (!ids.length) throw new ApiError('BAD_REQUEST', '请先选择帖子', 400);
      const action = body.action;
      let affected = 0;
      ids.forEach((id) => {
        const idx = MOCK_DB.posts.findIndex((p) => p.id === id);
        if (idx < 0) return;
        if (action === 'delete') { MOCK_DB.posts.splice(idx, 1); affected++; }
        else {
          const p = MOCK_DB.posts[idx];
          p.status = action === 'approve' ? 'published' : 'rejected';
          p.reviewNote = body.note || '';
          p.reviewedAt = Math.floor(Date.now() / 1000);
          p.reviewedBy = sessionGet();
          affected++;
        }
      });
      pushLog(action === 'delete' ? 'post.batch_delete' : 'post.batch_review', 'post', ids.join(','),
        (action === 'delete' ? '批量删除 ' : action === 'approve' ? '批量通过 ' : '批量驳回 ') + affected + ' 条帖子', 'ok');
      return { affected };
    }
    if (!seg[1]) {
      need('post.view');
      let list = MOCK_DB.posts.slice();
      if (q.q) list = list.filter((p) => contains(p.text, q.q) || contains(p.author.name, q.q) || String(p.id) === String(q.q));
      if (q.authorId) list = list.filter((p) => p.userId === Number(q.authorId));
      if (q.from) list = list.filter((p) => p.createdAt >= Number(q.from));
      if (q.to) list = list.filter((p) => p.createdAt <= Number(q.to));
      const counts = { all: list.length, published: 0, pending: 0, rejected: 0, hidden: 0 };
      list.forEach((p) => { if (counts[p.status] != null) counts[p.status]++; });
      if (q.status && q.status !== 'all') list = list.filter((p) => p.status === q.status);
      const sort = q.sort || 'new';
      list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sort === 'old') return a.createdAt - b.createdAt;
        if (sort === 'hot') return (b.likes * 2 + b.comments * 3 + b.shares) - (a.likes * 2 + a.comments * 3 + a.shares);
        return b.createdAt - a.createdAt;
      });
      const page = pageOf(list, q);
      page.counts = counts;
      return page;
    }
    const id = id2;
    const idx = MOCK_DB.posts.findIndex((p) => p.id === id);
    if (idx < 0) throw new ApiError('NOT_FOUND', '帖子不存在或已删除', 404);
    if (tail === 'review' && method === 'POST') {
      need('post.review');
      const p = MOCK_DB.posts[idx];
      const decision = body && body.decision;
      if (['approve', 'reject', 'pending'].indexOf(decision) < 0) throw new ApiError('BAD_REQUEST', '审核决定不合法', 400);
      const before = p.status;
      p.status = decision === 'approve' ? 'published' : decision === 'reject' ? 'rejected' : 'pending';
      p.reviewNote = (body && body.note) || '';
      p.reviewedAt = Math.floor(Date.now() / 1000);
      p.reviewedBy = sessionGet();
      pushLog('post.review', 'post', id,
        (decision === 'approve' ? '通过' : decision === 'reject' ? '驳回' : '打回待审') + '帖子 #' + id + (p.reviewNote ? '：' + p.reviewNote : ''),
        'ok', { before: { status: before }, after: { status: p.status }, note: p.reviewNote });
      return p;
    }
    if (tail === '') {
      if (method === 'GET') { need('post.view'); return postFull(MOCK_DB.posts[idx]); }
      if (method === 'PATCH') {
        need('post.edit');
        const p = MOCK_DB.posts[idx];
        const before = { text: p.text, pinned: p.pinned };
        if (body && body.text != null) {
          if (String(body.text).length > 5000) throw new ApiError('BAD_REQUEST', '正文不能超过 5000 字', 400);
          p.text = String(body.text);
        }
        if (body && body.pinned != null) p.pinned = !!body.pinned;
        pushLog('post.edit', 'post', id, '编辑帖子 #' + id + (body && body.pinned != null ? '（' + (p.pinned ? '置顶' : '取消置顶') + '）' : '：更新正文'), 'ok',
          { before, after: { text: p.text, pinned: p.pinned }, note: '' });
        return p;
      }
      if (method === 'DELETE') {
        need('post.delete');
        MOCK_DB.posts.splice(idx, 1);
        pushLog('post.delete', 'post', id, '删除帖子 #' + id, 'ok');
        return { deleted: true };
      }
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 用户 ── */
  if (head === 'users') {
    if (!seg[1]) {
      need('user.view');
      let list = MOCK_DB.users.slice();
      if (q.q) list = list.filter((u) => contains(u.name, q.q) || contains(u.email, q.q) || contains(u.phoneMasked, q.q) || String(u.id) === String(q.q));
      const counts = { all: list.length, active: 0, disabled: 0 };
      list.forEach((u) => { counts[u.status] = (counts[u.status] || 0) + 1; });
      if (q.status && q.status !== 'all') list = list.filter((u) => u.status === q.status);
      const sort = q.sort || 'new';
      list.sort((a, b) => sort === 'old' ? a.createdAt - b.createdAt
        : sort === 'level' ? b.level - a.level
        : sort === 'visits' ? b.visits - a.visits
        : b.createdAt - a.createdAt);
      const page = pageOf(list, q);
      page.counts = counts;
      page.items = page.items.map((u) => Object.assign({}, u, { email: maskEmail(u.email) }));
      return page;
    }
    const id = id2;
    const u = MOCK_DB.users.find((x) => x.id === id);
    if (!u) throw new ApiError('NOT_FOUND', '用户不存在', 404);
    if (tail === 'status' && method === 'POST') {
      need('user.status');
      const status = body && body.status;
      const reason = String((body && body.reason) || '').trim();
      if (status === 'disabled' && reason.length < 4) throw new ApiError('BAD_REQUEST', '禁用原因至少 4 个字', 400);
      u.status = status === 'disabled' ? 'disabled' : 'active';
      u.disabledReason = u.status === 'disabled' ? reason : '';
      u.disabledAt = u.status === 'disabled' ? Math.floor(Date.now() / 1000) : 0;
      pushLog(u.status === 'disabled' ? 'user.disable' : 'user.enable', 'user', id,
        (u.status === 'disabled' ? '禁用用户 #' + id + '（' + u.name + '）：' + reason : '启用用户 #' + id + '（' + u.name + '）'), 'ok');
      return { user: Object.assign({}, u, { email: maskEmail(u.email) }) };
    }
    if (tail === '') {
      if (method === 'GET') {
        need('user.view');
        const posts = MOCK_DB.posts.filter((p) => p.userId === id).slice(0, 10)
          .map((p) => ({ id: p.id, text: p.text, status: p.status, likes: p.likes, createdAt: p.createdAt }));
        const rewards = MOCK_DB.rewards.filter((r) => r.userId === id).slice(0, 10);
        return {
          user: Object.assign({}, u, { email: maskEmail(u.email) }),
          posts, rewards,
          stats: {
            posts: MOCK_DB.posts.filter((p) => p.userId === id).length,
            comments: Math.max(3, u.postCount * 4 + (u.id % 7)),
            likes: MOCK_DB.posts.filter((p) => p.userId === id).reduce((a, p) => a + p.likes, 0),
            rewards: MOCK_DB.rewards.filter((r) => r.userId === id).length,
            points: u.points,
          },
        };
      }
      if (method === 'PATCH') {
        need('user.edit');
        const before = { level: u.level, badge: u.badge };
        if (body && body.level != null) {
          const lv = Number(body.level);
          if (!(lv >= 1 && lv <= 99)) throw new ApiError('BAD_REQUEST', '等级范围是 1~99', 400);
          u.level = lv;
        }
        if (body && body.badge != null) {
          if (String(body.badge).length > 20) throw new ApiError('BAD_REQUEST', '徽章名不能超过 20 个字', 400);
          u.badge = String(body.badge);
        }
        pushLog('user.edit', 'user', id, '编辑用户 #' + id + '（等级 ' + before.level + ' → ' + u.level + '）', 'ok',
          { before, after: { level: u.level, badge: u.badge }, note: '' });
        return { user: Object.assign({}, u, { email: maskEmail(u.email) }) };
      }
      if (method === 'DELETE') {
        need('user.delete');
        const posts = MOCK_DB.posts.filter((p) => p.userId === id).length;
        MOCK_DB.posts = MOCK_DB.posts.filter((p) => p.userId !== id);
        MOCK_DB.rewards = MOCK_DB.rewards.filter((r) => r.userId !== id);
        MOCK_DB.users.splice(MOCK_DB.users.indexOf(u), 1);
        pushLog('user.delete', 'user', id, '删除用户 #' + id + '（' + u.name + '），级联 ' + posts + ' 条帖子', 'ok');
        return { deleted: { userId: id, posts, comments: Math.max(0, u.postCount * 4) } };
      }
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 奖励 ── */
  if (head === 'rewards') {
    /* 目录与发放对象面板：档位价目表 + 头像框目录 + 常用原因，带 userId 时补齐该用户现况 */
    if (seg[1] === 'options') {
      need('reward.view');
      const uid = Number(q.userId);
      const u = uid ? MOCK_DB.users.find((x) => x.id === uid) : null;
      return {
        tiers: MOCK_TIERS.map((t) => ({
          key: t.key, name: t.name, accent: t.accent, tagline: t.tagline, rank: t.rank,
          month: { priceCents: t.priceCents, listCents: t.priceCents, days: t.days, active: 1 },
          year: { priceCents: t.priceCents * 10, listCents: t.priceCents * 12, days: t.days * 12, active: 1 },
          defaultDays: t.days,
        })),
        frames: MOCK_FRAMES,
        presets: ['优质内容奖励', '活动奖励', '问题补偿', '内测致谢', '会员续期补偿'],
        limits: { pointsMin: 1, pointsMax: 1000000, daysMin: 1, daysMax: 3650 },
        user: u ? mockPanel(u) : null,
      };
    }
    if (seg[1] === 'export.csv') {
      need('reward.view');
      return { csv: true };
    }
    if (!seg[1]) {
      need('reward.view');
      let list = MOCK_DB.rewards.slice();
      if (q.q) list = list.filter((r) => contains(r.user.name, q.q) || contains(r.reason, q.q) || String(r.userId) === String(q.q));
      if (q.type && q.type !== 'all') list = list.filter((r) => r.type === q.type);
      if (q.from) list = list.filter((r) => r.grantedAt >= Number(q.from));
      if (q.to) list = list.filter((r) => r.grantedAt <= Number(q.to));
      if (q.adminId) list = list.filter((r) => r.grantedBy.id === Number(q.adminId));
      const summary = {
        granted: list.filter((r) => r.status === 'active').length,
        revoked: list.filter((r) => r.status === 'revoked').length,
        pointsTotal: list.filter((r) => r.status === 'active' && r.type === 'points').reduce((a, r) => a + r.amount, 0),
      };
      if (q.status && q.status !== 'all') list = list.filter((r) => r.status === q.status);
      list.sort((a, b) => b.grantedAt - a.grantedAt);
      const page = pageOf(list, q);
      page.summary = summary;
      return page;
    }
    if (method === 'POST' && tail === 'revoke') {
      need('reward.revoke');
      const id = id2;
      const r = MOCK_DB.rewards.find((x) => x.id === id);
      if (!r) throw new ApiError('NOT_FOUND', '奖励记录不存在', 404);
      if (r.status === 'revoked') throw new ApiError('CONFLICT', '这条奖励已经撤回过了', 409);
      const reason = String((body && body.reason) || '').trim();
      if (reason.length < 2) throw new ApiError('BAD_REQUEST', '撤回原因至少 2 个字', 400);
      r.status = 'revoked';
      r.revokedAt = Math.floor(Date.now() / 1000);
      r.revokedBy = { id: sessionGet(), name: (sessionAdmin() || {}).name || '' };
      r.revokedReason = reason;
      const u = MOCK_DB.users.find((x) => x.id === r.userId);
      if (u && r.type === 'points') u.points = Math.max(0, u.points - r.amount);
      if (u && r.type === 'days') {
        const cut = Math.max(0, Number(r.amount) || 0) * 86400;
        u.memberExpiresAt = Math.max(0, (Number(u.memberExpiresAt) || 0) - cut);
        if (u.memberExpiresAt <= Math.floor(Date.now() / 1000)) { u.memberTier = ''; u.memberExpiresAt = 0; }
      }
      if (u && r.type === 'frame') u.frame = r.prevFrame || 'auto';
      pushLog('reward.revoke', 'reward', id, '撤回奖励 #' + id + '：' + reason, 'ok');
      return { reward: r, user: mockPanel(u), member: u ? { tier: u.memberTier || 'free' } : null };
    }
    if (!seg[1] && method === 'POST') {
      need('reward.grant');
      const userId = Number(body && body.userId);
      const type = body && body.type;
      const amount = Number(body && body.amount);
      const reason = String((body && body.reason) || '').trim();
      const u = MOCK_DB.users.find((x) => x.id === userId);
      if (!u) throw new ApiError('BAD_REQUEST', '请选择要发放的用户', 400);
      const tier = String((body && body.tier) || '');
      const frame = String((body && body.frame) || '');
      if (['points', 'days', 'frame', 'custom'].indexOf(type) < 0) throw new ApiError('BAD_REQUEST', '奖励类型不合法', 400);
      if (reason.length < 4 || reason.length > 200) throw new ApiError('BAD_REQUEST', '原因需 4~200 个字', 400);
      if (type === 'custom' && amount !== 0) throw new ApiError('BAD_REQUEST', '自定义奖励的数量固定为 0', 400);
      if (type === 'days') {
        if (MOCK_TIERS.every((t) => t.key !== tier)) throw new ApiError('BAD_REQUEST', '会员档位不合法', 400);
        if (!(Number.isInteger(amount) && amount >= 1 && amount <= 3650)) throw new ApiError('BAD_REQUEST', '会员天数需在 1~3650 之间', 400);
      }
      if (type === 'frame') {
        if (MOCK_FRAMES.every((f) => f.key !== frame)) throw new ApiError('BAD_REQUEST', '头像框不合法', 400);
        if (amount !== 0) throw new ApiError('BAD_REQUEST', '头像框奖励的数量固定为 0', 400);
      }
      if (type === 'points' && !(Number.isInteger(amount) && amount >= 1 && amount <= 1000000)) {
        throw new ApiError('BAD_REQUEST', '积分数量需在 1~1000000 之间', 400);
      }
      const me = sessionAdmin();
      const prevFrame = u.frame || 'auto';
      const row = {
        id: ++MOCK_DB.seq, userId, user: { id: u.id, name: u.name, email: maskEmail(u.email), avatar: u.avatar },
        type, typeLabel: type === 'points' ? '积分' : type === 'days' ? '会员天数' : type === 'frame' ? '头像框' : '自定义',
        tier, tierLabel: tier ? MOCK_TIER_NAMES[tier] : '',
        frame: type === 'frame' ? frame : '', frameLabel: type === 'frame' ? mockFrameName(frame) : '',
        frameShort: type === 'frame' ? mockFrameName(frame, true) : '', prevFrame: type === 'frame' ? prevFrame : '',
        amount, reason, note: String((body && body.note) || ''), status: 'active',
        grantedBy: { id: me.id, name: me.name }, grantedAt: Math.floor(Date.now() / 1000),
        revokedAt: 0, revokedBy: null, revokedReason: '',
      };
      MOCK_DB.rewards.unshift(row);

      if (type === 'points') u.points += amount;
      if (type === 'days') {
        const base = Math.max(Number(u.memberExpiresAt) || 0, Math.floor(Date.now() / 1000));
        u.memberTier = tier;
        u.memberExpiresAt = base + amount * 86400;
      }
      if (type === 'frame') u.frame = frame;

      pushLog(type === 'frame' ? 'reward.frame' : 'reward.grant', 'reward', row.id,
        '向用户 #' + userId + ' 发放 ' +
          (type === 'custom' ? '自定义奖励'
            : type === 'points' ? amount + ' 积分'
              : type === 'frame' ? '头像框「' + mockFrameName(frame) + '」'
                : amount + ' 天「' + (MOCK_TIER_NAMES[tier] || tier) + '」会员') + '：' + reason, 'ok');
      return { reward: row, user: mockPanel(u), member: { tier: u.memberTier || 'free', expiresAt: u.memberExpiresAt || 0 } };
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 角色 ── */
  if (head === 'roles') {
    if (!seg[1]) {
      if (method === 'GET') { need('role.view'); return { items: MOCK_DB.roles.slice() }; }
      if (method === 'POST') {
        need('role.manage');
        const name = String((body && body.name) || '').trim();
        if (name.length < 2 || name.length > 20) throw new ApiError('BAD_REQUEST', '角色名需 2~20 个字', 400);
        if (MOCK_DB.roles.some((r) => r.name === name)) throw new ApiError('CONFLICT', '已有同名角色', 409);
        const id = ++MOCK_DB.seq;
        const row = {
          id, key: 'role_' + id, name, description: String((body && body.description) || ''),
          permissions: ((body && body.permissions) || []).filter((k) => ALL_PERMS.indexOf(k) >= 0),
          builtin: 0, memberCount: 0, createdAt: Math.floor(Date.now() / 1000),
        };
        MOCK_DB.roles.push(row);
        pushLog('role.create', 'role', id, '新建角色「' + name + '」，' + row.permissions.length + ' 项权限', 'ok');
        return row;
      }
    }
    const id = id2;
    const role = MOCK_DB.roles.find((r) => r.id === id);
    if (!role) throw new ApiError('NOT_FOUND', '角色不存在', 404);
    if (method === 'PUT') {
      need('role.manage');
      if (role.key === 'owner') throw new ApiError('CONFLICT', '超级管理员角色的权限不可修改', 409);
      const before = { name: role.name, permissions: role.permissions.slice() };
      if (body && body.name != null) {
        const name = String(body.name).trim();
        if (name.length < 2 || name.length > 20) throw new ApiError('BAD_REQUEST', '角色名需 2~20 个字', 400);
        role.name = name;
      }
      if (body && body.description != null) role.description = String(body.description);
      if (body && body.permissions) role.permissions = body.permissions.filter((k) => ALL_PERMS.indexOf(k) >= 0);
      pushLog('role.update', 'role', id, '修改角色「' + role.name + '」权限：' + role.permissions.length + ' 项', 'ok',
        { before, after: { name: role.name, permissions: role.permissions }, note: '' });
      return role;
    }
    if (method === 'DELETE') {
      need('role.manage');
      if (role.builtin) throw new ApiError('CONFLICT', '内置角色不可删除', 409);
      if (role.memberCount > 0) throw new ApiError('CONFLICT', '还有 ' + role.memberCount + ' 个管理员使用该角色，请先调整他们的角色', 409);
      MOCK_DB.roles.splice(MOCK_DB.roles.indexOf(role), 1);
      pushLog('role.delete', 'role', id, '删除角色「' + role.name + '」', 'ok');
      return { deleted: true };
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 管理员 ── */
  if (head === 'admins') {
    if (!seg[1]) {
      if (method === 'GET') {
        need('admin.view');
        let list = MOCK_DB.admins.slice();
        if (q.q) list = list.filter((a) => contains(a.account, q.q) || contains(a.name, q.q));
        if (q.roleId) list = list.filter((a) => a.roleId === Number(q.roleId));
        if (q.status && q.status !== 'all') list = list.filter((a) => a.status === q.status);
        list.sort((a, b) => a.id - b.id);
        const page = pageOf(list, q);
        page.items = page.items.map((a) => {
          const r = roleOf(a.roleId);
          return Object.assign({}, a, { roleKey: r ? r.key : '', roleName: r ? r.name : '未分配' });
        });
        return page;
      }
      if (method === 'POST') {
        need('admin.manage');
        const account = String((body && body.account) || '').trim();
        const name = String((body && body.name) || '').trim();
        const password = String((body && body.password) || '');
        const roleId = Number(body && body.roleId);
        if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(account)) throw new ApiError('BAD_REQUEST', '账号需 3~32 位，只能用字母、数字、下划线、点和连字符', 400);
        if (MOCK_DB.admins.some((a) => a.account.toLowerCase() === account.toLowerCase())) throw new ApiError('CONFLICT', '这个账号已存在', 409);
        if (name.length < 1) throw new ApiError('BAD_REQUEST', '请填写显示名称', 400);
        if (password.length < 8) throw new ApiError('BAD_REQUEST', '初始密码至少 8 位', 400);
        if (!roleOf(roleId)) throw new ApiError('BAD_REQUEST', '请选择角色', 400);
        const id = ++MOCK_DB.seq;
        const r = roleOf(roleId);
        const row = { id, account, name, roleId, roleKey: r.key, roleName: r.name, status: 'active', lastLoginAt: 0, lastLoginIp: '', createdAt: Math.floor(Date.now() / 1000) };
        MOCK_DB.admins.push(row);
        r.memberCount += 1;
        pushLog('admin.create', 'admin', id, '新建管理员 ' + account + '（' + r.name + '）', 'ok');
        return row;
      }
    }
    const id = id2;
    const admin = MOCK_DB.admins.find((a) => a.id === id);
    if (!admin) throw new ApiError('NOT_FOUND', '管理员不存在', 404);
    if (tail === 'reset-password' && method === 'POST') {
      need('admin.manage');
      const pw = String((body && body.newPassword) || '');
      if (pw.length < 8) throw new ApiError('BAD_REQUEST', '新密码至少 8 位', 400);
      pushLog('admin.reset_password', 'admin', id, '重置管理员 ' + admin.account + ' 的密码', 'ok');
      return {};
    }
    if (tail === '' && method === 'PATCH') {
      need('admin.manage');
      const me = sessionAdmin();
      const before = { name: admin.name, roleId: admin.roleId, status: admin.status };
      if (body && body.name != null) admin.name = String(body.name);
      if (body && body.roleId != null && Number(body.roleId) !== admin.roleId) {
        if (admin.id === me.id) throw new ApiError('CONFLICT', '不能修改自己的角色', 409);
        const r = roleOf(Number(body.roleId));
        if (!r) throw new ApiError('BAD_REQUEST', '角色不存在', 400);
        if (admin.roleKey === 'owner' && MOCK_DB.admins.filter((a) => a.roleKey === 'owner' && a.status === 'active').length <= 1) {
          throw new ApiError('CONFLICT', '至少要保留一个启用的超级管理员', 409);
        }
        const old = roleOf(admin.roleId);
        if (old) old.memberCount = Math.max(0, old.memberCount - 1);
        admin.roleId = r.id; admin.roleKey = r.key; admin.roleName = r.name;
        r.memberCount += 1;
      }
      if (body && body.status != null && body.status !== admin.status) {
        if (admin.id === me.id) throw new ApiError('CONFLICT', '不能停用自己的账号', 409);
        if (body.status === 'disabled' && admin.roleKey === 'owner' &&
            MOCK_DB.admins.filter((a) => a.roleKey === 'owner' && a.status === 'active').length <= 1) {
          throw new ApiError('CONFLICT', '至少要保留一个启用的超级管理员', 409);
        }
        admin.status = body.status === 'disabled' ? 'disabled' : 'active';
      }
      pushLog('admin.update', 'admin', id, '调整管理员 ' + admin.account + '：' +
        '调整管理员 ' + admin.account + '：' + (before.roleId !== admin.roleId ? '角色变更 ' : '') + (before.status !== admin.status ? (admin.status === 'disabled' ? '停用' : '启用') : '更新资料'), 'ok',
        { before, after: { name: admin.name, roleId: admin.roleId, status: admin.status }, note: '' });
      return admin;
    }
    if (tail === '' && method === 'DELETE') {
      need('admin.manage');
      const me = sessionAdmin();
      if (admin.id === me.id) throw new ApiError('CONFLICT', '不能删除自己的账号', 409);
      if (admin.roleKey === 'owner' && MOCK_DB.admins.filter((a) => a.roleKey === 'owner' && a.status === 'active').length <= 1) {
        throw new ApiError('CONFLICT', '至少要保留一个启用的超级管理员', 409);
      }
      const r = roleOf(admin.roleId);
      if (r) r.memberCount = Math.max(0, r.memberCount - 1);
      MOCK_DB.admins.splice(MOCK_DB.admins.indexOf(admin), 1);
      pushLog('admin.delete', 'admin', id, '删除管理员 ' + admin.account, 'ok');
      return { deleted: true };
    }
    throw new ApiError('NOT_FOUND', '接口不存在', 404);
  }

  /* ── 日志 ── */
  if (head === 'logs') {
    if (seg[1] === 'export.csv') {
      need('log.viewAll');
      return { csv: true };
    }
    if (!seg[1] && method === 'GET') {
      const me = need('dashboard.view');
      const all = canLocal('log.viewAll');
      let list = MOCK_DB.logs.filter((l) => all || l.adminId === me.id);
      const scope = all ? 'all' : 'self';
      if (q.q) list = list.filter((l) => contains(l.summary, q.q) || contains(l.adminName, q.q) || contains(l.targetId, q.q));
      if (q.action) list = list.filter((l) => l.action === q.action);
      if (q.targetType) list = list.filter((l) => l.targetType === q.targetType);
      if (q.adminId) list = list.filter((l) => l.adminId === Number(q.adminId));
      if (q.result && q.result !== 'all') list = list.filter((l) => l.result === q.result);
      if (q.from) list = list.filter((l) => l.createdAt >= Number(q.from));
      if (q.to) list = list.filter((l) => l.createdAt <= Number(q.to));
      const map = new Map();
      list.forEach((l) => { map.set(l.action, (map.get(l.action) || 0) + 1); });
      const actions = Array.from(map.entries()).map((kv) => ({ action: kv[0], label: ACTION_LABEL[kv[0]] || kv[0], count: kv[1] }))
        .sort((a, b) => b.count - a.count);
      const page = pageOf(list, q);
      page.scope = scope;
      page.actions = actions;
      return page;
    }
    const one = MOCK_DB.logs.find((l) => l.id === id2);
    if (!one) throw new ApiError('NOT_FOUND', '日志不存在', 404);
    need('dashboard.view');
    return one;
  }

  throw new ApiError('NOT_FOUND', '接口不存在', 404);
}

/* 演示模式里判断当前登录者的权限（用于 CSV 与日志范围，不经过 need 的副作用） */
function canLocal(perm) {
  const me = sessionAdmin();
  return !!me && me.permissions.indexOf(perm) >= 0;
}

function mockCsv(path, query) {
  seedMock();
  const q = query || {};
  if (path.indexOf('/rewards') === 0) {
    need('reward.view');
    let list = MOCK_DB.rewards.slice();
    if (q.q) list = list.filter((r) => contains(r.user.name, q.q) || contains(r.reason, q.q));
    if (q.type && q.type !== 'all') list = list.filter((r) => r.type === q.type);
    if (q.status && q.status !== 'all') list = list.filter((r) => r.status === q.status);
    if (q.from) list = list.filter((r) => r.grantedAt >= Number(q.from));
    if (q.to) list = list.filter((r) => r.grantedAt <= Number(q.to));
    const rows = list.map((r) => [
      r.id, r.userId, r.user.name, r.typeLabel, r.amount, r.reason, r.note,
      r.status === 'revoked' ? '已撤回' : '已发放', r.grantedBy.name, fmt.dateTime(r.grantedAt),
      r.revokedReason || '', r.revokedAt ? fmt.dateTime(r.revokedAt) : '',
    ]);
    return toCsv(['记录ID', '用户ID', '用户', '类型', '数量', '原因', '备注', '状态', '发放人', '发放时间', '撤回原因', '撤回时间'], rows);
  }
  if (path.indexOf('/logs') === 0) {
    const me = need('log.viewAll');
    let list = MOCK_DB.logs.slice();
    if (q.q) list = list.filter((l) => contains(l.summary, q.q) || contains(l.adminName, q.q));
    if (q.action) list = list.filter((l) => l.action === q.action);
    if (q.result && q.result !== 'all') list = list.filter((l) => l.result === q.result);
    if (q.from) list = list.filter((l) => l.createdAt >= Number(q.from));
    if (q.to) list = list.filter((l) => l.createdAt <= Number(q.to));
    if (me) list = list;
    const rows = list.map((l) => [
      l.id, fmt.dateTime(l.createdAt), l.adminName, ROLE_LABEL[l.roleKey] || l.roleKey,
      l.actionLabel, l.targetType, l.targetId, l.summary, l.result === 'ok' ? '成功' : '失败', l.ip,
    ]);
    return toCsv(['日志ID', '时间', '操作人', '角色', '动作', '目标类型', '目标ID', '摘要', '结果', 'IP'], rows);
  }
  return toCsv(['结果'], [['没有可导出的数据']]);
}

/* api() 需要在真实后端与演示数据之间切换：先探活，探不通才降级。
   显式的 ?mock=1 / ?live=1 与 localStorage 开关用于联调时强制指定。 */
export async function probeBackend() {
  const forceLive = /[?&]live=1/.test(location.search);
  let wantMock = /[?&]mock=1/.test(location.search);
  try { if (localStorage.getItem('whale-admin-mock') === '1') wantMock = true; } catch (e) {}
  if (wantMock) { store.mock = true; return 'mock'; }
  store.mock = false;
  try {
    await api('/auth/me');
    return 'live';
  } catch (e) {
    if (e && e.isAuth) return 'live';   /* 后端活着，只是这次没登录 */
    if (forceLive) throw e;
    if (e && (e.code === 'NOT_READY' || e.network || e.status === 0 || e.status === 404 || e.status === 405 || e.status === 501)) {
      store.mock = true;
      return 'mock';
    }
    throw e;
  }
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
  clearAdmin();
  sessionClear();
}

