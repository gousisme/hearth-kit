# 4 · Data contract

This is **the** interface between a scraper and the UI. A scraper only has to return this shape; the UI never touches the original site.

- Machine-readable: [`data/hearth-data.schema.json`](../data/hearth-data.schema.json). Executable: `src/js/shared/schema.js` (`validate`, `coerceGame`).
- Full example: [`data/sample.json`](../data/sample.json).
- Check your output: `HearthScrape.check(data)` in the browser console, or `npm run validate -- file.json`.

**Only `games` is required, and per game only `id` and `title`.** Everything else is optional and derived or omitted gracefully: no hero → the first 5 games with art; no categories → the most common genres; no shelves → "All games" plus genre shelves; no description → the About section disappears. Start with `games`, then add richness.

**No prices.** Every game is free. There is deliberately no price, discount or cart field. Do not add one.

## Top level

```jsonc
{
  "version": 1,
  "site":       { "name": "Hearth", "mark": "h", "footer": "", "user": { "initials": "KT", "avatarUrl": null } },
  "nav":        [ { "id": "discover", "label": "Discover", "view": "home" } ],
  "categories": [ { "id": "souls-like", "label": "Souls-like" } ],
  "hero":       [ { "gameId": "elden", "eyebrow": "Featured" } ],
  "featured":   [ { "gameId": "elden", "kicker": "Editor's pick", "headline": "…", "image": "hero", "size": "wide" } ],
  "shelves":    [ { "id": "top", "title": "Top 10 this week", "style": "ranked", "gameIds": ["elden"], "filter": {} } ],
  "games":      [ /* Game, see below */ ]
}
```

| Field | Default when omitted |
|---|---|
| `site.name` / `mark` | "Hearth" / first letter. `mark` is the 1-character logo tile. `footer` is a small line under the page. `user` shows an avatar (initials or image); omit for none. |
| `nav` | Discover (home) · Games (browse) · Library (saved) · New (sorted by year). Item: `{id, label, view:'home'\|'browse'\|'external', filter?, href?}`; `filter` is a browse filter (below). `external` + `href` opens a link. |
| `categories` | up to 9 most frequent genres. `id` must match values in `game.categories`. |
| `hero` | first 5 games that have a `steamAppId` or `art.hero`. Slides are game references, not copies. `eyebrow` default "Featured"/"Trending now". |
| `featured` | none. 1–3 editorial tiles. `image`: `"hero"`/`"poster"`; `size`: `"wide"`/`"narrow"` (first defaults wide). |
| `shelves` | "All games" + up to 3 category shelves with ≥ 4 games. `style`: `"poster"` or `"ranked"` (max 10). `filter` is where "See all" goes (omit → no See all). |

**Browse filter** (used by `nav[].filter`, `shelves[].filter`, `app.navigate`): `{ category?: id, query?: string, sort?: "new"\|"title", saved?: true }`.

## Game

```jsonc
{
  "id": "elden",                       // REQUIRED. String. STABLE across page loads (use the site's own id/slug, not an array index).
  "title": "Elden Ring",               // REQUIRED.
  "steamAppId": 1245620,               // integer or null. Drives all artwork (see below).
  "art": { "poster": "", "hero": "", "logo": "", "header": "" },   // optional absolute URLs; override Steam per slot
  "tagline": "Action RPG",             // short label shown on cards/hero
  "description": "…",                  // plain text (escaped; no HTML)
  "genres": ["Open World", "Souls-like"],
  "categories": ["open-world", "souls-like", "action"],   // category ids; default = slug(genres)
  "developer": "FromSoftware",  "publisher": "",
  "releaseYear": 2022,
  "size": "60 GB",                     // display string, already formatted
  "rating": "Very Positive",           // display string
  "requirements": { "minimum": { "OS": "Windows 10", "RAM": "8 GB" }, "recommended": { } },   // free-form key → value
  "screenshots": ["https://…"],        // absolute URLs
  "similarIds": ["bg3"],               // optional; otherwise computed from shared genres
  "downloadUrl": "https://…",          // absolute http(s). What "Get" opens (new tab) unless options.onGet handles it
  "sourceUrl": "https://…",            // the game's page on the original site
  "art.fallback": "https://…"          // optional last-resort image (e.g. the site's own thumbnail), tried after Steam; never used for logos
}
```

Rules the UI enforces (so scrapers needn't): all text is HTML-escaped; URLs must be `http(s)` (anything else is dropped); duplicate ids keep the first; numbers/strings are coerced and trimmed (`HearthScrape.game()` runs the same coercion, use it).

## Steam artwork

Given an app id, artwork URLs are built from Steam's CDN. `HearthUI.steam` exposes the builders:

| Slot | URL | Used for |
|---|---|---|
| poster | `https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_600x900.jpg` | cards (2:3) |
| hero | `…/{id}/library_hero.jpg` | hero banners, detail header, wide feature tile |
| logo | `…/{id}/logo.png` (transparent PNG) | drawn over the hero art, Netflix-style |
| header | `…/{id}/header.jpg` (460×215) | "Similar" thumbs; last-resort hero |

**Getting the app id:** from a Steam link on the page (`HearthScrape.steamAppId(url)` parses `store.steampowered.com/app/<id>/…`), from the site's own data, or by searching Steam by title (ask the user if neither exists). A game with no id still renders, using generated art.

**Fallback chain per slot** (`candidates()` in `core/art.js`): `art.<slot>` override → Steam URL → (hero only) header → `art.fallback`. While loading the slot is a skeleton; if everything fails it is a flat tile (posters show the title). Logos fall back to the title as text. Optional `options.resolveArt(game)` lets the userscript find Steam ids / art lazily, per card, right before its image loads. A failed image never breaks layout.

**Caveats (verify against the real CDN during development):** Steam has been moving some apps' library assets to hashed sub-paths, so the plain URL above may 404 for certain (typically newer) apps. The fallback chain hides this, but for such a game set `art.poster/hero/logo` explicitly if the site provides art or you can resolve the real URLs. Also, a host page's CSP may block the Steam CDN; see [07-gotchas.md](07-gotchas.md).


## Rich detail (optional)

All optional; usually supplied lazily through `options.resolveDetail(game)` so the sheet opens at once and fills in (skeletons meanwhile).

```jsonc
"downloads": [{ "label": "Online-Fix Hosters", "href": "https://…", "kind": "hosters|drive|fix|torrent", "hint": "Game + fix · direct download" }],
"password": "online-fix.me",                       // shown under the download list with a Copy button
"guide": [{ "title": "Join a game", "steps": ["Open the lobby list", "Enter your friend's code"] }],   // "How to connect"
"update": { "date": "17 Sep 2026, 18:27", "version": "1.5.1.2608", "text": "Game updated to version 1.5.1.2608" },
"facts": [{ "label": "Released", "value": "4 Aug 2026" }]  // replaces the base fact with the same label, others are appended
```
With 2+ `downloads` the Get button in the sheet unfolds them directly beneath itself (one card); with one it opens it; with none it falls back to `options.onGet` / `downloadUrl`.
