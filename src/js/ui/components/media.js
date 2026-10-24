import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

/** The media strip (trailers + screenshots) under the sheet's header. Skeleton tiles while the details are still loading and a Steam id is known. */
export function mediaHtml(g, { pending = false } = {}) {
  const items = g.media || [];
  if (!items.length) return pending && (g.steamAppId || g.steamUrl) ? `<div class="media"><div class="mstrip">${'<i class="mt sk"></i>'.repeat(3)}</div></div>` : '';
  const tiles = items.map((m, i) => `<button type="button" class="mt${m.type === 'image' ? '' : ' vid'}" data-media="${i}" aria-label="${esc(m.title || (m.type === 'image' ? 'Screenshot ' + (i + 1) : 'Trailer'))}"><img src="${esc(safeUrl(m.thumb))}" alt="" loading="lazy" decoding="async" draggable="false">${m.type === 'image' ? '' : `<span class="pb">${ic(ICON.play, 18, 2)}</span>`}</button>`).join('');
  return `<div class="media"><div class="mstrip" tabindex="0" aria-label="Trailers and screenshots">${tiles}</div></div>`;
}

/** Full-size viewer for one media item. Lives in the modal (outside the sheet) so a sheet re-render never closes it. */
export function lightboxInner(items, i) {
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
