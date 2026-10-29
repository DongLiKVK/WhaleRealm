
const { spawn } = require('child_process');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = 'C:/Windows/Temp/chr-probe2-' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEzLCJzaWQiOiI3YmRiOGQyNjRjY2NhMDI2NDkxOWQ2ODY2YjNjMjA5ZCIsImlhdCI6MTc5MzI3MDY0OSwiZXhwIjoxNzkzODc1NDQ5fQ.RXQSGwIHnsQtXXzTmeHqTrhi7iZkQnhPmTAhmmRqJH0";
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9223', '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let ver = null;
  for (let i = 0; i < 40; i++) { try { ver = await (await fetch('http://127.0.0.1:9223/json/version')).json(); break; } catch { await sleep(300); } }
  if (!ver) { console.log('no chrome'); ch.kill(); return; }
  const target = await (await fetch('http://127.0.0.1:9223/json/new?url=about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Log.entryAdded') logs.push(m.params.entry.text); };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  const sc = await send('Network.setCookie', { name: 'jingyu_token', value: TOKEN, domain: 'seekbbs.cn', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
  console.log('setCookie:', JSON.stringify(sc.result));
  await send('Page.navigate', { url: 'https://seekbbs.cn/#/space/13' });
  await sleep(5000);
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result); };
  console.log('whoami via api:', await ev("fetch('/api/auth/me').then(r=>r.json()).then(j=>JSON.stringify(j.data&&j.data.user))"));
  console.log('url:', await ev('location.href'));
  console.log('DOM check:', await ev(`JSON.stringify({
    svgOnload: document.querySelectorAll('svg[onload]').length,
    svgTotal: document.querySelectorAll('svg').length,
    payloadInHTML: document.body.innerHTML.indexOf('onload=alert') >= 0,
    payloadInText: document.body.innerText.indexOf('onload=alert') >= 0,
    navText: (document.querySelector('.rail, header, nav') || document.body).innerText.slice(0, 120).replace(/\\s+/g, ' ')
  })`));
  console.log('name rendered as text?', await ev("document.body.innerText.indexOf('<svg/onload=alert(1)>') >= 0"));
  console.log('csp violations in log:', logs.filter(t => t.includes('Content Security Policy')).length);
  const x = await ev("fetch('/api/users/13').then(r=>r.text()).then(t=>t.slice(0,220))");
  console.log('/api/users/13 ->', x);
  ws.close(); ch.kill(); await sleep(400);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
})();
