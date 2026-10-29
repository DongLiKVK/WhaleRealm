/* ══════════════════════════════════════════════════════════════
   v24 · 标签页（#/tags）—— 按 Discourse /tags 的信息结构移植

   参考页是 linux.do 的标签总览：顶部一个筛选框，下面按 tag group 一节一节铺标签，
   每个标签后面跟话题数，点标签进那个标签的话题列表。这里保留同一套信息结构
   （筛选 / 分组 / 计数 / 跳转），外观换成鲸域自己的卡片语言。

   与左栏「热门标签」卡的分工：
     · 左栏那张只放 10 个高频词，是快捷入口，单选；
     · 本页是全量标签目录 + 多选组合（全部满足 = 交集 / 任一满足 = 并集），
       选择写进地址栏，可以直接分享（#/tags/Blender/实测）。

   数据只有一处真源 js/data.js：标签归属来自 threads[].tag 与 threads[].tags，
   tagGroups 只描述「谁归哪一节」。计数不落盘，由宿主传入的 count() 现算
   （threadPool 口径），所以新帖发出后标签页与社群页永远显示同一个数。
   漏登记的标签不会消失，自动落到「未分组」一节。

   本文件不读任何全局：宿主（js/app.js 的 tagsPage()）把 esc / pool / tagsOf /
   count / threadRow 这些助手当 ctx 递进来 —— 所以它既能被浏览器直接加载，
   也能在 Node 里单独渲染做数据核对。
   ══════════════════════════════════════════════════════════════ */
(function (win) {
  'use strict';

  /* 系统标记不是标签：置顶 / 公告置顶 是排序与徽章，列进目录只会让人以为能筛 */
  var SYSTEM = ['置顶', '公告置顶'];
  /* 一节里超过这么多个就折叠（参考页是「显示更多」按钮，同一套行为） */
  var LIMIT = 14;
  /* 组内排序：false = 按 tagGroups 里的声明顺序（可预期、便于测试）；
     true = 按话题数从多到少（更接近参考页「热门的在前面」的观感）。改这一行即可切换。 */
  var BY_COUNT = false;

  function isSystem(g) { return SYSTEM.indexOf(g) >= 0; }

  /* 标签全集：先按 tagGroups 的声明顺序，再补数据里有、配置里没写的（自动进「未分组」） */
  function collect(ctx) {
    var seen = Object.create(null), out = [];
    function push(g) {
      if (!g || seen[g] || isSystem(g)) return;
      seen[g] = 1; out.push(g);
    }
    (ctx.groups || []).forEach(function (gr) { (gr.tags || []).forEach(push); });
    ctx.pool().forEach(function (t) { ctx.tagsOf(t).forEach(push); });
    return out;
  }

  function countOf(ctx, g) { return ctx.count(g) || 0; }

  function order(ctx, list) {
    if (!BY_COUNT) return list.slice();
    return list.slice().sort(function (a, b) { return countOf(ctx, b) - countOf(ctx, a); });
  }

  /* 分节：声明顺序原样保留（空节丢弃），数据里多出来的集中到最后一节「未分组」 */
  function sections(ctx, all) {
    var used = Object.create(null);
    var out = (ctx.groups || []).map(function (gr) {
      /* 一个标签只归属一组：前面组已经登记过的这里跳过。否则同一个标签会在两节里各出现一次，
         看着像两件事，而计数走的是 collect() 去重后的同一份 —— 不翻倍，所以很难自己发现。
         想把「语言」与「工具」拆成两组、又不想丢掉原归属时，正确做法是改 tagGroups 的归属，
         不是把标签抄进两个组。 */
      var members = (gr.tags || []).filter(function (g) { return !isSystem(g) && !used[g]; });
      members.forEach(function (g) { used[g] = 1; });
      return { id: gr.id, name: gr.name, desc: gr.desc || '', tags: members };
    }).filter(function (gr) { return gr.tags.length; });
    var rest = all.filter(function (g) { return !used[g]; });
    if (rest.length) out.push({ id: 'other', name: '未分组', desc: '数据里出现、还没写进 tagGroups 的标签', tags: rest });
    return out;
  }

  function picked(ctx, g) { return ctx.S.tags.indexOf(g) >= 0; }

  /* 一个标签 = 一颗按钮。计数写在同一颗按钮里（参考页 tag + count 的结构），
     空标签加 .is-empty 变淡但仍可点 —— 点进去看到空态比「点了没反应」清楚。 */
  function chip(ctx, g, small) {
    var esc = ctx.esc, on = picked(ctx, g), n = countOf(ctx, g);
    return '<button type="button" class="tagchip' + (small ? ' sm' : '') + (on ? ' on' : '') + (n ? '' : ' is-empty') +
      '" data-act="tagtoggle" data-tag="' + esc(g) + '" aria-pressed="' + (on ? 'true' : 'false') +
      '" title="' + (on ? '取消 #' : '只看 #') + esc(g) + '">' +
      '<span class="hash" aria-hidden="true">#</span><span class="nm">' + esc(g) + '</span>' +
      '<span class="n">' + n + '</span></button>';
  }

  /* 已选条：标签 × + 组合规则 + 两个出口（去社群列表 / 清空）。
     多选才显示「全部满足 / 任一满足」—— 只有一个标签时两种规则等价，摆出来只会让人犹豫。 */
  function pickedBar(ctx) {
    var S = ctx.S, esc = ctx.esc;
    if (!S.tags.length) return '';
    var multi = S.tags.length > 1;
    return '<div class="tags-picked">' +
      '<span class="tk">已选</span>' +
      S.tags.map(function (g) {
        return '<button type="button" class="tagchip on sm" data-act="tagtoggle" data-tag="' + esc(g) +
          '" aria-pressed="true" title="去掉 #' + esc(g) + '">' +
          '<span class="hash" aria-hidden="true">#</span><span class="nm">' + esc(g) +
          '</span><span class="x" aria-hidden="true">×</span></button>';
      }).join('') +
      (multi ? '<span class="tags-mode" role="group" aria-label="多个标签怎么组合">' +
        '<button type="button" class="tags-mode-btn' + (S.tagMode === 'any' ? '' : ' on') + '" data-act="tagmode" data-mode="all"' +
          ' title="两个标签都要带（交集）">全部满足</button>' +
        '<button type="button" class="tags-mode-btn' + (S.tagMode === 'any' ? ' on' : '') + '" data-act="tagmode" data-mode="any"' +
          ' title="命中任意一个就进列表（并集）">任一满足</button>' +
        '</span>' : '') +
      '<button type="button" class="btn sm ghost tags-goto" data-act="tagsel">在社群里看 ›</button>' +
      '<button type="button" class="btn sm ghost" data-act="tagclear">清空</button>' +
      '</div>';
  }

  /* 一节：标题 + 一句说明 + 标签云；超过 LIMIT 折叠，折叠态记在 S.tagOpen（组 id） */
  function groupHTML(ctx, gr) {
    var esc = ctx.esc, S = ctx.S;
    var list = order(ctx, gr.tags);
    var open = S.tagOpen.has(gr.id);
    var cut = !S.tagQ && !open && list.length > LIMIT;
    var show = cut ? list.slice(0, LIMIT) : list;
    return '<section class="tags-group" data-g="' + esc(gr.id) + '">' +
      '<div class="tags-g-hd"><h2 class="tags-g-t">' + esc(gr.name) + '</h2>' +
      '<span class="tags-g-n">' + gr.tags.length + ' 个</span></div>' +
      (gr.desc ? '<p class="tags-g-d">' + esc(gr.desc) + '</p>' : '') +
      '<div class="tags-cloud">' + show.map(function (g) { return chip(ctx, g); }).join('') + '</div>' +
      (list.length > LIMIT
        ? '<button type="button" class="tags-more" data-act="tagmore" data-g="' + esc(gr.id) + '"' +
          ' aria-expanded="' + (cut ? 'false' : 'true') + '">' +
          (cut ? '显示全部 ' + list.length + ' 个 ›' : '收起 ‹') + '</button>'
        : '') +
      '</section>';
  }

  /* 搜索：按名字做不区分大小写的子串匹配（中文名不受影响，blender 也能命中 Blender） */
  function hitName(ctx, g) {
    var q = (ctx.S.tagQ || '').trim().toLowerCase();
    return !q || g.toLowerCase().indexOf(q) >= 0;
  }

  /* 组合筛选：多选时按 S.tagMode 走交集 / 并集；单选与社群页的单标签口径一致 */
  function hit(ctx, t) {
    var sel = ctx.S.tags, ts = ctx.tagsOf(t);
    if (!sel.length) return false;
    var any = ctx.S.tagMode === 'any';
    return sel[any ? 'some' : 'every'](function (g) { return ts.indexOf(g) >= 0; });
  }

  function joinTags(ctx, sep) {
    return ctx.S.tags.map(function (g) { return '#' + ctx.esc(g); }).join(sep);
  }

  /* 结果区：复用社群页的 threadRow，所以标签结果与列表页长得一模一样 */
  function results(ctx) {
    var S = ctx.S;
    if (!S.tags.length) return '';
    var rows = ctx.pool().filter(function (t) { return hit(ctx, t); });
    rows.sort(function (a, b) { return (b.top ? 1 : 0) - (a.top ? 1 : 0); });
    var multi = S.tags.length > 1;
    return '<div class="card tags-result">' +
      '<div class="card-hd"><span class="t">' + (multi ? '组合结果' : '标签结果') + '</span>' +
      '<span class="more tags-hd-n">' + rows.length + ' 个话题 · ' + joinTags(ctx, S.tagMode === 'any' ? ' 或 ' : ' 与 ') + '</span></div>' +
      '<div class="tags-result-bd">' +
      (rows.length ? rows.map(ctx.threadRow).join('')
        : '<div class="empty"><span class="big">🔍</span>' + (multi
          ? (S.tagMode === 'any'
            ? '没有命中这几个标签里任何一个的话题'
            : '没有同时带 ' + joinTags(ctx, ' 与 ') + ' 的话题')
          : '还没有带 ' + joinTags(ctx, '') + ' 的话题') +
          '<div class="tags-empty-hint">' + (multi && S.tagMode !== 'any'
            ? '把上面的组合规则切成「任一满足」，或去掉一个标签'
            : '换一个标签试试，或者去社群页发一条带上它的话题') +
          '</div></div>') +
      '</div></div>';
  }

  function statRow(k, v) {
    return '<div class="tags-stat-row"><span class="k">' + k + '</span><b>' + v + '</b></div>';
  }

  function side(ctx) {
    var all = collect(ctx);
    var withTopics = all.filter(function (g) { return countOf(ctx, g) > 0; }).length;
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">标签怎么用</span></div>' +
        '<div class="side-bd tags-help">' +
        '<p>点一个标签只看它；再点第二个就是组合，两个都点亮的标签按下面的规则一起筛。</p>' +
        '<ul>' +
        '<li><b>全部满足</b>：<code>#Blender</code> 与 <code>#实测</code> 都要带（默认，同参考页的交集口径）</li>' +
        '<li><b>任一满足</b>：命中任意一个就进列表</li>' +
        '<li>选中的标签会写进地址栏（<code>#/tags/Blender/实测</code>），可以直接分享</li>' +
        '</ul></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">标签概览</span></div>' +
        '<div class="side-bd tags-stat">' + statRow('标签总数', all.length) + statRow('有话题的', withTopics) +
        statRow('空标签', all.length - withTopics) + statRow('话题总数', ctx.threadCount) + '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">热门标签</span><span class="side-n">' + ctx.cloud.length + ' 个</span></div>' +
        '<div class="side-bd"><div class="tags-cloud">' + ctx.cloud.map(function (g) { return chip(ctx, g, true); }).join('') + '</div></div></div>' +
      '</aside>';
  }

  function html(ctx) {
    var S = ctx.S, esc = ctx.esc;
    var all = collect(ctx);
    var groups = sections(ctx, all);
    var q = (S.tagQ || '').trim();
    var shown = groups.map(function (gr) {
      return { id: gr.id, name: gr.name, desc: gr.desc,
        tags: gr.tags.filter(function (g) { return hitName(ctx, g); }) };
    }).filter(function (gr) { return gr.tags.length; });
    var nShown = shown.reduce(function (n, gr) { return n + gr.tags.length; }, 0);
    /* 「话题数」= 池子里的话题总数，不是各标签计数之和 —— 一篇帖子挂三个标签只算一篇。
       这个数必须和右栏「标签概览 · 话题总数」同源，否则同一页上两个数字会打架（49 vs 16）。 */
    var topics = ctx.threadCount;
    return '<div class="wrap no-rail">' +
      '<div class="col-main">' +
      '<h1 class="sr-only">社群标签</h1>' +
      '<div class="card tags-card">' +
        '<div class="card-hd"><span class="t">全部标签</span>' +
        '<span class="more">' + all.length + ' 个标签 · ' + topics + ' 个话题</span></div>' +
        '<div class="tags-bar">' +
          '<label class="tags-search" for="tagq"><span class="ic" aria-hidden="true">🔎</span>' +
          '<input id="tagq" type="search" autocomplete="off" placeholder="按名字找标签" value="' + esc(S.tagQ || '') + '"></label>' +
          '<span class="tags-tip">' + (q
            ? '<b class="tags-hit">' + nShown + '</b> 个标签匹配「' + esc(q) + '」'
            : '点标签即筛选，选两个以上就是组合浏览') + '</span>' +
          (q ? '<button type="button" class="btn sm ghost" data-act="tagqclear">清空搜索</button>' : '') +
        '</div>' +
        pickedBar(ctx) +
        '<div class="tags-body">' +
          (shown.length ? shown.map(function (gr) { return groupHTML(ctx, gr); }).join('')
            : '<div class="empty"><span class="big">🔎</span>没有名字含「' + esc(q) + '」的标签' +
              '<div class="tags-empty-hint">标签名是发帖时手写的，去社群页翻翻列表或许更快</div></div>') +
        '</div>' +
      '</div>' +
      results(ctx) +
      '</div>' +
      side(ctx) +
      '</div>';
  }

  win.TagsPage = { html: html, collect: collect, sections: sections, hit: hit, SYSTEM: SYSTEM };
})(window);
