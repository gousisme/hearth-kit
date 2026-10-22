/** Tiny DOM helpers. All tolerate null so scrapers can chain without try/catch. */
export function q(sel, root = document) { return root ? root.querySelector(sel) : null; }
export function qa(sel, root = document) { return root ? [...root.querySelectorAll(sel)] : []; }

/** Trimmed, whitespace-collapsed text of an element (or of the first match of a selector). */
export function text(elOrSel, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

export function attr(elOrSel, name, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  return el ? (el.getAttribute(name) || '').trim() : '';
}

/** Absolute URL ('' if it can't be resolved). Always run scraped hrefs/srcs through this. */
export function abs(href, base = location.href) {
  if (!href) return '';
  try { return new URL(href, base).href; } catch (e) { return ''; }
}

/** First number in a string: num('1,234.5 GB') → 1234.5 ; null if none. */
export function num(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Best image URL from an <img> (handles lazy-loading attributes and srcset). */
export function imgUrl(elOrSel, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  if (!el) return '';
  const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'src'].map(a => el.getAttribute(a)).find(v => v && !/^data:image\/(gif|svg)/.test(v));
  const set = el.getAttribute('srcset') || el.getAttribute('data-srcset');
  if (set) {
    const best = set.split(',').map(s => s.trim().split(/\s+/)).map(([u, d]) => [u, parseFloat(d) || 1]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[0]) return abs(best[0], el.baseURI);
  }
  return abs(lazy, el.baseURI);
}

/** url(...) of an element's inline or computed background-image. */
export function bgUrl(el) {
  if (!el) return '';
  const v = el.style.backgroundImage || getComputedStyle(el).backgroundImage || '';
  const m = v.match(/url\(["']?(.*?)["']?\)/);
  return m ? abs(m[1], el.baseURI) : '';
}

/** First non-empty value of: [selector|fn, ...]. Handy for sites with inconsistent markup. */
export function first(root, ...picks) {
  for (const p of picks) { const v = typeof p === 'function' ? p(root) : text(p, root); if (v) return v; }
  return '';
}
