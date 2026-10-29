/**
 * 聊天 WebSocket
 * - 握手时校验 JWT（cookie 或 ?token=），失败直接 4401 关闭
 * - 消息落库到 messages 表，再转发给接收方在线连接
 * - 心跳：30 秒 ping 一次，避免中间代理掐掉空闲连接
 *
 * 注意 @fastify/websocket 10.x 的 handler 签名是 (socket, req)，
 * socket 本身就是 WebSocket 实例；v7 之前的 (conn, req) + conn.socket 已经不适用。
 */
'use strict';

const { db, now, publicUser } = require('../db');
const { requireAuth } = require('../auth');
const { fail } = require('../http');

/** uid -> Set<WebSocket>，支持同一用户多端在线 */
const online = new Map();

function addOnline(uid, sock) {
  if (!online.has(uid)) online.set(uid, new Set());
  online.get(uid).add(sock);
}

function removeOnline(uid, sock) {
  const set = online.get(uid);
  if (!set) return;
  set.delete(sock);
  if (set.size === 0) online.delete(uid);
}

/** 只给 open 状态的连接发；单个坏连接不影响其它 */
function sendTo(uid, payload) {
  const set = online.get(uid);
  if (!set) return 0;
  let n = 0;
  const text = JSON.stringify(payload);
  for (const s of set) {
    if (s && s.readyState === 1) {
      try { s.send(text); n++; } catch { /* 忽略 */ }
    }
  }
  return n;
}

function broadcast(payload, exceptUid) {
  for (const [uid] of online) {
    if (uid === exceptUid) continue;
    sendTo(uid, payload);
  }
}

async function wsRoutes(fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    /* 鉴权：cookie 优先，其次 query 里的 token */
    let user = null;
    try {
      const token = (req.cookies && req.cookies.jingyu_token) || req.query.token;
      if (token) {
        const payload = req.server.jwt.verify(token);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
      }
    } catch {
      user = null;
    }

    if (!user) {
      try { socket.close(4401, '未登录'); } catch { /* 忽略 */ }
      return;
    }

    addOnline(user.id, socket);
    sendTo(user.id, { type: 'hello', data: { user: publicUser(user), online: online.size } });

    /* 心跳：nginx 与运营商的空闲超时都比 30s 长，这个节奏足够保活 */
    const ping = setInterval(() => {
      if (socket.readyState === 1) {
        try { socket.ping(); } catch { /* 忽略 */ }
      }
    }, 30000);

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      /* 单聊 */
      if (msg.type === 'msg' && msg.to) {
        const toId = Number(msg.to);
        const body = String(msg.body || '').trim().slice(0, 2000);
        if (!body || !Number.isFinite(toId)) return;

        const ts = now();
        const info = db.prepare(
          'INSERT INTO messages (from_user, to_user, body, created_at) VALUES (?, ?, ?, ?)'
        ).run(user.id, toId, body, ts);

        const payload = {
          type: 'msg',
          data: {
            id: info.lastInsertRowid,
            from: publicUser(user),
            fromId: user.id,
            to: toId,
            body: body,
            createdAt: ts
          }
        };
        sendTo(toId, payload);
        sendTo(user.id, payload);   /* 回显给发送方，多端同步 */
        return;
      }

      /* 正在输入 */
      if (msg.type === 'typing' && msg.to) {
        sendTo(Number(msg.to), { type: 'typing', data: { from: user.id, name: user.name } });
        return;
      }

      /* 大厅广播 */
      if (msg.type === 'broadcast') {
        const body = String(msg.body || '').slice(0, 500);
        if (!body) return;
        broadcast({ type: 'broadcast', data: { from: publicUser(user), body: body } }, user.id);
      }
    });

    socket.on('close', () => {
      clearInterval(ping);
      removeOnline(user.id, socket);
    });

    socket.on('error', () => {
      clearInterval(ping);
      removeOnline(user.id, socket);
    });
  });

}

/* 私信历史单独成一个插件：它和 /ws 的挂载前缀不同 —— index.js 里挂在 /api 下
   （→ /api/messages/:uid），而 /ws 必须留在根路径给 nginx 单独转发。
   之前两个路由挤在同一个插件里、只注册一次且没有前缀，于是前端调的
   /api/messages/:uid 一直是 404 Route not found —— 私信整条链路是死的。 */
async function apiRoutes(fastify) {
  /* 会话列表：前端消息中心原来是空的 —— dmThreads 只从本地 localStorage 拼，
     服务端一个会话接口都没有。这里按「最后一条消息」聚合出对方 + 未读数。 */
  fastify.get('/messages', { preHandler: requireAuth }, async (req) => {
    const rows = db.prepare(
      'SELECT * FROM messages WHERE from_user = ? OR to_user = ? ORDER BY id DESC LIMIT 500'
    ).all(req.user.id, req.user.id);

    const map = new Map();
    for (const m of rows) {
      const peer = m.from_user === req.user.id ? m.to_user : m.from_user;
      let c = map.get(peer);
      if (!c) { c = { peer: peer, last: m, unread: 0 }; map.set(peer, c); }
      if (m.to_user === req.user.id && !m.read_at) c.unread += 1;
    }

    return {
      ok: true,
      data: {
        items: [...map.values()].map((c) => ({
          peer: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(c.peer)),
          last: {
            id: c.last.id,
            from: c.last.from_user,
            to: c.last.to_user,
            body: c.last.body,
            createdAt: c.last.created_at
          },
          unread: c.unread
        }))
      }
    };
  });

  /* 发私信（REST 兜底）：WS 断线时前端仍能把消息送出去。
     落库 + 推给在线的接收方与自己的其它端，返回落库后的那一行。 */
  fastify.post('/messages/:uid', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const peer = Number(req.params.uid);
    if (!Number.isInteger(peer) || peer <= 0) return fail(reply, 400, 'BAD_UID', null, '收件人不合法');
    if (peer === req.user.id) return fail(reply, 400, 'SELF_MESSAGE', null, '不能给自己发私信');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(peer)) {
      return fail(reply, 404, 'USER_NOT_FOUND', null, '这个用户不存在');
    }
    const body = String((req.body && req.body.body) == null ? '' : req.body.body).trim().slice(0, 2000);
    if (!body) return fail(reply, 400, 'EMPTY_MESSAGE', null, '消息不能为空');

    const ts = now();
    const info = db.prepare('INSERT INTO messages (from_user, to_user, body, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, peer, body, ts);

    const payload = {
      type: 'msg',
      data: {
        id: info.lastInsertRowid,
        from: publicUser(req.user),
        fromId: req.user.id,
        to: peer,
        body: body,
        createdAt: ts
      }
    };
    sendTo(peer, payload);
    sendTo(req.user.id, payload);

    return {
      ok: true,
      data: { item: { id: info.lastInsertRowid, from: req.user.id, to: peer, body: body, createdAt: ts } }
    };
  });

  fastify.get('/messages/:uid', { preHandler: requireAuth }, async (req) => {
    const peer = Number(req.params.uid);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
      ORDER BY id DESC LIMIT ?
    `).all(req.user.id, peer, peer, req.user.id, limit);

    /* 拉取即已读：对方发给我的未读消息在这一刻清掉，未读数才不会是假的。
       只动「发给我」的行，我发出去的状态不变。 */
    try {
      db.prepare('UPDATE messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at = 0')
        .run(now(), req.user.id, peer);
    } catch { /* 忽略：标记已读失败不影响历史消息 */ }

    return {
      ok: true,
      data: {
        items: rows.reverse().map((m) => ({
          id: m.id,
          from: m.from_user,
          to: m.to_user,
          body: m.body,
          createdAt: m.created_at
        }))
      }
    };
  });
}

module.exports = apiRoutes;
module.exports.ws = wsRoutes;
module.exports.online = online;
