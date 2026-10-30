// ==UserScript==
// @name         Hearth — Online-Fix
// @namespace    hearth-kit
// @version      0.11.16
// @description  Cinematic storefront redesign of online-fix.me (home, categories, updates, game pages) built on hearth-kit (runs on the whole site; pages without a route show the original). Alt+Shift+H toggles the original site.
// @match        https://online-fix.me/*
// @run-at       document-start
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      online-fix.me
// @connect      store.steampowered.com
// @connect      api.steampowered.com
// @connect      translate.googleapis.com
// @connect      clients5.google.com
// @connect      api.mymemory.translated.net
// @connect      steamcommunity.com
// @connect      steamgriddb.com
// @connect      www.steamgriddb.com
// @connect      cdn2.steamgriddb.com
// @connect      fonts.googleapis.com
// @connect      fonts.gstatic.com
// @require      https://cdn.jsdelivr.net/gh/gousisme/hearth-kit@a31f82acba9d274bfc789373d595592b35ec810f/dist/hearth-ui.js
// @require      https://cdn.jsdelivr.net/gh/gousisme/hearth-kit@a31f82acba9d274bfc789373d595592b35ec810f/dist/hearth-scrape.js
// @require      https://cdn.jsdelivr.net/gh/gousisme/hearth-kit@a31f82acba9d274bfc789373d595592b35ec810f/dist/hearth-glue.js
// @resource     hearthCss https://cdn.jsdelivr.net/gh/gousisme/hearth-kit@a31f82acba9d274bfc789373d595592b35ec810f/dist/hearth.css
// ==/UserScript==
//
// v0.11.16: · Runs on the whole site (@match https://online-fix.me/*): the routes below decide which pages are redesigned (home, /page/N/, categories incl. /coop/ and /multi/, game pages, /guides_upd.html);
//             every other page (profiles, search results, ...) is left as the original site. Direct visits to /coop/ and /multi/ are redesigned now.
//           · The Steam "Price" row is gone from the full page's facts (the kit shows no prices).
//           · Fixed: the category warm-up never ran (a local `quiet` flag shadowed the quiet() helper, so it threw on its first call).
//           · Removed code that only served older kits (lazyArt / loadMore / addGames / quietAdd fallbacks, the unused "extra" pages section, the unused hf9:pmiss / hf9:media stores).
//             Needs the kit at a31f82a or later (checked at start-up; it warns if a needed feature is missing).
// v0.11.15: · Smoother first seconds after a reload: background work (the silent refresh of the cached home / updates pages, the category warm-up, the page-2 prefetch) now waits until you have not touched
//             the page for a moment and the browser is idle, instead of running 1.5-2.5 s after load, which is when you tend to open Games. Page 2 of the site is fetched while idle, so the first visit
//             to Games (page 1 has 21 games, the grid shows 24) finds it ready instead of downloading and parsing it on the spot. The cached home snapshot is saved through the same idle writer as the other caches.
//             NEEDS hearth-kit-page-19.patch on top of page-18 (the category picker refreshes in idle time).
// v0.11.14: · The special handling of pinned posts is gone: "All games" and every category follow the site's order exactly (the pinned post stays on top of page 1, as on the site).
//           · Scrolling to a page that was not cached no longer pushes you up when it finishes loading (kit: the loading placeholders are replaced by the new cards in one step).
//             NEEDS hearth-kit-page-18.patch on top of page-17.
// v0.11.13: · "All games" / categories follow the site's order exactly again (page 1, 2, 3 …); only the posts the site PINS to the top of page 1 (DayZ …) are moved, to where their last UPDATE date puts them
//             (a post never updated: its publish date). Such a post appears once the pages loaded reach back that far, so nothing already on screen moves when a page loads.
//           · Cards reorder after a page loads only in the "Release date" sort (kit).
//             NEEDS hearth-kit-page-17.patch on top of page-16.
// v0.11.12: · New sort "Release date": the game's own release date (the "Релиз игры: 23.10.2026" line, the full date), newest first, among the games loaded so far (it keeps loading pages as you scroll).
//           · The posts the site pins to the top of the home page (DayZ …) no longer sit on top of "All games": every list is ordered by publish date, the site's page order breaking ties.
//             NEEDS hearth-kit-page-16.patch on top of page-15.
// v0.11.11: · Games / "All" is now the site's own list: / and /page/2/, /page/3/ … in the site's order (newest added first), loaded page by page as you scroll (the count reads "21+ games" until the site runs out).
//           · The same for every category (each shows ITS page's list, in the site's order), and two categories were missing: Co-op (/coop/) and Multiplayer (/multi/).
//           · Sort: Default (the above) and Recently updated (the site's /guides_upd.html list, 50 games, in its order). "New" is gone: the default list already is "newest added first".
//           · /page/N/ no longer counts as "the home page" (its cards used to replace the home lists and the cached home).
//             NEEDS hearth-kit-page-15.patch on top of page-14 (already in the kit as a1e178c).
// v0.11.10: · Sort uses the site's real dates. New = the card's publish date (<time datetime>), Recently updated = the date in its "Обновлено …" line (a game never updated counts from its publish date). Was: the release YEAR / the old "updated" mark.
//           · Games' category strip now sits ABOVE the heading row (title, count, Sort), so the Sort button is next to the games it sorts.
//             Games already in the cache from older versions have no date until their card is read again (a visit to the home / category page does it): they sort after the dated ones.
//             NEEDS hearth-kit-page-14.patch on top of page-13 (already in the kit as 82c4145).
// v0.11.9: · Tabs: Discover / Games / Library only. "New" and "Updates" are gone, and so is the "Recently updated" category tile: Games has a Sort button (Default / New / Recently updated) next to the title instead.
//          · Choosing a category, a sort or a search word only replaces the title, count and grid: the page no longer fades, and the category strip is not rebuilt, does not blink and does not jump.
//          · The search box's X closes the search (it emptied the box and repainted the whole page); closing returns to where you were (category included).
//            NEEDS hearth-kit-page-13.patch on top of page-12 (page-12 is already in the kit as e3f746a).
// v0.11.8: · Category pickers (home + Browse) build a tile's artwork only when the tile nears the visible part of the strip, instead of every category at once (40+ tiles x 7 images in 3D layers was most of the cost).
//          · Fixed blank category tiles / images that stayed grey: the Browse picker was kept from the first visit (built while most categories still had no game), and slots dropped while a kept page was detached were never loaded again.
//          · The edge fades of the strips work again (the previous speed-up made them invisible); they are real overlay elements now.
//          · Category warm-up runs on category / updates pages too (it only ran when the site was opened on the home page), merges in groups of 3 and never repaints Browse: only the picker updates itself (kit app.add(list, { quiet: true })).
//            NEEDS hearth-kit-page-12.patch on top of page-11.
// v0.11.7: · Smoother category strips: tiles only load the wall bricks that are actually visible, and the edge fades no longer restyle every tile on each scroll frame. NEEDS hearth-kit-page-11.patch on top of page-10.
// v0.11.6: · Browse picker is built once and kept while you switch categories (no rebuild, its artwork does not fade in again); only the chosen tile changes. NEEDS hearth-kit-page-10.patch on top of page-9.
// v0.11.5: · Browse picker: the edge fades sit exactly at the strip edge again (no gap or dark bar); the selection ring is drawn inside the tile. NEEDS hearth-kit-page-9.patch on top of page-8.
// v0.11.4: · Browse category picker: the "All" tile has the same brick-wall background (library games, accent tint), the first tile's selection ring is no longer clipped, and tiles no longer slide up one by one (the tapped tile sat lower than the rest while loading).
//            NEEDS hearth-kit-page-8.patch on top of page-7.
// v0.11.3: · Home strips: Shift+wheel (and the arrows) glide continuously instead of stopping at every card, and the strip settles on a card edge when you stop.
//          · Game page: "Read more" turns into "Read less" (About and long reviews), so an expanded text can be folded again.
//          · Browse (Games / News / Updates / categories): the category picker is the same tile strip as "Browse by category" on the home page, the chosen one highlighted (plus an "All" tile).
//            NEEDS hearth-kit-page-7.patch (all three are kit changes).
// v0.11.1: · The popup's viewer plays Steam's trailers too (same dash.js streams as the page; poster + "Watch it on Steam" when a stream cannot play).
//          · The site mark and the avatar slide in beside the pill when the page is scrolled (spring, with a little overshoot) and slide back out to their corners at the top.
//            NEEDS hearth-kit-page-6.patch.
// v0.11.0: · Game page gallery is Steam's: its trailers, then its screenshots. The site's own media is only used when Steam has none (or, last, its trailer when Steam has no trailer that can play).
//            Why the site's media always won before: Steam removed the direct mp4 / webm trailer files (trailers are DASH streams now), so every Steam trailer was dropped and the site's took its place.
//            Steam trailers are played with dash.js (@require below, pinned 4.7.4); if a stream does not play, the slide shows its poster and a "Watch it on Steam" link.
//            NEEDS hearth-kit-page-5.patch. The popup's viewer cannot play streams: it keeps Steam's screenshots and the site's trailer. UNTESTED against live Steam / Firefox: see pageDiag().
// v0.10.8: · "falling back to the original page: waitFor timed out: #dle-content article.news" = a list page (home / category / page N) never showed its cards within the time limit. The fallback itself
//            is by design (you get the original site). Now: a finished page with the content area but no cards (empty category, page past the last) falls back at once instead of after 10 s of a hidden page,
//            and a page that is really slow (challenge page, site hiccup) gets 15 s. If it still happens, `__hearthError` and `location.href` in the console say which page it was.
// v0.10.7: · About clips / images: the store details cached by earlier versions kept the OLD About blocks (no clips, no http images) for 24 h, so nothing showed until they expired. The cache is
//            versioned now: old entries are fetched again once. (Steam's animations are <video class="bb_img"> with a webm <source>: handled since 0.10.5.)
// v0.10.6: · About: the section images have no backdrop any more (many are transparent dividers / banners) and keep their own size.
//          · The game page asks SteamGridDB for the logo when the art ids' logo and Steam's logo.png both fail (the popup / hero already did that), so the logo is no longer plain text there.
//          · __hearthOnlineFix is exported to the PAGE (unsafeWindow), so the console commands (pageDiag(), netDiag(), ...) work without switching the console's context. Reinstall to get the new @grant.
// v0.10.5: · Rating card: no more glow. Tiers are flat tinted surfaces (lime / red), with the sparkles (overwhelmingly positive) and embers (overwhelmingly negative) kept as flat shapes.
//          · About: Steam's images with http: or protocol-relative links were being dropped (that is why some games showed none); images from any https host, Steam's muted clips (<video>) and
//            a bullet that sat alone on its own line are handled now.
//          · Steam store details (media + about) are requested once for the page AND the sheet, ignore the throttle pause, retry once, and never fall back to an old cache entry without media.
//            If the page still shows the site's media: open the page, then run __hearthOnlineFix.pageDiag() in the console.
// v0.10.4: · Rating card has a look per Steam verdict (kit): overwhelmingly positive sparkles + shines, very positive glows, mixed amber, negative red, overwhelmingly negative pulses with rising embers.
//          · The hero's "Details" button opens the full game page (the popup stays for the cards).
//          · Game page media comes straight from Steam (trailers, then screenshots; one store request shared with the popup); the site's own media only where Steam has none of that kind,
//            and it waits for Steam's answer (skeleton) instead of showing the site's first and swapping. "About this game" keeps Steam's section images.
//            NEEDS the kit patch hearth-kit-page-2.patch on top of page.patch.
// v0.10.3: · Game page, round 3. Every visual (markup, CSS, icons, motion) is now the kit's: the script no longer writes any CSS, inline style or icon - the page, its rating card, reviews, comments, tabs, pager,
//            skeletons, the sheet's "Full page" button, the search status line and the loading screen all come from the kit (HearthUI.parts.page, ui.onPage, HearthGlue splash). ~300 lines gone.
//          · The empty box under "Open in Steam" was a loading skeleton for the rating card. Gone: the card now fades in when the numbers arrive, nothing is drawn before.
//          · Motion: tabs / filters / pager / buttons change IN PLACE (their colours and positions transition instead of being swapped), tab and comment-page changes fade out then in, replaced regions
//            cross-fade (skeleton -> content no longer blinks), "Full page" has the close button's kind of hover. Cause of the instant hover: the page's own <style> lost to the kit's rules.
//          · Steam reviews: requests to Steam are now sent WITHOUT the browser's Steam cookies and with explicit JSON headers; a non-JSON answer is reported with status / redirect target / page title
//            (__hearthOnlineFix.netDiag()); if Steam still answers with a web page, the list is read from steamcommunity.com's review page and the rating from the store page's own summary line.
//            NEEDS the kit patch hearth-kit-page.patch.
// v0.10.2: · Side panel and install guide are now the kit's own blocks (HearthUI.parts: Get box, Save + Open in Steam with the Steam logo, facts, guide) - no hand-drawn copies, no \"Original page\" button.
//            Comment pager also sits above the list. Steam reviews: cursor sent URL-encoded, a second URL shape is tried, BOM-safe parse, and a non-JSON answer is reported with its first characters in netDiag().
//            NEEDS the kit patch hearth-kit-parts.patch.
// v0.10.1: · Game page, round 2. Side panel is the popup's (Get box that unfolds, Save + Open in Steam, facts) - no capsule / description / price card repeating the page. The top banner with the logo is back
//            (same art slots as the popup: hero under a gradient, the logo bottom-left replacing the title text). The media strip fades at both ends (and its hover / selected outline is no longer clipped).
//            "How to install & play online" uses the popup's numbered cards instead of drop-downs. Comments have real page switching (the site's own pages, cached, numbered pager) instead of "load more".
//            Steam review list: ignores the throttle pause, retried, falls back to all languages, has a Try again button; the Steam requests are staggered instead of fired four at once.
//            Animation: sections update region by region (nothing is rebuilt that did not change), new regions fade / rise in with a cascade, media slides cross-fade, the Get box / About / reviews expand smoothly,
//            tabs and comment pages swap with a fade. No kit change (same pinned kit).
// v0.10.0: · NEW full game page, next to the popup: gallery (Steam trailers + screenshots), About, Steam rating (score, % positive, review count, reviews-per-month chart, Metacritic), Steam reviews
//            (helpful / recent, all / positive / negative, load more), the site's own comments (load more, per-comment or bulk translate), system requirements, install guide, downloads + password,
//            price / developer / publisher / languages / achievements. Opens from the new "Full page" button in the popup, or straight away on a game URL (PAGE_ON_GAME_URL). Esc / Back closes it.
//            Styled with the kit's own tokens inside its shadow root, so it follows the theme. Detail loading is now shared (one run per game) between the popup and the page.
//            Extra requests (cached, on demand): Steam appdetails (24 h), appreviews + appreviewhistogram, comment pages of the game on online-fix.me. No kit change, no new @connect.
// v0.9.15: · Category tiles: the brick wall is filled from the centre outwards (the first games land where the eye does, behind the name pill) and loops through the category's games when there
//            are fewer games than bricks, so there are no bare patches. Kit change only (kit 0.5.12); the script itself is unchanged.
// v0.9.14: · Opening a category nobody had loaded yet (Puzzles) still said "Nothing matches": with no local game in it the kit drew an empty page and never asked the script for the category's own pages.
//            Kit 0.5.11 draws a grid with loading skeletons instead and calls loadMore at once (a category that is really empty still ends on the empty page).
//          · Category tiles / counts for categories the home feed knows little about: after the home page is up, page 1 of each category with fewer than 6 known games is read quietly in the background
//            (one request at a time, ~0.7 s apart, paused while the tab is hidden, once per visit) and merged into the app only while you are on the home page (never repaints Browse). Set WARM_CATS = false to turn it off.
//          · Tiles are the tilted 3D brick wall (was part of kit 0.5.9's second version; included in kit 0.5.11 for anyone who got the first one). Needs kit 0.5.11.
// v0.9.13: · Category pages showed too few games (Racing: "no results"). A game's category was read from its own URL only, but the site files a game under ONE url folder while listing it in several
//            categories (Happy Wheels is /games/sandbox/…, Forza Horizon 6 is /games/officialservers/…, yet both are on /games/racing/). Now every game seen on a category page is remembered as part of that
//            category (kept for 30 days, so the home tiles and Browse know it too), and the kit merges it into games it already has. Needs kit 0.5.10 (addGames merges categories).
//            Debug: __hearthOnlineFix.catmap() in the console.
// v0.9.12: · Home shelves (Popular right now, New releases, ...) now fade out at their left / right edge while there is more to scroll, like the media strip in the game sheet, instead of cutting the
//            next card off hard. Kit change only (kit 0.5.9).
//          · The category chips on the home page are replaced by Steam-style "Browse by category" tiles: a tilted 3D wall of bricks (gaps, offset rows) made of that category's games under a colour tint, with the name in a pill. Click opens Browse
//            filtered to it (the chips are still there in Browse). Kit change only; the script's data is unchanged.
// v0.9.11: · "Open in Steam" is taken from the redirect page itself: the /ext/ page ("Вы собираетесь перейти на: store.steampowered.com", button onclick="location.href='…/app/<id>/…'") is parsed for its target
//            (also a real redirect / meta refresh / s.team / steam://), and the button always opens https://store.steampowered.com/app/<id>/. The request now sends a Referer, and a "not Steam" verdict is only
//            remembered when the redirect page was really read (HTTP 200 + a target); a blocked / rate-limited / failed request used to be remembered for 24 h and silently hid the button. Old cache key dropped.
//            Debug: __hearthOnlineFix.linkDiag() in the console lists the last redirect lookups (status, final URL, host, app id).
//          · Get-button arrow loop (kit 0.5.5): now driven by the Web Animations API with an explicit state (start on hover/focus, "finish this cycle" on leave), instead of a CSS class that was removed on a timer.
// v0.9.10: · "Open in Steam" opens the Steam store page again (https://store.steampowered.com/app/<id>/), not the online-fix.me/ext/ redirect. The URL is built from the Steam app id (the page's own link when it
//            could be read, else the title-search match used for the artwork); the redirect is never shown. Still no button when the page names another store (Microsoft Store ...) or no id is found.
//          · Get buttons: no Lottie any more. The kit's own download icon is back, but only the ARROW slides down and loops on hover (the line below it stays). Kit change only.
//          · Modes with notes ("Кооператив (local co-op) Мультиплеер", "29.09.2026 (local co-op)") read "Co-op (local), Multiplayer"; cached sheets rebuilt (STORY_V 5).
// v0.9.9: (superseded — its Lottie download icon and its Steam-link handling were replaced in 0.9.10)
// v0.9.8: · "Open in Steam" no longer shows for games that are not on Steam (e.g. Minecraft Bedrock). Cause: the first online-fix.me/ext/ link on the page (title="xbox.com" there) was taken for the Steam link.
//           Now only a link announced as the Steam page / titled steampowered counts, and the button needs a URL the script KNOWS is Steam's (a title-search match used for art no longer enables it).
//         · The button opens the Steam store website (https://store.steampowered.com/app/<id>/) in a new tab instead of steam://. (kit change)
//         · Games whose guide is closed ("Причина: Руководство закрыто.") get a red "Guide closed" block in the sheet and a red label on the card. (kit change)
//         · Untranslated bits: the category "Игры виртуальной реальности" is now "Virtual reality" (chip, page title); "Кооператив Мультиплеер" printed WITHOUT a separator is split and translated.
//         (kit sha: see 0.9.10 above)
// v0.9.7: · Sheet: "How to connect" and the media strip now appear TOGETHER. Before, the page's own screenshots were pushed first and then swapped for Steam's, while the guide waited for its
//           translation (~1 s) — that was the "double load". Media is held back until Steam answered (max 1 s, then the page's own media) and the guide is ready (max 1.5 s); both go out in ONE push.
//           The early Steam push (art / logo) no longer carries media or text. Late Steam media still replaces the page's own, with a fade.
//         · Top-left logo is the site's real logo (the same image as the loading screen) instead of the letter "O".
//         Needs the kit commit that goes with this script (sheet updates region by region, so unchanged parts are never re-created / re-loaded; fading media viewer; strip edge fade + smooth Shift+wheel + momentum drag).
//         With an older kit the script still works (the gating applies either way); the viewer / strip / logo fixes need the new kit: replace the sha in the four @require/@resource URLs.
// v0.9.6: · Cards no longer wait ~6 s for Steam: a card waits ART_WAIT_MS (2.5 s), then shows the site's image. Lookups are prioritised (open sheet > cards still waiting > leftovers that only fill the cache),
//           so opening a game is no longer queued behind the whole grid. The per-card "fetch the game page to find its Steam link" cascade is gone (it was 2 extra requests per unmatched game).
//         · The sheet's media/trailers are requested in parallel with the art ids (they used to wait for them), the page's own screenshots show at once, and a late `upd` / `home` fetch is still cached.
//         Needs the kit with the image-load timeout + wake-up of parked slots (HearthUI.features.artDeadline); with an older kit everything still works, only stalled images can hold a loader slot.
// v0.9.5: · Steam back-off: HTTP 429 / 403 (or 3 timeouts in a row) pauses every Steam request for 60-90 s instead of retrying in a storm; while paused nothing falls through to
//           fetching game pages from online-fix.me either (that cascade is what froze everything at once).
//         · A card waits at most 6 s for its Steam art; after that it shows the site's own image (the lookup keeps running and is cached for the next load).
//         · "How to connect" appears as soon as it is translated and media as soon as Steam answers; neither waits for the other.
//         · After 20 s the console gets a one-line summary of failing hosts (timeouts / HTTP errors) if there were any.
//         Needs the kit with the image-load deadline + instant re-render (the logo in the sheet no longer loads and fades in a second time).
// v0.9.4: the kit is PINNED to one commit (the @<sha> in the four URLs above). A commit URL never changes, so jsDelivr / Tampermonkey can't serve a stale hearth.css or hearth-ui.js.
//         To take a newer kit: push it, run `git rev-parse HEAD`, replace the sha in the four URLs and bump @version. __hearthOnlineFix.kitDiag() says which kit files are really loaded.
//         The SteamGridDB logo lookup has a hard 6 s deadline, so even an older kit that waits for it inside its image pool is released quickly.
// v0.9.3: translation gives up after 20 s (each endpoint 8 s) instead of 40 s; every request is logged: __hearthOnlineFix.netDiag() shows host / time / result, so a slow or blocked host is easy to spot.
//         SteamGridDB is limited to 2 requests at a time and pauses for 5 min after 3 network failures in a row. Needs the matching hearth-kit (logo lookup no longer holds image slots; links have no underline).
// v0.9.2: nothing can hang the sheet any more: every network call has a timeout (the sheet used to wait forever on one stuck request and showed skeletons for good);
//         a run where something timed out is shown but not cached. Open Steam uses steam://store/<id> (opens the Steam client). SteamGridDB logo lookup also searches by name
//         (and tells why it failed: __hearthOnlineFix.sgdbDiag()). Needs the matching hearth-kit patch for the round heart button / Steam logo.
// v0.9.1: needs the matching hearth-kit patch (hero buttons no longer stretch, media strip is clipped, round sheet corners, play button, more Steam logo URLs, resolveLogo hook).
//  · Logo fallback: when Steam has no logo for an app, SteamGridDB is asked (needs a free API key: Tampermonkey menu → "Set SteamGridDB API key"). Results are cached.
// v0.9.0: needs hearth-kit >= 0.4 (media strip, "Open Steam", partial detail patches).
//  · Russian never shows: common install / launch / join / update lines are translated locally (no network), the rest in ONE batched request
//    with 3 endpoints to fall back on; stale cached sheets that still contain Russian are discarded; __hearthOnlineFix.trDiag() says why a request failed.
//  · Co-op / Multiplayer player counts ("КООПЕРАТИВ: 8") in the side panel.
//  · "Open Steam" button (next to Save) from the game page's own Steam link; that link is also the fallback for art when the Steam title search finds nothing.
//  · Media strip: Steam trailers + screenshots, else the page's own trailer / images.
// v0.8.1: Get opens the detail sheet (no dropdown); translation is validated + retried and a failed run is never cached; update line split into date / reason
//         (works without "Причина:"); no Notes / Network modes, Co-op / Multiplayer in the side panel; "Fresh update" tile uses the banner image.
// v0.8: own profile sheet (no jump to the original profile), game pages in English OR Russian (downloads / steps / update line),
//       "Build N" updates, no "Network modes" section, translation retries, text-first logos, logo-miss diagnostics.
//       Needs hearth-kit >= 0.3 (HearthUI.features.profile).
//       (v0.8.1 needs no kit change: nothing to purge on jsDelivr.)
//
// Design rules for speed (v0.6):
//  · ONE render per page load. Nothing re-renders in the background (that is what reset scroll / replayed animations).
//  · Steam art is PULLED, not pushed: the kit calls resolveArt(game) right before a card's image loads, so only games that are
//    actually on (or next to) the screen are looked up. Until then the card is a skeleton. Ids are cached per game, asset URLs are
//    fetched in batches of 20 and cached; a returning visit resolves everything from GM storage with no network at all.
//  · No generated art anywhere: a slot is a skeleton, a real image, or (if nothing loads) a quiet empty tile with the title.
//  · The kit is loaded from a pinned commit (see v0.9.4). To update it: push, `git rev-parse HEAD`, put the sha into the four @require/@resource URLs and bump @version.
//  · Extra pages (feed p2/p3, update list, home snapshot) are cached; a stale cache is shown at once and refreshed
//    silently for the next visit — nothing on the critical path waits for them unless the cache is empty.
//  · Opening a game never touches the URL; "Get" resolves the real link (already warmed on open) when pressed.

(function () {
  'use strict';
  const S = HearthScrape;
  /** Every request gets a deadline: a stuck connection must never keep a sheet in its skeleton state for good. */
  const netLog = [];
  const tmo = (p, ms, what) => new Promise((res, rej) => {
    const t0 = Date.now(), note = r => { let h = what, pth = ''; try { const uu = new URL(what); h = uu.host; pth = uu.pathname.split('/').slice(0, 2).join('/'); } catch (e) { /* not a URL */ } netLog.push({ host: h, path: pth, ms: Date.now() - t0, result: r }); if (netLog.length > 80) netLog.shift(); };
    const t = setTimeout(() => { note('TIMEOUT'); rej(new Error('timeout: ' + what)); }, ms);
    p.then(v => { clearTimeout(t); note('ok'); res(v); }, e => { clearTimeout(t); note(String((e && e.message) || e).slice(0, 160)); rej(e); });
  });
  const DEBUG = false;
  /** Steam sometimes answers an API call with a web page (a challenge / redirect page) instead of JSON. Its calls are made WITHOUT the browser's Steam cookies (they steer that redirect),
      with explicit JSON headers, and when the answer is not JSON the error says what did come back (status, where it ended up, the page title) - __hearthOnlineFix.netDiag(). */
  const steamGet = (u, ref) => new Promise((res, rej) => GM_xmlhttpRequest({
    method: 'GET', url: u, timeout: 20000, anonymous: true, headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'en-US,en;q=0.9', 'X-Requested-With': 'XMLHttpRequest', Referer: ref || 'https://store.steampowered.com/' },
    onload: res, onerror: () => rej(new Error('network error')), ontimeout: () => rej(new Error('timeout')),
  }));
  const brief = (r, u) => { const t = String(r.responseText || ''), ti = (t.match(/<title[^>]*>([^<]*)/i) || [])[1]; return `HTTP ${r.status}${r.finalUrl && r.finalUrl !== u ? ' → ' + r.finalUrl.replace(/^https?:\/\//, '').slice(0, 70) : ''}${ti ? ' · "' + ti.trim().slice(0, 50) + '"' : ''}`; };
  const getSteamJson = async (u, ref) => {
    const r = await steamGet(u, ref);
    if (r.status === 429 || r.status === 403) throw new Error('HTTP ' + r.status);
    try { return JSON.parse(String(r.responseText).replace(/^\uFEFF/, '').trim()); } catch (x) { throw new Error('not JSON: ' + brief(r, u)); }
  };
  let steamPause = 0, steamBad = 0;
  const fjson = (u, force, ref) => {
      const st = /\/\/(?:store|api)\.steampowered\.com\//.test(u);
      if (st && !force && Date.now() < steamPause) return Promise.reject(new Error('steam paused (throttled)'));
      return tmo(st ? getSteamJson(u, ref) : S.fetchText(u).then(t => { try { return JSON.parse(String(t).replace(/^\uFEFF/, '').trim()); } catch (x) { throw new Error('not JSON: ' + String(t).replace(/\s+/g, ' ').slice(0, 110)); } }), 20000, u).then(v => { if (st) steamBad = 0; return v; }, e => {
        if (st) { const m = String((e && e.message) || e); if (/HTTP (429|403)/.test(m) || (/timeout/i.test(m) && ++steamBad >= 3)) { steamPause = Date.now() + (/HTTP/.test(m) ? 9e4 : 6e4); steamBad = 0; console.warn('[hearth:online-fix] Steam is throttling / not answering (' + m.slice(0, 50) + '): Steam requests paused for ' + Math.round((steamPause - Date.now()) / 1000) + ' s; cached art keeps working'); } }
        throw e;
      });
    },
    fjsonFast = u => tmo(S.fetchJson(u), 8000, u), fdoc = u => tmo(S.fetchDoc(u), 25000, u);
  const steamPaused = () => Date.now() < steamPause;
  const steamResume = () => { steamPause = 0; steamBad = 0; };
  const log = (...a) => DEBUG && console.log('[hearth:online-fix]', ...a);
  const ORIGIN = 'https://online-fix.me';
  const GAME_RE_PATH = /^\/games\/[^/]+\/\d+-[^/]*\.html$/;

  /* ═══ selectors — the only fragile part; all taken from the site skeletons ═══════════════════ */
  const SEL = {
    feed: '#dle-content article.news',                       // home / category feed cards
    updCard: '.news-flex .article',                          // /guides_upd.html cards
    cardLink: 'a.big-link, a.img, .article-content > a',
    cardTitle: '.article-content h2, .article-content > a',
    cardEdit: '.edit',                                       // "Обновлено 21 октября 2026… Игра обновлена до версии …"
    cardPreview: '.preview-text',                            // "Релиз игры: 13.12.2018 … Режимы: Кооператив \ Мультиплеер"
    slider: '.horizontal-slider', sliderTitle: ':scope > .title',
    fresh: '.game-rating .games-cont a',
    categories: '.categories-block a[href*="/games/"], .categories-block a[href$="/coop/"], .categories-block a[href$="/multi/"]',   // the two mode lists are in the "РЕЖИМЫ" block, at the site root
    user: '.user-menu a.user-avatar',
    dTitle: '#news-title', dContent: '.full-story-content', dEdited: '.edited-block', dInfo: '.full-story-content i',
    sidePopular: '#last-updates .informer-article-block a',
    userMenu: '.user-menu .dropdown-user-menu a',
    pName: '.page-header h2', pAvatar: '.profile-avatar img', pVisit: '.profile-data .visit', pBlock: '.information-block',   // /user/<name>/
  };
  // feed pages 2 and 3 (≈ 40 more games for Browse). Only when the loaded kit renders the grid lazily (HearthUI.features.lazyGrid), otherwise tab changes stutter.
  const FEAT = (typeof HearthUI !== 'undefined' && HearthUI.features) || {};
  const HERO_ART_MS = 1500;                                  // max wait for the few games the hero carousel is picked from
  { const need = ['loadMore', 'lazyArt', 'addGames', 'quietAdd', 'richDetail', 'profile', 'page', 'ranks'].filter(k => !FEAT[k]); if (need.length) console.warn('[hearth:online-fix] the loaded hearth-kit lacks: ' + need.join(', ') + '. Put kit commit a31f82a (or later) in the four @require / @resource URLs and re-install the script.'); }
  const STALE_MS = 20 * 60e3;

  /** A list page is ready when its cards are there; a finished page that has the content area but NO cards (an empty category, a page past the last one) is "ready" too: the scrape then reports
      "no usable games" at once and the original page is shown, instead of the page staying hidden for the whole timeout. */
  const feedReady = () => document.querySelector(SEL.feed) || (document.readyState === 'complete' && document.querySelector('#dle-content') ? document.body : null);
  const P = { game: p => GAME_RE_PATH.test(p), updates: p => p === '/guides_upd.html', category: p => /^\/(?:games\/[^/]+|coop|multi)\/(page\/\d+\/)?$/.test(p), home: p => /^\/(page\/\d+\/)?$/.test(p) };
  const ROUTED = p => P.game(p) || P.updates(p) || P.category(p) || P.home(p);                // the pages the script redesigns (@match covers the whole site; any other page stays original)

  /* ═══ helpers ═══════════════════════════════════════════════════════════════════════════════ */
  const GAME_RE = /\/games\/([^/]+)\/(\d+)-[^/]*\.html/;
  const gameKey = href => { const m = String(href || '').match(GAME_RE); return m ? { cat: m[1], id: m[2] } : null; };
  const cleanTitle = t => String(t || '').replace(/\s+/g, ' ').replace(/\s+(по сети( бесплатно)?|online|онлайн)\s*$/i, '').trim();
  const hadOnline = t => /\sonline\s*$/i.test(String(t || '').replace(/\s+по сети.*$/i, ''));
  const jget = (k, d) => { try { const v = GM_getValue(k, null); return v == null ? d : v; } catch (e) { return d; } };
  const jset = (k, v) => { try { GM_setValue(k, v); } catch (e) { /* storage unavailable */ } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const budget = (p, ms) => Promise.race([p, sleep(ms)]);

  const CAT_EN = { 'Аркады': 'Arcade', 'Выживание': 'Survival', 'Гонки': 'Racing', 'Драки': 'Fighting', 'Песочницы': 'Sandbox', 'Ролевые': 'RPG', 'Симуляторы': 'Simulation', 'Стратегии': 'Strategy', 'Ужасы': 'Horror', 'Шутеры': 'Shooters', 'Головоломки': 'Puzzle', 'Приключения': 'Adventure' };
  const SLUG_EN = { coop: 'Co-op', multi: 'Multiplayer', vr: 'Virtual reality', 'virtual-reality': 'Virtual reality', virtualreality: 'Virtual reality', officialservers: 'Official servers', adventures: 'Adventure', arcade: 'Arcade', survival: 'Survival', racing: 'Racing', fighting: 'Fighting', sandbox: 'Sandbox', rpg: 'RPG', simulators: 'Simulation', strategy: 'Strategy', horror: 'Horror', shooters: 'Shooters', puzzles: 'Puzzle', puzzle: 'Puzzle' };
  const CAT_RU_RE = [[/виртуальн/i, 'Virtual reality'], [/аркад/i, 'Arcade'], [/выжива/i, 'Survival'], [/гонк/i, 'Racing'], [/драк|файтинг/i, 'Fighting'], [/песочниц/i, 'Sandbox'], [/ролев/i, 'RPG'], [/симулятор/i, 'Simulation'], [/стратег/i, 'Strategy'], [/ужас|хоррор/i, 'Horror'], [/шутер/i, 'Shooters'], [/головолом/i, 'Puzzle'], [/приключ/i, 'Adventure'], [/официальн.*сервер|сервер.*официальн/i, 'Official servers'], [/кооператив/i, 'Co-op'], [/мультиплеер/i, 'Multiplayer']];
  const catLabel = (txt, slug) => { const t = String(txt || '').replace(/\s+/g, ' ').trim(); if (CAT_EN[t]) return CAT_EN[t]; if (SLUG_EN[slug]) return SLUG_EN[slug]; if (!CYR.test(t)) return t; for (const [re, en] of CAT_RU_RE) if (re.test(t)) return en; return t; };   // never leaves Russian behind for a label we know
  const MODE_EN = { 'кооператив': 'Co-op', 'мультиплеер': 'Multiplayer', 'cooperative': 'Co-op', 'multiplayer': 'Multiplayer' };
  const CATS = {};                                            // slug → English label (filled from the sidebar)
  /** Category MEMBERSHIP. A game's url folder (/games/<folder>/…) is only its main category; the category pages list games from other folders too (Racing lists /sandbox/, /officialservers/,
   *  /simulator/ games). So whenever a game is seen on a category page we remember "<id> is in <slug>" (kept 30 days, shared by every tab). */
  const CATMAP_KEY = 'hf_catmap_v1', CATMAP_TTL = 30 * 864e5;
  const catOf = new Map();                                    // game id → Set of category slugs it was seen under
  const catSeen = (() => { const o = jget(CATMAP_KEY, null), t = Date.now(); return o && typeof o === 'object' && o.v && o.v.length ? { t: o.t || t, v: o.v } : { t, v: [] }; })();
  (() => { if (Date.now() - catSeen.t > CATMAP_TTL) { catSeen.t = Date.now(); catSeen.v = []; } catSeen.v.forEach(([slug, ids]) => (ids || []).forEach(id => (catOf.get(id) || catOf.set(id, new Set()).get(id)).add(slug))); })();
  function rememberCat(slug, ids) {
    slug = S.slug(slug); if (!slug || slug === 'updated') return false;
    let changed = false, row = catSeen.v.find(r => r[0] === slug); if (!row) catSeen.v.push(row = [slug, []]);
    const have = new Set(row[1]);
    (ids || []).forEach(id => { id = String(id); const set = catOf.get(id) || catOf.set(id, new Set()).get(id); if (!set.has(slug)) { set.add(slug); changed = true; } if (!have.has(id)) { have.add(id); row[1].push(id); } });
    if (changed) jset(CATMAP_KEY, catSeen);
    return changed;
  }
  const extraCats = id => [...(catOf.get(String(id)) || [])];
  const catName = s => CATS[s] || SLUG_EN[s] || (s ? s[0].toUpperCase() + s.slice(1).replace(/[-_]+/g, ' ') : '');

  /* ═══ the site's own list orders ═══════════════════════════════════════════════════════════
     "All games" is / + /page/2/ + /page/3/ …, a category is its own page list, "recently updated" is /guides_upd.html. Each game gets its position in those lists (rank = (page - 1) * 1000 + index on
     the page) and the kit (ranks, page-15) shows exactly those lists in exactly that order. */
  const MODE_CATS = new Set(['coop', 'multi']);                          // /coop/ and /multi/ are listed like categories but live at the site root, not under /games/
  const catSlugOfPath = p => (String(p).match(/^\/games\/([^/]+)\//) || String(p).match(/^\/(coop|multi)\//) || [])[1];
  const catUrl = (slug, n) => `${ORIGIN}/${MODE_CATS.has(slug) ? '' : 'games/'}${slug}/${n > 1 ? 'page/' + n + '/' : ''}`;
  const pageOf = p => +((String(p).match(/\/page\/(\d+)\//) || [])[1] || 1);
  const rank = { feed: new Map(), upd: new Map(), cat: {} };           // id → position in the site's list: (page - 1) * 1000 + place on the page. Nothing is re-sorted: the site's order is the order.
  const catRank = slug => rank.cat[S.slug(slug)] || (rank.cat[S.slug(slug)] = new Map());
  const setRank = (map, page, ids) => (ids || []).forEach((id, i) => map.set(String(id), (page - 1) * 1000 + i));
  const modeCats = r => { const m = (r && r.modes) || []; return [...(m.some(x => /co-?op|кооп/i.test(x)) ? ['coop'] : []), ...(m.some(x => /multi|мульти/i.test(x)) ? ['multi'] : [])]; };   // known at once, from the card

  /** "Кооператив Мультиплеер" / "Кооператив \\ Мультиплеер" / "Co-op, Multiplayer" → ['Co-op', 'Multiplayer']. The site sometimes prints the modes with NO separator, which used to leave one untranslated string. */
  const normModes = list => {
    const out = [];                                                          // [{ name, q }] — q = a short note such as "local" (from "(local co-op)")
    const add = (name, q) => { const e = out.find(o => o.name === name); if (!e) out.push({ name, q: q || '' }); else if (q && !e.q) e.q = q; };
    const note = g => { const t = g.replace(/^\(|\)$/g, '').toLowerCase().replace(/локальн\w*/g, 'local').replace(/онлайн\w*|сетев\w*/g, 'online').replace(/кооператив\w*|co-?op(?:erative)?|мультиплеер\w*|multi-?player/g, ' ').replace(/[,;|/\\]+/g, ' ').replace(/\s+/g, ' ').trim(); return CYR.test(t) ? '' : t; };
    const kind = w => (/^(?:кооп|co)/i.test(w) ? 'Co-op' : 'Multiplayer');
    for (const item of [].concat(list || [])) {
      const groups = [];
      let t = String(item || '').replace(/\([^)]*\)/g, g => { groups.push(g); return ` \u0001${groups.length - 1}\u0002 `; });     // park the "( … )" notes so their words and commas are not split
      t = t.replace(/кооператив\w*/gi, ' Co-op ').replace(/мультиплеер\w*/gi, ' Multiplayer ').replace(/\bmulti-?player\b/gi, ' Multiplayer ').replace(/\bco-?op(?:erative)?\b/gi, ' Co-op ');
      let last = null;
      for (const piece of t.split(/[\\/,|·]+/).flatMap(p => p.trim().split(/\s+(?=Co-op\b|Multiplayer\b|\u0001)|(?<=Co-op|Multiplayer|\u0002)\s+/)).map(p => p.trim()).filter(Boolean)) {
        const g = piece.match(/^\u0001(\d+)\u0002$/);
        if (g) {                                                              // a note on its own: it belongs to the mode just before it, else to the mode it names ("(local co-op)")
          const text = groups[+g[1]], q = note(text), named = text.match(/кооператив|co-?op|мультиплеер|multi-?player/i);
          if (last) add(last, q); else if (named) { last = kind(named[0]); add(last, q); }
          continue;
        }
        if (/^(?:Co-op|Multiplayer)$/.test(piece)) { last = piece; add(piece, ''); continue; }
        if (CYR.test(piece) || /[()\u0001\u0002]/.test(piece)) continue;          // leftovers we cannot show in English
        last = piece; add(piece, '');
      }
    }
    return out.slice(0, 4).map(o => (o.q ? `${o.name} (${o.q})` : o.name));
  };
  function parsePreview(txt) {
    const t = String(txt || '').replace(/\s+/g, ' ').trim();
    const year = ((t.match(/\b\d{1,2}\.\d{1,2}\.(\d{4})\b/) || [])[1]) || null;
    let m = (t.match(/Режимы:\s*(.+)$/i) || [])[1];
    if (!m) { const x = t.match(/\d{4}\s+(.+)$/); m = x && !/Игра через/i.test(x[1]) ? x[1] : ''; }
    const modes = normModes(m || '').map(x => MODE_EN[x.toLowerCase()] || x);
    const dm = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);        // the full release date, not only the year
    return { year: year ? +year : null, rel: dm ? Date.UTC(+dm[3], +dm[2] - 1, +dm[1]) : undefined, modes };
  }

  /* ═══ state + persistent snapshot ═══════════════════════════════════════════════════════════ */
  const raw = new Map();                                      // id → compact raw record
  const lists = { pop: [], fresh: [], feed: [], upd: [], updPage: [] };
  const site = { cats: [], user: null };
  const snap = jget('hf3:snap', {});                          // { home:{…,t}, upd:{…,t} }
  let handle = null;
  const searchTag = new Map();                                // game id → queries it was returned for by the SITE search

  function put(r) {
    if (r.modes) r = { ...r, modes: normModes(r.modes) };                // rows restored from an older snapshot may still hold the unsplit Russian string
    const m = { ...(raw.get(r.id) || {}) };
    for (const [k, v] of Object.entries(r)) if (!(v == null || v === '' || (Array.isArray(v) && !v.length))) m[k] = v;
    raw.set(r.id, m); return r.id;
  }
  const putAll = rs => [...new Set(rs.filter(Boolean).map(put))];
  const pack = rs => rs.map(r => ({ id: r.id, title: r.title, cat: r.cat, year: r.year, rel: r.rel, modes: r.modes, note: r.note, added: r.added, upd: r.upd, img: r.img, online: r.online, url: r.url }));
  const isFresh = t => t && Date.now() - t < STALE_MS;

  /* ═══ document access ═══════════════════════════════════════════════════════════════════════ */
  const docs = new Map();
  const getDoc = url => { const u = new URL(url, ORIGIN).href; if (!docs.has(u)) docs.set(u, fdoc(u).catch(e => { docs.delete(u); throw e; })); return docs.get(u); };
  const base = el => (el && el.baseURI) || location.href;

  /* ═══ parsers  (live DOM or fetched Document → raw records) ═════════════════════════════════ */
  /** The site prints dates as "18 октября 2026, 20:22" (or "Сегодня / Вчера, 20:22") on Moscow time (UTC+3) → ms since epoch, 0 when there is no date in the text. */
  const RU_MONTH_N = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 }, MSK_MS = 3 * 36e5;
  function msOfRu(text) {
    const t = String(text || '').toLowerCase().replace(/\s+/g, ' ');
    let m = t.match(/(\d{1,2}) ([а-яё]+) (\d{4})(?:\D+?(\d{1,2}):(\d{2}))?/);
    if (m && RU_MONTH_N[m[2]]) return Date.UTC(+m[3], RU_MONTH_N[m[2]] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) - MSK_MS;
    m = t.match(/(сегодня|вчера)\D*?(\d{1,2}):(\d{2})/);
    if (m) { const n = new Date(Date.now() + MSK_MS); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - (m[1] === 'вчера' ? 1 : 0), +m[2], +m[3]) - MSK_MS; }
    return 0;
  }
  function parseCard(el) {
    const a = S.qa(SEL.cardLink, el).find(x => gameKey(x.getAttribute('href')));
    const k = a && gameKey(S.abs(a.getAttribute('href'), base(el))); if (!k) return null;
    const rawTitle = S.text(SEL.cardTitle, el) || S.attr('img', 'alt', el);
    const pv = parsePreview(S.text(SEL.cardPreview, el)), imgEl = S.q('.image img', el) || S.q('img', el);
    return { id: k.id, title: cleanTitle(rawTitle) || rawTitle, online: hadOnline(rawTitle), cat: k.cat, year: pv.year, rel: pv.rel, modes: pv.modes, note: S.text(SEL.cardEdit, el), added: Date.parse(S.attr('.info-date time', 'datetime', el)) || msOfRu(S.text('.info-date', el)) || undefined, upd: msOfRu(S.text(SEL.cardEdit, el)) || undefined, img: imgEl ? S.imgUrl(imgEl) : S.bgUrl(S.q('a.img', el)), url: S.abs(a.getAttribute('href'), base(el)) };
  }
  function parseMini(a, titleSel) {
    const href = S.abs(a.getAttribute('href'), base(a)), k = gameKey(href); if (!k) return null;
    const rawTitle = S.text(titleSel, a) || S.attr('img', 'alt', a), img = S.q('img', a);
    return { id: k.id, title: cleanTitle(rawTitle) || rawTitle, online: hadOnline(rawTitle), cat: k.cat, img: img ? S.imgUrl(img) : '', url: href };
  }
  const sliderOf = (doc, word) => { const box = S.qa(SEL.slider, doc).find(b => S.text(SEL.sliderTitle, b).toUpperCase().includes(word)); return box ? S.qa('a[href*="/games/"]', box).map(a => parseMini(a, 'p')).filter(Boolean) : []; };
  const feedOf = doc => S.qa(SEL.feed, doc).map(parseCard).filter(Boolean);
  const updOf = doc => S.qa(SEL.updCard, doc).map(parseCard).filter(Boolean);

  function readChrome(doc) {
    const slugs = S.qa(SEL.categories, doc).map(a => { const m = (a.getAttribute('href') || '').match(/\/games\/([^/]+)\/?$|\/(coop|multi)\/?$/), slug = m && (m[1] || m[2]); if (slug && S.text(a)) CATS[slug] = catLabel(S.text(a), slug); return slug; }).filter(Boolean);
    if (slugs.length) site.cats = [...new Set(slugs)];
    site.chromeRead = true;                                   // this page showed the real header: a cached user must not override it
    const u = S.q(SEL.user, doc), href = u ? S.abs(u.getAttribute('href'), base(u)) : '';
    if (u && /\/user\/[^/]+\/?$/.test(href)) {                // signed in. (A "log in" link is not /user/<name>/, so signed-out stays null)
      const img = S.q('img', u);                              // the real avatar image (the default silhouette included): no letters
      const menu = S.qa(SEL.userMenu, doc).map(a => ({ text: S.text(a), href: S.abs(a.getAttribute('href'), base(a)) })).filter(m => m.text && /^https?:/.test(m.href));
      site.user = { name: S.text(u), avatarUrl: img ? S.imgUrl(img) : '', href, menu };
    } else site.user = null;
  }
  function readHome(doc) {
    readChrome(doc);
    const pop = sliderOf(doc, 'ПОПУЛЯРНОЕ'), upd = sliderOf(doc, 'ОБНОВЛЕНИЯ'), fresh = S.qa(SEL.fresh, doc).map(a => parseMini(a, 'h3')).filter(Boolean);
    const sidePop = S.qa(SEL.sidePopular, doc).map(a => parseMini(a, '.informer-block-title')).filter(Boolean);
    return { pop: pop.length ? pop : sidePop, upd, fresh, feed: feedOf(doc) };
  }

  /* ═══ snapshot sections: use what is cached at once, refresh silently when stale ════════════ */
  const SECTIONS = {
    home: {
      fetch: async () => readHome(await getDoc(ORIGIN + '/')),
      save: h => ({ pop: pack(h.pop), upd: pack(h.upd), fresh: pack(h.fresh), feed: pack(h.feed), cats: site.cats, user: site.user }),
      apply: h => { if (h.cats && !site.cats.length) site.cats = h.cats; if (h.user && !site.user && !site.chromeRead) site.user = h.user; lists.pop = putAll(h.pop); lists.upd = putAll(h.upd); lists.fresh = putAll(h.fresh); lists.feed = putAll(h.feed); setRank(rank.feed, 1, lists.feed); },
    },
    upd: {
      fetch: async () => ({ list: updOf(await getDoc(ORIGIN + '/guides_upd.html')) }),
      save: h => ({ list: pack(h.list) }), apply: h => { lists.updPage = putAll(h.list); rank.upd.clear(); setRank(rank.upd, 1, lists.updPage); },
    },
  };
  const store = (name, d) => { snap[name] = { ...SECTIONS[name].save(d), t: Date.now() }; persist('snap'); };     // (written by the idle writer, not on the spot)
  /** Make section `name` available. Live data wins; else the cached copy at once (any age; stale → silent refresh for next time); network only if nothing is cached. */
  async function ensure(name, live) {
    const sec = SECTIONS[name], cached = snap[name];
    if (live) { sec.apply(live); store(name, live); return; }
    if (cached) { sec.apply(cached); if (!isFresh(cached.t)) quiet(1200).then(() => sec.fetch()).then(d => store(name, d)).catch(() => {}); return; }
    try { const p = sec.fetch(), d = await budget(p, 2500); if (d) { sec.apply(d); store(name, d); } else p.then(x => store(name, x), () => {}); } catch (e) { log(name, 'failed', e); }   // too slow for this paint: the answer is still cached for the next page (it used to be thrown away, so a slow connection paid the 2.5 s on every page)
  }

  /* ═══ Steam: ids (one search per game, cached) + real asset URLs (batched, cached) ═══════════ */
  const IDS_KEY = 'hf4:ids', MISS_KEY = 'hf4:miss', META_KEY = 'hf5:meta', MISS_TTL = 3 * 864e5;
  const ids = jget(IDS_KEY, {}), miss = jget(MISS_KEY, {}), meta = jget(META_KEY, {});   // ids: title → appid; miss: title → time of last failed lookup
  const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’‘`´]/g, '').replace(/[™®©]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9а-яё]+/g, ' ').trim().split(' ').map(t => ROMAN[t] || t).join(' ');
  const tk = s => new Set(norm(s).split(' ').filter(Boolean));
  function score(a, b) {
    const na = norm(a), nb = norm(b); if (na === nb || na.replace(/ /g, '') === nb.replace(/ /g, '')) return 1;
    if (Math.min(na.length, nb.length) > 6 && (na.startsWith(nb) || nb.startsWith(na))) return 0.92;
    const A = tk(a), B = tk(b); let i = 0; A.forEach(t => B.has(t) && i++);
    const small = Math.min(A.size, B.size), big = Math.max(A.size, B.size);
    if (small && i === small && small / big >= 0.4) return 0.9 - (1 - small / big) * 0.2;
    return i / (A.size + B.size - i || 1);
  }
  const idKey = r => norm(r.title);
  const recentMiss = key => miss[key] && Date.now() - miss[key] < MISS_TTL;
  const known = r => idKey(r) in ids || recentMiss(idKey(r)) || !!sid[r.id];
  async function lookupId(r) {
    const key = idKey(r); if (!key) return 0; if (key in ids) return ids[key]; if (recentMiss(key)) return 0;
    const terms = [r.title], noParen = r.title.replace(/\s*\([^)]*\)/g, '').trim(), head = r.title.split(/\s*[:–—]\s*|\s+-\s+/)[0].trim();
    if (noParen !== r.title) terms.push(noParen);
    if (head.length > 3 && head !== r.title) terms.push(head);
    if (r.online) terms.push(r.title + ' Online');
    let best = null;
    try {
      for (const term of terms.slice(0, 3)) {
        const j = await fjson('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(term) + '&l=english&cc=us');
        for (const it of (j && j.items) || []) { const sc = Math.max(score(term, it.name), score(r.title, it.name)); if (sc >= 0.7 && (!best || sc > best.sc)) best = { id: it.id, sc }; }
        if (best && best.sc >= 0.9) break;
      }
    } catch (e) { return 0; }                                 // network problem: don't cache
    if (best) return (ids[key] = best.id);
    miss[key] = Date.now(); return 0;
  }
  function parseItem(it) {
    const a = it.assets || {}, fmt = a.asset_url_format || '', b = 'https://shared.fastly.steamstatic.com/store_item_assets/';
    const url = f => (f && fmt ? (/^https?:/.test(fmt) ? fmt : b + fmt).replace('${FILENAME}', f) : '');
    const bi = it.basic_info || {}, rd = it.release && it.release.steam_release_date;
    return { poster: url(a.library_capsule || a.library_capsule_2x), hero: url(a.library_hero || a.library_hero_2x), logo: url(a.library_logo_2x || a.library_logo), header: url(a.header),
      desc: bi.short_description || '', dev: (bi.developers && bi.developers[0] && bi.developers[0].name) || '', year: rd ? new Date(rd * 1000).getUTCFullYear() : null };
  }
  async function fetchMeta(appids) {
    const need = [...new Set(appids)].filter(id => id && !(id in meta));
    for (let i = 0; i < need.length; i += 20) {
      const chunk = need.slice(i, i + 20);
      const input = { ids: chunk.map(appid => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true, include_basic_info: true, include_release: true } };
      try {
        const j = await fjson('https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=' + encodeURIComponent(JSON.stringify(input)));
        const items = (j && j.response && j.response.store_items) || [];
        chunk.forEach(id => { const it = items.find(x => +x.appid === id || +x.id === id); meta[id] = it ? parseItem(it) : 0; });
      } catch (e) { /* leave uncached */ }
    }
  }
  const steamOf = r => ids[idKey(r)] || 0;

  /* ═══ the game page's own Steam link ("Страница игры в Steam:" → online-fix.me/ext/<token> → a 3 s redirect page → store.steampowered.com/app/<id>) ═══
     It is exact, so it wins over the title search; and for a game the title search could not find it is the fallback source of the app id. */
  const SID_KEY = 'hf9:sid', LINK_KEY = 'hf9:links2';
  const sid = jget(SID_KEY, {}), links = jget(LINK_KEY, {});   // sid: game id → {app,url}; links: /ext/ url → {app,url} | {miss:t}
  const steamStore = app => `https://store.steampowered.com/app/${app}/`;
  const STEAM_APP_RE = /(?:store\.steampowered\.com|steamcommunity\.com)(?:\\?\/)+app(?:\\?\/)+(\d+)/i;
  const appOf = r => (sid[r.id] && sid[r.id].app) || r.steam || steamOf(r) || 0;
  const gmGet = (url, headers) => new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, headers, timeout: 15000, onload: r => res({ status: r.status, finalUrl: r.finalUrl || url, text: r.responseText || '' }), onerror: () => rej(new Error('network error')), ontimeout: () => rej(new Error('timeout')) }));
  /** The /ext/ interstitial ("Вы собираетесь перейти на: store.steampowered.com" + a button whose onclick is location.href='<target>') → { url, host, app }.
      Also accepts a real redirect (finalUrl), a meta refresh, or the Steam URL anywhere in the page's text / script. */
  const dec = x => { try { return decodeURIComponent(x); } catch (e) { return x; } };
  const S_TEAM_RE = /s\.team\/a\/(\d+)/i;
  function readRedirect(text, finalUrl) {
    const t = String(text || ''), unesc = x => x.replace(/\\u002f/gi, '/').replace(/&#x2f;|&#47;/gi, '/').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const target = (t.match(/location\.href\s*=\s*\\?['"]([^'"\\]+)/i) || t.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i) || [])[1] || '';
    const url = unesc(target) || '';
    const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
    const shown = (t.match(/Вы собираетесь перейти на:?\s*<\/span>\s*([^<\s]+)/i) || [])[1] || '';
    const hay = [String(finalUrl || ''), url, unesc(t), dec(unesc(t))];
    let app = 0; for (const h of hay) { const m = h.match(STEAM_APP_RE) || h.match(S_TEAM_RE) || h.match(/steam:\/\/(?:store|nav\/games\/details)\/(\d+)/i); if (m) { app = +m[1]; break; } }
    return { url, host: hostOf(url) || shown, app };
  }
  const linkLog = [];
  /** The redirect page → the Steam app it leads to. A "not Steam" verdict is remembered only when we really READ the redirect page (HTTP 200 and it names a target);
      a blocked / rate-limited / failed request is never remembered, so it cannot hide the button for a day. */
  async function linkTarget(ext, from) {
    const c = links[ext]; if (c && !c.miss) return c; if (c && Date.now() - c.miss < 864e5) return 0;
    let out = 0, readable = false, info = null;
    try {
      const r = await gmGet(ext, { Referer: from || location.href, Accept: 'text/html,*/*' });
      info = readRedirect(r.text, r.finalUrl);
      if (info.app) out = { app: info.app, url: steamStore(info.app) };
      readable = r.status === 200 && !!(info.url || info.host);
      linkLog.push({ ext: ext.slice(0, 60), status: r.status, finalUrl: String(r.finalUrl).slice(0, 80), host: info.host, app: info.app, bytes: r.text.length }); if (linkLog.length > 12) linkLog.shift();
    } catch (e) { log('steam link failed', e); linkLog.push({ ext: ext.slice(0, 60), error: String(e.message || e) }); return 0; }       // network problem: don't remember
    if (out) { links[ext] = out; persist('links'); return out; }
    if (readable) { links[ext] = { miss: Date.now(), host: info.host }; persist('links'); }                                                  // read fine, and it is not Steam
    return 0;
  }
  /** Remember the exact app id for this game (and forget a failed title search). */
  async function steamFromLink(r) {
    if (sid[r.id]) return sid[r.id].app;
    const l = r.steamLink; if (!l) return 0;
    let app = l.app || 0, url = l.app ? steamStore(l.app) : '';
    if (!app && l.ext) { const t = await linkTarget(l.ext, r.url); if (t) { app = t.app; url = t.url; } }
    if (!app) return 0;
    sid[r.id] = { app, url }; ids[idKey(r)] = app; delete miss[idKey(r)]; persist('sid', 'ids', 'miss'); return app;
  }
  /* small tools: a concurrency limiter, and debounced persistence (GM_setValue serialises the whole object every time) */
  const limiter = n => { let active = 0; const q = []; const pump = () => { while (q.length) { let b = 0; q.forEach((e, i) => { if (e.pri() > q[b].pri()) b = i; }); if (active >= n && q[b].pri() < 2) break; const { fn, res, rej } = q.splice(b, 1)[0]; active++; fn().then(res, rej).finally(() => { active--; pump(); }); } }; return (fn, pri = () => 0) => new Promise((res, rej) => { q.push({ fn, res, rej, pri }); pump(); }); };   // highest pri() first (read when a slot frees up, so it can change while queued), FIFO among equals; pri 2 ignores the cap
  const searchLimit = limiter(6), prio = r => () => (r._hi ? 2 : r._wait ? 1 : 0);   // 2 = the open sheet, 1 = a card still waiting for its art, 0 = leftovers that only fill the cache for the next visit
  /* what changed since the last write: persist('meta') marks one store, persist() (no argument) marks all of them. Only changed stores are serialised, one per idle slice, 2.5 s after the first change
     (before, every change rewrote all nine stores 1.5 s later in a single task: meta, trMem and storyCache can be large, and that landed right after switching to Discover, while its art was resolving) */
  const STORES = { snap: () => ['hf3:snap', snap], ids: () => [IDS_KEY, ids], miss: () => [MISS_KEY, miss], meta: () => [META_KEY, meta], tr: () => [TR_KEY, trMem], story: () => [STORY_KEY, storyCache], sid: () => [SID_KEY, sid], links: () => [LINK_KEY, links] };   // functions: several keys / stores are declared further down the file
  const ART_KEYS = ['ids', 'miss', 'sid', 'meta', 'links'];
  const dirty = new Set(); let storeT = 0, storeI = 0;
  const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 250));
  const unidle = id => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id));
  /** Background work (fetching + parsing a whole page is a few tens of ms in one go) must not land while the reader is acting: waits until nothing was touched for `gap` ms, then for an idle
      moment. After `max` ms it goes ahead anyway. */
  let lastInput = Date.now();
  ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart', 'scroll'].forEach(t => addEventListener(t, () => { lastInput = Date.now(); }, { capture: true, passive: true }));
  const quiet = async (gap = 1000, max = 15000) => { const t0 = Date.now(); while (Date.now() - lastInput < gap && Date.now() - t0 < max) await sleep(250); await new Promise(r => idle(r)); };
  const persist = (...keys) => { (keys.length ? keys : Object.keys(STORES)).forEach(k => dirty.add(k)); if (!storeT && !storeI) storeT = setTimeout(() => { storeT = 0; storeI = idle(writeOne); }, 2500); };
  function writeOne() { storeI = 0; const k = dirty.values().next().value; if (!k) return; dirty.delete(k); const [key, val] = STORES[k](); jset(key, val); if (dirty.size) storeI = idle(writeOne); }
  function flushStore() { clearTimeout(storeT); storeT = 0; if (storeI) unidle(storeI); storeI = 0; for (const k of dirty) { const [key, val] = STORES[k](); jset(key, val); } dirty.clear(); }   // page hidden / closing: everything pending, now
  addEventListener('pagehide', flushStore); document.addEventListener('visibilitychange', () => document.hidden && flushStore());

  /* ids: one search per game, de-duplicated while in flight */
  const inflightId = new Map();
  function idOf(r) {
    const key = idKey(r); if (!key) return Promise.resolve(0);
    if (key in ids) return Promise.resolve(ids[key]); if (recentMiss(key)) return Promise.resolve(0);
    if (!inflightId.has(key)) inflightId.set(key, searchLimit(() => lookupId(r), prio(r)).catch(() => 0).finally(() => inflightId.delete(key)));
    return inflightId.get(key);
  }
  /* asset URLs: everything asked for within 40 ms goes out as ONE request per 20 apps */
  const metaQ = { ids: new Set(), waiters: [], timer: 0 };
  function wantMeta(id) {
    if (!id || id in meta) return Promise.resolve();
    return new Promise(res => { metaQ.ids.add(id); metaQ.waiters.push(res); if (!metaQ.timer) metaQ.timer = setTimeout(flushMeta, 40); });
  }
  async function flushMeta() {
    const batch = [...metaQ.ids], waiters = metaQ.waiters; metaQ.ids = new Set(); metaQ.waiters = []; metaQ.timer = 0;
    try { await fetchMeta(batch); } catch (e) { log('meta batch failed', e); }
    persist('meta'); waiters.forEach(w => w());
  }
  async function resolveOne(r) {
    try {
      // the page's own Steam link (exact) > what is already known > Steam title search
      const app = (sid[r.id] && sid[r.id].app) || (r.steamLink ? await steamFromLink(r) : 0) || r.steam || await idOf(r);   // (a title Steam can't find stays on the site's image; opening its sheet reads the page's Steam link and remembers it)
      if (app) await wantMeta(app); persist(...ART_KEYS);
    } catch (e) { log('steam resolve failed', e); }
  }
  const resolveSteam = rs => Promise.all(rs.filter(Boolean).map(resolveOne));

  /** Kit hook (ui.resolveArt): called once per game, right before its first image would load. Resolves in the background of the skeleton. */
  const ART_WAIT_MS = 2500;
  async function resolveArt(g) {
    const r = raw.get(g.id); if (!r) return null;
    r._wait = true; await Promise.race([resolveSteam([r]), sleep(ART_WAIT_MS)]); r._wait = false;   // never keep a card grey for long: after ART_WAIT_MS it shows the site's image (the lookup goes on at low priority and is cached)
    const x = toGame(r);
    return { steamAppId: x.steamAppId, art: x.art, description: x.description, developer: x.developer, releaseYear: x.releaseYear };
  }
  /** The hero carousel is picked from games that HAVE hero art, so look up just the few candidates first (bounded, usually instant from cache). */
  async function prepareHero() {
    const cand = [...new Set([...lists.pop, ...lists.fresh, ...lists.feed])].slice(0, 8).map(id => raw.get(id));
    cand.forEach(r => { r._wait = true; }); await budget(resolveSteam(cand), HERO_ART_MS); cand.forEach(r => { r._wait = false; });
  }

  /* ═══ build the data contract ═══════════════════════════════════════════════════════════════ */
  function toGame(r) {
    const app = appOf(r) || null, m = app && meta[app] ? meta[app] : null, missed = !app && recentMiss(idKey(r));
    const art = { header: (m && m.header) || r.img || '', fallback: r.img || '' };    // fallback: the site's own image, tried last (kit >= 0.2)
    if (m) { if (m.poster) art.poster = m.poster; if (m.hero) art.hero = m.hero; if (m.logo) art.logo = m.logo; } else if (missed && r.img) art.poster = r.img;   // site image only when Steam has nothing
    const ranks = {}, rid = String(r.id), rf = rank.feed.get(rid), ru = rank.upd.get(rid); if (rf != null) ranks.feed = rf; if (ru != null) ranks.upd = ru;
    const cats = [...new Set([r.cat, ...extraCats(r.id), ...modeCats(r), ...(lists.updPage.includes(r.id) || lists.upd.includes(r.id) ? ['updated'] : [])])].filter(Boolean);
    return S.game({
      id: r.id, title: r.title, steamAppId: app, art, tagline: (r.modes || []).join(' · ') || catName(r.cat),
      description: (m && m.desc) || '', update: plainUpdate(parseUpdate(r.note)), facts: modesOf(r).length ? [{ label: 'Modes', value: modesOf(r).join(', ') }] : [], genres: [...new Set([catName(r.cat), ...(r.modes || []), ...(searchTag.get(r.id) || [])].filter(Boolean))], categories: cats, ranks: (cats.forEach(c => { const m = rank.cat[S.slug(c)], v = m && m.get(rid); if (v != null) ranks['cat:' + S.slug(c)] = v; }), ranks),   // genres[1+] are never displayed, only searched
      developer: (m && m.dev) || '', releaseYear: r.year || (m && m.year) || null, addedAt: r.added || 0, updatedAt: r.upd || 0, releasedAt: r.rel || 0, downloadUrl: r.dl || r.url, sourceUrl: r.url, steamUrl: (sid[r.id] && sid[r.id].url) || '',
    });
  }
  /** Co-op / Multiplayer for the side panel: from the card's "Режимы:" line, else sniffed from the page's network-modes text. Empty = show nothing. */
  function modesOf(r, sec) {
    if (r && r.modes && r.modes.length) return r.modes;
    const t = ((sec && sec.modes) || []).join(' ').toLowerCase(), out = [];
    if (/co-?op|кооператив/.test(t)) out.push('Co-op'); if (/multiplayer|мультиплеер/.test(t)) out.push('Multiplayer');
    return out;
  }
  const NAV = [
    { id: 'discover', label: 'Discover', view: 'home' },
    { id: 'games', label: 'Games', view: 'browse' },
    { id: 'library', label: 'Library', view: 'browse', filter: { saved: true } },
  ];
  function build() {
    const order = [...new Set([...lists.updPage, ...lists.upd, ...lists.feed, ...lists.fresh, ...lists.pop, ...raw.keys()])].filter(id => raw.has(id) && raw.get(id).title);
    const games = order.map(id => toGame(raw.get(id))), has = new Set(order), only = a => a.filter(id => has.has(id));
    const byId = new Map(games.map(g => [g.id, g])), hasHero = id => byId.get(id) && byId.get(id).art.hero;

    let heroIds = [...new Set([...only(lists.pop), ...only(lists.fresh), ...only(lists.feed)])].filter(hasHero).slice(0, 5);
    if (heroIds.length < 3) heroIds = [...new Set([...only(lists.pop), ...only(lists.feed)])].slice(0, 5);

    const shelves = [], add = (id, title, list, extra = {}) => { const g = only(list); if (g.length) shelves.push({ id, title, gameIds: g.slice(0, 24), ...extra }); };
    add('top', 'Popular right now', lists.pop.slice(0, 10), { style: 'ranked' });
    add('fresh', 'New releases', lists.fresh, { filter: { sort: 'new' } });
    add('upd', 'Recently updated', lists.updPage.length ? lists.updPage : lists.upd, { filter: { sort: 'updated' } });
    add('latest', 'Latest additions', lists.feed, { filter: {} });
    const cats = site.cats.map(s => ({ id: s, label: catName(s) }));          // no "Recently updated" category any more: it is a sort (the kit's Sort button) and the games keep their 'updated' mark for it
    cats.forEach(c => { const g = games.filter(x => x.categories.includes(S.slug(c.id))).map(x => x.id); if (g.length >= 5 && shelves.filter(s => s.id.startsWith('cat-')).length < 2) shelves.push({ id: 'cat-' + c.id, title: c.label, gameIds: g.slice(0, 24), filter: { category: c.id } }); });

    const featured = [], newest = only(lists.fresh)[0];
    if (newest) featured.push({ gameId: newest, kicker: 'Just added', headline: byId.get(newest).title, image: 'hero', size: 'wide' });
    const upd = only(lists.updPage.length ? lists.updPage : lists.feed).find(id => id !== newest && versionOf(raw.get(id).note));
    if (upd) { const v = versionOf(raw.get(upd).note); featured.push({ gameId: upd, kicker: v ? `Fresh update · ${/^\d/.test(v) ? 'v' + v : v}` : 'Fresh update', headline: byId.get(upd).title, image: 'hero', size: 'narrow' }); }

    const u = site.user;
    return {
      version: 1,
      site: { name: 'Online-Fix', mark: 'O', logo: ORIGIN + '/templates/FixLand/images/oflogo.gif', footer: 'Unofficial redesign (Hearth) · not affiliated with Online-Fix.me', user: u ? { name: u.name, avatarUrl: u.avatarUrl, href: u.href } : undefined },
      nav: NAV, categories: cats, games, shelves, featured,
      hero: heroIds.map((gameId, i) => ({ gameId, eyebrow: i ? 'Trending now' : 'Popular right now' })),
    };
  }

  /* ═══ routes ════════════════════════════════════════════════════════════════════════════════ */
  const world = opts => Promise.all([opts.home ? 0 : ensure('home'), opts.upd ? 0 : ensure('upd')]);   // everything around the current page, cached-first
  async function finish() {
    await prepareHero();                                                   // the rest of the art is pulled per card while it shows a skeleton
    return build();
  }
  async function scrapeHome() {
    const pg = pageOf(location.pathname);
    if (pg > 1) { const live = readHome(document), ids = putAll(live.feed); setRank(rank.feed, pg, ids); await ensure('home'); if (!lists.feed.length) lists.feed = ids; }   // /page/N/ is a later page of the feed, not the home page: its cards must not replace the home lists (nor the cached home)
    else await ensure('home', readHome(document));
    if (!lists.feed.length) throw new Error('no games found on the page (selectors?)');
    await world({ home: true });
    return finish();
  }
  async function scrapeUpdates() {
    readChrome(document);
    await ensure('upd', { list: updOf(document) });
    await world({ upd: true });
    return finish();
  }
  async function scrapeCategory() {
    const live = readHome(document); putAll(live.feed);
    if (!live.feed.length) throw new Error('category page: no games found');
    { const slug = catSlugOfPath(location.pathname), ids = live.feed.map(r => r.id); rememberCat(slug, ids); setRank(catRank(slug), pageOf(location.pathname), ids); }      // this page IS the category: everything listed on it belongs to it
    lists.feed = live.feed.map(r => r.id);
    await world({}); return finish();
  }

  const dlLabel = t => { const x = String(t || '').replace(/\s+/g, ' ').replace(/^\s*(?:Скачать|Download)(?:\s+(?:с|через|from))?\s*/i, '').trim() || 'Download'; return x[0].toUpperCase() + x.slice(1); };
  function describeDownload(text) {
    const l = String(text || '');
    if (/torrent|торрент/i.test(l)) return { label: 'Torrent', kind: 'torrent', hint: 'Game + fix · needs a torrent client' };
    if (/hoster/i.test(l)) return { label: 'Online-Fix Hosters', kind: 'hosters', hint: 'Game + fix · direct download' };
    if (/drive/i.test(l)) return { label: 'Online-Fix Drive', kind: 'drive', hint: 'Game + fix · cloud drive' };
    if (/фикс|\bfix\b/i.test(l)) return { label: 'Fix from server', kind: 'fix', hint: 'Fix only · for a copy you already own' };
    return { label: dlLabel(l), kind: '', hint: '' };
  }
  const storyDownloads = doc => S.qa('a', S.q('.full-story', doc) || doc).filter(a => /^\s*(?:Скачать|Download\b)/i.test(a.textContent))   // the page comes in Russian (Скачать …) or English (Download from …)

    .map(a => ({ ...describeDownload(S.text(a)), href: S.abs(a.getAttribute('href'), base(a)) })).filter(o => o.href && /^https?:/.test(o.href) && !/#$/.test(o.href));
  const storyPassword = doc => { const root = S.q(SEL.dContent, doc); const l = root ? storyLines(root).find(x => /^(?:Пароль|Password\b)/i.test(x)) : ''; return (l && (l.match(/:\s*(\S+)/) || [])[1]) || ''; };

  /* ═══ language: everything the person reads is English ═══════════════════════════════════════
     dates and the common update phrases are converted locally; free text goes through a cached translation (see translate()). */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const RU_MON = { 'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11 };
  const CYR = /[А-Яа-яЁё]/;
  const ruDate = t => String(t || '')
    .replace(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?:\s*г\.?)?(?:,?\s*(\d{1,2}:\d{2}))?/gi, (m, d, mo, y, hm) => mo.toLowerCase() in RU_MON ? `${+d} ${MON[RU_MON[mo.toLowerCase()]]} ${y}${hm ? ', ' + hm : ''}` : m)
    .replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})(?![\d.])/g, (m, d, mo, y) => +mo >= 1 && +mo <= 12 ? `${+d} ${MON[+mo - 1]} ${y}` : m);   // not inside version numbers like 1.5.1.2608
  const EN_MON_FULL = /\b(\d{1,2}) (January|February|March|April|June|July|August|September|October|November|December) (\d{4})\b/g;
  /** "1.5.1.2608" for a version number, "Build 16102" for a build — whichever the note names. '' when it names neither. */
  function versionOf(note) {
    const t = String(note || '');
    let m = t.match(/(?:верси[июяей]|version)\s*:?\s*v?(\d+(?:\.\d+){0,5})/i);
    if (m) return m[1];
    m = t.match(/(?<![a-z])(?:build|билд|сборк[аиу])\s*№?\s*(\d{1,9})(?!\d)/i);
    return m ? 'Build ' + m[1] : '';
  }
  const RU_PHRASES = [[/^Игра обновлена до релизной версии\.?$/i, 'Game updated to the release version'], [/^Игра обновлена до версии\s+(.+?)\.?$/i, 'Game updated to version $1'], [/^Обновлена? до версии\s+(.+?)\.?$/i, 'Updated to version $1'], [/^Добавлен[ао]?\s+(.+?)\.?$/i, 'Added $1'], [/^Мод обновл[её]н до версии\s+(.+?)\.?$/i, 'Mod updated to version $1'], [/^Мод обновл[её]н до релизной версии\.?$/i, 'Mod updated to the release version'], [/^Мод обновл[её]н\.?$/i, 'Mod updated'], [/^(?:Руководство|Гайд|Инструкция)\s+закрыт[оа]?\.?$/i, 'Guide closed']];
  const GUIDE_CLOSED = /(?:руководство|гайд|инструкция)\s+закрыт|guide\s+(?:is\s+)?closed/i;
  const sentences = t => String(t || '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const DATE_AT_START = /^(\d{1,2}\s+[А-Яа-яЁёA-Za-z]+\s+\d{4}(?:\s*г\.?)?(?:,?\s*\d{1,2}:\d{2})?|\d{1,2}\.\d{1,2}\.\d{4}(?:,?\s*\d{1,2}:\d{2})?)/;
  function parseUpdate(note) {
    const t = String(note || '').replace(/\s+/g, ' ').trim(); if (!t) return null;
    const m = t.match(/^(?:Обновлено|Updated):?\s*(.*)$/i); if (!m) return null;
    let when = m[1], reason = '';
    const d = when.match(DATE_AT_START);
    if (d) { reason = when.slice(d[0].length); when = d[0]; }          // "<date>. [Причина:] <reason>" — the reason label is optional
    else { const r = when.match(/^(.*?)\.\s*(?:Причина|Reason):\s*(.*)$/i); if (r) { when = r[1]; reason = r[2]; } }
    reason = reason.replace(/^[\s.,;:]*(?:(?:Причина|Reason):\s*)?/i, '').trim();
    const text = sentences(reason).map(x => { for (const [re, to] of RU_PHRASES) if (re.test(x)) return x.replace(re, to).replace(/\bversion\s+(Build\b)/i, '$1'); return x; }).map((x, i, all) => (i < all.length - 1 && !/[.!?]$/.test(x) ? x + '.' : x)).join(' ');   // phrase rewrites drop the full stop: put it back between sentences
    return { date: ruDate(when).replace(EN_MON_FULL, (x, dd, mo, y) => `${dd} ${mo.slice(0, 3)} ${y}`).replace(/[.,\s]+$/, ''), version: versionOf(reason), text, closed: GUIDE_CLOSED.test(reason) };
  }
  /** What can be shown BEFORE the sheet's details have loaded: Russian sentences are left out (or swapped for a translation we already have), so no Russian flashes up. */
  const plainUpdate = u => u && { ...u, text: sentences(u.text).map(x => { if (!CYR.test(x)) return x; const l = localTr(x); if (l != null) return l; return trMem[x] && cyrShare(trMem[x]) < 0.3 ? trMem[x] : ''; }).filter(Boolean).join(' ') };
  /* free text ru → en. Order: (1) the lines every game repeats are translated locally, no network; (2) the rest in ONE batched request per sheet;
     (3) whatever is still missing, line by line. Each network step tries 3 endpoints. An answer that is still Russian counts as a failed answer. */
  const TR_KEY = 'hf8:tr'; const trMem = jget(TR_KEY, {}); let trN = Object.keys(trMem).length;
  const trLimit = limiter(2);
  const cyrShare = x => { const all = String(x).match(/[A-Za-zА-Яа-яЁё]/g) || [], ru = String(x).match(/[А-Яа-яЁё]/g) || []; return all.length ? ru.length / all.length : 0; };
  let trFails = 0;                                              // how many lines could not be translated so far (a detail patch with failures is not cached)
  const trLog = [];                                             // last failures: __hearthOnlineFix.trDiag()
  const trNote = (ep, e) => { trLog.push({ endpoint: ep, error: String((e && e.message) || e), at: new Date().toISOString() }); if (trLog.length > 12) trLog.shift(); log('translate failed', ep, e); };
  const RU_LINES = [
    [/^Скачиваем игру\s+(.+?)\s+и распаковываем (?:ее|её) в любую папку\s*:?\.?$/i, 'Download $1 and extract it to any folder.'],
    [/^Скачиваем фикс из папки Fix Repair по (?:одной из )?ссылк\w+ выше и распаковываем его в папку с игрой(?: с заменой)?\.?$/i, 'Download the fix from the Fix Repair folder using the links above and extract it into the game folder, replacing the files.'],
    [/^Запускаем Steam,? заходим в свой профиль\.?$/i, 'Launch Steam and sign in to your profile.'],
    [/^Запускаем игру через\s+(.+?)\.?$/i, 'Launch the game via $1.'],
    [/^Принимаем приглашение от друга\.?$/i, 'Accept your friend’s invitation.'],
    [/^Приглашаем друзей и ожидаем их подключени[ея]\.?$/i, 'Invite your friends and wait for them to connect.'],
    [/^Выбираем режим\.?$/i, 'Choose a mode'],
    [/^Выбираем карту\.?$/i, 'Choose a map'],
    [/^Заходим в игру\.?$/i, 'Start the game.'],
  ];
  /** A whole line translated without the network, or null when any part of it needs the network. Arrow-separated steps are handled part by part. */
  function localTr(line) {
    const t = String(line || '').replace(/\(выполняется единожды\)/gi, '(only needed once)').replace(/\s+/g, ' ').trim();
    if (!CYR.test(t)) return t;
    const out = [];
    for (const seg of t.split(/\s*→\s*/)) {
      if (!CYR.test(seg)) { out.push(seg); continue; }
      let hit = null; for (const [re, to] of RU_LINES) if (re.test(seg)) { hit = seg.replace(re, to); break; }
      if (hit == null) return null; out.push(hit);
    }
    return out.join(' → ');
  }
  const TR_URL = { gtx: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=', chrome: 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=en&q=', memory: 'https://api.mymemory.translated.net/get?langpair=ru|en&q=' };
  const TR_ENDPOINTS = [
    ['gtx', async t => { const j = await fjsonFast(TR_URL.gtx + encodeURIComponent(t)); return ((j && j[0]) || []).map(x => x && x[0]).join(''); }],
    ['chrome', async t => { const j = await fjsonFast(TR_URL.chrome + encodeURIComponent(t)); return j && j.sentences ? j.sentences.map(x => x.trans).join('') : Array.isArray(j) ? (Array.isArray(j[0]) ? j[0][0] : j[0]) : ''; }],
    ['memory', async t => { const j = await fjsonFast(TR_URL.memory + encodeURIComponent(t.slice(0, 480))); return (j && j.responseData && j.responseData.translatedText) || ''; }],
  ];
  const trCached = t => trMem[t] && cyrShare(trMem[t]) < 0.3 ? trMem[t] : '';
  const trKeep = (t, out) => { if (trN++ > 3000) { for (const k of Object.keys(trMem).slice(0, 800)) delete trMem[k]; trN = Object.keys(trMem).length; } trMem[t] = out; persist('tr'); };
  async function tr1(text) {
    const t = String(text || '').trim(); if (!t || !CYR.test(t)) return t;
    const loc = localTr(t); if (loc != null) return loc;
    if (trCached(t)) return trMem[t];
    for (let round = 0; round < 2; round++) {                   // two passes over the endpoints; the second after a pause (rate limits)
      if (round) await sleep(1200);
      for (const [name, ep] of TR_ENDPOINTS) {
        try {
          const o = String(await trLimit(() => ep(t.slice(0, 900))) || '').replace(/\s+/g, ' ').trim();
          if (o && cyrShare(o) < 0.3) { trKeep(t, o); return o; }
          trNote(name, 'answer was empty or still Russian');
        } catch (e) { trNote(name, e); }
      }
    }
    throw new Error('translation failed');
  }
  /** Several lines in one request (newline-separated). Only trusted when the answer has exactly as many lines; otherwise the lines fall through to tr1(). */
  async function trBatch(lines) {
    for (let i = 0; i < lines.length;) {
      let n = 0, len = 0; while (i + n < lines.length && n < 14 && len + lines[i + n].length < 1500) len += lines[i + n++].length + 1;
      n = Math.max(n, 1); const chunk = lines.slice(i, i + n); i += n; if (chunk.length < 2) continue;
      for (const [name, ep] of TR_ENDPOINTS.slice(0, 2)) {
        try {
          const parts = String(await trLimit(() => ep(chunk.join('\n'))) || '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (parts.length === chunk.length && parts.every(x => cyrShare(x) < 0.3)) { chunk.forEach((t, k) => trKeep(t, parts[k])); break; }
          trNote(name, `batch answer had ${parts.length} lines for ${chunk.length}`);
        } catch (e) { trNote(name, e); }
      }
    }
  }
  const translate = async lines => {
    const prepped = lines.map(l => ruDate(l));
    const need = [...new Set(prepped.filter(t => t && CYR.test(t) && !trCached(t) && localTr(t) == null))];
    if (need.length > 1) await trBatch(need);
    return Promise.all(prepped.map(l => tr1(l).catch(() => { trFails++; return l; })));   // on failure the original line is kept for now (and the result is not cached)
  };
  const noRu = x => !CYR.test(String(x || ''));
  /** A cached sheet patch is only reused if nothing in it is Russian (older versions cached failed translations). */
  const patchClean = p => !!p && (p.guide || []).every(s => s.steps.every(noRu)) && noRu(p.update && p.update.text) && noRu(p.description) && (p.facts || []).every(f => noRu(f.value));

  /* ═══ the game page as structured steps ═══════════════════════════════════════════════════════ */
  function storyLines(root) {
    const out = []; let cur = '';
    const flush = () => { const t = cur.replace(/\s+/g, ' ').trim(); if (t) out.push(t); cur = ''; };
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { cur += c.nodeValue; continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName, cls = String(c.getAttribute('class') || '');
        if (/^(SCRIPT|STYLE|NOSCRIPT|IFRAME|VIDEO|IMG|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(tag)) continue;
        if (tag === 'BR') { flush(); continue; }
        if (/fa-arrow-right|fa-long-arrow-right|fa-angle-right/.test(cls)) { cur += ' → '; continue; }
        const block = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|TABLE|TR|HR)$/.test(tag) || /\bquote\b/.test(cls);
        if (block) flush(); walk(c); if (block) flush();
      }
    })(root); flush(); return out;
  }
  // Section headings, Russian and English. The English ones need their colon ("Connection:"), so a step that merely starts with that word is not mistaken for a heading.
  const HEADS = [['released', /^(?:Релиз игры:?|Game release:)\s*/i], ['via', /^(?:Игра через:?|Play via:)\s*/i], ['steampage', /^(?:Страница игры в Steam:?|Game page on Steam:)\s*/i], ['info', /^(?:Информация о игре:?|Game information:)\s*/i], ['files', /^(?:Файлы для игры:?|Game files:)\s*/i],
    ['launch', /^(?:Как запускать:?|How to launch:)\s*/i], ['ingame', /^(?:В игре:?|In-?\s?Game:)\s*/i], ['join', /^(?:Подключение:?|Connect(?:ion|ing)?:)\s*/i], ['host', /^(?:Создание сервера:?|Creat(?:ing|e) (?:a )?server:)\s*/i],
    ['modes', /^(?:Информация о сетевых режимах:?|Information about Network Modes:)\s*/i], ['notes', /^(?:Примечани[яе]:?|Notes?:)\s*/i]];
  const SKIP = /^(РЕКЛАМНЫЙ БЛОК|ADVERTISING|Не знаешь как распаковать|Don.?t know how to (?:un)?pack|Пароль|Password\b|aclib\.|Скачать|Download\b|Фильтровать|Поддержать|Donate)/i;
  function sectionize(lines) {
    const o = { install: [], launch: [], ingame: [], join: [], host: [], modes: [], notes: [], info: [], released: '', via: '', rest: [] }; let cur = 'pre';   // `modes` and `notes` are collected only so they stop leaking into the section before them; they are never shown
    const INLINE = /^((?:В игре:?|In-?\s?Game:))\s+(\S.*)$/i;       // "In-Game: Connection: …" can arrive as one line: split it so the second heading is seen
    const split = l => { const m = l.match(INLINE); return m && HEADS.some(([, re]) => re.test(m[2])) ? [m[1], m[2]] : [l]; };
    for (const raw of lines.flatMap(split)) {
      if (SKIP.test(raw)) continue;
      let line = raw, hit = null;
      for (const [k, re] of HEADS) if (re.test(line)) { hit = k; line = line.replace(re, '').trim(); break; }
      if (hit) { cur = hit; if (hit === 'released') { o.released = line; cur = 'meta'; continue; } if (hit === 'via') { o.via = line; cur = 'meta'; continue; } }
      if (!line || /^[→\s]+$/.test(line) || /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(line)) continue;
      const num = /^\d+[.)]\s+/.test(line), clean = line.replace(/^[→\s]+/, '').replace(/^\d+[.)]\s+/, '').slice(0, 420);
      if (cur === 'pre' || cur === 'files') { if (num) o.install.push(clean); else if (cur === 'pre') o.rest.push(clean); continue; }
      if (cur === 'steampage' || cur === 'meta') continue;
      if (cur === 'info') { o.info.push(line); continue; }
      o[cur].push(clean);
    }
    return o;
  }
  /** The game page's Steam link: { app, url } when it points straight at Steam, { ext } for the online-fix.me/ext/ redirect page. */
  const STEAM_HEAD = /^(?:Страница игры в Steam:?|Game page on Steam:?)/i;
  function steamLinkOf(root) {
    let after = false, first = null;
    for (const el of S.qa('b, strong, a', root)) {
      if (el.tagName !== 'A') { if (STEAM_HEAD.test(el.textContent.replace(/\s+/g, ' ').trim())) after = true; continue; }
      const href = S.abs(el.getAttribute('href'), base(el)), m = href.match(STEAM_APP_RE);
      if (m) return { app: +m[1], url: steamStore(+m[1]) };
      if (/^https?:\/\/[^/]*online-fix\.me\/ext\//i.test(href)) {
        // /ext/ is the site's redirect for EVERY outside link (Microsoft Store, Epic, official site ...). A link announced as the Steam page, or titled with steam, is a SURE one;
        // an /ext/ link titled with another host (e.g. title="xbox.com" on the Minecraft page) never becomes an "Open in Steam" button; an untitled, unannounced one is only a maybe
        // (it is followed first to see where it leads).
        const title = (el.getAttribute('title') || '').trim(), l = { ext: href, sure: true };
        if (/steam/i.test(title) || (after && !title)) return l;
        if (!title && !after) first = first || { ext: href, sure: false };
      }
    }
    return first;
  }
  /** The page says the game lives in ANOTHER store ("Страница игры в Microsoft Store:", or an /ext/ link titled xbox.com / epicgames.com ...): then a Steam title-search match must not
      produce an "Open in Steam" button (a non-Steam game can match some other game's name). Only asked when the page has no Steam link. */
  const OTHER_HEAD = /^(?:Страница игры в|Game page on)\s+(.+?):?$/i, OTHER_HOST = /xbox|microsoft|epicgames|gog\.com|ubisoft|ea\.com|origin\.com|battle\.net|rockstar|itch\.io|playstation|nintendo|amazon|riotgames|bethesda|roblox|minecraft\.net/i;
  function otherStoreOf(root) {
    for (const el of S.qa('b, strong, a', root)) {
      if (el.tagName !== 'A') { const m = el.textContent.replace(/\s+/g, ' ').trim().match(OTHER_HEAD); if (m && !/steam/i.test(m[1])) return true; continue; }
      if (/^https?:\/\/[^/]*online-fix\.me\/ext\//i.test(S.abs(el.getAttribute('href'), base(el))) && OTHER_HOST.test(el.getAttribute('title') || '')) return true;
    }
    return false;
  }
  /** "КООПЕРАТИВ: 8" / "МУЛЬТИПЛЕЕР: 8" (the blue buttons in the network-modes box) → { coop: 8, mp: 8 } */
  function playersOf(root, sec) {
    const txt = [...S.qa('.coop1, .multi1', root).map(el => S.text(el)), ...((sec && sec.modes) || [])].join(' | '), out = {};
    for (const m of txt.matchAll(/(кооператив|co-?op|мультиплеер|multi-?player)\w*\s*[:：]\s*(\d{1,3})/gi)) { const k = /^(?:кооп|co)/i.test(m[1]) ? 'coop' : 'mp', n = +m[2]; if (n > 1 && n > (out[k] || 0)) out[k] = n; }
    return out;
  }
  const playerFacts = pl => [pl.coop && { label: 'Co-op players', value: 'Up to ' + pl.coop }, pl.mp && { label: 'Multiplayer players', value: 'Up to ' + pl.mp }].filter(Boolean);
  /** Media on the game page itself: the YouTube trailer, <video>s, and the story's own screenshots. */
  function pageMedia(root) {
    const items = [], seen = new Set(), add = m => { const k = m.src || (m.sources && m.sources[0] && m.sources[0].src); if (k && !seen.has(k)) { seen.add(k); items.push(m); } };
    S.qa('iframe[src]', root).forEach(f => {
      const m = S.abs(f.getAttribute('src'), base(f)).match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{6,})/i);
      if (m) add({ type: 'embed', thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`, src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&autoplay=1`, title: 'Trailer' });
    });
    S.qa('video', root).forEach(v => {
      const srcs = [v.getAttribute('src'), ...S.qa('source[src]', v).map(x => x.getAttribute('src'))].filter(Boolean).map(u => S.abs(u, base(v))), poster = v.getAttribute('poster');
      if (srcs.length && poster) add({ type: 'video', thumb: S.abs(poster, base(v)), sources: srcs.map(src => ({ src, type: /\.webm(\?|$)/i.test(src) ? 'video/webm' : 'video/mp4' })), title: 'Trailer' });
    });
    S.qa('img', root).forEach(im => {
      const src = S.imgUrl(im), w = +im.getAttribute('width') || 0;
      if (!src || /\/(?:fotos|dleimages|smiles|emoticons)\/|emoji|noavatar|\.gif(?:\?|$)/i.test(src) || (w && w < 160)) return;
      const a = im.closest('a[href]'), full = a && S.abs(a.getAttribute('href'), base(a));
      add({ type: 'image', thumb: src, src: full && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(full) ? full : src });
    });
    return items;
  }
  /** Steam's own media wins whenever Steam has any: its trailers, then its screenshots. The site's own media is the fallback when Steam has none at all, and its trailer is only added (last)
      when Steam has no trailer that can be played. */
  function mergeMedia(steam, page) {
    const sv = steam.filter(m => m.type === 'video'), ss = steam.filter(m => m.type === 'image'), pv = page.filter(m => m.type !== 'image');
    return (steam.length ? [...sv, ...ss, ...(sv.length ? [] : pv)] : page).slice(0, 20);
  }
  /** Steam's trailers (mp4 / webm) then screenshots, as the viewer's media items. */
  function steamMedia(x) {
    const https = u => String(u || '').replace(/^http:/i, 'https:'), items = [], page = `https://store.steampowered.com/app/${x.steam_appid || ''}/`;
    for (const m of (x.movies || []).slice(0, 4)) {
      const pick = o => o && (o.max || o['480']), sources = [[pick(m.mp4), 'video/mp4'], [pick(m.webm), 'video/webm']].filter(v => v[0]).map(([src, type]) => ({ src: https(src), type }));
      const thumb = https(m.thumbnail || m.poster);
      if (sources.length && thumb) { items.push({ type: 'video', thumb, sources, title: m.name || 'Trailer' }); continue; }       // (older entries still have plain files)
      // Steam removed the mp4 / webm files: trailers are DASH streams (.mpd) now, played by dash.js when it loaded (the page's player; the popup's viewer cannot play streams)
      const stream = m.dash_h264 || m.dash_av1 || Object.values(m).find(v => typeof v === 'string' && /\.mpd(\?|$)/.test(v));
      if (stream && thumb && typeof dashjs !== 'undefined') items.push({ type: 'video', thumb, stream: https(stream), page, title: m.name || 'Trailer' });
    }
    for (const y of (x.screenshots || []).slice(0, 16)) if (y.path_thumbnail && y.path_full) items.push({ type: 'image', thumb: https(y.path_thumbnail), src: https(y.path_full) });
    return items;
  }
  /** What the sheet needs from Steam's store details (the same single request / cache the page uses). */
  async function steamDetails(app) {
    const d = await storeInfo(app).catch(() => null);
    return d ? { items: d.media, desc: d.short, dev: d.devs[0] || '', pub: d.pubs[0] || '' } : null;
  }
  const STORY_KEY = 'hf8:story', STORY_V = 5, STORY_TTL = 6 * 36e5;
  let storyCache = jget(STORY_KEY, {});
  function buildStory(doc, url) {
    const root = S.q(SEL.dContent, doc); if (!root) return null;
    const lines = storyLines(root), sec = sectionize(lines);
    return { sec, lines, downloads: storyDownloads(doc), password: storyPassword(doc), note: S.text(SEL.dEdited, doc), steamLink: steamLinkOf(root), nonSteam: !((l0 => l0 && (l0.app || l0.sure))(steamLinkOf(root))) && otherStoreOf(root), players: playersOf(root, sec), media: pageMedia(root) };
  }
  /** Kit hook (ui.resolveDetail): the sheet opens at once; this fills in downloads, the how-to-connect steps, update info, facts, the Steam link and the media.
      `push` (kit >= 0.4) shows what is ready early: downloads / player counts / Open Steam at once, the rest as it arrives. */
  async function resolveDetailRaw(g, push) {
    const r = raw.get(g.id); if (!r) return null;
    const hit = storyCache[g.id]; if (hit && hit.v === STORY_V && Date.now() - hit.t < STORY_TTL && patchClean(hit.patch)) return hit.patch;
    const send = p => { if (typeof push === 'function') try { push(p); } catch (e) { log('push failed', e); } };
    r._hi = true; if (!r.steam && !sid[r.id]) idOf(r);                                                      // the Steam title search starts NOW, in parallel with fetching the game page (and jumps the grid's queue)
    const doc = new URL(r.url, ORIGIN).pathname === location.pathname ? document : await getDoc(r.url);
    const st = buildStory(doc, r.url); if (!st) return null;
    const { sec } = st, groups = [['Install', sec.install], ['Launch', sec.launch], ['In game', sec.ingame], ['Join a game', sec.join], ['Host a game', sec.host]];   // (no \"Network modes\", no \"Notes\": not wanted)
    let sections = groups.filter(([, a]) => a.length);
    if (!sections.length && sec.rest.length) sections = [['Instructions', sec.rest.slice(0, 10)]];
    sections = sections.map(([t, a]) => [t, a.slice(0, 12)]);
    const upd = parseUpdate(st.note || r.note);
    if (st.steamLink) r.steamLink = st.steamLink;
    // The "Open in Steam" URL: always the Steam store WEBSITE page (https://store.steampowered.com/app/<id>/), never the online-fix.me/ext/ redirect and never steam://.
    // The app id comes from the page's own Steam link when it could be read (sid[]), else from the Steam title search (the same id the artwork uses) — except when the page names
    // ANOTHER store (Microsoft Store, Epic ...): a non-Steam game can match some other game's name, so then there is no button. No id at all = no button.
    const linkUrl = (sid[r.id] && sid[r.id].url) || (st.steamLink && st.steamLink.url) || '';          // known right away; anything else arrives with the app id below
    const finalLink = app => {
      if (sid[r.id] && sid[r.id].url) return sid[r.id].url;
      const l = st.steamLink; if (l && l.url) return l.url;
      if (l && l.ext && !l.sure && links[l.ext] && links[l.ext].miss) return '';                        // an untitled link that was followed and leads somewhere else
      return !st.nonSteam && app ? steamStore(app) : '';
    };
    const facts = []; const modes = modesOf(r, sec); if (modes.length) facts.push({ label: 'Modes', value: modes.join(', ') });
    facts.push(...playerFacts(st.players));
    const rel = ruDate(sec.released); if (rel && !CYR.test(rel)) facts.push({ label: 'Released', value: rel });
    if (sec.via && !CYR.test(sec.via)) facts.push({ label: 'Play via', value: sec.via });
    if (st.downloads.length) dlOpts.set(g.id, Object.assign(st.downloads.slice(), { password: st.password }));

    // 1 · early: everything that needs no network (Russian lines the local table knows are already English)
    const local = sections.map(([, a]) => a.map(x => localTr(ruDate(x))));
    const early = { downloads: st.downloads, password: st.password, facts: facts.slice(), steamUrl: linkUrl, update: upd && plainUpdate(upd) };
    const localGuide = local.every(a => a.every(x => x != null)) ? sections.map(([title], i) => ({ title, steps: local[i] })) : null;
    send(early);                                                              // (media and the guide are NOT in here: they are revealed together below, so one never shows before the other)

    // 2 · Steam (exact app id from the page's own link, else the title search) → art, trailers, screenshots
    const appP = (async () => (sid[r.id] && sid[r.id].app) || (r.steamLink ? await steamFromLink(r) : 0) || r.steam || steamOf(r) || await idOf(r) || 0)().catch(() => 0);
    const detP = appP.then(app => (app ? steamDetails(app) : null)).catch(() => null);   // trailers + screenshots do not need the art ids: asked for as soon as the app id is known
    const steamP = (async () => {
      const app = await appP; if (!app) return null;
      detP.then(d => d && send({ publisher: d.pub || '', ...(g.description ? {} : { description: d.desc || '' }) }));   // (text only: the media goes out through the gate below)
      await wantMeta(app); persist(...ART_KEYS);
      return { app, m: meta[app] || null, d: await detP };
    })().catch(e => { log('steam detail failed', e); return null; });
    const steamPart = (s, withMedia = true) => {
      const out = { steamUrl: finalLink(s && s.app) };
      if (!s) return out;
      out.steamAppId = s.app;
      if (s.m) out.art = { poster: s.m.poster, hero: s.m.hero, logo: s.m.logo, header: s.m.header };
      const dd = s.d || {}; if (withMedia) { out.media = mergeMedia(dd.items || [], st.media); out.siteMedia = st.media; out.publisher = dd.pub || ''; } if (!g.developer) out.developer = (s.m && s.m.dev) || dd.dev || '';
      if (!g.description) out.description = (s.m && s.m.desc) || dd.desc || '';
      return out;
    };
    steamP.then(s => send(steamPart(s, false)));                              // art / logo / developer as soon as they are known; media stays behind the gate

    // 3 · translation (batched), in parallel with Steam. Each part has a deadline and a fallback, so one stuck request can never leave the sheet loading forever.
    const fails0 = trFails; let degraded = false;
    const soft = (p, ms, fb) => new Promise(res => { const t = setTimeout(() => { degraded = true; res(fb); }, ms); p.then(v => { clearTimeout(t); res(v); }, () => { clearTimeout(t); degraded = true; res(fb); }); });
    const stepsP = soft(Promise.all(sections.map(([, a]) => translate(a))), 20000, sections.map(([, a]) => a));
    // 4 · the reveal: media + "How to connect" go out in ONE push, so neither shows before the other (the page's own media used to appear at once and be swapped for Steam's later,
    //     while the guide waited for its translation). Media waits for Steam (max MEDIA_WAIT_MS, then the page's own media), and for the guide (max GUIDE_GATE_MS); a late guide / late Steam media still arrive on their own.
    const MEDIA_WAIT_MS = 1000, GUIDE_GATE_MS = 1500; let gated = false, steamItems = null;
    detP.then(d => { steamItems = (d && d.items) || []; });
    const guideP = localGuide ? Promise.resolve(localGuide) : stepsP.then(t => { const guide = sections.map(([title], i) => ({ title, steps: t[i] })); return guide.every(x => x.steps.every(noRu)) ? guide : null; });
    const mediaP = Promise.race([detP, sleep(MEDIA_WAIT_MS)]);
    Promise.all([mediaP, Promise.race([guideP, sleep(GUIDE_GATE_MS).then(() => null)])]).then(([, guide]) => {
      gated = true; const media = mergeMedia(steamItems || [], st.media), p = { siteMedia: st.media }; if (media.length) p.media = media; if (guide) p.guide = guide; if (p.media || p.guide || p.siteMedia.length) send(p);
    });
    guideP.then(guide => guide && send({ guide }));                           // the guide arrived after the gate closed: show it now (identical content is a no-op in the kit)
    detP.then(d => { if (gated && d && d.items && d.items.length) send({ media: mergeMedia(d.items, st.media), siteMedia: st.media }); });   // Steam answered after the page's own media was shown: swap (the kit fades it)
    const [tSteps, tInfo, tText, tVia, stm] = await Promise.all([
      stepsP,
      g.description || !sec.info.length ? Promise.resolve([]) : soft(translate([sec.info.join(' ').slice(0, 900)]), 20000, []),
      upd && upd.text ? soft(translate([upd.text]), 20000, ['']) : Promise.resolve(['']),
      sec.via && CYR.test(sec.via) ? soft(translate([sec.via]), 20000, ['']) : Promise.resolve(['']),
      soft(steamP, 30000, null)]);
    if (degraded) console.warn('[hearth:online-fix] some requests timed out; the sheet shows what it has (not cached). __hearthOnlineFix.trDiag() / netDiag()', trLog.slice(-4));
    if (tVia[0]) facts.push({ label: 'Play via', value: tVia[0] });
    const sp = steamPart(stm);
    const patch = { ...sp, downloads: st.downloads, password: st.password, guide: sections.map(([title], i) => ({ title, steps: tSteps[i] })), update: upd && { ...upd, text: tText[0] || upd.text }, facts, description: sp.description || tInfo[0] || '' };
    if (trFails === fails0 && !degraded && patchClean(patch)) { storyCache[g.id] = { v: STORY_V, t: Date.now(), patch }; const ks = Object.keys(storyCache); if (ks.length > 80) delete storyCache[ks[0]]; persist('story'); }   // a run where some line failed to translate is shown but not remembered, so the next open tries again
    else if (trFails !== fails0) console.warn('[hearth:online-fix] some lines could not be translated; see __hearthOnlineFix.trDiag()', trLog.slice(-4));
    return patch;
  }
  /** One run per game, shared by the popup and the full page: late subscribers get what has already been pushed, then everything that follows. */
  const detRuns = new Map();
  function resolveDetail(g, push) {
    let run = detRuns.get(g.id);
    if (!run) {
      run = { acc: {}, subs: new Set() };
      const fan = p => { Object.assign(run.acc, p); run.subs.forEach(f => { try { f(p); } catch (e) { log('push failed', e); } }); };
      run.promise = resolveDetailRaw(g, fan).then(r => { if (r) Object.assign(run.acc, r); return r; }, e => { detRuns.delete(g.id); throw e; });
      detRuns.set(g.id, run);
    }
    if (typeof push === 'function') { if (Object.keys(run.acc).length) try { push({ ...run.acc }); } catch (e) { log('push failed', e); } run.subs.add(push); }
    return run.promise;
  }
  function parseStory(doc, url) {
    const k = gameKey(url), root = S.q(SEL.dContent, doc); if (!k || !S.q(SEL.dTitle, doc)) return null;
    const title = S.text(SEL.dTitle, doc), txt = root ? root.textContent.replace(/\s+/g, ' ') : '';
    const rel = (txt.match(/(?:Релиз игры|Game release):\s*\d{1,2}\.\d{1,2}\.(\d{4})/i) || [])[1];
    const info = S.text(SEL.dInfo, root) || (txt.match(/(?:Информация о игре|Game information):\s*(.+?)(?=\s+(?:Файлы для игры|Game files):|$)/i) || [])[1] || '';
    const link = root ? steamLinkOf(root) : null, direct = S.steamAppId(S.attr('a[href*="steampowered.com/app/"]', 'href', root)), og = S.attr('meta[property="og:image"]', 'content', doc);
    return { id: k.id, title: cleanTitle(title) || title, online: hadOnline(title), cat: k.cat, year: rel ? +rel : null, info: info.trim(), note: S.text(SEL.dEdited, doc), steam: (link && link.app) || direct || null, steamLink: link, dl: (storyDownloads(doc)[0] || {}).href || '', opts: storyDownloads(doc), img: og ? S.abs(og, base(doc)) : '', url: S.abs(url) };
  }
  async function scrapeGame() {
    const r = parseStory(document, location.href.split('#')[0]);
    if (!r) throw new Error('game page: title not found');
    readChrome(document);
    put(r); if (r.opts && r.opts.length) dlOpts.set(r.id, r.opts);
    await world({});
    return finish();
  }

  /* ═══ "Get": a dropdown with every download option the game page offers ═══════════════════ */
  const dlOpts = new Map();                                   // game id → [{label, href}]
  async function downloadOptions(g) {
    if (dlOpts.has(g.id)) return dlOpts.get(g.id);
    const doc = await getDoc(g.sourceUrl), o = storyDownloads(doc); o.password = storyPassword(doc);
    if (o.length) dlOpts.set(g.id, o); return o;
  }
  /* ═══ "Get": opens the game's detail sheet (the sheet has the download list). Inside the sheet itself the kit unfolds the list. ═══ */
  function onGet(g, { button } = {}) {
    const app = handle && handle.app;
    if (button && button.closest && button.closest('.sheet')) { window.open(g.downloadUrl || g.sourceUrl, '_blank', 'noopener'); return false; }   // the sheet's own Get had no list to unfold (nothing found): go to the game page
    if (app) app.open(g.id); else window.open(g.sourceUrl, '_blank', 'noopener');
    return false;
  }
  const onOpen = g => { downloadOptions(g).catch(() => {}); landingOpen(g); };   // warm the options while the sheet is read

  /* ═══ "All" really means all: the grid asks for the next page of the site when it runs out ═════ */
  const srcState = {};
  function sourceFor(route) {
    const f = (route && route.filter) || {};
    if (f.saved || f.query || f.sort === 'updated' || f.category === 'updated') return null;      // library / search / the site's fixed update list (50): nothing more to fetch
    if (f.category) {
      const slug = site.cats.find(c => S.slug(c) === f.category); if (!slug) return null;
      return { key: 'cat:' + slug, first: 1, url: n => catUrl(slug, n), rank: catRank(slug) };
    }
    return { key: 'feed', first: [...rank.feed.values()].some(v => v < 1000) ? 2 : 1, url: n => n > 1 ? `${ORIGIN}/page/${n}/` : ORIGIN + '/', rank: rank.feed };   // page 1 is the home page
  }
  async function loadMore(route) {
    const src = sourceFor(route); if (!src) return false;
    const st = srcState[src.key] || (srcState[src.key] = { next: src.first, done: false });
    if (st.done) return false;
    if (st.busy) return st.busy;                                           // one page at a time per source
    st.busy = (async () => {
      const n = st.next++;
      let rs = []; try { rs = feedOf(await getDoc(src.url(n))); } catch (e) { log('load more failed', e); }
      if (!rs.length) { st.done = true; return false; }
      putAll(rs); setRank(src.rank, n, rs.map(r => r.id));
      if (src.key.startsWith('cat:')) rememberCat(src.key.slice(4), rs.map(r => r.id));                  // listed on /games/<slug>/ → in <slug>, whatever folder its own url is in
      return rs.map(r => toGame(raw.get(r.id)));
    })().finally(() => { st.busy = null; });
    return st.busy;
  }

  /* ═══ search: the SITE's own search, shown inside the kit's search UI ═══════════════════════ */
  const searchCache = new Map();
  let searchTimer = 0, searchSeq = 0;
  /** Cards from a results page: the normal feed markup first, then any link to a game as a safety net. */
  function cardsFrom(doc) {
    const rs = feedOf(doc); if (rs.length) return rs;
    const seen = new Map();
    S.qa('#dle-content a[href], .content a[href]', doc).forEach(a => {
      const k = gameKey(S.abs(a.getAttribute('href'), base(a))); if (!k) return;
      const r = seen.get(k.id) || { id: k.id, cat: k.cat, url: S.abs(a.getAttribute('href'), base(a)), title: '', img: '' };
      const im = S.q('img', a), t = S.text(a) || (im && im.getAttribute('alt')) || '';
      if (!r.title && t.length > 2) r.title = t; if (im && !r.img) r.img = S.imgUrl(im); seen.set(k.id, r);
    });
    return [...seen.values()].filter(r => r.title).map(r => ({ ...r, online: hadOnline(r.title), title: cleanTitle(r.title) }));
  }
  const toDoc = (html, url) => { const d = new DOMParser().parseFromString(html, 'text/html'), b = d.createElement('base'); b.href = url; d.head.prepend(b); return d; };
  const postDoc = (url, fields) => new Promise((res, rej) => GM_xmlhttpRequest({
    method: 'POST', url, timeout: 15000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: Object.entries(fields).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
    onload: r => (r.status >= 200 && r.status < 400 ? res(toDoc(r.responseText || r.response, url)) : rej(new Error('HTTP ' + r.status))),
    onerror: () => rej(new Error('network error')), ontimeout: () => rej(new Error('timeout')),
  }));
  /** The site's own search. DLE searches by POST; some setups answer GET instead, so both are tried. */
  async function querySite(q) {
    const tries = [
      ['POST', () => postDoc(`${ORIGIN}/index.php?do=search`, { do: 'search', subaction: 'search', story: q })],
      ['GET', () => getDoc(`${ORIGIN}/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}`)],
    ], errors = [];
    for (const [via, run] of tries) {
      try { const doc = await run(), rs = cardsFrom(doc); if (rs.length) return { rs, via, errors }; errors.push(via + ': 0 results (' + (S.text('#dle-content', doc) || S.text('body', doc)).slice(0, 140).replace(/\s+/g, ' ') + ')'); }
      catch (e) { errors.push(via + ': ' + (e.message || e)); }
    }
    return { rs: [], via: '', errors };
  }
  /** A one-line status under the search results, so it is always clear what the site said. */
  function searchStatus(app, text, busy) {
    const host = app.root.querySelector('.browse'); if (!host) return;
    let el = host.querySelector('.hf-status');
    if (!text) { el && el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'hf-status'; const bh = host.querySelector('.bh'); bh ? bh.after(el) : host.prepend(el); }
    el.classList.toggle('busy', !!busy); el.textContent = text;
  }
  async function siteSearch(app, q) {
    const seq = ++searchSeq, input = () => { const sb = app.root.querySelector('.searchbox'); return sb && sb.querySelector('input'); }, stale = () => seq !== searchSeq || !input() || input().value.trim() !== q;
    searchStatus(app, 'Searching online-fix.me…', true);
    let hit = searchCache.get(q);
    if (!hit) { hit = await querySite(q); if (hit.rs.length) { hit.ids = putAll(hit.rs); searchCache.set(q, hit); } }
    window.__hearthOnlineFix && (window.__hearthOnlineFix.lastSearch = { q, via: hit.via, found: hit.rs.length, errors: hit.errors });
    if (stale()) return;
    if (!hit.rs.length) { console.warn('[hearth:online-fix] site search found nothing for "' + q + '"', hit.errors); searchStatus(app, hit.errors.some(e => /HTTP|network|timeout/.test(e)) ? 'Couldn’t reach the site’s search — showing games already loaded' : 'Nothing found on online-fix.me', false); return; }
    console.info('[hearth:online-fix] site search "' + q + '": ' + hit.rs.length + ' results via ' + hit.via);
    hit.ids.forEach(id => { const t = searchTag.get(id) || new Set(); t.add(q.toLowerCase()); searchTag.set(id, t); });
    await app.add(hit.ids.map(id => toGame(raw.get(id))));                                  // the new games join the running app; the search box is never touched, art is pulled per card
    searchStatus(app, `${hit.rs.length} result${hit.rs.length === 1 ? '' : 's'} from online-fix.me`, false);
  }
  let hookedApp = null;
  function hookSearch(app) {
    app.root.addEventListener('input', e => {
      const inp = e.target; if (!inp || inp.tagName !== 'INPUT' || !inp.closest || !inp.closest('.searchbox')) return;
      clearTimeout(searchTimer); const q = inp.value.trim(); if (q.length < 2) return;
      searchTimer = setTimeout(() => siteSearch(app, q), 450);
    }, true);
  }
  const attach = () => { const a = handle && handle.app; if (a && a !== hookedApp) { hookedApp = a; hookSearch(a); } return !!hookedApp; };
  { let n = 0; const iv = setInterval(() => { if (attach() || ++n > 300) clearInterval(iv); }, 100); }

  /* ═══ account sheet: the avatar opens the kit's own sheet; this fills it from the member's profile page ═══════ */
  const PROF_LABEL = { 'был в сети': 'Last seen', 'последнее посещение': 'Last seen', 'группа': 'Group', 'рейтинг комментариев': 'Comment rating', 'дата регистрации': 'Registered', 'зарегистрирован': 'Registered', 'публикаций': 'Posts', 'новостей': 'Posts', 'комментариев': 'Comments' };
  const PROF_VALUE = { 'участник': 'Member', 'администраторы': 'Administrator', 'администратор': 'Administrator', 'модераторы': 'Moderator', 'модератор': 'Moderator', 'меценат': 'Donator', 'гость': 'Guest' };
  const profLabel = t => PROF_LABEL[String(t).toLowerCase().replace(/\s+/g, ' ').trim().replace(/:$/, '')] || '';
  /** /user/<name>/ → { name, avatarUrl, pairs:[[label, value]], stats:[[label, value]] } (raw, still possibly Russian) */
  function parseProfile(doc) {
    const name = S.text(SEL.pName, doc).replace(/^(?:Профиль участника|Member profile|Profile of)\s*/i, '').trim();
    const img = S.q(SEL.pAvatar, doc);
    const pairs = S.qa(SEL.pVisit, doc).map(el => { const t = S.text(el), i = t.indexOf(':'); return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : null; }).filter(p => p && p[1]);
    const stats = S.qa(SEL.pBlock, doc).map(el => {
      const t = S.text(el); let m = t.match(/^(\d[\d\s,.]*?)\s+(\D.*)$/); if (m) return [m[2].trim(), m[1].trim()];
      m = t.match(/^(\D.*?)\s*[:\s]\s*(\d[\d\s,.]*)$/); return m ? [m[1].trim().replace(/:$/, ''), m[2].trim()] : null;
    }).filter(Boolean);
    return { name, avatarUrl: img ? S.imgUrl(img) : '', pairs, stats };
  }
  /** The header's drop-down (My profile / Bookmarks / Log out) → the sheet's link rows, in English. */
  function profileLinks(menu) {
    return (menu || []).map(m => {
      if (/профил|profile/i.test(m.text)) return { label: 'Your profile on online-fix.me', hint: 'Opens the original page', kind: 'profile', href: m.href };
      if (/закладк|bookmark|favorit/i.test(m.text)) return { label: 'Bookmarks', hint: 'Games you subscribed to on the site', kind: 'bookmarks', href: m.href };
      if (/выход|logout|log out|sign out/i.test(m.text)) return { label: 'Log out', kind: 'logout', href: m.href };
      return null;
    }).filter(Boolean);
  }
  /** Kit hook (ui.resolveProfile): called when the avatar is first clicked. The sheet is already open with the name and avatar; this adds the rest. */
  async function resolveProfile(u) {
    const who = site.user || u, links = profileLinks(who.menu || u.menu);
    let p = null;
    try { p = parseProfile(await getDoc(who.href)); } catch (e) { log('profile fetch failed', e); }
    if (!p) return { name: who.name, avatarUrl: who.avatarUrl, links };
    const need = [];                                                                // anything the maps don't know goes through translate()
    const rows = p.pairs.map(([k, v]) => { const label = profLabel(k) || k, value = ruDate(PROF_VALUE[v.toLowerCase()] || v); need.push(label, value); return [label, value]; });
    const stat = p.stats.map(([k, v]) => { const label = profLabel(k) || k; need.push(label); return [label, v]; });
    const done = await translate(need), tr = new Map(need.map((t, i) => [t, done[i]]));
    const t = x => tr.get(x) || x;
    const group = rows.find(([k]) => k === 'Group');
    return {
      name: p.name || who.name, avatarUrl: p.avatarUrl || who.avatarUrl, badge: group ? t(group[1]) : '',
      stats: stat.map(([k, v]) => ({ label: t(k), value: v })),
      facts: rows.filter(r => r !== group).map(([k, v]) => ({ label: t(k), value: t(v) })),
      links,
    };
  }
  /** Logo lookups that came up empty (the kit shows the title as text then). Inspect with __hearthOnlineFix.misses() */
  const artMisses = [];
  const onArtMiss = (g, kind, urls) => { if (kind === 'logo') artMisses.push({ game: g.title, appId: g.steamAppId || 'none', tried: urls.length, first: urls[0] || '(no url at all)' }); };

  /* ═══ SteamGridDB logo fallback ═══ asked by the kit only when every Steam logo URL failed. Needs an API key (free: steamgriddb.com → Preferences → API).
     Tries the Steam app id first, then a search by name (new / unlisted games often have no Steam mapping on SteamGridDB yet). */
  const SGDB_KEY = 'hf:sgdbKey', SGDB_CACHE = 'hf:sgdbLogos2', SGDB_TTL = 3 * 864e5, SGDB = 'https://www.steamgriddb.com/api/v2';
  const sgdb = jget(SGDB_CACHE, {}), sgdbLog = [];
  const sgdbNote = (title, step, info) => { sgdbLog.push({ t: new Date().toLocaleTimeString(), game: title, step, info: String(info) }); if (sgdbLog.length > 40) sgdbLog.shift(); };
  const sgdbGet = (path, key) => new Promise((res, rej) => GM_xmlhttpRequest({
    method: 'GET', url: SGDB + path, timeout: 15000, headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    onload: r => { if (r.status !== 200) { const e = new Error('HTTP ' + r.status); e.status = r.status; return rej(e); } try { res(JSON.parse(r.responseText)); } catch (e) { rej(e); } },
    onerror: () => rej(new Error('network error (is steamgriddb.com allowed in Tampermonkey?)')), ontimeout: () => rej(new Error('timeout')),
  }));
  const bestLogo = j => ((j && j.data) || []).filter(x => x && x.url).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const sgdbPending = {}, sgdbLimit = limiter(2); let sgdbBad = 0, sgdbPause = 0;
  async function resolveLogoInner(g) {
    const key = String(jget(SGDB_KEY, '') || '').trim();
    if (!key) { sgdbNote(g.title, 'skip', 'no API key set (Tampermonkey menu → Set SteamGridDB API key)'); return ''; }
    if (Date.now() < sgdbPause) { sgdbNote(g.title, 'skip', 'paused after repeated network failures'); return ''; }
    const app = g.steamAppId || (sid[g.id] && sid[g.id].app) || 0, ck = app ? 'a' + app : 'n' + norm(g.title);
    const c = sgdb[ck]; if (c && Date.now() - c.t < (c.u ? 365 * 864e5 : SGDB_TTL)) return c.u;
    return sgdbPending[ck] || (sgdbPending[ck] = sgdbLimit(async () => {
      let url = '', failed = false;
      try {
        if (app) { try { const b = bestLogo(await sgdbGet('/logos/steam/' + app + '?types=static&nsfw=false', key)); if (b) url = b.url; sgdbNote(g.title, 'steam id ' + app, b ? 'found' : 'no logos'); } catch (e) { if (e.status === 401 || e.status === 403) throw e; if (e.status !== 404) failed = true; sgdbNote(g.title, 'steam id ' + app, e.message); } }
        if (!url) {                                               // by name
          const sr = await sgdbGet('/search/autocomplete/' + encodeURIComponent(g.title), key);
          const hit = ((sr && sr.data) || []).map(x => ({ x, sc: score(g.title, x.name) })).filter(o => o.sc >= 0.75).sort((a, b) => b.sc - a.sc)[0];
          if (hit) { const b = bestLogo(await sgdbGet('/logos/game/' + hit.x.id + '?types=static&nsfw=false', key)); if (b) url = b.url; sgdbNote(g.title, 'name → ' + hit.x.name, b ? 'found' : 'no logos'); }
          else sgdbNote(g.title, 'name', 'no match for "' + g.title + '" (' + ((sr && sr.data) || []).length + ' results)');
        }
      } catch (e) { failed = true; sgdbNote(g.title, 'error', e.message + (e.status === 401 ? ' — wrong API key' : '')); if (e.status === 401 || e.status === 403) console.warn('[hearth:online-fix] SteamGridDB rejected the API key (' + e.message + ')'); }
      if (!failed || url) { sgdb[ck] = { u: url, t: Date.now() }; jset(SGDB_CACHE, sgdb); sgdbBad = 0; }   // network trouble is not remembered
      else if (++sgdbBad >= 3) { sgdbPause = Date.now() + 3e5; sgdbBad = 0; }
      return url;
    }).finally(() => { delete sgdbPending[ck]; }));
  }
  /** What the kit calls: the real lookup keeps running (and caches) in the background, the caller waits at most 6 s. */
  const resolveLogo = g => new Promise(res => { const t = setTimeout(() => { sgdbNote(g.title, 'deadline', 'gave up waiting after 6 s (lookup continues in the background)'); res(''); }, 6000); resolveLogoInner(g).then(u => { clearTimeout(t); res(u); }, () => { clearTimeout(t); res(''); }); });
  try { GM_registerMenuCommand('Set SteamGridDB API key', () => { const k = prompt('SteamGridDB API key (steamgriddb.com → Preferences → API):', jget(SGDB_KEY, '')); if (k !== null) { jset(SGDB_KEY, k.trim()); jset(SGDB_CACHE, {}); alert('Saved. Reload the page.'); } }); } catch (e) { /* menu unavailable */ }

  /** 20 s after load: if any host was slow or failing, say which (so a throttled host is obvious without opening anything). */
  setTimeout(() => {
    const by = {}; for (const n of netLog) { const h = by[n.host] || (by[n.host] = { ok: 0, bad: 0, last: '' }); if (n.result === 'ok') h.ok++; else { h.bad++; h.last = n.result; } }
    const bad = Object.entries(by).filter(([, h]) => h.bad >= 2);
    if (bad.length) console.warn('[hearth:online-fix] failing hosts in the first 20 s:', Object.fromEntries(bad.map(([k, h]) => [k, h.bad + ' failed / ' + h.ok + ' ok (last: ' + h.last + ')'])), '\nfull list: __hearthOnlineFix.netDiag()');
  }, 20000);

  /* ═══ glue ══════════════════════════════════════════════════════════════════════════════════ */
  const path = u => new URL(u).pathname;
  const saved = new Set(jget('hf3:saved', []));
  try { if (!String(GM_getResourceText('hearthCss') || '').includes('a.btn { text-decoration: none; }')) console.warn('[hearth:online-fix] hearth.css is older than the pinned kit commit: reinstall the script (Tampermonkey keeps @resource until the script is re-installed). __hearthOnlineFix.kitDiag()'); } catch (e) { /* no resource */ }
  handle = HearthGlue.run({
    name: 'online-fix', css: GM_getResourceText('hearthCss'), debug: DEBUG, hide: 'display', failTimeoutMs: 15000,
    splash: { title: 'Online', accentTitle: '-Fix', letter: 'O', logo: 'https://online-fix.me/templates/FixLand/images/oflogo.gif', accent: '#1ea7e0', ink: '#04141c' },
    routes: [
      { id: 'game', match: u => P.game(path(u)), ready: SEL.dTitle, scrape: scrapeGame, view: () => ({ open: (gameKey(location.href) || {}).id }) },
      { id: 'updates', match: u => P.updates(path(u)), ready: SEL.updCard, scrape: scrapeUpdates, view: { view: 'browse', filter: { sort: 'updated' } } },
      { id: 'category', match: u => P.category(path(u)), ready: feedReady, scrape: scrapeCategory, view: () => ({ view: 'browse', filter: { category: S.slug(catSlugOfPath(location.pathname) || '') } }) },
      { id: 'home', match: u => P.home(path(u)) && !new URL(u).search, ready: feedReady, scrape: scrapeHome, view: { view: 'home' } },
    ],
    ui: {
      theme: { ac: '#1ea7e0', ink: '#04141c' },
      saved: [...saved],
      onSave: (g, on) => { on ? saved.add(g.id) : saved.delete(g.id); jset('hf3:saved', [...saved]); },
      resolveProfile,      // the avatar opens the kit's own account sheet (kit >= 0.3); nothing navigates away
      onArtMiss, resolveLogo,
      onPage: g => openPage(g.id),          // the sheet's "Full page" button (the kit draws it)
      onGet, onOpen, loadMore,
      resolveArt,
      resolveDetail,     // downloads / how-to-connect / update info for the sheet (kit >= 0.3)         // art is pulled per card (skeleton until it arrives); nothing is re-rendered when it does
      onRoute: () => { attach(); },
    },
  });

  /** Quietly learns what is in the categories the home feed barely covers (see 0.9.14). Never touches Browse: games are merged only while the app shows the home page. */
  const WARM_CATS = true;
  let warmStarted = false;
  function warmCategories() {
    if (!WARM_CATS || warmStarted || !(P.home(location.pathname) || P.category(location.pathname) || P.updates(location.pathname))) return;
    const app = handle && handle.app; if (!app || !site.cats.length) { setTimeout(warmCategories, 1500); return; }
    warmStarted = true;
    const pend = [];
                                 // kit >= page-12: a quiet add never repaints Browse (no grid reset), it only refreshes the category picker, so it is safe on any page
    const flush = () => { if (pend.length) app.add(pend.splice(0).map(id => raw.get(id)).filter(Boolean).map(toGame), { quiet: true }); };
    const known = slug => { const k = S.slug(slug); let n = 0; raw.forEach(r => { if (r.cat === slug || (catOf.get(String(r.id)) || new Set()).has(k)) n++; }); return n; };
    (async () => {
      await sleep(2500); let got = 0;                            // flushed every 3 categories (each merge may rebuild the picker) and once more at the end
      for (const slug of site.cats.slice()) {
        if (known(slug) >= 6) continue;
        while (document.hidden) await sleep(2000);
        await quiet(1000);
        try {
          const rs = feedOf(await getDoc(catUrl(slug, 1)));
          if (rs.length) { const ids = putAll(rs); rememberCat(slug, ids); setRank(catRank(slug), 1, ids); pend.push(...ids); if (++got % 3 === 0) { await quiet(600, 5000); flush(); } }
        } catch (e) { log('category warm-up failed', slug, e); }
        await sleep(700);
      }
      flush();
      for (let i = 0; i < 30 && pend.length; i++) { flush(); await sleep(2000); }          // still on Browse? try again for a minute, then let the next visit pick them up
    })();
  }
  warmCategories();
  /** The first visit to Games asks for page 2 at once (page 1 holds 21 games, the grid shows 24 per step): fetch and parse it while idle so that visit finds it ready. */
  if (ROUTED(location.pathname) && !location.search) (async () => { await sleep(2000); await quiet(1200); try { await getDoc(`${ORIGIN}/page/2/`); } catch (e) { log('page 2 prefetch failed', e); } })();

  /* ═══ full game page (v0.10.0) ═══════════════════════════════════════════════════════════════
     A store-style page next to the popup sheet: gallery, about, Steam rating + reviews, the site's own comments, requirements, install guide, downloads.
     It lives inside the kit's shadow root (same tokens: --bg --s1 --s2 --line --ac --fd --fb), so it follows the theme. Opened from the sheet's "Full page" button,
     or straight away when you land on a game URL (PAGE_ON_GAME_URL). Esc / Back closes it. Needs nothing from the kit except app.root / app.close().
     Extra requests, all on demand and cached: Steam appdetails (1 per game, 24 h), Steam appreviews (+ histogram) and the game page's comment pages on online-fix.me. */
  const PAGE_ON_GAME_URL = true;                             // false = landing on a game URL opens the popup as before
  const COMMENTS_AUTO_TRANSLATE = false;                     // true = translate the site's comments to English as they load (one request per batch)
  const STORE_KEY = 'hf9:store', STORE_TTL = 864e5, storeCache = jget(STORE_KEY, {});
  const httpsOnly = u => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');
  const fmtN = n => (n == null || isNaN(n) ? '' : Number(n).toLocaleString('en-US'));
  const tmpl = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

  /** Steam's HTML snippets (about_the_game, requirements) → plain text / key-value rows. No HTML from Steam is ever put on the page. */
  /** Steam's "About this game" as ordered blocks: headings, paragraphs / list items, section images and the muted clips Steam shows for animations. */
  const asHttps = u => { u = String(u || '').trim(); if (u.startsWith('//')) u = 'https:' + u; return /^https?:\/\//i.test(u) ? u.replace(/^http:/i, 'https:') : ''; };   // Steam's own HTML often has http: or protocol-relative links
  function aboutBlocks(html) {
    const out = []; let buf = '';
    const flush = () => { const t = buf.replace(/[ \t\r\n]+/g, ' ').trim(); if (!t || t === '•') return; out.push({ t: t.slice(0, 1500) }); buf = ''; };   // a bare bullet waits for its text
    const walk = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { buf += c.data; continue; } if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (tag === 'IMG') { flush(); const u = asHttps(c.getAttribute('src') || c.getAttribute('data-src')); if (u) out.push({ img: u, alt: (c.getAttribute('alt') || '').slice(0, 120) }); }
        else if (tag === 'VIDEO') { flush(); const so = c.querySelector('source[type*="mp4"]') || c.querySelector('source'), u = asHttps(c.getAttribute('src') || (so && so.getAttribute('src'))); if (u) out.push({ vid: u, poster: asHttps(c.getAttribute('poster')) }); }
        else if (/^H[1-4]$/.test(tag)) { flush(); const t = c.textContent.trim(); if (t) out.push({ h: t.slice(0, 160) }); }
        else if (tag === 'LI') { flush(); buf = '• '; walk(c); flush(); }
        else if (/^(P|DIV|UL|OL|BR|TABLE|TR)$/.test(tag)) { flush(); walk(c); flush(); }
        else if (!/^(SCRIPT|STYLE|IFRAME)$/.test(tag)) walk(c);
      }
    };
    walk(tmpl(String(html || ''))); flush();
    return out.slice(0, 60);
  }
  function aboutText(html) {
    const f = tmpl(String(html || ''));
    f.querySelectorAll('script,style,img,video,iframe').forEach(n => n.remove());
    f.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    f.querySelectorAll('h1,h2,h3').forEach(n => n.replaceWith('\n##' + n.textContent.trim() + '\n'));
    f.querySelectorAll('li').forEach(n => n.prepend('\n• '));
    f.querySelectorAll('p,div,ul').forEach(n => n.append('\n'));
    return f.textContent.split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 24).join('\n').slice(0, 4200);
  }
  function reqRows(html) {
    const out = {}; tmpl(String(html || '')).querySelectorAll('li').forEach(li => {
      const b = li.querySelector('strong'), k = b ? b.textContent.replace(/:\s*$/, '').trim() : '';
      if (k) { const v = li.textContent.replace(b.textContent, '').replace(/\s+/g, ' ').trim(); if (v) out[k] = v; }
    });
    return out;
  }
  /** Steam store details (about + images, trailers, screenshots, facts). One request per game even when the sheet and the page ask at once; it ignores the throttle pause (it is one request),
      is retried once, and a failure is remembered (__hearthOnlineFix.pageDiag()). Stale cache entries from before the media fields existed are never returned. */
  const storeBusy = {}, storeWhy = {}, STORE_SHAPE = 3;   // bump when what is stored per game changes: older cache entries are then fetched again
  function storeInfo(app) {
    const c = storeCache[app]; if (c && c.d.v === STORE_SHAPE && Date.now() - c.t < STORE_TTL) return Promise.resolve(c.d);
    return storeBusy[app] || (storeBusy[app] = storeFetch(app, c).finally(() => { delete storeBusy[app]; }));
  }
  async function storeFetch(app, c) {
    let j, err;
    for (let i = 0; i < 2 && !j; i++) { try { j = await fjson(`https://store.steampowered.com/api/appdetails?appids=${app}&l=english&cc=us`, true, appRef(app)); } catch (e) { err = e; if (!i) await sleep(1200); } }
    const x = j && j[app] && j[app].success && j[app].data;
    if (!x) { storeWhy[app] = String(err ? (err.message || err) : 'Steam has no store data for this app').slice(0, 160); log('store details failed', app, storeWhy[app]); return c && c.d.v === STORE_SHAPE ? c.d : null; }
    delete storeWhy[app];
    const names = a => (a || []).map(o => o && o.description).filter(Boolean);
    const d = {
      v: STORE_SHAPE, blocks: aboutBlocks(x.about_the_game || x.detailed_description), media: steamMedia(x), short: x.short_description || '', header: httpsOnly(x.header_image), capsule: httpsOnly(x.capsule_image),
      release: (x.release_date && x.release_date.date) || '', soon: !!(x.release_date && x.release_date.coming_soon), free: !!x.is_free,
      devs: x.developers || [], pubs: x.publishers || [], genres: names(x.genres), cats: names(x.categories),
      meta: x.metacritic ? { score: x.metacritic.score, url: httpsOnly(x.metacritic.url) } : null, recs: x.recommendations ? x.recommendations.total : 0,
      ach: x.achievements ? x.achievements.total : 0, age: x.required_age ? String(x.required_age) : '', web: httpsOnly(x.website),
      langs: String(x.supported_languages || '').replace(/<br>[\s\S]*$/i, '').replace(/<[^>]+>/g, '').replace(/\*/g, '').split(',').map(s => s.trim()).filter(Boolean),
      min: reqRows(x.pc_requirements && x.pc_requirements.minimum), rec: reqRows(x.pc_requirements && x.pc_requirements.recommended),
      notes: ((x.content_descriptors && x.content_descriptors.notes) || '').slice(0, 400),
    };
    storeCache[app] = { t: Date.now(), d }; const ks = Object.keys(storeCache); if (ks.length > 40) delete storeCache[ks[0]]; jset(STORE_KEY, storeCache);
    return d;
  }
  /** Steam reviews. Summary + month histogram once per page; the list in pages of 10 (cursor), by "helpful" / "recent" and all / positive / negative. */
  const revUrl = (app, o) => `https://store.steampowered.com/appreviews/${app}?json=1&language=${o.lang || 'english'}&purchase_type=all&filter=${o.filter || 'all'}&review_type=${o.type || 'all'}&num_per_page=${o.n == null ? 10 : o.n}&cursor=${encodeURIComponent(o.cursor && o.cursor !== '*' ? o.cursor : '*')}`;
  const appRef = app => `https://store.steampowered.com/app/${app}/`;
  const revSummary = async app => { const j = await fjson(revUrl(app, { n: 0, lang: 'all' }), false, appRef(app)); return j && j.query_summary ? j.query_summary : null; };
  const revHist = async app => { const j = await fjson(`https://store.steampowered.com/appreviewhistogram/${app}?l=english&review_score_preference=0`, false, appRef(app)); const r = j && j.results && j.results.rollups; return (r || []).slice(-36).map(x => ({ d: x.date, up: x.recommendations_up || 0, down: x.recommendations_down || 0 })); };
  const revList = async (app, o) => { const j = await fjson(revUrl(app, o), true, appRef(app)); if (j && j.success === 0) throw new Error('Steam: no reviews payload'); return { items: ((j && j.reviews) || []).map(r => ({ id: r.recommendationid, up: !!r.voted_up, text: String(r.review || '').trim().slice(0, 1800), t: r.timestamp_created, hrs: r.author && r.author.playtime_forever ? r.author.playtime_forever / 60 : 0, votes: r.votes_up || 0, funny: r.votes_funny || 0 })).filter(r => r.text), cursor: (j && j.cursor) || '' }; };

  /** The list is the one request that must not silently die: it ignores the throttle pause, the first page falls back to "all languages", and when Steam keeps answering with a web page
      instead of JSON the community's own review page (steamcommunity.com, plain HTML, already in @connect) is read instead. Its "cursor" is just the next page number. */
  async function revListRetry(app, o) {
    const first = !o.cursor || o.cursor === '*', langs = first ? ['english', 'all'] : ['english', 'english']; let last;
    for (let i = 0; i < langs.length; i++) { try { return await revList(app, { ...o, lang: langs[i] }); } catch (e) { last = e; if (/HTTP|network|timeout/.test(e.message)) break; if (i < langs.length - 1) await sleep(700); } }
    throw last;
  }
  const num0 = t => { const m = String(t || '').replace(/[,.\s]/g, '').match(/\d+/); return m ? +m[0] : 0; };
  async function revListHtml(app, o) {
    const page = o.cursor && o.cursor !== '*' && /^\d+$/.test(o.cursor) ? +o.cursor : 1;
    const doc = await tmo(S.fetchDoc(`https://steamcommunity.com/app/${app}/reviews/?p=${page}&browsefilter=${o.filter === 'recent' ? 'mostrecent' : 'toprated'}&filterLanguage=english&l=english`), 20000, 'https://steamcommunity.com/app/');
    const cards = S.qa('.apphub_Card', doc);
    const items = cards.map((c, i) => {
      const body = S.q('.apphub_CardTextContent', c); if (!body) return null;
      const when = (S.text('.date_posted', c) || '').replace(/^\s*Posted:?\s*/i, '');
      const cl = body.cloneNode(true); cl.querySelectorAll('.date_posted,.received_compensation').forEach(n => n.remove());
      const up = !/not recommended/i.test(S.text('.title', c) || ''), id = ((c.getAttribute('data-modal-content-url') || (S.q('a[href*="/recommended/"]', c) || { getAttribute: () => '' }).getAttribute('href') || '').match(/(\d{5,})\/?$/) || [])[1] || `h${page}-${i}`;
      return { id, up, text: cl.textContent.replace(/\s+/g, ' ').trim().slice(0, 1800), when, hrs: parseFloat((S.text('.hours', c).match(/[\d.,]+/) || ['0'])[0].replace(',', '')) || 0, votes: num0(S.text('.found_helpful', c)), funny: 0 };
    }).filter(r => r && r.text && (o.type === 'all' || !o.type || (o.type === 'positive') === r.up));
    if (!cards.length) throw new Error('community page had no review cards');
    return { items, cursor: String(page + 1) };
  }
  const revListAny = async (app, o) => {
    if (o.html) return revListHtml(app, o);                                  // this list already switched to the community page
    try { return await revListRetry(app, o); } catch (e) {
      if (!/not JSON|HTTP|network|timeout/.test(e.message)) throw e;
      log('steam JSON reviews failed, reading the community page', e.message);
      const r = await revListHtml(app, { ...o, cursor: '*' }); r.html = true; return r;
    }
  };
  /** Summary for the rating card: the JSON, else read from the store page's own "x% of the n user reviews are positive" line. */
  async function revSummaryAny(app) {
    try { return await revSummary(app); } catch (e) {
      const doc = await tmo(S.fetchDoc(`https://store.steampowered.com/app/${app}/?l=english&cc=us`), 20000, 'https://store.steampowered.com/app/');
      const row = S.qa('.user_reviews_summary_row[data-tooltip-html]', doc).pop(); if (!row) throw e;
      const tip = row.getAttribute('data-tooltip-html') || '', m = tip.match(/(\d+)%\s+of\s+the\s+([\d,.\s]+)\s+user reviews/i); if (!m) throw e;
      const total = num0(m[2]), pos = Math.round(total * +m[1] / 100);
      return { total_reviews: total, total_positive: pos, total_negative: total - pos, review_score_desc: (S.text('.game_review_summary', row) || '').trim() };
    }
  }

  /** The site's own comments (DataLife Engine). The comment markup is not in the skeleton (children omitted), so this reads the standard DLE ids (#comment-id-N, #comm-id-N) and falls back to text. */
  const RU_REL = [[/^Сегодня/i, 'Today'], [/^Вчера/i, 'Yesterday']];
  function parseComment(el) {
    const id = el.id.replace('comment-id-', ''), body = el.querySelector('[id^="comm-id-"]');
    const a = [...el.querySelectorAll('a[href*="/user/"]')].find(x => x.textContent.trim());
    const av = [...el.querySelectorAll('img')].map(i => S.imgUrl(i)).find(u => u && /\/fotos\/|noavatar|gravatar/i.test(u));
    let text = '';
    if (body) { const c = body.cloneNode(true); c.querySelectorAll('br').forEach(n => n.replaceWith('\n')); c.querySelectorAll('.quote,blockquote').forEach(n => n.prepend('> ')); c.querySelectorAll('script,style').forEach(n => n.remove()); text = c.textContent; }
    else { const c = el.cloneNode(true); c.querySelectorAll('a[href*="/user/"],img,script,style,button,form').forEach(n => n.remove()); text = c.textContent; }
    text = text.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 1400);
    const dm = el.textContent.replace(/\s+/g, ' ').match(/(\d{1,2}\s+[а-яё]+\s+\d{4}(?:,?\s*\d{1,2}:\d{2})?|(?:Сегодня|Вчера),?\s*\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{4}(?:,?\s*\d{1,2}:\d{2})?)/i);
    let when = dm ? ruDate(dm[1]) : ''; for (const [re, en] of RU_REL) when = when.replace(re, en);
    return { id, name: a ? a.textContent.trim() : 'Guest', href: a ? S.abs(a.getAttribute('href'), base(a)) : '', av: av ? httpsOnly(av) : '', text, when };
  }
  function commentsOf(doc) {
    const items = S.qa('#dle-comments-list [id^="comment-id-"], .comments-list [id^="comment-id-"]', doc).filter(e => /^comment-id-\d+$/.test(e.id)).map(parseComment).filter(c => c.text);
    const t = (S.text('.comments', doc).match(/(\d+)/) || [])[1];
    // the site's own pager: the current page is a <span>, every other page an <a>; the links carry the URL pattern (page,<n>,<comment page>,<id>-slug.html)
    const nav = S.q('nav.pagination', doc), links = {}; let cur = 1, pages = 1, tpl = '';
    if (nav) {
      const num = x => (/^\d+$/.test(x.textContent.trim()) ? +x.textContent.trim() : 0);
      S.qa('span', nav).forEach(x => { const n = num(x); if (n) { cur = n; pages = Math.max(pages, n); } });
      S.qa('a[href]', nav).forEach(a => { const n = num(a); if (n) { pages = Math.max(pages, n); links[n] = S.abs(a.getAttribute('href'), base(a)); } });
      const any = S.qa('a[href]', nav).map(a => a.getAttribute('href')).find(h => /page,\d+,\d+,\d+-/.test(h));
      if (any) tpl = S.abs(any.replace(/page,(\d+),(\d+),/, 'page,$1,__N__,'), base(nav));
    }
    return { items, total: t ? +t : null, cur, pages, links, tpl };
  }

  /* ── page state + view ───────────────────────────────────────────────────────────────────── */
  // Every visual of the page (markup, CSS, icons, motion) is the kit's: HearthUI.parts.page / morphInto / swapRegion. This code only decides WHAT to paint WHEN.
  const KP = (typeof HearthUI !== 'undefined' && HearthUI.parts) || null, PK = KP && KP.page;
  let PG = null;                                              // the open page's state (null = closed)
  const rootOf = () => { const a = handle && handle.app; return a && a.root; };
  const rg = (k, inner) => `<div class="rg" data-k="${k}">${inner}</div>`;
  const sect = (id, html) => { const el = PG && PG.el.querySelector('#dp-' + id); if (el) KP.morphInto(el, html, { animate: true, ghost: true }); };
  const commBody = () => PG.el.querySelector('#dp-comm .dp-body');

  /** Same order as the popup / hero: the art ids' own logo, Steam's logo.png, then the SteamGridDB lookup (cached; only when the others failed). */
  function askLogo(kind) {
    const pg = PG; if (kind !== 'logo' || !pg || pg.sgdbAsked) return; pg.sgdbAsked = true;
    resolveLogo({ id: String(pg.g.id), title: pg.g.title, steamAppId: pg.app || pg.g.steamAppId || 0 }).then(u => { if (PG === pg && u) { pg.sgdb = u; paintHead(); } }).catch(() => {});
  }
  function paintHead() {
    const { g, vm, store: st } = PG, art = { ...(g.art || {}), ...(vm.art || {}) }, app = PG.app || vm.steamAppId || g.steamAppId || 0, S_ = HearthUI.steam;
    PK.art(PG.el, { hero: [art.hero, app && S_.hero(app), art.header, st && st.header, app && S_.header(app), art.fallback], logo: [art.logo, app && S_.logo(app), PG.sgdb] }, PG.doneDetail && PG.storeDone, askLogo);
  }
  function paintMedia() {
    const waiting = PG.app && !PG.storeDone, steam = (PG.store && PG.store.media) || [];       // Steam's own trailers + screenshots; the site's media only when Steam has none of that kind
    const items = waiting ? [] : mergeMedia(steam, (PG.vm.siteMedia || []).filter(m => m && (m.thumb || m.src))); PG.items = items;
    const key = items.map(m => m.src || (m.sources && m.sources[0] && m.sources[0].src)).join('|');
    if (!items.length) { const k = waiting || !PG.doneDetail ? 'sk' : 'none'; if (PG.mkey !== k) { PG.mkey = k; sect('media', k === 'sk' ? PK.skel('stage', 1, 'msk') : ''); } return; }
    if (PG.mkey === key) return; PG.mkey = key; PG.mi = Math.min(PG.mi || 0, items.length - 1);
    sect('media', rg('m' + items.length + ':' + key.length, PK.stage(items, PG.mi))); PK.mediaReady(PG.el);
  }
  function paintAbout() {
    const st = PG.store, txt = (st && st.blocks && st.blocks.length ? st.blocks : null) || PG.vm.description || PG.g.description || '';
    if (!txt || !txt.length) return sect('about', PG.storeDone ? '' : rg('ask', '<h4>About</h4>' + PK.skel('about')));
    sect('about', rg('about', PK.about(txt)));
    PK.imgReady(PG.el);
    if (PG.aboutOpen) PK.expand(PG.el.querySelector('#dp-about .dp-clampbox'), false);     // (the button stays, as "Read less")
  }
  const paintUpdate = () => sect('upd', KP.updHtml(PG.vm.update));
  function paintGuide() {
    const gd = PG.vm.guide, h = KP.guideHtml({ guide: gd || [] }, !PG.doneDetail, 'How to install & play online');
    sect('guide', h ? rg(gd && gd.length ? 'guide' : 'gsk', h) : '');
  }
  function paintReq() { const st = PG.store, h = st && KP.reqHtml({ minimum: st.min, recommended: st.rec }); sect('req', h ? rg('req', h) : ''); }
  /** Side panel: the popup's own blocks (Get box, Save + Open in Steam, facts) + the Steam rating. The rating card appears when the numbers arrive, nothing is shown (or reserved) before. */
  function paintSide() {
    const { g, vm, store: st } = PG, gb0 = PG.el.querySelector('#dp-side .getbox'); if (gb0) PG.dlOpen = gb0.classList.contains('open');
    const kg = { id: String(g.id), downloads: vm.downloads || [], size: vm.size || g.size || '', password: vm.password || '', steamUrl: httpsOnly(vm.steamUrl || g.steamUrl), guide: vm.guide || [] };
    const facts = (vm.facts || g.facts || []).map(f => [f.label, f.value]);
    const add = (k, v) => { if (v && !facts.some(([a]) => a === k)) facts.push([k, v]); };
    if (st) { add('Developer', st.devs.join(', ')); add('Publisher', st.pubs.join(', ')); add('Released', st.release); add('Genre', st.genres[0]); if (st.meta) add('Metacritic', String(st.meta.score)); if (st.recs) add('Recommendations', fmtN(st.recs)); if (st.ach) add('Achievements', fmtN(st.ach)); if (st.age) add('Age', st.age + '+'); if (st.langs.length) add('Languages', st.langs.length > 4 ? st.langs.length + ' supported' : st.langs.join(', ')); }
    else { add('Developer', vm.developer || g.developer); add('Publisher', vm.publisher || g.publisher); add('Released', g.releaseYear); add('Genre', (g.genres || [])[0]); }
    const rate = PK.rating(PG.sum);
    sect('side', rg('get', KP.getBox(kg, { pending: !PG.doneDetail, dlOpen: false })) + rg('acts', KP.actsHtml(kg, saved.has(g.id))) + (rate ? rg('rate', rate) : '') + KP.factsHtml(facts));
    const gb = PG.el.querySelector('#dp-side .getbox'); if (gb && PG.dlOpen) { gb.classList.add('open'); const b = gb.querySelector('.btn'); if (b) b.setAttribute('aria-expanded', 'true'); }
  }

  function paintCommunity() {
    const R = PG.rev, C = PG.com, tab = PG.tab, hasSteam = !!PG.app, nSteam = PG.sum && PG.sum.total_reviews ? ' · ' + fmtN(PG.sum.total_reviews) : '';
    const tabs = PK.tabs({
      tabs: [...(hasSteam ? [{ id: 'steam', label: 'Steam reviews' + nSteam }] : []), { id: 'site', label: 'Online-Fix comments' + (C.total != null ? ' · ' + C.total : '') }], tab,
      sels: tab === 'steam' && hasSteam ? [{ attr: 'data-dp-f', cur: R.filter, items: [['all', 'Helpful'], ['recent', 'Recent']] }, { attr: 'data-dp-t', cur: R.type, items: [['all', 'All'], ['positive', 'Positive'], ['negative', 'Negative']] }] : [],
      btn: tab === 'site' && C.items.some(c => CYR.test(c.text)) ? { act: 'trall', label: 'Translate all' } : null,
    });
    let body;
    if (tab === 'steam') {
      const none = R.err ? PK.note('Steam didn’t return any review data.', { act: 'rretry', label: 'Try again', hint: R.why, link: { href: `https://store.steampowered.com/app/${PG.app}/#app_reviews_hash`, label: 'Open the reviews on Steam' } }) : PK.note('No reviews for this filter.');
      body = `<div class="dp-body${R.busy && R.items.length ? ' dim' : ''}" data-k="b-steam" data-morph>${PG.hist ? PK.hist(PG.hist) : ''}${R.items.length ? R.items.map(PK.review).join('') : R.busy ? PK.skel('rev', 2) : none}${R.items.length && R.cursor && !R.done ? PK.more(R.busy ? 'Loading…' : 'Load more reviews', R.busy) : ''}</div>`;
    } else {
      const card = c => { const tr = C.tr[c.id]; return PK.comment(c, tr || c.text, tr ? 'Show original' : CYR.test(c.text) ? 'Translate' : ''); };
      const none = C.err ? PK.note('Could not read the comments from online-fix.me.', { act: 'cretry', label: 'Try again' }) : PK.note('No comments yet.');
      body = `<div class="dp-body${C.busy && C.items.length ? ' dim' : ''}" data-k="b-site" data-morph>${PK.pager(C.page, C.pages, 'pgt')}${C.items.length ? C.items.map(card).join('') : C.busy ? PK.skel('com', 3) : none}${PK.pager(C.page, C.pages)}${PK.link(PG.g.sourceUrl + '#comments', 'Write a comment on online-fix.me', 'wr')}</div>`;
    }
    sect('comm', `<div class="rg" data-k="c" data-morph><h4 data-k="h" data-na>Community</h4>${tabs}${body}</div>`);
    PG.el.querySelectorAll('.dp-th2 img:not([data-e])').forEach(i => { i.dataset.e = '1'; i.addEventListener('error', () => i.remove(), { once: true }); });
    PG.el.querySelectorAll('.dp-rev[data-id]').forEach(c => { if (PG.revOpen.has(c.dataset.id)) PK.expand(c.querySelector('.dp-rt'), false, c.querySelector('[data-dp-act="rmore"]')); });
  }
  const paintAll = () => { if (!PG) return; paintHead(); paintMedia(); paintAbout(); paintUpdate(); paintGuide(); paintReq(); paintSide(); paintCommunity(); };

  /* ── data loading ─────────────────────────────────────────────────────────────────────────── */
  async function loadSteamReviews(first) {
    const R = PG.rev, pg = PG; if (!pg.app || (!first && R.busy)) return;
    const seq = first ? ++R.seq : R.seq; R.busy = true; R.err = false; R.why = '';
    if (first) { R.items = []; R.cursor = '*'; R.done = false; R.html = false; }
    paintCommunity();
    try {
      const r = await revListAny(pg.app, { filter: R.filter, type: R.type, cursor: R.cursor || '*', html: R.html });
      if (r.html) R.html = true;
      if (PG !== pg || R.seq !== seq) return;
      const seen = new Set(R.items.map(x => x.id)); R.items.push(...r.items.filter(x => !seen.has(x.id)));
      R.done = !r.items.length || !r.cursor || r.cursor === R.cursor; R.cursor = r.cursor;
    } catch (e) { if (R.seq === seq) { R.err = true; R.why = String((e && e.message) || e).slice(0, 140); } log('reviews failed', e); }
    if (R.seq !== seq) return;
    R.busy = false; if (PG === pg) paintCommunity();
  }
  /** Comment page n: from the cache, else fetched (the URL comes from the site's own pagination links, or from their pattern). */
  const commentUrl = n => { const C = PG.com; return n === 1 ? PG.g.sourceUrl : C.links[n] || (C.tpl ? C.tpl.replace('__N__', n) : ''); };
  async function loadComments(n) {
    const C = PG.com, pg = PG; n = Math.max(1, +n || 1); if (C.busy) return;
    const cached = C.cache[n];
    if (cached) { C.page = n; C.items = cached; paintCommunity(); return; }
    const url = commentUrl(n); if (!url) return;
    C.busy = true; C.err = false; paintCommunity();
    try {
      const r = commentsOf(await getDoc(url)); if (PG !== pg) return;
      C.cache[n] = r.items; C.page = n; C.items = r.items;
      if (r.total != null) C.total = r.total; C.pages = Math.max(C.pages, r.pages, n); Object.assign(C.links, r.links); if (r.tpl) C.tpl = r.tpl;
      if (COMMENTS_AUTO_TRANSLATE) await translateComments(r.items);
    } catch (e) { C.err = true; log('comments failed', e); }
    C.busy = false; if (PG === pg) paintCommunity();
  }
  async function translateComments(list) {
    const pg = PG, todo = list.filter(c => CYR.test(c.text) && !pg.com.tr[c.id]); if (!todo.length) return;
    const out = await translate(todo.map(c => c.text.slice(0, 600)));
    todo.forEach((c, i) => { if (out[i] && !CYR.test(out[i])) pg.com.tr[c.id] = out[i]; });
  }

  async function openPage(id) {
    const r = raw.get(String(id)), app = handle && handle.app, root = rootOf(); if (!r || !app || !root || !PK) return;
    if (PG) closePage(true);
    const g = toGame(r), el = PK.open(root, g);
    const pg = PG = { id: g.id, g, el, vm: {}, store: null, storeDone: false, doneDetail: false, app: 0, sum: null, sumDone: false, hist: null, mi: 0, mkey: null, items: [], tab: 'site', userTab: false, aboutOpen: false, dlOpen: false, revOpen: new Set(),
      rev: { seq: 0, items: [], cursor: '*', filter: 'all', type: 'all', busy: false, done: false, err: false, why: '' }, com: { items: [], page: 1, pages: 1, cache: {}, links: {}, tpl: '', total: null, busy: false, err: false, tr: {} } };
    el.addEventListener('click', onPageClick);
    try { app.close(); } catch (e) { /* sheet was not open */ }
    paintAll(); loadComments(1);
    // detail (downloads, guide, update, media, art) — the same pipeline the sheet uses, shared so it runs once per game
    resolveDetail(g, p => { if (PG !== pg) return; Object.assign(pg.vm, p); paintHead(); paintMedia(); paintAbout(); paintUpdate(); paintGuide(); paintSide(); })
      .then(p => { if (PG !== pg) return; if (p) Object.assign(pg.vm, p); pg.doneDetail = true; paintAll(); }).catch(() => { if (PG === pg) { pg.doneDetail = true; paintAll(); } });
    // Steam: app id → store details + reviews
    const app0 = (sid[r.id] && sid[r.id].app) || r.steam || steamOf(r) || await idOf(r).catch(() => 0) || (r.steamLink ? await steamFromLink(r).catch(() => 0) : 0) || (pg.vm.steamAppId || g.steamAppId) || 0;
    if (PG !== pg) return; pg.app = app0 || 0;
    if (!pg.app) { pg.tab = 'site'; pg.storeDone = true; pg.sumDone = true; paintAll(); return; }
    if (!pg.userTab) pg.tab = 'steam';
    paintHead(); paintCommunity();
    // store details first (media + about), the review list right behind it, the rest a moment later (four at once is what Steam answers with a 429)
    setTimeout(() => { if (PG === pg) loadSteamReviews(true); }, 250);
    storeInfo(pg.app).then(d => { if (PG === pg) { pg.store = d; pg.storeDone = true; paintAll(); } }).catch(() => { if (PG === pg) { pg.storeDone = true; paintAll(); } });
    setTimeout(() => { if (PG !== pg) return; revSummaryAny(pg.app).then(s => { if (PG === pg) { pg.sum = s; pg.sumDone = true; paintSide(); paintCommunity(); } }).catch(() => { if (PG === pg) { pg.sumDone = true; paintSide(); } }); }, 700);
    setTimeout(() => { if (PG !== pg) return; revHist(pg.app).then(h => { if (PG === pg) { pg.hist = h; paintCommunity(); } }).catch(() => {}); }, 1100);
  }
  function closePage(instant) { const pg = PG; if (!pg) return; PG = null; PK.close(pg.el, instant); }
  function onPageClick(e) {
    const t = e.target.closest && e.target.closest('[data-dp-act],[data-dp-m],[data-dp-tab],[data-dp-f],[data-dp-t],[data-dp-cp]'); if (!t || !PG) return;
    const d = t.dataset, R = PG.rev, out = fn => KP.swapRegion(commBody(), fn);        // the community body fades out, changes, fades in
    if (d.dpM != null) { const i = +d.dpM; if (i !== PG.mi) { PG.mi = i; PK.show(PG.el, PG.items, i); } return; }
    if (d.dpTab) { if (PG.tab !== d.dpTab) out(() => { PG.tab = d.dpTab; PG.userTab = true; paintCommunity(); }); return; }
    if (d.dpF) { if (R.filter !== d.dpF) out(() => { R.filter = d.dpF; loadSteamReviews(true); }); return; }
    if (d.dpT) { if (R.type !== d.dpT) out(() => { R.type = d.dpT; loadSteamReviews(true); }); return; }
    if (d.dpCp) {
      const n = +d.dpCp, C = PG.com; if (!n || n === C.page || n < 1 || n > C.pages || C.busy) return;
      const top = PG.el.querySelector('#dp-comm'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return out(() => loadComments(n));
    }
    switch (d.dpAct) {
      case 'close': return closePage();
      case 'about': { const box = PG.el.querySelector('#dp-about .dp-clampbox'); if (!box) return; PG.aboutOpen = box.classList.contains('cl'); return PG.aboutOpen ? PK.expand(box) : PK.collapse(box); }   // Read more <-> Read less
      case 'rmore': { const box = t.closest('.dp-rev').querySelector('.dp-rt'), open = box.classList.contains('cl'); open ? PG.revOpen.add(d.v) : PG.revOpen.delete(d.v); return open ? PK.expand(box, true, t) : PK.collapse(box, true, t); }
      case 'rmoreList': return loadSteamReviews(false);
      case 'rretry': steamResume(); return loadSteamReviews(true);
      case 'cretry': PG.com.err = false; return loadComments(PG.com.page);
      case 'tr': { const c = PG.com.items.find(x => x.id === d.v); if (!c) return; if (PG.com.tr[c.id]) { delete PG.com.tr[c.id]; return paintCommunity(); } const pg = PG; t.textContent = '…'; return translateComments([c]).then(() => PG === pg && paintCommunity()); }
      case 'trall': { const pg = PG; t.textContent = 'Translating…'; return translateComments(PG.com.items).then(() => PG === pg && paintCommunity()); }
    }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && PG) { e.stopPropagation(); closePage(); } }, true);

  /** Landing on a game URL opens the page straight away (the popup's own "Full page" button is the kit's: ui.onPage). */
  let landed = false;
  function landingOpen(g) {
    if (!landed && PAGE_ON_GAME_URL && P.game(location.pathname)) { landed = true; const k = gameKey(location.href); if (k && k.id === String(g.id)) openPage(g.id); }
    landed = true;
  }

  (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).__hearthOnlineFix = { openPage, pageDiag: () => (PG ? console.table({ 'steam app': PG.app, 'store answered': PG.storeDone, 'store ok': !!PG.store, 'steam media items': PG.store ? PG.store.media.length : '-', 'steam trailers (streams)': PG.store ? PG.store.media.filter(m => m.stream).length : '-', 'dash.js loaded': typeof dashjs !== 'undefined', 'about blocks': PG.store ? PG.store.blocks.length : '-', 'images / clips in about': PG.store ? PG.store.blocks.filter(b => b.img || b.vid).length : '-', 'site media items': (PG.vm.siteMedia || []).length, 'store error': storeWhy[PG.app] || '' }) : console.log('no game page is open')), storeInfo, commentsOf, catmap: () => Object.fromEntries(catSeen.v.map(([slug, ids]) => [slug, ids.length])), linkDiag: () => linkLog.slice(), kitDiag: () => { let css = ''; try { css = GM_getResourceText('hearthCss') || ''; } catch (e) { /* none */ } const d = { 'kit version loaded (hearth-ui.js)': (typeof HearthUI !== 'undefined' && HearthUI.version) || '?', 'game page in the script bundle': !!FEAT.page, 'game page rules in hearth.css': css.includes('.dp-pgb') }; console.table(d); return d; }, sgdbDiag: () => console.table(sgdbLog), netDiag: () => console.table(netLog), build, raw, lists, ids, meta, parse: { playersOf, steamLinkOf, pageMedia, localTr, versionOf, parseUpdate, plainUpdate, modesOf, parseStory, buildStory, parseProfile, profileLinks, readChrome, site }, misses: () => console.table(artMisses), trDiag: () => { console.table(trLog); return trLog; }, sid, links, flush: flushStore, story: async id => { const r = raw.get(String(id)); const doc = await getDoc(r.url); return { parsed: buildStory(doc, r.url), patch: await resolveDetail({ id: String(id), description: '' }) }; }, steam: () => console.table([...raw.values()].map(r => ({ game: r.title, appId: appOf(r) || (known(r) ? '— none —' : 'pending'), hero: !!(meta[appOf(r)] && meta[appOf(r)].hero) }))) };
})();