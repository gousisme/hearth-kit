# 12 · History: what changed, and why

Condensed from the version notes at the top of `userscripts/online-fix.user.js` (script versions) and `git log` (kit). The **root causes** are kept because they are the part that saves time: most entries are "this looked like X, was actually Y".

## How script and kit versions relate

- The kit's `package.json` is **0.6.0**; the script is **0.11.16**. They are independent numbers. The README badge (0.1.0) and the old docs' `@v0.1.0` tag advice are stale: nothing is tagged.
- Since script 0.9.4 the kit is **pinned to a commit SHA** in the four `@require`/`@resource` URLs. The current pin is `a31f82acba9d274bfc789373d595592b35ec810f` (= `HEAD` at the time of writing, "improve performance", 2026-10-30) and contains everything through "page-19".
- The script's version notes say "NEEDS hearth-kit-page-N.patch … replace `REPLACE_WITH_NEW_KIT_SHA`". That was the author's workflow: the kit change was delivered as a patch file, applied and pushed, `git rev-parse HEAD`, and the SHA pasted into the URLs. The `.patch` files are **not in the repo** (they are the kit commits). `REPLACE_WITH_NEW_KIT_SHA` no longer appears in the URLs; it survives only in old comments.
- Kit commits that the script notes name explicitly: `e3f746a` = page-12, `82c4145` = page-14, `a1e178c` = page-15. Other patch numbers are not individually mapped to commits; their effects are all present in `a31f82a` (verified by code markers: idle picker rebuild = page-19, same-step skeleton removal = page-18, release-sort-only settle = page-17, `releaseSort` flag = page-16).
- Kit feature flags (`HearthUI.features`) are how a script learns what its pinned kit can do. At `a31f82a`: `downloadLoop, lazyGrid, skeletons, loadMore, lazyArt, addGames, noGeneratedArt, richDetail, profile, logoText, media, steamLink, detailPush, artDeadline, smoothMedia, siteLogo, sheetMorph, parts, page, lazyWalls, quietAdd, sorts, softBrowse, ranks, releaseSort`.

## Kit history (49 commits, 2026-10-22 → 10-30)

| Dates | Milestone |
|---|---|
| 10-22 | first commit; first real userscript |
| 10-23 | lazy list (chunked grid), skeleton loading |
| 10-24 | **no generated art** (a slot is a skeleton, a real image, or a quiet empty tile), lazy art (`resolveArt`), detail-sheet redesign, "stuck on loading" fix, visual passes |
| 10-25 | download-icon animation (Lottie removed; arrow-only loop), **3D category tiles** ("Browse by category" brick wall) |
| 10-26/27 | game detail page → **full page** ("details button now opens full page"), Steam media on the page, About images without backdrop, logo-miss callback |
| 10-28 | popup plays **Steam streamed trailers**; site mark and avatar dock beside the pill when scrolled; stutter fixes; tile-wall caching; performance |
| 10-29 | performance, layout, **sorting** (`ranks`, Sort button) |
| 10-30 | "revamp game tab", minor fixes, idle-time work ("improve performance", `a31f82a`) |

## Script history

### 0.11.16 (this documentation pass)
- `@match` is the whole site; routes decide what is redesigned (this also makes `/coop/` and `/multi/` work on direct visits).
- Steam "Price" row removed from the full page (no prices anywhere).
- **Bug fixed:** the category warm-up never ran: `warmCategories` declared `const quiet = !!FEAT.quietAdd`, shadowing the `quiet()` idle helper, so `await quiet(1000)` threw "quiet is not a function" in an unobserved promise. Warm-up now actually runs.
- Dead code for older kits removed (see docs/08 §11); stale `REPLACE_WITH_NEW_KIT_SHA` sentences removed from old notes. Pin unchanged (`a31f82a`).

### 0.11.x: Games = the site's own lists; speed (kit page-6 … page-19)
- **0.11.15**: background work (silent refresh of the cached home/updates pages, category warm-up, page-2 prefetch) waits until the reader has been still for a moment *and* the browser is idle, instead of 1.5-2.5 s after load. Page 2 is fetched while idle so the first visit to Games finds it ready. The cached home snapshot is written through the idle writer. *(kit page-19: category picker refreshes in idle time)*
- **0.11.14**: special handling of pinned posts removed (stays on top of page 1 as on the site). Scrolling to an uncached page no longer jumps you up (skeletons replaced by the new cards in one step). *(page-18)*
- **0.11.13**: "All games"/categories follow the site's order exactly again; only the posts the site PINS were moved, by last-update date (reverted in 0.11.14). Cards reorder after a page loads only in "Release date" sort. *(page-17)*
- **0.11.12**: new sort **Release date** (the game's own date, from the "Релиз игры: 23.10.2026" line). Pinned posts no longer sit on top (reverted later). *(page-16)*
- **0.11.11**: Games/"All" is the site's real list: `/`, `/page/2/`, … loaded as you scroll ("21+ games"). Same for every category, each showing *its* page's list. **Two categories were missing**: Co-op (`/coop/`) and Multiplayer (`/multi/`). Sort = Default / Recently updated (`/guides_upd.html`, 50 games). "New" sort removed (default already is newest-first). `/page/N/` no longer counts as the home page. *(page-15)*
- **0.11.10**: sorting uses the site's real dates (card `<time datetime>`, "Обновлено …" line; a never-updated game counts from its publish date), not the release *year*. Category strip moved above the heading row so Sort sits by the games it sorts. Older cached games have no date until their card is read again. *(page-14)*
- **0.11.9**: tabs are **Discover / Games / Library** only; the "Recently updated" category tile became a **Sort** button. Choosing a category/sort/search word replaces only title, count and grid (no fade, strip not rebuilt, does not blink or jump). The search box's X closes the search and returns to where you were. *(page-13)*
- **0.11.8**: category pickers build a tile's artwork only when it nears the visible part of the strip. **Fixed blank/grey tiles**: the Browse picker was kept from the first visit (built while most categories had no game), and slots dropped while a kept page was detached were never loaded again. Strip edge fades work again (real overlay elements). Warm-up now runs on category/updates pages too, merges in groups of 3, never repaints Browse (`app.add(list,{quiet:true})`). *(page-12, `e3f746a`)*
- **0.11.7**: tiles load only visible wall bricks; edge fades stop restyling every tile per scroll frame. *(page-11)*
- **0.11.6**: Browse picker built once and kept while switching categories. *(page-10)*
- **0.11.5**: picker edge fades sit exactly at the strip edge; selection ring drawn inside the tile. *(page-9)*
- **0.11.4**: "All" tile has the same brick wall (library games, accent tint); first tile's ring not clipped; tiles no longer slide up one by one. *(page-8)*
- **0.11.3**: Shift+wheel / arrows glide continuously and settle on a card edge; "Read more" ↔ "Read less"; Browse's category picker is the same tile strip as the home one (+ an "All" tile). *(page-7)*
- **0.11.1**: popup viewer plays Steam trailers too; mark and avatar slide beside the pill when scrolled (spring). *(page-6)*
- **0.11.0**: game page gallery is **Steam's** (trailers then screenshots); the site's media only when Steam has none. **Cause of "the site's media always wins"**: Steam removed direct mp4/webm files (trailers are DASH now), so every Steam trailer was dropped. Now played with dash.js 4.7.4 (`@require`), poster + "Watch it on Steam" when a stream cannot play. UNTESTED against live Steam / Firefox. *(page-5)*

### 0.10.x: the full game page
- **0.10.8**: "falling back to the original page: waitFor timed out: #dle-content article.news" = a list page never showed its cards. The fallback is by design. Now an empty finished page falls back at once, a slow page gets 15 s.
- **0.10.7**: **stale cache hid About clips/images for 24 h** (old entries lacked the media fields). Cache is versioned (`STORE_SHAPE`).
- **0.10.6**: About section images have no backdrop (many are transparent dividers); the page asks SteamGridDB for a logo too; `__hearthOnlineFix` exported to the **page** via `unsafeWindow` (reinstall to get the new `@grant`).
- **0.10.5**: rating card flat tinted tiers (no glow); **About images were dropped when `http:` or protocol-relative** (that is why some games showed none), `<video>` clips and lone bullets handled; store details requested once for page and sheet, ignore the throttle pause, retry once, never fall back to an old entry without media.
- **0.10.4**: rating card has a look per Steam verdict; hero "Details" opens the full page; page media straight from Steam, site media only where Steam has none of that kind and the page waits for Steam (skeleton) instead of showing the site's first. *(page-2)*
- **0.10.3**: every visual (markup, CSS, icons, motion) moved into the kit; ~300 script lines gone. **The empty box under "Open in Steam" was a skeleton for the rating card.** Instant hover cause: the page's own `<style>` lost to the kit's rules. Steam reviews requested **without browser cookies** and with JSON headers; non-JSON answers are reported; community-page and store-page fallbacks. *(page.patch)*
- **0.10.2**: side panel and install guide are the kit's own blocks (`HearthUI.parts`); comment pager also above the list; reviews cursor URL-encoded, second URL shape, BOM-safe parse. *(parts patch)*
- **0.10.1**: round 2: side panel is the popup's; banner with logo is back; media strip fades at both ends; install guide uses numbered cards; **comments have real page switching** (the site's own pages, cached, numbered pager) instead of "load more"; Steam review list ignores the throttle pause, retried, falls back to all languages, has Try again; Steam requests staggered.
- **0.10.0**: **new full game page** next to the popup (gallery, About, rating, reviews, comments, requirements, install guide, downloads, facts); `PAGE_ON_GAME_URL`; detail loading shared between popup and page.

### 0.9.x: Steam correctness, resilience, 3D tiles
- **0.9.15**: tile brick wall fills **from the centre outwards** and loops through the category's games when there are fewer than bricks. *(kit 0.5.12)*
- **0.9.14**: **opening a never-loaded category said "Nothing matches"** (no local game → empty page that never asked for pages). Kit now draws skeleton cards and calls `loadMore`. Category warm-up added (`WARM_CATS`). *(kit 0.5.11)*
- **0.9.13**: **category pages showed too few games** (Racing: "no results"): a game's category was read from its URL only, but the site files a game under one folder and lists it under several. Now `catmap` (docs/08 §5). *(kit 0.5.10: `addGames` merges categories)*
- **0.9.12**: home shelves fade at their edges; "Browse by category" 3D tiles replace the chips. *(kit 0.5.9)*
- **0.9.11**: **"Open in Steam" read from the `/ext/` redirect interstitial itself**; "not Steam" only remembered when the redirect page was really read (a failed request used to hide the button for 24 h); `linkDiag()`. Get-arrow loop driven by Web Animations API. *(kit 0.5.5)*
- **0.9.10**: Open in Steam opens `https://store.steampowered.com/app/<id>/` (not the redirect); no Lottie, kit's own arrow icon; modes with notes ("(local co-op)") read "Co-op (local), Multiplayer". `STORY_V 5`.
- **0.9.8**: **Open in Steam appeared for non-Steam games** (the first `/ext/` link on the page, `title="xbox.com"`, was taken as Steam); now only a link announced/titled as Steam counts. Guide-closed block/label. Category "Игры виртуальной реальности" → "Virtual reality"; unseparated "Кооператив Мультиплеер" split and translated.
- **0.9.7**: sheet's "How to connect" and media appear **together** (the double load was the page's own screenshots pushed first, then swapped for Steam's, while the guide waited for translation); top-left logo is the site's real logo. *(sheet updates region by region; fading viewer; strip edge fade)*
- **0.9.6**: **cards no longer wait ~6 s for Steam**: `ART_WAIT_MS` 2.5 s; lookups prioritised (open sheet > waiting cards > leftovers); the per-card "fetch the game page for its Steam link" cascade removed. *(kit `artDeadline`)*
- **0.9.5**: **Steam back-off**: 429/403 or 3 timeouts pause Steam 60-90 s instead of a retry storm; nothing falls through to fetching game pages meanwhile (that cascade froze everything); one-line failing-host summary after 20 s.
- **0.9.4**: **kit pinned to a commit SHA** (a commit URL never changes, so jsDelivr/Tampermonkey cannot serve a stale `hearth.css`/`hearth-ui.js`); `kitDiag()`; SteamGridDB hard 6 s deadline.
- **0.9.3**: translation gives up after 20 s (each endpoint 8 s); every request logged (`netDiag()`); SteamGridDB limited to 2 concurrent, pauses 5 min after 3 failures.
- **0.9.2**: **every network call has a timeout** (the sheet used to wait forever on one stuck request and show skeletons for good); a run with a timeout is not cached; SteamGridDB also searches by name.
- **0.9.1 / 0.9.0**: logo fallback via **SteamGridDB** (needs a free API key from the Tampermonkey menu); Russian never shows (local phrase table + one batched request with 3 endpoint fallbacks; stale cached sheets containing Russian discarded); Co-op/Multiplayer player counts; "Open Steam" from the page's own link; media strip: Steam trailers + screenshots, else the page's own. *(needs kit ≥ 0.4)*

### 0.8 and earlier
- **0.8.1**: Get opens the detail sheet (no dropdown); translation validated + retried and a failed run never cached; update line split into date/reason; "Fresh update" tile uses the banner image.
- **0.8**: own profile sheet (no jump to the original profile); game pages in English **or** Russian; "Build N" updates; text-first logos. *(kit ≥ 0.3, `profile` flag)*
- **0.6 design rules** (still the foundation): one render per page load; art is pulled; no generated art; kit pinned; extra pages cached with stale-while-revalidate; opening a game never touches the URL; "Get" resolves the real link when pressed.
