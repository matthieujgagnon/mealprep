import { allInventoryLinks, linkKey, setInventoryLinks } from "./inventoryLinks.js";
import { LINKS } from "./pendingSaves.js";
import { saveInOrder } from "./saveInOrder.js";

// Teaching and removing a link (« Je l'ai comme… ») without waiting for the server.
// A change shows at once: the list the matcher reads is changed first, and `onChange`
// tells the app to answer again (App.jsx refreshes its Inventory list, so every page
// that says "have it or not" re-asks the one matcher). The save goes out behind the
// saves already made for the same pair of names (`saveInOrder`), so teach, Undo and
// teach again end as the last tap says whatever order the network answers in; a save
// that fails and is still the newest puts the screen back and says so (`onFailed`).
//
// Nothing here adds to Inventory, so it needs no confirmation sheet (CLAUDE.md).
//
// api       { listInventoryLinks, addInventoryLink(recipeName, itemName), deleteInventoryLink(id) }
// onChange  called after the list the matcher reads has changed
// onFailed  called with "teach" | "remove" when a save failed and the screen went back
export function createLinkSaver({ api, onChange = () => {}, onFailed = () => {} }) {
  const saves = saveInOrder({ area: LINKS });
  const serverIds = new Map(); // pair -> the server's id for it, once it has one

  const pairOf = (link) => `${link.recipeName}\u0001${link.itemName}`;
  const commit = (next) => {
    setInventoryLinks(next);
    onChange();
  };
  const has = (pair) => allInventoryLinks().some((link) => pairOf(link) === pair);

  return {
    // The list the server has, for the start and after a failed load is tried again.
    load(list) {
      serverIds.clear();
      for (const link of list) serverIds.set(pairOf(link), link.id);
      commit(list);
    },

    // Forgets everything (logging out).
    clear() {
      serverIds.clear();
      commit([]);
    },

    // Teaches pairs of [{ recipeName, itemName }] as written (the labels). Returns the
    // links that are new, which is what an Undo takes away again; a pair that was
    // already taught is left alone and is not in the list.
    teach(pairs) {
      const added = [];
      for (const { recipeName, itemName } of pairs) {
        const link = { id: null, recipeName: linkKey(recipeName), itemName: linkKey(itemName), recipeLabel: String(recipeName).trim(), itemLabel: String(itemName).trim() };
        const pair = pairOf(link);
        if (!link.recipeName || !link.itemName || link.recipeName === link.itemName) continue;
        if (has(pair) || added.some((l) => pairOf(l) === pair)) continue;
        link.id = `pending:${pair}`;
        added.push(link);
      }
      if (added.length === 0) return added;
      commit([...allInventoryLinks(), ...added]);
      for (const link of added) {
        const pair = pairOf(link);
        saves
          .run(pair, async () => {
            const saved = await api.addInventoryLink(link.recipeLabel, link.itemLabel);
            serverIds.set(pair, saved.id);
            // Give the link its real id, if it is still there.
            if (has(pair)) commit(allInventoryLinks().map((l) => (pairOf(l) === pair ? { ...l, id: saved.id } : l)));
          })
          .then(({ ok, latest }) => {
            if (ok || !latest) return;
            if (has(pair)) commit(allInventoryLinks().filter((l) => pairOf(l) !== pair));
            onFailed("teach");
          });
      }
      return added;
    },

    // Takes links away (the × on one, or an Undo of a teach).
    remove(links) {
      const gone = links.filter((link) => has(pairOf(link)));
      if (gone.length === 0) return;
      const pairs = new Set(gone.map(pairOf));
      commit(allInventoryLinks().filter((link) => !pairs.has(pairOf(link))));
      for (const link of gone) {
        const pair = pairOf(link);
        saves
          .run(pair, async () => {
            const id = serverIds.get(pair);
            if (!id) return; // it never reached the server
            await api.deleteInventoryLink(id);
            serverIds.delete(pair);
          })
          .then(({ ok, latest }) => {
            if (ok || !latest) return;
            if (!has(pair)) commit([...allInventoryLinks(), link]);
            onFailed("remove");
          });
      }
    },
  };
}
