# 鲸域 · 防御作战手册（seekbbs.cn）

> 2026-10-29 建立。面向「群友攻击测试」这一窗口期，目标是在不动业务代码的前提下，
> 把**扫描/注入/爆破/CC/慢连接**挡在 nginx 层，把异常 IP 交给 fail2ban 长期封禁，
> 并且随时可以一键收紧、一键回滚。

## 0. 现在是什么状态

| 项 | 值 |
|---|---|
| 防护档位 | `normal`（`/etc/jingyu-defense.mode`） |
| 自动守卫 | `jingyu-defense-guard.timer`，每 2 分钟巡检一次 |
| 站点 | https://seekbbs.cn → 43.142.153.74（腾讯云轻量，Ubuntu 22.04） |
| 后端 | Fastify 127.0.0.1:3000（`jingyu.service`） |
| 封禁层 | ① nginx `geo $blocked_ip` 403 ② fail2ban 8 个 jail（iptables） |

三层拦截的分工：

1. **静态规则层**（`/etc/nginx/conf.d/10-shield.conf`）：UA 黑名单、URI 注入特征、IP 黑名单、各类限流 zone 定义。命中即 `444`（不响应，扫描器拿不到任何信息）或 `403`。
2. **限流/连接层**（`snippets/shield-mode.conf` + 各 location）：按 IP 的请求速率、并发连接数。超限返回 `429`。
3. **封禁层**（fail2ban）：444/429/登录 401 反复命中 → iptables 全端口封禁 1 天。

## 1. 常用命令（全部要 sudo）

```bash
sudo jingyu-defense status        # 一屏看完：档位/连接数/封禁名单/fail2ban 战果/近 5 分钟流量
sudo jingyu-defense on            # 切高压档（ATTACK）：全局 1r/s、并发 6、location 内再收紧
sudo jingyu-defense off           # 切回正常档（NORMAL）
sudo jingyu-defense ban 1.2.3.4   # 封单个 IP（也支持 CIDR），立即生效，返回 403
sudo jingyu-defense unban 1.2.3.4 # 解封
sudo jingyu-defense list          # 列出 nginx 层的封禁名单
sudo jingyu-defense test          # 切换前先干跑 nginx -t + 一次自检请求
sudo jingyu-attack-watch          # 实时监控面板（10s 一屏：rps / 429 / 444 / 5xx / 热点 IP）
sudo jingyu-attack-watch --auto   # 自动巡航：连续 3 窗口 rps 超阈值自动切 ATTACK，静默 18 窗口自动切回
```

每次 `on/off/ban/unban` 都会先把当前配置备份到 `/var/backups/jingyu-defense/<时间戳>/`，
然后写入新配置 → `nginx -t` → 失败**自动回滚并 reload**。日志在 `/var/log/jingyu-defense.log`。

## 2. 攻击期标准动作（按顺序做）

**T+0 发现异常**（群里说开始打了 / 收到 guard 告警邮件 / 站点变慢）

```bash
sudo jingyu-defense status          # 先看 429/444 计数和热点 IP
sudo jingyu-attack-watch --once     # 看这一小段时间的 rps 与来源分布
```

**T+1 判断类型**

| 现象 | 判定 | 处置 |
|---|---|---|
| 444 暴涨、UA 是 sqlmap/nuclei 之类 | 工具扫描 | 通常已被挡，观察即可；IP 频繁换则开 `--auto` |
| 429 暴涨、单 IP 或少量 IP | CC / 压测 | `jingyu-defense on` + 对头部 IP `ban` |
| 5xx 暴涨、rps 不高 | 后端被打穿（慢查询/出网阻塞） | 查 `journalctl -u jingyu -n 100`，必要时 `jingyu-defense on` 降并发 |
| 登录接口大量 401 | 撞库 | 已由 `jingyu-login` jail 封 2h；确认 `wr_limit` 生效 |
| 大量 499 + 长连接 | 慢连接 / 拖死 keepalive | 已有 `client_header_timeout 10s`、`keepalive_requests 300`；必要时 `on` |

**T+2 收紧**

```bash
sudo jingyu-defense on
sudo jingyu-defense ban <头部 IP>          # 多个就多执行几次
sudo jingyu-attack-watch --auto &          # 让它自己盯着，别一直手搓
```

**T+3 攻击结束**

```bash
sudo jingyu-defense off        # 回正常档，否则真实用户会被 1r/s 卡到（尤其首页带几十个静态资源）
sudo jingyu-defense list       # 看还封着谁，误封的解掉
sudo jingyu-defense status
```

> ATTACK 档是**全局 1r/s**，正常浏览一个页面会并发几十个请求，长时间开着会误伤真实用户。
> 只在被压期间开，压过去 10~30 分钟就该切回来。

## 3. 规则清单（改之前先读这里，避免自伤）

### UA 黑名单（命中 444）
`sqlmap nikto nuclei nmap masscan zgrab gobuster dirsearch ffuf wfuzz hydra medusa ncrack
acunetix netsparker nessus openvas w3af commix arachni xray dirbuster whatweb brutespray
censys shodan zmap rustscan naabu katana subfinder feroxbuster jaeles wpscan joomscan
droopescan ysoserial metasploit msfconsole pocsuite goby fscan vulmap`

### URI 注入特征（命中 444）
`union select` / `information_schema` / `sleep(` `benchmark(` `load_file(` `extractvalue(` `updatexml(` /
`into outfile` / `' or 1` `' and 1` / `<script` `<img` `<svg` `onerror=` `onload=` `javascript:` /
`../` `%2e%2e` `%252e%252e` / `/etc/passwd` `win.ini` `boot.ini` `/proc/self/environ` /
`jndi:ldap` `jndi:rmi` `jndi:dns` / `169.254.169.254` `metadata.google.internal` `100.100.100.200`

> **关键坑**：`$request_uri` 是**未解码**的原始串，规则必须同时写原文和百分号编码两种形态，
> 只写 `union\s+select` 会被 `%20` 绕过（第一版就栽在这）。

### 限流 zone
| zone | 速率 | 用在哪 |
|---|---|---|
| `site_burst` | 10r/s，burst 120 | 全局（NORMAL 档） |
| `site_burst_strict` | 1r/s，burst 10 | 全局（ATTACK 档）+ 各 location（ATTACK 档） |
| `html_limit` | 3r/s，burst 40 | `location /` 页面 |
| `api_limit` | 30r/s | `/api/`、`/ws`、`/api/plugins/`、`/api/img` |
| `bigfile_limit` | 8r/s | `/assets/` `/uploads/` `/whale/` |
| `wr_limit` | 12r/m | 只算写操作：登录/注册/发短信/上传/发帖/评论/发主题 |
| `readme_limit` | 6r/m | `GET /api/plugins/:id/readme`（会出网抓 GitHub，是放大器） |
| `img_limit` | 20r/m | `/api/img`（服务端抓外链并落盘，是 SSRF + 磁盘填充放大器） |

### 连接数 zone
`conn_all`（全局 24 / ATTACK 6）、`conn_big`（大文件 8~12）、`conn_ws`（WebSocket 8）

## 4. fail2ban

| jail | 触发 | 封禁 |
|---|---|---|
| `sshd` | SSH 密码错 3 次/10min | 24h |
| `sshd-ddos` | SSH 连接风暴 | 1h |
| `recidive` | 反复被任何 jail 封 | 1 周 |
| `nginx-limit-req` | error.log 里 `limiting requests` 10 次/60s | 1h |
| `nginx-404scan` | 404 达 20 次/60s | 6h |
| `nginx-badreq` | 400 类坏请求 1 次/300s | 1d |
| `jingyu-shield` | 444 达 5 次/300s | 1d（**扫描器主战场**） |
| `jingyu-ratelimit` | 429 达 30 次/120s | 1h |
| `jingyu-login` | 登录 401 达 8 次/600s | 2h |

查：`sudo fail2ban-client status` / `sudo fail2ban-client status jingyu-shield`
手工解：`sudo fail2ban-client set jingyu-shield unbanip 1.2.3.4`

## 5. 回滚

三个层级，按需要选：

1. **只回落档位**：`sudo jingyu-defense off`
2. **回滚到本次加固之前**（整站 nginx 配置）：
   ```bash
   sudo cp /var/backups/jingyu-defense/pre-20261029-183952/jingyu-443.conf /etc/nginx/sites-available/
   sudo cp /var/backups/jingyu-defense/pre-20261029-183952/jingyu-80.conf  /etc/nginx/sites-available/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   （原件同时留在仓库 `defense/orig/`）
3. **彻底卸载防护层**：
   ```bash
   sudo rm /etc/nginx/conf.d/10-shield.conf
   sudo cp /etc/nginx/sites-available/jingyu-443.conf{,.bak}   # 先留一份
   # 用 orig/ 里的原件覆盖两个站点配置，去掉 include shield-mode.conf 与相关 if
   sudo rm /etc/fail2ban/jail.d/99-jingyu-hardening.conf /etc/fail2ban/filter.d/jingyu-*.conf
   sudo systemctl disable --now jingyu-defense-guard.timer
   sudo nginx -t && sudo systemctl reload nginx && sudo systemctl reload fail2ban
   ```

## 6. 自检（改完必跑）

```bash
R="--resolve seekbbs.cn:443:127.0.0.1"
curl -s -o /dev/null -w '%{http_code}\n' $R https://seekbbs.cn/                       # 200
curl -s -o /dev/null -w '%{http_code}\n' $R https://seekbbs.cn/api/feed?limit=3       # 200
curl -s -o /dev/null -w '%{http_code}\n' $R https://seekbbs.cn/api/forums?q=union     # 200（单词不误伤）
curl -s -o /dev/null -w '%{http_code}\n' $R https://seekbbs.cn/admin/                 # 200
curl -s -o /dev/null -w '%{http_code}\n' $R 'https://seekbbs.cn/?q=%3Cscript%3E'      # 000（被 444）
curl -s -o /dev/null -w '%{http_code}\n' $R 'https://seekbbs.cn/api/forums?slug=1%27%20union%20select%201'  # 000
curl -s -o /dev/null -w '%{http_code}\n' -A sqlmap/1.7 $R https://seekbbs.cn/         # 000
```

响应头必须仍然是：`strict-transport-security`、`x-content-type-options`、`x-frame-options`、
`referrer-policy`、`permissions-policy`、`cross-origin-opener-policy`、`content-security-policy`。
（**坑**：location 里只要出现一条 `add_header`，父级所有 add_header 全部失效，
所以每个 location 都必须显式 `include /etc/nginx/snippets/security-headers.conf`。）

## 7. 已知限制 / 还没修的应用层问题

nginx 层能挡「扫描 + 明显的注入串 + 爆破频率 + 并发」，挡不住伪装成正常请求的逻辑攻击。
源码审计（`app-audit.md`）已确认以下问题需要改代码，**不在本次窗口内动**：

| 级别 | 问题 | 现状缓解 |
|---|---|---|
| P0 | ~~全站 IP 限流可绕（trustProxy + XFF 透传）~~ | **已修**：nginx 改为 `X-Forwarded-For $remote_addr`（2026-10-29 18:42），实测伪造 XFF 后仍按真实 IP 计数 |
| P0 | `/ws` 不校验 sessions 表、接受 `?token=` | 已 `access_log off`（token 不落盘）+ `conn_ws 8`；**代码仍需改** |
| P1 | `/api/img` SSRF（DNS 重绑定 TOCTOU）+ 无总配额 | `img_limit 20r/m` + `conn_big 2` |
| P1 | lockout 邮箱锁定 DoS（8 次错密码钉 6h） | 无 nginx 解法，需改 `lockout.js` |
| P1 | `/upload/local` 无配额 | `wr_limit` 12r/m 兜底 |
| P2 | 会员后台 `adminOnly` 旁路 RBAC | 需改 `admin-membership.js` |
| P2 | 前端 14 处 `innerHTML`、repo/homepage 不校验 scheme | CSP 兜住脚本执行，仍需前端改 `textContent` |

## 8. 文件地图

```
/etc/nginx/conf.d/10-shield.conf            # UA/URI 规则、geo 黑名单、所有 zone 定义
/etc/nginx/conf.d/00-limit-req.conf         # 原有 api_limit + server_tokens off
/etc/nginx/snippets/shield-mode.conf        # 档位（由 jingyu-defense 切换）
/etc/nginx/snippets/shield-strict-loc.conf  # location 级档位（同上）
/etc/nginx/blocked_ips.conf                 # nginx 层 IP 黑名单（<ip> 1;）
/etc/nginx/sites-available/jingyu-443.conf  # 主站（已加超时组、限流、注入拦截）
/etc/nginx/sites-available/jingyu-80.conf   # 80 跳转 + ACME
/etc/fail2ban/jail.d/99-jingyu-hardening.conf
/etc/fail2ban/filter.d/jingyu-{shield,ratelimit,login}.conf
/usr/local/sbin/jingyu-defense              # 控制台（on/off/status/ban/unban/list/test/watch）
/usr/local/sbin/jingyu-attack-watch         # 实时监控
/usr/local/sbin/jingyu-defense-guard        # 2 分钟巡检（timer 拉起）
/etc/systemd/system/jingyu-defense-guard.{service,timer}
/var/log/jingyu-defense.log                 # 所有防护动作日志
/var/backups/jingyu-defense/                # 每次改动前的快照
```

## 9. 顺手记下的运维事实

- `jingyu-alert.py` 的正确调用是 `echo 正文 | jingyu-alert.py --subject "主题" --key <key>`，
  不带 `--subject` 会被当成参数错误（本脚本 2026-10-29 已改）。
- 监控首轮必须从 `access.log` **当前文件末尾**起算，否则会把整份历史当成一个窗口，报出几百 rps 的假峰值。
- `mawk` 没有 `strftime`/`mktime`，时间串要用 `-v ts="$(date '+%H:%M:%S')"` 传进 awk。
- 新增/修改了受完整性监控的文件后，要 `sudo /usr/local/sbin/jingyu-integrity.sh --init` 重建基线，
  否则第二天 00:15 的巡检会报一堆「被篡改」。


## 10. 2026-10-29 18:53 追加（外部演练发现的问题，已修）

| 问题 | 修法 | 验证 |
|---|---|---|
| `/%2eenv`、`//.env`、`/server/.env` 只 404 不 444 | 新增 `map $bad_dot`（对 `$request_uri` 做 `%2e/%2f` 归一化匹配）与 `map $bad_ext`（对 `$uri` 匹配 `.php/.zip/.sql/.bak/.yml/.sh` 等 + `/server/`） | 试探路径全部 000；`/api/forums?q=.env` 仍 200 不误伤 |
| 429 是 nginx 默认 HTML，无 `Retry-After` | `error_page 429 = @rate_limited`，返回与 Fastify 同形状的 JSON + `Retry-After: 5` | 实测 `content-type: application/json`、`retry-after: 5` |
| `/api/healthz` 泄露 DB 路径 / uptime | 只允许 127.0.0.1 / ::1（80 与 443 都加） | 外部 403，本地 200，`jingyu-status` 恢复正常 |
| 服务器自身公网 IP 43.142.153.74 被封 | `ignoreip` 追加该 IP + 解除封禁 | `fail2ban-client status nginx-badreq` 不再列出 |
| TLS 全局仍允许 TLS1.0/1.1 + CBC | `nginx.conf`：`ssl_protocols TLSv1.2 TLSv1.3`、只留 ECDHE+AESGCM/CHACHA20、`ssl_stapling on`、`ssl_trusted_certificate chain.pem` | `openssl s_client` 只协商 TLS1.3，OCSP 正常 |
| `/uploads/…png` 403（上传图看不到） | `chmod -R a+rX uploads` + `UMask=0022`（新文件 644） | 上传样本 200 |

> 注意：`UMask` 改动要等 `jingyu.service` 下次重启才对新文件生效；旧文件已用 chmod 修好。
