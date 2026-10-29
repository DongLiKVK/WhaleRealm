/* ================= 鲸域 · API 数据层 ================= */
/*
  作用：把后端返回的数据转成 app.js 认识的形状，并原地替换 window.DATA 里的数组。

  为什么要「原地替换」而不是重新赋值：
  app.js 第 6 行是 `const users = D.users, plugins = D.plugins, ...`，
  它在 IIFE 启动时就把引用抓住了一辈子。所以只能改对象内容，不能换引用。

  降级策略：任何请求失败都保持 data.js 的原样，页面照常显示演示数据，
  不白屏、不报错弹窗。顶栏会挂一个「离线演示」角标。
*/
(function () {
  'use strict';

  const BASE = (window.DSH_API_BASE || '') + '/api';
  const D = window.DATA;
  /* 服务端数据版本号：sync() 每成功应用一批就 +1。
     页面绘制时记下它，同步回调里比较 —— 已画进去的版本无需整页重写，
     否则每次重写都会把鲸鱼娘 iframe 连文档一起销毁重建（视频重新加载、重新淡入）。 */
  let dataVersion = 0;
  /* 短信通道是否真的能发码：服务端 GET /api/auth/phone/config 说了算。
     默认 false —— 通道没接通时「手机号认证」不该当闸门用，否则用户会被永远等不到的短信卡住。
     默认值必须是 false 而不是 true：宁可少拦一次，也不要拦在一条死路上。 */
  let phoneCfg = { smsEnabled: false, devMode: false, loaded: false };

/* 插件分类归一化：库里可能还留着旧五项分类（创作/效率/界面/运维/逆向），左栏的分类表现在是
   23 类，不归一化的话那几类会全落 0、看着像内容丢了。映射表在 data.js 的 pluginCatMigrate。 */
function migrateCat(name, cat) {
  const M = (D && D.pluginCatMigrate) || {};
  if (M.bySlug && M.bySlug[name]) return M.bySlug[name];
  if (M.byCat && M.byCat[cat]) return M.byCat[cat];
  return cat;
}

  /* ---------- 基础请求 ---------- */
  async function req(path, opts) {
    const o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
    if (o.body && typeof o.body !== 'string') {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(BASE + path, o);
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || json.ok === false) {
      const err = new Error((json && json.error && json.error.message) || ('请求失败 ' + res.status));
      err.code = (json && json.error && json.error.code) || 'HTTP_' + res.status;
      err.status = res.status;
      /* 服务端的 extras 放在 body.data 里（server/src/http.js 的 fail()），
         比如 ALREADY_ONLINE 会带 { canTakeover, ua }，不搬运过来就只剩一句「已在别处登录」。 */
      err.data = (json && json.data) || null;
      throw err;
    }
    return json.data;
  }

  /* 服务端时间戳统一成展示串：threads.created_at 是秒，直接 slice 会露出「1792679337」这种裸数字 */
  function stampOf(v) {
    const n = typeof v === 'number' ? v : (/^\d{9,13}$/.test(String(v == null ? '' : v)) ? Number(v) : NaN);
    if (!isFinite(n) || !n) return 0;
    return n < 1e12 ? n * 1000 : n;
  }
  function stampFmt(v) {
    const ms = stampOf(v);
    if (!ms) return '';
    const d = Math.max(0, Date.now() - ms);
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
    const dd = new Date(ms), p = function (k) { return (k < 10 ? '0' : '') + k; };
    return dd.getFullYear() + '-' + p(dd.getMonth() + 1) + '-' + p(dd.getDate());
  }

  const API = {
    get: function (p) { return req(p); },
    post: function (p, b) { return req(p, { method: 'POST', body: b || {} }); },
    del: function (p) { return req(p, { method: 'DELETE' }); },
    patch: function (p, b) { return req(p, { method: 'PATCH', body: b || {} }); },

    /* ---------- 认证 ---------- */
    phoneConfig: function () {
      return req('/auth/phone/config').then(function (d) {
        phoneCfg = { smsEnabled: !!(d && d.smsEnabled), devMode: !!(d && d.devMode), loaded: true };
        return phoneCfg;
      });
    },
    /* 同步读取：gateRoute 是同步渲染路径，等不了 promise */
    phoneEnabled: function () { return !!phoneCfg.smsEnabled; },
    register: function (email, password, name) { return API.post('/auth/register', { email: email, password: password, name: name }); },
    login: function (email, password) { return API.post('/auth/login', { email: email, password: password }); },
    logout: function () { return API.post('/auth/logout'); },
    me: function () { return API.get('/auth/me'); },
    /* 改资料（昵称 / 签名 / 城市 / 头像）。
       以前这些字段只写进 localStorage，换一台设备就全丢，别人也永远看到注册时那个名字；
       现在落到服务端 users 表，PATCH /auth/me 只收白名单字段，逐项校验长度。 */
    updateMe: function (patch) { return API.patch('/auth/me', patch || {}); },

    /* ---------- 内容 ---------- */
    feed: function (cursor, limit) {
      return API.get('/feed?limit=' + (limit || 20) + (cursor ? '&cursor=' + cursor : ''));
    },
    publish: function (text, images, plugin, pluginVer) {
      return API.post('/posts', { text: text, images: images || [], plugin: plugin || '', pluginVer: pluginVer || '' });
    },
    like: function (id) { return API.post('/posts/' + id + '/like'); },
    comments: function (id) { return API.get('/posts/' + id + '/comments'); },
    comment: function (id, text) { return API.post('/posts/' + id + '/comments', { text: text }); },
    forums: function () { return API.get('/forums'); },
    threads: function (slug) { return API.get('/forums/' + encodeURIComponent(slug) + '/threads'); },
    /* 发主题：落库版。返回 { item } 与列表项同形，调用方直接塞进列表，
       不必再拉一次 —— 拉一次也会被 hydrate 覆盖成服务端顺序，反而看不出自己刚发的那条。 */
    threadsCreate: function (slug, data) {
      return API.post('/forums/' + encodeURIComponent(slug) + '/threads', data || {});
    },
    /* 认领：① 先向服务端要验证串（绑 plugin+user，24 小时有效）② 作者把串写进自己仓库
       ③ 服务端回读仓库公开内容校验，命中才把作者改成你。前端不再自己编验证串。 */
    claimChallenge: function (id) { return API.post('/plugins/' + encodeURIComponent(id) + '/claim'); },
    claimVerify: function (id, token, method) {
      return API.post('/plugins/' + encodeURIComponent(id) + '/claim/verify', { token: token, method: method || 'readme' });
    },
    claim: function (id) { return API.post('/plugins/' + encodeURIComponent(id) + '/claim'); },
    /* 作者仓库里的 README 原文（Markdown，未渲染）。服务端缓存 7 天、同条目并发只回源一次，
       所以条目页可以放心每次打开都问一次；失败时返回 status:'none' 而不是抛错。 */
    pluginReadme: function (id) { return API.get('/plugins/' + encodeURIComponent(id) + '/readme'); },
    plugins: function (q, tag) {
      const qs = [];
      if (q) qs.push('q=' + encodeURIComponent(q));
      if (tag) qs.push('tag=' + encodeURIComponent(tag));
      return API.get('/plugins' + (qs.length ? '?' + qs.join('&') : ''));
    },
    /* 举报：必须落到服务端。以前「提交举报」只弹一个 toast，侵权与恶意代码的通知
       从来没到过任何人手里 —— 对一个索引了 6700+ 个第三方仓库的站来说，
       这条通道缺失比任何单条内容都危险。
       返回 { id, duplicate }：duplicate=true 表示同一 IP 十分钟内报过同一个目标，
       服务端复用了原编号（前端表现与首次提交一致，用户不必知道自己被去重了）。 */
    report: function (payload) {
      const p = payload || {};
      return API.post('/reports', {
        targetType: p.targetType || '',
        targetId: p.targetId || 0,
        reason: p.reason || '',
        detail: p.detail || '',
        contact: p.contact || ''
      });
    },

    /* 主题详情 / 回帖 / 点赞：以前后端只有列表接口，详情页的楼层是前端写死的假数据。
       slug 由调用方传（帖子行里有 cat），id 是服务端主题主键。 */
    threadDetail: function (slug, id) {
      return API.get('/forums/' + encodeURIComponent(slug) + '/threads/' + encodeURIComponent(id));
    },
    threadReply: function (slug, id, body, parentId) {
      return API.post('/forums/' + encodeURIComponent(slug) + '/threads/' + encodeURIComponent(id) + '/replies',
        { body: body, parentId: parentId || null });
    },
    threadLike: function (slug, id) {
      return API.post('/forums/' + encodeURIComponent(slug) + '/threads/' + encodeURIComponent(id) + '/like');
    },
    /* 把服务端返回的 publicUser 登记进 D.users：楼层作者、私信对方可能不在当前这一页数据里，
       不登记就会渲染成「访客」。形状与 sync() 里的 remember 保持一致。 */
    adoptUser: function (u) {
      if (!u || !u.id) return null;
      const key = 's' + u.id;
      if (!D.users[key]) {
        D.users[key] = {
          id: u.id,
          name: u.name, emoji: u.emoji, level: u.level, badge: u.badge,
          grad: u.grad, sig: u.sig, city: u.city,
          ava: u.avatar ? { img: u.avatar } : null,
          fans: u.fans, follows: u.follows, visits: u.visits
        };
      }
      return key;
    },

    /* 发布插件条目：发布表单以前只把 stage 改成 review，服务端根本没有这条路由。 */
    publishPlugin: function (data) {
      return API.post('/plugins', data || {});
    },

    /* ---------- 私信 ----------
       前端的 uid 是 's'+数据库主键（服务端账号）或 'u1'…（演示账号），
       服务端只认数字，所以这里统一剥掉前缀再拼路径。 */
    dmList: function () { return API.get('/messages'); },
    dmHistory: function (uid) { return API.get('/messages/' + srvId(uid)); },
    dmSend: function (uid, body) { return API.post('/messages/' + srvId(uid), { body: body }); },

    /* ---------- 图片上传（三步：签名 → 直传 → 拿 URL） ---------- */
    signUpload: function (filename, contentType, size) {
      return API.post('/upload/sign', { filename: filename, contentType: contentType, size: size });
    },

    /**
     * 压缩并上传一张图。
     * 静态图：canvas 缩到长边 1920、质量 0.85（规范第 4 条）。
     * GIF：不压缩（动了就掉帧），直接原样传，后端/COS 侧再转 WebP。
     * 返回 { key, w, h, type, url }，直接塞进 publish 的 images 数组。
     */
    uploadImage: async function (file) {
      if (!file) throw new Error('没有选择文件');
      if (file.size > 5242880) throw new Error('图片超过 5 MB，先压缩一下');

      let blob = file;
      let w = 0, h = 0;
      const isGif = file.type === 'image/gif';

      if (!isGif && file.type.indexOf('image/') === 0) {
        try {
          const out = await compress(file, 1920, 0.85);
          blob = out.blob; w = out.w; h = out.h;
        } catch (e) {
          blob = file;
        }
      }

      const sign = await API.signUpload(file.name || 'image', blob.type || file.type, blob.size);

      const put = await fetch(sign.uploadUrl, {
        method: sign.method || 'PUT',
        headers: sign.headers || { 'Content-Type': blob.type },
        body: blob
      });
      if (!put.ok) throw new Error('上传失败 ' + put.status);

      /* 本地降级模式下，后端可能把 GIF 转成 WebP 并换了扩展名，
         所以以服务端返回的 key/url 为准；COS 直传时 put 的响应是空的，
         读不到 JSON 就退回用签名阶段给的 key。 */
      let key = sign.key, url = sign.url, type = blob.type || file.type;
      if (sign.local) {
        try {
          const body = await put.json();
          const d = body && body.ok && body.data;
          if (d && d.key) {
            key = d.key;
            url = d.url || url;
            type = d.type || type;
            if (d.w && d.h) { w = d.w; h = d.h; }
          }
        } catch (e) {
          /* 响应不是 JSON（理论上不会），保持签名阶段的 key */
        }
      }

      return { key: key, w: w, h: h, type: type, url: url };
    },

    /* ---------- 同步：把后端数据灌进 window.DATA ---------- */
    /* 数据版本号：每成功应用一批服务端数据 +1。app.js 绘制时记下它，
       同步回调里比较 —— 已经画进去的版本就不必再整页重写（重写会把视频卡重建）。 */
    dataVersion: function () { return dataVersion; },
    sync: async function () {
      const out = { ok: false, users: 0, posts: 0, plugins: 0, threads: 0, error: null };
      let feed, forums, plugs;
      try {
        const r = await Promise.all([API.feed(null, 30), API.forums(), API.plugins()]);
        feed = r[0]; forums = r[1]; plugs = r[2];
      } catch (e) {
        out.error = e.message || String(e);
        return out;
      }

      /* 1) 用户表：后端是数组，前端要 { u1: {...}, u2: {...} }。
         先收集到 userMap，最后统一替换；中途别动 D.users，否则渲染到一半会读到空对象。 */
      const userMap = {};
      const remember = function (u) {
        if (!u || !u.id) return;
        const key = 's' + u.id;
        if (userMap[key]) return;
        userMap[key] = {
          id: u.id,
          name: u.name, emoji: u.emoji, level: u.level, badge: u.badge,
          grad: u.grad, sig: u.sig, city: u.city,
          /* 上传头像走服务端 users.avatar（COS URL）。avatarURL() 认的对象形状是 { img }，
             所以这里包一层；null = 没传过，落回默认鲸鱼图。 */
          ava: u.avatar ? { img: u.avatar } : null,
          fans: u.fans, follows: u.follows, visits: u.visits
        };
      };

      /* 2) 动态：后端 user 是对象，前端要 user 键 */
      const posts = (feed.items || []).map(function (p) {
        remember(p.user);
        const uid = 's' + (p.user ? p.user.id : 0);
        return {
          id: 's' + p.id,
          _id: p.id,
          user: uid,
          time: p.time,
          pinned: !!p.pinned,
          plugin: p.plugin || '',
          pluginVer: p.pluginVer || '',
          text: p.text || '',
          images: (p.images || []).map(function (im) {
            return { kind: 'shot', src: im.url, full: im.full, key: im.key, w: im.w, h: im.h };
          }),
          likes: p.likes || 0,
          shares: p.shares || 0,
          liked: !!p.liked,
          comments: []
        };
      });

      /* 3) 插件 */
      /* 服务端 plugins.id 是数据库自增主键，和演示数据里的 p1…p28 不是同一套编号：
         例如 dsh-cost-meter 在库里是 19，直接拼成 p19 会让 #/plugin/p10 找不到条目，
         pluginOf() 回落成 p1，页面就显示成第一个插件。这里按 name/pkg 对齐回静态 id，
         新插件（静态表里没有）才使用服务端 id。 */
      const basePlugins = D.plugins.slice();
      const usedIds = {};
      const plugins = (plugs.items || []).map(function (p) {
        if (p.author) remember(p.author);
        const base = basePlugins.filter(function (x) {
          return x.name === p.name || x.pkg === p.name;
        })[0];
        let pid = base ? base.id : 'p' + p.id;
        if (usedIds[pid]) pid = pid + '-srv' + p.id;
        usedIds[pid] = true;
        return {
          id: pid,
          _id: p.id,
          name: p.name,
          icon: p.icon || '🧩',
          grad: p.grad || 'linear-gradient(135deg,#7aa6ff,#a46bff)',
          author: p.author ? 's' + p.author.id : 'u1',
          ver: p.ver || '',
          cat: migrateCat(p.name, p.cat || '其他'),
          desc: p.desc || '',
          stars: p.stars || 0,
          installs: p.installs || 0,
          tags: p.tags || [],
          updated: p.file && p.file.at ? p.file.at : '—',
          hot: !!p.hot,
          pkg: p.pkg || p.name,
          /* npm 核对结果（后端 plugin_npm 表）：{ name, version } 或 null。
             这里必须显式透传 —— 这个 mapper 是白名单，漏一行字段就到不了页面，
             条目页的 npm 胶囊会因为「拿不到 p.npm」静默消失。 */
          npm: p.npm || null,
          /* 真实安装命令（awesome-dsh-plugin.com 目录）：{ cmd, pkg, dl, npm, slug, name } 或 null。
             同样必须显式透传 —— 这个 mapper 是白名单，漏一行，胶囊就退回「按仓库名猜」。 */
          install: p.install || null,
          license: p.license || '',
          repo: p.repo || '',
          homepage: p.homepage || '',
          tier: p.tier || 'entry',
          source: p.source || 'none',
          claimed: !!p.claimed,
          mirror: p.mirror || 'off',
          freshness: p.freshness || 'none',
          collected: p.file && p.file.at ? p.file.at : '',
          syncedAt: '',
          why: p.why || '',
          /* 审核态：条目被驳回 / 下架后，条目页要换成「已被下架」的说明而不是继续给下载入口。
             这个 mapper 是白名单，漏一行这里就等于页面上永远看到 published。 */
          status: p.status || 'published',
          file: p.file || null
        };
      });

      /* 4) 版块 → categories（保持原有的六项结构与图标） */
      const cats = (forums.items || []).map(function (f) {
        return { id: f.id, name: f.name, icon: f.icon, desc: f.desc };
      });

      /* 5) 版块帖子：按版块逐个拉，拉不到的版块留空而不是整页失败 */
      const threadList = [];
      if (cats.length) {
        const per = await Promise.all(cats.map(function (c) {
          return API.threads(c.id).catch(function () { return { items: [] }; });
        }));
        per.forEach(function (r) {
          (r.items || []).forEach(function (t) {
            remember(t.user);
            const uid = 's' + (t.user ? t.user.id : 0);
            threadList.push({
              id: 't' + t.id,
              _id: t.id,
              user: uid,
              cat: t.cat,
              title: t.title || '',
              tag: t.tag || '',
              tags: t.tags || [],
              excerpt: t.excerpt || '',
              sub: t.excerpt || '',
              /* 正文也带回来：详情页刷新后要能显示真实内容（服务端 GET 已返回 body） */
              body: t.body || '',
              replies: t.replies || 0,
              views: t.views || 0,
              last: t.last || '',
              hot: !!t.hot,
              top: !!t.top,
              solved: !!t.solved,
              closed: !!t.closed,
              unread: false,
              created: t.createdAt ? (stampFmt(t.createdAt) || '刚刚') : '',
              _at: stampOf(t.createdAt),
              lastUser: uid,
              posters: [uid],
              likes: t.likes || 0,
              reactions: t.reactions || {}
            });
          });
        });
        threadList.sort(function (a, b) {
          if (a.top !== b.top) return a.top ? -1 : 1;
          return (b._at || 0) - (a._at || 0);
        });
      }

      /* ---------- 原地写回（保持引用不变）---------- */
      /* 用户表：缺的键补空对象，避免 app.js 里 users[k].name 直接抛异常 */
      Object.keys(userMap).forEach(function (k) { D.users[k] = userMap[k]; });
      replaceArr(D.posts, posts);
      replaceArr(D.plugins, plugins);
      /* 无条件覆盖：后端返回空就是空。以前这里带 length 判断，演示版块与演示帖
         会一直赖着不走，而 /forums/:slug/threads 对演示 slug 一律 404。 */
      replaceArr(D.categories, cats);
      replaceArr(D.threads, threadList);
      dataVersion++; /* 数据已经进 DATA：之后的重绘才有意义 */

      out.ok = true;
      out.users = Object.keys(userMap).length;
      out.posts = posts.length;
      out.plugins = plugins.length;
      out.threads = threadList.length;
      return out;
    },

    /* ---------- 离线角标 ---------- */
    /* 只给「已经进站」的页面挂，而且只提示一次、6 秒后自己淡出。
       登录 / 注册 / 手机号认证 / 第三方授权这四页一律不挂：
       用户还没进站，顶栏那枚「离线 · 请登录」胶囊已经把「本机没连后端」讲清楚了，
       底部再浮一条就只是每次刷新都在页面最下方多出来一根横条（用户反馈的那条）。 */
    markOffline: function (msg) {
      if (document.getElementById('api-offline')) return;
      const route = (window.__dsh && window.__dsh.state && window.__dsh.state.route) ||
        (/^#\/(login|oauth|verify)\b/.test(location.hash) ? location.hash.slice(2).split('?')[0] : '');
      if (route === 'login' || route === 'oauth' || route === 'verify') return;
      /* 一次加载只出现一次：后面还有别的请求失败也不再反复挂 */
      if (API._offlineShown) return;
      API._offlineShown = true;
      const el = document.createElement('div');
      el.id = 'api-offline';
      el.setAttribute('role', 'status');
      el.textContent = '离线演示模式 · ' + (msg || '后端未连接');
      el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;' +
        'background:rgba(20,26,36,.92);color:#ffd48a;font-size:12px;padding:7px 14px;border-radius:999px;' +
        'border:1px solid rgba(255,212,138,.35);box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;' +
        'transition:opacity .36s ease';
      document.body.appendChild(el);
      /* 只说一次：告诉完就退场，不在页面底部常驻 */
      setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
      }, 6000);
    }
  };

  /* ---------- 工具 ---------- */
  /** 前端 uid → 服务端数字 id：'s12' → '12'，'u5' 原样（演示账号没有服务端行） */
  function srvId(uid) {
    const s = String(uid == null ? '' : uid);
    return /^s\d+$/.test(s) ? s.slice(1) : s;
  }
  /** 原地替换数组内容，保留引用（app.js 启动时抓死了数组引用，不能换新的） */
  function replaceArr(target, items) {
    target.length = 0;
    for (let i = 0; i < items.length; i++) target.push(items[i]);
  }

  /* ---------- 图片压缩：长边 1920 / 质量 0.85 ---------- */
  function compress(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(function (blob) {
          if (!blob) return reject(new Error('压缩失败'));
          resolve({ blob: blob, w: w, h: h });
        }, 'image/webp', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  window.API = API;

  /* ---------- 启动：同步不再等 window.load ----------
     首绘要等它（首页 / 鲸鲸空间的顶部卡片是 iframe 视频，数据晚到再重绘就得把它重建一次），
     所以同步越早开始越好：脚本一跑就发请求，app.js 的首绘直接读 window.__dshSync 这个 promise。
     以前挂在 load 上，等于把「数据到齐」的时间往后推了一整个 load 事件。 */
  /* 配置先于列表：闸门判断要在首绘之前拿到通道状态。失败了就当没接通（false），
     绝不让一次网络抖动把用户挡在认证页。 */
  const cfgPromise = API.phoneConfig().catch(function () { return phoneCfg; });
  window.__dshPhoneCfg = cfgPromise;
  const syncPromise = API.sync();
  window.__dshSync = syncPromise;
  syncPromise.then(function (r) {
    if (!r.ok) {
      API.markOffline(r.error);
      return;
    }
    /* 交给 app.js 决定要不要重绘（钩子在 window.__dsh 上）。
       renderDataSync 自己会判断：认证三页不重绘；首绘已经等过这批数据也不重绘 ——
       因为每次整页重写都会把 whale iframe 连文档一起销毁重建，
       鲸鱼娘视频于是重新加载、重新取首帧、重新淡入，视觉上就是「卡片闪一下才出现」。
       老版本没有这个钩子时回落到 render(false)。 */
    if (window.__dsh) {
      try {
        if (typeof window.__dsh.renderDataSync === 'function') window.__dsh.renderDataSync();
        else if (typeof window.__dsh.render === 'function') window.__dsh.render(false);
      } catch (e) { /* 重绘失败不影响已渲染内容 */ }
    }
    /* 顺手标记哪些帖子当前账号已赞 */
    if (window.__dsh && window.__dsh.state && Array.isArray(window.DATA.posts)) {
      window.DATA.posts.forEach(function (p) { if (p.liked) window.__dsh.state.liked.add(p.id); });
    }
  });
})();
