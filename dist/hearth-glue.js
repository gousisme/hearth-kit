/*! hearth-kit v0.6.0 · HearthGlue · built from src/js/glue/index.js — DO NOT EDIT, edit src/ and run `npm run build` */
var HearthGlue=(function(){
'use strict';
/* ── src/js/shared/wait.js ── */
/**
 * Resolve when `target` is truthy.
 *   target: CSS selector string, or a function returning a truthy value (sync or async).
 * Rejects after `timeout` ms. Uses a MutationObserver plus a slow interval as a safety net,
 * so it also works for conditions that are not DOM-mutation driven.
 */
function waitFor(target, { timeout = 10000, root = document, interval = 250 } = {}) {
  const probe = typeof target === 'function' ? target : () => root.querySelector(target);
  return new Promise((resolve, reject) => {
    let done = false, mo, iv, to;
    const finish = (fn, v) => { if (done) return; done = true; mo && mo.disconnect(); clearInterval(iv); clearTimeout(to); fn(v); };
    const check = async () => { try { const v = await probe(); if (v) finish(resolve, v); } catch (e) { /* keep waiting */ } };
    check();
    if (done) return;
    mo = new MutationObserver(check);
    mo.observe(root.documentElement || root, { childList: true, subtree: true, attributes: true });
    iv = setInterval(check, interval);
    to = setTimeout(() => finish(reject, new Error('waitFor timed out: ' + (typeof target === 'string' ? target : 'custom condition'))), timeout);
  });
}

/* ── src/js/shared/util.js ── */
/** Small helpers shared by the UI, scrape and glue bundles. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape any value. EVERY scraped string that reaches innerHTML goes through this. */
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ESC[c]); }

/** Only allow http(s), protocol-relative, blob: and data:image URLs. Anything else (javascript:, file:, relative) becomes ''. */
function safeUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  return /^(https?:)?\/\//i.test(u) || /^blob:/i.test(u) || /^data:image\//i.test(u) ? u : '';
}

function slug(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── src/js/shared/schema.js ── */
/**
 * The data contract lives in docs/04-data-contract.md and data/hearth-data.schema.json.
 * This file is the executable version: `coerceGame` makes a scraped record safe to render,
 * `validate` produces a human-readable report for scraper authors.
 */

const str = v => (v == null ? '' : String(v).trim());
const strList = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(str).filter(Boolean);
const kv = o => {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (str(v)) out[str(k)] = str(v);
  return out;
};

const list = v => (Array.isArray(v) ? v : []);
const http = u => /^https?:\/\//i.test(str(u));

/** Media strip items: { type:'image'|'video'|'embed', thumb, src, sources:[{src,type}], stream (a DASH .mpd URL, played with dash.js), page (where to watch it when it cannot play), title }. Items without a usable thumbnail or source are dropped. */
function coerceMedia(v) {
  return list(v).map(m => {
    if (!m || typeof m !== 'object') return null;
    const type = m.type === 'video' || m.type === 'embed' ? m.type : 'image';
    const thumb = http(m.thumb) ? str(m.thumb) : '', src = http(m.src) ? str(m.src) : '';
    const sources = list(m.sources).filter(s => s && http(s.src)).map(s => ({ src: str(s.src), type: str(s.type) }));
    const stream = type === 'video' && http(m.stream) ? str(m.stream) : '';
    if (!thumb || (type === 'image' ? !(src || thumb) : type === 'video' ? !(sources.length || stream) : !src)) return null;
    return { type, thumb, src: src || thumb, sources, ...(stream ? { stream, page: http(m.page) ? str(m.page) : '' } : {}), title: str(m.title) };
  }).filter(Boolean).slice(0, 16);
}

function coerceGame(g) {
  const art = g.art && typeof g.art === 'object' ? g.art : {};
  const appId = parseInt(g.steamAppId, 10);
  const genres = strList(g.genres);
  const year = parseInt(g.releaseYear ?? g.year, 10);
  const req = g.requirements && typeof g.requirements === 'object' ? g.requirements : {};
  return {
    id: str(g.id),
    title: str(g.title),
    steamAppId: Number.isFinite(appId) && appId > 0 ? appId : null,
    art: { poster: str(art.poster), hero: str(art.hero), logo: str(art.logo), header: str(art.header), fallback: str(art.fallback) },
    tagline: str(g.tagline),
    description: str(g.description),
    genres,
    categories: strList(g.categories).length ? strList(g.categories).map(slug) : genres.map(slug),
    developer: str(g.developer),
    publisher: str(g.publisher),
    releaseYear: Number.isFinite(year) ? year : null,
    size: str(g.size),
    rating: str(g.rating),
    requirements: { minimum: kv(req.minimum), recommended: kv(req.recommended) },
    screenshots: strList(g.screenshots),
    similarIds: strList(g.similarIds),
    downloadUrl: str(g.downloadUrl),
    sourceUrl: str(g.sourceUrl),
    steamUrl: http(g.steamUrl) ? str(g.steamUrl) : '',
    media: coerceMedia(g.media),
    // — rich detail (all optional; usually filled lazily through options.resolveDetail) —
    downloads: list(g.downloads).filter(d => d && str(d.label) && http(d.href)).map(d => ({ label: str(d.label), href: str(d.href), kind: str(d.kind), hint: str(d.hint) })),
    password: str(g.password),
    guide: list(g.guide).map(s => ({ title: str(s && s.title), steps: strList(s && s.steps) })).filter(s => s.steps.length),
    update: g.update && typeof g.update === 'object' && (str(g.update.date) || str(g.update.version) || str(g.update.text) || g.update.closed) ? { date: str(g.update.date), version: str(g.update.version), text: str(g.update.text), closed: !!g.update.closed } : null,
    facts: list(g.facts).filter(f => f && str(f.label) && str(f.value)).map(f => ({ label: str(f.label), value: str(f.value) })),
  };
}

/** @returns {{errors:string[], warnings:string[], stats:object}} */
function validate(data) {
  const errors = [], warnings = [];
  if (!data || typeof data !== 'object') return { errors: ['data must be an object'], warnings, stats: {} };
  const games = Array.isArray(data.games) ? data.games : null;
  if (!games) return { errors: ['`games` must be an array'], warnings, stats: {} };
  if (!games.length) warnings.push('`games` is empty — the UI will render an empty state.');

  const ids = new Set();
  games.forEach((g, i) => {
    const at = `games[${i}]${g && g.title ? ` (${g.title})` : ''}`;
    if (!g || typeof g !== 'object') return errors.push(`${at}: must be an object`);
    if (g.id == null || g.id === '') errors.push(`${at}: missing \`id\``);
    else if (ids.has(String(g.id))) errors.push(`${at}: duplicate id "${g.id}"`);
    else ids.add(String(g.id));
    if (!g.title) errors.push(`${at}: missing \`title\``);
    if (!g.steamAppId && !(g.art && (g.art.poster || g.art.hero))) warnings.push(`${at}: no steamAppId and no art overrides — the card will show an empty tile (no artwork)`);
    if (!g.downloadUrl) warnings.push(`${at}: no downloadUrl — "Get" buttons will do nothing unless you set options.onGet`);
    for (const k of ['downloadUrl', 'sourceUrl']) if (g[k] && !/^https?:\/\//i.test(g[k])) errors.push(`${at}: \`${k}\` must be an absolute http(s) URL (got "${g[k]}")`);
  });

  const refs = (list, key, where) => (list || []).forEach((x, i) => {
    const id = key ? x && x[key] : x;
    if (id != null && !ids.has(String(id))) errors.push(`${where}[${i}]: unknown game id "${id}"`);
  });
  refs(data.hero, 'gameId', 'hero');
  refs(data.featured, 'gameId', 'featured');
  (data.shelves || []).forEach((s, i) => {
    if (!s || !s.title) errors.push(`shelves[${i}]: missing \`title\``);
    refs(s && s.gameIds, null, `shelves[${i}].gameIds`);
  });
  if (data.hero && data.hero.length > 8) warnings.push('hero has more than 8 slides — consider fewer.');

  return { errors, warnings, stats: { games: games.length, hero: (data.hero || []).length, shelves: (data.shelves || []).length } };
}

/* ── src/js/glue/hide.js ── */
/**
 * Hide / restore the original page.
 * The original DOM is KEPT (so scrapers can still read it and the site's own JS keeps running); we only
 * hide <body>. Our host element is a child of <html>, outside <body>, so it stays visible.
 *   'display'    (default) body{display:none}   — cheapest; no layout, so lazy-load/IntersectionObserver on the site won't fire
 *   'visibility' body{visibility:hidden}        — keeps layout alive; use when scraping needs rendered/lazy content
 *   'none'       don't hide (debugging: see both)
 */
const STYLE_ID = 'hearth-hide';

function hideOriginal(mode = 'display') {
  if (mode === 'none') return;
  let st = document.getElementById(STYLE_ID);
  if (!st) { st = document.createElement('style'); st.id = STYLE_ID; (document.head || document.documentElement).appendChild(st); }
  const hide = mode === 'visibility' ? 'visibility:hidden!important' : 'display:none!important';
  // html background avoids a white flash while we scrape (document-start)
  st.textContent = `html.hearth-on>body{${hide}}html.hearth-on{background:#24262b!important;overflow:hidden!important}`;
  document.documentElement.classList.add('hearth-on');
}

function showOriginal() { document.documentElement.classList.remove('hearth-on'); }

/* ── src/js/glue/navwatch.js ── */
/**
 * Detect SPA navigation. No single API is reliable across sites and userscript sandboxes, so we layer:
 *   1. Navigation API 'navigatesuccess' (Chromium)         2. popstate + hashchange
 *   3. history.pushState/replaceState wrapper               4. a 500 ms URL poll as the safety net
 * `cb(url)` fires only when location.href actually changed. Returns a stop function.
 */
function watchNavigation(cb) {
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

/* ── src/js/glue/splash.js ── */
/**
 * Loading screen, shown at once (document-start) and removed when the redesign has painted, or when the original page was restored / it took too long.
 * It lives in its own shadow root, so neither the site nor the kit's stylesheet touches it. Colours come from the same theme as the UI.
 *   splash({ title: 'Online', accentTitle: '-Fix', letter: 'O', logo: url, accent: '#1ea7e0', ink: '#04141c', bg: '#24262b', timeoutMs: 25000 })
 */
function showSplash(o = {}) {
  const c = { title: 'Loading', accentTitle: '', letter: '', logo: '', accent: '#c6f432', ink: '#13150a', bg: '#24262b', timeoutMs: 25000, ...o };
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const mount = () => {
    if (document.getElementById('hearth-splash')) return;
    const host = document.createElement('div'); host.id = 'hearth-splash';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;transition:opacity .4s ease';
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>
      :host{all:initial}.w{position:fixed;inset:0;display:grid;place-items:center;background:${esc(c.bg)};color:#f2f3f5;font:600 15px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      .c{display:flex;flex-direction:column;align-items:center;gap:18px;animation:in .5s ease both}
      .lg{position:relative;width:84px;height:84px;border-radius:26px;background:${esc(c.accent)};display:grid;place-items:center;color:${esc(c.ink)};font:800 40px system-ui,sans-serif;box-shadow:0 0 0 0 ${esc(c.accent)};animation:pu 1.8s ease-out infinite;overflow:hidden}
      .lg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}.lg img.ok{opacity:1}
      .nm{font-size:22px;font-weight:800;letter-spacing:.01em}.nm b{color:${esc(c.accent)}}
      .bar{width:170px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}.bar i{display:block;width:40%;height:100%;border-radius:4px;background:${esc(c.accent)};animation:sl 1.15s ease-in-out infinite}
      @keyframes sl{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
      @keyframes pu{0%{box-shadow:0 0 0 0 color-mix(in srgb,${esc(c.accent)} 45%,transparent)}70%,100%{box-shadow:0 0 0 26px transparent}}
      @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){.lg,.bar i,.c{animation:none}}
    </style><div class="w"><div class="c"><div class="lg">${esc(c.letter || c.title[0] || '')}${c.logo ? `<img alt="" src="${esc(c.logo)}">` : ''}</div><div class="nm">${esc(c.title)}<b>${esc(c.accentTitle)}</b></div><div class="bar"><i></i></div></div></div>`;
    const img = sr.querySelector('img'); img && img.addEventListener('load', () => img.classList.add('ok'));
    document.documentElement.appendChild(host);
    const t0 = Date.now(); let seenOn = false;
    const done = () => { clearInterval(iv); host.style.opacity = '0'; host.style.pointerEvents = 'none'; setTimeout(() => host.remove(), 450); };
    const iv = setInterval(() => {
      const h = document.getElementById('hearth-host'), painted = h && h.shadowRoot && h.shadowRoot.querySelector('.page > *');
      const on = document.documentElement.classList.contains('hearth-on'); if (on) seenOn = true;
      if (painted) { clearInterval(iv); requestAnimationFrame(() => requestAnimationFrame(done)); }
      else if ((seenOn && !on) || Date.now() - t0 > c.timeoutMs) done();      // fell back to the original page, or took too long
    }, 60);
  };
  if (document.documentElement) mount(); else new MutationObserver((m, mo) => { if (document.documentElement) { mo.disconnect(); mount(); } }).observe(document, { childList: true });
}

/* ── src/js/glue/assets.js ── */
/** Fonts and images, loaded in ways that survive strict page CSP where possible. */

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap';

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
async function loadFonts(mode = 'link', href = FONT_HREF) {
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
function gmImageLoader() {
  const cache = new Map();
  return url => {
    if (!cache.has(url)) cache.set(url, gm(url, 'blob').then(b => URL.createObjectURL(b)));
    return cache.get(url);
  };
}

/* ── src/js/glue/run.js ── */
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
function run(cfg) {
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

/* ── src/js/glue/index.js ── */
/** HearthGlue: the Tampermonkey side. Normally you only call `run()`. */

return {run, hideOriginal, showOriginal, watchNavigation, loadFonts, gmImageLoader, FONT_HREF};
})();
if(typeof window!=='undefined')window.HearthGlue=HearthGlue;
