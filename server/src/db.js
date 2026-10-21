/**
 * SQLite 初始化
 * - WAL 模式：读写并发，2 核机器上比默认模式快很多
 * - 启动时执行 schema.sql，全部 IF NOT EXISTS，重复启动安全
 * - 提供 now() / toJson() 等小工具给路由用
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'jingyu.db');

// 确保数据目录存在
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL：写入不阻塞读取；synchronous=NORMAL 在 WAL 下已足够安全
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// 建表（幂等）
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

/** 当前 Unix 秒 */
function now() {
  return Math.floor(Date.now() / 1000);
}

/** 安全解析 JSON 字段，坏数据回退默认值 */
function parseJson(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** 用户对象对外输出（去掉密码哈希） */
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    grad: row.grad,
    level: row.level,
    badge: row.badge,
    sig: row.sig,
    city: row.city,
    fans: row.fans,
    follows: row.follows,
    visits: row.visits
  };
}

module.exports = { db, now, parseJson, publicUser, DB_PATH };
