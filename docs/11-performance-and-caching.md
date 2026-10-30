# 11 · Performance rules and caching

Versions 0.6 → 0.11.15 of the script, and kit patches 7-19, were mostly about making a heavy UI (thousands of DOM nodes, ~100 images, 3D-tilted tiles, Steam lookups) feel instant on a real browser. The rules below are what survived. Follow them when touching either side.

## 1 · Rules (script side)

1. **One render per page load.** `build()` runs once per scrape; nothing re-renders in the background. Late data goes in through the kit's incremental paths (`app.add`, `resolveArt` patches, `push`), never a rebuilt page (a background re-render was what reset scroll position and replayed animations).
2. **Art is pulled, not pushed.** The kit calls `resolveArt(game)` right before a card's first image loads; only games on or near the screen are looked up. Until then a card is a skeleton. Ids and asset URLs are cached per game; a returning visit resolves everything from GM storage with **no network**.
3. **Cache first, refresh silently** (`ensure()`, `SECTIONS`). Any cached snapshot section is used immediately whatever its age; if older than `STALE_MS` (20 min) it is refreshed in the background **for the next visit**. Network is on the critical path only if nothing is cached, and then it is capped at 2500 ms (`budget`); a too-slow answer is still stored for next time (it used to be discarded, so a slow connection paid the wait on every page).
4. **Background work waits for the reader** (`quiet(gap, max)`): no pointer/wheel/key/touch/scroll for `gap` ms, then a `requestIdleCallback`; gives up waiting after `max` (15 s) and goes ahead. Used by the silent refreshes, the category warm-up and the page-2 prefetch (0.11.15: they used to start 1.5-2.5 s after load, which is exactly when people open Games).
5. **Deadlines on every network call** (`tmo`), with a fallback for every deadline (docs/08 §6 `soft()`), so one stuck request can never leave a sheet in skeleton state. A run where something timed out is shown but not cached.
6. **Batch and limit.** Steam asset lookups coalesce within 40 ms into ≤ 20-app requests; title searches ≤ 6 in flight with priorities (open sheet > waiting card > leftovers); translation 2 in flight; SteamGridDB 2 in flight. Staggered Steam calls on the page. (Four at once got HTTP 429.)
7. **Persist lazily** (`persist(...)`, `STORES`, `writeOne`, `flushStore`): `GM_setValue` serialises the whole object every time and some stores are large (`meta`, `trMem`, `storyCache`). So a change only *marks* a store dirty; 2.5 s after the first change **one store per idle slice** is written; everything pending is flushed on `pagehide` and when the tab is hidden. (Before: every change rewrote all nine stores in one task 1.5 s later, right after switching to Discover while its art was resolving.) `hf9:store` is the exception and is written directly.
8. **Never block first paint on Steam.** The hero needs a few games with hero art, so only 8 candidates are awaited, for ≤ 1.5 s.
9. **Don't fetch what the site already gave you**: `docs` caches parsed `Document`s per URL for the life of the page; the open page's own document is reused.

## 2 · Rules (kit side, `src/js/ui/mount.js`, `browse.js`, `genres.js`, `art.js`)

- **Home in two parts**: hero + featured at first paint; the rest (category wall, shelves) one section per idle slice after the page faded in, so Discover is a small task instead of a ~3000-node one.
- **Park, don't rebuild**: a finished Discover page is *detached* when you open another tab and put straight back (no markup, no layout, no image loaded or decoded twice); rebuilt only if the data changed meanwhile or it hadn't finished building.
- **Browse → Browse** (category / sort / search word) replaces only the title, count, sort control and grid. The heading and the category picker keep their DOM, scroll position and artwork (no fade, no blink).
- **The category picker is built once and kept**; it is rebuilt in place only when the games it is made of changed (a picker built while categories were empty used to stay blank), and several quiet `add()`s merge into **one rebuild in an idle moment**.
- **Tile walls are built when a tile nears the strip's visible part** (~400 px), not all at once (40+ tiles × 7 images in 3D layers was most of the cost); only bricks that can actually show get an image; edge fades are real overlay elements updated from scroll without restyling every tile.
- **Grid in chunks** of 24 cards; an `IntersectionObserver` sentinel loads the next chunk ~700 px early; when local games run out it calls `loadMore` and shows 6 skeleton cards that are removed **in the same synchronous step** that appends the new cards (otherwise the page got shorter for a frame and a reader at the bottom was pushed up, 0.11.14).
- **Cards only re-order in the Release-date sort** (a game arriving with a page can belong above the shown ones); every other list only appends.
- **Images**: slots hydrate only near the viewport, 8 at a time; decode first, reveal ≤ 2 per frame; per-URL timeout 12 s (`imageTimeoutMs`), per-card resolve deadline 4 s (`artDeadlineMs`; the script uses its own 2.5 s); a parked slot is woken by an observer when it comes near, however it got there.
- **Animate only `transform` and `opacity`** (docs/03). Hovers on the page work because the kit owns every rule; don't add page-level `<style>`.

## 3 · What is stored (Tampermonkey `GM_setValue`)

| Key | Content | Lifetime / cap |
|---|---|---|
| `hf3:snap` | cached `home` / `upd` list sections `{…, t}` | used at any age; refreshed silently after 20 min |
| `hf4:ids` | normalised title → Steam app id | no expiry |
| `hf4:miss` | normalised title → time of last failed title search | 3 days |
| `hf5:meta` | app id → `{poster, hero, logo, header, desc, dev, year}` or `0` | no expiry |
| `hf9:sid` | game id → `{app, url}` read from the game page's own Steam link (exact) | no expiry |
| `hf9:links2` | `/ext/<token>` URL → `{app,url}` or `{miss:t, host}` | hits forever, "not Steam" 24 h |
| `hf9:store` | app id → `{t, d}` Steam `appdetails` data | 24 h, max 40, `STORE_SHAPE` (3) |
| `hf8:story` | game id → `{v, t, patch}` the sheet's detail patch | 6 h, max 80, `STORY_V` (5), only if fully English |
| `hf8:tr` | Russian line → English | max 3000 (evicts oldest 800) |
| `hf_catmap_v1` | `{t, v:[[slug,[ids]]]}` category membership | 30 days, then the whole map resets |
| `hf3:saved` | saved game ids (Library) | until cleared |
| `hf:sgdbKey` | SteamGridDB API key | until changed |
| `hf:sgdbLogos2` | game/app → `{u: logo url, t}` | hits 365 d, misses 3 d |
| `hf9:pmiss`, `hf9:media`, and `extra` inside `hf3:snap` | **orphaned** by v0.11.16 (no longer read or written); harmless leftovers in storage | — |

**Changing what a cached value means** (adding a field to a store, fixing a parser that produced bad cached data): bump `STORE_SHAPE` / `STORY_V` or use a new key (`hf9:links` → `hf9:links2`, `hf:sgdbLogos` → `hf:sgdbLogos2`). Otherwise users keep the old shape until it expires (this hid Steam trailers for 24 h in 0.10.7).

Everything is also cleared by Tampermonkey's per-script storage reset. If something is stuck, `__hearthOnlineFix.flush()` writes pending changes, and removing the key through Tampermonkey's Storage tab is a safe fix.

## 4 · Measuring

The repo has no profiling harness, and the history does not record how the original timings were taken. Suggested method (not from the history): in DevTools → Performance record (a) first load, (b) Discover → Games → Discover, (c) scrolling the grid through three pages, (d) opening a sheet and a full page; look for long tasks right after each interaction and for images decoded twice. `__hearthOnlineFix.netDiag()` shows per-host latency and failures, and the script prints a one-line console summary at 20 s naming any host with 2 or more failures.
