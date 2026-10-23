import { esc } from '../../shared/util.js';
import { layer } from '../core/art.js';
import { button } from './button.js';

/** Editorial tiles under the hero. Item: { game, kicker, headline, image: 'hero'|'poster', size: 'wide'|'narrow' }. */
export function featuredHtml(items) {
  if (!items.length) return '';
  const cols = items.map((f, i) => ((f.size || (i === 0 ? 'wide' : 'narrow')) === 'wide' ? '2fr' : '1fr')).join(' ');
  const tile = (f, i) => {
    const g = f.game, kind = f.image || (i === 0 ? 'hero' : 'poster');
    return `<article class="fc" tabindex="0" role="button" aria-label="${esc(f.headline || g.title)}" data-open="${esc(g.id)}">
      ${layer(g, kind)}
      <div class="t">${f.kicker ? `<small>${esc(f.kicker)}</small>` : ''}<h3>${esc(f.headline || g.title)}</h3></div>
      <div class="st gl"><div class="pm">${layer(g, 'poster')}</div>
        <div><b>${esc(g.title)}</b><span>${esc([g.tagline || g.genres[0], g.size].filter(Boolean).join(' · '))}</span></div>
        ${button('Get', { attrs: `data-get="${esc(g.id)}"`, cls: 'sm' })}</div></article>`;
  };
  return `<section class="feat rv" style="--cols:${cols}">${items.map(tile).join('')}</section>`;
}
