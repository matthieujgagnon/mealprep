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
| Slot card and planned-meal card | `components/PlannerCards.jsx` | The cards that open from a Planner slot: beside it on a computer, under its row on a phone (`inline`). The Note tab has Save note and Remove note side by side. |
| Trash strip | `components/TrashZone.jsx` | The strip at the bottom of a phone while a Planner card is held: drop on it to remove, with Undo. |
| Recipe photo | `components/RecipePhoto.jsx` | Every recipe photo: one that fails to load disappears, and tries again for another address. |
| Photo card | `components/RecipePhotoCard.jsx`, `lib/photoCard.js` | The one photo card behind the Recipes card, the Makeable card and the Planner finder's results. |
| Makeable card | `components/MakeableCard.jsx` | The Makeable page's card: the photo card plus the use-soon strip, tickable pills, buttons and the ingredient bar. |
| Deal card | `DealDetailModal` in `components/FlyerDeals.jsx`, `DealDetailHost` in `components/SaleTag.jsx` | A flyer deal up close; every tap on a sale opens this one. |
| Makeable now rule | `lib/mealSlots.js`, `hooks/useIncludeSides.js`, `IncludeSidesToggle` | What counts as "makeable". |
| `openRecipeCard` | `App.jsx` | Opens a recipe's card on the Recipes page. |
| Riso pills and chips | `components/RisoPills.jsx`, `lib/pills.js` | Every pill, tag and chip. |
| Confirm dialog | `components/ConfirmDialog.jsx` | The one "are you sure?" question. |
| Recipe finder | `components/Finder.jsx`, `components/FinderTiles.jsx` (the Makeable section header), `hooks/useFinder.js`, `lib/finder.js` | Search, filters, Main meal and results (the Planner's panel, and the Makeable page). |
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

Used by: Planner (`Finder` results, board cards on a phone), Recipes (the photo cards), Home (week strip), Makeable (the cards).

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

`SlotCard` (Recipe / Note / Nothing planned, the note box with quick notes, **Save note** and, for a note that already exists, **Remove note**) and `PlannedCard` (a preview, then Cook, Use as a base, Replace this recipe) open beside the slot on a computer. With `inline` (a phone) they are the same cards, with the same content and rules, drawn directly **under the tapped slot's row** by the phone board (it gives the card its place and a notch pointing at the slot, and pushes the rows below down); tapping the slot again, ✕ or Escape closes it. The three tiles are in the desktop colours with a glyph over the label: Recipe blue, Note yellow, Nothing planned white (planned meal: Cook blue, Use as a base yellow, Replace white).

**The Note tab** (design `docs/design/riso-v2-planner-search-cards/`): 20px between the header, the tabs and the body (the `slot` class on the shell, not the planned meal's card), 18px between the box, the quick notes and the buttons. Save note and Remove note are one row, two equal 48px buttons (the same component on a computer's card and a phone's). Save is blue only when the box has text; Remove note shows only when an existing note is open and clears the slot with the shared Toast and Undo (`actions.removeEntry`, the same removal as the × on a card).

**Nothing planned asks twice, on every size**: the first tap turns the tile ink (`--ink`) with a pink shadow and "✓ Confirm" (blue is Recipe); the second marks the slot; Escape or tapping elsewhere puts it back.

On a phone the planned meal's card shows the photo, the slot (« MER 7 · SOUPER »), the name, the time and a **status** that is also a button (`state`, `onCycle`): « RIEN À ACHETER », « 2 À ACHETER », « RESTES » or « DÉJÀ EN MAIN », with a ⟳. Tapping it steps plain → restes → déjà en main → plain (`actions.cycleState(id, { toast: true })`), and the shared Toast says what changed with Undo (it puts the old mark back). Recipe and Replace make the slot the search panel's target and the page scrolls to the panel (`showFinder` in `Planner.jsx`).

## Recipe photo

`RecipePhoto` is the `<img>` for every recipe photo (board cards, the finder, pop-out, Recipes, Home, pickers). When the picture fails it hides itself, and it remembers which address failed, so the same element given another address (a card reused for another recipe or week) tries again instead of staying hidden. Do not hide a broken photo with your own `onError`.

## Photo card

`RecipePhotoCard` is the one photo card behind the recipe cards (design: `docs/design/riso-v2-recipe-cards/`, and for the Planner finder `docs/design/riso-v2-planner-search-cards/`): a full-bleed photo (`RecipePhoto`), a dark scrim at the top for the caption, a darker one at the bottom with the title centred on it, a 2px ink outline, radius 20 and the soft shadow `--riso-shadow-photo-card`. Tapping the photo or the title calls `onOpen(rect)`, which opens the recipe's pop-out (`openPopout`). Fonts are Bricolage Grotesque and DM Mono only.

- `variant="grid"`: **the Recipes card.** The whole card is the photo, 3:4, all the same size; the caption has the meal word (and the protein under it) on the left and the time on the right; a thin line in the meal's colour (`mealLineColor`: supper blue, lunch pink, breakfast yellow, nothing for sides, desserts or prep) runs along the bottom. Two across on a phone with a smaller title. Built in `Recipes.jsx` (`RecipeCard`); it has no pills, servings, "to buy" line or flags.
- `variant="panel"`: **the Makeable card's top.** A photo 260px high with `MEAL · TIME` as its caption, and `children` under it. `ready` turns the outline blue.
- `variant="finder"`: **the Planner finder's card** (see Planner finder card). A photo 230px high (190px on a phone) with `MEAL · TIME` at the top left, the title over the bottom scrim and, under the photo, the `children` (an info row and a thin bar) **inside the open button**, so the whole card opens the recipe. `action` is the round + in the photo's corner; it is a sibling of the button, because a button cannot hold a button.

Props: `title`, `photoUrl`, `caption`, `lineColor`, `ready`, `openLabel`, `onOpen`, `className`, `children`, `action` (finder), `cardRef` and anything else (drag listeners) goes on the card itself. A new recipe card is this base with another caption and children; do not draw a second photo card. The logic that is not drawing (the caption `cardCaption`, the time, the meal line colour, `haveBar` for the have/total numbers, the bar's width and complete / missing, which pills show, the buttons for each state, the use-soon item) is in `lib/photoCard.js`, with tests.

**Colours.** Every colour is an existing Riso token. **Colours mean the same thing everywhere: blue (`--riso-accent`) is "you already have everything" (the Planner's already-have outline, the blue ✓ in Inventory, and a photo card's outline when nothing is missing, `ready`), and green (`--riso-green`, `--riso-green-text`) is "on your grocery list" (and a sale).** The design files draw a complete recipe in green; the app does not. Older places that still use green for "you have it" are to be switched to blue. Added for these cards and nothing else: `--riso-shadow-photo-card` (the soft shadow), `--riso-hot-line` (the thin line under the pink strip) and `--riso-progress-fill` (the ingredient bar's fill). The rest map like this: ink `--riso-ink`, card `--riso-surface`, page `--riso-canvas`, photo fallback and bar track and pill outline `--riso-track`, tick outline `--riso-dash`, text `--riso-muted`, `--riso-soft` and `--riso-placeholder`, blue `--riso-accent`, yellow `--riso-yellow`, lunch pink `--riso-hot`, the strip's dot `--riso-hot-soft` and its fill `--riso-hot-tint`.

## Planner finder card

The Planner finder's results (`ResultCard` in `components/Finder.jsx`, design `docs/design/riso-v2-planner-search-cards/`) are the photo card with `variant="finder"`. The Recipes page and the Makeable page keep their own cards.

- **Photo:** `MEAL · TIME` (`cardCaption`), the title, and the round blue + at the top right (`action`; 32px, 28px on a phone with an invisible 40px tap area). The + is the finder's `onAdd`: it puts the recipe in the chosen slot, or opens the slot picker.
- **Under the photo:** the info row, `have/total` on the left and « Complet » / « N manquants » on the right (`haveBar`, the Makeable card's `makeable.card.complete` / `missing`), a line saying what the card shares with the Main meal or Cook with picks when there is one (`reason`), and a thin bar along the bottom (`--riso-progress-fill` on `--riso-track`). A recipe with no ingredients says so and has no bar. No pills, no buttons, no flip.
- **Outline:** blue (`ready`) when nothing is missing, ink otherwise; while its pop-out is open (`is-open`) the card has a hard 6px ink shadow in place of the soft one.
- **Whole card:** a click anywhere on it opens the recipe's pop-out (`openPopout`); dragging it onto a slot works as before (`useDraggable` on the card, a long press on a touch screen).
- **Grid:** four across on a computer, three below 1024px, two on a phone (and in the bottom-card layout). Everything else is the finder, below.

## Makeable card

`MakeableCard` (`components/MakeableCard.jsx`) is the Makeable page's card: the photo card (`variant="panel"`) with a white panel under it.

- **Use-soon strip** (pink): only when something the recipe uses goes off in 3 days or less (`soonItemFor`, which follows the app's "uses expiring" rule), with the days written out: « expire dans 2 jours », « expire aujourd'hui ».
- **To buy**: each missing ingredient is a pill with a round tick, its emoji and its name; proteins in the left column, the rest in the right one (a recipe with no protein is one column). At most four (`pickPills`), then a « +2 » pill that opens the recipe. Text size follows the name's length (`pillFontSize`: 13, 12, 10.5px). The tick adds or removes that one item through `grocery.toggle` (the shared Ingredient marks and toast with Undo). A green % on a pill is a real deal (`saleFor`), only with Show sales on; it opens the **Deal card**.
- **Buttons** follow the situation (`cardButtons`): ready = Cook (`openRecipeCard`) + Plan (`requestPlan`, the slot picker); one or two short = To buy + Plan; needs a shop = Plan + To buy (no Cook). To buy adds what is not on the list yet through `grocery.addWithUndo` (the shared toast offers Undo; there is no Undo link on the card) and turns into a green « ✓ Ajouté » once everything missing is on the list. « N en rabais » sits at the end of the row.
- **Bar**: `have/total INGRÉDIENTS` and `COMPLET` or `N MANQUANTS`, over a thin progress line.

On a phone: one card per row, pills 40px, buttons 44px, and the tick and % keep their look with an invisible 40px tap area. Props: `tile`, `soon`, `reason`, `grocery`, `deals`, `showSales`, `onOpen`, `onCook`, `onPlan`, `onOpenCirculaires`.

## Deal card

`DealDetailModal` (`components/FlyerDeals.jsx`) is a flyer deal up close: photo, price, how it compares, the 6-month chart, other stores. Flyers, Grocery's deal tags, the recipe card's sale tag and a Makeable card's % all open it. `DealDetailHost` (`components/SaleTag.jsx`) is the way to open it from a place that only has the deal: it loads the price history and swaps in "also on sale" deals. The card shows its buttons only when given a handler: `onList` (add to / take off the grocery list), `onToggleWatch` and `onOpenCirculaires` (« Voir dans Circulaires → », which goes to that deal on the Flyers page, as Home's "Open the flyer" does through `openFlyerDeal` in `App.jsx`).

## Makeable now rule

"Makeable now" counts **meals only**: recipes for breakfast, lunch or supper, and recipes with no type yet. Sides, snacks, desserts and pantry / prep recipes (sauces live there) are left out, unless "Include pantry and sides" is on.

- `isMakeableMeal(recipe, includeSides)` and `makeableRuleOn(includeSides, narrowedToSlot)` in `lib/mealSlots.js`. When someone narrows to a left-out type themselves (the Meal menu on Sides or Dessert), the rule does not apply.
- `useIncludeSides()` is the one saved setting (this browser), so every page agrees.
- `IncludeSidesToggle` (`components/RisoControls.jsx`) is the switch, « Inclure garde-manger et accompagnements » / "Include pantry and sides".

Used by: Recipes (the "makeable now" count in the line at the top; the page has no chip for it, Makeable covers that), Home (Makeable now card), Makeable (every section and count, with its "Include pantry and sides" switch at the end of the count line), the finder (Ready count and results).

## openRecipeCard

`openRecipeCard(recipeOrId)` in `App.jsx` opens a recipe's card (`RecipeDetailModal`) on the Recipes page. **Every "Cook" and "Open the full recipe" goes through it**, so they all land in the same place: the planned-meal card's Cook, the pop-out's Cook and Open the full recipe, Home's Start cooking, the Makeable card's Cook. Starting Cook mode is the button inside the card.

Passed down as `onOpenRecipeCard`.

## Riso pills and chips

`RisoPills.jsx` holds every pill: `Pill` (sizes tag, fact, chip, badge; tones; `selected`), `TimePill`, `ServesPill`, `MealChip`, `PlannedPill`, `ToBuyPill`, `InStockPill`, `SalePill` and `CountPill`. A screen uses these instead of a new pill class. The Recipes and Makeable cards are photo cards and do not use these pills (see Photo card). The comment block at the top of the file says which to use and what the colours mean; see `docs/design/riso-v2/`.

## Confirm dialog

`ConfirmDialog` is the app's own "are you sure?" question, in the Riso v2 style instead of the browser's `window.confirm`: a small centred pop-up (white card, black outline, hard shadow) over a dimmed page, with a question and two pill buttons. The safe answer comes first, is blue and has the focus. Escape, a tap on the dimmed area and the safe button all give it, and they close only the question: Escape never reaches the form underneath.

Props: `message`, `stayLabel` and `leaveLabel`, `onStay`, `onLeave`. Its classes are `riso-ask*` (`riso-confirm*` belongs to the Inventory confirmation sheet). The two buttons reuse the pop-out's `fnd-pop-btn`.

Used by: the recipe form (the new-recipe pop-up and the full-page editor) when closed with something typed, and `App.jsx` when a header tab is pressed with unsaved changes. The text is `editor.leaveUnsaved` / `app.leaveUnsaved` with « Continuer à modifier » (`editor.keepEditing`) and « Abandonner » (`editor.discard`). Other confirmations still use the browser's dialog (delete recipe, remove a store, clear flyers, leave Cook mode with a timer); move them here when they are next touched.

## Recipe finder

`Finder` is the search bar, "Cook with", filters, the Main meal banner and the results, for the Planner's panel at the bottom of the page (`layout="panel"`, on a computer and on a phone; `layout="sheet"` is for a bottom card) and for the Makeable page (`layout="page"`, below). `useFinder()` holds what it shows. It does not hold the recipe pop-out: it asks the caller (`onOpenPopout`) and `onAdd` is the caller's. Choosing Similar recipes scrolls the Main meal banner into view.

**On a phone** the same markup is dressed as the design's search panel (`docs/design/riso-v2-planner-mobile-v2/`): one pill holding the box for typing (« Chercher une recette »), the target chip (« mer · Déjeuner ✕ ») and a **Browse / Close** button (`.fnd-bar-toggle`, hidden on a computer); closed, nothing else shows. Open, it shows the « AVEC… » strip (« + Cuisiner avec… »), the filters as chips in the design's order (Faisable maintenant, 1 ou 2 à acheter, Expire bientôt, Repas ▾, Protéine ▾, Rapide; a second tap on the first two turns them off, and the "All" choice is not shown), the count and the results two across. Repas, Protéine and Cuisiner avec… are the shared menus, as on a computer. The **Main meal banner** stacks on a phone: the photo as a strip on top, then the text and ingredient chips across the width, the buttons at the bottom.

**Makeable page** (`layout="page"`; `components/Makeable.jsx` adds the title; design `docs/design/riso-v2-makeable/`). Same search, "With" strip, picker, filters (Repas and Protéine are the shared menus) and Main meal banner, with these differences:

- **Sections** instead of one grid: Meals of the week (planned this week; closed to begin with), Ready now, One or two short, Needs a shop (`makeableSections`, with a count badge and a line of words each). A planned recipe is only in the first. The Makeable now rule (meals only) applies to every result and count, with its switch « Inclure garde-manger et accompagnements » at the end of the count line; the availability counts keep the other filters.
- **Cards** (`MakeableCard`, see Makeable card below), in a grid of columns at least 310px wide on a computer and one per row on a phone, each at its own height and lined up at the top of its row. A section's cards are the same card in four situations: ready, one or two short, needs a shop, and one short with something expiring.
- **Similar recipes** from the pop-out sets the Main meal on this page (the card has no button for it); the yellow banner has a ✕ in its corner and no Cancel, and each card then says what it shares (`.mkc-reason`).
- Props the page adds: `plannedDays` (recipe id → day, this week), `grocery`, `deals`, `showSales`, `onToggleSales`, `onCook`, `onPlan`, `onOpenFlyerDeal`.
- **Phone chips.** On a phone the filter chips are one row that scrolls sideways and pins under the app header (`.fnd-chips`, `--fnd-sticky-top` measured like Inventory's shelf pill): All, Ready now, 1 or 2 short and Quick first, then Expiring soon and Show sales; the Meal and Protein menus sit under it so they can open. The count on each availability chip is not shown on a phone.

## Where things live in `App.jsx`

`App.jsx` owns the data and the shared pieces above: `openPopout`, `requestPlan`, `openRecipeCard`, `showToast`. A page gets them as props. A new page that needs a recipe opened, a recipe planned or a message shown uses these and does not make its own.
