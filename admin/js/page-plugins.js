/* 插件审核：条目库是本站最大的一块内容（6700+ 条），它的「上架 / 驳回 / 下架」
   就是公开面还在不在的开关 —— status 一旦不是 published，/api/plugins 与条目页
   都会立刻看不到它。所以这页的操作按钮全部要二次确认或写明理由，
   误点一次等于把一个真实项目的入口从站上摘掉。

   为什么表格不做「删除」：条目是索引数据（slug / stars / license 都指向真实仓库），
   物理删除后同一 slug 重新提交会撞 UNIQUE，而下架只需要它在公开面消失。
   所以这一页只有三个动作：上架、驳回、下架。 */
import {
  api, esc, escAttr, fmt, icon, statusPill, emptyHTML, pagerHTML,
  bindPager, hasFilter, delegate, debounce, toast, promptDialog, confirmDialog,
  openDrawer, can, clip,
} from './core.js';

const PAGE_SIZE = 20;
const STATUSES = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已上架' },
  { key: 'pending', label: '待审核' },
  { key: 'rejected', label: '已驳回' },
  { key: 'hidden', label: '已下架' },
];

/* 筛选条件放模块级：去别的页面处理完事回来，视野还停在原来的位置 */
const state = {
  q: '', status: 'all', sort: 'new', cat: '', page: 1,
  items: [], counts: {}, total: 0, selected: new Set(), cats: [],
};

let seq = 0;

function query() {
  return {
    q: state.q,
    status: state.status === 'all' ? '' : state.status,
    sort: state.sort === 'new' ? '' : state.sort,
    cat: state.cat,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

function tabsHTML() {
  return '<div class="tabsbar">' +
    '<div class="grow"><div class="seg" role="tablist" aria-label="按审核状态筛选">' +
      STATUSES.map((s) => '<button type="button" role="tab" data-status="' + s.key + '" aria-selected="' + (state.status === s.key ? 'true' : 'false') + '">' +
        s.label + ' <span class="cnt" data-count="' + s.key + '">' + fmt.int((state.counts || {})[s.key] || 0) + '</span></button>').join('') +
    '</div></div>' +
    '<span class="muted tiny" data-role="result"></span>' +
  '</div>';
}

function catOptions() {
  if (!state.cats.length) return '<option value="">全部分类</option>';
  return '<option value="">全部分类</option>' + state.cats.map((c) =>
    '<option value="' + escAttr(c.cat) + '"' + (state.cat === c.cat ? ' selected' : '') + '>' +
    esc(c.cat || '未分类') + '（' + fmt.int(c.count) + '）</option>').join('');
}

function shellHTML() {
  return '<section class="card list-card">' +
    '<div class="filterbar">' +
      '<div class="input-wrap search">' + icon('search') +
        '<input class="input" id="pg-q" type="search" placeholder="搜索包名、简介、标签或仓库" value="' + escAttr(state.q) + '" autocomplete="off">' +
      '</div>' +
      '<select class="select" id="pg-cat" aria-label="按分类筛选">' + catOptions() + '</select>' +
      '<select class="select" id="pg-sort" aria-label="排序方式">' +
        '<option value="new"' + (state.sort === 'new' ? ' selected' : '') + '>最近更新</option>' +
        '<option value="hot"' + (state.sort === 'hot' ? ' selected' : '') + '>热门优先</option>' +
        '<option value="stars"' + (state.sort === 'stars' ? ' selected' : '') + '>星标最多</option>' +
      '</select>' +
      '<button class="btn btn--ghost btn--sm clear-btn' + (hasFilter(state.q, state.cat, state.status, state.sort === 'new' ? '' : state.sort) ? '' : ' hide') + '" type="button" data-act="clear">清空筛选</button>' +
    '</div>' +
    tabsHTML() +
    '<div class="bulkbar" data-role="bulk" hidden>' +
      '<span class="bulk-n" data-role="bulk-n">已选 0 条</span>' +
      '<span class="spacer"></span>' +
      (can('plugin.edit') ? '<button class="btn btn--sm btn--ok" type="button" data-bulk="publish">批量上架</button>' +
        '<button class="btn btn--sm btn--danger" type="button" data-bulk="reject">批量驳回</button>' +
        '<button class="btn btn--sm" type="button" data-bulk="hide">批量下架</button>' : '') +
      '<button class="btn btn--sm btn--ghost" type="button" data-bulk="clear">取消选择</button>' +
    '</div>' +
    '<div class="tbl-wrap">' +
      '<table class="tbl">' +
        '<thead><tr>' +
          '<th class="select-col"><input class="checkbox" type="checkbox" data-role="check-all" aria-label="全选本页"></th>' +
          '<th class="col-id">ID</th>' +
          '<th>条目</th>' +
          '<th style="width:130px">分类</th>' +
          '<th style="width:86px">星标</th>' +
          '<th style="width:92px">状态</th>' +
          '<th class="col-time" style="width:104px">更新</th>' +
          '<th class="col-acts" style="width:128px">操作</th>' +
        '</tr></thead>' +
        '<tbody data-role="rows"></tbody>' +
      '</table>' +
    '</div>' +
    '<div data-role="pager"></div>' +
  '</section>';
}

function rowHTML(p) {
  const checked = state.selected.has(p.id);
  return '<tr data-id="' + p.id + '"' + (checked ? ' class="is-selected"' : '') + '>' +
    '<td class="select-col"><input class="checkbox" type="checkbox" data-check="' + p.id + '"' + (checked ? ' checked' : '') + ' aria-label="选择条目 ' + escAttr(p.slug) + '"></td>' +
    '<td class="col-id mono">#' + p.id + '</td>' +
    '<td><div class="clip-2"><b>' + esc(p.slug) + '</b>' +
      (p.hot ? ' <span class="pill pill--brand">热门</span>' : '') +
      (p.claimed ? ' <span class="pill pill--published">已认领</span>' : '') + '</div>' +
      '<div class="tiny muted mt-8">' + esc(clip(p.desc || '（无简介）', 90)) + '</div></td>' +
    '<td class="tiny">' + esc(p.cat || '未分类') + '</td>' +
    '<td><div class="inter-cell"><span>' + icon('star') + fmt.int(p.stars) + '</span></div></td>' +
    '<td>' + statusPill('plugin', p.status) + '</td>' +
    '<td class="col-time" title="' + escAttr(fmt.dateTime(p.updatedAt)) + '">' + fmt.rel(p.updatedAt) + '</td>' +
    '<td class="col-acts"><div class="acts">' +
      '<button class="icon-btn" type="button" data-row-act="view" data-id="' + p.id + '" title="查看" aria-label="查看条目 ' + escAttr(p.slug) + '">' + icon('eye') + '</button>' +
      (can('plugin.edit') && p.status !== 'published' ? '<button class="icon-btn" type="button" data-row-act="publish" data-id="' + p.id + '" title="上架" aria-label="上架条目 ' + escAttr(p.slug) + '">' + icon('check') + '</button>' : '') +
      (can('plugin.edit') && p.status === 'published' ? '<button class="icon-btn" type="button" data-row-act="hide" data-id="' + p.id + '" title="下架" aria-label="下架条目 ' + escAttr(p.slug) + '">' + icon('trash') + '</button>' : '') +
    '</div></td>' +
  '</tr>';
}

function rowsHTML(items) {
  if (!items.length) {
    return '<tr><td colspan="8" class="tbl-empty">' + emptyHTML({
      title: '没有符合条件的条目',
      text: hasFilter(state.q, state.cat, state.status, state.sort === 'new' ? '' : state.sort) ? '换个关键词或清空筛选试试。' : '条目库还没有内容，先跑一次导入脚本。',
      action: hasFilter(state.q, state.cat, state.status, state.sort === 'new' ? '' : state.sort) ? { label: '清空筛选', act: 'clear', kind: 'btn' } : null,
    }) + '</td></tr>';
  }
  return items.map(rowHTML).join('');
}

function skeletonRows() {
  return '<tr><td colspan="8" style="padding:10px 12px"><div class="skel-table">' +
    Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div></td></tr>';
}

function paint(el, data) {
  state.items = data.items || [];
  state.counts = data.counts || {};
  state.total = Number(data.total) || 0;
  state.selected.clear();

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
  syncSelection(el);
}

function syncSelection(el) {
  const box = el.querySelector('[data-role="check-all"]');
  const n = state.selected.size;
  if (box) {
    const pageIds = state.items.map((p) => p.id);
    const picked = pageIds.filter((id) => state.selected.has(id)).length;
    box.checked = pageIds.length > 0 && picked === pageIds.length;
    box.indeterminate = picked > 0 && picked < pageIds.length;
  }
  const bar = el.querySelector('[data-role="bulk"]');
  const label = el.querySelector('[data-role="bulk-n"]');
  if (label) label.textContent = '已选 ' + n + ' 条';
  if (bar) bar.hidden = n === 0;
  el.querySelectorAll('tr[data-id]').forEach((tr) => {
    const on = state.selected.has(Number(tr.getAttribute('data-id')));
    tr.classList.toggle('is-selected', on);
    const cb = tr.querySelector('[data-check]');
    if (cb) cb.checked = on;
  });
}

async function fetchAndPaint(el) {
  const my = ++seq;
  const rows = el.querySelector('[data-role="rows"]');
  if (rows) rows.innerHTML = skeletonRows();
  try {
    const data = await api('/plugins', { query: query() });
    if (my !== seq) return;
    state.page = Number(data.page) || state.page;
    paint(el, data);
  } catch (e) {
    if (my !== seq) return;
    const r = el.querySelector('[data-role="rows"]');
    if (r) r.innerHTML = '<tr><td colspan="8" class="tbl-empty">' + emptyHTML({ icon: 'alert', title: '条目没能加载出来', text: (e && e.message) || '接口暂时没有响应，请稍后重试。', action: { label: '重新加载', act: 'retry', kind: 'btn' } }) + '</td></tr>';
  }
}

/* 分类下拉的数据只在第一次进入页面拉一次：6700 条的分组统计不贵，但也没必要每次翻页都拉 */
async function loadCats(el) {
  try {
    const r = await api('/plugins/cats');
    state.cats = (r && r.cats) || [];
    const sel = el.querySelector('#pg-cat');
    if (sel) sel.innerHTML = catOptions();
  } catch {
    state.cats = [];
  }
}

/* ── 抽屉：看完整信息 + 写理由改状态 ── */
function drawerBody(p) {
  return '<section class="d-sec">' +
      '<h4>条目 <span class="h4-act mono">#' + p.id + '</span></h4>' +
      '<div class="post-text">' + esc(p.desc || '（无简介）') + '</div>' +
      '<div class="post-exif">' + statusPill('plugin', p.status) +
        (p.hot ? '<span class="pill pill--brand">热门</span>' : '') +
        (p.claimed ? '<span class="pill pill--published">作者已认领</span>' : '<span class="pill pill--plain">未认领</span>') +
        '<span class="pill pill--plain">' + esc(fmt.dateTime(p.updatedAt)) + '</span></div>' +
    '</section>' +
    '<section class="d-sec"><h4>仓库与许可</h4>' +
      '<div class="kv-list">' +
        '<div class="kv"><span>包名</span><b class="mono">' + esc(p.slug) + '</b></div>' +
        '<div class="kv"><span>版本</span><b class="mono">' + esc(p.ver || '—') + '</b></div>' +
        '<div class="kv"><span>许可证</span><b>' + esc(p.license || '未声明') + '</b></div>' +
        '<div class="kv"><span>分类</span><b>' + esc(p.cat || '未分类') + '</b></div>' +
        '<div class="kv"><span>星标 / 安装</span><b>' + fmt.int(p.stars) + ' / ' + fmt.int(p.installs) + '</b></div>' +
        '<div class="kv"><span>仓库</span><b>' + (p.repo ? '<a href="' + escAttr(p.repo) + '" target="_blank" rel="noopener noreferrer">' + esc(clip(p.repo, 48)) + '</a>' : '—') + '</b></div>' +
        '<div class="kv"><span>标签</span><b>' + ((p.tags || []).length ? (p.tags || []).map((t) => '#' + esc(t)).join(' ') : '—') + '</b></div>' +
      '</div></section>' +
    (p.reviewNote || p.reviewedAt ? '<section class="d-sec"><h4>上次审核</h4>' +
      '<div class="review-row"><span class="rev-dot ' + (p.status === 'rejected' || p.status === 'hidden' ? 'rev-dot--rose' : 'rev-dot--ok') + '"></span>' +
      '<div class="rev-txt"><b>' + esc(statusText(p.status)) + '</b>' + (p.reviewNote ? '<br>' + esc(p.reviewNote) : '') + '</div>' +
      '<time>' + fmt.rel(p.reviewedAt) + '</time></div></section>' : '') +
    (can('plugin.edit') ? '<section class="d-sec"><h4>改审核状态</h4>' +
      '<div class="field"><label for="pv-pnote">理由（作者可见）</label>' +
      '<textarea class="textarea" id="pv-pnote" maxlength="200" placeholder="例如：描述中的能力指向境内明令禁止的用途。">' + esc(p.reviewNote || '') + '</textarea>' +
      '<div class="hint">最多 200 字。上架时可以不写，驳回或下架时建议写清楚。</div></div>' +
      '<div class="row mt-8" style="gap:8px">' +
        '<button class="btn btn--ok" type="button" data-drawer-act="publish">' + icon('check') + '上架</button>' +
        '<button class="btn btn--danger" type="button" data-drawer-act="reject">' + icon('xCircle') + '驳回</button>' +
        '<button class="btn" type="button" data-drawer-act="hide">' + icon('trash') + '下架</button>' +
      '</div></section>' : '');
}

function statusText(s) {
  const m = { published: '已上架', pending: '待审核', rejected: '已驳回', hidden: '已下架' };
  return m[s] || s;
}

function openPluginDrawer(id, opts) {
  const o = opts || {};
  const d = openDrawer({
    title: '条目 #' + id,
    subtitle: '<span class="muted">正在读取…</span>',
    wide: true,
    body: '<div class="skel-table">' + Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div>',
    footer: '<button class="btn" type="button" data-close="1">关闭</button>',
  });
  let plugin = null;
  const changed = () => { if (typeof o.onChanged === 'function') o.onChanged(); };

  /* 详情复用列表数据：/api/admin/plugins 没有单条详情接口，而列表项已经是完整整形，
     再为抽屉开一条 /plugins/:id 只会多一个要维护的契约。 */
  plugin = (state.items || []).filter((x) => x.id === Number(id))[0] || null;
  if (plugin) {
    d.setTitle('条目 #' + plugin.id);
    d.setSubtitle('<span class="muted mono">' + esc(plugin.slug) + '</span>');
    d.setBody(drawerBody(plugin));
  } else {
    api('/plugins', { query: { q: '', page: 1, pageSize: 100 } }).then((data) => {
      plugin = (data.items || []).filter((x) => x.id === Number(id))[0] || null;
      if (!plugin) { d.setBody('<div class="empty"><h3>这个条目没能打开</h3><p>刷新列表后再试。</p></div>'); return; }
      d.setTitle('条目 #' + plugin.id);
      d.setSubtitle('<span class="muted mono">' + esc(plugin.slug) + '</span>');
      d.setBody(drawerBody(plugin));
    }).catch((e) => {
      d.setBody('<div class="empty"><h3>这个条目没能打开</h3><p>' + esc((e && e.message) || '接口暂时没有响应。') + '</p></div>');
    });
  }

  const getNote = () => {
    const t = d.body.querySelector('#pv-pnote');
    return t ? t.value.trim() : '';
  };

  d.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-drawer-act]');
    if (!b || !plugin) return;
    const act = b.getAttribute('data-drawer-act');
    const next = act === 'publish' ? 'published' : (act === 'reject' ? 'rejected' : 'hidden');
    const note = getNote();
    if (next !== 'published' && note.length < 2) {
      toast('驳回或下架请写清楚理由（至少 2 个字），作者会看到', 'err');
      const t = d.body.querySelector('#pv-pnote'); if (t) t.focus();
      return;
    }
    b.disabled = true;
    try {
      await api('/plugins/' + plugin.id, { method: 'PATCH', body: { status: next, note: note } });
      toast('已' + statusText(next) + '：' + plugin.slug, 'ok');
      changed();
      d.close();
    } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); b.disabled = false; }
  });
}

/* ── 行内快捷操作 ── */
async function quickStatus(el, id, act) {
  let note = '';
  if (act !== 'publish') {
    note = await promptDialog({
      title: (act === 'reject' ? '驳回条目 #' : '下架条目 #') + id,
      label: '理由（作者可见）', multiline: true,
      min: 2, maxlength: 200,
      placeholder: '例如：描述中的能力指向境内明令禁止的用途，按站点规则下架。',
      danger: act === 'hide', okText: act === 'reject' ? '驳回' : '下架',
    });
    if (note == null) return;
  }
  const next = act === 'publish' ? 'published' : (act === 'reject' ? 'rejected' : 'hidden');
  try {
    await api('/plugins/' + id, { method: 'PATCH', body: { status: next, note: note } });
    toast('已' + statusText(next) + ' #' + id, 'ok');
    fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); }
}

/* ── 批量 ── */
async function bulk(el, act) {
  const ids = Array.from(state.selected);
  if (!ids.length) return;
  if (act === 'clear') { state.selected.clear(); syncSelection(el); return; }

  let note = '';
  if (act === 'publish') {
    const ok = await confirmDialog({ title: '批量上架', message: '将把选中的 <b>' + ids.length + '</b> 条标记为已上架，它们会立刻出现在公开条目库。', okText: '全部上架' });
    if (!ok) return;
  } else {
    note = await promptDialog({
      title: (act === 'reject' ? '批量驳回' : '批量下架'),
      label: '理由（' + ids.length + ' 条共用）', multiline: true,
      min: 2, maxlength: 200,
      placeholder: '写清楚原因，作者会收到这条说明。',
      danger: act === 'hide', okText: act === 'reject' ? '全部驳回' : '全部下架',
    });
    if (note == null) return;
  }

  try {
    const r = await api('/plugins/batch', { method: 'POST', body: { action: act, ids: ids, note: note } });
    toast('已处理 ' + fmt.int((r && r.changed) || ids.length) + ' 条', 'ok');
    state.selected.clear();
    fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '批量操作没有成功', 'err'); }
}

export default {
  name: 'plugins',
  title: '插件审核',
  perm: 'plugin.view',
  desc: '条目库的上架 / 驳回 / 下架；下架即从公开面消失',
  async render(el, ctx) {
    const ps = ctx.params || {};
    if (ps.status && STATUSES.some((s) => s.key === ps.status)) state.status = ps.status;
    if (typeof ps.q === 'string' && ps.q) state.q = ps.q;
    state.page = 1;

    el.innerHTML = shellHTML();
    await fetchAndPaint(el);
    loadCats(el);

    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
    ctx.cleanup(() => offs.forEach((f) => { try { f(); } catch (e) {} }));

    const search = el.querySelector('#pg-q');
    const onSearch = debounce(() => {
      state.q = search.value.trim();
      state.page = 1;
      syncClear(el);
      fetchAndPaint(el);
    }, 320);
    if (search) { search.addEventListener('input', onSearch); off(() => search.removeEventListener('input', onSearch)); }

    const sort = el.querySelector('#pg-sort');
    if (sort) {
      const fn = () => { state.sort = sort.value; state.page = 1; syncClear(el); fetchAndPaint(el); };
      sort.addEventListener('change', fn); off(() => sort.removeEventListener('change', fn));
    }

    off(delegate(el, 'change', '#pg-cat', (ev, sel) => {
      state.cat = sel.value;
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
      state.q = ''; state.status = 'all'; state.sort = 'new'; state.cat = ''; state.page = 1;
      const q = el.querySelector('#pg-q'); if (q) q.value = '';
      const s = el.querySelector('#pg-sort'); if (s) s.value = 'new';
      const c = el.querySelector('#pg-cat'); if (c) c.value = '';
      el.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', b.getAttribute('data-status') === 'all' ? 'true' : 'false'));
      syncClear(el);
      fetchAndPaint(el);
    };
    off(delegate(el, 'click', '[data-act="clear"], [data-empty-act="clear"]', clear));
    off(delegate(el, 'click', '[data-empty-act="retry"]', () => fetchAndPaint(el)));

    off(delegate(el, 'change', '[data-check]', (ev, cb) => {
      const id = Number(cb.getAttribute('data-check'));
      if (cb.checked) state.selected.add(id); else state.selected.delete(id);
      syncSelection(el);
    }));
    off(delegate(el, 'change', '[data-role="check-all"]', (ev, cb) => {
      state.items.forEach((p) => { if (cb.checked) state.selected.add(p.id); else state.selected.delete(p.id); });
      syncSelection(el);
    }));

    off(delegate(el, 'click', '[data-row-act]', (ev, btn) => {
      const act = btn.getAttribute('data-row-act');
      const id = Number(btn.getAttribute('data-id'));
      if (act === 'view') { openPluginDrawer(id, { onChanged: () => fetchAndPaint(el) }); return; }
      if (act === 'publish' || act === 'reject' || act === 'hide') { quickStatus(el, id, act); }
    }));

    off(delegate(el, 'click', 'tbody tr[data-id]', (ev, tr) => {
      if (ev.target.closest('button,input,a,label')) return;
      openPluginDrawer(Number(tr.getAttribute('data-id')), { onChanged: () => fetchAndPaint(el) });
    }));

    off(delegate(el, 'click', '[data-bulk]', (ev, btn) => bulk(el, btn.getAttribute('data-bulk'))));
    off(bindPager(el, (p) => { state.page = p; fetchAndPaint(el); }));
    syncClear(el);
  },
};

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (!btn) return;
  const on = hasFilter(state.q, state.cat, state.status, state.sort === 'new' ? '' : state.sort);
  btn.classList.toggle('hide', !on);
}
