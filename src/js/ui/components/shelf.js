import { esc } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';
import { card } from './card.js';

/** A horizontally scrolling row of cards with a heading and a "See all" link. */
export function shelfHtml(s) {
  const ranked = s.style === 'ranked';
  return `<section class="shelf rv" data-shelf="${esc(s.id)}">
    <div class="sh-h"><h2>${esc(s.title)}</h2>${s.filter ? `<button class="more" data-more="${esc(s.id)}">See all</button>` : ''}</div>
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${s.games.slice(0, ranked ? 10 : 30).map((g, i) => card(g, { rank: ranked ? i + 1 : 0 })).join('')}</div>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}

/** Wire scroll buttons; they hide at either end. Returns a cleanup fn. */
export function initShelves(root) {
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
