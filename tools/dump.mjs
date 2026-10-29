import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CAND = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const chrome = CAND.find(p => fs.existsSync(p));
const url = process.argv[2];
const login = process.argv[3];
const port = 9412;
const proc = spawn(chrome, ['--headless=new','--remote-debugging-port='+port,'--disable-gpu','--no-first-run','--user-data-dir='+process.env.TEMP+'/cdp-dump-'+Date.now(),'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await r.json();
      const t = list.find(x => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) {
        ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
        return;
      }
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('no cdp');
}
function send(method, params) { const i = ++id; return new Promise(res => { pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }); }
await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});" });
if (login) {
  const parts = login.split(':');
  const origin = new URL(url).origin;
  await send('Page.navigate', { url: origin + '/' });
  await sleep(2000);
  const body = JSON.stringify({ email: parts[0], password: parts[1], takeover: true });
  const expr = "fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:" + JSON.stringify(body) + "}).then(function(r){return r.status})";
  const lg = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log('login', lg.result && lg.result.result && lg.result.result.value);
}
await send('Page.navigate', { url: url });
await sleep(5000);
const expr2 = "JSON.stringify({errs:(window.__errs||[]).slice(0,5),hash:location.hash,bodyLen:(document.body.innerText||'').length,body:(document.body.innerText||'').slice(0,2500)})";
const r = await send('Runtime.evaluate', { expression: expr2, returnByValue: true });
console.log(r.result && r.result.result && r.result.result.value);
ws.close(); proc.kill(); process.exit(0);