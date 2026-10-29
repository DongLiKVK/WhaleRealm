/* =========================================================
   main.js — 装载序列、全局 HUD、滚动叙事、锚点导航
   依赖：core.js（必须最先加载）
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, qsa, on, clamp, prefersReduced } = WD.utils;

  const body = document.body;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  body.classList.add('is-locked');

  /* ---------------- 01 装载序列：声呐校准 ---------------- */
  const loader = qs('#loader');
  const loaderNum = qs('#loaderNum');
  const loaderBar = qs('#loaderBar');
  const loaderStatus = qs('#loaderStatus');

  const STAGES = [
    { at: 0.00, text: '连接深海…' },
    { at: 0.28, text: '校准声呐阵列…' },
    { at: 0.55, text: '接收潮汐数据…' },
    { at: 0.82, text: '压力舱就绪' },
    { at: 1.00, text: '开始下潜' },
  ];

  let stageIndex = -1;

  function paintLoader(p) {
    const eased = 1 - Math.pow(1 - p, 2.2);
    if (loaderNum) {
      loaderNum.textContent = String(Math.round(eased * 11000)).padStart(5, '0');
    }
    if (loaderBar) loaderBar.style.width = (eased * 100).toFixed(2) + '%';
    let next = 0;
    STAGES.forEach(function (s, i) { if (p >= s.at) next = i; });
    if (next !== stageIndex && loaderStatus) {
      stageIndex = next;
      loaderStatus.textContent = STAGES[next].text;
    }
  }

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    body.classList.remove('is-locked');
    body.dataset.loaded = 'true';

    requestAnimationFrame(function () {
      qsa('.hero [data-split]').forEach(function (el) {
        el.classList.add('is-in');
      });
      qsa('.hero [data-reveal]').forEach(function (el) {
        el.classList.add('is-in');
      });
    });
  }

  function endLoader() {
    if (loader) {
      loader.classList.add('is-done');
      window.setTimeout(function () {
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
      }, 1400);
    }
    revealHero();
  }

  function startLoader() {
    if (!loader) { revealHero(); return; }
    const duration = prefersReduced ? 320 : 1900;
    let elapsed = 0;
    let stop = null;
    stop = WD.tick(function (dt) {
      elapsed += dt;
      const p = clamp(elapsed / duration, 0, 1);
      paintLoader(p);
      if (p >= 1) {
        if (stop) stop();
        window.setTimeout(endLoader, prefersReduced ? 0 : 260);
      }
    });
  }

  /* 主视觉文案先拆字，等遮罩拉开再逐字上浮 */
  const heroSplits = qsa('.hero [data-split]');
  const splitDelay = [80, 360, 470];
  heroSplits.forEach(function (el, i) {
    WD.split(el, splitDelay[i] !== undefined ? splitDelay[i] : 520);
  });

  window.addEventListener('load', startLoader);
  // 兜底：资源迟迟不触发 load 时也要放行
  window.setTimeout(function () {
    if (!heroRevealed) startLoader();
  }, 2600);
  if (document.readyState === 'complete') startLoader();

  /* ---------------- 02 时钟（上海） ---------------- */
  const clock = qs('#clock');
  const ftrClock = qs('#ftrClock');
  function tickClock() {
    const now = new Date();
    let hh = '--', mm = '--', ss = '--';
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit',
        second: '2-digit', hour12: false,
      });
      const parts = fmt.formatToParts(now).reduce(function (acc, p) {
        acc[p.type] = p.value; return acc;
      }, {});
      hh = parts.hour || hh; mm = parts.minute || mm; ss = parts.second || ss;
    } catch (e) {
      hh = String(now.getHours()).padStart(2, '0');
      mm = String(now.getMinutes()).padStart(2, '0');
      ss = String(now.getSeconds()).padStart(2, '0');
    }
    const text = hh + ':' + mm + ':' + ss;
    if (clock) clock.textContent = text + ' CST';
    if (ftrClock) ftrClock.textContent = text;
  }
  tickClock();
  window.setInterval(tickClock, 1000);

  /* ---------------- 03 滚动 HUD：进度 / 深度 / 视差 ---------------- */
  const hdr = qs('#hdr');
  const progress = qs('#scrollProgress');
  const depthValue = qs('#depthValue');
  const depthZone = qs('#depthZone');
  const depthFill = qs('#depthFill');
  const depthDot = qs('#depthDot');
  const heroInner = qs('.hero__inner');

  /* 深度标尺：按区块的标称深度插值。
     之前直接用「页面滚动百分比 × 11000」，会出现分区标题写 220 M、
     深度计却显示 1,569 M 的打架现象。 */
  const TOTAL_DEPTH = 11000;
  const DEPTH_STOPS = [
    { id: '#top', d: 0 },
    { id: '#manifesto', d: 220 },
    { id: '#services', d: 1000 },
    { id: '#archive', d: 4000 },
    { id: '#path', d: 8000 },
    { id: '#contact', d: 11000 },
  ].map(function (o) { return { el: qs(o.id), d: o.d }; })
   .filter(function (o) { return !!o.el; });

  const ZONES = [
    { until: 220, zh: '海面', en: 'SURFACE' },
    { until: 1000, zh: '暮光带', en: 'TWILIGHT' },
    { until: 4000, zh: '午夜带', en: 'MIDNIGHT' },
    { until: 10600, zh: '深渊带', en: 'ABYSS' },
    { until: Infinity, zh: '超深渊带', en: 'HADAL' },
  ];
  let lastZone = '';
  let lastDepth = -1;
  let lastPct = -1;
  let stopPos = [];

  // 区块顶边滚到导航下方（64px）时算「抵达该深度」，
  // 这样读到哪个区块的标题，深度计就显示那个区块标称的深度。
  function measureStops() {
    const anchor = 64;
    stopPos = DEPTH_STOPS.map(function (o) {
      const top = o.el.getBoundingClientRect().top + window.scrollY;
      return Math.max(0, top - anchor);
    });
  }

  function depthAt(y) {
    if (!stopPos.length) return 0;
    let i = 0;
    for (let k = 0; k < stopPos.length; k++) {
      if (stopPos[k] <= y) i = k;
    }
    const letter = DEPTH_STOPS[i];
    const next = DEPTH_STOPS[i + 1];
    if (!next) return letter.d;
    const a = stopPos[i];
    const b = stopPos[i + 1];
    const t = b > a ? clamp((y - a) / (b - a), 0, 1) : 1;
    return letter.d + (next.d - letter.d) * t;
  }

  WD.tick(function () {
    const s = WD.scroll;
    const p = s.progress;
    const depth = depthAt(s.y);
    const dRatio = clamp(depth / TOTAL_DEPTH, 0, 1);

    if (progress) {
      const pct = Math.round(p * 1000) / 10;
      if (pct !== lastPct) { progress.style.height = pct + '%'; lastPct = pct; }
    }
    if (hdr) hdr.classList.toggle('is-scrolled', s.y > 48);

    if (depthValue) {
      const m = Math.round(depth);
      if (m !== lastDepth) {
        depthValue.textContent = m.toLocaleString('en-US');
        lastDepth = m;
      }
    }
    if (depthFill) depthFill.style.height = (dRatio * 100).toFixed(2) + '%';
    if (depthDot) depthDot.style.top = (dRatio * 100).toFixed(2) + '%';

    if (depthZone) {
      let zone = ZONES[ZONES.length - 1];
      for (let i = 0; i < ZONES.length; i++) {
        if (depth < ZONES[i].until) { zone = ZONES[i]; break; }
      }
      const label = zone.zh + ' ' + zone.en;
      if (label !== lastZone) { depthZone.textContent = label; lastZone = label; }
    }

    if (heroInner && !prefersReduced) {
      const y = Math.min(s.y, s.vh);
      heroInner.style.setProperty('--heroY', (y * 0.16).toFixed(2) + 'px');
      heroInner.style.setProperty('--heroFade', clamp(1 - y / (s.vh * 0.92), 0, 1).toFixed(3));
    }
  });

  /* ---------------- 04 锚点平滑滚动 ---------------- */
  qsa('a[href^="#"]').forEach(function (link) {
    on(link, 'click', function (e) {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#' || hash.length < 2) return;
      const target = qs(hash);
      if (!target) return;
      e.preventDefault();
      const top = hash === '#top'
        ? 0
        : target.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: prefersReduced ? 'auto' : 'smooth',
      });
      if (history.replaceState) history.replaceState(null, '', hash);
    });
  });

  /* ---------------- 05 导航高亮（scroll spy） ---------------- */
  const navLinks = qsa('.hdr__nav a[href^="#"]');
  const spyTargets = navLinks
    .map(function (a) { return qs(a.getAttribute('href')); })
    .filter(Boolean);

  if (navLinks.length && spyTargets.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spyTargets.forEach(function (t) { spy.observe(t); });
  }

  /* ---------------- 06 启动其它模块 ---------------- */
  if (WD.reveals) WD.reveals.init();
  WD.measure();
  measureStops();

  window.addEventListener('resize', function () {
    window.requestAnimationFrame(measureStops);
  }, { passive: true });

  // 字体/图片加载后重新量一次高度，修正 archive 的滚动行程与深度标尺
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { WD.measure(); measureStops(); });
  }
})();
