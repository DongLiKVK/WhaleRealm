/* =========================================================
   counters.js — 进入视口后数字滚动
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qsa, prefersReduced } = WD.utils;

  const nodes = qsa('[data-count]');
  if (!nodes.length) return;

  function format(value, mode) {
    if (mode === 'compact') {
      if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
      if (value >= 1e4) return (value / 1e3).toFixed(1) + 'K';
      return String(Math.round(value));
    }
    return Math.round(value).toLocaleString('en-US');
  }

  function animate(node) {
    const target = parseFloat(node.dataset.count) || 0;
    const mode = node.dataset.format || '';
    const suffix = node.dataset.suffix || '';
    if (prefersReduced) { node.textContent = format(target, mode) + suffix; return; }

    const duration = 1500;
    let start = 0;
    let stop = null;

    stop = WD.tick(function (dt) {
      start += dt;
      const t = Math.min(1, start / duration);
      // easeOutExpo：快起点、慢收尾，像仪表落位
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      node.textContent = format(target * eased, mode) + suffix;
      if (t >= 1 && stop) stop();
    });
  }

  if (!('IntersectionObserver' in window)) {
    nodes.forEach(animate);
    return;
  }

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      animate(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.5 });

  nodes.forEach(function (n) { io.observe(n); });
})();
