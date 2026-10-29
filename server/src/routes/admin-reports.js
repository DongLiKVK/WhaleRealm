/**
 * 后台管理 · 举报处理
 *
 * 这条路由是「通知通道」的后半段：routes/reports.js 收下举报，这里负责把人能看到的那一步做完。
 * 之所以把 hide-target 单独做成一个动作而不是让管理员自己去插件页下架，是因为处理举报的人需要
 * 「我在处理这条举报」这个上下文 —— 下架动作要能反写回举报记录（status + 处理说明），
 * 否则下次再看这条举报，谁也说不清当时到底动没动过被举报的东西。
 *
 * targetName / targetLink 在服务端算，不交给前端拼：target_type 是五态多态列，
 * 前端要为五种实体各写一遍取标题的逻辑，加一种类型就要改两处；而这里改一次就生效。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const {
  requirePermission,
  adminCan,
  writeAdminLog,
  paging,
  likeTerm,
  LIKE_ESC,
  clientIp
} = require('../admin-guard');

const REPORT_STATUS = ['open', 'handling', 'resolved', 'rejected'];
const TARGET_TYPES = ['plugin', 'post', 'thread', 'comment', 'user'];

/** 理由 → 中文。后台表格与日志都用这一份，前端不再自带一份副本。 */
const REASON_TEXT = {
  copyright: '侵犯版权',
  malware: '含恶意代码',
  wrong: '信息严重失实',
  other: '其他'
};

const STATUS_TEXT = {
  open: '待处理',
  handling: '处理中',
  resolved: '已处理',
  rejected: '不予处理'
};

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > (max || 2147483647)) return 0;
  return n;
}

/* ---------- 目标取名字与链接 ----------
   每种实体一句 SQL，查不到就回空串（目标可能已经被删了，举报记录还在 —— 这正是要留档的原因）。
   链接用的是站点前端的 hash 路由：插件 #/plugin/<id>、帖子 #/thread/<id>、
   动态与评论没有独立详情页（前端没有对应路由），统一落到信息流 #/feed；用户落到 #/space/<id>。 */
const TARGET_SQL = {
  plugin: 'SELECT slug AS name FROM plugins WHERE id = ?',
  post: "SELECT substr(replace(text, char(10), ' '), 1, 40) AS name FROM posts WHERE id = ?",
  thread: 'SELECT title AS name FROM threads WHERE id = ?',
  comment: "SELECT substr(replace(text, char(10), ' '), 1, 40) AS name FROM comments WHERE id = ?",
  user: 'SELECT name FROM users WHERE id = ?'
};

function targetName(type, id) {
  const sql = TARGET_SQL[type];
  if (!sql) return '';
  try {
    const row = db.prepare(sql).get(id);
    return row && row.name ? String(row.name) : '';
  } catch {
    return '';
  }
}

function targetLink(type, id) {
  if (type === 'plugin') return '#/plugin/' + id;
  if (type === 'thread') return '#/thread/' + id;
  if (type === 'user') return '#/space/' + id;
  if (type === 'post' || type === 'comment') return '#/feed';
  return '';
}

function shapeReport(r, names) {
  const loginName = names && names.get(r.user_id) ? names.get(r.user_id) : '';
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    targetName: targetName(r.target_type, r.target_id),
    targetLink: targetLink(r.target_type, r.target_id),
    reason: r.reason,
    reasonText: REASON_TEXT[r.reason] || r.reason,
    detail: r.detail || '',
    contact: r.contact || '',
    status: r.status || 'open',
    statusText: STATUS_TEXT[r.status] || r.status,
    handleNote: r.handle_note || '',
    handledBy: r.handled_by || 0,
    handledAt: r.handled_at || 0,
    createdAt: r.created_at || 0,
    userId: r.user_id || 0,
    userName: loginName
  };
}

const REPORT_SELECT = 'SELECT * FROM reports';

module.exports = async function adminReportRoutes(fastify) {
  /* 列表。status=all 是默认值；target=all 表示不按对象类型筛。
     q 搜 detail / contact / 目标名字：处理举报时最常见的是「有人给我发邮件说某条侵权」，
     运营会拿关键词回来找那条记录。 */
  fastify.get('/reports', { preHandler: requirePermission('report.view') }, async (req, reply) => {
    const q0 = req.query || {};

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && REPORT_STATUS.indexOf(status) < 0) {
      return bad(reply, 'status 只能是 all、open、handling、resolved、rejected');
    }

    const target = q0.target == null || q0.target === '' ? 'all' : String(q0.target);
    if (target !== 'all' && TARGET_TYPES.indexOf(target) < 0) {
      return bad(reply, 'target 只能是 all、plugin、post、thread、comment、user');
    }

    const { page, pageSize, offset } = paging(q0);

    const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
    if (kw.length > 80) return bad(reply, '搜索词最多 80 个字');

    const parts = [];
    const params = [];
    if (kw) {
      const like = likeTerm(kw);
      parts.push('(detail LIKE ? ' + LIKE_ESC + ' OR contact LIKE ? ' + LIKE_ESC + ' OR handle_note LIKE ? ' + LIKE_ESC + ')');
      params.push(like, like, like);
    }

    const baseWhere = parts.length ? ' WHERE ' + parts.join(' AND ') : '';

    let where = baseWhere;
    let whereParams = params;
    if (status !== 'all') {
      where = (baseWhere ? baseWhere + ' AND' : ' WHERE') + ' status = ?';
      whereParams = params.concat([status]);
    }
    if (target !== 'all') {
      where = (where ? where + ' AND' : ' WHERE') + ' target_type = ?';
      whereParams = whereParams.concat([target]);
    }

    const total = db.prepare('SELECT COUNT(*) AS n FROM reports' + where).get(...whereParams).n;

    const rows = db.prepare(
      REPORT_SELECT + where + ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
    ).all(...whereParams, pageSize, offset);

    /* 举报人账号名：一次批量取，避免每行一次查询。匿名举报 user_id=0，不参与。 */
    const uids = Array.from(new Set(rows.map((r) => r.user_id).filter((v) => v > 0)));
    const names = new Map();
    if (uids.length) {
      const marks = uids.map(() => '?').join(',');
      const us = db.prepare('SELECT id, name FROM users WHERE id IN (' + marks + ')').all(...uids);
      for (const u of us) names.set(u.id, u.name);
    }

    const c = db.prepare(
      'SELECT COUNT(*) AS all_n,' +
      " SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS op," +
      " SUM(CASE WHEN status = 'handling' THEN 1 ELSE 0 END) AS hd," +
      " SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS rs," +
      " SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rj" +
      ' FROM reports' + baseWhere
    ).get(...params);

    return {
      ok: true,
      data: {
        items: rows.map((r) => shapeReport(r, names)),
        total,
        page,
        pageSize,
        counts: {
          all: c.all_n || 0,
          open: c.op || 0,
          handling: c.hd || 0,
          resolved: c.rs || 0,
          rejected: c.rj || 0
        }
      }
    };
  });

  /* 改状态。note 上限 500：处理说明比审核理由更需要篇幅（要写清「已联系作者删除 / 已下架」）。 */
  fastify.patch('/reports/:id', { preHandler: requirePermission('report.edit') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条举报');

    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条举报');

    const body = req.body || {};
    const status = String(body.status || '').trim();
    if (REPORT_STATUS.indexOf(status) < 0) return bad(reply, 'status 只能是 open、handling、resolved、rejected');

    const note = String(body.note == null ? '' : body.note).trim().slice(0, 500);
    const at = now();
    const who = req.admin ? req.admin.id : 0;

    db.prepare('UPDATE reports SET status = ?, handle_note = ?, handled_by = ?, handled_at = ? WHERE id = ?')
      .run(status, note, who, at, id);

    writeAdminLog(req, {
      action: 'report.handle',
      targetType: 'report',
      targetId: id,
      summary: '举报 #' + id + '（' + row.target_type + ' ' + row.target_id + '）' + (row.status || 'open') + ' → ' + status,
      detail: { before: { status: row.status || 'open' }, after: { status: status, note: note } }
    });

    const fresh = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    return { ok: true, data: { report: shapeReport(fresh, new Map()) } };
  });

  /* 下架被举报对象：把举报的「处理」和最要紧的那个动作合成一步。
     只有 plugin 有可下架的状态位（post 的审核状态是另一个语义：pending 表示待审而不是下架），
     所以目标类型为 plugin 时改 plugins.status='hidden'，其它类型只把举报标记为 resolved，
     由管理员去对应页面处理 —— 这里不假装删掉了东西。 */
  fastify.post('/reports/:id/hide-target', { preHandler: requirePermission('report.edit') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条举报');

    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条举报');

    const body = req.body || {};
    const note = String(body.note == null ? '' : body.note).trim().slice(0, 500);
    const at = now();
    const who = req.admin ? req.admin.id : 0;

    let hid = false;
    if (row.target_type === 'plugin') {
      const p = db.prepare('SELECT id, slug, status FROM plugins WHERE id = ?').get(row.target_id);
      if (!p) return fail(reply, 404, 'NOT_FOUND', null, '被举报的条目已经不在了');
      if (!adminCan(req.admin, 'plugin.edit')) {
        return fail(reply, 403, 'FORBIDDEN', { need: 'plugin.edit' }, '当前角色没有下架条目的权限');
      }
      /* 下架原因写进插件的 review_note，与插件审核页看到的是同一份说明 ——
         这样作者在申诉时，运营不用在两张表之间对时间线。 */
      const pnote = ('举报 #' + id + ' 成立：' + (note || REASON_TEXT[row.reason] || '')).slice(0, 200);
      db.prepare("UPDATE plugins SET status = 'hidden', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
        .run(pnote, who, at, p.id);
      hid = true;
      writeAdminLog(req, {
        action: 'plugin.review',
        targetType: 'plugin',
        targetId: p.id,
        summary: '举报定案，插件「' + p.slug + '」' + (p.status || 'published') + ' → hidden',
        detail: { before: { status: p.status || 'published' }, after: { status: 'hidden', note: pnote }, reportId: id }
      });
    }

    db.prepare('UPDATE reports SET status = ?, handle_note = ?, handled_by = ?, handled_at = ? WHERE id = ?')
      .run('resolved', note, who, at, id);

    writeAdminLog(req, {
      action: 'report.hide_target',
      targetType: 'report',
      targetId: id,
      summary: '举报 #' + id + ' 定案，' + (hid ? '已下架 ' + row.target_type + ' ' + row.target_id : '标记已处理（目标类型无可下架状态）'),
      detail: { after: { hid: hid, note: note, type: row.target_type, targetId: row.target_id }, ip: clientIp(req) }
    });

    const fresh = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    return { ok: true, data: { report: shapeReport(fresh, new Map()), hid: hid } };
  });
}

module.exports.shapeReport = shapeReport;
module.exports.REASON_TEXT = REASON_TEXT;
module.exports.STATUS_TEXT = STATUS_TEXT;
module.exports.REPORT_STATUS = REPORT_STATUS;
