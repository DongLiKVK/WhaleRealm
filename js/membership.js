/* ══════════════════════════════════════════════════════════════
   鲸域 · 深潜计划（会员赞助）#/vip、#/vip/center、#/vip/pay/<单号>
   后台 #/admin/sponsors 在 js/membership-admin.js（另一个模块），两边只共用契约。

   为什么单独一个文件：会员页有自己的数据、状态机和轮询，塞进 app.js（已经 500KB）
   只会让路由分支更难读。宿主只做三件事：路由、导航入口、挂载。

   宿主把 { S, esc } 递进来（和 rank.js 一样）；本文件不读全局 DATA，
   所有数据走 /api/membership/*，失败就显示错误态 —— 不拿演示数据冒充真实订单。
   ══════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';

  var B = (win.DSH_API_BASE || '') + '/api';
  /* 赞助相关的收信地址：只在这一个地方改。
     原来写死的是一个 .local 假域名，用户发信会直接退回。 */
  var CONTACT_EMAIL = '1852907064@qq.com';
  var CACHE = { overview: null, me: null, orders: null, order: null, at: 0 };
  /* 默认月付（v45）：价目卡先按「/月」展示，年付留在右侧切换里 —— 先看到门槛最低的价，再让用户自己选省 18%。 */
  var STATE = { cycle: 'month', filter: 'all', open: {}, busy: '', err: null, qr: null, channel: '' };
  var TIMER = null;      /* 收银台：每秒倒计时 */
  var LAST = '';         /* 上一次 paint 出来的正文 */
  var LAST_HASH = '';    /* 它对应的地址：同页重绘原样放回，地址变了才重新画 */
  var POLL = null;       /* 收银台：每 4 秒查一次订单状态 */
  var ROUTE = { name: 'home' };

  /* 四档的展示元数据。价格不写死在这里 —— 一律用服务端 member_plans，
     后台改价后前台立刻跟着变；这里只放颜色、图标和文案。 */
  var TIER = {
    free:        { name: '旅人', icon: '🐋', accent: '#7f95a8', short: '未赞助' },
    diamond:     { name: '钻石', icon: '💎', accent: '#38bdf8', short: '先上船的人' },
    master:      { name: '大师', icon: '🧭', accent: '#8b7cf6', short: '让账单轻一点' },
    grandmaster: { name: '宗师', icon: '🔱', accent: '#f0a63c', short: '一起决定下一版' },
    hunt:        { name: '猎杀', icon: '🦈', accent: '#f2557a', short: '深水区的同行者' }
  };
  var ORDER = ['free', 'diamond', 'master', 'grandmaster', 'hunt'];
  var RANK = { free: 0, diamond: 1, master: 2, grandmaster: 3, hunt: 4 };

  var BLURB = {
    diamond: '适合常来逛、想给服务器添一块硬盘的人。',
    master: '覆盖一份图床流量，附赠内测通道与加精申请。',
    grandmaster: '私有仓库与每月一次 1v1，把想法直接摊在桌上。',
    hunt: '20 个席位。年度铭牌、优先响应与定制称号。'
  };
  var PERKS = {
    diamond: ['赞助者徽章与专属配色', '赞助者墙署名（可匿名）', '高清原图 / 插件包 50 次/日', '服务器状态页与故障预告'],
    master: ['钻石全部权益', '下载额度 200 次/日', '专属表情与贴纸包', '帖子加精 / 首页推荐申请'],
    grandmaster: ['大师全部权益', '私有插件仓库 3 个', '新功能内测通道', '每月 1 次 1v1 咨询'],
    hunt: ['宗师全部权益', '私有仓库 10 个 + 工单优先', '每月 4 次 1v1 咨询', '自定义称号 + 年度服务器铭牌']
  };

  /* 权益对照表：key / 名称 / 五档取值 / 备注 / 分组。
     true=有，false=无，字符串=额度文案。服务端只回 benefitKeys（已解锁的 key），
     表里的额度文案是产品承诺，改口径要同步后台与文档。 */
  var BENEFITS = [
    ['badge', '赞助者徽章与专属配色', [false, true, true, true, true], '主页、帖子、评论都会显示', '身份'],
    ['wall', '赞助者墙署名', [false, true, true, true, true], '可随时关掉，显示为「匿名鲸友」', '身份'],
    ['title', '自定义称号后缀', [false, false, false, false, true], '例如「· 深水区」', '身份'],
    ['thanks', '年度感谢名单 / 服务器铭牌', [false, false, false, true, true], '年底统一制作，实物邮寄', '身份'],
    ['download', '高清原图 / 插件包下载额度', ['10 次/日', '50 次/日', '200 次/日', '不限', '不限'], '按账号计，次日零点重置', '额度'],
    ['private', '私有插件仓库托管', [false, false, false, '3 个', '10 个'], '不进入公开插件库', '额度'],
    ['status', '服务器状态页与故障预告', [false, true, true, true, true], '维护窗口提前 24 小时知道', '使用'],
    ['emoji', '专属表情与贴纸包', [false, true, true, true, true], '评论区与私信可用', '使用'],
    ['beta', '新功能内测通道', [false, false, false, true, true], '提前一周拿到构建', '使用'],
    ['boost', '帖子加精 / 首页推荐申请', [false, false, true, true, true], '人工审核，内容质量优先', '社群'],
    ['consult', '1v1 技术咨询', [false, false, false, '1 次/月', '4 次/月'], '文字或语音，提前预约', '社群'],
    ['priority', '工单优先响应', [false, false, false, false, true], '工作日 4 小时内', '社群']
  ];

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) {
    var v = (Number(cents) || 0) / 100;
    return v.toFixed(2);
  }
  function price(cents) {
    var v = (Number(cents) || 0) / 100;
    var s = v % 1 === 0 ? String(v) : v.toFixed(2);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function perDay(cents, days) {
    if (!days) return '';
    return ((Number(cents) || 0) / days / 100).toFixed(2);
  }
  function fmtDate(sec) {
    if (!sec) return '—';
    var d = new Date(sec * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDT(sec) {
    if (!sec) return '—';
    var d = new Date(sec * 1000);
    return fmtDate(sec) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dayDiff(sec) {
    if (!sec) return 0;
    return Math.ceil((sec - Date.now() / 1000) / 86400);
  }
  function planOf(tier, cycle) {
    var ps = (CACHE.overview && CACHE.overview.plans) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].tier === tier && ps[i].cycle === cycle) return ps[i];
    return null;
  }
  function tierName(t) { return (TIER[t] && TIER[t].name) || t || '旅人'; }
  function toast(msg, icon) {
    if (typeof win.__dshToast === 'function') return win.__dshToast(msg, icon);
    var d = document.createElement('div');
    d.className = 'vip-toast';
    d.textContent = (icon ? icon + ' ' : '') + msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 2200);
    setTimeout(function () { d.remove(); }, 2600);
  }
  function api(path, opts) {
    var o = Object.assign({ credentials: 'same-origin', headers: {} }, opts || {});
    if (o.body && typeof o.body !== 'object') o.body = JSON.stringify(o.body);
    if (o.body && typeof o.body === 'object') { o.body = JSON.stringify(o.body); o.headers['Content-Type'] = 'application/json'; }
    return fetch(B + path, o).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok || !json || json.ok === false) {
          var e = new Error((json && json.error && json.error.message) || ('请求失败 ' + res.status));
          e.code = (json && json.error && json.error.code) || 'HTTP_' + res.status;
          e.status = res.status;
          throw e;
        }
        return json.data;
      });
    });
  }
  function authed() {
    if (!win.AUTH || !win.AUTH.state) return false;
    return win.AUTH.state().mode === 'authed';
  }
  function go(hash) {
    if ((location.hash || '') === hash) { win.Member.mount(); return; }
    location.hash = hash;
  }
  function setBusy(btn, on, text) {
    if (!btn) return;
    if (on) {
      btn.dataset.old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = text || '处理中…';
    } else {
      btn.disabled = false;
      if (btn.dataset.old) btn.innerHTML = btn.dataset.old;
    }
  }

  /* ---------- 路由 ---------- */
  function routeInfo() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var seg = h.split('/').filter(Boolean);
    if (seg[0] === 'vip') {
      if (seg[1] === 'center') return { name: 'center' };
      if (seg[1] === 'pay' && seg[2]) return { name: 'pay', no: decodeURIComponent(seg[2]) };
      return { name: 'home' };
    }
    if (seg[0] === 'admin') return { name: 'admin' };
    return { name: 'home' };
  }

  /* ---------- 落地页 ---------- */
  function heroHTML() {
    var mine = CACHE.me && CACHE.me.member && CACHE.me.member.active ? CACHE.me.member : null;
    var mineLine = mine
      ? '<button type="button" class="vip-mine" data-act="vip-center">你已是' + esc(mine.name) + ' · 剩 ' + mine.daysLeft + ' 天<span>进会员中心 ›</span></button>'
      : '';
    return '<section class="vip-hero">' +
      '<div class="vip-hero-bg" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<div class="vip-hero-copy">' +
        '<span class="vip-kicker"><span class="vip-dot"></span>鲸域 · 深潜计划</span>' +
        '<h1>把鲸域留在海上</h1>' +
        '<p>第一次来的话，先把这里当成一个能坐下来的地方：随便翻翻，看看帖子，' +
        '什么时候想赞助了再赞助 —— 欢迎你，慢慢来。</p>' +
        '<div class="vip-hero-actions">' +
          '<button type="button" class="vip-btn primary lg" data-act="vip-scroll" data-target="vip-tiers">选择档位</button>' +
        '</div>' + mineLine +
      '</div>' +
      /* 人物动画位：与首页头图 / 鲸鲸空间头图 / 登录左卡同一张 whale/index.html 立绘卡。
         clear=1 让卡面底色透出去，直接坐在 hero 自己的深蓝渐变上（不起一块矩形）；
         spot=center 让它站在槽位正中，而不是贴向右侧的圆环指标。 */
      /* 量尺：只占住网格里原来那一列（列宽/宽高比不变），给 syncHeroLayout() 读
         「角色默认该站在哪、多高」；本身不画任何东西。真正的 iframe 铺在整张 hero 上。 */
      '<div class="vip-hero-figure" aria-hidden="true"></div>' +
      /* 立绘 iframe 铺满整张 hero：整块卡片都是拖拽空间，角色能横跨整张卡。
         默认站位不靠 iframe 自己算，由 syncHeroLayout() 按上面那把量尺换算后 postMessage 进去 ——
         于是「可拖范围」变成整卡，「默认站位」还是原来那一列的位置。 */
      '<iframe class="vip-figure-frame" src="whale/index.html?embed=1&bare=1&clear=1&spot=center" ' +
        'title="鲸鱼娘动态立绘：按住拖拽、双击换动作" scrolling="no" loading="eager" tabindex="-1"></iframe>' +
    '</section>';
  }

  function cycleSwitchHTML() {
    var y = STATE.cycle === 'year';
    var m = planOf('master', 'month'), yr = planOf('master', 'year');
    var save = m && yr ? Math.round(100 - (yr.priceCents / (m.priceCents * 12)) * 100) : 0;
    return '<div class="vip-cycle" role="group" aria-label="计费周期">' +
      '<button type="button" class="' + (y ? '' : 'on') + '" data-act="vip-cycle" data-cycle="month" aria-pressed="' + (!y) + '">月付</button>' +
      '<button type="button" class="' + (y ? 'on' : '') + '" data-act="vip-cycle" data-cycle="year" aria-pressed="' + y + '">年付' +
        (save > 0 ? '<em>省 ' + save + '%</em>' : '') + '</button>' +
    '</div>';
  }

  /* 支付方式选择器。放在「下单之前」是因为渠道一旦写进订单就改不了：
     想换只能取消重下单，那还不如让用户先选。
     live=false 的按钮置灰 —— 对着一个没接密钥的通道让用户扫码，
     是比不做支付更伤信任的事。 */
/* 默认选中的渠道 = 列表里第一条 live 的。
   不能写死 'afdian'：AFDIAN_URL 没配时后端会把这条标成 live=false，
   前端还默认选它就会让用户点「选择」时撞一个 BAD_CHANNEL。 */
  function firstLiveChannel(list) {
    for (var i = 0; i < list.length; i++) if (list[i].live) return list[i].id;
    /* 一条都没有：返回空串，让下单处拦住并给一句人话，
       而不是挑一个不可用的渠道去撞后端 400。 */
    return '';
  }

  function channelPickerHTML() {
    var list = (CACHE.overview && CACHE.overview.channels) || [];
    /* 只认 live 的。后端概览已经过滤过一遍，但这里是防旧缓存的那一层：
       缓存里还留着 wechat/alipay 的时候，不能让它们重新长出灰按钮。 */
    list = list.filter(function (c) { return c.live; });
    if (!list.length) {
      return '<p class="vip-fine">赞助通道暂时关闭：还没有配置可用的支付方式。</p>';
    }
    /* STATE.channel 可能来自上一版缓存（比如之前选过「扫码转账」），
       留着它就会带着一个后端不认的渠道去下单 —— 必须校验一遍再落定。 */
    var cur = STATE.channel;
    if (!list.some(function (c) { return c.id === cur; })) cur = firstLiveChannel(list);
    /* 渲染即落定：下单读的是 STATE.channel，这里不写回去的话，
       用户在没点过按钮的情况下会带着一个空渠道提交。 */
    STATE.channel = cur;
    return '<div class="vip-paymethod" role="group" aria-label="支付方式">' +
      '<span class="vip-paymethod-lb">支付方式</span>' +
      list.map(function (c) {
        var on = c.id === cur;
        return '<button type="button" class="vip-pm' + (on ? ' on' : '') + '"' +
          ' data-act="vip-channel" data-channel="' + esc(c.id) + '" aria-pressed="' + on + '">' +
          '<b>' + esc(c.name) + '</b><span>' + esc(c.hint) + '</span></button>';
      }).join('') +
    '</div>';
  }

  function tierCardsHTML() {
    var ov = CACHE.overview || {};
    var seats = (ov.seats && ov.seats.hunt) || { total: 0, used: 0, left: 0 };
    var cards = ORDER.slice(1).map(function (t) {
      var p = planOf(t, STATE.cycle);
      if (!p) return '';
      var m = planOf(t, 'month');
      var list = p.listCents || (m ? m.priceCents * 12 : 0);
      var hit = t === 'grandmaster';
      var soldOut = t === 'hunt' && seats.total > 0 && seats.left <= 0;
      var seatLine = t === 'hunt'
        ? '<span class="vip-seat' + (seats.left <= 5 ? ' hot' : '') + '">' + (soldOut ? '本期已满' : '仅剩 ' + seats.left + ' / ' + seats.total + ' 席') + '</span>'
        : (hit ? '<span class="vip-seat rec">最多人选</span>' : '');
      return '<article class="vip-tier' + (hit ? ' hit' : '') + '" data-tier="' + t + '" style="--tc:' + TIER[t].accent + '">' +
        '<header class="vip-tier-hd">' +
          '<span class="vip-tier-ic" aria-hidden="true">' + TIER[t].icon + '</span>' +
          '<div class="vip-tier-name"><h3>' + TIER[t].name + '</h3><p>' + TIER[t].short + '</p></div>' + seatLine +
        '</header>' +
        '<div class="vip-price"><span class="cur">¥</span><b>' + price(p.priceCents) + '</b><span class="per">/' + (p.cycle === 'year' ? '年' : '月') + '</span>' +
          (p.cycle === 'year' && list > p.priceCents ? '<s>¥' + price(list) + '</s>' : '') + '</div>' +
        '<div class="vip-perday">≈ ¥' + perDay(p.priceCents, p.durationDays) + ' / 天 · ' + p.durationDays + ' 天</div>' +
        '<ul class="vip-perks">' + (PERKS[t] || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="vip-btn ' + (hit ? 'primary' : 'line') + ' block" data-act="vip-buy" data-tier="' + t + '" data-cycle="' + STATE.cycle + '"' + (soldOut ? ' disabled' : '') + '>' +
          (soldOut ? '本期已满，等下一期' : '选择' + TIER[t].name + ' · ¥' + price(p.priceCents)) + '</button>' +
        '<p class="vip-tier-note">' + esc(BLURB[t] || '') + '</p>' +
      '</article>';
    }).join('');
    return '<section class="vip-section" id="vip-tiers">' +
      '<div class="vip-sec-hd"><div><h2>选一个你舒服的位置</h2><p>四档都是「一次性付款、到期不自动扣费」。年付一次付清，比按月省 18%–22%；随时可以升级，差价按剩余天数折算。</p></div>' + cycleSwitchHTML() + '</div>' +
      channelPickerHTML() +
      '<div class="vip-tiers">' + cards + '</div>' +
      '<p class="vip-fine">价格单位人民币，含税。猎杀席位按自然月释放，满席后可以留邮箱排队。</p>' +
    '</section>';
  }

  function compareHTML() {
    var head = ORDER.slice(1).map(function (t) {
      return '<th scope="col" style="--tc:' + TIER[t].accent + '"><span class="vip-th-ic">' + TIER[t].icon + '</span>' + TIER[t].name + '</th>';
    }).join('');
    var groups = {};
    BENEFITS.forEach(function (b) { (groups[b[4]] = groups[b[4]] || []).push(b); });
    var body = Object.keys(groups).map(function (g) {
      return '<tr class="vip-tr-group"><th colspan="6" scope="colgroup">' + esc(g) + '</th></tr>' +
        groups[g].map(function (b) {
          return '<tr><th scope="row"><b>' + esc(b[1]) + '</b><span>' + esc(b[3]) + '</span></th>' +
            b[2].slice(1).map(function (v) {
              return '<td>' + (v === true ? '<span class="vip-yes" aria-label="包含">✓</span>' : v === false ? '<span class="vip-no" aria-label="不含">—</span>' : esc(v)) + '</td>';
            }).join('') + '</tr>';
        }).join('');
    }).join('');
    return '<section class="vip-section" id="vip-compare">' +
      '<div class="vip-sec-hd"><div><h2>权益对照</h2><p>左边是承诺，右边是额度。没实现的会标「规划中」，不写在表里充数。</p></div></div>' +
      '<div class="vip-table-wrap"><table class="vip-table">' +
        '<caption class="vip-sr">会员等级权益对照表</caption>' +
        '<thead><tr><th scope="col">权益</th>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    '</section>';
  }

  /* 赞助者墙的头像：非匿名用户露自己那张脸 —— 上传过头像就用上传的，
     没上传就落到全站默认的鲸鱼（和后端 avURL 的口径一致）；
     匿名用户不露任何身份线索，只留一个「匿」字。 */
  function wallAvaHTML(w) {
    var anon = w.anon === true || String(w.name || '') === '匿名鲸友';
    var src = anon ? '' : (w.avatar || win.DEFAULT_AVA_IMG || '');
    if (!src) return '<span class="vip-wall-av" aria-hidden="true">匿</span>';
    return '<span class="vip-wall-av"><img src="' + esc(src) + '" alt="" loading="lazy"></span>';
  }

  function wallHTML() {
    var list = ((CACHE.overview && CACHE.overview.wall) || []).slice();
    if (!list.length) {
      return '<section class="vip-section" id="vip-wall"><div class="vip-sec-hd"><div><h2>赞助者墙</h2><p>还没人留名。第一个名字会一直排在最前面。</p></div></div>' +
        '<div class="vip-empty">空着也是一种开始。</div></section>';
    }
    return '<section class="vip-section" id="vip-wall">' +
      '<div class="vip-sec-hd"><div><h2>赞助者墙</h2><p>按等级排序，同档按时间。关掉公开署名后显示为「匿名鲸友」，金额从不公开。</p></div>' +
        '<span class="vip-tag">' + list.length + ' 位</span></div>' +
      '<div class="vip-wall">' + list.map(function (w) {
        var t = TIER[w.tier] ? w.tier : 'diamond';
        return '<div class="vip-wall-i" style="--tc:' + TIER[t].accent + '">' +
          wallAvaHTML(w) +
          '<div class="vip-wall-tx"><b>' + esc(w.name || '匿名鲸友') + '</b>' +
            '<span class="vip-chip" style="--tc:' + TIER[t].accent + '">' + TIER[t].icon + ' ' + TIER[t].name + '</span>' +
            (w.note ? '<p>' + esc(w.note) + '</p>' : '<p>从 ' + fmtDate(w.since) + ' 开始</p>') +
          '</div></div>';
      }).join('') + '</div>' +
    '</section>';
  }

  function ctaHTML() {
    return '<section class="vip-cta">' +
      '<div><h2>如果这里值得，就一起把它撑住</h2><p>哪怕只赞助一个月，也是在替下一个人保留这个地方。</p></div>' +
      '<div class="vip-cta-actions"><button type="button" class="vip-btn primary lg" data-act="vip-scroll" data-target="vip-tiers">选档位</button>' +
      '<button type="button" class="vip-btn ghost lg" data-act="vip-center">我的会员</button></div>' +
    '</section>';
  }

  function homeHTML() {
    return heroHTML() + tierCardsHTML() + framesHTML() + compareHTML() + wallHTML() + ctaHTML();
  }
  /* 头像框展台：四款样品由 js/avatar-frame.js 出，模块没加载就整段不出。
     放在档位卡后面 —— 刚看完价格，正好看见「买了之后脸上会多什么」。 */
  function framesHTML() {
    return (win.AvatarFrame && win.AvatarFrame.section) ? win.AvatarFrame.section() : '';
  }

  /* ---------- 骨架 / 错误态 ---------- */
  function skeleton(n) {
    var rows = '';
    for (var i = 0; i < (n || 4); i++) rows += '<div class="vip-sk-row"><i></i><i></i></div>';
    return '<div class="vip-skeleton" aria-busy="true" aria-label="加载中">' + rows + '</div>';
  }
  function errorHTML(e) {
    var msg = (e && (e.message || e.code)) || '网络不太稳';
    return '<div class="vip-error" role="alert"><span aria-hidden="true">🫧</span><b>没拿到数据</b><p>' + esc(msg) + '</p>' +
      '<button type="button" class="vip-btn line" data-act="vip-retry">再试一次</button></div>';
  }
  function authGateHTML(what) {
    return '<div class="vip-gate"><span aria-hidden="true">🐋</span><b>先登录，再看' + esc(what) + '</b>' +
      '<p>会员中心里的到期时间、订单和发票都跟着账号走；没账号的话注册一个，只要邮箱。</p>' +
      '<div class="vip-gate-actions"><button type="button" class="vip-btn primary" data-act="vip-login">去登录</button>' +
      '<button type="button" class="vip-btn ghost" data-act="vip-home">先看看档位</button></div></div>';
  }

  /* ---------- 会员中心 ---------- */
  function avatarOf() {
    var st = win.AUTH && win.AUTH.state ? win.AUTH.state() : {};
    if (st.avatar) return '<img src="' + esc(st.avatar) + '" alt="">';
    if (st.emoji) return '<span class="vip-id-emo">' + esc(st.emoji) + '</span>';
    var n = st.name || '鲸';
    return '<span class="vip-id-emo">' + esc(n.slice(0, 1)) + '</span>';
  }
  function idCardHTML(d) {
    var m = d.member || {};
    var t = m.active ? (TIER[m.tier] || TIER.free) : TIER.free;
    var totals = d.totals || {};
    var st = win.AUTH && win.AUTH.state ? win.AUTH.state() : {};
    var elapsed = 0;
    if (m.active && m.startedAt && m.expiresAt > m.startedAt) {
      elapsed = Math.max(0, Math.min(100, Math.round((Date.now() / 1000 - m.startedAt) / (m.expiresAt - m.startedAt) * 100)));
    }
    var head, actions;
    if (m.active) {
      head = '<span class="vip-id-tier" style="--tc:' + t.accent + '">' + t.icon + ' ' + esc(m.name) + '赞助者</span>' +
        '<h2>' + esc(st.name || '鲸友') + '</h2>' +
        '<p>从 ' + fmtDate(m.startedAt) + ' 开始 · 累计赞助 ¥' + money(totals.paidCents || 0) + ' · ' + (totals.orders || 0) + ' 笔</p>' +
        '<div class="vip-id-days"><b>' + Math.max(0, m.daysLeft) + '</b><span>天后到期</span></div>';
      actions = '<button type="button" class="vip-btn primary" data-act="vip-renew" data-tier="' + m.tier + '">续费同档</button>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-upgrade">升级档位</button>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-invoice" data-no="' + esc(m.orderNo || '') + '">申请发票</button>' +
        '<label class="vip-switch"><input type="checkbox" data-act="vip-vis"' + (m.showName ? ' checked' : '') + '><span>公开署名</span></label>';
    } else {
      head = '<span class="vip-id-tier" style="--tc:' + TIER.free.accent + '">🐋 旅人</span>' +
        '<h2>' + esc(st.name || '鲸友') + '</h2>' +
        '<p>' + (m.expired ? '上一段赞助已经在 ' + fmtDate(m.expiresAt) + ' 到期，随时可以回来。' : '还没赞助过。这里的内容一直免费，赞助只是让账单有着落。') + '</p>' +
        '<div class="vip-id-days"><b>0</b><span>天会员</span></div>';
      actions = '<button type="button" class="vip-btn primary" data-act="vip-upgrade">看看档位</button>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-invoice" data-no="">申请发票</button>';
    }
    return '<section class="vip-id" style="--tc:' + t.accent + '">' +
      '<div class="vip-id-main">' +
        '<span class="vip-id-av">' + avatarOf() + '</span>' +
        '<div class="vip-id-tx">' + head + '</div>' +
      '</div>' +
      '<div class="vip-id-bar" aria-hidden="true"><i style="width:' + (m.active ? elapsed : 0) + '%"></i></div>' +
      '<p class="vip-id-sub">' + (m.active
        ? '本周期已过 ' + elapsed + '% · ' + fmtDate(m.expiresAt) + ' 到期 · 不自动续费'
        : '免费档：下载 10 次/日，其余权益随赞助解锁') + '</p>' +
      '<div class="vip-id-actions">' + actions + '</div>' +
    '</section>';
  }

  function benefitListHTML(keys) {
    var has = {};
    (keys || []).forEach(function (k) { has[k] = 1; });
    return '<section class="vip-card vip-bene">' +
      '<div class="vip-card-hd"><h2>你的权益</h2><span>' + (keys || []).length + ' / ' + BENEFITS.length + ' 已解锁</span></div>' +
      '<div class="vip-bene-list">' + BENEFITS.map(function (b) {
        var on = !!has[b[0]];
        var idx = RANK[(CACHE.me && CACHE.me.member && CACHE.me.member.tier) || 'free'] || 0;
        var need = null;
        for (var i = 1; i < ORDER.length; i++) { if (b[2][i]) { need = ORDER[i]; break; } }
        return '<div class="vip-bene-i' + (on ? ' on' : '') + '">' +
          '<span class="vip-bene-ic" aria-hidden="true">' + (on ? '✓' : '🔒') + '</span>' +
          '<div><b>' + esc(b[1]) + '</b><span>' + esc(b[3]) + '</span></div>' +
          (on ? '<em>已解锁</em>' : '<em class="lock">' + (need ? '需' + tierName(need) : '—') + '</em>') +
        '</div>';
      }).join('') + '</div>' +
    '</section>';
  }

  function nextTierHTML(d) {
    var m = d.member || {};
    var cur = RANK[m.tier] || 0;
    if (cur >= 4) {
      return '<section class="vip-card vip-next"><div class="vip-card-hd"><h2>下一站</h2></div>' +
        '<div class="vip-next-bd"><p>你已经在最深的一档。剩下的只有一件事：把这里推荐给一个可能会喜欢它的人。</p>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-copy" data-text="鲸域 · 一个还在认真做插件与二创的小站">复制一句推荐语</button></div></section>';
    }
    var nt = ORDER[cur + 1];
    var p = planOf(nt, 'month');
    var t = TIER[nt];
    return '<section class="vip-card vip-next" style="--tc:' + t.accent + '">' +
      '<div class="vip-card-hd"><h2>下一站 · ' + t.icon + ' ' + t.name + '</h2></div>' +
      '<div class="vip-next-bd">' +
        '<p>' + esc(BLURB[nt]) + '</p>' +
        (p ? '<div class="vip-next-price"><b>¥' + price(p.priceCents) + '</b><span>/ 月 · ' + p.durationDays + ' 天</span></div>' : '') +
        '<ul class="vip-perks">' + (PERKS[nt] || []).slice(1, 4).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="vip-btn line block" data-act="vip-upgrade">看看升级差价</button>' +
      '</div></section>';
  }

  function orderStatus(s) {
    return { pending: ['待支付', 'wait'], paid: ['已支付', 'ok'], closed: ['已关闭', 'off'], refunded: ['已退款', 'rose'] }[s] || [s, 'off'];
  }
  function orderItemHTML(o) {
    var ss = orderStatus(o.status);
    var open = !!STATE.open[o.orderNo];
    var acts = '';
    if (o.status === 'pending') {
      acts = '<button type="button" class="vip-btn sm primary" data-act="vip-gopay" data-no="' + esc(o.orderNo) + '">继续支付</button>' +
        '<button type="button" class="vip-btn sm ghost" data-act="vip-cancel" data-no="' + esc(o.orderNo) + '">关闭订单</button>';
    } else if (o.status === 'paid') {
      acts = '<button type="button" class="vip-btn sm ghost" data-act="vip-invoice" data-no="' + esc(o.orderNo) + '">申请发票</button>' +
        '<button type="button" class="vip-btn sm ghost" data-act="vip-renew" data-tier="' + esc(o.tier) + '">再续一期</button>';
    } else if (o.status === 'refunded') {
      acts = '<span class="vip-order-refund">已退 ¥' + money(o.refundCents || o.amountCents) + '</span>';
    }
    return '<article class="vip-order' + (open ? ' open' : '') + '">' +
      '<button type="button" class="vip-order-hd" data-act="vip-open" data-no="' + esc(o.orderNo) + '" aria-expanded="' + open + '">' +
        '<span class="vip-order-main"><b>' + esc(o.tierName || tierName(o.tier)) + ' · ' + (o.cycle === 'year' ? '年付' : '月付') + '</b>' +
          '<span class="vip-order-no">' + esc(o.orderNo) + '</span>' +
          '<span class="vip-order-time">' + fmtDT(o.createdAt) + '</span></span>' +
        '<span class="vip-order-amt">¥' + money(o.amountCents) + '</span>' +
        '<span class="vip-st ' + ss[1] + '">' + ss[0] + '</span>' +
        '<span class="vip-chev" aria-hidden="true">›</span>' +
      '</button>' +
      '<div class="vip-order-bd"><div class="vip-order-in">' +
        '<dl class="vip-kv">' +
          '<div><dt>订单号</dt><dd>' + esc(o.orderNo) + ' <button type="button" class="vip-mini" data-act="vip-copy" data-text="' + esc(o.orderNo) + '">复制</button></dd></div>' +
          '<div><dt>渠道</dt><dd>' + esc(o.channelText || o.channel) + '</dd></div>' +
          '<div><dt>创建</dt><dd>' + fmtDT(o.createdAt) + '</dd></div>' +
          '<div><dt>支付</dt><dd>' + fmtDT(o.paidAt) + '</dd></div>' +
          '<div><dt>权益</dt><dd>' + (o.status === 'paid' ? '自支付日起 ' + (o.cycle === 'year' ? '365' : '30') + ' 天' : '支付后生效') + '</dd></div>' +
          (o.note ? '<div><dt>备注</dt><dd>' + esc(o.note) + '</dd></div>' : '') +
        '</dl>' +
        '<div class="vip-order-actions">' + acts + '</div>' +
      '</div></div>' +
    '</article>';
  }

  function ordersHTML(d) {
    var all = (CACHE.orders && CACHE.orders.items) || [];
    var counts = { all: all.length };
    all.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
    var list = STATE.filter === 'all' ? all : all.filter(function (o) { return o.status === STATE.filter; });
    var tabs = [['all', '全部'], ['pending', '待支付'], ['paid', '已支付'], ['refunded', '已退款'], ['closed', '已关闭']];
    return '<section class="vip-card vip-orders">' +
      '<div class="vip-card-hd"><h2>赞助记录</h2><span>' + (CACHE.orders ? CACHE.orders.total : 0) + ' 笔 · 累计 ¥' + money((d.totals && d.totals.paidCents) || 0) + '</span></div>' +
      '<div class="vip-filters">' + tabs.map(function (t) {
        return '<button type="button" class="' + (STATE.filter === t[0] ? 'on' : '') + '" data-act="vip-filter" data-filter="' + t[0] + '">' + t[1] +
          (counts[t[0]] ? '<em>' + counts[t[0]] + '</em>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="vip-order-list">' + (list.length ? list.map(orderItemHTML).join('') :
        '<div class="vip-empty">' + (STATE.filter === 'all' ? '还没有赞助记录。选一档，账单上就能少一行。' : '这个状态下没有订单。') + '</div>') + '</div>' +
      '<p class="vip-fine">只显示最近 100 笔。要查更早的订单，把订单号发到 ' + esc(CONTACT_EMAIL) + '。</p>' +
    '</section>';
  }

  function centerHTML() {
    if (STATE.err) return errorHTML(STATE.err);
    if (!CACHE.me) return skeleton(4);
    var d = CACHE.me;
    if (!d.member) return authGateHTML('你的赞助记录');
    return '<div class="vip-center">' +
      '<div class="vip-crumb"><button type="button" data-act="vip-home">深潜计划</button><span>/</span><b>会员中心</b></div>' +
      idCardHTML(d) +
      '<div class="vip-center-grid">' + benefitListHTML(d.benefitKeys) + nextTierHTML(d) + '</div>' +
      ordersHTML(d) +
    '</div>';
  }

  /* ---------- 收银台 ---------- */
  /* 伪二维码：只是占位图形，不编码任何支付信息。同一订单号每次画出来一样，
     看起来像真的，但旁边永远写着「演示占位」。真实渠道接上后换 provider 返回的 code_url。 */
  function qrSVG(seed) {
    var n = 29;
    var h = 2166136261;
    seed = String(seed || 'JY');
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    function rnd() { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }
    function inFinder(x, y) { return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7); }
    function finderOn(x, y) {
      var lx = x >= n - 7 ? x - (n - 7) : x;
      var ly = y >= n - 7 ? y - (n - 7) : y;
      return lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
    }
    var cells = '';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var on = inFinder(x, y) ? finderOn(x, y) : rnd() > 0.54;
        if (on) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    return '<svg class="vip-qr-svg" viewBox="-1 -1 ' + (n + 2) + ' ' + (n + 2) + '" role="img" aria-label="支付二维码（演示占位）" shape-rendering="crispEdges">' +
      '<rect x="-1" y="-1" width="' + (n + 2) + '" height="' + (n + 2) + '" fill="#fff"/>' +
      '<g fill="#0b1a26">' + cells + '</g></svg>';
  }

  function fmtLeft(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return pad(m) + ':' + pad(s);
  }

  function paySuccessHTML(o) {
    var m = (CACHE.me && CACHE.me.member) || null;
    var t = m && m.active ? (TIER[m.tier] || TIER.free) : (TIER[o.tier] || TIER.free);
    return '<div class="vip-pay-wrap solo"><section class="vip-pay-card vip-success" style="--tc:' + t.accent + '">' +
      '<div class="vip-ok-ring" aria-hidden="true">✓</div>' +
      '<h1>到账了</h1>' +
      '<p class="vip-success-sub">' + esc(t.name) + '已生效' + (m && m.expiresAt ? '，有效期到 ' + fmtDate(m.expiresAt) : '') + '。</p>' +
      '<dl class="vip-kv wide">' +
        '<div><dt>订单号</dt><dd>' + esc(o.orderNo) + '</dd></div>' +
        '<div><dt>金额</dt><dd>¥' + money(o.amountCents) + '</dd></div>' +
        '<div><dt>渠道</dt><dd>' + esc(o.channelText || o.channel) + '</dd></div>' +
        '<div><dt>支付时间</dt><dd>' + fmtDT(o.paidAt) + '</dd></div>' +
      '</dl>' +
      '<div class="vip-success-actions">' +
        '<button type="button" class="vip-btn primary" data-act="vip-center">去会员中心</button>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-home">再逛逛</button>' +
        '<button type="button" class="vip-btn ghost" data-act="vip-invoice" data-no="' + esc(o.orderNo) + '">申请发票</button>' +
      '</div>' +
      '<p class="vip-fine">收据已记在会员中心。没有自动续费，到期前一周会提醒。</p>' +
    '</section></div>';
  }

  function payClosedHTML(o) {
    var refund = o.status === 'refunded';
    return '<div class="vip-pay-wrap solo"><section class="vip-pay-card vip-success">' +
      '<div class="vip-ok-ring off" aria-hidden="true">' + (refund ? '↩' : '×') + '</div>' +
      '<h1>' + (refund ? '这笔已退款' : '订单已关闭') + '</h1>' +
      '<p class="vip-success-sub">' + esc(o.orderNo) + ' · ¥' + money(o.amountCents) + (refund && o.refundCents ? '（退回 ¥' + money(o.refundCents) + '）' : '') + '</p>' +
      '<div class="vip-success-actions"><button type="button" class="vip-btn primary" data-act="vip-home">重新选一档</button>' +
      '<button type="button" class="vip-btn ghost" data-act="vip-center">会员中心</button></div>' +
    '</section></div>';
  }

  function payHTML() {
    if (STATE.err) return errorHTML(STATE.err);
    var o = CACHE.order;
    if (!o) return skeleton(3);
    if (o.status === 'paid') return paySuccessHTML(o);
    if (o.status === 'closed' || o.status === 'refunded') return payClosedHTML(o);
    var ch = o.channel || STATE.channel || 'manual';
    var CH_NAMES = { afdian: '爱发电', manual: '扫码转账', alipay: '支付宝', wechat: '微信支付' };
    var chName = CH_NAMES[ch] || '在线支付';
    var plan = planOf(o.tier, o.cycle);
    var days = plan ? plan.durationDays : (o.cycle === 'year' ? 365 : 30);
    var left = Math.max(0, (o.expiresAt || 0) - Math.floor(Date.now() / 1000));
    /* 进度条按「这张单自己的支付窗口」算。人工转账的窗口是 3 天不是 30 分钟，
       写死 1800 会让长窗口的订单进度条一上来就贴着 0，看起来像快过期了。 */
    var span = o.expiresAt && o.createdAt ? Math.max(1, o.expiresAt - o.createdAt) : 1800;
    var pct = o.expiresAt ? Math.max(0, Math.min(100, left / span * 100)) : 0;
    var sandbox = !CACHE.overview || CACHE.overview.sandbox !== false;
    /* 爱发电外链由后端下发（AFDIAN_URL）。前端不写死地址，
       否则换主页要重新构建前端；没下发时也不渲染一个空 href 的按钮。 */
    var afUrl = (CACHE.pay && CACHE.pay.payUrl) || '';
    /* 站外付款渠道（爱发电 / 收款码）：钱不会自己流回来，只有用户登记这一条路。
       所以底部主按钮必须变成「我已完成付款」，不能留「我已完成支付」那个轮询状态。 */
    var offline = ch === 'afdian' || ch === 'manual';
    var reportBlock = function (ph) {
      /* 只留输入框：提交按钮统一由下面的操作栏承担。
         两处都放「我已完成付款」，用户会以为要按两次。 */
      return '<div class="vip-manual-report">' +
        '<input id="vip-payer" type="text" maxlength="40" autocomplete="off" placeholder="' + esc(ph) + '">' +
        '<span class="vip-fine">填完点下面的「我已完成付款」</span>' +
      '</div>' +
      (o.note ? '<p class="vip-fine">你上次登记：' + esc(String(o.note).split('\n').pop()) + '</p>' : '');
    };
    return '<div class="vip-pay-wrap">' +
      '<section class="vip-pay-card">' +
        '<div class="vip-pay-hd">' +
          '<div><span class="vip-kicker">收银台</span><h1>¥' + money(o.amountCents) + '</h1>' +
          '<p>' + esc(o.tierName || tierName(o.tier)) + ' · ' + (o.cycle === 'year' ? '年付' : '月付') + ' · ' + days + ' 天</p></div>' +
          '<span class="vip-st wait">待支付</span>' +
        '</div>' +
        '<div class="vip-pay-body">' +
          /* 渠道在「下单那一刻」就定死了：后续切 tab 只会让页面说的和订单里存的对不上。
             所以这里不做可切换的 tab，只把真实渠道摆出来；要换就取消订单重选。 */
          '<div class="vip-pay-chosen"><span>支付方式</span><b>' + esc(chName) + '</b>' +
            '<button type="button" class="vip-mini" data-act="vip-cancel" data-no="' + esc(o.orderNo) + '">换一种</button>' +
          '</div>' +
          /* 爱发电：不在本站在线支付，而是跳到爱发电自己的收银台。
             金额只能由用户在爱发电侧选，我们只校验「留言里的订单号」，
             所以这里不做二维码，只做跳转 + 回来登记昵称。 */
          (ch === 'afdian'
            ? '<div class="vip-manual">' +
                '<div class="vip-manual-grid afdian">' +
                  (afUrl
                    ? '<a class="vip-afdian-go" href="' + esc(afUrl) + '" target="_blank" rel="noopener noreferrer">' +
                        '<span class="vip-afdian-ic" aria-hidden="true">⚡</span>' +
                        '<b>去爱发电赞助</b>' +
                        '<strong>¥' + money(o.amountCents) + '</strong>' +
                        '<i>留言里填下方订单号</i>' +
                      '</a>'
                    : '<div class="vip-afdian-go off"><b>爱发电地址还没配置</b>' +
                        '<i>服务端设置环境变量 <code>AFDIAN_URL</code> 后重启生效</i></div>') +
                  '<div class="vip-manual-side">' +
                    '<b>三步走完</b>' +
                    '<ol class="vip-manual-steps">' +
                      '<li>点左边卡片跳到爱发电，赞助金额也选 <b>¥' + money(o.amountCents) + '</b></li>' +
                      '<li>在<b>留言/备注</b>里写订单号 <code>' + esc(o.orderNo) + '</code> —— 不写我没法对账</li>' +
                      '<li>回到本页，在下面登记爱发电昵称，我核对到账后开通，通常几小时内</li>' +
                    '</ol>' +
                    '<button type="button" class="vip-mini" data-act="vip-copy" data-text="' + esc(o.orderNo) + '">复制订单号</button>' +
                  '</div>' +
                '</div>' +
                reportBlock('你的爱发电昵称，或订单号后 4 位') +
                '<p class="vip-fine">爱发电会抽成约 5%，所以到账数字会比 ¥' + money(o.amountCents) + ' 少一点：档位以你下单时选的为准，不按实付金额折算。需要发票的话走同样的人工流程。</p>' +
              '</div>'
            : ch === 'manual'
            ? '<div class="vip-manual">' +
                '<div class="vip-manual-grid">' +
                  '<div class="vip-manual-qr" role="img" aria-label="收款二维码"></div>' +
                  '<div class="vip-manual-side">' +
                    '<b>扫码支付 ¥' + money(o.amountCents) + '</b>' +
                    '<ol class="vip-manual-steps">' +
                      '<li>用微信或支付宝扫左边的收款码</li>' +
                      '<li>金额填 <b>¥' + money(o.amountCents) + '</b>，付款备注写订单号 <code>' + esc(o.orderNo) + '</code></li>' +
                      '<li>付完在下面登记一下付款昵称，管理员核对到账后开通，通常几小时内</li>' +
                    '</ol>' +
                    '<button type="button" class="vip-mini" data-act="vip-copy" data-text="' + esc(o.orderNo) + '">复制订单号</button>' +
                  '</div>' +
                '</div>' +
                reportBlock('付款时的微信/支付宝昵称，或订单号后 4 位') +
                '<p class="vip-fine">收款码图片是 <code>assets/pay/manual.png</code>，换成你自己的收款码即可；管理员在后台「会员 · 订单」点「补单」开通。</p>' +
              '</div>'
            : '<div class="vip-qr"><div class="vip-qr-box">' + qrSVG(o.orderNo) + '<span class="vip-qr-logo" aria-hidden="true">🐋</span></div>' +
              '<div class="vip-qr-side"><b>用' + chName + '扫一扫</b><p>' +
              (sandbox
                ? '演示环境：二维码是占位图，不会真的扣款。点下面的「模拟支付成功」就能走完整个流程。'
                : '这条在线支付通道还没接密钥，二维码是占位、不会真的扣款。先用「扫码转账」或「爱发电」通道，或把这条通道接上真实商户号。') +
              '</p>' +
              '<button type="button" class="vip-mini" data-act="vip-copy" data-text="' + esc(o.orderNo) + '">复制订单号</button></div></div>') +
          '<div class="vip-pay-status">' +
            '<div class="vip-pay-state" id="vip-pay-state"><span class="vip-dot live"></span>等待支付 · 剩余 <b id="vip-left">' + fmtLeft(left) + '</b></div>' +
            '<div class="vip-pay-bar"><i id="vip-left-bar" style="width:' + pct + '%"></i></div>' +
          '</div>' +
          '<div class="vip-pay-actions">' +
            (offline
              ? '<button type="button" class="vip-btn primary" data-act="vip-report" data-no="' + esc(o.orderNo) + '">我已完成付款</button>'
              : '<button type="button" class="vip-btn primary" data-act="vip-check" data-no="' + esc(o.orderNo) + '">我已完成支付</button>') +
            '<button type="button" class="vip-btn ghost" data-act="vip-cancel" data-no="' + esc(o.orderNo) + '">取消订单</button>' +
          '</div>' +
          (sandbox ? '<div class="vip-sandbox"><span aria-hidden="true">🧪</span><div><b>本地演示环境</b><p>没有接真实支付。点下面的按钮直接把订单标记为已支付，用来验收会员中心和后台报表。</p></div>' +
            '<button type="button" class="vip-btn line sm" data-act="vip-sim" data-no="' + esc(o.orderNo) + '">模拟支付成功</button></div>' : '') +
        '</div>' +
      '</section>' +
      '<aside class="vip-pay-side">' +
        '<div class="vip-card">' +
          '<div class="vip-card-hd"><h2>订单信息</h2></div>' +
          '<dl class="vip-kv wide">' +
            '<div><dt>订单号</dt><dd>' + esc(o.orderNo) + '</dd></div>' +
            '<div><dt>等级</dt><dd>' + esc(o.tierName || tierName(o.tier)) + '</dd></div>' +
            '<div><dt>周期</dt><dd>' + (o.cycle === 'year' ? '年付 · ' + days + ' 天' : '月付 · ' + days + ' 天') + '</dd></div>' +
            '<div><dt>金额</dt><dd>¥' + money(o.amountCents) + '</dd></div>' +
            '<div><dt>创建</dt><dd>' + fmtDT(o.createdAt) + '</dd></div>' +
          '</dl>' +
        '</div>' +
        '<div class="vip-card vip-pay-note">' +
          '<b>付款前请确认</b>' +
          '<ul><li>赞助是自愿行为，买到的是会员权益，不是余额。</li><li>7 天内未使用权益可全额退款，在会员中心提交订单号。</li><li>不会自动续费，到期前一周提醒。</li><li>需要发票：单笔满 ¥100，支付后在会员中心申请。</li></ul>' +
          '<p class="vip-fine">卡住了？把订单号发到 ' + esc(CONTACT_EMAIL) + '，通常当天回。</p>' +
        '</div>' +
      '</aside>' +
    '</div>';
  }

  /* ---------- 数据 ---------- */
  function clearTimers() {
    if (TIMER) { clearInterval(TIMER); TIMER = null; }
    if (POLL) { clearInterval(POLL); POLL = null; }
  }
  function loadOverview() {
    return api('/membership/overview').then(function (d) {
      CACHE.overview = d;
      CACHE.at = Date.now();
      return d;
    });
  }
  function loadMe() {
    return api('/membership/me').then(function (d) { CACHE.me = d; return d; });
  }
  function loadOrders() {
    return api('/membership/orders?limit=100').then(function (d) { CACHE.orders = d; return d; });
  }
  function loadOrder(no) {
    return api('/membership/orders/' + encodeURIComponent(no)).then(function (d) {
      CACHE.order = d.order;
      CACHE.pay = d.pay || null;
      return d;
    });
  }

  /* ---------- 深潜 hero：整卡拖拽的布局同步 ---------- */
  /* iframe 铺满整张 hero（角色能横跨整卡），但它自己不知道「默认该站在哪、多高」。
     宿主按 .vip-hero-figure 那把空量尺算三个数发进去：
       dockH  角色脚底在 hero 里的 y  ——  保持原来那一列的落脚高度
       charH  角色盒子高度  ——  原来 min(95% × (槽高 − 20), 344) 的结果
       homeX  角色中线相对 hero 中线的水平偏移  ——  原来那一列的位置
     于是「默认站位不变、可拖范围变成整张卡」。iframe 里的页面收到就会锁住自己的布局，
     不再按 iframe 高度自己算（见 whale/index.html 的 HOST 分支）。 */
  function syncHeroLayout() {
    var hero = document.querySelector('.vip-hero');
    if (!hero) return;
    var slot = hero.querySelector('.vip-hero-figure');
    var fr = hero.querySelector('.vip-figure-frame');
    if (!slot || !fr || !fr.contentWindow) return;
    var h = hero.getBoundingClientRect();
    var s = slot.getBoundingClientRect();
    if (!h.width || !s.width) return;
    try {
      fr.contentWindow.postMessage({
        t: 'whale-layout',
        dockH: Math.round(s.bottom - h.top - 20),   /* −20：原逻辑里底部状态行占掉的那一条 */
        charH: Math.round(Math.min((s.height - 20) * 0.95, 344)),
        homeX: Math.round(s.left + s.width / 2 - (h.left + h.width / 2)),
        cardW: Math.round(h.width),
        cardH: Math.round(h.height)
      }, '*');
    } catch (e) { /* 未就绪就等下一次 load / resize 再发 */ }
  }
  /* 整页重绘会换掉 iframe，所以每次 paint 后都要重新接线；load 里再补两拍 ——
     第一拍保证测量用的是最终字体与换行后的高度，第二拍兜 iframe 内部脚本还没装好监听器。 */
  function wireHero(scope) {
    var hero = (scope || document).querySelector('.vip-hero');
    if (!hero) return;
    var fr = hero.querySelector('.vip-figure-frame');
    if (!fr || fr.__vipWired) return;
    fr.__vipWired = 1;
    fr.addEventListener('load', function () {
      syncHeroLayout();
      win.setTimeout(syncHeroLayout, 120);
    });
  }
  var heroRT = 0;
  win.addEventListener('resize', function () {
    if (heroRT) clearTimeout(heroRT);
    heroRT = win.setTimeout(syncHeroLayout, 140);
  });

  function paint() {
    var root = document.getElementById('vip-root');
    if (!root) return;
    var y = win.scrollY || 0;
    var body;
    if (ROUTE.name === 'center') body = STATE.guest ? authGateHTML('你的赞助记录') : centerHTML();
    else if (ROUTE.name === 'pay') body = STATE.guest ? authGateHTML('这笔订单') : payHTML();
    else body = (STATE.err && !CACHE.overview) ? errorHTML(STATE.err) : homeHTML();
    root.innerHTML = body;
    /* app.js 的同页重绘（主题切换、会话刷新、未读数变化）会换掉整页 innerHTML，
       随后按「地址没变」跳过 mount。把刚画出来的正文记下来，html() 直接放回，
       否则会员中心和收银台会退回骨架屏卡死。 */
    LAST = body;
    LAST_HASH = location.hash || '';
    if (ROUTE.name === 'home') {
      syncHeroLayout();
      wireHero(root);
      win.requestAnimationFrame(syncHeroLayout);
    }
    if (ROUTE.name === 'pay' && !STATE.guest) startPayTimers();
    if (y) win.scrollTo(0, y);
  }

  /* 收银台：每秒刷新倒计时，每 5 秒问一次服务端。
     不用 WebSocket —— 支付回调本来就有延迟，5 秒轮询足够，也不占长连接。 */
  function startPayTimers() {
    clearTimers();
    var o = CACHE.order;
    if (!o || o.status !== 'pending') return;
    function tick() {
      var left = Math.max(0, (o.expiresAt || 0) - Math.floor(Date.now() / 1000));
      var el = document.getElementById('vip-left');
      if (el) el.textContent = fmtLeft(left);
      var bar = document.getElementById('vip-left-bar');
      if (bar) bar.style.width = Math.max(0, Math.min(100, left / 1800 * 100)) + '%';
      if (left <= 0) {
        clearTimers();
        var s = document.getElementById('vip-pay-state');
        if (s) s.innerHTML = '<span class="vip-dot hot"></span>订单已超时，请重新下单';
      }
    }
    tick();
    TIMER = setInterval(tick, 1000);
    POLL = setInterval(function () {
      api('/membership/orders/' + encodeURIComponent(o.orderNo)).then(function (d) {
        if (d.order.status !== o.status) {
          CACHE.order = d.order;
          if (d.order.status === 'paid') {
            loadMe().catch(function () {}).then(function () { paint(); });
            toast('到账了，会员已生效', '✅');
          } else {
            paint();
          }
        }
      }).catch(function () { /* 轮询失败不打扰用户，下一轮再来 */ });
    }, 5000);
  }

  function mountHome() {
    paint();
    if (!CACHE.overview || Date.now() - CACHE.at > 60000) {
      loadOverview().then(function () { if (ROUTE.name === 'home') paint(); })
        .catch(function (e) { STATE.err = e; if (ROUTE.name === 'home') paint(); });
    }
    if (authed() && !CACHE.me) {
      loadMe().then(function () { if (ROUTE.name === 'home') paint(); }).catch(function () {});
    }
  }

  function mountCenter() {
    if (!authed()) { STATE.guest = true; paint(); return; }
    STATE.guest = false;
    paint();
    Promise.all([loadMe(), loadOrders()]).then(function () {
      if (ROUTE.name === 'center') paint();
    }).catch(function (e) {
      if (e.status === 401) { STATE.guest = true; CACHE.me = null; }
      else STATE.err = e;
      if (ROUTE.name === 'center') paint();
    });
  }

  function mountPay() {
    if (!authed()) { STATE.guest = true; paint(); return; }
    STATE.guest = false;
    paint();
    if (!CACHE.overview) loadOverview().catch(function () {});
    var no = ROUTE.no;
    loadOrder(no).then(function () {
      if (ROUTE.name === 'pay' && ROUTE.no === no) paint();
    }).catch(function (e) {
      if (e.status === 401) STATE.guest = true; else STATE.err = e;
      if (ROUTE.name === 'pay') paint();
    });
  }

  function mount() {
    clearTimers();
    ROUTE = routeInfo();
    if (ROUTE.name === 'admin') return;
    STATE.err = null;
    if (!document.getElementById('vip-root')) return;
    if (ROUTE.name === 'home') return mountHome();
    if (ROUTE.name === 'center') return mountCenter();
    return mountPay();
  }

  /* ---------- 交互 ---------- */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }
  function mailInvoice(no) {
    var o = null;
    if (no) {
      if (CACHE.order && CACHE.order.orderNo === no) o = CACHE.order;
      var list = (CACHE.orders && CACHE.orders.items) || [];
      for (var i = 0; i < list.length && !o; i++) if (list[i].orderNo === no) o = list[i];
    }
    var subject = '[鲸域赞助 · 发票申请]' + (o ? ' ' + o.orderNo : '');
    var body = '订单号：' + (o ? o.orderNo : '（请填写）') + '\n' +
      '金额：' + (o ? '¥' + money(o.amountCents) : '（请填写）') + '\n' +
      '支付时间：' + (o && o.paidAt ? fmtDT(o.paidAt) : '（请填写）') + '\n' +
      '等级：' + (o ? (o.tierName || tierName(o.tier)) + ' · ' + (o.cycle === 'year' ? '年付' : '月付') : '（请填写）') + '\n\n' +
      '开票信息：\n1) 抬头：\n2) 税号：\n3) 接收邮箱：\n';
    win.location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    toast('已生成邮件草稿，补完开票信息再发送', '🧾');
  }
  function createOrder(tier, cycle) {
    var p = planOf(tier, cycle);
    if (!p) { toast('价格还没加载好，刷新一下再试', '⚠️'); return Promise.reject(new Error('NO_PLAN')); }
    if (!STATE.channel) { toast('还没有开通的支付方式，晚点再来看看', '💤'); return Promise.reject(new Error('NO_CHANNEL')); }
    return api('/membership/orders', { method: 'POST', body: { planId: p.id, channel: STATE.channel } })
      .then(function (d) {
        CACHE.order = d.order;
        CACHE.pay = d.pay || null;
        go('#/vip/pay/' + d.order.orderNo);
        return d;
      });
  }

  function onClick(e) {
    var el = e.target && e.target.nodeType === 1 ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act.indexOf('vip') !== 0) return;

    if (act === 'vip-scroll') {
      e.preventDefault();
      var t = document.getElementById(el.getAttribute('data-target'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'vip-cycle') {
      STATE.cycle = el.getAttribute('data-cycle') === 'month' ? 'month' : 'year';
      paint();
      return;
    }
    if (act === 'vip-buy' || act === 'vip-renew') {
      e.preventDefault();
      if (!authed()) { toast('先登录，订单要挂在账号上', '🔑'); go('#/login'); return; }
      var tier = el.getAttribute('data-tier');
      var cycle = act === 'vip-renew' ? 'month' : (el.getAttribute('data-cycle') || STATE.cycle);
      setBusy(el, true, '正在下单…');
      createOrder(tier, cycle).catch(function (err) {
        setBusy(el, false);
        if (err.message !== 'NO_PLAN') toast(err.message || '下单失败', '⚠️');
      });
      return;
    }
    if (act === 'vip-channel') {
      STATE.channel = el.getAttribute('data-channel');
      paint();
      return;
    }
    /* 人工转账的「我付好了」：只登记付款方信息到订单备注，不改订单状态。
       状态只能由管理员核对流水后改 —— 让用户一句话把自己置成已支付，
       等于给全网开一个免费会员接口。 */
    if (act === 'vip-report') {
      var rno = el.getAttribute('data-no');
      var box = document.getElementById('vip-payer');
      var payer = box && box.value ? String(box.value).trim() : '';
      if (!payer) {
        toast('先填一下付款时的昵称，或订单号后 4 位', '✍️');
        if (box) box.focus();
        return;
      }
      setBusy(el, true, '登记中…');
      api('/membership/orders/' + encodeURIComponent(rno) + '/report-paid', { method: 'POST', body: { payer: payer } })
        .then(function (d) {
          CACHE.order = d.order;
          paint();
          toast('已登记，管理员核对到账后就会开通', '✅');
        })
        .catch(function (err) {
          setBusy(el, false);
          toast(err.message || '登记失败，稍后再试', '⚠️');
        });
      return;
    }
    if (act === 'vip-gopay') {
      CACHE.order = null;
      go('#/vip/pay/' + el.getAttribute('data-no'));
      return;
    }
    if (act === 'vip-sim') {
      var no = el.getAttribute('data-no');
      setBusy(el, true, '处理中…');
      api('/membership/orders/' + encodeURIComponent(no) + '/simulate', { method: 'POST', body: {} })
        .then(function (d) { CACHE.order = d.order; return loadMe().catch(function () {}); })
        .then(function () { paint(); toast('模拟支付成功，会员已生效', '✅'); })
        .catch(function (err) { setBusy(el, false); toast(err.message || '模拟支付失败', '⚠️'); });
      return;
    }
    if (act === 'vip-check') {
      var n = el.getAttribute('data-no');
      setBusy(el, true, '查询中…');
      loadOrder(n).then(function (d) {
        setBusy(el, false);
        if (d.order.status === 'paid') {
          loadMe().catch(function () {}).then(function () { paint(); });
          toast('到账了，会员已生效', '✅');
        } else {
          toast('还没收到支付结果，等几秒再试，或稍后到会员中心查看', '⏳');
        }
      }).catch(function (err) { setBusy(el, false); toast(err.message || '查询失败', '⚠️'); });
      return;
    }
    if (act === 'vip-cancel') {
      if (!win.confirm('关闭后这笔订单不能再支付，需要重新下单。确定关闭？')) return;
      var cno = el.getAttribute('data-no');
      setBusy(el, true, '关闭中…');
      api('/membership/orders/' + encodeURIComponent(cno) + '/close', { method: 'POST', body: {} })
        .then(function (d) { CACHE.order = d.order; paint(); toast('订单已关闭', '📕'); })
        .catch(function (err) { setBusy(el, false); toast(err.message || '关闭失败', '⚠️'); });
      return;
    }
    if (act === 'vip-open') {
      var ono = el.getAttribute('data-no');
      STATE.open[ono] = !STATE.open[ono];
      paint();
      return;
    }
    if (act === 'vip-filter') {
      STATE.filter = el.getAttribute('data-filter');
      paint();
      return;
    }
    if (act === 'vip-invoice') {
      mailInvoice(el.getAttribute('data-no') || '');
      return;
    }
    if (act === 'vip-copy') {
      var text = el.getAttribute('data-text') || '';
      copyText(text).then(function () { toast('已复制', '📋'); }).catch(function () { toast('复制失败，手动选一下', '⚠️'); });
      return;
    }
    if (act === 'vip-upgrade') {
      go('#/vip');
      setTimeout(function () {
        var t = document.getElementById('vip-tiers');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }
    if (act === 'vip-center') { go('#/vip/center'); return; }
    if (act === 'vip-home') { go('#/vip'); return; }
    if (act === 'vip-login') { go('#/login'); return; }
    if (act === 'vip-retry') {
      STATE.err = null;
      CACHE.overview = null;
      mount();
      return;
    }
  }

  function onChange(e) {
    var el = e.target;
    if (!el || !el.getAttribute || el.getAttribute('data-act') !== 'vip-vis') return;
    var on = !!el.checked;
    api('/membership/me/visibility', { method: 'POST', body: { show: on } })
      .then(function (d) {
        if (CACHE.me && CACHE.me.member) CACHE.me.member.showName = d.showName;
        toast(on ? '会显示你的昵称' : '已改为「匿名鲸友」', '👤');
      })
      .catch(function (err) {
        el.checked = !on;
        toast(err.message || '保存失败', '⚠️');
      });
  }

  /* ---------- 入口 ---------- */
  function html() {
    ROUTE = routeInfo();
    var inner;
    if (LAST && LAST_HASH === (location.hash || '')) inner = LAST;
    else inner = (ROUTE.name === 'home' && CACHE.overview) ? homeHTML() : skeleton(3);
    return '<div class="wrap solo vip"><div id="vip-root">' + inner + '</div></div>';
  }

  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  win.addEventListener('hashchange', function () {
    if (routeInfo().name !== 'pay') clearTimers();
  });

  win.Member = { html: html, mount: mount };
})(window);
