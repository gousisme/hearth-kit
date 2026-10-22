/** Fonts and images, loaded in ways that survive strict page CSP where possible. */

export const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap';

const gm = (url, responseType) => new Promise((resolve, reject) => {
  // eslint-disable-next-line no-undef
  GM_xmlhttpRequest({ method: 'GET', url, responseType, onload: r => (r.status < 400 ? resolve(r.response) : reject(new Error('HTTP ' + r.status))), onerror: reject });
});
const blobToDataUrl = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });

/**
 * @font-face does NOT work inside a shadow root, so fonts are always injected into the main document.
 *   'link'       <link> to Google Fonts (simple; blocked by CSP style-src/font-src on strict sites)
 *   'gm-inline'  fetch the CSS + woff2 with GM_xmlhttpRequest and inline as data: URIs (needs @grant GM_xmlhttpRequest
 *                and @connect fonts.googleapis.com / fonts.gstatic.com; still subject to the page's font-src)
 *   'none'       use the system fallback stack
 */
export async function loadFonts(mode = 'link', href = FONT_HREF) {
  if (mode === 'none' || document.getElementById('hearth-fonts')) return;
  const parent = document.head || document.documentElement;
  if (mode === 'link') {
    const l = document.createElement('link'); l.id = 'hearth-fonts'; l.rel = 'stylesheet'; l.href = href; parent.appendChild(l); return;
  }
  let css = await gm(href, 'text');
  for (const url of new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))) {
    css = css.split(url).join(await blobToDataUrl(await gm(url, 'blob')));
  }
  const s = document.createElement('style'); s.id = 'hearth-fonts'; s.textContent = css; parent.appendChild(s);
}

/**
 * ui.imageLoader for sites whose CSP `img-src` blocks the Steam CDN: fetch through GM_xmlhttpRequest and
 * hand the UI a blob: URL. (If the CSP also lacks `blob:` in img-src this won't help — see docs/07-gotchas.md.)
 */
export function gmImageLoader() {
  const cache = new Map();
  return url => {
    if (!cache.has(url)) cache.set(url, gm(url, 'blob').then(b => URL.createObjectURL(b)));
    return cache.get(url);
  };
}
