/**
 * 初始化种子数据
 * 把 js/data.js 里的演示内容灌进数据库，保证后端刚上线时页面不是空的。
 * 幂等：已有 posts 就跳过，不会重复插入。
 * 用法：node scripts/seed.js
 */
'use strict';

const { db, now } = require('../src/db');

const ts = now();

function already() {
  return db.prepare('SELECT COUNT(*) AS n FROM posts').get().n > 0;
}

const USERS = [
  { name: '林深见鹿', emoji: '🦌', grad: 'linear-gradient(135deg,#7aa2ff,#a46bff)', level: 12, badge: '插件作者', sig: '写插件，也写诗。', city: '杭州', fans: 1286, follows: 84, visits: 24310 },
  { name: '阿离', emoji: '🍊', grad: 'linear-gradient(135deg,#ffb36b,#ff6b9d)', level: 9, badge: '内测组', sig: 'Blender 重度依赖患者', city: '成都', fans: 642, follows: 156, visits: 9120 },
  { name: '豆腐', emoji: '🧊', grad: 'linear-gradient(135deg,#5ad1c8,#3f8bff)', level: 15, badge: '版主', sig: '问题不大，重启试试。', city: '深圳', fans: 3310, follows: 210, visits: 58120 },
  { name: 'K酱', emoji: '🐱', grad: 'linear-gradient(135deg,#c084fc,#f472b6)', level: 7, badge: '', sig: '正在研究远端部署', city: '上海', fans: 208, follows: 320, visits: 4210 },
  { name: '海盐柠檬', emoji: '🍋', grad: 'linear-gradient(135deg,#fde68a,#f59e0b)', level: 11, badge: '插件作者', sig: '模型时钟作者 / 早八人', city: '南京', fans: 980, follows: 61, visits: 17760 },
  { name: '夜航船', emoji: '🌙', grad: 'linear-gradient(135deg,#64748b,#334155)', level: 5, badge: '', sig: '半夜改 bug 的人', city: '武汉', fans: 96, follows: 74, visits: 2310 },
  { name: '小满', emoji: '🌿', grad: 'linear-gradient(135deg,#86efac,#22c55e)', level: 8, badge: '内测组', sig: 'GenUI 中毒', city: '西安', fans: 421, follows: 133, visits: 6820 },
  { name: '十七', emoji: '🛸', grad: 'linear-gradient(135deg,#93c5fd,#6366f1)', level: 6, badge: '', sig: '逆向是浪漫', city: '北京', fans: 176, follows: 88, visits: 3900 }
];

/* 版块顺序与名称必须跟 js/data.js 的 categories 对齐：api.js 一旦连上后端，
   就把 D.categories 整份替换成这里回来的数据（见 js/api.js 的 replaceArr(D.categories, cats)），
   两边错一位，左栏的分类与计数就会各说各话。 */
const FORUMS = [
  /* sort 就是左栏卡与发帖下拉的显示次序，必须和 js/data.js 的 categories 数组逐项对齐
     （api.js 会用服务端 forums 整份替换前端分类表，两边错位会各说各话）。
     2026-10-22：按行号改过 —— 科技快讯上移到第 4 行、3↔8（技术开发 ↔ 人工智能）、
     3↔11（技术开发 ↔ 优惠福利）、5↔8（求助问答 ↔ 人工智能），以及更早一轮的
     优惠福利 ↔ 技术开发、灌水闲聊 ↔ 工具部署；sort 跟着重排。 */
  { slug: 'notice', name: '公告', icon: '📣', desc: '官方公告、规则与版本说明', sort: 1 },
  { slug: 'ai', name: '人工智能', icon: '🤖', desc: '模型能力、推理与提示词、智能体与评测', sort: 2 },
  { slug: 'news', name: '科技快讯', icon: '📰', desc: '版本速报、行业动态与解读', sort: 3 },
  { slug: 'chat', name: '灌水闲聊', icon: '☕', desc: '与插件无关的都放这儿', sort: 4 },
  { slug: 'help', name: '求助问答', icon: '🆘', desc: '卡住了就来问，答对点采纳', sort: 5 },
  { slug: 'cn', name: '国产软件', icon: '🀄', desc: '国产模型与软件的实测、替代方案', sort: 6 },
  { slug: 'guide', name: '经验分享', icon: '🧠', desc: '踩过的坑、实测数据与复盘', sort: 7 },
  { slug: 'dev', name: '技术开发', icon: '🧩', desc: 'API、调试、发布与兼容性', sort: 8 },
  { slug: 'res', name: '资源分享', icon: '📚', desc: '教程、脚本、配置与清单合集', sort: 9 },
  { slug: 'pan', name: '网盘资源', icon: '🗂️', desc: '网盘链接、转存说明与提取码', sort: 10 },
  { slug: 'deal', name: '优惠福利', icon: '🎁', desc: '折扣、免费额度与羊毛情报', sort: 11 },
  { slug: 'memory', name: '网络考古', icon: '🗄️', desc: '旧站存档、互联网往事与冷知识', sort: 12 },
  { slug: 'tool', name: '工具部署', icon: '🛠️', desc: '环境、远端部署与运维排障', sort: 13 },
  { slug: 'ops', name: '站务反馈', icon: '🧭', desc: '站点问题、规则建议与功能提案', sort: 14 }
];

const PLUGINS = [
  { slug: 'dsh-blender-plugin', icon: '🎨', grad: 'linear-gradient(135deg,#ff9a6c,#ff5f8f)', author: 1, ver: '2.1.0', cat: '视觉与多模态', desc: '把 Blender 直接接进对话：程序化建模、批量渲染、无头出图，一句话改一个场景。', stars: 2841, installs: 18320, tags: '["Blender","建模","渲染"]', hot: 1, license: 'MIT', repo: 'github.com/linshen/blender-plugin', homepage: 'linshen.dev/blender', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-blender-plugin-2.1.0.tgz', file_size: '1.8 MB', file_size_b: 1887437, file_sha: '9f2c4b7e18a3d6504c1b9e7a2d85f04c3b6e1a9d7c4f20b83e5a6d1c9f7b4e20' },
  { slug: 'dsh-model-clock', icon: '⏰', grad: 'linear-gradient(135deg,#7dd3fc,#4f46e5)', author: 5, ver: '1.4.2', cat: '模型与账号接入', desc: '按时间窗自动切换模型：白天用快模型跑量，夜里切深度推理，节假日单独一套。', stars: 1922, installs: 12040, tags: '["调度","模型","自动化"]', hot: 0, license: 'MIT', repo: 'github.com/haiyan/model-clock', homepage: 'haiyan.cc/model-clock', tier: 'pack', source: 'author', claimed: 1, mirror: 'manual', freshness: 'manual', file_name: 'dsh-model-clock-1.4.2.tgz', file_size: '63 KB', file_size_b: 64231, file_sha: '4a7e1c93b0d6825f7e31a4c9d8062b5e1c9f7a3d4b0e268d5a1c7f93e04b2d61' },
  { slug: 'genui-kit', icon: '🧩', grad: 'linear-gradient(135deg,#a78bfa,#f472b6)', author: 7, ver: '0.9.7', cat: 'UI 增强', desc: 'dsh-ui 组件模板库与校验器：39 个常用卡片模板，写完当场 validate。', stars: 1560, installs: 9840, tags: '["GenUI","组件","模板"]', hot: 0, license: 'MIT', repo: 'github.com/xiaoman/genui-kit', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者尚未认领，也没授权本站镜像。按 v6 规则，没有作者授权就不放站内包。' },
  { slug: 'dsh-remote-deploy', icon: '🛰️', grad: 'linear-gradient(135deg,#5eead4,#0ea5e9)', author: 3, ver: '1.2.0', cat: '远程与移动端', desc: '远端机器一键部署 dsh web，自带体检、私有前缀安装与连通性验证。', stars: 1204, installs: 7350, tags: '["SSH","部署","Windows"]', hot: 1, license: 'Apache-2.0', repo: 'github.com/doufu/dsh-remote-deploy', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-remote-deploy-1.2.0.tgz', file_size: '126 KB', file_size_b: 128900, file_sha: '7c1e4a903b6d82f50a9c7e146d2b85f39e04c7a12b5f8d360c7e94a15b3d28f6' },
  { slug: 'rea-toolbelt', icon: '🔬', grad: 'linear-gradient(135deg,#94a3b8,#475569)', author: 8, ver: '3.0.1', cat: '安全与权限', desc: '静态 + 动态逆向工具合流：PE/ELF/APK 一把梭，证据链自动落盘。', stars: 987, installs: 5210, tags: '["逆向","证据","二进制"]', hot: 0, license: '', repo: 'github.com/shiqi/rea-toolbelt', homepage: '', tier: 'entry', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '仓库里没有 LICENSE 文件，package.json 也没写 license 字段。没有明确授权，本站不提供任何安装包，也不代为转载。' },
  { slug: 'hindsight-memory', icon: '🧠', grad: 'linear-gradient(135deg,#fdba74,#f43f5e)', author: 1, ver: '0.8.4', cat: '记忆', desc: '给仓库装长期记忆：知识页 + 决策回溯，越用越懂你的项目。', stars: 1730, installs: 11080, tags: '["记忆","知识库"]', hot: 0, license: 'MIT', repo: 'github.com/linshen/hindsight-memory', homepage: 'linshen.dev/hindsight', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: 'MIT 允许分发，但作者还没认领、也没授权镜像。请从上游 Release 取包。' },
  { slug: 'dsh-our-free-model', icon: '🪄', grad: 'linear-gradient(135deg,#67e8f9,#3b82f6)', author: 5, ver: '1.1.9', cat: '模型与账号接入', desc: '免费模型通道管理：离线升级、cookie 热重载，断网也能继续。', stars: 864, installs: 6080, tags: '["模型","离线"]', hot: 0, license: 'MIT', repo: 'github.com/haiyan/our-free-model', homepage: '', tier: 'pack', source: 'mirror', claimed: 0, mirror: 'off', freshness: 'stale', file_name: 'dsh-our-free-model-1.1.9.tgz', file_size: '93 KB', file_size_b: 95012, file_sha: '2d8f5a71c4e09b367a1d5c983e0b64f285c1a7d90e4b36f81a7c95d24e60b83f' },
  { slug: 'kinetic-reel', icon: '🎬', grad: 'linear-gradient(135deg,#f472b6,#7c3aed)', author: 2, ver: '2.3.0', cat: '视觉与多模态', desc: '代码生成动态视觉短片：排版、转场、音轨锁定，一次导出 MP4。', stars: 2210, installs: 13470, tags: '["视频","动效","渲染"]', hot: 0, license: '', repo: 'github.com/ali/kinetic-reel', homepage: 'ali.studio/reel', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '许可证未声明（仓库无 LICENSE、package.json 无 license）。可以链到作者主页，但本站不转载、不镜像。' },
  { slug: 'dsh-badge', icon: '🏷️', grad: 'linear-gradient(135deg,#a3e635,#16a34a)', author: 3, ver: '1.0.3', cat: '文档与渲染', desc: '给文档、PR、合并请求统一挂上 powered by dsh 徽章。', stars: 402, installs: 2210, tags: '["徽章","文档"]', hot: 0, license: 'MIT', repo: 'github.com/doufu/dsh-badge', homepage: '', tier: 'entry', source: 'none', claimed: 1, mirror: 'off', freshness: 'none', why: '作者认领时明确选择了「不授权镜像分发」，只保留条目。这是他的权利，随时可以在认领页重新打开。' },
  { slug: 'dsh-cost-meter', icon: '💰', grad: 'linear-gradient(135deg,#facc15,#f97316)', author: 5, ver: '1.6.2', cat: '用量与计费', desc: '按会话统计 token 用量与花费，超预算自动降到便宜档，月底给一张账单。', stars: 1890, installs: 9420, tags: '["计费","用量","预算"]', hot: 1, license: 'MIT', repo: 'github.com/doufu/dsh-cost-meter', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-cost-meter-1.6.2.tgz', file_size: '148 KB', file_size_b: 151552, file_sha: '0f011b7c1230d776e62af1b2c4fdec7c762ee76e78885ab609aadc9bb21f1408' },
  { slug: 'theme-factory', icon: '🌈', grad: 'linear-gradient(135deg,#f0abfc,#8b5cf6)', author: 7, ver: '2.0.4', cat: '主题与外观', desc: '10 套预设主题加现场配色生成，一键套到网页、文档、幻灯片上。', stars: 1420, installs: 8610, tags: '["主题","配色","外观"]', hot: 0, license: 'MIT', repo: 'github.com/xiaoman/theme-factory', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者要求只走 GitHub Release 分发；本站保留条目并链到仓库，不代放安装包。' },
  { slug: 'agent-teams-kit', icon: '🧬', grad: 'linear-gradient(135deg,#38bdf8,#6366f1)', author: 8, ver: '0.5.1', cat: 'AGI 架构探索', desc: '多智能体分工实验场：冻结 spec、并行建模、验收门一体，跑完留一份证据账本。', stars: 1980, installs: 7420, tags: '["多智能体","编排","验收门"]', hot: 1, license: '', repo: 'github.com/shiqi/agent-teams-kit', homepage: '', tier: 'entry', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '仓库未声明许可证，作者也明确不接受镜像分发。按 v6 规则只保留条目。' },
  { slug: 'dsh-oauth-bridge', icon: '🔐', grad: 'linear-gradient(135deg,#fca5a5,#dc2626)', author: 5, ver: '1.3.0', cat: '身份与通信', desc: '把本机登录态桥进容器：OAuth 回调、令牌托管、过期自动续期，一次配好。', stars: 980, installs: 5210, tags: '["OAuth","令牌","登录"]', hot: 0, license: 'MIT', repo: 'github.com/doufu/dsh-oauth-bridge', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-oauth-bridge-1.3.0.tgz', file_size: '96 KB', file_size_b: 98304, file_sha: '468cdbeee483b1395bca023f56c3f980bd009000015034a501b8a7af4e602315' },
  { slug: 'session-replay', icon: '🎞️', grad: 'linear-gradient(135deg,#c4b5fd,#4c1d95)', author: 6, ver: '0.7.2', cat: '会话与消息', desc: '会话全程录制与回放：token 级时间线，卡在哪一步一眼看到。', stars: 1120, installs: 4380, tags: '["会话","回放","调试"]', hot: 0, license: 'MIT', repo: 'github.com/kka/session-replay', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者认领后选了「只外链」：包体里会带本地会话录制文件，不适合站内分发。' },
  { slug: 'wsl-path-bridge', icon: '🌉', grad: 'linear-gradient(135deg,#67e8f9,#0891b2)', author: 7, ver: '1.9.0', cat: 'WSL 与 Windows 互操作', desc: 'WSL 与 Windows 路径互转：UNC、反斜杠转义、相对路径一次说清，不再手拼字符串。', stars: 1340, installs: 9260, tags: '["WSL","路径","Windows"]', hot: 0, license: 'Apache-2.0', repo: 'github.com/kka/wsl-path-bridge', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'wsl-path-bridge-1.9.0.tgz', file_size: '74 KB', file_size_b: 75776, file_sha: '87b598921137c1e20307aa01d1cc73792fc15ef26360d2f85480603637a00611' },
  { slug: 'web-cdp-probe', icon: '🌐', grad: 'linear-gradient(135deg,#7dd3fc,#0284c7)', author: 6, ver: '2.4.1', cat: '浏览器与网页', desc: '无头 Chrome 取证：视口截图、DOM 探针、像素差分，一键出可复现的证据。', stars: 1650, installs: 8800, tags: '["CDP","无头","取证"]', hot: 1, license: 'MIT', repo: 'github.com/yehangchuan/web-cdp-probe', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'web-cdp-probe-2.4.1.tgz', file_size: '112 KB', file_size_b: 114688, file_sha: 'eb425d7852bef797cf1210439356f056b93fc944c0627fed0978b952494632c0' },
  { slug: 'tts-voice-lab', icon: '🎙️', grad: 'linear-gradient(135deg,#fdba74,#db2777)', author: 2, ver: '1.0.8', cat: '语音与音频', desc: '语音合成与音轨锁定：把台词排进时间轴，导出带响度标注的音轨。', stars: 760, installs: 3120, tags: '["TTS","音频","时间轴"]', hot: 0, license: 'MIT', repo: 'github.com/ali/tts-voice-lab', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '语音模型体积太大，作者只在仓库 Release 里发；本站只留条目和跳转。' },
  { slug: 'skill-pack-manager', icon: '🎒', grad: 'linear-gradient(135deg,#86efac,#059669)', author: 7, ver: '3.1.2', cat: '技能包', desc: '技能包安装、版本锁定与依赖体检，装完当场跑一遍自检报告。', stars: 1480, installs: 8440, tags: '["技能","依赖","自检"]', hot: 0, license: 'MIT', repo: 'github.com/xiaoman/skill-pack-manager', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'skill-pack-manager-3.1.2.tgz', file_size: '132 KB', file_size_b: 135168, file_sha: 'c2f910cac4e1c87248703625b9495db040cb123cd8169e775d4cee2400b18b23' },
  { slug: 'flow-runner', icon: '🔁', grad: 'linear-gradient(135deg,#fda4af,#e11d48)', author: 5, ver: '2.2.0', cat: '工作流与自动化', desc: '把重复操作写成流程：条件分支、重试、定时跑，失败原地留现场。', stars: 2100, installs: 9660, tags: '["自动化","流程","定时"]', hot: 1, license: 'MIT', repo: 'github.com/haiyan/flow-runner', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'flow-runner-2.2.0.tgz', file_size: '168 KB', file_size_b: 172032, file_sha: 'f334aaa10b990ad5ba50b531a8629cf2eb1cb78ea39a83ea4bc3a090e6cd4457' },
  { slug: 'pr-copilot', icon: '🌿', grad: 'linear-gradient(135deg,#a7f3d0,#047857)', author: 6, ver: '1.5.3', cat: 'Git 与代码评审', desc: '提交前自查：diff 摘要、风险点标注、评审意见草稿一次写好。', stars: 1770, installs: 8990, tags: '["Git","评审","提交"]', hot: 0, license: 'MIT', repo: 'github.com/yehangchuan/pr-copilot', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'pr-copilot-1.5.3.tgz', file_size: '88 KB', file_size_b: 90112, file_sha: '4e7ceb1f393d375bf4a46f5eb0ff193779cf8dcf7f976ceedcf529c7ea50fdda' },
  { slug: 'hook-bridge', icon: '🔔', grad: 'linear-gradient(135deg,#fcd34d,#ea580c)', author: 2, ver: '1.1.4', cat: '通知与集成', desc: '把 dsh 事件推到聊天工具：跑完、失败、等确认，都会发一条消息。', stars: 690, installs: 3410, tags: '["通知","Webhook","集成"]', hot: 0, license: 'MIT', repo: 'github.com/doufu/hook-bridge', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者只维护 GitHub Release 里的包，站内保留条目与跳转。' },
  { slug: 'runtime-doctor', icon: '🩺', grad: 'linear-gradient(135deg,#5eead4,#14b8a6)', author: 8, ver: '4.0.2', cat: '开发与运行时', desc: '运行时体检：Node、原生模块、依赖四层生效面，缺哪一层就说哪一层。', stars: 1240, installs: 6580, tags: '["运行时","原生模块","体检"]', hot: 0, license: 'MIT', repo: 'github.com/shiqi/runtime-doctor', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'runtime-doctor-4.0.2.tgz', file_size: '104 KB', file_size_b: 106496, file_sha: 'ea282b4dcfd4878859b9c641c5de41f286df93e6732587674b8fc16d61ed2260' },
  { slug: 'permission-audit', icon: '🛡️', grad: 'linear-gradient(135deg,#94a3b8,#1e293b)', author: 8, ver: '2.6.0', cat: '安全与权限', desc: '权限与沙箱审计：谁能读、谁能写、谁在网外，一份清单看到底。', stars: 1080, installs: 4990, tags: '["权限","沙箱","审计"]', hot: 0, license: '', repo: 'github.com/shiqi/permission-audit', homepage: '', tier: 'entry', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '仓库没写许可证，作者也还没认领。按 v6 规则只能留条目。' },
  { slug: 'market-admin', icon: '🏪', grad: 'linear-gradient(135deg,#fbbf24,#b45309)', author: 2, ver: '1.7.1', cat: '插件市场与管理', desc: '条目库后台：认领审核、镜像授权、收录深度三步管完，改动都留记录。', stars: 880, installs: 4060, tags: '["市场","认领","审核"]', hot: 0, license: 'MIT', repo: 'github.com/ali/market-admin', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'market-admin-1.7.1.tgz', file_size: '118 KB', file_size_b: 120832, file_sha: '65b79460703d2917aa0da9e9eb20c29446b6ab95b61e91e483527b22b07c329f' },
  { slug: 'ascii-arcade', icon: '🕹️', grad: 'linear-gradient(135deg,#f9a8d4,#be185d)', author: 6, ver: '0.3.9', cat: '娱乐', desc: '终端里的小游戏合集：等编译的时候来一局。', stars: 1540, installs: 6720, tags: '["游戏","终端","摸鱼"]', hot: 0, license: 'MIT', repo: 'github.com/yehangchuan/ascii-arcade', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者说这只是玩具、只在 Gist 里发版，本站不转载。' },
  { slug: 'image-wire', icon: '🖼️', grad: 'linear-gradient(135deg,#93c5fd,#2563eb)', author: 2, ver: '1.2.5', cat: '视觉与多模态', desc: '图片批处理流水线：裁剪、压缩、转 WebP，出图顺带生成缩略图样式。', stars: 1310, installs: 7730, tags: '["图片","压缩","WebP"]', hot: 0, license: 'MIT', repo: 'github.com/ali/image-wire', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'image-wire-1.2.5.tgz', file_size: '156 KB', file_size_b: 159744, file_sha: '4435512e61c958686babedd2281bafac1c96c2beec0b82cf2a4951688a18a629' },
  { slug: 'tool-forge', icon: '🔧', grad: 'linear-gradient(135deg,#cbd5e1,#64748b)', author: 6, ver: '0.9.4', cat: '工具与能力', desc: '把一次性脚本焊成常驻工具：参数校验、幂等、失败可回滚。', stars: 720, installs: 2880, tags: '["工具","幂等","脚本"]', hot: 0, license: 'MIT', repo: 'github.com/yehangchuan/tool-forge', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'tool-forge-0.9.4.tgz', file_size: '68 KB', file_size_b: 69632, file_sha: '3f234d237f71383307af7638055bc22bcf12f252b45288ce7c847846ebb76381' },
  { slug: 'memory-bank', icon: '🗄️', grad: 'linear-gradient(135deg,#fde68a,#d97706)', author: 8, ver: '1.0.1', cat: '记忆', desc: '项目记忆库：按仓库分账，决策与坑各归各的页，换电脑也带得走。', stars: 940, installs: 5540, tags: '["记忆","知识页","仓库"]', hot: 0, license: 'MIT', repo: 'github.com/kka/memory-bank', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者只发 GitHub Release，站内保留条目与上游链接。' },
];

const POSTS = [
  { user: 1, plugin: 'dsh-blender-plugin', ver: 'v2.1.0', pinned: 1, likes: 328, shares: 41, text: 'v2.1.0 推送了 🎉\n新增无头通道的第二路（rt_headless），批量几何 + 校验现在可以整批丢给独立进程，不再占着 GUI。顺手修了 2318 对象场景里 persistent_data 首次渲染 14.6s → 0.79s 的老问题。\n\n升级方式：条目页里点下载，或者 pnpm 拉一下。踩到坑的在楼里回，我今晚都在。' },
  { user: 3, plugin: 'dsh-remote-deploy', ver: 'v1.2.0', pinned: 0, likes: 214, shares: 88, text: '帮大家踩完远端部署的坑了，四件事按顺序做就不会崩：\n1) 先跑 rw_deploy_probe，确认原生模块能加载；\n2) 装到私有前缀，别动系统 node；\n3) 用 --no-open 起 web，再自己开隧道；\n4) 最后再验一次 127.0.0.1 的端口，别急着发给同事。' },
  { user: 7, plugin: 'genui-kit', ver: 'v0.9.7', pinned: 0, likes: 176, shares: 22, text: '做了一套「插件库」的 GenUI 卡片模板，横向对比三列、安装量用进度条、标签用 badge，复制就能用。\n截图是夜间模式下的效果，颜色全部走主题变量，切主题不会花。' },
  { user: 4, plugin: '', ver: '', pinned: 0, likes: 42, shares: 3, text: '新人第一帖 🙋 想问下大家插件都是怎么管理的？我现在装了 11 个，模型时钟和免费模型通道有时候会互相打架，是不是优先级要手动排一下……' },
  { user: 2, plugin: 'kinetic-reel', ver: 'v2.3.0', pinned: 0, likes: 512, shares: 96, text: '用 kinetic-reel 给插件做了个 15 秒开场，从建模线框一路推到成品渲染。素材全部代码生成，没有一张外部图。' }
];

const COMMENTS = [
  { post: 1, user: 2, text: '终于等到批量！昨晚手动点了 60 次，手都断了' },
  { post: 1, user: 3, text: 'persistent_data 那个优化是真的顶，我这边大场景从 9s 掉到 1.1s。' },
  { post: 1, user: 6, text: '请问 Windows 路径要写双反斜杠吗？' },
  { post: 2, user: 4, text: '第 2 条救命，之前装到系统目录直接权限炸了' },
  { post: 2, user: 5, text: 'probe 那步太关键了，node-pty 编不过的人 90% 卡这' },
  { post: 3, user: 1, text: '配色很舒服，能直接进模板库吗？' },
  { post: 4, user: 5, text: '作者来了。时钟插件的窗口规则优先级高于通道切换，建议把通道固定在时钟的 default 分支里。' },
  { post: 5, user: 8, text: '这个转场是怎么算的？形状连续那块' }
];

const THREADS = [
  { forum: 'notice', user: 3, title: '【置顶】插件冲突排查手册 v3（模型 / 渲染 / 网络 三类）', tag: '公告', tags: '["冲突排查","置顶","手册"]', excerpt: '按加载顺序、命名空间、宿主版本三条线排查，90% 的冲突能定位到具体插件……', replies: 128, views: 18420, likes: 386, hot: 1, top: 1, solved: 1, reactions: '{"👍":24,"🎉":3,"💡":57,"🔥":9,"👀":14}' },
  { forum: 'guide', user: 1, title: 'Blender 无头通道在 2318 对象场景下的实测数据（附脚本）', tag: '经验', tags: '["Blender","渲染优化"]', excerpt: 'persistent_data 打开前后差了 14 倍，附完整的计时脚本……', replies: 64, views: 9310, likes: 214, hot: 1, top: 0, solved: 0, reactions: '{"👍":31,"💡":18}' },
  { forum: 'help', user: 6, title: '两个插件注册了同一个快捷键，怎么在启动日志里看出谁赢了？', tag: '求助', tags: '["冲突排查"]', excerpt: '启动日志只看到 keybinding registered，看不出先后顺序……', replies: 12, views: 860, likes: 18, hot: 0, top: 0, solved: 1, reactions: '{"👀":4}' },
  { forum: 'dev', user: 5, title: 'dsh-model-clock 的窗口规则是怎么和通道切换共存的？', tag: '开发', tags: '["模型时钟","调度"]', excerpt: '想给每条规则单独配一个 fallback 通道，不确定接口支不支持……', replies: 27, views: 2140, likes: 63, hot: 0, top: 0, solved: 0, reactions: '{"👍":9,"💡":6}' },
  { forum: 'tool', user: 3, title: '远端机器 node-pty 编不过的三种解法（看你的 glibc 版本）', tag: '部署', tags: '["node-pty","远端部署"]', excerpt: 'glibc 低于 2.28 的直接装预编译包，高于的自己编……', replies: 41, views: 3320, likes: 128, hot: 1, top: 0, solved: 0, reactions: '{"👍":22,"🔥":7}' },
  { forum: 'ai', user: 2, title: '本地 7B 模型做翻译流水线：Q4 / Q5 / Q8 三档量化在 24G 显存上的实测', tag: '实测', tags: '["量化","本地推理","实测"]', excerpt: '同一批 200 句技术文档：Q8 最稳但慢 2.6 倍，Q5 在长句上开始漏译，Q4 只够当草稿……', replies: 33, views: 5840, likes: 131, hot: 1, top: 0, solved: 0, reactions: '{"👍":15,"💡":12,"🔥":4}' },
  { forum: 'ai', user: 7, title: '提示词开头加一句「先列约束再动手」，多步任务成功率从 61% 到 84%', tag: '讨论', tags: '["提示词","评测"]', excerpt: '同一个测试集 100 条任务，只改系统提示词：先复述约束与验收标准，再开始写……', replies: 26, views: 4120, likes: 118, hot: 0, top: 0, solved: 0, reactions: '{"👍":13,"💡":15,"👀":6}' }
];

function run() {
  if (already()) {
    console.log('已有数据，跳过种子导入。要重置请先删掉 data/jingyu.db');
    return;
  }

  const tx = db.transaction(() => {
    const insUser = db.prepare(`INSERT INTO users (email,password_hash,name,emoji,grad,level,badge,sig,city,fans,follows,visits,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // 演示账号统一密码：jingyu1234（bcrypt 预先算好，避免脚本里跑 8 次哈希）
    const demoHash = '$2a$10$p5ziogiCfdZ/f8fn.Pz1mOq/01iWJeJZEOwle3b7HhSIdVRVLtxDm';
    USERS.forEach((u, i) => {
      insUser.run(`demo${i + 1}@jingyu.local`, demoHash, u.name, u.emoji, u.grad, u.level, u.badge, u.sig, u.city, u.fans, u.follows, u.visits, ts, ts);
    });

    const insForum = db.prepare('INSERT INTO forums (slug,name,icon,desc,sort,thread_count,created_at) VALUES (?,?,?,?,?,0,?)');
    FORUMS.forEach((f) => insForum.run(f.slug, f.name, f.icon, f.desc, f.sort, ts));

    const insPlugin = db.prepare(`INSERT INTO plugins (slug,icon,grad,author_id,ver,cat,desc,stars,installs,tags,hot,license,repo,homepage,tier,source,claimed,mirror,freshness,why,file_name,file_size,file_size_b,file_sha,collected_at,synced_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    PLUGINS.forEach((p) => insPlugin.run(p.slug, p.icon, p.grad, p.author, p.ver, p.cat, p.desc, p.stars, p.installs, p.tags, p.hot, p.license, p.repo, p.homepage, p.tier, p.source, p.claimed, p.mirror, p.freshness, p.why || '', p.file_name || '', p.file_size || '', p.file_size_b || 0, p.file_sha || '', ts, ts, ts, ts));

    const insPost = db.prepare('INSERT INTO posts (user_id,text,plugin_slug,plugin_ver,pinned,likes,shares,comments,created_at) VALUES (?,?,?,?,?,?,?,0,?)');
    POSTS.forEach((p, i) => {
      // 时间倒序：最新的在上面
      insPost.run(p.user, p.text, p.plugin, p.ver, p.pinned, p.likes, p.shares, ts - i * 1800);
    });

    const insComment = db.prepare('INSERT INTO comments (post_id,user_id,text,created_at) VALUES (?,?,?,?)');
    COMMENTS.forEach((c, i) => insComment.run(c.post, c.user, c.text, ts - i * 300));

    db.prepare('UPDATE posts SET comments = (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id)').run();

    const insThread = db.prepare(`INSERT INTO threads (forum_slug,user_id,title,body,tag,tags,excerpt,replies,views,likes,hot,top,solved,closed,reactions,last_user,last_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`);
    THREADS.forEach((t, i) => {
      insThread.run(t.forum, t.user, t.title, t.excerpt, t.tag, t.tags, t.excerpt, t.replies, t.views, t.likes, t.hot, t.top, t.solved, t.reactions, t.user, ts - i * 3600, ts - i * 86400);
    });

    db.prepare('UPDATE forums SET thread_count = (SELECT COUNT(*) FROM threads WHERE threads.forum_slug = forums.slug)').run();
  });

  tx();

  console.log('种子导入完成：');
  console.log('  用户', db.prepare('SELECT COUNT(*) n FROM users').get().n,
              '· 插件', db.prepare('SELECT COUNT(*) n FROM plugins').get().n,
              '· 动态', db.prepare('SELECT COUNT(*) n FROM posts').get().n,
              '· 评论', db.prepare('SELECT COUNT(*) n FROM comments').get().n,
              '· 版块', db.prepare('SELECT COUNT(*) n FROM forums').get().n,
              '· 主题', db.prepare('SELECT COUNT(*) n FROM threads').get().n);
  console.log('演示账号：demo1@jingyu.local ~ demo8@jingyu.local，密码统一 jingyu1234');
}

/* 直接执行时才灌种子；被 sync-seed.js require 时只导出数组，方便做增量同步。 */
if (require.main === module) run();

module.exports = { FORUMS, PLUGINS, THREADS, USERS, POSTS, COMMENTS, run, already };
