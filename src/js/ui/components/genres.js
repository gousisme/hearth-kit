import { esc } from '../../shared/util.js';
import { layer } from '../core/art.js';
import { ic, ICON } from '../core/icons.js';

/** Brick slots (row * 4 + col) ordered by distance from the middle of the tilted wall. The middle row is shifted ~0.44 of a brick to the right and a brick is ~0.68 as tall as it is wide. */
const ORDER = Array.from({ length: 12 }, (_, i) => i).sort((a, b) => dist(a) - dist(b));
function dist(i) { const r = Math.floor(i / 4), c = i % 4, x = c - 1.5 + (r === 1 ? 0.44 : 0), y = (r - 1) * 0.68; return Math.hypot(x, y); }

/** The slots of the wall that can ever show inside a tile (worked out from the tilt, the hover pose and the tile sizes, with a few px to spare): the other bricks are off the tile, so they get no image to load, decode and paint. */
const SEEN_HOME = new Set([1, 2, 3, 4, 5, 6, 8, 9, 10]), SEEN_PICK = new Set([1, 2, 4, 5, 6, 9, 10]);

/** The wall of one tile: 3 rows x 4 bricks, filled from the CENTRE outwards with the category's games, looping through them when there are fewer games than bricks
 *  (the best-looking games therefore sit where the eye lands, and the wall never has bare patches). Only the bricks of `seen` get an image. */
function wallHtml(pool, seen) {
  const bricks = ORDER.map(i => pool.length && seen.has(i) ? `<span class="gt-b has">${layer(pool[ORDER.indexOf(i) % pool.length], 'header')}</span>` : '<span class="gt-b"></span>');
  const cells = []; ORDER.forEach((slot, rank) => { cells[slot] = bricks[rank]; });
  return [0, 1, 2].map(r => `<span class="gt-r">${cells.slice(r * 4, r * 4 + 4).join('')}</span>`).join('');
}

/** A stable hue (0-359) from a category id, so every category keeps its own colour between visits. */
function hueOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/**
 * "Browse by category" tiles (Steam style): a few of the category's games blended into a tinted collage with the name in a pill.
 * Reuses the shelf markup (.rw / .row / .nx), so initShelves() gives it the arrows and the edge fades; a tile is a [data-cat] button,
 * so the existing category click handler opens Browse filtered to it. The pseudo category "updated" has its own nav entry and is skipped.
 */
export function genresHtml(D, { title = 'Browse by category', max = 14, active, all = false } = {}) {
  // active / all: the Browse page's category picker. `active` is the chosen category id ('' = All; undefined = a plain home shelf with no selection), `all` adds an "All" tile and lists every category.
  const list = D.categories.filter(c => c.id && (all || c.id !== 'updated'));
  if (!list.length) return '';
  const hasArt = g => (g.steamAppId || (g.art && (g.art.header || g.art.hero || g.art.poster))) ? 1 : 0;
  const used = new Map();                                            // a game is shown on as few tiles as possible, so neighbouring tiles do not look alike
  // the walls are NOT built here: a tile only carries the ids of its games (data-pool) and gets its wall from initGenres() when it nears the strip's visible part
  const wall = pool => ({ pool: JSON.stringify(pool.map(g => g.id)), seen: active !== undefined ? 'pick' : 'home' });
  const slot = pool => { const w = wall(pool); return `<span class="gt-art" aria-hidden="true" data-pool="${esc(w.pool)}" data-seen="${w.seen}"></span>`; };
  // the Browse picker's tiles are not scroll-revealed: the whole picker is re-rendered on every pick, and a staggered rise made the tapped tile sit lower than the rest while the page loaded
  const rv = active !== undefined ? '' : ' rv';
  const tile = c => {
    const pool = D.games.filter(g => g.categories.includes(c.id)).sort((a, b) => hasArt(b) - hasArt(a) || (used.get(a.id) || 0) - (used.get(b.id) || 0));
    const pick = pool.slice(0, 6); pick.forEach(g => used.set(g.id, (used.get(g.id) || 0) + 1));
    const on = active !== undefined && c.id === active;
    return `<button type="button" class="gt${rv}${on ? ' on' : ''}" data-cat="${esc(c.id)}" style="--h:${hueOf(c.id)}" aria-label="${esc(c.label)}"${active !== undefined ? ` aria-pressed="${on}"` : ''}>
      ${slot(pick)}
      <span class="gt-name">${esc(c.label)}</span></button>`;
  };
  // "All": the same wall, built from games spread over the whole library (every few games, art first), tinted with the accent
  const allPool = () => { const a = D.games.filter(hasArt); const src = a.length >= 6 ? a : D.games; const step = Math.max(1, Math.floor(src.length / 6)); return Array.from({ length: Math.min(6, src.length) }, (_, i) => src[i * step]); };
  const allTile = all ? `<button type="button" class="gt gt-all${rv}${active === '' ? ' on' : ''}" data-cat="" style="--h:205" aria-label="All" aria-pressed="${active === ''}">${slot(allPool())}<span class="gt-name">All</span></button>` : '';
  return `<section class="shelf genres${active !== undefined ? ' is-pick' : ''}" data-shelf="genres">
    ${title ? `<div class="sh-h rv"><h2>${esc(title)}</h2></div>` : ''}
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${allTile}${list.slice(0, max).map(tile).join('')}</div><i class="fd l" aria-hidden="true"></i><i class="fd r" aria-hidden="true"></i>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}

/**
 * Builds the walls of the tiles under `root` (a .genres section or a page holding one) the moment they come within ~400px of the visible part of their strip, not all at once:
 * a Browse picker lists every category (40+ tiles x 7 images, each in a 3D-tilted layer), and building / registering / sweeping all of that was most of the page's cost.
 * Tiles that are already built (a kept picker) are left alone. Returns a cleanup fn.
 */
export function initGenres(root, D, art) {
  const secs = root.classList && root.classList.contains('genres') ? [root] : [...root.querySelectorAll('.genres')];
  const fill = tile => {
    const s = tile.querySelector('.gt-art'); if (!s || s.dataset.b) return;
    let ids = []; try { ids = JSON.parse(s.dataset.pool || '[]'); } catch (e) { /* an empty wall */ }
    s.innerHTML = wallHtml(ids.map(id => D.byId.get(String(id))).filter(Boolean), s.dataset.seen === 'pick' ? SEEN_PICK : SEEN_HOME);
    s.dataset.b = '1';
    art.hydrate(s, { lazy: true });
  };
  const stops = [];
  secs.forEach(sec => {
    const row = sec.querySelector('.row'), tiles = [...sec.querySelectorAll('.gt')].filter(t => { const s = t.querySelector('.gt-art'); return s && !s.dataset.b; });
    if (!row || !tiles.length) return;
    if (!('IntersectionObserver' in window)) { tiles.forEach(fill); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { root: row, rootMargin: '0px 400px' });
    tiles.forEach(t => io.observe(t)); stops.push(() => io.disconnect());
  });
  return () => stops.forEach(f => f());
}
