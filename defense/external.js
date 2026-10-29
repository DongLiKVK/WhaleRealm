
const https = require('https');
const tls = require('tls');
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEzLCJzaWQiOiI3YmRiOGQyNjRjY2NhMDI2NDkxOWQ2ODY2YjNjMjA5ZCIsImlhdCI6MTc5MzI3MDY0OSwiZXhwIjoxNzkzODc1NDQ5fQ.RXQSGwIHnsQtXXzTmeHqTrhi7iZkQnhPmTAhmmRqJH0";
function rq(opts) {
  return new Promise((res) => {
    const t0 = Date.now();
    const r = https.request({ host: 'seekbbs.cn', port: 443, agent, ...opts }, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => res({ code: resp.statusCode, h: resp.headers, body: d, ms: Date.now() - t0 }));
    });
    r.on('error', e => res({ code: 0, err: e.code, ms: Date.now() - t0 }));
    if (opts.body) r.write(opts.body);
    r.end();
  });
}
(async () => {
  console.log('== CORS (Origin: https://evil.com) ==');
  let x = await rq({ path: '/api/feed', method: 'GET', headers: { Origin: 'https://evil.com' } });
  console.log('  /api/feed code=' + x.code, 'ACAO=' + (x.h['access-control-allow-origin'] || 'none'), 'ACAC=' + (x.h['access-control-allow-credentials'] || 'none'));
  x = await rq({ path: '/api/auth/me', method: 'GET', headers: { Origin: 'https://evil.com', Cookie: 'jingyu_token=' + TOKEN } });
  console.log('  /api/auth/me code=' + x.code, 'ACAO=' + (x.h['access-control-allow-origin'] || 'none'));

  console.log('== Range request ==');
  x = await rq({ path: '/', method: 'GET', headers: { Range: 'bytes=0-99' } });
  console.log('  GET / Range bytes=0-99 ->', x.code, 'CL=' + x.h['content-length'], 'CR=' + (x.h['content-range'] || 'none'));

  console.log('== oversized body 9MB (client_max_body_size 8m) ==');
  const big = 'x'.repeat(9 * 1024 * 1024);
  const payload = JSON.stringify({ body: big });
  x = await rq({ path: '/api/posts', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, body: payload });
  console.log('  POST /api/posts 9MB ->', x.code, (x.body || x.err || '').toString().slice(0, 80).replace(/\s+/g, ' '));

  console.log('== long URL (~9000 bytes) / long header (16KB) ==');
  x = await rq({ path: '/api/feed?x=' + 'a'.repeat(9000), method: 'GET' });
  console.log('  long URI ->', x.code, (x.body || x.err || '').toString().slice(0, 50).replace(/\s+/g, ' '));
  x = await rq({ path: '/api/feed', method: 'GET', headers: { 'X-Pad': 'b'.repeat(16384) } });
  console.log('  long header ->', x.code, (x.body || x.err || '').toString().slice(0, 50).replace(/\s+/g, ' '));

  console.log('== WS /ws ==');
  const wsTest = (label, url) => new Promise((res) => {
    let done = false;
    const t0 = Date.now();
    let ws;
    try { ws = new WebSocket(url); } catch (e) { console.log('  ' + label + ' connect-err', e.message); return res(); }
    const fin = (o) => { if (done) return; done = true; console.log('  ' + label, JSON.stringify(o), (Date.now() - t0) + 'ms'); try { ws.close(); } catch {} res(); };
    ws.onopen = () => { };
    ws.onmessage = (ev) => { let m = String(ev.data).slice(0, 90); fin({ opened: true, msg: m }); };
    ws.onclose = (ev) => fin({ opened: false, close: ev.code, reason: ev.reason });
    ws.onerror = () => { };
    setTimeout(() => fin({ timeout: true }), 6000);
  });
  await wsTest('no-token ', 'wss://seekbbs.cn/ws');
  await wsTest('bad-token', 'wss://seekbbs.cn/ws?token=garbage');
  await wsTest('good-token', 'wss://seekbbs.cn/ws?token=' + encodeURIComponent(TOKEN));

  console.log('== /api/upload/sign ==');
  const up = async (label, body) => {
    const p = JSON.stringify(body);
    const r = await rq({ path: '/api/upload/sign', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p), Cookie: 'jingyu_token=' + TOKEN }, body: p });
    let j = null; try { j = JSON.parse(r.body); } catch {}
    console.log('  ' + label.padEnd(34), r.code, (j && j.error ? j.error.code + '|' + j.error.message : r.body || '').toString().slice(0, 120));
    return j;
  };
  await up('filename=shell.php type=image/png', { filename: 'shell.php', contentType: 'image/png', size: 1024 });
  await up('filename=x.svg type=image/svg+xml', { filename: 'x.svg', contentType: 'image/svg+xml', size: 1024 });
  await up('type=image/png size=999999999', { filename: 'big.png', contentType: 'image/png', size: 999999999 });
  agent.destroy();
})();
