# 8 · Reference implementation: the online-fix.me userscript

`userscripts/online-fix.user.js` (v0.11.16, ~1,640 lines, pinned to kit commit `a31f82a`) is the real, in-use adaptation and by far the most complete example in the repo. `example-fixture.user.js` shows the *minimum*; this shows what a production site needs. It is a single file on purpose (Tampermonkey has no build step); this document is its map. Line numbers are from v0.11.15 and will drift: search for the function names.

Companion docs: [09 Steam integration](09-steam-integration.md) · [10 Full game page](10-game-page.md) · [11 Caching & performance](11-performance-and-caching.md) · [12 Changelog](12-changelog.md).

## 1 · The target site

online-fix.me is a **DataLife Engine (DLE)** site: server-rendered, Russian, multi-page (not an SPA, so `navwatch` rarely matters; every list/game page is a full load). Facts the code depends on:

| What | Where / shape |
|---|---|
| Home, feed pages | `/`, `/page/N/` (newest added first; page 1 has **21** games). The home page also has two sliders (`.horizontal-slider` whose `> .title` contains "ПОПУЛЯРНОЕ" / "ОБНОВЛЕНИЯ") and a "fresh" block (`.game-rating .games-cont a`). |
| Category pages | `/games/<slug>/` and `/games/<slug>/page/N/`. The two **mode lists** live at the root: `/coop/`, `/multi/` (they are listed in the sidebar "РЕЖИМЫ" block like categories). |
| Recently-updated list | `/guides_upd.html`, **fixed 50 games**, cards are `.news-flex .article`. |
| Game page | `/games/<folder>/<id>-<slug>.html` (`GAME_RE`). `<id>` is the stable game id. |
| Search | DLE search: `POST /index.php?do=search` with `do=search&subaction=search&story=<q>` (GET with the same query is also tried). Results use the normal feed markup. |
| Profile | `/user/<name>/` |
| Outside links | all go through `/ext/<token>` (a 3 s interstitial), see docs/09 §2. |
| Dates | printed in Russian on **Moscow time (UTC+3)**: "18 октября 2026, 20:22", "Сегодня, 20:22", "Вчера, …" |

### Selectors (`SEL`): the only fragile part
`feed #dle-content article.news` · `updCard .news-flex .article` · `cardLink a.big-link, a.img, .article-content > a` · `cardTitle .article-content h2, .article-content > a` · `cardEdit .edit` ("Обновлено 21 октября 2026… Игра обновлена до версии …") · `cardPreview .preview-text` ("Релиз игры: 13.12.2018 … Режимы: Кооператив \ Мультиплеер") · `categories .categories-block a[href*="/games/"]` + the `/coop/` `/multi/` links · `user .user-menu a.user-avatar` · game page `#news-title`, `.full-story-content`, `.edited-block`, `.full-story-content i` · profile `.page-header h2`, `.profile-avatar img`, `.profile-data .visit`, `.information-block`. The card's publish date is `.info-date time[datetime]` (fallback: Russian text of `.info-date`). These were taken from a `site_skeleton.user.js` dump; if the site changes its template, fix them here and nowhere else.

### Card parsing (`parseCard`)
Produces a **raw record** `{ id, title, online, cat, year, rel, modes, note, added, upd, img, url }`:
- `title` = `cleanTitle()` (strips the trailing "по сети (бесплатно) / online / онлайн"); `online` remembers that it had "online" (used as an extra Steam search term).
- `year` and `rel` (full release date, UTC ms) come from the first `dd.mm.yyyy` in `.preview-text`; `modes` from "Режимы: …" or the text after the year, normalised by `normModes()` to English `Co-op` / `Multiplayer` (+ notes such as `Co-op (local)`); the site sometimes prints the modes with **no separator** ("Кооператив Мультиплеер"), which `normModes` splits.
- `note` = text of `.edit`; `upd` = its date; `added` = publish date; `cat` = the URL folder (see "Categories" for why that's only the *main* category).
- Dates: `msOfRu()` parses Russian dates (and Сегодня/Вчера) as MSK. `ruDate()` rewrites Russian dates into `18 Oct 2026, 20:22` for display (and `dd.mm.yyyy` → `18 Oct 2026`, but never inside version numbers like `1.5.1.2608`).

## 2 · Startup sequence

```
@run-at document-start → script body defines everything → HearthGlue.run({ routes, ui, splash, … })
  splash + hide body at once → ready(selector) → route.scrape() → HearthUI.mount() → view
  afterwards (idle): category warm-up, page-2 prefetch, search hook attach
```

`HearthGlue.run` config used (the rest are defaults): `name:'online-fix'`, `css: GM_getResourceText('hearthCss')`, `hide:'display'` (the site does not lazy-load its lists, so `display:none` is safe), `failTimeoutMs: 15000`, a `splash` (online-fix logo image, accent `#1ea7e0`, ink `#04141c`) and `ui.theme {ac:'#1ea7e0', ink:'#04141c'}` (the **blue accent** replaces the kit's lime; one accent only).

### Routes

| id | match | `ready` | scrape | view |
|---|---|---|---|---|
| `game` | path matches `GAME_RE_PATH` | `#news-title` | `scrapeGame` | `{open: <id from URL>}` (then `landingOpen()` upgrades the popup to the full page) |
| `updates` | `/guides_upd.html` | `.news-flex .article` | `scrapeUpdates` | Browse, `sort:'updated'` |
| `category` | `/games/<slug>/(page/N/)?`, `/coop/`, `/multi/` | `feedReady` | `scrapeCategory` | Browse, `category:<slug>` |
| `home` | `/` and `/page/N/` with **no query string** | `feedReady` | `scrapeHome` | Home |

Order matters: `game` first (its path also matches the `/games/` prefix of `category`). `/page/N/` is **not "the home page"** (0.11.11): its cards are merged as a later page of the feed with ranks, and must not replace the home lists or the cached home snapshot.

`feedReady`: the cards exist, **or** the document is `complete` and `#dle-content` exists but has no cards (an empty category / a page past the last). In that case the scrape throws "no games" immediately and the original site is shown, instead of a hidden page for the whole timeout (0.10.8). A slow page (challenge page) gets 15 s.

`@match` is the **whole site** (`https://online-fix.me/*`, since v0.11.16). The script therefore runs on every page, and **the routes alone decide** what is redesigned: if no route matches, glue does not hide anything (or restores the original) and the script's background work is skipped (`ROUTED()` guards the page-2 prefetch; `warmCategories` has its own path check). Pages without a route (profiles `/user/…`, search results `index.php?do=search…`, forum/other pages) keep the original look. Direct visits to `/coop/` and `/multi/` are redesigned since this change (before, only in-app navigation reached them). Redesigning a further page type = a new route with its own `ready`/`scrape`, nothing else.

## 3 · Data flow: raw → game → contract

```
parse*(DOM/Document) ──► raw: Map<id, record>   (put() merges non-empty fields, never erases)
        lists = { pop, fresh, feed, upd, updPage, extra }  (arrays of ids, in site order)
        rank  = { feed, upd, cat[slug] }                   (Map id → position)
toGame(raw)  ──► S.game({...})   art from meta[], ranks, categories, update, facts, dates
build()      ──► contract { site, nav, categories, games, shelves, featured, hero }
```

- `raw` is keyed by the site's numeric id (`String`). `put()` ignores null/empty values so a later partial record (a mini card from a slider) cannot wipe fields a full card supplied.
- **`build()`** (called once per page load; docs/11 explains why *once*): `games` = every raw record that has a title, ordered `updPage, upd, feed, fresh, pop, extra, rest`. **Hero**: up to 5 games from `pop → fresh → feed` that have `art.hero`; if fewer than 3, the first 5 of `pop → feed` regardless. **Shelves**: `top` "Popular right now" (ranked, 10), `fresh` "New releases" (`filter:{sort:'new'}`), `upd` "Recently updated" (`sort:'updated'`), `latest` "Latest additions" (`filter:{}`), then up to **2** category shelves with ≥ 5 games. **Featured**: "Just added" (newest in `fresh`, wide) and "Fresh update · v<ver>" (first game in `updPage`/`feed` whose note names a version/build, narrow). **Nav**: Discover / Games / Library only (`New` and `Updates` tabs were removed in 0.11.9; Library is `{saved:true}`).
- `toGame()` fields worth knowing: `tagline` = modes joined by ` · ` else category name; `genres[0]` = category label, then modes and *search tags* (`searchTag`, so a game found by a site search for "zombie" matches that word later; genres[1+] are never displayed); `categories` = main folder + every category it was seen under (`catOf`) + mode categories (`coop`/`multi` from its modes) + `'updated'` if it is in the updates list; `addedAt/updatedAt/releasedAt` ms; `ranks` (below); `downloadUrl` = first download else the game URL; `sourceUrl`; `steamUrl` only when exactly known (docs/09 §2).
- `site` block: name "Online-Fix", mark "O", `logo` = the real site logo gif, footer "Unofficial redesign (Hearth) · not affiliated with Online-Fix.me", and `user` only when the **real header showed a signed-in avatar** (`.user-menu a.user-avatar` whose href is `/user/<name>/`; a "log in" link keeps it signed-out). A cached user never overrides a header that was actually read (`site.chromeRead`).

## 4 · Lists, ranks and "All games" (v0.11.11 → 0.11.14)

The site's own order **is** the order. Nothing is re-sorted.

- Each game gets a **rank** per list: `(page − 1) × 1000 + index on the page` (`setRank`). Maps: `rank.feed` (`/` + `/page/N/`), `rank.cat[slug]` (a category's own pages), `rank.upd` (`/guides_upd.html`). `toGame` writes them to `game.ranks` as `feed`, `cat:<slug>`, `upd`.
- The kit (flag `ranks`, `filterGames` in `core/data.js`) then shows exactly those lists: "All games" = games with `ranks.feed`, a category = games with `ranks['cat:<id>']`, **Sort: Recently updated** = `ranks.upd`, **Sort: Release date** = the same list re-ordered by `releasedAt` (undated last; the only sort where cards re-order when a page loads, `settle()` in `browse.js`). A game with no rank for a list is not in it.
- **Paging** (`sourceFor` / `loadMore`): when the grid has shown every local game the kit calls `ui.loadMore({view, filter})`. The script picks the source: library/search/`updated` → `null` (nothing more to fetch: the updates list is a fixed 50); a category → `catUrl(slug, n)`; otherwise the feed (`/`, `/page/2/`, …). Per source it keeps `{next, done, busy}` in `srcState` (one page at a time). The feed starts at page **2** when page 1 is already in `rank.feed`. Fetched pages are cached in `docs` (in-memory Map of `Document`) and parsed with `feedOf`. It returns `toGame()` rows (the kit adds them and shows "N+ games" until a page comes back empty).
- The pinned/sticky post (e.g. DayZ) stays on top of page 1 **exactly as on the site**. Special handling for it existed in 0.11.12-0.11.13 (re-ranking by update date) and was removed in 0.11.14. Do not re-introduce it.
- **Opening a category nobody has loaded** used to say "Nothing matches" (0.9.14): the kit now draws a grid with skeletons and calls `loadMore` at once; a category that is truly empty ends on the empty page.

## 5 · Categories

- **Labels** are English: `catLabel()` uses `CAT_EN` (Russian sidebar text → English), then `SLUG_EN` (slug → English, including `coop`, `multi`, `vr`/`virtual-reality`, `officialservers`), then `CAT_RU_RE` regexes ("виртуальн" → Virtual reality …), else the text as is. Never leaves Russian for a label it knows. The list of categories comes from the **sidebar of whatever page is open** (`readChrome` → `site.cats`, cached with the home snapshot).
- **Membership ≠ URL folder.** A game is filed under *one* folder (`/games/sandbox/…`) but listed on several category pages (Happy Wheels is `/games/sandbox/` yet on `/games/racing/`). So whenever a game is seen on a category page the script remembers "id ∈ slug" (`rememberCat`, store `hf_catmap_v1`, **30 days**, whole map resets after that) and `toGame` merges it into `categories`; the kit's `addGames` merges categories into games it already has. Debug: `__hearthOnlineFix.catmap()` (slug → count).
- **Category tiles** (Steam-style tilted 3D brick wall, kit `genres.js`) need games per category. The home feed only covers a few, so after the app is up **`warmCategories()`** reads page 1 of each category with < 6 known games: one request at a time, 700 ms apart, waits for `document.hidden === false` and for the reader to be idle (`quiet(1000)`), merges in groups of 3 with `app.add(list, {quiet:true})` (the kit refreshes only the picker, never repaints Browse), once per visit. Runs on home, category and updates pages. (Before v0.11.16 it silently never ran: a local `quiet` flag shadowed the `quiet()` helper.) `WARM_CATS = false` turns it off. 
- **Page-2 prefetch** (`ROUTED` pages only): 2 s after load and after `quiet(1200)`, `/page/2/` is fetched and parsed so the first visit to Games (grid shows 24; page 1 has 21) finds it ready.
- The pseudo category `updated` is kept on games (so the Sort works with a mark) but is **not** a category tile any more.

## 6 · The game sheet (popup) detail pipeline: `resolveDetail`

The kit opens the sheet instantly with skeletons and calls `ui.resolveDetail(game, push)` once per game. `push(patch)` may be called many times; the kit updates region by region. Both the sheet and the full page subscribe to **one shared run per game** (`detRuns` / `fan`): late subscribers receive everything pushed so far, then the rest.

`resolveDetailRaw` (the order is deliberate):

1. **Cache:** `storyCache[id]` (`hf8:story`, `STORY_V = 5`, TTL **6 h**, max 80 entries) is returned at once if it is current and **contains no Russian** (`patchClean`). Cached patches from older versions that held untranslated text are discarded.
2. **Fetch + parse the game page** (the open document if it *is* this game, else `getDoc`): `buildStory` → `storyLines` → `sectionize` (below), downloads, password, update note, Steam link, other-store flag, player counts, page media.
3. **Early push** (no network needed): `downloads`, `password`, `facts`, `steamUrl` if known, `update` with Russian removed. Local table translation already applies here.
4. **Steam in parallel**: app id (docs/09 §1) → `steamDetails` (media/about/desc) and `meta` (art). Art/logo/developer are pushed as soon as known; **media is held behind the gate**.
5. **Translation in parallel** with a 20 s deadline per part (`soft()`): guide steps, the "info" text (description fallback), the update reason, "Play via".
6. **Reveal gate:** media + guide go out in **one** push after `max(Steam answer ≤ 1000 ms, guide ≤ 1500 ms)`; a late guide or late Steam media arrive on their own (the kit fades them in, identical content is a no-op). This removed the "double load" where the page's own screenshots showed first and were swapped (0.9.7).
7. **Final patch** is returned and, only if every line translated (`trFails` unchanged, nothing `degraded`, `patchClean`), cached. A degraded run is shown but **not** remembered, so the next open retries.

### Parsing the story text (`storyLines`, `sectionize`)
`storyLines` flattens the story DOM into text lines (block elements and `<br>` break lines; Font-Awesome arrow icons become ` → `; script/style/img/video/iframe/form controls skipped). `sectionize` then walks lines, switching section on headings (`HEADS`, Russian **and** English; the English ones require the colon so a step that merely starts with "Connection" is not a heading): Релиз игры/Game release, Игра через/Play via, Страница игры в Steam, Информация о игре/Game information, Файлы для игры/Game files, Как запускать/How to launch, В игре/In-Game (+ an inline "In-Game: Connection:" split), Подключение/Connection, Создание сервера/Creating a server, Информация о сетевых режимах, Примечания/Notes. `SKIP` drops ads, "don't know how to unpack", password, download lines, donate. Numbered lines before/after "Game files" become **Install** steps; the rest map to Launch / In game / Join a game / Host a game. If no section has steps but there is leftover text, it becomes one "Instructions" group (≤ 10). "Network modes" and "Notes" are collected only so they stop leaking into the neighbouring section; they are **never shown** (not wanted). Each group is capped at 12 steps of ≤ 420 chars.

### Update line (`parseUpdate`, `versionOf`, `RU_PHRASES`)
The card/`.edited-block` note "Обновлено <date>. [Причина:] <reason>" is split into `{date, version, text, closed}`. The date is converted to English; `versionOf` finds a dotted version ("version 1.5.1.2608") **or** "Build N" ("build / билд / сборка №"); the reason sentences go through `RU_PHRASES` (e.g. "Игра обновлена до версии X" → "Game updated to version X", "Добавлен…" → "Added …", mod variants, "Руководство закрыто" → "Guide closed"). `closed` (guide closed: "Причина: Руководство закрыто.") makes the kit draw a red "Guide closed" block in the sheet and a red label on the card.

### Downloads (`storyDownloads`, `describeDownload`, `onGet`)
Download links are anchors whose text starts with "Скачать" / "Download". They are classified: torrent → "Torrent" (needs a client), "hoster" → "Online-Fix Hosters" (game + fix, direct), "drive" → "Online-Fix Drive", "фикс/fix" → "Fix from server" (fix only), else the cleaned link text. The password line ("Пароль:" / "Password:") is extracted. `onGet`: **a card's Get opens the sheet** (the sheet has the list); inside the sheet, if the kit had nothing to unfold, Get opens the game page in a new tab. `onOpen` warms `downloadOptions` and calls `landingOpen`.

## 7 · Translation: everything the reader sees is English

Order of attack (`translate(lines)`): (1) `localTr` — a regex table (`RU_LINES`) of the install/launch/join lines every game repeats, handled **per arrow-separated segment**, no network; (2) one **batched** request (newline-joined, ≤ 14 lines / 1500 chars; accepted only if the answer has the same number of lines and is not Russian); (3) the remaining lines one by one (`tr1`). Each network step tries 3 endpoints in turn, two passes with a 1.2 s pause: `translate.googleapis.com` (gtx) → `clients5.google.com` (dict-chrome-ex) → `api.mymemory.translated.net` (≤ 480 chars). An answer whose Cyrillic share is ≥ 30 % counts as **failed**. Results live in `trMem` (`hf8:tr`, cap **3000**, evicts the oldest 800). Concurrency 2 (`trLimit`). Failures are logged (`trDiag()`) and a run with any failure is not cached. Dates are rewritten locally first (`ruDate`). Needs `@connect` for the three translation hosts.

Comments on the full page are translated **on demand** (per comment or "Translate all"); `COMMENTS_AUTO_TRANSLATE = false`.

## 8 · Search

The kit's search box filters local games; the script adds the **site's own search** on top (`hookSearch` → `siteSearch`): after 450 ms of no typing (≥ 2 chars), `querySite(q)` tries POST then GET, `cardsFrom(doc)` reads the normal feed markup (falling back to any game link). Results are cached per query, merged with `app.add()` (the search box is never touched; the kit pulls art per card), tagged (`searchTag`), and a status line is shown under the heading (`.hf-status`; the **markup is made here, the styling is the kit's** in `70-browse.css`): "Searching online-fix.me…", "N results from online-fix.me", "Nothing found on online-fix.me", or "Couldn't reach the site's search — showing games already loaded". A stale query (the box changed meanwhile) is dropped. `lastSearch` is exposed for debugging. The search box's X closes the search and returns to where you were (kit, 0.11.9). The hook is attached by polling `handle.app` every 100 ms for 30 s, and again `onRoute`.

## 9 · Account sheet (avatar)

The kit owns the sheet (flag `profile`). `resolveProfile(user)` fetches `/user/<name>/`, parses `.visit` rows ("label: value") and `.information-block` stats, translates labels (`PROF_LABEL`/`PROF_VALUE` tables first, `translate()` for the rest), and returns `{name, avatarUrl, badge (the Group), stats, facts, links}`. The header drop-down is mapped to link rows (`profileLinks`): "Your profile on online-fix.me" (opens the original page), Bookmarks, Log out. Nothing navigates away on its own.

## 10 · Tunables and switches

`DEBUG` (console log) · `WARM_CATS` · `PAGE_ON_GAME_URL` (landing on a game URL opens the full page instead of the popup) · `COMMENTS_AUTO_TRANSLATE` · `STALE_MS` (20 min: age after which a cached snapshot section is refreshed silently) · `ART_WAIT_MS` 2500 · `HERO_ART_MS` 1500 · `MEDIA_WAIT_MS` 1000 · `GUIDE_GATE_MS` 1500 · `MISS_TTL` 3 d · `STORE_TTL` 24 h · `STORY_TTL` 6 h · `STORE_SHAPE` / `STORY_V` (bump to invalidate) · `limiter` sizes (search 6, translation 2, SteamGridDB 2).

## 11 · Kit requirements (no old-kit fallbacks)

Since v0.11.16 the script **requires** a kit with the flags `loadMore, lazyArt, addGames, quietAdd, richDetail, profile, page, ranks` (all present at `a31f82a`) and warns at start-up if one is missing. The branches that served older kits (generated-art era art resolution, the `extra` page 2-3 prefetch section, rebuild-everything search for kits without `app.add`, the non-quiet warm-up path) and the unused `hf9:pmiss` / `hf9:media` stores were deleted. Don't re-add fallbacks for old pins; raise the pin instead.

## 12 · Console API: `window.__hearthOnlineFix`

Exported to the **page** via `unsafeWindow`, so it works from the normal console. `openPage(id)`, `pageDiag()`, `netDiag()` (last 80 requests), `trDiag()`, `sgdbDiag()`, `linkDiag()`, `kitDiag()` (which kit files are really loaded: version, `.dp-pgb` rule present), `misses()` (logo misses), `catmap()`, `steam()` (per game app id), `story(id)` (parsed story + detail patch for one game), `build()`, `raw`, `lists`, `ids`, `meta`, `sid`, `links`, `parse{…}` (the parsers), `storeInfo`, `commentsOf`, `lastSearch`, `flush()` (write caches now). Tampermonkey menu: "Set SteamGridDB API key" and the kit's "Toggle Hearth UI / original page"; keyboard `Alt+Shift+H`.

## 13 · If you are adapting another site from this

Copy the *shape*, not the DLE specifics: (1) `SEL` + parsers → raw records; (2) a `SECTIONS`-style cache-first snapshot per list page; (3) ranks + `loadMore` if the site pages its lists; (4) `resolveArt`/`resolveDetail` pulled lazily, with deadlines on every network call; (5) the Steam module from docs/09 unchanged; (6) never re-render in the background. Keep all site strings → English tables at the top. See also [06 Adaptation playbook](06-adaptation-playbook.md).
