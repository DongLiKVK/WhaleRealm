/* ══════════════════════════════════════════════════════════════
   鲸域 · 赞助档头像框
   ──────────────────────────────────────────────────────────────
   一套材质，同一套等级：等级 = 档位。钻石 LV1、大师 LV2、宗师 LV3、猎杀 LV4。
   一个用户只有一个身份事实，框就是它的读数。

   骨拱冠 MAW —— 站内唯一一套。取自参考图里那四顶高浮雕骨冠：
   环上獠牙、顶部骨拱、中央尖顶宝石、两道下颚肋骨。
   四档四种金属温度：冷钢 → 紫铜 → 赤金 → 血铁，粒子随之变密变快。

   为什么 MAW 要包一层 wrapper：
   环画在元素自己的 border 上画不出骨拱 —— 骨拱和獠牙必须探出圆外，
   border 盒里画不出来（试过，只得到一圈齿轮）。所以 MAW 用 .maw-w
   包住头像，再盖一层 162% 大的 .maw-c 当冠 —— 冠是背景图，粒子是这层
   里的 <i>，头像本身一个字节都不动。

   三个决定：
   ① 没赞助不画。旅人是一圈干净的头像，到期那天环自动摘掉。
   ② 小头像不戴冠。<=28px 戴上只是噪点，信息流还每秒重绘。
   ③ 档位从哪来：演示号走 js/data.js（口径对齐 /api/membership/wall），
      自己问一次 /api/membership/me —— 没有档位就不猜。
   ══════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';

  if (win.AvatarFrame) return;

  var FAMILY = {
    maw: {
      name: '骨拱冠', en: 'MAW', gloss: '一副骨头冠', axis: '四档四种金属',
      levels: [
        { name: '血契', note: '冷钢。环上一圈短牙，顶部一根尖顶 —— 只是应下这件事。' },
        { name: '裂颚', note: '紫铜。獠牙变长，冠梁张开，环开始透出一点冷光。' },
        { name: '屠场', note: '赤金。冠梁压得更低，两道肋骨从颚侧扫下来，粒子烧成橙色。' },
        { name: '猎杀', note: '血铁。齿最密，宝石最亮，环上有火在慢慢转 —— 全站二十席。' }
      ]
    }
  };
  var FAMS = ['maw'];

  /* 四个付费档。色值与价目对齐 js/membership.js:26-34 的 TIER ——
     那边是唯一事实来源，这里只复制一份给独立模块用。 */
  var TIER = {
    diamond:     { name: '钻石', icon: '💎', accent: '#38bdf8', price: 19,  level: 1 },
    master:      { name: '大师', icon: '🧭', accent: '#8b7cf6', price: 58,  level: 2 },
    grandmaster: { name: '宗师', icon: '🔱', accent: '#f0a63c', price: 138, level: 3 },
    hunt:        { name: '猎杀', icon: '🦈', accent: '#f2557a', price: 388, level: 4 }
  };
  var ORDER = ['diamond', 'master', 'grandmaster', 'hunt'];

  /* 演示号的档位：和 /api/membership/wall 的真实排序对齐 ——
     林深见鹿=hunt、阿离/海盐柠檬=grandmaster、豆腐=master，
     墙上那条「匿名鲸友＝钻石」正好是 u8。 */
  var DEMO = { u1: 'hunt', u2: 'grandmaster', u3: 'master', u5: 'grandmaster', u8: 'diamond' };

  var TIERS = {};             /* uid -> tier，接口回来的 */
  /* 后台奖励发放可以单独指定头像框（users.frame）：
     'auto' = 跟随档位、'none' = 不戴、'maw-1'..'maw-4' = 指定等级。
     覆盖优先于档位 —— 否则运营给非会员手动戴一个框，页面上还是什么都不出。 */
  var FRAMES = {};
  var ME = { uid: '', tier: '' };
  var asked = false;
  var MIN_M = 28;             /* 小于这个尺寸不戴冠 */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function state() {
    if (!win.AUTH || typeof win.AUTH.state !== 'function') return { mode: 'guest', uid: '' };
    return win.AUTH.state();
  }
  function keyFor(tier) {
    var t = TIER[tier];
    return t ? 'maw-' + t.level : '';
  }
  /** uid 最终该戴哪个键：覆盖值优先，其次按档位推 */
  function frameKeyOf(uid) {
    var f = uid ? FRAMES[uid] : '';
    if (f === 'none') return '';
    if (f && f !== 'auto') return /^maw-[1-4]$/.test(f) ? f : '';
    return keyFor(tierOf(uid));
  }
  function tierOf(uid) {
    if (!uid) return '';
    var st = state();
    if (st.mode === 'authed' && st.uid === uid) {
      if (TIERS[uid]) return TIERS[uid];
      if (ME.uid === uid) return ME.tier;
    }
    return TIERS[uid] || DEMO[uid] || '';
  }
  function tierByAccent(hex) {
    hex = String(hex || '').trim().toLowerCase();
    for (var k in TIER) if (TIER[k].accent === hex) return k;
    return '';
  }

  /* ---------- 自己那一档：登录后问一次，失败就当没赞助 ---------- */
  function syncMe() {
    var st = state();
    if (st.mode !== 'authed' || !st.uid) { ME = { uid: '', tier: '' }; return; }
    if (asked) return;
    asked = true;
    ME.uid = st.uid;
    var base = (win.DSH_API_BASE || '') + '/api';
    fetch(base + '/membership/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var m = j && j.ok && j.data && j.data.member;
        /* 只有 active 的会员才戴框；过期了冠也该摘下来 */
        var t = (m && m.active && TIER[m.tier]) ? m.tier : '';
        ME.tier = t;
        if (t) TIERS[st.uid] = t;
        if (m && m.frame) FRAMES[st.uid] = m.frame;
        decorate();
      })
      .catch(function () { /* 断网就先不画，没什么要提示的 */ });
  }

  /* ---------- 量：尺寸决定冠的密度 ---------- */
  function measure(el) {
    var w = 0;
    try { w = el.getBoundingClientRect().width; } catch (e) { w = 0; }
    if (!w) w = parseFloat(el.getAttribute('width')) || 0;
    return w;
  }
  function densOf(w) { return w < 44 ? 'maw-sm' : (w < 84 ? 'maw-md' : 'maw-lg'); }

  /* ---------- 包 / 拆 ---------- */
  function wrapMaw(el, key) {
    var w = measure(el);
    if (w < MIN_M) return null;
    var shell = document.createElement('span');
    shell.className = 'maw-w ' + densOf(w);
    shell.setAttribute('data-maw', key);
    shell.style.width = Math.round(w) + 'px';
    shell.style.height = Math.round(w) + 'px';
    el.parentNode.insertBefore(shell, el);
    shell.appendChild(el);
    var c = document.createElement('span');
    c.className = 'maw-c';
    c.setAttribute('aria-hidden', 'true');
    var p = document.createElement('span');
    p.className = 'maw-p';
    p.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
    c.appendChild(p);
    shell.appendChild(c);
    /* wrapper 吃掉了原元素身上的定位信息（比如 .trow 的网格槽），补回去 */
    el.removeAttribute('data-frame');
    return shell;
  }
  function unwrapMaw(shell) {
    var el = shell.firstElementChild;
    if (!el) { shell.remove(); return; }
    shell.parentNode.replaceChild(el, shell);
  }
  function mawTick(shell, key) {
    var el = shell.firstElementChild;
    if (shell.getAttribute('data-maw') !== key) shell.setAttribute('data-maw', key);
    var w = el ? measure(el) : 0;
    if (w && Math.abs(parseFloat(shell.style.width) - w) > 2) {
      shell.style.width = Math.round(w) + 'px';
      shell.style.height = Math.round(w) + 'px';
      var d = densOf(w);
      if (!shell.classList.contains(d)) {
        shell.classList.remove('maw-sm', 'maw-md', 'maw-lg');
        shell.classList.add(d);
      }
    }
  }
  function paint(el, key) {
    var shell = el.parentNode && el.parentNode.classList &&
                el.parentNode.classList.contains('maw-w') ? el.parentNode : null;
    if (key) {
      if (shell) { mawTick(shell, key); return; }
      if (el.hasAttribute('data-frame')) el.removeAttribute('data-frame');
      wrapMaw(el, key);
      return;
    }
    if (shell) unwrapMaw(shell);
    if (el.hasAttribute('data-frame')) el.removeAttribute('data-frame');
  }
  function markAv(img) {
    var uid = img.getAttribute('data-auid') || img.getAttribute('data-avuid') || '';
    paint(img, uid ? frameKeyOf(uid) : '');
  }
  /* 会员卡 / 赞助墙的头像不是 .av（membership 模块自己画的 span），
     但容器上带 --tc，档位可以从颜色反推，不必改那边的渲染。 */
  function markBox(el) {
    var tc = '';
    try { tc = getComputedStyle(el).getPropertyValue('--tc'); } catch (e) { tc = ''; }
    paint(el, keyFor(tierByAccent(tc)));
  }

  var QUEUED = false;
  function decorate() {
    QUEUED = false;
    if (!document.body) return;
    var imgs = document.querySelectorAll('img.av');
    for (var i = 0; i < imgs.length; i++) markAv(imgs[i]);
    var boxes = document.querySelectorAll('.vip-id-av, .vip-wall-av');
    for (var j = 0; j < boxes.length; j++) markBox(boxes[j]);
    syncMe();
  }
  function schedule() {
    if (QUEUED) return;
    QUEUED = true;
    (win.requestAnimationFrame || win.setTimeout)(decorate);
  }

  /* ---------- 展台 ---------- */
  /* 试样圆盘的底色：一块中性的深灰蓝，故意不带任何档位色 —— 冠是主角。 */
  var DISC = '#2b3947';
  /* 试样盘里不放字：盘是「头像的位置」，不是档位标签 —— 冠自己会说话。
     盘上写「钻/大/宗/猎」只是早期辨认用的脚手架，读者会把它当成框的一部分。 */
  function mawSample(key, size, cls) {
    return '<span class="maw-w ' + (cls || '') + '" data-maw="' + key + '" ' +
      'style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' +
      '<span class="tf-disc" style="background:' + DISC + '"></span>' +
      '<span class="maw-c"><span class="maw-p"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>' +
    '</span>';
  }
  function mawCard(i) {
    var f = FAMILY.maw, L = f.levels[i], t = ORDER[i], T = TIER[t];
    var key = 'maw-' + (i + 1);
    return '<article class="tf-card">' +
      '<div class="tf-stage">' +
        mawSample(key, 78, 'maw-md') +
        '<span class="tf-ladder">' + mawSample(key, 44, 'maw-sm') + mawSample(key, 30, 'maw-sm') + '</span>' +
      '</div>' +
      '<div class="tf-nm">' + L.name + '</div>' +
      '<div class="tf-lvl">' + f.en + ' · LV' + (i + 1) + '</div>' +
      '<div class="tf-tier"><span class="tf-dot" style="background:' + T.accent + '"></span>' +
        T.name + '档 · ¥' + T.price + '/月</div>' +
      '<p class="tf-note">' + L.note + '</p>' +
    '</article>';
  }
  function row(inner, idx, famKey, tag) {
    var f = FAMILY[famKey];
    return '<div class="tf-famhd">' +
        '<i>' + idx + '</i><b>' + f.name + '</b>' +
        '<code>' + f.en + '</code><span>' + f.gloss + ' · ' + f.axis + '</span>' +
        (tag ? '<em class="tf-on">' + tag + '</em>' : '') +
      '</div>' +
      '<div class="tf-row">' + inner + '</div>';
  }
  function section() {
    var mawCards = [0, 1, 2, 3].map(mawCard).join('');
    return '<section class="vip-section" id="vip-frames">' +
      '<div class="vip-sec-hd"><div>' +
        '<h2>赞助档头像框</h2>' +
        '<p>等级跟着档位走：钻石 LV1、大师 LV2、宗师 LV3、猎杀 LV4。四顶「骨拱冠」—— ' +
          '同一种骨头，四种金属温度：冷钢、紫铜、赤金、血铁。档位越高，獠牙越密、冠梁越低、粒子越快。</p>' +
      '</div><span class="vip-tag">1 套 × 4 级 · 4 款</span></div>' +
      row(mawCards, '①', 'maw', '站内唯一') +
      '<p class="tf-foot">旅人不戴框 —— 一圈干净的头像，和从前一样；到期那天冠会自动摘掉。' +
        '冠是画在头像外面的一层，所以骨拱和獠牙能探出圆外；粒子是这层里的六颗火星，按档位决定几颗、多快。' +
        '28px 以下的小头像不戴冠（信息流里戴上只是噪点）。</p>' +
    '</section>';
  }

  /* ---------- 装上 ----------
     宿主有两条渲染管线：app.js 整块重写 #app，membership.js 重写 #vip-root。
     与其在两处各插一行回调（漏一个就是一处没框），不如盯住 DOM 本身。
     回调里只跑一次 querySelectorAll，已标记过的直接跳过 —— 重绘一百次也只干一次活。 */
  function install() {
    decorate();
    if (!win.MutationObserver || !document.body) return;
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        /* 包 wrapper 自己也会触发新增节点 —— 只认「非 maw-w 的新节点」免得自激 */
        var add = recs[i].addedNodes;
        for (var k = 0; k < add.length; k++) {
          var n = add[k];
          if (n.nodeType === 1 && !(n.classList && n.classList.contains('maw-w'))) { schedule(); return; }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    if (win.AUTH && win.AUTH.ready && typeof win.AUTH.ready.then === 'function') {
      win.AUTH.ready.then(schedule, schedule);
    }
    win.addEventListener('resize', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  win.AvatarFrame = {
    families: FAMS,
    levels: ORDER,
    tier: TIER,
    meta: FAMILY,
    tierOf: tierOf,
    keyOf: keyFor,
    family: function () { return 'maw'; },
    decorate: decorate,
    section: section,
    /* 后台 / 其它模块改了身份之后手动刷新用 */
    setTier: function (uid, t) {
      if (!uid) return;
      if (t) TIERS[uid] = t; else delete TIERS[uid];
      schedule();
    },
    /* 覆盖头像框：key 传 'auto' 恢复跟随档位、'none' 摘掉 */
    setFrame: function (uid, key) {
      if (!uid) return;
      if (key) FRAMES[uid] = key; else delete FRAMES[uid];
      schedule();
    },
    frameOf: frameKeyOf
  };
})(window);