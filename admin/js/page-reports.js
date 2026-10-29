/* 举报处理：这是「通知通道」的后半段。
   前半段（routes/reports.js）已经能被任何人提交，所以这一页从上线第一天起就会有真实数据进来。
   设计上刻意做了两件事：
   ① 列表默认按时间倒序而不是按状态分组 —— 举报是「先到先处理」的工作，堆积本身就是要看的信号；
   ② 「下架被举报对象」是一个单独的、带确认的按钮，因为它会直接改公开面（插件 status→hidden）。
   把它藏在抽屉里而不是放进列表行，是因为一次误点等于把一个真实项目的入口从站上摘掉。 */
import {
  api, esc, escAttr, fmt, icon, statusPill, emptyHTML, pagerHTML,
  bindPager, hasFilter, delegate, debounce, toast, promptDialog, confirmDialog,
  openDrawer, can,
} from './core.js';

const PAGE_SIZE = 20;
const STATUSES = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'handling', label: '处理中' },
  { key: 'resolved', label: '已处理' },
  { key: 'rejected', label: '不予处理' },
];

/* 对象类型的中文名：服务端只回 targetType 的机器值，翻译放在前端一处，
   后台表格与抽屉都读它，避免两处出现「plugin / 插件条目」这种不一致。 */
const TYPE_TEXT = {
  plugin: '插件条目',
  post: '动态',
  thread: '主题帖',
  comment: '评论',
  user: '用户',
};

const TARGETS = [
  { key: 'all', label: '全部对象' },
  { key: 'plugin', label: '插件条目' },
  { key: 'post', label: '动态' },
  { key: 'thread', label: '主题帖' },
  { key: 'comment', label: '评论' },
  { key: 'user', label: '用户' },
];

const state = {
  q: '', status: 'all', target: 'all', page: 1,
  items: [], counts: {}, total: 0,
};

let seq = 0;

function query() {
  return {
    q: state.q,
    status: state.status === 'all' ? '' : state.status,
    target: state.target === 'all' ? '' : state.target,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

function tabsHTML() {
  return '<div class="tabsbar">' +
    '<div class="grow"><div class="seg" role="tablist" aria-label="按处理状态筛选">' +
      STATUSES.map((s) => '<button type="button" role="tab" data-status="' + s.key + '" aria-selected="' + (state.status === s.key ? 'true' : 'false') + '">' +
        s.label + ' <span class="cnt" data-count="' + s.key + '">' + fmt.int((state.counts || {})[s.key] || 0) + '</span></button>').join('') +
    '</div></div>' +
    '<span class="muted tiny" data-role="result"></span>' +
  '</div>';
}

function shellHTML() {
  return '<section class="card list-card">' +
    '<div class="filterbar">' +
      '<div class="input-wrap search">' + icon('search') +
        '<input class="input" id="rp-q" type="search" placeholder="搜索说明、联系方式或处理备注" value="' + escAttr(state.q) + '" autocomplete="off">' +
      '</div>' +
      '<select class="select" id="rp-target" aria-label="按对象类型筛选">' +
        TARGETS.map((t) => '<option value="' + t.key + '"' + (state.target === t.key ? ' selected' : '') + '>' + t.label + '</option>').join('') +
      '</select>' +
      '<button class="btn btn--ghost btn--sm clear-btn' + (hasFilter(state.q, state.status, state.target) ? '' : ' hide') + '" type="button" data-act="clear">清空筛选</button>' +
    '</div>' +
    tabsHTML() +
    '<div class="tbl-wrap">' +
      '<table class="tbl">' +
        '<thead><tr>' +
          '<th class="col-id">ID</th>' +
          '<th style="width:130px">对象</th>' +
          '<th>被举报内容</th>' +
          '<th style="width:100px">理由</th>' +
          '<th style="width:96px">状态</th>' +
          '<th class="col-time" style="width:104px">提交</th>' +
          '<th class="col-acts" style="width:96px">操作</th>' +
        '</tr></thead>' +
        '<tbody data-role="rows"></tbody>' +
      '</table>' +
    '</div>' +
    '<div data-role="pager"></div>' +
  '</section>';
}

function rowHTML(r) {
  const typeText = TYPE_TEXT[r.targetType] || r.targetType;
  return '<tr data-id="' + r.id + '">' +
    '<td class="col-id mono">#' + r.id + '</td>' +
    '<td><div class="tiny">' + esc(typeText) + '</div>' +
      '<div class="tiny muted mono">#' + r.targetId + '</div></td>' +
    '<td><div class="clip-2"><b>' + esc(r.targetName || '（对象已删除）') + '</b></div>' +
      (r.detail ? '<div class="tiny muted mt-8">' + esc(r.detail.slice(0, 100)) + '</div>' : '') + '</td>' +
    '<td class="tiny">' + esc(r.reasonText || r.reason) + '</td>' +
    '<td>' + statusPill('report', r.status) + '</td>' +
    '<td class="col-time" title="' + escAttr(fmt.dateTime(r.createdAt)) + '">' + fmt.rel(r.createdAt) + '</td>' +
    '<td class="col-acts"><div class="acts">' +
      '<button class="icon-btn" type="button" data-row-act="view" data-id="' + r.id + '" title="查看" aria-label="查看举报 ' + r.id + '">' + icon('eye') + '</button>' +
      (r.targetLink ? '<a class="icon-btn" href="' + escAttr(r.targetLink) + '" title="打开被举报对象" aria-label="打开被举报对象">' + icon('external') + '</a>' : '') +
    '</div></td>' +
  '</tr>';
}

function rowsHTML(items) {
  if (!items.length) {
    return '<tr><td colspan="7" class="tbl-empty">' + emptyHTML({
      title: '没有符合条件的举报',
      text: hasFilter(state.q, state.status, state.target) ? '换个关键词或清空筛选试试。' : '还没有人提交过举报。这条通道一直开着，不用等它有数据才维护。',
      action: hasFilter(state.q, state.status, state.target) ? { label: '清空筛选', act: 'clear', kind: 'btn' } : null,
    }) + '</td></tr>';
  }
  return items.map(rowHTML).join('');
}

function skeletonRows() {
  return '<tr><td colspan="7" style="padding:10px 12px"><div class="skel-table">' +
    Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div></td></tr>';
}

function paint(el, data) {
  state.items = data.items || [];
  state.counts = data.counts || {};
  state.total = Number(data.total) || 0;

  const rows = el.querySelector('[data-role="rows"]');
  if (rows) rows.innerHTML = rowsHTML(state.items);
  const pager = el.querySelector('[data-role="pager"]');
  if (pager) pager.innerHTML = pagerHTML(data.page || state.page, state.total, data.pageSize || PAGE_SIZE);
  STATUSES.forEach((s) => {
    const c = el.querySelector('[data-count="' + s.key + '"]');
    if (c) c.textContent = fmt.int(state.counts[s.key] || 0);
  });
  const result = el.querySelector('[data-role="result"]');
  if (result) result.textContent = '共 ' + fmt.int(state.total) + ' 条';
}

async function fetchAndPaint(el) {
  const my = ++seq;
  const rows = el.querySelector('[data-role="rows"]');
  if (rows) rows.innerHTML = skeletonRows();
  try {
    const data = await api('/reports', { query: query() });
    if (my !== seq) return;
    state.page = Number(data.page) || state.page;
    paint(el, data);
  } catch (e) {
    if (my !== seq) return;
    const r = el.querySelector('[data-role="rows"]');
    if (r) r.innerHTML = '<tr><td colspan="7" class="tbl-empty">' + emptyHTML({ icon: 'alert', title: '举报没能加载出来', text: (e && e.message) || '接口暂时没有响应，请稍后重试。', action: { label: '重新加载', act: 'retry', kind: 'btn' } }) + '</td></tr>';
  }
}

/* ── 抽屉 ── */
function drawerBody(r) {
  const typeText = TYPE_TEXT[r.targetType] || r.targetType;
  return '<section class="d-sec">' +
      '<h4>举报内容 <span class="h4-act mono">#' + r.id + '</span></h4>' +
      '<div class="post-exif">' + statusPill('report', r.status) +
        '<span class="pill pill--plain">' + esc(r.reasonText || r.reason) + '</span>' +
        '<span class="pill pill--plain">' + esc(fmt.dateTime(r.createdAt)) + '</span></div>' +
      '<div class="post-text" style="margin-top:10px">' + esc(r.detail || '（举报人没有写补充说明）') + '</div>' +
    '</section>' +
    '<section class="d-sec"><h4>被举报对象</h4>' +
      '<dl class="kv-list">' +
        '<div class="kv-row"><dt>类型</dt><dd>' + esc(typeText) + '</dd></div>' +
        '<div class="kv-row"><dt>编号</dt><dd class="mono">#' + r.targetId + '</dd></div>' +
        '<div class="kv-row"><dt>名称</dt><dd>' + esc(r.targetName || '（对象已删除）') + '</dd></div>' +
        (r.targetLink ? '<div class="kv-row"><dt>链接</dt><dd><a href="' + escAttr(r.targetLink) + '" target="_blank" rel="noopener noreferrer">在站点查看</a></dd></div>' : '') +
      '</dl></section>' +
    '<section class="d-sec"><h4>举报人</h4>' +
      '<dl class="kv-list">' +
        '<div class="kv-row"><dt>账号</dt><dd>' + (r.userId ? esc(r.userName || ('用户 #' + r.userId)) : '匿名（未登录提交）') + '</dd></div>' +
        '<div class="kv-row"><dt>联系方式</dt><dd>' + esc(r.contact || '未留') + '</dd></div>' +
      '</dl></section>' +
    (r.handledAt ? '<section class="d-sec"><h4>上次处理</h4>' +
      '<div class="review-row"><span class="rev-dot ' + (r.status === 'rejected' ? 'rev-dot--rose' : 'rev-dot--ok') + '"></span>' +
      '<div class="rev-txt"><b>' + esc(statusText(r.status)) + '</b>' + (r.handleNote ? '<br>' + esc(r.handleNote) : '') + '</div>' +
      '<time>' + fmt.rel(r.handledAt) + '</time></div></section>' : '') +
    (can('report.edit') ? '<section class="d-sec"><h4>处理</h4>' +
      '<div class="field"><label for="rp-note">处理说明（内部留档，不公开）</label>' +
      '<textarea class="textarea" id="rp-note" maxlength="500" placeholder="例如：已联系作者删除侵权内容；或：核实后不构成侵权，理由……">' + esc(r.handleNote || '') + '</textarea>' +
      '<div class="hint">最多 500 字。监管或作者回访时，这条说明就是处理依据。</div></div>' +
      '<div class="row mt-8" style="gap:8px">' +
        '<button class="btn" type="button" data-drawer-act="handling">标记处理中</button>' +
        '<button class="btn btn--ok" type="button" data-drawer-act="resolved">' + icon('check') + '已处理</button>' +
        '<button class="btn btn--danger" type="button" data-drawer-act="rejected">' + icon('xCircle') + '不予处理</button>' +
      '</div>' +
      (r.targetType === 'plugin' && can('plugin.edit') ?
        '<div class="mt-8"><button class="btn btn--danger" type="button" data-drawer-act="hide-target">' + icon('trash') + '下架这个插件条目</button>' +
        '<div class="hint">会同时把条目 status 改成「已下架」，它立刻从公开条目库消失。</div></div>' : '') +
    '</section>' : '');
}

function statusText(s) {
  const m = { open: '待处理', handling: '处理中', resolved: '已处理', rejected: '不予处理' };
  return m[s] || s;
}

function openReportDrawer(id, opts) {
  const o = opts || {};
  const d = openDrawer({
    title: '举报 #' + id,
    subtitle: '<span class="muted">正在读取…</span>',
    wide: true,
    body: '<div class="skel-table">' + Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div>',
    footer: '<button class="btn" type="button" data-close="1">关闭</button>',
  });
  let report = null;
  const changed = () => { if (typeof o.onChanged === 'function') o.onChanged(); };

  report = (state.items || []).filter((x) => x.id === Number(id))[0] || null;
  if (report) {
    d.setTitle('举报 #' + report.id);
    d.setSubtitle('<span class="muted">' + esc(TYPE_TEXT[report.targetType] || report.targetType) + ' · ' + esc(fmt.dateTime(report.createdAt)) + '</span>');
    d.setBody(drawerBody(report));
  } else {
    d.setBody('<div class="empty"><h3>这条举报没能打开</h3><p>刷新列表后再试。</p></div>');
  }

  const getNote = () => {
    const t = d.body.querySelector('#rp-note');
    return t ? t.value.trim() : '';
  };

  d.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-drawer-act]');
    if (!b || !report) return;
    const act = b.getAttribute('data-drawer-act');
    const note = getNote();

    if (act === 'hide-target') {
      const ok = await confirmDialog({
        title: '下架条目 #' + report.targetId,
        message: '这个条目会立刻从公开条目库与条目页消失。<br><br><span class="muted">' + esc(report.targetName || '') + '</span><br><br>这条举报会同时被标记为已处理。',
        danger: true, okText: '下架并结案',
      });
      if (!ok) return;
      b.disabled = true;
      try {
        await api('/reports/' + report.id + '/hide-target', { method: 'POST', body: { note: note } });
        toast('已下架条目 #' + report.targetId + '，举报已结案', 'ok');
        changed();
        d.close();
      } catch (e) { toast((e && e.message) || '下架没有成功', 'err'); b.disabled = false; }
      return;
    }

    b.disabled = true;
    try {
      await api('/reports/' + report.id, { method: 'PATCH', body: { status: act, note: note } });
      toast('已标记为' + statusText(act), 'ok');
      changed();
      d.close();
    } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); b.disabled = false; }
  });
}

export default {
  name: 'reports',
  title: '举报处理',
  perm: 'report.view',
  desc: '侵权 / 恶意代码 / 信息失实的通知与处理留档',
  async render(el, ctx) {
    const ps = ctx.params || {};
    if (ps.status && STATUSES.some((s) => s.key === ps.status)) state.status = ps.status;
    state.page = 1;

    el.innerHTML = shellHTML();
    await fetchAndPaint(el);

    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
    ctx.cleanup(() => offs.forEach((f) => { try { f(); } catch (e) {} }));

    const search = el.querySelector('#rp-q');
    const onSearch = debounce(() => {
      state.q = search.value.trim();
      state.page = 1;
      syncClear(el);
      fetchAndPaint(el);
    }, 320);
    if (search) { search.addEventListener('input', onSearch); off(() => search.removeEventListener('input', onSearch)); }

    off(delegate(el, 'change', '#rp-target', (ev, sel) => {
      state.target = sel.value;
      state.page = 1;
      syncClear(el);
      fetchAndPaint(el);
    }));

    off(delegate(el, 'click', '[data-status]', (ev, btn) => {
      const s = btn.getAttribute('data-status');
      if (s === state.status) return;
      state.status = s;
      state.page = 1;
      el.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      syncClear(el);
      fetchAndPaint(el);
    }));

    const clear = () => {
      state.q = ''; state.status = 'all'; state.target = 'all'; state.page = 1;
      const q = el.querySelector('#rp-q'); if (q) q.value = '';
      const t = el.querySelector('#rp-target'); if (t) t.value = 'all';
      el.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', b.getAttribute('data-status') === 'all' ? 'true' : 'false'));
      syncClear(el);
      fetchAndPaint(el);
    };
    off(delegate(el, 'click', '[data-act="clear"], [data-empty-act="clear"]', clear));
    off(delegate(el, 'click', '[data-empty-act="retry"]', () => fetchAndPaint(el)));

    off(delegate(el, 'click', '[data-row-act="view"]', (ev, btn) => {
      openReportDrawer(Number(btn.getAttribute('data-id')), { onChanged: () => fetchAndPaint(el) });
    }));

    off(delegate(el, 'click', 'tbody tr[data-id]', (ev, tr) => {
      if (ev.target.closest('button,input,a,label')) return;
      openReportDrawer(Number(tr.getAttribute('data-id')), { onChanged: () => fetchAndPaint(el) });
    }));

    off(bindPager(el, (p) => { state.page = p; fetchAndPaint(el); }));
    syncClear(el);
  },
};

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (!btn) return;
  btn.classList.toggle('hide', !hasFilter(state.q, state.status, state.target));
}
