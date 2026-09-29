import { buildGroceryList, canonicalize } from "./groceryList.js";

// The same ingredient key the Grocery List groups rows by, so "2 limes" and
// "lime" count as one thing already on the list.
export function groceryCore(name) {
  const { core } = canonicalize(name);
  return core || name.trim().toLowerCase();
}

// Every ingredient already on this week's list - from a planned recipe or
// added by hand. Adding something in this set again would only create a
// duplicate row (hand-added items are never merged into each other).
export function coresOnGroceryList(plannerEntries, extraItems) {
  return new Set(buildGroceryList(plannerEntries, [], {}, [], extraItems).map((item) => item.core));
}
