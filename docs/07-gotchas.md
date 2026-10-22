# 7 · Gotchas

## Page CSP (Content-Security-Policy)
Some sites forbid loading from other origins. Symptoms are console errors mentioning *Refused to load / violates the following Content Security Policy directive*.
- **`img-src` blocks the Steam CDN** → images stay as generated art (the UI degrades gracefully). Try `gmImages: true` in `HearthGlue.run` (fetches through `GM_xmlhttpRequest`, serves `blob:` URLs; needs `@grant GM_xmlhttpRequest` + `@connect cdn.cloudflare.steamstatic.com`). If the CSP also lacks `blob:`/`data:` in `img-src`, this cannot work; fall back to generated art or use the site's own images via `art.*`.
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
- Tampermonkey caches `@require`/`@resource` by URL. After releasing a kit change, **bump the tag** and update the userscript header; otherwise users keep the old files.

## Steam art
- Some apps' plain library URLs 404 (hashed asset paths on newer apps); the fallback chain hides it, but check the Network tab and use `art.*` overrides where needed.
- Steam hero/library art is high-res; keep `loading="lazy"` (already default) and don't add more large images per screen.

## Security
- All scraped text is escaped by the UI, URLs are filtered to `http(s)`, and the host uses an open shadow root. Don't weaken this: never build HTML from scraped strings in a userscript.
- `@connect` should list only hosts you actually fetch from.
- The kit runs with the userscript's privileges. Review any third-party site script you install.

## Accessibility and performance
- Hero autoplay pauses on hover/focus/hidden tab and is **off** under `prefers-reduced-motion`.
- The first render creates ~100–300 DOM nodes plus generated SVG art per image slot; for catalogues beyond ~1,000 games, scrape and pass a **curated subset** (shelves of ≤ 30) and use `browse` for the rest, or add pagination to the browse view.

## Known limitations (v0.1.0)
- The browse grid renders all matches at once (no virtualisation/pagination).
- "Saved" games live in memory unless the userscript persists them via `onSave`/`saved`.
- Not tested against a real third-party site yet: the example is the bundled fixture. Expect to adjust per site.
- `gm-inline` fonts and `gmImages` are implemented but only verified against the fixture's shim, not a strict-CSP site.
