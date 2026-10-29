
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 20 });
function req(path, headers = {}) {
  return new Promise((res) => {
    const t0 = Date.now();
    const r = https.request({ host: '127.0.0.1', port: 443, path, method: 'GET',
      servername: 'seekbbs.cn', rejectUnauthorized: false, agent,
      headers: { Host: 'seekbbs.cn', 'User-Agent': 'curl/8.22.0', ...headers } }, (resp) => {
      let n = 0;
      resp.on('data', (c) => n += c.length);
      resp.on('end', () => res({ code: resp.statusCode, len: n, ra: resp.headers['retry-after'], ms: Date.now() - t0 }));
    });
    r.on('error', (e) => res({ code: 0, err: e.code, ms: Date.now() - t0 }));
    r.end();
  });
}
async function phase(label, rps, secs) {
  const total = Math.round(rps * secs);
  const gap = 1000 / rps;
  const codes = {};
  const t0 = Date.now();
  const tasks = [];
  for (let i = 0; i < total; i++) {
    const wait = i * gap - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    tasks.push(req('/api/feed').then(x => { codes[x.code] = (codes[x.code] || 0) + 1; if (x.ra) codes['RA:' + x.ra] = 1; }));
    if (tasks.length > 40) await tasks.shift();
  }
  await Promise.all(tasks);
  console.log(label.padEnd(28), 'reqs=' + total, 'elapsed=' + (Date.now() - t0) + 'ms', JSON.stringify(codes));
}
(async () => {
  console.log('--- rate ramp on /api/feed (loopback 127.0.0.1) ---');
  await phase('1 r/s x5s', 1, 5);
  await phase('5 r/s x4s', 5, 4);
  await phase('10 r/s x3s', 10, 3);
  await phase('20 r/s x3s', 20, 3);
  console.log('--- burst to prove limiter (40 r/s x2s, <=20 concurrent) ---');
  const codes = {};
  const t0 = Date.now();
  const batch = [];
  for (let i = 0; i < 80; i++) {
    const wait = i * 25 - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    batch.push(req('/api/feed').then(x => { codes[x.code] = (codes[x.code] || 0) + 1; if (x.ra) codes['RA:' + x.ra] = (codes['RA:' + x.ra] || 0) + 1; }));
    if (batch.length >= 20) { await Promise.all(batch.splice(0, 20)); }
  }
  await Promise.all(batch);
  console.log('40r/s x2s'.padEnd(28), 'reqs=80', 'elapsed=' + (Date.now() - t0) + 'ms', JSON.stringify(codes));
  // XFF spoof while saturated
  const xff = {};
  const b2 = [];
  for (let i = 0; i < 20; i++) {
    b2.push(req('/api/feed', { 'X-Forwarded-For': '203.0.113.' + i, 'X-Real-IP': '198.51.100.' + i }).then(x => { xff[x.code] = (xff[x.code] || 0) + 1; }));
  }
  await Promise.all(b2);
  console.log('XFF rotate x20 (saturated)'.padEnd(28), JSON.stringify(xff));
  const after = await req('/api/feed');
  console.log('single after burst'.padEnd(28), JSON.stringify(after));
  agent.destroy();
})();
