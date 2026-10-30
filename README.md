# Hearth Kit

**Replace any website's interface with your own, using Tampermonkey.** Scrape the original page's data, hide its UI, render a cinematic game-storefront in its place: GOG/Steam-style browsing with Netflix-style polish. One reusable kit, one small userscript per site.

- Auto-rolling hero with transparent game logos and loading-line progress
- Shelves, ranked "Top 10", editorial tiles, category chips, search, library, detail sheet
- Steam artwork (poster · hero · logo) from an app id, loaded lazily with skeletons while loading (no generated art)
- Motion on everything, in and out, 60 fps, `prefers-reduced-motion` respected
- Shadow-DOM isolated, SPA-aware, falls back to the original page if anything fails
- Free games only: **no prices** anywhere, Get/Save actions instead
- A **full game page** next to the popup: Steam trailers (DASH, via dash.js) and screenshots, About, Steam rating and reviews, the site's own comments, requirements, install guide
- **Site-ordered lists with paging**: "All games" and every category follow the site's own order and load page by page as you scroll; Sort by recently updated / release date
- Steam-style **3D category tiles**, kept alive and built lazily for speed
- A cache-first, idle-time, deadline-everywhere data layer (see [docs/11](docs/11-performance-and-caching.md))

![status](https://img.shields.io/badge/version-0.6.0-c6f432?labelColor=24262b) ![license](https://img.shields.io/badge/license-MIT-c6f432?labelColor=24262b)

## See it

Open **`mockup/index.html`** in a browser (no server needed). It's the real kit fed with `data/sample.json`.

## Try the full flow in 2 minutes

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. `npm run serve` (Node 18+; nothing to install) → the fixture site is at <http://localhost:5173/>.
3. In Tampermonkey: *Create a new script*, paste `userscripts/example-fixture.user.js`, save.
4. Reload <http://localhost:5173/>. The ugly table becomes the storefront. Click a game: the URL follows. `Alt+Shift+H` toggles back to the original.

## Use it on a real site

1. Hand this repo to an AI agent and tell it to read **[`AGENTS.md`](AGENTS.md)**, then **`docs/06-adaptation-playbook.md`**. It will ask you about the target site, then write the userscript from `userscripts/template.user.js`. `userscripts/online-fix.user.js` is the complete, production-grade reference ([docs/08](docs/08-reference-online-fix.md)); `userscripts/site_skeleton.user.js` dumps a page's structure for the agent (Alt+Shift+S).
2. Or do it yourself: copy the template, write a scraper that returns the [data contract](docs/04-data-contract.md), done.

## Docs

| | |
|---|---|
| [01 Overview & file structure](docs/01-overview.md) | architecture, layout, commands |
| [02 Design system](docs/02-design-system.md) | colour, type, space, components |
| [03 Motion system](docs/03-motion.md) | timing tokens, rules, reduced motion |
| [04 Data contract](docs/04-data-contract.md) | what a scraper must output, Steam art URLs |
| [05 Userscript integration](docs/05-userscript-integration.md) | loading, mounting, hiding, SPA navigation, API |
| [06 Adaptation playbook](docs/06-adaptation-playbook.md) | step-by-step + questions to ask the user |
| [07 Gotchas](docs/07-gotchas.md) | CSP, timing, style conflicts, lazy content |
| [08 Reference implementation: online-fix.me](docs/08-reference-online-fix.md) | the real script, section by section |
| [09 Steam integration](docs/09-steam-integration.md) | app ids, real asset URLs, trailers, reviews, back-off, SteamGridDB |
| [10 Full game page](docs/10-game-page.md) | kit/script split, regions, state, loading order |
| [11 Performance & caching](docs/11-performance-and-caching.md) | the rules, storage keys and lifetimes |
| [12 History](docs/12-changelog.md) | what changed and the root causes |

**Agents: start with [`AGENTS.md`](AGENTS.md).**

## Publishing and pinning

```bash
npm run build && git add -A && git commit -m "describe the change" && git push
git rev-parse HEAD        # the commit SHA a userscript pins
```
Userscripts load the built files from jsDelivr **pinned to that commit SHA**: `https://cdn.jsdelivr.net/gh/<you>/hearth-kit@<full-sha>/dist/hearth-ui.js` (also `hearth-scrape.js`, `hearth-glue.js`, and `hearth.css` as `@resource`). A commit URL never changes, so neither jsDelivr nor Tampermonkey can serve a stale file; a moving branch or a re-pointed tag can. `dist/` is committed on purpose. Docs-only commits don't change `dist/`, so they don't require re-pinning. After a kit change: put the new SHA in all four URLs, bump the script's `@version`, and **re-install** the script (Tampermonkey keeps `@resource` until then). See [AGENTS.md](AGENTS.md) for the full workflow.

## Develop

`npm run build` regenerates `dist/` from `src/` (zero dependencies). `npm run watch` for live rebuilds. See [docs/01-overview.md](docs/01-overview.md#where-to-change-what).

## License
MIT. Game artwork is fetched from Steam's CDN at runtime and belongs to its respective owners; it is not included in this repo.
