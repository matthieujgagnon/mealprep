// A planned meal (an "entry") arrives from the server with a copy of its recipe joined
// in, and that copy is only as new as the read that brought it. The recipe itself lives
// in the recipe store (lib/recipeStore.js). `liveEntries` is how every page reads its
// meals: each one shows the store's recipe, and the meals of a recipe that was just
// deleted (its Undo is still showing) are left out. A recipe saved, deleted or put back
// then shows the same on every page, with no page asked to refresh.
//
// The entry's own copy stays as the fallback for a recipe the store has not got, such as
// a note's placeholder made after the list loaded.

const made = new WeakMap(); // entry -> { recipe, out }: the live version last made of it

// The id of the recipe the entry shows (the copy's, else the entry's own).
const recipeIdOf = (entry) => entry.recipe?.id ?? entry.recipeId;

function liveEntry(entry, byId) {
  const fresh = byId.get(recipeIdOf(entry));
  if (!fresh || fresh === entry.recipe) return entry;
  const seen = made.get(entry);
  if (seen && seen.recipe === fresh) return seen.out;
  const out = { ...entry, recipe: fresh };
  made.set(entry, { recipe: fresh, out });
  return out;
}

// `byId` is the store's visible recipes by id; `hidden` the ids deleted a moment ago (or
// for good). Meals that need no change keep their identity, and the array itself is
// given back when nothing changed, so what depends on it does not run again.
export function liveEntries(entries, byId, hidden) {
  if (!Array.isArray(entries)) return entries;
  let changed = false;
  const out = [];
  for (const entry of entries) {
    if (hidden.has(entry.recipe?.id) || hidden.has(entry.recipeId)) {
      changed = true;
      continue;
    }
    const live = liveEntry(entry, byId);
    if (live !== entry) changed = true;
    out.push(live);
  }
  return changed ? out : entries;
}
