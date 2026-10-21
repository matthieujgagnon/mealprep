import { LEFTOVERS_SHELF, onShelf, shelfSetOf } from "./shelves.js";

// Deleting a shelf on Inventory HIDES it (InventorySectionLayout.hidden, `movedTo`): the pure
// parts of the sheet that asks where its items go, of "Bring back" and of the last-shelf rule.
// `sections` is what orderedSections() in Inventory.jsx gives: [{ id, label, hidden, movedTo, ... }]
// in page order, hidden shelves included.

// Where a deleted shelf's items go unless Matt picks another: Freezer to Fridge, Fridge to Pantry,
// Pantry to Fridge, Leftovers to Fridge, Prepared meals to Freezer, a shelf of his own to Pantry.
// A default that is not left (hidden, or the shelf being deleted) is the first shelf that is.
const DEFAULT_TARGET = { fridge: "pantry", freezer: "fridge", pantry: "fridge", leftovers: "fridge", prepared: "freezer" };

// The shelves a deleted shelf's items can go to: the ones showing, never itself, never Leftovers
// (it only shows leftovers).
export function moveChoices(sections, id) {
  return sections.filter((section) => !section.hidden && section.id !== id && section.id !== LEFTOVERS_SHELF);
}

export function defaultMoveTarget(sections, id) {
  const choices = moveChoices(sections, id);
  const wanted = DEFAULT_TARGET[id] ?? "pantry";
  return (choices.find((section) => section.id === wanted) ?? choices[0])?.id ?? null;
}

// The last-shelf rule: at least one shelf that can hold ingredients must be left. The sheet says
// so instead of asking where the items go.
export function isLastShelf(sections, id) {
  return moveChoices(sections, id).length === 0;
}

// The layout with one shelf hidden, going to `movedTo`, or shown again.
export function withShelfHidden(sections, id, movedTo) {
  return sections.map((section) => (section.id === id ? { ...section, hidden: true, movedTo: movedTo ?? null } : section));
}

export function withShelfShown(sections, id) {
  return sections.map((section) => (section.id === id ? { ...section, hidden: false, movedTo: null } : section));
}

// How many items show on a shelf. With `shown`, how many would if it were showing (what Bring back
// brings back, and what the sheet counts for a shelf that is still there).
export function countOnShelf(items, sections, id, { shown = false } = {}) {
  const set = shelfSetOf(shown ? withShelfShown(sections, id) : sections);
  return items.filter((item) => onShelf(item, id, set)).length;
}

// The deleted shelves Bring back lists, in page order, each with what returns to it.
export function hiddenShelves(sections, items) {
  return sections.filter((section) => section.hidden).map((section) => ({ id: section.id, label: section.label, count: countOnShelf(items, sections, section.id, { shown: true }) }));
}
