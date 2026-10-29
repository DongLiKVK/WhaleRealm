import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CAND = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const chrome = CAND.find(p => fs.existsSync(p));
const url = process.argv[2];
const login = process.argv[3];
const code = process.argv[4];
const port = 9413;
const W = Number(process.env.W || 1440), H = Number(process.env.H || 1000);
const proc = spawn(chrome, ['--headless=new','--remote-debugging-port='+port,'--disable-gpu','--hide-scrollbars','--no-first-run','--window-size='+W+','+H,'--user-data-dir='+process.env.TEMP+'/cdp-eval-'+Date.now(),'about:blank'], { stdio: 'ignore' });
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
/* 真机宽度：--window-size 在 headless 下有最小宽度（实测 500），移动端断点测不出来。
   用 Emulation 覆盖视口，EMU="390x1400" 时才有真正的 390px。 */
if (process.env.EMU) {
  const m = String(process.env.EMU).split('x');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(m[0]), height: Number(m[1] || 1000), deviceScaleFactor: 1, mobile: true
  });
}
if (login) {
  const parts = login.split(':');
  await send('Page.navigate', { url: new URL(url).origin + '/' });
  await sleep(1800);
  const body = JSON.stringify({ email: parts[0], password: parts[1], takeover: true });
  const expr = "fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:" + JSON.stringify(body) + "}).then(r=>r.status)";
  const lg = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log('login', lg.result && lg.result.result && lg.result.result.value);
}
// 带 hash 的 Page.navigate 只算同页跳转，SPA 不会重新加载；加时间戳参数强制整页刷新
const u = new URL(url);
await send('Page.navigate', { url: u.origin + u.pathname + '?r=' + Date.now() + u.hash });
await sleep(6500);
const r = await send('Runtime.evaluate', { expression: code, returnByValue: true });
console.log(JSON.stringify(r.result && r.result.result && r.result.result.value));
ws.close(); proc.kill(); process.exit(0);