# 7 · Gotchas

## Page CSP (Content-Security-Policy)
Some sites forbid loading from other origins. Symptoms are console errors mentioning *Refused to load / violates the following Content Security Policy directive*.
- **`img-src` blocks the Steam CDN** → cards stay as flat tiles with the title (no artwork). Try `gmImages: true` in `HearthGlue.run` (fetches through `GM_xmlhttpRequest`, serves `blob:` URLs; needs `@grant GM_xmlhttpRequest` + `@connect cdn.cloudflare.steamstatic.com`). If the CSP also lacks `blob:`/`data:` in `img-src`, this cannot work; use the site's own images via `art.*` / `art.fallback`.
- **`font-src` / `style-src` blocks Google Fonts** → the system fallback stack is used (looks fine, less distinctive). `fonts: 'gm-inline'` inlines fonts as `data:` URIs (needs `font-src data:` allowed). Or set `fonts: 'none'`.
- **`connect-src`** doesn't affect `GM_xmlhttpRequest` (that's why scrapers use it for cross-origin data) but does affect plain `fetch`.
- Inline `<style>`/adopted stylesheets inside the shadow root are generally not blocked by `style-src` (constructable stylesheets). If a very strict site does block it, `mount()` falls back to a `<style>` element; if that is blocked too, nothing renders and glue falls back to the original page.

## Load timing
- `@run-at document-start` is essential for the no-flash experience, but at that moment there is no `<body>`. Glue handles this; your scrapers run only after `ready`.
- Frameworks render late and re-render. **Never scrape at DOMContentLoaded.** Wait for a selector that proves the data exists. If the list is built progressively, wait for the container *and* a plausible count.
- Hiding the body with `display:none` (`hide:'display'`) stops layout, so **lazy-loading, infinite scroll and `IntersectionObserver`-driven sites won't load more content**. Use `hide:'visibility'` and `HearthScrape.loadAll()`, or better, find the API the site calls.
- Sites that detect `display:none`/hidden tabs and pause (some SPAs) may also behave oddly; try `'visibility'`.

## SPA navigation
- The URL often changes **before** the new content renders: always combine navigation with a `ready` that targets the new content. A stale scrape shows the previous page's data.
- A rapid sequence of navigations is handled (superseded scrapes are discarded), but your `scrape()` should not mutate shared state half-way. Write to `ctx.store` only at the end.
- Some sites replace `<body>` or `<html>` classes on navigation. The kit's host lives under `<html>`; if a framework wipes `<html>` children, remount happens on the next navigation. If it wipes without navigating, tell the user.
- Back/forward restores from bfcache may skip the userscript; the 500 ms poll and `popstate` cover most cases.

## Style conflicts
- Shadow DOM prevents both directions of leakage. Exceptions: **inherited properties** (font, color) start fresh because `:host{all:initial}`; **`@font-face` must live in the main document** (glue does it); `position: fixed` host with `z-index: 2147483647` sits above everything. If the site has a cookie banner or chat widget above that, nothing to do.
- The **original page is only hidden**, so its own `position:fixed` overlays (cookie banners, modals) are hidden with the body. That is usually desirable; if a banner is required for the site to work, show it by adding a rule through the glue (`GM_addStyle`).
- Don't use `shadow:false` on real sites: the kit's short class names (`.card`, `.btn`, `.hero`) will collide. Light DOM exists for the mockup/dev only.

## Lazy-loaded and dynamic data
- Image `src` may be a 1×1 placeholder with the real URL in `data-src`/`srcset`: use `S.imgUrl()`.
- Backgrounds in CSS: `S.bgUrl()`.
- Values rendered by JS after clicks (tabs, "show more"): prefer the underlying JSON; otherwise `waitFor` after programmatically clicking, and be careful not to trigger real downloads.
- Relative URLs: always `S.abs(href)` (the contract requires absolute http(s) URLs; others are dropped).

## IDs and caching
- `game.id` must be stable between visits; changing ids break "saved" state and detail routes. Use the site's slug or numeric id.
- Tampermonkey caches `@require`/`@resource` by URL, and keeps `@resource` (the CSS) **until the script is re-installed**. After releasing a kit change, put the **new commit SHA** in the four header URLs, bump `@version` and re-install; otherwise users keep the old files. Symptom of a stale CSS: new UI looks unstyled (the reference script warns when a known rule is missing from `hearth.css`).
- A cached value whose **shape** changed is a silent bug: old entries are served without the new fields. Version the cache (`STORE_SHAPE`, `STORY_V`) or rename the key. (It hid Steam trailers/About images for 24 h once.)

## Steam art
- Some apps' plain library URLs 404 (hashed asset paths on newer apps); the fallback chain hides it, but check the Network tab. The robust fix is to resolve real asset URLs from Steam's `IStoreBrowseService/GetItems` and pass them as `art.*` (docs/09 §3).
- Steam hero/library art is high-res; keep `loading="lazy"` (already default) and don't add more large images per screen.

## Security
- All scraped text is escaped by the UI, URLs are filtered to `http(s)`, and the host uses an open shadow root. Don't weaken this: never build HTML from scraped strings in a userscript.
- `@connect` should list only hosts you actually fetch from.
- The kit runs with the userscript's privileges. Review any third-party site script you install.

## Steam (see docs/09 for the full story)
- Calls must be **anonymous** (`GM_xmlhttpRequest` with `anonymous: true`): with the browser's Steam cookies Steam may answer an API call with an HTML redirect/challenge page. Send explicit JSON headers and a `Referer`; report non-JSON answers with status, final URL and page title.
- 429/403 or repeated timeouts → pause all Steam traffic for 60-90 s; never cascade into other hosts meanwhile. Stagger the full page's requests.
- Trailers are **DASH streams** now: you need dash.js (`@require` pinned) and a poster + "Watch it on Steam" fallback.
- A "not Steam" verdict (for a link, or an id lookup) may only be cached when the answer was really read; a failed request must not be remembered.

## Redirect interstitials and outbound links
Sites that wrap outside links in their own redirect page (online-fix.me `/ext/…`) hide the real target in that page's markup/script. Parse it; don't assume. Never let an unrelated link become "Open in Steam".

## Language
If the site is not in English, convert dates and recurring phrases **locally first** (no network), then batch the rest, validate the answer (an answer still mostly in the source language is a failure), cache successes, and **never cache a run that had failures**. Expose the failure reasons for debugging.

## Lists, paging and categories
- A site may file an item under one URL folder but list it in several categories; the category **page** is the truth. Remember "seen on category page X" (and expire it).
- The site's list order is the product: store a rank per list and let the kit order by it; don't re-sort, and don't special-case pinned posts (an attempt to re-rank them was added and removed again).
- Treat `/page/N/` as a later page of a feed, never as the home page.
- Empty or past-the-end pages should fall back to the original site immediately, not after the ready timeout.

## Idle work and storage
- `GM_setValue` serialises the whole value on every call. Mark stores dirty and write one per idle slice; flush on `pagehide` and when the tab is hidden.
- Background fetching/parsing is a long task. Start it only after the reader has been still for a moment and the browser is idle.
- Don't let any single image/lookup hold a shared loader slot: bound each by a deadline.

## Accessibility and performance
- Hero autoplay pauses on hover/focus/hidden tab and is **off** under `prefers-reduced-motion`.
- The grid renders in chunks of 24 and loads the next chunk ~700 px before the end; hundreds or thousands of games are fine as long as you supply them page by page through `loadMore` (docs/04). Don't pass thousands of games into shelves.
- Art slots are lazy: only slots near the viewport load, 8 at a time.

## Known limitations (kit 0.6.0)
- "Saved" games live in memory unless the userscript persists them via `onSave`/`saved` (the reference script uses `GM_setValue('hf3:saved')`).
- Browser Back does not close the full game page (only its Back pill and Esc).
- `gm-inline` fonts and `gmImages` are only verified against the fixture's shim, not a strict-CSP site.
- Steam DASH trailers are untested on Firefox.
- There are no automated tests; verify in a real browser against the real site.
