# Rules for working on this project

Read [docs/how-it-works.md](docs/how-it-works.md) for the stack and folders, and [README.md](README.md) for running and testing.

## Nothing is added to Inventory without Matt confirming first

Every way of adding items to Inventory must open the same confirmation sheet first
(`InventoryConfirmSheet` in `client/src/components/InventoryConfirm.jsx`, opened through
`requestInventoryAdd` in `client/src/App.jsx`). The sheet lists each item with its name,
amount, shelf and use-by date. Matt can change any of those or switch a row off, then confirm
with "Add N to inventory" (« Ajouter N à l'inventaire »), or cancel. **Cancel adds nothing and
leaves whatever it came from (the grocery list, a receipt, a recipe) as it was.**

This covers:
- "Done shopping" in Grocery and in Store mode
- a checked grocery item's "To inventory" button
- receipt import
- "I have it" on a recipe's ingredient
- anything new that puts items in Inventory

The exceptions, which count as Matt confirming:
- Typing an item into Inventory's own "Add item" form (leftovers too, in its Leftovers mode)
  goes in directly (`handleAddPantryItem` in `App.jsx`).
- The Leftovers card in the finished view ("I cooked this", `components/CookedView.jsx`) is
  the confirmation for leftovers: it shows the exact item that will be added (name, portions,
  Fridge or Freezer, photo, the LEFTOVER tag), and "+ Add to Inventory" (« + Ajouter à
  l'inventaire ») is the confirm. "No leftovers" adds nothing. It adds through
  `handleAddPantryItem` (the `addItem` that `App.jsx` gives `CookedViewHost`), with no extra sheet.
- Undo puts items back without the sheet. The Undo of "Remove from inventory" in the finished
  view, and of a portion taken off a planned leftover, calls `api.putBackPantryItems`, which
  restores the rows exactly as they were (same ids, amounts, shelves and dates). It only undoes
  a removal; it is never a way of adding something new.

Do not call `api.addPantryInventoryItem` or `handleAddPantryItem` from anywhere else. A new
way of adding must call `requestInventoryAdd(drafts)` and only act on the rows it resolves
with (it resolves with the `ref` of each added row, or null if cancelled).

When you add or change a way of adding to Inventory, update the Help text for Grocery and
Inventory in both languages (`client/src/i18n/en.js` and `fr.js`, and the button copies in
`client/src/lib/helpCopies.js`).

## Reuse what exists

Before building any new piece of UI, check [docs/components.md](docs/components.md) and reuse or extend what is there. Never build a second version of something that exists: one recipe pop-out, one slot picker, one toast, one week calendar, one "Makeable now" rule, one Inventory matcher (`lib/inventoryMatch.js`: every "have it or not" goes through it), one `openRecipeCard`, one set of Riso pills. If a shared piece almost fits, extend it and update its entry in `docs/components.md` in the same change.

## Language

All user-facing text goes in both `client/src/i18n/en.js` and `fr.js` (Quebec French). A test
checks the two stay in step.

## Testing

While working, run only the tests related to the change; CI runs the full suite.
