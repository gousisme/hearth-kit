import { esc, safeUrl, hash } from '../../shared/util.js';

/**
 * ARTWORK
 * Every image slot is a stack:   generated key art (always there)  <  real image (fades in on load).
 * Real images are tried in order (`candidates`); if all fail the generated art simply stays.
 * Logos are the exception: if no logo loads we render the game title as text instead.
 */

const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
/** Build Steam CDN URLs from an app id. See docs/04-data-contract.md → "Steam artwork". */
export const steam = {
  poster: id => `${STEAM}${id}/library_600x900.jpg`,
  hero: id => `${STEAM}${id}/library_hero.jpg`,
  logo: id => `${STEAM}${id}/logo.png`,
  header: id => `${STEAM}${id}/header.jpg`,
  capsule: id => `${STEAM}${id}/capsule_616x353.jpg`,
};

/** Ordered list of URLs to try for one art slot. Explicit `art.*` overrides win over Steam. */
export function candidates(game, kind) {
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
export function artImg(game, kind, cls = '') {
  const list = candidates(game, kind);
  if (!list.length) return '';
  return `<img class="art-img ${cls}" alt="${kind === 'logo' ? esc(game.title) : ''}" data-kind="${kind}" data-title="${esc(game.title)}" data-cands="${esc(JSON.stringify(list))}" decoding="async" ${kind === 'logo' ? '' : 'loading="lazy"'}>`;
}

/** Generated art + real image stacked in a .layer. */
export function layer(game, kind, w, h, key = '') {
  return `<div class="layer">${keyArt(game, w, h, key)}${artImg(game, kind)}</div>`;
}

/**
 * Wire up every un-hydrated <img data-cands> under `root`.
 * `loader(url) -> Promise<string>` (optional) lets the Tampermonkey glue fetch images through
 * GM_xmlhttpRequest when the host page's CSP blocks the Steam CDN.
 */
export function hydrate(root, loader) {
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

export function keyArt(g, w, h, key = '') {
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
