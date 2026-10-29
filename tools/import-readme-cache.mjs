#!/usr/bin/env node
/**
 * 把境内灾备库的插件文档缓存导入境外生产库（在境外机以 root 运行）
 *
 * 用法：ssh -F ~/.ssh/config_whale whale 'sudo node -' < tools/import-readme-cache.mjs
 * 前置：/tmp/import-cn.db 已就位（境内 jingyu.db 的完整副本）
 *
 * 为什么是 INSERT OR REPLACE 而不是 IGNORE：
 *   对比过 fetched_at —— 境外那 17 条 readmes 全部比境内旧或同期，0 条更新。
 *   IGNORE 会把旧数据留下来，REPLACE 才让境内那份更新的缓存生效。
 *   外键指向 plugins(id)，两库 plugins 完全一致（6716 条），不会产生孤儿行。
 *
 * 安全：导入前先对生产库做在线热备；整个过程包在 BEGIN IMMEDIATE 事务里，失败即回滚。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = '/var/www/jingyu/server';
const SRC = '/tmp/import-cn.db';
const DST = path.join(APP, 'data/jingyu.db');
const BAKDIR = '/var/backups/jingyu';
const Database = require(path.join(APP, 'node_modules', 'better-sqlite3'));

if (!fs.existsSync(SRC)) {
  console.error('[FAIL] 源库不存在:', SRC);
  process.exit(1);
}
const srcSize = fs.statSync(SRC).size;
console.log(`[0] 源库 ${SRC} = ${(srcSize / 1048576).toFixed(1)} MB`);

(async () => {
  const db = new Database(DST);
  db.pragma('busy_timeout = 30000');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  fs.mkdirSync(BAKDIR, { recursive: true });
  const bak = path.join(BAKDIR, `pre-readme-import-${stamp}.db`);
  await db.backup(bak);
  console.log(`[1] 生产库已备份 ${bak}（${(fs.statSync(bak).size / 1048576).toFixed(1)} MB）`);

  const cnt = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const before = { r: cnt('plugin_readmes'), d: cnt('plugin_readme_docs') };
  console.log(`[2] 导入前 readmes=${before.r} docs=${before.d}`);

  db.exec(`ATTACH '${SRC}' AS src`);
  const ic = db.pragma('src.integrity_check', { simple: true });
  console.log(`[3] 源库 integrity=${ic}`);
  if (ic !== 'ok') {
    db.exec('DETACH src');
    db.close();
    console.error('[FAIL] 源库损坏，中止');
    process.exit(1);
  }

  const t0 = Date.now();
  let r1, r2;
  db.exec('BEGIN IMMEDIATE');
  try {
    r1 = db.prepare('INSERT OR REPLACE INTO main.plugin_readmes SELECT * FROM src.plugin_readmes').run();
    r2 = db.prepare('INSERT OR REPLACE INTO main.plugin_readme_docs SELECT * FROM src.plugin_readme_docs').run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    db.exec('DETACH src');
    db.close();
    console.error('[FAIL] 导入失败已回滚:', e.message);
    process.exit(1);
  }
  const ms = Date.now() - t0;
  db.exec('DETACH src');

  const after = { r: cnt('plugin_readmes'), d: cnt('plugin_readme_docs') };
  console.log(`[4] 导入完成 ${ms}ms`);
  console.log(`    readmes ${before.r} → ${after.r}（写入 ${r1.changes} 行）`);
  console.log(`    docs    ${before.d} → ${after.d}（写入 ${r2.changes} 行）`);
  console.log(`[5] integrity_check = ${db.pragma('integrity_check', { simple: true })}`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log(`[6] 库大小 = ${(fs.statSync(DST).size / 1048576).toFixed(1)} MB`);
  db.close();
})().catch((e) => {
  console.error('[FAIL]', e.message);
  process.exit(1);
});
