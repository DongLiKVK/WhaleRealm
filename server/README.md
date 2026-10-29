# 鲸域后端（server）

Fastify + better-sqlite3。启动前先看 ../server/.env.example，复制成 .env 再填值。

---

## 一、需要你（站点主人）提供的资料

下面每一组都是「只有账号持有人能拿到」的凭据。**没填不会报错、不会 500**：对应功能会
自动降级成「按钮置灰 + 点到就回一句可读的原因」，其余功能照常。

### 1. 短信通道（手机号认证）

通道实现集中在 `src/sms/index.js`（v48），只有内置 `crypto` + `fetch`，**没有云 SDK 依赖**。
`SMS_PROVIDER` 四选一；缺项时 `usable()` 为 false，前端照旧显示「短信通道还没接通」并让用户跳过。

| provider | 必需 env | 说明 |
| --- | --- | --- |
| 留空 / `none` | — | 未接通。码只写日志，`/send` 如实回 `delivered:false` |
| `dev` | — | 不发真短信，码回显在响应（`devCode`）与日志。**线上必须换掉** |
| `tencent` | `SMS_SECRET_ID` `SMS_SECRET_KEY` `SMS_SDK_APP_ID` `SMS_SIGN_NAME` `SMS_TEMPLATE_ID` | 走 `SendSms` 2021-01-11，TC3-HMAC-SHA256。模板要有**两个**变量：`{1}` 验证码、`{2}` 有效分钟数 |
| `aliyun` | `SMS_ACCESS_KEY_ID` `SMS_ACCESS_KEY_SECRET` `SMS_SIGN_NAME` `SMS_TEMPLATE_CODE` | 走 dysmsapi RPC 2017-05-25，HMAC-SHA1。模板变量名必须是 `code` |
| `webhook` | `SMS_WEBHOOK_URL`（+ `SMS_WEBHOOK_SECRET` `SMS_WEBHOOK_TOKEN`） | POST JSON `{phone,code,ttl,scene}`，带 `X-SMS-Sign: HMAC-SHA256(rawBody, SECRET)`，2xx 即受理 |

`SMS_REGION` 可选：腾讯云默认 `ap-guangzhou`，阿里云默认 `cn-hangzhou`。

**失败必须回滚**：`phone.js` 的 `/send` 在 `sms.send()` 抛错时先 `DELETE phone_codes` 再回
`502 SMS_FAILED`。留着那条码等于白送 5 次撞码机会，而且「发失败却能验过」没法向用户解释。

> 备案还没下来的联调姿势：`SMS_PROVIDER=dev`（本机）或 `webhook` 指向自建网关（测试环境）。
> 腾讯云/阿里云都提供「测试签名 + 测试模板」，但**只能发给白名单里的号码**，不能当线上通道。

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
| POST | `/api/auth/login` | 10/10min | 登录；同账号**同设备**（`pc`/`mobile`，由 UA 推）已有会话时 409 `ALREADY_ONLINE`（带 `data.canTakeover`、`data.device`、`data.label`），传 `takeover:true` 才顶替那一台 |
| POST | `/api/auth/logout` | — | 删除服务端会话行 + 清 cookie，幂等 |
| GET | `/api/auth/me` | — | 当前用户 + 会话（`phoneMasked`/`phoneVerified` 在这里） |
| POST | `/api/auth/switch` | 30/10min | **恒 409 `AUTH_LOCKED`**，见下 |
| POST | `/api/auth/phone/send` | 5/10min | 发验证码（需登录） |
| POST | `/api/auth/phone/verify` | 10/10min | 校验并绑定（需登录） |
| GET | `/api/auth/phone/state` | — | 绑定状态，号码只回打码值 |
| GET | `/api/auth/phone/config` | — | 通道状态：`{smsEnabled, provider, devMode, ttl, cooldown}`，前端据此决定是否提示「通道没接通」 |
| GET | `/api/auth/oauth/providers` | — | 三家渠道的可用状态 |
| GET | `/api/auth/oauth/:provider/start` | 30/10min | 302 到渠道授权页；未配置 501 `OAUTH_NOT_CONFIGURED` |
| GET | `/api/auth/oauth/:provider/callback` | 60/10min | 回调：换身份 → 绑定或建号 → 开单会话 → 302 回前端 |
| GET | `/api/auth/sessions` | — | 当前账号的会话列表（最多两条：电脑 / 手机），`key` 只是 sid 前 8 位，`current` 标出本请求那条 |
| POST | `/api/auth/sessions/revoke` | — | 退出某台：body `{key}`（`/^[0-9a-f]{8}$/`，只能删自己的；不存在 404 `SESSION_NOT_FOUND`）或 `{others:true}`（除当前之外全部） |

### 为什么 `/switch` 永远失败

`POST /api/auth/switch` 这个端点存在的唯一目的，是让「换号」在协议层没有成功分支：
前端如果哪天误调用，拿到的一定是 `409 AUTH_LOCKED`，而不是一个悄悄换了身份的会话。
配合 `register`/`login` 在已登录时的 `409 ALREADY_AUTHED`，换账号的唯一路径只剩「先退出登录」。

### 手机 / 电脑各一条会话是怎么保证的（v46）

1. 每次签发都走 `createSession()`：一个事务里「先删该 user **该 device** 的旧行、再插新行」，
   配合非唯一索引 `sessions(user_id, device)`，任一时刻每账号的每个设备桶至多一行。
   `device` 只有 `pc` / `mobile` 两个字面量：`deviceOf(ua)` 命中
   `/Android|iPhone|iPod|iPad|Windows Phone|HarmonyOS|Mobile|Tablet/i` 就是 `mobile`，其余（含空 UA）一律 `pc`。
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

# 同一账号在同一台设备上第二次登录：应 409 ALREADY_ONLINE（手机 + 电脑可以同时在线）
curl -i -H 'content-type: application/json' \
  -d '{"email":"a@test.com","password":"password123"}' \
  http://127.0.0.1:3000/api/auth/login

# 换一台设备登录：带上手机 UA，应 200
curl -i -H 'content-type: application/json' \
  -H 'user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' \
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
