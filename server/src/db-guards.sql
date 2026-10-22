-- ============================================================
-- 鲸域社区 · 数据库层守卫（TRIGGER 形式的 CHECK 约束）
-- ============================================================
-- 为什么用 TRIGGER 而不是表上的 CHECK：
--   SQLite 不支持 ALTER TABLE ADD CONSTRAINT，给存量表补 CHECK 只能重建表
--   （建影子表 → 拷数据 → 删原表 → 改名 → 重建索引/触发器 → 校验）。本库 12 张表、
--   多个外键互相引用，重建期间任何一次异常都会留下半成品。TRIGGER 能对已有表直接生效、
--   可幂等创建、随时可 DROP，代价只是每次写多几次 WHEN 求值 —— 172KB 的库完全无感。
--
-- 为什么单独一个文件而不是塞进 schema.sql：
--   schema.sql 是「建表」语义，新机器上会被原样执行；守卫是「不变量」语义，
--   出问题时希望日志里看到独立的文件名。
--
-- 与 trusted_schema = OFF 的兼容性（已实测）：
--   length() / instr() / lower() / GLOB / LIKE 在 CHECK 与 TRIGGER 里都正常工作，
--   被挡住的只是「把表达式当函数指针交给宿主」那一类用法。
--
-- 报错文案统一 DB_GUARD <表>.<规则>：应用层只会在 bug 或被绕过时看到它，
--   正常请求在路由层就被同样的上限挡住了。对外只回 500 + 泛化文案，不回显这句话。
-- ============================================================

-- ---------- users：邮箱归一化不变量 ----------
-- 路由层 normEmail() 折平大小写 / plus 段 / 尾点，这里做库级兜底：任何绕过路由层
-- 直接写库的路径（脚本、迁移、将来新增的接口）都不能再塞进变体邮箱。
-- 第三方登录的占位邮箱形如 qq_<openid>@oauth，openid 可能含大写，故整段豁免。
DROP TRIGGER IF EXISTS guard_users_email_ins;
CREATE TRIGGER guard_users_email_ins
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.email NOT LIKE '%@oauth'
 AND (NEW.email <> lower(NEW.email)
   OR NEW.email <> trim(NEW.email)
   OR NEW.email LIKE '%.'
   OR instr(NEW.email, '+') > 0
   OR instr(NEW.email, '@') < 2
   OR length(NEW.email) > 254)
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.email'); END;

CREATE TRIGGER IF NOT EXISTS guard_users_email_upd
BEFORE UPDATE OF email ON users
FOR EACH ROW
WHEN NEW.email NOT LIKE '%@oauth'
 AND (NEW.email <> lower(NEW.email)
   OR NEW.email <> trim(NEW.email)
   OR NEW.email LIKE '%.'
   OR instr(NEW.email, '+') > 0
   OR instr(NEW.email, '@') < 2
   OR length(NEW.email) > 254)
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.email'); END;

-- ---------- users：手机号形状 + 等级区间 ----------
-- phone 为空串表示未绑定，必须放行；绑定了就必须是 11 位大陆号。
CREATE TRIGGER IF NOT EXISTS guard_users_phone_ins
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.phone <> '' AND NEW.phone NOT GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.phone'); END;

CREATE TRIGGER IF NOT EXISTS guard_users_phone_upd
BEFORE UPDATE OF phone ON users
FOR EACH ROW
WHEN NEW.phone <> '' AND NEW.phone NOT GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.phone'); END;

CREATE TRIGGER IF NOT EXISTS guard_users_level_ins
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.level < 0 OR NEW.level > 100
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.level'); END;

CREATE TRIGGER IF NOT EXISTS guard_users_level_upd
BEFORE UPDATE OF level ON users
FOR EACH ROW
WHEN NEW.level < 0 OR NEW.level > 100
BEGIN SELECT RAISE(ABORT, 'DB_GUARD users.level'); END;

-- ---------- 正文长度：与路由层上限逐一对齐 ----------
-- posts.text 5000（posts.js:109）· comments.text 1000（posts.js:245）
-- messages.body 2000（chat.js:88）· threads 只有 seed 数据，给个同量级上界
CREATE TRIGGER IF NOT EXISTS guard_posts_text_ins
BEFORE INSERT ON posts
FOR EACH ROW
WHEN length(NEW.text) > 5000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD posts.text'); END;

CREATE TRIGGER IF NOT EXISTS guard_posts_text_upd
BEFORE UPDATE OF text ON posts
FOR EACH ROW
WHEN length(NEW.text) > 5000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD posts.text'); END;

CREATE TRIGGER IF NOT EXISTS guard_comments_text_ins
BEFORE INSERT ON comments
FOR EACH ROW
WHEN length(NEW.text) > 1000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD comments.text'); END;

CREATE TRIGGER IF NOT EXISTS guard_comments_text_upd
BEFORE UPDATE OF text ON comments
FOR EACH ROW
WHEN length(NEW.text) > 1000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD comments.text'); END;

CREATE TRIGGER IF NOT EXISTS guard_messages_body_ins
BEFORE INSERT ON messages
FOR EACH ROW
WHEN length(NEW.body) > 2000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD messages.body'); END;

CREATE TRIGGER IF NOT EXISTS guard_threads_len_ins
BEFORE INSERT ON threads
FOR EACH ROW
WHEN length(NEW.title) > 200 OR length(NEW.body) > 20000
BEGIN SELECT RAISE(ABORT, 'DB_GUARD threads.length'); END;

-- ---------- likes：枚举值 ----------
-- target_type 只有 post / comment / thread 三种，posts.js 只写 'post'。
-- 收成枚举后，「给任意字符串点赞」这条路在库层就断了。
CREATE TRIGGER IF NOT EXISTS guard_likes_type_ins
BEFORE INSERT ON likes
FOR EACH ROW
WHEN NEW.target_type NOT IN ('post', 'comment', 'thread')
BEGIN SELECT RAISE(ABORT, 'DB_GUARD likes.target_type'); END;

-- ---------- sessions：token 哈希形状 ----------
-- sha256 hex 恒为 64 字符；长度不对说明有人绕过 createSession 伪造会话行。
CREATE TRIGGER IF NOT EXISTS guard_sessions_hash_ins
BEFORE INSERT ON sessions
FOR EACH ROW
WHEN length(NEW.token_hash) <> 64 OR NEW.expires_at <= 0
BEGIN SELECT RAISE(ABORT, 'DB_GUARD sessions.token_hash'); END;

-- ---------- phone_codes：6 位数字 + 试错上限 ----------
CREATE TRIGGER IF NOT EXISTS guard_phone_codes_code_ins
BEFORE INSERT ON phone_codes
FOR EACH ROW
WHEN length(NEW.code) <> 6
  OR NEW.code GLOB '*[^0-9]*'
  OR NEW.phone NOT GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  OR NEW.tries < 0 OR NEW.tries > 100
BEGIN SELECT RAISE(ABORT, 'DB_GUARD phone_codes.code'); END;

CREATE TRIGGER IF NOT EXISTS guard_phone_codes_tries_upd
BEFORE UPDATE OF tries ON phone_codes
FOR EACH ROW
WHEN NEW.tries < 0 OR NEW.tries > 100
BEGIN SELECT RAISE(ABORT, 'DB_GUARD phone_codes.tries'); END;
