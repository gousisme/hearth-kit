# 10 · The full game page

A store-style page that sits **next to** the popup sheet (added in script 0.10.0, kit "page" patches 1-19). The sheet is a quick peek; the page is the whole game: gallery (Steam trailers + screenshots), About, update line, install guide, system requirements, a side panel (Get box, Save, Open in Steam, facts, Steam rating), and a Community area with **Steam reviews** and **the site's own comments**.

The split of responsibility is strict and is the main design rule of this feature:

| | Owns |
|---|---|
| **Kit** (`src/js/ui/components/page.js`, `src/styles/66-page.css`, `core/morph.js`, `core/stream.js`) | **Every visual**: markup, CSS, icons, motion, skeletons, the rating card, review/comment cards, pager, tabs, expand/collapse. Exposed as `HearthUI.parts.page` (+ `parts.morphInto`, `parts.swapRegion`, `getBox`, `guideHtml`, `actsHtml`, `factsHtml`, `reqHtml`, `updHtml`). |
| **Userscript** (`openPage`, the `paint*` functions, `PG` state) | **What to paint, and when**: it fetches data and calls the kit's builders. It writes **no CSS, no inline style and no icon**. (0.10.3 removed ~300 lines of script-drawn UI because the page's own `<style>` lost specificity fights to the kit's rules and gave instant hovers.) |

Feature flag: `HearthUI.features.page`. Without it the script logs a warning and `ui.onPage` is not set (no "Full page" button).

## 1 · How it opens and closes

- The popup sheet has a **"Full page"** button (drawn by the kit when `ui.onPage` is set → `openPage(game.id)`). The **hero's "Details"** button opens the page directly (0.10.4); cards still open the popup.
- **Landing on a game URL** (`/games/<folder>/<id>-<slug>.html`) opens the sheet first (`route.view = {open: id}`), and `landingOpen()` (called from `onOpen`) upgrades that to the full page once. Controlled by `PAGE_ON_GAME_URL`.
- `openPage` closes any open page (instantly), builds `g = toGame(raw)`, calls `PK.open(root, g)` (appends a `.dp` dialog to the kit's shadow root; fades in over two frames) and `app.close()` (the sheet).
- Close: the **Back** pill (`data-dp-act="close"`), **Esc** (a capture-phase `keydown` that stops propagation while the page is open), or opening another page. The **browser Back button is not wired**: neither the kit nor the script touches history for the page.
- `PK.close(el, instant)` plays the exit transition (`.out`) then removes the node.

## 2 · Layout and regions

`pageHtml` renders a nav (Back, "Esc to close"), a scroller with the hero banner (hero art under a gradient, logo bottom-left that replaces the title text when it loads), and a two-column grid:

```
main column:  #dp-media  #dp-about  #dp-upd  #dp-guide  #dp-req  #dp-comm
side column:  #dp-side   (Get box · Save + Open in Steam · Steam rating · facts)
```

Each `#dp-*` section is repainted with `sect(id, html)` = `KP.morphInto(el, html, {animate:true, ghost:true})`. Regions inside are marked `data-k="<key>"` (the script wraps content with `rg(key, inner)`), and `morphInto` (`core/morph.js`):

- keeps a region's DOM node when its source HTML is **identical** (an image already on screen is never created or loaded a second time; a scrolled media strip stays where it is; a playing video keeps playing);
- replaces only changed regions, which fade in (cascade 45 ms apart, `.rg-in`); with `ghost:true` the replaced region also fades **out** (a clone is left for a moment, `.rg-out`), so a skeleton turning into content cross-fades instead of blinking;
- `data-morph` = look inside a container and match children by `data-k`; `data-live` = patch the node **in place** (attributes/text/children) so CSS transitions run (a tab becoming `.on`, a pager whose current page glides, a disabled button); `data-na` = replace without the fade.
- `swapRegion(el, change)` = fade the container out, run `change()`, fade in (tab switches, comment-page changes, review filters).

**Rule when adding a region:** give it a stable `data-k`, build it from kit builders, and let `morphInto` decide what changed. Never rebuild a whole section by `innerHTML`.

## 3 · State (`PG`) and the painters

`PG` (null = closed) holds: `id, g, el, vm` (the merged detail patch), `store` + `storeDone`, `doneDetail`, `app` (Steam app id, 0 = none), `sum` (review summary) + `sumDone`, `hist`, `mi` (selected media index), `mkey` (media signature, to skip repaint), `items` (current media), `tab` (`'steam'|'site'`) + `userTab` (true once the reader chose one), `aboutOpen`, `dlOpen`, `revOpen` (Set of expanded review ids), `rev {seq, items, cursor, filter:'all'|'recent', type:'all'|'positive'|'negative', busy, done, err, why, html}`, `com {items, page, pages, cache, links, tpl, total, busy, err, tr}`, plus `sgdb`/`sgdbAsked`.

Every async callback re-checks `PG === pg` (and review loads also a `seq`) before painting, so a slow response for a game you already left can never paint into the next one.

| Painter | Section | Notes |
|---|---|---|
| `paintHead` | hero + logo | `PK.art(el, {hero:[art.hero, steam hero, art.header, store header, steam header, art.fallback], logo:[art.logo, steam logo, PG.sgdb]}, final, askLogo)`. Logo order = popup/hero order; `askLogo('logo')` asks SteamGridDB **once** when the others fail and repaints. |
| `paintMedia` | `#dp-media` | Waits for Steam (`waiting = app && !storeDone` → skeleton). `mergeMedia(steam, siteMedia)` (docs/09 §5). No items: skeleton while loading, nothing when done. Signature `mkey` prevents repaint; thumbnails `PK.show` cross-fade; `PK.mediaReady` adds the strip edge fades. |
| `paintAbout` | `#dp-about` | Steam's about **blocks** (headings, text, section images with no backdrop and their own size, muted clips), else the sheet's description. Long text starts clamped; the button becomes **Read more ↔ Read less** (`PK.expand/collapse`; `aboutOpen` survives repaints). |
| `paintUpdate` | `#dp-upd` | `KP.updHtml(vm.update)` (date, version/Build pill, reason, "Guide closed"). |
| `paintGuide` | `#dp-guide` | `KP.guideHtml` titled "How to install & play online" (the popup's numbered cards, not drop-downs); skeleton while `!doneDetail`. |
| `paintReq` | `#dp-req` | Steam's min/recommended rows. |
| `paintSide` | `#dp-side` | `getBox` (downloads, password; remembers whether the box was open), `actsHtml` (Save + Open in Steam with the Steam logo), the **rating card** (only when numbers exist: nothing is drawn or reserved before; an empty box under "Open in Steam" was a loading skeleton for it and was removed in 0.10.3), and `factsHtml`. Facts = the sheet's facts, then missing ones from Steam: Developer, Publisher, Released, Genre, **Price**, Metacritic, Recommendations, Achievements, Age, Languages ("N supported" if > 4). *(See the Price note in docs/09 §4.)* |
| `paintCommunity` | `#dp-comm` | Tabs: "Steam reviews · N" (only with an app id) and "Online-Fix comments · N". Steam tab: filter pills Helpful/Recent and All/Positive/Negative, the histogram, review cards (expand/collapse per card), "Load more reviews". Site tab: a pager **above and below** the list, comment cards, "Translate" / "Show original" per comment, "Translate all" (shown only if some comment has Cyrillic), "Write a comment on online-fix.me" link. Errors show a note with **Try again** (and "Open the reviews on Steam"). |

`paintAll` runs them in this order: head, media, about, update, guide, req, side, community.

## 4 · Loading order (what is fetched, when)

`openPage` does, in this order, all on demand and all cached where possible:

1. `paintAll()` (skeletons) and `loadComments(1)` at once.
2. `resolveDetail(g, push)` — **the same shared run as the popup** (docs/08 §6): patches `Object.assign` into `PG.vm` and repaint head/media/about/update/guide/side; the final patch sets `doneDetail` and `paintAll`.
3. The **Steam app id** (docs/09 §1 order, awaiting the title search / link follow if needed). No id → community tab is the site's, `storeDone`/`sumDone` set, everything repainted. With an id the default tab becomes `steam` (unless the reader already picked one).
4. Staggered Steam calls (four at once earned a 429): `loadSteamReviews(true)` at +250 ms; `storeInfo(app)` immediately (media + about + requirements + facts → `paintAll`); `revSummaryAny` at +700 ms (→ `paintSide`, `paintCommunity`); `revHist` at +1100 ms (→ `paintCommunity`).

### Steam reviews (`loadSteamReviews`)
`R.busy` guards, `first` resets `items/cursor/done/html`. Appends de-duplicated reviews; `R.done` when the page was empty, had no cursor, or the cursor did not advance. Falls back JSON → community HTML automatically (docs/09 §6); an error shows the note with the reason (`R.why`) and **Try again** (`rretry` also calls `steamResume()` to clear the throttle pause). Changing a filter pill or type fades the body out, reloads the first page, fades in.

### The site's comments (`loadComments`, `commentsOf`, `parseComment`)
DLE comment markup: `#dle-comments-list [id^="comment-id-N"]` with `[id^="comm-id-"]` bodies; author `a[href*="/user/"]`, avatar image matching `/fotos/|noavatar|gravatar`, date by regex (Russian/Сегодня/Вчера → English via `ruDate`). Quotes are prefixed with `> `. Text ≤ 1400 chars. **Real page switching** (not "load more", 0.10.1): the site's own `nav.pagination` is read (current page is a `<span>`, others `<a>`), the link pattern `page,<n>,<commentPage>,<id>-slug.html` is turned into a template (`__N__`) so any page number can be built; pages are cached in `com.cache` and fetched with the shared `getDoc`. Total comes from `.comments`. Scrolls the community section into view when the pager is used from far below.

## 5 · Click handling (one delegated listener)

`onPageClick` is attached once to the page element and reads `data-dp-*` attributes: `data-dp-m` (media thumbnail), `data-dp-tab`, `data-dp-f` / `data-dp-t` (review filters), `data-dp-cp` (comment page), `data-dp-act` ∈ `close, about, rmore, rmoreList, rretry, cretry, tr, trall`. The kit's builders emit these attributes; add a new interaction by emitting one from the builder and handling it here.

## 6 · Diagnostics and gotchas

- `__hearthOnlineFix.pageDiag()` (a page must be open): steam app, store answered/ok, number of Steam media items, number of trailer **streams**, `dash.js loaded`, about blocks, images/clips in about, site media items, last store error.
- `openPage(id)` can be called from the console.
- If the page shows the **site's** media instead of Steam's: the store details failed or returned no media (`store error`), or the cached entry predates `STORE_SHAPE 3`. Reopen after the cache refresh.
- Styles are the kit's: if `hearth.css` is older than the pinned kit commit the page looks unstyled. Tampermonkey keeps `@resource` until the script is **re-installed**; the script warns when `a.btn { text-decoration: none; }` is missing from the resource and `kitDiag()` reports whether `.dp-pgb` rules are present.
- **Not implemented / decisions:** browser Back does not close the page; no deep link to the page other than the game URL; comments are read-only (the "write a comment" link opens the site).
