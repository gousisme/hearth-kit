/*! hearth-kit v0.1.0 · HearthUI · built from src/js/ui/index.js — DO NOT EDIT, edit src/ and run `npm run build` */
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

/** Small stable string hash (unsigned 32-bit). Used to seed generated key art. */
function hash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
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
    art: { poster: str(art.poster), hero: str(art.hero), logo: str(art.logo), header: str(art.header) },
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
    hue: Number.isFinite(parseFloat(g.hue)) ? parseFloat(g.hue) : null,
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
    if (!g.steamAppId && !(g.art && (g.art.poster || g.art.hero))) warnings.push(`${at}: no steamAppId and no art overrides — will use generated key art`);
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

/* ── src/js/ui/core/art.js ── */
/**
 * ARTWORK
 * Every image slot is a stack:   generated key art (always there)  <  real image (fades in on load).
 * Real images are tried in order (`candidates`); if all fail the generated art simply stays.
 * Logos are the exception: if no logo loads we render the game title as text instead.
 */

const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
/** Build Steam CDN URLs from an app id. See docs/04-data-contract.md → "Steam artwork". */
const steam = {
  poster: id => `${STEAM}${id}/library_600x900.jpg`,
  hero: id => `${STEAM}${id}/library_hero.jpg`,
  logo: id => `${STEAM}${id}/logo.png`,
  header: id => `${STEAM}${id}/header.jpg`,
  capsule: id => `${STEAM}${id}/capsule_616x353.jpg`,
};

/** Ordered list of URLs to try for one art slot. Explicit `art.*` overrides win over Steam. */
function candidates(game, kind) {
  const out = [];
  const own = game.art && game.art[kind];
  if (own) out.push(own);
  if (game.steamAppId) {
    out.push(steam[kind](game.steamAppId));
    if (kind === 'hero') out.push(steam.header(game.steamAppId)); // low-res but better than nothing
  }
  return [...new Set(out.map(safeUrl).filter(Boolean))];
}

/** <img> that is hydrated later by `hydrate()` (so we can retry, fall back and fade in). */
function artImg(game, kind, cls = '') {
  const list = candidates(game, kind);
  if (!list.length) return '';
  return `<img class="art-img ${cls}" alt="${kind === 'logo' ? esc(game.title) : ''}" data-kind="${kind}" data-title="${esc(game.title)}" data-cands="${esc(JSON.stringify(list))}" decoding="async" ${kind === 'logo' ? '' : 'loading="lazy"'}>`;
}

/** Generated art + real image stacked in a .layer. */
function layer(game, kind, w, h, key = '') {
  return `<div class="layer">${keyArt(game, w, h, key)}${artImg(game, kind)}</div>`;
}

/**
 * Wire up every un-hydrated <img data-cands> under `root`.
 * `loader(url) -> Promise<string>` (optional) lets the Tampermonkey glue fetch images through
 * GM_xmlhttpRequest when the host page's CSP blocks the Steam CDN.
 */
function hydrate(root, loader) {
  root.querySelectorAll('img[data-cands]:not([data-h])').forEach(img => {
    img.dataset.h = '1';
    let list = [];
    try { list = JSON.parse(img.dataset.cands); } catch (e) { /* ignore */ }
    let i = 0;
    const next = async () => {
      if (i >= list.length) return fail(img);
      const url = list[i++];
      try { img.src = loader ? await loader(url) : url; } catch (e) { next(); }
    };
    img.addEventListener('load', () => { img.classList.add('is-loaded'); const p = img.closest('.poster'); if (p) p.classList.add('has-img'); });
    img.addEventListener('error', next);
    next();
  });
}

function fail(img) {
  if (img.dataset.kind === 'logo') {
    const t = document.createElement('div');
    t.className = 'fbt';
    t.textContent = img.dataset.title || '';
    img.replaceWith(t);
    return;
  }
  const p = img.closest('.poster');
  if (p) p.classList.add('is-fallback');
  img.remove();
}

/* ── Generated key art: seeded layered landscape, deterministic per game ───────────────────── */
function rnd(seed) { let x = seed * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); }
let svgUid = 0;

function keyArt(g, w, h, key = '') {
  const hv = g.hue != null ? g.hue : hash(g.id) % 360;
  const sd = g.steamAppId || hash(g.id);
  const r = rnd(hv * 7 + (sd % 97)), H = hv, H2 = (H + 40 + r() * 60) % 360, id = 'ka' + svgUid++ + key, m = sd % 4;
  let L = '', sun = '';
  const sx = w * (.28 + r() * .44);
  if (m == 0) {
    sun = `<circle cx="${sx}" cy="${h * .34}" r="${h * .13}" fill="hsl(${H} 80% 85%)" opacity=".85"/>`;
    for (let n = 0; n < 4; n++) { const y0 = h * (.45 + n * .14), amp = h * (.16 - n * .02); let p = `M0 ${h}L0 ${y0}`; for (let q = 0; q <= 9; q++) p += `L${q * w / 9} ${y0 - r() * amp}`; L += `<path d="${p}L${w} ${h}Z" fill="hsl(${H} ${28 - n * 3}% ${30 - n * 7}%)"/>`; }
  } else if (m == 1) {
    sun = `<circle cx="${sx}" cy="${h * .52}" r="${h * .2}" fill="hsl(${H} 85% 70%)" opacity=".9"/>`;
    for (let n = 0; n < 3; n++) {
      const c = Math.round(w / (34 - n * 7)); let x = 0;
      while (x < w) {
        const bw = w / c * (.7 + r() * .9), bh = h * (.22 + r() * .3) * (1 + n * .25), y = h * .98 - bh + (2 - n) * h * .04;
        L += `<rect x="${x}" y="${y}" width="${bw}" height="${h - y}" fill="hsl(${H2} ${22 - n * 4}% ${24 - n * 7}%)"/>`;
        if (n == 2) for (let q = 0; q < 3; q++) L += `<rect x="${x + bw * (.2 + r() * .5)}" y="${y + bh * (.1 + r() * .7)}" width="${bw * .1}" height="${bw * .14}" fill="hsl(48 90% 70%)" opacity=".7"/>`;
        x += bw + 1;
      }
    }
  } else if (m == 2) {
    sun = `<circle cx="${sx}" cy="${h * .3}" r="${h * .1}" fill="hsl(${H} 70% 90%)" opacity=".8"/>`;
    for (let n = 0; n < 3; n++) {
      const base = h * (.6 + n * .14), th = h * (.3 - n * .05), c = Math.round(w / (26 - n * 6)); let p = `M0 ${h}L0 ${base}`;
      for (let q = 0; q < c; q++) { const x = q * w / c; p += `L${x + w / c * .5} ${base - th * (.5 + r() * .6)}L${x + w / c} ${base}`; }
      L += `<path d="${p}L${w} ${h}Z" fill="hsl(${H} ${34 - n * 6}% ${26 - n * 8}%)"/><rect y="${base - h * .04}" width="${w}" height="${h * .12}" fill="hsl(${H2} 30% 60%)" opacity=".12"/>`;
    }
  } else {
    sun = `<circle cx="${sx}" cy="${h * .5}" r="${h * .16}" fill="hsl(${H} 90% 82%)"/>`;
    let p = `M0 ${h * .58}`; for (let q = 0; q <= 5; q++) p += `L${q * w / 5} ${h * (.5 + r() * .07)}`;
    L += `<path d="${p}L${w} ${h * .6}L0 ${h * .6}Z" fill="hsl(${H2} 20% 22%)"/><rect y="${h * .58}" width="${w}" height="${h * .42}" fill="hsl(${H} 40% 26%)"/>`;
    for (let q = 0; q < 14; q++) { const y = h * (.6 + q * .028), wd = w * (.1 + r() * .35 * (1 - q / 18)); L += `<rect x="${sx - wd / 2 + (r() - .5) * w * .1}" y="${y}" width="${wd}" height="${h * .006 + q * .5}" rx="2" fill="hsl(${H} 85% 85%)" opacity="${.5 - q * .03}"/>`; }
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${H2} 38% 18%)"/><stop offset=".75" stop-color="hsl(${H} 55% 50%)"/></linearGradient><filter id="n${id}"><feTurbulence baseFrequency=".9" numOctaves="2" seed="${Math.round(hv)}"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .08 0"/></filter></defs><rect width="${w}" height="${h}" fill="url(#s${id})"/>${sun}${L}<rect width="${w}" height="${h}" filter="url(#n${id})"/></svg>`;
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

/** Fade/slide `.rv` elements in once they scroll into view. Returns a disconnect fn. */
function reveal(root) {
  const els = [...root.querySelectorAll('.rv:not(.in)')];
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return () => {}; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
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
      <div class="art"><div class="layer">${keyArt(g, 1600, 800, 'h')}${artImg(g, 'hero')}</div></div>
      <div class="info">
        <div class="chip-new"><i></i>${esc(eyebrow)}${g.tagline ? ' · ' + esc(g.tagline) : ''}</div>
        <div class="lg">${artImg(g, 'logo', 'logo') || `<div class="fbt">${esc(g.title)}</div>`}</div>
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
function initHero(hero, { autoplay = true, ms = 7000 } = {}) {
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
    i = n;
    slides[i].classList.add('on'); slides[i].removeAttribute('aria-hidden');
    if (segs[i]) { void segs[i].offsetWidth; segs[i].classList.add('on'); segs[i].setAttribute('aria-current', 'true'); }
    left = ms; t0 = 0; run();
  }

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
  return { go, destroy() { clearTimeout(timer); document.removeEventListener('visibilitychange', vis); io && io.disconnect(); } };
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
      ${layer(g, kind, kind === 'hero' ? 1600 : 400, kind === 'hero' ? 900 : 600, 'f')}
      <div class="t">${f.kicker ? `<small>${esc(f.kicker)}</small>` : ''}<h3>${esc(f.headline || g.title)}</h3></div>
      <div class="st gl"><div class="pm">${layer(g, 'poster', 104, 104, 'p')}</div>
        <div><b>${esc(g.title)}</b><span>${esc([g.tagline || g.genres[0], g.size].filter(Boolean).join(' · '))}</span></div>
        ${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm' })}</div></article>`;
  };
  return `<section class="feat rv" style="--cols:${cols}">${items.map(tile).join('')}</section>`;
}

/* ── src/js/ui/components/card.js ── */
/** Poster card. `rank` (1..n) renders the big outlined number used by the "Top 10" shelf. */
function card(g, { rank = 0, i = 0, reveal = false } = {}) {
  const meta = [g.tagline || g.genres[0], g.size].filter(Boolean).join(' · ');
  return `<div class="card${rank ? ' rank' : ''}${reveal ? ' rv' : ''}" tabindex="0" role="button" aria-label="${esc(g.title)}" data-open="${esc(g.id)}" ${reveal ? `style="--i:${Math.min(i, 14)}"` : ''}>
    ${rank ? `<div class="n" aria-hidden="true">${rank}</div>` : ''}
    <div class="poster">${layer(g, 'poster', 400, 600)}<div class="pt">${esc(g.title)}</div><div class="go">${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm w' })}</div></div>
    <h3>${esc(g.title)}</h3><p>${esc(meta)}</p></div>`;
}

/* ── src/js/ui/components/shelf.js ── */
/** A horizontally scrolling row of cards with a heading and a "See all" link. */
function shelfHtml(s) {
  const ranked = s.style === 'ranked';
  return `<section class="shelf rv" data-shelf="${esc(s.id)}">
    <div class="sh-h"><h2>${esc(s.title)}</h2>${s.filter ? `<button class="more" data-more="${esc(s.id)}">See all</button>` : ''}</div>
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

/** Floating glass bar: mark (left) · pill nav + search (centre) · user (right). */
function barHtml(D, route) {
  const u = D.site.user;
  const avatar = u && (u.avatarUrl && safeUrl(u.avatarUrl)
    ? `<button class="av" data-user aria-label="Account"><img src="${esc(safeUrl(u.avatarUrl))}" alt=""></button>`
    : u.initials ? `<button class="av" data-user aria-label="Account">${esc(u.initials)}</button>` : '');
  return `<header class="bar">
    <button class="mark" data-nav="home" aria-label="${esc(D.site.name)} — home">${esc(D.site.mark)}</button>
    <nav class="gl pill" aria-label="Sections">
      ${D.nav.map(n => `<button data-nav-id="${esc(n.id)}"${navActive(n, route) ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</button>`).join('')}
      <button class="sb" data-search-toggle aria-label="Search" aria-expanded="false">${ic(ICON.search)}</button>
    </nav>
    <div class="bar-r">${avatar}</div></header>`;
}

/** Drop-down search field that lives under the pill. */
function searchHtml() {
  return `<div class="searchbox gl" role="search"><span class="si">${ic(ICON.search, 18)}</span><input type="search" placeholder="Search games, genres, studios…" aria-label="Search games" autocomplete="off" spellcheck="false"><button class="sx" data-search-clear aria-label="Clear search">${ic(ICON.close, 14)}</button></div>`;
}

/* ── src/js/ui/components/detail.js ── */
const DEMO_REQ = { minimum: { OS: 'Windows 10', CPU: 'Core i5-8400', RAM: '8 GB' }, recommended: { OS: 'Windows 11', CPU: 'Core i7-8700K', RAM: '16 GB' } };

/** Game detail sheet (rendered into the modal). Sections with no data are omitted. */
function detailHtml(D, g, { saved = false, placeholders = false } = {}) {
  const req = (g.requirements.minimum && Object.keys(g.requirements.minimum).length) || Object.keys(g.requirements.recommended).length ? g.requirements : placeholders ? DEMO_REQ : null;
  const reqBox = (title, o) => (o && Object.keys(o).length ? `<div><b>${title}</b>${Object.entries(o).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>` : '');
  const shots = g.screenshots.map(safeUrl).filter(Boolean);
  const shotsHtml = shots.length
    ? shots.slice(0, 6).map(u => `<div><img src="${esc(u)}" alt="" loading="lazy"></div>`).join('')
    : placeholders ? [1, 2, 3].map(i => `<div>${keyArt({ ...g, hue: (g.hue ?? 0) + i * 9 }, 320, 180, 's' + i)}</div>`).join('') : '';
  const facts = [['Developer', g.developer], ['Publisher', g.publisher], ['Released', g.releaseYear], ['Reception', g.rating], ['Genre', g.genres[0]], ['Size', g.size]].filter(([, v]) => v);
  const sim = similar(D, g);
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="dh">${layer(g, 'hero', 1600, 800, 'd')}${artImg(g, 'logo', 'logo') || `<div class="fbt">${esc(g.title)}</div>`}</div>
  <div class="db"><div>
    ${g.description ? `<h4>About</h4><p>${esc(g.description)}</p>` : ''}
    ${shotsHtml ? `<h4>Screenshots</h4><div class="shots">${shotsHtml}</div>` : ''}
    ${req ? `<h4>System requirements</h4><div class="req">${reqBox('Minimum', req.minimum)}${reqBox('Recommended', req.recommended)}</div>` : ''}
  </div>
  <aside class="side">${button('Get game' + (g.size ? ' · ' + g.size : ''), { attrs: `data-get="${esc(g.id)}"`, cls: 'w' })}
    <button class="btn glass alt${saved ? ' on' : ''}" data-wish="${esc(g.id)}">${ic(ICON.heart)}<span>${saved ? 'Saved' : 'Save for later'}</span></button>
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${sim.length ? `<h4 class="sh4">Similar</h4>${sim.map(x => `<div class="sim" tabindex="0" role="button" data-open="${esc(x.id)}"><div class="sa">${keyArt(x, 230, 108, 'm')}${artImg(x, 'header')}</div>${esc(x.title)}</div>`).join('')}` : ''}
  </aside></div>`;
}

/* ── src/js/ui/components/browse.js ── */
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
      ? `<div class="grid">${list.map((g, i) => card(g, { i, reveal: true })).join('')}</div>`
      : `<div class="empty"><h3>${empty[0]}</h3><p>${empty[1]}</p><button class="btn glass alt" data-nav="home">Back to discover</button></div>`}
  </div>`;
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
 *             onGet(game, {button}) → false to cancel the default, onOpen(game), onClose(game), onRoute(route), onSave(game, on), onUser() }
 *
 * app: { el, root, update(data), navigate(view, filter), open(id), close(), getRoute(), destroy() }
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
    <div class="scroll"><main class="page is-out"></main><footer class="foot"></footer></div>
    <div class="modal" aria-hidden="true"><div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"></div></div>`;
  scope.appendChild(root);
  target.appendChild(host);

  const $bar = root.querySelector('.bar-slot'), $scroll = root.querySelector('.scroll'), $page = root.querySelector('.page'),
    $foot = root.querySelector('.foot'), $modal = root.querySelector('.modal'), $sheet = root.querySelector('.sheet');
  const active = () => scope.activeElement || document.activeElement;

  let D = normalize(data);
  const saved = new Set((opt.saved || []).map(String));
  let route = { view: 'home', filter: {}, ...(opt.route || {}) };
  let heroCtl, stopReveal, stopShelves, openId = null, lastFocus = null, swapping = false, searchFrom = null, destroyed = false;

  /* ── render ─────────────────────────────────────────────────────────────────────────────── */
  function homeHtml() {
    if (!D.games.length) return `<div class="empty has-bar"><h3>No games to show</h3><p>The page was read, but no games were found. Check the scraper selectors.</p></div>`;
    return heroHtml(D.hero) + chipsHtml(D.categories, '') + featuredHtml(D.featured) + D.shelves.map(shelfHtml).join('');
  }

  function paint() {
    heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves();
    $page.classList.toggle('has-bar', route.view !== 'home');
    $page.innerHTML = route.view === 'home' ? homeHtml() : browseHtml(D, route, saved);
    $scroll.scrollTop = 0;
    hydrate($page, opt.imageLoader);
    stopReveal = reveal($page);
    stopShelves = initShelves($page);
    heroCtl = initHero($page.querySelector('#hero'), { autoplay: opt.autoplay, ms: opt.autoplayMs });
    $foot.textContent = D.site.footer || '';
    syncNav();
  }

  async function refresh() {
    if (swapping || destroyed) return;
    swapping = true;
    await swap($page, paint);
    swapping = false;
  }

  function renderBar() {
    $bar.innerHTML = barHtml(D, route) + searchHtml();
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
    const fill = () => { $sheet.innerHTML = detailHtml(D, g, { saved: saved.has(g.id), placeholders: opt.placeholders }); hydrate($sheet, opt.imageLoader); $sheet.scrollTop = 0; };
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    openId = g.id;
    opt.onOpen && opt.onOpen(g);
  }
  function closeGame() {
    if (!$modal.classList.contains('open')) return;
    $modal.classList.remove('open'); $modal.setAttribute('aria-hidden', 'true'); $scroll.classList.remove('is-locked');
    const was = D.byId.get(openId);
    openId = null;
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
    let r; try { r = opt.onGet && opt.onGet(g, { button: btn }); } catch (e) { console.error('[hearth] onGet failed', e); }
    if (r !== false && g.downloadUrl && safeUrl(g.downloadUrl)) window.open(safeUrl(g.downloadUrl), '_blank', 'noopener');
    const bl = btn && btn.querySelector('.bl');
    if (bl && !btn.dataset.busy) { btn.dataset.busy = '1'; const t = bl.textContent; bl.textContent = 'Starting…'; setTimeout(() => { bl.textContent = t; delete btn.dataset.busy; }, 1600); }
  }
  function toggleSaved(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    const on = !saved.has(g.id); on ? saved.add(g.id) : saved.delete(g.id);
    btn.classList.toggle('on', on); btn.querySelector('span').textContent = on ? 'Saved' : 'Save for later';
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
    if ((el = q('[data-get]'))) { e.stopPropagation(); return doGet(el.dataset.get, el); }
    if ((el = q('[data-wish]'))) return toggleSaved(el.dataset.wish, el);
    if (q('[data-close]')) return closeGame();
    if ((el = q('[data-nav-id]'))) { const n = D.nav.find(x => x.id === el.dataset.navId); return n && navTo(n); }
    if (q('[data-nav]')) { closeGame(); closeSearchSilently(); return go('home'); }
    if (q('[data-search-toggle]')) return searchOpen() ? closeSearch() : openSearch();
    if (q('[data-search-clear]')) { $input.value = ''; $input.focus(); return onSearch(); }
    if (q('[data-user]')) return opt.onUser && opt.onUser();
    if ((el = q('[data-cat]'))) { const id = el.dataset.cat; if (!id && route.view === 'home') return; return go('browse', id ? { category: id } : {}); }
    if ((el = q('[data-more]'))) { const s = D.shelves.find(x => x.id === el.dataset.more); return s && go('browse', s.filter || {}); }
    if ((el = q('[data-open]'))) return openGame(el.dataset.open);
  };
  const onKey = e => {
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
    navigate(view, filter) { return go(view, filter); },
    open: openGame, close: closeGame,
    getRoute: () => ({ view: route.view, filter: { ...route.filter } }),
    destroy() { destroyed = true; heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); document.removeEventListener('keydown', onKey); host.remove(); },
  };
}

function adopt(scope, css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sh]; }
  catch (e) { const s = document.createElement('style'); s.textContent = css; scope.appendChild(s); }
}

/* ── src/js/ui/index.js ── */
const version = '0.1.0';

return {mount, validate, steam, normalize, version};
})();
if(typeof window!=='undefined')window.HearthUI=HearthUI;
