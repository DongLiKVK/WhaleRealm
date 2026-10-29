/** 版块与插件列表路由（只读） */
'use strict';

const { db, now, parseJson, publicUser } = require('../db');
const { relTime } = require('./posts');
const { requireAuth, optionalAuth } = require('../auth');
const { fail, rateLimitError } = require('../http');
const crypto = require('node:crypto');
const { parseRepo, verifyClaimToken } = require('../claim-verify');
const { fetchReadmes } = require('../readme-fetch');
const { installOf } = require('../awesome-catalog');

/* ---------- 行 → 前端契约 ----------
   主题与插件原来各在「列表 / 详情 / 创建」三处手抄同一份字段映射，加一个字段要改三遍，
   漏一处就出现「列表里有、详情里没有」的字段漂移。收敛成两个函数，只在这里定义一次。 */
function threadShape(t) {
  return {
    id: t.id,
    user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id)),
    cat: t.forum_slug,
    title: t.title,
    /* body 一起给：主题详情页在刷新后要能显示正文 */
    body: t.body || '',
    tag: t.tag,
    tags: parseJson(t.tags, []),
    excerpt: t.excerpt,
    replies: t.replies,
    views: t.views,
    likes: t.likes,
    hot: !!t.hot,
    top: !!t.top,
    solved: !!t.solved,
    closed: !!t.closed,
    reactions: parseJson(t.reactions, {}),
    last: relTime(t.last_at),
    createdAt: t.created_at
  };
}

/** thread_replies 行 → 楼层契约 */
function replyShape(r) {
  return {
    id: r.id,
    user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id)),
    parentId: r.parent_id,
    quote: r.quote,
    body: r.body,
    likes: r.likes,
    time: relTime(r.created_at),
    createdAt: r.created_at
  };
}

/** plugins 行 → 前端契约 */
function pluginShape(p) {
  return {
    id: p.id,
    name: p.slug,
    icon: p.icon,
    grad: p.grad,
    author: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(p.author_id)),
    ver: p.ver,
    cat: p.cat,
    desc: p.desc,
    stars: p.stars,
    installs: p.installs,
    tags: parseJson(p.tags, []),
    hot: !!p.hot,
    pkg: p.slug,
    /* npm 下载入口。slug 就是 npm 包名（DSH 生态约定：pnpm dsh add <slug>），
       但 6716 条索引里约四成包名在 registry 上查不到 —— 作者没发版、改了名，
       或者压根只挂在 GitHub 上。所以这里只回「真查过且存在」的那部分，
       前端据此决定要不要渲染 npm 胶囊：点开 404 的按钮比没有按钮更糟。
       数据由 scripts/check-npm.js 批量核对后写入 plugin_npm 表。 */
    npm: npmOf(p.slug),
    /* 真实安装命令，取自 awesome-dsh-plugin.com 的目录（见 src/awesome-catalog.js）。
       为什么不是「按 slug 拼 npm i <slug>」：包名和仓库名经常不是一回事
       （api-relay-audit 的包名是 dsh-api-relay-audit，dsh-market 的是 dshmarket），
       拼错的命令粘进终端就是 404。查不到就回 null，前端退回推断文案。 */
    install: installOf(p),
    license: p.license,
    repo: p.repo,
    homepage: p.homepage,
    tier: p.tier,
    source: p.source,
    claimed: !!p.claimed,
    mirror: p.mirror,
    freshness: p.freshness,
    why: p.why,
    /* 审核态一起吐给前端：条目页要在「已下架」时改成申请页而不是继续给下载入口，
       作者空间也要能看出自己哪条被打回。老库未迁移时该列不存在，回落到 published。 */
    status: p.status || 'published',
    file: p.file_name ? {
      name: p.file_name,
      size: p.file_size,
      sizeB: p.file_size_b,
      sha: p.file_sha,
      at: p.collected_at ? new Date(p.collected_at * 1000).toISOString().slice(0, 10) : ''
    } : null
  };
}

/* ---------- npm 包索引（plugin_npm → Map） ----------
   列表接口一次要吐 6716 条，不能每条去查一次表；而 npm 是否存在这件事变化极慢，
   所以整表读进内存缓存 5 分钟。表还没建（老库首次重启前）时降级为空索引：
   页面少一颗按钮，不抛 500 —— 首页不能因为一个「锦上添花」的字段挂掉。 */
let npmIndex = null;
let npmIndexAt = 0;
const NPM_INDEX_TTL = 5 * 60 * 1000;

function npmOf(slug) {
  const t = Date.now();
  if (!npmIndex || t - npmIndexAt > NPM_INDEX_TTL) {
    npmIndex = new Map();
    try {
      const rows = db.prepare('SELECT slug, name, version FROM plugin_npm WHERE found = 1').all();
      for (const r of rows) npmIndex.set(r.slug, { name: r.name || r.slug, version: r.version || '' });
    } catch (e) {
      npmIndex = new Map();
    }
    npmIndexAt = t;
  }
  return npmIndex.get(slug) || null;
}

async function routes(fastify) {
  // 版块列表：带帖子数
  fastify.get('/forums', async () => {
    const rows = db.prepare('SELECT * FROM forums ORDER BY sort ASC, id ASC').all();
    return {
      ok: true,
      data: {
        items: rows.map((f) => ({
          id: f.slug,
          name: f.name,
          icon: f.icon,
          desc: f.desc,
          threads: f.thread_count
        }))
      }
    };
  });

  // 某版块的帖子列表
  fastify.get('/forums/:slug/threads', async (req, reply) => {
    const slug = String(req.params.slug);
    if (!db.prepare('SELECT 1 FROM forums WHERE slug = ?').get(slug)) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这个版块不存在' } });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const rows = db.prepare('SELECT * FROM threads WHERE forum_slug = ? ORDER BY top DESC, last_at DESC LIMIT ?').all(slug, limit);

    return {
      ok: true,
      data: {
        items: rows.map(threadShape)
      }
    };
  });

  /* 发主题
     上线前放这一段的原因：前端 ntsubmit 一直只做 S.newThreads.unshift —— 刷新就没了，
     而 api.js 会拿服务端主题整份替换演示数据，于是「发了帖又消失」。
     这里给出真正的落库路径，返回形状与上面的 GET 列表项逐字段对齐，
     前端拿回来就能直接塞进列表，不必再拉一次。 */
  fastify.post('/forums/:slug/threads', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 8, timeWindow: '1 minute', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const slug = String(req.params.slug);
    if (!db.prepare('SELECT 1 FROM forums WHERE slug = ?').get(slug)) {
      return fail(reply, 404, 'FORUM_NOT_FOUND', null, '这个版块不存在');
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const title = String(body.title == null ? '' : body.title).trim();
    if (!title) return fail(reply, 400, 'TITLE_REQUIRED', null, '标题不能为空');
    if (title.length > 60) return fail(reply, 400, 'TITLE_TOO_LONG', null, '标题最多 60 个字');

    const text = String(body.body == null ? '' : body.body);
    if (text.length > 20000) return fail(reply, 400, 'BODY_TOO_LONG', null, '正文最多 2 万字');

    const tag = String(body.tag == null ? '' : body.tag).trim().slice(0, 20);
    const excerpt = String(
      body.excerpt == null ? text.replace(/\s+/g, ' ').slice(0, 120) : body.excerpt
    ).trim().slice(0, 200);
    let tags = Array.isArray(body.tags) ? body.tags : [];
    tags = tags.map((t) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 8);

    const ts = now();
    const info = db.prepare(
      'INSERT INTO threads (forum_slug, user_id, title, body, tag, tags, excerpt, replies, views, likes,' +
      ' hot, top, solved, closed, reactions, last_user, last_at, created_at)' +
      " VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, '{}', ?, ?, ?)"
    ).run(slug, req.user.id, title, text, tag, JSON.stringify(tags), excerpt, req.user.id, ts, ts);
    db.prepare('UPDATE forums SET thread_count = thread_count + 1 WHERE slug = ?').run(slug);

    const t = db.prepare('SELECT * FROM threads WHERE id = ?').get(info.lastInsertRowid);
    return {
      ok: true,
      data: {
        item: threadShape(t)
      }
    };
  });

  /* ---------- 主题详情 ----------
     列表接口只给摘要，正文与楼层必须单独取。之前前端详情页的楼层是写死的演示数据
     （app.js 的 threadFloors 里 4 条假楼层，作者 u3/u5/u7），刷新即失、谁回的帖也看不到。
     thread_replies 表补上「楼层」这个真源之后，详情页才显示得出来真实回帖。 */
  fastify.get('/forums/:slug/threads/:id', { preHandler: optionalAuth }, async (req, reply) => {
    const slug = String(req.params.slug);
    const id = Number(req.params.id);
    const t = Number.isInteger(id) && id > 0
      ? db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
      : null;
    if (!t || t.forum_slug !== slug) {
      return fail(reply, 404, 'THREAD_NOT_FOUND', null, '这个主题不存在或已被删除');
    }

    /* 浏览数自增：唯一的「读接口写库」，但它只改一个计数，失败也不该挡住内容 */
    try {
      db.prepare('UPDATE threads SET views = views + 1 WHERE id = ?').run(id);
      t.views += 1;
    } catch { /* 忽略 */ }

    const rows = db.prepare(
      'SELECT * FROM thread_replies WHERE thread_id = ? ORDER BY created_at ASC, id ASC'
    ).all(id);

    return {
      ok: true,
      data: {
        thread: threadShape(t),
        replies: rows.map(replyShape),
        me: req.user ? req.user.id : null
      }
    };
  });

  /* ---------- 回帖 ----------
     落 thread_replies + 同步 threads.replies/last_at/last_user，事务内一次做完。
     之前前端只 push 到内存里的 S.newFloors，刷新就没 —— 等于「回帖」这个功能不存在。 */
  fastify.post('/forums/:slug/threads/:id/replies', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 12, timeWindow: '1 minute', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const slug = String(req.params.slug);
    const id = Number(req.params.id);
    const t = Number.isInteger(id) && id > 0
      ? db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
      : null;
    if (!t || t.forum_slug !== slug) {
      return fail(reply, 404, 'THREAD_NOT_FOUND', null, '这个主题不存在或已被删除');
    }
    if (t.closed) return fail(reply, 409, 'THREAD_CLOSED', null, '这个主题已关闭，不能再回复');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = String(body.body == null ? '' : body.body).trim();
    if (!text) return fail(reply, 400, 'BODY_REQUIRED', null, '回复不能为空');
    if (text.length > 5000) return fail(reply, 400, 'BODY_TOO_LONG', null, '回复最多 5000 字');

    const parentId = Number(body.parentId) || null;
    if (parentId && !db.prepare('SELECT 1 FROM thread_replies WHERE id = ? AND thread_id = ?').get(parentId, id)) {
      return fail(reply, 400, 'BAD_PARENT', null, '被回复的楼层不存在');
    }
    const quote = String(body.quote == null ? '' : body.quote).trim().slice(0, 200);

    const ts = now();
    const rid = db.transaction(() => {
      const info = db.prepare(
        'INSERT INTO thread_replies (thread_id, user_id, parent_id, quote, body, likes, created_at)' +
        ' VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(id, req.user.id, parentId, quote, text, ts);
      db.prepare('UPDATE threads SET replies = replies + 1, last_user = ?, last_at = ? WHERE id = ?')
        .run(req.user.id, ts, id);
      return info.lastInsertRowid;
    })();

    const r = db.prepare('SELECT * FROM thread_replies WHERE id = ?').get(rid);
    const replies = db.prepare('SELECT replies FROM threads WHERE id = ?').get(id).replies;
    return { ok: true, data: { item: replyShape(r), replies: replies } };
  });

  /* ---------- 主题点赞 ----------
     likes 表 target_type='thread'，唯一约束保证一人一次。 */
  fastify.post('/forums/:slug/threads/:id/like', { preHandler: requireAuth }, async (req, reply) => {
    const slug = String(req.params.slug);
    const id = Number(req.params.id);
    const t = Number.isInteger(id) && id > 0
      ? db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
      : null;
    if (!t || t.forum_slug !== slug) {
      return fail(reply, 404, 'THREAD_NOT_FOUND', null, '这个主题不存在或已被删除');
    }
    const liked = !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(req.user.id, 'thread', id);
    const count = db.transaction(() => {
      if (liked) {
        db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?')
          .run(req.user.id, 'thread', id);
        db.prepare('UPDATE threads SET likes = MAX(likes - 1, 0) WHERE id = ?').run(id);
      } else {
        db.prepare('INSERT INTO likes (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'thread', id, now());
        db.prepare('UPDATE threads SET likes = likes + 1 WHERE id = ?').run(id);
      }
      return db.prepare('SELECT likes FROM threads WHERE id = ?').get(id).likes;
    })();
    return { ok: true, data: { liked: !liked, likes: count } };
  });

  // 插件列表：支持关键词与分类筛选
  fastify.get('/plugins', async (req, reply) => {
    const q = String(req.query.q || '').trim();
    const tag = String(req.query.tag || '').trim();

    /* 只吐已发布的条目：待审 / 驳回 / 下架的必须从公开列表里消失。
       为什么把条件写死在 WHERE 而不是留给前端过滤 —— 列表是全量 6716 条，
       前端过滤意味着被下架的条目仍然出现在 HTML/JSON 里，等于没下架。 */
    let sql = "SELECT * FROM plugins WHERE status = 'published'";
    const args = [];
    if (q) {
      sql += ' AND (slug LIKE ? OR desc LIKE ? OR tags LIKE ?)';
      const like = `%${q}%`;
      args.push(like, like, like);
    }
    if (tag) {
      sql += ' AND cat = ?';
      args.push(tag);
    }
    sql += ' ORDER BY hot DESC, stars DESC, updated_at DESC';

    const rows = db.prepare(sql).all(...args);

    /* 条目库现在是 6700+ 条、gzip 后仍有 1MB：这是首屏最贵的一次请求。
       内容本身是公开只读的目录数据，允许浏览器与 CDN 各缓存 60 秒——
       同一访客连点几个页面不必重复拉 1MB，Cloudflare 也能替源站扛住并发。
       Cloudflare-CDN-Cache-Control 是 CF 专用头：CF 默认不缓存 .json/API 响应，
       这个头让它把这份目录放进边缘缓存，而 Cache-Control 留给浏览器。 */
    reply.header('Cache-Control', 'public, max-age=60');
    reply.header('Cloudflare-CDN-Cache-Control', 'public, max-age=60');
    reply.header('Vary', 'Accept-Encoding');

    return {
      ok: true,
      data: {
        items: rows.map(pluginShape)
      }
    };
  });

  /* ---------- 条目页的 README ----------
     6716 条索引数据里每个插件只有一句 description，讲不清「装完怎么用」。真正的说明书在
     作者仓库的 README 里。这条路由按需去 GitHub 取一次正文，落库缓存：
       · 命中缓存且未过期（ok 7 天 / 没有 README 1 天）→ 直接读库，不打 GitHub；
       · 同一时刻多人打开同一个条目 → 共用一次网络请求（readmeInflight）；
       · 网络抖动 / 限流不写缓存，下次访问会重试；有旧正文就先把旧的给出去（stale）。
     返回的是 Markdown 原文：渲染与转义放在前端 js/md.js，服务端不生成 HTML，
     免得外部内容以「服务端渲染」的身份绕过前端的转义路径。 */
  const README_TTL = 7 * 86400;
  const README_TTL_MISS = 86400;
  const readmeInflight = new Map();

  /* 一个仓库可能有多份说明文档：多语言 README（README.zh-CN.md、docs/README_CN.md），
     以及 README 旁边的规范类文档（LICENSE / SECURITY.md / CONTRIBUTING.md / CHANGELOG.md /
     CODE_OF_CONDUCT.md），用 kind 区分。主表那一份是「默认 README」，
     其余按插入顺序取出来给前端做标签页 —— 顺序就是 readme-fetch 的排序结果
     （README：根目录默认 > 根目录中文 > 其它语言 > 子目录；规范文档：许可证 > 安全 >
     贡献指南 > 更新日志 > 行为准则），所以这里用 rowid 保持原样。 */
  function readmeDocs(id) {
    let rows = [];
    try {
      rows = db.prepare(
        'SELECT path, kind, label, lang, body, bytes, truncated FROM plugin_readme_docs' +
        ' WHERE plugin_id = ? ORDER BY rowid'
      ).all(id);
    } catch (err) {
      /* 老库还没建这张表 / 还没补 kind 列时不要让整条路由挂掉 */
      try {
        rows = db.prepare(
          'SELECT path, label, lang, body, bytes, truncated FROM plugin_readme_docs' +
          ' WHERE plugin_id = ? ORDER BY rowid'
        ).all(id);
      } catch (err2) {
        rows = [];
      }
    }
    return rows.map((r) => ({
      path: r.path || '',
      kind: r.kind || 'readme',
      label: r.label || '',
      lang: r.lang || '',
      markdown: r.body || '',
      bytes: r.bytes || 0,
      truncated: !!r.truncated
    }));
  }

  function readmeItem(row) {
    const ok = row.status === 'ok';
    const docs = ok ? readmeDocs(row.plugin_id) : [];
    const readmeDocsOnly = docs.filter((d) => d.kind === 'readme');
    const metaDocsOnly = docs.filter((d) => d.kind !== 'readme');
    /* kinds：这个条目现在有哪些标签页（readme 一定在，规范文档有多少算多少）。
       优先用主表记的清单（老缓存没有就按 docs 现算），前端据此决定显示哪几个标签。 */
    let kinds = String(row.kinds || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!kinds.length) {
      kinds = [];
      for (const d of docs) if (kinds.indexOf(d.kind) < 0) kinds.push(d.kind);
    }
    return {
      status: ok ? 'ok' : 'none',
      repo: row.repo || '',
      path: row.path || '',
      url: row.url || '',
      markdown: ok ? (row.body || '') : '',
      bytes: row.bytes || 0,
      truncated: !!row.truncated,
      /* docCount 沿用「几份 README」的老含义（前端语言标签数它），规范文档单独报 metaCount；
         docs 为空但主表有正文（老缓存）也要能渲染，前端会退化成「只有一份」的展示。 */
      docCount: readmeDocsOnly.length || (ok && row.body ? 1 : 0),
      metaCount: metaDocsOnly.length,
      kinds,
      docs,
      code: row.code || '',
      message: row.message || '',
      fetchedAt: row.fetched_at || 0
    };
  }

  const readmeDelDocs = db.prepare('DELETE FROM plugin_readme_docs WHERE plugin_id = ?');
  const readmeInsDoc = db.prepare(
    'INSERT INTO plugin_readme_docs (plugin_id, path, kind, label, lang, body, bytes, truncated, fetched_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const readmeUpsert = db.prepare(
    'INSERT INTO plugin_readmes (plugin_id, repo, path, url, status, code, message, body, bytes, truncated, doc_count, kinds, fetched_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' +
    ' ON CONFLICT(plugin_id) DO UPDATE SET repo = excluded.repo, path = excluded.path, url = excluded.url,' +
    ' status = excluded.status, code = excluded.code, message = excluded.message, body = excluded.body,' +
    ' bytes = excluded.bytes, truncated = excluded.truncated, doc_count = excluded.doc_count,' +
    ' kinds = excluded.kinds, fetched_at = excluded.fetched_at'
  );

  function saveReadme(id, repo, res, ts, status) {
    const docs = status === 'ok' ? (Array.isArray(res.docs) ? res.docs.filter((d) => d && d.markdown) : []) : [];
    const primary = docs[0] || null;
    const body = status === 'ok' ? String((primary && primary.markdown) || res.markdown || '') : '';
    /* kinds 存成逗号串：既当「这个条目有哪些标签页」的来源，也当「老缓存该不该重抓」的判据 */
    const kinds = [];
    for (const d of docs) {
      const k = String(d.kind || 'readme');
      if (kinds.indexOf(k) < 0) kinds.push(k);
    }
    const run = db.transaction(() => {
      readmeUpsert.run(
        id, String(repo || ''), (primary && primary.path) || res.path || '', (primary && primary.url) || res.url || '',
        status,
        status === 'ok' ? '' : (res.code || ''), status === 'ok' ? '' : (res.message || ''),
        body,
        status === 'ok' ? Number((primary && primary.bytes) || res.bytes || 0) : 0,
        status === 'ok' && ((primary && primary.truncated) || res.truncated) ? 1 : 0,
        /* doc_count 只数 README（前端语言标签数它），规范文档不占这个数 */
        status === 'ok' ? (docs.filter((d) => (d.kind || 'readme') === 'readme').length || (body ? 1 : 0)) : 0,
        kinds.join(','),
        ts
      );
      /* 每次重抓都整组替换：作者删掉某个语言版本 / 某个规范文档时，旧正文不能继续留在页面上 */
      readmeDelDocs.run(id);
      for (const d of docs) {
        readmeInsDoc.run(id, String(d.path || ''), String(d.kind || 'readme'), String(d.label || ''), String(d.lang || ''),
          String(d.markdown || ''), Number(d.bytes || 0), d.truncated ? 1 : 0, ts);
      }
    });
    run();
  }

  fastify.get('/plugins/:id/readme', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const raw = String(req.params.id || '').replace(/^p/i, '');
    const id = Number(raw);
    const p = Number.isInteger(id) && id > 0
      ? db.prepare('SELECT id, slug, repo FROM plugins WHERE id = ?').get(id)
      : null;
    if (!p) return fail(reply, 404, 'PLUGIN_NOT_FOUND', null, '这个插件条目不存在');

    const ts = now();
    const cached = db.prepare('SELECT * FROM plugin_readmes WHERE plugin_id = ?').get(p.id);
    /* 老缓存要重抓的两种情况（当过期处理，重抓一次就自愈，不会反复失效）：
         · doc_count=0 但正文有内容 —— 「只存一份正文」时代的行，补上多语言正文；
         · kinds 为空 —— 「只有 README」时代的行，补上许可证 / 安全 / 贡献指南等规范文档。
       注意 doc_count 只数 README：仓库里只有 LICENSE/SECURITY 而没有 README 时它也是 0，
       这时正文是空的、kinds 有值 —— 那是新行，不能当老缓存反复重抓（会白白耗掉 GitHub 限额）。 */
    const hasBody = String((cached && cached.body) || '').length > 0;
    const legacyRow = cached && cached.status === 'ok'
      && (Number(cached.doc_count || 0) === 0 ? hasBody : !String(cached.kinds || ''));
    const ttl = legacyRow ? 0 : (cached && cached.status === 'ok' ? README_TTL : README_TTL_MISS);
    /* 仓库地址变了（作者认领后改成自己的仓库）要重抓，不能拿旧仓库的 README 冒充 */
    const sameRepo = cached && String(cached.repo || '') === String(p.repo || '');
    if (cached && sameRepo && ts - cached.fetched_at < ttl) {
      reply.header('Cache-Control', 'public, max-age=1800');
      return { ok: true, data: { item: readmeItem(cached), cached: true } };
    }

    let job = readmeInflight.get(p.id);
    if (!job) {
      job = fetchReadmes({ repo: p.repo }).catch(() => ({ ok: false, code: 'NETWORK', message: '读不到仓库 README' }));
      job = job.finally(() => readmeInflight.delete(p.id));
      readmeInflight.set(p.id, job);
    }
    const res = await job;

    if (res.ok) {
      saveReadme(p.id, p.repo, res, ts, 'ok');
      reply.header('Cache-Control', 'public, max-age=1800');
      return { ok: true, data: { item: readmeItem(db.prepare('SELECT * FROM plugin_readmes WHERE plugin_id = ?').get(p.id)) } };
    }

    /* 限额耗尽不能伪装成「作者仓库里没有 README」—— 那是误导：
       访客会以为这个插件真的没有说明，而实际是我们自己的配额用完了。
       所以单独回一个可读原因，且**不写负缓存**（写进去会让这一条在 1 天内都不再重试）。 */
    if (res.code === 'RATE_LIMITED') {
      reply.header('Cache-Control', 'no-store');
      return {
        ok: true,
        data: {
          item: {
            status: 'none', repo: String(p.repo || ''), path: '', url: '', markdown: '',
            bytes: 0, truncated: false, docCount: 0, docs: [], fetchedAt: 0,
            code: 'RATE_LIMITED',
            message: '服务端读取 GitHub 的配额暂时用完了，过一会儿再刷新（不写缓存，恢复后会自动重抓）'
          }
        }
      };
    }

    /* 负缓存只存「确定没有」的两种情况；限流 / 网络失败不写库，下次访问重试 */
    if (res.code === 'README_NOT_FOUND' || res.code === 'REPO_NOT_GITHUB' || res.code === 'REPO_NOT_FOUND') {
      saveReadme(p.id, p.repo, res, ts, 'none');
      reply.header('Cache-Control', 'public, max-age=600');
      return { ok: true, data: { item: readmeItem(db.prepare('SELECT * FROM plugin_readmes WHERE plugin_id = ?').get(p.id)) } };
    }

    if (cached && cached.status === 'ok' && sameRepo && cached.body) {
      const item = readmeItem(cached);
      item.stale = true;
      item.code = res.code || 'NETWORK';
      item.message = res.message || '';
      reply.header('Cache-Control', 'no-store');
      return { ok: true, data: { item } };
    }

    reply.header('Cache-Control', 'no-store');
    return {
      ok: true,
      data: {
        item: {
          status: 'none', repo: String(p.repo || ''), path: '', url: '', markdown: '',
          bytes: 0, truncated: false, docCount: 0, docs: [], fetchedAt: 0,
          code: res.code || 'NETWORK', message: res.message || '读不到仓库 README'
        }
      }
    };
  });

  /* ---------- 发布插件（P0）----------
     以前前端「提交」只把 pb.stage 改成 review，库里一个字段都没写：
     用户填完 12 项，刷新就全没了，插件库永远只有种子数据。这里给出真正落库的路径。
     不做人工预审队列（站点还没有这份运营人力）：入库即 published，作者只能是当前登录用户。
     返回形状与 GET /plugins 的列表项逐字段对齐，前端拿回来可直接塞进列表。 */
  fastify.post('/plugins', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 6, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const slug = String(body.pkg || body.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(slug)) {
      return fail(reply, 400, 'BAD_PKG', null, '包名只能用字母、数字、点、下划线、连字符，2-64 位');
    }
    if (db.prepare('SELECT 1 FROM plugins WHERE slug = ?').get(slug)) {
      return fail(reply, 409, 'PKG_TAKEN', null, '这个包名已经有人登记了');
    }

    const desc = String(body.desc == null ? '' : body.desc).trim();
    if (!desc) return fail(reply, 400, 'DESC_REQUIRED', null, '简介不能为空');
    if (desc.length > 500) return fail(reply, 400, 'DESC_TOO_LONG', null, '简介最多 500 字');

    const ver = String(body.ver == null ? '' : body.ver).trim().slice(0, 24) || '0.0.1';
    const cat = String(body.cat == null ? '' : body.cat).trim().slice(0, 20);
    const license = String(body.license == null ? '' : body.license).trim().slice(0, 40);
    const repo = String(body.repo == null ? '' : body.repo).trim().slice(0, 200);
    const homepage = String(body.homepage == null ? '' : body.homepage).trim().slice(0, 200);
    const icon = String(body.icon == null ? '' : body.icon).trim().slice(0, 8) || '🧩';
    let tags = Array.isArray(body.tags) ? body.tags : [];
    tags = tags.map((x) => String(x).trim().slice(0, 20)).filter(Boolean).slice(0, 8);

    const ts = now();
    const info = db.prepare(
      'INSERT INTO plugins (slug, icon, grad, author_id, ver, cat, desc, stars, installs, tags, hot,' +
      ' license, repo, homepage, tier, source, claimed, mirror, freshness, why, file_name, file_size,' +
      ' file_size_b, file_sha, collected_at, synced_at, created_at, updated_at)' +
      " VALUES (?, ?, '', ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, 'entry', 'author', 1, 'off', 'none', '', '', '', 0, '', 0, 0, ?, ?)"
    ).run(slug, icon, req.user.id, ver, cat, desc, JSON.stringify(tags), license, repo, homepage, ts, ts);

    const p = db.prepare('SELECT * FROM plugins WHERE id = ?').get(info.lastInsertRowid);
    return { ok: true, data: { item: pluginShape(p) } };
  });

  /* ---------- 认领：先发挑战串，再回读仓库校验 ----------
     老实现只会回 501「这条链路还没开放」，等于把「等作者来认领」写成了空头承诺。
     现在的链路（不要求用户交任何 token、不写别人的仓库）：
       ① POST /plugins/:id/claim        → 平台发一个 32 位十六进制串（24 小时有效，绑 plugin+user）
       ② 作者把串写进自己仓库的 README 或一个 issue
       ③ POST /plugins/:id/claim/verify → 平台回读 raw.githubusercontent.com / api.github.com，命中即认领
     判定只在服务端做：串不在仓库里就绝不写 claimed=1。 */

  const CLAIM_TTL = 24 * 3600;
  const CLAIM_TTL_LABEL = '24 小时';

  function claimChallenge(pluginId, userId) {
    const live = db.prepare(
      'SELECT * FROM plugin_claims WHERE plugin_id = ? AND user_id = ? AND verified_at = 0' +
      ' ORDER BY id DESC LIMIT 1'
    ).get(pluginId, userId);
    if (live && now() - live.created_at < CLAIM_TTL) return live;
    const token = crypto.randomBytes(16).toString('hex');
    const info = db.prepare(
      'INSERT INTO plugin_claims (plugin_id, user_id, token, method, created_at, verified_at)' +
      " VALUES (?, ?, ?, 'readme', ?, 0)"
    ).run(pluginId, userId, token, now());
    return db.prepare('SELECT * FROM plugin_claims WHERE id = ?').get(info.lastInsertRowid);
  }

  function claimPayload(row, plugin, challenge) {
    return {
      id: plugin.id,
      name: plugin.slug,
      repo: plugin.repo || '',
      token: challenge.token,
      method: challenge.method || 'readme',
      expiresAt: challenge.created_at + CLAIM_TTL,
      ttl: CLAIM_TTL_LABEL,
      claimed: false
    };
  }

  fastify.post('/plugins/:id/claim', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(reply, 400, 'BAD_ID', null, '条目编号不合法');
    const row = db.prepare('SELECT id, slug, author_id, claimed, repo, tier, source FROM plugins WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '这个条目不存在');

    if (row.claimed && row.author_id === req.user.id) {
      return { ok: true, data: { id: row.id, name: row.slug, claimed: true, already: true,
        note: '你已经是这个条目的作者，不用再认领一次' } };
    }
    if (row.claimed && row.author_id && row.author_id !== req.user.id) {
      return fail(reply, 409, 'CLAIMED_BY_OTHER', null, '这个条目已经被作者认领了，不能重复认领');
    }
    if (!parseRepo(row.repo)) {
      return fail(reply, 400, 'REPO_NOT_GITHUB', null,
        '这个条目没有可校验的 GitHub 仓库地址，没法在线校验；请带仓库地址联系运营人工核验');
    }

    const ch = claimChallenge(row.id, req.user.id);
    return { ok: true, data: claimPayload(row, row, ch) };
  });

  fastify.post('/plugins/:id/claim/verify', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 6, timeWindow: '10 minutes' } }
  }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(reply, 400, 'BAD_ID', null, '条目编号不合法');
    const row = db.prepare('SELECT id, slug, author_id, claimed, repo, tier, source FROM plugins WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '这个条目不存在');
    if (row.claimed && row.author_id === req.user.id) {
      return { ok: true, data: { id: row.id, name: row.slug, claimed: true, already: true,
        note: '你已经是这个条目的作者' } };
    }
    if (row.claimed && row.author_id && row.author_id !== req.user.id) {
      return fail(reply, 409, 'CLAIMED_BY_OTHER', null, '这个条目已经被作者认领了');
    }

    const body = req.body || {};
    const method = body.method === 'issue' ? 'issue' : 'readme';
    let token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
    if (!token) {
      const live = db.prepare(
        'SELECT * FROM plugin_claims WHERE plugin_id = ? AND user_id = ? AND verified_at = 0' +
        ' ORDER BY id DESC LIMIT 1'
      ).get(id, req.user.id);
      token = live ? live.token : '';
    }
    if (!token) {
      return fail(reply, 400, 'NO_CHALLENGE', null, '还没拿到验证串：先点「获取验证串」');
    }

    const res = await verifyClaimToken({ repo: row.repo, token, method });
    if (!res.ok) {
      const status = res.code === 'RATE_LIMITED' ? 429 : (res.code === 'NETWORK' ? 502 : 400);
      return fail(reply, status, res.code, null, res.message);
    }

    const ts = now();
    const commit = db.transaction(() => {
      db.prepare(
        "UPDATE plugins SET author_id = ?, claimed = 1, source = 'author', why = '', updated_at = ?" +
        " WHERE id = ? AND (claimed = 0 OR author_id IS NULL OR author_id = ?)"
      ).run(req.user.id, ts, id, req.user.id);
      db.prepare('UPDATE plugin_claims SET verified_at = ? WHERE plugin_id = ? AND user_id = ? AND verified_at = 0')
        .run(ts, id, req.user.id);
    });
    commit();

    const after = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
    return { ok: true, data: { item: pluginShape(after), claimed: true, where: res.where,
      note: '仓库校验通过（' + res.where + '），你现在是这个条目的作者' } };
  });
}

module.exports = routes;