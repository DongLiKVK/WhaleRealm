#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   tools/fetch-rank.mjs —— 把 Artificial Analysis 的模型榜抓成本地数据文件

   用法：
     node tools/fetch-rank.mjs                # 联网抓 https://artificialanalysis.ai/zh/leaderboards/models
     node tools/fetch-rank.mjs --from x.html   # 用已保存的页面离线重跑（调试/复现）
     node tools/fetch-rank.mjs --dry           # 只打印统计，不写文件

   为什么要在本地跑：站点是纯静态前端，浏览器既跨不过 CORS，也不该在一次
   首屏里解码 1.9 MB 的 Next.js flight 流。所以抓取离线做，产物是
   js/rank-data.js（约 20 KB），页面只读这份文件。

   数据来源只有一个：AA 页面里 initialModels 那份 JSON。官方 JSON API
   （/api/v2/data/llms/models）要 API key，本项目不用它。

   关键取舍（都写进产物的 meta，页面照原样显示，不让读者猜）：
     · 只留 intelligenceIndex 非空的模型 —— 没有主分的行排序没有意义
     · 同一模型的多个推理档（名字尾部括号）合并成一行，取主分最高的那档，
       合并条数记在 meta.variants 里
     · 机构 → 国家是人工映射：AA 只给 modelCreatorName，没有国家字段
     · 名次变化由「上一份 js/rank-data.js」与本次相减得出，没有上一份就是 null
   ══════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_URL = 'https://artificialanalysis.ai/zh/leaderboards/models';
const OUT_FILE = path.join(ROOT, 'js', 'rank-data.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* 机构 → 国家/地区。AA 没有这个字段，只能人工归属。
   拿不准的一律 null（榜单里显示「未标注」，且不进纯国内榜）——宁缺勿错。 */
const CREATOR_COUNTRY = {
  'OpenAI': 'us', 'Anthropic': 'us', 'Google': 'us', 'Meta': 'us', 'NVIDIA': 'us',
  'Amazon': 'us', 'Microsoft': 'us', 'IBM': 'us', 'Nous Research': 'us',
  'Allen Institute for AI': 'us', 'Liquid AI': 'us', 'Thinking Machines': 'us',
  'SpaceXAI': 'us', 'Prime Intellect': 'us', 'Reflection': 'us', 'Inception': 'us',
  'Perplexity': 'us', 'ServiceNow': 'us', 'Arcee AI': 'us', 'Reka AI': 'us',
  'Deep Cogito': 'us',
  'Alibaba': 'cn', 'DeepSeek': 'cn', 'Kimi': 'cn', 'Z AI': 'cn', 'StepFun': 'cn',
  'Xiaomi': 'cn', 'MiniMax': 'cn', 'Baidu': 'cn', 'ByteDance Seed': 'cn',
  'Tencent': 'cn', 'OpenBMB': 'cn', 'InclusionAI': 'cn', 'China Mobile': 'cn',
  'LongCat': 'cn', 'KwaiKAT': 'cn',
  'Mistral': 'fr', 'Cohere': 'ca', 'AI21 Labs': 'il',
  'LG AI Research': 'kr', 'Upstage': 'kr', 'Naver': 'kr', 'SK Telecom': 'kr',
  'Korea Telecom': 'kr',
  'Sarvam': 'in', 'Multiverse Computing': 'es', 'Swiss AI Initiative': 'ch',
  'TII UAE': 'ae', 'Institute of Foundation Models': 'ae'
};

const REGION = {
  us: '美国', cn: '中国', fr: '法国', ca: '加拿大', il: '以色列',
  kr: '韩国', in: '印度', es: '西班牙', ch: '瑞士', ae: '阿联酋'
};

const flagVal = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? (process.argv[i + 1] || true) : null;
};
const has = (name) => process.argv.indexOf(name) > 0;

/* ---------- 1. 取页面 ---------- */
async function loadHtml() {
  const from = flagVal('--from');
  if (from && typeof from === 'string') {
    console.log('· 离线模式：' + from);
    return fs.readFileSync(path.resolve(ROOT, from), 'utf8');
  }
  console.log('· 抓取 ' + SRC_URL);
  const res = await fetch(SRC_URL, {
    headers: {
      'user-agent': UA,
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  return await res.text();
}

/* ---------- 2. 解 Next.js flight 流 ----------
   HTML 里是若干段 self.__next_f.push([1,"<json string>"])；
   逐段取出字符串字面量、JSON 解码、拼成一条 flight 文本。 */
function flightOf(html) {
  const parts = [];
  const needle = 'self.__next_f.push([1,';
  let i = 0;
  while (true) {
    const at = html.indexOf(needle, i);
    if (at < 0) break;
    let p = at + needle.length;
    if (html[p] !== '"') { i = p; continue; }
    p += 1;
    let esc = false, buf = '';
    for (; p < html.length; p += 1) {
      const c = html[p];
      if (esc) { buf += c; esc = false; continue; }
      if (c === '\\') { buf += c; esc = true; continue; }
      if (c === '"') { p += 1; break; }
      buf += c;
    }
    try { parts.push(JSON.parse('"' + buf + '"')); } catch { parts.push(buf); }
    i = p;
  }
  if (!parts.length) throw new Error('页面里没找到 __next_f 数据块，AA 可能改版了');
  return parts.join('');
}

/* 在 flight 文本里定位 "initialModels":[...]，按括号配平取整个数组 */
function modelsOf(flight) {
  const key = '"initialModels":';
  const at = flight.indexOf(key);
  if (at < 0) throw new Error('flight 流里没有 initialModels 字段，AA 可能改版了');
  const start = flight.indexOf('[', at);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < flight.length; i += 1) {
    const c = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('initialModels 数组没配平，解析中止');
  return JSON.parse(flight.slice(start, end));
}

/* ---------- 3. 归一 ---------- */
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10);       /* 0.829 → 82.9 */
const baseName = (n) => String(n || '').replace(/\s*\([^()]*\)\s*$/, '').trim();

function normalize(raw) {
  const byBase = new Map();
  let skippedDeprecated = 0, skippedNoIndex = 0, variantRows = 0;

  for (const m of raw) {
    if (m.deprecated) { skippedDeprecated += 1; continue; }
    if (m.intelligenceIndex == null) { skippedNoIndex += 1; continue; }
    variantRows += 1;
    const name = baseName(m.name) || m.name;
    /* v5.0（2026-10-27 起）把九项评测的原始分统一挪进了 scores 对象，
       顶层不再有 hle / gpqa / scicode 这些字段 —— 照旧读顶层会让分项全部变 null。
       这里按评测 slug 从 scores 取；旧顶层字段留作回退，老快照照样能跑。 */
    const sub = m.scores || {};
    /* AA 的分项量表不统一：多数是 0-1 的比例，aa-briefcase 之类直接给百分制大数。
       大于 1 的值按百分制原样保留，不去猜它的满分量程。 */
    const sc = (k) => { const v = sub[k] == null ? m[k] : sub[k]; if (v == null) return null; return v <= 1 ? pct(v) : round1(v); };
    const rec = {
      n: name,
      o: m.modelCreatorName || '未标注',
      g: CREATOR_COUNTRY[m.modelCreatorName] || null,
      op: m.isOpenWeights ? 1 : 0,
      r: m.isReasoning ? 1 : 0,
      cx: m.contextWindowTokens || null,
      ii: round1(m.intelligenceIndex),
      ie: m.intelligenceIndexIsEstimated ? 1 : null,
      bs: sc('aa-briefcase'),
      fc: sc('frontiercode-2-0'),
      tb: sc('terminalbench-4-0'),
      cp: sc('critpt-v2-hard'),
      hl: sc('hle-diamond'),
      ts: sc('terminal-bench-science'),
      gp: sc('gdp-pdf'),
      ab: sc('automationbench-aa'),
      oa: sc('omniscience-accuracy'),
      on: sc('omniscience-non-hallucination'),
      rt: round1(m.medianReasoningTimeSeconds),
      pi: m.price1mInputTokens == null ? null : m.price1mInputTokens,
      po: m.price1mOutputTokens == null ? null : m.price1mOutputTokens,
      nv: 1,
      sl: m.slug || null
    };
    const cur = byBase.get(name);
    if (!cur) { byBase.set(name, rec); continue; }
    /* 同一模型的多个推理档合并成一行：**取智能指数最高的那一档，整行都用那一档**。
       早先的写法是每个分项各自取最大值，能拼出 AA 官方根本不存在的一行 ——
       页面写着「取智能指数最高的那档」，数据却是混装品，对账时一条都复现不出来。
       v5.0 起改成整档覆盖，合并条数仍记在 nv 里。 */
    cur.nv += 1;
    if (rec.ii > cur.ii) {
      rec.nv = cur.nv;
      byBase.set(name, rec);
    }
  }

  const models = Array.from(byBase.values())
    .sort((a, b) => (b.ii - a.ii) || a.n.localeCompare(b.n));

  return { models, skippedDeprecated, skippedNoIndex, variantRows };
}

/* ---------- 4. 与上一份数据相减得出名次变化 ---------- */
function prevRanks() {
  if (!fs.existsSync(OUT_FILE)) return null;
  try {
    const src = fs.readFileSync(OUT_FILE, 'utf8');
    const win = {};
    new Function('window', 'globalThis', src)(win, win);
    const data = win.AIRankData;
    if (!data || !Array.isArray(data.models)) return null;
    const rank = new Map();
    data.models.forEach((m, i) => rank.set(m.n, i + 1));
    return { rank, meta: data.meta || {} };
  } catch (e) {
    console.warn('· 上一份 rank-data.js 读不了，名次变化一律留空：' + e.message);
    return null;
  }
}

/* ---------- 5. 写产物 ---------- */
/* asOf + n 天：按本机时区做日期算术。
   别用 toISOString().slice(0,10) —— 本地 2026-10-30 零点的 UTC 表示是 10-29T16:00Z，
   切出来会整整少一天（第一版就是这么把 nextDue 算成 asOf+6 的，体检脚本抓出来的）。 */
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function emit(models, stats, prev, sourceLabel, indexVersion) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tzOffset = -now.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const fetchedAt = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) +
    sign + pad(Math.abs(tzOffset) / 60 | 0) + ':' + pad(Math.abs(tzOffset) % 60);
  const asOf = fetchedAt.slice(0, 10);

  /* 只有「上一份数据的日期与这一份不同」才算上一版：同一天连跑两次抓取不算更新，
     否则会出现「变化对比 2026-10-23 版」这种自己跟自己比的怪句子。 */
  const usablePrev = prev && prev.meta.asOf && prev.meta.asOf !== asOf ? prev : null;
  /* 名次变化只在「同一口径」的两份快照之间才算得出来：
     AA 换指数大版本（v4 -> v5）时全表重算，跨版本相减只会造出一堆假涨跌。 */
  const sameIndex = !!(prev && prev.meta && prev.meta.indexVersion && prev.meta.indexVersion === indexVersion);
  models.forEach((m, i) => {
    const before = sameIndex && usablePrev ? usablePrev.rank.get(m.n) : null;
    m.d = before ? before - (i + 1) : null;
    if (m.d == null) delete m.d;
  });

  const cn = models.filter((m) => m.g === 'cn');
  const meta = {
    source: SRC_URL,
    sourceLabel: sourceLabel,
    mode: 'scraped',
    indexVersion: indexVersion,
    fetchedAt: fetchedAt,
    asOf: asOf,
    cadenceDays: 7,
    nextDue: addDays(asOf, 7),
    rawModels: stats.raw,
    keptModels: models.length,
    coverage: models.length + '/' + stats.raw,
    mergedVariants: stats.variantRows - models.length,
    skippedNoIndex: stats.skippedNoIndex,
    skippedDeprecated: stats.skippedDeprecated,
    cnModels: cn.length,
    unmappedCreators: Array.from(new Set(models.filter((m) => !m.g).map((m) => m.o))).sort(),
    prevAsOf: usablePrev ? usablePrev.meta.asOf : null,
    prevIndexVersion: prev && prev.meta ? (prev.meta.indexVersion || null) : null
  };

  const lines = models.map((m) => '    ' + JSON.stringify(m) + ',');
  const body = [
    '/* ══════════════════════════════════════════════════════════════',
    '   js/rank-data.js —— 由 tools/fetch-rank.mjs 生成的快照，勿手改',
    '',
    '   来源：' + SRC_URL,
    '   抓取：' + fetchedAt + ' · 原始 ' + stats.raw + ' 条 → 保留 ' + models.length + ' 条',
    '   重抓：node tools/fetch-rank.mjs（会让 /#/rank 的数字换成最新一版）',
    '   ══════════════════════════════════════════════════════════════ */',
    '(function (root) {',
    '  var DATA = {',
    '    meta: ' + JSON.stringify(meta, null, 2).split('\n').join('\n    ') + ',',
    '    models: [',
    ...lines,
    '    ]',
    '  };',
    '  if (root) {',
    '    root.AIRankData = DATA;',
    '    if (typeof window !== "undefined") window.AIRankData = DATA;',
    '  }',
    '})(typeof globalThis !== "undefined" ? globalThis : this);',
    ''
  ].join('\n');

  if (has('--dry')) {
    console.log('· --dry：不写文件，统计如下');
    console.log(JSON.stringify(meta, null, 2));
    return { meta, bytes: Buffer.byteLength(body) };
  }
  fs.writeFileSync(OUT_FILE, body, 'utf8');
  console.log('· 写入 ' + path.relative(ROOT, OUT_FILE) + '  ' + (Buffer.byteLength(body) / 1024).toFixed(1) + ' KB');
  return { meta, bytes: Buffer.byteLength(body) };
}

/* ---------- 6. main ---------- */
const html = await loadHtml();
console.log('· 页面 ' + (html.length / 1024 / 1024).toFixed(2) + ' MB');
const flight = flightOf(html);
console.log('· flight ' + flight.length + ' 字符');
const raw = modelsOf(flight);
console.log('· initialModels ' + raw.length + ' 条');
const { models, skippedDeprecated, skippedNoIndex, variantRows } = normalize(raw);
const stats = { raw: raw.length, skippedDeprecated, skippedNoIndex, variantRows };
const prev = prevRanks();
  const indexVersion = (/Intelligence Index v(\d+(?:\.\d+)?)/.exec(html) || [])[1] || 'unknown';
  console.log('· 指数版本 v' + indexVersion);
  const { meta } = emit(models, stats, prev, 'Artificial Analysis · Model Leaderboard', indexVersion);

console.log('· 保留 ' + models.length + ' 个模型（合并推理档 ' + meta.mergedVariants +
  ' 条，无主分丢弃 ' + skippedNoIndex + '，下架 ' + skippedDeprecated + '）');
console.log('· 国内 ' + meta.cnModels + ' 个 · 机构归属待定 ' + meta.unmappedCreators.length + ' 家' +
  (meta.unmappedCreators.length ? '：' + meta.unmappedCreators.join(' / ') : ''));
console.log('· 榜首 ' + models.slice(0, 3).map((m) => m.n + ' ' + m.ii).join(' | '));
const cnTop = models.filter((m) => m.g === 'cn').slice(0, 3);
console.log('· 国内前三 ' + cnTop.map((m) => m.n + ' ' + m.ii).join(' | '));
