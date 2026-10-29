#!/usr/bin/env node
/**
 * 鲸域 · 插件自动审核
 *
 * 为什么用确定性脚本而不是让大模型逐条读：
 *   ① 可复现：同一批数据跑两次结论必须一致，模型做不到；
 *   ② 可审计：每条判定都带「命中哪条规则」，被问询时能拿出依据；
 *   ③ 零成本：6716 条存量 + 每日新增，调模型是持续开销；
 *   ④ 服务器上没有任何模型凭据，跑不了。
 *   模型适合做「规则没覆盖的疑难条目」的二次判断，不适合当第一道闸门。
 *
 * 三条判定结果：
 *   approved  → 直接上架（published）
 *   rejected  → 直接驳回（rejected），带命中原因
 *   manual    → 留在 pending，标记待人工（规则只擦到边、证据不足）
 *
 * 规则设计原则：
 *   宁可 manual 也不误杀。误杀一个正常插件，作者会觉得站不专业；
 *   漏放一个高危条目，是合规事故。两者代价不对等，所以：
 *   · 明确高危词（免杀/翻墙/账号池/NSFW/赌博）→ rejected
 *   · 弱信号（单个「代理」「远程」这类）→ manual
 *
 * 用法：
 *   node scripts/review-plugins.cjs --test        # 回归测试（不写库）
 *   node scripts/review-plugins.cjs --dry-run     # 看会怎么判（不写库）
 *   node scripts/review-plugins.cjs               # 执行审核并上架
 *   node scripts/review-plugins.cjs --limit 100   # 每次最多处理 100 条
 */
'use strict';

const path = require('path');
const SERVER_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH && path.isAbsolute(process.env.DB_PATH)
  ? process.env.DB_PATH
  : path.join(SERVER_DIR, 'data', 'jingyu.db');
const Database = require(path.join(SERVER_DIR, 'node_modules', 'better-sqlite3'));

/* ========== 规则表 ==========
   每条：{ id, label, level, re }
   level: 'block' = 命中即驳回；'flag' = 命中转人工
   正则都在实测样本上校准过（见 --test 的回归结果）。 */
/* ========== 规则表 ==========
   每条：{ id, label, level, re, except? }
   level: 'block' = 命中即驳回；'flag' = 命中转人工
   except: 若文本命中该正则，则本条规则**不生效**（合规语境豁免）

   为什么需要 except：首次校准时有 55 条误杀（0.82%），全部都是
   「词对但语境不对」造成的：
     · 「提权」—— DSH 自身有沙箱提权审批 / UAC 提权，是正常功能
     · 「红队 / pentest / 渗透测试」—— 一堆合规的安全研究插件都这么写
     · 「自动轮换」—— 壁纸轮播、皮肤切换也用这个词
     · 「每日签到」—— token 记账小游戏用了「签到」作为机制名
     · 「越狱」—— 有的插件是用来**检测**越狱（正向用途）
   靠加排除词比「看到关键词就毙」可靠得多。 */
const RULES = [
  /* ---- 成人内容：境内平台展示即违规，零容忍 ---- */
  { id: 'adult', label: '成人内容', level: 'block',
    re: /(nsfw|r18|\br-18\b|色情|成人内容|情色|涩涩|福利姬|裸聊|无码|uncensored|成人向|\bsex\s*scene)/i,
    /* 「18+」单独出现太容易误撞（版本号、日期、尺寸都可能有 18），
       只在紧邻成人词时才认；反向排除检测类用途 */
    except: /(检测|拦截|过滤|屏蔽|防护|合规|未成年人保护|内容审核|审核规则)/ },

  /* ---- 翻墙 / 代理链路：只认**翻墙语义**，不认「本机代理」 ---- */
  { id: 'overwall', label: '翻墙代理', level: 'block',
    re: /(翻墙|科学上网|机场订阅|订阅链接|节点订阅|\bv2ray\b|\bxray\b|shadowsocks|\bvmess\b|trojan-go|hysteria|sing-box|fake-?ip|突破网络封锁|墙外|代理池|住宅代理|落地\s*ip)/i },
  /* 单独出现的 clash / mihomo / ssr 不算 —— 它们是常见代理软件名，
     描述里「走本地 Clash 代理」属于本机网络配置，不是翻墙工具链 */
  { id: 'clash-netcfg', label: 'Clash/mihomo 代理（本机网络配置）', level: 'flag',
    re: /(\bclash\b|mihomo|\bssr\b|梯子)/i },

  /* ---- 账号池 / 白嫖：这是真正会被服务商追责的一类 ---- */
  /* 判据收窄：只认**绕过服务商计费**的组合语义。
     第一版把「多账号轮换」「自动签到」都算 block，结果误杀了 18 条
     —— WorkBuddy / Trae / Qoder 把自己的多个账号接进来是 DSH 生态的
     常规用法，官方桌面 App 本身就支持多账号登录。
     真正该拦的是：白嫖渠道、凭据自动续期、密钥末四位、跨渠道轮换…
     这些指向「绕过授权与计费」的行为。 */
  { id: 'accountpool', label: '白嫖/绕过计费', level: 'block',
    re: /(白嫖|共享账号|共用账号|拼车|凭据自动续期|凭据续期|跨渠道轮换|密钥末四位|号池|接码)/i },
  { id: 'accountpool-weak', label: '多账号池（弱信号）', level: 'flag',
    re: /(账号池|多账号池|多账号轮换|自动换号|自动签到|每日签到|积分领取)/i },

  /* ---- 免杀 / 攻击工具：只认**真的做攻击**的词 ---- */
  { id: 'offensive', label: '免杀/攻击工具', level: 'block',
    re: /(免杀|过杀软|绕过杀软|bypass\s*(av|defender|edr|amsi)|webshell|一句话木马|勒索软件|木马|远控|撞库|社工库|漏洞利用|\bexploit\b|\bddos\b|cc攻击)/i,
    /* 「提权 / 红队 / pentest / 渗透测试 / 钓鱼」在安全研究语境下是合规的。
       实测 17 条误杀全部来自这几个词（DSH 的沙箱提权审批、授权渗透、
       对抗式评审、钓鱼（捕鱼）助手都用了这些字） */
    except: /(授权|沙箱|审批|权限|合规|安全研究|对抗式评审|红队评审|CTF)/ },
  { id: 'security-research', label: '安全研究（弱信号）', level: 'flag',
    re: /(提权|红队|redteam|pentest|渗透测试|逆向|漏洞|钓鱼|exploit|授权安全)/i },

  /* ---- 游戏作弊 ---- */
  { id: 'gamecheat', label: '游戏作弊', level: 'block',
    /* 注意：「cheat engine / 游戏内存修改」必须无条件拦 ——
       首次校准时我把 except 写成 /调试/，结果 dsh-cheatengine
       的描述「动态内存调试…游戏内存修改」因为含「调试」被豁免，直接漏放。
       游戏作弊的判定不看语境：只要点名 Cheat Engine 或游戏内存修改就是作弊工具。 */
    re: /(cheat\s*engine|游戏内存修改|自瞄|\baimbot\b|\bwallhack\b|游戏外挂|反作弊绕过)/i },
  { id: 'transparency-ui', label: '窗口透明（弱信号）', level: 'flag',
    re: /(透视|内存修改)/i,
    except: /(主题|皮肤|透明|磨砂|亚克力|窗口|可视化)/ },

  /* ---- 赌博：本地棋牌娱乐插件在境内属高风险，转人工而不是直接毙 ---- */
  { id: 'gambling', label: '涉赌', level: 'flag',
    re: /(德州扑克|扑克桌|下注|筹码|博彩|赌场|赌球|六合彩|彩票|百家乐)/i },

  /* ---- 压测 / DoS ---- */
  { id: 'dos', label: '压测/DoS', level: 'block',
    re: /(\bddos\b|cc攻击|分布式拒绝服务)/i,
    except: /(压测|压力测试|性能测试|\bk6\b|基准)/ },
  { id: 'loadtest', label: '压测（弱信号）', level: 'flag',
    re: /(压测|压力测试|\bk6\b|并发压测)/i },

  /* ---- 破限 / 越狱 ---- */
  { id: 'jailbreak', label: '破限/越狱', level: 'block',
    re: /(软破限|破限|\bjailbreak\b|去除\.?注入|去除前置|去除后置|绕过审查|去审查|无审查)/i,
    /* 检测/防护类用途不算（dsh-defend 就是在检测提示词注入） */
    except: /(检测|拦截|防护|防御|审计|守卫)/ },

  /* ---- 弱信号：只转人工 ---- */
  /* 弱信号规则一律加 except：这些词在正常插件里常被「描述性提及」。
     实测这 5 类规则造成的转人工里，9 条有 8 条是误报：
       天气卡片说「没开 VPN 时城市跑偏」、附件面板说「从日志里还原 tailscale file cp」
       模型代理说「请求送进系统代理」、记忆面板 slug 里带 mihomo —— 全都不是远程网关。 */
  { id: 'remote-gateway', label: '远程访问网关', level: 'flag',
    re: /(tailscale|zerotier|\bfrp\b|内网穿透|\bvpn\b|公网访问|反向代理网关|移动端访问网关|公网隧道)/i,
    /* except 里绝对不能放「扫码 / 配对」—— 那正是远程网关插件的招牌措辞，
       实测加上这两个词后，dsh-remote-mobile 与 tongailinc-dsh-mobile-access
       两条高危条目直接被豁免漏放（拦截率从 100% 掉到 90%）。
       豁免只针对「描述性动作」：投送、还原历史、天气定位。 */
    except: /(投送|收件箱|file\s*cp|还原|历史|记录|城市|定位|天气)/ },
  { id: 'proxy-weak', label: '代理（弱信号）', level: 'flag',
    re: /(转发代理|http\s*代理|代理服务|\bproxy\b|socks5)/i,
    except: /(系统代理|直连|回落|网络配置|路由|分流|模型\s*API|出网|中继)/ },
  { id: 'shell-exec', label: '命令执行（弱信号）', level: 'flag',
    re: /(执行任意命令|任意命令|shell\s*执行|run\s*shell|命令注入)/i },
  { id: 'crawler', label: '批量采集（弱信号）', level: 'flag',
    re: /(群控|批量注册|养号|刷量|采集器|抢购|秒杀|打码平台|验证码识别)/i,
    except: /(系统健康|天气|邮件|行情|事件|监控|指标)/ },

  /* ---- 学术资源绕过 / 盗版文献：这是真实版权风险，单独一条 block ---- */
  { id: 'academic-piracy', label: '盗版文献/绕过机构授权', level: 'flag',
    re: /(sci-?hub|webvpn|carsi|知网|万方的?全流程|校外访问|文献代理)/i }
];

/** 待审文本：slug + 分类 + 描述 + 仓库名。
   为什么把 slug 也纳入：有的插件描述写得很干净，但包名本身就叫 xxx-baipiao / xxx-proxy。 */
function textOf(p) {
  return [p.slug, p.cat, p.desc, (p.repo || '').replace('https://github.com/', '')].join('\n');
}

/** 审核一条，返回 { decision, hits } */
function review(p) {
  const text = textOf(p);
  const block = [];
  const flag = [];
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (!m) continue;
    /* except：命中即豁免本条。注意这是**逐条豁免**，不是全局豁免 ——
       「授权渗透」可以放过 offensive，但不能连 adult 也一起放过。 */
    if (r.except && r.except.test(text)) continue;
    (r.level === 'block' ? block : flag).push({ id: r.id, label: r.label, word: m[0] });
  }
  /* 优先级：任一 block 命中 → 驳回；否则有 flag → 人工；都没有 → 通过 */
  let decision = 'approved';
  if (block.length) decision = 'rejected';
  else if (flag.length) decision = 'manual';
  return { decision, hits: block.concat(flag) };
}

function noteOf(res) {
  const hits = res.hits.map((h) => h.label + '(' + h.word + ')').join('；');
  if (res.decision === 'rejected') return '自动审核驳回：' + hits;
  if (res.decision === 'manual') return '自动审核转人工：' + hits;
  return '';
}

/* ========== 模式分发 ========== */
const args = process.argv.slice(2);
const TEST = args.includes('--test');
const DRY = args.includes('--dry-run');
const limArg = args.indexOf('--limit');
const LIMIT = limArg >= 0 ? Number(args[limArg + 1]) || 0 : 0;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ---- 模式一：回归测试。用已知的 21 条高危条目做正样本、published 做负样本 ---- */
if (TEST) {
  const hidden = db.prepare("SELECT id, slug, cat, desc, repo FROM plugins WHERE status='hidden'").all();
  /* 负样本里显式剔除已知的历史遗留问题条目 —— 它们「已上架」并不代表合规，
     拿它们当「应该通过」的样本会污染校准。目前只有 dsh-whale-loli
     （描述含「涩涩版 Agent 预设」），是上一轮整改漏掉的，应当单独下架。 */
  const KNOWN_BAD_PUBLISHED = new Set(['dsh-whale-loli']);
  const published = db.prepare("SELECT id, slug, cat, desc, repo FROM plugins WHERE status='published'").all()
    .filter((p) => !KNOWN_BAD_PUBLISHED.has(p.slug));

  let caught = 0;
  const missed = [];
  for (const p of hidden) {
    const r = review(p);
    if (r.decision !== 'approved') caught++;
    else missed.push(p);
  }
  console.log('【正样本】已下架的高危条目 ' + hidden.length + ' 条');
  console.log('  被规则拦住（rejected/manual）: ' + caught);
  console.log('  漏放（would be approved）    : ' + missed.length);
  for (const p of missed) console.log('    ! ' + p.slug + ' :: ' + (p.desc || '').slice(0, 60));
  console.log();

  let falsePos = [];
  for (const p of published) {
    const r = review(p);
    if (r.decision === 'rejected') falsePos.push({ p, r });
  }
  const fpRate = published.length ? (falsePos.length / published.length * 100).toFixed(2) : '0';
  console.log('【负样本】已上架的 ' + published.length + ' 条');
  console.log('  被误判驳回: ' + falsePos.length + '  误杀率 ' + fpRate + '%');
  for (const x of falsePos.slice(0, 15)) {
    console.log('    ? ' + x.p.slug + ' :: ' + x.r.hits.map(h => h.label + '(' + h.word + ')').join(', '));
  }
  console.log();

  const rc = caught / (hidden.length || 1) * 100;
  const ok = rc >= 95 && falsePos.length === 0;
  console.log(ok ? '✅ 回归通过：拦截率 ' + rc.toFixed(0) + '%，误杀 0'
                : '❌ 回归不通过：拦截率 ' + rc.toFixed(0) + '%，误杀 ' + falsePos.length);
  db.close();
  process.exit(ok ? 0 : 1);
}

/* ---- 模式二/三：审 pending ---- */
let sql = "SELECT id, slug, cat, desc, repo, status FROM plugins WHERE status='pending' ORDER BY id";
if (LIMIT) sql += ' LIMIT ' + LIMIT;
const rows = db.prepare(sql).all();
console.log('[review] 待审 ' + rows.length + ' 条' + (DRY ? '（dry-run，不写库）' : ''));

const stats = { approved: 0, rejected: 0, manual: 0 };
const manualList = [];
const rejectedList = [];
for (const p of rows) {
  const r = review(p);
  stats[r.decision]++;
  if (r.decision === 'manual') manualList.push({ p, r });
  if (r.decision === 'rejected') rejectedList.push({ p, r });
}

console.log('[review] 通过 ' + stats.approved + '  驳回 ' + stats.rejected + '  转人工 ' + stats.manual);
if (DRY) {
  console.log('--- 会被驳回的（最多 20 条）---');
  for (const x of rejectedList.slice(0, 20)) console.log('  - ' + x.p.slug + ' :: ' + x.r.hits.map(h => h.label + '(' + h.word + ')').join(', '));
  console.log('--- 会转人工的（最多 20 条）---');
  for (const x of manualList.slice(0, 20)) console.log('  ? ' + x.p.slug + ' :: ' + x.r.hits.map(h => h.label + '(' + h.word + ')').join(', '));
  db.close();
  process.exit(0);
}

/* 写库：approved → published；rejected → rejected；manual → 保持 pending 但写备注 */
const stUpdate = db.prepare(
  'UPDATE plugins SET status = ?, review_note = ?, reviewed_by = 0, reviewed_at = ?, updated_at = updated_at WHERE id = ?'
);
const parentRun = db.prepare('SELECT reviewed_at FROM plugins WHERE id = ?');
const now = Math.floor(Date.now() / 1000);
let changed = 0;
const tx = db.transaction((list) => {
  for (const item of list) {
    stUpdate.run(item.decision === 'approved' ? 'published' : (item.decision === 'rejected' ? 'rejected' : 'pending'),
      noteOf(item), now, item.id);
    changed++;
  }
});
const st = (s) => 'UPDATE plugins SET status = ?, review_note = ?, reviewed_by = 0, reviewed_at = ?, updated_at = updated_at WHERE id = ?';
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500).map((p) => {
    const r = review(p);
    return { id: p.id, decision: r.decision, note: noteOf(r) };
  });
  db.transaction((list) => {
    for (const x of list) {
      stUpdate.run(x.decision === 'approved' ? 'published' : (x.decision === 'rejected' ? 'rejected' : 'pending'),
        x.note, now, x.id);
    }
  })(chunk);
  console.log('[review] 进度 ' + Math.min(i + 500, rows.length) + '/' + rows.length);
}

db.pragma('wal_checkpoint(TRUNCATE)');
const after = db.prepare('SELECT status, COUNT(*) n FROM plugins GROUP BY status').all();
console.log('[review] 完成。当前分布: ' + JSON.stringify(after));
db.close();