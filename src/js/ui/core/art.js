import { esc, safeUrl } from '../../shared/util.js';

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
export const steam = {
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
export function candidates(game, kind) {
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
export function artImg(game, kind, cls = '') {
  return `<img class="art-img ${cls}" alt="${kind === 'logo' ? esc(game.title) : ''}" data-g="${esc(game.id)}" data-kind="${kind}" data-title="${esc(game.title)}" decoding="async">`;
}

/** A game's logo: the title as text first, swapped for the logo image once it has loaded. No skeleton, no layout jump. */
export function logoSlot(game, cls = '') {
  return `<div class="lg${cls ? ' ' + cls : ''}"><div class="fbt">${esc(game.title)}</div>${artImg(game, 'logo', 'logo')}</div>`;
}

/** A full-bleed art slot (poster, hero, header…). Starts as a skeleton. */
export function layer(game, kind) {
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
export function createArt({ root: scope, loader = null, resolve = null, game, onMiss = null, resolveLogo = null }) {
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
