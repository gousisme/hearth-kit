/**
 * Network helpers. Uses GM_xmlhttpRequest when the userscript granted it (cross-origin, ignores the
 * page's CSP `connect-src`), otherwise falls back to fetch (same-origin only).
 * Header needed for GM:  // @grant GM_xmlhttpRequest   (+ // @connect <host> for cross-origin hosts)
 */
function gmRequest(url, responseType) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    GM_xmlhttpRequest({ method: 'GET', url, responseType, onload: r => (r.status >= 200 && r.status < 400 ? resolve(r.response) : reject(new Error(`HTTP ${r.status} for ${url}`))), onerror: () => reject(new Error('Network error for ' + url)), ontimeout: () => reject(new Error('Timeout for ' + url)) });
  });
}
const hasGM = () => typeof GM_xmlhttpRequest === 'function';

export async function fetchText(url) {
  if (hasGM()) return gmRequest(url, 'text');
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

export async function fetchJson(url) { return JSON.parse(await fetchText(url)); }

/** Fetch a page and parse it into a detached Document whose baseURI is `url` (so abs(href, doc.baseURI) works). */
export async function fetchDoc(url) {
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base'); base.href = url; doc.head.prepend(base);
  return doc;
}

/** Run `fn` over `items` with at most `limit` in flight. Failures become `null` results (and are logged), never a thrown batch. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { console.warn('[hearth] mapLimit item failed', items[k], e); out[k] = null; } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Infinite-scroll / "load more" helper. Repeatedly scrolls the ORIGINAL page (or `container`) until
 * `count()` stops growing. Needs the original page to be rendered: set `hide: 'visibility'` in glue.run.
 */
export async function loadAll(count, { container = document.scrollingElement, max = 40, idleMs = 700 } = {}) {
  let last = -1;
  for (let i = 0; i < max; i++) {
    const n = count();
    if (n === last) break;
    last = n;
    container.scrollTo({ top: container.scrollHeight });
    await new Promise(r => setTimeout(r, idleMs));
  }
  return count();
}
