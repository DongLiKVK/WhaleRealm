/* ═══════════════════════════════════════════════════════════════════════════
   鲸域 · 控制台 — 操作日志
   ---------------------------------------------------------------------------
   这一页回答两个问题：谁在什么时候做了什么、出事时能不能还原现场。
   所以列表只做"扫读"（时间 / 人 / 动作 / 对象 / 摘要 / 结果），
   真正的证据放在右侧抽屉的 detail JSON 里，按块折叠。

   权限模型与别的页不同：没有 log.viewAll 也能进来看，只是服务端会把范围
   强制收窄成"自己的日志"，前端据此显示一条说明；CSV 导出另外要 log.export，
   没有这个权限时按钮不渲染，而不是灰着占位。
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  api, esc, escAttr, fmt, icon, avatar, emptyHTML, pagerHTML, bindPager,
  hasFilter, delegate, debounce, toast, openDrawer, can, downloadCsv, todayInput,
} from './core.js';

const PAGE_SIZE = 20;

const TARGET_LABEL = {
  post: '帖子', user: '用户', reward: '奖励', role: '角色', admin: '管理员', auth: '会话',
};
const ROLE_LABEL = {
  owner: '超级管理员', admin: '管理员', editor: '编辑', staff: '运营',
};
const DETAIL_LABEL = { before: '变更前', after: '变更后', note: '备注' };

const state = {
  q: '', action: '', result: 'all', adminId: '', from: '', to: '',
  page: 1, items: [], total: 0, scope: 'all', actions: [], actionLabels: {},
  admins: [], loading: false, error: null,
};
let seq = 0;

/* ───────────────────────── 查询参数 ───────────────────────── */
function baseQuery() {
  return {
    q: state.q,
    action: state.action,
    adminId: can('log.viewAll') ? state.adminId : '',
    result: state.result === 'all' ? '' : state.result,
    from: state.from,
    to: state.to,
  };
}
function listQuery() {
  const q = baseQuery();
  q.page = state.page;
  q.pageSize = PAGE_SIZE;
  return q;
}
function exportQuery() {
  /* 导出不带分页：后端自己会截 5 万条，带上 page 只会让人误以为只导当前页 */
  return baseQuery();
}

/* ───────────────────────── 展示小件 ───────────────────────── */
function actionTone(action) {
  const a = String(action || '');
  if (a.indexOf('auth.') === 0) return 'auth';
  if (/(delete|revoke|disable|login_fail)$/.test(a)) return 'delete';
  if (/(create|grant|enable)$/.test(a)) return 'create';
  return 'update';
}
function actionTag(item) {
  return '<span class="tag tag--' + actionTone(item.action) + '" title="' + escAttr(item.action || '') + '">' +
    esc(item.actionLabel || item.action || '未知动作') + '</span>';
}
function resultHTML(result) {
  return result === 'ok'
    ? '<span class="result-ok">' + icon('checkCircle') + '成功</span>'
    : '<span class="result-fail">' + icon('alert') + '失败</span>';
}
function targetHTML(item) {
  const type = item.targetType ? (TARGET_LABEL[item.targetType] || item.targetType) : '';
  if (!type) return '<span class="muted">—</span>';
  return '<span class="log-target">' + esc(type) + (item.targetId ? ' #' + esc(String(item.targetId)) : '') + '</span>';
}
function roleText(key) {
  if (!key) return '—';
  return ROLE_LABEL[key] || key;
}

/* ───────────────────────── 结构 ───────────────────────── */
function shellHTML() {
  return '<section class="card list-card">' +
    '<div class="card-hd">' +
      '<div><h2>' + icon('logs') + '操作记录</h2>' +
        '<div class="meta" data-role="scope">正在读取…</div></div>' +
      '<div class="row" style="gap:8px">' +
        (can('log.export')
          ? '<button class="btn btn--sm" type="button" data-act="export">' + icon('download') + '导出 CSV</button>'
          : '') +
      '</div>' +
    '</div>' +
    (can('log.viewAll') ? '' :
      '<div class="log-note" data-role="self-note"><div class="notice notice--info">' + icon('info') +
        '<div class="notice-body">当前角色没有「查看全部日志」权限，这里只显示你自己的操作记录。</div></div></div>') +
    '<div class="filterbar">' +
      '<div class="input-wrap search">' + icon('search') +
        '<input class="input" id="lg-q" type="search" placeholder="搜索摘要或操作人" value="' + escAttr(state.q) + '" autocomplete="off">' +
      '</div>' +
      '<select class="select" id="lg-action" aria-label="按动作筛选"><option value="">全部动作</option></select>' +
      (can('log.viewAll') && can('admin.view')
        ? '<span data-role="admin-wrap"><select class="select" id="lg-admin" aria-label="按操作人筛选"><option value="">全部操作人</option></select></span>'
        : '') +
      '<select class="select" id="lg-result" aria-label="按结果筛选">' +
        '<option value="all"' + (state.result === 'all' ? ' selected' : '') + '>全部结果</option>' +
        '<option value="ok"' + (state.result === 'ok' ? ' selected' : '') + '>成功</option>' +
        '<option value="fail"' + (state.result === 'fail' ? ' selected' : '') + '>失败</option>' +
      '</select>' +
      '<input class="input date-input" id="lg-from" type="date" max="' + todayInput() + '" value="' + escAttr(state.from) + '" aria-label="开始日期">' +
      '<span class="date-sep" aria-hidden="true">至</span>' +
      '<input class="input date-input" id="lg-to" type="date" max="' + todayInput() + '" value="' + escAttr(state.to) + '" aria-label="结束日期">' +
      '<span class="spacer"></span>' +
      '<button class="btn btn--ghost btn--sm clear-btn' + (hasFilter(state.q, state.action, state.result, state.adminId, state.from, state.to) ? '' : ' hide') + '" type="button" data-act="clear">清空筛选</button>' +
    '</div>' +
    '<div class="tbl-wrap"><table class="tbl">' +
      '<thead><tr>' +
        '<th class="col-time" style="width:158px">时间</th>' +
        '<th style="width:176px">操作人</th>' +
        '<th style="width:132px">动作</th>' +
        '<th style="width:108px">对象</th>' +
        '<th>摘要</th>' +
        '<th style="width:118px">IP</th>' +
        '<th style="width:78px">结果</th>' +
      '</tr></thead>' +
      '<tbody data-role="rows"></tbody>' +
    '</table></div>' +
    '<div data-role="pager"></div>' +
  '</section>';
}

function rowHTML(l) {
  return '<tr data-log-id="' + escAttr(l.id) + '" tabindex="0" aria-label="查看日志 #' + escAttr(l.id) + '">' +
    '<td class="col-time"><div class="cell-time"><b class="tabular">' + esc(fmt.dateTime(l.createdAt)) + '</b>' +
      '<small>' + esc(fmt.rel(l.createdAt)) + '</small></div></td>' +
    '<td><div class="author-cell">' + avatar({ name: l.adminName, emoji: '🐳' }, 'avatar--sm') +
      '<div class="ac-txt"><b>' + esc(l.adminName || '未知') + '</b><small>' + esc(roleText(l.roleKey)) + '</small></div></div></td>' +
    '<td>' + actionTag(l) + '</td>' +
    '<td>' + targetHTML(l) + '</td>' +
    '<td><div class="log-summary">' + esc(l.summary || '—') + '</div></td>' +
    '<td class="mono">' + esc(l.ip || '—') + '</td>' +
    '<td>' + resultHTML(l.result) + '</td>' +
  '</tr>';
}

function skeletonHTML() {
  return '<tr><td colspan="7" style="padding:10px 12px"><div class="skel-table">' +
    Array.from({ length: 8 }).map(() => '<div class="skel-row"></div>').join('') +
  '</div></td></tr>';
}

/* ───────────────────────── 绘制 ───────────────────────── */
function paintMeta(el) {
  const meta = el.querySelector('[data-role="scope"]');
  if (!meta) return;
  if (state.loading && !state.total) { meta.textContent = '正在读取…'; return; }
  meta.textContent = '共 ' + fmt.int(state.total) + ' 条 · ' +
    (state.scope === 'self' ? '仅我自己的操作' : '全部管理员');
}

function paintActions(el) {
  const sel = el.querySelector('#lg-action');
  if (!sel) return;
  const cur = state.action;
  const opts = ['<option value="">全部动作</option>'];
  const seen = {};
  state.actions.forEach((a) => {
    seen[a.action] = true;
    opts.push('<option value="' + escAttr(a.action) + '">' + esc(a.label || a.action) + '（' + fmt.int(a.count) + '）</option>');
  });
  /* 选中的动作可能因为其它筛选暂时没有记录，仍要保留这一项，否则选择框会自己跳回"全部" */
  if (cur && !seen[cur]) {
    opts.push('<option value="' + escAttr(cur) + '">' + esc(state.actionLabels[cur] || cur) + '</option>');
  }
  sel.innerHTML = opts.join('');
  sel.value = cur;
}

function paintAdminSelect(el) {
  const sel = el.querySelector('#lg-admin');
  if (!sel) return;
  sel.innerHTML = '<option value="">全部操作人</option>' + state.admins.map((a) =>
    '<option value="' + escAttr(a.id) + '">' + esc(a.name || a.account) + '（@' + esc(a.account) + '）</option>'
  ).join('');
  sel.value = state.adminId;
}

function paintRows(el) {
  const rows = el.querySelector('[data-role="rows"]');
  if (!rows) return;
  if (state.loading) { rows.innerHTML = skeletonHTML(); return; }
  if (state.error) {
    rows.innerHTML = '<tr><td colspan="7">' + emptyHTML({
      icon: 'alert', title: '日志没能加载出来',
      text: (state.error && state.error.message) || '接口暂时没有响应，请稍后重试。',
      action: { label: '重新加载', act: 'retry' },
    }) + '</td></tr>';
    return;
  }
  if (!state.items.length) {
    const filtered = hasFilter(state.q, state.action, state.result, state.adminId, state.from, state.to);
    rows.innerHTML = '<tr><td colspan="7">' + emptyHTML(filtered
      ? { icon: 'search', title: '没有符合条件的日志', text: '换个关键字或把时间范围放宽一点试试。', action: { label: '清空筛选', act: 'clear', kind: '' } }
      : { icon: 'logs', title: '还没有操作记录', text: '管理员在后台的关键操作都会落到这里，方便日后追溯。' }
    ) + '</td></tr>';
    return;
  }
  rows.innerHTML = state.items.map(rowHTML).join('');
}

function paintPager(el) {
  const pager = el.querySelector('[data-role="pager"]');
  if (!pager) return;
  pager.innerHTML = (state.loading || state.error) ? '' : pagerHTML(state.page, state.total, PAGE_SIZE);
}

function paint(el) {
  paintMeta(el);
  paintActions(el);
  paintRows(el);
  paintPager(el);
  syncClear(el);
}

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (!btn) return;
  btn.classList.toggle('hide', !hasFilter(state.q, state.action, state.result, state.adminId, state.from, state.to));
}

/* ───────────────────────── 数据 ───────────────────────── */
async function load(el) {
  const my = ++seq;
  state.loading = true;
  state.error = null;
  paintRows(el);
  paintPager(el);
  paintMeta(el);
  try {
    const data = await api('/logs', { query: listQuery() });
    if (my !== seq) return;
    state.items = (data && data.items) || [];
    state.total = Number(data && data.total) || 0;
    state.scope = (data && data.scope) || 'all';
    state.actions = (data && data.actions) || [];
    state.actions.forEach((a) => { state.actionLabels[a.action] = a.label || a.action; });
    state.error = null;
  } catch (e) {
    if (my !== seq) return;
    state.items = [];
    state.total = 0;
    state.error = e;
  } finally {
    if (my === seq) {
      state.loading = false;
      paint(el);
    }
  }
}

async function loadAdmins(el) {
  if (!can('log.viewAll') || !can('admin.view')) return;
  try {
    const data = await api('/admins', { query: { status: 'all', page: 1, pageSize: 100 } });
    state.admins = (data && data.items) || [];
    paintAdminSelect(el);
  } catch (e) {
    /* 操作人筛选只是加速器，拉不到就收起来，不能因此让整页报错 */
    const wrap = el.querySelector('[data-role="admin-wrap"]');
    if (wrap) wrap.classList.add('hide');
  }
}

/* ───────────────────────── 详情抽屉 ───────────────────────── */
function escapeJSON(value) {
  let text;
  try { text = JSON.stringify(value, null, 2); } catch (e) { text = String(value); }
  if (text === undefined) text = 'null';
  return text;
}

/* 给 JSON 上色但先把文本转义：顺序反了会把用户可控内容当标签执行 */
function jsonHTML(value) {
  const text = escapeJSON(value);
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
  let out = '';
  let last = 0;
  let m = re.exec(text);
  while (m) {
    out += esc(text.slice(last, m.index));
    let cls = 'j-num';
    const token = m[1];
    if (token.charAt(0) === '"') cls = /:\s*$/.test(token) ? 'j-key' : 'j-str';
    else if (token === 'true' || token === 'false') cls = 'j-bool';
    else if (token === 'null') cls = 'j-null';
    out += '<span class="' + cls + '">' + esc(token) + '</span>';
    last = re.lastIndex;
    m = re.exec(text);
  }
  out += esc(text.slice(last));
  return out;
}

function foldHTML(label, value, open) {
  return '<details class="fold"' + (open ? ' open' : '') + '>' +
    '<summary>' + esc(label) + '</summary>' +
    '<div class="fold-bd"><pre class="json-box">' + jsonHTML(value) + '</pre></div>' +
  '</details>';
}

function detailBody(item) {
  const detail = (item.detail && typeof item.detail === 'object') ? item.detail : {};
  const keys = Object.keys(detail);
  const ordered = ['before', 'after', 'note'].filter((k) => keys.indexOf(k) >= 0)
    .concat(keys.filter((k) => ['before', 'after', 'note'].indexOf(k) < 0));

  let jsonPart = '';
  if (!keys.length) {
    jsonPart = '<div class="empty" style="padding:30px 12px"><div class="empty-art">' + icon('logs') + '</div>' +
      '<h3>这次操作没有附加详情</h3><p>不是所有动作都会记录字段变化，摘要与对象信息已足够定位。</p></div>';
  } else {
    jsonPart = '<div class="json-toolbar"><span class="tiny muted">detail · ' + keys.length + ' 个字段</span>' +
      '<div class="row" style="gap:6px">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-json-act="open">展开</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-json-act="close">收起</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-json-act="copy">' + icon('copy') + '复制 JSON</button>' +
      '</div></div>' +
      ordered.map((k) => foldHTML(DETAIL_LABEL[k] || k, detail[k], true)).join('');
  }

  return '<section class="d-sec"><h4>操作信息</h4>' +
    '<div class="detail-meta">' +
      '<div class="dm"><span>动作</span><b>' + esc(item.actionLabel || item.action) + ' <span class="mono">' + esc(item.action || '') + '</span></b></div>' +
      '<div class="dm"><span>结果</span><b>' + resultHTML(item.result) + '</b></div>' +
      '<div class="dm"><span>操作人</span><b>' + esc(item.adminName || '未知') + ' <span class="tiny muted">' + esc(roleText(item.roleKey)) + '</span></b></div>' +
      '<div class="dm"><span>时间</span><b>' + esc(fmt.dateTime(item.createdAt)) + '</b></div>' +
      '<div class="dm"><span>对象</span><b>' + targetHTML(item) + '</b></div>' +
      '<div class="dm"><span>IP</span><b class="mono">' + esc(item.ip || '—') + '</b></div>' +
    '</div>' +
    '<dl class="kv-list">' +
      '<div class="kv-row"><dt>日志编号</dt><dd class="mono">#' + esc(String(item.id)) + '</dd></div>' +
      '<div class="kv-row"><dt>摘要</dt><dd>' + esc(item.summary || '—') + '</dd></div>' +
    '</dl></section>' +
    '<section class="d-sec"><h4>变更详情</h4>' + jsonPart + '</section>';
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) resolve();
      else reject(new Error('浏览器不允许复制'));
    } catch (e) { reject(e); }
    ta.remove();
  });
}

function openLogDrawer(id) {
  const d = openDrawer({
    title: '日志 #' + id,
    subtitle: '<span class="muted">正在读取…</span>',
    wide: true,
    body: '<div class="skel-table">' + Array.from({ length: 6 }).map(() => '<div class="skel-row"></div>').join('') + '</div>',
    footer: '<button class="btn" type="button" data-close="1">关闭</button>',
  });
  let item = null;

  api('/logs/' + id).then((data) => {
    item = data || {};
    d.setTitle('日志 #' + (item.id || id));
    d.setSubtitle('<span class="muted">' + esc(fmt.dateTime(item.createdAt)) + ' · ' + esc(item.actionLabel || item.action || '') + '</span>');
    d.setBody(detailBody(item));
  }).catch((e) => {
    d.setBody(emptyHTML({
      icon: 'alert', title: '这条日志没能打开',
      text: (e && e.message) || '接口暂时没有响应，请稍后再试。',
    }));
  });

  d.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-json-act]');
    if (!b || !item) return;
    const act = b.getAttribute('data-json-act');
    if (act === 'open' || act === 'close') {
      d.el.querySelectorAll('details.fold').forEach((x) => { x.open = act === 'open'; });
      return;
    }
    if (act === 'copy') {
      try {
        await copyText(escapeJSON(item.detail || {}));
        toast('详情 JSON 已复制', 'ok');
      } catch (e) {
        toast('复制没有成功，请手动选择文本', 'err');
      }
    }
  });
}

/* ───────────────────────── 导出 ───────────────────────── */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

async function exportCsv(btn) {
  if (!btn || btn.disabled) return;
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>导出中…';
  try {
    await downloadCsv('/logs/export.csv', exportQuery(), 'admin-logs-' + stamp() + '.csv');
    toast('CSV 已开始下载', 'ok');
  } catch (e) {
    toast((e && e.message) || '导出失败，请稍后重试', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

/* ───────────────────────── 页面 ───────────────────────── */
export default {
  name: 'logs',
  title: '操作日志',
  /* 没有 log.viewAll 也能查看自己的日志，所以不设页面级权限；
     服务端会按身份收窄范围，页面把 scope 明确写出来。 */
  perm: '',
  async render(el, ctx) {
    el.innerHTML = shellHTML();
    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };

    const search = el.querySelector('#lg-q');
    const onSearch = debounce(() => {
      state.q = search.value.trim();
      state.page = 1;
      syncClear(el);
      load(el);
    }, 320);
    if (search) { search.addEventListener('input', onSearch); off(() => search.removeEventListener('input', onSearch)); }

    const actionSel = el.querySelector('#lg-action');
    if (actionSel) {
      const fn = () => { state.action = actionSel.value; state.page = 1; syncClear(el); load(el); };
      actionSel.addEventListener('change', fn);
      off(() => actionSel.removeEventListener('change', fn));
    }

    const adminSel = el.querySelector('#lg-admin');
    if (adminSel) {
      const fn = () => { state.adminId = adminSel.value; state.page = 1; syncClear(el); load(el); };
      adminSel.addEventListener('change', fn);
      off(() => adminSel.removeEventListener('change', fn));
    }

    const resultSel = el.querySelector('#lg-result');
    if (resultSel) {
      const fn = () => { state.result = resultSel.value; state.page = 1; syncClear(el); load(el); };
      resultSel.addEventListener('change', fn);
      off(() => resultSel.removeEventListener('change', fn));
    }

    ['#lg-from', '#lg-to'].forEach((id) => {
      const input = el.querySelector(id);
      if (!input) return;
      const fn = () => {
        state.from = el.querySelector('#lg-from').value;
        state.to = el.querySelector('#lg-to').value;
        state.page = 1;
        syncClear(el);
        load(el);
      };
      input.addEventListener('change', fn);
      off(() => input.removeEventListener('change', fn));
    });

    const clear = () => {
      state.q = ''; state.action = ''; state.result = 'all'; state.adminId = '';
      state.from = ''; state.to = ''; state.page = 1;
      const q = el.querySelector('#lg-q'); if (q) q.value = '';
      const a = el.querySelector('#lg-action'); if (a) a.value = '';
      const ad = el.querySelector('#lg-admin'); if (ad) ad.value = '';
      const r = el.querySelector('#lg-result'); if (r) r.value = 'all';
      const f = el.querySelector('#lg-from'); if (f) f.value = '';
      const t = el.querySelector('#lg-to'); if (t) t.value = '';
      syncClear(el);
      load(el);
    };

    off(delegate(el, 'click', '[data-act="clear"], [data-empty-act="clear"]', clear));
    off(delegate(el, 'click', '[data-empty-act="retry"]', () => load(el)));
    off(delegate(el, 'click', '[data-act="export"]', (ev, btn) => exportCsv(btn)));

    off(delegate(el, 'click', 'tr[data-log-id]', (ev, tr) => {
      if (ev.target.closest('button,a,input,label')) return;
      openLogDrawer(Number(tr.getAttribute('data-log-id')));
    }));
    off(delegate(el, 'keydown', 'tr[data-log-id]', (ev, tr) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      openLogDrawer(Number(tr.getAttribute('data-log-id')));
    }));

    off(bindPager(el, (p) => { state.page = p; load(el); }));

    ctx.cleanup(() => {
      seq += 1;
      offs.forEach((f) => { try { f(); } catch (e) {} });
    });

    syncClear(el);
    load(el);
    loadAdmins(el);
  },
};
