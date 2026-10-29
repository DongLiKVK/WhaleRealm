/* ═══════════════════════════════════════════════════════════════════════════
   鲸域 · 控制台 — 启动（boot.js）
   ---------------------------------------------------------------------------
   整个后台只有这一处决定"现在该看到什么"：
     1) 先探测后端（probeBackend），顺带用 /auth/me 恢复会话；
     2) 有管理员 → 直接进 #/dashboard / 当前深链；
     3) 没有 → 登录页；
     4) 会话中途过期（core 广播 auth:expired）→ 拆掉外壳回登录页。

   为什么不在 index.html 里判 Cookie：Cookie 是 HttpOnly，JS 读不到；
   唯一可信的登录态是后端 /auth/me 的响应。首屏宁可多等一个请求，
   也不要出现"以为登录了、进去全是 401"的闪烁。
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  api, store, setAdmin, clearAdmin, probeBackend,
  router, toast, on,
} from './core.js';
import { showLogin, showApp } from './shell.js';

const root = document.getElementById('app');

/* view 统一存成 { destroy }，登录页与外壳的清理方式不同但出口一致 */
let view = null;
let ready = false;   // 首轮会话判定完成前，忽略 401 广播，避免自己打断自己
let mode = 'boot';   // boot | login | app

function teardown() {
  if (view && typeof view.destroy === 'function') {
    try { view.destroy(); } catch (e) { /* 页面清理失败不该挡住切屏 */ }
  }
  view = null;
  router.stop();
}

function setHash(name) {
  const target = '#/' + name;
  if (location.hash === target) return;
  try {
    history.replaceState(null, '', location.pathname + location.search + target);
  } catch (e) {
    location.hash = target;
  }
}

/* ── 登录页 ── */
function mountLogin() {
  teardown();
  mode = 'login';
  root.setAttribute('aria-busy', 'false');
  const destroy = showLogin(root, {
    onSuccess() {
      /* showLogin 已经 setAdmin；这里只负责把外壳装起来 */
      enterApp();
    },
  });
  view = { destroy };
}

/* ── 应用外壳 ── */
function enterApp() {
  if (!store.admin) { mountLogin(); return; }
  teardown();
  mode = 'app';
  /* 地址栏里没有有效路由时，先落到工作台再启动路由：
     否则 router.parse() 会拿别人留下的 #/logs 之类直接开页。 */
  if (!/#\/[a-z]/.test(location.hash)) setHash('dashboard');
  const app = showApp(root, {
    onSignOut() {
      setHash('dashboard');
      mountLogin();
      toast('已退出登录', 'ok');
    },
  });
  view = app;
}

function bootFail(e) {
  /* 探测阶段挂掉（一般是强制 live 但服务没起）：仍然给登录页，
     让管理员能看到"网络不可用"的明确提示，而不是停在骨架屏上。 */
  mode = 'login';
  ready = true;
  root.setAttribute('aria-busy', 'false');
  mountLogin();
  const msg = e && e.message ? e.message : '后台接口暂时没有响应';
  toast('无法连接后台接口：' + msg, 'err');
}

async function main() {
  root.setAttribute('aria-busy', 'true');
  try {
    /* probeBackend 会读 ?mock=1 / ?live=1 与本地开关，再决定真实请求还是演示数据 */
    const probe = await probeBackend();
    if (probe === 'live') {
      try {
        const me = await api('/auth/me');
        if (me && me.admin) setAdmin(me.admin);
      } catch (e) {
        /* 401 是正常的"还没登录"，保留登录页；其它错误说明后端活着但异常，
           也先回登录页，登录动作会把真实错误带出来。 */
        if (!(e && (e.isAuth || e.code === 'NOT_AUTHED'))) {
          console.warn('[whale-admin] 会话恢复失败', e);
        }
        clearAdmin();
      }
    }
    ready = true;
    if (store.admin) enterApp();
    else mountLogin();
  } catch (e) {
    console.error('[whale-admin] 启动失败', e);
    bootFail(e);
  }
}

/* 登录页停留在前台时，如果另一个标签页刚完成登录，或外部工具把地址改成深链，
   后端其实已经有会话了。此时再问一次 /auth/me，比要求管理员手动刷新更自然；
   也覆盖"先请求登录接口、再改 hash 进入后台"的自动化截图流程。
   并发保护：hashchange 可能连续触发，避免重复请求。 */
let rechecking = false;
async function recheckSession() {
  if (!ready || mode !== 'login' || rechecking) return;
  rechecking = true;
  try {
    const me = await api('/auth/me');
    if (me && me.admin && mode === 'login') {
      setAdmin(me.admin);
      enterApp();
    }
  } catch (e) {
    /* 没有会话是登录页的正常状态，不打扰用户 */
  } finally {
    rechecking = false;
  }
}
window.addEventListener('hashchange', recheckSession);

/* 任何页面里的 401 都会走到这里：清身份、回登录页、保留一次性提示。
   只在应用外壳阶段响应，否则登录接口自己的错误也会触发一次重挂。 */
on('auth:expired', () => {
  if (!ready || mode !== 'app') return;
  clearAdmin();
  setHash('dashboard');
  mountLogin();
  toast('登录状态已失效，请重新登录', 'err');
});

main();
