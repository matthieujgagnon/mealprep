// Saves that are still on their way, by part of the app ("area").
//
// A change shows on screen at once and is saved in the background. If the next
// screen asks the server for the same data before that save has landed, it gets
// the old answer and shows it. So `api.js` keeps every save here, and a read of
// the same area first waits for the saves already sent (`afterSaves`).
//
// A screen that loads several things together can also ask whether anything was
// saved while it was loading (`savesVersion` changes when a save starts and
// when it ends), and load again if so.
//
// The "grocery" area is everything the grocery list is made of: its own rows,
// the planned meals it is built from (any Planner save: placing, moving,
// removing, noting, copying) and the recipes those meals use (a recipe edited
// or deleted). `saveArea` and `readArea` say which request belongs to it.
export const GROCERY = "grocery";

// The "links" area is the names Matt taught the matcher (« Je l'ai comme… »,
// /inventory-links): a read of them waits for the teach and remove saves already sent
// (lib/linkSaves.js), so a list read right after a change is never the one from before.
export const LINKS = "links";

// The "names" area is Matt's changes to the ingredient names (/ingredient-names, /admin/ingredient-names):
// a read of them waits for the saves already sent (lib/nameSaves.js).
export const NAMES = "names";

// The area a save (a request that is not a GET) can change, or null.
export function saveArea(path, method) {
  if (path.startsWith("/inventory-links")) return LINKS;
  if (path.startsWith("/admin/ingredient-names")) return NAMES;
  if (path.startsWith("/grocery") || path.startsWith("/planner")) return GROCERY;
  // Only a recipe saved or deleted by its id: reading a link (/recipes/scrape)
  // or a pasted list (/recipes/parse-ingredients) saves nothing and can be slow.
  if ((method === "PUT" || method === "DELETE") && /^\/recipes\/[^/?]+$/.test(path)) return GROCERY;
  return null;
}

// The area a read must wait for, or null: the grocery data itself and the
// upcoming meals the list is built from, and the taught names.
export function readArea(path) {
  if (path.startsWith("/inventory-links")) return LINKS;
  if (path.startsWith("/ingredient-names")) return NAMES;
  return path.startsWith("/grocery") || path.startsWith("/planner/upcoming") ? GROCERY : null;
}

const inFlight = new Map(); // area -> Set of promises that settle when a save ends
const versions = new Map(); // area -> number

const bump = (area) => versions.set(area, (versions.get(area) || 0) + 1);

// Remembers `promise` (a save) until it ends, whether it worked or not. Gives the same promise back.
export function noteSave(area, promise) {
  bump(area);
  const set = inFlight.get(area) || new Set();
  inFlight.set(area, set);
  const ended = promise
    .then(
      () => undefined,
      () => undefined
    )
    .then(() => {
      set.delete(ended);
      bump(area);
    });
  set.add(ended);
  return promise;
}

// Resolves once no save is on its way for this area.
export async function afterSaves(area) {
  const set = inFlight.get(area);
  while (set && set.size > 0) await Promise.all([...set]);
}

export function savesVersion(area) {
  return versions.get(area) || 0;
}
