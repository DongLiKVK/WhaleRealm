# 03 · 会员赞助体系 + 后台管理系统 · 功能完备性评估

> 方法：只读源码 + 匿名线上探测（2026-10-25，https://whalerealm.top）。判定标准是「功能是否真的走得通」，不含安全评价。

## 一、核心发现

| 编号 | 问题 | 严重级别 | 证据 | 影响 |
| --- | --- | --- | --- | --- |
| M1 | 赞助后台 `#/admin/sponsors` 全站零入口，只能手敲 URL | 高 | js/ 内 grep `sponsors` 仅 3 处（js/membership.js:3、js/membership-admin.js:2 为注释，js/app.js:5754 生成 hash）；index.html:44,108-111 只有注释与 script 引用；而设计文档承诺「页脚入口，仅 admin 可见」（docs/会员赞助系统设计.md:57） | 会员运营主控制台事实不可达，交接即失传 |
| M2 | 支付只有「外链 + 人工补单」半条闭环：无回调、无签名、无对账 | 高 | server/src/routes/membership.js:65,90-95,387-398；report-paid 仅把付款方写进 note（:855-893）；docs/会员赞助系统设计.md:256 承诺的 `reconcile-membership.js` 在 server/scripts/ 下不存在；线上 `GET /api/membership/overview` 只回 1 个渠道 afdian | 掉单无法自动发现，开通延迟取决于管理员是否在线 |
| M3 | 12 项会员权益只有 badge/wall 由代码交付，其余为人工承诺或依赖不存在的系统 | 高 | 设计文档自述 docs/会员赞助系统设计.md:138；:128 下载额度「现无计数表」、:134 称号「users 表无此字段」、:136「站点无工单系统」；而套餐卖点照旧 server/src/db.js:76,80,84,88 | 付费承诺与站内交付不符，首笔退款即纠纷 |
| M4 | 用户侧没有退款申请入口，但文案承诺 7 天可退 | 高 | js/membership.js:721 文案；会员路由表（server/src/routes/membership.js:583-896）无任何退款端点，写退款只有后台 server/src/routes/admin-membership.js:334 | 承诺无履约路径，只能私下找人 |
| M5 | 会员域不在新后台的 RBAC / 2FA / 操作日志内 | 中 | server/src/auth.js:486-487 `level>=15 || badge==='版主'`；admin-membership.js 全文无 `writeAdminLog`，审计只写 member_events（:377,415,478）；admin-guard.js 动作名无会员动作 | 钱域无法分级授权（设计文档 :330 自认同理），后台「操作日志」页对补单/退款是盲区 |
| M6 | TOTP 后端完整，但自助管理零前端 | 中 | `/2fa/status`(admin-auth.js:520)、`/2fa/disable`(:538)、`/2fa/recovery-codes`(:584) 在 admin/js 无调用者（grep `2fa` 仅 shell.js、page-roles.js）；docs/admin-api.md:139 自述「界面暂未挂入口」 | 换手机或恢复码用完只能找 owner 重置 |
| M7 | `qa/admin-e2e.mjs` 的 97 项全部落在后台域，会员域 0 覆盖 | 中 | grep `membership|vip|member|订单|退款` 在 qa/admin-e2e.mjs、qa/admin-smoke.mjs 均 0 命中；会员验收是 2026-10-23 在旧机 43.142.153.74 的人工清单（docs/会员赞助系统设计.md:812-814） | 钱域改动无回归护栏，当前部署 158.247.215.153 未重跑 |
| M8 | 设计文档给会员后台定的三条「首版对策」均未落地 | 中 | ADMIN_EMAILS 白名单（:334）全仓库 0 命中；note 必填 ≥10 字（:335）实际可选（admin-membership.js:303,342,406 `note || order.note`）；二次确认（:336）只是 window.confirm（js/membership-admin.js:1004,1014,1024） | 财务误操作无护栏，操作无痕迹 |
| M9 | 契约文档与代码双向漂移，照文档验收会误判 | 中 | docs/会员赞助系统设计.md:548 称 MSG 缺 7 条错误码，实际已补齐（server/src/http.js:43-67）；A-3/A-4 已在代码修好（membership.js:762、:745-749）；A-10 额度仍缺（membership.js:664） | 文档不能作为验收依据 |
| M10 | 积分只有账本没有消费端 | 低 | admin-rewards.js:343 改 `users.points`；users.js / auth.js 均不返回 points；js/ 全目录 0 处「积分」 | 发放 100 积分对用户不可见、不可用 |
| M11 | 收银台进度条硬编码 30 分钟 | 低 | js/membership.js:835 用 `left / 1800`，而站外渠道窗口是 3 天（:133-137） | 爱发电单进度条全程 100%，误导用户 |

**先说成立的部分**：后台六页（工作台/帖子/用户/奖励/角色与管理员/日志）前后端齐全，页面按钮按 `can()` 逐项收口（admin/js/page-posts.js:70-72、page-roles.js:314）；18 项权限在服务端逐请求生效（唯一松点 `GET /permissions` 只读目录仅需登录，admin-roles.js:121）；订单状态机 pending→paid→refunded/closed 三边闭合、补单与退款幂等（admin-membership.js:291-300）；TOTP 后端含恢复码、禁用需密码+验证码、owner/admin 强制保留（admin-auth.js:543-545）。缺口集中在会员域与 2FA 自助页。

## 二、缺失/半成品功能清单

- **支付**：爱发电 webhook / 签名校验 / 每日对账（M2）；线上 `GET /api/membership/overview` 只回 afdian 一个渠道——manual 依赖 `PAY_MANUAL_QR`、wechat/alipay 仅在沙箱下 `live:true`（membership.js:90-110），production 沙箱关闭后只剩外链一条路。
- **退款**：用户申请入口与工单（M4）；退款原因字段在 `member_orders.note` 里与补单备注混用，无法区分。
- **权益**：`/me` 缺 `benefitLimits`（A-10）；私有仓库、咨询、内测、称号、工单优先 5 类人工权益没有任何台账字段（rewards.type 白名单仅 points/days/frame/custom，admin-rewards.js:268）。
- **2FA**：安全设置页（M6）；`/2fa/status` 无任何消费方。
- **后台**：会员订单页未并入 admin/ 六页（admin/js 无会员页）；`#/admin/sponsors` 无导航（M1）。
- **提醒**：文案承诺「到期前一周提醒」（js/membership.js:582,721），服务端无定时任务，到期靠读取时惰性回落（membership.js:12）。
- **导出**：会员报表 CSV 12 列无退款时间（admin-membership.js:610，A-13）；`plan_change` 事件 user_id=0（:476-480），与契约「填操作人 id」不符。

## 三、改进建议（按投入产出排序）

1. 在站点侧栏/用户菜单给管理员加一条 `#/admin/sponsors` 链接（一行 href + isAdmin 判断），半天内解决 M1。
2. 会员后台四个写操作改调 `writeAdminLog`，让操作日志页覆盖补单/退款/改价，顺手消除 M5 的审计盲区。
3. 把 `note` 改成必填 ≥10 字、退款确认改为输入订单号后 6 位，兑现设计文档 :335-336 的对策。
4. `/me` 增 `benefitLimits`，并在权益表每行标注「自动 / 人工 48h」，先让承诺与交付对齐（doc:138 的要求）。
5. 会员中心加「申请退款」按钮：只写一条 `member_events(kind='refund_request')` 进后台待办，订单状态仍由管理员推动，复用现有状态机零风险。
6. 在 qa 增补 4 条会员用例（下单→补单→退款→回滚、重复补单幂等），并入 admin-e2e 一起跑。
7. 补一个每日对账脚本：拉爱发电账单与 `member_orders` 按订单号比对，差异写日志并邮件告警。
8. 奖励页加第五种类型「人工权益兑现」（私有仓库/咨询/称号），把 doc:131-136 的人工承诺变成可查台账。

## 四、未覆盖与不确定项

- **未验证**：补单、退款、改价、grant 的线上实际写入——需要一个 `level>=15` 的站点账号，本次没有凭据，只走了代码路径与匿名 401 探测（`/api/admin/membership/overview` → 401）。
- **未验证**：爱发电平台侧是否强制「留言写订单号」，属平台设置，源码不可证。
- **未验证**：158.247.215.153 是否跑过 seed（`demo3@jingyu.local` 天生 level 15，docs/会员赞助系统设计.md:327），以及现网是否存在历史脏单。
- **未测**：四个会员页在 390px / 夜间模式下的实际渲染与 console 报错（无浏览器会话）；e2e 只跑 HTTP，不覆盖后台六页的 UI 交互。
- **不确定**：到期提醒是否在站外（邮件、QQ 群）人工执行，仓库内无证据。
