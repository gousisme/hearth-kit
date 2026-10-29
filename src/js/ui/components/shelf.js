import { esc } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';
import { card } from './card.js';
import { reduced } from '../core/motion.js';

/** A horizontally scrolling row of cards with a heading and a "See all" link. */
export function shelfHtml(s) {
  const ranked = s.style === 'ranked';
  return `<section class="shelf" data-shelf="${esc(s.id)}">
    <div class="sh-h rv"><h2>${esc(s.title)}</h2>${s.filter ? `<button class="more" data-more="${esc(s.id)}">See all</button>` : ''}</div>
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${s.games.slice(0, ranked ? 10 : 30).map((g, i) => card(g, { rank: ranked ? i + 1 : 0 })).join('')}</div><i class="fd l" aria-hidden="true"></i><i class="fd r" aria-hidden="true"></i>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}

/** Wire scroll buttons; they hide at either end, and the row's edges fade out while there is more to scroll (the two .fd overlays' opacity). Returns a cleanup fn.
 *  Every row is measured first and only then written: reading scrollWidth right after another row's style write forced a full relayout per row (7+ on the home page). */
export function initShelves(root) {
  const cleanups = [], ac = new AbortController(), FADE = 72, rows = [...root.querySelectorAll('.rw')].map(rw => { const row = rw.querySelector('.row'), [pv, nx] = rw.querySelectorAll('.nx'); return { rw, row, pv, nx, fl: rw.querySelector('.fd.l'), fr: rw.querySelector('.fd.r') }; });
  const measure = ({ row }) => ({ l: row.scrollLeft, w: row.clientWidth, sw: row.scrollWidth });
  const apply = ({ pv, nx, fl, fr }, { l, w, sw }) => {
    const max = sw - w;
    pv.classList.toggle('is-end', l < 8); nx.classList.toggle('is-end', l + w > sw - 8);
    fl && (fl.style.opacity = Math.max(0, Math.min(1, l / FADE)).toFixed(3));          // opacity of the two overlays themselves: nothing inherited, nothing else restyled
    fr && (fr.style.opacity = Math.max(0, Math.min(1, (max - l) / FADE)).toFixed(3));
  };
  const syncAll = list => { const m = list.map(measure); list.forEach((r, i) => apply(r, m[i])); };       // all reads, then all writes
  /* Shift+wheel and the arrows share ONE continuous glide towards a moving target. The row is scroll-snap mandatory, which made every wheel notch snap and stop (and a smooth scrollBy
     per click restart from scratch), so while gliding the snap is off (.is-glide) and, once the input goes quiet, the glide ends on the nearest card edge. */
  const startOf = ({ row }, x) => {                                          // the card edge nearest to scroll position x
    const max = row.scrollWidth - row.clientWidth, base = row.getBoundingClientRect().left - row.scrollLeft; let best = Math.max(0, Math.min(max, x)), gap = Infinity;
    for (const c of row.children) { const p = Math.max(0, Math.min(max, c.getBoundingClientRect().left - base)); if (Math.abs(p - x) < gap) { gap = Math.abs(p - x); best = p; } }
    return best;
  };
  const halt = r => { cancelAnimationFrame(r.raf); clearTimeout(r.idle); r.raf = 0; r.to = null; r.row.classList.remove('is-glide'); };
  const glide = (r, to) => {
    const { row } = r; r.to = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, to));
    if (reduced()) { row.scrollLeft = r.to; r.to = null; return; }
    row.classList.add('is-glide'); if (r.raf) return;
    r.last = performance.now();
    const tick = now => {
      const dt = Math.min(48, now - r.last); r.last = now; const diff = r.to - row.scrollLeft;
      if (Math.abs(diff) < .5) { row.scrollLeft = r.to; r.raf = 0; if (!r.idle) halt(r); return; }   // arrived: done, unless wheel input is still settling (its snap-to-card glide follows)
      row.scrollLeft += diff * (1 - Math.exp(-dt / 90)); r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
  };
  rows.forEach(r => {
    const { row, pv, nx } = r;
    const by = dir => { const from = r.to != null ? r.to : row.scrollLeft; halt(r); glide(r, startOf(r, from + dir * row.clientWidth * .8)); };
    pv.onclick = () => by(-1); nx.onclick = () => by(1);
    row.addEventListener('scroll', () => apply(r, measure(r)), { passive: true, signal: ac.signal });
    row.addEventListener('wheel', e => {
      if (!e.shiftKey || e.ctrlKey || row.scrollWidth <= row.clientWidth + 1) return;                  // only Shift+wheel is taken over; trackpads and plain wheel keep native behaviour
      const d = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 34 : e.deltaMode === 2 ? row.clientWidth : 1); if (!d) return;
      e.preventDefault();
      const from = r.to != null ? r.to : row.scrollLeft; clearTimeout(r.idle); glide(r, from + d);
      r.idle = setTimeout(() => { r.idle = 0; glide(r, startOf(r, r.to != null ? r.to : row.scrollLeft)); }, 140);   // input stopped: settle on a card edge
    }, { passive: false, signal: ac.signal });
    ['pointerdown', 'touchstart'].forEach(t => row.addEventListener(t, () => halt(r), { passive: true, signal: ac.signal }));   // grabbing the row stops the glide
    cleanups.push(() => halt(r));
  });
  if ('ResizeObserver' in window) {                                       // one observer for every row: its first callback is the initial sync, and a resize re-syncs them all in one pass
    const ro = new ResizeObserver(es => syncAll(rows.filter(r => es.some(e => e.target === r.row))));
    rows.forEach(r => ro.observe(r.row)); cleanups.push(() => ro.disconnect());
  } else syncAll(rows);
  return () => { ac.abort(); cleanups.forEach(f => f()); };
}
