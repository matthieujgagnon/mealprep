import { fold } from "./bilingual.js";

// « Je l'ai comme… » / "I have it as…": the names Matt taught the matcher. A link
// says a recipe that names `recipeName` counts as had when Inventory holds an item
// named `itemName`. It adds nothing to Inventory. The server only keeps the pairs
// (routes/inventoryLinks.js); this module holds the list for the whole app, and the
// matcher (inventoryMatch.js) is the only place that reads it to decide whether a
// name counts (`inventoryLinks.test.js` guards that).
//
// A link is
//   { id, recipeName, itemName, recipeLabel, itemLabel }
// `recipeName` and `itemName` are the keys the matcher compares (linkKey); the labels
// are the names as they were seen, for display. Names, not item ids or matcher keys,
// so a new bottle with the same name still counts and a later change to the matcher's
// rules does not break a link. A link applies to exactly those two names, one way, and
// one hop: it never chains into another link.

// A name as it is compared: accents and capitals folded, spaces collapsed. The
// server's lib/inventoryLinks.js `linkKey` is the same function (a table of names in
// both tests holds them to the same answers).
export function linkKey(name) {
  return fold(String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

let links = [];
let byRecipe = new Map(); // recipe key -> Map(item key -> link)
let version = 0;

// Replaces the whole list (loading it, or after a teach / remove / Undo).
export function setInventoryLinks(next) {
  links = Array.isArray(next) ? next : [];
  byRecipe = new Map();
  for (const link of links) {
    if (!byRecipe.has(link.recipeName)) byRecipe.set(link.recipeName, new Map());
    byRecipe.get(link.recipeName).set(link.itemName, link);
  }
  version++;
}

// The links as a list, oldest first. For code that keeps the list (the App's save logic).
export function allInventoryLinks() {
  return links;
}

// Moves whenever the list changes: the matcher's kept answers start again when it does.
export function linksVersion() {
  return version;
}

// The link that says a recipe naming `recipeName` counts as an Inventory item named
// `itemName`, or null. The matcher alone calls this.
export function findLink(itemName, recipeName) {
  if (byRecipe.size === 0) return null;
  return byRecipe.get(linkKey(recipeName))?.get(linkKey(itemName)) || null;
}

// The links whose Inventory side is this item's name (the item pop-up's "Also counts as").
export function linksOnItemName(itemName) {
  const key = linkKey(itemName);
  return links.filter((link) => link.itemName === key);
}
