import { coerceGame } from '../../shared/schema.js';

const FIELDS = ['description', 'developer', 'publisher', 'releaseYear', 'size', 'downloads', 'password', 'guide', 'update', 'facts', 'steamUrl', 'media'];
const ART_KEYS = ['poster', 'hero', 'logo', 'header', 'fallback'];

/**
 * Lazy detail data for the game sheet.
 *   resolve(game, push) → Promise<patch|null>  (options.resolveDetail) — called once per game, the first time its sheet opens.
 *   `push(partialPatch)` is optional: call it as often as you like to show data early (the sheet re-renders each time);
 *   the returned patch is the final one and the sheet stops showing skeletons.
 *   patch may carry: description, developer, publisher, releaseYear, size, downloads[], password, guide[], update, facts[], steamUrl, media[],
 *   and (new) steamAppId + art{poster,hero,logo,header,fallback}, which are merged into the game so its artwork can be found late.
 * Patches are cached by game id and re-applied to every new copy of the game (the data can be re-normalized).
 */
export function createEnrich({ resolve }) {
  const calls = new Map(), patches = new Map(), parts = new Map(), listeners = new Map();
  function apply(g, p) {
    if (!p || typeof p !== 'object') return;
    const n = coerceGame({ id: g.id, title: g.title, ...p });
    for (const k of FIELDS) { const v = n[k]; if (Array.isArray(v) ? v.length : v) g[k] = v; }
    if (n.steamAppId) g.steamAppId = n.steamAppId;
    for (const k of ART_KEYS) if (n.art[k]) g.art[k] = n.art[k];
  }
  return {
    /** true once the final patch has arrived (or when there is nothing to wait for) */
    done: id => !resolve || patches.has(id),
    applyCached(g) { apply(g, parts.get(g.id)); apply(g, patches.get(g.id)); },
    /** `onPush` is called (with the game id) whenever a partial patch arrives; the latest listener per game wins. */
    get(g, onPush) {
      if (!resolve) return Promise.resolve();
      if (onPush) listeners.set(g.id, onPush);
      if (!calls.has(g.id)) {
        const push = p => { if (!p || typeof p !== 'object' || patches.has(g.id)) return; parts.set(g.id, { ...(parts.get(g.id) || {}), ...p }); const l = listeners.get(g.id); l && l(g.id); };
        calls.set(g.id, Promise.resolve().then(() => resolve(g, push)).catch(() => null).then(p => { patches.set(g.id, p); return p; }));
      }
      return calls.get(g.id).then(p => apply(g, p));
    },
  };
}
