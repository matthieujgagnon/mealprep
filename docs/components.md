# Shared pieces (components.md)

**Before building any new piece of UI, check this list and reuse or extend what is here. Never build a second version of something that already exists.** When you add or change a shared piece, update its entry in this file in the same change.

Everything below is one piece used by every page that shows the same thing. The page around it only passes data and what happens next.

| Piece | File | What it is |
| --- | --- | --- |
| Recipe pop-out | `components/RecipePopout.jsx` | The small window for a recipe. |
| Slot picker | `components/SlotPicker.jsx` | The mini week where you choose a day and meal. |
| Toast | `components/Toast.jsx` | The one message with Undo. |
| Week calendar | `components/WeekCalendar.jsx` | The month calendar a week picker opens. |
| Makeable now rule | `lib/mealSlots.js`, `hooks/useIncludeSides.js`, `IncludeSidesToggle` | What counts as "makeable". |
| `openRecipeCard` | `App.jsx` | Opens a recipe's card on the Recipes page. |
| Riso pills and chips | `components/RisoPills.jsx`, `lib/pills.js` | Every pill, tag and chip. |
| Recipe finder | `components/Finder.jsx`, `hooks/useFinder.js`, `lib/finder.js` | Search, filters, Main meal and results. |
| Grocery item | `components/GroceryItem.jsx` | One grocery row. |
| Inventory item form | `components/InventoryItemForm.jsx` | Add or edit an Inventory item. |
| Inventory confirm sheet | `components/InventoryConfirm.jsx` | Confirm anything going into Inventory (see `CLAUDE.md`). |

## Recipe pop-out

`RecipePopout` is the look; `RecipePopoutHost` works out its lists. **`App.jsx` renders the one host**, so a recipe opens the same pop-out from the Planner (board cards and finder results), Recipes and Home. Makeable and the recipe card use it next.

It shows time and servings, the meal, "Planned Wednesday", what you have, what to buy (tap to put an item on the grocery list, or take it off), the steps, and four buttons: **Plan** (first), **Cook**, **Similar recipes** and **Open the full recipe**.

Open it with `openPopout(recipeOrId, from?)` (`from` is the box of the card it grows out of). Main props:

- `RecipePopoutHost`: `recipe`, `from`, `haveCores`, `plannedEntries`, `grocery` (`{ isOnList, add, remove }`), `deals` and `showSales` (optional green sale pills).
- Buttons (each optional): `onPlan`, `onCook`, `onSimilar`, `onOpenFull`, `onClose`.

In `App.jsx`: Plan calls `requestPlan`, Cook and Open the full recipe call `openRecipeCard`, Similar recipes sets `plannerMainId` and goes to the Planner.

Used by: Planner (`Finder` results, board cards on a phone), Recipes (`RecipeCard`), Home (week strip).

## Slot picker

`SlotPicker` is a small week (7 days by breakfast, lunch, supper) to choose where a recipe goes, with ‹ › to move between weeks, a "Free slot / Replaces ..." line and the confirm button. **`App.jsx` opens it with `requestPlan(recipe)`**, so Plan works the same from any page. It opens on the week the Planner last showed, on the slot chosen as the target if there is one, else the next empty slot. Confirming calls `handlePlanRecipe(recipe, slot, week)`, which places the recipe and shows the toast.

Props: `recipe`, `weekStart`, `entries` (that week's), `weekend`, `initialSlot`, `onConfirm(slot, week)`, `onClose`.

Used by: the pop-out's Plan (Planner, Recipes, Home) and the Planner finder's + when no slot is chosen.

## Toast

`Toast` is a dark pill at the bottom of the screen for five seconds, with Undo when the change can be taken back. **`App.jsx` keeps it**: `showToast(message, undo?)`, passed down as `onToast` (Recipes, Inventory) and `actions.toast` (Planner). Do not draw another message. Put what undoing means in `undo`.

Used by: Planner (add, replace, remove, copy, leftovers), Recipes (imported), Inventory (added, saved).

## Week calendar

`WeekCalendar` is what the week pill opens: a month, with three small bars under each day (breakfast, lunch, supper; filled when planned), the shown week yellow, today pink, and a tooltip on hover listing the day's meals. The data is `GET /api/planner/dates` (`{ date, meals }` for each planned day). Its helpers are in `lib/plannerCalendar.js`.

Props: `weekStart`, `onPick(dateKey)`, `onThisWeek`, `onClose`. Weeks are written with `formatWeekLabel(weekStart)` (`lib/dates.js`): "Oct 5 – 11" / "5 – 11 oct.". Use that everywhere a week is named.

Used by: the desktop Planner's header and the phone Planner's week pill.

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

`RisoPills.jsx` holds every pill: `Pill` (sizes tag, fact, chip, badge; tones; `selected`), `TimePill`, `ServesPill`, `MealChip`, `PlannedPill`, `ToBuyPill`, `InStockPill`, `SalePill` and `CountPill`. A screen uses these instead of a new pill class. The comment block at the top of the file says which to use and what the colours mean; see `docs/design/riso-v2/`.

## Recipe finder

`Finder` is the search bar, "Cook with", filters, the Main meal banner and the results, for the Planner's panel (`layout="panel"`) and the phone's bottom card (`layout="sheet"`). `useFinder()` holds what it shows. It does not hold the recipe pop-out: it asks the caller (`onOpenPopout`) and `onAdd` is the caller's. Choosing Similar recipes scrolls the Main meal banner into view.

## Where things live in `App.jsx`

`App.jsx` owns the data and the shared pieces above: `openPopout`, `requestPlan`, `openRecipeCard`, `showToast`. A page gets them as props. A new page that needs a recipe opened, a recipe planned or a message shown uses these and does not make its own.
