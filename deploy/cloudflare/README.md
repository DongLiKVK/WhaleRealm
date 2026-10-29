# Cloudflare 橙云接入（whalerealm.top）

生产机：158.247.215.153（Vultr，Ubuntu 22.04，nginx 1.18，Node 22）
DNS 现状：DNSPod（alcohol.dnspod.net / coat.dnspod.net），A @ 与 www 均直连源站
证书现状：Let's Encrypt，SAN 覆盖 whalerealm.top 与 www.whalerealm.top，有效期至 2027-01-22

## 一、开通顺序

1. Cloudflare 控制台 Add a site → 输入 whalerealm.top → 选 Free。
2. 核对自动扫描出的记录（没有 MX，不需要迁移邮箱）：
   - A    @    158.247.215.153   Proxied（橙云）
   - CNAME www  whalerealm.top    Proxied（橙云）
   - 其它指向旧 IP 的 A/AAAA 一律删除。
3. 记下 Cloudflare 分配的两个 NS（形如 xxx.ns.cloudflare.com）。
4. 到域名注册商（腾讯云/阿里云）把 DNS 服务器改成这两个 NS。
   DNSPod 原解析先别删，保留 72 小时便于回退。
5. 等 Cloudflare 概览页变成 Active（通常 5 分钟–2 小时）。
6. SSL/TLS → Overview → **Full (strict)**。
   Edge Certificates：Always Use HTTPS、Automatic HTTPS Rewrites、HSTS（先 6 个月，不要 preload）、Minimum TLS 1.2、TLS 1.3。
7. Speed：Brotli、HTTP/3、0-RTT、Early Hints 开；Rocket Loader 关。

## 二、缓存规则（Caching → Cache Rules）

| 优先级 | 表达式 | 动作 |
| --- | --- | --- |
| 1 | `starts_with(http.request.uri.path, "/api/")` | Bypass cache |
| 2 | `starts_with(http.request.uri.path, "/admin")` | Bypass cache |
| 3 | `starts_with(http.request.uri.path, "/assets/")` | Eligible，Edge TTL 1 年，Browser TTL 1 年 |
| 4 | `starts_with(http.request.uri.path, "/uploads/")` | Eligible，Edge TTL 30 天，Browser TTL 7 天 |

HTML 默认不缓存，保持现状。

## 三、WAF 与限速

- Security Level：Medium；Bot Fight Mode：开。
- Managed Rules：开 Cloudflare 托管规则集。
- 自定义规则：`starts_with(http.request.uri.path, "/admin")` → Managed Challenge（把自己的出口 IP 加 Skip）。
- 限速规则（免费版 1 条）：登录接口 10 次/分钟，超限 Block 10 分钟：
  `(starts_with(http.request.uri.path, "/api/auth/login") or starts_with(http.request.uri.path, "/api/admin/auth/login"))`

## 四、源站锁死（关键）

橙云只隐藏 IP，不锁源站。必须让源站只接受 Cloudflare 回源，否则攻击者拿历史 IP 直连就绕过了 WAF。

```bash
sudo ./cf-nginx-sync.sh --apply
```

脚本会写入：

- `/etc/nginx/snippets/cloudflare-realip.conf`
- `/etc/nginx/snippets/cloudflare-allow.conf`

然后在 nginx 配置里引用：

```nginx
http {
    include /etc/nginx/snippets/cloudflare-realip.conf;
}

server {
    listen 443 ssl http2;
    server_name whalerealm.top www.whalerealm.top;

    include /etc/nginx/snippets/cloudflare-allow.conf;

    # 证书续期必须直连，放在 deny all 之前放行
    location ^~ /.well-known/acme-challenge/ {
        allow all;
        root /var/www/certbot;
    }
}
```

> 先确认 Cloudflare 已 Active 再 apply。脚本会探测 cf-ray，没有就中止。

### fail2ban 必须加白

nginx 日志经 real_ip 后是真实访客 IP，但 fail2ban 仍可能误封 Cloudflare 边缘节点。把 CF 段加入 `/etc/fail2ban/jail.local` 的 `ignoreip`，或在 `nginx-req-limit` jail 里单独 ignore。

## 五、证书续期

Let's Encrypt HTTP-01 校验服务器是**直连源站 80**，不经过 Cloudflare。两种做法：

1. 保留上面的 `/.well-known/acme-challenge/` 放行 location（最简单）。
2. 改用 DNS-01：`certbot-dns-cloudflare` + API Token，彻底不依赖 80 端口，也不会被 WAF 拦。

## 六、回退

- 最快：Cloudflare DNS 记录点灰云（DNS only），立即恢复直连，但源站 IP 暴露。
- 彻底：注册商把 NS 改回 alcohol.dnspod.net / coat.dnspod.net。

## 七、加速预期（重要）

- 静态资源从边缘命中后，重复访问明显变快；首字节在未命中缓存时要回源，不会比现在快多少。
- 免费版大陆通常落到香港/日本/美西节点，晚高峰可能抖动；先跑 3 天再决定是否长期保留。
- 真正的大陆加速需要 ICP 备案 + 国内 CDN（腾讯云 EdgeOne/CDN），或把源站搬到香港/新加坡；Cloudflare 中国网络是企业版 + 备案。
