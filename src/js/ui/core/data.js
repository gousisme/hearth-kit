import { slug } from '../../shared/util.js';
import { coerceGame } from '../../shared/schema.js';

/**
 * normalize(): turn contract data (docs/04-data-contract.md) into render-ready data.
 * Only `games` is required. Everything else is derived when absent, so a scraper can start by
 * emitting just a list of games and get a complete storefront.
 */
export function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const games = (Array.isArray(d.games) ? d.games : [])
    .filter(g => g && g.id != null && g.title)
    .map(coerceGame)
    .filter(g => (seen.has(g.id) ? false : seen.add(g.id)));
  const byId = new Map(games.map(g => [g.id, g]));
  const pick = ids => (ids || []).map(id => byId.get(String(id))).filter(Boolean);

  const site = { name: 'Hearth', mark: '', footer: '', user: null, ...(d.site || {}) };
  site.mark = site.mark || (site.name || 'h').trim().charAt(0).toLowerCase();
  // `user` is an object (signed in) or null. Initials are derived from the name when not given.
  site.user = site.user && typeof site.user === 'object' ? { ...site.user } : null;
  if (site.user) { site.user.name = String(site.user.name || '').trim(); site.user.initials = String(site.user.initials || site.user.name.slice(0, 2).toUpperCase()).trim(); }

  const nav = Array.isArray(d.nav) && d.nav.length ? d.nav : [
    { id: 'discover', label: 'Discover', view: 'home' },
    { id: 'games', label: 'Games', view: 'browse' },
    { id: 'library', label: 'Library', view: 'browse', filter: { saved: true } },
    { id: 'new', label: 'New', view: 'browse', filter: { sort: 'new' } },
  ];

  let categories = Array.isArray(d.categories) && d.categories.length ? d.categories.map(c => ({ id: slug(c.id || c.label), label: c.label || c.id })) : null;
  if (!categories) {
    const count = new Map();
    games.forEach(g => g.genres.forEach(t => count.set(t, (count.get(t) || 0) + 1)));
    categories = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([label]) => ({ id: slug(label), label }));
  }

  const heroSrc = Array.isArray(d.hero) && d.hero.length ? d.hero : games.filter(g => g.steamAppId || g.art.hero).slice(0, 5).map(g => ({ gameId: g.id }));
  const hero = heroSrc.map((s, i) => ({ game: byId.get(String(s.gameId)), eyebrow: s.eyebrow || (i ? 'Trending now' : 'Featured') })).filter(s => s.game);

  const featured = (Array.isArray(d.featured) ? d.featured : []).map(f => ({ ...f, game: byId.get(String(f.gameId)) })).filter(f => f.game).slice(0, 3);

  let shelves = (Array.isArray(d.shelves) ? d.shelves : []).map((s, i) => ({ id: s.id || 'shelf-' + i, title: s.title, style: s.style === 'ranked' ? 'ranked' : 'poster', games: pick(s.gameIds), filter: s.filter || null })).filter(s => s.games.length);
  if (!shelves.length && games.length) {
    shelves = [{ id: 'all', title: 'All games', style: 'poster', games: games.slice(0, 24), filter: {} }];
    categories.slice(0, 3).forEach(c => {
      const gs = games.filter(g => g.categories.includes(c.id));
      if (gs.length >= 4) shelves.push({ id: 'cat-' + c.id, title: c.label, style: 'poster', games: gs.slice(0, 24), filter: { category: c.id } });
    });
  }
  return { site, nav, categories, hero, featured, shelves, games, byId };
}

/** Games matching a browse filter: { category, query, sort: 'new'|'title', saved } */
export function filterGames(D, filter = {}, savedIds = new Set()) {
  let list = D.games.slice();
  if (filter.category) list = list.filter(g => g.categories.includes(filter.category));
  if (filter.saved) list = list.filter(g => savedIds.has(g.id));
  const q = (filter.query || '').trim().toLowerCase();
  if (q) list = list.filter(g => [g.title, g.developer, g.publisher, g.tagline, ...g.genres].join(' ').toLowerCase().includes(q));
  if (filter.sort === 'new') list.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
  else if (filter.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  return list;
}

export function similar(D, game, n = 3) {
  const explicit = game.similarIds.map(id => D.byId.get(id)).filter(Boolean);
  const auto = D.games.filter(x => x.id !== game.id && !explicit.includes(x) && x.genres.some(t => game.genres.includes(t)));
  return [...explicit, ...auto].slice(0, n);
}

/**
 * Append games to an already-normalized D (used by the grid's loadMore and by app.add()).
 * Games already present are kept, but any new `genres` (search tags) are merged into them.
 * Returns { added: [new games], merged: number of existing games that gained genres }.
 */
export function addGames(D, list) {
  const added = []; let merged = 0;
  (Array.isArray(list) ? list : []).filter(g => g && g.id != null && g.title).map(coerceGame).forEach(g => {
    const ex = D.byId.get(g.id);
    if (!ex) { D.games.push(g); D.byId.set(g.id, g); added.push(g); return; }
    const more = g.genres.filter(t => !ex.genres.includes(t));
    if (more.length) { ex.genres.push(...more); merged++; }
  });
  return { added, merged };
}
