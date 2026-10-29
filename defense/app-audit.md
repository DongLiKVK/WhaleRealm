# 鲸域后端只读安全审计（app-audit）

- 审计对象：`43.142.153.74:/var/www/jingyu/server`（Fastify 4 + better-sqlite3 + @fastify/jwt/cookie/websocket/rate-limit）
- 访问方式：仅 `ssh ubuntu` 只读；DB 用 `readonly:true` 连接；未改任何文件、未重启服务、未写库
- 审计时间：2026-10-29 18:3x–19:0x（Asia/Shanghai）
- 站点：https://seekbbs.cn （nginx → 127.0.0.1:3000，node 以 jingyu 用户运行）

## 一句话结论

**核心鉴权/会话/对象级授权写得比多数同规模 C 端项目扎实，当前没有一条「直接拿数据或拿后台」的高危洞；真正能打的是限流整体失效——`trustProxy: true` 叠加 nginx `$proxy_add_x_forwarded_for`，任意请求用 `X-Forwarded-For` 头即可把全站按 IP 的限流、锁定取证、举报频控全部重置，可放大成撞库 / 短信轰炸 / 批量注册 / 刷帖；其次 `/ws` 独立于 sessions 表做鉴权（注销与禁用对它无效）且允许 `?token=` 落访问日志；再其次是依赖链 4 个 critical 通告（多为条件触发，需实测）。**

一句话给群友：**别花时间找 SQL 注入和 IDOR，那里是干净的；从「限流可绕 + WS 通道 + 上传配额 + 图片代理」四个方向打。**

---

## 高危（CVSS 粗评 7.0–8.5）

### H1 · 全站 IP 限流可被 `X-Forwarded-For` 伪造绕过（CVSS ~7.5，可利用性最高）

- 位置：`src/index.js:42` + `/etc/nginx/sites-available/jingyu-443.conf:82` 与 `:95`
- 代码：
  ```js
  // src/index.js:35-43
  const fastify = Fastify({
    logger: {...},
    bodyLimit: 1048576,
    trustProxy: true          // ← 无条件信任任何 X-Forwarded-For
  });
  ```
  ```nginx
  # jingyu-443.conf:80-83（/api/）与 :94-96（/ws）
  proxy_set_header X-Real-IP       $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # 保留客户端自带值并追加
  ```
- 机制：`$proxy_add_x_forwarded_for` = `客户端自带 XFF + ", " + $remote_addr`。Fastify 在 `trustProxy: true` 下取 XFF 最左值作为 `req.ip`，即完全由攻击者决定。@fastify/rate-limit 默认 keyGenerator 就是 `req.ip`，所以每个请求换一个假 IP 就是一个新桶。
- 攻击者能做什么：
  1. `/api/auth/login` 10 次/10 分钟的 IP 限制失效 → 撞库只受账号锁定（8 次/15 分钟/邮箱）约束，多邮箱字典可无限打；
  2. `/api/auth/register` 注册频控失效 → 批量注册（发帖/私信/举报刷量前置）；
  3. `/api/auth/phone/send` 5 次/10 分钟失效 → **对任意手机号刷短信**（真实资费，属费用型 DoS），只受「号码已绑他人 409」限制；
  4. `/api/reports` 5 次/10 分钟失效 → 举报队列灌水；`/api/upload/sign` 30 次/分钟失效；
  5. 副作用：`auth_fails.last_ip` 与所有限流日志记录的是伪造 IP，事后取证/封禁全部失真（nginx access.log 里仍是真实 `$remote_addr`，可对账）。
- 复现（只读验证，不改任何东西）：
  ```bash
  for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' \
    -H "X-Forwarded-For: 10.9.9.$i" -H 'Content-Type: application/json' \
    -d '{"email":"probe$i@example.com","password":"x"}' \
    https://seekbbs.cn/api/auth/login; done
  # 期望（漏洞存在）：全程 401/400，不出现 429
  ```
- 修法（两处必须同时改，只改一边会把所有人算成 127.0.0.1）：
  ```nginx
  # nginx：丢弃客户端自称的 XFF，只写真实对端
  proxy_set_header X-Forwarded-For $remote_addr;
  ```
  ```js
  // src/index.js:42
  trustProxy: '127.0.0.1',   // 只信任本机反代这一跳
  ```
- 优先级：**P0，开打前必修**。

### H2 · `/ws` 鉴权绕过会话撤销 + token 进访问日志（CVSS ~7.1）

- 位置：`src/routes/chat.js:53-71`
- 代码：
  ```js
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    let user = null;
    try {
      const token = (req.cookies && req.cookies.jingyu_token) || req.query.token;  // :57
      if (token) {
        const payload = req.server.jwt.verify(token);                              // :59 只验签
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);     // :60 不回表查 sessions
      }
    } catch { user = null; }
  ```
- 问题三条：
  1. **不走 `sessions` 表**：HTTP 侧 `currentUser()` 每请求校验 `sessions.token_hash`、`expires_at`、`users.status`（`src/auth.js:433-451`），WS 侧一项都不查 → `/api/auth/logout` 删掉 sessions 行后，旧 token 仍能连 WS 收发私信；管理员把账号设 `disabled` 后，该账号仍能通过 WS 收发；
  2. **`req.query.token`**：完整 JWT 落在 nginx `access.log` 的请求行里（也落在任何上游/CDN 日志、Referer、浏览器历史），拿到日志即拿到会话（7 天有效）；
  3. WS 建连不做任何 user 状态过滤（`SELECT * FROM users` 无 `status` 条件）。
- 攻击者能做什么：拿到一枚旧 token（日志、共享设备、XSS 残留）即可在账号被注销/禁用后继续读发私信；`/ws` 无 CORS 保护，配合 H1 无频率约束可当长连接池打资源。
- 修法：
  ```js
  // 1) auth.js 导出一个 WS 可用的会话校验（复用现有逻辑，别另写一套）
  function sessionUserFromToken(token) {
    let payload; try { payload = fastify.jwt.verify(token); } catch { return null; }
    if (!payload || payload.scope === 'admin') return null;      // 后台 token 不许连用户 WS
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(payload.sid);
    if (!row || row.expires_at <= now() || row.user_id !== payload.uid) return null;
    if (!safeEqual(sha256(token), row.token_hash)) return null;  // timingSafeEqual
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    return u && u.status !== 'disabled' ? u : null;
  }
  // 2) /ws 只接受一次性 ticket，不再接受 ?token=
  //    POST /api/ws-ticket (requireAuth) → { ticket } 60s 过期、单次使用、内存 Map
  //    GET /ws?ticket=xxx → 消费 ticket 换 uid
  ```
- 优先级：**P0，开打前必修**（改动小、收益直接）。

---

## 中危（CVSS 粗评 4.0–6.9）

### M1 · 账号锁定可被用来锁别人（DoS），且注释里声称的缓解措施不存在（CVSS ~5.3）

- 位置：`src/lockout.js:74-95`（计数与锁定）、`src/lockout.js:11-16`（注释）
- 代码：
  ```js
  if (fails >= MAX_FAILS) {                                   // MAX_FAILS = 8, WINDOW = 900s
    const lockCount = prevLocks + 1;
    const span = Math.min(BASE_LOCK * Math.pow(2, lockCount - 1), MAX_LOCK);  // 600s → 至多 21600s
    const lockedUntil = ts + span;
    STMT.put.run(email, 0, ts, ts, lockedUntil, lockCount, ...);
  ```
- 机制：15 分钟内 8 次错密码即锁；每次再触发把 `lock_count+1`，跨度 10 分钟 ×2^(n-1)，封顶 6 小时。持续打可把任意已知邮箱长期钉在 6 小时档（锁定期间新失败不重置，但解锁瞬间再打 8 次即可续锁）。
- 攻击者能做什么：知道邮箱（站点公开资料/发帖页就有）即可让目标账号无法用密码登录（OAuth 与已登录会话不受影响）；配合 H1 无限速，成本几乎为零。属于「骚扰/敲打」而非拿号。
- 注释漂移（要写进报告，别让群友误判）：`lockout.js:14` 写「nginx 侧还有一层 401 计数 jail，真正在打的 IP 会被 iptables 封掉」，但 `/usr/local/bin` 只有 `frps`、`jingyu-backup-uploads.sh`、`jingyu-tunnel-probe.sh`、`tat_agent`，**该 jail 不存在**，也没有 fail2ban 在跑。
- 修法：锁定改为「指数退避 + 只对同 IP 段累计」或引入验证码；至少把 `MAX_FAILS` 提到 20、把 `lock_count` 的翻倍上限压到 1 小时，并在 `/api/auth/login` 返回中区分「密码错」与「已锁定」的计数口径（当前已区分，但等于告诉攻击者打成功了）。
- 优先级：P2（体验/骚扰面）。

### M2 · 开放图片代理 `/api/img` = SSRF（TOCTOU）+ 无界磁盘缓存（CVSS ~6.5）

- 位置：`src/routes/img.js:63-68`、`src/img-proxy.js:106-146`、缓存目录 `/var/www/jingyu/server/data/imgcache`
- 代码：
  ```js
  // img.js:63-68 —— 无鉴权，rateLimit 600/min（可被 H1 绕过）
  fastify.get('/img', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = String(req.query.u || '');
    ...
  ```
  ```js
  // img-proxy.js:106-146 —— 只拦 IP 字面量与内网段，允许任意公网域名
  async function hostResolvesPublic(host) {
    const addrs = await dns.promises.lookup(host, { all: true });
    for (const a of addrs) if (isPrivate(a.address)) return false;
    return true;
  }
  // 之后 fetch(url) 会再解析一次 DNS
  ```
- 攻击者能做什么：
  1. **TOCTOU SSRF**：注册一个域名，第一次解析返回公网 IP 通过 `hostResolvesPublic`，随后把 DNS 改成 `127.0.0.1`/`169.254.169.254`，`fetch` 二次解析即命中内网（可打 `127.0.0.1:3000` 自身、`127.0.0.1:8899` python、`127.0.0.1:3999` node、云元数据）。回包被 `nosniff + CSP sandbox` 包裹，盲打为主，但可做端口/路径探测（状态码/大小/耗时差异）；
  2. **磁盘耗尽**：每个 URL 最多 8MB 落盘、缓存 7 天、URL 数量无上限、无总量配额 → 46G 可用空间可在数十分钟内写满（当前 imgcache 仅 22M，属「可被撑爆」未发生）。写满后 SQLite WAL 与上传同时失败 = 站点级 DoS；
  3. 免费图床/流量放大（配合 H1 无限速）。
- 修法：
  ```js
  // ① 只允许白名单主机（本项目实际只有 GitHub 的 README 配图）
  const ALLOW = new Set(['raw.githubusercontent.com','avatars.githubusercontent.com','camo.githubusercontent.com']);
  if (!ALLOW.has(new URL(u).hostname)) return reply.code(400).send(...);
  // ② 关掉重定向跟随（fetch 默认 follow，会绕过 host 校验）
  //    fetch(u, { redirect: 'manual' })，或对每一跳重新校验
  // ③ 用 undici 的 lookup 钩子把「校验用的解析结果」直接喂给连接，消灭 TOCTOU
  //    new Agent({ connect: { lookup: (h, o, cb) => cb(null, pinnedAddr, family) } })
  // ④ 缓存加总量上限（如 512MB）+ LRU 淘汰，或按天 cron 清理
  ```
- 优先级：P1。

### M3 · `/ws` 无消息频率/大小/并发限制，`msg.to` 不校验用户（CVSS ~5.0）

- 位置：`src/routes/chat.js:81-125`
- 代码：
  ```js
  if (msg.type === 'msg' && msg.to) {
    const toId = Number(msg.to);
    const body = String(msg.body || '').trim().slice(0, 2000);   // 单帧最多写 2000 字
    db.prepare('INSERT INTO messages (from_user, to_user, body, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, toId, body, ts);                             // toId 不校验存在性
  }
  if (msg.type === 'broadcast') {                                // 向所有在线用户广播 500 字
    broadcast({ type: 'broadcast', data: { from: publicUser(user), body } }, user.id);
  }
  if (msg.type === 'typing' && msg.to) sendTo(Number(msg.to), {...});  // 可对任意 uid 伪造
  ```
- 攻击者能做什么：单个连接每秒数百帧 → DB 无限 INSERT（WAL 膨胀、磁盘）、向所有在线用户刷屏（`broadcast` 无节流）、对任意 uid 发 typing/私信灌水（收件人不存在也照样写库）。私信表没有 per-user 配额。
- 修法：每连接令牌桶（如 20 msg/10s、broadcast 1/30s、单帧 >8KB 直接 close 1009）；`msg.to` 先 `SELECT 1 FROM users WHERE id=?`；`messages` 加「同 from_user 每分钟 ≤ 60」的应用层闸门；广播只允许 level≥某阈值。
- 优先级：P1。

### M4 · 服务端零转义 + 前端 `innerHTML` 拼接：HTML 注入面，目前只靠 CSP 兜住（CVSS ~5.4，取决于前端）

- 位置：全库 `grep -c 'escape|sanitize'` = **0 命中**（`src/` 无任何服务端转义）；前端 `/var/www/jingyu/dist/assets/app.8181bd0b.js` 有 14 处 `innerHTML` / 2 处 `insertAdjacentHTML` 赋值，其中包含把服务端字段拼进 HTML 的写法：
  ```js
  t.innerHTML = '<span>' + (icon || '✅') + '</span>';      // icon 来自 plugins.icon（用户可提交，slice(0,8)）
  tip.innerHTML = pubNameOk(cleaned);                       // 用户名/昵称
  ```
- 机制：`posts.text`、`comments.text`、`users.name`、`users.sig`、`plugins.desc/icon` 全部原样入库（`src/db-guards.sql` 只管长度），前端若用 `innerHTML` 渲染即为存储型 XSS。当前唯一的拦截是 CSP：`/etc/nginx/snippets/security-headers.conf` 的 `script-src 'self' 'sha256-...'×3`，没有 `unsafe-inline` → 内联 `<script>`、`onerror=`、`javascript:` 全部被浏览器拒绝；`/uploads/` 只接受真图片 + `nosniff`，也无法构造同源脚本。
- 结论：**能注入 HTML，不能执行脚本**（除非 CSP 被放松或出现 CSP 绕过链）。属「一颗螺丝松了但还没掉」。
- 另：`src/routes/forums.js:588-589` 的 `repo`/`homepage` 只做 `slice(0,200)`，**不校验 scheme**，`javascript:alert(1)` / `data:text/html,...` 可入库；前端若直接写进 `href` 就是二阶注入点（同样被 CSP 拦）。
- 修法：① 前端统一 `textContent`/`escapeHtml()` 后再拼，或引 DOMPurify（注意项目「零依赖」原则，手写 6 行转义即可）；② 服务端对 `repo`/`homepage` 做 `^https?://` 白名单；③ CSP 现状保持，别为「方便」加 `unsafe-inline`。
- 优先级：P1（前端修复）+ P3（服务端防御性转义）。

### M5 · 会员后台用 `isAdmin` 旁路，绕过 RBAC（CVSS ~5.0，越权）

- 位置：`src/routes/admin-membership.js:29-36`
- 代码：
  ```js
  // 本站侧管理员即可，不走后台 admin_accounts/RBAC
  async function adminOnly(req, reply) {
    await requireAuth(req, reply);
    if (!req.user || !isAdmin(req.user)) return fail(reply, 403, 'FORBIDDEN', ...);
  }
  ```
- 对比：其余 `admin-*` 全部用 `admin-guard.js` 的 `requirePermission('xxx.yyy')`（`:555-565`，`adminCan()` `:537-540`）。`isAdmin()` = `level >= 15 || badge === '版主'`（`src/auth.js:486-488`，取自 DB，不可由 JWT 伪造）。
- 攻击者能做什么：任何被授予「版主」badge 的站点用户（社区运营常见角色）都能调用 `/api/admin/membership/*`：看会员 KPI、订单列表、导出 CSV（含用户标识与金额）、手动开通会员（`/orders/:no/grant`）、改价。从「社区版主」越权到「会员运营」。
- 修法：把 `adminOnly` 替换为 `requirePermission('membership.view')` / `('membership.order')` / `('membership.plan')`，并在 `admin_roles` 给 owner/admin 补权限位；站点侧 `isAdmin` 只用于内容审核。
- 优先级：P1（权限模型一致性）。

### M6 · `/api/upload/local` 无速率限制、无配额（CVSS ~5.3，磁盘 DoS）

- 位置：`src/routes/upload.js:301`
- 代码：
  ```js
  fastify.post('/upload/local', { preHandler: requireAuth }, async (req, reply) => {
    ... // 对比 /upload/sign 有 rateLimit 30/min（:224-226），这里一个都没有
    fs.writeFileSync(dest, finalBuf);   // :359
  ```
- 已确认的安全部分（**不用再找**）：`IMG_KEY_RE`（`:159`）形状 + `ownsKey()`（`:174`）归属双校验，`path.join(LOCAL_DIR, finalKey)` 无法 `..` 穿越、无法覆盖别人文件；`sniffImage()` 校验 PNG IHDR / JPEG SOF / GIF87a|89a / RIFF+WEBP（`:301-326`）；大小 ≤5MB（`:315`）。
- 攻击者能做什么：一个刚注册的账号即可循环上传 5MB 图片，把 46G 可用空间写满（`uploads` 目前 56K）；写满后 SQLite 写入与 gif2webp 临时文件同时失败 → 站点不可写。gif2webp 有并发闸门，不会先被打崩。
- 修法：加 `config: { rateLimit: { max: 20, timeWindow: '1 minute' } }`；按用户统计当日字节（`SELECT SUM(file_size) FROM post_images WHERE user_id=? AND created_at>?` 或 Redis-less 的内存计数）超 50MB 拒；`/var/www/jingyu/uploads` 单独挂载/配额（或 cron 清理 30 天未引用的 key）。
- 优先级：P1。

### M7 · 短信验证码可被刷（依赖 H1）（CVSS ~5.0，费用型 DoS）

- 位置：`src/routes/phone.js:110-168`
- 代码：
  ```js
  fastify.post('/send', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } }   // 按 req.ip → 被 H1 绕过
  }, async (req, reply) => { ... sms.send(phone, code) ... });
  ```
- 验证码本身写得扎实（不用找）：6 位 `crypto.randomInt`（`:96-98`）、事务内先删旧码再插新码（`:83-87`）、`timingSafeEqual` 比码（`:90-93`）、`tries >= CODE_TRIES` 即删行（`:189-239`）、号码已绑他人 409、`/state` 只回打码号。
- 攻击者能做什么：注册一个账号 + XFF 轮换 → 对任意未绑定号码狂发短信，费用由 YG 承担，并可用于骚扰第三方号码（投诉/封号风险）。当前 `SMS_DEV=0`，需确认 `SMS_PROVIDER` 真实通道是否启用（若仍是 dev 回显则不成立）。
- 修法：H1 修好后此条自动收敛；再加「同号码 60s 冷却 + 同号码 24h ≤5 条 + 同账号 24h ≤10 条」，并在通道侧设日预算告警。
- 优先级：P1（随 H1 一起修）。

---

## 低危 / 加固建议（CVSS < 4.0）

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| `src/index.js:121-129` | `/api/healthz` 回 `db: DB_PATH`（绝对路径）与 `cos: !!...` 布尔 | 只回 `{status, uptime}`；细节挪到 `/healthz`（仅本机 127.0.0.1 的 nginx 白名单） |
| `src/index.js:50` | `JWT_SECRET` 缺失时回退 `'dev-only-insecure-secret-change-me'` | 启动时 `if (!process.env.JWT_SECRET) throw`，禁止回退 |
| `src/auth.js:316-319` | 头像允许任意 `^https?://`（≤500） | 只允许本站 uploads 形状或 `avatars.githubusercontent.com`；否则依赖 CSP 白名单才不裂图/不追踪 |
| `src/auth.js:61` | `JWT_EXPIRES` 默认 604800s（7 天），且无 refresh/短时票 | 用户侧降到 24h + 滑动续期；WS 改一次性 ticket（见 H2） |
| `src/routes/chat.js:57` | token 可走 query → nginx `access.log` 记全 token | 已并入 H2；另建议 nginx `log_format` 里对 `/ws` 打码查询串 |
| `src/db-guards.sql:65-75` | 只护 `level BETWEEN 0 AND 100`，未禁止直接写 `badge='版主'` 或 `level=100` | 加 `guard_users_badge_upd`：非白名单值拒绝；`level` 变更写 `admin_logs`（当前无 SQLi 时不可达，属兜底） |
| `/var/www/jingyu/dist` | 站点根属主 `ubuntu:ubuntu`，其中 `robots.txt` 属主 `www-data`、mtime `2026-10-29 18:39`（本次审计未写任何文件，疑为队友/部署脚本所为，需 YG 确认） | 部署产物统一 `root:www-data 644`、目录 `755`；`ubuntu` 只做部署不持有站点根写权；顺便查一下 18:39 那次写入是谁 |
| `src/routes/reports.js:55` | 举报接口未登录可提交（设计如此），仅 IP 限流 | 加图形验证码或要求登录；保留匿名通道时对 `body` 做长度/URL 数量上限 |
| 全站 | 无 CSRF token，仅靠 `SameSite=Lax` + CORS 同源回显 | Lax 已能挡跨站 POST；若将来加 GET 写操作就破功，保持「写操作只 POST」并在文档里写死 |
| nginx `00-limit-req.conf` | 定义了 `limit_req_zone api_limit 30r/s`，但两个站点配置**没有任何 `limit_req` 引用** | 见「开打期间临时缓解」第 1 条，直接用上 |

---

## 依赖链（CVSS 粗评 6.0–8.0，条件触发）

- `package.json` 实际：`fastify ^4.28.1`、`@fastify/jwt ^8.0.1`（→ `fast-jwt`）、`@fastify/cookie ^9.3.1`、`@fastify/rate-limit ^9.1.0`、`@fastify/websocket ^10.0.1`、`better-sqlite3 ^12.11.1`、`bcryptjs ^2.4.3`、`cos-nodejs-sdk-v5 ^2.14.6`、`qrcode-generator ^1.4.4`。
- `npm audit --omit=dev --json` 汇总：**14 vulnerabilities (8 moderate, 2 high, 4 critical)**。
- critical 集中在 `fast-jwt <= 6.3.3`：`iss` 校验缺失、`crit` 头处理、RSA 公钥算法混淆（CVE-2023-48223）、`cacheKeyBuilder` 冲突返回他人 claims、空密钥接受无签名 JWT、`clockTolerance: Infinity`、JSON 数组 payload 绕过 claim 校验；另 `fast-xml-parser`/`form-data` 挂在 `cos-nodejs-sdk-v5` 链上（本项目无 COS 凭据、走本地落盘，未触达）。
- 适用性判断（别让群友空打）：本项目 `@fastify/jwt` 只传 `secret`（`index.js:49-51`），算法必然是 HS*，RSA 混淆类不适用；secret 非空（64 hex），空密钥类不适用；未配置 `iss` 校验，`iss` 类不适用。**真正需要实测的是 `cacheKeyBuilder` 冲突**（若 token cache 生效，可能出现 A 的 token 被当成 B 的 claims）与 `fastify` 的两条 high（`Content-Type: application/json\t` 绕过 body 校验、`X-Forwarded-Proto/Host` 伪造——后者本项目全库无用 `req.protocol/host`，无落点）。
- 修法：`@fastify/jwt` 升到 10.x（配 `fast-jwt >= 6.4`）、`fastify` 升 5.x，均为 breaking，建议开打窗口结束后做，别在窗口期动。

---

## 「群友开打前必须修」（≤5）

1. **H1 XFF 限流失效**：nginx `proxy_set_header X-Forwarded-For $remote_addr;` + `src/index.js:42` 改 `trustProxy: '127.0.0.1'`（两处同改，改完 `systemctl restart jingyu` + `nginx -s reload`，再按上面的 curl 循环验一次应出现 429）。
2. **H2 `/ws` 鉴权**：改为「JWT → sessions.token_hash 比对 + expires_at + users.status」三查（复用 `auth.js` 的 findSession 逻辑），去掉 `req.query.token`，改一次性 ticket；顺手加每连接令牌桶。
3. **nginx 限流真正生效**：把已定义的 `api_limit` 挂到 `/api/`，另建 `auth_limit 6r/m` 挂 `= /api/auth/login`、`= /api/auth/register`、`= /api/auth/phone/send`，`limit_conn` 挂 `/ws`。
4. **上传/缓存配额**：`/upload/local` 加 `rateLimit 20/min` + 每用户 50MB/日；`imgcache` 加 512MB 总量上限 + LRU/定时清理；`/api/img` 主机白名单（实际只需 GitHub 三个域）。
5. **M5 会员后台**：`admin-membership` 的 `adminOnly` 换成 `requirePermission('membership.*')`，站点侧 `isAdmin` 不再能进会员后台。

（第 6 条，窗口期后做：依赖升级 `@fastify/jwt` 10.x / `fastify` 5.x。）

---

## 「开打期间可临时缓解」（只改 nginx / 环境变量，不动业务代码）

1. **限流兜底（最快见效）**：
   ```nginx
   # 放在 server{} 里、location /api/ 之前
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;   # 已存在于 conf.d
   limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=6r/m;
   limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;

   location = /api/auth/login    { limit_req zone=auth_limit burst=3 nodelay; proxy_pass http://127.0.0.1:3000; ...同 /api/ 的 proxy_set_header... }
   location = /api/auth/register { limit_req zone=auth_limit burst=3 nodelay; proxy_pass http://127.0.0.1:3000; ... }
   location = /api/auth/phone/send { limit_req zone=auth_limit burst=2 nodelay; proxy_pass http://127.0.0.1:3000; ... }
   location /api/ { limit_req zone=api_limit burst=60 nodelay; limit_conn conn_per_ip 30; ... }
   location /ws   { limit_conn conn_per_ip 8; ... }
   ```
   注意：`location =` 必须写在 `location /api/` **之前**（精确匹配优先级本就更高，但同级顺序别写反），且这几个精确 location 要重复 `/api/` 里的 proxy 头，否则 `Host`/XFF 丢失。
2. **图片代理直接掐掉**：`location = /api/img { return 503; }`（README 配图会裂，但立刻消掉 SSRF + 磁盘写入两个面）。若不能掐，至少 `limit_req zone=api_limit burst=5`。
3. **上传口临时收窄**：`location = /api/upload/local { return 403; }`（本地降级链路，关掉只影响发图；COS 未配置时等于全站不能发图，评估后决定），或 `client_max_body_size 1m` 临时降到 1m。
4. **别单独关 `trustProxy`**：如果只把 `trustProxy` 改掉而 nginx 仍发 `$proxy_add_x_forwarded_for`，所有人会被算成 `127.0.0.1`，一处超限全站 429 → **自伤**。要么两处同改，要么先只改 nginx 头（这一步本身就足以让 Fastify 拿到真实 IP）。
5. **短信口先关**：`SMS_PROVIDER` 置空/`SMS_DEV=1` 重启（发码只回显不真发），或通道侧把日预算压到最低；`PHONE` 绑定是新功能，停一天影响可控。
6. **监控对账**：`tail -f /var/log/nginx/access.log` 里出现「`X-Forwarded-For` 有两个 IP」「`/ws?token=`」「同一真实 IP 高频 401」即为正在被打；`du -sh /var/www/jingyu/server/data/imgcache /var/www/jingyu/uploads` 每 5 分钟看一眼，涨得离谱就执行第 2/3 条。
7. **保持**：`MEMBERSHIP_SANDBOX=0`、`SMS_DEV=0`、`NODE_ENV=production` 不要为了「方便测试」改——沙箱一开等于全员免费会员。

---

## 附：已验证「干净」的清单（省得群友白打）

- **SQL 注入：无。** 全库 `db.prepare()` 无字符串拼接进 SQL（`ORDER BY`/`LIMIT` 全走白名单：`admin-guard.js:221-256` 的 `orderBy()`/`paging()`、`admin-rewards.js:77` 固定字面量）；`auth.js:326` 的 `'UPDATE users SET ' + sets.join(', ')` 列名来自代码常量，值全参数化；`LIKE` 统一走 `likeEscape()` + `ESCAPE`（`admin-guard.js:229-237`、`forums.js:318`）。
- **JWT：** `alg` 不可伪造（未传 `algorithms`，密钥为对称 hex → 只能 HS*）；HTTP 侧只认 cookie 或 `Authorization: Bearer`（`auth.js:422-427`），无 `?token=`；每请求回表校验 `token_hash`（`timingSafeEqual`）、`expires_at`、`user_id`、`status`（`auth.js:433-451`）；`isAdmin` 取自 DB 非 JWT。
- **对象级授权（IDOR）：无。** `DELETE /api/posts/:id`（`posts.js:182-192`）、`DELETE /api/comments/:id`（`comments.js:53-66`）校验 `row.user_id === req.user.id || isAdmin`；`GET /api/messages`/`:uid` 的 SQL 自带 `from_user/to_user = req.user.id`（`chat.js:147-176/217-245`）；会员订单三个入口都校验 `order.user_id`（`membership.js:791-848`）。
- **上传写盘：** key 形状 + 归属双校验、`sniffImage` 验真、`path.join` 无穿越、无法覆盖他人文件（`upload.js:159/174/301-375`）。
- **后台：** 独立 `admin_accounts` + RBAC + TOTP（防同码重放的条件更新 `admin-auth.js:424-427`）、`admin_sessions` 校验 sha256(token) 与 `amr` 必须含 totp（`admin-guard.js:462-509`）、登录失败锁定 + DUMMY_HASH 防枚举（`admin-auth.js:248/263-277`）。
- **OAuth：** `state` cookie 绑定 provider + 回调 `sameStr` 比对（`oauth.js:311-320`），已登录者不允许换号（`:274/:309`），占位邮箱不可注册（`:245-247`）。
- **命令注入：** `gif2webp.js:71-85` 用 `execFile` 不过 shell，输入路径服务端生成；`readme-fetch.js:96-97` 主机名写死 `raw.githubusercontent.com`/`api.github.com`。
- **主机侧：** systemd `ProtectSystem=strict`/`ProtectHome`/`PrivateTmp`/`NoNewPrivileges`/`UMask=0027`/`ReadWritePaths` 收敛到位；`.env` 600、`data/` 700、DB 640；CSP 强（3 条 sha256 + `object-src none` + `frame-ancestors self`）、HSTS/nosniff/COOP 齐；80→443 全跳转。
- **支付链：** 金额只取 `plan.price_cents`、沙箱当前关闭（env 0 + 库 `sandbox=0` + `NODE_ENV=production`）、`report-paid` 只写备注不改状态。

---

## 复现与验证记录

- H1：见上文 curl 循环（只读，未产生有效登录）；另 `curl -H 'X-Forwarded-For: 1.2.3.4' https://seekbbs.cn/api/healthz` 后对照 nginx access.log 可确认 Fastify 取的是头里的值（日志里是真实 IP，两者不一致即证）。
- H2：用任意账号登录拿 cookie → `POST /api/auth/logout` → 带同一 token 连 `wss://seekbbs.cn/ws?token=<token>`，仍收到 `hello` 即为绕过（需真账号，建议自建测试号）。
- M2：`curl 'https://seekbbs.cn/api/img?u=http://127.0.0.1:3000/healthz'`（预期被 host 校验拦，返回 400；用自控域名 + 改 DNS 才能打通，属需授权环境的实测项）。
- 数据库只读核对用的连接方式：`sudo -n -u jingyu /usr/bin/node -e "const D=require('better-sqlite3');const d=new D('/var/www/jingyu/server/data/jingyu.db',{readonly:true});..."`（全程只 SELECT）。

---

*本报告为只读审计产物：未修改服务器任何文件、未重启服务、未写入数据库；DB 查询一律 `readonly:true`。*
