import { esc } from '../../shared/util.js';
import { layer } from '../core/art.js';
import { button } from './button.js';

/** Poster card. `rank` (1..n) renders the big outlined number used by the "Top 10" shelf. */
export function card(g, { rank = 0 } = {}) {
  const meta = [g.tagline || g.genres[0], g.size].filter(Boolean).join(' · ');
  return `<div class="card rv${rank ? ' rank' : ''}" tabindex="0" role="button" aria-label="${esc(g.title)}" data-open="${esc(g.id)}">
    ${rank ? `<div class="n" aria-hidden="true">${rank}</div>` : ''}
    <div class="poster">${layer(g, 'poster')}<div class="pt">${esc(g.title)}</div><div class="go">${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm w' })}</div></div>
    <h3>${esc(g.title)}</h3><p>${esc(meta)}${g.update && g.update.closed ? `${meta ? ' · ' : ''}<span class="clx">Guide closed</span>` : ''}</p></div>`;
}
