# #/rank「AI 模型排行」数据与排序审计

审计对象：`js/rank-data.js`（AA 快照）、`js/rank.js`（渲染/排序）、`js/livebench-data.js`、`tools/fetch-rank.mjs`、`tools/check-rank-freshness.mjs`、`index.html` 的加载顺序、`dist/assets/rank-data.*.js`。方法：用 `node:vm` 真实执行三个脚本，调用 `AIRank.list/lbList/html`，直接解析渲染出的 `.rk-rank` 单元格，得到的名次就是页面显示值，不是另写一套排序去"猜"。审计日期 2026-10-28。

## 一、结论：Kimi K3 不是第 4

| 视图 | AA 智能指数榜 | LiveBench 榜 |
| --- | --- | --- |
| 全球榜 | **第 16**（ii 43.6，全表 190 条） | 第 34（总分 63.4，49 条） |
| 纯国内榜 | **第 7**（53 条） | 第 9（13 条） |

四个视图把 `.rk-rank` 全部读出来核对过：名次连续（1…N 无跳号）、总分单调不增、每条 Kimi 行都只有一条（无重名重复物）。AA 全球前 20 依次为：Claude Opus 5.5 57.6、Claude Sonnet 5.5 56.0、Muse Wonder Full 55.8、Claude Fable 5.1 53.4、GPT-6 Astra 52.7、Gemini 4 Argon 52.6、Muse Wonder 52.4、GPT-6.1 Sol 51.8、Grok 4.7 46.4、MiMo-V2.6-Pro 46.3、Qwen3.8 Max 45.4、DeepSeek V4.1 Flash 1017 45.1、GLM-5.3 44.8、Ling 3.1 Flash 1019 43.9、Step 5 Preview 43.7、**Kimi K3 43.6**、Claude Haiku 5.5 43.4、MiniMax-M3.1-Flash 42.7、GPT-5.6 Terra 42.1、GLM-5.3-Flash 41.8。纯国内前六：MiMo-V2.6-Pro、Qwen3.8 Max、DeepSeek V4.1 Flash 1017、GLM-5.3、Ling 3.1 Flash 1019、Step 5 Preview，Kimi K3 第七。另两条 Kimi：K2.7 Code 全球 46／国内 19，Kimi Linear 48B 全球 141／国内 48。

**"第 4" 没有对应的总分视图**，只可能来自三处：① LiveBench 纯国内榜按「分析」排序时 Kimi 第 4（前三都是 DeepSeek 系，78.7 分）；② AA「分项第一」卡第 4 行正好是「长文 Kimi K3 88.7」（`js/rank.js:311-317` 固定按 hle→gpqa→code→long 顺序出五行）；③ AA 纯国内按「科学推理」Kimi **第 1**（93.5，与 Qwen3.8 2.4T A95B 同分，靠 ii 43.6>39.9 排在前面）——方向相反。全仓库 grep 无"第 4／第四／国产第四"任何写死文案；`.is-top`／`.rk-medal` 只在 `sort === 'total' && i < 3` 时出现（`js/rank.js:228-229`、`257-258`），与 Kimi 无关。

## 二、排序与合并逻辑：名次本身没算错，但口径有两处坑

通过项：排序键 → 数据字段的映射正确（`js/rank.js:166`，`gpqa→gq`、`code→sc`、`long→lc`、`agent→t2`，不会拿错列）；空值垫底、同分再比总分、最后 `localeCompare` 兜底（`146-158`）；11 个维度逐个点过，名次全部连续、列值单调不增，分列为空的行没有被插到中间。没有"开源/专有"筛选控件，不会因筛选改变编号。

真实缺陷（按严重度）：

1. **合并档 = 跨档最优拼装，与页面文案不符**。`js/rank.js:363` 与徽章 tooltip（`218`）都说"取智能指数最高的那档"，但 `tools/fetch-rank.mjs:178-186` 对 hle/gq/sc/lc/t2/cx 逐项取 `Math.max`——分项可能来自另一档。全表 42 行（`nv>1`）都是这种复合行，Kimi K3 `nv=2` 正是其一（`js/rank-data.js:52`）。后果：分项排序与「分项第一」卡的数字无法在 AA 官方任一行复现；且这些行以"最优档 ii"参与排名，丢弃了低档行，导致 **AA 官方逐行榜的名次无法从本地数据复算**（Kimi 上面 15 名里有 7 个是复合行、共展开 30 行，方向是本地更靠前）。
2. **名次变化 d 两处错**（潜伏，当前 `prevAsOf: null` 未显形）：`tools/fetch-rank.mjs:246` 用全局序号 `before-(i+1)`，而纯国内榜是重新编号的（`js/rank.js:167`），一旦有上一版，国内榜 ↑↓ 全错；`247` 的 `if (!m.d) delete m.d` 把"名次没变（0）"删掉，导致 `js/rank.js:194` 的死代码，并让 `195` 对"名次没变"的模型显示"上一份快照里没有这个模型"。
3. **并列不共享名次**：`js/rank.js:230` 一律 `i+1`。AA 至少 14 组同分（21.4×2、14.2×3、7.5×4、5.6×3…），被拆成相邻名次、同分靠名字定先后。Kimi 的 43.6 无并列，所以不影响 16/7。
4. **文案/链接指错**：`js/rank.js:431` 写"现在先看 AA 智能指数那张榜"却 `href="#/rank"`，而 `#/rank` 默认是 LiveBench（`js/app.js:118`、`6143-6144`、`js/rank.js:131`），应指向 `#/rank/aa`。

## 三、两套数据没有混用，但默认板是 LiveBench

按 board 分别走 `lbRowHTML` / `rowHTML`、`lbHeadHTML` / `headHTML`（`js/rank.js:482-484`），排序状态也分开存（`rankSort` vs `rankLbSort`，`js/app.js:7545-7546`），**不存在把 LiveBench 分当智能指数渲染的路径**。但 `#/rank` 一进来是 LiveBench（总分 0–100 量级、Kimi 63.4 排 34），AA 要 `#/rank/aa`——这是"和 AA 官方对不上"的最大现实原因。机构名两板也不统一：AA 叫 `Kimi`，LiveBench 叫 `Moonshot AI`。

## 四、新鲜度与抓取口径

`asOf 2026-10-23` + `cadenceDays 7` → `nextDue 2026-10-30`；今天 2026-10-28，实跑 `node tools/check-rank-freshness.mjs` 全部通过（exit 0，提示"还有 2 天"，不显示过期徽章）。口径：只抓 `https://artificialanalysis.ai/zh/leaderboards/models` 的 Next.js flight 里 `initialModels`（`fetch-rank.mjs:29`、`111-131`），无 URL 筛选参数、不用官方 JSON API；272 条 → 丢 5 条无主分 → 267 条 → 合并成 190 条。**meta 不记录上游榜单/指数版本**（只有抓取时间、周期与计数），AA 若改过 index 权重，本地无从察觉，跨版本相减的名次变化会失真。纯国内榜靠手工国家表（`fetch-rank.mjs:35-51`），10 条未归属机构的行被排除（最高 ii 35.2，都在 Kimi 之后，故不影响"国内第 7"，但 Nanbeige、AI9Stars 等疑似国产被漏）。

## 五、dist 与源码同一版本

`js/rank-data.js` 与 `dist/assets/rank-data.8accea7d.js` 字节相同（42731 B，md5 `0689a0b0a11901066611af65ba7fb595`），`rank.js` 对应 `rank.a27280c5.js` 亦相同；`dist/index.html:102-104` 引用的就是这两个哈希文件，`dist/assets` 下只有这一份 rank-data，无旧快照并存。加载顺序 `index.html:102-104` 为 rank-data → livebench-data → rank，正确（`js/rank.js:24-30` 启动即读两个 window 变量）。

## 六、最小修复建议

1. `tools/fetch-rank.mjs:190-194`：合并时记住"胜出那一档"的整行，分项/上下文随该档一起覆盖（而不是逐项 `Math.max`）；若坚持最优拼装，则把 `js/rank.js:363` 文案改成"分项取各档最高值"。
2. `tools/fetch-rank.mjs:246-247`：改为 `m.d = (before == null) ? null : (before - (i+1)); if (m.d === null) delete m.d;`，并在 `js/rank.js:240` 对 `scope === 'cn'` 时不显示变化列（或按国内序号另算）。
3. 默认板改 AA（`js/app.js:118` 或 `6143`），并修 `js/rank.js:431` 的 `href="#/rank/aa"`。
