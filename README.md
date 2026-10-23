# Hearth Kit

**Replace any website's interface with your own, using Tampermonkey.** Scrape the original page's data, hide its UI, render a cinematic game-storefront in its place: GOG/Steam-style browsing with Netflix-style polish. One reusable kit, one small userscript per site.

- Auto-rolling hero with transparent game logos and loading-line progress
- Shelves, ranked "Top 10", editorial tiles, category chips, search, library, detail sheet
- Steam artwork (poster · hero · logo) from an app id, loaded lazily with skeletons while loading (no generated art)
- Motion on everything, in and out, 60 fps, `prefers-reduced-motion` respected
- Shadow-DOM isolated, SPA-aware, falls back to the original page if anything fails
- Free games only: **no prices** anywhere, Get/Save actions instead

![status](https://img.shields.io/badge/version-0.1.0-c6f432?labelColor=24262b) ![license](https://img.shields.io/badge/license-MIT-c6f432?labelColor=24262b)

## See it

Open **`mockup/index.html`** in a browser (no server needed). It's the real kit fed with `data/sample.json`.

## Try the full flow in 2 minutes

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. `npm run serve` (Node 18+; nothing to install) → the fixture site is at <http://localhost:5173/>.
3. In Tampermonkey: *Create a new script*, paste `userscripts/example-fixture.user.js`, save.
4. Reload <http://localhost:5173/>. The ugly table becomes the storefront. Click a game: the URL follows. `Alt+Shift+H` toggles back to the original.

## Use it on a real site

1. Hand this repo to an AI agent and tell it to read **`docs/06-adaptation-playbook.md`**. It will ask you about the target site, then write the userscript from `userscripts/template.user.js`.
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

## Publishing to GitHub

```bash
cd hearth-kit
git init && git add -A && git commit -m "Hearth Kit v0.1.0"
git branch -M main
git remote add origin https://github.com/<you>/hearth-kit.git   # create the empty repo on github.com first
git push -u origin main
git tag v0.1.0 && git push origin v0.1.0
```
Then in your userscripts use `https://cdn.jsdelivr.net/gh/<you>/hearth-kit@v0.1.0/dist/…` (see the template header). `dist/` is committed on purpose.

## Develop

`npm run build` regenerates `dist/` from `src/` (zero dependencies). `npm run watch` for live rebuilds. See [docs/01-overview.md](docs/01-overview.md#where-to-change-what).

## License
MIT. Game artwork is fetched from Steam's CDN at runtime and belongs to its respective owners; it is not included in this repo.
