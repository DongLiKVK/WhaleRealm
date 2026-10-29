# 鲸域 · 鲸鱼娘 Hero 提示词包（activetheory 风格）

代号 **XI / 汐** —— 鲸域的拟人化身。本文件所有提示词共享同一段 "CHARACTER LOCK"，改任何一条都要保留它，否则跨图会漂。

---

## 0. CHARACTER LOCK（角色锁 · 英文，粘在所有 prompt 前面）

```text
Whale maiden codename XI: a 20-year-old East Asian girl, calm and slightly detached gaze, oval face, straight nose, thin lips, no smile. Hair: deep indigo #0E2A4A at the roots fading to cyan #7FE3FF at the tips, waist length, drifting as if underwater, the last 15cm semi-transparent and fibre-like, faintly self-lit. Two pale fin-shaped ears at the temples (whale pectoral-fin motif), semi-transparent, cyan glow along the edge. A translucent whale tail grows from her lower back, inner surface bioluminescent, outer surface frosted. Skin with soft subsurface scattering and a cold specular sheen, matte, never plastic. Outfit: dark indigo #0E2A4A technical bodysuit, a translucent jellyfish-veil over-layer, brushed-metal ring clasps at collarbone and hips, one thin glowing sonar line from her left collarbone down to the sternum. Barefoot, floating, toes relaxed. Expression: quiet, unblinking, pupils carrying a faint cold inner light.
```

## 0b. SCENE LOCK（场景锁）

```text
She floats inside a broken glass ring: a torus of thick optical glass, tilted 12 degrees, one clean break at the 4 o'clock position, edges catching a rainbow-thin chromatic fringe. Near-black deep water background (#0B131C), no horizon, no floor. Drifting marine snow, a few cyan plankton sparks, no other props. Lighting: single cold white key from upper-left at 45 degrees, cyan bounce from below, one soft volumetric god ray from above, everything else falls to black. 85mm lens, f/1.4, shallow depth of field, subtle chromatic aberration on the ring only, fine film grain, clean real-time WebGL render look, physically based materials, no text, no logo, no watermark.
```

---

## 1. Midjourney v7（短版，MJ 吃不下长句，靠 --sref/--cref 保一致）

主视觉 · 环中悬浮：
```text
/imagine prompt: whale maiden floating inside a broken optical-glass ring, deep indigo-to-cyan waist-length hair drifting as if underwater, translucent fin ears, glowing whale tail, dark indigo bodysuit with jellyfish-veil layer, single cold white rim light, near-black deep water, marine snow particles, volumetric god ray, 85mm f/1.4, cinematic real-time render look, centered symmetrical composition, black background --ar 16:9 --v 7 --style raw --s 200 --q 2 --no text, logo, watermark, extra limbs, deformed hands
```

同一角色的第二机位（拖拽旋转用）——先出主图，再拿图 URL 当 cref：
```text
/imagine prompt: same whale maiden, three-quarter rear view, ring sweeping past camera in foreground, tail fin undulating, particles rising, same lighting and palette --ar 16:9 --v 7 --style raw --s 200 --cref <上一步图片URL> --cw 100 --no text, logo, watermark
```

滚动静止帧（hero 缩小后的大字背景）：
```text
/imagine prompt: extreme close-up of the whale maiden's eye and fin ear, cyan iris with cold inner light, glass ring bokeh rings in the background, black negative space on the left for typography --ar 16:9 --v 7 --style raw --s 150 --cref <角色图URL> --cw 100 --no text
```

## 2. Flux.1 dev / SDXL（ComfyUI 用）

Flux 正向（自然语言，guidance 3.5 / steps 28 / 1024×576 或 1536×864）：
```text
[CHARACTER LOCK] [SCENE LOCK] Composition: the girl is centered, occupying the middle third of the frame, vertically aligned with the ring's axis; the ring's break sits at the lower right so the silhouette is never a perfect circle; generous empty black space on the left and top for headline typography. Slight upward camera tilt, subject weightless. Palette strictly limited to #0B131C background, #0E2A4A, #7FE3FF, #93E5FF, #B4E0E3, with at most one percent #E08A3C bioluminescent accent.
```

SDXL 正向（tag 风格）+ 负向：
```text
POSITIVE: masterpiece, best quality, whale maiden, floating girl, broken glass torus, translucent fin ears, glowing whale tail, indigo cyan gradient hair, underwater particles, volumetric light ray, black background, cinematic lighting, rim light, subsurface scattering, 85mm, depth of field, ultra detailed, centered composition, product-render cleanliness

NEGATIVE: text, watermark, logo, signature, extra limbs, extra fingers, fused fingers, malformed hands, deformed face, asymmetric eyes, plastic skin, doll skin, overexposed, white background, grey background, busy background, cluttered composition, cartoon outline, flat cel shading, lowres, jpeg artifacts, duplicate subject
```

## 3. 中文版（即梦 4 / Seedream / 可灵 / 通义万相）

```text
深海鲸鱼娘，代号汐。二十岁东亚少女，神情安静、不笑，鹅蛋脸，直鼻。及腰长发从深海靛蓝 #0E2A4A 渐变到青蓝 #7FE3FF，发梢半透明、像发光纤维，在水中缓慢漂动。太阳穴两侧各有一片半透明的鲸鳍状耳，边缘泛青光。腰后伸出一条半透明鲸尾，内侧发着生物荧光。皮肤有柔和的次表面散射与冷高光，哑光，不要塑料感。穿深靛色机能紧身衣，外层罩一层透明水母纱，锁骨与胯侧有拉丝金属环扣，一条细的发光声呐线从左锁骨延伸至胸口。赤足悬浮。

她悬在一个破碎的厚玻璃圆环中央：环体倾斜 12 度，四点钟方向有一处干净断口，断口边缘有细微色散彩边。背景是近黑的深海水色 #0B131C，无地平线、无地面。海雪微粒缓缓上浮，少量青色浮游光点。单一冷白主光从左上方 45 度打入，下方有青色反弹光，顶部一束柔和的体积光。85mm，f/1.4，浅景深，只在环体上有轻微色散，细颗粒。构图居中，左侧与上方留出大片纯黑空白用于排版标题。

负向：文字、水印、logo、多余肢体、畸形手指、塑料皮肤、白色背景、灰色背景、杂乱背景、卡通描边、平涂、过曝、低分辨率。
```

## 4. 三视图 → 3D 资产（Tripo / Rodin / Hunyuan3D）

三视图（给 3D 重建用，**不要玻璃、不要透明**，否则进模型就烂）：
```text
character turnaround sheet, the same whale maiden in three views: front, left side, back; A-pose with arms 30 degrees from body, tail extended backward, feet together; opaque resin version of the design (no transparency, no glass, no glow bleed — glow painted as flat emissive colour); uniform flat studio lighting, no shadow on the background, seamless light grey #D8D8D8 background, full body in frame, orthographic look, sharp silhouette, no cropping.
```

图生 3D 的输入要求：
- 单主体、无遮挡、无与背景融合的半透明区域、无文字
- 面数目标 30k–60k tris（Hero 用），或 8k（移动端 LOD）
- 输出 PBR：basecolor / normal / roughness / emissive（尾鳍与声呐线走 emissive）
- 身体与头发、尾鳍**分材质槽**，方便前端单独调发光强度

## 5. 视频（MiniMax H3 / 可灵 / Veo / Runway）

H3 三段式（本机 D:\ai\ComfyUI 上有 H3 工作流，864×480 / duration 124 / steps 8，约 5 分钟）：
```text
A glass-sculpture whale maiden floats inside a broken translucent ring in near-black deep water, rim-lit by a single cold white key light, bioluminescent cyan veins glowing through her semi-transparent tail fin, marine-snow particles drifting upward, volumetric god rays from above, high-end real-time render look, 85mm, shallow depth of field.

Storyboard:
[0s-2s] Slow orbit from front-left: the broken glass ring sweeps past camera, revealing the girl suspended at its centre, hair drifting as if underwater, tail fin undulating slowly.
[2s-4s] Continuous orbit to three-quarter: refraction bends the glowing particles behind her into bright arcs along the ring's inner edge, the cyan veins brighten once and dim.
[4s-6s] Orbit settles back toward front and drifts slightly closer, particles rise past the lens as soft bokeh, eyes open and look straight into camera, everything nearly stills at the loop point.

Audio: deep sub-bass ocean hum, muffled sonar ping every ~2 seconds, faint glassy shimmer as the ring passes the camera, sparse bubbles, no music.
```

循环要点：**首尾帧必须几乎同帧**。做法是让 Orbit 总共只走 15°，最后一秒运动量趋近零；别让模型做「转一圈」，一定会跳。成片用 <video loop muted autoplay playsinline> 播，比 WebGL 便宜一个数量级。

## 6. 前端实现提示词（Claude Code / Cursor / 直接丢给编码模型）

```text
在现有项目 whale-domain-hero/ 里改造首屏 #top 区：把中心视觉从巨字排版换成「3D 鲸鱼娘 + 破碎玻璃环」，视觉参照 activetheory.net 的首页，但配色沿用鲸域深海体系（#0B131C / #0E2A4A / #7FE3FF / #93E5FF / #B4E0E3 / #1775C8，橙色 #E08A3C 只做 ≤1% 的生物荧光点缀）。

技术要求（严格按此实现，不要引入 GSAP/ScrollTrigger）：
1. three.js + EffectComposer 起管线；场景分层渲染到 RenderTarget：bgLayer（海雪粒子 Points）、ringLayer（玻璃环，MeshPhysicalMaterial + transmission=1 + ior 1.45 + iridescence 0.3）、charLayer（glTF 鲸鱼娘，emissive 控制尾鳍与声呐线）。最后一张全屏 quad 合成，shader uniforms：tBg / tRing / tChar / tText / uRatio / uTransition / uVelocity / uAngle。
2. 自写 tween 系统（200 行以内）：easeInOutSine / easeOutCubic / cubicBezier 求值，MathTween 对象带 promise()，全部由同一个 rAF 时钟按 dt 推进；不要在 setTimeout 里做动画。
3. 旋转（核心手感，照抄这三个量）：
   baseRotation = -20°
   scrollTarget = 90° - 190° * scrollProgress
   拖拽：delta.lerp(mouseDown ? mouseDelta : 0, 0.07); rotation += delta.x * 0.0025;
   差速：粒子 1×，玻璃环 1×，鲸鱼娘 2×，尾鳍额外 sin(t) 摆动 6°
   相机反向：camera.position.y = lerp(40, -7, scrollProgress); camera.position.z = lerp(-30, 5, visibleV) - 15 * (1 - scrollProgress)
4. 文字层（DOM，真实排版，绝不让 AI 生成文字）：把 #top 的标题层渲染成纹理（或截屏 canvas），作为 tText 喂给玻璃环的折射采样，让「鲸域 / WHALE DOMAIN」被环真实弯折；折射用屏幕空间 UV 扰动：refractedUV = uv + normal.xy * uDistortStrength * 0.02。
5. 后处理：UnrealBloom（luminosityThreshold 0.8，strength 0.6）+ 低分辨率体积光（0.2 倍 DPR 的 RT + radial blur）+ FXAA；DPR 上限 2。
6. 交互：按下时 uPulse 归零再随帧 +0.001（粒子脉冲）；移动端用 devicemotion 替代鼠标；prefers-reduced-motion 时禁用 orbit 只保留淡入。
7. 降级：WebGL2 不可用 → 一张静态 hero PNG + CSS 渐变；低端 GPU 关掉体积光与 bloom。
8. 性能预算：1440p 下 60fps，首屏图文 < 2.5s，纹理走 KTX2，模型 Draco 压缩，所有资源 lazy 加载，无 CLS。
9. 验收：滚动 0→1 时输出 12 张连续截图比对旋转角度与画面层次；console 无报错；键盘 Tab 能到所有可点元素。
```

## 7. 落地形态怎么选

| 形态 | 成本 | 观感 | 适合 |
| --- | --- | --- | --- |
| 环中 3D 雕塑（glTF + 全管线） | 高：1 张图 → 图生 3D → 减面 → 接管线 | 最接近原站 | 有时间、要品牌级 |
| 2.5D 分层（身体/发/尾/环 分层 PNG） | 中：一张图切 4 层 | 到位，且有呼吸感 | 首选平衡点 |
| 单张立绘 + 视差 | 低：一张 PNG | 像海报 | 先上线再迭代 |

## 8. 避坑

1. **别让角色整体变成玻璃**：玻璃只给服饰、尾鳍、环；皮肤必须留次表面散射。全身透明会立刻进恐怖谷。
2. **别用白底或灰底出图**：bloom 依赖黑底，白底会把所有辉光洗平，后期抠图也救不回来。
3. **环不要画成正圆**：必须有断口和 12° 倾斜，否则旋转时没有视觉锚点，画面会显得僵硬。
4. **锁 hex**：每条 prompt 都带色值，否则每次生成的蓝都在漂，拼到页面上会打架。
5. **文字绝不交给模型**：中文更容易糊。标题用真实字体排版，再当纹理喂给折射。
6. **视频循环靠首尾同帧**，不靠模型自觉；运动幅度越小，接缝越不明显。
