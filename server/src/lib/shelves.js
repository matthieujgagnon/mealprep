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
