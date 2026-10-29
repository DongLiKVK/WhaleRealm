/** 公开资料：别的用户的「空间」页要能显示名字与头像。
 *  微博客式站点里这条是应该公开的，所以不加 requireAuth；
 *  但只吐 publicUser 那几个字段（无邮箱、无密码哈希、无会话信息）。
 */
'use strict';

const { db, publicUser } = require('../db');

module.exports = async function (fastify) {
  fastify.get('/users/:uid', async (req, reply) => {
    const raw = String(req.params.uid || '');
    const m = /^(?:s)?(\d{1,9})$/.exec(raw);
    if (!m) return reply.code(400).send({ ok: false, error: 'BAD_UID' });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(m[1]));
    if (!row) return reply.code(404).send({ ok: false, error: 'NOT_FOUND' });
    return { ok: true, data: { user: publicUser(row) } };
  });
};
