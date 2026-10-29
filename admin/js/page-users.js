/* 用户管理：运营真正会动手的地方是"看这个人是谁、要不要禁、要不要补偿"。
   所以表格只放判断身份需要的列，细节全部进抽屉，避免横向堆成 Excel。 */
import {
  api, esc, escAttr, fmt, icon, avatar, statusPill, emptyHTML, pagerHTML,
  bindPager, hasFilter, delegate, debounce, toast, promptDialog, confirmDialog,
  openDrawer, openModal, can, clip, rewardAmount,
} from './core.js';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '正常' },
  { key: 'disabled', label: '已禁用' },
];

const state = {
  q: '', status: 'all', sort: 'new', page: 1,
  items: [], counts: {}, total: 0,
};
let seq = 0;

function query() {
  return {
    q: state.q,
    status: state.status === 'all' ? '' : state.status,
    sort: state.sort === 'new' ? '' : state.sort,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

function shellHTML() {
  return '<section class="card list-card">' +
    '<div class="filterbar">' +
      '<div class="input-wrap search">' + icon('search') +
        '<input class="input" id="u-q" type="search" placeholder="搜索昵称、邮箱或 ID" value="' + escAttr(state.q) + '" autocomplete="off">' +
      '</div>' +
      '<select class="select" id="u-sort" aria-label="排序方式">' +
        '<option value="new"' + (state.sort === 'new' ? ' selected' : '') + '>最新注册</option>' +
        '<option value="old"' + (state.sort === 'old' ? ' selected' : '') + '>最早注册</option>' +
        '<option value="level"' + (state.sort === 'level' ? ' selected' : '') + '>等级从高到低</option>' +
        '<option value="visits"' + (state.sort === 'visits' ? ' selected' : '') + '>访问最多</option>' +
      '</select>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn--ghost btn--sm clear-btn' + (hasFilter(state.q, state.status, state.sort === 'new' ? '' : state.sort) ? '' : ' hide') + '" type="button" data-act="clear">清空筛选</button>' +
    '</div>' +
    '<div class="tabsbar"><div class="grow"><div class="seg" role="tablist" aria-label="按状态筛选">' +
      TABS.map((t) => '<button type="button" role="tab" data-status="' + t.key + '" aria-selected="' + (state.status === t.key ? 'true' : 'false') + '">' +
        t.label + ' <span class="cnt" data-count="' + t.key + '">0</span></button>').join('') +
    '</div></div><span class="muted tiny" data-role="result"></span></div>' +
    '<div class="tbl-wrap"><table class="tbl">' +
      '<thead><tr>' +
        '<th style="width:210px">用户</th>' +
        '<th style="width:190px">邮箱 / 手机</th>' +
        '<th style="width:70px">等级</th>' +
        '<th style="width:110px">徽章</th>' +
        '<th style="width:64px">帖子</th>' +
        '<th style="width:80px">积分</th>' +
        '<th class="col-time" style="width:104px">注册时间</th>' +
        '<th style="width:88px">状态</th>' +
        '<th class="col-acts" style="width:104px">操作</th>' +
      '</tr></thead>' +
      '<tbody data-role="rows"></tbody>' +
    '</table></div>' +
    '<div data-role="pager"></div>' +
  '</section>';
}

function rowHTML(u) {
  return '<tr data-id="' + u.id + '">' +
    '<td><div class="author-cell">' + avatar(u, 'avatar--sm') +
      '<div class="ac-txt"><b>' + esc(u.name || '未命名') + '</b><small>#' + u.id + (u.city ? ' · ' + esc(u.city) : '') + '</small></div></div></td>' +
    '<td><div class="cell-main"><span class="clip">' + esc(u.email || '—') + '</span>' +
      '<small class="tiny muted">' + esc(u.phoneMasked || '未绑定手机') + (u.phoneVerified ? ' · 已验证' : '') + '</small></div></td>' +
    '<td class="mono">Lv.' + (u.level || 1) + '</td>' +
    '<td>' + (u.badge ? '<span class="badge">' + esc(u.badge) + '</span>' : '<span class="muted">—</span>') + '</td>' +
    '<td class="num">' + fmt.int(u.postCount) + '</td>' +
    '<td class="num">' + fmt.int(u.points) + '</td>' +
    '<td class="col-time" title="' + escAttr(fmt.dateTime(u.createdAt)) + '">' + fmt.date(u.createdAt) + '</td>' +
    '<td>' + statusPill('user', u.status) + '</td>' +
    '<td class="col-acts"><div class="acts">' +
      '<button class="icon-btn" type="button" data-row-act="view" data-id="' + u.id + '" title="查看资料" aria-label="查看用户 ' + u.id + '">' + icon('eye') + '</button>' +
      (can('user.status') ? (u.status === 'disabled'
        ? '<button class="icon-btn" type="button" data-row-act="enable" data-id="' + u.id + '" title="启用" aria-label="启用用户 ' + u.id + '">' + icon('unlock') + '</button>'
        : '<button class="icon-btn" type="button" data-row-act="disable" data-id="' + u.id + '" title="禁用" aria-label="禁用用户 ' + u.id + '">' + icon('ban') + '</button>') : '') +
      (can('user.delete') ? '<button class="icon-btn" type="button" data-row-act="delete" data-id="' + u.id + '" title="删除" aria-label="删除用户 ' + u.id + '">' + icon('trash') + '</button>' : '') +
    '</div></td>' +
  '</tr>';
}

function rowsHTML(items) {
  if (!items.length) {
    return '<tr><td colspan="9" class="tbl-empty">' + emptyHTML({
      title: '没有找到用户',
      text: hasFilter(state.q, state.status, state.sort === 'new' ? '' : state.sort) ? '换个关键词，或把状态切回"全部"。' : '等第一位成员注册，用户会出现在这里。',
      action: hasFilter(state.q, state.status, state.sort === 'new' ? '' : state.sort) ? { label: '清空筛选', act: 'clear', kind: 'btn' } : null,
    }) + '</td></tr>';
  }
  return items.map(rowHTML).join('');
}

function paint(el, data) {
  state.items = data.items || [];
  state.counts = data.counts || {};
  state.total = Number(data.total) || 0;
  const rows = el.querySelector('[data-role="rows"]');
  if (rows) rows.innerHTML = rowsHTML(state.items);
  const pager = el.querySelector('[data-role="pager"]');
  if (pager) pager.innerHTML = pagerHTML(data.page || state.page, state.total, data.pageSize || PAGE_SIZE);
  TABS.forEach((t) => { const c = el.querySelector('[data-count="' + t.key + '"]'); if (c) c.textContent = fmt.int(state.counts[t.key] || 0); });
  const result = el.querySelector('[data-role="result"]');
  if (result) result.textContent = '共 ' + fmt.int(state.total) + ' 位';
}

async function fetchAndPaint(el) {
  const my = ++seq;
  const rows = el.querySelector('[data-role="rows"]');
  if (rows) rows.innerHTML = '<tr><td colspan="9" style="padding:10px 12px"><div class="skel-table">' +
    Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div></td></tr>';
  try {
    const data = await api('/users', { query: query() });
    if (my !== seq) return;
    state.page = Number(data.page) || state.page;
    paint(el, data);
  } catch (e) {
    if (my !== seq) return;
    const r = el.querySelector('[data-role="rows"]');
    if (r) r.innerHTML = '<tr><td colspan="9" class="tbl-empty">' + emptyHTML({ icon: 'alert', title: '用户没能加载出来', text: (e && e.message) || '接口暂时没有响应。', action: { label: '重新加载', act: 'retry', kind: 'btn' } }) + '</td></tr>';
  }
}

/* ── 删除确认：必须手打邮箱，防止手滑点掉一个真人账号 ── */
function confirmDeleteEmail(user) {
  return new Promise((resolve) => {
    const email = user.email || '';
    const id = 'del-confirm';
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); m.close(); };
    const m = openModal({
      title: '删除用户 #' + user.id,
      danger: true,
      body: '<div class="notice notice--err"><span class="notice-ico">' + icon('alert') + '</span><div class="notice-body">' +
          '<strong>这是不可恢复的操作</strong>该用户的帖子、评论与奖励记录会一并删除。' +
        '</div></div>' +
        '<div class="field mt-8"><label for="' + id + '">输入邮箱确认<span class="req">*</span></label>' +
        '<input class="input" id="' + id + '" autocomplete="off" placeholder="' + escAttr(email) + '">' +
        '<div class="hint">请输入 <b class="mono">' + esc(email || '（该用户没有邮箱）') + '</b> 完整内容。' + (email.indexOf('*') >= 0 ? '（当前显示的是打码邮箱）' : '') + '</div>' +
        '<div class="err-tip hide" data-role="err"></div></div>',
      footer: '<button class="btn" type="button" data-act="cancel">取消</button>' +
        '<button class="btn btn--danger" type="button" data-act="ok">永久删除</button>',
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
    const input = m.body.querySelector('#' + id);
    const err = m.body.querySelector('[data-role="err"]');
    if (input) input.focus();
    const submit = () => {
      const v = input ? input.value.trim() : '';
      if (!email || v !== email) {
        if (err) { err.textContent = '和上面的邮箱不一致，请再核对一次。'; err.classList.remove('hide'); }
        if (input) input.focus();
        return;
      }
      finish(true);
    };
    m.footer.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'ok') submit(); else finish(false);
    });
    if (input) input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
  });
}

/* ── 抽屉 ── */
function statTile(label, value) {
  return '<div class="stat-tile"><span class="st-label">' + esc(label) + '</span><span class="st-val">' + fmt.int(value) + '</span></div>';
}

function miniPosts(list) {
  if (!list || !list.length) return '<div class="muted tiny">还没有发过帖子。</div>';
  return list.map((p) => '<div class="mini-post"><div class="mp-main">' +
    '<div class="mp-txt">' + esc(clip(p.text, 70) || '（无正文）') + '</div>' +
    '<div class="mp-meta">' + statusPill('post', p.status) + '<span>' + fmt.rel(p.createdAt) + '</span><span>' + icon('heart') + ' ' + fmt.int(p.likes) + '</span></div>' +
  '</div></div>').join('');
}

function rewardList(list) {
  if (!list || !list.length) return '<div class="muted tiny">还没有收到过奖励。</div>';
  return list.map((r) => '<div class="recent-reward">' +
    '<div class="rr-main"><b>' + esc(r.reason || '奖励') + '</b><small>' + esc((r.grantedBy && r.grantedBy.name) || '管理员') + ' · ' + fmt.rel(r.grantedAt) + '</small></div>' +
    '<span class="rr-amt' + (r.status === 'revoked' ? ' is-revoked' : '') + '">' + rewardAmount(r) + '</span>' +
  '</div>').join('');
}

function drawerBody(user, detail) {
  const stats = detail.stats || {};
  const st = user.status || 'active';
  return '<section class="d-sec"><div class="u-hero">' + avatar(user, 'avatar--xl') +
      '<div class="u-main"><h3>' + esc(user.name || '未命名') + '</h3>' +
        '<div class="u-sub">' + esc(user.email || '无邮箱') + ' · ' + esc(user.phoneMasked || '未绑定手机') + '</div>' +
        '<div class="u-tags">' + statusPill('user', st) + '<span class="pill pill--plain">Lv.' + (user.level || 1) + '</span>' +
          (user.badge ? '<span class="badge">' + esc(user.badge) + '</span>' : '') +
          (user.city ? '<span class="pill pill--plain">' + esc(user.city) + '</span>' : '') +
          (user.phoneVerified ? '<span class="pill pill--active">手机已验证</span>' : '') +
        '</div></div></div></section>' +

    '<section class="d-sec"><h4>统计</h4><div class="stat-grid">' +
      statTile('帖子', stats.posts) + statTile('评论', stats.comments) + statTile('获赞', stats.likes) +
      statTile('奖励', stats.rewards) + statTile('积分', stats.points) +
    '</div></section>' +

    '<section class="d-sec"><h4>资料与注册信息</h4><dl class="kv-list">' +
      row('用户 ID', '<span class="mono">#' + user.id + '</span>') +
      row('邮箱', esc(user.email || '—')) +
      row('手机号', esc(user.phoneMasked || '未绑定') + (user.phoneVerified ? '（已验证）' : '')) +
      row('城市', esc(user.city || '—')) +
      row('粉丝 / 关注', fmt.int(user.fans) + ' / ' + fmt.int(user.follows)) +
      row('访问次数', fmt.int(user.visits) + ' 次') +
      row('注册时间', esc(fmt.dateTime(user.createdAt))) +
      (user.sig ? row('个性签名', esc(user.sig)) : '') +
      (st === 'disabled' ? row('禁用原因', '<span class="result-fail">' + esc(user.disabledReason || '—') + '</span>' + (user.disabledAt ? ' <span class="muted tiny">' + esc(fmt.dateTime(user.disabledAt)) + '</span>' : '')) : '') +
    '</dl></section>' +

    '<section class="d-sec"><h4>最近帖子 <span class="h4-act">' + fmt.int((detail.posts || []).length) + ' 条</span></h4>' + miniPosts(detail.posts) + '</section>' +
    '<section class="d-sec"><h4>奖励记录</h4>' + rewardList(detail.rewards) + '</section>' +

    (can('user.edit') ? '<section class="d-sec"><h4>编辑资料</h4>' +
      '<div class="row" style="gap:10px;align-items:flex-end">' +
        '<div class="field" style="width:110px"><label for="uv-level">等级</label><input class="input" id="uv-level" type="number" min="1" max="99" value="' + (user.level || 1) + '"></div>' +
        '<div class="field grow"><label for="uv-badge">徽章</label><input class="input" id="uv-badge" maxlength="20" value="' + escAttr(user.badge || '') + '" placeholder="例如：早期成员"></div>' +
        '<button class="btn" type="button" data-drawer-act="save">保存</button>' +
      '</div><div class="hint">等级 1–99，徽章最多 20 字；留空表示不显示徽章。</div>' +
    '</section>' : '') +

    (can('user.status') || can('user.delete') ? '<section class="d-sec"><h4>账号操作</h4><div class="row" style="gap:8px;flex-wrap:wrap">' +
      (can('user.status') ? (st === 'disabled'
        ? '<button class="btn btn--ok" type="button" data-drawer-act="enable">' + icon('unlock') + '启用账号</button>'
        : '<button class="btn btn--warn" type="button" data-drawer-act="disable">' + icon('ban') + '禁用账号</button>') : '') +
      (can('user.delete') ? '<button class="btn btn--danger" type="button" data-drawer-act="delete">' + icon('trash') + '删除用户</button>' : '') +
    '</div><div class="hint">禁用会让站点登录状态立即失效，原因会记录在操作日志里。</div></section>' : '');
}

function row(dt, dd) {
  return '<div class="kv-row"><dt>' + dt + '</dt><dd>' + dd + '</dd></div>';
}

export function openUserDrawer(id, opts) {
  const o = opts || {};
  const d = openDrawer({
    title: '用户 #' + id,
    subtitle: '<span class="muted">正在读取…</span>',
    wide: true,
    body: '<div class="skel-table">' + Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div>',
    footer: '<button class="btn" type="button" data-close="1">关闭</button>',
  });
  let user = null;
  const changed = () => { if (typeof o.onChanged === 'function') o.onChanged(); };

  api('/users/' + id).then((data) => {
    user = (data && data.user) || data || {};
    d.setTitle(user.name || '用户 #' + id);
    d.setSubtitle('<span class="muted">#' + user.id + ' · 注册于 ' + esc(fmt.date(user.createdAt)) + '</span>');
    d.setBody(drawerBody(user, data || {}));
    d.setFooter('<div class="left"></div><button class="btn" type="button" data-close="1">关闭</button>');
  }).catch((e) => {
    d.setBody('<div class="empty"><div class="empty-art">' + icon('alert') + '</div><h3>这个用户没能打开</h3><p>' + esc((e && e.message) || '接口暂时没有响应。') + '</p></div>');
  });

  d.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-drawer-act]');
    if (!b || !user) return;
    const act = b.getAttribute('data-drawer-act');

    if (act === 'save') {
      const lv = d.body.querySelector('#uv-level');
      const bd = d.body.querySelector('#uv-badge');
      const level = Number(lv && lv.value);
      if (!Number.isInteger(level) || level < 1 || level > 99) { toast('等级需要是 1 到 99 的整数', 'err'); if (lv) lv.focus(); return; }
      b.disabled = true;
      try {
        await api('/users/' + user.id, { method: 'PATCH', body: { level, badge: (bd && bd.value.trim()) || '' } });
        toast('资料已更新', 'ok');
        changed();
        d.close();
      } catch (e) { toast((e && e.message) || '保存没有成功', 'err'); b.disabled = false; }
      return;
    }

    if (act === 'disable') {
      const reason = await promptDialog({
        title: '禁用用户', label: '禁用原因（用户与日志都能看到）', multiline: true,
        min: 4, maxlength: 200, placeholder: '例如：多次发布外部广告，提醒后仍未停止。',
        danger: true, okText: '禁用',
      });
      if (reason == null) return;
      b.disabled = true;
      try {
        await api('/users/' + user.id + '/status', { method: 'POST', body: { status: 'disabled', reason } });
        toast('账号已禁用', 'ok');
        changed(); d.close();
      } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); b.disabled = false; }
      return;
    }

    if (act === 'enable') {
      const ok = await confirmDialog({ title: '启用用户', message: '启用后该用户可以重新登录并发帖。确认继续？', okText: '启用' });
      if (!ok) return;
      b.disabled = true;
      try {
        await api('/users/' + user.id + '/status', { method: 'POST', body: { status: 'active', reason: '后台恢复账号使用' } });
        toast('账号已启用', 'ok');
        changed(); d.close();
      } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); b.disabled = false; }
      return;
    }

    if (act === 'delete') {
      const ok = await confirmDeleteEmail(user);
      if (!ok) return;
      b.disabled = true;
      try {
        const r = await api('/users/' + user.id, { method: 'DELETE' });
        const del = (r && r.deleted) || {};
        toast('用户已删除，连带清理 ' + fmt.int(del.posts || 0) + ' 条帖子', 'ok');
        changed(); d.close();
      } catch (e) { toast((e && e.message) || '删除没有成功', 'err'); b.disabled = false; }
    }
  });
}

/* ── 行内快捷操作 ── */
async function quickStatus(el, id, next) {
  if (next === 'disabled') {
    const reason = await promptDialog({
      title: '禁用用户 #' + id, label: '禁用原因', multiline: true, min: 4, maxlength: 200,
      placeholder: '写清楚原因，用户与操作日志都会看到。', danger: true, okText: '禁用',
    });
    if (reason == null) return;
    try {
      await api('/users/' + id + '/status', { method: 'POST', body: { status: 'disabled', reason } });
      toast('账号已禁用', 'ok'); fetchAndPaint(el);
    } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); }
    return;
  }
  const ok = await confirmDialog({ title: '启用用户 #' + id, message: '启用后该用户可以重新登录并发帖。', okText: '启用' });
  if (!ok) return;
  try {
    await api('/users/' + id + '/status', { method: 'POST', body: { status: 'active', reason: '后台恢复账号使用' } });
    toast('账号已启用', 'ok'); fetchAndPaint(el);
  } catch (e) { toast((e && e.message) || '操作没有成功', 'err'); }
}

async function quickDelete(el, id) {
  /* 行内删除无法展示邮箱确认，引导去抽屉里做，减少误删 */
  openUserDrawer(id, { onChanged: () => fetchAndPaint(el) });
  toast('删除是不可恢复操作，请在抽屉底部确认邮箱后删除', 'info', 3600);
}

export default {
  name: 'users',
  title: '用户管理',
  perm: 'user.view',
  async render(el, ctx) {
    el.innerHTML = shellHTML();
    await fetchAndPaint(el);

    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
    ctx.cleanup(() => offs.forEach((f) => { try { f(); } catch (e) {} }));

    const search = el.querySelector('#u-q');
    const onSearch = debounce(() => { state.q = search.value.trim(); state.page = 1; syncClear(el); fetchAndPaint(el); }, 320);
    if (search) { search.addEventListener('input', onSearch); off(() => search.removeEventListener('input', onSearch)); }

    const sort = el.querySelector('#u-sort');
    if (sort) {
      const fn = () => { state.sort = sort.value; state.page = 1; syncClear(el); fetchAndPaint(el); };
      sort.addEventListener('change', fn); off(() => sort.removeEventListener('change', fn));
    }

    off(delegate(el, 'click', '[data-status]', (ev, btn) => {
      const s = btn.getAttribute('data-status');
      if (s === state.status) return;
      state.status = s; state.page = 1;
      el.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      syncClear(el); fetchAndPaint(el);
    }));

    const clear = () => {
      state.q = ''; state.status = 'all'; state.sort = 'new'; state.page = 1;
      const q = el.querySelector('#u-q'); if (q) q.value = '';
      const s = el.querySelector('#u-sort'); if (s) s.value = 'new';
      el.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', b.getAttribute('data-status') === 'all' ? 'true' : 'false'));
      syncClear(el); fetchAndPaint(el);
    };
    off(delegate(el, 'click', '[data-act="clear"], [data-empty-act="clear"]', clear));
    off(delegate(el, 'click', '[data-empty-act="retry"]', () => fetchAndPaint(el)));

    off(delegate(el, 'click', '[data-row-act]', (ev, btn) => {
      const act = btn.getAttribute('data-row-act');
      const id = Number(btn.getAttribute('data-id'));
      if (act === 'view') openUserDrawer(id, { onChanged: () => fetchAndPaint(el) });
      else if (act === 'disable') quickStatus(el, id, 'disabled');
      else if (act === 'enable') quickStatus(el, id, 'active');
      else if (act === 'delete') quickDelete(el, id);
    }));

    off(delegate(el, 'click', 'tbody tr[data-id]', (ev, tr) => {
      if (ev.target.closest('button,input,a,label')) return;
      openUserDrawer(Number(tr.getAttribute('data-id')), { onChanged: () => fetchAndPaint(el) });
    }));

    off(bindPager(el, (p) => { state.page = p; fetchAndPaint(el); }));
    syncClear(el);
  },
};

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (!btn) return;
  btn.classList.toggle('hide', !hasFilter(state.q, state.status, state.sort === 'new' ? '' : state.sort));
}
