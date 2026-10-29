
const https = require('https');
const agent = new https.Agent({ keepAlive: true, maxSockets: 20 });
function req() {
  return new Promise((res) => {
    const r = https.request({ host: '127.0.0.1', port: 443, path: '/api/feed', method: 'GET', servername: 'seekbbs.cn', rejectUnauthorized: false, agent, headers: { Host: 'seekbbs.cn' } }, (resp) => { resp.resume(); resp.on('end', () => res(resp.statusCode)); });
    r.on('error', e => res(e.code)); r.end();
  });
}
(async () => {
  const codes = {}; const batch = [];
  for (let i = 0; i < 200; i++) { batch.push(req().then(c => codes[c] = (codes[c]||0)+1)); if (batch.length >= 20) await Promise.all(batch.splice(0,20)); }
  await Promise.all(batch);
  console.log('loopback saturation:', JSON.stringify(codes));
  agent.destroy();
})();
