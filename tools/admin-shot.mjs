#!/usr/bin/env node
/**
 * 后台管理系统截图（带管理员登录）
 *
 * 与 tools/shoot.mjs 的差别：后台用的是独立 cookie `whale_admin_token`，
 * 登录接口在 /api/admin/auth/login。这里不手工搬 cookie —— 在站点源里跑一次
 * fetch(credentials:'include')，浏览器自己把 HttpOnly cookie 存下来，再跳转即可。
 * 这样截图脚本永远不需要知道 cookie 名，后端改名字也不用同步改工具。
 *
 * 用法：
 *   node tools/admin-shot.mjs --path '#/dashboard' --out shots/admin-dashboard.png
 *     [--account root] [--password 'Admin@2026'] [--secret BASE32]
 *     [--base http://127.0.0.1:8777] [--w 1440] [--h 1000] [--full]
 *     [--wait 2600] [--theme night] [--click 'selector'] [--dump]
 *     [--port 9444] [--chrome <path>]
 * 两步验证：
 *   账号已绑定 TOTP 时，自动从 qa/.admin-2fa-secrets.json 里按
 *   "<base>|<account>"（找不到再退回同账号任意 base）取 secret，算当前/下一步码登录。
 *   首次绑定（mode=enroll）故意不自动完成：扫码是人的动作，工具只报错退出。
 * 说明：
 *   --path 直接给 hash 路由（#/posts），工具会拼成 <base>/admin/index.html<path>
 *   --dump 打印页面可见文本前 2500 字（排查白屏）
 *   退出码：0 成功；2 参数缺失；3 chrome 起不来；4 登录失败
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const totp = require('../server/src/totp.js');

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const BASE = String(arg('base', 'http://127.0.0.1:8777')).replace(/\/+$/, '');
/* Git Bash（MSYS）会把参数里的 /xxx 当成路径改写成 C:/...，
   --path '#/posts' 到这里就变成 '#C:/Users/.../posts'。两种写法都收：
   --page posts 最稳；--path 里如果已经出现盘符，就取最后一段还原成 hash。 */
const PAGE = arg('page', '');
let HASH = String(arg('path', '#/dashboard'));
if (PAGE) HASH = '#/' + String(PAGE).replace(/^#?\/?/, '');
else if (/^#[A-Za-z]:/.test(HASH)) { const seg = HASH.split('/').filter(Boolean).pop() || 'dashboard'; HASH = '#/' + seg; }
const OUT = arg('out');
const W = Number(arg('w', 1440)), H = Number(arg('h', 1000));
const FULL = !!arg('full', false);
const WAIT = Number(arg('wait', 2600));
const ACCOUNT = String(arg('account', 'root'));
const PASSWORD = String(arg('password', 'Admin@2026'));
const THEME = String(arg('theme', ''));
const CLICK = arg('click', '');
const ANON = !!arg('anon', false);
const SECRET = String(arg('secret', '') || '');
const ROW = !!arg('row', false);
const JS = arg('js', '');
const DUMP = !!arg('dump', false);
const PORT = Number(arg('port', 9444));
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const userDir = path.resolve('tmp/chrome-admin-' + PORT + '-' + Date.now());

if (!OUT) { console.error('need --out'); process.exit(2); }

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(url, opts) { const r = await fetch(url, opts); return r.json(); }

let ws, id = 0;
const pend = new Map();
const events = [];
function send(method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pend.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
}
function waitEvent(name, timeout) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + name)), timeout || 15000);
    const iv = setInterval(() => {
      const i = events.findIndex((e) => e.method === name);
      if (i >= 0) { const e = events.splice(i, 1)[0]; clearInterval(iv); clearTimeout(t); resolve(e.params); }
    }, 50);
  });
}

let ver;
for (let i = 0; i < 60; i++) {
  try { ver = await j('http://127.0.0.1:' + PORT + '/json/version'); break; } catch { await sleep(250); }
}
if (!ver) { try { chrome.kill(); } catch {} console.error('chrome not up'); process.exit(3); }

const tgt = await j('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' });
ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) {
    const p = pend.get(m.id); pend.delete(m.id);
    if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
  } else if (m.method) events.push(m);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "window.__errs=[];addEventListener('error',e=>window.__errs.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+String((e.reason&&e.reason.message)||e.reason)));"
});
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });

const entry = BASE + '/admin/index.html' + (HASH.startsWith('#') ? HASH : '');
const loginAt = BASE + '/admin/index.html';

/* 已绑定 TOTP 的账号：按 <base>|<account> 找 secret，找不到退回同账号任意条目。 */
function readTotpSecret() {
  if (SECRET) return SECRET;
  try {
    const all = JSON.parse(fs.readFileSync(path.resolve('qa/.admin-2fa-secrets.json'), 'utf8'));
    const exact = all[BASE + '|' + ACCOUNT];
    if (exact && exact.secret) return exact.secret;
    for (const k of Object.keys(all)) {
      if (k.endsWith('|' + ACCOUNT) && all[k] && all[k].secret) return all[k].secret;
    }
  } catch (e) { /* 没缓存就按未绑定处理，让登录接口自己报错 */ }
  return '';
}

/* 1) 先进站点源，跑一次登录 fetch：cookie 由浏览器保存（含 HttpOnly） */
await send('Page.navigate', { url: loginAt });
await waitEvent('Page.loadEventFired', 20000).catch(() => {});
await sleep(600);
const twofaSecret = ANON ? '' : readTotpSecret();
const now = Math.floor(Date.now() / 1000);
const codes = twofaSecret
  ? Array.from(new Set([totp.totp(twofaSecret, now), totp.totp(twofaSecret, now + totp.STEP_SECONDS)]))
  : [];
const login = ANON ? { result: { value: { status: 200, body: 'skipped (--anon)' } } } : await send('Runtime.evaluate', {
  expression: `(async()=>{
    const r=await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(` +
      JSON.stringify({ account: ACCOUNT, password: PASSWORD }) + `)});
    let j=null; try{ j=await r.json(); }catch(e){}
    if(r.status===200 && j && j.data && j.data.twoFactorRequired){
      const d=j.data;
      if(d.mode!=='verify') return {status:428,enroll:true,body:'该账号还没绑定两步验证，先在浏览器里扫码绑定（或换 --anon）'};
      let last={status:500,body:'no code'};
      for(const code of ${JSON.stringify(codes)}){
        const v=await fetch('/api/admin/auth/2fa/verify',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({challengeToken:d.challengeToken,code})});
        const vb=await v.json().catch(()=>null);
        if(v.status===200) return {status:200,twoFactor:true,body:'2fa ok'};
        last={status:v.status,body:JSON.stringify(vb).slice(0,300)};
      }
      return last;
    }
    return {status:r.status,body:JSON.stringify(j).slice(0,300)};
  })()`,
  awaitPromise: true, returnByValue: true
});
const lv = login.result && login.result.value;
console.log('login', JSON.stringify(lv).slice(0, 400));
if (!lv || lv.status !== 200) {
  try { ws.close(); } catch {} chrome.kill();
  if (lv && lv.status === 428 && lv.enroll) console.error('login failed: 账号需要先完成两步验证绑定');
  else console.error('login failed');
  process.exit(4);
}
console.log('mode: ' + (ANON ? 'anonymous (login page)' : 'admin ' + ACCOUNT) + (lv.twoFactor ? ' + 2fa' : ''));

/* 2) 主题：在导航前写入 localStorage，避免先画一帧白天 */
if (THEME === 'night' || THEME === 'day') {
  await send('Runtime.evaluate', { expression: "try{localStorage.setItem('whale-admin-theme'," + JSON.stringify(THEME) + ")}catch(e){}" });
}

/* 3) 打开目标页 */
await send('Page.navigate', { url: entry });
await waitEvent('Page.loadEventFired', 20000).catch(() => {});
await sleep(WAIT);

if (CLICK) {
  const c = await send('Runtime.evaluate', { expression: "var el=document.querySelector(" + JSON.stringify(String(CLICK)) + ");if(el){el.click();true}else false", returnByValue: true });
  console.log('click', JSON.stringify(c.result && c.result.value));
  await sleep(900);
}

/* 4) 诊断：控制台错误、路由、关键容器长度 */
const diag = await send('Runtime.evaluate', {
  expression: "JSON.stringify({hash:location.hash,errs:(window.__errs||[]).slice(0,8),app:(document.getElementById('app')||{innerHTML:''}).innerHTML.length,title:document.title,toast:(document.querySelector('.toast')||{}).textContent||''})",
  returnByValue: true
});
console.log('diag', diag.result && diag.result.value);

if (DUMP) {
  const dt = await send('Runtime.evaluate', { expression: "JSON.stringify((document.body.innerText||'').slice(0,2500))", returnByValue: true });
  console.log('DUMP', dt.result && dt.result.value);
}

/* --js：在页面里跑一段表达式并打印结果（JSON 化），用于核对权限态 DOM 这类看不见的事实。 */
if (JS) {
  const expr = "(function(){try{var v=(" + JS + ");return JSON.stringify(v===undefined?null:v);}catch(e){return 'ERR '+e.message;}})()";
  const js = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('JS', js.result && js.result.value);
}

/* --row：打印表格首行的 outerHTML 与高度。
   排查「行高异常 / 单元格被挤成竖排」这类问题时光看截图猜不出来，得看真实 DOM。 */
if (ROW) {
  const expr = "(function(){var tr=document.querySelector('[data-role=rows] tr');" +
    "if(!tr)return 'no row';var r=tr.getBoundingClientRect();" +
    "return JSON.stringify({h:Math.round(r.height),w:Math.round(r.width),html:tr.outerHTML.slice(0,1400)});})()";
  const rt = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('ROW', rt.result && rt.result.value);
}

/* 5) 截图 */
let clip;
if (FULL) {
  const m = await send('Page.getLayoutMetrics');
  const cs = m.cssContentSize || m.contentSize;
  clip = { x: 0, y: 0, width: W, height: Math.min(Math.ceil(cs.height), 6000), scale: 1 };
}
const shot = await send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip, captureBeyondViewport: true } : {}));
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(path.resolve(OUT), Buffer.from(shot.data, 'base64'));
console.log('saved', OUT, fs.statSync(path.resolve(OUT)).size + ' bytes');

try { ws.close(); } catch {}
chrome.kill();
await sleep(300);
process.exit(0);
