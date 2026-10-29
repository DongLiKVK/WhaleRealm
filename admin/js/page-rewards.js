/* 奖励发放页：左侧发放、右侧台账。
   为什么把"发放"和"历史"放在同一屏：运营核对一笔奖励是否到账时，
   不用跳页；右侧筛选条件也不会因为切页丢失。 */
import {
  api, esc, fmt, icon, avatar, statusPill, emptyHTML, pagerHTML, bindPager,
  hasFilter, delegate, debounce, toast, promptDialog, confirmDialog, can,
  downloadCsv, dayStart, dayEnd, todayInput, rewardAmount, errText,
} from './core.js';

const PAGE_SIZE = 12;
const TYPES = [
  { v: 'points', t: '积分' },
  { v: 'days', t: '会员' },
  { v: 'frame', t: '头像框' },
  { v: 'custom', t: '自定义' },
];
const TYPE_TEXT = { points: '积分', days: '会员天数', frame: '头像框', custom: '自定义' };

const state = {
  q: '', type: 'all', status: 'all', from: '', to: '',
  page: 1, total: 0, items: [], summary: null,
  /* 档位价格 / 头像框目录 / 常用原因：来自 GET /rewards/options，只拉一次 */
  options: { tiers: [], frames: [], presets: [], limits: { pointsMin: 1, pointsMax: 1000000, daysMin: 1, daysMax: 3650 } },
  optionsReady: false,
  /* 当前发放对象的会员/头像框现况，用于表单回显与发放后的对比 */
  panel: null,
};

/* 发放表单的草稿：跨页面切换保留，避免填了一半的原因被路由清掉 */
const grant = {
  user: null, type: 'points', amount: 100,
  last: { points: 100, days: 30 },
  tier: '', frame: 'auto',
  reason: '', note: '',
};

let histSeq = 0;
let pickSeq = 0;
/* 搜索结果按 id 留一份完整对象：选中时不必从 DOM 文案里反解析等级和积分 */
let pickResults = {};

function todayName() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return 'rewards-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv';
}

/* 列表查询带分页；导出只带筛选条件，否则 CSV 会被 pageSize 截断 */
function filterQuery() {
  const q = {};
  if (state.q) q.q = state.q;
  if (state.type !== 'all') q.type = state.type;
  if (state.status !== 'all') q.status = state.status;
  if (state.from) q.from = dayStart(state.from);
  if (state.to) q.to = dayEnd(state.to);
  return q;
}
function query() {
  return Object.assign({ page: state.page, pageSize: PAGE_SIZE }, filterQuery());
}

/* ───────────────────────── 骨架 ───────────────────────── */
function listSkeleton() {
  let rows = '';
  for (let i = 0; i < 5; i += 1) {
    rows += '<div class="reward-item" aria-hidden="true">' +
      '<span class="skel" style="width:32px;height:32px;border-radius:50%;flex:0 0 auto"></span>' +
      '<div class="ri-main">' +
        '<div class="skel" style="width:' + (34 + (i % 3) * 12) + '%;height:13px;margin:2px 0 7px"></div>' +
        '<div class="skel" style="width:' + (62 + (i % 2) * 18) + '%;height:11px;margin-bottom:6px"></div>' +
        '<div class="skel" style="width:46%;height:10px"></div>' +
      '</div>' +
      '<span class="skel" style="width:46px;height:26px;border-radius:7px"></span>' +
    '</div>';
  }
  return rows;
}

/* ───────────────────────── 发放表单 ───────────────────────── */
function amountLabel() {
  if (grant.type === 'points') return '发放积分';
  if (grant.type === 'days') return '发放天数';
  return '数量';
}

function amountHint() {
  if (grant.type === 'points') return '1 ~ 1,000,000 积分，发放后立即计入用户余额。';
  if (grant.type === 'days') return '1 ~ 3650 天，叠加到该档位现有有效期；升级会自动折算剩余天数。';
  if (grant.type === 'frame') return '头像框立即生效，用户下次刷新页面即可看到。';
  return '自定义奖励由运营线下兑现，这里只登记发放记录。';
}

/* 档位名字 / 色值：options 回来之前用兜底，避免首屏出现空白格子 */
const TIER_FALLBACK = {
  diamond: { name: '钻石', accent: '#38bdf8' },
  master: { name: '大师', accent: '#8b7cf6' },
  grandmaster: { name: '宗师', accent: '#f0a63c' },
  hunt: { name: '猎杀', accent: '#f2557a' },
};
function tierMeta(key) {
  const hit = (state.options.tiers || []).find((t) => t.key === key);
  return hit || Object.assign({ key }, TIER_FALLBACK[key] || { name: key, accent: '' });
}
function frameName(key) {
  const hit = (state.options.frames || []).find((f) => f.key === key);
  if (hit) return hit.name;
  return key === 'none' ? '不戴头像框' : key === 'auto' ? '跟随会员档位' : key;
}
function daysText(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 档位选择：四个付费档排成 2×2，价格来自 member_plans（后台调价这里自动跟着变） */
function tierOptionsHTML() {
  const list = state.options.tiers && state.options.tiers.length
    ? state.options.tiers
    : Object.keys(TIER_FALLBACK).map((k) => Object.assign({ key: k, month: null }, TIER_FALLBACK[k]));
  return list.map((t) => {
    const price = t.month && t.month.priceCents > 0 ? '¥' + (t.month.priceCents / 100) + '/月起' : '未定价';
    const days = t.defaultDays || (t.month && t.month.days) || 30;
    return '<button class="tier-opt" type="button" data-tiersel="' + esc(t.key) + '" aria-pressed="' +
      (grant.tier === t.key ? 'true' : 'false') + '" style="--tc:' + esc(t.accent || '') + '">' +
      '<i class="tier-dot" aria-hidden="true"></i>' +
      '<b>' + esc(t.name) + '</b>' +
      '<small>' + esc(price) + ' · 默认 ' + days + ' 天</small>' +
    '</button>';
  }).join('');
}

/* 头像框选择：跟随档位 / 四档 / 不戴。键与站点 js/avatar-frame.js 的 data-maw 一致 */
function frameOptionsHTML() {
  const list = state.options.frames && state.options.frames.length
    ? state.options.frames
    : [
      { key: 'auto', name: '跟随会员档位', short: '跟随档位' },
      { key: 'maw-1', name: '血契 · 冷钢', short: '冷钢 Lv1' },
      { key: 'maw-2', name: '裂颚 · 紫铜', short: '紫铜 Lv2' },
      { key: 'maw-3', name: '屠场 · 赤金', short: '赤金 Lv3' },
      { key: 'maw-4', name: '猎杀 · 血铁', short: '血铁 Lv4' },
      { key: 'none', name: '不戴头像框', short: '不戴' },
    ];
  return list.map((f) => {
    const lv = /^maw-(\d)$/.exec(f.key);
    return '<button class="frame-opt" type="button" data-framesel="' + esc(f.key) + '" aria-pressed="' +
      (grant.frame === f.key ? 'true' : 'false') + '">' +
      '<span class="fo-key" data-maw="' + esc(f.key) + '" aria-hidden="true">' + (lv ? 'Lv' + lv[1] : (f.key === 'none' ? '—' : '档')) + '</span>' +
      '<b>' + esc(f.short || f.name) + '</b>' +
    '</button>';
  }).join('');
}

function grantFormHTML() {
  return '<form class="card grant-form" id="grant-form" novalidate>' +
    '<div class="gf-head">' +
      '<div><h2>发放奖励</h2><p>发放后立即到账，并写入操作日志。</p></div>' +
      icon('rewards') +
    '</div>' +

    '<div class="field">' +
      '<label for="rw-user">发放对象<span class="req">*</span></label>' +
      '<div class="picker" data-role="picker">' +
        '<div class="input-wrap">' + icon('search') +
          '<input class="input" id="rw-user" type="text" placeholder="输入昵称、邮箱或用户 ID" autocomplete="off" ' +
            'role="combobox" aria-expanded="false" aria-controls="rw-pop" aria-autocomplete="list">' +
        '</div>' +
        '<div class="picker-pop" id="rw-pop" role="listbox" aria-label="匹配的用户" hidden></div>' +
      '</div>' +
      '<div data-role="picked"></div>' +
      '<div data-role="member-card"></div>' +
      '<div class="hint">只显示状态正常的用户；已禁用账号需先恢复才能发放。</div>' +
    '</div>' +

    '<div class="field">' +
      '<span class="lbl" id="rw-type-lbl">奖励类型<span class="req">*</span></span>' +
      '<div class="seg" role="group" aria-labelledby="rw-type-lbl">' +
        TYPES.map((t) => '<button type="button" data-gtype="' + t.v + '" aria-selected="' + (grant.type === t.v ? 'true' : 'false') + '">' + t.t + '</button>').join('') +
      '</div>' +
    '</div>' +

    '<div class="field hide" data-role="tier-field">' +
      '<span class="lbl">会员档位<span class="req">*</span></span>' +
      '<div class="tier-grid" role="group" aria-label="会员档位" data-role="tier-grid">' + tierOptionsHTML() + '</div>' +
      '<div class="hint">升级会自动把剩余天数折算进新档位；降到更低档位会被拒绝。</div>' +
    '</div>' +

    '<div class="field" data-role="amount-field">' +
      '<label for="rw-amount" data-role="amount-label">' + amountLabel() + '<span class="req">*</span></label>' +
      '<input class="input" id="rw-amount" type="number" inputmode="numeric" min="1" max="1000000" step="1" value="' + esc(grant.amount) + '">' +
      '<div class="hint" data-role="amount-hint">' + amountHint() + '</div>' +
    '</div>' +

    '<div class="field hide" data-role="frame-field">' +
      '<span class="lbl">头像框<span class="req">*</span></span>' +
      '<div class="frame-grid" role="group" aria-label="头像框" data-role="frame-grid">' + frameOptionsHTML() + '</div>' +
      '<div class="hint">指定后覆盖会员档位自带的框；选「跟随档位」可恢复自动。</div>' +
    '</div>' +

    '<div class="field">' +
      '<label for="rw-reason">发放原因<span class="req">*</span></label>' +
      '<div class="preset-row" data-role="presets">' +
        (state.options.presets || []).map((p) =>
          '<button class="preset" type="button" data-preset="' + esc(p) + '">' + esc(p) + '</button>').join('') +
      '</div>' +
      '<textarea class="textarea" id="rw-reason" rows="2" maxlength="200" placeholder="例如：优质内容奖励、活动补偿"></textarea>' +
      '<div class="hint">4 ~ 200 字，会展示在用户的通知和日志里。</div>' +
    '</div>' +

    '<div class="field">' +
      '<label for="rw-note">内部备注</label>' +
      '<textarea class="textarea" id="rw-note" rows="2" maxlength="200" placeholder="可选，仅后台可见"></textarea>' +
    '</div>' +

    '<div class="grant-preview" data-role="preview" aria-live="polite">' + icon('info') + '<span></span></div>' +
    '<div class="notice notice--ok hide" data-role="grant-result" role="status"></div>' +
    '<div class="notice notice--err hide" data-role="grant-err" role="alert"></div>' +
    '<button class="btn btn--primary btn--lg btn--block" type="submit" data-act="grant">确认发放</button>' +
  '</form>';
}

function readonlyHTML() {
  return '<section class="card gf-readonly">' +
    '<div class="gf-head"><div><h2>发放奖励</h2><p>当前角色没有发放权限。</p></div>' + icon('shield') + '</div>' +
    '<div class="notice notice--warn">可以查看发放记录；如需发放或撤回，请联系管理员调整角色权限。</div>' +
  '</section>';
}

function previewHTML() {
  if (!grant.user) {
    return icon('info') + '<span>先选择发放对象，这里会显示最终发放内容。</span>';
  }
  const name = '<b>' + esc(grant.user.name) + '</b>';
  const n = Math.max(0, Number(grant.amount) || 0);

  if (grant.type === 'custom') return icon('info') + '<span>将向 ' + name + ' 发放 <b>自定义奖励</b></span>';

  if (grant.type === 'frame') {
    const cur = state.panel && state.panel.frame ? frameName(state.panel.frame) : '';
    return icon('info') + '<span>将把 ' + name + ' 的头像框换成 <b>' + esc(frameName(grant.frame)) + '</b>' +
      (cur ? '（当前：' + esc(cur) + '）' : '') + '</span>';
  }

  if (grant.type === 'days') {
    const t = tierMeta(grant.tier);
    const cur = state.panel && state.panel.tierActive
      ? '当前' + esc(state.panel.tierName) + '，' + esc(daysText(state.panel.expiresAt)) + ' 到期'
      : (state.panel ? '当前不是会员' : '');
    return icon('info') + '<span>将向 ' + name + ' 发放 <b>' + fmt.int(n) + ' 天「' + esc(t.name) + '」会员</b>' +
      (cur ? '（' + cur + '）' : '') + '</span>';
  }

  return icon('info') + '<span>将向 ' + name + ' 发放 <b>' + fmt.int(n) + ' 积分</b></span>';
}

/** 发放对象的会员现况条：档位 / 到期 / 当前头像框，发放前后各刷一次 */
function paintPanel(el) {
  const host = el.querySelector('[data-role="member-card"]');
  if (!host) return;
  const p = state.panel;
  if (!p || !grant.user) { host.innerHTML = ''; return; }
  const tier = p
    ? '<span class="ms-tier" style="--tc:' + esc(p.tierAccent || '') + '"><i aria-hidden="true"></i>' +
        esc(p.tierName || '旅人') + (p.tierActive ? '' : ' · 未开通') + '</span>'
    : '';
  const exp = p && p.tierActive
    ? '<span class="ms-meta">至 ' + esc(daysText(p.expiresAt)) + ' · 剩 ' + fmt.int(p.daysLeft) + ' 天</span>'
    : (p && p.expired ? '<span class="ms-meta">会员已于 ' + esc(daysText(p.expiresAt)) + ' 到期</span>' : '');
  const frame = p ? '<span class="ms-frame">头像框：' + esc(p.frameLabel || frameName(p.frame)) + '</span>' : '';
  host.innerHTML = '<div class="member-strip">' + tier + exp + frame + '</div>';
}

function paintPreview(el) {
  const box = el.querySelector('[data-role="preview"]');
  if (box) box.innerHTML = previewHTML();
}

function paintPicked(el) {
  const host = el.querySelector('[data-role="picked"]');
  if (!host) return;
  const u = grant.user;
  if (!u) { host.innerHTML = ''; return; }
  host.innerHTML = '<div class="user-pick">' + avatar(u) +
    '<div class="up-main"><b>' + esc(u.name) + '</b>' +
      '<small>' + esc(u.email || '未绑定邮箱') + ' · Lv.' + esc(u.level || 1) + ' · ' + fmt.int(u.points || 0) + ' 积分</small>' +
    '</div>' +
    '<button class="icon-btn" type="button" data-act="unpick" aria-label="移除已选用户">' + icon('close') + '</button>' +
  '</div>';
}

function updateAmountUI(el) {
  const field = el.querySelector('[data-role="amount-field"]');
  const input = el.querySelector('#rw-amount');
  const label = el.querySelector('[data-role="amount-label"]');
  const hint = el.querySelector('[data-role="amount-hint"]');
  const tierField = el.querySelector('[data-role="tier-field"]');
  const frameField = el.querySelector('[data-role="frame-field"]');

  if (tierField) tierField.classList.toggle('hide', grant.type !== 'days');
  if (frameField) frameField.classList.toggle('hide', grant.type !== 'frame');

  if (!field || !input) return;
  if (grant.type === 'custom' || grant.type === 'frame') {
    field.classList.add('hide');
    return;
  }
  field.classList.remove('hide');
  if (label) label.innerHTML = amountLabel() + '<span class="req">*</span>';
  if (hint) hint.textContent = amountHint();
  input.min = '1';
  input.max = grant.type === 'days' ? '3650' : '1000000';
  input.value = String(grant.amount);
}

/** 档位 / 头像框按钮的选中态：单选用 aria-pressed，不引入 radio 输入框 */
function paintChoice(el) {
  el.querySelectorAll('[data-tiersel]').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-tiersel') === grant.tier ? 'true' : 'false');
  });
  el.querySelectorAll('[data-framesel]').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-framesel') === grant.frame ? 'true' : 'false');
  });
}

function setType(el, type) {
  if (grant.type !== 'custom' && grant.type !== 'frame' && grant.type !== type) {
    grant.last[grant.type] = Number(grant.amount) || 0;
  }
  grant.type = type;
  if (type === 'custom' || type === 'frame') grant.amount = 0;
  else grant.amount = grant.last[type] || (type === 'points' ? 100 : 30);

  /* 切到会员时，档位默认跟随用户当前档位（不是会员就取第一个），
     运营通常就是「按原档续 30 天」，少点一次。 */
  if (type === 'days' && !grant.tier) {
    const cur = state.panel && state.panel.tierActive ? state.panel.tier : '';
    grant.tier = cur || (tierMeta('diamond').key || 'diamond');
  }
  /* 切到头像框时默认选中用户当前框，避免「想换个框」变成「不小心摘掉」 */
  if (type === 'frame' && state.panel && state.panel.frame) grant.frame = state.panel.frame;

  el.querySelectorAll('[data-gtype]').forEach((b) => {
    b.setAttribute('aria-selected', b.getAttribute('data-gtype') === type ? 'true' : 'false');
  });
  paintChoice(el);
  updateAmountUI(el);
  paintPreview(el);
}

function setUser(el, u) {
  grant.user = u ? {
    id: u.id, name: u.name, email: u.email || '', level: u.level || 1, points: u.points || 0,
    avatar: u.avatar || '', emoji: u.emoji || '', grad: u.grad || '',
  } : null;
  if (!u) { state.panel = null; paintPanel(el); }
  paintPicked(el);
  paintPreview(el);
  if (u) loadPanel(el, u.id);
}

function showGrantError(el, msg) {
  const box = el.querySelector('[data-role="grant-err"]');
  if (!box) return;
  if (!msg) { box.classList.add('hide'); box.textContent = ''; return; }
  box.textContent = msg;
  box.classList.remove('hide');
}

/* 目录只拉一次：档位价目表 + 头像框目录 + 常用原因。失败不挡发放，用内置兜底渲染。 */
async function loadOptions(el) {
  if (state.optionsReady) return;
  try {
    const res = await api('/rewards/options');
    if (!res) return;
    state.options = {
      tiers: res.tiers || [],
      frames: res.frames || [],
      presets: res.presets || [],
      limits: res.limits || state.options.limits,
    };
    if (!grant.tier) grant.tier = (state.options.tiers[0] && state.options.tiers[0].key) || 'diamond';
    state.optionsReady = true;

    const tg = el.querySelector('[data-role="tier-grid"]');
    if (tg) tg.innerHTML = tierOptionsHTML();
    const fg = el.querySelector('[data-role="frame-grid"]');
    if (fg) fg.innerHTML = frameOptionsHTML();
    const pr = el.querySelector('[data-role="presets"]');
    if (pr && state.options.presets.length) {
      pr.innerHTML = state.options.presets.map((p) =>
        '<button class="preset" type="button" data-preset="' + esc(p) + '">' + esc(p) + '</button>').join('');
    }
    paintChoice(el);
    updateAmountUI(el);
    paintPreview(el);
  } catch (e) { /* 目录拿不到就用兜底档位，发放接口自己会校验 */ }
}

/* 选中用户后拉一次现况：当前档位、到期时间、头像框 */
async function loadPanel(el, userId) {
  if (!userId) return;
  try {
    const res = await api('/rewards/options', { query: { userId } });
    if (!grant.user || grant.user.id !== userId) return;
    state.panel = res && res.user ? res.user : null;
    if (state.panel) {
      /* 会员类型默认按用户现有档位续；不是会员就保持当前选择 */
      if (state.panel.tierActive) grant.tier = state.panel.tier;
      else if (!grant.tier) grant.tier = 'diamond';
      if (grant.type === 'frame') grant.frame = state.panel.frame || 'auto';
    }
    paintPanel(el);
    paintChoice(el);
    paintPreview(el);
  } catch (e) { /* 现况拿不到不挡发放 */ }
}

async function searchUsers(el, keyword) {
  const pop = el.querySelector('#rw-pop');
  const input = el.querySelector('#rw-user');
  if (!pop || !input) return;
  const seq = ++pickSeq;
  if (!keyword) { pop.hidden = false; pop.innerHTML = '<div class="picker-empty">输入昵称、邮箱或 ID 开始搜索</div>'; input.setAttribute('aria-expanded', 'true'); return; }
  pop.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  pop.innerHTML = '<div class="picker-empty">正在搜索…</div>';
  try {
    const res = await api('/users', { query: { q: keyword, status: 'active', page: 1, pageSize: 6 } });
    if (seq !== pickSeq) return;
    const items = (res && res.items) || [];
    pickResults = {};
    items.forEach((u) => { pickResults[u.id] = u; });
    if (!items.length) {
      pop.innerHTML = '<div class="picker-empty">没有匹配的正常用户，换个关键字试试</div>';
      return;
    }
    pop.innerHTML = items.map((u) =>
      '<button class="picker-opt" type="button" role="option" aria-selected="false" data-pick="' + u.id + '">' +
        avatar(u, 'avatar--sm') +
        '<span class="po-main"><b>' + esc(u.name) + '</b><small>' + esc(u.email || '未绑定邮箱') + ' · Lv.' + esc(u.level || 1) + '</small></span>' +
        '<small style="flex:0 0 auto">' + fmt.int(u.points || 0) + ' 积分</small>' +
      '</button>').join('');
  } catch (e) {
    if (seq !== pickSeq) return;
    pop.innerHTML = '<div class="picker-empty">' + esc(errText(e, '搜索失败，请重试')) + '</div>';
  }
}

function closePick(el) {
  const pop = el.querySelector('#rw-pop');
  const input = el.querySelector('#rw-user');
  if (pop) pop.hidden = true;
  if (input) input.setAttribute('aria-expanded', 'false');
}

function resetGrant(el) {
  grant.user = null;
  grant.reason = '';
  grant.note = '';
  const input = el.querySelector('#rw-user');
  const reason = el.querySelector('#rw-reason');
  const note = el.querySelector('#rw-note');
  if (input) input.value = '';
  if (reason) reason.value = '';
  if (note) note.value = '';
  if (reason) reason.removeAttribute('aria-invalid');
  paintPicked(el);
  paintPreview(el);
  showGrantError(el, '');
  closePick(el);
}

function validateGrant(el) {
  const amountEl = el.querySelector('#rw-amount');
  const reasonEl = el.querySelector('#rw-reason');
  const reason = (reasonEl && reasonEl.value || '').trim();
  if (!grant.user) return '请先选择要发放的用户。';

  if (grant.type === 'days') {
    if (!grant.tier) return '请选择要发放的会员档位。';
    const n = Number(amountEl && amountEl.value);
    if (!(Number.isInteger(n) && n >= 1 && n <= 3650)) {
      if (amountEl) { amountEl.setAttribute('aria-invalid', 'true'); amountEl.focus(); }
      return '会员天数需要是 1 ~ 3650 之间的整数。';
    }
    grant.amount = n;
  } else if (grant.type === 'frame') {
    if (!grant.frame) return '请选择要更换的头像框。';
  } else if (grant.type !== 'custom') {
    const n = Number(amountEl && amountEl.value);
    if (!(Number.isInteger(n) && n >= 1 && n <= 1000000)) {
      if (amountEl) { amountEl.setAttribute('aria-invalid', 'true'); amountEl.focus(); }
      return '积分数量需要是 1 ~ 1,000,000 之间的整数。';
    }
    grant.amount = n;
  }

  if (reason.length < 4) {
    if (reasonEl) { reasonEl.setAttribute('aria-invalid', 'true'); reasonEl.focus(); }
    return '发放原因至少 4 个字，方便用户和审计看懂。';
  }
  if (reason.length > 200) return '发放原因最多 200 个字。';
  return '';
}

function showResult(el, msg) {
  const box = el.querySelector('[data-role="grant-result"]');
  if (!box) return;
  if (!msg) { box.classList.add('hide'); box.innerHTML = ''; return; }
  box.innerHTML = icon('check') + '<span class="notice-body">' + msg + '</span>';
  box.classList.remove('hide');
  /* 结果条在表单偏下的位置，提交后滚到视野里，别让人以为没反应 */
  try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { box.scrollIntoView(); }
}

/** 发放成功后的结果文案：说清「变成了什么」，而不只是「成功了」 */
function resultHTML(what) {
  const p = state.panel;
  if (!p) return esc(what);
  if (grant.type === 'days') {
    return '已向 <b>' + esc(p.name) + '</b> 发放 ' + esc(what) + '，会员现为 <b>' +
      esc(p.tierName) + '</b>，' + esc(daysText(p.expiresAt)) + ' 到期（剩 ' + fmt.int(p.daysLeft) + ' 天）。';
  }
  if (grant.type === 'frame') {
    return '已把 <b>' + esc(p.name) + '</b> 的头像框换成 <b>' + esc(p.frameLabel || frameName(p.frame)) +
      '</b>，用户刷新页面即可看到。';
  }
  if (grant.type === 'points') {
    return '已向 <b>' + esc(p.name) + '</b> 发放 ' + esc(what) + '，当前余额 <b>' + fmt.int(p.points) + ' 积分</b>。';
  }
  return '已为 <b>' + esc(p.name) + '</b> 登记 ' + esc(what) + '，请线下兑现。';
}

async function submitGrant(el) {
  showGrantError(el, '');
  showResult(el, '');
  const msg = validateGrant(el);
  if (msg) { showGrantError(el, msg); return; }
  const btn = el.querySelector('[data-act="grant"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '发放中…'; }
  const reason = (el.querySelector('#rw-reason').value || '').trim();
  const note = (el.querySelector('#rw-note').value || '').trim();
  try {
    const res = await api('/rewards', {
      method: 'POST',
      body: {
        userId: grant.user.id,
        type: grant.type,
        amount: grant.type === 'custom' || grant.type === 'frame' ? 0 : Math.floor(Number(grant.amount)),
        tier: grant.type === 'days' ? grant.tier : '',
        frame: grant.type === 'frame' ? grant.frame : '',
        reason,
        note,
      },
    });

    const who = grant.user.name;
    const what = grant.type === 'custom'
      ? '自定义奖励'
      : grant.type === 'points'
        ? fmt.int(grant.amount) + ' 积分'
        : grant.type === 'frame'
          ? '头像框「' + frameName(grant.frame) + '」'
          : grant.amount + ' 天「' + tierMeta(grant.tier).name + '」会员';

    /* 服务端把发放后的用户面板带回来了：直接用它刷新现况条与结果提示，
       不再多打一次接口，也不会出现「提示成功了但界面还是旧档位」。 */
    if (res && res.user) {
      state.panel = res.user;
      if (grant.user && res.user.id === grant.user.id) {
        grant.user.points = res.user.points;
        grant.user.frame = res.user.frame;
      }
    }
    paintPicked(el);
    paintPanel(el);
    paintPreview(el);
    showResult(el, resultHTML(what));
    toast('已向 ' + who + ' 发放 ' + what, 'ok');

    /* 原因与备注清空，用户与档位保留：连发两笔是常态，别让人重选一遍 */
    const reasonEl = el.querySelector('#rw-reason');
    const noteEl = el.querySelector('#rw-note');
    if (reasonEl) { reasonEl.value = ''; grant.reason = ''; reasonEl.removeAttribute('aria-invalid'); }
    if (noteEl) { noteEl.value = ''; grant.note = ''; }

    state.page = 1;
    fetchHistory(el);
  } catch (e) {
    showGrantError(el, errText(e, '发放失败，请稍后重试'));
    toast(errText(e, '发放失败'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label || '确认发放'; }
  }
}

/* ───────────────────────── 发放历史 ───────────────────────── */
function historyRow(r) {
  const revoked = r.status === 'revoked';
  const u = r.user || { id: r.userId, name: '用户 #' + r.userId };
  const meta = [
    '<span>' + esc((r.grantedBy && r.grantedBy.name) || '系统') + ' 发放</span>',
    '<span>·</span>',
    '<time datetime="' + new Date((Number(r.grantedAt) || 0) * 1000).toISOString() + '">' + esc(fmt.dateTime(r.grantedAt)) + '</time>',
  ];
  if (r.tierLabel) meta.push('<span>·</span><span>档位：' + esc(r.tierLabel) + '</span>');
  /* 头像框类型已经把框名放在金额位了，meta 里不再重复一遍 */
  if (r.frameLabel && r.type !== 'frame') meta.push('<span>·</span><span>头像框：' + esc(r.frameShort || r.frameLabel) + '</span>');
  if (r.note) meta.push('<span>·</span><span>备注：' + esc(r.note) + '</span>');
  if (revoked) meta.push('<span>·</span><span>已撤回：' + esc(r.revokedReason || '未填写原因') + '</span>');
  return '<div class="reward-item" data-reward-id="' + r.id + '">' +
    avatar(u) +
    '<div class="ri-main">' +
      '<div class="ri-top"><b>' + esc(u.name) + '</b>' +
        '<span class="ri-amt' + (revoked ? ' is-revoked' : '') + '">' + esc(rewardAmount(r)) + '</span>' +
        statusPill('reward', r.status) +
      '</div>' +
      '<div class="ri-reason">' + esc(r.reason || '') + '</div>' +
      '<div class="ri-meta">' + meta.join('') + '</div>' +
    '</div>' +
    (!revoked && can('reward.revoke')
      ? '<button class="btn btn--sm btn--ghost ri-act" type="button" data-revoke="' + r.id + '">撤回</button>'
      : '') +
  '</div>';
}

function paintSummary(el) {
  const box = el.querySelector('[data-role="summary"]');
  if (!box) return;
  const s = state.summary || { granted: 0, revoked: 0, pointsTotal: 0 };
  box.innerHTML =
    '<div class="rs"><span>当前筛选 · 已发放</span><b>' + fmt.int(s.granted || 0) + ' 笔</b></div>' +
    '<div class="rs"><span>已撤回</span><b>' + fmt.int(s.revoked || 0) + ' 笔</b></div>' +
    '<div class="rs"><span>积分合计</span><b>' + fmt.int(s.pointsTotal || 0) + '</b></div>';
}

function paintHistory(el) {
  const list = el.querySelector('[data-role="list"]');
  const pager = el.querySelector('[data-role="pager"]');
  if (!list) return;
  paintSummary(el);
  if (!state.items.length) {
    list.innerHTML = emptyHTML({
      icon: 'rewards',
      title: hasFilter(state.q, state.type, state.status, state.from, state.to) ? '这个筛选下没有记录' : '还没有发放过奖励',
      text: hasFilter(state.q, state.type, state.status, state.from, state.to)
        ? '换个类型、状态或时间范围看看。'
        : '从左侧选择用户，发放第一笔积分、会员档位或头像框。',
      action: { label: '去发放', act: 'focus-grant', kind: 'btn--primary' },
    });
  } else {
    list.innerHTML = state.items.map(historyRow).join('');
  }
  if (pager) pager.innerHTML = pagerHTML(state.page, state.total, PAGE_SIZE);
}

async function fetchHistory(el, opts) {
  const list = el.querySelector('[data-role="list"]');
  const pager = el.querySelector('[data-role="pager"]');
  const seq = ++histSeq;
  if (!opts || !opts.quiet) {
    if (list) list.innerHTML = listSkeleton();
    if (pager) pager.innerHTML = '';
  }
  try {
    const res = await api('/rewards', { query: query() });
    if (seq !== histSeq) return;
    state.items = (res && res.items) || [];
    state.total = (res && res.total) || 0;
    state.summary = (res && res.summary) || null;
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.page > pages) { state.page = pages; fetchHistory(el, { quiet: true }); return; }
    paintHistory(el);
  } catch (e) {
    if (seq !== histSeq) return;
    if (list) {
      list.innerHTML = emptyHTML({
        icon: 'alert',
        title: '发放记录没能加载',
        text: errText(e, '请稍后重试'),
        action: { label: '重新加载', act: 'retry', kind: 'btn--primary' },
      });
    }
    if (pager) pager.innerHTML = '';
  }
}

async function revoke(el, id) {
  const rec = state.items.find((r) => r.id === id);
  if (!rec) return;
  const who = rec.user ? rec.user.name : '用户 #' + rec.userId;
  const reason = await promptDialog({
    title: '撤回奖励',
    subtitle: who + ' · ' + rewardAmount(rec),
    label: '撤回原因',
    placeholder: '例如：重复发放、活动规则调整',
    min: 2,
    minTip: '撤回原因至少 2 个字，用户会看到这段说明。',
    okText: '确认撤回',
    danger: true,
  });
  if (reason == null) return;
  try {
    await api('/rewards/' + id + '/revoke', { method: 'POST', body: { reason } });
    toast('已撤回这笔奖励', 'ok');
    fetchHistory(el, { quiet: true });
  } catch (e) {
    toast(errText(e, '撤回失败'), 'err');
  }
}

async function exportCsv(el) {
  const btn = el.querySelector('[data-act="csv"]');
  if (btn) btn.disabled = true;
  try {
    await downloadCsv('/rewards/export.csv', filterQuery(), todayName());
    toast('导出已开始下载', 'ok');
  } catch (e) {
    toast(errText(e, '导出失败'), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ───────────────────────── 骨架结构 ───────────────────────── */
function shellHTML() {
  const grantable = can('reward.grant');
  return '<div class="reward-grid">' +
    (grantable ? grantFormHTML() : readonlyHTML()) +

    '<section class="card list-card">' +
      '<div class="card-hd">' +
        '<h2>发放历史 <span class="meta">按时间倒序</span></h2>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn--sm" type="button" data-act="csv">' + icon('download') + '导出 CSV</button>' +
        '</div>' +
      '</div>' +
      '<div class="filterbar">' +
        '<div class="input-wrap search">' + icon('search') +
          '<input class="input" id="rw-q" type="search" placeholder="搜用户或原因" aria-label="搜索发放记录">' +
        '</div>' +
        '<select class="select" id="rw-type" aria-label="奖励类型">' +
          '<option value="all">全部类型</option>' +
          TYPES.map((t) => '<option value="' + t.v + '">' + t.t + '</option>').join('') +
        '</select>' +
        '<select class="select" id="rw-status" aria-label="发放状态">' +
          '<option value="all">全部状态</option>' +
          '<option value="active">已发放</option>' +
          '<option value="revoked">已撤回</option>' +
        '</select>' +
        '<span class="date-range">' +
          '<input class="input date-input" id="rw-from" type="date" max="' + todayInput() + '" aria-label="开始日期">' +
          '<span class="date-sep">至</span>' +
          '<input class="input date-input" id="rw-to" type="date" max="' + todayInput() + '" aria-label="结束日期">' +
        '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--ghost btn--sm clear-btn hide" type="button" data-act="clear">清空筛选</button>' +
      '</div>' +
      '<div class="reward-summary" data-role="summary"></div>' +
      '<div class="card-bd flush" data-role="list"></div>' +
      '<div data-role="pager"></div>' +
    '</section>' +
  '</div>';
}

function syncClear(el) {
  const btn = el.querySelector('[data-act="clear"]');
  if (btn) btn.classList.toggle('hide', !hasFilter(state.q, state.type, state.status, state.from, state.to));
}

function clearFilters(el) {
  state.q = ''; state.type = 'all'; state.status = 'all'; state.from = ''; state.to = ''; state.page = 1;
  const set = (id, v) => { const n = el.querySelector('#' + id); if (n) n.value = v; };
  set('rw-q', ''); set('rw-type', 'all'); set('rw-status', 'all'); set('rw-from', ''); set('rw-to', '');
  syncClear(el);
  fetchHistory(el);
}

export default {
  name: 'rewards',
  title: '奖励发放',
  perm: 'reward.view',
  async render(el, ctx) {
    el.innerHTML = shellHTML();
    fetchHistory(el);

    const offs = [];
    const off = (fn) => { if (typeof fn === 'function') offs.push(fn); };
    ctx.cleanup(() => {
      histSeq += 1;
      pickSeq += 1;
      offs.forEach((f) => { try { f(); } catch (e) {} });
    });

    const picker = el.querySelector('[data-role="picker"]');
    const userInput = el.querySelector('#rw-user');
    const pop = el.querySelector('#rw-pop');
    if (picker && userInput && pop) {
      const doSearch = debounce((v) => searchUsers(el, v.trim()), 280);
      const onInput = () => {
        showGrantError(el, '');
        if (!userInput.value.trim()) { setUser(el, null); }
        doSearch(userInput.value);
      };
      userInput.addEventListener('input', onInput);
      off(() => userInput.removeEventListener('input', onInput));

      const onFocus = () => { if (!grant.user) searchUsers(el, userInput.value.trim()); };
      userInput.addEventListener('focus', onFocus);
      off(() => userInput.removeEventListener('focus', onFocus));

      const onKey = (ev) => {
        if (ev.key === 'Escape') { closePick(el); return; }
        if (ev.key === 'ArrowDown') {
          const first = pop.querySelector('.picker-opt');
          if (first && !pop.hidden) { ev.preventDefault(); first.focus(); }
        }
      };
      userInput.addEventListener('keydown', onKey);
      off(() => userInput.removeEventListener('keydown', onKey));

      const popKey = (ev) => {
        const opts = Array.prototype.slice.call(pop.querySelectorAll('.picker-opt'));
        const cur = opts.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown' && cur >= 0 && cur < opts.length - 1) { ev.preventDefault(); opts[cur + 1].focus(); }
        else if (ev.key === 'ArrowUp' && cur > 0) { ev.preventDefault(); opts[cur - 1].focus(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); closePick(el); userInput.focus(); }
        else if (ev.key === 'Tab') { closePick(el); }
      };
      pop.addEventListener('keydown', popKey);
      off(() => pop.removeEventListener('keydown', popKey));

      const outside = (ev) => { if (!picker.contains(ev.target)) closePick(el); };
      document.addEventListener('pointerdown', outside, true);
      off(() => document.removeEventListener('pointerdown', outside, true));
    }

    off(delegate(el, 'click', '[data-gtype]', (ev, btn) => setType(el, btn.getAttribute('data-gtype'))));
    off(delegate(el, 'click', '[data-tiersel]', (ev, btn) => {
      grant.tier = btn.getAttribute('data-tiersel');
      paintChoice(el);
      paintPreview(el);
      showGrantError(el, '');
    }));
    off(delegate(el, 'click', '[data-framesel]', (ev, btn) => {
      grant.frame = btn.getAttribute('data-framesel');
      paintChoice(el);
      paintPreview(el);
      showGrantError(el, '');
    }));
    off(delegate(el, 'click', '[data-preset]', (ev, btn) => {
      const txt = btn.textContent || '';
      const el2 = el.querySelector('#rw-reason');
      grant.reason = txt;
      if (el2) { el2.value = txt; el2.removeAttribute('aria-invalid'); el2.focus(); }
      showGrantError(el, '');
    }));
    off(delegate(el, 'click', '[data-act="unpick"]', () => { setUser(el, null); const n = el.querySelector('#rw-user'); if (n) { n.value = ''; n.focus(); } }));
    off(delegate(el, 'click', '[data-pick]', (ev, btn) => {
      const id = Number(btn.getAttribute('data-pick'));
      const u = pickResults[id];
      if (!u) return;
      setUser(el, u);
      if (userInput) userInput.value = u.name;
      closePick(el);
      const amount = el.querySelector('#rw-amount');
      if (amount && grant.type !== 'custom') amount.focus();
    }));

    const form = el.querySelector('#grant-form');
    if (form) {
      const onSubmit = (ev) => { ev.preventDefault(); submitGrant(el); };
      form.addEventListener('submit', onSubmit);
      off(() => form.removeEventListener('submit', onSubmit));

      const amount = el.querySelector('#rw-amount');
      if (amount) {
        const onAmount = () => {
          grant.amount = Math.max(0, Math.floor(Number(amount.value) || 0));
          paintPreview(el);
          showGrantError(el, '');
        };
        amount.addEventListener('input', onAmount);
        off(() => amount.removeEventListener('input', onAmount));
      }
      const reason = el.querySelector('#rw-reason');
      if (reason) {
        const onReason = () => {
          grant.reason = reason.value;
          reason.removeAttribute('aria-invalid');
          showGrantError(el, '');
        };
        reason.addEventListener('input', onReason);
        off(() => reason.removeEventListener('input', onReason));
      }
      const note = el.querySelector('#rw-note');
      if (note) {
        const onNote = () => { grant.note = note.value; };
        note.addEventListener('input', onNote);
        off(() => note.removeEventListener('input', onNote));
      }
      paintPicked(el);
      paintPreview(el);
      updateAmountUI(el);
      paintChoice(el);
      loadOptions(el);
    }

    const search = el.querySelector('#rw-q');
    if (search) {
      const fn = debounce(() => { state.q = search.value.trim(); state.page = 1; syncClear(el); fetchHistory(el); }, 320);
      const h = () => fn();
      search.addEventListener('input', h);
      off(() => search.removeEventListener('input', h));
    }
    const bind = (id, key, num) => {
      const n = el.querySelector('#' + id);
      if (!n) return;
      const h = () => {
        state[key] = num ? Number(n.value) : n.value;
        state.page = 1;
        syncClear(el);
        fetchHistory(el);
      };
      n.addEventListener('change', h);
      off(() => n.removeEventListener('change', h));
    };
    ['rw-type:type', 'rw-status:status', 'rw-from:from', 'rw-to:to'].forEach((pair) => {
      const s = pair.split(':');
      bind(s[0], s[1], false);
    });

    off(delegate(el, 'click', '[data-act="clear"], [data-empty-act="clear"]', () => clearFilters(el)));
    off(delegate(el, 'click', '[data-empty-act="retry"]', () => fetchHistory(el)));
    off(delegate(el, 'click', '[data-empty-act="focus-grant"]', () => { const n = el.querySelector('#rw-user'); if (n) n.focus(); }));
    off(delegate(el, 'click', '[data-act="csv"]', () => exportCsv(el)));
    off(delegate(el, 'click', '[data-revoke]', (ev, btn) => revoke(el, Number(btn.getAttribute('data-revoke')))));
    off(bindPager(el, (p) => { state.page = p; fetchHistory(el); }));
    syncClear(el);
  },
};
