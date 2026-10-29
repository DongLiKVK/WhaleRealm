/* =========================================================
   hero-shader.js — 主视觉 WebGL 深海场（原生 WebGL，无依赖）
   光池 / 斜光柱 / 焦散网 / 海雪 / 鼠标荧光 / 暗角
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, damp, clamp, prefersReduced } = WD.utils;

  const canvas = qs('#heroCanvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) { canvas.remove(); return; }

  const VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }',
  ].join('\n');

  const FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform vec2 uMouse;',
    'uniform float uScroll;',
    'uniform float uReveal;',
    '',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 5; i++){',
    '    s += a * vnoise(p);',
    '    p = p * 2.03 + vec2(11.3, 7.7);',
    '    a *= 0.5;',
    '  }',
    '  return s;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
    '  float t = uTime * 0.06;',
    '  vec2 p = uv + vec2(0.0, uScroll * 0.55);',
    '',
    '  /* 1. 纵深底色：海面幽蓝，向下沉入近黑 */',
    '  vec3 cTop = vec3(0.020, 0.058, 0.072);',
    '  vec3 cMid = vec3(0.010, 0.031, 0.043);',
    '  vec3 cBot = vec3(0.003, 0.007, 0.013);',
    '  vec3 col = mix(cBot, cMid, smoothstep(-1.0, 0.12, uv.y));',
    '  col = mix(col, cTop, smoothstep(0.08, 0.98, uv.y));',
    '',
    '  /* 2. 海面漫射光池 */',
    '  float pool = exp(-length((uv - vec2(0.28, 0.62)) * vec2(0.8, 1.4)) * 2.1);',
    '  col += vec3(0.052, 0.150, 0.160) * pool;',
    '  float pool2 = exp(-length((uv - vec2(-0.55, 0.25)) * vec2(1.2, 1.6)) * 3.4);',
    '  col += vec3(0.030, 0.090, 0.105) * pool2 * 0.7;',
    '',
    '  /* 3. 斜向光柱：噪声脊线拉成细长光带 */',
    '  float shaftN = fbm(vec2(uv.x * 2.4 + uv.y * 1.05 + t * 0.55, uv.y * 0.32 - t * 0.4));',
    '  float shaft = smoothstep(0.47, 0.88, shaftN);',
    '  shaft *= smoothstep(-0.65, 0.85, uv.y);',
    '  col += vec3(0.095, 0.250, 0.255) * shaft * 0.60;',
    '',
    '  /* 4. 焦散网：两层噪声之差的等值带，柔化成水下光网 */',
    '  float n1 = fbm(p * 1.45 + vec2(t * 0.9, -t * 0.35));',
    '  float n2 = fbm(p * 2.9 + n1 * 1.25 + vec2(-t * 0.5, t * 0.65));',
    '  float web = 1.0 - smoothstep(0.03, 0.30, abs(n1 - n2));',
    '  web = pow(web, 1.7);',
    '  float fade = smoothstep(-0.95, 0.70, uv.y);',
    '  col += vec3(0.150, 0.560, 0.510) * web * fade * 0.26;',
    '',
    '  /* 5. 海雪：缓慢下沉的微粒 */',
    '  vec2 gp = uv * vec2(uRes.x / uRes.y, 1.0) * 30.0;',
    '  gp.y += uTime * 0.22;',
    '  gp.x += sin(uTime * 0.04 + gp.y * 0.12) * 0.35;',
    '  vec2 gi = floor(gp);',
    '  vec2 gf = fract(gp) - 0.5;',
    '  float rnd = hash21(gi);',
    '  vec2 off = (vec2(hash21(gi + 3.7), hash21(gi + 9.1)) - 0.5) * 0.68;',
    '  float dotm = 1.0 - smoothstep(0.02, 0.10, length(gf - off));',
    '  float mask = step(0.84, rnd);',
    '  float tw = 0.55 + 0.45 * sin(uTime * 1.1 + rnd * 42.0);',
    '  col += vec3(0.60, 0.86, 0.88) * dotm * mask * tw * 0.34;',
    '',
    '  /* 6. 鼠标处生物荧光 */',
    '  vec2 m = uMouse * vec2(uRes.x / uRes.y, 1.0) * 0.5;',
    '  col += vec3(0.06, 0.34, 0.31) * exp(-length(uv - m) * 3.8) * 0.16;',
    '',
    '  /* 7. 暗角 + 抖动去色带 */',
    '  float vig = 1.0 - smoothstep(0.42, 1.42, length(uv * vec2(0.86, 0.95)));',
    '  col *= mix(0.52, 1.0, vig);',
    '  col += (hash21(gl_FragCoord.xy + fract(uTime) * 37.0) - 0.5) * 0.014;',
    '',
    '  gl_FragColor = vec4(col * uReveal, 1.0);',
    '}',
  ].join('\n');

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[hero-shader]', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[hero-shader] link', gl.getProgramInfoLog(program));
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    mouse: gl.getUniformLocation(program, 'uMouse'),
    scroll: gl.getUniformLocation(program, 'uScroll'),
    reveal: gl.getUniformLocation(program, 'uReveal'),
  };

  let width = 0, height = 0, dpr = 1;
  let mouse = { x: 0, y: 0 };
  let mouseTarget = { x: 0, y: 0 };
  let reveal = 0;
  let visible = true;
  let time = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    // 略降内部分辨率换稳定帧率；画面本身是低频渐变，看不出差别
    const scale = Math.min(dpr, 1.25);
    width = Math.max(1, Math.floor(rect.width * scale));
    height = Math.max(1, Math.floor(rect.height * scale));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(U.res, width, height);
  }

  function draw() {
    gl.uniform1f(U.time, time);
    gl.uniform2f(U.mouse, mouse.x, mouse.y);
    gl.uniform1f(U.scroll, clamp((WD.scroll.y / Math.max(1, WD.scroll.vh)) * 0.9, 0, 1.6));
    gl.uniform1f(U.reveal, reveal);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  WD.onPointerMove = function (x, y) {
    mouseTarget.x = (x / window.innerWidth) * 2 - 1;
    mouseTarget.y = 1 - (y / window.innerHeight) * 2;
  };

  document.addEventListener('pointermove', WD.onPointerMove, { passive: true });

  resize();
  window.addEventListener('resize', function () { setTimeout(resize, 120); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0 }).observe(canvas);
  }

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    canvas.remove();
  });

  if (prefersReduced) {
    reveal = 1;
    gl.uniform1f(U.reveal, 1);
    draw();
    return;
  }

  WD.tick(function (dt) {
    time += dt / 1000;
    mouse.x = damp(mouse.x, mouseTarget.x, 6, dt);
    mouse.y = damp(mouse.y, mouseTarget.y, 6, dt);
    const ready = document.body.dataset.loaded === 'true';
    reveal = damp(reveal, ready ? 1 : 0, 1.6, dt);
    if (visible) draw();
  });

  // 首帧先铺一层，避免加载遮罩下面纯黑
  draw();
})();
