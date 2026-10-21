# index.html · 文档层评审（v2）

对象：`index.html`（实测 3266 B / 29 行，含 4 空行）。交叉证据：`css/app.css:3-27`（:root 变量）、`css/app.css:28-37`（night 变量块）、`js/app.js:1797-1818`（启动尾段）。只出结论，不改代码。

## 一、必修

**M1 · 夜间用户刷新必闪白（FOUC 其实是两段）**
- 证据：`index.html:2` 把 `data-theme="day"` 写死；night 皮肤靠属性切换（`css/app.css:28`）；恢复逻辑在 `js/app.js:1797-1800`，即 120,753 B 的 app.js 解析执行到尾巴才改属性 —— 第一绘早已是 day 配色。第二段白更久：`index.html:15` 的 `#app` 是空 div，首绘在 `js/app.js:1817`，中间整屏只有 `#eef4fa`（`css/app.css:41`）。
- 改法（放在 `<meta name="viewport">` 之后、`<link rel="stylesheet">` 之前）：
```html
<script>
(function(){var t='day';
try{var s=localStorage.getItem('dsh-forum-theme');
 if(s==='day'||s==='night')t=s;
 else if(s==='auto')t=matchMedia('(prefers-color-scheme:dark)').matches?'night':'day';
}catch(e){}
var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t==='night'?'dark':'light';})();
</script>
```
- 影响面：+11 行 HTML，JS/CSS 零改动。回归风险：`js/app.js:1461` 的开关只读写 `day|night`，boot 已归一化，开关不受影响；`auto` 只存在于存储层，用户手动切一次即落回显式值（等价于退出"跟随系统"，需接受）。首访默认仍是 day；若要首访跟随系统，把条件改成 `!s||s==='auto'`，但这是产品决策——会让现有浅色用户首访变深。

**M2 · 夜间过卷区是白的（html 无背景 + 无 color-scheme）**
- 证据：`css/app.css:39` 只有 `html,body{margin:0;padding:0}`，背景挂在 body（`css/app.css:41`）；`css/app.css:3-27` 与 `28-37` 都没有 `color-scheme`。iOS 橡皮筋、桌面滚到底的过卷区露的是 UA canvas，night 下为白。
- 改法（head 内，样式表之后）：
```html
<meta name="color-scheme" content="light dark">
<style>html{background:var(--bg)}:root{color-scheme:light}html[data-theme="night"]{color-scheme:dark}</style>
```
- 影响面：+2 行，无 JS 改动。回归风险：自定义滚动条是 `::-webkit-scrollbar`（`css/app.css:55-58`），会盖过 UA 深色滚动条；输入框均已用 `background:var(--card)` 覆盖，深色下反而更协调。

**M3 · JS 一报错就永久白屏，noscript 兜不住**
- 证据：`index.html:23` 的 noscript 只处理"禁用 JS"，不处理"JS 抛错"；且它排在 `#totop`（`index.html:18-21`）之后，无脚本时 `#fab-write` 仍可见可点却听不到事件（绑定在 `js/app.js:1781`）。
- 改法：
```html
<div id="app"><p class="boot">正在加载…</p></div>
...
<noscript><style>#totop{display:none}</style>
<p class="boot">这个演示的内容全部由 JavaScript 生成：动态流、插件条目库、论坛、聊天与个人空间。请开启 JavaScript 后刷新。</p></noscript>
<style>.boot{padding:56px 20px;text-align:center;color:var(--txt-2)}</style>
```
- 影响面：+3 行，`#app` 里的占位会被 `js/app.js:1407` 的整段 `innerHTML` 覆盖，无需 JS 配合。回归风险：慢网络下先显示占位（比整屏空白诚实），无残留。

## 二、建议

**S1 · skip link 要加，但别直接给 #app 上 role="main"**
- 证据：`js/app.js:1407` 把 `navHTML()`（导航在 `js/app.js:160`）、页脚、移动底栏、灯箱**全部**注入 `#app`。所以 `<div id="app" role="main">` 会把站点头吞进主标志，比不加更糟。
- 改法：`<a class="skip" href="#app">跳到主内容</a>` + `<style>.skip{position:absolute;left:-9999px}.skip:focus{left:0;top:0;z-index:200;background:#0f63b4;color:#fff;padding:10px 14px;border-radius:0 0 8px 0}</style>`；main 交给 `js/app.js:1407` 一行：`navHTML() + '<main id="main">' + body + '</main>' + FOOTER + ...`。
- 影响面：+2 行 HTML / 1 行 JS。回归风险：`href="#app"` 会写入 `#app` 这个 hash，`js/app.js:1352-1366` 对未知首段返回 false、不触发 render，行为等同今天打开带未知 hash 的 URL（落回 feed），下一次点击即被 `hashOf()` 覆盖。

**S2 · 3px 装饰条该 aria-hidden，且该搬出 inline style**
- 证据：`index.html:13`，`style="height:3px;background:linear-gradient(...);z-index:61"`，纯装饰、零信息，读屏会当成无标签容器。
- 改法：`<div class="topbar" aria-hidden="true"></div>` + `<style>.topbar{height:3px;background:linear-gradient(90deg,#ff8a3d,#ffd166,#4be1a0,#5ec7f6,#8f7bff);position:relative;z-index:61}</style>`
- 影响面：净 0 行。回归风险：无，该节点不被 JS 引用。

**S3 · theme-color 写一份就够，别写两份 media 版本**
- 证据：`css/app.css:63` 的导航渐变 `#0a4a86 → var(--brand) → #156db8` 日夜同色，全文件没有 night 覆盖 `.nav`。
- 改法：`<meta name="theme-color" content="#1775c8">`
- 影响面：+1 行，回归无。将来夜间导航若改深，再把值同步进 M1 的 boot 脚本。

**S4 · og/twitter 只加静态文本四件套，别指望运行时改**
- 证据：`js/app.js:1806-1808` 运行时会重写 `document.title` 与 `meta[name=description]`，但抓取器不执行 JS，分享出去永远是 `index.html:6-7` 的静态文本。
- 改法：
```html
<meta property="og:type" content="website"><meta property="og:site_name" content="鲸域">
<meta property="og:title" content="鲸域 · DSH 开发者论坛与聊天社区">
<meta property="og:description" content="零依赖的 DSH 社区前端演示：动态流、插件条目库、论坛、聊天与个人空间。">
<meta property="og:locale" content="zh_CN"><meta name="twitter:card" content="summary">
```
- 影响面：+6 行，回归无。`og:image` 需 1200×630 位图与绝对 URL，目前没有，加空标签只会让多数 IM 回退纯文本。

## 三、不建议做

**N1 · 三个 script 不加 defer。** 它们已在 body 末尾（`index.html:25-27`），解析早完成，defer 只是把执行推到同一时刻；代价是 `window.__dsh`（`js/app.js:1803`）与首绘（`js/app.js:1817`）落进 DOMContentLoaded 窗口，`shots/_smoke.cjs` 这类脚本在 load 后立刻取 `__dsh` 会偶发 undefined。收益≈0。

**N2 · 不加 preload / preconnect。** 实测 `css/app.css` 0 条 `http(s)://`、`js/app.js` 0 次 `fetch/XHR`，唯一外链是 JS 里一个展示用假域名；无第三方源可 preconnect，preload 本地 85,381 B 的 CSS 反而与首个 `<link>` 抢带宽。真正的体量在 `js/app.js` 120,753 B —— 那是压缩/拆包问题，不是文档层。

**N3 · 不加 canonical / robots。** 没有确定域名，`?b=1..6` 还会产出 7 个不同站名（`js/brand.js`），写死 canonical 会永久指向错误 URL。将来真要公开索引，先上 `<meta name="robots" content="noindex">`（数据全虚构）再谈 canonical。

**N4 · 不加 apple-touch-icon。** 需 180×180 PNG，data URI 在 iOS 主屏不可靠；仓库无该位图，加了只能指向不存在文件制造 404。

**N5 · 不加 format-detection / referrer。** `js/data.js` 无电话号码（0 命中、无 `tel:`），全站 0 外链，两条都是空转配置。

**N6 · favicon 保持内联，别换外链 .ico。** `index.html:8` 单行 data URI 2,093 B（payload 2,051 B），零请求、可继承品牌色、gzip 增量极小；换外链反而多一次请求。

**N7 · viewport 与 lang 保持现状。** `index.html:5` 无 `maximum-scale` / `user-scalable=no`，`index.html:2` 的 `lang="zh-CN"` 正确 —— 两项都没误禁缩放，别在"优化"时加回去。
