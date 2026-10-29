# 鲸域（whalerealm.top）后端功能完备性评估（功能视角）

范围：`server/src/**` 全量只读（index.js、routes/*、db.js、auth.js、http.js、lib/、schema*.sql、db-guards.sql、admin-*.js），线上仅做只读 GET（2026-10-25）。不含渗透测试；安全面另见 01/02 报告。

## 一、核心发现

| 编号 | 问题 | 严重级别 | 证据 | 影响 |
|---|---|---|---|---|
| B1 | 审核状态机后台齐全、公开端零过滤：`posts.status` 由迁移补列，后台有 published/pending/rejected/hidden 五态与批量审，但公开读接口完全不看 status | 高 | server/src/admin-db.js:106-131、server/src/routes/admin-posts.js:319-350；server/src/routes/posts.js:55-68、:152-158、:205-220（全文无 status 条件） | 后台「驳回 / 隐藏 / 下架」对用户侧不生效，违规内容依旧在流里；审核功能等于装饰 |
| B2 | 线上版块表与插件表为空，发主题必然失败 | 高 | https://whalerealm.top/api/forums → `items:[]`；https://whalerealm.top/api/plugins → `items:[]`；js/api.js:340（空数组不覆盖，保留 14 个演示 slug）、js/app.js:7489；server/src/routes/forums.js:75-77 | 社群与插件库两个主入口无真实数据；下拉里选任何演示版块发帖都命中 FORUM_NOT_FOUND。根因见 server/scripts/seed.js:14 的「posts 非空即整体跳过」+ sync-seed.js:1-20 自述未执行 |
| B3 | 三处冗余计数不在事务内，且删父评论会连带删子回复而只减 1 | 中 | server/src/routes/posts.js:250-251、server/src/routes/comments.js:63-64、server/src/routes/forums.js:95-100；server/src/schema.sql:104（parent_id ON DELETE CASCADE）；db-guards.sql 无计数触发器 | 断连/异常即漂移；删一条带 N 条回复的评论，posts.comments 只减 1，计数只增不减地偏高，列表数字长期不可信 |
| B4 | 会员席位可超卖，权益档位无服务端闸门 | 中 | server/src/routes/membership.js:748-754（先查 seats）与 :777（后插入）非同一事务；:448-529 GRANT_TXN 全程不校验 seats；:115-121 权益仅 :664 下发；server/src/routes/upload.js:224、:301 无按档额度 | 并发下单可超出 20 席；「50 张原图 / 私有仓库 / 优先响应」等付费承诺没有任何服务端约束，属于纯文案 |
| B5 | 后台权限双轨：会员后台只判 isAdmin，其余后台走角色权限 | 中 | server/src/routes/admin-membership.js:29-36（requireAuth + level>=15 或 badge 版主）；对比 admin-posts.js:171、admin-users.js:111、admin-rewards.js:184 的 requirePermission(...) | 任何「版主」都能改价、退款、发放会员，绕过 18 项权限矩阵；审计口径不一致 |
| B6 | 积分只进不出且用户不可见 | 中 | server/src/admin-db.js:114（points 靠 ALTER 补列）、admin-rewards.js:42-57、:300-345（发放事务完整）；server/src/db.js:247-263（publicUser 不含 points）、server/src/auth.js:473-483（userView 只补手机字段） | 奖励发放是黑箱：用户查不到余额，也没有任何消费/兑换入口，积分体系闭环缺失 |
| B7 | 删除与主题回复只写本机，后端删除接口闲置 | 高 | js/app.js:2093-2101（删评论仅过滤本地数组 + saveState）、js/app.js:7465-7473（楼层回复只 push S.newFloors）；server/src/routes/posts.js:161、comments.js:53 无前端调用 | 用户以为删掉了，刷新即回来、他人始终可见；回复不落库，换设备丢失，「有人回我」的社群闭环不成立 |
| B8 | 主题详情页楼层是固定演示数据 | 高 | js/app.js:3770-3779（非 t1 主题恒返回 4 条写死楼层）、js/app.js:4066（取不到就回落 threads[0]）；server/src/routes/forums.js 仅 11/28/70/131/196，无详情/回复/点赞/浏览接口 | 任何真实主题点进去都是同一段 u3/u5/u7 对话；深链失效时静默显示别的主题而非 404 |
| B9 | 分页与上限缺口 | 中 | server/src/routes/posts.js:55-68（排序 pinned DESC 但游标取 created_at，置顶老帖会跳过区间）、forums.js:28-63（无 offset，body 全量）、:131-188（plugins 全表无 LIMIT）、posts.js:205-220（评论全量） | 内容一多就漏帖、单次响应膨胀；社区冷启动后首页会跳条 |
| B10 | WS 服务实现完整但零客户端，且鉴权与未读不完整 | 中 | server/src/routes/chat.js:52-135（hello/心跳/typing/broadcast 齐备）；全站 `new WebSocket` 计数为 0；:66 只验 JWT + 查 users，不校验 sessions 行与 status；schema.sql:167 read_at 从未被写；chat.js:138-159 只有最近 N 条 | 实时能力白写；已撤销/已禁用会话仍可连；私信无未读、无会话列表，能力只剩「拉最近 200 条」 |
| B11 | 缺失密码找回与邮箱验证 | 高 | server/src/routes/auth.js 仅 8 条路由（:87/:133/:221/:229/:237/:246/:274/:341），无 reset/forgot；server/package.json 无任何邮件依赖 | 忘记密码的账号等于永久失联；OAuth 用户 password_hash 为空时也没有设密入口 |
| B12 | 上传无配额、无清理 | 低 | server/src/routes/upload.js:301（/upload/local 无限流）、:358（仅 mkdirSync，无 unlink/配额）；删帖不删文件 | 磁盘随发帖单调增长，长期运行要人工清盘 |
| B13 | 死接口与闲置接口 | 低 | server/src/routes/auth.js:341-348（/switch 恒 409，js/auth.js:228-234 还在本地伪造同一错误）；comments.js:36、chat.js:138、phone.js:257 均无前端调用 | 维护噪音，容易误判为「功能已上线」 |
| B14 | 错误码对齐反而是做得最好的一块（正向基线） | 低 | server/src/http.js:11-83 与 js/auth.js:31-48 逐条对应；http.js:89-93 fail() 必带 message；js/membership.js:970-972 直接展示 err.message | 401/403/409/429 语义清晰，前端能给出中文原因；后续补接口建议沿用这套 |

## 二、缺失/半成品功能清单

- **后端完全没有实现**：关注/粉丝、收藏、通知中心（点赞/评论提醒）、未读数与会话列表、主题回复/主题点赞/浏览数自增、帖子举报、密码找回、邮箱验证、积分查询与消费、上传配额与清理、插件认领的仓库校验（server/src/routes/forums.js:202 对非作者恒 501）。
- **后端有、前端无入口（闲置）**：GET /comments/mine（comments.js:36）、GET /messages/:uid（chat.js:138）、GET /ws（chat.js:52）、POST /auth/switch（auth.js:341）、GET /posts/:id（posts.js:152）、DELETE /posts/:id（161）、DELETE /comments/:id（comments.js:53）、GET /comments/:id/replies（14）。
- **前端有、后端无对应**：主题楼层回复、楼层点赞、空间留言、关注、私信（均 localStorage，详见 01/02 报告）。
- **半成品**：插件认领（恒 501）、会员席位（可超卖）、审核状态（后台有前台不生效）、read_at（列存在但从不写入）、主题配图（threads 表无 images 列，js/app.js:7513 注释自述只在本机展示）。

## 三、改进建议（按投入产出排序）

1. 公开读接口补一行 `AND status = 'published'`（feed/详情/评论），让后台审核立刻生效。
2. 执行一次 sync-seed.js，并把 seed.js:14 的幂等判断改成按 slug/email upsert。
3. 把 posts.js:250、comments.js:63、forums.js:95 三处计数用 db.transaction 包起来。
4. 会员下单把席位检查与插入并入同一事务，GRANT_TXN 内再校验一次 seats。
5. admin-membership 改用 requirePermission('member.*')，与其余后台统一权限模型。
6. 前端删除/回复改调已有的 4 个闲置接口，后端零改动即可消灭「假删除」。
7. /ws 建连时校验 sessions 行与 users.status，并补 read_at 写入与未读接口。
8. /plugins 加 limit/offset、threads 加 cursor，feed 游标改为 (pinned, created_at) 复合键。
9. 上传按用户加日配额，并加一个孤儿文件清理脚本。
10. 补密码找回（邮件或管理员重置入口），否则账号一旦忘密即失联。

## 四、未覆盖与不确定项

- 未验证：线上库真实行数与 posts.status 是否存在（只读 HTTP 无法直连 SQLite，仅能从 admin-db.js:106-131 的自动 ALTER 推断）。
- 未验证：后台权限矩阵未逐项点击验证，B5 结论基于静态读码。
- 未验证：并发写压力下 SQLite 写锁与 busy_timeout=5000（db.js:21-49）的真实表现，未做压测。
- 未覆盖：COS 未启用（healthz 返回 cos:false），签名直传链路未端到端验证；短信 provider 仅读到配置层（/api/auth/phone/config → smsEnabled:false）。
- 未覆盖：会员到期惰性回落（membership.js:298-306）在跨天/跨时区边界的行为未实测；admin-logs 与 admin-stats 只做了路由存在性核对，未逐字段验证统计口径。
