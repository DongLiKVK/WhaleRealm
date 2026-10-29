# seekbbs.cn 防御加固报告

- 时间：2026-10-29 18:32 → 18:52（Asia/Shanghai）
- 目标：seekbbs.cn / 43.142.153.74（腾讯云轻量 · 鲸域，Ubuntu 22.04，nginx 1.18 + Fastify）
- 背景：群友准备对该站发起攻击测试，本次从**防守方**角度做加固与验证
- 结论：**扫描类、注入类、爆破类、CC 类攻击已在 nginx 层被挡住并自动封禁**；剩余风险集中在应用层逻辑（需改代码，见第 5 节）

## 1. 加固前的状态（为什么需要动）

| 项 | 加固前 | 问题 |
|---|---|---|
| 限流 | `00-limit-req.conf` 定义了 `api_limit`，但两个站点配置**零引用** | nginx 限流形同虚设 |
| 扫描器 | 仅有零散 `if` 规则（`.git`、`wp-`、`phpmyadmin` 等 20 余个前缀） | sqlmap/nuclei 等工具 UA、注入串、路径穿越全部放行 |
| 404 | `location / { try_files $uri $uri/ /index.html; }` | 任意不存在路径返回 **200 软 404**，扫描器无法被 fail2ban 计数 |
| 透传 IP | `X-Forwarded-For $proxy_add_x_forwarded_for` + Fastify `trustProxy: true` | 攻击者自带 XFF 即可让**应用层全部限流失效**（撞库/刷短信/批量注册） |
| WS | `/ws?token=<JWT>` 可用 | 完整 JWT 落 access.log |
| 图片代理 | `/api/img` 无任何限制 | 服务端出网抓取 + 落盘，SSRF / 磁盘填充放大器 |
| 上传目录 | 直接 alias 出去 | 可上传 html/svg 变同源 XSS 载体 |

## 2. 做了什么（三层拦截）

### 第一层：nginx 静态规则（`conf.d/10-shield.conf`）

- **UA 黑名单**（41 个）：sqlmap / nikto / nuclei / nmap / masscan / zgrab / gobuster / dirsearch / ffuf / wfuzz / hydra / acunetix / nessus / openvas / w3af / commix / arachni / xray / dirbuster / whatweb / censys / shodan / rustscan / naabu / katana / subfinder / feroxbuster / wpscan / ysoserial / metasploit / pocsuite / goby / fscan / vulmap …
- **URI 注入特征**（原文 + 百分号编码双形态）：`union select`、`information_schema`、`sleep(`/`benchmark(`/`load_file(`、`into outfile`、`' or 1`/`' and 1`、`<script`/`<img`/`<svg`/`onerror=`/`javascript:`、`../`/`%2e%2e`/`%252e%252e`、`/etc/passwd`/`win.ini`、`jndi:ldap/rmi/dns`、云元数据地址
  - **坑**：`$request_uri` 是未解码串，只写解码形态会被 `%20` 绕过（第一版实测漏拦，已修）
- **方法白名单**：只放行 GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS，其余 444
- **IP 黑名单**：`geo $blocked_ip` + `/etc/nginx/blocked_ips.conf`，由 `jingyu-defense ban` 维护
- **响应**：命中即 `444`（直接断连、不回任何内容），扫描器拿不到指纹

### 第二层：限流 / 连接数

10 个 zone：`site_burst`(10r/s) `site_burst_strict`(1r/s) `html_limit`(3r/s) `api_limit`(30r/s) `bigfile_limit`(8r/s) `img_limit`(20r/m) `wr_limit`(12r/m，只算写操作) `readme_limit`(6r/m) + `conn_all/conn_big/conn_ws`

**双档位**（`jingyu-defense on|off` 一键切换，自动 `nginx -t` + 失败回滚）：

| | NORMAL | ATTACK |
|---|---|---|
| 全局 | 10r/s，burst 120 | **1r/s，burst 10** |
| 并发 | 24 | 6 |
| location 内 | 不限 | 追加 1r/s |

超时组：`client_header_timeout 10s`、`client_body_timeout 15s`、`send_timeout 20s`、`keepalive_requests 300`、`http2_max_concurrent_streams 64`、`reset_timedout_connection on`（抵抗慢连接/slowloris）

### 第三层：fail2ban（9 个 jail）

新增 3 个：`jingyu-shield`（444≥5/5min → 封 1 天）、`jingyu-ratelimit`（429≥30/2min → 1h）、`jingyu-login`（登录 401≥8/10min → 2h）；保留原有 sshd / sshd-ddos / recidive / nginx-limit-req / nginx-404scan / nginx-badreq。

### 顺带修掉的应用层漏洞（nginx 层可解的部分）

1. **XFF 伪造**：`$proxy_add_x_forwarded_for` → `$remote_addr`（4 处）
   - 实测：带 `X-Forwarded-For: 10.9.9.x` 连打 12 次登录，第 7 次开始出现 429 → 应用层限流恢复
2. **软 404**：`try_files ... /index.html` → `=404`，扫描器行为可被计数封禁
3. **/ws 日志泄露**：`access_log off`（`?token=` 不再落盘）+ `conn_ws 8`
4. **/api/img 放大器**：独立 location，`img_limit 20r/m` + `conn_big 2` + 15s 超时
5. **/api/healthz 信息泄露**：只允许 127.0.0.1/::1（同时修好 `jingyu-status` 的探测）
6. **上传目录 XSS 载体**：加 CSP `sandbox`，html/svg 传上来也无法以同源身份执行脚本
7. **robots.txt**：原来不存在（软 404），补上并屏蔽 /api /uploads /admin

## 3. 自动化

| 组件 | 作用 |
|---|---|
| `jingyu-defense` | `status/on/off/ban/unban/list/test/watch`，每次改动先备份，改完 `nginx -t`，失败自动回滚 |
| `jingyu-attack-watch` | 实时面板（rps / 429 / 444 / 5xx / 热点 IP），`--auto` 连续 3 窗口超阈值自动切档、静默 18 窗口自动回落 |
| `jingyu-defense-guard.timer` | **每 2 分钟**巡检 access.log 增量；444≥30 或 429≥200 → 邮件告警 + 自动切 ATTACK 档 |
| `jingyu-integrity` | 基线从 71 → **93 个文件**，本次新增的 nginx/fail2ban/脚本全部纳入 |

实测告警链路：制造 40 个 444 → guard 判定 `444=40` → 邮件发出（QQ 邮箱收件成功）→ 自动切 ATTACK 档 → 手动回落 normal。

## 4. 验证（全部实测，可复现）

```
GET /                       200      GET /api/feed?limit=3      200
GET /index.html             200      GET /api/forums           200
GET /healthz                200      GET /whale/index.html     200
GET /api/healthz            200      GET /robots.txt           200
GET /admin/                 200      GET /nonexistent-xyz      404（原 200）
GET /assets/                403      GET /.git/config          000（444）

UA: sqlmap/1.7                     → 000
?slug=1' union select 1            → 000
?q=<script>alert(1)</script>       → 000
?slug=1' and sleep(5)#             → 000
?x=1 into outfile '/tmp/a'         → 000
/whale/../../etc/passwd            → 000
?x=jndi:ldap://a.b/c               → 000

正常含关键词不误伤：/api/forums?q=union → 200、?q=or → 200
限流：60 连发 GET / → 48×200 + 12×429；ATTACK 档 20 连发 → 6×200 + 14×429
响应头：HSTS / CSP(3 sha256) / X-Frame-Options / Referrer-Policy / Permissions-Policy / COOP 全部保留
TLS：TLSv1.3 / TLS_AES_256_GCM_SHA384
```

## 5. 还没解决的（需要改代码，不在本次窗口内动）

| 级别 | 问题 | 现状缓解 |
|---|---|---|
| P0 | `/ws` 不校验 sessions 表（logout 后旧 JWT 仍可收私信）、接受 `?token=` | `access_log off` + `conn_ws 8`；**需改 chat.js** |
| P1 | `/api/img` SSRF（DNS 重绑定 TOCTOU）、缓存无总量上限 | `img_limit 20r/m` + `conn_big 2` |
| P1 | lockout 邮箱锁定 DoS（8 次错密码钉 6h） | 无 nginx 解法，需改 `lockout.js` |
| P1 | `/upload/local` 无配额 | `wr_limit` 12r/m 兜底 |
| P2 | 会员后台 `adminOnly` 旁路 RBAC | 需改 `admin-membership.js` |
| P2 | 前端 14 处 `innerHTML`、repo/homepage 不校验 scheme | CSP 兜住脚本执行，仍需前端改 `textContent` |

SQL 注入、IDOR、JWT/会话双检、OAuth state、上传 key 形状、gif2webp 命令注入、systemd 收敛、支付金额——审计确认**干净**，群友往这些方向打是白打。

## 6. 作战手册

完整操作见 `/opt/jingyu-defense/README.md`（209 行）：常用命令、攻击期标准动作、规则清单、fail2ban 表、三级回滚、自检脚本、**ATTACK 档不能长开的警告**。

## 7. 回滚

- 只回落档位：`sudo jingyu-defense off`
- 回滚 nginx 到加固前：`/var/backups/jingyu-defense/pre-20261029-183952/`
- 每次 `on/off/ban` 的配置快照：`/var/backups/jingyu-defense/<时间戳>/`
- 原始文件同时留存在仓库 `defense/orig/`


---

## 六、应用层审计结论（appaudit，只读通读 /var/www/jingyu/server）

审计规模：Fastify 4 + better-sqlite3，全部路由/中间件/auth.js/db-guards.sql 读完，DB 只读连接。

**总体判断：核心鉴权（JWT+sessions 双检、对象级归属校验、参数化 SQL）是扎实的，没有一条「直接拿数据/拿后台」的高危洞。** 真正可打的是「限流可绕 + WS 通道 + 上传配额 + 图片代理」四个方向。

| 编号 | 问题 | 等级 | 处置 |
|---|---|---|---|
| H1 | `trustProxy: true` + nginx `$proxy_add_x_forwarded_for` → 任意伪造 XFF 重置全站按 IP 限流（撞库/短信轰炸/批量注册/刷举报） | 高 | **已在 nginx 侧堵死**：4 处 `X-Forwarded-For` 全部改为 `$remote_addr`，实测带假 XFF 打 12 次登录 = 6×401+6×429。代码侧建议后续把 `src/index.js:42` 改成 `trustProxy: '127.0.0.1'` 做纵深 |
| H2 | `/ws` 只验 JWT 签名、不查 sessions 与 users.status；且接受 `?token=` | 高 | **已修**：`src/routes/chat.js` 改为调用 `currentUser(req)`（与 HTTP 同源三道校验），不再接受 query token；nginx 侧 /ws 早已 `access_log off`。实测无 token → close 4401；服务重启后 /api/healthz 200 |
| M | `/api/img` 图片代理存在 SSRF 面 | 中 | nginx 侧已加 `img_limit 20r/m` + conn_big 2 + 15s 超时；代码侧仍需出网白名单/协议限制 |
| M | 邮箱锁定策略可被用来锁死他人账号（对已知邮箱连打 8 次） | 中 | 代码侧未改；nginx 侧 wr_limit 12r/m 已提高成本 |
| M | admin 成员管理缺少「不能移除最后一个管理员」保护 | 中 | 代码侧未改 |
| M | `/upload/local` 无用户配额 | 中 | 代码侧未改；nginx 8m body + wr_limit 已限速 |
| L | 前端存在 innerHTML 拼接点（靠 CSP 兜底） | 低 | CSP 三条 sha256 + 无 unsafe-inline 已生效 |
| L | 依赖链 4 个 critical 通告（条件触发） | 低 | 建议择期 `npm audit` + 升级 |

改动留档：`/var/www/jingyu/server/src/routes/chat.js.bak-20261029-1854xx`（原文件备份）。

---

## 七、18:56 状态快照

- 档位 normal；nginx active、`nginx -t` successful；jingyu.service active（18:54 重启一次，health 200）
- 完整性基线 93 文件「无变更」；guard timer active（2 分钟一跑）
- 页面：/ 200、/api/feed 200、/whale/index.html 200、/uploads 图片 200、/nope 404
- WS：无 token `close 4401`；HTTP/1.1 升级 101 正常（h2 下 curl 升级不支持属正常现象，浏览器走 h1.1）
- 攻击载荷：UA=sqlmap、union select、`<script>`、sleep()、into outfile、`../`、jndi:、`%2eenv`、`//.env`、`/server/.env`、`/x.PHP`、`/config.yml`、`/backup.zip` 全部 000
- 429 响应：`content-type: application/json` + `retry-after: 5`，body 与后端错误形状一致

## 八、防守方操作速查

```bash
sudo jingyu-defense status      # 看档位/连接数/工作进程
sudo jingyu-defense on          # 攻击中：切 ATTACK 档（连接 6、限速 1r/s）
sudo jingyu-defense off         # 攻击停止：回 NORMAL 档
sudo jingyu-defense ban 1.2.3.4 # 手工封 IP/CIDR（写 nginx geo 并 reload）
sudo jingyu-defense list        # 看当前封禁名单
sudo jingyu-attack-watch        # 实时看 rps / 444 / 429 / TOP IP
systemctl status jingyu-defense-guard.timer   # 自动告警+自动切档是否在跑
tail -f /var/log/jingyu-defense.log
```

**ATTACK 档不要长开**：1r/s + 6 连接会让正常用户明显卡顿，攻击停止后 18 个窗口（约 36 分钟）guard 会自动切回，也可以手动 `off`。


---

## 九、应用层代码级修复（18:58，已上线并重启验证）

> 全部先备份原文件（`<file>.bak-20261029-1858xx`），`node --check` 通过后 `systemctl restart jingyu`，实测无中断（健康检查 200）。

| # | 文件 | 改动 | 验证 |
|---|---|---|---|
| 1 | `src/index.js` | `trustProxy: true` → `'127.0.0.1'`（只信任本机 nginx 一跳） | 带伪造 `X-Forwarded-For: 10.9.9.x` 连打 15 次登录：6×401 + 9×429，伪造头不再换桶 |
| 2 | `src/routes/admin-membership.js` | `adminOnly` 由站点侧 `isAdmin()`（level≥15 或 badge='版主'）改为 `requirePermission('dashboard.view')`（后台 RBAC 会话） | 未登录 401；版主徽章不再能看订单/导 CSV/手动开会员 |
| 3 | `src/routes/upload.js` | 加 `rateLimit 20/min`；新增单用户配额 200MB / 1000 张（`dirUsage` 递归统计 `uploads/u/<id>`）；写盘前 `statfsSync` 检查余量 <2GB 返回 507 | 路由加载正常；未登录仍 401/404 |
| 4 | `src/routes/chat.js` | 单连接 10 秒 40 帧上限（超限 `close 4429`）；发私信前校验收件人存在且未禁用 | 无 token 连接仍 `close 4401` |
| 5 | `src/img-proxy.js` | ① **DNS 钉死**：`http/https.request` 的 `lookup` 只返回已校验的公网地址，彻底消掉「校验后又改解析」的 TOCTOU 重绑定；② 缓存总量 512MB 上限，超了按 mtime 删到 80% | `?u=http://127.0.0.1:3000/api/healthz` → 403、`localhost` → 403、`169.254.169.254` → 被 nginx 444；正常 GitHub raw 图 → 200；imgcache 22M |

环境变量可调（写进 `/var/www/jingyu/server/.env` 即可，不必改代码）：`UPLOAD_USER_QUOTA_BYTES`、`UPLOAD_USER_QUOTA_FILES`、`UPLOAD_DISK_RESERVE_BYTES`、`IMG_CACHE_BUDGET`。

**清理**：probe 留下的测试账号 `id=13 demoqa.qf1kfw@jingyu.local` 已置 `status='disabled'` 并清空其会话，测试 PNG 已删除（`uploads/u/13` 现有 0 个文件）。

## 十、18:59 终态

- nginx active / `nginx -t` successful / 档位 normal / 完整性基线 93 文件一致 / guard timer active
- jingyu.service active（18:58 重启），`/api/healthz` 200
- 首页 200、`/api/feed` 200、`/api/img` 正常图 200、SSRF 尝试 403/444
- 登录限流按真实 IP 生效（6×401 → 429），XFF 伪造无效
- WS 无 token → `close 4401`
