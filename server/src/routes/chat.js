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

async function routes(fastify) {
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

  /* 拉历史消息 */
  fastify.get('/messages/:uid', { preHandler: requireAuth }, async (req) => {
    const peer = Number(req.params.uid);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
      ORDER BY id DESC LIMIT ?
    `).all(req.user.id, peer, peer, req.user.id, limit);

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

module.exports = routes;
module.exports.online = online;
