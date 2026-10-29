/* 帖子管理：后台里最常来的页面，所以筛选条与表格是主角，
   抽屉只在需要看全文/做决定时出现，不打断列表的浏览节奏。 */
import {
  api, esc, escAttr, fmt, icon, avatar, statusPill, emptyHTML, pagerHTML,
  bindPager, hasFilter, delegate, debounce, toast, promptDialog, confirmDialog,
  openDrawer, can, dayStart, dayEnd, clip,
} from './core.js';

const PAGE_SIZE = 20;
const STATUSES = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'pending', label: '待审核' },
  { key: 'rejected', label: '已驳回' },
  { key: 'hidden', label: '已隐藏' },
];

/* 筛选条件放在模块级：去用户页处理完事回来，视野还停在原来的位置 */
const state = {
  q: '', status: 'all', sort: 'new', from: '', to: '', page: 1,
  items: [], counts: {}, total: 0, selected: new Set(),
};

let seq = 0;

function query() {
  return {
    q: state.q,
    status: state.status === 'all' ? '' : state.status,
    sort: state.sort === 'new' ? '' : state.sort,
    from: dayStart(state.from),
    to: dayEnd(state.to),
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

function tabsHTML() {
  return '<div class="tabsbar">' +
    '<div class="grow"><div class="seg" role="tablist" aria-label="按状态筛选">' +
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
        '<input class="input" id="p-q" type="search" placeholder="搜索正文、作者或 ID" value="' + escAttr(state.q) + '" autocomplete="off">' +
      '</div>' +
      '<select class="select" id="p-sort" aria-label="排序方式">' +
        '<option value="new"' + (state.sort === 'new' ? ' selected' : '') + '>最新发布</option>' +
        '<option value="old"' + (state.sort === 'old' ? ' selected' : '') + '>最早发布</option>' +
        '<option value="hot"' + (state.sort === 'hot' ? ' selected' : '') + '>互动最多</option>' +
      '</select>' +
      '<span class="spacer"></span>' +
      '<span class="date-sep">时间</span>' +
      '<input class="input date-input" id="p-from" type="date" aria-label="开始日期" value="' + escAttr(state.from) + '">' +
      '<span class="date-sep">至</span>' +
      '<input class="input date-input" id="p-to" type="date" aria-label="结束日期" value="' + escAttr(state.to) + '">' +
      '<button class="btn btn--ghost btn--sm clear-btn' + (hasFilter(state.q, state.from, state.to, state.status, state.sort === 'new' ? '' : state.sort) ? '' : ' hide') + '" type="button" data-act="clear">清空筛选</button>' +
    '</div>' +
    tabsHTML() +
    '<div class="bulkbar" data-role="bulk" hidden>' +
      '<span class="bulk-n" data-role="bulk-n">已选 0 条</span>' +
      '<span class="spacer"></span>' +
      (can('post.review') ? '<button class="btn btn--sm btn--ok" type="button" data-bulk="approve">批量通过</button>' +
        '<button class="btn btn--sm btn--danger" type="button" data-bulk="reject">批量驳回</button>' : '') +
      (can('post.delete') ? '<button class="btn btn--sm" type="button" data-bulk="delete">批量删除</button>' : '') +
      '<button class="btn btn--sm btn--ghost" type="button" data-bulk="clear">取消选择</button>' +
    '</div>' +
    '<div class="tbl-wrap">' +
      '<table class="tbl">' +
        '<thead><tr>' +
          '<th class="select-col"><input class="checkbox" type="checkbox" data-role="check-all" aria-label="全选本页"></th>' +
          '<th class="col-id">ID</th>' +
          '<th style="width:150px">作者</th>' +
          '<th>正文</th>' +
          '<th style="width:110px">互动</th>' +
          '<th style="width:96px">状态</th>' +
          '<th class="col-time" style="width:104px">时间</th>' +
          '<th class="col-acts" style="width:128px">操作</th>' +
        '</tr></thead>' +
        '<tbody data-role="rows"></tbody>' +
      '</table>' +
    '</div>' +
    '<div data-role="pager"></div>' +
  '</section>';
}

function rowHTML(p) {
  const a = p.author || {};
  const checked = state.selected.has(p.id);
  return '<tr data-id="' + p.id + '"' + (checked ? ' class="is-selected"' : '') + '>' +
    '<td class="select-col"><input class="checkbox" type="checkbox" data-check="' + p.id + '"' + (checked ? ' checked' : '') + ' aria-label="选择帖子 ' + p.id + '"></td>' +
    '<td class="col-id mono">#' + p.id + '</td>' +
    '<td><div class="author-cell">' + avatar(a, 'avatar--sm') +
      '<div class="ac-txt"><b>' + esc(a.name || '匿名') + '</b><small>Lv.' + (a.level || 1) + '</small></div></div></td>' +
    '<td><div class="clip-2">' + (p.pinned ? '<span class="muted" title="已置顶" style="margin-right:4px;vertical-align:-2px">' + icon('pin', 'ico-inline') + '</span>' : '') + esc(p.text || '（无正文）') + '</div>' +
      '<div class="tiny muted mt-8">' + (p.images && p.images.length ? p.images.length + ' 张配图' : '无配图') + (p.pluginSlug ? ' · 来自 ' + esc(p.pluginSlug) : '') + '</div></td>' +
    '<td><div class="inter-cell"><span>' + icon('heart') + fmt.int(p.likes) + '</span><span>' + icon('comment') + fmt.int(p.comments) + '</span></div></td>' +
    '<td>' + statusPill('post', p.status) + (p.pinned ? ' <span class="pill pill--brand">置顶</span>' : '') + '</td>' +
    '<td class="col-time" title="' + escAttr(fmt.dateTime(p.createdAt)) + '">' + fmt.rel(p.createdAt) + '</td>' +
    '<td class="col-acts"><div class="acts">' +
      '<button class="icon-btn" type="button" data-row-act="view" data-id="' + p.id + '" title="查看" aria-label="查看帖子 ' + p.id + '">' + icon('eye') + '</button>' +
      (p.status === 'pending' && can('post.review') ? '<button class="icon-btn" type="button" data-row-act="approve" data-id="' + p.id + '" title="通过" aria-label="通过帖子 ' + p.id + '">' + icon('check') + '</button>' +
        '<button class="icon-btn" type="button" data-row-act="reject" data-id="' + p.id + '" title="驳回" aria-label="驳回帖子 ' + p.id + '">' + icon('xCircle') + '</button>' : '') +
      (can('post.delete') ? '<button class="icon-btn" type="button" data-row-act="delete" data-id="' + p.id + '" title="删除" aria-label="删除帖子 ' + p.id + '">' + icon('trash') + '</button>' : '') +
    '</div></td>' +
  '</tr>';
}

function rowsHTML(items) {
  if (!items.length) {
    return '<tr><td colspan="8" class="tbl-empty">' + emptyHTML({
      title: '没有符合条件的帖子',
      text: hasFilter(state.q, state.from, state.to, state.status, state.sort === 'new' ? '' : state.sort) ? '换个关键词或清空筛选试试。' : '等社区里出现第一条帖子，它会出现在这里。',
      action: hasFilter(state.q, state.from, state.to, state.status, state.sort === 'new' ? '' : state.sort) ? { label: '清空筛选', act: 'clear', kind: 'btn' } : null,
    }) + '</td></tr>';
  }
  return items.map(rowHTML).join('');
}

function skeletonRows() {
  return '<tr><td colspan="8" style="padding:10px 12px">' + '<div class="skel-table">' +
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
    const data = await api('/posts', { query: query() });
    if (my !== seq) return;
    state.page = Number(data.page) || state.page;
    paint(el, data);
  } catch (e) {
    if (my !== seq) return;
    const r = el.querySelector('[data-role="rows"]');
    if (r) r.innerHTML = '<tr><td colspan="8" class="tbl-empty">' + emptyHTML({ icon: 'alert', title: '帖子没能加载出来', text: (e && e.message) || '接口暂时没有响应，请稍后重试。', action: { label: '重新加载', act: 'retry', kind: 'btn' } }) + '</td></tr>';
  }
}

/* ── 抽屉 ── */
function reviewSection(p) {
  if (!can('post.review')) return '';
  return '<section class="d-sec"><h4>审核</h4>' +
    '<div class="field"><label for="pv-note">备注' + (p.status === 'pending' ? '（驳回时必填，用户能看到）' : '（可留空）') + '</label>' +
    '<textarea class="textarea" id="pv-note" maxlength="200" placeholder="写清楚原因，作者会收到这条说明。"></textarea>' +
    '<div class="hint">最多 200 字。通过时留空也可以。</div></div>' +
    '<div class="row mt-8" style="gap:8px">' +
      '<button class="btn btn--ok" type="button" data-drawer-act="approve">' + icon('check') + '通过并发布</button>' +
      '<button class="btn btn--danger" type="button" data-drawer-act="reject">' + icon('xCircle') + '驳回</button>' +
    '</div>' +
  '</section>';
}

function editSection(p) {
  if (!can('post.edit')) return '';
  return '<section class="d-sec"><h4>编辑内容</h4>' +
    '<div class="field"><label for="pv-text">正文</label>' +
    '<textarea class="textarea" id="pv-text" maxlength="5000" style="min-height:110px">' + esc(p.text || '') + '</textarea>' +
    '<div class="hint">最多 5000 字。修改会记入操作日志。</div></div>' +
    '<label class="checkbox mt-8"><input type="checkbox" id="pv-pinned"' + (p.pinned ? ' checked' : '') + '><span>在社区置顶这条帖子</span></label>' +
    '<div class="mt-8"><button class="btn" type="button" data-drawer-act="save">' + icon('check') + '保存修改</button></div>' +
  '</section>';
}

function commentsHTML(list) {
  if (!list || !list.length) return '<div class="muted tiny">还没有评论。</div>';
  return list.map((c) => '<div class="comment-item">' +
    '<div class="cm-top"><b>' + esc(c.name || '用户 #' + c.userId) + '</b><time>' + fmt.rel(c.createdAt) + '</time></div>' +
    '<p>' + esc(c.text || '') + '</p>' +
    '<div class="tiny muted">' + icon('heart') + ' ' + fmt.int(c.likes) + '</div>' +
  '</div>').join('');
}

/* 历史帖子可能没有 reviewedAt（早于审核功能上线），不能一律显示"等待审核"，
   否则已发布内容在抽屉里看起来像没处理过。按当前状态给出可解释的说明。 */
function reviewedHTML(p) {
  if (p.reviewedAt) {
    return '<div class="review-row"><span class="rev-dot ' + (p.status === 'rejected' ? 'rev-dot--rose' : 'rev-dot--ok') + '"></span>' +
      '<div class="rev-txt"><b>' + (p.status === 'rejected' ? '已驳回' : '已通过') + '</b> · ' + esc(p.reviewedBy || '管理员') +
      (p.reviewNote ? '<br>' + esc(p.reviewNote) : '') + '</div><time>' + fmt.rel(p.reviewedAt) + '</time></div>';
  }
  const map = {
    pending: ['等待审核', '这条内容还没有人处理。', ''],
    published: ['已发布', '这条内容已在社区展示，没有单独的审核记录。', 'rev-dot--ok'],
    rejected: ['已驳回', '这条内容已被驳回，没有记录审核时间与原因。', 'rev-dot--rose'],
    hidden: ['已隐藏', '这条内容当前不在社区展示。', ''],
  };
  const m = map[p.status] || ['状态未知', '没有可用的审核记录。', ''];
  return '<div class="review-row"><span class="rev-dot ' + m[2] + '"></span><div class="rev-txt"><b>' + m[0] + '</b><br>' + m[1] + '</div></div>';
}

function drawerBody(p, comments) {
  const a = p.author || {};
  const reviewed = reviewedHTML(p);

  return '<section class="d-sec">' +
      '<h4>正文 <span class="h4-act mono">#' + p.id + '</span></h4>' +
      '<div class="post-text">' + esc(p.text || '（无正文）') + '</div>' +
      '<div class="post-exif">' + statusPill('post', p.status) + (p.pinned ? '<span class="pill pill--brand">置顶</span>' : '') +
        (p.pluginSlug ? '<span class="pill pill--plain">' + esc(p.pluginSlug) + (p.pluginVer ? ' v' + esc(p.pluginVer) : '') + '</span>' : '') +
        '<span class="pill pill--plain">' + esc(fmt.dateTime(p.createdAt)) + '</span></div>' +
      (p.images && p.images.length ? '<div class="img-grid mt-8">' + p.images.map((im, i) =>
        '<a href="' + escAttr(im.full || im.url || '#') + '" target="_blank" rel="noopener"><img src="' + escAttr(im.url || im.full || '') + '" alt="配图 ' + (i + 1) + '" loading="lazy"></a>').join('') + '</div>' : '') +
    '</section>' +
    '<section class="d-sec"><h4>作者</h4><div class="author-card">' + avatar(a, 'avatar--lg') +
      '<div class="au-main"><b>' + esc(a.name || '匿名') + '</b><small>Lv.' + (a.level || 1) + (a.badge ? ' · ' + esc(a.badge) : '') + ' · 用户 #' + (p.userId || a.id) + '</small></div>' +
      statusPill('user', a.status || 'active') +
    '</div></section>' +
    '<section class="d-sec"><h4>审核记录</h4>' + reviewed + '</section>' +
    '<section class="d-sec"><h4>评论 <span class="h4-act">' + fmt.int((comments || []).length) + ' 条</span></h4>' + commentsHTML(comments) + '</section>' +
    editSection(p) +
    reviewSection(p);
}

export function openPostDrawer(id, opts) {
  const o = opts || {};
  const d = openDrawer({
    title: '帖子 #' + id,
    subtitle: '<span class="muted">正在读取…</span>',
    wide: true,
    body: '<div class="skel-table">' + Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div>',
    footer: '<button class="btn" type="button" data-close="1">关闭</button>',
  });
  let post = null;
  const changed = () => { if (typeof o.onChanged === 'function') o.onChanged(); };

  api('/posts/' + id).then((data) => {
    post = (data && data.post) || data || {};
    const comments = post.comments || (data && data.comments) || [];
    d.setTitle('帖子 #' + post.id);
    d.setSubtitle('<span class="muted">' + esc((post.author && post.author.name) || '匿名') + ' · ' + esc(fmt.dateTime(post.createdAt)) + '</span>');
    d.setBody(drawerBody(post, comments));
    d.setFooter(
      '<div class="left">' + (can('post.delete') ? '<button class="btn btn--danger" type="button" data-drawer-act="delete">' + icon('trash') + '删除帖子</button>' : '') + '</div>' +
      '<button class="btn" type="button" data-close="1">关闭</button>'
    );
  }).catch((e) => {
    d.setBody('<div class="empty"><div class="empty-art">' + icon('alert') + '</div><h3>这条帖子没能打开</h3><p>' + esc((e && e.message) || '接口暂时没有响应。') + '</p></div>');
    d.setFooter('<button class="btn" type="button" data-close="1">关闭</button>');
  });

  const getNote = () => {
    const t = d.body.querySelector('#pv-note');
    return t ? t.value.trim() : '';
  };

  d.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-drawer-act]');
    if (!b || !post) return;
    const act = b.getAttribute('data-drawer-act');

    if (act === 'save') {
      const ta = d.body.querySelector('#pv-text');
      const pin = d.body.querySelector('#pv-pinned');
      const text = ta ? ta.value.trim() : '';
      if (!text) { toast('正文不能为空', 'err'); if (ta) ta.focus(); return; }
      b.disabled = true;
      try {
        await api('/posts/' + post.id, { method: 'PATCH', body: { text, pinned: !!(pin && pin.checked) } });
        toast('已保存修改', 'ok');
        changed();
        d.close();
      } catch (e) { toast((e && e.message) || '保存没有成功', 'err'); b.disabled = false; }
      return;
    }

    if (act === 'approve' || act === 'reject') {
      const note = getNote();
      if (act === 'reject' && note.length < 2) {
        toast('驳回需要写清楚原因（至少 2 个字）', 'err');
        const t = d.body.querySelector('#pv-note'); if (t) t.focus();
        return;
      }
      b.disabled = true;
      try {
        await api('/posts/' + post.id + '/review', { method: 'POST', body: { decision: act, note } });
        toast(act === 'approve' ? '已通过并发布' : '已驳回', 'ok');
        changed();
        d.close();
      } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); b.disabled = false; }
      return;
    }

    if (act === 'delete') {
      const ok = await confirmDialog({
        title: '删除帖子 #' + post.id,
        message: '帖子、它的评论与互动都会一起删除，且不可恢复。确认删除？<br><br><span class="muted">' + esc(clip(post.text, 80)) + '</span>',
        danger: true, okText: '删除',
      });
      if (!ok) return;
      b.disabled = true;
      try {
        await api('/posts/' + post.id, { method: 'DELETE' });
        toast('帖子已删除', 'ok');
        changed();
        d.close();
      } catch (e) { toast((e && e.message) || '删除没有成功', 'err'); b.disabled = false; }
    }
  });
}

/* ── 行内快捷审核 ── */
async function quickReview(el, id, act) {
  let note = '';
  if (act === 'reject') {
    note = await promptDialog({
      title: '驳回帖子 #' + id, label: '驳回原因（用户能看到）', multiline: true,
      min: 2, maxlength: 200, placeholder: '例如：与社区主题无关，或含有外部广告。',
      danger: true, okText: '驳回',
    });
    if (note == null) return;
  }
  try {
    await api('/posts/' + id + '/review', { method: 'POST', body: { decision: act, note } });
    toast(act === 'approve' ? '已通过 #' + id : '已驳回 #' + id, 'ok');
    fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); }
}

async function rowDelete(el, id) {
  const ok = await confirmDialog({ title: '删除帖子 #' + id, message: '删除后不能恢复，评论与互动也会消失。', danger: true, okText: '删除' });
  if (!ok) return;
  try {
    await api('/posts/' + id, { method: 'DELETE' });
    toast('帖子已删除', 'ok');
    fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '删除没有成功', 'err'); }
}

/* ── 批量 ── */
async function bulk(el, act) {
  const ids = Array.from(state.selected);
  if (!ids.length) return;
  if (act === 'clear') { state.selected.clear(); syncSelection(el); return; }

  let note = '';
  if (act === 'approve') {
    const ok = await confirmDialog({ title: '批量通过', message: '将把选中的 <b>' + ids.length + '</b> 条帖子标记为已发布，作者会收到通知。', okText: '全部通过' });
    if (!ok) return;
  } else if (act === 'reject') {
    note = await promptDialog({
      title: '批量驳回', label: '驳回原因（' + ids.length + ' 条共用）', multiline: true,
      min: 2, maxlength: 200, placeholder: '写清楚原因，作者会收到这条说明。', danger: true, okText: '全部驳回',
    });
    if (note == null) return;
  } else if (act === 'delete') {
    const ok = await confirmDialog({ title: '批量删除', message: '将永久删除 <b>' + ids.length + '</b> 条帖子及其评论，且不可恢复。', danger: true, okText: '永久删除' });
    if (!ok) return;
  }

  try {
    const r = await api('/posts/batch', { method: 'POST', body: { action: act, ids, note } });
    toast('已处理 ' + fmt.int((r && r.affected) || ids.length) + ' 条', 'ok');
    state.selected.clear();
    fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '批量操作没有成功', 'err'); }
}

export default {
  name: 'posts',
  title: '帖子管理',
  perm: 'post.view',
  async render(el, ctx) {
    /* 从工作台的"去审核"过来时带着 ?status=pending，直接落到待审 tab */
    const ps = ctx.params || {};
    if (ps.status && STATUSES.some((s) => s.key === ps.status)) state.status = ps.status;
    if (typeof ps.q === 'string' && ps.q) state.q = ps.q;
    state.page = 1;

    el.innerHTML = shellHTML();
    await fetchAndPaint(el);

    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
    ctx.cleanup(() => offs.forEach((f) => { try { f(); } catch (e) {} }));

    const search = el.querySelector('#p-q');
    const onSearch = debounce(() => {
      state.q = search.value.trim();
      state.page = 1;
      syncClear(el);
      fetchAndPaint(el);
    }, 320);
    if (search) { search.addEventListener('input', onSearch); off(() => search.removeEventListener('input', onSearch)); }
    const sort = el.querySelector('#p-sort');
    if (sort) {
      const fn = () => { state.sort = sort.value; state.page = 1; syncClear(el); fetchAndPaint(el); };
      sort.addEventListener('change', fn); off(() => sort.removeEventListener('change', fn));
    }

    ['#p-from', '#p-to'].forEach((sel, i) => {
      const inp = el.querySelector(sel);
      if (!inp) return;
      const fn = () => {
        const v = inp.value;
        if (i === 0) state.from = v; else state.to = v;
        if (state.from && state.to && state.from > state.to) {
          toast('开始日期不能晚于结束日期', 'err');
          inp.value = i === 0 ? state.to : state.from;
          if (i === 0) state.from = state.to; else state.to = state.from;
          return;
        }
        state.page = 1;
        syncClear(el);
        fetchAndPaint(el);
      };
      inp.addEventListener('change', fn); off(() => inp.removeEventListener('change', fn));
    });

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
      state.q = ''; state.status = 'all'; state.sort = 'new'; state.from = ''; state.to = ''; state.page = 1;
      const q = el.querySelector('#p-q'); if (q) q.value = '';
      const s = el.querySelector('#p-sort'); if (s) s.value = 'new';
      const f = el.querySelector('#p-from'); if (f) f.value = '';
      const t = el.querySelector('#p-to'); if (t) t.value = '';
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
      if (act === 'view') { openPostDrawer(id, { onChanged: () => fetchAndPaint(el) }); return; }
      if (act === 'approve' || act === 'reject') { quickReview(el, id, act); return; }
      if (act === 'delete') { rowDelete(el, id); }
    }));

    /* 行点击开抽屉；点按钮/复选框不误触 */
    off(delegate(el, 'click', 'tbody tr[data-id]', (ev, tr) => {
      if (ev.target.closest('button,input,a,label')) return;
      openPostDrawer(Number(tr.getAttribute('data-id')), { onChanged: () => fetchAndPaint(el) });
    }));

    off(delegate(el, 'click', '[data-bulk]', (ev, btn) => bulk(el, btn.getAttribute('data-bulk'))));
    off(bindPager(el, (p) => { state.page = p; fetchAndPaint(el); }));
    syncClear(el);
  },
};

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (!btn) return;
  const on = hasFilter(state.q, state.from, state.to, state.status, state.sort === 'new' ? '' : state.sort);
  btn.classList.toggle('hide', !on);
}
