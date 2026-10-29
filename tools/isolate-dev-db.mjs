#!/usr/bin/env node
/**
 * 阶段 0 · 止血：把本地开发库与生产库名隔离。
 *
 * 背景：本地 server/data/jingyu.db 与线上两台的 jingyu.db 同名同构，
 *       手滑 scp / rsync 一次就能把演示数据推上生产，或把生产快照覆盖掉本地调试数据。
 * 做法：一致性备份 → 改名为 jingyu.dev.db → 本地 .env 显式指向它。
 *
 * 用法：cd <repo> && node tools/isolate-dev-db.mjs
 * 幂等：已改过名（jingyu.db 不存在）时只做检查并退出 0。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');
const LIVE = path.join(DATA, 'jingyu.db');
const DEV = path.join(DATA, 'jingyu.dev.db');
const BAKDIR = path.join(DATA, 'backup');

const log = (m) => console.log(m);
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

if (!fs.existsSync(LIVE)) {
  if (fs.existsSync(DEV)) {
    log(`[skip] jingyu.db 已不存在，jingyu.dev.db 在位（${(fs.statSync(DEV).size / 1048576).toFixed(1)} MB）`);
    process.exit(0);
  }
  log('[fail] 两个库都不存在，什么都不做');
  process.exit(1);
}

if (fs.existsSync(DEV)) {
  log('[fail] jingyu.dev.db 已存在，拒绝覆盖。先手工确认哪个是你要留的。');
  process.exit(1);
}

const Database = require(path.join(ROOT, 'server', 'node_modules', 'better-sqlite3'));
const db = new Database(LIVE);

// WAL 里可能有未 checkpoint 的事务，先合并再备份，否则备份是旧快照
db.pragma('wal_checkpoint(TRUNCATE)');
fs.mkdirSync(BAKDIR, { recursive: true });
const bak = path.join(BAKDIR, `jingyu-pre-isolate-${stamp()}.db`);
// better-sqlite3 的 db.backup() 返回 Promise，必须 await —— 否则紧接着的 close() 会让异步 backup 打不开文件
await db.backup(bak);
db.close();

// 备份体检：只读打开，integrity_check 必须 ok
const chk = new Database(bak, { readonly: true });
const ic = chk.pragma('integrity_check', { simple: true });
const users = chk.prepare('SELECT COUNT(*) c FROM users').get().c;
chk.close();
for (const sfx of ['-wal', '-shm']) {
  try { fs.unlinkSync(bak + sfx); } catch {}
}
if (ic !== 'ok') {
  log(`[fail] 备份 integrity_check=${ic}，中止改名。备份留在 ${bak}`);
  process.exit(1);
}
log(`[ok] 一致性备份 ${path.relative(ROOT, bak)}（users=${users}, integrity=${ic}）`);

// 改名（Windows 上若有句柄会抛 EBUSY，此时不改，让人先关 dev-server）
fs.renameSync(LIVE, DEV);
for (const sfx of ['-wal', '-shm']) {
  const src = LIVE + sfx;
  if (fs.existsSync(src)) fs.renameSync(src, DEV + sfx);
}
log(`[ok] jingyu.db → jingyu.dev.db（${(fs.statSync(DEV).size / 1048576).toFixed(1)} MB）`);

// 本地 .env 显式指向 dev 库，避免依赖 db.js 的默认值
const ENV = path.join(ROOT, 'server', '.env');
let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
if (/^DB_PATH=/m.test(env)) {
  env = env.replace(/^DB_PATH=.*$/m, 'DB_PATH=data/jingyu.dev.db');
} else {
  if (env && !env.endsWith('\n')) env += '\n';
  env += 'DB_PATH=data/jingyu.dev.db\n';
}
fs.writeFileSync(ENV, env, 'utf8');
log('[ok] server/.env 已写入 DB_PATH=data/jingyu.dev.db');
log('');
log('完成。本地从此只碰 jingyu.dev.db；生产库只能通过 deploy.sh db-pull 单向拉取到 .tmp/。');
