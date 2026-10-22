/**
 * Hide / restore the original page.
 * The original DOM is KEPT (so scrapers can still read it and the site's own JS keeps running); we only
 * hide <body>. Our host element is a child of <html>, outside <body>, so it stays visible.
 *   'display'    (default) body{display:none}   — cheapest; no layout, so lazy-load/IntersectionObserver on the site won't fire
 *   'visibility' body{visibility:hidden}        — keeps layout alive; use when scraping needs rendered/lazy content
 *   'none'       don't hide (debugging: see both)
 */
const STYLE_ID = 'hearth-hide';

export function hideOriginal(mode = 'display') {
  if (mode === 'none') return;
  let st = document.getElementById(STYLE_ID);
  if (!st) { st = document.createElement('style'); st.id = STYLE_ID; (document.head || document.documentElement).appendChild(st); }
  const hide = mode === 'visibility' ? 'visibility:hidden!important' : 'display:none!important';
  // html background avoids a white flash while we scrape (document-start)
  st.textContent = `html.hearth-on>body{${hide}}html.hearth-on{background:#24262b!important;overflow:hidden!important}`;
  document.documentElement.classList.add('hearth-on');
}

export function showOriginal() { document.documentElement.classList.remove('hearth-on'); }
