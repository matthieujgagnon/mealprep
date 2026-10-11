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
| Grocery saves | `request` in `api.js`, `lib/pendingSaves.js` | A read of grocery data waits for the grocery saves already sent, and is read again if a save started or ended while it was on its way, so no page shows the list as it was before a change. |
| Inventory item form | `components/InventoryItemForm.jsx` | Add or edit an Inventory item. |
| Inventory confirm sheet | `components/InventoryConfirm.jsx` | Confirm anything going into Inventory (see `CLAUDE.md`, and its exceptions: Inventory's own form, the finished view's Leftovers card, Undo). |
| Light / dark switch | `components/ThemeSwitch.jsx`, `hooks/useTheme.js`, `lib/theme.js`, the dark block in `index.css` | The round ☀ / ☾ button and the one saved choice behind it, for Store mode, Cook mode and its finished view. |
| Cook mode step view | `components/CookMode.jsx`, `components/CookModeParts.jsx` (`StepRail`, `StepIngredients`, `TimerCard`), `lib/stepParagraphs.js` | The step screen: rail, step, "For this step" rows, timer card, bottom bar. |
| Cook mode prep page | `components/CookMode.jsx`, `components/CookModeParts.jsx` (`PrepList`, `DoFirstCard`, and `StepRail`'s dot 0), `lib/cookPrep.js` | "Before you start", the page before step 1: the ingredients with a prep note by group, how to prepare them, which steps use them, and a Do first card. Its rows are "For this step" rows. |
| Ingredient-to-step matching | `stepIngredients` in `lib/steps.js`, `lib/ingredientMatch.js` | Which ingredients a step's text mentions. "For this step" and the prep page's step tags both use it, so they always agree. |
| Finished view ("I cooked this") | `components/CookedView.jsx` (`CookedView`, `CookedViewHost`), `components/CookedViewParts.jsx`, `lib/cookedView.js` | The one view after cooking, behind three doors: the end of Cook mode, a planned meal's card, Home's tonight card. Leftovers, then Take out of your Inventory, then the pop-up. |
| Ingredient-to-Inventory matching | `lib/inventoryMatch.js` | **The one matcher.** Which Inventory item a recipe ingredient is (both languages, varieties, cuts, never leftovers), what a recipe has and lacks (`recipeHave`), "uses expiring", Cook with, and how much a cooked meal takes out. Every page that says "have it or not" uses it. |
| Leftovers | `lib/leftovers.js`, the Leftovers shelf in `components/Inventory.jsx`, `LeftoverResultCard` in `components/Finder.jsx` | One leftovers system: the LEFTOVER item, its keep times, planning it, the past-fridge-life rule. |
| Confetti | `StoreConfetti` in `components/StoreModeParts.jsx`, `lib/storeConfetti.js` | Store mode's celebration, and with `burst` the finished view's. |

## Recipe pop-out

`RecipePopout` is the look; `RecipePopoutHost` works out its lists. **`App.jsx` renders the one host**, so a recipe opens the same pop-out from the Planner (board cards and finder results), Recipes, Home and Makeable.

It shows time and servings, the meal, "Planned Wednesday", what you have, what to buy (tap to put an item on the grocery list, or take it off; see Ingredient marks), the steps, and four buttons: **Plan** (first), **Cook**, **Similar recipes** and **Open the full recipe**.

Open it with `openPopout(recipeOrId, from?)` (`from` is the box of the card it grows out of). Main props:

- `RecipePopoutHost`: `recipe`, `from`, `kitchen` (App's `{ inventory, customStaples, excludedStaples }`), `plannedEntries`, `grocery` (`{ isOnList, add, remove, toggle, addWithUndo }`), `deals` and `showSales` (optional green sale pills).
- Buttons (each optional): `onPlan`, `onCook`, `onSimilar`, `onOpenFull`, `onClose`.

In `App.jsx`: Plan calls `requestPlan`, Cook and Open the full recipe call `openRecipeCard`, Similar recipes sets `plannerMainId` and goes to the Planner. **On Makeable there is no Cook, and Similar recipes sets the Main meal on Makeable itself** (`makeableFinder.setMainMeal`), with the sale pills following Makeable's "Show sales".

Used by: Planner (`Finder` results, board cards on a phone), Recipes (the photo cards), Home (week strip), Makeable (the cards).

## Ingredient marks

Every place that lists a recipe's ingredients marks each one with the same round ✓, so it is one piece, not three:

- **Blue ✓**: in your Inventory (it follows Inventory by itself).
- **Green ✓**: not in Inventory, but on your grocery list. Tapping it takes the item off the list and shows the shared Toast with Undo; tapping the + that replaces it puts the item back.
- **White +**: neither; tap to put it on the list. (Inventory wins if an item is both.)

**What counts as "in your Inventory".** One rule everywhere, in `lib/inventoryMatch.js` (see Ingredient-to-Inventory matching): French and English names, varieties and cuts, never leftovers, staples always had. The full recipe card's ✓ beside each ingredient is `ingredientHave`; its numbers ("You have 5 of 6", "1 thing to buy", Add missing), the pop-out's and the planned-meal card's lists, Makeable, the Planner's search, Home and Recipes all come from `recipeHave`, so they always agree with each other and with the finished view's take-out list.

`IngredientMarks` (in `RecipePopout.jsx`) draws the "you have" and "to buy" lists for the recipe pop-out and the Planner's planned-meal card. The full recipe card (`RecipeDetailModal`) draws the same three marks as the dot beside each ingredient and the three-part legend under the list. All of them read `grocery.isOnList` and call `grocery.toggle`, which `App.jsx` builds once (`toggleGroceryItem`), so Grocery and every mark always agree. A page that shows ingredients gets `grocery` as a prop; do not read the grocery list any other way.

## Slot picker

`SlotPicker` is a small week (7 days by breakfast, lunch, supper) to choose where a recipe goes, with ‹ › to move between weeks, a "Free slot / Replaces ..." line and the confirm button. **`App.jsx` opens it with `requestPlan(recipe)`**, so Plan works the same from any page. It opens on the week the Planner last showed, on the slot chosen as the target if there is one, else the next empty slot. Confirming calls `handlePlanRecipe(recipe, slot, week)`, which places the recipe and shows the toast.

Props: `recipe`, `weekStart`, `entries` (that week's), `weekend`, `initialSlot`, `onConfirm(slot, week)`, `onClose`.

Used by: the pop-out's Plan (Planner, Recipes, Home) and the Planner finder's + when no slot is chosen.

## Toast

`Toast` is a dark pill at the bottom of the screen for five seconds, with Undo when the change can be taken back. **`App.jsx` keeps it**: `showToast(message, undo?)`, passed down as `onToast` (Recipes, Inventory) and `actions.toast` (Planner). Do not draw another message. Put what undoing means in `undo`. A toast's five seconds close only that toast (`onClose` checks its `id`), so a message shown just as the last one ends is not taken away with it.

It sits above every pop-out, picker and question (z-index 500), so Undo can be pressed while one is open.

Used by: Planner (add, replace, remove, copy, leftovers, a card dropped on the phone's trash strip, a phone status tap ("marked as leftovers", with Undo putting the old mark back; the card changes at once, and if the save fails it goes back and the Toast says so), Option-drag copies, and "Clear" on a day: one message "Tuesday cleared" whose Undo puts every meal, note and empty card back through `restoreEntry`, leftover marks included, no question first), Recipes (imported), Inventory (added, saved, a frozen leftover moved to the fridge to thaw, with Undo), the grocery ✓ in Ingredient marks (taken off the list), Makeable's À acheter ("N items added to the grocery list", Undo takes them off again), the finished view ("Cooked: <recipe>" when it closes, whose Undo puts back the amounts, the leftovers and the cooked mark; "Running low" on a staple, Undo takes it off the list), Inventory leftovers placed on the Planner, and a planned leftover whose day has passed ("1 portion of leftovers taken off", Undo puts the portion back).

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

`PlannerLegend` is the row under the board on a computer: planned meal, ingredients on hand (blue outline), leftovers (yellow tag), cooked (the ink "✓ Cooked" tag "I cooked this" puts on a meal), note, empty slot, today and, when the board shows one, the weekend ("Fin de semaine", without the list of days). Prop: `weekendOn`. Used by `PlannerBoard`. The phone board has no legend (the v2 design leaves it out).

## Planner board

`PlannerBoard` draws the week for the Planner on a computer: all seven days in view. On a phone the Planner draws `PlannerBoardPhone` instead (design: `docs/design/riso-v2-planner-mobile-v2/`), which reuses `PlannerBoard`'s card pieces (`PlannerMealCard`, `PlannerNoteCard`, `computeStaleLeftoverIds`) and the same drop slots (`day-<d>-<meal>`), so cards, drag, swap, Clear and the toast are the same pieces everywhere.

**Phone board.** Three days in view on a track (`.pmb-track`, 104px columns, 8px apart, about 40px of the next day peeking) that slides with `translateX(trackX(page, dragDx))` (`lib/plannerPhone.js`; pages start at days 0, 3 and 4 so every page has three days, `PHONE_PAGE_STARTS`). The meal names (Déjeuner, Dîner, Souper) are **not on the track**: they sit at x = 14 above each row and follow the rows when an inline card pushes them down. All the numbers (row tops, the board's height, the card's place, the notch, the weekend band's outline) come from `boardGeometry`, `notchLeft` and `weekendBands`, so everything agrees on where a row is. The page is owned by `Planner` and changed by the header's stickers, a swipe along the board (past 50px; pointer events with `touch-action: pan-y`; ignored while a card is being dragged) and holding a dragged card near the left or right of the screen (`useDndMonitor`). A new week starts on the page with today (Mon–Wed for another week), without sliding.

A card is 104 × 104 (photo 50px, name, time), with a 3px blue border for "already have", a 3px yellow border and the « restes » tag for leftovers, no round ✓ and no ×; a note says « ✎ NOTE » over its text; "Nothing planned" is a plain solid card; past days are faded and cannot be opened. « Vider » is a tiny link under each future day with something planned. The weekend is a dotted pink band (an SVG outline, an L when it takes in the evening before); its settings live in the calendar. The open slot or meal's card is the board's `inline` prop (see Slot card), measured so the rows below move.

The computer's board: seven days by three meals, the weekend, cards and "Clear" as on every size (`lib/weekend.js`). Cards and results (and Store mode's grocery rows, which drop on a store) are picked up by a long press on a touch screen (the app's one drag setup in `App.jsx`: `PointerSensor` with a delay, a `touchmove` that keeps the page still once a drag has started, `touch-action: pan-y` so a plain swipe still scrolls). The fallback is the shared + / pop-out Plan, which opens the slot picker.

Props (computer): `entries`, `weekStart`, `weekend`, `selectedSlot`, `leftoverMode`, `onCardClick`, `onNoteClick`, `onRemove`, `onClearDay`, `onCycleState`, `onEmptyClick`, `onWeekendMenu`. The phone board takes the same (minus the weekend menu) plus `page`, `onPageChange` and `inline`. Used by: `Planner`.

**Trash strip.** While a planned card or note is held on a phone, `TrashZone` (`components/TrashZone.jsx`) shows a strip fixed to the bottom of the screen in place of the search bar: « Déposer ici pour retirer », pink and « Relâcher pour retirer » when the card is over it. A drop on `planner-trash` calls the same removal as the × (`handleRemoveWithUndo` in `App.jsx`), so the shared Toast offers Undo. The page does not auto-scroll while the card is over it. A result carried from the finder does not show it.

## Slot card and planned-meal card

`SlotCard` (Recipe / Note / Nothing planned, the note box with quick notes, **Save note** and, for a note that already exists, **Remove note**) and `PlannedCard` (a preview, then Cook, Use as a base, Replace this recipe, and **I cooked this**, which opens the finished view for that meal; "✓ Cooked" beside it once it is; a leftover meal has no I cooked this) open beside the slot on a computer. With `inline` (a phone) they are the same cards, with the same content and rules, drawn directly **under the tapped slot's row** by the phone board (it gives the card its place and a notch pointing at the slot, and pushes the rows below down); tapping the slot again, ✕ or Escape closes it. The three tiles are in the desktop colours with a glyph over the label: Recipe blue, Note yellow, Nothing planned white (planned meal: Cook blue, Use as a base yellow, Replace white).

**The Note tab** (design `docs/design/riso-v2-planner-search-cards/`): 20px between the header, the tabs and the body (the `slot` class on the shell, not the planned meal's card), 18px between the box, the quick notes and the buttons. Save note and Remove note are one row, two equal 48px buttons (the same component on a computer's card and a phone's). Save is blue only when the box has text; Remove note shows only when an existing note is open and clears the slot with the shared Toast and Undo (`actions.removeEntry`, the same removal as the × on a card).

**Nothing planned asks twice, on every size**: the first tap turns the tile ink (`--ink`) with a pink shadow and "✓ Confirm" (blue is Recipe); the second marks the slot; Escape or tapping elsewhere puts it back.

On a phone the planned meal's card shows the photo, the slot (« MER 7 · SOUPER »), the name, the time and a **status** that is also a button (`state`, `onCycle`): « RIEN À ACHETER », « 2 À ACHETER », « RESTES » or « DÉJÀ EN MAIN », with a ⟳. Tapping it steps plain → restes → déjà en main → plain (`actions.cycleState(id, { toast: true })`), and the shared Toast says what changed with Undo (it puts the old mark back). Recipe and Replace make the slot the search panel's target and the page scrolls to the panel (`showFinder` in `Planner.jsx`).

## Recipe photo

`RecipePhoto` is the `<img>` for every recipe photo (board cards, the finder, pop-out, Recipes, Home, pickers, Cook mode). When the picture fails it hides itself, and it remembers which address failed, so the same element given another address (a card reused for another recipe or week) tries again instead of staying hidden. Do not hide a broken photo with your own `onError`.

## Photo card

`RecipePhotoCard` is the one photo card behind the recipe cards (design: `docs/design/riso-v2-recipe-cards/`, and for the Planner finder `docs/design/riso-v2-planner-search-cards/`): a full-bleed photo (`RecipePhoto`), a dark scrim at the top for the caption, a darker one at the bottom with the title centred on it, a 2px ink outline, radius 20 and the soft shadow `--riso-shadow-photo-card`. Tapping the photo or the title calls `onOpen(rect)`, which opens the recipe's pop-out (`openPopout`). Fonts are Bricolage Grotesque and DM Mono only.

- `variant="grid"`: **the Recipes card.** The whole card is the photo, 3:4, all the same size; the caption has the meal word (and the protein under it) on the left and the time on the right; a thin line in the meal's colour (`mealLineColor`: supper blue, lunch pink, breakfast yellow, nothing for sides, desserts or prep) runs along the bottom. Two across on a phone with a smaller title. Built in `Recipes.jsx` (`RecipeCard`); it has no pills, servings, "to buy" line or flags.
- `variant="panel"`: **the Makeable card's top.** A photo 260px high with `MEAL · TIME` as its caption, and `children` under it. `ready` turns the outline blue.
- `variant="finder"`: **the Planner finder's card** (see Planner finder card). A photo 230px high (190px on a phone) with `MEAL · TIME` at the top left, the title over the bottom scrim and, under the photo, the `children` (an info row and a thin bar) **inside the open button**, so the whole card opens the recipe. `action` is the round + in the photo's corner; it is a sibling of the button, because a button cannot hold a button.

Props: `title`, `photoUrl`, `caption`, `lineColor`, `ready`, `openLabel`, `onOpen`, `className`, `children`, `action` (finder), `cardRef` and anything else (drag listeners) goes on the card itself. A new recipe card is this base with another caption and children; do not draw a second photo card. The logic that is not drawing (the caption `cardCaption`, the time, the meal line colour, `haveBar` for the have/total numbers, the bar's width and complete / missing, which pills show, the buttons for each state, the use-soon item) is in `lib/photoCard.js`, with tests.

**Colours.** Every colour is an existing Riso token. **Colours mean the same thing everywhere: blue (`--riso-accent`) is "you already have everything" (the Planner's already-have outline, the blue ✓ in Inventory, and a photo card's outline when nothing is missing, `ready`), and green (`--riso-green`, `--riso-green-text`) is "on your grocery list" (and a sale).** The design files draw a complete recipe in green; the app does not. Older places that still use green for "you have it" are to be switched to blue. **The one exception is celebration** (Matt's call): the finished view after "I cooked this" keeps the design's greens, the "all done!" sticker (`--riso-green`), the portion squares, the "Leftovers added" ✓ badge and the "−" badge (`--riso-green-tint`), because there green says "done", not "on your list". Its "✓ On the list" after Running low is green as usual. Added for these cards and nothing else: `--riso-shadow-photo-card` (the soft shadow), `--riso-hot-line` (the thin line under the pink strip) and `--riso-progress-fill` (the ingredient bar's fill). The rest map like this: ink `--riso-ink`, card `--riso-surface`, page `--riso-canvas`, photo fallback and bar track and pill outline `--riso-track`, tick outline `--riso-dash`, text `--riso-muted`, `--riso-soft` and `--riso-placeholder`, blue `--riso-accent`, yellow `--riso-yellow`, lunch pink `--riso-hot`, the strip's dot `--riso-hot-soft` and its fill `--riso-hot-tint`.

## Planner finder card

The Planner finder's results (`ResultCard` in `components/Finder.jsx`, design `docs/design/riso-v2-planner-search-cards/`) are the photo card with `variant="finder"`. The Recipes page and the Makeable page keep their own cards.

- **Photo:** `MEAL · TIME` (`cardCaption`), the title, and the round blue + at the top right (`action`; 32px, 28px on a phone with an invisible 40px tap area). The + is the finder's `onAdd`: it puts the recipe in the chosen slot, or opens the slot picker.
- **Under the photo:** the info row, `have/total` on the left and « Complet » / « N manquants » on the right (`haveBar`, the Makeable card's `makeable.card.complete` / `missing`), a line saying what the card shares with the Main meal or Cook with picks when there is one (`reason`), and a thin bar along the bottom (`--riso-progress-fill` on `--riso-track`). A recipe with no ingredients says so and has no bar. No pills, no buttons, no flip.
- **Outline:** blue (`ready`) when nothing is missing, ink otherwise; while its pop-out is open (`is-open`) the card has a hard 6px ink shadow in place of the soft one.
- **Leftovers:** on the Planner (`onAddLeftover`), Inventory's leftovers come first, as the same card (`LeftoverResultCard`): « Restes · name · 2 portions » over the photo (the recipe's, or the item's own), `LEFTOVER · 2 DAYS LEFT` as the caption, "Nothing to buy" under it, a blue outline. The card and its + plan it (into the chosen slot, else the slot picker); it drags onto a slot like a recipe. Not with a Main meal.
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
- What is missing comes from the one matcher (`recipeHave` in `lib/inventoryMatch.js`, see Ingredient-to-Inventory matching); Home's card is `makeableNow` in `lib/homeWeek.js`.

Used by: Recipes (the "makeable now" count in the line at the top; the page has no chip for it, Makeable covers that), Home (Makeable now card), Makeable (every section and count, with its "Include pantry and sides" switch at the end of the count line), the finder (Ready count and results).

## openRecipeCard

`openRecipeCard(recipeOrId)` in `App.jsx` opens a recipe's card (`RecipeDetailModal`) on the Recipes page. **Every "Cook" and "Open the full recipe" goes through it**, so they all land in the same place: the planned-meal card's Cook, the pop-out's Cook and Open the full recipe, Home's Start cooking, the Makeable card's Cook. Starting Cook mode is the button inside the card.

Passed down as `onOpenRecipeCard`.

## Riso pills and chips

`RisoPills.jsx` holds every pill: `Pill` (sizes tag, fact, chip, badge; tones; `selected`), `TimePill`, `ServesPill`, `MealChip`, `PlannedPill`, `ToBuyPill`, `InStockPill`, `SalePill` and `CountPill`. A screen uses these instead of a new pill class. The Recipes and Makeable cards are photo cards and do not use these pills (see Photo card). The comment block at the top of the file says which to use and what the colours mean; see `docs/design/riso-v2/`.

## Confirm dialog

`ConfirmDialog` is the app's own "are you sure?" question, in the Riso v2 style instead of the browser's `window.confirm`: a small centred pop-up (white card, black outline, hard shadow) over a dimmed page, with a question and two pill buttons. The safe answer comes first, is blue and has the focus. Escape, a tap on the dimmed area and the safe button all give it, and they close only the question: Escape never reaches the form underneath.

Props: `message`, `stayLabel` and `leaveLabel`, `onStay`, `onLeave`. Its classes are `riso-ask*` (`riso-confirm*` belongs to the Inventory confirmation sheet). The two buttons reuse the pop-out's `fnd-pop-btn`.

Used by: the recipe form (the new-recipe pop-up and the full-page editor) when closed with something typed, and `App.jsx` when a header tab is pressed with unsaved changes. The text is `editor.leaveUnsaved` / `app.leaveUnsaved` with « Continuer à modifier » (`editor.keepEditing`) and « Abandonner » (`editor.discard`). Other confirmations still use the browser's dialog (delete recipe, remove a store, clear flyers); move them here when they are next touched. Closing Cook mode with a timer running asks nothing: the timers belong to the recipe card, which keeps them, so nothing is lost.

## Recipe finder

`Finder` is the search bar, "Cook with", filters, the Main meal banner and the results, for the Planner's panel at the bottom of the page (`layout="panel"`, on a computer and on a phone; `layout="sheet"` is for a bottom card) and for the Makeable page (`layout="page"`, below). `useFinder()` holds what it shows. It does not hold the recipe pop-out: it asks the caller (`onOpenPopout`) and `onAdd` is the caller's. Choosing Similar recipes scrolls the Main meal banner into view.

**On a phone** the same markup is dressed as the design's search panel (`docs/design/riso-v2-planner-mobile-v2/`): one pill holding the box for typing (« Chercher une recette »), the target chip (« mer · Déjeuner ✕ ») and a **Browse / Close** button (`.fnd-bar-toggle`, hidden on a computer); closed, nothing else shows. Open, it shows the « AVEC… » strip (« + Cuisiner avec… »), the filters as chips in the design's order (Faisable maintenant, 1 ou 2 à acheter, Expire bientôt, Repas ▾, Protéine ▾, Rapide; a second tap on the first two turns them off, and the "All" choice is not shown), the count and the results two across. Repas, Protéine and Cuisiner avec… are the shared menus, as on a computer. The **Main meal banner** stacks on a phone: the photo as a strip on top, then the text and ingredient chips across the width, the buttons at the bottom.

**Makeable page** (`layout="page"`; `components/Makeable.jsx` adds the title; design `docs/design/riso-v2-makeable/`). Same search, "With" strip, picker, filters (Repas and Protéine are the shared menus) and Main meal banner, with these differences:

- **Sections** instead of one grid: Meals of the week (planned this week; closed to begin with), Ready now, One or two short, Needs a shop (`makeableSections`, with a count badge and a line of words each). A planned recipe is only in the first. The Makeable now rule (meals only) applies to every result and count, with its switch « Inclure garde-manger et accompagnements » at the end of the count line; the availability counts keep the other filters.
- **Cards** (`MakeableCard`, see Makeable card below), in a grid of columns at least 310px wide on a computer and one per row on a phone, each at its own height and lined up at the top of its row. A section's cards are the same card in four situations: ready, one or two short, needs a shop, and one short with something expiring.
- **Similar recipes** from the pop-out sets the Main meal on this page (the card has no button for it); the yellow banner has a ✕ in its corner and no Cancel, and each card then says what it shares (`.mkc-reason`).
- Props the page adds: `plannedDays` (recipe id → day, this week), `grocery`, `deals`, `showSales`, `onToggleSales`, `onCook`, `onPlan`, `onOpenFlyerDeal`.
- **Phone chips.** On a phone the filter chips are one row that scrolls sideways and pins under the app header (`.fnd-chips`, `--fnd-sticky-top` measured like Inventory's shelf pill): All, Ready now, 1 or 2 short and Quick first, then Expiring soon and Show sales; the Meal and Protein menus sit under it so they can open. The count on each availability chip is not shown on a phone.

## Grocery saves

A change to the grocery list shows on screen at once and is saved in the background. A page opened right after (the Grocery tab, Store mode, the recipe pop-out's ✓) used to ask the server for the list before that save had landed, and showed the old one. So `request` in `api.js` keeps every save to a `/grocery…` address in `lib/pendingSaves.js` until it ends, and **a read of any `/grocery…` address first waits for those saves, and is read again (at most twice) if a save started or ended while it was on its way**, because that answer can be older than the change. This is built once, in the data code every page uses: a page reads the list through `api` as it always did and does nothing extra. Do not wait for saves in a page.

One more piece is for a page that loads several things together and then puts them on screen (the Grocery list): `savesVersion("grocery")` changes when a save starts and when it ends. If it changed while the page was loading, the page loads again (`GroceryList.jsx`, at most twice more) instead of putting the older answers over the person's change.

Used by: every `api.listGrocery…` read and every grocery save (`addGroceryExtra`, `deleteGroceryExtra`, `setGroceryOverride`, the checks, the stores).

## Light / dark switch

`ThemeSwitch` (`components/ThemeSwitch.jsx`) is the round ☀ / ☾ button (☀ in dark, ☾ in light; « Thème clair » / « Thème sombre » from `theme.toLight` / `theme.toDark`). It is drawn in the colour of the text around it (`.riso-theme-switch`). `useTheme()` (`hooks/useTheme.js`) gives `{ theme, dark, toggle }`: it reads the choice when a mode opens and saves it when it changes. **Store mode's top row and Cook mode's top bar both use these two and nothing else**, so there is one choice, not two: it is saved in this browser under `mealprep-theme` (`lib/theme.js`; the key Store mode used before the switch was shared, `mealprep-store-mode-theme`, is still read when the new one is not set), and **dark until someone picks light**. A pick in one is what the other opens in next. A new full-screen mode that has a light and a dark look uses them too.

The dark colours are in **one block** in `index.css`, right under the `.riso-theme` tokens: `.riso-theme[data-theme="dark"]` re-maps the Riso tokens (page `--riso-canvas` #000000, cards `--riso-surface` #111115, inner boxes `--riso-track` #1b1b21, `--riso-ink` #f4f1ea, `--riso-muted` #9a9aa8, dotted lines `--riso-dash-strong` in ink, the hard shadows in blue) and gives the new tokens their dark values (`--riso-bar-line`, the `--riso-timer-*` set, and `--riso-ink-fixed`, the ink that stays dark on a yellow, green or pink fill). Do not write a dark colour anywhere else; a screen is dark when its `.riso-theme` element has `data-theme="dark"`, so an app-wide dark mode only has to set that. Cook mode does (`data-theme={theme}` on its overlay), and so does its finished view (full screen, with the switch in its top bar); the finished view opened as a sheet from the Planner or Home stays `light` like the pages under it. Added for the finished view: `--riso-box` (its white inner boxes, #1b1b21 in dark), `--riso-row-line` (the line between rows in a box) and `--riso-highlighter` (the yellow marker behind an amount); the dark block also sets `--riso-dash` (#3a3a44, its thin lines). Store mode still draws its colours from its own `--sm-*` variables and `data-sm-theme`; it can move to these tokens later.

## Cook mode

`CookMode` (design: `docs/design/riso-v2-cook-mode/`; the finished view after it is its own piece, see Finished view) is full screen, one step at a time. **On a computer** it is three columns, `96px | 1fr | 340px`: the step rail, the step, and the photo above the timer. Between 768 and 1023px the photo and timer drop under the step (the rail stays on the left and the column scrolls). **On a phone** the step dots and the step's title sit in a row under the top bar, then one column: a 60px photo strip, "STEP 2 OF 5", the step, "For this step", the timer; the bottom bar is a 56px ← and Next filling the rest. Every colour is a Riso token and the timer card has its own (`--riso-timer-*`: yellow, or in dark a black card with yellow type and no shadow); there is no colour written in the `.cm-*` styles.

- **Pieces** (`CookModeParts.jsx`): `StepRail` (numbered dots joined by a dotted line: done = ink with ✓, current = blue and bigger, titles under the dots on a computer; every dot jumps to its step, and it scrolls to keep the current dot in view), `StepIngredients` (one row for each ingredient the step uses, found by `stepIngredients`: the round check, the amount in a column that is at least 80px wide, 62px on a phone, 104 / 86px in French, and grows to the longest amount, then the name and its prep note, which is the ingredient's `notes`; "n / total" counts the checked ones) and `TimerCard` (label, time, Start / Pause, +1 min and a round ↺ that starts it over). The photo is `RecipePhoto`.
- **Top bar:** the title and meta, the yellow chip for a timer running on another step (it jumps there; also on a phone), the shared light / dark switch, Keep screen on (a computer only: on a phone the screen stays on by itself) and ×. There is no segment bar and no "← Recipe".
- **Step text:** 34px on a computer, 19px on a phone, and it steps down a pixel at a time (to 16 / 14px) while the column does not fit, then the rows and timer tighten (`compact`, then `tight`), and only then does the column scroll. A step is split into short paragraphs for drawing by `lib/stepParagraphs.js` (`stepParagraphText`): at the end of a sentence followed by a capital, never after a number, a single letter or an abbreviation (tbsp., oz., min., env., c.à.s., ...), but always after °F or °C. It changes nothing that is saved. A step's title is a short "Word:" at the start of its text (`stepTitle`, any letters, so « Rôtir : » counts); a step with no title has a dot and no label.
- **Before you start (the prep page):** design `docs/design/riso-v2-cook-mode-prep/`. A recipe with at least one ingredient that has a prep note opens on this page, before step 1; one with none skips it and opens on step 1 (a preheat step on its own does not make a page). It is page -1 in `CookMode` (`stepIndex` -1), and the rail gets a first dot "0" labelled "Get ready" (`StepRail`'s `prepLabel`): current there, ✓ after it, and a tap on it comes back. There is no Previous on this page; Start step 1 (and Up next, which previews step 1) move on, and Previous on step 1, ←, and a swipe right come back. Nothing is saved and the recipe is never changed; ticking never touches Inventory.
  - **What is listed** (`lib/cookPrep.js`, unit tests in `cookPrep.test.js`, no AI): each ingredient whose `notes` say something to do to it (`prepNote`: "to taste", "optional", "divided", "for serving", "low sodium", "unsalted", "boneless", can sizes like "796 ml" and the French equivalents are not preparation and are left off; in a note that also says what to do they are dropped). Groups, in this order, with empty ones hidden: **Cut**, **Measure**, **Squeeze / zest**, **Other** (`prepGroup`: the first group whose word list, English and French, the note has a word from: squeeze, then cut, then measure, then other). The **how line** (`howLine`) is the note as an order: a leading "finely chopped" / "peeled and diced" / « finement haché » becomes "Finely chop" / "Peel and dice" / « Hachez finement » (« vous »); a shape (« en dés ») gets its verb (« Coupez en dés »); anything else stays as written with a capital ("cut into 3 cm pieces"). It stays in the note's language, which can differ from the app's, and never gets a size the recipe doesn't give. The **step tag** ("STEP 2", "STEPS 2 · 3") comes from `stepIngredients`; no match, no tag. **Do first** (`doFirstSentence`) is the recipe's own first sentence that says preheat / « préchauffer » / heat the oven, in the steps' order, with the other unit added after each temperature (`withBothTemperatures`: °C to the nearest 10, °F to the nearest 25, so 425 °F is 220 °C); no such sentence, no card. Step 1 is never merged or hidden, even when it is just "Prep".
  - **Ticks** are the ones in `checked`, keyed `${stepIndex}:${name}` as "For this step" has them. Tapping a prep row sets the tick in every step that uses the ingredient, and the row shows ticked when all of them are; an ingredient no step uses has its own key (`prep:${name}`). A tick is never required to continue.
  - **Drawn like a step:** the rows are `.cm-uses-row` rows (the same check, amount column and ticked look) with `.cm-prep-*` for what is added: group headers, the how line and the step tag (at the right on a computer, on its own line under the how line on a phone). The amount column is one grid for all groups so the names line up, and grows to the longest amount. The middle column is the same scrolling `.cm-left` as a step (the fitting rules, which shrink one step's text, do not apply: a long list just scrolls, on a computer too, with the bars in place). Do first is under the photo on a computer and above the groups on a phone, which has no photo.
- **Last step:** Next says I cooked this (`cooked.button`, « Je l'ai cuisiné ») and Up next is hidden; it opens the finished view over Cook mode (`onFinish`, through the recipe card to `openCooked` in `App.jsx`). Cook mode stays under it: "Back to step 1" there comes back to step 1, × and "Back to the app" close both.
- **Closing:** × or Escape closes it at once. The step timers belong to the recipe card (`useStepTimers` lives in `RecipeDetailModal`), so a timer carries on there and in Cook mode when it is reopened; nothing is asked.
- **Which ingredients a step uses** (`stepIngredients`, matching in `lib/ingredientMatch.js`): a name matches when one of its words is a whole word of the step. Short names count ("egg", "oil", « ail », « riz »), and a word inside another word does not ("rice" is not in "price", "oil" is not in "boil"). In a longer name a word of three letters or fewer counts only when it is a known food (`SHORT_FOODS`, or any word in the French / English pairs), so the "dry" of "dry white wine" and the "all" of "all-purpose flour" never match a step that merely says "dry" or "all". Singular and plural match either way ("tomatoes" / "tomato", « oignon » / « oignons »), with the grocery list's singular rules (`singularize`) and accents ignored. The other language counts: the one-word French / English pairs the flyers use (`PHRASES` in `lib/bilingual.js`: « ail » is garlic, « riz » is rice) and whole phrases through `frenchToEnglish` (« pommes de terre » are potatoes). A colour, a size, "fresh", "ground" or a little word (« de », "the") never matches on its own, so "red onion" is found by "onion" and not by "red pepper"; « thé » / "the" and « maïs » / « mais » (but) are kept apart. One matching, so a change to it changes "For this step" and the prep page's step tags together.
- **Also:** ← → (and a swipe on a touch screen) move between steps, Space starts or pauses the timer, Keep screen on holds a wake lock, amounts and the numbers in the text scale with the servings.

## Finished view ("I cooked this")

`CookedView` (`components/CookedView.jsx`, pieces in `CookedViewParts.jsx`, logic in `lib/cookedView.js`; design: `docs/design/riso-v2-cook-mode/`, "Cook Mode Finished.dc.html" and the README's "Finished view") is the one screen after cooking. **`App.jsx` renders the one `CookedViewHost`** and opens it with `openCooked({ recipe, servings, entry?, variant })` from three doors: the last step of Cook mode (`variant="screen"`, full screen over Cook mode, light or dark with the shared switch), a planned meal's card on the Planner and tonight's meal on Home (`variant="sheet"`, over the page; full screen on a phone). It always opens, every time.

- **Head:** the green "all done!" sticker and « Le souper est prêt. » (the meal's own: déjeuner, dîner, souper).
- **Leftovers card first** (`LeftoversCard`): the shared hint strip (key `cooked-leftovers`), one square per serving cooked (tap one to set the portions; it starts on the servings minus one, or on the leftover meals already planned for the recipe), Fridge or Freezer with the keep times (`lib/leftovers.js`), and the item as Inventory will show it (photo, name, "2 portions · Fridge", LEFTOVER). **This card is the confirmation** (`CLAUDE.md`): "+ Add to Inventory" adds that item to the Leftovers shelf; "No leftovers" adds nothing. Leftover meals already planned for the recipe are linked to the new leftovers (`linkableCopies`).
- **"then" / "now"** between the cards; the Inventory card is faded and can't be used until Leftovers is answered.
- **Take out of your Inventory** (`TakeOutCard`): the hint strip (key `cooked-inventory`), the Makeable card's count and bar, then the rows under their shelves (`shelfGroups`), then "Always have" (pantry staples not in Inventory) and "Not in your Inventory". The rows come from `buildTakeOut` (Ingredient-to-Inventory matching), worked out once when the view opens. Each row: emoji, the item's name, what's left after (or what stays), the amount as a highlighter mark (tap it to type another; `editedRow`), the tick. A row whose units don't convert, or whose item has no amount, asks for the amount ("All of it" for an item with no amount) and starts off. A staple in Inventory starts off, with Running low (a hand-added grocery item, the shared toast with Undo).
- **Remove from inventory** sends the switched-on amounts (`takesFrom`) to `POST /pantry-inventory/take-out`: amounts go down, items at zero leave (logged as used up). **Not now** changes nothing. Either way the planned meal is marked cooked (`cookedAt`; from Cook mode it is the recipe's meal today, else its last one earlier this week, `plannedMealFor`), so it leaves the grocery list and its card says ✓ Cooked.
- **Undo** on each card, and on the shared toast when the view closes, puts everything back (`POST /pantry-inventory/put-back` restores the rows as they were, same ids; the leftovers are deleted; the cooked mark is cleared). Undo on the Leftovers card undoes the Inventory answer too, as the design does.
- **Pop-up** after either Inventory button: "Enjoy your supper", one line on what changed, "Back to the app" (closes the view, and Cook mode, with the confetti burst over the app) and "Stay on this page".
- Phone: one column, ↓ between the cards, buttons stacked. Every colour is a token; the greens are the celebration exception (see Photo card, Colours).

## Ingredient-to-Inventory matching

`lib/inventoryMatch.js` is **the one matcher in the app**: it says which Inventory item is a recipe ingredient, for every page that decides "have it or not" and for the finished view's take-out list (`buildTakeOut`). Do not compare Inventory with a recipe any other way (`core()` in `lib/similarRecipes.js` is only for comparing recipes with each other, the grocery list and flyer deals). Two names are the same food once both are read in English: French names count (the flyers' word pairs in `lib/bilingual.js` plus kitchen words: « Poulet », « Lait 2 % », « ail », « pommes de terre »), food words in any order, prep and descriptor words left out ("whole", "2%", "unsalted", "boneless"); a colour or variety ("yellow", "basmati", "greek") and a cut ("thighs") only separate two foods when both names give one; a stock, powder, paste, sauce or juice is never the food it is made of; a staple only matches a staple; leftovers never match. French staples and spices count as staples too (« sel », « poivre », « huile végétale », « farine », « cassonade », « poudre à pâte », « bicarbonate de soude », « fécule de maïs », « origan »...), so does "salt and pepper" / « sel et poivre » on one line, and a bell pepper (« poivrons ») is a vegetable, never the spice. Several items for one ingredient: the one still good with the soonest use-by first, the rest from the next. `buildTakeOut` scales the recipe's amounts to the servings cooked, adds up an ingredient listed twice, converts to the item's unit (weights with weights, volumes with volumes, counts with counts, `convertAmount`) and asks when it can't. Unit tests: `lib/inventoryMatch.test.js`.

What the pages use (`kitchen` is App's `{ inventory, customStaples, excludedStaples }`, built once in `App.jsx` and passed down):

- `ingredientHave(name, kitchen)`: "staple", "have" or "need" for one ingredient. The recipe card's ✓ beside each line.
- `recipeHave(recipe, kitchen)`: `{ have, buy, missing, totalCount, matchedCount, missingCount }`, one line per food in the recipe's order (two lines are one food when each covers the other: "garlic cloves" and "minced garlic"), named as the recipe writes it, staples left out. The one count: the recipe card's numbers, the pop-out and the planned-meal card (`IngredientMarks`), the Planner's search and Makeable (through `rankRecipesForTray` in `lib/plannerSuggestions.js`, then `findRecipes` and `makeableSections`), Home's Makeable now and tonight's card (`makeableNow` in `lib/homeWeek.js`), the Recipes page's "makeable now" count and Fewest missing sort, and the recipe form's preview.
- `expiringItemsIn(recipe, inventory, plannerEntries, recipes, days)`: the "uses expiring" rule (the recipe card's "use soon", the Makeable card's pink strip, the Recipes count). The finder's "Expiring soon" and its ranking use `expiringSoon` and `recipeUsesItem`.
- Cook with: `recipeUsesItem(recipe, itemName)` finds the recipes using a pick (a staple also by its name inside the recipe's, "smoked paprika"), and `foodKey` lists each food once on the shelves; leftovers are not on the shelves.

The answers are kept per Inventory (a `WeakMap` on the array) until it, the staples or the day change. Unit tests: `lib/inventoryMatch.test.js`, and `lib/oneMatcher.test.js` checks one recipe gives the same answer on every page, in English and French; `e2e/one-matcher.spec.js` checks it in the app on a computer and at 390px in French.

## Leftovers

One leftovers system. A **LEFTOVER item** is an Inventory item with `isLeftover` (and `recipeId`, the recipe it came from, none when typed in by hand), counted in portions (unit `portion`), kept in the fridge or the freezer (`location`), on Inventory's **Leftovers** shelf (a built-in shelf, `onShelf`; it is a shelf to look at, so `shelfOptions` leaves it out). `lib/leftovers.js` has the one set of keep times (the recipe's `fridgeLifeDays` or 4 in the fridge, 75 in the freezer) used by the finished view, the Planner's warning, thawing (`thawPatch`) and the item form's Leftovers mode.

- **Inventory:** a leftover's card shows the recipe's photo, the LEFTOVER tag, Fridge or Freezer and the days left; frozen ones have "Move to fridge to thaw" (Undo). They don't drag between shelves. "+" on the Leftovers shelf (or the Leftovers chip in the add form) adds leftovers by hand: portions, Fridge or Freezer, and an optional recipe.
- **Planner:** the search's leftover cards (see Planner finder card) plan a leftover meal with `leftoverItemId` (a recipe meal, or a note « Restes · pizza » for leftovers with no recipe); the yellow border and tag as before, nothing on the grocery list. Leftover meals planned ahead (round button, Option-drag, Place leftovers) are linked when the recipe's leftovers are added. The "past fridge life" sticker uses `leftoverIsStale`: after the leftovers' use-by date when linked, else more days after the meal than the recipe keeps.
- **A day passes:** when the app opens, `POST /pantry-inventory/leftovers/settle` takes one portion off for each linked leftover meal before today, once (the meal gets `cookedAt`); leftovers at zero leave. The toast says so; Undo puts the portions back.
- **Home:** Use it up lists leftovers with 3 days or less first (`toUseItems`), with the LEFTOVER tag; Cook with these searches the other items.

## Where things live in `App.jsx`

`App.jsx` owns the data and the shared pieces above: `openPopout`, `requestPlan`, `openRecipeCard`, `showToast`. A page gets them as props. A new page that needs a recipe opened, a recipe planned or a message shown uses these and does not make its own.
