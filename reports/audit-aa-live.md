# AA Intelligence Index 核实报告（截至 2026-10-28 21:00 CST）

**一句话结论：Kimi 家族现在不是第 4。第 4 是 2026-10-23 Kimi K3.1 Pro 在 v4.3 版指数上的成绩（55 分）；2026-10-27 AA 切换到 Intelligence Index v5.0 全量重算后，K3.1 Pro 落到 46 分，全量榜约第 9（去重模型）/ 第 21 行（含 effort 变体），仍是「开放权重第一」，但已不是第 4。**

## 1. 抓取与来源

| 用途 | URL | 抓取结果 |
|---|---|---|
| v5 上线公告 | https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5 | 200，正文完整（2026-10-27） |
| 方法学·版本历史 | https://artificialanalysis.ai/methodology/intelligence-benchmarking | 200，含 Version 5.0 条目 |
| 现行榜单（英/中） | https://artificialanalysis.ai/leaderboards/models · /zh/leaderboards/models | 200，1.89 MB，表格行完整 |
| K3.1 Pro 发布文 | https://artificialanalysis.ai/articles/kimi-k3-1-pro-launch-benchmarks | 200，正文完整（2026-10-23） |
| K3 发布文 | https://artificialanalysis.ai/articles/kimi-k3-achieves-3-in-the-artificial-analysis-intelligence-index-comparable-to-opus-4-8-and-gpt-5-5 | 200（2026-07-17） |
| 媒体旁证 | https://news.cgtn.com/news/2026-10-24/Kimi-K3-1-Pro-an-open-weight-model-within-3-points-of-the-frontier-1Rvpycrxw2s/p.html | 200，明确写「debuted fourth…score of 55」 |

## 2. v5.0 是什么

方法学页 Version History 原文：**「Version 5.0 — October 2026 to current」**。9 项评测与截图完全一致：AA-Briefcase v1.1、AutomationBench-AA、GDP.pdf（截图的 “GDP.pd” 应为 pdf）、Terminal-Bench 4.0、FrontierCode 2.0、CritPt v2 (Hard Subset)、Terminal-Bench-Science 0.1.0、AA-Omniscience v1.1、HLE-Diamond。权重四等分各 25%：知识工作（Briefcase 15/AutomationBench 5/GDP.pdf 5）、编码（FrontierCode 15/TB4 10）、科学（TB-Science 15/CritPt 10）、通用（Omniscience 15 = 准确率 10 + 不幻觉 5，HLE-Diamond 10）。移除 GDPval-AA、SciCode、AA-LCR、HLE；CritPt 换 v2 私测 40 题。公告强调 60% 权重基于私有集，刻度仍是 0–100 的合成分，当前上限 58。

## 3. Kimi 现行数值（v5.0）

榜单原行：`Kimi K3.1 Pro | 1M | Kimi | 46 | $3.68 | 41 t/s | 2.82s | 63.15s`（Intelligence Index 46、每任务成本 $3.68）。上方依次 58 Claude Opus 5.5 (max)、57 Opus 5.5 (xhigh)、57 GPT-6 Astra (max)、55 Astra (xhigh/high)、55 GPT-6.1 Sol (max)、54 Claude Sonnet 5.5 (max)、52 Sol (xhigh)/Opus (high)、51 Astra (medium)/GPT-6.1 Terra (max)、50 Gemini 4 Argon (high)/Sol (high)/Muse Wonder Full (max)/Fable 5.1 (xhigh)/Sonnet (xhigh)、49 Fable 5.1 (max)、48 Opus (medium)、47 Fable 5.1 (high)、46 GPT-6.1 Sol (medium)。**K3.1 Pro 与 Sol (medium) 并列 46 → 全量行第 21；按去重模型计第 9**。v5 公告原文：K3.1 Pro「weights not yet released」为开放权重最高分 46，而已发布权重最高仅 DeepSeek V4.1 Flash 1017 / GLM-5.3 的 32，开放权重与前沿差距由 3 分扩大到 12 分；K3.1 Pro 在 Terminal-Bench 4.0 仍以 67% 居首。Kimi K3（2026-07-16 发布）在榜上已标 deprecated，v5 无公开分数；K2.7 Code、Kimi Linear 48B 的 Intelligence 列为 “--”。

## 4. 「第 4」的来源与失效

AA 官方 2026-10-23 文章标题即 **“Kimi K3.1 Pro launches at 4th on the Artificial Analysis Intelligence Index scoring 55”**：55 分，仅落后 Opus 5.5 (max 58)、Sonnet 5.5 (max 56)、Muse Wonder Full (max 56)。CGTN 10-24、36 氪（“Global Top 4”）、明报 10-25 标题《月之暗面發布K3模型升級 智能指數排第4》均为该事件的转载。所以「第 4」不是讹传，但它是 **v4.3 口径、10-23 当天**的位次；10-27 v5.0 重算后 K3.1 Pro 由 55 降到 46（-9），排名滑出前 4。若换筛选维度，「第 4」也无法在 v5 下复现（开放权重/中国区子集里它是第 1）。

## 5. 本地快照 vs 官方

本地 meta：fetchedAt 2026-10-23T12:37、raw 272 / kept 190、cnModels 53。对照现行 v5：

| 模型 | 本地 ii（10-23） | 官方现行（10-28） | 差 |
|---|---|---|---|
| Claude Opus 5.5 | 57.6 | 58 (max) | +0.4 |
| Claude Sonnet 5.5 | 56.0 | 54 (max) | −2.0 |
| Muse Wonder Full | 55.8 | 50 (max) | −5.8 |
| Claude Fable 5.1 | 53.4 | 50 (xhigh) / 49 (max) | −3.4 / −4.4 |
| GPT-6 Astra | 52.7 | 57 (max) | **+4.3** |
| Gemini 4 Argon | 52.6 | 50 (high) | −2.6 |
| Muse Wonder | 52.4 | 43 (max) | **−9.4** |
| GPT-6.1 Sol | 51.8 | 55 (max) | +3.2 |
| Kimi K3 | 43.6 | v4.3 官方 44；v5 已 deprecated | — |
| Kimi K3.1 Pro | 未收录 | 46 | 新增 |

判定：本地快照是 **v4.3.2 口径**（方法学：v4.3.2 自 2026-09 生效至 2026-10），抓取当天仍是当版，但 10-27 起已被 v5.0 取代，整体过期一个主版本，且不是等比缩放——分差 −9.4 至 +4.3 说明换题集后重排队形。数量口径也不同：AA 现行页脚写「out of 76 models ranked / 20 open weights」（Status=Current），本地 kept 190 是未过滤 deprecated 的口径；截图 714 与 zh 页面模型选择器的 714 条目吻合。

## 6. 读榜须知：一根柱子只代表一个 effort 档

v5 公告明说 effort 的影响被放大：Claude Opus 5.5 低档 35 / max 58（每任务成本 $0.98 vs $10.04），Sonnet 5.5 低到高跨 29 分（v4.3 为 20），GPT-6.1 Sol 跨度由 10 翻到 20。截图的「Kimi 系 46」是 max 档单值，横向比较必须先锁定档位。按各自最优档去重后，前十为：Opus 5.5 58、GPT-6 Astra 57、GPT-6.1 Sol 55、Sonnet 5.5 54、GPT-6.1 Terra 51、Gemini 4 Argon 50、Muse Wonder Full 50、Fable 5.1 50、Kimi K3.1 Pro 46、（其后 GPT-6.1 Terra xhigh 45、Muse Wonder 43、Grok 4.7 35、Qwen3.8 Max 34、DeepSeek/GLM 32）。这也解释了为何同一天不同来源会给出「第 4」「第 9」「第 21」三种说法。

## 7. 可信度与抓不到的部分

**高可信**：v5.0 上线时间与 9 项/权重、Opus 58 / Astra 57 / Sol 55 / Argon 50 / K3.1 Pro 46、K3.1 Pro 10-23 以 55 分列第 4（AA 原文 + CGTN 双证）。
**中等**：Kimi 当前精确名次。AA 不发布行号，第 21 / 第 9 为我按表格顺序统计，effort 变体计入口径会显著改变数字。
**抓不到**：①明报原文（finance.mingpao.com 连接超时，只有检索标题）；②v5 下 Kimi K3 分数（已 deprecated，榜上不显示）；③截图「已选择 28/714」的子集定义（AA 不提供可分享的筛选状态，无法复现该 28 模型组合）。
**存疑**：截图三处模型名与官方不符——官方无 “Qwen3.5 Max 50”（Qwen3.8 Max 为 34）、“Grok 4.1 Fast”（Grok 4.7 high 为 35）、“MiniMax-M2.1 Flash”（MiniMax-M3.1-Flash 为 29）；同批数值 58/57/55/54/51/50/49/46 却与官方逐条吻合，故判断为截图文字误读或非 AA 实时页，而非数据造假。

## 8. 复盘

三件事可以定死：**（a）** 截图确实是 v5.0 口径，数值与官方逐条对得上；**（b）**「Kimi 第 4」是 10-23 的旧位次，10-27 换版后不再成立，今天正确说法是「46 分，开放权重第一，全量约第 9」；**（c）** 本地快照不是抓错，而是停在 v4.3.2，属于版本过期而非数据错误。若站点要继续展示该榜，最短路径是重跑 `tools/fetch-rank.mjs` 并把 meta 的版本号写成 v5.0，同时保留一份 v4.3 历史，避免把「第 4」当成现况对外。
