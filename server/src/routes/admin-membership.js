/**
 * 会员赞助 · 后台接口
 * 挂载前缀：/api/admin/membership
 * 契约：docs/membership-contract.md 5.3
 *
 * 权限：每个路由都挂 adminOnly —— requireAuth 取当前用户，isAdmin 判管理身份，
 *       两步都过才进处理函数。单写一个 preHandler 而不是在每个 handler 里重复判断，
 *       是为了「新增一个后台接口时不可能忘记加权限」。
 * KPI 口径（契约里只给了字段名，这里按最保守的财务口径实现）：
 *   gmvCents    期内 status='paid' 的订单金额和（不含已退款订单，退款单已转为 refunded）
 *   refundCents 期内 refunded 订单的 refund_cents 和（按 refunded_at 落在期内）
 *   netCents    gmv - refund
 *   payingUsers 期内 paid 订单的去重用户数
 *   newMembers  期内首次产生 paid 订单的用户数（「新建订阅」= 第一次真正付钱）
 *   renewRate   期内 renew 事件数 / 期内到期订阅数；分母为 0 时回 0
 *   arppuCents  net / payingUsers（四舍五入到分）
 *   monthNetCents 本月现金净收入（收款 - 退款）
 *   goalPercent   本月净收入 / 目标，封顶 100
 *   pending     当前 pending 订单数
 */
'use strict';

const { db, now } = require('../db');
const { requireAuth, isAdmin } = require('../auth');
const { fail } = require('../http');
const M = require('./membership');

/* ---------- 权限前置 ---------- */
async function adminOnly(req, reply) {
  await requireAuth(req, reply);
  // requireAuth 已经回过 401 并结束请求，这里不能再写第二份响应
  if (!req.user) return reply;
  if (!isAdmin(req.user)) {
    return fail(reply, 403, 'FORBIDDEN', null, '这里只有管理员能进');
  }
}

/* ---------- 时间格式 ---------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDate(ts) {
  const d = new Date(ts * 1000);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 本地时间 'YYYY-MM-DD HH:mm:ss'；0/空值回 ''，CSV 里不会出现 1970 */
function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return formatDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/**
 * 解析 from/to：既接受 Unix 秒（纯数字），也接受 'YYYY-MM-DD'。
 * endOfDay=true 时把日期推到当天 23:59:59，让「到 10-23」包含 10-23 全天，
 * 否则后台按日期筛选永远会漏掉最后一天。
 */
function parseTimeParam(v, endOfDay) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = Math.floor(d.getTime() / 1000);
  return endOfDay ? base + 86399 : base;
}

function clampInt(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function clipText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

/** CSV 单元格转义：逗号 / 双引号 / 换行都要包起来，内部引号翻倍（RFC 4180） */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ---------- KPI ---------- */

function buildOverview(days) {
  const ts = now();
  // 含今天在内往前 days 天：days=30 → [今天-29天 00:00, 现在]
  const from = M.startOfDay(ts) - (days - 1) * 86400;
  const to = ts;

  /* amount_cents > 0 是营收口径的硬条件：后台「手动开通」会生成 0 元 manual 订单
     并直接置为 paid（契约 5.3），它是账本记录、不是收入。把它算进 GMV/ARPPU
     会把「送出去的会员」算成钱，付费用户数与客单价都会失真。 */
  const paidRows = db.prepare(
    "SELECT user_id, tier, channel, amount_cents, paid_at FROM member_orders " +
    "WHERE status = 'paid' AND amount_cents > 0 AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at <= ?"
  ).all(from, to);
  const refundRows = db.prepare(
    "SELECT user_id, tier, channel, refund_cents, refunded_at FROM member_orders " +
    "WHERE status = 'refunded' AND refund_cents > 0 AND refunded_at IS NOT NULL AND refunded_at >= ? AND refunded_at <= ?"
  ).all(from, to);

  let gmv = 0;
  const payers = new Set();
  const seriesMap = {};
  const tierMap = {};
  const channelMap = {};

  M.TIER_ORDER.forEach((t) => { tierMap[t] = { tier: t, count: 0, netCents: 0 }; });
  ['wechat', 'alipay', 'manual'].forEach((c) => { channelMap[c] = { channel: c, count: 0, netCents: 0 }; });

  // 按天补零：后台图表要连续 x 轴，缺失的日期必须有一条 0 值记录
  const base = new Date(from * 1000);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    seriesMap[key] = { date: key, gmvCents: 0, orders: 0 };
  }

  for (const r of paidRows) {
    gmv += r.amount_cents;
    payers.add(r.user_id);
    const key = formatDate(r.paid_at);
    if (seriesMap[key]) {
      seriesMap[key].gmvCents += r.amount_cents;
      seriesMap[key].orders += 1;
    }
    if (tierMap[r.tier]) {
      tierMap[r.tier].count += 1;
      tierMap[r.tier].netCents += r.amount_cents;
    }
    if (channelMap[r.channel]) {
      channelMap[r.channel].count += 1;
      channelMap[r.channel].netCents += r.amount_cents;
    }
  }

  let refund = 0;
  for (const r of refundRows) {
    refund += r.refund_cents;
    if (tierMap[r.tier]) tierMap[r.tier].netCents -= r.refund_cents;
    if (channelMap[r.channel]) channelMap[r.channel].netCents -= r.refund_cents;
  }

  const net = gmv - refund;

  /* 新会员：期内「新建订阅」的去重用户数。
     不能拿 member_subs.started_at —— 续费/升级会改写它，老会员会被重复算成新会员；
     也不能只看「第一次付钱」—— 过期后重新赞助的老朋友同样是一次新建订阅。
     grant / manual 事件正好只在「从无到有」时写入（续费=renew、升级=upgrade），
     所以按事件去重最贴近契约口径。 */
  const newMembers = db.prepare(
    'SELECT COUNT(*) AS n FROM (' +
    "  SELECT DISTINCT user_id FROM member_events" +
    "  WHERE kind IN ('grant', 'manual') AND created_at >= ? AND created_at <= ?" +
    ')'
  ).get(from, to).n;

  const renewEvents = db.prepare(
    "SELECT COUNT(*) AS n FROM member_events WHERE kind = 'renew' AND created_at >= ? AND created_at <= ?"
  ).get(from, to).n;
  const expiringInPeriod = db.prepare(
    "SELECT COUNT(*) AS n FROM member_subs WHERE tier <> 'free' AND expires_at >= ? AND expires_at <= ?"
  ).get(from, to).n;

  const goal = M.goalCents();
  const mStart = M.monthStart(ts);
  // 本月现金：收款侧包含「本月付、后来退」的原支付额，退款侧单独减，避免重复计负数
  const monthPaid = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) AS n FROM member_orders WHERE amount_cents > 0 AND paid_at IS NOT NULL AND paid_at >= ?'
  ).get(mStart).n;
  const monthRefund = db.prepare(
    "SELECT COALESCE(SUM(refund_cents), 0) AS n FROM member_orders WHERE status = 'refunded' AND refund_cents > 0 AND refunded_at IS NOT NULL AND refunded_at >= ?"
  ).get(mStart).n;
  const monthNet = monthPaid - monthRefund;

  /* 只算「还没过期、真的等人付」的单；过期单在下单时惰性关闭，后台不该继续显示为待处理 */
  const pending = db.prepare("SELECT COUNT(*) AS n FROM member_orders WHERE status = 'pending' AND expires_at > ?").get(ts).n;

  return {
    kpi: {
      gmvCents: gmv,
      refundCents: refund,
      netCents: net,
      orders: paidRows.length,
      payingUsers: payers.size,
      newMembers: newMembers,
      /* 续费率 = 续费笔数 / (续费笔数 + 到期未续笔数)，保证在 0..1 之间；
         不能直接除以 expiringInPeriod —— 同一订阅多次续费会让比值超过 100%。 */
      renewRate: (renewEvents + expiringInPeriod) > 0 ? Math.round((renewEvents / (renewEvents + expiringInPeriod)) * 100) / 100 : 0,
      arppuCents: payers.size > 0 ? Math.round(net / payers.size) : 0,
      goalCents: goal,
      monthNetCents: monthNet,
      goalPercent: goal > 0 ? Math.max(0, Math.min(100, Math.round((monthNet / goal) * 100))) : 0,
      pending: pending
    },
    series: Object.keys(seriesMap).sort().map((k) => seriesMap[k]),
    tiers: M.TIER_ORDER.map((t) => tierMap[t]),
    channels: ['wechat', 'alipay', 'manual'].map((c) => channelMap[c]),
    expiring: db.prepare(
      'SELECT s.user_id, s.tier, s.expires_at, u.name AS user_name ' +
      'FROM member_subs s JOIN users u ON u.id = s.user_id ' +
      "WHERE s.tier <> 'free' AND s.expires_at > ? AND s.expires_at <= ? " +
      'ORDER BY s.expires_at ASC LIMIT 20'
    ).all(ts, ts + 30 * 86400).map((r) => ({
      userId: r.user_id,
      name: r.user_name || '',
      tier: r.tier,
      expiresAt: r.expires_at,
      daysLeft: Math.max(0, Math.ceil((r.expires_at - ts) / 86400))
    })),
    plans: M.listPlans(false)
  };
}

/* ---------- 路由 ---------- */

async function routes(fastify) {
  // ===== 5.3 KPI 概览 =====
  fastify.get('/overview', { preHandler: adminOnly }, async (req) => {
    const days = clampInt(req.query.days, 1, 365, 30);
    return { ok: true, data: buildOverview(days) };
  });

  // ===== 5.3 订单列表 =====
  fastify.get('/orders', { preHandler: adminOnly }, async (req, reply) => {
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const offset = clampInt(req.query.offset, 0, 1000000, 0);

    const where = ['1=1'];
    const args = [];

    const status = String(req.query.status || '').trim();
    if (status && !M.STATUS_TEXT[status]) {
      return fail(reply, 400, 'BAD_STATUS', null, '订单状态不支持');
    }
    if (status) { where.push('o.status = ?'); args.push(status); }

    const tier = String(req.query.tier || '').trim();
    if (tier && !M.TIERS[tier]) {
      return fail(reply, 400, 'BAD_TIER', null, '等级不支持');
    }
    if (tier) { where.push('o.tier = ?'); args.push(tier); }

    const channel = String(req.query.channel || '').trim();
    if (channel && !M.CHANNEL_TEXT[channel]) {
      return fail(reply, 400, 'BAD_CHANNEL', null, '渠道不支持');
    }
    if (channel) { where.push('o.channel = ?'); args.push(channel); }

    const q = clipText(req.query.q, 60);
    if (q) {
      const like = '%' + q + '%';
      where.push('(o.order_no LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
      args.push(like, like, like);
    }

    const from = parseTimeParam(req.query.from, false);
    const to = parseTimeParam(req.query.to, true);
    if (from != null) { where.push('o.created_at >= ?'); args.push(from); }
    if (to != null) { where.push('o.created_at <= ?'); args.push(to); }

    const whereSql = ' WHERE ' + where.join(' AND ');
    const baseSql = ' FROM member_orders o JOIN users u ON u.id = o.user_id' + whereSql;

    const total = db.prepare('SELECT COUNT(*) AS n' + baseSql).get(...args).n;
    const sumCents = db.prepare('SELECT COALESCE(SUM(o.amount_cents), 0) AS n' + baseSql).get(...args).n;
    const rows = db.prepare('SELECT o.*' + baseSql + ' ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?')
      .all(...args.concat([limit, offset]));

    return {
      ok: true,
      data: {
        items: rows.map((r) => M.shapeOrder(r, { admin: true })),
        total: total,
        sumCents: sumCents
      }
    };
  });

  // ===== 5.3 手动补单：走和用户支付完全相同的 grantOrder =====
  fastify.post('/orders/:orderNo/mark-paid', { preHandler: adminOnly }, async (req, reply) => {
    const order = M.findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在');
    if (order.status === 'paid') {
      // 幂等：重复点「补单」不报错、也不重复加天数
      return {
        ok: true,
        data: { order: M.shapeOrder(order, { admin: true }), member: M.memberView(order.user_id) }
      };
    }
    if (order.status !== 'pending') {
      return fail(reply, 409, 'ORDER_STATE', null, '只有待支付订单可以补单');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const note = clipText(body.note, 200);
    const actor = 'admin:' + req.user.id;

    /* 备注/操作人与授予放在同一个事务里：授予成功备注一定落库，
       授予因降级失败时整笔回滚，不会留下「备注写了、单子没生效」的半成品。 */
    const run = db.transaction(() => {
      db.prepare('UPDATE member_orders SET note = ?, admin_id = ? WHERE id = ?')
        .run(note || order.note || '', req.user.id, order.id);
      // 传订单号而不是数值 id：grantOrder 的合同是「订单行或订单号」，
      // 数字 id 会被它判定为无效输入（返回 ORDER_NOT_FOUND），补单就永远失败。
      return M.grantOrder(order.order_no, actor);
    });
    const res = run();

    if (!res.ok) {
      if (res.code === 'DOWNGRADE_NOT_ALLOWED') {
        return fail(reply, 409, 'DOWNGRADE_NOT_ALLOWED', null, '高等级到期后自然回落，不支持主动降级');
      }
      return fail(reply, 409, 'ORDER_STATE', null, '订单状态已变化，刷新后再试');
    }

    return {
      ok: true,
      data: {
        order: M.shapeOrder(M.findOrder(order.order_no), { admin: true }),
        member: res.member
      }
    };
  });

  // ===== 5.3 退款 + 订阅回滚 =====
  fastify.post('/orders/:orderNo/refund', { preHandler: adminOnly }, async (req, reply) => {
    const order = M.findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在');
    if (order.status !== 'paid') {
      return fail(reply, 409, 'ORDER_STATE', null, '只有已支付的订单可以退款');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const note = clipText(body.note, 200);
    const actor = 'admin:' + req.user.id;
    const ts = now();

    const run = db.transaction(() => {
      const changed = db.prepare(
        "UPDATE member_orders SET status = 'refunded', refunded_at = ?, refund_cents = amount_cents, admin_id = ?, note = ? " +
        "WHERE id = ? AND status = 'paid'"
      ).run(ts, req.user.id, note || order.note || '', order.id).changes;
      if (changed !== 1) return { ok: false };

      // 契约第 4 节：只有「当前订阅正是这笔订单授予的」才回滚订阅
      const sub = M.readSub(order.user_id);
      let rolledBackDays = 0;
      if (sub && sub.tier !== 'free' && sub.order_no === order.order_no) {
        const granted = db.prepare(
          "SELECT COALESCE(SUM(days), 0) AS n FROM member_events WHERE order_no = ? AND kind IN ('grant', 'renew', 'upgrade', 'manual')"
        ).get(order.order_no).n;
        const plan = order.plan_id
          ? db.prepare('SELECT duration_days FROM member_plans WHERE id = ?').get(order.plan_id)
          : null;
        const days = granted > 0 ? granted : (plan ? plan.duration_days : (order.cycle === 'year' ? 365 : 30));

        const newExpires = sub.expires_at - days * 86400;
        if (newExpires <= ts) {
          // 扣完已经没有剩余时间：直接回 free（删行），下一读取就是旅人
          db.prepare('DELETE FROM member_subs WHERE user_id = ?').run(order.user_id);
        } else {
          db.prepare('UPDATE member_subs SET expires_at = ?, updated_at = ? WHERE user_id = ?')
            .run(newExpires, ts, order.user_id);
        }
        rolledBackDays = days;
      }

      db.prepare(
        'INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(order.user_id, order.order_no, 'refund', order.tier, rolledBackDays ? -rolledBackDays : 0,
        order.amount_cents, actor, note, ts);

      return { ok: true };
    });

    const res = run();
    if (!res.ok) return fail(reply, 409, 'ORDER_STATE', null, '订单状态已变化，刷新后再试');

    return {
      ok: true,
      data: {
        order: M.shapeOrder(M.findOrder(order.order_no), { admin: true }),
        member: M.memberView(order.user_id)
      }
    };
  });

  // ===== 5.3 后台关闭订单 =====
  fastify.post('/orders/:orderNo/close', { preHandler: adminOnly }, async (req, reply) => {
    const order = M.findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在');
    if (order.status !== 'pending') {
      return fail(reply, 409, 'ORDER_STATE', null, '只有待支付订单可以关闭');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const note = clipText(body.note, 200);
    const ts = now();

    const run = db.transaction(() => {
      const changed = db.prepare(
        "UPDATE member_orders SET status = 'closed', closed_at = ?, admin_id = ?, note = ? WHERE id = ? AND status = 'pending'"
      ).run(ts, req.user.id, note || order.note || '', order.id).changes;
      if (changed !== 1) return false;
      db.prepare(
        'INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
        " VALUES (?, ?, 'close', ?, 0, 0, ?, ?, ?)"
      ).run(order.user_id, order.order_no, order.tier, 'admin:' + req.user.id, note, ts);
      return true;
    });

    if (!run()) return fail(reply, 409, 'ORDER_STATE', null, '订单状态已变化，刷新后再试');
    return { ok: true, data: { order: M.shapeOrder(M.findOrder(order.order_no), { admin: true }) } };
  });

  // ===== 5.3 计划列表 / 修改 =====
  fastify.get('/plans', { preHandler: adminOnly }, async () => {
    return { ok: true, data: { plans: M.listPlans(false) } };
  });

  fastify.put('/plans/:id', { preHandler: adminOnly }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(reply, 400, 'BAD_ID', null, '计划编号不合法');
    const row = db.prepare('SELECT * FROM member_plans WHERE id = ?').get(id);
    if (!row) return fail(reply, 404, 'PLAN_NOT_FOUND', null, '计划不存在');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sets = [];
    const args = [];
    const changes = [];

    /* 列名不来自请求：body 的 key 先映射到模块内常量列名，白名单之外的键一律忽略。
       这样即使有人传 {"price_cents; DROP TABLE": 1} 也拼不进 SQL。 */
    const nums = [
      ['priceCents', 'price_cents', 0, 100000000],
      ['listCents', 'list_cents', 0, 100000000],
      ['durationDays', 'duration_days', 1, 3650],
      ['seats', 'seats', 0, 100000],
      ['sort', 'sort', -100000, 100000]
    ];
    for (const [key, col, min, max] of nums) {
      if (body[key] === undefined) continue;
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min || n > max) {
        return fail(reply, 400, 'BAD_FIELD', null, key + ' 超出允许范围');
      }
      sets.push(col + ' = ?');
      args.push(Math.floor(n));
      changes.push(key + ' ' + row[col] + ' → ' + Math.floor(n));
    }
    if (body.active !== undefined) {
      const active = body.active === true || body.active === 1 || body.active === '1' ? 1 : 0;
      sets.push('active = ?');
      args.push(active);
      changes.push('active ' + row.active + ' → ' + active);
    }
    if (sets.length === 0) {
      return fail(reply, 400, 'BAD_FIELD', null, '至少提供一个要修改的字段');
    }

    const ts = now();
    sets.push('updated_at = ?');
    args.push(ts, id);

    const run = db.transaction(() => {
      db.prepare('UPDATE member_plans SET ' + sets.join(', ') + ' WHERE id = ?').run(...args);
      // plan_change 不针对具体会员，user_id 记 0（审计流水表刻意没有外键）
      db.prepare(
        'INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
        " VALUES (0, NULL, 'plan_change', ?, 0, 0, ?, ?, ?)"
      ).run(row.tier, 'admin:' + req.user.id, '计划 #' + id + '：' + changes.join('；'), ts);
    });
    run();

    return { ok: true, data: { plan: M.mapPlan(db.prepare('SELECT * FROM member_plans WHERE id = ?').get(id)) } };
  });

  // ===== 5.3 手动开通（生成 0 元 manual 订单，直接 paid） =====
  fastify.post('/grant', { preHandler: adminOnly }, async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const userId = Number(body.userId);
    const email = clipText(body.email, 120);
    let user = null;
    if (Number.isInteger(userId) && userId > 0) {
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else if (email) {
      user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    } else {
      return fail(reply, 400, 'BAD_USER', null, 'userId 或 email 至少给一个');
    }
    if (!user) return fail(reply, 404, 'USER_NOT_FOUND', null, '没有找到这个用户');

    const tier = String(body.tier || '').trim();
    if (tier === 'free') return fail(reply, 400, 'BAD_TIER', null, '免费档不需要开通');
    if (!M.TIERS[tier]) return fail(reply, 400, 'BAD_TIER', null, '等级只支持 diamond / master / grandmaster / hunt');

    const days = Number(body.days);
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      return fail(reply, 400, 'BAD_DAYS', null, '天数必须是 1~3650 的整数');
    }

    const plan = db.prepare(
      "SELECT * FROM member_plans WHERE tier = ? AND cycle = 'month' ORDER BY active DESC, id ASC LIMIT 1"
    ).get(tier);
    const note = clipText(body.note, 200);
    const ts = now();
    const actor = 'admin:' + req.user.id;

    /* 先生成 pending 的 0 元 manual 订单，再用同一个 grantOrder 授予：
       这样后台开通和前台支付走的是同一条状态机路径，不会出现两套「加天数」逻辑。
       整个过程在外层事务里，授予失败（例如降级）会连订单一起回滚。 */
    const run = db.transaction(() => {
      const orderNo = M.newOrderNo(ts);
      db.prepare('INSERT INTO member_orders' +
        ' (order_no, user_id, plan_id, tier, cycle, amount_cents, status, channel,' +
        '  created_at, expires_at, note, admin_id)' +
        " VALUES (?, ?, ?, ?, 'month', 0, 'pending', 'manual', ?, ?, ?, ?)")
        .run(orderNo, user.id, plan ? plan.id : null, tier, ts, ts, note, req.user.id);

      const res = M.grantOrder(orderNo, actor, { eventKind: 'manual', days: days, note: note });
      if (!res.ok) {
        const err = new Error('grant failed');
        err.code = res.code || 'GRANT_FAILED';
        throw err;
      }
      return res;
    });

    let res;
    try {
      res = run();
    } catch (err) {
      if (err && err.code === 'DOWNGRADE_NOT_ALLOWED') {
        return fail(reply, 409, 'DOWNGRADE_NOT_ALLOWED', null, '高等级到期后自然回落，不支持主动降级');
      }
      throw err;
    }

    return {
      ok: true,
      data: {
        order: M.shapeOrder(M.findOrder(res.order.order_no), { admin: true }),
        member: res.member
      }
    };
  });

  // ===== 5.3 会员列表 =====
  fastify.get('/members', { preHandler: adminOnly }, async (req) => {
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const q = clipText(req.query.q, 60);
    const ts = now();

    const where = ["s.tier <> 'free'"];
    const args = [];
    if (q) {
      const like = '%' + q + '%';
      where.push('(u.name LIKE ? OR u.email LIKE ?)');
      args.push(like, like);
    }
    const rows = db.prepare(
      'SELECT s.*, u.name AS user_name, u.email AS email ' +
      'FROM member_subs s JOIN users u ON u.id = s.user_id ' +
      'WHERE ' + where.join(' AND ') + ' ORDER BY s.expires_at DESC LIMIT ?'
    ).all(...args.concat([limit]));

    return {
      ok: true,
      data: {
        items: rows.map((r) => ({
          userId: r.user_id,
          name: r.user_name || '',
          email: r.email || '',
          tier: r.tier,
          // 契约这里写了两个 name（昵称与等级名），JSON 不能重名；
          // 第二个用 tierName，前端按等级名渲染不会歧义
          tierName: M.tierName(r.tier),
          expiresAt: r.expires_at,
          daysLeft: Math.max(0, Math.ceil((r.expires_at - ts) / 86400)),
          orderNo: r.order_no || '',
          showName: r.show_name ? 1 : 0
        }))
      }
    };
  });

  // ===== 5.3 CSV 报表 =====
  fastify.get('/report.csv', { preHandler: adminOnly }, async (req, reply) => {
    const days = clampInt(req.query.days, 1, 366, 90);
    const ts = now();
    const from = M.startOfDay(ts) - (days - 1) * 86400;
    const to = ts;

    const rows = db.prepare(
      'SELECT o.*, u.name AS user_name, u.email AS email ' +
      'FROM member_orders o JOIN users u ON u.id = o.user_id ' +
      'WHERE o.created_at >= ? AND o.created_at <= ? ORDER BY o.created_at ASC, o.id ASC'
    ).all(from, to);

    const header = ['订单号', '创建时间', '支付时间', '用户', '邮箱', '等级', '周期', '金额(元)', '渠道', '状态', '退款(元)', '备注'];
    const lines = [header.map(csvCell).join(',')];

    for (const r of rows) {
      lines.push([
        r.order_no,
        formatDateTime(r.created_at),
        formatDateTime(r.paid_at),
        r.user_name || '',
        r.email || '',
        M.tierName(r.tier),
        r.cycle === 'year' ? '年付' : '月付',
        M.amountText(r.amount_cents),
        M.CHANNEL_TEXT[r.channel] || r.channel,
        M.STATUS_TEXT[r.status] || r.status,
        M.amountText(r.refund_cents || 0),
        r.note || ''
      ].map(csvCell).join(','));
    }

    // 末尾空行 + CRLF：Excel 对 CRLF + BOM 的识别最稳
    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
    const d = new Date(ts * 1000);
    const stamp = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="membership-report-' + stamp + '.csv"');
    reply.header('Cache-Control', 'no-store');
    return reply.send(csv);
  });
}

module.exports = routes;
