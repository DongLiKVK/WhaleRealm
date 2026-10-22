/** 版块与插件列表路由（只读） */
'use strict';

const { db, now, parseJson, publicUser } = require('../db');
const { relTime } = require('./posts');
const { requireAuth } = require('../auth');
const { fail, rateLimitError } = require('../http');

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
        items: rows.map((t) => ({
          id: t.id,
          user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id)),
          cat: t.forum_slug,
          title: t.title,
          /* body 一起给：主题详情页在刷新后要能显示正文。
             演示数据里正文本来就在 data.js，落库的主题只有这里能给。 */
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
        }))
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
        item: {
          id: t.id,
          user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(t.user_id)),
          cat: t.forum_slug,
          title: t.title,
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
        }
      }
    };
  });

  // 插件列表：支持关键词与分类筛选
  fastify.get('/plugins', async (req) => {
    const q = String(req.query.q || '').trim();
    const tag = String(req.query.tag || '').trim();

    let sql = 'SELECT * FROM plugins WHERE 1=1';
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

    return {
      ok: true,
      data: {
        items: rows.map((p) => ({
          id: p.id,
          name: p.slug,
          /* 下行注释不用改：条目里的 file 只在 file_name 非空时才有值，
             前端据此区分「有包信息」和「什么都没有」，不做假下载。 */
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
          license: p.license,
          repo: p.repo,
          homepage: p.homepage,
          tier: p.tier,
          source: p.source,
          claimed: !!p.claimed,
          mirror: p.mirror,
          freshness: p.freshness,
          why: p.why,
          file: p.file_name ? {
            name: p.file_name,
            size: p.file_size,
            sizeB: p.file_size_b,
            sha: p.file_sha,
            at: p.collected_at ? new Date(p.collected_at * 1000).toISOString().slice(0, 10) : ''
          } : null
        }))
      }
    };
  });

  /* 认领条目：这是唯一一个会把「你是作者」写进库的动作，所以判定只在服务端做。
     现状：库里没有仓库验证串的存储与校验链路（plugins 表只有 claimed 一个布尔），
     所以这里能给出的诚实结论只有两种 ——
       · 你本来就是登记的作者：认领已是既成事实，返回真实状态，不假装刚验证通过；
       · 你不是作者：501 CLAIM_UNAVAILABLE，明确告诉前端「这条链路还没开放」。
     —— 不做「谁都返回成功」，也不做「拿 claimed 当验证结果」（前端以前就是这么干的）。 */
  fastify.post('/plugins/:id/claim', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(reply, 400, 'BAD_ID', null, '条目编号不合法');
    const row = db.prepare('SELECT id, author_id, claimed FROM plugins WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '这个条目不存在');
    if (row.author_id !== req.user.id) {
      return fail(reply, 501, 'CLAIM_UNAVAILABLE', null,
        '认领需要校验仓库里的验证串，这条链路还没开放');
    }
    if (!row.claimed) db.prepare('UPDATE plugins SET claimed = 1 WHERE id = ?').run(id);
    return {
      ok: true,
      data: {
        id: row.id,
        claimed: true,
        note: '你已经是这个条目的登记作者，这里显示的就是库里的真实状态（本次没有做额外的仓库校验）'
      }
    };
  });
}

module.exports = routes;
