import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Examples are removed by their mark (`isExample`, lib/examples.js), and the mark has to come off,
// in the same save, when the PERSON does something to a recipe, a planned meal or an Inventory
// item. If a route that saves one of those forgot, « Retirer les exemples » would delete
// something the person changed. So every place in the server that writes those three tables is
// listed here, with what it does to the mark; a new write anywhere else fails this test until it
// is added here with its reason (and, if it is the person's, lifts the mark). They read the source
// text, so they only know the patterns below.
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SELF = relative(root, fileURLToPath(import.meta.url));
// The module that makes, removes, puts back and lifts the mark is not a "writer to check": it is the rule.
const THE_RULE = "server/src/lib/examples.js";

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.js$/.test(path) && !/\.test\.js$/.test(path) && relative(root, path) !== SELF && relative(root, path) !== THE_RULE) out.push(path);
  }
  return out;
}

const WRITE = /\b(recipe|plannerEntry|pantryInventoryItem)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;

// file -> table -> how many writes, and what they do to the mark.
export const WRITES = {
  "server/src/lib/placeholders.js": { recipe: [1, "creates the Restaurant / YOLO / N/A cards: new rows, never marked"] },
  "server/src/routes/auth.js": {
    recipe: [1, "the very first account claims rows from before accounts existed: none is an example"],
    plannerEntry: [1, "same"],
  },
  "server/src/routes/recipes.js": {
    recipe: [5, "import and new recipe create unmarked rows; PUT /:id LIFTS the mark (isExample: false); PUT /reorder is not an edit and leaves it; delete removes the row"],
  },
  "server/src/routes/planner.js": {
    plannerEntry: [6, "POST and copy-week make the person's own unmarked meals; PUT /:id LIFTS the mark; the note route repoints a placeholder card (never an example); delete removes the row"],
    recipe: [2, "the placeholder card for a note is a new unmarked row; PUT /:id with cookedAt LIFTS the mark of the recipe (cooked); POST and copy-week lift it through liftMark (planned again)"],
  },
  "server/src/routes/pantryInventory.js": {
    pantryInventoryItem: [9, "POST makes an unmarked item; PUT /:id and /storage LIFT the mark; take-out LIFTS it when how is cooked (the person) and keeps it for the app's own settle; put-back restores a row as it was; deletes remove the row"],
    plannerEntry: [3, "copying a changed photo to meals that eat an item, and the two settle steps, are the app's own: they keep the mark"],
  },
  "server/src/routes/pantryLocations.js": {
    pantryInventoryItem: [2, "deleting one of the person's own sections moves the items in it: only items the person already moved there (an edit, so already theirs)"],
  },
};

export function writesIn(text) {
  const counts = {};
  for (const m of text.matchAll(WRITE)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  return counts;
}

describe("the example mark comes off when the person changes an example", () => {
  it("every server write to recipes, planned meals and Inventory items is listed with what it does to the mark", () => {
    const found = {};
    for (const path of files(join(root, "server/src"))) {
      const counts = writesIn(readFileSync(path, "utf8"));
      if (Object.keys(counts).length > 0) found[relative(root, path)] = counts;
    }
    const expected = Object.fromEntries(
      Object.entries(WRITES).map(([file, tables]) => [file, Object.fromEntries(Object.entries(tables).map(([table, [count]]) => [table, count]))])
    );
    expect(found).toEqual(expected);
  });

  it("the routes that save the person's changes take the mark off", () => {
    const read = (path) => readFileSync(join(root, path), "utf8");
    expect(read("server/src/routes/recipes.js")).toMatch(/isExample: false/);
    const planner = read("server/src/routes/planner.js");
    expect(planner).toMatch(/isExample: false/); // PUT /:id
    expect(planner.match(/liftMark\(/g)?.length).toBe(2); // POST and copy-week
    expect(planner).toMatch(/plannerEntries: \{ some: \{ id: req\.params\.id \} \}/); // cooked: the recipe too
    const pantry = read("server/src/routes/pantryInventory.js");
    expect(pantry.match(/isExample: false/g)?.length).toBe(4); // PUT /:id, take-out when cooked, /storage, Recent chips skip examples
  });
});
