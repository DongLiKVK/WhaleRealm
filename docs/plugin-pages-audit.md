# 插件独立页：GitHub 仓库页结构、鲸域视觉与功能对照

> 版本：v39 · 2026-10-23
> 范围：js/plugin-page.js、css/plugin-page.css、js/app.js、index.html

## 1. 结论

- index.html 是 SPA 外壳，不承载任何单个插件的静态详情结构。28 个插件详情页统一由 js/plugin-page.js 渲染，路由为 #/plugin/<id>[/<tab>]。
- 旧条目页的主要功能已映射到新仓库页：简介、分类与标签、作者与认领状态、版本/许可证/收录日期、安装包与 sha256、下载三态、收藏、举报、相关帖子与日志、作者空间入口。转载与下架政策页仍在站点 /policy，插件页右栏的「社群收录」卡已按需求移除。
- 额外补齐 GitHub 仓库页常见区域：收藏 / 复制安装命令、代码/版本/议题/讨论/安全/洞察六个标签、文件树与文件查看、README、Releases、Packages、Contributors、Languages、近 7 天安装、语言构成。
- 不引入新框架或依赖；数据仍只有 js/data.js 一份，图标全部内联 SVG。版本、议题、提交与语言构成为稳定演示数据，不请求 GitHub API。

## 2. 文件组织与入口

| 文件 | 角色 | 入口/关键导出 |
| --- | --- | --- |
| index.html | 页面外壳 | css/plugin-page.css 在 css/app.css 之后；js/plugin-page.js 在 js/app.js 之前 |
| js/plugin-page.js | 28 个插件共用的仓库页渲染器 | window.PluginPage.html(ctx)、window.PluginPage.tabs |
| css/plugin-page.css | GitHub 骨架 + 鲸域皮肤 | 作用域 .gh-repo；v38 Primer 骨架 + 文件末尾 v39 站点 token 皮肤；含夜间与 1012/760/480/320 断点 |
| js/app.js | 路由、状态、事件、回退 | entryPage(id) 委托 PluginPage.html；ENTRY_TABS、resetEntryView()、entryTab |
| js/data.js | 唯一数据源 | DATA.plugins（28 条）、DATA.users、DATA.threads、DATA.posts、DATA.pkgStats |
| docs/plugin-pages-audit.md | 本对照文档 | 功能矩阵、逐插件清单、测试记录 |

### 路由与深链

- #/plugin/p1：代码页（默认）。
- #/plugin/p1/releases、issues、discussions、security、insights：直接落到对应标签。
- 非法标签（如 #/plugin/p1/bogus）自动回落到 #/plugin/p1，不报错。
- 切换标签时 hashOf() 同步写回地址栏；applyHash() 读取第三段并调用 resetEntryView()。
- 进入条目的三个入口（条目库点击、#/plugin/... 直达、收藏列表打开）都会重置到代码页并清空临时展开状态。

### 共享渲染器契约

    window.PluginPage.html({
      S, p, u, esc, num, av, tierOf, tierBadge, tierLabel, claimedOf,
      mirrorOf, repoHref, reportPanel, dlBox, threads, posts, userOf, pkgStats
    })

S 由宿主传入，渲染器不读取 app.js 闭包变量；所有动态文本经 ctx.esc 转义。渲染失败时 entryPage() 捕获异常并回退旧三栏条目页。

## 3. 页面区域与 GitHub 对应关系

| GitHub 仓库页区域 | 本项目实现 | 主要类名 |
| --- | --- | --- |
| 仓库头部（owner/repo、Public、简介、主题） | 图标、owner/name、Public、简介、认证/版本/许可证/分类/更新时间徽标 | .gh-repo-head、.gh-repo-ident、.gh-repo-badges |
| Watch / Fork / Star | 收藏（复用 favany，支持取消）、复制安装命令；原来的 Watch 与 Star 合并为一个收藏动作，避免两个按钮做同一件事 | .gh-actions、.gh-fav |
| 标签导航 | 代码 / 版本 / 议题 / 讨论 / 安全 / 洞察，带计数 | .gh-tabs、.gh-tab、.gh-tab-n |
| 文件列表与代码查看 | 目录/文件行、文件查找、展开文件内容、获取插件面板 | .gh-files、.gh-file、.gh-file-view、.gh-getpanel |
| README | 安装、解决什么问题、标签、兼容性、常见问题、贡献、许可、维护者；头部并列标签 README / Contributing / 许可证 | .gh-readme、.gh-readme-tabs、.gh-code、.gh-faq |
| 右侧 About | 简介、主页、仓库、Topics、许可证/收藏/安装/收录 | .gh-side-card、.gh-about-kv |
| Releases | 当前版 + 上一 patch + 上一 minor、Latest 标记、资产与源码包 | .gh-releases、.gh-release、.gh-asset |
| Packages | 包名与版本；仅条目档位显示 No packages published | .gh-package |
| Contributors / Languages | 作者 + 2 位稳定社群编辑；四套固定语言占比 | .gh-contribs、.gh-langs |
| 维护者 | 头像、名字、Lv/徽章、签名、进入 TA 的空间 | .gh-side-owner、.gh-owner |
| Issues | 3 条 Open + 2 条 Closed、按状态筛选、展开两条评论 | .gh-issues、.gh-issue-state、.gh-comment |
| Discussions | 相关 threads（带关联时）+ 相关日志，空态去社群 | .gh-discs、.gh-disc-row |
| Security | 许可证横幅、安装包校验、分发授权、举报 | .gh-sec-banner、.gh-sec-grid |
| Insights | 收藏/安装/下载/议题/讨论、7 天下载柱、语言、贡献者 | .gh-stats、.gh-bars、.gh-langbar |

## 4. 旧条目页 → 新仓库页功能对照

| # | 旧条目页能力 | 旧实现 | 新落点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 图标、名称、分类、简介、标签 | entryHero | 头部 .gh-repo-ident + README + About | 已覆盖 |
| 2 | 收录档位、认证状态、版本、许可证、更新时间 | entryHero / tierBadge | 头部徽标 + About + Security | 已覆盖并增强 |
| 3 | 作者头像/名字/等级/徽章/签名 | entryHero + entrySide | 提交条 + 维护者卡 + Contributors | 已覆盖 |
| 4 | 进入作者空间 | entrySide 的 data-act=user | 维护者卡「进入 TA 的空间」 | 已覆盖 |
| 5 | 收藏 | entryHero 的 favany | 头部收藏按钮（复用 favany，支持取消） | 已覆盖 |
| 6 | 下载三态（包/外链/仅条目） | dlBox | 代码页「获取插件」内嵌同一 dlBox | 已覆盖 |
| 7 | 安装包文件名/大小/sha256/来源 | dlBox + entrySide | 获取面板 + Security 安装包校验/分发授权 | 已覆盖并增强 |
| 8 | 安装命令 | entryBody | README 安装段 + 顶部复制按钮 + 版本页复制 | 已覆盖 |
| 9 | 这个插件做什么、分类/标签、维护者 | entryBody | README 简介/问题/标签/维护者 + About | 已覆盖 |
| 10 | 常见问题（装完没反应/共存/包来源） | entryBody 三问 | README「常见问题」三问 | 已覆盖 |
| 11 | 相关帖子 + 相关日志 | entryTalk | 讨论标签读取 threads 与 posts，按关联列示，计数合并 | 已覆盖 |
| 12 | 收录信息（档位/日期/许可证/仓库/文件/sha/7 日下载） | entrySide | About + Security + Insights | 已覆盖并增强 |
| 13 | 转载与下架政策 | entrySide 按钮 | 插件页「社群收录」卡已移除；站点 /policy 仍可访问 | 入口已移除 |
| 14 | 认领 / 上传新版本 | entrySide / 认领页 | 顶部头部链接按 claimed 切换文案与路由 | 已覆盖 |
| 15 | 举报 | dlBox / reportPanel | Security 页，内嵌举报面板 | 已覆盖 |
| 16 | 条目深链 | #/plugin/<id> | #/plugin/<id>[/<tab>]，非法 tab 回落 | 已增强 |

旧页没有、新页新增的能力：收藏、复制安装命令、六标签导航、文件树与文件查看、文件查找、README、Releases 资产、Packages、Contributors、Languages、Issues 筛选与展开、Security 三卡、Insights 统计与 7 天下载图、移动端标签横向滚动。

## 5. 28 个插件逐项清单

所有插件共用同一套布局与渲染器，仅数据不同。下表列出各自的收录档位与可用数据；「状态」指该插件页已具备完整仓库页结构。

| # | 插件 ID | 名称 | 分类 | 档位 | 安装包 | 包名 | 统计 | 认领 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1 | dsh-blender-plugin | 视觉与多模态 | 本站包 | 有 | dsh-blender-plugin | 有 | 已认领 | 已覆盖 |
| 2 | p2 | dsh-model-clock | 模型与账号接入 | 本站包 | 有 | dsh-model-clock | 有 | 已认领 | 已覆盖 |
| 3 | p3 | genui-kit | UI 增强 | 外链 | — | genui-kit | — | 未认领 | 已覆盖 |
| 4 | p4 | dsh-remote-deploy | 远程与移动端 | 本站包 | 有 | dsh-remote-deploy | 有 | 已认领 | 已覆盖 |
| 5 | p5 | rea-toolbelt | 安全与权限 | 仅条目 | — | rea-toolbelt | — | 未认领 | 已覆盖 |
| 6 | p6 | hindsight-memory | 记忆 | 外链 | — | hindsight-memory | — | 未认领 | 已覆盖 |
| 7 | p7 | dsh-our-free-model | 模型与账号接入 | 本站包 | 有 | dsh-our-free-model | 有 | 未认领 | 已覆盖 |
| 8 | p8 | kinetic-reel | 视觉与多模态 | 外链 | — | kinetic-reel | — | 未认领 | 已覆盖 |
| 9 | p9 | dsh-badge | 文档与渲染 | 仅条目 | — | dsh-badge | — | 已认领 | 已覆盖 |
| 10 | p10 | dsh-cost-meter | 用量与计费 | 本站包 | 有 | dsh-cost-meter | — | 已认领 | 已覆盖 |
| 11 | p11 | theme-factory | 主题与外观 | 外链 | — | theme-factory | — | 未认领 | 已覆盖 |
| 12 | p12 | agent-teams-kit | AGI 架构探索 | 仅条目 | — | agent-teams-kit | — | 未认领 | 已覆盖 |
| 13 | p13 | dsh-oauth-bridge | 身份与通信 | 本站包 | 有 | dsh-oauth-bridge | — | 已认领 | 已覆盖 |
| 14 | p14 | session-replay | 会话与消息 | 外链 | — | session-replay | — | 未认领 | 已覆盖 |
| 15 | p15 | wsl-path-bridge | WSL 与 Windows 互操作 | 本站包 | 有 | wsl-path-bridge | — | 已认领 | 已覆盖 |
| 16 | p16 | web-cdp-probe | 浏览器与网页 | 本站包 | 有 | web-cdp-probe | — | 已认领 | 已覆盖 |
| 17 | p17 | tts-voice-lab | 语音与音频 | 外链 | — | tts-voice-lab | — | 未认领 | 已覆盖 |
| 18 | p18 | skill-pack-manager | 技能包 | 本站包 | 有 | skill-pack-manager | — | 已认领 | 已覆盖 |
| 19 | p19 | flow-runner | 工作流与自动化 | 本站包 | 有 | flow-runner | — | 已认领 | 已覆盖 |
| 20 | p20 | pr-copilot | Git 与代码评审 | 本站包 | 有 | pr-copilot | — | 已认领 | 已覆盖 |
| 21 | p21 | hook-bridge | 通知与集成 | 外链 | — | hook-bridge | — | 未认领 | 已覆盖 |
| 22 | p22 | runtime-doctor | 开发与运行时 | 本站包 | 有 | runtime-doctor | — | 已认领 | 已覆盖 |
| 23 | p23 | permission-audit | 安全与权限 | 仅条目 | — | permission-audit | — | 未认领 | 已覆盖 |
| 24 | p24 | market-admin | 插件市场与管理 | 本站包 | 有 | market-admin | — | 已认领 | 已覆盖 |
| 25 | p25 | ascii-arcade | 娱乐 | 外链 | — | ascii-arcade | — | 未认领 | 已覆盖 |
| 26 | p26 | image-wire | 视觉与多模态 | 本站包 | 有 | image-wire | — | 已认领 | 已覆盖 |
| 27 | p27 | tool-forge | 工具与能力 | 本站包 | 有 | tool-forge | — | 已认领 | 已覆盖 |
| 28 | p28 | memory-bank | 记忆 | 外链 | — | memory-bank | — | 未认领 | 已覆盖 |

数据源：js/data.js 的 DATA.plugins，共 28 条。档位分布：本站包 15 个、外链 9 个、仅条目 4 个；有安装包登记 15 个；有 7 天统计 4 个（p1/p2/p4/p7）。

## 6. 交互与状态

| 交互 | 行为 | 持久化 |
| --- | --- | --- |
| 切换标签 | 更新 S.entryTab，render(false)，同步 hash | 仅内存，刷新回代码页 |
| 收藏 | 复用收藏 S.favPlug，按钮在「收藏 / 已收藏」间切换，计数即时 +1/-1，toast 带「去看看 / 撤销」 | localStorage 的 favPlug 数组 |
| 复制安装命令 | copyText()，toast「安装命令已复制」 | 无 |
| 获取插件 | 展开/收起 .gh-getpanel，内嵌三种档位的 dlBox | 仅内存 |
| 文件展开 | 同一路径再点收起；focusKeyOf 记录 d.file，重绘后焦点回原行 | 仅内存 |
| 文件查找 | 输入即过滤 .gh-file 的 hidden，不重绘；无结果显示空态 | 仅内存 |
| 点目录 | 把目录前缀写入查找框，聚焦输入框并把光标放末尾 | 仅内存 |
| 议题筛选 | Open / Closed / 全部，切换 S.ghIssueFilter | 仅内存 |
| 议题展开 | 同一议题再点收起，aria-expanded 同步 | 仅内存 |
| 进入作者空间 | data-act=user → #/space/<uid> | 现有路由 |
| 政策/举报/认领/上传 | 复用现有 go / rep / claim / upload 动作 | 现有路由 |
| 访客点收藏 | 跳登录并提示「登录后才能收藏」，按钮不置 on | 现有访客闸门 |

跨标签页：storage 事件只同步收藏状态；插件页重绘条件与现有 bootState.painted 保持一致，避免清掉首页输入。

## 7. 响应式与可访问性

- 桌面：.gh-body 两栏 minmax(0,1fr) 296px；≤1012px 侧栏移到主栏下方；≤760px 标签横向滚动、文件行隐藏提交信息与时间、头部按钮换行；≤480px 进一步压缩间距。
- 390px 实测 document.documentElement.scrollWidth = 390、innerWidth = 390，无横向溢出；侧栏 6 张卡单列显示，最宽卡 344px。
- 标签按钮带 aria-selected / aria-current；展开按钮带 aria-expanded；文件查找有 aria-label；图标 SVG 为装饰性，文本始终可见。
- .gh-repo [hidden]{display:none!important} 修复了 .gh-empty 的 display:flex 覆盖 hidden 导致空态常驻的问题。
- 动效仅用于 hover/展开，不依赖动画传达状态；夜间模式由 html[data-theme=night] 覆盖 Primer 变量。

## 8. 验证记录

- node --check js/app.js js/plugin-page.js：通过。
- 28 个插件全部渲染：每个都有 .gh-repo、6 个标签、README；bad=[]。
- #/plugin/p1：6 标签、9 个文件行、README、6 张侧栏卡；版本页 2 个版本；议题 3 Open / 2 Closed；讨论页显示 1 条相关日志，tab 计数 1；安全页 3 卡；洞察页 5 个统计。
- 文件查找：zzzz → 0 行且空态可见；index → 仅 src/index.ts；点 .github/ → 过滤出目录下文件。
- 深链：#/plugin/p3/security 正确；#/plugin/p1/bogus 回落代码页。
- 登录 demo8 后收藏：按钮变「已收藏 2,842」，localStorage.favPlug=['p1']；刷新后仍为 on；再点取消后按钮回「收藏 2,841」。
- 维护者卡：点击头像进入 #/space/u1，空间页正常；README 常见问题 3 条；转载政策可从站点页脚进入。
- 390px：无横向溢出；截图 shots/gh-m390-top.png、gh-m390-mid.png、gh-m390-bottom.png、gh-m390-sidebar.png、gh-fav-m390.png。
- 桌面截图：shots/gh-p1-desktop.png、gh-p1-insights.png、gh-p1-issues.png、gh-p1-empty-filter.png、gh-p1-getpanel.png、gh-p1-discussions.png、gh-p1-sidebar.png、gh-fav-on-desktop.png、gh-fav-in-favs.png。
- v39 视觉回归：1360 / 768 / 390 / 320 均无横向溢出；320px 文件查找框 282px、提交栏 59px（两行网格）；桌面文件栏 + 提交栏 + 文件列表连续成一张卡；夜间模式颜色由站点 token 覆盖。截图 shots/skin-final-desktop.png、skin-final-m390.png、skin-final-w320.png、skin-final-night.png。
- v44 README 头部：28 个插件全部改为 README / Contributing / 许可证并列标签，默认 README 高亮；有 license 数据的页面显示第三枚（本地 24、线上 25），无数据只显示前两枚；点击切换珊瑚色下划线，Contributing 滚到贡献说明并高亮，许可证展开 LICENSE 并高亮，README 关闭已展开文件回到正文；390/320 保持一行并横向铺满，320 长许可证名省略 “license” 后缀（如 Apache-2.0），夜间下划线 #ff9b81；console 0。本地截图 shots/tabs44-desktop.png、tabs44-contrib.png、tabs44-license.png、tabs44d-p1-390.png、tabs44d-p4-390.png、tabs44d-p1-320.png、tabs44d-p4-320.png；生产截图 shots/prod-final-tabs-desktop.png、prod-final-tabs-p1-390.png、prod-final-tabs-p4-390.png、prod-final-tabs-p1-320.png、prod-final-tabs-p4-320.png。
- 控制台：0 个 JS 异常 / 0 个 console error。
- 收藏按钮（合并 Watch/Star 后）：访客看到「收藏 2,841」，点击跳登录并提示「登录后才能收藏」；登录 demo8 后点击变「已收藏 2,842」、aria-pressed=true、localStorage.favPlug=['p1']；#/favs 出现该插件；刷新后保持；取消后回 2,841 且 favPlug=[]。
- 生产部署（v39 + 移除社群收录卡 + v44 README 并列标签）：assets/plugin-page.8f62f292.js、assets/plugin-page.89faa094.css、assets/app.ee7c9607.js；线上 28 个插件全部渲染，右栏均为 6 张卡且无「社群收录」，README 头部均为并列标签（25 个有许可证），1360/390/320 无横向溢出，320 长许可证显示 Apache-2.0，夜间下划线 #ff9b81，安全页 3 卡正常，console 0 错误。

## 9. 已知边界与后续

- 版本、议题、提交、语言占比为稳定生成的演示数据：同一插件每次渲染一致，但不代表真实 GitHub 仓库状态；未引入 GitHub API 或新的后端依赖。
- Releases 的资产 sha 由插件 ID 稳定派生，仅用于展示复制与校验交互；真实分发仍以 js/data.js 的 file.sha 与作者仓库为准。
- 议题的「新建议题」按钮按演示站点约定不接真实工单；需要真实工单时再补后端。
- 讨论标签的 threads 依赖数据对象的 plugin 字段。当前服务端议题接口不返回插件关联，在线同步后会以相关日志为主；静态演示数据里的 threads 仍会按 plugin 关联显示。要补齐需给 threads 表增加 plugin_slug，并在发帖时选择所属插件。
- 28 个页面共用 plugin-page.js，所以新增插件只要在 js/data.js 增加一条记录，页面自动出现，无需复制模板。
- 2026-10-23 README 头部改为 README / Contributing / 许可证三枚并列标签：默认 README 高亮，点击切换珊瑚色下划线；Contributing 滚到贡献说明，许可证展开 LICENSE 文件并高亮，README 关闭已展开文件回到正文；无许可证数据时不渲染第三枚标签。
- 2026-10-23 按需求移除插件页右栏「社群收录」卡（认领/上传/政策/举报入口）；认领与上传仍在头部链接，举报仍在安全标签，政策页仍可从站点其他入口访问。相关 .gh-side-collect / .gh-policy / .gh-report 样式已清理。

## 10. 视觉统一（v39）

v38 的 GitHub 信息架构不变，只在 css/plugin-page.css 末尾追加一层皮肤，把 Primer 变量整体映射到 css/app.css 的站点 token。

| 元素 | 对齐后的处理 |
| --- | --- |
| 页面背景与容器 | 沿用站点 body 的浅蓝渐变；.gh-shell 改用 var(--wrap-w) 与站点左右 18px 间距，.gh-repo 本身透明无边框 |
| 卡片 | 白底 + 1px var(--line) + 12px 圆角 + var(--shadow)；侧栏卡头左侧 3px 蓝渐变竖条 |
| 头部 | 复刻 .entry-hero：白卡、顶部 3px 蓝青渐变条、74px 图标、23px/800 标题、Public 描边徽章 |
| 标签栏 | 独立白卡，38px 高、19px 胶囊；当前项蓝渐变白字；计数是浅色胶囊 |
| 按钮 | 36px 高、18px 胶囊、13px/600；主操作蓝渐变白字，次操作白底描边；收藏沿用站点 .btn.faved 的琥珀色 |
| 表单控件 | 文件查找、分支选择、议题筛选统一 30–32px、9px 圆角、1px 描边，聚焦时站点蓝色 focus ring |
| 文件区 | 文件栏 + 提交栏 + 文件列表拼成一张连续卡片；列表底部 12px 圆角、悬停浅蓝 |
| README / 文档 | 白卡，正文 20px 24px；h2 左侧 3px 蓝竖条；代码块、shields、提示块换成站点浅蓝系 |
| 提示文字与图标 | 次要文字 var(--txt-3)；图标统一 1.7 描边并继承文字色；空态用虚线浅底 |
| 夜间 | html[data-theme=night] 重新映射整套变量，头部、按钮、文件悬停、代码块、标签、空态逐项覆盖 |

v44 把 README 头部从「左标题 + 右入口」改成三枚并列标签：README / Contributing / 许可证。默认 README 高亮，激活态用 GitHub 珊瑚色 2px 下划线，hover 浅蓝底；窄屏保持同一行并横向铺满（space-between），≤340px 缩到 11px、较长的许可证名省略 “license” 后缀，仍可完整点按。点击贡献滚动到「贡献」小节，点击许可证展开 LICENSE 文件并短暂高亮，点击 README 关闭已展开文件回到正文；不新增独立页面。

响应式：1360 / 768 / 390 / 320 实测无横向溢出；≤1012px 侧栏下移，≤760px 标签横向滚动、文件行隐藏提交信息与时间，≤480px 头部与按钮单列。文件区在 320px 仍保持连续卡片，路径最长换行两行。
