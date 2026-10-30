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

/**
 * Games matching a browse filter: { category, query, sort: 'updated'|'release'|'new'|'title', saved }.
 * `ranked` = the app's own site feeds the grid page by page (it has a loadMore hook). Then the plain lists are the SITE's lists, in the site's order:
 * "all games" = ranks.feed, a category = ranks['cat:<id>'] (a game is shown once the site's page for it has been read, not before), and the order is the rank, whatever order
 * the games reached the data in. Sort "updated" = ranks.upd (the site's own "recently updated" list) whenever the data carries it. Without ranks the old rules apply
 * (membership + the data's order; "new" / "updated" by addedAt / updatedAt).
 */
export function filterGames(D, filter = {}, savedIds = new Set(), { ranked = false } = {}) {
  const q = (filter.query || '').trim().toLowerCase(), has = k => D.games.some(g => g.ranks && g.ranks[k] != null);
  let key = '';
  if (filter.sort === 'updated') key = has('upd') ? 'upd' : '';
  else if (ranked && !q && !filter.saved) key = filter.category ? 'cat:' + filter.category : 'feed';
  let list = D.games.slice();
  if (filter.category && !key.startsWith('cat:')) list = list.filter(g => g.categories.includes(filter.category));
  if (filter.saved) list = list.filter(g => savedIds.has(g.id));
  if (q) list = list.filter(g => [g.title, g.developer, g.publisher, g.tagline, ...g.genres].join(' ').toLowerCase().includes(q));
  if (key) {
    list = list.filter(g => g.ranks && g.ranks[key] != null);
    // "release": the games of that list by their own release date (newest first, undated last), the list's order breaking ties
    list.sort(filter.sort === 'release' ? (a, b) => (b.releasedAt || 0) - (a.releasedAt || 0) || a.ranks[key] - b.ranks[key] : (a, b) => a.ranks[key] - b.ranks[key]);
    return list;
  }
  // no site order available: New = newest publish date first, Recently updated = latest update (a game never updated: its publish date) first; undated games keep the data's order, after the dated ones
  const by = k => { const at = new Map(D.games.map((g, i) => [g.id, i])); list.sort((a, b) => (k(b) > 0) - (k(a) > 0) || k(b) - k(a) || at.get(a.id) - at.get(b.id)); };
  if (filter.sort === 'new') by(g => g.addedAt || 0);
  else if (filter.sort === 'updated') by(g => g.updatedAt || g.addedAt || 0);
  else if (filter.sort === 'release') by(g => g.releasedAt || 0);
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
 * Games already present are kept, but any new `genres` (search tags) and `categories` are merged into them (a game can belong to a category
 * its own URL does not say, e.g. a racing game filed under /sandbox/: only the category's own page reveals it).
 * Returns { added: [new games], merged: number of existing games that gained genres or categories }.
 */
export function addGames(D, list) {
  const added = []; let merged = 0;
  (Array.isArray(list) ? list : []).filter(g => g && g.id != null && g.title).map(coerceGame).forEach(g => {
    const ex = D.byId.get(g.id);
    if (!ex) { D.games.push(g); D.byId.set(g.id, g); added.push(g); return; }
    const more = g.genres.filter(t => !ex.genres.includes(t));
    if (more.length) { ex.genres.push(...more); merged++; }
    if (g.ranks) ex.ranks = { ...(ex.ranks || {}), ...g.ranks };                      // list positions are refreshed silently (they only matter to the next grid that is built)
    if (g.addedAt && !ex.addedAt) { ex.addedAt = g.addedAt; merged++; }
    if (g.updatedAt > (ex.updatedAt || 0)) { ex.updatedAt = g.updatedAt; merged++; }
    const cats = g.categories.filter(c => !ex.categories.includes(c));
    if (cats.length) { ex.categories.push(...cats); merged++; }
  });
  return { added, merged };
}
