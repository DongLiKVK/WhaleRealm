/**
 * 举报路由（公开提交）
 *
 * 为什么要有这条路由：站内原本四处「举报」按钮全部是 toast 演示，没有一条会真的到达人手里。
 * 对一个把 6700+ 个第三方仓库索引成条目库的站来说这是最硬的风险点 —— 侵权 / 恶意代码 /
 * 信息失实的通知没有可用的接收通道，等于把「明知」这件事写在了脸上。现在把通道补上：
 * 任何人（含未登录）都能提交，登录用户的举报会带上 user_id 便于回访。
 *
 * 三件必须守住的事：
 *  1. 目标必须真实存在。否则举报表会被垃圾数据灌满，真正该被处理的举报淹没在噪声里。
 *     所以按 target_type 各自查一次存在性；目标已不存在时回 404，而不是静默收下。
 *  2. detail / contact 是自由文本，长度上限在 schema 与代码两侧都卡死（1000 / 120），
 *     并且永远不参与任何 HTML 输出 —— 前台只回一个举报编号，正文只在后台可见。
 *  3. 限流按 IP：5 次 / 10 分钟。举报是低频动作，正常用户不会十分钟里报五个不同的东西；
 *     而脚本会把这条路由当成免费的写入口。超限走统一的 rateLimitError，前端能看到可读原因。
 */
'use strict';

const { db, now } = require('../db');
const { optionalAuth } = require('../auth');
const { fail, rateLimitError } = require('../http');

/** 举报对象白名单：顺序即后台筛选下拉的顺序 */
const TARGET_TYPES = ['plugin', 'post', 'thread', 'comment', 'user'];

/** 举报理由白名单：copyright 是最要紧的一类（侵权通知需要留档），malware 次之 */
const REASONS = ['copyright', 'malware', 'wrong', 'other'];

function clip(v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > max ? s.slice(0, max) : s;
}

/** 目标存在性校验。返回布尔值：true = 可以举报。
 *  逐类型写死表名而不是拼字符串：target_type 来自请求体，拼表名等于把 SQL 注入的口子留着。 */
function targetExists(type, id) {
  try {
    if (type === 'plugin') return !!db.prepare('SELECT 1 FROM plugins WHERE id = ?').get(id);
    if (type === 'post') return !!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id);
    if (type === 'thread') return !!db.prepare('SELECT 1 FROM threads WHERE id = ?').get(id);
    if (type === 'comment') return !!db.prepare('SELECT 1 FROM comments WHERE id = ?').get(id);
    if (type === 'user') return !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id);
  } catch {
    return false;
  }
  return false;
}

/* 同一 IP 对同一目标重复提交的抑制窗口（秒）。
   不直接拒绝：重复提交往往说明「上一次好像没成功」，硬拒会让人以为举报失效；
   这里返回已有编号，前端表现与首次提交完全一致。 */
const DUP_WINDOW = 600;

async function routes(fastify) {
  fastify.post('/reports', {
    preHandler: optionalAuth,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes', errorResponseBuilder: rateLimitError } }
  }, async (req, reply) => {
    const body = req.body || {};

    const type = String(body.targetType || '').trim();
    if (TARGET_TYPES.indexOf(type) < 0) {
      return fail(reply, 400, 'BAD_REQUEST', null, '举报对象的类型不正确');
    }

    const id = Number(body.targetId);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
      return fail(reply, 400, 'BAD_REQUEST', null, '举报对象的编号不正确');
    }

    const reason = String(body.reason || '').trim();
    if (REASONS.indexOf(reason) < 0) {
      return fail(reply, 400, 'BAD_REQUEST', null, '请选择一个举报理由');
    }

    if (!targetExists(type, id)) {
      return fail(reply, 404, 'NOT_FOUND', null, '要举报的内容已经不在了');
    }

    const detail = clip(body.detail, 1000);
    const contact = clip(body.contact, 120);
    const uid = req.user ? req.user.id : 0;
    const ip = String(req.ip || '').slice(0, 64);
    const at = now();

    /* 同 IP + 同目标 10 分钟内已有记录 → 复用那条编号，不再插新行。
       为什么按 IP 而不按用户：匿名举报没有 uid，按 IP 是唯一能用的去重键；
       而登录用户换 IP 重报同一目标本来也该被合并，所以两种情况走同一判据。 */
    const dupSql = [
      'SELECT id FROM reports',
      'WHERE target_type = ? AND target_id = ? AND ip = ? AND created_at > ?',
      'ORDER BY id DESC LIMIT 1'
    ].join(' ');
    const dup = db.prepare(dupSql).get(type, id, ip, at - DUP_WINDOW);

    if (dup) {
      return { ok: true, data: { id: dup.id, duplicate: true } };
    }

    const insSql = [
      'INSERT INTO reports',
      '(target_type, target_id, reason, detail, contact, user_id, ip, status, created_at)',
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)"
    ].join(' ');
    const info = db.prepare(insSql).run(type, id, reason, detail, contact, uid, ip, at);

    return { ok: true, data: { id: Number(info.lastInsertRowid), duplicate: false } };
  });
}

module.exports = routes;
module.exports.TARGET_TYPES = TARGET_TYPES;
module.exports.REASONS = REASONS;
module.exports.targetExists = targetExists;
