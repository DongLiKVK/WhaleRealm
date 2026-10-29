/* =========================================================
   core.js — 全局命名空间、工具函数、统一 rAF 时钟、文本拆分
   ========================================================= */
(function () {
  'use strict';

  const WD = (window.WD = window.WD || {});

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // 与帧率无关的阻尼插值
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * (dt / 16.67)));
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  const prefersReduced = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isTouch = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

  /* ---- 单一 rAF 时钟：所有模块共用一个循环，避免互相抢帧 ---- */
  const tickers = new Set();
  let running = false;
  let lastTime = 0;

  function frame(now) {
    const dt = lastTime ? Math.min(64, now - lastTime) : 16.67;
    lastTime = now;
    tickers.forEach((fn) => {
      try { fn(dt, now); } catch (err) { console.warn('[tick]', err); }
    });
    requestAnimationFrame(frame);
  }

  WD.tick = function (fn) {
    tickers.add(fn);
    if (!running) { running = true; requestAnimationFrame(frame); }
    return () => tickers.delete(fn);
  };

  /* ---- 滚动状态：一处监听，多处读取 ---- */
  const scroll = {
    y: window.scrollY || 0,
    prev: 0,
    vh: window.innerHeight,
    vw: window.innerWidth,
    progress: 0,
    max: 1,
    dir: 1,
  };
  function measure() {
    scroll.vh = window.innerHeight;
    scroll.vw = window.innerWidth;
    scroll.y = window.scrollY || window.pageYOffset || 0;
    scroll.max = Math.max(1, document.documentElement.scrollHeight - scroll.vh);
    scroll.progress = clamp(scroll.y / scroll.max, 0, 1);
    scroll.dir = scroll.y > scroll.prev ? 1 : -1;
    scroll.prev = scroll.y;
  }
  on(window, 'scroll', measure, { passive: true });
  on(window, 'resize', measure);
  measure();
  WD.scroll = scroll;
  WD.measure = measure;

  /* ---- 文案拆分：把每个字包成 .ch，用于逐字上浮 ---- */
  function splitChars(el, delay) {
    if (!el || el.dataset.splitDone) return 0;
    let index = 0;

    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const text = child.textContent;
          if (!text.trim()) { child.remove(); return; }
          const frag = document.createDocumentFragment();
          Array.from(text).forEach((ch) => {
            if (ch === ' ') {
              const space = document.createElement('span');
              space.className = 'ch ch--space';
              space.textContent = '\u00A0';
              frag.appendChild(space);
              return;
            }
            const span = document.createElement('span');
            span.className = 'ch';
            span.textContent = ch;
            span.style.setProperty('--ci', String(index++));
            if (delay) span.style.setProperty('--d', delay + 'ms');
            frag.appendChild(span);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };

    walk(el);
    el.dataset.splitDone = '1';
    return index;
  }

  WD.utils = { clamp, lerp, damp, qs, qsa, on, prefersReduced, isTouch, splitChars };
  WD.split = splitChars;
})();
