import { foodsOnLine, haveItemFor, ingredientHave, isTapWater } from "./inventoryMatch.js";

// The Grocery list respects Inventory: a row for something your planned meals
// need and Inventory already holds goes to "Already at home" instead of the list,
// and "Put back on the list" (`keep`) brings it back. "Is it in Inventory" is the
// one matcher (lib/inventoryMatch.js), the same answer the recipe card, Makeable
// and the Planner give. It looks at the name, not the amount.
//
// `items` are the rows from buildGroceryList that were not removed; `kitchen` is
// App's { inventory }; `checkRows` the saved checks. Returns
//   toBuy   the rows that stay on the list
//   atHome  [{ item, by }] the rows Inventory covers, with the Inventory item
//           that does (the one the blue ✓ shows)
// Left alone, so they stay on the list: a row you typed in yourself, a row you
// put back, and a row with a saved check (in the cart, or bought on this trip).
// Water from the tap is on neither: it is never listed.
export function splitAtHome(items, kitchen, checkRows = {}) {
  const toBuy = [];
  const atHome = [];
  for (const item of items) {
    const names = item.ingredientNames || [];
    if (names.length > 0 && names.every(isTapWater)) continue;
    const covered =
      names.length > 0 &&
      !item.isManual &&
      !item.keep &&
      !checkRows[item.key] &&
      names.every((name) => ingredientHave(name, kitchen) === "have");
    if (!covered) toBuy.push(item);
    else atHome.push({ item, by: haveItemFor(foodsOnLine(names[0])[0], kitchen?.inventory || []) });
  }
  return { toBuy, atHome };
}
