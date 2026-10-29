/**
 * 后台管理 · 工作台概览
 * 契约：docs/admin-api.md 第 7 节
 *
 * 为什么 series 在 JS 里补 0、而不是靠 SQL 生成日期序列：
 * 没有任何事件的那一天在表里根本不存在，GROUP BY 不会凭空造行。前端要画 7/14/30 根
 * 柱子，少一天就整张图错位。所以服务端先把日期轴铺满，再把查询结果灌进去。
 *
 * 为什么按 localtime 分组：
 * 运营看到的「今天」是本地时区的今天。用 UTC 分组会让北京时间 08:00 之前的动态
 * 落到前一天，数字每天都不对。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const {
  requirePermission,
  adminCan,
  shapeLog,
  shapeRewardRows,
  ACTION_LABELS,
  formatDate,
  startOfDay
} = require('../admin-guard');
const { shapePosts, POST_SELECT } = require('./admin-posts');

const DAY_OPTIONS = [7, 14, 30];

module.exports = async function adminStatsRoutes(fastify) {
  fastify.get('/overview', { preHandler: requirePermission('dashboard.view') }, async (req, reply) => {
    const q0 = req.query || {};
    let days = 7;
    if (q0.days != null && q0.days !== '') {
      days = Number(q0.days);
      if (DAY_OPTIONS.indexOf(days) < 0) {
        return fail(reply, 400, 'BAD_REQUEST', null, 'days 只能是 7、14、30');
      }
    }

    const at = now();
    const today = startOfDay(at);
    const start = today - (days - 1) * 86400;

    const one = (sql, ...params) => db.prepare(sql).get(...params) || {};
    const count = (sql, ...params) => {
      const row = db.prepare(sql).get(...params);
      return row && row.n != null ? Number(row.n) : 0;
    };

    /* ---------- KPI ---------- */
    const kpis = {
      posts: count('SELECT COUNT(*) AS n FROM posts'),
      postsToday: count('SELECT COUNT(*) AS n FROM posts WHERE created_at >= ?', today),
      pending: count("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'"),
      users: count('SELECT COUNT(*) AS n FROM users'),
      usersToday: count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', today),
      rewardsToday: count('SELECT COUNT(*) AS n FROM rewards WHERE granted_at >= ?', today),
      // 累计有效发放的积分（已撤回的不算），前端显示「累计发放积分」
      pointsGranted: Number(one("SELECT COALESCE(SUM(amount), 0) AS n FROM rewards WHERE type = 'points' AND status = 'active'").n || 0),
      disabledUsers: count("SELECT COUNT(*) AS n FROM users WHERE status = 'disabled'"),
      admins: count("SELECT COUNT(*) AS n FROM admin_accounts WHERE status = 'active'")
    };

    /* ---------- 日期轴 ---------- */
    const axis = [];
    for (let i = 0; i < days; i += 1) axis.push(formatDate(start + i * 86400));

    const seriesMap = {};
    for (const d of axis) seriesMap[d] = { date: d, posts: 0, users: 0, rewards: 0 };

    const fill = (rows, key) => {
      for (const row of rows) {
        if (seriesMap[row.d]) seriesMap[row.d][key] = Number(row.n) || 0;
      }
    };
    fill(db.prepare(
      "SELECT date(created_at, 'unixepoch', 'localtime') AS d, COUNT(*) AS n FROM posts WHERE created_at >= ? GROUP BY d"
    ).all(start), 'posts');
    fill(db.prepare(
      "SELECT date(created_at, 'unixepoch', 'localtime') AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d"
    ).all(start), 'users');
    fill(db.prepare(
      "SELECT date(granted_at, 'unixepoch', 'localtime') AS d, COUNT(*) AS n FROM rewards WHERE granted_at >= ? GROUP BY d"
    ).all(start), 'rewards');

    const series = axis.map((d) => seriesMap[d]);

    /* ---------- 待审预览 ---------- */
    const pendingRows = db.prepare(
      POST_SELECT + " WHERE p.status = 'pending' ORDER BY p.created_at ASC, p.id ASC LIMIT 6"
    ).all();

    /* ---------- 最近动态 ----------
       日志与奖励都按「这个人能看到的范围」取：staff 有 dashboard.view 但没有 log.viewAll，
       工作台上不能出现别人的操作摘要。 */
    const canAll = adminCan(req.admin, 'log.viewAll');
    const scopeWhere = canAll ? '' : ' WHERE l.admin_id = ?';
    const scopeParams = canAll ? [] : [req.admin.id];
    const recentLogs = db.prepare(
      'SELECT l.* FROM admin_logs l' + scopeWhere + ' ORDER BY l.created_at DESC, l.id DESC LIMIT 8'
    ).all(...scopeParams).map(shapeLog);

    const recentRewards = shapeRewardRows(
      db.prepare('SELECT r.* FROM rewards r ORDER BY r.granted_at DESC, r.id DESC LIMIT 5').all()
    );

    const barWhere = canAll ? ' WHERE' : ' WHERE l.admin_id = ? AND';
    const barParams = canAll ? [start] : [req.admin.id, start];
    const barRows = db.prepare(
      'SELECT l.action AS action, COUNT(*) AS n FROM admin_logs l' + barWhere +
      ' l.created_at >= ? GROUP BY l.action ORDER BY n DESC LIMIT 8'
    ).all(...barParams);

    return {
      ok: true,
      data: {
        kpis,
        series,
        pendingPreview: shapePosts(pendingRows),
        recentLogs,
        recentRewards,
        actionBars: barRows.map((b) => ({
          action: b.action,
          label: ACTION_LABELS[b.action] || b.action,
          count: Number(b.n) || 0
        }))
      }
    };
  });
};
