/**
 * 增量同步种子数据（不删库、不动已有用户与帖子）
 *
 * 背景（2026-10-22 排查结论）：
 *   scripts/seed.js 的幂等守卫是「posts 表非空就整体跳过」。线上库 2026-10-21 就有 5 条帖子，
 *   于是之后新增的 8 个版块 / 19 个插件 / 主题帖一条都没进库 —— 表现为「前端功能没完全部署」：
 *   云端左栏只有 6 个版块（本地 14），插件库只有 9 条（本地 28），分类还是旧的 5 项（本地 23）。
 *
 * 做法：按 slug / email / (forum_slug,title) 做 upsert。
 *   · 版块的 name/icon/desc/sort 以 seed.js 为准覆盖（dev 由「插件开发」改名「技术开发」等）；
 *   · 插件、用户按唯一键 DO NOTHING，已存在的原样保留（不会覆盖真实用户改过的资料）；
 *   · 主题帖没有唯一约束，先按 (forum_slug,title) 查重再插；
 *   · 最后重算 forums.thread_count。
 *
 * 用法：cd /var/www/jingyu/server && node scripts/sync-seed.js
 * 回滚：执行前先备份 data/jingyu.db（含 -wal/-shm），失败就换回去。
 */
'use strict';

const { db } = require('../src/db');
const { FORUMS, PLUGINS, USERS, THREADS } = require('./seed');

const ts = Math.floor(Date.now() / 1000);
const count = (t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;

console.log('同步前：版块 ' + count('forums') + ' · 插件 ' + count('plugins') + ' · 主题 ' + count('threads') + ' · 用户 ' + count('users'));

const tx = db.transaction(() => {
  let addForum = 0, updForum = 0, addPlugin = 0, addThread = 0;

  const insUser = db.prepare(
    'INSERT INTO users (email,password_hash,name,emoji,grad,level,badge,sig,city,fans,follows,visits,created_at,updated_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING'
  );
  const demoHash = '$2a$10$p5ziogiCfdZ/f8fn.Pz1mOq/01iWJeJZEOwle3b7HhSIdVRVLtxDm';
  USERS.forEach((u, i) => {
    insUser.run('demo' + (i + 1) + '@jingyu.local', demoHash, u.name, u.emoji, u.grad, u.level, u.badge, u.sig, u.city, u.fans, u.follows, u.visits, ts, ts);
  });

  const upsertForum = db.prepare(
    'INSERT INTO forums (slug,name,icon,desc,sort,thread_count,created_at) VALUES (?,?,?,?,?,0,?) ' +
    'ON CONFLICT(slug) DO UPDATE SET name=excluded.name, icon=excluded.icon, desc=excluded.desc, sort=excluded.sort'
  );
  const hasForum = db.prepare('SELECT 1 AS x FROM forums WHERE slug=?');
  FORUMS.forEach((f) => {
    if (hasForum.get(f.slug)) updForum++; else addForum++;
    upsertForum.run(f.slug, f.name, f.icon, f.desc, f.sort, ts);
  });

  const insPlugin = db.prepare(
    'INSERT INTO plugins (slug,icon,grad,author_id,ver,cat,desc,stars,installs,tags,hot,license,repo,homepage,tier,source,claimed,mirror,freshness,why,file_name,file_size,file_size_b,file_sha,collected_at,synced_at,created_at,updated_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO NOTHING'
  );
  PLUGINS.forEach((p) => {
    const r = insPlugin.run(p.slug, p.icon, p.grad, p.author, p.ver, p.cat, p.desc, p.stars, p.installs, p.tags, p.hot, p.license, p.repo, p.homepage, p.tier, p.source, p.claimed, p.mirror, p.freshness, p.why || '', p.file_name || '', p.file_size || '', p.file_size_b || 0, p.file_sha || '', ts, ts, ts, ts);
    if (r.changes) addPlugin++;
  });

  const hasThread = db.prepare('SELECT 1 AS x FROM threads WHERE forum_slug=? AND title=?');
  const insThread = db.prepare(
    'INSERT INTO threads (forum_slug,user_id,title,body,tag,tags,excerpt,replies,views,likes,hot,top,solved,closed,reactions,last_user,last_at,created_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)'
  );
  THREADS.forEach((t, i) => {
    if (hasThread.get(t.forum, t.title)) return;
    insThread.run(t.forum, t.user, t.title, t.excerpt, t.tag, t.tags, t.excerpt, t.replies, t.views, t.likes, t.hot, t.top, t.solved, t.reactions, t.user, ts - i * 3600, ts - i * 86400);
    addThread++;
  });

  db.prepare('UPDATE forums SET thread_count = (SELECT COUNT(*) FROM threads WHERE threads.forum_slug = forums.slug)').run();
  return { addForum, updForum, addPlugin, addThread };
});

const r = tx();
console.log('本次新增：版块 +' + r.addForum + ' · 版块字段更新 ' + r.updForum + ' · 插件 +' + r.addPlugin + ' · 主题 +' + r.addThread);
console.log('同步后：版块 ' + count('forums') + ' · 插件 ' + count('plugins') + ' · 主题 ' + count('threads') + ' · 用户 ' + count('users'));
console.log('版块顺序：' + db.prepare('SELECT slug FROM forums ORDER BY sort, id').all().map((x) => x.slug).join(','));
