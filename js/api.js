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
      throw err;
    }
    return json.data;
  }

  const API = {
    get: function (p) { return req(p); },
    post: function (p, b) { return req(p, { method: 'POST', body: b || {} }); },
    del: function (p) { return req(p, { method: 'DELETE' }); },

    /* ---------- 认证 ---------- */
    register: function (email, password, name) { return API.post('/auth/register', { email: email, password: password, name: name }); },
    login: function (email, password) { return API.post('/auth/login', { email: email, password: password }); },
    logout: function () { return API.post('/auth/logout'); },
    me: function () { return API.get('/auth/me'); },

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
    plugins: function (q, tag) {
      const qs = [];
      if (q) qs.push('q=' + encodeURIComponent(q));
      if (tag) qs.push('tag=' + encodeURIComponent(tag));
      return API.get('/plugins' + (qs.length ? '?' + qs.join('&') : ''));
    },

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

      return { key: sign.key, w: w, h: h, type: blob.type || file.type, url: sign.url };
    },

    /* ---------- 同步：把后端数据灌进 window.DATA ---------- */
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
        const key = 'u' + u.id;
        if (userMap[key]) return;
        userMap[key] = {
          id: u.id,
          name: u.name, emoji: u.emoji, level: u.level, badge: u.badge,
          grad: u.grad, sig: u.sig, city: u.city,
          fans: u.fans, follows: u.follows, visits: u.visits
        };
      };

      /* 2) 动态：后端 user 是对象，前端要 user 键 */
      const posts = (feed.items || []).map(function (p) {
        remember(p.user);
        const uid = 'u' + (p.user ? p.user.id : 1);
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
      const plugins = (plugs.items || []).map(function (p) {
        if (p.author) remember(p.author);
        return {
          id: 'p' + p.id,
          _id: p.id,
          name: p.name,
          icon: p.icon || '🧩',
          grad: p.grad || 'linear-gradient(135deg,#7aa6ff,#a46bff)',
          author: p.author ? 'u' + p.author.id : 'u1',
          ver: p.ver || '',
          cat: p.cat || '其他',
          desc: p.desc || '',
          stars: p.stars || 0,
          installs: p.installs || 0,
          tags: p.tags || [],
          updated: p.file && p.file.at ? p.file.at : '—',
          hot: !!p.hot,
          pkg: p.pkg || p.name,
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
          file: p.file || null
        };
      });

      /* 4) 版块 → categories（保持原有的六项结构与图标） */
      const cats = (forums.items || []).map(function (f) {
        return { id: f.id, name: f.name, icon: f.icon, desc: f.desc };
      });

      /* 5) 帖子的评论：前端在 feed 里只渲染 p.comments，按需再拉 */
      const threadList = [];

      /* ---------- 原地写回（保持引用不变）---------- */
      /* 用户表：缺的键补空对象，避免 app.js 里 users[k].name 直接抛异常 */
      Object.keys(userMap).forEach(function (k) { D.users[k] = userMap[k]; });
      replaceArr(D.posts, posts);
      replaceArr(D.plugins, plugins);
      if (cats.length) replaceArr(D.categories, cats);
      if (threadList.length) replaceArr(D.threads, threadList);

      out.ok = true;
      out.users = Object.keys(userMap).length;
      out.posts = posts.length;
      out.plugins = plugins.length;
      out.threads = threadList.length;
      return out;
    },

    /* ---------- 离线角标 ---------- */
    markOffline: function (msg) {
      if (document.getElementById('api-offline')) return;
      const el = document.createElement('div');
      el.id = 'api-offline';
      el.setAttribute('role', 'status');
      el.textContent = '离线演示模式 · ' + (msg || '后端未连接');
      el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;' +
        'background:rgba(20,26,36,.92);color:#ffd48a;font-size:12px;padding:7px 14px;border-radius:999px;' +
        'border:1px solid rgba(255,212,138,.35);box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none';
      document.body.appendChild(el);
    }
  };

  /* ---------- 工具 ---------- */
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

  /* ---------- 启动：先渲染演示数据，再异步拉真实数据 ---------- */
  window.addEventListener('load', function () {
    API.sync().then(function (r) {
      if (!r.ok) {
        API.markOffline(r.error);
        return;
      }
      /* 交给 app.js 重绘（它把 render 暴露在 window.__dsh 上） */
      if (window.__dsh && typeof window.__dsh.render === 'function') {
        try { window.__dsh.render(false); } catch (e) { /* 重绘失败不影响已渲染内容 */ }
      }
      /* 顺手标记哪些帖子当前账号已赞 */
      if (window.__dsh && window.__dsh.state && Array.isArray(window.DATA.posts)) {
        window.DATA.posts.forEach(function (p) { if (p.liked) window.__dsh.state.liked.add(p.id); });
      }
    });
  });
})();
