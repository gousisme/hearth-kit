/**
 * Detect SPA navigation. No single API is reliable across sites and userscript sandboxes, so we layer:
 *   1. Navigation API 'navigatesuccess' (Chromium)         2. popstate + hashchange
 *   3. history.pushState/replaceState wrapper               4. a 500 ms URL poll as the safety net
 * `cb(url)` fires only when location.href actually changed. Returns a stop function.
 */
export function watchNavigation(cb) {
  let last = location.href;
  const fire = () => { if (location.href !== last) { last = location.href; cb(last); } };
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const undo = [];
  try { if (W.navigation) { W.navigation.addEventListener('navigatesuccess', fire); undo.push(() => W.navigation.removeEventListener('navigatesuccess', fire)); } } catch (e) { /* ignore */ }
  window.addEventListener('popstate', fire); window.addEventListener('hashchange', fire);
  undo.push(() => { window.removeEventListener('popstate', fire); window.removeEventListener('hashchange', fire); });
  try {
    for (const k of ['pushState', 'replaceState']) {
      const orig = W.history[k];
      W.history[k] = function () { const r = orig.apply(this, arguments); setTimeout(fire, 0); return r; };
      undo.push(() => { W.history[k] = orig; });
    }
  } catch (e) { /* sandbox forbids it: the poll still covers us */ }
  const iv = setInterval(fire, 500);
  return () => { clearInterval(iv); undo.forEach(f => f()); };
}
