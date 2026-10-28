import { esc } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';
import { card } from './card.js';

/** A horizontally scrolling row of cards with a heading and a "See all" link. */
export function shelfHtml(s) {
  const ranked = s.style === 'ranked';
  return `<section class="shelf" data-shelf="${esc(s.id)}">
    <div class="sh-h rv"><h2>${esc(s.title)}</h2>${s.filter ? `<button class="more" data-more="${esc(s.id)}">See all</button>` : ''}</div>
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${s.games.slice(0, ranked ? 10 : 30).map((g, i) => card(g, { rank: ranked ? i + 1 : 0 })).join('')}</div>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}

/** Wire scroll buttons; they hide at either end, and the row's edges fade out while there is more to scroll (--fl / --fr on .rw, same idea as the media strip). Returns a cleanup fn.
 *  Every row is measured first and only then written: reading scrollWidth right after another row's style write forced a full relayout per row (7+ on the home page). */
export function initShelves(root) {
  const cleanups = [], FADE = 72, rows = [...root.querySelectorAll('.rw')].map(rw => { const row = rw.querySelector('.row'), [pv, nx] = rw.querySelectorAll('.nx'); return { rw, row, pv, nx }; });
  const measure = ({ row }) => ({ l: row.scrollLeft, w: row.clientWidth, sw: row.scrollWidth });
  const apply = ({ rw, pv, nx }, { l, w, sw }) => {
    const max = sw - w;
    pv.classList.toggle('is-end', l < 8); nx.classList.toggle('is-end', l + w > sw - 8);
    rw.style.setProperty('--fl', Math.max(0, Math.min(1, l / FADE)).toFixed(3));
    rw.style.setProperty('--fr', Math.max(0, Math.min(1, (max - l) / FADE)).toFixed(3));
  };
  const syncAll = list => { const m = list.map(measure); list.forEach((r, i) => apply(r, m[i])); };       // all reads, then all writes
  rows.forEach(r => {
    const { row, pv, nx } = r;
    const by = dir => row.scrollBy({ left: dir * row.clientWidth * .8, behavior: 'smooth' });
    pv.onclick = () => by(-1); nx.onclick = () => by(1);
    row.addEventListener('scroll', () => apply(r, measure(r)), { passive: true });
  });
  if ('ResizeObserver' in window) {                                       // one observer for every row: its first callback is the initial sync, and a resize re-syncs them all in one pass
    const ro = new ResizeObserver(es => syncAll(rows.filter(r => es.some(e => e.target === r.row))));
    rows.forEach(r => ro.observe(r.row)); cleanups.push(() => ro.disconnect());
  } else syncAll(rows);
  return () => cleanups.forEach(f => f());
}
