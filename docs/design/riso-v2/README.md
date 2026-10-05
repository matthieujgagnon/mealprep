# Handoff: Riso v2 redesign (Home, Recipes, Planner, Makeable)

## Overview
A redesign of **The Matt Mo Cookbook** (repo `matthieujgagnon/mealprep`, `client/src`). It covers the header, login, **Home, Recipes, Planner and Makeable**, on desktop (1280px) and phone (390px), in Quebec French first with an English version. Grocery, Flyers, Inventory, Cook mode, Store mode, the Recipe card and the Recipe editor are **not** redesigned yet; keep them as they are.

## About the design files
The files in this bundle are **design references created in HTML**: prototypes that show the intended look and behaviour. They are not production code. Recreate them in the existing React app (components in `client/src/components`, styles in `client/src/index.css` under `.riso-theme`, strings through `t()` in `i18n/en.js` and `fr.js`) using its established patterns. Do not copy the HTML or the inline styles.

## Fidelity
**High fidelity.** Colours, type, spacing, borders, shadows and interactions are final for the four screens above. Pixel-match using the app's existing `riso-*` classes and tokens where they exist.

## How to open the references
- `Final Desktop.dc.html`: clickable desktop app (tabs: Home, Recipes, Planner, Makeable).
- `Final Mobile.dc.html`: the same app inside a phone frame.
- `Riso v2 Pill Study.dc.html`: the rules for every pill colour.
- The Compare pages show desktop and phone side by side.
These are "design components" that need `support.js` next to them. Open them in a browser from this folder. Pages are slow to load (about 30 seconds); that is the prototype, not the design.

## Global rules
- **Language:** FR | EN switch in the header (stored). Every string exists in both. `riso-v2-copy.js` and `finder-data.js` hold the copy used by the prototype; map each key to the app's i18n files and reuse the app's existing keys where one exists.
- **Wording:** "dinner" becomes "supper" (FR: "souper").
- **Colour roles** (pills and tags):
  - Pink `#FF48B0`: expiring soon; today. "Planned <day>" pill uses `#FF5CB8`.
  - Yellow `#FFE14D`: time pills; "to buy" pills.
  - Green `#10C95C` (text `#00753F`, tint `#E6F5EC`): ready now, nothing to buy, on sale, in stock (✓).
  - Blue `#2323FF`: primary action, selected state, progress fill; light selected tint `#E4E4FF`.
  - Ink `#16181F` outlines on every pill.
- **Shelf colours** (ingredient picker): Fridge `#4DE3FF`, Freezer `#A56BFF`, Pantry `#EAE3CF`, Spice rack `#FFB86B`, Baking `#FFD0E8`. Custom shelves pick their own colour.
- **Time and servings:** time = yellow pill with a ⏱ (`40 min`, `6 h`); servings = "Serves 4" (FR "4 portions"); meal type = outlined chip with `#F4F1EA` fill.

## Design tokens
| Token | Value |
| --- | --- |
| Canvas | `#F4F1EA` |
| Surface (cards) | `#FFFDF8` |
| Track | `#E9E4D8` |
| Ink | `#16181F` |
| Soft text | `#3F3E37` |
| Muted text | `#5E5B52` |
| Dash | `#BDB6A6` / `#D6CFBF` |
| Danger | `#C4123F` |
| Hard shadows | `2px/3px/5px/6px/8px 0 #16181F`; blue `1.5px 0 #2323FF` for selected pills; pink `4px 4px 0 #FF48B0` for today |
| Radii | pills 999px (or height/2), cards 16 to 22px, big cards 24 to 28px |
| Borders | cards and big pills 2px; small pills and ingredient pills 1 to 1.5px |
| Fonts | display `Bricolage Grotesque` 500 to 800; body `Inter`; mono `DM Mono` for captions (uppercase, letter-spacing .1 to .12em) |
| Type sizes | page title 44px (32px phone) / 800; section title 20 to 22px / 800; card title 15px / 800; pill text 12 to 13.5px / 700 to 800; mono caption 10.5px |
| Layout | max width 1280px; page padding 40px (18px phone); card grid 4 columns desktop, 2 on phone |

## Screens

### Header
Logo "matt mo" with a pink "cookbook" highlight; tabs Home, Recipes, Planner, Makeable, Grocery, Flyers, Inventory; FR | EN switch; avatar circle (yellow) with menu (name, Help, Log out). Phone: sticky header with a scrolling pill row of tabs. Files: `Riso v2 Header.dc.html`. Repo: `App.jsx`.

### Home (`Riso v2 Home.dc.html`)
- Greeting by hour; accent-blue user name.
- Top row: "Tonight · Supper" card (blue, 8px shadow) with four states (recipe with Start cooking / Swap / Eating out; note with emoji tile; empty; marked as no meal) plus the pink Grocery card (count, progress, "Open list").
- Week strip: This week / Next week chips, "All meals / Suppers only" toggle (persisted). All-meals grid: shadow only on today's column and the current meal; next week has none; past days greyscale.
- Bottom row: **To use** (up to 5 items, coloured by days left, link to overflow), **Makeable now** (optional; when empty, Proteins takes both slots), **Proteins on sale** (expandable cards, products with photo and detail, add-to-list, the rest of the page blurs while one is open).
- Repo: `Home.jsx`, `ProteinsOnSale.jsx`.

### Recipes (`Riso v2 Recipes.dc.html`)
Search bar with "+ New recipe" inside it; Cookbook / Imported tabs with counts; meal chips (Meals first, a rule, then Makeable now and Uses expiring); Protein / Time / Sort pill menus; recipe cards with photo, yellow time pill, meta line, have-bar. Phone follows the desktop layout (a deliberate change from the app's folding sections). Repo: `RecipesDesktop.jsx`, `Recipes.jsx`, `RisoControls.jsx`.

### Planner (`Riso v2 Recipe Finder Live.dc.html`, `view="planner"`, plus `Finder.dc.html`, `FinderSheet.dc.html`)
- Board: 7 days by 3 meals (Breakfast, Lunch, Supper). Today's header is pink; weekend days are user-configurable (stored) and grouped with a pink dotted line.
- Adding: bottom search panel (always on), drag a recipe onto a slot, or click an empty slot for a pop-up card (Recipe / Note / Empty card). Clicking a filled slot opens only that recipe's pop-out. Only the × removes a meal.
- Pop-out card: time pill, servings, meal chip, planned day, what you have (green ✓ pills), what to buy (yellow pills; tap to add or remove from the grocery list), steps (always open), buttons Plan, Similar recipes, Open the full recipe.
- **Main meal** (Similar recipes): the chosen recipe sits in a yellow banner under the filters; its ingredients are grouped (protein, produce, dairy, pantry) and can be toggled; results show shared ingredients; leftovers can be placed on empty slots.
- **Ingredient picker** ("Cook with"): search; "Expiring soon" pink pill with days left; shelf drawers (Fridge, Freezer, Pantry, custom shelves) each with a name pill that holds the item count ("Fridge 6", "1/6" once picked); item pills 1px outline, selected = light blue fill, small blue ✓ circle, 1.5px blue shadow. A count pill ("3 chosen") appears next to the ×. No Done button.
- Phone: tapping a slot opens the bottom pop-up card (kept as is). Repo: `PlannerBoard.jsx`, `PlannerTray.jsx`, `PlannerMobile.jsx`, `lib/plannerSlots.js`.

### Makeable (`Riso v2 Makeable Screen.dc.html`, `view="makeown"`)
- Filter row: segmented All / Makeable now / 1 or 2 to buy (each with count), pills Expiring soon, Quick, menus Meal and Protein, a divider, and **Show sales** at the far right. On phone the segmented control is full width, the three pills share a row, then Meal and Protein share a row.
- Groups: In your week (planned recipes, most to buy first), Ready now (green count), One or two short (yellow count), Needs a shop. Headings carry a count pill; the In your week count has a blue outline.
- Card: photo with yellow time pill, title, blue have-bar, "Nothing to buy" or "Missing: …", buttons **Similar recipes** and **To buy**. Ready cards (nothing to buy) have a 5px hard shadow.
- **To buy** opens a panel under the card (card squares its bottom corners, one shadow around both): one row per missing ingredient with + Add (becomes ✓, tap to remove), a small "Add all" pill, and the items already on the grocery list as removable chips. With Show sales on, sale items get a green tag such as "-40 % Metro 5,99 $".
- **Card pop-out:** clicking the card opens a 680px pop-out centred in the view. Animation: grows out of the card and returns on close (0.35s, `cubic-bezier(.2,.8,.2,1)`); the card stays in the grid, lightly blurred (2px); the rest of the page gets a dark overlay with a 5px blur; clicking the overlay or × closes it.
- Phone: same content; cards two across; the pop-out is smaller (340px); the To buy panel hides the ingredient icon.
- Repo: new screen; reuse the recipe availability logic that Makeable already has in `WhatCanIMake.jsx`.

## Interactions & behaviour
- Pills toggle on click; selected pills use the blue tint and shadow.
- Filters combine (AND). "Makeable now" = nothing to buy; "1 or 2" = one or two missing.
- Sorting inside "In your week": missing count, high to low.
- Persist: language, weekend days, Home "all meals" toggle, shelf open/closed state is in session only.
- Add to grocery list toggles per ingredient (list state must be shared with the Grocery page).
- "Open the full recipe" goes to the existing Recipe card page (to be redesigned next).
- Responsive: layout switches on container width (below 768px = phone).

## State
Finder: filters (availability, chips, meal, protein), search text, picked ingredients, main meal id, preview id, to-buy panel id, listed ingredients, show sales, shelf open state. Planner adds: entries per slot (recipe, note, empty), selected slot, weekend days, leftovers per day. Home: week offset, all-meals toggle, selected protein.

## Data the prototype fakes
- Recipes, photos (Unsplash), inventory, expiring items and their days are sample data in `finder-data.js`.
- **Sale prices and percentages are invented.** Real deals come from the Flyers import (Flipp); verdict rules are in `docs/flyers-how-it-works.md` of the repo.
- Planned days are hard-coded.

## Assets
Photos are Unsplash placeholders and emoji are system emoji. Replace with the app's photo field and its `ItemPhoto` component. No icons beyond text glyphs (×, ✓, ▾, ⏱).

## Files in this bundle
- `Final Desktop.dc.html`, `Final Mobile.dc.html`: entry points.
- `Riso v2 Header`, `Riso v2 Home`, `Riso v2 Recipes`, `Riso v2 Login`, `Riso v2 Recipe Finder Live` (planner and makeable), `Finder`, `FinderSheet`, `Riso v2 Makeable Screen`: screens.
- `finder-data.js`, `riso-v2-copy.js`: sample data and copy (EN and FR).
- `Riso v2 Pill Study`: pill rules. `Riso v2 Makeable`, `Riso v2 Home Compare`, `Riso v2 Recipes Compare`, `Riso v2 Planner Compare`: side-by-side desktop and phone.
- `Baseline Audit.md`: notes on how the existing app works, screen by screen. `Planner Brief.md`: how the planner suggestions work. `PM Brief - Design Changes.md`: the change summary.
- `support.js`: runtime for the references; not part of the app.

## Suggested order
1. Tokens and pills (Pill Study) into `index.css`.
2. Header and language switch.
3. Home, then Recipes.
4. The shared finder and the Planner.
5. Makeable (new layout and the To buy panel).
6. Replace sample sale data with real deals once the PM confirms the source.
