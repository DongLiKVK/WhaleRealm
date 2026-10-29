/* 从当前这台机器（大陆网络）实测到日本 / 韩国各家的 TCP 连通性与握手延迟。
   注意：结果只代表「你这根宽带 + 这个出口」，换运营商/换省份会不一样；
   而且「某个 IP 被墙」是逐 IP 的，这里测的是机房网段与线路可达性。 */
const net = require('net');
const dns = require('dns');

const TARGETS = [
  // --- 机房官方测速点 / 云厂商端点（最接近「你买了会拿到什么」）---
  ['Vultr 东京', 'hnd-jp-ping.vultr.com', 443],
  ['Vultr 首尔', 'sel-kor-ping.vultr.com', 443],
  ['Linode 东京', 'speedtest.tokyo2.linode.com', 443],
  ['Oracle 东京', 'objectstorage.ap-tokyo-1.oraclecloud.com', 443],
  ['Oracle 春川(韩)', 'objectstorage.ap-chuncheon-1.oraclecloud.com', 443],
  ['AWS 东京', 'dynamodb.ap-northeast-1.amazonaws.com', 443],
  ['AWS 首尔', 'dynamodb.ap-northeast-2.amazonaws.com', 443],
  ['Sakura 日本', 'www.sakura.ad.jp', 443],
  ['ConoHa 日本', 'www.conoha.jp', 443],
  ['Bandwagon 日本', 'jp.bwh88.net', 443],
  // --- 日韩本土站点（看普通民用线路通不通）---
  ['Naver 韩国', 'www.naver.com', 443],
  ['Kakao 韩国', 'www.kakao.com', 443],
  ['Yahoo 日本', 'www.yahoo.co.jp', 443],
  // --- 对照组 ---
  ['Cloudflare', 'www.cloudflare.com', 443],
  ['腾讯云广州(对照)', 'www.qq.com', 443]
];

function tcp(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok, note) => {
      if (done) return;
      done = true;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      try { sock.destroy(); } catch (_) {}
      resolve({ ok, ms: Math.round(ms), note });
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true, ''));
    sock.once('timeout', () => finish(false, 'TIMEOUT'));
    sock.once('error', (e) => finish(false, e.code || 'ERR'));
    sock.connect(port, host);
  });
}

function resolve(host) {
  return new Promise((r) => dns.lookup(host, { all: false }, (e, addr) => r(e ? null : addr)));
}

(async () => {
  const rows = [];
  for (const [label, host, port] of TARGETS) {
    const ip = await resolve(host);
    const t = await tcp(host, port);
    rows.push({ label, host, ip: ip || '-', ok: t.ok, ms: t.ok ? t.ms : '-', note: t.note });
  }
  const w = (s, n) => String(s).padEnd(n, ' ');
  console.log(w('目标', 20) + w('结果', 8) + w('ms', 7) + w('IP', 18) + '备注');
  console.log('-'.repeat(78));
  for (const r of rows) {
    console.log(
      w(r.label, 20) +
      w(r.ok ? '通' : '不通', 8) +
      w(r.ms, 7) +
      w(r.ip, 18) +
      (r.note || '')
    );
  }
  const ok = rows.filter((r) => r.ok);
  console.log('\n合计 ' + rows.length + ' 个目标，通 ' + ok.length + ' 个');
})();
