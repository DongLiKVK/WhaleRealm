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
  emoji         TEXT    NOT NULL DEFAULT '',       -- 头像表情；'' = 未自定义，前端用统一默认图
  grad          TEXT    NOT NULL DEFAULT '',       -- 预设渐变；'' = 未自定义，前端用统一默认图
  avatar        TEXT    NOT NULL DEFAULT '',      -- 上传头像的 COS URL；'' = 未上传
  frame         TEXT    NOT NULL DEFAULT '',      -- 头像框覆盖：''=跟随会员档位 / none=不戴 / maw-1..4=指定等级
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
  cat         TEXT    NOT NULL DEFAULT '',        -- 分类：与前端 data.js 的 pluginCats 同表（23 类，旧五项由 pluginCatMigrate 归一化）
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
  /* 审核态。存量库没有这四列，由 db.js migrate() 补 —— schema.sql 是 db.exec 直跑、
     不带 try/catch，缺列的 ALTER 放这里会让老库直接起不来。 */
  status      TEXT    NOT NULL DEFAULT 'published', -- published / pending / rejected / hidden
  review_note TEXT    NOT NULL DEFAULT '',
  reviewed_by INTEGER NOT NULL DEFAULT 0,
  reviewed_at INTEGER NOT NULL DEFAULT 0,
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
  slug       TEXT    NOT NULL UNIQUE,             -- notice / ai / news / chat / help / cn / guide / dev / res / pan / deal / memory / tool / ops
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

-- ---------- 主题回复（楼层）----------
-- 之前主题只存了 replies 计数，没有落回复的正文：详情页的楼层是前端写死的演示数据，
-- 谁回帖刷新就没了。这张表补上「楼层」这个真源，replies 计数由写入方在事务里同步。
CREATE TABLE IF NOT EXISTS thread_replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES thread_replies(id) ON DELETE CASCADE,  -- 回复某一楼（可空）
  quote      TEXT    NOT NULL DEFAULT '',        -- 引用块原文
  body       TEXT    NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thread_replies_thread ON thread_replies(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_thread_replies_user   ON thread_replies(user_id);

-- ---------- 认领校验串 ----------
-- 一次认领 = 一条挑战记录：平台发串 → 作者把串写进自己仓库的 README / issue → 平台回读校验。
-- 只有 verified_at > 0 的行代表「这个仓库里确实出现过这个串」；认领结果写在 plugins 上。
CREATE TABLE IF NOT EXISTS plugin_claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id   INTEGER NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL,                  -- 32 位十六进制，绑 (plugin, user)
  method      TEXT    NOT NULL DEFAULT 'readme', -- readme / issue
  created_at  INTEGER NOT NULL,
  verified_at INTEGER NOT NULL DEFAULT 0         -- 0 = 未验证；>0 = 验证通过的时间戳
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_claims_token  ON plugin_claims(token);
CREATE INDEX IF NOT EXISTS idx_plugin_claims_lookup ON plugin_claims(plugin_id, user_id);

-- ---------- 条目页 README 缓存 ----------
-- 条目页要展示作者仓库里的 README 正文。6716 个条目不能预先抓（GitHub 会限流，
-- 大部分仓库一年也无人访问），所以按需抓、抓到就落库：一个条目只有一行，
-- 主键就是插件 id，重复访问直接读库，不重复打 GitHub。
-- status：ok = 有正文；none = 仓库没有 README 或不是 GitHub 仓库（负缓存，1 天后重试）。
CREATE TABLE IF NOT EXISTS plugin_readmes (
  plugin_id   INTEGER PRIMARY KEY REFERENCES plugins(id) ON DELETE CASCADE,
  repo        TEXT    NOT NULL DEFAULT '',       -- 抓取时的仓库地址，仓库换了要重抓
  path        TEXT    NOT NULL DEFAULT '',       -- 命中的文件名，如 README.md
  url         TEXT    NOT NULL DEFAULT '',       -- 实际读取的地址（raw / API）
  status      TEXT    NOT NULL DEFAULT 'none',   -- ok / none
  code        TEXT    NOT NULL DEFAULT '',       -- none 时的原因码：README_NOT_FOUND / REPO_NOT_GITHUB
  message     TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',       -- Markdown 原文（未渲染，渲染与转义在前端做）
  bytes       INTEGER NOT NULL DEFAULT 0,        -- 原文总字节数（截断前）
  truncated   INTEGER NOT NULL DEFAULT 0,        -- 1 = 超过上限被截断
  doc_count   INTEGER NOT NULL DEFAULT 0,        -- 这个仓库一共抓到几份文档（README + 规范文档）
  kinds       TEXT    NOT NULL DEFAULT '',       -- 抓到的文档类型清单，如 readme,license,security（判断老缓存要不要重抓）
  fetched_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugin_readmes_at ON plugin_readmes(fetched_at);

-- ---------- 一个仓库里的多份说明文档 ----------
-- 中文/英文双 README 在插件仓库里非常常见（README.md + README.zh-CN.md、
-- README.md + docs/README_CN.md）。plugin_readmes 只存「主 README」，其余各语言/
-- 子目录版本放这里，条目页给一排标签切换。
-- v49 起这张表也存「规范类文档」：LICENSE / SECURITY.md / CONTRIBUTING.md /
-- CHANGELOG.md / CODE_OF_CONDUCT.md，用 kind 区分。为什么不另开一张表：
-- 正文形态完全一样（Markdown 原文 + 截断标记），条目页也是同一块卡片里切标签，
-- 拆表只会多一次查询和一套重复的预算/截断逻辑。
-- 为什么单独一张表而不是一个 JSON 列：正文单份上限 320KB，6 份塞一列会变成 2MB 的
-- 行，读一次要整块反序列化；拆表后按需查、也方便以后只删某一份。
CREATE TABLE IF NOT EXISTS plugin_readme_docs (
  plugin_id  INTEGER NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  path       TEXT    NOT NULL,                    -- 仓库内路径，如 docs/README.zh-CN.md
  kind       TEXT    NOT NULL DEFAULT 'readme',   -- readme / license / security / contributing / changelog / conduct
  label      TEXT    NOT NULL DEFAULT '',         -- 标签，如 中文 / English / 繁體
  lang       TEXT    NOT NULL DEFAULT '',         -- 语言键，如 zh-cn / en / default
  body       TEXT    NOT NULL DEFAULT '',         -- Markdown 原文
  bytes      INTEGER NOT NULL DEFAULT 0,
  truncated  INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, path)
);
CREATE INDEX IF NOT EXISTS idx_plugin_readme_docs_at ON plugin_readme_docs(fetched_at);

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

-- ---------- 会话 ----------
-- 一个账号允许多端同时在线（v46）：device 是设备桶 'pc' / 'mobile'，每桶至多一行。
-- 注意：这里**不能**给 user_id 建唯一索引 —— 那是「同一时间只能一处登录」的旧约束，
-- 有了它手机登录会被 SQLITE_CONSTRAINT_UNIQUE 直接顶回来。老库的该索引由
-- server/src/auth.js 的 migrateSessionsToMultiDevice() 负责 DROP。
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  ua         TEXT    NOT NULL DEFAULT '',
  ip         TEXT    NOT NULL DEFAULT '',
  device     TEXT    NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
-- 复合索引 (user_id, device) 不写在这里：老库里 sessions 还没有 device 列，
-- 而 schema.sql 是在 auth.js 之前整段 db.exec 的，写在这里会让服务直接起不来。
-- 它由 server/src/auth.js 的 migrateSessionsToMultiDevice() 补列之后再建。

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

-- ---------- 登录失败记录（账号级爆破防护） ----------
-- 为什么不塞进 sessions：锁定要在「登录成功后立刻被注销」的情况下继续生效，
-- 而 sessions 行会被 revokeSession 随时删掉。
-- 为什么主键是 email 而不是 user_id：爆破往往先撞不存在的邮箱（NOT_REGISTERED 也算
-- 一次失败），按 user_id 存会漏掉这一类；而且 email 已经是 normEmail() 折平过的值，
-- 天然把 a+1@x.com / A@X.COM 聚到同一行。
-- 只留 locked_until / lock_count 两个真值；fails / first_at / last_at 是为了
-- 「滑动窗口 + 指数退避」。行数上限 = 被暴力尝试过的邮箱数，prune() 每次失败顺手清 7 天前的行。
CREATE TABLE IF NOT EXISTS auth_fails (
  email        TEXT    PRIMARY KEY,              -- 归一化后的邮箱
  fails        INTEGER NOT NULL DEFAULT 0,       -- 当前窗口内失败次数
  first_at     INTEGER NOT NULL DEFAULT 0,       -- 本窗口第一次失败
  last_at      INTEGER NOT NULL DEFAULT 0,       -- 最近一次失败；惰性过期据此判断窗口
  locked_until INTEGER NOT NULL DEFAULT 0,       -- 解锁时间戳，0 = 未锁定
  lock_count   INTEGER NOT NULL DEFAULT 0,       -- 累计被锁次数，用于指数退避
  last_ip      TEXT    NOT NULL DEFAULT ''       -- 仅事后取证，不参与判定
) WITHOUT ROWID;

-- ---------- 条目 → npm 包核对结果 ----------
-- 条目页在「去 GitHub 仓库」右侧给一颗 npm 下载胶囊，但索引里的 slug 只有约六成
-- 真的在 npm 上发布过（其余是作者没发 / 改了名 / 私有包）。点开 404 的按钮比没有按钮更糟，
-- 所以把「查过 registry 且存在」这件事落库，前端只对存在的包渲染那颗胶囊。
-- exists=0 的行也留着：下次全量核对不必重复猜，靠 checked_at 判断新鲜度。
-- version 存 dist-tags.latest，用来在胶囊上写真实版本号，而不是编一个。
CREATE TABLE IF NOT EXISTS plugin_npm (
  slug       TEXT    PRIMARY KEY,              -- = plugins.slug，也是 npm 包名
  name       TEXT    NOT NULL DEFAULT '',      -- registry 回读到的 name（一般同 slug）
  version    TEXT    NOT NULL DEFAULT '',      -- dist-tags.latest，没发版时为空
  found      INTEGER NOT NULL DEFAULT 0,       -- 1 = registry 200，0 = 明确 404（列名不用 exists：SQLite 保留字）
  checked_at INTEGER NOT NULL DEFAULT 0        -- 上次核对时间（epoch 秒）
);

-- ---------- 举报 ----------
-- 为什么落库而不是发邮件：举报的价值是「可追溯 + 可统计 + 有处理时限」。
-- 邮件进了某个人的收件箱就查不出「这条举报处理了没有、谁处理的、处理结论是什么」，
-- 而这些恰好是内容平台在监管问询时要能当场拿出来的东西。
-- 为什么 target 用多态两列（type + id）而不是外键：举报对象可能是插件 / 帖子 /
-- 主题 / 回复 / 用户五类，任何一种都可能是「即将被删掉」的那一条，
-- 外键级联会让举报记录跟着对象一起消失 —— 恰恰在删掉内容的那一刻，举报记录最该留存。
-- 所以对象删了，举报行还在（后台列表把找不到的对象显示成「对象已删除」）。
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT    NOT NULL,                   -- plugin / post / thread / comment / user
  target_id   INTEGER NOT NULL,
  reason      TEXT    NOT NULL,                   -- copyright / malware / wrong / other
  detail      TEXT    NOT NULL DEFAULT '',        -- 举报人补充说明，≤1000 字
  contact     TEXT    NOT NULL DEFAULT '',        -- 可选联系方式，只在后台可见
  user_id     INTEGER NOT NULL DEFAULT 0,         -- 登录用户 id；0 = 未登录匿名举报
  ip          TEXT    NOT NULL DEFAULT '',        -- 仅事后取证与去重，不对外展示
  status      TEXT    NOT NULL DEFAULT 'open',    -- open / handling / resolved / rejected
  handle_note TEXT    NOT NULL DEFAULT '',
  handled_by  INTEGER NOT NULL DEFAULT 0,         -- admin_accounts.id
  handled_at  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);