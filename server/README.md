# 鲸域后端（server）

Fastify + better-sqlite3。启动前先看 ../server/.env.example，复制成 .env 再填值。

---

## 一、需要你（站点主人）提供的资料

下面每一组都是「只有账号持有人能拿到」的凭据。**没填不会报错、不会 500**：对应功能会
自动降级成「按钮置灰 + 点到就回一句可读的原因」，其余功能照常。

### 1. 短信通道（手机号认证）

| 变量 | 说明 |
| --- | --- |
| `SMS_PROVIDER` | `aliyun` 或 `tencent`（当前骨架只读不校验，接通道时用） |
| `SMS_ACCESS_KEY_ID` / `SMS_ACCESS_KEY_SECRET` | 阿里云或腾讯云的 AccessKey（**不要用主账号 AK，建一个只授权短信的子账号**） |
| `SMS_SIGN_NAME` | 短信签名，例如「鲸域社区」，需在服务商后台审核通过 |
| `SMS_TEMPLATE_CODE` | 验证码模板编号，模板内容里必须含 `${code}` 变量，例如「您的验证码是 ${code}，5 分钟内有效」 |
| `SMS_DEV` | 本地联调时设 `1`：`POST /api/auth/phone/send` 会在响应里回显 `devCode`。**线上必须是 0 或留空** |

> 接通道的位置在 `src/routes/phone.js` 的 `POST /send` 里，已用 `>>> 接真实短信通道就在这里 <<<` 标出；
> 发送失败要回滚那次插入并返回 500，不要把「没发出去」当成「已发送」。

### 2. QQ 互联（第三方登录）

去 <https://connect.qq.com> 创建「网站应用」，拿到：

| 变量 | 说明 |
| --- | --- |
| `OAUTH_QQ_CLIENT_ID` | AppID |
| `OAUTH_QQ_CLIENT_SECRET` | AppKey |
| `OAUTH_QQ_CALLBACK` | 可选。回调地址整串覆盖，默认 `${SITE_ORIGIN}/api/auth/oauth/qq/callback` |

**必须去 QQ 互联后台把同一个回调地址登记进「回调地址」白名单**，否则授权页会直接拒绝。
审核通过前按钮一直是灰的（`enabled:false`）。

### 3. 微信开放平台（第三方登录）

去 <https://open.weixin.qq.com> 创建「网站应用」，拿到：

| 变量 | 说明 |
| --- | --- |
| `OAUTH_WECHAT_CLIENT_ID` | AppID |
| `OAUTH_WECHAT_CLIENT_SECRET` | AppSecret |
| `OAUTH_WECHAT_CALLBACK` | 可选。默认 `${SITE_ORIGIN}/api/auth/oauth/wechat/callback` |

**「授权回调域」只填域名**（例如 `jingyu.example.com`），不带协议、不带路径 —— 这是微信的硬性规定，
填错会在扫码后报 `redirect_uri 参数错误`。

### 4. GitHub OAuth App（第三方登录）

去 <https://github.com/settings/developers> → New OAuth App，拿到：

| 变量 | 说明 |
| --- | --- |
| `OAUTH_GITHUB_CLIENT_ID` | Client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | Client Secret |
| `OAUTH_GITHUB_CALLBACK` | 可选。默认 `${SITE_ORIGIN}/api/auth/oauth/github/callback` |

Authorization callback URL 必须与上面一致（GitHub 允许一个，改了就失效）。

---

## 二、认证相关的接口一览

所有响应统一 `{ ok:true, data } ` / `{ ok:false, error:{ code, message } }`，`message` 与前端
`js/auth.js` 的 `MSG` 表逐字对齐（唯一来源是 `src/http.js`，改文案只改那里）。

| 方法 | 路径 | 限流 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 5/10min | 注册并自动登录；已登录调用 409 `ALREADY_AUTHED` |
| POST | `/api/auth/login` | 10/10min | 登录；同账号已有会话时 409 `ALREADY_ONLINE`（带 `data.canTakeover`），传 `takeover:true` 才顶替 |
| POST | `/api/auth/logout` | — | 删除服务端会话行 + 清 cookie，幂等 |
| GET | `/api/auth/me` | — | 当前用户 + 会话（`phoneMasked`/`phoneVerified` 在这里） |
| POST | `/api/auth/switch` | 30/10min | **恒 409 `AUTH_LOCKED`**，见下 |
| POST | `/api/auth/phone/send` | 5/10min | 发验证码（需登录） |
| POST | `/api/auth/phone/verify` | 10/10min | 校验并绑定（需登录） |
| GET | `/api/auth/phone/state` | — | 绑定状态，号码只回打码值 |
| GET | `/api/auth/oauth/providers` | — | 三家渠道的可用状态 |
| GET | `/api/auth/oauth/:provider/start` | 30/10min | 302 到渠道授权页；未配置 501 `OAUTH_NOT_CONFIGURED` |
| GET | `/api/auth/oauth/:provider/callback` | 60/10min | 回调：换身份 → 绑定或建号 → 开单会话 → 302 回前端 |

### 为什么 `/switch` 永远失败

`POST /api/auth/switch` 这个端点存在的唯一目的，是让「换号」在协议层没有成功分支：
前端如果哪天误调用，拿到的一定是 `409 AUTH_LOCKED`，而不是一个悄悄换了身份的会话。
配合 `register`/`login` 在已登录时的 `409 ALREADY_AUTHED`，换账号的唯一路径只剩「先退出登录」。

### 单账号单会话是怎么保证的

1. 每次签发都走 `createSession()`：一个事务里「先删该 user 的旧行、再插新行」，
   配合 `sessions(user_id)` 唯一索引，任一时刻每账号至多一行。
2. JWT payload 里带 `sid`，每个受保护请求都回表校验「行还在 / 没过期 / `token_hash` 对得上」。
   删掉那一行 token 立刻作废 —— 前端改 localStorage、改 cookie 都绕不过服务端。

---

## 三、本地怎么验

本机没有 `node_modules` 时只能做语法检查：

```bash
node --check src/index.js
node --check src/auth.js
node --check src/http.js
node --check src/routes/auth.js
node --check src/routes/phone.js
node --check src/routes/oauth.js
```

`schema.sql` 是 SQL，不参与 `node --check`；它由 `src/db.js` 启动时整段 `db.exec` 执行，
所以里面每一条语句都必须能重复执行（全部是 `IF NOT EXISTS`）。带 `try/catch` 兜底的
索引（如 `phone_codes(phone,user_id)` 唯一）刻意放在业务模块里，不放这里 —— 见
`src/routes/phone.js` 顶部注释。

跑起来之后（服务器上）：

```bash
# 注册（拿到 cookie 后带上它做后续请求）
curl -i -c /tmp/jy.txt -H 'content-type: application/json' \
  -d '{"email":"a@test.com","password":"password123","name":"甲"}' \
  http://127.0.0.1:3000/api/auth/register

# 同一账号第二次登录：应 409 ALREADY_ONLINE
curl -i -H 'content-type: application/json' \
  -d '{"email":"a@test.com","password":"password123"}' \
  http://127.0.0.1:3000/api/auth/login

# 换号：应 409 AUTH_LOCKED
curl -i -b /tmp/jy.txt -H 'content-type: application/json' -d '{"uid":2}' \
  http://127.0.0.1:3000/api/auth/switch

# 发验证码（SMS_DEV=1 时能直接看到 devCode）
curl -s -b /tmp/jy.txt -H 'content-type: application/json' -d '{"phone":"13800138000"}' \
  http://127.0.0.1:3000/api/auth/phone/send

# 渠道状态：未配置时 enabled 全 false
curl -s http://127.0.0.1:3000/api/auth/oauth/providers
```
