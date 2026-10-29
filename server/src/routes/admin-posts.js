/**
 * 后台管理 · 内容（帖子）
 * 契约：docs/admin-api.md 第 3 节
 *
 * 为什么这里的列表要手写 JOIN + 批量取图：
 * 前台 /feed 是游标分页、一页 20 条，可以每条单独查作者和图片；后台列表要显示
 * 「待审数量」「作者状态」「审核人」，一次 20 行 × 2 次子查询就是 40 次往返，
 * 加上 better-sqlite3 是同步的，会把整个事件循环按住。所以统一 JOIN + IN 批量。
 *
 * 为什么删除要手动清 likes：
 * likes.target_id 是多态列（post / comment / thread），没有外键，SQLite 的级联
 * 管不到它。posts 删掉后这些行不会自己消失，久了变成「幽灵点赞」，前台再算
 * 点赞数就会错。所以删帖必须显式清 post 与 comment 两类 target。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const { imageUrl } = require('./upload');
const {
  requireAdmin,
  requirePermission,
  adminCan,
  writeAdminLog,
  paging,
  likeTerm,
  LIKE_ESC,
  parseTime,
  orderBy
} = require('../admin-guard');

const POST_STATUS = ['published', 'pending', 'rejected', 'hidden'];
const SORTS = {
  new: 'p.created_at DESC, p.id DESC',
  old: 'p.created_at ASC, p.id ASC',
  hot: '(p.likes + p.comments * 2) DESC, p.id DESC'
};

const POST_SELECT =
  'SELECT p.*, u.name AS author_name, u.avatar AS author_avatar, u.emoji AS author_emoji,' +
  ' u.grad AS author_grad, u.level AS author_level, u.badge AS author_badge, u.status AS author_status' +
  ' FROM posts p LEFT JOIN users u ON u.id = p.user_id';

const STMT = {
  byId: db.prepare(POST_SELECT + ' WHERE p.id = ?'),
  comments: db.prepare(
    'SELECT c.*, u.name AS user_name FROM comments c LEFT JOIN users u ON u.id = c.user_id' +
    ' WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 50'
  ),
  setText: db.prepare('UPDATE posts SET text = ?, pinned = ? WHERE id = ?'),
  setReview: db.prepare(
    'UPDATE posts SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
  ),
  setStatus: db.prepare('UPDATE posts SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'),
  // 级联清理：likes 没有外键，必须手删
  delPostLikes: db.prepare("DELETE FROM likes WHERE target_type = 'post' AND target_id = ?"),
  delCommentLikes: db.prepare(
    "DELETE FROM likes WHERE target_type = 'comment' AND target_id IN (SELECT id FROM comments WHERE post_id = ?)"
  ),
  delComments: db.prepare('DELETE FROM comments WHERE post_id = ?'),
  delImages: db.prepare('DELETE FROM post_images WHERE post_id = ?'),
  delPost: db.prepare('DELETE FROM posts WHERE id = ?')
};

function marks(n) {
  return new Array(n).fill('?').join(',');
}

/** 批量取图片：一页帖子一条 SQL，避免逐条查询 */
function imagesByPostIds(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = db.prepare(
    'SELECT * FROM post_images WHERE post_id IN (' + marks(ids.length) + ') ORDER BY post_id, sort ASC, id ASC'
  ).all(...ids);
  for (const im of rows) {
    if (!map.has(im.post_id)) map.set(im.post_id, []);
    map.get(im.post_id).push({
      key: im.cos_key,
      url: imageUrl(im.cos_key, 'thumb'),
      full: imageUrl(im.cos_key, 'origin'),
      w: im.w,
      h: im.h,
      type: im.type
    });
  }
  return map;
}

/** posts 行（带 author_* 别名）→ 契约第 3 节的 item */
function shapePost(row, images) {
  const imgs = images || imagesByPostIds([row.id]).get(row.id) || [];
  return {
    id: row.id,
    userId: row.user_id,
    author: {
      id: row.user_id,
      name: row.author_name || '已注销用户',
      avatar: row.author_avatar || '',
      emoji: row.author_emoji || '',
      grad: row.author_grad || '',
      level: row.author_level || 1,
      badge: row.author_badge || '',
      status: row.author_status || 'active'
    },
    text: row.text || '',
    images: imgs,
    pluginSlug: row.plugin_slug || '',
    pluginVer: row.plugin_ver || '',
    pinned: !!row.pinned,
    likes: row.likes || 0,
    shares: row.shares || 0,
    comments: row.comments || 0,
    status: row.status || 'published',
    reviewNote: row.review_note || '',
    reviewedAt: row.reviewed_at || 0,
    reviewedBy: row.reviewed_by || 0,
    createdAt: row.created_at
  };
}

/** 列表多行整形：先批量取图再逐行拼，sql 次数固定为 2 */
function shapePosts(rows) {
  const imgs = imagesByPostIds(rows.map((r) => r.id));
  return rows.map((r) => shapePost(r, imgs.get(r.id) || []));
}

/** 详情里的评论（最多 50）：后台只看不改，字段按契约裁到最小 */
function shapeComments(rows) {
  return rows.map((c) => ({
    id: c.id,
    userId: c.user_id,
    name: c.user_name || '已注销用户',
    text: c.text || '',
    likes: c.likes || 0,
    createdAt: c.created_at
  }));
}

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > (max || 2147483647)) return 0;
  return n;
}

/** 审核动作 → 目标状态（approve/reject/pending 三态，契约写死） */
const DECISION_STATUS = { approve: 'published', reject: 'rejected', pending: 'pending' };

/** 审核中文动词，用于 summary 这种人话 */
const DECISION_VERB = { approve: '通过', reject: '驳回', pending: '打回待审' };

/** 单帖硬删除（含 likes 清理）。调用方负责事务与日志。 */
function deletePostHard(postId) {
  STMT.delPostLikes.run(postId);
  STMT.delCommentLikes.run(postId);
  STMT.delComments.run(postId);
  STMT.delImages.run(postId);
  STMT.delPost.run(postId);
}

module.exports = async function adminPostRoutes(fastify) {
  /**
   * 列表。counts 是「除了 status 之外的所有筛选条件」下的五态计数：
   * 前端要显示「全部 128 / 待审 7」，这个 7 必须是同一批筛选条件下的待审数，
   * 不能是全库待审数（否则点进去数字对不上）。
   */
  fastify.get('/posts', { preHandler: requirePermission('post.view') }, async (req, reply) => {
    const q0 = req.query || {};

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && POST_STATUS.indexOf(status) < 0) return bad(reply, 'status 只能是 all、published、pending、rejected、hidden');

    const sortKey = q0.sort == null || q0.sort === '' ? 'new' : String(q0.sort);
    if (!Object.prototype.hasOwnProperty.call(SORTS, sortKey)) return bad(reply, 'sort 只能是 new、old、hot');

    const { page, pageSize, offset } = paging(q0);

    const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
    if (kw.length > 80) return bad(reply, '搜索词最多 80 个字');

    let authorId = 0;
    if (q0.authorId != null && q0.authorId !== '') {
      authorId = readId(q0.authorId);
      if (!authorId) return bad(reply, 'authorId 不对');
    }

    const from = parseTime(q0.from, false);
    const to = parseTime(q0.to, true);
    if (from.state === 'bad') return bad(reply, 'from 需要是 Unix 秒或 YYYY-MM-DD');
    if (to.state === 'bad') return bad(reply, 'to 需要是 Unix 秒或 YYYY-MM-DD');

    // 两个 where：baseWhere 用于 counts（不含 status），where 用于列表与 total
    const parts = [];
    const params = [];
    if (kw) {
      const like = likeTerm(kw);
      parts.push("(p.text LIKE ? " + LIKE_ESC + " OR u.name LIKE ? " + LIKE_ESC + " OR u.email LIKE ? " + LIKE_ESC + ')');
      params.push(like, like, like);
    }
    if (authorId) {
      parts.push('p.user_id = ?');
      params.push(authorId);
    }
    if (from.state === 'ok') {
      parts.push('p.created_at >= ?');
      params.push(from.value);
    }
    if (to.state === 'ok') {
      parts.push('p.created_at <= ?');
      params.push(to.value);
    }

    const baseWhere = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
    const baseParams = params.slice();

    let where = baseWhere;
    let whereParams = params;
    if (status !== 'all') {
      where = (baseWhere ? baseWhere + ' AND' : ' WHERE') + ' p.status = ?';
      whereParams = params.concat([status]);
    }

    const total = db.prepare('SELECT COUNT(*) AS n FROM posts p LEFT JOIN users u ON u.id = p.user_id' + where)
      .get(...whereParams).n;

    const rows = db.prepare(
      POST_SELECT + where + ' ORDER BY ' + orderBy(SORTS, sortKey, 'new') + ' LIMIT ? OFFSET ?'
    ).all(...whereParams, pageSize, offset);

    const c = db.prepare(
      'SELECT COUNT(*) AS all_n,' +
      " SUM(CASE WHEN p.status = 'published' THEN 1 ELSE 0 END) AS pub," +
      " SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) AS pend," +
      " SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) AS rej," +
      " SUM(CASE WHEN p.status = 'hidden' THEN 1 ELSE 0 END) AS hid" +
      ' FROM posts p LEFT JOIN users u ON u.id = p.user_id' + baseWhere
    ).get(...baseParams);

    return {
      ok: true,
      data: {
        items: shapePosts(rows),
        total,
        page,
        pageSize,
        counts: {
          all: c.all_n || 0,
          published: c.pub || 0,
          pending: c.pend || 0,
          rejected: c.rej || 0,
          hidden: c.hid || 0
        }
      }
    };
  });

  /**
   * 详情：正文 + 最多 50 条评论，够审核判断「是不是广告/引战」。
   * 回 {post, comments} 而不是把 comments 摊平到 item 上 —— item 里本来就有一个数字型的
   * comments（评论数），摊平会把计数覆盖成数组，前端表格/列表同一个 shapePost 就会崩。
   */
  fastify.get('/posts/:id', { preHandler: requirePermission('post.view') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');
    return {
      ok: true,
      data: {
        post: shapePost(row, imagesByPostIds([id]).get(id) || []),
        comments: shapeComments(STMT.comments.all(id))
      }
    };
  });

  /** 编辑正文 / 置顶。body 里没出现的字段保持原值（PATCH 语义） */
  fastify.patch('/posts/:id', { preHandler: requirePermission('post.edit') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');

    const b = req.body || {};
    let text = row.text || '';
    if (b.text !== undefined) {
      if (typeof b.text !== 'string') return bad(reply, '正文必须是字符串');
      if (b.text.length > 5000) return bad(reply, '正文最多 5000 个字');
      text = b.text;
    }
    let pinned = row.pinned ? 1 : 0;
    if (b.pinned !== undefined) {
      if (typeof b.pinned !== 'boolean' && b.pinned !== 0 && b.pinned !== 1) return bad(reply, 'pinned 只能是 true / false');
      pinned = b.pinned === true || b.pinned === 1 ? 1 : 0;
    }

    STMT.setText.run(text, pinned, id);

    // 审计只记「变没变 + 长度 + 置顶」，不存正文：日志表会被导出给运营看，正文可能含用户隐私
    writeAdminLog(req, {
      action: 'post.edit',
      targetType: 'post',
      targetId: id,
      summary: '编辑帖子 #' + id + (b.text !== undefined ? '：正文改为 ' + text.length + ' 字' : '') + (pinned !== (row.pinned ? 1 : 0) ? '，并' + (pinned ? '置顶' : '取消置顶') : ''),
      detail: {
        before: { textLength: (row.text || '').length, pinned: !!row.pinned },
        after: { textLength: text.length, pinned: !!pinned },
        note: b.text !== undefined ? '正文已修改，未记录全文' : ''
      }
    });

    return { ok: true, data: { post: shapePost(STMT.byId.get(id)) } };
  });

  /** 审核：approve / reject / pending，三态都能互相转（打回待审是「误操作回滚」的入口） */
  fastify.post('/posts/:id/review', { preHandler: requirePermission('post.review') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');

    const b = req.body || {};
    const decision = typeof b.decision === 'string' ? b.decision : '';
    if (!DECISION_STATUS[decision]) return bad(reply, 'decision 只能是 approve、reject、pending');

    let note = '';
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') return bad(reply, '备注必须是字符串');
      note = b.note.trim();
      if (note.length > 200) return bad(reply, '备注最多 200 个字');
    }

    const status = DECISION_STATUS[decision];
    const at = now();
    STMT.setReview.run(status, note, req.admin.id, at, id);

    writeAdminLog(req, {
      action: 'post.review',
      targetType: 'post',
      targetId: id,
      summary: DECISION_VERB[decision] + '帖子 #' + id + (note ? '：' + note : ''),
      detail: { before: { status: row.status || 'published' }, after: { status }, note }
    });

    return { ok: true, data: { post: shapePost(STMT.byId.get(id)) } };
  });

  /** 删除单条：一个事务里清 likes → comments → images → post，任何一步失败整体回滚 */
  fastify.delete('/posts/:id', { preHandler: requirePermission('post.delete') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条帖子');

    db.transaction(() => deletePostHard(id))();

    writeAdminLog(req, {
      action: 'post.delete',
      targetType: 'post',
      targetId: id,
      summary: '删除帖子 #' + id + '（作者：' + (row.author_name || '未知') + '）',
      detail: {
        before: { status: row.status || 'published', likes: row.likes || 0, comments: row.comments || 0, textLength: (row.text || '').length },
        after: null
      }
    });

    return { ok: true, data: {} };
  });

  /**
   * 批量。按 action 分别判权限（approve/reject 要 post.review，delete 要 post.delete）——
   * 不能只在路由上挂一个权限，否则只有审核权的人能一条接口删光内容。
   */
  fastify.post('/posts/batch', { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body || {};
    const action = typeof b.action === 'string' ? b.action : '';
    if (['approve', 'reject', 'delete'].indexOf(action) < 0) return bad(reply, 'action 只能是 approve、reject、delete');

    const need = action === 'delete' ? 'post.delete' : 'post.review';
    if (!adminCan(req.admin, need)) {
      return fail(reply, 403, 'FORBIDDEN', { need }, '当前角色没有这个操作的权限');
    }

    const idsRaw = Array.isArray(b.ids) ? b.ids : [];
    const ids = [];
    for (const v of idsRaw) {
      const n = readId(v);
      if (n && ids.indexOf(n) < 0) ids.push(n);
    }
    if (!ids.length) return bad(reply, '请至少选一条帖子');
    if (ids.length > 100) return bad(reply, '一次最多处理 100 条');

    let note = '';
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') return bad(reply, '备注必须是字符串');
      note = b.note.trim();
      if (note.length > 200) return bad(reply, '备注最多 200 个字');
    }

    const placeholders = marks(ids.length);
    const rows = db.prepare('SELECT id, status FROM posts WHERE id IN (' + placeholders + ')').all(...ids);
    const hit = rows.map((r) => r.id);
    let affected = 0;

    if (action === 'delete') {
      db.transaction(() => {
        for (const pid of hit) {
          deletePostHard(pid);
          affected += 1;
        }
      })();
    } else {
      const status = DECISION_STATUS[action];
      const at = now();
      db.transaction(() => {
        for (const pid of hit) {
          STMT.setStatus.run(status, note, req.admin.id, at, pid);
          affected += 1;
        }
      })();
    }

    writeAdminLog(req, {
      action: action === 'delete' ? 'post.batch_delete' : 'post.batch_review',
      targetType: 'post',
      targetId: 0,
      summary: '批量' + (action === 'delete' ? '删除' : DECISION_VERB[action]) + ' ' + affected + ' 条帖子（#' + hit.slice(0, 10).join('、#') + (hit.length > 10 ? ' 等' : '') + '）',
      detail: {
        before: { statuses: rows.slice(0, 100).map((r) => ({ id: r.id, status: r.status })) },
        after: action === 'delete' ? null : { status: DECISION_STATUS[action] },
        note
      }
    });

    return { ok: true, data: { affected } };
  });
};

// stats 的 pendingPreview 直接复用同一个整形函数，保证「同 /posts 裁剪版」不会两处漂移
module.exports.shapePost = shapePost;
module.exports.shapePosts = shapePosts;
module.exports.POST_SELECT = POST_SELECT;
module.exports.SORTS = SORTS;
