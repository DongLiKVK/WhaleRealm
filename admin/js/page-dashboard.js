/* 工作台：一屏回答"现在怎么样、哪里需要我动手"。
   动线是：先看四个数 → 看趋势 → 处理待审队列 → 查最近谁做了什么。
   所有交互都走事件委托，页面重渲染后不需要重新绑事件。 */
import {
  api, esc, escAttr, fmt, icon, avatar, statusPill, emptyHTML, delegate,
  toast, promptDialog, store, emit,
} from './core.js';
import { openPostDrawer } from './page-posts.js';

const SERIES = [
  { key: 'posts', label: '新帖子', color: '#1775c8' },
  { key: 'users', label: '新用户', color: '#0a9a72' },
  { key: 'rewards', label: '奖励发放', color: '#c98a15' },
];

const state = {
  days: 7,
  hidden: {},          // 图例关掉的系列：只影响显示，不影响数据
  overview: null,
};

function greet() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function skeletonHTML() {
  return '<div class="skel-page" aria-hidden="true">' +
    '<div class="skel-row" style="width:210px;height:22px"></div>' +
    '<div class="kpis">' + Array.from({ length: 4 }).map(() => '<div class="skel skel-card" style="height:110px"></div>').join('') + '</div>' +
    '<div class="dash-grid">' +
      '<div class="skel skel-card" style="height:300px"></div>' +
      '<div class="skel skel-card" style="height:300px"></div>' +
    '</div>' +
    '<div class="dash-grid">' +
      '<div class="skel skel-card" style="height:230px"></div>' +
      '<div class="skel skel-card" style="height:230px"></div>' +
    '</div>' +
  '</div>';
}

/* ── 趋势图：手写 SVG。没有图表库，坐标全在这里算 ── */
function niceStep(raw) {
  const n = Math.max(1, raw);
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const unit = n / pow;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * pow;
}

function buildChart(wrap, series, hidden) {
  const W = Math.max(300, Math.round(wrap.clientWidth - 28));
  const H = 196;
  const padL = 36;
  const padR = 16;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.length;
  if (!n) return '<div class="empty chart-empty"><p>这段时间还没有数据</p></div>';

  const vals = [];
  series.forEach((d) => SERIES.forEach((s) => vals.push(Number(d[s.key]) || 0)));
  const top = Math.max(1, niceStep(Math.max.apply(null, vals) / 4) * 4);
  const xAt = (i) => (n === 1 ? padL + innerW / 2 : padL + innerW * i / (n - 1));
  const yAt = (v) => padT + innerH - innerH * (Number(v) || 0) / top;

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const y = padT + innerH - innerH * i / 4;
    const v = top * i / 4;
    grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"></line>' +
      '<text x="' + (padL - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt.short(v)) + '</text>';
  }

  const labelIdx = [];
  const want = Math.min(6, n);
  for (let i = 0; i < want; i += 1) labelIdx.push(Math.round(i * (n - 1) / Math.max(1, want - 1)));
  let axis = '';
  labelIdx.filter((v, i, a) => a.indexOf(v) === i).forEach((i) => {
    const d = String(series[i].date || '');
    axis += '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(d.slice(5)) + '</text>';
  });

  let paths = '';
  SERIES.forEach((s) => {
    if (hidden[s.key]) return;
    const pts = series.map((d, i) => xAt(i).toFixed(1) + ',' + yAt(d[s.key]).toFixed(1));
    if (s.key === 'posts') {
      const area = 'M' + xAt(0).toFixed(1) + ',' + (padT + innerH) + ' L' + pts.join(' L') +
        ' L' + xAt(n - 1).toFixed(1) + ',' + (padT + innerH) + ' Z';
      paths += '<path class="chart-area" d="' + area + '" fill="' + s.color + '"></path>';
    }
    paths += '<path class="chart-line" d="M' + pts.join(' L') + '" stroke="' + s.color + '"></path>';
    if (n <= 14) {
      series.forEach((d, i) => {
        paths += '<circle class="chart-dot" cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(d[s.key]).toFixed(1) + '" r="2.4" fill="' + s.color + '"></circle>';
      });
    } else {
      const last = n - 1;
      paths += '<circle class="chart-dot" cx="' + xAt(last).toFixed(1) + '" cy="' + yAt(series[last][s.key]).toFixed(1) + '" r="2.8" fill="' + s.color + '"></circle>';
    }
  });

  let hits = '';
  const step = n === 1 ? innerW : innerW / (n - 1);
  series.forEach((d, i) => {
    hits += '<rect x="' + (xAt(i) - step / 2).toFixed(1) + '" y="' + padT + '" width="' + step.toFixed(1) + '" height="' + innerH + '" fill="transparent" data-ci="' + i + '"></rect>';
  });

  wrap.innerHTML =
    '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="最近 ' + n + ' 天帖子、用户与奖励的数量变化">' +
      '<g class="chart-grid">' + grid + '</g>' +
      '<g class="chart-axis">' + axis + '</g>' +
      '<g class="chart-body">' + paths + '</g>' +
      '<g class="chart-hit">' + hits + '</g>' +
    '</svg>' +
    '<div class="chart-hover" aria-hidden="true"><div class="chart-tip"></div></div>';
  return '';
}

function tipHTML(d, hidden) {
  const date = String(d.date || '');
  let rows = '';
  SERIES.forEach((s) => {
    if (hidden[s.key]) return;
    rows += '<div class="ct-row"><span><i class="ct-dot" style="background:' + s.color + '"></i>' + s.label + '</span><b>' + fmt.int(d[s.key]) + '</b></div>';
  });
  return '<div class="ct-date">' + esc(date) + '</div>' + rows;
}

function mountChart(wrap, series) {
  buildChart(wrap, series, state.hidden);
  const svg = wrap.querySelector('.chart-svg');
  const hover = wrap.querySelector('.chart-hover');
  const tip = hover && hover.querySelector('.chart-tip');
  if (!svg || !hover || !tip) return;
  const move = (ev) => {
    const hit = ev.target.closest('[data-ci]');
    if (!hit) { hover.classList.remove('is-on'); return; }
    const i = Number(hit.getAttribute('data-ci'));
    const d = series[i];
    if (!d) return;
    tip.innerHTML = tipHTML(d, state.hidden);
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / svg.viewBox.baseVal.width;
    const box = hit.getBoundingClientRect();
    const cx = box.left - rect.left + box.width / 2;
    const cy = box.top - rect.top + 8;
    hover.style.left = cx + 'px';
    hover.style.top = cy + 'px';
    hover.classList.add('is-on');
    void scale;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => hover.classList.remove('is-on'));
  wrap._repaint = () => buildChart(wrap, series, state.hidden);
}

/* ── 各区块 ── */
function kpiHTML(k) {
  const pendingPct = fmt.pct(k.pending, k.posts);
  const oldest = (state.overview.pendingPreview || []).reduce((min, p) => {
    const t = Number(p.createdAt) || 0;
    return min && min < t ? min : t;
  }, 0);
  const waitH = oldest ? Math.max(0, Math.floor((Date.now() / 1000 - oldest) / 3600)) : 0;
  return '<div class="kpis">' +
    '<article class="kpi">' +
      '<div class="kpi-hd"><span class="kpi-label">帖子总数</span><span class="kpi-ico">' + icon('posts') + '</span></div>' +
      '<div class="kpi-num">' + fmt.short(k.posts) + '<small>条</small></div>' +
      '<div class="kpi-note"><span class="up">今日 +' + fmt.int(k.postsToday) + '</span><span>·</span><span>全部内容</span></div>' +
    '</article>' +
    '<article class="kpi">' +
      '<div class="kpi-hd"><span class="kpi-label">待审核</span><span class="kpi-ico">' + icon('inbox') + '</span></div>' +
      '<div class="kpi-num">' + fmt.int(k.pending) + '<small>条</small></div>' +
      '<div class="kpi-note">' + (k.pending ? '<span class="down">需要处理</span><span>·</span><span>' + (waitH >= 1 ? '最久已等 ' + waitH + ' 小时' : '刚刚进来') + '</span>' : '<span class="up">队列已清空</span>') + '</div>' +
      '<div class="kpi-meter kpi-meter--warn"><i style="width:' + Math.max(k.pending ? 4 : 0, pendingPct) + '%"></i></div>' +
    '</article>' +
    '<article class="kpi">' +
      '<div class="kpi-hd"><span class="kpi-label">用户总数</span><span class="kpi-ico">' + icon('users') + '</span></div>' +
      '<div class="kpi-num">' + fmt.short(k.users) + '<small>人</small></div>' +
      '<div class="kpi-note"><span class="up">今日 +' + fmt.int(k.usersToday) + '</span><span>·</span><span>已禁用 <b>' + fmt.int(k.disabledUsers) + '</b></span></div>' +
    '</article>' +
    '<article class="kpi">' +
      '<div class="kpi-hd"><span class="kpi-label">今日奖励</span><span class="kpi-ico">' + icon('rewards') + '</span></div>' +
      '<div class="kpi-num">' + fmt.int(k.rewardsToday) + '<small>次</small></div>' +
      '<div class="kpi-note"><span>累计发放</span><b>' + fmt.short(k.pointsGranted) + '</b><span>积分</span></div>' +
    '</article>' +
  '</div>';
}

function queueHTML(o) {
  const list = o.pendingPreview || [];
  let body = '';
  if (!list.length) {
    body = emptyHTML({ title: '待审核队列是空的', text: '有人发帖时会出现在这里，也可以直接去帖子管理主动翻一遍。' });
  } else {
    body = list.map((p) => {
      const a = p.author || {};
      return '<div class="queue-item" data-open-post="' + p.id + '" tabindex="0" role="button">' +
        avatar(a, 'avatar--sm') +
        '<div class="q-main">' +
          '<div class="q-txt">' + esc(p.text || '（无正文）') + '</div>' +
          '<div class="q-meta"><span>#' + p.id + '</span><span>' + esc(a.name || '匿名') + '</span><span>' + fmt.rel(p.createdAt) + '</span></div>' +
        '</div>' +
        '<div class="q-acts">' +
          '<button class="btn btn--ok btn--sm" type="button" data-q-act="approve" data-id="' + p.id + '">通过</button>' +
          '<button class="btn btn--danger btn--sm" type="button" data-q-act="reject" data-id="' + p.id + '">驳回</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  return '<section class="card">' +
    '<div class="card-hd"><h2>待审核 <span class="pill pill--pending">' + fmt.int(o.kpis.pending) + '</span></h2>' +
      '<a class="btn btn--ghost btn--sm" href="#/posts?status=pending">查看全部</a></div>' +
    '<div class="card-bd flush">' + body + '</div>' +
  '</section>';
}

function logsHTML(o) {
  const list = o.recentLogs || [];
  const body = list.length
    ? '<div class="tl">' + list.map((l) => '<div class="tl-item' + (l.result === 'fail' ? ' tl-item--rose' : '') + '">' +
        '<div class="tl-top"><span class="tl-name">' + esc(l.adminName || '系统') + '<span class="muted tiny"> · ' + esc(l.actionLabel || l.action) + '</span></span>' +
        '<span class="tl-time">' + fmt.rel(l.createdAt) + '</span></div>' +
        '<div class="tl-desc">' + esc(l.summary || '') + '</div>' +
      '</div>').join('') + '</div>'
    : emptyHTML({ title: '还没有操作记录', text: '管理员登录、审核与发放都会留下记录。' });
  return '<section class="card">' +
    '<div class="card-hd"><h2>最近操作</h2><a class="btn btn--ghost btn--sm" href="#/logs">全部日志</a></div>' +
    '<div class="card-bd flush">' + body + '</div>' +
  '</section>';
}

function barsHTML(o) {
  const list = (o.actionBars || []).slice(0, 6);
  const max = list.reduce((m, x) => Math.max(m, Number(x.count) || 0), 1);
  const body = list.length
    ? '<div class="bars">' + list.map((x) => '<div class="bar-row">' +
        '<span class="bl" title="' + escAttr(x.label || x.action) + '">' + esc(x.label || x.action) + '</span>' +
        '<span class="bar-track"><i class="bar-fill" style="width:' + Math.max(2, Math.round((Number(x.count) || 0) / max * 100)) + '%"></i></span>' +
        '<span class="bv">' + fmt.int(x.count) + '</span>' +
      '</div>').join('') + '</div>'
    : emptyHTML({ title: '近 7 天没有动作', text: '有审核、发放或账号变更时，这里会按动作聚合。' });
  return '<section class="card">' +
    '<div class="card-hd"><h2>动作分布</h2><span class="muted tiny">近 7 天</span></div>' +
    '<div class="card-bd flush">' + body + '</div>' +
  '</section>';
}

function rewardsHTML(o) {
  const list = o.recentRewards || [];
  const body = list.length
    ? list.map((r) => {
        const u = r.user || {};
        return '<div class="recent-reward">' + avatar(u, 'avatar--sm') +
          '<div class="rr-main"><b>' + esc(u.name || '用户 #' + r.userId) + '</b>' +
          '<small>' + esc(r.reason || '') + ' · ' + fmt.rel(r.grantedAt) + '</small></div>' +
          '<span class="rr-amt">' + (r.type === 'points' ? '+' + fmt.int(r.amount) + ' 积分' : r.type === 'days' ? '+' + fmt.int(r.amount) + ' 天' : '自定义') + '</span>' +
        '</div>';
      }).join('')
    : emptyHTML({ title: '还没有发放记录', text: '在「奖励发放」里给活跃用户一点积分或会员天数。' });
  return '<section class="card">' +
    '<div class="card-hd"><h2>最近奖励</h2><a class="btn btn--ghost btn--sm" href="#/rewards">去发放</a></div>' +
    '<div class="card-bd flush">' + body + '</div>' +
  '</section>';
}

function viewHTML(o) {
  const k = o.kpis || {};
  const admin = store.admin || {};
  const now = new Date();
  const hourMin = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return '<header class="page-hd">' +
      '<div><h1>' + greet() + '，' + esc(admin.name || '管理员') + '</h1>' +
      '<p class="desc">今天有 <b>' + fmt.int(k.pending) + '</b> 条帖子等审核，<b>' + fmt.int(k.usersToday) + '</b> 位新成员加入。数据截至 ' + hourMin + '。</p></div>' +
      '<div class="page-hd-actions">' +
        '<button class="btn btn--primary" type="button" data-go="posts" data-params="status=pending">' + icon('inbox') + '去审核</button>' +
      '</div>' +
    '</header>' +
    kpiHTML(k) +
    '<div class="dash-grid">' +
      '<section class="card chart-card">' +
        '<div class="card-hd"><h2>增长趋势</h2>' +
          '<div class="seg" role="group" aria-label="时间范围">' +
            [7, 14, 30].map((d) => '<button type="button" data-days="' + d + '" aria-selected="' + (state.days === d ? 'true' : 'false') + '">' + d + ' 天</button>').join('') +
          '</div>' +
        '</div>' +
        '<div class="chart-wrap"></div>' +
        '<div class="chart-legend">' +
          SERIES.map((s) => '<button class="legend-btn" type="button" data-legend="' + s.key + '" aria-pressed="' + (state.hidden[s.key] ? 'false' : 'true') + '"><i style="background:' + s.color + '"></i>' + s.label + '</button>').join('') +
        '</div>' +
      '</section>' +
      queueHTML(o) +
    '</div>' +
    '<div class="dash-grid">' +
      logsHTML(o) +
      '<div class="col" style="gap:16px">' + barsHTML(o) + rewardsHTML(o) + '</div>' +
    '</div>';
}

function bind(el, ctx) {
  const offs = [];
  const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
  ctx.cleanup(() => offs.forEach((f) => { try { f(); } catch (e) {} }));

  /* 天数切换：重新取数，但保留当前选择，回来时还是 30 天 */
  off(delegate(el, 'click', '[data-days]', (ev, btn) => {
    const d = Number(btn.getAttribute('data-days'));
    if (!d || d === state.days) return;
    state.days = d;
    ctx.refresh();
  }));

  /* 图例：只重画图，不动整页 */
  off(delegate(el, 'click', '[data-legend]', (ev, btn) => {
    const key = btn.getAttribute('data-legend');
    state.hidden[key] = !state.hidden[key];
    btn.setAttribute('aria-pressed', state.hidden[key] ? 'false' : 'true');
    const wrap = el.querySelector('.chart-wrap');
    if (wrap && wrap._repaint) wrap._repaint();
  }));

  off(delegate(el, 'click', '[data-q-act]', async (ev, btn) => {
    const id = Number(btn.getAttribute('data-id'));
    const act = btn.getAttribute('data-q-act');
    const row = btn.closest('.queue-item');
    let note = '';
    if (act === 'reject') {
      note = await promptDialog({
        title: '驳回帖子 #' + id,
        label: '驳回原因（用户能看到）',
        multiline: true, min: 2, maxlength: 200,
        placeholder: '例如：内容与社区主题无关，或含有外部广告。',
        danger: true, okText: '驳回',
      });
      if (note == null) return;
    }
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await api('/posts/' + id + '/review', { method: 'POST', body: { decision: act === 'approve' ? 'approve' : 'reject', note } });
      toast(act === 'approve' ? '已通过 #' + id : '已驳回 #' + id, 'ok');
      if (row) {
        row.style.transition = 'opacity .18s ease';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 180);
      }
      const num = el.querySelector('.pill--pending');
      const left = Math.max(0, Number((num && num.textContent || '0').replace(/[^\d]/g, '')) - 1);
      if (num) num.textContent = String(left);
      const kpiNum = el.querySelectorAll('.kpi-num')[1];
      if (kpiNum) kpiNum.innerHTML = left + '<small>条</small>';
      emit('data:changed', { kind: 'post' });
    } catch (e) {
      toast(e && e.message ? e.message : '操作没有成功', 'err');
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }));

  off(delegate(el, 'click', '[data-open-post]', (ev, row) => {
    if (ev.target.closest('button')) return;
    openPostDrawer(Number(row.getAttribute('data-open-post')), { onChanged: () => ctx.refresh() });
  }));
  off(delegate(el, 'keydown', '.queue-item', (ev, row) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.target.closest('button')) return;
    ev.preventDefault();
    openPostDrawer(Number(row.getAttribute('data-open-post')), { onChanged: () => ctx.refresh() });
  }));

  off(delegate(el, 'click', '[data-go]', (ev, btn) => {
    ctx.go(btn.getAttribute('data-go'), { status: btn.getAttribute('data-params') || undefined });
  }));

  /* 窗口宽度变了要重算 viewBox，否则折线会被拉变形 */
  let rt = null;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const wrap = el.querySelector('.chart-wrap');
      if (wrap && wrap._repaint) wrap._repaint();
    }, 160);
  };
  window.addEventListener('resize', onResize);
  off(() => { clearTimeout(rt); window.removeEventListener('resize', onResize); });
}

export default {
  name: 'dashboard',
  title: '工作台',
  perm: 'dashboard.view',
  async render(el, ctx) {
    el.innerHTML = skeletonHTML();
    const data = await api('/stats/overview', { query: { days: state.days } });
    state.overview = data;
    el.innerHTML = viewHTML(data);
    const wrap = el.querySelector('.chart-wrap');
    if (wrap) mountChart(wrap, data.series || []);
    bind(el, ctx);
  },
};
