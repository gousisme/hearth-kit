// ==UserScript==
// @name         Hearth — <SITE NAME>
// @namespace    hearth-kit
// @version      0.1.0
// @description  Redesign of <SITE NAME> using hearth-kit
// @match        https://<SITE-HOST>/*                       // TODO: tighten to the pages you redesign
// @run-at       document-start                              // lets us hide the old page before it paints
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest                           // for fetchDoc/fetchJson/gmImages; remove if unused
// @grant        GM_registerMenuCommand
// @connect      <SITE-HOST>                                 // TODO: every host fetched via GM_xmlhttpRequest
// @connect      cdn.cloudflare.steamstatic.com              // only if gmImages: true
// @connect      fonts.googleapis.com
// @connect      fonts.gstatic.com
// @require      https://cdn.jsdelivr.net/gh/<GITHUB-USER>/hearth-kit@v0.1.0/dist/hearth-ui.js
// @require      https://cdn.jsdelivr.net/gh/<GITHUB-USER>/hearth-kit@v0.1.0/dist/hearth-scrape.js
// @require      https://cdn.jsdelivr.net/gh/<GITHUB-USER>/hearth-kit@v0.1.0/dist/hearth-glue.js
// @resource     hearthCss https://cdn.jsdelivr.net/gh/<GITHUB-USER>/hearth-kit@v0.1.0/dist/hearth.css
// ==/UserScript==
//
// Pin the @v0.1.0 tag (never @main): Tampermonkey caches @require/@resource by URL.
// For local development use http://localhost:5173/repo/dist/... (npm run serve) instead of jsDelivr.

(function () {
  'use strict';
  const S = HearthScrape;

  /* 1) SCRAPERS — the only part that is specific to this site.
        Return the data contract (docs/04-data-contract.md). Required per game: id, title. */
  async function scrapeListPage(ctx) {
    const games = S.qa('TODO: selector for one game card/row').map(el => S.game({
      id: S.attr(el, 'data-id') || S.slug(S.text('TODO: title selector', el)),   // must be STABLE across page loads
      title: S.text('TODO: title selector', el),
      steamAppId: S.steamAppId(S.attr('TODO: a[href*="steampowered"]', 'href', el)),   // or null → no Steam art (use art.fallback)
      genres: S.text('TODO', el).split(','),
      size: S.text('TODO', el),
      downloadUrl: S.abs(S.attr('TODO: download link', 'href', el)),          // absolute http(s)
      sourceUrl: S.abs(S.attr('TODO: details link', 'href', el)),
      // art: { poster: S.imgUrl('img', el) },   // only when the site has better art than Steam
    }));
    ctx.store.games = S.mergeGames(ctx.store.games || [], games);
    return { site: { name: '<SITE NAME>' }, games: ctx.store.games };
  }

  async function scrapeDetailPage(ctx) {
    // return the same shape; merge this game's richer fields into ctx.store.games
    return null; // TODO or delete this route
  }

  /* 2) ROUTES — which URLs get the redesign, what to wait for, and what the UI should show. */
  HearthGlue.run({
    name: '<site>',
    css: GM_getResourceText('hearthCss'),
    debug: true,                  // set false when done
    hide: 'display',              // 'visibility' if you need the original page laid out (lazy loading / infinite scroll)
    routes: [
      { id: 'list', match: u => new URL(u).pathname === '/', ready: 'TODO: selector that exists once data is rendered', scrape: scrapeListPage, view: { view: 'home' } },
      // { id: 'game', match: /\/game\//, ready: '...', scrape: scrapeDetailPage, view: d => ({ open: 'ID' }) },
    ],
    ui: { /* onGet(game){...}, onOpen(game){...}, theme: { ac: '#c6f432' }, autoplayMs: 7000 */ },
  });
})();
