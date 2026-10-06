# Shared pieces (components.md)

**Before building any new piece of UI, check this list and reuse or extend what is here. Never build a second version of something that already exists.** When you add or change a shared piece, update its entry in this file in the same change.

Everything below is one piece used by every page that shows the same thing. The page around it only passes data and what happens next.

| Piece | File | What it is |
| --- | --- | --- |
| Recipe pop-out | `components/RecipePopout.jsx` | The small window for a recipe. |
| Ingredient marks | `IngredientMarks` in `components/RecipePopout.jsx`, `grocery.toggle` in `App.jsx` | The round ✓ on an ingredient: blue = in Inventory, green = on the grocery list. |
| Slot picker | `components/SlotPicker.jsx` | The mini week where you choose a day and meal. |
| Toast | `components/Toast.jsx` | The one message with Undo. |
| Planner header | `components/PlannerHeader.jsx` | The title, the week controls (‹, date pill, ›, "this week" sticker) and the calendar they open. |
| Week calendar | `components/WeekCalendar.jsx` | The month calendar the date pill opens, with the day preview and "Copy last week". |
| Planner legend | `components/PlannerLegend.jsx` | The legend under the Planner board. |
| Makeable now rule | `lib/mealSlots.js`, `hooks/useIncludeSides.js`, `IncludeSidesToggle` | What counts as "makeable". |
| `openRecipeCard` | `App.jsx` | Opens a recipe's card on the Recipes page. |
| Riso pills and chips | `components/RisoPills.jsx`, `lib/pills.js` | Every pill, tag and chip. |
| Confirm dialog | `components/ConfirmDialog.jsx` | The one "are you sure?" question. |
| Recipe finder | `components/Finder.jsx`, `hooks/useFinder.js`, `lib/finder.js` | Search, filters, Main meal and results. |
| Grocery item | `components/GroceryItem.jsx` | One grocery row. |
| Inventory item form | `components/InventoryItemForm.jsx` | Add or edit an Inventory item. |
| Inventory confirm sheet | `components/InventoryConfirm.jsx` | Confirm anything going into Inventory (see `CLAUDE.md`). |

## Recipe pop-out

`RecipePopout` is the look; `RecipePopoutHost` works out its lists. **`App.jsx` renders the one host**, so a recipe opens the same pop-out from the Planner (board cards and finder results), Recipes and Home. Makeable and the recipe card use it next.

It shows time and servings, the meal, "Planned Wednesday", what you have, what to buy (tap to put an item on the grocery list, or take it off; see Ingredient marks), the steps, and four buttons: **Plan** (first), **Cook**, **Similar recipes** and **Open the full recipe**.

Open it with `openPopout(recipeOrId, from?)` (`from` is the box of the card it grows out of). Main props:

- `RecipePopoutHost`: `recipe`, `from`, `haveCores`, `plannedEntries`, `grocery` (`{ isOnList, add, remove, toggle }`), `deals` and `showSales` (optional green sale pills).
- Buttons (each optional): `onPlan`, `onCook`, `onSimilar`, `onOpenFull`, `onClose`.

In `App.jsx`: Plan calls `requestPlan`, Cook and Open the full recipe call `openRecipeCard`, Similar recipes sets `plannerMainId` and goes to the Planner.

Used by: Planner (`Finder` results, board cards on a phone), Recipes (`RecipeCard`), Home (week strip).

## Ingredient marks

Every place that lists a recipe's ingredients marks each one with the same round ✓, so it is one piece, not three:

- **Blue ✓**: in your Inventory (it follows Inventory by itself).
- **Green ✓**: not in Inventory, but on your grocery list. Tapping it takes the item off the list and shows the shared Toast with Undo; tapping the + that replaces it puts the item back.
- **White +**: neither; tap to put it on the list. (Inventory wins if an item is both.)

`IngredientMarks` (in `RecipePopout.jsx`) draws the "you have" and "to buy" lists for the recipe pop-out and the Planner's planned-meal card. The full recipe card (`RecipeDetailModal`) draws the same three marks as the dot beside each ingredient and the three-part legend under the list. All of them read `grocery.isOnList` and call `grocery.toggle`, which `App.jsx` builds once (`toggleGroceryItem`), so Grocery and every mark always agree. A page that shows ingredients gets `grocery` as a prop; do not read the grocery list any other way.

## Slot picker

`SlotPicker` is a small week (7 days by breakfast, lunch, supper) to choose where a recipe goes, with ‹ › to move between weeks, a "Free slot / Replaces ..." line and the confirm button. **`App.jsx` opens it with `requestPlan(recipe)`**, so Plan works the same from any page. It opens on the week the Planner last showed, on the slot chosen as the target if there is one, else the next empty slot. Confirming calls `handlePlanRecipe(recipe, slot, week)`, which places the recipe and shows the toast.

Props: `recipe`, `weekStart`, `entries` (that week's), `weekend`, `initialSlot`, `onConfirm(slot, week)`, `onClose`.

Used by: the pop-out's Plan (Planner, Recipes, Home) and the Planner finder's + when no slot is chosen.

## Toast

`Toast` is a dark pill at the bottom of the screen for five seconds, with Undo when the change can be taken back. **`App.jsx` keeps it**: `showToast(message, undo?)`, passed down as `onToast` (Recipes, Inventory) and `actions.toast` (Planner). Do not draw another message. Put what undoing means in `undo`.

It sits above every pop-out, picker and question (z-index 500), so Undo can be pressed while one is open.

Used by: Planner (add, replace, remove, copy, leftovers, Option-drag copies, and "Clear" on a day: one message "Tuesday cleared" whose Undo puts every meal, note and empty card back through `restoreEntry`, leftover marks included, no question first), Recipes (imported), Inventory (added, saved), and the grocery ✓ in Ingredient marks (taken off the list).

## Planner header

`PlannerHeader` is the strip above the Planner board, on a computer and on a phone (design: `docs/design/riso-v2-planner-header/`). The title « Le menu de la **semaine.** » / "This week's **menu.**" is at the left and **never changes with the week**. At the right: ‹, the date pill (blue while the calendar is open), ›, and the yellow sticker, "this week" on the current week and "↩ this week" on another (it goes back). On a phone the title is above the controls and wraps if it is too long. The dates are written with `formatWeekLabel(weekStart)` (`lib/dates.js`): "Oct 5 – 11" / "5 – 11 oct.". Use that everywhere a week is named.

Props: `weekStart`, `onChangeWeek(weekStart)`, `lastWeekCount`, `onCopyLastWeek`. The desktop Planner and `PlannerMobile` both render it, so there is one header.

## Week calendar

`WeekCalendar` is what the date pill opens, centred under the pill (on a phone it lines up with the page edge). A month drawn as weeks: three dashes under each day (breakfast, lunch, supper; blue when planned), the shown week yellow, today pink. A row **picks that week** and closes the calendar. The month arrows only change the month; the arrows next to the pill change the week.

- **Day preview**: on a computer, hovering a day shows a card to the left with its three meals, real recipe photos and the rotated "leftover" tag (`Pill` sticker). On a phone there is no hover: tapping a day shows the same card under that day's row, with "Show this week", and a row does not pick the week.
- **Footer**: "Go to this week" and "↺ Copy last week". Copy fills only empty slots, shows the toast with Undo (`actions.copyLastWeek`) and the button says "✓ Copied" for a moment. It is greyed out when last week is empty.

The data is `GET /api/planner/dates` (`{ date, meals }` for each planned day; each meal has `mealType`, `title`, `placeholder`, `photoUrl`, `isLeftover`). Its helpers are in `lib/plannerCalendar.js` (`monthWeeks`, `inWeek`, `weekOf`).

Props: `weekStart`, `onPick(dateKey)`, `onThisWeek`, `onCopyLastWeek` (resolves with how many meals it copied), `canCopy`, `onClose`.

Used by: `PlannerHeader`.

## Planner legend

`PlannerLegend` is the row under the board on every size: planned meal, ingredients on hand (blue outline), leftovers (yellow tag), note, empty slot, today and, when the board shows one, the weekend ("Fin de semaine", without the list of days). Prop: `weekendOn`. Used by the desktop board (`PlannerBoard`) and `PlannerMobile`.

## Makeable now rule

"Makeable now" counts **meals only**: recipes for breakfast, lunch or supper, and recipes with no type yet. Sides, snacks, desserts and pantry / prep recipes (sauces live there) are left out, unless "Include pantry and sides" is on.

- `isMakeableMeal(recipe, includeSides)` and `makeableRuleOn(includeSides, narrowedToSlot)` in `lib/mealSlots.js`. When someone narrows to a left-out type themselves (the Sides chip, the Meal menu on Dessert), the rule does not apply.
- `useIncludeSides()` is the one saved setting (this browser), so every page agrees.
- `IncludeSidesToggle` (`components/RisoControls.jsx`) is the switch, « Inclure garde-manger et accompagnements » / "Include pantry and sides".

Used by: Recipes (Makeable now chip and the count line), Home (Makeable now card), Makeable (page and chips), the finder (Ready count and results).

## openRecipeCard

`openRecipeCard(recipeOrId)` in `App.jsx` opens a recipe's card (`RecipeDetailModal`) on the Recipes page. **Every "Cook" and "Open the full recipe" goes through it**, so they all land in the same place: the planned-meal card's Cook, the pop-out's Cook and Open the full recipe, Home's Start cooking, Makeable's Cook tonight. Starting Cook mode is the button inside the card.

Passed down as `onOpenRecipeCard`.

## Riso pills and chips

`RisoPills.jsx` holds every pill: `Pill` (sizes tag, fact, chip, badge; tones; `selected`), `TimePill`, `ServesPill`, `MealChip`, `PlannedPill`, `ToBuyPill`, `InStockPill`, `SalePill` and `CountPill`. A screen uses these instead of a new pill class. The Recipes card (`RecipeCard` in `Recipes.jsx`) is drawn only with them: `TimePill`, `ServesPill`, `MealChip`, a `Pill` for the protein and the pink / green flags, plus one small "N to buy" / "Nothing to buy" line (`.rv2-card-buy`, no have-bar). The comment block at the top of the file says which to use and what the colours mean; see `docs/design/riso-v2/`.

## Confirm dialog

`ConfirmDialog` is the app's own "are you sure?" question, in the Riso v2 style instead of the browser's `window.confirm`: a small centred pop-up (white card, black outline, hard shadow) over a dimmed page, with a question and two pill buttons. The safe answer comes first, is blue and has the focus. Escape, a tap on the dimmed area and the safe button all give it, and they close only the question: Escape never reaches the form underneath.

Props: `message`, `stayLabel` and `leaveLabel`, `onStay`, `onLeave`. Its classes are `riso-ask*` (`riso-confirm*` belongs to the Inventory confirmation sheet). The two buttons reuse the pop-out's `fnd-pop-btn`.

Used by: the recipe form (the new-recipe pop-up and the full-page editor) when closed with something typed, and `App.jsx` when a header tab is pressed with unsaved changes. The text is `editor.leaveUnsaved` / `app.leaveUnsaved` with « Continuer à modifier » (`editor.keepEditing`) and « Abandonner » (`editor.discard`). Other confirmations still use the browser's dialog (delete recipe, remove a store, clear flyers, leave Cook mode with a timer); move them here when they are next touched.

## Recipe finder

`Finder` is the search bar, "Cook with", filters, the Main meal banner and the results, for the Planner's panel (`layout="panel"`) and the phone's bottom card (`layout="sheet"`). `useFinder()` holds what it shows. It does not hold the recipe pop-out: it asks the caller (`onOpenPopout`) and `onAdd` is the caller's. Choosing Similar recipes scrolls the Main meal banner into view.

## Where things live in `App.jsx`

`App.jsx` owns the data and the shared pieces above: `openPopout`, `requestPlan`, `openRecipeCard`, `showToast`. A page gets them as props. A new page that needs a recipe opened, a recipe planned or a message shown uses these and does not make its own.
