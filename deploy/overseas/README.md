# 鲸域 · 境外部署（不备案路线）

> 这套文件和 `deploy/deploy.sh` 是并行的两条路，互不影响：
> `deploy/deploy.sh` 打的是大陆机（43.142.153.74，走腾讯云备案域名）；
> `deploy/overseas/` 打的是境外机（自己签证书，域名不需要 ICP 备案）。

## 为什么能绕开备案

ICP 备案管的是「**域名 + 大陆境内服务器**」这一对组合。备案系统要求接入商（腾讯云/阿里云）在
解析层面把关：未备案域名解析到大陆 IP，云厂商会在网络侧拦 80/443。

把服务器搬到境外（香港/新加坡/日本/美西），这条链路就不存在了 —— 没有接入商替你报关，
自然也就没有备案这个动作。**注意这不等于「不需要备案」，而是「备案制度不适用」**：
- 域名本身仍然是境内注册商买的（腾讯云/阿里云），实名是必须的，那个不是备案；
- 网站内容仍然受境内法律约束（你能被追责，只是没人提前拦你）；
- 想用微信支付/支付宝的**商户号**收款，仍然需要营业执照 —— 这条和服务器在哪无关。

## 目录

| 文件 | 作用 |
| --- | --- |
| `server-setup.sh` | 干净 Ubuntu 22.04/24.04 初始化：Node 20、nginx、certbot、swap、ufw、fail2ban |
| `deploy.sh` | 从本地一键发布：构建 → 传静态 → 传后端 → 写 .env → 装 nginx → 签证书 |
| `nginx.conf` | 单域名单站点模板（静态 + /api + /ws + /uploads + /whale） |
| `limit-req.conf` | 限流 zone（放 conf.d，因为 limit_req_zone 只能在 http 层） |
| `env.example` | 后端环境变量参考（实际由 `deploy.sh env` 生成，密钥随机） |

## 一次性步骤

```bash
# 1. 本地生成密钥对，上传公钥到新机器
ssh-keygen -t ed25519 -f ~/.ssh/overseas_ed25519 -C jingyu-overseas
ssh-copy-id -i ~/.ssh/overseas_ed25519.pub root@YOUR_HOST

# 2. 远端初始化
scp -i ~/.ssh/overseas_ed25519 deploy/overseas/server-setup.sh root@YOUR_HOST:/root/
ssh -i ~/.ssh/overseas_ed25519 root@YOUR_HOST 'bash /root/server-setup.sh'

# 3. 域名 A 记录指到机器 IP（先别开 Cloudflare 橙云，证书签完再开）

# 4. 全量发布（AFDIAN_URL 填你的爱发电主页，不填则该渠道置灰）
HOST=YOUR_HOST DOMAIN=your-domain.com KEY=~/.ssh/overseas_ed25519 \
  LE_EMAIL=you@mail.com AFDIAN_URL=https://ifdian.net/a/你的名字 \
  bash deploy/overseas/deploy.sh all

# 5. 之后日常
HOST=... DOMAIN=... KEY=... bash deploy/overseas/deploy.sh frontend   # 改前端
HOST=... DOMAIN=... KEY=... bash deploy/overseas/deploy.sh status     # 看状态
```

## 收钱这一步（爱发电）

境外服务器解决的是「网站能不能开」，不解决「用什么收款」。个人主体拿不到微信/支付宝商户号，
所以默认走爱发电外链：

| 渠道 | 怎么收 | 需要什么 | 开关 |
| --- | --- | --- | --- |
| 爱发电 | 用户跳到你的爱发电主页付款，留言填订单号，你在后台「会员 · 订单」补单 | 注册一个爱发电创作者账号 | `AFDIAN_URL=https://ifdian.net/a/xxx` |
| 扫码转账 | 用户扫固定收款码，备注订单号，同样后台补单 | 一张收款码图片 | 放好 `assets/pay/manual.png` 后设 `PAY_MANUAL_QR=1` |
| 微信/支付宝在线支付 | 回调直接开通 | **需要营业执照 + 商户号** | 需改代码接商户密钥，当前是 demo 桩 |

两个站外渠道都不会有回调，所以订单默认有效期是 3 天（`MEMBERSHIP_OFFSITE_TTL=259200`）——
爱发电那边用户常常隔天才付款，30 分钟太短。付款后用户点「我已完成付款」登记昵称，
你在后台核对到账再补单；**不做自动到账，避免「没付也被开通」**。

## 与大陆版的关键差异

| 项 | 大陆机（deploy/deploy.sh） | 境外机（deploy/overseas/） |
| --- | --- | --- |
| 证书 | 腾讯云免费证书手动上传 | certbot 自动签 + 自动续 |
| 图片存储 | 腾讯云 COS + CDN | 本地 `/uploads`，nginx 直接出 |
| 短信 | 阿里云/腾讯云短信 | 不可用，`SMS_PROVIDER=none` |
| 备案 | 必须 | 不需要 |
| 大陆访问速度 | 快 | 看线路，香港≈30-60ms，美西≈150-200ms |
| 计费 | 包年包月 | 多为按小时/按月，可随时换 |

## 几个必须知道的坑

**1. 证书签不下来，90% 是 Cloudflare 橙云**
橙云把 A 记录代理掉了，Let's Encrypt 来验证时打的是 Cloudflare 的 IP，验证文件找不到。
签发期间必须切成「仅 DNS」。签完再开橙云，顺手把 SSL 模式设成 Full (strict)。

**2. 别用 `http2 on;`**
这是 nginx 1.25.1+ 的语法，Ubuntu 22.04 带的是 1.18、24.04 是 1.24，写了直接
`unknown directive` 让 `nginx -t` 挂掉。模板里用的是 `listen 443 ssl http2`。

**3. 上传目录的属主**
`server-setup.sh` 把 `/var/www/jingyu` 全 chown 给 `jingyu`，但部署脚本是用 `sudo` 解包的，
解完必须 chown 回来，否则运行用户写不进 `/uploads`（发图 500）。

**4. 排除 `data/` 和 `uploads/`**
`deploy.sh` 的 tar 里显式 `--exclude='data' --exclude='uploads'`。这两个是线上的**生产数据**
（SQLite 库 + 用户上传的图）。不排除就会用本地演示库覆盖线上真实用户，而且不可恢复。
要搬数据用 `db-pull`（走 `sqlite3 .backup`，WAL 模式直接 cp 会丢事务）。

**5. CSP 哈希会随构建变**
`build.mjs` 把 index.html / whale/index.html 里每个内联 `<script>` 的 sha256 写进
`dist/csp-hashes.json`，`deploy.sh nginx` 读它生成 `script-src`。
页面改一个字符哈希就变 —— 忘同步的表现是**白屏或主题失效**，而构建是全绿的。

**6. nginx 的 add_header 不继承**
只要某个 `location` 里出现了任意 `add_header`，上级 server 块里的 `add_header` 就全部失效。
所以安全头必须是 snippet，每个 location 单独 include —— 模板里就是这么写的，别图省事挪到 server 块。

**7. better-sqlite3 要编译**
没预编译包的架构上要现场编译，需要 `build-essential` + `python3`（server-setup.sh 装了），
1G 内存的机器不加 swap 会 OOM 被杀。脚本里默认建 2G swap。

## 8. 2026-10-24 生产加固项（重装/重部署别丢）

生产机已做一轮加固，细节见 [docs/安全加固记录-20261024.md](../../docs/安全加固记录-20261024.md)。与本目录模板相关的部分：

- `deploy/overseas/nginx.conf` 已加 `listen 443 ssl http2` 与 `limit_conn conn_per_ip 20`
- `deploy/overseas/deploy.sh` 生成的安全头 snippet 已加 HSTS（max-age=15552000）
- 主配置 `/etc/nginx/nginx.conf` 的 `worker_connections 2048`、`server_tokens off`、`ssl_protocols TLSv1.2 TLSv1.3`、`limit_conn_zone`、慢速攻击超时**不在 deploy.sh 管理范围**，重装 nginx 后要手工补
- SSH 已改为仅密钥（`/etc/ssh/sshd_config.d/00-hardening.conf`），重装系统后先确认密钥可登录再关口令
- 数据库每日备份在 `/etc/cron.daily/jingyu-db-backup` → `/var/backups/jingyu`（14 天），重装时记得恢复这个脚本
- Node.js 已升到 22（NodeSource），重装时用 `setup_22.x`，再 `npm rebuild better-sqlite3`

## 成本参考（2026-10 价位，需自行核对当前价格）

| 项 | 档位 | 月成本 |
| --- | --- | --- |
| VPS 最低配 | 1C1G，香港/日本/美西 | ¥25–45（年付更低） |
| 域名 | .top/.xyz/.icu 首年 | ¥5–15/年 |
| 域名 | .com 常规 | ¥70–90/年 |
| 证书 | Let's Encrypt | ¥0 |
| 对象存储 | 先不用，本地盘 | ¥0 |
| **合计** | | **≈¥30–50/月** |

带宽是境外机真正的成本项：多数服务商给 500GB–1TB/月，超出后按流量计费。
鲸域首屏 gzip 后 422KB，107 段 webm 共约 60MB —— **视频是流量大头**，
真跑起来要么上 CDN，要么把 whale 那套挪到对象存储。
