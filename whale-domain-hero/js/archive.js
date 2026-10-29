/* =========================================================
   archive.js — 潮汐档案：垂直滚动 → 水平位移（sticky 画廊）
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, qsa, on, clamp, prefersReduced } = WD.utils;

  const section = qs('#archive');
  const track = qs('#archiveTrack');
  if (!section || !track) return;

  const cards = qsa('.card[data-art]', track);
  const prog = qs('#archiveProg');
  const counter = qs('#archiveCounter');
  const total = cards.length;

  let maxShift = 0;
  let current = -1;
  let raf = 0;

  function measure() {
    maxShift = Math.max(0, track.scrollWidth - window.innerWidth);
    update(true);
  }

  function update(force) {
    const mobile = window.innerWidth <= 900;

    if (mobile) {
      // 移动端交给原生横向滚动
      const scroller = track;
      const p = scroller.scrollWidth - scroller.clientWidth > 0
        ? clamp(scroller.scrollLeft / (scroller.scrollWidth - scroller.clientWidth), 0, 1)
        : 0;
      if (prog) prog.style.width = (p * 100).toFixed(2) + '%';
      setCounter(p);
      return;
    }

    const rect = section.getBoundingClientRect();
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    const p = clamp(-rect.top / travel, 0, 1);

    if (force || p !== current) {
      current = p;
      const x = -p * maxShift;
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      if (prog) prog.style.width = (p * 100).toFixed(2) + '%';
      setCounter(p);
    }
  }

  function setCounter(p) {
    if (!counter) return;
    const i = Math.min(total, Math.max(1, Math.round(p * (total - 1)) + 1));
    const text = String(i).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    if (counter.textContent !== text) counter.textContent = text;
  }

  function requestUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      update(false);
    });
  }

  on(window, 'scroll', requestUpdate, { passive: true });
  on(window, 'resize', measure);
  on(track, 'scroll', requestUpdate, { passive: true });
  window.addEventListener('load', measure);

  measure();
  setCounter(0);

  if (prefersReduced) {
    track.style.transform = 'none';
  }
})();
