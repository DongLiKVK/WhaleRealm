
/* ============ 鲸域 · 数据层 ============ */
window.DATA = (function () {
  const users = {
    u1: { name: "林深见鹿", emoji: "🦌", level: 12, badge: "插件作者", grad: "linear-gradient(135deg,#7aa2ff,#a46bff)", sig: "写插件，也写诗。", city: "杭州", fans: 1286, follows: 84, visits: 24310 },
    u2: { name: "阿离", emoji: "🍊", level: 9, badge: "内测组", grad: "linear-gradient(135deg,#ffb36b,#ff6b9d)", sig: "Blender 重度依赖患者", city: "成都", fans: 642, follows: 156, visits: 9120 },
    u3: { name: "豆腐", emoji: "🧊", level: 15, badge: "版主", grad: "linear-gradient(135deg,#5ad1c8,#3f8bff)", sig: "问题不大，重启试试。", city: "深圳", fans: 3310, follows: 210, visits: 58120 },
    u4: { name: "K酱", emoji: "🐱", level: 7, badge: "", grad: "linear-gradient(135deg,#c084fc,#f472b6)", sig: "正在研究远端部署", city: "上海", fans: 208, follows: 320, visits: 4210 },
    u5: { name: "海盐柠檬", emoji: "🍋", level: 11, badge: "插件作者", grad: "linear-gradient(135deg,#fde68a,#f59e0b)", sig: "模型时钟作者 / 早八人", city: "南京", fans: 980, follows: 61, visits: 17760 },
    u6: { name: "夜航船", emoji: "🌙", level: 5, badge: "", grad: "linear-gradient(135deg,#64748b,#334155)", sig: "半夜改 bug 的人", city: "武汉", fans: 96, follows: 74, visits: 2310 },
    u7: { name: "小满", emoji: "🌿", level: 8, badge: "内测组", grad: "linear-gradient(135deg,#86efac,#22c55e)", sig: "GenUI 中毒", city: "西安", fans: 421, follows: 133, visits: 6820 },
    u8: { name: "十七", emoji: "🛸", level: 6, badge: "", grad: "linear-gradient(135deg,#93c5fd,#6366f1)", sig: "逆向是浪漫", city: "北京", fans: 176, follows: 88, visits: 3900 }
  };

  /* ------------------------------------------------------------
     插件条目库（v6 模型）：收录深度不再由许可证推断，而由作者授权决定。
       tier  = pack（已登记包信息）/ link（外链）/ entry（仅条目）—— v44 起本站不托管任何包文件
       source= author（作者上传或授权代抓）/ mirror（本站转载，历史遗留）/ none
       claimed = 作者是否已完成仓库认领（README / Issue / Gist 三选一）
       mirror  = auto（跟随 tag 自动同步）/ manual（仅手动上传）/ off（未授权）
       freshness = synced（与上游同步）/ manual（作者手动上传）/ stale（本站转载，可能落后）
     ------------------------------------------------------------ */
  const plugins = [
    { id: "p1", name: "dsh-blender-plugin", icon: "🎨", grad: "linear-gradient(135deg,#ff9a6c,#ff5f8f)", author: "u1", ver: "2.1.0", cat: "视觉与多模态", desc: "把 Blender 直接接进对话：程序化建模、批量渲染、无头出图，一句话改一个场景。", stars: 2841, installs: 18320, tags: ["Blender", "建模", "渲染"], updated: "2 小时前", hot: true,
      pkg: "dsh-blender-plugin", license: "MIT", repo: "github.com/linshen/blender-plugin", homepage: "linshen.dev/blender",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-18", syncedAt: "2 小时前",
      file: { name: "dsh-blender-plugin-2.1.0.tgz", size: "1.8 MB", sizeB: 1887437, sha: "9f2c4b7e18a3d6504c1b9e7a2d85f04c3b6e1a9d7c4f20b83e5a6d1c9f7b4e20", at: "2026-10-18" } },

    { id: "p2", name: "dsh-model-clock", icon: "⏰", grad: "linear-gradient(135deg,#7dd3fc,#4f46e5)", author: "u5", ver: "1.4.2", cat: "模型与账号接入", desc: "按时间窗自动切换模型：白天用快模型跑量，夜里切深度推理，节假日单独一套。", stars: 1922, installs: 12040, tags: ["调度", "模型", "自动化"], updated: "昨天",
      pkg: "dsh-model-clock", license: "MIT", repo: "github.com/haiyan/model-clock", homepage: "haiyan.cc/model-clock",
      tier: "pack", source: "author", claimed: true, mirror: "manual", freshness: "manual", collected: "2026-10-16", syncedAt: "昨天",
      file: { name: "dsh-model-clock-1.4.2.tgz", size: "63 KB", sizeB: 64231, sha: "4a7e1c93b0d6825f7e31a4c9d8062b5e1c9f7a3d4b0e268d5a1c7f93e04b2d61", at: "2026-10-16" } },

    { id: "p3", name: "genui-kit", icon: "🧩", grad: "linear-gradient(135deg,#a78bfa,#f472b6)", author: "u7", ver: "0.9.7", cat: "UI 增强", desc: "dsh-ui 组件模板库与校验器：39 个常用卡片模板，写完当场 validate。", stars: 1560, installs: 9840, tags: ["GenUI", "组件", "模板"], updated: "3 天前",
      pkg: "genui-kit", license: "MIT", repo: "github.com/xiaoman/genui-kit", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-12", syncedAt: "",
      why: "作者尚未认领，也没同意展示包信息。没有作者授权，条目页就不挂包信息，只留外链。" },

    { id: "p4", name: "dsh-remote-deploy", icon: "🛰️", grad: "linear-gradient(135deg,#5eead4,#0ea5e9)", author: "u3", ver: "1.2.0", cat: "远程与移动端", desc: "远端机器一键部署 dsh web，自带体检、私有前缀安装与连通性验证。", stars: 1204, installs: 7350, tags: ["SSH", "部署", "Windows"], updated: "5 小时前", hot: true,
      pkg: "dsh-remote-deploy", license: "Apache-2.0", repo: "github.com/doufu/dsh-remote-deploy", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-15", syncedAt: "5 小时前",
      file: { name: "dsh-remote-deploy-1.2.0.tgz", size: "126 KB", sizeB: 128900, sha: "7c1e4a903b6d82f50a9c7e146d2b85f39e04c7a12b5f8d360c7e94a15b3d28f6", at: "2026-10-15" } },

    { id: "p5", name: "rea-toolbelt", icon: "🔬", grad: "linear-gradient(135deg,#94a3b8,#475569)", author: "u8", ver: "3.0.1", cat: "安全与权限", desc: "静态 + 动态逆向工具合流：PE/ELF/APK 一把梭，证据链自动落盘。", stars: 987, installs: 5210, tags: ["逆向", "证据", "二进制"], updated: "1 周前",
      pkg: "rea-toolbelt", license: "", repo: "github.com/shiqi/rea-toolbelt", homepage: "",
      tier: "entry", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-08", syncedAt: "",
      why: "仓库里没有 LICENSE 文件，package.json 也没写 license 字段。没有明确授权，本站不提供任何安装包，也不代为转载。" },

    { id: "p6", name: "hindsight-memory", icon: "🧠", grad: "linear-gradient(135deg,#fdba74,#f43f5e)", author: "u1", ver: "0.8.4", cat: "记忆", desc: "给仓库装长期记忆：知识页 + 决策回溯，越用越懂你的项目。", stars: 1730, installs: 11080, tags: ["记忆", "知识库"], updated: "昨天",
      pkg: "hindsight-memory", license: "MIT", repo: "github.com/linshen/hindsight-memory", homepage: "linshen.dev/hindsight",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-14", syncedAt: "",
      why: "MIT 允许分发，但作者还没认领、也没授权镜像。请从上游 Release 取包。" },

    { id: "p7", name: "dsh-our-free-model", icon: "🪄", grad: "linear-gradient(135deg,#67e8f9,#3b82f6)", author: "u5", ver: "1.1.9", cat: "模型与账号接入", desc: "免费模型通道管理：离线升级、cookie 热重载，断网也能继续。", stars: 864, installs: 6080, tags: ["模型", "离线"], updated: "4 天前",
      pkg: "dsh-our-free-model", license: "MIT", repo: "github.com/haiyan/our-free-model", homepage: "",
      tier: "pack", source: "mirror", claimed: false, mirror: "off", freshness: "stale", collected: "2026-09-30", syncedAt: "2026-09-30",
      file: { name: "dsh-our-free-model-1.1.9.tgz", size: "93 KB", sizeB: 95012, sha: "2d8f5a71c4e09b367a1d5c983e0b64f285c1a7d90e4b36f81a7c95d24e60b83f", at: "2026-09-30" } },

    { id: "p8", name: "kinetic-reel", icon: "🎬", grad: "linear-gradient(135deg,#f472b6,#7c3aed)", author: "u2", ver: "2.3.0", cat: "视觉与多模态", desc: "代码生成动态视觉短片：排版、转场、音轨锁定，一次导出 MP4。", stars: 2210, installs: 13470, tags: ["视频", "动效", "渲染"], updated: "6 小时前",
      pkg: "kinetic-reel", license: "", repo: "github.com/ali/kinetic-reel", homepage: "ali.studio/reel",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-11", syncedAt: "",
      why: "许可证未声明（仓库无 LICENSE、package.json 无 license）。可以链到作者主页，但本站不转载、不镜像。" },

    { id: "p9", name: "dsh-badge", icon: "🏷️", grad: "linear-gradient(135deg,#a3e635,#16a34a)", author: "u3", ver: "1.0.3", cat: "文档与渲染", desc: "给文档、PR、合并请求统一挂上 powered by dsh 徽章。", stars: 402, installs: 2210, tags: ["徽章", "文档"], updated: "2 周前",
      pkg: "dsh-badge", license: "MIT", repo: "github.com/doufu/dsh-badge", homepage: "",
      tier: "entry", source: "none", claimed: true, mirror: "off", freshness: "none", collected: "2026-10-02", syncedAt: "",
      why: "作者认领时明确关掉了包信息展示，只保留条目。这是他的权利，随时可以在认领页重新打开。" },

    { id: "p10", name: "dsh-cost-meter", icon: "💰", grad: "linear-gradient(135deg,#facc15,#f97316)", author: "u5", ver: "1.6.2", cat: "用量与计费", desc: "按会话统计 token 用量与花费，超预算自动降到便宜档，月底给一张账单。", stars: 1890, installs: 9420, tags: ["计费", "用量", "预算"], updated: "3 小时前", hot: true,
      pkg: "dsh-cost-meter", license: "MIT", repo: "github.com/doufu/dsh-cost-meter", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-17", syncedAt: "3 小时前",
      file: { name: "dsh-cost-meter-1.6.2.tgz", size: "148 KB", sizeB: 151552, sha: "0f011b7c1230d776e62af1b2c4fdec7c762ee76e78885ab609aadc9bb21f1408", at: "2026-10-17" } },

    { id: "p11", name: "theme-factory", icon: "🌈", grad: "linear-gradient(135deg,#f0abfc,#8b5cf6)", author: "u7", ver: "2.0.4", cat: "主题与外观", desc: "10 套预设主题加现场配色生成，一键套到网页、文档、幻灯片上。", stars: 1420, installs: 8610, tags: ["主题", "配色", "外观"], updated: "2 天前",
      pkg: "theme-factory", license: "MIT", repo: "github.com/xiaoman/theme-factory", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-13", syncedAt: "",
      why: "作者要求只走 GitHub Release 分发；本站保留条目并链到仓库，不代放安装包。" },

    { id: "p12", name: "agent-teams-kit", icon: "🧬", grad: "linear-gradient(135deg,#38bdf8,#6366f1)", author: "u8", ver: "0.5.1", cat: "AGI 架构探索", desc: "多智能体分工实验场：冻结 spec、并行建模、验收门一体，跑完留一份证据账本。", stars: 1980, installs: 7420, tags: ["多智能体", "编排", "验收门"], updated: "6 小时前", hot: true,
      pkg: "agent-teams-kit", license: "", repo: "github.com/shiqi/agent-teams-kit", homepage: "",
      tier: "entry", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-05", syncedAt: "",
      why: "仓库未声明许可证，作者也明确不接受展示包信息，所以只保留条目。" },

    { id: "p13", name: "dsh-oauth-bridge", icon: "🔐", grad: "linear-gradient(135deg,#fca5a5,#dc2626)", author: "u5", ver: "1.3.0", cat: "身份与通信", desc: "把本机登录态桥进容器：OAuth 回调、令牌托管、过期自动续期，一次配好。", stars: 980, installs: 5210, tags: ["OAuth", "令牌", "登录"], updated: "5 天前",
      pkg: "dsh-oauth-bridge", license: "MIT", repo: "github.com/doufu/dsh-oauth-bridge", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-09", syncedAt: "5 天前",
      file: { name: "dsh-oauth-bridge-1.3.0.tgz", size: "96 KB", sizeB: 98304, sha: "468cdbeee483b1395bca023f56c3f980bd009000015034a501b8a7af4e602315", at: "2026-10-09" } },

    { id: "p14", name: "session-replay", icon: "🎞️", grad: "linear-gradient(135deg,#c4b5fd,#4c1d95)", author: "u6", ver: "0.7.2", cat: "会话与消息", desc: "会话全程录制与回放：token 级时间线，卡在哪一步一眼看到。", stars: 1120, installs: 4380, tags: ["会话", "回放", "调试"], updated: "1 天前",
      pkg: "session-replay", license: "MIT", repo: "github.com/kka/session-replay", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-16", syncedAt: "",
      why: "作者认领后选了「只外链」：包体里会带本地会话录制文件，不适合站内分发。" },

    { id: "p15", name: "wsl-path-bridge", icon: "🌉", grad: "linear-gradient(135deg,#67e8f9,#0891b2)", author: "u7", ver: "1.9.0", cat: "WSL 与 Windows 互操作", desc: "WSL 与 Windows 路径互转：UNC、反斜杠转义、相对路径一次说清，不再手拼字符串。", stars: 1340, installs: 9260, tags: ["WSL", "路径", "Windows"], updated: "4 小时前",
      pkg: "wsl-path-bridge", license: "Apache-2.0", repo: "github.com/kka/wsl-path-bridge", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-19", syncedAt: "4 小时前",
      file: { name: "wsl-path-bridge-1.9.0.tgz", size: "74 KB", sizeB: 75776, sha: "87b598921137c1e20307aa01d1cc73792fc15ef26360d2f85480603637a00611", at: "2026-10-19" } },

    { id: "p16", name: "web-cdp-probe", icon: "🌐", grad: "linear-gradient(135deg,#7dd3fc,#0284c7)", author: "u6", ver: "2.4.1", cat: "浏览器与网页", desc: "无头 Chrome 取证：视口截图、DOM 探针、像素差分，一键出可复现的证据。", stars: 1650, installs: 8800, tags: ["CDP", "无头", "取证"], updated: "昨天", hot: true,
      pkg: "web-cdp-probe", license: "MIT", repo: "github.com/yehangchuan/web-cdp-probe", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-18", syncedAt: "昨天",
      file: { name: "web-cdp-probe-2.4.1.tgz", size: "112 KB", sizeB: 114688, sha: "eb425d7852bef797cf1210439356f056b93fc944c0627fed0978b952494632c0", at: "2026-10-18" } },

    { id: "p17", name: "tts-voice-lab", icon: "🎙️", grad: "linear-gradient(135deg,#fdba74,#db2777)", author: "u2", ver: "1.0.8", cat: "语音与音频", desc: "语音合成与音轨锁定：把台词排进时间轴，导出带响度标注的音轨。", stars: 760, installs: 3120, tags: ["TTS", "音频", "时间轴"], updated: "1 周前",
      pkg: "tts-voice-lab", license: "MIT", repo: "github.com/ali/tts-voice-lab", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-07", syncedAt: "",
      why: "语音模型体积太大，作者只在仓库 Release 里发；本站只留条目和跳转。" },

    { id: "p18", name: "skill-pack-manager", icon: "🎒", grad: "linear-gradient(135deg,#86efac,#059669)", author: "u7", ver: "3.1.2", cat: "技能包", desc: "技能包安装、版本锁定与依赖体检，装完当场跑一遍自检报告。", stars: 1480, installs: 8440, tags: ["技能", "依赖", "自检"], updated: "7 小时前",
      pkg: "skill-pack-manager", license: "MIT", repo: "github.com/xiaoman/skill-pack-manager", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-19", syncedAt: "7 小时前",
      file: { name: "skill-pack-manager-3.1.2.tgz", size: "132 KB", sizeB: 135168, sha: "c2f910cac4e1c87248703625b9495db040cb123cd8169e775d4cee2400b18b23", at: "2026-10-19" } },

    { id: "p19", name: "flow-runner", icon: "🔁", grad: "linear-gradient(135deg,#fda4af,#e11d48)", author: "u5", ver: "2.2.0", cat: "工作流与自动化", desc: "把重复操作写成流程：条件分支、重试、定时跑，失败原地留现场。", stars: 2100, installs: 9660, tags: ["自动化", "流程", "定时"], updated: "2 小时前", hot: true,
      pkg: "flow-runner", license: "MIT", repo: "github.com/haiyan/flow-runner", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-20", syncedAt: "2 小时前",
      file: { name: "flow-runner-2.2.0.tgz", size: "168 KB", sizeB: 172032, sha: "f334aaa10b990ad5ba50b531a8629cf2eb1cb78ea39a83ea4bc3a090e6cd4457", at: "2026-10-20" } },

    { id: "p20", name: "pr-copilot", icon: "🌿", grad: "linear-gradient(135deg,#a7f3d0,#047857)", author: "u6", ver: "1.5.3", cat: "Git 与代码评审", desc: "提交前自查：diff 摘要、风险点标注、评审意见草稿一次写好。", stars: 1770, installs: 8990, tags: ["Git", "评审", "提交"], updated: "9 小时前",
      pkg: "pr-copilot", license: "MIT", repo: "github.com/yehangchuan/pr-copilot", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-17", syncedAt: "9 小时前",
      file: { name: "pr-copilot-1.5.3.tgz", size: "88 KB", sizeB: 90112, sha: "4e7ceb1f393d375bf4a46f5eb0ff193779cf8dcf7f976ceedcf529c7ea50fdda", at: "2026-10-17" } },

    { id: "p21", name: "hook-bridge", icon: "🔔", grad: "linear-gradient(135deg,#fcd34d,#ea580c)", author: "u2", ver: "1.1.4", cat: "通知与集成", desc: "把 dsh 事件推到聊天工具：跑完、失败、等确认，都会发一条消息。", stars: 690, installs: 3410, tags: ["通知", "Webhook", "集成"], updated: "3 天前",
      pkg: "hook-bridge", license: "MIT", repo: "github.com/doufu/hook-bridge", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-10", syncedAt: "",
      why: "作者只维护 GitHub Release 里的包，站内保留条目与跳转。" },

    { id: "p22", name: "runtime-doctor", icon: "🩺", grad: "linear-gradient(135deg,#5eead4,#14b8a6)", author: "u8", ver: "4.0.2", cat: "开发与运行时", desc: "运行时体检：Node、原生模块、依赖四层生效面，缺哪一层就说哪一层。", stars: 1240, installs: 6580, tags: ["运行时", "原生模块", "体检"], updated: "11 小时前",
      pkg: "runtime-doctor", license: "MIT", repo: "github.com/shiqi/runtime-doctor", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-15", syncedAt: "11 小时前",
      file: { name: "runtime-doctor-4.0.2.tgz", size: "104 KB", sizeB: 106496, sha: "ea282b4dcfd4878859b9c641c5de41f286df93e6732587674b8fc16d61ed2260", at: "2026-10-15" } },

    { id: "p23", name: "permission-audit", icon: "🛡️", grad: "linear-gradient(135deg,#94a3b8,#1e293b)", author: "u8", ver: "2.6.0", cat: "安全与权限", desc: "权限与沙箱审计：谁能读、谁能写、谁在网外，一份清单看到底。", stars: 1080, installs: 4990, tags: ["权限", "沙箱", "审计"], updated: "2 周前",
      pkg: "permission-audit", license: "", repo: "github.com/shiqi/permission-audit", homepage: "",
      tier: "entry", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-01", syncedAt: "",
      why: "仓库没写许可证，作者也还没认领。按 v6 规则只能留条目。" },

    { id: "p24", name: "market-admin", icon: "🏪", grad: "linear-gradient(135deg,#fbbf24,#b45309)", author: "u2", ver: "1.7.1", cat: "插件市场与管理", desc: "条目库后台：认领审核、镜像授权、收录深度三步管完，改动都留记录。", stars: 880, installs: 4060, tags: ["市场", "认领", "审核"], updated: "4 天前",
      pkg: "market-admin", license: "MIT", repo: "github.com/ali/market-admin", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-12", syncedAt: "4 天前",
      file: { name: "market-admin-1.7.1.tgz", size: "118 KB", sizeB: 120832, sha: "65b79460703d2917aa0da9e9eb20c29446b6ab95b61e91e483527b22b07c329f", at: "2026-10-12" } },

    { id: "p25", name: "ascii-arcade", icon: "🕹️", grad: "linear-gradient(135deg,#f9a8d4,#be185d)", author: "u6", ver: "0.3.9", cat: "娱乐", desc: "终端里的小游戏合集：等编译的时候来一局。", stars: 1540, installs: 6720, tags: ["游戏", "终端", "摸鱼"], updated: "1 天前",
      pkg: "ascii-arcade", license: "MIT", repo: "github.com/yehangchuan/ascii-arcade", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-06", syncedAt: "",
      why: "作者说这只是玩具、只在 Gist 里发版，本站不转载。" },

    { id: "p26", name: "image-wire", icon: "🖼️", grad: "linear-gradient(135deg,#93c5fd,#2563eb)", author: "u2", ver: "1.2.5", cat: "视觉与多模态", desc: "图片批处理流水线：裁剪、压缩、转 WebP，出图顺带生成缩略图样式。", stars: 1310, installs: 7730, tags: ["图片", "压缩", "WebP"], updated: "8 小时前",
      pkg: "image-wire", license: "MIT", repo: "github.com/ali/image-wire", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-18", syncedAt: "8 小时前",
      file: { name: "image-wire-1.2.5.tgz", size: "156 KB", sizeB: 159744, sha: "4435512e61c958686babedd2281bafac1c96c2beec0b82cf2a4951688a18a629", at: "2026-10-18" } },

    { id: "p27", name: "tool-forge", icon: "🔧", grad: "linear-gradient(135deg,#cbd5e1,#64748b)", author: "u6", ver: "0.9.4", cat: "工具与能力", desc: "把一次性脚本焊成常驻工具：参数校验、幂等、失败可回滚。", stars: 720, installs: 2880, tags: ["工具", "幂等", "脚本"], updated: "5 天前",
      pkg: "tool-forge", license: "MIT", repo: "github.com/yehangchuan/tool-forge", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-14", syncedAt: "5 天前",
      file: { name: "tool-forge-0.9.4.tgz", size: "68 KB", sizeB: 69632, sha: "3f234d237f71383307af7638055bc22bcf12f252b45288ce7c847846ebb76381", at: "2026-10-14" } },

    { id: "p28", name: "memory-bank", icon: "🗄️", grad: "linear-gradient(135deg,#fde68a,#d97706)", author: "u8", ver: "1.0.1", cat: "记忆", desc: "项目记忆库：按仓库分账，决策与坑各归各的页，换电脑也带得走。", stars: 940, installs: 5540, tags: ["记忆", "知识页", "仓库"], updated: "6 天前",
      pkg: "memory-bank", license: "MIT", repo: "github.com/kka/memory-bank", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-11", syncedAt: "",
      why: "作者只发 GitHub Release，站内保留条目与上游链接。" },
  ];

  const posts = [
    {
      id: "s1", user: "u1", time: "12 分钟前", pinned: true, plugin: "dsh-blender-plugin", pluginVer: "v2.1.0",
      text: "v2.1.0 推送了 🎉\n新增无头通道的第二路（rt_headless），批量几何 + 校验现在可以整批丢给独立进程，不再占着 GUI。顺手修了 2318 对象场景里 persistent_data 首次渲染 14.6s → 0.79s 的老问题。\n\n升级方式：条目页里点下载，或者 pnpm 拉一下。踩到坑的在楼里回，我今晚都在。",
      images: [
        { kind: "shot", grad: "linear-gradient(135deg,#ff9a6c,#ff5f8f)", title: "dsh-blender · 批量渲染", note: "248 帧 / 6 分 12 秒" },
        { kind: "shot", grad: "linear-gradient(135deg,#7dd3fc,#6366f1)", title: "headless 作业队列", note: "jobs 12 done" },
        { kind: "art", grad: "linear-gradient(135deg,#fbcfe8,#a78bfa)", label: "渲染结果" }
      ],
      likes: 328, shares: 41, comments: [
        { user: "u2", text: "终于等到批量！昨晚手动点了 60 次，手都断了", time: "8 分钟前" },
        { user: "u3", text: "persistent_data 那个优化是真的顶，我这边大场景从 9s 掉到 1.1s。", time: "5 分钟前" },
        { user: "u6", text: "请问 Windows 路径要写双反斜杠吗？", time: "刚刚" }
      ]
    },
    {
      id: "s2", user: "u3", time: "1 小时前", plugin: "dsh-remote-deploy", pluginVer: "v1.2.0",
      text: "帮大家踩完远端部署的坑了，四件事按顺序做就不会崩：\n1) 先跑 rw_deploy_probe，确认原生模块能加载；\n2) 装到私有前缀，别动系统 node；\n3) 用 --no-open 起 web，再自己开隧道；\n4) 最后再验一次 127.0.0.1 的端口，别急着发给同事。\n\n详情整理成清单贴在楼中楼了 👇",
      images: [],
      likes: 214, shares: 88, comments: [
        { user: "u4", text: "第 2 条救命，之前装到系统目录直接权限炸了", time: "42 分钟前" },
        { user: "u5", text: "probe 那步太关键了，node-pty 编不过的人 90% 卡这", time: "30 分钟前" }
      ]
    },
    {
      id: "s3", user: "u7", time: "2 小时前", plugin: "genui-kit", pluginVer: "v0.9.7",
      text: "做了一套「插件库」的 GenUI 卡片模板，横向对比三列、安装量用进度条、标签用 badge，复制就能用。\n截图是夜间模式下的效果，颜色全部走主题变量，切主题不会花。",
      images: [
        { kind: "shot", grad: "linear-gradient(135deg,#1e1b4b,#7c3aed)", title: "插件卡片 · 夜间", note: "genui-kit / preset" },
        { kind: "shot", grad: "linear-gradient(135deg,#a78bfa,#f472b6)", title: "标签与安装量", note: "badge + progress" }
      ],
      likes: 176, shares: 22, comments: [
        { user: "u1", text: "配色很舒服，能直接进模板库吗？", time: "1 小时前" }
      ]
    },
    {
      id: "s4", user: "u4", time: "3 小时前", plugin: "", pluginVer: "",
      text: "新人第一帖 🙋 想问下大家插件都是怎么管理的？我现在装了 11 个，模型时钟和免费模型通道有时候会互相打架，是不是优先级要手动排一下……",
      images: [],
      likes: 42, shares: 3, comments: [
        { user: "u5", text: "作者来了。时钟插件的窗口规则优先级高于通道切换，建议把通道固定在时钟的 default 分支里。", time: "2 小时前" },
        { user: "u3", text: "可以看置顶的《插件冲突排查手册》第 3 节。", time: "2 小时前" }
      ]
    },
    {
      id: "s5", user: "u2", time: "5 小时前", plugin: "kinetic-reel", pluginVer: "v2.3.0",
      text: "用 kinetic-reel 给插件做了个 15 秒开场，从建模线框一路推到成品渲染。素材全部代码生成，没有一张外部图。",
      images: [
        { kind: "art", grad: "linear-gradient(135deg,#0f172a,#7c3aed,#f472b6)", label: "开场 00:15" },
        { kind: "art", grad: "linear-gradient(135deg,#fde68a,#f97316)", label: "分镜 03" },
        { kind: "art", grad: "linear-gradient(135deg,#34d399,#0ea5e9)", label: "转场 · 形状连续" },
        { kind: "shot", grad: "linear-gradient(135deg,#312e81,#1e293b)", title: "序列帧输出", note: "900 帧 · 1080p" }
      ],
      likes: 512, shares: 96, comments: [
        { user: "u8", text: "这个转场是怎么算的？形状连续那块", time: "4 小时前" },
        { user: "u7", text: "太顶了，求参数表", time: "3 小时前" }
      ]
    }
  ];

  const threads = [
    { id: "t1", user: "u3", cat: "notice", title: "【置顶】插件冲突排查手册 v3（模型 / 渲染 / 网络 三类）", tag: "公告", replies: 128, views: 18420,
      last: "3 分钟前", hot: true, top: true, solved: true, closed: false, unread: false,
      excerpt: "按加载顺序、命名空间、宿主版本三条线排查，90% 的冲突能定位到具体插件……",
      sub: "加载顺序 / 命名空间 / 宿主版本，三条线锁到具体插件",
      tags: ["冲突排查", "置顶", "手册"], created: "今天 08:40", lastUser: "u8", posters: ["u3", "u8", "u1", "u4", "u6"],
      likes: 386, reactions: { "👍": 24, "🎉": 3, "💡": 57, "🔥": 9, "👀": 14 } },
    { id: "t2", user: "u1", cat: "guide", title: "Blender 无头通道在 2318 对象场景下的实测数据（附脚本）", tag: "经验", replies: 64, views: 9310,
      last: "18 分钟前", hot: true, top: false, solved: false, closed: false, unread: true,
      excerpt: "每轮同步 1.4ms/对象，persistent_data 把重复渲染从 14.6s 压到 0.79s……",
      sub: "2318 对象场景实测：同步是瓶颈，不是采样数",
      tags: ["Blender", "渲染优化", "实测"], created: "今天 07:55", lastUser: "u3", posters: ["u1", "u3", "u5"],
      plugin: "p1", likes: 208, reactions: { "👍": 18, "💡": 11, "🔥": 5 } },
    { id: "t3", user: "u4", cat: "help", title: "求助：pnpm 安装被供应链策略拦截，错误码 ERR_PNPM_...", tag: "求助", replies: 23, views: 4210,
      last: "35 分钟前", hot: false, top: false, solved: true, closed: false, unread: false,
      excerpt: "换 registry 没用，看起来是 minimumReleaseAge 拦的，有没有推荐的放行写法？",
      sub: "换过 registry 无效，怀疑是 minimumReleaseAge 拦的",
      tags: ["pnpm", "安装报错"], created: "今天 09:02", lastUser: "u3", posters: ["u4", "u3"],
      likes: 96, reactions: { "👍": 7, "👀": 9 } },
    { id: "t4", user: "u7", cat: "dev", title: "GenUI 卡片模板征集：你希望内置哪些市场卡片？", tag: "讨论", replies: 51, views: 6720,
      last: "1 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "目前 39 个，缺「版本对比」「依赖树」「评分分布」三块，欢迎认领……",
      sub: "现有 39 个模板，缺版本对比 / 依赖树 / 评分分布",
      tags: ["GenUI", "卡片模板", "征集"], created: "今天 06:10", lastUser: "u7", posters: ["u7", "u2", "u5", "u6"],
      likes: 174, reactions: { "👍": 12, "💡": 9, "🎉": 2 } },
    { id: "t5", user: "u8", cat: "guide", title: "逆向工具链从 2.x 升 3.0 的迁移记录（证据链字段变了）", tag: "经验", replies: 17, views: 2880,
      last: "2 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "旧版 evidence_id 不再可复用，脚本里别硬编码，改成从父记录取……",
      sub: "证据链字段改名：旧 evidence_id 不再可复用",
      tags: ["逆向", "迁移", "证据链"], created: "昨天 22:14", lastUser: "u8", posters: ["u8", "u1"],
      likes: 88, reactions: { "👍": 9, "💡": 6 } },
    { id: "t6", user: "u3", cat: "tool", title: "远端部署 Windows 机器：node-pty 编译失败合集", tag: "教程", replies: 39, views: 5140,
      last: "3 小时前", hot: false, top: false, solved: true, closed: false, unread: true,
      excerpt: "三种解法：私有前缀预编译包 / 换 node 版本 / 用内置的部署体检先定位……",
      sub: "预编译包 / 换 node 版本 / 先用部署体检定位",
      tags: ["远端部署", "Windows", "node-pty"], created: "昨天 20:41", lastUser: "u5", posters: ["u3", "u5", "u2"],
      plugin: "p4", likes: 142, reactions: { "👍": 14, "💡": 7, "👀": 5 } },
    { id: "t7", user: "u6", cat: "help", title: "求一个按项目自动切模型的插件，最好支持节假日规则", tag: "求助", replies: 12, views: 1930,
      last: "4 小时前", hot: false, top: false, solved: false, closed: true, unread: false,
      excerpt: "dsh-model-clock 好像能满足？但我想按 git 仓库再分一层……",
      sub: "dsh-model-clock 接近需求，但缺按仓库分层",
      tags: ["模型时钟", "节假日"], created: "昨天 18:30", lastUser: "u5", posters: ["u6", "u5"],
      plugin: "p2", likes: 47, reactions: { "👍": 3, "👀": 4 } },
    { id: "t8", user: "u5", cat: "notice", title: "插件条目库周报 · 第 12 期（新增 23 个条目）", tag: "周报", replies: 31, views: 7420,
      last: "昨天", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "本周新星：genui-kit、kinetic-reel；更新最勤：dsh-blender-plugin……",
      sub: "本周新星 genui-kit、kinetic-reel，共新增 23 条",
      tags: ["周报", "市场"], created: "昨天 10:00", lastUser: "u5", posters: ["u5", "u1", "u2", "u3"],
      plugin: "p8", likes: 152, reactions: { "👍": 22, "🎉": 6, "🔥": 3 } },
    /* 下面六条是分类扩充时补的演示话题：新增的六个分类各给一条，
       否则左栏会连成一片 0，看着像没人用的板块。优惠福利与网络考古
       故意留空 —— 新开的板块本来就该是空的，全填满反而假。 */
    { id: "t9", user: "u6", cat: "cn", title: "国产模型跑长任务：三家工具调用成功率实测（各 50 次）", tag: "实测", replies: 42, views: 6180,
      last: "42 分钟前", hot: true, top: false, solved: false, closed: false, unread: false,
      excerpt: "同一个五步任务各跑 50 次，成功 41 / 38 / 29。差的不是理解力，是函数参数格式和超时重试……",
      sub: "各 50 次：41 / 38 / 29，差在参数格式与重试策略",
      tags: ["国产模型", "工具调用", "实测"], created: "今天 06:35", lastUser: "u1", posters: ["u6", "u1", "u5", "u3"],
      likes: 176, reactions: { "👍": 19, "💡": 12, "👀": 7 } },
    { id: "t10", user: "u2", cat: "res", title: "整理了一份常用插件清单（28 条，标了体积 / 许可证 / 更新时间）", tag: "资源", replies: 28, views: 4020,
      last: "1 小时前", hot: false, top: false, solved: false, closed: false, unread: true,
      excerpt: "从 23 个分类里挑出日常真的会装的 28 条，每条都写了包信息登记到哪一步、许可证是什么、上次更新在哪天……",
      sub: "28 条按 23 类归好，标注包信息状态 / 许可证 / 更新时间",
      tags: ["插件清单", "整理"], created: "今天 05:20", lastUser: "u8", posters: ["u2", "u8", "u4"],
      likes: 134, reactions: { "👍": 16, "🎉": 5, "💡": 4 } },
    { id: "t11", user: "u5", cat: "pan", title: "网盘分享：Blender 材质球 + HDRI 一批（约 3.2G，CC0）", tag: "网盘", replies: 21, views: 2940,
      last: "2 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "材质球都是 CC0 可商用，按室内 / 室外 / 金属分好了目录；HDRI 有 8K 与 4K 两档，机器吃力就下 4K……",
      sub: "3.2G，材质球 CC0 可商用 + 8K/4K 两档 HDRI",
      tags: ["Blender", "素材"], created: "今天 03:10", lastUser: "u7", posters: ["u5", "u7", "u1"],
      likes: 92, reactions: { "👍": 11, "👀": 8, "🔥": 3 } },
    { id: "t12", user: "u3", cat: "news", title: "0.9 发布：作业队列支持后台化，无头渲染不再堵客户端", tag: "快讯", replies: 24, views: 4470,
      last: "3 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "两处实际影响：长任务可以直接丢后台，客户端连接断了也不丢结果；无头通道单独成章，参数终于有地方查……",
      sub: "长任务丢后台、断连不丢结果，无头通道单独成章",
      tags: ["版本速报", "工具链"], created: "昨天 23:40", lastUser: "u4", posters: ["u3", "u4", "u2"],
      likes: 108, reactions: { "👍": 13, "💡": 9 } },
    { id: "t13", user: "u4", cat: "chat", title: "给插件起名有什么规律？我这几个被说像系统组件", tag: "闲聊", replies: 47, views: 5920,
      last: "4 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "我习惯 dsh- 前缀加两个词，结果朋友说看着像系统自带的东西；见过最好的是把动词写进去的……",
      sub: "dsh- 前缀 + 两个词，被朋友说像系统组件",
      tags: ["起名", "闲聊"], created: "昨天 21:15", lastUser: "u6", posters: ["u4", "u6", "u1", "u8", "u2"],
      likes: 96, reactions: { "👍": 14, "👀": 9, "🎉": 2 } },
    { id: "t14", user: "u8", cat: "ops", title: "建议：插件库列表页加一个「只看已登记包信息」的开关", tag: "建议", replies: 16, views: 2380,
      last: "5 小时前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "现在要一条条点进去看档位才知道包信息登记到哪一步，列表页能直接筛的话，找起来会快很多……",
      sub: "列表页直接筛已登记包信息，省得一条条点进去看档位",
      tags: ["建议", "筛选"], created: "昨天 19:50", lastUser: "u3", posters: ["u8", "u3", "u5"],
      likes: 68, reactions: { "👍": 9, "💡": 5 } },
    /* 人工智能分类的两条演示话题：新开的板块不该是 0 行，但也别塞满 ——
       两条刚好让人看出「这里聊什么」，剩下的交给真帖。 */
    { id: "t15", user: "u2", cat: "ai", title: "本地 7B 模型做翻译流水线：Q4 / Q5 / Q8 三档量化在 24G 显存上的实测", tag: "实测", replies: 33, views: 5840,
      last: "26 分钟前", hot: true, top: false, solved: false, closed: false, unread: true,
      excerpt: "同一批 200 句技术文档：Q8 最稳但慢 2.6 倍，Q5 在长句上开始漏译，Q4 只够当草稿……",
      sub: "200 句实测：Q8 最稳慢 2.6×，Q5 长句漏译，Q4 只能当草稿",
      tags: ["量化", "本地推理", "实测"], created: "今天 03:05", lastUser: "u1", posters: ["u2", "u1", "u6"],
      likes: 131, reactions: { "👍": 15, "💡": 12, "🔥": 4 } },
    { id: "t16", user: "u7", cat: "ai", title: "提示词开头加一句「先列约束再动手」，多步任务成功率从 61% 到 84%", tag: "讨论", replies: 26, views: 4120,
      last: "48 分钟前", hot: false, top: false, solved: false, closed: false, unread: false,
      excerpt: "同一个测试集 100 条任务，只改系统提示词：先复述约束与验收标准，再开始写……",
      sub: "同一测试集 100 条：先复述约束与验收，再开始动手",
      tags: ["提示词", "评测"], created: "今天 02:20", lastUser: "u8", posters: ["u7", "u8", "u4"],
      likes: 118, reactions: { "👍": 13, "💡": 15, "👀": 6 } }
  ];

  /* 社群分类（Discourse category 的简化版）。
     最早是六个（公告 / 经验分享 / 求助问答 / 插件开发 / 工具与部署 / 灌水闲聊），
     左栏七行里三行还是空的，一个真实社区该有的板块基本没落地。现在按
     「技术 → 内容 → 资源 → 资讯 → 闲聊 → 站务」补到十三类，名字都按本站语境
     重写过，不是照搬别人的板块名：插件开发 → 技术开发（写插件只是其中一块，
     API、调试、发布口径都归这里）、工具与部署 → 工具部署（部署与运维排障是
     同一件事，中间那个「与」在 176px 的栏里只会换行）；「读书成诗 / 非我莫属」
     这类跟本站题材不搭的不搬，换成网络考古（旧站存档、互联网往事）与站务反馈。
     后来又单列了「人工智能」（模型选型、提示词、智能体、评测）：这类话题原先散在
     国产软件与科技快讯里，问的人找不到自己的板块，所以成了第十四类。
     id 发出去就是话题 cat 与 catTagAlias 的索引，改名可以，改 id 不行。 */
  const categories = [
    { id: "notice", name: "公告",     icon: "📣", desc: "官方公告、规则与版本说明" },
    /* 次序在 2026-10-22 按行号改过多轮（行号含首行「全部」，即卡片从上往下第几行）：
       ① 科技快讯上移到第 4 行；
       ② 3↔8：技术开发 ↔ 人工智能；
       ③ 3↔11、5↔8：技术开发 ↔ 优惠福利、人工智能 ↔ 求助问答；
       ④ 更早一轮：优惠福利 ↔ 技术开发、灌水闲聊 ↔ 工具部署。
       数组次序就是左栏卡与发帖下拉的显示次序，改次序只动这个数组（服务端 forums.sort 同步改）。 */
    /* 人工智能：模型能力、推理与提示词、智能体与评测。id 用 ai —— 发出去就是话题
       cat 的索引（threadCountOf / 筛选 / 面包屑都按它比对），改名可以，改 id 不行。 */
    { id: "ai",     name: "人工智能", icon: "🤖", desc: "模型能力、推理与提示词、智能体与评测" },
    { id: "news",   name: "科技快讯", icon: "📰", desc: "版本速报、行业动态与解读" },
    { id: "chat",   name: "灌水闲聊", icon: "☕", desc: "与插件无关的都放这儿" },
    { id: "help",   name: "求助问答", icon: "🆘", desc: "卡住了就来问，答对点采纳" },
    { id: "cn",     name: "国产软件", icon: "🀄", desc: "国产模型与软件的实测、替代方案" },
    { id: "guide",  name: "经验分享", icon: "🧠", desc: "踩过的坑、实测数据与复盘" },
    { id: "dev",    name: "技术开发", icon: "🧩", desc: "API、调试、发布与兼容性" },
    { id: "res",    name: "资源分享", icon: "📚", desc: "教程、脚本、配置与清单合集" },
    { id: "pan",    name: "网盘资源", icon: "🗂️", desc: "网盘链接、转存说明与提取码" },
    { id: "deal",   name: "优惠福利", icon: "🎁", desc: "折扣、免费额度与羊毛情报" },
    { id: "memory", name: "网络考古", icon: "🗄️", desc: "旧站存档、互联网往事与冷知识" },
    { id: "tool",   name: "工具部署", icon: "🛠️", desc: "环境、远端部署与运维排障" },
    { id: "ops",    name: "站务反馈", icon: "🧭", desc: "站点问题、规则建议与功能提案" }
  ];

  /* 插件分类：市场、左栏「插件分类」、发布页共用这一份，别再各写一遍。
     分类表对齐 DSH 插件市场的标签云（23 类，顺序照搬）：旧的「创作/效率/界面/运维/逆向」
     粒度太粗，九个条目全挤在两三类里，左栏十行里七行是空的，看不出维度。 */
  const pluginCats = [
    "AGI 架构探索", "UI 增强", "用量与计费", "主题与外观", "模型与账号接入", "身份与通信",
    "会话与消息", "记忆", "工具与能力", "WSL 与 Windows 互操作", "浏览器与网页", "视觉与多模态",
    "语音与音频", "文档与渲染", "技能包", "工作流与自动化", "Git 与代码评审", "通知与集成",
    "开发与运行时", "安全与权限", "远程与移动端", "插件市场与管理", "娱乐"
  ];

  /* 旧分类 → 新分类的迁移表：线上接口（server/src/routes/forums.js 的 /plugins）回来的
     cat 还是库里存的旧值，直接透传会让左栏 23 类全落到 0，所以按 slug 优先、分类名兜底
     归一化一次。服务器重跑 seed 之后这张表就是空转，留着不碍事。 */
  const pluginCatMigrate = {
    bySlug: {
      "dsh-blender-plugin": "视觉与多模态", "dsh-model-clock": "模型与账号接入", "genui-kit": "UI 增强",
      "dsh-remote-deploy": "远程与移动端", "rea-toolbelt": "安全与权限", "hindsight-memory": "记忆",
      "dsh-our-free-model": "模型与账号接入", "kinetic-reel": "视觉与多模态", "dsh-badge": "文档与渲染"
    },
    byCat: { "创作": "视觉与多模态", "效率": "模型与账号接入", "界面": "UI 增强", "运维": "远程与移动端", "逆向": "安全与权限" }
  };

  /* 社群分类与主标签是两套维度，但有三对同义：公告=公告、经验分享=经验、求助问答=求助。
     同义时只显示彩色标签，否则同一行会出现「求助」+「求助问答」两个近义提醒。 */
  const catTagAlias = { notice: "公告", guide: "经验", help: "求助" };

  /* Discourse reactions：可点的表情，计数随状态增减 */
  const REACTIONS = ["👍", "🎉", "💡", "🔥", "👀"];

  /* 标签云（linux.do 顶部的 tag cloud） */
  const tagCloud = ["冲突排查", "Blender", "远端部署", "GenUI", "pnpm", "渲染优化", "模型时钟", "逆向", "node-pty", "周报"];

  /* v24 · 标签分组（linux.do /tags 的分节口径）
     参考页把标签按 tag group 分成几节铺开，每节一个标题一句说明。这里沿用同一结构，
     但**只登记「谁归哪一节」**：计数不写在这里，由 js/app.js 的 tagCountOf() 按
     threadPool() 现算 —— 写死计数会在新帖发出后与社群页对不上。

     两条纪律：
       1) 一个标签只能出现在一组里（重复登记时以先出现的为准，页面不报错）；
       2) 不是每个标签都必须登记 —— 漏掉的会自动落到「未分组」一节，
          所以发帖时随手写的新标签不会从标签页消失，只是暂时没有归组。
     id 供折叠状态与测试定位使用，改名随意、改 id 要同步改 css/app.css 的 .tags-group 规则。 */
  const tagGroups = [
    { id: "notice", name: "站务与公告", desc: "站点自己的事：公告、周报、征集与投票", tags: ["公告", "周报", "征集", "建议", "筛选", "市场"] },
    { id: "dev", name: "开发与插件", desc: "写插件、调工具链、界面与提示词", tags: ["pnpm", "node-pty", "GenUI", "卡片模板", "插件清单", "整理", "工具调用", "提示词", "评测"] },
    { id: "ops", name: "部署与运维", desc: "装不上、连不通、搬机器 —— 环境类问题", tags: ["远端部署", "Windows", "安装报错", "迁移", "工具链"] },
    { id: "model", name: "模型与推理", desc: "模型能力、量化与本地跑分", tags: ["模型时钟", "国产模型", "量化", "本地推理", "节假日"] },
    { id: "create", name: "创作与素材", desc: "Blender、渲染与可下载的资源", tags: ["Blender", "渲染优化", "素材", "网盘", "资源"] },
    { id: "talk", name: "经验与求助", desc: "踩坑记录、求助帖与教程", tags: ["经验", "求助", "讨论", "教程", "实测", "手册"] },
    { id: "re", name: "逆向与排查", desc: "逆向、冲突定位与证据链", tags: ["逆向", "冲突排查", "证据链"] },
    { id: "chat", name: "闲聊与速报", desc: "灌水、起名、快讯与版本速报", tags: ["闲聊", "起名", "快讯", "版本速报"] }
  ];

  /* 社群准则四原则：每条压成一行 = 原则名 + 半句该做 + 半句不该做（「不」在后半句，读起来是一句人话） */
  const guidelines = [
    { icon: "💚", t: "真诚", s: "有话直说，不装懂" },
    { icon: "🤝", t: "友善", s: "对人客气，不攻击" },
    { icon: "🧑‍🤝‍🧑", t: "团结", s: "能帮就帮，不藏私" },
    { icon: "🔬", t: "专业", s: "贴报错原文，不空谈" }
  ];

  const floors = [
    { user: "u3", time: "今天 09:12", text: "先占楼，晚上补完整清单。加载顺序那一节已经写完了，先放结论：\n\n1. 同名命令后加载的覆盖先加载的；\n2. 网络类插件最容易互相踩，端口要先约定；\n3. 渲染类只有 Blender 系会抢主线程，其他都是异步。", likes: 88, reactions: { "👍": 21, "💡": 34, "🔥": 6 } },
    { user: "u1", time: "今天 09:40", replyTo: "u3", text: "补充一点：宿主版本不一致时，先看 capability 探测结果，不要看文档写的版本号。文档永远慢半拍。", quote: "豆腐：加载顺序那一节已经写完了", likes: 41, reactions: { "👍": 12, "💡": 9 } },
    { user: "u6", time: "今天 10:05", text: "请教下，如果两个插件都注册了同一个快捷键，有没有办法在启动日志里看出来谁赢了？", likes: 6, reactions: { "👀": 4 } },
    { user: "u3", time: "今天 10:22", replyTo: "u6", text: "回楼上：启动日志里有 keybinding registered 那行，按时间顺序最后一条生效。实在不行把 debug 打开，会打印覆盖链。", quote: "夜航船：有没有办法在启动日志里看出来谁赢了？", likes: 23, reactions: { "👍": 8, "🎉": 2 } }
  ];

  const visitors = [
    { user: "u2", time: "刚刚", action: "看了你的插件" },
    { user: "u3", time: "6 分钟前", action: "赞了你的日志" },
    { user: "u5", time: "21 分钟前", action: "访问了主页" },
    { user: "u7", time: "48 分钟前", action: "收藏了帖子" },
    { user: "u4", time: "1 小时前", action: "访问了主页" },
    { user: "u8", time: "2 小时前", action: "关注了你" },
    { user: "u6", time: "3 小时前", action: "访问了主页" },
    { user: "u1", time: "5 小时前", action: "留言" }
  ];

  /* 消息中心（v18）：照 B 站的做法先把消息分成类，再谈页签与未读。
     分类是消息自己的属性（kind），不是从文案里猜出来的；id 稳定，已读状态按 id 存，
     于是「一键已读」「单条已读」「按类未读数」走的是同一套数据，不会互相打脸。
     unread:false 表示这条一出生就是已读（系统通知类），不代表用户点过。 */
  const noticeKinds = [
    { id: "all", name: "全部", icon: "📨" },
    { id: "reply", name: "回复", icon: "💬" },
    { id: "like", name: "点赞", icon: "👍" },
    { id: "dm", name: "私信", icon: "✉️" },
    { id: "notice", name: "通知", icon: "📣" }
  ];

  const notices = [
    { id: "n1", kind: "reply", from: "u3", icon: "💬", tone: "blue", title: "豆腐 回复了你的帖子", desc: "「persistent_data 那个优化是真的顶，同步那 4 秒省下来就是纯赚。」", time: "5 分钟前", to: { route: "forum" } },
    { id: "n2", kind: "reply", from: "u5", icon: "🗨️", tone: "blue", title: "海盐柠檬 在帖子里 @ 了你", desc: "「@林深见鹿 你上次说的命名空间冲突，是这个报错吗？」", time: "22 分钟前", to: { route: "thread", tid: "t2" } },
    { id: "n3", kind: "reply", from: "u7", icon: "💬", tone: "blue", title: "小满 回复了你的空间留言", desc: "「模板我发你一份，直接用就行。」", time: "1 小时前", to: { route: "space" } },
    { id: "n4", kind: "like", from: "u2", icon: "👍", tone: "amber", title: "阿离 赞了你的日志", desc: "「v2.1 渲染管线重写：从 14.6s 到 0.79s」", time: "12 分钟前", to: { route: "feed" } },
    { id: "n5", kind: "like", from: "u8", icon: "👍", tone: "amber", title: "十七 赞了你的楼层", desc: "「先把证据链落盘，再谈结论。」", time: "2 小时前", to: { route: "forum" } },
    { id: "n6", kind: "like", from: "", icon: "⭐", tone: "amber", title: "你的插件今天收到 12 个星标", desc: "dsh-blender-plugin · 累计 ★ 2,841", time: "6 小时前", to: { route: "market" } },
    { id: "n7", kind: "dm", from: "u5", icon: "✉️", tone: "green", title: "海盐柠檬 给你发了私信", desc: "「方便看下我那个 pnpm 报错吗？minimumReleaseAge 那个。」", time: "8 分钟前", to: { route: "space", uid: "u5" } },
    { id: "n8", kind: "dm", from: "u3", icon: "✉️", tone: "green", title: "豆腐 给你发了私信", desc: "「版务：条目 p4 的许可证要补一下，不然只能降成仅条目。」", time: "昨天", to: { route: "space", uid: "u3" } },
    { id: "n9", kind: "notice", from: "", icon: "📣", tone: "rose", title: "插件库新增「依赖树」视图", desc: "可查看插件间引用关系与冲突提示。", time: "昨天", unread: false, to: { route: "policy" } },
    { id: "n10", kind: "notice", from: "", icon: "🛠️", tone: "rose", title: "本周维护窗口：周六 02:00 – 04:00", desc: "期间发布与上传功能暂停，其余功能正常。", time: "2 天前", unread: false, to: { route: "policy" } }
  ];

  const hotTopics = [
    { tag: "插件冲突排查", count: "1.2k 讨论", trend: "+38%" },
    { tag: "Blender 无头渲染", count: "864 讨论", trend: "+21%" },
    { tag: "远端部署", count: "612 讨论", trend: "+12%" },
    { tag: "GenUI 模板", count: "528 讨论", trend: "+9%" },
    { tag: "逆向证据链", count: "302 讨论", trend: "+4%" }
  ];

  const boards = [
    { icon: "🧩", name: "插件库", desc: "9 个条目 · 4 个已登记包" },
    { icon: "💬", name: "讨论区", desc: "今日 386 帖" },
    { icon: "🐛", name: "问题反馈", desc: "62 个待解决" },
    { icon: "📚", name: "文档中心", desc: "v2.1 已更新" }
  ];

  const profileFields = [
    ["昵称", "林深见鹿"], ["等级", "Lv.12 · 插件作者"], ["城市", "浙江 杭州"],
    ["注册", "2024-11-08"], ["签名", "写插件，也写诗。"], ["擅长", "Blender / 动效 / 记忆库"]
  ];

  /* ------------------------------------------------------------
     编辑资料页的选项表（参考 B 站个人中心的资料表单）
     省市做成二级联动：选了省才给出对应的市，避免一次列出一百多项。
     ------------------------------------------------------------ */
  const profileOptions = {
    genders: ["保密", "男", "女"],
    provinces: {
      "浙江": ["杭州", "宁波", "温州", "嘉兴"],
      "广东": ["广州", "深圳", "珠海", "东莞"],
      "江苏": ["南京", "苏州", "无锡", "常州"],
      "四川": ["成都", "绵阳", "德阳"],
      "湖北": ["武汉", "宜昌", "襄阳"],
      "陕西": ["西安", "咸阳", "宝鸡"],
      "北京": ["朝阳区", "海淀区", "西城区", "东城区"],
      "上海": ["浦东新区", "徐汇区", "静安区", "黄浦区"],
      "福建": ["福州", "厦门", "泉州"],
      "云南": ["昆明", "大理", "丽江"]
    },
    jobs: ["学生", "前端工程师", "全栈工程师", "算法工程师", "设计师", "独立开发者", "产品经理", "其他"],
    tags: ["Blender", "动效", "记忆库", "逆向", "GenUI", "Rust", "部署", "模型调度", "视频", "终端"],
    interests: ["插件开发", "界面设计", "模型应用", "部署运维", "逆向分析", "视频创作", "文档写作"],
    avatarPresets: [
      { grad: "linear-gradient(135deg,#7aa2ff,#a46bff)", emoji: "🦌" },
      { grad: "linear-gradient(135deg,#ffb36b,#ff6b9d)", emoji: "🍊" },
      { grad: "linear-gradient(135deg,#5ad1c8,#3f8bff)", emoji: "🧊" },
      { grad: "linear-gradient(135deg,#c084fc,#f472b6)", emoji: "🐱" },
      { grad: "linear-gradient(135deg,#fde68a,#f59e0b)", emoji: "🍋" },
      { grad: "linear-gradient(135deg,#86efac,#22c55e)", emoji: "🌿" },
      { grad: "linear-gradient(135deg,#93c5fd,#6366f1)", emoji: "🛸" },
      { grad: "linear-gradient(135deg,#f472b6,#7c3aed)", emoji: "🎬" }
    ],
    covers: [
      { grad: "linear-gradient(135deg,#7cc9ff,#b3e4ff 55%,#ffe6f3)", note: "默认 · 云海" },
      { grad: "linear-gradient(135deg,#0f2027,#2c5364 60%,#4b9fd6)", note: "深夜蓝" },
      { grad: "linear-gradient(135deg,#fbc2eb,#a6c1ee)", note: "樱与海" },
      { grad: "linear-gradient(135deg,#11998e,#38ef7d)", note: "薄荷绿" },
      { grad: "linear-gradient(135deg,#ff9a6c,#ff5f8f)", note: "落日橙" },
      { grad: "linear-gradient(135deg,#141e30,#243b55)", note: "墨蓝" }
    ]
  };

  /* ------------------------------------------------------------
     v6 · 作者认领与站内分发的配套数据
     共同前提：三种验证方式都必须「只有仓库所有者能做到」，
     所以它们证明的不是「你懂这个包」，而是「这个仓库是你的」。
     ------------------------------------------------------------ */
  const claimMethods = [
    { id: "readme", icon: "📄", name: "README 验证", ttl: "24 小时内有效",
      desc: "把验证串写进仓库 README，平台读一次就能确认你是所有者。",
      where: "README.md 的任意位置（顶部或末尾都行）",
      steps: ["复制下面的验证串", "把验证串粘贴进仓库根目录的 README.md，随便哪一行", "提交并推送到主分支", "回到这里点「我已添加，开始验证」"],
      fail: "在 README 里没找到这段文字。可能还没推送、改动在别的分支，或者仓库是私有的。" },
    { id: "issue", icon: "💬", name: "Issue 验证", ttl: "创建后 7 天内有效",
      desc: "在仓库里新建一个 issue，把验证串贴进标题或正文，平台读取该 issue。",
      where: "新建 issue 的标题或正文",
      steps: ["复制下面的验证串", "在仓库里 New issue，标题填「verify」并粘贴验证串", "提交 issue（不用关闭，验证完可以删）", "回到这里点「我已提交，开始验证」"],
      fail: "在最近 20 个 issue 里没找到这段文字。可能建在了别的仓库，或者 issue 被转成了私密。" },
    { id: "gist", icon: "🗂️", name: "Gist 验证", ttl: "24 小时内有效",
      desc: "建一个公开 gist，文件名固定，内容就是验证串；平台按你的 GitHub 账号读取。",
      where: "gist 文件名 seekbbs-verify.txt",
      steps: ["复制下面的验证串", "打开 gist.github.com 新建公开 gist", "文件名填 seekbbs-verify.txt，内容粘贴验证串", "回到这里点「我已创建，开始验证」"],
      fail: "没找到这个公开 gist。gist 必须是公开的、文件名必须是 seekbbs-verify.txt。" }
  ];

  /* 授权条款五条：上传页要逐条勾，政策页作为正文复用 */
  const grantTerms = [
    "我是该插件的作者，或已获得作者的书面授权。",
    "我同意本站展示这个包的信息（文件名、大小、sha256）和作者仓库链接；文件仍放在我自己的仓库，本站不托管、也不缓存安装包。",
    "我确认这个包不含恶意代码、挖矿程序或未声明的外传行为。",
    "我理解本站可以因安全扫描结果或第三方投诉撤掉包信息展示，并保留审核记录。",
    "我可以随时要求撤掉展示，撤回后本站会在 24 小时内移除包信息与取包入口。"
  ];

  /* 举报：四类固定选项，不做自由填写，避免分类失效 */
  const reportTypes = [
    { id: "copyright", t: "侵犯版权", d: "这个包或其中的资源不属于上传者" },
    { id: "malware", t: "含恶意代码", d: "可疑外连、挖矿、读取隐私目录" },
    { id: "wrong", t: "信息严重失实", d: "版本、许可证或作者信息明显不对" },
    { id: "other", t: "其他", d: "以上都不适用，请在说明里写清楚" }
  ];

  /* 许可证参考表（政策页「我们转载什么」用）：只回答「能不能转载」，不解释条文 */
  const licenseRows = [
    { lic: "MIT / ISC / BSD-2 / BSD-3", dist: "可以", duty: "保留版权声明与许可全文" },
    { lic: "Apache-2.0", dist: "可以", duty: "保留 NOTICE 与许可全文，标注改动" },
    { lic: "MPL-2.0", dist: "可以", duty: "保留许可全文，改动的文件需公开" },
    { lic: "GPL-2.0 / GPL-3.0", dist: "可以", duty: "整包分发需同样以 GPL 提供源码" },
    { lic: "LGPL-2.1 / LGPL-3.0", dist: "可以", duty: "保留许可，允许替换库文件" },
    { lic: "AGPL-3.0", dist: "可以", duty: "网络使用也视为分发，需提供源码" },
    { lic: "未声明（无 LICENSE 文件）", dist: "只放外链", duty: "默认保留所有权利，不转载" },
    { lic: "UNLICENSED / All rights reserved", dist: "只放外链", duty: "明确保留权利，需书面授权" },
    { lic: "自定义 / 商业许可", dist: "需作者同意", duty: "以作者书面许可为准" }
  ];

  /* 作者可见的下载数据：7 天趋势用一列小柱子画，不做图表库 */
  const pkgStats = {
    p1: { downloads: 4821, week: [412, 508, 466, 731, 690, 812, 1202], issues: 12 },
    p2: { downloads: 2180, week: [220, 260, 198, 310, 288, 342, 562], issues: 5 },
    p4: { downloads: 1640, week: [180, 210, 176, 240, 236, 268, 330], issues: 9 },
    p7: { downloads: 940, week: [102, 118, 96, 131, 122, 148, 223], issues: 3 }
  };

  /* ------------------------------------------------------------
     v22 · 鲸鲸空间：鲸鱼娘二创作品

     每一条都记两件不同的事，缺一不可：
       by  —— 谁在本站发布的（发布者，一定是站内账号）
       art —— 作品真正的作者与出处（原作，可能根本不在本站）
     二创里这两者经常不是同一个人。卡片和详情页都必须分成两块显示：
     合成一句「by xxx」等于把搬运工写成作者，出处也就不可追溯了。

       perm: own   本人发布（发布者就是原作者）
             ok    已获作者授权（私信 / 邮件，附存档编号）
             open  作者公开允许转载（原帖写明「转载请注明」）
             index 未获授权 —— 只做索引，本站不存图、不显示图
       lic  —— 授权凭据的一句话摘要，详情页原样展示
     ------------------------------------------------------------ */
  const artKinds = [
    { id: '插画', icon: '🖌️' },
    { id: '动图', icon: '🎞️' },
    { id: '表情包', icon: '😀' },
    { id: '手书', icon: '📽️' },
    { id: '短漫', icon: '📖' },
    /* v24 · 3D 模型：上传 .obj/.stl 会在本机解析成真网格，.blend/.fbx 这类只按指纹生成示意低模 */
    { id: '3D 模型', icon: '🧊' }
  ];

  const arts = [
    { id: 'a1', title: '浪尖上的午睡', kind: '插画', by: 'u3', perm: 'ok',
      art: { name: '盐焗鲸鱼', platform: '米画师', url: 'https://www.mihuashi.com/artworks/1092331', handle: '@saltwhale' },
      lic: '作者私信授权转载，存档 A-118', desc: '她趴在浪尖上睡着了，尾巴还在一晃一晃。画了三版才把这个「晃」画对。',
      tags: ['鲸鱼娘', '海面', '黄昏'], likes: 412, favs: 96, comments: 18, time: '3 小时前', date: '2026-10-21', seed: 0 },

    { id: 'a2', title: '吐泡泡三连', kind: '动图', by: 'u2', perm: 'open',
      art: { name: '小行星P', platform: 'Pixiv', url: 'https://www.pixiv.net/artworks/118204773', handle: '@planet_p' },
      lic: '作者主页写「转载保留署名即可」', desc: '三个循环：眨眼、吐泡、被自己吐的泡吓到。做成 GIF 才看得出那个顿点。',
      tags: ['GIF', '循环', '气泡'], likes: 638, favs: 214, comments: 27, time: '6 小时前', date: '2026-10-21', seed: 1 },

    { id: 'a3', title: '鲸鱼娘·打工人六件套', kind: '表情包', by: 'u4', perm: 'own',
      art: { name: 'K酱', uid: 'u4', platform: '本站', url: '', handle: '' },
      lic: '本人绘制，直接取用', desc: '「收到」「在改了」「今天先这样」——六张一套，群里用起来很顺手。',
      tags: ['原创', '表情', '摸鱼'], likes: 1204, favs: 587, comments: 64, time: '昨天', date: '2026-10-20', seed: 2 },

    { id: 'a4', title: '她今天也没赶上车', kind: '短漫', by: 'u7', perm: 'ok',
      art: { name: '三点水', platform: '微博', url: 'https://weibo.com/ttarticle/p/show?id=2310474701188', handle: '@三点水' },
      lic: '作者授权转载，私信 10-14', desc: '八格。讲的是一只鲸鱼娘每天追公交，最后决定游过去。看完有点想哭。',
      tags: ['短漫', '八格', '日常'], likes: 356, favs: 143, comments: 41, time: '昨天', date: '2026-10-20', seed: 3 },

    { id: 'a5', title: '鲸落（手书）', kind: '手书', by: 'u8', perm: 'open',
      art: { name: '阿凛', platform: 'bilibili', url: 'https://www.bilibili.com/video/BV1xx411c7mD', handle: '@阿凛_rin' },
      lic: 'B 站简介注明「转载请注明」', desc: '两分半的手书，从落水到沉底。画风一直在掉饱和度，看到最后才发现。',
      tags: ['手书', '鲸落', '黑白'], likes: 892, favs: 401, comments: 73, time: '2 天前', date: '2026-10-19', seed: 4 },

    { id: 'a6', title: '深海的灯', kind: '插画', by: 'u6', perm: 'index',
      art: { name: 'Miko', platform: '小红书', url: 'https://www.xiaohongshu.com/explore/66f0a1c2000000001e02b7f1', handle: '@miko.drawn' },
      lic: '没联系上作者，只留索引与原帖链接', desc: '一直没找到作者本人，所以这张只挂出处不存图 —— 想看原作点链接过去。',
      tags: ['深海', '灯光', '仅索引'], likes: 176, favs: 22, comments: 9, time: '2 天前', date: '2026-10-19', seed: 5 },

    { id: 'a7', title: '摆烂鲸', kind: '表情包', by: 'u5', perm: 'own',
      art: { name: '海盐柠檬', uid: 'u5', platform: '本站', url: '', handle: '' },
      lic: '本人绘制，随便用', desc: '躺平、装死、翻身继续躺。三张。画的时候我自己也在躺。',
      tags: ['原创', '表情', '躺平'], likes: 743, favs: 322, comments: 38, time: '3 天前', date: '2026-10-18', seed: 0 },

    { id: 'a8', title: '浮标', kind: '插画', by: 'u1', perm: 'own',
      art: { name: '林深见鹿', uid: 'u1', platform: '本站', url: '', handle: '' },
      lic: '本人绘制，站内可转载（署名）', desc: '给插件库画的头图废稿。最后没用上，但那只浮标我挺喜欢的。',
      tags: ['原创', '浮标', '夜'], likes: 288, favs: 74, comments: 15, time: '3 天前', date: '2026-10-18', seed: 1 },

    { id: 'a9', title: '尾鳍一闪', kind: '动图', by: 'u3', perm: 'ok',
      art: { name: '夜航鲸', platform: '米画师', url: 'https://www.mihuashi.com/artworks/1088112', handle: '@nightwhale' },
      lic: '作者授权转载，存档 A-102', desc: '两帧循环，只有尾巴动。发在群里的时候所有人都盯着看。',
      tags: ['GIF', '尾鳍', '循环'], likes: 521, favs: 188, comments: 22, time: '4 天前', date: '2026-10-17', seed: 2 },

    { id: 'a10', title: '潮汐表', kind: '插画', by: 'u2', perm: 'index',
      art: { name: '白噪音', platform: 'Pixiv', url: 'https://www.pixiv.net/artworks/117082000', handle: '@whitenoise' },
      lic: '作者禁止转载，只做索引', desc: '原作明确写了不许转载，所以这里只有条目：作者、平台、原帖链接。',
      tags: ['潮汐', '仅索引', '禁止转载'], likes: 143, favs: 11, comments: 6, time: '5 天前', date: '2026-10-16', seed: 3 },

    { id: 'a11', title: '四格：换气', kind: '短漫', by: 'u8', perm: 'own',
      art: { name: '十七', uid: 'u8', platform: '本站', url: '', handle: '' },
      lic: '本人绘制，转载请署名', desc: '四格，讲她第一次浮上来换气。第二格我留白了一整格，别以为是没画完。',
      tags: ['原创', '四格', '留白'], likes: 402, favs: 131, comments: 29, time: '6 天前', date: '2026-10-15', seed: 4 },

    { id: 'a12', title: '海盐汽水', kind: '手书', by: 'u4', perm: 'open',
      art: { name: '海盐柠檬', uid: 'u5', platform: '本站', url: '', handle: '' },
      lic: '作者在本站帖里写明「欢迎二创，保留署名」', desc: '把海盐柠檬那组插画串成了 40 秒的手书，配乐是站友借的。',
      tags: ['手书', '二创', '汽水'], likes: 967, favs: 455, comments: 58, time: '1 周前', date: '2026-10-14', seed: 5 },

    /* v24 · 3D：一件本站发布的白模、一件转载的关卡草模。
       两件都是「示意网格」——真网格要等用户自己上传 .obj / .stl 才会出现 */
    { id: 'a13', title: '鲸鲸摆件 · 白模', kind: '3D 模型', by: 'u8', perm: 'own',
      art: { name: '十七', uid: 'u8', platform: '本站', url: '', handle: '' },
      lic: '本人建模，欢迎二创署名', desc: 'Blender 里捏的一只小摆件，导出 OBJ 上传。详情页可以拖着转视角。',
      tags: ['3D', '摆件', 'OBJ'], likes: 318, favs: 96, comments: 12, time: '2 天前', date: '2026-10-19', seed: 6,
      model: { name: 'whale-charm.obj', fmt: 'OBJ', size: 486213, tris: 258, kind: 'proc', seed: 20261019 } },

    { id: 'a14', title: '深海观测舱（关卡草模）', kind: '3D 模型', by: 'u2', perm: 'open',
      art: { name: '白噪音', platform: 'Pixiv', url: 'https://www.pixiv.net/artworks/117099001', handle: '@whitenoise' },
      lic: '作者在帖里写明「草模可直接用」', desc: 'FBX 导出的关卡草模。浏览器不解析这种格式，只按文件指纹生成了示意低模 —— 看真实外观请下载原文件。',
      tags: ['3D', '关卡', 'FBX'], likes: 205, favs: 74, comments: 9, time: '3 天前', date: '2026-10-18', seed: 7,
      model: { name: 'deep-dock.fbx', fmt: 'FBX', size: 1263820, tris: 258, kind: 'proc', seed: 20261018 } }
  ];

  return { users, plugins, posts, threads, categories, pluginCats, pluginCatMigrate, catTagAlias, REACTIONS, tagCloud, tagGroups, guidelines, floors, visitors, notices, noticeKinds, hotTopics, boards, profileFields, profileOptions,
    claimMethods, grantTerms, reportTypes, licenseRows, pkgStats,
    /* v22 · 鲸鲸空间 */ artKinds, arts };
})();
