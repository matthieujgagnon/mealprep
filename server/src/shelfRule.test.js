import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// WHERE an Inventory item is KEPT (`item.location`: fridge, freezer, pantry, the one the USDA
// use-by estimate reads) and WHICH SHELF it shows on (`item.shelf`) are two fields, and which
// shelf an item is on is ONE rule: `shelfOf` in client/src/lib/shelves.js. These tests fail if
// code starts reading `item.location` to pick a shelf (that is how an item moved to a shelf of
// its own used to forget it was in the freezer), or compares an item's `location` with a shelf.
// They read the source text, so they only know the patterns below. Adding a file here needs a
// reason: what it reads `location` for must be where the item is KEPT.
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SELF = relative(root, fileURLToPath(import.meta.url));

function files(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

const isCode = (path) => /\.(js|jsx|mjs)$/.test(path) && !/\.test\.(js|jsx|mjs)$/.test(path) && relative(root, path) !== SELF;

// The files that read an item's own `location`, and what for (where it is KEPT, never the shelf).
const MAY_READ_STORAGE = {
  "client/src/lib/shelves.js": "the rule itself: storageOf, defaultShelfOf",
  "server/src/lib/shelves.js": "the server's side of the same: the placement a request or a snapshot says",
  "client/src/components/InventoryItemForm.jsx": "the Stored in choice (Fridge, Freezer, Pantry), its USDA ranges and the freeze / thaw buttons",
  "client/src/components/Inventory.jsx": "the bulk Freeze button: it says the items are KEPT in the freezer",
  "client/src/components/InventoryConfirm.jsx": "a confirmation-sheet row's storage (where it will be kept), next to its shelf",
  "client/src/lib/inventoryForm.js": "the edit patch compares where it is kept with what was saved",
  "server/src/routes/pantryInventory.js": "the use-by estimate and shelf life read where it is KEPT; the storage list sets it",
  "server/src/lib/recentItems.js": "the Add form's Recent chips remember where each food was last kept",
};

// What is wrong with one source file, as short messages. `path` is relative to the repo.
export function violations(path, text) {
  const out = [];
  // 1. An item's own `location` is read only where it means where it is KEPT.
  if (!(path in MAY_READ_STORAGE) && /\b(?:item|it|inv|row|stored|i|current|existing|linked)\??\.location\b/.test(text)) {
    out.push("reads an Inventory item's location; which shelf it is on is shelfOf (lib/shelves.js), where it is kept is storageOf, or add the file to MAY_READ_STORAGE with a reason");
  }
  // 2. Nobody compares an item's location with a shelf or section, in either order.
  if (!(path in MAY_READ_STORAGE) || path.endsWith("InventoryItemForm.jsx") === false) {
    if (/\.location\s*[!=]==?\s*(?:section|sec|shelf|loc|target|newLocation)\b/.test(text)) out.push("compares an item's location with a shelf; use shelfOf / onShelf (lib/shelves.js)");
  }
  // 3. Nothing writes a shelf's id into `location`.
  if (/\blocation:\s*(?:section|sec|shelf|loc)\w*\.id\b/.test(text)) out.push("puts a shelf's id in `location`; a shelf goes in `shelf` (lib/shelves.js)");
  return out;
}

describe("which shelf an item is on is one rule, and it is not where the item is kept", () => {
  it("no client or server code breaks it", () => {
    const found = [];
    for (const dir of ["client/src", "server/src"]) {
      for (const path of files(join(root, dir), isCode)) {
        const rel = relative(root, path);
        for (const message of violations(rel, readFileSync(path, "utf8"))) found.push(`${rel}: ${message}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the shelves on Inventory, Cook with and the finished view are placed by shelfOf", () => {
    expect(readFileSync(join(root, "client/src/components/Inventory.jsx"), "utf8")).toMatch(/onShelf\(i, loc\.id, shelfIds\)/);
    expect(readFileSync(join(root, "client/src/lib/finder.js"), "utf8")).toMatch(/onShelf\(item, section\.id, shelfIds\)/);
    expect(readFileSync(join(root, "client/src/lib/cookedView.js"), "utf8")).toMatch(/shelfOf\(row\.item\)/);
  });

  it("a drop on a shelf is decided by placeOnShelf, not by writing the shelf's id into location", () => {
    const app = readFileSync(join(root, "client/src/App.jsx"), "utf8");
    expect(app).toMatch(/placeOnShelf\(item, target,/);
    expect(app).not.toMatch(/\{ location: newLocation/);
  });
});

// The checks above only mean something if they can fail: these are the mistakes they exist for.
describe("the guard catches the mistakes it is for", () => {
  it("a shelf read from location", () => {
    expect(violations("client/src/lib/finder.js", ".filter((item) => item.location === section.id)").length).toBeGreaterThan(0);
    expect(violations("client/src/components/Somewhere.jsx", "const shelf = item.location;").length).toBe(1);
    expect(violations("client/src/lib/shelves.js", "return isStorage(item?.location) ? item.location : null;")).toEqual([]);
    expect(violations("client/src/components/Somewhere.jsx", "const here = window.location.pathname;")).toEqual([]);
  });

  it("a shelf's id written into location", () => {
    expect(violations("client/src/App.jsx", "const payload = { location: section.id };").length).toBe(1);
    expect(violations("client/src/App.jsx", "const payload = { shelf: section.id };")).toEqual([]);
  });
});
