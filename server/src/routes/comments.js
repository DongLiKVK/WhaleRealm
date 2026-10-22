/**
 * 评论聚合路由
 * 单条评论的增删改已在 posts.js 里；这里提供按用户查评论历史，
 * 以及楼中楼（parentId）的展开查询。
 */
'use strict';

const { db, publicUser, now } = require('../db');
const { requireAuth } = require('../auth');
const { relTime } = require('./posts');

async function routes(fastify) {
  // 某条评论的楼中楼
  fastify.get('/comments/:id/replies', async (req, reply) => {
    const id = Number(req.params.id);
    const parent = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!parent) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条评论不存在' } });
    }
    const rows = db.prepare('SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC').all(id);
    return {
      ok: true,
      data: {
        items: rows.map((c) => ({
          id: c.id,
          user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(c.user_id)),
          text: c.text,
          likes: c.likes,
          time: relTime(c.created_at)
        }))
      }
    };
  });

  // 我的评论历史
  fastify.get('/comments/mine', { preHandler: requireAuth }, async (req) => {
    const rows = db.prepare('SELECT * FROM comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
    return {
      ok: true,
      data: {
        items: rows.map((c) => ({
          id: c.id,
          postId: c.post_id,
          text: c.text,
          likes: c.likes,
          time: relTime(c.created_at)
        }))
      }
    };
  });

  // 删评论：本人或管理
  fastify.delete('/comments/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!c) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '这条评论不存在' } });
    }
    const admin = req.user.level >= 15 || req.user.badge === '版主';
    if (c.user_id !== req.user.id && !admin) {
      return reply.code(403).send({ ok: false, error: { code: 'FORBIDDEN', message: '只能删自己的评论' } });
    }
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    db.prepare('UPDATE posts SET comments = MAX(comments - 1, 0) WHERE id = ?').run(c.post_id);
    return { ok: true, data: { deleted: true } };
  });
}

module.exports = routes;
