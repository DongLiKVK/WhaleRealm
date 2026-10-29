/**
 * 会员赞助 · 演示数据
 * 用法：
 *   node scripts/seed-membership.js            # 已有种子数据则跳过（幂等）
 *   node scripts/seed-membership.js --reset    # 清空 member_orders / member_subs / member_events 后重灌
 *
 * 目标（契约与验收口径）：
 *   - 近 60 天约 40 笔订单：paid 24 / refunded 4 / pending 4 / closed 8（60/10/10/20）
 *   - 四档分布合理，渠道覆盖微信/支付宝
 *   - member_subs 至少 5 个 active，覆盖 diamond / master / grandmaster / hunt
 *   - 其中 1 个 hunt、2 个 7 天内到期、1 个已过期
 *
 * 幂等策略：所有种子订单带 provider_txn='seed-membership-N' 记号。
 *   不带 --reset 时只要发现记号就整体跳过 —— 这样隔天再跑也不会因为订单号里的日期
 *   变了而重复灌数据；INSERT OR IGNORE 只是第二道保险。
 *   带 --reset 才会清空三张会员表（计划、设置保留，后台改过的价格不会被冲掉）。
 *
 * 演示数据的账本口径：anchor 订单就是当前订阅的来源（member_subs.order_no），
 *   其余 paid 订单都排在 anchor 周期之前或已过期，不参与当前到期时间计算。
 *   这样 /me、后台退款回滚看到的到期时间与订单历史不会互相矛盾。
 */
'use strict';

const { db, now } = require('../src/db');

const RESET = process.argv.indexOf('--reset') >= 0;
const DAY = 86400;
const T0 = now();

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function ymd(ts) {
  const d = new Date(ts * 1000);
  return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

function hex6(n) {
  let s = n.toString(16).toUpperCase();
  while (s.length < 6) s = '0' + s;
  return s.slice(-6);
}

/* 固定种子的 LCG：每次执行生成同一批数据，便于截图/对比，也避免 Math.random
   让「重跑一次」出现无法复现的差异。 */
let rndState = 20261023;
function rnd() {
  rndState = (rndState * 1103515245 + 12345) % 2147483648;
  return rndState / 2147483648;
}
function randInt(a, b) {
  return a + Math.floor(rnd() * (b - a + 1));
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

const PLANS = db.prepare('SELECT * FROM member_plans').all();
function planOf(tier, cycle) {
  return PLANS.find((p) => p.tier === tier && p.cycle === cycle) || null;
}
if (!PLANS.length) {
  console.error('[seed] member_plans 为空，先启动一次服务让 db.js 写入 8 条计划');
  process.exit(1);
}

/* ---------- 沙箱支付开关 ----------
   schema 里的默认值已改成 0（生产误开 = 0 元白嫖会员），演示站要能点「模拟支付」
   就必须显式打开。放在幂等闸门之前：即使数据已存在、下面直接跳过，
   每次执行 seed 也能保证本地演示的 simulate 是可用的。 */
db.prepare(
  "INSERT INTO member_settings (key, value, updated_at) VALUES ('sandbox', '1', ?) " +
  "ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at"
).run(T0);
console.log('[seed] 沙箱支付已开启（member_settings.sandbox=1）');

/* ---------- 幂等闸门 ---------- */
const seeded = db.prepare("SELECT COUNT(*) AS n FROM member_orders WHERE provider_txn LIKE 'seed-membership-%'").get().n;
if (seeded > 0 && !RESET) {
  console.log('[seed] 已存在 ' + seeded + ' 笔会员种子订单，跳过。需要重灌请加 --reset');
  process.exit(0);
}

if (RESET) {
  const reset = db.transaction(() => {
    db.prepare('DELETE FROM member_events').run();
    db.prepare('DELETE FROM member_orders').run();
    db.prepare('DELETE FROM member_subs').run();
  });
  reset();
  console.log('[seed] --reset：member_orders / member_subs / member_events 已清空');
}

/* ---------- 当前订阅（anchor） ----------
   paidDaysAgo 决定剩余天数：月付 30 天。
   demo3 = 24 天前付 → 6 天后到期（7 天内）
   demo5 = 27 天前付 → 3 天后到期（7 天内）
   demo6 = 45 天前付 → 已过期 15 天（读取时 /me 会回落 free）
   demo4 的 show_name=0，用来验证赞助者墙的「匿名鲸友」。 */
const ANCHORS = [
  { userId: 1, tier: 'hunt',        cycle: 'month', paidDaysAgo: 10, showName: 1, autoRenew: 1, note: '猎杀席位 · 演示' },
  { userId: 2, tier: 'grandmaster', cycle: 'month', paidDaysAgo: 5,  showName: 1, autoRenew: 1, note: '' },
  { userId: 3, tier: 'master',      cycle: 'month', paidDaysAgo: 24, showName: 1, autoRenew: 0, note: '版主支持一下' },
  { userId: 4, tier: 'diamond',     cycle: 'month', paidDaysAgo: 2,  showName: 0, autoRenew: 1, note: '' },
  { userId: 5, tier: 'grandmaster', cycle: 'month', paidDaysAgo: 27, showName: 1, autoRenew: 0, note: '' },
  { userId: 6, tier: 'diamond',     cycle: 'month', paidDaysAgo: 45, showName: 1, autoRenew: 0, note: '已过期样本' }
];

const orders = [];
let seq = 0;

function addOrder(o) {
  const plan = planOf(o.tier, o.cycle);
  if (!plan) throw new Error('缺少计划：' + o.tier + '/' + o.cycle);
  seq += 1;
  const rec = {
    orderNo: 'JY' + ymd(o.createdAt) + hex6(0x5EED00 + seq),
    userId: o.userId,
    planId: plan.id,
    tier: o.tier,
    cycle: o.cycle,
    durationDays: plan.duration_days,
    amountCents: o.amountCents != null ? o.amountCents : plan.price_cents,
    channel: o.channel || (rnd() < 0.62 ? 'wechat' : 'alipay'),
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt || 0,
    expiresAt: o.expiresAt || o.createdAt + 1800,
    closedAt: o.closedAt || 0,
    refundedAt: o.refundedAt || 0,
    refundCents: o.refundCents || 0,
    note: o.note || '',
    providerTxn: 'seed-membership-' + seq,
    anchorUserId: o.anchorUserId || 0
  };
  if (rec.status === 'paid' || rec.status === 'refunded') {
    rec.paidAt = rec.paidAt || rec.createdAt + 120;
  }
  orders.push(rec);
  return rec;
}

/* 1) 6 笔 anchor：就是当前订阅的来源订单 */
for (const a of ANCHORS) {
  const plan = planOf(a.tier, a.cycle);
  const createdAt = T0 - a.paidDaysAgo * DAY - randInt(0, 6 * 3600);
  const paidAt = createdAt + randInt(90, 900);
  addOrder({
    userId: a.userId,
    tier: a.tier,
    cycle: a.cycle,
    status: 'paid',
    createdAt: createdAt,
    paidAt: paidAt,
    expiresAt: createdAt + 1800,
    note: a.note,
    anchorUserId: a.userId
  });
}

/* 2) 18 笔历史 paid：给四档做量的分布。
   anchor 用户的额外订单必须早于「当前周期开始 - 一个周期」，否则会与
   member_subs.expires_at 对不上；放不下就落到 demo7/demo8 的历史订单（已过期）。 */
const TIER_POOL = ['diamond', 'diamond', 'diamond', 'master', 'master', 'grandmaster', 'hunt'];
for (let i = 0; i < 18; i++) {
  const tier = pick(TIER_POOL);
  const cycle = rnd() < 0.15 ? 'year' : 'month';
  const plan = planOf(tier, cycle);
  let userId = randInt(1, 8);
  let minDaysAgo = 1;
  const anchor = ANCHORS.find((a) => a.userId === userId);

  if (anchor) {
    minDaysAgo = anchor.paidDaysAgo + plan.duration_days + 1;
    if (minDaysAgo > 58) {
      userId = rnd() < 0.5 ? 7 : 8;
      minDaysAgo = 41;
    }
  } else {
    // demo7/demo8 没有 member_subs 行，历史订单必须已经过期，避免「付过钱却查不到会员」
    minDaysAgo = 41;
  }

  const daysAgo = randInt(minDaysAgo, 59);
  const createdAt = T0 - daysAgo * DAY - randInt(0, 20 * 3600);
  addOrder({
    userId: userId,
    tier: tier,
    cycle: cycle,
    status: 'paid',
    createdAt: createdAt,
    paidAt: createdAt + randInt(60, 1800),
    expiresAt: createdAt + 1800
  });
}

/* 3) 4 笔已退款：都发生在过去，退款不指向当前订阅来源 */
const refundUsers = [7, 8, 1, 2];
for (let i = 0; i < refundUsers.length; i++) {
  const tier = pick(['diamond', 'master', 'grandmaster']);
  const daysAgo = randInt(30, 55);
  const createdAt = T0 - daysAgo * DAY - randInt(0, 18 * 3600);
  const paidAt = createdAt + randInt(120, 1200);
  addOrder({
    userId: refundUsers[i],
    tier: tier,
    cycle: 'month',
    status: 'refunded',
    createdAt: createdAt,
    paidAt: paidAt,
    expiresAt: createdAt + 1800,
    refundedAt: paidAt + randInt(1, 4) * DAY,
    refundCents: planOf(tier, 'month').price_cents,
    note: '演示：全额退款'
  });
}

/* 4) 4 笔待支付：全部落在 1800 秒支付窗口内，否则状态应该是 closed 而不是 pending。
   demo2 那笔故意放到 10 分钟前：验证「超过 5 分钟但没过 TTL 仍然复用同一张单」，
   这正是 A-3 修正后的口径（复用窗口 = 支付窗口）。 */
const pendingSpecs = [
  { userId: 8, tier: 'diamond', ago: 180 },
  { userId: 2, tier: 'hunt', ago: 600 },
  { userId: 6, tier: 'master', ago: 900 },
  { userId: 7, tier: 'grandmaster', ago: 1500 }
];
for (const p of pendingSpecs) {
  const createdAt = T0 - p.ago;
  addOrder({
    userId: p.userId,
    tier: p.tier,
    cycle: 'month',
    status: 'pending',
    createdAt: createdAt,
    expiresAt: createdAt + 1800,
    note: '演示：等待支付'
  });
}

/* 5) 8 笔已关闭：下单后 30 分钟没付，系统/用户关闭 */
for (let i = 0; i < 8; i++) {
  const userId = randInt(1, 8);
  const tier = pick(['diamond', 'master', 'grandmaster', 'hunt']);
  const daysAgo = randInt(3, 59);
  const createdAt = T0 - daysAgo * DAY - randInt(0, 22 * 3600);
  addOrder({
    userId: userId,
    tier: tier,
    cycle: rnd() < 0.1 ? 'year' : 'month',
    status: 'closed',
    createdAt: createdAt,
    expiresAt: createdAt + 1800,
    closedAt: createdAt + randInt(1800, 5400),
    note: '超时未支付'
  });
}

/* ---------- 落库 ---------- */
const insertOrder = db.prepare(
  'INSERT OR IGNORE INTO member_orders' +
  ' (order_no, user_id, plan_id, tier, cycle, amount_cents, status, channel, provider_txn,' +
  '  created_at, paid_at, expires_at, closed_at, refunded_at, refund_cents, note, admin_id, client_ip, ua)' +
  ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)'
);
const insertEvent = db.prepare(
  'INSERT INTO member_events (user_id, order_no, kind, tier, days, amount_cents, actor, note, created_at)' +
  ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const eventExists = db.prepare('SELECT 1 AS x FROM member_events WHERE order_no = ? AND kind = ? LIMIT 1');

let insertedOrders = 0;
const write = db.transaction(() => {
  for (const o of orders) {
    const info = insertOrder.run(
      o.orderNo, o.userId, o.planId, o.tier, o.cycle, o.amountCents, o.status, o.channel, o.providerTxn,
      o.createdAt, o.paidAt || null, o.expiresAt, o.closedAt || null, o.refundedAt || null, o.refundCents,
      o.note, '127.0.0.1', 'seed-membership/1.0'
    );
    insertedOrders += info.changes;
  }

  // 事件按时间顺序补：同一用户的第一笔 paid 记 grant，之后记 renew
  const paidByUser = {};
  const sorted = orders.slice().sort((a, b) => a.paidAt - b.paidAt);
  for (const o of sorted) {
    if (o.status === 'paid' && o.paidAt) {
      if (!paidByUser[o.userId]) {
        paidByUser[o.userId] = true;
        if (!eventExists.get(o.orderNo, 'grant')) {
          insertEvent.run(o.userId, o.orderNo, 'grant', o.tier, o.durationDays, o.amountCents, 'system', o.note, o.paidAt);
        }
      } else if (!eventExists.get(o.orderNo, 'renew')) {
        insertEvent.run(o.userId, o.orderNo, 'renew', o.tier, o.durationDays, o.amountCents, 'system', o.note, o.paidAt);
      }
    } else if (o.status === 'refunded' && o.refundedAt) {
      if (!eventExists.get(o.orderNo, 'refund')) {
        // 这笔退款没有回滚当前订阅（不是来源订单），所以天数记 0
        insertEvent.run(o.userId, o.orderNo, 'refund', o.tier, 0, o.refundCents, 'admin:3', o.note, o.refundedAt);
      }
    } else if (o.status === 'closed' && o.closedAt) {
      if (!eventExists.get(o.orderNo, 'close')) {
        insertEvent.run(o.userId, o.orderNo, 'close', o.tier, 0, 0, 'system', o.note, o.closedAt);
      }
    }
  }
});
write();
if (insertedOrders !== orders.length) {
  console.warn('[seed] 订单写入被忽略：期望 ' + orders.length + ' 笔，实际 ' + insertedOrders + ' 笔（检查 order_no 唯一性与 NOT NULL 列）');
}

/* ---------- 同步 member_subs ---------- */
const findSub = db.prepare('SELECT * FROM member_subs WHERE user_id = ?');
const upsertSub = db.prepare(
  'INSERT INTO member_subs (user_id, tier, started_at, expires_at, order_no, auto_renew, show_name, note, updated_at)' +
  ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)' +
  ' ON CONFLICT(user_id) DO UPDATE SET tier = excluded.tier, started_at = excluded.started_at,' +
  ' expires_at = excluded.expires_at, order_no = excluded.order_no, auto_renew = excluded.auto_renew,' +
  ' show_name = excluded.show_name, note = excluded.note, updated_at = excluded.updated_at'
);

const seedOrderNos = new Set(orders.map((o) => o.orderNo));
let active = 0;
let expiring7 = 0;
let expired = 0;

const syncSubs = db.transaction(() => {
  for (const a of ANCHORS) {
    const anchorOrder = orders.find((o) => o.anchorUserId === a.userId);
    if (!anchorOrder) continue;
    const existed = findSub.get(a.userId);
    // 不动真实用户：只有空行或来源订单本身就是种子订单时才写
    if (existed && !seedOrderNos.has(existed.order_no)) continue;

    const startedAt = db.prepare(
      "SELECT MIN(paid_at) AS t FROM member_orders WHERE user_id = ? AND status = 'paid' AND paid_at IS NOT NULL"
    ).get(a.userId).t || anchorOrder.paidAt;
    const expiresAt = anchorOrder.paidAt + anchorOrder.durationDays * DAY;

    upsertSub.run(
      a.userId, a.tier, startedAt, expiresAt, anchorOrder.orderNo,
      a.autoRenew, a.showName, a.note, T0
    );

    if (expiresAt > T0) {
      active += 1;
      if (expiresAt - T0 <= 7 * DAY) expiring7 += 1;
    } else {
      expired += 1;
    }
  }
});
syncSubs();

/* ---------- 汇总 ---------- */
const counts = { paid: 0, refunded: 0, pending: 0, closed: 0 };
for (const o of orders) counts[o.status] += 1;

console.log('[seed] 会员演示数据完成：订单 ' + orders.length + ' 笔' +
  '（paid ' + counts.paid + ' / refunded ' + counts.refunded +
  ' / pending ' + counts.pending + ' / closed ' + counts.closed + '）');
console.log('[seed] 订阅：active ' + active + ' 个（7 天内到期 ' + expiring7 + ' 个）、已过期 ' + expired + ' 个；' +
  'hunt 1 个，四档全覆盖；demo4 匿名展示');
console.log('[seed] 订单覆盖近 60 天，金额为整数分；重复执行请加 --reset');
