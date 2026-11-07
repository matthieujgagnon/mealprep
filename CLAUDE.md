# Rules for working on this project

Read [docs/how-it-works.md](docs/how-it-works.md) for the stack and folders, and [README.md](README.md) for running and testing.

## Nothing is added to Inventory without Matt confirming first

Every way of adding items to Inventory must open the same confirmation sheet first
(`InventoryConfirmSheet` in `client/src/components/InventoryConfirm.jsx`, opened through
`requestInventoryAdd` in `client/src/App.jsx`). The sheet lists each item with its name,
amount, shelf, where it is kept and use-by date. Matt can change any of those or switch a row off, then confirm
with "Add N to inventory" (« Ajouter N à l'inventaire »), or cancel. **Cancel adds nothing and
leaves whatever it came from (the grocery list, a receipt, a recipe) as it was.**

This covers:
- "Done shopping" in Grocery and in Store mode (the queued items ticked, the bought ones not)
- a store's "+ Add N to inventory" at the bottom of the grocery list (its queued items)
- receipt import
- "I have it" on a recipe's ingredient
- anything new that puts items in Inventory

The exceptions, which count as Matt confirming:
- Typing an item into Inventory's own "Add item" form (leftovers too, in its Leftovers mode, and
  its Prepared meal switch) goes in directly (`handleAddPantryItem` in `App.jsx`).
- The Leftovers card in the finished view ("I cooked this", `components/CookedView.jsx`) is
  the confirmation for leftovers: it shows the exact item that will be added (name, portions,
  Fridge or Freezer, photo, the LEFTOVER tag), and "+ Add to Inventory" (« + Ajouter à
  l'inventaire ») is the confirm. "No leftovers" adds nothing. It adds through
  `handleAddPantryItem` (the `addItem` that `App.jsx` gives `CookedViewHost`), with no extra sheet.
- Undo puts items back without the sheet. The Undo of "Remove from inventory" in the finished
  view, and of a portion taken off a planned leftover, calls `api.putBackPantryItems`, which
  restores the rows exactly as they were (same ids, amounts, shelves and dates). It only undoes
  a removal; it is never a way of adding something new.
- « Remettre » / Put back in Inventory's Recently removed puts an item back without the sheet,
  like Undo. It calls `api.putBackRemovedPantryItem` (`handlePutBackRemoved` in `App.jsx`),
  which restores the row exactly as it was when it left (same id, shelf, where it is kept, amount and
  use-by date). It only undoes a removal from the last 7 days; it is never a way of adding something new.

- **Examples** (« Exemple », `server/src/lib/examples.js`, content in `server/src/lib/exampleContent.js`):
  - **Signup's starting content.** A new account starts with example recipes, a planned week and 12
    Inventory items. The app makes them as part of making the account (the person has added nothing),
    on the server, in `createExamples`, never through `handleAddPantryItem` or
    `api.addPantryInventoryItem`. Every row is tagged « Exemple » (`isExample`).
  - **« Ajouter des exemples » / "Add examples"** (account menu, only for an account with none) is the
    person adding, so it has its own confirm sheet (`ConfirmDialog`, opened in `App.jsx`): it lists
    exactly what will be added (the counts and the Inventory names) and warns that they count as real
    stock until removed. Its button « Ajouter les exemples » is the confirm; **Cancel adds nothing**. It
    calls `api.addExamples` and no other way of adding.
  - **Undo of « Retirer les exemples »** (`api.undoExamples`) puts back exactly what that removal took,
    from a copy the server kept (`ExampleRemoval`), with the same ids; nothing the browser sends is
    trusted. Like Undo above, it only undoes a removal and is never a way of adding something new.
  - **The mark.** Removing the examples deletes only rows that still have `isExample`, and the mark
    comes off, in the same save, when the person does something to the row (edits a recipe, plans it,
    cooks it; moves or changes a planned meal; edits an Inventory item or cooks from it). **Any new route
    that saves a recipe, a planned meal or an Inventory item for the person must lift the mark**
    (`isExample: false` or `liftMark`, `server/src/lib/examples.js`), and the app's own steps must not;
    `server/src/exampleMarkRule.test.js` lists every such write and fails until a new one is added to it
    with its reason. Examples are never written to Recently removed, and never count as the person's own
    activity (anything that counts a person's recipes, planned meals or Inventory items reads `isExample: false`).
- « Je l'ai comme… » / "I have it as…" (`InventoryLinkPopup.jsx`, `lib/inventoryLinks.js`) is not a way of
  adding: it adds nothing to Inventory, it only links a recipe's name to an item Matt already has
  (the matcher reads the link, nowhere else), so it needs no sheet. « J'en ai » / "I have it" is the
  one that adds, through the sheet. For now it is for the admin account only (`user.isAdmin` on the
  client, `ADMIN_EMAILS` on the server, the `<admin>` Help text): do not show it to testers.

Do not call `api.addPantryInventoryItem` or `handleAddPantryItem` from anywhere else. A new
way of adding must call `requestInventoryAdd(drafts)` and only act on the rows it resolves
with (it resolves with the `ref` of each added row, or null if cancelled).

When you add or change a way of adding to Inventory (the examples included), update the Help text for Grocery and
Inventory in both languages (`client/src/i18n/en.js` and `fr.js`, and the button copies in
`client/src/lib/helpCopies.js`).

## Reuse what exists

Before building any new piece of UI, check [docs/components.md](docs/components.md) and reuse or extend what is there. Never build a second version of something that exists: one "this item is a meal" rule (`lib/mealItem.js` `isMealItem`: a leftover or a prepared meal, never an ingredient; `isLeftover` on its own only where something is truly leftover-only; `server/src/oneMealRule.test.js` fails otherwise), one recipe pop-out, one slot picker, one toast, one week calendar, one "Makeable now" rule, one Inventory matcher (`lib/inventoryMatch.js`: every "have it or not" goes through it), one "what meal types is this recipe, and is it prepared" reader (`lib/mealSlots.js` `recipeSlots` / `isPreparedRecipe`; "Meals" = breakfast, lunch or supper and not prepared, everywhere; `Recipe.mealSlot` is the old column, never read), one "which shelf is this item on" rule (`lib/shelves.js` `shelfOf`; where it is KEPT is `location`, which the use-by date follows, and the shelf is `shelf`; any shelf can be deleted, which only hides it, and `shelfOf` then follows where its items moved to, so a list of "places to keep something" is never built from the shelf list; `server/src/shelfRule.test.js` fails otherwise), one "what is this ingredient called in the language shown" rule (`lib/ingredientDisplay.js` and its table `ingredientDisplay.txt`, with Matt's own changes from the Admin page on top of it, `IngredientNameOverride`: display only, the recipe and what Matt typed are never changed, and a name is never translated by hand in a component; the file is parsed in one place, `lib/ingredientTable.js`, which the server runs too, and a reader of the names takes `effectiveIngredientRows()` (browser) or `builtInIngredientRows()` (server), never a second parse; the same list is the one source of French and English names for the Inventory matcher (`lib/frenchReading.js`; `lib/matcherWords.js` is only its few own words, not names) and for the recipe search (`ingredientSearchTerms`), so a French or English name is added to the table and never to the matcher or the search by hand), one `openRecipeCard`, one set of Riso pills (« Exemple » is one of them: `ExampleTag`, on anything with `isExample`, never a second tag), one recipe store (`lib/recipeStore.js`: a planned meal's recipe is read through `useLiveEntries`, never from the copy that came with the meal). If a shared piece almost fits, extend it and update its entry in `docs/components.md` in the same change.

## Language

All user-facing text goes in both `client/src/i18n/en.js` and `fr.js` (Quebec French). A test
checks the two stay in step.

## Testing

While working, run only the tests related to the change; CI runs the full suite.
