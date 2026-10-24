import { esc } from '../../shared/util.js';
import { layer } from '../core/art.js';
import { ic, ICON } from '../core/icons.js';

/** A stable hue (0-359) from a category id, so every category keeps its own colour between visits. */
function hueOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/**
 * "Browse by category" tiles (Steam style): a few of the category's games blended into a tinted collage with the name in a pill.
 * Reuses the shelf markup (.rw / .row / .nx), so initShelves() gives it the arrows and the edge fades; a tile is a [data-cat] button,
 * so the existing category click handler opens Browse filtered to it. The pseudo category "updated" has its own nav entry and is skipped.
 */
export function genresHtml(D, { title = 'Browse by category', max = 14 } = {}) {
  const list = D.categories.filter(c => c.id && c.id !== 'updated');
  if (!list.length) return '';
  const hasArt = g => (g.steamAppId || (g.art && (g.art.header || g.art.hero || g.art.poster))) ? 1 : 0;
  const used = new Map();                                            // a game is shown on as few tiles as possible, so neighbouring tiles do not look alike
  const tile = c => {
    const pool = D.games.filter(g => g.categories.includes(c.id)).sort((a, b) => hasArt(b) - hasArt(a) || (used.get(a.id) || 0) - (used.get(b.id) || 0));
    const pick = pool.slice(0, 3); pick.forEach(g => used.set(g.id, (used.get(g.id) || 0) + 1));
    return `<button type="button" class="gt rv" data-cat="${esc(c.id)}" style="--h:${hueOf(c.id)}" aria-label="${esc(c.label)}">
      <span class="gt-art" aria-hidden="true">${pick.map(g => `<span class="gt-a">${layer(g, 'header')}</span>`).join('')}</span>
      <span class="gt-name">${esc(c.label)}</span></button>`;
  };
  return `<section class="shelf genres" data-shelf="genres">
    <div class="sh-h rv"><h2>${esc(title)}</h2></div>
    <div class="rw"><button class="nx pv is-end" aria-label="Scroll back" tabindex="-1">${ic(ICON.prev, 20, 2.6)}</button>
      <div class="row">${list.slice(0, max).map(tile).join('')}</div>
      <button class="nx" aria-label="Scroll forward" tabindex="-1">${ic(ICON.next, 20, 2.6)}</button></div></section>`;
}
