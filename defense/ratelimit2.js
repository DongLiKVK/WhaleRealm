
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 30 });
function req(path, opts = {}) {
  const { method = 'GET', headers = {}, body } = opts;
  return new Promise((res) => {
    const t0 = Date.now();
    const r = https.request({ host: '127.0.0.1', port: 443, path, method,
      servername: 'seekbbs.cn', rejectUnauthorized: false, agent,
      headers: { Host: 'seekbbs.cn', 'User-Agent': 'curl/8.22.0', ...headers } }, (resp) => {
      let n = 0;
      resp.on('data', (c) => n += c.length);
      resp.on('end', () => res({ code: resp.statusCode, len: n, ra: resp.headers['retry-after'], cc: resp.headers['cache-control'], ct: resp.headers['content-type'], ms: Date.now() - t0 }));
    });
    r.on('error', (e) => res({ code: 0, err: e.code, ms: Date.now() - t0 }));
    if (body) r.write(body);
    r.end();
  });
}
async function burst(label, paths, concurrency, total) {
  const codes = {}; const sample = {}; const t0 = Date.now(); const inflight = new Set();
  for (let i = 0; i < total; i++) {
    const p = paths[i % paths.length];
    const pr = req(p).then(x => { codes[x.code] = (codes[x.code] || 0) + 1; if (x.code === 429 && !sample.ra) sample.ra = x.ra; });
    inflight.add(pr); pr.finally(() => inflight.delete(pr));
    if (inflight.size >= concurrency) await Promise.race(inflight);
  }
  await Promise.all(inflight);
  console.log(label.padEnd(34), 'n=' + total, 'c=' + concurrency, (Date.now() - t0) + 'ms', JSON.stringify(codes), 'Retry-After=' + (sample.ra || 'none'));
}
(async () => {
  console.log('--- /api/feed saturated burst (api_limit 30r/s burst=60) ---');
  await burst('/api/feed x200', ['/api/feed'], 20, 200);
  const s1 = await req('/api/feed');
  console.log('immediately after'.padEnd(34), JSON.stringify(s1));
  // recovery probing: 1 req/s x6
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const x = await req('/api/feed');
    console.log(('recover +' + (i + 1) + 's').padEnd(34), x.code, 'RA=' + (x.ra || '-'));
  }
  console.log('--- / html_limit 3r/s burst=40 ---');
  await burst('/ x60', ['/'], 10, 60);
  console.log('--- /api/auth/login wr_limit 12r/m burst=5 (POST JSON) ---');
  const lb = '{"email":"nobody@example.invalid","password":"x"}';
  await burst('POST /api/auth/login x12', ['/api/auth/login'], 1, 12); // sequential
  console.log('--- limit_conn conn_all 16 on /api/ : 30 parallel ---');
  await burst('/api/feed parallel30', ['/api/feed'], 30, 30);
  agent.destroy();
})();
