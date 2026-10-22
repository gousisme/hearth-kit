# 6 · Playbook: adapting the kit to a new site

For the AI agent doing the adaptation. Work in this order; do not write scraper code before step 2 is answered. Be concrete and short with the user: ask in one batch, not one question at a time.

## Step 1 · Read (5 min)
`docs/04-data-contract.md` (the target shape), `userscripts/example-fixture.user.js` (a complete working script, ~80 lines), `userscripts/template.user.js` (what you will copy).

## Step 2 · Ask the user about the site

Ask these **in one message**. Mark which ones the user can answer by pasting something (a URL, saved HTML, a DevTools screenshot) rather than describing it.

**Scope and pages**
1. What is the site's URL, and which pages should be redesigned? (home/browse listing, category pages, a game's detail page, search results, a library/account page.) Everything else will show the original site untouched.
2. Is the site a **single-page app** (the page changes without a full reload) or classic server-rendered pages? How can you tell on your end? (Tip: open DevTools → Network, click a link, see whether the document reloads.)
3. Does the site need **login**, and is the content visible only when logged in?

**Data on the listing page**
4. Please paste or attach the HTML of **one game card/row** on the listing page (right-click it → Inspect → copy `outerHTML`), plus the URL of a listing page. If you can't, tell me what's visible on a card: title, image, genre, size, rating?
5. Does the listing **load more on scroll / "Load more" button / pagination**? How many games exist in total, roughly?
6. Is there a **stable id** per game (a `data-id`, a slug in the URL)? 

**Data on the detail page**
7. Please paste the **detail page URL and the HTML of the main content area** for one game. Which of these exist there: description, developer, genres, release date/year, file size, rating, system requirements, screenshots, similar games?
8. Is the detail content in the page, or loaded afterwards by a request (look in Network for a JSON/XHR response)? **If there is a JSON API, give me one example URL and response**; scraping JSON is far more robust than scraping HTML.

**Download and artwork**
9. What should the **Get** button do: open the site's download page/URL, trigger the site's own download button, something else? Is there one download URL per game?
10. Does the page link to **Steam** (store URL or app id) for each game, or should I look up Steam app ids by title? If neither, are the site's own images good enough to use as poster/hero art (then I use `art.*` overrides), or should games without Steam art just use generated art?

**Constraints and taste**
11. Which **browser(s)** run the script (Tampermonkey on Chrome/Firefox/Safari)?
12. Do you want the **accent colour or site name/logo** changed from the defaults? Any pages/features of the old site that must stay reachable (account page, forum link)? (They can be `nav` items with `view:"external"`.)
13. Where will the kit be hosted: a GitHub repo of yours (give me `user/repo`) or local files while testing?

## Step 3 · Inspect the real page
Prefer, in this order: (1) an embedded JSON blob or API (`__NEXT_DATA__`, `window.__INITIAL_STATE__`, XHR responses); (2) stable attributes (`data-*`, `itemprop`, ids); (3) semantic structure; (4) class names, last resort, and note them as fragile (hashed/utility class names change on every deploy). Write selectors you can justify, and put each in one place at the top of the scraper, named.

## Step 4 · Copy and fill the template
1. Copy `userscripts/template.user.js` → `userscripts/<site>.user.js`.
2. Fill the header: `@name`, `@match`, `@connect` (every host you fetch from), `@require`/`@resource` URLs (`@v0.1.0` tag; localhost URLs while developing).
3. Write `scrapeListPage` → returns `{ site, games }`. Use `S.game({...})` for every record. **Make `id` stable.**
4. Add a detail route only if the user wants one: it returns the same shape, merging into `ctx.store.games`, with `view: d => ({ open: id })`.
5. Set `ready` selectors that exist **only when the data has rendered**.
6. Leave hero/categories/shelves out at first. The UI derives them. Add `featured`/curated `shelves` only if the site has real curation (e.g. a "Popular" list: map it to a ranked shelf).

## Step 5 · Test loop
1. `npm run serve` and load the built files from `http://localhost:5173/repo/dist/…`, or use the GitHub tag.
2. Open the target site with `debug: true`. In the console: `HearthScrape.check(data)` lists errors/warnings. Fix every **error**; read every warning.
3. Verify against the site, not just "it rendered": count of games equals the site's count; titles/years/sizes spot-checked on 3 games; every Get URL is absolute and opens the right page; images load (Network tab: any 404/CSP errors?).
4. Navigate: click through the site's own links (if SPA) and use back/forward; the redesign must follow, with no stale content.
5. Press `Alt+Shift+H` to confirm the original page returns; temporarily break a selector to confirm the **fallback to the original page** works (no blank screen).
6. Resize to ~390 px wide.

## Step 6 · Hand back
Tell the user: what routes are redesigned, what is scraped from where, what is *not* available (and why), the known-fragile selectors, how to turn it off (`Alt+Shift+H` or disable the script), and how to pin/update the kit version. Set `debug: false`.

## Rules of thumb
- Never inject scraped strings with `innerHTML` yourself; return data and let the UI escape it.
- Be gentle: cap concurrent detail fetches (`mapLimit(…, 3–4, …)`), never loop-fetch an entire catalogue on every page view; cache in `ctx.store` (or `GM_setValue` with a timestamp).
- Don't modify `src/` for a single site. If a site needs something the kit lacks (a new field, a component), propose a **generic** addition to the kit and tell the user; keep site code in the userscript.
- When in doubt about structure, ask the user for HTML. A pasted `outerHTML` beats guessing.
