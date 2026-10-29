/* ============================================================================
   v38 · 插件详情独立页（GitHub Repository 风格）
   ----------------------------------------------------------------------------
   每个插件一个稳定深链：#/plugin/<id>，标签页再带一段 #/plugin/<id>/<tab>。
   28 个插件共用这一份渲染器：数据仍然只有 js/data.js 那一份，页面只是在
   同一套 GitHub 仓库页骨架上换内容 —— 头部 / 操作区 / 标签栏 / 主内容 / 右栏。

   这个文件不读 app.js 的闭包变量：宿主把 S、esc、num、av、tierOf、dlBox、
   reportPanel 等助手从 ctx 递进来。这样插件页可以单独在 Node 里渲染核对，
   也不会和 app.js 里的状态机互相牵扯。
   ========================================================================== */
(function () {
  'use strict';

  var FENCE = String.fromCharCode(96, 96, 96);
  var ICON_PATHS = {
    eye: '<path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.6"/>',
    copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V5.5A2.5 2.5 0 0 0 10.5 3H5.5A2.5 2.5 0 0 0 3 5.5v5A2.5 2.5 0 0 0 5.5 13H7"/>',
    star: '<path d="m10 2.7 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7Z"/>',
    thumb: '<path d="M6.6 9.1 9.4 3.8a1.7 1.7 0 0 1 2.3 1.7l-.4 2.9h3.6a1.7 1.7 0 0 1 1.65 2.1l-1.15 4.9A1.9 1.9 0 0 1 13.5 17H6.6"/><rect x="2.7" y="9.1" width="3.1" height="7.9" rx="1.1"/>',
    download: '<path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5"/><path d="M3.5 13v2.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V13"/>',
    code: '<path d="m7 5-5 5 5 5M13 5l5 5-5 5"/>',
    tag: '<path d="M3 3h6.8L17 10.2 10.2 17 3 9.8Z"/><circle cx="6.8" cy="6.8" r="1.2"/>',
    issue: '<circle cx="10" cy="10" r="7"/><path d="M10 6v5M10 14h.01"/>',
    comment: '<path d="M3.5 4.5h13v9h-7l-4 3v-3h-2Z"/>',
    shield: '<path d="M10 2.8 16 5v5.2c0 3.7-2.7 6-6 7-3.3-1-6-3.3-6-7V5Z"/><path d="m7.4 10 1.8 1.8 3.6-3.8"/>',
    pr: '<circle cx="5" cy="5" r="2"/><circle cx="5" cy="15" r="2"/><circle cx="15" cy="15" r="2"/><path d="M5 7v6M7 5h3.5A2.5 2.5 0 0 1 13 7.5V13"/>',
    law: '<path d="M10 3v13M4.5 6h11M7 16h6"/><path d="M6.5 6 4.2 11.2h4.6L6.5 6ZM13.5 6l-2.3 5.2h4.6L13.5 6Z"/>',
    graph: '<path d="M3.5 16.5v-6M8.2 16.5V5.5M12.9 16.5v-4M17.5 16.5V7.5"/>',
    search: '<circle cx="8.5" cy="8.5" r="5"/><path d="m12.2 12.2 4.3 4.3"/>',
    folder: '<path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h4l1.6 2H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z"/>',
    file: '<path d="M5 2.8h6.5L15.5 7v10.2H5Z"/><path d="M11.5 2.8V7h4"/>',
    book: '<path d="M3 4.6A1.6 1.6 0 0 1 4.6 3H9.5v14H4.6A1.6 1.6 0 0 1 3 15.4Z"/><path d="M17 4.6A1.6 1.6 0 0 0 15.4 3H10.5v14h4.9A1.6 1.6 0 0 0 17 15.4Z"/><path d="M10.5 3v14"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="15" r="2"/><circle cx="14" cy="7" r="2"/><path d="M6 7v6M8 12.5c4 0 6-1.5 6-3.5"/>',
    link: '<path d="M8.5 11.5 11.5 8.5"/><path d="M7 13H5.5a3.5 3.5 0 0 1 0-7H7M13 6h1.5a3.5 3.5 0 0 1 0 7H13"/>',
    check: '<path d="m4 10 4 4 8-8"/>',
    arrow: '<path d="M4 10h12M11 5l5 5-5 5"/>',
    lock: '<rect x="4.5" y="8.5" width="11" height="8" rx="1.5"/><path d="M7 8.5V6.8a3 3 0 0 1 6 0v1.7"/>',
    people: '<circle cx="7" cy="8" r="2.4"/><path d="M2.8 16c.4-2.6 2-4 4.2-4s3.8 1.4 4.2 4"/><circle cx="14.3" cy="8.4" r="1.9"/><path d="M12.6 12.3c2.1 0 3.6 1.3 4 3.7"/>'
  };

  function icon(name, cls) {
    var p = ICON_PATHS[name] || ICON_PATHS.file;
    return '<svg class="gh-svg ' + (cls || '') + '" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + '</svg>';
  }

  var TABS = [
    { k: 'code', label: '代码', ic: 'code' },
    { k: 'releases', label: '版本', ic: 'tag' },
    { k: 'issues', label: '议题', ic: 'issue' },
    { k: 'discussions', label: '讨论', ic: 'comment' },
    { k: 'security', label: '安全', ic: 'shield' },
    { k: 'insights', label: '洞察', ic: 'graph' }
  ];
  var TAB_KEYS = TABS.map(function (t) { return t.k; });

  /* 稳定散列：同一个插件每次刷新拿到的分支、议题号、语言占比都一样，
     不会出现「刷新一次数字全变」的假数据感。 */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seedOf(p) { return hash(p.id + '|' + p.name + '|' + p.ver); }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  function repoParts(p) {
    var m = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(String(p.repo || ''));
    return {
      owner: m ? m[1] : 'whalerealm',
      repo: m ? m[2] : p.name,
      label: p.repo || '未登记仓库'
    };
  }

  /* 版本历史：从当前版本向前推 8 个稳定 tag，日期逐级后退。
     这不是从 GitHub 拉的实时数据，而是演示站点里可复现的一份版本账本；
     同一个插件每次渲染的顺序、日期、tag 都一致，点开历史版本不会变脸。 */
  function versionsOf(p) {
    var raw = String(p.ver || '0.0.0').replace(/^v/i, '').split('.');
    var major = parseInt(raw[0], 10) || 0;
    var minor = parseInt(raw[1], 10) || 0;
    var patch = parseInt(raw[2], 10) || 0;
    var base = (p.file && p.file.at) || p.collected || '2026-09-30';
    var out = [];
    var seen = {};
    function add(M, m, x) {
      var tag = 'v' + M + '.' + m + '.' + x;
      if (seen[tag]) return;
      seen[tag] = 1;
      var i = out.length;
      out.push({
        tag: tag,
        date: i === 0 ? base : dateBefore(base, 14 + i * 11 + (seedOf(p) % 6)),
        latest: i === 0
      });
    }
    add(major, minor, patch);
    for (var d = 1; d <= 2 && patch - d >= 0; d++) add(major, minor, patch - d);
    for (var k = 1; k <= 3 && minor - k >= 0; k++) add(major, minor - k, 0);
    for (var q = 1; q <= 4 && major - q >= 0 && out.length < 8; q++) {
      for (var r = 9; r >= 0 && out.length < 8; r--) add(major - q, r, 0);
    }
    if (out.length < 6) {
      for (var z = 1; z <= 6 && out.length < 6; z++) add(0, Math.max(0, minor - z), 0);
    }
    return out;
  }
  function dateBefore(iso, days) {
    var t = Date.parse(String(iso || '') + 'T00:00:00Z');
    if (!isFinite(t)) t = Date.parse('2026-09-30T00:00:00Z');
    var d = new Date(t - days * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1, 2) + '-' + pad(d.getUTCDate(), 2);
  }

  function faved(S, id) { return !!(S && S.favPlug && S.favPlug.has && S.favPlug.has(id)); }
  /* 收藏数沿用条目的 Star 基数；本机收藏后即时 +1，和右侧 About、洞察页同源。 */
  function favCount(S, p) {
    return (Number(p.stars) || 0) + (faved(S, p.id) ? 1 : 0);
  }

  /* v41 · 点赞与收藏是两个动作：收藏进「我的收藏」，点赞只是表个态。
     基数是条目自己的口碑数（按 Star 折算），不直接抄 stars —— 两个胶囊并排
     显示同一个数字，读起来像 bug。本机点过赞即时 +1，落 S.likePlug。 */
  function liked(S, id) { return !!(S && S.likePlug && S.likePlug.has && S.likePlug.has(id)); }
  function likeCount(S, p) {
    var base = Math.round((Number(p.stars) || 0) * 0.58);
    return base + (liked(S, p.id) ? 1 : 0);
  }

  function shortSha(p) {
    var s = seedOf(p).toString(16) + hash(p.pkg).toString(16);
    return s.slice(0, 7);
  }

  var LANG_COLORS = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', CSS: '#563d7c',
    Markdown: '#083fa1', Shell: '#89e051', JSON: '#292929', Vue: '#41b883'
  };
  var LANG_SETS = [
    [['TypeScript', 62], ['JavaScript', 16], ['CSS', 9], ['Markdown', 8], ['Shell', 5]],
    [['TypeScript', 55], ['JavaScript', 22], ['CSS', 8], ['Markdown', 10], ['Shell', 5]],
    [['JavaScript', 58], ['TypeScript', 20], ['CSS', 9], ['Markdown', 8], ['Shell', 5]],
    [['TypeScript', 68], ['JavaScript', 11], ['CSS', 7], ['Markdown', 9], ['Shell', 5]]
  ];
  function languagesOf(p) {
    var set = LANG_SETS[seedOf(p) % LANG_SETS.length];
    return set.map(function (x) { return { name: x[0], pct: x[1], color: LANG_COLORS[x[0]] || '#8b949e' }; });
  }

  function contributorsOf(ctx, p) {
    var pool = ['u2', 'u3', 'u5', 'u7', 'u8'];
    var start = seedOf(p) % pool.length;
    var out = [p.author];
    for (var i = 0; i < pool.length && out.length < 3; i++) {
      var uid = pool[(start + i) % pool.length];
      if (uid !== p.author) out.push(uid);
    }
    return out;
  }

  var ESC = function (s) { return String(s == null ? '' : s); };
  var ISSUE_LABEL_STYLE = {
    bug: 'bug', enhancement: 'enh', docs: 'doc', '兼容性': 'compat', '安装': 'install', '性能': 'perf'
  };
  function issueLabel(name) {
    return '<span class="gh-label gh-label-' + (ISSUE_LABEL_STYLE[name] || 'default') + '">' + ESC(name) + '</span>';
  }

  function issuesOf(ctx, p) {
    var tags = (p.tags && p.tags.length ? p.tags : ['配置']).slice(0, 2);
    var seed = seedOf(p);
    var authors = ['u2', 'u4', 'u6', 'u7', 'u8', 'u3'];
    var specs = [
      { t: '在 ' + (p.cat || '当前环境') + ' 下安装后没有出现在插件列表里', state: 'open', labels: ['bug', '安装'], cm: 3 },
      { t: '希望支持按项目覆盖 ' + tags[0] + ' 配置', state: 'open', labels: ['enhancement'], cm: 2 },
      { t: '文档里的示例命令少了一个 ./', state: 'closed', labels: ['docs'], cm: 5 },
      { t: '升级到 v' + p.ver + ' 后旧配置不再生效', state: 'open', labels: ['bug', '兼容性'], cm: 4 },
      { t: 'README 里的截图和当前版本对不上', state: 'closed', labels: ['docs'], cm: 1 }
    ];
    return specs.map(function (s, i) {
      var n = 120 + ((seed + i * 97) % 780);
      return {
        id: 'i' + p.id + '-' + i,
        num: n,
        title: s.t,
        state: s.state,
        labels: s.labels,
        author: authors[(seed + i * 3) % authors.length],
        comments: s.cm,
        opened: i === 0 ? '2 天前' : i === 1 ? '5 天前' : i === 2 ? '1 周前' : i === 3 ? '2 周前' : '3 周前',
        body: s.state === 'open'
          ? '按 README 里的步骤安装后复现。环境：DSH 最新版 / Windows 11 / Node 20。\n\n期望：插件出现在列表里并且命令可用。\n实际：列表里没有这个插件，重启会话也没有变化。'
          : '这个问题已经处理，保留在这里方便后来的人搜到。\n\n结论写在本条回复里。'
      };
    });
  }

  function filesOf(p) {
    var t = p.tags && p.tags[0] ? p.tags[0] : '核心能力';
    return [
      { path: '.github/', dir: true, msg: 'ci: 发布与校验', time: p.updated },
      { path: 'docs/', dir: true, msg: 'docs: 用法与常见问题', time: p.updated },
      { path: 'src/', dir: true, msg: 'feat: ' + t + ' 支持', time: p.updated },
      { path: 'LICENSE', msg: p.license ? 'chore: ' + p.license + ' 许可证' : 'chore: 暂未声明许可证', time: p.updated },
      { path: 'README.md', msg: 'docs: 补充安装、用法与兼容性', time: p.updated },
      { path: 'package.json', msg: 'chore: release v' + p.ver, time: p.updated },
      { path: 'src/index.ts', msg: 'feat: ' + t + ' 主流程', time: p.updated },
      { path: 'docs/usage.md', msg: 'docs: 常用场景示例', time: p.updated },
      { path: '.github/workflows/release.yml', msg: 'ci: 打包并登记版本', time: p.updated }
    ];
  }

  function fileContent(ctx, p, path) {
    var pkgName = p.pkg || p.name;
    var camel = pkgName.replace(/[^a-zA-Z0-9]+(.)/g, function (m, c) { return c ? c.toUpperCase() : ''; });
    var license = p.license || 'UNLICENSED';
    if (path === 'README.md') {
      return [
        '# ' + p.name,
        '',
        p.desc,
        '',
        FENCE + 'bash',
        'pnpm dsh add ' + pkgName,
        FENCE,
        '',
        '## 这个插件做什么',
        '',
        '- 分类：' + p.cat,
        '- 标签：' + (p.tags || []).map(function (x) { return '#' + x; }).join(' '),
        '- 维护者：' + ctx.userOf(p.author).name,
        '',
        '## 兼容性',
        '',
        '- 与 DSH 当前版本保持兼容',
        '- 安装后重启一次会话',
        '',
        '## 许可',
        '',
        license
      ].join('\n');
    }
    if (path === 'LICENSE') {
      if (!p.license) return '本项目暂未声明许可证。\n\n在作者补充 LICENSE 之前，默认保留所有权利，本站不转载、不镜像安装包。';
      if (/MIT/i.test(p.license)) {
        return 'MIT License\n\nCopyright (c) 2026 ' + ctx.userOf(p.author).name + '\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.';
      }
      if (/Apache/i.test(p.license)) return 'Apache License 2.0\n\n完整许可证全文请到原仓库查看：' + (p.repo || '—') + '\n\n本站只登记许可证名称，不代替原作者授权。';
      /* 自定义许可：不是标准模板，别把「Custom」当成许可证名展示给读者 */
      if (/^custom$/i.test(p.license)) {
        return '作者为这个项目写了自定义许可条款，不是 MIT / Apache 这类标准模板。\n\n完整条款请到原仓库查看：' + (p.repo || '—') + '\n\n能不能用、能不能改、能不能商用，以作者原文为准；需要授权就直接联系作者。';
      }
      return p.license + '\n\n完整许可证全文请到原仓库查看：' + (p.repo || '—');
    }
    if (path === 'package.json') {
      return JSON.stringify({
        name: pkgName,
        version: p.ver,
        description: p.desc,
        license: p.license || 'UNLICENSED',
        type: 'module',
        main: 'dist/index.js',
        dsh: { plugin: true, minVersion: '0.5.0' },
        keywords: (p.tags || []).concat(['dsh-plugin']),
        repository: p.repo ? 'https://' + p.repo : '',
        scripts: { build: 'tsc -p tsconfig.json', test: 'node --test' }
      }, null, 2);
    }
    if (path === 'src/index.ts') {
      return [
        "import { definePlugin } from '@dsh/plugin';",
        '',
        'export default definePlugin({',
        "  name: '" + pkgName + "',",
        "  version: '" + p.ver + "',",
        "  description: '" + String(p.desc).replace(/'/g, "\\'") + "',",
        '  setup(ctx) {',
        '    ctx.command(' + camel + ', async (input) => {',
        "      ctx.log('" + (p.name || pkgName) + "', input);",
        '      return { ok: true };',
        '    });',
        '  }',
        '});'
      ].join('\n');
    }
    if (path === 'docs/usage.md') {
      return [
        '# 用法',
        '',
        '## 安装',
        '',
        FENCE + 'bash',
        'pnpm dsh add ' + pkgName,
        FENCE,
        '',
        '## 最小示例',
        '',
        FENCE + 'ts',
        "import plugin from '" + pkgName + "';",
        '',
        '// 在会话里直接调用插件命令',
        'await plugin.run({ input: "hello" });',
        FENCE,
        '',
        '## 常见问题',
        '',
        '- 装完没反应：确认 DSH 版本，再重启一次会话。',
        '- 和别的插件冲突：检查同名命令、端口与缓存目录。',
        '- 包从哪里来：' + (ctx.tierOf(p) === 'pack' ? '作者登记的包信息，文件在作者仓库。' : '本站不存包，请到作者仓库获取。')
      ].join('\n');
    }
    if (path === '.github/workflows/release.yml') {
      return [
        'name: release',
        'on:',
        '  push:',
        '    tags: ["v*"]',
        'jobs:',
        '  publish:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@v4',
        '        with: { node-version: 20 }',
        '      - run: npm ci',
        '      - run: npm test',
        '      - run: npm pack',
        '      - run: echo "attach the tarball to the GitHub release"'
      ].join('\n');
    }
    return '这个文件在演示站点里没有内容。';
  }

  function renderTabs(ctx, tab, counts) {
    return '<nav class="gh-tabs" role="tablist" aria-label="插件页面标签">' + TABS.map(function (t) {
      var on = t.k === tab;
      var n = counts[t.k];
      return '<button type="button" class="gh-tab' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '"' +
        ' data-act="ghtab" data-tab="' + t.k + '"' + (on ? ' aria-current="page"' : '') + '>' +
        icon(t.ic, 'gh-tab-ic') + '<span>' + t.label + '</span>' +
        (n ? '<span class="gh-tab-n">' + ctx.num(n) + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  function header(ctx, p, u, counts) {
    var S = ctx.S, e = ctx.esc;
    var rp = repoParts(p);
    var cl = ctx.claimedOf(p);
    var f = faved(S, p.id);
    var lk = liked(S, p.id);
    var repo = ctx.repoHref(p.repo);
    return '<header class="gh-repo-head">' +
      '<div class="gh-repo-ident">' +
      /* v43 · 作者头像放在插件图标左边：谁做的紧贴「是什么」，头像本身就是进 TA 空间的入口
         （v40 给所有 .av 挂的 data-avuid 已处理点击与键盘）。自己的条目 av() 故意不挂跳转壳
         （那颗壳留给导航头像），所以这里自己补一层 <a>，否则自己的插件页上头像点不动。 */
      (function () {
        /* v43b · 光有头像看不出是谁（右栏那张卡已经撤了），下面补作者名 + 用户 ID。
           名与 ID 合成一个 <a> 并排在头像下方：头像列宽度不变，插件图标与标题不会被推走。 */
        var au = ctx.userOf(p.author) || {};
        var face = p.author === S.account
          ? '<a class="gh-author-link" href="#/space/' + e(p.author) + '" aria-label="进入我的空间" title="我的空间">' + ctx.av(p.author, 44, 'gh-author-av') + '</a>'
          : ctx.av(p.author, 44, 'gh-author-av');
        return '<div class="gh-author">' + face +
          '<a class="gh-author-tx" href="#/space/' + e(p.author) + '" title="' + e(au.name || p.author) + ' · @' + e(p.author) + '">' +
          '<b class="gh-author-name">' + e(au.name || p.author) + '</b>' +
          '<span class="gh-author-id">@' + e(p.author) + '</span></a>' +
          '</div>';
      })() +
      '<div class="gh-repo-avatar" style="background:' + p.grad + '" aria-hidden="true">' + p.icon + '</div>' +
      '<div class="gh-repo-titleline">' +
      '<div class="gh-repo-path"><span class="gh-owner">' + e(rp.owner) + '</span><span class="gh-slash">/</span>' +
      '<span class="gh-repo-name">' + e(p.name) + '</span>' +
      '<span class="gh-visibility">Public</span></div>' +
      '<p class="gh-repo-desc">' + e(p.desc) + '</p>' +
      '</div>' +
      /* v43d · 元信息行（档位 / 认证 / 版本 / 许可 / 分类 / 更新时间）从标题列里拿出来，作为头部第一行的整行内容。
         它原先挂在 .gh-repo-titleline 里，左缘等于标题左缘 —— 1440 下比卡片左内边距缩进约 200px，看着像悬在中间；
         移到 ident 直属后，左缘与作者头像、插件图标同一条线。 */
      '<div class="gh-repo-badges">' + ctx.tierBadge(p) +
      (cl ? '<span class="gh-verified">' + icon('check') + ' 仓库已认证</span>' : '<span class="gh-unverified">社群整理条目</span>') +
      '<span class="gh-meta-item">' + icon('tag') + (p.ver ? 'v' + e(p.ver) : '外链') + '</span>' +
      '<span class="gh-meta-item">' + icon('file') + e(licName(p) || '许可未标注') + '</span>' +
      '<span class="gh-meta-item">' + icon('branch') + e(p.cat) + '</span>' +
      '<span class="gh-meta-item">更新于 ' + e(p.updated) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="gh-head-right">' +
      '<div class="gh-actions">' +
      '<button type="button" class="gh-btn gh-like' + (lk ? ' on' : '') + '" data-act="ghlike" data-id="' + e(p.id) + '"' +
      ' aria-pressed="' + lk + '" title="' + (lk ? '取消点赞' : '给这个条目点赞') + '">' + icon('thumb') +
      '<span>' + (lk ? '已赞' : '点赞') + '</span><span class="gh-count">' + ctx.num(likeCount(S, p)) + '</span></button>' +
      '<button type="button" class="gh-btn gh-fav' + (f ? ' on' : '') + '" data-act="favany" data-kind="plug" data-id="' + e(p.id) + '"' +
      ' aria-pressed="' + f + '" title="' + (f ? '取消收藏' : '收藏这个插件') + '">' + icon('star') +
      '<span>' + (f ? '已收藏' : '收藏') + '</span><span class="gh-count">' + ctx.num(favCount(S, p)) + '</span></button>' +
      '<button type="button" class="gh-btn gh-copy" data-act="ghcopy" data-cmd="pnpm dsh add ' + e(p.pkg) + '" title="复制安装命令">' +
      icon('copy') + '<span>复制安装命令</span></button>' +
      '</div>' +
      '<div class="gh-head-links">' +
      (cl
        ? '<button type="button" class="gh-link" data-act="go" data-route="upload" data-id="' + e(p.id) + '">上传新版本</button>'
        : '<button type="button" class="gh-link" data-act="go" data-route="claim" data-id="' + e(p.id) + '">我是作者，认领这个条目</button>') +
      (repo ? '<span class="gh-dot">·</span><a class="gh-link" href="' + e(repo) + '" target="_blank" rel="noopener noreferrer nofollow">原仓库 ' + icon('link') + '</a>' : '') +
      /* 完整视图（作者认领后）同样给 npm 入口，位置紧跟原仓库 —— 两套视图的动作顺序保持一致 */
      (npmHref(p) ? '<span class="gh-dot">·</span><a class="gh-link" href="' + e(npmHref(p)) + '" target="_blank" rel="noopener noreferrer">npm ' + (p.npm.version ? 'v' + e(p.npm.version) : '包页') + ' ' + icon('link') + '</a>' : '') +
      '<span class="gh-dot">·</span><span class="gh-tabcount">' + ctx.num(counts.releases) + ' 个版本</span>' +
      '</div></div></header>';
  }

  function commitbar(ctx, p, u) {
    return '<div class="gh-commitbar">' +
      '<span class="gh-commit-av">' + ctx.av(p.author, 20) + '</span>' +
      '<b>' + ctx.esc(u.name) + '</b>' +
      '<span class="gh-commit-msg">chore: release v' + ctx.esc(p.ver) + '</span>' +
      '<span class="gh-commit-sha" title="演示用提交号">' + shortSha(p) + '</span>' +
      '<span class="gh-commit-time">' + ctx.esc(p.updated) + '</span></div>';
  }

  function fileRow(ctx, p, f, open, q) {
    var e = ctx.esc;
    var hit = !q || f.path.toLowerCase().indexOf(String(q).toLowerCase()) >= 0;
    if (f.dir) {
      return '<div class="gh-file gh-file-dir" data-path="' + e(f.path) + '"' + (hit ? '' : ' hidden') + '>' +
        '<button type="button" class="gh-file-row" data-act="ghdir" data-dir="' + e(f.path) + '">' +
        icon('folder', 'gh-file-ic dir') + '<span class="gh-file-name">' + e(f.path) + '</span>' +
        '<span class="gh-file-msg">' + e(f.msg) + '</span><span class="gh-file-time">' + e(f.time) + '</span></button></div>';
    }
    var isOpen = open === f.path;
    return '<div class="gh-file' + (isOpen ? ' open' : '') + '" data-path="' + e(f.path) + '"' + (hit ? '' : ' hidden') + '>' +
      '<button type="button" class="gh-file-row" data-act="ghfile" data-file="' + e(f.path) + '" aria-expanded="' + isOpen + '">' +
      icon('file', 'gh-file-ic') + '<span class="gh-file-name">' + e(f.path) + '</span>' +
      '<span class="gh-file-msg">' + e(f.msg) + '</span><span class="gh-file-time">' + e(f.time) + '</span>' +
      '</button>' +
      (isOpen ? '<div class="gh-file-view"><div class="gh-file-view-hd"><span>' + e(f.path) + '</span>' +
        '<button type="button" class="gh-mini" data-act="ghfile" data-file="' + e(f.path) + '">收起</button></div>' +
        '<pre><code>' + e(fileContent(ctx, p, f.path)) + '</code></pre></div>' : '') +
      '</div>';
  }

  /* ---- v47 · README / 贡献指南 / 许可证：三个并列的完整页面 ----
     旧版这两枚标签只是「滚到页内两行小字」和「打开 LICENSE 文件」：点完页面没换，
     看起来像没反应。现在每个标签都是独立页面 —— 同一张卡片里换整块内容，
     地址栏也跟着变成 #/plugin/<id>/contributing 或 /license，可以直接分享；
     三页共用 readmeTabs()，来回切不会丢掉「现在在哪一页」。 */
  function docTab(ctx, key, ic, inner, active, title, extraCls) {
    var on = active === key;
    return '<button type="button" class="gh-readme-tab' + (on ? ' is-on' : '') + (extraCls ? ' ' + extraCls : '') + '"' +
      ' data-act="ghdoc" data-doc="' + key + '" data-readme-tab="' + key + '" aria-controls="gh-doc-body"' +
      ' title="' + ctx.esc(title) + '"' + (on ? ' aria-current="true"' : '') + '>' +
      icon(ic) + inner + '</button>';
  }
  /* 仓库文档标签：README / 贡献指南 / 许可证 是固定三页（没有原文时给本站整理的说明），
     安全策略 / 更新日志 / 行为准则只在作者仓库里真的有这份文件时出现 —— 没有原文的页面
     只能是空话，不如不摆。kinds 来自 GET /plugins/:id/readme 的 item.kinds。 */
  function readmeTabs(ctx, p, active, kinds) {
    var e = ctx.esc;
    var lic = p.license || '未声明';
    var has = function (k) { return (kinds || []).indexOf(k) >= 0; };
    return '<nav class="gh-readme-tabs" aria-label="仓库文档">' +
      docTab(ctx, 'readme', 'book', '<span>README</span>', active, '项目说明与安装') +
      docTab(ctx, 'contrib', 'people', '<span>Contributing</span>', active,
        has('contributing') ? '贡献指南原文：怎么报问题、改代码、发 PR' : '贡献指南：报问题、改代码、发 PR') +
      docTab(ctx, 'license', 'law',
        '<span>' + e(lic) + (p.license ? '<span class="gh-lic-suffix"> license</span>' : '') + '</span>',
        active, has('license') ? '许可证原文' : (p.license ? '许可证全文与合规清单' : '还没有声明许可证：这意味着什么'),
        (p.license && String(lic).length > 5) ? 'is-long-license' : '') +
      (has('security') ? docTab(ctx, 'security', 'shield', '<span>Security</span>', active, '安全策略原文：支持哪些版本、怎么报漏洞') : '') +
      (has('changelog') ? docTab(ctx, 'changelog', 'file', '<span>Changelog</span>', active, '更新日志原文：每个版本改了什么') : '') +
      (has('conduct') ? docTab(ctx, 'conduct', 'people', '<span>行为准则</span>', active, '行为准则原文：社区怎么相处') : '') +
      '</nav>';
  }
  function docHero(ctx, o) {
    return '<header class="gh-doc-hero">' +
      '<span class="gh-doc-ic" aria-hidden="true">' + icon(o.ic) + '</span>' +
      '<div class="gh-doc-hero-tx"><p class="gh-doc-kicker">' + o.kicker + '</p>' +
      '<h1>' + o.title + '</h1><p class="gh-doc-sub">' + o.sub + '</p></div>' +
      (o.meta && o.meta.length ? '<p class="gh-doc-chips">' + o.meta.map(function (m) {
        return '<span class="gh-shield">' + m + '</span>';
      }).join('') + '</p>' : '') +
      '</header>';
  }
  function docToc(items) {
    return '<nav class="gh-doc-toc" aria-label="本页目录"><p class="gh-doc-toc-hd">本页目录</p><ol>' +
      items.map(function (it, i) {
        return '<li><button type="button" data-act="ghdocjump" data-target="' + it[0] + '">' +
          '<b>' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</b><span>' + it[1] + '</span></button></li>';
      }).join('') + '</ol></nav>';
  }
  function docFoot(ctx, p, active) {
    var back = active === 'readme' ? '' :
      '<button type="button" class="gh-doc-nav" data-act="ghdoc" data-doc="readme">' + icon('book') +
      '<span>README：这个插件做什么</span><b aria-hidden="true">←</b></button>';
    var fwd = active === 'license'
      ? '<button type="button" class="gh-doc-nav" data-act="ghdoc" data-doc="contrib">' + icon('people') +
        '<span>贡献指南：怎么参与</span><b aria-hidden="true">→</b></button>'
      : '<button type="button" class="gh-doc-nav" data-act="ghdoc" data-doc="license">' + icon('law') +
        '<span>' + ctx.esc(licName(p) || '许可证') + '：你能做什么</span><b aria-hidden="true">→</b></button>';
    return '<footer class="gh-doc-foot">' +
      (back || '<span class="gh-doc-foot-tip">' + icon('file') + '这一页来自仓库里的 CONTRIBUTING.md</span>') +
      fwd + '</footer>';
  }

  /* ---------- 贡献指南（完整页） ---------- */
  function contribPage(ctx, p) {
    var e = ctx.esc;
    var pkg = p.pkg || p.name;
    var repo = p.repo ? 'https://' + p.repo : '';
    var clone = 'git clone ' + (repo ? repo + '.git' : 'https://github.com/<owner>/' + pkg + '.git');
    var contribs = contributorsOf(ctx, p);
    var toc = [
      ['gh-doc-start', '开始之前'],
      ['gh-doc-issue', '报告问题'],
      ['gh-doc-idea', '提功能建议'],
      ['gh-doc-dev', '本地开发'],
      ['gh-doc-style', '代码约定'],
      ['gh-doc-commit', '提交信息'],
      ['gh-doc-pr', '提交 PR'],
      ['gh-doc-review', '评审与合并'],
      ['gh-doc-release', '发布'],
      ['gh-doc-people', '贡献者']
    ];
    var commitRows = [
      ['feat', '新功能', 'feat(cli): 支持按项目覆盖配置'],
      ['fix', '修 bug', 'fix(install): 安装后不刷新插件列表'],
      ['docs', '只改文档', 'docs: 补一段 WSL 路径说明'],
      ['refactor', '不改行为的重构', 'refactor(core): 拆出配置解析'],
      ['test', '补测试', 'test: 覆盖空配置分支'],
      ['perf', '性能', 'perf: 缓存 manifest 解析结果'],
      ['chore', '杂项 / 依赖', 'chore: 升到 Node 22']
    ];
    return docHero(ctx, {
      ic: 'people',
      kicker: 'CONTRIBUTING.md',
      title: '贡献指南',
      sub: '在提第一个 PR 之前花三分钟看完这页：怎么报问题、怎么在本地跑起来、维护者按什么标准合并。' +
        '这个项目由 ' + e(ctx.userOf(p.author).name) + ' 维护，评审是志愿者时间，写清楚能省掉一轮来回。',
      meta: ['<b>CONTRIBUTING.md</b>', 'Conventional Commits', '评审 3–7 天', '许可 ' + e(licName(p) || '未声明')]
    }) +
      '<div class="gh-doc-wrap">' + docToc(toc) +
      '<div class="gh-doc-body gh-readme-body" id="gh-doc-body">' +

      '<section class="gh-doc-sec" id="gh-doc-start"><h2>开始之前</h2>' +
      '<p>三件小事，能让你的改动更快被合进来：</p>' +
      '<div class="gh-doc-cards">' +
      '<div class="gh-doc-card"><b>先搜已有议题</b><p>同样的报错可能已经有人提过，跟帖比新开一条更快拿到结论。</p></div>' +
      '<div class="gh-doc-card"><b>小改动直接提 PR</b><p>错别字、注释、文档示例、明显的兼容性修复，不需要先开议题。</p></div>' +
      '<div class="gh-doc-card"><b>大改动先对齐</b><p>新命令、新依赖、改配置格式，先在议题里说清场景，免得写完才发现方向不一致。</p></div>' +
      '</div>' +
      '<div class="gh-callout">' + icon('shield') + '<div><b>参与即表示你同意对事不对人</b>' +
      '<p>技术分歧用复现步骤和日志说话；不要贴别人的私信、token、本地绝对路径。维护者可以直接关掉跑题的讨论。</p></div></div>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-issue"><h2>报告问题</h2>' +
      '<p>一条能复现的 issue，比十条「用不了」有用得多。至少写清这五件事：</p>' +
      '<ul><li><b>DSH 版本</b>与插件版本（页头的 v' + e(p.ver) + ' 只是登记版本，以你本地装的为准）</li>' +
      '<li><b>系统与运行时</b>：Windows 11 / macOS 14 / WSL，Node 版本</li>' +
      '<li><b>复现步骤</b>：从干净的会话开始，一步一步写到出错为止</li>' +
      '<li><b>期望与实际</b>：你以为会发生什么，实际发生了什么</li>' +
      '<li><b>日志</b>：只贴相关的那几十行，先去掉 token、cookie 与本地路径</li></ul>' +
      '<p class="gh-doc-label">可以直接抄这个模板</p>' +
      '<pre class="gh-code"><code>' + e('**环境**\n- DSH 版本：0.5.x\n- 系统 / Node：Windows 11 / Node 22\n- 插件版本：v' + p.ver + '\n\n**复现步骤**\n1. 新建会话\n2. 执行 ...\n3. ...\n\n**期望**\n\n**实际**\n\n**日志**\n（贴最小片段）') + '</code></pre>' +
      '<p class="gh-doc-label">标题怎么写</p>' +
      '<ul class="gh-doc-goodbad"><li class="is-bad"><b>差</b>用不了</li>' +
      '<li class="is-good"><b>好</b>安装后插件不出现在列表里（v' + e(p.ver) + ' / Windows 11 / Node 22）</li></ul>' +
      '<p>确认是安全问题时不要开公开议题：走仓库的 Security 标签页或私下联系维护者。</p>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-idea"><h2>提功能建议</h2>' +
      '<p>建议按「场景 → 现状 → 方案 → 备选」四段写，维护者最容易判断值不值得做：</p>' +
      '<ul><li><b>场景</b>：你在做什么事的时候卡住了，一周会遇到几次</li>' +
      '<li><b>现状</b>：现在怎么绕过去的，绕法有什么代价</li>' +
      '<li><b>方案</b>：你希望命令 / 配置长什么样，给一段假想用法</li>' +
      '<li><b>备选</b>：考虑过但放弃的做法，以及为什么</li></ul>' +
      '<pre class="gh-code"><code>' + e('pnpm dsh add ' + pkg + '\n# 期望：安装后能直接用\n' + pkg + ' run --config ./demo.toml') + '</code></pre>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-dev"><h2>本地开发</h2>' +
      '<p>仓库是纯 ESM + TypeScript，包管理器固定用 pnpm（版本写在 package.json 的 packageManager 字段）。</p>' +
      '<ol class="gh-doc-steps">' +
      '<li><b>Fork 并克隆</b><pre class="gh-code"><code>' + e(clone) + '\ncd ' + e(pkg) + '</code></pre></li>' +
      '<li><b>装依赖并构建</b><pre class="gh-code"><code>pnpm install\npnpm build</code></pre></li>' +
      '<li><b>跑测试</b><pre class="gh-code"><code>node --test</code></pre>' +
      '<p class="gh-muted">只跑一个文件：<code>node --test test/' + e(pkg) + '.test.ts</code>。测试失败先看是不是本地 DSH 版本太低。</p></li>' +
      '<li><b>在本地 DSH 里加载</b><pre class="gh-code"><code>pnpm dsh add ./</code></pre>' +
      '<p class="gh-muted">改完源码要重新 build 再重启会话，热更新不覆盖已注册的命令。</p></li>' +
      '</ol></section>' +

      '<section class="gh-doc-sec" id="gh-doc-style"><h2>代码约定</h2>' +
      '<ul><li>TypeScript 的 <code>strict</code> 是开着的，别用 <code>any</code> 或 <code>@ts-ignore</code> 兜底；确实绕不过去就写清原因。</li>' +
      '<li>不新增运行时依赖：插件要装进用户的 DSH 里，多一个包就多一份供应链风险。</li>' +
      '<li>命令名用 kebab-case，和包名保持一致；同一个命令不要偷偷换语义。</li>' +
      '<li>日志里不写死本地绝对路径、用户名、token；调试信息走 debug 级别。</li>' +
      '<li>出错要带 <code>nextAction</code>：告诉用户下一步做什么，而不是只抛一个堆栈。</li>' +
      '<li>改了行为就补一条测试；纯文档改动不用。</li></ul>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-commit"><h2>提交信息</h2>' +
      '<p>用 Conventional Commits：<code>type(scope): 一句话</code>，标题不超过 72 个字符，正文写「为什么」。' +
      '发版时的 CHANGELOG 直接由这些提交生成。</p>' +
      '<table class="gh-doc-table"><thead><tr><th>type</th><th>用途</th><th>示例</th></tr></thead><tbody>' +
      commitRows.map(function (r) {
        return '<tr><td><code>' + r[0] + '</code></td><td>' + r[1] + '</td><td class="mono">' + e(r[2]) + '</td></tr>';
      }).join('') +
      '</tbody></table></section>' +

      '<section class="gh-doc-sec" id="gh-doc-pr"><h2>提交 PR</h2>' +
      '<ul class="gh-doc-check">' +
      '<li>一个 PR 只做一件事；顺手改的格式单独开一条</li>' +
      '<li>标题同提交规范，描述里写清「改了什么 / 为什么 / 怎么验证」</li>' +
      '<li>附上复现方式或测试结果；UI 改动贴一张前后对比图</li>' +
      '<li>不要改 LICENSE、不要动版本号 —— 发版由维护者统一做</li>' +
      '<li>不要重打包或提交 <code>dist/</code> 产物，CI 会自己构建</li>' +
      '<li>CI 绿了再 @ 维护者；红了先自己看日志</li>' +
      '</ul>' +
      '<pre class="gh-code"><code>' + e('git checkout -b fix/install-refresh\n# ... 改代码 ...\ngit commit -m "fix(install): 安装后刷新插件列表"\ngit push origin fix/install-refresh') + '</code></pre>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-review"><h2>评审与合并</h2>' +
      '<ol class="gh-doc-timeline">' +
      '<li><b>48 小时内</b><span>维护者至少回一句：收到了 / 需要补充 / 方向不对。</span></li>' +
      '<li><b>3–7 天</b><span>正常改动的合并窗口。超过一周没动静，直接在 PR 里 ping 一次，不要重复开新 PR。</span></li>' +
      '<li><b>合并条件</b><span>CI 全绿 + 一位维护者 approve。默认 squash merge，提交信息取 PR 标题。</span></li>' +
      '<li><b>被拒怎么办</b><span>维护者会写原因（方向、维护成本、与现有功能重叠）。接受结论，或者把方案拆小再来。</span></li>' +
      '</ol></section>' +

      '<section class="gh-doc-sec" id="gh-doc-release"><h2>发布</h2>' +
      '<p>维护者打 <code>vX.Y.Z</code> 标签后，<code>.github/workflows/release.yml</code> 负责构建、跑测试、生成 CHANGELOG 并附上产物。' +
      '贡献者不需要发版，也不用改 <code>package.json</code> 里的版本号 —— 版本由发布流程统一写。</p>' +
      '<p>本站的条目页只是登记信息：版本号、许可证、仓库地址以作者仓库为准，页面上的包信息不代替作者发布。</p>' +
      '</section>' +

      '<section class="gh-doc-sec" id="gh-doc-people"><h2>贡献者</h2>' +
      '<p>按首次提交时间排序，改过文档的也算。</p>' +
      '<ul class="gh-doc-people">' + contribs.map(function (uid) {
        return '<li>' + ctx.av(uid, 32) + '<span><b>' + e(ctx.userOf(uid).name) + '</b><em>' +
          (uid === p.author ? '维护者' : '贡献者') + '</em></span></li>';
      }).join('') + '</ul>' +
      '<p class="gh-muted">第一次参与？在议题列表里找 <span class="gh-label gh-label-default">good first issue</span> 认领，改完贴一条 PR 就行。</p>' +
      '</section>' +

      '</div></div>' + docFoot(ctx, p, 'contrib');
  }

  /* ---------- 许可证（完整页） ---------- */
  var LICENSES = {
    mit: {
      name: 'MIT', spdx: 'MIT', kind: '宽松许可', osi: true,
      gist: '保留版权与许可声明，其余随便用：商用、修改、闭源分发都可以。',
      can: ['商业使用', '修改源码', '再分发', '闭源分发', '私有使用'],
      must: ['保留版权声明', '保留许可全文', '分发的副本里带上声明'],
      cannot: ['要求作者提供担保', '出问题后追究作者责任'],
      note: 'MIT 不要求你公开自己的改动，也不要求衍生作品用同样的许可证。'
    },
    apache: {
      name: 'Apache License 2.0', spdx: 'Apache-2.0', kind: '宽松许可（含专利授权）', osi: true,
      gist: '和 MIT 一样宽松，额外给了明确的专利授权，要求标注你改过哪些文件。',
      can: ['商业使用', '修改源码', '再分发', '闭源分发', '专利使用'],
      must: ['保留版权与许可声明', '保留 NOTICE 文件（如有）', '在改过的文件里注明修改'],
      cannot: ['使用作者的商标与品牌名', '要求作者提供担保'],
      note: '全文约 1.1 万词，仓库的 LICENSE 才是权威版本；本页给的是摘要，不代替原文。'
    },
    gpl: {
      name: 'GNU GPL', spdx: 'GPL-3.0', kind: '强著佐权（copyleft）', osi: true,
      gist: '可以商用、可以改，但你分发时必须一起提供源码，并用同一许可证。',
      can: ['商业使用', '修改源码', '再分发', '私有修改（不分发）'],
      must: ['分发时提供完整源码', '衍生作品沿用 GPL', '保留版权与许可声明'],
      cannot: ['闭源分发衍生作品', '附加额外限制'],
      note: '只在公司内部用、不对外分发，通常不触发开源义务。'
    },
    bsd: {
      name: 'BSD', spdx: 'BSD-3-Clause', kind: '宽松许可', osi: true,
      gist: '和 MIT 接近，多一条：不能用作者的名字给你的产品背书。',
      can: ['商业使用', '修改源码', '再分发', '闭源分发'],
      must: ['保留版权声明', '保留许可全文', '不拿作者名义做推广'],
      cannot: ['用作者名字为衍生品背书', '要求作者提供担保'],
      note: '2-Clause 版本没有「不得背书」这一条，以仓库 LICENSE 的具体条款为准。'
    },
    mpl: {
      name: 'Mozilla Public License 2.0', spdx: 'MPL-2.0', kind: '文件级著佐权', osi: true,
      gist: '改过的那几个文件要开源，其他文件可以闭源。',
      can: ['商业使用', '修改源码', '再分发', '与其他许可证混合'],
      must: ['公开被修改文件的源码', '保留版权与许可声明'],
      cannot: ['把改过的 MPL 文件改成闭源', '要求作者提供担保'],
      note: 'copyleft 的边界是「文件」，不是整个项目。'
    },
    isc: {
      name: 'ISC', spdx: 'ISC', kind: '宽松许可', osi: true,
      gist: '等价于简化版 MIT：保留声明，其余随便用。',
      can: ['商业使用', '修改源码', '再分发', '闭源分发'],
      must: ['保留版权声明', '保留许可全文'],
      cannot: ['要求作者提供担保', '追究作者责任'],
      note: 'OpenBSD 系项目常用，条款比 MIT 更短。'
    },
    pd: {
      name: '公共领域', spdx: 'Unlicense / CC0-1.0', kind: '放弃著作权', osi: true,
      gist: '作者放弃版权，任何人都可以任何方式使用。',
      can: ['商业使用', '修改源码', '再分发', '闭源分发', '不署名'],
      must: ['没有强制义务（署名是礼貌，不是要求）'],
      cannot: ['要求作者提供担保'],
      note: '不同司法辖区对「放弃著作权」的承认程度不同，商用前建议让法务看一眼。'
    }
  };
  function licKeyOf(name) {
    var s = String(name || '');
    if (/^MIT$/i.test(s) || /\bMIT\b/i.test(s)) return 'mit';
    if (/Apache/i.test(s)) return 'apache';
    if (/GPL/i.test(s)) return 'gpl';
    if (/BSD/i.test(s)) return 'bsd';
    if (/MPL|Mozilla/i.test(s)) return 'mpl';
    if (/^ISC$/i.test(s) || /\bISC\b/i.test(s)) return 'isc';
    if (/Unlicense|CC0|Public Domain/i.test(s)) return 'pd';
    return '';
  }
  function mitText(author) {
    return 'MIT License\n\nCopyright (c) 2026 ' + author + '\n\n' +
      'Permission is hereby granted, free of charge, to any person obtaining a copy\n' +
      'of this software and associated documentation files (the "Software"), to deal\n' +
      'in the Software without restriction, including without limitation the rights\n' +
      'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' +
      'copies of the Software, and to permit persons to whom the Software is\n' +
      'furnished to do so, subject to the following conditions:\n\n' +
      'The above copyright notice and this permission notice shall be included in all\n' +
      'copies or substantial portions of the Software.\n\n' +
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' +
      'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' +
      'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' +
      'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' +
      'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' +
      'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n' +
      'SOFTWARE.';
  }
  function apacheText(author) {
    return 'Copyright 2026 ' + author + '\n\n' +
      'Licensed under the Apache License, Version 2.0 (the "License");\n' +
      'you may not use this file except in compliance with the License.\n' +
      'You may obtain a copy of the License at\n\n' +
      '    http://www.apache.org/licenses/LICENSE-2.0\n\n' +
      'Unless required by applicable law or agreed to in writing, software\n' +
      'distributed under the License is distributed on an "AS IS" BASIS,\n' +
      'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n' +
      'See the License for the specific language governing permissions and\n' +
      'limitations under the License.';
  }
  function licCol(kind, title, items) {
    return '<div class="gh-lic-col is-' + kind + '"><p class="gh-lic-hd">' + title + '</p><ul>' +
      items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
  }
  function unlicensedPage(ctx, p) {
    var e = ctx.esc;
    var repo = p.repo ? 'https://' + p.repo : '';
    return docHero(ctx, {
      ic: 'law',
      kicker: 'LICENSE',
      title: '还没有许可证',
      sub: '仓库里没有 LICENSE 文件，package.json 也没写 license 字段。在作者补上之前，默认「保留所有权利」——' +
        '能看、能学、能链过去，但不能复制、修改或分发。',
      meta: ['<b>未声明</b>', '默认保留所有权利', '本站不转载']
    }) +
      '<div class="gh-doc-wrap">' +
      docToc([['gh-doc-none-what', '这意味着什么'], ['gh-doc-none-can', '你可以做什么'], ['gh-doc-none-ask', '想用怎么办']]) +
      '<div class="gh-doc-body gh-readme-body" id="gh-doc-body">' +
      '<section class="gh-doc-sec" id="gh-doc-none-what"><h2>这意味着什么</h2>' +
      '<div class="gh-callout">' + icon('lock') + '<div><b>没有许可证 ≠ 公共领域</b>' +
      '<p>按伯尔尼公约，代码写出来就自动受著作权保护。没有明确授权时，默认权利全部保留在作者手里，' +
      '别人拿不到复制、修改、分发的许可。</p></div></div>' +
      '<p>这不等于是「作者小气」：很多项目只是忘了加。看到这种条目，最有效的做法是去仓库提一条 issue，' +
      '说明你想怎么用，请作者选一个许可证。</p></section>' +
      '<section class="gh-doc-sec" id="gh-doc-none-can"><h2>你可以做什么</h2>' +
      '<div class="gh-lic-grid">' +
      licCol('ok', '可以', ['阅读源码、学习思路', '在文章里链接到仓库', '本地跑一跑评估效果（不分发）', '私下联系作者要授权']) +
      licCol('no', '不可以', ['复制代码进自己的项目', '修改后分发或商用', '镜像仓库、重打包', '去掉作者署名再发布']) +
      '</div></section>' +
      '<section class="gh-doc-sec" id="gh-doc-none-ask"><h2>想用怎么办</h2>' +
      '<ol class="gh-doc-steps">' +
      '<li><b>去仓库提 issue</b><p>写清用途（内部工具 / 商业产品 / 教学），请作者补一个 LICENSE。</p></li>' +
      '<li><b>直接联系作者</b>' + (repo ? '<p>仓库地址：<a href="' + e(repo) + '" target="_blank" rel="noopener noreferrer nofollow">' + e(p.repo) + '</a></p>' : '<p>作者主页见条目页右栏。</p>') + '</li>' +
      '<li><b>先用替代方案</b><p>功能接近、许可证明确的插件可以在插件库里按标签筛；等作者补上许可证再回来。</p></li>' +
      '</ol>' +
      '<p class="gh-muted">本站的做法：未声明许可证的条目只登记信息与仓库地址，不托管、不镜像任何文件；下载按钮也只指向作者仓库。</p>' +
      '</section></div></div>' + docFoot(ctx, p, 'license');
  }
  function licensePage(ctx, p) {
    var e = ctx.esc;
    var author = ctx.userOf(p.author).name;
    var name = p.license || '';
    if (!name) return unlicensedPage(ctx, p);
    var key = licKeyOf(name);
    var info = key ? LICENSES[key] : null;
    var repo = p.repo ? 'https://' + p.repo : '';
    var fullText = key === 'mit' ? mitText(author) : key === 'apache' ? apacheText(author) : '';
    var toc = [['gh-doc-lic-gist', '一句话结论'], ['gh-doc-lic-matrix', '你能做什么']];
    if (fullText) toc.push(['gh-doc-lic-text', '许可证全文']);
    toc.push(['gh-doc-lic-how', '怎么遵守'], ['gh-doc-lic-faq', '常见问题']);
    return docHero(ctx, {
      ic: 'law',
      kicker: 'LICENSE',
      title: info ? info.name + ' 许可证' : e(name) + ' 许可证',
      sub: info ? info.gist : '仓库声明了这个许可证。完整条款以仓库 LICENSE 文件为准，本页只做摘要与合规提示。',
      meta: [
        '<b>SPDX: ' + e(info ? info.spdx : name) + '</b>',
        info ? info.kind : '以仓库原文为准',
        info && info.osi ? 'OSI 认可' : '非 OSI 标准',
        '版权 © 2026 ' + e(author)
      ]
    }) +
      '<div class="gh-doc-wrap">' + docToc(toc) +
      '<div class="gh-doc-body gh-readme-body" id="gh-doc-body">' +
      '<section class="gh-doc-sec" id="gh-doc-lic-gist"><h2>一句话结论</h2>' +
      '<div class="gh-callout">' + icon('check') + '<div><b>' + (info ? e(info.gist) : '请按仓库 LICENSE 全文执行。') + '</b>' +
      '<p>' + (info ? e(info.note) : '本页无法替代原文；商用或再分发前，让法务读一遍仓库里的 LICENSE。') + '</p></div></div>' +
      '</section>' +
      '<section class="gh-doc-sec" id="gh-doc-lic-matrix"><h2>你能做什么</h2>' +
      (info
        ? '<div class="gh-lic-grid">' +
          licCol('ok', '你可以', info.can) +
          licCol('must', '你必须', info.must) +
          licCol('no', '你不可以', info.cannot) +
          '</div>'
        : '<p>这个许可证不在常见清单里，摘要把不准。看仓库里的 LICENSE 原文' +
          (repo ? '：<a href="' + e(repo) + '/blob/main/LICENSE" target="_blank" rel="noopener noreferrer nofollow">' + e(p.repo) + '/blob/main/LICENSE</a>' : '') + '。</p>') +
      '<p class="gh-muted">许可证约束的是「分发」：自己改着用、不往外给，多数许可证都不会找你麻烦。</p>' +
      '</section>' +
      (fullText
        ? '<section class="gh-doc-sec" id="gh-doc-lic-text"><h2>许可证全文</h2>' +
          '<p>复制到你的仓库里，把版权行换成你自己的名字即可。</p>' +
          '<pre class="gh-legal"><code>' + e(fullText) + '</code></pre>' +
          '<p class="gh-muted">与仓库里的 LICENSE 内容一致；有出入时以仓库为准。</p></section>'
        : '<section class="gh-doc-sec" id="gh-doc-lic-text"><h2>许可证全文</h2>' +
          '<p>' + e(name) + ' 的全文比较长，按原样维护在作者仓库里，避免这里出现一个过时的副本。</p>' +
          (repo ? '<p><a class="gh-btn gh-btn-ghost" href="' + e(repo) + '/blob/main/LICENSE" target="_blank" rel="noopener noreferrer nofollow">' +
            icon('link') + '<span>到仓库读 LICENSE 原文</span></a></p>' : '') +
          '</section>') +
      '<section class="gh-doc-sec" id="gh-doc-lic-how"><h2>怎么遵守</h2>' +
      '<ol class="gh-doc-steps">' +
      '<li><b>把 LICENSE 放进你的仓库</b><p>根目录一份，文件名就用 <code>LICENSE</code>；不要只写在 README 里。</p></li>' +
      '<li><b>保留版权行</b><pre class="gh-code"><code>' + e('Copyright (c) 2026 ' + author + '\nLicensed under ' + (info ? info.name : name) + '. See LICENSE.') + '</code></pre></li>' +
      '<li><b>分发时带上声明</b><p>打包、镜像、二次发布都要带上许可全文与版权行；改过的文件注明修改。</p></li>' +
      '<li><b>别替换成更严的许可证</b><p>你可以加自己的版权，但不能给别人的代码换一个更严格的许可。</p></li>' +
      '</ol></section>' +
      '<section class="gh-doc-sec" id="gh-doc-lic-faq"><h2>常见问题</h2>' +
      '<ul class="gh-faq">' +
      '<li><b>能商用吗？</b>' + (info && key !== 'gpl' ? '可以，' + e(info.name) + ' 不限制商业使用。' : '可以，但要遵守上面「你必须」那一列；GPL 系还要在分发时提供源码。') + '</li>' +
      '<li><b>我改的要开源吗？</b>' + (key === 'gpl' ? '分发就要；只在公司内部用、不对外发布，通常不用。' : key === 'mpl' ? '只有被改过的那几个文件要开源，其他文件不用。' : '不用。宽松许可不要求公开衍生作品的源码。') + '</li>' +
      '<li><b>能换成别的许可证吗？</b>衍生作品可以加自己的许可，但原作部分仍受原许可约束；想整体换证得联系版权持有人。</li>' +
      '<li><b>没有许可证的插件呢？</b>默认保留所有权利，只能看不能抄。条目页会明确标「未声明」，本站也不托管这类包。</li>' +
      '</ul></section>' +
      '</div></div>' + docFoot(ctx, p, 'license');
  }

  /* ---------- 作者仓库里的 README ----------
     这一块以前是按条目元数据拼出来的模板（安装 / 它解决什么问题 / 兼容性 / FAQ），
     每个插件长得一模一样，读者看不到作者真正写的东西。现在改成读仓库里的 README 原文：
       · 进条目页时发一次 GET /plugins/:id/readme（服务端缓存 7 天，同一时刻多人打开只回源一次）；
       · 拿到 Markdown 原文后用 js/md.js 渲染 —— 服务端不生成 HTML，外部内容一律走前端转义路径；
       · 只重画 README 那张卡（#gh-readme），不整页 render：整页重画会把滚动位置和文件树展开状态全清掉。
     读不到时保留原来的模板，并在顶部说明为什么没有原文。 */
  var README_CACHE = {};

  /* 仓库地址 → 图片与相对链接的前缀：README 里的 ./docs/x.png 要能显示出来 */
  function repoBases(p) {
    var repo = String((p && p.repo) || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    var m = repo.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/?#]+)/i);
    if (!m) return null;
    return {
      raw: 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/HEAD/',
      blob: 'https://github.com/' + m[1] + '/' + m[2] + '/blob/HEAD/'
    };
  }

  /* README 里的图片是外部地址：作者删过图、路径写错、或者 raw 被墙，都会留下一个破图标。
     图片的 error 事件不冒泡，只能用捕获阶段在 document 上收；收到就把这张图藏掉，
     比在正文里留一堆碎图标干净。只处理我们渲染出来的 .md-img，别碰站内其它图片。 */
  if (typeof document !== 'undefined' && !window.__mdImgGuard) {
    window.__mdImgGuard = true;
    document.addEventListener('error', function (ev) {
      var t = ev.target;
      if (t && t.tagName === 'IMG' && t.className && String(t.className).indexOf('md-img') >= 0) {
        t.className += ' md-img-dead';
      }
    }, true);
  }

  /* 地址栏可能就是某一页文档（#/plugin/<id>/security、/license…）。深链进来时卡片先画成
     「正在读取」，读完再重画；重画必须认地址栏这一页，否则会退回 README，用户以为链接坏了。 */
  function routeKind(S) {
    var t = String((S && S.ghReadmeTab) || '');
    if (t === 'contrib') return 'contributing';
    if (t === 'readme' || t === 'license' || t === 'security' || t === 'changelog'
      || t === 'conduct' || t === 'contributing') return t;
    return '';
  }

  function readmeState(p) {
    if (!p || p.id == null) return null;
    return README_CACHE[String(p.id)] || null;
  }

  /* 点语言标签时只需要重画 README 那一块，但 readmeCard/readmeReal 要 ctx（转义、
     tierOf、userOf）。渲染时把最近一次的 ctx / 条目记下来，切换时直接用。 */
  var LIVE = { ctx: null, p: null };

  /* 由 js/app.js 的 data-act="rdoc" 分支调用：切到另一份 README */
  function setReadmeDoc(pid, path) {
    var key = String(pid == null ? '' : pid);
    var st = README_CACHE[key];
    if (!st || st.status !== 'ok' || !st.item) return false;
    var docs = docList(st.item);
    var hit = false;
    for (var i = 0; i < docs.length; i++) if (String(docs[i].path) === String(path)) hit = true;
    if (!hit) return false;
    st.docPath = String(path);
    var p = LIVE.p && String(LIVE.p.id) === key ? LIVE.p : null;
    if (p && LIVE.ctx) repaintReadme(LIVE.ctx, p);
    return true;
  }
  if (typeof window !== 'undefined') window.PPReadmeDoc = setReadmeDoc;

  /* 由 js/app.js 的 data-act="rdkind" 分支调用：切到许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则。
     换文档时语言选择清空（LICENSE 没有多语言版本，留着上一条 README 的语言路径会选错）。 */
  /* Custom = 作者写了 LICENSE 但不是标准 SPDX 模板（自制商用条款 / 双许可说明）。
     直接显示「Custom」读者看不懂，统一叫「自定义许可」。 */
  function licName(p) {
    var raw = String((p && p.license) || '').trim();
    if (!raw) return '';
    return /^custom$/i.test(raw) ? '自定义许可' : raw;
  }

  function setReadmeKind(pid, kind) {
    var key = String(pid == null ? '' : pid);
    var st = README_CACHE[key];
    if (!st || st.status !== 'ok' || !st.item) return false;
    var want = String(kind || 'readme');
    if (docKinds(st.item).indexOf(want) < 0) return false;
    /* 已经是这一页也算成功：调用方据此写地址栏，不该因为「没变化」被当成失败 */
    if ((st.kind || 'readme') === want) return true;
    st.kind = want;
    st.docPath = '';
    var p = LIVE.p && String(LIVE.p.id) === key ? LIVE.p : null;
    if (p && LIVE.ctx) repaintReadme(LIVE.ctx, p);
    return true;
  }
  if (typeof window !== 'undefined') window.PPReadmeKind = setReadmeKind;

  function loadReadme(ctx, p) {
    if (!p || p.id == null) return;
    var pid = String(p.id);
    var cur = README_CACHE[pid];
    /* 已经成功 / 确认没有 / 正在读，都不再发请求；只有上次失败（网络抖动、限流）才重试 */
    if (cur && cur.status !== 'error') return;
    if (!window.API || !window.API.pluginReadme) return;
    README_CACHE[pid] = { status: 'loading' };
    window.API.pluginReadme(pid).then(function (d) {
      var item = (d && d.item) || null;
      if (item && item.status === 'ok' && item.markdown) README_CACHE[pid] = { status: 'ok', item: item };
      /* 「服务端配额用完」与「作者仓库真的没有 README」必须分开：
         前者是临时状态、过一会儿会自愈，后者是这条条目的事实。
         混在一起会让访客以为这个插件根本没写说明，而实际是我们自己的配额打满了。 */
      else if (item && item.code === 'RATE_LIMITED') README_CACHE[pid] = { status: 'error', item: item, message: item.message || '服务端读取配额暂时用完了，稍后刷新' };
      else if (item) README_CACHE[pid] = { status: 'none', item: item };
      else README_CACHE[pid] = { status: 'error', message: '没有拿到内容' };
      repaintReadme(ctx, p);
    }, function (err) {
      README_CACHE[pid] = { status: 'error', message: (err && err.message) || '读取失败' };
      repaintReadme(ctx, p);
    });
  }

  function repaintReadme(ctx, p) {
    LIVE.ctx = ctx; LIVE.p = p;
    var S = ctx.S || {};
    var cur = String(S.pid == null ? '' : S.pid).replace(/^p(?=\d)/i, '');
    if (cur !== String(p.id).replace(/^p(?=\d)/i, '')) return;  /* 人已经切到别的条目了 */
    var el = document.getElementById('gh-readme');
    if (!el || !el.parentNode) return;
    var box = document.createElement('div');
    box.innerHTML = isLinkEntry(ctx, p) ? readmeCard(ctx, p) : readme(ctx, p);
    var next = box.firstElementChild || box.firstChild;
    if (next) el.parentNode.replaceChild(next, el);
  }

  function docLinks(ctx, p) {
    var e = ctx.esc;
    return '<div class="gh-doc-links">' +
      '<button type="button" class="gh-doc-link" data-act="ghdoc" data-doc="contrib">' + icon('people') +
      '<span><b>贡献指南</b><em>怎么报问题、改代码、发 PR</em></span><b aria-hidden="true">→</b></button>' +
      '<button type="button" class="gh-doc-link" data-act="ghdoc" data-doc="license">' + icon('law') +
      '<span><b>' + e(licName(p) ? licName(p) + ' 许可证' : '许可未标注') + '</b><em>' +
      (p.license ? '你可以做什么、必须保留什么' : '没有许可证意味着什么') + '</em></span><b aria-hidden="true">→</b></button>' +
      '</div>';
  }

  /* ---- 说明文档：README 与它旁边的「规范文档」 ----
     一个仓库常有 README.md + README.zh-CN.md + docs/README_CN.md（多语言），
     还常有 LICENSE / SECURITY.md / CONTRIBUTING.md / CHANGELOG.md / CODE_OF_CONDUCT.md
     （插件能不能放心用，看的就是这几份）。服务端把发现的每一份都抓回来
     （GET /plugins/:id/readme 的 item.docs，用 kind 区分），这里分两层导航：
       ① 文档标签：README / 许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则（只有存在的才出现）；
       ② 语言标签：README 有多语言版本时才有。
     切标签只重画这一块，不整页 render：整页重画会丢滚动位置与文件树展开态。 */
  var KIND_LABELS = {
    readme: 'README', license: '许可证', security: '安全',
    contributing: '贡献指南', changelog: '更新日志', conduct: '行为准则'
  };
  /* 顺序即标签顺序：README 永远第一，许可证/安全是「能不能用」，贡献/更新/准则是「怎么参与」 */
  var KIND_ORDER = ['readme', 'license', 'security', 'contributing', 'changelog', 'conduct'];

  function kindOf(d) { return (d && d.kind) || 'readme'; }

  /* 只取 README（含老缓存里没有 kind 字段的行）：语言标签与「几份 README」都数它 */
  function docList(item) {
    var all = (item && item.docs) || [];
    var docs = [];
    for (var i = 0; i < all.length; i++) if (kindOf(all[i]) === 'readme') docs.push(all[i]);
    if (!docs.length && item && item.markdown) {
      /* 老缓存只有主表那份正文：退化成「一份」，页面上不出现标签 */
      docs = [{ path: item.path || 'README', kind: 'readme', label: '', lang: '', markdown: item.markdown,
        bytes: item.bytes, truncated: item.truncated }];
    }
    return docs;
  }

  /* 全部文档（README + 规范文档）：用来判断「这个条目到底有没有正文可看」 */
  function allDocs(item) { return (item && item.docs) || []; }

  /* 规范文档（许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则） */
  function metaDocs(item) {
    var all = (item && item.docs) || [];
    var out = [];
    for (var i = 0; i < all.length; i++) if (kindOf(all[i]) !== 'readme') out.push(all[i]);
    return out;
  }

  /* 这个条目实际有哪些文档页：服务端给的 kinds 先过一遍「确实有正文」，再按固定顺序排 */
  function docKinds(item) {
    var have = {};
    var readmes = docList(item);
    if (readmes.length) have.readme = true;
    var meta = metaDocs(item);
    for (var i = 0; i < meta.length; i++) {
      var k = kindOf(meta[i]);
      if (meta[i].markdown) have[k] = true;
    }
    var out = [];
    for (var j = 0; j < KIND_ORDER.length; j++) if (have[KIND_ORDER[j]]) out.push(KIND_ORDER[j]);
    /* 服务端将来加了新 kind 也不会被这里吃掉 */
    for (var k2 in have) if (out.indexOf(k2) < 0) out.push(k2);
    return out;
  }

  /* 按 kind 取正文：readme 走语言选择（want=选中的路径），其余每种只有一份 */
  function docOfKind(item, kind, want) {
    if (!kind || kind === 'readme') return pickDoc(item, want);
    var meta = metaDocs(item);
    for (var i = 0; i < meta.length; i++) if (kindOf(meta[i]) === kind) return meta[i];
    return null;
  }

  function pickDoc(item, want) {
    var docs = docList(item);
    if (!docs.length) return null;
    var key = String(want || '');
    if (key) {
      for (var i = 0; i < docs.length; i++) if (String(docs[i].path) === key) return docs[i];
    }
    return docs[0];
  }

  /* 语言标签：默认那份叫「默认」，其余用服务端给的 label（中文 / English / 繁體…）；
     同一语言有多份（README_CN.md 与 README.zh-CN.md）时补上文件名，避免两个「中文」 */
  function docTabLabel(docs, d, i) {
    var base = d.label || d.path || ('README ' + (i + 1));
    var same = 0;
    for (var k = 0; k < docs.length; k++) if ((docs[k].label || '') === (d.label || '')) same++;
    if (same > 1 && i > 0) {
      var short = String(d.path || '').split('/').pop();
      return base + ' · ' + short;
    }
    return base;
  }

  /* 文档标签条：README / 许可证 / 安全 / 贡献指南 / 更新日志 / 行为准则。
     只有一份文档时不出现（没有可切换的东西），标签文字用中文，不跟仓库文件名走。 */
  function rdocKinds(ctx, p, kinds, activeKind) {
    if (!kinds || kinds.length < 2) return '';
    var e = ctx.esc;
    var out = '<nav class="rdoc-kinds" aria-label="文档页面">';
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i];
      var on = k === activeKind;
      out += '<button type="button" class="rdoc-kind' + (on ? ' is-on' : '') + '"' +
        ' data-act="rdkind" data-plugin="' + e(p.id) + '" data-kind="' + e(k) + '"' +
        (on ? ' aria-current="true"' : '') + '>' + e(KIND_LABELS[k] || k) + '</button>';
    }
    out += '</nav>';
    return out;
  }

  function rdocTabs(ctx, p, docs, activePath) {
    if (docs.length < 2) return '';
    var e = ctx.esc;
    var out = '<nav class="rdoc-tabs" aria-label="README 版本">';
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var on = String(d.path) === String(activePath);
      out += '<button type="button" class="rdoc-tab' + (on ? ' is-on' : '') + '"' +
        ' data-act="rdoc" data-plugin="' + e(p.id) + '" data-path="' + e(d.path) + '"' +
        (on ? ' aria-current="true"' : '') + '>' + e(docTabLabel(docs, d, i)) + '</button>';
    }
    out += '</nav>';
    return out;
  }

  /* 文档正文：文档标签条 + 语言标签条 + 来源行 + 渲染后的 markdown。仓库视图和外链卡共用这一段。
     activeKind：readme / license / security / contributing / changelog / conduct；
     noKinds=true 时不画文档标签条（仓库视图顶上已经有一套 .gh-readme-tabs）。 */
  function readmeBodyHTML(ctx, p, md, activePath, activeKind, noKinds) {
    var e = ctx.esc;
    var base = repoBases(p);
    var kind = activeKind || 'readme';
    var kinds = docKinds(md);
    if (kinds.indexOf(kind) < 0) kind = 'readme';
    var docs = docList(md);
    var doc = docOfKind(md, kind, activePath) || pickDoc(md, activePath);
    /* 这一页没有正文（例如仓库只给了 LICENSE，而地址栏还停在 README）：宁可说清楚，
       也不能拿条目简介当 README 渲染成空白 */
    if (!doc || typeof doc.markdown !== 'string') {
      return (noKinds ? '' : rdocKinds(ctx, p, kinds, kind)) +
        '<p class="lnk-readme-wait">这个仓库里没有 ' + e(KIND_LABELS[kind] || 'README') + ' 的正文。' +
        (p.repo ? '可以去 <a href="' + e(p.repo) + '" target="_blank" rel="noopener noreferrer nofollow">仓库首页 ↗</a> 看。' : '') +
        '</p>';
    }
    /* 子目录里的 README（docs/README.zh-CN.md）相对路径是相对它自己那层目录的，
       ./x.png 要拼成 docs/x.png，否则图全裂 */
    var dir = String(doc.path || '').indexOf('/') >= 0 ? String(doc.path).replace(/\/[^\/]*$/, '/') : '';
    var rawBase = base ? base.raw + dir : '';
    var blobBase = base ? base.blob + dir : '';
    var body;
    try {
      body = window.MD
        ? window.MD.render(doc.markdown, {
          imgBase: rawBase,
          linkBase: blobBase,
          /* 图走本站代理：生产 CSP 只放行 'self'，raw.githubusercontent.com 在国内也不通。
             路径里带一个带扩展名的文件名，Cloudflare 才按静态资源缓存（无扩展名它不缓存）。 */
          imgProxy: function (u) {
            var name = '';
            try { name = String(u).split('?')[0].split('#')[0].split('/').pop() || ''; } catch (e) { name = ''; }
            if (!/\.(png|jpe?g|gif|webp|svg|avif|ico)$/i.test(name)) name = 'img.png';
            /* pv：放行规则调整过，旧 URL 在 CDN 上还留着 403，加个版本参数换一批缓存键 */
            return '/api/img/' + encodeURIComponent(name) + '?u=' + encodeURIComponent(u) + '&pv=2';
          },
        })
        : '<pre class="gh-code"><code>' + e(doc.markdown) + '</code></pre>';
    } catch (err) {
      /* 渲染器出问题也要让人看得到原文，不能整块空白 */
      body = '<pre class="gh-code"><code>' + e(String(doc.markdown).slice(0, 6000)) + '</code></pre>';
    }
    var when = '';
    var ts = Number(md.fetchedAt || 0);
    if (ts) {
      var d = new Date(ts * 1000), pad = function (k) { return (k < 10 ? '0' : '') + k; };
      when = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    /* 每份 README 的 GitHub 地址按它自己的路径拼：多份时「在 GitHub 打开」不能都指向仓库首页 */
    var docUrl = '';
    if (base && doc.path) docUrl = base.blob + String(doc.path).split('/').map(encodeURIComponent).join('/');
    else if (md.url) docUrl = md.url;
    return (noKinds ? '' : rdocKinds(ctx, p, kinds, kind)) +
      /* 语言标签只属于 README：LICENSE 不会有多语言版本 */
      (kind === 'readme' ? rdocTabs(ctx, p, docs, doc.path) : '') +
      '<div class="gh-readme-src">' +
      '<span>正文来自作者仓库的 <b>' + e(doc.path || 'README') + '</b>' +
      (when ? ' · 抓取于 ' + e(when) : '') +
      (doc.truncated ? ' · 原文较长，这里只显示前面一段' : '') +
      (md.stale ? ' · 这次没读到最新版本，先显示上次抓到的内容' : '') +
      (kind === 'readme' && docs.length > 1 ? ' · 这个仓库有 ' + docs.length + ' 份 README' : '') + '</span>' +
      (docUrl ? '<a href="' + e(docUrl) + '" target="_blank" rel="noopener noreferrer nofollow">在 GitHub 打开 ↗</a>' : '') +
      '</div>' +
      '<div class="md-body">' + body + '</div>';
  }

  function readmeReal(ctx, p, st) {
    var e = ctx.esc;
    /* 仓库视图顶上已经有一套 .gh-readme-tabs（README / 贡献指南 / 许可证 …），这里不再重复画标签 */
    return '<div class="gh-readme-body gh-readme-md">' + readmeBodyHTML(ctx, p, st.item, st.docPath, 'readme', true) +
      (p.why ? '<div class="gh-callout">' + icon('shield') + '<div><b>收录说明</b><p>' + e(p.why) + '</p></div></div>' : '') +
      '<h2>贡献与许可</h2>' + docLinks(ctx, p) +
      '<p class="gh-muted">维护者：' + e(ctx.userOf(p).name) + ' · 收录于 ' + e(p.collected) +
      ' · README 版权归作者所有，这里只做展示，改动请去作者仓库。</p>' +
      '</div>';
  }

  /* 外链条目（占市场里的绝大多数）：没有仓库视图，但 README 恰恰是最该给的
     —— 读者决定装不装，看的本来就是作者写的说明。这里给一张独立卡片。 */
  function isLinkEntry(ctx, p) {
    return p.tier === 'link' && !(ctx.claimedOf ? ctx.claimedOf(p) : p.claimed);
  }

  function readmeCard(ctx, p) {
    var e = ctx.esc;
    var st = readmeState(p);
    var inner;
    /* 这一页以地址栏为准：深链 /p4592/security 与点标签都写进 S.ghReadmeTab，
       重画时按它选文档；仓库里没有这一份就退回 README，不留一张空卡。 */
    var kinds = (st && st.status === 'ok' && st.item) ? docKinds(st.item) : [];
    var want = routeKind(ctx.S) || (st && st.kind) || 'readme';
    if (kinds.length && kinds.indexOf(want) < 0) want = 'readme';
    /* 仓库里只有 LICENSE / SECURITY 而没有 README 时，默认页得落在真有正文的那一份上，
       否则标题写 README、正文空白（docOfKind 拿不到 readme 就会退回条目简介） */
    var hasReadme = (st && st.status === 'ok' && st.item) ? docList(st.item).length > 0 : false;
    if (!hasReadme && kinds.length && want === 'readme') want = kinds[0];
    if (st && st.status === 'ok') st.kind = want;
    if (st && st.status === 'ok' && st.item && allDocs(st.item).length) {
      LIVE.ctx = ctx; LIVE.p = p;
      inner = readmeBodyHTML(ctx, p, st.item, st.docPath, want);
    } else if (st && st.status === 'none') {
      inner = '<p class="lnk-readme-wait">作者仓库里没有找到可读的 README。' +
        (p.repo ? '可以直接去 <a href="' + e(p.repo) + '" target="_blank" rel="noopener noreferrer nofollow">仓库首页 ↗</a> 看。' : '') + '</p>';
    } else if (st && st.status === 'error') {
      inner = '<p class="lnk-readme-wait">这次没读到 README（网络或 GitHub 限流），下次打开这个条目会自动重试。' +
        (p.repo ? '先看 <a href="' + e(p.repo) + '" target="_blank" rel="noopener noreferrer nofollow">仓库首页 ↗</a>。' : '') + '</p>';
    } else {
      inner = '<p class="lnk-readme-wait">正在从作者仓库读取 README…</p>';
    }
    /* 标题跟着选中的文档走：切到许可证时还写「README」会让人以为页面没变 */
    var curKind = want;
    var hdName = KIND_LABELS[curKind] || 'README';
    var hdSub = curKind === 'readme'
      ? '作者仓库里的说明原文 · 本站只做展示'
      : '作者仓库里的原文 · 本站只做展示，以仓库为准';
    return '<section class="lnk-readme gh-readme-md" id="gh-readme" data-plugin="' + e(p.id) + '">' +
      '<div class="lnk-readme-hd"><b>' + e(hdName) + '</b><span>' + e(hdSub) + '</span></div>' +
      inner + '</section>';
  }

  function readmeBody(ctx, p) {
    var e = ctx.esc;
    var cmd = 'pnpm dsh add ' + (p.pkg || p.name);
    var t = ctx.tierOf(p);
    var st = readmeState(p);
    /* 有原文就整块换成原文，模板只在读不到的时候当兜底 */
    if (st && st.status === 'ok' && st.item && docList(st.item).length) {
      LIVE.ctx = ctx; LIVE.p = p;
      return readmeReal(ctx, p, st);
    }
    var note = '';
    if (st && st.status === 'none') {
      note = '<div class="gh-readme-note">' + icon('file') + '<div><b>作者仓库里没有可读的 README</b>' +
        '<p>下面是本站按条目信息整理的简介，不是作者原文。作者补上 README 后这里会自动换成原文。</p></div></div>';
    } else if (st && st.status === 'error') {
      note = '<div class="gh-readme-note">' + icon('file') + '<div><b>这次没读到作者仓库的 README</b>' +
        '<p>可能是网络或 GitHub 限流，先显示本站整理的简介；下次打开这个条目会自动重试。</p></div></div>';
    }
    return '<div class="gh-readme-body">' + note +
      '<h1>' + e(p.name) + '</h1>' +
      '<p class="gh-lead">' + e(p.desc) + '</p>' +
      '<p class="gh-shields"><span class="gh-shield">dsh-plugin</span><span class="gh-shield">' + (p.ver ? 'v' + e(p.ver) : '外链') + '</span>' +
      '<span class="gh-shield">' + e(licName(p) || '许可未标注') + '</span><span class="gh-shield">' + e(p.cat) + '</span></p>' +
      '<h2>安装</h2>' +
      '<pre class="gh-code"><code>' + e(cmd) + '</code></pre>' +
      '<p class="gh-muted">' + (t === 'pack'
        ? '这个条目登记了安装包信息（名称 / 大小 / sha256），文件在作者仓库：打开 Releases 下载，核对 sha256，再 pnpm dsh add ./包名。'
        : t === 'link'
          ? '本站不存安装包，上面的命令用于从作者仓库或 npm 源安装。'
          : '这个条目目前没有可用的下载渠道，命令只表达包名，作者补充授权后才会开放。') + '</p>' +
      '<h2>它解决什么问题</h2>' +
      '<ul><li>把「' + e(p.cat) + '」这一类工作收进一条命令，少写胶水代码。</li>' +
      '<li>关键步骤留下可复现的记录：配置、输入、输出都能回看。</li>' +
      '<li>与 DSH 的插件机制一致，装完重启一次会话即可使用。</li></ul>' +
      (p.tags && p.tags.length ? '<p class="gh-topics-line">' + p.tags.map(function (x) {
        return '<span class="gh-topic">' + e(x) + '</span>';
      }).join('') + '</p>' : '') +
      '<h2>兼容性</h2>' +
      '<p>面向 DSH 当前版本；升级大版本前先看 <a href="javascript:;" data-act="ghtab" data-tab="releases">版本说明</a>。' +
      '和别的插件共存时，注意同名命令、端口与缓存目录。</p>' +
      (p.why ? '<div class="gh-callout">' + icon('shield') + '<div><b>收录说明</b><p>' + e(p.why) + '</p></div></div>' : '') +
      '<h2>常见问题</h2>' +
      '<ul class="gh-faq">' +
      '<li><b>装完没反应？</b>确认 DSH 版本与插件声明的兼容范围一致，再重启一次会话。</li>' +
      '<li><b>能和别的插件共存吗？</b>看功能有没有重叠：同名命令、同一个端口、同一个缓存目录。</li>' +
      '<li><b>包是从哪来的？</b>' + (t === 'pack' ? (p.source === 'author' ? '包信息由作者登记，文件放在作者仓库，本站不托管安装包。' : '包信息来自早年收录的转载登记，文件仍在原仓库，本站不托管安装包。') : t === 'link' ? '本站不存包，只链到作者仓库。' : '作者尚未授权分发，页面只保留条目信息。') + '</li>' +
      '</ul>' +
      '<h2>贡献与许可</h2>' +
      '<div class="gh-doc-links">' +
      '<button type="button" class="gh-doc-link" data-act="ghdoc" data-doc="contrib">' + icon('people') +
      '<span><b>贡献指南</b><em>怎么报问题、改代码、发 PR</em></span><b aria-hidden="true">→</b></button>' +
      '<button type="button" class="gh-doc-link" data-act="ghdoc" data-doc="license">' + icon('law') +
      '<span><b>' + e(licName(p) ? licName(p) + ' 许可证' : '许可未标注') + '</b><em>' +
      (p.license ? '你可以做什么、必须保留什么' : '没有许可证意味着什么') + '</em></span><b aria-hidden="true">→</b></button>' +
      '</div>' +
      '<p class="gh-muted">维护者：' + e(ctx.userOf(p.author).name) + ' · 收录于 ' + e(p.collected) + ' · 条目由社群整理，版本与许可证由作者维护。</p>' +
      '</div>';
  }

  /* 仓库里的「规范文档」整页：作者原文（LICENSE / SECURITY.md / CONTRIBUTING.md /
     CHANGELOG.md / CODE_OF_CONDUCT.md）。和 README 页共用 readmeBodyHTML 的来源行与正文排版，
     只额外给一条页脚说明「这一页是原文，条款以仓库为准」。 */
  function realDocPage(ctx, p, st, kind) {
    var e = ctx.esc;
    var doc = docOfKind(st.item, kind, '');
    if (!doc) return '';
    var label = KIND_LABELS[kind] || kind;
    var repo = p.repo ? 'https://' + p.repo : '';
    return '<div class="gh-readme-body gh-readme-md gh-realdoc gh-realdoc-' + e(kind) + '">' +
      readmeBodyHTML(ctx, p, st.item, '', kind, true) +
      '<p class="gh-muted">这一页是作者仓库里的 <b>' + e(doc.path || label) + '</b> 原文，本站只做展示；' +
      '条款以仓库里的文件为准' +
      (repo ? '（<a href="' + e(repo) + '" target="_blank" rel="noopener noreferrer nofollow">仓库首页 ↗</a>）' : '') + '。</p>' +
      '</div>';
  }

  function readme(ctx, p) {
    var S = ctx.S || {};
    /* 任何文档页都要先确保拿到了仓库文档（缓存命中不发请求）：标签条要知道仓库里到底有哪几份 */
    loadReadme(ctx, p);
    var st = readmeState(p);
    var kinds = st && st.status === 'ok' && st.item ? docKinds(st.item) : [];
    var active = String(S.ghReadmeTab || 'readme');
    /* 允许的页：README / 贡献指南 / 许可证 是固定的三页（没有原文时给本站整理的说明），
       安全 / 更新日志 / 行为准则只有在仓库里真的有这份文件时才允许落进来 */
    var allowed = ['readme', 'contrib', 'license'];
    for (var i = 0; i < kinds.length; i++) {
      if (kinds[i] === 'contributing') continue;         /* 对应 contrib 这一页 */
      if (allowed.indexOf(kinds[i]) < 0) allowed.push(kinds[i]);
    }
    if (allowed.indexOf(active) < 0) active = 'readme';
    var kind = active === 'contrib' ? 'contributing' : active;
    /* 卡片内部按 st.kind 画文档标签，地址栏按 S.ghReadmeTab 选页：两边对齐，
       否则会出现「标签高亮 README、正文却是许可证」这种错位 */
    if (st && st.status === 'ok') st.kind = kind;
    /* 有原文就用原文：以前这三页都是本站拼的说明文字，读者要的其实是作者写的条款 */
    var real = (kind !== 'readme' && st && st.status === 'ok' && st.item) ? docOfKind(st.item, kind, '') : null;
    var body;
    if (kind === 'readme') body = readmeBody(ctx, p);
    else if (real) body = realDocPage(ctx, p, st, kind);
    else if (kind === 'contributing') body = contribPage(ctx, p);
    else if (kind === 'license') body = licensePage(ctx, p);
    else body = '<div class="gh-readme-body"><p class="gh-muted">这一页还没有原文。</p></div>';
    return '<article class="gh-readme gh-doc gh-doc-' + active + '" id="gh-readme" data-doc="' + active + '">' +
      '<div class="gh-readme-hd">' + readmeTabs(ctx, p, active, kinds) + '</div>' +
      body + '</article>';
  }

  function codePane(ctx, p) {
    var e = ctx.esc, S = ctx.S;
    var q = S.ghFileQ || '';
    var open = S.ghFile || '';
    var list = filesOf(p);
    /* 空态判据要用「筛完还剩几行」，不能拿拼接后的 HTML 找类名 ——
       以前写成 files.indexOf('gh-file-name') < 0，这个类名永远在，空态就永远不显示。 */
    var hitN = list.filter(function (f) {
      return !q || f.path.toLowerCase().indexOf(String(q).toLowerCase()) >= 0;
    }).length;
    var files = list.map(function (f) { return fileRow(ctx, p, f, open, q); }).join('');
    return '<div class="gh-filebar">' +
      '<button type="button" class="gh-branch" data-act="toast" data-msg="演示站点只有一个 main 分支">' +
      icon('branch') + '<b>main</b><span class="gh-caret">▾</span></button>' +
      '<span class="gh-branch-meta"><b>1</b> Branch <b>' + versionsOf(p).length + '</b> Tags</span>' +
      '<span class="gh-spacer"></span>' +
      '<label class="gh-filefind">' + icon('search') +
      '<input id="gh-file-q" data-gh-file type="search" placeholder="Go to file" aria-label="筛选文件" value="' + e(q) + '">' +
      '</label>' +
      '<button type="button" class="gh-btn gh-btn-primary" data-act="ghget" aria-expanded="' + !!S.ghGet + '">' +
      icon('download') + '<span>获取插件</span><span class="gh-caret">▾</span></button>' +
      '</div>' +
      (S.ghGet ? '<div class="gh-getpanel">' + ctx.dlBox(p) + '</div>' : '') +
      commitbar(ctx, p, ctx.userOf(p.author)) +
      '<div class="gh-files" id="gh-files">' + files +
      '<div class="gh-empty gh-file-none"' + (q && !hitN ? '' : ' hidden') + '>没有匹配的文件</div></div>' +
      readme(ctx, p);
  }

  /* v46 · 完整 Releases 页：左边版本列表，右边单个版本的说明、附件与 Changelog。
     数据仍然是 versionsOf(p) 这份稳定账本；选中项来自 S.ghRel，深链是
     #/plugin/<id>/releases/<tag>。没有仓库地址时，所有需要外链的动作都退化为 toast，
     不伪造一个点不开的下载按钮。 */
  function shortShaFor(p, tag) {
    var s = hash(p.id + '|' + tag).toString(16) + hash(tag + '|' + p.name).toString(16);
    return s.slice(0, 7);
  }

  function relativeDate(iso) {
    var t = Date.parse(String(iso || '') + 'T00:00:00Z');
    if (!isFinite(t)) return String(iso || '');
    var days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 30) return days + ' 天前';
    if (days < 365) return Math.round(days / 30) + ' 个月前';
    return Math.round(days / 365) + ' 年前';
  }

  function releaseOf(S, p) {
    var list = versionsOf(p);
    var want = String((S && S.ghRel) || '');
    var idx = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].tag === want) { idx = i; break; }
    }
    return {
      list: list,
      idx: idx,
      v: list[idx],
      newer: idx > 0 ? list[idx - 1] : null,
      older: idx < list.length - 1 ? list[idx + 1] : null
    };
  }

  /* 正文里用 [[...]] 标行内代码，@id 自动变成作者空间链接。
     先转义再拼标签：说明文字来自数据，不能让它带 HTML 进来。 */
  function relRich(ctx, s) {
    var e = ctx.esc;
    return String(s == null ? '' : s).split(/(\[\[[^\]]+\]\])/).map(function (part) {
      if (part.slice(0, 2) === '[[' && part.slice(-2) === ']]') {
        return '<code>' + e(part.slice(2, -2)) + '</code>';
      }
      return e(part).replace(/@([A-Za-z0-9_-]+)/g, function (m, uid) {
        return '<a class="gh-mention" href="#/space/' + e(uid) + '">@' + e(uid) + '</a>';
      });
    }).join('');
  }

  function relSections(ctx, sections) {
    return sections.map(function (sec) {
      return '<section class="gh-rel-sec"><h3>' + ctx.esc(sec[0]) + '</h3><ul>' +
        sec[1].map(function (it) { return '<li>' + relRich(ctx, it) + '</li>'; }).join('') +
        '</ul></section>';
    }).join('');
  }

  function releaseCopy(p, v, idx, older) {
    var t0 = (p.tags && p.tags[0]) || '核心能力';
    var t1 = (p.tags && p.tags[1]) || p.cat || '当前环境';
    var pkg = p.pkg || p.name;
    var from = older ? older.tag : '上一个版本';
    if (idx === 0) {
      return {
        zh: {
          intro: v.tag + ' 汇总了自 ' + from + ' 以来的主要变更，重点在 ' + t0 + ' 的稳定性与安装体验。安装包已登记，升级前建议先读下面的兼容性说明。',
          secs: [
            ['新增', [
              '新增 ' + t0 + ' 的快捷入口与常用参数，常见场景不用再手写配置。',
              '支持在项目级覆盖默认设置；全局配置保持向后兼容。',
              '安装包附带 [[sha256]]，可在「安全」页核对后再离线安装。'
            ]],
            ['问题修复', [
              '修复在 Windows / WSL 下路径分隔符不一致，导致 [[' + pkg + ']] 读取配置失败的问题。',
              '修复会话中断后后台任务未正确回收、再次运行状态残留的问题。',
              '修复 ' + t1 + ' 模式下偶发的重复渲染；感谢 @' + p.author + ' 复现并给出日志。'
            ]],
            ['文档与兼容性', [
              '补充安装、升级与回滚说明，更新 [[README.md]] 中的示例。',
              '与 DSH 当前版本保持兼容；从 ' + from + ' 升级不需要迁移配置。'
            ]]
          ]
        },
        en: {
          intro: v.tag + ' collects the changes since ' + from + ', focused on ' + t0 + ' stability and the install experience. The package is registered; read the compatibility notes before upgrading.',
          secs: [
            ['Added', [
              'Added a shortcut entry and common parameters for ' + t0 + ', so typical setups no longer need hand-written config.',
              'Defaults can now be overridden per project; global configuration stays backward compatible.',
              'The package ships a [[sha256]] you can verify on the Security tab before installing offline.'
            ]],
            ['Bug Fixes', [
              'Fixed an issue where mismatched path separators on Windows / WSL prevented [[' + pkg + ']] from reading its config.',
              'Fixed background tasks not being reclaimed after an interrupted session, which left stale state on the next run.',
              'Fixed occasional duplicate renders in ' + t1 + ' mode; thanks @' + p.author + ' for the reproduction and logs.'
            ]],
            ['Docs & compatibility', [
              'Expanded install, upgrade, and rollback notes, and refreshed the examples in [[README.md]].',
              'Compatible with the current DSH release; no config migration is required when upgrading from ' + from + '.'
            ]]
          ]
        }
      };
    }
    if (idx === 1) {
      return {
        zh: {
          intro: v.tag + ' 是一次维护版本，处理 ' + from + ' 之后反馈较多的安装与兼容性问题，没有引入新的必填配置。',
          secs: [
            ['变更', [
              '调整 ' + t0 + ' 的默认参数，旧配置继续可用。',
              '启动时的依赖检查改为按需执行，减少无谓等待。',
              '错误提示补上具体字段名与修复建议，定位问题不用再翻源码。'
            ]],
            ['修复', [
              '修复重复安装后命令未刷新、需要重启两次会话的问题。',
              '修复 Windows 下路径大小写不一致导致资源找不到的问题。',
              '修复 ' + t1 + ' 场景下偶发的空结果；相关回归用例已补齐。'
            ]]
          ]
        },
        en: {
          intro: v.tag + ' is a maintenance release for the install and compatibility issues reported after ' + from + '. No new required configuration was introduced.',
          secs: [
            ['Changed', [
              'Adjusted the default parameters for ' + t0 + '; existing configuration keeps working.',
              'Dependency checks at startup now run on demand, cutting unnecessary waiting.',
              'Error messages now name the failing field and suggest a fix, so debugging no longer starts in the source.'
            ]],
            ['Fixed', [
              'Fixed commands not refreshing after a reinstall, which required two session restarts.',
              'Fixed resources not being found on Windows when path casing differed.',
              'Fixed occasional empty results in ' + t1 + ' mode; regression coverage was added.'
            ]]
          ]
        }
      };
    }
    if (idx === 2) {
      return {
        zh: {
          intro: v.tag + ' 聚焦稳定性：收紧边界检查，补齐错误提示，并同步上游依赖。',
          secs: [
            ['修复', [
              '修复配置文件缺字段时直接崩溃的问题，现在会给出可读的错误提示。',
              '修复 ' + t1 + ' 场景下长会话内存持续增长的问题。',
              '修复卸载后残留缓存影响下一次安装的问题。'
            ]],
            ['维护', [
              '同步上游依赖，移除不再使用的兼容分支。',
              '补充回归用例，覆盖安装、升级与回滚。',
              '更新 [[README.md]] 的兼容性表格。'
            ]]
          ]
        },
        en: {
          intro: v.tag + ' focuses on stability: tighter boundary checks, clearer errors, and refreshed upstream dependencies.',
          secs: [
            ['Fixed', [
              'Fixed a crash when the config file was missing a field; it now reports a readable error.',
              'Fixed steady memory growth in long sessions in ' + t1 + ' mode.',
              'Fixed leftover cache after uninstall affecting the next install.'
            ]],
            ['Maintenance', [
              'Synced upstream dependencies and removed unused compatibility branches.',
              'Added regression coverage for install, upgrade, and rollback.',
              'Refreshed the compatibility table in [[README.md]].'
            ]]
          ]
        }
      };
    }
    return {
      zh: {
        intro: v.tag + ' 是历史版本，保留说明与源码入口，方便排查仍在使用旧环境的情况。',
        secs: [
          ['维护', [
            '同步依赖与构建脚本，保持与当时 DSH 版本兼容。',
            '整理 ' + t0 + ' 的边界条件，减少误报。'
          ]],
          ['文档', [
            '更新示例与常见问题；完整改动见下方 Changelog。',
            '该版本未登记安装包，建议优先使用最新版本。'
          ]]
        ]
      },
      en: {
        intro: v.tag + ' is a historical release. Its notes and source entry are kept for environments still pinned to an older setup.',
        secs: [
          ['Maintenance', [
            'Synced dependencies and build scripts with the DSH version of that time.',
            'Tightened edge cases for ' + t0 + ' to reduce false positives.'
          ]],
          ['Docs', [
            'Updated examples and FAQ entries; see the changelog below for the full diff.',
            'No package was registered for this release; prefer the latest version.'
          ]]
        ]
      }
    };
  }

  function relNotes(ctx, p, rel) {
    var copy = releaseCopy(p, rel.v, rel.idx, rel.older);
    return '<div class="gh-rel-langs" role="group" aria-label="说明语言">' +
      '<button type="button" class="gh-rel-langbtn" data-act="ghreljump" data-to="gh-rel-zh" aria-controls="gh-rel-zh">中文</button>' +
      '<span class="gh-rel-langsep" aria-hidden="true">|</span>' +
      '<button type="button" class="gh-rel-langbtn" data-act="ghreljump" data-to="gh-rel-en" aria-controls="gh-rel-en">English</button>' +
      '</div>' +
      '<div class="gh-rel-notes">' +
      '<section class="gh-rel-note" id="gh-rel-zh" lang="zh-CN" tabindex="-1" aria-label="中文说明">' +
      '<p class="gh-rel-intro">' + relRich(ctx, copy.zh.intro) + '</p>' + relSections(ctx, copy.zh.secs) + '</section>' +
      '<section class="gh-rel-note gh-rel-en" id="gh-rel-en" lang="en" tabindex="-1" aria-label="English release notes">' +
      '<p class="gh-rel-intro">' + relRich(ctx, copy.en.intro) + '</p>' + relSections(ctx, copy.en.secs) + '</section>' +
      '</div>';
  }

  function compareMenu(ctx, p, rel) {
    var e = ctx.esc;
    var repo = ctx.repoHref(p.repo);
    var rows = [];
    function row(base, head, label) {
      var inner = '<span class="gh-rel-cmp-tags"><code>' + e(base) + '</code><i>…</i><code>' + e(head) + '</code></span>' +
        '<em>' + e(label) + '</em>';
      if (repo) {
        rows.push('<a class="gh-rel-cmp-item" href="' + e(repo.replace(/\/+$/, '') + '/compare/' + base + '...' + head) + '" target="_blank" rel="noopener noreferrer nofollow">' + inner + '</a>');
      } else {
        rows.push('<button type="button" class="gh-rel-cmp-item" data-act="toast" data-msg="作者未登记仓库，无法生成对比链接">' + inner + '</button>');
      }
    }
    if (rel.older) row(rel.older.tag, rel.v.tag, '与上一版比较');
    if (rel.idx > 0) row(rel.v.tag, rel.list[0].tag, '与最新版比较');
    if (repo) {
      rows.push('<a class="gh-rel-cmp-all" href="' + e(repo.replace(/\/+$/, '') + '/releases') + '" target="_blank" rel="noopener noreferrer nofollow">在 GitHub 查看全部版本</a>');
    }
    return '<details class="gh-rel-cmp"><summary class="gh-rel-cmp-sum">' + icon('branch') +
      '<span>Compare</span><span class="gh-caret">▾</span></summary>' +
      '<div class="gh-rel-cmp-menu"><div class="gh-rel-cmp-hd">选择对比范围</div>' +
      (rows.length ? rows.join('') : '<p class="gh-rel-cmp-empty">这是首个公开版本，暂无可对比版本。</p>') +
      '</div></details>';
  }

  function releaseHeader(ctx, p, rel) {
    var e = ctx.esc;
    var au = ctx.userOf(p.author);
    return '<div class="gh-rel-detail-hd"><div class="gh-rel-titleline"><h2 id="gh-rel-title">' + e(rel.v.tag) + '</h2>' +
      (rel.v.latest ? '<span class="gh-latest">Latest</span>' : '') +
      '<span class="gh-rel-headspacer"></span>' + compareMenu(ctx, p, rel) + '</div>' +
      '<div class="gh-rel-meta">' +
      '<span class="gh-rel-by">' + ctx.av(p.author, 22) + '<b>' + e(au.name || p.author) + '</b><span>发布</span></span>' +
      '<time datetime="' + e(rel.v.date) + '" title="' + e(rel.v.date) + '">' + e(relativeDate(rel.v.date)) + '</time>' +
      '<span class="gh-rel-chip">' + icon('tag') + e(rel.v.tag) + '</span>' +
      '<span class="gh-rel-commit" title="演示用提交号">' + icon('branch') + '<code>' + e(shortShaFor(p, rel.v.tag)) + '</code>' +
      '<span class="gh-rel-check" title="构建通过">' + icon('check') + '</span></span>' +
      '</div></div>';
  }

  function releaseAssets(ctx, p, rel) {
    var e = ctx.esc;
    var repo = ctx.repoHref(p.repo);
    var n = 0;
    var rows = [];
    if (rel.v.latest && p.file && p.file.name) {
      n++;
      rows.push(repo
        ? '<a class="gh-rel-asset" href="' + e(repo.replace(/\/+$/, '') + '/releases/download/' + rel.v.tag + '/' + p.file.name) + '" target="_blank" rel="noopener noreferrer nofollow" title="文件在作者仓库，点开去取">' +
          icon('download') + '<span>' + e(p.file.name) + '</span><em>' + e(p.file.size) + '</em></a>'
        : '<span class="gh-rel-asset" aria-disabled="true" title="包信息已登记，作者没有填仓库地址">' +
          icon('download') + '<span>' + e(p.file.name) + '</span><em>无来源</em></span>');
      if (p.file.sha) {
        n++;
        rows.push('<button type="button" class="gh-rel-asset" data-act="sha" data-sha="' + e(p.file.sha) + '" title="点击复制完整 sha256">' +
          icon('shield') + '<span>sha256</span><em>' + e(String(p.file.sha).slice(0, 9)) + '…</em></button>');
      }
    }
    if (repo) {
      n++;
      rows.push('<a class="gh-rel-asset" href="' + e(repo.replace(/\/+$/, '') + '/archive/refs/tags/' + rel.v.tag + '.zip') + '" target="_blank" rel="noopener noreferrer nofollow">' +
        icon('code') + '<span>Source code (zip)</span><em>tag ' + e(rel.v.tag) + '</em></a>');
    }
    return '<section class="gh-rel-assets" aria-label="附件">' +
      '<div class="gh-rel-assets-hd"><b>Assets</b><span>' + n + '</span></div>' +
      (rows.length ? '<div class="gh-rel-asset-list">' + rows.join('') + '</div>' : '<p class="gh-rel-asset-empty">作者未登记仓库或安装包，这个版本没有可下载的附件。</p>') +
      '<p class="gh-rel-assets-hint">' + (rel.v.latest
        ? (p.file ? '下载后请核对 sha256；安装包由作者仓库提供，本站不托管文件。' : '这个版本没有登记安装包，只保留源码入口。')
        : '历史版本未登记安装包；源码可在作者仓库对应 tag 查看。') + '</p></section>';
  }

  function releaseChangelog(ctx, p, rel) {
    var e = ctx.esc;
    var repo = ctx.repoHref(p.repo);
    if (!rel.older) {
      return '<div class="gh-rel-changelog"><span class="gh-rel-first">这是目前登记的最早版本，没有更早的对比基线。</span></div>';
    }
    var range = rel.older.tag + '...' + rel.v.tag;
    var body = 'Full Changelog: <code>' + e(range) + '</code>';
    return '<div class="gh-rel-changelog">' +
      (repo
        ? '<a href="' + e(repo.replace(/\/+$/, '') + '/compare/' + range) + '" target="_blank" rel="noopener noreferrer nofollow">' + body + '</a>'
        : '<button type="button" class="gh-rel-changelog-btn" data-act="toast" data-msg="作者未登记仓库，无法生成 Changelog 链接">' + body + '</button>') +
      '</div>';
  }

  function releasesPane(ctx, p) {
    var e = ctx.esc;
    var rel = releaseOf(ctx.S, p);
    var vs = rel.list;
    var newer = rel.newer;
    var older = rel.older;
    var items = vs.map(function (v, i) {
      var on = i === rel.idx;
      return '<li><button type="button" class="gh-rel-item' + (on ? ' on' : '') + '" data-act="ghrel" data-tag="' + e(v.tag) + '"' +
        (on ? ' aria-current="true"' : '') + '>' +
        '<span class="gh-rel-item-main"><b>' + e(v.tag) + '</b><span>' + e(v.date) + '</span></span>' +
        (v.latest ? '<i class="gh-rel-dot" title="最新版本" aria-label="最新版本"></i>' : '') +
        '</button></li>';
    }).join('');
    return '<div class="gh-relpage" id="gh-releases">' +
      '<div class="gh-page-head"><div><h2>版本发布</h2>' +
      '<p>作者共登记 ' + vs.length + ' 个版本；左侧切换版本，右侧查看说明、附件与 Changelog。当前为 ' + e(rel.v.tag) + '。</p></div>' +
      (p.pkg ? '<button type="button" class="gh-btn gh-btn-primary" data-act="ghcopy" data-cmd="pnpm dsh add ' + e(p.pkg) + '">' +
        icon('copy') + '复制安装命令</button>' : '') + '</div>' +
      '<div class="gh-rel-layout">' +
      '<aside class="gh-rel-side" aria-label="版本列表">' +
      '<div class="gh-rel-side-hd"><span>Release list</span><em>' + vs.length + '</em></div>' +
      '<ol class="gh-rel-list">' + items + '</ol>' +
      '<div class="gh-rel-pager">' +
      '<button type="button" class="gh-rel-pager-btn" data-act="ghrel" data-tag="' + e(newer ? newer.tag : '') + '"' + (newer ? '' : ' disabled') + ' aria-label="较新版本">‹ 较新</button>' +
      '<button type="button" class="gh-rel-pager-btn" data-act="ghrel" data-tag="' + e(older ? older.tag : '') + '"' + (older ? '' : ' disabled') + ' aria-label="较旧版本">较旧 ›</button>' +
      '</div></aside>' +
      '<article class="gh-rel-detail" id="gh-rel-detail" tabindex="-1" aria-labelledby="gh-rel-title">' +
      releaseHeader(ctx, p, rel) + relNotes(ctx, p, rel) + releaseAssets(ctx, p, rel) + releaseChangelog(ctx, p, rel) +
      '</article></div></div>';
  }

  function issueRow(ctx, p, it, openId) {
    var e = ctx.esc;
    var isOpen = openId === it.id;
    return '<div class="gh-issue' + (it.state === 'closed' ? ' closed' : '') + '">' +
      '<button type="button" class="gh-issue-row" data-act="ghissue" data-id="' + e(it.id) + '" aria-expanded="' + isOpen + '">' +
      '<span class="gh-issue-state ' + it.state + '">' + icon(it.state === 'open' ? 'issue' : 'check') + '</span>' +
      '<span class="gh-issue-main"><b>' + e(it.title) + '</b>' +
      '<span class="gh-issue-meta">#' + it.num + ' · ' + (it.state === 'open' ? '打开' : '已关闭') + ' ' + e(it.opened) +
      ' · ' + e(ctx.userOf(it.author).name) + ' · ' + it.comments + ' 条回复</span></span>' +
      '<span class="gh-labels">' + it.labels.map(function (l) { return issueLabelWith(ctx, l); }).join('') + '</span>' +
      '</button>' +
      (isOpen ? '<div class="gh-issue-detail">' +
        '<div class="gh-comment"><span class="gh-comment-av">' + ctx.av(it.author, 28) + '</span>' +
        '<div class="gh-comment-main"><div class="gh-comment-hd"><b>' + e(ctx.userOf(it.author).name) + '</b><span>' + e(it.opened) + '</span></div>' +
        '<div class="gh-comment-body">' + e(it.body).replace(/\n/g, '<br>') + '</div></div></div>' +
        '<div class="gh-comment"><span class="gh-comment-av">' + ctx.av(p.author, 28) + '</span>' +
        '<div class="gh-comment-main"><div class="gh-comment-hd"><b>' + e(ctx.userOf(p.author).name) + '</b><span>维护者</span></div>' +
        '<div class="gh-comment-body">' + (it.state === 'open' ? '收到，我先按这个环境复现。麻烦补一下 DSH 版本和插件列表截图。' : '已处理，下个版本会写进更新说明。感谢反馈。') + '</div></div></div>' +
        '</div>' : '') +
      '</div>';
  }
  function issueLabelWith(ctx, name) {
    ESC = ctx.esc;
    return issueLabel(name);
  }

  function issuesPane(ctx, p) {
    var S = ctx.S;
    var all = issuesOf(ctx, p);
    var filter = S.ghIssueFilter || 'open';
    var openN = all.filter(function (x) { return x.state === 'open'; }).length;
    var closedN = all.length - openN;
    var list = filter === 'all' ? all : all.filter(function (x) { return x.state === filter; });
    return '<div class="gh-page-head"><div><h2>议题</h2>' +
      '<p>问题、兼容性与需求都收在这里；演示站点不接真实工单。</p></div>' +
      '<button type="button" class="gh-btn gh-btn-primary" data-act="toast" data-msg="演示站点：议题提交未开放">' +
      icon('issue') + '新建议题</button></div>' +
      '<div class="gh-filters" role="group" aria-label="议题状态筛选">' +
      '<button type="button" class="gh-filter' + (filter === 'open' ? ' on' : '') + '" data-act="ghissuefilter" data-f="open" aria-pressed="' + (filter === 'open') + '">' +
      icon('issue') + 'Open <b>' + openN + '</b></button>' +
      '<button type="button" class="gh-filter' + (filter === 'closed' ? ' on' : '') + '" data-act="ghissuefilter" data-f="closed" aria-pressed="' + (filter === 'closed') + '">' +
      icon('check') + 'Closed <b>' + closedN + '</b></button>' +
      '<button type="button" class="gh-filter' + (filter === 'all' ? ' on' : '') + '" data-act="ghissuefilter" data-f="all" aria-pressed="' + (filter === 'all') + '">全部 <b>' + all.length + '</b></button>' +
      '</div>' +
      '<div class="gh-issues">' + (list.length ? list.map(function (it) {
        return issueRow(ctx, p, it, S.ghIssueOpen || '');
      }).join('') : '<div class="gh-empty">' + icon('issue') + '<b>这一栏没有议题</b><span>切到「全部」看看其他状态。</span></div>') + '</div>';
  }

  function discussionsPane(ctx, p) {
    var e = ctx.esc;
    var rel = (ctx.threads || []).filter(function (x) { return x.plugin === p.id; });
    var feed = (ctx.posts || []).filter(function (x) { return x.plugin === p.name; });
    var rows = rel.map(function (t) {
      var u = ctx.userOf(t.user);
      return '<button type="button" class="gh-disc-row" data-act="thread" data-id="' + e(t.id) + '">' +
        '<span class="gh-disc-ic">' + icon('comment') + '</span>' +
        '<span class="gh-disc-main"><b>' + e(t.title) + '</b><span>' + e(t.sub || t.excerpt || '') + '</span></span>' +
        '<span class="gh-disc-meta"><b>' + ctx.num(t.replies) + '</b> 回复 · ' + e(u.name) + ' · ' + e(t.last || t.created) + '</span>' +
        '</button>';
    }).join('');
    var posts = feed.map(function (x) {
      return '<button type="button" class="gh-disc-row" data-act="go" data-route="feed">' +
        '<span class="gh-disc-ic">' + icon('arrow') + '</span>' +
        '<span class="gh-disc-main"><b>' + e(String(x.text).slice(0, 40)) + (String(x.text).length > 40 ? '…' : '') + '</b>' +
        '<span>' + e(ctx.userOf(x.user).name) + ' · ' + e(x.time) + ' · 来自日志流</span></span>' +
        '<span class="gh-disc-meta">查看日志</span></button>';
    }).join('');
    return '<div class="gh-page-head"><div><h2>讨论</h2>' +
      '<p>和这个插件相关的帖子与日志，发在社群里的会出现在这里。</p></div>' +
      '<button type="button" class="gh-btn gh-btn-primary" data-act="go" data-route="forum">' +
      icon('comment') + '去社群开帖</button></div>' +
      (rows || posts
        ? '<div class="gh-discs">' + rows + posts + '</div>'
        : '<div class="gh-empty gh-empty-lg">' + icon('comment') + '<b>还没有人聊过这个插件</b>' +
          '<span>装完遇到问题，或者想分享用法，都可以去社群开个帖。</span>' +
          '<button type="button" class="gh-btn" data-act="go" data-route="forum">去社群 ›</button></div>');
  }

  function securityPane(ctx, p) {
    var e = ctx.esc;
    var t = ctx.tierOf(p);
    var m = ctx.mirrorOf(p);
    var sha = p.file && p.file.sha ? p.file.sha : '';
    return '<div class="gh-page-head"><div><h2>安全</h2>' +
      '<p>许可证、安装包校验与分发授权，都放在同一页说清楚。</p></div></div>' +
      (p.license
        ? '<div class="gh-sec-banner ok">' + icon('shield') + '<div><b>许可证已声明：' + e(licName(p)) + '</b>' +
          '<span>使用、修改与分发请遵守许可证全文；本站只登记信息，不代替作者授权。</span></div></div>'
        : '<div class="gh-sec-banner info">' + icon('shield') + '<div><b>作者仓库里没有 LICENSE</b>' +
          '<span>没写许可证时按默认保留所有权利处理，能不能用要直接问作者；本站不放安装包、不代为转载，只保留条目与外链。</span></div></div>') +
      '<div class="gh-sec-grid">' +
      '<section class="gh-sec-card"><h3>安装包校验</h3><dl class="gh-kv">' +
      '<dt>文件</dt><dd>' + (p.file ? e(p.file.name) + ' · ' + e(p.file.size) : '未登记安装包') + '</dd>' +
      '<dt>版本</dt><dd>' + (p.ver ? 'v' + e(p.ver) : '未登记（外链）') + '</dd>' +
      '<dt>登记日期</dt><dd>' + e((p.file && p.file.at) || '—') + '</dd>' +
      '<dt>sha256</dt><dd class="gh-mono">' + (sha ? e(sha) : '—') + '</dd>' +
      '</dl>' + (sha ? '<button type="button" class="gh-mini" data-act="sha" data-sha="' + e(sha) + '">' + icon('copy') + '复制 sha256</button>' : '') +
      '</section>' +
      '<section class="gh-sec-card"><h3>分发授权</h3><dl class="gh-kv">' +
      '<dt>收录档位</dt><dd>' + e(ctx.tierLabel[t] || t) + '</dd>' +
      '<dt>来源</dt><dd>' + e(p.source === 'author' ? '作者登记' : p.source === 'mirror' ? '社群转载登记' : '未登记') + '</dd>' +
      '<dt>更新方式</dt><dd>' + e(m === 'auto' ? '跟随上游 tag 更新' : m === 'manual' ? '作者手动登记' : '未开启展示') + '</dd>' +
      '<dt>新鲜度</dt><dd>' + e(p.freshness === 'synced' ? '与上游同步' : p.freshness === 'manual' ? '作者手动维护' : p.freshness === 'stale' ? '可能落后于上游' : '未同步') + '</dd>' +
      '<dt>收录日期</dt><dd>' + e(p.collected) + '</dd>' +
      '</dl></section>' +
      '<section class="gh-sec-card"><h3>发现侵权或恶意代码？</h3>' +
      '<p>举报会在 24 小时内撤掉对应的安装包信息与取包入口，条目保留；处理结果在政策页公示。</p>' +
      '<button type="button" class="gh-btn gh-btn-danger" data-act="rep" data-id="' + e(p.id) + '">' +
      icon('shield') + '举报这个条目</button>' + ctx.reportPanel(p) +
      '</section>' +
      '</div>';
  }

  function insightsPane(ctx, p) {
    var e = ctx.esc, S = ctx.S;
    var st = ctx.pkgStats && ctx.pkgStats[p.id];
    var rel = (ctx.threads || []).filter(function (x) { return x.plugin === p.id; }).length;
    var feedN = (ctx.posts || []).filter(function (x) { return x.plugin === p.name; }).length;
    var issues = issuesOf(ctx, p);
    var stats = [
      ['点赞', ctx.num(likeCount(S, p)), '给这个条目点过赞的人数'],
      ['收藏', ctx.num(favCount(S, p)), '收藏这个插件的人数'],
      ['安装', ctx.num(p.installs), '条目库累计安装量'],
      ['7 日安装', st ? ctx.num(st.downloads) : '—', st ? '最近 7 天合计' : '暂无按日数据'],
      /* 和「议题」标签的红点同源：那里列几条未结，这里就写几条；
         不要一边显示 3 条、一边拿 pkgStats 的另一个口径写 12，读起来像两套数据。 */
      ['议题', String(issues.filter(function (x) { return x.state === 'open'; }).length), '本页展示的未结议题'],
      ['讨论', String(rel + feedN), '社群里的相关帖子与日志']
    ];
    return '<div class="gh-page-head"><div><h2>洞察</h2>' +
      '<p>这个页面的数字来自条目库演示数据；没有按日数据时不会编一条曲线。</p></div></div>' +
      '<div class="gh-stats">' + stats.map(function (x) {
        return '<div class="gh-stat"><span>' + e(x[0]) + '</span><b>' + e(x[1]) + '</b><em>' + e(x[2]) + '</em></div>';
      }).join('') + '</div>' +
      '<section class="gh-sec-card gh-traffic"><div class="gh-sec-hd"><h3>近 7 天安装</h3>' +
      '<span>' + (st ? '合计 ' + ctx.num(st.week.reduce(function (a, b) { return a + b; }, 0)) + ' 次' : '暂无数据') + '</span></div>' +
      (st ? '<div class="gh-bars">' + st.week.map(function (v, i) {
        var max = Math.max.apply(null, st.week) || 1;
        return '<div class="gh-bar"><i style="height:' + Math.max(6, Math.round(v / max * 100)) + '%" title="' + v + ' 次"></i>' +
          '<span>' + ['一', '二', '三', '四', '五', '六', '日'][i] + '</span></div>';
      }).join('') + '</div>' : '<p class="gh-muted">这个条目没有公开的按日安装记录，因此这里只显示累计安装量。</p>') +
      '</section>' +
      '<div class="gh-sec-grid">' +
      '<section class="gh-sec-card"><h3>语言构成</h3><div class="gh-langbar">' +
      languagesOf(p).map(function (l) { return '<i style="width:' + l.pct + '%;background:' + l.color + '" title="' + e(l.name) + ' ' + l.pct + '%"></i>'; }).join('') +
      '</div><ul class="gh-langs">' + languagesOf(p).map(function (l) {
        return '<li><i style="background:' + l.color + '"></i>' + e(l.name) + ' <b>' + l.pct + '%</b></li>';
      }).join('') + '</ul></section>' +
      '<section class="gh-sec-card"><h3>贡献者</h3><ul class="gh-contribs">' +
      contributorsOf(ctx, p).map(function (uid) {
        return '<li>' + ctx.av(uid, 30) + '<span><b>' + e(ctx.userOf(uid).name) + '</b>' +
          '<em>' + (uid === p.author ? '维护者' : '社群编辑') + '</em></span></li>';
      }).join('') + '</ul></section>' +
      '</div>';
  }

  function collections(ctx, p) {
    var e = ctx.esc;
    var vs = versionsOf(p);
    var langs = languagesOf(p);
    var contribs = contributorsOf(ctx, p);
    var rp = repoParts(p);
    var repo = ctx.repoHref(p.repo);
    var home = ctx.repoHref(p.homepage);
    var t = ctx.tierOf(p);
    return '<aside class="gh-side" aria-label="仓库信息">' +
      '<section class="gh-side-card"><h2>About</h2>' +
      '<p class="gh-about-desc">' + e(p.desc) + '</p>' +
      (home ? '<a class="gh-side-link" href="' + e(home) + '" target="_blank" rel="noopener noreferrer nofollow">' + icon('link') + e(p.homepage) + '</a>' : '') +
      (repo ? '<a class="gh-side-link" href="' + e(repo) + '" target="_blank" rel="noopener noreferrer nofollow">' + icon('code') + e(rp.label) + '</a>' : '') +
      '<div class="gh-side-topics">' + (p.tags || []).map(function (x) { return '<span class="gh-topic">' + e(x) + '</span>'; }).join('') + '</div>' +
      '<dl class="gh-kv gh-about-kv">' +
      '<dt>许可证</dt><dd><button type="button" class="gh-kv-link" data-act="ghdoc" data-doc="license" title="打开许可证页">' + e(licName(p) || '仓库未标注 · 看原文') + '</button></dd>' +
      '<dt>收藏</dt><dd>' + ctx.num(favCount(ctx.S, p)) + '</dd>' +
      '<dt>安装</dt><dd>' + ctx.num(p.installs) + '</dd>' +
      '<dt>收录</dt><dd>' + e(p.collected) + '</dd>' +
      '</dl></section>' +
      /* v43 · 「维护者」整张卡撤掉：作者头像 + 昵称已经提到页面头部插件图标的左边（见 header()），
         标题里还有 owner 段、Contributors 首位也标着「维护者」，同一份信息不必在右栏再说一遍。
         右栏现在从 About 直接进 Contributors。 */
      '<section class="gh-side-card"><div class="gh-side-hd"><h2>Contributors</h2><span>' + contribs.length + '</span></div>' +
      '<ul class="gh-contribs">' + contribs.map(function (uid) {
        return '<li>' + ctx.av(uid, 26) + '<span><b>' + e(ctx.userOf(uid).name) + '</b><em>' + (uid === p.author ? '维护者' : '编辑') + '</em></span></li>';
      }).join('') + '</ul></section>' +
      '<section class="gh-side-card"><div class="gh-side-hd"><h2>Releases</h2><button type="button" class="gh-side-more" data-act="ghtab" data-tab="releases">全部</button></div>' +
      '<ul class="gh-side-list">' + vs.slice(0, 2).map(function (v) {
        return '<li><button type="button" class="gh-side-release" data-act="ghtab" data-tab="releases" data-tag="' + e(v.tag) + '">' + icon('tag') +
          '<span><b>' + e(v.tag) + '</b><em>' + e(v.date) + '</em></span>' + (v.latest ? '<i class="gh-latest">Latest</i>' : '') + '</button></li>';
      }).join('') + '</ul></section>' +
      '<section class="gh-side-card"><div class="gh-side-hd"><h2>Packages</h2></div>' +
      (t !== 'entry'
        ? '<div class="gh-package">' + icon('download') + '<span><b>' + e(p.pkg) + '</b><em>' + (p.ver ? 'v' + e(p.ver) : '外链') + '</em></span></div>'
        : '<p class="gh-side-empty">No packages published</p>') + '</section>' +
      '<section class="gh-side-card"><div class="gh-side-hd"><h2>Languages</h2></div>' +
      '<div class="gh-langbar">' + langs.map(function (l) { return '<i style="width:' + l.pct + '%;background:' + l.color + '"></i>'; }).join('') + '</div>' +
      '<ul class="gh-langs">' + langs.map(function (l) {
        return '<li><i style="background:' + l.color + '"></i>' + e(l.name) + ' <b>' + l.pct + '%</b></li>';
      }).join('') + '</ul></section>' +
      '</aside>';
  }

  /* --------------------------------------------------------------------------
     外链条目（tier=link 且还没被作者认领）
     --------------------------------------------------------------------------
     这类条目鲸域只有「条目信息」：名字、分类、描述、仓库地址、Star、许可证。
     我们没有镜像代码、没有解析仓库，所以不能给这个仓库编造提交记录、议题、
     发布说明和安装包 sha256 —— 那会把「只挂外链」说成「本站有包」。
     认领校验通过（claimed=1）之后，插件页自动回到完整的仓库视图。 */
  /* npm 下载入口的地址。
     只有后端核对过 registry、确认这个包真的存在（pluginShape 的 p.npm）才返回链接：
     索引里 6716 条 slug 有约四成在 npm 上查不到（作者只挂了 GitHub、改了名或私有包），
     无条件拼 npmjs.com/package/<slug> 会得到四成 404 —— 点开 404 比没有这颗按钮更糟。
     包名就用 slug：DSH 生态的安装约定是 pnpm dsh add <slug>。 */
  function npmHref(p) {
    if (!p || !p.npm || !p.npm.name) return '';
    return 'https://www.npmjs.com/package/' + encodeURIComponent(p.npm.name);
  }

  /* 下载量按中文习惯缩写：目录里的 dl 是近 30 天下载数，动辄七位数，原样写会把 title 撑爆 */
  function fmtDl(n) {
    n = Number(n) || 0;
    if (n >= 100000) return Math.round(n / 10000) + ' 万';
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return String(n);
  }

  /* 包名从哪来：① awesome-dsh-plugin.com 目录（后端 install 字段，真实发版包名）
     ② plugin_npm 核对结果（registry 上有这个包）③ 都没有才按仓库名推断。
     为什么非要目录那一路：仓库名和包名经常不是一回事 —— api-relay-audit 的真实包名是
     dsh-api-relay-audit，dsh-market 的是 dshmarket。按 slug 拼出来的命令粘进终端就是
     404，而这颗按钮的全部价值就是「粘上去就能装」。 */
  function npmPkg(p) {
    var ins = (p && p.install) || null;
    if (ins && ins.pkg) {
      return {
        pkg: ins.pkg,
        src: 'catalog',
        ver: (p && p.npm && p.npm.version) || '',
        dl: ins.dl || 0,
        cmd: ins.cmd || '',
        /* 目录自己标了 npm=1，或后端核对过 registry —— 两种都算「这个包在 npm 上」 */
        onNpm: !!(ins.npm || (p && p.npm && p.npm.name))
      };
    }
    var q = String((p && p.npm && p.npm.name) || (p && (p.pkg || p.name)) || '').trim();
    if (!q) return null;
    return {
      pkg: q,
      src: (p && p.npm && p.npm.name) ? 'registry' : 'guess',
      ver: (p && p.npm && p.npm.version) || '',
      dl: 0,
      cmd: '',
      onNpm: !!(p && p.npm && p.npm.name)
    };
  }

  /* npm 胶囊：位置在「复制仓库地址」右侧 —— 读者拿到仓库地址，下一个问题就是「去哪装」。
     形态只有一种：可复制的安装命令（v51 起）。包页不再占这颗按钮：命令是能直接用的一步，
     包页只是「想看看再决定」的第二步，挪到下面元信息表的 npm 一行更合适。 */
  function npmPill(ctx, p) {
    var e = (ctx && ctx.esc) || function (s) { return String(s == null ? '' : s); };
    var info = npmPkg(p);
    if (!info) return '';
    var cmd = 'npm i ' + info.pkg;
    var note = info.src === 'catalog'
      ? '包名取自 awesome-dsh-plugin.com 目录' +
        (info.dl ? '（近 30 天下载 ' + fmtDl(info.dl) + '）' : '') +
        (info.cmd ? '；站方写法 ' + info.cmd : '')
      : (info.src === 'registry' ? '包名已在本站 npm registry 核对' : '包名按仓库名推断，本站没在 npm registry 核到');
    return '<button type="button" class="gh-btn gh-btn-npm gh-btn-npm-cmd" data-act="ghcopy"' +
      ' data-cmd="' + e(cmd) + '" title="复制安装命令：' + e(cmd) + '（' + e(note) + '）">' +
      icon('copy') + '<span class="npm-cmd">' + e(cmd) + '</span>' +
      (info.ver ? '<em class="npm-ver">v' + e(info.ver) + '</em>' : '') +
      '</button>';
  }

  function linkShell(ctx, p, u) {
    var e = ctx.esc;
    var rp = repoParts(p);
    /* 进来就去要 README：外链条目没有别的正文，读者最想看的就是这份说明 */
    loadReadme(ctx, p);
    var repo = p.repo || (rp ? 'https://github.com/' + rp.owner + '/' + rp.name : '');
    var repoLabel = rp ? rp.owner + ' / ' + rp.repo : (repo || '未登记仓库');
    /* 包页放到元信息表里：想先看一眼再装的人有地方去，又不和「复制命令」抢那颗按钮。
       只有确实发在 npm 上（目录标了 npm=1 或本站核对过 registry）才给链接 —— 点开 404
       比没有链接更伤信任。 */
    var npmInfo = npmPkg(p);
    var npmRow = (npmInfo && npmInfo.onNpm)
      ? ['npm', '<a href="https://www.npmjs.com/package/' + encodeURIComponent(npmInfo.pkg) +
          '" target="_blank" rel="noopener noreferrer">' + e(npmInfo.pkg) + ' ↗</a>']
      : null;
    var rows = [
      ['仓库', repo ? '<a href="' + e(repo) + '" target="_blank" rel="noopener noreferrer">' + e(repoLabel) + ' ↗</a>' : '未登记'],
      ...(npmRow ? [npmRow] : []),
      ['分类', e(p.cat || '未分类')],
      ['Star', p.stars ? String(p.stars) : '—'],
      /* 没有许可证时不再写「以作者仓库为准」——那句话等于什么都没说。
         改成「仓库未标注」，并且是可点的：点了直接打开许可证页（我们抓过这个仓库的 LICENSE
         就有原文，没抓到就给本站整理的「没有许可证意味着什么」）。 */
      ['许可证', p.license
        ? e(licName(p))
        : '<button type="button" class="lnk-kv-link" data-act="rdkind" data-plugin="' + e(p.id) + '" data-kind="license" data-repo="' + e(repo) + '">仓库未标注 · 看原文</button>'],
      ...(p.collected ? [['收录时间', e(p.collected)]] : []),
      ['认领状态', '未认领 · 条目信息由鲸域索引整理']
    ];
    var kv = rows.map(function (r) {
      return '<div class="lnk-row"><span class="lnk-k">' + r[0] + '</span><span class="lnk-v">' + r[1] + '</span></div>';
    }).join('');
    return '<div class="gh-shell"><div class="gh-repo" data-plugin="' + e(p.id) + '">' +
      '<div class="lnk-hero">' +
        '<div class="lnk-ic">' + e(p.icon || '🧩') + '</div>' +
        '<div class="lnk-tx">' +
          '<div class="lnk-badges"><span class="lnk-badge">↗ 外链</span><span class="lnk-badge">未认领</span>' +
            (licName(p) ? '<span class="lnk-badge">' + e(licName(p)) + '</span>' : '<span class="lnk-badge lnk-badge-none">许可未标注</span>') +
            '<span class="lnk-badge">' + e(p.cat || '未分类') + '</span></div>' +
          '<h1 class="lnk-name">' + e(p.name) + '</h1>' +
          '<p class="lnk-desc">' + e(p.desc || '这个条目还没有写描述。') + '</p>' +
          '<div class="lnk-acts">' +
            (repo ? '<a class="gh-btn gh-btn-primary" href="' + e(repo) + '" target="_blank" rel="noopener noreferrer">去 GitHub 仓库 ↗</a>' : '') +
            (repo ? '<button type="button" class="gh-btn" data-act="ghcopy" data-cmd="' + e(repo) + '">复制仓库地址</button>' : '') +
            /* npm 胶囊紧贴「复制仓库地址」右边：仓库地址拿到手，下一个问题就是「去哪装」 */
            npmPill(ctx, p) +
            '<button type="button" class="gh-btn" data-act="go" data-route="claim" data-id="' + e(p.id) + '">我是作者，认领</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="lnk-grid"><div class="lnk-kv">' + kv + '</div>' +
        '<div class="lnk-note">' +
          '<b>这个条目现在只有外链</b>' +
          '<p>鲸域不镜像代码、不解析仓库，也不登记安装包。安装方式、版本号、许可证与安全说明都以作者仓库为准 —— 先看 README，再决定装不装。</p>' +
          '<p>' + e(p.why || '作者还没来鲸域认领：这里只挂 GitHub 外链，安装包、版本与许可证以作者仓库为准。') + '</p>' +
          '<b style="margin-top:10px">作者认领后会多出什么</b>' +
          '<ul class="lnk-todo"><li>版本与发布记录（含 tag 与时间）</li><li>README 与文件树</li><li>安装包与 sha256 校验值</li><li>本站的议题与讨论区</li></ul>' +
          '<p class="lnk-foot">认领方式：用鲸域账号进入认领页，把验证串写进仓库 README 或提一个 Issue，我们读仓库原文校验通过后，条目作者就变成你本人。</p>' +
        '</div>' +
      '</div>' +
      readmeCard(ctx, p) +
      '</div></div>';
  }

  function html(ctx) {
    ESC = ctx.esc;
    var p = ctx.p;
    var u = ctx.u || ctx.userOf(p.author);
    var S = ctx.S;
    /* 外链条目没有仓库视图可给：直接走真实外链面板，不编造提交/议题/发布 */
    if (p.tier === 'link' && !(ctx.claimedOf ? ctx.claimedOf(p) : p.claimed)) return linkShell(ctx, p, u);
    var tab = TAB_KEYS.indexOf(S.entryTab) >= 0 ? S.entryTab : 'code';
    var issues = issuesOf(ctx, p);
    var rel = (ctx.threads || []).filter(function (x) { return x.plugin === p.id; }).length;
    var feedN = (ctx.posts || []).filter(function (x) { return x.plugin === p.name; }).length;
    var counts = {
      releases: versionsOf(p).length,
      issues: issues.filter(function (x) { return x.state === 'open'; }).length,
      discussions: rel + feedN
    };
    var pane;
    if (tab === 'releases') pane = releasesPane(ctx, p);
    else if (tab === 'issues') pane = issuesPane(ctx, p);
    else if (tab === 'discussions') pane = discussionsPane(ctx, p);
    else if (tab === 'security') pane = securityPane(ctx, p);
    else if (tab === 'insights') pane = insightsPane(ctx, p);
    else pane = codePane(ctx, p);

    return '<div class="gh-shell"><div class="gh-repo" data-plugin="' + ctx.esc(p.id) + '">' +
      header(ctx, p, u, counts) +
      renderTabs(ctx, tab, counts) +
      '<div class="gh-body' + (tab === 'releases' ? ' gh-body-rel' : '') + '"><div class="gh-main">' + pane + '</div>' +
      (tab === 'releases' ? '' : collections(ctx, p)) + '</div>' +
      '</div></div>';
  }

  /* --------------------------------------------------------------------------
     Compare 下拉的「点外面收起」
     -------------------------------------------------------------------------- */
  /* Compare 用的是原生 <details>：浏览器只在点 summary 时切 open，点页面别处
     不会收（Esc 也不收）。插件页每次重绘都会整块换掉 DOM，所以监听只能挂在
     document 上、且只挂一次；收起时直接摘 open 属性，不重绘、不丢滚动位置。 */
  function closeCompareMenus(except) {
    var open = document.querySelectorAll('details.gh-rel-cmp[open]');
    for (var i = 0; i < open.length; i++) {
      if (open[i] === except) continue;
      open[i].removeAttribute('open');
    }
  }
  function bindCompareDismiss() {
    if (typeof document === 'undefined' || bindCompareDismiss.done) return;
    bindCompareDismiss.done = true;
    /* 捕获阶段先收：不依赖 app.js 的点击委托有没有拦下这一下 */
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) { closeCompareMenus(null); return; }
      var box = t.closest('details.gh-rel-cmp');
      /* 点在菜单外面（也不是 summary）→ 收 */
      if (!box) { closeCompareMenus(null); return; }
      /* 菜单里选中了一条（对比项 / 全部版本）→ 收，留下一屏干净的结果 */
      if (t.closest('.gh-rel-cmp-item') || t.closest('.gh-rel-cmp-all')) closeCompareMenus(null);
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') closeCompareMenus(null);
    });
  }
  bindCompareDismiss();

  window.PluginPage = {
    html: html,
    tabs: TAB_KEYS.slice(),
    closeCompareMenus: closeCompareMenus,
    releases: function (p) {
      return versionsOf(p).map(function (v) { return v.tag; });
    }
  };
})();