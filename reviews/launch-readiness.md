# 鲸域 · 上线就绪检查报告（终版 v2）

- 审查对象：`index.html`（68 行）· `css/app.css`（2890 行）· `js/*.js`（7 个模块，约 5100 行）· `server/src`（9 模块 19 路由）· `deploy/`
- 审查方式：全文逐行静态审查 + 三路专项并行核查（功能链路 / 安全 / 浏览器兼容）+ 关键链路逐跳复核
- 结论：**No-Go（不可上线）**。共 **15 项阻塞（P0）**、**18 项强烈建议（P1）**、**18 项可迭代（P2）**

---

## 0. 一句话结论

**这不是「前端写得好不好」的问题——页面质量明显高于同类项目。真正的问题是三条链路没接上：认证没接线、后端写接口大面积缺失、静态资源没有出口。结果是"界面 100% 可用、数据 0% 落库"。**

| 维度 | 表面看到的 | 实际跑的 |
|---|---|---|
| 登录 | 显示"已登录 · 手机已验证" | localStorage 假态，服务端 `sessions` 表永远空 |
| 发布动态 | 提示"发表成功" | 401 或只进内存，刷新即消失 |
| 下载 | "链接签发中…"→ 出现签名 URL | 1 秒定时器 + 硬编码假签名串，从不发请求 |
| 发布插件 | 上传 → 进入审核 | 伪造 sha256 与体积，无任何接口 |
| 私信 | 有"私信"页签 | 点开跳别人空间，全仓无 WebSocket |
| 社群发帖 | 楼层 +1 | 只进本机 localStorage |
| 认领 | "验证通过/失败" | 读静态字段 `p.claimed`，不发请求 |

> 对外承诺（README + 页面文案）与实现之间的差距，是本次审查最严重的发现类别——它比任何一个 XSS 都更容易演变成纠纷。

---

## 1. 三个根因（把 51 条收敛成 3 条）

| 根因 | 说明 | 级联条目 |
|---|---|---|
| **R1 认证接入缺失** | 前端自建 localStorage 账号库，`API.login/register/me` 全仓零调用；服务端 httpOnly 会话从未建立 | A4、B1、B2、C6、P1-8、P2-8、P2-9、P2-10 |
| **R2 后端写接口缺失** | 后端只有读接口（`forums.js` 仅 3 个 GET）；下载、发布版本、认领验证、社群发帖回帖、私信全部无对应端点 | C1–C5、P2-10、P2-11 |
| **R3 静态出口断裂** | nginx 规划静态走 COS+CDN，但仓库无上传步骤；`/uploads` 无 location；API 与页面跨域；`dist` 无处可去 | A5、B3、B4、P1-10、P1-11 |

**推论**：修 51 条不如修 3 条。R1 + R2 修完，能自动消除 15 条；R3 修完再消 5 条。

---

## 2. A 类 · 安全阻塞（上线即被利用，5 项）

| # | 问题 | 严重度 | 证据链 | 修复 |
|---|---|---|---|---|
| **A1** | **存储型 XSS：帖子图片 key 无任何校验 → 灯箱 `src` 是全站唯一未 `esc()` 的用户可控属性** | 🔴 严重 | `server/src/routes/posts.js:74-97` schema 里 `key:{type:'string'}` 无 pattern/maxLength → `:120` 原样入库 → `:31-38` `imageUrl(cos_key,'origin')` → `upload.js:56-65` 直拼 `/uploads/`+key → `js/api.js:148` `full` → `js/app.js:3635` `src: img.full` → `js/app.js:2393` `'<img class="lb-img" src="' + S.lb.src + '"'`（紧邻的 `alt` 反而 `esc()` 了） | ① `esc(S.lb.src)`（一行）② 服务端 key 白名单 `/^u\/\d{4}\/\d{2}\/[0-9a-f]{24}\.(jpg\|png\|gif\|webp)$/` ③ key 绑定签发者. 同批给 `app.js:249/1023/1025/2166/2172` 的 `src/grad/icon` 补 `esc()`（今天是 self-XSS，一旦放开条目编辑即升为存储型） |
| **A2** | **`/ws` 只验 JWT 签名，不查 sessions/token_hash/expires；叠加 JWT 默认密钥，可自签冒充任意用户收发私信** | 🔴 严重 | `server/src/routes/chat.js:56-59` 绕开 `server/src/auth.js:227-256` `findSession` 的整行校验；`server/src/index.js:50` 缺 env 时用公开串 `dev-only-insecure-secret-change-me` | `/ws` 复用 `findSession`；production 下 `JWT_SECRET` 缺失即 `process.exit(1)`，`deploy.sh` 加非空断言 |
| **A3** | **`X-Forwarded-For` 可伪造 → 登录（10/10min）与发帖（10/1min）限流全部失效** | 🔴 严重 | `server/src/index.js:42` `trustProxy:true`（信任任意跳）+ `deploy/nginx.conf:70` `$proxy_add_x_forwarded_for`（把攻击者头的值追加在左）→ `req.ip` = 攻击者自填值 | `trustProxy:'127.0.0.1'`；nginx 改 `proxy_set_header X-Forwarded-For $remote_addr` |
| **A4** | **演示凭据 / 账号库 / 验证码回显随生产包发布** | 🔴 严重 | `js/auth.js:22` `SECRET='jingyu-demo-2026'`；`:104-133` 8 个 `jingyu2026` 账号；`:399-401` `devCode` 直接回传；`:488` `_dump()` 导出全部 email/摘要/sid；`js/app.js:1659` 登录页明文展示演示口令；`server/src/seed.js:127` `jingyu1234` | demo 段拆出 `auth.demo.js` 仅 dev 引入；`devCode` 仅 localhost 返回；删 `_dump()`；改 `jy-auth-v1` 即可冒充任意人的问题随 B1 一起消失 |
| **A5** | **`add_header` 继承覆盖 → server 级 4 个安全头 + 4 个 CORS 头在所有 API 响应上失效；且全站无 CSP** | 🔴 严重 | `deploy/nginx.conf:78` 的 `location /` 内 `add_header Cache-Control` 导致 `:42-45` `X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy` 与 `:51-54` CORS 头整体不被继承 | 抽 `security-headers.conf` snippet 在每个 location 内 `include`；`Cache-Control` 提到 server 级；CSP 加 `script-src 'self' 'sha256-…'`（`index.html:17-28` 内联主题守卫算 hash，或抽 `js/theme-boot.js`） |

---

## 3. B 类 · 链路阻塞（上线即失效，4 项）

| # | 问题 | 严重度 | 证据 | 修复 |
|---|---|---|---|---|
| **B1** | **认证双轨未接线**：登录/注册只写 localStorage，从不调 `/api/auth/login`，服务端 cookie 从未建立 → 点赞/评论/发布恒 401，且失败后静默回退本地"成功" | 🔴 严重 | `js/app.js:2915-2952` 调 `window.AUTH`；`js/api.js:43-46` 的 `login/register/logout/me` 零调用；`post.user_id` 写入链路 `posts.js:72/154/203`、`comments.js:53`、`upload.js:76` 全在 `requireAuth` 后 | 登录改 `API.login(email,password)` → `adoptAccount()`；启动时 `API.me()` 回填；写失败必须回滚 UI + toast，禁止静默假成功 |
| **B2** | **跨域方案三处不自洽**：`DSH_API_BASE` 全仓无赋值、`credentials` 默认 same-origin、cookie `SameSite=Lax`，而 nginx 规划 www/api 双域 | 🔴 严重 | `js/api.js:15`、`:19-20`；`server/src/auth.js:149`；`deploy/nginx.conf:5-8、51-54、98-120`（静态站无 `/api` 反代 → `/api/*` 拿到 HTML，`api.js:27-33` 抛"请求失败 200"） | **推荐单域**：www 上加 `location /api/ { proxy_pass http://127.0.0.1:3000; }`，删掉整套 CORS；否则必须三件套同步（注入 BASE + `credentials:'include'` + `sameSite:'none';secure`） |
| **B3** | **上传图片链路每一段都断，传成功了也显示不出来** | 🔴 严重 | `js/api.js:97` 用后端返回的相对址 `/api/upload/local?key=…` 上传，未拼 BASE（`api.js:15`）→ 跨域时打到静态站；`upload.js:56-65` 返回 `/uploads/<key>`，但 `server/src/index.js:106-129` 无 `@fastify/static`、`deploy/nginx.conf` 无 `location /uploads`、`deploy/server-setup.sh:106` 只建目录 → 图片 404 | `sign.uploadUrl` 拼 BASE；nginx 加 `location /uploads { alias /var/www/jingyu/uploads/; }` 或注册 `@fastify/static` |
| **B4** | **部署链断裂**：① `npm ci` 但 `server/` 无 `package-lock.json`（必然失败）② `dist` 只 tar 到服务器，而 nginx 声明静态走 COS+CDN，仓库无上传步骤，8080 静态 server"平时不启用"→ 前端没有可访问出口 | 🔴 严重 | `deploy/deploy.sh:85`、`:47-66`；`deploy/nginx.conf:3-8、98-119`；`server/package-lock.json` 不存在（已核实） | 提交 lockfile；补 `coscmd upload -rs dist/ /` 步骤，或明确改回 nginx 直出并把 8080 并入 443 |

---

## 4. C 类 · 承诺阻塞（功能不存在，但 UI 声称可用，6 项）

| # | 问题 | 严重度 | 证据 | 修复 |
|---|---|---|---|---|
| **C1** | **下载按钮从不发请求，1 秒后打印一个硬编码假签名 URL** | 🔴 严重 | `js/app.js:3254-3262` 只 `S.dl={state:'work'}` + `setTimeout(…,900)`，无 fetch、全仓 `a[download]` 出现 **0 次**；`js/app.js:1255-1261` 拼死 `?Expires=1759020411&Signature=demo-not-a-real-signature` 并自述"链接不会真的开始下载"；`README.md:161` 声称"点击瞬间才签发 10 分钟签名 URL" | 补 `GET /api/plugins/:id/download`（302 或预签名），`signedBox` 用响应 url |
| **C2** | **发布插件 / 上传版本是纯前端表演，后端连提交接口都没有** | 🔴 严重 | `js/app.js:3319-3329` 伪造包名、`size:'1.2 MB'`、`sha:'c41f7a09…'+p.id+'(演示值)'`（注释自认没法读文件）；`3066-3080` 同构；`3342`/`3095-3099` 只改 `stage='review'`；`server/src/routes/forums.js` 全文仅 3 个 GET（`:9 / :26 / :61`） | 补 `POST /api/plugins/:id/versions`（先 sign 再落盘）；前端真读 `File.size` 与 WebCrypto sha256 |
| **C3** | **认领验证按静态字段决定成败**：已认领的永远成功，其余永远失败（不读 README/Issue/Gist，不发请求） | 🔴 严重 | `js/app.js:3287-3300` `const ok = !!p.claimed`；`:3293` 注释写 p1/p4，实际 `data.js` 是 p1/p2/p4/p9 | 补 `GET /api/plugins/:id/claim/verify?token=`，结果映射到 `S.vs[id]` |
| **C4** | **私信完全未实现**：无会话页、无 WebSocket，点"私信"跳别人空间 | 🔴 严重 | `js/data.js:249-250` 两条写死 `kind:'dm'` 通知；`js/app.js:3208` 点开跳 `space` 路由的"日志"tab；全仓 `new WebSocket` **0 次**；`server/src/routes/chat.js:52 /ws`、`:138 /messages/:uid` 无人调用；`README.md:152` 声称五页签含私信 | 补 `#/chat/:uid` + ws 客户端；链路做好前**先隐藏 dm 页签** |
| **C5** | **社群帖与回复永远只在本机**：前端不拉 threads，后端无发帖接口 | 🔴 严重 | `js/api.js:197` `const threadList = [];` → `:205` `if (threadList.length)` 死分支，`D.threads` 恒为 `data.js` 静态 8 条；`js/app.js:3563-3589`/`3548-3559` 只 unshift `S.newThreads`/`S.newFloors`；`forums.js` 无 POST | 补 `POST /api/forums/:slug/threads`、`POST /api/threads/:id/replies`，`sync` 里真拉 threads |
| **C6** | **后端 5xx 时"发表成功"内容只在内存**：`S.published` 不在 `saveState` 白名单，刷新即消失、他人不可见 | 🔴 严重 | `js/app.js:3516-3526` `keepLocal` 只 `S.published.unshift()`；`:2738-2751` `saveState` 的 `out` 含 `newThreads/newFloors/msgs` 但**不含 `published`**（已核实）；`:3527` `if (!window.API)` 因 api.js 先加载是死分支 | 5xx / 网络错误改成失败提示 + 草稿存 localStorage；或把 `published` 加入持久化并明确标"本地草稿，未发布" |

---

## 5. P1 · 上线前强烈建议同批完成（18 项，约 1 人日）

| # | 问题 | 严重度 | 证据 | 修复 |
|---|---|---|---|---|
| P1-1 | **≥1240px 侧栏 `sticky` 无高度上限** → 桌面主流宽度（1280/1440/1920）下侧栏第 3–5 张卡永远滚不到（`app.js:862` 默认 5 张卡） | 🟠 中等偏严重 | `css/app.css:158`、`:174` 只有 `position:sticky;top:…`；唯一 `max-height` 在 `:1408-1410` 且仅覆盖 1081–1239 | 把 `max-height:calc(100vh - var(--nav-h) - 32px);overflow:auto` 提到全局 `.col-side/.col-rail`，或加 `@media (min-width:1241px)` |
| P1-2 | `viewport-fit=cover` 缺失，而 CSS 有三处 `env(safe-area-inset-bottom)` → iPhone 上恒为 0，底栏被 home indicator 压 | 🟠 中等 | `index.html:5`；`css:863、865、1341` | `width=device-width,initial-scale=1,viewport-fit=cover` |
| P1-3 | 761–860px 无断点：`.nav-links` 到 `css:908` 的 ≤760 才隐藏，该区间 nav 各项宽度之和超出视口 | 🟠 中等 | `css:83、95、908、914` | 加 `@media (max-width:900px){.nav-links{display:none}}` 或让搜索框 `flex:0 1 120px` |
| P1-4 | `:focus-visible` 无 `:focus` 兜底 → Safari <15.4 键盘焦点完全不可见 | 🟠 中等 | `css:969-970、1404` | `@supports not selector(:focus-visible){:focus{outline:2px solid …}}` |
| P1-5 | `aspect-ratio` 是唯一图片高度来源，无 `padding-top` 回退（老 Safari 图高塌陷 → CLS） | 🟠 中等 | `css:402-410` | 补 `@supports not (aspect-ratio:1)` 的 padding-top 兜底 |
| P1-6 | `backdrop-filter` 两处缺 `-webkit-` 前缀 → iOS<18 无模糊（纯装饰） | 🟡 轻微 | `css:815、2110` | 补前缀 |
| P1-7 | 输入框 13px → iOS 聚焦自动放大跳动 | 🟠 中等 | `css:111、1593、2140` | `@media (pointer:coarse){input,textarea,select{font-size:16px}}` |
| P1-8 | `/api/healthz` 泄漏服务器绝对路径与 COS 配置状态（nginx 只精确拦了 `/healthz`） | 🟠 中等 | `server/src/index.js:107-115` | 生产只回 `{status,uptime}` |
| P1-9 | `requirePhone` 定义了但没挂到任何写路由 → 手机号闸门形同虚设 | 🟠 中等 | `server/src/routes/phone.js:208-218` | 挂到 publish/upload/chat 的 preHandler |
| P1-10 | 后端不可用时自动降级"离线演示模式"，继续展示 `data.js` 假数据冒充真实内容 | 🟠 中等 | `js/api.js:216-226、263-277` | 降级后进只读空态或明确横幅，不要用演示数据顶替 |
| P1-11 | 构建不压缩、不产 `.br/.gz`；app.js 254KB / gzip 79KB / br 62KB，首屏合计 gzip 155KB | 🟠 中等 | `deploy/build.mjs:60-80` | 加 esbuild `--minify`（raw 约 −45%）+ 输出 `.br` 供 CDN 直取 |
| P1-12 | 无版本控制：根目录不是 git 仓库、无 `.gitignore`；`shots/` 267MB / 500+ 文件含 `.dsh-ops-update-*.lock` | 🟠 中等 | `git rev-parse` → `fatal: not a git repository` | `git init` + .gitignore（node_modules/dist/.env/shots），shots 移出仓库 |
| P1-13 | WebSocket 允许 `?token=` 传 7 天 JWT → 明文进 nginx access log / Referer | 🟠 中等 | `server/src/routes/chat.js:56` | 只认 httpOnly cookie |
| P1-14 | 聊天 `msg.to` 无授权校验、无频率限制 | 🟠 中等 | `chat.js:86-110` | 校验双向关系 + 每人 20 条/分 |
| P1-15 | OAuth `client_secret` 走 GET query | 🟠 中等 | `oauth.js:151-155、177-180` | 改 POST form body |
| P1-16 | 部署目标硬编码真实 IP（43.142.153.74）与用户名；`shots/*.cjs` 另有 14 处 | 🟠 中等 | `deploy/deploy.sh:18-21` | 改必填环境变量 |
| P1-17 | 761–1080px 单栏时 `--wrap-w:1320` 使正文行宽约 74 汉字（>75 已偏宽，阅读疲劳） | 🟠 中等 | `css:22、155、388` | `@media (max-width:1080px){.post-body{max-width:46em;margin:0 auto}}` |
| P1-18 | `theme-color` 不随主题切换（浏览器 UI 条在夜间模式仍是浅色） | 🟡 轻微 | `index.html:7-8`；`app.js:3177、3914` | 切换时同步 `<meta name="theme-color">` |

---

## 6. P2 · 可后期迭代（18 项）

| # | 问题 | 严重度 | 证据 | 建议 |
|---|---|---|---|---|
| P2-1 | 每次 `render()` 全量重建 `app.innerHTML` + 每帧同步 `localStorage.setItem` + 遍历全部 `[data-act]` 改属性 → 30 条 feed 时点赞明显掉帧 | 🟠 中等 | `js/app.js:2749、2754-2759、2796-2852` | 局部 patch；saveState 防抖 200ms；改事件委托免去 role 注入 |
| P2-2 | `saveState()` 的 `catch(err){}` 静默吞配额异常 → 存储满后"看起来成功但不持久" | 🟠 中等 | `js/app.js:2750` | 至少 `console.warn` + 写失败降级提示 |
| P2-3 | 后端帖评论区永远为空（映射时 `comments: []`，`API.comments` 零调用） | 🟠 中等 | `js/api.js:153`、`:56` | 展开时 `GET /api/posts/:id/comments` 合并 |
| P2-4 | 15 个"点了有反应其实没发生"的 toast 按钮（安装/举报/收藏/分享/申请开放/外链/关注…）+ 回复框标"支持 Markdown"但只 `esc` 不渲染 | 🟠 中等 | `js/app.js:3421-3426、3275-3279、2060-2084、1194-1226、782、2331`；`2085-2091` vs `2074` | 能落库的接接口；做不到的改文案 + `disabled` |
| P2-5 | 关注状态是单布尔（`S.follow`），不按 uid；首页"关注"tab 硬编码 `['u3','u5','u2']` | 🟠 中等 | `js/app.js:3617-3621、872` | 改 `Set<uid>` 并进 saveState |
| P2-6 | 设置页"消息提醒"开关实际执行"全部标为已读" | 🟠 中等 | `js/app.js:1748-1750、3036-3045` | 独立 `S.notifyPref`；红点开关挪回消息中心 |
| P2-7 | 守卫 fail-open：`auth.js` 未加载时整站默认"已登录 + 手机已验证" | 🟠 中等 | `js/app.js:268-273、2777` | 兜底改 `{mode:'guest',phoneOk:false}` |
| P2-8 | 非法 hash / 非法 id 全静默兜底（`#/entry/p999` 显示 p1、`#/space/不存在` 显示自己）；`render` 无 try/catch | 🟠 中等 | `js/app.js:2706-2726、1111-1112、2025、2275-2276、2809` | 未命中 toast + 跳 feed；查找函数返回 null 渲染 404 块；render 包 try/catch |
| P2-9 | 两个 document `keydown` 监听（Escape / Enter 分家） | 🟡 轻微 | `js/app.js:3653、3855` | 合并为一个 |
| P2-10 | `toast` 的 icon 未转义（当前调用方均为常量，暂无实际风险） | 🟡 轻微 | `js/app.js:321` | 统一走 `esc()` |
| P2-11 | `Math.round(cnt.pack / plugins.length * 100)`：plugins 为 0 时显示 `NaN%` | 🟡 轻微 | `js/app.js:1071` | 除零前判空 |
| P2-12 | 离线角标 `pointer-events:none` 且无重试，`sync` 只在 load 跑一次 | 🟡 轻微 | `js/api.js:216-226` | 角标可点重试 `API.sync().then(render)` |
| P2-13 | 相册是 9 块纯渐变色块，点开只是把同一块渐变放大 | 🟡 轻微 | `js/app.js:2292-2298、3622-3630` | 先按"暂无相册"空态隐藏 |
| P2-14 | 页脚三处 + "全部 128 ›" + "本周" 是 `href="javascript:;"` 且无 `data-act` | 🟡 轻微 | `js/app.js:2675-2676、909、1085` | 指向真实路由或改 `span aria-disabled="true"` |
| P2-15 | 缺 `og:image` / `manifest.json` / `apple-touch-icon` / `canonical`；`description` 仍写"仿 QQ 空间风格的…前端" | 🟡 轻微 | `index.html:9-15` | 补 1200×630 og 图 + manifest；改写为产品定位文案 |
| P2-16 | `100vh` 在移动端地址栏伸缩时抖动 | 🟡 轻微 | `css:64、1409` | `100svh` + `@supports` 兜底 |
| P2-17 | 触控目标偏小：`.icon-btn` 34px、`.nt-x` 18px、fab 40px（低于 44px）；`.pop` 固定 330px 在 ≤330px 视口溢出 | 🟡 轻微 | `css:114、2758、864、131` | 伪元素外扩热区（`:1478` 已有范式）；`.pop{width:min(330px,calc(100vw - 24px))}` |
| P2-18 | 17 处 `!important`、146 处内联 `style=""`、3942 行单文件、无 ESLint/格式化/测试；`logger.transport` 三元两支相同（死代码）；`server/.env.example` 与 `deploy/env.example` 双份模板 | 🟡 轻微 | `css/app.css`、`js/app.js`、`server/src/index.js:38` | 接 eslint + prettier；按页拆模块；删死代码；env 模板留一份 |

---

## 7. 兼容性三角（正面结论 + 三个必补回退）

**地板声明（建议写进 README）**：CSS 用了 flex `gap`（244 处）、`inset`（15 处）、`:where()`、`aspect-ratio`、`:focus-visible` → 实际地板 **Safari 15.4 / Chrome 90**。JS 侧 `?.` / `??` / `.at()` / `structuredClone` / `replaceAll` 出现次数**均为 0**，比地板更保守。无 `:has()` / `color-mix()` / `@container`，不存在新特性整块失效风险。

**必补回退只有三处**（P1-4 / P1-5 / P1-6），其余兼容性通过。**暗色对比度与 `prefers-reduced-motion` 已实测干净**（6 处 reduced-motion、1 处 `@media (hover:hover) and (pointer:fine)` 避免触摸端粘滞 hover），不必再排。

---

## 8. 上线前 Checklist（4 个闸门，按序执行）

### 闸门 1 · 安全（必须全绿）
1. [ ] `esc(S.lb.src)` + 服务端 image key 白名单 + 绑签发者（**A1**）
2. [ ] `/ws` 复用 `findSession`；`JWT_SECRET` 缺失即拒启动（**A2**）
3. [ ] `trustProxy:'127.0.0.1'` + nginx XFF 改 `$remote_addr`（**A3**）
4. [ ] demo 段剥离、`devCode` 限 localhost、删 `_dump()`（**A4**）
5. [ ] nginx 头继承修正 + CSP（**A5**）

### 闸门 2 · 链路（必须全绿）
6. [ ] 定方案：单域反代（推荐）或跨域三件套 → 改 nginx / api.js / cookie（**B2**）
7. [ ] 登录接线：`API.login` → `/auth/me` 驱动身份；写失败回滚 UI（**B1**）
8. [ ] 上传：BASE 拼全 + `location /uploads` 或 `@fastify/static`（**B3**）
9. [ ] 提 lockfile + 补静态出口（COS 上传 或 8080 并入 443）（**B4**）

### 闸门 3 · 承诺（二选一：接线 or 隐藏）
10. [ ] 下载签名接口 / 隐藏下载按钮（**C1**）
11. [ ] 发布版本接口 / 隐藏发布入口（**C2**）
12. [ ] 认领验证接口 / 隐藏认领（**C3**）
13. [ ] 私信 ws 客户端 / 隐藏 dm 页签（**C4**）
14. [ ] 社群发帖接口 / 隐藏发帖框（**C5**）
15. [ ] 5xx 假成功修正（**C6**）

### 闸门 4 · 体验（建议同批）
16. [ ] 侧栏 sticky 高度上限（**P1-1**，桌面最显眼）
17. [ ] `viewport-fit=cover` + 16px 输入框（**P1-2、P1-7**）
18. [ ] minify + brotli（**P1-11**）
19. [ ] 真机回归：iPhone Safari / Android Chrome / 桌面三浏览器，逐项过「登录 → 发布带图 → 点赞 → 评论 → 退出」

---

## 9. 两条上线路径（建议选 B）

| 方案 | 内容 | 工作量 | 适用 |
|---|---|---|---|
| **A · 全量接线** | 关闭全部 15 项 P0 + P1 同批 → 真站 | **4–5 人日**（R1 1.5d、R2 1.5d、R3 1d、P1 1d） | 要对外正式运营 |
| **B · 演示站先行**（推荐） | 关闭 A 类 5 项安全 + B 类 4 项链路中的 B2/B3/B4 → C 类 6 项全部**隐藏入口**并在页脚标注"演示环境" → 1 人日内可上线，同时并行做 A 方案 | **0.5–1 人日** | 要尽快有可访问版本 / 内测 / 对客户演示 |

> 方案 B 的价值：把"假功能"从**隐患**降级为**不存在**。用户看不到按钮，就不会期待下载/私信/发帖；比保留一堆 toast 假按钮安全得多，也真实得多。

---

## 10. 判定

- **上线门禁：No-Go**。15 项 P0 未关闭前不建议对外。
- **最值得肯定**：页面层安全（291 处 `esc()`、8 处 innerHTML 写入点全部无裸拼、无 `eval`/第三方脚本）、可访问性（role/tabindex 补全 + Enter/Space 兜底 + 6 处 reduced-motion）、缓存策略设计（内容哈希 + `immutable` + manifest）、服务端认证实现本身（bcryptjs 10 轮、`token_hash` + `timingSafeEqual`、单账号单会话唯一索引）——这四块是**合格甚至优秀**的。
- **真正的债**集中在"链路接线 + 后端写接口缺失 + 部署一致性"，属**一次性还清**的类型，不是架构问题。**代码不需要重写，需要接通。**
