/**
 * 后台管理 · 奖励与积分
 * 契约：docs/admin-api.md 第 5 节
 *
 * 为什么「发放记录」和「users.points」必须在同一个事务里改：
 * 奖励表是账本，points 是余额。只写账本不写余额，用户积分不涨；只写余额不写账本，
 * 事后没法对账也没法撤回。两者要么一起成功，要么一起回滚，中间态比失败更难修。
 *
 * 为什么撤回时积分要 MAX(..., 0)：
 * 用户可能已经把积分花掉了。直接减会变成负数（等于让用户欠账），前端进度条/兑换
 * 都会出妖。扣到 0 为止，差额靠日志里的 detail 留痕。
 */
'use strict';

const { db, now } = require('../db');
const { fail } = require('../http');
const {
  requirePermission,
  writeAdminLog,
  shapeRewardRows,
  REWARD_TYPES,
  FRAMES,
  FRAME_BY_KEY,
  frameName,
  TIER_NAMES,
  paging,
  likeTerm,
  LIKE_ESC,
  parseTime,
  sendCsv,
  ymd
} = require('../admin-guard');
/* 会员授予必须复用站点那条状态机（member_orders → grantOrder → member_subs + member_events），
   自己再写一份「加天数」的逻辑，迟早会和前台支付/退款口径分叉。 */
const M = require('./membership');

const TYPES = ['points', 'days', 'frame', 'custom'];
const STATUSES = ['active', 'revoked'];

const STMT = {
  byId: db.prepare('SELECT * FROM rewards WHERE id = ?'),
  userById: db.prepare('SELECT id, name, email, points, frame FROM users WHERE id = ?'),
  insert: db.prepare(
    'INSERT INTO rewards (user_id, type, amount, tier, frame, prev_frame, reason, note, status, granted_by, granted_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  setFrame: db.prepare('UPDATE users SET frame = ?, updated_at = ? WHERE id = ?'),
  subByUser: db.prepare('SELECT * FROM member_subs WHERE user_id = ?'),
  setSubDays: db.prepare('UPDATE member_subs SET expires_at = ?, updated_at = ? WHERE user_id = ?'),
  dropSub: db.prepare("UPDATE member_subs SET tier = 'free', expires_at = ?, updated_at = ? WHERE user_id = ?"),
  addMemberEvent: db.prepare(
    'INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  addPoints: db.prepare('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?'),
  // 扣回：不允许扣成负数（可能已被消费），差额只体现在日志里
  subPoints: db.prepare('UPDATE users SET points = MAX(points - ?, 0), updated_at = ? WHERE id = ?'),
  revoke: db.prepare(
    "UPDATE rewards SET status = 'revoked', revoked_by = ?, revoked_at = ?, revoked_reason = ? WHERE id = ? AND status = 'active'"
  )
};

const REWARD_SELECT =
  'SELECT r.* FROM rewards r LEFT JOIN users u ON u.id = r.user_id';

function bad(reply, msg) {
  return fail(reply, 400, 'BAD_REQUEST', null, msg);
}

function readId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 列表与导出共用同一套筛选，避免「看到的和导出的不一致」 */
function buildFilter(q0) {
  const state = { error: '', where: '', params: [], order: 'r.granted_at DESC, r.id DESC' };

  const type = q0.type == null || q0.type === '' ? 'all' : String(q0.type);
  if (type !== 'all' && TYPES.indexOf(type) < 0) {
    state.error = 'type 只能是 all、points、days、frame、custom';
    return state;
  }

  const kw = typeof q0.q === 'string' ? q0.q.trim() : '';
  if (kw.length > 80) {
    state.error = '搜索词最多 80 个字';
    return state;
  }

  let adminId = 0;
  if (q0.adminId != null && q0.adminId !== '') {
    adminId = readId(q0.adminId);
    if (!adminId) {
      state.error = 'adminId 不对';
      return state;
    }
  }

  const from = parseTime(q0.from, false);
  const to = parseTime(q0.to, true);
  if (from.state === 'bad') { state.error = 'from 需要是 Unix 秒或 YYYY-MM-DD'; return state; }
  if (to.state === 'bad') { state.error = 'to 需要是 Unix 秒或 YYYY-MM-DD'; return state; }

  const parts = [];
  const params = [];
  if (kw) {
    const like = likeTerm(kw);
    parts.push('(u.name LIKE ? ' + LIKE_ESC + ' OR u.email LIKE ? ' + LIKE_ESC + ' OR r.reason LIKE ? ' + LIKE_ESC + ')');
    params.push(like, like, like);
  }
  if (type !== 'all') { parts.push('r.type = ?'); params.push(type); }
  if (adminId) { parts.push('r.granted_by = ?'); params.push(adminId); }
  if (from.state === 'ok') { parts.push('r.granted_at >= ?'); params.push(from.value); }
  if (to.state === 'ok') { parts.push('r.granted_at <= ?'); params.push(to.value); }

  state.where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
  state.params = params;
  return state;
}

/* 截断到 n 字：订单备注与日志摘要都有长度上限，超了会整条写入失败 */
function clip(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) : t;
}

/** 档位下拉的数据源：价格与天数一律读 member_plans，后台不写死一分钱 */
function tierOptions() {
  const plans = db.prepare(
    'SELECT tier, cycle, price_cents, list_cents, duration_days, active FROM member_plans ORDER BY sort ASC, id ASC'
  ).all();
  return M.TIER_ORDER.map((key) => {
    const t = M.TIERS[key];
    const pick = (cycle) => {
      const p = plans.find((x) => x.tier === key && x.cycle === cycle);
      return p ? { priceCents: p.price_cents, listCents: p.list_cents, days: p.duration_days, active: !!p.active } : null;
    };
    const month = pick('month');
    const year = pick('year');
    return {
      key,
      name: t.name,
      accent: t.accent,
      tagline: t.tagline,
      rank: M.TIER_RANK[key] || 0,
      month,
      year,
      /* 默认发放天数：优先月度计划的天数，没有就按 30 */
      defaultDays: month && month.days > 0 ? month.days : 30
    };
  });
}

/** 用户侧栏：余额、当前档位、剩余天数、当前头像框 —— 发放前后都要能读出变化 */
function userPanel(user) {
  if (!user) return null;
  const mv = M.memberView(user.id);
  const frame = user.frame || 'auto';
  return {
    id: user.id,
    name: user.name || '',
    email: user.email || '',
    points: user.points || 0,
    frame,
    frameLabel: frameName(frame, false),
    frameFollow: frame === 'auto',
    tier: mv.tier,
    tierName: mv.name,
    tierActive: !!mv.active,
    tierAccent: mv.active ? ((M.TIERS[mv.tier] || {}).accent || '') : '',
    expiresAt: mv.expiresAt || 0,
    daysLeft: mv.daysLeft || 0,
    expired: !!mv.expired
  };
}

module.exports = async function adminRewardRoutes(fastify) {
  /**
   * 发放面板的选项：档位（含价格/天数，来自 member_plans）、头像框目录、
   * 常用原因，以及可选 userId 的用户现况（余额 / 当前档位 / 当前头像框）。
   * 单独一个端点而不是塞进列表接口：价格与目录变化时前端只需重拉这一份。
   */
  fastify.get('/rewards/options', { preHandler: requirePermission('reward.view') }, async (req, reply) => {
    const q0 = req.query || {};
    let user = null;
    if (q0.userId != null && q0.userId !== '') {
      const userId = readId(q0.userId);
      if (!userId) return bad(reply, 'userId 不对');
      const row = STMT.userById.get(userId);
      if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');
      user = userPanel(row);
    }

    return {
      ok: true,
      data: {
        tiers: tierOptions(),
        frames: FRAMES,
        presets: ['优质内容奖励', '活动奖励', '问题补偿', '内测致谢', '会员续期补偿'],
        limits: { pointsMin: 1, pointsMax: 1000000, daysMin: 1, daysMax: 3650 },
        user
      }
    };
  });

  /** 列表。summary 用「不含 status 的筛选条件」算，切换状态标签时三个数字保持稳定 */
  fastify.get('/rewards', { preHandler: requirePermission('reward.view') }, async (req, reply) => {
    const q0 = req.query || {};
    const f = buildFilter(q0);
    if (f.error) return bad(reply, f.error);

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && STATUSES.indexOf(status) < 0) return bad(reply, 'status 只能是 all、active、revoked');

    const { page, pageSize, offset } = paging(q0);

    let where = f.where;
    let params = f.params;
    if (status !== 'all') {
      where = (where ? where + ' AND' : ' WHERE') + ' r.status = ?';
      params = params.concat([status]);
    }

    const total = db.prepare('SELECT COUNT(*) AS n FROM rewards r LEFT JOIN users u ON u.id = r.user_id' + where)
      .get(...params).n;

    const rows = db.prepare(REWARD_SELECT + where + ' ORDER BY ' + f.order + ' LIMIT ? OFFSET ?')
      .all(...params, pageSize, offset);

    const sum = db.prepare(
      'SELECT COUNT(*) AS all_n,' +
      " SUM(CASE WHEN r.status = 'active' THEN 1 ELSE 0 END) AS act," +
      " SUM(CASE WHEN r.status = 'revoked' THEN 1 ELSE 0 END) AS rev," +
      " SUM(CASE WHEN r.status = 'active' AND r.type = 'points' THEN r.amount ELSE 0 END) AS pts" +
      ' FROM rewards r LEFT JOIN users u ON u.id = r.user_id' + f.where
    ).get(...f.params);

    return {
      ok: true,
      data: {
        items: shapeRewardRows(rows),
        total,
        page,
        pageSize,
        summary: { granted: sum.act || 0, revoked: sum.rev || 0, pointsTotal: sum.pts || 0 }
      }
    };
  });

  /**
   * 发放。
   * - points：直接加积分余额；
   * - days：选档位 + 天数，走 0 元 manual 订单 → grantOrder，和前台支付同一条状态机
   *   （同档顺延、升级折算、降级拒绝都由它负责，后台不再重写一套）；
   * - frame：写 users.frame 覆盖头像框，旧值记进 prev_frame 供撤回还原；
   * - custom：只记账。
   */
  fastify.post('/rewards', { preHandler: requirePermission('reward.grant') }, async (req, reply) => {
    const b = req.body || {};

    const userId = readId(b.userId);
    if (!userId) return bad(reply, 'userId 不对');
    const user = STMT.userById.get(userId);
    if (!user) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这个用户');

    const type = typeof b.type === 'string' ? b.type : '';
    if (TYPES.indexOf(type) < 0) return bad(reply, 'type 只能是 points、days、frame、custom');

    const amount = Number(b.amount);
    if (!Number.isInteger(amount)) return bad(reply, 'amount 必须是整数');
    if (type === 'custom') {
      if (amount !== 0) return bad(reply, '自定义奖励的 amount 必须是 0');
    } else if (type === 'frame') {
      if (amount !== 0) return bad(reply, '头像框不需要填数量');
    } else if (type === 'days') {
      if (amount < 1 || amount > 3650) return bad(reply, '会员天数要在 1~3650 之间');
    } else if (amount < 1 || amount > 1000000) {
      return bad(reply, '积分数量要在 1~1000000 之间');
    }

    /* 档位只对 days 有意义：必填，且只能是四个付费档（free 不是「发放」，是到期回落）。 */
    let tier = '';
    if (type === 'days') {
      tier = typeof b.tier === 'string' ? b.tier.trim() : '';
      if (!tier) return bad(reply, '请选择要发放的会员档位');
      if (!M.TIERS[tier]) return bad(reply, '档位只支持 diamond / master / grandmaster / hunt');
    }

    /* 头像框：键必须在目录里；auto = 重新跟随会员档位。 */
    let frame = '';
    if (type === 'frame') {
      frame = typeof b.frame === 'string' ? b.frame.trim() : '';
      if (!frame) return bad(reply, '请选择要更换的头像框');
      if (!FRAME_BY_KEY[frame]) return bad(reply, '头像框不在可选范围里');
    }

    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length < 4 || reason.length > 200) return bad(reply, '原因要 4~200 个字');
    let note = '';
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') return bad(reply, '备注必须是字符串');
      note = b.note.trim();
      if (note.length > 200) return bad(reply, '备注最多 200 个字');
    }

    const at = now();
    const pointsBefore = user.points || 0;
    const prevFrame = user.frame || 'auto';
    let id = 0;
    let member = null;
    let orderNo = '';

    /* 一个事务包住「订单 + 授予 + 台账 + 余额」：
       降级会被 grantOrder 抛出，订单状态也一起回滚，不会留下已支付却没生效的孤儿单。 */
    const grantTxn = db.transaction(() => {
      if (type === 'days') {
        const plan = db.prepare(
          "SELECT * FROM member_plans WHERE tier = ? AND cycle = 'month' ORDER BY active DESC, id ASC LIMIT 1"
        ).get(tier);
        orderNo = M.newOrderNo(at);
        db.prepare('INSERT INTO member_orders' +
          ' (order_no, user_id, plan_id, tier, cycle, amount_cents, status, channel,' +
          '  created_at, expires_at, note, admin_id)' +
          " VALUES (?, ?, ?, ?, 'month', 0, 'pending', 'manual', ?, ?, ?, ?)")
          .run(orderNo, userId, plan ? plan.id : null, tier, at, at,
            clip('奖励发放：' + reason, 200), req.admin.id);

        const res = M.grantOrder(orderNo, 'admin:' + req.admin.id,
          { eventKind: 'manual', days: amount, note: reason });
        if (!res.ok) {
          const err = new Error('GRANT_FAILED');
          err.code = res.code || 'GRANT_FAILED';
          throw err;
        }
        member = res.member;
      }
      if (type === 'frame') STMT.setFrame.run(frame, at, userId);

      const info = STMT.insert.run(userId, type, amount, tier, frame,
        type === 'frame' ? prevFrame : '', reason, note, 'active', req.admin.id, at);
      id = Number(info.lastInsertRowid);
      if (type === 'points') STMT.addPoints.run(amount, at, userId);
    });

    try {
      grantTxn();
    } catch (err) {
      if (err && err.code === 'DOWNGRADE_NOT_ALLOWED') {
        return fail(reply, 409, 'DOWNGRADE_NOT_ALLOWED', null,
          '该用户当前档位更高，到期后自然回落，不支持主动降级');
      }
      throw err;
    }

    const giveText = type === 'days'
      ? amount + ' 天「' + (TIER_NAMES[tier] || tier) + '」会员'
      : type === 'frame'
        ? '头像框「' + frameName(frame, false) + '」'
        : amount + ' ' + (REWARD_TYPES[type] || type);

    writeAdminLog(req, {
      action: type === 'frame' ? 'reward.frame' : 'reward.grant',
      targetType: 'reward',
      targetId: id,
      summary: '给用户 #' + userId + '（' + (user.name || '未命名') + '）发放 ' + giveText + '：' + reason,
      detail: {
        before: type === 'frame' ? { frame: prevFrame } : { points: pointsBefore },
        after: {
          rewardId: id, type, amount, tier, frame, reason, note,
          orderNo, points: STMT.userById.get(userId).points
        }
      }
    });

    return {
      ok: true,
      data: {
        reward: shapeRewardRows([STMT.byId.get(id)])[0],
        user: userPanel(STMT.userById.get(userId)),
        member
      }
    };
  });

  /** 撤回：只允许 active，重复撤回 409（前端靠这个区分「已经撤过了」和「参数错」） */
  fastify.post('/rewards/:id/revoke', { preHandler: requirePermission('reward.revoke') }, async (req, reply) => {
    const id = readId(req.params.id);
    if (!id) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条奖励记录');
    const row = STMT.byId.get(id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', null, '没有找到这条奖励记录');
    if (row.status !== 'active') return fail(reply, 409, 'CONFLICT', null, '这条奖励已经撤回过了');

    const b = req.body || {};
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length < 2 || reason.length > 200) return bad(reply, '撤回原因要 2~200 个字');

    const at = now();
    const user = STMT.userById.get(row.user_id);
    const pointsBefore = user ? user.points || 0 : 0;

    // 并发下可能两个人同时点撤回：UPDATE 带 status='active' 条件，谁落空谁拿 409
    try {
      db.transaction(() => {
        const info = STMT.revoke.run(req.admin.id, at, reason, id);
        if (!info.changes) throw new Error('REWARD_ALREADY_REVOKED');
        if (row.type === 'points') STMT.subPoints.run(row.amount, at, row.user_id);

        /* 会员天数撤回：按发放的天数从到期时间往前扣。
           扣到 <= now 就直接回落 free（保留时间戳，会员中心要能显示「已于某日到期」）。
           只动「当前这一档」的天数：跨档的旧奖励撤回后如果档位已经变了，
           精确折算没有意义，按天数直减并留一条负数 member_events 流水，人工可追溯。 */
        if (row.type === 'days') {
          const sub = STMT.subByUser.get(row.user_id);
          if (sub && sub.tier && sub.tier !== 'free') {
            const cutDays = Math.max(0, Number(row.amount) || 0);
            const next = (sub.expires_at || 0) - cutDays * 86400;
            if (next <= at) STMT.dropSub.run(0, at, row.user_id);
            else STMT.setSubDays.run(next, at, row.user_id);
            STMT.addMemberEvent.run(row.user_id, null, 'manual', sub.tier, -cutDays, 0,
              'admin:' + req.admin.id, '撤回奖励 #' + id + '：' + reason, at);
          }
        }

        /* 头像框撤回：还原成发放前的值。prev_frame 空（老记录/异常）时回 auto，
           即重新跟随会员档位，总比留在别人指定的框上更符合直觉。 */
        if (row.type === 'frame') {
          STMT.setFrame.run(row.prev_frame || 'auto', at, row.user_id);
        }
      })();
    } catch (err) {
      if (err && err.message === 'REWARD_ALREADY_REVOKED') {
        return fail(reply, 409, 'CONFLICT', null, '这条奖励已经撤回过了');
      }
      throw err;
    }

    const backText = row.type === 'days'
      ? row.amount + ' 天「' + (TIER_NAMES[row.tier] || row.tier || '会员') + '」'
      : row.type === 'frame'
        ? '头像框「' + frameName(row.frame || 'auto', false) + '」'
        : row.amount + ' ' + (REWARD_TYPES[row.type] || row.type);

    writeAdminLog(req, {
      action: 'reward.revoke',
      targetType: 'reward',
      targetId: id,
      summary: '撤回给用户 #' + row.user_id + '（' + (user ? user.name : '未命名') + '）的 ' + backText + '：' + reason,
      detail: {
        before: { status: 'active', points: pointsBefore, tier: row.tier || '', frame: row.frame || '' },
        after: {
          status: 'revoked',
          points: STMT.userById.get(row.user_id).points,
          user: userPanel(STMT.userById.get(row.user_id))
        },
        note: reason
      }
    });

    return {
      ok: true,
      data: { reward: shapeRewardRows([STMT.byId.get(id)])[0], user: userPanel(STMT.userById.get(row.user_id)) }
    };
  });

  /** CSV：筛选条件与列表一致；带上限防止一次导出把内存打满 */
  fastify.get('/rewards/export.csv', { preHandler: requirePermission('reward.view') }, async (req, reply) => {
    const q0 = req.query || {};
    const f = buildFilter(q0);
    if (f.error) return bad(reply, f.error);

    const status = q0.status == null || q0.status === '' ? 'all' : String(q0.status);
    if (status !== 'all' && STATUSES.indexOf(status) < 0) return bad(reply, 'status 只能是 all、active、revoked');

    let where = f.where;
    let params = f.params;
    if (status !== 'all') {
      where = (where ? where + ' AND' : ' WHERE') + ' r.status = ?';
      params = params.concat([status]);
    }

    const rows = shapeRewardRows(
      db.prepare(REWARD_SELECT + where + ' ORDER BY ' + f.order + ' LIMIT 50000').all(...params)
    );

    const lines = [[
      '编号', '用户ID', '用户昵称', '用户邮箱', '类型', '数量', '会员档位', '头像框', '原因', '备注', '状态',
      '发放人', '发放时间', '撤回时间', '撤回人', '撤回原因'
    ]];
    for (const r of rows) {
      lines.push([
        r.id, r.userId, r.user.name, r.user.email, r.typeLabel, r.amount,
        r.tierLabel || '', r.frameLabel || '', r.reason, r.note,
        r.status === 'active' ? '有效' : '已撤回',
        r.grantedBy ? r.grantedBy.name : '', r.grantedAt ? timeText(r.grantedAt) : '',
        r.revokedAt ? timeText(r.revokedAt) : '', r.revokedBy ? r.revokedBy.name : '', r.revokedReason
      ]);
    }

    return sendCsv(reply, 'rewards-' + ymd(now()) + '.csv', lines);
  });
};

/** 导出里的时间用本地时区可读格式，运营直接看表不用再换公式 */
function timeText(t) {
  const d = new Date(t * 1000);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
