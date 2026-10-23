import { esc } from '../../shared/util.js';
import { card } from './card.js';
import { chipsHtml } from './chips.js';
import { filterGames } from '../core/data.js';
import { hydrate } from '../core/art.js';
import { reveal } from '../core/motion.js';

/** The grid renders in chunks: a few hundred cards at once is ~12k DOM nodes and a visible stall on every tab change. */
export const GRID_CHUNK = 24;

/** Grid view for category filters, search, "Library" and "See all". */
export function browseHtml(D, route, savedIds) {
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
      ? `<div class="grid">${list.slice(0, GRID_CHUNK).map((g, i) => card(g, { i, reveal: true })).join('')}</div>${list.length > GRID_CHUNK ? '<div class="more" aria-hidden="true"></div>' : ''}`
      : `<div class="empty"><h3>${empty[0]}</h3><p>${empty[1]}</p><button class="btn glass alt" data-nav="home">Back to discover</button></div>`}
  </div>`;
}

/**
 * Lazy-load the rest of the grid. Call after the browse HTML is in the DOM; returns a cleanup fn.
 * Appends GRID_CHUNK cards each time the sentinel (.more) comes within ~700px of the viewport.
 */
export function initGrid(root, D, route, savedIds, loader) {
  const more = root.querySelector('.browse .more'), grid = root.querySelector('.browse .grid');
  if (!more || !grid) return () => {};
  const list = filterGames(D, route.filter || {}, savedIds), stops = [];
  let at = GRID_CHUNK;
  const add = batch => {
    const tmp = document.createElement('div');
    tmp.innerHTML = batch.map((g, i) => card(g, { i, reveal: true })).join('');
    hydrate(tmp, loader); stops.push(reveal(tmp));
    grid.append(...tmp.childNodes);
  };
  if (!('IntersectionObserver' in window)) { add(list.slice(at)); more.remove(); return () => stops.forEach(s => s()); }
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    const batch = list.slice(at, at + GRID_CHUNK); at += batch.length; add(batch);
    if (at >= list.length) { io.disconnect(); more.remove(); } else { io.unobserve(more); io.observe(more); }   // re-check: the sentinel may still be on screen
  }, { rootMargin: '700px 0px' });
  io.observe(more);
  return () => { io.disconnect(); stops.forEach(s => s()); };
}
