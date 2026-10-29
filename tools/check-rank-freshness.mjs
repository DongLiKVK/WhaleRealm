#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   榜单新鲜度体检 —— 零依赖，直接 node tools/check-rank-freshness.mjs

   两个数据源各查一遍：
     · AA 智能指数  js/rank-data.js       （tools/fetch-rank.mjs）
     · LiveBench    js/livebench-data.js  （tools/fetch-livebench.mjs）

   这份体检回答的是「抓没抓、抓的是哪天的、过期没有、数据自不自洽」，
   而不是「分数准不准」—— 分数的解释权分别在 Artificial Analysis 与 LiveBench。

   每个数据源六项：
     1) 文件存在、挂出了 window 变量、meta 字段齐全、source 是 http(s)、mode 认识；
     2) 元数据自洽：asOf = fetchedAt 的日期部分、nextDue = asOf + cadenceDays；
     3) 今天（本机时区）离 nextDue 还有几天，过期退出码 1（可挂 CI）；
     4) 数据体检：条数、国内条数、各自的取值域与覆盖率；
     5) 全站扫一遍：别处有没有又写死日期 / 周次（写死就会和 meta 各说各话）；
     6) 一行结论。
   ═══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  aa: path.join(ROOT, 'js', 'rank-data.js'),
  lb: path.join(ROOT, 'js', 'livebench-data.js'),
  rank: path.join(ROOT, 'js', 'rank.js')
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const days = (a, b) => Math.round((a - b) / 86400000);
const kb = (p) => Math.round(fs.statSync(p).size / 1024) + ' KB';

const fails = [];
const warns = [];
const ok = (label, val) => console.log('  OK  ' + label.padEnd(12) + val);
const bad = (tag, label, msg) => { fails.push(tag + ' ' + label + '：' + msg); console.log('  !!  ' + label.padEnd(12) + msg); };
const warn = (tag, label, msg) => { warns.push(tag + ' ' + label + '：' + msg); console.log('  ..  ' + label.padEnd(12) + msg); };

const today = new Date();
const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

console.log('');
console.log('AI 排行 · 数据来源与时效体检（两份数据各一遍）');
console.log('  今天          ' + ymd(todayMid) + '（本机时区）');

/* 载入两份数据脚本：都是 IIFE，把 window / globalThis 都塞同一个假对象就能在 Node 里取到 */
function loadData(file, key, refetch) {
  if (!fs.existsSync(file)) {
    console.error('找不到 ' + path.relative(ROOT, file) + '：先跑 ' + refetch);
    process.exit(2);
  }
  const win = {};
  new Function('window', 'globalThis', fs.readFileSync(file, 'utf8'))(win, win);
  const data = win[key];
  if (!data || !data.meta || !Array.isArray(data.models)) {
    console.error(path.relative(ROOT, file) + ' 没有挂出 { meta, models }');
    process.exit(2);
  }
  return data;
}
const AA = loadData(FILES.aa, 'AIRankData', 'node tools/fetch-rank.mjs');
const LB = loadData(FILES.lb, 'LiveBenchData', 'node tools/fetch-livebench.mjs');
if (!fs.existsSync(FILES.rank)) { console.error('找不到 ' + path.relative(ROOT, FILES.rank)); process.exit(2); }
const win2 = {};
new Function('window', fs.readFileSync(FILES.rank, 'utf8'))(win2);
if (!win2.AIRank) { console.error('js/rank.js 没有挂出 window.AIRank'); process.exit(2); }
const DIMS = win2.AIRank.DIMS;
const LDIMS = win2.AIRank.LB_DIMS;

const need = ['source', 'mode', 'fetchedAt', 'asOf', 'cadenceDays', 'nextDue'];

/* 两份共用的元数据检查：返回 { asOf, due } 供后面判新鲜度。
   opts.asOfIsFetch=false 用于 LiveBench —— 它的 asOf 是上游那一期的发布日，
   不是抓取日；那种情况下只要求 asOf ≤ 抓取日，且 nextDue = asOf + cadenceDays。
   这一条必须分开判：LiveBench 一期数据能挂一个月，抓取当天不一定是发布当天。 */
function checkMeta(tag, M, refetch, opts) {
  const asOfIsFetch = !opts || opts.asOfIsFetch !== false;
  const lack = need.filter((k) => M[k] === undefined || M[k] === null || M[k] === '');
  if (lack.length) bad(tag, 'meta', '缺字段：' + lack.join(', '));
  else ok('meta', '字段齐全（' + need.length + ' 个）');
  if (!/^https?:\/\//.test(String(M.source || ''))) bad(tag, 'source', '应该是抓取来源的 http(s) 地址，实际：' + M.source);
  else ok('source', M.source);
  if (['scraped', 'hand-curated'].indexOf(M.mode) < 0) warn(tag, 'mode', '未知维护方式：' + M.mode);
  const asOf = parse(M.asOf), due = parse(M.nextDue), fetched = parse(M.fetchedAt);
  if (!asOf || !due || !fetched) {
    bad(tag, '日期格式', 'asOf / nextDue / fetchedAt 必须是 YYYY-MM-DD[THH:MM...] 形态');
    return { asOf: null, due: null };
  }
  const fetchDay = String(M.fetchedAt).slice(0, 10);
  if (asOfIsFetch) {
    if (M.asOf !== fetchDay) bad(tag, 'asOf', 'asOf=' + M.asOf + '，但 fetchedAt 的日期部分是 ' + fetchDay);
    else ok('asOf', M.asOf + ' = 抓取当天');
  } else if (asOf > fetchDay) {
    bad(tag, 'asOf', 'asOf=' + M.asOf + ' 晚于抓取日 ' + fetchDay + '，数据不可能来自未来');
  } else {
    ok('asOf', M.asOf + ' = 上游那一期的发布日（抓取于 ' + fetchDay + '）');
  }
  if (days(due, asOf) !== Number(M.cadenceDays)) bad(tag, 'nextDue', '应为 asOf + ' + M.cadenceDays + ' 天，实际差 ' + days(due, asOf) + ' 天');
  else ok('nextDue', M.nextDue + '（asOf + ' + M.cadenceDays + ' 天）');
  const over = days(todayMid, due);
  if (over > 0) bad(tag, '新鲜度', '已过期 ' + over + ' 天（约定 ' + ymd(due) + ' 该重抓：' + refetch + '）');
  else if (over === 0) warn(tag, '新鲜度', '今天是重抓日 ' + ymd(due) + '，还没抓');
  else ok('新鲜度', '未过期，还有 ' + (-over) + ' 天到 ' + ymd(due));
  return { asOf, due };
}

function dupNames(tag, models) {
  const seen = new Map();
  const dups = [];
  for (const m of models) { if (seen.has(m.n)) dups.push(m.n); seen.set(m.n, 1); }
  if (dups.length) warn(tag, '重名', dups.length + ' 个模型名重复：' + dups.slice(0, 5).join(', '));
  else ok('重名', models.length + ' 条名字唯一');
}

function missName(tag, models) {
  const miss = models.filter((m) => !m.n || !m.o).length;
  if (miss) bad(tag, '名称/机构', miss + ' 条缺 n 或 o');
  else ok('名称/机构', models.length + ' 条齐全');
}

/* ═════════ 一、AA 智能指数 ═════════ */
console.log('');
console.log('【AA 智能指数】' + path.relative(ROOT, FILES.aa) + '（' + kb(FILES.aa) + '）');
checkMeta('AA', AA.meta, 'node tools/fetch-rank.mjs');
const AMODELS = AA.models;
const acn = AMODELS.filter((m) => m.g === 'cn').length;
console.log('  模型数        ' + AMODELS.length + ' 条（国内 ' + acn + ' 条 → 纯国内榜）');
if (!AMODELS.length) bad('AA', '模型数', '一条都没有，检查 fetch-rank.mjs 的解析是否被上游改版打断');
if (AMODELS.length && !acn) warn('AA', '国内榜', 'g=cn 为 0 条，CREATOR_COUNTRY 归属表可能要补机构');
missName('AA', AMODELS);
const cov = DIMS.map((d) => [d[2], AMODELS.filter((m) => typeof m[d[1]] === 'number').length]);
console.log('  分项覆盖率    ' + cov.map((c) => c[0] + ' ' + c[1] + '/' + AMODELS.length).join(' · '));
const deadDim = cov.filter((c) => c[1] === 0).map((c) => c[0]);
if (deadDim.length) bad('AA', '分项', '这些分项一条都没有：' + deadDim.join(', ') + '（上游字段名可能变了）');
const thin = cov.filter((c) => c[1] > 0 && c[1] < AMODELS.length * 0.2).map((c) => c[0] + ' ' + c[1]);
if (thin.length) warn('AA', '分项', '覆盖率偏低：' + thin.join(', '));
const aBad = [];
for (const m of AMODELS) {
  if (typeof m.ii !== 'number' || m.ii < 0 || m.ii > 100) aBad.push(m.n + '(ii=' + m.ii + ')');
  for (const d of DIMS) {
    const v = m[d[1]];
    if (v !== null && v !== undefined && !(typeof v === 'number' && v >= 0 && v <= 100)) aBad.push(m.n + '(' + d[1] + '=' + v + ')');
  }
  for (const k of ['pi', 'po']) {
    const v = m[k];
    if (v !== null && v !== undefined && !(typeof v === 'number' && v >= 0)) aBad.push(m.n + '(' + k + '=' + v + ')');
  }
}
if (aBad.length) bad('AA', '取值', aBad.length + ' 处越界：' + aBad.slice(0, 8).join(', '));
else ok('取值', '智能指数与各分项全部在 0-100，价格非负');
dupNames('AA', AMODELS);
const hasDelta = AMODELS.some((m) => typeof m.d === 'number');
console.log('  变化列        ' + (hasDelta ? '有上一版可比，显示名次变化' : '无上一版（首抓或同日重抓），整列收起'));

/* ═════════ 二、LiveBench ═════════ */
console.log('');
console.log('【LiveBench】' + path.relative(ROOT, FILES.lb) + '（' + kb(FILES.lb) + '）');
checkMeta('LB', LB.meta, 'node tools/fetch-livebench.mjs', { asOfIsFetch: false });
if (LB.meta.releaseDate && LB.meta.releaseDate !== LB.meta.asOf) bad('LB', 'releaseDate', 'releaseDate=' + LB.meta.releaseDate + ' 与 asOf=' + LB.meta.asOf + ' 不是同一天');
else ok('releaseDate', '与 asOf 一致（' + (LB.meta.releaseDate || '未提供') + '）');
const LMODELS = LB.models;
const lcn = LMODELS.filter((m) => m.g === 'cn').length;
const lOpen = LMODELS.filter((m) => m.op).length;
console.log('  模型数        ' + LMODELS.length + ' 条（国内 ' + lcn + ' 条 → 纯国内榜 · 开放权重 ' + lOpen + ' 条）· 版本 ' + (LB.meta.release || '?'));
if (!LMODELS.length) bad('LB', '模型数', '一条都没有，检查 fetch-livebench.mjs 是否还认得 table.csv 的列名');
if (LMODELS.length && !lcn) warn('LB', '国内榜', 'g=cn 为 0 条，ORG_COUNTRY 归属表可能要补机构');
if (LB.meta.release && !/^\d{8}$/.test(String(LB.meta.release))) bad('LB', 'release', '版本号应是 8 位日期，实际：' + LB.meta.release);
if (!LDIMS.length) bad('LB', 'suite', 'rank.js 没读出任何 LiveBench suite，meta.categories 可能空了');
missName('LB', LMODELS);
const lcov = LDIMS.map((d) => [d[2], LMODELS.filter((m) => typeof m[d[1]] === 'number').length]);
console.log('  suite 覆盖率  ' + lcov.map((c) => c[0] + ' ' + c[1] + '/' + LMODELS.length).join(' · '));
const lDead = lcov.filter((c) => c[1] === 0).map((c) => c[0]);
if (lDead.length) bad('LB', 'suite', '这些 suite 一条数据都没有：' + lDead.join(', ') + '（table.csv 的列名可能变了）');
const lThin = lcov.filter((c) => c[1] > 0 && c[1] < LMODELS.length * 0.2).map((c) => c[0] + ' ' + c[1]);
if (lThin.length) warn('LB', 'suite', '覆盖率偏低：' + lThin.join(', '));
const lBad = [];
const noOv = [];
let ovOff = 0;
for (const m of LMODELS) {
  for (const d of LDIMS) {
    const v = m[d[1]];
    if (v !== null && v !== undefined && !(typeof v === 'number' && v >= 0 && v <= 100)) lBad.push(m.n + '(' + d[1] + '=' + v + ')');
  }
  for (const k of ['pi', 'po']) {
    const v = m[k];
    if (v !== null && v !== undefined && !(typeof v === 'number' && v >= 0)) lBad.push(m.n + '(' + k + '=' + v + ')');
  }
  /* 总分必须等于「已有分的 suite 的算术平均」—— 这是页面上那句「不需要加权」的硬依据 */
  const have = LDIMS.map((d) => m[d[1]]).filter((v) => typeof v === 'number');
  if (typeof m.ov !== 'number') { if (have.length) noOv.push(m.n); continue; }
  if (!have.length) { lBad.push(m.n + '(有总分但七个 suite 全空)'); continue; }
  const avg = have.reduce((a, b) => a + b, 0) / have.length;
  if (Math.abs(avg - m.ov) > 0.15) { ovOff++; lBad.push(m.n + '(ov=' + m.ov + ' 但均分=' + Math.round(avg * 100) / 100 + ')'); }
}
if (lBad.length) bad('LB', '取值', lBad.length + ' 处不自洽：' + lBad.slice(0, 8).join(', '));
else ok('取值', '七个 suite 与价格全部合法，总分 = 已有分项的算术平均');
if (noOv.length) warn('LB', '总分', noOv.length + ' 条有分项但没有 ov：' + noOv.slice(0, 6).join(', '));
else ok('总分', '每条都能由七个 suite 复算出来');
dupNames('LB', LMODELS);

/* ═════════ 三、别处有没有又写死日期 / 周次 ═════════ */
console.log('');
const scan = ['index.html', 'js/app.js', 'js/api.js', 'js/data.js', 'js/rank.js', 'js/livebench-data.js', 'whale/index.html'];
const stray = [];
for (const rel of scan) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (/快照\s*20\d{2}-W\d{1,2}/.test(line) || /数据\s*20\d{2}-\d{2}-\d{2}/.test(line)) stray.push(rel + ':' + (i + 1));
  });
}
if (stray.length) bad('全站', '日期字面量', '这些地方又写死了快照日期/周次，会和 meta 各说各话：' + stray.join(', '));
else ok('日期字面量', '全站只认两份 meta（已扫 ' + scan.length + ' 个文件）');

/* ═════════ 四、结论 ═════════ */
console.log('');
if (fails.length) {
  console.log('结论：' + fails.length + ' 项不通过' + (warns.length ? '，' + warns.length + ' 项提醒' : ''));
  fails.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
console.log('结论：两份数据全部通过' + (warns.length ? '（' + warns.length + ' 项提醒：' + warns.join('；') + '）' : '') + '。');
console.log('提醒：判的是「这两份抓取没过约定周期、字段没被打断」，不是「分数准不准」——解释权分别归 Artificial Analysis 与 LiveBench。');
