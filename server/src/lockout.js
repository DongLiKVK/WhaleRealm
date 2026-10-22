/**
 * 登录失败锁定（按归一化邮箱）
 *
 * 为什么需要它：@fastify/rate-limit 只按 IP 计（/login 10 次 / 10 分钟）。攻击者换
 * 代理池、或者用一台有几千个 IP 的机器，就能把单一账号的爆破次数放大到无上限。
 * IP 限流挡的是「单点猛攻」，账号锁定挡的是「分布式慢速爆破」，两者互补。
 *
 * 为什么按邮箱而不是按 IP：同一出口 NAT 后面可能有几百个正常用户，按 IP 锁会把
 * 他们一起锁死；邮箱是爆破的最终目标，锁它才命中。
 *
 * 已知取舍（DoS 面）：任何人只要知道你的邮箱，就能故意错 8 次把你锁 10 分钟。
 *   - 缓解 1：首次只锁 10 分钟，不是 30 分钟/永久。
 *   - 缓解 2：锁定只拦密码通道，第三方登录与已签发的会话不受影响（登录态照常可用）。
 *   - 缓解 3：nginx 侧还有一层 401 计数 jail，真正在打的 IP 会被 iptables 封掉。
 *   要完全避免这个面，只能用「滑动窗口 + 验证码」而非硬锁定；本项目的权衡是优先
 *   保证「账号不被暴力破解」，接受短时不可登录。
 *
 * 计数语义：
 *   - 15 分钟窗口内累计 8 次失败 → 锁定，跨度 = 10 分钟 × 2^(第几次锁-1)，上限 6 小时。
 *   - 触发锁定时窗口清零：用户解锁后仍有完整 8 次机会，不会被上一次的账拖累。
 *   - 登录成功即删行，正常用户永远看不到这张表。
 */
'use strict';

const { db, now } = require('./db');

const WINDOW = 900;          // 统计窗：15 分钟
const MAX_FAILS = 8;         // 窗内失败阈值
const BASE_LOCK = 600;       // 首次锁定 10 分钟
const MAX_LOCK = 21600;      // 最长 6 小时
const KEEP = 7 * 86400;      // 记录保留 7 天后清理

const STMT = {
  get: db.prepare('SELECT * FROM auth_fails WHERE email = ?'),
  put: db.prepare(`INSERT INTO auth_fails (email, fails, first_at, last_at, locked_until, lock_count, last_ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      fails = excluded.fails,
      first_at = excluded.first_at,
      last_at = excluded.last_at,
      locked_until = excluded.locked_until,
      lock_count = excluded.lock_count,
      last_ip = excluded.last_ip`),
  del: db.prepare('DELETE FROM auth_fails WHERE email = ?'),
  prune: db.prepare('DELETE FROM auth_fails WHERE last_at < ? AND locked_until < ?')
};

/**
 * 查询某个邮箱当前的锁定状态。
 * 返回 { locked, fails, retryAfter, lockCount }；retryAfter 单位是秒。
 * 窗口外的失败次数按 0 处理（惰性过期，不依赖定时任务）。
 */
function state(email) {
  const r = STMT.get.get(email);
  const ts = now();
  if (!r) return { locked: false, fails: 0, retryAfter: 0, lockCount: 0, lockedUntil: 0 };
  if (r.locked_until > ts) {
    return {
      locked: true,
      fails: r.fails,
      retryAfter: r.locked_until - ts,
      lockCount: r.lock_count,
      lockedUntil: r.locked_until
    };
  }
  const fails = r.last_at >= ts - WINDOW ? r.fails : 0;
  return { locked: false, fails, retryAfter: 0, lockCount: r.lock_count, lockedUntil: 0 };
}

/**
 * 记一次失败。返回记完之后的真实状态（可能刚好触发锁定）。
 * ip 只留作事后取证，不参与判定。
 */
function noteFail(email, ip) {
  const ts = now();
  const r = STMT.get.get(email);
  const fresh = !r || r.last_at < ts - WINDOW;
  const fails = (fresh ? 0 : r.fails) + 1;
  const firstAt = fresh ? ts : r.first_at;
  const prevLocks = r ? r.lock_count : 0;

  if (fails >= MAX_FAILS) {
    const lockCount = prevLocks + 1;
    const span = Math.min(BASE_LOCK * Math.pow(2, lockCount - 1), MAX_LOCK);
    const lockedUntil = ts + span;
    // 触发锁定时把窗口清零：解锁后是完整的 8 次机会
    STMT.put.run(email, 0, ts, ts, lockedUntil, lockCount, String(ip || '').slice(0, 64));
    prune();
    return { locked: true, fails: 0, retryAfter: span, lockCount, lockedUntil };
  }

  STMT.put.run(email, fails, firstAt, ts, 0, prevLocks, String(ip || '').slice(0, 64));
  prune();
  return { locked: false, fails, retryAfter: 0, lockCount: prevLocks, lockedUntil: 0 };
}

/** 登录成功：清掉这个邮箱的全部失败记录 */
function reset(email) {
  return STMT.del.run(email).changes;
}

/** 顺手清理过期行（每次失败时调一次，最多一次全表扫描，行数很小） */
function prune() {
  const ts = now();
  try {
    STMT.prune.run(ts - KEEP, ts);
  } catch {
    /* 清理失败不影响登录主流程 */
  }
}

module.exports = { state, noteFail, reset, prune, WINDOW, MAX_FAILS, BASE_LOCK, MAX_LOCK };