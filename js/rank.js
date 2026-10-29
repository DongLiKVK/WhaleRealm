/* ══════════════════════════════════════════════════════════════
   v39 · AI 模型能力排行（#/rank）—— 两张榜、两个数据源

   两个数据源都抓下来存成本地快照，页面自己不算分：
     · AA 智能指数 —— js/rank-data.js，tools/fetch-rank.mjs 抓
       https://artificialanalysis.ai/zh/leaderboards/models
     · LiveBench  —— js/livebench-data.js，tools/fetch-livebench.mjs 抓
       https://livebench.ai/ 的版本目录（table.csv / models.json / cost.csv）

   每个数据源都出两张榜：
     · 全球榜   —— 数据里所有模型
     · 纯国内榜 —— 机构归属为中国（g === 'cn'）的模型

   两套分数不是一把尺子：AA 的 intelligenceIndex 在 0–60 量级，
   LiveBench 的总分是七个 suite 的百分制算术平均（0–100）。
   所以并排放，但**从不换算、不加总、不互相排名**。

   宿主（js/app.js 的 rankPage()）把 S / esc 当 ctx 递进来，
   本文件既能被浏览器加载，也能在 Node 里单独渲染做数据核对。
   ══════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';

  var AA = win.AIRankData || null;
  var RAW = (AA && AA.models) || [];
  var META = (AA && AA.meta) || null;

  var LB = win.LiveBenchData || null;
  var LROW = (LB && LB.models) || [];
  var LMETA = (LB && LB.meta) || null;

  /* AA 的五个真实分项：列头、排序键共用这张表 [排序键, 数据字段, 列头, 悬停说明] */
  /* AA v5.0（2026-10-27 起）的九项评测分四类，各占 25%：
     知识工作（Briefcase / AutomationBench / GDP.pdf）、编码（FrontierCode / Terminal-Bench 4.0）、
     科学（Terminal-Bench-Science / CritPt v2）、通用（Omniscience / HLE-Diamond）。
     表格只摊开五项最有区分度的，完整九项都在数据文件里。 */
  var DIMS = [
    ['code', 'fc', '编码', 'FrontierCode 2.0（v5.0 编码类，权重 15%）'],
    ['tbench', 'tb', '终端', 'Terminal-Bench 4.0（v5.0 编码类，权重 10%）'],
    ['critpt', 'cp', '科学', 'CritPt v2 Hard Subset（v5.0 科学类，权重 10%）'],
    ['hle', 'hl', '专家难题', 'HLE-Diamond（v5.0 通用类，权重 10%）'],
    ['omni', 'oa', '常识', 'AA-Omniscience 准确率（v5.0 通用类，权重 10%）']
  ];
  var SORTS = [['total', '智能指数']].concat(DIMS.map(function (d) { return [d[0], d[2]]; }));

  /* LiveBench 的七个 suite：优先用数据里的 meta.categories（抓取时从 categories.json 抄来），
     抓不到就退回内置表 —— 少一份 categories.json 也不至于让表头秃掉。
     列头只有 40 来像素宽，所以中文名刻意压到二~三字，完整英文名放悬停说明。 */
  var LB_LABEL = {
    long_agentic: '长任务', reasoning: '推理', coding: '代码', browser: '浏览',
    data_analysis: '分析', research: '研究', design: '设计'
  };
  var LB_FULL = {
    long_agentic: 'Long Agentic', reasoning: 'Reasoning', coding: 'Coding', browser: 'Browser',
    data_analysis: 'Data Analysis', research: 'Research', design: 'Design'
  };
  var LB_KEYS = ['long_agentic', 'reasoning', 'coding', 'browser', 'data_analysis', 'research', 'design'];
  var lbKeys = ((LMETA && LMETA.categories) || [])
    .map(function (c) { return c && c.key; })
    .filter(function (k, i, a) { return LB_KEYS.indexOf(k) >= 0 && a.indexOf(k) === i; });
  if (!lbKeys.length) lbKeys = LB_KEYS.slice();
  var LDIMS = lbKeys.map(function (k) {
    return [k, k, LB_LABEL[k] || k, 'LiveBench ' + (LB_FULL[k] || k) + '（七个 suite 之一）'];
  });
  var LSORTS = [['total', '总分']].concat(LDIMS.map(function (d) { return [d[0], d[2]]; }));

  var BOARDS = [
    ['lb', 'LiveBench', 'LiveBench 2.0'],
    ['aa', 'AA 智能指数', 'Artificial Analysis']
  ];

  var REGION = {
    us: '美国', cn: '中国', fr: '法国', ca: '加拿大', il: '以色列',
    kr: '韩国', in: '印度', es: '西班牙', ch: '瑞士', ae: '阿联酋',
    gb: '英国', de: '德国', jp: '日本', sg: '新加坡', nl: '荷兰',
    ru: '俄罗斯', sa: '沙特'
  };

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  /* 两套快照元数据：页面上所有「数据 / 更新」字样都从这里读 */
  var SNAPSHOT = {
    source: (META && META.source) || 'https://artificialanalysis.ai/zh/leaderboards/models',
    mode: (META && META.mode) || 'missing',
    fetchedAt: (META && META.fetchedAt) || '',
    asOf: (META && META.asOf) || '',
    cadenceDays: (META && META.cadenceDays) || 7,
    nextDue: (META && META.nextDue) || '',
    rawModels: (META && META.rawModels) || 0,
    keptModels: (META && META.keptModels) || RAW.length,
    mergedVariants: (META && META.mergedVariants) || 0,
    skippedNoIndex: (META && META.skippedNoIndex) || 0,
    cnModels: (META && META.cnModels) || 0,
    unmappedCreators: (META && META.unmappedCreators) || [],
    prevAsOf: (META && META.prevAsOf) || null,
    indexVersion: (META && META.indexVersion) || null,
    coverage: (META && META.coverage) || '',
    prevIndexVersion: (META && META.prevIndexVersion) || null
  };

  var LSNAP = {
    source: (LMETA && LMETA.source) || 'https://livebench.ai/',
    sourceData: (LMETA && LMETA.sourceData) || '',
    sourceModels: (LMETA && LMETA.sourceModels) || '',
    sourceCost: (LMETA && LMETA.sourceCost) || '',
    mode: (LMETA && LMETA.mode) || 'missing',
    release: (LMETA && LMETA.release) || '',
    releaseDate: (LMETA && LMETA.releaseDate) || '',
    fetchedAt: (LMETA && LMETA.fetchedAt) || '',
    asOf: (LMETA && LMETA.asOf) || '',
    cadenceDays: (LMETA && LMETA.cadenceDays) || 30,
    nextDue: (LMETA && LMETA.nextDue) || '',
    rawModels: (LMETA && LMETA.rawModels) || 0,
    keptModels: (LMETA && LMETA.keptModels) || LROW.length,
    skipped: (LMETA && LMETA.skipped) || 0,
    cnModels: (LMETA && LMETA.cnModels) || 0,
    openModels: (LMETA && LMETA.openModels) || 0,
    unmappedOrgs: (LMETA && LMETA.unmappedOrgs) || [],
    prevAsOf: (LMETA && LMETA.prevAsOf) || null
  };

  /* 距离下一个该重抓的日子还有几天：负数 = 已经过期几天 */
  function staleOf(nextDue) {
    var due = parseDay(nextDue);
    if (!due) return null;
    var now = new Date();
    var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - todayMid) / 86400000);
  }
  function staleDays() { return staleOf(SNAPSHOT.nextDue); }
  function lbStaleDays() { return staleOf(LSNAP.nextDue); }

  // LiveBench 是默认板（排在左侧第一个），AA 需要用 #/rank/aa 显式指定
  function boardOf(S) { return S && S.rankBoard === 'aa' ? 'aa' : 'lb'; }
  function snapOf(board) { return board === 'lb' ? LSNAP : SNAPSHOT; }
  function staleOfBoard(board) { return board === 'lb' ? lbStaleDays() : staleDays(); }
  function dimsOf(board) { return board === 'lb' ? LDIMS : DIMS; }
  function sortsOf(board) { return board === 'lb' ? LSORTS : SORTS; }

  /* 上下文长度：256000 → 256K，1000000 → 1M。没有精确倍数的保留一位小数 */
  function ctxText(v) {
    if (!v) return '';
    if (v >= 1000000) return (Math.round(v / 100000) / 10) + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'K';
    return String(v);
  }

  /* 排序的公共部分：空值永远垫底，比完目标列再比总分，最后按名字稳住次序 */
  function sortRows(rows, key, totalOf) {
    rows.sort(function (a, b) {
      if (key) {
        var av = a[key], bv = b[key];
        var an = (av == null), bn = (bv == null);
        if (an !== bn) return an ? 1 : -1;
        if (!an && bv !== av) return bv - av;
      }
      var at = totalOf(a), bt = totalOf(b);
      var an2 = (at == null), bn2 = (bt == null);
      if (an2 !== bn2) return an2 ? 1 : -1;
      if (!an2 && bt !== at) return bt - at;
      return String(a.n).localeCompare(String(b.n));
    });
    return rows;
  }

  /* ─────────────── AA 榜：范围筛选 + 维度排序 ─────────────── */
  function list(scope, sort) {
    var key = '';
    for (var i = 0; i < DIMS.length; i++) if (DIMS[i][0] === sort) { key = DIMS[i][1]; break; }
    var rows = RAW.filter(function (m) { return scope !== 'cn' || m.g === 'cn'; })
      .map(function (m) {
        var o = {};
        for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k] = m[k];
        o.total = m.ii;
        return o;
      });
    return sortRows(rows, key, function (m) { return m.total; });
  }

  /* ─────────────── LiveBench 榜：同构，只是总分字段叫 ov ─────────────── */
  function lbList(scope, sort) {
    var key = '';
    for (var i = 0; i < LDIMS.length; i++) if (LDIMS[i][0] === sort) { key = LDIMS[i][1]; break; }
    var rows = LROW.filter(function (m) { return scope !== 'cn' || m.g === 'cn'; })
      .map(function (m) {
        var o = {};
        for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k] = m[k];
        o.total = m.ov;
        return o;
      });
    return sortRows(rows, key, function (m) { return m.total; });
  }

  /* 并列共享名次：AA 满榜都是同分（同分再按模型名排序，但名次该一样）。
     以前一律 i+1，会把并列硬拆成相邻两号。 */
  function ranksOf(rows, sort, dims, totalOf) {
    var key = '';
    for (var i = 0; i < dims.length; i++) if (dims[i][0] === sort) { key = dims[i][1]; break; }
    var out = [], last = null, lastRank = 0;
    rows.forEach(function (m, i) {
      var v = key ? m[key] : totalOf(m);
      if (v != null && last != null && v === last) out.push(lastRank);
      else { lastRank = i + 1; out.push(lastRank); }
      last = v;
    });
    return out;
  }

  function deltaHTML(d) {
    if (d > 0) return '<span class="rk-delta-up" title="比上一份快照上升 ' + d + ' 位">↑' + d + '</span>';
    if (d < 0) return '<span class="rk-delta-down" title="比上一份快照下降 ' + (-d) + ' 位">↓' + (-d) + '</span>';
    if (typeof d === 'number') return '<span class="rk-delta-flat" title="名次没变">—</span>';
    return '<span class="rk-delta-flat" title="' + (SNAPSHOT.prevAsOf ? '上一份快照里没有这个模型' : '还没有上一份快照可比') + '">—</span>';
  }

  /* 两个数据源的价格列含义一致：每百万 token 的输出价（美元），来源各自的定价表 */
  function priceHTML(m, board) {
    var from = board === 'lb' ? 'LiveBench 的 cost.csv' : 'AA 的定价表';
    if (m.po == null) return '<span class="rk-free" title="' + from + '里没有这个模型的输出价">—</span>';
    var v = m.po >= 10 ? Math.round(m.po) : Math.round(m.po * 100) / 100;
    return '$' + v + '<i>/M</i>';
  }

  function dimCell(m, d, board) {
    var v = m[d[1]];
    var na = board === 'lb' ? 'LiveBench 这一项是 n/a —— 这个模型没跑那个 suite' : 'AA 未收录这项分数';
    if (v == null) return '<div class="rk-dim" data-dim="' + d[0] + '" role="cell" title="' + na + '"><b class="is-na">—</b></div>';
    return '<div class="rk-dim" data-dim="' + d[0] + '" role="cell" title="' + d[3] + '"><b>' + round1(v) + '</b></div>';
  }

  function badgesHTML(m, board) {
    var out = '';
    if (m.op) out += '<i class="rk-badge open" title="' + (board === 'lb' ? 'LiveBench 记为 openweight' : 'AA 记为开放权重') + '">开源</i>';
    if (board !== 'lb' && m.r) out += '<i class="rk-badge reason" title="AA 标记为推理型模型">推理</i>';
    if (board !== 'lb' && m.ie) out += '<i class="rk-badge est" title="AA 这项目前是估算值">估算</i>';
    if (m.nv > 1) out += '<i class="rk-badge k" title="同名的多个推理档合并成一行，取智能指数最高的那档">' + m.nv + ' 档</i>';
    return out;
  }

  /* 智能指数大约 0–60：按 60 归一，最低留 2% 让一条都看不见的行也有痕迹 */
  function barWidth(v) { return Math.max(2, Math.min(100, Math.round((v / 60) * 100))); }
  /* LiveBench 总分本来就是百分制：直接当宽度用，夹在 2–100 */
  function bar100(v) { return Math.max(2, Math.min(100, Math.round(v))); }

  /* 机构 · 地区：缺哪一半就不显示哪一半，别把「未标注」写两遍 */
  function metaLine(m, esc) {
    var org = m.o && m.o !== '未标注' ? esc(m.o) : '机构未标注';
    var region = REGION[m.g];
    return region ? org + ' · ' + region : org;
  }

  function rowHTML(m, i, rank, scope, sort, esc) {
    var medal = i < 3 && sort === 'total' ? '<i class="rk-medal m' + (i + 1) + '">' + ['🥇', '🥈', '🥉'][i] + '</i>' : '';
    return '<div class="rk-row' + (i < 3 && sort === 'total' ? ' is-top' : '') + '" role="row">' +
      '<div class="rk-rank" role="cell"><b>' + rank + '</b>' + medal + '</div>' +
      '<div class="rk-model" role="cell">' +
        '<div class="rk-name">' + esc(m.n) + badgesHTML(m, 'aa') + '</div>' +
        '<div class="rk-meta">' + metaLine(m, esc) +
          (m.cx ? ' · ' + ctxText(m.cx) + ' 上下文' : '') + '</div>' +
      '</div>' +
      '<div class="rk-total" role="cell"><b>' + (m.total == null ? '—' : m.total.toFixed(1)) + '</b>' +
        '<span class="rk-bar"><i style="width:' + (m.total == null ? 2 : barWidth(m.total)) + '%"></i></span></div>' +
      DIMS.map(function (d) { return dimCell(m, d, 'aa'); }).join('') +
      '<div class="rk-price" role="cell">' + priceHTML(m, 'aa') + '</div>' +
      '<div class="rk-deltac" role="cell">' +
        (scope === 'cn'
          ? '<span class="rk-delta-flat" title="纯国内榜的名次是重排过的，跟全球榜相减没有意义">—</span>'
          : deltaHTML(m.d)) + '</div>' +
    '</div>';
  }

  function headHTML() {
    return '<div class="rk-head" role="row">' +
      '<div class="rk-hc" role="columnheader">名次</div>' +
      '<div class="rk-hc" role="columnheader">模型 / 机构</div>' +
      '<div class="rk-hc" role="columnheader" title="Artificial Analysis Intelligence Index">智能指数</div>' +
      DIMS.map(function (d) { return '<div class="rk-hc" role="columnheader" data-dim="' + d[0] + '" title="' + d[3] + '">' + d[2] + '</div>'; }).join('') +
      '<div class="rk-hc rk-h-price" role="columnheader">输出价</div>' +
      '<div class="rk-hc rk-h-delta" role="columnheader" title="与上一份快照的名次差">变化</div>' +
    '</div>';
  }

  /* LiveBench 行：七个 suite 全摊开，多出输出价，没有「变化」（数据里只有一版，没有历史） */
  function lbRowHTML(m, i, rank, sort, esc) {
    var medal = i < 3 && sort === 'total' ? '<i class="rk-medal m' + (i + 1) + '">' + ['🥇', '🥈', '🥉'][i] + '</i>' : '';
    return '<div class="rk-row' + (i < 3 && sort === 'total' ? ' is-top' : '') + '" role="row">' +
      '<div class="rk-rank" role="cell"><b>' + rank + '</b>' + medal + '</div>' +
      '<div class="rk-model" role="cell">' +
        '<div class="rk-name">' + esc(m.n) + badgesHTML(m, 'lb') + '</div>' +
        '<div class="rk-meta">' + metaLine(m, esc) + '</div>' +
      '</div>' +
      '<div class="rk-total" role="cell"><b>' + (m.total == null ? '—' : round1(m.total).toFixed(1)) + '</b>' +
        '<span class="rk-bar"><i style="width:' + (m.total == null ? 2 : bar100(m.total)) + '%"></i></span></div>' +
      LDIMS.map(function (d) { return dimCell(m, d, 'lb'); }).join('') +
      '<div class="rk-price" role="cell">' + priceHTML(m, 'lb') + '</div>' +
    '</div>';
  }

  function lbHeadHTML() {
    return '<div class="rk-head" role="row">' +
      '<div class="rk-hc" role="columnheader">名次</div>' +
      '<div class="rk-hc" role="columnheader">模型 / 机构</div>' +
      '<div class="rk-hc" role="columnheader" title="七个 suite 的算术平均（LiveBench 页面上的 OVERALL）">总分</div>' +
      LDIMS.map(function (d) { return '<div class="rk-hc" role="columnheader" data-dim="' + d[0] + '" title="' + d[3] + '">' + d[2] + '</div>'; }).join('') +
      '<div class="rk-hc rk-h-price" role="columnheader">输出价</div>' +
    '</div>';
  }

  function topSuites(m, n) {
    var have = LDIMS.filter(function (d) { return m[d[1]] != null; })
      .map(function (d) { return { label: d[2], v: m[d[1]] }; })
      .sort(function (a, b) { return b.v - a.v; })
      .slice(0, n || 2);
    return have.map(function (x) { return x.label + ' ' + round1(x.v); }).join(' · ');
  }

  function podiumHTML(arr, esc, board) {
    return '<div class="rk-podium">' + arr.slice(0, 3).map(function (m, i) {
      var score = board === 'lb' ? round1(m.total) : m.total;
      var scoreTxt = score == null ? '—' : score.toFixed(1);
      var sub;
      if (board === 'lb') {
        sub = topSuites(m, 2) || '七项暂无';
      } else {
        /* 前三名的分项不一定齐（有的模型 AA 没收录 GPQA），挑两条有数的展示，别在表彰位上摆横杠 */
        var have = DIMS.filter(function (d) { return m[d[1]] != null; }).slice(0, 2);
        sub = have.length ? have.map(function (d) { return d[2] + ' ' + m[d[1]]; }).join(' · ') : '分项暂无';
      }
      return '<div class="rk-pod p' + (i + 1) + '">' +
        '<span class="rk-pod-medal">' + ['🥇', '🥈', '🥉'][i] + '</span>' +
        '<b>' + esc(m.n) + '</b>' +
        '<span class="rk-pod-org">' + esc(m.o || '未标注机构') + (m.op ? ' · 开源' : '') + '</span>' +
        '<span class="rk-pod-score">' + scoreTxt + '</span>' +
        '<span class="rk-pod-dims">' + sub + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function dimChamps(arr, dims) {
    return dims.map(function (d) {
      var best = null, bv = -Infinity;
      arr.forEach(function (m) { if (m[d[1]] != null && m[d[1]] > bv) { bv = m[d[1]]; best = m; } });
      return { label: d[2], name: best ? best.n : '—', val: best ? round1(bv) : null };
    });
  }

  function stampHTML(board) {
    var snap = snapOf(board);
    var stale = staleOfBoard(board);
    var site = board === 'lb' ? 'livebench.ai' : 'artificialanalysis.ai';
    var title = '数据抓取于 ' + snap.fetchedAt + ' · 来源 ' + site + ' · 约定每 ' + snap.cadenceDays + ' 天重抓一版' +
    (board === 'lb' ? '' : ' · AA 指数版本 v' + (SNAPSHOT.indexVersion || '?') + ' · 有分模型 ' + (SNAPSHOT.coverage || '?'));
    var extra = '';
    if (stale != null) {
      if (stale < 0) extra = '<i class="rk-stale" title="' + title + '">过期 ' + (-stale) + ' 天</i>';
      else if (stale === 0) extra = '<i class="rk-stale" title="' + title + '">今天该更新</i>';
    }
    return '<span class="rk-stamp" title="' + title + '">数据 ' + (snap.asOf || '未知') + extra + '</span>';
  }

  function boardsHTML(board) {
    return '<div class="rk-boards" role="tablist" aria-label="数据源">' +
      BOARDS.map(function (b) {
        var on = board === b[0];
        return '<button type="button" class="rk-board' + (on ? ' on' : '') + '" data-act="rkboard" data-b="' + b[0] + '"' +
          ' aria-pressed="' + (on ? 'true' : 'false') + '">' + b[1] +
          '<i>' + b[2] + '</i></button>';
      }).join('') +
      '<span class="rk-board-tip">两套分数不是一把尺子（LiveBench 总分 0–100 / AA 智能指数 0–60 量级），并排放，不互相换算</span>' +
    '</div>';
  }

  /* ─────────────── 右栏：两个数据源各一套口径卡 ─────────────── */
  function aaSide(ctx, arr, scope) {
    var esc = ctx.esc;
    var champs = dimChamps(arr, DIMS);
    var un = SNAPSHOT.unmappedCreators;
    return '<aside class="col-side">' +
      '<div class="card"><div class="card-hd"><span class="t">榜单口径</span>' +
        '<span class="more">' + (scope === 'cn' ? '纯国内' : '全球') + '</span></div>' +
        '<div class="card-bd">' +
          '<p class="rk-p">数据来自 <b>Artificial Analysis</b> 的模型榜，抓取后存成本地文件；本站不参与打分。</p>' +
          '<ul class="rk-facts">' +
            '<li><span>来源</span><b>artificialanalysis.ai</b></li>' +
              '<li><span>指数版本</span><b>' + (SNAPSHOT.indexVersion ? 'v' + esc(String(SNAPSHOT.indexVersion)) : '—') + '</b></li>' +
              '<li><span>有分模型</span><b>' + esc(SNAPSHOT.coverage || '—') + '</b></li>' +
            '<li><span>抓取时间</span><b>' + esc(SNAPSHOT.fetchedAt || '—') + '</b></li>' +
            '<li><span>原始条数</span><b>' + SNAPSHOT.rawModels + '</b></li>' +
            '<li><span>保留</span><b>' + SNAPSHOT.keptModels + ' 个模型</b></li>' +
            '<li><span>合并推理档</span><b>' + SNAPSHOT.mergedVariants + ' 条</b></li>' +
            '<li><span>无主分丢弃</span><b>' + SNAPSHOT.skippedNoIndex + ' 条</b></li>' +
            '<li><span>国内模型</span><b>' + SNAPSHOT.cnModels + ' 个</b></li>' +
          '</ul>' +
          '<p class="rk-fine">同一模型的多个推理档（名字尾部括号）合并成一行，取智能指数最高的那档，' +
              '整行的分项和单价也都是那一档的数，不跨档拼装。' +
              'AA v5.0 只对一部分模型给出新指数分，没分的先不进榜（本轮 ' + esc(SNAPSHOT.coverage || '—') + ' 个有分）；' +
            'AA 未收录的分项显示「—」，不插值、不补零。' +
            (un.length ? '机构归属待定的 ' + un.length + ' 家（' + esc(un.join(' / ')) + '）不进纯国内榜。' : '') +
            '</p>' +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-hd"><span class="t">分项第一</span><span class="more">' + (scope === 'cn' ? '国内' : '全球') + '</span></div>' +
        '<div class="card-bd rk-champs">' + champs.map(function (c) {
          return '<div class="rk-champ"><span class="rk-champ-d">' + esc(c.label) + '</span>' +
            '<b>' + esc(c.name) + '</b><em>' + (c.val == null ? '—' : c.val) + '</em></div>';
        }).join('') + '</div></div>' +
      '<div class="card"><div class="card-hd"><span class="t">怎么看这张榜</span></div>' +
        '<div class="card-bd rk-how">' +
          '<div class="rk-how-row"><b>智能指数</b><span>AA 自算的综合指数（0–60 量级），不是本站加权。v5.0 起由九项评测加权：知识工作、编码、科学、通用四类各占 25%，其中约六成权重来自 AA 的私有题集。分项强不代表综合分高。</span></div>' +
          '<div class="rk-how-row"><b>分项</b><span>表里摊开五项：编码 FrontierCode 2.0、终端 Terminal-Bench 4.0、科学 CritPt v2、专家难题 HLE-Diamond、常识 AA-Omniscience 准确率，都是百分制；完整九项在数据文件里。AA 没测的显示「—」，不补分。</span></div>' +
          '<div class="rk-how-row"><b>变化</b><span>' + (SNAPSHOT.prevAsOf
                ? (SNAPSHOT.prevIndexVersion !== SNAPSHOT.indexVersion
                  ? '这一版换了指数口径（上一版是 ' + (SNAPSHOT.prevIndexVersion ? 'v' + SNAPSHOT.prevIndexVersion : '未记录版本的旧口径') + '，本版 v' + SNAPSHOT.indexVersion + '），新旧分数不可比，所以名次变化一律显示「—」。'
                  : '↑↓ 是这一版和上一版快照之间的名次差，不是分数变化。')
                : '↑↓ 是这一版和上一版快照之间的名次差，不是分数变化；没有上一版就是「—」。') +
                '纯国内榜的名次是重新编过的，不参与这项比较。</span></div>' +
          '<div class="rk-how-row"><b>输出价</b><span>每百万 token 的输出价（美元），来自 AA 的定价表；开放权重但没人托管的模型经常是「—」。</span></div>' +
        '</div></div>' +
    '</aside>';
  }

  function lbSide(ctx, arr, scope) {
    var esc = ctx.esc;
    var champs = dimChamps(arr, LDIMS);
    var un = LSNAP.unmappedOrgs;
    return '<aside class="col-side">' +
      '<div class="card"><div class="card-hd"><span class="t">榜单口径</span>' +
        '<span class="more">' + (scope === 'cn' ? '纯国内' : '全球') + '</span></div>' +
        '<div class="card-bd">' +
          '<p class="rk-p">数据来自 <b>LiveBench</b> 每期发布的 CSV（版本目录下的 table / models / cost 三份），抓取后存成本地文件；本站不参与打分。</p>' +
          '<ul class="rk-facts">' +
            '<li><span>来源</span><b>livebench.ai</b></li>' +
            '<li><span>版本</span><b>' + esc(LSNAP.release || '—') + '</b></li>' +
            '<li><span>抓取时间</span><b>' + esc(LSNAP.fetchedAt || '—') + '</b></li>' +
            '<li><span>保留</span><b>' + LSNAP.keptModels + ' 个模型</b></li>' +
            '<li><span>国内模型</span><b>' + LSNAP.cnModels + ' 个</b></li>' +
            '<li><span>开放权重</span><b>' + LSNAP.openModels + ' 个</b></li>' +
            '<li><span>suite</span><b>' + LDIMS.length + ' 项</b></li>' +
          '</ul>' +
          '<p class="rk-fine">总分就是七个 suite 的算术平均（LiveBench 页面上的 OVERALL）—— 本站用最小二乘复核过，七项权重均等。' +
            '原始表里写 n/a 的项显示「—」，不补零、不拿别的项 substitute。' +
            'LiveBench 只给机构名，机构归属哪个国家是本站人工映射的' +
            (un.length ? '（拿不准的 ' + un.length + ' 家：' + esc(un.join(' / ')) + '，不进纯国内榜）' : '') + '。' +
            '</p>' +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-hd"><span class="t">分项第一</span><span class="more">' + (scope === 'cn' ? '国内' : '全球') + '</span></div>' +
        '<div class="card-bd rk-champs">' + champs.map(function (c) {
          return '<div class="rk-champ"><span class="rk-champ-d">' + esc(c.label) + '</span>' +
            '<b>' + esc(c.name) + '</b><em>' + (c.val == null ? '—' : c.val) + '</em></div>';
        }).join('') + '</div></div>' +
      '<div class="card"><div class="card-hd"><span class="t">怎么看这张榜</span></div>' +
        '<div class="card-bd rk-how">' +
          '<div class="rk-how-row"><b>总分</b><span>七个 suite 的算术平均（0–100）。不按题目数加权，所以某个 suite 缺席时总分只按实际有分的项平均。</span></div>' +
          '<div class="rk-how-row"><b>七个 suite</b><span>长任务 Long Agentic、推理 Reasoning、代码 Coding、浏览 Browser、分析 Data Analysis、研究 Research、设计 Design —— 都是 LiveBench 自己出的题，不是通用跑分。</span></div>' +
          '<div class="rk-how-row"><b>n/a</b><span>某个模型没跑那个 suite 就是 n/a，格子里是「—」。别把「—」当成 0 分去比。</span></div>' +
          '<div class="rk-how-row"><b>和 AA 榜的区别</b><span>LiveBench 出的是每题有确定答案的客观题，AA 那边是综合指数 + 五项评测。两边的分数量纲不同，不能互相换算。</span></div>' +
        '</div></div>' +
    '</aside>';
  }

  function missingLB(ctx) {
    var esc = ctx.esc;
    return '<div class="wrap no-rail"><div class="col-main"><div class="card rk-page">' +
      '<div class="card-bd" style="padding:22px">' +
      '<p class="rk-p"><b>还没有 LiveBench 数据。</b>js/livebench-data.js 不存在或没被加载。</p>' +
      '<p class="rk-fine">在仓库根目录跑 <code>node tools/fetch-livebench.mjs</code> 生成它，' +
      '再把 <code>&lt;script src="js/livebench-data.js"&gt;</script></code> 放进 index.html（rank.js 之前）。' +
      '现在先看 <a href="#/rank/aa">AA 智能指数那张榜</a>。</p>' +
      '</div></div></div></div>';
  }

  function emptyHTML() {
    return '<div class="wrap no-rail"><div class="col-main"><div class="card rk-page">' +
      '<div class="card-bd" style="padding:22px">' +
      '<p class="rk-p"><b>还没有榜单数据。</b>js/rank-data.js 不存在或没被加载。</p>' +
      '<p class="rk-fine">在仓库根目录跑 <code>node tools/fetch-rank.mjs</code> 生成它，' +
      '再把 <code>&lt;script src="js/rank-data.js"&gt;</script></code> 放进 index.html（rank.js 之前）。</p>' +
      '</div></div></div></div>';
  }

  function html(ctx) {
    var S = ctx.S;
    var esc = ctx.esc;
    var board = boardOf(S);
    if (board === 'lb' && !LROW.length) return missingLB(ctx);
    if (board !== 'lb' && !RAW.length) return emptyHTML();

    var scope = S.rankScope === 'cn' ? 'cn' : 'global';
    var sorts = sortsOf(board);
    var dims = dimsOf(board);
    var sort = board === 'lb' ? (S.rankLbSort || 'total') : (S.rankSort || 'total');
    if (!sorts.some(function (s) { return s[0] === sort; })) sort = 'total';

    var pick = board === 'lb' ? lbList : list;
    var all = pick('global', sort);
    var arr = pick(scope, sort);
    var nCn = pick('cn', sort).length;
    var hasDelta = board !== 'lb' && RAW.some(function (m) { return typeof m.d === 'number'; });

    var tab = function (key, label, n) {
      var on = scope === key;
      return '<button type="button" class="tab ' + (on ? 'on' : '') + '" data-act="rkscope" data-scope="' + key + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '" role="tab">' + label +
        '<span class="n">' + n + '</span></button>';
    };
    var chip = function (key, label) {
      var on = sort === key;
      return '<button type="button" class="rk-chip ' + (on ? ' on' : '') + '" data-act="rksort" data-k="' + key + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    };

    var sortLabel = (sorts.filter(function (s) { return s[0] === sort; })[0] || ['', '总分'])[1];
    var lede = board === 'lb'
      ? '数字来自 LiveBench 每期发布的榜单（七个 suite 的平均分），抓取后存成本地快照；同样分成全球与纯国内两张榜。'
      : '数字来自 Artificial Analysis 的公开模型榜（当前指数版本 v' + (SNAPSHOT.indexVersion || '?') + '，' + esc(SNAPSHOT.coverage || '—') + ' 个模型有分），抓取后存成本地快照；分成全球与纯国内两张榜。换个维度就重排，名次跟着当前维度重算。';
    var rightLabel = board === 'lb' ? ('按' + sortLabel) : ('按' + sortLabel);

    var tableClass = 'rk-table' + (board === 'lb' ? ' rk-board-lb' : '') + (hasDelta ? '' : ' rk-no-delta');
    var aaRanks = board === 'lb' ? [] : ranksOf(arr, sort, DIMS, function (m) { return m.total; });
    var lbRanks = board === 'lb' ? ranksOf(arr, sort, LDIMS, function (m) { return m.total; }) : [];
    var tableHTML = board === 'lb'
      ? lbHeadHTML() + arr.map(function (m, i) { return lbRowHTML(m, i, lbRanks[i], sort, esc); }).join('')
      : headHTML() + arr.map(function (m, i) { return rowHTML(m, i, aaRanks[i], scope, sort, esc); }).join('');

    var tip = board === 'lb'
      ? '换个 suite 就是一张新榜，名次按当前 suite 重算'
      : '换个维度就是一张新榜，名次按当前维度重算';
    var sortbar = '<div class="rk-sortbar"><span class="lb">排序</span>' +
      sorts.map(function (s) { return chip(s[0], s[1]); }).join('') +
      '<span class="rk-tip">' + tip + '</span></div>';

    var foot = board === 'lb'
      ? '共 ' + arr.length + ' 个模型 · 数据抓取于 ' + esc(LSNAP.fetchedAt || '未知') +
        '（来源 livebench.ai，版本 ' + esc(LSNAP.release || '未知') + '）' +
        ' · 本站为演示站点，榜单解释权归 LiveBench。'
      : '共 ' + arr.length + ' 个模型 · 数据抓取于 ' + esc(SNAPSHOT.fetchedAt || '未知') +
        '（来源 artificialanalysis.ai/zh/leaderboards/models，指数 v' + (SNAPSHOT.indexVersion || '?') + '，有分 ' + esc(SNAPSHOT.coverage || '?') + '）' +
        (SNAPSHOT.prevAsOf
            ? ' · 变化对比 ' + esc(SNAPSHOT.prevAsOf) + ' 版' + (SNAPSHOT.prevIndexVersion !== SNAPSHOT.indexVersion ? '（换了指数口径，名次不可比）' : '')
            : ' · 暂无上一版可比') +
        ' · 本站为演示站点，榜单解释权归 Artificial Analysis。';

    return '<div class="wrap no-rail">' +
      '<div class="col-main">' +
        '<section class="fav-hero rk-hero" aria-labelledby="rk-title">' +
          '<div class="fav-hero-bd"><span class="fav-kicker">AI MODEL LEADERBOARD</span>' +
            '<h1 id="rk-title">AI 模型能力排行</h1>' +
            '<p>' + lede + '</p></div>' +
          '<div class="fav-total"><b>' + arr.length + '</b><span>' + (scope === 'cn' ? '国产模型' : '个模型') + '</span>' +
            '<em>' + rightLabel + '</em></div>' +
        '</section>' +
        '<div class="card rk-page">' +
          boardsHTML(board) +
          '<div class="tabs rk-tabs" role="tablist">' +
            tab('global', '全球榜', all.length) + tab('cn', '纯国内榜', nCn) +
            '<span class="spacer"></span>' + stampHTML(board) +
          '</div>' +
          podiumHTML(arr, esc, board) +
          sortbar +
          '<div class="' + tableClass + '" role="table" aria-label="' + (scope === 'cn' ? '纯国内榜' : '全球榜') + '">' +
            tableHTML +
          '</div>' +
          '<p class="rk-foot">' + foot + '</p>' +
        '</div>' +
      '</div>' + (board === 'lb' ? lbSide(ctx, arr, scope) : aaSide(ctx, arr, scope)) +
    '</div>';
  }

  win.AIRank = {
    html: html, list: list, lbList: lbList,
    MODELS: RAW, LB_MODELS: LROW,
    DIMS: DIMS, LB_DIMS: LDIMS,
    SORTS: SORTS, LB_SORTS: LSORTS,
    BOARDS: BOARDS,
    SNAPSHOT: SNAPSHOT, LB_SNAPSHOT: LSNAP,
    staleDays: staleDays, lbStaleDays: lbStaleDays
  };
})(typeof window !== 'undefined' ? window : this);
