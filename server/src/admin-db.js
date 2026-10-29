/**
 * 后台管理 · 建表 + 幂等迁移 + 内置角色种子
 * 契约：docs/admin-api.md 第 2 节（权限目录 / 内置角色）
 *
 * 为什么这个文件同时放「静态目录」和「迁移」：
 *   权限目录（PERMISSIONS）是建角色种子时的唯一依据，也是 GET /permissions 的返回值；
 *   放两处迟早会漂移。而它又不能放进 admin-guard.js —— guard 在模块顶层 require('./db')
 *   取连接，db.js 启动时回头 require 本文件初始化，会形成 db → admin-db → guard → db 的
 *   环，环里先拿到的是空 exports（db 还没赋值），guard 里的 prepare 会直接崩。
 *   所以静态目录留在这里（不依赖 db），guard 反向 require 本文件再转出。
 *
 * 幂等口径：
 *   建表用 CREATE TABLE IF NOT EXISTS；补列先查 PRAGMA table_info；角色用 INSERT OR IGNORE。
 *   存量库里 posts/users 没有新列时补上默认值（历史帖子一律 published、用户一律 active）。
 *   任何一步失败都只 console.warn，不抛给 db.js —— 后台建不起来时站点必须照常能跑。
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** 本地时间戳；不能 require('./db') 的 now()，理由见文件头 */
function ts() {
  return Math.floor(Date.now() / 1000);
}

/* ---------- 权限目录 ----------
   顺序即后台「角色权限」页的渲染顺序，也是 /permissions 的返回顺序，不要按字母重排。 */
const PERMISSIONS = [
  { key: 'dashboard.view', label: '查看工作台', group: 'dashboard', desc: '概览指标与待办' },
  { key: 'post.view', label: '查看帖子', group: 'content', desc: '列表、详情、搜索' },
  { key: 'post.edit', label: '编辑帖子', group: 'content', desc: '改正文 / 置顶' },
  { key: 'post.review', label: '审核帖子', group: 'content', desc: '通过 / 驳回 / 打回待审' },
  { key: 'post.delete', label: '删除帖子', group: 'content', desc: '单条删除、批量删除' },
  /* 插件条目库是本站最大的一块内容（6700+ 条），它的「上/下架」就是审核状态本身：
     status 不在 published 的条目会从公开列表和条目页一起消失。所以 review 与 view 必须分权，
     否则「只能看不能改」的角色会拿到一条隐形的下架按钮。 */
  { key: 'plugin.view', label: '查看插件', group: 'content', desc: '条目列表、分类统计、审核状态' },
  { key: 'plugin.edit', label: '审核插件', group: 'content', desc: '上架 / 驳回 / 下架，批量操作' },
  { key: 'report.view', label: '查看举报', group: 'content', desc: '举报列表、详情、目标链接' },
  { key: 'report.edit', label: '处理举报', group: 'content', desc: '改处理状态、下架被举报对象' },
  { key: 'user.view', label: '查看用户', group: 'user', desc: '列表、注册信息、详情' },
  { key: 'user.edit', label: '编辑用户', group: 'user', desc: '改等级、徽章' },
  { key: 'user.status', label: '禁用/启用用户', group: 'user', desc: '需填写原因' },
  { key: 'user.delete', label: '删除用户', group: 'user', desc: '级联删除，二次确认' },
  { key: 'reward.view', label: '查看奖励', group: 'ops', desc: '发放历史' },
  { key: 'reward.grant', label: '发放奖励', group: 'ops', desc: '新增一条奖励记录' },
  { key: 'reward.revoke', label: '撤回奖励', group: 'ops', desc: '撤回并写原因' },
  { key: 'role.view', label: '查看角色', group: 'rbac', desc: '角色与权限矩阵只读' },
  { key: 'role.manage', label: '管理角色', group: 'rbac', desc: '新建/编辑/删除角色' },
  { key: 'admin.view', label: '查看管理员', group: 'rbac', desc: '管理员账号列表' },
  { key: 'admin.manage', label: '管理管理员', group: 'rbac', desc: '建号/改角色/停用/重置密码/删除' },
  { key: 'log.viewAll', label: '查看全部日志', group: 'system', desc: '没有此权限时只能看自己的日志' },
  { key: 'log.export', label: '导出日志', group: 'system', desc: 'CSV 导出' }
];

/** 分组顺序与中文名（同样顺序即 UI 顺序） */
const GROUPS = [
  { key: 'dashboard', label: '工作台' },
  { key: 'content', label: '内容' },
  { key: 'user', label: '用户' },
  { key: 'ops', label: '运营' },
  { key: 'rbac', label: '权限' },
  { key: 'system', label: '系统' }
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

/**
 * 权限过滤：未知 key 直接丢（契约第 2 节），去重，并按目录顺序重排。
 * 重排是为了「同一组权限无论前端勾选顺序如何，落库与会显都一致」—— 比较两份角色
 * 权限时不用再排序，日志里的 before/after 也能直接 diff。
 */
function normalizePermissions(list) {
  const seen = new Set();
  for (const v of Array.isArray(list) ? list : []) {
    if (typeof v === 'string' && ALL_KEYS.indexOf(v) >= 0) seen.add(v);
  }
  return ALL_KEYS.filter((k) => seen.has(k));
}

/** 内置角色种子：权限按契约第 2 节的表逐条抄下来 */
const ROLE_SEEDS = [
  {
    key: 'owner',
    name: '超级管理员',
    description: '拥有全部权限，负责给其他人分配角色',
    permissions: ALL_KEYS.slice()
  },
  {
    key: 'admin',
    name: '管理员',
    description: '除角色与管理员管理外的全部权限',
    permissions: ALL_KEYS.filter((k) => k !== 'role.manage' && k !== 'admin.manage')
  },
  {
    key: 'editor',
    name: '编辑',
    description: '内容审核与用户查看，不能删除内容',
    permissions: [
      'dashboard.view',
      'post.view', 'post.edit', 'post.review',
      'plugin.view', 'plugin.edit',
      'report.view', 'report.edit',
      'user.view', 'reward.view'
    ]
  },
  {
    key: 'staff',
    name: '普通员工',
    description: '只读：工作台、帖子、用户、奖励',
    permissions: ['dashboard.view', 'post.view', 'plugin.view', 'report.view', 'user.view', 'reward.view']
  }
];

/* ---------- 补列清单 ----------
   只在 prisma table_info 里没有这一列时才 ALTER；SQLite 的 ADD COLUMN 必须给常量默认值，
   否则存量行拿不到值（而 NOT NULL 又不允许空），所以下面每条都带 DEFAULT。 */
const COLUMNS = [
  ['posts', 'status', "TEXT NOT NULL DEFAULT 'published'"],      // published / pending / rejected / hidden
  ['posts', 'review_note', "TEXT NOT NULL DEFAULT ''"],
  ['posts', 'reviewed_by', 'INTEGER NOT NULL DEFAULT 0'],        // admin_accounts.id，0 = 未审核
  ['posts', 'reviewed_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'status', "TEXT NOT NULL DEFAULT 'active'"],         // active / disabled
  ['users', 'disabled_reason', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'disabled_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'points', 'INTEGER NOT NULL DEFAULT 0'],             // 奖励发放的积分余额
  /* 头像框覆盖：站点 schema.sql 里已给新库建了这一列；老库没有，靠这里补。
     '' = 跟随会员档位（默认）、none = 不戴、maw-1..4 = 指定等级。 */
  ['users', 'frame', "TEXT NOT NULL DEFAULT ''"],
  /* 会员/头像框发放的类型快照：老库的 rewards 没有这三列，补上之后
     type=days 的「档位」和 type=frame 的「框 / 改前值」才有地方落。 */
  /* 后台账号的两步验证（TOTP）。老库没有这些列，登录时 SELECT * 会直接拿到 undefined，
     所以在 initAdminSchema 里一并补上；新库由 schema-admin.sql 建。 */
  ['admin_accounts', 'totp_secret', "TEXT NOT NULL DEFAULT ''"],
  ['admin_accounts', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['admin_accounts', 'totp_confirmed_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['admin_accounts', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0'],
  ['admin_accounts', 'totp_pending_secret', "TEXT NOT NULL DEFAULT ''"],
  ['admin_accounts', 'totp_pending_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['rewards', 'tier', "TEXT NOT NULL DEFAULT ''"],
  ['rewards', 'frame', "TEXT NOT NULL DEFAULT ''"],
  ['rewards', 'prev_frame', "TEXT NOT NULL DEFAULT ''"]
];

/* 依赖新列的索引只能在这里建：schema-admin.sql 先于补列执行，老库上会「no such column」 */
const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)',
  'CREATE INDEX IF NOT EXISTS idx_posts_review ON posts(status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)'
];

function hasColumn(db, table, column) {
  // 表名来自本文件常量，不是用户输入；PRAGMA 也不支持参数绑定，所以只能拼字符串。
  const rows = db.prepare('PRAGMA table_info(' + table + ')').all();
  return rows.some((r) => r.name === column);
}

function tryExec(db, sql, warnings, label) {
  try {
    db.exec(sql);
    return true;
  } catch (err) {
    warnings.push(label + ': ' + (err && err.message));
    console.warn('[admin] ' + label + ' 失败：' + (err && err.message));
    return false;
  }
}

/** 写入 4 个内置角色（幂等）。不覆盖已有角色的名称/描述/权限 —— 后台改过的东西不该被重启冲掉。 */
function seedRoles(db, warnings) {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO admin_roles (key, name, description, permissions, builtin, created_at, updated_at)' +
    ' VALUES (?, ?, ?, ?, 1, ?, ?)'
  );
  const at = ts();
  for (const role of ROLE_SEEDS) {
    try {
      ins.run(role.key, role.name, role.description, JSON.stringify(role.permissions), at, at);
    } catch (err) {
      warnings.push('角色 ' + role.key + ' 写入失败: ' + (err && err.message));
      console.warn('[admin] 内置角色 ' + role.key + ' 写入失败：' + (err && err.message));
    }
  }
  // 手工建过同名角色（比如从旧版本升级）时把 builtin 补上，否则它会被当成自定义角色删掉
  try {
    db.prepare("UPDATE admin_roles SET builtin = 1 WHERE key IN ('owner','admin','editor','staff') AND builtin <> 1").run();
  } catch (err) {
    warnings.push('内置角色标记补写失败: ' + (err && err.message));
  }

  /* owner 的权限自愈：契约规定 owner 权限不可编辑，所以把它补回全量是安全的；
     反过来说，如果 owner 权限被写坏（空数组 / 非法 key），后台会「谁都进不去任何页面」，
     只能改库救场。每次启动对一遍，代价是一次 SELECT。 */
  try {
    const owner = db.prepare("SELECT id, permissions FROM admin_roles WHERE key = 'owner'").get();
    if (owner) {
      let stored = [];
      try { stored = JSON.parse(owner.permissions || '[]'); } catch { stored = []; }
      const fixed = normalizePermissions(stored);
      if (fixed.length !== ALL_KEYS.length) {
        db.prepare('UPDATE admin_roles SET permissions = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(ALL_KEYS), ts(), owner.id);
        console.warn('[admin] owner 角色权限不完整，已自愈为全部 ' + ALL_KEYS.length + ' 项');
      }
    }
  } catch (err) {
    warnings.push('owner 权限自愈失败: ' + (err && err.message));
  }

  /* ---------- 新增权限的一次性下发 ----------
     为什么需要这一段：seedRoles 用的是 INSERT OR IGNORE —— 老库里四个内置角色早就存在，
     新增的 plugin.view / plugin.edit / report.view / report.edit 永远进不去它们的 permissions，
     结果是「升级完后台多了两个页面，但除 owner 外没人看得见」。
     为什么不每次启动都无条件对齐：admin / editor / staff 的权限是可由站长编辑的，
     无条件覆盖会把人工调整冲掉。
     判据：如果**没有任何一个角色**含 plugin.view，说明这次升级还没下发过（新权限刚出现），
     此时按 ROLE_SEEDS 的定义补给对应角色；只要有一个角色已经有了，就认为下发过，永不再动。
     这条判据幂等、且只多不少，不会把谁已有的权限删掉。 */
  const NEW_KEYS = ['plugin.view', 'plugin.edit', 'report.view', 'report.edit'];
  try {
    const all = db.prepare('SELECT id, key, permissions FROM admin_roles').all();
    let touched = 0;
    for (const r of all) {
      const seed = ROLE_SEEDS.filter((s) => s.key === r.key)[0];
      if (!seed) continue;                       // 自定义角色不动：它的权限是站长自己勾的
      const want = seed.permissions.filter((k) => NEW_KEYS.indexOf(k) >= 0);
      if (!want.length) continue;
      let list = [];
      try { list = JSON.parse(r.permissions || '[]'); } catch { list = []; }
      const missing = want.filter((k) => list.indexOf(k) < 0);
      if (!missing.length) continue;             // 已经有了，绝不重复写
      const merged = normalizePermissions(list.concat(missing));
      db.prepare('UPDATE admin_roles SET permissions = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(merged), ts(), r.id);
      touched += 1;
    }
    if (touched) console.warn('[admin] 已向 ' + touched + ' 个内置角色补发新权限（插件审核 / 举报处理）');
  } catch (err) {
    warnings.push('新权限下发失败: ' + (err && err.message));
    console.warn('[admin] 新权限下发失败：' + (err && err.message));
  }
}

/**
 * 入口：db.js 在现有 schema 与守卫之后调用。
 * 返回 { ok, warnings } 只为方便 seed-admin 打印；调用方不需要处理返回值。
 */
function initAdminSchema(db) {
  const warnings = [];
  const file = path.join(__dirname, 'schema-admin.sql');
  let sql = '';
  try {
    sql = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.warn('[admin] 读不到 schema-admin.sql，后台功能不可用：' + (err && err.message));
    return { ok: false, warnings: ['schema-admin.sql 读取失败'] };
  }

  if (!tryExec(db, sql, warnings, '后台表初始化')) {
    // 建表都失败了，后面的补列/索引没有意义；但也不能抛，站点要继续跑
    return { ok: false, warnings };
  }

  for (const [table, column, ddl] of COLUMNS) {
    try {
      if (hasColumn(db, table, column)) continue;
      db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
    } catch (err) {
      warnings.push(table + '.' + column + ': ' + (err && err.message));
      console.warn('[admin] 补列 ' + table + '.' + column + ' 失败：' + (err && err.message));
    }
  }

  for (const sqlText of INDEXES) {
    tryExec(db, sqlText, warnings, '索引 ' + sqlText.split(' ')[5]);
  }

  seedRoles(db, warnings);

  /* 级联删除是「删帖清评论 / 删用户清帖子」的兜底，必须确认它真的开着。
     应用层每一步都手动删了关联行，所以这里只告警不阻断；但一旦有人关了这两个 pragma，
     后台删除会留下孤儿行，日志里得留下线索。 */
  try {
    const on = db.pragma('foreign_keys', { simple: true });
    if (!on) console.warn('[admin] foreign_keys 未开启，级联删除可能残留孤儿行');
  } catch (err) {
    warnings.push('foreign_keys 自检失败: ' + (err && err.message));
  }

  if (warnings.length) {
    console.warn('[admin] 后台初始化完成但有 ' + warnings.length + ' 处告警：' + warnings.join(' / '));
  }
  return { ok: warnings.length === 0, warnings };
}

module.exports = {
  initAdminSchema,
  PERMISSIONS,
  GROUPS,
  ALL_KEYS,
  ROLE_SEEDS,
  normalizePermissions
};