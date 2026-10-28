import { esc } from '../../shared/util.js';
import { card } from './card.js';
import { genresHtml } from './genres.js';
import { filterGames, addGames } from '../core/data.js';
import { reveal } from '../core/motion.js';

/** The grid renders in chunks: a few hundred cards at once is ~12k DOM nodes and a visible stall on every tab change. */
export const GRID_CHUNK = 24;

/** The "no results" block (also built by initGrid when a lazily loaded grid ends up empty). */
export function emptyHtml(f, savedIds) {
  const t = f.saved && !savedIds.size ? ['Nothing saved yet', 'Open any game and choose “Save for later”.'] : ['Nothing matches', 'Try a different word or clear the filter.'];
  return `<div class="empty"><h3>${t[0]}</h3><p>${t[1]}</p><button class="btn glass alt" data-nav="home">Back to discover</button></div>`;
}

/**
 * Grid view for category filters, search, "Library" and "See all".
 * `canMore` = the app has a loadMore hook. A category nobody has loaded yet (no local game matches) then still gets a grid, which asks the hook for the category's own
 * pages right away, instead of a "Nothing matches" page that never asks (the site files a game under one url folder but lists it in several categories).
 */
export function browseHtml(D, route, savedIds, canMore = false) {
  const f = route.filter || {};
  const list = filterGames(D, f, savedIds);
  const cat = D.categories.find(c => c.id === f.category);
  const title = f.query ? `Results for “${f.query}”` : f.saved ? 'Your library' : cat ? cat.label : f.sort === 'new' ? 'New & recent' : 'All games';
  const lazy = !list.length && canMore && !f.saved && !f.query;
  return `<div class="browse">
    <div class="bh"><h1>${esc(title)}</h1><span class="count">${list.length} ${list.length === 1 ? 'game' : 'games'}</span></div>
    ${f.saved || !D.categories.length ? '' : genresHtml(D, { title: '', max: Infinity, active: f.category || '', all: true })}
    ${list.length
      ? `<div class="grid">${list.slice(0, GRID_CHUNK).map(g => card(g)).join('')}</div>${list.length > GRID_CHUNK ? '<div class="more" aria-hidden="true"></div>' : ''}`
      : lazy ? '<div class="grid"></div><div class="more" aria-hidden="true"></div>' : emptyHtml(f, savedIds)}
  </div>`;
}

/**
 * Lazy-load the rest of the grid. Call after the browse HTML is in the DOM; returns a cleanup fn.
 *  · appends GRID_CHUNK cards whenever the sentinel (.more) comes within ~700px of the viewport (they fade in one after another);
 *  · when every local game is shown and `loadMore` was given, asks it for more:  loadMore({ view, filter }) → Promise<game[] | false>.
 *    Returned games are added to the data (and listed if they match the current filter). Resolve to false / [] when there is nothing left.
 *    While it is pending the grid ends in skeleton cards.
 */
export function initGrid(root, D, route, savedIds, art, loadMore) {
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
  const settleEmpty = () => { if (!grid.isConnected || grid.querySelector('.card')) return; grid.insertAdjacentHTML('afterend', emptyHtml(f, savedIds)); grid.remove(); };   // the lazy grid found nothing at all
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
    if (done && !pending().length) { io && io.disconnect(); more.remove(); settleEmpty(); return; }
    if (io) { io.unobserve(more); io.observe(more); }        // re-check: the sentinel may still be on screen
  }
  if (!io) { add(pending()); more.remove(); if (!grid.children.length) { done = false; step(); } return () => { dead = true; stops.forEach(s => s()); }; }
  io.observe(more);
  return () => { dead = true; io.disconnect(); stops.forEach(s => s()); };
}
