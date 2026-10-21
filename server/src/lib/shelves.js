// WHERE an Inventory item is STORED and WHICH SHELF it shows on are two things.
//
//   PantryInventoryItem.location  where it is kept: "fridge" | "freezer" | "pantry". It is the
//                                 one the USDA use-by estimate and shelf life are read from.
//   PantryInventoryItem.shelf     the shelf the person chose to see it on: one of their own
//                                 sections (a PantryLocation id), a built-in one ("fridge",
//                                 "freezer", "pantry", "prepared"), or null for the default:
//                                 the storage's own shelf, « Plats préparés » for a prepared
//                                 meal, Leftovers for leftovers.
//
// Before the `shelf` column an item moved to one of the person's own sections had its
// `location` replaced by that section's id, so the app forgot where it was kept. Those rows
// are copied into `shelf` by the migration and keep their old `location` until the person
// says where each is kept (a `location` that is not a storage means "not known yet").
// client/src/lib/shelves.js is the same rule for the browser.

export const STORAGES = ["fridge", "freezer", "pantry"];
export const isStorage = (value) => STORAGES.includes(value);

export const PREPARED_SHELF = "prepared";
export const LEFTOVERS_SHELF = "leftovers";

// The built-in shelves a person can choose to keep an item on (Leftovers is not a choice: a
// leftover is always there).
export const CHOOSABLE_BUILT_IN = [...STORAGES, PREPARED_SHELF];

// Every built-in shelf id (Leftovers included: it is a shelf to look at, but it can be hidden).
export const BUILT_IN_SHELVES = [...STORAGES, PREPARED_SHELF, LEFTOVERS_SHELF];

// "Plats préparés" and "plats prepares" are the same name: lower case, no accents, one space.
export function normalizeName(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// The names the built-in shelves have, in both languages. client/src/lib/shelves.js and the
// language files say the same (a test keeps them equal).
export const BUILT_IN_NAMES = {
  fridge: ["Fridge", "Frigo"],
  freezer: ["Freezer", "Congélateur"],
  pantry: ["Pantry", "Garde-manger"],
  leftovers: ["Leftovers", "Restes"],
  prepared: ["Prepared meals", "Plats préparés"],
};

// What a custom shelf named like Matt's own « Prepared meals » is called: the migration merges
// such a shelf into the built-in one (normalized names, see normalizeName).
export const PREPARED_SHELF_ALIASES = ["prepared meals", "prepared meal", "plats prepares", "plat prepare"];

// Every name a built-in shelf answers to, normalized: its two default names and any name the
// person gave it (`layoutRows`: InventorySectionLayout rows, whose `label` renames a built-in).
export function builtInNames(layoutRows = []) {
  const names = new Set(Object.values(BUILT_IN_NAMES).flat().map(normalizeName));
  for (const row of layoutRows) {
    if (row.label && Object.hasOwn(BUILT_IN_NAMES, row.sectionId)) names.add(normalizeName(row.label));
  }
  return names;
}

export function isBuiltInName(name, layoutRows = []) {
  return builtInNames(layoutRows).has(normalizeName(name));
}

// A shelf an item may be put on. undefined = not given; null = the default shelf; false = not a
// shelf of this person's.
export async function resolveShelf(prisma, userId, value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (CHOOSABLE_BUILT_IN.includes(value)) return value;
  const custom = await prisma.pantryLocation.findFirst({ where: { id: String(value), userId }, select: { id: true } });
  return custom ? custom.id : false;
}

// `location` and `shelf` as a request sends them, read as { location, shelf } (undefined =
// leave as it is, null = the default shelf) or { error: true }. A `location` that is one of the
// person's own sections (what the app sent before the two were kept apart, or a tab opened
// before the update) is read as the SHELF, and the storage is left alone.
export async function readPlacement(prisma, userId, body) {
  const out = { location: undefined, shelf: undefined };
  if (body.shelf !== undefined) {
    const shelf = await resolveShelf(prisma, userId, body.shelf);
    if (shelf === false) return { error: "shelf" };
    out.shelf = shelf;
  }
  if (body.location !== undefined) {
    if (isStorage(body.location)) out.location = body.location;
    else {
      const asShelf = await resolveShelf(prisma, userId, body.location);
      if (asShelf === false || asShelf === null || CHOOSABLE_BUILT_IN.includes(asShelf)) return { error: "location" };
      if (out.shelf === undefined) out.shelf = asShelf;
    }
  }
  return out;
}

// How a row from Recently removed or an Undo is put back (restoreRow): the storage as it was
// (a storage, or the id of a section that still exists = "not known yet"; anything else goes to
// the Pantry as it always did) and the shelf as it was (a row saved before the two were kept
// apart has its shelf in `location`). A shelf that no longer exists is the default shelf.
export async function restorePlacement(prisma, userId, row) {
  const isCustomId = async (id) => {
    if (typeof id !== "string" || !id || isStorage(id) || CHOOSABLE_BUILT_IN.includes(id)) return false;
    return !!(await prisma.pantryLocation.findFirst({ where: { id, userId }, select: { id: true } }));
  };
  let location = "pantry";
  let shelf = null;
  if (isStorage(row.location)) location = row.location;
  else if (await isCustomId(row.location)) {
    location = row.location;
    shelf = row.location;
  }
  if (row.shelf !== undefined && row.shelf !== null && row.shelf !== "") {
    const resolved = await resolveShelf(prisma, userId, row.shelf);
    shelf = resolved || null;
  }
  return { location, shelf };
}

// ---- Hiding a shelf (any shelf can be deleted; nothing is ever deleted) -----------------------
//
// A deleted shelf is HIDDEN: its InventorySectionLayout row stays, with `hidden` on and `movedTo`
// naming the shelf its items and new items show on meanwhile. Nothing is written onto any item.
// client/src/lib/shelves.js reads the same two fields when it draws the shelves.

// What a layout save leaves each shelf as: `before` is Map(sectionId -> { hidden, movedTo }) of the
// rows already stored, `rows` the rows sent ({ sectionId, hidden?, movedTo? }, undefined = not
// sent, which leaves it as it was, so an old tab that never heard of hiding changes nothing).
// A shelf that is shown has no `movedTo`.
export function hidingAfter(before, rows) {
  const after = new Map();
  for (const [id, row] of before) after.set(id, { hidden: row.hidden === true, movedTo: row.hidden === true ? row.movedTo ?? null : null });
  for (const row of rows) {
    const was = after.get(row.sectionId) ?? { hidden: false, movedTo: null };
    const hidden = typeof row.hidden === "boolean" ? row.hidden : was.hidden;
    after.set(row.sectionId, { hidden, movedTo: hidden ? (row.movedTo !== undefined ? row.movedTo : was.movedTo) : null });
  }
  return after;
}

// Why a layout save may not hide shelves, or null when it may. `customIds` are the person's own
// PantryLocation ids. A rule only judges what THIS save changes (a shelf newly hidden, or a hidden
// one given a new target), so a save that only resizes is never refused.
//   "shelfInvalid"     a shelf that is not one of theirs is hidden
//   "lastShelf"        this would leave no shelf that can hold ordinary items (Leftovers can't)
//   "shelfMoveInvalid" the items would go to a shelf that is missing, hidden, Leftovers or the shelf itself
export function hidingError(customIds, before, rows) {
  const known = new Set([...BUILT_IN_SHELVES, ...customIds]);
  const after = hidingAfter(before, rows);
  const wasHidden = (id) => before.get(id)?.hidden === true;
  const newlyHidden = [];
  const retargeted = [];
  for (const row of rows) {
    const now = after.get(row.sectionId);
    if (!now.hidden) continue;
    if (!known.has(row.sectionId)) return "shelfInvalid";
    if (!wasHidden(row.sectionId)) newlyHidden.push(row.sectionId);
    if (row.movedTo !== undefined && row.movedTo !== (before.get(row.sectionId)?.movedTo ?? null)) retargeted.push(row.sectionId);
  }
  if (newlyHidden.length > 0) {
    const left = [...known].filter((id) => id !== LEFTOVERS_SHELF && after.get(id)?.hidden !== true);
    if (left.length === 0) return "lastShelf";
  }
  for (const id of new Set([...newlyHidden, ...retargeted])) {
    const target = after.get(id).movedTo;
    if (target == null) continue;
    if (target === id || target === LEFTOVERS_SHELF || !known.has(target) || after.get(target)?.hidden === true) return "shelfMoveInvalid";
  }
  return null;
}
