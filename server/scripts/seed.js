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

const FORUMS = [
  { slug: 'notice', name: '公告', icon: '📣', desc: '官方公告、规则与版本说明', sort: 1 },
  { slug: 'guide', name: '经验分享', icon: '🧠', desc: '踩过的坑、实测数据与复盘', sort: 2 },
  { slug: 'help', name: '求助问答', icon: '🆘', desc: '卡住了就来问，答对点采纳', sort: 3 },
  { slug: 'dev', name: '插件开发', icon: '🧩', desc: 'API、调试、发布与兼容性', sort: 4 },
  { slug: 'tool', name: '工具与部署', icon: '🛠️', desc: '环境、远端部署、运维', sort: 5 },
  { slug: 'chat', name: '灌水闲聊', icon: '☕', desc: '与插件无关的都放这儿', sort: 6 }
];

const PLUGINS = [
  { slug: 'dsh-blender-plugin', icon: '🎨', grad: 'linear-gradient(135deg,#ff9a6c,#ff5f8f)', author: 1, ver: '2.1.0', cat: '创作', desc: '把 Blender 直接接进对话：程序化建模、批量渲染、无头出图，一句话改一个场景。', stars: 2841, installs: 18320, tags: '["Blender","建模","渲染"]', hot: 1, license: 'MIT', repo: 'github.com/linshen/blender-plugin', homepage: 'linshen.dev/blender', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-blender-plugin-2.1.0.tgz', file_size: '1.8 MB', file_size_b: 1887437, file_sha: '9f2c4b7e18a3d6504c1b9e7a2d85f04c3b6e1a9d7c4f20b83e5a6d1c9f7b4e20' },
  { slug: 'dsh-model-clock', icon: '⏰', grad: 'linear-gradient(135deg,#7dd3fc,#4f46e5)', author: 5, ver: '1.4.2', cat: '效率', desc: '按时间窗自动切换模型：白天用快模型跑量，夜里切深度推理，节假日单独一套。', stars: 1922, installs: 12040, tags: '["调度","模型","自动化"]', hot: 0, license: 'MIT', repo: 'github.com/haiyan/model-clock', homepage: 'haiyan.cc/model-clock', tier: 'pack', source: 'author', claimed: 1, mirror: 'manual', freshness: 'manual', file_name: 'dsh-model-clock-1.4.2.tgz', file_size: '63 KB', file_size_b: 64231, file_sha: '4a7e1c93b0d6825f7e31a4c9d8062b5e1c9f7a3d4b0e268d5a1c7f93e04b2d61' },
  { slug: 'genui-kit', icon: '🧩', grad: 'linear-gradient(135deg,#a78bfa,#f472b6)', author: 7, ver: '0.9.7', cat: '界面', desc: 'dsh-ui 组件模板库与校验器：39 个常用卡片模板，写完当场 validate。', stars: 1560, installs: 9840, tags: '["GenUI","组件","模板"]', hot: 0, license: 'MIT', repo: 'github.com/xiaoman/genui-kit', homepage: '', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '作者尚未认领，也没授权本站镜像。按 v6 规则，没有作者授权就不放站内包。' },
  { slug: 'dsh-remote-deploy', icon: '🛰️', grad: 'linear-gradient(135deg,#5eead4,#0ea5e9)', author: 3, ver: '1.2.0', cat: '运维', desc: '远端机器一键部署 dsh web，自带体检、私有前缀安装与连通性验证。', stars: 1204, installs: 7350, tags: '["SSH","部署","Windows"]', hot: 1, license: 'Apache-2.0', repo: 'github.com/doufu/dsh-remote-deploy', homepage: '', tier: 'pack', source: 'author', claimed: 1, mirror: 'auto', freshness: 'synced', file_name: 'dsh-remote-deploy-1.2.0.tgz', file_size: '126 KB', file_size_b: 128900, file_sha: '7c1e4a903b6d82f50a9c7e146d2b85f39e04c7a12b5f8d360c7e94a15b3d28f6' },
  { slug: 'rea-toolbelt', icon: '🔬', grad: 'linear-gradient(135deg,#94a3b8,#475569)', author: 8, ver: '3.0.1', cat: '逆向', desc: '静态 + 动态逆向工具合流：PE/ELF/APK 一把梭，证据链自动落盘。', stars: 987, installs: 5210, tags: '["逆向","证据","二进制"]', hot: 0, license: '', repo: 'github.com/shiqi/rea-toolbelt', homepage: '', tier: 'entry', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '仓库里没有 LICENSE 文件，package.json 也没写 license 字段。没有明确授权，本站不提供任何安装包，也不代为转载。' },
  { slug: 'hindsight-memory', icon: '🧠', grad: 'linear-gradient(135deg,#fdba74,#f43f5e)', author: 1, ver: '0.8.4', cat: '效率', desc: '给仓库装长期记忆：知识页 + 决策回溯，越用越懂你的项目。', stars: 1730, installs: 11080, tags: '["记忆","知识库"]', hot: 0, license: 'MIT', repo: 'github.com/linshen/hindsight-memory', homepage: 'linshen.dev/hindsight', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: 'MIT 允许分发，但作者还没认领、也没授权镜像。请从上游 Release 取包。' },
  { slug: 'dsh-our-free-model', icon: '🪄', grad: 'linear-gradient(135deg,#67e8f9,#3b82f6)', author: 5, ver: '1.1.9', cat: '效率', desc: '免费模型通道管理：离线升级、cookie 热重载，断网也能继续。', stars: 864, installs: 6080, tags: '["模型","离线"]', hot: 0, license: 'MIT', repo: 'github.com/haiyan/our-free-model', homepage: '', tier: 'pack', source: 'mirror', claimed: 0, mirror: 'off', freshness: 'stale', file_name: 'dsh-our-free-model-1.1.9.tgz', file_size: '93 KB', file_size_b: 95012, file_sha: '2d8f5a71c4e09b367a1d5c983e0b64f285c1a7d90e4b36f81a7c95d24e60b83f' },
  { slug: 'kinetic-reel', icon: '🎬', grad: 'linear-gradient(135deg,#f472b6,#7c3aed)', author: 2, ver: '2.3.0', cat: '创作', desc: '代码生成动态视觉短片：排版、转场、音轨锁定，一次导出 MP4。', stars: 2210, installs: 13470, tags: '["视频","动效","渲染"]', hot: 0, license: '', repo: 'github.com/ali/kinetic-reel', homepage: 'ali.studio/reel', tier: 'link', source: 'none', claimed: 0, mirror: 'off', freshness: 'none', why: '许可证未声明（仓库无 LICENSE、package.json 无 license）。可以链到作者主页，但本站不转载、不镜像。' },
  { slug: 'dsh-badge', icon: '🏷️', grad: 'linear-gradient(135deg,#a3e635,#16a34a)', author: 3, ver: '1.0.3', cat: '界面', desc: '给文档、PR、合并请求统一挂上 powered by dsh 徽章。', stars: 402, installs: 2210, tags: '["徽章","文档"]', hot: 0, license: 'MIT', repo: 'github.com/doufu/dsh-badge', homepage: '', tier: 'entry', source: 'none', claimed: 1, mirror: 'off', freshness: 'none', why: '作者认领时明确选择了「不授权镜像分发」，只保留条目。这是他的权利，随时可以在认领页重新打开。' }
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
  { forum: 'tool', user: 3, title: '远端机器 node-pty 编不过的三种解法（看你的 glibc 版本）', tag: '部署', tags: '["node-pty","远端部署"]', excerpt: 'glibc 低于 2.28 的直接装预编译包，高于的自己编……', replies: 41, views: 3320, likes: 128, hot: 1, top: 0, solved: 0, reactions: '{"👍":22,"🔥":7}' }
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

run();
