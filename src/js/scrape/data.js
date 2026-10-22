import { validate, coerceGame } from '../shared/schema.js';

/** Fill in a scraped record: coerces types, trims, defaults. Use on every game you emit. */
export function game(raw) { return coerceGame(raw); }

/** Dedupe by key (first wins). */
export function uniqueBy(list, key = x => x.id) { const seen = new Set(); return list.filter(x => { const k = key(x); return seen.has(k) ? false : seen.add(k); }); }

/** Merge two game lists by id; non-empty fields from `b` (e.g. detail-page data) win over `a` (list-page data). */
export function mergeGames(a, b) {
  const map = new Map(a.map(g => [String(g.id), g]));
  for (const g of b) {
    const id = String(g.id), old = map.get(id) || {};
    const merged = { ...old };
    for (const [k, v] of Object.entries(g)) {
      const empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      if (!empty) merged[k] = v;
    }
    map.set(id, merged);
  }
  return [...map.values()];
}

/** Validate scraper output and print a readable report. Returns the report. Call it while developing. */
export function check(data, label = 'scraped data') {
  const rep = validate(data);
  const head = `[hearth] ${label}: ${rep.stats.games ?? 0} games, ${rep.errors.length} errors, ${rep.warnings.length} warnings`;
  (console.groupCollapsed || console.log).call(console, head);
  rep.errors.forEach(e => console.error('  ✖', e));
  rep.warnings.slice(0, 20).forEach(w => console.warn('  !', w));
  if (rep.warnings.length > 20) console.warn(`  … and ${rep.warnings.length - 20} more warnings`);
  console.groupEnd && console.groupEnd();
  return rep;
}
