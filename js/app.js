
/* ================= 鲸域 · 前端交互 ================= */
(function () {
  const BR = window.BRAND;
  const D = window.DATA;
  const users = D.users, plugins = D.plugins, posts = D.posts, threads = D.threads;
  const floors = D.floors, visitors = D.visitors, notices = D.notices;
  /* 消息分类（全部/回复/点赞/私信/通知）只在这里定义一次，弹层页签与未读计数都读它 */
  const noticeKinds = D.noticeKinds || [{ id: 'all', name: '全部', icon: '📨' }];
  const hotTopics = D.hotTopics, boards = D.boards, profileFields = D.profileFields;
  /* v6：条目库与作者授权分发用到的数据 */
  const claimMethods = D.claimMethods, grantTerms = D.grantTerms, reportTypes = D.reportTypes;
  const licenseRows = D.licenseRows, pkgStats = D.pkgStats;
  /* 插件分类只有一份真源：市场筛选、左栏「插件分类」、发布页下拉都读它 */
  const pluginCats = D.pluginCats;
  /* 社群分类与主标签的同义映射（公告 / 经验 / 求助），用于去重 */
  const catTagAlias = D.catTagAlias || {};
  /* v7：编辑资料页的选项表（性别 / 省市 / 职业 / 标签 / 头像预设 / 封面预设） */
  const profileOptions = D.profileOptions;
  /* v22 · 鲸鲸空间：演示作品与作品类型。S.arts 是本次在本机发布的，渲染时拼在演示数据前面 */
  const artsRaw = D.arts || [], artKinds = D.artKinds || [];

  const app = document.getElementById('app');
  const qs = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  /* ---------- 鲸尾标志 ----------
     由手绘线稿矢量化而来：单条开放路径，56 个锚点。
     路径按「未旋转」形态归一化到 64×64（包围盒 5.71~58.29 / 6.22~57.78，四周留白 2、几何中心即 32,32），
     顺时针 9° 由内层 <g transform="rotate(9 32 32)"> 施加 —— 旋转原点即图形中心，要调角度只改这一个数字。
     线稿只描边不填充：fill:none + stroke-width 才是它本来的样子，小尺寸下也比填充版清楚得多。
     颜色走 currentColor（由 CSS 的 color 决定），线宽按显示尺寸逐处给：导航 5.2 / 页脚 6.8 / 头图 2.3。 */
  const TAIL_D = 'M27.1 57.8 C27.3 57.4 28.1 56.2 28.6 55.4 C29.0 54.6 29.4 53.9 29.8 52.9 C30.1 52.0 30.3 51.5 30.8 49.9 C31.2 48.3 32.1 44.8 32.5 43.4 C32.9 42.0 33.0 42.1 33.3 41.6 C33.6 41.0 33.9 40.6 34.2 40.2 C34.6 39.7 35.0 39.3 35.4 39.0 C35.9 38.6 35.1 38.8 36.8 38.0 C38.6 37.3 44.0 35.4 46.0 34.5 C48.0 33.6 48.1 33.4 49.0 32.8 C50.0 32.1 50.7 31.6 51.6 30.8 C52.6 29.9 53.7 28.8 54.6 27.8 C55.4 26.7 56.1 25.7 56.7 24.6 C57.3 23.6 57.8 22.2 58.1 21.5 C58.3 20.7 58.3 20.6 58.3 20.2 C58.3 19.9 58.3 19.5 58.2 19.2 C58.1 19.0 58.0 18.8 57.9 18.7 C57.7 18.5 58.2 18.4 57.1 18.4 C56.1 18.4 53.7 19.0 51.6 18.9 C49.5 18.8 46.2 18.1 44.6 17.9 C42.9 17.7 42.6 17.7 41.6 17.8 C40.6 17.8 40.0 17.8 38.6 18.1 C37.3 18.4 34.8 19.4 33.7 19.7 C32.7 20.0 32.7 19.8 32.3 19.7 C31.8 19.6 31.8 19.6 31.2 19.1 C30.5 18.5 29.2 17.1 28.4 16.4 C27.7 15.8 27.3 15.5 26.5 15.1 C25.8 14.7 25.3 14.4 23.9 13.9 C22.5 13.4 19.5 12.7 18.0 12.3 C16.6 11.8 16.2 11.6 15.3 11.2 C14.5 10.7 13.8 10.4 12.9 9.6 C12.0 8.9 10.5 7.4 9.7 6.8 C9.0 6.3 8.7 6.3 8.4 6.2 C8.0 6.1 7.8 6.2 7.5 6.4 C7.2 6.6 6.9 6.9 6.6 7.3 C6.4 7.7 6.2 8.1 6.1 8.7 C5.9 9.3 5.8 10.0 5.7 10.7 C5.7 11.4 5.7 12.3 5.7 13.1 C5.8 14.0 5.9 15.0 6.0 15.8 C6.1 16.6 6.3 17.3 6.5 18.1 C6.7 18.9 6.9 19.5 7.4 20.5 C7.8 21.5 8.6 23.0 9.3 24.1 C10.1 25.3 11.0 26.4 11.9 27.4 C12.7 28.4 13.2 28.9 14.5 30.0 C15.7 31.0 18.3 32.9 19.4 33.8 C20.5 34.7 20.6 34.8 21.0 35.4 C21.5 36.0 21.9 36.7 22.1 37.4 C22.4 38.0 22.5 38.6 22.5 39.3 C22.6 39.9 22.5 40.5 22.4 41.2 C22.3 41.9 22.1 42.7 21.8 43.4 C21.5 44.2 21.1 45.0 20.7 45.8 C20.3 46.6 19.8 47.3 19.3 48.0 C18.8 48.8 18.2 49.5 17.6 50.1 C17.0 50.8 16.8 51.1 15.6 52.0 C14.5 53.0 11.5 55.2 10.6 55.8';
  const TAIL_SW = 5.2;
  const tail = (size, sw, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 64 64" width="' + size +
    '" height="' + size + '" aria-hidden="true" focusable="false"><g transform="rotate(9 32 32)"><path d="' + TAIL_D +
    '" fill="none" stroke="currentColor" stroke-width="' + (sw || TAIL_SW) + '" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';

  const S = {
    route: 'feed', spaceUser: '', tab: '全部', cat: '全部', sort: '热度',
    q: '', fsort: '最新', ftag: '全部', scat: '全部', threadId: 't1', reacts: new Set(),
    /* v24 · 标签页（#/tags）：tags 是复选出来的标签（空 = 没筛），tagMode 决定多选怎么组合
       （all = 交集，同参考页；any = 并集），tagQ 是标签搜索框，tagOpen 记哪几节展开了 */
    tags: [], tagMode: 'all', tagQ: '', tagOpen: new Set(),
    liked: new Set(['s2']), floorLiked: new Set(), installed: new Set(['p1']),
    fav: new Set(), cmtLiked: new Set(),
    comments: {}, expand: new Set(),
    /* v18 · 消息中心：已读按「条」记（id 集合），不再是一个全站布尔 —— 只置一个开关的话，
       点开一条就等于全读，分类未读数也没法算。noticesRead 只作为旧存档的迁移标记保留。 */
    noticeRead: new Set(), noticeKind: 'all', noticesRead: false, lb: null, pop: null,
    follow: false, published: [],
    /* v6 · 授权与下载的瞬时状态。
       claimed / mirror 只装「这一次访问里改过的」条目，初始值仍来自 data.js：
       作者在认领页关掉镜像，列表与条目页立刻降到「仅条目」；刷新回到演示数据的原状。 */
    pid: 'p1', claimed: new Set(), mirror: {}, dl: null, rep: null, repT: {},
    /* 举报面板里两个可选输入（补充说明 / 联系方式）按条目 id 分开存：
       同一次会话里可能连着举报两条不同的条目，共用一个字段会把上一条的说明串过去。 */
    repD: {}, repC: {},
    vs: {}, vt: 'readme', ctok: {}, ctokReq: {}, tier: '全部',
    up: { file: null, compat: [], breaking: '', note: '', agreed: [], stage: '' },
    withdraw: new Set(),
    /* P0：新帖 / 新楼层 / 空间留言 / 发帖面板 */
    newThreads: [], newFloors: {}, replies: {}, msgs: {}, composerOpen: false,
    /* 插件库有 6000+ 条，一次性铺进 DOM 会卡死：只画前 mktLimit 张，
       mktSig 记住「当前筛选组合」，组合一变就回到 60 张。 */
    mktLimit: 60, mktSig: '',
    /* v33 · 私信：S.dm[当前账号][对方 uid] = [{ id, from:'me'|uid, text, at, read }]。
       按账号分桶，同一台机器上换号登录不会看到上一个号的会话；
       dmPeer 是当前打开的会话（写进 #/dm/<uid>），dmQ 是会话搜索词，
       dmNew 控制「新私信」联系人面板，dmDraft 只放内存（草稿不值当进存档）。 */
    dm: {}, dmFollow: new Set(['u5', 'u3', 'u2']), dmMeta: {}, dmVer: 0,
    dmPeer: '', dmQ: '', dmNew: false, dmDraft: {},
    dmEmo: false, dmMenu: '', dmRep: '', dmRepWhy: -1, dmStrOpen: false,
    /* 发帖配图：两个队列分开存，避免日志草稿的图串到社群发帖里。
       只放内存不落盘 —— dataURL 动辄几百 KB，写进 localStorage 会撑爆存档。 */
    pendingImages: [], ntImages: [], pendingPlugin: '', pendingPluginVer: '', pickerOpen: false,
    /* 回复框「引用」要带进正文的那段楼层原文（只存内存，切楼层就丢） */
    quoteText: '', quoteWho: '', quoteNo: 0,
    /* v23 · 回复框四件套（表情 / 图片 / @提及 / 引用链接）：
       rpDraft 进状态（别的重绘和刷新都不丢字）；待发表的回复配图只放内存
       （dataURL 太大，不入存档）；展开的面板用 kind 记着（'' | 'emo' | 'men' | 'lnk'）。 */
    rpDraft: '', rpImages: [], rpPanel: '', rpEmojiSet: '常用', rpEmojiRecent: [],
    /* v15 · 多账号：资料 / 头像 / 封面都按账号存在 S.accounts[uid]，
       S.account 是「当前登录的是谁」，发言、发布、编辑资料全挂在它名下。
       draft 只属于当前账号，一换账号就丢掉，避免把 A 的草稿存进 B 的资料。 */
    account: 'u1', accounts: {}, draft: null, proPanel: '', fileErr: '', coverErr: '',
    /* 本地选中但还没同步到账号的头像文件。File 对象只放内存（不落盘、不进 saveState）；
       avatarSyncing 是「上传 + PATCH」这一个 promise，保存资料时 await 它，
       avatarErr 保存失败原因，用来在头像区给出可重试的提示。 */
    avatarFile: null, avatarSyncing: null, avatarErr: '', avatarBusy: false,
    /* v17 · 登录：页面级临时状态。authTab 决定登录页停在哪一半，authErr 是面板顶部那条提示
       （带「去注册 / 去登录 / 退出」之类下一步动作），phone* 是手机号认证的中间态。
       全部只放内存：刷新就重来，一次失败不会把用户永久卡在错误里。 */
    authTab: 'login', authForm: null, authErr: null, authForce: false,
    oauthPending: '', phone: '', phoneDev: '', phoneCool: 0, phoneSent: false, phoneDelivered: null, setPanel: 'set-acc',
    /* v46 · 登录设备：devices 是 /auth/sessions 最近一次的返回（null = 还没问到），
       devicesFor 记这份数据属于哪个 sid —— 换号之后旧列表必须立刻作废，
       否则「设置 → 账号与安全」会把上一个账号的手机型号摆在现任眼前。 */
    devices: null, devicesFor: '', devicesErr: '',
    /* v8 · 发布插件（仿 GitHub 新建仓库）：表单全在内存里，提交后进 com 审核态 */
    pub: { name: '', desc: '', owner: '', visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' },
    /* v22 · 鲸鲸空间：筛选（类型 / 关键词 / 排序）、发布框开关与草稿、详情弹层 id、
       本机发布的作品（带 dataURL，落盘），以及喜欢 / 收藏的 id 集合 */
    artKind: '全部', artQ: '', artSort: '最新', artOpen: false, artId: '',
    artDraft: null, arts: [], artLikes: new Set(), artFav: new Set(),
    /* v33 · 我的收藏扩到五类：日志 S.fav / 作品 S.artFav / 帖子 S.favThread /
       插件 S.favPlug / 作者 S.favUser。每个 Set 只负责去重与 O(1) 判断；
       favOrder 记五类混排的先后（'post:s1' / 'art:a1' / 'thread:t1' / 'plug:p1' / 'user:u2'），
       favKind 是当前筛的 tab，只放内存。 */
    favThread: new Set(), favPlug: new Set(), favUser: new Set(),
    /* v41 · 插件页点赞：只表态，不进「我的收藏」，单独一份集合落盘。 */
    likePlug: new Set(),
    favKind: 'all', favOrder: [],
    /* v24 · 作品详情与评论：评论落盘（pending 只有作者自己看得见），草稿按作品分开存 */
    artComments: [], cmDraft: {}, cmReply: null, cmDel: '',
    /* v39 · AI 排行（#/rank）：数据源 aa 智能指数 / lb LiveBench，范围 global 全球 / cn 纯国内。
       排序维度两个数据源各存一份（键名不通用：AA 是 code，LiveBench 是 coding），
       来回切榜单时不至于把对方的排序键当成非法值。全是浏览姿势，不落盘。 */
    rankBoard: 'lb', rankScope: 'global', rankSort: 'total', rankLbSort: 'total',
    /* v38 · 插件独立页（GitHub 仓库风格）：标签、展开的文件与筛选都是浏览姿势，
       只放内存 —— 关掉页面再回来看到的是仓库首页。收藏复用 S.favPlug。 */
    entryTab: 'code', ghGet: false, ghFile: '', ghFileQ: '',
    ghIssueFilter: 'open', ghIssueOpen: '', ghReadmeTab: 'readme', ghRel: ''
  };

  /* 一条动态最多四张图：和 .imgs 的四格栅格一一对应，超出就直接拒收而不是静默丢掉。
     前端先拦一道，后端 post_images 才不会因为图片数量把整条动态拖成半成品。 */
  const IMG_MAX = 4;
  const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const IMG_MAX_BYTES = 5 * 1024 * 1024;

  /* P1 · 刷新恢复常驻状态（白名单；Set→数组往返） */
  const STATE_KEY = 'dsh-forum-state-v1';
  (function restoreState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.liked)) S.liked = new Set(saved.liked);
      if (Array.isArray(saved.reacts)) S.reacts = new Set(saved.reacts);
      if (Array.isArray(saved.floorLiked)) S.floorLiked = new Set(saved.floorLiked);
      if (Array.isArray(saved.installed)) S.installed = new Set(saved.installed);
      if (Array.isArray(saved.fav)) S.fav = new Set(saved.fav);
      if (Array.isArray(saved.cmtLiked)) S.cmtLiked = new Set(saved.cmtLiked);
      if (saved.comments && typeof saved.comments === 'object') S.comments = saved.comments;
      if (Array.isArray(saved.noticeRead)) S.noticeRead = new Set(saved.noticeRead);
      if (typeof saved.noticesRead === 'boolean') S.noticesRead = saved.noticesRead;
      /* 旧存档只有一个「全部已读」布尔：它说过已读，就把当前这批消息整体迁成已读，不装作从没读过 */
      if (saved.noticesRead === true && !Array.isArray(saved.noticeRead)) notices.forEach(function (n) { S.noticeRead.add(n.id); });
      if (Array.isArray(saved.newThreads)) S.newThreads = saved.newThreads;
      /* v22 · 鲸鲸空间：本机发布的二创与喜欢 / 收藏。media 是 dataURL，只在体积内落盘 */
      if (Array.isArray(saved.arts)) S.arts = saved.arts.filter(function (a) { return a && a.id && a.title; });
      if (Array.isArray(saved.artLikes)) S.artLikes = new Set(saved.artLikes);
      if (Array.isArray(saved.artFav)) S.artFav = new Set(saved.artFav);
      if (Array.isArray(saved.favThread)) S.favThread = new Set(saved.favThread);
      if (Array.isArray(saved.favPlug)) S.favPlug = new Set(saved.favPlug);
      if (Array.isArray(saved.likePlug)) S.likePlug = new Set(saved.likePlug);
      if (Array.isArray(saved.favUser)) S.favUser = new Set(saved.favUser);
      if (Array.isArray(saved.favOrder)) {
        S.favOrder = saved.favOrder.filter(function (k) { return typeof k === 'string' && k.length <= 80; });
      }
      /* 旧存档没有 favOrder：按两个 Set 的插入顺序倒着补一份，收藏页仍然「最近在前」。
         这里不能直接调 sweepFavOrder()：它用到的 FAV_KINDS 是下面第 4707 行的 const，
         恢复阶段还在 TDZ 里，一调就抛 ReferenceError 并被外层 catch 吞掉 ——
         连带把后面的 msgs / dm / accounts / account 恢复全部跳过（私信、留言刷新就丢）。
         真正的补齐放到 favSet() 定义之后，那里常量已初始化。 */
      if (Array.isArray(saved.artComments)) S.artComments = saved.artComments.filter(function (c) {
        return c && c.id && c.artId && typeof c.text === 'string';
      });
      if (saved.newFloors && typeof saved.newFloors === 'object') S.newFloors = saved.newFloors;
      /* v23 · 回复框草稿与最近用过的表情：被清过 / 被改坏的值按白名单拒掉 */
      if (typeof saved.rpDraft === 'string') S.rpDraft = saved.rpDraft.slice(0, 2000);
      if (Array.isArray(saved.rpEmojiRecent)) {
        S.rpEmojiRecent = saved.rpEmojiRecent.filter(function (x) { return typeof x === 'string' && x.length <= 8; }).slice(0, 10);
      }
      if (saved.msgs && typeof saved.msgs === 'object') S.msgs = saved.msgs;
      if (saved.dm && typeof saved.dm === 'object') S.dm = saved.dm;
      /* v33.1 · 私信的规则态：关注了谁 / 接收·免打扰·拉黑·删除时间；旧存档没有，走默认空值 */
      if (saved.dmMeta && typeof saved.dmMeta === 'object') {
        /* dmMeta 是「按对方 uid」的扁平表（不是按账号再嵌一层）：
           读数时也只认这四个键，别的一律丢掉，免得旧存档里的脏字段被当成状态 */
        const mm = {};
        Object.keys(saved.dmMeta).forEach(function (uid) {
          const x = saved.dmMeta[uid];
          if (!x || typeof x !== 'object') return;
          mm[uid] = {
            accepted: !!x.accepted, muted: !!x.muted, blocked: !!x.blocked,
            deletedAt: typeof x.deletedAt === 'number' ? x.deletedAt : 0
          };
        });
        S.dmMeta = mm;
      }
      if (Array.isArray(saved.dmFollow)) S.dmFollow = new Set(saved.dmFollow.filter(function (x) { return typeof x === 'string'; }));
      if (typeof saved.dmVer === 'number') S.dmVer = saved.dmVer;
      if (saved.accounts && typeof saved.accounts === 'object') {
        Object.keys(saved.accounts).forEach(function (k) {
          const a = saved.accounts[k];
          /* users 只有演示账号 u1..u8；真实注册账号 u9/u10 不在表里。
             以前这里用 !users[k] 直接丢弃，导致整页刷新后真实账号的
             本地头像/资料/封面全没了 —— 登录后只能看到服务端的旧值。 */
          if (!a || typeof a !== 'object' || !/^[us]\d{1,9}$/.test(k)) return;
          const t = acct(k);
          if (a.profile && typeof a.profile === 'object') t.profile = a.profile;
          if (a.avatar && typeof a.avatar === 'object') t.avatar = a.avatar;
          if (typeof a.cover === 'string') t.cover = a.cover;
        });
      }
      /* 旧存档（单账号时代）只有 profile/avatar/cover 三键，全部归到 u1，不丢用户改过的东西 */
      if (saved.profile && typeof saved.profile === 'object') acct('u1').profile = saved.profile;
      if (saved.avatar && typeof saved.avatar === 'object') acct('u1').avatar = saved.avatar;
      if (typeof saved.cover === 'string') acct('u1').cover = saved.cover;
      if (typeof saved.account === 'string' && /^[us]\d{1,9}$/.test(saved.account)) S.account = saved.account;
      /* v37 · 本机旧存档清理：旧版注册会随机写 emoji + grad（两者独立随机），
         这些组合如果留在 accounts 里，访客看到的空间页 / 评论区头像会继续显示旧渐变鲸鱼。
         只保留「上传图」与「精确命中 8 组预设」两种；其余一律回到统一默认图。 */
      const presetAva = (profileOptions.avatarPresets || []).map(function (p) {
        return String(p.grad || '') + '\u0000' + String(p.emoji || '');
      });
      Object.keys(S.accounts).forEach(function (k) {
        const a = S.accounts[k] && S.accounts[k].avatar;
        if (!a || typeof a !== 'object' || a.img) return;
        if (presetAva.indexOf(String(a.grad || '') + '\u0000' + String(a.emoji || '')) < 0) {
          S.accounts[k].avatar = null;
        }
      });
    } catch (err) {}
  })();

  /* 动效编排用的瞬时状态：pageSig 判断是否整页切换；lbOpen 控制灯箱退场 */
  let pageSig = null;
  /* 会员页有局部状态（筛选 / 倒计时 / 轮询），只在「路由 + 地址」真变了才重新挂载 */
  let vipMountKey = '';
  let enterNext = true;
  /* 首绘前要等服务端数据的路由。
     · feed / art：页面里挂着鲸鱼娘动态立绘（whale/index.html 的 iframe），
       iframe 一旦被 innerHTML 重写就会连文档一起重建 —— 视频重新下载、再淡入，
       看起来就是「卡片闪一下才出现」，所以这两页必须等数据齐了再画；
     · favs：收藏里可能存着只在服务端的日志，先画会把它们误标成「已失效」，
       同步完成再改一遍又闪一次，同样等齐再画。
     · login / oauth / verify 不吃服务端列表数据，不在表里。 */
  const AUTH_ONLY_ROUTES = { login: 1, oauth: 1, verify: 1 };
  const BOOT_SYNC_ROUTES = { feed: 1, art: 1, favs: 1 };
  /* 上一次绘制用的是第几版数据（API.dataVersion()）。
     绘制时记下版本号，同步回调里比较：数据已经画进去了就别再整页重写。 */
  let paintedDataVersion = -1;
  const dataVersionNow = function () {
    return (window.API && typeof window.API.dataVersion === 'function') ? window.API.dataVersion() : 0;
  };
  let seeded = false; /* 首次进入用 replaceState，之后导航用 pushState（保后退键） */
  let lastHashShown = '';
  /* 浏览器前进/后退触发 hashchange 时，render 不能再 push 一条，否则会截断 forward 历史 */
  let fromHashNav = false;

  /* 平滑滚动是 JS 参数，媒体查询管不到：统一走这里，reduced-motion 下直接跳 */
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const scrollMode = function () { return (RM && RM.matches) ? 'auto' : 'smooth'; };

  /* ---------- v37 · 全站统一的默认头像 ----------
     需求：所有新注册用户的初始头像统一成产品指定的那张鲸鱼线稿，
     系统不再随机分配、也不再保留第二张默认头像。

     做法不是「注册时往每个账号里塞一份图片」，而是让**默认出口只有一个**：
     avURL(uid) 对任何「自己没选过、也没上传过」的账号都返回
     js/default-avatar.js 里的 DEFAULT_AVA_IMG（同一张 dataURL）。
     服务端 v37 起注册写空 emoji/grad；旧账号里只有 grad 的残留也按默认处理。
     邮箱注册、第三方授权、演示账号、历史存档都落同一张图。 */
  /* 仅在 DEFAULT_AVA_IMG 缺失时给画布兜底用；正常路径不会走到这里。 */
  const DEFAULT_AVA_PAIR = ['#4f86e0', '#3457b8'];

  /* ---------- 头像：统一默认图 + 画布预设 ----------
     三种来源共用一个出口：
       1) 未自定义：js/default-avatar.js 的 DEFAULT_AVA_IMG（产品指定鲸鱼线稿），
          全站同一张；v37 起注册不再随机分配 emoji/grad，所以新号直接落这里；
       2) 自选：编辑资料里挑的渐变 + emoji，走 avatarURL() 画布；
       3) 上传：直接返回图片 URL / dataURL，不再过画布。
     avURL() 只把「有 img 或 emoji」的账号当作自定义；只有 grad 的旧存档
     也按未自定义处理，避免再画出第二张渐变鲸鱼。 */
  const AV = {};
  function gradPair(str, fb) {
    const m = String(str || '').match(/#[0-9a-fA-F]{3,8}/g);
    if (m && m.length >= 2) return [m[0], m[1]];
    if (m && m.length === 1) return [m[0], m[0]];
    return fb;
  }
  /* ---------- v18 · 鲸鱼默认头像 ----------
     规则：谁都没「选过」头像时，一律画鲸鱼 —— 包括 u1..u8 这些演示账号和刚注册的新用户。
     判据只有一条：账号里存了 emoji（编辑资料里挑的预设）或 img（自己上传的）才算自选；
     其余情况（avatar 为 null、只有渐变、新号根本没建槽）全部落到鲸鱼。
     画法与老头像同一套语汇：双色渐变圆 + 左上 22% 白色柔光 + 居中白色图形，
     所以放在一起不会显得是两套风格。图形用 100×100 的坐标画，再按画布缩放，
     小到 16px 的收藏夹图标也认得出是鲸鱼。 */
  /* 一条闭合路径画完身体 + 尾：尾巴左侧留一个凹口，读起来才是「鲸鱼尾」，
     而不是身体旁边贴了片叶子（v19 之前那版就是这个毛病，38px 以下尤其明显）。 */
  const WHALE_BODY = 'M88 56C88 44 76 37 58 37C42 37 28 43 21 51L11 43C8 41 5 43 6 47L7 57L6 67C5 71 8 73 11 71L21 63C28 71 42 77 58 77C76 77 88 69 88 56Z';
  const WHALE_FIN = 'M39 41C41 32 47 30 51 39C47 37 43 38 39 41Z';
  function paintWhale(g, cx, cy, len, ink) {
    /* 先在 100 单位坐标系里画，再整体缩放：size 参数就是鲸鱼想要的宽度 */
    const k = len / 100;
    g.save();
    g.translate(cx - len / 2, cy - len / 2);
    g.scale(k, k);
    /* 注意：CanvasRenderingContext2D 上没有 addPath（那是 Path2D 的方法），
       直接把 Path2D 交给 fill() 才有效 —— 写成 ctx.addPath() 会抛
       「g.addPath is not a function」，而且是在渲染头像时抛，整页白屏。 */
    g.fillStyle = ink;
    g.fill(new Path2D(WHALE_BODY));
    g.fill(new Path2D(WHALE_FIN));
    /* 喷气：两段水柱 + 一滴。位置压在背鳍右上方，起点接在背上，
       这样 20px 缩略图里仍读得出「从背上冒出来」而不是头顶飘着根天线。 */
    g.strokeStyle = ink; g.lineCap = 'round';
    g.lineWidth = 4.6;
    g.beginPath(); g.moveTo(62, 40); g.quadraticCurveTo(56, 28, 63, 18); g.stroke();
    g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(59, 29); g.quadraticCurveTo(69, 24, 75, 26); g.stroke();
    g.beginPath(); g.arc(67, 12, 3.1, 0, Math.PI * 2); g.fill();
    /* 眼睛：挖成透明洞，任何底色上都成立 */
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(78, 52, 3.4, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  /* 头像出口：img（上传）> emoji（自选预设）> 鲸鱼（默认） */
  function avatarURL(ava, fbEmoji, fbGrad) {
    const a = ava || {};
    if (a.img) return a.img;
    const pair = gradPair(a.grad, fbGrad || ['#9db8d2', '#6b8fb5']);
    const emoji = a.emoji || '';
    const key = 'k|' + pair[0] + '|' + pair[1] + '|' + (emoji || 'whale');
    if (AV[key]) return AV[key];
    const c = document.createElement('canvas');
    c.width = c.height = 132;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(8, 8, 124, 124);
    gr.addColorStop(0, pair[0]); gr.addColorStop(1, pair[1]);
    g.fillStyle = gr;
    g.beginPath(); g.arc(66, 66, 66, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.22; g.fillStyle = '#fff';
    g.beginPath(); g.arc(48, 40, 40, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    if (emoji) {
      g.font = '62px "Segoe UI Emoji","Apple Color Emoji",system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(emoji, 66, 72);
    } else {
      /* 鲸鱼略偏下，把喷气口留在视觉中心上方，和 emoji 版的重心一致 */
      paintWhale(g, 66, 74, 96, '#ffffff');
    }
    const url = c.toDataURL('image/png');
    AV[key] = url; return url;
  }
  /* 每个账号各有自己的头像：改过就用账号里的，没改过用统一默认图。
     data.js 里 users 的 emoji/grad 只用于演示资料卡的文字，不再参与头像兜底。 */
  function avaOf(uid) {
    const k = uid || S.account;
    const a = S.accounts[k];
    return (a && a.avatar) ? a.avatar : ((users[k] && users[k].ava) || null);
  }
  /* 注意第二个参数传空串：data.js 里每个账号带的 emoji 是「旧版默认头像」的残留，
     继续拿它兜底就等于没换。现在只有账号自己存过 emoji（编辑资料里挑的预设）
     才会盖过默认图。第三个参数只给画布预设做兜底渐变，不再按 uid 取色。 */
  /* 指定图片的挂载点：把一张图片（dataURL 或站内路径）赋给 window.DEFAULT_AVA_IMG，
     所有「还没自定义过头像」的账号就统一换成它；留空则用上面画布生成的鲸鱼。
     留这个口子是因为「统一默认头像」迟早要换成运营给的那张图 —— 换图不该再改代码。 */
  function defaultAvaSrc() {
    const g = window.DEFAULT_AVA_IMG;
    return (typeof g === 'string' && g) ? g : avatarURL(null, '', DEFAULT_AVA_PAIR);
  }
  function isCustomAva(a) {
    return !!(a && (a.img || a.emoji));
  }
  function avURL(uid) {
    const a = avaOf(uid);
    if (!isCustomAva(a)) return defaultAvaSrc();
    return avatarURL(a, '', DEFAULT_AVA_PAIR);
  }
  /* 「这个人还在用默认头像吗」——默认图不该被算成一次自定义，
     编辑资料的完整度与提示文案都靠这一条判断。
     v37：只有 img / emoji 才算自定义；旧账号只剩一个 grad 时也算默认。 */
  function usingDefaultAva(uid) { return !isCustomAva(avaOf(uid || ME())); }
  /* 外链只放行 http/https：条目里的 repo / homepage 是作者自己填的，
     一个 javascript: 就是一次点击即执行。解析失败的当没有链接处理。 */
  /* 仓库地址在库里有两种写法：`https://github.com/x/y` 和裸域 `github.com/x/y`。
     裸域直接拼进 href 会被当成相对路径（点了跳到本站 404），所以这里补协议再校验；
     补完仍不是 http(s) 的一律返回空 —— 不许出现 javascript:/data: 这类协议。 */
  function repoHref(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    const cand = /^https?:\/\//i.test(s) ? s : (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(s) ? 'https://' + s : '');
    if (!cand) return '';
    try {
      const x = new URL(cand);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
    } catch (e) { return ''; }
  }
  function safeUrl(u) {
    const s = String(u || '').trim();
    if (!/^https?:\/\//i.test(s)) return '';
    try { return new URL(s).href; } catch (e) { return ''; }
  }
  function av(uid, size, cls) {
    /* v40 · 别人的头像本身就是入口（点了进他的空间）。自己的头像不加这层壳：
       导航那颗归 avatar-btn 管，点了要开账号弹层，不能被这里截走。 */
    const mine = !!uid && uid === S.account;
    const avNav = (uid && !mine && users[uid])
      ? ' data-avuid="' + uid + '" role="link" tabindex="0" aria-label="进入 ' + esc(users[uid].name) + ' 的空间"'
      : '';
    /* data-auid 是给头像框用的：谁的脸、哪一档，画环的时候要认人。
       自己那颗也算 —— 别人的 data-avuid 只在能点进空间时才挂，口径不一样。 */
    return '<img class="av ' + (cls || '') + '" data-auid="' + esc(uid || '') + '" src="' + avURL(uid) + '" width="' + size + '" height="' + size +
      '" style="width:' + size + 'px;height:' + size + 'px" alt="' + esc(users[uid] ? users[uid].name : '') + '"' + avNav + '>';
  }
  /* 头像兜底：演示站里 u8 这类账号的头像指向后端图床（/uploads/...），没有 server/uploads
     目录时整张 404，列表里就是一张破图 + alt 文字。捕获阶段接一次 error，换成默认鲸鱼。 */
  document.addEventListener('error', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.classList.contains('av') || t.dataset.avFallback) return;
    t.dataset.avFallback = '1';
    t.src = defaultAvaSrc();
  }, true);
  /* ---------- v15 · 多账号 ----------
     S.account 是当前账号；每个账号有自己的 profile / avatar / cover。
     全站所有「我」都从这里取，不再把 u1 写死在代码里。 */
  /* 未登录时没有「我」：返回空字符串而不是留着上一个账号的 id。
     否则访客翻到 u1 的空间会被判成 own=true，看见「编辑资料 / 写日志」这类按钮，
     点下去又以访客身份失败 —— 更糟的是这会让页面看起来像已经登录了别人。 */
  function ME() { return isGuest() ? '' : S.account; }
  /* 服务端真实账号（'s' + id）与演示账号（u1..u8）的区别只在这一处判：
     演示账号带一整套样例数据（私信、通知、贡献记录），真实账号从白板开始。 */
  function isSrvUid(k) { return !!(k && k.charAt(0) === 's'); }
  /* 兜底用户。访客回复（ME() 返回空串）、后注册的账号、上一版本存下来的楼层，
     id 都可能在演示 users 表里查不到；以前这里是 users[id].name 直取，
     一个陌生 id 就把整张帖子页打成空白（render 抛异常，后续点击全失效）。 */
  const GUEST_USER = { name: '访客', emoji: '🐋', level: 1, badge: '',
    grad: 'linear-gradient(135deg,#7aa2ff,#a46bff)', sig: '', city: '未设置',
    fans: 0, follows: 0, visits: 0 };
  function userOf(uid) { return (uid && users[uid]) || GUEST_USER; }
  function acct(uid) {
    const k = uid || S.account;
    if (!S.accounts[k]) S.accounts[k] = { profile: null, avatar: null, cover: '' };
    return S.accounts[k];
  }
  function meAva() { return acct(ME()).avatar; }
  function meCover() { return acct(ME()).cover; }
  /* 封面在 acct(uid).cover 里只存一条 CSS background 简写：
     预设是 linear-gradient(...)，本地上传是 url(data:image/jpeg;base64,…) center/cover no-repeat。
     两种值都能原样塞进 style="background:…"，所以空间头图、右侧名片、编辑页预览三处
     共用一个出口，不必各自判断来源。
     coverIsImg() 只回答「这张是不是用户自己传的图」—— 预设网格的选中态与
     「本地上传」那一整行互斥，全靠这一个判断，别在渲染里各写一遍正则。 */
  function coverIsImg(c) { return /^url\(/i.test(String(c || '')); }
  /* 上传封面的硬闸门：原件体积、类型、以及「压完要装得进 localStorage」的字符上限。
     900 KB 的 dataURL 对 5 MB 配额是安全余量（存档里还有点赞、评论、作品图）。 */
  const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const COVER_MAX_IN = 10 * 1024 * 1024;
  const COVER_MAX_CHARS = 900 * 1024;
  /* 账号 ↔ 登录内核的桥。
     js/auth.js 管「谁能登录、登录后能不能换号、手机号认证过没过」；
     这一个函数把它翻译成页面要的东西，页面不自己判断身份。
     内核没加载（比如老缓存只引了 app.js）时按「未登录」处理：
     宁可让用户看到登录入口，也不能在身份不明时允许他发帖 ——
     发出去的帖子带的是别人账号的署名，这比白屏难解释得多。 */
  function authState() {
    if (window.AUTH && window.AUTH.state) {
      try { return window.AUTH.state(); } catch (err) {}
    }
    return { mode: 'guest', uid: '', email: '', name: '', sid: '', at: 0, ua: '', phoneOk: false, phone: '' };
  }
  function isGuest() { return authState().mode !== 'authed'; }
  /* 手机号认证已下线：登录只有邮箱与 GitHub，没有第二道闸门 */
  function isLocked() { return false; }
  /* 登录 / 认证通过之后，把「当前账号」切到内核认的那个人。
     演示账号（u1..u8）走 data.js 的资料；第三方账号没有底稿，用内核给的名字补一条。 */
  function adoptAccount(uid, name) {
    if (!uid) return;
    if (!users[uid]) {
      /* 服务端账号从白板开始：以前这里 Object.assign({}, users.u1, ...)，
         于是每个新注册的人都继承了 u1 的渐变头像、职业、生日和标签 ——
         粉丝数虽然被覆盖成 0，但资料卡看上去仍然像别人的。
         现在是一条全零记录，等下让他自己去 #/welcome 填。 */
      users[uid] = blankUserRow(name);
      /* 注册/首次授权登录建号的那一刻就把头像槽写成「未自定义」：
         渲染层会立刻给出系统默认头像，不必等用户去编辑资料页点一次。
         写 null 而不是写图片本身，是为了让「改过」与「没改过」在数据上
         依然可区分 —— 用户之后上传或挑预设，直接覆盖这一个字段即可。
         注意必须带 !S.accounts[uid] 守卫：本函数在每次启动时都会按会话调用一次
         （app.js 启动尾部），而 users[uid] 是内存表、刷新就没了 ——
         无守卫地覆盖会把新用户刚换好的头像在刷新后清成默认。 */
      if (!S.accounts[uid]) S.accounts[uid] = { profile: null, avatar: null, cover: '' };
    }
    /* 服务端资料回填：登录态快照里的 name / sig / city / emoji / grad / avatar
       是「这台设备之外的真相」，本地 users/S.accounts 只是缓存。
       以前改名换头像只写 localStorage，换台机器（或清了缓存）就退回注册时的样子。
       字段为空时保持本地值 —— 服务端没存过，不代表用户想清空。 */
    const st = authState();
    if (st && st.mode === 'authed' && st.uid === uid) {
      const u = users[uid];
      if (u) {
        if (st.name) u.name = st.name;
        if (st.sig) u.sig = st.sig;
        if (st.city) u.city = st.city;
        if (st.grad) u.grad = st.grad;
      }
      const a = acct(uid);
      if (st.avatar) {
        const cur = a.avatar || {};
        if (cur.img !== st.avatar) a.avatar = { img: st.avatar };
      } else if (st.emoji) {
        /* 只有 emoji 才算「用户挑了预设」；v37 之前注册会随机写 emoji+grad，
           这里不再把「只有 grad」的组合当成自定义头像。 */
        const cur = a.avatar || {};
        if (!cur.img) a.avatar = { grad: st.grad || (cur.grad || ''), emoji: st.emoji };
      } else {
        /* 服务端明确没有自定义头像：清掉本机旧的 emoji/渐变缓存，
           避免刷新后还显示上一版的随机预设。本机未同步的 img 保留。 */
        const cur = a.avatar;
        if (cur && !cur.img) a.avatar = null;
      }
    }
    S.account = uid; S.spaceUser = uid; S.draft = null; S.fileErr = '';
  }
  /* users 表只存城市没有省；从省市表反查，保证每个人的资料卡一进来就带地区 */
  function provOfCity(city) {
    const pv = profileOptions.provinces, keys = Object.keys(pv);
    for (let i = 0; i < keys.length; i++) if (pv[keys[i]].indexOf(city) >= 0) return keys[i];
    return keys[0] || '';
  }
  function badgeCls(b) { return b === '版主' ? 'mod' : b === '内测组' ? 'beta' : ''; }
  function userTags(u) {
    let h = '<span class="lv">Lv.' + u.level + '</span>';
    if (u.badge) h += '<span class="tag-badge ' + badgeCls(u.badge) + '">' + u.badge + '</span>';
    return h;
  }

  /* ---------- toast ----------
     live region 必须在首次播报之前就存在于 DOM 里：
     懒建的话第一条消息是「创建节点 + 同时写入文本」，屏读多半会漏掉。 */
  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  toastWrap.setAttribute('aria-live', 'polite');
  toastWrap.setAttribute('role', 'status');
  toastWrap.setAttribute('aria-atomic', 'false');
  document.body.appendChild(toastWrap);
  function toast(msg, icon, opt) {
    const t = document.createElement('div');
    t.className = 'toast';
    const hasAct = !!(opt && opt.label && typeof opt.onClick === 'function');
    if (hasAct) t.classList.add('has-act');
    t.innerHTML = '<span>' + (icon || '✅') + '</span><span>' + esc(msg) + '</span>' +
      (hasAct ? '<button type="button" class="toast-act">' + esc(opt.label) + '</button>' : '');
    /* 同一时间只留一条带动作的 toast：否则「已收藏 · 去看看」还没退场，
       紧接着的「已取消 · 撤销」就叠在它上面，用户点到的可能是上一条的动作。 */
    if (hasAct) {
      Array.prototype.forEach.call(toastWrap.querySelectorAll('.toast.has-act'), function (old) {
        old.classList.add('out');
        old.classList.remove('in');
        setTimeout(function () { old.remove(); }, 260);
      });
    }
    toastWrap.appendChild(t);
    let closed = false;
    const close = function () {
      if (closed) return;
      closed = true;
      t.classList.add('out');
      t.classList.remove('in');
      setTimeout(function () { t.remove(); }, 260);
    };
    if (hasAct) {
      t.querySelector('.toast-act').addEventListener('click', function (ev) {
        ev.stopPropagation();
        close();
        /* 撤销是「用户明确点的动作」：先关掉这条，再执行；回调自己负责 toast 反馈 */
        try { opt.onClick(); } catch (err) {}
      });
    }
    /* 下一帧再上 .in，让 transition 从初始态起步（可重复触发也不会重播关键帧） */
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
    setTimeout(close, (opt && opt.duration) || 1900);
  }

  /* 复制：只有真的写进剪贴板才播「已复制」，被拒就播失败。
     旧写法 try{writeText()}catch{} 后无条件 toast —— Promise 不会被 try 捕获，
     于是「没复制成功」也会报成功。 */
  function copyText(v, okMsg, failMsg, el) {
    /* 两条路都失败时别只报一句「请手动选中」——直接把那段字选中，
       用户按 Ctrl+C 就能走，尤其 sha256 有 64 位，肉眼选中根本不现实。 */
    /* 选中必须真的是那段值：sha256 是 64 位，按钮上的文字却是截断 + 中文提示，
       直接选按钮等于让用户复制一句「9f2c…（64 位，点这复制）」。所以插一个
       只读输入框，把完整值放进去并选中。 */
    const selectHost = function () {
      try {
        const host = el || document.querySelector('[data-sha="' + v + '"]');
        const box = (host && host.parentNode) || document.body;
        let inp = box.querySelector('.sha-fallback');
        if (!inp) {
          inp = document.createElement('input');
          inp.type = 'text'; inp.readOnly = true; inp.className = 'sha-fallback';
          inp.setAttribute('aria-label', '完整值，按 Ctrl+C 复制');
          (host && host.parentNode ? host.parentNode : box).insertBefore(inp, host ? host.nextSibling : null);
        }
        inp.value = v;
        inp.focus(); inp.select();
        return true;
      } catch (err) { return false; }
    };
    const fallback = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = v; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) { toast(okMsg, '📋'); return; }
        toast(selectHost() ? '浏览器拦了复制，已选中，按 Ctrl+C' : failMsg, '⚠️');
      } catch (err) {
        toast(selectHost() ? '浏览器拦了复制，已选中，按 Ctrl+C' : failMsg, '⚠️');
      }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(function () { toast(okMsg, '📋'); }, fallback);
      } else { fallback(); }
    } catch (err) { fallback(); }
  }

  /* ---------- 顶栏 ---------- */
  /* P1 · 智能搜索：用户/插件/话题按命中优先级路由 */
  function smartSearch(q0) {
    const q = (q0 || '').trim().toLowerCase();
    if (!q) { toast('输入关键词再搜索', '🔍'); return; }
    for (const id in users) {
      if ((users[id].name || '').toLowerCase().indexOf(q) >= 0) {
        S.spaceUser = id; S.route = 'space'; S.tab = '日志'; S.pop = null; S.q = ''; render(false); return;
      }
    }
    const plugHit = plugins.some(function (p) {
      return ((p.name || '') + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (plugHit) { S.route = 'market'; S.q = q; S.cat = '全部'; S.sort = '热度'; S.pop = null; render(false); return; }
    const threadHit = S.newThreads.concat(threads).some(function (t) {
      return ((t.title || '') + ' ' + (t.excerpt || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (threadHit) { S.route = 'forum'; S.q = q; S.ftag = '全部'; S.pop = null; render(false); return; }
    S.route = 'forum'; S.q = q; S.ftag = '全部'; S.pop = null; render(false);
  }

  /* v42 · 顶栏语言切换：只换界面文案，帖子 / 评论等用户内容保持原文（见 js/i18n.js）。 */
  function langSwitchHTML() {
    const cur = window.I18N ? I18N.lang() : 'zh';
    return '<div class="lang-switch" role="group" aria-label="界面语言" data-i18n-skip>' +
      '<button type="button" data-act="lang" data-lang="zh" class="' + (cur === 'zh' ? 'on' : '') + '"' +
      ' aria-pressed="' + (cur === 'zh') + '" title="中文界面">中</button>' +
      '<button type="button" data-act="lang" data-lang="en" class="' + (cur === 'en' ? 'on' : '') + '"' +
      ' aria-pressed="' + (cur === 'en') + '" title="English interface">EN</button>' +
      '</div>';
  }

  function navHTML() {
    const SUB = ['entry', 'claim', 'upload'];
    /* v34：顶栏不再放「标签」胶囊 —— 标签页本身还在（#/tags，左栏「全部标签 ›」与社群多选都能进），
       只是主航不占一格，把宽度还给搜索框 */
    /* v40 · 「赞助」放在「我的空间」前面：它是站点级入口（账单靠它），不是个人入口 */
    const links = [['feed', '首页'], ['art', '鲸鲸空间'], ['market', '插件库'], ['forum', '社群'], ['rank', 'AI排行'], ['vip', '赞助'], ['space', '我的空间']];
    return '<div class="nav"><div class="nav-in">' +
      '<div class="logo" data-act="go" data-route="feed"><span class="mark">' + tail(22, 5.2) + '</span>' + BR.name + '<small>' + BR.en + '</small></div>' +
      '<nav class="nav-links" aria-label="主导航">' + links.map(function (l) {
        const on = S.route === l[0] || (l[0] === 'market' && SUB.indexOf(S.route) >= 0);
        return '<a class="' + (on ? 'on' : '') + '" data-act="go" data-route="' + l[0] + '"' +
          (on ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
      }).join('') +
      '</nav>' +
      '<div class="nav-right">' +
        '<div class="nav-search"><span style="font-size:12px;opacity:.85">🔍</span>' +
          '<input id="navq" type="search" aria-label="搜索插件、帖子或用户" placeholder="搜插件 / 帖子 / 用户" value="' + esc(S.q) + '"></div>' +
        '<button class="icon-btn" data-act="theme" type="button" title="切换白天 / 夜间" aria-label="切换白天 / 夜间模式">' + (document.documentElement.dataset.theme === 'night' ? '🌙' : '☀️') + '</button>' +
        langSwitchHTML() +
        navUserHTML() +
      '</div></div>' +
      (S.pop === 'notice' ? noticePop() : '') + (S.pop === 'me' ? mePop() : '') + '</div>';
  }

  /* ---------- v18 · 消息中心 ----------
     数据层给每条消息一个稳定的 id 和 kind，读没读过只记 id（S.noticeRead）。
     三个派生只在这里算：noticeIsRead / noticeUnreadCount / noticeList。
     于是「铃铛数字」「页签上的小圆点」「一键已读」「点开一条即已读」四处永远一致，
     不会出现「铃铛还有 3 条但点开全是灰的」这种自相矛盾。 */
  /* 默认是未读：data.js 里只有系统通知（n9/n10）显式写 unread:false。
     判据写成 n.unread === false 而不是 !n.unread —— 后者在字段缺失时也会把消息判成已读，
     结果铃铛一开始就是 0，用户永远看不到未读提醒。 */
  function noticeIsRead(n) { return n.unread === false || S.noticeRead.has(n.id); }
  function noticeList(kind) {
    /* 消息是「我的」东西，没有「我」就没有消息：D.notices 是演示样例（谁给你点了赞、谁回了你哪层楼），
       只该出现在演示账号身上。这里必须同时挡两种人 ——
       未登录的访客（ME() 是空串，以前漏在这里，于是访客看到一屏跟 TA 毫无关系的假互动）
       与服务端真实账号（新注册的人一条都没有，硬塞进去等于伪造互动）。 */
    if (isGuest() || isSrvUid(ME())) return [];
    const k = kind || S.noticeKind || 'all';
    return k === 'all' ? notices.slice() : notices.filter(function (n) { return n.kind === k; });
  }
  function noticeUnreadCount(kind) {
    return noticeList(kind).filter(function (n) { return !noticeIsRead(n); }).length;
  }
  function noticeUnreadTotal() { return noticeUnreadCount('all'); }

  /* 顶栏右上角两项，按 B 站的做法排：左边是「图标 + 文字」的胶囊（消息），
     右边是头像 + 昵称的账号入口。未登录时右边换成「登录」胶囊。
     未登录不是「没有这个人」而是「离线」：消息与个人动作都要先登录，所以给的是入口不是空壳。 */
  function navUserHTML() {
    const st = authState();
    const un = noticeUnreadTotal();
    const bell = '<button class="nav-act" data-act="pop" data-pop="notice" type="button"' +
      ' title="消息中心" aria-label="消息中心' + (un ? '，' + un + ' 条未读' : '，没有未读') +
      '" aria-expanded="' + (S.pop === 'notice' ? 'true' : 'false') + '">' +
      '<span class="na-ic" aria-hidden="true">🔔</span><span class="na-tx">消息</span>' +
      (un ? '<i class="dot-badge" aria-hidden="true">' + (un > 99 ? '99+' : un) + '</i>' : '') + '</button>';
    if (st.mode !== 'authed') {
      return bell + '<button class="nav-act nav-act-key nav-act-off" type="button" data-act="go" data-route="login"' +
        ' data-pop="login" title="离线状态，点这里登录" aria-label="当前离线，点这里登录">' +
        '<span class="na-dot" aria-hidden="true"></span><span class="na-tx">离线 · 请登录</span></button>';
    }
    return bell +
      '<div class="avatar-btn" data-act="pop" data-pop="me" role="button" tabindex="0"' +
      ' aria-label="我的账号菜单" aria-expanded="' + (S.pop === 'me' ? 'true' : 'false') + '">' +
      av(ME(), 30) + '<span>' + esc(profileOf().nick) + '</span></div>';
  }

  /* 消息弹层：B 站那种「页签 + 时间倒序列表 + 每条右侧动作」。
     页签上的数字是该类的未读数，切页签不会把消息标已读 —— 已读只由「点进去」或「全部已读」触发。 */
  function noticePop() {
    /* 访客点铃铛看到的不该是一屏别人的消息：给一张登录引导卡，
       页签、未读数、「全部已读」这些都要有消息才有意义，全部不渲染。 */
    if (isGuest()) {
      return '<div class="pop pop-notice">' +
        '<div class="pop-hd"><span>消息中心</span></div>' +
        '<div class="nt-guest"><span class="big" aria-hidden="true">🔔</span>' +
        '<p>登录后这里会显示回复、点赞、私信与通知</p>' +
        '<button class="btn sm blue" type="button" data-act="go" data-route="login">去登录</button></div></div>';
    }
    const cur = S.noticeKind || 'all';
    const list = noticeList(cur);
    const tabs = '<div class="nt-tabs" role="tablist" aria-label="消息分类">' +
      noticeKinds.map(function (k) {
        const n = noticeUnreadCount(k.id);
        const on = cur === k.id;
        /* 弹层只有 330px：五个「图标 + 名字 + 数字」横排需要 420px，
           最后一个「通知」会被挤出可视区，又没有滚动条提示，看起来就是「少了一类」。
           这里去掉 emoji（名字都恰好两个字，五等分刚好放下），图标留在整页与左栏。 */
        return '<button type="button" role="tab" class="nt-tab' + (on ? ' on' : '') + '"' +
          ' data-act="noticetab" data-kind="' + k.id + '" aria-selected="' + (on ? 'true' : 'false') + '"' +
          ' title="' + esc(k.icon + ' ' + k.name) + '">' +
          '<span class="nt-k">' + esc(k.name) + '</span>' +
          (n ? '<i class="nt-n">' + n + '</i>' : '') + '</button>';
      }).join('') + '</div>';
    const rows = list.length ? list.map(function (n) {
      const read = noticeIsRead(n);
      const to = n.to || {};
      return '<div class="notice nt-row' + (read ? ' is-read' : '') + '" data-act="noticeopen" data-id="' + n.id + '"' +
        ' data-route="' + esc(to.route || 'feed') + '"' + (to.uid ? ' data-uid="' + esc(to.uid) + '"' : '') +
        (to.tid ? ' data-tid="' + esc(to.tid) + '"' : '') +
        ' role="button" tabindex="0" aria-label="' + esc(n.title) + (read ? '（已读）' : '（未读）') + '">' +
        '<div class="ni ' + n.tone + '">' + n.icon + '</div>' +
        '<div style="flex:1;min-width:0"><b class="' + (read ? '' : 'unread') + '">' + esc(n.title) + '</b>' +
        '<p>' + esc(n.desc) + '</p></div>' +
        '<div class="nt-meta"><time>' + esc(n.time) + '</time>' +
        '<button type="button" class="nt-x" data-act="noticedel" data-id="' + n.id + '"' +
        ' aria-label="把「' + esc(n.title) + '」标为已读">' + (read ? '✓' : '●') + '</button></div></div>';
    }).join('') : '<div class="nt-empty">这一栏还没有消息</div>';
    const total = noticeUnreadTotal();
    /* 定位交给 CSS 的 .pop-notice：330px 宽 + right:96 在 390px 屏上会算出 left:-36，
       整个弹层左半边被裁掉。这里不再写内联样式。 */
    return '<div class="pop pop-notice">' +
      '<div class="pop-hd"><span>消息中心' + (total ? ' · ' + total + ' 条未读' : '') + '</span>' +
      '<span class="pop-hd-act"><button class="mini" type="button" data-act="readall"' +
      (total ? '' : ' disabled') + ' aria-label="把' + (cur === 'all' ? '全部消息' : '本类消息') + '标记为已读">' +
      (cur === 'all' ? '全部已读' : '本类已读') + '</button>' +
      '<button class="mini" type="button" data-act="go" data-route="messages" title="消息中心整页">查看全部 ›</button></span></div>' +
      tabs + '<div class="nt-list">' + rows + '</div></div>';
  }

  /* 账号弹层：v15 的「八格切号」撤掉了 —— 现在登录态由 AUTH 会话决定，
     同一时间只能有一个账户，换号必须先退出。这里只留「我是谁 / 去哪 / 怎么退出」。 */
  function mePop() {
    const pf = profileOf(ME());
    const u = userOf(ME());
    const st = authState();
    const favN = favCount();
    const dmN = dmUnreadTotal();
    const head = '<div class="pop-me-hd">' + av(ME(), 42) +
      '<div style="min-width:0"><b style="font-size:13.5px">' + esc(pf.nick) + '</b>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(pf.job) + ' · ' + esc(pf.province + ' ' + pf.city) + '</div>' +
      (st.mode === 'authed' && st.email ? '<div style="font-size:11px;color:var(--txt-3);margin-top:2px;overflow:hidden;text-overflow:ellipsis">' + esc(st.email) + '</div>' : '') +
      '</div></div>';
    return '<div class="pop" style="right:0;top:52px;width:272px">' + head +
      /* v29：「编辑资料」从空间页（标签条 / 左栏名片）搬进这个弹层，并改叫「我的资料」——
         头像弹层本来就是回答「我是谁 → 去哪」的地方，改资料属于这里；
         空间页那边只留「+ 发布插件」，不再放第二个改资料的入口。 */
      /* v33：私信也从这个弹层进 —— 未读数直接挂在行尾，和收藏同一个位置 */
      /* v40 · 「我的赞助」带 data-sub=center 直接落到会员中心，不在落地页停一下 */
      [['我的空间', 'space', '›'], ['我的资料', 'profile', '✎'], ['我的私信', 'dm', '✉'], ['我的插件', 'publish', '›'],
       ['我的收藏', 'favs', '›'], ['我的赞助', 'vip', '💎', 'center'], ['设置', 'settings', '›']].map(function (x) {
        const n = x[1] === 'favs' ? favN : x[1] === 'dm' ? dmN : 0;
        /* v44：角标不能只按「有数字才渲染」—— 别的标签页改收藏时，这里要能原地改数字，
           元素不存在就只能整页重绘（会丢掉正在输入的内容）。所以两种角标都常驻，
           靠 [hidden] 控制显隐，并各自带 data-n 标明归属：收藏和私信共用一个 .menu-n 类，
           谁的数字归谁，改一家的计数绝不能顺手把另一家覆盖掉。 */
        const badge = x[1] === 'favs' ? 'fav' : x[1] === 'dm' ? 'dm' : '';
        return '<div class="notice" data-act="go" data-route="' + x[1] + '"' +
          (x[3] ? ' data-sub="' + x[3] + '"' : '') + '><div class="ni blue">' + x[2] + '</div>' +
          '<div style="flex:1"><b>' + x[0] + '</b></div>' +
          (badge ? '<span class="menu-n" data-n="' + badge + '"' + (n ? '' : ' hidden') + '>' + n + '</span>' : '') +
          '</div>';
      }).join('') +
      '<div class="notice" data-act="theme"><div class="ni amber">◐</div><div style="flex:1"><b>切换夜间模式</b></div></div>' +
      '<div class="notice" data-act="logout"><div class="ni rose">⏻</div><div style="flex:1"><b>退出登录</b>' +
      '<p style="margin:2px 0 0;font-size:11px;color:var(--txt-3);font-weight:500">退出后才能换个账号登录</p></div></div></div>';
  }

  /* ---------- 人物卡（鲸鱼娘动态立绘）----------
     首页头图与鲸鲸空间头图共用同一张卡：whale/index.html 就是卡片本身，
     `?embed=1&bare=1` = 铺满宿主 + 卡面不承载任何说明文字（只留最下面那行动态立绘状态）。
     卡内交互全部保留：悬停倾斜 / 单击摸摸 / 双击换片 / 桌面鼠标拖拽 / 进度条。
     光标与触摸滚动交给卡自己处理（内嵌模式下它已经放掉 touch-action）。 */
  function whaleCardHTML() {
    return '<div class="whale-slot" aria-hidden="true">' +
      '<iframe class="whale-frame" src="whale/index.html?embed=1&bare=1&lang=' + (window.I18N ? I18N.lang() : 'zh') + '" title="鲸鱼娘动态立绘，双击换动作" scrolling="no" loading="eager" tabindex="-1"></iframe>' +
      '</div>';
  }

  /* ---------- 首页 ---------- */
  /* 首页头图：只保留立绘与标题，不再叠登录用户的头像/昵称/签名。 */
  /* 头图副标题：原来是写死的「今日 386 条更新」。
     改成按 _at 现算 24 小时内的动态数；一条都没有就诚实说没有 —— 假数字比空数字更伤信任。 */
  function todayLine() {
    const now = Date.now();
    let n = 0;
    for (let i = 0; i < posts.length; i++) {
      const at = posts[i] && posts[i]._at;
      if (at && now - at < 864e5) n++;
    }
    return n ? '今日 ' + n + ' 条更新' : '今天还没有新动态';
  }
  function heroHTML() {
    /* 头图只留立绘与标题：登录后的「头像 + 昵称 + 签名」浮层已移除。
       登录入口仍在顶栏、右栏离线名片与发布框，三处都能进登录页。 */
    return '<div class="cover">' +
      '<span class="cloud cl1"></span><span class="cloud cl2"></span><span class="cloud cl3"></span>' +
      whaleCardHTML() +
      '<div class="cover-txt"><h1>' + BR.full + '</h1><p><span class="slogan">' + BR.slogan + '</span> · <span class="today">' + todayLine() + '</span></p></div>' +
      '</div>';
  }

  /* 配图预览条：待发布的图先在这里排队，publish 时才随正文一起交给后端。
     dataURL 只活在内存里（S.pendingImages），刷新即失效 —— 否则几百 KB 会撑爆 localStorage。 */
  function imgPrevHTML(id, list) {
    if (!list || !list.length) return '';
    return '<div class="imgprev" id="' + id + '">' +
      list.map(function (im, i) {
        return '<figure class="ipv"><img src="' + im.src + '" alt="待发布图片 ' + (i + 1) + '" loading="lazy" decoding="async">' +
          '<button class="ipv-x" type="button" data-act="imgdel" data-i="' + i + '" aria-label="移除第 ' + (i + 1) + ' 张图片">✕</button></figure>';
      }).join('') +
      '<span class="ipv-n">' + list.length + ' / ' + IMG_MAX + '</span></div>';
  }

  /* 关联插件面板：只在点开时渲染，选中后收起，正文旁边留一个可撤销的 chip */
  function pluginPickerHTML(sel) {
    return '<div class="plug-pick" role="group" aria-label="选择要关联的插件">' +
      plugins.slice(0, 6).map(function (p) {
        const on = sel && sel.name === p.name;
        return '<button type="button" class="pp-item' + (on ? ' on' : '') + '" data-act="pluginset" data-name="' + esc(p.name) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="pp-ic">' + p.icon + '</span><span class="pp-tx"><b>' + esc(p.name) + '</b><em>' + verTxt(p) + ' · ' + num(p.installs) + ' 次安装</em></span></button>';
      }).join('') + '</div>';
  }

  function composerHTML() {
    const pimg = S.pendingImages || [];
    const sel = S.pendingPlugin ? (plugins.filter(function (p) { return p.name === S.pendingPlugin; })[0] || null) : null;
    return '<div class="card"><div class="tabs">' +
      [['全部', '全部日志'], ['关注', '我关注的'], ['插件', '插件更新'], ['问答', '求助问答']].map(t =>
        '<button class="tab ' + (S.tab === t[0] ? 'on' : '') + '" data-act="feedtab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') +
      '<span class="spacer"></span><span class="sort">按时间</span></div>' +
      '<div class="composer">' + (isGuest()
        ? '<img class="av av-guest" src="' + defaultAvaSrc() + '" width="44" height="44" style="width:44px;height:44px" alt="">'
        : av(ME(), 44)) + '<div class="box">' +
      /* 访客也能在这里打字（想了想写什么，别一上手就吞掉），
         但按钮写清「登录后发表」，点了走闸门去登录页 —— 不假装能发。 */
      '<textarea id="composer" placeholder="' + (isGuest()
        ? '登录后就能发日志：写下这次更新了什么……'
        : '写下这次更新了什么：版本、改动、踩到的坑……（可以直接粘贴或拖入图片）') + '"></textarea>' +
      imgPrevHTML('imgprev', pimg) +
      '<div class="composer-tools"><div class="tool-row">' +
      '<button class="tool" type="button" data-act="imgpick" title="选择本地图片，也可以直接把图片粘贴或拖进来"><span aria-hidden="true">🖼️</span> 图片' +
      (pimg.length ? '<i class="tool-n">' + pimg.length + '</i>' : '') + '</button>' +
      '<button class="tool' + (sel ? ' on' : '') + '" type="button" data-act="pluginpick" aria-expanded="' + (S.pickerOpen ? 'true' : 'false') + '"><span aria-hidden="true">🧩</span> 关联插件</button>' +
      '<button class="tool" type="button" data-act="topictag" title="插入一个话题标记"><span aria-hidden="true">#️⃣</span> 话题</button>' +
      '<button class="tool" type="button" data-act="attach"><span aria-hidden="true">📎</span> 附件</button>' +
      '<input type="file" id="cmt-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
      '</div><div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:11.5px;color:var(--txt-3)" id="ccount">0 / 500</span>' +
      '<button class="btn" data-act="publish">' + (isGuest() ? '登录后发表' : '发表') + '</button></div></div>' +
      (sel ? '<div class="plug-picked">已关联 <b>' + esc(sel.name) + '</b><em>v' + esc(sel.ver) + '</em>' +
        '<button type="button" data-act="pluginclear" aria-label="取消关联插件">✕</button></div>' : '') +
      (S.pickerOpen ? pluginPickerHTML(sel) : '') +
      '</div></div></div>';
  }

  /* ---------- 配图：读取 / 校验 / 入队 ---------- */
  /* 文件 -> dataURL。用 FileReader 而不是 canvas 转码：GIF 才会动，
     canvas 一过手就只剩第一帧。真正压缩交给 API.uploadImage（上传前才压）。 */
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const img = new Image();
        img.onload = function () {
          resolve({ src: fr.result, file: file, w: img.naturalWidth, h: img.naturalHeight, type: file.type });
        };
        img.onerror = function () { resolve({ src: fr.result, file: file, w: 0, h: 0, type: file.type }); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('读取失败')); };
      fr.readAsDataURL(file);
    });
  }

  /* 统一的入队口：拖拽、粘贴、选择文件三条路都走这里，规则只有一份。
     queue 用 S 上的键名（日志是 pendingImages，社群发帖是 ntImages）。 */
  function addImages(files, queueKey) {
    const list = Array.prototype.slice.call(files || []);
    const box = S[queueKey] || (S[queueKey] = []);
    if (!list.length) return Promise.resolve(0);
    const room = IMG_MAX - box.length;
    if (room <= 0) { toast('一条最多 ' + IMG_MAX + ' 张图，先删一张再加', '🖼️'); return Promise.resolve(0); }
    const picked = [];
    let bad = '';
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (IMG_TYPES.indexOf(f.type) < 0) { bad = '只支持 PNG / JPG / GIF / WebP'; continue; }
      if (f.size > IMG_MAX_BYTES) { bad = '单张图片不能超过 5 MB'; continue; }
      if (picked.length >= room) { bad = '一条最多 ' + IMG_MAX + ' 张图'; break; }
      picked.push(f);
    }
    if (bad) toast(bad, '⚠️');
    if (!picked.length) return Promise.resolve(0);
    return Promise.all(picked.map(readImage)).then(function (imgs) {
      imgs.forEach(function (im) { if (box.length < IMG_MAX) box.push(im); });
      return imgs.length;
    });
  }

  /* 回复框预览条的删除：预览条由 imgPrevHTML 统一渲染成 data-act="imgdel"（和发帖共用同一个按钮），
     所以不能把队列写死成发帖那份 —— 否则回复框点 ✕ 是静默 no-op（验收簇 A）。
     这里按当前编辑器分派：回复框走 S.rpImages，只重画预览条与工具行角标，不整页重绘（草稿 / 光标不丢）。 */
  function delReplyImage(i) {
    const box = S.rpImages || (S.rpImages = []);
    box.splice(i, 1);
    const bar = qs('#rpprev');
    if (bar) {
      const wrap = document.createElement('div');
      wrap.innerHTML = imgPrevHTML('rpprev', box);
      const fresh = wrap.firstChild;
      if (fresh) bar.parentNode.replaceChild(fresh, bar); else bar.parentNode.removeChild(bar);
    }
    const rb = qs('[data-act="rpimg"]');
    if (rb) rb.innerHTML = '🖼️ 图片' + (box.length ? '<i class="tool-n">' + box.length + '</i>' : '');
  }

  /* 入队之后只重画预览条和工具按钮上的计数，不整页重绘 —— 否则草稿文字会丢焦点 */
  function repaintImgs(queueKey, prevId) {
    const box = S[queueKey] || [];
    const old = qs('#' + prevId);
    if (old) {
      const wrap = document.createElement('div');
      wrap.innerHTML = imgPrevHTML(prevId, box);
      const fresh = wrap.firstChild;
      if (fresh) old.parentNode.replaceChild(fresh, old); else old.parentNode.removeChild(old);
    } else if (box.length) {
      const ta = qs('#composer') || qs('#nt-body');
      if (ta && ta.parentNode) ta.insertAdjacentHTML('afterend', imgPrevHTML(prevId, box));
    }
    const btn = qs('[data-act="imgpick"]');
    if (btn && queueKey === 'pendingImages') {
      const n = box.length;
      btn.innerHTML = '🖼️ 图片' + (n ? '<i class="tool-n">' + n + '</i>' : '');
    }
  }

  function postHTML(p) {
    const u = userRow(p.user);
    const liked = S.liked.has(p.id);
    const faved = S.fav.has(p.id);
    const mine = S.comments[p.id] || [];
    const all = p.comments.concat(mine);
    const showAll = S.expand.has(p.id);
    const shown = showAll ? all : all.slice(0, 2);
    const imgs = p.images || [];
    const n = Math.min(imgs.length, 4);
    let imgHTML = '';
    if (n) {
      imgHTML = '<div class="imgs n' + n + '">' + imgs.slice(0, 4).map((im, idx) => {
        /* 真图（后端返回带 src）：直接铺满格子，loading=lazy 省流量；
           演示图（data.js 的 kind:shot/art）：保持原来的渐变色块示意。 */
        if (im.src) {
          return '<div class="ph real" data-act="lb" data-pid="' + p.id + '" data-idx="' + idx + '" ' +
            'style="background:' + (im.grad || '#e9eef5') + '">' +
            '<img src="' + esc(im.src) + '" alt="' + esc(p.text.slice(0, 30)) + '" loading="lazy" decoding="async">' +
            '</div>';
        }
        return '<div class="ph ' + (im.kind === 'art' ? 'art' : '') + '" style="background:' + im.grad + '" ' +
          'data-act="lb" data-pid="' + p.id + '" data-idx="' + idx + '">' +
          (im.kind === 'shot' ? '<div class="fakebar"><i></i><i></i><i></i><u></u></div><span class="glyph">🖥️</span>' : '') +
          '<span class="cap">' + esc(im.title || im.label || '') + (im.note ? '<small>' + esc(im.note) + '</small>' : '') + '</span></div>';
      }).join('') + '</div>';
    }
    /* 日志里挂的插件直接链到条目页：社群与条目库不再是两个孤岛 */
    const pv = p.plugin ? pluginByName(p.plugin) : null;
    const chip = p.plugin ? '<div class="plugin-chip"' + (pv ? ' data-act="pl" data-id="' + pv.id + '" style="cursor:pointer"' : '') + '>🧩 <b>' + esc(p.plugin) + '</b><em>' + esc(p.pluginVer) + '</em>' +
      '<span style="color:var(--link);margin-left:4px">' + (pv ? '查看条目 ›' : '查看插件 ›') + '</span></div>' : '';
    const cmts = shown.map(c => {
      const cu = userRow(c.user);
      return '<div class="cmt">' + av(c.user, 24) +
        '<div class="ctx"><span class="cnm" data-act="user" data-uid="' + c.user + '">' + esc(cu.name) + '</span>' +
        '：' + esc(c.text) + '</div><span class="ct">' + esc(c.time) + '</span>' +
        '<button class="clike" type="button" data-act="clike" data-cid="' + p.id + '|' + esc(c.user) + '|' + esc(c.text.slice(0, 8)) + '" aria-label="赞这条评论" aria-pressed="false">♡</button></div>';
    }).join('');
    const more = all.length > 2 ? '<button class="cmt-more" data-act="expand" data-pid="' + p.id + '">' +
      (showAll ? '收起评论' : '查看全部 ' + all.length + ' 条评论') + '</button>' : '';

    return '<article class="post" data-post="' + p.id + '">' +
      '<div class="post-hd"><div class="av-wrap">' + av(p.user, 44) + '</div>' +
      '<div class="poster"><div class="line1"><span class="nm" data-act="user" data-uid="' + p.user + '">' + esc(u.name) + '</span>' +
      userTags(u) + (p.pinned ? '<span class="pin">置顶</span>' : '') + '</div>' +
      '<div class="meta"><span>' + esc(p.time) + '</span><span>·</span><span>' + esc(u.city) + '</span>' +
      (p.plugin ? '<span>·</span><span>更新了 ' + esc(p.plugin) + '</span>' : '') + '</div></div>' +
      '<button class="post-more" type="button" data-act="more" data-pid="' + p.id + '" title="更多操作" aria-label="更多操作">⋯</button></div>' +
      '<div class="post-body">' + esc(p.text) + '</div>' + chip + imgHTML +
      '<div class="post-actions">' +
      '<button class="act ' + (liked ? 'liked' : '') + '" type="button" data-act="like" data-pid="' + p.id + '" aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="' + (liked ? '取消赞' : '赞这条日志') + '">' +
      '<span class="ic" aria-hidden="true">' + (liked ? '❤️' : '👍') + '</span><span class="num">' + fmt(p.likes + (liked && p.id !== 's2' ? 1 : 0)) + '</span></button>' +
      '<button class="act" type="button" data-act="focuscmt" data-pid="' + p.id + '" aria-label="写评论"><span class="ic" aria-hidden="true">💬</span><span class="num">' + all.length + '</span></button>' +
      '<button class="act" type="button" data-act="share" data-pid="' + p.id + '" aria-label="分享这条日志"><span class="ic" aria-hidden="true">↗</span><span class="num">' + fmt(p.shares) + '</span></button>' +
      '<button class="act ' + (faved ? 'faved' : '') + '" type="button" data-act="fav" data-pid="' + p.id + '" aria-pressed="' + (faved ? 'true' : 'false') + '" aria-label="' + (faved ? '取消收藏这条日志' : '收藏这条日志') + '"><span class="ic" aria-hidden="true">' + (faved ? '★' : '☆') + '</span><span>' + (faved ? '已收藏' : '收藏') + '</span></button>' +
      '</div>' +
      (all.length ? '<div class="comments">' + cmts + more + '</div>' : '') +
      '<div class="cbox" style="margin-top:9px;display:flex;gap:8px;align-items:center">' +
      '<input class="cin" data-pid="' + p.id + '" placeholder="写评论…" aria-label="写评论" style="flex:1;border:1px solid var(--line);background:var(--card-2);border-radius:16px;padding:6px 12px;font-size:12.5px;color:var(--txt)">' +
      '<button class="btn sm blue" data-act="sendcmt" data-pid="' + p.id + '">发送</button></div>' +
      '</article>';
  }

  /* ---------- 深海装饰层：气泡 / 暗流 / 光斑 / 海洋生物剪影（纯 CSS 动画，装饰性，aria-hidden） ---------- */
  function seaHTML() {
    const bubs = [8, 21, 34, 48, 61, 74, 88].map(function (left, i) {
      const size = 5 + (i % 3) * 4;
      const dur = 15 + (i % 4) * 5;
      return '<i class="bub" style="left:' + left + '%;width:' + size + 'px;height:' + size + 'px;' +
        'animation-duration:' + dur + 's;animation-delay:-' + (i * 3.5).toFixed(1) + 's"></i>';
    }).join('');
    return '<div class="sea-life" aria-hidden="true">' +
      '<span class="sl-glow"></span>' +
      '<span class="sl-ray r1"></span><span class="sl-ray r2"></span><span class="sl-ray r3"></span>' +
      '<span class="sl-flow f1"></span><span class="sl-flow f2"></span>' +
      bubs +
      '<span class="swim s2" style="top:22%;left:0">' + tail(52, 6.4) + '</span>' +
      '<span class="swim s3" style="top:63%;left:0">' + tail(34, 7.2) + '</span>' +
      '<span class="swim" style="top:44%;left:0;animation-duration:64s;animation-delay:-16s">' + tail(24, 8) + '</span>' +
      '</div>';
  }

  /* ---------- 左侧分类栏（仿微博网页左栏） ----------
     每个路由只留跟自己相关的那一组，其余不渲染：
       首页          → 社群分类（单维度：全部 + 十三个分类，各带帖子数，点了带分类进社群）
       社群列表      → 同一张社群分类卡（当前分类高亮，点了就地筛）
       帖子详情      → 不挂左栏（正文占满；详情页再放筛选只会把正文挤窄）
       插件库子树    → 插件分类（条目列表就在右边；详情 / 认领 / 上传同属这块）
       空间子树      → 不挂左栏（v36；头像、昵称、签名、关注/粉丝/访客都在头图与右栏资料卡里）
       发布插件      → 不挂左栏（表单页；四张卡全是入口 / 筛选，与顶栏和表单里的分类选择重复）

     首页为什么不再是「快捷入口 + 社群版块」：那两张卡都是纯导航，和顶栏、中栏
     完全重复，一点信息增量都没有（社群版块那四条还都跳同一批页面）。社群分类是
     日志流里唯一没被表达过的维度（分类 × 帖子数），彩色图标 + 计数就是 Linux.do
     左栏那种单维度分类表：一条维度、可就地筛、每行都带自己的量。
  */
  function railHTML() {
    const mk = S.route === 'market' || S.route === 'entry' || S.route === 'claim' || S.route === 'upload';
    const fm = S.route === 'forum';
    const th = S.route === 'thread';
    const ft = fm || th;
    const sp = S.route === 'space' || S.route === 'profile';
    const fd = S.route === 'feed';
    const ms = S.route === 'messages';
    const at = S.route === 'art' || S.route === 'artview';
    const pb = S.route === 'publish';
    const favN = favCount();

    /* 插件分类只有一份真源（data.js 的 pluginCats），这里只补一个「全部」入口；
       以前这里另写一份硬编码数组，改了 market 筛选就漏掉左栏。 */
    const CATS = ['全部'].concat(pluginCats);

    /* 每类有多少条：分类表从 5 类扩到 23 类之后，光看名字已经分不出哪类有东西，
       所以每行右侧也带自己的量（与社群那张分类卡同一个做法）。 */
    const catCount = {};
    plugins.forEach(function (p) { catCount[p.cat] = (catCount[p.cat] || 0) + 1; });

    /* total 只影响「全部」后面那个数字：不传就取插件条目数；
       counts 传了才给每一行配数字，不传还是老样子（只有「全部」带）。 */
    const dots = (arr, cur, act, key, total, counts) => arr.map(function (t) {
      const n = t === '全部' ? (total == null ? plugins.length : total) : (counts ? (counts[t] || 0) : null);
      return '<div class="rail-item rail-dot ' + (cur === t ? 'on' : '') + '" data-act="' + act + '" data-' + key + '="' + esc(t) + '">' +
        '<span class="tx">' + esc(t) + '</span>' + (n === null ? '' : '<span class="rail-n' + (n ? '' : ' zero') + '">' + n + '</span>') + '</div>';
    }).join('');

    /* 分类卡：23 类全铺开会把左栏撑得比视口还高（下面几张卡全被顶下去），所以给一个「收起」。
       收起时留前 8 行，当前选中的那类一并留着 —— 否则收起来之后左栏看不见自己选的是哪类，
       看着像没选中。长分类名（「WSL 与 Windows 互操作」）在 176px 的栏里会折成两行，见 .rail-dot .tx。 */
    const CAT_OPEN_N = 8;
    const mcatOpen = S.mcatOpen !== false;
    const catList = mcatOpen ? CATS
      : (mk && S.cat !== '全部' && CATS.indexOf(S.cat) > CAT_OPEN_N
        ? CATS.slice(0, CAT_OPEN_N).concat([S.cat]) : CATS.slice(0, CAT_OPEN_N + 1));
    const catCard = '<div class="rail-card"><div class="rail-hd">插件分类<span class="rail-hd-n">' + pluginCats.length + ' 类</span></div>' +
      '<div class="rail-list">' + dots(catList, mk ? S.cat : '', 'railcat', 'cat', null, catCount) + '</div>' +
      '<div class="rail-item rail-more" data-act="railmore" title="' + (mcatOpen ? '收起分类' : '展开全部分类') + '">' +
      '<span class="tx">' + (mcatOpen ? '收起分类' : '展开全部 ' + pluginCats.length + ' 类') + '</span>' +
      '<span class="cv">' + (mcatOpen ? '⌃' : '⌄') + '</span></div></div>';
    /* v36：空间子树不再挂左栏名片（.rail-user）。头图 .prof-cover 里已经有头像、昵称、
       胸章、签名和「粉丝 / 关注 / 访客」三项统计，右栏 sideCard 又有「个人资料」卡（含等级、
       城市、生日、擅长），左边那张名片把同一批数字再说第三遍；别人的空间连「+ 关注」都在
       标签条右侧重了一份。撤掉它，主列从 890px 回到 966px（.wrap.no-rail）。
       spaceCard / .rail-user 这套样式保留在 CSS 里，页面已不再引用。 */
    const myCard = '<div class="rail-card"><div class="rail-hd">我的</div>' +
      '<div class="rail-item rail-dot ' + ((S.route === 'space' || S.route === 'profile') ? 'on' : '') + '" data-act="go" data-route="space"><span class="tx">我的空间</span></div>' +
      '<div class="rail-item rail-dot ' + (S.route === 'favs' ? 'on' : '') + '" data-act="go" data-route="favs"><span class="tx">我的收藏</span>' +
        '<span class="rail-n' + (favN ? '' : ' zero') + '">' + favN + '</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '全部' ? 'on' : '') + '" data-act="railtab" data-tab="全部"><span class="tx">全部日志</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '关注' ? 'on' : '') + '" data-act="railtab" data-tab="关注"><span class="tx">我关注的</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '插件' ? 'on' : '') + '" data-act="railtab" data-tab="插件"><span class="tx">插件更新</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '问答' ? 'on' : '') + '" data-act="railtab" data-tab="问答"><span class="tx">求助问答</span></div>' +
      '</div>';
    const quickCard = '<div class="rail-card">' +
      '<div class="rail-item ' + (mk ? 'on' : '') + '" data-act="go" data-route="market">' +
        '<span class="ic" style="background:linear-gradient(135deg,#7fc9ff,#2f86d8)">🛒</span>' +
        '<span class="tx">插件条目库</span><span class="rail-n">' + plugins.length + '</span></div>' +
      '<div class="rail-item ' + (mk && S.sort === '安装' ? 'on' : '') + '" data-act="railsort" data-sort="安装">' +
        '<span class="ic" style="background:linear-gradient(135deg,#ffc46b,#ee7f1a)">🏆</span>' +
        '<span class="tx">安装榜</span><span class="rail-n">TOP 5</span></div>' +
      '<div class="rail-item ' + (ft ? 'on' : '') + '" data-act="go" data-route="forum">' +
        '<span class="ic" style="background:linear-gradient(135deg,#ffa2a6,#e04a68)">🔥</span>' +
        '<span class="tx">社群热帖</span><span class="rail-n">' + threadCountOf('全部') + '</span></div>' +
      '<div class="rail-item ' + (S.route === 'publish' ? 'on' : '') + '" data-act="go" data-route="publish">' +
        '<span class="ic" style="background:linear-gradient(135deg,#6ee7b7,#0f9b6c)">🚀</span>' +
        '<span class="tx">发布插件</span></div>' +
      '</div>';
    /* 消息中心左栏：B 站那种「按类分组 + 每类带未读数」。
       这里同时是页签的唯一来源 —— 弹层里的页签与整页左栏读的是同一份 noticeKinds，
       两边切到哪一类都记在 S.noticeKind 上，来回跳不会「弹层里选私信、整页回到全部」。 */
    const noticeRailCard = '<div class="rail-card"><div class="rail-hd">消息分类</div>' +
      noticeKinds.map(function (k) {
        const n = noticeUnreadCount(k.id);
        const on = (S.noticeKind || 'all') === k.id;
        return '<div class="rail-item rail-dot ' + (on ? 'on' : '') + '" data-act="noticetab" data-kind="' + k.id + '">' +
          '<span class="ic" style="background:linear-gradient(135deg,#a8c6e6,#5f87b3)">' + k.icon + '</span>' +
          '<span class="tx">' + esc(k.name) + '</span>' +
          (n ? '<span class="rail-n nt-n">' + n + '</span>' : '') + '</div>';
      }).join('') +
      '<div class="rail-item rail-dot" data-act="readall"><span class="ic" style="background:linear-gradient(135deg,#cfe0ef,#8ba7c0)">✓</span>' +
      '<span class="tx">全部已读</span></div></div>';
    const boardCard = '<div class="rail-card"><div class="rail-hd">社群版块</div>' +
      boards.map(b => '<div class="rail-item rail-dot" data-act="board" data-b="' + esc(b.name) + '">' +
        '<span class="ic" style="background:linear-gradient(135deg,#c9b8ff,#7c6cf0)">' + b.icon + '</span>' +
        '<span class="tx">' + esc(b.name) + '</span></div>').join('') + '</div>';

    /* 首页左栏也用同一张社群分类卡（见 fcatCardHTML）：首页日志流不按分类
       过滤，所以不传 active，谁都不高亮。 */
    const feedCats = fcatCardHTML('');

    let cards;
    if (at) cards = artRailCards();
    else if (mk) cards = catCard;
    else if (ms) cards = noticeRailCard;
    /* 社群列表页挂上首页那张社群分类卡，当前分类跟着 S.scat 高亮；
       帖子详情仍不挂左栏 —— 正文页多一列筛选只会把正文挤窄。 */
    /* 社群列表页挂上首页那张社群分类卡（当前分类跟着 S.scat 高亮），下面紧跟热门标签卡
       —— 两张都是筛选入口，中栏那条标签横排已撤。帖子详情仍不挂左栏：正文页多一列筛选
       只会把正文挤窄。 */
    else if (fm) cards = fcatCardHTML(S.scat) + ftagCardHTML(S.ftag);
    else if (th) cards = '';
    /* 发布插件是纯表单页：原来这里挂「插件条目库 / 我的 / 插件分类 / 社群版块」四张卡，
       但它们全是导航与筛选，顶栏和表单里的分类选择已经把同一件事说过一遍；
       左栏还白占 176px，把包名、简介这些主字段挤在右边。整根 aside 不渲染，表单吃满整行。 */
    else if (pb) cards = '';
    /* 我的收藏页同样不挂左栏（v35）：quickCard + myCard + catCard + boardCard 这四张全是导航与
       筛选，主列却被挤掉 176px，而这一页的筛选只有顶部那排页签。favPage() 已经不调 railHTML()，
       这里再兜一层：以后谁给 favs 加回 railHTML() 也不会重新长出四张卡。 */
    else if (S.route === 'favs') cards = '';
    /* v36：空间页整根 aside 不渲染 —— 左栏那张名片与头图、右栏「个人资料」卡说的是同一件事。
       注意 sp 同时覆盖 profile（我的资料）：那一页是纯表单，左栏「我的」卡是唯一的跨区入口，
       所以这里只认 route === 'space'，不能写成 else if (sp)。 */
    else if (S.route === 'space') cards = '';
    else if (sp) cards = myCard;
    else if (fd) cards = feedCats;
    else cards = quickCard + myCard + catCard + boardCard;

    /* 没有卡片就整根 aside 都不输出：留一个空 .col-rail 会白占一列网格 */
    if (!cards) return '';
    return '<aside class="col-rail">' + cards + '</aside>';
  }

  /* 社群分类卡：首页与社群列表页共用同一份 markup、同一套 .rail-* 样式 ——
     单维度（Linux.do 那种），全部 + 十三个分类，每行都带自己的帖子数。
     分类表在 data.js 的 categories，这里只负责配色与计数，别在这写死分类名。
     点一条走 data-act="fcat"：在社群页就地筛，在首页带着这个分类跳进社群；
     数量与社群页左栏同一份数据（都数 threads），两处看到的数字永远一致；社群页
     不再单独渲染一排分类胶囊，分类切换只有这一个入口。
     active 只由社群列表页传入（S.scat）—— 首页日志流不按分类过滤，给首页
     高亮任何一条都会让人以为日志被筛过。 */
  function fcatCardHTML(active) {
    /* 十四色一套，色相错开：蓝 / 靛 / 青绿 / 青蓝 / 橘 / 黄 / 珊瑚 / 草绿 / 湖蓝 /
       玫粉 / 中蓝 / 棕 / 兰紫 / 紫灰。新增分类时唯一要做的事就是在这里补一行 —— 漏了会
       回落到灰色底（下面的 G[c.id] || 兜底），不报错但一眼能看出没配。 */
    const G = {
      notice: ['#7fc9ff', '#2f86d8'],
      dev: ['#c9b8ff', '#7c6cf0'],
      tool: ['#8fe3c0', '#0f9b6c'],
      ai: ['#7dd3fc', '#4f46e5'],
      cn: ['#ffb27f', '#e2662a'],
      guide: ['#ffd27f', '#ee9b1a'],
      help: ['#ffa2a6', '#e04a68'],
      res: ['#cbe98f', '#6a9b12'],
      pan: ['#a3e0f0', '#1f93b0'],
      deal: ['#ffc2d4', '#e05a85'],
      news: ['#9fc4ff', '#3a63c8'],
      memory: ['#d8b48f', '#8a5a2a'],
      chat: ['#e0b8ff', '#8b3fd0'],
      ops: ['#b8c0d8', '#5a6390']
    };
    const rows = [{ id: '全部', name: '全部', icon: '📋', g: ['#b9cde0', '#7f93a6'] }]
      .concat(D.categories.map(function (c) {
        return { id: c.id, name: c.name, icon: c.icon, g: G[c.id] || ['#b9cde0', '#7f93a6'] };
      }));
    return '<div class="rail-card"><div class="rail-hd">社群分类</div>' + rows.map(function (r) {
      const n = threadCountOf(r.id);
      return '<div class="rail-item' + (active === r.id ? ' on' : '') + '" data-act="fcat" data-cat="' + esc(r.id) + '">' +
        '<span class="ic" style="background:linear-gradient(135deg,' + r.g[0] + ',' + r.g[1] + ')">' + r.icon + '</span>' +
        '<span class="tx">' + esc(r.name) + '</span><span class="rail-n">' + n + '</span></div>';
    }).join('') + '</div>';
  }

  /* 热门标签卡：原本是中栏 forum-bar 下面那条横排（.tagbar），现在整块搬进左栏、
     紧跟在「社群分类」卡下面 —— 与分类同一套道理，一个筛选控件只留一个入口。
     左栏只有 176px，十个标签靠 flex-wrap 排成两三行；≤1240px 左栏整体变成横条，
     那时用 display:contents 让标签直接参与横排（见 css 的 .rail-card 横排规则），
     否则一个 flex 卡片会把十个标签挤成一条看不完的长条。 */
  function ftagCardHTML(active) {
    return '<div class="rail-card rail-tags"><div class="rail-hd">热门标签<span class="rail-hd-n">' + TAGCLOUD.length + ' 个</span></div>' +
      '<div class="rail-chips">' + TAGCLOUD.map(function (g) {
        return '<span class="tag-plain click' + (active === g ? ' on' : '') + '" data-act="ftag" data-tag="' + esc(g) +
          '" title="只看 #' + esc(g) + ' 的话题">#' + esc(g) + '</span>';
      }).join('') + '</div>' +
      /* v24 · 全量标签目录的入口。这张卡只放十个高频词（快捷入口），找冷门标签要去标签页。
         这颗链接不能写成 .tag-plain —— 那个类名代表「一个标签」，左栏热区与回归测试都按它数数。 */
      '<div class="rail-all"><a data-act="go" data-route="tags" title="全部标签 · 分组浏览与多选组合">全部标签 ›</a></div>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════════
     v22 · 鲸鲸空间（鲸鱼娘二创作品墙）

     一条硬规矩：原作（art）与发布者（by）永远分两块显示。
     二创的常态是「A 画的，B 搬来的」，把两者并成一句署名，等于把搬运工
     写成作者 —— 出处不可追溯，下架也无从谈起。所以：

       卡片    媒体 → 标题 → 出处展签（原作 + 授权印章） → 发布者行
       详情    媒体 → 正文 → 展签双栏（原作 | 发布）→ 授权凭据原样展示

     授权四档（ART_PERM）：本人发布 / 已获授权 / 允许转载 / 仅索引。
     最要紧的是 index：没拿到授权就只挂作者、平台、原帖链接，不存图 ——
     墙上有两件是这种，故意留着，让「标不清楚就别传」这条规则看得见。

     发布走纯本地（同社群发帖 ntsubmit 的路子）：服务端发布链路要 cookie
     会话，而当前登录只写 localStorage，接上去会 401。本地发布带一条
     media 字段（dataURL），存档体积按 4/3 膨胀，所以图片硬限 1.2MB。
     ══════════════════════════════════════════════════════════════ */

  /* 深海配色：六套，按作品 id 稳定取色，同一件作品每次渲染都是同一个颜色 */
  const ART_SEA = [
    { sky: '#0b2740', sea: '#123c5c', deep: '#08182a', ink: '#8ed6ff', glow: '#cdefff' },
    { sky: '#241d3b', sea: '#3a2b57', deep: '#131024', ink: '#c9a7ff', glow: '#f0d9ff' },
    { sky: '#0d3032', sea: '#15514f', deep: '#06201f', ink: '#8ff0d8', glow: '#d6fff4' },
    { sky: '#2a1626', sea: '#4a2438', deep: '#180b14', ink: '#ffb3cf', glow: '#ffe0ec' },
    { sky: '#122a1f', sea: '#1d4433', deep: '#08170f', ink: '#a8e6a1', glow: '#e3ffd9' },
    { sky: '#0a2033', sea: '#123a52', deep: '#05121c', ink: '#9fd8f2', glow: '#eaf9ff' }
  ];

  /* 授权档位：t 是卡片上的印章字，full 是详情页的说法，tip 用在 title 里 */
  const ART_PERM = {
    own: { t: '本人发布', full: '作者本人发布', tip: '发布者就是原作者' },
    ok: { t: '已获授权', full: '已获作者授权', tip: '作者书面或私信同意转载' },
    open: { t: '允许转载', full: '作者公开允许转载', tip: '作者在原帖写明可转载，需保留署名' },
    index: { t: '仅索引', full: '未获授权 · 仅索引', tip: '没有授权，本站不存图，只记出处与原帖链接' }
  };
  const ART_LOCAL_MAX = 1.2 * 1024 * 1024;

  function artSeedIndex(a) {
    const s = String((a && a.id) || 'x');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
    return h % ART_SEA.length;
  }

  /* 用一条 SVG 画出「一件作品」的缩略：海平线 + 月亮 + 光柱 + 鲸尾 + 气泡。
     不引外部图片，是因为演示站没有真实作品；画一条能看出鲸鱼娘的构图，
     比放一张灰色占位图更像作品墙。同一套配色按 id 稳定散开，不随机。 */
  function artScene(a) {
    const i = artSeedIndex(a);
    const pal = ART_SEA[i];
    const gid = 'aug' + String((a && a.id) || 'x').replace(/[^a-z0-9]/gi, '');
    const kind = (a && a.kind) || '插画';
    const moonX = 68 + (i * 63) % 250;
    const moonY = 52 + (i * 19) % 44;
    const tilt = -16 + (i * 9) % 32;
    const sc = kind === '表情包' ? 3.3 : kind === '动图' || kind === '手书' ? 2.9 : 2.4;
    const tx = 178 + (i % 3) * 30 - (kind === '表情包' ? 30 : 0);
    let bub = '';
    for (let b = 0; b < 7; b++) {
      const cx = 24 + ((i * 29 + b * 53) % 344);
      const cy = 92 + ((i * 41 + b * 37) % 176);
      bub += '<circle class="au-bub" cx="' + cx + '" cy="' + cy + '" r="' + (1.8 + (b % 3)) + '" fill="' + pal.glow +
        '" opacity=".42" style="animation-delay:' + (b * 0.7).toFixed(1) + 's"/>';
    }
    const waves = [196, 226, 258].map(function (y, n) {
      return '<path d="M0 ' + y + ' Q 42 ' + (y - 10 - n * 4) + ' 84 ' + y + ' T 168 ' + y + ' T 252 ' + y +
        ' T 336 ' + y + ' T 420 ' + y + ' V300 H0Z" fill="' + (n === 0 ? pal.sea : pal.deep) +
        '" opacity="' + (0.52 + n * 0.15).toFixed(2) + '"/>';
    }).join('');
    const rays = (kind === '动图' || kind === '手书')
      ? '<g opacity=".18"><path d="M122 0 L96 300 L152 300 Z" fill="' + pal.glow + '"/>' +
        '<path d="M244 0 L216 300 L266 300 Z" fill="' + pal.glow + '"/></g>' : '';
    const panel = kind === '短漫'
      ? '<g stroke="' + pal.ink + '" stroke-width="1" opacity=".2"><line x1="200" y1="0" x2="200" y2="300"/>' +
        '<line x1="0" y1="150" x2="400" y2="150"/></g>' : '';
    return '<svg class="au-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + pal.sky + '"/><stop offset="1" stop-color="' + pal.deep + '"/></linearGradient></defs>' +
      '<rect width="400" height="300" fill="url(#' + gid + ')"/>' +
      '<circle cx="' + moonX + '" cy="' + moonY + '" r="' + (15 + (i % 3) * 5) + '" fill="' + pal.glow + '" opacity=".14"/>' +
      '<circle cx="' + moonX + '" cy="' + moonY + '" r="7.5" fill="' + pal.glow + '" opacity=".55"/>' +
      rays + waves +
      '<g transform="translate(' + tx + ' 166) rotate(' + tilt + ') scale(' + sc + ') translate(-32 -32)" fill="none" stroke="' +
      pal.ink + '" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" opacity=".95"><path d="' + TAIL_D + '"/></g>' +
      bub + panel + '</svg>';
  }

  /* ================= v24 · 3D 模型：解析 · 归一 · 软件渲染 =================
     .obj / .stl 在浏览器里真解析；.blend / .fbx / .glb 这些二进制格式不做假解析 ——
     按文件指纹生成一个可辨认的示意低模，并在界面角标上写清楚「示意网格」。
     所有网格归一到 [-1,1] 的盒子里，渲染是画家算法 + 平光，不引任何第三方库。 */
  const MODEL_TYPES = { obj: 'OBJ', stl: 'STL', ply: 'PLY', blend: 'Blender', fbx: 'FBX', glb: 'glTF', gltf: 'glTF', dae: 'DAE', '3ds': '3DS' };
  const MODEL_MAX = 24 * 1024 * 1024;
  const MODEL_TEXT_MAX = 6 * 1024 * 1024;
  const MODEL_FACE_CAP = 2000;
  const MODEL_NOTE = '这个格式浏览器不解析：按文件指纹生成了一个示意低模，看真实外观请用 Blender / 对应软件打开原文件。';
  const meshCache = {};

  function modelExtOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }
  function modelFmtOf(ext) { return MODEL_TYPES[ext] || (ext ? ext.toUpperCase() : '模型'); }
  function fmtBytes(n) {
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function cmtTime(t) {
    const d = Date.now() - (t || 0);
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return Math.floor(d / 86400000) + ' 天前';
  }

  /* 归一：取包围盒中心与最长边，所有坐标压进 [-1,1]；顺手丢掉越界面 */
  function normalizeMesh(rawVs, rawFs) {
    if (!rawVs || !rawFs || !rawVs.length || !rawFs.length) return null;
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    rawVs.forEach(function (v) {
      if (v[0] < minx) minx = v[0]; if (v[0] > maxx) maxx = v[0];
      if (v[1] < miny) miny = v[1]; if (v[1] > maxy) maxy = v[1];
      if (v[2] < minz) minz = v[2]; if (v[2] > maxz) maxz = v[2];
    });
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
    const sx = maxx - minx, sy = maxy - miny, sz = maxz - minz;
    const sc = Math.max(sx, sy, sz) || 1;
    const vs = rawVs.map(function (v) {
      return [(v[0] - cx) / sc * 2, (v[1] - cy) / sc * 2, (v[2] - cz) / sc * 2];
    });
    const fs = [];
    for (let i = 0; i < rawFs.length && fs.length < MODEL_FACE_CAP; i++) {
      const f = rawFs[i];
      if (!f || f[0] < 0 || f[1] < 0 || f[2] < 0) continue;
      if (f[0] >= vs.length || f[1] >= vs.length || f[2] >= vs.length) continue;
      fs.push([f[0], f[1], f[2]]);
    }
    if (!fs.length) return null;
    return { vs: vs, fs: fs, box: [+sx.toFixed(3), +sy.toFixed(3), +sz.toFixed(3)] };
  }

  /* OBJ：只认 v 与 f（多边形按扇形三角化），负索引按「从末尾数」解释 */
  function parseOBJ(text) {
    const vs = [], fs = [];
    const lines = String(text || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (fs.length >= MODEL_FACE_CAP) break;
      const ln = lines[i];
      if (!ln) continue;
      if (ln[0] === 'v' && ln[1] === ' ') {
        const p = ln.trim().split(/\s+/);
        const x = +p[1], y = +p[2], z = +p[3];
        if (isFinite(x) && isFinite(y) && isFinite(z)) vs.push([x, y, z]);
      } else if (ln[0] === 'f' && ln[1] === ' ') {
        const parts = ln.trim().split(/\s+/).slice(1);
        const idx = [];
        for (let k = 0; k < parts.length; k++) {
          const num = parseInt(parts[k].split('/')[0], 10);
          if (!num) continue;
          idx.push(num > 0 ? num - 1 : vs.length + num);
        }
        for (let k = 2; k < idx.length; k++) {
          fs.push([idx[0], idx[k - 1], idx[k]]);
          if (fs.length >= MODEL_FACE_CAP) break;
        }
      }
    }
    return normalizeMesh(vs, fs);
  }

  /* STL：二进制（80 字节头 + uint32 面数 + 50 字节/面）与 ASCII 都认 */
  function parseSTL(buf) {
    const vs = [], fs = [], seen = Object.create(null);
    function add(x, y, z) {
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
      if (seen[k] != null) return seen[k];
      const id = vs.length; seen[k] = id; vs.push([x, y, z]); return id;
    }
    if (buf && buf.byteLength >= 84) {
      const dv = new DataView(buf);
      const n = dv.getUint32(80, true);
      if (n > 0 && 84 + n * 50 <= buf.byteLength && n < 300000) {
        let off = 84;
        for (let i = 0; i < n && fs.length < MODEL_FACE_CAP; i++) {
          const a = add(dv.getFloat32(off + 12, true), dv.getFloat32(off + 16, true), dv.getFloat32(off + 20, true));
          const b = add(dv.getFloat32(off + 24, true), dv.getFloat32(off + 28, true), dv.getFloat32(off + 32, true));
          const c = add(dv.getFloat32(off + 36, true), dv.getFloat32(off + 40, true), dv.getFloat32(off + 44, true));
          if (a !== b && b !== c && a !== c) fs.push([a, b, c]);
          off += 50;
        }
        return normalizeMesh(vs, fs);
      }
    }
    const txt = new TextDecoder().decode(buf);
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    let m, cur = [];
    while ((m = re.exec(txt)) && fs.length < MODEL_FACE_CAP) {
      cur.push(add(+m[1], +m[2], +m[3]));
      if (cur.length === 3) { fs.push(cur); cur = []; }
    }
    return normalizeMesh(vs, fs);
  }

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    const t = String(s || '');
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rngOf(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* 示意低模：一条带尾鳍的鲸形椭球。形状由文件指纹决定，同一个文件每次长得一样 */
  function procMesh(seed) {
    const key = 'p' + seed;
    if (meshCache[key]) return meshCache[key];
    const rnd = rngOf(seed);
    const vs = [], fs = [];
    const LAT = 9, LON = 16;
    for (let i = 0; i <= LAT; i++) {
      const phi = (i / LAT) * Math.PI;
      for (let j = 0; j < LON; j++) {
        const th = (j / LON) * Math.PI * 2;
        const r = 1 + (rnd() - 0.5) * 0.14;
        const x = Math.sin(phi) * Math.cos(th) * 0.92 * r;
        const y = Math.cos(phi) * 1.18 * r;
        const z = Math.sin(phi) * Math.sin(th) * 0.8 * r;
        vs.push([x, y, z + 0.06 * Math.cos(phi)]);
      }
    }
    function id(i, j) { return i * LON + (j % LON); }
    for (let i = 0; i < LAT; i++) {
      for (let j = 0; j < LON; j++) {
        const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
        if (i > 0) fs.push([a, b, c]);
        if (i < LAT - 1) fs.push([a, c, d]);
      }
    }
    const base = vs.length;
    vs.push([-0.05, 0.16, 0.86], [0.46, 0.5, 1.42], [-0.5, 0.56, 1.36]);
    fs.push([base, base + 1, base + 2]);
    vs.push([-0.05, -0.04, 0.86], [0.4, -0.34, 1.38], [-0.5, -0.42, 1.3]);
    fs.push([base + 3, base + 4, base + 5]);
    const m = normalizeMesh(vs, fs);
    meshCache[key] = m;
    return m;
  }

  function packMesh(m) {
    const v = new Array(m.vs.length * 3);
    for (let i = 0; i < m.vs.length; i++) {
      v[i * 3] = Math.max(0, Math.min(255, Math.round((m.vs[i][0] + 1) * 127.5)));
      v[i * 3 + 1] = Math.max(0, Math.min(255, Math.round((m.vs[i][1] + 1) * 127.5)));
      v[i * 3 + 2] = Math.max(0, Math.min(255, Math.round((m.vs[i][2] + 1) * 127.5)));
    }
    const f = [];
    m.fs.forEach(function (t) { f.push(t[0], t[1], t[2]); });
    return { v: v, f: f, box: m.box };
  }
  function unpackMesh(p) {
    if (!p || !p.v || !p.f || !p.v.length) return null;
    const vs = [];
    for (let i = 0; i < p.v.length; i += 3) {
      vs.push([p.v[i] / 127.5 - 1, p.v[i + 1] / 127.5 - 1, p.v[i + 2] / 127.5 - 1]);
    }
    const fs = [];
    for (let i = 0; i < p.f.length; i += 3) fs.push([p.f[i], p.f[i + 1], p.f[i + 2]]);
    return { vs: vs, fs: fs, box: p.box || [1, 1, 1] };
  }
  function meshOfModel(model) {
    if (!model) return null;
    if (model.kind === 'mesh' && model.mesh) {
      const key = 'q' + (model.name || '') + '|' + (model.size || 0) + '|' + (model.tris || 0);
      if (!meshCache[key]) meshCache[key] = unpackMesh(model.mesh);
      if (meshCache[key]) return meshCache[key];
    }
    return procMesh(model.seed || hashStr(model.name || 'whale'));
  }

  /* 画家算法 + 平光。一帧大约 1–3ms（2000 面以内），卡片一次、详情页按 30fps 转 */
  function drawMesh(cv, mesh, yaw, pitch, opt) {
    if (!cv || !mesh) return;
    opt = opt || {};
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(60, cv.clientWidth || 320);
    const ch = Math.max(48, cv.clientHeight || 240);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    if (!c) return;
    const night = document.documentElement.getAttribute('data-theme') === 'night';
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, night ? '#0b1c2c' : '#0f2f4a');
    bg.addColorStop(1, night ? '#040a10' : '#06121b');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const floorY = H * 0.82;
    c.strokeStyle = night ? 'rgba(120,180,220,.10)' : 'rgba(160,210,245,.14)';
    c.lineWidth = Math.max(1, dpr * 0.7);
    for (let i = -5; i <= 5; i++) {
      const y = floorY + i * H * 0.045;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    const rad = c.createRadialGradient(W / 2, floorY, 0, W / 2, floorY, W * 0.34);
    rad.addColorStop(0, 'rgba(6,16,26,.5)');
    rad.addColorStop(1, 'rgba(6,16,26,0)');
    c.fillStyle = rad;
    c.beginPath(); c.ellipse(W / 2, floorY + H * 0.02, W * 0.3, H * 0.075, 0, 0, Math.PI * 2); c.fill();

    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const scale = Math.min(W, H) * 0.33;
    const ox = W / 2, oy = H * 0.5;
    const n = mesh.vs.length;
    const sx = new Float32Array(n), sy2 = new Float32Array(n), sz = new Float32Array(n);
    const rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = mesh.vs[i];
      const x1 = v[0] * cy + v[2] * sy;
      const z1 = -v[0] * sy + v[2] * cy;
      const y1 = v[1] * cp - z1 * sp;
      const z2 = v[1] * sp + z1 * cp;
      rx[i] = x1; ry[i] = y1; rz[i] = z2;
      const persp = 3.6 / (3.6 + z2);
      sx[i] = ox + x1 * scale * persp;
      sy2[i] = oy - y1 * scale * persp;
      sz[i] = z2;
    }
    const fs = mesh.fs;
    const depth = new Float32Array(fs.length);
    const order = new Array(fs.length);
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      depth[i] = (sz[f[0]] + sz[f[1]] + sz[f[2]]) / 3;
      order[i] = i;
    }
    order.sort(function (a, b) { return depth[b] - depth[a]; });
    const lx = -0.42, ly = 0.62, lz = 0.66;
    const base = opt.tint || [104, 184, 236];
    for (let k = 0; k < order.length; k++) {
      const f = fs[order[k]];
      const ax = sx[f[0]], ay = sy2[f[0]];
      const bx = sx[f[1]], by = sy2[f[1]];
      const cx2 = sx[f[2]], cy2 = sy2[f[2]];
      const area = (bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay);
      if (!isFinite(area) || Math.abs(area) < 0.35) continue;
      const ux = rx[f[1]] - rx[f[0]], uy = ry[f[1]] - ry[f[0]], uz = rz[f[1]] - rz[f[0]];
      const vx = rx[f[2]] - rx[f[0]], vy = ry[f[2]] - ry[f[0]], vz = rz[f[2]] - rz[f[0]];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const dot = Math.abs((nx / nl) * lx + (ny / nl) * ly + (nz / nl) * lz);
      const shade = 0.36 + 0.64 * dot;
      c.fillStyle = 'rgb(' + Math.round(base[0] * shade + 8 * (1 - shade)) + ',' +
        Math.round(base[1] * shade + 10 * (1 - shade)) + ',' + Math.round(base[2] * shade + 18 * (1 - shade)) + ')';
      c.beginPath();
      c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx2, cy2); c.closePath();
      c.fill();
      if (opt.wire !== false) {
        c.strokeStyle = 'rgba(196,232,255,.18)';
        c.lineWidth = Math.max(0.5, dpr * 0.55);
        c.stroke();
      }
    }
  }

  /* 卡片只画一帧（进入视口才画）；详情页才开 rAF 转，离开页面就停 */
  let meshYaw = 0.62, meshPitch = -0.24, meshSpin = true, meshRAF = 0, meshIo = null;
  function stopMeshLoop() {
    if (meshRAF) cancelAnimationFrame(meshRAF);
    meshRAF = 0;
    if (meshIo) { meshIo.disconnect(); meshIo = null; }
  }
  function syncSpinBtn() {
    const b = qs('#ad-spin');
    if (b) b.textContent = meshSpin ? '暂停旋转' : '继续旋转';
  }
  function paintCardMesh(cv) {
    const a = artOf(cv.dataset.mid);
    if (!a || !a.model) return;
    drawMesh(cv, meshOfModel(a.model), 0.62, -0.24, {});
  }
  function hydrateMeshes() {
    stopMeshLoop();
    const cards = document.querySelectorAll('canvas.au-mesh[data-card]');
    if (cards.length) {
      if (!('IntersectionObserver' in window)) {
        for (let i = 0; i < cards.length; i++) paintCardMesh(cards[i]);
      } else {
        meshIo = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) {
            if (!en.isIntersecting) return;
            paintCardMesh(en.target);
            meshIo.unobserve(en.target);
          });
        }, { rootMargin: '160px' });
        for (let i = 0; i < cards.length; i++) meshIo.observe(cards[i]);
      }
    }
    const draft = qs('canvas.au-mesh[data-draft]');
    if (draft) {
      const dm = S.artDraft && S.artDraft.model;
      if (dm) drawMesh(draft, meshOfModel(dm), 0.62, -0.24, {});
    }
    const big = qs('#ad-canvas');
    if (big) hydrateDetail(big);
  }
  function hydrateDetail(cv) {
    const a = artOf(cv.dataset.mid);
    if (!a || !a.model) return;
    const mesh = meshOfModel(a.model);
    if (!mesh) return;
    drawMesh(cv, mesh, meshYaw, meshPitch, {});
    let last = 0;
    const tick = function (t) {
      if (qs('#ad-canvas') !== cv) { meshRAF = 0; return; }
      if (meshSpin && !document.hidden && t - last > 32) {
        last = t;
        meshYaw += 0.011;
        drawMesh(cv, mesh, meshYaw, meshPitch, {});
      }
      meshRAF = requestAnimationFrame(tick);
    };
    meshRAF = requestAnimationFrame(tick);
    let drag = null;
    cv.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY };
      meshSpin = false;
      syncSpinBtn();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      meshYaw += (e.clientX - drag.x) * 0.012;
      meshPitch = Math.max(-1.15, Math.min(1.15, meshPitch + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY };
      drawMesh(cv, mesh, meshYaw, meshPitch, {});
    });
    cv.addEventListener('pointerup', function () { drag = null; });
    cv.addEventListener('pointercancel', function () { drag = null; });
  }


  /* 作品的可视部分：本地发布的真图 / 演示数据的 SVG / 仅有索引时的占位 */
  function artMediaHTML(a, mode) {
    if (a.perm === 'index') {
      return '<div class="au-media is-index' + (mode === 'view' ? ' big' : '') + '">' +
        '<div class="ix-in"><span class="ix-mark">仅索引</span>' +
        '<p>未获授权，本站不存这张图</p>' +
        '<span class="ix-go">去 ' + esc((a.art && a.art.platform) || '原平台') + ' 看原作 ›</span></div></div>';
    }
    if (a.model) {
      return '<div class="au-3d' + (mode === 'view' ? ' big' : '') + '">' +
        '<canvas class="au-mesh" data-card="1" data-mid="' + esc(a.id) + '" role="img" aria-label="' +
        esc(a.title) + ' 的 3D 模型预览（' + esc(a.model.fmt) + '）"></canvas>' +
        '<span class="au-badge3d">3D · ' + esc(a.model.fmt) + '</span></div>';
    }
    if (a.media) {
      return '<img class="au-img' + (mode === 'view' ? ' big' : '') + '" src="' + esc(a.media) + '" alt="' +
        esc(a.title) + '（发布者 ' + esc((users[a.by] && profileOf(a.by).nick) || a.by) + ' 上传）" decoding="async" loading="lazy">';
    }
    return artScene(a);
  }

  function artsOf() { return (S.arts || []).concat(artsRaw); }
  function artOf(id) {
    const list = artsOf();
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function artPermOf(a) { return ART_PERM[a.perm] || ART_PERM.ok; }
  /* 原作者是不是就是发布者：perm=own，或者原作直接挂在发布者自己的账号上 */
  function artIsOwn(a) { return a.perm === 'own' || !!(a.art && a.art.uid && a.art.uid === a.by); }
  function artNick(uid) { return (users[uid] && profileOf(uid).nick) || uid || '—'; }
  function artKindCount(k) {
    return artsOf().filter(function (a) { return k === '全部' || a.kind === k; }).length;
  }
  function artPermCount() {
    const all = artsOf();
    const marked = all.filter(function (a) { return a.perm !== 'index'; }).length;
    return { total: all.length, marked: marked, pct: all.length ? Math.round(marked / all.length * 100) : 0 };
  }

  /* 印章：卡片与详情页共用。斜一点、描边字，像盖在展签上的那种 */
  function artStamp(a, tiny) {
    const p = artPermOf(a);
    return '<span class="au-stamp ' + a.perm + (tiny ? ' tiny' : '') + '" title="' + esc(p.tip) + '">' + esc(p.t) + '</span>';
  }

  /* 出处展签：卡片的第二块（第一块是媒体，第三块是发布者）。
     原作名走衬线，和正文的界面字体分开 —— 展签本来就该像一张贴上去的标签。 */
  function artPlateHTML(a) {
    const art = a.art || {};
    const inner = '<span class="lb">原作</span>' +
      '<b>' + esc(art.name || '未知作者') + '</b>' +
      (art.platform ? '<span class="pf">' + esc(art.platform) + '</span>' : '') +
      (art.uid ? '<span class="pf in">站内</span>' : '');
    const tag = art.uid
      ? '<span class="au-plate-link" data-act="go" data-route="space" data-uid="' + esc(art.uid) + '" title="去 TA 的空间">' + inner + '</span>'
      : (safeUrl(art.url)
        ? '<a class="au-plate-link" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer nofollow" title="去原作者主页">' + inner + '</a>'
        : '<span class="au-plate-link">' + inner + '</span>');
    return '<div class="au-plate">' + tag + artStamp(a) + '</div>';
  }

  function artCard(a) {
    const pf = profileOf(a.by);
    return '<article class="au-card perm-' + a.perm + '" data-act="artopen" data-id="' + esc(a.id) + '">' +
      '<div class="au-media-wrap">' + artMediaHTML(a, 'card') +
        '<span class="au-kind">' + esc(a.kind) + '</span>' +
        (a.kind === '动图' || a.mime === 'image/gif' ? '<span class="au-gif">GIF</span>' : '') +
      '</div>' +
      '<div class="au-tx"><h3>' + esc(a.title) + '</h3>' +
        (a.desc ? '<p>' + esc(a.desc) + '</p>' : '') + '</div>' +
      artPlateHTML(a) +
      '<div class="au-by">' + av(a.by, 16) +
        '<span class="lb">发布</span><b>' + esc(pf.nick) + '</b>' +
        '<time>' + esc(a.time || a.date || '') + '</time>' +
        '<span class="au-num">♥ ' + fmt(a.likes || 0) + ' · ☆ ' + fmt(a.favs || 0) + '</span>' +
      '</div>' +
      '</article>';
  }

  /* ---------- 发布表单的草稿（跨重绘保留：只改状态，输入时不整页重绘） ---------- */
  function artDraftOf() {
    if (!S.artDraft) {
      S.artDraft = { title: '', desc: '', kind: '插画', own: true, author: '', platform: '', url: '',
        perm: 'ok', agree: false, media: '', mime: '', name: '', model: null };
    }
    return S.artDraft;
  }

  function artHeroHTML() {
    const st = artPermCount();
    return '<section class="au-hero">' +
      '<div class="ah-in">' +
        '<h1>鲸鲸空间</h1>' +
        '<p class="ah-sub">鲸鱼娘的二创都挂在这面墙上。谁画的、谁搬来的，分两行写清楚：' +
          '上面的展签是原作与授权，下面的小字才是发布者。标不清出处的，只留索引不给图。</p>' +
        '<div class="ah-foot">' +
          '<div class="ah-stats">' +
            '<span><b>' + st.total + '</b> 件作品</span>' +
            '<span><b>' + st.marked + '</b> 件标明了授权</span>' +
            '<span><b>' + st.pct + '%</b> 可追溯</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      whaleCardHTML() +
      '</section>';
  }

  function artComposerHTML() {
    const d = artDraftOf();
    const kinds = artKinds.map(function (k) {
      return '<button type="button" class="chip' + (d.kind === k.id ? ' on' : '') + '" data-act="artkind" data-kind="' + k.id + '"' +
        ' aria-pressed="' + (d.kind === k.id ? 'true' : 'false') + '">' + k.icon + ' ' + k.id + '</button>';
    }).join('');
    const perms = ['ok', 'open', 'index'].map(function (k) {
      const p = ART_PERM[k];
      return '<button type="button" class="perm-chip' + (d.perm === k ? ' on' : '') + ' ' + k + '" data-act="artperm" data-perm="' + k + '"' +
        ' aria-pressed="' + (d.perm === k ? 'true' : 'false') + '">' + p.t + '</button>';
    }).join('');
    return '<section class="card au-form-card" aria-label="发布二创">' +
      '<div class="card-hd"><span class="t">发布二创</span><span class="more">原作与出处必须可查，否则请选「仅索引」</span></div>' +
      '<div class="au-form">' +
        '<div class="af-left">' +
          '<div class="af-drop' + (d.media ? ' has' : '') + '" data-act="artpick">' +
            (d.media
              ? '<img src="' + esc(d.media) + '" alt="待发布的作品预览">'
              : '<span class="af-plus" aria-hidden="true">＋</span><b>选一张作品图</b><span class="af-tip">PNG / JPG / GIF / WebP · 单张 ≤ 1.2MB</span>') +
          '</div>' +
          '<div class="af-drop-act">' +
            '<button type="button" class="btn sm ghost" data-act="artpick">' + (d.media ? '换一张' : '选择图片') + '</button>' +
            (d.media ? '<button type="button" class="btn sm ghost" data-act="artclear">移除</button>' : '') +
          '</div>' +
          '<input type="file" id="art-file" class="sr-only" accept="image/png,image/jpeg,image/gif,image/webp">' +
          '<p class="af-note">GIF 原样保留动图，不会被压成静帧。</p>' +
          '<div class="af-model' + (d.model ? ' has' : '') + '">' +
            '<div class="af-model-hd">3D 模型<span>可选</span></div>' +
            (d.model
              ? '<div class="af-model-bd"><canvas class="au-mesh" data-draft="1" width="360" height="240" aria-label="模型预览"></canvas>' +
                '<div class="af-model-tx"><b>' + esc(d.model.name) + '</b><span>' + esc(d.model.fmt) + ' · ' + fmtBytes(d.model.size) + ' · ' + esc(d.model.tris) + ' 面 · ' + (d.model.kind === 'mesh' ? '已解析' : '示意网格') + '</span></div></div>'
              : '<p class="af-model-empty">拖一个 .obj / .stl / .blend / .fbx / .glb 进来，卡片和详情页就能转起来。<br>.blend / .fbx 这类格式在浏览器里只按指纹生成示意低模，卡片上会写明。</p>') +
            '<div class="af-drop-act">' +
              '<button type="button" class="btn sm ghost" data-act="artmodelpick">' + (d.model ? '换一个模型' : '选择模型文件') + '</button>' +
              (d.model ? '<button type="button" class="btn sm ghost" data-act="artmodelclear">移除</button>' : '') +
            '</div>' +
            '<input type="file" id="art-model-file" class="sr-only" accept=".obj,.stl,.blend,.fbx,.glb,.gltf,.dae,.3ds,.ply">' +
          '</div>' +
        '</div>' +
        '<div class="af-right">' +
          '<label class="af-row"><span>作品标题</span>' +
            '<input id="art-title" maxlength="40" placeholder="给她起个名字" value="' + esc(d.title) + '">' +
            '<i id="art-title-n">' + d.title.length + ' / 40</i></label>' +
          '<label class="af-row"><span>一句话说明</span>' +
            '<textarea id="art-desc" maxlength="120" rows="2" placeholder="画的是什么、为什么想发出来">' + esc(d.desc) + '</textarea></label>' +
          '<div class="af-row"><span>作品类型</span><div class="chips">' + kinds + '</div></div>' +
          '<div class="af-seg" role="group" aria-label="我是原作者还是转载">' +
            '<button type="button" class="' + (d.own ? 'on' : '') + '" data-act="artown" data-own="1">我是原作者</button>' +
            '<button type="button" class="' + (d.own ? '' : 'on') + '" data-act="artown" data-own="0">我转载别人的</button>' +
          '</div>' +
          (d.own
            ? '<p class="af-own-tip">发布后会标成「原作 · 本人发布」，署名用你现在的昵称 <b>' + esc(profileOf(ME()).nick) + '</b>。搬别人的图就切到「我转载别人的」，或者在下面选授权档位 —— 选了会自动切过去。</p>'
            : '<div class="af-src">' +
                '<label class="af-row"><span>原作者名</span>' +
                  '<input id="art-author" maxlength="24" placeholder="画这张的人叫什么" value="' + esc(d.author) + '"></label>' +
                '<label class="af-row"><span>发布平台</span>' +
                  '<input id="art-platform" maxlength="16" placeholder="Pixiv / 米画师 / 微博 …" value="' + esc(d.platform) + '"></label>' +
                '<label class="af-row"><span>原作链接</span>' +
                  '<input id="art-url" maxlength="300" placeholder="https://…（能点开才算可追溯）" value="' + esc(d.url) + '"></label>' +
              '</div>') +
          '<div class="af-row"><span>授权情况</span><div class="perm-chips">' + perms + '</div>' +
            '<i class="af-perm-tip">' + esc(ART_PERM[d.perm].tip) + '</i></div>' +
          '<label class="af-agree"><input type="checkbox" id="art-agree"' + (d.agree ? ' checked' : '') + '>' +
            '<span>我确认上面写的原作者与出处属实；没拿到授权的，我选「仅索引」，不要求本站存图。</span></label>' +
          '<div class="af-acts">' +
            '<button type="button" class="btn blue" data-act="artsubmit">挂上作品墙</button>' +
            '<button type="button" class="btn ghost" data-act="artnew">取消</button>' +
            '<span class="af-count">已发布 ' + (S.arts || []).length + ' 件（存在本机，刷新不丢）</span>' +
          '</div>' +
        '</div>' +
      '</div></section>';
  }

  function artSide() {
    const all = artsOf();
    const byAuthor = {};
    all.forEach(function (a) {
      const n = (a.art && a.art.name) || '未知';
      byAuthor[n] = (byAuthor[n] || 0) + 1;
    });
    const top = Object.keys(byAuthor).sort(function (x, y) { return byAuthor[y] - byAuthor[x]; }).slice(0, 5);
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">这面墙的规矩</span></div>' +
      '<div class="side-bd au-rules">' +
        '<p><b>原作单独一行</b>作者名、平台、原帖链接，三样缺一不上墙。</p>' +
        '<p><b>发布者单独一行</b>谁搬来的也要留名，方便追责与更正。</p>' +
        '<p><b>没授权就只索引</b>不存图、不转存，只留一条能跳回原帖的记录。</p>' +
        '<p><b>作者说撤就撤</b>凭据与时间都留着，' + '<a href="javascript:;" data-act="go" data-route="policy">按转载政策</a>处理。</p>' +
        /* 原来挂在左栏的「上墙三件事」并进这张卡：三样是「原作单独一行」的展开，
           所以做成规矩下面的一份清单，末尾那条仍是发布框开关（缺一样只能挂索引）。 */
        '<div class="au-req">' +
          '<div class="au-req-hd">上墙三件事</div>' +
          '<ul>' +
            '<li>原作作者名</li>' +
            '<li>原作在哪发的</li>' +
            '<li>原帖能点开</li>' +
          '</ul>' +
          '<a class="au-req-go" href="javascript:;" data-act="artnew">缺一样就只能挂索引 →</a>' +
        '</div>' +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">原作作者</span><a href="javascript:;" data-act="artsort" data-sort="热门">看热度 ›</a></div>' +
      '<div class="side-bd" style="padding:8px 10px"><div class="hot-list">' + top.map(function (n, i) {
        return '<div class="hot-item"><span class="rk">' + (i + 1) + '</span>' +
          '<span class="hx"><b>' + esc(n) + '</b><span>' + byAuthor[n] + ' 件被搬上墙</span></span></div>';
      }).join('') + '</div></div></div>' +
      /* 右栏只留与「上墙」直接相关的两张卡（规矩 / 原作作者）。
         原来的「社群公告」不挂了：这里是作品墙，公告只属于首页动态流与帖子详情右栏，
         挂在这儿既挤掉上面两张卡的首屏位置，也让人以为作品墙自己也发公告。 */
      '</aside>';
  }

  /* 左栏只留作品类型（就地筛）；「上墙三件事」已并进右栏「这面墙的规矩」卡，
     同一份上墙要求不再在页面上出现两次。数字与作品墙同源，永远对得上 */
  function artRailCards() {
    const kinds = ['全部'].concat(artKinds.map(function (k) { return k.id; }));
    return '<div class="rail-card"><div class="rail-hd">作品类型</div>' + kinds.map(function (k) {
      return '<div class="rail-item rail-dot ' + (S.artKind === k ? 'on' : '') + '" data-act="artkind" data-kind="' + esc(k) + '">' +
        '<span class="tx">' + esc(k) + '</span><span class="rail-n">' + artKindCount(k) + '</span></div>';
    }).join('') + '</div>';
  }

  /* 选图：只收四种位图，超过 1.2MB 直接拒 —— 这张图要进 localStorage，
     base64 膨胀 4/3，一张 5MB 的原图能把整份存档顶爆，连帖子草稿一起丢。 */
  function artAcceptFile(f) {
    if (!f) return;
    if (IMG_TYPES.indexOf(f.type) < 0) { toast('只收 PNG / JPG / GIF / WebP', '⚠️'); return; }
    if (f.size > ART_LOCAL_MAX) {
      toast('这张 ' + (f.size / 1024 / 1024).toFixed(1) + 'MB，本地演示版请压到 1.2MB 以内', '⚠️');
      return;
    }
    const d = artDraftOf();
    readImage(f).then(function (src) {
      d.media = src;
      d.mime = f.type;
      d.name = f.name;
      render(true);
      toast(f.type === 'image/gif' ? 'GIF 会原样保留动图' : '图片已就位', '🖼️');
    });
  }
  function handleArtFile(input) {
    const f = (input.files || [])[0];
    input.value = '';
    artAcceptFile(f);
  }
  /* 模型投放：obj/stl 真解析；其余格式按文件指纹生成示意低模。
     解析出来的网格量化后跟作品一起进 localStorage，原文件不落盘。 */
  function artAcceptModel(f) {
    if (!f) return;
    const ext = modelExtOf(f.name);
    if (!MODEL_TYPES[ext]) { toast('只收 ' + Object.keys(MODEL_TYPES).join(' / ') + ' 这几种模型文件', '🧊'); return; }
    if (f.size > MODEL_MAX) { toast('这个文件 ' + fmtBytes(f.size) + '，本地演示版请压到 24MB 以内', '⚠️'); return; }
    const d = artDraftOf();
    const done = function (mesh, kind) {
      if (!mesh) { mesh = procMesh(hashStr(f.name + '|' + f.size)); kind = 'proc'; }
      d.model = {
        name: f.name.slice(0, 80), fmt: modelFmtOf(ext), size: f.size, tris: mesh.fs.length,
        kind: kind, seed: hashStr(f.name + '|' + f.size), box: mesh.box,
        mesh: kind === 'mesh' ? packMesh(mesh) : null
      };
      /* 传了模型还挂着「插画」自相矛盾：没主动改过类型就跟着切成「3D 模型」 */
      if (d.kind === '插画') d.kind = '3D 模型';
      render(true);
      toast(kind === 'mesh' ? '模型已解析 · ' + mesh.fs.length + ' 面' : '这个格式不解析，已按文件指纹生成示意低模', kind === 'mesh' ? '🧊' : '🧩');
    };
    let job;
    if (ext === 'stl') {
      job = f.arrayBuffer().then(function (buf) {
        let mesh = null;
        try { mesh = parseSTL(buf); } catch (err) {}
        done(mesh, 'mesh');
      });
    } else if (ext === 'obj') {
      if (f.size > MODEL_TEXT_MAX) { done(procMesh(hashStr(f.name + '|' + f.size)), 'proc'); return; }
      job = f.text().then(function (txt) {
        let mesh = null;
        try { mesh = parseOBJ(txt); } catch (err) {}
        done(mesh, 'mesh');
      });
    } else {
      done(procMesh(hashStr(f.name + '|' + f.size)), 'proc');
      return;
    }
    job.catch(function () { toast('这个文件读不出来，换一个试试', '⚠️'); });
  }
  function handleArtModel(input) {
    const f = (input.files || [])[0];
    input.value = '';
    artAcceptModel(f);
  }

  function artSpacePage() {
    const all = artsOf();
    let list = all.slice();
    if (S.artKind !== '全部') list = list.filter(function (a) { return a.kind === S.artKind; });
    const q = (S.artQ || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (a) {
        const hay = [a.title, a.desc, (a.art && a.art.name) || '', (a.art && a.art.platform) || '', artNick(a.by), (a.tags || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    if (S.artSort === '热门') list.sort(function (x, y) { return (y.likes || 0) - (x.likes || 0); });
    if (S.artSort === '原创') list.sort(function (x, y) { return (artIsOwn(y) ? 1 : 0) - (artIsOwn(x) ? 1 : 0); });

    /* 作品类型胶囊那排已删：左栏「作品类型」卡（artRailCards）就是同一份真源的就地面板，
       中栏再并排一排同名胶囊，两套控件读写的都是 S.artKind，纯属重复。
       空出来的位置把搜索提上来贴卡头右侧（.au-board-hd），宽度跟着卡走。 */
    const sorts = ['最新', '热门', '原创'].map(function (s) {
      return '<button type="button" class="' + (S.artSort === s ? 'on' : '') + '" data-act="artsort" data-sort="' + s + '">' + s + '</button>';
    }).join('');

    return '<div class="wrap au-wrap">' + railHTML() +
      '<div class="col-main">' + artHeroHTML() + (S.artOpen ? artComposerHTML() : '') +
        '<div class="card au-board">' +
          /* 发布二创从深海头图搬到作品墙卡头：入口贴着它要影响的那面墙，
             窄屏时卡头自动换行、按钮靠右，不会把标题挤掉。 */
          '<div class="card-hd au-board-hd"><span class="t">作品墙</span>' +
            '<span class="more">' + list.length + ' / ' + all.length + ' 件 · 点开看出处与授权</span>' +
            '<div class="mkt-search au-search">🔍<input id="artq" placeholder="搜作品、原作者、发布者" aria-label="搜作品、原作者、发布者" value="' + esc(S.artQ) + '"></div>' +
            '<button type="button" class="btn blue au-new" data-act="artnew">' + (S.artOpen ? '收起发布框' : '＋ 发布二创') + '</button></div>' +
          '<div class="market-toolbar au-toolbar" style="padding-top:10px;padding-bottom:8px">' +
            '<div class="sorts">' + sorts + '</div>' +
            '<span class="au-hint">原作与发布者分行标注 · 未授权的只挂索引</span></div>' +
          (list.length
            ? '<div class="au-grid">' + list.map(artCard).join('') + '</div>'
            : '<div class="empty"><span class="big">🐋</span>没找到匹配的作品，换个词试试，或点左栏「作品类型 · 全部」清掉筛选</div>') +
        '</div>' +
      '</div>' + artSide() + '</div>';
  }

  /* ---------- v24 · 作品详情页（真路由 #/art/<id>）：3D 舞台 + 完整信息 + 评论 ----------
     旧版是一层遮罩弹层，滚动、复制链接、后退键都不对；现在它是一张真页面：
     左栏仍在、右栏仍是「这面墙的规矩」，地址栏是 #/art/<id>，刷新回来还在原地。 */

  /* 基础审核：只拦「明显不该直接公开」的几类，命中就压成 pending（仅作者可见），
     不删、不报错 —— 用户的话先留着，等人工看过再决定公开还是退回。 */
  const CMT_MAX = 300;
  const CMT_MIN = 2;
  const CMT_COOL = 8000;          /* 同一作品连发两条主评论的最小间隔 */
  const CMT_REPLY_COOL = 1200;    /* 回别人一句是日常动作，只防手抖连点 */
  const CMT_BAD = ['加微信', '加v', '加V', '代刷', '刷单', '博彩', '赌球', '裸聊', '约炮',
    '返利', '日结', '贷款', '发票', '办证', '迷药', '毒品', '冰毒', '枪支', '卖号', '解封',
    '外挂', '私服', '破解版下载', '色情', '成人片'];

  function cmtAll(artId) {
    return (S.artComments || []).filter(function (c) { return c && c.artId === artId; });
  }
  function cmtApproved(artId) {
    return cmtAll(artId).filter(function (c) { return c.status !== 'pending'; });
  }
  function cmtCountOf(a) {
    return (a.comments || 0) + cmtApproved(a.id).length;
  }
  function cmtScan(text) {
    const t = String(text || '');
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|cn|net|top|xyz|cc|vip)\b/i.test(t)) return '夹带了站外链接，先人工确认';
    if (/(?:\+?86[- ]?)?1[3-9]\d{9}/.test(t)) return '包含手机号，先人工确认';
    for (let i = 0; i < CMT_BAD.length; i++) if (t.indexOf(CMT_BAD[i]) >= 0) return '命中了广告 / 交易类词，先人工确认';
    if (/(.)\1{5,}/.test(t)) return '连续重复字符太多，像刷屏';
    if ((t.match(/[!！?？]/g) || []).length > 8) return '感叹号太密集，像刷屏';
    return '';
  }
  function cmtMine(artId) {
    return cmtAll(artId).filter(function (c) { return c.by === ME(); });
  }
  function cmtCanDelete(c) {
    const a = artOf(c.artId);
    return c.by === ME() || !!(a && a.by === ME());
  }
  function cmtSend(artId, text, parent) {
    if (isGuest()) { toast('登录后才能评论', '🔒'); return; }
    const a = artOf(artId);
    if (!a) return;
    const t = String(text || '').trim();
    if (t.length < CMT_MIN) { toast('至少写两个字', '✏️'); return; }
    if (t.length > CMT_MAX) { toast('一条评论最多 ' + CMT_MAX + ' 字', '✂️'); return; }
    const now = Date.now();
    const mine = cmtMine(artId);
    const last = mine[mine.length - 1];
    const cool = parent ? CMT_REPLY_COOL : CMT_COOL;
    if (last && now - last.t < cool) {
      toast(parent ? '回复发得太急，缓一下' : '刚发过一条，等几秒再发', '⏳'); return;
    }
    if (mine.some(function (c) { return c.text === t && now - c.t < 120000; })) {
      toast('这句话刚说过，换个说法', '🙂'); return;
    }
    /* 只做一层楼：在「某条回复」下面再回复，挂回它所属的那条主评论，
       否则孙评论没有渲染位（列表只展开一层），用户会以为自己的话丢了。 */
    let pid = parent || '';
    if (pid) {
      const pc = (S.artComments || []).filter(function (x) { return x.id === pid; })[0];
      if (pc && pc.parent) pid = pc.parent;
    }
    const reason = cmtScan(t);
    S.artComments = S.artComments || [];
    S.artComments.push({
      id: 'c' + now.toString(36) + Math.floor(Math.random() * 90 + 10),
      artId: artId, by: ME(), text: t, t: now, parent: pid,
      status: reason ? 'pending' : 'ok', reason: reason
    });
    if (!S.cmDraft) S.cmDraft = {};
    if (pid) { S.cmReply = null; delete S.cmDraft['r' + artId]; }
    else delete S.cmDraft[artId];
    saveState();
    render(true);
    toast(reason ? '已提交，审核通过后才会公开' : (parent ? '回复已发出' : '评论已发出'), reason ? '🕵️' : '💬');
  }
  function cmtDel(cid) {
    const c = (S.artComments || []).filter(function (x) { return x.id === cid; })[0];
    if (!c) return;
    if (S.cmDel !== cid) { S.cmDel = cid; render(true); toast('再点一次确认删除，回复会一起删掉', '⚠️'); return; }
    const kids = (S.artComments || []).filter(function (x) { return x.parent === cid; }).map(function (x) { return x.id; });
    S.artComments = (S.artComments || []).filter(function (x) { return x.id !== cid && kids.indexOf(x.id) < 0; });
    S.cmDel = '';
    saveState();
    render(true);
    toast('评论已删除', '🗑️');
  }

  function cmtItemHTML(c) {
    const pend = c.status === 'pending';
    const mine = c.by === ME();
    /* 楼中楼同样守审核规矩：别人那条还在 pending 的回复，不该在我这儿露出来 */
    const kids = cmtAll(c.artId).filter(function (x) {
      return x.parent === c.id && (x.status !== 'pending' || x.by === ME());
    });
    const draft = (S.cmDraft && S.cmDraft['r' + c.artId]) || '';
    return '<div class="cm-item' + (pend ? ' is-pend' : '') + '" data-cid="' + esc(c.id) + '">' +
      '<span class="cm-av">' + av(c.by, 26) + '</span>' +
      '<div class="cm-bd">' +
        '<div class="cm-top"><b class="cm-nick">' + esc(artNick(c.by)) + '</b>' +
          (mine ? '<span class="cm-me">我</span>' : '') +
          '<span class="cm-when">' + esc(cmtTime(c.t)) + '</span>' +
          (pend ? '<span class="cm-pend">审核中</span>' : '') + '</div>' +
        '<p class="cm-text">' + esc(c.text) + '</p>' +
        (pend && c.reason ? '<p class="cm-reason">仅自己可见 · ' + esc(c.reason) + '</p>' : '') +
        '<div class="cm-acts">' +
          '<a class="cm-link" href="javascript:;" data-act="cmreply" data-cid="' + esc(c.id) + '">' +
            (S.cmReply === c.id ? '收起回复' : '回复') + '</a>' +
          (cmtCanDelete(c)
            ? '<a class="cm-link cm-del" href="javascript:;" data-act="cmdel" data-cid="' + esc(c.id) + '">' +
              (S.cmDel === c.id ? '确认删除' : '删除') + '</a>'
            : '') +
        '</div>' +
        (S.cmReply === c.id
          ? '<div class="cm-replybox"><textarea id="cm-reply-input" maxlength="' + CMT_MAX + '" rows="2" ' +
            'placeholder="回复 ' + esc(artNick(c.by)) + '">' + esc(draft) + '</textarea>' +
            '<div class="cm-row"><span class="cm-tip">' + draft.length + ' / ' + CMT_MAX + '</span>' +
            '<button type="button" class="btn sm blue" data-act="cmsend" data-id="' + esc(c.artId) + '" data-parent="' + esc(c.id) + '">发回复</button>' +
            '<button type="button" class="btn sm ghost" data-act="cmcancel">取消</button></div></div>'
          : '') +
        (kids.length ? '<div class="cm-kids">' + kids.map(cmtItemHTML).join('') + '</div>' : '') +
      '</div></div>';
  }

  function cmtBlockHTML(a) {
    const all = cmtAll(a.id).filter(function (c) { return c.status !== 'pending' || c.by === ME(); });
    const roots = all.filter(function (c) { return !c.parent || !all.some(function (p) { return p.id === c.parent; }); });
    const draft = (S.cmDraft && S.cmDraft[a.id]) || '';
    const form = isGuest()
      ? '<div class="cm-form"><p class="cm-guest">登录后才能评论、回复与删除。' +
          '<button type="button" class="btn sm blue" data-act="go" data-route="login">去登录</button></p></div>'
      : '<div class="cm-form">' +
          '<textarea id="cm-input" maxlength="' + CMT_MAX + '" rows="3" placeholder="说点具体的：你看到的光、形、做法，或者想问的">' + esc(draft) + '</textarea>' +
          '<div class="cm-row"><span class="cm-tip" id="cm-tip">' + draft.length + ' / ' + CMT_MAX + ' · 链接 / 手机号 / 广告词会先进审核</span>' +
          '<button type="button" class="btn sm blue" data-act="cmsend" data-id="' + esc(a.id) + '">发表评论</button></div></div>';
    return '<section class="card ad-cm" aria-label="评论">' +
      '<div class="cm-hd"><span class="t">评论</span><span class="n">' + cmtCountOf(a) + '</span>' +
        '<span class="more">基础审核：链接、手机号、广告词先压成「审核中」，只有你自己看得见</span></div>' +
      form +
      '<div class="cm-list">' +
        (roots.length ? roots.map(cmtItemHTML).join('')
          : '<div class="cm-empty">还没有人说话。第一句可以留给细节，而不是「好看」。</div>') +
      '</div></section>';
  }

  function artDetailPage(id) {
    const a = artOf(id);
    if (!a) {
      return '<div class="wrap au-wrap"><div class="col-main"><div class="card"><div class="empty">' +
        '<span class="big">🐋</span>这件作品已经不在墙上了' +
        '<div style="margin-top:10px"><a class="btn sm ghost" href="javascript:;" data-act="go" data-route="art">回作品墙</a></div>' +
        '</div></div></div></div>';
    }
    const art = a.art || {};
    const pf = profileOf(a.by);
    const m = a.model || null;
    const stage = m
      ? '<div class="ad-stage is-3d">' +
          '<canvas id="ad-canvas" class="ad-canvas" data-mid="' + esc(a.id) + '" role="img" ' +
            'aria-label="' + esc(a.title) + ' 的 3D 模型，可拖动旋转"></canvas>' +
          '<div class="ad-3dbar">' +
            '<button type="button" class="ad-3dbtn" data-act="adspin" id="ad-spin">暂停旋转</button>' +
            '<button type="button" class="ad-3dbtn ghost" data-act="adreset">重置视角</button>' +
          '</div>' +
          '<div class="ad-cap"><span class="b">3D</span><span>' + esc(m.fmt) + ' · ' +
            (m.kind === 'mesh' ? '真网格' : '示意网格') + ' · ' + esc(m.tris) + ' 面 · ' + fmtBytes(m.size) + '</span></div>' +
          '<p class="ad-hint3d">拖动 / 按住拖可以转视角</p>' +
        '</div>'
      : '<div class="ad-stage">' + artMediaHTML(a, 'view') + '</div>';
    const srcLink = safeUrl(art.url)
      ? '<a class="aw-go" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer nofollow">去原作者主页 ↗</a>' : '';
    const authorBlock = art.uid
      ? '<a class="aw-go" href="javascript:;" data-act="go" data-route="space" data-uid="' + esc(art.uid) + '">作者就在站内 · 去 TA 的空间 ›</a>'
      : srcLink;
    return '<div class="wrap au-wrap">' + railHTML() +
      '<div class="col-main">' +
        '<a class="ad-back" href="javascript:;" data-act="go" data-route="art">← 回作品墙</a>' +
        '<article class="card ad">' +
          stage +
          '<div class="ad-info">' +
            '<div class="ad-hd"><h1>' + esc(a.title) + '</h1><span class="ad-kind">' + esc(a.kind) + '</span>' + artStamp(a) + '</div>' +
            '<p class="ad-desc">' + esc(a.desc || '发布者没有写说明。') + '</p>' +
            (a.tags && a.tags.length ? '<div class="ad-tags">' + a.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            '<div class="ad-meta">' +
              '<span>发布 <b>' + esc(pf.nick) + '</b></span>' +
              '<span>' + esc(a.date || '') + ' · ' + esc(a.time || '') + '</span>' +
              (m ? '<span>文件 ' + esc(m.name) + '</span>' : '') +
              '<span>♥ ' + num(a.likes || 0) + ' · ☆ ' + num(a.favs || 0) + ' · 💬 ' + num(cmtCountOf(a)) + '</span>' +
            '</div>' +
            (m && m.kind !== 'mesh'
              ? '<p class="ad-note">提示：' + esc(MODEL_NOTE) + '</p>' : '') +
            '<div class="ad-acts">' +
              '<button type="button" class="btn sm ghost" data-act="artlike" data-id="' + esc(a.id) + '">' +
                (S.artLikes.has(a.id) ? '♥ 已喜欢' : '♥ 喜欢') + '</button>' +
              '<button type="button" class="btn sm ghost' + (S.artFav.has(a.id) ? ' faved' : '') + '" data-act="artfav" data-id="' + esc(a.id) + '" aria-pressed="' + (S.artFav.has(a.id) ? 'true' : 'false') + '">' +
                (S.artFav.has(a.id) ? '★ 已收藏' : '☆ 收藏') + '</button>' +
              '<button type="button" class="btn sm ghost" data-act="toast" data-msg="作品墙的版权问题请到「站务反馈」版块发帖，附作品链接与授权情况，我们会留档处理">⚑ 版权问题</button>' +
              '<span class="aw-fine">出处不明的作品请点这里；作者本人说撤，凭据留着，按转载政策处理。</span>' +
            '</div>' +
          '</div>' +
          '<div class="ad-plate">' +
            '<div class="wt">' +
              '<h3>原作</h3>' +
              '<p class="wt-name">' + esc(art.name || '未知作者') +
                (art.platform ? '<span class="wt-pf">' + esc(art.platform) + '</span>' : '') + '</p>' +
              '<p class="wt-meta">' + (art.handle ? esc(art.handle) + ' · ' : '') + (art.uid ? '本站作者' : '站外作者') + '</p>' +
              authorBlock +
              '<p class="wt-lic"><b>授权凭据</b>' + esc(a.lic || '未写明') + '</p>' +
            '</div>' +
            '<div class="wt wt-by">' +
              '<h3>发布</h3>' +
              '<p class="wt-name">' + av(a.by, 20) + esc(pf.nick) + '<span class="wt-pf">Lv.' + ((users[a.by] && users[a.by].level) || 1) + '</span></p>' +
              '<p class="wt-meta">' + esc(a.date || '') + ' · ' + esc(a.time || '') + ' 挂上这面墙</p>' +
              '<p class="wt-lic"><b>发布者的话</b>' + (art.uid ? '这张就是我自己做的，署名与版权都归这个账号。' : '我只是搬运，作品与授权都归上面那位作者。') + '</p>' +
              artStamp(a) +
            '</div>' +
          '</div>' +
        '</article>' +
        cmtBlockHTML(a) +
      '</div>' + artSide() + '</div>';
  }

  /* 本地发布：校验 → 入 S.arts → 落盘 → 重绘 */
  function artSubmit() {
    const d = artDraftOf();
    const title = (d.title || '').trim();
    if (!title) { toast('先给她起个名字', '✏️'); const t = qs('#art-title'); if (t) t.focus(); return; }
    if (!d.own) {
      if (!(d.author || '').trim()) { toast('转载必须写清原作者是谁', '⚠️'); const a = qs('#art-author'); if (a) a.focus(); return; }
      if (!(d.platform || '').trim()) { toast('原作发在哪个平台也要写', '⚠️'); const p = qs('#art-platform'); if (p) p.focus(); return; }
      if (!safeUrl(d.url)) { toast('原作链接要以 http(s) 开头，点得开才算可追溯', '🔗'); const u = qs('#art-url'); if (u) u.focus(); return; }
    }
    if (d.perm !== 'index' && !d.media && !d.model) { toast('选一张图或一个 3D 模型，或者把授权改成「仅索引」', '🖼️'); return; }
    if (!d.agree) { toast('先勾一下「出处属实」那一条', '✅'); return; }
    const me = ME();
    const pf = profileOf(me);
    const item = {
      id: 'l' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10),
      title: title.slice(0, 40), kind: d.kind, by: me, perm: d.own ? 'own' : d.perm,
      art: d.own
        ? { name: pf.nick, uid: me, platform: '本站', url: '', handle: '' }
        : { name: (d.author || '').trim().slice(0, 24), platform: (d.platform || '').trim().slice(0, 16), url: (d.url || '').trim(), handle: '' },
      lic: d.own ? '本人发布，署名即本账号' : (d.perm === 'index' ? '未获授权，只留索引与原帖链接' : '发布者声明已获作者授权，凭据待补'),
      desc: (d.desc || '').trim().slice(0, 120),
      tags: ['我的发布'], likes: 0, favs: 0, comments: 0,
      time: '刚刚', date: new Date().toISOString().slice(0, 10),
      media: d.perm === 'index' ? '' : d.media, mime: d.mime || '',
      model: d.perm === 'index' ? null : (d.model || null)
    };
    S.arts.unshift(item);
    S.artDraft = null;
    S.artOpen = false;
    S.artKind = '全部';
    S.artQ = '';
    S.artSort = '最新';
    saveState();
    render(false);
    toast('已挂上作品墙 · ' + (item.perm === 'index' ? '仅索引，不展示图片' : '原作与发布者已分块标注'), '🐋');
  }

    function feedPage() {
    let list = posts.slice();
    if (S.published.length) list = S.published.concat(list);
    if (S.tab === '插件') list = list.filter(p => p.plugin);
    if (S.tab === '问答') list = list.filter(p => !p.plugin);
    if (S.tab === '关注') list = list.filter(p => ['u3', 'u5', 'u2'].indexOf(p.user) >= 0);
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' + heroHTML() + composerHTML() +
      '<div class="card"><div class="card-hd"><span class="t">更新日志</span><span class="more" data-act="go" data-route="forum">去社群看看 ›</span></div>' +
      '<div class="feed">' + (list.length ? list.map(postHTML).join('') : '<div class="empty"><span class="big">🍃</span>这里还没有更新日志</div>') + '</div></div></div>' +
      feedSide() + '</div>';
  }

  /* 首页右栏第一张卡：登录了就显示「我」，没登录就显示「离线」。
     离线态不是把整张卡删掉 —— 那会让右栏塌成三张、版面跟着跳；
     也不要假装有粉丝数（0 粉丝 0 关注读起来像「没人理你」，而不是「你还没登录」）。
     所以离线用同一张卡、同一套骨架，只把身份区换成一枚灰鲸鱼 + 一句为什么 + 一个登录入口。 */
  function meCard() {
    if (isGuest()) {
      return '<div class="side-card me-card me-card-off"><div class="banner off"></div><div class="body">' +
        '<div class="off-av" aria-hidden="true"><img class="av av-guest" src="' + defaultAvaSrc() +
        '" width="56" height="56" style="width:56px;height:56px" alt=""><span class="off-ring"></span></div>' +
        '<div class="nm"><span class="off-st">离线状态</span> <span class="lv off">未登录</span></div>' +
        '<div class="sig">登录后才能发日志、评论、发布插件，也会有自己的空间与消息。</div>' +
        '<div class="off-acts"><button type="button" class="btn sm blue" data-act="go" data-route="login">请登录</button>' +
        '<button type="button" class="btn sm ghost" data-act="go" data-route="forum">先逛逛 ›</button></div>' +
        '<div class="off-tip">没有账号？<a href="javascript:;" data-act="gototab" data-tab="register">免费注册</a></div>' +
        '</div></div>';
    }
    const k = ME();
    const u = userRow(k);
    const pf = profileOf(k);
    const cover = meCover();
    return '<div class="side-card me-card"><div class="banner"' +
      (cover ? ' style="background:' + cover + '"' : '') + '></div><div class="body">' + av(k, 56) +
      '<div class="nm">' + esc(pf.nick) + ' <span class="lv">Lv.' + u.level + '</span></div>' +
      '<div class="sig">' + esc(pf.sig) + '</div>' +
      '<div class="me-stats"><div><b>' + num(u.fans) + '</b><span>粉丝</span></div><div><b>' + u.follows + '</b><span>关注</span></div><div><b>' + fmt(u.visits) + '</b><span>访客</span></div></div>' +
      '<div style="display:flex;gap:7px;margin-top:11px"><button class="btn sm blue" style="flex:1" data-act="go" data-route="space">我的空间</button>' +
      '<button class="btn sm ghost" style="flex:1" data-act="go" data-route="profile">我的资料</button></div></div></div>';
  }

  function visitorCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">最近访客</span><a href="javascript:;">全部 128 ›</a></div>' +
      '<div class="side-bd"><div class="visitors">' + visitors.slice(0, 8).map(v =>
        '<div class="v" data-act="user" data-uid="' + v.user + '" title="' + esc(v.action) + '">' + av(v.user, 42) +
        '<span>' + esc(userOf(v.user).name) + '</span><span class="tt">' + esc(v.time) + '</span></div>').join('') +
      '</div></div></div>';
  }

  function hotCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">热门话题</span><a href="javascript:;" data-act="go" data-route="forum">更多 ›</a></div>' +
      '<div class="side-bd" style="padding:8px 10px"><div class="hot-list">' + hotTopics.map((h, i) =>
        '<div class="hot-item" data-act="tag" data-tag="' + esc(h.tag) + '"><span class="rk">' + (i + 1) + '</span>' +
        '<span class="hx"><b>#' + esc(h.tag) + '#</b><span>' + esc(h.count) + '</span></span>' +
        '<span class="tr">' + esc(h.trend) + '</span></div>').join('') + '</div></div></div>';
  }

  function pluginSide() {
    return '<div class="side-card"><div class="side-hd"><span class="t">插件推荐</span><a href="javascript:;" data-act="go" data-route="market">市场 ›</a></div>' +
      '<div class="side-plugins">' + plugins.slice(0, 4).map(p =>
        '<div class="sp-row" data-act="go" data-route="market"><div class="sp-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
        '<div class="sx"><b>' + esc(p.name) + '</b><span>' + verTxt(p) + ' · ' + fmt(p.installs) + ' 次安装</span></div>' +
        '<span class="st">★ ' + fmt(p.stars) + '</span></div>').join('') + '</div></div>';
  }

  /* v14 · 空间页的“插件推荐”：仿 Minecraft 模组页的 Main File / Recent Files 分组卡 ——
     标题行 + 灰色文件块（块内是一行粗体版本行 + 一行元信息 + 右对齐日期）。
     只用在 spaceSide，首页那张还是老的四行列表（信息密度更适合动态流）。 */
  function pfBlock(p, main) {
    const t = tierOf(p);
    const date = p.collected || '';
    const title = main
      ? verTxt(p) + ' · ' + TIER_SHORT[t] + ' · ' + fmt(p.installs) + ' 次安装'
      : esc(p.name) + ' · ' + verTxt(p);
    const meta = main
      ? '<span class="pf-tag ' + t + '" aria-hidden="true">' + TIER_ICON[t] + '</span>' +
        '<span class="pf-chip">' + esc(/^custom$/i.test(p.license || '') ? '自定义许可' : (p.license || '许可未标注')) + '</span>' +
        '<span class="pf-chip">' + esc(p.cat) + '</span>'
      : '<span class="pf-tag ' + t + '" aria-hidden="true">' + TIER_ICON[t] + '</span>' +
        '<span class="pf-chip">' + TIER_SHORT[t] + '</span>' +
        '<span class="pf-chip">★ ' + fmt(p.stars) + '</span>';
    return '<div class="pf-blk" data-act="pl" data-id="' + p.id + '">' +
      '<div class="pf-t">' + title + '</div>' +
      '<div class="pf-meta">' + meta + (date ? '<span class="pf-date">' + esc(date) + '</span>' : '') + '</div>' +
      '</div>';
  }

  /* 插件卡有两个身份：
       · 不带 uid（首页右栏）→ 全站推荐，取前四个条目；
       · 带 uid（空间页右栏）→ 这个人的作品列表。
     带 uid 时不写死「4 个」也不抢占位：作者可能只发过 1 个、也可能一个都没有。
     空态给的是动作（去看看全站条目 / 自己也发一个），不是一句「暂无数据」。 */
  function pluginFilesCard(uid) {
    const mine = uid ? plugins.filter(function (p) { return p.author === uid; }) : null;
    /* 「最近更新」按收录日期倒序，否则 p3 的 10-12 会排在 p4 的 10-15 后面 */
    const sorted = (mine || plugins.slice(0, 4)).slice().sort(function (x, y) {
      return (y.collected || '').localeCompare(x.collected || '');
    });
    const list = mine ? sorted : plugins.slice(0, 4);
    const own = !!uid && uid === ME();
    const who = uid ? (own ? '我的插件' : esc(profileOf(uid).nick) + '的插件') : '插件推荐';
    const head = '<div class="side-hd"><span class="t">' + who + '</span>' +
      '<a href="javascript:;" data-act="go" data-route="market">市场 ›</a></div>';
    if (!list.length) {
      return '<div class="side-card plugin-files"><div class="side-hd"><span class="t">' + who + '</span></div>' +
        '<div class="pf-empty"><span class="big" aria-hidden="true">🧩</span>' +
        '<b>' + (own ? '你还没有发布过插件' : esc(profileOf(uid).nick) + ' 还没有发布插件') + '</b>' +
        '<span>条目库里的每个插件都来自作者本人认领与授权。</span>' +
        (own
          ? '<button type="button" class="btn sm blue" data-act="go" data-route="publish">去发布一个</button>'
          : '<button type="button" class="btn sm ghost" data-act="go" data-route="market">逛逛条目库 ›</button>') +
        '</div></div>';
    }
    const main = list[0];
    const rest = mine ? list.slice(1) : list.slice(1).sort(function (x, y) {
      return (y.collected || '').localeCompare(x.collected || '');
    });
    const countLine = uid
      ? '共 ' + list.length + ' 个条目 · 按收录日期排序'
      : '本站已收录 ' + plugins.length + ' 个条目';
    return '<div class="side-card plugin-files">' + head +
      '<div class="pf-bd">' +
        '<div class="pf-hd">主推版本</div>' +
        '<div class="pf-sub">' + esc(main.name) + '</div>' +
        pfBlock(main, true) +
        (rest.length ? '<div class="pf-sec"><span>最近更新</span>' +
          '<a href="javascript:;" data-act="go" data-route="market">全部 ›</a></div>' : '') +
        '<div class="pf-sub">' + countLine + '</div>' +
        rest.map(function (p) { return pfBlock(p, false); }).join('') +
        '<button type="button" class="pf-more" data-act="go" data-route="market">查看全部条目 ›</button>' +
      '</div></div>';
  }

  function noticeSide() {
    return '<div class="side-card"><div class="side-hd"><span class="t">社群公告</span></div><div class="side-bd announce">' +
      '<p>📣 插件库新增 <b>依赖树</b> 视图，可查看插件间引用关系与冲突提示。</p>' +
      '<p>🛠️ 本周维护窗口：周六 02:00 – 04:00，期间发布功能暂停。</p>' +
      '<p>🎁 <span class="k">插件作者激励计划</span> 第 3 期开放报名，详见社群置顶。</p>' +
      '<p style="margin-bottom:0">📚 文档中心已更新至 <b>v2.1</b>，新增无头通道与作业队列章节。</p></div></div>';
  }

  function feedSide() {
    return '<aside class="col-side">' + meCard() + hotCard() + pluginSide() + noticeSide() + '</aside>';
  }

  /* ---------- 插件条目库 ---------- */

  /* 许可证是「能不能拿去用」的第一道信息，但绝大多数外链条目在作者仓库里根本没写。
     以前每张卡都追加一句红字「· 未声明许可证」，6716 张卡喊同一句负面话，
     真正能区分条目的信息被埋掉了。现在拆成两件事：
       · 档位行只讲包信息（体积/登记方/包在哪），不再重复负面词；
       · 许可证单独一枚小徽章，没标注用中性灰、宽松许可用绿、著佐权用琥珀，
         UNLICENSED 用红（那是「作者明确没授权」，和「没写」不是一回事）。 */
  const LIC_OPEN = /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|Unlicense|CC0-1\.0|0BSD|Zlib|WTFPL|BSL-1\.0|PSF-2\.0)$/i;
  function licKnown(p) {
    const raw = String((p && p.license) || '').trim();
    return !!raw && !/^noassertion$/i.test(raw);
  }
  function licChip(p) {
    const raw = String((p && p.license) || '').trim();
    if (!licKnown(p)) {
      return '<span class="pl-lic none" title="作者仓库里没有 LICENSE 文件，package.json 也没写 license —— 点进去看条目页的许可证页">许可未标注</span>';
    }
    const cls = /^unlicensed$/i.test(raw) ? 'closed' : (LIC_OPEN.test(raw) ? 'open' : 'strict');
    /* Custom = 作者写了 LICENSE，但不是任何 SPDX 标准模板（自制商用条款、双许可说明…）。
       这不是「没声明」，也不是能一眼判断宽松/严格的许可，所以显示成「自定义许可」+ 琥珀。 */
    const text = /^custom$/i.test(raw) ? '自定义许可' : raw;
    const title = /^custom$/i.test(raw) ? '作者写了自定义许可条款，不是标准 SPDX 许可证 —— 点进去看原文' : '许可证：' + raw;
    return '<span class="pl-lic ' + cls + '" title="' + esc(title) + '">' + esc(text) + '</span>';
  }

  function pluginCard(p) {
    const on = S.installed.has(p.id);
    const t = tierOf(p);
    const f = p.file;
    /* 档位行：把「包信息登记到哪一步」写在卡片上，不用点进去才知道 */
    /* 徽章已经说了「已登记包 / 外链 / 仅条目」，这行只补它没说清的部分：
       体积与谁登记的；没登记的就说没登记，别再重复一遍徽章 */
    const meta = t === 'pack' && f
      ? '<b>' + esc(f.size) + '</b><span style="opacity:.6"> · </span>' + (p.source === 'author' ? '作者登记' : '社群转载')
      /* 外链条目这行留空：徽章已经写着「外链」，再写「包信息见作者仓库」是废话，
         而且把卡片挤成两行（193px 宽装不下 徽章+这句话+许可证）。 */
      : t === 'link' ? '' : '仅条目 · 不含包信息';
    return '<div class="pl-card" style="--grad:' + p.grad + '" data-act="pl" data-id="' + p.id + '">' +
      (p.hot ? '<span class="hot-flag">HOT</span>' : '') +
      '<div class="pl-top"><div class="pl-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span class="pl-name">' + esc(p.name) + '</span></div>' +
      '<div class="pl-auth">' + av(p.author, 16) + esc(userOf(p.author).name) + '<span class="pl-ver">' + verTxt(p) + '</span>' +
      '<span style="color:var(--txt-3)">· ' + esc(p.updated) + '</span></div></div></div>' +
      '<div class="pl-desc">' + esc(p.desc) + '</div>' +
      '<div class="pl-tags">' + p.tags.map(t => '<i>#' + esc(t) + '</i>').join('') + '</div>' +
      '<div class="pl-stats"><span>★ <b>' + fmt(p.stars) + '</b></span>' +
      '<span class="install">⤓ ' + num(p.installs) + '</span>' +
      '<button class="pl-install ' + (on ? 'done' : '') + '" data-act="install" data-pid="' + p.id + '">' + (on ? '已安装' : '安装') + '</button></div>' +
      '<div class="pl-tier">' + tierBadge(p) + '<span class="meta">' + meta + '</span>' + licChip(p) + '</div></div>';
  }

  /* 一屏 60 张卡：6716 个条目 × 每张 ~40 个节点 = 27 万节点，浏览器会直接卡死。
     60 张 ≈ 2400 个节点，滚动和 hover 都是顺的；点「加载更多」再 +60。 */
  const MKT_PAGE = 60;

  function marketList() {
    let list = plugins.slice();
    if (S.cat !== '全部') list = list.filter(p => p.cat === S.cat);
    if (S.tier !== '全部') list = list.filter(p => tierOf(p) === S.tier);
    if (S.q) {
      const q = S.q.toLowerCase();
      list = list.filter(p => (p.name + p.desc + p.tags.join('')).toLowerCase().indexOf(q) >= 0);
    }
    /* 「最新」按收录日期排，不再按 id 字典序 —— id 是 p1..p9，跟时间没关系 */
    if (S.sort === '最新') list.sort((a, b) => a.collected < b.collected ? 1 : -1);
    else if (S.sort === '安装') list.sort((a, b) => b.installs - a.installs);
    else if (S.sort === '体积') list.sort((a, b) => (b.file ? b.file.sizeB : -1) - (a.file ? a.file.sizeB : -1));
    else list.sort((a, b) => b.stars - a.stars);
    return list;
  }

  function marketPage() {
    const list = marketList();
    /* 渲染分页：筛选 / 排序 / 搜索一变（签名变化）就回到第一页 ——
       否则切到别的分类还停在「已显示 480 张」，用户会以为筛选没生效。 */
    const mktSig = S.q + '|' + S.cat + '|' + S.tier + '|' + S.sort;
    if (mktSig !== S.mktSig) { S.mktSig = mktSig; S.mktLimit = MKT_PAGE; }
    const shown = list.slice(0, S.mktLimit);
    const rest = list.length - shown.length;
    const cnt = { pack: 0, link: 0, entry: 0 };
    plugins.forEach(function (p) { cnt[tierOf(p)]++; });
    const claimed = plugins.filter(function (p) { return p.claimed; }).length;
    /* 许可证覆盖单独报一个数：用户会以为「没标注」是本站偷懒，
       其实是作者仓库里真的没有 LICENSE。把这个比例摆出来，比每张卡喊一句「未声明」有用。 */
    const licCount = plugins.filter(licKnown).length;
    const tiers = [['全部', '全部', plugins.length], ['pack', '已登记包', cnt.pack],
      ['link', '外链', cnt.link], ['entry', '仅条目', cnt.entry]];
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      /* 分类胶囊那排已删：分类入口本来就有一份真源在左栏「插件分类」卡（railcat），
         中栏再并排一排同名胶囊，两套控件读写同一个 S.cat，纯属重复。
         空出来的那一行把搜索提上来，贴着卡头右侧、宽度跟着卡走（.mkt-hd）。 */
      '<div class="card"><div class="card-hd mkt-hd"><h1 class="t">插件条目库</h1>' +
      '<span class="more">共 ' + plugins.length + ' 个条目 · 已登记包 ' + cnt.pack + ' 个 · 已认领 ' + claimed + ' 个 · 许可证已标注 ' + licCount + ' 个</span>' +
      /* 搜索与「发布插件」编成一组贴卡头右端：组用 margin-left:auto 吃中间空白，
         组内搜索可缩、按钮不可缩，所以窗口变窄时先缩搜索、按钮永远跟着搜索走，
         不会出现「按钮被挤到下一行开头」。≤760 用 display:contents 把组拆开，
         按钮回标题行贴右，搜索独占下一行铺满。 */
      '<div class="mkt-hd-acts"><div class="mkt-search">🔍<input id="mktq" placeholder="搜索插件名 / 标签" aria-label="搜索插件名或标签" value="' + esc(S.q) + '"></div>' +
      '<button class="btn sm blue mkt-new" data-act="go" data-route="publish">+ 发布插件</button></div></div>' +
      /* 档位筛选：能不能下载是这里最常被问的一件事，所以放在分类下面独占一行 */
      '<div class="tier-bar"><span class="lb">收录深度</span>' + tiers.map(function (x) {
        return '<button class="tier-chip ' + (S.tier === x[0] ? 'on' : '') + '" data-act="tier" data-t="' + x[0] + '">' +
          (x[0] === '全部' ? '' : '<i>' + TIER_ICON[x[0]] + '</i>') + x[1] + ' <b style="font-variant-numeric:tabular-nums;opacity:.75">' + x[2] + '</b></button>';
      }).join('') + '<span class="dist">登记了包信息的条目占 <b>' + (plugins.length ? Math.round(cnt.pack / plugins.length * 100) : 0) + '%</b>，文件都在作者仓库</span></div>' +
      '<div class="market-toolbar" style="padding-top:8px;padding-bottom:8px"><div class="sorts">' +
      ['热度', '最新', '安装', '体积'].map(s => '<button class="' + (S.sort === s ? 'on' : '') + '" data-act="sort" data-sort="' + s + '">' + s + '</button>').join('') +
      '</div><span style="margin-left:auto;font-size:12px;color:var(--txt-3)">' + list.length + ' 个结果</span></div>' +
      (list.length ? '<div class="mkt-grid">' + shown.map(pluginCard).join('') + '</div>' +
        (rest > 0 ? '<div class="mkt-more"><button class="btn sm" data-act="mktmore">加载更多（已显示 ' +
          shown.length + ' / ' + list.length + '）</button><span class="meta">条目太多，先画一屏，滚动更跟手</span></div>' : '')
        : plugins.length
          ? '<div class="empty"><span class="big">🔍</span>没有匹配的条目，换个关键词或档位试试</div>'
          : '<div class="empty"><span class="big">🧩</span>条目库还没有内容：后端 /api/plugins 返回空。' +
            '先跑一次 <code>node scripts/seed.js</code>，或者发布第一个条目。</div>') +
      '</div></div>' + marketSide() + '</div>';
  }

  /* 作者下载量榜：右栏第二张卡（原来是「分类」计数胶囊，见 marketSide 里的说明）。
     排序口径 = 该作者名下所有条目的 installs 之和（全站累计），并列时按 uid 稳定
     排，免得同一个数字每渲染一次就换个位。数据只有一份来路：plugins 里的 author
     与 installs 现加现算，不新增数据字段，也不在 data.js 里维护第二份榜单 ——
     榜单跟条目库必须永远一致，算出来的才不会过期。 */
  function authorRank() {
    const m = {};
    plugins.forEach(function (p) {
      const k = p.author;
      if (!m[k]) m[k] = { uid: k, dl: 0, n: 0 };
      m[k].dl += p.installs; m[k].n++;
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.dl - a.dl || (a.uid < b.uid ? -1 : 1); });
  }
  /* 一行是一个人，不是一条插件。点进去是作者的空间（data-act="user"，与条目页
     「进入 TA 的空间」同一个 action），到那儿右栏正好就是「TA 的插件」卡，
     榜单 → 作者 → 作品这条链子是通的；「安装榜」那一列点的是条目，两列各管一头。 */
  function authorRankCard() {
    const rank = authorRank();
    return '<div class="side-card"><div class="side-hd"><span class="t">作者下载量榜</span>' +
      '<span style="font-size:11.5px;font-weight:500;color:var(--txt-3)">共 ' + rank.length + ' 位作者</span></div>' +
      '<div class="side-bd" style="padding:8px 10px"><div class="hot-list">' +
      rank.slice(0, 5).map(function (a, i) {
        const u = userOf(a.uid);
        return '<div class="hot-item" data-act="user" data-uid="' + a.uid + '" title="进入 ' + esc(u.name) +
          ' 的空间 · ' + a.n + ' 个插件共 ' + num(a.dl) + ' 次下载">' +
          '<span class="rk">' + (i + 1) + '</span>' + av(a.uid, 26) +
          '<span class="hx"><b>' + esc(u.name) + '</b><span>' + a.n + ' 个插件 · 共 ' + num(a.dl) + ' 次下载</span></span>' +
          '<span class="tr">' + fmt(a.dl) + '</span></div>';
      }).join('') + '</div></div></div>';
  }
  function marketSide() {
    const top = plugins.slice().sort((a, b) => b.installs - a.installs).slice(0, 5);
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">安装榜</span><a href="javascript:;">本周</a></div><div class="side-bd" style="padding:8px 10px"><div class="hot-list">' +
      top.map((p, i) => '<div class="hot-item" data-act="pl" data-id="' + p.id + '"><span class="rk">' + (i + 1) + '</span>' +
        '<span class="sp-ico" style="width:26px;height:26px;border-radius:8px;font-size:13px;background:' + p.grad + '">' + p.icon + '</span>' +
        '<span class="hx"><b>' + esc(p.name) + '</b><span>' + num(p.installs) + ' 次安装</span></span>' +
        '<span class="tr">★' + fmt(p.stars) + '</span></div>').join('') + '</div></div></div>' +
      /* 右栏第二张卡已从「分类」换成「作者下载量榜」（见 authorRank / authorRankCard）：
         分类的入口本来就有一份真源在左栏「插件分类」卡（railcat），右栏再摆一排
         同名计数胶囊纯属重复 —— 与中栏那排分类胶囊被删是同一条理由（见 marketPage
         顶部注释）。空出来的位置补上右栏一直缺的那一维度：谁的作品被下得最多。 */
      authorRankCard() +
      /* 右栏不再挂「社群公告」：公告属于首页动态流，摆进插件库只是把同一段话复读一遍，
         跟这里的「安装榜 / 作者下载量榜」也不是一个维度（社群页右栏此前已撤掉同一张卡）。 */
      '</aside>';
  }


  /* ══════════════════════════════════════════════════════════════
     v6 · 条目库 / 下载 / 认领 / 上传 / 转载与下架政策
     一句话原则：能不能下载，看作者授权，不看许可证推断。
     所以每处「下载」旁边都必须说清「谁给的授权」。
     ══════════════════════════════════════════════════════════════ */
  /* v38 · 插件详情页的六个标签：深链 #/plugin/<id>/<tab> 只认这几个值，
     其余一律回到代码页 —— 地址栏写错不会渲染出空白页。 */
  const ENTRY_TABS = ['code', 'releases', 'issues', 'discussions', 'security', 'insights'];
  /* v44 · 档位语言改成「登记」口径：本站从头到尾不托管安装包文件，
     所以不能再叫「本站包 / 本站提供安装包」——那和下面的说明自相矛盾。 */
  const TIER_LABEL = { pack: '作者已登记安装包信息', link: '外链作者仓库', entry: '仅条目，无下载' };
  const TIER_ICON = { pack: '📋', link: '↗', entry: '·' };
  const TIER_SHORT = { pack: '已登记包', link: '外链', entry: '仅条目' };
  const TIER_TIP = {
    pack: '包信息已登记（名称 / 大小 / sha256），文件在作者仓库，按下面三步取',
    link: '本站不存包，去作者仓库拿最新的',
    entry: '没有可用下载渠道，只有条目信息'
  };

  function pluginOf(id) {
    /* 找不到就返回 null：以前回落成 plugins[0]，后端条目为空时是 undefined，
       调用方 p.author 直接抛错。空态由 entryPage() 自己画。 */
    /* 条目 id 在前端统一是 'p' + 服务端主键（见 sync 里的 p4592）；但外链、
       分享、sitemap 里有人写纯数字 #/plugin/4592 —— 两种写法都要认，
       否则打开就是空态「没有找到这个插件条目」。 */
    const key = String(id == null ? '' : id);
    const alt = /^p\d+$/.test(key) ? key.slice(1) : ('p' + key);
    return plugins.filter(function (p) {
      const pid = String(p.id);
      return pid === key || pid === alt;
    })[0] || null;
  }
  function pluginByName(name) {
    if (!name) return null;
    return plugins.filter(function (p) { return p.name === name || p.pkg === name; })[0] || null;
  }
  /* data.js 里的 claimed 是「服务端已知的认领状态」，S.claimed 只是本次会话刚验证通过的。
     两者取并集：否则静态数据里已认领的条目（p1/p2/p4/p9）在页面里会显示成未认领。 */
  function claimedOf(p) { return !!p.claimed || S.claimed.has(p.id); }
  function mirrorOf(p) { return S.mirror[p.id] || p.mirror; }
  /* 档位跟着授权状态走：作者在认领页刚打开镜像，列表与条目页立刻变 */
  function tierOf(p) {
    const cl = claimedOf(p), m = mirrorOf(p);
    /* 作者认领过，就以他此刻的选择为准：关掉镜像立刻降成「仅条目」，
       连历史转载的包也不再对外分发 —— 授权是可以收回的。 */
    if (cl) {
      if (m === 'off') return 'entry';
      /* 作者点「撤回当前版本」：立刻停止分发，条目与外链仍在 */
      if (S.withdraw && S.withdraw.has(p.id)) return 'link';
      return p.file ? 'pack' : 'link';
    }
    /* 没认领的条目沿用数据里的历史档位：pack 只可能是本站早年转载 */
    return p.tier;
  }
  function tierBadge(p, tiny) {
    const t = tierOf(p);
    return '<span class="tier-badge ' + t + (tiny ? ' tiny' : '') + '" title="' + TIER_TIP[t] + '">' +
      '<i>' + TIER_ICON[t] + '</i>' + TIER_SHORT[t] + '</span>';
  }
  /* 由条目 id 派生一个稳定的验证串：真实实现由服务端签发，这里只是演示 */
  /* 外链条目（tier=link）本来就没有登记版本号，直接拼 'v' + '' 会在页面上留下一个孤零零的 v。 */
  function verTxt(p, empty) {
    return p && p.ver ? 'v' + esc(p.ver) : (empty || '外链');
  }

  function vcode(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) >>> 0;
    return 'jingyu-verify-' + ('000000' + h.toString(16)).slice(-6);
  }

  /* 作者栏的一个小标签：谁给的这个包 */
  function sourceNote(p) {
    const t = tierOf(p), m = mirrorOf(p);
    if (t !== 'pack') return '';
    /* 只描述「信息是谁登记的、跟不跟上游」，不暗示本站手里有文件 */
    if (p.source === 'author') return m === 'auto' ? '作者登记 · 跟随上游' : '作者登记 · 手动更新';
    return '社群登记转载信息';
  }

  function plugInline(pid) {
    const p = pluginOf(pid);
    if (!p) return '';
    return '<div class="plug-inline" data-act="pl" data-id="' + p.id + '">' +
      '<div class="pi-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="pi-tx"><b>' + esc(p.name) + ' <span style="font-weight:500;color:var(--txt-3)">' + verTxt(p) + '</span></b>' +
      '<span>' + tierBadge(p, true) + '<i style="font-style:normal;color:var(--txt-3)">' + esc(sourceNote(p) || '认领后可维护版本') + '</i></span></div>' +
      '<span class="pi-go">查看条目 ›</span></div>';
  }

  /* ---------- 条目页 ---------- */
  /* v38 · 进插件页统一回到仓库首页：标签 / 展开的文件 / 获取面板 / 议题筛选
     都是「这一次浏览」的临时姿势，从别处点进来不该接着上次那一页。 */
  function resetEntryView(tab) {
    S.entryTab = ENTRY_TABS.indexOf(tab) >= 0 ? tab : 'code';
    S.ghGet = false;
    S.ghFile = '';
    S.ghFileQ = '';
    S.ghIssueOpen = '';
    S.ghIssueFilter = 'open';
    S.ghReadmeTab = 'readme';
    S.ghRel = '';
  }
  /* Releases 页的 tag 来自渲染器的同一份版本账本；地址栏校验和侧栏按钮都走这里，
     避免 app.js 再复制一套版本号生成逻辑。 */
  function releaseTags(pid) {
    var p = pluginOf(pid);
    if (!p || !window.PluginPage || typeof window.PluginPage.releases !== 'function') return [];
    return window.PluginPage.releases(p) || [];
  }
  /* 条目不存在（下架 / 链接写错 / 后端还没同步）时的落点。
     以前 pluginOf() 会回落成 plugins[0]；后端 plugins 为空时直接 undefined，
     紧接着 userOf(p.author) 抛错，整页只剩启动骨架。 */
  function entryMissing(id) {
    return '<div class="wrap solo"><div class="card"><div class="empty">' +
      '<span class="big">🧩</span>' +
      '<h2 style="font-size:17px;margin:6px 0 8px">没有找到这个插件条目</h2>' +
      '<p style="color:var(--txt-3);font-size:13px;margin:0 0 4px">编号 <code>' + esc(String(id || '')) + '</code> 可能已经下架，或者链接里的编号不对。</p>' +
      '<p style="color:var(--txt-3);font-size:12px;margin:0 0 18px">条目库里的其它插件都还在。</p>' +
      '<button class="btn sm blue" data-act="go" data-route="market">去条目库看看</button>' +
      '</div></div></div>';
  }

  /* 被下架 / 驳回的条目：说清楚「为什么看不到」以及「还能怎么办」。
     三种状态写成三种话：待审是「还没上架」，驳回是「不收录」，下架是「已撤下」。
     共用一套版式，但文案分别写 —— 把三种情况糊成一句「不存在」，
     作者会以为是自己链接写错了，然后反复来问。 */
  const GONE_TITLE = {
    pending: '这个条目还在审核中',
    rejected: '这个条目没有被收录',
    hidden: '这个条目已经被下架'
  };
  const GONE_NOTE = {
    pending: '管理员还没有处理它。审核通过后它会重新出现在条目库，编号不变。',
    rejected: '它不符合本站的收录规则，因此不再展示。原因见下方说明（如有）。',
    hidden: '它因投诉、内容风险或作者要求被撤下。作者可以直接联系我们要求复核。'
  };
  function entryHidden(p) {
    const st = p.status || 'hidden';
    const note = p.reviewNote || p.why || '';
    return '<div class="wrap solo"><div class="card"><div class="empty">' +
      '<span class="big">🔒</span>' +
      '<h2 style="font-size:17px;margin:6px 0 8px">' + esc(GONE_TITLE[st] || GONE_TITLE.hidden) + '</h2>' +
      '<p style="color:var(--txt-3);font-size:13px;margin:0 0 6px">' + esc(GONE_NOTE[st] || GONE_NOTE.hidden) + '</p>' +
      '<p style="color:var(--txt-3);font-size:12px;margin:0 0 6px">条目 <code>' + esc(p.pkg || p.name || '') + '</code>' +
        (note ? ' · 说明：' + esc(note) : '') + '</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
        '<button class="btn sm blue" data-act="go" data-route="market">回条目库</button>' +
        '<button class="btn sm ghost" data-act="go" data-route="policy">转载与下架政策</button>' +
      '</div>' +
      '</div></div></div>';
  }
  function entryPage(id) {
    const p = pluginOf(id);
    if (!p) return entryMissing(id);
    /* 已经被后台下架 / 驳回的条目：不给下载入口、不给认领按钮，只留一句话说明。
       为什么必须拦在这里而不是只在列表里过滤：链接会被分享、被搜索引擎收录，
       直接访问 #/plugin/<id> 是真实存在的路径；只在列表里隐藏等于「分享出去的链接仍能取包」。 */
    if (p.status && p.status !== 'published') return entryHidden(p);
    /* 插件作者可能是服务端账号（不在演示 users 表里），直取会拿到 undefined */
    const u = userOf(p.author);
    /* v38：28 个插件共用 js/plugin-page.js 的 GitHub 仓库风格渲染器。
       模块没加载或渲染抛错时静默回落到下面这套旧三栏，页面不会因为一个
       新脚本 404 变成空白 —— 这也是「沿用现有结构」的兜底。 */
    if (window.PluginPage && typeof window.PluginPage.html === 'function') {
      try {
        const out = window.PluginPage.html({
          S: S, p: p, u: u, esc: esc, num: num, av: av,
          tierOf: tierOf, tierBadge: tierBadge, tierLabel: TIER_LABEL,
          claimedOf: claimedOf, mirrorOf: mirrorOf, repoHref: repoHref,
          reportPanel: reportPanel, dlBox: dlBox,
          threads: threads, posts: posts, userOf: userOf, pkgStats: pkgStats
        });
        if (typeof out === 'string' && out) return out;
      } catch (err) {
        console.warn('PluginPage 渲染失败，回落到旧条目页', err);
      }
    }
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      entryHero(p, u) + dlBox(p) + entryBody(p) + entryTalk(p) + '</div>' + entrySide(p, u) + '</div>';
  }

  function entryHero(p, u) {
    const t = tierOf(p);
    const cl = claimedOf(p);
    /* 有没有「能真的点开」的仓库，决定这一栏给链接还是给一句实话。
       以前无论有没有仓库都印「前往作者仓库 ↗」，点了只弹「演示站点」。 */
    const ru = repoHref(p.repo);
    return '<div class="entry-hero" style="--grad:' + p.grad + '">' +
      '<div class="eh-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="eh-main">' +
      '<h1 class="eh-name">' + esc(p.name) + tierBadge(p) + (cl ? '<span class="stamp ok">✓ 已认证</span>' : '') + '</h1>' +
      '<div class="eh-pkg">' + esc(p.pkg) + '<span style="opacity:.5">/</span><span class="eh-ver">' + verTxt(p) + '</span>' +
      '<span style="opacity:.5">·</span><span style="display:inline-flex;align-items:center;gap:5px">' + av(p.author, 18) + esc(u.name) + '</span>' +
      '<span class="tag-plain">' + esc(p.cat) + '</span></div>' +
      '<p class="eh-desc">' + esc(p.desc) + '</p>' +
      '<div class="eh-tags">' + p.tags.map(function (x) { return '<span class="tag-plain">#' + esc(x) + '</span>'; }).join('') +
      '<span style="font-size:11.5px;color:var(--txt-3)">最后更新 ' + esc(p.updated) + '</span></div>' +
      '<div class="eh-stat"><span>★ <b>' + num(p.stars) + '</b></span><span>⤓ <b>' + num(p.installs) + '</b> 次安装</span>' +
      '<span>收录于 <b>' + esc(p.collected) + '</b></span>' +
      '<span>许可证 <b>' + (p.license ? esc(p.license) : '未标注') + '</b></span></div>' +
      '</div>' +
      '<div class="eh-acts">' +
      (ru
        ? '<a class="btn ghost" href="' + esc(ru) + '" target="_blank" rel="noopener noreferrer nofollow">前往作者仓库 ↗</a>'
        : '<button class="btn ghost" data-act="toast" data-msg="作者没有登记仓库地址，这个条目目前没有下载渠道">暂无下载渠道</button>') +
      (t === 'pack' && p.file
        ? (releasesHref(ru)
          ? '<a class="btn" href="' + esc(releasesHref(ru)) + '" target="_blank" rel="noopener noreferrer nofollow">去 Releases 取包 ↗</a>'
          : '<button class="btn" data-act="toast" data-msg="包信息已登记，但作者没有填仓库地址，现在没有可取的来源">包信息（无来源）</button>')
        : '') +
      (cl
        ? '<button class="btn ghost" data-act="go" data-route="upload" data-id="' + p.id + '">上传新版本</button>'
        : '<button class="btn ghost" data-act="go" data-route="claim" data-id="' + p.id + '">我是作者，认领</button>') +
      '<button class="btn ghost' + (S.favPlug.has(p.id) ? ' faved' : '') + '" data-act="favany" data-kind="plug" data-id="' + p.id + '">' +
        (S.favPlug.has(p.id) ? '★ 已收藏' : '☆ 收藏') + '</button>' +
      '</div></div>';
  }

  /* 作者仓库的 Releases 页：没有仓库就返回空串，调用处据此换成一句实话 */
  function releasesHref(repoUrl) {
    return repoUrl ? repoUrl.replace(/\/+$/, '') + '/releases' : '';
  }

  /* 三步走完就能装上：下载 → 核对 sha256 → 本地安装。
     以前只印一句「拿到包之后本地安装」，既没说去哪拿，也没给校验命令，
     还要求比对 12 位截断的 sha —— 等于让人自己猜。 */
  function dlSteps(p) {
    const f = p.file;
    if (!f) return '';
    const rel = releasesHref(repoHref(p.repo));
    const name = esc(f.name);
    return '<ol class="dl-steps">' +
      '<li><b>下载</b>' + (rel
        ? ' 打开 <a href="' + esc(rel) + '" target="_blank" rel="noopener noreferrer nofollow">作者 Releases</a>，取 <code>' + name + '</code>（' + esc(f.size) + '）。'
        : ' 作者没有登记仓库地址，暂时没有地方可取这个包。') + '</li>' +
      '<li><b>核对</b> 在文件所在目录执行 <code>certutil -hashfile ' + name + ' SHA256</code>（Windows）或 <code>sha256sum ' + name + '</code>（macOS / Linux），结果应等于 <button type="button" class="sha-full" data-act="sha" data-sha="' + esc(f.sha) + '" title="点击复制完整 sha256"><span class="sha-hex">' + esc(String(f.sha).slice(0, 16)) + '…</span><span class="sha-more">（64 位，点这复制）</span></button>。</li>' +
      '<li><b>安装</b> 同一个目录执行 <code>pnpm dsh add ./' + name + '</code>；前面的 <code>./</code> 别省。</li>' +
      '</ol>';
  }

  /* 下载区三态：已登记包 / 外链 / 仅条目 —— 只有这一块会变，其余版式一致。
     注意「已登记包」不代表本站托管文件：能点的只有作者仓库的 Releases。 */
  function dlBox(p) {
    const t = tierOf(p);
    const cl = claimedOf(p);
    const m = mirrorOf(p);
    const f = p.file;
    /* 「未声明」以前写的是「（不可转载）」—— 法律上没许可证确实是默认保留所有权利，
       但那是给站长的免责说明，不是给访客的操作指引。现在改成中性陈述 + 直达仓库 LICENSE 原文：
       我们抓过这个仓库的规范文档，有原文就直接看，没有原文再回落到作者仓库。 */
    const licTxt = /^custom$/i.test(p.license || '') ? '自定义许可' : p.license;
    const lic = p.license
      ? '<a href="#/plugin/' + esc(p.id) + '/license">' + esc(licTxt) + ' · 原文 ↗</a>'
      : '<span class="lic-none">仓库未标注</span> <a class="lic-doc" href="#/plugin/' + esc(p.id) + '/license">看 LICENSE 原文 ↗</a>';
    const repoUrl = repoHref(p.repo);
    const repo = repoUrl
      ? '<a href="' + esc(repoUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(p.repo) + ' ↗</a>'
      : (p.repo ? '<span>' + esc(p.repo) + '</span>' : '<span>—</span>');
    let body = '';

    if (t === 'pack' && f) {
      const byAuthor = p.source === 'author';
      const rel = releasesHref(repoUrl);
      /* 能给真链接就给真链接：本站不托管文件，按钮再叫「查看获取方式」也只是
         展开一句「去作者仓库」，不如一步到位，直接把人送到 Releases。 */
      body += (rel
        ? '<a class="btn dl-btn" href="' + esc(rel) + '" target="_blank" rel="noopener noreferrer nofollow">去作者 Releases 取包 ↗</a>'
        : '<div class="dl-none">包信息已经登记（' + esc(f.name) + ' · ' + esc(f.size) + '），但作者没有填仓库地址，现在没有可取到文件的地方。</div>') +
        '<div class="dl-info"><span class="sha" data-act="sha" data-sha="' + esc(f.sha) + '" title="点击复制完整 sha256（64 位）">sha256 ' + esc(String(f.sha).slice(0, 12)) + '…</span>' +
        '<span>登记于 ' + esc(f.at) + '</span><span>' + esc(byAuthor ? '由作者登记' : '社群收录时登记') + '</span></div>' +
        dlSteps(p);
    } else if (t === 'pack' && !f) {
      body += '<div class="dl-none">这个条目还没有登记安装包信息，也没有可下载的文件。作者认领并登记后这里才会有内容。</div>';
    } else if (t === 'link') {
      body += (repoUrl
        ? '<a class="btn dl-btn" href="' + esc(repoUrl) + '" target="_blank" rel="noopener noreferrer nofollow">去作者仓库下载 ↗</a>'
        : '<div class="dl-none">这个条目只登记了信息，没有包、也没有仓库地址，所以现在没有下载渠道。</div>') +
        '<div class="dl-why">' + esc(p.why || '只登记包信息与仓库地址，文件在作者仓库。') + '</div>';
    } else {
      body += '<div class="dl-none">暂无可用的下载渠道，若你知道，欢迎补充。</div>' +
        '<div class="dl-why">' + esc(p.why || '没有明确授权，本站既不放包也不代转载。') + '</div>';
    }

    /* 未认领的条目：给作者一条自助路径 */
    if (!cl) {
      body += '<div class="dl-ask">🪪 这是社群整理的条目。如果你是作者，认领后可以上传最新版、维护版本信息与许可证。' +
        '<button data-act="go" data-route="claim" data-id="' + p.id + '">去认领 →</button></div>';
    }

    body += '<div class="dl-links"><i>原仓库</i>' + repo + '<i>许可证</i>' + lic + '<i>收录于</i>' + esc(p.collected) + '</div>';

    /* 说明文字也必须是真的：本站既不托管包、也没有转存链路。
       有文件的三步说明已经在 dlSteps 里写全，这里只管「只有文字信息」的情形。 */
    if (t === 'pack' && !f) {
      body += '<div class="dl-note">这个条目只有文字信息，没有安装包文件' +
        (repoUrl ? '，取包请到作者仓库。' : '，也没有仓库地址。') +
        '若你是作者并要求下架，<a href="javascript:;" data-act="go" data-route="policy">按这里申请</a>，24 小时内处理。</div>';
    }

    body += '<div class="dl-rep">发现侵权、恶意代码或信息失实？<button data-act="rep" data-id="' + p.id + '">举报</button></div>' + reportPanel(p);

    return '<div class="dl-box" data-tier="' + t + '">' +
      '<div class="dl-hd"><span class="t">' + (t === 'pack' && f ? '获取安装包' : '下载渠道') + '</span>' + tierBadge(p) +
      '<span class="dl-tier-full">' + TIER_LABEL[t] + '</span></div>' + body + '</div>';
  }

  function reportPanel(p) {
    if (S.rep !== p.id) return '';
    const sel = S.repT[p.id];
    const cur = reportTypes.filter(function (r) { return r.id === sel; })[0];
    /* 面板里必须能写清「具体是哪里侵权 / 哪段代码可疑」。只有四个固定按钮时，
       处理人拿到的信息只有「有人说这包有问题」，没法判断也不够留档。
       两个输入都是可选：不给说明也能提交，给了就更可能被优先处理。 */
    return '<div class="rp-box"><div class="rp-t">举报这个条目 / 安装包</div>' +
      '<div class="rp-d">提交后会生成一条带编号的记录，我们能追溯处理过程与结论。' +
      '同一台设备十分钟内重复提交同一个条目会合并为同一条。</div>' +
      '<div class="rp-list">' + reportTypes.map(function (r) {
        return '<button class="rp-opt ' + (sel === r.id ? 'on' : '') + '" data-act="rpt" data-id="' + p.id + '" data-t="' + r.id + '" title="' + esc(r.d) + '">' + esc(r.t) + '</button>';
      }).join('') + '</div>' +
      (cur ? '<div class="dl-why" style="margin-top:9px">已选：<b style="color:var(--txt)">' + esc(cur.t) + '</b> —— ' + esc(cur.d) + '</div>' +
        '<div style="margin-top:10px">' +
          '<textarea class="rp-in" data-act="rpd" data-id="' + p.id + '" maxlength="1000" rows="3" ' +
            'placeholder="补充说明：具体哪一部分出了问题？（可选，最多 1000 字）" ' +
            'style="width:100%;box-sizing:border-box;resize:vertical;font:inherit;padding:8px 10px;border-radius:10px">' +
            esc(S.repD[p.id] || '') + '</textarea>' +
        '</div>' +
        '<div style="margin-top:8px">' +
          '<input class="rp-in" data-act="rpc" data-id="' + p.id + '" maxlength="120" type="text" ' +
            'placeholder="联系方式，便于回访（可选）" value="' + esc(S.repC[p.id] || '') + '" ' +
            'style="width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border-radius:10px">' +
        '</div>' +
        '<div style="margin-top:9px"><button class="btn sm" data-act="rpsend" data-id="' + p.id + '">提交举报</button></div>' : '') +
      '</div>';
  }

  /* 真正的举报提交。三条必须做到的事：
     ① 必须落库（流水号回到用户手里，之后才可能对账）；
     ② 按钮给人看得见的「提交中」，否则用户会连点，服务端限流 5 次/10 分钟会把他当脚本；
     ③ 失败要按错误码说人话 —— TOO_MANY 与 NETWORK 对用户是两件完全不同的事。
     举报对象目前只有条目页接了这条路径（targetType 固定 plugin），其它位置的举报入口
     一律导向条目页，不再自己发请求：散落各处各发一次，等于把同一份判断逻辑抄很多遍。 */
  function submitReport(pid, el) {
    const p = pluginOf(pid) || {};
    const reason = S.repT[pid] || '';
    const reasonObj = reportTypes.filter(function (r) { return r.id === reason; })[0];
    if (!reason) { toast('先选一个举报理由', '🚩'); return; }
    if (!window.API || !API.report) {
      toast('举报通道没连上服务端，请稍后再试', '⚠️');
      return;
    }
    const detail = String(S.repD[pid] || '').slice(0, 1000);
    const contact = String(S.repC[pid] || '').slice(0, 120);
    const label = el ? el.textContent : '';
    if (el) { el.disabled = true; el.textContent = '提交中…'; }
    API.report({
      targetType: 'plugin',
      targetId: p._id || 0,
      reason: reason,
      detail: detail,
      contact: contact
    }).then(function (r) {
      const id = r && r.id ? r.id : 0;
      S.rep = null;
      S.repT[pid] = '';
      S.repD[pid] = '';
      S.repC[pid] = '';
      toast('举报已提交' + (id ? '，编号 #' + id : '') + (reasonObj ? '（' + reasonObj.t + '）' : '') + '，我们会在 24 小时内处理', '🚩');
      render(true);
    }, function (err) {
      if (el) { el.disabled = false; el.textContent = label || '提交举报'; }
      const code = (err && err.code) || '';
      let msg = (err && err.message) || '提交失败，请稍后再试';
      if (code === 'TOO_MANY') msg = '提交太频繁了，过几分钟再试';
      else if (code === 'NOT_AUTHED') msg = '这条举报需要先登录，登录后再提交一次';
      else if (code === 'NOT_FOUND') msg = '这个条目已经不在了，刷新看一下';
      toast(msg, '⚠️');
    });
  }

  function entryBody(p) {
    const t = tierOf(p);
    const f = p.file;
    const cmd = t === 'pack' && f ? 'pnpm dsh add ./' + f.name : 'pnpm dsh add ' + p.pkg;
    return '<div class="card"><div class="card-hd"><h2 class="t">条目正文</h2>' +
      '<span class="more">正文由社群编辑，版本 / 许可证 / 下载由作者维护</span></div><div class="card-bd">' +
      '<div class="doc-sec"><h2>这个插件做什么</h2>' +
      '<p>' + esc(p.desc) + '</p>' +
      '<ul class="doc-ul"><li>分类：' + esc(p.cat) + '，标签 ' + p.tags.map(function (x) { return '#' + esc(x); }).join(' ') + '。</li>' +
      '<li>维护者：' + esc(userOf(p.author).name) + (claimedOf(p) ? '（仓库已认证，能维护版本与下载）' : '（条目由社群整理，作者尚未认领）') + '。</li>' +
      '<li>想改简介、用法、常见问题？认领之外的正文段落欢迎编辑者补充。</li></ul></div>' +
      '<div class="doc-sec"><h2>安装</h2>' +
      '<div class="doc-code">' + esc(cmd) + '</div>' +
      '<p class="doc-note">一行就够，命令前面的 <code>./</code> 别省。也可以把包解压到 DSH 的插件目录后重启。</p></div>' +
      '<div class="doc-sec"><h2>常见问题</h2>' +
      '<ul class="doc-ul">' +
      '<li><b>装完没反应？</b>确认 DSH 版本与插件声明的兼容范围一致，再重启一次会话。</li>' +
      '<li><b>能和别的插件共存吗？</b>看功能有没有重叠（同名命令、同一个端口、同一个缓存目录）。</li>' +
      '<li><b>包是从哪来的？</b>' + (t === 'pack' ? (p.source === 'author' ? '包信息由作者登记，文件放在作者仓库，本站不托管安装包。' : '包信息来自早年收录的转载登记，文件仍在原仓库，本站不托管安装包。') : '本站不存包，只链到作者仓库。') + '</li>' +
      '</ul></div>' +
      '</div></div>';
  }

  function entryTalk(p) {
    const rel = threads.filter(function (x) { return x.plugin === p.id; });
    const feed = posts.filter(function (x) { return x.plugin === p.name; });
    if (!rel.length && !feed.length) {
      return '<div class="card"><div class="card-hd"><span class="t">社群讨论</span></div>' +
        '<div class="empty"><span class="big">💬</span>还没有人聊过这个插件，去社群开个帖吧</div></div>';
    }
    return '<div class="card"><div class="card-hd"><span class="t">社群讨论</span>' +
      '<span class="more" data-act="go" data-route="forum">去社群 ›</span></div>' +
      (rel.length ? '<div>' + rel.map(threadRow).join('') + '</div>' : '') +
      (feed.length ? '<div class="card-bd" style="padding:12px 16px"><div class="muted" style="font-size:11.5px;margin-bottom:7px">相关更新</div>' +
        feed.map(function (x) {
          return '<div class="hot-item" data-act="toast" data-msg="演示站点：日志详情未展开"><span class="sp-ico" style="width:26px;height:26px;border-radius:8px;font-size:13px;background:' + userOf(x.user).grad + '">' + userOf(x.user).emoji + '</span>' +
            '<span class="hx"><b>' + esc(x.text.slice(0, 34)) + (x.text.length > 34 ? '…' : '') + '</b><span>' + esc(userOf(x.user).name) + ' · ' + esc(x.time) + '</span></span></div>';
        }).join('') + '</div>' : '') +
      '</div>';
  }

  function entrySide(p, u) {
    const st = pkgStats[p.id];
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">作者</span>' +
      (claimedOf(p) ? '<a href="javascript:;" data-act="go" data-route="claim" data-id="' + p.id + '">已认领</a>' : '<a href="javascript:;" data-act="go" data-route="claim" data-id="' + p.id + '">去认领</a>') + '</div>' +
      '<div class="side-bd"><div style="display:flex;gap:10px;align-items:center">' + av(p.author, 44) +
      '<div><div style="font-weight:700;font-size:13.5px">' + esc(u.name) + '</div>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(u.badge || '普通用户') + '</div></div></div>' +
      '<div style="font-size:12.5px;color:var(--txt-2);margin-top:9px;line-height:1.6">' + esc(u.sig) + '</div>' +
      '<button class="btn sm blue" style="width:100%;margin-top:10px" data-act="user" data-uid="' + p.author + '">进入 TA 的空间</button></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">收录信息</span></div><div class="side-bd">' +
      '<dl class="kv"><dt>收录档位</dt><dd>' + TIER_SHORT[tierOf(p)] + '</dd>' +
      '<dt>收录日期</dt><dd>' + esc(p.collected) + '</dd>' +
      '<dt>许可证</dt><dd>' + (p.license ? esc(/^custom$/i.test(p.license) ? '自定义许可' : p.license) : '<span class="lic-none">仓库未标注</span>') + '</dd>' +
      '<dt>原仓库</dt><dd style="word-break:break-all">' + esc(p.repo) + '</dd>' +
      (p.file ? '<dt>文件</dt><dd style="word-break:break-all">' + esc(p.file.size) + '</dd><dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + p.file.sha.slice(0, 24) + '…</dd>' : '') +
      '</dl>' +
      (st ? '<div class="trend-lb" style="margin-top:12px"><span>近 7 天安装</span><span>' + num(st.downloads) + ' 次</span></div>' +
        '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">收录与下架</span></div><div class="side-bd">' +
      '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.7">我们转载什么、怎么转载、怎么下架，全写在政策页里，没有弹窗。</div>' +
      '<button class="btn sm ghost" style="width:100%;margin-top:10px" data-act="go" data-route="policy">查看转载与下架政策</button></div></div>' +
      '</aside>';
  }

  /* ---------- 认领页 ---------- */
  function cl0(p) { return !!(p && (p.claimed || (S.claimed && S.claimed.has && S.claimed.has(p.id)))); }

  function claimPage(id) {
    const p = pluginOf(id);
    const tk = S.ctok[p.id] || '';
    /* 进认领页自动要一次验证串：省掉「先点按钮」这一步，但仍由服务端签发（前端不编）。 */
    if (!tk && !cl0(p) && ME() && isSrvUid(ME()) && p._id && !S.ctokReq[p.id]) {
      S.ctokReq[p.id] = 1;
      window.API.claimChallenge(p._id).then(function (r) {
        if (r && r.token) { S.ctok[p.id] = r.token; render(false); }
      }, function () { S.ctokReq[p.id] = 0; });
    }
    const u = userOf(p.author);
    const cl = claimedOf(p);
    const mt = claimMethods.filter(function (x) { return x.id === S.vt; })[0] || claimMethods[0];
    const vs = S.vs[p.id] || null;
    const m = mirrorOf(p);
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="claim-hero">' +
      '<div class="ch-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="ch-tx"><h1>' + esc(p.name) + (cl ? '<span class="stamp ok">✓ 仓库已认证</span>' : '<span class="stamp wait">未认领</span>') + '</h1>' +
      '<p>认领后你可以维护这个条目的版本、许可证与下载，正文仍由社群编辑。</p></div>' +
      '<button class="btn sm ghost" data-act="pl" data-id="' + p.id + '">返回条目</button></div>' +

      (cl ? '' : (tk
        ? '<div class="dl-outdated">🔐 下面的验证串是你这次认领的凭证（24 小时内有效，只绑这个条目和你）。把它写进仓库后点「开始验证」，平台会去读仓库公开内容核对。</div>'
        : '<div class="dl-outdated">🔐 认领要证明这个仓库归你：先点「获取验证串」拿一串码，写进仓库的 ' + esc(mt.where) +
          '，再回来点验证。服务端只读公开内容，不要你任何 token。</div>')) +

      '<div class="card"><div class="claim-tabs">' + claimMethods.map(function (x) {
        return '<button class="claim-tab ' + (S.vt === x.id ? 'on' : '') + '" data-act="claimtab" data-id="' + p.id + '" data-t="' + x.id + '"' +
          (x.id === 'gist' ? ' title="需要 GitHub OAuth，暂未开放"' : '') + '>' +
          x.icon + ' ' + esc(x.name) + (x.id === 'gist' ? '<span class="stamp wait" style="margin-left:6px">未开放</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="claim-pane">' +
      '<p class="claim-lead">' + esc(mt.desc) + (mt.id === 'gist'
        ? '这条要 GitHub OAuth 才能确认 Gist 归属，服务端还没开；先用 README 或 Issue。'
        : '验证串放在<b>' + esc(mt.where) + '</b>，' + esc(mt.ttl) + '。') + '</p>' +
      '<div class="verify-str"><code>' + (tk ? esc(tk) : '点右边按钮生成验证串') + '</code>' +
      (tk
        ? '<button class="btn sm ghost" data-act="copyv" data-v="' + esc(tk) + '">复制验证串</button>'
        : '<button class="btn sm ghost" data-act="claimtok" data-id="' + p.id + '">获取验证串</button>') + '</div>' +
      '<div class="dl-why">' + (tk
        ? '写进仓库后点下面的「我已添加，开始验证」；平台会回读 README / issue 里的这串码，命中才把条目归到你名下。'
        : '验证串由服务端生成并和你的账号绑定，不会重复用别人的。') + '</div>' +
      '<ol class="claim-steps">' + mt.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="claim-act"><button class="btn" data-act="claimverify" data-id="' + p.id + '">' +
      (cl ? '重新验证' : '我已添加，开始验证') + '</button>' +
      '<span style="font-size:11.5px;color:var(--txt-3)">验证只读仓库公开内容，不会要你的 token</span></div>' +
      verifyBox(mt, vs) +
      '</div></div>' +

      permCard() +
      (cl ? grantBox(p, m) : '') +
      (cl ? maintainCard(p) : '') +
      '</div>' + claimSide(p, u) + '</div>';
  }

  function verifyBox(mt, vs) {
    if (!vs) return '';
    if (vs.state === 'work') return '<div class="vf-box work"><span class="vf-ic">⏳</span><span>正在向服务端核验作者身份…</span></div>';
    if (vs.state === 'ok') return '<div class="vf-box ok"><span class="vf-ic">✅</span><span>' + esc(vs.note || '验证通过：仓库已绑定，你现在是这个条目的作者，可以上传版本、切换授权。') + '</span></div>';
    /* 失败原因以服务端返回的原因为准；mt.fail 只是「仓库里没找到验证串」那一种情况的兜底文案 */
    return '<div class="vf-box fail"><span class="vf-ic">⚠️</span><span>' + esc(vs.note || mt.fail) + '</span></div>';
  }

  function permCard() {
    return '<div class="card"><div class="card-hd"><span class="t">认领之后，谁管什么</span></div><div class="card-bd">' +
      '<div class="perm-grid">' +
      '<div class="perm-col"><div class="pc-t">✍️ 作者</div><ul><li>版本号与发布节奏</li><li>许可证声明</li><li>仓库地址与包信息（文件名 / 大小 / sha256）</li><li>兼容的 DSH 版本、是否含破坏性变更</li></ul></div>' +
      '<div class="perm-col"><div class="pc-t">🧑‍🤝‍🧑 社群编辑者</div><ul><li>简介与用法</li><li>常见问题与踩坑记录</li><li>截图、示例、相关话题</li><li>错别字与排版</li></ul></div>' +
      '</div><div class="perm-note">冲突时以事实字段为准：版本、许可证、包信息以作者为准，正文以编辑共识为准。作者关掉展示，取包入口立刻收起，条目本身保留。</div></div></div>';
  }

  function grantBox(p, m) {
    const on = m !== 'off';
    return '<div class="grant-box"><div class="gb-hd"><span class="gb-t">在条目页展示安装包信息</span>' +
      '<span class="gb-sw"><span>' + (on ? '已开启' : '未开启') + '</span>' +
      '<button class="sw ' + (on ? 'on' : '') + '" data-act="grant" data-id="' + p.id + '" aria-label="在条目页展示安装包信息"></button></span></div>' +
      (on
        ? '<div class="gb-body">' +
        '<div class="gb-opt ' + (m === 'auto' ? 'on' : '') + '" data-act="gmode" data-id="' + p.id + '" data-m="auto">' +
        '<span class="rd"></span><span class="gt"><b>跟随上游 tag <span class="rec">推荐</span></b>' +
        '<span>每 6 小时查一次新 tag，发现新版本就更新这一页的包名、大小与 sha256 提示。</span></span></div>' +
        '<div class="gb-opt ' + (m === 'manual' ? 'on' : '') + '" data-act="gmode" data-id="' + p.id + '" data-m="manual">' +
        '<span class="rd"></span><span class="gt"><b>仅手动登记</b>' +
        '<span>由你自己决定什么时候更新包名、大小与 sha256，适合发布节奏自己把控的插件。</span></span></div>' +
        '</div>' +
        '<div class="gb-note">开启后，条目页会显示包信息与「去作者 Releases 取包 ↗」按钮；文件始终在你的仓库，本站不复制、不缓存。</div>'
        : '<div class="gb-note">关掉只影响取包入口，条目本身保留。未开启时条目页不显示包信息。</div>') +
      '<div class="gb-note">随时可以关闭，关闭后 24 小时内撤掉取包入口。' +
      '<a href="javascript:;" data-act="go" data-route="policy">看分发规则</a></div></div>';
  }

  function maintainCard(p) {
    const st = pkgStats[p.id];
    return '<div class="card"><div class="card-hd"><span class="t">这个版本</span>' +
      '<span class="more" data-act="go" data-route="upload" data-id="' + p.id + '">上传新版本 ›</span></div><div class="card-bd">' +
      '<dl class="kv"><dt>当前版本</dt><dd>' + verTxt(p, '未登记（外链）') + '（收录于 ' + esc(p.collected) + '）</dd>' +
      '<dt>安装包</dt><dd>' + (p.file ? esc(p.file.name) + ' · ' + esc(p.file.size) : '还没有上传安装包') + '</dd>' +
      (p.file ? '<dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + p.file.sha + '</dd>' : '') +
      '</dl>' +
      (st ? '<div class="aw-stats"><div class="s"><b>' + num(st.downloads) + '</b><span>累计下载</span></div>' +
        '<div class="s"><b>' + num(st.week[6]) + '</b><span>昨日下载</span></div>' +
        '<div class="s"><b>' + st.issues + '</b><span>待处理问题</span></div></div>' +
        '<div class="trend-lb" style="margin-top:10px"><span>近 7 天</span><span>最高 ' + num(Math.max.apply(null, st.week)) + '</span></div>' +
        '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:13px"><button class="btn sm ghost" data-act="withdraw" data-id="' + p.id + '">撤回当前版本</button>' +
      '<span style="font-size:11.5px;color:var(--txt-3);margin-left:9px">撤回后立刻停止下载，条目保留</span></div>' +
      '</div></div>';
  }

  function claimSide(p, u) {
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">为什么是这三种验证</span></div><div class="side-bd">' +
      '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.78">三种方式都要求「只有仓库所有者能做到」，所以它证明的不是「你懂这个包」，而是「这个仓库是你的」。</div>' +
      '<ul class="doc-ul" style="margin-top:9px"><li>README 改完立刻生效，最省事</li><li>Issue 适合不想改仓库的人</li><li>Gist 适合仓库是别人名字但你是实际维护者</li></ul>' +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">条目现状</span></div><div class="side-bd">' +
      '<dl class="kv"><dt>当前档位</dt><dd>' + TIER_SHORT[tierOf(p)] + '</dd>' +
      '<dt>作者</dt><dd>' + esc(u.name) + '</dd>' +
      '<dt>许可证</dt><dd>' + (p.license ? esc(p.license) : '未声明') + '</dd>' +
      '<dt>收录日期</dt><dd>' + esc(p.collected) + '</dd></dl>' +
      '<button class="btn sm ghost" style="width:100%;margin-top:10px" data-act="pl" data-id="' + p.id + '">看条目页长什么样</button></div></div>' +
      '</aside>';
  }

  /* ---------- 上传页（作者控制台） ---------- */
  function uploadPage(id) {
    const p = pluginOf(id);
    const cl = claimedOf(p);
    if (!cl) {
      return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
        '<div class="card"><div class="card-hd"><h1 class="t">上传新版本</h1></div><div class="card-bd">' +
        '<div class="dl-none">这个条目还没被作者认领，上传入口不开放。</div>' +
        '<div class="dl-why">先证明仓库是你的，再传包。整个过程不需要你给 token，也不用手动填 sha。</div>' +
        '<div style="margin-top:14px"><button class="btn" data-act="go" data-route="claim" data-id="' + p.id + '">去认领这个条目 ›</button></div>' +
        '</div></div></div>' + claimSide(p, users[p.author]) + '</div>';
    }
    const up = S.up;
    const f = up.file;
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card"><div class="card-hd"><h1 class="t">上传新版本</h1>' +
      '<span class="more" data-act="pl" data-id="' + p.id + '">返回条目 ›</span></div><div class="card-bd">' +
      (f ? upFileCard(p, f) : '<div class="up-drop" data-act="updrop" data-id="' + p.id + '">' +
        '<div class="ud-ic">📦</div><div class="ud-t">把 .tgz 拖到这里，或点击选择</div>' +
        '<div class="ud-d">只收 .tgz / .zip，单个不超过 20 MB。演示站点会模拟解析 package.json 回显包名、版本与许可证。</div></div>') +
      (f ? upWarn(p, f) : '') +
      upForm(p, f) +
      '</div></div>' +
      authorStats(p) +
      '</div>' + claimSide(p, users[p.author]) + '</div>';
  }

  function upFileCard(p, f) {
    return '<div class="up-file"><div class="uf-ico">📦</div>' +
      '<div class="uf-tx"><b>' + esc(f.name) + '</b><span>' + esc(f.size) + ' · 解压后读到的 package.json：' + esc(f.pkg) + ' @ ' + esc(f.ver) + ' · license ' + esc(f.lic || '（无）') + '</span></div>' +
      '<button class="uf-x" data-act="upclear" title="移除">✕</button></div>' +
      '<dl class="up-meta"><dt>包名</dt><dd>' + esc(f.pkg) + '</dd><dt>版本</dt><dd>' + esc(f.ver) + '</dd>' +
      '<dt>许可证</dt><dd>' + (f.lic ? esc(f.lic) : '<span style="color:var(--rose-ink)">未声明</span>') + '</dd>' +
      '<dt>sha256</dt><dd class="mono">' + esc(f.sha) + '</dd></dl>';
  }

  function upWarn(p, f) {
    let out = '';
    if (f.pkg !== p.pkg) {
      out += '<div class="up-warn">⚠️ 包名对不上：这个包叫 <b>' + esc(f.pkg) + '</b>，条目是 <b>' + esc(p.pkg) + '</b>。传错包会污染别人的条目，再确认一次。</div>';
    }
    if (f.ver === p.ver) {
      out += '<div class="up-warn">⚠️ 版本号已存在：v' + esc(p.ver) + ' 已经在库里了，提交会覆盖现有文件并留档。</div>';
    }
    return out;
  }

  function upForm(p, f) {
    const up = S.up;
    const compat = ['0.9.x', '1.0.x', '1.1.x', 'dev 分支'];
    const ready = f && up.compat.length && up.agreed.length === grantTerms.length;
    if (up.stage === 'review') {
      return '<div class="verdict" data-t="link"><div class="vh">✅ 已提交，正在等人工审核</div>' +
        '<dl class="rows"><dt>文件</dt><dd>' + esc(f.name) + '（' + esc(f.size) + '）</dd>' +
        '<dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + esc(f.sha) + '</dd>' +
        '<dt>安全扫描</dt><dd>通过（无 child_process 外连、无混淆、无挖矿特征）</dd>' +
        '<dt>下一步</dt><dd>人工复核后上架，通常 1 个工作日内</dd></dl>' +
        '<div class="tip good">上架后条目页会显示「作者提供」标签、文件名、大小、sha256 与上传时间，你也能撤回。</div></div>' +
        '<div class="form-act" style="margin-top:14px"><button class="btn sm ghost" data-act="upreset">再传一个</button></div>';
    }
    return '<div class="form-grid" style="margin-top:16px">' +
      '<div class="form-row wide"><label>适用 DSH 版本<span class="req">*</span></label>' +
      '<div class="pick-row">' + compat.map(function (c) {
        return '<button class="pick ' + (up.compat.indexOf(c) >= 0 ? 'on' : '') + '" data-act="upver" data-v="' + c + '">' + c + '</button>';
      }).join('') + '</div><div class="hint">多选，至少一个。装到不在范围内的版本上，出问题不好排查。</div></div>' +
      '<div class="form-row wide"><label>是否含破坏性变更<span class="req">*</span></label>' +
      '<div class="pick-row">' + ['没有', '有，已在说明里写清'].map(function (c) {
        return '<button class="pick ' + (up.breaking === c ? 'on' : '') + '" data-act="upbreak" data-v="' + c + '">' + c + '</button>';
      }).join('') + '</div></div>' +
      '<div class="form-row wide"><label>变更说明</label>' +
      '<textarea id="upnote" placeholder="这一版改了什么、要读者注意什么。破坏性变更请写清迁移方式。" rows="3"></textarea>' +
      '<div class="hint">会显示在条目页的版本记录里。</div></div>' +
      '<div class="form-row wide"><label>授权条款<span class="req">*</span></label>' +
      grantTerms.map(function (t, i) {
        return '<button class="chk ' + (up.agreed.indexOf(i) >= 0 ? 'on' : '') + '" data-act="chk" data-i="' + i + '">' +
          '<span class="bx"></span><span>' + esc(t) + '</span></button>';
      }).join('') +
      '<div class="hint">五条都要勾。勾了就是书面授权，撤回随时可以。</div></div>' +
      '</div>' +
      '<div class="form-act"><button class="btn" data-act="upsubmit" data-id="' + p.id + '" ' + (ready ? '' : 'disabled') + '>提交审核</button>' +
      '<span class="hint" style="font-size:11.5px;color:var(--txt-3)">' + (ready ? '提交后自动扫描，通过进人工审核' : '还差：' + (!f ? '选择安装包 · ' : '') + (!up.compat.length ? '适用版本 · ' : '') + (up.agreed.length !== grantTerms.length ? '授权条款（' + up.agreed.length + '/' + grantTerms.length + '）' : '') + '') + '</span></div>';
  }

  function authorStats(p) {
    const st = pkgStats[p.id];
    if (!st) {
      return '<div class="card"><div class="card-hd"><span class="t">作者可见数据</span></div>' +
        '<div class="empty"><span class="big">📈</span>这个条目还没有下载数据</div></div>';
    }
    return '<div class="card"><div class="card-hd"><span class="t">作者可见数据</span><span class="more">只有作者看得到</span></div><div class="card-bd">' +
      '<div class="aw-stats"><div class="s"><b>' + num(st.downloads) + '</b><span>累计安装</span></div>' +
      '<div class="s"><b>' + num(st.week[6]) + '</b><span>昨日</span></div>' +
      '<div class="s"><b>' + st.issues + '</b><span>待处理问题</span></div></div>' +
      '<div class="trend-lb" style="margin-top:12px"><span>近 7 天安装</span><span>最高 ' + num(Math.max.apply(null, st.week)) + '</span></div>' +
      '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:11px;line-height:1.65">安装次数只做趋势参考：本站不跟踪装完之后的行为，也不埋点。</div>' +
      '</div></div>';
  }

  /* ---------- 转载与下架政策页 ---------- */
  /* 把 AUTH 抛出的错误翻译成「面板顶部的提示 + 下一步按钮」。
     错误对象里带了 code，未注册时还要顺手把用户推到注册 tab —— 只报错不给出路是最糟的反馈。 */
  function authErrOf(err, isReg) {
    const code = (err && err.code) || 'UNKNOWN';
    const msg = (err && err.message) || '操作没有完成，请重试';
    if (code === 'NOT_REGISTERED') return { msg: msg, act: 'register' };
    /* 同一账号在别处登录：服务端会带 canTakeover，给一个「顶掉那边」的按钮，
       而不是让用户对着「已在别处登录」四个字干瞪眼。 */
    /* v46：多端同时在线之后，这条只会在「同一台设备」上出现 —— 提示里点名是手机还是电脑 */
    if (code === 'ALREADY_ONLINE') {
      return { msg: msg, act: err && err.canTakeover ? 'takeover' : '', label: (err && err.label) || '这台设备' };
    }
    if (code === 'ALREADY_AUTHED') return { msg: msg, act: 'logout' };
    if (code === 'AUTH_LOCKED') return { msg: msg, act: 'logout' };
    if (code === 'NOT_AUTHED') return { msg: msg, act: 'login' };
    if (code === 'BAD_CREDENTIALS') return { msg: msg, act: isReg ? 'login' : '' };
    if (code === 'EMAIL_TAKEN') return { msg: msg, act: 'login' };
    return { msg: msg };
  }
  /* 「我跳过手机号了」记在 localStorage：否则每次登录都又落在认证页，用户得反复点跳过。
     只影响登录后的落地页，不影响服务端（服务端本来就不强制），也不隐藏设置页里的补认证入口。 */
  const SKIP_PHONE_KEY = 'dsh-forum-skip-phone';
  function skipPhoneSaved() {
    try { return localStorage.getItem(SKIP_PHONE_KEY) === '1'; } catch (err) { return false; }
  }
  function markSkipPhone(on) {
    try { if (on) localStorage.setItem(SKIP_PHONE_KEY, '1'); else localStorage.removeItem(SKIP_PHONE_KEY); } catch (err) {}
  }

  /* 验证码冷却倒计时：只在验证页活着时跑，离开页面就自己停，
     不留下一个改 S 的僵尸定时器。 */
  let phoneTimer = null;
  function tickPhoneCool() {
    if (phoneTimer) { clearInterval(phoneTimer); phoneTimer = null; }
    if (S.phoneCool <= 0) return;
    phoneTimer = setInterval(function () {
      S.phoneCool = Math.max(0, S.phoneCool - 1);
      const btn = qs('[data-act="phsend"]');
      if (S.route !== 'verify' || !btn) { clearInterval(phoneTimer); phoneTimer = null; return; }
      btn.textContent = S.phoneCool > 0 ? S.phoneCool + ' 秒后重发' : '获取验证码';
      btn.disabled = S.phoneCool > 0;
    }, 1000);
  }

  /* ---------- v17 · 登录 / 注册 / 手机号认证 / 设置 ----------
     三个页面共用一套 B 站式骨架：左侧主题画面，右侧白卡片表单。
     共同原则：
       1. 页面只读 AUTH.state()，不自己存身份；
       2. 所有失败都给「下一步做什么」，不是只报错（未注册 → 去注册 tab）；
       3. 已登录时进登录页直接挡回去 —— 换号必须先退出，这条规则在页面上也看得见。 */
  function authErrHTML() {
    const e = S.authErr;
    if (!e) return '';
    return '<div class="auth-err" role="alert"><span aria-hidden="true">⚠️</span><span>' + esc(e.msg || e) + '</span>' +
      (e.act === 'register' ? '<button type="button" class="auth-link" data-act="authtab" data-tab="register">去注册</button>' : '') +
      (e.act === 'login' ? '<button type="button" class="auth-link" data-act="authtab" data-tab="login">去登录</button>' : '') +
      (e.act === 'logout' ? '<button type="button" class="auth-link" data-act="logout">退出当前账号</button>' : '') +
      (e.act === 'takeover' ? '<button type="button" class="auth-link" data-act="takeover">顶掉' + esc(e.label || '这台设备') + '上的登录</button>' : '') +
      '</div>';
  }
  /* 左侧画面：内嵌「鲸鱼娘人物卡」（whale/index.html，同源 iframe）。
     卡片自带深海渐变 / 鲸尾 / 光束 / 气泡 与文字块（ul 三条策略说明画在卡里），
     标题与副标通过 URL 参数传进去 —— 登录、第三方授权、手机号认证三步文案各不同，
     所以卡里的 h2/p 是可覆盖的（见 whale/index.html 的 ?title= / ?sub=）。 */
  function authVisualHTML(title, sub) {
    const q = 'embed=1&title=' + encodeURIComponent(title) + '&sub=' + encodeURIComponent(sub);
    return '<div class="auth-visual whale" aria-hidden="true">' +
      '<iframe class="av-frame" src="whale/index.html?' + q + '"' +
      ' title="' + esc(title) + ' · 鲸鱼娘" loading="eager" scrolling="no" tabindex="-1"></iframe>' +
      '</div>';
  }
  /* 第三方三键：B 站把微信/微博/QQ 排成一行圆钮，这里同构 */
  function oauthRowHTML() {
    /* 只渲染服务端真的配好的渠道：没配 Client ID 的按钮既点不动，还占着
       「其他方式登录」的位置。短信下线后只剩邮箱 + GitHub，GitHub 没配时
       这里返回空串，整块跟着消失，登录页就是纯邮箱表单。 */
    const list = ((window.AUTH && window.AUTH.providers) || []).filter(function (p) { return p.enabled !== false; });
    if (!list.length) return '';
    return '<div class="oauth-row" role="group" aria-label="第三方账号登录">' +
      list.map(function (p) {
        return '<button type="button" class="oauth-btn" data-act="oauth" data-p="' + p.id + '"' +
          ' aria-label="用 ' + esc(p.name) + ' 登录" title="用 ' + esc(p.name) + ' 登录" style="--oc:' + p.color + '">' +
          '<span class="oc-ic" aria-hidden="true">' + p.icon + '</span><span class="oc-tx">' + esc(p.name) + '</span></button>';
      }).join('') + '</div>';
  }
  /* ---------- v41 · 新账号落地页：白板 → 先填三行 ----------
     背景：服务端账号以前用 'u'+id 当 users 表的键，id<=8 会撞上 data.js 的演示账号，
     于是新注册的人一进来就顶着 642 粉丝、别人的签名和城市。v41 把服务端账号改成
     's'+id 并让 adoptAccount() 从全零记录起步；这个页面负责下一步 ——
     在别人看到他之前，先让他写下自己的三行。 */
  /* 取一条用户记录：演示账号 u1..u8 有底稿，服务端账号 's'+id 查不到时落在白板上，
     绝不回落到 u1（否则又变成「新用户顶着演示人的签名和粉丝数」）。 */
  function userRow(k) {
    return users[k] || (k && k.charAt(0) === 's' ? blankUserRow(authState().name) : users.u1);
  }
  function blankUserRow(name) {
    return {
      name: name || '新用户', emoji: '', level: 1, badge: '',
      sig: '', city: '', grad: '', prov: '', job: '', birth: '',
      tags: [], interests: [], fans: 0, follows: 0, visits: 0
    };
  }
  /* 「资料填过没有」只认签名 + 城市：两项都空就是白板。跳过的人在这台机器上记一笔，
     否则每次刷新都再拦一次，页面会显得像坏了。 */
  function needsOnboarding() {
    const st = authState();
    if (st.mode !== 'authed' || !st.uid) return false;
    let skip = '';
    try { skip = localStorage.getItem('dsh-profile-skip:' + st.uid) || ''; } catch (err) {}
    if (skip === '1') return false;
    return !st.sig && !st.city;
  }
  function goWelcome() {
    S.route = 'welcome'; S.pop = null;
    try { history.replaceState(null, '', location.pathname + location.search + '#/welcome'); } catch (err) {}
    render(false);
  }
  function obField(label, id, val, max, hint) {
    return '<div class="ob-field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="text" maxlength="' + max + '" value="' + esc(val || '') + '" autocomplete="off">' +
      (hint ? '<i>' + hint + '</i>' : '') + '</div>';
  }
  function welcomePage() {
    if (isGuest()) return loginPage();
    const st = authState();
    const uid = ME();
    const u = users[uid] || blankUserRow(st.name);
    const fromGh = /githubusercontent\.com|github\.com/i.test(st.avatar || '');
    return '<div class="ob-wrap"><section class="ob-card">' +
      '<div class="ob-hd"><h1>先把资料填一下</h1><p>' +
      '账号是新的，这里还什么都没有 —— 粉丝、关注、访客都是 0，帖子也还没写。' +
      '先写三行字，别人在评论区和帖子里看到的就是这些；想跳过随时可以。' +
      '</p></div>' +
      '<div class="ob-body">' +
        '<div class="ob-av"><img src="' + esc(avURL(uid)) + '" width="72" height="72" alt="当前头像">' +
        '<span>' + (fromGh ? '头像来自 GitHub' : '系统默认头像') + '</span></div>' +
        '<div class="ob-form">' +
          obField('昵称', 'ob-name', u.name, 16, '最多 16 字，别人怎么叫你') +
          obField('签名', 'ob-sig', u.sig, 60, '一句话就够了，可以留空') +
          obField('城市', 'ob-city', u.city, 20, '填了会显示在资料卡上') +
        '</div>' +
      '</div>' +
      '<div class="ob-actions">' +
        '<button type="button" class="ob-btn main" data-act="obsave">保存并进入</button>' +
        '<button type="button" class="ob-btn ghost" data-act="obskip">先逛逛</button>' +
      '</div>' +
      '<p class="ob-tip">头像想换的话：我的空间 › 编辑资料。刚才那张' + (fromGh ? '来自 GitHub，' : '') + '会一直用着，直到你自己换掉。</p>' +
      '</section></div>';
  }
  function obSave(el) {
    if (isGuest()) return;
    const uid = ME();
    const val = function (sel) { const n = qs(sel); return n ? String(n.value || '').trim() : ''; };
    const name = val('#ob-name'), sig = val('#ob-sig'), city = val('#ob-city');
    if (!name) { toast('昵称不能空着', '⚠️'); return; }
    const apply = function (user) {
      const u = users[uid];
      if (u) { u.name = user.name || name; u.sig = user.sig || ''; u.city = user.city || ''; }
      const prof = (S.accounts[uid] && S.accounts[uid].profile) || {};
      prof.nick = user.name || name; prof.sig = user.sig || ''; prof.city = user.city || '';
      if (S.accounts[uid]) S.accounts[uid].profile = prof;
      S.route = 'feed'; S.pop = null;
      try { history.replaceState(null, '', location.pathname + location.search + '#/feed'); } catch (err) {}
      render(true);
      toast('资料填好了，欢迎来到鲸域', '✅');
    };
    if (!window.API || !API.updateMe) { apply({ name: name, sig: sig, city: city }); return; }
    if (el) el.disabled = true;
    API.updateMe({ name: name, sig: sig, city: city }).then(function (res) {
      /* 快照必须跟着改：不改的话下一次 needsOnboarding() 还会把他拦回来 */
      const sync = (window.AUTH && AUTH.refresh) ? AUTH.refresh() : Promise.resolve();
      return sync.then(function () { apply((res && res.user) || { name: name, sig: sig, city: city }); });
    }).catch(function (err) {
      if (el) el.disabled = false;
      const m = authErrOf(err, false) || {};
      toast(m.msg || '保存没成功，再点一次', '⚠️');
    });
  }
  function obSkip() {
    const uid = ME();
    try { if (uid) localStorage.setItem('dsh-profile-skip:' + uid, '1'); } catch (err) {}
    S.route = 'feed'; S.pop = null;
    try { history.replaceState(null, '', location.pathname + location.search + '#/feed'); } catch (err) {}
    render(true);
    toast('随时可以在「我的空间 › 编辑资料」里补上', '🐋', { duration: 6000 });
  }
  function loginPage() {
    const st = authState();
    /* 已登录时进来：不是「再登一次」，而是告诉用户当前锁在哪个账号上 */
    if (st.mode === 'authed' && !S.authForce) {
      return '<div class="wrap solo"><div class="auth-wrap"><div class="auth-panel only">' +
        '<div class="auth-hd"><h1>已经登录了</h1><p>当前账号 <b>' + esc(profileOf().nick) + '</b>' +
        (st.email ? ' · ' + esc(st.email) : '') + '</p></div>' +
        '<div class="auth-note locked"><b>同一时间只能登录一个账户。</b>要换号请先退出，退出后才能用另一个邮箱登录；' +
        '后端只按「设备」记会话（手机一条、电脑一条），换账号仍然得先退出。</div>' +
        '<div class="auth-acts"><button type="button" class="btn ghost" data-act="go" data-route="feed">返回首页</button>' +
        '<button type="button" class="btn blue" data-act="logout">退出登录</button></div>' +
        '</div></div></div>';
    }
    const tab = S.authTab === 'register' ? 'register' : 'login';
    const f = S.authForm || {};
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('回到鲸域', '插件、日志与社群都在这里等你。一个账号，手机和电脑各一条会话。') +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>' + (tab === 'login' ? '登录' : '注册') + '</h1>' +
      '<p>' + (tab === 'login' ? '还没有账号？先注册一个 —— 未注册的邮箱登不进来。' : '注册即登录 —— 只用邮箱 + 密码，不绑手机号。') + '</p></div>' +
      '<div class="auth-tabs" role="tablist">' +
      '<button type="button" role="tab" class="auth-tab' + (tab === 'login' ? ' on' : '') + '"' +
      ' aria-selected="' + (tab === 'login') + '" data-act="authtab" data-tab="login">密码登录</button>' +
      '<button type="button" role="tab" class="auth-tab' + (tab === 'register' ? ' on' : '') + '"' +
      ' aria-selected="' + (tab === 'register') + '" data-act="authtab" data-tab="register">注册账号</button>' +
      '</div>' +
      authErrHTML() +
      '<form class="auth-form" onsubmit="return false">' +
      (tab === 'register'
        ? '<label class="auth-field"><span>昵称</span><i aria-hidden="true">🙂</i>' +
          '<input id="rg-name" type="text" maxlength="16" autocomplete="nickname" placeholder="站点里显示的名字，最多 16 字" value="' + esc(f.name || '') + '"></label>'
        : '') +
      '<label class="auth-field"><span>邮箱</span><i aria-hidden="true">✉️</i>' +
      '<input id="' + (tab === 'login' ? 'lg-email' : 'rg-email') + '" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(f.email || '') + '"></label>' +
      '<label class="auth-field"><span>密码</span><i aria-hidden="true">🔒</i>' +
      '<input id="' + (tab === 'login' ? 'lg-password' : 'rg-password') + '" type="password" autocomplete="' + (tab === 'login' ? 'current-password' : 'new-password') + '" placeholder="至少 8 位"></label>' +
      (tab === 'register'
        ? '<label class="auth-field"><span>确认密码</span><i aria-hidden="true">🔒</i>' +
          '<input id="rg-password2" type="password" autocomplete="new-password" placeholder="再输一次"></label>'
        : '') +
      '<button type="button" class="btn blue auth-submit" data-act="' + (tab === 'login' ? 'login' : 'register') + '">' +
      (tab === 'login' ? '登录' : '注册并登录') + '</button>' +
      '</form>' +
      (oauthRowHTML() ? '<div class="auth-or"><span>其他方式登录</span></div>' + oauthRowHTML() : '') +
      '<p class="auth-legal">继续即表示同意《社区准则》与《隐私说明》。账号只有邮箱与 GitHub 两种登录方式，不需要手机号。</p>' +
      '</div></div></div>';
  }
  /* 第三方授权的中转页：真实实现会跳到 provider 域名，这里用页面内的确认卡代替 */
  function oauthPage() {
    const p = (window.AUTH && window.AUTH.providerOf && window.AUTH.providerOf(S.oauthPending)) || null;
    if (!p) { S.route = 'login'; return loginPage(); }
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('第三方授权', '授权完成后回到鲸域，会话同样按「手机 / 电脑」各记一条。') +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>使用 ' + esc(p.name) + ' 登录</h1><p>演示态：不走真实 OAuth，直接走同一条状态机。</p></div>' +
      '<div class="oauth-card"><span class="oc-big" aria-hidden="true">' + p.icon + '</span>' +
      '<div><b>鲸域 请求获取你的 ' + esc(p.name) + ' 昵称与头像</b>' +
      '<p>仅用于创建站内账号，不会读取好友列表或发布内容。</p></div></div>' +
      authErrHTML() +
      '<div class="auth-acts"><button type="button" class="btn ghost" data-act="oauthcancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="oauthok" data-p="' + p.id + '">授权并登录</button></div>' +
      '</div></div></div>';
  }
  /* 手机号认证：登录后的可选一步，不是闸门。
     通道情况由服务端说了算（server/src/sms 里 tencent / aliyun / webhook 三选一，未配置时
     GET /auth/phone/config 回 smsEnabled=false）；服务端也没有任何路由挂 requirePhone，
     所以这一页必须给「跳过」出口 —— 否则用户注册完就卡死在最后一个页面，
     会以为登录失败、以为站点坏了。 */
  function verifyPage() {
    const st = authState();
    const dev = S.phoneDev ? '<div class="phone-dev" role="status"><b>演示验证码</b><code>' + esc(S.phoneDev) + '</code>' +
      '<span>真实环境由短信服务商下发，这一行不会出现。</span></div>' : '';
    /* 通道没接通时不用等用户点「获取验证码」才说实话 —— 一进页就把真相摆出来，
       否则用户会先点一次发送、等一条永远不来的短信。 */
    const channelOff = !!(window.API && API.phoneEnabled && !API.phoneEnabled());
    /* 发过码但服务端说没送达（没接通道）：别对用户撒谎说「已发送」，给一条真话 + 出路 */
    const hint = (channelOff || (S.phoneSent && S.phoneDelivered === false))
      ? '<div class="phone-hint" role="status"><b aria-hidden="true">📵</b><span><b>短信通道还没接通</b>，这条验证码不会真的发到手机上。可以先跳过认证，进站正常用；随时回「设置 → 账号与安全」补认证。</span></div>'
      : '';
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('最后一步：认证手机号', (channelOff ? '短信通道还没接通，可以先跳过 —— 不影响进站。' : '手机号用于找回账号与接收安全提醒；一个手机号只能绑定一个账号。')) +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>手机号认证</h1><p>' + esc(st.name || profileOf().nick) +
      '，认证手机号能找回账号；<b>也可以先跳过</b>。' + (st.email ? '（' + esc(st.email) + '）' : '') + '</p></div>' +
      authErrHTML() +
      '<div class="phone-step" aria-label="认证进度"><span class="on">1 登录</span><span class="on">2 手机号</span><span>3 进站</span></div>' +
      '<label class="auth-field"><span>手机号</span><i aria-hidden="true">📱</i>' +
      '<input id="ph-num" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="11 位大陆手机号" value="' + esc(S.phone || '') + '"></label>' +
      '<div class="phone-row"><label class="auth-field grow"><span>验证码</span><i aria-hidden="true">🔢</i>' +
      '<input id="ph-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字"></label>' +
      '<button type="button" class="btn ghost phone-send" data-act="phsend"' + (S.phoneCool > 0 ? ' disabled' : '') + '>' +
      (S.phoneCool > 0 ? S.phoneCool + ' 秒后重发' : '获取验证码') + '</button></div>' +
      dev + hint +
      '<button type="button" class="btn blue auth-submit" data-act="phverify">完成认证</button>' +
      '<div class="auth-acts"><button type="button" class="btn ghost" data-act="skipverify">跳过认证，先进站</button></div>' +
      '<div class="auth-acts sub"><button type="button" class="btn ghost sm" data-act="logout">换个账号登录</button></div>' +
      '</div></div></div>';
  }
  /* 设置页：菜单里原来那条「设置」指向 feed，所以永远打不开。
     现在有真实路由 #/settings，四组分区，账号与安全排第一。 */
  const SET_SECTIONS = [
    ['set-acc', '账号与安全'], ['set-look', '外观'], ['set-notify', '通知'], ['set-about', '关于']
  ];
  /* UA 只留「系统 · 浏览器」这一层：整串 UA 又长又挡视线，设置页不需要指纹级别的细节 */
  function uaShort(ua) {
    const s = String(ua || '');
    const os = /iPhone|iPad|iPod/.test(s) ? 'iOS'
      : /Android/.test(s) ? 'Android'
        : /Windows/.test(s) ? 'Windows'
          : /Mac OS X/.test(s) ? 'macOS'
            : /Linux/.test(s) ? 'Linux'
              : '未知系统';
    const br = /Edg\//.test(s) ? 'Edge'
      : /OPR\//.test(s) ? 'Opera'
        : /Firefox\//.test(s) ? 'Firefox'
          : /Chrome\//.test(s) ? 'Chrome'
            : /Safari\//.test(s) ? 'Safari'
              : '浏览器';
    return os + ' · ' + br;
  }

  /* 登录设备列表（v46）：真相在服务端，S.devices 只是最近一次 /auth/sessions 的结果。
     还没拿到时给一行「正在读取…」，别让用户以为这块坏了。 */
  function devListHTML() {
    const list = S.devices;
    if (S.devicesErr) {
      return '<span class="set-sub">没读到设备列表：' + esc(S.devicesErr) +
        ' <button type="button" class="auth-link" data-act="devreload">重试</button></span>';
    }
    if (!list) return '<span class="set-sub">正在读取…</span>';
    if (!list.length) return '<span class="set-sub">这台设备是唯一在线的会话</span>';
    /* 当前这台排最前：一进设置页先看到「我现在在哪」，别的设备是次要信息 */
    const rows = list.slice().sort(function (a, b) {
      return (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0);
    });
    return '<div class="dev-list">' + rows.map(function (d) {
      const mobile = d.device === 'mobile';
      const when = d.createdAt
        ? new Date(d.createdAt * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      return '<div class="dev-row' + (d.current ? ' on' : '') + '">' +
        '<span class="dev-ico" aria-hidden="true">' + (mobile ? '📱' : '💻') + '</span>' +
        '<span class="dev-main"><b>' + (mobile ? '手机' : '电脑') +
        '<i class="dev-tag">' + (d.current ? '当前' : '在线') + '</i></b>' +
        '<span class="set-sub">' + esc(uaShort(d.ua)) + ' · ' + esc(when) + ' 登录</span></span>' +
        (d.current ? '' : '<button type="button" class="btn ghost sm" data-act="devout" data-key="' + esc(d.key) + '">退出</button>') +
        '</div>';
    }).join('') + '</div>';
  }

  /* 设置页的画法：先出帧，再去问服务端；回来只在还停在设置页时重画。
     用 S.devicesFor 记这份数据属于哪个 sid —— 换号后旧列表立刻作废，
     失败就把标记清掉（下次进设置页再试），这里不 toast：设置页没坏到需要打断。 */
  function loadDevices(force) {
    if (!window.AUTH || !window.AUTH.devices) return;
    const st = authState();
    if (st.mode !== 'authed') { S.devices = null; S.devicesFor = ''; return; }
    if (S.devicesFor && S.devicesFor !== st.sid) { S.devices = null; S.devicesErr = ''; }
    if (!force && S.devicesFor === st.sid) return;
    S.devicesFor = st.sid;
    S.devicesErr = '';
    Promise.resolve().then(function () { return window.AUTH.devices(); })
      .then(function (list) {
        S.devices = list;
        S.devicesErr = '';
        if (S.route === 'settings') render(true);
      }, function (err) {
        /* 失败也记在 sid 上（否则 render → loadDevices → 失败 → render 会转圈），
           给一行「重试」，别自己反复打服务端 */
        S.devices = null;
        S.devicesErr = (err && err.message) ? String(err.message) : '网络或服务端出了点问题';
        if (S.route === 'settings') render(true);
      });
  }

  function settingsPage() {
    const st = authState();
    const info = (window.AUTH && window.AUTH.accountInfo) ? window.AUTH.accountInfo() : null;
    const cur = S.setPanel || 'set-acc';
    const nav = SET_SECTIONS.map(function (s) {
      return '<button type="button" class="set-nav-item' + (cur === s[0] ? ' on' : '') + '"' +
        ' data-act="setjump" data-id="' + s[0] + '">' + s[1] + '</button>';
    }).join('');
    const pf = profileOf();
    const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
    /* 有别的设备在线才给「退出其他设备」，否则那是个按了没反应的按钮 */
    const others = (S.devices || []).filter(function (d) { return !d.current; }).length;
    const accPanel =
      '<section class="set-sec" id="set-acc"><h2>账号与安全</h2>' +
      '<div class="set-row"><div class="set-k">当前账号</div><div class="set-v">' + av(ME(), 34) +
      '<b>' + esc(pf.nick) + '</b><span class="set-sub">' + esc(st.email || '（未记录邮箱）') + '</span></div></div>' +
      '<div class="set-row"><div class="set-k">登录方式</div><div class="set-v">' +
      (info && info.provider ? esc(info.provider) + ' 账号（未设密码）' : '邮箱 + 密码') + '</div></div>' +
      '<div class="set-row set-row-dev"><div class="set-k">登录设备</div>' +
      '<div class="set-v dev-wrap">' + devListHTML() + '</div></div>' +
      '<div class="set-row set-row-note"><div class="set-k">多端同时在线</div><div class="set-v set-sub">同一账号可以让「电脑 + 手机」各留一条会话，彼此不顶；' +
      '同一台设备再登一次，只顶掉它自己那一条。</div></div>' +
      '<div class="set-acts"><button type="button" class="btn ghost" data-act="go" data-route="profile">我的资料</button>' +
      (others ? '<button type="button" class="btn ghost" data-act="devoutall">退出其他设备</button>' : '') +
      '<button type="button" class="btn" data-act="logout">退出登录</button></div></section>';
    const lookPanel =
      '<section class="set-sec" id="set-look"><h2>外观</h2>' +
      '<div class="set-row"><div class="set-k">主题</div><div class="set-v">' +
      '<div class="set-seg" role="group" aria-label="主题">' +
      '<button type="button" class="set-seg-btn' + (theme === 'day' ? ' on' : '') + '" data-act="settheme" data-v="day" aria-pressed="' + (theme === 'day') + '">☀️ 白天</button>' +
      '<button type="button" class="set-seg-btn' + (theme === 'night' ? ' on' : '') + '" data-act="settheme" data-v="night" aria-pressed="' + (theme === 'night') + '">🌙 夜间</button>' +
      '</div></div></div>' +
      '<div class="set-row"><div class="set-k">动效</div><div class="set-v set-sub">遵循系统的「减少动态效果」设置：开启后入场与滚动都直接跳转。</div></div>' +
      '</section>';
    const notifyPanel = isGuest()
      ? '<section class="set-sec" id="set-notify"><h2>通知</h2>' +
        '<div class="set-row"><div class="set-k">消息提醒</div>' +
        '<div class="set-v set-sub">登录后才会收到回复、点赞、私信与系统通知</div></div></section>'
      : '<section class="set-sec" id="set-notify"><h2>通知</h2>' +
      '<div class="set-row"><div class="set-k">未读消息</div><div class="set-v">' +
      (function () { const n = noticeUnreadTotal(); return n
        ? '<span class="set-ok">' + n + ' 条未读</span><span class="set-sub">铃铛与消息中心同步</span>'
        : '<span class="set-sub">没有未读消息</span>'; })() + '</div></div>' +
      '<div class="set-row"><div class="set-k">消息提醒</div><div class="set-v"><button type="button" class="set-switch' +
      (S.noticesRead ? '' : ' on') + '" data-act="setnotify" role="switch" aria-checked="' + (!S.noticesRead) + '"><i></i></button>' +
      '<span class="set-sub">' + (S.noticesRead ? '已全部已读，红点已消失' : '顶栏铃铛上还有未读') + '</span></div></div>' +
      '</section>';
    const aboutPanel =
      '<section class="set-sec" id="set-about"><h2>关于</h2>' +
      '<div class="set-row"><div class="set-k">站点</div><div class="set-v">' + esc(BR.full) + '</div></div>' +
      '<div class="set-row"><div class="set-k">数据</div><div class="set-v set-sub">内容来自鲸域服务端；登录态是服务端会话（httpOnly Cookie），浏览器里取不到 token。资料卡、头像与封面只存在这台浏览器。</div></div>' +
      '<div class="set-row"><div class="set-k">规则</div><div class="set-v"><button type="button" class="btn sm ghost" data-act="go" data-route="policy">转载与下架政策</button></div></div>' +
      '</section>';
    const panel = cur === 'set-look' ? lookPanel : cur === 'set-notify' ? notifyPanel : cur === 'set-about' ? aboutPanel : accPanel;
    return '<div class="wrap solo"><div class="set-wrap">' +
      '<aside class="set-side"><h1>设置</h1>' + nav + '</aside>' +
      '<div class="set-main"><div class="card"><div class="set-body">' + authErrHTML() + panel + '</div></div></div>' +
      '</div></div>';
  }

  function policyPage() {
    const secs = [
      ['我们转载什么', 'sec-what'],
      ['怎么转载', 'sec-how'],
      ['怎么下架', 'sec-takedown'],
      ['安全声明', 'sec-safe']
    ];
    return '<div class="doc-wrap">' +
      '<nav class="doc-nav"><div class="hd">转载与下架政策</div>' +
      secs.map(function (s, i) {
        return '<a href="javascript:;" class="' + (i === 0 ? 'on' : '') + '" data-act="docjump" data-sec="' + s[1] + '">' + (i + 1) + '. ' + s[0] + '</a>';
      }).join('') +
      '<a href="javascript:;" data-act="go" data-route="market">返回条目库</a></nav>' +
      '<div class="doc-body"><div class="card"><div class="card-bd">' +
      '<h1 class="sr-only">转载与下架政策</h1>' +
      '<p class="doc-lead">这份政策只用来说明操作：我们收什么、怎么存、你怎么让我们撤下来。不写法律声明，也不做警告弹窗。</p>' +

      '<h2 id="sec-what"><span class="no">1</span>我们转载什么</h2>' +
      '<p>条目一律先建、先写清事实，再决定给不给安装包。能不能转载，只看许可证与作者意愿两件事，不看我们喜欢不喜欢。</p>' +
      '<table class="doc-tb"><thead><tr><th>许可证</th><th>能否转载</th><th>要履行的义务</th></tr></thead><tbody>' +
      licenseRows.map(function (r) {
        const cls = r.dist === '可以' ? 'ok' : r.dist === '只放外链' ? 'no' : 'mid';
        return '<tr><td>' + esc(r.lic) + '</td><td class="' + cls + '">' + esc(r.dist) + '</td><td>' + esc(r.duty) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="doc-quote">许可证判定看仓库里的 LICENSE / COPYING 全文；没有就是没有，<b>不猜、不从 npm 字段推断、不假设作者愿意</b>。有冲突时以许可证文件为准。</div>' +

      '<h2 id="sec-how"><span class="no">2</span>怎么转载</h2>' +
      '<div class="doc-step"><span class="n">1</span><span class="tx"><b>原样取包。</b>优先上游 Release 的 .tgz 附件，其次 codeload 的 tar.gz，最后 npm pack。三种都失败就只建条目。</span></div>' +
      '<div class="doc-step"><span class="n">2</span><span class="tx"><b>不重打包。</b>不删 LICENSE、不改 package.json、不注入构建脚本。一个字节都不动，sha256 才和上游对得上。</span></div>' +
      '<div class="doc-step"><span class="n">3</span><span class="tx"><b>校验再上架。</b>先比上游 checksum，再核包内文件清单，最后跑依赖审计与可疑特征扫描。</span></div>' +
      '<div class="doc-step"><span class="n">4</span><span class="tx"><b>写清来源。</b>每个包都带文件名、大小、sha256、收录日期与原仓库地址，页面标「收录于 X 日，上游可能已更新」。</span></div>' +
      '<p><b>当前状态：</b>本站只登记包的文件名、大小、sha256 与原仓库地址，<b>不托管安装包文件</b>，也没有签名下载链路；取包请到作者仓库。下面这条路径是开放托管后的设计，尚未启用。</p>' +
      '<div class="doc-code">packages/&lt;包名&gt;/&lt;版本&gt;/&lt;原文件名&gt;.tgz\n# 目标设计：私有读 + CDN 签名 URL，10 分钟过期，点击瞬间签发（未实现）</div>' +
      '<p>作者认领后可以改成「自动跟随上游 tag」，也可以只手动上传。两条路都保留，选哪条是作者的权利。</p>' +

      '<h2 id="sec-takedown"><span class="no">3</span>怎么下架</h2>' +
      '<div class="doc-step"><span class="n">1</span><span class="tx"><b>任何页面都能举报。</b>四类固定选项：侵犯版权 / 含恶意代码 / 信息严重失实 / 其他。</span></div>' +
      '<div class="doc-step"><span class="n">2</span><span class="tx"><b>24 小时内先撤掉入口。</b>把安装包信息与 Releases 链接从条目上撤下（文件本来就在作者仓库，本站没有副本可下架），条目保留，先把风险掐掉再讨论对错。</span></div>' +
      '<div class="doc-step"><span class="n">3</span><span class="tx"><b>给上传者 48 小时申辩。</b>核查后恢复、永久下架或转人工，全过程留档。</span></div>' +
      '<div class="doc-step"><span class="n">4</span><span class="tx"><b>公开记录。</b>下架记录只列插件名、日期和原因分类，不公开举报人。</span></div>' +
      '<div class="doc-quote">作者关掉展示也一样：从点下开关起算 24 小时内撤掉包信息与取包入口。文件本来就在作者仓库，用户手里已经拿到的副本我们收不回来，但条目页会立刻停止指路。</div>' +
      '<table class="doc-tb"><thead><tr><th>插件</th><th>下架日期</th><th>原因分类</th></tr></thead><tbody>' +
      '<tr><td>dsh-theme-lab</td><td>2026-09-28</td><td>侵犯版权</td></tr>' +
      '<tr><td>quick-ssh-helper</td><td>2026-09-11</td><td>含恶意代码</td></tr>' +
      '</tbody></table>' +

      '<h2 id="sec-safe"><span class="no">4</span>安全声明</h2>' +
      '<p>上架前一定会跑：依赖审计、<code>child_process</code> 与外连特征、代码混淆、挖矿特征、是否读 <code>.ssh</code> / <code>.env</code> / 浏览器数据目录。命中高危就阻断，转人工，放行必须写理由并存档。</p>' +
      '<p>扫描通过不等于包是安全的。本站署名「作者提供」的包表示来源可信，不表示我们为它的行为背书。装之前看一眼它要什么权限，永远是对的。</p>' +
      '<h3 style="font-size:14px;margin:16px 0 8px">上传时你要同意的五条</h3>' +
      '<ul class="doc-ul">' + grantTerms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="doc-note">上面的时效承诺（24 小时内停分发、48 小时申辩）目前靠人工执行，站内还没有自动化工单；认领与仓库验证同样未上线，认领按钮会返回「这条链路还没开放」。</div>' +
      '</div></div></div></div>';
  }

  /* ---------- 社群（结构借鉴 Discourse / linux.do：分类 + 标签双维度、参与者、反应、楼层导航） ---------- */
  const CATS = D.categories, REACTS = D.REACTIONS, TAGCLOUD = D.tagCloud;

  function catOf(id) {
    return CATS.filter(function (c) { return c.id === id; })[0] || { id: 'other', name: '其他', icon: '💬', desc: '' };
  }
  /* 标签维度 = 主标签（tag）+ 附加标签（tags），去重后返回；
     这样左侧栏/顶部 chip 点「求助」既能命中主标签是求助的话题，也能命中打了 #求助 标签的 */
  function threadTags(t) {
    const list = [t.tag].concat(t.tags || []);
    return list.filter(function (x, i) { return x && list.indexOf(x) === i; });
  }
  /* 行内只展示「附加标签」：主标签已经用彩色 tag 显示，置顶/已关闭有独立徽章，重复出现只会挤宽度 */
  function extraTags(t) {
    return threadTags(t).filter(function (x) { return x !== t.tag && x !== '置顶' && x !== '公告置顶'; });
  }
  function kcount(n) { return n > 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

  /* ---------- 分类 × 标签：去重与计数的唯一口径 ----------
     社群是「分类 + 标签」双维度，但 notice/guide/help 这三个分类的名字就是
     公告/经验/求助这三个主标签的同义词（映射表在 data.js 的 catTagAlias）。
     同义时只留彩色主标签，否则同一行会出现「求助」+「求助问答」两个近义标签，
     用户会以为被归进了两个分类。
     判据必须走映射表，不能用 c.name === t.tag 比字符串 —— 那只在「公告」一条上
     恰好成立（分类名「经验分享」永远不等于标签「经验」）。 */
  function catDupOf(t) {
    return catTagAlias[t.cat] === t.tag;
  }
  /* 话题计数口径：分类条、左栏、列表三处必须是同一个数。
     以前 cnt() 只数静态 threads，不数刚发的新帖，于是「全部 8」配着 9 行列表。 */
  function threadPool() { return S.newThreads.concat(threads); }
  function threadCountOf(id) {
    const all = threadPool();
    if (id === '全部') return all.length;
    return all.filter(function (t) { return t.cat === id; }).length;
  }
  function tagCountOf(tag) {
    if (tag === '全部') return threadPool().length;
    return threadPool().filter(function (t) { return threadTags(t).indexOf(tag) >= 0; }).length;
  }

  /* 反应条：Discourse reactions 的简化版，emoji 可点、计数随状态增减 */
  function reactBar(key, base) {
    const b = base || {};
    return '<div class="react-bar">' + REACTS.map(function (e) {
      const k = key + '|' + e;
      const on = S.reacts.has(k);
      const c = (b[e] || 0) + (on ? 1 : 0);
      return '<button class="react' + (on ? ' on' : '') + '" data-act="react" data-k="' + esc(k) + '" title="加一个 ' + e + ' 反应">' +
        '<span>' + e + '</span>' + (c > 0 ? '<b>' + c + '</b>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function threadRow(t) {
    const u = userOf(t.user);
    const c = catOf(t.cat);
    const ps = (t.posters && t.posters.length ? t.posters : [t.user]).slice(0, 3);
    const more = (t.posters ? t.posters.length : 1) - ps.length;
    return '<div class="thread trow' + (t.unread ? ' is-new' : '') + '" data-act="thread" data-id="' + t.id + '">' +
      av(t.user, 38) +
      '<div class="th-main"><div class="th-title">' +
      (t.top ? '<span class="pin">置顶</span>' : '') +
      (t.closed ? '<span class="lock" title="已关闭回复">🔒</span>' : '') +
      (t.hot ? '<span class="th-hot">🔥</span>' : '') +
      '<span class="tt">' + esc(t.title) + '</span>' +
      (t.solved ? '<span class="solved">✓ 已解决</span>' : '') +
      (t.unread ? '<span class="new-dot">新</span>' : '') + '</div>' +
      /* 副标题与详情页 .tb-sub 同源同文案：作者写的 sub 优先，老数据没有 sub 才退回 excerpt。 */
      '<div class="th-ex">' + esc(t.sub || t.excerpt) + '</div>' +
      (t.plugin ? plugInline(t.plugin) : '') +
      '<div class="th-meta"><span class="tag ' + t.tag + '">' + t.tag + '</span>' +
      /* 分类与主标签同义时只留彩色标签（判据在 catDupOf，走 data.js 的映射表） */
      (catDupOf(t) ? '' : '<span class="cat-chip">' + c.icon + ' ' + esc(c.name) + '</span>') +
      extraTags(t).slice(0, 2).map(function (g) { return '<span class="tag-plain">#' + esc(g) + '</span>'; }).join('') +
      '<span class="byline"><span class="who">' + esc(u.name) + '</span><span class="dot">·</span><span class="when">' + esc(t.created) + '</span></span>' +
      (t.lastUser && t.lastUser !== t.user ? '<span class="lastr"><i>·</i>最后回复 ' + esc(userOf(t.lastUser).name) + '</span>' : '') +
      '</div></div>' +
      '<div class="trow-posters">' + ps.map(function (x) { return av(x, 22); }).join('') +
      (more > 0 ? '<span class="pmore">+' + more + '</span>' : '') + '</div>' +
      '<div class="th-stats">' +
      '<button type="button" class="th-fav' + (S.favThread.has(t.id) ? ' on' : '') + '" data-act="favany" data-kind="thread" data-id="' + t.id + '"' +
      ' aria-pressed="' + (S.favThread.has(t.id) ? 'true' : 'false') + '"' +
      ' aria-label="' + (S.favThread.has(t.id) ? '取消收藏这条帖子' : '收藏这条帖子') + '">' +
      (S.favThread.has(t.id) ? '★' : '☆') + '</button>' +
      '<div><b>' + num(t.replies) + '</b>回复</div>' +
      '<div class="vw">' + kcount(t.views) + ' 浏览</div>' +
      '<div class="lk">♥ ' + num(t.likes) + '</div></div></div>';
  }

  /* v24 · 标签页（#/tags）：主体在 js/tags.js，这里只把宿主助手递进去 ——
     计数与社群页同一口径（threadPool / tagCountOf），所以标签页、左栏、分类条
     永远显示同一个数；threadRow 也直接复用，标签结果与社群列表长得一模一样。 */
  function tagsPage() {
    if (!window.TagsPage) {
      return '<div class="wrap no-rail"><div class="col-main"><div class="card"><div class="card-bd">' +
        '标签页模块 js/tags.js 没加载（检查 index.html 里那一行 script）</div></div></div></div>';
    }
    return window.TagsPage.html({
      S: S, esc: esc, groups: D.tagGroups || [], cloud: TAGCLOUD,
      pool: threadPool, tagsOf: threadTags, count: tagCountOf,
      threadRow: threadRow, threadCount: threadPool().length
    });
  }

  function forumPage() {
    let list = threadPool();
    if (S.scat !== '全部') list = list.filter(function (t) { return t.cat === S.scat; });
    if (S.ftag !== '全部') list = list.filter(function (t) { return threadTags(t).indexOf(S.ftag) >= 0; });
    /* v24 · 多标签：S.tags 非空时按「全部满足（交集）/ 任一满足（并集）」过滤。
       它与单标签 S.ftag 互斥（点标签会清空 S.tags，见 act === 'ftag'），不必考虑叠加。 */
    if (S.tags.length) {
      const sel = S.tags.slice(), any = S.tagMode === 'any';
      list = list.filter(function (t) {
        const ts = threadTags(t);
        return any ? sel.some(function (g) { return ts.indexOf(g) >= 0; })
          : sel.every(function (g) { return ts.indexOf(g) >= 0; });
      });
    }
    if (S.q) {
      const q = S.q.toLowerCase();
      list = list.filter(function (t) {
        return (t.title + t.excerpt + threadTags(t).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (S.fsort === '热门') list.sort(function (a, b) { return b.views - a.views; });
    else if (S.fsort === '回复') list.sort(function (a, b) { return b.replies - a.replies; });
    else if (S.fsort === '点赞') list.sort(function (a, b) { return b.likes - a.likes; });
    /* 置顶恒在最前，其余沿用上面排好的顺序（Array.prototype.sort 稳定） */
    list.sort(function (a, b) { return (b.top ? 1 : 0) - (a.top ? 1 : 0); });
    /* 计数只走 threadCountOf：分类条、左栏、列表三处同源，不再各数一遍 */
    const cnt = threadCountOf;
    const nf = S.composerOpen ? '<div class="card newthread-card"><div class="card-hd"><span class="t">发新帖</span></div><div class="card-bd">' +
      '<div class="form-grid">' +
      '<div class="form-row wide"><label>标题<span class="req">*</span></label><input id="nt-title" maxlength="60" placeholder="一句话说清问题 / 主题"></div>' +
      /* 副标题：和标题同一件事的两层表达 —— 标题给结论，副标题给范围/条件。
         它才是列表页 .th-ex 与详情页 .tb-sub 的共同来源，作者可自己写，不再由正文前 80 字硬切。 */
      '<div class="form-row wide"><label>副标题<span class="opt">（选填，一句话补充条件 / 范围）</span></label>' +
      '<input id="nt-sub" maxlength="80" placeholder="例：win + node22 下必现，附最小复现"><span class="form-hint">留空时自动取正文首句，最多 80 字</span></div>' +
      '<div class="form-row"><label>分类</label><select id="nt-cat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === 'help' ? ' selected' : '') + '>' + c.icon + ' ' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-row"><label>主标签</label><select id="nt-tag">' + ['公告', '经验', '求助', '讨论', '教程', '周报'].map(function (x) { return '<option' + (x === '求助' ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="form-row wide" style="margin-top:12px"><label>正文<span class="req">*</span></label>' +
      '<textarea id="nt-body" rows="5" placeholder="带上版本 / 环境 / 报错原文，表述越具体越容易得到帮助（图片可粘贴或拖入）"></textarea>' +
      imgPrevHTML('ntprev', S.ntImages) +
      '<div class="nt-tools"><button class="tool" type="button" data-act="ntpick">🖼️ 插入图片' +
      ((S.ntImages || []).length ? '<i class="tool-n">' + S.ntImages.length + '</i>' : '') + '</button>' +
      '<input type="file" id="nt-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
      '<span class="form-hint">最多 ' + IMG_MAX + ' 张，单张 ' + Math.round(IMG_MAX_BYTES / 1024 / 1024) + ' MB 以内</span></div></div>' +
      '<div class="form-act"><button class="btn sm ghost" data-act="ntcancel">取消</button><button class="btn" data-act="ntsubmit">发布</button></div>' +
      '</div></div>' : '';
    /* v24 · 多标签条：从标签页带过来的组合（S.tags）在列表页可见可删。
       与单标签 S.ftag 互斥 —— 两者同时生效会出现「计数行写一个标签、列表按两个筛」，
       所以点单标签会清空 S.tags（见 act === 'ftag'），点这里的标签也只动 S.tags。 */
    const tagPick = S.tags.length ? '<div class="tags-picked forum-picked">' +
      '<span class="tk">标签</span>' +
      S.tags.map(function (g) {
        return '<button type="button" class="tagchip on sm" data-act="tagtoggle" data-tag="' + esc(g) + '" aria-pressed="true" title="去掉 #' + esc(g) + '">' +
          '<span class="hash" aria-hidden="true">#</span><span class="nm">' + esc(g) + '</span><span class="x" aria-hidden="true">×</span></button>';
      }).join('') +
      (S.tags.length > 1 ? '<span class="tags-mode" role="group" aria-label="多个标签怎么组合">' +
        '<button type="button" class="tags-mode-btn' + (S.tagMode === 'any' ? '' : ' on') + '" data-act="tagmode" data-mode="all">全部满足</button>' +
        '<button type="button" class="tags-mode-btn' + (S.tagMode === 'any' ? ' on' : '') + '" data-act="tagmode" data-mode="any">任一满足</button></span>' : '') +
      '<button type="button" class="btn sm ghost" data-act="tagclear">清空</button>' +
      '<button type="button" class="btn sm ghost" data-act="tagsopen">多选标签 ›</button>' +
      '</div>' : '';
    /* 社群列表页的左栏与首页共用同一张「社群分类」卡（见 railHTML / fcatCardHTML）：
       分类只有一个入口——左栏那张卡，点一行就地筛并高亮当前项。中栏原来还并排
       一排同名胶囊（fcat-bar），两套控件读写同一个 S.scat，纯属重复，已删除；
       左栏在窄屏会自动变成横向滚动条，所以小屏也不会丢分类入口。
       热门标签同理：原来在中栏 forum-bar 下面横排一条（.tagbar），现在整块搬进左栏、
       排在分类卡下面（见 ftagCardHTML）。中栏只留一句「· 标签 X」告诉你在筛哪个标签。 */
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card">' +
      '<h1 class="sr-only">社群 · 全部版块</h1>' +
      /* 卡头从三行压到两行（原来是 搜索 / 热门标签 / 排序+计数+发新帖）。
         排序与计数提到首行左端，搜索与「发新帖」并排贴右端（按钮紧贴搜索框右侧），
         标签行紧随其后，列表再往下——整体上移一行，首屏多露一条话题。 */
      '<div class="forum-bar">' +
      '<div class="sorts">' + ['最新', '热门', '回复', '点赞'].map(function (s) {
        return '<button class="' + (S.fsort === s ? 'on' : '') + '" data-act="fsort" data-sort="' + s + '">' + s + '</button>';
      }).join('') + '</div>' +
      /* 计数后半截（分类名/标签）在 ≤480 收起，窄屏才排得进「排序 + 计数 + 发新帖」一行 */
      '<span class="feed-note">' + list.length + ' 个话题<span class="fn-sub"> · ' + (S.scat === '全部' ? '全部分类' : esc(catOf(S.scat).name)) +
        (S.ftag === '全部' ? '' : ' · 标签 ' + esc(S.ftag)) +
        (S.tags.length ? ' · 标签 ' + S.tags.map(function (g) { return '#' + esc(g); }).join(S.tagMode === 'any' ? ' 或 ' : ' + ') : '') +
        '</span></span>' +
      '<div class="mkt-search">🔍<input id="forumq" placeholder="搜标题 / 摘要 / 标签" value="' + esc(S.q) + '"></div>' +
      '<button class="btn sm blue" data-act="newthread">+ 发新帖</button></div>' +
      nf + tagPick +
      /* 空态要说清是被谁筛空的：分类与标签互斥之后，仍可能因为搜索词而空 */
      '<div>' + (list.length ? list.map(threadRow).join('') : '<div class="empty"><span class="big">🔍</span>' +
        (S.q ? '没有匹配「' + esc(S.q) + '」的话题'
          : S.tags.length ? '没有命中这些标签的话题'
          : S.ftag !== '全部' ? '还没有带 #' + esc(S.ftag) + ' 的话题'
            : S.scat === '全部' ? '这个版块还没有话题' : '这个分类下还没有话题') + '</div>') + '</div>' +
      '</div></div>' + forumSide() + '</div>';
  }

  function guidelineCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">社群准则</span><span class="mini">做到就行</span></div>' +
      '<div class="side-bd gl-bd">' +
      D.guidelines.map(function (g) {
        return '<div class="gl-row"><span class="gl-ico">' + g.icon + '</span>' +
          '<b>' + esc(g.t) + '</b><span class="gl-s">' + esc(g.s) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function forumSide() {
    const act = [['u3', '🥇', '42 帖 · 188 赞'], ['u1', '🥈', '31 帖 · 156 赞'], ['u5', '🥉', '24 帖 · 122 赞']];
    return '<aside class="col-side">' +
      guidelineCard() + hotCard() +
      '<div class="side-card"><div class="side-hd"><span class="t">本周活跃</span><span class="mini">按获赞</span></div>' +
      '<div class="side-bd" style="padding:8px 12px">' + act.map(function (x) {
        return '<div class="act-row"><span class="rk">' + x[1] + '</span>' + av(x[0], 30) +
          '<div class="act-tx"><b>' + esc(userOf(x[0]).name) + '</b><span>' + x[2] + '</span></div></div>';
      }).join('') + '</div></div></aside>';
  }

  function threadFloors(t) {
    const extra = S.newFloors[t.id] || [];
    /* 服务端真实楼层：进详情页时 threadPull() 拉回来，存在 S.replies[主题 id]。
       有真数据就只显示真的 —— 以前非 t1 的主题固定返回三条编造的顶帖。 */
    const real = (S.replies && S.replies[t.id]) || null;
    if (real) return real.concat(extra);
    if (t.id === 't1') return floors.concat(extra);
    /* 还没拉到 / 后端没有楼层：只给主楼，不编假回复 */
    return [{
      user: t.user,
      time: t.created || '刚刚',
      text: t.body || t.excerpt || '',
      likes: t.likes || 0,
      reactions: t.reactions || {}
    }].concat(extra);
  }

  function timelineCard(t, fs) {
    const n = fs.length + 1;
    return '<div class="side-card"><div class="side-hd"><span class="t">本帖导航</span><span class="mini">' + n + ' 楼</span></div>' +
      '<div class="side-bd tl-bd">' +
      '<div class="tl-bar"><i style="width:' + Math.round(100 / n) + '%"></i></div>' +
      '<div class="tl-row" data-act="jumpf" data-n="1"><span class="tl-n">1</span><span class="tl-t">主楼 · ' + esc(userOf(t.user).name) + '</span></div>' +
      fs.map(function (f, i) {
        const s = String(f.text).replace(/\s+/g, ' ').slice(0, 12);
        return '<div class="tl-row" data-act="jumpf" data-n="' + (i + 2) + '"><span class="tl-n">' + (i + 2) + '</span>' +
          '<span class="tl-t">' + esc(s) + '…</span></div>';
      }).join('') +
      '<button class="tl-back" data-act="go" data-route="forum">← 返回话题列表</button>' +
      '</div></div>';
  }

  /* ---------- v23 · 回复框四件套：表情 / 图片 / 提及 / 引用链接 ----------
     需求原文：回复帖子的时候可以回复表情、插入图片、@用户、引用链接。
     四条设计约束（每条都是踩过的坑换来的）：
     1) 面板切换与插入只动 DOM、不整页重绘。重绘会把用户正在打字的选区甩掉，而插入必须
        落在光标处；同时把草稿同步进 S.rpDraft，所以「点赞 / 切面板」触发的重绘和刷新
        都不会丢字。
     2) 楼层配图会跟着 newFloors 一起落 localStorage，而 dataURL 存档按 4/3 膨胀，
        所以先缩到 1.2MB 以内再入队（和鲸鲸空间的作品图同一个上限），缩不下就拒并说明
        原因，不静默把整份存档写爆。
     3) 楼层链接不能写成 "#f3"：全站路由吃 hash（#/thread/t1），塞个 #f3 会把路由带跑。
        所以正文里的「#3 楼」渲染成可点按钮，走既有的 jumpf 跳楼。
     4) 引用块用 "> " 记在正文里（和发帖一样），渲染时归并成引用条，不在数据模型上另开字段。 */
  const RP_IMG_MAX_BYTES = 1.2 * 1024 * 1024;   /* 单张 dataURL 上限 */
  const RP_IMG_TOTAL = 2.4 * 1024 * 1024;       /* 一层回复的配图总量上限 */
  /* 分组表情：常用放最前，先给一条一眼能选完的常用带 */
  const EMOJI_SETS = [
    ['常用', ['😀', '😄', '😂', '🥰', '😎', '🤔', '👍', '🎉', '💡', '🔥', '❤️', '🚀', '✅', '🙏']],
    ['笑脸', ['😃', '😁', '😆', '😅', '🙂', '🙃', '😉', '😊', '😇', '😍', '🤩', '😘', '😋', '🤗', '🤭', '😐', '😑', '😏', '🙄', '😴', '😢', '😭', '😤', '😱', '🥳']],
    ['手势', ['👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🤝', '💪', '🖐️', '✋', '👆', '👇', '👀', '🤙']],
    ['爱心', ['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💗', '💓', '💞', '💕', '❣️', '💔', '💯']],
    ['动物', ['🐋', '🐳', '🐟', '🐬', '🦈', '🐙', '🦑', '🐢', '🐧', '🦭', '🐶', '🐱', '🦊', '🐼', '🦁']],
    ['食物', ['🍜', '🍲', '🍚', '🍣', '🍤', '🍕', '🍔', '🍟', '🍩', '🍰', '🍦', '🍵', '🍺', '☕', '🍉']],
    ['符号', ['✨', '⭐', '🌟', '💫', '⚡', '💥', '❌', '⚠️', '🎯', '📌', '📎', '🔗', 'ℹ️', '🕐', '🧩']]
  ];

  /* 提及候选：楼主 + 各楼作者 / 被回复的人去重，排掉自己（提自己没意义），只收真有资料的用户 */
  function threadParticipants(t, fs) {
    const seen = {}, list = [];
    const push = function (uid) {
      if (!uid || seen[uid] || uid === ME() || !users[uid]) return;
      seen[uid] = 1;
      list.push({ uid: uid, name: users[uid].name });
    };
    push(t.user);
    (fs || []).forEach(function (f) { push(f.user); push(f.replyTo); });
    return list.slice(0, 8);
  }

  function emojiPanelHTML() {
    const cur = EMOJI_SETS.filter(function (s) { return s[0] === S.rpEmojiSet; })[0] || EMOJI_SETS[0];
    const grid = function (list) {
      return list.map(function (e) {
        return '<button type="button" class="emo-i" data-act="epick" data-e="' + e + '" aria-label="插入表情 ' + e + '">' + e + '</button>';
      }).join('');
    };
    return '<div class="tp-panel" data-kind="emo" role="group" aria-label="插入表情">' +
      '<div class="emo-sets">' + EMOJI_SETS.map(function (s) {
        const on = s[0] === cur[0];
        return '<button type="button" class="emo-set' + (on ? ' on' : '') + '" data-act="eset" data-set="' + esc(s[0]) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(s[0]) + '</button>';
      }).join('') + '</div>' +
      '<div class="emo-grid">' + grid(cur[1]) + '</div>' +
      ((S.rpEmojiRecent || []).length
        ? '<div class="emo-recent"><span class="emo-lb">最近用过</span>' + grid(S.rpEmojiRecent.slice(0, 10)) + '</div>' : '') +
      '</div>';
  }

  function mentionPanelHTML(t, fs) {
    const list = threadParticipants(t, fs);
    return '<div class="tp-panel men-panel" data-kind="men" role="group" aria-label="提及用户">' +
      (list.length
        ? list.map(function (pp) {
          return '<button type="button" class="men-i" data-act="mpick" data-uid="' + pp.uid + '" data-name="' + esc(pp.name) + '">' +
            av(pp.uid, 22) + '<b>@' + esc(pp.name) + '</b></button>';
        }).join('')
        : '<div class="tp-empty">这个帖子里还没有别人可以提及</div>') +
      '</div>';
  }

  function linkPanelHTML() {
    return '<div class="tp-panel lnk-panel" data-kind="lnk" role="group" aria-label="插入链接">' +
      '<label class="lnk-f"><span>文字</span><input id="lnk-t" type="text" maxlength="40" placeholder="显示的文字（可留空）"></label>' +
      '<label class="lnk-f"><span>链接</span><input id="lnk-u" type="text" maxlength="300" placeholder="https://example.com/doc"></label>' +
      '<button class="btn sm" type="button" data-act="lnkins">插入</button>' +
      '<span class="lnk-tip">只收 http:// 或 https:// 开头的地址</span></div>';
  }

  function rpPanelHTML(kind, t, fs) {
    if (kind === 'emo') return emojiPanelHTML();
    if (kind === 'men') return mentionPanelHTML(t, fs);
    if (kind === 'lnk') return linkPanelHTML();
    return '';
  }

  /* 面板要按「当前帖的参与者 / 楼层」现算，所以每次点开都重新取一次上下文 */
  function rpCtx() {
    const t = threadPool().filter(function (x) { return x.id === S.threadId; })[0];
    return t ? { t: t, fs: threadFloors(t) } : null;
  }

  /* 面板只切 DOM：整页重绘会丢选区，而插入必须落在光标处。
     S.rpPanel 记着展开的是哪个，万一别处触发了重绘，帖子页会照原样渲染回来。 */
  function syncRpPanel() {
    const host = qs('.replybox');
    if (!host) return;
    const old = host.querySelector('.tp-panel');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    ['rpe', 'rpm', 'rpl'].forEach(function (a) {
      const b = host.querySelector('[data-act="' + a + '"]');
      if (!b) return;
      const k = a === 'rpe' ? 'emo' : (a === 'rpm' ? 'men' : 'lnk');
      const on = S.rpPanel === k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    if (!S.rpPanel) return;
    const ctx = rpCtx();
    if (!ctx) return;
    host.insertAdjacentHTML('beforeend', rpPanelHTML(S.rpPanel, ctx.t, ctx.fs));
  }

  /* 在光标处插入文本：只改 value 与选区，顺带把草稿同步进状态 */
  function insertReplyText(str) {
    const ta = qs('#reply');
    if (!ta) return false;
    const at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    const end = ta.selectionEnd == null ? at : ta.selectionEnd;
    ta.value = ta.value.slice(0, at) + str + ta.value.slice(end);
    const pos = at + str.length;
    try { ta.setSelectionRange(pos, pos); } catch (err) {}
    ta.focus();
    S.rpDraft = ta.value;
    return true;
  }

  /* 配图缩到「进得了本地存档」为止：非 GIF 走 canvas 逐级降尺寸（PNG 保透明，其他转 JPEG）；
     GIF 一过 canvas 就只剩第一帧，所以原样留、只查体积。缩不下去返回 null，由调用方如实提示。 */
  function shrinkReplyImage(im, file) {
    return new Promise(function (resolve) {
      if (file.type === 'image/gif') { resolve(im.src.length <= RP_IMG_MAX_BYTES ? im : null); return; }
      const steps = [1400, 1100, 860, 640];
      const isPng = file.type === 'image/png';
      let i = 0;
      const tryOne = function () {
        if (i >= steps.length) { resolve(null); return; }
        const max = steps[i++];
        const img = new Image();
        img.onload = function () {
          const w = img.naturalWidth || max, h = img.naturalHeight || max;
          const k = Math.min(1, max / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * k)), chh = Math.max(1, Math.round(h * k));
          const cv = document.createElement('canvas');
          cv.width = cw; cv.height = chh;
          const g = cv.getContext('2d');
          if (!isPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, cw, chh); }
          g.drawImage(img, 0, 0, cw, chh);
          let url = '';
          try { url = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', .84); } catch (err) { url = ''; }
          if (url && url.length <= RP_IMG_MAX_BYTES) resolve({ src: url, w: cw, h: chh, type: isPng ? 'image/png' : 'image/jpeg' });
          else tryOne();
        };
        img.onerror = function () { tryOne(); };
        img.src = im.src;
      };
      tryOne();
    });
  }

  /* 入队：校验与提示沿用发帖那一套口径，只多一道「缩到存档放得下」+ 总量闸 */
  function addReplyImages(files) {
    const list = Array.prototype.slice.call(files || []);
    const box = S.rpImages || (S.rpImages = []);
    if (!list.length) return Promise.resolve(0);
    const room = IMG_MAX - box.length;
    if (room <= 0) { toast('一条最多 ' + IMG_MAX + ' 张图，先删一张再加', '🖼️'); return Promise.resolve(0); }
    const picked = [];
    let bad = '';
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (IMG_TYPES.indexOf(f.type) < 0) { bad = '只支持 PNG / JPG / GIF / WebP'; continue; }
      if (f.size > IMG_MAX_BYTES) { bad = '单张图片不能超过 5 MB'; continue; }
      if (picked.length >= room) { bad = '一条最多 ' + IMG_MAX + ' 张图'; break; }
      picked.push(f);
    }
    if (bad) toast(bad, '⚠️');
    if (!picked.length) return Promise.resolve(0);
    return picked.reduce(function (pr, f) {
      return pr.then(function (n) {
        const used = box.reduce(function (s, im) { return s + String(im.src || '').length; }, 0);
        if (used >= RP_IMG_TOTAL) { toast('本地演示版一层最多存 ' + Math.round(RP_IMG_TOTAL / 1024 / 1024 * 10) / 10 + ' MB 配图', '⚠️'); return n; }
        return readImage(f).then(function (im) { return shrinkReplyImage(im, f); }).then(function (im) {
          if (!im) { toast('这张图压不进本地存档（单张上限 1.2 MB），换小一点的图吧', '⚠️'); return n; }
          if (box.length >= IMG_MAX) return n;
          box.push(im);
          return n + 1;
        });
      });
    }, Promise.resolve(0));
  }

  /* 名字 -> uid：正文里的 @人 要能点进 TA 的空间，认不出就只当普通文字（不猜） */
  function uidByName(name) {
    const keys = Object.keys(users);
    for (let i = 0; i < keys.length; i++) if (users[keys[i]] && users[keys[i]].name === name) return keys[i];
    return '';
  }

  /* 正文行内语法：加粗 / 行内码 / 链接 / @人 / #N 楼。
     只在「已转义」的纯文本上做替换，且只产出短语级标签（b / code / a / b.men / button），
     所以能安全塞进 .floor p（不能插 <div>，会把 p 提前闭合）。 */
  const TP_INLINE = /\*\*([^*\n]{1,200})\*\*|`([^`\n]{1,200})`|\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]{1,300})\)|(^|[\s(\[>])@([\u4e00-\u9fa5A-Za-z0-9_\-]{1,16})|(#\d{1,4})\s?楼/g;

  function richInline(s) {
    return String(s).replace(TP_INLINE, function (m, b, code, lt, lu, lead, men, fl) {
      if (b != null) return '<b>' + b + '</b>';
      if (code != null) return '<code>' + code + '</code>';
      if (lt != null && lu != null) {
        return '<a href="' + lu.replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer">' + lt + '</a>';
      }
      /* 注意捕获组 6 是「去掉 @ 的名字」——以前当成带 @ 的整串，slice(1) 把首字
         当成了分隔符、@ 也被吞掉，正文里 @人 会静默消失。这里补回 @。 */
      if (men != null) {
        const nm = men.slice(0);
        const uid = uidByName(nm);
        const at = '@' + nm;
        return (lead || '') + (uid
          ? '<b class="men" role="link" tabindex="0" data-act="mentionspace" data-uid="' + uid + '" title="进入 ' + nm + ' 的空间">' + at + '</b>'
          : at);
      }
      if (fl != null) {
        const n = parseInt(fl.slice(1), 10);
        return '<button type="button" class="jl" data-act="jumpf" data-n="' + n + '" title="跳到第 ' + n + ' 楼">' + fl + ' 楼</button>';
      }
      return m;
    });
  }

  /* 段落级：连续的 "> " 行归并成引用条，其余按行输出（换行用 <br>，和 .floor p 的
     white-space:pre-wrap 视觉一致） */
  function richText(text) {
    const lines = String(text == null ? '' : text).split('\n');
    let html = '';
    let q = [];
    const flush = function () {
      if (!q.length) return;
      html += '<span class="bq">' + q.map(function (l) { return richInline(esc(l)); }).join('<br>') + '</span><br>';
      q = [];
    };
    lines.forEach(function (l) {
      const m = /^>\s?(.*)$/.exec(l);
      if (m) { q.push(m[1]); return; }
      flush();
      html += richInline(esc(l)) + '<br>';
    });
    flush();
    return html.replace(/<br>$/, '');
  }

  /* 楼层配图：和主楼配图共用一套格子与灯箱，只是换个数据来源 */
  function floorImgsHTML(f, tid, fi) {
    const imgs = (f.images || []).filter(function (im) { return im && im.src; });
    if (!imgs.length) return '';
    const n = Math.min(imgs.length, 4);
    return '<div class="imgs n' + n + ' fl-imgs">' + imgs.slice(0, 4).map(function (im, idx) {
      return '<div class="ph real" data-act="lbf" data-tid="' + tid + '" data-fi="' + fi + '" data-idx="' + idx + '" title="点开看大图">' +
        '<img src="' + esc(im.src) + '" alt="' + esc(userOf(f.user).name) + ' 的配图 ' + (idx + 1) + '" loading="lazy" decoding="async"></div>';
    }).join('') + '</div>';
  }

  /* 主楼配图：发新帖时插的图存在 t.images，和日志的 .imgs 用同一套格子与灯箱 */
  function threadImgsHTML(t) {
    const imgs = (t.images || []).filter(function (im) { return im && im.src; });
    if (!imgs.length) return '';
    const n = Math.min(imgs.length, 4);
    return '<div class="imgs n' + n + ' tb-imgs">' + imgs.slice(0, 4).map(function (im, idx) {
      return '<div class="ph real" data-act="lbt" data-tid="' + t.id + '" data-idx="' + idx + '">' +
        '<img src="' + esc(im.src) + '" alt="主楼配图 ' + (idx + 1) + '" loading="lazy" decoding="async"></div>';
    }).join('') + '</div>';
  }

  /* 主题详情：楼层真数据。进详情页拉一次 GET /api/forums/:slug/threads/:id，
     拿到就写进 S.replies[主题 id] 并重绘；拉不到就保持主楼单层，不弹错。 */
  function threadPull(t) {
    if (!t || !t._id || !window.API || !API.threadDetail) return;
    S.replies = S.replies || {};
    S.replyPending = S.replyPending || {};
    const key = t.id;
    if (S.replyPending[key]) return;
    S.replyPending[key] = true;
    API.threadDetail(t.cat || 'general', t._id).then(function (res) {
      const data = (res && res.data) || {};
      const list = (data.replies || []).map(function (r) {
        const uid = API.adoptUser ? API.adoptUser(r.user) : ('s' + (r.user ? r.user.id : 0));
        return {
          id: 'r' + r.id,
          _id: r.id,
          user: uid || 'u1',
          time: r.time || '',
          text: r.body || '',
          likes: r.likes || 0,
          quote: r.quote || '',
          replyTo: '',
          reactions: {}
        };
      });
      S.replies[key] = list;
      if (data.thread) {
        t.replies = data.thread.replies;
        t.views = data.thread.views;
        t.likes = data.thread.likes;
      }
      if (S.route === 'thread' && S.threadId === t.id) render(false);
    }).catch(function (err) {
      if (err && err.code === 'THREAD_NOT_FOUND') S.replies[key] = [];
    }).then(function () { S.replyPending[key] = false; });
  }
  function threadPage(id) {
    const t = threads.filter(function (x) { return x.id === id; })[0] || S.newThreads.filter(function (x) { return x.id === id; })[0] || threads[0];
    if (!t) {
      return '<div class="wrap solo"><div class="card"><div class="empty"><span class="big">💬</span>' +
        '<h2 style="font-size:17px;margin:6px 0 8px">这个主题不存在</h2>' +
        '<p style="color:var(--txt-3);font-size:13px;margin:0 0 18px">它可能已经被删除，或者链接里的编号不对。</p>' +
        '<button class="btn sm blue" data-act="go" data-route="forum">回社群</button></div></div></div>';
    }
    if (t._id) threadPull(t);
    const u = userOf(t.user);
    const fs = threadFloors(t);
    const c = catOf(t.cat);
    const total = fs.length + 1;
    const tkey = 't_' + t.id;
    const tips = ['阅读前请先看置顶的排查手册', '提问请带上版本 / 环境 / 报错原文', '解决了记得点「采纳」，方便后来人'];
    return '<div class="wrap no-rail">' + '<div class="col-main">' +
      '<div class="card"><div class="post-head">' +
      '<div class="crumb"><a href="javascript:;" data-act="go" data-route="forum">社群</a> › ' +
      '<a href="javascript:;" data-act="fcat" data-cat="' + c.id + '">' + esc(c.name) + '</a> › 正文</div>' +
      '<h1 class="th-title">' + (t.top ? '【置顶】' : '') + esc(t.title.replace('【置顶】', '')) + '</h1>' +
      /* 副标题：和列表页 .th-ex 是同一句话（同一个 t.sub 字段），详情页只是放大一档。
         以前详情页根本没有副标题，摘要被粘进正文第一段，三处层级自然对不上。 */
      (t.sub ? '<p class="tb-sub">' + esc(t.sub) + '</p>' : '') +
      '<div class="op-meta"><span class="tag ' + t.tag + '">' + t.tag + '</span>' +
      (catDupOf(t) ? '' : '<span class="cat-chip">' + c.icon + ' ' + esc(c.name) + '</span>') +
      extraTags(t).map(function (g) { return '<span class="tag-plain">#' + esc(g) + '</span>'; }).join('') +
      (t.solved ? '<span class="solved">✓ 已解决</span>' : '') +
      (t.closed ? '<span class="cat-chip">🔒 已关闭</span>' : '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:12px">' + av(t.user, 36) +
      '<div><div style="display:flex;align-items:center;gap:6px"><b style="font-size:13px;color:var(--link)">' + esc(u.name) + '</b>' +
      userTags(u) + '</div><div style="font-size:11.5px;color:var(--txt-3)">' + esc(u.sig) + ' · ' +
      esc(t.created) + ' · ' + num(t.views) + ' 浏览 · ' + num(t.replies) + ' 回复</div></div>' +
      '<button class="btn sm ghost" style="margin-left:auto" data-act="follow">' + (S.follow ? '已关注' : '+ 关注') + '</button></div></div>' +
      '<div class="thread-body" id="f1">' +
      '<div class="tb-text">' +
      /* 新发的帖有真实正文就显示正文（摘要/副标题不再粘进正文）；
         演示数据没有 body，沿用那段固定的展开示例。 */
      esc(t.body || '下面按「加载顺序 → 命名空间 → 宿主版本」三条线展开：\n1. 先确认两个插件是否注册了同名命令；\n2. 再看端口 / 目录 / 缓存路径有没有重叠；\n3. 最后对齐 capability，不要相信文档里的版本号。') + '</div>' +
      threadImgsHTML(t) +
      reactBar(tkey + '_op', t.reactions) +
      (t.plugin ? plugInline(t.plugin) : '') +
      '<div class="tb-acts">' +
      '<button class="act ' + (S.liked.has(tkey) ? 'liked' : '') + '" data-act="tlike" data-id="' + t.id + '"><span class="ic">👍</span> 有帮助 ' + (t.likes + (S.liked.has(tkey) ? 1 : 0)) + '</button>' +
      '<button class="act ' + (S.favThread.has(t.id) ? 'faved' : '') + '" data-act="favany" data-kind="thread" data-id="' + t.id + '"' +
      ' aria-pressed="' + (S.favThread.has(t.id) ? 'true' : 'false') + '"><span class="ic">' + (S.favThread.has(t.id) ? '★' : '☆') + '</span> ' +
      (S.favThread.has(t.id) ? '已收藏' : '收藏') + '</button>' +
      '<button class="act" data-act="toast" data-msg="链接已复制（演示）"><span class="ic">↗</span> 分享</button>' +
      '<span class="post-tip">💡 ' + esc(tips[t.id.charCodeAt(1) % tips.length]) + '</span></div></div></div>' +
      '<div class="card"><div class="card-hd"><span class="t">全部回复</span><span class="more">共 ' + total + ' 楼 · ' + fs.length + ' 条已展示回复</span></div>' +
      fs.map(function (f, i) {
        const fu = userOf(f.user);
        const n = i + 2;
        const acc = t.solved && i === 1;
        const fk = t.id + '_' + i;
        return '<div class="floor" id="f' + n + '"><span class="floor-no">#' + n + (i === 0 ? ' <b>沙发</b>' : '') + '</span>' +
          av(f.user, 40) + '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(fu.name) + '</span>' +
          userTags(fu) + (acc ? '<span class="solved">✓ 采纳答案</span>' : '') +
          '<span class="ft">' + esc(f.time) + '</span>' +
          (f.replyTo ? '<span class="replyto" data-act="quote" data-name="' + esc(userOf(f.replyTo).name) + '">↩ 回复 @' + esc(userOf(f.replyTo).name) + '</span>' : '') +
          '</div><p>' + richText(f.text) + '</p>' +
          floorImgsHTML(f, t.id, i) +
          (f.quote ? '<div class="quote">' + esc(f.quote) + '</div>' : '') +
          reactBar(fk, f.reactions) +
          '<div class="floor-actions"><button data-act="flike" data-k="' + fk + '">' +
          (S.floorLiked.has(fk) ? '❤️ 已赞' : '👍 赞') + ' ' + (f.likes + (S.floorLiked.has(fk) ? 1 : 0)) + '</button>' +
          '<button data-act="quote" data-name="' + esc(fu.name) + '">回复</button>' +
          '<button data-act="toast" data-msg="已复制本楼链接（演示）">复制链接</button>' +
          '<button data-act="toast" data-msg="楼层举报请在帖子详情页用「举报」入口提交，我们会留档处理">举报</button></div></div></div>';
      }).join('') +
      (t.closed
        ? '<div class="reply-closed">🔒 该话题已关闭，不再接受新回复。<button class="btn sm ghost" data-act="toast" data-msg="申请已提交（演示）">申请开放</button></div>'
        : '<div class="replybox"><textarea id="reply" placeholder="友善发言，理性讨论～（可以加表情、贴图、@人、引用楼层；Ctrl / ⌘ + Enter 快捷发表）">' + esc(S.rpDraft || '') + '</textarea>' +
          imgPrevHTML('rpprev', S.rpImages) +
          '<input type="file" id="rp-file" accept="' + IMG_TYPES.join(',') + '" multiple hidden>' +
          '<div class="row"><div class="rp-tools">' +
          '<button class="tool' + (S.rpPanel === 'emo' ? ' on' : '') + '" type="button" data-act="rpe" aria-expanded="' + (S.rpPanel === 'emo' ? 'true' : 'false') + '" title="挑一个表情插到光标处">😊 表情</button>' +
          '<button class="tool' + ((S.rpImages || []).length ? ' on' : '') + '" type="button" data-act="rpimg" title="选本地图片；也可以直接把图片粘贴或拖进来">🖼️ 图片' +
          ((S.rpImages || []).length ? '<i class="tool-n">' + S.rpImages.length + '</i>' : '') + '</button>' +
          '<button class="tool' + (S.rpPanel === 'men' ? ' on' : '') + '" type="button" data-act="rpm" aria-expanded="' + (S.rpPanel === 'men' ? 'true' : 'false') + '" title="提及其他参与讨论的人">＠ 提及</button>' +
          '<button class="tool' + (S.rpPanel === 'lnk' ? ' on' : '') + '" type="button" data-act="rpl" aria-expanded="' + (S.rpPanel === 'lnk' ? 'true' : 'false') + '" title="插入一条 http(s) 链接">🔗 链接</button>' +
          '<button class="tool" type="button" data-act="rpquote" title="把刚才点过「回复」的楼层原文贴成引用块">🔗 引用</button></div>' +
          '<span class="reply-hint">支持 Markdown · 一条最多 ' + IMG_MAX + ' 张图</span>' +
          '<button class="btn" data-act="reply">发表回复</button></div>' +
          (S.rpPanel ? rpPanelHTML(S.rpPanel, t, fs) : '') + '</div>') +
      '</div></div>' + threadSide(t, fs) + '</div>';
  }

  function threadSide(t, fs) {
    const u = userOf(t.user);
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">关于作者</span></div><div class="side-bd">' +
      '<div style="display:flex;gap:10px;align-items:center">' + av(t.user, 48) +
      '<div><div style="font-weight:700;font-size:13.5px">' + esc(u.name) + '</div>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(u.badge || '普通用户') + '</div></div></div>' +
      '<div style="font-size:12.5px;color:var(--txt-2);margin-top:10px">' + esc(u.sig) + '</div>' +
      '<div class="me-stats"><div><b>' + fmt(u.fans) + '</b><span>粉丝</span></div><div><b>' + u.follows + '</b><span>关注</span></div><div><b>' + fmt(u.visits) + '</b><span>访问</span></div></div>' +
      '<button class="btn sm blue" style="width:100%;margin-top:11px" data-act="user" data-uid="' + t.user + '">进入 TA 的空间</button></div></div>' +
      timelineCard(t, fs) +
      '<div class="side-card"><div class="side-hd"><span class="t">相关话题</span></div><div class="side-bd" style="padding:6px 10px">' +
      threads.filter(function (x) { return x.id !== t.id; }).slice(0, 4).map(function (x) {
        return '<div class="hot-item" data-act="thread" data-id="' + x.id + '"><span class="hx"><b>' + esc(x.title) + '</b>' +
          '<span>' + num(x.replies) + ' 回复 · ' + esc(x.last) + '</span></span></div>';
      }).join('') +
      '</div></div>' + noticeSide() + '</aside>';
  }

  /* ---------- 个人空间 ---------- */
  /* ---------- 编辑资料（参考 B 站个人中心：左侧分区 + 右侧表单 + 实时预览） ----------
     资料存在账号上：S.accounts[当前 uid] = { profile, avatar, cover }；
     编辑过程写在 S.draft 里，点保存才写回，点取消直接丢掉草稿，切账号也丢。 */
  /* 任何账号的资料都从这里算：改过就读账号里的，没改过用 data.js 里的底稿。
     地区跟着账号走 —— 底稿里的城市来自 users，省从省市表反查，不读浏览器信息。 */
  function profileOf(uid) {
    const k = uid || S.account;
    /* 服务端账号（'s'+id）没有演示底稿：查不到就落在全零白板上，
       绝不借用 u1 的城市 / 职业 / 签名 / 粉丝数。 */
    const u = userRow(k);
    const p = (S.accounts[k] && S.accounts[k].profile) || {};
    /* 演示账号（u1..u8）允许用 data.js 底稿兜底；服务端账号一律「没填就是没填」，
       否则资料卡会凭空长出「浙江 / 1998-06 / 独立开发者」—— 那正是虚构资料。 */
    const srv = !!(k && k.charAt(0) === 's');
    return {
      nick: p.nick || u.name || '新用户',
      sig: p.sig || u.sig || '',
      gender: p.gender || (srv ? '' : '保密'),
      province: p.province || u.prov || (srv ? '' : provOfCity(u.city)),
      city: p.city || p.loc || u.city || '',
      job: p.job || u.job || (srv ? '' : '独立开发者'),
      birthday: p.birthday || u.birth || (srv ? '' : '1998-06'),
      tags: Array.isArray(p.tags) ? p.tags : (u.tags || (srv ? [] : ['插件开发'])),
      interests: Array.isArray(p.interests) ? p.interests : (srv ? [] : ['插件开发', '界面设计'])
    };
  }
  function draftOf() {
    if (!S.draft) S.draft = JSON.parse(JSON.stringify(profileOf(ME())));
    return S.draft;
  }
  const PRO_SECTIONS = [
    ['pro-av', '头像与封面'], ['pro-base', '基本资料'], ['pro-area', '地区与职业'],
    ['pro-tags', '标签与擅长'], ['pro-prev', '效果预览']
  ];
  function chipsOf(list, cur, act, kind) {
    return '<div class="chips">' + list.map(function (v) {
      const on = (cur || []).indexOf(v) >= 0;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="' + act + '"' +
        (kind ? ' data-kind="' + kind + '"' : '') + ' data-id="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  function profilePage() {
    const k = ME();
    const u = userRow(k);
    const d = draftOf();
    const o = profileOptions;
    const ava = meAva();
    const cities = o.provinces[d.province] || [];
    if (cities.length && cities.indexOf(d.city) < 0) d.city = cities[0];
    /* 预设网格第一格永远是「默认」——就是系统统一头像本身。
       它不算一次自定义：选中它等于把 avatar 清成 null，重新落回兜底图，
       所以「恢复默认」与「点默认格」是同一条路，不会出现两套语义。 */
    const defOn = !ava || (!ava.img && !ava.emoji);
    const preset = '<button type="button" class="ava-opt ava-def' + (defOn ? ' on' : '') + '"' +
      ' data-act="avaclear" aria-label="使用系统默认头像" aria-pressed="' + (defOn ? 'true' : 'false') + '">' +
      '<img src="' + defaultAvaSrc() + '" width="46" height="46" alt=""></button>' +
      o.avatarPresets.map(function (a, i) {
        return '<button type="button" class="ava-opt' +
          (ava && !ava.img && ava.grad === a.grad && ava.emoji === a.emoji ? ' on' : '') +
          '" data-act="avapick" data-id="' + i + '" aria-label="使用预设头像 ' + (i + 1) + '" aria-pressed="' +
          (ava && !ava.img && ava.grad === a.grad && ava.emoji === a.emoji ? 'true' : 'false') + '">' +
          '<img src="' + avatarURL(a) + '" width="46" height="46" alt=""></button>';
      }).join('');
    /* 封面网格：6 张预设 + 一整行「本地上传」。
       上传那一格没图时是虚线按钮，有图时直接铺那张图并挂勾 ——
       「现在用的是预设还是自己的图」一眼就分得出来，不用再读一行小字。
       预设的选中态必须带上 !coverImg：否则传完图 6 张预设全灭，
       看起来像封面丢了。 */
    const coverNow = meCover();
    const coverImg = coverIsImg(coverNow);
    const covers = o.covers.map(function (c, i) {
      const on = !coverImg && coverNow === c.grad;
      return '<button type="button" class="cover-opt' + (on ? ' on' : '') +
        '" data-act="coverpick" data-id="' + i + '" aria-label="使用封面 ' + esc(c.note) + '" aria-pressed="' +
        (on ? 'true' : 'false') + '" style="background:' + c.grad + '">' +
        '<span>' + esc(c.note) + '</span></button>';
    }).join('') +
      '<button type="button" class="cover-up' + (coverImg ? ' has-img on' : '') + '" data-act="coverfile"' +
      (coverImg ? ' style="background:' + coverNow + '"' : '') +
      ' aria-label="' + (coverImg ? '更换本地封面图片（可重新取景）' : '上传本地图片作为空间封面（可自己取景）') + '"' +
      (coverImg ? ' aria-pressed="true"' : '') + '>' +
      '<i class="cu-ic" aria-hidden="true">＋</i>' +
      '<span class="cu-tx">' + (coverImg ? '本地上传 · 点击更换' : '上传本地图片 · 自己取景') + '</span></button>';
    const cityOpts = cities.map(function (c) {
      return '<option value="' + esc(c) + '"' + (d.city === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    const secAv = '<section class="pro-sec" id="pro-av"><h2>头像与封面</h2>' +
      '<p class="pro-tip">' + (defOn
        ? '当前使用系统默认头像。上传本地图片（裁成方形并压到 512px）或从下面挑一个；点「保存资料」时会把头像同步到账号。'
        : '头像支持上传本地图片（会裁成方形并压到 512px）；点「保存资料」时同步到账号，换设备登录也能看到。第一格是系统默认头像。') + '</p>' +
      '<div class="ava-row"><div class="ava-big">' + av(k, 96) +
        '<button type="button" class="ava-edit" data-act="avafile" aria-label="上传本地头像">更换</button></div>' +
        '<div class="ava-right"><div class="pro-label">选择头像</div><div class="ava-grid">' + preset + '</div>' +
        '<div class="ava-acts"><button type="button" class="btn sm blue" data-act="avafile">上传图片</button>' +
        '<button type="button" class="btn sm ghost" data-act="avaclear">恢复默认</button>' +
        '<input type="file" id="ava-file" accept="image/*" hidden>' +
        '<span class="pro-hint" aria-live="polite">' + esc(S.fileErr || S.avatarErr || (S.avatarBusy ? '正在处理头像…' : S.avatarFile ? '新头像已就绪，点「保存资料」同步到账号' : '支持 JPG / PNG / WebP / GIF / HEIC，最大 20 MB；会自动裁成方形')) + '</span></div></div></div>' +
      '<div class="pro-label" style="margin-top:16px">空间封面</div>' +
      '<div class="cover-grid">' + covers + '</div>' +
      '<div class="cover-acts"><span class="pro-hint" aria-live="polite">' +
      esc(S.coverErr || '支持 JPG / PNG / WebP，最大 10 MB；传上来先自己框取景（3:1），再压到 1400px 宽存进本机浏览器。') +
      '</span><button type="button" class="btn sm ghost" data-act="coverclear">使用默认封面</button>' +
      '<input type="file" id="cover-file" accept="image/png,image/jpeg,image/webp" hidden></div>' +
      '</section>';

    const secBase = '<section class="pro-sec" id="pro-base"><h2>基本资料</h2>' +
      '<div class="pro-grid">' +
      '<label class="pro-field"><span>昵称<i>*</i></span>' +
      '<input id="pro-nick" type="text" maxlength="16" value="' + esc(d.nick) + '" placeholder="1~16 个字符">' +
      '<em class="pro-count" id="pro-nick-n">' + d.nick.length + ' / 16</em></label>' +
      '<div class="pro-field"><span>性别</span><div class="chips">' + o.genders.map(function (g) {
        return '<button type="button" class="chip' + (d.gender === g ? ' on' : '') + '" data-act="progender" data-id="' + esc(g) +
          '" aria-pressed="' + (d.gender === g ? 'true' : 'false') + '">' + esc(g) + '</button>';
      }).join('') + '</div></div>' +
      '<label class="pro-field"><span>生日</span><input id="pro-birth" type="month" value="' + esc(d.birthday) + '"></label>' +
      '<label class="pro-field wide"><span>个性签名</span>' +
      '<textarea id="pro-sig" maxlength="60" rows="3" placeholder="一句话介绍自己">' + esc(d.sig) + '</textarea>' +
      '<em class="pro-count" id="pro-sig-n">' + d.sig.length + ' / 60</em></label>' +
      '</div></section>';

    const secArea = '<section class="pro-sec" id="pro-area"><h2>地区与职业</h2>' +
      '<div class="pro-grid">' +
      '<label class="pro-field"><span>所在省 / 直辖市</span><select id="pro-prov">' +
      Object.keys(o.provinces).map(function (k) {
        return '<option value="' + esc(k) + '"' + (d.province === k ? ' selected' : '') + '>' + esc(k) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="pro-field"><span>城市</span><select id="pro-city">' + cityOpts + '</select></label>' +
      '<label class="pro-field"><span>职业</span><select id="pro-job">' + o.jobs.map(function (j) {
        return '<option' + (d.job === j ? ' selected' : '') + '>' + esc(j) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="pro-field"><span>注册时间</span><input type="text" value="2024-11-08" disabled aria-label="注册时间，不可修改"></div>' +
      '</div></section>';

    const secTags = '<section class="pro-sec" id="pro-tags"><h2>标签与擅长</h2>' +
      '<div class="pro-label">擅长（最多 6 个）</div>' + chipsOf(o.tags, d.tags, 'protag', 'tags') +
      '<div class="pro-label" style="margin-top:14px">感兴趣的方向</div>' + chipsOf(o.interests, d.interests, 'protag', 'interests') +
      '</section>';

    const secPrev = '<section class="pro-sec" id="pro-prev"><h2>效果预览</h2>' +
      '<p class="pro-tip">下面是别人在你的空间里看到的资料卡，保存后同步到「我的空间」。</p>' +
      '<div class="prev-card"><div class="prev-cover"' + (meCover() ? ' style="background:' + meCover() + '"' : '') + '></div>' +
      '<div class="prev-body">' + av(k, 64) +
      '<div class="prev-tx"><b>' + esc(d.nick) + '</b><span class="tag-badge">' + esc(d.job) + '</span>' +
      '<p>' + esc(d.sig || '这个人很懒，什么都没写。') + '</p>' +
      '<div class="prev-meta">' + esc(d.province + ' ' + d.city) + ' · ' + esc(d.gender) + ' · ' + esc(d.birthday) + '</div>' +
      '<div class="prev-tags">' + d.tags.map(function (t) { return '<span class="tag-plain">#' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div></div></div></section>';

    return '<div class="wrap deep">' + seaHTML() + railHTML() + '<div class="col-main">' +
      '<div class="card pro-page"><div class="card-hd"><h1 class="t">我的资料</h1>' +
      '<span class="more">分区修改，点保存才生效</span></div>' +
      '<div class="pro-wrap"><nav class="pro-nav" aria-label="资料分区">' +
      PRO_SECTIONS.map(function (x, i) {
        return '<a href="javascript:;" data-act="projump" data-id="' + x[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + x[1] + '</a>';
      }).join('') + '</nav><div class="pro-body">' + secAv + secBase + secArea + secTags + secPrev + '</div></div>' +
      '<div class="pro-foot"><span class="pro-hint">资料只保存在这台机器的 localStorage 里，不会上传。</span>' +
      '<button type="button" class="btn ghost" data-act="proreset">恢复默认</button>' +
      '<button type="button" class="btn" data-act="procancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="prosave">保存资料</button></div></div></div>' +
      '<aside class="col-side"><div class="side-card"><div class="side-hd"><span class="t">资料完整度</span></div>' +
      '<div class="side-bd">' + proMeter(d) + '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">小提示</span></div><div class="side-bd">' +
      '<p class="pro-tip" style="margin:0">昵称和头像会出现在你发的日志、社群帖子和插件条目上；封面只影响空间页与右侧名片。</p>' +
      '</div></div></aside></div>';
  }
  /* 左侧「资料完整度」：填得越满越高，纯粹给个正反馈 */
  function proMeter(d) {
    const items = [
      ['昵称', !!(d.nick && d.nick.length >= 2)], ['签名', !!(d.sig && d.sig.length >= 6)],
      /* 头像是画布生成的、封面有默认渐变，所以这里数的是「自己换过的」而不是「有没有」。
         系统默认头像（v19）同样不算自定义 —— 否则每个新注册用户一进来就白送一项完成度。 */
      ['自定义头像', !!meAva()], ['自定义封面', !!meCover()], ['地区', !!(d.province && d.city)],
      ['职业', !!d.job], ['标签', d.tags.length > 0], ['兴趣', d.interests.length > 0]
    ];
    const done = items.filter(function (x) { return x[1]; }).length;
    const pct = Math.round(done / items.length * 100);
    return '<div class="meter-row"><div class="meter"><i style="width:' + pct + '%"></i></div><b>' + pct + '%</b></div>' +
      '<ul class="meter-list">' + items.map(function (x) {
        return '<li class="' + (x[1] ? 'ok' : '') + '">' + (x[1] ? '✓' : '○') + ' ' + x[0] + '</li>';
      }).join('') + '</ul>';
  }

  /* v42 · 别人的空间：'s'+id 是服务端账号，本机没有底稿时拉一次公开资料。
     以前 spacePage 会把认不出的 uid 直接改成 u1，于是任何陌生人的空间都长得像 u1。 */
  const SPACE_FETCH = {};
  function ensureSpaceUser(uid) {
    if (!uid || !/^s\d{1,9}$/.test(uid) || users[uid]) return;
    if (SPACE_FETCH[uid]) return;
    SPACE_FETCH[uid] = 1;
    const base = String(window.DSH_API_BASE || '').replace(/\/+$/, '');
    const finish = function (u) {
      SPACE_FETCH[uid] = u ? 2 : 3;
      const row = blankUserRow((u && u.name) || '鲸友');
      if (u) {
        row.emoji = u.emoji || ''; row.grad = u.grad || '';
        row.level = u.level || 1; row.badge = u.badge || '';
        row.sig = u.sig || ''; row.city = u.city || '';
        row.fans = u.fans || 0; row.follows = u.follows || 0; row.visits = u.visits || 0;
        if (u.avatar) {
          const a = S.accounts[uid] || (S.accounts[uid] = { profile: null, avatar: null, cover: '' });
          a.avatar = { img: u.avatar };
        }
      }
      users[uid] = row;
      if (S.route === 'space' && S.spaceUser === uid) render(false);
    };
    const url = base + '/api/users/' + encodeURIComponent(uid);
    (window.fetch ? fetch(url, { credentials: 'same-origin' }) : Promise.reject(new Error('no fetch')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { finish(j && j.data && j.data.user); })
      .catch(function () { finish(null); });
  }

  function spacePage(uid) {
    if (!users[uid] && /^s\d{1,9}$/.test(uid || '')) {
      ensureSpaceUser(uid);
      return '<div class=\"wrap solo\"><div class=\"card\" style=\"padding:48px;text-align:center;color:var(--txt-2)\">正在打开这个空间…</div></div>';
    }
    /* 进来之前先把 uid 归一化：未登录时 ME() 是空串，服务端账号 id（如 u45）也不一定在
       演示 users 表里。以前这里只对 u 做了兜底，却把原始 uid 一路传给 sideCard/contribCard，
       那里 users[x.uid].name 会抛 TypeError —— 渲染中断，用户看到的是上一页残留的 DOM。 */
    /* v42 · 服务端账号（'s'+id）在本机没有底稿时，绝不能退回 u1 ——
       那会把 u1 的昵称、粉丝数和签名套到陌生人身上（真实账号显示 642/156/9.1k 就是这么来的）。
       保留原 uid，资料交给 ensureSpaceUser() 去 /api/users/:id 取。 */
    if (!uid) uid = (S.account && users[S.account]) ? S.account : 'u1';
    const u = userRow(uid);
    /* u1 是「我自己」：昵称/签名优先读已保存的编辑资料 */
    const pf = profileOf(uid);
    const mine = posts.filter(p => p.user === uid);
    const myPlugins = plugins.filter(p => p.author === uid);
    const tabs = ['日志', '插件', '相册', '留言'];
    let body = '';
    if (S.tab === '日志') {
      body = mine.length ? mine.map(postHTML).join('') : '<div class="empty"><span class="big">📝</span>还没有发过日志</div>';
    } else if (S.tab === '插件') {
      /* v27：「+ 发布插件」已经搬到标签条右侧；v29 起那一组只剩它自己（改资料入口搬进了头像弹层的「我的资料」），这里只留一句流程提示 */
      const pubBar = (uid === ME())
        ? '<div class="pub-note"><span class="pn-ic" aria-hidden="true">🧩</span>' +
          '<p><b>把自己的插件挂到条目库</b>填表 → 上传安装包 → 等审核，和 GitHub 新建仓库一个流程。</p></div>'
        : '';
      body = pubBar + (myPlugins.length ? '<div class="mkt-grid" style="padding:14px">' + myPlugins.map(pluginCard).join('') + '</div>'
        : '<div class="empty"><span class="big">🧩</span>还没有发布插件</div>');
    } else if (S.tab === '相册') {
      const gs = ['linear-gradient(135deg,#ff9a6c,#ff5f8f)', 'linear-gradient(135deg,#7dd3fc,#4f46e5)', 'linear-gradient(135deg,#a78bfa,#f472b6)',
        'linear-gradient(135deg,#5eead4,#0ea5e9)', 'linear-gradient(135deg,#fde68a,#f59e0b)', 'linear-gradient(135deg,#34d399,#0ea5e9)',
        'linear-gradient(135deg,#fbcfe8,#a78bfa)', 'linear-gradient(135deg,#94a3b8,#334155)', 'linear-gradient(135deg,#f472b6,#7c3aed)'];
      const gridCss = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:14px';
      /* v32 · 自己传过的照片（acct(uid).photos，只在本机）排在最前，
         后面补一格「＋」；没有真照片时退回原来那九张演示渐变图，
         不让空相册把整页打成空白。 */
      const myPhotos = (S.accounts[uid] && S.accounts[uid].photos) || [];
      body = myPhotos.length
        ? '<div style="' + gridCss + '">' + myPhotos.map((x, i) =>
            '<div class="ph real" style="aspect-ratio:1/1;border-radius:7px" data-act="lb" data-pid="my" data-idx="' + i + '">' +
            '<img src="' + x.img + '" alt="' + esc(x.t || ('照片 0' + (i + 1))) + '" loading="lazy"></div>').join('') +
            (uid === ME() ? '<button type="button" class="ph add-ph" data-act="spphoto" aria-label="加一张照片" title="加一张照片" style="aspect-ratio:1/1;border-radius:7px">＋</button>' : '') +
            '</div>'
        : '<div style="' + gridCss + '">' +
            gs.map((g, i) => '<div class="ph art" style="aspect-ratio:1/1;border-radius:7px;background:' + g + '" data-act="lb" data-pid="al" data-idx="' + i + '">' +
              '<span class="cap">相册 0' + (i + 1) + '</span></div>').join('') + '</div>';
    } else {
      const m = S.msgs[uid] || [];
      body = '<div style="padding:4px 0">' + m.map((g, i) =>
        '<div class="floor" style="padding:13px 20px"><span class="floor-no">#' + (i + 1) + '</span>' + av(g.user, 36) +
        '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(profileOf(g.user).nick) + '</span>' +
        userTags(userRow(g.user)) + '<span>' + esc(g.time) + '</span></div>' +
        '<p>' + esc(g.text) + '</p></div></div>').join('') +
        visitors.slice(0, 6).map((v, i) =>
        '<div class="floor" style="padding:13px 20px"><span class="floor-no">#' + (m.length + i + 1) + '</span>' + av(v.user, 36) +
        '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(userOf(v.user).name) + '</span>' +
        userTags(userOf(v.user)) + '<span>' + esc(v.time) + '</span></div>' +
        '<p>' + esc(['插件做得太漂亮了，求带！', '大佬什么时候更新下一版？', '已 star，坐等文档。', '这个渲染速度是真的猛。', '空间皮肤好看，求同款。', '来串门～'][i % 6]) + '</p></div></div>').join('') +
        '<div class="replybox" style="border-top:1px solid var(--line-2)"><textarea id="reply" placeholder="给 TA 留言…"></textarea>' +
        '<div class="row"><span>留言会公开显示</span><button class="btn" data-act="reply">发表留言</button></div></div></div>';
    }

    /* 自己选的封面优先：空间页头图与右侧名片用同一张 */
    const myCover = acct(uid).cover || '';
    const cvStyle = myCover ? ' style="background:' + myCover + '"' : '';
    const mine0 = uid === ME();
    /* v32 · 标签条右侧那颗胶囊跟着标签换文案（四个标签各四字，宽度不变，v31 的同行排法照旧） */
    const SP_PUB_TX = { '日志': '发布日志', '插件': '发布插件', '相册': '发布照片', '留言': '发布留言' };
    /* v36：空间页不挂左栏 —— .wrap.no-rail 让主列吃满、右栏仍占 300px；
       .wrap.deep 的 token 作用域与 .sea-life 的绝对定位都不受影响（不是网格子项）。 */
    return '<div class="wrap deep no-rail">' + seaHTML() + '<div class="col-main">' +
      '<div class="prof-cover' + (cvStyle ? ' custom' : '') + '"><div class="layer"' + cvStyle + '></div><div class="grid-lines"></div>' +
      '<div class="prof-id">' + av(uid, 96) + '<div><h1 class="sr-only">' + esc(pf.nick) + '的个人空间</h1><h2>' + esc(pf.nick) +
      (u.badge ? '<span class="tag-badge ' + badgeCls(u.badge) + '">' + u.badge + '</span>' : '') + '</h2>' +
      '<p>' + esc(pf.sig) + '</p><div class="stat-row" style="margin-top:8px">' +
      '<div class="s"><b>' + num(u.fans) + '</b><span>粉丝</span></div>' +
      '<div class="s"><b>' + u.follows + '</b><span>关注</span></div>' +
      '<div class="s"><b>' + fmt(u.visits) + '</b><span>访客</span></div></div></div></div></div>' +
      /* v27：标签条右侧收成一个动作组，用 margin-left:auto 吃中间空白，窄屏整组换行右对齐。
         v29：自己的空间这一组只剩「+ 发布插件」——改资料的入口搬到头像弹层的「我的资料」。 */
      '<div class="card"><div class="tabs sp-tabs">' + tabs.map(t =>
        '<button class="tab ' + (S.tab === t ? 'on' : '') + '" data-act="stab" data-tab="' + t + '">' + t + '</button>').join('') +
      '<span class="spacer"></span><div class="sp-acts">' + (mine0
        ? '<button type="button" class="btn sm blue sp-act-pub" data-act="spub" data-tab="' + S.tab + '">+ ' + (SP_PUB_TX[S.tab] || '发布') + '</button>'
        : '<button type="button" class="btn sm ghost sp-act-dm" data-act="dmto" data-uid="' + uid + '"' +
          ' aria-label="给 ' + esc(userOf(uid).name) + ' 发私信" title="发私信"><span aria-hidden="true">✉</span></button>' +
          '<button type="button" class="btn sm ghost' + (S.favUser.has(uid) ? ' faved' : '') + '" data-act="favany" data-kind="user" data-id="' + uid + '" aria-pressed="' + (S.favUser.has(uid) ? 'true' : 'false') + '">' +
            (S.favUser.has(uid) ? '★ 已收藏作者' : '☆ 收藏作者') + '</button>' +
          '<button type="button" class="btn sm ghost" data-act="toast" data-msg="已发送关注请求（演示）">+ 关注</button>') + '</div></div>' +
      '<div class="feed">' + body + '</div></div></div>' +
      (mine0 ? '<input type="file" id="sp-photo-file" accept="image/png,image/jpeg,image/webp" hidden>' : '') +
      spaceSide(uid) + '</div>';
  }

  /* 「个人资料」卡：每个账号都读自己的资料（改过的优先，没改过用 data.js 底稿） */
  function kvRows(uid) {
    const pf = profileOf(uid);
    const u = userRow(uid);
    /* 空字段不渲染：白板账号的资料卡不该出现「城市  」「生日  」这种空壳行。 */
    const rows = [['昵称', pf.nick], ['等级', 'Lv.' + u.level + (pf.job ? ' · ' + pf.job : '') + (u.badge ? ' · ' + u.badge : '')]];
    const loc = (pf.province + ' ' + pf.city).trim();
    if (loc) rows.push(['城市', loc]);
    if (pf.birthday) rows.push(['生日', pf.birthday]);
    if (pf.sig) rows.push(['签名', pf.sig]);
    const tags = pf.tags.slice(0, 3).join(' / ');
    if (tags) rows.push(['擅长', tags]);
    return rows;
  }
  /* ---------- 撰稿人（仿 GitHub Contributors）：头像格 + 提交柱状 + 图例 ---------- */
  /* 贡献数用 uid 做确定性散列，刷新不会跳来跳去；数据全部来自 users / visitors。 */
  function contribOf(uid) {
    /* 服务端账号没有「提交历史」这张表：与其拿演示名单凑一份假的，
       不如空着 —— 空间页会显示「还没有人在这里提交过」。 */
    if (uid && uid.charAt(0) === 's') return [];
    const people = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].filter(function (k) { return k !== uid && users[k]; });
    /* uid 自己也要在表里才进池子：传进来的是空串或服务端新账号时，users[uid] 根本不存在 */
    const pool = (users[uid] ? [uid] : []).concat(people);
    if (!pool.length) return [];
    return pool.map(function (k, i) {
      const n = ((k.charCodeAt(1) * 37 + i * 11) % 47) + 3;
      return { uid: k, n: n };
    }).sort(function (a, b) { return b.n - a.n; });
  }
  function contribCard(uid) {
    const list = contribOf(uid);
    if (!list.length) {
      return '<div class="side-card"><div class="side-hd"><span class="t">撰稿人</span></div>' +
        '<div class="side-bd"><div class="cn-empty">还没有人在这里提交过 —— 插件收录之后，贡献记录会出现在这里。</div></div></div>';
    }
    const shown = list.slice(0, 9);
    const more = list.length - shown.length;
    const total = list.reduce(function (s, x) { return s + x.n; }, 0);
    const u = userRow(uid);
    /* 近 12 周提交分布：用 uid 做种子，保证每次渲染一致 */
    const seed = uid.charCodeAt(1) || 7;
    const bars = Array.from({ length: 12 }, function (_, i) {
      const h = 16 + ((seed * (i + 3) * 7) % 84);
      return '<i style="height:' + h + '%" title="第 ' + (i + 1) + ' 周 · ' + Math.round(h / 3) + ' 次"></i>';
    }).join('');
    return '<div class="side-card"><div class="side-hd"><span class="t">撰稿人</span>' +
      '<a href="javascript:;" data-act="toast" data-msg="完整贡献榜还在做（演示）">全部 ›</a></div>' +
      '<div class="side-bd"><div class="contrib-sum"><b>' + list.length + '</b>' +
        '<span>位贡献者 · 近 12 周 ' + total + ' 次提交</span></div>' +
      '<div class="cn-grid">' + shown.map(function (x) {
        /* 双保险：contribOf 已经滤过一遍，这里再兜一次，绝不让一个缺失的 key 打断整页渲染 */
        const cu = userRow(x.uid);
        return '<button type="button" class="cn-cell" data-act="user" data-uid="' + x.uid + '" ' +
          'aria-label="查看 ' + esc(cu.name) + ' 的空间，' + x.n + ' 次提交" title="' + esc(cu.name) + ' · ' + x.n + ' 次提交">' +
          av(x.uid, 56, 'cn-av') + '<span class="cn-n">' + x.n + '</span></button>';
      }).join('') + (more > 0 ? '<button type="button" class="cn-cell" data-act="toast" data-msg="还有 ' + more +
        ' 位贡献者（演示）" aria-label="还有 ' + more + ' 位贡献者"><span class="cn-more">+' + more + '</span></button>' : '') +
      '</div>' +
      '<div class="cn-bars">' + bars + '</div>' +
      '<div class="cn-legend"><span>近 12 周提交</span><span class="lv"><i></i>相对活跃度</span></div>' +
      '<div class="cn-foot">最近一次贡献 <b>' + esc((visitors[0] && visitors[0].time) || '刚刚') + '</b>' +
        ' · 这个空间累计被访问 <b>' + fmt(u.visits) + '</b> 次</div>' +
      '</div></div>';
  }
  function spaceSide(uid) {
    return '<aside class="col-side"><div class="side-card"><div class="side-hd"><span class="t">个人资料</span></div><div class="side-bd">' +
      '<dl class="kv">' + kvRows(uid).map(f => '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>').join('') + '</dl></div></div>' +
      contribCard(uid) + pluginFilesCard(uid) + '</aside>';
  }

  /* ---------- 灯箱 ---------- */
  function lightboxHTML() {
    if (!S.lb) return '<div class="lightbox" aria-hidden="true"><button class="x" tabindex="-1" aria-hidden="true">✕</button><div class="stage"></div></div>';
    const g = S.lb.grad;
    const cap = S.lb.title || '图片预览';
    const pic = S.lb.src
      /* src 是用户可控的（图片键来自发帖接口），必须和 alt 一样过 esc：
         少了它，一个 key 里塞 a" onerror="… 就能在访客点开图片时执行脚本。 */
      ? '<img class="lb-img" src="' + esc(S.lb.src) + '" alt="' + esc(cap) + '" decoding="async">'
      : '';
    return '<div class="lightbox" data-lb="1" role="dialog" aria-modal="true" aria-label="' + esc(cap) + '">' +
      '<button class="x" type="button" data-act="close-lb" aria-label="关闭预览（Esc）">✕</button>' +
      '<div class="stage' + (pic ? ' has-img' : '') + '" style="background:' + g + '">' + pic +
      '<div class="cap2">' + esc(S.lb.title || '') + (S.lb.note ? '<small>' + esc(S.lb.note) + '</small>' : '') + '</div></div></div>';
  }

  /* 把 .wrap 标成入场态：整页切换时给首屏两组卡片加编排，其他情况原样返回 */
  function enterWrap(html) {
    return html.replace('<div class="wrap', '<div class="wrap enter');
  }

  /* 下拉退场：先移除 .open 让它反向过渡，再删状态。
     高频点击的元素用 transition 而不是 keyframes，重复开关不会重播。 */
  function closePop() {
    const pop = qs('.pop');
    if (!pop) { S.pop = null; render(true); return; }
    pop.classList.remove('open');
    setTimeout(() => { S.pop = null; render(true); }, 180);
  }

  /* 灯箱退场：先跑 closing，动画结束后再清状态重绘（入场/退场对称） */
  let lbClosing = false;
  let lbReturnFocus = null;
  function closeLightbox() {
    if (!S.lb || lbClosing) return;
    const box = qs('.lightbox.open');
    if (!box) { S.lb = null; render(true); return; }
    lbClosing = true;
    box.classList.add('closing');
    box.classList.remove('open');
    setTimeout(() => {
      lbClosing = false;
      S.lb = null;
      document.body.classList.remove('lb-open');
      render(true);
      /* 关掉后焦点回到触发的那张图上，键盘用户不至于掉回页首 */
      if (lbReturnFocus) {
        const back = qs('[data-act="lb"][data-pid="' + lbReturnFocus.split('|')[1] + '"][data-idx="' + lbReturnFocus.split('|')[2] + '"]');
        if (back) back.focus({ preventScroll: true });
      }
      lbReturnFocus = null;
    }, 200);
  }

  /* ---------- 发布插件（仿 GitHub 新建仓库）：一张表把条目建完 ---------- */
  function pubOf() {
    if (!S.pub || typeof S.pub !== 'object') {
      S.pub = { name: '', desc: '', owner: ME(), visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' };
    }
    if (!S.pub.owner) S.pub.owner = ME();
    return S.pub;
  }
  function pubNameOk(n) { return /^[a-z0-9][a-z0-9-]{1,38}$/.test(n); }
  /* 拖拽区 / 已选文件块：抽出来是为了选完文件只换这一块，不整页重绘（重绘会丢输入焦点） */
  function pubFileBlock(pb) {
    return pb.file
      ? '<div class="pub-file"><span class="pf-ic" aria-hidden="true">📦</span>' +
        '<span class="pf-tx"><b>' + esc(pb.file.name) + '</b><br>' + esc(pb.file.size) + ' · sha256 ' + esc(pb.file.sha) + '</span>' +
        '<button type="button" class="pf-x" data-act="pubclear" aria-label="移除这个包">✕</button></div>'
      : '<button type="button" class="pub-drop" data-act="pubdrop"><span class="pd-ic" aria-hidden="true">🔎</span>' +
        '<span class="pd-t">把 .tgz 拖进来，算一下 sha256</span>' +
        '<span class="pd-d">只读文件名、大小与指纹，文件本身不上传（演示站点不上传也不保存）</span></button>';
  }

  /* 任何一处表单变化后，只重算「提交键可用态 + 还差什么 + 条款提示」这三处 DOM */
  function recalcPub() {
    const pb = pubOf();
    const ready = pubReady(pb);
    const btn = qs('[data-act="pubsubmit"]');
    if (btn) {
      btn.disabled = !ready;
      if (ready) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true');
    }
    const hint = qs('.pub-foot .pub-hint');
    if (hint) {
      hint.textContent = ready ? '条件都满足了，点右边创建。' : '还差：' + [
        pubNameOk(pb.name) ? '' : (pb.name ? '包名格式' : '包名'),
        pb.file ? '' : '包信息',
        pb.agreed.length >= 4 ? '' : '发布条款'
      ].filter(Boolean).join(' / ');
    }
    const tip = qs('.pub-terms-tip');
    if (tip) { if (pb.agreed.length >= 4) tip.setAttribute('hidden', ''); else tip.removeAttribute('hidden'); }
  }

  function pubReady(pb) {
    return pubNameOk(pb.name) && pb.agreed.length >= 4 && !!pb.file;
  }
  function publishPage() {
    const pb = pubOf();
    const me = profileOf(ME());
    const okName = pubNameOk(pb.name);
    const cats = pluginCats.slice();
    const lics = ['MIT', 'Apache-2.0', 'MPL-2.0', 'GPL-3.0', 'AGPL-3.0', '未声明'];
    const terms = [
      '我确认这个仓库是我自己的，或者我有权分发它。',
      '包内不含密钥、token、他人隐私数据。',
      '许可证与仓库里的 LICENSE 一致；没有 LICENSE 就选「未声明」。',
      '同意社群编辑条目正文，版本与包信息由我维护。'
    ];
    const agreeAll = pb.agreed.length >= terms.length;
    const ready = pubReady(pb);

    /* 左侧表单 */
    const nameRow = '<div class="pub-row">' +
      '<div class="pub-owner"><select id="pub-owner" aria-label="发布到哪个账号">' +
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map(function (k) {
        return '<option value="' + k + '"' + (pb.owner === k ? ' selected' : '') + '>' + esc(profileOf(k).nick) + '（' + esc(users[k].city) + '）</option>';
      }).join('') + '</select></div>' +
      '<div><input id="pub-name" type="text" maxlength="39" spellcheck="false" autocomplete="off"' +
      ' value="' + esc(pb.name) + '" placeholder="dsh-my-plugin" aria-label="插件包名"' +
      ' aria-describedby="pub-name-tip"></div></div>' +
      '<p class="pub-tip" id="pub-name-tip">' + (okName
        ? '包名可用：' + (pb.name ? '<b>' + esc(pb.name) + '</b>' : '<b>待填写</b>') + ' · 装好后命令是 <b>pnpm dsh add ' + esc(pb.name || 'dsh-my-plugin') + '</b>'
        : (pb.name ? '只能用<strong>小写字母、数字、连字符</strong>，2~39 个字符，且以字母或数字开头。' : '包名决定安装命令，建议 <b>dsh-</b> 开头，全小写。')) + '</p>';

    const visBlock = '<div class="pub-radios" role="radiogroup" aria-label="可见性">' +
      ['public', 'private'].map(function (v) {
        const on = pb.visibility === v;
        const t = v === 'public'
          ? ['公开', '任何人在条目库里都能搜到，包信息按你登记的档位展示。<span class="tag-free">免费</span>']
          : ['私有', '只有你自己能在「我的插件」里看到，适合内部工具或还没写完的东西。'];
        return '<button type="button" class="pub-radio ' + (on ? 'on' : '') + '" data-act="pubvis" data-v="' + v + '" role="radio" aria-checked="' + on + '">' +
          '<span class="dot" aria-hidden="true"></span><span class="rt"><b>' + t[0] + '</b><span>' + t[1] + '</span></span></button>';
      }).join('') + '</div>';

    const catBlock = '<div class="chips" style="margin-top:2px">' + cats.map(function (c) {
      return '<button type="button" class="chip ' + (pb.cat === c ? 'on' : '') + '" data-act="pubcat" data-v="' + c + '"' +
        ' aria-pressed="' + (pb.cat === c) + '">' + c + '</button>';
    }).join('') + '</div>';

    const dropBlock = pubFileBlock(pb);

    const termsBlock = '<div class="pub-checks">' + terms.map(function (t, i) {
      const on = pb.agreed.indexOf(i) >= 0;
      return '<button type="button" class="pub-check ' + (on ? 'on' : '') + '" data-act="pubchk" data-i="' + i + '"' +
        ' aria-pressed="' + on + '"><span class="bx" aria-hidden="true"></span><span>' + t + '</span></button>';
    }).join('') + '</div>';

    const previewName = pb.name || 'dsh-my-plugin';
    const prevCard = '<div class="pub-prev"><span class="pp-ico" style="background:' +
      'linear-gradient(135deg,#7fc9ff,#2f86d8)' + '" aria-hidden="true">🧩</span>' +
      '<span class="pp-tx"><b>' + esc(previewName) + '</b><span>' + esc(me.nick) + ' · v' + esc(pb.ver) + ' · ' + esc(pb.license) + '</span></span>' +
      '<span class="pub-radio-tag">' + (pb.visibility === 'public' ? '公开' : '私有') + '</span></div>';

    const main = '<div class="pub-main">' +
      '<div class="pub-field"><span class="pub-label">包名<i>*</i></span>' + nameRow + '</div>' +
      '<div class="pub-sep"></div>' +
      '<label class="pub-field"><span class="pub-label">一句话介绍</span>' +
        '<textarea id="pub-desc" maxlength="120" rows="2" placeholder="一句话说清它替你做了什么">' + esc(pb.desc) + '</textarea>' +
        '<p class="pub-tip">会显示在条目库卡片上，最长 120 字。写具体动词，别写「一个强大的工具」。</p></label>' +
      '<div class="pub-field"><span class="pub-label">可见性</span>' + visBlock + '</div>' +
      '<div class="pub-field"><span class="pub-label">分类</span>' + catBlock +
        '<p class="pub-tip">分类决定它出现在条目库哪个筛选里。</p></div>' +
      '<div class="pub-field"><span class="pub-label">许可证</span>' +
        '<select id="pub-license" aria-label="许可证">' + lics.map(function (l) {
          return '<option value="' + l + '"' + (pb.license === l ? ' selected' : '') + '>' + (l === '未声明' ? '未声明（只放外链）' : l) + '</option>';
        }).join('') + '</select>' +
        '<p class="pub-tip">选「未声明」的话，条目只保留外链，不展示包信息。</p></div>' +
      '<div class="pub-field"><span class="pub-label">首个版本的包信息<i>*</i></span>' + dropBlock +
        '<p class="pub-tip">登记后会算 sha256，条目页据此提示你核对；文件仍放在你的仓库。也可以稍后在「上传新版本」里补。</p></div>' +
      '<div class="pub-sep"></div>' +
      '<div class="pub-field"><span class="pub-label">发布前确认</span>' + termsBlock +
        '<p class="pub-tip pub-terms-tip"' + (agreeAll ? ' hidden' : '') + ' style="color:var(--rose-ink)">四条都勾上才能提交。</p></div>' +
      '</div>';

    const side = '<aside class="pub-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">发布流程</span></div><div class="side-bd">' +
        '<ol><li><b>建条目</b>：填包名、介绍、分类。</li><li><b>传安装包</b>：本地打包 .tgz。</li>' +
        '<li><b>人工审核</b>：查许可证与包内容，通常 1 个工作日。</li>' +
        '<li><b>上线</b>：条目出现在条目库，作者可继续发版。</li></ol></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">命名与规范</span></div><div class="side-bd">' +
        '<ul><li>社群插件统一 <b>dsh-</b> 前缀，避免和内置命令撞名。</li>' +
        '<li>包名与 <b>package.json</b> 的 name 必须一致。</li>' +
        '<li>README 写清安装、权限、卸载三件事。</li>' +
        '<li>用到网络或文件权限时，在条目里声明。</li></ul>' +
        '<div class="pub-code">pnpm dsh add ./' + esc(previewName) + '-0.1.0.tgz</div></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">卡片预览</span></div><div class="side-bd">' + prevCard +
        '<p class="pub-tip">这条会出现在条目库里，点进去是条目页。</p></div></div>' +
      '</aside>';

    const foot = '<div class="pub-foot"><span class="pub-hint">' +
      (ready ? '条件都满足了，点右边创建。' : '还差：' + [
        okName ? '' : (pb.name ? '包名格式' : '包名'),
        pb.file ? '' : '包信息',
        agreeAll ? '' : '发布条款'
      ].filter(Boolean).join(' / ')) + '</span>' +
      '<button type="button" class="btn ghost" data-act="pubreset">重置</button>' +
      '<button type="button" class="btn" data-act="procancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="pubsubmit"' + (ready ? '' : ' disabled aria-disabled="true"') + '>创建插件 ›</button></div>';

    const done = pb.stage === 'review'
      ? '<div class="card"><div class="card-hd"><h1 class="t">已提交，等审核</h1></div><div class="card-bd">' +
        '<div class="pub-done"><span class="pd-ok" aria-hidden="true">✅</span><div>' +
        '<b>' + esc(pb.name) + '</b> 已经进审核队列。审核通过后它会出现在条目库，作者栏是你。' +
        '<div class="pub-tip">审核期间可以继续改 README 与截图；安装包已经锁定，改包要重新提交。</div></div></div>' +
        '<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn sm blue" data-act="go" data-route="market">去条目库看看</button>' +
        '<button class="btn sm ghost" data-act="pubreset">再发一个</button></div></div></div>'
      : '';

    return '<div class="wrap deep solo">' + seaHTML() + '<div class="col-main">' +
      '<div class="card pub-page"><div class="card-hd"><h1 class="t">发布插件</h1>' +
      '<span class="more">仿 GitHub 新建仓库：填完就能上线</span></div>' +
      (pb.stage === 'review' ? done : '<div class="pub-wrap">' + main + side + '</div>' + foot) +
      '</div></div></div>';
  }

  /* ---------- v18 · 消息中心（整页） ----------
     弹层适合「快速扫一眼」，但二十条消息、五类筛选、批量已读塞进 330px 的下拉里就变成
     一个滚动条陷阱。所以整页版保留同样的三件事：左栏分类（带未读数）、顶部四类页签、
     时间倒序列表；列表行点开即已读并跳到对应位置，右侧还能单独标已读。 */
  function messagesPage() {
    const st = authState();
    if (st.mode !== 'authed') {
      /* 不在这里做闸门（闸门只管「需要身份的写操作」），消息是只读的：
         访客也能看这一页，但看到的是「登录后才有你的消息」，而不是一条空列表。 */
      return '<div class="wrap"><div class="col-main" style="grid-column:1/-1">' +
        '<div class="card"><div class="card-hd"><h1 class="t">消息中心</h1></div>' +
        '<div class="empty"><span class="big">🔔</span>登录后这里会显示回复、点赞、私信与通知' +
        '<div style="margin-top:12px"><button class="btn sm blue" data-act="go" data-route="login">去登录</button></div></div>' +
        '</div></div></div>';
    }
    const cur = S.noticeKind || 'all';
    const list = noticeList(cur);
    const tabs = '<div class="tabs nt-page-tabs" role="tablist" aria-label="消息分类">' +
      noticeKinds.map(function (k) {
        const n = noticeUnreadCount(k.id);
        const on = cur === k.id;
        return '<button type="button" role="tab" class="tab' + (on ? ' on' : '') + '" data-act="noticetab" data-kind="' + k.id + '"' +
          ' aria-selected="' + (on ? 'true' : 'false') + '">' + k.icon + ' ' + esc(k.name) +
          (n ? ' <i class="nt-n">' + n + '</i>' : '') + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      /* v33：私信是「会话」，不适合挤在按条排列的通知里，所以整页顶部单独给一个入口 */
      '<button type="button" class="btn sm ghost nt-dm-go" data-act="go" data-route="dm">✉ 私信' +
      '<i class="menu-n" data-n="dm"' + (dmUnreadTotal() ? '' : ' hidden') + '>' + dmUnreadTotal() + '</i></button>' +
      '<button type="button" class="btn sm ghost" data-act="readall"' +
      (noticeUnreadTotal() ? '' : ' disabled') + '>' + (cur === 'all' ? '全部已读' : '本类已读') + '</button></div>';
    const rows = list.length ? list.map(function (n) {
      const read = noticeIsRead(n);
      const to = n.to || {};
      return '<div class="nt-line' + (read ? ' is-read' : '') + '">' +
        '<div class="ni ' + n.tone + '">' + n.icon + '</div>' +
        '<div class="nt-main"><b class="' + (read ? '' : 'unread') + '">' + esc(n.title) + '</b>' +
        '<p>' + esc(n.desc) + '</p><time>' + esc(n.time) + '</time></div>' +
        '<div class="nt-acts">' +
        '<button type="button" class="btn sm ghost" data-act="noticeopen" data-id="' + n.id + '"' +
        ' data-route="' + esc(to.route || 'feed') + '"' + (to.uid ? ' data-uid="' + esc(to.uid) + '"' : '') +
        (to.tid ? ' data-tid="' + esc(to.tid) + '"' : '') + '>' + (n.kind === 'dm' && n.from ? '回私信' : '查看') + '</button>' +
        (read ? '<span class="nt-done" aria-hidden="true">✓ 已读</span>' : '<button type="button" class="nt-mark" data-act="noticedel" data-id="' + n.id + '"' +
          ' aria-label="把「' + esc(n.title) + '」标为已读">标为已读</button>') +
        '</div></div>';
    }).join('') : '<div class="empty"><span class="big">🍃</span>这一栏还没有消息</div>';
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card"><div class="card-hd"><h1 class="t">消息中心</h1>' +
      '<span class="more">共 ' + noticeList('all').length + ' 条 · ' + noticeUnreadTotal() + ' 条未读</span></div>' +
      tabs + '<div class="nt-page">' + rows + '</div></div></div>' +
      '<aside class="col-side"><div class="side-card"><div class="side-hd"><span class="t">消息设置</span></div>' +
      '<div class="side-bd" style="padding:12px 13px;font-size:12.5px;color:var(--txt-2);line-height:1.8">' +
      '<p style="margin:0 0 10px">点开一条消息即标为已读；「全部已读」会把四类一起清空。</p>' +
      '<button type="button" class="btn sm ghost" data-act="go" data-route="settings">通知偏好 ›</button>' +
      '</div></div></aside></div>';
  }

  /* ---------- v33 · 私信（站内一对一） ----------
     数据只有一份真源：S.dm[我][对方 uid] = [{ id, from:'me'|uid, text, at, read }]。
     会话列表不另存摘要 —— 最近一条消息既是预览也是排序键，否则「预览已经是新的、
     列表时间还停在旧的」这种错位迟早出现；未读同理，只从消息的 read 派生。

     消息中心里 n7 / n8 那两条「私信」不是会话本身，只是通知壳：点开它跳到这里，
     同时把对应会话标成已读（dmMarkRead 连通知一起收口，铃铛数字才不会和会话打架）。 */

  /* ---------- B 站口径的关系与限流 ----------
     演示站没有真实关注表，所以「谁关注了我」写死在 DM_FOLLOW_ME 里，
     「我关注了谁」放 S.dmFollow（点按钮可切，会落盘）。
     两边都真才算互关 —— 陌生人只能发 1 条、未关注人消息折叠，
     这些判断都从这两个集合现推，不另存「是不是陌生人」的布尔：
     关注关系一变，存下来的标记立刻就过期了。 */
  const DM_FOLLOW_ME = { u5: 1, u3: 1, u2: 1, u4: 1 };
  const DM_EMO = ['😀', '😂', '🥹', '😍', '🤔', '👀', '👍', '🎉', '🔥', '💡', '🌊', '🐳', '🐟', '✨', '🙏', '😭'];
  const DM_MAX = 500;
  const DM_RECALL = 2 * 60 * 1000;
  const DM_REP = ['垃圾广告', '人身攻击 / 辱骂', '色情低俗', '诈骗 / 引导私下交易'];

  function dmMetaOf(uid) {
    if (!S.dmMeta || typeof S.dmMeta !== 'object') S.dmMeta = {};
    const m = S.dmMeta[uid];
    if (!m || typeof m !== 'object') { S.dmMeta[uid] = {}; return S.dmMeta[uid]; }
    return m;
  }
  function dmFollowsMe(uid) { return !!DM_FOLLOW_ME[uid]; }
  function dmIFollow(uid) { return !!(S.dmFollow && S.dmFollow.has(uid)); }
  function dmMutual(uid) { return dmIFollow(uid) && dmFollowsMe(uid); }
  function dmRelation(uid) {
    if (dmMutual(uid)) return '互相关注';
    if (dmFollowsMe(uid)) return '关注了你';
    if (dmIFollow(uid)) return '你关注了 TA';
    return '未关注你';
  }
  /* 未关注人私信：TA 没关注我、我没点过「接收会话」、而且我从没回过去。
     只要我回过一句，它就自动离开折叠区 —— 回过的陌生人就是正常会话了。 */
  function dmIsStranger(uid) {
    if (!users[uid]) return false;
    const meta = dmMetaOf(uid);
    if (meta.accepted || dmFollowsMe(uid)) return false;
    const list = dmList(uid);
    if (!list.length) return false;
    return !list.some(function (m) { return m.from === 'me'; });
  }
  /* 陌生人对我的限流：最后一条对方消息之后我最多发 1 条，TA 再回一句才重置。
     返回我还能发几条（正常会话给 Infinity，调用处不用分情况）。 */
  function dmStrangerLeft(uid) {
    if (dmFollowsMe(uid) || dmMetaOf(uid).accepted) return Infinity;
    const list = dmList(uid).slice().sort(function (a, b) { return a.at - b.at; });
    let lastThem = -1;
    list.forEach(function (m, i) { if (m.from !== 'me') lastThem = i; });
    const mine = list.slice(lastThem + 1).filter(function (m) { return m.from === 'me' && !m.revoked; }).length;
    return Math.max(0, 1 - mine);
  }
  function dmDeletedAt(uid) { return dmMetaOf(uid).deletedAt || 0; }
  function dmIsBlocked(uid) { return !!dmMetaOf(uid).blocked; }
  function dmIsMuted(uid) { return !!dmMetaOf(uid).muted; }
  function dmCanSend(uid) {
    if (dmIsBlocked(uid)) return { ok: false, why: '你已拉黑 TA，解除拉黑后才能发私信' };
    if (dmStrangerLeft(uid) <= 0) return { ok: false, why: '对方还没关注你，等 TA 回复后可以继续发' };
    return { ok: true, why: '' };
  }
  /* 删过会话要等新消息来了才回到列表，不然刷新一次它又自己冒出来 */
  function dmVisible(t) {
    const del = dmDeletedAt(t.uid);
    return !del || !!(t.last && t.last.at > del);
  }
  function dmLastText(m) {
    if (!m) return '';
    return m.revoked ? '你撤回了一条消息' : m.text;
  }

  /* 演示会话：首次进入按当前账号播种一次。
     海盐柠檬 1 条未读（8 分钟前，和 n7 对得上）、豆腐 1 条未读（昨天，对应 n8）、
     阿离 3 条全已读（用来看「有历史但没有红点」长什么样）。 */
  function dmSeed() {
    const now = Date.now(), M = 60 * 1000, H = 60 * M, D = 24 * H;
    const box = {};
    box.u5 = [
      { id: 'sd-u5-1', from: 'me', text: '在吗？想请教个事。', at: now - 42 * M, read: true },
      { id: 'sd-u5-2', from: 'u5', text: '方便看下我那个 pnpm 报错吗？minimumReleaseAge 那个。', at: now - 8 * M, read: false }
    ];
    box.u3 = [
      { id: 'sd-u3-1', from: 'u3', text: '版务：条目 p4 的许可证要补一下，不然只能降成仅条目。', at: now - D - 30 * M, read: false },
      { id: 'sd-u3-2', from: 'me', text: '收到，今天补上。', at: now - D + 2 * M, read: true }
    ];
    box.u2 = [
      { id: 'sd-u2-1', from: 'u2', text: '那个 Blender 渲染管线，我把 .blend 发你？', at: now - 3 * D - 2 * H, read: true },
      { id: 'sd-u2-2', from: 'me', text: '好呀，顺便把合成节点也带上。', at: now - 3 * D - 2 * H + 5 * M, read: true },
      { id: 'sd-u2-3', from: 'u2', text: '👌 晚点一起发你。', at: now - 3 * D - 2 * H + 6 * M, read: true }
    ];
    /* 陌生人示例：小满没关注我，我也没回过 —— 落进「未关注人私信」折叠区 */
    box.u7 = [
      { id: 'sd-u7-1', from: 'u7', text: '你好呀，看到你在条目库挂的 offer-book 了，还招人一起维护吗？', at: now - 25 * M, read: false }
    ];
    return box;
  }
  function dmBox() {
    const me = ME();
    if (!me) return {};
    if (!S.dm || typeof S.dm !== 'object') S.dm = {};
    /* 服务端真实账号从没有会话开始：dmSeed() 里那四个人（海盐柠檬 / 豆腐 / 阿离 / 小满）
       是演示账号的样例对话，发给新账号就等于「有人给他发过私信」—— 事实上没有。 */
    if (!S.dm[me]) S.dm[me] = isSrvUid(me) ? {} : dmSeed();
    /* 规则升级到 v2：老存档里没有陌生人示例，补一条；dmVer 抬高后不再补 */
    if (!isSrvUid(me) && !(S.dmVer >= 2)) {
      if (!S.dm[me].u7) S.dm[me].u7 = dmSeed().u7;
      S.dmVer = 2;
      saveState();
    }
    /* 迁移（v33.2）：真实账号以前也被播过种，老存档里可能躺着四条演示对话。
       第一次进到这里时把它们清掉 —— 只删「整段都是 sd- 演示 id」的会话，
       用户自己发过的消息一条都不碰。 */
    if (isSrvUid(me) && !(S.dmVer >= 3)) {
      Object.keys(S.dm[me]).forEach(function (uid) {
        const list = S.dm[me][uid];
        if (Array.isArray(list) && list.length && list.every(function (m) { return /^sd-/.test((m && m.id) || ''); })) delete S.dm[me][uid];
      });
      S.dmVer = 3;
      saveState();
    }
    return S.dm[me];
  }
  function dmList(uid) {
    const box = dmBox();
    return Array.isArray(box[uid]) ? box[uid] : [];
  }
  function dmOpen(uid) {
    const box = dmBox();
    if (!Array.isArray(box[uid])) box[uid] = [];
    return box[uid];
  }
  function dmUnreadOf(uid) {
    return dmList(uid).filter(function (m) { return m.from !== 'me' && !m.read; }).length;
  }
  /* 未读合计只算正常会话：折叠区里的未关注人私信不打扰，
     头像弹层的角标、页面标题的 (n) 都走这一个口径 */
  function dmUnreadTotal() {
    const box = dmBox();
    let n = 0;
    Object.keys(box).forEach(function (uid) {
      if (!users[uid] || uid === ME() || dmIsBlocked(uid) || dmIsStranger(uid)) return;
      n += dmUnreadOf(uid);
    });
    return n;
  }
  /* 会话列表：谁有消息谁就是一条会话；排序看最后一条的时间，不是看谁先来的 */
  function dmThreads() {
    const me = ME();
    const box = dmBox();
    const out = Object.keys(box).filter(function (uid) {
      return users[uid] && uid !== me;
    }).map(function (uid) {
      const list = dmList(uid).slice().sort(function (a, b) { return a.at - b.at; });
      return {
        uid: uid, list: list, last: list[list.length - 1] || null,
        unread: dmUnreadOf(uid),
        stranger: dmIsStranger(uid),
        blocked: dmIsBlocked(uid),
        muted: dmIsMuted(uid)
      };
    }).filter(dmVisible);
    out.sort(function (a, b) { return (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0); });
    return out;
  }
  function dm2(n) { return (n < 10 ? '0' : '') + n; }
  function dmClock(ms) {
    const d = new Date(ms);
    return dm2(d.getHours()) + ':' + dm2(d.getMinutes());
  }
  function dmSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function dmYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  /* 列表里只给「够用的精度」：今天给时分，昨天写「昨天」，更早给日期 ——
     一行 296px 放不下「2026/10/23 08:12」，也没人需要。 */
  function dmWhen(ms) {
    const d = new Date(ms), now = new Date();
    if (dmSameDay(d, now)) return dmClock(ms);
    if (dmSameDay(d, dmYesterday())) return '昨天 ' + dmClock(ms);
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '/' + d.getDate();
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  /* 聊天区按天分隔。日期分隔条是「读消息时最先找的东西」，所以要写全一点 */
  function dmDayTitle(ms) {
    const d = new Date(ms), now = new Date();
    if (dmSameDay(d, now)) return '今天';
    if (dmSameDay(d, dmYesterday())) return '昨天';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function dmOneLine(text, n) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  /* 消息正文按纯文本渲染，只把换行翻成 <br>：私信里出现 <script> 就是一行字 */
  function dmBody(text) {
    return esc(text).replace(/\n/g, '<br>');
  }
  /* 标已读：会话里的对方消息 + 通知壳一起清。
     只清一半会出现「会话没红点了，铃铛还写着 1 条未读」，看着像两个功能各算各的账。 */
  function dmMarkRead(uid) {
    if (!uid) return false;
    let hit = false;
    dmList(uid).forEach(function (m) {
      if (m.from !== 'me' && !m.read) { m.read = true; hit = true; }
    });
    notices.forEach(function (n) {
      if (n.kind === 'dm' && n.from === uid && !noticeIsRead(n)) {
        S.noticeRead.add(n.id);
        hit = true;
      }
    });
    if (hit) S.noticesRead = noticeUnreadTotal() === 0;
    return hit;
  }
  /* 每个账号、每个联系人只自动回一次，免得变成刷屏机器人 */
  const dmAutoSeen = {};
  const DM_AUTO = {
    u5: '收到，我按你说的先看 minimumReleaseAge 那段～',
    u3: '版务这边记下了，许可证补上就能恢复包信息的展示。',
    u2: '好呀，晚点把 .blend 和合成节点一起发你。',
    u4: '远端部署那套我整理成步骤发你。',
    u8: '行，逆向样本我脱完壳再回你。'
  };
  /* 演示站没有第二个真人登录，所以第一次给某个演示账号发消息时，1.2 秒后 TA 回一句。
     这不是装饰用的假气泡：回复真的进会话、真的算未读、刷新也还在。
     接上真实多用户之后，删掉这个函数和 dmSend 里的调用即可，其余逻辑不用动。 */
  function dmAutoReply(uid, me) {
    const key = me + '|' + uid;
    if (dmAutoSeen[key]) return;
    dmAutoSeen[key] = true;
    /* 拉黑后 TA 不可能再回你，连定时器都别起，否则 1.2 秒后凭空冒出气泡 */
    if (dmIsBlocked(uid)) return;
    const line = DM_AUTO[uid] || '收到，我看一下，晚点回你。';
    setTimeout(function () {
      /* 这 1.2 秒里可能已经退出登录或换了账号：闭包里记的 me 对不上就别往别人桶里写 */
      if (ME() !== me) return;
      const box = dmBox();
      if (!Array.isArray(box[uid])) return;
      if (dmIsBlocked(uid)) return;
      const onPage = S.route === 'dm' && S.dmPeer === uid;
      /* 免打扰 / 未关注人：消息照收、未读照算，只是不弹 toast 打扰 */
      const quiet = dmIsMuted(uid) || dmIsStranger(uid);
      box[uid].push({
        id: 'dm-r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        from: uid, text: line, at: Date.now(), read: onPage
      });
      if (onPage) S.dmFocus = true;
      saveState();
      if (S.route === 'dm') render(true);
      if (!onPage && !quiet) toast(userOf(uid).name + ' 回了一句私信', '✉️');
    }, 1200);
  }

  function dmRowHTML(t) {
    const u = userOf(t.uid);
    const last = t.last;
    const prev = last ? (last.from === 'me' ? '我：' : '') + dmOneLine(dmLastText(last), 34) : '还没有消息，打个招呼吧';
    const hay = [u.name].concat(t.list.map(function (m) { return m.text; })).join(' ').toLowerCase();
    return '<button type="button" class="dm-row' + (S.dmPeer === t.uid ? ' on' : '') +
      (t.stranger ? ' is-str' : '') + (t.blocked ? ' is-blocked' : '') + '"' +
      ' data-act="dmopen" data-uid="' + t.uid + '" data-search="' + esc(hay) + '"' +
      (S.dmPeer === t.uid ? ' aria-current="true"' : '') + '>' +
      '<span class="dm-ava">' + av(t.uid, 42) + '</span>' +
      '<span class="dm-info"><span class="dm-top"><b>' + esc(u.name) + '</b>' +
      '<time>' + (last ? dmWhen(last.at) : '') + '</time></span>' +
      '<span class="dm-prev">' + esc(prev) + '</span></span>' +
      (t.muted ? '<span class="dm-mk" title="免打扰" aria-label="免打扰">🔕</span>' : '') +
      (t.blocked ? '<span class="dm-mk" title="已拉黑" aria-label="已拉黑">⛔</span>' : '') +
      (t.unread ? '<i class="dm-un" aria-label="' + t.unread + ' 条未读">' + (t.unread > 99 ? '99+' : t.unread) + '</i>' : '') +
      '</button>';
  }
  function dmMsgHTML(m, uid) {
    const me = m.from === 'me';
    /* 撤回后原消息不删，只留一行系统灰字：删掉的话聊天记录会出现时间跳跃，
       而且对方那边也应该看到「你撤回了一条消息」而不是一片空白 */
    if (m.revoked) {
      return '<div class="dm-sys">' + (me ? '你' : esc(userOf(uid).name)) + ' 撤回了一条消息</div>';
    }
    const left = DM_RECALL - (Date.now() - m.at);
    const canRecall = me && left > 0;
    return '<div class="dm-msg ' + (me ? 'me' : 'them') + '">' +
      (me ? '' : av(uid, 30, 'dm-sav')) +
      '<div class="dm-unit"><div class="dm-bub">' + dmBody(m.text) + '</div>' +
      '<div class="dm-meta"><time>' + dmClock(m.at) + '</time>' +
      (canRecall ? '<button type="button" class="dm-recall" data-act="dmrecall" data-mid="' + esc(m.id) + '">撤回</button>' : '') +
      '</div></div></div>';
  }
  function dmChatHTML(uid) {
    const u = userOf(uid);
    const list = dmList(uid).slice().sort(function (a, b) { return a.at - b.at; });
    let day = '';
    const rows = list.length ? list.map(function (m) {
      const d = dmDayTitle(m.at);
      let sep = '';
      if (d !== day) { day = d; sep = '<div class="dm-day"><span>' + d + '</span></div>'; }
      return sep + dmMsgHTML(m, uid);
    }).join('') : '';
    const iFollow = dmIFollow(uid);
    const blocked = dmIsBlocked(uid);
    const muted = dmIsMuted(uid);
    const stranger = dmIsStranger(uid);
    /* v34.1 · 「未关注」横幅按「对方没关注我且没接收会话」判，不按「我是否已发过」判：
       发过 1 条后会话会移回正常列表、dmIsStranger 变 false，但额度限制还在，
       横幅要是跟着消失，输入框被禁用就成了没来由的事。 */
    const notFollowed = !dmFollowsMe(uid) && !dmMetaOf(uid).accepted;
    const left = dmStrangerLeft(uid);
    const can = dmCanSend(uid);
    const metaLine = 'Lv.' + u.level + (u.badge ? ' · ' + u.badge : '') + (u.city ? ' · ' + u.city : '') + ' · ' + dmRelation(uid);
    /* 横幅只说最该说的那句：拉黑 > 未关注人私信；都不成立时整块不出现 */
    const banner = blocked
      ? '<div class="dm-banner ban"><span>⛔ 已拉黑 TA，双方都不能再发私信。</span>' +
        '<button type="button" class="btn sm ghost" data-act="dmblock" data-uid="' + uid + '">解除拉黑</button></div>'
      : notFollowed
        ? '<div class="dm-banner str"><span>📮 未关注人私信：TA 没关注你，一条之后要等 TA 回复；会话默认折叠在「未关注人私信」里。</span>' +
          (left !== Infinity && left <= 0 ? '<b>你已发过 1 条，等 TA 回复。</b>' : '') +
          '<button type="button" class="btn sm ghost" data-act="dmaccept" data-uid="' + uid + '">接收会话</button></div>'
        : '';
    const menu = S.dmMenu === uid ? '<div class="dm-menu" role="menu" aria-label="会话设置">' +
      '<button type="button" role="menuitem" data-act="dmspace" data-uid="' + uid + '">🙋 TA 的空间</button>' +
      '<button type="button" role="menuitem" data-act="dmfollow" data-uid="' + uid + '">' + (iFollow ? '✓ 取消关注' : '＋ 关注 TA') + '</button>' +
      '<button type="button" role="menuitem" data-act="dmmute" data-uid="' + uid + '">' + (muted ? '🔔 取消免打扰' : '🔕 免打扰') + '</button>' +
      '<button type="button" role="menuitem" data-act="dmreport" data-uid="' + uid + '">🚩 举报</button>' +
      '<button type="button" role="menuitem" class="danger" data-act="dmblock" data-uid="' + uid + '">' + (blocked ? '↩ 解除拉黑' : '⛔ 拉黑') + '</button>' +
      '<button type="button" role="menuitem" class="danger" data-act="dmdel" data-uid="' + uid + '">🗑 删除会话</button>' +
      '</div>' : '';
    const emo = S.dmEmo ? '<div class="dm-emo" role="group" aria-label="表情">' +
      DM_EMO.map(function (e) {
        return '<button type="button" data-act="dmextra" data-emo="' + e + '" aria-label="插入 ' + e + '">' + e + '</button>';
      }).join('') + '</div>' : '';
    const draft = (S.dmDraft || {})[uid] || '';
    /* 输入区三种状态：拉黑（换成说明）、额度用完（禁用但保留草稿）、正常 */
    const composer = blocked
      ? '<div class="dm-composer is-off"><div class="dm-offtext">⛔ 你已拉黑 TA，解除拉黑后才能继续发私信</div>' +
        '<button type="button" class="btn sm ghost" data-act="dmblock" data-uid="' + uid + '">解除拉黑</button></div>'
      : '<div class="dm-composer">' + emo +
        '<textarea id="dm-input" maxlength="' + DM_MAX + '" rows="1" placeholder="' +
        (can.ok ? '给 ' + esc(u.name) + ' 发私信…' : '等 TA 回复后才能继续发…') + '"' +
        (can.ok ? '' : ' disabled') +
        ' aria-label="私信内容，Enter 发送，Shift + Enter 换行">' + esc(draft) + '</textarea>' +
        '<div class="dm-cbar"><span class="dm-hint">' + (can.ok ? 'Enter 发送 · Shift + Enter 换行 · 2 分钟内可撤回' : esc(can.why)) + '</span>' +
        '<button type="button" class="dm-emobtn" data-act="dmemo" aria-expanded="' + (S.dmEmo ? 'true' : 'false') + '" aria-label="表情">😊</button>' +
        '<span class="dm-count" id="dm-count">' + String(draft.length) + ' / ' + DM_MAX + '</span>' +
        '<button type="button" class="btn blue" data-act="dmsend"' + (can.ok ? '' : ' disabled') + '>发送</button></div>' +
        '</div>';
    return '<header class="dm-chat-hd">' +
      '<button type="button" class="dm-back" data-act="dmback" aria-label="返回会话列表">‹</button>' +
      av(uid, 38) +
      '<div class="dm-chat-id"><b>' + esc(u.name) + '</b><span>' + esc(metaLine) + '</span></div>' +
      '<div class="dm-chat-acts">' +
      '<button type="button" class="btn sm' + (iFollow ? ' ghost' : ' blue') + ' dm-follow" data-act="dmfollow" data-uid="' + uid + '" aria-pressed="' + (iFollow ? 'true' : 'false') + '">' + (iFollow ? '已关注' : '关注') + '</button>' +
      '<button type="button" class="dm-more" data-act="dmmenu" aria-expanded="' + (S.dmMenu === uid ? 'true' : 'false') + '" aria-label="会话设置">⋯</button>' +
      menu + '</div>' +
      '</header>' + banner +
      '<div class="dm-body" id="dm-body" role="log" aria-live="polite" aria-label="与 ' + esc(u.name) + ' 的聊天记录">' +
      (rows || '<div class="dm-empty-chat"><span class="big" aria-hidden="true">👋</span><p>还没有消息，先打个招呼吧</p></div>') +
      '</div>' + composer;
  }
  /* 服务端账号的会话历史：进私信页时拉一次 GET /api/messages/:uid，
     拉到就替换本地占位；服务端为空且本地还有消息时不动本地。 */
  function dmPull(uid) {
    const me = ME();
    if (!me || !isSrvUid(me) || !uid || !isSrvUid(uid) || !window.API || !API.dmHistory) return;
    S.dmPulled = S.dmPulled || {};
    if (S.dmPulled[uid]) return;
    S.dmPulled[uid] = true;
    const meNum = String(me).replace(/^s/, '');
    API.dmHistory(uid).then(function (res) {
      const items = (res && res.data && res.data.items) || [];
      const box = dmBox();
      const list = items.map(function (m) {
        return {
          id: 'm' + m.id,
          from: String(m.from) === meNum ? 'me' : uid,
          text: m.body || '',
          at: (m.createdAt || 0) * 1000,
          read: true
        };
      });
      if (!list.length && (box[uid] || []).length) return;
      box[uid] = list;
      saveState();
      if (S.route === 'dm' && S.dmPeer === uid) render(false);
    }).catch(function () { S.dmPulled[uid] = false; });
  }
  /* 会话列表：服务端只给每个对话的最后一条，先用它把会话行立起来，
     点进去再由 dmPull() 拉完整历史。 */
  function dmPullList() {
    const me = ME();
    if (!me || !isSrvUid(me) || !window.API || !API.dmList) return;
    if (S.dmListPulled) return;
    S.dmListPulled = true;
    const meNum = String(me).replace(/^s/, '');
    API.dmList().then(function (res) {
      const items = (res && res.data && res.data.items) || [];
      const box = dmBox();
      items.forEach(function (it) {
        if (!it || !it.peer) return;
        const uid = API.adoptUser ? API.adoptUser(it.peer) : ('s' + it.peer.id);
        if (!uid || uid === me) return;
        if ((box[uid] || []).length) return;
        const last = it.last || {};
        box[uid] = [{
          id: 'm' + last.id,
          from: String(last.from) === meNum ? 'me' : uid,
          text: last.body || '',
          at: (last.createdAt || 0) * 1000,
          read: true
        }];
      });
      saveState();
      if (S.route === 'dm') render(false);
    }).catch(function () { S.dmListPulled = false; });
  }
  function dmPage() {
    const me = ME();
    if (!me) {
      return '<div class="wrap solo"><div class="card"><div class="empty"><span class="big">✉️</span>' +
        '登录后才能收发私信<div style="margin-top:12px">' +
        '<button class="btn sm blue" data-act="go" data-route="login">去登录</button></div></div></div></div>';
    }
    /* 深链 #/dm/<uid> 可能在 sync 完成前就被解析，users[uid] 还没有 —— 保留原串，
       等下一次 render（sync 之后）再认人；认不出来才回落成空，避免会话被静默丢弃。 */
    if (!S.dmPeer) {
      const dmHash = /^#\/dm\/([A-Za-z0-9_]+)/.exec(String(location.hash || ''));
      if (dmHash) S.dmPeer = dmHash[1];
    }
    if (S.dmPeer && S.dmPeer === me) S.dmPeer = '';
    const peer = S.dmPeer && users[S.dmPeer] ? S.dmPeer : '';
    if (peer) dmPull(peer);
    /* 打开会话即已读，和消息中心「点开一条即已读」同一套规矩；render 末尾会 saveState */
    if (peer) dmMarkRead(peer);
    const ths = dmThreads();
    const total = dmUnreadTotal();
    const q = String(S.dmQ || '').trim().toLowerCase();
    let shown = 0;
    const rowOf = function (t) {
      const hay = (userOf(t.uid).name + ' ' + t.list.map(function (m) { return m.text; }).join(' ')).toLowerCase();
      const hit = !q || hay.indexOf(q) >= 0;
      if (hit) shown++;
      const html = dmRowHTML(t);
      /* 搜索只用 hidden 属性切换，不重绘 —— 重绘会把光标从搜索框里踢出去 */
      return q && !hit ? html.replace('<button type="button" class="dm-row', '<button type="button" hidden class="dm-row') : html;
    };
    const strRows = ths.filter(function (t) { return t.stranger; });
    const mainRows = ths.filter(function (t) { return !t.stranger; });
    const rows = mainRows.map(rowOf).join('');
    /* 有搜索词就强制展开折叠区，否则会出现「搜到了但看不见」 */
    /* 正开着某个陌生人的会话时也掰开：否则当前聊天对象在自己列表里「消失」，看着像没点中 */
    const strOpen = !!S.dmStrOpen || !!q || (!!peer && dmIsStranger(peer));
    const strBox = strRows.length ? '<div class="dm-str' + (strOpen ? ' open' : '') + '">' +
      '<button type="button" class="dm-str-hd" data-act="dmstr" aria-expanded="' + (strOpen ? 'true' : 'false') + '">' +
      '<span>未关注人私信 <i>' + strRows.length + '</i></span>' +
      '<span class="dm-str-ar" aria-hidden="true">▸</span></button>' +
      '<div class="dm-str-bd"' + (strOpen ? '' : ' hidden') + '>' + strRows.map(rowOf).join('') + '</div></div>' : '';
    /* 空态常驻、只切 hidden：输入搜索时不能重绘（会踢掉焦点），
       所以「没有匹配」这块必须在首屏就存在，否则打字时无处显示 */
    const none = '<div class="dm-none" id="dm-none"' +
      ((q ? shown > 0 : ths.length > 0) ? ' hidden' : '') + '>' +
      (ths.length ? '没有匹配的会话' : '还没有会话，点右上角 ＋ 发起一条') + '</div>';
    const contacts = Object.keys(users).filter(function (uid) { return uid !== me; });
    const newbox = '<div class="dm-newbox"' + (S.dmNew ? '' : ' hidden') + '>' +
      '<div class="dm-newhd">选择联系人' + (contacts.length ? ' · 共 ' + contacts.length + ' 位' : '') + '</div>' +
      '<div class="dm-newgrid">' + contacts.map(function (uid) {
        const u = userOf(uid);
        return '<button type="button" class="dm-contact' + (peer === uid ? ' on' : '') + '" data-act="dmopen" data-uid="' + uid + '"' +
          ' title="和 ' + esc(u.name) + ' 聊天">' + av(uid, 34) + '<span>' + esc(u.name) + '</span>' +
          (dmIsBlocked(uid) ? '<i>已拉黑</i>' : dmList(uid).length ? '<i>已有会话</i>' : '<i>新会话</i>') + '</button>';
      }).join('') + '</div></div>';
    const side = '<aside class="dm-side">' +
      '<div class="dm-side-hd"><b>私信</b><span class="dm-total">' + (total ? total + ' 条未读' : '全部已读') + '</span>' +
      '<button type="button" class="dm-newbtn" data-act="dmnew" aria-expanded="' + (S.dmNew ? 'true' : 'false') + '"' +
      ' title="发起新私信" aria-label="发起新私信"><span aria-hidden="true">＋</span></button></div>' +
      newbox +
      '<div class="dm-search"><span aria-hidden="true">🔍</span>' +
      '<input id="dm-search" type="search" autocomplete="off" placeholder="搜联系人或消息" value="' + esc(S.dmQ || '') + '" aria-label="搜索私信"></div>' +
      '<div class="dm-list" id="dm-list">' + strBox + rows + none + '</div>' +
      '</aside>';
    const empty = '<div class="dm-empty"><span class="big" aria-hidden="true">✉️</span><h2>私信</h2>' +
      '<p>选左边的会话继续聊，或者发起一条新私信。</p>' +
      '<button type="button" class="btn sm blue" data-act="dmnew">＋ 发起私信</button></div>';
    const repU = S.dmRep && users[S.dmRep] ? userOf(S.dmRep) : null;
    const rep = repU ? '<div class="dm-rep-mask"><div class="dm-rep" role="dialog" aria-modal="true" aria-labelledby="dm-rep-t">' +
      '<div class="dm-rep-hd"><b id="dm-rep-t">举报 ' + esc(repU.name) + '</b>' +
      '<button type="button" class="dm-rep-x" data-act="dmrepclose" aria-label="关闭">✕</button></div>' +
      '<p class="dm-rep-tip">选一个理由。演示站不会真的发出去，只走完整流程。</p>' +
      '<div class="dm-rep-list">' + DM_REP.map(function (r, i) {
        return '<button type="button" class="dm-rep-it' + (S.dmRepWhy === i ? ' on' : '') + '" data-act="dmrepwhy" data-i="' + i + '">' +
          '<i class="dot" aria-hidden="true"></i>' + esc(r) + '</button>';
      }).join('') + '</div>' +
      '<div class="dm-rep-ft"><button type="button" class="btn sm ghost" data-act="dmrepclose">取消</button>' +
      '<button type="button" class="btn sm blue" data-act="dmrepsend">提交举报</button></div></div></div>' : '';
    return '<div class="wrap solo dm-page"><div class="card dm-card' + (peer ? ' has-peer' : '') + '">' +
      side + '<section class="dm-main">' + (peer ? dmChatHTML(peer) : empty) + '</section></div>' + rep + '</div>';
  }
  function dmSend() {
    const me = ME();
    if (!me) return;
    const uid = S.dmPeer;
    if (!uid || !users[uid]) return;
    /* 规则先于输入框：拉黑、陌生人 1 条，都在写消息之前拦住 */
    const chk = dmCanSend(uid);
    if (!chk.ok) { toast(chk.why, '🚫'); return; }
    const ta = qs('#dm-input');
    if (!ta) return;
    const text = String(ta.value || '').replace(/\s+$/, '');
    if (!text.trim()) { toast('先写点什么，再点发送', '✍️'); ta.focus({ preventScroll: true }); return; }
    if (text.length > DM_MAX) { toast('私信最多 ' + DM_MAX + ' 字', '✂️'); return; }
    const mine = {
      id: 'dm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      from: 'me', text: text.slice(0, DM_MAX), at: Date.now(), read: true
    };
    dmOpen(uid).push(mine);
    /* 发一条之后「删除会话」的旧时间戳要清掉，否则刷新会以为这是删过的旧会话 */
    dmMetaOf(uid).deletedAt = 0;
    S.dmDraft[uid] = '';
    S.dmFocus = true;
    S.dmEmo = false;
    saveState();
    render(true);
    /* 服务端账号：真的发出去（POST /api/messages/:uid），不再 1.2 秒后伪造一条「收到，我看一下」。
       演示账号（u1…）没有服务端行，才保留演示用的自动回复。 */
    if (window.API && API.dmSend && isSrvUid(uid)) {
      API.dmSend(uid, text).then(function (res) {
        const item = res && res.data && res.data.item;
        if (item) {
          mine.id = 'm' + item.id;
          if (item.createdAt) mine.at = item.createdAt * 1000;
          saveState();
        }
      }).catch(function (e) {
        mine.failed = true;
        saveState();
        if (S.route === 'dm') render(false);
        toast('私信没发出去：' + ((e && e.message) || '网络错误'), '⚠️');
      });
    } else if (!isSrvUid(me)) {
      dmAutoReply(uid, me);
    }
  }
  /* 2 分钟撤回：只打标记不删消息，聊天记录里留一行系统灰字 */
  function dmRecall(mid) {
    const uid = S.dmPeer;
    if (!uid) return;
    const m = dmList(uid).filter(function (x) { return x.id === mid; })[0];
    if (!m || m.from !== 'me' || m.revoked) return;
    if (Date.now() - m.at > DM_RECALL) { toast('超过 2 分钟，撤不回了', '⏱️'); render(true); return; }
    m.revoked = true;
    m.text = '';
    saveState();
    render(true);
    toast('已撤回', '↩️');
  }

  /* ---------- v27 · 我的收藏 / v33 · 扩到五类 ----------
     真源是五个 Set：post→S.fav、art→S.artFav、thread→S.favThread、
     plug→S.favPlug、user→S.favUser。favOrder 额外记混排顺序，解决「谁先收藏」
     在刷新后丢失的问题；它只是顺序索引，不参与「有没有收藏」的判断 ——
     Set 仍然是唯一真源，所以任何一处增删收藏，只要同时维护 Set + favOrder，
     列表、计数、按钮就不会各说各话。 */
  const FAV_KINDS = ['post', 'art', 'thread', 'plug', 'user'];
  const FAV_LABEL = { post: '日志', art: '作品', thread: '帖子', plug: '插件', user: '作者' };
  function favSet(kind) {
    const key = kind === 'art' ? 'artFav' : kind === 'thread' ? 'favThread'
      : kind === 'plug' ? 'favPlug' : kind === 'user' ? 'favUser' : 'fav';
    if (!(S[key] instanceof Set)) S[key] = new Set();
    return S[key];
  }
  /* 恢复存档时的收藏顺序补齐：必须等 FAV_KINDS 初始化完再跑（见 restoreState 里的注释）。 */
  sweepFavOrder();
  function favCount() { return FAV_KINDS.reduce(function (n, k) { return n + favSet(k).size; }, 0); }

  function postById(id) {
    const list = posts.concat(S.published || []);
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /* 帖子与插件的取项：帖子池含自己新发的，插件表就是 data.js 那份条目库 */
  function threadOf(id) {
    return threadPool().filter(function (t) { return t && t.id === id; })[0] || null;
  }
  function plugOf(id) {
    return (plugins || []).filter(function (p) { return p && p.id === id; })[0] || null;
  }
  function userExists(id) { return !!(id && (users[id] || (S.accounts && S.accounts[id]))); }

  function clip(s, n) {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (t.length <= n) return t;
    return t.slice(0, Math.max(1, n - 1)).replace(/[\s，。；：、,.;:!?！？-]+$/, '') + '…';
  }

  /* 日志没有标题字段：取正文首行当名称，剩下的当简介；
     首行太长时把第 36 字之后的部分接回简介，避免标题和简介各截一半、读起来重复。 */
  function favPostText(p) {
    const raw = String((p && p.text) || '').replace(/\r/g, '').trim();
    const lines = raw.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    let title = lines[0] || '无标题日志';
    let intro = lines.slice(1).join(' ');
    if (title.length > 36) {
      const rest = title.slice(36).replace(/^[\s，。；：、,.;:!?！？-]+/, '');
      title = clip(title.slice(0, 36), 36);
      intro = (rest + (intro ? ' ' + intro : '')).trim();
    }
    if (!intro) {
      const imgs = (p && Array.isArray(p.images) ? p.images.length : 0);
      /* 后端老数据里 comments 可能是数字（评论数）而不是数组；两种都算，别把 NaN 写进简介 */
      let cm = Array.isArray(p && p.comments) ? p.comments.length : (typeof (p && p.comments) === 'number' ? p.comments : 0);
      cm += (S.comments[p.id] || []).length;
      intro = [imgs ? '配图 ' + imgs + ' 张' : '', cm ? cm + ' 条评论' : ''].filter(Boolean).join(' · ') || '这条日志还没有正文简介。';
    }
    return { title: title, intro: intro };
  }

  function favKey(kind, id) { return kind + ':' + id; }

  /* 去重 + 把新收藏放到最前；pos 是撤销时用的原位置。 */
  function favAdd(kind, id, pos) {
    if (!id) return;
    const set = favSet(kind);
    set.add(id);
    if (!Array.isArray(S.favOrder)) S.favOrder = [];
    const key = favKey(kind, id);
    const at = S.favOrder.indexOf(key);
    if (at >= 0) S.favOrder.splice(at, 1);
    if (typeof pos === 'number' && pos >= 0 && pos <= S.favOrder.length) S.favOrder.splice(pos, 0, key);
    else S.favOrder.unshift(key);
  }

  /* 返回被删项原来的位置，撤销时插回去；-1 表示它本来就不在顺序表里。 */
  function favRemove(kind, id) {
    const set = favSet(kind);
    set.delete(id);
    if (!Array.isArray(S.favOrder)) return -1;
    const at = S.favOrder.indexOf(favKey(kind, id));
    if (at >= 0) S.favOrder.splice(at, 1);
    return at;
  }

  /* 取一个可读的名称给 toast 用；对象已失效时也要有话说。 */
  function favNameOf(kind, id) {
    if (kind === 'art') {
      const a = artOf(id);
      return a ? (a.title || '未命名作品') : '这件作品';
    }
    if (kind === 'thread') {
      const t = threadOf(id);
      return t ? (t.title || '无标题帖子') : '这条帖子';
    }
    if (kind === 'plug') {
      const p = plugOf(id);
      return p ? (p.name || '未命名插件') : '这个插件';
    }
    if (kind === 'user') return userExists(id) ? profileOf(id).nick : '这位作者';
    const p = postById(id);
    return p ? favPostText(p).title : '这条日志';
  }

  /* 存档合并规则：favOrder 只保留两个 Set 里仍然存在的 id，
     再把旧存档里没进顺序表的收藏按 Set 插入顺序倒着补到末尾。 */
  function sweepFavOrder() {
    const seen = {};
    const out = [];
    (Array.isArray(S.favOrder) ? S.favOrder : []).forEach(function (k) {
      if (typeof k !== 'string') return;
      const i = k.indexOf(':');
      if (i < 1) return;
      const kind = k.slice(0, i), id = k.slice(i + 1);
      const ok = FAV_KINDS.indexOf(kind) >= 0 && favSet(kind).has(id);
      if (!ok || seen[k]) return;
      seen[k] = 1; out.push(k);
    });
    /* 旧存档里没进顺序表的收藏：按 Set 插入顺序倒着补到末尾（最近的先补） */
    FAV_KINDS.forEach(function (kind) {
      Array.from(favSet(kind)).reverse().forEach(function (id) {
        const k = favKey(kind, id);
        if (!seen[k]) { seen[k] = 1; out.push(k); }
      });
    });
    S.favOrder = out;
  }

  function favEntries() {
    const out = [];
    const seen = {};
    const push = function (kind, id) {
      if (!id) return;
      const k = favKey(kind, id);
      if (seen[k]) return;
      const has = FAV_KINDS.indexOf(kind) >= 0 && favSet(kind).has(id);
      if (!has) return;
      seen[k] = 1;
      out.push({ kind: kind, id: id });
    };
    (Array.isArray(S.favOrder) ? S.favOrder : []).forEach(function (k) {
      if (typeof k !== 'string') return;
      const i = k.indexOf(':');
      if (i < 1) return;
      push(k.slice(0, i), k.slice(i + 1));
    });
    FAV_KINDS.forEach(function (kind) {
      Array.from(favSet(kind)).reverse().forEach(function (id) { push(kind, id); });
    });
    return out;
  }

  /* 没有真图时也得让每一行长得不一样：用 id 算一个稳定色相，刷新前后同一项颜色不变。 */
  function favHue(str) {
    const s = String(str || '');
    /* FNV-1a：s1 / s2 / s3 这种只差最后一位的 id，用 h*31 会挤在同一个色相，
       乘加后取模正是要让最后一位也把色相甩开 */
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    /* 再用黄金比例把 32 位哈希摊到 0–360：直接取模会让 s1 / s3 落在相邻色相，
       摊开之后相邻 id 的封面颜色才真的分得开 */
    return Math.round(((h >>> 0) * 0.618033988749895 % 1) * 360) % 360;
  }

  function favArtIcon(kind) {
    return ({ '插画': '🖼️', '动图': '🎞️', '表情包': '😄', '短漫': '💬', '手书': '✍️', '3D 模型': '🧊' })[kind] || '🖼️';
  }

  function favThumbHTML(kind, obj) {
    if (!obj) return '<div class="fav-thumb"><div class="fav-ph is-missing"><span aria-hidden="true">❓</span><em>已失效</em></div></div>';
    /* v33 · 插件用条目自带的渐变 + 图标；作者直接用头像；帖子没有图，按 id 摊一个稳定色相 */
    if (kind === 'plug') {
      return '<div class="fav-thumb"><div class="fav-ph" style="background:' + esc(obj.grad || '#dbe7f3') + '">' +
        '<span aria-hidden="true">' + esc(obj.icon || '🧩') + '</span><em>插件</em></div></div>';
    }
    if (kind === 'user') {
      const uid = typeof obj === 'string' ? obj : (obj.uid || obj.id);
      return '<div class="fav-thumb"><img src="' + esc(avURL(uid)) + '" alt="" loading="lazy" decoding="async"></div>';
    }
    if (kind === 'thread') {
      const th = favHue(obj.id || obj.title);
      return '<div class="fav-thumb"><div class="fav-ph" style="background:linear-gradient(135deg,hsl(' + th + ' 62% 70%),hsl(' + ((th + 44) % 360) + ' 58% 52%))">' +
        '<span aria-hidden="true">💬</span><em>帖子</em></div></div>';
    }
    if (kind === 'art') {
      if (obj.media) return '<div class="fav-thumb"><img src="' + esc(obj.media) + '" alt="" loading="lazy" decoding="async"></div>';
      if (obj.perm === 'index') return '<div class="fav-thumb"><div class="fav-ph is-index"><span aria-hidden="true">🔗</span><em>仅索引</em></div></div>';
      if (obj.model) return '<div class="fav-thumb"><div class="fav-ph" style="background:linear-gradient(135deg,#334155,#0f172a)"><span aria-hidden="true">🧊</span><em>' + esc(obj.model.fmt || '3D') + '</em></div></div>';
      const ah = favHue(obj.id || obj.title);
      return '<div class="fav-thumb"><div class="fav-ph" style="background:linear-gradient(135deg,hsl(' + ah + ' 72% 68%),hsl(' + ((ah + 42) % 360) + ' 64% 52%))"><span aria-hidden="true">' + favArtIcon(obj.kind) + '</span><em>' + esc(clip(obj.kind || '作品', 10)) + '</em></div></div>';
    }
    const im = (obj.images || [])[0];
    if (im && im.src) return '<div class="fav-thumb"><img src="' + esc(im.src) + '" alt="" loading="lazy" decoding="async"></div>';
    if (im) {
      const cap = im.title || im.label || (im.kind === 'shot' ? '截图' : '配图');
      return '<div class="fav-thumb"><div class="fav-ph" style="background:' + esc(im.grad || '#dbe7f3') + '"><span aria-hidden="true">' + (im.kind === 'shot' ? '🖥️' : '🖼️') + '</span><em>' + esc(clip(cap, 10)) + '</em></div></div>';
    }
    const ph = favHue(obj.id || obj.text);
    return '<div class="fav-thumb"><div class="fav-ph" style="background:linear-gradient(135deg,hsl(' + ph + ' 64% 70%),hsl(' + ((ph + 46) % 360) + ' 58% 55%))"><span aria-hidden="true">' + (obj.plugin ? '🧩' : '📝') + '</span><em>日志</em></div></div>';
  }

  function favItemHTML(entry) {
    const kind = entry.kind, id = entry.id;
    const obj = kind === 'art' ? artOf(id) : kind === 'thread' ? threadOf(id)
      : kind === 'plug' ? plugOf(id) : kind === 'user' ? (userExists(id) ? id : null) : postById(id);
    let title, intro, meta, badge = FAV_LABEL[kind] || '日志', missing = false;
    if (!obj) {
      missing = true;
      title = '这条收藏已不可见';
      intro = '内容可能已被作者删除，或这台设备还没有同步到它。可以取消收藏，把位置清出来。';
      meta = '失效收藏';
    } else if (kind === 'art') {
      title = clip(obj.title || '未命名作品', 44);
      intro = clip(obj.desc || obj.lic || '这件作品还没有简介。', 88);
      meta = artNick(obj.by) + ' · ' + (obj.date || obj.time || '—') + ' · ' + (obj.kind || '作品');
    } else if (kind === 'thread') {
      title = clip(obj.title || '无标题帖子', 44);
      intro = clip(obj.sub || obj.excerpt || '这条帖子还没有摘要。', 88);
      meta = (userOf(obj.user).name || '鲸友') + ' · ' + (obj.created || '—') + ' · ' + num(obj.replies) + ' 回复';
    } else if (kind === 'plug') {
      title = clip(obj.name || '未命名插件', 44);
      intro = clip(obj.desc || '这个条目还没有简介。', 88);
      meta = (userOf(obj.author).name || '鲸友') + ' · v' + (obj.ver || '—') + ' · ' + (obj.cat || '插件');
    } else if (kind === 'user') {
      const pf = profileOf(id), uu = users[id] || GUEST_USER;
      title = clip(pf.nick, 44);
      intro = clip(pf.sig || '这位作者还没有写签名。', 88);
      meta = [uu.badge || '鲸友', 'Lv.' + (uu.level || 1), num(uu.fans || 0) + ' 粉丝', (pf.province || '') + ' ' + (pf.city || '')].join(' · ');
    } else {
      const t = favPostText(obj);
      title = t.title;
      intro = clip(t.intro, 88);
      const u = userRow(obj.user);
      meta = (u.name || '鲸友') + ' · ' + (obj.time || '—');
    }
    const type = 'fav-type ' + kind;
    /* v42 · 整张卡片就是入口，右边的「查看」胶囊撤掉。
       用一张铺满卡片的透明按钮当点击区（.fav-open），而不是给 .fav-item 挂
       role="button" —— 卡里还有「取消收藏」这颗真按钮，嵌套可聚焦控件是坏的。
       铺层 z-index:1，「取消收藏」的 .fav-acts 抬到 z-index:2，所以点它不会误开。 */
    const openLayer = obj
      ? '<button type="button" class="fav-open" data-act="favopen" data-kind="' + kind + '" data-id="' + esc(id) + '"' +
        ' aria-label="打开：' + esc(title) + '"></button>'
      : '';
    const acts = '<div class="fav-acts">' +
      '<button type="button" class="fav-remove" data-act="unfav" data-kind="' + kind + '" data-id="' + esc(id) + '" aria-label="取消收藏' + esc(title) + '">取消收藏</button>' +
      '</div>';
    return '<div class="fav-item' + (missing ? ' is-missing' : '') + '" role="listitem" data-fav-key="' + kind + ':' + esc(id) + '">' +
      openLayer +
      favThumbHTML(kind, obj) +
      '<div class="fav-bd">' +
        '<div class="fav-title"><span class="' + type + '">' + badge + '</span><span class="tx">' + esc(title) + '</span></div>' +
        '<p class="fav-intro">' + esc(intro) + '</p>' +
        '<div class="fav-meta">' + esc(meta) + '</div>' +
      '</div>' + acts +
    '</div>';
  }

  function favEmptyHTML(mode) {
    if (mode === 'all') {
      return '<div class="fav-empty"><span class="fe-ic" aria-hidden="true">⭐</span><b>还没有收藏</b>' +
        '<p>在日志底部点「☆ 收藏」、帖子里点「☆ 收藏」、插件页点「☆ 收藏」、作者空间点「☆ 收藏作者」，想再看的东西就会留在这里。</p>' +
        '<div class="fe-acts"><button type="button" class="btn sm blue" data-act="go" data-route="feed">去首页逛逛</button>' +
        '<button type="button" class="btn sm ghost" data-act="go" data-route="art">看鲸鲸空间</button></div></div>';
    }
    return '<div class="fav-empty"><span class="fe-ic" aria-hidden="true">🫧</span><b>这一栏还没有收藏</b>' +
      '<p>你还没有收藏过' + (FAV_LABEL[S.favKind] || '内容') + '。</p>' +
      '<button type="button" class="btn sm ghost" data-act="favtab" data-kind="all">看看全部收藏</button></div>';
  }

  function favSide(total, n) {
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">收藏概览</span></div><div class="side-bd">' +
        '<div class="fav-stat-row">' +
          '<div><b>' + total + '</b><span>全部</span></div>' +
          '<div><b>' + n.post + '</b><span>日志</span></div>' +
          '<div><b>' + n.thread + '</b><span>帖子</span></div>' +
        '</div>' +
        '<div class="fav-stat-row">' +
          '<div><b>' + n.plug + '</b><span>插件</span></div>' +
          '<div><b>' + n.user + '</b><span>作者</span></div>' +
          '<div><b>' + n.art + '</b><span>作品</span></div>' +
        '</div>' +
        '<p class="fav-fine">收藏保存在这台设备的浏览器里，不会跟着账号同步到别的设备。</p>' +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">怎么收藏</span></div><div class="side-bd fav-how">' +
        '<p><b>日志</b>：卡片底部的「收藏」</p>' +
        '<p><b>帖子</b>：社群列表行左侧的「☆」或帖内「☆ 收藏」</p>' +
        '<p><b>插件</b>：插件详情页顶部按钮区的「收藏」</p>' +
        '<p><b>作者</b>：作者空间右上角的「☆ 收藏作者」</p>' +
        '<p><b>作品</b>：详情页的「☆ 收藏」</p>' +
        '<p>取消后 toast 上会留一个「撤销」，点它就能找回来。</p>' +
        '<button type="button" class="btn sm ghost" data-act="go" data-route="feed">去日志流</button>' +
      '</div></div>' +
    '</aside>';
  }

  function favPage() {
    const entries = favEntries();
    const n = { post: 0, art: 0, thread: 0, plug: 0, user: 0 };
    entries.forEach(function (e) { if (n[e.kind] != null) n[e.kind]++; });
    const list = entries.filter(function (e) { return S.favKind === 'all' || e.kind === S.favKind; });
    const tab = function (kind, label, n) {
      const on = S.favKind === kind;
      return '<button type="button" class="tab ' + (on ? 'on' : '') + '" data-act="favtab" data-kind="' + kind + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + label +
        '<span class="n">' + n + '</span></button>';
    };
    const body = entries.length === 0 ? favEmptyHTML('all')
      : (list.length ? '<div class="fav-list" role="list">' + list.map(favItemHTML).join('') + '</div>' : favEmptyHTML('tab'));
    /* v35：这一页不再挂左栏。原来那四张卡（快捷入口 / 我的 / 插件分类 / 社群版块）全是
       导航与筛选，与顶栏、「全部 / 日志 / …」页签、右栏「收藏概览 / 怎么收藏」说的是同一件事；
       这一页真正的动作只有一个 —— 在页签里挑一类，然后看列表。撤掉左栏把 176px 还给主列
       （.wrap.no-rail = 1fr + 300px，右侧 .col-side 照旧），与发布页「整根 aside 不渲染」同一套做法。 */
    return '<div class="wrap no-rail">' +
      '<div class="col-main">' +
        '<section class="fav-hero" aria-labelledby="fav-title">' +
          '<div class="fav-hero-bd"><span class="fav-kicker">MY COLLECTION</span>' +
          '<h1 id="fav-title">我的收藏</h1>' +
          '<p>想再看的日志与帖子、留着的插件、作者和作品，都收在这一页。最近收藏的排在最前面。</p></div>' +
          '<div class="fav-total"><b>' + entries.length + '</b><span>件收藏</span>' +
          '<em>日志 ' + n.post + ' · 帖子 ' + n.thread + ' · 插件 ' + n.plug + ' · 作者 ' + n.user + ' · 作品 ' + n.art + '</em></div>' +
        '</section>' +
        '<div class="card fav-page">' +
          '<div class="tabs fav-tabs">' +
            tab('all', '全部', entries.length) + tab('post', '日志', n.post) + tab('thread', '帖子', n.thread) +
            tab('plug', '插件', n.plug) + tab('user', '作者', n.user) + tab('art', '作品', n.art) +
            '<span class="spacer"></span><span class="fav-sort">最近收藏在前</span>' +
          '</div>' + body +
        '</div>' +
      '</div>' + favSide(entries.length, n) +
    '</div>';
  }

  /* v36 · AI 排行页：榜单数据与渲染都在 js/rank.js（像 tags.js 一样不读全局，
     由这里把 S / esc 递进去）。这样榜单表与页面壳互不牵扯，单独在 Node 里也能渲染核对。 */
  function rankPage() {
    if (!window.AIRank) {
      return '<div class="wrap no-rail"><div class="col-main"><div class="card"><div class="card-bd">' +
        '排行榜模块 js/rank.js 没加载（检查 index.html 里那一行 script）</div></div></div></div>';
    }
    return window.AIRank.html({ S: S, esc: esc });
  }

  /* v40 · 会员前台 / 赞助后台交给各自模块渲染（和 rank.js 同一种接法）：
     app.js 只提供路由与页面壳，模块缺失时给出可诊断的提示而不是白屏。 */
  function vipPage() {
    if (!window.Member) {
      return '<div class="wrap solo"><div class="card"><div class="card-bd">' +
        '会员模块 js/membership.js 没加载（检查 index.html 里那一行 script）</div></div></div>';
    }
    return window.Member.html({ S: S, esc: esc });
  }
  function adminPage() {
    if (!window.MemberAdmin) {
      return '<div class="wrap solo"><div class="card"><div class="card-bd">' +
        '赞助后台模块 js/membership-admin.js 没加载（检查 index.html 里那一行 script）</div></div></div>';
    }
    return window.MemberAdmin.html({ S: S, esc: esc });
  }

  /* 渲染错误边界：任何一页的模板抛错都只让这一页显示错误卡，
     不再把整棵 DOM 留成启动骨架（线上 #/plugin/p1 白屏就是这么来的）。 */
  function pageCrash(route, err) {
    const msg = err && err.message ? String(err.message) : '未知错误';
    return '<div class="wrap solo"><div class="card"><div class="empty">' +
      '<span class="big">🫧</span>' +
      '<h2 style="font-size:17px;margin:6px 0 8px">这个页面没能画出来</h2>' +
      '<p style="color:var(--txt-3);font-size:13px;margin:0 0 4px">错误已记进浏览器控制台（route: <code>' + esc(String(route || '')) + '</code>）。</p>' +
      '<p style="color:var(--txt-3);font-size:12px;margin:0 0 18px">' + esc(msg) + '</p>' +
      '<button class="btn sm blue" data-act="go" data-route="feed">回首页</button>' +
      '</div></div></div>';
  }
  function pageHTML() {
    try {
      return pageHTMLRaw();
    } catch (err) {
      console.error('[页面渲染失败] route=' + S.route, err);
      return pageCrash(S.route, err);
    }
  }
  function pageHTMLRaw() {
    if (S.route === 'vip') return vipPage();
    if (S.route === 'admin') return adminPage();
    if (S.route === 'favs') return favPage();
    if (S.route === 'rank') return rankPage();
    if (S.route === 'settings') return settingsPage();
    if (S.route === 'login') return loginPage();
    if (S.route === 'oauth') return oauthPage();
    if (S.route === 'verify') return settingsPage();
    if (S.route === 'messages') return messagesPage();
    if (S.route === 'dm') return dmPage();
    if (S.route === 'entry') return entryPage(S.pid);
    if (S.route === 'claim') return claimPage(S.pid);
    if (S.route === 'upload') return uploadPage(S.pid);
    if (S.route === 'publish') return publishPage();
    if (S.route === 'welcome') return welcomePage();
    if (S.route === 'policy') return policyPage();
    if (S.route === 'profile') return profilePage();
    if (S.route === 'art') return artSpacePage();
    if (S.route === 'artview') return artDetailPage(S.artId);
    if (S.route === 'market') return marketPage();
    if (S.route === 'forum') return forumPage();
    if (S.route === 'tags') return tagsPage();
    if (S.route === 'thread') return threadPage(S.threadId);
    if (S.route === 'space') return spacePage(S.spaceUser || ME());
    return feedPage();
  }

  /* 备案信息：合规要求「网站首页底部显著位置标明备案编号并链接到工信部备案系统」，
     公安联网备案另有独立的编号与查询地址。两个号都必须可点、可核对。
     集中成常量放在这里，将来改号只改这一处 —— 之前全站 HTML 与 JS 里一个备案号都没有，
     备案主体挂在境内、页面在境外，是最容易被判「备案信息不实」的形态。 */
  const ICP_NO = '津ICP备2026015987号-1';
  const ICP_URL = 'https://beian.miit.gov.cn/';
  const PSB_NO = '津公网安备 087edf92dec2200ed0fe392ef536d505 号';
  const PSB_URL = 'https://beian.mps.gov.cn/#/query/webSearch?code=087edf92dec2200ed0fe392ef536d505';

  const FOOTER = '<div class="footer"><a href="javascript:;">关于社群</a><a href="javascript:;">插件规范</a>' +
    '<a href="javascript:;" data-act="go" data-route="vip">赞助鲸域</a>' +
    '<a href="javascript:;" data-act="go" data-route="rank">AI 排行</a>' +
    '<a href="javascript:;" data-act="go" data-route="policy">转载与下架政策</a><a href="javascript:;">反馈与建议</a>' +
    '<a href="' + ICP_URL + '" target="_blank" rel="noopener noreferrer">' + ICP_NO + '</a>' +
    '<a href="' + PSB_URL + '" target="_blank" rel="noopener noreferrer">' + PSB_NO + '</a>' +
    '<span class="foot-mark">' + tail(13, 6.8) + ' © 2026 ' + BR.name + '</span></div>';

  /* P0：移动端底部导航（≤760px 显示） */
  function tabbarHTML() {
    const items = [['feed', '首页', '🏠'], ['art', '鲸鲸', '🐋'], ['market', '插件库', '🧩'], ['forum', '社群', '💬'], ['space', '我的空间', '👤']];
    const sub = ['entry', 'claim', 'upload'];
    return '<nav class="m-tabbar" aria-label="移动端导航">' + items.map(function (x) {
      const on = S.route === x[0] || (x[0] === 'art' && S.route === 'artview') || (x[0] === 'market' && sub.indexOf(S.route) >= 0);
      return '<a class="' + (on ? 'on' : '') + '" data-act="go" data-route="' + x[0] + '"' +
        (on ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + x[2] + '</span><span>' + x[1] + '</span></a>';
    }).join('') + '</nav>';
  }

  function hashOf() {
    if (S.route === 'favs') return '#/favs';
    if (S.route === 'settings') return '#/settings';
    if (S.route === 'login') return '#/login';
    if (S.route === 'oauth') return '#/oauth';
    if (S.route === 'verify') return '#/settings';
    if (S.route === 'messages') return '#/messages';
    if (S.route === 'dm') return '#/dm' + (S.dmPeer ? '/' + S.dmPeer : '');
    if (S.route === 'entry') {
      let h = '#/plugin/' + S.pid +
        (S.entryTab && S.entryTab !== 'code' ? '/' + S.entryTab : '');
      /* v47 · 文档页也能分享：#/plugin/<id>/contributing 与 #/plugin/<id>/license；
         v49 起再加上 /security、/changelog、/conduct（作者仓库里真有这几份文件时才有标签） */
      const DOC_SEG = { contrib: 'contributing', license: 'license', security: 'security', changelog: 'changelog', conduct: 'conduct' };
      if (S.entryTab === 'code' && DOC_SEG[S.ghReadmeTab]) {
        h += '/' + DOC_SEG[S.ghReadmeTab];
      }
      /* v46 · 选中的历史版本也写进地址栏；最新版保留短地址 #/plugin/<id>/releases，
         这样从侧栏点「全部」不会被一串旧 tag 粘住。 */
      if (S.entryTab === 'releases' && S.ghRel) {
        const tags = releaseTags(S.pid);
        if (tags.length && tags[0] !== S.ghRel && tags.indexOf(S.ghRel) >= 0) {
          h += '/' + encodeURIComponent(S.ghRel);
        }
      }
      return h;
    }
    if (S.route === 'claim') return '#/claim/' + S.pid;
    if (S.route === 'upload') return '#/upload/' + S.pid;
    if (S.route === 'publish') return '#/publish';
    if (S.route === 'welcome') return '#/welcome';
    if (S.route === 'policy') return '#/policy';
    if (S.route === 'profile') return '#/profile';
    if (S.route === 'artview') return '#/art/' + S.artId;
    if (S.route === 'thread') return '#/thread/' + S.threadId;
    /* 标签页把选择写进地址栏：#/tags/Blender/实测 —— 可以直接分享这一组组合 */
    if (S.route === 'tags') return '#/tags' + (S.tags.length ? '/' + S.tags.map(encodeURIComponent).join('/') : '');
    /* 排行页把数据源与范围写进地址栏：#/rank 是 LiveBench 全球榜（默认板），/rank/cn 是 LiveBench 国内榜，
       /rank/aa 是 AA 全球榜，/rank/aa/cn 是 AA 国内榜 —— 都能直接分享；排序维度不写（页内临时选择） */
    if (S.route === 'rank') {
      return '#/rank' + (S.rankBoard === 'aa' ? '/aa' : '') + (S.rankScope === 'cn' ? '/cn' : '');
    }
    if (S.route === 'space') return '#/space/' + (S.spaceUser || ME());
    /* 会员页把子路径写进地址栏：#/vip、#/vip/center、#/vip/pay/<订单号>。
       子路径由会员模块自己解析（它读 location.hash），这里只负责别把它抹掉。 */
    if (S.route === 'vip') {
      return '#/vip' + ((S.vipSub && S.vipSub.length) ? '/' + S.vipSub.map(encodeURIComponent).join('/') : '');
    }
    if (S.route === 'admin') return '#/admin/sponsors';
    return '#/' + S.route;
  }
  /* 第三方登录回跳的收尾。
     服务端（server/src/routes/oauth.js:376）授权成功后只负责建会话，然后 302 回
     #/login?oauth=ok&provider=github —— 「已经登录了」这件事得由页面自己认领：
     认领成功后直接进首页，认领失败就把错误码翻成人话贴在表单上方。
     为什么不在 applyHash 里同步判断身份：applyHash 在 boot 之前跑，那时 /me 还没回来，
     同步看一定是 guest；所以统一挂在 AUTH.ready 上，等身份确定再决定去哪。 */
  function settleOauthReturn(q) {
    if (!q) return;
    const m = {};
    q.split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i <= 0) return;
      const k = kv.slice(0, i);
      let v = kv.slice(i + 1);
      try { v = decodeURIComponent(v); } catch (err) { /* 保留原串，只用于展示 */ }
      m[k] = v;
    });
    if (m.oauth !== 'ok' && m.oauth !== 'error') return;
    const clean = function (hash) {
      try { history.replaceState(null, '', location.pathname + location.search + hash); } catch (err) { /* file:// 下不能改，忽略 */ }
    };
    if (m.oauth === 'ok') {
      const done = function () {
        const st = authState();
        if (st.mode === 'authed') {
          S.pop = null;
          if (needsOnboarding()) { goWelcome(); return; }
          S.route = 'feed';
          clean('#/feed');
          render(false);
          toast('欢迎回来，' + (st.name || ''), '👋');
        } else {
          S.route = 'login';
          clean('#/login');
          S.authErr = { msg: '第三方授权回来了，但服务端没给会话 —— 再点一次，或者直接用邮箱登录' };
          render(false);
        }
      };
      const auth = window.AUTH;
      if (auth && auth.ready && typeof auth.ready.then === 'function') auth.ready.then(done, done);
      else done();
      return;
    }
    /* 失败一律留在登录页，并把这串码拦在地址栏之外（刷新不该再弹一次）。 */
    const MAP = {
      OAUTH_DENIED: '你在授权页点了取消，随时可以再来',
      OAUTH_STATE: '授权校验过期了，重新点一次 GitHub 登录',
      OAUTH_CONFIG: '这个渠道还没配置好，先用邮箱登录',
      OAUTH_FAIL: '第三方返回的信息不完整，换一种方式登录试试'
    };
    S.route = 'login';
    clean('#/login');
    S.authErr = { msg: MAP[m.code] || ('第三方登录没成功（' + (m.code || '未知错误') + '）') };
  }

  function applyHash() {
    let h = (location.hash || '').replace(/^#\/?/, '');
    /* 旧解析器把 ? 当成路由名的一部分（#/login?oauth=ok 会被认成未知路由），
       所以先把 query 摘出来，再按 '/' 切段。 */
    let hq = '';
    const qi = h.indexOf('?');
    if (qi >= 0) { hq = h.slice(qi + 1); h = h.slice(0, qi); }
    const seg = h.split('/').filter(Boolean);
    if (!seg.length) return false;
    const r = seg[0];
    if (r !== S.route) { S.q = ''; S.pop = null; }
    /* #/plugin/<id> 是仓库首页；#/plugin/<id>/issues 这类深链直接落到对应标签。
       非法标签回落到 code，旧链接不受影响。 */
    if (r === 'plugin') {
      S.route = 'entry';
      if (seg[1]) S.pid = seg[1];
      resetEntryView(seg[2]);
      /* v47 · 贡献指南 / 许可证是 README 卡片里的两个独立页面：顶层仍然停在「代码」，
         只把卡片换到那一页，避免为两篇文档多长两个顶级标签。 */
      if (seg[2] === 'contributing' || seg[2] === 'license'
        || seg[2] === 'security' || seg[2] === 'changelog' || seg[2] === 'conduct') {
        S.entryTab = 'code';
        S.ghReadmeTab = seg[2] === 'contributing' ? 'contrib' : seg[2];
      }
      /* v46 · #/plugin/<id>/releases/<tag> 直达某个历史版本；标签不在账本里就回落到最新版，
         同时让 hashOf 把地址栏收回短形式，不留下一个打不开的 tag。 */
      if (S.entryTab === 'releases' && seg[3]) {
        let tag = seg[3];
        try { tag = decodeURIComponent(tag); } catch (err) { /* 保留原串，下面会校验 */ }
        S.ghRel = releaseTags(S.pid).indexOf(tag) >= 0 ? tag : '';
      }
      return true;
    }
    if (r === 'claim') { S.route = 'claim'; if (seg[1]) S.pid = seg[1]; return true; }
    if (r === 'upload') { S.route = 'upload'; if (seg[1]) S.pid = seg[1]; return true; }
    if (r === 'publish') { S.route = 'publish'; return true; }
    /* 收藏是身份页：tab 只是内存里的临时筛选，深链进来统一回到「全部」 */
    if (r === 'favs') { S.route = 'favs'; S.favKind = 'all'; return true; }
    /* v39 · #/rank[/(aa|lb)][/cn]：数据源可选，范围接在后面；两段都缺就是 LiveBench 全球榜
       （LiveBench 排在左侧第一个、是默认板，AA 要显式写 /aa）。
       排序维度不进地址栏（它是页内临时选择）。 */
    if (r === 'rank') {
      S.route = 'rank';
      let i = 1;
      S.rankBoard = 'lb';
      if (seg[i] === 'lb' || seg[i] === 'aa') { S.rankBoard = seg[i]; i += 1; }
      S.rankScope = seg[i] === 'cn' ? 'cn' : 'global';
      return true;
    }
    /* v40 · #/vip[/center|/pay/<订单号>]：子路径原样存下来，交给 js/membership.js 解析；
       路由只有一个 'vip'，深链换页由会员模块自己重画，不整页重渲染。 */
    if (r === 'vip') { S.route = 'vip'; S.vipSub = seg.slice(1); return true; }
    /* 赞助后台：是否管理员由服务端判（403 时页面自己说明），这里不做前端猜测 */
    if (r === 'admin') { S.route = 'admin'; return true; }
    if (r === 'policy') { S.route = 'policy'; return true; }
    if (r === 'settings') { S.route = 'settings'; return true; }
    if (r === 'login') { S.route = 'login'; settleOauthReturn(hq); return true; }
    /* v41 · 白板账号的落地页：能直接分享 / 刷新，不靠一次性跳转 */
    if (r === 'welcome') { S.route = 'welcome'; return true; }
    if (r === 'oauth') { S.route = 'oauth'; return true; }
    if (r === 'verify') { S.route = 'settings'; return true; }
    if (r === 'messages') { S.route = 'messages'; return true; }
    /* v33：私信深链 #/dm/<uid> 直接打开那个会话；不带 uid 就停在会话列表 */
    /* 解析时不一定已经拿到 users（刷新会在 sync 之前跑路由）—— 先原样存下 uid，
       认人交给 dmPage，避免深链 #/dm/s1 刷新后被静默清成会话列表。 */
    if (r === 'dm') { S.route = 'dm'; S.dmPeer = seg[1] || ''; return true; }
    if (r === 'profile') { S.route = 'profile'; return true; }
    if (r === 'thread') { S.route = 'thread'; if (seg[1]) S.threadId = seg[1]; return true; }
    if (r === 'space') { S.route = 'space'; S.spaceUser = seg[1] || ME(); return true; }
    /* v24 · #/tags/Blender/实测 → 标签页并预选这几个标签（最多 12 个，防超长 URL 打满页面） */
    if (r === 'tags') {
      /* 从别的页面进来时把组合规则复位成默认的交集：深链只带标签名，
         「任一满足」是页面上的临时选择，不该跟着上一个页面一起漂过来 */
      if (r !== S.route) S.tagMode = 'all';
      S.route = 'tags';
      S.tags = seg.slice(1).map(function (x) { return decodeURIComponent(x); }).slice(0, 12);
      return true;
    }
    if (r === 'art' && seg[1]) { S.route = 'artview'; S.artId = seg[1]; return true; }
    if (['art', 'market', 'forum', 'feed'].indexOf(r) >= 0) { S.route = r; return true; }
    return false;
  }
  /* 日志页与个人空间共用 S.tab：进入各自路由时归一化，避免出现「一个 tab 都不高亮」 */
  function syncTab() {
    const FEED_TABS = ['全部', '关注', '插件', '问答'];
    const SPACE_TABS = ['日志', '插件', '相册', '留言'];
    if (S.route === 'feed' && FEED_TABS.indexOf(S.tab) < 0) S.tab = '全部';
    if (S.route === 'space' && SPACE_TABS.indexOf(S.tab) < 0) S.tab = '日志';
    const FCATS = ['全部'].concat((D.categories || []).map(function (c) { return c.id; }));
    if (FCATS.indexOf(S.scat) < 0) S.scat = '全部';
  }

  let saveSlimWarned = false;
  /* 跨标签页同步闸门：storage 事件里同步完状态会重绘，而 render() 末尾无条件 saveState()。
     那条回写会再触发对方标签页的 storage 事件 —— 两个标签页就能来回对刷（实测 7–15ms 一次）。
     同步来的状态本来就出自 localStorage，不需要再写回去，重绘期间直接闭闸。 */
  let suppressSave = false;
  function saveState() {
    if (suppressSave) return;
    const out = {
      liked: Array.from(S.liked), reacts: Array.from(S.reacts), floorLiked: Array.from(S.floorLiked),
      installed: Array.from(S.installed), comments: S.comments, noticesRead: S.noticesRead,
      noticeRead: Array.from(S.noticeRead),
      fav: Array.from(S.fav), favOrder: S.favOrder, cmtLiked: Array.from(S.cmtLiked),
      /* v33 · 收藏扩到帖子 / 插件 / 作者，三份新集合跟着一起落盘 */
      favThread: Array.from(S.favThread), favPlug: Array.from(S.favPlug), favUser: Array.from(S.favUser),
      likePlug: Array.from(S.likePlug),
      newThreads: S.newThreads, newFloors: S.newFloors, msgs: S.msgs, dm: S.dm,
      dmMeta: S.dmMeta, dmFollow: Array.from(S.dmFollow), dmVer: S.dmVer,
      /* v15 · 多账号：整份账号表 + 当前是谁 */
      account: S.account, accounts: S.accounts,
      /* v22 · 鲸鲸空间的发布与互动（图片按 dataURL 存，单张已限 1.2MB） */
      arts: S.arts, artLikes: Array.from(S.artLikes), artFav: Array.from(S.artFav),
      artComments: S.artComments,
      /* v23 · 回复框草稿与最近用过的表情：刷新 / 换页都不丢 */
      rpDraft: S.rpDraft, rpEmojiRecent: S.rpEmojiRecent
    };
    const stripImgs = function (dropFloors, dropThreads) {
      const o = Object.assign({}, out);
      if (dropFloors) {
        const m = {};
        Object.keys(out.newFloors || {}).forEach(function (k) {
          m[k] = (out.newFloors[k] || []).map(function (f) {
            return f && f.images && f.images.length ? Object.assign({}, f, { images: [] }) : f;
          });
        });
        o.newFloors = m;
      }
      if (dropThreads) {
        o.newThreads = (out.newThreads || []).map(function (t) {
          return t && t.images && t.images.length ? Object.assign({}, t, { images: [] }) : t;
        });
      }
      return o;
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(out)); return; } catch (err) {}
    /* 配额爆了：先把最占地方的楼层 / 主楼配图摘掉再存一次，保住点赞、账号、资料这些
       小体量但更要紧的状态。以前这里静默 catch —— 一爆配额整份存档一起丢，包括账号。 */
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(stripImgs(true, false)));
      if (!saveSlimWarned) { saveSlimWarned = true; toast('本机存档空间不足：配图没能写进本地存档，文字已保存', '⚠️'); }
      return;
    } catch (err2) {}
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(stripImgs(true, true)));
      if (!saveSlimWarned) { saveSlimWarned = true; toast('本机存档空间不足：图片没能写进本地存档', '⚠️'); }
    } catch (err3) {}
  }

  /* 草稿防抖落盘：逐键写整份存档太重（楼层 / 作品配图都是 dataURL，逐键序列化会明显卡），
     所以 400ms 合并一次；pagehide 再兜一次 —— 刷新 / 关标签页回来草稿仍在（验收簇 C）。
     之前 input 只写内存 S.rpDraft，没有任何 saveState 调用点，刷新就丢。 */
  let draftSaveTimer = 0;
  function draftSaveSoon(delay) {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(function () { draftSaveTimer = 0; saveState(); }, delay || 400);
  }
  window.addEventListener('pagehide', function () {
    if (!draftSaveTimer) return;
    clearTimeout(draftSaveTimer); draftSaveTimer = 0; saveState();
  });

  /* P1 · 可访问性：非原生控件补 role/tabindex */
  function enhanceA11y() {
    document.querySelectorAll('[data-act]').forEach(function (el) {
      if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].indexOf(el.tagName) >= 0) return;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
  }

  /* 同页重绘后把焦点还回去：按 data-act + 语义 id 认回同一个控件 */
  function focusKeyOf(el) {
    if (!el || !el.dataset || !el.dataset.act) return '';
    const d = el.dataset;
    /* 筛选类控件（左栏分类 / 标签 / tab）靠 dataset 里的筛选值区分，否则同一 act 的
       七条分类会共用一个 key，重绘后焦点认回第一条 */
    /* 标签页的折叠按钮只有 data-g、组合规则只有 data-mode，也要认回来 */
    return [d.act, d.pid || d.id || d.cid || d.route || d.pop || d.t || '', d.cat || d.tag || d.tab || d.g || d.mode || d.kind || d.file || ''].join('|');
  }

  /* 进站闸门：登录只是第一道，手机号认证是第二道。
     公开可看的是「内容页」（首页 / 插件库 / 社群 / 帖子 / 政策 / 别人的空间），
     需要身份的是「以我的名义做事」的页面（发布、编辑资料、认领、上传、设置）。
     闸门放在 render 的最前面，任何入口（点链接、改 hash、后退）都绕不过去。 */
  /* v36 · rank（AI 排行）也是纯内容页：榜单是一份公开数据，没有理由拿账号当门槛 */
  /* v40 · vip 是公开页：没登录也能看档位与账本，下单时才要求身份 */
  /* v41 · welcome 是公开页：白板账号的落地页，访客进来会由页面自己换成登录表单 */
  const PUBLIC_ROUTES = ['feed', 'art', 'artview', 'market', 'forum', 'tags', 'thread', 'policy', 'entry', 'space', 'login', 'oauth', 'verify', 'messages', 'rank', 'vip', 'welcome'];
  function gateRoute() {
    if (!window.AUTH) return false;
    /* 身份还没确定就先不判：首绘发生在 AUTH.ready 之前，这时 state() 一律是 guest，
       直接按游客拦会把已登录的人甩到 #/login —— 刷新后深链 #/dm 会看到一张「已经登录了」的死页。
       等 ready 落定后 boot 会再画一帧，那一帧才真正决定去哪。 */
    if (window.AUTH.isReady && !window.AUTH.isReady()) return false;
    if (PUBLIC_ROUTES.indexOf(S.route) >= 0) {
      /* 「我的空间」是身份页，不是内容页：访客点进来（hash 没带 uid）直接去登录，
         不要用演示账号 u1 的空间冒充「我的」。带 uid 的别人的空间照旧公开可看。 */
      if (S.route === 'space' && !S.spaceUser && authState().mode !== 'authed') {
        S.route = 'login';
        S.authErr = { msg: '登录后才有自己的空间；没账号先注册一个' };
        return true;
      }
      /* 手机号认证已下线：旧的 #/verify 链接直接落到设置页 */
      if (S.route === 'verify') { S.route = 'settings'; return true; }
      return false;
    }
    const st = authState();
    /* 先把「你要去哪」记下来再改路由 —— 直接改完 S.route 再取标签，拿到的是 login 自己 */
    const label = GATE_LABEL[S.route] || '这个页面';
    if (st.mode !== 'authed') { S.route = 'login'; S.authErr = { msg: '请先登录：' + label + '需要用账号身份进入' }; return true; }
    /* 手机号认证是「软闸门」：用户在 #/verify 点过「跳过认证，先进站」之后，
       设置 / 编辑资料 / 发布插件 这些页不该再被弹回认证页。
       现实是短信通道还没接通，服务端也没有 requirePhone 拦截 —— 硬拦只会让人
       觉得站点坏了（跳过之后每点一次设置就回到认证页）。接上真实短信、
       准备把它变成硬闸门时，删掉 skipPhoneSaved() 这个条件即可。 */
    /* 手机号闸门的前提是「通道真的能发码」。短信没接通时（API.phoneEnabled() === false）
       这一道直接放行：否则用户被弹到 #/verify，点了发送却收不到码，页面等于死路。
       接上真实通道后 /api/auth/phone/config 会自动变成 true，闸门跟着收紧，前端不用改。 */
    /* 手机号闸门已移除：登录 = 邮箱或 GitHub，进站不再需要第二步 */
    return false;
  }
  const GATE_LABEL = { publish: '发布插件', profile: '我的资料', claim: '认领条目', upload: '上传版本', settings: '设置', favs: '我的收藏', dm: '私信' };

  function render(keep) {
    gateRoute();
    syncTab();
    const y = window.scrollY;
    const prevFocus = document.activeElement;
    const prevKey = focusKeyOf(prevFocus);
    const focusWasInPage = !!(prevFocus && prevFocus.closest && prevFocus.closest('#main'));
    /* 页面签名变了 = 整页切换（首次进入也算），才跑入场编排；同页状态更新不重播 */
    const sig = S.route + '|' + (S.route === 'thread' ? S.threadId
      : S.route === 'artview' ? S.artId
      : S.route === 'space' ? S.spaceUser
        : (S.route === 'entry' || S.route === 'claim' || S.route === 'upload') ? S.pid : '');
    const switched = sig !== pageSig;
    pageSig = sig;
    stopMeshLoop();
    const body = pageHTML();
    app.innerHTML = navHTML() + '<main id="main" tabindex="-1">' +
      ((switched || enterNext) ? enterWrap(body) : body) + '</main>' +
      FOOTER + lightboxHTML() + tabbarHTML();
    /* v42 · 新插入的 DOM 默认是中文：英文界面下立刻翻译一次，避免闪一帧中文 */
    if (window.I18N) I18N.apply(app);
    enterNext = false;
    /* 这一帧画进去的是第几版数据：同步回调据此判断还要不要重绘 */
    paintedDataVersion = dataVersionNow();
    /* 登录设备是异步的：先出帧，再去问服务端，回来再重画（只在设置页需要） */
    if (S.route === 'settings') loadDevices(false);
    /* 下拉是重绘插入的，补一帧再加 .open，过渡才从收起态起步 */
    const pop = qs('.pop');
    if (pop) requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('open')));
    /* 灯箱同理：先画收起态，下一帧再上 .open，才有一档放大淡入 */
    const lb = qs('.lightbox[data-lb]');
    if (lb) requestAnimationFrame(() => requestAnimationFrame(() => lb.classList.add('open')));
    const c = qs('#ccount');
    if (c) c.textContent = '0 / 500';
    const h = hashOf();
    /* 闸门会在渲染前改路由（访客点 #/settings → 改去登录页），这时地址栏还是那个进不去的 hash。
       两个条件缺一不可：路由变了要写，地址栏和实际显示对不上也要写。
       只改了路由但地址栏没跟上的那一支用 replaceState —— 把「进不去的那条」替换掉，
       而不是在历史里再塞一条，否则用户按后退会弹回同一个被拒的地址。 */
    const hashStale = (location.hash || '') !== h;
    if (h !== lastHashShown || hashStale) {
      const push = seeded && h !== lastHashShown && !fromHashNav;
      lastHashShown = h;
      try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (err) { location.hash = h; }
      seeded = true;
    }
    if (keep) window.scrollTo(0, y); else window.scrollTo({ top: 0, behavior: scrollMode() });
    /* v33：私信页有两根看不见的轴 —— 聊天区永远停在最新一条，输入框按需接焦点 */
    if (S.route === 'dm') {
      const db = qs('#dm-body');
      if (db) db.scrollTop = db.scrollHeight;
      const di = qs('#dm-input');
      if (di && (S.dmFocus || switched)) {
        S.dmFocus = false;
        try { di.focus({ preventScroll: true }); } catch (err) { di.focus(); }
        di.setSelectionRange(di.value.length, di.value.length);
        di.style.height = 'auto';
        di.style.height = Math.min(120, di.scrollHeight) + 'px';
      }
    }
    document.body.classList.toggle('lb-open', !!S.lb);
    /* 私信页自己有一整块输入区，右下那颗「写日志」悬浮球会压在发送键上方，进私信就收起来 */
    document.body.classList.toggle('dm-route', S.route === 'dm');
    saveState();
    enhanceA11y();
    /* 3D canvas 是 innerHTML 刚插进来的：卡片只画一帧（进视口才画），详情页才开动画 */
    hydrateMeshes();
    /* 会员页 / 后台是模块自渲染的：innerHTML 落地后把数据挂上去。
       地址没变就不重复挂载 —— 切主题、开关弹层这类同页重绘不该再打一次接口。 */
    if (S.route === 'vip' && window.Member) {
      const k = 'vip|' + (location.hash || '');
      if (k !== vipMountKey) { vipMountKey = k; window.Member.mount(); }
    } else if (S.route === 'admin' && window.MemberAdmin) {
      const k = 'admin|' + (location.hash || '');
      if (k !== vipMountKey) { vipMountKey = k; window.MemberAdmin.mount(); }
    } else { vipMountKey = ''; }
    /* 焦点交接：整块重写 innerHTML 会让焦点静默掉回 body，
       换页时给键盘用户落到主内容区，同页重绘则认回原控件 */
    const main = qs('#main');
    if (switched && !keep && main) {
      main.focus({ preventScroll: true });
    } else if (prevKey) {
      const back = qsa('[data-act="' + prevKey.split('|')[0] + '"]').filter(function (n) {
        return focusKeyOf(n) === prevKey;
      })[0];
      if (back) back.focus({ preventScroll: true });
      else if (switched && focusWasInPage && main) main.focus({ preventScroll: true });
    } else if (focusWasInPage && !document.activeElement.closest('#main') && main && !keep) {
      main.focus({ preventScroll: true });
    }
  }

  /* ---------- 事件 ---------- */
  /* 访客不能做的事：写日志、评论、点赞、收藏、安装、关注、发帖、回复、上传、
     认领、撤回、改资料、改通知偏好。只列「写」的动作，读的一概不管。 */
  /* 下载（dl）、切主题（theme/settheme）、切分类、翻页、开灯箱都不在列：那些是读。 */
  const GUEST_BLOCK = ['publish', 'sendcmt', 'like', 'tlike', 'flike', 'clike',
    'fav', 'favany', 'install', 'follow', 'react', 'rep', 'rpquote',
    /* 举报是例外：侵权与恶意代码的通知不该要求先注册 —— 一个还没账号的作者
       也应该能把自己被搬运的作品报上来。服务端已有 IP 限流兜底，不需要登录闸门。 */
    /* 'rpsend' 与 'rpt' 刻意不在这里 */
    'newthread', 'ntsubmit', 'ntcancel', 'ntpick',
    'claimverify', 'grant', 'withdraw', 'upsubmit', 'upver', 'upbreak', 'updrop', 'upclear', 'upreset',
    'pubsubmit', 'pubchk', 'pubdrop', 'pubclear', 'pubreset', 'pubvis', 'pubcat',
    'prosave', 'proreset', 'avafile', 'avapick', 'avaclear', 'coverpick', 'coverfile', 'coverclear', 'emoji', 'progender', 'protag',
    'setnotify',
    /* v22 · 鲸鲸空间：发布 / 喜欢 / 收藏 / 换图都是写；类型与排序是筛选，访客照样能用 */
    'artnew', 'artsubmit', 'artlike', 'artfav', 'artpick', 'artclear', 'artown', 'artperm',
    'artmodelpick', 'artmodelclear', 'cmsend', 'cmreply', 'cmdel',
    /* v33：私信发送是写操作；读会话列表是读，不拦 */
    'dmsend'];
  const GUEST_TX = {
    publish: '发日志', sendcmt: '评论', like: '点赞', tlike: '点赞', flike: '点赞', clike: '点赞',
    fav: '收藏', favany: '收藏', install: '安装插件', follow: '关注别人', react: '表态',
    rep: '回复', rpquote: '引用回复', rpsend: '回复', rpt: '回复',
    newthread: '发帖', ntsubmit: '发帖',
    claimverify: '认领条目', grant: '授权条目', withdraw: '撤回条目',
    upsubmit: '上传版本',
    prosave: '保存资料', proreset: '重置资料', avafile: '上传头像', avapick: '换头像',
    avaclear: '删头像', coverpick: '换封面', coverfile: '上传封面', coverclear: '换封面',
    emoji: '换头像', progender: '改性别', protag: '改标签',
    setnotify: '改通知设置',
    artnew: '发布二创', artsubmit: '发布二创', artlike: '喜欢作品', artfav: '收藏作品',
    artpick: '上传作品图', artclear: '换图', artown: '改发布身份', artperm: '改授权档位',
    artmodelpick: '上传 3D 模型', artmodelclear: '换模型', cmsend: '评论', cmreply: '回复', cmdel: '删除评论',
    dmsend: '发私信'
  };

  document.addEventListener('click', function (e) {
    /* e.target 不一定是 Element（合成事件可能落在 document 上），先收口成 Element 再 closest */
    const tgt = e.target && e.target.nodeType === 1 ? e.target : null;
    /* v40 · 点头像直接进对方的空间。这一段必须排在 [data-act] 之前：
       日志行、访客墙、私信列表行都是「整块可点」的容器，先取到外层动作的话，
       在私信列表里点头像会开聊天、在日志里点头像会开帖子，头像这一下就被吃掉了。
       排除的都是「头像只是控件的一部分」的地方 —— 提及面板（点了要插 @）、
       ＋新私信的联系人（点了要开聊天）、贡献者格子（外层已经是按钮）、
       账号弹层、会话菜单 / 举报层、灯箱。 */
    const avImg = tgt ? tgt.closest('img[data-avuid]') : null;
    if (avImg && !avImg.closest('.nav, .pop, .men-panel, .dm-newbox, .cn-cell, .dm-menu, .dm-rep, .lb')) {
      const au = avImg.getAttribute('data-avuid');
      if (au && users[au] && au !== ME()) {
        if (!(S.route === 'space' && S.spaceUser === au)) {
          S.spaceUser = au; S.route = 'space'; S.tab = '日志';
          S.pop = null; S.q = '';
          render(false);
        } else if (S.pop) { closePop(); }
        return;
      }
    }
    const el = tgt ? tgt.closest('[data-act]') : null;
    if (!el) {
      if (S.pop) closePop();
      return;
    }
    const act = el.dataset.act;

    /* 访客闸门：浏览类动作一律放行（看日志、翻条目库、开灯箱、切主题），
       会产生「以某人身份写进数据」的动作全部拦下来并送到登录页。
       以前没有这道闸：访客点「发表」也走本地演示流，帖子直接挂到默认账号名下，
       等于替一个没登录的人发了言。 */
    if (isGuest() && GUEST_BLOCK.indexOf(act) >= 0) {
      S.pop = null;
      toast('登录后才能' + GUEST_TX[act], '🔒');
      S.route = 'login'; S.authTab = 'login'; S.authErr = null;
      render(false);
      return;
    }

    /* v32 · 空间标签条那颗胶囊：文案跟着标签走，落点也跟着标签走。
       日志回日志页聚焦输入框，插件去发布页，相册开本机选图，留言聚焦本页留言框。
       四件事都不新增页面 —— 复用的是已有的写日志 / 发布 / 留言入口。 */
    if (act === 'spub') {
      const t = el.dataset.tab || S.tab;
      if (t === '插件') { S.route = 'publish'; S.pop = null; S.q = ''; S.authErr = null; render(false); return; }
      if (t === '日志') {
        if (S.route !== 'feed') { S.tab = '全部'; S.route = 'feed'; S.q = ''; S.pop = null; S.authErr = null; render(false); }
        const c = qs('#composer');
        if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'center', behavior: scrollMode() }); }
        else toast('已回到日志页，点输入框写点什么', '✍️');
        return;
      }
      if (t === '相册') { const inp = qs('#sp-photo-file'); if (inp) inp.click(); return; }
      if (t === '留言') {
        const ta = qs('#reply');
        if (ta) {
          ta.focus({ preventScroll: true }); ta.scrollIntoView({ block: 'center', behavior: scrollMode() });
          toast('写在这里，点「发表留言」发出去', '💬');
        }
        return;
      }
    }

    /* v32 · 相册里那格虚线「＋」：和标签条上的「发布照片」走同一个文件框 */
    if (act === 'spphoto') { const inp = qs('#sp-photo-file'); if (inp) inp.click(); return; }

    /* ---------- v33 · 私信 ---------- */
    if (act === 'dmopen' || act === 'dmto') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      S.route = 'dm'; S.dmPeer = uid; S.dmNew = false; S.dmFocus = true; S.pop = null; S.q = '';
      saveState(); render(act === 'dmopen'); return;
    }
    if (act === 'dmback') { S.dmPeer = ''; S.dmFocus = false; render(true); return; }
    if (act === 'dmnew') { S.dmNew = !S.dmNew; render(true); return; }
    if (act === 'dmspace') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      S.spaceUser = uid; S.route = 'space'; S.tab = '日志';
      render(false); return;
    }
    if (act === 'dmsend') { dmSend(); return; }
    if (act === 'dmrecall') { dmRecall(el.dataset.mid); return; }
    if (act === 'dmmenu') {
      if (!S.dmPeer) return;
      S.dmMenu = S.dmMenu ? '' : S.dmPeer;
      render(true);
      return;
    }
    /* 关注 / 免打扰 / 接收会话 / 拉黑 / 删除：全部只改 S.dmMeta 与 S.dmFollow，
       再整页重绘 —— 这几处都没有输入焦点，重绘不会丢东西 */
    if (act === 'dmfollow') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      if (dmIFollow(uid)) S.dmFollow.delete(uid); else S.dmFollow.add(uid);
      const on = dmIFollow(uid);
      S.dmMenu = '';
      saveState();
      render(true);
      toast(on ? '已关注 ' + userOf(uid).name : '已取消关注 ' + userOf(uid).name, '👥');
      return;
    }
    if (act === 'dmmute') {
      const uid = el.dataset.uid;
      if (!uid) return;
      const meta = dmMetaOf(uid);
      meta.muted = !meta.muted;
      S.dmMenu = '';
      saveState();
      render(true);
      toast(meta.muted ? '已开启免打扰，TA 的消息不再弹提示' : '已取消免打扰', meta.muted ? '🔕' : '🔔');
      return;
    }
    if (act === 'dmaccept') {
      const uid = el.dataset.uid;
      if (!uid) return;
      dmMetaOf(uid).accepted = true;
      saveState();
      render(true);
      toast('已接收会话，之后不再折叠', '📥');
      return;
    }
    if (act === 'dmblock') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      const meta = dmMetaOf(uid);
      meta.blocked = !meta.blocked;
      const on = !!meta.blocked;
      S.dmMenu = '';
      S.dmEmo = false;
      saveState();
      render(true);
      toast(on ? '已拉黑 ' + userOf(uid).name + '，双方都不能再发私信' : '已解除拉黑', on ? '⛔' : '✅');
      return;
    }
    if (act === 'dmdel') {
      const uid = el.dataset.uid;
      if (!uid) return;
      /* 只删本地会话：消息还留着，TA 再发一句它就回到列表 —— 和 B 站一致 */
      dmMetaOf(uid).deletedAt = Date.now();
      if (S.dmPeer === uid) S.dmPeer = '';
      S.dmMenu = '';
      saveState();
      render(true);
      toast('会话已删除，TA 再发消息会重新出现', '🗑️');
      return;
    }
    if (act === 'dmreport') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      S.dmRep = uid;
      S.dmRepWhy = -1;
      S.dmMenu = '';
      render(true);
      return;
    }
    if (act === 'dmrepwhy') { S.dmRepWhy = Number(el.dataset.i); render(true); return; }
    if (act === 'dmrepclose') { S.dmRep = ''; S.dmRepWhy = -1; render(true); return; }
    if (act === 'dmrepsend') {
      if (!S.dmRep) return;
      if (S.dmRepWhy < 0) { toast('先选一个举报理由', '🚩'); return; }
      S.dmRep = '';
      S.dmRepWhy = -1;
      render(true);
      toast('私信举报暂未接入后台，请把对方昵称与截图发到「站务反馈」版块，我们会留档处理', '🚩');
      return;
    }
    if (act === 'dmemo') { S.dmEmo = !S.dmEmo; render(true); return; }
    if (act === 'dmextra') {
      const uid = S.dmPeer;
      if (!uid) return;
      const cur = (S.dmDraft || {})[uid] || '';
      S.dmDraft[uid] = (cur + (el.dataset.emo || '')).slice(0, DM_MAX);
      S.dmEmo = false;
      S.dmFocus = true;
      render(true);
      return;
    }
    if (act === 'dmstr') { S.dmStrOpen = !S.dmStrOpen; render(true); return; }

    if (act === 'go') {
      if (el.dataset.id) S.pid = el.dataset.id;
      /* 菜单里的「我的空间」不带 uid：进当前账号的主页 */
      if (el.dataset.route === 'space' && !el.dataset.uid) { S.spaceUser = ME(); S.tab = '日志'; }
      /* 标签页有自己的选择状态：从别处点进标签页时清空，避免带着上次的组合进门 */
      if (el.dataset.route === 'tags') { S.tags = []; S.tagQ = ''; }
      /* 每次从菜单/左栏进收藏都回到「全部」，不带着上次看的单栏进门 */
      if (el.dataset.route === 'favs') S.favKind = 'all';
      /* v38 · 进插件页一律回到仓库首页（代码页），不继承上次停留的标签 */
      if (el.dataset.route === 'entry') resetEntryView('code');
      /* v40 · 会员页的落点由 data-sub 决定：菜单里的「我的赞助」直接进会员中心。
         没有 sub 就回落地页，并清掉上一次的深链残留。 */
      if (el.dataset.route === 'vip') S.vipSub = el.dataset.sub ? [el.dataset.sub] : null;
      S.route = el.dataset.route; S.pop = null; S.q = ''; S.authErr = null; render(false); return;
    }

    /* ---------- v17 · 登录 / 注册 / 第三方 / 手机号 ---------- */
    if (act === 'authtab') {
      const t = el.dataset.tab === 'register' ? 'register' : 'login';
      if (S.authTab === t && !S.authErr) return;
      S.authTab = t; S.authErr = null; render(true);
      const first = qs(t === 'register' ? '#rg-name' : '#lg-email');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    /* takeover 是「同一账号已在别处登录」之后的那一次重试：
       服务端只在 body.takeover === true 时才顶掉旧会话，默认不顶，避免两台设备互相踢。 */
    if (act === 'login' || act === 'register' || act === 'takeover') {
      if (!window.AUTH) { toast('登录内核未加载', '⚠️'); return; }
      const isReg = act === 'register';
      const taking = act === 'takeover';
      const form = taking && S.authForm ? S.authForm : {
        name: (qs('#rg-name') || {}).value || '',
        email: (qs(isReg ? '#rg-email' : '#lg-email') || {}).value || '',
        password: (qs(isReg ? '#rg-password' : '#lg-password') || {}).value || '',
        password2: (qs('#rg-password2') || {}).value || ''
      };
      if (taking) form.password2 = '';
      S.authForm = form;
      el.disabled = true;
      (isReg ? Promise.resolve().then(function () { return window.AUTH.register(form); })
        : Promise.resolve().then(function () { return window.AUTH.login(Object.assign({}, form, { takeover: taking })); }))
        .then(function (res) {
          const u = res.user || {};
          adoptAccount(u.uid, u.name);
          S.authErr = null; S.authForce = false; S.authForm = null; S.authTakeover = false;
          S.oauthPending = ''; S.phone = ''; S.phoneDev = ''; S.phoneCool = 0; S.phoneSent = false; S.phoneDelivered = null;
          S.pop = null;
          /* 身份一变，服务端认的「我」就换了：点赞态、关注态都按新会话重拉一次，
             否则页面还挂着上一个账号的红心。 */
          if (window.API && typeof window.API.sync === 'function') {
            try {
        window.API.sync().then(function () { dmPullList(); render(false); }, function () {});
      } catch (err) {}
          }
          if (needsOnboarding()) { goWelcome(); return; }
          S.route = 'feed';
          toast(isReg ? '注册成功，已自动登录' : '欢迎回来，' + (u.name || ''), '👋');
          markSkipPhone(true);
          render(false);
        })
        .catch(function (err) {
          el.disabled = false;
          S.authErr = authErrOf(err, isReg);
          render(true);
          if (err && err.code === 'NOT_REGISTERED') {
            const e1 = qs('#lg-email'); if (e1) e1.focus({ preventScroll: true });
          }
        });
      return;
    }
    if (act === 'oauth') {
      if (!window.AUTH) return;
      try {
        window.AUTH.oauthStart(el.dataset.p);
        S.oauthPending = el.dataset.p; S.authErr = null;
        S.route = 'oauth'; S.pop = null; render(false);
      } catch (err) {
        S.authErr = authErrOf(err, false); S.route = 'login'; render(false);
      }
      return;
    }
    if (act === 'obsave') { obSave(el); return; }
    if (act === 'obskip') { obSkip(); return; }
    if (act === 'oauthok') {
      const p = el.dataset.p || S.oauthPending;
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.oauthComplete(p); })
        .then(function (res) {
          adoptAccount(res.user.uid, res.user.name);
          S.oauthPending = ''; S.authErr = null; S.pop = null;
          if (needsOnboarding()) { goWelcome(); return; }
          S.route = 'feed'; toast('已用' + res.provider + '登录', '👋');
          render(false);
        })
        .catch(function (err) { el.disabled = false; S.authErr = authErrOf(err, false); render(true); });
      return;
    }
    if (act === 'oauthcancel') {
      S.oauthPending = ''; S.authErr = null; S.authTab = 'login';
      S.route = 'login'; render(false); return;
    }
    if (act === 'phsend') {
      const num = ((qs('#ph-num') || {}).value || '').trim();
      S.phone = num;
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.sendPhoneCode(num); })
        .then(function (r) {
          S.phoneDev = r.devCode || '';
          S.phoneSent = true;
          /* delivered 由服务端给：没接短信通道时是 false，此时不能提示「已发送」 */
          S.phoneDelivered = r.delivered !== false;
          /* AUTH 的 cooldown 已经是秒，别再除一次 —— 除完永远是 0，按钮不会进入倒计时 */
          S.phoneCool = Math.max(0, Math.round(r.cooldown || 60));
          S.authErr = null;
          render(true);
          toast(S.phoneDelivered ? ('验证码已发送到 ' + r.masked) : '短信通道未接通，可先跳过认证', S.phoneDelivered ? '📩' : '📵');
          tickPhoneCool();
        })
        .catch(function (err) {
          const btn = qs('[data-act="phsend"]'); if (btn) btn.disabled = false;
          S.authErr = authErrOf(err, false); render(true);
        });
      return;
    }
    /* 跳过手机号认证：服务端不强制（没有路由挂 requirePhone），前端也不该硬拦。
       清掉这一页的临时态，直接进站；设置页里仍留着「去认证」入口。 */
    if (act === 'skipverify') {
      S.authErr = null; S.phoneDev = ''; S.phoneSent = false; S.phoneDelivered = null; S.phoneCool = 0;
      if (phoneTimer) { clearInterval(phoneTimer); phoneTimer = null; }
      markSkipPhone(true);
      S.route = 'feed';
      render(false);
      toast('已跳过手机号认证，可以正常使用了', '👌');
      return;
    }
    if (act === 'phverify') {
      const num = ((qs('#ph-num') || {}).value || S.phone || '').trim();
      const code = ((qs('#ph-code') || {}).value || '').trim();
      S.phone = num;
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.verifyPhoneCode(num, code); })
        .then(function (r) {
          S.authErr = null; S.phoneDev = ''; S.phoneSent = false; S.phoneDelivered = null; S.phoneCool = 0; S.pop = null;
          markSkipPhone(false);
          S.route = 'feed';
          render(false);
          toast('手机号 ' + r.phone + ' 认证完成', '✅');
        })
        .catch(function (err) {
          const btn = qs('[data-act="phverify"]'); if (btn) btn.disabled = false;
          S.authErr = authErrOf(err, false); render(true);
        });
      return;
    }
    if (act === 'logout') {
      if (!window.AUTH) return;
      const done = function () {
        /* 退出后把「我的」相关的东西清干净：
           草稿、待发图片、头像槽都还挂着上一个人的选择，留着就会被下一个登录者继承。 */
        S.pop = null; S.authErr = null; S.authForce = false; S.authForm = null;
        S.oauthPending = ''; S.phone = ''; S.phoneDev = ''; S.phoneCool = 0; S.authTakeover = false;
        S.draft = null; S.fileErr = ''; S.pendingImages = []; S.ntImages = [];
        /* v46：设备列表属于上一个人，换号后连「读取中」都不该显示 */
        S.devices = null; S.devicesFor = ''; S.devicesErr = '';
        S.route = 'login'; S.authTab = 'login';
        render(false);
        toast('已退出登录，现在可以换个账号', '⏻');
      };
      /* 服务端会话没删掉就当作「没退出」—— 但本地呈现必须立刻变 guest，
         否则用户以为自己在登录页，实际身份还挂着，下一次发帖仍会发成功。 */
      Promise.resolve().then(function () { return window.AUTH.logout(); }).then(done, done);
      return;
    }
    if (act === 'setjump') {
      S.setPanel = el.dataset.id || 'set-acc'; S.authErr = null; render(true); return;
    }
    /* v46 · 登录设备：手动踢掉某台 / 踢掉其他全部。服务端删完会话再刷列表，
       万一失败就落到 authErr 里（和别的账号操作同一条错误通道）。 */
    if (act === 'devout') {
      const key = el.dataset.key || '';
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.kickDevice(key); })
        .then(function (r) {
          S.devices = (S.devices || []).filter(function (d) { return d.key !== key; });
          toast(r && r.revoked ? '那台设备已经退出登录' : '那台设备本来就不在线了', '📴');
          loadDevices(true);
        }, function (err) {
          el.disabled = false;
          S.authErr = authErrOf(err, false); render(true);
        });
      return;
    }
    if (act === 'devoutall') {
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.kickOthers(); })
        .then(function (r) {
          const n = (r && r.revoked) || 0;
          toast(n ? '已让 ' + n + ' 台其他设备退出' : '没有其他设备在线', '📴');
          loadDevices(true);
        }, function (err) {
          el.disabled = false;
          S.authErr = authErrOf(err, false); render(true);
        });
      return;
    }
    if (act === 'devreload') { loadDevices(true); return; }
    if (act === 'settheme') {
      const v = el.dataset.v === 'night' ? 'night' : 'day';
      document.documentElement.dataset.theme = v;
      try { localStorage.setItem('dsh-forum-theme', v); } catch (err) {}
      render(true); return;
    }
    /* 通知开关现在就是「全部已读」的另一个入口：打开 = 清未读，关闭 = 恢复成未读。
       两套状态（布尔 + 每条 id）并存只会互相打脸，所以统一落到 S.noticeRead 上。 */
    if (act === 'setnotify') {
      if (S.noticesRead) { S.noticeRead = new Set(); S.noticesRead = false; }
      else { notices.forEach(function (n) { S.noticeRead.add(n.id); }); S.noticesRead = true; }
      saveState(); render(true);
      toast(S.noticesRead ? '已全部标记为已读' : '已恢复未读提醒', '🔔');
      return;
    }

    /* ---------- v7 · 编辑资料（整页，参考 B 站账号资料） ---------- */
    /* ---------- v8：发布插件 ---------- */
    if (act === 'pubvis') {
      pubOf().visibility = el.dataset.v;
      qsa('[data-act="pubvis"]').forEach(function (b) {
        const on = b.dataset.v === S.pub.visibility;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      const tag = qs('.pub-prev .pub-radio-tag');
      if (tag) tag.textContent = S.pub.visibility === 'public' ? '公开' : '私有';
      return;
    }
    if (act === 'pubcat') {
      pubOf().cat = el.dataset.v;
      qsa('[data-act="pubcat"]').forEach(function (b) {
        const on = b.dataset.v === S.pub.cat;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      return;
    }
    if (act === 'pubdrop' || act === 'pubclear') {
      const pb = pubOf();
      if (act === 'pubdrop') {
        const slug = (pb.name || 'dsh-my-plugin');
        pb.file = { name: slug + '-' + pb.ver + '.tgz', size: '1.2 MB', sha: 'c41f7a09be2d…（演示值）' };
      } else { pb.file = null; }
      const box = qs('.pub-drop, .pub-file');
      if (box) {
        const tmp = document.createElement('div');
        tmp.innerHTML = pubFileBlock(pb);
        box.parentNode.replaceChild(tmp.firstChild, box);
      }
      recalcPub();
      if (act === 'pubdrop') toast('已读取包内 package.json', '📦');
      return;
    }
    if (act === 'pubchk') {
      const pb = pubOf(), i = +el.dataset.i, k = pb.agreed.indexOf(i);
      if (k >= 0) pb.agreed.splice(k, 1); else pb.agreed.push(i);
      /* 局部切换这一条：整页重绘会让输入框失焦，也会把正在滚动的表单弹回顶部 */
      const on = pb.agreed.indexOf(i) >= 0;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      recalcPub(); return;
    }
    if (act === 'pubreset') {
      S.pub = { name: '', desc: '', owner: ME(), visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' };
      render(true); toast('表单已清空', '🧹'); return;
    }
    if (act === 'pubsubmit') {
      const pb = pubOf();
      if (!pubReady(pb)) { toast('还差几项没填完', '⚠️'); return; }
      /* 真提交：以前只把 stage 改成 review，服务端连这条路由都没有，
         刷新后表单内容凭空消失。 */
      if (!window.API || !API.publishPlugin) {
        pb.stage = 'review';
        render(false); toast('已提交，等人工审核', '✅'); return;
      }
      const pkg = String(pb.name || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
      pb.busy = true; render(false);
      API.publishPlugin({
        pkg: pkg,
        desc: String(pb.desc || '').trim(),
        ver: String(pb.ver || '').trim(),
        cat: pb.cat || '',
        tags: [],
        license: String(pb.license || '').trim(),
        repo: String(pb.repo || '').trim()
      }).then(function (res) {
        pb.busy = false;
        pb.stage = 'review';
        const item = res && res.data && res.data.item;
        if (item && item.id) {
          /* 先同步一次，让新条目进 D.plugins —— 否则 entry 页按 id 找不到，会落进空态。 */
          const go = function () {
            S.pid = 'p' + item.id;
            saveState();
            toast('已提交，条目已入库', '✅');
            S.route = 'entry'; S.pop = null; render(false);
          };
          if (window.API && API.sync) API.sync().then(go, go); else go();
          return;
        }
        render(false); toast('已提交，等人工审核', '✅');
      }).catch(function (e) {
        pb.busy = false; render(false);
        if (e && e.code === 'PKG_TAKEN') { toast('这个包名已经有人用了，换一个', '📦'); return; }
        if (e && e.code === 'BAD_PKG') { toast('包名只能用小写字母、数字、点和横线', '📦'); return; }
        toast('提交失败：' + ((e && e.message) || '网络错误'), '⚠️');
      });
      return;
    }
    if (act === 'projump') {
      const sec = document.getElementById(el.dataset.id || '');
      if (sec) sec.scrollIntoView({ block: 'start', behavior: scrollMode() });
      qsa('.pro-nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.id === el.dataset.id); });
      return;
    }
    if (act === 'avapick') {
      const pa = profileOptions.avatarPresets[+el.dataset.id];
      if (!pa) return;
      acct().avatar = { grad: pa.grad, emoji: pa.emoji };
      S.avatarFile = null; S.avatarSyncing = null; S.avatarErr = ''; S.avatarBusy = false; S.avatarToken = (S.avatarToken || 0) + 1;
      S.fileErr = ''; saveState(); render(true);
      toast('已换上预设头像', '🎨');
      /* 预设头像 = emoji + 渐变两个字段，同步到账号后别的设备也能拿到同一张 */
      if (!isGuest() && window.API && API.updateMe) {
        API.updateMe({ emoji: pa.emoji, grad: pa.grad }).catch(function () {
          toast('头像只换在本机，账号同步失败', '⚠️');
        });
      }
      return;
    }
    if (act === 'avafile') { const inp = qs('#ava-file'); if (inp) inp.click(); return; }
    if (act === 'avaclear') {
      acct().avatar = null; S.avatarFile = null; S.avatarSyncing = null; S.avatarErr = ''; S.avatarBusy = false; S.avatarToken = (S.avatarToken || 0) + 1;
      S.fileErr = ''; saveState(); render(true);
      toast('已恢复默认头像', '↩️');
      if (!isGuest() && window.API && API.updateMe) {
        API.updateMe({ avatar: '', emoji: '', grad: '' }).catch(function () {});
      }
      return;
    }
    if (act === 'coverpick') {
      const cv = profileOptions.covers[+el.dataset.id];
      if (!cv) return;
      S.coverErr = ''; acct().cover = cv.grad; saveState(); render(true);
      toast('封面已换成「' + cv.note + '」', '🖼️'); return;
    }
    /* 上传本地封面：这一格只负责把系统文件框点开，
       真正的读取/缩放/压字节在 handleCoverFile() 里做（见下方 change 委托） */
    if (act === 'coverfile') { const inp = qs('#cover-file'); if (inp) inp.click(); return; }
    if (act === 'coverclear') {
      S.coverErr = ''; acct().cover = ''; saveState(); render(true);
      toast('已恢复默认封面', '↩️'); return;
    }
    if (act === 'progender') { draftOf().gender = el.dataset.id || '保密'; render(true); return; }
    if (act === 'protag') {
      const d = draftOf(), kind = el.dataset.kind === 'interests' ? 'interests' : 'tags';
      const v = el.dataset.id || '';
      const arr = d[kind];
      const at = arr.indexOf(v);
      if (at >= 0) arr.splice(at, 1);
      else {
        if (kind === 'tags' && arr.length >= 6) { toast('擅长最多选 6 个', '🏷️'); return; }
        if (kind === 'interests' && arr.length >= 5) { toast('感兴趣的方向最多 5 个', '🏷️'); return; }
        arr.push(v);
      }
      render(true); return;
    }
    if (act === 'procancel') {
      /* 取消 = 丢弃这一页改过的草稿，回到空间；已保存的资料不动 */
      S.draft = null; S.fileErr = ''; S.coverErr = '';
      S.route = 'space'; S.spaceUser = ME(); S.pop = null; S.q = '';
      render(false); return;
    }
    if (act === 'proreset') {
      S.draft = null; S.fileErr = ''; S.coverErr = '';
      S.accounts[ME()] = { profile: null, avatar: null, cover: '' };
      saveState(); render(true);
      toast('资料已恢复默认', '↩️'); return;
    }
    if (act === 'prosave') { commitProfile(); return; }
    if (act === 'railtab') { S.route = 'feed'; S.tab = el.dataset.tab; S.q = ''; render(false); return; }
    if (act === 'railsort') { S.route = 'market'; S.sort = el.dataset.sort; S.cat = '全部'; S.q = ''; render(false); return; }
    if (act === 'railforum') { S.route = 'forum'; S.fsort = el.dataset.sort; S.ftag = '全部'; S.q = ''; render(false); return; }
    /* 分类卡的「展开 / 收起」：只改左栏自己的状态，不动筛选（读动作，访客也能点） */
    if (act === 'railmore') { S.mcatOpen = !(S.mcatOpen !== false); render(false); return; }
    if (act === 'railcat') { S.route = 'market'; S.cat = el.dataset.cat; S.q = ''; S.sort = '热度'; render(false); return; }
    /* 换号入口已撤（v15 的八格切号器）。万一还有别处发出这个 act，
       也必须落在同一条规则上：不允许在已登录的会话里换账户。 */
    if (act === 'switchacc') {
      S.pop = null; render(false);
      toast('已登录状态下不能切换账户，请先退出登录', '🔒'); return;
    }
    if (act === 'user') { S.spaceUser = el.dataset.uid; S.route = 'space'; S.tab = '日志'; S.pop = null; render(false); return; }
    if (act === 'lang') {
      const next = el.dataset.lang;
      if (!window.I18N || !next || next === I18N.lang()) return;
      I18N.set(next);
      S.pop = null; render(true);
      toast(next === 'en' ? 'Interface language: English' : '界面语言：中文', '🌐'); return;
    }
    if (act === 'theme') {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === 'night' ? 'day' : 'night';
      try { localStorage.setItem('dsh-forum-theme', r.dataset.theme); } catch (err) {}
      S.pop = null; render(true);
      toast(r.dataset.theme === 'night' ? '已切换到夜间模式' : '已切换到白天模式', '🌗'); return;
    }
    if (act === 'pop') {
      const want = S.pop === el.dataset.pop ? null : el.dataset.pop;
      if (!want) { closePop(); return; }
      S.pop = want; render(true); return;
    }
    /* 一键已读：只清「当前看到的那一批」。分类页签里点它 → 只清这一类；
       弹层/整页的「全部已读」在 S.noticeKind 是具体分类时也遵循同一语义（所见即所清），
       所以按钮文案在分类下写「本类已读」，在「全部」下写「全部已读」，避免点了发现别的类还在。 */
    if (act === 'readall') {
      const k = S.noticeKind || 'all';
      const target = noticeList(k);
      let n = 0;
      target.forEach(function (x) { if (!noticeIsRead(x)) { S.noticeRead.add(x.id); n++; } });
      S.noticesRead = noticeUnreadTotal() === 0;
      saveState(); render(true);
      if (!n) { toast('这一类已经都读过了', '✅'); return; }
      toast(k === 'all' ? '全部消息已标记为已读' : '「' + (noticeKinds.filter(function (x) { return x.id === k; })[0] || {}).name + '」已读完', '📭');
      return;
    }
    /* 点开一条：先标已读再跳 —— 顺序反了会跳走之后才标，回来发现还是未读 */
    if (act === 'noticeopen') {
      const id = el.dataset.id;
      if (id) S.noticeRead.add(id);
      S.noticesRead = noticeUnreadTotal() === 0;
      const rt = el.dataset.route || 'feed';
      S.pop = null;
      /* v33：私信通知的正文就是对方最后一句话，真正要回的地方是会话，不是 TA 的空间 */
      const dn = notices.filter(function (x) { return x.id === id; })[0];
      if (dn && dn.kind === 'dm' && dn.from && users[dn.from]) {
        S.route = 'dm'; S.dmPeer = dn.from; S.dmQ = ''; S.q = '';
        saveState(); render(false); return;
      }
      if (rt === 'space' && el.dataset.uid) { S.spaceUser = el.dataset.uid; S.route = 'space'; S.tab = '日志'; }
      else if (rt === 'thread' && el.dataset.tid) { S.threadId = el.dataset.tid; S.route = 'thread'; }
      else if (rt === 'space') { S.spaceUser = ME(); S.route = 'space'; S.tab = '日志'; }
      else { S.route = rt; }
      S.q = '';
      saveState(); render(false);
      return;
    }
    if (act === 'noticedel') {
      /* 列表右侧那个小圆点：只把这一条标已读，不做删除 —— 文案与 aria-label 都写「标为已读」，
         按钮图标也从 ✕ 换成 ✓，避免看起来像删除却什么都没删。 */
      const id = el.dataset.id;
      if (id) S.noticeRead.add(id);
      S.noticesRead = noticeUnreadTotal() === 0;
      saveState(); render(true);
      toast('已标为已读', '✓');
      return;
    }
    if (act === 'noticetab') {
      S.noticeKind = el.dataset.kind || 'all';
      if (S.route !== 'messages') S.pop = 'notice';
      render(true);
      return;
    }
    /* 未登录名片里的「免费注册」：和登录页顶部 tab 是同一个状态位，不用另开路由 */
    if (act === 'gototab') {
      S.authTab = el.dataset.tab === 'register' ? 'register' : 'login';
      S.authErr = null; S.route = 'login'; S.pop = null;
      render(false);
      const first = qs(S.authTab === 'register' ? '#rg-name' : '#lg-email');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    if (act === 'toast') { toast(el.dataset.msg || '操作成功'); return; }
    if (act === 'board') {
      const b = el.dataset.b;
      if (b === '插件库') { S.route = 'market'; S.cat = '全部'; S.sort = '热度'; S.q = ''; }
      else if (b === '讨论区') { S.route = 'forum'; S.ftag = '全部'; S.q = ''; }
      else if (b === '问题反馈') { S.route = 'forum'; S.ftag = '求助'; S.q = ''; }
      else if (b === '文档中心') { S.route = 'policy'; }
      S.pop = null; render(false); return;
    }

    /* ---------- v6：条目库 / 授权 / 下载 / 举报 ---------- */
    if (act === 'pl') { S.pid = el.dataset.id; resetEntryView('code'); S.route = 'entry'; S.pop = null; S.q = ''; render(false); return; }
    /* ---------- v38 · 插件详情独立页（GitHub 仓库风格） ---------- */
    if (act === 'ghtab') {
      const tab = el.dataset.tab;
      if (ENTRY_TABS.indexOf(tab) < 0) return;
      S.entryTab = tab; S.ghGet = false; S.ghFile = ''; S.ghFileQ = ''; S.ghIssueOpen = '';
      S.ghReadmeTab = 'readme';
      /* 侧栏 Releases 卡带 data-tag 时直达那一版；头部标签和「全部」不带 tag，回到最新版。 */
      S.ghRel = tab === 'releases' ? (el.dataset.tag || '') : '';
      render(false); return;
    }
    if (act === 'ghrel') {
      const tag = el.dataset.tag || '';
      if (!tag) return;
      S.entryTab = 'releases';
      S.ghRel = tag;
      render(true);
      /* 窄屏上版本列表与详情是上下排列：点完列表如果停在原地，看起来像没反应。
         桌面端不抢滚动，焦点由 render(true) 还给同一 data-tag 的列表项。 */
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(function () {
          const detail = qs('#gh-rel-detail');
          if (detail) detail.scrollIntoView({ block: 'start', behavior: scrollMode() });
        });
      }
      return;
    }
    if (act === 'ghreljump') {
      const target = document.getElementById(el.dataset.to || '');
      if (!target) return;
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      target.scrollIntoView({ block: 'start', behavior: scrollMode() });
      return;
    }
    if (act === 'ghcopy') {
      const cmd = el.dataset.cmd || '';
      if (!cmd) return;
      copyText(cmd, '安装命令已复制', '复制失败，请手动选中'); return;
    }
    if (act === 'ghget') { S.ghGet = !S.ghGet; render(true); return; }
    if (act === 'ghfile') {
      const f = el.dataset.file || '';
      if (!f) return;
      S.ghFile = S.ghFile === f ? '' : f; S.ghReadmeTab = 'readme'; render(true); return;
    }

    /* v47 · README / 贡献指南 / 许可证三页并列：点标签换整块内容，
       地址栏同步成 #/plugin/<id>/contributing 或 /license，可以直接分享。 */
    if (act === 'ghdoc') {
      /* v49 · 除了固定的三页，还有作者仓库里真实存在的安全策略 / 更新日志 / 行为准则 */
      const DOC_KEYS = { readme: 1, contrib: 1, license: 1, security: 1, changelog: 1, conduct: 1 };
      const raw = el.dataset.doc || 'readme';
      const doc = DOC_KEYS[raw] ? raw : 'readme';
      if (S.ghReadmeTab === doc) return;
      S.ghReadmeTab = doc;
      S.ghGet = false;
      render(true);
      /* 换页后停在文档卡片顶部：三页长度差很多，沿用滚动位置会落在半截正文里 */
      const card = qs('#gh-readme');
      if (card) {
        const top = card.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top: Math.max(0, top), behavior: scrollMode() });
      }
      return;
    }
    /* 一个仓库多份 README（README.md + README.zh-CN.md + docs/README_CN.md…）：
       切语言标签只重画 README 卡，不整页 render —— 整页重画会丢滚动位置与文件树展开态。 */
    if (act === 'rdoc') {
      if (window.PPReadmeDoc) window.PPReadmeDoc(el.dataset.plugin || '', el.dataset.path || '');
      return;
    }
    /* README 旁边的文档页（许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则）：
       只重画那一张卡，不整页 render —— 整页重画会丢滚动位置与文件树展开态。 */
    if (act === 'rdkind') {
      const k = el.dataset.kind || 'readme';
      /* 先改状态再重画：卡片按地址栏这一页选文档，顺序反了会先画成 README */
      const prevTab = S.ghReadmeTab;
      S.ghReadmeTab = k === 'contributing' ? 'contrib' : k;
      const ok = window.PPReadmeKind ? window.PPReadmeKind(el.dataset.plugin || '', k) : false;
      /* 切完把这一页写进地址栏（分享 / 刷新 / 后退都能回到同一页），
         但整页不重画：只换 hash，滚动位置和文件树展开态都留着。 */
      if (!ok) {
        S.ghReadmeTab = prevTab;
        /* 这个仓库没有我们抓到的这份文档（多半是从来没抓过 README）：
           不能让按钮点了没反应 —— 直接去作者仓库看这个文件的原文。 */
        const repo = el.getAttribute('data-repo') || '';
        const FILE = { license: 'LICENSE', security: 'SECURITY.md', contributing: 'CONTRIBUTING.md', changelog: 'CHANGELOG.md', conduct: 'CODE_OF_CONDUCT.md' };
        if (repo && FILE[k]) {
          try { window.open(repo.replace(/\/+$/, '') + '/blob/HEAD/' + FILE[k], '_blank', 'noopener'); } catch (err) { /* 弹窗被拦就什么都不做 */ }
        }
        return;
      }
      try {
        const h = hashOf();
        if ((location.hash || '') !== h) { lastHashShown = h; history.replaceState(null, '', h); }
      } catch (err) { /* file:// 下改不了地址栏，忽略 */ }
      return;
    }
    if (act === 'ghdocjump') {
      const t = qs('#' + (el.dataset.target || ''));
      if (!t) return;
      t.scrollIntoView({ block: 'start', behavior: scrollMode() });
      t.classList.add('gh-target-flash');
      setTimeout(function () { t.classList.remove('gh-target-flash'); }, 1700);
      return;
    }
    if (act === 'ghdir') {
      const d = el.dataset.dir || '';
      S.ghFileQ = d; S.ghFile = ''; render(true);
      /* 目录只是把文件列表筛到那个前缀；光标落到搜索框，接着敲就能继续收窄 */
      requestAnimationFrame(function () {
        const q = qs('#gh-file-q');
        if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); }
      });
      return;
    }
    if (act === 'ghissue') {
      const id = el.dataset.id || '';
      if (!id) return;
      S.ghIssueOpen = S.ghIssueOpen === id ? '' : id; render(true); return;
    }
    if (act === 'ghissuefilter') {
      const f = el.dataset.f;
      if (['open', 'closed', 'all'].indexOf(f) < 0) return;
      S.ghIssueFilter = f; S.ghIssueOpen = ''; render(true); return;
    }
    if (act === 'tier') { S.tier = el.dataset.t; render(true); return; }
    if (act === 'sha') {
      const v = el.dataset.sha || '';
      copyText(v, 'sha256 已复制：' + v.slice(0, 16) + '…', '复制失败，请手动选中', el);
      return;
    }
    if (act === 'rep') {
      const id = el.dataset.id;
      S.rep = S.rep === id ? null : id;
      render(true); return;
    }
    if (act === 'rpt') { S.repT[el.dataset.id] = el.dataset.t; render(true); return; }
    if (act === 'rpsend') { submitReport(el.dataset.id, el); return; }
    if (act === 'claimtab') { S.vt = el.dataset.t; render(true); return; }
    if (act === 'claimtok') {
      const id = el.dataset.id;
      const p = pluginOf(id) || {};
      if (!window.API || !p._id) { toast('认领要连上服务端才能拿到验证串', '⚠️'); return; }
      toast('正在向服务端要验证串…', '🔐');
      window.API.claimChallenge(p._id).then(function (r) {
        S.ctok[id] = (r && r.token) || '';
        S.ctokReq[id] = 1;
        toast(S.ctok[id] ? '验证串已生成，写进仓库后点验证' : '服务端没给验证串', '🔐');
        render(true);
      }, function (err) {
        const msg = (err && err.message) || '拿不到验证串';
        S.vs[id] = { state: 'fail', note: msg };
        toast(msg, '⚠️');
        render(true);
      });
      return;
    }
    if (act === 'copyv') {
      const v = el.dataset.v || '';
      copyText(v, '验证串已复制', '复制失败，请手动选中');
      return;
    }
    if (act === 'claimverify') {
      /* 认领判定只在服务端：前端只负责「要串 → 提交串 → 如实显示服务端结论」。
         以前这里拿 p.claimed 当结果、验证串是前端哈希出来的格式示例，等于自证自明。 */
      const id = el.dataset.id;
      const p = pluginOf(id) || {};
      const method = S.vt || 'readme';
      S.vs[id] = { state: 'work' };
      render(true);
      Promise.resolve()
        .then(function () {
          if (!window.API || !p._id) throw Object.assign(new Error('认领校验需要连上服务端'), { code: 'NO_BACKEND' });
          const tk = S.ctok[id];
          if (!tk) {
            return window.API.claimChallenge(p._id).then(function (r) {
              S.ctok[id] = (r && r.token) || '';
              throw Object.assign(new Error('验证串已生成，先把它写进仓库，再点一次「开始验证」'), { code: 'TOKEN_ISSUED' });
            });
          }
          return window.API.claimVerify(p._id, tk, method).then(function (r) {
            p.claimed = true;
            if (r && r.item) {
              p.tier = r.item.tier || p.tier;
              p.source = r.item.source || p.source;
              p.why = r.item.why || '';
              if (r.item.author && window.API && window.API.adoptUser) p.author = window.API.adoptUser(r.item.author);
            }
            S.claimed.add(id);
            S.vs[id] = { state: 'ok', note: (r && r.note) || '仓库校验通过，你现在是这个条目的作者' };
            toast('认领成功，仓库已绑定', '✅');
            render(true);
          });
        })
        .catch(function (err) {
          const s = { state: 'fail', note: (err && err.message) || '验证没有通过' };
          if (err && err.code === 'TOKEN_ISSUED') { s.state = 'work'; s.note = err.message; }
          else if (err && err.code === 'NOT_AUTHED') s.note = '先登录再认领';
          else if (err && err.code === 'NO_BACKEND') s.note = '认领要连上服务端';
          else if (err && err.code === 'CLAIMED_BY_OTHER') s.note = '这个条目已经被作者认领了';
          else if (err && err.code === 'METHOD_UNSUPPORTED') s.note = '这种方式还没开放，先用 README 或 Issue';
          else if (err && err.code === 'RATE_LIMITED') s.note = 'GitHub 限流了，过几分钟再试';
          S.vs[id] = s;
          toast(s.note, s.state === 'work' ? '🔐' : '⚠️');
          render(true);
        });
      return;
    }
    if (act === 'grant') {
      const id = el.dataset.id;
      const p = pluginOf(id);
      const cur = mirrorOf(p);
      S.mirror[id] = cur === 'off' ? (p.mirror === 'off' ? 'manual' : p.mirror || 'auto') : 'off';
      render(true);
      toast(S.mirror[id] === 'off' ? '已关闭展示，24 小时内撤掉取包入口' : '已开启包信息展示', S.mirror[id] === 'off' ? '🔒' : '🔓');
      return;
    }
    if (act === 'gmode') { S.mirror[el.dataset.id] = el.dataset.m; render(true); return; }
    if (act === 'withdraw') {
      const id = el.dataset.id;
      if (S.withdraw.has(id)) S.withdraw.delete(id); else S.withdraw.add(id);
      render(true);
      toast(S.withdraw.has(id) ? '已撤回当前版本，立刻停止下载' : '已恢复分发', S.withdraw.has(id) ? '📥' : '↩️');
      return;
    }
    if (act === 'updrop') {
      /* 演示站点没法真的读文件，这里模拟「解压后读到 package.json」 */
      const p = pluginOf(el.dataset.id);
      S.up.file = {
        name: p.pkg.replace(/^dsh-/, 'dsh-') + '-' + p.ver + '.tgz',
        size: '1.2 MB', pkg: p.pkg, ver: p.ver, lic: p.license || '',
        sha: 'c41f7a09be2d...' + p.id + '（演示值）'
      };
      S.up.stage = '';
      render(true); toast('已读取包内 package.json', '📦'); return;
    }
    if (act === 'upclear') { S.up.file = null; S.up.stage = ''; render(true); return; }
    if (act === 'upver') {
      const v = el.dataset.v, i = S.up.compat.indexOf(v);
      if (i >= 0) S.up.compat.splice(i, 1); else S.up.compat.push(v);
      render(true); return;
    }
    if (act === 'upbreak') { S.up.breaking = el.dataset.v; render(true); return; }
    if (act === 'chk') {
      const i = +el.dataset.i, k = S.up.agreed.indexOf(i);
      if (k >= 0) S.up.agreed.splice(k, 1); else S.up.agreed.push(i);
      render(true); return;
    }
    if (act === 'upsubmit') { S.up.stage = 'review'; render(false); toast('已提交，等人工审核', '✅'); return; }
    if (act === 'upreset') {
      S.up = { file: null, compat: [], breaking: '', note: '', agreed: [], stage: '' };
      render(true); return;
    }
    if (act === 'docjump') {
      const node = document.getElementById(el.dataset.sec);
      if (node) {
        node.scrollIntoView({ block: 'start', behavior: scrollMode() });
        qsa('.doc-nav a').forEach(function (a) { a.classList.toggle('on', a === el); });
      }
      return;
    }

    if (act === 'feedtab') { S.tab = el.dataset.tab; render(true); return; }
    if (act === 'stab') { S.tab = el.dataset.tab; render(true); return; }
    if (act === 'cat') { S.cat = el.dataset.cat; render(true); return; }
    if (act === 'sort') { S.sort = el.dataset.sort; render(true); return; }
    if (act === 'mktmore') { S.mktLimit += MKT_PAGE; render(true); return; }
    if (act === 'fcat') {
      const jump = S.route !== 'forum';
      S.scat = el.dataset.cat; S.q = '';
      /* 分类与主标签是两套维度，但同时只有一个在生效：点分类就清掉标签筛选，
         否则会出现「点分类条数字变了、列表却还是空的」这种自相矛盾的画面。 */
      S.ftag = '全部';
      /* 标签页带过来的多选也一并清掉，理由同上：一个筛选控件生效时就该只有它亮着 */
      S.tags = [];
      if (jump) { S.route = 'forum'; }
      render(!jump); return;
    }
    if (act === 'ftag') {
      /* 热门标签现在只有左栏那张卡这一个入口（见 ftagCardHTML），写 S.ftag；从别的页面
         点过来顺手切到社群。
         分类与标签互斥且对称：点分类清标签（见 act === 'fcat'），点标签也把分类放回
         「全部」——否则「求助问答」还亮着、标签也亮着，列表却是两者的交集，很容易空，
         而左栏看着像两种筛选同时生效。 */
      const jump = S.route !== 'forum';
      S.ftag = el.dataset.tag; S.q = ''; S.scat = '全部';
      /* 单标签与标签页的多选互斥：留着多选会让列表变成两组条件叠加 */
      S.tags = [];
      if (jump) { S.route = 'forum'; }
      render(!jump); return;
    }
    /* ---------- v24 · 标签页（#/tags） ---------- */
    if (act === 'tagtoggle') {
      /* 一颗标签按钮同时是「选中」与「取消」：已选就删、未选就加。
         标签页与社群页共用同一颗按钮，所以这里只管状态，页面就地重绘（保留滚动位置） */
      const g = el.dataset.tag;
      const i = S.tags.indexOf(g);
      if (i >= 0) S.tags.splice(i, 1); else S.tags.push(g);
      render(true); return;
    }
    if (act === 'tagclear') { S.tags = []; render(true); return; }
    if (act === 'tagmode') { S.tagMode = el.dataset.mode === 'any' ? 'any' : 'all'; render(true); return; }
    if (act === 'tagmore') {
      /* 「显示全部 / 收起」：展开状态按节记在 S.tagOpen，重绘后仍然保持 */
      const g = el.dataset.g;
      if (S.tagOpen.has(g)) S.tagOpen.delete(g); else S.tagOpen.add(g);
      render(true); return;
    }
    if (act === 'tagqclear') { S.tagQ = ''; render(true); return; }
    if (act === 'tagsel') {
      /* 标签页 → 社群：把当前组合带给列表页；分类与单标签都放回「全部」，
         否则会出现「分类亮着、标签条也在筛」的双重筛选 */
      S.route = 'forum'; S.ftag = '全部'; S.scat = '全部'; S.q = '';
      render(false); return;
    }
    if (act === 'tagsopen') { S.route = 'tags'; S.pop = null; render(false); return; }
    if (act === 'fsort') { S.fsort = el.dataset.sort; render(true); return; }
    if (act === 'react') {
      const k = el.dataset.k;
      if (S.reacts.has(k)) S.reacts.delete(k); else { S.reacts.add(k); toast('已加上 ' + k.split('|')[1] + ' 反应', k.split('|')[1]); }
      render(true); return;
    }
    if (act === 'jumpf') {
      const node = document.getElementById('f' + el.dataset.n);
      if (node) {
        node.scrollIntoView({ block: 'start', behavior: scrollMode() });
        node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
      }
      return;
    }
    if (act === 'tag') { S.q = el.dataset.tag; S.route = 'forum'; render(false); return; }
    if (act === 'thread') { S.threadId = el.dataset.id; S.route = 'thread'; render(false); return; }

    if (act === 'like') {
      const id = el.dataset.pid;
      const post = posts.filter(function (x) { return x.id === id; })[0];
      /* 有 _id 说明这条是后端来的真数据：打接口，失败就退回本地假状态 */
      if (post && post._id && window.API) {
        window.API.like(post._id).then(function (r) {
          post.likes = r.likes;
          if (r.liked) S.liked.add(id); else S.liked.delete(id);
          toast(r.liked ? '已点赞' : '已取消赞', r.liked ? '❤️' : '💔');
          render(true);
        }).catch(function (e) {
          toast(e.status === 401 ? '先登录再点赞' : ('点赞失败：' + e.message), '⚠️');
        });
        return;
      }
      if (S.liked.has(id)) { S.liked.delete(id); toast('已取消赞', '💔'); } else { S.liked.add(id); toast('已点赞', '❤️'); }
      render(true); return;
    }
    if (act === 'tlike') {
      const k = 't_' + el.dataset.id;
      if (S.liked.has(k)) S.liked.delete(k); else S.liked.add(k);
      render(true); return;
    }
    if (act === 'flike') {
      const k = el.dataset.k;
      if (S.floorLiked.has(k)) { S.floorLiked.delete(k); } else { S.floorLiked.add(k); toast('已赞这条回复', '👍'); }
      render(true); return;
    }
    if (act === 'install') {
      const id = el.dataset.pid;
      if (S.installed.has(id)) { toast('已取消安装', '📦'); S.installed.delete(id); }
      else { S.installed.add(id); toast('安装成功，重启后生效', '🎉'); }
      render(true); return;
    }
    if (act === 'expand') {
      const id = el.dataset.pid;
      if (S.expand.has(id)) S.expand.delete(id); else S.expand.add(id);
      render(true); return;
    }
    if (act === 'focuscmt') {
      const box = qs('.cin[data-pid="' + el.dataset.pid + '"]');
      if (box) { box.focus(); box.scrollIntoView({ block: 'center', behavior: scrollMode() }); }
      return;
    }
    if (act === 'sendcmt') {
      const id = el.dataset.pid;
      const box = qs('.cin[data-pid="' + id + '"]');
      const v = box && box.value.trim();
      if (!v) { toast('说点什么再发送吧', '✏️'); return; }
      const post = posts.filter(function (x) { return x.id === id; })[0];
      if (post && post._id && window.API) {
        window.API.comment(post._id, v).then(function (r) {
          const c = r.comment;
          (S.comments[id] = S.comments[id] || []).push({
            user: c.user ? 's' + c.user.id : ME(), text: c.text, time: c.time
          });
          S.expand.add(id);
          toast('评论已发布', '💬');
          render(true);
        }).catch(function (e) {
          toast(e.status === 401 ? '先登录再评论' : ('评论失败：' + e.message), '⚠️');
        });
        return;
      }
      (S.comments[id] = S.comments[id] || []).push({ user: ME(), text: v, time: '刚刚' });
      S.expand.add(id);
      toast('评论已发布', '💬'); render(true); return;
    }
    if (act === 'share') { copyText(location.href.split('#')[0] + hashOf(), '分享链接已复制', '复制失败，请手动复制地址栏'); return; }
    /* ---------- v36 · AI 排行（v39 起数据源是 AA / LiveBench） ---------- */
    if (act === 'rkscope') {
      const sc = el.dataset.scope === 'cn' ? 'cn' : 'global';
      if (S.rankScope === sc) return;
      S.rankScope = sc; render(true); return;
    }
    if (act === 'rkboard') {
      const b = el.dataset.b === 'lb' ? 'lb' : 'aa';
      if (S.rankBoard === b) return;
      S.rankBoard = b; render(true); return;
    }
    if (act === 'rksort') {
      const k = el.dataset.k || 'total';
      const A = window.AIRank || {};
      const lb = S.rankBoard === 'lb';
      const dims = lb ? (A.LB_DIMS || []) : (A.DIMS || []);
      if (['total'].concat(dims.map(function (d) { return d[0]; })).indexOf(k) < 0) return;
      if (lb) { if (S.rankLbSort === k) return; S.rankLbSort = k; }
      else { if (S.rankSort === k) return; S.rankSort = k; }
      render(true); return;
    }
    /* ---------- v27 · 我的收藏 ---------- */
    if (act === 'favtab') {
      const k = el.dataset.kind;
      if (['all'].concat(FAV_KINDS).indexOf(k) < 0) return;
      if (S.favKind === k) return;
      S.favKind = k; render(true); return;
    }
    if (act === 'favopen') {
      const kind = el.dataset.kind;
      const id = el.dataset.id;
      if (!id || ['all'].concat(FAV_KINDS).indexOf(kind) < 1) return;
      if (kind === 'art') {
        if (!artOf(id)) { toast('这件作品已经不在了，可以取消收藏', '⚠️'); return; }
        S.artId = id; S.route = 'artview';
        S.cmReply = ''; S.cmDel = ''; S.pop = null;
        render(false); return;
      }
      if (kind === 'thread') {
        if (!threadOf(id)) { toast('这条帖子已经不在了，可以取消收藏', '⚠️'); return; }
        S.threadId = id; S.route = 'thread'; S.pop = null;
        render(false); return;
      }
      if (kind === 'plug') {
        if (!plugOf(id)) { toast('这个插件条目已经不在了，可以取消收藏', '⚠️'); return; }
        S.pid = id; resetEntryView('code'); S.route = 'entry'; S.pop = null;
        render(false); return;
      }
      if (kind === 'user') {
        if (!userExists(id)) { toast('这位作者已经不在了，可以取消收藏', '⚠️'); return; }
        S.spaceUser = id; S.route = 'space'; S.tab = '日志'; S.pop = null;
        render(false); return;
      }
      if (!postById(id)) { toast('这条日志已经不在了，可以取消收藏', '⚠️'); return; }
      S.route = 'feed'; S.tab = '全部'; S.q = ''; S.scat = '全部'; S.pop = null;
      render(false);
      /* 等 DOM 真正落地再定位；首页有分类/标签两重筛选，进来前已复位成「全部」 */
      requestAnimationFrame(function () {
        const node = qs('[data-post="' + id + '"]');
        if (!node) return;
        node.scrollIntoView({ block: 'center', behavior: scrollMode() });
        node.classList.add('fav-flash');
        setTimeout(function () { node.classList.remove('fav-flash'); }, 1800);
      });
      return;
    }
    if (act === 'unfav') {
      const kind = el.dataset.kind;
      const id = el.dataset.id;
      if (!id || FAV_KINDS.indexOf(kind) < 0) return;
      const name = favNameOf(kind, id);
      const pos = favRemove(kind, id);
      saveState();
      /* 先让这一行退场，再重绘整页：直接重绘会「啪」地跳一下，看不到自己点了哪一条 */
      const row = qs('.fav-item[data-fav-key="' + kind + ':' + id + '"]');
      if (row) row.classList.add('is-out');
      toast('已取消收藏「' + clip(name, 16) + '」', '☆', {
        label: '撤销', duration: 4600,
        onClick: function () {
          favAdd(kind, id, pos); saveState();
          if (S.route === 'favs') render(true);
          toast('已恢复收藏「' + clip(name, 16) + '」', '★');
        }
      });
      setTimeout(function () { if (S.route === 'favs') render(true); }, 190);
      return;
    }
    if (act === 'fav') {
      const id = el.dataset.pid;
      if (!id) return;
      if (S.fav.has(id)) {
        const name = favNameOf('post', id);
        const pos = favRemove('post', id);
        saveState();
        toast('已取消收藏「' + clip(name, 16) + '」', '☆', {
          label: '撤销', duration: 4600,
          onClick: function () {
            favAdd('post', id, pos); saveState();
            if (S.route === 'feed' || S.route === 'favs') render(true);
            toast('已恢复收藏', '★');
          }
        });
      } else {
        favAdd('post', id);
        saveState();
        toast('已收藏，去「我的收藏」看看', '★', {
          label: '去看看', duration: 3400,
          onClick: function () { S.route = 'favs'; S.favKind = 'all'; S.pop = null; render(false); }
        });
      }
      render(true); return;
    }
    /* v33 · 帖子 / 插件 / 作者共用的收藏开关：data-kind + data-id，
       与日志的 fav（data-pid）分开，免得同一个 kind 判断里再长出分支。 */
    if (act === 'favany') {
      const kind = el.dataset.kind, id = el.dataset.id;
      if (!id || FAV_KINDS.indexOf(kind) < 0) return;
      const name = favNameOf(kind, id);
      if (favSet(kind).has(id)) {
        const pos = favRemove(kind, id);
        saveState();
        toast('已取消收藏「' + clip(name, 16) + '」', '☆', {
          label: '撤销', duration: 4600,
          onClick: function () {
            favAdd(kind, id, pos); saveState();
            if (S.route === 'favs') render(true);
            toast('已恢复收藏「' + clip(name, 16) + '」', '★');
          }
        });
      } else {
        favAdd(kind, id);
        saveState();
        toast('已收藏「' + clip(name, 16) + '」', '★', {
          label: '去看看', duration: 3400,
          onClick: function () { S.route = 'favs'; S.favKind = 'all'; S.pop = null; render(false); }
        });
      }
      render(true); return;
    }
    /* v41 · 插件页点赞：只改 S.likePlug 与胶囊上的数字，不进「我的收藏」。 */
    if (act === 'ghlike') {
      const id = el.dataset.id;
      if (!id) return;
      const on = S.likePlug.has(id);
      if (on) S.likePlug.delete(id); else S.likePlug.add(id);
      saveState();
      render(false);
      toast(on ? '已取消点赞' : '已点赞', on ? '🤍' : '👍');
      return;
    }
    if (act === 'clike') {
      const k = el.dataset.cid;
      if (S.cmtLiked.has(k)) { S.cmtLiked.delete(k); toast('已取消赞', '🤍'); }
      else { S.cmtLiked.add(k); toast('已赞这条评论', '👍'); }
      render(true); return;
    }
    if (act === 'more') { toast('举报请在条目页或帖子详情页用「举报」入口提交；屏蔽与复制链接暂未开放', '⋯'); return; }
    /* ---------- 发帖工具条 ---------- */
    if (act === 'imgpick') { const inp = qs('#cmt-file'); if (inp) inp.click(); return; }
    if (act === 'ntpick') { const inp = qs('#nt-file'); if (inp) inp.click(); return; }
    if (act === 'imgdel') {
      const i = Number(el.dataset.i) || 0;
      /* 同一个按钮两处用（imgPrevHTML 不区分队列）：先看当前在哪个编辑器里 */
      const owner = editorOf(el);
      if (owner && owner.queue === 'rp') { delReplyImage(i); return; }
      (S.pendingImages || []).splice(i, 1);
      repaintImgs('pendingImages', 'imgprev');
      const b = qs('[data-act="imgpick"]');
      if (b) b.innerHTML = '🖼️ 图片' + (S.pendingImages.length ? '<i class="tool-n">' + S.pendingImages.length + '</i>' : '');
      return;
    }
    if (act === 'pluginpick') { S.pickerOpen = !S.pickerOpen; render(true); return; }
    if (act === 'pluginset') {
      const nm = el.dataset.name;
      const p = plugins.filter(function (x) { return x.name === nm; })[0];
      if (!p) return;
      S.pendingPlugin = p.name; S.pendingPluginVer = p.ver; S.pickerOpen = false;
      render(true); toast('已关联插件 ' + p.name, '🧩'); return;
    }
    if (act === 'pluginclear') { S.pendingPlugin = ''; S.pendingPluginVer = ''; render(true); return; }
    if (act === 'topictag') {
      const ta = qs('#composer');
      if (!ta) { toast('# 话题只能用在日志里', '＃'); return; }
      const tag = '#' + (TAGCLOUD[0] || '话题') + ' ';
      const at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      ta.value = ta.value.slice(0, at) + tag + ta.value.slice(at);
      ta.focus();
      try { ta.setSelectionRange(at + tag.length, at + tag.length); } catch (e) {}
      const c = qs('#ccount'); if (c) c.textContent = ta.value.length + ' / 500';
      return;
    }
    if (act === 'attach') { toast('附件走插件包上传（插件库 → 上传新版本），日志这里只收图片', '📎'); return; }
    /* ---------- v22 · 鲸鲸空间 ---------- */
    if (act === 'artopen') {
      const id = el.dataset.id;
      if (!id || !artOf(id)) return;
      S.artId = id;
      S.route = 'artview';
      S.cmReply = null;
      S.cmDel = '';
      render(false);
      return;
    }
    if (act === 'adspin') { meshSpin = !meshSpin; syncSpinBtn(); return; }
    if (act === 'adreset') {
      meshYaw = 0.62; meshPitch = -0.24;
      const cv = qs('#ad-canvas');
      if (cv) drawMesh(cv, meshOfModel((artOf(cv.dataset.mid) || {}).model), meshYaw, meshPitch, {});
      return;
    }
    if (act === 'artmodelpick') { const mi = qs('#art-model-file'); if (mi) mi.click(); return; }
    if (act === 'artmodelclear') { artDraftOf().model = null; render(true); return; }
    if (act === 'cmsend') {
      const parent = el.dataset.parent || '';
      const box = parent ? qs('#cm-reply-input') : qs('#cm-input');
      cmtSend(el.dataset.id, box ? box.value : '', parent);
      return;
    }
    if (act === 'cmreply') {
      const cid = el.dataset.cid;
      S.cmReply = S.cmReply === cid ? null : cid;
      S.cmDel = '';
      render(true);
      if (S.cmReply) { const b = qs('#cm-reply-input'); if (b) b.focus(); }
      return;
    }
    if (act === 'cmcancel') { S.cmReply = null; render(true); return; }
    if (act === 'cmdel') { cmtDel(el.dataset.cid); return; }
    if (act === 'artnew') {
      S.artOpen = !S.artOpen;
      render(true);
      if (S.artOpen) { const t = qs('#art-title'); if (t) t.focus(); }
      return;
    }
    if (act === 'artkind') {
      const k = el.dataset.kind || '全部';
      /* 同一个接口两处用：发布框里选的是「这件作品算什么类型」，墙上是筛选 */
      if (el.closest('.au-form')) { artDraftOf().kind = k; render(true); }
      else { S.artKind = k; render(false); }
      return;
    }
    if (act === 'artsort') { S.artSort = el.dataset.sort || '最新'; render(false); return; }
    if (act === 'artown') { artDraftOf().own = el.dataset.own === '1'; render(true); return; }
    if (act === 'artperm') {
      /* 选授权档位即表态「这是别人的图」：原作者模式下 item.perm 会被写死成 own，
         不跟着切过去，用户点了「仅索引」、表单看着变了，发出去还是「本人发布」。 */
      const d0 = artDraftOf();
      d0.perm = el.dataset.perm || 'ok';
      if (d0.perm !== 'own') d0.own = false;
      render(true); return;
    }
    if (act === 'artpick') { const fi = qs('#art-file'); if (fi) fi.click(); return; }
    if (act === 'artclear') { const d0 = artDraftOf(); d0.media = ''; d0.mime = ''; render(true); return; }
    if (act === 'artsubmit') { artSubmit(); return; }
    if (act === 'artlike') {
      const id = el.dataset.id;
      if (S.artLikes.has(id)) { S.artLikes.delete(id); toast('已取消喜欢', '·'); }
      else { S.artLikes.add(id); toast('已喜欢这件作品', '♥'); }
      saveState(); render(true); return;
    }
    if (act === 'artfav') {
      const id = el.dataset.id;
      if (!id) return;
      const name = favNameOf('art', id);
      if (S.artFav.has(id)) {
        const pos = favRemove('art', id);
        saveState();
        toast('已取消收藏「' + clip(name, 16) + '」', '☆', {
          label: '撤销', duration: 4600,
          onClick: function () {
            favAdd('art', id, pos); saveState();
            if (S.route === 'artview' || S.route === 'favs') render(true);
            toast('已恢复收藏', '★');
          }
        });
      } else {
        favAdd('art', id);
        saveState();
        toast('已收藏，去「我的收藏」看看', '★', {
          label: '去看看', duration: 3400,
          onClick: function () { S.route = 'favs'; S.favKind = 'all'; S.pop = null; render(false); }
        });
      }
      render(true); return;
    }

    if (act === 'publish') {
      const ta = qs('#composer');
      const v = ta && ta.value.trim();
      const imgs = (S.pendingImages || []).slice();
      /* 纯图片动态也允许发（后端 posts 的校验就是「文字和图片不能同时为空」） */
      if (!v && !imgs.length) { toast('先写点什么吧～', '✍️'); return; }
      const btn = el;
      /* 以前这里有一条「本地演示流」后路：后端不通就把帖子塞进 S.published 假装发表成功。
         结果有三个人被它骗过 —— 帖子上墙了（只在这台浏览器里），别人打开首页什么都没有，
         刷新更是什么都不剩（saveState 从来没存过 published）。
         现在只认服务端的 201：发不出去就明说没发出去，草稿和已选图片原地留着让人重试。 */
      if (!window.API) {
        toast('后端未连接，这条动态没有发出去（草稿还在输入框里）', '📡');
        return;
      }
      if (btn) btn.disabled = true;
      const uploads = imgs.length
        ? Promise.all(imgs.map(function (im) { return window.API.uploadImage(im.file); }))
        : Promise.resolve([]);
      uploads.then(function (up) {
        const payload = up.map(function (u) { return { key: u.key, w: u.w, h: u.h, type: u.type, url: u.url }; });
        return window.API.publish(v, payload, S.pendingPlugin || '', S.pendingPluginVer || '');
      }).then(function () {
        S.pendingImages = []; S.pendingPlugin = ''; S.pendingPluginVer = ''; S.pickerOpen = false;
        toast(imgs.length ? '发表成功，' + imgs.length + ' 张配图已上传' : '发表成功，已出现在日志顶部', '🎉');
        return window.API.sync().then(function () { render(false); });
      }).catch(function (e) {
        /* 失败一律不重绘：一重绘输入框就空了，用户刚写的东西当场蒸发。
           图片与插件选择也保留，网络好了直接再点一次发表即可。 */
        if (e.status === 401 || e.code === 'NOT_AUTHED') {
          toast('登录状态已过期，重新登录后再发（草稿留在输入框里）', '🔑');
          if (btn) { S.authForce = true; S.route = 'login'; S.authTab = 'login'; render(false); }
          return;
        }
        if (e.code === 'BAD_IMAGE_KEY') { toast('配图需要重新上传：' + e.message, '🖼️'); return; }
        if (!e.status) { toast('连不上服务端，这条动态没有发出去；草稿还在，网络恢复后再点发表', '📡'); return; }
        toast('发表失败：' + e.message, '⚠️');
      }).then(function () {
        if (btn) btn.disabled = false;
      });
      return;
    }
    if (act === 'reply') {
      const ta = qs('#reply');
      const v = ta && ta.value.trim();
      /* 空间留言只收文字 */
      if (S.route === 'space') {
        if (!v) { toast('回复内容不能为空', '✏️'); return; }
        const uid = S.spaceUser;
        (S.msgs[uid] = S.msgs[uid] || []).push({ user: ME(), time: '刚刚', text: v });
        S.rpDraft = '';
        saveState();
        toast('留言已发布', '💬'); render(true); return;
      }
      /* 帖子回复：文字与配图至少要有一个（只贴一张图不说话也算合法回复）。
         注意仍旧以 DOM 的 value 为准 —— 既有回归脚本是直接给 textarea 赋值的。 */
      const imgs = (S.rpImages || []).slice();
      if (!v && !imgs.length) { toast('回复内容不能为空', '✏️'); return; }
      const tid = S.threadId;
      const tObj = threadPool().filter(function (x) { return x.id === tid; })[0] || null;
      const floor = {
        user: ME(), time: '刚刚', text: v, likes: 0, reactions: {},
        images: imgs.map(function (im) { return { src: im.src, w: im.w, h: im.h, type: im.type || '' }; })
      };
      (S.newFloors[tid] = S.newFloors[tid] || []).push(floor);
      /* 真实主题同时写服务端：成功就用服务端楼层替换本地那条临时楼层（刷新后还在），
         失败保留本地并提示。以前只 push 内存，刷新即消失。 */
      if (tObj && tObj._id && window.API && API.threadReply) {
        API.threadReply(tObj.cat || 'general', tObj._id, v).then(function (res) {
          const item = res && res.data && res.data.item;
          if (!item) return;
          const list = S.newFloors[tid] || [];
          const at = list.indexOf(floor);
          if (at >= 0) list.splice(at, 1);
          S.replies = S.replies || {};
          (S.replies[tid] = S.replies[tid] || []).push({
            id: 'r' + item.id, _id: item.id, user: ME(), time: item.time || '刚刚',
            text: item.body || v, likes: 0, quote: '', replyTo: '', reactions: {}
          });
          if (res.data.replies != null) tObj.replies = res.data.replies;
          saveState();
          if (S.route === 'thread') render(false);
        }).catch(function (e) {
          toast('回复没发出去：' + ((e && e.message) || '网络错误'), '⚠️');
        });
      }
      /* 配图是 dataURL，跟着 newFloors 一起落存档；顺手把草稿与引用记录复位 */
      S.rpImages = []; S.rpDraft = ''; S.rpPanel = '';
      S.quoteText = ''; S.quoteWho = ''; S.quoteNo = 0;
      saveState();
      toast(imgs.length ? '回复已发布，含 ' + imgs.length + ' 张配图' : '回复已发布', '✅');
      render(true); return;
    }
    if (act === 'newthread') { S.composerOpen = !S.composerOpen; render(true); return; }
    if (act === 'ntcancel') { S.composerOpen = false; render(true); return; }
    if (act === 'ntsubmit') {
      const titleEl = qs('#nt-title'), catEl = qs('#nt-cat'), tagEl = qs('#nt-tag'), bodyEl = qs('#nt-body'), subEl = qs('#nt-sub');
      const T = titleEl && titleEl.value.trim(), B = bodyEl && bodyEl.value.trim();
      if (!T || !B) { toast('标题和正文都要填', '✏️'); return; }
      if (T.length > 60) { toast('标题最多 60 个字符', '✏️'); return; }
      const tag = tagEl.value;
      /* 副标题：作者写了就用，没写取正文第一句（到第一个句末标点），再兜底切 80 字。
         以前是正文前 80 字直接当摘要，经常在句子中间断开。 */
      const subIn = subEl ? subEl.value.trim() : '';
      const autoSub = B.replace(/\s+/g, ' ').split(/[。！？!?\n]/)[0].slice(0, 80);
      const sub = (subIn || autoSub).slice(0, 80);
      const slug = (catEl && catEl.value) || 'chat';
      const imgs = (S.ntImages || []).map(function (im) { return { kind: 'shot', src: im.src, w: im.w, h: im.h }; });
      const nImg = imgs.length;
      /* 落地的唯一出口：先把「列表里要长出来的那条」拼好，
         服务端接住了就用它返回的 id / 时间，没接住就退回本地 id 并如实告知。 */
      const land = function (id, ok, extra) {
        const t = Object.assign({
          id: id, user: ME(), cat: slug, tag: tag, title: T, sub: sub,
          excerpt: sub, body: B, replies: 0, views: 1,
          last: '刚刚', hot: false, top: false, solved: false, closed: false, unread: false,
          tags: [tag], created: '刚刚', lastUser: ME(), posters: [ME()],
          likes: 0, reactions: {}, plugin: '', images: imgs
        }, extra || {});
        S.newThreads.unshift(t);
        S.ntImages = [];
        S.composerOpen = false;
        S.threadId = id; S.route = 'thread';
        toast(ok
          ? (nImg ? '主题已发布，含 ' + nImg + ' 张图片' : '主题已发布')
          : (nImg ? '发帖成功（仅本机），含 ' + nImg + ' 张图片' : '发帖成功（仅本机）'), '🎉');
        render(false);
      };

      /* 登录用户走服务端：这是主题能活过刷新的唯一路径。
         以前这里只做 S.newThreads.unshift —— 而 api.js 的 hydrate 会拿服务端主题整份替换演示数据，
         于是「发完就消失」。图片仍只在本机展示（threads 表没有 images 列）。 */
      if (isGuest() || !window.API || !API.threadsCreate) {
        land('n' + Date.now(), false, null);
        return;
      }
      API.threadsCreate(slug, { title: T, tag: tag, tags: [tag], excerpt: sub, body: B }).then(function (r) {
        const item = (r && r.item) || null;
        if (!item) { land('n' + Date.now(), false, null); return; }
        land('t' + item.id, true, {
          cat: item.cat || slug,
          tag: item.tag || tag,
          title: item.title || T,
          excerpt: item.excerpt || sub,
          sub: item.excerpt || sub,
          replies: item.replies || 0,
          views: item.views || 0,
          likes: item.likes || 0,
          last: item.last || '刚刚',
          created: '刚刚'
        });
        /* 版面计数是服务端 +1 的，这里不再本地改，避免刷新后对不上 */
      }, function (err) {
        land('n' + Date.now(), false, null);
        toast('服务端没接住（' + ((err && err.message) || '网络异常') + '），这条只存在本机', '⚠️');
      });
      return;
    }
    if (act === 'quote') {
      const ta = qs('#reply');
      /* 记下被引用的楼层文本 + 楼层号 + 作者：上面的「🔗 引用」按钮要能把它带进回复框，
         正文里的 "> " 与「#N 楼」都由 richText 渲染，所以记的是纯文本。
         楼层上的「回复」按钮只带 @昵称，引用块由引用按钮显式插入。 */
      const fEl = el.closest('.floor');
      const no = fEl && /^f\d+$/.test(fEl.id || '') ? parseInt(String(fEl.id).slice(1), 10) : 0;
      S.quoteText = fEl && fEl.querySelector('p') ? fEl.querySelector('p').textContent.slice(0, 120) : '';
      S.quoteWho = el.dataset.name || '';
      S.quoteNo = no;
      if (ta) {
        /* 已经有草稿时不能整体覆盖：草稿现在会落盘，覆盖一次 = 刷新后半篇字永久变成这句
           （验收员观察到的既有行为）。前缀补在开头，原文一字不动，光标停在末尾接着打。 */
        const head = '回复 @' + (el.dataset.name || '') + '：';
        const cur = ta.value || '';
        /* 三分支写显式：三元里「已有同一前缀」落到 else 会赋 head，等于把正文截断成一行
           （验收员实测重复点引用会把半篇草稿吃掉）。重复点应该是 no-op。 */
        if (!cur.trim()) ta.value = head;
        else if (cur.indexOf(head) !== 0) ta.value = head + cur;
        /* else：已有同一前缀 → 原样不动 */
        const pos = ta.value.length;
        try { ta.setSelectionRange(pos, pos); } catch (err) {}
        ta.focus();
        S.rpDraft = ta.value;
        draftSaveSoon(60);
      }
      return;
    }
    /* ---------- v23 · 回复框四件套：表情 / 图片 / 提及 / 引用链接 ----------
       面板切换与插入都只动 DOM（不整页重绘）：重绘会把用户正在打字的选区甩掉，
       而插入必须落在光标处。草稿同步进 S.rpDraft，所以别的重绘 / 刷新都不会丢字。 */
    if (act === 'rpe' || act === 'rpm' || act === 'rpl') {
      if (!qs('.replybox')) return;
      const k = act === 'rpe' ? 'emo' : (act === 'rpm' ? 'men' : 'lnk');
      S.rpPanel = S.rpPanel === k ? '' : k;
      syncRpPanel();
      return;
    }
    if (act === 'eset') { S.rpEmojiSet = el.dataset.set || '常用'; syncRpPanel(); return; }
    if (act === 'epick') {
      const e0 = el.dataset.e || '';
      insertReplyText(e0);
      /* 最近用过：置顶去重，只留 10 个 */
      S.rpEmojiRecent = [e0].concat((S.rpEmojiRecent || []).filter(function (x) { return x !== e0; })).slice(0, 10);
      return;
    }
    if (act === 'mpick') {
      const nm = el.dataset.name || '';
      if (insertReplyText('@' + nm + ' ')) {
        S.rpPanel = '';
        syncRpPanel();
        toast('已插入 @' + nm, '＠');
      }
      return;
    }
    if (act === 'rpimg') { const inp = qs('#rp-file'); if (inp) inp.click(); return; }
    /* 兼容别名：预览条现在统一发 imgdel（上面按编辑器分派），这个 data-act 已无元素挂载。 */
    if (act === 'rpimgdel') { delReplyImage(Number(el.dataset.i) || 0); return; }
    if (act === 'lnkins') {
      const tIn = qs('#lnk-t'), uIn = qs('#lnk-u');
      const url = ((uIn && uIn.value) || '').trim();
      if (!/^https?:\/\//i.test(url)) { toast('链接要以 http:// 或 https:// 开头', '🔗'); return; }
      const label = (((tIn && tIn.value) || '').trim() || url).replace(/[\[\]]/g, '');
      const href = url.replace(/[)\s"']/g, function (c) { return encodeURIComponent(c); });
      if (insertReplyText('[' + label + '](' + href + ') ')) { S.rpPanel = ''; syncRpPanel(); }
      return;
    }
    if (act === 'rpquote') {
      const q = (S.quoteText || '').trim();
      if (!q) { toast('先在上面的楼层点「回复」，引用内容才会带过来', '🔗'); return; }
      const head = '> ' + (S.quoteWho ? '@' + S.quoteWho + ' ' : '') + (S.quoteNo ? '#' + S.quoteNo + ' 楼 ' : '') + '写道：';
      const body = q.split('\n').map(function (l) { return '> ' + l; }).join('\n');
      const ta0 = qs('#reply');
      insertReplyText((ta0 && ta0.value.trim() ? '\n' : '') + head + '\n' + body + '\n\n');
      return;
    }
    if (act === 'follow') {
      S.follow = !S.follow;
      toast(S.follow ? '已关注该用户' : '已取消关注', S.follow ? '➕' : '➖');
      render(true); return;
    }
    if (act === 'lb') {
      const pid = el.dataset.pid, idx = +el.dataset.idx;
      const p = posts.concat(S.published).filter(x => x.id === pid)[0];
      let img;
      if (p) img = (p.images || [])[idx];
      /* v32 · 空间相册里的真照片：数据在 acct(uid).photos，按 idx 取 */
      if (!img && pid === 'my') {
        const phs = (S.accounts[S.spaceUser] && S.accounts[S.spaceUser].photos) || [];
        const x = phs[idx];
        if (x) img = { src: x.img, title: x.t || ('照片 0' + (idx + 1)), note: profileOf(S.spaceUser).nick + '的相册' };
      }
      if (!img) {
        const styles = getComputedStyle(el);
        img = { grad: styles.backgroundImage, title: '相册 0' + (idx + 1), note: profileOf(S.spaceUser).nick + '的相册' };
      }
      lbReturnFocus = 'lb|' + pid + '|' + idx;
      /* 真图走 src 大图，演示占位图继续用渐变 —— 两种来源共用一个灯箱 */
      S.lb = {
        grad: img.grad || 'linear-gradient(135deg,#8fb6dd,#5f87b3)',
        src: img.full || img.src || '',
        title: img.title || img.label || '',
        note: img.note || ''
      };
      render(true); return;
    }
    if (act === 'lbt') {
      const tid = el.dataset.tid, idx = +el.dataset.idx;
      const t = threadPool().filter(function (x) { return x.id === tid; })[0];
      const img = t && (t.images || [])[idx];
      if (!img) return;
      lbReturnFocus = 'lbt|' + tid + '|' + idx;
      S.lb = { grad: 'linear-gradient(135deg,#8fb6dd,#5f87b3)', src: img.src, title: t.title.slice(0, 24), note: '主楼配图' };
      render(true); return;
    }
    /* 楼层配图：和主楼配图同一个灯箱，只是按「第几楼」取图 */
    if (act === 'lbf') {
      const tid = el.dataset.tid, fi = +el.dataset.fi, idx = +el.dataset.idx;
      const t = threadPool().filter(function (x) { return x.id === tid; })[0];
      const f = t ? threadFloors(t)[fi] : null;
      const img = f && (f.images || [])[idx];
      if (!img) return;
      lbReturnFocus = 'lb|' + tid + '|' + idx;
      S.lb = {
        grad: 'linear-gradient(135deg,#8fb6dd,#5f87b3)', src: img.src,
        title: '楼层配图', note: '#' + (fi + 2) + ' 楼 · ' + userOf(f.user).name
      };
      render(true); return;
    }
    /* 正文里的 @人：能认出 uid 才渲染成可点，点了进 TA 的空间 */
    if (act === 'mentionspace') {
      const uid = el.dataset.uid;
      if (!uid || !users[uid]) return;
      S.spaceUser = uid; S.route = 'space'; S.tab = '日志';
      render(false); return;
    }
    if (act === 'close-lb') { closeLightbox(); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.lb) { closeLightbox(); return; }
    if (e.key === 'Escape' && S.pop) { closePop(); return; }
    /* v40 · 键盘可达：Tab 到头像上按 Enter / 空格等于点它 */
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && e.target && e.target.matches &&
        e.target.matches('img[data-avuid]')) {
      e.preventDefault(); e.target.click(); return;
    }
    /* 回复框的 Ctrl / ⌘ + Enter：兑现 placeholder 里那句承诺 */
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.id === 'reply' && qs('.replybox')) {
      const btn = qs('.replybox [data-act="reply"]');
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    /* v33：私信 Enter 直接发（Shift + Enter 换行），和聊天软件一致；输入法拼字中不拦 */
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && e.target.id === 'dm-input') {
      e.preventDefault();
      const btn = qs('[data-act="dmsend"]');
      if (btn) btn.click();
      return;
    }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cin')) {
      e.preventDefault();
      const btn = qs('[data-act="sendcmt"][data-pid="' + e.target.dataset.pid + '"]');
      if (btn) btn.click();
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'ccount') return;
    /* 举报面板的两个可选输入：只写进 S，不重绘 —— 重绘会把光标和刚敲的字一起丢掉。
       提交时从 S 里读，所以输入过程中不需要任何 re-render。 */
    const rpAct = e.target.dataset ? e.target.dataset.act : '';
    if (rpAct === 'rpd' || rpAct === 'rpc') {
      const rid = e.target.dataset.id;
      if (rpAct === 'rpd') S.repD[rid] = e.target.value;
      else S.repC[rid] = e.target.value;
      return;
    }
    /* v38 · 插件页的 Go to file：只切行的 hidden，不重绘 ——
       重绘会把输入框和刚敲的字一起丢掉。 */
    if (e.target.id === 'gh-file-q') {
      const q = String(e.target.value || '').trim().toLowerCase();
      S.ghFileQ = e.target.value;
      let shown = 0;
      qsa('#gh-files .gh-file[data-path]').forEach(function (row) {
        const path = String(row.getAttribute('data-path') || '').toLowerCase();
        const hit = !q || path.indexOf(q) >= 0;
        row.hidden = !hit;
        if (hit) shown++;
      });
      const none = qs('#gh-files .gh-file-none');
      if (none) none.hidden = shown > 0;
      return;
    }
    /* v33：私信草稿、字数、输入框长高都只改节点，不重绘 —— 重绘会把光标和刚敲的字一起丢掉 */
    if (e.target.id === 'dm-input') {
      const uid = S.dmPeer;
      if (uid) S.dmDraft[uid] = e.target.value;
      const c = qs('#dm-count');
      if (c) c.textContent = e.target.value.length + ' / ' + DM_MAX;
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
      return;
    }
    if (e.target.id === 'dm-search') {
      S.dmQ = e.target.value;
      const q = S.dmQ.trim().toLowerCase();
      /* 有搜索词就把折叠区掰开：否则命中的陌生会话被父级 hidden 挡住，
         计数说「有结果」，列表却是空的 */
      const bd = qs('.dm-str-bd');
      if (bd) {
        bd.hidden = !(q || S.dmStrOpen);
        const hd = qs('.dm-str-hd');
        if (hd) hd.setAttribute('aria-expanded', bd.hidden ? 'false' : 'true');
      }
      let shown = 0;
      qsa('#dm-list .dm-row').forEach(function (r) {
        const hit = !q || (r.getAttribute('data-search') || '').indexOf(q) >= 0;
        r.hidden = !hit;
        if (hit) shown++;
      });
      const none = qs('#dm-none');
      if (none) none.hidden = shown > 0;
      return;
    }
    if (e.target.id === 'composer') {
      const c = qs('#ccount');
      if (c) c.textContent = e.target.value.length + ' / 500';
      return;
    }
    /* 帖子回复框草稿：别的重绘 / 刷新都不会把它冲掉（空间页的 #reply 是留言框，不参与）。
       内存同步之外再防抖落盘一次，否则刷新回来草稿就没了（验收簇 C）。 */
    if (e.target.id === 'reply') {
      if (qs('.replybox')) { S.rpDraft = e.target.value; draftSaveSoon(); }
      return;
    }
    if (e.target.id === 'artq') {
      S.artQ = e.target.value;
      if (S.artQ.trim()) S.artKind = '全部';
      render(true);
      const i = qs('#artq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    /* 鲸鲸空间发布框：标题 / 说明只改草稿，输入时不重绘（重绘会把焦点甩掉） */
    if (e.target.id === 'art-title') {
      artDraftOf().title = e.target.value;
      const n = qs('#art-title-n'); if (n) n.textContent = e.target.value.length + ' / 40';
      return;
    }
    if (e.target.id === 'art-desc') { artDraftOf().desc = e.target.value; return; }
    if (e.target.id === 'cm-input') {
      S.cmDraft = S.cmDraft || {};
      S.cmDraft[S.artId] = e.target.value;
      const t = qs('#cm-tip');
      if (t) t.textContent = e.target.value.length + ' / 300 · 链接 / 手机号 / 广告词会先进审核';
      return;
    }
    if (e.target.id === 'cm-reply-input') {
      S.cmDraft = S.cmDraft || {};
      S.cmDraft['r' + S.artId] = e.target.value;
      return;
    }
    if (e.target.id === 'art-author') { artDraftOf().author = e.target.value; return; }
    if (e.target.id === 'art-platform') { artDraftOf().platform = e.target.value; return; }
    if (e.target.id === 'art-url') { artDraftOf().url = e.target.value; return; }
    if (e.target.id === 'mktq') {
      S.q = e.target.value;
      if (S.q.trim()) S.cat = '全部';
      render(true);
      const i = qs('#mktq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    if (e.target.id === 'tagq') {
      /* 标签搜索只重绘标签卡（render(true) 保住滚动位置），并像 #forumq 一样把光标放回末尾 */
      S.tagQ = e.target.value;
      render(true);
      const i = qs('#tagq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    if (e.target.id === 'forumq') {
      S.q = e.target.value;
      if (S.q.trim()) S.ftag = '全部';
      render(true);
      const i = qs('#forumq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    /* v8 · 发布插件：同样只改状态与局部文案，输入时不重绘 */
    if (e.target.id === 'pub-name') {
      const pb = pubOf();
      /* 包名容错：大写转小写、空格与下划线转连字符，其余非法字符直接剥掉 */
      const cleaned = e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (cleaned !== e.target.value) {
        const pos = e.target.selectionStart;
        e.target.value = cleaned;
        try { e.target.setSelectionRange(pos, pos); } catch (err) {}
      }
      pb.name = cleaned;
      const tip = qs('#pub-name-tip');
      if (tip) {
        tip.innerHTML = pubNameOk(cleaned)
          ? '包名可用：<b>' + esc(cleaned) + '</b> · 装好后命令是 <b>pnpm dsh add ' + esc(cleaned) + '</b>'
          : (cleaned ? '只能用<strong>小写字母、数字、连字符</strong>，2~39 个字符，且以字母或数字开头。'
            : '包名决定安装命令，建议 <b>dsh-</b> 开头，全小写。');
      }
      const pv = qs('.pub-prev .pp-tx b'); if (pv) pv.textContent = cleaned || 'dsh-my-plugin';
      syncPubSubmit();
      return;
    }
    if (e.target.id === 'pub-desc') { pubOf().desc = e.target.value; return; }
    /* v7 · 编辑资料：只改草稿，不整页重绘（否则输入时焦点会跳） */
    if (e.target.id === 'pro-nick') {
      draftOf().nick = e.target.value;
      const n = qs('#pro-nick-n'); if (n) n.textContent = e.target.value.length + ' / 16';
      const b = qs('.prev-tx b'); if (b) b.textContent = e.target.value || '（未填写昵称）';
      return;
    }
    if (e.target.id === 'pro-sig') {
      draftOf().sig = e.target.value;
      const n = qs('#pro-sig-n'); if (n) n.textContent = e.target.value.length + ' / 60';
      const p = qs('.prev-tx p'); if (p) p.textContent = e.target.value || '这个人很懒，什么都没写。';
      return;
    }
  });

  /* v7 · 编辑资料：下拉选择与头像文件 */
  document.addEventListener('change', function (e) {
    const id = e.target.id;
    if (id === 'ava-file') return handleAvatarFile(e.target);
    if (id === 'cover-file') return handleCoverFile(e.target);
    if (id === 'sp-photo-file') return handleSpacePhoto(e.target);
    if (id === 'art-file') return handleArtFile(e.target);
    if (id === 'art-model-file') return handleArtModel(e.target);
    if (id === 'art-agree') { artDraftOf().agree = !!e.target.checked; return; }
    /* 日志 / 社群发帖的文件选择：走同一个 addImages，选完把 input 复位，
       否则同一张图选第二次不再触发 change。 */
    if (id === 'cmt-file' || id === 'nt-file') {
      const q = id === 'cmt-file' ? 'pendingImages' : 'ntImages';
      const prev = id === 'cmt-file' ? 'imgprev' : 'ntprev';
      /* 必须先拷成真数组：把 input.value 置空会把 FileList 一起清掉（它是活引用），
         直接传 e.target.files 进去等于传了个空列表。 */
      const files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      addImages(files, q).then(function () { repaintImgs(q, prev); });
      return;
    }
    /* 回复框配图：与发帖同一套校验，另外多一道「压到本地存档放得下」 */
    if (id === 'rp-file') {
      const rfiles = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      addReplyImages(rfiles).then(function (n) { if (n) render(true); });
      return;
    }
    if (id === 'pro-prov') {
      const d = draftOf();
      d.province = e.target.value;
      d.city = (profileOptions.provinces[d.province] || [''])[0];
      render(true);
      const s = qs('#pro-prov'); if (s) s.focus();
      return;
    }
    if (id === 'pro-city') { draftOf().city = e.target.value; render(true); const s = qs('#pro-city'); if (s) s.focus(); return; }
    if (id === 'pro-job') { draftOf().job = e.target.value; render(true); const s = qs('#pro-job'); if (s) s.focus(); return; }
    if (id === 'pub-license') { pubOf().license = e.target.value; render(true); const s = qs('#pub-license'); if (s) s.focus(); return; }
    if (id === 'pro-birth') {
      if (e.target.value) draftOf().birthday = e.target.value;
      render(true); const s = qs('#pro-birth'); if (s) s.focus(); return;
    }
  });

  /* ---------- 粘贴 / 拖拽配图 ----------
     两条路都只在「写日志」和「社群发新帖」的输入区里生效，别的地方粘贴图片不该有副作用。 */
  function editorOf(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || !el.closest) return null;
    if (el.closest('#composer')) return { queue: 'pendingImages', prev: 'imgprev' };
    if (el.closest('#nt-body') || el.closest('.newthread-card')) return { queue: 'ntImages', prev: 'ntprev' };
    /* 帖子回复框：配图走 addReplyImages（多一道缩图，缩不下就如实拒） */
    if (el.closest('#reply') || el.closest('.replybox')) return { queue: 'rp', prev: 'rpprev' };
    /* 鲸鲸空间的发布框只收一张图，走自己的 handleArtFile，不进 addImages 队列 */
    if (el.closest('.af-drop') || el.closest('.au-form')) return { queue: 'art', prev: '' };
    return null;
  }

  document.addEventListener('paste', function (e) {
    const box = editorOf(e.target);
    if (!box || !e.clipboardData) return;
    const files = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const it = e.clipboardData.items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && IMG_TYPES.indexOf(f.type) >= 0) files.push(f);
      }
    }
    if (!files.length) return;
    if (box.queue === 'art') { e.preventDefault(); artAcceptFile(files[0]); return; }
    /* 回复框：走 addReplyImages；草稿在状态里，整页重绘不丢字 */
    if (box.queue === 'rp') {
      e.preventDefault();
      addReplyImages(files).then(function (n) { if (n) render(true); });
      return;
    }
    /* 只拦有图的粘贴：纯文字粘贴必须保持浏览器原生行为 */
    e.preventDefault();
    addImages(files, box.queue).then(function (n) {
      repaintImgs(box.queue, box.prev);
      if (n) toast(n + ' 张图片已加进待发布，发表时一起上传', '🖼️');
    });
  });

  document.addEventListener('dragover', function (e) {
    if (!editorOf(e.target)) return;
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const zone = e.target.closest('#composer') || e.target.closest('.newthread-card') || e.target.closest('.af-drop') || e.target.closest('.replybox');
    if (zone) zone.classList.add('drop-hot');
  });

  document.addEventListener('dragleave', function (e) {
    const zone = e.target.closest && (e.target.closest('#composer') || e.target.closest('.newthread-card') || e.target.closest('.replybox'));
    if (zone) zone.classList.remove('drop-hot');
  });

  document.addEventListener('drop', function (e) {
    const box = editorOf(e.target);
    if (!box) return;
    const zone = e.target.closest && (e.target.closest('#composer') || e.target.closest('.newthread-card') || e.target.closest('.replybox'));
    if (zone) zone.classList.remove('drop-hot');
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const files = Array.prototype.filter.call(e.dataTransfer.files, function (f) { return IMG_TYPES.indexOf(f.type) >= 0; });
    if (!files.length) { toast('只能拖图片进来（PNG / JPG / GIF / WebP）', '⚠️'); return; }
    if (box.queue === 'art') { e.preventDefault(); artAcceptFile(files[0]); return; }
    if (box.queue === 'rp') {
      e.preventDefault();
      addReplyImages(files).then(function (n) { if (n) render(true); });
      return;
    }
    addImages(files, box.queue).then(function (n) {
      repaintImgs(box.queue, box.prev);
      if (n) toast(n + ' 张图片已加进待发布，发表时一起上传', '🖼️');
    });
  });

  /* 发布页：输入时只切换提交键的可用态与左侧提示，不整页重绘 */
  function syncPubSubmit() { recalcPub(); }

  /* 本地图片 → 方形裁切 200px → dataURL（先在本机预览）。
     真正上传到账号放在「保存资料」时做：用户点保存 → 等上传 + PATCH 完成 → 再跳空间页。
     这样不会出现「选完图立刻退出，请求还没发出去」的静默丢失。 */
  function handleAvatarFile(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    /* 手机相册常见 HEIC/HEIF，部分安卓还会给出空 MIME；只按 type 卡会把整张照片挡在门外。
       能不能真正解码交给下面的 Image.onerror 判断。 */
    const okType = /^image\/(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(f.type || '') ||
      (!f.type && /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name || ''));
    if (!okType) {
      S.fileErr = '只支持 JPG / PNG / WebP / GIF / HEIC'; S.avatarFile = null; render(true); toast('只支持 JPG / PNG / WebP / GIF / HEIC', '⚠️'); return;
    }
    /* 手机原图动辄 8–12 MB，直接拿原图上传会被接口的体积上限挡住。
       这里先在本地裁成方形、压成 512px JPEG，既保住清晰度，也让上传很小。
       20 MB 只是读取前的内存保护，不是上传限制。 */
    if (f.size > 20 * 1024 * 1024) {
      S.fileErr = '图片超过 20 MB，换一张小一点的'; S.avatarFile = null; render(true); toast('图片超过 20 MB', '⚠️'); return;
    }
    const token = (S.avatarToken || 0) + 1;
    S.avatarToken = token; S.avatarSyncing = null;
    S.avatarFile = null; S.avatarErr = ''; S.fileErr = ''; S.avatarBusy = true;
    render(true);
    const fail = function (msg) {
      if (S.avatarToken !== token) return;
      S.avatarBusy = false; S.avatarFile = null; S.fileErr = msg; render(true); toast(msg, '⚠️');
    };
    const rd = new FileReader();
    rd.onload = function () {
      const im = new Image();
      im.onload = function () {
        if (S.avatarToken !== token) return;
        try {
          const side = Math.min(im.width, im.height);
          const sx = Math.round((im.width - side) / 2), sy = Math.round((im.height - side) / 2);
          const out = Math.max(1, Math.min(512, side));
          const cv = document.createElement('canvas');
          cv.width = out; cv.height = out;
          const g = cv.getContext('2d');
          g.drawImage(im, sx, sy, side, side, 0, 0, out, out);
          const done = function (blob) {
            if (S.avatarToken !== token) return;
            if (!blob) { fail('这张图处理失败，换一张试试'); return; }
            S.avatarFile = new File([blob], 'avatar-' + Date.now() + '.jpg', { type: 'image/jpeg' });
            S.avatarBusy = false; S.avatarErr = ''; S.fileErr = '';
            /* 本机预览固定 200px，避免把 512px 图塞进 localStorage */
            const pv = document.createElement('canvas');
            pv.width = 200; pv.height = 200;
            pv.getContext('2d').drawImage(cv, 0, 0, out, out, 0, 0, 200, 200);
            acct().avatar = { img: pv.toDataURL('image/jpeg', .85) };
            saveState(); render(true);
            toast('头像已更新，点「保存资料」同步到账号', '🖼️');
          };
          if (cv.toBlob) cv.toBlob(done, 'image/jpeg', .9);
          else {
            fetch(cv.toDataURL('image/jpeg', .9)).then(function (r) { return r.blob(); }).then(done).catch(function () { fail('这张图处理失败，换一张试试'); });
          }
        } catch (err) { fail('这张图处理失败，换一张试试'); }
      };
      im.onerror = function () { fail('图片读不出来，换一张试试'); };
      im.src = rd.result;
    };
    rd.onerror = function () { fail('图片读不出来，换一张试试'); };
    rd.readAsDataURL(f);
  }

  /* 本地 /uploads 相对路径 → 能写进 users.avatar 的绝对 URL。
     开发环境页面在 8777、API 在 3000 时，优先用 DSH_API_BASE；否则用当前源。 */
  function normalizeAvatarUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return /\s/.test(s) ? '' : s;
    if (!/^\/uploads\/u\/\d{1,10}\//.test(s)) return '';
    const base = String(window.DSH_API_BASE || location.origin || '').replace(/\/+$/, '');
    return base ? base + s : s;
  }

  /* 上传 + 登记头像。返回 Promise<boolean>，失败时保留本地 200px 预览并写 S.avatarErr。
     保存资料时 await 这个 promise，避免「请求还在路上就退出登录」。 */
  function syncAvatarFile(f) {
    if (!f) return Promise.resolve(true);
    if (S.avatarSyncing) return S.avatarSyncing;
    if (isGuest() || !window.API || !API.uploadImage || !API.updateMe) {
      S.avatarErr = isGuest() ? '登录后才能同步头像' : '上传接口不可用';
      return Promise.resolve(false);
    }
    const uid = ME();
    const token = (S.avatarToken || 0) + 1;
    S.avatarToken = token;
    S.avatarErr = '';
    let p;
    p = API.uploadImage(f).then(function (up) {
      const url = normalizeAvatarUrl(up && up.url);
      if (!url) throw new Error('没拿到图片地址');
      return API.updateMe({ avatar: url }).then(function () {
        if (S.avatarToken !== token) return false;
        acct(uid).avatar = { img: url };
        S.avatarFile = null; S.avatarErr = '';
        saveState();
        if (S.account === uid) render(true);
        toast('头像已同步到账号', '☁️');
        return true;
      });
    }).catch(function (err) {
      if (S.avatarToken === token) {
        const raw = (err && err.message) || '上传失败';
        /* fetch 抛的是英文 TypeError: Failed to fetch，直接显示对用户没有意义 */
        S.avatarErr = /failed to fetch|networkerror|load failed|network error/i.test(raw)
          ? '网络中断，头像没传上去'
          : raw;
        toast('头像只存在本机：' + S.avatarErr, '⚠️', { duration: 5200 });
      }
      return false;
    });
    /* 不管成功失败，同一个 promise 结束后清掉句柄；换图时 token 已变，旧 promise 不影响新状态。 */
    p = p.then(function (ok) {
      if (S.avatarSyncing === p) S.avatarSyncing = null;
      return ok;
    });
    S.avatarSyncing = p;
    return p;
  }

  /* 保存资料：先把待同步头像传完，再落到本机并回空间。
     头像失败时留在编辑页、保留 200px 预览和原文件，用户再点一次就是重试。 */
  async function commitProfile() {
    const d = draftOf();
    const nickEl = qs('#pro-nick'), sigEl = qs('#pro-sig');
    if (nickEl) d.nick = nickEl.value;
    if (sigEl) d.sig = sigEl.value;
    d.nick = (d.nick || '').trim();
    d.sig = (d.sig || '').trim();
    if (!d.nick) { toast('昵称不能为空', '⚠️'); if (nickEl) nickEl.focus(); return; }
    if (d.nick.length > 16) { toast('昵称最多 16 个字符', '⚠️'); return; }
    if (S.avatarBusy) { toast('头像还在处理中，稍等一下再保存', '⏳'); return; }

    const uid = ME();
    acct(uid).profile = JSON.parse(JSON.stringify(d));
    saveState();

    let avatarOk = true;
    if (!isGuest() && S.avatarFile) {
      toast('正在把头像同步到账号…', '⏳', { duration: 1500 });
      avatarOk = await syncAvatarFile(S.avatarFile);
    } else if (!isGuest() && S.avatarSyncing) {
      avatarOk = await S.avatarSyncing;
    }
    if (!avatarOk) {
      S.fileErr = S.avatarErr || '头像上传失败';
      saveState(); render(true);
      toast('头像没传上去，资料已存本机；再点「保存资料」重试', '⚠️', { duration: 6000 });
      return;
    }

    S.draft = null; S.fileErr = ''; S.coverErr = '';
    S.route = 'space'; S.spaceUser = uid; S.pop = null; S.q = '';
    saveState(); render(false);
    toast('资料已保存，已回到你的空间', '✅');
    /* 资料文字仍然后台同步：头像已经落库，这里失败只会影响昵称/签名/城市。 */
    if (!isGuest() && window.API && API.updateMe) {
      API.updateMe({ name: d.nick, sig: d.sig, city: d.city }).then(function (res) {
        const u = users[uid];
        if (u && res && res.user) {
          if (res.user.name) u.name = res.user.name;
          u.sig = res.user.sig || '';
          if (res.user.city) u.city = res.user.city;
        }
        saveState(); render(true);
        toast('资料已同步到账号', '☁️');
      }, function (err) {
        toast('资料已存本机，账号同步失败：' + ((err && err.message) || '网络异常'), '⚠️');
      });
    }
  }

  /* ── 空间相册：本机加照片 ───────────────────────────────────────
     演示站后端没有相册表，照片只进 localStorage（和头像那张 200px 缓存同一档待遇），
     所以体积得自己掐：长边 900px 起、逐级降到 520px，直到 dataURL 装进 220KB；
     一个账号最多 9 张，相册自己封在 1.8MB 以内 —— 存档总共 5MB，还要留给头像、封面、作品图。
     相册是照片墙，不裁方形：格子自己用 object-fit:cover 去裁，图本身保持原比例。
     后台上传成功后（API.uploadImage）会把地址回填到 title，换设备也能看；
     传不上去就只留本机，不阻塞「照片已进相册」这件事。 */
  const SP_PHOTO_MAX = 9;
  const SP_PHOTO_MAX_IN = 8 * 1024 * 1024;
  const SP_PHOTO_MAX_CHARS = 220 * 1024;

  function compressPhoto(im) {
    const steps = [[900, .74], [760, .68], [640, .62], [520, .56]];
    const w0 = im.naturalWidth || im.width || 900, h0 = im.naturalHeight || im.height || 900;
    const long = Math.max(w0, h0) || 1;
    let last = '';
    for (let i = 0; i < steps.length; i++) {
      const max = steps[i][0], q = steps[i][1];
      const k = Math.min(1, max / long);
      const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0, w, h);
      let url = '';
      try { url = cv.toDataURL('image/jpeg', q); } catch (err) { url = ''; }
      if (!url) return '';
      last = url;
      if (url.length <= SP_PHOTO_MAX_CHARS) return url;
    }
    return last;
  }

  function handleSpacePhoto(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) { toast('只支持 JPG / PNG / WebP', '⚠️'); return; }
    if (f.size > SP_PHOTO_MAX_IN) { toast('图片超过 8 MB，换一张小一点的', '⚠️'); return; }
    const box = acct(ME());
    const list = box.photos || (box.photos = []);
    if (list.length >= SP_PHOTO_MAX) { toast('相册先放 ' + SP_PHOTO_MAX + ' 张，删一张再加', '🖼️'); return; }
    const rd = new FileReader();
    rd.onload = function () {
      const im = new Image();
      im.onload = function () {
        const url = compressPhoto(im);
        if (!url) { toast('这张图处理失败，换一张试试', '⚠️'); return; }
        list.unshift({ img: url, t: '' });
        /* 存档配额守卫：超了就从最老的开始丢，宁可少一张也不让整份存档写不进去 */
        let total = list.reduce(function (s, x) { return s + String(x.img).length; }, 0);
        while (total > 1.8 * 1024 * 1024 && list.length > 1) { total -= String(list.pop().img).length; }
        saveState(); render(true);
        toast('照片已放进相册', '🖼️');
        /* 服务端有图床就再传一份，把 dataURL 换成 URL（换设备也能看到）。
           失败只提示，不动本机那张 —— 相册首先得能用。 */
        if (!isGuest() && window.API && API.uploadImage) {
          API.uploadImage(f).then(function (up) {
            if (!up || !up.url) throw new Error('没拿到图片地址');
            /* 拿到的地址必须先真能打开再换：演示站没有 uploads 目录，
               地址会 404 —— 换上去就是一张裂图，不如留着本机这张能看的。 */
            return new Promise(function (res, rej) {
              const probe = new Image();
              probe.onload = function () {
                const cur = (acct(ME()).photos || []).filter(function (x) { return x.img === url; })[0];
                if (cur) { cur.img = up.url; saveState(); render(true); }
                res(true);
              };
              probe.onerror = function () { rej(new Error('图片地址打不开')); };
              probe.src = up.url;
            });
          }).catch(function (err) {
            toast('这张先存本机：' + ((err && err.message) || '上传失败'), '⚠️');
          });
        }
      };
      im.onerror = function () { toast('图片读不出来，换一张试试', '⚠️'); };
      im.src = rd.result;
    };
    rd.onerror = function () { toast('图片读不出来，换一张试试', '⚠️'); };
    rd.readAsDataURL(f);
  }

  /* ── 空间封面：本地上传 + 手动取景 ─────────────────────────────
     头像裁成方形天经地义，封面不能这么干：竖图或合影里想露出的那一段往往不在
     正中间。之前只等比缩小、把取景权交给 background-size:cover 居中裁，等于让
     用户碰运气。现在上传后先进裁切器，让用户自己框；框出来的区域就是存下来的
     那张图，三处渲染（空间头图 200px 高、首页名片 74px、编辑页预览 78px）继续
     用 center/cover 收尾 —— 数据模型没变，还是那一条 CSS 简写字符串。

     取景框比例定死 3:1，取三种真实宽高比的中间值：手机头图 ≈2:1、桌面头图
     ≈4.5:1、名片 ≈4:1。定 2:1 桌面会上下切掉一截，定 5:1 手机会把两侧切掉
     一半；3:1 两头各让一点，主体放在框中间两种屏上都还在画面里。

     出图逐级降质（1400 → 720 宽），直到 dataURL 装得进 COVER_MAX_CHARS：
     localStorage 一共 5 MB，还要留给点赞、评论和作品图。 */
  const CROP_RATIO = 3;
  const CROP_MIN_PX = 72;            // 取景框在屏幕上的最小宽度，再小就拖不准
  const CROP_STEPS = [[1400, .82], [1200, .78], [1000, .74], [860, .7], [720, .66]];

  /* 按源图矩形 (sx,sy,sw,sh) 出图；「整图」就是 (0,0,iw,ih)。
     只缩不放：把 300px 的小图放大到 1400 只会更糊。 */
  function encodeCover(im, sx, sy, sw, sh) {
    for (let i = 0; i < CROP_STEPS.length; i++) {
      const k = Math.min(1, CROP_STEPS[i][0] / sw);
      const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d');
      /* 透明 PNG 直接压 JPEG 会变黑底：先铺一层白再画 */
      g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
      g.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
      let url = '';
      try { url = cv.toDataURL('image/jpeg', CROP_STEPS[i][1]); } catch (err) { url = ''; }
      if (url && url.length <= COVER_MAX_CHARS) return url;
    }
    return '';
  }

  /* ---------- 封面裁切器 ----------
     宿在 body 上的命令式弹层，不走 render：拖动时每帧重绘整页会掉帧，
     pointer capture 也会跟着被替换掉的节点一起失效。
     状态只在弹层活着时有值，绝不进 S —— S 会被 saveState 序列化，
     一个 HTMLImageElement 塞进去，整份存档就写不进去了。 */
  let cropState = null;

  function cropClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 量一次版面：源像素坐标 ↔ 屏幕上那份坐标系的换算都落在这里 */
  function cropLayout() {
    const st = cropState;
    if (!st) return;
    const sRect = st.stageEl.getBoundingClientRect();
    const iRect = st.imgEl.getBoundingClientRect();
    st.dw = iRect.width || 1;
    st.dh = iRect.height || 1;
    st.ox = iRect.left - sRect.left;
    st.oy = iRect.top - sRect.top;
    st.sc = st.dw / st.iw;                     // 源像素 → 屏幕像素
    /* 上限两条：框宽不超过图宽，框高（= 宽 / 3）不超过图高 */
    st.maxW = Math.max(1, Math.min(st.iw, st.ih * CROP_RATIO));
    st.minW = Math.max(st.maxW * 0.3, Math.min(st.maxW, CROP_MIN_PX / (st.sc || 1)));
    const fr = st.frame;
    fr.w = cropClamp(fr.w || st.maxW, st.minW, st.maxW);
    fr.h = fr.w / CROP_RATIO;
    fr.x = cropClamp(fr.x, 0, Math.max(0, st.iw - fr.w));
    fr.y = cropClamp(fr.y, 0, Math.max(0, st.ih - fr.h));
    cropPaint();
  }

  /* 把源像素矩形落到 DOM 上；滑块与百分比读数一起同步 */
  function cropPaint() {
    const st = cropState;
    if (!st) return;
    const fr = st.frame;
    st.frameEl.style.left = (st.ox + fr.x * st.sc) + 'px';
    st.frameEl.style.top = (st.oy + fr.y * st.sc) + 'px';
    st.frameEl.style.width = (fr.w * st.sc) + 'px';
    st.frameEl.style.height = (fr.h * st.sc) + 'px';
    const pct = Math.round(fr.w / st.maxW * 100);
    st.rngEl.value = String(pct);
    st.pctEl.textContent = pct + '%';
  }

  /* 改取景范围时锁住框中心：只缩放不跳位，用户才敢来回拖滑块 */
  function cropSetPct(pct) {
    const st = cropState;
    if (!st) return;
    const fr = st.frame;
    const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
    const w = cropClamp(st.maxW * pct / 100, st.minW, st.maxW);
    fr.w = w; fr.h = w / CROP_RATIO;
    fr.x = cropClamp(cx - w / 2, 0, Math.max(0, st.iw - w));
    fr.y = cropClamp(cy - fr.h / 2, 0, Math.max(0, st.ih - fr.h));
    cropPaint();
  }

  /* Esc 与 Tab 走 document 捕获阶段：先于页面自身的快捷键，
     也先把焦点锁在弹层里（灯箱那套只处理了 Esc，这里有滑块和两个按钮） */
  function cropKeys(e) {
    const st = cropState;
    if (!st) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCoverCrop(false); return; }
    if (e.key !== 'Tab') return;
    const items = Array.prototype.filter.call(
      st.root.querySelectorAll('button, input, [tabindex="0"]'),
      function (x) { return !x.disabled && x.offsetParent !== null; }
    );
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function cropOnResize() { if (cropState) cropLayout(); }

  function closeCoverCrop(immediate) {
    const st = cropState;
    cropState = null;
    document.removeEventListener('keydown', cropKeys, true);
    window.removeEventListener('resize', cropOnResize);
    document.body.classList.remove('crop-open');
    if (!st) return;
    const root = st.root;
    root.classList.remove('open');
    const rm = function () { if (root.parentNode) root.parentNode.removeChild(root); };
    if (immediate) rm(); else setTimeout(rm, 180);
    /* 焦点回到进来的那一格：整页重绘之后原节点没了，就回到封面格 */
    const back = (st.back && st.back.parentNode) ? st.back : qs('.cover-up');
    if (back && back.focus) { try { back.focus({ preventScroll: true }); } catch (err) { back.focus(); } }
  }

  function openCoverCrop(im) {
    closeCoverCrop(true);
    const iw = im.naturalWidth || im.width || 0;
    const ih = im.naturalHeight || im.height || 0;
    if (!iw || !ih) { toast('图片读不出来，换一张试试', '⚠️'); return; }
    const root = document.createElement('div');
    root.className = 'cropper';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '裁切空间封面');
    root.innerHTML =
      '<div class="crop-card">' +
      '<div class="crop-head"><b>裁切空间封面</b>' +
      '<span class="crop-desc">拖动方框选要露出的那一段，滑块调取景范围，也可以直接点画面把方框挪过去。' +
      '头图、名片、预览三处都是铺满裁切，主体放中间最稳。</span>' +
      '<span class="crop-err" role="alert"></span></div>' +
      '<div class="crop-stage">' +
      '<img class="crop-img" alt="待裁切的封面图片" draggable="false">' +
      '<div class="crop-frame" tabindex="0" role="application" aria-label="取景框，方向键微调">' +
      '<i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i></div></div>' +
      '<div class="crop-foot"><div class="crop-zoom"><span>取景</span>' +
      '<input type="range" class="crop-rng" min="30" max="100" step="1" value="100" aria-label="取景范围">' +
      '<em class="crop-pct">100%</em></div>' +
      '<button type="button" class="btn sm ghost" data-crop="cancel">取消</button>' +
      '<button type="button" class="btn sm blue" data-crop="ok">使用这张</button></div></div>';
    document.body.appendChild(root);
    document.body.classList.add('crop-open');

    const st = cropState = {
      root: root, im: im, iw: iw, ih: ih,
      stageEl: root.querySelector('.crop-stage'),
      imgEl: root.querySelector('.crop-img'),
      frameEl: root.querySelector('.crop-frame'),
      rngEl: root.querySelector('.crop-rng'),
      pctEl: root.querySelector('.crop-pct'),
      errEl: root.querySelector('.crop-err'),
      back: document.activeElement,
      frame: { x: 0, y: 0, w: 0, h: 0 },
      ox: 0, oy: 0, dw: 0, dh: 0, sc: 1, maxW: 1, minW: 1
    };
    /* 初始框＝能框下的最大区域并居中，等于「不动它就跟以前一模一样」 */
    st.frame.w = Math.max(1, Math.min(iw, ih * CROP_RATIO) * 0.999);
    st.frame.h = st.frame.w / CROP_RATIO;
    st.frame.x = (iw - st.frame.w) / 2;
    st.frame.y = (ih - st.frame.h) / 2;

    /* 拖动：pointer capture 让手指移出框也不丢事件（触屏必需） */
    let drag = null;
    st.frameEl.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, fx: st.frame.x, fy: st.frame.y };
      try { st.frameEl.setPointerCapture(e.pointerId); } catch (err) {}
      st.frameEl.classList.add('dragging');
      e.preventDefault();
    });
    st.frameEl.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = (e.clientX - drag.x) / (st.sc || 1);
      const dy = (e.clientY - drag.y) / (st.sc || 1);
      st.frame.x = cropClamp(drag.fx + dx, 0, Math.max(0, st.iw - st.frame.w));
      st.frame.y = cropClamp(drag.fy + dy, 0, Math.max(0, st.ih - st.frame.h));
      cropPaint();
    });
    const endDrag = function (e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      st.frameEl.classList.remove('dragging');
      try { st.frameEl.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    st.frameEl.addEventListener('pointerup', endDrag);
    st.frameEl.addEventListener('pointercancel', endDrag);
    /* 键盘：方向键 6px、Shift 24px（屏幕像素换算回源像素），框要能被键盘摆 */
    st.frameEl.addEventListener('keydown', function (e) {
      const step = (e.shiftKey ? 24 : 6) / (st.sc || 1);
      const f0 = st.frame;
      const maxX = Math.max(0, st.iw - f0.w), maxY = Math.max(0, st.ih - f0.h);
      if (e.key === 'ArrowLeft') f0.x = cropClamp(f0.x - step, 0, maxX);
      else if (e.key === 'ArrowRight') f0.x = cropClamp(f0.x + step, 0, maxX);
      else if (e.key === 'ArrowUp') f0.y = cropClamp(f0.y - step, 0, maxY);
      else if (e.key === 'ArrowDown') f0.y = cropClamp(f0.y + step, 0, maxY);
      else return;
      e.preventDefault(); e.stopPropagation();
      cropPaint();
    });
    /* 点画面任意处把框挪过去（手机上比拖更顺手） */
    st.stageEl.addEventListener('pointerdown', function (e) {
      if (st.frameEl === e.target || st.frameEl.contains(e.target)) return;
      const r = st.imgEl.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const cx = (e.clientX - r.left) / (st.sc || 1);
      const cy = (e.clientY - r.top) / (st.sc || 1);
      st.frame.x = cropClamp(cx - st.frame.w / 2, 0, Math.max(0, st.iw - st.frame.w));
      st.frame.y = cropClamp(cy - st.frame.h / 2, 0, Math.max(0, st.ih - st.frame.h));
      cropPaint();
    });
    st.rngEl.addEventListener('input', function () { cropSetPct(Number(st.rngEl.value) || 100); });
    root.addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('[data-crop]');
      if (!b) return;
      if (b.dataset.crop === 'cancel') { closeCoverCrop(false); return; }
      const fr = st.frame;
      const sw = Math.max(1, Math.round(fr.w)), sh = Math.max(1, Math.round(fr.h));
      const sx = cropClamp(Math.round(fr.x), 0, Math.max(0, st.iw - sw));
      const sy = cropClamp(Math.round(fr.y), 0, Math.max(0, st.ih - sh));
      const url = encodeCover(im, sx, sy, sw, sh);
      if (!url) {
        st.errEl.textContent = '这一段压不到能存下的大小：把取景范围调大一点再试';
        st.errEl.classList.add('on');
        return;
      }
      /* 存 background 简写而不是拆成 background-image + background-size：
         cover 字段只有一个字符串位，预设的 linear-gradient 和这里的 url(...)
         才能共用同一条渲染路径（三处都是 style="background:…"） */
      acct().cover = 'url(' + url + ') center/cover no-repeat';
      S.coverErr = ''; saveState();
      const whole = sw >= iw - 1 && sh >= ih - 1;
      closeCoverCrop(true);
      render(true);
      toast(whole ? '封面已换成这张图' : '封面已换成裁好的这一段', '🖼️');
    });

    document.addEventListener('keydown', cropKeys, true);
    window.addEventListener('resize', cropOnResize);
    /* 图片就是刚解码过的那一张，赋 src 只是让它参与布局 */
    st.imgEl.onload = function () { cropLayout(); };
    st.imgEl.src = im.src || '';
    if (st.imgEl.complete && st.imgEl.naturalWidth) cropLayout();
    /* 入场：先挪焦点到取景框，再挂 .open，免得焦点环在透明元素上闪一下 */
    requestAnimationFrame(function () {
      if (cropState === st) { root.classList.add('open'); st.frameEl.focus({ preventScroll: true }); }
    });
  }

  function handleCoverFile(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    const tile = qs('.cover-up');
    /* 大图解码 + 逐级编码要几百毫秒：先把那一格改成「正在压缩」并禁点，
       否则用户会以为没反应，连点两下又开一次文件框 */
    const setBusy = function (tx) {
      if (!tile) return;
      tile.classList.add('busy'); tile.disabled = true;
      const s = tile.querySelector('.cu-tx');
      if (s && tx) s.textContent = tx;
    };
    if (COVER_TYPES.indexOf(f.type) < 0) {
      S.coverErr = '封面只支持 JPG / PNG / WebP'; render(true);
      toast('封面只支持 JPG / PNG / WebP', '⚠️'); return;
    }
    if (f.size > COVER_MAX_IN) {
      S.coverErr = '封面图片超过 10 MB，换一张小一点的'; render(true);
      toast('封面图片超过 10 MB', '⚠️'); return;
    }
    /* 忙碌态只覆盖「解码」这一小段：解码完裁切器接管，
       格子必须马上回到可点状态，否则用户在弹层里点了取消，
       回来看到的是一格永远卡在「正在解码」的按钮。 */
    const txEl = tile && tile.querySelector('.cu-tx');
    const origTx = txEl ? txEl.textContent : '';
    const clearBusy = function () {
      if (!tile) return;
      tile.classList.remove('busy'); tile.disabled = false;
      const s = tile.querySelector('.cu-tx');
      if (s) s.textContent = origTx;
    };
    setBusy('正在解码图片…');
    const rd = new FileReader();
    rd.onload = function () {
      const im = new Image();
      im.onload = function () {
        clearBusy();
        S.coverErr = '';
        openCoverCrop(im);
      };
      im.onerror = function () {
        clearBusy();
        S.coverErr = '图片读不出来，换一张试试'; render(true); toast('图片读不出来', '⚠️');
      };
      im.src = rd.result;
    };
    rd.onerror = function () {
      clearBusy();
      S.coverErr = '图片读不出来，换一张试试'; render(true);
    };
    rd.readAsDataURL(f);
  }

  document.addEventListener('keydown', function (e) {
    const kEl = e.target;
    if (kEl instanceof HTMLElement && kEl.getAttribute('role') === 'button' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      kEl.click();
      return;
    }
    if (e.target.id === 'navq' && e.key === 'Enter') {
      smartSearch(e.target.value); e.target.blur();
    }
    if (e.target.id === 'mktq' && e.key === 'Enter') e.target.blur();
  });

  /* 右下浮动按钮：写日志 / 回到顶部 */
  const totop = document.getElementById('totop');
  const fabWrite = document.getElementById('fab-write');
  const fabTop = document.getElementById('fab-top');
  if (fabTop) fabTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: scrollMode() }));
  if (fabWrite) {
    /* ✎ 按路由分派：帖子详情回复本帖、社群发新帖、其余写日志。
       旧实现一律跳首页，会把回复框里打了一半的字静默吞掉。 */
    fabWrite.addEventListener('click', () => {
      let target = null;
      if (S.route === 'thread') {
        target = qs('#reply');
        if (!target) { toast('这一页没有回复框', '✍️'); return; }
      } else if (S.route === 'forum') {
        S.composerOpen = !S.composerOpen;
        render(true);
        target = qs('.newthread-card input') || qs('.newthread-card textarea');
        if (!target) { toast('已打开发新帖表单', '✍️'); return; }
      } else {
        if (S.route !== 'feed') { S.route = 'feed'; S.q = ''; S.pop = null; render(false); }
        target = qs('#composer');
        if (!target) { toast('已回到日志页，点输入框写点什么', '✍️'); return; }
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: scrollMode() });
      /* 图标按钮的提示文案跟当前路由对齐 */
      const label = S.route === 'thread' ? '回复本帖' : S.route === 'forum' ? '发新帖' : '写日志';
      fabWrite.setAttribute('aria-label', label);
      fabWrite.setAttribute('title', label);
    });
  }
  /* ↑ 只在超过一屏后出现；隐藏时必须从 Tab 序列里退出去，
     否则键盘会停在一个看不见的按钮上 */
  window.addEventListener('scroll', () => {
    if (!totop) return;
    const show = window.scrollY > 320;
    totop.classList.toggle('show', show);
    if (fabTop) {
      fabTop.disabled = !show;
      fabTop.setAttribute('aria-hidden', show ? 'false' : 'true');
      fabTop.tabIndex = show ? 0 : -1;
    }
  }, { passive: true });

  try {
    const t = localStorage.getItem('dsh-forum-theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch (err) {}

  /* 调试/自动化钩子：不参与业务逻辑 */
  window.__dsh = {
    render: function (k) { render(k); },
    /* 数据同步完成后由 api.js 调用：数据没变化就别动 DOM。
       两道闸门都是「别把视频 iframe 打碎重建」：
       ① 认证三页永远不重绘（它们也不吃服务端列表数据）；
       ② 首绘时已经等过同步（首页 / 鲸鲸空间）或这一帧画的就是当前版本 → 重绘只会白白重建卡片。 */
    renderDataSync: function () {
      if (AUTH_ONLY_ROUTES[S.route]) return false;
      if (paintedDataVersion >= dataVersionNow()) return false;
      render(false);
      return true;
    },
    state: S, data: D, gate: gateRoute
  };
  window.__dshAuth = window.AUTH || null;

  /* 品牌名同步到标签页标题（配合 ?b= 预览时也能立刻看到） */
  document.title = BR.full;
  var md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', BR.name + ' —— 仿 QQ 空间风格的社群前端：更新日志流、插件条目库、社群版块、聊天与个人空间。');

  /* 内核已经登录着某个账号时，把「我是谁」对齐到它 —— 刷新后不会掉回演示账号 u1。
     只对齐身份，不写会话：写会话是 AUTH 的事，页面只读。 */
  (function syncBootIdentity() {
    const st = authState();
    if (st.mode === 'authed' && st.uid) adoptAccount(st.uid, st.name);
  })();

  applyHash();
  /* 首绘还没落笔时，hashchange / 首绘都由 boot() 统一处理 ——
     否则冷加载这几百毫秒里改一次 hash 就会先画一帧卡片，等数据同步回来再把它重写掉，
     正好又制造出我们想消灭的那次「卡片重新出现」。 */
  const bootState = { painted: false };
  window.addEventListener('hashchange', function () {
    /* 自己 pushState 写出的 hash 也会触发 hashchange，直接忽略；只有真实后退/前进才处理 */
    if (location.hash === lastHashShown) return;
    const changed = applyHash();
    if (!bootState.painted) return; /* 首绘交给 boot()，它画的时候会读最新的 S.route */
    if (changed) {
      fromHashNav = true;
      try { render(false); } finally { fromHashNav = false; }
    }
  });

  /* 另一个标签页改了收藏：localStorage 的 storage 事件只会在「别的标签页」触发，
     所以这里不是回声。只同步收藏相关状态，不动正在输入的草稿 ——
     首页重绘会清掉 composer 的输入，宁可只更新计数，也不替用户丢字。 */
  window.addEventListener('storage', function (e) {
    if (e.key !== STATE_KEY || !e.newValue) return;
    let saved = null;
    try { saved = JSON.parse(e.newValue); } catch (err) { return; }
    if (!saved || typeof saved !== 'object') return;
    if (Array.isArray(saved.fav)) S.fav = new Set(saved.fav);
    if (Array.isArray(saved.artFav)) S.artFav = new Set(saved.artFav);
    if (Array.isArray(saved.favThread)) S.favThread = new Set(saved.favThread);
    if (Array.isArray(saved.favPlug)) S.favPlug = new Set(saved.favPlug);
    if (Array.isArray(saved.likePlug)) S.likePlug = new Set(saved.likePlug);
    if (Array.isArray(saved.favUser)) S.favUser = new Set(saved.favUser);
    S.favOrder = Array.isArray(saved.favOrder) ? saved.favOrder.filter(function (k) {
      return typeof k === 'string' && k.length <= 80;
    }) : [];
    sweepFavOrder();
    if (!bootState.painted) return;
    const n = favCount();
    Array.prototype.forEach.call(document.querySelectorAll('[data-route="favs"] .rail-n'), function (el) {
      el.textContent = n;
      el.classList.toggle('zero', !n);
    });
    /* 只改收藏自己的角标。.menu-n 是收藏与私信共用的样式类，早先这里按类名通吃，
       一次跨标签页改收藏就会把私信未读数覆盖成收藏数（还会让未读角标跟着收藏总数显隐）。 */
    Array.prototype.forEach.call(document.querySelectorAll('.menu-n[data-n="fav"]'), function (el) {
      el.textContent = n;
      el.hidden = !n;
    });
    if (S.route === 'favs' || S.route === 'artview') {
      suppressSave = true;
      try { render(true); } finally { suppressSave = false; }
    }
  });

  /* 首绘前要等的两件事，都是为了「整页只画一次」：
     ① 身份落定：AUTH 启动时会同时发 /auth/me 与 provider 列表，
        先画一帧 guest 再跳成已登录，看起来就是「登出闪一下又登回来」（1.2 秒超时照画）；
     ② 首页 / 鲸鲸空间的数据同步：这两页顶部就是 whale/index.html 的 iframe 视频卡，
        数据晚到再整页重绘，iframe 会连文档一起销毁重建 —— 视频重新下载、重新取首帧、
        再从透明淡入，正是用户说的「卡片闪一下才出现」。等同步完再画，卡片只建一次（1.5 秒超时照画）。
     等不到也照常画：网络慢不该让页面一直空着。 */
  (function boot() {
    const paint = function () {
      if (bootState.painted) return;
      bootState.painted = true;
      /* 身份回来了再对齐一次：Cookie 有效时把「我是谁」换成服务端认的人 */
      const st = authState();
      if (st.mode === 'authed' && st.uid) adoptAccount(st.uid, st.name);
      /* 刷新后仍然会拦一次：白板账号直接落到 #/welcome，而不是先画一帧
         带 0 粉丝的空空间再跳走。 */
      if (needsOnboarding() && S.route === 'feed') {
        S.route = 'welcome';
        try { history.replaceState(null, '', location.pathname + location.search + '#/welcome'); } catch (err) {}
      }
      try { render(false); } catch (err) { /* 首绘失败不该让整页停摆 */ }
    };
    const afterAuth = function (cb) {
      const auth = window.AUTH;
      if (!auth || !auth.ready || typeof auth.ready.then !== 'function') { cb(); return; }
      const timer = setTimeout(cb, 1200);
      const go = function () { clearTimeout(timer); cb(); };
      auth.ready.then(go, go);
    };
    afterAuth(function () {
      const sync = window.__dshSync;
      /* 访客的收藏页等会儿会被闸门送到登录页，不必为它等列表数据 */
      if (!BOOT_SYNC_ROUTES[S.route] || (S.route === 'favs' && authState().mode !== 'authed') ||
          !sync || typeof sync.then !== 'function') { paint(); return; }
      const timer = setTimeout(paint, 1500);
      const go = function () { clearTimeout(timer); paint(); };
      sync.then(go, go);
    });
  })();
})();
