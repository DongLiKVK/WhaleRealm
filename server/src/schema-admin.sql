-- ============================================================
-- 鲸域 · 独立后台管理系统（admin）表结构
-- ============================================================
-- 为什么单独一个文件、而不是塞进 schema.sql：
--   schema.sql 是「站点必需表」，每次启动整段 db.exec；后台是可选模块，且会随版本
--   继续加表。拆出来之后 db.js 能用 try/catch 单独兜住它 —— 后台建表失败时站点照常
--   启动，日志里留一行 warn，而不是让一条 SQL 把整站带走。
--
-- 与 /api/admin/membership 的关系：
--   那一套的「管理员」是站点 users 里的 level>=15 / badge='版主'，共用前台会话；
--   本文件是独立后台账号体系（自己的账号、角色、会话表），两棵树互不相干 ——
--   后台账号不写 users，站点用户 token 也进不来。
--
-- 约定沿用 schema.sql：主键 INTEGER PRIMARY KEY AUTOINCREMENT、时间一律 Unix 秒(INTEGER)、
--   外键一律显式写 ON DELETE 行为（不是全都 CASCADE，理由见各表注释）。
-- ============================================================

-- ---------- 角色 ----------
-- permissions 存 JSON 数组：权限目录是代码里的常量（admin-db.js 的 PERMISSIONS），
-- 每次请求按 role_id 回表读它再求交集。为什么不塞进 JWT：契约要求「角色改动下一次
-- 请求立即生效」，把权限签进 token 就只能等 8 小时过期。
CREATE TABLE IF NOT EXISTS admin_roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    NOT NULL UNIQUE,              -- owner / admin / editor / staff / role_<id>
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  permissions TEXT    NOT NULL DEFAULT '[]',        -- JSON 数组，元素必须是权限目录里的 key
  builtin     INTEGER NOT NULL DEFAULT 0,           -- 1 = 内置角色，不可删除（owner 权限不可改）
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ---------- 后台账号 ----------
-- account 用 COLLATE NOCASE：SQLite 的默认 UNIQUE 区分大小写，root / Root 会变成两个
-- 账号，登录框里大小写写错就「账号不存在」，既不安全也不好用。
-- failed_count / locked_until 直接放在账号行上（不像前台 auth_fails 那样按 key 建表）：
-- 后台账号总量是个位数，没必要为它维护一张旁表，同一行读写还省一次事务。
CREATE TABLE IF NOT EXISTS admin_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account       TEXT    NOT NULL COLLATE NOCASE UNIQUE, -- 登录账号，3~32 位
  name          TEXT    NOT NULL DEFAULT '',            -- 显示名
  password_hash TEXT    NOT NULL,                       -- bcryptjs 10 轮
  role_id       INTEGER NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  status        TEXT    NOT NULL DEFAULT 'active',      -- active / disabled
  failed_count  INTEGER NOT NULL DEFAULT 0,             -- 连续失败次数，成功即清零
  locked_until  INTEGER NOT NULL DEFAULT 0,             -- 解锁时间戳，0 = 未锁定
  last_login_at INTEGER NOT NULL DEFAULT 0,
  last_login_ip TEXT    NOT NULL DEFAULT '',
  -- TOTP 两步验证：secret 用 AES-256-GCM 加密后落库；pending 是「已扫码、还没输码确认」的临时 secret。
  -- last_step 记录上次成功使用的 30 秒时间步，防止同一个验证码在本窗口内重放。
  totp_secret         TEXT    NOT NULL DEFAULT '',
  totp_enabled        INTEGER NOT NULL DEFAULT 0,
  totp_confirmed_at   INTEGER NOT NULL DEFAULT 0,
  totp_last_step      INTEGER NOT NULL DEFAULT 0,
  totp_pending_secret TEXT    NOT NULL DEFAULT '',
  totp_pending_at     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_role   ON admin_accounts(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status);

-- ---------- 后台会话 ----------
-- 为什么 id 是 48 位十六进制字符串而不是自增整数：sid 要进 JWT，整数 id 可枚举，
-- 一旦 JWT 密钥泄露，攻击者能直接算出全部会话 id 去撞 token_hash。
-- token_hash = sha256(完整 token)：库泄露也换不出可用的 cookie（与前台 sessions 同口径）。
-- admin_accounts 删号时 CASCADE：账号没了，会话行留着就是永久后门。
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         TEXT    PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  ua         TEXT    NOT NULL DEFAULT '',
  ip         TEXT    NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);

-- ---------- 两步验证恢复码 ----------
-- 只存 sha256，明文只在启用成功时展示一次。used_at > 0 表示已使用，不能再用。
-- admin 删号时 CASCADE：账号没了，恢复码不应留下可用的后门。
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  code_hash  TEXT    NOT NULL UNIQUE,
  used_at    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_recovery_admin ON admin_recovery_codes(admin_id);

-- ---------- 奖励记录 ----------
-- 奖励是账本，所以「发放人/撤回人」只存 id、不建外键：管理员离职删号之后，
-- 这条账目仍然要能查到「谁在什么时候发的」，不能被级联删除带走。
-- 但 user_id 建 CASCADE：用户被删了，他的积分也一起没了，留着悬空记录只会让列表 500。
-- amount 对 points 是积分、对 days 是天数、对 custom 恒为 0（契约只允许它记账不改表）。
CREATE TABLE IF NOT EXISTS rewards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL,                  -- points / days / frame / custom
  amount         INTEGER NOT NULL DEFAULT 0,
  tier           TEXT    NOT NULL DEFAULT '',       -- type=days 时发放的会员档位快照（diamond|master|grandmaster|hunt）
  frame          TEXT    NOT NULL DEFAULT '',       -- type=frame 时设置的头像框（auto|none|maw-1..4）
  prev_frame     TEXT    NOT NULL DEFAULT '',       -- 改头像框前的值，撤回时还原
  reason         TEXT    NOT NULL,
  note           TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'active', -- active / revoked
  granted_by     INTEGER NOT NULL DEFAULT 0,        -- admin_accounts.id，0 = 系统/种子
  granted_at     INTEGER NOT NULL,
  revoked_by     INTEGER NOT NULL DEFAULT 0,
  revoked_at     INTEGER NOT NULL DEFAULT 0,
  revoked_reason TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rewards_user    ON rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status  ON rewards(status);
CREATE INDEX IF NOT EXISTS idx_rewards_granted ON rewards(granted_at DESC);

-- ---------- 操作日志 ----------
-- admin_id 不建外键、admin_name / role_key 冗余落库：审计日志必须比账号活得久，
-- 而且「当时的角色」本身就是审计信息（后来改了角色不该改写历史）。
-- 失败登录也写这张表（admin_id=0，admin_name 记被尝试的账号名），否则撞库在后台完全不可见。
-- detail 存 JSON {before,after,note}，只在详情页读，列表页不碰它（避免几十 KB 的正文进列表）。
CREATE TABLE IF NOT EXISTS admin_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL DEFAULT 0,
  admin_name  TEXT    NOT NULL DEFAULT '',
  role_key    TEXT    NOT NULL DEFAULT '',
  action      TEXT    NOT NULL,                     -- 契约第 6 节的 22 个动作名
  target_type TEXT    NOT NULL DEFAULT '',
  target_id   INTEGER NOT NULL DEFAULT 0,
  summary     TEXT    NOT NULL DEFAULT '',
  detail      TEXT    NOT NULL DEFAULT '',
  result      TEXT    NOT NULL DEFAULT 'ok',        -- ok / fail
  ip          TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin   ON admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action  ON admin_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target  ON admin_logs(target_type, target_id);