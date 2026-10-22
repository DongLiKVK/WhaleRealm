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

/* ---------- 数据安全 pragma ----------
   全部在每次建连时显式重设，不依赖库文件里可能被改过的残留状态。
   secure_delete：删除/覆盖过的页用 0 填充。否则已删的用户密码哈希、token 哈希、
     手机号会静静躺在空闲页里，任何人拿到 .db 文件都能用 strings/grep 捞出来。
     库才 172KB，这点写放大完全可以接受。
   journal_size_limit：WAL 超过该大小就在下次 checkpoint 时截断。默认 -1 = 永不截断，
     实测 WAL 曾涨到 1.3MB（主库只有 172KB）；哪天没人盯着，它能一路涨到磁盘满。
   wal_autocheckpoint：每 512 页（2MB）回写一次，让 WAL 增长有上界。
   trusted_schema=OFF：schema 里的表达式不许调用宿主函数。本库 schema 全是纯 DDL，
     关掉不影响任何功能，却堵住「往 schema 塞恶意 trigger/视图来执行代码」这条路
     （CVE-2022-35737 一类的老套路）。
   temp_store=MEMORY：临时表不落盘，少一份可能残留中间结果的磁盘文件。 */
db.pragma('secure_delete = ON');
db.pragma('journal_size_limit = 67108864');
db.pragma('wal_autocheckpoint = 512');
db.pragma('trusted_schema = OFF');
db.pragma('temp_store = MEMORY');
/* 兜底两道：
   cell_size_check = ON   读页时额外校验 cell 边界，损坏页当场报错而不是把垃圾当数据返回。
   max_page_count         给库文件一个硬上界（100 万页 ≈ 4GB）。真被灌数据灌到写满磁盘，
                          连日志和备份都写不进去，那时连取证都做不了；到顶时 SQLite 抛
                          SQLITE_FULL，应用层还能正常回错误。 */
db.pragma('cell_size_check = ON');
db.pragma('max_page_count = 1000000');

// 建表（幂等）
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

/* ---------- 轻量迁移（幂等） ----------
   schema.sql 只管「新机器建表」，存量库不会因为改了 schema.sql 就长出新列。
   users.avatar 是后加的（头像上传要能跨设备同步，不能只躺在 localStorage 里），
   这里用 ALTER TABLE 补；已经是新库时 SQLite 抛 duplicate column，吞掉即可。
   为什么不用版本号表：本库只有这一处存量差异，为一个列引入 migration 框架
   反而是新的失败面（版本表与真实结构不一致时更难查）。 */
(function migrate() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (cols.indexOf('avatar') < 0) {
    try {
      db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
      console.log('[db] 迁移：users.avatar 已补齐');
    } catch (err) {
      console.warn('[db] 迁移 users.avatar 失败：' + err.message);
    }
  }
})();

/* ---------- 库层守卫（TRIGGER 形式的不变量） ----------
   为什么单独一个文件：schema.sql 是「建表」语义，新机器上会被原样执行；守卫是
   「不变量」语义，出问题时希望日志里看到独立文件名。
   为什么用 TRIGGER 不用表级 CHECK：SQLite 没有 ALTER TABLE ADD CONSTRAINT，
   给存量表补 CHECK 只能重建表（建影子表→拷数据→删原表→改名→重建索引），本库 12 张
   表且外键互引，重建期间任何异常都会留半成品。TRIGGER 可幂等创建、随时 DROP。
   为什么出错不致命：守卫是「更强一点」的保险，不是服务启动的前提。文件缺失或某条
   语句在旧版本 SQLite 上不被支持时只告警，绝不能让进程起不来（对齐 phone.js 里
   唯一索引的 try/catch 态度）。 */
try {
  const guardSql = fs.readFileSync(path.join(__dirname, 'db-guards.sql'), 'utf8');
  db.exec(guardSql);
} catch (err) {
  console.warn('[db] 库层守卫加载失败，仅由路由层校验兜底：' + err.message);
}

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
    avatar: row.avatar || '',
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