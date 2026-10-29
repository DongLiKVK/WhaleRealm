# 鲸域 WHALE DOMAIN · 品牌首页 Demo

一个零依赖的品牌首页演示：滚动即下潜，深度从海面 0 m 一路落到 11,000 m 的超深渊带。
视觉参考 activetheory.net 的巨型字排版、深色底、细密 HUD 与克制的高级动效，配色与图形语言则重做成「鲸域」自己的深海体系。

## 运行

```bash
# 方式一：带本地服务器（推荐，行为最接近线上）
cd whale-domain-hero
npm start              # 等价于 node server.mjs，默认 http://127.0.0.1:4173/
node server.mjs 8080   # 换端口
```

方式二：不装 Node 也能看 —— 直接在文件管理器里双击 `index.html`，用 `file://` 打开即可（无需构建、无外部请求）。

要求：Node.js ≥ 18（只用于起静态服务器；页面本身无构建步骤、无 npm 依赖）。
浏览器：Chrome / Edge / Safari / Firefox 近两年版本。WebGL 不可用时会自动降级为 CSS 渐变海面。

预览地址：<http://127.0.0.1:4173/>

## 页面结构

| 区块 | 锚点 | 内容 |
| --- | --- | --- |
| 品牌主视觉 | `#top` | 巨字「鲸域 / WHALE DOMAIN」、WebGL 深海、HUD、滚动徽章、声呐按钮 |
| 宣言 | `#manifesto` | 220 m 暮光带；逐字上浮的宣言句 + 三个滚动数字（潜行者 / 插件 / 消息） |
| 产品服务 | `#services` | 1,000 m 午夜带；四片水域 TIDE / REEF / SONAR / DIVE，悬停跟随光标的预览卡 |
| 潮汐档案 | `#archive` | 4,000 m 深渊带；垂直滚动驱动横向 sticky 画廊，5 件作品 |
| 深潜路径 | `#path` | 四步入群流程 |
| 页脚 | `#contact` | 11,000 m 超深渊带；巨型跑马灯、联系邮箱、站点地图、实时时钟 |

## 目录

```
whale-domain-hero/
├── index.html            # 全部语义结构（无框架、无构建）
├── server.mjs            # 零依赖静态服务器（含 MIME、防目录穿越）
├── package.json
├── css/
│   ├── base.css          # 设计变量、字体栈、重置、颗粒/暗角叠层
│   ├── layout.css        # 网格、分区、导轨、深度计、响应式
│   ├── components.css    # 按钮、HUD、服务行、档案卡、页脚
│   └── motion.css        # 入场/揭示/关键帧 + prefers-reduced-motion 降级
├── js/
│   ├── core.js           # 命名空间、工具函数、统一 rAF 时钟、文本拆分
│   ├── hero-shader.js    # WebGL 深海：焦散、光柱、海雪、鼠标荧光
│   ├── cursor.js         # 自定义光标 + 磁吸按钮
│   ├── reveals.js        # IntersectionObserver 滚动揭示
│   ├── services.js       # 服务列表悬停预览卡
│   ├── archive.js        # 垂直滚动 → 水平位移
│   ├── counters.js       # 数字滚动
│   ├── sound.js          # WebAudio 环境声 + 声呐回波（默认关闭）
│   └── main.js           # 装载序列、时钟、HUD、锚点导航
└── assets/
    └── brand-mark.svg    # 品牌标记（圆环 + 水线 + 鲸尾）
```

## 交互清单

- **装载序列**：声呐校准计数 0 → 11,000 m，进度条与阶段文案；1.9 s 后揭幕。
- **首屏揭示**：标题按字上浮（`clip-path` 遮罩），HUD / 导语错峰进入。
- **滚动叙事**：右侧深度计随整页进度下沉，分区标签在 海面 / 暮光带 / 午夜带 / 深渊带 / 超深渊带 之间切换。
- **服务列表**：悬停行高亮 + 磁吸箭头，跟随光标的预览卡（右缘自动翻转到左侧，上下夹在视口内）。
- **档案画廊**：桌面端滚动被「钉住」并驱动横向位移，移动端改为原生横向滚动（scroll-snap）。
- **自定义光标**：`mix-blend-mode: difference` 的圆点 + 阻尼圆环；链接/卡片悬停时放大。
- **声场**：右下角开关启用 WebAudio 合成的低频环境声，点「听一段声呐」发出回波（默认关闭，需用户手势）。
- **降级**：`prefers-reduced-motion` 关闭位移/视差；触屏与窄屏禁用自定义光标和预览卡。

## 设计与技术说明

- **配色**：深海黑 `#04070b`、墨白 `#f1eee5`、荧光青 `#4defd1`、琥珀 `#e6b071`。青色只用于「信号」，琥珀只用于「时间/编号」，避免彩色泛滥。
- **字体**：不加载任何网络字体。拉丁用 Bahnschrift / DIN Alternate（Windows）→ Helvetica Neue（macOS）→ Inter 兜底；等宽 HUD 用 Cascadia Mono / Consolas；中文用系统黑体（PingFang SC / Microsoft YaHei UI）。零请求、零 FOUT。
- **动效**：一条统一 `requestAnimationFrame` 时钟（`WD.tick`）驱动所有模块，配合与帧率无关的阻尼插值；滚动揭示走 `IntersectionObserver`；深度计、进度条、视差只在值变化时写 DOM。
- **无障碍**：`prefers-reduced-motion` 下关闭位移/视差并直接显示内容；导航为真实 `<a>`，按钮有 `aria-pressed`；自定义光标不拦截点击，触屏自动禁用。
- **可移植**：全部 classic script + `window.WD` 命名空间，没有 ES module，因此 `file://` 直接双击也能跑。

## 适配

- 桌面：1600×1000、1440×900、1366×768、1280×720 均已截图验收；矮屏（高度 ≤ 860 px）单独压缩首屏字号与留白，HUD 不会被推出首屏。
- 移动：≤ 900 px 单列布局、画廊改横滑；390×844 下 `scrollWidth === innerWidth`，无横向溢出。

## 可调参数

| 想改什么 | 去哪 |
| --- | --- |
| 颜色 / 字号 / 间距 | `css/base.css` 顶部的 `:root` 变量 |
| 海面颜色、光柱强度 | `js/hero-shader.js` 里的 `uDeep` / `uLight` uniform |
| 下潜总深度与分区名 | `js/main.js` 的 `ZONES` 与 `p * 11000` |
| 档案画廊滚动行程 | `css/layout.css` 中 `.archive` 的 `height:300vh` |
| 装载动画时长 | `js/main.js` 的 `duration`（默认 1900 ms） |
| 预览卡尺寸 | `css/components.css` 的 `.svc-preview` 宽度与 `.svc-preview__art` 比例 |
