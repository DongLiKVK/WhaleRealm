/* =========================================================
   reveals.js — 滚动揭示：逐字上浮 + 区块淡入
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qsa, prefersReduced } = WD.utils;

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' })
    : null;

  function watch(el) {
    if (!el) return;
    if (!observer || prefersReduced) { el.classList.add('is-in'); return; }
    observer.observe(el);
  }

  // 主视觉里的元素由 main.js 在加载完成后统一触发，避免在遮罩后面演完
  function init() {
    qsa('[data-split]').forEach(function (el) {
      if (el.closest('.hero')) return;
      WD.split(el);
      watch(el);
    });
    qsa('[data-reveal]').forEach(function (el) {
      if (el.closest('.hero')) return;
      watch(el);
    });
  }

  WD.reveals = { init, watch };
})();
