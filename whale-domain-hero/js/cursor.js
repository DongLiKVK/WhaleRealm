/* =========================================================
   cursor.js — 自定义光标 + 磁吸按钮
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, qsa, on, damp, isTouch, clamp } = WD.utils;

  const el = qs('#cursor');
  if (!el || isTouch) return;
  // 窄屏没有悬停语义，交还给系统光标
  if (window.innerWidth <= 820) return;

  const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!canHover) return;

  document.documentElement.classList.add('has-cursor');

  const dot = qs('.cursor__dot', el);
  const ring = qs('.cursor__ring', el);
  const label = qs('#cursorLabel', el);

  const state = {
    x: window.innerWidth / 2, y: window.innerHeight / 2,
    dx: window.innerWidth / 2, dy: window.innerHeight / 2,
    rx: window.innerWidth / 2, ry: window.innerHeight / 2,
    visible: false, scale: 1,
  };

  on(window, 'pointermove', function (e) {
    state.x = e.clientX;
    state.y = e.clientY;
    if (!state.visible) {
      state.dx = state.rx = state.x;
      state.dy = state.ry = state.y;
      state.visible = true;
      el.style.opacity = '1';
    }
    if (WD.onPointerMove) WD.onPointerMove(e.clientX, e.clientY);
  }, { passive: true });

  on(document, 'pointerover', function (e) {
    const hit = e.target.closest && e.target.closest('[data-cursor]');
    el.classList.remove('is-link', 'is-view');
    if (!hit) { label.textContent = ''; return; }
    const kind = hit.getAttribute('data-cursor');
    if (kind === 'view') {
      el.classList.add('is-view');
      label.textContent = hit.getAttribute('data-cursor-label') || 'VIEW';
    } else {
      el.classList.add('is-link');
      label.textContent = '';
    }
  });

  on(window, 'pointerleave', function () { state.visible = false; el.style.opacity = '0'; });
  on(window, 'pointerenter', function () { state.visible = true; el.style.opacity = '1'; });
  on(window, 'pointerdown', function () { el.classList.add('is-down'); });
  on(window, 'pointerup', function () { el.classList.remove('is-down'); });

  /* 磁吸：按钮朝光标偏移，离开后弹回 */
  const magnets = qsa('[data-magnetic]').map(function (node) {
    return { node, x: 0, y: 0, tx: 0, ty: 0, active: false };
  });

  magnets.forEach(function (m) {
    on(m.node, 'pointerenter', function () { m.active = true; });
    on(m.node, 'pointerleave', function () { m.active = false; m.tx = 0; m.ty = 0; });
    on(m.node, 'pointermove', function (e) {
      const r = m.node.getBoundingClientRect();
      m.tx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 18;
      m.ty = ((e.clientY - (r.top + r.height / 2)) / r.height) * 14;
    });
  });

  WD.tick(function (dt) {
    state.dx = damp(state.dx, state.x, 34, dt);
    state.dy = damp(state.dy, state.y, 34, dt);
    state.rx = damp(state.rx, state.x, 12, dt);
    state.ry = damp(state.ry, state.y, 12, dt);

    dot.style.transform = 'translate3d(' + state.dx + 'px,' + state.dy + 'px,0) translate(-50%,-50%)';
    ring.style.transform =
      'translate3d(' + state.rx + 'px,' + state.ry + 'px,0) translate(-50%,-50%)';

    magnets.forEach(function (m) {
      m.x = damp(m.x, m.tx, 9, dt);
      m.y = damp(m.y, m.ty, 9, dt);
      m.node.style.transform = 'translate3d(' + m.x.toFixed(2) + 'px,' + m.y.toFixed(2) + 'px,0)';
    });
  });
})();
