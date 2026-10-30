# 5 · How the Tampermonkey script works

## Loading: `@require` + `@resource`, built files, pinned commit

```js
// @require   https://cdn.jsdelivr.net/gh/<user>/hearth-kit@<commit-sha>/dist/hearth-ui.js
// @require   …/dist/hearth-scrape.js
// @require   …/dist/hearth-glue.js
// @resource  hearthCss  …/dist/hearth.css
```

**Why this and not one giant script?** The userscript stays ~60 lines of site-specific code. The kit is versioned, cached by Tampermonkey, shared by every site script, and updated by bumping one tag. **Why `@resource` for CSS?** CSS is read as text with `GM_getResourceText('hearthCss')` and handed to `mount()`, which puts it *inside the Shadow DOM*. Injecting it into the page would let the site's CSS and ours collide. **Why a hand-rolled build?** The build is a ~100-line zero-dependency script (`scripts/build.mjs`), so the repo works with no `npm install`. Swap in esbuild if you outgrow it. **Why commit `dist/`?** jsDelivr serves straight from GitHub; no CI is needed.

Rules: **pin the full commit SHA** (`@a31f82acba9d274bfc789373d595592b35ec810f`; this repo has no tags, and a tag can be re-pointed), never `@main` (Tampermonkey caches by URL, and a moving branch makes bugs unreproducible). A commit URL never changes, so neither jsDelivr nor Tampermonkey can serve a stale `hearth.css` / `hearth-ui.js` against a newer script. Taking a newer kit = push, `git rev-parse HEAD`, paste into all four URLs, bump `@version`, **re-install** the script (Tampermonkey keeps `@resource` until then; `__hearthOnlineFix.kitDiag()` in the reference script shows what is really loaded). **Order matters:** UI, then scrape, then glue. For local development use `http://localhost:5173/repo/dist/…` (from `npm run serve`); no file-URL permission needed.

## What `HearthGlue.run(config)` does

Config (all optional except `css`): `name`, `css` (REQUIRED), `routes`, `hide`, `fonts`, `gmImages`, `ui` (the mount options), `failTimeoutMs` (how long `route.ready` may take, default 10 s; the reference script uses 15 s), `scrapeTimeoutMs` (30 s), `onNoMatch: 'original'|'keep'`, `toggleKey` (`'Alt+Shift+H'`), `debug`, and **`splash`**: `{ title, accentTitle, letter, logo, accent, ink, bg, timeoutMs }`, a loading screen shown at document-start on every matching route in its **own** shadow root (`glue/splash.js`), removed when the redesign has painted, when the original page is restored, or after `timeoutMs` (25 s). The reference script passes the site's logo and its accent so the first thing a visitor sees is already on-brand.

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

> Multi-page (server-rendered) sites such as online-fix.me reload on every link, so `navwatch` rarely fires there: each page load runs the whole sequence once. The reference script therefore keeps its state in `GM_setValue` caches (docs/11), not in `store`, which only lives for one page load.

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
`app` also has `el` (the host), `root` (the shadow root, for scripts that paint their own regions such as the full page), and **`app.add(games, { quiet? })`**: adds games to the running app without a re-render (search results, warm-up); existing games only gain new search tags, categories, `ranks` and dates. `{quiet:true}` never repaints Browse; it only refreshes the category picker (feature flag `quietAdd`).

`options`: `autoplay` (true; forced off under reduced motion), `autoplayMs` (7000), `theme` (token overrides), `saved` (initial saved ids), `placeholders` (demo content for empty sections; mockup only), `imageLoader(url) → Promise<string>`, `resolveDetail(game) → Promise<patch|null>` (called once, when a game's sheet first opens; fills `downloads`, `guide`, `update`, `facts`, `password`, `description`), `resolveArt(game) → Promise<patch|null>` (lazy per-card art lookup; a card waits at most `artDeadlineMs` (4000) for it, then loads with the art the game already has, and no single image URL may take longer than `imageTimeoutMs` (12000); `app.add(games)` adds games without a re-render), and hooks **`onGet(game, {button}) → false` cancels the default** (default opens `game.downloadUrl` in a new tab), `onOpen(game)`, `onClose(game)`, `onRoute(route)`, `onSave(game, on)`, **`onUser(user)`** (called when the avatar is clicked; return `false` to take over, otherwise the kit opens its own account sheet), **`resolveProfile(user) → Promise<profile|null>`** (called the first time the account sheet opens; the sheet is already on screen with the name and avatar, and fills in from `{name, avatarUrl, badge, stats:[{label,value}], facts:[{label,value}], links:[{label,href,hint,kind:'profile'|'bookmarks'|'logout'}]}`), and **`onArtMiss(game, kind, urls)`** (diagnostics: every candidate URL for an art slot failed; a missing *logo* is normal, the title is shown as text instead).

**Hooks added since 0.1** (all in `mount.js`'s header comment; flags in `HearthUI.features`):

| Option | Purpose |
|---|---|
| `loadMore({view, filter}) → Promise<game[]\|false>` | the grid asks for the next page when it has shown every local game (flag `loadMore`; docs/04 `ranks`) |
| `resolveArt(game)` | lazy per-card Steam/art lookup; `artDeadlineMs` (4000) and `imageTimeoutMs` (12000) bound it (flags `lazyArt`, `artDeadline`) |
| `resolveDetail(game, push)` | the sheet's details; call `push(patch)` as pieces arrive (flag `detailPush`); share one run between the sheet and the page |
| `resolveLogo(game, triedUrls) → Promise<url\|''>` | asked once when every logo URL failed (SteamGridDB in the reference script) |
| `resolveProfile(user)` / `onUser(user)` | account sheet fill / take over the avatar click (flag `profile`) |
| `onPage(game)` | when set, the sheet gets a **"Full page"** button calling it, and the hero's Details button opens the page; the script paints the page with `HearthUI.parts.page` (docs/10; flag `page`) |
| `onArtMiss(game, kind, urls)` | diagnostics: every URL for a slot failed |
| `theme` | token overrides, e.g. `{ ac: '#1ea7e0', ink: '#04141c' }` (one accent per site) |

Common customisations: make Get trigger the site's own download (`onGet: g => { document.querySelector(\`[data-id="${g.id}"] .dl\`).click(); return false; }`); persist saved games (`onSave` → `GM_setValue`, `saved: GM_getValue(...)`).

## Scraping helpers (`HearthScrape`)

`q, qa, text, attr, abs, num, imgUrl, bgUrl, first` (DOM) · `fetchDoc, fetchText, fetchJson, mapLimit, loadAll` (network; use `GM_xmlhttpRequest` automatically when granted) · `steamAppId` · `game, uniqueBy, mergeGames, check` (data) · `waitFor, slug, delay`. Signatures are documented at the top of each file in `src/js/scrape/`.

Typical pattern when the list page lacks details: scrape the list, then `S.mapLimit(games, 4, async g => S.fetchDoc(g.sourceUrl).then(doc => …))` to enrich (cap concurrency; be polite to the site), and show the list immediately while details arrive (return early, then `app.update`).
