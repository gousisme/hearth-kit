/** Small helpers shared by the UI, scrape and glue bundles. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape any value. EVERY scraped string that reaches innerHTML goes through this. */
export function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ESC[c]); }

/** Only allow http(s), protocol-relative, blob: and data:image URLs. Anything else (javascript:, file:, relative) becomes ''. */
export function safeUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  return /^(https?:)?\/\//i.test(u) || /^blob:/i.test(u) || /^data:image\//i.test(u) ? u : '';
}

export function slug(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
