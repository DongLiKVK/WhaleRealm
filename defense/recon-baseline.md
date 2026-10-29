# seekbbs.cn 防御有效性普查基线（防守方自查）

**一句话结论**：边缘层（nginx + fail2ban）实测拦截有效、无侦察级信息泄露被直接打穿，应用层鉴权/输出转义/CSP/上传白名单四点都对得上；**0 高危、4 中危、6 低危**，最该补的是 `/api/healthz` 的绝对路径泄露、SCAN-DROP 的编码/锚点绕过缝、以及 429 缺 `Retry-After`。

- 时间：2026-10-29 18:34–19:10 (+08:00)
- 目标：https://seekbbs.cn（源站 43.142.153.74，nginx 1.18 + Fastify 127.0.0.1:3000）
- 风险计数：**高危 0 / 中危 4 / 低危 6**
- 纪律：全程 ≤20 并发、单轮 ≤5s、单轮 ≤200 请求；无写破坏；未提交 git、未改任何服务器配置。

## 0. 两条腿走路：vantage 说明（重要）

| vantage | 用途 | 为什么 |
|---|---|---|
| **外部**（本机 111.33.213.23 → 公网） | 响应头、TLS、限流加压、WS、上传、CSP/浏览器实测 | 真实攻击者视角，能测到 CDN/边缘真实行为 |
| **服务器回环**（`curl --resolve seekbbs.cn:443:127.0.0.1`） | 444/404 类「质量探测」（`.env`、`.git`、穿越、UA 黑名单…） | 见事故记录：这些路径本身就会触发 fail2ban 封禁，回环在 `ignoreip` 内不会误封，且判定逻辑与外部完全一致 |

> **事故记录（已自愈，但暴露一个真实风险）**：本机出口 IP 实测是 `111.33.213.23`，**不在** `ignoreip` 白名单（名单里是 `111.31.187.43`）。18:35:58 一条 `GET /.git/config`（444）即触发 `nginx-badreq`（`maxretry=1`）被封 24h，现象为 80/443 全超时、**22 端口仍 OPEN**（`banaction=iptables-multiport` 只封 http,https）。已用 `sudo fail2ban-client set nginx-badreq unbanip 111.33.213.23` 解封。→ 这条同时说明：**封禁只封 web 端口，SSH 仍可达**（运维友好），也说明**任何扫描器第一发垃圾请求就会被封**（防御有效）。

---

## A. 边缘层

| # | 项目 | 期望 | 实测（vantage） | 判定 | 证据（命令 + 关键输出） |
|---|---|---|---|---|---|
| A1-1 | 安全响应头 | HSTS(含 preload)/CSP/XFO/RP/COOP/PP 齐全 | `Server: nginx`（无版本）；HSTS `max-age=31536000; includeSubDomains`（**无 preload**）；CSP `default-src 'self'; script-src 'self' +3×sha256`（无 unsafe-inline）；XFO SAMEORIGIN；RP strict-origin-when-cross-origin；COOP same-origin；PP geolocation/microphone/camera=() | PASS（preload 见低危 L1） | `curl -sI https://seekbbs.cn/`（全文见附录 E1） |
| A1-2 | 80→443 跳转 | 301 且保留 path+query | `301`，`Location: https://seekbbs.cn/forums/general?x=1&y=2` | PASS | `curl -sI "http://seekbbs.cn/forums/general?x=1&y=2"` |
| A2-1 | 协议版本 | TLS1.0/1.1 拒绝 | `tlsv1 alert protocol version`（alert 70），1.0/1.1 均拒；1.2/1.3 正常 | PASS | `openssl s_client -connect seekbbs.cn:443 -tls1_1` |
| A2-2 | 证书链/有效期/域名 | 链完整、未过期、含 www | Let's Encrypt YR2 签发，链 3 张（leaf→YR2→ISRG Root YR→X1）；`notAfter Jan 27 08:35:37 2027 GMT`；SAN `DNS:seekbbs.cn, DNS:www.seekbbs.cn`；`Verify return code: 0` | PASS | `openssl s_client -connect seekbbs.cn:443 -servername www.seekbbs.cn -showcerts` |
| A2-3 | 弱套件 | RC4/3DES/EXPORT 全拒 | `DES-CBC3-SHA`、`RC4-SHA` 握手失败；**但** `AES128-SHA`、`AES256-SHA`、`ECDHE-RSA-AES128-SHA`、`ECDHE-RSA-AES256-SHA` 全部成功（CBC/SHA1/非 PFS） | WEAK | `openssl s_client -cipher 'AES128-SHA' -tls1_2` → `Cipher is AES128-SHA` |
| A2-4 | OCSP stapling | 有 staple | `OCSP response: no response sent` | WEAK | `openssl s_client -status` |
| A2-5 | TLS 重协商 | 拒绝客户端重协商 | `Secure Renegotiation IS supported`；主动 `R` → `no renegotiation`（err 0A000153） | PASS | `openssl s_client` 交互发 `R` |
| A3-1 | /api/feed 限流 | >阈值出 429，每 IP 计 | 阶梯 1/5/10/20 r/s 全 200；**40r/s×2s（80 请求）仍全 200**（30r/s + burst 60 吸收）；饱和 200 请求/并发 20 → `{"200":40,"429":160}`，耗时 181ms | PASS | `defense/ratelimit.js`、`defense/ratelimit2.js`（附录 E2） |
| A3-2 | 429 语义 | 带 Retry-After | **无 Retry-After**（多轮均 none），body 为 nginx 162B HTML 默认页 | WEAK | `curl -D- /api/feed` × 饱和后 |
| A3-3 | 恢复速度 | 限流后快速恢复 | 饱和后 +1s 即恢复 200（token bucket 30r/s 回填） | PASS | 同上 |
| A3-4 | 静态页限流 | html_limit 3r/s burst40 | `/` 60 请求/并发 10 → `{"200":41,"429":19}` | PASS | 同上 |
| A3-5 | 连接数限制 | conn_all 16 生效 | 30 并行 → `{"200":26,"429":4}` | PASS | 同上 |
| A3-6 | 每 IP 而非整站 | 一个 IP 被限不影响别人 | 回环打满（`{"200":58,"429":142}`）同时外部单发 → **200** | PASS | `defense/saturate.js` + 外部 curl |
| A4-1 | XFF/X-Real-IP 伪造绕过限流 | 无效 | nginx 四段 location 均 `proxy_set_header X-Forwarded-For $remote_addr`（防伪造注释在案）；实测换 20 组伪造 XFF 后应用层桶不变（仍 TOO_MANY） | PASS | `grep proxy_set_header /etc/nginx/sites-enabled/jingyu-443.conf`（17 行命中） |
| A4-2 | 超大 body | >8m → 413 | 9MB POST /api/posts → `413 Request Entity Too Large` | PASS | `defense/external.js` |
| A4-3 | 超长 URL / header | 414 / 400 | 9KB URI → `414`；16KB 头 → `400 Request Header Or Cookie Too Large` | PASS | 同上 |
| A4-4 | Range 大请求 | 静态可 Range、动态忽略 | `GET / Range: bytes=0-99` → `206`，`Content-Range: bytes 0-99/9595`；`/api/feed` Range → 200 无 Content-Range | PASS | 同上 |
| A4-5 | 慢速 header（slowloris） | 单连接应被 10s 超时掐断 | 单连接半截头：**10.1s 后 ECONNRESET**（`client_header_timeout 10s` 生效） | PASS | `defense/slow-admin.js` |
| A5-1 | 方法限制 | TRACE/DEBUG/PUT/DELETE 拒绝 | TRACE→405、DEBUG→444、CONNECT→444、PUT/DELETE/PATCH/OPTIONS→405 | PASS | 回环 `curl -X TRACE` 等 |
| A5-2 | 目录穿越 | ../ 与编码穿越拦截 | `/../etc/passwd`、`/assets/../../etc/passwd`、`/%2e%2e%2f%2e%2e%2fetc%2fpasswd` → **400**；`/api/../.env` → 444 | PASS | 回环 curl |
| A5-3 | 大小写绕 SCAN-DROP | `.ENV`/`WP-ADMIN` 同样 444 | `/.ENV`、`/.Git/config`、`/WP-ADMIN` 全 444（nginx 正则大小写不敏感） | PASS | 回环 curl |
| A5-4 | 编码/双斜杠绕过 | 应同样 444 | `/%2eenv` → **404**、`//.env` → **404**、`/server/.env` → **404**、`/x.PHP` → **404**（SCAN-DROP 锚 `^/\.` 且不含扩展名规则） | WEAK | 回环 curl（附录 E3） |
| A5-5 | UA 黑名单 | sqlmap/nuclei 等 444 | UA `sqlmap/1.x`、`nuclei` → 444（连接被 reset） | PASS | 回环 `curl -A sqlmap` |
| A5-6 | URI 注入特征 | union/select/sleep/XSS 特征 444 | `?cursor=1 union/**/select 1`、`1 and sleep(5)`、`%3Cimg…onerror=` → 444 | PASS | 回环 curl |
| A6-1 | 敏感文件 | `.git/.env/.DS_Store` 不可读 | `/.git/config`、`/.env`、`/.DS_Store` 全 444（无内容） | PASS | 回环 curl |
| A6-2 | /healthz | 轻量探活 | nginx 直接 `return 200 "ok"`，无信息 | PASS | `curl /healthz` |
| A6-3 | /api/healthz | 不应泄露内部细节 | `200 {"ok":true,"data":{"status":"ok","uptime":2233,"db":"/var/www/jingyu/server/data/jingyu.db","cos":false}}` | **FAIL（中危 M1）** | 回环 curl（附录 E4） |
| A6-4 | 目录列表 | /uploads/ 禁列 | `/uploads/` → 403 | PASS | 回环 curl |
| A6-5 | 后台入口 | 不应公网可达 | `/admin/` → **200**（直接出后台 SPA，3117B）；API 侧 `/api/admin/users` → 401（有鉴权） | WEAK（低危 L5） | 回环 curl |
| A6-6 | robots.txt | 不泄敏感目录 | `Disallow: /api/ /uploads/ /admin` | PASS | `curl /robots.txt` |

## B. 应用层

| # | 项目 | 期望 | 实测（vantage） | 判定 | 证据 |
|---|---|---|---|---|---|
| B7-1 | 登录限流 10/10min | 第 11 次 429 | 应用层按 IP 生效：反复实测出现 `429 {"code":"TOO_MANY","retryAfter":446/310}`（`@fastify/rate-limit`），nginx `wr_limit 12r/m` 另有一层 | PASS | `defense/auth-probe.js` |
| B7-2 | 8 次失败锁定 | 第 8 次 429 AUTH_LOCKED_OUT，锁 600s | **未测出**（被上层 TOO_MANY 先挡住，测试窗口内始终未拿到干净桶）；源码常量：`MAX_FAILS=8 WINDOW=900 BASE_LOCK=600`，锁定跨度 `600×2^(n-1)` 上限 21600s | 未测（源码旁证） | `server/src/lockout.js:27-30` |
| B7-3 | 邮箱枚举 | 注册/未注册响应一致 | 源码：未注册 → `401 NOT_REGISTERED`，密码错 → `401 BAD_CREDENTIALS + data.left`（**可枚举**）；实测受 TOO_MANY 阻断未复现 | 未测（源码旁证） | `server/src/routes/auth.js:158-177` |
| B7-4 | 注册限流 5/10min | 第 6 次 429 | 未测（同上，桶耗尽） | 未测 | 源码 `auth.js:88` |
| B7-5 | Cookie 标志 | HttpOnly+Secure+SameSite | `Set-Cookie: jingyu_token=eyJ…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`；浏览器内 `document.cookie` → `""` | PASS | 注册响应头 + Chrome CDP 实测 |
| B8-1 | 未授权访问 | /auth/me、/messages/1、DELETE /posts/1 → 401 | 三者全 `401 {"code":"NOT_AUTHED"}` | PASS | 回环 curl |
| B8-2 | IDOR（A 账号读 B） | 越权应 403 | **未测**（线上 `demo*@jingyu.local` 不存在 → NOT_REGISTERED；只注册到 1 个测试号，无第二身份） | 未测 | — |
| B9-1 | /api/feed 注入 | 参数化，异常输入不 500 | `limit=-1/99999999999/abc`、`cursor=abc`、`cursor=1'or'1'='1`、`cursor=%27--` → 均 200、无报错无延时（参数被强转/丢弃） | PASS | 回环 curl 单发 |
| B9-2 | /api/posts/:id 注入 | 不 500、不泄露 | `/api/posts/abc`、`/api/posts/-1`、`/api/posts/1 union/**/select 1` → 404 统一文案 | PASS | 回环 curl |
| B9-3 | /api/forums/:slug | 同上 | `/api/forums/%27/threads`、`/api/forums/abc/threads` → 404 `这个版块不存在` | PASS | 回环 curl |
| B10-1 | 昵称存储型 XSS | 应转义 | 昵称写入 `<svg/onload=alert(1)>`，API 原样返回（JSON 正常）；**真实浏览器渲染为纯文本**：`svg[onload]=0`、`innerText` 含原文 → `esc()` 生效 | PASS | Chrome CDP `defense/cdp-xss.js` |
| B10-2 | CSP 是否真拦内联 | 内联 script/onerror 应被拦 | 注入内联 script → `inlineRan:false`，violation `script-src-elem|inline`；注入 `<img onerror>` → `handlerRan:false`，violation `script-src-attr|inline` | PASS | `defense/cdp-csp.js`（附录 E5） |
| B11-1 | 上传白名单 | 只按 contentType，不认扩展名 | `filename=shell.php + contentType=image/png` → **200**，落盘 key `u/13/2026/10/88b38764c9d19379cd23fc16.png`（扩展名取自 MIME，与文件名无关）；`image/svg+xml` → 400 BAD_TYPE；size 999999999 → 413 TOO_LARGE（5MB） | PASS | `defense/external.js` |
| B11-2 | 无害上传落盘 | 可上传、不可执行 | 1×1 PNG 走 `/api/upload/local` → 200（70B, type image/png）；随后 `GET /uploads/...png` → **403**（nginx 读不到该文件/权限），即：**落盘成功但静态直出不成功** | WEAK（功能 bug，安全侧无执行面） | `defense/upload-test2.js` |
| B12-1 | WS 无 token | 4401 关闭 | `close code 4401, reason "未登录"`（147ms） | PASS | `defense/external.js` |
| B12-2 | WS 伪造 token | 4401 | `?token=garbage` → 4401 | PASS | 同上 |
| B12-3 | WS ?token= 通道 | 仅 cookie | `?token=<有效 JWT>` → 连接成功并收到 `hello`（设计如此；JWT 无签名绕过） | PASS（风险见 L4） | 同上 |
| B13 | CORS 反射 | 不反射 Origin | `Origin: https://evil.com` → `/api/feed` `ACAO=none`；带 cookie 的 `/api/auth/me` 亦 `ACAO=none` | PASS | `defense/external.js` |
| B14-1 | 版本指纹 | 不露 nginx 版本 | `Server: nginx`（无版本号），404/413/414/429 页均无版本 | PASS | 附录 E1 |
| B14-2 | 404 回显路径 | 不回显 | nginx 默认 404 页，不含请求路径，且 404 也带全套安全头 | PASS | 回环 curl |
| B14-3 | 框架 404 形状 | 不泄框架 | 未匹配路由 → `{"message":"Route GET:/api/nope not found","error":"Not Found","statusCode":404}`（Fastify 默认形状，与应用 `{ok:false}` 信封不一致） | WEAK（低危 L6） | 回环 curl |

---

## 风险清单与计数

### 中危（4）
- **M1 `/api/healthz` 未鉴权泄露绝对路径 + uptime**：`db:"/var/www/jingyu/server/data/jingyu.db"`，可直接推出站点部署路径与进程存活时长，配合其他漏洞的路径猜测成本大降。
- **M2 SCAN-DROP 编码/锚点绕过缝**：`/%2eenv`、`//.env`、`/server/.env`、`/x.PHP` 都返回 **404 而非 444** —— 探测行为没被丢弃层吃掉。当前靠 `nginx-badreq` 的子串正则兜（`/\.env`、`\.php`），但 `%2e` 编码变体两个正则都不命中。**扫描器可低成本探活**（会吃 20/60s 的 404scan，但第一波已拿到答案）。
- **M3 429 无 `Retry-After` + 429 页是 nginx 默认 HTML**：客户端无法退避，正常用户被限时前端只会看到一段 HTML；也说明应用层限流先于 nginx 触发（实测反复 `TOO_MANY retryAfter≈300s`），真实攻击者换 IP 即可绕过应用层桶，只剩 nginx 的 30r/s。
- **M4 服务器自己的公网 IP 在 fail2ban 黑名单里**：`43.142.153.74` 被 `nginx-badreq` 封着 —— 本机 cron/监控打自己域名被当攻击者。风险：某天监控改走公网，站会「自己打不开自己」且很难想到是 fail2ban。

### 低危（6）
- **L1 HSTS 无 `preload`**（配置注释说是刻意，确认全站 https 后可加）。
- **L2 TLS1.2 仍允许 CBC/SHA1 与非 PFS 套件**（`AES128-SHA`/`AES256-SHA`/`ECDHE-RSA-AES*-SHA`），`ssl_ciphers HIGH:!aNULL:!MD5` 的副作用；无 RC4/3DES/EXPORT（已挡）。
- **L3 未开 OCSP stapling**（`OCSP response: no response sent`），首连多一次 CA 往返。
- **L4 WS 支持 `?token=`**：有效 JWT 走 query 会进 nginx/应用 access.log 与 Referer，令牌泄露面（无签名绕过）。
- **L5 `/admin/` 后台 SPA 公网 200**：API 有 401 保护，但入口暴露给扫描器（建议 IP 白名单或 basic auth）。
- **L6 Fastify 默认 404 形状泄露框架**：`{"message":"Route GET:/api/nope not found",...}` 与应用统一信封不一致，轻指纹。

### 功能 bug（非安全，但影响可用性）
- **B11-2 上传落盘成功但 `/uploads/<key>` 返回 403**：文件已写到 `/var/www/jingyu/uploads/u/13/...png`（200, 70B），静态直出 403 —— 权限/属主或 alias 配置问题，用户传图后看不到图。**好消息**：静态直出不通 = 上传内容没有执行/外链面。

---

## 必须在群友开打前修的 TOP 5

1. **`/api/healthz` 脱敏**（M1）：去掉 `db` 绝对路径与 `uptime`，只留 `{"ok":true}`；顺手给它加 `limit_req`（现在完全无限流，可被当免费探活/压测点）。
2. **补 SCAN-DROP 的规范化匹配**（M2）：在 `conf.d/10-shield.conf` 增加
   `map $uri $bad_uri2 { default 0; ~*(?:\.env|\.git|\.php|\.zip|\.sql|\.bak)$ 1; ~*/server/ 1; }`
   并用 `if ($bad_uri2) { return 444; }`（`$uri` 已被 nginx 归一化解码，能吃掉 `/%2eenv`、`//.env`）；同时给 badreq filter 加 `%2e` 变体。
3. **429 加 `Retry-After` 并统一成 JSON**（M3）：`limit_req_status 429;` 后加 `add_header Retry-After 1 always;`（或按 zone 在 map 里出 2/5/10），前端才能退避，减少「越限越猛打」的正反馈。
4. **把 `43.142.153.74` 从 badreq 名单摘掉**（M4），并确认监控/巡检改走 `127.0.0.1` 或加入 `ignoreip`；建议把 `nginx-badreq` 的 `maxretry=1` 保留（对真扫描器极有效），但把 `ignoreip` 补上运维出口网段。
5. **TLS 收紧 + OCSP stapling**（L2/L3）：`ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:!aNULL:!MD5:!DSS';` + `ssl_stapling on; ssl_stapling_verify on; ssl_trusted_certificate …/fullchain.pem;`。CBC/SHA1 一关，老客户端兼容性仍够（Android 5+/Win7 SP1+）。

> 次级建议（不影响开打）：`/admin/` 加 IP 白名单（L5）；WS 改一次性 ticket 替代 `?token=`（L4）；`/uploads/` 403 的权限问题修一下（功能 bug）。

---

## 附录：原始响应片段（已截断到必要部分）

### E1 响应头全表（外部 GET /）
```
HTTP/1.1 200 OK
Server: nginx
Date: Thu, 29 Oct 2026 10:20:xx GMT
Content-Type: text/html; charset=utf-8
Content-Length: 9595
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  script-src 'self' 'sha256-LC4AixU9x/7XUxeAxlUIEjK8xqF8++/zkJv3jVQ1mmw='
  'sha256-WbLF9n0yAz/8U9lVn3C7MbLmGIR6UpDg9kJxh7tlkZI='
  'sha256-SAsCBM8SvM6OojTclthAxQLUNWeAX4z83JsYIcNISrE=';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://avatars.githubusercontent.com
  https://jingyu-1314329555.cos.ap-guangzhou.myqcloud.com; media-src 'self' blob: …;
  font-src 'self' data:; connect-src 'self' …; frame-src 'self'; form-action 'self'; frame-ancestors 'self'
Cache-Control: no-cache
```

### E2 限流阶梯（回环 node 脚本输出）
```
1 r/s x5s      reqs=5   {"200":5}
5 r/s x4s      reqs=20  {"200":20}
10 r/s x3s     reqs=30  {"200":30}
20 r/s x3s     reqs=60  {"200":60}
40r/s x2s      reqs=80  {"200":80}
/api/feed x200 n=200 c=20 181ms {"200":40,"429":160} Retry-After=none
immediately after {"code":429,"len":162,"ct":"text/html; charset=utf-8"}
recover +1s    200
/ x60          n=60 c=10 36ms {"200":41,"429":19}
/api/feed parallel30 {"200":26,"429":4}     # limit_conn conn_all 16
loopback saturation: {"200":58,"429":142} → external single request: HTTP=200
```

### E3 SCAN-DROP 绕过面（回环，444 = connection reset）
```
/.env            -> curl: (56) Connection reset by peer     (444)
/.git/config     -> 444
/.DS_Store       -> 444
/.ENV  /.Git/config  /WP-ADMIN  /.env%20  /.env%09  /./.env  /api/../.env  -> 444
/%2eenv                                  -> 404
//.env                                   -> 404
/server/.env                             -> 404
/x.PHP                                   -> 404
/../etc/passwd  /%2e%2e%2f…etc%2fpasswd  -> 400
UA: sqlmap/1.x  nuclei                   -> 444（连接重置）
?cursor=1 union/**/select 1 / 1 and sleep(5) / %3Cimg…onerror=  -> 444
```

### E4 /api/healthz（中危 M1）
```
GET /api/healthz -> 200
{"ok":true,"data":{"status":"ok","uptime":2233,"db":"/var/www/jingyu/server/data/jingyu.db","cos":false}}
```

### E5 浏览器实测（Chrome 156 headless + CDP）
```
# 昵称 <svg/onload=alert(1)>（uid=13）在真实页面渲染
DOM: {"svgOnload":0,"svgTotal":5,"payloadInHTML":true,"payloadInText":true}
name rendered as text? true          # 转义生效，未生成元素
# CSP 内联拦截（往真实页面注入内联 script 与 onerror 属性）
CSP: {"inlineRan":false,"handlerRan":false,
      "violations":["script-src-elem|inline|","script-src-attr|inline|"]}
# Cookie 不可被 JS 读取
document.cookie = ""
```

### E6 认证 / WS / 上传
```
POST /api/auth/register {"email":"demoqa.qf1kfw@jingyu.local","password":"***","name":"<svg/onload=alert(1)>"}
 -> 200, Set-Cookie: jingyu_token=eyJ…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax
GET /api/auth/me (token) -> 200 {"user":{"id":13,"name":"<svg/onload=alert(1)>",…}}
GET /api/auth/me (无 token) -> 401 {"ok":false,"error":{"code":"NOT_AUTHED","message":"请先登录"}}
GET /api/messages/1 (无 token) -> 401 NOT_AUTHED
DELETE /api/posts/1 (无 token) -> 401 NOT_AUTHED
POST /api/auth/login {} -> 400 BAD_EMAIL
POST /api/auth/login （桶耗尽时） -> 429 {"code":"TOO_MANY","data":{"retryAfter":446}}

WS wss://seekbbs.cn/ws                 -> close 4401 "未登录" (147ms)
WS wss://seekbbs.cn/ws?token=garbage   -> close 4401 (123ms)
WS wss://seekbbs.cn/ws?token=<JWT>     -> open, {"type":"hello","data":{"user":{"id":13,…}}}

POST /api/upload/sign {filename:"shell.php",contentType:"image/png",size:1024}
 -> 200 {"local":true,"key":"u/13/2026/10/88b38764c9d19379cd23fc16.png",…}
POST /api/upload/sign {contentType:"image/svg+xml"} -> 400 BAD_TYPE（允许 jpeg/png/gif/webp）
POST /api/upload/sign {size:999999999}              -> 413 TOO_LARGE（>5MB）
POST /api/upload/local (70B PNG)                    -> 200 {"size":70,"type":"image/png"}
GET  /uploads/u/13/2026/10/88b38764c9d19379cd23fc16.png -> 403
```

### E7 大体量/慢速/方法（外部）
```
POST /api/posts 9MB          -> 413
GET /api/feed?x=<9000B>      -> 414
GET /api/feed X-Pad:16KB     -> 400
GET / Range: bytes=0-99      -> 206, Content-Range: bytes 0-99/9595
slowloris 单连接半截头        -> 10.1s 后 ECONNRESET（client_header_timeout 10s）
TRACE -> 405; DEBUG/CONNECT -> 444; PUT/DELETE/PATCH/OPTIONS -> 405
```

---

## 测试残留（交回）

- 测试账号 1 个：**id=13**，`demoqa.qf1kfw@jingyu.local`，昵称 `<svg/onload=alert(1)>`（未发任何帖子/评论，feed 不受影响）。
- 上传文件 1 个（无害 1×1 PNG，70B）：`/var/www/jingyu/uploads/u/13/2026/10/88b38764c9d19379cd23fc16.png`。
- 未做任何删除/修改操作；未改服务器配置；未提交 git。

## 未测项（时间/条件不足，标注清楚）

1. **8 次失败锁定实测**：被应用层 `TOO_MANY`（10/10min/IP）先挡住，未拿到干净桶；源码常量已核对（`MAX_FAILS=8`、`BASE_LOCK=600s`、指数 `600×2^(n-1)`、上限 21600s）。
2. **邮箱枚举实测**：同上（源码存在 `NOT_REGISTERED` vs `BAD_CREDENTIALS` 差异，可枚举）。
3. **注册限流 5/10min 实测**：同上。
4. **IDOR 实测**：线上无第二身份（`demo*@jingyu.local` 不存在），只注册 1 个测试号，未开第二个账号。
5. **`/uploads/` 403 根因**：未登服务器查属主/权限（时间不够）。
