/**
 * 后台管理 · 用户
 * 契约：docs/admin-api.md 第 4 节
 *
 * 为什么列表里的邮箱要打码、详情才给全：
 * 后台列表一屏 20 条，客服/运营日常只需要「认人」；完整邮箱和手机是能直接拿去
 * 撞库的敏感数据，只在该看的人点进详情时才给。这是最小暴露面，不是麻烦。
 *
 * 为什么禁用要「撤销全部站点会话 + 立即生效」：
 * 只改 users.status 是不够的——用户手里已经签发的 JWT 还能继续用 7 天。
 * 所以禁用同时删 sessions 行，并让 auth.currentUser() 读到 status 时直接当未登录
 * （双保险：漏删一次也进不来）。
 */
'use strict';

const { db, now } = require('../db');
const { fail, maskPhone } = require('../http');
const { revokeAllForUser } = require('../auth');
const {
  requirePermission,
  writeAdminLog,
  shapeRewardRows,
  paging,
  likeTerm,
  LIKE_ESC,
  orderBy,
  maskEmail,
  frameName
} = require('../admin-guard');

const STATUSES = ['active', 'disabled'];
const SORTS = {
  new: 'u.created_at DESC, u.id DESC',
  old: 'u.created_at ASC, u.id ASC',
  level: 'u.level DESC, u.id DESC',
  visits: 'u.visits DESC, u.id DESC'
};

const STMT = {
  byId: db.prepare(
    'SELECT u.*, (SELECT COUNT(*) FROM posts WHERE posts.user_id = u.id) AS post_count' +
    ' FROM users u WHERE u.id = ?'
  ),
  setProfile: db.prepare('UPDATE users SET level = ?, badge = ?, updated_at = ? WHERE id = ?'),
  setDisabled: db.prepare('UPDATE users SET status = ?, disabled_reason = ?, disabled_at = ?, updated_at = ? WHERE id = ?'),
  recentPosts: db.prepare(
    'SELECT id, text, status, likes, created_at FROM posts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 10'
  ),
  recentRewards: db.prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY granted_at DESC, id DESC LIMIT 10'),
  countPosts: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?'),
  countComments: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?'),
  countLikes: db.prepare('SELECT COUNT(*) AS n FROM likes WHERE user_id = ?'),
  countRewards: db.prepare('SELECT COUNT(*) AS n FROM rewards WHERE user_id = ?'),
  // 删用户前的清理：likes 是多态列没有外键，帖子/评论被级联删掉后这些行会留下来
  delLikesOfUser: db.prepare('DELETE FROM likes WHERE user_id = ?'),
  delLikesOnUserPosts: db.prepare(
    "DELETE FROM likes WHERE target_type = 'post' AND target_id IN (SELECT id FROM posts WHERE user_id = ?)"
  ),
  delLikesOnUserComments: db.prepare(
    "DELETE FROM likes WHERE target_type = 'comment' AND target_id IN (" +
    'SELECT id FROM comments WHERE user_id = ? OR post_id IN (SELECT id FROM posts WHERE user_id = ?))'
  ),
  delUser: db.prepare('DELETE FROM users WHERE id = ?')
};

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return n;
}

/** users 行 → 契约第 4 节 item。full=true 仅详情用（回显完整邮箱） */
function shapeUser(row, full) {
  return {
    id: row.id,
    name: row.name || '',
    email: full ? row.email || '' : maskEmail(row.email),
    phoneMasked: row.phone ? maskPhone(row.phone) : '',
    phoneVerified: !!row.phone_verified,
    avatar: row.avatar || '',
    emoji: row.emoji || '',
    grad: row.grad || '',
    level: row.level || 1,
    badge: row.badge || '',
    sig: row.sig || '',
    city: row.city || '',
    fans: row.fans || 0,
    follows: row.follows || 0,
    visits: row.visits || 0,
    status: row.status || 'active',
    disabledReason: row.disabled_reason || '',
    disabledAt: row.disabled_at || 0,
    points: row.points || 0,
    /* 头像框覆盖：auto=跟随会员档位，none=不戴，maw-1..4=指定。后台详情与奖励页都读它 */
    frame: row.frame || 'auto',
    frameLabel: frameName(row.frame || 'auto', false),
    /* post_count 只由列表/详情的相关子查询别名带出来；PATCH、禁用这类「写完回一行」
       的响应里没有这个别名，统一兜 0 而不是 undefined —— 前端表格排序拿到 undefined
       会显示成空白，看起来像数据丢了。 */
    postCount: Number(row.post_count || 0),
    createdAt: row.created_at
  };
}

module.exports = async function adminUserRoutes(fastify) {
  /** 列表。postCount 用相关子查询（idx_posts_user 命中），比 GROUP BY 更好读 */
  fastify.get('/users', { preHandler: requirePermission('user.view') }, async (req, reply) => {
    const q0 = req.query || {};

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && STATUSES.indexOf(status) < 0) return bad(reply, 'status 只能是 all、active、disabled');

    const sortKey = q0.sort == null || q0.sort === '' ? 'new' : String(q0.sort);
    if (!Object.prototype.hasOwnProperty.call(SORTS, sortKey)) return bad(reply, 'sort 只能是 new、old、level、visits');

    const { page, pageSize, offset } = paging(q0);

    const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
    if (kw.length > 80) return bad(reply, '搜索词最多 80 个字');

    const parts = [];
    const params = [];
    if (kw) {
      const like = likeTerm(kw);
      parts.push('(u.name LIKE ? ' + LIKE_ESC + ' OR u.email LIKE ? ' + LIKE_ESC + ' OR u.phone LIKE ? ' + LIKE_ESC + ')');
      params.push(like, like, like);
    }
    const baseWhere = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
    const baseParams = params.slice();

    let where = baseWhere;
    let whereParams = params;
    if (status !== 'all') {
      where = (baseWhere ? baseWhere + ' AND' : ' WHERE') + ' u.status = ?';
      whereParams = params.concat([status]);
    }

    const total = db.prepare('SELECT COUNT(*) AS n FROM users u' + where).get(...whereParams).n;

    const rows = db.prepare(
      'SELECT u.*, (SELECT COUNT(*) FROM posts WHERE posts.user_id = u.id) AS post_count' +
      ' FROM users u' + where + ' ORDER BY ' + orderBy(SORTS, sortKey, 'new') + ' LIMIT ? OFFSET ?'
    ).all(...whereParams, pageSize, offset);

    const c = db.prepare(
      'SELECT COUNT(*) AS all_n,' +
      " SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS act," +
      " SUM(CASE WHEN u.status = 'disabled' THEN 1 ELSE 0 END) AS dis" +
      ' FROM users u' + baseWhere
    ).get(...baseParams);

    return {
      ok: true,
      data: {
        items: rows.map((r) => shapeUser(r, false)),
        total,
        page,
        pageSize,
        counts: { all: c.all_n || 0, active: c.act || 0, disabled: c.dis || 0 }
      }
    };
  });

  /** 详情：资料 + 最近 10 条帖子 + 最近 10 条奖励 + 计数 */
  fastify.get('/users/:id', { preHandler: requirePermission('user.view') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');

    const posts = STMT.recentPosts.all(id).map((p) => ({
      id: p.id,
      text: p.text || '',
      status: p.status || 'published',
      likes: p.likes || 0,
      createdAt: p.created_at
    }));

    return {
      ok: true,
      data: {
        user: shapeUser(row, true),
        posts,
        rewards: shapeRewardRows(STMT.recentRewards.all(id)),
        stats: {
          posts: STMT.countPosts.get(id).n,
          comments: STMT.countComments.get(id).n,
          // 这里统计「该用户点过的赞」（likes.user_id）。收到的赞属于内容指标，已在帖子列表体现
          likes: STMT.countLikes.get(id).n,
          rewards: STMT.countRewards.get(id).n,
          points: row.points || 0
        }
      }
    };
  });

  /** 改等级 / 徽章。level 上限 99（库层守卫是 0~100，这里按契约收紧到 1~99） */
  fastify.patch('/users/:id', { preHandler: requirePermission('user.edit') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');

    const b = req.body || {};
    let level = row.level;
    if (b.level !== undefined) {
      const n = Number(b.level);
      if (!Number.isInteger(n) || n < 1 || n > 99) return bad(reply, '等级只能是 1~99 的整数');
      level = n;
    }
    let badge = row.badge || '';
    if (b.badge !== undefined) {
      if (typeof b.badge !== 'string') return bad(reply, '徽章必须是字符串');
      if (b.badge.length > 20) return bad(reply, '徽章最多 20 个字');
      badge = b.badge;
    }

    STMT.setProfile.run(level, badge, now(), id);

    writeAdminLog(req, {
      action: 'user.edit',
      targetType: 'user',
      targetId: id,
      summary: '编辑用户 #' + id + '（' + (row.name || '未命名') + '）：等级 ' + row.level + '→' + level + '，徽章「' + (row.badge || '无') + '」→「' + (badge || '无') + '」',
      detail: {
        before: { level: row.level, badge: row.badge || '' },
        after: { level, badge }
      }
    });

    return { ok: true, data: { user: shapeUser(STMT.byId.get(id), true) } };
  });

  /**
   * 禁用 / 启用。禁用时同步删 sessions：账号锁定必须「立即」生效，
   * 不能等用户手里的 token 自然过期。启用不恢复任何旧会话（用户重新登录）。
   */
  fastify.post('/users/:id/status', { preHandler: requirePermission('user.status') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');

    const b = req.body || {};
    const status = typeof b.status === 'string' ? b.status : '';
    if (STATUSES.indexOf(status) < 0) return bad(reply, 'status 只能是 active、disabled');

    let reason = '';
    if (b.reason !== undefined && b.reason !== null) {
      if (typeof b.reason !== 'string') return bad(reply, '原因必须是字符串');
      reason = b.reason.trim();
    }
    if (reason.length > 200) return bad(reply, '原因最多 200 个字');
    if (status === 'disabled' && reason.length < 4) return bad(reply, '禁用要写明原因，至少 4 个字');
    if (status === 'active' && !reason) reason = '恢复账号';

    const before = { status: row.status || 'active', disabledReason: row.disabled_reason || '' };

    if (status === 'disabled') {
      const at = now();
      db.transaction(() => {
        STMT.setDisabled.run('disabled', reason, at, at, id);
        revokeAllForUser(id);
      })();
    } else {
      STMT.setDisabled.run('active', '', 0, now(), id);
    }

    writeAdminLog(req, {
      action: status === 'disabled' ? 'user.disable' : 'user.enable',
      targetType: 'user',
      targetId: id,
      summary: (status === 'disabled' ? '禁用用户 #' : '恢复用户 #') + id + '（' + (row.name || '未命名') + '）' + (status === 'disabled' ? '：' + reason : '：' + reason),
      detail: { before, after: { status, disabledReason: reason }, note: reason }
    });

    return { ok: true, data: { user: shapeUser(STMT.byId.get(id), true) } };
  });

  /**
   * 删除用户。users 上的外键会把 posts / comments / sessions / rewards / oauth 等
   * 全部级联删掉；但 likes.target_id 没有外键，所以先把「他点过的赞」和
   * 「别人对他内容点的赞」一起清掉，否则会留下指向已删除 id 的幽灵行。
   */
  fastify.delete('/users/:id', { preHandler: requirePermission('user.delete') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');

    const posts = STMT.countPosts.get(id).n;
    const comments = STMT.countComments.get(id).n;

    db.transaction(() => {
      STMT.delLikesOfUser.run(id);
      STMT.delLikesOnUserPosts.run(id);
      STMT.delLikesOnUserComments.run(id, id);
      STMT.delUser.run(id);
    })();

    writeAdminLog(req, {
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      summary: '删除用户 #' + id + '（' + (row.name || '未命名') + '），连带 ' + posts + ' 条帖子、' + comments + ' 条评论',
      detail: {
        before: { name: row.name || '', email: row.email || '', level: row.level, posts, comments },
        after: null
      }
    });

    return { ok: true, data: { deleted: { userId: id, posts, comments } } };
  });
};

module.exports.shapeUser = shapeUser;
