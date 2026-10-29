/* =========================================================
   services.js — 服务列表悬停：跟随光标的预览卡
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, qsa, on, damp, clamp, isTouch, prefersReduced } = WD.utils;

  const list = qs('#svcList');
  const preview = qs('#svcPreview');
  if (!list || !preview) return;

  const art = qs('#svcArt');
  const glyph = qs('#svcGlyph');
  const metaEn = qs('#svcMetaEn');
  const metaZh = qs('#svcMetaZh');

  const DATA = {
    tide: {
      glyph: '潮', en: 'TIDE / 01', zh: '时间倒序 · 零算法',
      bg: 'radial-gradient(70% 55% at 30% 22%, rgba(77,239,209,.55), transparent 70%),' +
          'radial-gradient(90% 70% at 80% 92%, rgba(20,82,120,.95), transparent 72%),' +
          'linear-gradient(165deg,#08141c,#03070b)',
    },
    reef: {
      glyph: '礁', en: 'REEF / 02', zh: '326 块礁岩 · 可订阅',
      bg: 'radial-gradient(65% 55% at 68% 20%, rgba(120,239,190,.45), transparent 70%),' +
          'radial-gradient(90% 70% at 18% 95%, rgba(16,74,66,.95), transparent 70%),' +
          'linear-gradient(165deg,#08161a,#03080b)',
    },
    sonar: {
      glyph: '声', en: 'SONAR / 03', zh: '低频聊天 · 不打断',
      bg: 'radial-gradient(60% 55% at 50% 30%, rgba(90,200,255,.48), transparent 70%),' +
          'radial-gradient(90% 70% at 85% 90%, rgba(20,40,110,.95), transparent 72%),' +
          'linear-gradient(165deg,#070f1e,#03060d)',
    },
    dive: {
      glyph: '潜', en: 'DIVE / 04', zh: '个人空间 · 潜水日志',
      bg: 'radial-gradient(65% 55% at 32% 24%, rgba(150,130,255,.48), transparent 70%),' +
          'radial-gradient(90% 70% at 85% 92%, rgba(40,26,96,.95), transparent 72%),' +
          'linear-gradient(165deg,#0c0b1a,#03050c)',
    },
  };

  const state = { x: 0, y: 0, tx: 0, ty: 0, active: false, shown: false };
  const GAP = 26;   // 光标与卡片间距
  const EDGE = 16;  // 视口安全边距
  let cardW = 240, cardH = 320;

  if (isTouch || prefersReduced) {
    // 触屏/降级：不做跟随卡，靠列表自身的信息
    preview.remove();
    return;
  }

  // 用 offsetWidth/offsetHeight 而不是 getBoundingClientRect：
  // 卡片入场时带 scale(.9)，rect 会量到缩小后的尺寸，导致边界收敛失准。
  function measure() {
    if (preview.classList.contains('is-on')) return;
    cardW = preview.offsetWidth || cardW;
    cardH = preview.offsetHeight || cardH;
  }

  function show(key, row) {
    const d = DATA[key];
    if (!d) return;
    art.style.background = d.bg;
    glyph.textContent = d.glyph;
    metaEn.textContent = d.en;
    metaZh.textContent = d.zh;
    if (!state.shown) {
      measure();
      state.x = state.tx || window.innerWidth / 2;
      state.y = state.ty || window.innerHeight / 2;
      state.shown = true;
    }
    state.active = true;
    preview.classList.add('is-on');
    row.classList.add('is-active');
  }

  function hide() {
    state.active = false;
    preview.classList.remove('is-on');
    qsa('.svc__row', list).forEach(function (r) { r.classList.remove('is-active'); });
  }

  function place() {
    // 默认落在光标右下；右缘不够就翻到左侧，上下夹在视口内
    let x = state.x + GAP;
    if (x + cardW > window.innerWidth - EDGE) x = state.x - cardW - GAP;
    x = clamp(x, EDGE, Math.max(EDGE, window.innerWidth - cardW - EDGE));
    const y = clamp(state.y - cardH * 0.5, EDGE, Math.max(EDGE, window.innerHeight - cardH - EDGE));
    return { x: x, y: y };
  }

  qsa('.svc__row', list).forEach(function (row) {
    on(row, 'pointerenter', function () { show(row.dataset.svc, row); });
  });

  on(list, 'pointermove', function (e) {
    state.tx = e.clientX;
    state.ty = e.clientY;
    if (!state.shown) {
      state.x = state.tx;
      state.y = state.ty;
    }
  }, { passive: true });

  on(list, 'pointerleave', hide);

  WD.tick(function (dt) {
    if (!state.active && !state.shown) return;
    state.x = damp(state.x, state.tx, 13, dt);
    state.y = damp(state.y, state.ty, 13, dt);
    const p = place();
    preview.style.transform =
      'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) scale(' +
      (state.active ? 1 : 0.9) + ')';
  });
})();
