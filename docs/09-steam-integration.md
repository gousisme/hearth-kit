# 9 · Steam integration (the scrape logic that makes the art, media and reviews work)

Everything here is **script-side** (it lives in `userscripts/online-fix.user.js`, lines marked in brackets), not in the kit. The kit only knows the contract: `steamAppId`, `art{}`, `media[]`, `steamUrl`, and the hooks `resolveArt`, `resolveDetail`, `resolveLogo`. A new site adaptation that wants the same behaviour should copy these pieces; they are site-independent except where the text says "online-fix".

> Why this is more than "build `…/library_600x900.jpg` from an app id" (what docs/04 says): Steam moved newer apps' library assets to **hashed paths**, removed direct mp4/webm trailers, throttles scrapers with 429s and sometimes answers an API call with an HTML challenge page. Each of those broke something and has a counter-measure below.

## 1 · Resolving a game to a Steam app id

A game card on the site has a title and nothing else Steam-related. The id is found by this chain, first hit wins (`appOf`, `resolveOne`, `steamFromLink`):

| # | Source | Exact? | Stored in |
|---|---|---|---|
| 1 | The game page's own Steam link, once it has been read (`sid[gameId].app`) | yes | `hf9:sid` |
| 2 | `r.steamLink` read from a game page: a direct `store.steampowered.com/app/<id>` URL, or the site's `/ext/<token>` redirect, which is followed (§2) | yes | `hf9:sid`, `hf9:links2` |
| 3 | `r.steam`: a direct Steam link found on the fetched/open game page (`parseStory`) | yes | in the raw record |
| 4 | **Title search** (`lookupId`) | fuzzy | `hf4:ids` (hit) / `hf4:miss` (miss) |

Cards only have a title, so the **title search** is what drives the grid. It is "pulled": the kit calls `resolveArt(game)` right before a card's image would load, so only on-screen games are looked up (`resolveArt` → `resolveSteam` → `resolveOne`). Opening a sheet or page additionally reads the exact link (rows 1-3), which then **overrides** the fuzzy id and is remembered.

### Title search (`lookupId`, `score`, `norm`)

- Endpoint: `GET https://store.steampowered.com/api/storesearch/?term=<t>&l=english&cc=us`.
- **Terms tried** (max 3, in order): the full title; the title without `( … )`; the part before the first `:` / `–` / ` - `; plus `<title> Online` when the card's title ended in "online" (`hadOnline`, because the site appends "по сети / online" to many titles and `cleanTitle` strips it).
- **Normalisation** (`norm`): NFD, strip accents, lower-case, drop `' ’ ™ ® ©`, `&` → `and`, non-alphanumerics (Latin + Cyrillic) → space, roman numerals `ii…ix` → digits (`vi` → 6 etc.; `i` and `v`/`x` are left alone on purpose).
- **Score** (0-1): equal after removing spaces → 1; one is a prefix of the other (both > 6 chars) → 0.92; all tokens of the shorter set are in the longer and the shorter is ≥ 40 % of it → ≈ 0.9 minus a length penalty; else token Jaccard. Accept `≥ 0.7`; stop early at `≥ 0.9`.
- A **network error is never cached** (returns 0 without touching `ids`/`miss`). A search that ran and found nothing is cached in `miss` for **3 days** (`MISS_TTL`).
- Calls are de-duplicated while in flight (`inflightId`) and go through `searchLimit = limiter(6)` with **priorities**: the open sheet/page (`r._hi`) = 2 and ignores the cap, a card still waiting for its art (`r._wait`) = 1, leftovers that only warm the cache = 0. Priority is read when a slot frees up, so a queued card that scrolls into view jumps the queue.

### Non-Steam games

Some games are not on Steam (Minecraft Bedrock, Microsoft Store titles). The title search can still match a *different* game's name, so the page is also checked for another store (`otherStoreOf`): a heading "Страница игры в Microsoft Store:" / "Game page on …:" that isn't Steam, or an `/ext/` link whose `title` is a known non-Steam host (`OTHER_HOST`: xbox, microsoft, epicgames, gog, ubisoft, ea, origin, battle.net, rockstar, itch.io, playstation, nintendo, amazon, riotgames, bethesda, roblox, minecraft.net). When that is true the **Open in Steam button is not shown** even if the title search matched. Art may still use the matched id; only the button is suppressed.

## 2 · The site's own Steam link (`/ext/` redirect interstitial)

online-fix.me never links outward directly. Every outside link goes through `https://online-fix.me/ext/<token>`, a ~3 s interstitial page ("Вы собираетесь перейти на: store.steampowered.com") whose button has `onclick="location.href='<target>'"`.

`steamLinkOf(root)` (game page) returns `{app,url}` for a direct Steam link, or `{ext, sure}` for an `/ext/` link:

- `sure: true` when the link's `title` contains "steam", or it directly follows a bold "Страница игры в Steam:" heading with no title.
- an `/ext/` link titled with another host (`title="xbox.com"`) is **never** treated as Steam (this was the Minecraft bug, 0.9.8).
- an untitled, unannounced `/ext/` link is `sure: false`: it is followed first to see where it leads.

`linkTarget(ext)` fetches the interstitial with `GM_xmlhttpRequest` (with a `Referer`) and `readRedirect()` extracts the destination from: the `location.href='…'` in `onclick`, a real redirect (`finalUrl`), a meta refresh, or any Steam URL anywhere in the page text/script (also `s.team/a/<id>` and `steam://store/<id>`; escapes like `\u002f`, `&#47;`, percent-encoding are undone).

Remembering results, and **why this is careful**:

- found a Steam app → `links[ext] = {app,url}` forever (`hf9:links2`) and `sid[gameId]`.
- **read fine but not Steam** (HTTP 200 *and* a target/host was parsed) → `{miss: now, host}` for **24 h**.
- anything else (blocked, rate-limited, timeout, unparsable) → **nothing is remembered**. Before 0.9.11 a failed request was remembered as "not Steam" for a day and silently hid the button.
- `__hearthOnlineFix.linkDiag()` lists the last 12 lookups (status, final URL, host, app id, bytes).

### "Open in Steam" URL rule (`finalLink`)

Always `https://store.steampowered.com/app/<id>/`. Never the `/ext/` URL, never `steam://`. Order: `sid[game].url` → the page's direct link → (an untitled `/ext/` link that was followed and led elsewhere → none) → the title-search id *unless* `nonSteam`. No id = no button. The kit draws the button (`game.steamUrl` / `steamUrl` patch field, flag `steamLink`).

## 3 · Artwork: real asset URLs from `IStoreBrowseService/GetItems`

The plain CDN URLs of docs/04 (`…/library_600x900.jpg`) 404 for newer apps. The script asks Steam for the **actual** asset filenames (`fetchMeta`, `parseItem`):

```
GET https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=
    {"ids":[{"appid":N},…],"context":{"language":"english","country_code":"US"},
     "data_request":{"include_assets":true,"include_basic_info":true,"include_release":true}}
```

- `assets.asset_url_format` is a template with `${FILENAME}`; relative formats are prefixed with `https://shared.fastly.steamstatic.com/store_item_assets/`.
- Mapping: `poster ← library_capsule | library_capsule_2x`, `hero ← library_hero | library_hero_2x`, `logo ← library_logo_2x | library_logo`, `header ← header`; also `short_description`, first developer, release year.
- **Batched**: `wantMeta(id)` coalesces everything requested within **40 ms** into one request of up to **20 apps** (`flushMeta`). `meta[appid] = 0` records "Steam has no such item" so it is not asked again. Cached in `hf5:meta` with **no TTL**.
- `toGame()` builds `art = { header: meta.header || site image, fallback: site image, poster/hero/logo from meta }`. If the title has a **recent miss** and no id, the site's own image becomes `art.poster`. The kit's candidate chain (`art.<slot>` → Steam CDN URL → `art.fallback`) then does the rest.
- **Logo fallback chain** (the logo is the most often missing slot): `meta.logo` → kit's `…/logo.png` guesses → **SteamGridDB** (§7). A logo that still isn't found leaves the title as text; `onArtMiss` records it (`__hearthOnlineFix.misses()`).
- **Hero carousel** (`prepareHero`): the hero is chosen from games that *have* `art.hero`, so before the first paint the first 8 candidates (popular → fresh → feed) are resolved with a **1500 ms** budget (`HERO_ART_MS`). Everything else is pulled per card.
- **Cards never wait long**: `resolveArt` races the lookup against `ART_WAIT_MS = 2500`; after that the card shows the site's image and the lookup keeps running at low priority and is cached for next time. (Earlier 6 s waits made the grid look frozen.)

## 4 · Store details: `appdetails` (about, media, requirements, facts)

`storeInfo(app)` → `storeFetch`: `GET https://store.steampowered.com/api/appdetails?appids=<id>&l=english&cc=us`.

- **One request per game** even when the popup and the full page ask at once (`storeBusy`). Cached in `hf9:store` for **24 h**, **max 40 entries**, versioned by `STORE_SHAPE` (currently 3): bump it whenever the stored shape changes, otherwise old cache entries are served without the new fields (this is what hid trailers/about images for 24 h in 0.10.7).
- It **ignores the throttle pause** (`force = true`) and **retries once** after 1.2 s; the reason for a failure is kept (`storeWhy`, shown by `pageDiag()`). A cached entry of the right shape is returned if the refresh fails; otherwise `null`.
- Stored per game: about blocks, media items, short text, header/capsule, release string + `coming_soon`, `is_free`, developers, publishers, genres, categories, Metacritic `{score,url}`, recommendations, achievements, age, website, supported languages (HTML stripped), minimum/recommended requirement rows, content-descriptor notes.
- **No Steam HTML is ever put on the page.** HTML snippets are parsed into plain data: `aboutBlocks()` → `[{h}|{t}|{img,alt}|{vid,poster}]` (headings h1-h4, paragraphs/list items with a `• ` bullet, images from any https host (`http:` and `//` links are upgraded by `asHttps`), `<video>` clips Steam uses for animated "gifs"), max 60 blocks / 1500 chars each; a bare bullet waits for its text. `reqRows()` turns `<li><strong>Key:</strong> value` into `{Key: value}`.

> **No prices.** Steam's `price_overview` is deliberately not stored or shown (v0.11.16 removed the last place it appeared); the kit has no price concept (docs/04).

## 5 · Trailers and screenshots (media)

`steamMedia(x)` builds the gallery items from appdetails: up to **4 movies**, then up to **16 screenshots** (`path_thumbnail` → `path_full`).

- **Trailers are DASH streams now.** Old entries had `mp4`/`webm` `{480,max}` files and are still used if present. Otherwise the stream URL is `dash_h264`, else `dash_av1`, else any string ending in `.mpd`, and the item is `{type:'video', thumb, stream, page}`. It is only produced when `dashjs` is loaded (`@require https://cdn.jsdelivr.net/npm/dashjs@4.7.4/…`, pinned).
- The kit plays it (`core/stream.js`): `<video data-dash>` + dash.js; on error or no dash.js the slide shows its poster and a "Watch it on Steam" link (`page`). Used by both the full page gallery and the popup viewer (0.11.1).
- **Merge rule** (`mergeMedia`): if Steam has any media → Steam trailers, then Steam screenshots, then the site's own non-image media (its YouTube/`<video>` trailer) **only if Steam has no playable trailer**; if Steam has none at all → the site's media. Max 20. *This is why the site's media used to win always*: before dash.js was wired, every Steam trailer was dropped, so the site's trailer was the only video (0.11.0).
- **Gate:** the page and sheet must not show the site's media first and swap it for Steam's. The detail pipeline holds media back until Steam answered (max 1000 ms) **and** the guide is ready (max 1500 ms), then sends both in one `push` (§ detail pipeline in docs/08).
- Site media (`pageMedia`): YouTube iframes → `youtube-nocookie.com/embed/<id>?rel=0&autoplay=1` with `i.ytimg.com` thumbnail; `<video>` with poster; story images ≥ 160 px wide that are not emoji/avatars/gifs/`/fotos/`/`/dleimages/`/`/smiles/`.
- UNTESTED as of 0.11.1: live Steam DASH playback in Firefox. `__hearthOnlineFix.pageDiag()` reports `steam trailers (streams)` and `dash.js loaded`.

## 6 · Reviews and rating

Used only by the full page (docs/10). Three layers, each falling back to the next:

1. **List** `GET store.steampowered.com/appreviews/<app>?json=1&language=<english|all>&purchase_type=all&filter=<all|recent>&review_type=<all|positive|negative>&num_per_page=10&cursor=<url-encoded>` (`revUrl`, `revList`). "Helpful" is `filter=all`, "Recent" is `filter=recent`. The cursor must be **URL-encoded** (a raw `+`/`=` broke paging, 0.10.2). The first page tries `english` then `all` languages (`revListRetry`); it **ignores the throttle pause** (`force`) because it is the one request that must not silently die. A review is `{id, up, text≤1800, t, hrs (playtime h), votes, funny}`.
2. If the JSON path fails with *not JSON / HTTP / network / timeout* → **community page HTML** (`revListHtml`): `https://steamcommunity.com/app/<id>/reviews/?p=<n>&browsefilter=<toprated|mostrecent>&filterLanguage=english&l=english`, parse `.apphub_Card` (`.apphub_CardTextContent`, `.date_posted`, `.hours`, `.found_helpful`, a "Not Recommended" title → thumbs-down). Its "cursor" is just the next page number; once switched, that list stays on HTML (`R.html`). Positive/negative filter is applied client-side here.
3. **Rating card summary** (`revSummaryAny`): `appreviews?…num_per_page=0&language=all` → `query_summary`; else the store page's own line (`.user_reviews_summary_row[data-tooltip-html]` → "x% of the n user reviews are positive").
4. **Histogram** `appreviewhistogram/<app>?l=english&review_score_preference=0` → last **36** monthly rollups `{d, up, down}` for the bars chart (non-critical, no fallback).

The kit's rating card has a visual tier per verdict (`op/vp/po/mx/ng/vn/on`, flat tinted surfaces; sparkles for overwhelmingly positive, embers for overwhelmingly negative).

## 7 · SteamGridDB logo fallback (`resolveLogo`)

Asked by the kit **only when every Steam logo URL failed** for a game. Needs a free API key: Tampermonkey menu → "Set SteamGridDB API key" (stored in `hf:sgdbKey`; setting it clears the cache). Without a key it records `skip` and returns `''` (the title stays as text).

1. `GET https://www.steamgriddb.com/api/v2/logos/steam/<app>?types=static&nsfw=false` (`Authorization: Bearer <key>`), best by `score`.
2. If that gave nothing → `/search/autocomplete/<title>`, take the best `score(title, name) ≥ 0.75`, then `/logos/game/<id>?types=static&nsfw=false`.
3. Cache `hf:sgdbLogos2` keyed `a<app>` or `n<normalised title>`: hits for **365 days**, empty results **3 days**; network trouble is **not** cached. Max **2 concurrent**; **3 network failures in a row pause it for 5 min** (`sgdbPause`). 401/403 = wrong key (warns once).
4. The caller waits at most **6 s** (`resolveLogo` deadline) and gets `''`; the real lookup continues in the background and is cached for next time. (The kit holds an image-pool slot while it waits, so an unbounded lookup stalled whole grids, 0.9.4.)

Needs `@connect steamgriddb.com`, `www.steamgriddb.com`, `cdn2.steamgriddb.com`.

## 8 · Request hygiene and back-off (read this before adding a Steam call)

- **All Steam JSON goes through `fjson(url, force, referer)`**, which uses `getSteamJson`: `GM_xmlhttpRequest` with `anonymous: true` (**no browser Steam cookies**, which steer Steam into a redirect/challenge page), `Accept: application/json…`, `Accept-Language: en-US`, `X-Requested-With: XMLHttpRequest`, and a `Referer` of the app's store page. BOM-safe parse. A non-JSON answer throws `not JSON: HTTP <status> → <final url> · "<page title>"`, which is what `netDiag()` shows.
- **Back-off:** HTTP 429/403 → all non-forced Steam calls pause **90 s**; 3 *consecutive* timeouts → **60 s** (`steamPause`). Paused calls reject with `steam paused (throttled)`; cached art keeps working. `force = true` calls (store details, review list) ignore the pause. The reviews "Try again" button calls `steamResume()`.
- **Stagger:** the full page does not fire four Steam requests at once (that earned a 429): store details immediately, review list +250 ms, summary +700 ms, histogram +1100 ms.
- Every network call has a deadline through `tmo(promise, ms, what)`; each is logged (`netLog`, last 80: host, path, ms, result). After 20 s the console gets a one-line summary of hosts with ≥ 2 failures.
- While Steam is paused **nothing falls through to fetching game pages from online-fix.me either** (that cascade froze everything in 0.9.5; the per-card "fetch the game page to find its Steam link" step was removed in 0.9.6).
- `@connect` must list every host: `store.steampowered.com`, `api.steampowered.com`, `steamcommunity.com`, the three SteamGridDB hosts.

## 9 · Debugging checklist

| Symptom | Look at |
|---|---|
| Cards stay grey / wrong art | `__hearthOnlineFix.steam()` (per game: app id, hero?), `ids`, `meta`, `netDiag()` |
| A game has no logo | `misses()`, `sgdbDiag()` (is a key set? was it a deadline skip?) |
| "Open in Steam" missing/wrong | `linkDiag()`, `sid`, `links`; check `nonSteam` rules in §1 |
| Page shows the site's trailer, not Steam's | `pageDiag()`: `store ok`, `steam trailers (streams)`, `dash.js loaded`, `store error` |
| Reviews empty | `netDiag()` for `not JSON: …`; the page falls back to the community HTML automatically |
| Everything Steam-related stopped for a minute | throttle pause (console warns); wait or `steamResume()` |
