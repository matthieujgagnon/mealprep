# Shared pieces (components.md)

**Before building any new piece of UI, check this list and reuse or extend what is here. Never build a second version of something that already exists.** When you add or change a shared piece, update its entry in this file in the same change.

Everything below is one piece used by every page that shows the same thing. The page around it only passes data and what happens next.

| Piece | File | What it is |
| --- | --- | --- |
| Recipe pop-out | `components/RecipePopout.jsx` | The small window for a recipe. |
| Ingredient marks | `IngredientMarks` in `components/RecipePopout.jsx`, `grocery.toggle` in `App.jsx` | The round ✓ on an ingredient: blue = in Inventory, green = on the grocery list. |
| Slot picker | `components/SlotPicker.jsx` | The mini week where you choose a day and meal. |
| Toast | `components/Toast.jsx` | The one message with Undo. |
| Planner header | `components/PlannerHeader.jsx` | The title on its own line, the week controls (‹, date pill, ›; the "this week" sticker on a computer, the page stickers on a phone) and the calendar they open. |
| Week calendar | `components/WeekCalendar.jsx` | The month calendar the date pill opens, with the day preview and "Copy last week"; on a phone a panel that also holds the weekend's settings. |
| Weekend settings | `WeekendSettings` in `components/PlannerExtras.jsx` | The weekend's switch, days, evening before and presets: in the computer's menu under the tag, and in the phone calendar's "Fin de semaine" section. |
| Planner legend | `components/PlannerLegend.jsx` | The legend under the Planner board on a computer. |
| Planner board | `components/PlannerBoard.jsx` | The week board on a computer (seven days). Its card pieces (`PlannerMealCard`, `PlannerNoteCard`) are the phone board's too. |
| Phone Planner board | `components/PlannerBoardPhone.jsx`, `lib/plannerPhone.js` | The week board on a phone: three days at a time on a track that slides under the pinned meal names, with the weekend band and the inline card. |
| Slot card and planned-meal card | `components/PlannerCards.jsx` | The cards that open from a Planner slot: beside it on a computer, under its row on a phone (`inline`). |
| Trash strip | `components/TrashZone.jsx` | The strip at the bottom of a phone while a Planner card is held: drop on it to remove, with Undo. |
| Recipe photo | `components/RecipePhoto.jsx` | Every recipe photo: one that fails to load disappears, and tries again for another address. |
| Makeable now rule | `lib/mealSlots.js`, `hooks/useIncludeSides.js`, `IncludeSidesToggle` | What counts as "makeable". |
| `openRecipeCard` | `App.jsx` | Opens a recipe's card on the Recipes page. |
| Riso pills and chips | `components/RisoPills.jsx`, `lib/pills.js` | Every pill, tag and chip. |
| Confirm dialog | `components/ConfirmDialog.jsx` | The one "are you sure?" question. |
| Recipe finder | `components/Finder.jsx`, `components/FinderTiles.jsx`, `hooks/useFinder.js`, `lib/finder.js` | Search, filters, Main meal and results (the Planner's panel, and the Makeable page). |
| Grocery item | `components/GroceryItem.jsx` | One grocery row. |
| Inventory item form | `components/InventoryItemForm.jsx` | Add or edit an Inventory item. |
| Inventory confirm sheet | `components/InventoryConfirm.jsx` | Confirm anything going into Inventory (see `CLAUDE.md`). |

## Recipe pop-out

`RecipePopout` is the look; `RecipePopoutHost` works out its lists. **`App.jsx` renders the one host**, so a recipe opens the same pop-out from the Planner (board cards and finder results), Recipes, Home and Makeable.

It shows time and servings, the meal, "Planned Wednesday", what you have, what to buy (tap to put an item on the grocery list, or take it off; see Ingredient marks), the steps, and four buttons: **Plan** (first), **Cook**, **Similar recipes** and **Open the full recipe**.

Open it with `openPopout(recipeOrId, from?)` (`from` is the box of the card it grows out of). Main props:

- `RecipePopoutHost`: `recipe`, `from`, `haveCores`, `plannedEntries`, `grocery` (`{ isOnList, add, remove, toggle, addWithUndo }`), `deals` and `showSales` (optional green sale pills).
- Buttons (each optional): `onPlan`, `onCook`, `onSimilar`, `onOpenFull`, `onClose`.

In `App.jsx`: Plan calls `requestPlan`, Cook and Open the full recipe call `openRecipeCard`, Similar recipes sets `plannerMainId` and goes to the Planner. **On Makeable there is no Cook, and Similar recipes sets the Main meal on Makeable itself** (`makeableFinder.setMainMeal`), with the sale pills following Makeable's "Show sales".

Used by: Planner (`Finder` results, board cards on a phone), Recipes (`RecipeCard`), Home (week strip), Makeable (tiles).

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

Used by: Planner (add, replace, remove, copy, leftovers, a card dropped on the phone's trash strip, a phone status tap ("marked as leftovers", with Undo putting the old mark back), Option-drag copies, and "Clear" on a day: one message "Tuesday cleared" whose Undo puts every meal, note and empty card back through `restoreEntry`, leftover marks included, no question first), Recipes (imported), Inventory (added, saved), the grocery ✓ in Ingredient marks (taken off the list) and Makeable's À acheter ("N items added to the grocery list", Undo takes them off again).

## Planner header

`PlannerHeader` is the strip above the Planner board, on a computer and on a phone (designs: `docs/design/riso-v2-planner-header/`, and for the phone `docs/design/riso-v2-planner-mobile-v2/`). The title « Le menu de la **semaine.** » / "This week's **menu.**" has a line to itself, is **never changed by the week**, and wraps to two lines on a phone (the last word in blue). Under it, the controls: ‹, the date pill (blue while the calendar is open), ›.

- **Computer:** the row ends with the yellow sticker, "this week" on the current week and "↩ this week" on another (it goes back). The pill always reads the range, `formatWeekLabel(weekStart)` (`lib/dates.js`): "Oct 5 – 11" / "5 – 11 oct.".
- **Phone:** a small date line sits above the title (`formatWeekRangeLong`: `5 – 11 OCTOBRE`). The pill is smaller and tilted, and says « cette semaine » on the current week and the range on another (the calendar's "Go to this week" goes back). The row ends with the **page stickers** (`pageStickers(page)` in `lib/plannerPhone.js`: « jeu–sam → » on page 1, « ← lun–mer » and « ven–dim → » on page 2, « ← jeu–sam » on page 3), which move the board three days at a time. ‹ › change the week.

Use the one `formatWeekLabel` wherever a week is named.

Props: `weekStart`, `onChangeWeek(weekStart)`, `lastWeekCount`, `onCopyLastWeek`, and for a phone `page`, `onPage(page)`, `weekend`, `onWeekendChange`. The Planner renders it on every size, so there is one header.

## Week calendar

`WeekCalendar` is what the date pill opens. A month drawn as weeks: three dashes under each day (breakfast, lunch, supper; blue when planned), the shown week yellow, today pink. On a computer it sits centred under the pill and a row **picks that week**. On a phone it is a panel from just under the controls row down to 14px from the bottom and the sides, with a caret under the pill, over a dimmed backdrop (the controls stay in front of it); a row does not pick the week. The month arrows only change the month; the arrows next to the pill change the week.

- **Day preview**: on a computer, hovering a day shows a card to the left with its three meals, real recipe photos and the rotated "leftover" tag (`Pill` sticker). On a phone there is no hover: tapping a day shows the same card under that day's row (« Jeudi 8 octobre », « 2 PRÉVUS »), with "Show this week".
- **Weekend (phone only)**: after a dashed rule, the « Fin de semaine » section is the shared `WeekendSettings` (`inCalendar`): the switch, `DAYS · summary`, seven one-letter day buttons, « la veille au souper », the presets. Every change is saved at once, the same setting as the computer's tag menu.
- **Footer**: "Go to this week" (yellow on a phone) and "↺ Copy last week". Copy fills only empty slots, shows the toast with Undo (`actions.copyLastWeek`) and the button says "✓ Copied" for a moment. It is greyed out when last week is empty.

The data is `GET /api/planner/dates` (`{ date, meals }` for each planned day; each meal has `mealType`, `title`, `placeholder`, `photoUrl`, `isLeftover`). Its helpers are in `lib/plannerCalendar.js` (`monthWeeks`, `inWeek`, `weekOf`).

Props: `weekStart`, `onPick(dateKey)`, `onThisWeek`, `onCopyLastWeek` (resolves with how many meals it copied), `canCopy`, `weekend`, `onWeekendChange` (a phone), `onClose`.

Used by: `PlannerHeader`.

## Weekend settings

`WeekendSettings` (in `components/PlannerExtras.jsx`) is the one set of controls for the weekend: a switch to show it, any days in any order, a switch for the evening before, and the three presets. Each change goes to `onChange(weekend)` and is saved at once for the account (`handleSaveWeekend` in `App.jsx`, `lib/weekend.js` for the model). `WeekendMenu` wraps it in the popover under the "WEEKEND ▾" tag on a computer; with `inCalendar` it is the « Fin de semaine » section of a phone's week calendar (the title is the switch's label, one letter per day, a `DAYS · summary` line). Do not build a second weekend control.

## Planner legend

`PlannerLegend` is the row under the board on a computer: planned meal, ingredients on hand (blue outline), leftovers (yellow tag), note, empty slot, today and, when the board shows one, the weekend ("Fin de semaine", without the list of days). Prop: `weekendOn`. Used by `PlannerBoard`. The phone board has no legend (the v2 design leaves it out).

## Planner board

`PlannerBoard` draws the week for the Planner on a computer: all seven days in view. On a phone the Planner draws `PlannerBoardPhone` instead (design: `docs/design/riso-v2-planner-mobile-v2/`), which reuses `PlannerBoard`'s card pieces (`PlannerMealCard`, `PlannerNoteCard`, `computeStaleLeftoverIds`) and the same drop slots (`day-<d>-<meal>`), so cards, drag, swap, Clear and the toast are the same pieces everywhere.

**Phone board.** Three days in view on a track (`.pmb-track`, 104px columns, 8px apart, about 40px of the next day peeking) that slides with `translateX(trackX(page, dragDx))` (`lib/plannerPhone.js`; pages start at days 0, 3 and 4 so every page has three days, `PHONE_PAGE_STARTS`). The meal names (Déjeuner, Dîner, Souper) are **not on the track**: they sit at x = 14 above each row and follow the rows when an inline card pushes them down. All the numbers (row tops, the board's height, the card's place, the notch, the weekend band's outline) come from `boardGeometry`, `notchLeft` and `weekendBands`, so everything agrees on where a row is. The page is owned by `Planner` and changed by the header's stickers, a swipe along the board (past 50px; pointer events with `touch-action: pan-y`; ignored while a card is being dragged) and holding a dragged card near the left or right of the screen (`useDndMonitor`). A new week starts on the page with today (Mon–Wed for another week), without sliding.

A card is 104 × 104 (photo 50px, name, time), with a 3px blue border for "already have", a 3px yellow border and the « restes » tag for leftovers, no round ✓ and no ×; a note says « ✎ NOTE » over its text; "Nothing planned" is a plain solid card; past days are faded and cannot be opened. « Vider » is a tiny link under each future day with something planned. The weekend is a dotted pink band (an SVG outline, an L when it takes in the evening before); its settings live in the calendar. The open slot or meal's card is the board's `inline` prop (see Slot card), measured so the rows below move.

The computer's board: seven days by three meals, the weekend, cards and "Clear" as on every size (`lib/weekend.js`). Cards and results (and Store mode's grocery rows, which drop on a store) are picked up by a long press on a touch screen (the app's one drag setup in `App.jsx`: `PointerSensor` with a delay, a `touchmove` that keeps the page still once a drag has started, `touch-action: pan-y` so a plain swipe still scrolls). The fallback is the shared + / pop-out Plan, which opens the slot picker.

Props (computer): `entries`, `weekStart`, `weekend`, `selectedSlot`, `leftoverMode`, `onCardClick`, `onNoteClick`, `onRemove`, `onClearDay`, `onCycleState`, `onEmptyClick`, `onWeekendMenu`. The phone board takes the same (minus the weekend menu) plus `page`, `onPageChange` and `inline`. Used by: `Planner`.

**Trash strip.** While a planned card or note is held on a phone, `TrashZone` (`components/TrashZone.jsx`) shows a strip fixed to the bottom of the screen in place of the search bar: « Déposer ici pour retirer », pink and « Relâcher pour retirer » when the card is over it. A drop on `planner-trash` calls the same removal as the × (`handleRemoveWithUndo` in `App.jsx`), so the shared Toast offers Undo. The page does not auto-scroll while the card is over it. A result carried from the finder does not show it.

## Slot card and planned-meal card

`SlotCard` (Recipe / Note / Nothing planned, the note box with quick notes and Save) and `PlannedCard` (a preview, then Cook, Use as a base, Replace this recipe) open beside the slot on a computer. With `inline` (a phone) they are the same cards, with the same content and rules, drawn directly **under the tapped slot's row** by the phone board (it gives the card its place and a notch pointing at the slot, and pushes the rows below down); tapping the slot again, ✕ or Escape closes it. The three tiles are in the desktop colours with a glyph over the label: Recipe blue, Note yellow, Nothing planned white (planned meal: Cook blue, Use as a base yellow, Replace white).

**Nothing planned asks twice, on every size**: the first tap turns the tile ink (`--ink`) with a pink shadow and "✓ Confirm" (blue is Recipe); the second marks the slot; Escape or tapping elsewhere puts it back.

On a phone the planned meal's card shows the photo, the slot (« MER 7 · SOUPER »), the name, the time and a **status** that is also a button (`state`, `onCycle`): « RIEN À ACHETER », « 2 À ACHETER », « RESTES » or « DÉJÀ EN MAIN », with a ⟳. Tapping it steps plain → restes → déjà en main → plain (`actions.cycleState(id, { toast: true })`), and the shared Toast says what changed with Undo (it puts the old mark back). Recipe and Replace make the slot the search panel's target and the page scrolls to the panel (`showFinder` in `Planner.jsx`).

## Recipe photo

`RecipePhoto` is the `<img>` for every recipe photo (board cards, the finder, pop-out, Recipes, Home, pickers). When the picture fails it hides itself, and it remembers which address failed, so the same element given another address (a card reused for another recipe or week) tries again instead of staying hidden. Do not hide a broken photo with your own `onError`.

## Makeable now rule

"Makeable now" counts **meals only**: recipes for breakfast, lunch or supper, and recipes with no type yet. Sides, snacks, desserts and pantry / prep recipes (sauces live there) are left out, unless "Include pantry and sides" is on.

- `isMakeableMeal(recipe, includeSides)` and `makeableRuleOn(includeSides, narrowedToSlot)` in `lib/mealSlots.js`. When someone narrows to a left-out type themselves (the Sides chip, the Meal menu on Dessert), the rule does not apply.
- `useIncludeSides()` is the one saved setting (this browser), so every page agrees.
- `IncludeSidesToggle` (`components/RisoControls.jsx`) is the switch, « Inclure garde-manger et accompagnements » / "Include pantry and sides".

Used by: Recipes (Makeable now chip and the count line), Home (Makeable now card), Makeable (every section and count, with its "Include pantry and sides" switch at the end of the count line), the finder (Ready count and results).

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

`Finder` is the search bar, "Cook with", filters, the Main meal banner and the results, for the Planner's panel at the bottom of the page (`layout="panel"`, on a computer and on a phone; `layout="sheet"` is for a bottom card) and for the Makeable page (`layout="page"`, below). `useFinder()` holds what it shows. It does not hold the recipe pop-out: it asks the caller (`onOpenPopout`) and `onAdd` is the caller's. Choosing Similar recipes scrolls the Main meal banner into view.

**On a phone** the same markup is dressed as the design's search panel (`docs/design/riso-v2-planner-mobile-v2/`): one pill holding the box for typing (« Chercher une recette »), the target chip (« mer · Déjeuner ✕ ») and a **Browse / Close** button (`.fnd-bar-toggle`, hidden on a computer); closed, nothing else shows. Open, it shows the « AVEC… » strip (« + Cuisiner avec… »), the filters as chips in the design's order (Faisable maintenant, 1 ou 2 à acheter, Expire bientôt, Repas ▾, Protéine ▾, Rapide; a second tap on the first two turns them off, and the "All" choice is not shown), the count and the results two across. Repas, Protéine and Cuisiner avec… are the shared menus, as on a computer. The **Main meal banner** stacks on a phone: the photo as a strip on top, then the text and ingredient chips across the width, the buttons at the bottom.

**Makeable page** (`layout="page"`; `components/Makeable.jsx` adds the title; design `docs/design/riso-v2-makeable/`). Same search, "With" strip, picker, filters (Repas and Protéine are the shared menus) and Main meal banner, with these differences:

- **Sections** instead of one grid: Meals of the week (planned this week; closed to begin with), Ready now, One or two short, Needs a shop (`makeableSections`, with a count badge and a line of words each). A planned recipe is only in the first. The Makeable now rule (meals only) applies to every result and count, with its switch « Inclure garde-manger et accompagnements » at the end of the count line; the availability counts keep the other filters.
- **Tiles** (`ResultCard` with a `footer`): photo and time, name, the have-bar, "Rien à acheter" or "Il manque : …", then **Similar recipes** and **À acheter** (`TileActions`). Ready and not planned = **pink shadow** (`.fnd-card.go`). À acheter is green when everything missing is on the list, lighter green when "Show sales" is on and some of it is on sale.
- **À acheter popover** (`GroceryPopover`, under the tile, a cream scrim behind): + Ajouter / ✓ Ajouté per missing item, the real sale pill (`saleFor`, Show sales on only), Add all · N. **On your list** (`ListStrip`, inside a tile that has an item on the list) shows the items on the real grocery list that some recipe here is missing, at most six, with × (the shared take-off toast) and a link to Grocery. Everything goes through the shared `grocery` prop, so Grocery always agrees.
- **Similar recipes** from a tile or the pop-out sets the Main meal on this page; the yellow banner has a ✕ in its corner and no Cancel.
- Props the page adds: `plannedDays` (recipe id → day, this week), `grocery`, `deals`, `showSales`, `onToggleSales`, `onSimilar`, `onOpenGrocery`.

## Where things live in `App.jsx`

`App.jsx` owns the data and the shared pieces above: `openPopout`, `requestPlan`, `openRecipeCard`, `showToast`. A page gets them as props. A new page that needs a recipe opened, a recipe planned or a message shown uses these and does not make its own.
