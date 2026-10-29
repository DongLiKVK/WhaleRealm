
const https = require('https');
const agent = new https.Agent({ keepAlive: true });
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEzLCJzaWQiOiI3YmRiOGQyNjRjY2NhMDI2NDkxOWQ2ODY2YjNjMjA5ZCIsImlhdCI6MTc5MzI3MDY0OSwiZXhwIjoxNzkzODc1NDQ5fQ.RXQSGwIHnsQtXXzTmeHqTrhi7iZkQnhPmTAhmmRqJH0";
function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((res) => {
    const h = { Host: 'seekbbs.cn', 'User-Agent': 'curl/8.22.0', ...headers };
    if (body) h['Content-Length'] = body.length;
    const r = https.request({ host: '127.0.0.1', port: 443, servername: 'seekbbs.cn', rejectUnauthorized: false, agent, path, method, headers: h }, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, h: resp.headers, body: d }));
    });
    r.on('error', e => res({ code: 0, err: e.code })); if (body) r.write(body); r.end();
  });
}
(async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const q = await req('/api/upload/local?key=u/13/2026/10/88b38764c9d19379cd23fc16.png', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png', Cookie: 'jingyu_token=' + TOKEN } });
  console.log('POST /api/upload/local ->', q.code, (q.body || '').slice(0, 140));
  const g = await req('/uploads/u/13/2026/10/88b38764c9d19379cd23fc16.png');
  console.log('GET /uploads/...png ->', g.code, 'CT=' + (g.h['content-type'] || ''), 'XCTO=' + (g.h['x-content-type-options'] || ''), 'len=' + (g.h['content-length'] || 0));
  agent.destroy();
})();
