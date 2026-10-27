import { waitFor } from '../shared/wait.js';
import { validate } from '../shared/schema.js';
import { hideOriginal, showOriginal } from './hide.js';
import { watchNavigation } from './navwatch.js';
import { showSplash } from './splash.js';
import { loadFonts, gmImageLoader, FONT_HREF } from './assets.js';

/**
 * HearthGlue.run(config) — the whole Tampermonkey side of the kit.
 *
 * config: {
 *   name, css (REQUIRED: GM_getResourceText('hearthCss')),
 *   routes: [{ id, match, ready?, scrape(ctx) → data, view? }],   // first matching route wins
 *   hide: 'display' | 'visibility' | 'none',   fonts: 'link' | 'gm-inline' | 'none',   gmImages: boolean,
 *   ui: { ...HearthUI.mount options (onGet, onOpen, theme, autoplayMs, …) },
 *   failTimeoutMs (wait for `ready`), scrapeTimeoutMs, onNoMatch: 'original' | 'keep',
 *   toggleKey: 'Alt+Shift+H', debug,
 *   splash: { title, accentTitle, letter, logo, accent, ink, bg }   // optional loading screen on every route that matches (see glue/splash.js)
 * }
 *   route.match  RegExp | string (substring) | (url: string, u: URL) => boolean
 *   route.ready  selector | () => truthy      awaited before scrape(); use it for SPAs that render late
 *   route.scrape async (ctx) => data          ctx = { url, route, store, log }; `store` persists across routes/navigations
 *   route.view   {view:'home'|'browse', filter?} | {open: gameId} | (data) => one of those
 */
export function run(cfg) {
  const C = { name: 'site', css: '', routes: [], hide: 'display', fonts: 'link', gmImages: false, ui: {}, failTimeoutMs: 10000, scrapeTimeoutMs: 30000, onNoMatch: 'original', toggleKey: 'Alt+Shift+H', debug: false, ...cfg };
  const log = (...a) => C.debug && console.log(`[hearth:${C.name}]`, ...a);
  const UI = () => { if (typeof HearthUI === 'undefined') throw new Error('HearthUI is missing: @require dist/hearth-ui.js before dist/hearth-glue.js'); return HearthUI; };
  if (!C.css) console.warn('[hearth] `css` is empty. Add  // @resource hearthCss <url>/dist/hearth.css  and pass css: GM_getResourceText("hearthCss"). Falling back to light DOM.');

  const store = {};
  let app = null, token = 0, enabled = true, stopNav = null, lastSig = '';

  const matchRoute = url => C.routes.find(r => {
    const m = r.match;
    return typeof m === 'function' ? m(url, new URL(url)) : m instanceof RegExp ? m.test(url) : typeof m === 'string' ? url.includes(m) : false;
  });
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);
  const domReady = () => (document.readyState !== 'loading' ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })));

  function teardown() { if (app) { app.destroy(); app = null; lastSig = ''; } }
  function giveUp(err) { console.error(`[hearth:${C.name}] falling back to the original page:`, err); window.__hearthError = err; teardown(); showOriginal(); }

  async function apply() {
    const my = ++token, url = location.href, route = matchRoute(url);
    if (!route) { log('no route for', url); if (C.onNoMatch === 'original') { teardown(); showOriginal(); } return; }
    if (!enabled) return;
    hideOriginal(C.hide);
    try {
      await domReady();
      if (route.ready) await waitFor(route.ready, { timeout: C.failTimeoutMs });
      if (my !== token) return;
      const data = await withTimeout(Promise.resolve(route.scrape({ url, route, store, log })), C.scrapeTimeoutMs, `scrape(${route.id || url})`);
      if (my !== token) return;

      const rep = validate(data);
      rep.errors.forEach(e => console.error(`[hearth:${C.name}] data error:`, e));
      if (C.debug) rep.warnings.forEach(w => console.warn(`[hearth:${C.name}] data warning:`, w));
      if (rep.errors.length && !(data && data.games && data.games.length)) throw new Error('scrape() returned no usable games: ' + rep.errors[0]);

      let v = typeof route.view === 'function' ? route.view(data) : route.view;
      v = v || { view: 'home' };
      const ui = UI();
      const sig = JSON.stringify(data);
      if (!app) {
        const options = { ...C.ui, route: v.open ? { view: 'home' } : { view: v.view || 'home', filter: v.filter || {} } };
        if (C.gmImages && !options.imageLoader) options.imageLoader = gmImageLoader();
        app = ui.mount({ target: document.documentElement, data, css: C.css || null, options });
        if (v.open) app.open(v.open);
      } else if (sig === lastSig) {                       // same data: just move the view, no re-render flash
        if (v.open) app.open(v.open);
        else { app.close(); const want = v.view || 'home', cur = app.getRoute(); if (cur.view !== want) app.navigate(want, v.filter || {}); }
      } else if (v.open) { await app.update(data); app.open(v.open); }
      else { app.close(); await app.update(data, { view: v.view || 'home', filter: v.filter || {} }); }
      lastSig = sig;
      log('rendered', route.id || url);
    } catch (e) { if (my === token) giveUp(e); }
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) { if (app) app.el.style.display = ''; apply(); } else { if (app) app.el.style.display = 'none'; showOriginal(); }
  }

  // ---- boot ----------------------------------------------------------------------------------
  // At document-start <html> may not exist yet in some engines/sandboxes: wait for it.
  const whenRoot = cb => { if (document.documentElement) return cb(); const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); cb(); } }); mo.observe(document, { childList: true }); };
  whenRoot(() => {
    if (matchRoute(location.href)) { hideOriginal(C.hide); if (C.splash) showSplash(C.splash); }   // before first paint, to avoid a flash of the old site
    loadFonts(C.fonts, C.fontHref || FONT_HREF).catch(e => log('fonts failed (system fonts will be used)', e));
    apply();
  });
  let t;
  stopNav = watchNavigation(() => { clearTimeout(t); t = setTimeout(apply, 120); });

  const key = String(C.toggleKey || '').toLowerCase().split('+');
  const onKey = e => {
    if (!key[0]) return;
    const want = { alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey };
    const mods = key.slice(0, -1);
    if (mods.every(m => want[m]) && Object.keys(want).every(m => want[m] === mods.includes(m)) && e.key.toLowerCase() === key[key.length - 1]) { e.preventDefault(); toggle(); }
  };
  window.addEventListener('keydown', onKey, true);
  // eslint-disable-next-line no-undef
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Toggle Hearth UI / original page', toggle);

  return {
    get app() { return app; }, refresh: apply, toggle,
    destroy() { stopNav && stopNav(); window.removeEventListener('keydown', onKey, true); teardown(); showOriginal(); },
  };
}
