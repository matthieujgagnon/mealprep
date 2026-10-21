import { en } from "../i18n/en.js";
import { fr } from "../i18n/fr.js";
import { LEFTOVERS_SHELF, isStorage, onShelf, shelfOf, storageOf } from "./shelves.js";

// The one-time list for what the move to two fields (where it is kept, which shelf it is on) left
// open, offered in a short sheet on Inventory (components/InventoryStorageSheet.jsx). Nothing here
// changes anything: it only says what is open.

// "Plats préparés" and "plats prepares" are the same name: lower case, no accents, one space.
// server/src/lib/shelves.js has the same function.
export function normalizeName(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Items that were moved to one of the person's own sections before the two fields were kept
// apart: where they are kept was lost (their `location` is not fridge, freezer or pantry). A
// leftover is always kept in the fridge or the freezer, so it is never in the list.
export function unknownStorageItems(items) {
  return (items || []).filter((item) => shelfOf(item) !== LEFTOVERS_SHELF && !storageOf(item));
}

// What a short pick is stored as: only the items the person chose a storage for, and only a
// storage (never a shelf). `picks`: { [itemId]: "fridge" | "freezer" | "pantry" }.
export function storageChoices(items, picks) {
  return items.filter((item) => isStorage(picks[item.id])).map((item) => ({ id: item.id, location: picks[item.id] }));
}

// Every name a built-in shelf answers to, normalized: its two default names and the name the
// person gave it (`layout`: the saved rows, whose `label` renames a built-in).
export function builtInShelfNames(layout = []) {
  const names = new Set();
  for (const id of ["fridge", "freezer", "pantry", "leftovers", "prepared"]) {
    names.add(normalizeName(en.locations[id]));
    names.add(normalizeName(fr.locations[id]));
  }
  for (const row of layout) {
    if (row.label && ["fridge", "freezer", "pantry", "leftovers", "prepared"].includes(row.sectionId)) names.add(normalizeName(row.label));
  }
  return names;
}

// The old sections that are now a copy of a built-in shelf and have nothing on them: Matt's old
// « Prepared meals » once it was merged into the built-in one. The sheet offers to delete each
// (with Undo); nothing deletes it for him. One he has already deleted (hidden) is not offered.
export function emptyDuplicateShelves(locations, layout, items) {
  const names = builtInShelfNames(layout);
  const deleted = new Set((layout || []).filter((row) => row.hidden).map((row) => row.sectionId));
  return (locations || []).filter((shelf) => {
    if (deleted.has(shelf.id)) return false;
    if (!names.has(normalizeName(shelf.name))) return false;
    // Nothing on it: by shelfOf, which also counts an item whose storage is not known yet and that
    // is still on this section.
    return !(items || []).some((item) => onShelf(item, shelf.id));
  });
}
