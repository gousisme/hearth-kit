# 5 · How the Tampermonkey script works

## Loading: `@require` + `@resource`, built files, pinned tag

```js
// @require   https://cdn.jsdelivr.net/gh/<user>/hearth-kit@v0.1.0/dist/hearth-ui.js
// @require   …/dist/hearth-scrape.js
// @require   …/dist/hearth-glue.js
// @resource  hearthCss  …/dist/hearth.css
```

**Why this and not one giant script?** The userscript stays ~60 lines of site-specific code. The kit is versioned, cached by Tampermonkey, shared by every site script, and updated by bumping one tag. **Why `@resource` for CSS?** CSS is read as text with `GM_getResourceText('hearthCss')` and handed to `mount()`, which puts it *inside the Shadow DOM*. Injecting it into the page would let the site's CSS and ours collide. **Why a hand-rolled build?** The build is a ~100-line zero-dependency script (`scripts/build.mjs`), so the repo works with no `npm install`. Swap in esbuild if you outgrow it. **Why commit `dist/`?** jsDelivr serves straight from GitHub; no CI is needed.

Rules: **pin a tag** (`@v0.1.0`), never `@main` (Tampermonkey caches by URL, and a moving branch makes bugs unreproducible). **Order matters:** UI, then scrape, then glue. For local development use `http://localhost:5173/repo/dist/…` (from `npm run serve`); no file-URL permission needed.

## What `HearthGlue.run(config)` does

1. **Early hide.** If the current URL matches a route, it adds `html.hearth-on` and a `<style>` that hides `<body>` *before first paint* (`@run-at document-start`), so the old site never flashes. The original DOM is **kept**: scrapers read it and the site's own JS keeps running. `hide: 'display'` (default) / `'visibility'` (keeps layout alive: use for lazy-loading or infinite-scroll sources) / `'none'` (debug).
2. **Fonts.** Injects the Google Fonts link into the main document (`@font-face` doesn't work inside shadow roots). Modes: `'link'` (default), `'gm-inline'`, `'none'`.
3. **Match a route.** `routes` are tried in order; first `match` wins (RegExp, substring, or `(url, URL) => boolean`).
4. **Wait for content.** Awaits `route.ready` (a selector or function) via `waitFor`. SPAs render late; never scrape at `DOMContentLoaded` and hope.
5. **Scrape.** `await route.scrape({ url, route, store, log })`. `store` persists across routes and navigations (use it to remember the list while on a detail page). Bounded by `scrapeTimeoutMs` (30 s).
6. **Validate.** Errors are logged; data with no usable games aborts.
7. **Mount or update.** First time: `HearthUI.mount({ target: <html>, data, css, options })` → Shadow DOM host `#hearth-host`, a fixed full-viewport child of `<html>` (outside `<body>`, so hiding the body doesn't hide us). Later: `app.update(data, route)`; if the data is unchanged only the view moves (no re-render flash).
8. **Show a view.** `route.view` is `{view:'home'|'browse', filter?}` or `{open: gameId}` (opens the detail sheet), or a function of the data returning one.
9. **Watch navigation** and repeat from step 3 (below).
10. **Fail safe.** Any error in steps 4–7 → `console.error`, the UI is removed and the **original page is shown again** (`window.__hearthError` holds the error). A broken scraper never leaves a blank page.

**Escape hatch:** `Alt+Shift+H` (configurable: `toggleKey`) and a Tampermonkey menu entry toggle between the redesign and the original page.

## SPA navigation (`navwatch.js`)

Frameworks change the URL without reloading, so no single signal is reliable. The glue layers four: the Navigation API's `navigatesuccess`; `popstate`/`hashchange`; wrappers on `history.pushState/replaceState`; and a 500 ms URL poll as the safety net. A change is debounced (120 ms), and a token cancels any scrape superseded by a newer navigation. Each navigation re-runs route matching → `ready` → `scrape` → update. Leaving all routes shows the original page (`onNoMatch:'original'`).

Per-navigation, `route.ready` should wait for the **new** page's content, not the old page's leftovers: pick a selector that only exists once the new content has rendered (or a function that checks, e.g., the `<h1>` text changed).

### Keeping the address bar in sync (optional)
The UI never changes the URL itself. To make "open game" shareable, use hooks:
```js
ui: { onOpen: g => history.pushState({}, '', '/game/' + g.id), onClose: () => history.pushState({}, '', '/') }
```
Add a `game` route that matches that URL and returns `view: { open: id }`. `example-fixture.user.js` does exactly this. Without a detail route, skip the hooks.

## `HearthUI.mount` API (what glue calls)

```js
const app = HearthUI.mount({ target, data, css, options });
app.update(data, { view, filter })   // new data (+ optional route in the same transition)
app.navigate('home'|'browse', filter) ; app.open(id) ; app.close() ; app.getRoute() ; app.destroy()
```
`options`: `autoplay` (true; forced off under reduced motion), `autoplayMs` (7000), `theme` (token overrides), `saved` (initial saved ids), `placeholders` (demo content for empty sections; mockup only), `imageLoader(url) → Promise<string>`, `resolveDetail(game) → Promise<patch|null>` (called once, when a game's sheet first opens; fills `downloads`, `guide`, `update`, `facts`, `password`, `description`), `resolveArt(game) → Promise<patch|null>` (lazy per-card art lookup; a card waits at most `artDeadlineMs` (4000) for it, then loads with the art the game already has, and no single image URL may take longer than `imageTimeoutMs` (12000); `app.add(games)` adds games without a re-render), and hooks **`onGet(game, {button}) → false` cancels the default** (default opens `game.downloadUrl` in a new tab), `onOpen(game)`, `onClose(game)`, `onRoute(route)`, `onSave(game, on)`, **`onUser(user)`** (called when the avatar is clicked; return `false` to take over, otherwise the kit opens its own account sheet), **`resolveProfile(user) → Promise<profile|null>`** (called the first time the account sheet opens; the sheet is already on screen with the name and avatar, and fills in from `{name, avatarUrl, badge, stats:[{label,value}], facts:[{label,value}], links:[{label,href,hint,kind:'profile'|'bookmarks'|'logout'}]}`), and **`onArtMiss(game, kind, urls)`** (diagnostics: every candidate URL for an art slot failed; a missing *logo* is normal, the title is shown as text instead).

Common customisations: make Get trigger the site's own download (`onGet: g => { document.querySelector(\`[data-id="${g.id}"] .dl\`).click(); return false; }`); persist saved games (`onSave` → `GM_setValue`, `saved: GM_getValue(...)`).

## Scraping helpers (`HearthScrape`)

`q, qa, text, attr, abs, num, imgUrl, bgUrl, first` (DOM) · `fetchDoc, fetchText, fetchJson, mapLimit, loadAll` (network; use `GM_xmlhttpRequest` automatically when granted) · `steamAppId` · `game, uniqueBy, mergeGames, check` (data) · `waitFor, slug, delay`. Signatures are documented at the top of each file in `src/js/scrape/`.

Typical pattern when the list page lacks details: scrape the list, then `S.mapLimit(games, 4, async g => S.fetchDoc(g.sourceUrl).then(doc => …))` to enrich (cap concurrency; be polite to the site), and show the list immediately while details arrive (return early, then `app.update`).
