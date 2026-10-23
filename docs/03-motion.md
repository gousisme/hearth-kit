# 3 · Motion system

Goal: everything animates **in and out**, nothing pops, 60 fps. The rules below are implemented in `src/styles/*.css` and `src/js/ui/core/motion.js`; follow them for any new component.

## Tokens (`00-tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--tf` | 160 ms | micro: colour changes, press feedback |
| `--tb` | 320 ms | base: hovers, reveals, menus, fades |
| `--ts` | 700 ms | slow: hero crossfade, scroll reveals, modal entrance |
| `--ease` | `cubic-bezier(.22,.8,.24,1)` | **enter/hover**: fast start, long soft landing |
| `--ein` | `cubic-bezier(.5,0,.8,.3)` | **leave**: accelerates away |

## Rules
1. **Only animate `transform` and `opacity`** (plus `visibility` for toggling). No animating width/height/top/left, except the hero's `.sg` width and button `gap` on small elements.
2. **Enter slow and eased-out; leave fast and eased-in** (about 60 % of the enter time). Example: modal in = 700 ms transform / 320 ms opacity, out = 320 ms both.
3. **Hidden things use `visibility` with a delayed transition**, never `display:none`, so exit animations can finish (`.modal`, `.slide`, `.searchbox`).
4. **Stagger sparingly**: hero text lines 90 ms apart; grid cards 28 ms apart (`--i`, capped at 14).
5. **No layout thrash**: reads and writes are batched; `void el.offsetWidth` is used only to restart an animation.

## What animates, and how

| Thing | In | Out |
|---|---|---|
| Page load | bar drops in, content rises (`.page.is-out` → removed) | n/a |
| View change (home ⇄ browse, data update) | content rises (320 ms) | content sinks/fades (200 ms) then swaps (`swap()` in motion.js) |
| Hero slide | crossfade 700 ms + slow 10 s push-in; text rises with stagger | crossfade; text drops (ease-in) |
| Loading lines | active line widens and fills over the autoplay duration (`hearth-fill`); pauses with the hero | resets |
| Shelves / tiles | `.rv` → `.in` on scroll (IntersectionObserver) | n/a |
| Card hover | lift 6 px, art scales 1.06, Get button rises | reverse |
| Buttons | arrow swap + gap | press squash |
| Modal | scrim fades, sheet rises 34 px + scales .97→1 | reverse (ease-in) |
| Modal content swap ("Similar") | 160 ms fade/sink out, then in | |
| Search drop-down | fade + 8 px drop | reverse |
| Images | fade in over their skeleton (700 ms), at most 2 per frame | n/a |
| Cards | cascade in as they scroll into view: `reveal()` orders everything that appears in one frame and starts each 40 ms apart (CSS animation `hf-rise`) | n/a |
| Removing an element | `leave(el)` adds `.is-leaving`, waits `--tb`, removes | |

## Reduced motion
`@media (prefers-reduced-motion: reduce)` collapses every duration to ~0 and disables staggers; reveals show immediately. In JS, `reduced()` additionally **turns hero autoplay off** (auto-advancing content is itself a motion concern) and shows the loading line as static. The user can still change slides with the lines or by swiping.

## Adding motion to a new component
1. Give the element a base state and an `.on`/`.open`/`.in` state using the tokens above.
2. Put the *enter* timing on the active state, the *leave* timing on the base state.
3. If it must be removed from the DOM, call `leave(el)`; if a container's content changes, call `swap(container, render)`.
4. Test with reduced motion on.
