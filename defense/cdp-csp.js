
const { spawn } = require('child_process');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = 'C:/Windows/Temp/chr-probe-' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(u, opts) { const r = await fetch(u, opts); return r.json(); }
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9222', '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--ignore-certificate-errors', 'about:blank'],
    { stdio: 'ignore', detached: false });
  let ver = null;
  for (let i = 0; i < 40; i++) { try { ver = await getJSON('http://127.0.0.1:9222/json/version'); break; } catch { await sleep(300); } }
  if (!ver) { console.log('chrome did not start'); ch.kill(); return; }
  console.log('chrome:', ver['Browser']);
  const target = await getJSON('http://127.0.0.1:9222/json/new?url=about:blank', { method: 'PUT' });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Page.navigate', { url: 'https://seekbbs.cn/#/space/13' });
  await sleep(4000);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : (r.result && r.result.exceptionDetails ? 'EXC:' + JSON.stringify(r.result.exceptionDetails.text) : r.result);
  };
  console.log('url:', await ev('location.href'));
  console.log('title:', await ev('document.title'));
  const dom = await ev(`(function(){
    const svg = document.querySelectorAll('svg[onload]').length;
    const imgx = document.querySelectorAll('img[src="x"]').length;
    const bodyTxt = document.body.innerText.slice(0,200).replace(/\\s+/g,' ');
    return JSON.stringify({ svgOnload: svg, imgX: imgx, hasPayloadText: document.body.innerHTML.indexOf('onload=alert') >= 0, text: bodyTxt });
  })()`);
  console.log('DOM:', dom);
  // CSP inline test
  const csp = await ev(`(function(){
    window.__viol = [];
    document.addEventListener('securitypolicyviolation', function(e){ window.__viol.push(e.violatedDirective + '|' + (e.blockedURI||'') + '|' + (e.sample||'')); });
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = 1;';
    document.head.appendChild(s);
    const img = document.createElement('img');
    img.src = 'x';
    img.setAttribute('onerror', 'window.__handlerRan = 1');
    document.body.appendChild(img);
    return new Promise(function(res){ setTimeout(function(){ res(JSON.stringify({ inlineRan: window.__inlineRan === 1, handlerRan: window.__handlerRan === 1, violations: window.__viol })); }, 1200); });
  })()`);
  console.log('CSP:', csp);
  const cons = events.filter(e => e.method === 'Log.entryAdded').map(e => e.params.entry.text).slice(0, 6);
  console.log('console-log entries:', JSON.stringify(cons));
  // also grab cookie flags via Network
  const ck = await ev('document.cookie');
  console.log('document.cookie (JS-visible):', JSON.stringify(ck));
  ws.close(); ch.kill();
  await sleep(500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
})();
