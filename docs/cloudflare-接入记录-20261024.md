# Cloudflare 橙云接入记录（2026-10-24）

## 结论

whalerealm.top 已完成 NS 切换，Cloudflare 接管并生效；源站已配置真实 IP 回填，尚未锁回源白名单（等 DNS 缓存过期，避免少量运营商用户被 403）。

## 注册局与 NS

- 注册商：烟台帝思普（DNSPod / 腾讯云），域名 2026-10-24 注册，2027-10-24 到期。
- 原 NS：alcohol.dnspod.net、coat.dnspod.net。
- 新 NS：jason.ns.cloudflare.com、princess.ns.cloudflare.com。
- 2026-10-24 19:37 DNSPod 提交成功；19:37 注册局 .top 权威（b.zdnscloud.cn）已返回新 NS；19:40 1.1.1.1 与 223.5.5.5 均已更新。
- Cloudflare 权威直接查询返回代理 IP：104.21.47.240、172.67.174.139（@ 与 www 相同）。

## 线上验证

```text
GET https://whalerealm.top/        → 200，Server: cloudflare，CF-RAY: ...-SJC
GET https://whalerealm.top/admin/  → 200
/assets/app.004d3582.css           → 第一次 MISS，第二次 HIT，Age: 0
```

源站 nginx 访问日志已显示真实访客 IP（例如 111.31.187.43），不再是 Cloudflare 边缘 IP。

## 源站改动

备份目录：/root/sec-backup-cf-20261024-113907（jingyu.conf、jail.local）

1. 新增 /etc/nginx/snippets/cloudflare-realip.conf：
   - 20 条 set_real_ip_from（Cloudflare 官方 IPv4 + IPv6 段）
   - real_ip_header CF-Connecting-IP;
   - real_ip_recursive on;
2. /etc/nginx/sites-available/jingyu.conf 的 443 server 块 server_name 后新增：
   ```nginx
   include /etc/nginx/snippets/cloudflare-realip.conf;
   ```
3. 新增 /etc/fail2ban/jail.d/00-cloudflare.local：[DEFAULT] ignoreip 加入本机回环 + 全部 Cloudflare 段。
4. nginx -t 通过并 reload；fail2ban-client reload 成功。

## 还没做（有意延后）

- **回源白名单**：cloudflare-allow.conf（allow CF 段; deny all;）尚未启用。原因：旧 NS 的递归缓存最多 24–48 小时，现在锁会让仍解析到旧 NS 的用户拿到 403。等 24 小时后执行：
  ```bash
  /usr/local/sbin/cf-nginx-sync.sh --apply
  ```
  并在 443 server 块加 include /etc/nginx/snippets/cloudflare-allow.conf;，同时保留 /.well-known/acme-challenge/ 的 allow all;。
- **HSTS 去重**：源站已经发 HSTS；Cloudflare 控制台不要再开 HSTS，否则两条头。
- **证书续期**：HTTP-01 仍直连源站 80；加白名单前必须确认 ACME location 放行，或改用 DNS-01。
- **Cloudflare 控制台配置**：SSL/TLS 确认 Full (strict)；Speed 开 Brotli / HTTP/3 / 0-RTT / Early Hints；Rocket Loader 关；WAF 开托管规则 + /admin Managed Challenge + 登录接口限速。

## 回退

1. 最快：Cloudflare DNS 记录点灰云（DNS only），恢复直连。
2. 彻底：注册商把 NS 改回 alcohol.dnspod.net / coat.dnspod.net。
3. 源站：恢复备份目录里的 jingyu.conf 与 jail.local，删除 cloudflare-realip.conf 与 00-cloudflare.local，nginx -t && reload。

## 已知现象

- 接入后首字节不一定更快：HTML 动态不缓存，仍回源；静态资源第二次起命中边缘。
- 当前测试出口落到 SJC（圣何塞）；大陆用户可能落到 HKG/NRT/LAX，需用手机访问 https://whalerealm.top/cdn-cgi/trace 看 colo= 实际节点。
- 真正的瓶颈仍是首屏 20 个同步脚本 + 21 个请求 453KB，CDN 不解决。
## DNS 传播期现象（2026-10-24 19:45 实测）

- 手机打开 https://whalerealm.top/cdn-cgi/trace 显示 404：返回头是 `Server: nginx`，页面是 nginx 默认 404。说明这次请求仍解析到旧源站 158.247.215.153，没有经过 Cloudflare；`/cdn-cgi/trace` 是 CF 边缘路径，源站没有，所以 404。不是橙云配置错误。
- 同一时间：119.29.29.29 与 223.5.5.5 已返回 CF 地址 104.21.47.240 / 172.67.174.139；旧 NS alcohol/coat.dnspod.net 仍返回源站 158.247.215.153。部分本地缓存/运营商 DNS 仍会用旧 NS，最长 24–48 小时。
- 处理：切飞行模式 10 秒、Wi-Fi 与 5G 互换、或把手机 DNS 改成 119.29.29.29；也可直接访问 https://cloudflare.com/cdn-cgi/trace 看当前网络落到哪个 CF 节点。旧 DNS 用户访问网站仍正常（直连源站），只是暂时不经过 CF。