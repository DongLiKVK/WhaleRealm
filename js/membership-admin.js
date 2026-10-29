/* ═══════════════════════════════════════════════════════════════════════════
   鲸域 · 会员赞助后台（#/admin/sponsors）
   ---------------------------------------------------------------------------
   宿主（js/app.js）只做两件事：把 { S, esc } 递给 html() 画骨架，画完调 mount()。
   之后所有取数、重绘、交互都在本模块里，不再回宿主的状态机 —— 这一页有 8 个
   区块、四五张表单，走 app.js 的 data-act 分发会把一堆会员专用动作塞进那台
   大机器；在本文件里自己用 document 级委托，闭包干净、删掉整页也不留后遗症。

   接口与字段的唯一来源：docs/membership-contract.md 的 5.3 与第 6 节。
   金额一律「分」进出：输入框与展示处换算成元，换算一律 Math.round(x * 100)。
   不用 parseFloat 直通 —— 19.9 * 100 在 IEEE754 里是 1989.9999999999998，
   直接取整会少一分钱。

   不写内联 onclick（一律 data-spa-act 委托），不硬编码白/黑底色（只用
   css/app.css 的设计令牌），金额输入框统一 type=number step=0.01。
   ═══════════════════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';

  var doc = win.document;

  /* 与 js/api.js 同源推导：站点部署在子路径（window.DSH_API_BASE）时也跟着走 */
  var API_PREFIX = (win.DSH_API_BASE || '') + '/api';

  /* 一页多少单。和契约里的默认 limit=50 不同：后台要能一屏看完，50 行会滚很远 */
  var LIMIT = 20;

  /* 四个付费档的固定顺序 —— 与契约第 1 节一致，价格表与分布图都按这一份排 */
  var TIER_ORDER = ['diamond', 'master', 'grandmaster', 'hunt'];
  var TIER_NAME = { free: '旅人', diamond: '钻石', master: '大师', grandmaster: '宗师', hunt: '猎杀' };
  var CYCLE_NAME = { month: '月付', year: '年付' };
  var STATUS_NAME = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' };
  var CHANNEL_NAME = { afdian: '爱发电', wechat: '微信支付', alipay: '支付宝', manual: '扫码转账' };
  var CHANNEL_ORDER = ['afdian', 'wechat', 'alipay', 'manual'];
  var PART_LABEL = { overview: '概览', orders: '订单', plans: '价格', members: '会员查询' };

  /* 唯一的页面状态。S 是宿主的，这里不碰；apart 只活在模块里，
     换页再回来时筛选条件还在，比每次重置舒服。 */
  /* 上一次画进 #spa-root 的完整正文。app.js 的同页重绘会把整页 innerHTML 换掉，
     再按「地址没变」跳过 mount —— 没有这份快照，后台就会退回骨架屏。 */
  var LAST_BODY = '';

  var ST = {
    days: 30,
    gate: '',                 /* '' | 'login' | 'admin' —— 401 / 403 的门卡 */
    overview: null,
    orders: null,
    plans: null,
    members: null,
    memberQ: '',
    filter: { status: 'all', tier: '', channel: '', q: '', from: '', to: '' },
    offset: 0,
    errors: { overview: '', orders: '', plans: '', members: '' },
    loading: { overview: false, orders: false, plans: false, members: false },
    seq: { overview: 0, orders: 0, plans: 0, members: 0 },
    painted: false,
    mountAt: 0,
    toastTimer: 0,
    flashTimer: 0
  };

  var ESC = null;
  var bound = false;

  /* ───────────────────────── 格式化 ───────────────────────── */

  function localEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escOf(s) {
    var v = s == null ? '' : String(s);
    return ESC ? String(ESC(v)) : localEsc(v);
  }
  /* 属性值里一定会有引号，别指望宿主的 esc 都转义了 " —— 再兜一层 */
  function escAttr(s) {
    return escOf(s).replace(/"/g, '&quot;');
  }

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /* 分 → ¥xx.xx。整数部分加千分位，两位小数永远补齐 */
  function fmtMoney(cents) {
    var n = Number(cents);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    n = Math.abs(Math.round(n));
    var yuan = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var fen = n % 100;
    return (neg ? '-¥' : '¥') + yuan + '.' + (fen < 10 ? '0' + fen : String(fen));
  }
  function fmtInt(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  /* 续费率后端给的是小数（0.34）。万一哪天改回 34，也认 */
  function fmtRatio(v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) n = 0;
    if (n <= 1) n = n * 100;
    return Math.round(n) + '%';
  }
  /* goalPercent 后端已经是百分数（61），不再乘 */
  function fmtGoalPct(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  function fmtDateTime(sec) {
    var n = Number(sec) || 0;
    if (!n) return '—';
    var d = new Date(n * 1000);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtDateOnly(sec) {
    var n = Number(sec) || 0;
    if (!n) return '—';
    var d = new Date(n * 1000);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  /* 后台可见完整邮箱，但列表里统一打码：截图、投屏、共享屏幕时不该把用户邮箱摊开。
     后端若已经打过码（含 ***），原样返回，别二次打。 */
  function maskEmail(v) {
    var s = String(v == null ? '' : v);
    var at = s.indexOf('@');
    if (at < 1) return s || '—';
    var head = s.slice(0, at);
    if (head.indexOf('***') >= 0) return s;
    return head.slice(0, 1) + '***' + s.slice(at);
  }

  function tierName(t) { return TIER_NAME[t] || t || '—'; }
  function cycleName(c) { return CYCLE_NAME[c] || c || '—'; }
  function statusName(s) { return STATUS_NAME[s] || s || '—'; }
  function channelName(c) { return CHANNEL_NAME[c] || c || '—'; }
  function tierClass(t) { return TIER_ORDER.indexOf(t) >= 0 ? ' is-' + t : ''; }

  /* ───────────────────────── 请求 ───────────────────────── */

  function req(path, opts) {
    var o = { credentials: 'same-origin', headers: {} };
    if (opts) {
      for (var k in opts) {
        if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      }
    }
    if (o.body && typeof o.body !== 'string') {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    return win.fetch(API_PREFIX + path, o).then(function (res) {
      return res.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        if (!res.ok || !json || json.ok === false) {
          var err = new Error(
            (json && json.error && json.error.message) || ('请求失败（HTTP ' + res.status + '）')
          );
          err.code = (json && json.error && json.error.code) || ('HTTP_' + res.status);
          err.status = res.status;
          throw err;
        }
        return json.data;
      });
    }, function () {
      /* fetch 本身失败（后端没起、断网）：也得给一句人话，别让骨架一直转 */
      var err = new Error('连不上服务端，先确认后端在跑');
      err.code = 'NETWORK';
      err.status = 0;
      throw err;
    });
  }
  function apiGet(path) { return req(path); }
  function apiPost(path, body) { return req(path, { method: 'POST', body: body || {} }); }
  function apiPut(path, body) { return req(path, { method: 'PUT', body: body || {} }); }

  /* ───────────────────────── 提示 ───────────────────────── */

  function toast(msg, bad) {
    var el = doc.getElementById('spa-toast');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'spa-toast';
      el.className = 'spa-toast';
      el.setAttribute('role', 'status');
      if (doc.body && doc.body.appendChild) doc.body.appendChild(el);
    }
    el.textContent = String(msg == null ? '' : msg);
    el.className = 'spa-toast is-on' + (bad ? ' is-bad' : '');
    if (ST.toastTimer) win.clearTimeout(ST.toastTimer);
    ST.toastTimer = win.setTimeout(function () { el.className = 'spa-toast'; }, 2800);
  }

  /* 页面里的一条常驻提示（比 toast 久一点，失败原因要能读完） */
  function flash(msg, bad) {
    var el = doc.getElementById('spa-flash');
    if (!el) { toast(msg, bad); return; }
    el.textContent = String(msg == null ? '' : msg);
    el.className = 'spa-flash is-on' + (bad ? ' is-bad' : '');
    if (ST.flashTimer) win.clearTimeout(ST.flashTimer);
    ST.flashTimer = win.setTimeout(function () {
      el.className = 'spa-flash';
      el.textContent = '';
    }, 8000);
  }

  /* 按钮进「处理中」并返回解锁函数：失败分支一定会放回来，否则第二次点不动 */
  function lockBtn(btn) {
    if (!btn || !btn.disabled === undefined) return function () {};
    var old = btn.textContent;
    var oldDis = btn.disabled;
    btn.disabled = true;
    btn.textContent = '处理中…';
    return function () {
      btn.disabled = oldDis;
      btn.textContent = old;
    };
  }

  /* ───────────────────────── 公共小块 ───────────────────────── */

  function quiet(msg) {
    return '<p class="spa-quiet">' + escOf(msg) + '</p>';
  }
  function emptyBox(text, glyph) {
    return '<div class="spa-empty">' +
      '<span class="spa-empty-ic" aria-hidden="true">' + (glyph || '◷') + '</span>' +
      '<p>' + escOf(text) + '</p>' +
      '</div>';
  }
  function skeletonRows(n) {
    var out = '<div class="spa-skel" aria-hidden="true">';
    for (var i = 0; i < n; i++) {
      out += '<span class="spa-skel-row" style="width:' + (100 - i * 9) + '%"></span>';
    }
    return out + '</div>';
  }

  function chip(status, text) {
    return '<span class="spa-chip is-' + escAttr(status || 'unknown') + '">' +
      '<i class="spa-dot" aria-hidden="true"></i>' + escOf(text || statusName(status)) + '</span>';
  }
  function tierTag(tier) {
    return '<span class="spa-tc' + tierClass(tier) + '">' + escOf(tierName(tier)) + '</span>';
  }

  /* ───────────────────────── A. 页头 ───────────────────────── */

  function headInner() {
    var d = ST.days;
    var range = function (n, label) {
      var on = d === n;
      return '<button type="button" class="spa-seg-btn' + (on ? ' on' : '') + '"' +
        ' data-spa-act="range" data-days="' + n + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    };
    return '<div class="spa-head-tx">' +
        '<h1 class="spa-title">赞助后台</h1>' +
        '<p class="spa-lede">订单、价格、补单、会员查询集中在这一页。所有动作都会写一条记录，改完即时生效。</p>' +
      '</div>' +
      '<div class="spa-head-act">' +
        '<div class="spa-seg" role="group" aria-label="统计范围">' + range(30, '30 天') + range(90, '90 天') + '</div>' +
        '<button type="button" class="spa-btn" data-spa-act="csv">导出 CSV</button>' +
        '<button type="button" class="spa-btn is-primary" data-spa-act="refresh">刷新</button>' +
      '</div>';
  }
  function headHTML() {
    return '<div class="spa-head" id="spa-head">' + headInner() + '</div>';
  }

  /* ───────────────────────── 错误条 ───────────────────────── */

  function alertsHTML() {
    var out = '';
    ['overview', 'orders', 'plans', 'members'].forEach(function (part) {
      var msg = ST.errors[part];
      if (!msg) return;
      out += '<div class="spa-alert" role="alert">' +
        '<span class="spa-alert-ic" aria-hidden="true">!</span>' +
        '<span class="spa-alert-tx"><b>' + escOf(PART_LABEL[part]) + '</b> ' + escOf(msg) + '</span>' +
        '<button type="button" class="spa-btn sm" data-spa-act="retry" data-part="' + part + '">重试</button>' +
        '</div>';
    });
    return out;
  }

  /* ───────────────────────── B. KPI ───────────────────────── */

  function kpiCard(label, value, small, foot, extraCls) {
    return '<div class="spa-kpi-c' + (extraCls ? ' ' + extraCls : '') + '">' +
      '<span class="spa-kpi-l">' + escOf(label) + '</span>' +
      '<b class="spa-kpi-v">' + value + '</b>' +
      (foot || '') +
      '<span class="spa-kpi-s">' + small + '</span>' +
      '</div>';
  }

  function kpiHTML() {
    if (!ST.overview) {
      return ST.loading.overview ? skeletonRows(3) : quiet('概览数据还没到');
    }
    var k = ST.overview.kpi || {};
    var pct = fmtGoalPct(k.goalPercent);
    var goalBar = '<span class="spa-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"' +
      ' aria-valuenow="' + pct + '" aria-label="本月目标已完成 ' + pct + '%"><i style="width:' + pct + '%"></i></span>';

    return '<div class="spa-kpi">' +
      kpiCard('本月净收入', fmtMoney(k.monthNetCents), '目标 ' + fmtMoney(k.goalCents) + ' · 已到 ' + pct + '%', goalBar, 'is-goal') +
      kpiCard('区间 GMV', fmtMoney(k.gmvCents), fmtInt(k.orders) + ' 笔订单 · 退款 ' + fmtMoney(k.refundCents)) +
      kpiCard('净收入', fmtMoney(k.netCents), 'GMV 扣掉退款之后的到账额') +
      kpiCard('付费人数', fmtInt(k.payingUsers) + ' 人', '新增 ' + fmtInt(k.newMembers) + ' 人 · 客单 ' + fmtMoney(k.arppuCents)) +
      kpiCard('续费率', fmtRatio(k.renewRate), '同档续费占本期付费人次') +
      kpiCard('待处理订单', fmtInt(k.pending) + ' 笔', '待支付的单，超时会自己关闭') +
      '</div>';
  }

  /* ───────────────────────── C. 趋势 + 分布 ───────────────────────── */

  function r2(v) { return Math.round(v * 100) / 100; }

  function chartHTML(series) {
    var list = series || [];
    if (!list.length) return emptyBox('这段时间还没有成交记录。', '◷');

    var W = 680, H = 168, PADL = 4, PADR = 4, PADT = 12, PADB = 20;
    var iw = W - PADL - PADR;
    var ih = H - PADT - PADB;
    var n = list.length;
    var max = 0;
    list.forEach(function (p) {
      var v = Number(p.gmvCents) || 0;
      if (v > max) max = v;
    });

    var step = iw / n;
    var bw = Math.max(1.6, Math.min(14, step - 1.4));
    var bars = '';
    list.forEach(function (p, i) {
      var v = Number(p.gmvCents) || 0;
      var h = max > 0 ? (v > 0 ? Math.max(1.5, (v / max) * ih) : 1) : 1;
      var x = PADL + i * step + (step - bw) / 2;
      var y = PADT + ih - h;
      bars += '<rect class="spa-bar" x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(bw) +
        '" height="' + r2(h) + '" rx="1.5">' +
        '<title>' + escOf(p.date || '') + ' · ' + fmtMoney(v) + ' · ' + (Number(p.orders) || 0) + ' 笔</title>' +
        '</rect>';
    });

    /* 日期刻度：只标 4 个点（首 / 1/3 / 2/3 / 末），28~90 天全标会糊成一团 */
    var ticks = [];
    if (n === 1) ticks = [0];
    else {
      var cand = [0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1];
      cand.forEach(function (i) { if (ticks.indexOf(i) < 0) ticks.push(i); });
    }
    var labels = ticks.map(function (i) {
      var x = PADL + i * step + step / 2;
      var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      var tx = i === 0 ? PADL : (i === n - 1 ? W - PADR : x);
      return '<text class="spa-axis" x="' + r2(tx) + '" y="' + (H - 5) + '" text-anchor="' + anchor + '">' +
        escOf(String(list[i].date || '').slice(5)) + '</text>';
    }).join('');

    /* 不写 preserveAspectRatio="none"：那会把 viewBox 非等比拉伸，
       刻度文字跟着变形；width:100% + height:auto 已经让它等比缩放了 */
    return '<svg class="spa-chart" viewBox="0 0 ' + W + ' ' + H + '"' +
      ' role="img" aria-label="每日成交额柱状图，共 ' + n + ' 天，峰值 ' + fmtMoney(max) + '">' +
      bars +
      '<line class="spa-base" x1="' + PADL + '" y1="' + (PADT + ih) + '" x2="' + (W - PADR) + '" y2="' + (PADT + ih) + '"/>' +
      labels +
      '</svg>';
  }

  function legendHTML(series) {
    var list = series || [];
    var peak = null, active = 0;
    list.forEach(function (p) {
      var v = Number(p.gmvCents) || 0;
      if (v > 0) active++;
      if (!peak || v > (Number(peak.gmvCents) || 0)) peak = p;
    });
    var peakTxt = peak && (Number(peak.gmvCents) || 0) > 0
      ? '峰值 ' + escOf(peak.date || '') + ' · ' + fmtMoney(peak.gmvCents)
      : '区间内没有成交';
    return '<div class="spa-legend">' +
      '<span class="spa-lg"><i class="spa-lg-bar" aria-hidden="true"></i>柱高 = 当日成交额</span>' +
      '<span class="spa-lg"><i class="spa-lg-peak" aria-hidden="true"></i>' + peakTxt + '</span>' +
      '<span class="spa-lg"><i class="spa-lg-dot" aria-hidden="true"></i>' + active + ' / ' + list.length + ' 天有成交</span>' +
      '</div>';
  }

  function distBlock(title, sub, rows) {
    return '<div class="spa-card spa-dist">' +
      '<div class="spa-dist-hd"><h3>' + escOf(title) + '</h3><span>' + escOf(sub) + '</span></div>' +
      (rows || emptyBox('这段时间还没有已支付订单。', '◷')) +
      '</div>';
  }

  function tierDistHTML() {
    var items = (ST.overview && ST.overview.tiers) || [];
    var total = 0;
    items.forEach(function (it) { total += Math.max(0, Number(it.netCents) || 0); });
    var rows = '';
    var seen = 0;
    TIER_ORDER.forEach(function (t) {
      var it = null;
      items.forEach(function (x) { if (x && x.tier === t) it = x; });
      var net = it ? Math.max(0, Number(it.netCents) || 0) : 0;
      var cnt = it ? Number(it.count) || 0 : 0;
      if (!it || (net === 0 && cnt === 0)) return;
      seen++;
      var w = total > 0 ? Math.max(2, Math.round((net / total) * 100)) : 2;
      rows += '<li class="spa-dist-row' + tierClass(t) + '">' +
        '<span class="spa-dist-name"><i class="spa-swatch' + tierClass(t) + '" aria-hidden="true"></i>' + escOf(tierName(t)) + '</span>' +
        '<span class="spa-dist-bar"><i style="width:' + w + '%"></i></span>' +
        '<b class="spa-dist-val">' + fmtMoney(net) + '</b>' +
        '<em class="spa-dist-n">' + fmtInt(cnt) + ' 笔</em>' +
        '</li>';
    });
    return distBlock('等级分布', '按净额占比', seen ? '<ul class="spa-dist-list">' + rows + '</ul>' : '');
  }

  function channelDistHTML() {
    var items = (ST.overview && ST.overview.channels) || [];
    var total = 0;
    items.forEach(function (it) { total += Math.max(0, Number(it.netCents) || 0); });
    var keys = CHANNEL_ORDER.slice();
    items.forEach(function (it) {
      if (it && it.channel && keys.indexOf(it.channel) < 0) keys.push(it.channel);
    });
    var rows = '';
    var seen = 0;
    keys.forEach(function (c) {
      var it = null;
      items.forEach(function (x) { if (x && x.channel === c) it = x; });
      if (!it) return;
      var net = Math.max(0, Number(it.netCents) || 0);
      var cnt = Number(it.count) || 0;
      if (net === 0 && cnt === 0) return;
      seen++;
      var w = total > 0 ? Math.max(2, Math.round((net / total) * 100)) : 2;
      rows += '<li class="spa-dist-row">' +
        '<span class="spa-dist-name">' + escOf(channelName(c)) + '</span>' +
        '<span class="spa-dist-bar"><i style="width:' + w + '%"></i></span>' +
        '<b class="spa-dist-val">' + fmtMoney(net) + '</b>' +
        '<em class="spa-dist-n">' + fmtInt(cnt) + ' 笔</em>' +
        '</li>';
    });
    return distBlock('渠道分布', '按净额占比', seen ? '<ul class="spa-dist-list">' + rows + '</ul>' : '');
  }

  function trendHTML() {
    if (!ST.overview) {
      return '<div class="spa-card spa-trend">' + (ST.loading.overview ? skeletonRows(3) : quiet('趋势数据还没到')) + '</div>';
    }
    var series = ST.overview.series || [];
    return '<div class="spa-sec-hd"><h2>成交趋势</h2>' +
        '<span class="spa-sec-sub">按天 · 最近 ' + ST.days + ' 天</span></div>' +
      '<div class="spa-trend-grid">' +
        '<div class="spa-card is-chart">' +
          chartHTML(series) +
          legendHTML(series) +
        '</div>' +
        tierDistHTML() +
        channelDistHTML() +
      '</div>';
  }

  /* ───────────────────────── D. 订单 ───────────────────────── */

  function option(value, label, selected) {
    return '<option value="' + escAttr(value) + '"' + (selected ? ' selected' : '') + '>' + escOf(label) + '</option>';
  }

  function filterHTML() {
    var f = ST.filter;
    var statusOpts = option('all', '全部状态', f.status === 'all') +
      ['pending', 'paid', 'closed', 'refunded'].map(function (s) {
        return option(s, statusName(s), f.status === s);
      }).join('');
    var tierOpts = option('', '全部等级', !f.tier) + TIER_ORDER.map(function (t) {
      return option(t, tierName(t), f.tier === t);
    }).join('');
    var chanOpts = option('', '全部渠道', !f.channel) + CHANNEL_ORDER.map(function (c) {
      return option(c, channelName(c), f.channel === c);
    }).join('');

    return '<form class="spa-filters" data-spa-form="filter" aria-label="订单筛选">' +
      '<label class="spa-field"><span>状态</span><select name="status">' + statusOpts + '</select></label>' +
      '<label class="spa-field"><span>等级</span><select name="tier">' + tierOpts + '</select></label>' +
      '<label class="spa-field"><span>渠道</span><select name="channel">' + chanOpts + '</select></label>' +
      '<label class="spa-field is-wide"><span>关键词</span>' +
        '<input name="q" type="search" value="' + escAttr(f.q) + '" placeholder="订单号 / 邮箱 / 昵称"></label>' +
      '<label class="spa-field"><span>从</span><input name="from" type="date" value="' + escAttr(f.from) + '"></label>' +
      '<label class="spa-field"><span>到</span><input name="to" type="date" value="' + escAttr(f.to) + '"></label>' +
      '<div class="spa-filter-act">' +
        '<button type="reset" class="spa-btn" data-spa-act="filter-reset">重置</button>' +
        '<button type="submit" class="spa-btn is-primary">查询</button>' +
      '</div>' +
      '</form>';
  }

  function orderActions(o) {
    var no = escAttr(o.orderNo || '');
    var st = o.status || '';
    var out = '';
    if (st === 'pending') {
      out += '<button type="button" class="spa-btn sm" data-spa-act="mark-paid" data-no="' + no + '">补单</button>';
      out += '<button type="button" class="spa-btn sm is-ghost" data-spa-act="close" data-no="' + no + '">关闭</button>';
    } else if (st === 'paid') {
      out += '<button type="button" class="spa-btn sm is-danger" data-spa-act="refund" data-no="' + no + '">退款</button>';
    } else {
      out += '<span class="spa-muted">—</span>';
    }
    return out;
  }

  function orderRow(o) {
    var u = o.user || {};
    var name = u.name || u.nick || '未知用户';
    return '<tr>' +
      '<td><b class="spa-no">' + escOf(o.orderNo || '—') + '</b>' +
        '<span class="spa-sub">' + escOf(fmtDateTime(o.createdAt)) + '</span></td>' +
      '<td><b class="spa-uname">' + escOf(name) + '</b>' +
        '<span class="spa-sub">' + escOf(maskEmail(u.email)) + '</span></td>' +
      '<td>' + tierTag(o.tier) + '</td>' +
      '<td>' + escOf(cycleName(o.cycle)) + '</td>' +
      '<td class="num"><b>' + fmtMoney(o.amountCents) + '</b></td>' +
      '<td>' + escOf(o.channelText || channelName(o.channel)) + '</td>' +
      '<td>' + chip(o.status, o.statusText) + '</td>' +
      '<td class="spa-acts">' + orderActions(o) + '</td>' +
      '</tr>';
  }

  function pagerHTML(d) {
    var total = Number(d.total) || 0;
    var list = d.items || [];
    var from = total === 0 ? 0 : ST.offset + 1;
    var to = ST.offset + list.length;
    var prevDis = ST.offset <= 0;
    var nextDis = to >= total;
    return '<div class="spa-pager">' +
      '<button type="button" class="spa-btn sm" data-spa-act="page" data-dir="-1"' + (prevDis ? ' disabled' : '') + '>上一页</button>' +
      '<span class="spa-page-tx">第 ' + from + '–' + to + ' 条 / 共 ' + fmtInt(total) + ' 条' +
        (d.sumCents != null ? ' · 合计 ' + fmtMoney(d.sumCents) : '') + '</span>' +
      '<button type="button" class="spa-btn sm" data-spa-act="page" data-dir="1"' + (nextDis ? ' disabled' : '') + '>下一页</button>' +
      '</div>';
  }

  function ordersHTML() {
    var head = '<div class="spa-sec-hd"><h2>订单</h2>' +
      '<span class="spa-sec-sub">超时未付会自动关闭；退款只支持全额</span></div>' +
      filterHTML();

    var d = ST.orders;
    if (!d) {
      return head + (ST.loading.orders ? skeletonRows(4) : quiet('订单数据还没到'));
    }
    var list = d.items || [];
    if (!list.length) {
      return head + emptyBox('这个筛选条件下没有订单。换个状态，或把关键词清空再查。', '⌕');
    }
    var rows = list.map(orderRow).join('');
    return head +
      '<div class="spa-tbl-wrap">' +
        '<table class="spa-tbl spa-tbl-orders">' +
          '<caption class="spa-sr">赞助订单列表，共 ' + fmtInt(d.total) + ' 条，当前显示第 ' + (ST.offset + 1) + ' 条起</caption>' +
          '<thead><tr>' +
            '<th scope="col">订单号 / 时间</th><th scope="col">用户</th><th scope="col">等级</th>' +
            '<th scope="col">周期</th><th scope="col" class="num">金额</th><th scope="col">渠道</th>' +
            '<th scope="col">状态</th><th scope="col">操作</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      pagerHTML(d);
  }

  /* ───────────────────────── E. 价格设置 ───────────────────────── */

  function planOrder(a, b) {
    var ta = TIER_ORDER.indexOf(a.tier), tb = TIER_ORDER.indexOf(b.tier);
    if (ta !== tb) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb);
    if (a.cycle === b.cycle) return (Number(a.sort) || 0) - (Number(b.sort) || 0);
    return a.cycle === 'month' ? -1 : 1;
  }

  function planRow(p) {
    var on = (p.active === 1 || p.active === true || p.active === '1');
    var price = (Number(p.priceCents) || 0) / 100;
    var list = (Number(p.listCents) || 0) / 100;
    return '<tr data-plan-id="' + escAttr(p.id) + '">' +
      '<td>' + tierTag(p.tier) + '</td>' +
      '<td>' + escOf(cycleName(p.cycle)) + '</td>' +
      '<td><input class="spa-num" type="number" step="0.01" min="0" data-spa-f="price" value="' + price.toFixed(2) + '" aria-label="' + escAttr(tierName(p.tier) + cycleName(p.cycle) + ' 价格（元）') + '"></td>' +
      '<td><input class="spa-num" type="number" step="0.01" min="0" data-spa-f="list" value="' + list.toFixed(2) + '" aria-label="原价（元）"></td>' +
      '<td><input class="spa-num" type="number" step="1" min="1" data-spa-f="days" value="' + (Number(p.durationDays) || 0) + '" aria-label="天数"></td>' +
      '<td><input class="spa-num" type="number" step="1" min="0" data-spa-f="seats" value="' + (Number(p.seats) || 0) + '" title="0 = 不限" aria-label="席位，0 表示不限"></td>' +
      '<td><label class="spa-switch"><input type="checkbox" data-spa-f="active"' + (on ? ' checked' : '') + ' aria-label="上架"><span>上架</span></label></td>' +
      '<td><input class="spa-num" type="number" step="1" data-spa-f="sort" value="' + (Number(p.sort) || 0) + '" aria-label="排序"></td>' +
      '<td class="spa-acts">' +
        '<button type="button" class="spa-btn sm is-primary" data-spa-act="plan-save">保存</button>' +
        '<span class="spa-row-msg" data-spa-msg role="status"></span>' +
      '</td>' +
      '</tr>';
  }

  function plansHTML() {
    var head = '<div class="spa-sec-hd"><h2>价格设置</h2>' +
      '<span class="spa-sec-sub">单位：元 · 席位填 0 表示不限</span></div>' +
      '<p class="spa-tip">改价只影响新订单，已支付订单金额不变。</p>';

    var src = (ST.plans && ST.plans.plans) || null;
    if (!src) {
      return head + (ST.loading.plans ? skeletonRows(3) : quiet('价格数据还没到'));
    }
    if (!src.length) {
      return head + emptyBox('还没有价格计划。等后端播种（seed）完再刷新这一页。', '◷');
    }
    var rows = src.slice().sort(planOrder).map(planRow).join('');
    return head +
      '<div class="spa-tbl-wrap">' +
        '<table class="spa-tbl spa-tbl-price">' +
          '<caption class="spa-sr">四档会员 × 两个周期的价格配置，可逐行修改并保存</caption>' +
          '<thead><tr>' +
            '<th scope="col">等级</th><th scope="col">周期</th><th scope="col" class="num">价格（元）</th>' +
            '<th scope="col" class="num">原价（元）</th><th scope="col" class="num">天数</th>' +
            '<th scope="col" class="num">席位</th><th scope="col">上架</th><th scope="col" class="num">排序</th>' +
            '<th scope="col">操作</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  /* ───────────────────────── F. 手动补单 ───────────────────────── */

  function grantOutHTML() {
    var g = ST.grant;
    if (!g || !g.order) return '';
    var o = g.order;
    var m = g.member || {};
    var tier = m.tier || o.tier;
    return '<div class="spa-res" role="status">' +
      '<span class="spa-res-ic" aria-hidden="true">✓</span>' +
      '<div class="spa-res-bd">' +
        '<b>补单已生效</b>' +
        '<dl class="spa-res-list">' +
          '<div><dt>订单号</dt><dd class="spa-mono">' + escOf(o.orderNo || '—') + '</dd></div>' +
          '<div><dt>等级</dt><dd>' + escOf(tierName(tier)) + '</dd></div>' +
          '<div><dt>到期</dt><dd>' + escOf(fmtDateOnly(m.expiresAt || 0)) + '</dd></div>' +
          '<div><dt>天数</dt><dd>' + (Number(m.daysLeft) > 0 ? fmtInt(m.daysLeft) + ' 天' : '—') + '</dd></div>' +
        '</dl>' +
        '<p class="spa-res-note">这条订单是 channel=manual、金额为 0 的补偿单，可在上面订单表里搜到。</p>' +
      '</div>' +
      '</div>';
  }

  function grantHTML() {
    var tierOpts = TIER_ORDER.map(function (t) {
      return option(t, tierName(t), false);
    }).join('');
    return '<div class="spa-sec-hd"><h2>手动补单</h2>' +
        '<span class="spa-sec-sub">给指定用户直接开会员，不走支付</span></div>' +
      '<form class="spa-grant" data-spa-form="grant" aria-label="手动补单">' +
        '<label class="spa-field is-wide"><span>邮箱</span>' +
          '<input name="email" type="email" placeholder="用户注册邮箱" autocomplete="off"></label>' +
        '<label class="spa-field"><span>或用户 ID</span>' +
          '<input name="userId" type="number" min="1" step="1" placeholder="数字 ID"></label>' +
        '<label class="spa-field"><span>等级</span><select name="tier">' + tierOpts + '</select></label>' +
        '<label class="spa-field"><span>天数</span>' +
          '<input name="days" type="number" min="1" step="1" value="30"></label>' +
        '<label class="spa-field is-wide"><span>备注</span>' +
          '<input name="note" type="text" maxlength="120" placeholder="为什么补这一单（会写进记录）"></label>' +
        '<div class="spa-grant-act"><button type="submit" class="spa-btn is-primary">创建补单</button></div>' +
      '</form>' +
      '<p class="spa-tip">邮箱与用户 ID 二选一。补单会直接置为已支付并顺延到期时间。</p>' +
      '<div id="spa-grant-out">' + grantOutHTML() + '</div>';
  }

  /* ───────────────────────── G. 会员查询 ───────────────────────── */

  function memberRow(m) {
    var pub = (m.showName === 1 || m.showName === true || m.showName === '1');
    var left = Number(m.daysLeft);
    return '<tr>' +
      '<td><b class="spa-uname">' + escOf(m.name || m.nick || '未知用户') + '</b>' +
        '<span class="spa-sub">' + escOf(maskEmail(m.email)) + '</span></td>' +
      '<td>' + tierTag(m.tier) + '</td>' +
      '<td>' + escOf(fmtDateOnly(m.expiresAt)) + '</td>' +
      '<td class="num">' + (isFinite(left) && left > 0 ? fmtInt(left) + ' 天' : '<span class="spa-muted">已过期</span>') + '</td>' +
      '<td class="spa-mono">' + escOf(m.orderNo || '—') + '</td>' +
      '<td>' + (pub ? '公开' : '<span class="spa-muted">匿名</span>') + '</td>' +
      '</tr>';
  }

  function membersHTML() {
    var head = '<div class="spa-sec-hd"><h2>会员查询</h2>' +
        '<span class="spa-sec-sub">最多 50 条</span></div>' +
      '<form class="spa-search" data-spa-form="members" aria-label="搜索会员">' +
        '<input name="q" type="search" value="' + escAttr(ST.memberQ) + '" placeholder="昵称 / 邮箱 / 用户 ID">' +
        '<button type="submit" class="spa-btn is-primary">搜索</button>' +
      '</form>';

    if (ST.errors.members && !ST.members) {
      return head + quiet('会员数据没到，看上面的红条');
    }
    if (!ST.members) {
      return head + (ST.loading.members ? skeletonRows(3) : quiet('输入关键词查一下'));
    }
    var list = ST.members.items || [];
    if (!list.length) {
      return head + emptyBox('没有匹配的会员。换个昵称片段或直接填邮箱试试。', '⌕');
    }
    return head +
      '<div class="spa-tbl-wrap">' +
        '<table class="spa-tbl spa-tbl-members">' +
          '<caption class="spa-sr">会员搜索结果，共 ' + fmtInt(list.length) + ' 条</caption>' +
          '<thead><tr>' +
            '<th scope="col">用户</th><th scope="col">等级</th><th scope="col">到期日</th>' +
            '<th scope="col" class="num">剩余</th><th scope="col">订单号</th><th scope="col">署名</th>' +
          '</tr></thead>' +
          '<tbody>' + list.map(memberRow).join('') + '</tbody>' +
        '</table>' +
      '</div>';
  }

  /* ───────────────────────── H. 到期提醒 ───────────────────────── */

  function expiringHTML() {
    if (!ST.overview) {
      return '<div class="spa-sec-hd"><h2>到期提醒</h2><span class="spa-sec-sub">7 天内</span></div>' +
        (ST.loading.overview ? skeletonRows(2) : quiet('提醒数据还没到'));
    }
    var list = (ST.overview.expiring || []).slice().filter(function (e) {
      var d = Number(e && e.daysLeft);
      return isFinite(d) ? d <= 7 : true;
    }).sort(function (a, b) {
      return (Number(a.daysLeft) || 0) - (Number(b.daysLeft) || 0);
    });

    var head = '<div class="spa-sec-hd"><h2>到期提醒</h2>' +
      '<span class="spa-sec-sub">7 天内 · ' + list.length + ' 人</span></div>';
    if (!list.length) {
      return head + emptyBox('7 天内没有要到期的会员，这一周不用管。', '◷');
    }
    return head +
      '<ul class="spa-exp">' + list.map(function (e) {
        var d = Number(e.daysLeft);
        var soon = isFinite(d) && d <= 2;
        return '<li class="spa-exp-row' + (soon ? ' is-soon' : '') + '">' +
          '<b class="spa-exp-name">' + escOf(e.name || ('用户 ' + (e.userId || ''))) + '</b>' +
          tierTag(e.tier) +
          '<span class="spa-exp-date">' + escOf(fmtDateOnly(e.expiresAt)) + ' 到期</span>' +
          '<em class="spa-exp-left">' + (isFinite(d) && d >= 0 ? '还剩 ' + fmtInt(d) + ' 天' : '已到期') + '</em>' +
          '</li>';
      }).join('') + '</ul>';
  }

  /* ───────────────────────── 门卡（401 / 403）───────────────────────── */

  function gateHTML(kind) {
    var isLogin = kind === 'login';
    return '<div class="spa-gate">' +
      '<span class="spa-gate-ic" aria-hidden="true">' + (isLogin ? '⏻' : '🔒') + '</span>' +
      '<h1>' + (isLogin ? '请先登录' : '这里只有管理员能进') + '</h1>' +
      '<p>' + (isLogin
        ? '后台要认人：登录之后才知道你是不是管理员。'
        : '当前账号不是管理员。要看订单和收入，得用管理员账号登录。') + '</p>' +
      '<div class="spa-gate-act">' +
        '<a class="spa-btn is-primary" href="#/login">' + (isLogin ? '去登录' : '换账号登录') + '</a>' +
        '<a class="spa-btn" href="#/feed">返回首页</a>' +
      '</div>' +
      '</div>';
  }

  /* ───────────────────────── 骨架 ───────────────────────── */

  function skeletonHTML() {
    return '<div class="spa-skel-wrap" aria-busy="true" aria-live="polite">' +
      '<p class="spa-skel-note">正在读取后台数据…</p>' +
      skeletonRows(4) +
      '</div>';
  }

  /* ───────────────────────── 重绘 ───────────────────────── */

  function rootEl() { return doc.getElementById('spa-root'); }

  function syncLast() {
    var el = rootEl();
    if (el) LAST_BODY = el.innerHTML;
  }

  function paint() {
    var root = rootEl();
    if (!root) return;
    ST.painted = true;
    if (ST.gate) {
      root.innerHTML = gateHTML(ST.gate);
      syncLast();
      return;
    }
    root.innerHTML = headHTML() +
      '<div class="spa-alerts" id="spa-alerts">' + alertsHTML() + '</div>' +
      '<p class="spa-flash" id="spa-flash" role="status"></p>' +
      '<section class="spa-sec" id="spa-kpi">' + kpiHTML() + '</section>' +
      '<section class="spa-sec" id="spa-trend">' + trendHTML() + '</section>' +
      '<section class="spa-sec" id="spa-orders">' + ordersHTML() + '</section>' +
      '<section class="spa-sec" id="spa-prices">' + plansHTML() + '</section>' +
      '<section class="spa-sec" id="spa-grant">' + grantHTML() + '</section>' +
      '<section class="spa-sec" id="spa-members">' + membersHTML() + '</section>' +
      '<section class="spa-sec" id="spa-expiring">' + expiringHTML() + '</section>';
    syncLast();
  }

  function paintInto(id, build) {
    if (ST.gate) return;
    var el = doc.getElementById(id);
    if (!el) return;
    el.innerHTML = build();
    syncLast();
  }

  function paintAlerts() {
    paintInto('spa-alerts', alertsHTML);
  }

  /* 首屏三个请求谁先回都行：第一个回复画整页，后面的只补自己的区块，
     这样用户不会盯着四行骨架等到最后一个接口。 */
  function afterPart() {
    if (!ST.painted) { paint(); return; }
    if (ST.gate) return;
    paintAlerts();
  }

  function afterOverview() {
    if (!ST.painted) { paint(); return; }
    if (ST.gate) return;
    paintInto('spa-kpi', kpiHTML);
    paintInto('spa-trend', trendHTML);
    paintInto('spa-expiring', expiringHTML);
    paintAlerts();
  }
  function afterOrders() {
    if (!ST.painted) { paint(); return; }
    if (ST.gate) return;
    paintInto('spa-orders', ordersHTML);
    paintAlerts();
  }
  function afterPlans() {
    if (!ST.painted) { paint(); return; }
    if (ST.gate) return;
    paintInto('spa-prices', plansHTML);
    paintAlerts();
  }
  function afterMembers() {
    if (!ST.painted) { paint(); return; }
    if (ST.gate) return;
    paintInto('spa-members', membersHTML);
    paintAlerts();
  }

  /* ───────────────────────── 取数 ───────────────────────── */

  function isAuthFail(err) {
    if (!err) return false;
    if (err.status === 401) { ST.gate = 'login'; paint(); return true; }
    if (err.status === 403) { ST.gate = 'admin'; paint(); return true; }
    return false;
  }

  function ordersQuery() {
    var f = ST.filter;
    /* 「全部状态」不能往后端发 status=all —— 后端只认 pending|paid|closed|refunded，
       发 all 会被判成「订单状态不支持」，整张订单表直接空掉。省略参数才是全部。 */
    var qs = [];
    if (f.status && f.status !== 'all') qs.push('status=' + encodeURIComponent(f.status));
    if (f.tier) qs.push('tier=' + encodeURIComponent(f.tier));
    if (f.channel) qs.push('channel=' + encodeURIComponent(f.channel));
    if (f.q) qs.push('q=' + encodeURIComponent(f.q));
    if (f.from) qs.push('from=' + encodeURIComponent(f.from));
    if (f.to) qs.push('to=' + encodeURIComponent(f.to));
    qs.push('limit=' + LIMIT);
    qs.push('offset=' + ST.offset);
    return qs.join('&');
  }

  function loadOverview() {
    var tag = ++ST.seq.overview;
    ST.loading.overview = true;
    apiGet('/admin/membership/overview?days=' + ST.days).then(function (d) {
      if (tag !== ST.seq.overview) return;
      ST.loading.overview = false;
      ST.errors.overview = '';
      ST.overview = d || null;
      ST.gate = '';
      afterOverview();
    }, function (err) {
      if (tag !== ST.seq.overview) return;
      ST.loading.overview = false;
      if (isAuthFail(err)) return;
      ST.errors.overview = err.message || '概览数据没拉到';
      afterOverview();
    });
  }

  function loadOrders() {
    var tag = ++ST.seq.orders;
    ST.loading.orders = true;
    apiGet('/admin/membership/orders?' + ordersQuery()).then(function (d) {
      if (tag !== ST.seq.orders) return;
      ST.loading.orders = false;
      ST.errors.orders = '';
      ST.orders = d || { items: [], total: 0 };
      /* 删/关掉最后一单后当前页会空：退回上一页再取一次，别让用户对着空表 */
      if (!(ST.orders.items || []).length && ST.offset > 0) {
        ST.offset = Math.max(0, ST.offset - LIMIT);
        loadOrders();
        return;
      }
      ST.gate = '';
      afterOrders();
    }, function (err) {
      if (tag !== ST.seq.orders) return;
      ST.loading.orders = false;
      if (isAuthFail(err)) return;
      ST.errors.orders = err.message || '订单没拉到';
      afterOrders();
    });
  }

  function loadPlans() {
    var tag = ++ST.seq.plans;
    ST.loading.plans = true;
    apiGet('/admin/membership/plans').then(function (d) {
      if (tag !== ST.seq.plans) return;
      ST.loading.plans = false;
      ST.errors.plans = '';
      ST.plans = d || { plans: [] };
      ST.gate = '';
      afterPlans();
    }, function (err) {
      if (tag !== ST.seq.plans) return;
      ST.loading.plans = false;
      if (isAuthFail(err)) return;
      ST.errors.plans = err.message || '价格没拉到';
      afterPlans();
    });
  }

  function loadMembers() {
    var tag = ++ST.seq.members;
    ST.loading.members = true;
    apiGet('/admin/membership/members?q=' + encodeURIComponent(ST.memberQ || '') + '&limit=50').then(function (d) {
      if (tag !== ST.seq.members) return;
      ST.loading.members = false;
      ST.errors.members = '';
      ST.members = d || { items: [] };
      ST.gate = '';
      afterMembers();
    }, function (err) {
      if (tag !== ST.seq.members) return;
      ST.loading.members = false;
      if (isAuthFail(err)) return;
      ST.errors.members = err.message || '会员没拉到';
      afterMembers();
    });
  }

  function loadAll() {
    loadOverview();
    loadOrders();
    loadPlans();
    loadMembers();
  }

  /* 任何写操作成功之后：KPI 与订单都会变，这两个必须重取 */
  function refreshAfterWrite() {
    loadOverview();
    loadOrders();
  }

  /* ───────────────────────── 订单动作 ───────────────────────── */

  function withAction(btn, msg, okMsg) {
    var unlock = lockBtn(btn);
    return function (err) {
      unlock();
      var text = (msg || '操作没成功') + '：' + (err && err.message ? err.message : '未知原因');
      flash(text, true);
      toast(text, true);
    };
  }

  function doMarkPaid(no, btn) {
    if (!no) return;
    if (!win.confirm('把订单 ' + no + ' 标记为已支付？会立刻给用户加上会员天数。')) return;
    apiPost('/admin/membership/orders/' + encodeURIComponent(no) + '/mark-paid', { note: '' })
      .then(function () {
        toast('已补单 ' + no);
        refreshAfterWrite();
      }, withAction(btn, '补单失败'));
  }

  function doRefund(no, btn) {
    if (!no) return;
    if (!win.confirm('对订单 ' + no + ' 全额退款？退款后这笔会员天数会被扣回，订阅可能回落到旅人。')) return;
    apiPost('/admin/membership/orders/' + encodeURIComponent(no) + '/refund', { note: '' })
      .then(function () {
        toast('已退款 ' + no);
        refreshAfterWrite();
      }, withAction(btn, '退款失败'));
  }

  function doClose(no, btn) {
    if (!no) return;
    if (!win.confirm('关闭订单 ' + no + '？关闭后这单不能再付，要恢复只能重新下单。')) return;
    apiPost('/admin/membership/orders/' + encodeURIComponent(no) + '/close', { note: '' })
      .then(function () {
        toast('已关闭 ' + no);
        refreshAfterWrite();
      }, withAction(btn, '关闭失败'));
  }

  /* ───────────────────────── 价格保存 ───────────────────────── */

  function numOf(el) {
    var v = Number(el && el.value);
    return isFinite(v) ? v : NaN;
  }

  function savePlan(tr, btn) {
    if (!tr) return;
    var id = tr.getAttribute('data-plan-id');
    var msgEl = tr.querySelector('[data-spa-msg]');
    var priceEl = tr.querySelector('[data-spa-f="price"]');
    var listEl = tr.querySelector('[data-spa-f="list"]');
    var daysEl = tr.querySelector('[data-spa-f="days"]');
    var seatsEl = tr.querySelector('[data-spa-f="seats"]');
    var sortEl = tr.querySelector('[data-spa-f="sort"]');
    var activeEl = tr.querySelector('[data-spa-f="active"]');

    var price = numOf(priceEl), list = numOf(listEl), days = numOf(daysEl);
    var seats = numOf(seatsEl), sort = numOf(sortEl);

    var bad = '';
    if (!isFinite(price) || price < 0) bad = '价格要是 ≥ 0 的数字';
    else if (!isFinite(list) || list < 0) bad = '原价要是 ≥ 0 的数字';
    else if (!isFinite(days) || days < 1 || Math.round(days) !== days) bad = '天数要是 ≥ 1 的整数';
    else if (!isFinite(seats) || seats < 0 || Math.round(seats) !== seats) bad = '席位要是 ≥ 0 的整数（0 = 不限）';
    else if (!isFinite(sort)) bad = '排序要是整数';
    if (bad) {
      if (msgEl) msgEl.textContent = bad;
      toast(bad, true);
      return;
    }

    var body = {
      /* 元 → 分：先乘再 round，19.9 元不会变成 1989 分 */
      priceCents: Math.round(price * 100),
      listCents: Math.round(list * 100),
      durationDays: Math.round(days),
      seats: Math.round(seats),
      sort: Math.round(sort),
      active: activeEl && activeEl.checked ? 1 : 0
    };

    if (msgEl) msgEl.textContent = '';
    var unlock = lockBtn(btn);
    apiPut('/admin/membership/plans/' + encodeURIComponent(id), body).then(function (d) {
      var p = d && d.plan;
      if (p && ST.plans && ST.plans.plans) {
        ST.plans.plans.forEach(function (x, i) {
          if (String(x.id) === String(p.id)) ST.plans.plans[i] = p;
        });
      }
      toast('已保存 ' + tierName((p && p.tier) || '') + ' · ' + cycleName((p && p.cycle) || ''));
      paintInto('spa-prices', plansHTML);
    }, function (err) {
      unlock();
      var text = (err && err.message) || '保存失败';
      if (msgEl) msgEl.textContent = text;
      toast('保存失败：' + text, true);
    });
  }

  /* ───────────────────────── 补单 ───────────────────────── */

  function doGrant(form) {
    var emailEl = form.querySelector('[name="email"]');
    var uidEl = form.querySelector('[name="userId"]');
    var tierEl = form.querySelector('[name="tier"]');
    var daysEl = form.querySelector('[name="days"]');
    var noteEl = form.querySelector('[name="note"]');
    var btn = form.querySelector('button[type="submit"]');

    var email = ((emailEl && emailEl.value) || '').replace(/^\s+|\s+$/g, '');
    var uid = ((uidEl && uidEl.value) || '').replace(/^\s+|\s+$/g, '');
    var days = Number(daysEl && daysEl.value);

    if (!email && !uid) { flash('邮箱和用户 ID 至少填一个', true); return; }
    if (email && uid) { flash('邮箱与用户 ID 只填一个就行', true); return; }
    if (!isFinite(days) || days < 1 || Math.round(days) !== days) { flash('天数要是 ≥ 1 的整数', true); return; }

    var body = {
      tier: (tierEl && tierEl.value) || TIER_ORDER[0],
      days: Math.round(days),
      note: ((noteEl && noteEl.value) || '').replace(/^\s+|\s+$/g, '')
    };
    if (email) body.email = email; else body.userId = Number(uid);

    var unlock = lockBtn(btn);
    flash('正在补单…', false);
    apiPost('/admin/membership/grant', body).then(function (d) {
      unlock();
      ST.grant = d || null;
      paintInto('spa-grant-out', grantOutHTML);
      var no = d && d.order && d.order.orderNo ? d.order.orderNo : '';
      flash('补单成功：' + (no || '已生效'), false);
      toast('补单成功 ' + no);
      refreshAfterWrite();
      if (emailEl) emailEl.value = '';
      if (uidEl) uidEl.value = '';
    }, function (err) {
      unlock();
      flash('补单失败：' + ((err && err.message) || '未知原因'), true);
      toast('补单失败', true);
    });
  }

  /* ───────────────────────── 事件委托 ───────────────────────── */

  function scopeOf(el) {
    return el && el.closest ? el.closest('.spa') : null;
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('[data-spa-act]');
    if (!btn || !scopeOf(btn)) return;
    var act = btn.getAttribute('data-spa-act');

    if (act === 'range') {
      var d = Number(btn.getAttribute('data-days'));
      if (d !== 30 && d !== 90) return;
      if (ST.days === d) return;
      ST.days = d;
      paintInto('spa-head', headInner);
      loadOverview();
      return;
    }
    if (act === 'refresh') {
      loadAll();
      toast('正在刷新');
      return;
    }
    if (act === 'csv') {
      /* 直接交给浏览器下载：响应带 Content-Disposition，不必走 fetch 再拼 Blob */
      win.location.href = API_PREFIX + '/admin/membership/report.csv?days=' + ST.days;
      return;
    }
    if (act === 'retry') {
      var part = btn.getAttribute('data-part');
      if (part === 'overview') loadOverview();
      else if (part === 'orders') loadOrders();
      else if (part === 'plans') loadPlans();
      else if (part === 'members') loadMembers();
      else loadAll();
      return;
    }
    if (act === 'page') {
      var dir = Number(btn.getAttribute('data-dir'));
      var total = (ST.orders && Number(ST.orders.total)) || 0;
      var next = ST.offset + (dir > 0 ? LIMIT : -LIMIT);
      if (next < 0) next = 0;
      if (next >= total && dir > 0) return;
      ST.offset = next;
      loadOrders();
      return;
    }
    if (act === 'filter-reset') {
      /* type=reset 自己清空表单控件；这里同步模块状态并重新取数 */
      ST.filter = { status: 'all', tier: '', channel: '', q: '', from: '', to: '' };
      ST.offset = 0;
      loadOrders();
      return;
    }
    if (act === 'mark-paid') { doMarkPaid(btn.getAttribute('data-no'), btn); return; }
    if (act === 'refund') { doRefund(btn.getAttribute('data-no'), btn); return; }
    if (act === 'close') { doClose(btn.getAttribute('data-no'), btn); return; }
    if (act === 'plan-save') { savePlan(btn.closest('tr'), btn); return; }
  }

  function readFilter(form) {
    var f = ST.filter;
    var p = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? String(el.value || '') : '';
    };
    f.status = p('status') || 'all';
    f.tier = p('tier');
    f.channel = p('channel');
    f.q = p('q').replace(/^\s+|\s+$/g, '');
    f.from = p('from');
    f.to = p('to');
  }

  /* 回车提交：表单自己 submit，这里只按 data-spa-form 分发。
     不做 keydown 监听 —— 多行输入框里回车该换行，不该提交 */
  function onSubmit(e) {
    var form = e.target;
    if (!form || !form.getAttribute || !scopeOf(form)) return;
    var kind = form.getAttribute('data-spa-form');
    if (!kind) return;
    e.preventDefault();
    if (kind === 'filter') {
      readFilter(form);
      ST.offset = 0;
      loadOrders();
      return;
    }
    if (kind === 'grant') { doGrant(form); return; }
    if (kind === 'members') {
      var qEl = form.querySelector('[name="q"]');
      ST.memberQ = ((qEl && qEl.value) || '').replace(/^\s+|\s+$/g, '');
      loadMembers();
      return;
    }
  }

  /* document 级委托只绑一次：宿主整块重写 #app 时这些监听不受影响，
     页面被换掉之后 closest('.spa') 会挡住所有事件，不会误触发别的页 */
  function bindOnce() {
    if (bound) return;
    bound = true;
    doc.addEventListener('click', onClick, false);
    doc.addEventListener('submit', onSubmit, false);
  }

  /* ───────────────────────── 对外 ───────────────────────── */

  function html(ctx) {
    ESC = (ctx && ctx.esc) || ESC;
    var body = LAST_BODY || (headHTML() + skeletonHTML());
    return '<div class="spa" id="spa-root">' + body + '</div>';
  }

  function mount() {
    var now = Date.now();
    /* 宿主可能在同一次 render 里连调两次；60ms 内只认第一次，免得打两份请求 */
    if (now - ST.mountAt < 60) return;
    ST.mountAt = now;
    if (!rootEl()) return;
    bindOnce();
    ST.painted = false;
    /* 有缓存就先画旧数据（换页回来不该闪骨架），再静默刷新 */
    if (!ST.gate && (ST.overview || ST.orders || ST.plans || ST.members)) paint();
    loadAll();
  }

  win.MemberAdmin = { html: html, mount: mount };

})(typeof window !== 'undefined' ? window : this);

