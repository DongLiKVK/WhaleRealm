-- ============================================================
-- 鲸域社区 · 数据库结构
-- 约定：
--   主键统一 INTEGER PRIMARY KEY AUTOINCREMENT
--   时间统一 Unix 秒（INTEGER），不用字符串
--   外键统一 ON DELETE CASCADE
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- 用户 ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,          -- 登录邮箱，唯一
  phone         TEXT    NOT NULL DEFAULT '',      -- 绑定手机号，11 位；未绑定为 ''
  phone_verified INTEGER NOT NULL DEFAULT 0,      -- 0=没过手机号闸门，1=已验证
  phone_at      INTEGER NOT NULL DEFAULT 0,       -- 最近一次验证通过时间，0=从未验证
  password_hash TEXT    NOT NULL,                 -- bcryptjs 哈希，永不存明文；第三方账号为 ''（无密码）
  name          TEXT    NOT NULL,                 -- 昵称
  emoji         TEXT    NOT NULL DEFAULT '🐳',     -- 头像表情
  grad          TEXT    NOT NULL DEFAULT 'linear-gradient(135deg,#7aa2ff,#a46bff)',
  level         INTEGER NOT NULL DEFAULT 1,
  badge         TEXT    NOT NULL DEFAULT '',
  sig           TEXT    NOT NULL DEFAULT '',      -- 个性签名
  city          TEXT    NOT NULL DEFAULT '',
  fans          INTEGER NOT NULL DEFAULT 0,
  follows       INTEGER NOT NULL DEFAULT 0,
  visits        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- ---------- 插件条目 ----------
CREATE TABLE IF NOT EXISTS plugins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,            -- 包名，如 dsh-blender-plugin
  icon        TEXT    NOT NULL DEFAULT '🧩',
  grad        TEXT    NOT NULL DEFAULT '',
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ver         TEXT    NOT NULL DEFAULT '',
  cat         TEXT    NOT NULL DEFAULT '',        -- 分类：创作/效率/界面/运维/逆向
  desc        TEXT    NOT NULL DEFAULT '',
  stars       INTEGER NOT NULL DEFAULT 0,
  installs    INTEGER NOT NULL DEFAULT 0,
  tags        TEXT    NOT NULL DEFAULT '[]',      -- JSON 数组
  hot         INTEGER NOT NULL DEFAULT 0,         -- 0/1
  license     TEXT    NOT NULL DEFAULT '',
  repo        TEXT    NOT NULL DEFAULT '',
  homepage    TEXT    NOT NULL DEFAULT '',
  tier        TEXT    NOT NULL DEFAULT 'entry',   -- pack / link / entry
  source      TEXT    NOT NULL DEFAULT 'none',    -- author / mirror / none
  claimed     INTEGER NOT NULL DEFAULT 0,
  mirror      TEXT    NOT NULL DEFAULT 'off',     -- auto / manual / off
  freshness   TEXT    NOT NULL DEFAULT 'none',    -- synced / manual / stale / none
  why         TEXT    NOT NULL DEFAULT '',        -- 无包原因说明
  file_name   TEXT    NOT NULL DEFAULT '',
  file_size   TEXT    NOT NULL DEFAULT '',
  file_size_b INTEGER NOT NULL DEFAULT 0,
  file_sha    TEXT    NOT NULL DEFAULT '',
  collected_at INTEGER NOT NULL DEFAULT 0,
  synced_at   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugins_cat  ON plugins(cat);
CREATE INDEX IF NOT EXISTS idx_plugins_hot  ON plugins(hot);
CREATE INDEX IF NOT EXISTS idx_plugins_upd  ON plugins(updated_at);

-- ---------- 动态 ----------
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL DEFAULT '',
  plugin_slug TEXT    NOT NULL DEFAULT '',        -- 关联插件（可空）
  plugin_ver  TEXT    NOT NULL DEFAULT '',
  pinned      INTEGER NOT NULL DEFAULT 0,
  likes       INTEGER NOT NULL DEFAULT 0,         -- 冗余计数，写入时同步
  shares      INTEGER NOT NULL DEFAULT 0,
  comments    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id);

-- ---------- 动态图片 ----------
CREATE TABLE IF NOT EXISTS post_images (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  cos_key  TEXT    NOT NULL,                      -- COS 对象键，如 u/2026/10/abc.jpg
  w        INTEGER NOT NULL DEFAULT 0,
  h        INTEGER NOT NULL DEFAULT 0,
  type     TEXT    NOT NULL DEFAULT '',           -- image/jpeg 等
  sort     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id);

-- ---------- 评论 ----------
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,  -- 楼中楼
  text       TEXT    NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- ---------- 点赞（一人一次，唯一约束防重复） ----------
CREATE TABLE IF NOT EXISTS likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT   NOT NULL,                    -- post / comment / thread
  target_id  INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id);

-- ---------- 版块 ----------
CREATE TABLE IF NOT EXISTS forums (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL UNIQUE,             -- notice / guide / help / dev / tool / chat
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '💬',
  desc       TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  thread_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ---------- 主题帖 ----------
CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  forum_slug TEXT    NOT NULL REFERENCES forums(slug) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  tag        TEXT    NOT NULL DEFAULT '',
  tags       TEXT    NOT NULL DEFAULT '[]',       -- JSON 数组
  excerpt    TEXT    NOT NULL DEFAULT '',
  replies    INTEGER NOT NULL DEFAULT 0,
  views      INTEGER NOT NULL DEFAULT 0,
  likes      INTEGER NOT NULL DEFAULT 0,
  hot        INTEGER NOT NULL DEFAULT 0,
  top        INTEGER NOT NULL DEFAULT 0,
  solved     INTEGER NOT NULL DEFAULT 0,
  closed     INTEGER NOT NULL DEFAULT 0,
  reactions  TEXT    NOT NULL DEFAULT '{}',       -- JSON：{"👍":24}
  last_user  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_at    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_forum   ON threads(forum_slug, last_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_created ON threads(created_at DESC);

-- ---------- 私信 ----------
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  read_at    INTEGER NOT NULL DEFAULT 0,          -- 0 = 未读
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages(to_user, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user, id DESC);

-- ---------- 会话（登录态可选，JWT 无状态时可不写） ----------
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  ua         TEXT    NOT NULL DEFAULT '',
  ip         TEXT    NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- 手机号验证码 ----------
-- 只存「未消费的验证码」，验证通过或过期即删。
-- 唯一键是 (phone, user_id) 而不是 phone：按号码唯一会让任何人只要对别人的号发一次码，
-- 就占用掉该号码唯一的待验行，把真机主挡在门外（可无限续期的拒绝服务）。
-- 按账号分开存，各验各的；码只会发到机主手机上，谁也抢不走。
-- code 是 6 位数字明文：它是 300 秒生命周期的一次性短码，做哈希对「库泄露」收益很低，
-- 却会让运维无法排查「码发出去没到」的工单，这里选择明文 + 短 TTL + tries 上限。
CREATE TABLE IF NOT EXISTS phone_codes (
  code       TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tries      INTEGER NOT NULL DEFAULT 0,          -- 已试错次数，>=5 直接作废
  expires_at INTEGER NOT NULL,                    -- now()+300
  created_at INTEGER NOT NULL
);
-- 一个账号在一个号码上同一时刻只有一条待验码：(phone, user_id) 唯一索引建在
-- src/routes/phone.js 里（带 try/catch 兜底）。为什么不写在这里：schema.sql 是 db.js
-- 启动时整段 db.exec 的，任何一句抛错都会让服务起不来；存量库若已有重复行，
-- 这里建唯一索引会把整个进程带走，而那条约束只是「更强一点」，不该有这种杀伤力。
CREATE INDEX IF NOT EXISTS idx_phone_codes_expires ON phone_codes(expires_at);

-- ---------- 第三方登录绑定 ----------
-- 一个用户可绑多个渠道，一个 (provider, open_id) 只能绑一个用户。
-- 第三方账号的 users.password_hash 为 ''，永远走不通密码登录（bcrypt 比对必然 false）。
CREATE TABLE IF NOT EXISTS oauth_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  provider   TEXT    NOT NULL,                    -- qq | wechat | github
  open_id    TEXT    NOT NULL,                    -- QQ openid / 微信 openid（优先 unionid）/ GitHub id
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nick       TEXT    NOT NULL DEFAULT '',
  avatar     TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (provider, open_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_links_user ON oauth_links(user_id);
