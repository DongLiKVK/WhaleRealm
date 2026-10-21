
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
       tier  = pack（站内包）/ link（外链）/ entry（仅条目）
       source= author（作者上传或授权代抓）/ mirror（本站转载，历史遗留）/ none
       claimed = 作者是否已完成仓库认领（README / Issue / Gist 三选一）
       mirror  = auto（跟随 tag 自动同步）/ manual（仅手动上传）/ off（未授权）
       freshness = synced（与上游同步）/ manual（作者手动上传）/ stale（本站转载，可能落后）
     ------------------------------------------------------------ */
  const plugins = [
    { id: "p1", name: "dsh-blender-plugin", icon: "🎨", grad: "linear-gradient(135deg,#ff9a6c,#ff5f8f)", author: "u1", ver: "2.1.0", cat: "创作", desc: "把 Blender 直接接进对话：程序化建模、批量渲染、无头出图，一句话改一个场景。", stars: 2841, installs: 18320, tags: ["Blender", "建模", "渲染"], updated: "2 小时前", hot: true,
      pkg: "dsh-blender-plugin", license: "MIT", repo: "github.com/linshen/blender-plugin", homepage: "linshen.dev/blender",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-18", syncedAt: "2 小时前",
      file: { name: "dsh-blender-plugin-2.1.0.tgz", size: "1.8 MB", sizeB: 1887437, sha: "9f2c4b7e18a3d6504c1b9e7a2d85f04c3b6e1a9d7c4f20b83e5a6d1c9f7b4e20", at: "2026-10-18" } },

    { id: "p2", name: "dsh-model-clock", icon: "⏰", grad: "linear-gradient(135deg,#7dd3fc,#4f46e5)", author: "u5", ver: "1.4.2", cat: "效率", desc: "按时间窗自动切换模型：白天用快模型跑量，夜里切深度推理，节假日单独一套。", stars: 1922, installs: 12040, tags: ["调度", "模型", "自动化"], updated: "昨天",
      pkg: "dsh-model-clock", license: "MIT", repo: "github.com/haiyan/model-clock", homepage: "haiyan.cc/model-clock",
      tier: "pack", source: "author", claimed: true, mirror: "manual", freshness: "manual", collected: "2026-10-16", syncedAt: "昨天",
      file: { name: "dsh-model-clock-1.4.2.tgz", size: "63 KB", sizeB: 64231, sha: "4a7e1c93b0d6825f7e31a4c9d8062b5e1c9f7a3d4b0e268d5a1c7f93e04b2d61", at: "2026-10-16" } },

    { id: "p3", name: "genui-kit", icon: "🧩", grad: "linear-gradient(135deg,#a78bfa,#f472b6)", author: "u7", ver: "0.9.7", cat: "界面", desc: "dsh-ui 组件模板库与校验器：39 个常用卡片模板，写完当场 validate。", stars: 1560, installs: 9840, tags: ["GenUI", "组件", "模板"], updated: "3 天前",
      pkg: "genui-kit", license: "MIT", repo: "github.com/xiaoman/genui-kit", homepage: "",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-12", syncedAt: "",
      why: "作者尚未认领，也没授权本站镜像。按 v6 规则，没有作者授权就不放站内包。" },

    { id: "p4", name: "dsh-remote-deploy", icon: "🛰️", grad: "linear-gradient(135deg,#5eead4,#0ea5e9)", author: "u3", ver: "1.2.0", cat: "运维", desc: "远端机器一键部署 dsh web，自带体检、私有前缀安装与连通性验证。", stars: 1204, installs: 7350, tags: ["SSH", "部署", "Windows"], updated: "5 小时前", hot: true,
      pkg: "dsh-remote-deploy", license: "Apache-2.0", repo: "github.com/doufu/dsh-remote-deploy", homepage: "",
      tier: "pack", source: "author", claimed: true, mirror: "auto", freshness: "synced", collected: "2026-10-15", syncedAt: "5 小时前",
      file: { name: "dsh-remote-deploy-1.2.0.tgz", size: "126 KB", sizeB: 128900, sha: "7c1e4a903b6d82f50a9c7e146d2b85f39e04c7a12b5f8d360c7e94a15b3d28f6", at: "2026-10-15" } },

    { id: "p5", name: "rea-toolbelt", icon: "🔬", grad: "linear-gradient(135deg,#94a3b8,#475569)", author: "u8", ver: "3.0.1", cat: "逆向", desc: "静态 + 动态逆向工具合流：PE/ELF/APK 一把梭，证据链自动落盘。", stars: 987, installs: 5210, tags: ["逆向", "证据", "二进制"], updated: "1 周前",
      pkg: "rea-toolbelt", license: "", repo: "github.com/shiqi/rea-toolbelt", homepage: "",
      tier: "entry", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-08", syncedAt: "",
      why: "仓库里没有 LICENSE 文件，package.json 也没写 license 字段。没有明确授权，本站不提供任何安装包，也不代为转载。" },

    { id: "p6", name: "hindsight-memory", icon: "🧠", grad: "linear-gradient(135deg,#fdba74,#f43f5e)", author: "u1", ver: "0.8.4", cat: "效率", desc: "给仓库装长期记忆：知识页 + 决策回溯，越用越懂你的项目。", stars: 1730, installs: 11080, tags: ["记忆", "知识库"], updated: "昨天",
      pkg: "hindsight-memory", license: "MIT", repo: "github.com/linshen/hindsight-memory", homepage: "linshen.dev/hindsight",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-14", syncedAt: "",
      why: "MIT 允许分发，但作者还没认领、也没授权镜像。请从上游 Release 取包。" },

    { id: "p7", name: "dsh-our-free-model", icon: "🪄", grad: "linear-gradient(135deg,#67e8f9,#3b82f6)", author: "u5", ver: "1.1.9", cat: "效率", desc: "免费模型通道管理：离线升级、cookie 热重载，断网也能继续。", stars: 864, installs: 6080, tags: ["模型", "离线"], updated: "4 天前",
      pkg: "dsh-our-free-model", license: "MIT", repo: "github.com/haiyan/our-free-model", homepage: "",
      tier: "pack", source: "mirror", claimed: false, mirror: "off", freshness: "stale", collected: "2026-09-30", syncedAt: "2026-09-30",
      file: { name: "dsh-our-free-model-1.1.9.tgz", size: "93 KB", sizeB: 95012, sha: "2d8f5a71c4e09b367a1d5c983e0b64f285c1a7d90e4b36f81a7c95d24e60b83f", at: "2026-09-30" } },

    { id: "p8", name: "kinetic-reel", icon: "🎬", grad: "linear-gradient(135deg,#f472b6,#7c3aed)", author: "u2", ver: "2.3.0", cat: "创作", desc: "代码生成动态视觉短片：排版、转场、音轨锁定，一次导出 MP4。", stars: 2210, installs: 13470, tags: ["视频", "动效", "渲染"], updated: "6 小时前",
      pkg: "kinetic-reel", license: "", repo: "github.com/ali/kinetic-reel", homepage: "ali.studio/reel",
      tier: "link", source: "none", claimed: false, mirror: "off", freshness: "none", collected: "2026-10-11", syncedAt: "",
      why: "许可证未声明（仓库无 LICENSE、package.json 无 license）。可以链到作者主页，但本站不转载、不镜像。" },

    { id: "p9", name: "dsh-badge", icon: "🏷️", grad: "linear-gradient(135deg,#a3e635,#16a34a)", author: "u3", ver: "1.0.3", cat: "界面", desc: "给文档、PR、合并请求统一挂上 powered by dsh 徽章。", stars: 402, installs: 2210, tags: ["徽章", "文档"], updated: "2 周前",
      pkg: "dsh-badge", license: "MIT", repo: "github.com/doufu/dsh-badge", homepage: "",
      tier: "entry", source: "none", claimed: true, mirror: "off", freshness: "none", collected: "2026-10-02", syncedAt: "",
      why: "作者认领时明确选择了「不授权镜像分发」，只保留条目。这是他的权利，随时可以在认领页重新打开。" }
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
      plugin: "p8", likes: 152, reactions: { "👍": 22, "🎉": 6, "🔥": 3 } }
  ];

  /* 社群分类（Discourse category 的简化版） */
  const categories = [
    { id: "notice", name: "公告", icon: "📣", desc: "官方公告、规则与版本说明" },
    { id: "guide",  name: "经验分享", icon: "🧠", desc: "踩过的坑、实测数据与复盘" },
    { id: "help",   name: "求助问答", icon: "🆘", desc: "卡住了就来问，答对点采纳" },
    { id: "dev",    name: "插件开发", icon: "🧩", desc: "API、调试、发布与兼容性" },
    { id: "tool",   name: "工具与部署", icon: "🛠️", desc: "环境、远端部署、运维" },
    { id: "chat",   name: "灌水闲聊", icon: "☕", desc: "与插件无关的都放这儿" }
  ];

  /* 插件分类：市场、左栏「插件分类」、发布页共用这一份，别再各写一遍 */
  const pluginCats = ["创作", "效率", "界面", "运维", "逆向"];

  /* 社群分类与主标签是两套维度，但有三对同义：公告=公告、经验分享=经验、求助问答=求助。
     同义时只显示彩色标签，否则同一行会出现「求助」+「求助问答」两个近义提醒。 */
  const catTagAlias = { notice: "公告", guide: "经验", help: "求助" };

  /* Discourse reactions：可点的表情，计数随状态增减 */
  const REACTIONS = ["👍", "🎉", "💡", "🔥", "👀"];

  /* 标签云（linux.do 顶部的 tag cloud） */
  const tagCloud = ["冲突排查", "Blender", "远端部署", "GenUI", "pnpm", "渲染优化", "模型时钟", "逆向", "node-pty", "周报"];

  /* 社群准则四原则 */
  const guidelines = [
    { icon: "💚", t: "真诚", d: "有问题直说，不夸大、不装懂" },
    { icon: "🤝", t: "友善", d: "对人客气，对事认真；不人身攻击" },
    { icon: "🧑‍🤝‍🧑", t: "团结", d: "能帮就帮一把，答案留下来给后来人" },
    { icon: "🔬", t: "专业", d: "贴版本、贴环境、贴报错原文" }
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
    { icon: "🧩", name: "插件库", desc: "9 个条目 · 4 个本站包" },
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
    "我授权本站向公众提供这个安装包的下载，并允许本站存储与缓存该文件。",
    "我确认这个包不含恶意代码、挖矿程序或未声明的外传行为。",
    "我理解本站可以因安全扫描结果或第三方投诉暂停分发，并保留审核记录。",
    "我可以随时撤回授权，撤回后本站将在 24 小时内停止提供下载。"
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

  return { users, plugins, posts, threads, categories, pluginCats, catTagAlias, REACTIONS, tagCloud, guidelines, floors, visitors, notices, noticeKinds, hotTopics, boards, profileFields, profileOptions,
    claimMethods, grantTerms, reportTypes, licenseRows, pkgStats };
})();
