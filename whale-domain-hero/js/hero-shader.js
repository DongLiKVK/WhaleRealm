/* =========================================================
   hero-shader.js — AT 式主视觉（原生 WebGL，零依赖）
   ────────────────────────────────────────────────────────
   结构（全部渲染进离屏 FBO，双缓冲 ping-pong）：
     1. bg      全屏：深海底色 + 环后冷光池 + 体积光柱 + 焦散
     2. type    全屏文字面：canvas2D 烘焙的巨字，位于 z=-1.2（被环遮挡/折射）
     3. dust    点精灵粒子海雪，绕 Y 轴旋转（1x 速度）
     4. girl    鲸鱼娘贴图面，绕 Y 轴差速旋转（2x 速度）+ 漂浮 + 轮廓辉光
     5. ring    环面（torus）玻璃：菲涅尔 + RGB 色散折射（采样上一帧）+ 虹彩
     6. bloom   亮部阈值 → 半分辨率双向模糊
     7. comp    合成 + 暗角 + 胶片颗粒
   运动：拖拽惯性 → groupRot；滚动 → scrollRot = 90° - 190°·hp；镜头反向推拉。
   ========================================================= */
(function () {
  'use strict';
  const WD = window.WD;
  if (!WD) return;
  const { qs, clamp, lerp } = WD.utils;

  const canvas = qs('#heroCanvas');
  if (!canvas) return;
  const hero = canvas.closest('.hero') || canvas.closest('section');
  const viewport = canvas.closest('.hero__viewport') || hero;
  const gl = canvas.getContext('webgl', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl) {
    canvas.remove();
    if (hero) hero.setAttribute('data-gl', 'off');
    return;
  }
  if (hero) hero.setAttribute('data-gl', 'on');

  const reduced = WD.utils.prefersReduced;
  const DEG = Math.PI / 180;

  /* ---------- 状态 ---------- */
  const S = {
    hp: 0,               // 0..1 hero 局部滚动进度
    wp: 0,               // 整页滚动进度（用于环境漂移）
    time: 0,
    intro: 0,            // 0..1 入场
    rot: 0,              // 拖拽累积角（弧度）
    vel: 0,              // 拖拽惯性速度
    drag: { on: false, x: 0, y: 0, moved: 0 },
    mouse: { x: 0, y: 0, tx: 0, ty: 0 },
    pulse: 0,
    camZ: 6, camY: -0.02,
    ringR: 0.66,
    girlH: 1.28,
    shift: 0.5,          // 环心屏幕 x（0..1）
    ready: false,
    dpr: Math.min(2, window.devicePixelRatio || 1),
    forced: null,
  };
  try {
    const q = new URLSearchParams(location.search).get('hero');
    if (q !== null && !isNaN(parseFloat(q))) S.forced = clamp(parseFloat(q), 0, 1);
  } catch (e) { /* ignore */ }

  /* ---------- WebGL 小工具 ---------- */
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[hero-shader]', gl.getShaderInfoLog(s), src.slice(0, 400));
      return null;
    }
    return s;
  }
  function program(vs, fs) {
    const v = sh(gl.VERTEX_SHADER, vs);
    const f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[hero-shader link]', gl.getProgramInfoLog(p));
      return null;
    }
    const o = { p: p, u: {}, a: {} };
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      o.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      o.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return o;
  }

  const QUAD_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }',
  ].join('\n');

  /* 统一投影：世界单位 y=±1 ≈ 视口上下边（相机距离 6、焦距 6） */
  const PROJ = [
    'uniform mat4 uModel;',
    'uniform float uAspect;',
    'uniform float uCamD;',
    'uniform float uCamY;',
    'uniform vec2 uShift;',
    'vec4 project(vec3 local, out float persp){',
    '  vec4 w = uModel * vec4(local, 1.0);',
    '  w.y -= uCamY;',
    '  persp = uCamD / max(0.35, w.z + uCamD);',
    '  float ndcX = (w.x + uShift.x) / uAspect * persp;',
    '  float ndcY = w.y * persp;',
    '  float z = -(w.z + uCamD) / (2.0 * uCamD);',
    '  return vec4(ndcX, ndcY, z, 1.0);',
    '}',
  ].join('\n');

  /* ---------- 1. 背景 ---------- */
  const BG_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec2 uRes;',
    'uniform float uTime, uHp, uIntro;',
    'uniform vec2 uRing;',   // 环心（等比方坐标）
    'uniform float uRingR;',
    'float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }',
    'float vnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
    '  float a=hash21(i), b=hash21(i+vec2(1.,0.)), c=hash21(i+vec2(0.,1.)), d=hash21(i+vec2(1.,1.));',
    '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);',
    '}',
    'float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(11.3,7.7); a*=0.5; } return s; }',
    'void main(){',
    '  float aspect = uRes.x/uRes.y;',
    '  vec2 uv = vUv;',
    '  vec2 p = (uv-0.5)*vec2(aspect,1.0);',
    '  float t = uTime*0.05;',
    // 底色：上方偏冷青，向下沉入近黑
    '  vec3 col = mix(vec3(0.006,0.011,0.018), vec3(0.014,0.030,0.044), smoothstep(-0.55,0.75,uv.y));',
    '  col = mix(col, vec3(0.020,0.045,0.060), smoothstep(0.35,1.05,uv.y));',
    // 环后冷光池（玻璃环把这一团光折成彩虹）
    '  float d = length((uv - uRing) * vec2(aspect,1.0));',
    '  float glow = exp(-d*d*9.0) * 0.10 + exp(-d*2.6)*0.045;',
    '  col += vec3(0.10,0.44,0.52) * glow;',
    '  col += vec3(0.22,0.34,0.50) * exp(-d*d*1.6) * 0.035;',
    // 体积光柱：从上方斜插下来
    '  float beam = 0.0;',
    '  for(int i=0;i<3;i++){',
    '    float fi = float(i);',
    '    float x = p.x + fi*1.35 - 1.5 + sin(t*2.0+fi)*0.12;',
    '    float w = 0.10 + fi*0.05;',
    '    beam += exp(-abs(x)/w) * (0.6 - fi*0.15);',
    '  }',
    '  beam *= smoothstep(-0.95, 0.55, p.y) * (0.55 + 0.45*fbm(vec2(p.x*1.4+uTime*0.02, p.y*0.6)));',
    '  col += vec3(0.10,0.20,0.24) * beam * 0.22;',
    // 焦散网：极淡的水面折射花纹
    '  float cau = fbm(p*3.2 + vec2(t*1.4, -t*0.9));',
    '  cau = pow(abs(sin(cau*7.0 + t*2.0)), 12.0);',
    '  col += vec3(0.10,0.30,0.34) * cau * 0.05 * smoothstep(0.9,0.2,abs(p.y));',
    // 海底方向压暗
    '  col *= 1.0 - smoothstep(0.15, -1.0, uv.y)*0.35;',
    '  col *= 0.86 + 0.14*uIntro;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  /* ---------- 2. 文字面 ---------- */
  const TYPE_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'uniform vec2 uHalf;',    // 该 z 平面上覆盖整屏的半宽/半高（世界单位）
    'uniform float uZ, uRise, uAspect, uCamD;',
    'void main(){',
    '  vUv = aPos*0.5+0.5;',
    '  vec3 w = vec3(aPos.x*uHalf.x, aPos.y*uHalf.y + uRise, uZ);',
    '  float persp = uCamD / (w.z + uCamD);',
    '  float ndcX = w.x / uAspect * persp;',
    '  float ndcY = w.y * persp;',
    '  gl_Position = vec4(ndcX, ndcY, -(w.z+uCamD)/(2.0*uCamD), 1.0);',
    '}',
  ].join('\n');
  const TYPE_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uAlpha;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vec2(vUv.x, 1.0-vUv.y));',
    '  gl_FragColor = vec4(c.rgb, c.a*uAlpha);',
    '}',
  ].join('\n');

  /* ---------- 3. 粒子 ---------- */
  const DUST_VS = [
    'attribute vec3 aPos;',
    'attribute vec4 aSeed;',
    'uniform float uRotY, uTime, uDpr, uCamD, uCamY, uHp, uPulse;',
    'uniform vec2 uRes;',
    'uniform vec2 uShift;',
    'varying vec3 vCol;',
    'varying float vA;',
    'void main(){',
    '  float s = sin(uRotY), c = cos(uRotY);',
    '  vec3 w = vec3(aPos.x*c - aPos.z*s, aPos.y, aPos.x*s + aPos.z*c);',
    '  w.y -= uCamY;',
    '  w.y += uHp * 0.55;',                     // 下潜：粒子向上流
    '  w += vec3(sin(uTime*0.11+aSeed.x*9.0), cos(uTime*0.09+aSeed.y*7.0), 0.0) * 0.035;',
    '  float persp = uCamD / max(0.35, w.z + uCamD);',
    '  vec2 ndc = vec2((w.x + uShift.x)/ (uRes.x/uRes.y) * persp, w.y * persp);',
    '  gl_Position = vec4(ndc, 1.0 - persp*0.5, 1.0);',
    '  float size = (0.9 + aSeed.z*3.4) * aSeed.w;',
    '  gl_PointSize = clamp(size * persp * uDpr * 2.2, 1.0, 120.0);',
    '  float tw = 0.55 + 0.45*sin(uTime*(0.6+aSeed.y*2.2) + aSeed.x*31.0);',
    '  vA = tw * clamp(persp*0.85, 0.06, 1.6) * (1.0 + uPulse*0.9);',
    '  vCol = mix(vec3(0.62,0.84,0.98), vec3(0.16,0.36,0.86), fract(aSeed.x*7.13));',
    '  if (aSeed.y > 0.93) vCol = vec3(0.92,0.70,0.42);',   // 极少量金砂
    '  if (aSeed.z > 0.86) vCol = vec3(0.86,0.96,1.0);',
    '}',
  ].join('\n');
  const DUST_FS = [
    'precision highp float;',
    'varying vec3 vCol;',
    'varying float vA;',
    'void main(){',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float r = length(q);',
    '  if (r > 0.5) discard;',
    '  float core = smoothstep(0.5, 0.06, r);',
    '  float halo = smoothstep(0.5, 0.0, r) * 0.34;',
    '  float a = (core*0.9 + halo) * vA;',
    '  gl_FragColor = vec4(vCol * a, a);',
    '}',
  ].join('\n');

  /* ---------- 4. 鲸鱼娘 ---------- */
  const GIRL_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'varying vec2 vSway;',
    'uniform mat4 uModel;',
    'uniform float uW, uH, uAspect, uCamD, uCamY, uBob, uSway, uRotY;',
    'uniform vec2 uShift;',
    'void main(){',
    '  vUv = aPos + 0.5;',
    '  vec3 l = vec3(aPos.x*uW, aPos.y*uH + uH*0.5, 0.0);',
    '  float hw = (aPos.y + 0.5);',                     // 0 脚 → 1 头
    '  l.x += sin(uSway + hw*1.7) * 0.012 * hw;',
    '  l.y += uBob + sin(uSway*0.7 + hw) * 0.004 * hw;',
    '  vec4 w = uModel * vec4(l, 1.0);',
    '  w.y -= uCamY;',
    '  float persp = uCamD / max(0.35, w.z + uCamD);',
    '  vec2 ndc = vec2((w.x + uShift.x)/uAspect*persp, w.y*persp);',
    '  gl_Position = vec4(ndc, -(w.z+uCamD)/(2.0*uCamD), 1.0);',
    '  vN = mat3(uModel) * vec3(0.0, 0.0, 1.0);',
    '  vSway = vec2(uSway, hw);',
    '}',
  ].join('\n');
  const GIRL_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'varying vec2 vSway;',
    'uniform sampler2D uTex;',
    'uniform float uAlpha, uTime, uPulse;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vUv);',
    '  if (c.a < 0.004) discard;',
    // 侧转时压暗（背面几乎看不到，光只打正面）
    '  float facing = clamp(vN.z*1.05, 0.0, 1.0);',
    '  vec3 col = c.rgb * mix(0.45, 1.0, facing);',
    // 轮廓辉光：用 alpha 梯度近似菲涅尔边缘
    '  float aL = texture2D(uTex, vUv - vec2(0.004, 0.0)).a;',
    '  float aR = texture2D(uTex, vUv + vec2(0.004, 0.0)).a;',
    '  float aU = texture2D(uTex, vUv + vec2(0.0, 0.004)).a;',
    '  float aD = texture2D(uTex, vUv - vec2(0.0, 0.004)).a;',
    '  float edge = clamp(length(vec2(aR-aL, aU-aD)) * 2.6, 0.0, 1.0);',
    '  col += vec3(0.34,0.76,0.95) * edge * (0.30 + 0.22*sin(uTime*1.4)) * facing;',
    '  col += vec3(0.20,0.46,0.62) * pow(1.0 - facing, 3.0) * 0.5;',   // 侧转时的冷色边
    '  col += vec3(0.20,0.42,0.50) * uPulse * 0.18;',
    '  gl_FragColor = vec4(col, c.a * uAlpha);',
    '}',
  ].join('\n');

  /* ---------- 5. 玻璃环 ---------- */
  const RING_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute vec3 aLocal;',
    'varying vec3 vN, vL, vW;',
    'varying float vEdge;',
    'uniform mat4 uModel;',
    'uniform float uAspect, uCamD, uCamY;',
    'uniform vec2 uShift;',
    'void main(){',
    '  vec4 w = uModel * vec4(aPos, 1.0);',
    '  w.y -= uCamY;',
    '  float persp = uCamD / max(0.35, w.z + uCamD);',
    '  vec2 ndc = vec2((w.x + uShift.x)/uAspect*persp, w.y*persp);',
    '  gl_Position = vec4(ndc, -(w.z+uCamD)/(2.0*uCamD), 1.0);',
    '  vN = normalize(mat3(uModel) * aNorm);',
    '  vL = aLocal;',
    '  vW = w.xyz;',
    '  vEdge = abs(aLocal.z);',   // 环面带内 = |sin(v)|，贴边缘趋近 1
    '}',
  ].join('\n');
  const RING_FS = [
    'precision highp float;',
    'varying vec3 vN, vL, vW;',
    'varying float vEdge;',
    'uniform sampler2D uPrev;',
    'uniform vec2 uRes;',
    'uniform float uTime, uOpacity, uPulse;',
    'uniform vec3 uRim, uCore, uLight;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(vec3(-vW.x*0.25, -vW.y*0.25, 3.0));',
    '  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);',
    '  float fres = pow(1.0 - ndv, 2.4);',
    // 折射：采样上一帧，RGB 三通道错位 → 色散
    '  vec2 suv = gl_FragCoord.xy / uRes;',
    '  vec2 off = N.xy * (0.055 + fres*0.075);',
    '  vec3 refr;',
    '  refr.r = texture2D(uPrev, clamp(suv + off*0.88, 0.001, 0.999)).r;',
    '  refr.g = texture2D(uPrev, clamp(suv + off*1.00, 0.001, 0.999)).g;',
    '  refr.b = texture2D(uPrev, clamp(suv + off*1.14, 0.001, 0.999)).b;',
    '  vec3 col = refr * 0.94;',
    // 虹彩：随视角变化的薄膜干涉感
    '  vec3 irid = 0.5 + 0.5*cos(6.28318*(vec3(0.00,0.33,0.67) + fres*1.55 + uTime*0.03));',
    '  col += irid * fres * 0.55;',
    '  col += uRim * fres * 1.35;',
    '  col += uCore * (1.0 - fres) * 0.30;',
    // 高光：两处点光，形成玻璃的"湿亮"
    '  float spec = pow(max(dot(reflect(-uLight, N), V), 0.0), 42.0);',
    '  col += vec3(1.0,0.99,0.96) * spec * 1.6;',
    '  float spec2 = pow(max(dot(reflect(-normalize(uLight*vec3(-1.2,1.4,-1.0)), N), V), 0.0), 18.0);',
    '  col += vec3(0.55,0.85,1.0) * spec2 * 0.55;',
    // 环带边缘的亮线（玻璃切割面）
    '  float edgeLine = smoothstep(0.80, 1.0, vEdge);',
    '  col += mix(uRim, vec3(1.0), 0.35) * edgeLine * 0.85;',
    '  col += uRim * uPulse * 0.6;',
    '  float a = clamp((0.38 + fres*0.9 + edgeLine*0.5) * uOpacity, 0.0, 1.0);',
    '  gl_FragColor = vec4(col, a);',
    '}',
  ].join('\n');

  /* ---------- 6. 亮部 / 模糊 / 合成 ---------- */
  const BRIGHT_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'uniform float uThreshold;',
    'void main(){',
    '  vec3 c = vec3(0.0);',
    '  c += texture2D(uTex, vUv + uTexel*vec2(-0.5,-0.5)).rgb;',
    '  c += texture2D(uTex, vUv + uTexel*vec2( 0.5,-0.5)).rgb;',
    '  c += texture2D(uTex, vUv + uTexel*vec2(-0.5, 0.5)).rgb;',
    '  c += texture2D(uTex, vUv + uTexel*vec2( 0.5, 0.5)).rgb;',
    '  c *= 0.25;',
    '  float lum = dot(c, vec3(0.2126,0.7152,0.0722));',
    '  float k = smoothstep(uThreshold, uThreshold+0.35, lum);',
    '  gl_FragColor = vec4(c*k, 1.0);',
    '}',
  ].join('\n');

  const BLUR_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uDir;',
    'void main(){',
    '  vec3 s = texture2D(uTex, vUv).rgb * 0.2270270270;',
    '  s += texture2D(uTex, vUv + uDir*1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(uTex, vUv - uDir*1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(uTex, vUv + uDir*3.2307692308).rgb * 0.0702702703;',
    '  s += texture2D(uTex, vUv - uDir*3.2307692308).rgb * 0.0702702703;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}',
  ].join('\n');

  const COMP_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uScene, uBloom;',
    'uniform vec2 uRes;',
    'uniform float uTime, uBloomAmt, uIntro;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 d = uv - 0.5;',
    '  float r2 = dot(d, d);',
    // 边缘轻微色散（镜头感）
    '  float ca = 0.0016 + r2*0.004;',
    '  vec3 scene;',
    '  scene.r = texture2D(uScene, uv + d*ca).r;',
    '  scene.g = texture2D(uScene, uv).g;',
    '  scene.b = texture2D(uScene, uv - d*ca).b;',
    '  vec3 bloom = texture2D(uBloom, uv).rgb;',
    '  vec3 col = scene + bloom * uBloomAmt;',
    // 暗角
    '  float vig = smoothstep(0.95, 0.28, length(d*vec2(1.06,1.0)));',
    '  col *= mix(0.55, 1.0, vig);',
    // 胶片颗粒
    '  float g = hash(gl_FragCoord.xy + fract(uTime)*vec2(31.7,17.3));',
    '  col += (g - 0.5) * 0.022;',
    // 轻微 S 曲线
    '  col = clamp(col, 0.0, 1.0);',
    '  col = col*col*(3.0-2.0*col)*0.35 + col*0.65;',
    '  col *= 0.94 + 0.06*uIntro;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  const P = {
    bg: program(QUAD_VS, BG_FS),
    type: program(TYPE_VS, TYPE_FS),
    dust: program(DUST_VS, DUST_FS),
    girl: program(GIRL_VS, GIRL_FS),
    ring: program(RING_VS, RING_FS),
    bright: program(QUAD_VS, BRIGHT_FS),
    blur: program(QUAD_VS, BLUR_FS),
    comp: program(QUAD_VS, COMP_FS),
  };
  if (!P.bg || !P.type || !P.dust || !P.girl || !P.ring || !P.bright || !P.blur || !P.comp) return;

  /* ---------- 几何 ---------- */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const uvQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);

  function makeTorus(major, minor, segU, segV) {
    const pos = [], nor = [], loc = [], idx = [];
    for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      for (let j = 0; j <= segV; j++) {
        const v = (j / segV) * Math.PI * 2;
        const cv = Math.cos(v), sv = Math.sin(v);
        const r = major + minor * cv;
        pos.push(r * cu, r * su, minor * sv);
        nor.push(cv * cu, cv * su, sv);
        loc.push(cv, sv, Math.sin(v));
      }
    }
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * (segV + 1) + j;
        const b = a + segV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const o = {
      pos: gl.createBuffer(), nor: gl.createBuffer(), loc: gl.createBuffer(),
      ib: gl.createBuffer(), count: idx.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, o.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.loc);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(loc), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return o;
  }
  const mainRing = makeTorus(0.66, 0.052, 120, 14);
  const orbitRing = makeTorus(0.86, 0.0075, 120, 8);

  // 粒子
  const DUST_N = 2600;
  const dustPos = new Float32Array(DUST_N * 3);
  const dustSeed = new Float32Array(DUST_N * 4);
  (function buildDust() {
    let i = 0;
    while (i < DUST_N) {
      const far = i > DUST_N * 0.28;
      // 环状壳层分布，中间留空给主体
      const r = far ? 0.55 + Math.pow(Math.random(), 1.7) * 3.4 : 0.35 + Math.random() * 1.1;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() * 2 - 1) * (far ? 1.55 : 1.1);
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = Math.sin(a) * r * (far ? 1.0 : 0.65) - 0.35;
      dustSeed[i * 4] = Math.random();
      dustSeed[i * 4 + 1] = Math.random();
      dustSeed[i * 4 + 2] = Math.random();
      dustSeed[i * 4 + 3] = far ? 0.42 + Math.random() * 0.5 : 0.9 + Math.random() * 1.5;
      i++;
    }
  })();
  const dustA = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dustA);
  gl.bufferData(gl.ARRAY_BUFFER, dustPos, gl.STATIC_DRAW);
  const dustS = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dustS);
  gl.bufferData(gl.ARRAY_BUFFER, dustSeed, gl.STATIC_DRAW);

  /* ---------- 贴图 ---------- */
  function makeTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // 文字层（canvas2D 烘焙）
  const typeCanvas = document.createElement('canvas');
  const typeTex = makeTex();
  function drawType() {
    const w = Math.max(320, canvas.clientWidth || window.innerWidth);
    const h = Math.max(240, canvas.clientHeight || window.innerHeight);
    const s = Math.min(2, window.devicePixelRatio || 1);
    typeCanvas.width = Math.round(w * s);
    typeCanvas.height = Math.round(h * s);
    const g = typeCanvas.getContext('2d');
    if (!g) return;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.clearRect(0, 0, w, h);
    g.textBaseline = 'alphabetic';
    const F_CJK = '"Microsoft YaHei UI","PingFang SC","Noto Sans SC","Hiragino Sans GB",sans-serif';
    const F_DSP = '"Bahnschrift","DIN Alternate","Helvetica Neue",Arial,sans-serif';
    const F_MONO = '"Cascadia Mono","Consolas",ui-monospace,monospace';

    const size = Math.min(w * 0.155, h * 0.30);
    const lx = Math.max(22, w * 0.055);
    const baseY = h * 0.635;

    function tracked(text, x, y, track, mode, weight, font) {
      g.font = weight + ' ' + font + 'px ' + (mode === 'latin' ? F_DSP : F_CJK);
      let cx = x;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (mode === 'stroke') g.strokeText(ch, cx, y);
        else g.fillText(ch, cx, y);
        cx += g.measureText(ch).width + track;
      }
      return cx;
    }

    // 主字：鲸域
    g.save();
    g.fillStyle = '#f1eee5';
    g.shadowColor = 'rgba(120,220,240,.45)';
    g.shadowBlur = size * 0.16;
    tracked('鲸域', lx, baseY, -size * 0.045, 'fill', 700, size);
    g.restore();

    // 副字：WHALE DOMAIN（描边）
    const ls = size * 0.255;
    g.save();
    g.strokeStyle = 'rgba(241,238,229,.55)';
    g.lineWidth = Math.max(1, size * 0.0045);
    g.letterSpacing = '0px';
    tracked('WHALE DOMAIN', lx + size * 0.02, baseY + size * 0.30, ls * 0.20, 'stroke', 300, ls);
    g.restore();

    // 规格行
    const ms = Math.max(9, size * 0.062);
    g.fillStyle = '#4defd1';
    g.font = '500 ' + ms + 'px ' + F_MONO;
    g.fillText('11,000 M BELOW   ·   31.2304° N / 121.4737° E', lx + size * 0.03, baseY + size * 0.505);

    // 文案
    const ps = Math.max(12.5, size * 0.084);
    g.fillStyle = 'rgba(207,214,216,.88)';
    g.font = '400 ' + ps + 'px ' + F_CJK;
    g.fillText('把代码沉到海面以下。', lx + size * 0.03, baseY + size * 0.80);
    g.fillText('让作品，拥有 11,000 米的压强。', lx + size * 0.03, baseY + size * 0.80 + ps * 1.62);

    gl.bindTexture(gl.TEXTURE_2D, typeTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
  }

  // 鲸鱼娘
  const girlTex = makeTex();
  let girlReady = false;
  const girlImg = new Image();
  girlImg.decoding = 'async';
  girlImg.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, girlTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, girlImg);
    girlReady = true;
    drawType();
  };
  girlImg.onerror = function () { console.warn('[hero] 鲸鱼娘贴图加载失败：assets/characters/whale-girl-cut-fade.png'); };
  girlImg.src = 'assets/characters/whale-girl-cut-fade.png';

  /* ---------- FBO ---------- */
  let W = 2, H = 2;
  const FBO = {
    scene: [null, null], cur: 0,
    bright: null, blurA: null, blurB: null,
  };

  function makeSceneTarget() {
    const tex = makeTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: fb, tex: tex, rb: rb };
  }
  function makeColorTarget(w, h) {
    const tex = makeTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: fb, tex: tex, w: w, h: h };
  }
  function destroy(list) {
    list.forEach(function (t) {
      if (!t) return;
      if (t.fb) gl.deleteFramebuffer(t.fb);
      if (t.rb) gl.deleteRenderbuffer(t.rb);
      if (t.tex) gl.deleteTexture(t.tex);
    });
  }

  function resize() {
    const cssW = Math.max(320, canvas.clientWidth || window.innerWidth);
    const cssH = Math.max(240, canvas.clientHeight || window.innerHeight);
    S.dpr = Math.min(window.devicePixelRatio || 1, cssW > 1600 ? 1.6 : 2);
    W = Math.round(cssW * S.dpr);
    H = Math.round(cssH * S.dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    destroy(FBO.scene);
    destroy([FBO.bright, FBO.blurA, FBO.blurB]);
    FBO.scene = [makeSceneTarget(), makeSceneTarget()];
    FBO.cur = 0;
    FBO.bright = makeColorTarget(Math.max(2, W >> 1), Math.max(2, H >> 1));
    FBO.blurA = makeColorTarget(Math.max(2, W >> 1), Math.max(2, H >> 1));
    FBO.blurB = makeColorTarget(Math.max(2, W >> 1), Math.max(2, H >> 1));
    drawType();
  }

  /* ---------- 矩阵 ---------- */
  function mat4Identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function mat4RotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  function mat4RotX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  }
  function mat4RotZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mat4Mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
    }
    return o;
  }
  function mat4Trans(x, y, z) {
    const o = mat4Identity();
    o[12] = x; o[13] = y; o[14] = z;
    return o;
  }

  /* ---------- 绘制辅助 ---------- */
  function bindQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = prog.a.aPos;
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    return loc;
  }
  function drawFullscreen(prog) {
    bindQuad(prog);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 帧 ---------- */
  function heroProgress() {
    if (S.forced !== null) return S.forced;
    const rect = viewport.getBoundingClientRect();
    const extra = (hero ? hero.offsetHeight : rect.height) - rect.height;
    if (extra <= 2) return clamp(-rect.top / Math.max(1, rect.height), 0, 1);
    return clamp(-rect.top / extra, 0, 1);
  }

  let lastT = 0;
  function frame(dt) {
    const dts = Math.min(dt, 64) / 1000;
    S.time += dts;
    S.hp = heroProgress();
    S.wp = WD.scroll.progress;

    // 入场
    if (!reduced) S.intro = Math.min(1, S.intro + dts * 0.7);
    else S.intro = 1;
    const introEase = 1 - Math.pow(1 - S.intro, 3);

    // 鼠标/触控视差
    S.mouse.x += (S.mouse.tx - S.mouse.x) * Math.min(1, dts * 4.5);
    S.mouse.y += (S.mouse.ty - S.mouse.y) * Math.min(1, dts * 4.5);

    // 拖拽惯性
    if (!S.drag.on) S.vel *= Math.pow(0.92, dts * 60);
    S.rot += S.vel * dts * 60;
    S.rot += (S.mouse.x * 0.02 - S.rot * 0.004) * 0; // 保持简单：鼠标不加转角

    // 脉冲衰减
    S.pulse *= Math.pow(0.90, dts * 60);

    // 相机：下拉 + 前进；环心随滚动右移，给左侧大字腾位置
    const hpEase = S.hp * S.hp * (3 - 2 * S.hp);
    S.camZ = lerp(6.0, 4.4, hpEase) + Math.sin(S.time * 0.16) * 0.05;
    S.camY = lerp(-0.02, 0.16, hpEase) + S.mouse.y * 0.05;
    S.shift = lerp(0.5, 0.665, Math.min(1, Math.max(0, (S.hp - 0.06) / 0.34)));

    // 旋转：基准 -20° + 拖拽 + 滚动 90° - 190°·hp
    const base = -20 * DEG;
    const scrollRot = (90 - 190 * S.hp) * DEG;
    const groupRot = base + S.rot + scrollRot + (reduced ? 0 : S.time * 0.012);
    const girlRot = groupRot * 2 + S.mouse.x * 0.10;
    const orbitRot = -groupRot * 1.35 + 0.6;

    if (!W || !H) return;

    const prev = FBO.scene[FBO.cur ? 0 : 1];
    const cur = FBO.scene[FBO.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.clearColor(0.004, 0.007, 0.011, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = W / H;
    const ringCx = (S.shift * 2 - 1) * aspect * 0.5;
    const ringCy = -0.02;

    /* 1) 背景 */
    gl.useProgram(P.bg.p);
    drawFullscreen(P.bg);
    gl.uniform2f(P.bg.u.uRes, W, H);
    gl.uniform1f(P.bg.u.uTime, S.time);
    gl.uniform1f(P.bg.u.uHp, S.hp);
    gl.uniform1f(P.bg.u.uIntro, introEase);
    gl.uniform2f(P.bg.u.uRing, S.shift, 0.5 - ringCy * 0.5);
    gl.uniform1f(P.bg.u.uRingR, S.ringR);

    /* 2) 文字面（z 最远，被环遮挡并折射） */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    const typeZ = -1.6;
    const typePersp = S.camZ / (typeZ + S.camZ);
    const typeHalfX = (aspect / typePersp) * 1.0;
    const typeHalfY = (1 / typePersp) * 1.0;
    const typeAlpha = clamp((S.hp - 0.035) / 0.14, 0, 1) * introEase;
    const typeRise = lerp(-0.42, 0.0, clamp(S.hp / 0.32, 0, 1)) + (1 - introEase) * -0.2;

    gl.useProgram(P.type.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, typeTex);
    gl.uniform1i(P.type.u.uTex, 0);
    gl.uniform1f(P.type.u.uAlpha, typeAlpha);
    gl.uniform1f(P.type.u.uZ, typeZ);
    gl.uniform1f(P.type.u.uRise, typeRise);
    gl.uniform1f(P.type.u.uAspect, aspect);
    gl.uniform1f(P.type.u.uCamD, S.camZ);
    gl.uniform2f(P.type.u.uHalf, typeHalfX, typeHalfY);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvQuad);
    gl.enableVertexAttribArray(P.type.a.aPos);
    gl.vertexAttribPointer(P.type.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* 3) 粒子（不写深度，位于角色之后绘制 ⇒ 天然被角色遮住） */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(P.dust.p);
    gl.uniform1f(P.dust.u.uRotY, groupRot);
    gl.uniform1f(P.dust.u.uTime, S.time);
    gl.uniform1f(P.dust.u.uDpr, S.dpr);
    gl.uniform1f(P.dust.u.uCamD, S.camZ);
    gl.uniform1f(P.dust.u.uCamY, S.camY);
    gl.uniform1f(P.dust.u.uHp, S.hp);
    gl.uniform1f(P.dust.u.uPulse, S.pulse);
    gl.uniform2f(P.dust.u.uRes, W, H);
    gl.uniform2f(P.dust.u.uShift, ringCx, ringCy);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustA);
    gl.enableVertexAttribArray(P.dust.a.aPos);
    gl.vertexAttribPointer(P.dust.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustS);
    gl.enableVertexAttribArray(P.dust.a.aSeed);
    gl.vertexAttribPointer(P.dust.a.aSeed, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, DUST_N);

    /* 4) 鲸鱼娘 */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    if (girlReady) {
      const bob = reduced ? 0 : Math.sin(S.time * 0.55) * 0.014;
      const sway = reduced ? 0 : Math.sin(S.time * 0.42) * 0.6;
      gl.useProgram(P.girl.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, girlTex);
      gl.uniform1i(P.girl.u.uTex, 0);
      gl.uniform1f(P.girl.u.uAlpha, clamp(introEase * 1.05, 0, 1));
      gl.uniform1f(P.girl.u.uTime, S.time);
      gl.uniform1f(P.girl.u.uPulse, S.pulse);
      gl.uniform1f(P.girl.u.uW, S.girlH * (girlImg.width / Math.max(1, girlImg.height)));
      gl.uniform1f(P.girl.u.uH, S.girlH);
      gl.uniform1f(P.girl.u.uAspect, aspect);
      gl.uniform1f(P.girl.u.uCamD, S.camZ);
      gl.uniform1f(P.girl.u.uCamY, S.camY);
      gl.uniform1f(P.girl.u.uBob, bob - 0.62);
      gl.uniform1f(P.girl.u.uSway, sway);
      gl.uniform1f(P.girl.u.uRotY, girlRot);
      gl.uniform2f(P.girl.u.uShift, ringCx, ringCy);
      gl.uniformMatrix4fv(P.girl.u.uModel, false, mat4Identity());
      gl.bindBuffer(gl.ARRAY_BUFFER, uvQuad);
      gl.enableVertexAttribArray(P.girl.a.aPos);
      gl.vertexAttribPointer(P.girl.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* 5) 玻璃环 + 轨道环 */
    gl.useProgram(P.ring.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prev.tex);
    gl.uniform1i(P.ring.u.uPrev, 0);
    gl.uniform2f(P.ring.u.uRes, W, H);
    gl.uniform1f(P.ring.u.uTime, S.time);
    gl.uniform1f(P.ring.u.uPulse, S.pulse);
    gl.uniform1f(P.ring.u.uAspect, aspect);
    gl.uniform1f(P.ring.u.uCamD, S.camZ);
    gl.uniform1f(P.ring.u.uCamY, S.camY);
    gl.uniform2f(P.ring.u.uShift, ringCx, ringCy);
    gl.uniform3f(P.ring.u.uLight, -0.45, 0.62, 0.65);
    gl.uniform3f(P.ring.u.uRim, 0.48, 0.88, 0.98);
    gl.uniform3f(P.ring.u.uCore, 0.10, 0.28, 0.52);

    function drawRingMesh(mesh, model, opacity, rim, core) {
      gl.uniformMatrix4fv(P.ring.u.uModel, false, model);
      gl.uniform1f(P.ring.u.uOpacity, opacity);
      gl.uniform3f(P.ring.u.uRim, rim[0], rim[1], rim[2]);
      gl.uniform3f(P.ring.u.uCore, core[0], core[1], core[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
      gl.enableVertexAttribArray(P.ring.a.aPos);
      gl.vertexAttribPointer(P.ring.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nor);
      gl.enableVertexAttribArray(P.ring.a.aNorm);
      gl.vertexAttribPointer(P.ring.a.aNorm, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.loc);
      gl.enableVertexAttribArray(P.ring.a.aLocal);
      gl.vertexAttribPointer(P.ring.a.aLocal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    const ringModel = mat4Mul(mat4RotY(groupRot), mat4RotZ(0.10));
    drawRingMesh(mainRing, ringModel, 0.96, [0.48, 0.88, 0.98], [0.10, 0.26, 0.52]);

    const orbitModel = mat4Mul(mat4Mul(mat4RotX(1.15), mat4RotY(orbitRot)), mat4RotZ(0.35));
    drawRingMesh(orbitRing, orbitModel, 0.42, [0.86, 0.74, 0.52], [0.22, 0.16, 0.08]);

    /* 6) 亮部 + 模糊 */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO.bright.fb);
    gl.viewport(0, 0, FBO.bright.w, FBO.bright.h);
    gl.useProgram(P.bright.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur.tex);
    gl.uniform1i(P.bright.u.uTex, 0);
    gl.uniform2f(P.bright.u.uTexel, 1 / W, 1 / H);
    gl.uniform1f(P.bright.u.uThreshold, 0.55);
    drawFullscreen(P.bright);

    gl.useProgram(P.blur.p);
    gl.uniform1i(P.blur.u.uTex, 0);
    let src = FBO.bright;
    for (let i = 0; i < 3; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, FBO.blurA.fb);
      gl.viewport(0, 0, FBO.blurA.w, FBO.blurA.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(P.blur.u.uDir, 1 / src.w, 0);
      drawFullscreen(P.blur);

      gl.bindFramebuffer(gl.FRAMEBUFFER, FBO.blurB.fb);
      gl.viewport(0, 0, FBO.blurB.w, FBO.blurB.h);
      gl.bindTexture(gl.TEXTURE_2D, FBO.blurA.tex);
      gl.uniform2f(P.blur.u.uDir, 0, 1 / src.h);
      drawFullscreen(P.blur);
      src = FBO.blurB;   // 反馈回路用同一尺寸，模糊累积更柔
    }

    /* 7) 合成 */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, FBO.blurB.tex);
    gl.uniform1i(P.comp.u.uScene, 0);
    gl.uniform1i(P.comp.u.uBloom, 1);
    gl.uniform2f(P.comp.u.uRes, W, H);
    gl.uniform1f(P.comp.u.uTime, S.time);
    gl.uniform1f(P.comp.u.uBloomAmt, 0.78 + S.pulse * 0.5);
    gl.uniform1f(P.comp.u.uIntro, introEase);
    drawFullscreen(P.comp);

    gl.activeTexture(gl.TEXTURE0);
    FBO.cur = FBO.cur ? 0 : 1;
  }

  WD.tick(frame);

  /* ---------- 交互 ---------- */
  function pointerDown(e) {
    S.drag.on = true;
    S.drag.x = e.clientX;
    S.drag.y = e.clientY;
    S.drag.moved = 0;
  }
  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    S.mouse.tx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    S.mouse.ty = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    if (!S.drag.on) return;
    const dx = e.clientX - S.drag.x;
    S.drag.x = e.clientX;
    S.drag.moved += Math.abs(dx) + Math.abs(e.clientY - S.drag.y);
    S.drag.y = e.clientY;
    S.vel += -dx * 0.00035;
    S.rot -= dx * 0.0022;
  }
  function pointerUp() {
    if (S.drag.on && S.drag.moved < 6) S.pulse = 1;
    S.drag.on = false;
  }
  viewport.addEventListener('pointerdown', pointerDown, { passive: true });
  window.addEventListener('pointermove', pointerMove, { passive: true });
  window.addEventListener('pointerup', pointerUp, { passive: true });
  window.addEventListener('pointercancel', pointerUp, { passive: true });

  let rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 160);
  }, { passive: true });

  // 字体就绪后重烘焙文字贴图（Bahnschrift / 雅黑的度量会变）
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { drawType(); });
  }

  resize();
  // 首帧前再量一次，避免 canvas 尺寸为 0 时建了 2x2 的 FBO
  requestAnimationFrame(function () {
    resize();
    S.ready = true;
  });
})();
