# 鲸域 · 独立后台管理系统 API 契约（v1.1）

> 本文件是后台前后端并行开发的唯一接口约定。后端实现 `/api/admin/*`（不含既有的
> `/api/admin/membership`，那属于会员赞助模块，保持不动），前端实现 `admin/` 单页应用。
> 任何一侧要改字段，必须先改本文件并通知对方。
>
> v1.1 增补 TOTP 两步验证（第 1.1 节）、恢复码重生成 `POST /auth/2fa/recovery-codes` 与 `POST /admins/:id/reset-2fa`。登录接口的返回
> 形状因此从「只有会话」变成「会话或挑战」两种，旧前端必须按 `data.twoFactorRequired` 分支。

## 0. 通用约定

- 前缀：`/api/admin`，JSON 请求/响应，编码 UTF-8。
- 成功：`{ "ok": true, "data": <payload> }`
- 失败：`{ "ok": false, "error": { "code": "<CODE>", "message": "中文提示" } }` + 对应 HTTP 状态。
- 字段一律 **camelCase**；时间一律 **Unix 秒**（整数）；金额/数量一律整数。
- 分页：`page`（1 起）、`pageSize`（默认 20，上限 100）；返回 `{ items, total, page, pageSize }`。
- 空字符串参数视为未传；非法参数返回 400 `BAD_REQUEST`，不要 500。
- 后端必须用 `better-sqlite3` 参数绑定，禁止拼接用户输入进 SQL；`LIKE` 查询需转义 `% _ \`。
- 所有写操作（POST/PATCH/PUT/DELETE）必须落一条操作日志，**日志写入失败不能吞掉业务结果**，
  但要在服务端 console.warn 里留痕。

### 错误码

| code | HTTP | 含义 |
|---|---|---|
| NOT_AUTHED | 401 | 未登录 / 会话失效 |
| FORBIDDEN | 403 | 当前角色无此权限 |
| BAD_CREDENTIALS | 401 | 账号或密码不对（登录密码/关闭 2FA 时的密码复核） |
| LOCKED | 423 | 账号锁定（登录/验证码失败过多），data.retryAfter 秒 |
| BAD_2FA | 401 | 两步验证码不对，data.attemptsLeft 为剩余次数 |
| CHALLENGE_INVALID | 401 | 挑战令牌过期/损坏/UA 不符，需重新输账号密码 |
| CODE_REPLAY | 409 | 同一 30 秒窗口的 TOTP 码已被使用 |
| TWO_FA_REQUIRED | 403 | 该账号必须完成两步验证（守卫兜底用） |
| NOT_FOUND | 404 | 目标不存在 |
| BAD_REQUEST | 400 | 参数不合法 |
| CONFLICT | 409 | 状态冲突（如用户名重复、角色仍被占用、已启用 2FA 又调 enable） |
| TOO_MANY | 429 | 频率限制 |
| INTERNAL | 500 | 服务端异常（不泄露堆栈） |

## 1. 认证与会话

- Cookie：`whale_admin_token`，`HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`（8 小时），
  `SITE_ORIGIN` 为 https 时加 `Secure`。前端不读 cookie，只靠 `/me` 判登录态。
- 会话表 `admin_sessions` 每请求回表校验（行在、未过期、token_hash 匹配），删除行即踢下线。
- 会话 JWT payload：`{ aid, sid, scope: 'admin', amr: ['pwd'] | ['pwd','totp'] }`；
  `scope` 必须校验，站点用户 token 不可用于后台。`amr` 记录这次认证实际过了哪些关，
  强制 2FA 的账号只要 `amr` 里没有 `totp`，守卫会删会话并判未登录（提权不继承旧认证强度）。
- 密码 bcryptjs（10 轮）；策略：8~64 位，至少一个字母 + 一个数字。
- 登录失败计数：同一账号连续 5 次失败锁 15 分钟（`admin_accounts.failed_count / locked_until`）；
  同时路由级限流 30 次 / 5 分钟 / IP（账号级锁定才是主要防线，IP 限流只挡批量撞库）。错误提示统一「账号或密码不对」，不区分账号是否存在。
- 登录成功：清零失败计数、更新 `last_login_at / last_login_ip`、写日志 `auth.login`。
- 退出：删会话行 + 清 cookie + 写日志 `auth.logout`。

### 身份对象 admin

```json
{
  "id": 1, "account": "root", "name": "站长", "roleId": 1,
  "roleKey": "owner", "roleName": "超级管理员",
  "permissions": ["dashboard.view", "post.view", "..."],
  "status": "active",
  "totpEnabled": true, "totpConfirmedAt": 1770000000,
  "twoFactorRequired": true,
  "lastLoginAt": 1770000000, "lastLoginIp": "203.0.113.7", "createdAt": 1770000000
}
```

`twoFactorRequired` = 角色是 owner/admin，或本人已启用 2FA。前端据此决定登录第二步
是「扫码绑定」还是「输 6 位码」。

### 端点

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /auth/login | 公开（限流 30/5min/IP） | body `{account,password}` → 会话 `{admin,expiresAt}` 或挑战 `{twoFactorRequired,...}` |
| POST | /auth/2fa/verify | 挑战令牌 | body `{challengeToken,code}` → `{admin,expiresAt,usedRecovery?,recoveryRemaining?}` |
| POST | /auth/2fa/enable | 挑战令牌 | body `{challengeToken,code}` → `{admin,expiresAt,recoveryCodes:[8],recoveryRemaining}` |
| GET | /auth/2fa/status | 登录 | → `{enabled,required,confirmedAt,recoveryRemaining}` |
| POST | /auth/2fa/disable | 登录（非 owner/admin） | body `{password,code}` → `{enabled:false}` |
| POST | /auth/2fa/recovery-codes | 登录（已绑定 2FA） | body `{password,code}` → `{recoveryCodes:[8],recoveryRemaining}`，旧码立即作废 |
| POST | /auth/logout | 登录 | → `{}` |
| GET | /auth/me | 登录 | → `{admin}`，401 时前端显示登录页 |
| POST | /auth/password | 登录 | body `{oldPassword,newPassword}` → `{}`，撤销其它会话 |

## 1.1 两步验证（TOTP）

### 两段登录

1. `POST /auth/login` 校验账号密码。若账号**不需要** 2FA，直接建会话并返回
   `{ok:true,data:{admin,expiresAt}}`。
2. 若需要 2FA，**不下发 admin cookie**，返回 HTTP 200：
   ```json
   {
     "ok": true,
     "data": {
       "twoFactorRequired": true,
       "mode": "enroll",
       "challengeToken": "<JWT>",
       "expiresAt": 1770000600,
       "account": "root",
       "enroll": { "secret": "BASE32", "otpauthUri": "otpauth://...", "qrSvg": "<svg…>" }
     }
   }
   ```
   `mode=verify`（已绑定）时没有 `enroll` 字段，前端只显示 6 位码输入框。
3. 前端用挑战令牌调 `/auth/2fa/enable`（首次绑定）或 `/auth/2fa/verify`（已绑定），
   成功后才拿到会话 cookie。

挑战令牌是短命 JWT：`{aid, scope:'admin_2fa', mode:'enroll'|'verify', ua:<sha256(UA) 前24位>, jti}`，
有效期 **10 分钟**，只认当前浏览器 UA（不绑 IP，手机切网不误伤），不能当会话用。
过期/UA 不符/模式不符统一 `401 CHALLENGE_INVALID`，前端必须退回第一步重新输密码。

### 谁必须开

- `owner`、`admin` 两个内置角色**强制**；首次登录进入 enroll，不绑定就进不了后台。
- `editor`、`staff` 与自定义角色默认不强制；本人启用后，后续登录同样要走 verify。
- 已启用 2FA 的账号被换成非强制角色，仍然要求 verify（因为 `totpEnabled=true`）。

### 验证码与恢复码

- TOTP：RFC 6238，SHA-1 / 6 位 / 30 秒步长，接受 **±1 步**窗口。
- 防重放：每个账号记 `totp_last_step`，成功验证必须使用**严格大于**上次的 step；
  同一窗口第二次提交返回 `409 CODE_REPLAY`。前端提示「等下一个 30 秒」。
- 恢复码：8 个，格式 `XXXX-XXXX`（字母表去掉易混的 I/O/0/1），只在启用成功时明文返回一次；
  库中只存 `sha256`。登录时把恢复码填进同一个输入框即可，响应带
  `usedRecovery:true` 与 `recoveryRemaining`。每个恢复码只能用一次。
- 失败计数：验证码错误与密码错误**共用** `failed_count / locked_until`；
  连续 5 次锁 15 分钟，第 5 次当场回 `423 LOCKED`。未锁时回 `401 BAD_2FA`，
  `data.attemptsLeft` 告诉前端还能试几次。

### 启用 / 关闭 / 重置

- 启用：`/auth/2fa/enable` 校验挑战令牌 + 6 位码，写 `totp_secret / totp_enabled /
  totp_confirmed_at / totp_last_step`，重建 8 个恢复码，**撤销该账号所有旧会话**后
  新建当前会话。响应里的 `recoveryCodes` 只出现这一次。
- 关闭：`/auth/2fa/disable` 要求 `password + 当前验证码` 双确认，并撤销其它设备会话；
  owner/admin 一律 `403`（只能由别的管理员重置）。
- 重生成恢复码：`/auth/2fa/recovery-codes` 同样要求密码 + 当前验证码，删旧码后一次性返回 8 个新码；
  不推进 `totp_last_step`（step-up 不是新建会话）。界面暂未挂入口，可直接调接口。
- 管理员重置：`POST /admins/:id/reset-2fa`（`admin.manage`）。不能重置自己
  （`403`），账号未绑定返回 `409`；清空 secret/恢复码并撤销该账号全部会话，
  写日志 `auth.2fa_reset`。本人丢失验证器只能在服务器上跑
  `node scripts/reset-admin-2fa.js <账号>`。
- 密钥管理：TOTP secret 用 AES-256-GCM 加密落库，密钥来自环境变量 `ADMIN_TOTP_KEY`
  （**必须与 `JWT_SECRET` 不同**，至少 32 字节随机串）。该变量缺失或更换会导致已有
  secret 无法解密，登录返回 500，只能逐个重置 2FA。

### 限流

| 接口 | 限制 |
|---|---|
| POST /auth/login | 30 次 / 5 分钟 / IP |
| POST /auth/2fa/verify | 30 次 / 5 分钟 / IP |
| POST /auth/2fa/enable | 30 次 / 5 分钟 / IP |
| POST /auth/2fa/disable | 20 次 / 5 分钟 / IP |
| POST /auth/2fa/recovery-codes | 20 次 / 5 分钟 / IP |

账号级锁定是主防线，IP 限流只挡批量撞库。

## 2. 权限模型

权限键（catalog，后端 `GET /permissions` 返回同一份，前端不要硬编码中文）：

| key | 名称 | 分组 | 说明 |
|---|---|---|---|
| dashboard.view | 查看工作台 | 工作台 | 概览指标与待办 |
| post.view | 查看帖子 | 内容 | 列表、详情、搜索 |
| post.edit | 编辑帖子 | 内容 | 改正文 / 置顶 |
| post.review | 审核帖子 | 内容 | 通过 / 驳回 / 打回待审 |
| post.delete | 删除帖子 | 内容 | 单条删除、批量删除 |
| user.view | 查看用户 | 用户 | 列表、注册信息、详情 |
| user.edit | 编辑用户 | 用户 | 改等级、徽章 |
| user.status | 禁用/启用用户 | 用户 | 需填写原因 |
| user.delete | 删除用户 | 用户 | 级联删除，二次确认 |
| reward.view | 查看奖励 | 运营 | 发放历史 |
| reward.grant | 发放奖励 | 运营 | 新增一条奖励记录 |
| reward.revoke | 撤回奖励 | 运营 | 撤回并写原因 |
| role.view | 查看角色 | 权限 | 角色与权限矩阵只读 |
| role.manage | 管理角色 | 权限 | 新建/编辑/删除角色 |
| admin.view | 查看管理员 | 权限 | 管理员账号列表 |
| admin.manage | 管理管理员 | 权限 | 建号/改角色/停用/重置密码/删除 |
| log.viewAll | 查看全部日志 | 系统 | 没有此权限时只能看自己的日志 |
| log.export | 导出日志 | 系统 | CSV 导出 |

内置角色（`builtin=1`，key 固定，不可删除；owner 的权限不可编辑）：

| key | 名称 | 权限 |
|---|---|---|
| owner | 超级管理员 | 全部 18 项 |
| admin | 管理员 | 除 role.manage、admin.manage 外全部 |
| editor | 编辑 | dashboard.view, post.view, post.edit, post.review, user.view, reward.view |
| staff | 普通员工 | dashboard.view, post.view, user.view, reward.view |

- `GET /permissions` → `{groups:[{key,label,items:[{key,label,desc}]}]}`，登录即可访问。
- `GET /roles` → `{items:[{id,key,name,description,permissions:[],builtin,memberCount,createdAt}]}`
- `POST /roles`（role.manage）body `{name, description, permissions:[]}` → `{role}`
- `PUT /roles/:id`（role.manage）body 同上（可只传部分）→ `{role}`；owner 角色 403。
- `DELETE /roles/:id`（role.manage）→ `{}`；内置角色、仍有成员的角色返回 409。
- 自定义角色 key 由后端生成 `role_<id>` 或 `custom_<随机6位>`，不允许前端指定。
- 权限写入前必须过滤到 catalog 内，未知 key 丢弃；role 改动后对该角色成员的**下一次请求立即生效**
  （因为每请求按 role_id 回表取权限，不把权限塞进 JWT）。

### 管理员账号

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | /admins?q=&roleId=&status=all\|active\|disabled&page=&pageSize= | admin.view |
| POST | /admins `{account,name,password,roleId}` | admin.manage |
| PATCH | /admins/:id `{name?,roleId?,status?}` | admin.manage |
| POST | /admins/:id/reset-password `{newPassword}` | admin.manage |
| POST | /admins/:id/reset-2fa | admin.manage |
| DELETE | /admins/:id | admin.manage |

item：`{id,account,name,roleId,roleKey,roleName,status,lastLoginAt,lastLoginIp,
totpEnabled,totpConfirmedAt,createdAt}`。
约束：不能改自己的角色/状态；不能禁用或删除最后一个 owner；账号 3~32 位 `[a-zA-Z0-9_.-]`，唯一；
停用/删号/重置密码/重置 2FA 要撤销该账号全部会话。

## 3. 帖子管理

`GET /posts?q=&status=all|published|pending|rejected|hidden&authorId=&from=&to=&sort=new|old|hot&page=&pageSize=`

- `q`：匹配正文或作者昵称/邮箱，去空格，1~80 字符。
- `from/to`：Unix 秒，闭区间；`sort=hot` 按 `likes+comments*2` 降序。
- 返回 `{items, total, page, pageSize, counts:{all,published,pending,rejected,hidden}}`
  （counts 不受分页影响，受除 status 以外的筛选影响）。

item：

```json
{
  "id": 12,
  "userId": 3,
  "author": {"id":3,"name":"鲸友","avatar":"","emoji":"","grad":"","level":6,"badge":"","status":"active"},
  "text": "正文……",
  "images": [{"key":"u/2026/10/a.jpg","url":"https://…","full":"https://…","w":1080,"h":720,"type":"image/jpeg"}],
  "pluginSlug": "", "pluginVer": "",
  "pinned": false,
  "likes": 4, "shares": 0, "comments": 2,
  "status": "published", "reviewNote": "", "reviewedAt": 0, "reviewedBy": 0,
  "createdAt": 1770000000
}
```

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | /posts/:id | post.view | `{post: item, comments:[{id,userId,name,text,likes,createdAt}]}`（评论最多 50 条；`post.comments` 仍是数字计数） |
| PATCH | /posts/:id `{text?, pinned?}` | post.edit | 返回 `{post}`；text 上限 5000 字 |
| POST | /posts/:id/review `{decision:"approve"\|"reject"\|"pending", note?}` | post.review | approve→published，reject→rejected，pending→pending；note 上限 200 |
| DELETE | /posts/:id | post.delete | 连同 post_images / comments / likes 一并删除 |
| POST | /posts/batch `{action:"approve"\|"reject"\|"delete", ids:[1..100], note?}` | 按 action 判 | → `{affected}`，不存在的 id 忽略 |

帖子状态语义：`published` 已发布、`pending` 待审核、`rejected` 已驳回、`hidden` 已下架。
历史数据无该列时默认 `published`（迁移补列）。

## 4. 用户管理

`GET /users?q=&status=all|active|disabled&sort=new|old|level|visits&page=&pageSize=`
→ `{items,total,page,pageSize,counts:{all,active,disabled}}`

item：

```json
{
  "id": 3, "name": "鲸友", "email": "a***@qq.com", "phoneMasked": "138****8000", "phoneVerified": true,
  "avatar": "", "emoji": "🐳", "grad": "",
  "level": 6, "badge": "", "sig": "", "city": "杭州",
  "fans": 12, "follows": 8, "visits": 233,
  "status": "active", "disabledReason": "", "disabledAt": 0,
  "points": 120, "postCount": 9, "createdAt": 1760000000
}
```

> 邮箱在后台列表按 `前2位 + *** + @域名` 打码；详情页才回显完整邮箱（`user.view` 才有权）。
> 手机号任何位置都只回打码值。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | /users/:id | user.view | `{user, posts:[最近10条 {id,text,status,likes,createdAt}], rewards:[最近10条], stats:{posts,comments,likes,rewards,points}}` |
| PATCH | /users/:id `{level?, badge?}` | user.edit | level 1~99 整数；badge ≤ 20 字 |
| POST | /users/:id/status `{status:"active"\|"disabled", reason}` | user.status | 禁用必填原因（≥4 字）；禁用时撤销其站点全部会话 |
| DELETE | /users/:id | user.delete | 级联删除帖子/评论等，返回 `{deleted:{userId,posts,comments}}` |

**禁用必须真的生效**：站点 `auth.currentUser()` 读到 `users.status='disabled'` 时视为未登录，
登录接口返回 `ACCOUNT_DISABLED`「账号已被禁用，如有疑问请联系管理员」。

## 5. 奖励发放

`GET /rewards?q=&type=all|points|days|frame|custom&status=all|active|revoked&adminId=&from=&to=&page=&pageSize=`
→ `{items,total,page,pageSize,summary:{granted,revoked,pointsTotal}}`
`q` 匹配用户昵称/邮箱或发放原因。

`GET /rewards/options?userId=3` → `{tiers, frames, presets, limits, user}`

```json
{
  "tiers": [{"key":"diamond","name":"钻石","accent":"#4aa8ff","priceCents":1900,"defaultDays":30}],
  "frames": [{"key":"auto","name":"跟随档位","short":"跟随档位","level":0}],
  "presets": ["优质内容奖励", "活动奖励"],
  "limits": {"points":1000000,"days":3650},
  "user": {"id":3,"name":"鲸友","tier":"master","tierName":"大师","tierAccent":"#8b7cf6",
           "tierActive":true,"expiresAt":1772000000,"daysLeft":21,
           "frame":"auto","frameLabel":"跟随会员档位","frameFollow":true}
}
```
`userId` 省略时 `user` 为 `null`。`tiers` 来自 `member_plans`（无数据时回落到内置四档）。

item：

```json
{
  "id": 7, "userId": 3, "user": {"id":3,"name":"鲸友","email":"a***@qq.com","avatar":""},
  "type": "points", "typeLabel": "积分", "amount": 100,
  "tier": "", "frame": "", "frameLabel": "", "prevFrame": "",
  "reason": "社区活跃奖励", "note": "",
  "status": "active",
  "grantedBy": {"id":1,"name":"站长"}, "grantedAt": 1770000000,
  "revokedAt": 0, "revokedBy": null, "revokedReason": ""
}
```

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /rewards `{userId,type,amount,tier?,frame?,reason,note?}` | reward.grant / reward.frame | type ∈ points/days/frame/custom；points 的 amount 1~1000000；days 必须带 tier 且 amount 1~3650；frame 必须带 frame（auto/maw-1..4/none）且 amount=0；custom 的 amount 必须 0；reason ≥4 字 ≤200，note ≤200。头像框发放的动作名记为 `reward.frame` |
| POST | /rewards/:id/revoke `{reason}` | reward.revoke | 仅 active 可撤回；reason ≥2 字；points 扣回积分，days 按天回退并在 ≤0 时清档且 `expires_at=0`，frame 还原 `prev_frame` |
| GET | /rewards/options?userId= | reward.view | 档位、头像框、常用原因、上限与用户会员面板 |
| GET | /rewards/export.csv?...同列表筛选 | reward.view | CSV（UTF-8 BOM），文件名 `rewards-YYYYMMDD.csv` |

积分落在 `users.points`（迁移补列，默认 0）；`days` 同时写 `member_subs` 与 `member_events`（`kind='manual'`）；`frame` 只改 `users.frame` 并记 `prev_frame`；`custom` 只记账不改其它表。

## 6. 操作日志

`GET /logs?q=&action=&targetType=&adminId=&result=all|ok|fail&from=&to=&page=&pageSize=`
→ `{items,total,page,pageSize,scope:"all"|"self",actions:[{action,label,count}]}`
- 无 `log.viewAll` 时强制 `scope:"self"` 且只返回自己的日志（忽略传入 adminId）。
- item：`{id,adminId,adminName,roleKey,action,actionLabel,targetType,targetId,summary,result,ip,createdAt}`
- `GET /logs/:id` → item + `detail`（对象，含变更前后关键字段）
- `GET /logs/export.csv?...`（log.export）→ CSV，文件名 `admin-logs-YYYYMMDD.csv`

动作命名（`action` 一律小写点分，前端按 `actionLabel` 显示，不自行翻译）：

`auth.login` / `auth.login_fail` / `auth.logout` / `auth.password` /
`post.edit` / `post.review` / `post.delete` / `post.batch_review` / `post.batch_delete` /
`user.edit` / `user.disable` / `user.enable` / `user.delete` /
`reward.grant` / `reward.revoke` /
`role.create` / `role.update` / `role.delete` /
`admin.create` / `admin.update` / `admin.reset_password` / `admin.delete`

`summary` 是给人看的一句话，例如「驳回帖子 #12：含外链广告」「禁用用户 #3（鲸友）：刷屏」。
`detail` 存 JSON：`{ "before": {...}, "after": {...}, "note": "..." }`，字段按需，别塞正文全文。

## 7. 工作台统计

`GET /stats/overview?days=7|14|30`（dashboard.view）→

```json
{
  "kpis": {"posts":5,"postsToday":2,"pending":3,"users":17,"usersToday":1,
           "rewardsToday":4,"pointsGranted":500,"disabledUsers":1,"admins":4},
  "series": [{"date":"2026-10-18","posts":1,"users":0,"rewards":2}],
  "pendingPreview": [ /* 最多 6 条帖子 item（同 /posts 裁剪版） */ ],
  "recentLogs": [ /* 最多 8 条日志 item */ ],
  "recentRewards": [ /* 最多 5 条奖励 item */ ],
  "actionBars": [{"action":"post.review","label":"审核帖子","count":12}]
}
```

`series` 长度严格等于 `days`，按日期升序，缺失日期补 0；`date` 用服务器本地时区 `YYYY-MM-DD`。

## 8. 前端（admin/）约定

- 纯静态、零依赖、ES Module；入口 `admin/index.html` → `admin/js/boot.js`。
- Hash 路由：`#/dashboard` `#/posts` `#/users` `#/rewards` `#/roles` `#/logs`，未知路由回工作台。
- `api(path, {method, body})`：自动带 `credentials:'same-origin'`、`Content-Type: application/json`；
  401 → 清空登录态显示登录页；403 → 提示「当前角色没有这个操作的权限」并保留页面。
- 未登录只渲染登录页，不请求业务接口（避免控制台一片 401）。
- 所有写操作成功后：局部刷新数据 + toast 成功提示；失败展示后端 `error.message`。
- 删除类操作二次确认；禁用用户必须弹窗填写原因。

## 9. 交付验收（Lead 会跑）

1. `node scripts/seed-admin.js` 幂等，打印一次性账号密码；roles 齐全。
2. `root` 登录 → `/auth/me` 返回 18 项权限；错误密码 5 次后返回 423。
3. `editor` 登录：能审核帖子、不能删帖（403）、不能进角色管理（403）。
4. 帖子列表 status 计数正确；审核通过后 status=published；批量删除后列表减少。
5. 禁用用户后该用户站点 token 立即失效（`/api/auth/me` 401），后台状态列显示「已禁用」。
6. 发放 100 积分后 `users.points` +100，撤回后 -100，两条日志可查。
7. 每个写操作在 `admin_logs` 里都有对应 action；CSV 导出可下载且表头正确。
8. 未登录访问 `/api/admin/posts` 返回 401；站点用户 token 访问返回 401。
