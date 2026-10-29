# 鲸域（https://whalerealm.top）前端功能完备性评估

范围：index.html + js/*.js + css/*.css（只读），线上接口与无头浏览器实测（2026-10-25）。不涉及服务端实现细节与安全。

## 一、核心发现

| 编号 | 问题 | 严重级别 | 证据 | 影响 |
|---|---|---|---|---|
| F1 | 插件详情页线上渲染中断：服务端 /api/plugins 返回空数组，把前端静态 28 条插件表覆盖成空，pluginOf() 返回 undefined，entryPage 立刻解引用抛错，而 render 对 pageHTML 无 try/catch | 高 | js/app.js:2566-2568、js/app.js:2642-2645、js/app.js:6048；https://whalerealm.top/api/plugins → items:[] | 站点第二主入口（顶栏「插件库」、28 个仓库页、认领/上传的入口）整块不可用；无头 dump https://whalerealm.top/#/plugin/p1 仅见 boot-skel，未见插件页正文 |
| F2 | 社群互动绝大多数只写 localStorage，无对应 API：帖子楼层回复、楼层点赞、空间留言、关注、收藏、二创点赞 | 高 | js/app.js:7465-7468、7470-7473（楼层回复只 push 进 S.newFloors）、7452-7458（空间留言）、7074-7078（楼层赞）、7617-7621（关注仅一个全局布尔）、7207-7224（收藏）、5944（saveState 落 localStorage） | 换设备即全部消失，他人永远看不到；「有人回复我」这类社群闭环不成立。对照：日志评论 js/app.js:7102、发帖 js/app.js:7519 是真接口，同一动作真假不一 |
| F3 | 私信是自问自答：dmSend 只写本地桶，1.2 秒后由 DM_AUTO 模板自动回一条「收到，我看一下，晚点回你。」 | 高 | js/app.js:5257-5282、js/app.js:5052 起 | 用户会误判对方在线并等待回复；这是最容易造成信任损失的假功能 |
| F4 | 上传插件版本无提交接口：upsubmit 只改内存状态并 toast「已提交，等人工审核」 | 高 | js/app.js:6967；文件解析也是伪造 js/app.js:6944-6953（硬编码 1.2 MB / 演示 sha） | 贡献者以为提交成功，服务端零记录，人工审核链路断头 |
| F5 | /api 失败降级为「静默演示」：只在页底挂一个胶囊，6 秒后自动移除，且一次加载只出现一次 | 高 | js/api.js:9-10（自述）、js/api.js:357-379、js/api.js:337-341、js/api.js:425-429 | 错过 6 秒窗口后页面全是演示数据，按钮照样有 toast 反馈，用户无法分辨「真的生效了」还是「在演」 |
| F6 | 日志流无分页：唯一取数入口固定 feed(null, 30)，无加载更多、无无限滚动 | 中 | js/api.js:191；api.js 已备好 cursor 参数但 js/app.js 从未调用 API.feed | 第 31 条以后的社群内容在界面上不存在 |
| F7 | 移动端主航 7 项被 display:none，底部 tabbar 只给 5 项，AI 排行与赞助无一级入口 | 中 | css/app.css:1086、js/app.js:5698-5706（tabbar）、js/app.js:649（7 项 links） | 手机用户只能靠页脚 js/app.js:5693 找到排行；赞助页（收入入口）在移动端近乎不可发现 |
| F8 | 空数据兜底不一致：categories/threads 有空数组保护，posts/plugins 无条件覆盖 | 中 | js/api.js:337-341 | 版块表为空时社群页仍显示 6 个演示版块与演示帖，发帖会打到不存在的 slug；插件表为空则直接崩（F1） |
| F9 | 未定义 hash 静默回落首页，无 404 态 | 低 | js/app.js:5889、pageHTML default→feedPage js/app.js:5689 | 失效深链看起来「正常」，问题被掩盖 |
| F10 | 死链与假数字：页脚「关于社群 / 插件规范 / 反馈与建议」为 javascript:;；「最近访客 全部 128」硬编码 | 低 | js/app.js:5691、5694、2318、2531 | 点击无反应，用户判定站点未完工 |
| F11 | 12 处 data-act="toast" 只弹「（演示）」提示：分享不写剪贴板、举报不提交 | 低 | js/app.js:4104、4124、4125、4128、4468、4520 | 功能可见但无效，需集中标注 |
| F12 | verifyPage 整页死代码，路由已重定向到 settings | 低 | js/app.js:3332-3361、5871 | 维护噪音 |

## 二、缺失/半成品功能清单

**路由 → 实现状态**（全部路由来自 js/app.js:5812-5890 的 applyHash 与 js/app.js:5663-5689 的 pageHTML，均有渲染分支，无 fallback 白屏）

| 路由 | 状态 | 证据/说明 |
|---|---|---|
| #/feed | 部分 | 真接口，但硬顶 30 条无分页（F6） |
| #/plugin/:id（含 /contributing /license /releases/:tag） | 部分 | 渲染器完整（js/plugin-page.js 1535 行），线上因空表崩溃（F1） |
| #/tags、#/tags/:tags | 完整 | 委托 js/tags.js（237 行，分组/结果/侧栏/统计齐备） |
| #/rank（/aa、/cn） | 完整 | js/rank.js 538 行，双榜+颁奖台；数据静态（rank-data/livebench-data），无 API |
| #/art、#/art/:id | 部分 | 点赞/收藏/发布二创全本地（js/app.js:6135 闸门、7348 起） |
| #/space/:uid | 部分 | 留言本地（js/app.js:7452-7458）；关注为全局布尔 |
| #/thread/:id | 部分 | 发帖真落库（js/app.js:7519），楼层回复/点赞本地 |
| #/dm/:uid、#/messages | 缺失 | 无后端，自动假回复（F3）；真实账号消息中心为空（js/app.js:679） |
| #/favs | 部分 | 纯 localStorage，空态齐备（js/app.js:5610） |
| #/settings | 完整 | PATCH /auth/me 真接口；设备列表有三态（js/app.js:3387-3394） |
| #/vip、#/vip/pay/:plan、#/vip/center | 部分 | 页面完整，支付为模拟（js/membership.js:533-534、690、1014） |
| #/upload/:id | 缺失 | 提交无接口（F4） |
| #/claim/:id | 部分 | 调真接口 API.claim（js/app.js:6907），但页面自述自动核验未开放（js/app.js:2884），服务端预期 501 |
| #/publish | 完整 | 真落库且失败诚实、保草稿（js/app.js:7410-7447） |
| #/profile | 完整 | updateMe 真接口（js/app.js:3246） |
| #/policy | 完整 | 静态页 148 行 |
| #/oauth | 部分 | 演示态按钮（js/app.js:3312-3326），回跳由 settleOauthReturn 真处理（js/app.js:5763-5810） |
| #/verify | 缺失 | 路由重定向到 settings（js/app.js:5871），页面成死代码 |
| #/welcome | 完整 | 引导流程 64 行 + onboarding.css |
| #/login | 完整 | /auth/login、/auth/register 真接口 |
| #/admin/sponsors | 部分 | membership-admin.js 1273 行，含 401/403 门卡（js/membership-admin.js:45、875），但下游支付是模拟 |
| #/market | 部分 | 渲染器 178 行，插件表空 → 空列表 |
| #/forum | 部分 | 渲染器 409 行，版块表空 → 展示演示版块（F8） |

其他缺失：无 404/错误边界（F9）；页脚三处死链（F10）；通知/关注/收藏无后端（F2）。

## 三、改进建议（按投入产出排序）

1. 给 render 的 pageHTML 调用套 try/catch 并渲染错误卡片，先止住 F1 的白屏。
2. 把 js/api.js:339 的 plugins 覆盖改为与 categories 同款 length 保护，空表时保留静态插件表。
3. 上传版本的 upsubmit 接一个真实 POST（或明确置灰并写「暂未开放」），别让流程走完却无记录。
4. 把 6 秒离线条改成常驻顶栏角标（离线时不可关闭），让真假数据可辨。
5. 把楼层回复、空间留言、关注、收藏四条链路接上已有的 posts/comments 风格接口，优先「楼层回复」（社群闭环核心）。
6. 私信在无后端前改为只读占位（不自动回复），避免 F3 的信任损失。
7. feed 接 cursor 分页：把 js/api.js:191 的 limit 30 改成首屏 20 + 底部「加载更多」按钮。
8. 移动端 tabbar 补第 6 项（或把排行/赞助并入「我的」弹层一级），补齐 7 项主航的可达性。
9. 清掉 verifyPage 死代码与页脚三条 javascript:; 死链，减少「未完工」观感。

## 四、未覆盖与不确定项

- server/ 未读，所有「服务端无对应接口」的结论基于客户端 js/api.js 的 16 个方法与线上接口探测，未逐条核对服务端路由表（未验证：是否存在前端未用的现成接口）。
- F1 的线上白屏仅有静态链路 + 无头 dump（仅见 boot-skel）支撑，未排除 headless 虚拟时间预算造成的假阴性（未验证：真实浏览器是否 100% 复现）。
- 设备列表、头像上传、二创发布的服务端落地情况未逐一实测（未验证）。
- 空态只抽样 settings/favs/admin，其余页面未逐页核（未验证）。
- 可访问性只看 enhanceA11y 与 skip-link，未做读屏实测（未验证）。
