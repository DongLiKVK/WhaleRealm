# 鲸域（whalerealm.top）功能完备性 · 用户操作流程顺畅度

走查对象：`js/auth.js`、`js/api.js`、`js/app.js`、`js/membership.js`、`server/src/routes/*`、`docs/登录与第三方授权.md`、`docs/membership-contract.md`；线上 `https://whalerealm.top` 仅做只读 GET。

## 一、核心发现

| 编号 | 问题 | 严重级别 | 证据 | 影响 |
| --- | --- | --- | --- | --- |
| F1 | 私信是纯前端模拟，后端历史接口线上 404 | 高 | js/app.js:4819-4833（「数据只有一份真源 S.dm」）、:5257-5282；https://whalerealm.top/api/messages/1 | 真实用户无法私信：server/src/index.js:161 注释写「拆成两个注册」，实际只在 :162 注册一次且无 /api 前缀，线上 /api/messages/* 恒 404 |
| F2 | 消息中心对真实账号恒为空，互动通知后端不存在 | 高 | js/app.js:679 `if (isSrvUid(ME())) return [];` | 点赞/评论/回复无任何通知，用户感知不到互动 |
| F3 | 插件认领对非作者恒 501，授权/上传/下架无接口 | 高 | server/src/routes/forums.js:201-204；js/app.js:6967、:6927-6943 | 插件治理链路（D）在认领这一步就断，后续全是本地 toast |
| F4 | 线上条目库与版块表为空 | 高 | https://whalerealm.top/api/plugins、https://whalerealm.top/api/forums 均 `items:[]` | 认领/上传/社群发帖没有可作用对象，前端靠静态 DATA 兜底 |
| F5 | 发帖无审核状态，`posts` 表无 status 字段 | 中 | server/src/schema.sql:72-83；server/src/routes/posts.js:55-68 | 「审核中」只是本地假象，内容发布即上流 |
| F6 | 会员支付无回调/对账，只能后台人工补单 | 高 | server/src/routes/membership.js:90-95、:981-996；server/src/routes/admin-membership.js:288 | 付完钱订单仍待支付，权益不自动生效 |
| F7 | 会员权益无服务端闸门 | 中 | server/src/routes/upload.js:224、:301（无按档额度）；membership.js:664 | 「50 张/日原图」「私有仓库」只存在于文案 |
| F8 | 设置页无隐私可见性分区 | 中 | js/app.js:3364-3366（仅账号/外观/通知/关于）、:3486 自述资料只在本机 | 任务预期的「隐私可见性」在设置页不存在 |
| F9 | 用户改密与找回密码前后端均未实现 | 高 | server/src/routes/auth.js（352 行仅注册/登录/登出/me/sessions/revoke）；js/auth.js:168-196 | 密码丢失无法自助找回；OAuth 用户 `password_hash=''` 且无设密入口 |
| F10 | 收藏只写 localStorage | 中 | js/app.js:7207-7230、:7234；js/api.js 无 fav 方法 | 换设备/清缓存即丢收藏 |
| F11 | 新部署默认无可用支付通道 | 高 | deploy/overseas/env.example:40、:51、:55；js/membership.js:229-231 | `AFDIAN_URL` 与 `PAY_MANUAL_QR` 都空时会员页直接「通道关闭」，下单 400 NO_CHANNEL |
| F12 | `#/publish` 实为「发布插件」页；登录页文案与多端会话矛盾 | 低 | js/app.js:4642；js/app.js:3271-3272 对比 server/src/routes/auth.js:237-262 | 入口命名误导，文案与实现不一致 |

## 二、缺失/半成品功能清单

### 2.1 八条主流程状态

| 流程 | 状态 | 断点证据 |
| --- | --- | --- |
| A 注册→验证→`#/welcome`→信息流 | 通（手机闸门已下线） | js/auth.js:168-185；docs/登录与第三方授权.md:3；js/app.js:3182-3189、:3227-3255 |
| B 登录/第三方/顶号 409/刷新/登出 | 通 | server/src/routes/auth.js:133-217、:221-231；js/app.js:3135、:6362-6378 |
| C 发帖→审核→评论/点赞/收藏 | 断在「审核」与「收藏」 | 发帖通 js/app.js:7422-7431、posts.js:71-149；审核无字段 schema.sql:72-83；收藏本地 js/app.js:7207-7230 |
| D 认领→授权→上传→下架 | 断在认领（非作者恒 501） | forums.js:201-204；上传伪造包信息 js/app.js:6944-6954；无上传/下架接口 |
| E 私信→会话列表→未读 | 未实现（前端本地 + 后端不可达） | js/app.js:4833、:4895、:5052、:5257-5282；https://whalerealm.top/api/messages/1 |
| F 空间→编辑资料→设置隐私 | 断在「设置隐私」 | 资料保存真接口 js/app.js:3246；无隐私分区 js/app.js:3364-3366；相册/留言本地 :7629-7635、:7452-7458 |
| G 会员→套餐→支付→回调→权益 | 断在「回调」 | js/membership.js:642-668、:981-996；无 webhook；人工补单 admin-membership.js:288 |
| H 找回密码/改密/会话管理 | 会话管理通，改密与找回密码未实现 | js/auth.js:212-226；server/src/routes/auth.js 无 password 路由 |

### 2.2 缺失与半成品

- **通知系统**：真实账号消息中心恒空（js/app.js:679），无 notifications 表与接口。
- **收藏**：无表、无接口，纯本地（js/app.js:5599、:7207）。
- **插件治理**：认领只有 `claimed` 布尔（forums.js:190-214），上传/审核/下架/撤回均无服务端实现（js/app.js:6967、:6927-6943）。
- **支付闭环**：只有爱发电外链 + 用户自助登记 + 管理员补单（membership.js:642-668、:981-996），无回调、无对账。
- **会员权益**：benefitKeys 只用于渲染（js/membership.js:426-435），服务端无 quota/权限校验。
- **账号安全**：改密、找回密码、OAuth 设密、邮箱验证全部缺失。
- **审核**：仅「作品评论」有本地 pending 假审核（js/app.js:2019-2118），动态与插件无审核态。

## 三、改进建议（按投入产出排序）

1. 把 `server/src/routes/chat.js` 挂到 `/api` 前缀，并在 `js/api.js` 补 dm/会话/未读方法，先让 F1 的后端真正被调用。
2. 建 `notifications` 表并在点赞/评论/回复处写入，替换 js/app.js:679 的恒空分支。
3. 给 `posts` 加 `status` 字段并在 feed 过滤，让「审核中」成为真状态而非本地标签。
4. 收藏改为 `/api/favorites` 增删查，前端 favAdd/favRemove 换成接口调用。
5. 支付侧接爱发电回调或加「订单号对账」接口，把 admin-membership.js:288 的人工补单变成兜底。
6. 补 `POST /api/auth/password`（改密）与重置令牌表 + 邮件通道，打通 H。
7. 设置页加「隐私」分区，落库资料可见性（当前仅会员匿名开关 membership.js:896）。
8. 统一 `#/publish` 命名与登录页多端文案（js/app.js:4642、:3271-3272）。

## 四、未覆盖与不确定项

- 未注册真实账号，登录后的写操作（发帖/评论/认领/下单）未在线上端到端实跑；「通」的判断来自源码路径与接口存在性（未验证）。
- 爱发电是否提供可对接的 webhook 未查证（未验证）。
- `/api/plugins`、`/api/forums` 返回空也可能是线上库未播种，未直连数据库确认（未验证）。
- 未走查 /admin/ 后台、作品评论、社群发主题、`js/rank.js`/`js/tags.js`/`js/plugin-page.js`。
- 线上部署产物与仓库源码是否一致未比对（未拉取服务器文件）。
