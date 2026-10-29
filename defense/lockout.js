
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
function req(path, { method = 'GET', body, xff } = {}) {
  return new Promise((res) => {
    const headers = { Host: 'seekbbs.cn', 'User-Agent': 'curl/8.22.0' };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    if (xff) headers['X-Forwarded-For'] = xff;
    const r = https.request({ host: '127.0.0.1', port: 443, servername: 'seekbbs.cn', rejectUnauthorized: false, agent, path, method, headers }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, ct: resp.headers['content-type'], body: d }));
    });
    r.on('error', e => res({ code: 0, err: e.code })); if (body) r.write(body); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MY = process.env.MY || 'demoqa.qf1kfw@jingyu.local';
(async () => {
  console.log('== enumeration oracle ==');
  let a = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'no-such.' + Date.now() + '@jingyu.local', password: 'wrongpass1' }) });
  console.log('  unknown email ->', a.code, a.body.slice(0, 130));
  await sleep(5200);
  let b = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: MY, password: 'wrongpass1' }) });
  console.log('  my email wrong ->', b.code, b.body.slice(0, 160));
  console.log('== lockout: keep failing my account ==');
  const seq = [['#2', 'wrongpass2'], ['#3', 'wrongpass3'], ['#4', 'wrongpass4'], ['#5', 'wrongpass5'], ['#6', 'wrongpass6'], ['#7', 'wrongpass7'], ['#8', 'wrongpass8']];
  for (const [tag, pw] of seq) {
    await sleep(5200);
    const w = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: MY, password: pw }) });
    console.log('  fail ' + tag.padEnd(3), w.code, w.body.slice(0, 170));
  }
  await sleep(5200);
  const c = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: MY, password: 'Probe1234!' }) });
  console.log('  correct pw while locked ->', c.code, c.body.slice(0, 200));
  agent.destroy();
})();
