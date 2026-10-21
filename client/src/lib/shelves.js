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
//
// ANY shelf can be deleted, and deleting is HIDING it (InventorySectionLayout.hidden): nothing is
// deleted and nothing is written onto an item. A hidden shelf names the shelf its items go to
// (`movedTo`), and `shelfOf` follows that when it is given a `ShelfSet` (`shelfSetOf`): an item
// whose shelf is hidden shows on the shelf it moved to, still saying where it is kept (a frozen
// item on Fridge says « Congél. »), and new items follow the same way because they only say where
// they are kept. Bring the shelf back and every item is where its own rule puts it again.

export const STORAGES = ["fridge", "freezer", "pantry"];
export const isStorage = (value) => STORAGES.includes(value);

export const PREPARED_SHELF = "prepared";
export const LEFTOVERS_SHELF = "leftovers";

// Where the item is kept, or null when it is not known yet.
export function storageOf(item) {
  return isStorage(item?.location) ? item.location : null;
}

// The shelves as the page shows them: a Set of the ids that are SHOWING (so `has` means "this
// shelf exists on the page"), plus what to do with the shelves that are hidden. A plain Set works
// everywhere a ShelfSet does and means "no shelf is hidden".
//   redirects  Map(hidden shelf id -> the shelf its items go to, or null = the first shelf left)
//   fallback   the first shelf that is showing and can hold ingredients (never Leftovers)
export class ShelfSet extends Set {
  redirects = new Map();
  fallback = null;
}

// `sections`: [{ id, hidden?, movedTo? }] in page order (orderedSections in Inventory.jsx).
export function shelfSetOf(sections) {
  const showing = sections.filter((section) => !section.hidden);
  const set = new ShelfSet(showing.map((section) => section.id));
  set.redirects = new Map(sections.filter((section) => section.hidden).map((section) => [section.id, section.movedTo ?? null]));
  set.fallback = showing.find((section) => section.id !== LEFTOVERS_SHELF)?.id ?? null;
  return set;
}

// A shelf that may be hidden, followed to the shelf that is showing: its `movedTo`, and if that is
// hidden too, on to where it goes. A target that is gone (or a loop) is the first shelf left.
export function followHidden(id, shelves) {
  const redirects = shelves?.redirects;
  if (!redirects || !redirects.has(id)) return id;
  const seen = new Set();
  let at = id;
  while (redirects.has(at) && !seen.has(at)) {
    seen.add(at);
    const next = redirects.get(at);
    at = next && next !== at ? next : shelves.fallback ?? at;
  }
  return shelves.has(at) ? at : shelves.fallback ?? at;
}

// The shelf an item shows on when the person has not chosen one: Leftovers for a leftover,
// Prepared meals for a prepared meal, otherwise the shelf of where it is kept (an item whose
// storage is not known yet has its shelf in `shelf`, or in the old `location`).
export function defaultShelfOf(item) {
  if (item?.isLeftover) return LEFTOVERS_SHELF;
  if (isPreparedMeal(item)) return PREPARED_SHELF;
  return storageOf(item) || item?.location || "pantry";
}

// The shelf an item belongs on before a hidden shelf is followed. `shelfIds`, when given, is every
// shelf that exists (the built-in ones and the person's own, hidden ones too): a chosen shelf that
// is not among them, a section that is really gone, is the default shelf. A leftover is always
// on Leftovers.
export function ownShelfOf(item, shelfIds) {
  if (item?.isLeftover) return LEFTOVERS_SHELF;
  const chosen = item?.shelf;
  if (chosen && (!shelfIds || shelfIds.has(chosen) || shelfIds.redirects?.has(chosen))) return chosen;
  return defaultShelfOf(item);
}

// The shelf an item shows on: its own shelf, or the shelf it moved to when its own is hidden.
export function shelfOf(item, shelfIds) {
  return followHidden(ownShelfOf(item, shelfIds), shelfIds);
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
  // A shelf that is hidden is not a place to drop on.
  if (shelfIds?.redirects?.has(target)) return null;
  if (shelfOf(item, shelfIds) === target) {
    // Showing here only because its own shelf is hidden (a frozen item on Fridge): dropping it where
    // it already is changes nothing, and never where it is kept.
    if (ownShelfOf(item, shelfIds) !== target) return null;
    // Already there (but dropped on a storage shelf it also says where it is kept).
    if (!(isStorage(target) && storageOf(item) !== target)) return null;
  }
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
// not the shelf of where it is kept (Prepared meals, Leftovers, any section of their own, or the
// shelf a deleted one moved its items to).
// Returns the storage to name, or null (on the Fridge, Freezer and Pantry shelves it adds nothing,
// and an item whose storage is not known yet has nothing to say).
export function storageLabelOf(item, shelfIds) {
  const kept = storageOf(item);
  if (!kept) return null;
  return shelfOf(item, shelfIds) === kept ? null : kept;
}
