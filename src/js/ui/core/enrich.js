import { coerceGame } from '../../shared/schema.js';

const FIELDS = ['description', 'developer', 'publisher', 'releaseYear', 'size', 'downloads', 'password', 'guide', 'update', 'facts'];

/**
 * Lazy detail data for the game sheet.
 *   resolve(game) → Promise<patch|null>  (options.resolveDetail) — called once per game, the first time its sheet opens.
 *   patch may carry: description, developer, publisher, releaseYear, size, downloads[], password, guide[], update, facts[]
 * The patch is cached by game id and re-applied to every new copy of the game (the data can be re-normalized).
 */
export function createEnrich({ resolve }) {
  const calls = new Map(), patches = new Map();
  function apply(g, p) {
    if (!p || typeof p !== 'object') return;
    const n = coerceGame({ id: g.id, title: g.title, ...p });
    for (const k of FIELDS) { const v = n[k]; if (Array.isArray(v) ? v.length : v) g[k] = v; }
  }
  return {
    /** true once the patch has arrived (or when there is nothing to wait for) */
    done: id => !resolve || patches.has(id),
    applyCached(g) { if (patches.has(g.id)) apply(g, patches.get(g.id)); },
    get(g) {
      if (!resolve) return Promise.resolve();
      if (!calls.has(g.id)) calls.set(g.id, Promise.resolve().then(() => resolve(g)).catch(() => null).then(p => { patches.set(g.id, p); return p; }));
      return calls.get(g.id).then(p => apply(g, p));
    },
  };
}
