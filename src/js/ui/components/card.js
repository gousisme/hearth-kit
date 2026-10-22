import { esc } from '../../shared/util.js';
import { layer } from '../core/art.js';
import { button } from './button.js';

/** Poster card. `rank` (1..n) renders the big outlined number used by the "Top 10" shelf. */
export function card(g, { rank = 0, i = 0, reveal = false } = {}) {
  const meta = [g.tagline || g.genres[0], g.size].filter(Boolean).join(' · ');
  return `<div class="card${rank ? ' rank' : ''}${reveal ? ' rv' : ''}" tabindex="0" role="button" aria-label="${esc(g.title)}" data-open="${esc(g.id)}" ${reveal ? `style="--i:${Math.min(i, 14)}"` : ''}>
    ${rank ? `<div class="n" aria-hidden="true">${rank}</div>` : ''}
    <div class="poster">${layer(g, 'poster', 400, 600)}<div class="pt">${esc(g.title)}</div><div class="go">${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm w' })}</div></div>
    <h3>${esc(g.title)}</h3><p>${esc(meta)}</p></div>`;
}
