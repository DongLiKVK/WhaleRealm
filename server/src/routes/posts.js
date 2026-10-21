/** 动态路由：发布 / 列表（游标分页）/ 详情 / 删除 / 点赞 / 评论 */
'use strict';

const { db, now, parseJson, publicUser } = require('../db');
const { requireAuth, optionalAuth, isAdmin } = require('../auth');
const { imageUrl } = require('./upload');

/** 把 posts 行 + 图片 + 作者拼成前端要的形状 */
function shapePost(row, viewerId) {
  const author = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const imgs = db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort ASC, id ASC').all(row.id);

  let liked = false;
  if (viewerId) {
    liked = !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(viewerId, 'post', row.id);
  }

  return {
    id: row.id,
    user: publicUser(author),
    text: row.text,
    plugin: row.plugin_slug,
    pluginVer: row.plugin_ver,
    pinned: !!row.pinned,
    likes: row.likes,
    shares: row.shares,
    liked,
    created_at: row.created_at,
    time: relTime(row.created_at),
    images: imgs.map((im) => ({
      key: im.cos_key,
      url: imageUrl(im.cos_key, 'thumb'),
      full: imageUrl(im.cos_key, 'origin'),
      w: im.w,
      h: im.h,
      type: im.type
    }))
  };
}

/** 相对时间：前端显示「12 分钟前」 */
function relTime(sec) {
  const d = now() - sec;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  const dt = new Date(sec * 1000);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function routes(fastify) {
  // 动态流：游标分页。cursor 传上一页最后一条的 created_at
  fastify.get('/feed', { preHandler: optionalAuth }, async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const cursor = Number(req.query.cursor) || 0;
    const viewer = req.user ? req.user.id : null;

    const rows = cursor
      ? db.prepare('SELECT * FROM posts WHERE created_at < ? ORDER BY pinned DESC, created_at DESC LIMIT ?').all(cursor, limit)
      : db.prepare('SELECT * FROM posts ORDER BY pinned DESC, created_at DESC LIMIT ?').all(limit);

    const items = rows.map((r) => shapePost(r, viewer));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

    return { ok: true, data: { items, nextCursor } };
  });

  // 发动态
  fastify.post('/posts', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          plugin: { type: 'string' },
          pluginVer: { type: 'string' },
          images: {
            type: 'array',
            maxItems: 9,
            items: {
              type: 'object',
              required: ['key'],
              properties: {
                key: { type: 'string' },
                w: { type: 'integer' },
                h: { type: 'integer' },
                type: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (req, reply) => {
    const userId = req.user.id;
    const text = String(req.body.text || '').trim();
    const images = Array.isArray(req.body.images) ? req.body.images : [];

    if (!text && images.length === 0) {
      return reply.code(400).send({ ok: false, error: { code: 'EMPTY_POST', message: '动态不能是空的，写点什么或者配张图' } });
    }
    if (text.length > 5000) {
      return reply.code(400).send({ ok: false, error: { code: 'TEXT_TOO_LONG', message: '正文太长了，5000 字以内' } });
    }

    const ts = now();
    const create = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO posts (user_id, text, plugin_slug, plugin_ver, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, text, String(req.body.plugin || ''), String(req.body.pluginVer || ''), ts);

      const postId = info.lastInsertRowid;
      const insImg = db.prepare('INSERT INTO post_images (post_id, cos_key, w, h, type, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      images.forEach((im, i) => {
        insImg.run(postId, String(im.key), Number(im.w) || 0, Number(im.h) || 0, String(im.type || ''), i, ts);
      });
      return postId;
    });

    const postId = create();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    return { ok: true, data: { post: shapePost(row, userId) } };
  });

  // 单条动态
  fastify.get('/posts/:id', { preHandler: optionalAuth }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
    if (!row) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条动态不存在或已被删除' } });
    }
    return { ok: true, data: { post: shapePost(row, req.user ? req.user.id : null) } };
  });

  // 删除动态：仅作者本人或管理员
  fastify.delete('/posts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
    if (!row) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条动态不存在' } });
    }
    if (row.user_id !== req.user.id && !isAdmin(req.user)) {
      return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message: '只能删自己发的动态' } });
    }
    db.prepare('DELETE FROM posts WHERE id = ?').run(row.id);
    return { ok: true, data: { deleted: true } };
  });

  // 点赞 / 取消：返回最新计数与状态
  fastify.post('/posts/:id/like', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const postId = Number(req.params.id);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条动态不存在' } });
    }

    const liked = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(req.user.id, 'post', postId);

    const toggle = db.transaction(() => {
      if (liked) {
        db.prepare('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?')
          .run(req.user.id, 'post', postId);
        db.prepare('UPDATE posts SET likes = MAX(likes - 1, 0) WHERE id = ?').run(postId);
      } else {
        db.prepare('INSERT INTO likes (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'post', postId, now());
        db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
      }
      return db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId).likes;
    });

    const count = toggle();
    return { ok: true, data: { liked: !liked, likes: count } };
  });

  // 评论列表
  fastify.get('/posts/:id/comments', async (req, reply) => {
    const postId = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条动态不存在' } });
    }
    const rows = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(postId);
    const items = rows.map((c) => ({
      id: c.id,
      user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(c.user_id)),
      parentId: c.parent_id,
      text: c.text,
      likes: c.likes,
      time: relTime(c.created_at)
    }));
    return { ok: true, data: { items } };
  });

  // 发评论
  fastify.post('/posts/:id/comments', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          parentId: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const postId = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条动态不存在' } });
    }
    const text = String(req.body.text || '').trim();
    if (!text) {
      return reply.code(400).send({ ok: false, error: { code: 'EMPTY_COMMENT', message: '评论不能为空' } });
    }
    if (text.length > 1000) {
      return reply.code(400).send({ ok: false, error: { code: 'TEXT_TOO_LONG', message: '评论太长了，1000 字以内' } });
    }

    const ts = now();
    const info = db.prepare('INSERT INTO comments (post_id, user_id, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(postId, req.user.id, req.body.parentId || null, text, ts);
    db.prepare('UPDATE posts SET comments = comments + 1 WHERE id = ?').run(postId);

    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
    return { ok: true, data: { comment: { id: c.id, user: publicUser(req.user), parentId: c.parent_id, text: c.text, likes: 0, time: relTime(c.created_at) } } };
  });
}

module.exports = routes;
module.exports.shapePost = shapePost;
module.exports.relTime = relTime;
