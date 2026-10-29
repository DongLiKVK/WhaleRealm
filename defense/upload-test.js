
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((res) => {
    const h = { Host: 'seekbbs.cn', 'User-Agent': 'curl/8.22.0', ...headers };
    if (body) { h['Content-Length'] = Buffer.byteLength(body); }
    const r = https.request({ host: '127.0.0.1', port: 443, servername: 'seekbbs.cn', rejectUnauthorized: false, agent, path, method, headers: h }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, h: resp.headers, body: d }));
    });
    r.on('error', e => res({ code: 0, err: e.code })); if (body) r.write(body); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = process.env.TOKEN;
(async () => {
  await sleep(70000); // let nginx wr_limit 12r/m bucket drain
  console.log('== benign upload (1x1 png) through /api/upload/local ==');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const q = await req('/api/upload/local?key=u/13/2026/10/88b38764c9d19379cd23fc16.png', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png', Cookie: 'jingyu_token=' + TOKEN } });
  console.log('  POST /api/upload/local ->', q.code, (q.body || '').slice(0, 160));
  const g = await req('/uploads/u/13/2026/10/88b38764c9d19379cd23fc16.png');
  console.log('  GET /uploads/...png ->', g.code, 'CT=' + g.h['content-type'], 'XCTO=' + g.h['x-content-type-options'], 'disp=' + (g.h['content-disposition'] || 'none'), 'len=' + g.h['content-length']);
  console.log('== range on dynamic api ==');
  const rg = await req('/api/feed', { headers: { Range: 'bytes=0-10' } });
  console.log('  GET /api/feed Range ->', rg.code, 'CR=' + (rg.h['content-range'] || 'none'), 'len=' + rg.body.length);
  agent.destroy();
})();
