/**
 * 后台管理 · 操作日志
 * 契约：docs/admin-api.md 第 6 节
 *
 * 为什么「没权限看全部」时要在服务端强制 scope=self，而不是前端藏起来：
 * 日志里有 IP、账号、操作摘要，属于最直接的排查材料。前端隐藏只是看不见，
 * 接口能查就等于能拖库。所以这里在 SQL 层就加上 admin_id = 自己。
 *
 * 为什么日志详情只给「对象」不给原文：
 * detail 里存的是变更前后关键字段，正文全文/密码这类东西永远不该进日志表——
 * 日志会被导出成 CSV 交给运营，等于二次泄漏。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const {
  requireAdmin,
  requirePermission,
  adminCan,
  writeAdminLog,
  shapeLog,
  ACTION_LABELS,
  ACTION_KEYS,
  paging,
  likeTerm,
  LIKE_ESC,
  parseTime,
  sendCsv,
  ymd,
  formatDateTime
} = require('../admin-guard');

const RESULTS = ['ok', 'fail'];

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 列表与导出共用：返回 {where, params, error}，权限范围由调用方决定 */
function buildFilter(q0, me, canAll) {
  const out = { error: '', where: '', params: [] };

  const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
  if (kw.length > 80) { out.error = '搜索词最多 80 个字'; return out; }

  const action = q0.action == null || q0.action === '' ? '' : String(q0.action);
  if (action && ACTION_KEYS.indexOf(action) < 0) { out.error = 'action 不在允许的动作列表里'; return out; }

  const targetType = q0.targetType == null || q0.targetType === '' ? '' : String(q0.targetType);
  if (targetType && targetType.length > 20) { out.error = 'targetType 太长'; return out; }

  const result = q0.result == null || q0.result === '' ? 'all' : String(q0.result);
  if (result !== 'all' && RESULTS.indexOf(result) < 0) { out.error = 'result 只能是 all、ok、fail'; return out; }

  let adminId = 0;
  if (canAll && q0.adminId != null && q0.adminId !== '') {
    adminId = readId(q0.adminId);
    if (!adminId) { out.error = 'adminId 不对'; return out; }
  }

  const from = parseTime(q0.from, false);
  const to = parseTime(q0.to, true);
  if (from.state === 'bad') { out.error = 'from 需要是 Unix 秒或 YYYY-MM-DD'; return out; }
  if (to.state === 'bad') { out.error = 'to 需要是 Unix 秒或 YYYY-MM-DD'; return out; }

  const parts = [];
  const params = [];
  // 没有 log.viewAll：强制只看自己，传进来的 adminId 直接忽略（不是报错，避免前端旧链接失效）
  if (!canAll) {
    parts.push('l.admin_id = ?');
    params.push(me);
  } else if (adminId) {
    parts.push('l.admin_id = ?');
    params.push(adminId);
  }
  if (kw) {
    const like = likeTerm(kw);
    parts.push('(l.summary LIKE ? ' + LIKE_ESC + ' OR l.admin_name LIKE ? ' + LIKE_ESC + ')');
    params.push(like, like);
  }
  if (action) { parts.push('l.action = ?'); params.push(action); }
  if (targetType) { parts.push('l.target_type = ?'); params.push(targetType); }
  if (result !== 'all') { parts.push('l.result = ?'); params.push(result); }
  if (from.state === 'ok') { parts.push('l.created_at >= ?'); params.push(from.value); }
  if (to.state === 'ok') { parts.push('l.created_at <= ?'); params.push(to.value); }

  out.where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
  out.params = params;
  return out;
}

module.exports = async function adminLogRoutes(fastify) {
  /** 列表。scope 会明确回给前端，用来显示「你只能看到自己的日志」 */
  fastify.get('/logs', { preHandler: requireAdmin }, async (req, reply) => {
    const q0 = req.query || {};
    const canAll = adminCan(req.admin, 'log.viewAll');
    const f = buildFilter(q0, req.admin.id, canAll);
    if (f.error) return bad(reply, f.error);

    const { page, pageSize, offset } = paging(q0);

    const total = db.prepare('SELECT COUNT(*) AS n FROM admin_logs l' + f.where).get(...f.params).n;
    const rows = db.prepare(
      'SELECT l.* FROM admin_logs l' + f.where + ' ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?'
    ).all(...f.params, pageSize, offset);

    // 动作筛选下拉的计数：故意不带 action 条件，否则选了「登录」之后别的动作都变 0，
    // 用户就没法在动作之间来回切了
    const countQ = buildFilter(Object.assign({}, q0, { action: '' }), req.admin.id, canAll);
    const bars = db.prepare(
      'SELECT l.action AS action, COUNT(*) AS n FROM admin_logs l' + countQ.where + ' GROUP BY l.action'
    ).all(...countQ.params);
    const barMap = new Map(bars.map((b) => [b.action, b.n]));
    const actions = ACTION_KEYS
      .filter((k) => barMap.has(k))
      .map((k) => ({ action: k, label: ACTION_LABELS[k] || k, count: barMap.get(k) }));
    // 理论上不会出现未知 action（写入端有白名单），出现也照样展示，方便发现脏数据
    for (const b of bars) {
      if (ACTION_KEYS.indexOf(b.action) < 0) actions.push({ action: b.action, label: b.action, count: b.n });
    }

    return {
      ok: true,
      data: {
        items: rows.map(shapeLog),
        total,
        page,
        pageSize,
        scope: canAll ? 'all' : 'self',
        actions
      }
    };
  });

  /** 详情：附带 detail 对象。看不到别人日志的人也不能靠 id 直连绕过 */
  fastify.get('/logs/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条日志');
    const row = db.prepare('SELECT * FROM admin_logs WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条日志');

    const canAll = adminCan(req.admin, 'log.viewAll');
    if (!canAll && row.admin_id !== req.admin.id) return fail(reply, 403, 'FORBIDDEN', null, '只能查看自己的操作日志');

    let detail = {};
    if (row.detail) {
      try {
        detail = JSON.parse(row.detail);
      } catch {
        detail = { note: String(row.detail).slice(0, 500) };
      }
    }
    if (!detail || typeof detail !== 'object') detail = {};

    return { ok: true, data: { ...shapeLog(row), detail } };
  });

  /** CSV：UTF-8 BOM + CRLF，Excel 双击不乱码；筛选口径与列表一致 */
  fastify.get('/logs/export.csv', { preHandler: requirePermission('log.export') }, async (req, reply) => {
    const q0 = req.query || {};
    const canAll = adminCan(req.admin, 'log.viewAll');
    const f = buildFilter(q0, req.admin.id, canAll);
    if (f.error) return bad(reply, f.error);

    const rows = db.prepare(
      'SELECT l.* FROM admin_logs l' + f.where + ' ORDER BY l.created_at DESC, l.id DESC LIMIT 50000'
    ).all(...f.params);

    const lines = [[
      '编号', '时间', '管理员编号', '管理员', '角色', '动作', '动作名称',
      '对象类型', '对象编号', '结果', 'IP', '摘要'
    ]];
    for (const r of rows) {
      const item = shapeLog(r);
      lines.push([
        item.id, formatDateTime(item.createdAt), item.adminId, item.adminName, item.roleKey,
        item.action, item.actionLabel, item.targetType, item.targetId,
        item.result === 'ok' ? '成功' : '失败', item.ip, item.summary
      ]);
    }

    return sendCsv(reply, 'admin-logs-' + ymd(now()) + '.csv', lines);
  });
};
