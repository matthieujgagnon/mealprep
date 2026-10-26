import { getIngredientOverrides, setIngredientOverrides } from "./ingredientDisplay.js";
import { NAMES } from "./pendingSaves.js";
import { saveInOrder } from "./saveInOrder.js";

// Saving Matt's changes to the ingredient names (lib/ingredientDisplay.js reads them) without
// waiting for the server, the way lib/linkSaves.js does for taught names. A change shows at
// once: the list the display helper reads is changed first, so every screen that draws a name
// follows. The save goes out behind the saves already made for the same row (`saveInOrder`), so
// save, Undo and save again end as the last tap says whatever order the network answers in; a
// save that fails and is still the newest puts the row back as the server has it and says so
// (`onFailed`).
//
// A row is told apart by its `ref`: "built:<key>" for a change to a built-in row (that key is
// the row's own, so a second tap changes the same row) and "added:<id or a counter>" for an
// ingredient Matt added. A row is
//   { ref, id, replaces, hidden, enOne, enOther, frOne, frOther, gender, updatedAt, updatedBy }
// with `id` the server's once it has one. Every function that changes something gives back what
// was there before (`before`, null for nothing), which is what an Undo restores.
//
// api   { saveIngredientName(body), changeIngredientName(id, body), deleteIngredientName(id) }
// onFailed  called with "save" | "remove" and the error when a save failed and the screen went back
// onChange  called after the list the display and the Inventory matcher read has changed (not for a
//           list that was empty and still is), so the app asks the matcher again, as it does after a
//           taught name (lib/linkSaves.js)
export function createNameSaver({ api, onFailed = () => {}, onChange = () => {} }) {
  const saves = saveInOrder({ area: NAMES });
  const wanted = new Map(); // ref -> the row as it should be now (the screen)
  const confirmed = new Map(); // ref -> the row as the server has it
  const ids = new Map(); // ref -> the server's id
  let counter = 0;

  const refOf = (row) => (row.replaces ? `built:${row.replaces}` : `added:${row.id}`);
  const bodyOf = (row) => ({
    replaces: row.replaces || undefined,
    hidden: Boolean(row.hidden),
    enOne: row.enOne,
    enOther: row.enOther,
    frOne: row.frOne,
    frOther: row.frOther,
    gender: row.gender,
  });
  const same = (a, b) => JSON.stringify(a ? bodyOf(a) : null) === JSON.stringify(b ? bodyOf(b) : null);
  const publish = () => {
    const had = getIngredientOverrides().length;
    const next = [...wanted.values()].map((row) => ({ ...row, id: ids.get(row.ref) || row.id }));
    setIngredientOverrides(next);
    if (had > 0 || next.length > 0) onChange();
  };

  // The ref a draft is saved under: its built-in row's, else the one given (changing an added
  // ingredient), else a new one.
  const refFor = (draft, ref) => (draft.replaces ? `built:${draft.replaces}` : ref || `added:new${++counter}`);

  function put(ref, row) {
    const before = wanted.get(ref) || null;
    if (row) wanted.set(ref, { ...row, ref });
    else wanted.delete(ref);
    publish();
    return before;
  }

  async function sync(ref) {
    const row = wanted.get(ref) || null;
    const was = confirmed.get(ref) || null;
    if (same(row, was)) return;
    if (!row) {
      if (ids.get(ref)) await api.deleteIngredientName(ids.get(ref));
      ids.delete(ref);
      confirmed.delete(ref);
      return;
    }
    const saved = ids.get(ref) ? await api.changeIngredientName(ids.get(ref), bodyOf(row)) : await api.saveIngredientName(bodyOf(row));
    ids.set(ref, saved.id);
    const kept = { ...row, id: saved.id, ref, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy ?? row.updatedBy };
    confirmed.set(ref, kept);
    // Give the row the server's id and time, if it is still the one on screen.
    if (wanted.get(ref) === row || same(wanted.get(ref), row)) {
      wanted.set(ref, kept);
      publish();
    }
  }

  function queue(ref, kind) {
    saves.run(ref, () => sync(ref)).then(({ ok, latest, error }) => {
      if (ok || !latest) return;
      const back = confirmed.get(ref);
      if (back) wanted.set(ref, back);
      else wanted.delete(ref);
      publish();
      onFailed(kind, error);
    });
  }

  const saver = {
    // The list the server has, for the start (and after a load is tried again).
    load(list) {
      wanted.clear();
      confirmed.clear();
      ids.clear();
      for (const row of Array.isArray(list) ? list : []) {
        const ref = refOf(row);
        const kept = { ...row, ref };
        wanted.set(ref, kept);
        confirmed.set(ref, kept);
        ids.set(ref, row.id);
      }
      publish();
    },

    // Forgets everything (logging out): back to the built-in names until the next load.
    clear() {
      wanted.clear();
      confirmed.clear();
      ids.clear();
      publish();
    },

    // The row now kept for this ref, or null.
    get: (ref) => wanted.get(ref) || null,

    refFor,

    // Saves a draft { replaces?, hidden?, enOne, enOther, frOne, frOther, gender } (already
    // checked); `givenRef` is the row being changed when it is an ingredient Matt added. Returns
    // { ref, before }; an Undo calls `restore(ref, before)`.
    save(draft, givenRef) {
      const ref = refFor(draft, givenRef);
      const before = put(ref, { ...draft, hidden: Boolean(draft.hidden), replaces: draft.replaces || null, id: ids.get(ref) || `pending:${ref}`, updatedBy: wanted.get(ref)?.updatedBy ?? null });
      queue(ref, "save");
      return { ref, before };
    },

    // Takes a row away: a built-in row it replaced or hid is back, an ingredient that was added
    // is gone. Returns what was there.
    remove(ref) {
      if (!wanted.has(ref)) return null;
      const before = put(ref, null);
      queue(ref, "remove");
      return before;
    },

    // Puts a ref back the way `before` was (an Undo of save or remove).
    restore(ref, before) {
      if (!before) return saver.remove(ref);
      put(ref, before);
      queue(ref, "save");
      return before;
    },
  };
  return saver;
}
