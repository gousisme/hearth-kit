# 2 · Design system

The look is **solid surfaces, big type, generous spacing, real imagery**. There are no neon glows, glowing borders, colour-gradient backgrounds or "lit-up page" effects. The only gradients are the functional dark fades over artwork that keep text readable. Motion and typography carry the personality (see [03-motion.md](03-motion.md)).

All tokens live in `src/styles/00-tokens.css` on the `.hearth` root, and can be overridden at runtime: `HearthUI.mount({ options: { theme: { ac: '#ff6b3d', ink: '#1a0b05' } } })` (keys are token names without `--`).

## Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#24262b` | page. A soft, lifted charcoal. Deliberately **not** near-black. |
| `--s1` | `#2c2f36` | raised surfaces (modal, placeholders) |
| `--s2` | `#363a43` | controls and inset panels on `--s1` |
| `--line` | `#454a55` | hairlines, outlined chips |
| `--tx` / `--mu` | `#f1f2ee` / `#9ea3ad` | text / secondary text |
| `--ac` | `#c6f432` | **the one accent** (lime). Primary buttons, active states, progress. |
| `--ink` | `#13150a` | text/icons that sit *on* the accent |

Rule: one accent, used sparingly. If you add a second accent colour you are off-system.

## Typography

- **Display: Bricolage Grotesque** (500/700/800). Used for titles, buttons, numerals. Tight tracking (`-.01em` to `-.035em`); hero/title text is uppercase 800.
- **Body: Instrument Sans** (400/500/600).
- Fallbacks: `Trebuchet MS, system-ui` / `system-ui`. The UI must stay usable if fonts are blocked by a site's CSP.
- Scale: hero title `clamp(44px, 6vw, 88px)` · shelf heading 22px · body 15px · meta 13–14px · eyebrow labels 12px uppercase, `.14em` tracking.

## Space and shape

- Page gutter `--gut: clamp(20px, 4.6vw, 84px)`, content max-width `--max: 1640px`. Generous side headroom is intentional: the page should never feel zoomed in.
- Vertical rhythm: hero → chips (30px) → feature tiles (56px) → shelves (48px apart).
- Radii: 12px cards/panels · 24–28px hero and feature tiles · 26px modal · pill (99px) for buttons/chips/nav.
- Hero height: `min(72vh, 660px)`.

## Components (all in `src/js/ui/components/`)

| Component | Notes |
|---|---|
| **Floating bar** (`nav.js`) | Mark (left) · glass pill nav + search (centre) · avatar (right). Fixed; sits over the hero. The pill is the main use of glass. |
| **Hero** (`hero.js`) | Full-bleed art with the game's **transparent logo**. Auto-rolls every 7 s with a crossfade and a slow push-in. **Loading lines** (bottom right) show progress. No thumbnails. Pauses on hover, focus, hidden tab, or when scrolled away. Swipe on touch. |
| **Chips** (`chips.js`) | Category pills; open the browse view filtered. |
| **Feature tiles** (`featured.js`) | 1–3 editorial tiles with a glass "now playing" strip and a Get button. |
| **Shelf + card** (`shelf.js`, `card.js`) | Horizontal snap-scrolling rows. `style:"ranked"` gives the big outlined numbers. Hover lifts the card and reveals a Get button. |
| **Detail sheet** (`detail.js`) | Modal: logo over hero art, about, screenshots, requirements, facts, similar. Sections with no data are omitted. Focus is trapped; Esc closes; focus returns to the trigger. |
| **Browse** (`browse.js`) | Grid used for category filters, search, Library (saved) and "See all". Includes the empty state. |
| **Buttons** (`button.js`) | See below. |

### Buttons
- **Primary:** lime pill with an arrow *disc*. On hover the arrow slides out and a second slides in while the gap opens; on press it squashes (`scale(.96)`). No glow.
- **Glass:** frosted pill, only over imagery.
- **Alt:** `.btn.glass.alt` is a flat `--s2` pill for solid surfaces (e.g. "Save for later", which fills its heart when on).
- **No prices anywhere.** All actions are Get / Download / Save. There is no price, discount or cart concept in the UI or the data.

## Artwork rules
Every image slot is a **skeleton** (a quiet sheen that only runs while the slot is loading) that the real image fades in over. There is no generated art: if nothing loads the slot becomes a flat tile and a card shows the title as text. If a hero logo fails, the title renders as big uppercase type. Details: [04-data-contract.md](04-data-contract.md#steam-artwork).

## Isolation
The UI renders in a **Shadow DOM** when `css` is passed to `mount()` (the userscript path), so the original site's CSS cannot affect it and ours cannot leak. Resets use `:where()` (zero specificity) so any component rule beats them. Fonts are the exception: `@font-face` does not work in a shadow root, so glue injects them into the main document.
