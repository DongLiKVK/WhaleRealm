/* 爱发电渠道端到端冒烟：临时库 + 独立端口，不碰正式数据。
   验五件事：
   1) overview.channels 里 afdian 的 live 跟随 AFDIAN_URL
   2) 下单 channel=afdian → pay.mode='afdian'、payUrl 正确、有效期 3 天
   3) GET /orders/:no 也回 pay（刷新收银台不丢跳转按钮）
   4) report-paid 能登记，且 note 落库
   5) 反例：channel=manual（没配收款码，live=false）被 400 拦掉
*/
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8811;
const BASE = 'http://127.0.0.1:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jy-afdian-'));
const DB = path.join(TMP, 'test.db');
const AF = 'https://ifdian.net/a/testcreator';

const env = Object.assign({}, process.env, {
  PORT: String(PORT),
  HOST: '127.0.0.1',
  DB_PATH: DB,
  JWT_SECRET: 'test-only',
  MEMBERSHIP_SANDBOX: '1',
  AFDIAN_URL: AF,
  LOG_LEVEL: 'warn'
});

const srv = spawn(process.execPath, [path.join(__dirname, 'src', 'index.js')], {
  env, cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
srv.stdout.on('data', (d) => { log += d; });
srv.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(p, opts) {
  const res = await fetch(BASE + p, Object.assign({ headers: {} }, opts || {}));
  const txt = await res.text();
  let j = null;
  try { j = JSON.parse(txt); } catch (_) { j = { raw: txt }; }
  return { status: res.status, body: j };
}

function ok(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

(async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/healthz'); if (r.ok) break; } catch (_) {}
    await sleep(200);
  }

  const name = 'af' + Date.now().toString(36).slice(-6);
  const reg = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: name + '@example.com', password: 'passw0rd!' })
  });
  const regBody = await reg.json().catch(() => ({}));
  const rawCookie = reg.headers.getSetCookie ? reg.headers.getSetCookie().join('; ') : (reg.headers.get('set-cookie') || '');
  const token = rawCookie.split(';')[0];
  ok('注册拿到会话 cookie', !!token && token.indexOf('=') > 0, 'status=' + reg.status + ' ' + JSON.stringify(regBody).slice(0, 140));
  const auth = { cookie: token };

  // 1) 频道列表
  const ov = await req('/api/membership/overview', { headers: auth });
  const chs = (ov.body.data && ov.body.data.channels) || [];
  const af = chs.find((c) => c.id === 'afdian');
  const wx = chs.find((c) => c.id === 'wechat');
  const mn = chs.find((c) => c.id === 'manual');
  ok('afdian.live=true', !!af && af.live === true);
  // 本用例 MEMBERSHIP_SANDBOX=1：在线支付两条走演示桩，live 随沙箱为 true
  ok('wechat.live=true（沙箱）', !!wx && wx.live === true);
  // 没配 PAY_MANUAL_QR，收款码那条必须还是关的
  ok('manual.live=false', !!mn && mn.live === false);

  const planList = (ov.body.data && ov.body.data.plans) || [];
  const plan = planList.find((p) => p.cycle === 'month') || planList[0];
  ok('拿到可售计划', !!plan, plan ? 'id=' + plan.id + ' ' + plan.tier + '/' + plan.cycle : 'plans=' + planList.length);

  // 2) 下单 afdian
  const mk = await req('/api/membership/orders', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, auth),
    body: JSON.stringify({ planId: plan && plan.id, channel: 'afdian' })
  });
  const order = mk.body && mk.body.data && mk.body.data.order;
  const pay = mk.body && mk.body.data && mk.body.data.pay;
  ok('订单创建', !!order, 'status=' + mk.status + ' ' + JSON.stringify(mk.body).slice(0, 160));
  ok('pay.mode=afdian', !!pay && pay.mode === 'afdian', pay && pay.mode);
  ok('pay.payUrl 正确', !!pay && pay.payUrl === AF, pay && pay.payUrl);
  const ttl = order ? order.expiresAt - order.createdAt : 0;
  ok('站外渠道有效期=3天', ttl === 259200, String(ttl));

  // 3) GET 回 pay
  const got = await req('/api/membership/orders/' + order.orderNo, { headers: auth });
  const gp = got.body && got.body.data && got.body.data.pay;
  ok('GET 订单也回 pay', !!gp && gp.payUrl === AF, gp && gp.payUrl);

  // 4) 登记付款
  const rep = await req('/api/membership/orders/' + order.orderNo + '/report-paid', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, auth),
    body: JSON.stringify({ payer: '爱发电昵称-测试' })
  });
  ok('report-paid 成功', rep.status === 200, 'status=' + rep.status + ' ' + JSON.stringify(rep.body).slice(0, 160));
  const note = rep.body && rep.body.data && rep.body.data.order && rep.body.data.order.note;
  ok('note 已落库', !!note && /爱发电昵称-测试/.test(String(note)), String(note));

  // 5) 反例：没配收款码时 manual 必须被白名单拦掉（用 wechat 会被沙箱放行，测不出东西）
  const bad = await req('/api/membership/orders', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, auth),
    body: JSON.stringify({ planId: plan && plan.id, channel: 'manual' })
  });
  ok('manual 下单被拦', bad.status === 400, 'status=' + bad.status + ' code=' + (bad.body && bad.body.error && bad.body.error.code));

  console.log('\n--- server log tail ---\n' + log.slice(-600));
  srv.kill();
  await sleep(200);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('ERR', e); try { srv.kill(); } catch (_) {} process.exit(1); });
