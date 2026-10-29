# 鲸域会员赞助系统 · 实现契约（v1）

> 本文件是前端会员页、后台页、服务端三方的**唯一接口来源**。三方并行开发，任何一方不得擅自改字段名；
> 需要新增字段先在 PR/消息里说清，再同时改本文件。

## 0. 文件归属（避免互相覆盖）

| 谁 | 只能改这些文件 |
| --- | --- |
| Lead | `js/membership.js`、`css/membership.css`、`js/app.js`、`index.html`、`docs/会员赞助系统设计.md`（汇总） |
| backend | `server/src/schema-membership.sql`、`server/src/routes/membership.js`、`server/src/routes/admin-membership.js`、`server/src/db.js`、`server/src/index.js`、`server/scripts/seed-membership.js`、`server/.env.example` |
| admin-ui | `js/membership-admin.js`、`css/membership-admin.css` |

不要动别人的文件；不要 git commit；不要改 `js/data.js`、`css/app.css`。

## 1. 等级与定价（权威值，前端展示与种子数据都用这一份）

免费档 `free`：旅人（未赞助）。四个付费档：

| tier | 名称 | 月付(分) | 年付(分) | 年付原价(分) | 月付 duration_days | 年付 duration_days | 席位 | 强调色 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| diamond | 钻石 | 1900 | 18800 | 22800 | 30 | 365 | 不限 | #38bdf8 冰蓝 |
| master | 大师 | 5800 | 56800 | 69600 | 30 | 365 | 不限 | #8b7cf6 星紫 |
| grandmaster | 宗师 | 13800 | 128800 | 165600 | 30 | 365 | 不限 | #f0a63c 琥珀 |
| hunt | 猎杀 | 38800 | 368800 | 465600 | 30 | 365 | 20 | #f2557a 绯红 |

- 金额单位一律 **分（INTEGER）**，展示层自己除 100。
- `seats = 0` 表示不限；`hunt` 的席位 = 20，按「当前 active 的 hunt 订阅数」计算剩余。
- 价格与席位都存在 `member_plans` 表里，后台可改；上表只是初始种子值。
- 年付相对「月付 × 12」的折扣：钻石 17.5%、大师 18.4%、宗师 22.2%、猎杀 20.8%（相当于省 2.1–2.7 个月）。对外一律写「年付省 18%–22%」，**不要写「省 2 个月」或「按 10 个月算」**—— 与真实价格对不上。

### 1.1 权益矩阵（前端权益表 + 会员中心解锁列表共用；后端只在 `/me` 回 `benefitKeys`）

| key | 权益 | 旅人 | 钻石 | 大师 | 宗师 | 猎杀 |
| --- | --- | --- | --- | --- | --- | --- |
| badge | 赞助者徽章与专属配色 | — | ✓ | ✓ | ✓ | ✓ |
| wall | 赞助者墙署名（可匿名） | — | ✓ | ✓ | ✓ | ✓ |
| status | 服务器状态页与故障预告 | — | ✓ | ✓ | ✓ | ✓ |
| download | 高清原图 / 插件包下载额度 | 10/日 | 50/日 | 200/日 | 不限 | 不限 |
| emoji | 专属表情与贴纸包 | — | ✓ | ✓ | ✓ | ✓ |
| boost | 帖子加精 / 首页推荐申请 | — | — | ✓ | ✓ | ✓ |
| private | 私有插件仓库托管 | — | — | — | 3 个 | 10 个 |
| beta | 新功能内测通道 | — | — | — | ✓ | ✓ |
| consult | 1v1 技术咨询 | — | — | — | 1 次/月 | 4 次/月 |
| title | 自定义称号后缀 | — | — | — | — | ✓ |
| thanks | 年度感谢名单 / 服务器铭牌 | — | — | — | ✓ | ✓ |
| priority | 工单优先响应 | — | — | — | — | ✓ |

## 2. 统一响应

所有接口成功一律 `{ ok:true, data:{...} }`；失败 `{ ok:false, error:{ code, message } }`（用 `server/src/http.js` 的 `fail()`）。
时间一律 **Unix 秒**（与现有表一致）；展示用 ISO 或前端格式化的字段另给。

## 3. 数据表（`server/src/schema-membership.sql`，幂等 CREATE IF NOT EXISTS + 索引）

```sql
member_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier TEXT NOT NULL,            -- diamond|master|grandmaster|hunt
  cycle TEXT NOT NULL,           -- month|year
  price_cents INTEGER NOT NULL,
  list_cents INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL,
  seats INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  perks TEXT NOT NULL DEFAULT '[]',  -- JSON 数组，额外卖点字符串
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tier, cycle)
)

member_orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,     -- JY + yyyymmdd + 6 位大写 hex
  user_id INTEGER NOT NULL,
  plan_id INTEGER,
  tier TEXT NOT NULL,
  cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|paid|closed|refunded
  channel TEXT NOT NULL DEFAULT 'wechat', -- wechat|alipay|manual
  provider_txn TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  expires_at INTEGER,                 -- 订单支付截止（created_at + 1800）
  closed_at INTEGER,
  refunded_at INTEGER,
  refund_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  admin_id INTEGER,                   -- 手动补单/退款的操作人
  client_ip TEXT,
  ua TEXT
)

member_subs(
  user_id INTEGER PRIMARY KEY,
  tier TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  order_no TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  show_name INTEGER NOT NULL DEFAULT 1, -- 是否在赞助者墙显示昵称
  note TEXT,
  updated_at INTEGER NOT NULL
)

member_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_no TEXT,
  kind TEXT NOT NULL,                 -- grant|renew|upgrade|refund|manual|plan_change|close
  tier TEXT,
  days INTEGER,
  amount_cents INTEGER,
  actor TEXT NOT NULL DEFAULT 'system', -- system|admin:<id>|user
  note TEXT,
  created_at INTEGER NOT NULL
)

member_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)
-- 初始：monthly_goal_cents=68000, sandbox=1, wall_enabled=1
```

索引：`member_orders(user_id, created_at)`、`member_orders(status, created_at)`、`member_orders(order_no)`、
`member_events(created_at)`、`member_subs(tier, expires_at)`。

`server/src/db.js`：在 `db.exec(schema.sql)` 之后追加读取并执行 `schema-membership.sql`（try/catch + 日志，失败不阻塞启动），
然后调用 `ensureMembershipPlans()`：若 `member_plans` 为空则插入第 1 节的 8 条种子计划（价格/原价/天数/席位/排序）。

## 4. 领域规则

- **订单状态机**：`pending → paid`（支付成功/后台补单）｜`pending → closed`（超时或用户取消）｜`paid → refunded`（全额退款）。
  退款只支持全额，退款后若该订单正是当前订阅来源，则订阅回滚：`expires_at` 减掉该订单授予的天数，不足则删除订阅（回 free）。
- **幂等**：授予只允许从 `pending` 更新为 `paid` 后执行一次（`UPDATE ... WHERE status='pending'`，判断 `changes===1`）；重复回调直接返回当前订单。
- **顺延 / 升级折算**：同一 tier 续费 → `newExpires = max(now, oldExpires) + durationDays`；
  升级 → `creditCents = 剩余天数 × 旧档日单价`，`extraDays = floor(credit / 新档日单价)`，`newExpires = now + durationDays + extraDays`；
  降级 → 拒绝（`DOWNGRADE_NOT_ALLOWED`），文案「高等级到期后自然回落，不支持主动降级」。
- **到期**：不做定时任务；读取时若 `expires_at <= now` 视为 free（并在 `/me` 里回 `expired:true`，可顺手把 `member_subs.tier` 清成 free）。
- **沙箱支付**：`member_settings.sandbox=1` 或 `NODE_ENV!=='production'` 时，`POST /api/membership/orders/:no/simulate` 直接把订单置 paid 并授予；
  生产环境该接口返回 403 `SANDBOX_OFF`。真实渠道未接密钥时，创建订单返回 `pay:{mode:'demo'}`，前端显示「演示占位」。
- **权限**：`requireAuth` 取当前用户；后台用 `requireAuth` + `isAdmin(req.user)`，不是管理员回 403 `FORBIDDEN`。
  用户只能看/操作自己的订单（admin 例外）。
- **隐私**：`/me`、订单里的邮箱对本人打码（`a***@b.com`）；后台可见完整邮箱。赞助者墙只回昵称/头像/等级，不回金额。

## 5. 接口

### 5.1 公开

`GET /api/membership/overview`
```json
{ "tiers":[{ "tier":"diamond","name":"钻石","accent":"#38bdf8","tagline":"…","blurb":"…" }],
  "plans":[{ "id":1,"tier":"diamond","cycle":"month","priceCents":1900,"listCents":22800,"durationDays":30,"seats":0,"perks":[] }],
  "seats":{ "hunt":{ "total":20,"used":3,"left":17 } },
  "stats":{ "goalCents":68000,"raisedCents":41200,"backers":37,"monthLabel":"2026-10","percent":61 },
  "wall":[{ "name":"林深见鹿","tier":"master","avatar":"","since":1760000000,"note":"愿鲸域一直在" }],
  "channels":[{ "id":"wechat","name":"微信支付","hint":"扫码支付" },{ "id":"alipay","name":"支付宝","hint":"扫码支付" }],
  "sandbox": true }
```
`raisedCents` = 本月（自然月）`paid` 订单金额之和 − 本月退款；`backers` = 当前 active 订阅人数；`percent` = round(raised/goal*100)，封顶 100。
`tiers` 里 `tagline`（一句 8–14 字）/ `blurb`（40 字内）由服务端给默认文案，前端可覆盖。

`GET /api/membership/wall` → `{ items:[{name,tier,since,note}] }`（最多 60，按 tier 等级降序 + 时间降序；`show_name=0` 显示「匿名鲸友」）。

### 5.2 登录用户

`GET /api/membership/me` → 
```json
{ "member":{ "tier":"master","name":"大师","active":true,"startedAt":1760000000,"expiresAt":1791000000,
             "daysLeft":42,"orderNo":"JY20261023AB12CD","autoRenew":0,"showName":1,"expired":false },
  "benefitKeys":["badge","wall","status","download","emoji","boost"],
  "pricing":{ "diamond":{ "month":1900,"year":18800 }, "master":{...} },
  "totals":{ "paidCents":136800,"orders":3,"since":1760000000 } }
```
未赞助时 `member.tier='free'`、`name='旅人'`、`active:false`、`expiresAt:0`。

`GET /api/membership/orders?status=all|pending|paid|closed|refunded&limit=20&offset=0`
→ `{ items:[Order], total:number }`

`Order` 形状（前后端共用）：
```json
{ "orderNo":"JY20261023AB12CD","planId":3,"tier":"master","tierName":"大师","cycle":"month",
  "amountCents":5800,"amountText":"58.00","status":"paid","statusText":"已支付","channel":"wechat","channelText":"微信支付",
  "createdAt":1760000000,"paidAt":1760000120,"expiresAt":1760001800,"closedAt":0,"note":"",
  "user":{"id":3,"name":"豆腐","email":"d***@jingyu.local"} }
```

`POST /api/membership/orders` body `{ planId:number, channel:'wechat'|'alipay' }`
→ `{ order:Order, pay:{ "mode":"demo"|"qr"|"redirect","qrText":"","payUrl":"","expiresAt":0,"sandbox":true } }`
错误码：`PLAN_NOT_FOUND` 404、`PLAN_INACTIVE` 409、`SEATS_FULL` 409（猎杀满席）、`DOWNGRADE_NOT_ALLOWED` 409、`BAD_CHANNEL` 400。
重复创建：同一用户同一 plan 只要还有未过期的 pending 订单就直接复用（不新建）。复用窗口 = 支付窗口 `ORDER_TTL=1800s`，不能只看「最近 5 分钟」—— 那会在第 6 分钟开出第二张同档 pending 单，后台对账重复。旧单已过期则先把它收成 closed 再建新单。

`GET /api/membership/orders/:orderNo` → `{ order:Order }`（本人或 admin）
`POST /api/membership/orders/:orderNo/simulate` → `{ order:Order, member:Member }`（沙箱；非本人 403）
`POST /api/membership/orders/:orderNo/close` → `{ order:Order }`
`POST /api/membership/me/visibility` body `{ show:boolean }` → `{ showName:0|1 }`

### 5.3 后台（全部需 admin）

`GET /api/admin/membership/overview?days=30` →
```json
{ "kpi":{ "gmvCents":412000,"refundCents":5800,"netCents":406200,"orders":58,"payingUsers":37,
          "newMembers":21,"renewRate":0.34,"arppuCents":10978,"goalCents":68000,
          "monthNetCents":41200,"goalPercent":61,"pending":4 },
  "series":[{ "date":"2026-10-01","gmvCents":1900,"orders":1 }],
  "tiers":[{ "tier":"diamond","count":18,"netCents":100000 }],
  "channels":[{ "channel":"wechat","count":40,"netCents":300000 }],
  "expiring":[{ "userId":3,"name":"豆腐","tier":"master","expiresAt":1791000000,"daysLeft":7 }],
  "plans":[Plan] }
```

`GET /api/admin/membership/orders?status=&tier=&channel=&q=&from=&to=&limit=50&offset=0` → `{ items:[Order], total, sumCents }`
（`q` 匹配 order_no / 用户邮箱 / 昵称）

`POST /api/admin/membership/orders/:orderNo/mark-paid` body `{ note }` → `{ order, member }`
`POST /api/admin/membership/orders/:orderNo/refund` body `{ note }` → `{ order, member }`
`POST /api/admin/membership/orders/:orderNo/close` body `{ note }` → `{ order }`

`GET /api/admin/membership/plans` → `{ plans:[Plan] }`（含 inactive）
`PUT /api/admin/membership/plans/:id` body 任意子集 `{ priceCents,listCents,durationDays,seats,active,sort }` → `{ plan:Plan }`（写 `plan_change` 事件）

`POST /api/admin/membership/grant` body `{ email?, userId?, tier, days, note? }` → `{ order:Order, member:Member }`
（生成 `channel='manual'`、`amount_cents=0`、直接 paid 的订单）

`GET /api/admin/membership/members?q=&limit=50` → `{ items:[{userId,name,email,tier,name,expiresAt,daysLeft,orderNo,showName}] }`

`GET /api/admin/membership/report.csv?days=90` → `text/csv; charset=utf-8`，带 UTF-8 BOM。
列：`订单号,创建时间,支付时间,用户,邮箱,等级,周期,金额(元),渠道,状态,退款(元),备注`。
文件名 `membership-report-YYYYMMDD.csv`（Content-Disposition）。

## 6. 前端路由与挂载

- 前端模块：`js/membership.js`（Lead）暴露 `window.Member = { html(ctx), mount(), act(el,ctx) }`；
  `js/membership-admin.js`（admin-ui）暴露 `window.MemberAdmin = { html(ctx), mount() }`，两者都必须在 `js/app.js` 之前加载。
- 路由：`#/vip`（落地页，公开）、`#/vip/center`（会员中心）、`#/vip/pay/<orderNo>`（收银台）、`#/admin/sponsors`（后台，需 admin）。
- `ctx = { S, esc }` 与现有 `rankPage()` 一致；模块自己 fetch `/api/...`（用 `fetch` + `credentials:'same-origin'`，成功体取 `json.data`）。
- 后台页对非管理员显示 403 卡片（文案「这里只有管理员能进」+ 返回首页按钮），不白屏。
- 所有金额展示：`¥` + 两位小数（年付整数不显示 .00 也可，但统一两位最稳）。
- 代码风格：ES5（`var`/function），中文注释解释「为什么」，不引入任何依赖，不写内联 onclick（用 `data-act` 委托）。
- 夜间模式：只用 `var(--card)` `var(--txt)` 等令牌，禁止硬编码白底黑字。
- 可访问性：按钮用 `<button type="button">`，表格有 `<caption class="sr-only">`，进度条 `role="progressbar"` + aria-valuenow。

## 7. 验收

- `node --check` 每个新增/修改的 js 文件。
- 后端：`cd server && node -e "require('./src/db')"` 不报错；重启服务后 `curl http://127.0.0.1:3000/api/membership/overview` 有 4 档计划与统计。
- 前端：浏览器 console 无报错；`#/vip`、`#/vip/center`、`#/vip/pay/<no>`、`#/admin/sponsors` 四个页面在日间/夜间、1440px 与 390px 下都不溢出。
- 流程：demo1 登录 → 选大师月付 → 创建订单 → 沙箱支付 → 会员中心显示大师、到期时间 +30 天 → 后台看到该订单与 KPI 变化。
