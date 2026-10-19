import { afterEach, describe, expect, it } from "vitest";
import { afterSaves, LINKS } from "./pendingSaves.js";
import { allInventoryLinks, linkKey, setInventoryLinks } from "./inventoryLinks.js";
import { ingredientHave } from "./inventoryMatch.js";
import { createLinkSaver } from "./linkSaves.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
afterEach(() => setInventoryLinks([]));

// A pretend server: each call lands after its own delay, and what it keeps is what
// the last call to land left. `delays` are taken one by one, per call.
function server({ delays = [], failures = [] } = {}) {
  const rows = new Map(); // pair -> id
  const calls = [];
  let n = 0;
  const take = (list) => (list.length ? list.shift() : 0);
  return {
    rows,
    calls,
    api: {
      addInventoryLink: async (recipe, item) => {
        calls.push(`add ${recipe} <- ${item}`);
        await wait(take(delays));
        if (take(failures)) throw new Error("no");
        const pair = `${linkKey(recipe)}<-${linkKey(item)}`;
        if (!rows.has(pair)) rows.set(pair, `id${++n}`);
        return { id: rows.get(pair), recipeName: linkKey(recipe), itemName: linkKey(item), recipeLabel: recipe, itemLabel: item };
      },
      deleteInventoryLink: async (id) => {
        calls.push(`delete ${id}`);
        await wait(take(delays));
        if (take(failures)) throw new Error("no");
        for (const [pair, rowId] of rows) if (rowId === id) rows.delete(pair);
      },
    },
  };
}

const pair = { recipeName: "Rice vinegar", itemName: "Mirin" };

describe("teaching and removing a link", () => {
  it("shows at once, before the save lands, and tells the app to answer again", async () => {
    const db = server({ delays: [20] });
    let changes = 0;
    const saver = createLinkSaver({ api: db.api, onChange: () => changes++ });
    const added = saver.teach([{ recipeName: "Rice  Vinegar", itemName: "Rice wine vinegar" }]);
    expect(added).toHaveLength(1);
    expect(changes).toBe(1);
    expect(allInventoryLinks()).toHaveLength(1);
    expect(allInventoryLinks()[0]).toMatchObject({ recipeName: "rice vinegar", itemName: "rice wine vinegar", recipeLabel: "Rice  Vinegar".trim(), itemLabel: "Rice wine vinegar" });
    expect(db.rows.size).toBe(0);

    await afterSaves(LINKS);
    expect(db.rows.size).toBe(1);
    // The real id replaced the stand-in.
    expect(allInventoryLinks()[0].id).toBe("id1");
  });

  it("counts a taught name straight away, with no Inventory change", async () => {
    const db = server({ delays: [10] });
    const saver = createLinkSaver({ api: db.api });
    const k = { inventory: [{ name: "Mirin" }] };
    expect(ingredientHave("rice vinegar", k)).toBe("need");
    saver.teach([pair]);
    expect(ingredientHave("rice vinegar", k)).toBe("have");
    saver.remove(allInventoryLinks());
    expect(ingredientHave("rice vinegar", k)).toBe("need");
    await afterSaves(LINKS);
  });

  it("teach, Undo, teach ends with one link, even when the first save is the slowest", async () => {
    const db = server({ delays: [40, 5, 1] });
    const saver = createLinkSaver({ api: db.api });
    const first = saver.teach([pair]);
    saver.remove(first);
    expect(allInventoryLinks()).toEqual([]);
    saver.teach([pair]);
    expect(allInventoryLinks()).toHaveLength(1);
    await afterSaves(LINKS);
    expect([...db.rows.keys()]).toEqual(["rice vinegar<-mirin"]);
    expect(allInventoryLinks()).toHaveLength(1);
    expect(allInventoryLinks()[0].id).toBe([...db.rows.values()][0]);
    // In the order the taps were made.
    expect(db.calls[0]).toMatch(/^add /);
    expect(db.calls[1]).toMatch(/^delete /);
    expect(db.calls[2]).toMatch(/^add /);
  });

  it("an Undo made before the teach has landed leaves nothing on the server", async () => {
    const db = server({ delays: [30, 1] });
    const saver = createLinkSaver({ api: db.api });
    saver.remove(saver.teach([pair]));
    await afterSaves(LINKS);
    expect(db.rows.size).toBe(0);
    expect(allInventoryLinks()).toEqual([]);
  });

  it("saying a taught pair again sends nothing and has nothing to Undo", async () => {
    const db = server();
    const saver = createLinkSaver({ api: db.api });
    saver.teach([pair]);
    await afterSaves(LINKS);
    const calls = db.calls.length;
    expect(saver.teach([{ recipeName: "RICE VINEGAR", itemName: "mirin" }])).toEqual([]);
    await afterSaves(LINKS);
    expect(db.calls).toHaveLength(calls);
    expect(allInventoryLinks()).toHaveLength(1);
  });

  it("teaches a link for each name of a Grocery row, and one Undo takes them all away", async () => {
    const db = server();
    const saver = createLinkSaver({ api: db.api });
    const added = saver.teach([
      { recipeName: "Garlic", itemName: "Ail" },
      { recipeName: "Garlic cloves", itemName: "Ail" },
      { recipeName: "garlic", itemName: "ail" },
    ]);
    expect(added.map((l) => l.recipeLabel)).toEqual(["Garlic", "Garlic cloves"]);
    await afterSaves(LINKS);
    expect(db.rows.size).toBe(2);
    saver.remove(added);
    await afterSaves(LINKS);
    expect(db.rows.size).toBe(0);
    expect(allInventoryLinks()).toEqual([]);
  });

  it("refuses an empty name and two names that are the same, without a save", async () => {
    const db = server();
    const saver = createLinkSaver({ api: db.api });
    expect(saver.teach([{ recipeName: "", itemName: "Mirin" }, { recipeName: "Mirin", itemName: "mirin" }, { recipeName: "Crème", itemName: "creme" }])).toEqual([]);
    await afterSaves(LINKS);
    expect(db.calls).toEqual([]);
  });

  it("puts the screen back and says so when the newest teach fails", async () => {
    const db = server({ failures: [true] });
    const failed = [];
    const saver = createLinkSaver({ api: db.api, onFailed: (what) => failed.push(what) });
    saver.teach([pair]);
    await afterSaves(LINKS);
    await wait(0);
    expect(allInventoryLinks()).toEqual([]);
    expect(failed).toEqual(["teach"]);
  });

  it("puts a link back when its remove fails", async () => {
    const db = server({ failures: [false, true] });
    const failed = [];
    const saver = createLinkSaver({ api: db.api, onFailed: (what) => failed.push(what) });
    saver.teach([pair]);
    await afterSaves(LINKS);
    saver.remove(allInventoryLinks());
    expect(allInventoryLinks()).toEqual([]);
    await afterSaves(LINKS);
    await wait(0);
    expect(allInventoryLinks()).toHaveLength(1);
    expect(failed).toEqual(["remove"]);
  });

  it("an older save that fails does not undo a newer tap", async () => {
    // teach (fails, slow), Undo, teach: only the last decides; the first failing is not the newest.
    const db = server({ delays: [30, 1, 1], failures: [true, false, false] });
    const failed = [];
    const saver = createLinkSaver({ api: db.api, onFailed: (what) => failed.push(what) });
    saver.remove(saver.teach([pair]));
    saver.teach([pair]);
    await afterSaves(LINKS);
    await wait(0);
    expect(failed).toEqual([]);
    expect(allInventoryLinks()).toHaveLength(1);
    expect(db.rows.size).toBe(1);
  });

  it("loads the list the server has, and clears it on logout", () => {
    const db = server();
    let changes = 0;
    const saver = createLinkSaver({ api: db.api, onChange: () => changes++ });
    saver.load([{ id: "a", recipeName: "red onion", itemName: "yellow onion", recipeLabel: "Red onion", itemLabel: "Yellow onion" }]);
    expect(ingredientHave("red onion", kitchenOf("Yellow onion"))).toBe("have");
    saver.clear();
    expect(allInventoryLinks()).toEqual([]);
    expect(changes).toBe(2);
  });
});

const kitchenOf = (name) => ({ inventory: [{ name }] });
