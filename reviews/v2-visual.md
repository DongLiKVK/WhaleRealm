# v2 视觉评审 · 首屏与浮层

评审范围：`index.html:1-29` 全文、`css/app.css:61-62/:139/:711-758/:796/:816-852/:1202-1209`、`js/app.js:1407/:1423/:1684/:1776-1795/:1817`。方法：headless Chrome 在 1440×900 与 390×652 下实测，外加关脚本、1.6Mbps 限速两轮。只评审，不改代码。

## 必修

**1. 移动端 ↑ 压住底栏「我的空间」，还把点击抢走了**
- 证据：`css/app.css:744-747`（≤760px 时 `#totop{bottom:16px}`）配 `:1204`（`.m-tabbar` z-index:70、实测高 58.1px）。390×652 滚到底：`#fab-top` 占 336,596→376,636，底栏 593.9→652，交叠 1600px²；`elementFromPoint(356,614)` 返回 `BUTTON#fab-top`，而「👤我的空间」正好占 x 293–390——点它的右半区会跳回顶部。
- 改法：≤760px 把 `#totop` 抬到 `bottom:calc(58px + env(safe-area-inset-bottom) + 12px)`，`.wrap` 底部内边距从 40px 补到 96px（`css/app.css:796`）。
- 风险：低。只动两条媒体查询，桌面不变。可达性本身没问题：44px/40px 都在 44px 触摸下限上，坏的是落点压在底栏那条带上。同一处还有个小雷：`.fab-top` 隐藏时仍是 `tabIndex=0`、`opacity:0`、`pointer-events:none`（`css/app.css:739-742` 实测），键盘 Tab 会停在一个看不见的按钮上，显隐时应同步 `aria-hidden` 与 `disabled`。

**2. ✎ 在非动态路由会吞掉草稿，而且什么都不说**
- 证据：`js/app.js:1783` 直接 `S.route='feed'` 再 `render(false)`，`:1407` 整页重写 `innerHTML`，`:1423` 顺手 `scrollTo({top:0})`。实测 `#/thread/t1`、`#/policy`、`#/claim/p1` 点 ✎ 后一律 route=feed、hash=#/feed、focus=#composer、无 toast；更硬的是先在 `#reply`（`:1192`）里打了半句再点，节点消失且 state 里检索不到该文本——草稿直接蒸发。
- 改法：按路由改语义而非只改文案：`thread` 页 ✎ 变「回复本帖」并 focus `#reply`；`forum` 页变「发新帖」置 `S.composerOpen=true`（`:1684`）；其余保留现行为，但切走前若输入框有内容先存草稿或 toast。FAB 是静态 DOM、不进 render，title/aria-label 需在 `:1425` 附近补一次同步。
- 风险：中。新增路由→动作映射要回头验六条路由的 Tab 顺序与 aria 文案一致性。

**3. 无脚本时是「两个死按钮 + 一句话」**
- 证据：FAB 写死在 `index.html:18-21`，与 JS 无关。关脚本实测 `document.body.innerText` = `"✎ ↑ 这个演示需要启用 JavaScript。"`，`#app` 子节点 0、高 0；noscript（`index.html:23`）只有 `padding:40px;text-align:center`，没有站点名、没有开启路径、没有仓库地址。
- 改法：noscript 里先加 `<style>#totop{display:none}</style>`（noscript 内的 style 只在禁用脚本时生效，零成本），正文换成「站点名 → 这是什么 → 为什么必须 JS（所有页面由 `js/app.js` 生成）→ 浏览器设置里怎么开 → 仓库地址」四行，配色写死 CSS 变量，不能引用 `js/brand.js`。
- 风险：低。注意别在 noscript 里留 `#app` 骨架，否则与空白期提示打架。

**4. 3px 彩条切主题不变色**
- 证据：`index.html:13` 是 inline `linear-gradient(#ff8a3d…#8f7bff)`；实测切到 night 后该 style 字符级不变，而 `--bg` 已是 `#0b131c`、body 为 rgb(11,19,28)（`css/app.css:29`）。五个高饱和色直接压在近黑底上，是全站唯一不跟主题走的色块。
- 改法：迁进 `css/app.css`，`:root` 定义 `--strip-1..5`，night 覆盖为降饱和版本；最小改法是 night 下给该 div 加 `opacity:.55;filter:saturate(.7)`。
- 风险：低。

## 建议

**5. 首屏该有骨架，且几乎零成本**
- 证据：`index.html:25-27` 三脚本无 defer，`render(false)` 在 `js/app.js:1817` 最后一行。实测本地 FCP 48ms、DCL 259ms；1.6Mbps 限速下 FCP 1340ms 而 `#app` 首个子节点 1760ms——约 1.3–1.8 秒只有底色。真正成本是 118KB 的 app.js 加一次性 3650px 的 innerHTML。
- 改法：直接在 `index.html:15` 的 `#app` 里放静态骨架（hero 条 + composer 框 + 两张卡灰块），`:1407` 的整块赋值会自然覆盖，JS 一行不用改；骨架用 `var(--card)/var(--line)`，两套主题自动跟上。
- 风险：低。骨架要能被第 3 条的同一个 style 块一起隐藏。

**6. 点 ✎ 是两个平滑滚动在赛跑**
- 证据：`js/app.js:1423` 先 `scrollTo({top:0,behavior:'smooth'})`，`:1787` 紧接着 `scrollIntoView({block:'center'})`。实测落点停在 scrollY=77、composerTop=290——652 视口里并没有居中，是两次动画互相打断的结果；这正是「先切路由再 focus」那一下闪。
- 改法：✎ 路径改用 `render(true)` 保留滚动，或在 `render` 之后 `requestAnimationFrame` 再 scrollIntoView，取消与 top:0 的竞争；已在该页且已聚焦时直接 return。
- 风险：低。

**7. 移动端 toast 与右下控件群互压**
- 证据：`.toast-wrap` `bottom:36px`、z-index:200（`css/app.css:750`），底栏 z-index:70 高 58.1。390 视口下 toast 底边 616 落在底栏 595–652 内，同时压住 ✎ 下沿（547–587）与 ↑ 上沿（596–636）。因为 `pointer-events:none`，只遮不住点击。
- 改法：与第 1 条同一条媒体查询里把 toast 提到 `calc(58px + safe-area + 12px)`；顺手把 61/70/90/120/200 这串散落数字收成 `--z-nav/--z-pop/--z-fab/--z-lb/--z-toast` token。
- 风险：低。

**8. 灯箱开着时背景还能滚**
- 证据：实测 `.lightbox.open` 时 body `overflow:visible`，`window.scrollY` 0→200 依旧生效（`css/app.css:711` 的 z-index:120 本身正常）。
- 改法：open 时给 body 加类做 `overflow:hidden`（iOS 再配 top 固定），关闭时还原。
- 风险：中低。会干扰 `:1423` 的滚动位置恢复，得一起验。

## 不建议做

**9. 不建议给 FAB 做按路由显隐。** ✎ 是全站唯一常驻写入口，藏掉会让 forum/space 失去主行动点；真问题是文案与动作不对（第 2 条）。而且隐藏会让 `#totop` 高度在 97→44px 之间跳，路由切换时更闪。

**10. 不建议给 ↑ 加方向感知或「滚到底才出现」。** 现在是 `js/app.js:1794` 一个 scrollY>320 布尔，已是最省心的模型；叠加上下滚判定，在 3px 级的内容密度上只会抖，且移动端本来就要为第 1 条腾位置。

**11. 不建议给骨架加 shimmer。** 它只存在 1.3–1.8 秒，动效反而暗示「这站很慢」，还多一条 reduced-motion 分支（`css/app.css:845-852`）。纯静态灰块就够。
