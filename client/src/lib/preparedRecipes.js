import { matchingItems } from "./inventoryMatch.js";

// A planned prepared recipe (« Plat préparé »: croissants, a frozen lasagna) is eaten from the
// prepared meal in Inventory that has its name, once its day has passed (App.jsx asks the server
// which meals are due, POST /pantry-inventory/prepared-recipes/settle takes one box off each).
// Which Inventory item that is, is the matcher's call, the one place that says whether two names
// are the same food (lib/inventoryMatch.js, `prepared: true`): a prepared meal of that name and
// nothing else, never an ingredient or a leftover.
//
// `due`: [{ entryId, recipe: { ingredients: [{ name }] } }] from the server; `inventory` the items.
// Returns [{ entryId, itemId }], one for each meal that has such an item: the first of its
// ingredients that is held, the item to eat first first (the soonest use-by date).
export function preparedMatches(due, inventory) {
  const matches = [];
  for (const { entryId, recipe } of due || []) {
    for (const ing of recipe?.ingredients || []) {
      const [item] = matchingItems(ing.name, inventory || [], { prepared: true });
      if (item) {
        matches.push({ entryId, itemId: item.id });
        break;
      }
    }
  }
  return matches;
}
