import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// "This Inventory item is a meal" (a leftover, or a prepared meal the person tagged, like
// a frozen lasagna) is ONE rule: `isMealItem` in client/src/lib/mealItem.js (server/src/
// lib/mealItem.js is its twin), and a meal is never an ingredient. Which Inventory item
// is a recipe ingredient is ONE matcher, client/src/lib/inventoryMatch.js. These tests
// fail if code starts matching Inventory items to ingredients another way, or decides
// "meal or not" with its own copy of the rule. They read the source text, so they only
// know the patterns below: a new way of matching still has to go through the matcher.
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

// The two files that hold the rule itself.
const THE_RULE = ["client/src/lib/mealItem.js", "server/src/lib/mealItem.js"];

// Files where an Inventory item's own `isLeftover` / `isPreparedMeal` is read because
// something is truly leftover-only (portions, fridge life, the Leftovers shelf, no moving
// between shelves) or it is the item's saved data (create, edit, restore, Recently
// removed). Reading it anywhere else to decide "is this an ingredient" is the bug this
// guard exists for: use `isMealItem`. Adding a file here needs a reason.
const MAY_READ_ITEM_FLAGS = {
  "client/src/components/InventoryItemForm.jsx": "the form's Leftovers mode, and the Prepared meal switch's saved value",
  "client/src/components/Inventory.jsx": "the Leftovers shelf, leftovers not dragging between shelves, a leftover's recipe photo",
  "client/src/components/InventoryItems.jsx": "a leftover's dish photo and look, where it is kept",
  "client/src/App.jsx": "leftovers do not move between shelves",
  "client/src/lib/inventoryForm.js": "the saved Prepared meal value the edit patch compares with",
  "server/src/lib/inventoryTakeOut.js": "a prepared meal counted by weight or volume comes off whole",
  "server/src/routes/pantryInventory.js": "leftover keep times, and writing the item's own flags (create, edit, restore)",
};

// Files that may compare recipe ingredient text with `.includes(`: the Recipes search box
// (words the person typed; an Inventory name may be put in the box, but as text).
const MAY_SEARCH_INGREDIENT_TEXT = ["client/src/lib/recipeSearch.js"];

const ITEM_RECEIVERS = "item|it|inv|row|stored|linked|current|existing";
const INVENTORY_ARRAYS = "pantryInventory|inventory|items|shown|usable|leftoverItems|pantry|stock";

// What is wrong with one source file, as short messages. `path` is relative to the repo.
export function violations(path, text) {
  const out = [];
  const isRule = THE_RULE.includes(path);

  // 1. One copy of the rule: "leftover OR prepared meal" is written only in mealItem.js.
  if (!isRule && /isLeftover\s*(?:===\s*true\s*)?\|\|\s*[\w.?]*isPreparedMeal|isPreparedMeal\s*(?:===\s*true\s*)?\|\|\s*[\w.?]*isLeftover/.test(text)) {
    out.push("writes its own 'leftover or prepared meal' check; use isMealItem (lib/mealItem.js)");
  }

  // 2. A list of Inventory items is not narrowed to ingredients by the leftover flag.
  const lists = new RegExp(`\\b(?:${INVENTORY_ARRAYS})\\s*\\.(?:filter|some|every|find)\\(`, "g");
  for (const m of text.matchAll(lists)) {
    const statement = text.slice(m.index, m.index + 300).split(";")[0];
    if (/\.isLeftover\b|\.isPreparedMeal\b/.test(statement)) {
      out.push(`narrows Inventory items by the leftover flag (${m[0]}...); use isMealItem`);
    }
  }

  // 3. An Inventory item's own flags are read only where something is leftover-only.
  if (!isRule && !(path in MAY_READ_ITEM_FLAGS)) {
    const read = new RegExp(`\\b(?:${ITEM_RECEIVERS})\\.(?:isLeftover|isPreparedMeal)\\b`);
    if (read.test(text)) out.push("reads an Inventory item's isLeftover / isPreparedMeal; use isMealItem, or add the file to MAY_READ_ITEM_FLAGS with a reason");
  }

  // 4. No other way of asking "does this Inventory item cover this ingredient".
  if (/\bcoversIngredient\b/.test(text)) out.push("coversIngredient was a second matcher; use lib/inventoryMatch.js");
  if (/\bcore\(\s*(?:item|have|inv|pantry)\w*\.name/.test(text)) out.push("compares an Inventory item with core(); use lib/inventoryMatch.js");
  if (!MAY_SEARCH_INGREDIENT_TEXT.includes(path) && /\.ingredients[^;]{0,220}?\.includes\(/.test(text)) {
    out.push("compares recipe ingredient text with includes(); Inventory is matched only by lib/inventoryMatch.js");
  }

  return out;
}

describe("Inventory items are matched to ingredients only through the one matcher and the one meal rule", () => {
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

  it("the matcher skips meals through the one rule", () => {
    const matcher = readFileSync(join(root, "client/src/lib/inventoryMatch.js"), "utf8");
    expect(matcher).toMatch(/import \{ isMealItem \} from "\.\/mealItem\.js";/);
    expect(matcher).toMatch(/const isUsable = \(item\) => !isMealItem\(item\);/);
  });

  it("the server only eats from a meal item", () => {
    const takeOut = readFileSync(join(root, "server/src/lib/inventoryTakeOut.js"), "utf8");
    expect(takeOut).toMatch(/isMealItem\(item\)/);
  });
});

// The checks above only mean something if they can fail: these are the mistakes they exist for.
describe("the guard catches the mistakes it is for", () => {
  it("a second copy of the rule", () => {
    expect(violations("client/src/lib/x.js", "const meal = item.isLeftover || item.isPreparedMeal;").join()).toContain("own 'leftover or prepared meal' check");
    expect(violations("client/src/lib/x.js", "if (a.isPreparedMeal === true || a.isLeftover === true) return;").join()).toContain("own 'leftover or prepared meal' check");
    expect(violations("client/src/lib/mealItem.js", "return item.isLeftover === true || item.isPreparedMeal === true;")).toEqual([]);
  });

  it("narrowing a list of Inventory items by the leftover flag", () => {
    const old = "const usable = pantryInventory.filter((item) => !item.isLeftover && item.expiresAt);";
    expect(violations("client/src/lib/finder.js", old).length).toBeGreaterThan(0);
    expect(violations("client/src/lib/finder.js", "items.filter((i) => i.isLeftover && i.quantity > 0)").length).toBeGreaterThan(0);
    // Planned meals have a flag of the same name: a different thing.
    expect(violations("client/src/lib/finder.js", "entries.filter((e) => e.recipe?.id === id && !e.isLeftover)")).toEqual([]);
    expect(violations("client/src/lib/finder.js", "pantryInventory.filter((item) => !isMealItem(item))")).toEqual([]);
  });

  it("reading an item's flag in a file that is not leftover-only", () => {
    expect(violations("client/src/components/Somewhere.jsx", "if (item.isLeftover) return null;").length).toBe(1);
    expect(violations("client/src/components/Inventory.jsx", "draggable={!item.isLeftover}")).toEqual([]);
    expect(violations("client/src/components/Somewhere.jsx", "if (entry.isLeftover) return null;")).toEqual([]);
  });

  it("another way of matching Inventory with ingredients", () => {
    expect(violations("client/src/lib/x.js", "export function coversIngredient(a, b) {}").length).toBe(1);
    expect(violations("client/src/lib/x.js", "core(item.name) === core(ing.name)").length).toBe(1);
    const oldPopup = "recipes.filter((r) => r.ingredients?.some((i) => i.name?.toLowerCase().includes(item.name.toLowerCase())))";
    expect(violations("client/src/components/InventoryItemForm.jsx", oldPopup).length).toBe(1);
    expect(violations("client/src/lib/recipeSearch.js", "recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))")).toEqual([]);
  });
});
