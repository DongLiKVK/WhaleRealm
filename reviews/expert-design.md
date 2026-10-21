## 一句话结论

有主张的皮肤；把「看起来像论坛」做到 90%，把「用手和键盘用得下去」做到 60% —— QQ 空间那半复活得准，linux.do 那半只搬来了更小的字号。

## 做对的五件事

1. **蓝色分了三支色阶，不是一个色值。** `--brand:#1775c8` 驮白字（4.76:1 刚过 AA），另立 `--brand-ink:#0f63b4` 专供浅底蓝字，css/app.css:4-6 留了注释说明分工；橙按钮不用白字而用深棕 `--ink-amber:#3b1d04`（css/app.css:255），实测 6.07:1 —— 知道暖底驮白字会掉到 3:1 并绕开了。
2. **焦点兜底用 `:where()` 写**（css/app.css:828），特异性为 0，不给任何组件添负担，是给未来的自己留路的写法。
3. **动效降级链路完整**：三档缓动 token（css/app.css:24-26）、位移只给 `(hover:hover) and (pointer:fine)`（css/app.css:832-838）、`prefers-reduced-motion` 下把 `--dur-1` 压到 1ms 并清掉 transform（css/app.css:841-848）。
4. **夜间是换 token，不是写第二套样式**：`html[data-theme="night"]` 只覆盖变量（css/app.css:28-37），组件规则一行没重写。
5. **动态卡头部四段同基线**：44px 头像 / 昵称 / 等级徽章 / 时间·城市（js/app.js:183-188），正文 14px 与评论 13px 拉开差值（css/app.css:307、360），虚线动作条把内容与操作切干净（css/app.css:345）。

## 必须改的五个细节

1. **手机端三个主路由消失。** ≤760px 时 `.nav-links{display:none}`（css/app.css:785），无汉堡或抽屉替代；390px 下只剩 logo 和被截成「搜插件 / 帖子」的搜索框（shots/f-forum-390.png），全站 fixed 元素只剩 `#totop`，插件市场、论坛、我的空间没有入口 → 补 `position:fixed;bottom:0` 的四项 tabbar，加 `padding-bottom:env(safe-area-inset-bottom)`，`body` 同步让出等量高度。
2. **键盘进不了内容区。** 实测论坛页 79 个 `[data-act]` 里 60 个是 div/span，60/60 无 `role`、60/60 无 `tabindex`，可聚焦元素仅 28 个；首页 105 个里 64 个同病。论坛页唯一列表入口是 `<div class="thread trow" data-act="thread">`（js/app.js:392），整个话题列表 Tab 键跳不进去；`<h1>`/`<main>`/`[aria-live]` 在论坛页均为 0 → css/app.css:828 那条认真的 `:focus-visible` 基本空转 → 话题行改 `<a href="#/thread/t1">`，其余补 `role="link" tabindex="0"`，并在 js/app.js:753 的点击委托旁补 Enter/Space 分支。
3. **论坛首屏四层筛选，其中两层语义重复。** 分类胶囊（js/app.js:437-443）→ 7 个 tag chips（js/app.js:444-447）→ 热门标签云（js/app.js:448-450）→ 排序行（js/app.js:451-456），「公告」「经验」在分类与 chips 各出现一次，两级 filter 还是 AND；实测首条话题桌面落在 y≈305，390px 下要滑到 y≈542（占 844 视口 64%，shots/f-forum-390.png）→ 删 tag chips 整行，分类与排序并成一条 sticky 工具条，空结果补「清除筛选」。
4. **字号阶梯碎、下限偏低。** css/app.css 共 152 处 `font-size`、20 种取值，其中 11/11.5/12/12.5 四档合计 79 处、低于 12px 的 57 处，`9.5px` 三处（css/app.css:397、475、561）；body 基准 14px（css/app.css:42），事实上的正文却是 11.5px → 收敛到 12/13/14/16/20 五档，9.5→11、11.5→12，卡片标题改靠 `font-weight:600` 拉层级而非字号。
5. **每条动态常驻一个「写评论」输入框。** js/app.js:199-201，五条动态五个 input 加五个发送按钮，样式全内联、css/app.css 无对应规则 → 每条白长 ~50px，Tab 过一遍动态流要多按十次 → 默认只留「💬 41 条评论」，点击展开 `.cbox`，样式收进 CSS。

## 视觉定位判断

**不成立，且会读成 2013 年。** QQ 空间那半复活得很准：蓝白渐变、172px 云朵头图（css/app.css:192-196）、左栏 emoji 彩块加右侧数字（css/app.css:164-180）、顶部 3px 五色条（index.html:13）。但 linux.do 的骨没搬过来 —— 它靠结构分层（标题/摘要/元信息三行，用间距与字重排队），这里靠缩小字号加堆卡片；结果密度有了、扫读落点没有：11.5px 的三行统计（js/app.js:387-414 的 `.th-stats`）与 12px 的九个回复级操作挤在同一视觉重量上。要脱掉年代感，三刀够：砍顶部五色条、左栏 emoji 方块换纯文字加细线、假图渐变降饱和。

## 若只改三处

1. ≤760px 补底部四项 tabbar —— 移动端如今等于没有导航。
2. 删论坛页 tag chips 一行（js/app.js:444-447），分类与排序并条，首条话题上移约 90px。
3. 全站 ≤11.5px 一律提到 12px 起，字号档位从 20 收到 6。
