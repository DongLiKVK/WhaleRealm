# 线上故障诊断与修复报告 · 鲸域（43.142.153.74）

- 诊断时间：2026-10-21 12:5x（CST）
- 目标：`/var/www/jingyu`（dist + Fastify 后端）+ nginx 80/443
- 结论：**站点主体健康，访问已恢复正常**；造成「打不开」的是 443 端口的死胡同默认站点。共发现 7 项问题，已修 5 项，3 项待决策。

---

## 一、TL;DR

HTTP（80）这条链路**从头到尾是好的**：`/` 200、`/healthz` ok、`/api/healthz` 200、`/api/feed` 有数据、7 个静态资源 200 且字节数与源码一致、无头 Chrome 渲染正常出首屏。

真正让访问者看到「异常 / 打不开」的是**另一条链路**：443 上的 `default_server` 配了 `return 404 "not found"` + 私有 CA 自签证书。现代浏览器默认 HTTPS-First，输入裸 IP 会先打 https → 要么被证书拦下，要么点「继续」后收到一行 not found。

此外还有 5 个真实缺陷（限流被绕过、上传目录缺安全头、web 根目录属主漂移、隧道偶发 502、历史 500 已自愈），全部已修或已定性。

---

## 二、根因与修复（逐项）

### R1 · 443 默认站点把整站变成 404 —— 【严重｜已修】

- **症状**：`https://43.142.153.74/` 返回 `HTTP/2 404`，body 只有 `not found`（10 字节）；curl 校验证书报 `SSL certificate problem: unable to get local issuer certificate`。
- **根因**：`/etc/nginx/sites-available/jingyu-443.conf`
  - `listen 443 ssl http2 default_server;` —— 抢占了整个 443
  - `location / { return 404 "not found\\n"; }` —— 除 DSH 隧道路径外一律 404
  - 证书 `/etc/nginx/dsh-tls/server-cert.pem`：subject `CN=43.142.153.74, O=lc-phone`，issuer `CN=DSH Relay CA, O=lc-phone`（私有 CA 自签），有效期 2026-10-20 → 2036-10-17。裸 IP 无法申请公信证书，浏览器必然弹证书错误。
- **修复**：把 `location /` 的 404 改成回跳 HTTP：

```nginx
# 无公网可信证书（裸 IP 无法签发），HTTPS 只能作为 DSH 隧道入口。
# 除隧道路径外一律 301 回 HTTP，避免浏览器 HTTPS-First 落到死胡同 404。
location / {
    return 301 http://$host$request_uri;
}
```

- **验证**：`https://43.142.153.74/` → `301` → `http://43.142.153.74/` → 200；`https://…/api/healthz` → `301 http://43.142.153.74/api/healthz`。隧道 `/a4f41d8f5c00/` 不受影响。
- **备注**：彻底解决需要域名 + ACME，见「四、待你决策」。

### R2 · /api 限流形同虚设（XFF 可伪造 + 限错对象）—— 【严重｜已修】

- **根因一**：`jingyu-80.conf` 的 `location /api/` 用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，而 `server/src/index.js:42` 是 `trustProxy: true` → Fastify 直接采信最左 XFF，**客户端自带一个 `X-Forwarded-For: 1.2.3.4` 就能让 `req.ip` 变成 1.2.3.4**，`@fastify/rate-limit` 按伪造 IP 计数 = 每个请求换个 IP 即无限刷。
- **根因二**：`limit_req zone=api_limit burst=20 nodelay` 原本挂在静态 `location /` 上（限的是 HTML / 图片），真正的写接口 `/api/` 反而**完全不限流** —— 限错了对象。
- **修复**：XFF 改为单跳真值 `$remote_addr`；`limit_req` 从 `location /` 移到 `location /api/`。
- **验证**：`nginx -t` ok，reload 后 `/api/healthz` 200、首页 200；伪造 `X-Forwarded-For` 的请求不再影响后端取到的 IP。

### R3 · 上传目录永远是空的（不是服务端坏，是链路没人调）—— 【中等｜已补强】

- **现象**：`/var/www/jingyu/uploads/` 0 个文件，`post_images` 表 0 行，`/uploads/x` 404。
- **实测**：服务端链路**完全正常** —— `POST /api/upload/sign` → 200（`local:true`），`POST /api/upload/local?key=…` → 200（67B PNG 落盘），`GET /uploads/u/2026/10/…png` → `200 image/png 67`。所以图片 404 的根因是**前端从未调用上传接口**（`js/app.js` 的图片选择只存在内存 / localStorage），与审查报告 B1（前端假认证）同源。
- **顺带修掉的真问题**：`location /uploads/` 有自己的 `add_header`，按 nginx 规则**父级 `include security-headers.conf` 不再继承** → 用户上传内容缺失 `X-Content-Type-Options: nosniff`，可被 MIME 嗅探当 HTML 执行，等于给上传功能留了一条同源 XSS 通道（与审查报告 P0-1 的存储型 XSS 属同一类风险面）。
- **修复**：`/uploads/` 显式 `include /etc/nginx/snippets/security-headers.conf;` + `Content-Disposition: inline`，目录属主归位 `jingyu:jingyu 775`。
- **验证**：响应头已带 `X-Content-Type-Options: nosniff` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`。

### R4 · web 根目录属主漂移 —— 【中等｜已修】

- **根因**：`/var/www/jingyu/dist` 与 `dist/assets` 是 `ubuntu:ubuntu 755`（部署时用 ubuntu 账号跑的 build）。nginx 读得到、站点正常，但**会 SSH 登录的普通账号直接拥有站点根目录写权限** = 该账号一旦被撞库 / 密钥泄漏，攻击者可直接改 HTML / JS 挂马，且不留服务端日志痕迹。
- **修复**：`chown -R root:root /var/www/jingyu/dist` + `chmod -R a+rX`（对照技能档案的 root:root a+rX 基线）。
- **验证**：`drwxr-xr-x root root`；静态资源仍 200。

### R5 · DSH 隧道偶发 502 —— 【轻微｜已定性，未改】

- **现象**：`error.log` 里 4 条 `connect() failed (111) while connecting to upstream … /a4f41d8f5c00/health → http://127.0.0.1:7100/`。
- **根因**：`/etc/nginx/snippets/dsh-tunnel.conf` 被 80 与 443 双双 include，上游 `127.0.0.1:7100` 是 `sshd` 的远程端口转发监听（`ssh -R`，当前 `sshd: ubuntu` PID 642161）。隧道客户端一断线，sshd 的 listener 仍在但不再转发 → 111。**这是隧道客户端掉线的必然表现，不是 nginx 配错**，与 jingyu 站点无耦合。
- **来自哪里**：其中 3 次客户端是 `111.31.187.43`（你自己的出口 IP），时间 03:37 / 03:45 / 03:53 —— 即当时你在远端用 DSH Web UI 连不上。
- **现状**：`http://127.0.0.1/a4f41d8f5c00/health` 现在 200，隧道是通的。
- **根治建议**：隧道用 `autossh` / systemd unit 常驻 + `ServerAliveInterval`，nginx 侧保留 `proxy_next_upstream off` 并加失败页。

### R6 · 历史 500 已自愈，当前零错误 —— 【信息】

- `Oct 20 19:41:49`（pid 413439）：`TypeError: reply.code is not a function at Object.requireAuth (/var/www/jingyu/server/src/auth.js:71:18)`，连发 7 次。
- `Oct 20 19:49:52`（pid 415761）：`TypeError: Cannot read properties of undefined (reading 'readyState') at sendTo (/var/www/jingyu/server/src/routes/chat.js:31:11)` ← `@fastify/websocket` 10.x 的 handler 签名从 `(conn, req)` 改为 `(socket, req)` 导致的旧写法崩溃。
- `Oct 20 19:52:40` 起为当前进程 420013，`journalctl -u jingyu` 里 level 50 计数 **0**；线上源码已是正确写法（`async function requireAuth(req, reply)`、`(socket, req)` + ws 10.0.1）。**判定：重启前的历史故障，已随代码修正消失。**

### R7 · 排查过程产生的污染已清理 —— 【信息】

- 用 demo1 账号真实发帖 2 条（`[诊断] 上线健康探针`，id 9 / 10）验证写链路，已从生产库删除。`posts` 回到 5 条种子数据（id 1–5），`comments` 8 条未动。

---

## 三、健康基线（修复后实测）

| 检查项 | 结果 |
| --- | --- |
| `http://43.142.153.74/` | 200，5835 B |
| `/healthz` | 200 ok |
| `/api/healthz` | 200 status ok / cos false |
| `/api/feed` | 200，有数据 |
| `/assets/app.74fbf7b1.js` | 200（253910 B，与源码一致） |
| `/assets/app.fedf7b14.css` | 200（168592 B） |
| `/uploads/…png` | 200 image/png + nosniff |
| `https://43.142.153.74/` | 301 → http（原 404） |
| `nginx -t` / reload | ok |
| `systemctl is-active nginx jingyu` | active / active |
| `journalctl -u jingyu` level ≥ 50 | 0（自 19:52:40 起） |
| DB integrity | ok；users 8 / posts 5 / comments 8 / forums 6 / threads 5 / plugins 9 |
| 无头 Chrome 渲染 | 正常出首屏，无 JS 报错 |
| fail2ban 四 jail | 0 banned |

---

## 四、待你决策（我没动）

1. **域名 + 证书**：裸 IP 申请不到公信证书，HTTPS 现在只是「点继续还能用」。要真正的 https + 绿锁，需要一个解析到 43.142.153.74 的域名，然后 `certbot --nginx` 自动签发续期。有了域名，R1 可升级成真正的 TLS 站点。
2. **COS 四项全空**（`COS_SECRET_ID / KEY / BUCKET / CDN_DOMAIN`）：图片现在落本机磁盘，实测可用，但**无备份、换机即丢**。要么配 COS，要么把 `/var/www/jingyu/uploads` 纳入定期备份。
3. **前端仍未接真登录**（审查报告 B1 级）：`js/app.js` 的登录 / 注册只写 localStorage，`API.login/register/me` 全仓零调用。证据：`sessions` 表在我手动 curl 登录之前是 **0 行** —— 上线以来没有任何一次真实登录。「看起来正常、实际没接上」的最大一处。

---

## 五、回滚

改动前的配置全部留了备份，回滚只需 `cp` 回去 + `nginx -t && systemctl reload nginx`：

```
/etc/nginx/sites-available/jingyu-443.conf.bak-20261021-125738
/etc/nginx/sites-available/jingyu-80.conf.bak-20261021-125738
/etc/nginx/sites-available/jingyu-80.conf.bak2-20261021-1258xx   （uploads 安全头那一次）
```

本次改动**不涉及**代码、依赖、环境变量、数据库结构；Fastify 进程全程未重启。
