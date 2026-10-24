/*! hearth-kit v0.4.0 · HearthUI · built from src/js/ui/index.js — DO NOT EDIT, edit src/ and run `npm run build` */
var HearthUI=(function(){
'use strict';
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

/** Media strip items: { type:'image'|'video'|'embed', thumb, src, sources:[{src,type}], title }. Items without a usable thumbnail or source are dropped. */
function coerceMedia(v) {
  return list(v).map(m => {
    if (!m || typeof m !== 'object') return null;
    const type = m.type === 'video' || m.type === 'embed' ? m.type : 'image';
    const thumb = http(m.thumb) ? str(m.thumb) : '', src = http(m.src) ? str(m.src) : '';
    const sources = list(m.sources).filter(s => s && http(s.src)).map(s => ({ src: str(s.src), type: str(s.type) }));
    if (!thumb || (type === 'image' ? !(src || thumb) : type === 'video' ? !sources.length : !src)) return null;
    return { type, thumb, src: src || thumb, sources, title: str(m.title) };
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
    update: g.update && typeof g.update === 'object' && (str(g.update.date) || str(g.update.version) || str(g.update.text)) ? { date: str(g.update.date), version: str(g.update.version), text: str(g.update.text) } : null,
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

/* ── src/js/ui/core/data.js ── */
/**
 * normalize(): turn contract data (docs/04-data-contract.md) into render-ready data.
 * Only `games` is required. Everything else is derived when absent, so a scraper can start by
 * emitting just a list of games and get a complete storefront.
 */
function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const games = (Array.isArray(d.games) ? d.games : [])
    .filter(g => g && g.id != null && g.title)
    .map(coerceGame)
    .filter(g => (seen.has(g.id) ? false : seen.add(g.id)));
  const byId = new Map(games.map(g => [g.id, g]));
  const pick = ids => (ids || []).map(id => byId.get(String(id))).filter(Boolean);

  const site = { name: 'Hearth', mark: '', footer: '', user: null, ...(d.site || {}) };
  site.mark = site.mark || (site.name || 'h').trim().charAt(0).toLowerCase();
  // `user` is an object (signed in) or null. Initials are derived from the name when not given.
  site.user = site.user && typeof site.user === 'object' ? { ...site.user } : null;
  if (site.user) { site.user.name = String(site.user.name || '').trim(); site.user.initials = String(site.user.initials || site.user.name.slice(0, 2).toUpperCase()).trim(); }

  const nav = Array.isArray(d.nav) && d.nav.length ? d.nav : [
    { id: 'discover', label: 'Discover', view: 'home' },
    { id: 'games', label: 'Games', view: 'browse' },
    { id: 'library', label: 'Library', view: 'browse', filter: { saved: true } },
    { id: 'new', label: 'New', view: 'browse', filter: { sort: 'new' } },
  ];

  let categories = Array.isArray(d.categories) && d.categories.length ? d.categories.map(c => ({ id: slug(c.id || c.label), label: c.label || c.id })) : null;
  if (!categories) {
    const count = new Map();
    games.forEach(g => g.genres.forEach(t => count.set(t, (count.get(t) || 0) + 1)));
    categories = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([label]) => ({ id: slug(label), label }));
  }

  const heroSrc = Array.isArray(d.hero) && d.hero.length ? d.hero : games.filter(g => g.steamAppId || g.art.hero).slice(0, 5).map(g => ({ gameId: g.id }));
  const hero = heroSrc.map((s, i) => ({ game: byId.get(String(s.gameId)), eyebrow: s.eyebrow || (i ? 'Trending now' : 'Featured') })).filter(s => s.game);

  const featured = (Array.isArray(d.featured) ? d.featured : []).map(f => ({ ...f, game: byId.get(String(f.gameId)) })).filter(f => f.game).slice(0, 3);

  let shelves = (Array.isArray(d.shelves) ? d.shelves : []).map((s, i) => ({ id: s.id || 'shelf-' + i, title: s.title, style: s.style === 'ranked' ? 'ranked' : 'poster', games: pick(s.gameIds), filter: s.filter || null })).filter(s => s.games.length);
  if (!shelves.length && games.length) {
    shelves = [{ id: 'all', title: 'All games', style: 'poster', games: games.slice(0, 24), filter: {} }];
    categories.slice(0, 3).forEach(c => {
      const gs = games.filter(g => g.categories.includes(c.id));
      if (gs.length >= 4) shelves.push({ id: 'cat-' + c.id, title: c.label, style: 'poster', games: gs.slice(0, 24), filter: { category: c.id } });
    });
  }
  return { site, nav, categories, hero, featured, shelves, games, byId };
}

/** Games matching a browse filter: { category, query, sort: 'new'|'title', saved } */
function filterGames(D, filter = {}, savedIds = new Set()) {
  let list = D.games.slice();
  if (filter.category) list = list.filter(g => g.categories.includes(filter.category));
  if (filter.saved) list = list.filter(g => savedIds.has(g.id));
  const q = (filter.query || '').trim().toLowerCase();
  if (q) list = list.filter(g => [g.title, g.developer, g.publisher, g.tagline, ...g.genres].join(' ').toLowerCase().includes(q));
  if (filter.sort === 'new') list.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
  else if (filter.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  return list;
}

function similar(D, game, n = 3) {
  const explicit = game.similarIds.map(id => D.byId.get(id)).filter(Boolean);
  const auto = D.games.filter(x => x.id !== game.id && !explicit.includes(x) && x.genres.some(t => game.genres.includes(t)));
  return [...explicit, ...auto].slice(0, n);
}

/**
 * Append games to an already-normalized D (used by the grid's loadMore and by app.add()).
 * Games already present are kept, but any new `genres` (search tags) are merged into them.
 * Returns { added: [new games], merged: number of existing games that gained genres }.
 */
function addGames(D, list) {
  const added = []; let merged = 0;
  (Array.isArray(list) ? list : []).filter(g => g && g.id != null && g.title).map(coerceGame).forEach(g => {
    const ex = D.byId.get(g.id);
    if (!ex) { D.games.push(g); D.byId.set(g.id, g); added.push(g); return; }
    const more = g.genres.filter(t => !ex.genres.includes(t));
    if (more.length) { ex.genres.push(...more); merged++; }
  });
  return { added, merged };
}

/* ── src/js/ui/core/art.js ── */
/**
 * ARTWORK
 * An art slot is   <div class="layer is-skel"><img class="art-img" data-g data-kind></div>.
 *   · while its image is loading (or its source is still being resolved) the slot is a skeleton;
 *   · when the image arrives it fades in over the skeleton;
 *   · if nothing loads the slot becomes a flat, quiet tile (`is-failed`; posters then show the title as text).
 * LOGOS are the exception: they never show a skeleton. A logo slot (logoSlot()) starts as the game's title in plain text and
 * is swapped for the real logo image if (and when) one loads; if none loads the text simply stays.
 * There is NO generated artwork: a slot is either a skeleton, a real image, or an empty tile.
 *
 * Slots are filled lazily by createArt(): only slots near the viewport load, a few at a time, so a page with
 * hundreds of cards never fires hundreds of requests (or decodes) at once.
 */

const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
/** Build Steam CDN URLs from an app id. See docs/04-data-contract.md → "Steam artwork". */
const steam = {
  poster: id => `${STEAM}${id}/library_600x900.jpg`,
  hero: id => `${STEAM}${id}/library_hero.jpg`,
  logo: id => `${STEAM}${id}/logo.png`,
  logoAlt: id => `${STEAM}${id}/logo_2x.png`,
  logoLib: id => `${STEAM}${id}/library_logo.png`,
  logoLib2x: id => `${STEAM}${id}/library_logo_2x.png`,
  header: id => `${STEAM}${id}/header.jpg`,
  capsule: id => `${STEAM}${id}/capsule_616x353.jpg`,
};

/** Ordered list of URLs to try for one art slot: explicit `art.<kind>` → Steam CDN → `art.fallback` (never for logos). */
function candidates(game, kind) {
  const out = [], a = game.art || {};
  if (a[kind]) out.push(a[kind]);
  if (game.steamAppId) {
    out.push(steam[kind](game.steamAppId));
    if (kind === 'logo') out.push(steam.logoAlt(game.steamAppId), steam.logoLib(game.steamAppId), steam.logoLib2x(game.steamAppId)); // newer apps only ship the library_logo files
    if (kind === 'hero') out.push(steam.header(game.steamAppId)); // low-res but better than nothing
  }
  if (kind !== 'logo' && a.fallback) out.push(a.fallback);
  return [...new Set(out.map(safeUrl).filter(Boolean))];
}

/** The <img> of one slot. It has no src: createArt().hydrate() decides when (and from where) it loads. */
function artImg(game, kind, cls = '') {
  return `<img class="art-img ${cls}" alt="${kind === 'logo' ? esc(game.title) : ''}" data-g="${esc(game.id)}" data-kind="${kind}" data-title="${esc(game.title)}" decoding="async">`;
}

/** A game's logo: the title as text first, swapped for the logo image once it has loaded. No skeleton, no layout jump. */
function logoSlot(game, cls = '') {
  return `<div class="lg${cls ? ' ' + cls : ''}"><div class="fbt">${esc(game.title)}</div>${artImg(game, 'logo', 'logo')}</div>`;
}

/** A full-bleed art slot (poster, hero, header…). Starts as a skeleton. */
function layer(game, kind) {
  return `<div class="layer is-skel">${artImg(game, kind)}</div>`;
}

/** Copy what the resolver found into the (normalized) game. Only art and a few descriptive fields may change. */
function mergeArt(g, p) {
  if (!p || typeof p !== 'object') return;
  const n = parseInt(p.steamAppId, 10); if (n > 0) g.steamAppId = n;
  if (p.art && typeof p.art === 'object') for (const k of ['poster', 'hero', 'logo', 'header', 'fallback']) if (p.art[k]) g.art[k] = String(p.art[k]);
  for (const k of ['description', 'developer', 'publisher', 'rating']) if (p[k]) g[k] = String(p[k]);
  if (p.releaseYear && !g.releaseYear) g.releaseYear = parseInt(p.releaseYear, 10) || null;
}

/**
 * createArt({ root, loader, resolve, game }) → { hydrate(root, {force}), warm(root), settle(game), sweep(), destroy() }
 *   root          the element that contains every slot (scroll events are caught there: they don't cross a shadow root)
 *   game(id)      → the current normalized game (the data can be replaced while the app lives)
 *   resolve(game) → Promise<patch|null>   optional, called once per game right before its first slot loads
 *                   (patch: { steamAppId, art:{poster,hero,logo,header,fallback}, description, developer, … })
 *   loader(url)   → Promise<string>       optional (GM_xmlhttpRequest → blob: URL)
 *   resolveLogo(game, urls) → Promise<url|''>  optional: asked once when every candidate URL of a LOGO slot failed (e.g. SteamGridDB); the url it returns is tried last
 *   onMiss(game, kind, urls)              optional diagnostics hook: every candidate URL for a slot failed (a missing logo is common and fine)
 */
function createArt({ root: scope, loader = null, resolve = null, game, onMiss = null, resolveLogo = null }) {
  const MAX = 8;                                    // images loading at once (resolving art does not count: the resolver batches and limits itself)
  const pending = new Set(), queue = [], shows = [], patches = new Map();
  let active = 0, dead = false, timer = 0, last = 0, showRaf = 0;

  const slotOf = img => img.closest('.layer, .sa, .lg') || img;
  const near = el => { const r = el.getBoundingClientRect(); return r.bottom > -700 && r.top < innerHeight + 700 && r.right > -400 && r.left < innerWidth + 400; };

  function settle(g) {
    if (!resolve) return Promise.resolve();
    let p = patches.get(g.id);
    if (!p) { p = Promise.resolve().then(() => resolve(g)).catch(() => null); patches.set(g.id, p); }
    return p.then(patch => mergeArt(g, patch));     // merged into every new copy of the game (the data can be re-normalized)
  }

  const loadUrl = (img, url) => new Promise(res => {
    const done = v => { img.removeEventListener('load', onl); img.removeEventListener('error', one); res(v); };
    const onl = () => done(true), one = () => done(false);
    img.addEventListener('load', onl); img.addEventListener('error', one);
    Promise.resolve(loader ? loader(url) : url).then(src => { img.src = src; }, () => done(false));
  });

  function succeed(img) {
    const show = () => {
      if (!img.isConnected) return;
      img.classList.add('is-loaded');
      const l = slotOf(img); l.classList.remove('is-skel');
      if (img.dataset.kind === 'logo') l.classList.add('has-logo');      // the title text fades out, the logo takes its place
      const p = img.closest('.poster'); if (p) p.classList.add('has-img');
    };
    // decode first, then reveal at most 2 per frame: the frame that shows an image never pays for its decode,
    // and a burst of arrivals never uploads a dozen textures in the same frame
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { shows.push(show); if (!showRaf) showRaf = requestAnimationFrame(flushShows); });
  }
  function flushShows() { showRaf = 0; for (let n = 0; n < 2 && shows.length; n++) shows.shift()(); if (shows.length) showRaf = requestAnimationFrame(flushShows); }
  function fail(img) {
    if (img.dataset.kind === 'logo') {                // no logo: the title text that was there from the start simply stays
      const l = img.closest('.lg'); if (l) l.classList.add('no-logo');
      img.remove(); return;
    }
    const l = slotOf(img); l.classList.remove('is-skel'); l.classList.add('is-failed');
    const p = img.closest('.poster'); if (p) p.classList.add('is-fallback');
    img.remove();
  }

  /** A near slot: resolve its art first (outside the pool, so every visible game can be batched), then queue the load. */
  function begin(img) {
    const g = game(img.dataset.g); if (!g) return fail(img);
    if (img.dataset.kind !== 'logo') slotOf(img).classList.add('is-busy');   // (logos have no skeleton) only skeletons that are about to load shimmer; the rest stay still (animating 100 offscreen skeletons is not free)
    settle(g).then(() => { if (dead || !img.isConnected) return; queue.push(img); pump(); });
  }
  async function run(img) {
    if (dead || !img.isConnected) return;
    if (!near(slotOf(img))) { slotOf(img).classList.remove('is-busy'); pending.add(img); return; }   // scrolled far away while queued: wait for it to come back
    const g = game(img.dataset.g); if (!g) return fail(img);
    const urls = candidates(g, img.dataset.kind);
    for (const url of urls) {
      if (dead || !img.isConnected) return;
      if (await loadUrl(img, url)) return succeed(img);
    }
    if (img.dataset.kind === 'logo' && resolveLogo) {
      let u = ''; try { u = await resolveLogo(g, urls); } catch (e) { /* fall through to the text title */ }
      u = safeUrl(u); if (u && !dead && img.isConnected && await loadUrl(img, u)) return succeed(img);
    }
    try { onMiss && onMiss(g, img.dataset.kind, urls); } catch (e) { /* diagnostics only */ }
    fail(img);
  }
  function pump() {
    while (active < MAX && queue.length) { const img = queue.shift(); active++; run(img).catch(() => {}).finally(() => { active--; pump(); }); }
  }

  /** Queue every registered slot that is on (or close to) the screen, topmost first. */
  function sweep() {
    if (dead) return; last = Date.now();
    const hit = [];
    pending.forEach(img => {
      if (!img.isConnected) return pending.delete(img);
      const r = slotOf(img).getBoundingClientRect();
      if (r.bottom > -700 && r.top < innerHeight + 700 && r.right > -400 && r.left < innerWidth + 400) hit.push([r.top, r.left, img]);
    });
    hit.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([, , img]) => { pending.delete(img); begin(img); });
  }
  function later() {
    if (timer || dead) return;
    timer = setTimeout(() => { timer = 0; sweep(); }, Math.max(40, 90 - (Date.now() - last)));
  }

  const onScroll = () => later();
  addEventListener('resize', onScroll);
  scope.addEventListener('scroll', onScroll, { capture: true, passive: true });   // scroll doesn't bubble: capture catches the page AND every row

  return {
    settle, sweep,
    /** Register every un-hydrated slot under `root`. Slots of hero slides that are not showing wait for warm(). */
    hydrate(root, { force = false } = {}) {
      root.querySelectorAll('img.art-img[data-g]:not([data-h])').forEach(img => {
        if (!force && img.closest('.slide:not(.on)')) return;
        img.dataset.h = '1'; pending.add(img);
      });
      sweep();
    },
    warm(root) { if (root) this.hydrate(root, { force: true }); },
    destroy() { dead = true; clearTimeout(timer); cancelAnimationFrame(showRaf); shows.length = 0; pending.clear(); queue.length = 0; removeEventListener('resize', onScroll); scope.removeEventListener('scroll', onScroll, { capture: true }); },
  };
}

/* ── src/js/ui/core/enrich.js ── */
const FIELDS = ['description', 'developer', 'publisher', 'releaseYear', 'size', 'downloads', 'password', 'guide', 'update', 'facts', 'steamUrl', 'media'];
const ART_KEYS = ['poster', 'hero', 'logo', 'header', 'fallback'];

/**
 * Lazy detail data for the game sheet.
 *   resolve(game, push) → Promise<patch|null>  (options.resolveDetail) — called once per game, the first time its sheet opens.
 *   `push(partialPatch)` is optional: call it as often as you like to show data early (the sheet re-renders each time);
 *   the returned patch is the final one and the sheet stops showing skeletons.
 *   patch may carry: description, developer, publisher, releaseYear, size, downloads[], password, guide[], update, facts[], steamUrl, media[],
 *   and (new) steamAppId + art{poster,hero,logo,header,fallback}, which are merged into the game so its artwork can be found late.
 * Patches are cached by game id and re-applied to every new copy of the game (the data can be re-normalized).
 */
function createEnrich({ resolve }) {
  const calls = new Map(), patches = new Map(), parts = new Map(), listeners = new Map();
  function apply(g, p) {
    if (!p || typeof p !== 'object') return;
    const n = coerceGame({ id: g.id, title: g.title, ...p });
    for (const k of FIELDS) { const v = n[k]; if (Array.isArray(v) ? v.length : v) g[k] = v; }
    if (n.steamAppId) g.steamAppId = n.steamAppId;
    for (const k of ART_KEYS) if (n.art[k]) g.art[k] = n.art[k];
  }
  return {
    /** true once the final patch has arrived (or when there is nothing to wait for) */
    done: id => !resolve || patches.has(id),
    applyCached(g) { apply(g, parts.get(g.id)); apply(g, patches.get(g.id)); },
    /** `onPush` is called (with the game id) whenever a partial patch arrives; the latest listener per game wins. */
    get(g, onPush) {
      if (!resolve) return Promise.resolve();
      if (onPush) listeners.set(g.id, onPush);
      if (!calls.has(g.id)) {
        const push = p => { if (!p || typeof p !== 'object' || patches.has(g.id)) return; parts.set(g.id, { ...(parts.get(g.id) || {}), ...p }); const l = listeners.get(g.id); l && l(g.id); };
        calls.set(g.id, Promise.resolve().then(() => resolve(g, push)).catch(() => null).then(p => { patches.set(g.id, p); return p; }));
      }
      return calls.get(g.id).then(p => apply(g, p));
    },
  };
}

/* ── src/js/ui/core/motion.js ── */
/**
 * MOTION SYSTEM (see docs/03-motion.md)
 * CSS owns the timing tokens (--tf / --tb / --ts, --ease / --ein). This file mirrors the durations
 * for the few places JS has to wait for a transition, and holds the helpers that make "everything
 * animates out as well as in" cheap: reveal-on-scroll, view swapping, element removal.
 */
const T = { fast: 160, base: 320, slow: 700, swap: 200 };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = n => (reduced() ? 0 : n);

/**
 * Rise-and-fade `.rv` elements in as they scroll into view, as a cascade: everything that becomes visible in the same
 * frame is ordered top→bottom, left→right and started 40 ms apart (capped), so a full screen of cards ripples in
 * instead of popping. `lead` delays the first batch (used while the page itself is still fading in).
 * The motion is a CSS *animation* (`.rv.in`), so it never fights the cards' hover transitions. Returns a disconnect fn.
 */
function reveal(root, { lead = 0 } = {}) {
  const els = [...root.querySelectorAll('.rv:not(.in)')];
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return () => {}; }
  let first = true;
  const io = new IntersectionObserver(es => {
    const hit = es.filter(e => e.isIntersecting).map(e => ({ el: e.target, r: e.boundingClientRect })).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    if (!hit.length) return;
    const base = first ? lead : 0; first = false;
    hit.forEach(({ el }, n) => { el.style.setProperty('--d', (base + Math.min(n, 12) * 40) + 'ms'); el.classList.add('in'); io.unobserve(el); });
  }, { threshold: .05 });
  els.forEach(e => io.observe(e));
  return () => io.disconnect();
}

/** Animated "out → replace → in" for a container. `render` swaps the content while it is invisible. */
async function swap(el, render) {
  el.classList.add('is-out');
  await delay(ms(T.swap));
  render();
  void el.offsetWidth; // commit the "out" state so removing the class transitions
  el.classList.remove('is-out');
}

/** Animate an element out, then remove it. */
async function leave(el) {
  el.classList.add('is-leaving');
  await delay(ms(T.base));
  el.remove();
}

/* ── src/js/ui/core/icons.js ── */
/** Inline SVG icons (stroke = currentColor). Paths only, wrapped by `ic()`. */
const ICON = {
  download: '<path d="M12 4v11m0 0-5-5m5 5 5-5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  prev: '<path d="m15 5-7 7 7 7"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18Z"/>',
  drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="m5 13 2.4-7a2 2 0 0 1 1.9-1.4h5.4a2 2 0 0 1 1.9 1.4L19 13M7 16.5h.01M11 16.5h3"/>',
  fix: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7V21h3.3l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.5-.5-2.4Z"/>',
  torrent: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3Z"/><path d="M6 7h4M14 7h4"/>',
  ext: '<path d="M7 17 17 7M8 7h9v9"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>',
  bookmark: '<path d="M6 4h12v16l-6-4-6 4Z"/>',
  play: '<path d="M8 5.5v13l11-6.5Z"/>',
  steam: '<circle cx="15.5" cy="8.5" r="3.5"/><circle cx="8" cy="16" r="2.4"/><path d="m3 14.2 3.6 1.5M10 14.7l3.4-3.2M12.3 18.2A7 7 0 1 0 5 12"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9"/>',
};

function ic(path, size = 18, stroke = 2.4) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ── src/js/ui/components/button.js ── */
/**
 * Primary button: a lime pill with an arrow disc. On hover the disc's arrow slides out and a second
 * one slides in, the gap opens up; on press it squashes. No glow, no gradient — motion is the effect.
 * `attrs` is raw HTML attributes (already escaped by the caller).
 */
function button(label, { icon = ICON.download, attrs = '', cls = '' } = {}) {
  return `<button class="btn ${cls}" ${attrs}><span class="bl">${esc(label)}</span><span class="d">${ic(icon)}${ic(icon)}</span></button>`;
}

/** Secondary button: frosted glass pill (only used over imagery). */
function glassButton(label, attrs = '', cls = '') {
  return `<button class="btn glass ${cls}" ${attrs}>${esc(label)}</button>`;
}

/* ── src/js/ui/components/hero.js ── */
/** Hero carousel markup. `slides` = [{ game, eyebrow }]. */
function heroHtml(slides) {
  if (!slides.length) return '';
  const slide = ({ game: g, eyebrow }, i) => {
    const meta = [g.genres[0], g.releaseYear, g.size, g.rating].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('<i></i>');
    return `<article class="slide${i ? '' : ' on'}" aria-roledescription="slide" ${i ? 'aria-hidden="true"' : ''}>
      <div class="art">${layer(g, 'hero')}</div>
      <div class="info">
        <div class="chip-new"><i></i>${esc(eyebrow)}${g.tagline ? ' · ' + esc(g.tagline) : ''}</div>
        ${logoSlot(g)}
        <div class="tags">${meta}</div>
        <div class="acts">${button('Get game', { attrs: `data-get="${esc(g.id)}"` })}${glassButton('Details', `data-open="${esc(g.id)}"`)}</div>
      </div></article>`;
  };
  const segs = slides.length > 1 ? `<div class="segs" role="tablist" aria-label="Featured games">${slides.map(({ game: g }, i) => `<button class="sg${i ? '' : ' on'}" role="tab" aria-label="${esc(g.title)}" ${i ? '' : 'aria-current="true"'}><i></i></button>`).join('')}</div>` : '';
  return `<section class="hero" id="hero" aria-roledescription="carousel" aria-label="Featured games">${slides.map(slide).join('')}${segs}</section>`;
}

/**
 * Behaviour: crossfade slides, progress lines, autoplay that pauses on hover / focus / hidden tab /
 * scrolled-away, remaining-time-aware resume, swipe on touch. Autoplay is off under reduced motion.
 */
function initHero(hero, { autoplay = true, ms = 7000, warm = null } = {}) {
  if (!hero) return { destroy() {}, go() {} };
  const slides = [...hero.querySelectorAll('.slide')], segs = [...hero.querySelectorAll('.sg')];
  const auto = autoplay && !reduced() && slides.length > 1;
  hero.style.setProperty('--dur', ms + 'ms');
  if (!auto) hero.classList.add('static');
  let i = 0, timer = 0, left = ms, t0 = 0;
  const holds = new Set();

  const run = () => { clearTimeout(timer); if (!auto || holds.size) return; t0 = performance.now(); timer = setTimeout(() => go(i + 1), left); };
  const halt = () => { clearTimeout(timer); if (t0) left = Math.max(400, left - (performance.now() - t0)); t0 = 0; };
  const hold = (k, on) => { const was = holds.size; on ? holds.add(k) : holds.delete(k); if (was === holds.size) return; hero.classList.toggle('paused', holds.size > 0); holds.size ? halt() : run(); };

  function go(n) {
    n = (n + slides.length) % slides.length;
    if (n === i) return;
    slides[i].classList.remove('on'); slides[i].setAttribute('aria-hidden', 'true'); segs[i] && (segs[i].classList.remove('on'), segs[i].removeAttribute('aria-current'));
    i = n; warmNear();
    slides[i].classList.add('on'); slides[i].removeAttribute('aria-hidden');
    if (segs[i]) { void segs[i].offsetWidth; segs[i].classList.add('on'); segs[i].setAttribute('aria-current', 'true'); }
    left = ms; t0 = 0; run();
  }

  // only the first slide loads with the page; the next one is fetched while the first is showing, never all five at once
  const warmNear = () => { if (!warm || slides.length < 2) return; warm(slides[i]); warm(slides[(i + 1) % slides.length]); };
  const warmTimer = setTimeout(warmNear, 1200);
  segs.forEach((b, k) => b.addEventListener('click', () => go(k)));
  const mouse = e => e.pointerType === 'mouse';
  hero.addEventListener('pointerenter', e => mouse(e) && hold('hover', true));
  hero.addEventListener('pointerleave', e => mouse(e) && hold('hover', false));
  hero.addEventListener('focusin', () => hold('focus', true));
  hero.addEventListener('focusout', () => hold('focus', false));
  let sx = null;
  hero.addEventListener('pointerdown', e => { sx = !mouse(e) && !e.target.closest('button') ? e.clientX : null; });
  hero.addEventListener('pointerup', e => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
  const vis = () => hold('tab', document.hidden);
  document.addEventListener('visibilitychange', vis);
  let io;
  if ('IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => hold('offscreen', !e.isIntersecting), { threshold: .25 }); io.observe(hero); }

  run();
  return { go, destroy() { clearTimeout(timer); clearTimeout(warmTimer); document.removeEventListener('visibilitychange', vis); io && io.disconnect(); } };
}

/* ── src/js/ui/components/chips.js ── */
/** Category pills. `active` is a category id, or '' for "All". */
function chipsHtml(categories, active = '') {
  if (!categories.length) return '';
  const chip = (id, label) => `<button class="chip${id === active ? ' on' : ''}" data-cat="${esc(id)}" aria-pressed="${id === active}">${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="Categories">${chip('', 'All')}${categories.map(c => chip(c.id, c.label)).join('')}</div>`;
}

/* ── src/js/ui/components/featured.js ── */
/** Editorial tiles under the hero. Item: { game, kicker, headline, image: 'hero'|'poster', size: 'wide'|'narrow' }. */
function featuredHtml(items) {
  if (!items.length) return '';
  const cols = items.map((f, i) => ((f.size || (i === 0 ? 'wide' : 'narrow')) === 'wide' ? '2fr' : '1fr')).join(' ');
  const tile = (f, i) => {
    const g = f.game, kind = f.image || (i === 0 ? 'hero' : 'poster');
    return `<article class="fc" tabindex="0" role="button" aria-label="${esc(f.headline || g.title)}" data-open="${esc(g.id)}">
      ${layer(g, kind)}
      <div class="t">${f.kicker ? `<small>${esc(f.kicker)}</small>` : ''}<h3>${esc(f.headline || g.title)}</h3></div>
      <div class="st gl"><div class="pm">${layer(g, 'poster')}</div>
        <div><b>${esc(g.title)}</b><span>${esc([g.tagline || g.genres[0], g.size].filter(Boolean).join(' · '))}</span></div>
        ${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm' })}</div></article>`;
  };
  return `<section class="feat rv" style="--cols:${cols}">${items.map(tile).join('')}</section>`;
}

/* ── src/js/ui/components/card.js ── */
/** Poster card. `rank` (1..n) renders the big outlined number used by the "Top 10" shelf. */
function card(g, { rank = 0 } = {}) {
  const meta = [g.tagline || g.genres[0], g.size].filter(Boolean).join(' · ');
  return `<div class="card rv${rank ? ' rank' : ''}" tabindex="0" role="button" aria-label="${esc(g.title)}" data-open="${esc(g.id)}">
    ${rank ? `<div class="n" aria-hidden="true">${rank}</div>` : ''}
    <div class="poster">${layer(g, 'poster')}<div class="pt">${esc(g.title)}</div><div class="go">${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm w' })}</div></div>
    <h3>${esc(g.title)}</h3><p>${esc(meta)}</p></div>`;
}

/* ── src/js/ui/components/shelf.js ── */
/** A horizontally scrolling row of cards with a heading and a "See all" link. */
function shelfHtml(s) {
  const ranked = s.style === 'ranked';
  return `<section class="shelf" data-shelf="${esc(s.id)}">
    <div class="sh-h rv"><h2>${esc(s.title)}</h2>${s.filter ? `<button class="more" data-more="${esc(s.id)}">See all</button>` : ''}</div>
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${s.games.slice(0, ranked ? 10 : 30).map((g, i) => card(g, { rank: ranked ? i + 1 : 0 })).join('')}</div>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}

/** Wire scroll buttons; they hide at either end. Returns a cleanup fn. */
function initShelves(root) {
  const cleanups = [];
  root.querySelectorAll('.rw').forEach(rw => {
    const row = rw.querySelector('.row'), [pv, nx] = rw.querySelectorAll('.nx');
    const sync = () => { pv.classList.toggle('is-end', row.scrollLeft < 8); nx.classList.toggle('is-end', row.scrollLeft + row.clientWidth > row.scrollWidth - 8); };
    const by = dir => row.scrollBy({ left: dir * row.clientWidth * .8, behavior: 'smooth' });
    pv.onclick = () => by(-1); nx.onclick = () => by(1);
    row.addEventListener('scroll', sync, { passive: true });
    const ro = 'ResizeObserver' in window ? new ResizeObserver(sync) : null; ro && ro.observe(row);
    sync();
    cleanups.push(() => ro && ro.disconnect());
  });
  return () => cleanups.forEach(f => f());
}

/* ── src/js/ui/components/nav.js ── */
/** Is nav item `n` the current one? Home matches the home view; browse items match on saved/sort/category. */
function navActive(n, route) {
  if (n.view === 'home') return route.view === 'home';
  if (n.view !== 'browse' || route.view !== 'browse') return false;
  const a = n.filter || {}, b = route.filter || {};
  return !!a.saved === !!b.saved && (a.sort || '') === (b.sort || '') && (a.category || '') === (b.category || '');
}

/** Floating glass pill: sections + search. It is the only part of the top bar that stays on screen while scrolling. */
function barHtml(D, route) {
  return `<header class="bar"><nav class="gl pill" aria-label="Sections">
      ${D.nav.map(n => `<button data-nav-id="${esc(n.id)}"${navActive(n, route) ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</button>`).join('')}
      <button class="sb" data-search-toggle aria-label="Search" aria-expanded="false">${ic(ICON.search)}</button>
    </nav></header>`;
}

/**
 * The site mark (left) and the account button (right). They sit at the top of the scrolling page, so they scroll away
 * with it instead of floating over the content. No user (not signed in) → no account button, never the text "undefined".
 */
function cornerHtml(D) {
  const u = D.site.user, label = esc((u && u.name) || 'Account');
  const avatar = !u ? ''
    : u.avatarUrl && safeUrl(u.avatarUrl) ? `<button class="av" data-user aria-label="${label}"><img src="${esc(safeUrl(u.avatarUrl))}" alt=""></button>`
    : u.initials ? `<button class="av" data-user aria-label="${label}">${esc(u.initials)}</button>` : '';
  return `<button class="mark" data-nav="home" aria-label="${esc(D.site.name)} — home">${esc(D.site.mark)}</button><div class="bar-r">${avatar}</div>`;
}

/** Drop-down search field that lives under the pill. */
function searchHtml() {
  return `<div class="searchbox gl" role="search"><span class="si">${ic(ICON.search, 18)}</span><input type="search" placeholder="Search games, genres, studios…" aria-label="Search games" autocomplete="off" spellcheck="false"><button class="sx" data-search-clear aria-label="Clear search">${ic(ICON.close, 14)}</button></div>`;
}

/* ── src/js/ui/components/media.js ── */
/** The media strip (trailers + screenshots) under the sheet's header. Skeleton tiles while the details are still loading and a Steam id is known. */
function mediaHtml(g, { pending = false } = {}) {
  const items = g.media || [];
  if (!items.length) return pending && (g.steamAppId || g.steamUrl) ? `<div class="media"><div class="mstrip">${'<i class="mt sk"></i>'.repeat(3)}</div></div>` : '';
  const tiles = items.map((m, i) => `<button type="button" class="mt${m.type === 'image' ? '' : ' vid'}" data-media="${i}" aria-label="${esc(m.title || (m.type === 'image' ? 'Screenshot ' + (i + 1) : 'Trailer'))}"><img src="${esc(safeUrl(m.thumb))}" alt="" loading="lazy" decoding="async" draggable="false">${m.type === 'image' ? '' : `<span class="mt-play">${ic(ICON.play, 18, 2)}</span>`}</button>`).join('');
  return `<div class="media"><div class="mstrip" tabindex="0" aria-label="Trailers and screenshots">${tiles}</div></div>`;
}

/** Full-size viewer for one media item. Lives in the modal (outside the sheet) so a sheet re-render never closes it. */
function lightboxInner(items, i) {
  const m = items[i]; if (!m) return '';
  let body;
  if (m.type === 'video') body = `<video controls autoplay playsinline poster="${esc(safeUrl(m.thumb))}">${m.sources.map(s => `<source src="${esc(safeUrl(s.src))}"${s.type ? ` type="${esc(s.type)}"` : ''}>`).join('')}</video><div class="lb-err" hidden>This video can’t be played here.</div>`;
  else if (m.type === 'embed') body = `<iframe src="${esc(safeUrl(m.src))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  else body = `<img src="${esc(safeUrl(m.src))}" alt="" decoding="async">`;
  const many = items.length > 1;
  return `<button type="button" class="lb-x" data-lb-close aria-label="Close">${ic(ICON.close, 18)}</button>
    ${many ? `<button type="button" class="lb-n lb-p" data-lb-step="-1" aria-label="Previous">${ic(ICON.prev, 22)}</button><button type="button" class="lb-n lb-nx" data-lb-step="1" aria-label="Next">${ic(ICON.next, 22)}</button>` : ''}
    <div class="lb-m">${body}</div>
    <div class="lb-c">${many ? `${i + 1} / ${items.length}` : ''}</div>`;
}

/* ── src/js/ui/components/detail.js ── */
const DEMO_REQ = { minimum: { OS: 'Windows 10', CPU: 'Core i5-8400', RAM: '8 GB' }, recommended: { OS: 'Windows 11', CPU: 'Core i7-8700K', RAM: '16 GB' } };
const KIND_ICON = { hosters: ICON.cloud, drive: ICON.drive, fix: ICON.fix, torrent: ICON.torrent };
/** "1.5.1.2608" → "v1.5.1.2608", but "Build 16102" stays as it is (never "vBuild 16102"). */
const verLabel = v => (/^v?\d/i.test(v) ? 'v' + v.replace(/^v/i, '') : v);

/** The download list that opens directly under the Get button (one card, not a floating menu). */
function getBox(g, { pending, dlOpen }) {
  const dl = g.downloads, expandable = dl.length > 1 || pending;
  const label = 'Get game' + (g.size ? ' · ' + g.size : '');
  if (!expandable) return button(label, { attrs: `data-get="${esc(g.id)}"`, cls: 'w' });
  const rows = pending && !dl.length
    ? [1, 2, 3].map(() => '<div class="dl sk"><span class="di"></span><span class="dt"><i></i><i></i></span></div>').join('')
    : dl.map(d => `<a class="dl" href="${esc(safeUrl(d.href))}" target="_blank" rel="noopener noreferrer"><span class="di">${ic(KIND_ICON[d.kind] || ICON.download, 17)}</span><span class="dt"><b>${esc(d.label)}</b>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}</span><span class="da">${ic(ICON.ext, 15)}</span></a>`).join('');
  const pw = g.password ? `<div class="pw"><span>Archive password</span><code>${esc(g.password)}</code><button type="button" data-copy="${esc(g.password)}" aria-label="Copy password">${ic(ICON.copy, 14)}<em>Copy</em></button></div>` : '';
  return `<div class="getbox${dlOpen ? ' open' : ''}">${button(label, { icon: ICON.chev, attrs: `data-get="${esc(g.id)}" aria-expanded="${dlOpen ? 'true' : 'false'}"`, cls: 'w' })}<div class="dlp"><div class="dli"><div class="dlin">${rows}${pw}</div></div></div></div>`;
}

/** "How to connect": install / launch / join / host, as numbered cards. Skeleton lines while it is being fetched. */
function guideHtml(g, pending) {
  if (!g.guide.length) return pending ? '<h4>How to connect</h4><div class="guide"><section class="gsec sk"><i></i><i></i><i></i></section><section class="gsec sk"><i></i><i></i></section></div>' : '';
  return `<h4>How to connect</h4><div class="guide">${g.guide.map(s => `<section class="gsec">${s.title ? `<h5>${esc(s.title)}</h5>` : ''}<ol>${s.steps.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ol></section>`).join('')}</div>`;
}

/** Save-for-later, plus an "Open Steam" button next to it when the game has a Steam page link (the Save label shrinks to make room). */
function actsHtml(g, saved) {
  const steam = safeUrl(g.steamUrl), off = steam ? 'Save' : 'Save for later';
  const wish = `<button class="btn glass alt${saved ? ' on' : ''}" data-wish="${esc(g.id)}" data-off="${off}" aria-label="${saved ? 'Saved' : 'Save for later'}">${ic(ICON.heart)}<span>${saved ? 'Saved' : off}</span></button>`;
  if (!steam) return wish;
  return `<div class="acts">${wish}<a class="btn glass alt" href="${esc(steam)}" target="_blank" rel="noopener noreferrer">${ic(ICON.steam)}<span>Open Steam</span></a></div>`;
}

/** Game detail sheet (rendered into the modal). Sections with no data are omitted. */
function detailHtml(D, g, { saved = false, placeholders = false, pending = false, dlOpen = false } = {}) {
  const req = (g.requirements.minimum && Object.keys(g.requirements.minimum).length) || Object.keys(g.requirements.recommended).length ? g.requirements : placeholders ? DEMO_REQ : null;
  const reqBox = (title, o) => (o && Object.keys(o).length ? `<div><b>${title}</b>${Object.entries(o).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>` : '');
  const shots = g.screenshots.map(safeUrl).filter(Boolean);
  const shotsHtml = shots.length
    ? shots.slice(0, 6).map(u => `<div><img src="${esc(u)}" alt="" loading="lazy" decoding="async"></div>`).join('')
    : '';
  // base facts, in a fixed order; an entry in g.facts with the same label replaces the base value, the rest are appended
  const base = [['Developer', g.developer], ['Publisher', g.publisher], ['Released', g.releaseYear], ['Reception', g.rating], ['Genre', g.genres[0]], ['Size', g.size]];
  const extra = g.facts || [];
  const facts = [...base.map(([k, v]) => [k, (extra.find(f => f.label === k) || {}).value || v]), ...extra.filter(f => !base.some(([k]) => k === f.label)).map(f => [f.label, f.value])].filter(([, v]) => v);
  const upd = g.update ? `<div class="upd">${g.update.version ? `<span class="v">${esc(verLabel(g.update.version))}</span>` : ''}<div><b>${g.update.date ? 'Updated ' + esc(g.update.date) : 'Latest update'}</b>${g.update.text ? `<span>${esc(g.update.text)}</span>` : ''}</div></div>` : '';
  const sim = similar(D, g);
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="dh">${layer(g, 'hero')}${logoSlot(g)}</div>
  <div class="db"><div>
    ${mediaHtml(g, { pending })}
    ${g.description ? `<h4>About</h4><p>${esc(g.description)}</p>` : ''}
    ${upd}
    ${guideHtml(g, pending)}
    ${shotsHtml ? `<h4>Screenshots</h4><div class="shots">${shotsHtml}</div>` : ''}
    ${req ? `<h4>System requirements</h4><div class="req">${reqBox('Minimum', req.minimum)}${reqBox('Recommended', req.recommended)}</div>` : ''}
  </div>
  <aside class="side">${getBox(g, { pending, dlOpen })}
    ${actsHtml(g, saved)}
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${sim.length ? `<h4 class="sh4">Similar</h4>${sim.map(x => `<div class="sim" tabindex="0" role="button" data-open="${esc(x.id)}"><div class="sa is-skel">${artImg(x, 'header')}</div>${esc(x.title)}</div>`).join('')}` : ''}
  </aside></div>`;
}

/* ── src/js/ui/components/profile.js ── */
const LINK_ICON = { profile: ICON.user, bookmarks: ICON.bookmark, logout: ICON.logout };
const rows = a => (Array.isArray(a) ? a : []).filter(x => x && x.label && x.value != null && String(x.value).trim() !== '');

/**
 * The account sheet that the avatar opens (rendered into the same modal as the game sheet).
 *   u = D.site.user  { name, avatarUrl, initials, href }          (always there: this is what is known at once)
 *   p = options.resolveProfile(u) result, or null while it is loading / when there is none:
 *       { name, avatarUrl, badge, stats:[{label,value}], facts:[{label,value}], links:[{label,href,hint,kind:'profile'|'bookmarks'|'logout'}] }
 */
function profileHtml(u, p, { pending = false } = {}) {
  p = p || {};
  const name = p.name || u.name || 'Account', av = safeUrl(p.avatarUrl || u.avatarUrl);
  const stats = rows(p.stats), facts = rows(p.facts);
  const links = (Array.isArray(p.links) ? p.links : []).filter(l => l && l.label && safeUrl(l.href));
  if (!links.length && !pending && safeUrl(u.href)) links.push({ label: 'Open your profile on the site', href: u.href, kind: 'profile' });
  const sk = '<div class="facts psk"><div><i></i></div><div><i></i></div><div><i></i></div></div>';
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="ph">${av ? `<img class="ph-bg" src="${esc(av)}" alt="" aria-hidden="true">` : ''}
    <div class="pav">${av ? `<img src="${esc(av)}" alt="">` : esc(u.initials || name.slice(0, 2).toUpperCase())}</div>
    <div class="pm"><h3>${esc(name)}</h3>${p.badge ? `<span class="pbadge">${esc(p.badge)}</span>` : ''}</div></div>
  <div class="pb">
    ${stats.length ? `<div class="pstats">${stats.map(s => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
    ${facts.length ? `<div class="facts">${facts.map(f => `<div><span>${esc(f.label)}</span>${esc(f.value)}</div>`).join('')}</div>` : pending ? sk : ''}
    ${links.length ? `<div class="plinks">${links.map(l => `<a class="dl${l.kind === 'logout' ? ' out' : ''}" href="${esc(safeUrl(l.href))}" target="_blank" rel="noopener noreferrer"><span class="di">${ic(LINK_ICON[l.kind] || ICON.ext, 17)}</span><span class="dt"><b>${esc(l.label)}</b>${l.hint ? `<small>${esc(l.hint)}</small>` : ''}</span><span class="da">${ic(ICON.ext, 15)}</span></a>`).join('')}</div>` : ''}
  </div>`;
}

/* ── src/js/ui/components/browse.js ── */
/** The grid renders in chunks: a few hundred cards at once is ~12k DOM nodes and a visible stall on every tab change. */
const GRID_CHUNK = 24;

/** Grid view for category filters, search, "Library" and "See all". */
function browseHtml(D, route, savedIds) {
  const f = route.filter || {};
  const list = filterGames(D, f, savedIds);
  const cat = D.categories.find(c => c.id === f.category);
  const title = f.query ? `Results for “${f.query}”` : f.saved ? 'Your library' : cat ? cat.label : f.sort === 'new' ? 'New & recent' : 'All games';
  const empty = f.saved && !savedIds.size
    ? ['Nothing saved yet', 'Open any game and choose “Save for later”.']
    : ['Nothing matches', 'Try a different word or clear the filter.'];
  return `<div class="browse">
    <div class="bh"><h1>${esc(title)}</h1><span class="count">${list.length} ${list.length === 1 ? 'game' : 'games'}</span></div>
    ${f.saved ? '' : chipsHtml(D.categories, f.category || '')}
    ${list.length
      ? `<div class="grid">${list.slice(0, GRID_CHUNK).map(g => card(g)).join('')}</div>${list.length > GRID_CHUNK ? '<div class="more" aria-hidden="true"></div>' : ''}`
      : `<div class="empty"><h3>${empty[0]}</h3><p>${empty[1]}</p><button class="btn glass alt" data-nav="home">Back to discover</button></div>`}
  </div>`;
}

/**
 * Lazy-load the rest of the grid. Call after the browse HTML is in the DOM; returns a cleanup fn.
 *  · appends GRID_CHUNK cards whenever the sentinel (.more) comes within ~700px of the viewport (they fade in one after another);
 *  · when every local game is shown and `loadMore` was given, asks it for more:  loadMore({ view, filter }) → Promise<game[] | false>.
 *    Returned games are added to the data (and listed if they match the current filter). Resolve to false / [] when there is nothing left.
 *    While it is pending the grid ends in skeleton cards.
 */
function initGrid(root, D, route, savedIds, art, loadMore) {
  const grid = root.querySelector('.browse .grid'); if (!grid) return () => {};
  const f = route.filter || {}, shown = new Set([...grid.querySelectorAll('.card')].map(c => c.dataset.open)), stops = [];
  let busy = false, done = typeof loadMore !== 'function', dead = false;
  const list = () => filterGames(D, f, savedIds), pending = () => list().filter(g => !shown.has(g.id));
  let more = root.querySelector('.browse .more');
  if (!more) { more = document.createElement('div'); more.className = 'more'; more.setAttribute('aria-hidden', 'true'); grid.after(more); }
  const add = batch => {
    const tmp = document.createElement('div');
    tmp.innerHTML = batch.map(g => card(g)).join('');
    const nodes = [...tmp.children]; grid.append(...nodes); batch.forEach(g => shown.add(g.id));
    art.hydrate(grid); stops.push(reveal(grid));                   // observed once attached, so the cascade starts from what is really on screen
  };
  const skeletons = n => {
    const tmp = document.createElement('div');
    tmp.innerHTML = Array.from({ length: n }, () => '<div class="card skc" aria-hidden="true"><div class="poster"><div class="layer is-skel is-busy"></div></div><div class="skl"></div><div class="skl"></div></div>').join('');
    const els = [...tmp.children]; grid.append(...els); return () => els.forEach(e => e.remove());
  };
  const setCount = () => { const c = root.querySelector('.browse .count'); if (c) { const n = list().length; c.textContent = `${n} ${n === 1 ? 'game' : 'games'}`; } };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) step(); }, { rootMargin: '700px 0px' }) : null;
  async function step() {
    if (busy || dead) return; busy = true;
    try {
      const p = pending();
      if (p.length) add(p.slice(0, GRID_CHUNK));
      else if (!done) {
        const clear = skeletons(6); let got = false;
        try { got = await loadMore({ view: route.view, filter: { ...f } }); } catch (e) { console.error('[hearth] loadMore failed', e); }
        clear(); if (dead) return;
        if (Array.isArray(got) && got.length) { addGames(D, got); setCount(); } else done = true;
      }
    } finally { busy = false; }
    if (dead) return;
    if (done && !pending().length) { io && io.disconnect(); more.remove(); return; }
    if (io) { io.unobserve(more); io.observe(more); }        // re-check: the sentinel may still be on screen
  }
  if (!io) { add(pending()); more.remove(); return () => stops.forEach(s => s()); }
  io.observe(more);
  return () => { dead = true; io.disconnect(); stops.forEach(s => s()); };
}

/* ── src/js/ui/mount.js ── */
/**
 * mount({ target, data, css, shadow, options })  →  app
 *
 *  target   element the host <div> is appended to (default document.body)
 *  data     object following docs/04-data-contract.md
 *  css      CSS text. If given, the UI renders inside a Shadow DOM and adopts this stylesheet
 *           (this is the Tampermonkey path: the original site's CSS can't touch us, and vice versa).
 *           If omitted, the UI renders in the light DOM and expects dist/hearth.css to be linked (mockup/dev path).
 *  options  { autoplay, autoplayMs, placeholders, theme, saved, route, imageLoader,
 *             resolveDetail(game, push) → Promise<patch|null> // called once, the first time a game's sheet opens: { description, downloads[{label,href,kind,hint}], password, guide[{title,steps[]}], update{date,version,text}, facts[{label,value}], steamUrl, media[{type,thumb,src,sources,title}], steamAppId, art{} }; call push(partial) to show data early
 *             resolveArt(game) → Promise<patch|null>   // called lazily, once per game, right before its first image loads; patch = { steamAppId, art:{poster,hero,logo,header,fallback}, description, developer, … }
 *             resolveProfile(user) → Promise<profile|null>  // called when the avatar is first clicked: { name, avatarUrl, badge, stats[{label,value}], facts[{label,value}], links[{label,href,hint,kind}] }
 *             onGet(game, {button}) → false to cancel the default, onOpen(game), onClose(game), onRoute(route), onSave(game, on),
 *             resolveLogo(game, triedUrls) → Promise<url|''>   // optional: last-chance logo source (asked only when every Steam URL failed)
 *             onUser(user) → false to take over the avatar click (default: the kit's own account sheet opens), onArtMiss(game, kind, urls),
 *             loadMore({view, filter}) → Promise<game[] | false>   // called when the browse grid has shown every local game }
 *
 * app: { el, root, update(data), add(games), navigate(view, filter), open(id), close(), getRoute(), destroy() }
 */
function mount({ target = document.body, data, css = null, shadow, options = {} } = {}) {
  const opt = { autoplay: true, autoplayMs: 7000, placeholders: false, theme: null, saved: [], route: null, imageLoader: null, ...options };
  const host = document.createElement('div');
  host.id = 'hearth-host';
  const scope = (shadow ?? !!css) ? host.attachShadow({ mode: 'open' }) : host;
  if (css) adopt(scope, css);

  const root = document.createElement('div');
  root.className = 'hearth';
  if (opt.theme) Object.entries(opt.theme).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  root.innerHTML = `<div class="bar-slot"></div>
    <div class="scroll"><div class="top"></div><main class="page is-out"></main><footer class="foot"></footer></div>
    <div class="modal" aria-hidden="true"><div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"></div><div class="lb" aria-hidden="true" role="dialog" aria-label="Media viewer"></div></div>`;
  scope.appendChild(root);
  target.appendChild(host);

  const $bar = root.querySelector('.bar-slot'), $top = root.querySelector('.top'), $scroll = root.querySelector('.scroll'), $page = root.querySelector('.page'),
    $foot = root.querySelector('.foot'), $modal = root.querySelector('.modal'), $sheet = root.querySelector('.sheet'), $lb = root.querySelector('.lb');
  const active = () => scope.activeElement || document.activeElement;

  let D = normalize(data);
  const enrich = createEnrich({ resolve: opt.resolveDetail });
  let dlOpen = false;                                // the download panel of the open sheet is unfolded
  let profileOpen = false;                           // the open sheet is the account sheet, not a game
  const prof = { data: null, done: !opt.resolveProfile, call: null };
  const art = createArt({ root, loader: opt.imageLoader, resolve: opt.resolveArt, onMiss: opt.onArtMiss, resolveLogo: opt.resolveLogo, game: id => D.byId.get(String(id)) });
  const saved = new Set((opt.saved || []).map(String));
  let route = { view: 'home', filter: {}, ...(opt.route || {}) };
  let heroCtl, stopReveal, stopShelves, stopGrid, openId = null, lastFocus = null, swapping = false, searchFrom = null, destroyed = false;

  /* ── render ─────────────────────────────────────────────────────────────────────────────── */
  function homeHtml() {
    if (!D.games.length) return `<div class="empty has-bar"><h3>No games to show</h3><p>The page was read, but no games were found. Check the scraper selectors.</p></div>`;
    return heroHtml(D.hero) + chipsHtml(D.categories, '') + featuredHtml(D.featured) + D.shelves.map(shelfHtml).join('');
  }

  function paint() {
    heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid();
    $page.classList.toggle('has-bar', route.view !== 'home');
    $page.innerHTML = route.view === 'home' ? homeHtml() : browseHtml(D, route, saved);
    $scroll.scrollTop = 0;
    art.hydrate($page);
    stopReveal = reveal($page, { lead: 140 });
    stopShelves = initShelves($page);
    stopGrid = route.view === 'home' ? null : initGrid($page, D, route, saved, art, opt.loadMore);
    heroCtl = initHero($page.querySelector('#hero'), { autoplay: opt.autoplay, ms: opt.autoplayMs, warm: el => art.warm(el) });
    $foot.textContent = D.site.footer || '';
    syncNav();
  }

  let again = false, waiters = [];
  async function refresh() {
    if (destroyed) return;
    if (swapping) { again = true; return new Promise(r => waiters.push(r)); }      // a swap is running: repaint once more when it ends (the latest data/route wins)
    swapping = true;
    do { again = false; await swap($page, paint); } while (again && !destroyed);
    swapping = false; waiters.splice(0).forEach(r => r());                         // every caller resolves after the FINAL repaint
  }

  function renderBar() {
    $bar.innerHTML = barHtml(D, route) + searchHtml();
    $top.innerHTML = cornerHtml(D);
    $search = $bar.querySelector('.searchbox'); $input = $search.querySelector('input');
    $input.addEventListener('input', debounce(onSearch, 180));
  }
  let $search, $input;
  function syncNav() {
    D.nav.forEach(n => {
      const b = $bar.querySelector(`[data-nav-id="${CSS.escape(n.id)}"]`); if (!b) return;
      const on = navActive(n, route); b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
  }

  function go(view, filter = {}) {
    route = { view, filter: { ...filter } };
    opt.onRoute && opt.onRoute({ ...route });
    syncNav();
    return refresh();
  }

  /* ── search ─────────────────────────────────────────────────────────────────────────────── */
  const searchOpen = () => $search.classList.contains('open');
  function openSearch() {
    searchFrom = route.view === 'home' ? 'home' : 'browse';
    $search.classList.add('open'); $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'true');
    $input.focus();
  }
  function closeSearch() {
    if (!searchOpen()) return;
    const had = $input.value.trim();
    $search.classList.remove('open'); $input.value = ''; $input.blur();
    $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'false');
    if (had) go(searchFrom === 'home' ? 'home' : 'browse', searchFrom === 'home' ? {} : { ...route.filter, query: '' });
  }
  function onSearch() {
    const q = $input.value.trim();
    if (!q) return go(searchFrom === 'home' ? 'home' : 'browse', searchFrom === 'home' ? {} : { ...route.filter, query: '' });
    go('browse', { query: q });
  }

  /* ── detail modal ───────────────────────────────────────────────────────────────────────── */
  async function openGame(id) {
    const g = D.byId.get(String(id)); if (!g) return;
    if (openId === g.id && $modal.classList.contains('open')) return;
    if (openId !== g.id) dlOpen = false;
    profileOpen = false;
    enrich.applyCached(g);
    const fill = () => {
      const old = $sheet.querySelector('.mstrip'), sl = old ? old.scrollLeft : 0;
      $sheet.classList.remove('is-profile'); $sheet.innerHTML = detailHtml(D, g, { saved: saved.has(g.id), placeholders: opt.placeholders, pending: !enrich.done(g.id), dlOpen }); art.hydrate($sheet); $sheet.scrollTop = 0;
      const ns = sl && $sheet.querySelector('.mstrip'); if (ns) ns.scrollLeft = sl;       // a re-render (details arriving) keeps the strip where the person scrolled it
    };
    const sig = () => [g.description, g.developer, g.publisher, g.releaseYear, g.rating].join('|'), s0 = sig();
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    openId = g.id;
    // art/details that were still being resolved when the sheet opened: show them as soon as they arrive (the sheet never waits)
    if (opt.resolveArt) art.settle(g).then(() => { if (openId === g.id && sig() !== s0) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } });
    // downloads / how-to-connect / update info are fetched on demand: the sheet opens at once with skeletons and fills in when they arrive
    // (a resolver may also push partial patches: the sheet shows each one as it arrives)
    const refill = () => { if (openId === g.id) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } };
    if (!enrich.done(g.id)) enrich.get(g, () => { enrich.applyCached(g); refill(); }).then(refill);
    opt.onOpen && opt.onOpen(g);
  }
  /** The avatar: the kit's own account sheet (opens at once with what is known, fills in from options.resolveProfile). */
  async function openProfile() {
    const u = D.site.user; if (!u) return;
    if (opt.onUser) { let r; try { r = opt.onUser(u); } catch (e) { console.error('[hearth] onUser failed', e); } if (r === false) return; }
    if (profileOpen && $modal.classList.contains('open')) return closeGame();       // the avatar toggles the sheet
    if (prof.done && !prof.data && opt.resolveProfile) { prof.done = false; prof.call = null; }   // the last attempt failed: try again
    profileOpen = true; openId = null;
    const fill = () => { $sheet.classList.add('is-profile'); $sheet.innerHTML = profileHtml(D.site.user || u, prof.data, { pending: !prof.done }); $sheet.scrollTop = 0; };
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    if (!prof.done) {
      if (!prof.call) prof.call = Promise.resolve().then(() => opt.resolveProfile(u)).catch(e => { console.warn('[hearth] resolveProfile failed', e); return null; }).then(p => { prof.data = p; prof.done = true; return p; });
      prof.call.then(() => { if (profileOpen && $modal.classList.contains('open')) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } });
    }
  }
  function closeGame() {
    if (!$modal.classList.contains('open')) return;
    lbHide();
    $modal.classList.remove('open'); $modal.setAttribute('aria-hidden', 'true'); $scroll.classList.remove('is-locked');
    const was = D.byId.get(openId);
    openId = null; profileOpen = false;
    opt.onClose && was && opt.onClose(was);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
    if (route.filter && route.filter.saved) refresh();
  }
  function trapTab(e) {
    const f = [...$sheet.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const a = active();
    if (e.shiftKey && (a === f[0] || a === $sheet)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  /* ── actions ────────────────────────────────────────────────────────────────────────────── */
  function doGet(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    if (btn && btn.closest('.sheet')) {              // inside the sheet the options unfold under the button instead of a floating menu
      const box = btn.closest('.getbox');
      if (box) { dlOpen = !dlOpen; box.classList.toggle('open', dlOpen); btn.setAttribute('aria-expanded', String(dlOpen)); return; }
      if (g.downloads.length === 1) { window.open(safeUrl(g.downloads[0].href), '_blank', 'noopener'); return; }
    }
    let r; try { r = opt.onGet && opt.onGet(g, { button: btn }); } catch (e) { console.error('[hearth] onGet failed', e); }
    if (r === false) return;                       // onGet took over (e.g. opened its own menu): no default action and no "Starting…" flash
    if (g.downloadUrl && safeUrl(g.downloadUrl)) window.open(safeUrl(g.downloadUrl), '_blank', 'noopener');
    const bl = btn && btn.querySelector('.bl');
    if (bl && !btn.dataset.busy) { btn.dataset.busy = '1'; const t = bl.textContent; bl.textContent = 'Starting…'; setTimeout(() => { bl.textContent = t; delete btn.dataset.busy; }, 1600); }
  }
  /* ── media viewer ── */
  let lbI = -1, dragMoved = false;
  function lbShow(i) {
    const g = D.byId.get(openId), items = (g && g.media) || []; if (!items[i]) return;
    lbI = i; $lb.innerHTML = lightboxInner(items, i); $lb.classList.add('open'); $lb.setAttribute('aria-hidden', 'false');
    const v = $lb.querySelector('video');
    if (v) { const s = v.querySelectorAll('source'); s[s.length - 1].addEventListener('error', () => { v.hidden = true; $lb.querySelector('.lb-err').hidden = false; }); }   // every source failed (e.g. blocked by the page's CSP)
    const x = $lb.querySelector('.lb-x'); x && x.focus({ preventScroll: true });
  }
  function lbHide() {
    if (lbI < 0) return; lbI = -1;
    $lb.classList.remove('open'); $lb.setAttribute('aria-hidden', 'true'); $lb.innerHTML = '';       // also stops a playing video / embed
    $sheet.focus({ preventScroll: true });
  }
  function lbStep(d) { const g = D.byId.get(openId), n = (g && g.media && g.media.length) || 0; if (n > 1 && lbI >= 0) lbShow((lbI + d + n) % n); }
  let drag = null;                                     // mouse drag-to-scroll on the media strip
  $sheet.addEventListener('pointerdown', e => { const s = e.pointerType === 'mouse' && !e.button && e.target.closest && e.target.closest('.mstrip'); if (s) { drag = { s, x: e.clientX, l: s.scrollLeft }; dragMoved = false; } });
  root.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 5) { dragMoved = true; drag.s.scrollLeft = drag.l - dx; } });
  root.addEventListener('pointerup', () => { drag = null; setTimeout(() => { dragMoved = false; }, 0); });

  function toggleSaved(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    const on = !saved.has(g.id); on ? saved.add(g.id) : saved.delete(g.id);
    btn.classList.toggle('on', on); btn.querySelector('span').textContent = on ? 'Saved' : (btn.dataset.off || 'Save for later'); btn.setAttribute('aria-label', on ? 'Saved' : 'Save for later');
    opt.onSave && opt.onSave(g, on);
  }
  function navTo(item) {
    if (item.view === 'external' && item.href && safeUrl(item.href)) return window.open(safeUrl(item.href), '_blank', 'noopener');
    closeSearchSilently();
    go(item.view === 'home' ? 'home' : 'browse', item.view === 'home' ? {} : item.filter || {});
  }
  function closeSearchSilently() { if ($search && searchOpen()) { $search.classList.remove('open'); $input.value = ''; $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'false'); } }

  const onClick = e => {
    const t = e.target, q = s => t.closest(s);
    let el;
    if ((el = q('[data-copy]'))) {
      e.stopPropagation(); const v = el.dataset.copy, em = el.querySelector('em'), done = () => { el.classList.add('ok'); if (em) em.textContent = 'Copied'; setTimeout(() => { el.classList.remove('ok'); if (em) em.textContent = 'Copy'; }, 1400); };
      try { navigator.clipboard.writeText(v).then(done, () => {}); } catch (err) { /* clipboard blocked: the code is selectable */ } return;
    }
    if (q('[data-lb-close]')) return lbHide();
    if ((el = q('[data-lb-step]'))) return lbStep(+el.dataset.lbStep);
    if (t === $lb) return lbHide();                                  // the dark area around the media
    if ((el = q('[data-media]'))) return dragMoved ? undefined : lbShow(+el.dataset.media);
    if ((el = q('[data-get]'))) { e.stopPropagation(); return doGet(el.dataset.get, el); }
    if ((el = q('[data-wish]'))) return toggleSaved(el.dataset.wish, el);
    if (q('[data-close]')) return closeGame();
    if ((el = q('[data-nav-id]'))) { const n = D.nav.find(x => x.id === el.dataset.navId); return n && navTo(n); }
    if (q('[data-nav]')) { closeGame(); closeSearchSilently(); return go('home'); }
    if (q('[data-search-toggle]')) return searchOpen() ? closeSearch() : openSearch();
    if (q('[data-search-clear]')) { $input.value = ''; $input.focus(); return onSearch(); }
    if (q('[data-user]')) return openProfile();
    if ((el = q('[data-cat]'))) { const id = el.dataset.cat; if (!id && route.view === 'home') return; return go('browse', id ? { category: id } : {}); }
    if ((el = q('[data-more]'))) { const s = D.shelves.find(x => x.id === el.dataset.more); return s && go('browse', s.filter || {}); }
    if ((el = q('[data-open]'))) return openGame(el.dataset.open);
  };
  const onKey = e => {
    if (lbI >= 0) {                                                  // the media viewer is on top of everything
      if (e.key === 'Escape') { e.preventDefault(); return lbHide(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); return lbStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return lbStep(-1); }
      if (e.key === 'Tab') { e.preventDefault(); const x = $lb.querySelector('.lb-x'); return x && x.focus(); }
    }
    if (e.key === 'Escape') { if ($modal.classList.contains('open')) return closeGame(); if ($search && searchOpen()) return closeSearch(); }
    if (e.key === 'Tab' && $modal.classList.contains('open')) return trapTab(e);
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-open][role="button"]')) { e.preventDefault(); openGame(e.target.dataset.open); }
  };
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  /* ── boot ───────────────────────────────────────────────────────────────────────────────── */
  renderBar();
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.add('ready'); $page.classList.remove('is-out'); }));

  return {
    el: host, root,
    /** Replace the data. `to` ({view, filter}) sets the route in the same transition (one swap, not two). */
    update(next, to) {
      D = normalize(next);
      if (to && to.view) { route = { view: to.view, filter: { ...(to.filter || {}) } }; opt.onRoute && opt.onRoute({ ...route }); }
      if (openId && !D.byId.get(openId)) closeGame();
      renderBar();
      return refresh();
    },
    /** Add games to the running app without a full re-render (e.g. search results). Existing games only gain new search tags. */
    add(list) { const { added, merged } = addGames(D, list); return (added.length || merged) && route.view === 'browse' ? refresh() : Promise.resolve(); },
    navigate(view, filter) { return go(view, filter); },
    open: openGame, close: closeGame,
    getRoute: () => ({ view: route.view, filter: { ...route.filter } }),
    destroy() { destroyed = true; art.destroy(); heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid(); document.removeEventListener('keydown', onKey); host.remove(); },
  };
}

function adopt(scope, css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sh]; }
  catch (e) { const s = document.createElement('style'); s.textContent = css; scope.appendChild(s); }
}

/* ── src/js/ui/index.js ── */
const version = '0.4.0';
/** Capability flags, so userscripts can adapt to the kit they were loaded with. */
const features = { lazyGrid: true, skeletons: true, loadMore: true, lazyArt: true, addGames: true, noGeneratedArt: true, richDetail: true, profile: true, logoText: true, media: true, steamLink: true, detailPush: true };

return {mount, validate, steam, normalize, version, features};
})();
if(typeof window!=='undefined')window.HearthUI=HearthUI;
