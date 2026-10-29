import {
  api, can, store, esc, escAttr, delegate, debounce, fmt, toast,
  openModal, confirmDialog, errText, icon, avatar, statusPill, emptyHTML,
  pagerHTML, hasFilter, clamp,
} from './core.js';

/* 角色页把两件事放在同一屏：谁能做什么（矩阵），以及谁在用这个角色（账号表）。
   运营改权限时最想知道的正是"这次改的是不是我自己"，所以账号表不另开页。 */

const PAGE_SIZE = 10;
const TOTAL_PERMS = 18;

const state = {
  roles: [],
  catalog: [],
  catalogError: '',
  selectedId: 0,
  draft: new Set(),
  saving: false,
  pageError: '',
  admins: [],
  adminTotal: 0,
  adminPage: 1,
  adminQ: '',
  adminRole: 'all',
  adminStatus: 'all',
  adminLoading: false,
  adminError: '',
  adminSeq: 0,
};

const currentRole = () => state.roles.find((r) => r.id === state.selectedId) || null;
const isOwnerRole = (r) => !!r && r.key === 'owner';
const isBuiltin = (r) => !!(r && r.builtin);

/* ───────────────────────── 角色列表 ───────────────────────── */

function roleItemHTML(r) {
  const active = r.id === state.selectedId;
  return '<button class="role-item' + (active ? ' is-active' : '') + '" type="button" ' +
    'data-role-pick="' + r.id + '" aria-current="' + (active ? 'true' : 'false') + '">' +
    '<span class="role-main"><b>' + esc(r.name || '未命名角色') +
      (isBuiltin(r) ? '<span class="builtin">内置</span>' : '') + '</b>' +
      '<small>' + esc(r.description || '还没有填写说明') + '</small></span>' +
    '<span class="role-count">' + fmt.int(r.memberCount || 0) + ' 人</span>' +
  '</button>';
}

function roleCardHTML() {
  const canManage = can('role.manage');
  return '<div class="card-hd">' +
      '<h2>' + icon('shield') + '角色 <span class="tiny muted">' + state.roles.length + ' 个</span></h2>' +
      (canManage ? '<button class="btn btn--primary btn--sm" type="button" data-new-role="1">' + icon('plus') + '新建角色</button>' : '') +
    '</div>' +
    '<div class="role-list">' +
      (state.roles.length ? state.roles.map(roleItemHTML).join('') :
        emptyHTML({ icon: 'shield', title: '还没有角色', text: '先建一个角色，再为它勾选权限。' })) +
    '</div>';
}

/* ───────────────────────── 权限矩阵 ───────────────────────── */

function matrixHTML() {
  const role = currentRole();
  if (!role) return emptyHTML({ icon: 'shield', title: '先选择一个角色', text: '左侧会列出所有角色。' });

  const canManage = can('role.manage');
  const locked = isOwnerRole(role) || !canManage;
  const total = state.catalog.reduce((n, g) => n + g.items.length, 0) || TOTAL_PERMS;

  let body = '';
  if (state.catalogError) {
    body = '<div class="notice notice--err" style="margin:0 18px 12px">' +
      icon('alert') + '<div>权限目录没能加载：' + esc(state.catalogError) +
      '<button class="link-btn" type="button" data-retry-catalog="1">重试</button></div></div>';
  } else if (!state.catalog.length) {
    body = '<div class="perm-groups"><div class="skel skel-row" style="width:30%"></div>' +
      '<div class="skel skel-row" style="width:88%"></div><div class="skel skel-row" style="width:74%"></div>' +
      '<div class="skel skel-row" style="width:82%"></div></div>';
  } else {
    body = '<div class="perm-groups">' + state.catalog.map((g) => {
      return '<section class="perm-group"><h4>' + esc(g.label) + '<span>' + g.items.length + ' 项</span></h4>' +
        '<div class="perm-grid">' + g.items.map((it) => {
          const checked = state.draft.has(it.key);
          const id = 'perm-' + it.key.replace(/\./g, '-');
          return '<label class="perm-item' + (locked ? ' is-locked' : '') + '" for="' + id + '">' +
            '<input type="checkbox" id="' + id + '" data-perm="' + escAttr(it.key) + '"' +
              (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '>' +
            '<span class="pi-main"><b>' + esc(it.label) + '<code>' + esc(it.key) + '</code></b>' +
              '<small>' + esc(it.desc || '') + '</small></span></label>';
        }).join('') + '</div></section>';
    }).join('') + '</div>';
  }

  const deleteBtn = (canManage && !isBuiltin(role) && !isOwnerRole(role))
    ? '<button class="btn btn--danger btn--sm" type="button" data-del-role="1">' + icon('trash') + '删除角色</button>' : '';
  const saveBtn = (canManage && !isOwnerRole(role))
    ? '<button class="btn btn--primary btn--sm" type="button" data-save-perms="1" disabled>保存权限</button>' : '';

  let footer = '';
  if (canManage && !isOwnerRole(role)) {
    footer = '<div class="card-ft">' +
      '<div class="row gap-10"><span class="tiny muted">已选 <b class="num" data-role="perm-count">' + state.draft.size + '</b> / ' + total + ' 项</span>' +
        '<span class="tiny muted" data-role="dirty"></span></div>' +
      '<div class="row gap-8">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-reset-perms="1" disabled>还原</button>' +
        saveBtn +
      '</div></div>';
  } else {
    footer = '<div class="card-ft"><span class="tiny muted">' +
      (isOwnerRole(role) ? '超级管理员固定拥有全部权限，这样不会把自己锁在门外。' : '当前账号只能查看权限，修改需要「管理角色」权限。') +
      '</span></div>';
  }

  return '<div class="card-hd matrix-hd">' +
      '<div><h2>' + esc(role.name || '未命名角色') +
        (isBuiltin(role) ? '<span class="builtin">内置</span>' : '') + '</h2>' +
        '<div class="sub">' + esc(role.description || '未填写角色说明') + ' · ' + fmt.int(role.memberCount || 0) + ' 名管理员在用</div></div>' +
      '<div class="row gap-8">' + deleteBtn + '</div>' +
    '</div>' +
    (isOwnerRole(role) ? '<div class="notice notice--info matrix-note">' + icon('info') +
      '<div>owner 角色的权限只读：它始终拥有全部 18 项权限，避免误操作后没人能进后台。</div></div>' : '') +
    body + footer;
}

function paintRoles(el) {
  const box = el.querySelector('[data-role="role-card"]');
  if (box) box.innerHTML = roleCardHTML();
}

function paintMatrix(el) {
  const box = el.querySelector('[data-role="matrix-card"]');
  if (box) box.innerHTML = matrixHTML();
}

function isDirty() {
  const r = currentRole();
  if (!r || isOwnerRole(r)) return false;
  const saved = r.permissions || [];
  if (saved.length !== state.draft.size) return true;
  return saved.some((k) => !state.draft.has(k));
}

function updateMatrixFooter(el) {
  const count = el.querySelector('[data-role="perm-count"]');
  if (count) count.textContent = String(state.draft.size);
  const dirtyEl = el.querySelector('[data-role="dirty"]');
  if (dirtyEl) dirtyEl.textContent = isDirty() ? '有未保存的修改' : '';
  const save = el.querySelector('[data-save-perms]');
  if (save) {
    save.disabled = state.saving || !isDirty();
    save.textContent = state.saving ? '保存中…' : '保存权限';
  }
  const reset = el.querySelector('[data-reset-perms]');
  if (reset) reset.disabled = state.saving || !isDirty();
}

function matrixNotice(el, message, kind) {
  const card = el.querySelector('[data-role="matrix-card"]');
  if (!card) return;
  let n = card.querySelector('[data-role="matrix-error"]');
  if (!n) {
    n = document.createElement('div');
    n.setAttribute('data-role', 'matrix-error');
    n.className = 'notice matrix-note';
    const hd = card.querySelector('.card-hd');
    if (hd && hd.nextSibling) card.insertBefore(n, hd.nextSibling);
    else card.appendChild(n);
  }
  n.className = 'notice matrix-note ' + (kind === 'ok' ? 'notice--ok' : 'notice--err');
  n.innerHTML = icon(kind === 'ok' ? 'checkCircle' : 'alert') + '<div>' + esc(message) + '</div>';
}

async function pickRole(el, id) {
  if (id === state.selectedId) return;
  if (isDirty()) {
    const ok = await confirmDialog({
      title: '放弃未保存的权限修改？',
      message: '切换到其他角色会丢掉这次勾选，再点「保存权限」才会写入。',
      okText: '放弃并切换',
      danger: true,
    });
    if (!ok) return;
  }
  state.selectedId = id;
  const r = currentRole();
  state.draft = new Set((r && r.permissions) || []);
  paintRoles(el);
  paintMatrix(el);
}

async function savePerms(el) {
  const role = currentRole();
  if (!role || state.saving) return;
  if (!isDirty()) { toast('权限没有变化', 'info'); return; }
  state.saving = true;
  updateMatrixFooter(el);
  try {
    const res = await api('/roles/' + role.id, { method: 'PUT', body: { permissions: Array.from(state.draft) } });
    const saved = (res && res.role) || res || {};
    role.permissions = (saved.permissions || Array.from(state.draft)).slice();
    state.draft = new Set(role.permissions);
    state.saving = false;
    paintMatrix(el);
    toast('已保存「' + role.name + '」的权限', 'ok');
  } catch (e) {
    state.saving = false;
    updateMatrixFooter(el);
    const msg = errText(e, '权限保存失败');
    matrixNotice(el, msg, 'err');
    toast(msg, 'err');
  }
}

function resetDraft(el) {
  const role = currentRole();
  if (!role) return;
  state.draft = new Set(role.permissions || []);
  paintMatrix(el);
}

async function deleteRole(el) {
  const role = currentRole();
  if (!role) return;
  const ok = await confirmDialog({
    title: '删除角色「' + role.name + '」？',
    message: '删除后不可恢复。如果还有管理员在用这个角色，后端会拒绝，并告诉你还有几个人。',
    okText: '删除角色',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('/roles/' + role.id, { method: 'DELETE' });
    toast('角色已删除', 'ok');
    state.selectedId = 0;
    await reloadRoles(el);
  } catch (e) {
    /* 409 的 message 已经写明"还有 N 个管理员使用该角色"，原样展示比翻译成通用错误更有用 */
    const msg = errText(e, '角色删除失败');
    matrixNotice(el, msg, 'err');
    toast(msg, 'err');
  }
}

/* ───────────────────────── 角色新建 ───────────────────────── */

function openCreateRole(el) {
  const ctx = openModal({
    title: '新建角色',
    subtitle: '先建角色，再在权限矩阵里勾选它能做什么。',
    body: '<div class="field"><label for="nr-name">角色名称<span class="req">*</span></label>' +
        '<input class="input" id="nr-name" maxlength="20" placeholder="例如：社区版主" autocomplete="off">' +
        '<div class="hint">2~20 个字，建议用职责命名，不要用人名。</div></div>' +
      '<div class="field mt-12"><label for="nr-desc">角色说明</label>' +
        '<textarea class="textarea" id="nr-desc" maxlength="120" placeholder="一句话说明这个角色负责什么"></textarea></div>' +
      '<div class="err-tip hide mt-8" data-role="err"></div>',
    footer: '<button class="btn" type="button" data-act="cancel">取消</button>' +
      '<button class="btn btn--primary" type="button" data-act="create">创建角色</button>',
  });
  wireModalCancel(ctx);
  const name = ctx.body.querySelector('#nr-name');
  const desc = ctx.body.querySelector('#nr-desc');
  const err = ctx.body.querySelector('[data-role="err"]');
  const btn = ctx.footer.querySelector('[data-act="create"]');
  name.focus();

  const fail = (msg) => { err.textContent = msg; err.classList.remove('hide'); };
  const submit = async () => {
    const v = name.value.trim();
    if (v.length < 2 || v.length > 20) { fail('角色名需 2~20 个字'); name.focus(); return; }
    if (state.roles.some((r) => r.name === v)) { fail('已有同名角色，换一个名字'); name.focus(); return; }
    err.classList.add('hide');
    btn.disabled = true;
    btn.textContent = '创建中…';
    try {
      const res = await api('/roles', { method: 'POST', body: { name: v, description: desc.value.trim(), permissions: [] } });
      const role = (res && res.role) || res;
      ctx.close();
      toast('角色已创建，接下来勾选权限', 'ok');
      await reloadRoles(el, role && role.id);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '创建角色';
      fail(errText(e, '创建失败'));
    }
  };
  btn.addEventListener('click', submit);
  ctx.body.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target !== desc) { ev.preventDefault(); submit(); }
  });
}

/* openModal 只负责渲染外框，取消键由各个表单自己接，避免误关正在提交的表单 */
function wireModalCancel(ctx) {
  ctx.footer.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act="cancel"]')) ctx.close();
  });
}

/* ───────────────────────── 管理员账号 ───────────────────────── */

function roleFilterOptions() {
  return state.roles.map((r) => '<option value="' + r.id + '"' +
    (String(r.id) === String(state.adminRole) ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('');
}

function roleOptions(selectedId) {
  return state.roles.map((r) => '<option value="' + r.id + '"' + (r.id === selectedId ? ' selected' : '') + '>' +
    esc(r.name) + (isBuiltin(r) ? '（内置）' : '') + '</option>').join('');
}

function adminCardHTML() {
  return '<div class="card-hd"><h2>' + icon('user') + '管理员账号 <span class="tiny muted" data-role="admin-meta">—</span></h2>' +
      (can('admin.manage') ? '<button class="btn btn--primary btn--sm" type="button" data-new-admin="1">' + icon('plus') + '新建管理员</button>' : '') +
    '</div>' +
    '<div class="filterbar">' +
      '<div class="input-wrap fb-search">' + icon('search') +
        '<input class="input" id="ro-admin-q" type="search" placeholder="搜索账号或名称" value="' + escAttr(state.adminQ) + '" aria-label="搜索管理员"></div>' +
      '<select class="select" data-admin-filter="role" aria-label="按角色筛选"><option value="all">全部角色</option>' + roleFilterOptions() + '</select>' +
      '<select class="select" data-admin-filter="status" aria-label="按状态筛选">' +
        '<option value="all"' + (state.adminStatus === 'all' ? ' selected' : '') + '>全部状态</option>' +
        '<option value="active"' + (state.adminStatus === 'active' ? ' selected' : '') + '>启用</option>' +
        '<option value="disabled"' + (state.adminStatus === 'disabled' ? ' selected' : '') + '>停用</option>' +
      '</select>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-clear-admin="1">清空</button>' +
    '</div>' +
    '<div data-role="admin-table"></div>';
}

/* 两步验证状态：owner/admin 是强制角色，未绑定时下次登录会被拦下来扫码。
   列表里直接标出来，运营不用点进详情才知道谁还没配验证器。 */
const MANDATORY_2FA_ROLES = new Set(['owner', 'admin']);
function twoFactorPill(a) {
  if (a.totpEnabled) {
    const at = a.totpConfirmedAt ? '，' + fmt.date(a.totpConfirmedAt) + ' 起生效' : '';
    return '<span class="pill pill--brand" title="' + escAttr('验证器已绑定' + at) + '">已绑定</span>';
  }
  const tip = MANDATORY_2FA_ROLES.has(a.roleKey)
    ? '该角色强制两步验证，下次登录时必须扫码绑定'
    : '还没绑定验证器，下次登录可以顺手绑定';
  return '<span class="pill pill--hidden" title="' + escAttr(tip) + '">未绑定</span>';
}

function adminRowHTML(a) {
  const me = store.admin && store.admin.id;
  const self = a.id === me;
  const manage = can('admin.manage');
  const acts = self
    ? '<span class="tiny muted">本人账号</span>'
    : (manage ? '<div class="acts">' +
        '<button class="icon-btn" type="button" data-admin-act="role" data-id="' + a.id + '" title="改角色" aria-label="修改 ' + escAttr(a.account) + ' 的角色">' + icon('shield') + '</button>' +
        '<button class="icon-btn" type="button" data-admin-act="reset" data-id="' + a.id + '" title="重置密码" aria-label="重置 ' + escAttr(a.account) + ' 的密码">' + icon('key') + '</button>' +
        (a.totpEnabled ? '<button class="icon-btn" type="button" data-admin-act="reset2fa" data-id="' + a.id + '" title="重置两步验证" aria-label="重置 ' + escAttr(a.account) + ' 的两步验证">' + icon('refresh') + '</button>' : '') +
        (a.status === 'disabled'
          ? '<button class="icon-btn" type="button" data-admin-act="enable" data-id="' + a.id + '" title="启用" aria-label="启用 ' + escAttr(a.account) + '">' + icon('unlock') + '</button>'
          : '<button class="icon-btn" type="button" data-admin-act="disable" data-id="' + a.id + '" title="停用" aria-label="停用 ' + escAttr(a.account) + '">' + icon('ban') + '</button>') +
        '<button class="icon-btn" type="button" data-admin-act="delete" data-id="' + a.id + '" title="删除" aria-label="删除管理员 ' + escAttr(a.account) + '">' + icon('trash') + '</button>' +
      '</div>' : '<span class="tiny muted">—</span>');

  return '<tr>' +
    '<td><div class="author-cell">' + avatar({ name: a.name || a.account }, 'avatar--sm') +
      '<div class="ac-txt"><b>' + esc(a.name || a.account) + (self ? '<span class="self-mark">本人</span>' : '') + '</b>' +
        '<small>@' + esc(a.account) + '</small></div></div></td>' +
    '<td><span class="role-pill"><span class="dot"></span>' + esc(a.roleName || a.roleKey || '未分配') + '</span></td>' +
    '<td>' + twoFactorPill(a) + '</td>' +
    '<td>' + statusPill('admin', a.status) + '</td>' +
    '<td><div class="cell-main"><span>' + (a.lastLoginAt ? fmt.rel(a.lastLoginAt) : '从未登录') + '</span>' +
      '<small class="tiny muted">' + esc(a.lastLoginIp || '—') + '</small></div></td>' +
    '<td class="col-time">' + fmt.date(a.createdAt) + '</td>' +
    '<td class="col-acts">' + acts + '</td>' +
  '</tr>';
}

function adminTableHTML() {
  if (state.adminLoading) {
    return '<div class="skel-table">' + Array.from({ length: 5 }).map(() => '<div class="skel skel-row"></div>').join('') + '</div>';
  }
  if (state.adminError) {
    return '<div class="tbl-empty">' + emptyHTML({
      icon: 'alert', title: '管理员列表没能加载',
      text: state.adminError,
      action: { label: '重新加载', act: 'retry-admins', kind: 'btn' },
    }) + '</div>';
  }
  if (!state.admins.length) {
    return '<div class="tbl-empty">' + emptyHTML({
      icon: 'user', title: '没有找到管理员',
      text: hasFilter(state.adminQ, state.adminRole, state.adminStatus) ? '换个关键词，或把筛选切回全部。' : '这个世界还没有管理员账号。',
    }) + '</div>';
  }
  return '<div class="tbl-wrap"><table class="tbl">' +
    '<thead><tr><th style="width:210px">管理员</th><th style="width:120px">角色</th>' +
      '<th style="width:104px">两步验证</th><th style="width:76px">状态</th>' +
      '<th style="width:150px">最后登录</th><th class="col-time" style="width:100px">创建时间</th><th class="col-acts" style="width:168px">操作</th></tr></thead>' +
    '<tbody>' + state.admins.map(adminRowHTML).join('') + '</tbody></table></div>' +
    pagerHTML(state.adminPage, state.adminTotal, PAGE_SIZE);
}

function paintAdminTable(el) {
  const box = el.querySelector('[data-role="admin-table"]');
  if (!box) return;
  box.innerHTML = adminTableHTML();
  const meta = el.querySelector('[data-role="admin-meta"]');
  if (meta) meta.textContent = state.adminLoading ? '加载中…' : '共 ' + fmt.int(state.adminTotal) + ' 人';
}

async function loadAdmins(el) {
  if (!can('admin.view')) return;
  const seq = ++state.adminSeq;
  state.adminLoading = true;
  state.adminError = '';
  paintAdminTable(el);
  try {
    const res = await api('/admins', {
      query: {
        q: state.adminQ,
        roleId: state.adminRole === 'all' ? '' : state.adminRole,
        status: state.adminStatus,
        page: state.adminPage,
        pageSize: PAGE_SIZE,
      },
    });
    if (seq !== state.adminSeq) return;
    state.admins = (res && res.items) || [];
    state.adminTotal = (res && res.total) || 0;
    const pages = Math.max(1, Math.ceil(state.adminTotal / PAGE_SIZE));
    if (state.adminPage > pages) state.adminPage = pages;
  } catch (e) {
    if (seq !== state.adminSeq) return;
    state.admins = [];
    state.adminTotal = 0;
    state.adminError = errText(e, '管理员接口暂时没有响应');
  } finally {
    if (seq === state.adminSeq) {
      state.adminLoading = false;
      paintAdminTable(el);
    }
  }
}

/* ── 新建管理员 ── */
function openCreateAdmin(el) {
  const ctx = openModal({
    title: '新建管理员',
    subtitle: '初始密码只显示这一次，请通过安全渠道交给对方。',
    body:
      '<div class="field"><label for="na-account">登录账号<span class="req">*</span></label>' +
        '<input class="input" id="na-account" maxlength="32" autocomplete="off" placeholder="字母、数字、下划线、点或连字符">' +
        '<div class="hint">3~32 位，创建后不可修改。</div></div>' +
      '<div class="field mt-12"><label for="na-name">显示名称<span class="req">*</span></label>' +
        '<input class="input" id="na-name" maxlength="20" autocomplete="off" placeholder="例如：小林"></div>' +
      '<div class="field mt-12"><label for="na-password">初始密码<span class="req">*</span></label>' +
        '<div class="input-wrap"><input class="input" id="na-password" type="password" maxlength="64" autocomplete="new-password">' +
        '<button class="icon-btn" type="button" data-toggle-pw="na-password" aria-label="显示或隐藏密码" title="显示密码">' + icon('eye') + '</button></div>' +
        '<div class="hint">8～64 位，需同时包含字母和数字。对方登录后可在账号菜单里改密码。</div></div>' +
      '<div class="field mt-12"><label for="na-role">角色<span class="req">*</span></label>' +
        '<select class="select" id="na-role">' + roleOptions(state.roles.find((r) => r.key === 'staff') ? state.roles.find((r) => r.key === 'staff').id : '') + '</select></div>' +
      '<div class="err-tip hide mt-8" data-role="err"></div>',
    footer: '<button class="btn" type="button" data-act="cancel">取消</button>' +
      '<button class="btn btn--primary" type="button" data-act="create">创建账号</button>',
  });
  wireModalCancel(ctx);
  const account = ctx.body.querySelector('#na-account');
  const name = ctx.body.querySelector('#na-name');
  const password = ctx.body.querySelector('#na-password');
  const role = ctx.body.querySelector('#na-role');
  const err = ctx.body.querySelector('[data-role="err"]');
  const btn = ctx.footer.querySelector('[data-act="create"]');
  account.focus();

  ctx.body.querySelector('[data-toggle-pw]').addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    ctx.body.querySelector('[data-toggle-pw]').innerHTML = icon(show ? 'eyeOff' : 'eye');
  });

  const fail = (msg) => { err.textContent = msg; err.classList.remove('hide'); };
  const submit = async () => {
    const acc = account.value.trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(acc)) { fail('账号需 3~32 位，只能用字母、数字、下划线、点和连字符'); account.focus(); return; }
    if (!name.value.trim()) { fail('请填写显示名称'); name.focus(); return; }
    if (password.value.length < 8 || password.value.length > 64) { fail('初始密码需为 8～64 位'); password.focus(); return; }
    if (!/[A-Za-z]/.test(password.value) || !/[0-9]/.test(password.value)) { fail('初始密码需同时包含字母和数字'); password.focus(); return; }
    if (!role.value) { fail('请选择角色'); role.focus(); return; }
    err.classList.add('hide');
    btn.disabled = true;
    btn.textContent = '创建中…';
    try {
      await api('/admins', { method: 'POST', body: { account: acc, name: name.value.trim(), password: password.value, roleId: Number(role.value) } });
      ctx.close();
      toast('管理员 ' + acc + ' 已创建', 'ok');
      await Promise.all([reloadRoles(el), loadAdmins(el)]);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '创建账号';
      fail(errText(e, '创建失败'));
    }
  };
  btn.addEventListener('click', submit);
  ctx.body.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
  });
}

/* ── 改角色 ── */
function openChangeRole(el, admin) {
  const ctx = openModal({
    title: '调整「' + (admin.name || admin.account) + '」的角色',
    subtitle: '角色决定他能看到哪些页面、能做哪些操作，保存后立即生效。',
    body: '<div class="field"><label for="cr-role">角色</label><select class="select" id="cr-role">' +
        roleOptions(admin.roleId) + '</select></div>' +
      '<div class="err-tip hide mt-8" data-role="err"></div>',
    footer: '<button class="btn" type="button" data-act="cancel">取消</button>' +
      '<button class="btn btn--primary" type="button" data-act="save">保存</button>',
  });
  wireModalCancel(ctx);
  const sel = ctx.body.querySelector('#cr-role');
  const err = ctx.body.querySelector('[data-role="err"]');
  const btn = ctx.footer.querySelector('[data-act="save"]');
  sel.focus();
  btn.addEventListener('click', async () => {
    if (Number(sel.value) === admin.roleId) { ctx.close(); return; }
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      await api('/admins/' + admin.id, { method: 'PATCH', body: { roleId: Number(sel.value) } });
      ctx.close();
      toast('角色已更新', 'ok');
      await Promise.all([reloadRoles(el), loadAdmins(el)]);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '保存';
      err.textContent = errText(e, '角色调整失败');
      err.classList.remove('hide');
    }
  });
}

/* ── 重置密码 ── */
function openResetPassword(el, admin) {
  const ctx = openModal({
    title: '重置「' + (admin.name || admin.account) + '」的密码',
    subtitle: '旧密码会立即失效，对方需要重新登录。',
    body: '<div class="field"><label for="rp-pw">新密码<span class="req">*</span></label>' +
        '<div class="input-wrap"><input class="input" id="rp-pw" type="password" maxlength="64" autocomplete="new-password">' +
        '<button class="icon-btn" type="button" data-toggle-pw="rp-pw" aria-label="显示或隐藏密码" title="显示密码">' + icon('eye') + '</button></div>' +
        '<div class="hint">8～64 位，需同时包含字母和数字；建议用一次性密码，让对方登录后自己改。</div></div>' +
      '<div class="err-tip hide mt-8" data-role="err"></div>',
    footer: '<button class="btn" type="button" data-act="cancel">取消</button>' +
      '<button class="btn btn--primary" type="button" data-act="save">确认重置</button>',
  });
  wireModalCancel(ctx);
  const pw = ctx.body.querySelector('#rp-pw');
  const err = ctx.body.querySelector('[data-role="err"]');
  const btn = ctx.footer.querySelector('[data-act="save"]');
  pw.focus();
  ctx.body.querySelector('[data-toggle-pw]').addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    ctx.body.querySelector('[data-toggle-pw]').innerHTML = icon(show ? 'eyeOff' : 'eye');
  });
  btn.addEventListener('click', async () => {
    if (pw.value.length < 8 || pw.value.length > 64) {
      err.textContent = '新密码需为 8～64 位';
      err.classList.remove('hide');
      pw.focus();
      return;
    }
    if (!/[A-Za-z]/.test(pw.value) || !/[0-9]/.test(pw.value)) {
      err.textContent = '新密码需同时包含字母和数字';
      err.classList.remove('hide');
      pw.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '重置中…';
    try {
      await api('/admins/' + admin.id + '/reset-password', { method: 'POST', body: { newPassword: pw.value } });
      ctx.close();
      toast('密码已重置，请通过安全渠道告知对方', 'ok');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '确认重置';
      err.textContent = errText(e, '重置失败');
      err.classList.remove('hide');
    }
  });
}

/* ── 停用 / 启用 / 删除 ── */
async function toggleAdmin(el, admin, next) {
  const ok = await confirmDialog({
    title: (next === 'disabled' ? '停用' : '启用') + '「' + (admin.name || admin.account) + '」？',
    message: next === 'disabled'
      ? '停用后该账号会立刻退出后台，且无法再登录；数据与操作记录都会保留。'
      : '启用后该账号可以重新登录，权限沿用当前角色。',
    okText: next === 'disabled' ? '停用账号' : '启用账号',
    danger: next === 'disabled',
  });
  if (!ok) return;
  try {
    await api('/admins/' + admin.id, { method: 'PATCH', body: { status: next } });
    toast(next === 'disabled' ? '账号已停用' : '账号已启用', 'ok');
    await loadAdmins(el);
  } catch (e) {
    toast(errText(e, '状态修改失败'), 'err');
  }
}

async function resetTwoFactor(el, admin) {
  const ok = await confirmDialog({
    title: '重置「' + (admin.name || admin.account) + '」的两步验证？',
    message: '验证器绑定会立即清除，该账号所有登录会话同时失效；下次登录需要重新扫码绑定。只有对方换了手机或验证器丢失时才需要这样做。',
    okText: '重置两步验证',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('/admins/' + admin.id + '/reset-2fa', { method: 'POST' });
    toast('两步验证已重置，请让对方下次登录时重新扫码', 'ok');
    await loadAdmins(el);
  } catch (e) {
    toast(errText(e, '重置失败'), 'err');
  }
}

async function deleteAdmin(el, admin) {
  const ok = await confirmDialog({
    title: '删除管理员「' + admin.account + '」？',
    message: '账号会被永久删除，历史操作日志仍保留。若这是最后一个启用的超级管理员，后端会拒绝。',
    okText: '删除账号',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('/admins/' + admin.id, { method: 'DELETE' });
    toast('管理员已删除', 'ok');
    await Promise.all([reloadRoles(el), loadAdmins(el)]);
  } catch (e) {
    toast(errText(e, '删除失败'), 'err');
  }
}

/* ───────────────────────── 数据加载 ───────────────────────── */

async function reloadRoles(el, selectId) {
  try {
    const res = await api('/roles');
    state.roles = (res && res.items) || [];
    const want = selectId != null ? selectId : state.selectedId;
    if (!state.roles.some((r) => r.id === want)) {
      state.selectedId = state.roles.length ? state.roles[0].id : 0;
    } else {
      state.selectedId = want;
    }
    const r = currentRole();
    if (!isDirty()) state.draft = new Set((r && r.permissions) || []);
    paintRoles(el);
    if (!isDirty()) paintMatrix(el);
    /* 角色增删后，账号筛选里的下拉也要跟着换，否则会出现一个选不中的旧选项 */
    const filter = el.querySelector('[data-admin-filter="role"]');
    if (filter) {
      if (filter.value !== 'all' && !state.roles.some((r) => String(r.id) === filter.value)) {
        state.adminRole = 'all';
      }
      filter.innerHTML = '<option value="all">全部角色</option>' + roleFilterOptions();
      filter.value = state.adminRole === 'all' ? 'all' : String(state.adminRole);
    }
  } catch (e) {
    toast(errText(e, '角色列表刷新失败'), 'err');
  }
}

async function ensureCatalog(el) {
  if (state.catalog.length) return;
  state.catalogError = '';
  paintMatrix(el);
  try {
    const res = await api('/permissions');
    state.catalog = (res && res.groups) || [];
    store.permCatalog = state.catalog;
    if (!state.catalog.length) throw new Error('权限目录为空');
  } catch (e) {
    state.catalogError = errText(e, '权限目录加载失败');
  }
  paintMatrix(el);
}

function layoutHTML() {
  return '<div class="roles-grid">' +
      '<section class="card" data-role="role-card"></section>' +
      '<section class="card" data-role="matrix-card"></section>' +
    '</div>' +
    (can('admin.view') ? '<section class="card admin-sec" data-role="admin-card">' + adminCardHTML() + '</section>' : '');
}

function skeletonHTML() {
  return '<div class="roles-grid">' +
      '<section class="card"><div class="card-hd"><div class="skel skel-row" style="width:42%;margin:0"></div></div>' +
        '<div class="card-bd">' + Array.from({ length: 5 }).map(() => '<div class="skel skel-row"></div>').join('') + '</div></section>' +
      '<section class="card"><div class="card-hd"><div class="skel skel-row" style="width:35%;margin:0"></div></div>' +
        '<div class="card-bd"><div class="skel skel-row" style="width:88%"></div><div class="skel skel-row" style="width:74%"></div>' +
        '<div class="skel skel-row" style="width:82%"></div><div class="skel skel-row" style="width:66%"></div></div></section>' +
    '</div>' +
    '<section class="card admin-sec"><div class="skel-table">' +
      Array.from({ length: 4 }).map(() => '<div class="skel skel-row"></div>').join('') + '</div></section>';
}

function errorHTML(message) {
  return '<section class="card"><div class="tbl-empty">' + emptyHTML({
    icon: 'alert', title: '角色没能加载出来', text: message,
    action: { label: '重新加载', act: 'retry-page', kind: 'btn' },
  }) + '</div></section>';
}

async function loadPage(el) {
  state.pageError = '';
  el.innerHTML = skeletonHTML();
  let res;
  try {
    res = await api('/roles');
  } catch (e) {
    state.pageError = errText(e, '接口暂时没有响应');
    el.innerHTML = errorHTML(state.pageError);
    return;
  }
  state.roles = (res && res.items) || [];
  if (!state.roles.some((r) => r.id === state.selectedId)) {
    state.selectedId = state.roles.length ? state.roles[0].id : 0;
  }
  const role = currentRole();
  state.draft = new Set((role && role.permissions) || []);
  state.catalog = store.permCatalog || [];
  el.innerHTML = layoutHTML();
  paintRoles(el);
  paintMatrix(el);
  if (!state.catalog.length) ensureCatalog(el);
  if (can('admin.view')) loadAdmins(el);
}

/* ───────────────────────── 入口 ───────────────────────── */

function render(el, ctx) {
  if (!can('role.view')) return;
  let mounted = false;
  const timer = { id: 0 };
  const qd = debounce(() => {
    state.adminQ = (el.querySelector('#ro-admin-q') || {}).value || '';
    state.adminPage = 1;
    loadAdmins(el);
  }, 320);

  if (el._rolesTeardown) { try { el._rolesTeardown(); } catch (e) {} }
  el._rolesTeardown = () => {
    qd.cancel();
    state.adminSeq += 1;
  };
  if (ctx && ctx.cleanup) ctx.cleanup(() => { if (el._rolesTeardown) el._rolesTeardown(); });

  el.innerHTML = skeletonHTML();
  /* 事件挂在根节点上一次，之后局部重绘（角色卡 / 矩阵 / 账号表）都不需要重新绑定 */
  delegate(el, 'click', '[data-role-pick]', (ev, node) => { pickRole(el, Number(node.getAttribute('data-role-pick'))); });
  delegate(el, 'click', '[data-new-role]', () => openCreateRole(el));
  delegate(el, 'click', '[data-save-perms]', () => savePerms(el));
  delegate(el, 'click', '[data-reset-perms]', () => resetDraft(el));
  delegate(el, 'click', '[data-del-role]', () => deleteRole(el));
  delegate(el, 'change', '[data-perm]', (ev, node) => {
    const key = node.getAttribute('data-perm');
    if (node.checked) state.draft.add(key); else state.draft.delete(key);
    updateMatrixFooter(el);
  });
  delegate(el, 'click', '[data-retry-catalog]', () => ensureCatalog(el));
  delegate(el, 'click', '[data-empty-act="retry-page"]', () => loadPage(el));
  delegate(el, 'click', '[data-empty-act="retry-admins"]', () => loadAdmins(el));
  delegate(el, 'click', '[data-new-admin]', () => openCreateAdmin(el));
  delegate(el, 'click', '[data-clear-admin]', () => {
    state.adminQ = ''; state.adminRole = 'all'; state.adminStatus = 'all'; state.adminPage = 1;
    const q = el.querySelector('#ro-admin-q'); if (q) q.value = '';
    el.querySelectorAll('[data-admin-filter]').forEach((s) => { s.value = 'all'; });
    loadAdmins(el);
  });
  el.addEventListener('input', (ev) => {
    if (ev.target && ev.target.id === 'ro-admin-q') qd();
  });
  delegate(el, 'change', '[data-admin-filter]', (ev, node) => {
    const kind = node.getAttribute('data-admin-filter');
    if (kind === 'role') state.adminRole = node.value;
    else state.adminStatus = node.value;
    state.adminPage = 1;
    loadAdmins(el);
  });
  delegate(el, 'click', '[data-admin-act]', async (ev, node) => {
    const id = Number(node.getAttribute('data-id'));
    const act = node.getAttribute('data-admin-act');
    const a = state.admins.find((x) => x.id === id);
    if (!a) return;
    if (act === 'role') openChangeRole(el, a);
    else if (act === 'reset') openResetPassword(el, a);
    else if (act === 'reset2fa') resetTwoFactor(el, a);
    else if (act === 'disable') toggleAdmin(el, a, 'disabled');
    else if (act === 'enable') toggleAdmin(el, a, 'active');
    else if (act === 'delete') deleteAdmin(el, a);
  });
  delegate(el, 'click', '[data-pager]', (ev, node) => {
    if (node.disabled) return;
    const n = clamp(Number(node.getAttribute('data-pager')), 1, 9999);
    if (n === state.adminPage) return;
    state.adminPage = n;
    loadAdmins(el);
  });

  loadPage(el);
}

export default {
  name: 'roles',
  title: '权限管理',
  perm: 'role.view',
  render,
};
