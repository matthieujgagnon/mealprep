# Handoff: Planner (mobile) + Recipes v2 Direction A (Riso Poster)

## Overview
Two screens for The Matt Mo Cookbook, in the Riso Poster style (flat cobalt blue and fluorescent pink ink, 2px ink outlines, hard offset shadows, tilted yellow stickers).

1. **Planner, mobile** (`planner-mobile/`): a 390px phone screen in Québec French with three day columns visible side by side, plus the week pill opened to a monthly calendar.
2. **Recipes v2, Direction A** (`recipes-direction-a/`): the desktop Recipes page with Cookbook / Imported tabs. It has its own full `README.md`; read it for that screen.

## About the Design Files
The `.dc.html` files are **design references built in HTML**: prototypes showing the intended look and behavior, not production code. Recreate them in the target codebase's existing environment (React, Vue, SwiftUI, etc.) using its patterns and libraries. If none exists, choose the most suitable framework. `support.js` is only the prototype runtime for opening the HTML files.

## Fidelity
**High-fidelity.** Match colors, type, borders, shadows, radii, copy and layout exactly. Put every color in tokens (CSS custom properties) rather than hard-coding hex values.

## Files
- `planner-mobile/Riso Planner Mobile.dc.html`: canvas with two phones. **A** = Planner, **B** = week pill open. The data (recipes, plan, calendar dots) is in the `Component` class and is sample data.
- `recipes-direction-a/`: see its README. The HTML file also holds an unused Direction B; use `direction="A"`.
- Related desktop reference for Planner behavior: `design_handoff_riso/Riso Planner.dc.html` and `design_handoff_riso/README.md` (section 4 and the Mobile section).

---

# Planner, mobile

## Purpose
Plan the week's meals. Three days are visible at once so a recipe card sits next to its neighbors; the rest of the week scrolls sideways.

## Phone frame (mock only)
390×844, radius 48, 2px ink border. Status bar 44px (9:41). The frame, shadows and notch are presentation only; do not build them.

## Layout (top to bottom)
1. **Top block** (fixed under the status bar, `--paper`, 2px bottom border): logo "matt mo **cookbook**" (Bricolage 800 21px, "cookbook" on `--pink`, padding 0 6px, radius 5) and a 36px yellow avatar "M". Below it a horizontally scrolling pill nav (40px tall, padding 0 16, gap 6, scrollbar hidden): **Accueil, Recettes, Planificateur, Faisable, Épicerie, Circulaires, Inventaire**. Bricolage 700 14.5px. Active (Planificateur) = `--blue`, white text, 2px border, `3px 3px 0` shadow. Block height about 106px.
2. **Title block** (padding 14px 14px 0, gap 8):
   - Label: "5 – 11 OCTOBRE" (DM Mono 500 12px, .12em, uppercase).
   - Title: "La semaine **à venir.**" (Bricolage 800 38px/.95, −.035em, "à venir." in `--blue`, one line).
   - **Week row** (gap 8, align center): ‹ round button (44px, 2px border, `--card`, Bricolage 700 20px); the **week pill** (44px tall, padding 0 16, radius 22, `--yellow`, 2px border, rotated −3°, Bricolage 800 15px) reading "cette semaine ▾" (▴ when open; shadow `3px 3px 0 ink` when open); › round button; then at the right a sticker "jeu – dim →" (yellow, 1.5px border, radius 999, padding 2px 9px, rotated +3°, Bricolage 800 12px). The sticker hints that more days continue to the right.
3. **Board** (10px below the title block): a horizontally scrolling area with `scroll-snap-type: x mandatory`, scroll-padding-left 14, scrollbar hidden. Inner content is `max-content` wide, padding 0 14, column gap 6.
   - **Day header row**: 7 headers, each 104px wide and 50px tall, gap 8, radius 14, 2px border. Content: day abbreviation (DM Mono 500 10px, .12em: LUN MAR MER JEU VEN SAM DIM) over the date number (Bricolage 800 19px). **Today** shows "AUJ." on `--pink` with an ink border and `3px 3px 0 ink` shadow. A past day is greyed (`#8A8677`).
   - **Three meal rows**: **Déjeuner**, **Dîner**, **Souper** (Quebec French; "Souper" is the evening meal). Each row has a label (Bricolage 800 15px) that is `position: sticky; left: 14px`, so it stays visible while scrolling, then 7 cells in a row (gap 8, 5px between label and cells, 6px between rows).
   - **Columns are 104px wide**: with 14px padding and 8px gaps, exactly three fit and about 40px of the fourth peeks in. A 26px fade from transparent to `--paper` sits on the right edge.
   - **Cells are 104×108.** Four types:
     - **Recipe card**: `--card`, radius 14, 2px ink border. Photo 54px tall (2px bottom border, `object-fit: cover`). Under it, padding 5px 7px, space-between: the title (Bricolage 800 12px/1.15, max 2 lines) and **one stat**, the time (DM Mono 500 9.5px, .08em, `--ink-soft`; "25 MIN", "1 H", "1 H 30").
     - **"Already have it"**: 3px `--blue` border, `3px 3px 0 blue` shadow, and a 22px blue ✓ circle (2px ink border) at the top-left of the photo. Excluded from the grocery list.
     - **"Restes" (leftover)**: normal card plus a yellow sticker "restes" (1.5px border, radius 999, Bricolage 800 10.5px, rotated −4°) at the right edge of the photo's bottom.
     - **Note**: `--paper`, 2px ink border, centered "✎ NOTE" (DM Mono 500 9.5px, `--ink-muted`) over the text (Bricolage 700 13px).
     - **Empty**: 2px dashed `#BDB6A6` border, "+ ajouter" in `--blue` (Bricolage 700 13px).
   - **Past day** (Lun): cells at 60% opacity, photo greyscale, 1.5px `#BDB6A6` border, no shadows.
4. **Bottom bar** (fixed to the bottom, 68px, `--paper`, 2px top border, padding 8px 14px): primary button, 50px tall, radius 25, `--blue`, white, 2px border, `3px 3px 0` shadow, Bricolage 800 16px: "Créer la liste d'épicerie · 7" (the number is the count of items to buy).

### Sample plan (for reference)
Recipes: Burritos déjeuner 20 MIN; Crêpes au babeurre 25 MIN (have it); Bols shawarma poulet 40 MIN; Salade pois chiches 25 MIN; Tacos aux crevettes 30 MIN; Pâté chinois 1 H.
- Lun: Burritos / Bols shawarma / Bols shawarma. 
- Mar (today): Crêpes (have it) / Salade pois chiches / Tacos.
- Mer: empty / note "Dîner au bureau" / Pâté chinois.
- Jeu → Dim continue off-screen (see the file for the full week).

## Week pill open (state B)
Tapping the yellow pill opens a calendar dropdown below the week row.
- **Backdrop**: `rgba(22,24,31,.45)` over everything under the status bar. The week row (arrows and pill) stays above it, un-dimmed.
- **Panel**: from the week row's left edge to its right edge, 14px below it. `--card`, 2px ink border, radius 24, shadow `6px 6px 0 ink`, padding 14, gap 10. A 16px rotated square caret on the top border points at the pill (left 112).
- **Header**: "octobre **2026**" (Bricolage 800 26px/1, −.02em, year in `--blue`) at the left; two 44px round ‹ › buttons (2px border, `--card`) at the right move one month back/forward.
- **Weekdays**: L M M J V S D (DM Mono 500 11px, .06em, `--ink-muted`), Monday first.
- **Grid**: 7 columns, gap 3, cells 44px tall, radius 13, Bricolage 700 15px. October 2026 starts on a Thursday, so 28, 29 and 30 September show first in a muted grey (`#A9A394`) and 1 November closes the last row.
  - **Days with meals planned** have a 5px ink dot under the number.
  - **Today** (6): `--pink`, 2px ink border, `2px 2px 0 ink` shadow.
  - **Selected week** (5–11): `--yellow` cells with a 2px ink border.
  - Days in the grey rows have no fill and no border.
- **Legend**: a 6px ink dot with "REPAS PRÉVUS", and a 14px pink swatch with "AUJOURD'HUI" (DM Mono 500 10.5px, .08em).
- **Button**: "Aller à cette semaine" (48px, radius 24, `--yellow`, 2px border, Bricolage 800 15px).

## Interactions & behavior
The mock is static. Build these:
- **Initial scroll**: on load (and when the week changes to the current week) scroll the board so **today's column is centered**, the same as the desktop planner (`centerDay`). When today is Lun or Mar the scroll clamps to 0, which gives the view shown. Past days to the left stay reachable by scrolling.
- **Snap**: day columns snap at the start edge. Header row and all three meal rows scroll together (they share one scroll container).
- **Week arrows** (‹ ›): previous / next week. The label above the title ("5 – 11 OCTOBRE") and the day headers update. When the shown week is not the current one, the pill text should still read "cette semaine" only for the current week; otherwise show the range.
- **Week pill**: toggles the calendar. Tapping the backdrop or Esc closes it. Tapping a day in the calendar jumps to the week that contains it and closes the panel. "Aller à cette semaine" jumps to the current week and closes the panel.
- **Month arrows** change the month shown in the panel only; the selected-week highlight stays on its week. Dots come from the plan data for each date.
- **Tap an empty cell or a card**: no drag and drop on mobile. Tapping "+ ajouter" or a card opens the suggestions bottom sheet (white card, 2px top border, radius `28px 28px 0 0`, 48×5 drag handle, 45% ink backdrop, max height 78%): recipe rows with a 40px blue + and "✎ Ajouter une note à la place". Specified in `design_handoff_riso/README.md`, Mobile → Planner.
- **Créer la liste d'épicerie · n**: goes to Épicerie. n = distinct missing ingredients for upcoming meals, excluding "have it" and "restes" cells.
- Every interactive element is at least 44px except the recipe cards (the whole card is the tap target).

## State
- `weekStart` (date, default Monday of the current week), `calendarOpen` (bool), `calendarMonth` (year-month, default the month of `weekStart`).
- `plan[meal][date]` = `{recipeId, status: 'planned' | 'have' | 'leftover'}` | `{note}` | empty.
- Derived: `today`, `plannedDates` (dates with at least one meal, for the calendar dots), `buyCount`.
- Inventory is the source of truth for "have it" (see `design_handoff_riso/README.md`, Cross-cutting behaviour).

## Copy (Québec French)
Nav: Accueil, Recettes, Planificateur, Faisable, Épicerie, Circulaires, Inventaire. Meals: Déjeuner (breakfast), Dîner (lunch), Souper (dinner). Days: LUN MAR MER JEU VEN SAM DIM. Other strings: "La semaine à venir.", "cette semaine", "jeu – dim →", "AUJ.", "+ ajouter", "restes", "✎ NOTE", "Créer la liste d'épicerie · 7", "octobre 2026", "REPAS PRÉVUS", "AUJOURD'HUI", "Aller à cette semaine". Format other months and dates with the `fr-CA` locale.

## Design tokens
| token | hex | use |
|---|---|---|
| `--paper` | `#F4F1EA` | screen background, note cells |
| `--card` | `#FFFDF8` | recipe cards, calendar panel, round buttons |
| `--ink` | `#16181F` | text, every border and hard shadow |
| `--ink-soft` | `#3F3E37` | card stat |
| `--ink-muted` | `#5E5B52` | note label, weekday letters |
| `--track` | `#E9E4D8` | photo fallback |
| `--rule` | `#BDB6A6` | dashed empty slots, past-card border |
| `--blue` | `#2323FF` | action: bottom button, active nav, "have it", "+ ajouter", year |
| `--pink` | `#FF48B0` | today, logo highlight |
| `--yellow` | `#FFE14D` | week pill, stickers, selected week, avatar |

- **Fonts**: Bricolage Grotesque 500/700/800; DM Mono 400/500.
- **Borders**: 2px ink (1.5px on small stickers and past cards).
- **Hard shadows**: 3px (buttons, today header, have-it card, open pill), 2px (today in calendar), 6px (calendar panel).
- **Radii**: 14 (cards, day headers), 13 (calendar cells), 24 (calendar panel), pills = height ÷ 2.
- **Spacing**: screen padding 14, column and cell gap 8, meal-row gap 6.

## Assets
Photos are Unsplash stand-ins; use each recipe's own cover. No icons or SVGs: ‹ › ▾ ▴ ✓ ✎ are text characters.
