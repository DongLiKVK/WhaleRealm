-- ============================================================
-- 鲸域会员赞助系统 · 数据表（契约 v1 第 3 节）
-- 为什么单独一个文件、而不是并进 schema.sql：
--   1) schema.sql 是「社区主表」的唯一来源，会员是独立业务面，出问题时日志里
--      要能直接看到是哪个文件挂的；两拨人维护两张表也互不覆盖。
--   2) 存量库已经建过表，schema.sql 里的 CREATE TABLE IF NOT EXISTS 不会补新表，
--      所以新表必须来自「每次启动都会被 db.js 执行」的独立脚本。
-- 全部 IF NOT EXISTS / INSERT OR IGNORE，重复启动、重复执行都安全。
-- 约定与主库一致：金额一律整数分（INTEGER），时间一律 Unix 秒（INTEGER）。
-- ============================================================

-- ---------- 会员计划（价格表） ----------
-- 为什么价格要落库：契约第 1 节写明后台可改价、可改席位；写死在代码里改一次就要发版。
-- 同时它也是订单金额的唯一来源 —— 下单时把 price_cents 快照进 member_orders.amount_cents，
-- 之后后台调价不会篡改历史订单。
-- UNIQUE(tier, cycle)：同一档同一周期只能有一个价，避免「两个大师月付」这种歧义。
CREATE TABLE IF NOT EXISTS member_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tier          TEXT    NOT NULL,                 -- diamond|master|grandmaster|hunt
  cycle         TEXT    NOT NULL,                 -- month|year
  price_cents   INTEGER NOT NULL,                 -- 实付价（分）
  list_cents    INTEGER NOT NULL DEFAULT 0,       -- 划线原价（分），0=不展示
  duration_days INTEGER NOT NULL,                 -- 授予天数（月 30 / 年 365）
  seats         INTEGER NOT NULL DEFAULT 0,       -- 0=不限；hunt=20（按 active 订阅数算剩余）
  active        INTEGER NOT NULL DEFAULT 1,       -- 0=下架（历史订单仍可查）
  sort          INTEGER NOT NULL DEFAULT 0,
  perks         TEXT    NOT NULL DEFAULT '[]',    -- JSON 数组，额外卖点字符串
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (tier, cycle)
);
-- 前台只取 active=1 的计划，按 sort 排序；走覆盖索引省一次表扫描。
CREATE INDEX IF NOT EXISTS idx_member_plans_active ON member_plans(active, sort);

-- ---------- 订单 ----------
-- 为什么每笔都存 tier/cycle/amount 快照，而不是只留 plan_id：
--   后台改价后历史订单金额必须保持原样；plan_id 只是溯源线索，不是金额来源。
-- 为什么 order_no 唯一：它是用户、客服、对账三方唯一对得上的号；
--   支付回调可能重复到达，唯一约束是「同一笔不会变成两行」的最后一道闸。
-- 为什么 user_id 不设外键级联：这是账本。注销账号不该把已经收到的钱和退款记录一起抹掉，
--   否则 KPI 会凭空少一截；member_subs 才是「活状态」，那里才级联。
CREATE TABLE IF NOT EXISTS member_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT    NOT NULL UNIQUE,           -- JY + yyyymmdd + 6 位大写 hex
  user_id      INTEGER NOT NULL,
  plan_id      INTEGER,                           -- 允许为空（后台手动开通没有计划）
  tier         TEXT    NOT NULL,
  cycle        TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',-- pending|paid|closed|refunded
  channel      TEXT    NOT NULL DEFAULT 'wechat', -- wechat|alipay|manual
  provider_txn TEXT,                              -- 渠道流水号（演示数据用 seed 标记）
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER,
  expires_at   INTEGER,                           -- created_at + 1800，超时即不可支付
  closed_at    INTEGER,
  refunded_at  INTEGER,
  refund_cents INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  admin_id     INTEGER,                           -- 手动补单/退款的操作人
  client_ip    TEXT,                              -- 仅事后取证
  ua           TEXT
);
-- 用户中心按「我的订单，新→旧」翻页
CREATE INDEX IF NOT EXISTS idx_member_orders_user   ON member_orders(user_id, created_at);
-- 后台按状态筛选 + 时间范围统计（KPI / CSV 都走这一条）
CREATE INDEX IF NOT EXISTS idx_member_orders_status ON member_orders(status, created_at);
-- order_no 已有 UNIQUE 约束自带的索引；这里仍显式建一条同名索引以对齐契约第 3 节，
-- IF NOT EXISTS 保证重复执行不会报错（SQLite 会把它当成另一个索引，代价是少许写放大，
-- 订单量级只有万级，可接受）。
CREATE INDEX IF NOT EXISTS idx_member_orders_no     ON member_orders(order_no);
-- 过期未支付的 pending 单需要被批量关闭/统计
CREATE INDEX IF NOT EXISTS idx_member_orders_expires ON member_orders(expires_at);

-- ---------- 订阅（活状态） ----------
-- 为什么用 user_id 直接当主键：契约规定「一个用户同一时刻只有一条订阅」，
--   续费 / 升级都是原地改这一行；用 user_id 做主键让 UPSERT 天然幂等，
--   也不可能出现同一个人两条订阅互相打架。
-- 为什么只存当前档：历史档位变化在 member_events 里，这里只回答「现在是什么、到哪天」。
CREATE TABLE IF NOT EXISTS member_subs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier       TEXT    NOT NULL,                    -- diamond|master|grandmaster|hunt|free（到期回落写 free）
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  order_no   TEXT,                                -- 当前权益的来源订单
  auto_renew INTEGER NOT NULL DEFAULT 0,
  show_name  INTEGER NOT NULL DEFAULT 1,          -- 0=赞助者墙显示「匿名鲸友」
  note       TEXT,                                -- 墙上的留言
  updated_at INTEGER NOT NULL
);
-- 赞助者墙、猎杀席位、到期提醒都按 (tier, expires_at) 过滤
CREATE INDEX IF NOT EXISTS idx_member_subs_tier ON member_subs(tier, expires_at);

-- ---------- 事件流水 ----------
-- 为什么订单之外还要一张事件表：订单只回答「收了多少钱」；
--   续费、升级、退款回滚、后台改计划都不是金额能表达的。续费率等 KPI 直接数这里。
-- 为什么 user_id 不设外键：plan_change 这类事件没有具体会员（记 0），
--   而且审计流水不该因为用户注销而消失。
CREATE TABLE IF NOT EXISTS member_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  order_no     TEXT,
  kind         TEXT    NOT NULL,                  -- grant|renew|upgrade|refund|manual|plan_change|close
  tier         TEXT,
  days         INTEGER,                           -- 本次增减的天数（退款记负数）
  amount_cents INTEGER,
  actor        TEXT    NOT NULL DEFAULT 'system', -- system|admin:<id>|user
  note         TEXT,
  created_at   INTEGER NOT NULL
);
-- KPI 的续费率 / 时间范围流水查询
CREATE INDEX IF NOT EXISTS idx_member_events_time ON member_events(created_at);
CREATE INDEX IF NOT EXISTS idx_member_events_order ON member_events(order_no);

-- ---------- 运营设置 ----------
-- 为什么用 key-value 而不是给某张表加列：筹款目标、沙箱开关、墙开关都是运营参数，
--   会随时改；key-value 加参数不需要改表结构，也不会给主表塞一堆只在特定页面用的列。
CREATE TABLE IF NOT EXISTS member_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- 初始值：INSERT OR IGNORE 只在缺失时写，后台/环境变量改过的值不会被下次启动覆盖。
-- sandbox 默认 0（关闭）：这个开关能让 /simulate 用 0 元把订单改成已支付，
--   生产环境忘关就等于「谁都能白嫖会员」，所以默认必须是关的，本地演示由
--   scripts/seed-membership.js 显式写 1，或 .env 里 MEMBERSHIP_SANDBOX=1 打开。
INSERT OR IGNORE INTO member_settings (key, value, updated_at) VALUES
  ('monthly_goal_cents', '68000', CAST(strftime('%s','now') AS INTEGER)),
  ('sandbox', '0', CAST(strftime('%s','now') AS INTEGER)),
  ('wall_enabled', '1', CAST(strftime('%s','now') AS INTEGER));
