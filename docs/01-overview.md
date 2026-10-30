# 1 · Overview and file structure

**Hearth Kit** lets you replace the interface of an existing website with your own, using Tampermonkey. The userscript scrapes the original page's data, hides the original UI, and renders a game-storefront UI (GOG/Steam browsing with Netflix-style cinematic polish) in its place.

The kit is **site-agnostic**. Nothing in the UI knows about any website. A site adaptation is one small userscript that contains only:

1. **scrapers**: functions that turn the original DOM into the [data contract](04-data-contract.md), and
2. **routes**: which URLs to take over, what to wait for, and what the UI should show.

A *real* site also needs a data layer the simple example doesn't show: cache-first list snapshots, paging (`loadMore`) against the site's own lists, lazy Steam art/detail resolution, translation, a search hook. That lives in the userscript too (see [08](08-reference-online-fix.md)); the kit supplies the hooks (`resolveArt`, `resolveDetail`, `loadMore`, `onPage`, `app.add` …, listed in [05](05-userscript-integration.md)).

> **If you are an AI agent continuing work on this repo: read [`../AGENTS.md`](../AGENTS.md) first.** It says which doc to read for which task.
>
> **If you are adapting this kit to a new site: start with [06-adaptation-playbook.md](06-adaptation-playbook.md)** and study the real adaptation, [08-reference-online-fix.md](08-reference-online-fix.md). It lists the questions to ask the user before writing code. Read [04-data-contract.md](04-data-contract.md) next; it is the only interface your code must satisfy.

## Architecture in one picture

```
 original site ──► scrape() ──► data contract (JSON) ──► HearthUI.mount() ──► Shadow DOM storefront
                      ▲                                        ▲
              your site-specific code               dist/hearth-ui.js + dist/hearth.css
                      └─────────── HearthGlue.run() ───────────┘
                     hide original · wait for content · SPA navigation · error fallback
```

Four **built** files in `dist/` are what a userscript loads:

| File | Global | Job | Site-specific? |
|---|---|---|---|
| `dist/hearth.css` | (text, via `@resource`) | all styles, tokens, animations | no |
| `dist/hearth-ui.js` | `HearthUI` | components + `mount()` | no |
| `dist/hearth-scrape.js` | `HearthScrape` | helpers for writing scrapers (`q`, `text`, `abs`, `fetchDoc`, `steamAppId`, `check` …) | no |
| `dist/hearth-glue.js` | `HearthGlue` | Tampermonkey glue: `run()` | no |

## Repository layout

```
hearth-kit/
├─ README.md
├─ docs/                      ← you are here
├─ dist/                      built output; COMMITTED so jsDelivr can serve it
├─ src/
│  ├─ styles/                 00-tokens · 10-base · 20-buttons · 30-nav · 40-hero · 50-shelves · 55-genres (3D category tiles) · 60-modal · 62-getbox · 63-media · 65-profile · 66-page (full game page) · 70-browse · 90-responsive
│  └─ js/
│     ├─ shared/              util (esc, safeUrl, slug, hash) · schema (coerceGame, validate) · wait (waitFor)
│     ├─ ui/                  index.js (exports HearthUI, `features`, `parts`) · mount.js (public API, page parking, picker) ·
│     │                       core/{data (filterGames/ranks, addGames), art (lazy slots, Steam URL builders), morph (region diff), stream (DASH trailers), motion, icons, dl-loop, enrich} ·
│     │                       components/{hero,shelf,card,featured,chips,genres (3D tiles),nav,detail (sheet + parts),page (full game page),media,profile,browse,button}
│     ├─ scrape/              dom · net · steam · data   → HearthScrape
│     └─ glue/                run · hide · navwatch · assets · splash (loading screen) → HearthGlue
├─ data/
│  ├─ sample.json             complete example of the data contract (14 games)
│  └─ hearth-data.schema.json JSON Schema for the contract
├─ mockup/index.html          standalone demo: dist + sample.json (open the file directly)
├─ userscripts/
│  ├─ online-fix.user.js      THE REAL ADAPTATION (v0.11.16, ~1,640 lines): see docs/08-12
│  ├─ example-fixture.user.js WORKING minimal example against fixtures/example-site
│  ├─ template.user.js        skeleton with TODOs for a new site
│  └─ site_skeleton.user.js   run on ANY page (Alt+Shift+S): dumps its structure/tokens as Markdown/JSON for the agent
├─ fixtures/example-site/     a deliberately ugly SPA to practise on and test against
└─ scripts/                   build.mjs (zero-dependency) · serve.mjs · validate-data.mjs
```

## Commands

```bash
npm run build      # src/ → dist/ (no npm install needed; build.mjs has zero dependencies)
npm run watch      # rebuild on change
npm run serve      # http://localhost:5173/ = fixture site, /repo/dist/… = built files for @require
npm run validate -- some-data.json     # check a data file against the contract
```

Open `mockup/index.html` directly in a browser to see the design with placeholder data.

## Public surface of the built files

- **`HearthUI`**: `mount`, `validate`, `normalize`, `steam` (CDN URL builders), `version`, **`features`** (capability flags a userscript checks to adapt to its pinned kit: `loadMore, lazyArt, addGames, quietAdd, richDetail, profile, media, steamLink, page, ranks, sorts, releaseSort, siteLogo, parts, …`), and **`parts`** (the sheet's and page's building blocks so a userscript can paint pages that look exactly like the kit's: `getBox, guideHtml, actsHtml, factsHtml, reqHtml, updHtml, logoSlot, layer, morphInto, swapRegion, ic, icf, ICON, LOGO, page{…}`).
- **`HearthScrape`**: DOM, network (`fetchDoc/fetchText/fetchJson/mapLimit/loadAll`), `steamAppId`, data helpers.
- **`HearthGlue`**: `run(config)`.

The build prints `/*! hearth-kit v<package.json version> … */` at the top of each bundle and replaces `__HEARTH_VERSION__`, so `HearthUI.version` tells you what is loaded. `package.json` says 0.6.0 and is **independent** of the userscripts' own version numbers.

## Where to change what

| I want to… | Edit |
|---|---|
| change colors, radii, fonts, timing | `src/styles/00-tokens.css` (or pass `ui.theme` at runtime) |
| change a component's look | the matching file in `src/styles/` |
| change a component's markup or behaviour | `src/js/ui/components/*.js` |
| add a field to the data contract | `src/js/shared/schema.js` → the component that shows it → `docs/04` → `data/hearth-data.schema.json` |
| adapt to a new site | **only** a copy of `userscripts/template.user.js` |

After editing `src/`, run `npm run build` and commit `dist/` **together with** `src/` (a userscript pins the commit that contains both). Then follow the shipping steps in [AGENTS.md](../AGENTS.md#6--workflows).
