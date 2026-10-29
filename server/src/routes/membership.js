/**
 * 会员赞助 · 公开接口与登录用户接口
 * 挂载前缀：/api/membership
 * 契约：docs/membership-contract.md（字段名以契约为准，本文件不擅自改名）
 *
 * 全文件贯穿的几个决定：
 * - 时间一律 Unix 秒、金额一律整数分：库与响应里都不出现浮点金额，
 *   展示用的两位小数字符串只在 amountText 里生成，对账不会漂。
 * - 订单状态机只有三条边：pending→paid、pending→closed、paid→refunded。
 *   授予只认 UPDATE ... WHERE status='pending' 的 changes===1，
 *   支付回调重复到达也不会二次加天数（幂等靠数据库条件更新，不靠内存判断）。
 * - 到期不做定时任务：读取时发现 expires_at<=now 就回落 free（契约第 4 节）。
 *   少一个常驻进程，也少一类「定时任务挂了没人发现」的故障面。
 * - 所有 SQL 都是 prepared statement；拼字符串只发生在「列名是模块内常量」的白名单更新里。
 * - 不在模块加载时 prepare 会员表语句：schema-membership.sql 建表失败时，
 *   路由加载也不能把整个进程带走（db.js 对建表是 try/catch 的，这里必须同样宽容）。
 */
'use strict';

const crypto = require('crypto');
const { db, now, parseJson } = require('../db');
const { requireAuth, isAdmin } = require('../auth');
const { fail } = require('../http');

/* ---------- 等级 / 文案（服务端默认值，前端可覆盖） ---------- */
const TIER_ORDER = ['diamond', 'master', 'grandmaster', 'hunt'];
/* rank 用来判升降级：数字大 = 等级高。free 是 0，未赞助/已过期都按它算。 */
const TIER_RANK = { free: 0, diamond: 1, master: 2, grandmaster: 3, hunt: 4 };

const TIERS = {
  diamond: {
    name: '钻石',
    accent: '#38bdf8',
    tagline: '轻量支持，解锁基础权益',
    blurb: '适合想给鲸域一点支持、同时用上高清原图与专属徽章的鲸友。'
  },
  master: {
    name: '大师',
    accent: '#8b7cf6',
    tagline: '进阶赞助，帖子获得推荐位',
    blurb: '在钻石全部权益之上，帖子可申请加精与首页推荐，被更多人看到。'
  },
  grandmaster: {
    name: '宗师',
    accent: '#f0a63c',
    tagline: '深度同行，私有仓库与咨询',
    blurb: '包含大师全部权益，另有 3 个私有插件仓库、内测通道与每月一次咨询。'
  },
  hunt: {
    name: '猎杀',
    accent: '#f2557a',
    tagline: '最高礼遇，限定 20 席',
    blurb: '限量席位：4 次/月一对一咨询、自定义称号、工单优先与服务器铭牌。'
  }
};

const FREE_TIER = 'free';
const FREE_NAME = '旅人';

const STATUS_TEXT = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' };
const CHANNEL_TEXT = { wechat: '微信支付', alipay: '支付宝', manual: '扫码转账', afdian: '爱发电' };

/* 站外付款渠道：钱不经过本站，靠「订单号 + 自助登记 + 后台补单」闭环。
   这两条共用一套逻辑，区别只在收银台上显示收款码还是跳转按钮。 */
const OFFSITE_CHANNELS = { manual: 1, afdian: 1 };

/* 爱发电主页地址。没配就整条通道 live=false，前端自动置灰。
   两个必须在服务端做的约束：
   1) 只接受 http(s) —— 这个值会被前端直接塞进 <a href>，放行 javascript: 等于给
      自己开一个存储型 XSS 的口子（环境变量能改，但不能假设它永远干净）；
   2) 截断到 300 字符 —— .env 里多打一行空格或注释就会整串带进来。 */
const AFDIAN_URL = (function () {
  const raw = String(process.env.AFDIAN_URL || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw.slice(0, 300);
})();

/* 前端收银台可选的支付渠道。
   live=true 表示这条通道现在「真的能收到钱」：
   - afdian 走爱发电外链，留言填订单号，后台补单；
   - manual 走固定收款码 + 后台补单，不需要任何第三方资质；
   - wechat/alipay 的在线支付还没接密钥（payView 仍返回 demo 桩），标 false，
     前端据此把按钮置灰，免得用户对着一个永远付不出去的二维码发呆。
   接上真实商户号后把对应项的 live 改成 true 即可，前端不用动。 */
/* 人工收款码渠道默认关闭：assets/pay/manual.png 没放图时，
   前端那一格只会渲染出一个空虚线框——比不显示更伤信任。
   放好图之后把 PAY_MANUAL_QR=1 打开即可。 */
const PAY_QR = /^(1|true|yes|on)$/i.test(String(process.env.PAY_MANUAL_QR || '').trim());

const CHANNELS = [
  { id: 'afdian', name: '爱发电', hint: '留言填订单号', live: !!AFDIAN_URL },
  { id: 'manual', name: '扫码转账', hint: '备注订单号', live: PAY_QR },
  { id: 'wechat', name: '微信支付', hint: '在线扫码', live: false },
  { id: 'alipay', name: '支付宝', hint: '在线扫码', live: false }
];

/* live 只是「基础值」，真正对外要按当下环境求值：
   沙箱开着时（本地演示 / 预发）在线支付走 payView 的 demo 桩 + 模拟支付按钮，
   整条闭环是通的，这时候再把 wechat/alipay 置灰，页面会挂着一条
   「赞助通道暂时关闭」的红字，用户连档位都选不了 —— 演示直接断在半路。
   生产 MEMBERSHIP_SANDBOX=0，求值结果仍是 false，行为与原来完全一致。
   渠道列表在两个地方用（概览下发给前端、下单白名单），必须共用同一份求值，
   否则会出现「按钮能点、下单 400」的错位。 */
function channelsNow() {
  const sb = sandboxOn();
  return CHANNELS.map(function (c) {
    if (c.id !== 'wechat' && c.id !== 'alipay') return c;
    return { id: c.id, name: c.name, hint: c.hint, live: sb };
  });
}

/* ---------- 权益矩阵（契约 1.1） ----------
   /me 只回 key 数组，具体文案在前端权益表里；数组顺序与契约表格一致，
   前端按顺序渲染「已解锁」列表就不用再排一次。 */
const BENEFITS = {
  free: ['download'],
  diamond: ['badge', 'wall', 'status', 'download', 'emoji'],
  master: ['badge', 'wall', 'status', 'download', 'emoji', 'boost'],
  grandmaster: ['badge', 'wall', 'status', 'download', 'emoji', 'boost', 'private', 'beta', 'consult', 'thanks'],
  hunt: ['badge', 'wall', 'status', 'download', 'emoji', 'boost', 'private', 'beta', 'consult', 'title', 'thanks', 'priority']
};

/* ---------- 配置 ---------- */

/** 读正整数环境变量，坏值回退默认（避免 NaN/负数一路传进 SQL） */
function envInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}

const DEFAULT_GOAL_CENTS = envInt('MEMBERSHIP_GOAL_CENTS', 68000);
const ORDER_TTL = envInt('MEMBERSHIP_ORDER_TTL', 1800); // 秒，契约：created_at + 1800
/* 站外付款没有「支付窗口」这回事：用户常常当晚看到、第二天才去付。
   沿用 30 分钟窗口会让单子在用户真正付款前就变成 closed，钱到了却没有单可核。
   站外渠道（爱发电 / 收款码）单独给一个长窗口（默认 3 天）。到期只是不再显示
   「待支付」倒计时，后台补单依然可用 —— 钱已经到账时不该因为超时把人挡在外面。 */
const OFFSITE_TTL = envInt('MEMBERSHIP_OFFSITE_TTL', 259200);

/** 读 member_settings；表还没建好/键不存在都回退，不抛异常 */
function setting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM member_settings WHERE key = ?').get(key);
    return row && row.value != null ? String(row.value) : fallback;
  } catch (err) {
    return fallback;
  }
}

/**
 * 沙箱支付是否开启（契约 4）：
 *   MEMBERSHIP_SANDBOX=0 显式关闭（生产兜底）→ MEMBERSHIP_SANDBOX=1 显式开启 →
 *   member_settings.sandbox='1' → 非生产环境。
 * 顺序是刻意的：环境变量是部署级开关，必须能压过库里被误改的值。
 */
function sandboxOn() {
  const env = String(process.env.MEMBERSHIP_SANDBOX == null ? '' : process.env.MEMBERSHIP_SANDBOX).trim();
  if (env === '0' || env.toLowerCase() === 'false') return false;
  if (env === '1' || env.toLowerCase() === 'true') return true;
  // 库里的开关默认 0：生产环境哪怕漏配环境变量，也不会因为库里的默认值而放开 simulate
  if (setting('sandbox', '0') === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

/** 筹款目标（分），后台可以改 member_settings 覆盖 */
function goalCents() {
  const n = Number(setting('monthly_goal_cents', String(DEFAULT_GOAL_CENTS)));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_GOAL_CENTS;
}

/* ---------- 小工具 ---------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 本地时区的当天 0 点（Unix 秒）；自然月/按天系列都按站点本地时区算 */
function startOfDay(ts) {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

/** 本地时区的当月 1 号 0 点 */
function monthStart(ts) {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}

/** 'YYYY-MM'，概览页的「2026-10」 */
function monthLabel(ts) {
  const d = new Date(ts * 1000);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

/** 金额（分）→ '58.00'；不用 toLocaleString，避免机器 locale 影响输出 */
function amountText(cents) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return sign + Math.floor(abs / 100) + '.' + pad2(abs % 100);
}

/** 邮箱打码：a***@b.com。本人与公开接口都用它，后台才给完整邮箱。 */
function maskEmail(email) {
  const s = typeof email === 'string' ? email : '';
  const at = s.lastIndexOf('@');
  if (at <= 0) return s ? s.slice(0, 1) + '***' : '';
  const local = s.slice(0, at);
  return (local ? local.slice(0, 1) : '') + '***' + s.slice(at);
}

function tierName(tier) {
  return TIERS[tier] ? TIERS[tier].name : FREE_NAME;
}

function tierRank(tier) {
  return TIER_RANK[tier] || 0;
}

/** 计划行 → 契约里的 Plan（金额字段名统一 *Cents） */
function mapPlan(row) {
  return {
    id: row.id,
    tier: row.tier,
    cycle: row.cycle,
    priceCents: row.price_cents,
    listCents: row.list_cents,
    durationDays: row.duration_days,
    seats: row.seats,
    active: row.active === 1 ? 1 : 0,
    sort: row.sort,
    perks: parseJson(row.perks, [])
  };
}

function listPlans(activeOnly) {
  const sql = activeOnly
    ? 'SELECT * FROM member_plans WHERE active = 1 ORDER BY sort ASC, id ASC'
    : 'SELECT * FROM member_plans ORDER BY sort ASC, id ASC';
  return db.prepare(sql).all().map(mapPlan);
}

/* ---------- 订阅读取 / 到期回落 ---------- */

function readSub(userId) {
  return db.prepare('SELECT * FROM member_subs WHERE user_id = ?').get(userId) || null;
}

/**
 * 头像框覆盖值（契约外的增值字段）：
 * '' / 'auto' = 跟随会员档位；'none' = 不戴；'maw-1'..'maw-4' = 指定等级。
 * 后台奖励发放可以单独指定，站点渲染时优先看它。
 * 列不存在的老库直接回落 auto，不让一个装饰字段把会员中心打成 500。
 */
function frameOf(userId) {
  try {
    const row = db.prepare('SELECT frame FROM users WHERE id = ?').get(userId);
    return (row && row.frame) || 'auto';
  } catch (err) {
    return 'auto';
  }
}

/**
 * 会员视图（契约 5.2 的 member 形状）。
 * 到期判定放在这里而不是各处复制：任何接口读到的「我是不是会员」都必须是同一结论；
 * 发现过期就顺手把 tier 写回 free（契约第 4 节），下次连判断都省了。
 * 注意保留 expires_at/started_at：会员中心要能显示「已于某日到期」。
 */
function memberView(userId) {
  const ts = now();
  const free = {
    tier: FREE_TIER,
    name: FREE_NAME,
    active: false,
    startedAt: 0,
    expiresAt: 0,
    daysLeft: 0,
    orderNo: '',
    autoRenew: 0,
    showName: 1,
    expired: false,
    frame: frameOf(userId)
  };

  const sub = readSub(userId);
  if (!sub) return free;

  if (sub.tier === FREE_TIER) {
    free.startedAt = sub.started_at || 0;
    free.expiresAt = sub.expires_at || 0;
    free.orderNo = sub.order_no || '';
    free.autoRenew = sub.auto_renew ? 1 : 0;
    free.showName = sub.show_name ? 1 : 0;
    free.expired = !!(sub.expires_at && sub.expires_at <= ts);
    return free;
  }

  if (sub.expires_at <= ts) {
    // 到期即回落：写回 free，保留时间戳供展示；失败也不影响本次读取（最坏下次再写一次）
    try {
      db.prepare("UPDATE member_subs SET tier = 'free', updated_at = ? WHERE user_id = ? AND expires_at <= ?")
        .run(ts, userId, ts);
    } catch (err) {
      /* 只读接口不能因为一次写回失败就 500 */
    }
    return {
      tier: FREE_TIER,
      name: FREE_NAME,
      active: false,
      startedAt: sub.started_at || 0,
      expiresAt: sub.expires_at || 0,
      daysLeft: 0,
      orderNo: sub.order_no || '',
      autoRenew: sub.auto_renew ? 1 : 0,
      showName: sub.show_name ? 1 : 0,
      expired: true,
      frame: frameOf(userId)
    };
  }

  return {
    tier: sub.tier,
    name: tierName(sub.tier),
    active: true,
    startedAt: sub.started_at,
    expiresAt: sub.expires_at,
    // 向上取整：还剩 3 小时也算 1 天，前端不会显示「0 天后到期」
    daysLeft: Math.max(1, Math.ceil((sub.expires_at - ts) / 86400)),
    orderNo: sub.order_no || '',
    autoRenew: sub.auto_renew ? 1 : 0,
    showName: sub.show_name ? 1 : 0,
    expired: false,
    frame: frameOf(userId)
  };
}

/* ---------- 订单视图 ---------- */

/**
 * 订单对外形状（契约 5.2 的 Order）。
 * opts.admin：后台可见完整邮箱；用户侧一律打码（契约「隐私」）。
 * 额外补 refundCents / refundedAt：后台退款列表与 CSV 要用，
 * 契约 Order 示例里没列，但字段只增不改名，前端忽略即可。
 */
function shapeOrder(row, opts) {
  if (!row) return null;
  const o = opts || {};
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.user_id) || {};
  return {
    orderNo: row.order_no,
    planId: row.plan_id || 0,
    tier: row.tier,
    tierName: tierName(row.tier),
    cycle: row.cycle,
    amountCents: row.amount_cents,
    amountText: amountText(row.amount_cents),
    status: row.status,
    statusText: STATUS_TEXT[row.status] || row.status,
    channel: row.channel,
    channelText: CHANNEL_TEXT[row.channel] || row.channel,
    createdAt: row.created_at,
    paidAt: row.paid_at || 0,
    expiresAt: row.expires_at || 0,
    closedAt: row.closed_at || 0,
    refundCents: row.refund_cents || 0,
    refundedAt: row.refunded_at || 0,
    note: row.note || '',
    user: {
      id: row.user_id,
      name: user.name || '',
      email: o.admin ? (user.email || '') : maskEmail(user.email || '')
    }
  };
}

function findOrder(orderNo) {
  const no = typeof orderNo === 'string' ? orderNo.trim() : '';
  if (!no) return null;
  return db.prepare('SELECT * FROM member_orders WHERE order_no = ?').get(no) || null;
}

/** 收银台参数：真实在线支付还没接密钥，统一回 demo（契约 4）。
 *  站外渠道各自给一个 mode：
 *  - manual 渲染「固定收款码 + 订单号 + 付款登记」；
 *  - afdian 渲染「跳转爱发电 + 订单号 + 付款登记」。
 *  两者的共同点是「不会有回调」，所以前端不去轮询在线支付状态。 */
function payView(order) {
  const mode = order.channel === 'afdian' ? 'afdian'
    : order.channel === 'manual' ? 'manual'
      : 'demo';
  return {
    mode: mode,
    qrText: '',
    payUrl: order.channel === 'afdian' ? AFDIAN_URL : '',
    expiresAt: order.expires_at || 0,
    sandbox: sandboxOn()
  };
}

/**
 * 订单号：JY + yyyymmdd + 6 位大写 hex（契约 3）。
 * 为什么先查再插：虽然列上有 UNIQUE，撞了会抛异常；这里重抽 5 次，
 * 把「极小概率的冲突」变成对用户完全不可见的重试，而不是 500。
 */
function newOrderNo(ts) {
  const d = new Date(ts * 1000);
  const day = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  const stmt = db.prepare('SELECT 1 FROM member_orders WHERE order_no = ?');
  for (let i = 0; i < 5; i++) {
    const no = 'JY' + day + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!stmt.get(no)) return no;
  }
  throw new Error('订单号连续冲突，请重试');
}

/* ---------- 日单价（升级折算用） ---------- */
/* 契约第 4 节：creditCents = 剩余天数 × 旧档日单价。
   日单价从 member_plans 的月付价/天数实时取，后台调价后折算跟着变；
   计划被删/被停用时回退到契约第 1 节的权威价，保证折算永远有数可用。 */
const FALLBACK_MONTH_CENTS = { diamond: 1900, master: 5800, grandmaster: 13800, hunt: 38800 };
const FALLBACK_MONTH_DAYS = 30;

function dailyPrice(tier) {
  let row = null;
  try {
    row = db.prepare(
      "SELECT price_cents, duration_days FROM member_plans WHERE tier = ? AND cycle = 'month' ORDER BY active DESC, id ASC LIMIT 1"
    ).get(tier);
  } catch (err) {
    row = null;
  }
  if (row && row.duration_days > 0 && row.price_cents > 0) {
    return row.price_cents / row.duration_days;
  }
  return (FALLBACK_MONTH_CENTS[tier] || 0) / FALLBACK_MONTH_DAYS;
}

/* ---------- 授予（唯一入口：用户模拟支付 / 后台补单 / 后台手动开通） ---------- */

/**
 * 授予订单。全程一个事务：
 *   1) 条件更新 pending→paid，changes!==1 说明已被处理过，直接回当前订单（幂等）；
 *   2) 按契约第 4 节算新到期时间（同档顺延 / 升级折算 / 降级拒绝）；
 *   3) UPSERT member_subs，写 member_events。
 * actor：'user' | 'admin:<id>' | 'system'；opts.eventKind 让后台手动开通记成 manual。
 * 返回值从不抛「业务异常」：降级会抛出带 code 的 Error 让事务回滚，外层捕获成 {ok:false}。
 */
const GRANT_TXN = db.transaction(function grantTxn(orderId, actor, opts) {
  const order = db.prepare('SELECT * FROM member_orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
  if (order.status !== 'pending') {
    return { ok: false, code: 'ORDER_STATE', order: order };
  }

  const ts = now();
  const changed = db.prepare("UPDATE member_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'")
    .run(ts, order.id).changes;
  // 契约第 4 节：只有真的从 pending 改成 paid 的那一次才执行授予
  if (changed !== 1) {
    return { ok: false, code: 'ORDER_STATE', order: db.prepare('SELECT * FROM member_orders WHERE id = ?').get(order.id) };
  }

  const plan = order.plan_id
    ? db.prepare('SELECT * FROM member_plans WHERE id = ?').get(order.plan_id)
    : null;
  const planDays = plan && plan.duration_days > 0
    ? plan.duration_days
    : (order.cycle === 'year' ? 365 : 30);
  /* 后台手动开通允许给任意天数（契约 5.3 的 grant.body.days）；
     没有计划行或没传 days 时按计划天数 / 30·365 兜底。 */
  const customDays = opts && Number(opts.days) > 0 ? Math.floor(Number(opts.days)) : 0;
  const durationDays = customDays > 0 ? customDays : planDays;

  const sub = readSub(order.user_id);
  const oldTier = sub && sub.tier !== FREE_TIER ? sub.tier : FREE_TIER;
  const oldActive = !!(sub && oldTier !== FREE_TIER && sub.expires_at > ts);

  let kind = 'grant';
  let startedAt = ts;
  let expiresAt = ts + durationDays * 86400;
  let days = durationDays;

  if (oldActive && oldTier === order.tier) {
    /* 同档续费：从旧到期时间往后顺延，而不是从今天重算 ——
       提前续费不该吞掉剩余天数。 */
    kind = 'renew';
    startedAt = sub.started_at;
    expiresAt = Math.max(ts, sub.expires_at) + durationDays * 86400;
  } else if (oldActive && tierRank(order.tier) > tierRank(oldTier)) {
    /* 升级：把剩余价值折算成新档天数。
       credit = 剩余天数 × 旧档日单价；extraDays = floor(credit / 新档日单价)。
       剩余天数向上取整：宁可多给用户几小时，不要让「还剩 0.4 天」被算成 0。 */
    kind = 'upgrade';
    const remainDays = Math.max(0, Math.ceil((sub.expires_at - ts) / 86400));
    const creditCents = remainDays * dailyPrice(oldTier);
    const newDaily = dailyPrice(order.tier);
    const extraDays = newDaily > 0 ? Math.floor(creditCents / newDaily) : 0;
    days = durationDays + extraDays;
    expiresAt = ts + days * 86400;
  } else if (oldActive && tierRank(order.tier) < tierRank(oldTier)) {
    // 降级：抛错让整个事务回滚（订单状态也一起回滚），外层转成 409
    const err = new Error('高等级到期后自然回落，不支持主动降级');
    err.code = 'DOWNGRADE_NOT_ALLOWED';
    throw err;
  }
  /* 其余情况（没有订阅 / 已过期 / 原 tier=free）都是 grant：从 now 起算新档。
     已过期但旧档更高的人买低档，也算 grant —— 过期之后本来就等于旅人。 */

  db.prepare('INSERT INTO member_subs' +
    ' (user_id, tier, started_at, expires_at, order_no, auto_renew, show_name, note, updated_at)' +
    " VALUES (?, ?, ?, ?, ?, 0, 1, '', ?)" +
    ' ON CONFLICT(user_id) DO UPDATE SET' +
    ' tier = excluded.tier, started_at = excluded.started_at,' +
    ' expires_at = excluded.expires_at, order_no = excluded.order_no,' +
    ' updated_at = excluded.updated_at')
    .run(order.user_id, order.tier, startedAt, expiresAt, order.order_no, ts);

  db.prepare('INSERT INTO member_events' +
    ' (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(order.user_id, order.order_no, (opts && opts.eventKind) || kind, order.tier, days,
      order.amount_cents, actor || 'system', (opts && opts.note) || '', ts);

  return {
    ok: true,
    order: db.prepare('SELECT * FROM member_orders WHERE id = ?').get(order.id),
    member: memberView(order.user_id)
  };
});

/**
 * 对外入口：接受订单行或订单号。
 * 返回 { ok:true, order, member } 或 { ok:false, code, order? }；
 * 只有降级会被转成业务失败，其他异常继续上抛（那是真 bug，不该被吞）。
 */
function grantOrder(orderOrNo, actor, opts) {
  const row = typeof orderOrNo === 'string'
    ? findOrder(orderOrNo)
    : (orderOrNo && orderOrNo.id ? orderOrNo : null);
  if (!row) return { ok: false, code: 'ORDER_NOT_FOUND' };
  try {
    return GRANT_TXN(row.id, actor || 'system', opts || {});
  } catch (err) {
    if (err && err.code === 'DOWNGRADE_NOT_ALLOWED') return { ok: false, code: 'DOWNGRADE_NOT_ALLOWED' };
    throw err;
  }
}

/* ---------- 赞助者墙 ---------- */

/** 按等级权重降序 + 加入时间降序；show_name=0 一律显示匿名鲸友（契约 5.1） */
function wallItems(limit) {
  const rows = db.prepare(
    'SELECT s.*, u.name AS user_name, u.avatar AS avatar, u.frame AS frame ' +
    'FROM member_subs s JOIN users u ON u.id = s.user_id ' +
    'WHERE s.tier <> ? AND s.expires_at > ? ' +
    'ORDER BY CASE s.tier WHEN ? THEN 4 WHEN ? THEN 3 WHEN ? THEN 2 WHEN ? THEN 1 ELSE 0 END DESC, ' +
    's.started_at DESC LIMIT ?'
  ).all(FREE_TIER, now(), 'hunt', 'grandmaster', 'master', 'diamond',
    Math.min(Math.max(Number(limit) || 12, 1), 60));

  return rows.map((r) => {
    const shown = r.show_name === 1;
    return {
      name: shown ? (r.user_name || '鲸友') : '匿名鲸友',
      tier: r.tier,
      since: r.started_at || 0,
      note: r.note || '',
      /* 匿名与否单独给一个布尔：前端不用靠「名字是不是匿名鲸友」去猜，
         以后改匿名文案也不会把头像漏出去。 */
      anon: !shown,
      avatar: shown ? (r.avatar || '') : '',
      /* 匿名连头像框一起隐掉：不同框就是不同等级，露框等于露档位 */
      frame: shown ? (r.frame || 'auto') : 'auto'
    };
  });
}

/* ---------- 路由 ---------- */

async function routes(fastify) {
  // ===== 5.1 公开：概览 =====
  fastify.get('/overview', async () => {
    const ts = now();
    const goal = goalCents();
    const mStart = monthStart(ts);

    /* 本月筹款：按「现金」口径 —— 本月实际收到的钱（含本月被退掉的订单原支付额）
       减去本月实际退出去的钱。只看 status='paid' 会把「本月付款、本月退款」算成负数，
       所以收款侧用 paid_at 窗口、不限当前状态，退款侧用 refunded_at 窗口。 */
    const paidIn = db.prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) AS n FROM member_orders WHERE paid_at IS NOT NULL AND paid_at >= ?'
    ).get(mStart).n;
    const refundIn = db.prepare(
      "SELECT COALESCE(SUM(refund_cents), 0) AS n FROM member_orders WHERE status = 'refunded' AND refunded_at IS NOT NULL AND refunded_at >= ?"
    ).get(mStart).n;
    const raised = Math.max(0, paidIn - refundIn);

    const backers = db.prepare("SELECT COUNT(*) AS n FROM member_subs WHERE tier <> 'free' AND expires_at > ?")
      .get(ts).n;

    const huntTotalRow = db.prepare(
      "SELECT seats FROM member_plans WHERE tier = 'hunt' AND seats > 0 ORDER BY cycle ASC, id ASC LIMIT 1"
    ).get();
    const huntTotal = huntTotalRow ? huntTotalRow.seats : 20;
    const huntUsed = db.prepare("SELECT COUNT(*) AS n FROM member_subs WHERE tier = 'hunt' AND expires_at > ?")
      .get(ts).n;

    return {
      ok: true,
      data: {
        tiers: TIER_ORDER.map((t) => ({
          tier: t,
          name: TIERS[t].name,
          accent: TIERS[t].accent,
          tagline: TIERS[t].tagline,
          blurb: TIERS[t].blurb
        })),
        plans: listPlans(true),
        seats: {
          hunt: { total: huntTotal, used: huntUsed, left: Math.max(0, huntTotal - huntUsed) }
        },
        stats: {
          goalCents: goal,
          raisedCents: raised,
          backers: backers,
          monthLabel: monthLabel(ts),
          percent: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
        },
        // 概览只放前 12 条做预览，完整列表走 /wall（最多 60）
        wall: wallItems(12),
        // 只下发真正可用的渠道：前端拿到的每一条都必须能直接下单。
        // 未开通的（爱发电没配链接 / 收款码没放图 / 在线支付没接密钥）
        // 一律不下发 —— 页面上挂一排灰按钮比不显示更伤信任。
        channels: channelsNow().filter((c) => c.live),
        sandbox: sandboxOn()
      }
    };
  });

  // ===== 5.1 公开：赞助者墙 =====
  fastify.get('/wall', async () => ({ ok: true, data: { items: wallItems(60) } }));

  // ===== 5.2 会员中心 =====
  fastify.get('/me', { preHandler: requireAuth }, async (req) => {
    const member = memberView(req.user.id);

    const totalsRow = db.prepare(
      'SELECT COUNT(*) AS orders, COALESCE(SUM(amount_cents), 0) AS paid_cents, ' +
      "COALESCE(MIN(created_at), 0) AS since FROM member_orders WHERE user_id = ? AND status = 'paid'"
    ).get(req.user.id);

    // 定价从库里取（后台可能调过价），缺计划时回 0 让前端知道要联系管理员
    const pricing = {};
    TIER_ORDER.forEach((t) => { pricing[t] = { month: 0, year: 0 }; });
    db.prepare('SELECT tier, cycle, price_cents FROM member_plans WHERE active = 1').all().forEach((p) => {
      if (pricing[p.tier]) pricing[p.tier][p.cycle] = p.price_cents;
    });

    return {
      ok: true,
      data: {
        member: member,
        benefitKeys: BENEFITS[member.tier] || BENEFITS.free,
        pricing: pricing,
        totals: {
          paidCents: totalsRow.paid_cents,
          orders: totalsRow.orders,
          since: totalsRow.since
        }
      }
    };
  });

  // ===== 5.2 我的订单列表 =====
  fastify.get('/orders', { preHandler: requireAuth }, async (req, reply) => {
    const status = String(req.query.status || 'all');
    if (status !== 'all' && !STATUS_TEXT[status]) {
      return fail(reply, 400, 'BAD_STATUS', null, '订单状态只支持 all / pending / paid / closed / refunded');
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    /* admin 例外（契约 4「权限」）：管理员可以带 ?userId= 查别人；
       普通用户无论传什么都只查自己 —— 这里不把 userId 当可选项。 */
    let userId = req.user.id;
    if (isAdmin(req.user) && Number(req.query.userId) > 0) userId = Number(req.query.userId);

    const where = ['user_id = ?'];
    const args = [userId];
    if (status !== 'all') {
      where.push('status = ?');
      args.push(status);
    }
    const whereSql = ' WHERE ' + where.join(' AND ');

    const total = db.prepare('SELECT COUNT(*) AS n FROM member_orders' + whereSql).get(...args).n;
    const rows = db.prepare(
      'SELECT * FROM member_orders' + whereSql + ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
    ).all(...args.concat([limit, offset]));

    return {
      ok: true,
      data: {
        items: rows.map((r) => shapeOrder(r, { admin: false })),
        total: total
      }
    };
  });

  // ===== 5.2 创建订单 =====
  fastify.post('/orders', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const planId = Number(body.planId);
    if (!Number.isInteger(planId) || planId <= 0) {
      return fail(reply, 400, 'BAD_PLAN', null, '缺少有效的计划编号');
    }

    const plan = db.prepare('SELECT * FROM member_plans WHERE id = ?').get(planId);
    if (!plan) return fail(reply, 404, 'PLAN_NOT_FOUND', null, '这个赞助计划不存在，刷新页面再试');
    if (plan.active !== 1) return fail(reply, 409, 'PLAN_INACTIVE', null, '这个计划已下架，换一档试试');

    /* 渠道白名单：只允许「现在真的能收到钱」的通道下单。
       直接用 CHANNELS 的 live 标记推导，而不是再手写一遍 id ——
       多一条硬编码就多一处配好了 env 却下不了单的坑。 */
    const channel = String(body.channel || '');
    const allowedChannels = channelsNow().filter((c) => c.live).map((c) => c.id);
    if (allowedChannels.indexOf(channel) < 0) {
      return fail(reply, 400, 'BAD_CHANNEL', null, '这个支付渠道当前不可用，换一个试试');
    }

    const ts = now();
    const sub = readSub(req.user.id);
    const activeTier = sub && sub.tier !== FREE_TIER && sub.expires_at > ts ? sub.tier : FREE_TIER;

    // 降级拒绝：高等级到期会自然回落，用户不需要（也不允许）主动买低档
    if (tierRank(plan.tier) < tierRank(activeTier)) {
      return fail(reply, 409, 'DOWNGRADE_NOT_ALLOWED', null, '高等级到期后自然回落，不支持主动降级');
    }

    /* 猎杀席位：只算「仍然有效」的订阅（契约 1）。member_subs 没有 status 列，
       active 的唯一判据就是 expires_at > now —— 过期未续的行不能继续占席，
       否则 20 个过期用户会把新买家永久挡在门外。
       自己已经占了猎杀席位时不再拦 —— 那是续费，不是新占一个座。 */
    if (plan.seats > 0 && activeTier !== plan.tier) {
      const used = db.prepare('SELECT COUNT(*) AS n FROM member_subs WHERE tier = ? AND expires_at > ?')
        .get(plan.tier, ts).n;
      if (used >= plan.seats) {
        return fail(reply, 409, 'SEATS_FULL', null, '「' + tierName(plan.tier) + '」席位已满，等有人到期再来');
      }
    }

    /* 重复创建：同一用户同一计划只要还有「未过期」的 pending 就复用。
       复用窗口必须等于支付窗口（ORDER_TTL=1800s）：如果只看「最近 5 分钟创建」，
       用户第 6 分钟再点「立即赞助」会开出第二张 pending 单，同一档位两张待支付，
       后台对账会重复。契约 5.2 写的是「5 分钟内复用」，这里按支付 TTL 收紧成
       「整个支付窗口内复用」—— 旧单 expires_at 还没到就直接返回它，不新建。 */
    const reuse = db.prepare(
      "SELECT * FROM member_orders WHERE user_id = ? AND plan_id = ? AND status = 'pending' AND expires_at > ? ORDER BY id DESC LIMIT 1"
    ).get(req.user.id, plan.id, ts);
    if (reuse) {
      return { ok: true, data: { order: shapeOrder(reuse, { admin: false }), pay: payView(reuse) } };
    }

    /* 旧 pending 已过期就不再复用，但也不能让它一直挂在后台 pending 计数里：
       新建前把同用户同计划里已经超时的单收掉（pending→closed 是契约允许的边）。 */
    db.prepare(
      "UPDATE member_orders SET status = 'closed', closed_at = ? WHERE user_id = ? AND plan_id = ? AND status = 'pending' AND expires_at <= ?"
    ).run(ts, req.user.id, plan.id, ts);

    const orderNo = newOrderNo(ts);
    const expiresAt = ts + (OFFSITE_CHANNELS[channel] ? OFFSITE_TTL : ORDER_TTL);

    db.prepare('INSERT INTO member_orders' +
      ' (order_no, user_id, plan_id, tier, cycle, amount_cents, status, channel,' +
      '  created_at, expires_at, client_ip, ua)' +
      " VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)")
      .run(orderNo, req.user.id, plan.id, plan.tier, plan.cycle, plan.price_cents, channel,
        ts, expiresAt,
        String(req.ip || '').slice(0, 64),
        String((req.headers && req.headers['user-agent']) || '').slice(0, 200));

    const order = findOrder(orderNo);
    return { ok: true, data: { order: shapeOrder(order, { admin: false }), pay: payView(order) } };
  });

  // ===== 5.2 单笔订单（本人或 admin） =====
  fastify.get('/orders/:orderNo', { preHandler: requireAuth }, async (req, reply) => {
    const order = findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在，检查一下链接');
    if (order.user_id !== req.user.id && !isAdmin(req.user)) {
      return fail(reply, 403, 'FORBIDDEN', null, '只能查看自己的订单');
    }
    /* pay 一起回：收银台刷新后要重新渲染「去付款」按钮和倒计时，
       只回 order 的话前端拿不到 payUrl，跳转按钮就变成空的。 */
    return { ok: true, data: { order: shapeOrder(order, { admin: isAdmin(req.user) }), pay: payView(order) } };
  });

  // ===== 5.2 沙箱支付 =====
  fastify.post('/orders/:orderNo/simulate', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const order = findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在，检查一下链接');
    if (order.user_id !== req.user.id && !isAdmin(req.user)) {
      return fail(reply, 403, 'FORBIDDEN', null, '只能支付自己的订单');
    }
    if (!sandboxOn()) {
      return fail(reply, 403, 'SANDBOX_OFF', null, '沙箱支付已关闭，请走真实支付渠道');
    }

    const res = grantOrder(order, 'user');
    if (!res.ok) {
      const fresh = res.order || findOrder(order.order_no);
      if (res.code === 'DOWNGRADE_NOT_ALLOWED') {
        return fail(reply, 409, 'DOWNGRADE_NOT_ALLOWED', null, '高等级到期后自然回落，不支持主动降级');
      }
      // 已经付过 / 已经关闭：把当前真实状态回给前端，不假装成功也不重复授予
      return { ok: true, data: { order: shapeOrder(fresh, { admin: false }), member: memberView(order.user_id) } };
    }
    return { ok: true, data: { order: shapeOrder(res.order, { admin: false }), member: res.member } };
  });

  // ===== 5.2 关闭未支付订单 =====
  fastify.post('/orders/:orderNo/close', { preHandler: requireAuth }, async (req, reply) => {
    const order = findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在，检查一下链接');
    if (order.user_id !== req.user.id && !isAdmin(req.user)) {
      return fail(reply, 403, 'FORBIDDEN', null, '只能关闭自己的订单');
    }
    if (order.status !== 'pending') {
      return fail(reply, 409, 'ORDER_STATE', null, '只有待支付的订单能关闭');
    }

    const ts = now();
    const changed = db.prepare("UPDATE member_orders SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'pending'")
      .run(ts, order.id).changes;
    if (changed === 1) {
      db.prepare('INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
        " VALUES (?, ?, 'close', ?, 0, 0, ?, '', ?)")
        .run(order.user_id, order.order_no, order.tier, 'user', ts);
    }
    return { ok: true, data: { order: shapeOrder(findOrder(order.order_no), { admin: false }) } };
  });

  /* 人工转账：用户自报已付款。
     为什么只写 note、不改 status：状态只能由「钱真的到账」来推动。
     让用户一句话把自己置成 paid，等于给所有人一个免费会员接口。
     所以这里只追加一条「付款方」登记，管理员在后台核对流水后走 mark-paid。
     note 里带时间戳，是给后台对账时判断「这条登记还有没有效」用的。 */
  fastify.post('/orders/:orderNo/report-paid', { preHandler: requireAuth }, async (req, reply) => {
    const order = findOrder(req.params.orderNo);
    if (!order) return fail(reply, 404, 'ORDER_NOT_FOUND', null, '订单不存在，检查一下链接');
    if (order.user_id !== req.user.id) {
      return fail(reply, 403, 'FORBIDDEN', null, '只能登记自己的订单');
    }
    if (!OFFSITE_CHANNELS[order.channel]) {
      return fail(reply, 409, 'NOT_MANUAL', null, '这笔订单不是站外付款渠道，付完会自动到账');
    }
    if (order.status !== 'pending') {
      return fail(reply, 409, 'ORDER_STATE', null, '这笔订单已经处理过了，不用再登记');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payer = String(body.payer == null ? '' : body.payer).trim().slice(0, 80);
    const remark = String(body.remark == null ? '' : body.remark).trim().slice(0, 120);
    if (!payer) return fail(reply, 400, 'BAD_PAYER', null, '填一下付款时的昵称或订单尾号，方便对账');

    const ts = now();
    const d = new Date(ts * 1000);
    const stamp = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    const line = '[用户自报已付 ' + stamp + '] 付款方：' + payer + (remark ? ' · ' + remark : '');
    // 连点两下不要留两行一样的：同一分钟内、同一付款方的重复登记直接忽略。
    // 只比对时间戳里的分钟段，秒级差异算作重复 —— 用户连点间隔通常 <5s。
    const prevLines = String(order.note || '').split('\n').filter(Boolean);
    const last = prevLines.length ? prevLines[prevLines.length - 1] : '';
    const sameMinute = last.slice(0, 18) === line.slice(0, 18);
    const sameTail = last.slice(last.indexOf(']')) === line.slice(line.indexOf(']'));
    if (sameMinute && sameTail) {
      return { ok: true, data: { order: shapeOrder(order, { admin: false }), duplicate: true } };
    }
    const next = ((order.note ? order.note + '\n' : '') + line).slice(0, 2000);

    db.prepare('UPDATE member_orders SET note = ? WHERE id = ? AND status = ?')
      .run(next, order.id, 'pending');

    return { ok: true, data: { order: shapeOrder(findOrder(order.order_no), { admin: false }) } };
  });

  // ===== 5.2 赞助者墙匿名开关 =====
  fastify.post('/me/visibility', { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.show !== 'boolean') {
      return fail(reply, 400, 'BAD_SHOW', null, 'show 必须是 true 或 false');
    }
    const sub = readSub(req.user.id);
    if (!sub || sub.tier === FREE_TIER) {
      // 契约没定义「非会员改匿名」，这里按「没有赞助记录」处理，不凭空造一条 free 订阅
      return fail(reply, 409, 'NOT_MEMBER', null, '还没有赞助记录，开通后就能设置是否匿名');
    }
    const showName = body.show ? 1 : 0;
    db.prepare('UPDATE member_subs SET show_name = ?, updated_at = ? WHERE user_id = ?')
      .run(showName, now(), req.user.id);
    return { ok: true, data: { showName: showName } };
  });
}

module.exports = routes;
/* 后台路由复用同一套领域逻辑（授予 / 视图 / 文案），避免两处实现走形 */
module.exports.TIERS = TIERS;
module.exports.TIER_ORDER = TIER_ORDER;
module.exports.TIER_RANK = TIER_RANK;
module.exports.STATUS_TEXT = STATUS_TEXT;
module.exports.CHANNEL_TEXT = CHANNEL_TEXT;
module.exports.BENEFITS = BENEFITS;
module.exports.tierName = tierName;
module.exports.tierRank = tierRank;
module.exports.amountText = amountText;
module.exports.maskEmail = maskEmail;
module.exports.mapPlan = mapPlan;
module.exports.listPlans = listPlans;
module.exports.readSub = readSub;
module.exports.memberView = memberView;
module.exports.shapeOrder = shapeOrder;
module.exports.findOrder = findOrder;
module.exports.payView = payView;
module.exports.newOrderNo = newOrderNo;
module.exports.grantOrder = grantOrder;
module.exports.sandboxOn = sandboxOn;
module.exports.goalCents = goalCents;
module.exports.startOfDay = startOfDay;
module.exports.monthStart = monthStart;
module.exports.pad2 = pad2;
module.exports.ORDER_TTL = ORDER_TTL;
