#!/usr/bin/env node
/**
 * 无依赖截图：chrome --headless=new + CDP（Node 24 自带 WebSocket）。
 * 用法：
 *   node tools/shoot.mjs --url "http://127.0.0.1:8777/#/vip" --out shots/vip-home-1440.png
 *     [--w 1440] [--h 1000] [--full] [--wait 2000]
 *     [--login demo3@jingyu.local:jingyu1234]
 *     [--token <jwt>]   直接塞 jingyu_token cookie（绕开 /api/auth/login 的 10 分钟 5 次限流）
 *     [--scroll "#vip-tiers"] [--scrollY 600] [--night]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const url = arg('url');
const out = arg('out');
if (!url || !out) { console.error('need --url and --out'); process.exit(2); }
const W = Number(arg('w', 1440)), H = Number(arg('h', 1000));
const FULL = !!arg('full', false);
const WAIT = Number(arg('wait', 2200));
const LOGIN = arg('login', '');
const TOKEN = arg('token', '');
const SCROLL = arg('scroll', '');
const SCROLLY = Number(arg('scrollY', 0));
const NIGHT = !!arg('night', false);
const REDUCE = !!arg('reduce', false);
const PORT = Number(arg('port', 9333));
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const userDir = path.resolve('tmp/chrome-' + PORT + '-' + Date.now());

const chromeArgs = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H, 'about:blank'
];
if (REDUCE) chromeArgs.push('--force-prefers-reduced-motion');
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(url, opts) { const r = await fetch(url, opts); return r.json(); }

let ws, id = 0, pend = new Map(), events = [];
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
      const i = events.findIndex(e => e.method === name);
      if (i >= 0) { const e = events.splice(i, 1)[0]; clearInterval(iv); clearTimeout(t); resolve(e.params); }
    }, 50);
  });
}

let ver;
for (let i = 0; i < 60; i++) {
  try { ver = await j('http://127.0.0.1:' + PORT + '/json/version'); break; } catch { await sleep(250); }
}
if (!ver) { chrome.kill(); console.error('chrome not up'); process.exit(3); }

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
await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});window.addEventListener('unhandledrejection',function(e){window.__errs.push('rejection: '+String((e.reason&&e.reason.message)||e.reason));});" });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });

if (NIGHT) {
  await send('Page.navigate', { url: new URL(url).origin + '/index.html' });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: "document.documentElement.setAttribute('data-theme','night');try{localStorage.setItem('dsh-forum-theme','night')}catch(e){}" });
}

/* 用现成 token 代替登录：登录接口有 10 分钟 5 次的限流，连续截图会被 TOO_MANY 挡住。
   注意 setCookie 需要 Network 域，且 domain 要显式给（默认只对当前 url 生效）。 */
if (TOKEN) {
  /* Network.setCookie 在 headless + http 站点上不稳（domain 匹配不到就静默丢弃），
     改用页面内 document.cookie：服务端只看请求里有没有这个键，httpOnly 与否不影响发送。 */
  const u0 = new URL(url);
  await send('Page.navigate', { url: u0.origin + '/index.html' });
  await sleep(1200);
  const setr = await send('Runtime.evaluate', {
    expression: "document.cookie='jingyu_token='+encodeURIComponent(" + JSON.stringify(String(TOKEN)) + ")+';path=/;SameSite=Lax';document.cookie.indexOf('jingyu_token')>=0",
    returnByValue: true
  });
  console.log('token: ' + JSON.stringify(setr.result && setr.result.value));
}

if (LOGIN) {
  const [email, pw] = String(LOGIN).split(':');
  await send('Page.navigate', { url: new URL(url).origin + '/index.html' });
  await sleep(1500);
  const r = await send('Runtime.evaluate', {
    expression: "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:" + JSON.stringify(email) + ",password:" + JSON.stringify(pw) + ",takeover:true})}).then(r=>r.json())",
    awaitPromise: true, returnByValue: true
  });
  console.log('login:', JSON.stringify(r.result && r.result.value).slice(0, 200));
}

await send('Page.navigate', { url });
await waitEvent('Page.loadEventFired', 20000).catch(() => {});
await sleep(WAIT);
const diag = await send('Runtime.evaluate', { expression: "JSON.stringify({errs:(window.__errs||[]).slice(0,6),rootLen:(document.getElementById('vip-root')||{innerHTML:''}).innerHTML.length,spaLen:(document.getElementById('spa-root')||{innerHTML:''}).innerHTML.length,route:location.hash})", returnByValue: true });
console.log('diag', diag.result && diag.result.value);
if (process.env.DUMP) {
  const dt = await send('Runtime.evaluate', { expression: "JSON.stringify({hash:location.hash,body:(document.body.innerText||'').slice(0," + (process.env.DUMP === '1' ? 3000 : 6000) + ")})", returnByValue: true });
  console.log('DUMP', dt.result && dt.result.value);
}

if (SCROLL) {
  await send('Runtime.evaluate', { expression: "var t=document.querySelector(" + JSON.stringify(SCROLL) + ");if(t)t.scrollIntoView({block:'start'});" });
  await sleep(500);
} else if (SCROLLY) {
  await send('Runtime.evaluate', { expression: "window.scrollTo(0," + SCROLLY + ")" });
  await sleep(400);
}

let clip;
if (FULL) {
  const m = await send('Page.getLayoutMetrics');
  const cs = m.cssContentSize || m.contentSize;
  clip = { x: 0, y: 0, width: W, height: Math.min(Math.ceil(cs.height), 6000), scale: 1 };
}
const shot = await send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip, captureBeyondViewport: true } : {}));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), Buffer.from(shot.data, 'base64'));
console.log('saved', out, fs.statSync(path.resolve(out)).size + ' bytes');

try { ws.close(); } catch {}
chrome.kill();
await sleep(300);
process.exit(0);
