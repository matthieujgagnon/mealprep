import { isPreparedMeal } from "./mealItem.js";

// WHERE an Inventory item is KEPT and WHICH SHELF it shows on are two things, and two fields
// (server/src/lib/shelves.js is the same rule for the server):
//
//   item.location   where it is kept: "fridge" | "freezer" | "pantry". The USDA use-by estimate and
//                   the shelf life are read from it, and only from it. A value that is none of the
//                   three is a section's id left by the old one-field setup: where it is kept is
//                   not known yet (`storageOf` says null) until the person says.
//   item.shelf      the shelf the person chose: one of their own sections, or a built-in one
//                   ("fridge", "freezer", "pantry", "prepared"). null = the default shelf.
//
// `shelfOf` is the ONE place that says which shelf an item shows on. Everything that groups or
// lists Inventory by shelf (the shelves themselves, Cook with, the finished view, the pop-ups)
// asks it; nothing compares `item.location` with a shelf. A test (server/src/shelfRule.test.js)
// fails if code does.

export const STORAGES = ["fridge", "freezer", "pantry"];
export const isStorage = (value) => STORAGES.includes(value);

export const PREPARED_SHELF = "prepared";
export const LEFTOVERS_SHELF = "leftovers";

// Where the item is kept, or null when it is not known yet.
export function storageOf(item) {
  return isStorage(item?.location) ? item.location : null;
}

// The shelf an item shows on when the person has not chosen one: Leftovers for a leftover,
// Prepared meals for a prepared meal, otherwise the shelf of where it is kept (an item whose
// storage is not known yet has its shelf in `shelf`, or in the old `location`).
export function defaultShelfOf(item) {
  if (item?.isLeftover) return LEFTOVERS_SHELF;
  if (isPreparedMeal(item)) return PREPARED_SHELF;
  return storageOf(item) || item?.location || "pantry";
}

// The shelf an item shows on. `shelfIds`, when given, is every shelf that exists (the built-in
// ones and the person's own): a chosen shelf that is not among them, a section just deleted, is
// the default shelf. A leftover is always on Leftovers.
export function shelfOf(item, shelfIds) {
  if (item?.isLeftover) return LEFTOVERS_SHELF;
  const chosen = item?.shelf;
  if (chosen && (!shelfIds || shelfIds.has(chosen))) return chosen;
  return defaultShelfOf(item);
}

export function onShelf(item, shelfId, shelfIds) {
  return shelfOf(item, shelfIds) === shelfId;
}

// What dropping an item on a shelf changes, as a patch for PUT /pantry-inventory/:id (null when
// nothing does). Dropping it on Fridge, Freezer or Pantry says it is KEPT there now (so the
// use-by estimate follows, see `keptThere`); dropping it on Prepared meals or one of the
// person's own shelves changes the shelf only, never where it is kept. A choice that is the
// item's own default is stored as null, so the item keeps following it (where it is kept, or
// Prepared meals for a prepared meal); any other choice sticks.
export function placeOnShelf(item, target, shelfIds) {
  if (!item || item.isLeftover || target === LEFTOVERS_SHELF) return null;
  // Already there (but dropped on a storage shelf it also says where it is kept).
  if (shelfOf(item, shelfIds) === target && !(isStorage(target) && storageOf(item) !== target)) return null;
  if (isStorage(target)) {
    const kept = storageOf(item) !== target;
    // A prepared meal's default shelf is Prepared meals: keeping it in the freezer does not move
    // it there, only choosing the Freezer shelf does.
    const shelf = isPreparedMeal(item) ? target : null;
    return { ...(kept ? { location: target } : {}), ...((item.shelf ?? null) !== shelf ? { shelf } : {}) };
  }
  const shelf = target === PREPARED_SHELF && isPreparedMeal(item) ? null : target;
  return { shelf };
}

// The use-by date for an item that is kept in a new place, from the USDA range for that place
// (null when there is none, or it is not a move: the person's date is left as it is).
export function keptThere(item, patch) {
  if (!patch?.location) return null;
  return item.locations?.[patch.location]?.expiresAt ?? null;
}

// The small "where it is kept" label (« Congél. »): shown when the item sits on a shelf that is
// not the shelf of where it is kept (Prepared meals, Leftovers, any section of their own).
// Returns the storage to name, or null (on the Fridge, Freezer and Pantry shelves it adds nothing,
// and an item whose storage is not known yet has nothing to say).
export function storageLabelOf(item, shelfIds) {
  const kept = storageOf(item);
  if (!kept) return null;
  return shelfOf(item, shelfIds) === kept ? null : kept;
}
