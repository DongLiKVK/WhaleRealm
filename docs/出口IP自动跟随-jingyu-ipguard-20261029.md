# 出口 IP 自动跟随（jingyu-ipguard）落地记录 — 2026-10-29

## 为什么要它

今天「打不开鲸域」的真因不是站点宕机，而是**本机公网 IP 变了**（家宽重拨 111.31.187.43 → 111.33.213.23）：
nginx 的 `img_limit` 限流把成批的 `/api/img` 图片代理请求记成 `limiting requests`，
fail2ban 的 `nginx-limit-req` jail 据此把新 IP 判成攻击者，`-j REJECT` 挂在 INPUT 的 80/443 上，
整站对新 IP 不可达（22 端口不在那条链上，所以 SSH 一直通）。
而 `ignoreip` 白名单里只写死着**旧 IP**。

结论：写死 IP 的白名单 = 一颗定时炸弹。改成自动跟随。

## 设计要点

**真相来源必须是服务器亲眼看到的来源 IP（$SSH_CLIENT），不是公网 IP 探测接口。**
本机开着系统代理，`Invoke-WebRequest` 出去看到的公网 IP 是代理出口 45.149.92.7，
而服务器看到的直连来源是 111.33.213.23 —— 两者不一致，探测接口会写进错误的白名单。

另一个坑：`sudo` 默认 `env_reset`，`sudo jingyu-ipguard set-auto` 读不到 `$SSH_CLIENT`。
所以拆成两层：**非特权薄壳先读 IP，再作为参数交给 root 脚本**。

## 组件

| 位置 | 作用 |
| --- | --- |
| 服务器 `/usr/local/sbin/jingyu-ipguard` | 主脚本（root）。维护 ignoreip、重载 fail2ban、解封、备份、日志 |
| 服务器 `/usr/local/sbin/jingyu-ipguard-selfsync` | 非特权薄壳。读 `$SSH_CLIENT` 首字段 → `sudo -n jingyu-ipguard set-auto <ip>` |
| 服务器 `/usr/local/sbin/jingyu-ipguard-sg` | 腾讯云轻量防火墙联动（**待启用**，缺密钥） |
| Windows `C:\Users\Administrator\Tools\jingyu-ipguard\ipguard.ps1` | 客户端。SSH 调薄壳；失败计数 3 次写 ALERT |
| Windows `ipguard.vbs` | 无窗口启动器（`WScript.Shell.Run cmd, 0, False`） |
| 计划任务 `Jingyu-IpGuard` | 登录时 + 每 5 分钟跑一次，`wscript.exe //B //Nologo ipguard.vbs` |

源码在仓库：`deploy/jingyu-ipguard.sh`、`deploy/jingyu-ipguard-selfsync.sh`、`deploy/jingyu-ipguard-sg.py`、`tools/ipguard/`。

## 服务器侧运维

```bash
sudo jingyu-ipguard show                # 当前 ignoreip / 属主列表 / 各 jail 封禁数
sudo jingyu-ipguard add 1.2.3.4         # 手动加一个（手机热点等），最多保留 5 个
sudo jingyu-ipguard del 1.2.3.4
sudo jingyu-ipguard unban 1.2.3.4       # 只解封不改白名单
sudo jingyu-ipguard set 1.2.3.4         # 直接把白名单设成这一个
tail -f /var/log/jingyu-ipguard.log
```

- 永久白名单 `BASE_IGNORE`：`127.0.0.1/8 ::1 43.142.153.74`（服务器自己要能访问自己）。
- 写配置前先 `fail2ban-client -t` 校验，失败自动回滚；每次改动前备份到 `/var/lib/jingyu-ipguard/backup/`（留 20 份）。
- 幂等：白名单已是目标值时**不重写、不重载**。

## Windows 侧运维

```powershell
& C:\Users\Administrator\Tools\jingyu-ipguard\ipguard.ps1 -Check   # 只看状态
& C:\Users\Administrator\Tools\jingyu-ipguard\ipguard.ps1 -Force   # 立刻同步一次
Start-ScheduledTask -TaskName Jingyu-IpGuard                           # 让任务跑一次
Get-ScheduledTaskInfo -TaskName Jingyu-IpGuard                         # LastTaskResult
```

日志与状态：`%LOCALAPPDATA%\jingyu-ipguard\`（`ipguard.log` 滚动 400 行、`last-status.txt`、`fail-count.txt`、连续 3 次失败才写 `ALERT.txt`）。

## 验证记录（实测）

1. `jingyu-ipguard del 111.33.213.23` → 白名单只剩 base；
2. `Start-ScheduledTask` → 服务器白名单自动恢复为 `127.0.0.1/8 ::1 43.142.153.74 111.33.213.23`；
3. 服务器日志：`ignoreip → …` / `fail2ban 已重载，新白名单立即生效` / `已在 9 个 jail 上尝试解封 111.33.213.23`；
4. 客户端日志：`OK 检测到出口 IP 已变化，白名单已更新 IPGUARD_STATUS=added`；`LastTaskResult=0`；无 ALERT；
5. `fail2ban-client -d` 显示 **9 个 jail 全部**继承到新 ignoreip；`https://seekbbs.cn/` = 200。

## 云防火墙（安全组）：待启用

当前腾讯云轻量防火墙对 22/443 不限制来源 IP，所以「跟着 IP 改安全组」暂时不是必需项；
一旦收紧，就必须自动化，否则第一次换 IP 就连不上 SSH，整个自愈链条断掉。

需要用户提供：SecretId / SecretKey（子账号即可，最小权限 `lighthouse:DescribeFirewallRules` / `CreateFirewallRules` / `DeleteFirewallRules`）。
写入 `/etc/jingyu-ipguard/tc.json`（700）：

```json
{
  "secret_id": "AKIDxxxx",
  "secret_key": "xxxx",
  "instance_id": "lhins-53h97tl8",
  "region": "ap-guangzhou",
  "ports": ["22", "443"]
}
```

之后 `sudo jingyu-ipguard sg` 即可同步；主脚本的 `apply_all` 也会在凭据存在时自动调用。
实现顺序：先 `CreateFirewallRules` 加新 IP，再 `DeleteFirewallRules` 删旧 IP —— 反过来会把自己锁在门外。

## 顺带修掉的限流问题

- `/etc/nginx/conf.d/10-shield.conf`：`img_limit` 从 `20r/m` 提到 `120r/m`；
- `/etc/nginx/sites-available/jingyu-443.conf`：`limit_req zone=img_limit burst=5` → `burst=40`；
- `/etc/fail2ban/filter.d/nginx-limit-req.local`：把 `img_limit` 排除出「限流即封 IP」的判定；
- 备份在 `/root/pre-imgfix-20261029-200741`。
