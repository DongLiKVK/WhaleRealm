/* ================= 鲸域 · Markdown 渲染（零依赖） ================= */
/*
  用途：把作者仓库里的 README 原文渲染成条目页的正文。

  为什么自己写一个，而不是引 marked / markdown-it：
    · 站点前端零依赖、零构建（index.html 直接 <script>），引一个库就多一份 CDN 与版本负担；
    · 这里只需要 README 常见的那十几种语法，不需要插件生态；
    · 最关键的是安全边界要自己拿得准：README 是完全不可信的外部内容。

  安全做法（顺序很重要）：
    1. 先把整段文本按行切块，块级语法只由「行首特征」判断，不解析 HTML；
    2. 所有文本一律 esc() 转义后才拼进 HTML —— 原文里的 <script>、<img onerror=...>、
       <iframe> 全都会变成可见字符，不可能被执行；
    3. 链接与图片地址过 safeUrl() 白名单：只放行 http(s)、mailto 与站内锚点，
       javascript: / data: / vbscript: 一律丢弃（返回空串，渲染成纯文本）；
    4. 外链统一 target="_blank" rel="noopener noreferrer nofollow"。
  换句话说：输出里所有标签都是这个文件自己生成的，没有一处来自原文。
*/
(function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /* 反向：inline() 的入参是「已经 esc 过一次」的文本，行内代码/链接文字再 esc 就会变成
     &amp;amp;（页面上直接显示成 &amp;）。进来先还原成原文，最后统一再转义一次。 */
  var UNESC = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };
  function unesc(s) {
    return String(s == null ? '' : s).replace(/&(lt|gt|quot|#39|amp);/g, function (m) { return UNESC[m]; });
  }

  function joinUrl(base, rel) {
    var s = String(rel || '').trim();
    if (!s || !base) return s;
    s = s.replace(/^\.\//, '');
    if (s.indexOf('../') === 0) return '';
    return base + s;
  }

  /* 地址白名单：README 是不可信内容，javascript:/data: 不许进 href/src */
  function safeUrl(u, base, kind) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) {
      if (/^https?:/i.test(s)) return s;
      if (/^mailto:/i.test(s)) return kind === 'img' ? '' : s;
      return '';
    }
    if (s.charAt(0) === '#') return base ? base + s : s;
    if (s.indexOf('//') === 0) return 'https:' + s;
    if (s.charAt(0) === '/') return '';
    return joinUrl(base, s);
  }

  function attr(v) { return esc(v); }

  /* ---------- 行内语法 ---------- */
  function inline(s, ctx, sharedHeld) {
    /* sharedHeld：链接文字里可能嵌着图片（徽章 [![alt](img)](link) 就是这种），
       递归调用必须共用同一个占位符表，否则内层的占位符会被内层自己还原成空串。 */
    var held = sharedHeld || [];
    function hold(html) { held.push(html); return '\u0001' + (held.length - 1) + '\u0001'; }

    /* 入参来自 esc() 过的正文：先还原，最后（强调之前）统一转义一次，避免双重转义 */
    s = unesc(s);

    /* ① 行内代码先摘出来：里面的 * _ [ ] 不该被当成语法 */
    s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, function (m, tick, body) {
      return hold('<code>' + esc(body.replace(/^\s|\s$/g, '')) + '</code>');
    });

    /* ② 图片 ![alt](url "title")。URL 允许一层括号（维基链接常见 .../Foo_(bar)） */
    s = s.replace(/!\[([^\]]*)\]\(\s*([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\s*\)/g, function (m, alt, url, title) {
      var src = safeUrl(url, ctx.imgBase, 'img');
      if (!src) return hold('<span class="md-broken-img">🖼 ' + esc(alt || url) + '</span>');
      /* 生产 CSP 是 img-src 'self'，GitHub raw 在国内也不可达：图统一交给本站代理 */
      if (ctx.imgProxy) src = ctx.imgProxy(src) || src;
      return hold('<img class="md-img" src="' + attr(src) + '" alt="' + attr(alt || '') + '"' +
        (title ? ' title="' + attr(title) + '"' : '') + ' loading="lazy" decoding="async">');
    });

    /* ③ 链接 [text](url "title") */
    s = s.replace(/\[([^\]]*)\]\(\s*([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\s*\)/g, function (m, text, url, title) {
      var href = safeUrl(url, ctx.linkBase, 'link');
      var inner = text || url;
      if (!href) return hold(esc(inner));
      return hold('<a href="' + attr(href) + '" target="_blank" rel="noopener noreferrer nofollow"' +
        (title ? ' title="' + attr(title) + '"' : '') + '>' + inline(inner, ctx, held) + '</a>');
    });

    /* ④ 裸地址与尖括号地址（上一步已把正文还原成原文，这里匹配裸尖括号） */
    s = s.replace(/<(https?:\/\/[^\s>]+)>/g, function (m, url) {
      return hold('<a href="' + attr(url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(url) + '</a>');
    });

    /* ⑤ 反斜杠转义 */
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, function (m, c) { return hold(esc(c)); });

    /* ⑥ 剩下的是纯文本：转义一次（占位符是 \u0001 不会被 esc 动） */
    s = esc(s);

    /* ⑦ 强调：粗斜 → 粗 → 斜 → 删除线 */
    s = s.replace(/\*\*\*([^*\s][\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*\s][\s\S]*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\s][\s\S]*?)~~/g, '<del>$1</del>');
    s = s.replace(/__([^_\s][\s\S]*?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w_])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');

    /* ⑧ 还原占位符 */
    s = s.replace(/\u0001(\d+)\u0001/g, function (m, i) { return held[Number(i)] || ''; });
    return s;
  }

  /* ---------- 表格 ---------- */
  function isTableSep(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.indexOf('-') >= 0;
  }

  function splitRow(line) {
    var s = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
    var out = [], cur = '', esc2 = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (esc2) { cur += ch; esc2 = false; continue; }
      if (ch === '\\') { cur += ch; esc2 = true; continue; }
      if (ch === '|') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }

  function tableHTML(head, sep, rows, ctx) {
    var aligns = splitRow(sep).map(function (c) {
      var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
      return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
    });
    function cell(tag, txt, i) {
      var al = aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '';
      return '<' + tag + al + '>' + inline(esc(txt), ctx) + '</' + tag + '>';
    }
    return '<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
      splitRow(head).map(function (c, i) { return cell('th', c, i); }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + splitRow(r).map(function (c, i) { return cell('td', c, i); }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- 列表（支持一层嵌套） ---------- */
  function listHTML(items, ctx, ordered) {
    var out = ordered ? '<ol>' : '<ul>';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var body = it.text;
      var task = '';
      var m = body.match(/^\[([ xX])\]\s+([\s\S]*)$/);
      if (m) {
        task = '<span class="md-task" aria-hidden="true">' + (m[1] === ' ' ? '☐' : '☑') + '</span>';
        body = m[2];
      }
      out += '<li>' + task + inline(esc(body), ctx) +
        (it.children && it.children.length ? listHTML(it.children, ctx, it.childrenOrdered) : '') + '</li>';
    }
    return out + (ordered ? '</ol>' : '</ul>');
  }

  var RE_UL = /^(\s*)([-*+])\s+([\s\S]*)$/;
  var RE_OL = /^(\s*)(\d{1,9}[.)])\s+([\s\S]*)$/;
  var RE_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
  var RE_HEAD = /^\s{0,3}(#{1,6})\s+([\s\S]*?)\s*#*\s*$/;
  var RE_HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
  var RE_QUOTE = /^\s{0,3}>\s?/;

  function isBlockStart(line) {
    return RE_FENCE.test(line) || RE_HEAD.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) ||
      RE_UL.test(line) || RE_OL.test(line) || /^\s*\|/.test(line);
  }

  function blocks(lines, ctx) {
    var out = [], i = 0, n = lines.length;
    while (i < n) {
      var line = lines[i];

      if (!line.trim()) { i++; continue; }

      var f = line.match(RE_FENCE);
      if (f) {
        var fence = f[1], lang = f[2] || '', buf = [];
        var closeRe = new RegExp('^\\s{0,3}' + (fence.charAt(0) === '~' ? '~' : '`') + '{' + fence.length + ',}\\s*$');
        i++;
        while (i < n && !closeRe.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre class="md-code"' + (lang ? ' data-lang="' + attr(lang) + '"' : '') +
          '><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      var h = line.match(RE_HEAD);
      if (h) {
        var lv = h[1].length;
        out.push('<h' + lv + '>' + inline(esc(h[2]), ctx) + '</h' + lv + '>');
        i++; continue;
      }

      if (i + 1 < n && line.trim() && !isBlockStart(line)) {
        var nx = lines[i + 1];
        if (/^\s{0,3}=+\s*$/.test(nx)) { out.push('<h1>' + inline(esc(line.trim()), ctx) + '</h1>'); i += 2; continue; }
        if (/^\s{0,3}-{2,}\s*$/.test(nx)) { out.push('<h2>' + inline(esc(line.trim()), ctx) + '</h2>'); i += 2; continue; }
      }

      if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }

      if (RE_QUOTE.test(line)) {
        var qbuf = [];
        while (i < n && RE_QUOTE.test(lines[i])) { qbuf.push(lines[i].replace(RE_QUOTE, '')); i++; }
        out.push('<blockquote>' + blocks(qbuf, ctx) + '</blockquote>');
        continue;
      }

      if (line.indexOf('|') >= 0 && i + 1 < n && isTableSep(lines[i + 1])) {
        var head = line, sep = lines[i + 1], rows = [];
        i += 2;
        while (i < n && lines[i].trim() && lines[i].indexOf('|') >= 0) { rows.push(lines[i]); i++; }
        out.push(tableHTML(head, sep, rows, ctx));
        continue;
      }

      var isUl = RE_UL.test(line), isOl = !isUl && RE_OL.test(line);
      if (isUl || isOl) {
        var items = [], stack = [];
        var baseIndent = (isUl ? line.match(RE_UL)[1] : line.match(RE_OL)[1]).length;
        while (i < n) {
          var cur = lines[i];
          if (!cur.trim()) {
            var j = i + 1;
            while (j < n && !lines[j].trim()) j++;
            if (j < n && (RE_UL.test(lines[j]) || RE_OL.test(lines[j]))) { i = j; continue; }
            break;
          }
          var mu = cur.match(RE_UL), mo = mu ? null : cur.match(RE_OL);
          if (!mu && !mo) {
            if (items.length) items[items.length - 1].text += '\n' + cur.trim();
            i++; continue;
          }
          var indent = (mu ? mu[1] : mo[1]).length;
          /* 同层级换了列表类型（无序 → 有序）就是两个列表，不能并进同一个 <ul> */
          if (indent === baseIndent && (!!mu) !== !isOl && (!!mo) !== isOl) break;
          var text = mu ? mu[3] : mo[3];
          var node = { text: text, indent: indent, children: [], childrenOrdered: false };
          if (!stack.length || indent <= stack[stack.length - 1].indent) {
            while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
            items.push(node);
            if (stack.length && indent === stack[stack.length - 1].indent) stack[stack.length - 1] = node;
            else stack = [node];
          } else {
            var parent = stack[stack.length - 1];
            parent.children.push(node);
            parent.childrenOrdered = !!(mo && !mu);
            stack.push(node);
          }
          i++;
        }
        out.push(listHTML(items, ctx, !!isOl));
        continue;
      }

      var pbuf = [line];
      i++;
      while (i < n && lines[i].trim() && !isBlockStart(lines[i])) { pbuf.push(lines[i]); i++; }
      out.push('<p>' + pbuf.map(function (t) { return inline(esc(t.trim()), ctx); }).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  /* ---------- 常见 HTML 预处理 ----------
     README 里很常见用 HTML 做居中大图、徽章、<details> 折叠块。如果一律当文本转义，
     页面上就会出现一堆 &lt;p align=&quot;center&quot;&gt; 的乱码。
     这里只把「结构壳子」翻成等价的 markdown，图片/链接仍然走 safeUrl() 白名单；
     没列进来的标签保持原样，最后还是被 esc() 转义成可见字符，不会执行。 */
  var TICK = String.fromCharCode(96);
  var FENCE = TICK + TICK + TICK;

  function attrOf(tag, name) {
    var m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
    if (!m) return '';
    return (m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] || '').replace(/&amp;/g, '&').trim();
  }

  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, '');
  }

  function htmlToMd(line) {
    if (line.indexOf('<') < 0) return line;
    var s = line;

    /* 整段丢掉：脚本、样式、svg、iframe、video/audio（保留不了也不该留壳子） */
    s = s.replace(/<(script|style|svg|iframe|video|audio|object|embed)\b[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(script|style|svg|iframe|object|embed)\b[^>]*\/?>/gi, '');

    /* 图片与链接：先转成 markdown，交给后面的行内解析器统一处理与白名单校验 */
    s = s.replace(/<img\b[^>]*>/gi, function (tag) {
      var src = attrOf(tag, 'src'), alt = attrOf(tag, 'alt') || attrOf(tag, 'title');
      if (!src) return '';
      return '![' + alt.replace(/[\[\]]/g, '') + '](' + src + ')';
    });
    s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (m, attrs, inner) {
      var href = attrOf('<a ' + attrs + '>', 'href');
      var text = stripTags(inner).replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (!href) return text;
      /* 内层是 markdown 图片（上面的 <img> 已经转过）时不能剥方括号，
         否则徽章会退化成一行 ![alt](url) 的源码 */
      if (text.indexOf('![') >= 0) return '[' + text + '](' + href + ')';
      return '[' + text.replace(/[\[\]]/g, '') + '](' + href + ')';
    });

    /* 代码块 */
    s = s.replace(/<pre\b[^>]*>/gi, '\n' + FENCE + '\n').replace(/<\/pre>/gi, '\n' + FENCE + '\n');
    s = s.replace(/<code\b[^>]*>/gi, TICK).replace(/<\/code>/gi, TICK);

    /* 强调、删除线 */
    s = s.replace(/<(strong|b)\b[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
    s = s.replace(/<(em|i)\b[^>]*>/gi, '*').replace(/<\/(em|i)>/gi, '*');
    s = s.replace(/<(del|s|strike)\b[^>]*>/gi, '~~').replace(/<\/(del|s|strike)>/gi, '~~');

    /* 标题 */
    s = s.replace(/<h([1-6])\b[^>]*>/gi, function (m, lv) { return '\n' + new Array(Number(lv) + 1).join('#') + ' '; });
    s = s.replace(/<\/h[1-6]>/gi, '\n');

    /* 列表、分隔线、换行 */
    s = s.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
    s = s.replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');

    /* 表格：把单元格拍成一行 pipe 文本，避免整张表变成一堆转义标签 */
    s = s.replace(/<tr\b[^>]*>/gi, '\n').replace(/<\/(td|th)>/gi, ' | ').replace(/<(td|th)\b[^>]*>/gi, '| ');

    /* 只留内容、去掉壳子的容器类标签 */
    s = s.replace(/<\/?(p|div|picture|source|center|figure|figcaption|details|summary|section|article|header|footer|span|sub|sup|kbd|small|mark|abbr|font|u|nobr|wbr|tbody|thead|tfoot|table|caption|colgroup|col|blockquote)\b[^>]*>/gi, '');

    /* 跨行的 HTML 结构：<a href="..."> 与 </a> 常常各占一行，中间夹着 <picture>/<img>。
       图片和链接的正文已经在上面转成 markdown 了，剩下的这些「孤零零只剩标签」的行
       按 GitHub 的规矩本来就是不显示的原始 HTML 块，直接丢掉，免得页面上出现一行
       <a href="https://..."> 的源码。带文字的标签行不受影响。 */
    var only = s.trim();
    var isAutolink = /^<[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^<>\s]+>$/.test(only) ||
                     /^<mailto:[^<>\s]+>$/i.test(only) ||
                     /^<[^<>\s@]+@[^<>\s]+>$/.test(only);
    if (!isAutolink && /^(?:<[a-zA-Z\/!?][^>]*>\s*)+$/.test(only)) return '';
    return s;
  }

  function render(src, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars || 200000;
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    var cut = false;
    if (text.length > maxChars) { text = text.slice(0, maxChars); cut = true; }
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    /* HTML 预处理只作用于代码块之外的行，围栏里的原文一个字符都不许动；
       行内代码（`<div>` 这种）也要先摘出来，否则会被当成标签剥掉。 */
    var src2 = text.split('\n'), lines = [], inFence = false;
    for (var i = 0; i < src2.length; i++) {
      var L = src2[i];
      if (RE_FENCE.test(L)) { inFence = !inFence; lines.push(L); continue; }
      if (inFence) { lines.push(L); continue; }
      var spans = [];
      var masked = L.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, function (m) {
        spans.push(m);
        return '\u0002' + (spans.length - 1) + '\u0002';
      });
      var conv = htmlToMd(masked);
      if (spans.length) {
        conv = conv.replace(/\u0002(\d+)\u0002/g, function (m, idx) { return spans[Number(idx)] || ''; });
      }
      if (conv === L) { lines.push(L); continue; }
      var parts = conv.split('\n');
      for (var k = 0; k < parts.length; k++) lines.push(parts[k]);
    }

    var ctx = {
      imgBase: opts.imgBase || '',
      linkBase: opts.linkBase || '',
      imgProxy: typeof opts.imgProxy === 'function' ? opts.imgProxy : null,
    };
    var html = blocks(lines, ctx);
    if (cut) {
      html += '<p class="md-cut">内容太长，这里只显示前 ' + Math.round(maxChars / 1000) + ' 千字；完整说明请看仓库原文。</p>';
    }
    return html;
  }

  window.MD = { render: render, esc: esc, safeUrl: safeUrl };
})();
