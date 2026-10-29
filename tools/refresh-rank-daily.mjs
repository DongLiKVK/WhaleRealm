#!/usr/bin/env node
/* ======================================================================
   tools/refresh-rank-daily.mjs —— AI 排行快照的每日刷新器

   为什么需要它：
      js/rank-data.js 与 js/livebench-data.js 在构建时按内容哈希发布成
      dist/assets/<name>.<hash>.js。每天 00:00 想换数据，不能原地改旧文件
      （Cloudflare / 浏览器都按 immutable 缓存），只能：抓新数据 -> 算新哈希
      -> 先写新资源 -> 再原子替换 index.html 里的两条 script src。
      新 URL 天然绕过缓存，旧文件留作回滚。

   它做四件事：
      1) 在 RANK_WORKDIR 里跑 tools/fetch-rank.mjs 和 fetch-livebench.mjs
      2) 用 vm 读出两份 DATA，做数量/日期/新鲜度校验
      3) 把通过校验的产物发布到 DIST/assets，并改写 DIST/index.html
      4) 写 last-run.json，保留最近 KEEP 份资源与 20 份 index 备份

   任何一个数据源失败都不会拦住另一个；两个都失败才返回非零。
   LiveBench 上游目前偶尔只发布 table.csv、不发布 models.json，
   这种不完整版本会被跳过并保留上一份完整数据。

   用法：
     node tools/refresh-rank-daily.mjs
     RANK_WORKDIR=... RANK_DIST=... RANK_BACKUP=... node tools/refresh-rank-daily.mjs

   生产：由 jingyu-rank-refresh.timer 每天 00:00 Asia/Shanghai 调用。
   ====================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const WORKDIR = path.resolve(process.env.RANK_WORKDIR || '/var/www/jingyu-rank');
const DIST = path.resolve(process.env.RANK_DIST || '/var/www/jingyu/dist');
const BACKUP = path.resolve(process.env.RANK_BACKUP || '/var/www/jingyu/backup');
const KEEP = Math.max(2, Number(process.env.RANK_KEEP || 8));
const TZ = process.env.TZ || 'Asia/Shanghai';
const LOCK = path.join(WORKDIR, '.refresh.lock');
const STATUS = path.join(WORKDIR, 'last-run.json');
const RE_SPECIAL = /[.*+?^$()|[\]\\{}]/g;

const SOURCES = [
  {
    key: 'aa',
    name: 'Artificial Analysis',
    script: 'tools/fetch-rank.mjs',
    file: 'js/rank-data.js',
    global: 'AIRankData',
    prefix: 'rank-data',
    minModels: 50,
    attempts: 3
  },
  {
    key: 'lb',
    name: 'LiveBench',
    script: 'tools/fetch-livebench.mjs',
    file: 'js/livebench-data.js',
    global: 'LiveBenchData',
    prefix: 'livebench-data',
    minModels: 20,
    attempts: 1
  }
];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function tail(text, lines = 6) {
  return String(text || '').trim().split(/\r?\n/).slice(-lines).join(' | ').slice(0, 1200);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  fs.mkdirSync(WORKDIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeSync(fd, process.pid + ' ' + new Date().toISOString() + '\n');
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let stale = false;
    try {
      stale = Date.now() - fs.statSync(LOCK).mtimeMs > 3 * 3600 * 1000;
    } catch (_) { stale = true; }
    if (stale) {
      try { fs.unlinkSync(LOCK); } catch (_) {}
      return acquireLock();
    }
    log('skip: 另一个刷新进程仍在运行（' + LOCK + '）');
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK); } catch (_) {}
}

function seedFromDist(s) {
  const dst = path.join(WORKDIR, s.file);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 1000) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const candidates = [];
  const assets = path.join(DIST, 'assets');
  if (fs.existsSync(assets)) {
    const re = new RegExp('^' + s.prefix.replace(RE_SPECIAL, '\\$&') + '\\.[a-f0-9]{8}\\.js$');
    for (const name of fs.readdirSync(assets)) {
      if (!re.test(name)) continue;
      const full = path.join(assets, name);
      candidates.push({ full, mtime: fs.statSync(full).mtimeMs });
    }
  }
  const stable = path.join(DIST, 'js', s.prefix + '.js');
  if (fs.existsSync(stable)) candidates.push({ full: stable, mtime: 0 });
  candidates.sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) {
    log('warn: ' + s.file + ' 不存在，且 dist 里找不到可继承的上一版；本次没有"名次变化"基线');
    return;
  }
  fs.copyFileSync(candidates[0].full, dst);
  log('seed: ' + s.file + ' <- ' + path.relative(DIST, candidates[0].full));
}

function runFetch(s) {
  let last = null;
  for (let i = 1; i <= s.attempts; i++) {
    last = spawnSync(process.execPath, [path.join(WORKDIR, s.script)], {
      cwd: WORKDIR,
      env: { ...process.env, TZ },
      encoding: 'utf8',
      timeout: 240000,
      maxBuffer: 8 * 1024 * 1024
    });
    if (last.status === 0) {
      return { ok: true, attempts: i, stdout: last.stdout || '', stderr: last.stderr || '' };
    }
    log('warn: ' + s.key + ' 第 ' + i + '/' + s.attempts + ' 次抓取失败（exit=' +
      last.status + (last.signal ? ', signal=' + last.signal : '') + '）：' + tail(last.stderr));
    if (i < s.attempts) sleepSync(15000);
  }
  return { ok: false, attempts: s.attempts, stdout: (last && last.stdout) || '', stderr: (last && last.stderr) || '' };
}

function loadSnapshot(file, globalName) {
  const code = fs.readFileSync(file, 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx, { timeout: 5000, filename: file });
  const data = ctx[globalName];
  if (!data || !Array.isArray(data.models)) {
    throw new Error(file + ' 没有导出 ' + globalName + '.models');
  }
  return data;
}

function validate(s, data, prev) {
  const models = data.models;
  if (models.length < s.minModels) {
    throw new Error(s.name + ' 只有 ' + models.length + ' 个模型，低于安全下限 ' + s.minModels);
  }
  if (!data.meta || !/^\d{4}-\d{2}-\d{2}/.test(String(data.meta.asOf || ''))) {
    throw new Error(s.name + ' 缺少有效 meta.asOf');
  }
  if (!data.meta.fetchedAt) throw new Error(s.name + ' 缺少 meta.fetchedAt');
  if (s.key === 'lb' && !data.meta.release) throw new Error('LiveBench 缺少 meta.release');
  const names = new Set();
  for (const m of models) {
    if (!m || typeof m.n !== 'string' || !m.n.trim()) throw new Error(s.name + ' 存在没有显示名的模型行');
    names.add(m.n);
  }
  if (names.size < models.length * 0.95) {
    throw new Error(s.name + ' 显示名重复过多（' + (models.length - names.size) + ' 行）');
  }
  if (prev && prev.models.length && models.length < prev.models.length * 0.5) {
    throw new Error(s.name + ' 模型数从 ' + prev.models.length + ' 骤降到 ' + models.length + '，疑似上游结构变化，拒绝发布');
  }
  return { models: models.length, asOf: data.meta.asOf, fetchedAt: data.meta.fetchedAt };
}

function publish(s, file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 2000 || buf.length > 8 * 1024 * 1024) {
    throw new Error(s.name + ' 产物大小异常：' + buf.length + ' 字节');
  }
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const name = s.prefix + '.' + hash + '.js';
  const dir = path.join(DIST, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  let created = false;
  if (!fs.existsSync(target)) {
    const tmp = path.join(dir, '.' + name + '.tmp-' + process.pid);
    fs.writeFileSync(tmp, buf, { mode: 0o644 });
    try {
      const st = fs.statSync(dir);
      if (typeof process.getuid === 'function' && process.getuid() === 0) fs.chownSync(tmp, st.uid, st.gid);
    } catch (_) {}
    fs.renameSync(tmp, target);
    created = true;
  }
  try { fs.chmodSync(target, 0o644); } catch (_) {}
  return { prefix: s.prefix, name, hash, bytes: buf.length, created };
}

function backupIndex(indexPath) {
  fs.mkdirSync(BACKUP, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  const dest = path.join(BACKUP, 'index.html.rank-' + stamp);
  fs.copyFileSync(indexPath, dest);
  return dest;
}

function scriptRe(prefix) {
  const base = prefix.replace(RE_SPECIAL, '\\$&');
  return new RegExp('src="(?:assets/|js/)' + base + '(?:\\.[a-f0-9]{8})?\\.js"', 'g');
}

function currentAssetsFromIndex() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const keep = new Set();
  for (const s of SOURCES) {
    const re = scriptRe(s.prefix);
    let m;
    while ((m = re.exec(html))) {
      const hit = /assets\/([^"]+\.js)/.exec(m[0]);
      if (hit) keep.add(hit[1]);
    }
  }
  return keep;
}

function rewriteIndex(published) {
  const indexPath = path.join(DIST, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  for (const p of published) {
    const re = scriptRe(p.prefix);
    const matches = html.match(re) || [];
    if (matches.length !== 1) {
      throw new Error('index.html 里 ' + p.prefix + ' 的 script 引用数量是 ' + matches.length + '，预期 1；不发布，避免页面缺数据');
    }
    html = html.replace(re, 'src="assets/' + p.name + '"');
  }
  const backup = backupIndex(indexPath);
  const st = fs.statSync(indexPath);
  const tmp = path.join(DIST, '.index.html.tmp-' + process.pid);
  fs.writeFileSync(tmp, html, { mode: st.mode & 0o777 });
  try {
    if (typeof process.getuid === 'function' && process.getuid() === 0) fs.chownSync(tmp, st.uid, st.gid);
  } catch (_) {}
  fs.renameSync(tmp, indexPath);
  return backup;
}

function pruneOldAssets(keep) {
  const dir = path.join(DIST, 'assets');
  let removed = 0;
  for (const s of SOURCES) {
    const re = new RegExp('^' + s.prefix.replace(RE_SPECIAL, '\\$&') + '\\.[a-f0-9]{8}\\.js$');
    const rows = fs.readdirSync(dir)
      .filter((n) => re.test(n) && !keep.has(n))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const row of rows.slice(KEEP - 1)) {
      try { fs.unlinkSync(path.join(dir, row.n)); removed++; } catch (_) {}
    }
  }
  return removed;
}

function pruneBackups() {
  try {
    const rows = fs.readdirSync(BACKUP)
      .filter((n) => /^index\.html\.rank-\d{8}-\d{6}$/.test(n))
      .map((n) => ({ n, t: fs.statSync(path.join(BACKUP, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const row of rows.slice(20)) fs.unlinkSync(path.join(BACKUP, row.n));
  } catch (_) {}
}

function writeStatus(result) {
  try {
    fs.mkdirSync(WORKDIR, { recursive: true });
    const tmp = STATUS + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, STATUS);
  } catch (e) {
    log('warn: 写 last-run.json 失败：' + e.message);
  }
}

const result = {
  at: new Date().toISOString(),
  timezone: TZ,
  workdir: WORKDIR,
  dist: DIST,
  ok: false,
  sources: {},
  published: [],
  indexBackup: null,
  removedAssets: 0,
  error: null
};

if (!acquireLock()) process.exit(0);
try {
  fs.mkdirSync(path.join(WORKDIR, 'js'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  fs.mkdirSync(BACKUP, { recursive: true });

  for (const s of SOURCES) {
    const state = { status: 'pending', prevModels: 0, models: 0, asOf: null, fetchedAt: null };
    result.sources[s.key] = state;
    seedFromDist(s);
    const local = path.join(WORKDIR, s.file);
    let prev = null;
    try { prev = loadSnapshot(local, s.global); } catch (_) {}
    state.prevModels = prev && prev.models ? prev.models.length : 0;

    const run = runFetch(s);
    if (!run.ok) {
      state.status = 'skipped';
      state.error = tail(run.stderr, 4) || '抓取失败';
      log('skip: ' + s.name + ' 本次不发布，保留上一版：' + state.error);
      continue;
    }
    try {
      const data = loadSnapshot(local, s.global);
      const stats = validate(s, data, prev);
      state.models = stats.models;
      state.asOf = stats.asOf;
      state.fetchedAt = stats.fetchedAt;
      state.tail = tail(run.stdout, 4);
      result.published.push(publish(s, local));
      state.status = 'published';
      log('ok: ' + s.name + ' asOf=' + stats.asOf + ' models=' + stats.models);
    } catch (e) {
      state.status = 'rejected';
      state.error = e.message;
      log('reject: ' + s.name + '：' + e.message);
    }
  }

  if (result.published.length) {
    result.indexBackup = rewriteIndex(result.published);
    log('index.html 已原子替换；备份 ' + result.indexBackup);
    result.removedAssets = pruneOldAssets(currentAssetsFromIndex());
    pruneBackups();
    result.ok = true;
  } else {
    log('没有可发布的数据源，index.html 保持不变');
  }
} catch (e) {
  result.error = e.message;
  log('error: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
} finally {
  writeStatus(result);
  releaseLock();
}

if (!result.ok) process.exitCode = 1;
