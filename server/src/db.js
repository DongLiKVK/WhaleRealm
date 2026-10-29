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

// DB_PATH 相对路径一律以 server/ 为基准解析。
// 原因：本地库改名隔离后 .env 里写的是 DB_PATH=data/jingyu.dev.db，
// 若从仓库根直接 `node server/src/index.js`，相对 cwd 会把库建到 <repo>/data/ 而不是
// server/data/ —— 静默开出一个空库，看起来「数据全没了」。生产机用绝对路径，走 isAbsolute 分支不受影响。
const DB_PATH = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.resolve(__dirname, '..', process.env.DB_PATH))
  : path.join(__dirname, '..', 'data', 'jingyu.db');

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

/* ---------- 会员赞助表（独立文件，幂等） ----------
   为什么单独一个文件：会员是独立业务面，建表语句与社区主表分开放，出问题时日志里
   能直接看出是哪个文件挂了；两份文件也可以由不同的人维护、互不覆盖。
   为什么 try/catch 且只 console.error 不抛出：会员是「可选业务面」，
   建表失败最坏情况是 /api/membership/* 不可用，绝不能因此让整个社区站起不来
   （与下面 db-guards.sql 的态度一致）。
   为什么在这里而不是路由里：路由是按请求 require 的，让表在进程启动时就建好，
   后面所有 route 的 SQL 都不会踩「表不存在」；也避免第一次访问时才暴露问题。 */
try {
  const memberSql = fs.readFileSync(path.join(__dirname, 'schema-membership.sql'), 'utf8');
  db.exec(memberSql);
} catch (err) {
  console.error('[db] 会员赞助表初始化失败，/api/membership 相关接口将不可用：' + err.message);
}

/* ---------- 会员计划种子（契约第 1 节） ----------
   价格 / 原价 / 天数 / 席位 / 排序全部来自契约，8 条 = 4 档 × 月付/年付。
   只在 member_plans 为空时插入：后台改过价之后，重启不能把价格改回原样。
   perks 是给权益卡看的额外卖点（2~3 条），与 /me 的 benefitKeys 不重复。 */
const MEMBERSHIP_PLANS = [
  { tier: 'diamond',     cycle: 'month', price: 1900,   list: 0,      days: 30,  seats: 0,  sort: 10,
    perks: ['专属徽章与配色', '高清原图 50 张/日', '赞助者墙署名'] },
  { tier: 'diamond',     cycle: 'year',  price: 18800,  list: 22800,  days: 365, seats: 0,  sort: 11,
    perks: ['年付立省 4000 分（¥40）', '专属徽章与配色', '赞助者墙署名'] },
  { tier: 'master',      cycle: 'month', price: 5800,   list: 0,      days: 30,  seats: 0,  sort: 20,
    perks: ['含钻石全部权益', '帖子加精 / 首页推荐', '200 张/日原图额度'] },
  { tier: 'master',      cycle: 'year',  price: 56800,  list: 69600,  days: 365, seats: 0,  sort: 21,
    perks: ['含钻石全部权益', '帖子加精 / 首页推荐', '年付立省 12800 分（¥128）'] },
  { tier: 'grandmaster', cycle: 'month', price: 13800,  list: 0,      days: 30,  seats: 0,  sort: 30,
    perks: ['含大师全部权益', '3 个私有插件仓库', '内测通道 + 1 次/月咨询'] },
  { tier: 'grandmaster', cycle: 'year',  price: 128800, list: 165600, days: 365, seats: 0,  sort: 31,
    perks: ['含大师全部权益', '私有仓库与内测通道', '年付立省 36800 分（¥368）'] },
  { tier: 'hunt',        cycle: 'month', price: 38800,  list: 0,      days: 30,  seats: 20, sort: 40,
    perks: ['限定 20 席', '4 次/月 1v1 咨询', '自定义称号 + 工单优先'] },
  { tier: 'hunt',        cycle: 'year',  price: 368800, list: 465600, days: 365, seats: 20, sort: 41,
    perks: ['限定 20 席', '自定义称号与服务器铭牌', '年付立省 96800 分（¥968）'] }
];

function ensureMembershipPlans() {
  try {
    // 表不存在（上面建表失败）或已经有数据时都直接返回，绝不让启动挂掉
    const row = db.prepare('SELECT COUNT(*) AS n FROM member_plans').get();
    if (!row || row.n > 0) return;
    const ts = now();
    const ins = db.prepare(`INSERT INTO member_plans
      (tier, cycle, price_cents, list_cents, duration_days, seats, active, sort, perks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`);
    const seed = db.transaction(() => {
      for (const p of MEMBERSHIP_PLANS) {
        ins.run(p.tier, p.cycle, p.price, p.list, p.days, p.seats, p.sort, JSON.stringify(p.perks), ts, ts);
      }
    });
    seed();
    console.log('[db] 会员计划已写入 ' + MEMBERSHIP_PLANS.length + ' 条（4 档 × 月/年）');
  } catch (err) {
    console.error('[db] 会员计划种子写入失败：' + err.message);
  }
}

ensureMembershipPlans();

/* ---------- 生产环境沙箱开关告警 ----------
   sandbox=1 时 /api/membership/orders/:orderNo/simulate 可以用 0 元把订单改成已支付，
   这是本地演示的刚需，但在生产就是「谁都能白嫖会员」。表里的默认值已经改成 0，
   可存量库、手工改库、种子脚本都可能留下 1，所以生产启动时必须吼一嗓子。
   环境变量 MEMBERSHIP_SANDBOX=0 已强制关闭时不告警（那不是风险，是正确配置）。 */
(function warnSandboxInProduction() {
  if (process.env.NODE_ENV !== 'production') return;
  const env = String(process.env.MEMBERSHIP_SANDBOX == null ? '' : process.env.MEMBERSHIP_SANDBOX).trim().toLowerCase();
  if (env === '0' || env === 'false') return;
  try {
    const row = db.prepare("SELECT value FROM member_settings WHERE key = 'sandbox'").get();
    if (row && String(row.value) === '1') {
      console.warn('[db] ⚠️  生产环境 member_settings.sandbox=1：/simulate 可以 0 元开通会员！' +
        ' 请设置 MEMBERSHIP_SANDBOX=0（或 UPDATE member_settings SET value=\'0\' WHERE key=\'sandbox\'）后重启。');
    }
  } catch (err) {
    // 表没建好时上面已经报过错，这里不再重复刷屏
  }
})();

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

  /* plugin_readmes.doc_count：v48 起一个仓库可能有多份 README（多语言/子目录），
     主表记份数，正文按语言拆到 plugin_readme_docs。存量库补列，新库由 schema.sql 建好。 */
  try {
    const rcols = db.prepare('PRAGMA table_info(plugin_readmes)').all().map((c) => c.name);
    if (rcols.length && rcols.indexOf('doc_count') < 0) {
      db.exec('ALTER TABLE plugin_readmes ADD COLUMN doc_count INTEGER NOT NULL DEFAULT 0');
      console.log('[db] 迁移：plugin_readmes.doc_count 已补齐');
    }
  } catch (err) {
    console.warn('[db] 迁移 plugin_readmes.doc_count 失败：' + err.message);
  }

  /* v49：README 旁边多了一排「规范文档」标签页（许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则），
     正文和 README 一起存在 plugin_readme_docs，用 kind 区分；plugin_readmes.kinds 记这次抓到了
     哪几类，用来判断「老缓存只有 README、该重抓一次」。存量库补列，新库由 schema.sql 建好。 */
  try {
    const mcols = db.prepare('PRAGMA table_info(plugin_readmes)').all().map((c) => c.name);
    if (mcols.length && mcols.indexOf('kinds') < 0) {
      db.exec("ALTER TABLE plugin_readmes ADD COLUMN kinds TEXT NOT NULL DEFAULT ''");
      console.log('[db] 迁移：plugin_readmes.kinds 已补齐');
    }
    const dcols = db.prepare('PRAGMA table_info(plugin_readme_docs)').all().map((c) => c.name);
    if (dcols.length && dcols.indexOf('kind') < 0) {
      db.exec("ALTER TABLE plugin_readme_docs ADD COLUMN kind TEXT NOT NULL DEFAULT 'readme'");
      console.log('[db] 迁移：plugin_readme_docs.kind 已补齐');
    }
  } catch (err) {
    console.warn('[db] 迁移 readme kind/kinds 失败：' + err.message);
  }

  /* plugins 的审核四列：v50 起条目也要能「待审 / 驳回 / 下架」。
     为什么必须在这里补而不能只写进 schema.sql：schema.sql 是 db.exec 直跑、外面没有
     try/catch，里面写 ALTER TABLE 凡是遇到已经存在的库就会抛 duplicate column，
     整个进程起不来。所以存量库靠这里补，新库由 schema.sql 建好。 */
  try {
    const pcols = db.prepare('PRAGMA table_info(plugins)').all().map((c) => c.name);
    const addPluginCol = (name, ddl) => {
      if (pcols.length && pcols.indexOf(name) < 0) {
        db.exec('ALTER TABLE plugins ADD COLUMN ' + name + ' ' + ddl);
        console.log('[db] 迁移：plugins.' + name + ' 已补齐');
      }
    };
    /* 默认 published：6700 多条存量条目是已经在展示的目录数据，补列时不能把它们
       一次性打成「待审核」——那会让整站条目库当场消失。 */
    addPluginCol('status', "TEXT NOT NULL DEFAULT 'published'");
    addPluginCol('review_note', "TEXT NOT NULL DEFAULT ''");
    addPluginCol('reviewed_by', 'INTEGER NOT NULL DEFAULT 0');
    addPluginCol('reviewed_at', 'INTEGER NOT NULL DEFAULT 0');
    // 依赖新列的索引只能补列之后再建，否则老库上会 no such column
    db.exec('CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status, updated_at DESC)');
  } catch (err) {
    console.warn('[db] 迁移 plugins 审核列失败：' + err.message);
  }

  /* ---------- v37 · 清掉旧版随机默认头像 ----------
     旧版注册会随机分配一个 emoji + 一个 grad（两者独立随机，不一定是
     data.js 里的 8 组预设），看起来像用户选过头像，实际上只是系统默认值。
     v37 起默认头像改成统一的一张鲸鱼线稿，这些随机值必须清掉，否则老账号
     仍会显示成另一张「默认头像」。

     判据：
       - avatar 非空 = 用户上传过，直接跳过；
       - 种子账号 demo*@jingyu.local：emoji/grad 是建库时写死的展示数据，
         从未经过用户选择，一律清空；
       - 其余账号：(emoji, grad) 精确命中前端 8 组预设之一，且 updated_at
         晚于 created_at（说明注册后确实 PATCH 过头像/资料）= 保留；
       - 其余组合（含只有 grad、只有 emoji、两个都空）= 系统默认，清空。
     时间戳只能证明「注册后改过东西」，不能证明改的就是头像，所以随机默认
     恰好命中预设、之后又改过昵称的账号仍可能被保留。这个误判概率很低，且
     保留的是一张用户可能真的喜欢的预设；比反过来把主动选过预设的账号全部
     重置更安全。迁移幂等，每次启动都能跑。 */
  try {
    const presetAva = [
      ['🦌', 'linear-gradient(135deg,#7aa2ff,#a46bff)'],
      ['🍊', 'linear-gradient(135deg,#ffb36b,#ff6b9d)'],
      ['🧊', 'linear-gradient(135deg,#5ad1c8,#3f8bff)'],
      ['🐱', 'linear-gradient(135deg,#c084fc,#f472b6)'],
      ['🍋', 'linear-gradient(135deg,#fde68a,#f59e0b)'],
      ['🌿', 'linear-gradient(135deg,#86efac,#22c55e)'],
      ['🛸', 'linear-gradient(135deg,#93c5fd,#6366f1)'],
      ['🎬', 'linear-gradient(135deg,#f472b6,#7c3aed)']
    ];
    const keyOf = (emoji, grad) => emoji + '\u0000' + grad;
    const keep = new Set(presetAva.map(([emoji, grad]) => keyOf(emoji, grad)));
    const rows = db.prepare("SELECT id, email, emoji, grad, created_at, updated_at FROM users WHERE avatar = '' AND (emoji <> '' OR grad <> '')").all();
    const clear = db.prepare("UPDATE users SET emoji = '', grad = '' WHERE id = ? AND avatar = ''");
    let cleaned = 0;
    const run = db.transaction(() => {
      for (const row of rows) {
        const seeded = /^demo\d+@jingyu\.local$/i.test(String(row.email || ''));
        const preset = keep.has(keyOf(row.emoji, row.grad));
        const touched = Number(row.updated_at) > Number(row.created_at);
        if (!seeded && preset && touched) continue;
        clear.run(row.id);
        cleaned += 1;
      }
    });
    run();
    if (cleaned) console.log('[db] 迁移：' + cleaned + ' 个未自定义账号的随机默认头像已清空');
  } catch (err) {
    console.warn('[db] 迁移随机默认头像失败：' + err.message);
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

/* ---------- 后台管理系统的表与增量列 ----------
   为什么放在守卫之后：守卫只针对站点既有 12 张表写不变量，admin_* 是新命名空间，
   不需要也不该被那批 TRIGGER 约束；而 posts/users 的新列必须在守卫建好之后补，
   否则旧库上守卫引用的列还不存在。
   为什么失败只告警：后台是运营工具，站点前台不能因为它起不来。真出问题时
   admin-guard 会在每个后台请求上回 500 并提示跑 seed-admin，问题依然可见。 */
try {
  require('./admin-db').initAdminSchema(db);
} catch (err) {
  console.warn('[db] 后台数据表初始化失败（后台不可用，前台不受影响）：' + (err && err.message ? err.message : err));
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