/** 版块与插件列表路由（只读） */
'use strict';

const { db, parseJson, publicUser } = require('../db');
const { relTime } = require('./posts');

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
}

module.exports = routes;
