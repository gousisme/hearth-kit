// ==UserScript==
// @name         Hearth — OldGameSite demo (fixture)
// @namespace    hearth-kit
// @version      0.1.0
// @description  Working example: redesigns the bundled fixture site (npm run serve → http://localhost:5173/)
// @match        http://localhost:5173/*
// @run-at       document-start
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      fonts.googleapis.com
// @connect      fonts.gstatic.com
// @require      http://localhost:5173/repo/dist/hearth-ui.js
// @require      http://localhost:5173/repo/dist/hearth-scrape.js
// @require      http://localhost:5173/repo/dist/hearth-glue.js
// @resource     hearthCss http://localhost:5173/repo/dist/hearth.css
// ==/UserScript==

/* The ONLY site-specific code is below: selectors (scrapers) + routes. Everything else is the kit. */
(function () {
  'use strict';
  const S = HearthScrape;

  /* ---- scrapers: DOM → data contract (docs/04-data-contract.md) -------------------------- */
  function scrapeList(ctx) {
    const games = S.qa('table.game-table tr.g').map(tr => S.game({
      id: tr.dataset.id,
      title: S.text('a.title', tr),
      steamAppId: S.steamAppId(tr.dataset.steam),
      genres: S.text('.genre', tr).split(','),
      releaseYear: S.num(S.text('.year', tr)),
      size: S.text('.size', tr),
      sourceUrl: S.abs(S.attr('a.title', 'href', tr)),
      downloadUrl: 'https://example.com/download/' + tr.dataset.id,
    }));
    ctx.store.games = S.mergeGames(ctx.store.games || [], games);   // remember for detail routes
    return build(ctx.store.games);
  }

  function scrapeDetail(ctx) {
    const a = S.q('article.detail');
    const g = S.game({
      id: a.dataset.id,
      title: S.text('.d-title', a),
      description: S.text('.desc', a),
      developer: S.text('.dev', a),
      rating: S.text('.rating', a),
      genres: S.text('.genres', a).split('/'),
      size: S.text('.size', a),
      releaseYear: S.num(S.text('.year', a)),
      steamAppId: S.steamAppId(S.attr('a.steam', 'href', a)),
      downloadUrl: S.abs(S.attr('a.dl-link', 'href', a)),
      sourceUrl: location.href,
    });
    ctx.store.games = S.mergeGames(ctx.store.games || [], [g]);
    return build(ctx.store.games, g.id);
  }

  // Only `games` is required; hero, categories and shelves are derived by the UI when omitted.
  const build = games => ({ site: { name: 'OldGameSite', mark: 'o', footer: 'Redesigned with Hearth', user: { initials: 'OG' } }, games });

  /* ---- glue --------------------------------------------------------------------------------- */
  HearthGlue.run({
    name: 'oldgamesite',
    css: GM_getResourceText('hearthCss'),
    debug: true,
    routes: [
      { id: 'game', match: u => new URL(u).pathname.startsWith('/game/'), ready: 'article.detail', scrape: scrapeDetail, view: d => ({ open: S.q('article.detail').dataset.id }) },
      { id: 'list', match: u => new URL(u).pathname === '/', ready: 'table.game-table tr.g', scrape: scrapeList, view: { view: 'home' } },
    ],
    ui: {
      // keep the address bar in sync with the open game (and go back to the list when it closes)
      onOpen: g => { if (location.pathname !== '/game/' + g.id) history.pushState({}, '', '/game/' + g.id); },
      onClose: () => { if (location.pathname !== '/') history.pushState({}, '', '/'); },
    },
  });
})();
