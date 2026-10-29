# AI 排行数据每日更新

> 线上页面：<https://whalerealm.top/#/rank>  
> 生产机：`jingyu-deploy` / 158.247.215.153  
> 调度：systemd timer，每天 **00:00 Asia/Shanghai**（服务器本地 UTC 16:00）

## 1. 为什么不是"改一下 js 文件"

`js/rank-data.js` 与 `js/livebench-data.js` 在构建时会被 `deploy/build.mjs` 按内容哈希发布成：

```
dist/assets/rank-data.<hash>.js
dist/assets/livebench-data.<hash>.js
```

`index.html` 里引用的是带哈希的文件名，nginx 对 `/assets/` 发 `Cache-Control: public, max-age=31536000, immutable`，Cloudflare 也按这个缓存。原地覆盖旧文件，浏览器和边缘节点都不会重新取。

所以每日刷新走的是"换 URL"而不是"改内容"：

```
抓新数据 -> 校验 -> 算新 sha256 前 8 位 -> 写新 assets 文件
        -> 原子替换 index.html 里的两条 script src
        -> 旧文件与旧 index 留作回滚
```

新哈希 URL 对 Cloudflare / 浏览器都是首次请求，天然绕过缓存；`index.html` 本身是 `no-cache`，Cloudflare 返回 `cf-cache-status: DYNAMIC`，所以页面下一次刷新就能拿到新引用。

## 2. 生产目录

| 路径 | 作用 |
| --- | --- |
| `/var/www/jingyu-rank/tools/fetch-rank.mjs` | AA 抓取器（原仓库同名文件） |
| `/var/www/jingyu-rank/tools/fetch-livebench.mjs` | LiveBench 抓取器 |
| `/var/www/jingyu-rank/tools/refresh-rank-daily.mjs` | 每日刷新器：抓取、校验、发布、改写 index |
| `/var/www/jingyu-rank/js/` | 上一版快照（给 AA 算名次变化、给 LiveBench 留基线） |
| `/var/www/jingyu-rank/last-run.json` | 最近一次运行的结构化结果 |
| `/var/www/jingyu-rank/.refresh.lock` | 防并发锁；超过 3 小时视为 stale 自动清掉 |
| `/var/www/jingyu/dist/assets/` | 线上静态资源 |
| `/var/www/jingyu/backup/index.html.rank-YYYYMMDD-HHMMSS` | 每次发布前的 index 备份，保留 20 份 |

## 3. 定时器

```bash
systemctl status jingyu-rank-refresh.timer
systemctl list-timers jingyu-rank-refresh.timer --no-pager
systemctl start jingyu-rank-refresh.service     # 手动跑一次
journalctl -u jingyu-rank-refresh.service -n 80 --no-pager
cat /var/www/jingyu-rank/last-run.json
```

- `OnCalendar=*-*-* 00:00:00 Asia/Shanghai`
- `Persistent=true`：停机错过当天，开机后补跑一次
- `AccuracySec=1s`、`RandomizedDelaySec=0`：不随机漂移，准点触发
- 服务以 root 运行，但有 `ProtectSystem=strict`、`NoNewPrivileges`、`PrivateTmp`，只放开
  `/var/www/jingyu/dist`、`/var/www/jingyu/backup`、`/var/www/jingyu-rank` 三个可写目录

## 4. 一次运行做什么

1. **加锁**：拿不到锁直接退出 0，不并发写。
2. **补基线**：workdir 里没有上一版快照时，从 `dist/assets/rank-data.*.js` / `livebench-data.*.js` 里挑最新的复制过来。
3. **抓 AA**：`fetch-rank.mjs`，失败重试 3 次（间隔 15 秒）。
4. **抓 LiveBench**：`fetch-livebench.mjs`，只试 1 次；上游不完整就跳过，保留上一版。
5. **校验**：
   - 模型数不低于安全下限（AA 50、LiveBench 20）
   - `meta.asOf` 是合法日期、`meta.fetchedAt` 存在
   - 显示名重复不超过 5%
   - 新模型数不得低于上一版的 50%（防止上游改版把整张榜抓空）
   - 产物大小 2 KB ~ 8 MB
6. **发布**：写新哈希资源 -> 备份 index -> 原子替换 index。
7. **清理**：每类资源保留最近 8 份，index 备份保留 20 份；**当前 index 正在引用的文件永不删除**。
8. **落状态**：`last-run.json` 记录每个数据源的 `published / skipped / rejected`、模型数、asOf、错误摘要。

## 5. 失败策略

| 情况 | 行为 | 退出码 |
| --- | --- | --- |
| AA 成功、LiveBench 失败 | AA 正常发布，LiveBench 保留上一版，日志 warn | 0 |
| AA 失败、LiveBench 成功 | 只发布 LiveBench | 0 |
| 两个都失败 / 都被校验拒绝 | `index.html` 不动 | 1 |
| index 里找不到唯一 script 引用 | 不写 index，资源可能已写但页面不变 | 1 |
| 已有进程在跑 | 直接退出，不排队 | 0 |

> **LiveBench 的已知上游问题（2026-10）**：`data/20261014/` 只发布了 `table.csv`、`cost.csv`、`categories.json`，`models.json` 返回 404。抓取器会失败，刷新器把它标成 `skipped`，页面继续用 2026-10-14 那版完整数据。等上游补齐 `models.json`，下一次 00:00 会自动跟上，不需要改代码。

## 6. 回滚

每次发布前的 index 在 `/var/www/jingyu/backup/index.html.rank-*`。回滚只回 index，旧资源还在：

```bash
cd /var/www/jingyu
ls -t backup/index.html.rank-* | head
cp backup/index.html.rank-20261026-000001 dist/index.html
# 建议同时把 workdir 的基线也回退，避免下一次"名次变化"拿错上一版
```

如果只想换回某一版数据文件：

```bash
ls -t dist/assets/rank-data.*.js | head
# 把 index.html 里的 src="assets/rank-data.<hash>.js" 改成目标文件即可
```

## 7. 部署 / 更新刷新器

在本地仓库根目录：

```bash
bash deploy/install-rank-refresh.sh          # 上传 + 安装 + 立即跑一次
RUN_NOW=0 bash deploy/install-rank-refresh.sh  # 只装定时器
```

脚本默认连 `root@158.247.215.153`，密钥 `~/.ssh/jingyu_ed25519`。可以用 `HOST` / `SUSER` / `KEY` / `REMOTE_DIR` / `DIST` / `BACKUP` 覆盖。

## 8. 注意：前端发版会覆盖榜单

`deploy/deploy.sh frontend` 会用本地构建出的 `dist/` 整体替换线上 `dist`，其中包含**本地仓库里那两份旧快照**。发版后到下一次 00:00 之前，榜单会暂时退回本地版本。

两种处理：

- 发版后手动跑一次：`systemctl start jingyu-rank-refresh.service`
- 或发版前在本地先更新快照：`node tools/fetch-rank.mjs && node tools/fetch-livebench.mjs`

这是有意为之：源仓库仍是可复现的构建输入，线上每日刷新不改本地文件。

## 9. 上线记录（2026-10-25）

- 定时器已安装并 `active`，下一次触发：`2026-10-25 16:00 UTC` = **2026-10-26 00:00 Asia/Shanghai**
- 首次手动运行成功：AA 发布 `assets/rank-data.075d3d21.js`，`asOf=2026-10-25`、190 个模型、国内 53 个
- LiveBench 因上游 `models.json` 404 跳过，继续使用 `livebench-data.72237180.js`（2026-10-14 版）
- 线上首页已切到新引用；截图核对：页面右上角「抓取时间 2026-10-25T21:44:45+08:00」「数据 2026-10-25」
- 备份：`/var/www/jingyu/backup/index.html.rank-20261025-214446`
- 旧资源 `rank-data.8accea7d.js` 仍在 `dist/assets`，可随时回滚

## 10. 验证清单

```bash
# 1. 定时器下次触发时间（应为北京时间 00:00）
systemctl list-timers jingyu-rank-refresh.timer --no-pager

# 2. 最近一次运行
cat /var/www/jingyu-rank/last-run.json

# 3. 线上 index 是否指向新哈希
curl -s https://whalerealm.top/ | grep -E 'rank-data|livebench-data'

# 4. 新资源能否取到
curl -sI https://whalerealm.top/assets/rank-data.<hash>.js | grep -E 'HTTP|cf-cache-status|cache-control'

# 5. 页面数据
curl -s https://whalerealm.top/assets/rank-data.<hash>.js | grep -o '"asOf":"[^"]*"'
```
