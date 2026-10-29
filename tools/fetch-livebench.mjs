#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   抓 LiveBench 2.0 的榜单数据 —— 零依赖，只读公开静态文件。

   用法：
     node tools/fetch-livebench.mjs                  抓最新一版，写 js/livebench-data.js
     node tools/fetch-livebench.mjs --dry            只打印统计，不写文件
     node tools/fetch-livebench.mjs --release=20261014   指定版本目录
     node tools/fetch-livebench.mjs --from .tmp-lb   离线：用目录里已存的文件重跑

   数据从哪来（页面 livebench.ai 自己也是这么取的）：
     首页 → static/js/main.<hash>.js → 里面写着版本号数组
     https://livebench.ai/data/<版本>/table.csv      每个模型 × 每个 suite 的分数（0-100 或 n/a）
     https://livebench.ai/data/<版本>/models.json    显示名 / 机构 / 是否开源权重
     https://livebench.ai/data/<版本>/cost.csv       输入输出价（$/1M tokens）
     https://livebench.ai/data/<版本>/categories.json  suite 的显示名与列名

   本站只做一件事：把这几份文件按模型拼成一条，算总分（七个 suite 的算术平均），
   其余一个字都不改。分数解释权归 LiveBench 团队。
   ══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'js', 'livebench-data.js');
const HOME = 'https://livebench.ai/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const FROM = (argv.find((a) => a.startsWith('--from=')) || '').slice(7) ||
  (argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : '');
const FORCE_RELEASE = (argv.find((a) => a.startsWith('--release=')) || '').slice(10) ||
  (argv.includes('--release') ? argv[argv.indexOf('--release') + 1] : '');

const pad = (n) => String(n).padStart(2, '0');
const round1 = (v) => Math.round(v * 10) / 10;

/* ── 机构 → 国家。LiveBench 的 models.json 只给 organization，没有国家字段。
      拿不准的留 null（不进国内榜），并在 meta.unmappedOrgs 里列出来。 ── */
const ORG_COUNTRY = {
  'Abacus.AI': 'us',
  'OpenAI': 'us',
  'Anthropic': 'us',
  'Google': 'us',
  'Meta': 'us',
  'xAI': 'us',
  'NVIDIA': 'us',
  'Microsoft': 'us',
  'Thinking Machines': 'us',
  'Reflection AI': 'us',
  'Amazon': 'us',
  'Cohere': 'ca',
  'Mistral AI': 'fr',
  'DeepSeek': 'cn',
  'Alibaba': 'cn',
  'Qwen': 'cn',
  'Moonshot AI': 'cn',
  'Moonshot': 'cn',
  'Z.AI': 'cn',
  'Zhipu AI': 'cn',
  'Xiaomi': 'cn',
  'MiniMax': 'cn',
  'Minimax': 'cn',
  'StepFun': 'cn',
  'ByteDance': 'cn',
  'ByteDance Seed': 'cn',
  'Tencent': 'cn',
  'Baidu': 'cn',
  '01.AI': 'cn',
  'Baichuan': 'cn'
};

async function get(url, bin) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return bin ? Buffer.from(await res.arrayBuffer()) : await res.text();
}

/* ── 版本目录：首页引用的 bundle 里有一串 8 位版本的数组，取最大那个；
      拿不到就从今天往回试（最多 14 天），第一个能取到 table.csv 的就是最新版。 ── */
async function discoverRelease() {
  if (FORCE_RELEASE) return { release: FORCE_RELEASE, how: '命令行指定' };
  try {
    const html = await get(HOME);
    const m = /static\/js\/main\.[a-z0-9]+\.js/i.exec(html);
    if (m) {
      const bundle = await get(new URL(m[0], HOME).href);
      const arrs = bundle.match(/\["\d{8}"(?:,"\d{8}")*\]/g) || [];
      const ids = [];
      arrs.forEach((a) => (a.match(/\d{8}/g) || []).forEach((d) => ids.push(d)));
      if (ids.length) return { release: ids.sort().slice(-1)[0], how: '从页面 bundle 读出版本号' };
    }
  } catch (e) {
    console.log('· bundle 里没读出版本号（' + e.message + '），改试最近日期');
  }
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    const id = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    try {
      const res = await fetch('https://livebench.ai/data/' + id + '/table.csv', { method: 'HEAD', headers: { 'user-agent': UA } });
      if (res.ok) return { release: id, how: '按日期探测到可用目录' };
    } catch (e) { /* 继续往前试 */ }
    d.setDate(d.getDate() - 1);
  }
  throw new Error('找不到任何 LiveBench 版本目录，请用 --release=YYYYMMDD 指定');
}

/* CSV：这几份文件的字段都不含逗号与引号，按行按逗号切即可 */
function parseCSV(text) {
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] === undefined ? '' : cells[i]).trim(); });
    return row;
  });
}

function flattenCats(raw) {
  // categories.json 的值是列名数组（现在每个 suite 一列），取第一个就是 CSV 的列名
  const out = [];
  Object.keys(raw || {}).forEach((label) => {
    const cols = Array.isArray(raw[label]) ? raw[label] : [];
    if (cols.length) out.push({ label: label, key: cols[0] });
  });
  return out;
}

/* models.json 已被上游整体下线（20261025 / 20261014 都 404），但官网前端 bundle 里
   仍内联着完整模型表：slug → displayName / organization / openweight。
   抓不到 models.json 时就从 bundle 抠这份表，缺元数据的 slug 用 slug 美化兜底。 */
function prettySlug(slug) {
  return String(slug).split(/[-_]/).map(function (w) {
    if (!w) return w;
    if (/^\d/.test(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

async function loadModelsFromBundle() {
  const html = await get(HOME);
  const m = /static\/js\/main\.[a-z0-9]+\.js/i.exec(html);
  if (!m) throw new Error('首页里找不到主 bundle，取不到模型元数据');
  const bundle = await get(new URL(m[0], HOME).href);
  const re = /"([a-z0-9][a-z0-9._-]{2,}?)":\{([^{}]{10,400}?)\}/g;
  const out = {};
  let hit;
  while ((hit = re.exec(bundle))) {
    const body = hit[2];
    if (body.indexOf('displayName') < 0) continue;
    out[hit[1]] = {
      displayName: (/displayName:"([^"]*)"/.exec(body) || [])[1] || null,
      organization: (/organization:"([^"]*)"/.exec(body) || [])[1] || null,
      openweight: /openweight:(!0|true)/.test(body)
    };
  }
  const n = Object.keys(out).length;
  if (n < 50) throw new Error('bundle 里只抠出 ' + n + ' 个模型，太少，放弃');
  console.log('· models.json 已下线，改从页面 bundle 读模型元数据：' + n + ' 个');
  return out;
}

async function load(release) {
  const base = 'https://livebench.ai/data/' + release;
  if (FROM) {
    const dir = path.resolve(ROOT, FROM);
    const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
    console.log('· 离线读取 ' + path.relative(ROOT, dir));
    return {
      base: base,
      table: rd('table.csv'),
      models: JSON.parse(rd('models.json')),
      modelsSource: base + '/models.json（离线目录）',
      cost: rd('cost.csv'),
      categories: JSON.parse(rd('categories.json'))
    };
  }
  console.log('· 版本目录 ' + base);
  const [table, modelsRaw, cost, categories] = await Promise.all([
    get(base + '/table.csv'),
    get(base + '/models.json').catch(function () { return null; }),
    get(base + '/cost.csv'),
    get(base + '/categories.json')
  ]);
  let modelsTable; let modelsSource;
  if (modelsRaw) {
    modelsTable = JSON.parse(modelsRaw);
    modelsSource = base + '/models.json';
  } else {
    modelsTable = await loadModelsFromBundle();
    modelsSource = HOME + '（前端 bundle 内联模型表；models.json 已下线）';
  }
  return { base: base, table: table, models: modelsTable, cost: cost, categories: JSON.parse(categories), modelsSource: modelsSource };
}

const disc = await discoverRelease();
const release = disc.release;
console.log('· 版本 ' + release + '（' + disc.how + '）');
const pack = await load(release);
const cats = flattenCats(pack.categories);
if (!cats.length) throw new Error('categories.json 解析不出 suite 列');

const tableRows = parseCSV(pack.table);
const costRows = parseCSV(pack.cost);
const costBy = {};
costRows.forEach((c) => { costBy[c.model] = c; });

const unmapped = new Set();
let skipped = 0;
const models = [];
tableRows.forEach((row) => {
  const slug = (row.model || '').trim();
  if (!slug) { skipped++; return; }
  const meta = pack.models[slug] || {};
  const cost = costBy[slug] || {};
  const rec = {
    n: meta.displayName || prettySlug(slug),
    s: slug,
    o: meta.organization || '未标注',
    g: ORG_COUNTRY[meta.organization] || null,
    op: meta.openweight ? 1 : 0
  };
  if (meta.organization && !ORG_COUNTRY[meta.organization]) unmapped.add(meta.organization);
  let sum = 0;
  let cnt = 0;
  cats.forEach((c) => {
    const v = Number(row[c.key]);
    const val = row[c.key] !== '' && row[c.key] !== 'n/a' && isFinite(v) ? round1(v) : null;
    rec[c.key] = val;
    if (val !== null) { sum += val; cnt++; }
  });
  if (!cnt) { skipped++; return; }
  rec.ov = round1(sum / cnt);
  const pi = Number(cost.input_price_per_million);
  const po = Number(cost.output_price_per_million);
  const ao = Number(cost.avg_output_tokens);
  rec.pi = isFinite(pi) && pi >= 0 ? pi : null;
  rec.po = isFinite(po) && po >= 0 ? po : null;
  rec.ao = isFinite(ao) && ao > 0 ? Math.round(ao) : null;
  models.push(rec);
});

models.sort((a, b) => b.ov - a.ov || a.n.localeCompare(b.n));

const now = new Date();
const tz = -now.getTimezoneOffset();
const sign = tz >= 0 ? '+' : '-';
const fetchedAt = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
  'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) +
  sign + pad(Math.abs(tz) / 60 | 0) + ':' + pad(Math.abs(tz) % 60);
const releaseDate = release.slice(0, 4) + '-' + release.slice(4, 6) + '-' + release.slice(6, 8);
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
const CADENCE = 30;
const cn = models.filter((m) => m.g === 'cn');
const open = models.filter((m) => m.op);
const meta = {
  source: HOME,
  sourceLabel: 'LiveBench 2.0',
  sourceData: pack.base + '/table.csv',
  sourceModels: pack.modelsSource || (pack.base + '/models.json'),
  sourceCost: pack.base + '/cost.csv',
  mode: 'scraped',
  release: release,
  releaseDate: releaseDate,
  asOf: releaseDate,
  fetchedAt: fetchedAt,
  cadenceDays: CADENCE,
  nextDue: addDays(releaseDate, CADENCE),
  rawModels: tableRows.filter((r) => (r.model || '').trim()).length,
  keptModels: models.length,
  skipped: skipped,
  cnModels: cn.length,
  openModels: open.length,
  categories: cats,
  unmappedOrgs: Array.from(unmapped)
};

console.log('· 版本日期 ' + releaseDate + ' · 保留 ' + models.length + ' 个模型（原始 ' + meta.rawModels + '，丢弃 ' + skipped + '）');
console.log('· 国内 ' + cn.length + ' 个 · 开放权重 ' + open.length + ' 个 · suite ' + cats.length + ' 项：' + cats.map((c) => c.label).join(' / '));
console.log('· 未识别的机构：' + (meta.unmappedOrgs.length ? meta.unmappedOrgs.join(' / ') : '无'));
console.log('· 前三 ' + models.slice(0, 3).map((m) => m.n + ' ' + m.ov).join(' | '));
if (cn.length) console.log('· 国内前三 ' + cn.slice(0, 3).map((m) => m.n + ' ' + m.ov).join(' | '));
const noDim = cats.filter((c) => models.every((m) => m[c.key] === null)).map((c) => c.label);
if (noDim.length) console.log('· 注意：这些 suite 一条分数都没有 → ' + noDim.join(' / '));

if (DRY) { console.log('· --dry，不写文件'); process.exit(0); }

const body = '/* 由 tools/fetch-livebench.mjs 生成，别手改。来源 ' + meta.source + ' 版本 ' + release + ' */\n' +
  '(function (root) {\n' +
  '  var DATA = {\n' +
  '    meta: ' + JSON.stringify(meta) + ',\n' +
  '    models: [\n' + models.map((m) => '      ' + JSON.stringify(m)).join(',\n') + '\n    ]\n' +
  '  };\n' +
  '  if (root) { root.LiveBenchData = DATA; if (typeof window !== \'undefined\') window.LiveBenchData = DATA; }\n' +
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(OUT_FILE, body, 'utf8');
console.log('· 写入 ' + path.relative(ROOT, OUT_FILE) + '  ' + (Buffer.byteLength(body) / 1024).toFixed(1) + ' KB');
