import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

/** The media strip (trailers + screenshots) under the sheet's header. Skeleton tiles while the details are still loading and a Steam id is known. */
export function mediaHtml(g, { pending = false } = {}) {
  const items = g.media || [];
  if (!items.length) return pending && (g.steamAppId || g.steamUrl) ? `<div class="media" data-k="media"><div class="mstrip">${'<i class="mt sk"></i>'.repeat(3)}</div></div>` : '';
  const tiles = items.map((m, i) => `<button type="button" class="mt${m.type === 'image' ? '' : ' vid'}" data-media="${i}" aria-label="${esc(m.title || (m.type === 'image' ? 'Screenshot ' + (i + 1) : 'Trailer'))}"><img src="${esc(safeUrl(m.thumb))}" alt="" loading="lazy" decoding="async" draggable="false">${m.type === 'image' ? '' : `<span class="mt-play">${ic(ICON.play, 18, 2)}</span>`}</button>`).join('');
  return `<div class="media" data-k="media"><div class="mstrip" tabindex="0" aria-label="Trailers and screenshots">${tiles}</div></div>`;
}

/** The viewer's frame: close button, previous / next, the stage the slides fade in and out of, and the counter. Built once per opening. */
export function lightboxShell(many) {
  return `<button type="button" class="lb-x" data-lb-close aria-label="Close">${ic(ICON.close, 18)}</button>
    ${many ? `<button type="button" class="lb-n lb-p" data-lb-step="-1" aria-label="Previous">${ic(ICON.prev, 22)}</button><button type="button" class="lb-n lb-nx" data-lb-step="1" aria-label="Next">${ic(ICON.next, 22)}</button>` : ''}
    <div class="lb-m"></div>
    <div class="lb-c"></div>`;
}

/** One slide (a screenshot, a video or an embed). Slides live in the stage; changing item fades the old one out and the new one in. */
export function lightboxSlide(m) {
  if (m.type === 'video') return `<video controls autoplay playsinline poster="${esc(safeUrl(m.thumb))}">${m.sources.map(s => `<source src="${esc(safeUrl(s.src))}"${s.type ? ` type="${esc(s.type)}"` : ''}>`).join('')}</video><div class="lb-err" hidden>This video can’t be played here.</div>`;
  if (m.type === 'embed') return `<iframe src="${esc(safeUrl(m.src))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  return `<img src="${esc(safeUrl(m.src))}" alt="" decoding="async">`;
}
