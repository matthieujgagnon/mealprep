# Handoff: Recipes page v2, Direction A "Tabs and toolbar" (Riso Poster)

## Overview
The desktop **Recipes** page of The Matt Mo Cookbook. Cookbook / Imported are big tabs, meal type is one chip row, and Protein, Time and Sort are dropdowns. It keeps the search/import pill from the earlier Recipes screen.

## About the Design Files
The `.dc.html` files are **design references built in HTML**: prototypes showing the intended look and behavior, not production code. Recreate them in the target codebase's existing environment (React, Vue, etc.) using its patterns and libraries. If none exists, choose the most suitable framework. `support.js` is only the prototype runtime.

## Fidelity
**High-fidelity.** Colors, type, borders, shadows, radii, copy and layout are final. Match them exactly, using tokens (CSS custom properties) rather than hard-coded hex values.

## Files
- `Riso Recipes v2.dc.html`: the page. **Use `direction="A"` only.** The file also holds an unused Direction B (filter rail) and its logic; ignore it. Prop `width` defaults to `1240px`. All logic is in the `Component` class.
- `Riso Recipe Editor.dc.html`: target of "+ New recipe" (spec is in `design_handoff_recipes/`).
- `support.js`: prototype runtime.

## Layout
Page container: `--paper`, padding `28px 40px 56px`, flex column, gap 22.

1. **Header**: logo "matt mo **cookbook**" (Bricolage 800 28px/1, −.02em, "cookbook" on `--pink`, padding 0 8px, radius 6). Nav: Home, **Recipes** (active), Planner, Makeable, Grocery, Flyers, Inventory. Bricolage 500 14px, 36px tall, padding 0 14px, gap 4, centered. Active = `--blue` pill, white text, 2px border, `3px 3px 0` ink shadow. "Matthieu" at right, 14px.
2. **Title row** (flex, align end, gap 16):
   - Left: summary label (DM Mono 500 12px, .12em, uppercase) `{n} RECIPES · {m} MAKEABLE NOW · {k} USE EXPIRING ITEMS` (whole library, unaffected by filters; makeable = on hand equals total). Under it: "Your **recipes.**" (Bricolage 800 60px/.95, −.035em, last word `--blue`).
   - Right: **+ New recipe**, 48px, padding 0 24, radius 24, blue, white, 2px border, `3px 3px 0` shadow, Bricolage 800 16px. Links to the editor.
3. **Search / import pill**: `--card`, 2px border, radius 999, padding `6px 6px 6px 10px`, shadow `5px 5px 0 ink`, gap 12.
   - Label chip: 34px, radius 17, 2px border, DM Mono 500 11px, .1em. "SEARCH" on `--paper`; "IMPORT" on `--yellow` when the text is a URL.
   - Input: flex 1, 44px, borderless, Bricolage 500 16px, placeholder "Search by name, tag or ingredient".
   - Not a URL: dashed chip (34px, 2px dashed ink, DM Mono 500 10.5px, .08em) "PASTE A LINK TO IMPORT".
   - URL: primary **Import recipe** (44px, padding 0 24, radius 22, blue, white, 2px border, 3px shadow, Bricolage 700 15px), plus a line below: yellow 10px dot + "Link found. Importing fills in the title, photos, ingredients and steps. It lands in Imported." (13.5px, `--ink-soft`).
4. **Import toast**: yellow pill (rotate −1.5°, 2px border, 3px shadow, padding 8px 18px, Bricolage 800 14px): "Imported. Find it under Imported, sorted by recently added." Hides after 2.6 s. Import switches to the Imported tab and clears the query.
5. **Tab row**: flex, gap 16, align end, bottom border 2px ink. Tabs overlap the border (`margin-bottom:-2px`).
   - Tab: height 52, padding 0 24, radius `20px 20px 0 0`, 2px border, Bricolage 800 20px, gap 10. Active = `--blue`, white text, blue bottom border. Inactive = `--card`, ink text.
   - Count chip in each tab: min-width 26, height 24, radius 12, 2px border, Bricolage 800 12px. Yellow on the active tab, `--paper` on the inactive one.
   - Tabs: **Cookbook**, **Imported**. Switching resets Meal type to All.
6. **Toolbar** (right of tabs, bottom padding 10, gap 8): **PROTEIN**, **TIME**, **SORT** dropdowns.
   - Button: 38px, padding 0 14, radius 19, 2px border, Bricolage 700 13.5px: DM Mono 500 10px label (`--ink-muted`, .1em), value, ▾ (9px). `--card` by default, `--yellow` when a non-default option is picked.
   - Menu: absolute, right 0, top calc(100% + 8px), min-width 200, `--card`, 2px border, radius 16, shadow `4px 4px 0 ink`, padding 6, gap 2. Items 38px, padding 0 10, radius 12, Bricolage 600 14px; the selected item has a `--paper` fill and a ✓ at the right.
   - Options. Protein: Any protein, Chicken, Beef, Pork, Fish & seafood, Vegetarian. Time: Any time, Under 20 min, Under 45 min, Under 1 hour, 1 hour or more. Sort: Recently added, Fewest missing, Quickest.
7. **Meal-type chips** (gap 8, wrap): All, Breakfast, Lunch, Supper, Side, Snack, Dessert, Pantry / Prep. Chip: 38px, padding 0 16, radius 19, 2px border, Bricolage 700 14px, then a count in DM Mono 500 10.5px at 75% opacity. Active = ink fill, paper text, shadow `3px 3px 0 blue`. (The updated app renames Supper to Dinner and adds Snack / Any; follow the app's current list.)
8. **Count line**: DM Mono 500 11px, .12em, min-height 20: "9 RECIPES", or "3 RECIPES MATCH" when filtered (singular "RECIPE"). **Clear filters** (Bricolage 600 13px, underlined) shows when any filter is active. It resets meal, protein, time and the query, but not the tab or sort.
9. **Grid**: `repeat(auto-fill, minmax(290px, 1fr))`, gap 24.
10. **Card**: `--card`, 2px border, radius 24, overflow hidden, flex column.
    - Photo: 250px tall, `--track` fallback, 2px bottom border, `object-fit: cover`. No badges on the photo.
    - Body: padding `16px 18px 18px`, gap 10.
      1. Title: Bricolage 800 20px/1.2, `text-wrap: pretty`.
      2. Chip row (gap 6, wrap, centered): time chip, meta text, flag chips.
      3. Spacer (flex 1) so the bars line up across a row.
      4. Have-bar: 12px, radius 6, 2px border, `--track` with a `--blue` fill = on hand ÷ total.
      5. Status line, Bricolage 600 13.5px. "9 of 11 on hand · 2 to buy" in `--ink-soft`. If nothing is missing: "all 9 on hand · nothing to buy!" in `--green-text`.
    - Nothing missing: card shadow `5px 5px 0 ink`. Others have no shadow.
11. **Empty state**: 2px dashed ink box, radius 22, padding 40, centered, Bricolage 600 15px: "No recipes match these filters."

## Recipe fields and rules
Each recipe: `name, photo, minutes (0 = unset), ingredientCount, onHandCount, mealType, source ('Cookbook' | 'Imported'), proteinCategory, flags ('soon' = uses expiring, 'sale')`.
- **Time chip**: 22px, padding 0 8, radius 5, 1.5px border, Bricolage 800 12px, "⏱" at 10px, `--yellow`. If `minutes = 0`: transparent fill, 1.5px **dashed** border, text "add time". Format: under 60 → "25 min"; else "1 h" or "1 h 30 min".
- **Meta**: `{MEAL TYPE} · {PROTEIN}`, DM Mono 500 10.5px, .08em, uppercase, `--ink-muted` (e.g. "SUPPER · CHICKEN").
- **Flag chips**: 22px, padding 0 9, radius 11, 1.5px border, Bricolage 800 11px, ink text. "uses expiring" = `--pink`; "on sale" = `--green`. Both can show.
- **Filtering** (AND): Source tab, Meal type, Protein, Time and the search text. Search matches name and meal type, case-insensitive, and is ignored when the text is a URL. Time: Under 20 = 1–20 min, Under 45 = 1–45, Under 1 hour = 1–59, 1 hour or more ≥ 60. Recipes with no time only match "Any time".
- **Sort**: Recently added (data order); Fewest missing (ingredients − on hand, ascending); Quickest (minutes ascending, no-time last).
- **Counts**: tab counts are per source over the whole library. Meal-chip counts respect the other active filters (Source, Protein, Time, search) but ignore the Meal filter itself.

## Interactions & State
State: `tab` ('Cookbook'), `meal` ('All'), `protein` (0), `time` (0), `sort` (0), `q` (''), `menu` (null | 'protein' | 'time' | 'sort'), `toast` ('').
- Tabs, chips and menu options apply immediately with no animation.
- A dropdown button toggles its menu; only one is open at a time. Picking an option closes it. Also close on outside click and Esc.
- URL detection: starts with `http(s)://` or contains a domain followed by `/`. Import calls the existing import endpoint. New recipes have `source = 'Imported'`.
- Clicking a card opens the Recipe card screen.
- Hover and focus states aren't designed; use the app's standard Riso treatment.
- Below 768px use the mobile Recipes layout from `design_handoff_riso/README.md`. Between that and desktop, the grid reflows via `auto-fill` and the tab row wraps.

## Design Tokens
| token | hex | use |
|---|---|---|
| `--paper` | `#F4F1EA` | page, neutral chips |
| `--card` | `#FFFDF8` | cards, inputs, buttons |
| `--ink` | `#16181F` | text, every border and hard shadow |
| `--ink-soft` | `#3F3E37` | secondary text |
| `--ink-muted` | `#5E5B52` | meta labels |
| `--track` | `#E9E4D8` | bar tracks, image fallback |
| `--blue` | `#2323FF` | actions, active tab, bar fill, title accent |
| `--pink` | `#FF48B0` | logo highlight, "uses expiring" |
| `--green` | `#10C95C` | "on sale" |
| `--green-text` | `#00753F` | "nothing to buy" text |
| `--yellow` | `#FFE14D` | time chip, import state, active dropdowns, toast |

- **Fonts**: Bricolage Grotesque 500/700/800 (headings, buttons, chips, titles); DM Mono 400/500 (labels, meta, counts).
- **Borders**: 2px solid ink (1.5px on small chips).
- **Hard shadows**: 3px (buttons, active nav/chips), 4px (menus), 5px (search pill, nothing-to-buy cards).
- **Radii**: 24 cards, 22 empty state, `20/20/0/0` tabs, 16 menus, 12 menu items, 5 time chip, 6 bar, pills = height ÷ 2.
- **Spacing**: page padding 28/40/56, section gap 22, grid gap 24.

## Assets
No icons or SVGs. Glyphs are text characters: ⏱, ▾, ✓. Photos are Unsplash stand-ins; use each recipe's own cover image.
