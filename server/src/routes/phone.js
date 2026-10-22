/**
 * 手机号认证路由（挂在 /api/auth/phone）
 * - POST /send    发验证码（登录后才行，避免被拿来刷别人手机）
 * - POST /verify  校验验证码并绑定
 * - GET  /state   当前绑定状态（号码永远打码）
 *
 * 设计取舍：
 * 1) 码只活 300 秒、只认最新一条（发新码就删旧码），错 5 次直接作废。
 * 2) 库里存 6 位明文码：它是短 TTL 的一次性凭据，做哈希对「库泄露」收益很低，
 *    却会让「码到底发出去没」的工单无从排查；真正要防的是撞码，靠 tries + TTL。
 * 3) 默认不回显码。SMS_DEV=1 时才在响应里带 devCode，供本地联调；
 *    接真实通道的位置就在下面 marked 的地方，换成 provider 调用即可。
 */
'use strict';

const crypto = require('crypto');
const { db, now } = require('../db');
const { requireAuth } = require('../auth');
const { fail, rateLimitError, validPhone, maskPhone } = require('../http');

const CODE_TTL = 300;    // 验证码有效期（秒）
const COOLDOWN = 60;     // 前端按钮倒计时（秒）
const CODE_TRIES = 5;    // 同一个码最多试错次数
const CODE_LEN = 6;
const CODE_RE = /^\d{6}$/;

/* ---------- 语句缓存 ---------- */
/* 待验码按 (phone, user_id) 唯一，不按 phone 唯一。
   为什么：若按号码唯一，任何人只要对某个号码发一次码，就持有了一条 user_id=自己的待验行；
   真正的机主后来用自己的账号验证时，会撞上「这条码不是你的」而被判错码 —— 等于谁都能
   把别人的号码锁住 5 分钟（可无限续期）。按 (phone, user_id) 分开存，各验各的，
   而码只会发到机主手机上，谁也抢不走。 */
const STMT = {
  deleteCodesByPhone: db.prepare('DELETE FROM phone_codes WHERE phone = ? AND user_id = ?'),
  deleteExpiredCodes: db.prepare('DELETE FROM phone_codes WHERE expires_at <= ?'),
  insertCode: db.prepare('INSERT INTO phone_codes (code, phone, user_id, tries, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)'),
  codeByPhone: db.prepare('SELECT * FROM phone_codes WHERE phone = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
  bumpTries: db.prepare('UPDATE phone_codes SET tries = tries + 1 WHERE phone = ? AND user_id = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByPhone: db.prepare("SELECT * FROM users WHERE phone = ? AND phone != '' LIMIT 1"),
  bindPhone: db.prepare('UPDATE users SET phone = ?, phone_verified = 1, phone_at = ?, updated_at = ? WHERE id = ?')
};

/* ---------- 库级兜底：一个手机号只能绑一个账号 ----------
   应用层在 send/verify 里都查了 userByPhone，但那是「先查后写」：两个账号几乎同时
   验证同一个号码时，两边都可能查到「没人占用」然后各自绑定。号码=账号的找回凭据，
   一码两号是真实事故，所以这里再加一条部分唯一索引（phone 为空的行不参与，未绑定的
   用户不会有冲突）。同样放 try/catch、同样不进 schema.sql，理由见下面那段注释。 */
(function enforceOnePhonePerUser() {
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone != ''");
  } catch (err) {
    console.warn('[phone] users(phone) 唯一索引建立失败（存量库可能有重复号码），绑定唯一性仅由应用层保证：' + err.message);
  }
})();

/* ---------- 库级兜底：(phone, user_id) 唯一 ----------
   应用层靠事务内「先删后插」保证一个账号在一个号码上只有一条待验码；这里再加一条
   数据库唯一索引。刻意不写在 schema.sql：那是启动时整段 exec 的，存量库若已有重复行
   会让服务直接起不来。这里失败只 warn —— 约束退化成「仅由应用层保证」，不影响可用性。 */
(function enforceOneCodePerUser() {
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_codes_one_per_user ON phone_codes(phone, user_id)');
  } catch {
    try {
      db.exec('DELETE FROM phone_codes WHERE rowid NOT IN (SELECT MAX(rowid) FROM phone_codes GROUP BY phone, user_id)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_codes_one_per_user ON phone_codes(phone, user_id)');
    } catch (err) {
      console.warn('[phone] phone_codes(phone,user_id) 唯一索引建立失败，待验码唯一性仅由应用层保证：' + err.message);
    }
  }
})();

/** 发码事务：先清「这个账号在这个号码上」的旧码、顺手清全表过期码，再插新码 */
const TXN_SEND = db.transaction((phone, code, userId, ts, expiresAt) => {
  STMT.deleteCodesByPhone.run(phone, userId);
  STMT.deleteExpiredCodes.run(ts);
  STMT.insertCode.run(code, phone, userId, expiresAt, ts);
});

/** 定长比较验证码，别用 === 泄露前缀时序 */
function sameCode(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** 6 位数字码；不用 Math.random —— 它不是密码学随机源 */
function newCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** 取 body 里的字符串字段，畸形 body 一律当空串，绝不抛 500 */
function field(body, key) {
  if (!body || typeof body !== 'object') return '';
  const v = body[key];
  return v == null ? '' : String(v).trim();
}

async function routes(fastify) {
  // ---------------- 发送验证码 ----------------
  // 不挂 body schema：号码不合法要回我们自己的 BAD_PHONE，不能被 fastify 的 400 BAD_REQUEST 抢先
  fastify.post('/send', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const phone = field(req.body, 'phone');
    if (!validPhone(phone)) return fail(reply, 400, 'BAD_PHONE');

    // 号码已经绑在别人账号上：不给他发码，否则等于帮人试探「这个号是不是被注册过」
    const owner = STMT.userByPhone.get(phone);
    if (owner && owner.id !== req.user.id) return fail(reply, 409, 'PHONE_TAKEN');

    const ts = now();
    const expiresAt = ts + CODE_TTL;
    const code = newCode();
    TXN_SEND(phone, code, req.user.id, ts, expiresAt);

    // >>> 接真实短信通道就在这里：await sms.send(phone, code, 'verify') <<<
    // 失败要回滚上面这次插入并返回 500，别把「没发出去」当成「已发送」。
    if (process.env.SMS_DEV === '1') {
      fastify.log.warn({ phone: maskPhone(phone) }, '[phone] devCode 回显（SMS_DEV=1）');
    } else {
      fastify.log.info({ phone: maskPhone(phone) }, '[phone] 验证码已生成，等待接入短信通道');
    }

    /* 这条码真的送到用户手机上了吗？只有 SMS_DEV=1（本地联调、码回显在本页）才算「可见」，
       没接通道时必须如实告诉前端 delivered=false —— 否则页面提示「已发送」，用户等一条永远不会来的短信。 */
    const devMode = process.env.SMS_DEV === '1';
    const data = {
      // phone 是回显请求方自己刚提交的号码，不是从库里读出来的，不构成越权泄露；
      // 另给一份打码值，前端想直接贴到界面上时用这个。
      phone,
      phoneMasked: maskPhone(phone),
      ttl: CODE_TTL,
      cooldown: COOLDOWN,
      delivered: devMode,
      channel: devMode ? 'dev' : 'none'
    };
    if (devMode) data.devCode = code;
    return { ok: true, data };
  });

  // ---------------- 校验验证码 ----------------
  fastify.post('/verify', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const phone = field(req.body, 'phone');
    const code = field(req.body, 'code');
    if (!validPhone(phone)) return fail(reply, 400, 'BAD_PHONE');
    if (!CODE_RE.test(code)) return fail(reply, 400, 'CODE_WRONG');

    // 只查「本账号」申请的码：别人对这个号发过的码与我无关，既不挡我，我也偷不到
    const row = STMT.codeByPhone.get(phone, req.user.id);
    if (!row) return fail(reply, 400, 'CODE_EXPIRED');

    if (row.expires_at <= now()) {
      STMT.deleteCodesByPhone.run(phone, req.user.id);
      return fail(reply, 400, 'CODE_EXPIRED');
    }
    if (row.tries >= CODE_TRIES) {
      STMT.deleteCodesByPhone.run(phone, req.user.id);
      return fail(reply, 400, 'CODE_TOO_MANY');
    }
    if (!sameCode(String(row.code || ''), code)) {
      STMT.bumpTries.run(phone, req.user.id);
      // 已经用掉最后一次机会：顺手删行，下一条必须是新码
      if (row.tries + 1 >= CODE_TRIES) STMT.deleteCodesByPhone.run(phone, req.user.id);
      return fail(reply, 400, 'CODE_WRONG');
    }

    // 号码已被别的账号占用：验证通过了也不能抢
    const owner = STMT.userByPhone.get(phone);
    if (owner && owner.id !== req.user.id) {
      STMT.deleteCodesByPhone.run(phone, req.user.id);
      return fail(reply, 409, 'PHONE_TAKEN');
    }

    const ts = now();
    try {
      STMT.bindPhone.run(phone, ts, ts, req.user.id);
    } catch (err) {
      // 上面那次 userByPhone 查询与这次写入之间有窗口：并发下靠唯一索引兜住，
      // 把它翻译成和串行路径完全一样的 409 PHONE_TAKEN，别把 SQLite 的原始错误抛成 500
      if (/UNIQUE|CONSTRAINT/i.test(String(err && err.message))) {
        STMT.deleteCodesByPhone.run(phone, req.user.id);
        return fail(reply, 409, 'PHONE_TAKEN');
      }
      throw err;
    }
    STMT.deleteCodesByPhone.run(phone, req.user.id);

    return { ok: true, data: { phone: maskPhone(phone), verified: true, verifiedAt: ts } };
  });

  // ---------------- 绑定状态 ----------------
  fastify.get('/state', { preHandler: requireAuth }, async (req) => {
    const row = STMT.userById.get(req.user.id) || {};
    return {
      ok: true,
      data: {
        phone: maskPhone(typeof row.phone === 'string' ? row.phone : ''),
        verified: row.phone_verified === 1,
        verifiedAt: row.phone_at || 0
      }
    };
  });
}

/**
 * 「必须已验证手机号」的 preHandler —— 给后续需要强制闸门的业务路由挂上：
 *   fastify.post('/publish', { preHandler: [requireAuth, requirePhone] }, handler)
 * 本轮不挂到 posts/comments 上：那会让存量用户直接被锁死，属于产品决策，交给 Lead 定。
 */
async function requirePhone(req, reply) {
  const row = req.user && req.user.id ? STMT.userById.get(req.user.id) : null;
  if (!row) return fail(reply, 401, 'NOT_AUTHED');
  // 403 而不是 401：会话是好的，是「资格」没到，前端据此弹手机号认证弹窗而不是跳登录页
  if (row.phone_verified !== 1) return fail(reply, 403, 'PHONE_REQUIRED');
  // 放行必须显式 return undefined：fastify 的 async hook 一旦返回非 undefined 的值，
  // 会把它当成响应载荷直接把请求结束掉 —— 返回 reply 等于把后续 handler 掐死。
  return undefined;
}

module.exports = routes;
module.exports.requirePhone = requirePhone;
module.exports.CODE_TTL = CODE_TTL;
module.exports.COOLDOWN = COOLDOWN;
module.exports.CODE_TRIES = CODE_TRIES;
module.exports.CODE_LEN = CODE_LEN;
