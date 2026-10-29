/* =========================================================
   sound.js — WebAudio 环境声场（默认关闭）与声呐回波
   纯合成，无音频文件；只在用户点击后启动，遵守自动播放策略
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, on } = WD.utils;

  const btn = qs('#soundToggle');
  const pingBtn = qs('#sonarBtn');
  const label = btn ? qs('.sound__txt', btn) : null;

  let ctx = null;
  let master = null;
  let playing = false;
  let supported = true;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { supported = false; return null; }
    try { ctx = new AC(); } catch (e) { supported = false; return null; }

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    /* 低频嗡鸣：三个正弦叠成开放式五度 */
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.7;
    filter.connect(master);

    [55, 82.41, 110].forEach(function (freq, i) {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = i === 2 ? 0.18 : 0.42;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
    });

    /* 极慢的滤波器摆动，让声音有潮汐感 */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    /* 粉红噪声 = 深海的水流底噪 */
    const len = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 480;
    band.Q.value = 0.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.38;
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    return ctx;
  }

  function setLabel() {
    if (!label) return;
    label.textContent = playing ? '声场 · 开' : '声场 · 关';
  }

  function toggle() {
    if (!supported) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    playing = !playing;
    const now = c.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(playing ? 0.1 : 0.0001, now + 1.2);
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    setLabel();
  }

  /* 声呐回波：一段下扫音 + 反馈延迟 */
  function ping(strength) {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(c.destination);

    const delay = c.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const fb = c.createGain();
    fb.gain.value = 0.42;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(out);

    [0, 0.9].forEach(function (offset, idx) {
      const t0 = now + offset;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 880 : 660, t0);
      osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.42);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16 * (strength || 1), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(g);
      g.connect(out);
      g.connect(delay);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });

    out.gain.setValueAtTime(0.9, now);
    setTimeout(function () {
      try { out.disconnect(); } catch (e) {}
    }, 6000);
  }

  if (btn) on(btn, 'click', toggle);

  if (pingBtn) {
    const original = pingBtn.querySelector('span:last-child');
    let timer = 0;
    on(pingBtn, 'click', function () {
      if (!supported) return;
      ping(1);
      if (!original) return;
      if (!pingBtn.dataset.base) pingBtn.dataset.base = original.textContent;
      original.textContent = '回波 · 3 次';
      clearTimeout(timer);
      timer = setTimeout(function () {
        original.textContent = pingBtn.dataset.base;
      }, 2200);
    });
  }

  setLabel();
  WD.sound = { toggle, ping, isOn: function () { return playing; } };
})();
