# AGENTS.md: start here

For an AI agent picking this repo up. Read this file fully, then the docs it points to for your task. Everything below was verified against the code at kit commit `a31f82a` and script `userscripts/online-fix.user.js` v0.11.16 (2026-10-30). If the code has moved on, trust the code and fix the docs.

## 1 · What this is

**Hearth Kit** replaces a website's UI with a cinematic game-storefront, via Tampermonkey: a userscript scrapes the original page, hides it, and mounts a Shadow-DOM UI. Two layers:

- **The kit** (`src/` → `dist/`): site-agnostic UI (`HearthUI`), scraping helpers (`HearthScrape`), Tampermonkey glue (`HearthGlue`), CSS. Loaded by userscripts from jsDelivr, **pinned to a commit SHA**.
- **Userscripts** (`userscripts/`): one per site. The only real one is `online-fix.user.js`, the Online-Fix.me redesign. It is much bigger than the README suggests and holds most of the project's hard-won knowledge (Steam resolution, site lists/ranks, translation, the full game page, caching).

## 2 · State of things

| | |
|---|---|
| Repo | `github.com/gousisme/hearth-kit`, branch with 49 commits, no tags, no CI, no tests |
| Kit | `package.json` 0.6.0 · pinned commit `a31f82acba9d274bfc789373d595592b35ec810f` = HEAD when this was written |
| Script | v0.11.16, header pins the kit SHA in four URLs (3× `@require`, 1× `@resource`) |
| Build | `npm run build` (zero dependencies, Node 18+). `dist/` is committed and **rebuilds byte-identical** from `src/` (verified) |
| Docs | 01-07 written for 0.1.0 and updated on 2026-10-30; 08-12 are new |

## 3 · Read what matches your task

| Task | Read |
|---|---|
| Anything on online-fix.me (parsing, lists, categories, search, translation, downloads) | [docs/08](docs/08-reference-online-fix.md) |
| Art, logos, trailers, "Open in Steam", reviews, 429s | [docs/09](docs/09-steam-integration.md) |
| The full game page or the sheet's detail loading | [docs/10](docs/10-game-page.md), docs/08 §6 |
| Slow / janky / stale-cache / "why is it written lazily" | [docs/11](docs/11-performance-and-caching.md) |
| "Why is it like this? Did we try X?" | [docs/12](docs/12-changelog.md) (root causes are kept) |
| Changing the kit's UI | [docs/01](docs/01-overview.md), [02 design](docs/02-design-system.md), [03 motion](docs/03-motion.md), [05 integration/API](docs/05-userscript-integration.md) |
| Data shape between scraper and UI | [docs/04](docs/04-data-contract.md) (+ `data/hearth-data.schema.json`, `src/js/shared/schema.js`) |
| A **new site** | [docs/06 playbook](docs/06-adaptation-playbook.md), then docs/08 §13. Run `userscripts/site_skeleton.user.js` on the target page (Alt+Shift+S) to get its structure as Markdown/JSON |
| Gotchas (CSP, load timing, SPA) | [docs/07](docs/07-gotchas.md) |

## 4 · Where things live: kit vs script

Rule: **the kit draws, the script decides what and when.** A userscript writes no CSS, no inline styles, no icons. If you need a new visual, add it to the kit (`src/js/ui/components/*.js` + `src/styles/*.css`), expose it through `HearthUI.parts` if the script needs to place it, and add a capability flag in `src/js/ui/index.js → features` so scripts can detect it.

| Concern | Kit | Script |
|---|---|---|
| Home, shelves, hero, category tile wall, Browse grid, Sort, sheet, full page layout, rating card, motion | yes | no |
| Parsing the site, caching, Steam lookups, translation, paging (`loadMore`), search, profile data | no | yes |
| Steam artwork URL guessing (`HearthUI.steam`, last resort) | yes | the script passes **real** URLs from Steam's API (docs/09 §3) |

## 5 · Invariants: do not break these

1. **Data contract** (docs/04): only `id` + `title` required; URLs must be absolute http(s); all text is escaped by the UI. **Never build HTML from scraped strings in a script.** (Steam's HTML is parsed into plain blocks; the one `innerHTML` use is on an inert `<template>` for parsing.)
2. **Shadow DOM** hosts the UI; never `shadow:false` on a real site.
3. **Fail safe**: any error in ready/scrape/mount → the original page is shown again (`window.__hearthError`). Never leave a blank page. `Alt+Shift+H` toggles.
4. **Motion**: animate only `transform`/`opacity`; enter slow, leave fast; `prefers-reduced-motion` honoured (docs/03).
5. **One accent colour per site** (the Online-Fix script overrides the kit's lime with `#1ea7e0`). No glows, no gradients except the functional fades over art.
6. **No generated artwork**: a slot is a skeleton, a real image, or a quiet empty tile. Logos start as title text.
7. **One render per page load**; late data uses `app.add`, `resolveArt`/`resolveDetail` patches, `push`. See docs/11.
8. **Every network call has a deadline and a fallback.**
9. **Pin the kit by commit SHA**, never `@main`, never a tag (there are none).
10. Build limits (`scripts/build.mjs`): named imports only, **no `as`**, no default exports, top-level declarations at column 0 and **unique across a whole bundle**.

## 6 · Workflows

**Change the kit and ship it to the Online-Fix script**
1. Edit `src/`. `npm run build`. Commit `src/` **and** `dist/` together.
2. `git push`; `git rev-parse HEAD` → the new SHA.
3. In the script header replace the SHA in all four `@require`/`@resource` URLs; bump `@version`; add a note at the top of the script's changelog comment and to docs/12.
4. The user must **re-install** the script: Tampermonkey keeps `@resource` (the CSS) until re-install. Check with `__hearthOnlineFix.kitDiag()` (loaded kit version, `.dp-pgb` rule) and the console warning about an old `hearth.css`.
5. Add a feature flag to `features` for anything the script must detect.

**Docs-only commits** do not change `dist/`, so the script's pin stays valid; do not bump it.

**Change only the script**: bump `@version`, add the version note in the header, update docs/12 and the relevant doc (08-11). If the *meaning* of a cached value changes, bump `STORE_SHAPE` / `STORY_V` or use a new storage key (docs/11 §3).

**The repo copy vs the installed copy.** `userscripts/online-fix.user.js` is a copy of the owner's script (v0.11.15 as uploaded, then edited to v0.11.16 here). It is not auto-synced. When you change it, tell the owner which file is canonical; don't assume.

**Debugging in the browser**: `__hearthOnlineFix` is on the page's `window` (docs/08 §12): `netDiag()`, `pageDiag()`, `kitDiag()`, `steam()`, `linkDiag()`, `sgdbDiag()`, `trDiag()`, `misses()`, `catmap()`, `story(id)`. Set `DEBUG = true` in the script for console logging.

**Local dev of the kit**: `npm run serve`, then point `@require`/`@resource` at `http://localhost:5173/repo/dist/…` (see `userscripts/example-fixture.user.js`). `mockup/index.html` shows the UI with sample data.

## 7 · Known issues and notes

- **Untested** (per the script's own notes): live Steam DASH trailers on Firefox.
- **Browser Back does not close the full game page** (only the Back pill and Esc). No deep link to the page other than the game URL.
- **No automated tests or CI.** `npm run validate -- file.json` only checks a data file against the contract.
- **Whole-site `@match`.** Since v0.11.16 the script runs on every page of online-fix.me; `ROUTED()`/the routes decide which pages are redesigned, everything else (profiles, search results, …) shows the original site. Don't try to restyle unrouted pages without a scraper for them.
- **Translation.** The site is Russian and public, so its text (install guide lines, update notes, profile labels, and comments when the reader presses Translate) goes to `translate.googleapis.com`, `clients5.google.com` and `api.mymemory.translated.net`. Steam requests are sent without browser cookies. The SteamGridDB key lives in Tampermonkey storage, not in the repo.
- **Single ~1,640-line script.** Tampermonkey needs no build step, which is why; the Steam module (docs/09) is site-independent and would be reusable if moved into the kit's scrape layer. A suggestion, not a plan.
- Resolved in v0.11.16: the Steam price row (removed; no prices), `/coop/` `/multi/` not matched, dead old-kit code, and a bug where the category warm-up never ran (a local `quiet` flag shadowed the `quiet()` helper).

## 8 · Conventions

- Code style is dense: 2-space indent, short helpers, many one-line functions, comments that explain **why** and name the version that introduced them. Match it.
- Commit messages in this repo are short and lower-case ("improve performance"). Mention the script version when a commit goes with one.
- Don't modify `src/` for a single site; propose a generic kit addition and keep site code in the userscript (docs/06).
- Never commit secrets. There are none in the repo today (checked).
