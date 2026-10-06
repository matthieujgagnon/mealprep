# Handoff: Store Mode (shopping view)

## Overview
Store Mode is the phone-sized, in-store version of the grocery list. One continuous scrolling list is grouped into collapsible store sections (Metro, Super C, Fruits du jour). Each section has a coloured sticker header. Items stay in place when checked. Leaving the mode with checked items asks whether to add them to the inventory. Finishing the whole list triggers a confetti celebration.

## About the Design Files
`v1-store-mode-desktop.dc.html` is a **design reference built in HTML**: a prototype showing intended look and behaviour, not production code to copy. Recreate it in the target codebase's environment (React, Vue, SwiftUI, native…) using its established patterns and libraries. If no environment exists, choose the best fit for the project.

## Fidelity
**High-fidelity.** Final colours, type, spacing, states and animations. Recreate pixel-accurately with the codebase's libraries.

## Screen: Store Mode
Single screen. Rendered as a 390 × 780 phone frame centred on the page (`max-height: calc(100vh − 48px)`), page background behind it `#2A2A31` (dark) or `#E9E4D8` (light). On a real phone, the frame is the viewport.

Frame: radius 30, border 2 `t.frame`, shadow `5px 5px 0 t.shadow`, `overflow:hidden`, flex column: **Header (fixed) → List (scrolls, flex:1) → overlays**.

### Themes
| Token | Dark (default) | Light |
|---|---|---|
| page | #2A2A31 | #E9E4D8 |
| bg | #000000 | #F4F1EA |
| text | #F4F1EA | #16181F |
| line / frame | #2A2A34 | #16181F |
| shadow (frame) | #2323FF | #16181F |
| accent | #2323FF | #2323FF |
| card | #111115 | #FFFDF8 |
| cardBorder | #26262E | #16181F |
| muted | #9A9AA8 | #5E5B52 |
| track (progress) | #15151B | #FFFDF8 |
| number colour | #F4F1EA | #2323FF |

### Header (three bands, equal 18px padding top and bottom, 2px `line` rules between)
1. **Top row:** `← List` button (h36, pad 0 14, radius 18, border 2 text, 14/700) · spacer · `Colours` button (h36, pad 0 14, radius 18, 13/700) · theme toggle (36 circle; ☀ in dark, ☾ in light).
2. **Stats row:** big number of items left (28/800, letter-spacing −.04em, colour per theme) · label "left on the list" (15/700) over a progress bar (h8, radius 4, border 1.5 `line`, fill **#FF48B0**, width transition .25s).
3. The list's own top border (2px `line`).

### List (scroll area)
Padding `0 14 18`, gap 12, hidden scrollbar.
- **Toolbar** (padding `16 2 4`, space-between): segmented control with two independent toggles, **All** then **Aisle** (border 1.5 text, radius 16, each segment h32, pad 0 18, 13/700; selected = accent bg, white text), and a **Hide done** toggle chip on the right (h32, pad 0 16, radius 16, border 1.5, 13/700; selected = accent bg, white text). Nothing is selected by default.
- **Store section** (`<section data-store>`, gap 8):
  - **Sticky header** (top 0, z 3, margin `0 −14`, padding `10 14 8`, bg = theme bg): row h48, space-between.
    - Left: chevron box 18×18 (CSS triangle, 6/6/8 px, colour = text, rotates −90° when collapsed) + 6px gap + **store sticker**.
    - **Sticker:** pill (radius 999, padding 4 16, line-height 1.15, 19/800 Bricolage Grotesque, `rotate(−2deg)`, shadow `3px 3px 0`). *Dark:* background #000, text #F4F1EA, transparent border, shadow = store colour. *Light:* background = store colour, text auto-picked ink `#16181F` or white by WCAG contrast, border 2 #16181F, shadow `3px 3px 0 #16181F`.
    - Right: count badge "N LEFT" (h24, pad 0 10, radius 999, bg accent, white text, DM Mono 11/500, letter-spacing .08em, margin-right 2).
    - Tapping the header collapses or expands the section (items hidden; count stays).
  - **Aisle label** (only when Aisle is on): DM Mono 11/500, letter-spacing .12em, muted, uppercase, padding `4 4 0`.
  - **Item card:** min-height 52, padding `8 12`, gap 12, radius 16, border 2 `cardBorder`, bg `card`; checkbox 26×26 (radius 8, border 2 accent, filled accent with ✓ when checked); name 16/700 line-height 1.2; quantity DM Mono 14/700, no wrap, right aligned. **Only name and quantity are shown** (no brand, price or sale tag). Checked = opacity .45 + strike-through name. **Items never reorder when checked.**

### View modes
- Default: sections per store, items alphabetical within each store.
- **Aisle** on: items grouped under aisle labels within each store (Produce, Meat, Dairy, Bakery, Pantry, Frozen; FR: Fruits et légumes, Viandes, Produits laitiers, Boulangerie, Garde-manger, Surgelés).
- **All** on: one flat list with no store headers (still alphabetical, or aisle-grouped if Aisle is also on).
- **Hide done** removes checked items from view.

### Overlays (absolute within the frame)
- **Leave sheet** (z 20, backdrop rgba(0,0,0,.6), bottom sheet radius `30 30 0 0`, border-top 2, padding `28 22 26`, gap 20). Shown when tapping `← List` with ≥1 checked item. Title "Add N checked item(s) to your inventory?", body, then: primary **Add to inventory** (h52, radius 26, accent, white, 16/800), secondary **Leave without adding** (h48, radius 24, border 2), text link **Keep shopping**. After adding: confirmation sheet "Added to your inventory" with a single **Back to the list** button; the added items are removed from the list. "Leave without adding" and "Keep shopping" keep all checks. With zero checked items, `← List` just navigates back.
- **Colours sheet** (same sheet styling). Title "Store colours", hint, one row per store: preview sticker, native colour wheel input (44×44, radius 12, border 2) and a text input (112×44, DM Mono 13/600; accepts `#RGB`, `#RRGGBB`, `r,g,b` or `rgb(r,g,b)`; border turns #C4123F if invalid). Buttons: **Reset** (outlined) and **Done** (accent). Colours persist per device (`localStorage` key `mealprep-store-colors`); defaults Metro #FF48B0, Super C #FFE14D, Fruits du jour #10C95C.

### Celebration (when items left = 0 and the list is non-empty)
Non-interactive overlay over the whole frame (z 15, `pointer-events:none`), regenerated with random values each time it starts:
- ~240 confetti pieces fall from the top (width 5–14, height 8–22, circle/rounded/rectangle, colours #FF48B0, #2323FF, #FFE14D, #10C95C, #F4F1EA, #FF8A3D, #7B5CFF; 1.6–4.2s; delay 0–2s).
- ~150 pieces shoot up from both bottom corners in three arcs and fall back (1.5–3.2s; delay up to 1.8s).
- 22 four-point sparkles twinkle (scale 0→1.2→0 with 90° rotation, .9s, repeat 4).
- The left-count number pulses (scale 1→1.2→1, 1s × 3).
No label or card change.

## Interactions & Behaviour
- Tap item → toggle checked (instant, in place).
- Tap store header → collapse or expand that store.
- Tap All / Aisle / Hide done → independent toggles.
- Tap theme → light or dark. Tap Colours → colour sheet.
- Tap `← List` → leave sheet if anything is checked.
- Language: FR/EN via the app's language setting (see strings in the file's `T('en','fr')` calls).
- Responsive: designed for phone width; the frame shrinks with `max-width:100%`.

## State
`checked{index:bool}`, `gone{index:bool}` (added to inventory), `collapsed{store:bool}`, `flat`, `aisle`, `hideDone`, `dark`, `colors{store:hex}` (persisted), `pal` (colour sheet open), `draft{store:text}` (text input drafts), `ask: null | 'ask' | 'done'`, `added` (count shown in confirmation).
Derived: left, progress %, per-store left counts, celebrate flag.
Real data: each list item needs name, quantity, aisle/section, store. Replace the hard-coded 14-item sample with the grocery list. "Add to inventory" should create inventory entries with a USDA use-by date for the checked items.

## Design Tokens
- Ink #16181F · Paper #F4F1EA · Card #FFFDF8 · Blue #2323FF · Pink #FF48B0 · Yellow #FFE14D · Green #10C95C · Error #C4123F.
- Radii: 8, 12, 16, 22, 30, pill (999). Shadows: 3px, 5px (frame), 8px (modals) hard offset, no blur. Borders 1.5 / 2.
- Type: **Bricolage Grotesque** 500/700/800 for UI and names; **DM Mono** 400/500/700 for quantities, counts and small caps.
- Sticker text colour: pick #16181F or #FFFFFF, whichever has the higher WCAG contrast against the store colour (light mode only; dark mode is always #F4F1EA on black).

## Assets
No images or icons. The chevron is a CSS triangle. Fonts are loaded from Google Fonts.

## Screenshots (`screenshots/`)
Captured at a 924 × 540 viewport, so the 780px-tall frame is shortened to about 490px here.
1. `01-dark-default.png` dark theme, nothing selected
2. `02-dark-aisle-on.png` Aisle toggle on
3. `03-store-collapsed.png` Metro collapsed
4. `04-light-mode.png` light theme
5. `05-light-items-checked.png` two items checked, left count 12
6. `06-leave-sheet.png` "Add 2 checked items to your inventory?"
7. `07-colours-sheet.png` store colour picker (wheel and hex/RGB field)
8. `08-celebration.png` confetti when the list reaches 0

## Files
- `v1-store-mode-desktop.dc.html` the design (markup, styles, logic and animations).
- `part-copy.js` shared EN/FR copy and language switch the prototype imports (only `getLang` and `subscribe` are used).

## How it was built in the app
Where the app differs from the prototype (which has hard-coded sample data):
- The stores, items and counts are the real Grocery list (`GroceryList.jsx` passes the rows). The item is the shared `GroceryItem` in its "store" form, drawn as the card above. It shows the number to buy (a plain number, as everywhere in Grocery), not a quantity with a unit.
- Store sticker colours: Metro, Super C and Fruits du jour have the design's colours; any other store gets one from the palette, always the same one for the same name. Colours are kept per device under `mealprep-store-colors`.
- "Add to inventory" never adds on its own: it opens the app's Inventory confirmation first (see `CLAUDE.md`). Cancelling that leaves the leave sheet open; confirming shows "Added to your inventory". "Leave without adding" goes back to Grocery and keeps the checks.
- It is full screen (the phone is the frame), and it opens from Grocery's "I'm at the store" on a phone.
