// ==UserScript==
// @name         Site Skeleton Extractor (for redesign agents)
// @namespace    https://example.local/site-skeleton
// @version      1.0.0
// @description  Extracts a page's structure, layout, design tokens and components into Markdown/JSON for an AI agent. Click the floating button or press Alt+Shift+S.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  // ------------------------------------------------------------------ config
  const CONFIG = {
    maxDepth: 9,        // max DOM depth in the skeleton tree
    maxNodes: 1500,     // cap on skeleton nodes
    autoScroll: true,   // scroll the page first to trigger lazy-loaded content
    showButton: true    // floating button (menu command + Alt+Shift+S always work)
  };

  // ------------------------------------------------------------------ extractor (runs in page)
  function extract(opts) {
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const MAXD = opts.maxDepth, CAP = opts.maxNodes;
    let count = 0;

    const SKIP = new Set(['script','style','noscript','link','meta','template','head','title','br',
      'path','defs','circle','rect','line','polygon','polyline','ellipse','use','g','source','track','lineargradient','stop','clippath','mask']);
    const INLINE = new Set(['span','strong','em','b','i','small','svg','img','br','code','sup','sub',
      'mark','abbr','time','u','s','picture','kbd','wbr']);
    const VOID = new Set(['img','input','video','iframe','canvas','select','textarea','hr','audio','svg']);

    const q = (s, r = document) => Array.from(r.querySelectorAll(s));
    const txt = (el, n = 80) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const hex = (c) => {
      if (!c) return null;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return c === 'transparent' ? null : c;
      const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
      if (p.length >= 4 && p[3] === 0) return null;
      return '#' + p.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
    };
    const rectOf = (el) => el.getBoundingClientRect();
    const visibleBox = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = rectOf(el);
      return s.display === 'contents' || r.width > 0 || r.height > 0;
    };
    const clsList = (el) => (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/).filter(c => c && c.length < 32 && /^[\w-]+$/.test(c));
    const selOf = (el) => {
      const t = el.tagName.toLowerCase();
      return t + (el.id && /^[\w-]+$/.test(el.id) ? '#' + el.id : '') +
        clsList(el).slice(0, 3).map(c => '.' + c).join('');
    };
    const family = (s) => s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const bodyStyle = getComputedStyle(document.body);
    const bodyFont = family(bodyStyle);
    const sx = window.scrollX, sy = window.scrollY;

    const layoutOf = (s) => {
      const o = {};
      if (s.display.includes('flex')) {
        o.display = s.display; o.dir = s.flexDirection;
        if (s.flexWrap !== 'nowrap') o.wrap = s.flexWrap;
        if (s.justifyContent !== 'normal') o.justify = s.justifyContent;
        if (s.alignItems !== 'normal') o.align = s.alignItems;
        if (s.gap && s.gap !== 'normal') o.gap = s.gap;
      } else if (s.display.includes('grid')) {
        o.display = s.display;
        o.cols = (s.gridTemplateColumns || '').slice(0, 90);
        if (s.gap && s.gap !== 'normal') o.gap = s.gap;
      } else if (!['block', 'inline', 'list-item', 'inline-block', 'contents'].includes(s.display)) {
        o.display = s.display;
      } else if (s.display === 'contents') o.display = 'contents';
      if (s.position !== 'static') o.position = s.position;
      if (s.maxWidth && s.maxWidth !== 'none') o.maxW = s.maxWidth;
      if (s.overflowX !== 'visible' && s.overflowX !== 'clip') o.overflowX = s.overflowX;
      return o;
    };

    const styleOf = (s, withText) => {
      const st = {};
      const bg = hex(s.backgroundColor); if (bg) st.bg = bg;
      if (s.backgroundImage && s.backgroundImage !== 'none') st.bgImage = s.backgroundImage.slice(0, 70);
      if (s.borderRadius !== '0px') st.radius = s.borderRadius;
      if (s.boxShadow !== 'none') st.shadow = s.boxShadow.slice(0, 70);
      if (s.padding !== '0px') st.pad = s.padding;
      for (const sd of ['Top', 'Bottom', 'Left', 'Right']) {
        if (parseFloat(s['border' + sd + 'Width']) > 0 && s['border' + sd + 'Style'] !== 'none') {
          st.border = sd.toLowerCase() + ' ' + s['border' + sd + 'Width'] + ' ' + (hex(s['border' + sd + 'Color']) || '');
          break;
        }
      }
      if (withText) {
        st.color = hex(s.color); st.size = s.fontSize;
        if (s.fontWeight !== '400') st.weight = s.fontWeight;
        const f = family(s); if (f !== bodyFont) st.font = f;
        if (s.textTransform !== 'none') st.transform = s.textTransform;
        if (s.textAlign === 'center' || s.textAlign === 'right') st.align = s.textAlign;
      }
      return st;
    };

    const firstText = (n) => n.text || (n.children || []).map(firstText).find(Boolean) || '';

    function build(el, depth) {
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(tag) || count >= CAP) return null;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      const r = rectOf(el);
      if (s.display !== 'contents' && r.width === 0 && r.height === 0) return null;
      count++;

      const node = { sel: selOf(el), tag };
      const role = el.getAttribute('role'); if (role) node.role = role;
      const lay = layoutOf(s); if (Object.keys(lay).length) node.layout = lay;
      node.box = [Math.round(r.x + sx), Math.round(r.y + sy), Math.round(r.width), Math.round(r.height)];

      const a = {};
      if (tag === 'a' && typeof el.href === 'string') a.href = el.href;
      if (tag === 'img') { a.src = el.currentSrc || el.src; a.alt = el.alt; }
      if (['video', 'iframe', 'audio', 'source'].includes(tag) && el.src) a.src = el.src;
      if (['input', 'select', 'textarea', 'button'].includes(tag)) {
        for (const k of ['type', 'name', 'placeholder']) if (el.getAttribute(k)) a[k] = el.getAttribute(k);
      }
      if (el.getAttribute('aria-label')) a.aria = el.getAttribute('aria-label');
      if (Object.keys(a).length) node.attrs = a;

      const kids = Array.from(el.children).filter(c => !SKIP.has(c.tagName.toLowerCase()));
      const leafish = VOID.has(tag) || kids.every(c => INLINE.has(c.tagName.toLowerCase()));

      if (leafish) {
        const t = txt(el);
        if (t) node.text = t;
        const icons = kids.filter(c => ['svg', 'img', 'picture'].includes(c.tagName.toLowerCase())).length;
        if (icons) node.icons = icons;
        node.leaf = true;
        const st = styleOf(s, !!t); if (Object.keys(st).length) node.style = st;
        return node;
      }

      const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 80);
      if (direct) node.text = direct;
      const st = styleOf(s, !!direct); if (Object.keys(st).length) node.style = st;

      if (depth >= MAXD) { node.truncated = kids.length; return node; }

      const ch = kids.map(c => build(c, depth + 1)).filter(Boolean);

      // collapse runs of >=3 structurally identical siblings
      const sig = (n) => n.tag + '>' + (n.children || []).map(c => c.tag).join(',');
      const out = [];
      for (let i = 0; i < ch.length;) {
        let j = i + 1;
        while (j < ch.length && sig(ch[j]) === sig(ch[i])) j++;
        if (j - i >= 3) {
          ch[i].repeat = j - i;
          const items = ch.slice(i, j).map(firstText).filter(Boolean).slice(0, 12);
          if (items.length) ch[i].items = items;
          out.push(ch[i]);
        } else for (let k = i; k < j; k++) out.push(ch[k]);
        i = j;
      }
      node.children = out;

      if ((tag === 'div' || tag === 'span') && out.length === 1 && !node.text && !el.id && !role &&
          !node.layout && !node.style) return out[0];
      return node;
    }

    // ---------- tokens ----------
    const tally = (m, k, w = 1) => { if (k) m[k] = (m[k] || 0) + w; };
    const top = (m, n = 12) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
    const colors = { text: {}, bg: {}, border: {} }, fonts = {}, sizes = {}, weights = {},
          radii = {}, shadows = {}, spacing = {};
    const all = q('body *').filter(e => !SKIP.has(e.tagName.toLowerCase())).slice(0, 4000);
    for (const el of all) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = rectOf(el); if (r.width === 0 || r.height === 0) continue;
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        tally(colors.text, hex(s.color)); tally(fonts, family(s));
        tally(sizes, s.fontSize); tally(weights, s.fontWeight);
      }
      tally(colors.bg, hex(s.backgroundColor));
      if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') tally(colors.border, hex(s.borderTopColor));
      if (s.borderRadius !== '0px') tally(radii, s.borderRadius);
      if (s.boxShadow !== 'none') tally(shadows, s.boxShadow.slice(0, 80));
      for (const p of ['paddingTop', 'paddingLeft', 'rowGap', 'columnGap']) {
        const v = s[p]; if (v && v !== '0px' && v !== 'normal') tally(spacing, v);
      }
    }

    const typeScale = {};
    for (const t of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'li', 'small', 'label']) {
      const el = q(t).find(visibleBox); if (!el) continue;
      const s = getComputedStyle(el);
      typeScale[t] = { size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing, font: family(s), color: hex(s.color),
        transform: s.textTransform !== 'none' ? s.textTransform : undefined };
    }

    const cssVars = {}, bps = new Set(), fontFaces = [];
    let blockedSheets = 0;
    const walk = (rules) => {
      for (const r of rules) {
        try {
          if (r.type === 1 && /^(:root|html|body|\*|:host)/.test(r.selectorText || '')) {
            for (const p of r.style) if (p.startsWith('--')) cssVars[p] = r.style.getPropertyValue(p).trim();
          }
          if (r.type === 4) {
            (r.conditionText || r.media.mediaText).replace(/\((min|max)-width:\s*([\d.]+(?:px|em|rem))\)/g,
              (m, a, b) => { bps.add(a + '-width:' + b); return m; });
          }
          if (r.type === 5) fontFaces.push((r.style.getPropertyValue('font-family') || '').replace(/["']/g, '') +
            ' ' + (r.style.getPropertyValue('font-weight') || ''));
          if (r.cssRules && r.type !== 1) walk(r.cssRules);
        } catch (e) {}
      }
    };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { blockedSheets++; } }
    const rootCS = getComputedStyle(document.documentElement);
    const vars = {};
    Object.keys(cssVars).slice(0, 100).forEach(k => { vars[k] = rootCS.getPropertyValue(k).trim() || cssVars[k]; });

    // ---------- sections ----------
    const unwrap = (root) => {
      for (let i = 0; i < 5; i++) {
        const kids = Array.from(root.children).filter(c => !SKIP.has(c.tagName.toLowerCase()) && visibleBox(c));
        if (kids.length === 1 && rectOf(kids[0]).height >= rectOf(root).height * 0.8) root = kids[0]; else break;
      }
      return root;
    };
    const rootEl = unwrap(document.body);
    const bandEls = [];
    for (const k of Array.from(rootEl.children).filter(c => !SKIP.has(c.tagName.toLowerCase()) && visibleBox(c))) {
      if (k.tagName === 'MAIN' || k.getAttribute('role') === 'main') {
        const m = unwrap(k);
        const inner = Array.from(m.children).filter(c => !SKIP.has(c.tagName.toLowerCase()) && visibleBox(c));
        bandEls.push(...(inner.length ? inner : [k]));
      } else bandEls.push(k);
    }
    const LANDMARK = { header: 'header', footer: 'footer', nav: 'nav', aside: 'aside', section: 'section', main: 'main', article: 'article' };
    const sections = bandEls.map(el => {
      const s = getComputedStyle(el), r = rectOf(el);
      const h = el.querySelector('h1,h2,h3');
      return {
        sel: selOf(el), landmark: LANDMARK[el.tagName.toLowerCase()] || el.getAttribute('role') || null,
        y: Math.round(r.y + sy), h: Math.round(r.height), w: Math.round(r.width),
        heading: h ? txt(h, 90) : null,
        bg: hex(s.backgroundColor), bgImage: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 60) : null,
        layout: layoutOf(s), position: s.position !== 'static' ? s.position : null,
        directChildren: Array.from(el.children).filter(visibleBox).length,
        counts: { img: q('img', el).length, svg: q('svg', el).length, a: q('a', el).length,
          button: q('button,[role=button]', el).length, input: q('input,select,textarea', el).length,
          video: q('video,iframe', el).length, headings: q('h1,h2,h3,h4,h5,h6', el).length },
        textLen: txt(el, 100000).length
      };
    }).filter(b => b.h >= 8);

    // ---------- components ----------
    const headings = q('h1,h2,h3,h4,h5,h6').filter(visibleBox).slice(0, 80)
      .map(h => ({ level: +h.tagName[1], text: txt(h, 100), y: Math.round(rectOf(h).y + sy) }));

    let navs = q('nav,[role=navigation]').filter(visibleBox).slice(0, 8).map(n => ({
      label: n.getAttribute('aria-label') || selOf(n),
      links: q('a', n).filter(visibleBox).slice(0, 40).map(a => ({ text: txt(a, 50), href: a.href }))
    }));
    if (!navs.length) {
      const hd = document.querySelector('header');
      if (hd) navs = [{ label: 'header links', links: q('a', hd).filter(visibleBox).slice(0, 30).map(a => ({ text: txt(a, 50), href: a.href })) }];
    }

    const seenCta = new Set(), ctas = [];
    for (const el of q('button,[role=button],a,input[type=submit],input[type=button]').filter(visibleBox)) {
      const s = getComputedStyle(el), bg = hex(s.backgroundColor), t = txt(el, 40) || el.value || '';
      const pl = parseFloat(s.paddingLeft);
      const looks = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'INPUT' ||
        /btn|button|cta/i.test(typeof el.className === 'string' ? el.className : '') ||
        (bg && pl >= 10 && t && t.length < 40);
      if (!looks || !t) continue;
      const key = t + '|' + bg + '|' + s.borderRadius;
      if (seenCta.has(key)) continue; seenCta.add(key);
      ctas.push({ text: t, tag: el.tagName.toLowerCase(), href: el.href || undefined, bg, color: hex(s.color),
        radius: s.borderRadius, pad: s.padding, size: s.fontSize, weight: s.fontWeight,
        border: parseFloat(s.borderTopWidth) > 0 ? s.borderTopWidth + ' ' + hex(s.borderTopColor) : undefined });
      if (ctas.length >= 30) break;
    }

    const fieldInfo = (f) => {
      const lab = (f.labels && f.labels[0] && txt(f.labels[0], 50)) || f.getAttribute('aria-label') || '';
      return { tag: f.tagName.toLowerCase(), type: f.type || undefined, name: f.name || undefined,
        placeholder: f.placeholder || undefined, label: lab || undefined, required: f.required || undefined };
    };
    const forms = q('form').filter(visibleBox).slice(0, 10).map(f => ({
      sel: selOf(f), action: f.getAttribute('action') || '', method: (f.method || 'get'),
      fields: q('input,select,textarea,button', f).filter(visibleBox).map(fieldInfo).slice(0, 25)
    }));
    const looseFields = q('input,select,textarea').filter(x => !x.closest('form') && visibleBox(x)).slice(0, 20).map(fieldInfo);

    const images = q('img').filter(visibleBox).slice(0, 60).map(i => ({
      src: i.currentSrc || i.src, alt: i.alt, natural: [i.naturalWidth, i.naturalHeight],
      rendered: [Math.round(rectOf(i).width), Math.round(rectOf(i).height)],
      lazy: i.loading === 'lazy' || undefined, inPicture: !!i.closest('picture') || undefined
    }));
    const bgImages = all.filter(e => { const b = getComputedStyle(e).backgroundImage; return b && b.startsWith('url(') && visibleBox(e); })
      .slice(0, 30).map(e => ({ sel: selOf(e), image: getComputedStyle(e).backgroundImage.slice(0, 160) }));

    // ---------- meta / tech ----------
    const m = (n) => { const e = document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]'); return e ? e.content : null; };
    const html = document.documentElement.innerHTML;
    const tech = [];
    if (W.__NEXT_DATA__ || document.querySelector('#__next')) tech.push('Next.js');
    if (W.__NUXT__ || document.querySelector('#__nuxt')) tech.push('Nuxt');
    if (document.querySelector('[data-reactroot],#root')) tech.push('React-like root');
    if (W.jQuery) tech.push('jQuery');
    if (html.includes('wp-content')) tech.push('WordPress');
    if (html.includes('cdn.shopify')) tech.push('Shopify');
    if (html.includes('wixstatic')) tech.push('Wix');
    if (html.includes('squarespace')) tech.push('Squarespace');
    if (m('generator')) tech.push('generator: ' + m('generator'));
    const sample = all.slice(0, 300);
    const tw = sample.filter(e => typeof e.className === 'string' && /\b(p[xy]?|m[xytb]?|text|gap|w|h)-\d/.test(e.className)).length;
    if (tw > sample.length * 0.25) tech.push('Tailwind-like utility classes');
    if (document.querySelector('.container .row, [class*="col-md-"]')) tech.push('Bootstrap-like grid');

    return {
      meta: {
        url: location.href, title: document.title, lang: document.documentElement.lang || null,
        description: m('description'), ogTitle: m('og:title'), ogImage: m('og:image'),
        themeColor: m('theme-color'), viewportMeta: m('viewport'),
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
        favicon: (document.querySelector('link[rel~=icon]') || {}).href || null,
        pageHeight: document.documentElement.scrollHeight, viewport: [window.innerWidth, window.innerHeight],
        pageBg: hex(bodyStyle.backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff',
        bodyFont, bodyColor: hex(bodyStyle.color), tech, nodeCount: count, nodeCapHit: count >= CAP
      },
      tokens: {
        colors: { text: top(colors.text), bg: top(colors.bg), border: top(colors.border, 6) },
        fonts: top(fonts, 6), sizes: top(sizes, 14), weights: top(weights, 6),
        radii: top(radii, 8), shadows: top(shadows, 6), spacing: top(spacing, 14),
        typeScale, cssVars: vars, breakpoints: Array.from(bps).sort(),
        fontFaces: Array.from(new Set(fontFaces)).slice(0, 30),
        loadedFonts: Array.from(document.fonts || []).filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).slice(0, 20),
        blockedStylesheets: blockedSheets
      },
      sections, headings, navs, ctas, forms, looseFields, images, bgImages,
      skeleton: build(document.body, 0)
    };
  }

  // ------------------------------------------------------------------ markdown
  const fmtLayout = (lay) => Object.entries(lay || {}).map(([k, v]) => k + '=' + v).join(', ');
  const fmtStyle = (st) => Object.entries(st || {}).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(' ');
  const esc = (x) => String(x == null ? '' : x).replace(/\|/g, '\\|');
  const table = (rows, headers) =>
    '| ' + headers.join(' | ') + ' |\n|' + headers.map(() => '---|').join('') + '\n' +
    rows.map(r => '| ' + r.map(esc).join(' | ') + ' |').join('\n') + '\n';

  function treeLines(n, d, out) {
    const bits = [n.sel];
    if (n.role) bits.push('role=' + n.role);
    if (n.layout) bits.push('[' + fmtLayout(n.layout) + ']');
    if (n.box) bits.push(n.box[2] + 'x' + n.box[3]);
    if (n.attrs) bits.push('(' + Object.entries(n.attrs).filter(([, v]) => v).map(([k, v]) => k + '=' + String(v).slice(0, 70)).join(', ') + ')');
    if (n.icons) bits.push('icons=' + n.icons);
    if (n.text) bits.push('"' + n.text + '"');
    if (n.repeat) bits.push('**x' + n.repeat + ' repeated**' + (n.items ? ' items=' + JSON.stringify(n.items) : ''));
    if (n.style) bits.push('{' + fmtStyle(n.style) + '}');
    if (n.truncated) bits.push('...(' + n.truncated + ' children omitted)');
    out.push('  '.repeat(d) + '- ' + bits.join(' '));
    (n.children || []).forEach(c => treeLines(c, d + 1, out));
    return out;
  }

  function toMarkdown(d) {
    const m = d.meta, t = d.tokens, L = [];
    L.push('# Site skeleton: ' + (m.title || m.url));
    L.push('- URL: ' + m.url + '\n- Viewport: ' + m.viewport[0] + 'px wide (page height ' + m.pageHeight + 'px)\n' +
      '- Lang: ' + m.lang + '  | Page bg: ' + m.pageBg + '  | Body font: ' + m.bodyFont + '  | Body color: ' + m.bodyColor);
    if (m.tech.length) L.push('- Tech hints: ' + m.tech.join(', '));
    if (m.description) L.push('- Meta description: ' + m.description);
    L.push('\n> How to use: **Page sections** give the vertical order of the page. **Design tokens** are the current visual system. ' +
      '**Components** list the real elements (nav, CTAs, forms, images). **DOM skeleton** shows which tags/layout modes each block uses ' +
      '(repeated siblings are collapsed).');

    L.push('\n## Page sections (top to bottom)');
    d.sections.forEach((s, i) => {
      const c = Object.entries(s.counts).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join(' ');
      let line = (i + 1) + '. `' + s.sel + '`' + (s.landmark ? ' (' + s.landmark + ')' : '') + ' y=' + s.y + ' h=' + s.h;
      if (Object.keys(s.layout).length) line += ' [' + fmtLayout(s.layout) + ']';
      if (s.bg) line += ' bg=' + s.bg;
      if (s.bgImage) line += ' bg-image';
      if (s.position) line += ' position=' + s.position;
      line += ' children=' + s.directChildren + ' ' + c;
      if (s.heading) line += ' heading="' + s.heading + '"';
      L.push(line);
    });

    const pair = (arr) => arr.map(([k, n]) => k + ' (' + n + ')').join(', ');
    L.push('\n## Design tokens');
    L.push('**Colors**\n');
    ['text', 'bg', 'border'].forEach(k => L.push('- ' + k + ': ' + pair(t.colors[k])));
    L.push('\n**Fonts:** ' + pair(t.fonts));
    if (t.fontFaces.length) L.push('**@font-face:** ' + t.fontFaces.join(', '));
    L.push('**Font sizes:** ' + pair(t.sizes));
    L.push('**Weights:** ' + pair(t.weights));
    L.push('**Radii:** ' + pair(t.radii));
    L.push('**Spacing values seen:** ' + pair(t.spacing));
    if (t.shadows.length) L.push('**Shadows:** ' + t.shadows.map(([k, n]) => k + ' (' + n + ')').join('; '));
    if (t.breakpoints.length) L.push('**Breakpoints:** ' + t.breakpoints.join(', '));
    L.push('\n**Type scale**\n');
    L.push(table(Object.entries(t.typeScale).map(([k, v]) => [k, v.size, v.weight, v.lineHeight, v.letterSpacing, v.font, v.color, v.transform || '']),
      ['el', 'size', 'weight', 'line-h', 'tracking', 'font', 'color', 'transform']));
    const vars = Object.entries(t.cssVars).slice(0, 40);
    if (vars.length) L.push('**CSS custom properties (first 40)**\n\n```css\n' + vars.map(([k, v]) => k + ': ' + v + ';').join('\n') + '\n```');
    if (t.blockedStylesheets) L.push('_Note: ' + t.blockedStylesheets + ' cross-origin stylesheet(s) unreadable; computed values above are still accurate._');

    L.push('\n## Heading outline');
    d.headings.slice(0, 60).forEach(h => L.push('  '.repeat(h.level - 1) + '- h' + h.level + ': ' + h.text));

    L.push('\n## Navigation');
    d.navs.forEach(n => L.push('- **' + n.label + '**: ' + n.links.slice(0, 25).map(x => x.text || '(icon)').join(', ')));

    L.push('\n## Buttons / CTAs');
    L.push(table(d.ctas.map(c => [c.text, c.tag, c.bg || '', c.color || '', c.radius, c.pad, c.size, c.weight, c.border || '']),
      ['text', 'tag', 'bg', 'color', 'radius', 'padding', 'size', 'weight', 'border']));

    if (d.forms.length || d.looseFields.length) {
      L.push('## Forms / inputs');
      d.forms.forEach(f => L.push('- `' + f.sel + '` ' + f.method.toUpperCase() + ' ' + f.action + ': ' +
        f.fields.map(x => x.tag + '[' + (x.type || '') + '] ' + (x.label || x.placeholder || x.name || '')).join(', ')));
      if (d.looseFields.length) L.push('- standalone: ' + d.looseFields.map(x => x.tag + '[' + (x.type || '') + '] ' + (x.placeholder || x.label || '')).join(', '));
    }

    L.push('\n## Images (' + d.images.length + ' <img>, ' + d.bgImages.length + ' CSS backgrounds)');
    d.images.slice(0, 25).forEach(i => L.push('- ' + i.rendered[0] + 'x' + i.rendered[1] + ' (natural ' + i.natural[0] + 'x' + i.natural[1] + ') alt="' + i.alt + '" ' + String(i.src).slice(0, 110)));

    L.push('\n## DOM skeleton');
    L.push('Format: `tag#id.class [layout] WxH (attrs) "text" xN {computed style}`\n');
    if (d.skeleton) L.push(...treeLines(d.skeleton, 0, []));
    return L.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ run
  async function autoscroll() {
    await new Promise((res) => {
      let y = 0; const step = Math.max(300, window.innerHeight * 0.8);
      const t = setInterval(() => {
        window.scrollBy(0, step); y += step;
        if (y >= document.documentElement.scrollHeight + step || y > 40000) { clearInterval(t); window.scrollTo(0, 0); res(); }
      }, 150);
    });
    await new Promise(r => setTimeout(r, 500));
  }

  let host, ui = {};

  function setStatus(msg) { if (ui.status) ui.status.textContent = msg; }

  async function run() {
    openPanel();
    ui.md.value = ''; ui.json = null;
    setStatus(CONFIG.autoScroll ? 'Scrolling page to load lazy content...' : 'Extracting...');
    if (CONFIG.autoScroll) await autoscroll();
    setStatus('Extracting...');
    host.style.display = 'none';           // keep our own UI out of the capture
    await new Promise(r => setTimeout(r, 50));
    let data;
    try {
      data = extract({ maxDepth: CONFIG.maxDepth, maxNodes: CONFIG.maxNodes });
    } catch (e) {
      console.error('[skeleton]', e);
      host.style.display = '';
      setStatus('Failed: ' + e.message);
      return;
    }
    host.style.display = '';
    ui.json = data;
    ui.md.value = toMarkdown(data);
    setStatus(data.meta.nodeCount + ' nodes, ' + data.sections.length + ' sections, ' + ui.md.value.length.toLocaleString() +
      ' chars @ ' + data.meta.viewport[0] + 'px' + (data.meta.nodeCapHit ? ' (node cap hit; raise CONFIG.maxNodes or lower depth)' : ''));
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.documentElement.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const fileBase = () => 'skeleton_' + location.hostname.replace(/\W+/g, '_') + '_' + (location.pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home') + '_w' + window.innerWidth;

  // ------------------------------------------------------------------ UI (shadow DOM, inline CSSOM styles only so strict CSP pages still work)
  function css(el, o) { Object.assign(el.style, o); return el; }
  function mkBtn(label, onClick, primary) {
    const b = document.createElement('button');
    b.textContent = label;
    css(b, { font: '600 12px system-ui,sans-serif', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
      border: '1px solid ' + (primary ? '#2563eb' : '#cbd5e1'), background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#111' });
    b.addEventListener('click', onClick);
    return b;
  }

  function buildUI() {
    host = document.createElement('div');
    host.id = '__skeleton_ui';
    css(host, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', all: 'initial' });
    css(host, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' });
    const root = host.attachShadow({ mode: 'open' });

    const fab = mkBtn('Skeleton', () => (ui.panel.style.display === 'none' ? run() : closePanel()), true);
    css(fab, { borderRadius: '999px', padding: '8px 14px', boxShadow: '0 2px 10px rgba(0,0,0,.3)' });
    if (!CONFIG.showButton) fab.style.display = 'none';

    const panel = css(document.createElement('div'), { display: 'none', position: 'fixed', right: '16px', bottom: '60px',
      width: 'min(560px, 92vw)', background: '#fff', color: '#111', border: '1px solid #cbd5e1', borderRadius: '10px',
      boxShadow: '0 10px 40px rgba(0,0,0,.35)', padding: '10px', font: '12px system-ui,sans-serif' });
    const status = css(document.createElement('div'), { margin: '0 0 8px', color: '#475569' });
    const md = css(document.createElement('textarea'), { width: '100%', height: '280px', boxSizing: 'border-box',
      font: '11px ui-monospace,Menlo,Consolas,monospace', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', resize: 'vertical' });
    md.readOnly = true;
    const row = css(document.createElement('div'), { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' });
    row.append(
      mkBtn('Copy Markdown', () => { if (!md.value) return; typeof GM_setClipboard === 'function' ? GM_setClipboard(md.value) : navigator.clipboard.writeText(md.value); setStatus('Markdown copied.'); }, true),
      mkBtn('Download .md', () => md.value && download(fileBase() + '.md', md.value, 'text/markdown')),
      mkBtn('Download .json', () => ui.json && download(fileBase() + '.json', JSON.stringify(ui.json, null, 2), 'application/json')),
      mkBtn('Re-run', run),
      mkBtn('Close', closePanel)
    );
    panel.append(status, md, row);
    root.append(panel, fab);
    document.documentElement.appendChild(host);
    ui = { panel, md, status, json: null };
  }

  function openPanel() { if (!host) buildUI(); ui.panel.style.display = 'block'; }
  function closePanel() { if (ui.panel) ui.panel.style.display = 'none'; }

  // ------------------------------------------------------------------ boot
  buildUI();
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Extract site skeleton', run);
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); run(); }
  });
})();
