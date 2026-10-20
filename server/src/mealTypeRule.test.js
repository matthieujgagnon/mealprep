import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// What meal types a recipe has is ONE reader, `recipeSlots` in client/src/lib/mealSlots.js (the
// list, `Recipe.mealSlots`), and "Meals" is ONE rule (`isMealRecipe`: breakfast, lunch or supper
// among its types, and not « plat préparé »). The old single column `Recipe.mealSlot` stays in the
// database (nothing was dropped) and the server writes the first type there, but nothing reads it
// as the recipe's type. These tests read the source text, so they only know the patterns below.
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SELF = relative(root, fileURLToPath(import.meta.url));

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(js|jsx|mjs)$/.test(path) && !/\.test\.(js|jsx|mjs)$/.test(path) && relative(root, path) !== SELF) out.push(path);
  }
  return out;
}

// The only files that mention the old single column, and why.
const MAY_MENTION_OLD_COLUMN = {
  "client/src/lib/mealSlots.js": "recipeSlots reads it when a recipe from before the list has no list",
  "server/src/lib/mealTypes.js": "readMealTypes still takes the old single `mealSlot` from a request",
  "server/src/routes/recipes.js": "writes the first type there so nothing that read it breaks",
};

// What is wrong with one source file.
export function violations(path, text) {
  const out = [];
  // A read of the old single column: `recipe.mealSlot`, `r.mealSlot`, `{ mealSlot }`...
  if (!(path in MAY_MENTION_OLD_COLUMN) && /\bmealSlot\b/.test(text)) {
    out.push("mentions the old single mealSlot; read the types with recipeSlots (client/src/lib/mealSlots.js)");
  }
  // Two copies of "Meals": breakfast, lunch and dinner listed to decide it, outside the one rule.
  if (path !== "client/src/lib/mealSlots.js" && /\[\s*"breakfast"\s*,\s*"lunch"\s*,\s*"dinner"\s*\]\s*\.includes\(/.test(text)) {
    out.push("decides 'is a meal' with its own list of breakfast, lunch and dinner; use isMealRecipe / isMakeableMeal (lib/mealSlots.js)");
  }
  return out;
}

describe("a recipe's meal types are read in one place", () => {
  it("no client or server code reads the old single column or writes its own 'Meals' rule", () => {
    const found = [];
    for (const dir of ["client/src", "server/src"]) {
      for (const path of files(join(root, dir))) {
        const rel = relative(root, path);
        for (const message of violations(rel, readFileSync(path, "utf8"))) found.push(`${rel}: ${message}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the places that may mention the old column are the three that are meant to", () => {
    for (const path of Object.keys(MAY_MENTION_OLD_COLUMN)) expect(readFileSync(join(root, path), "utf8")).toMatch(/\bmealSlot\b/);
  });

  it("the client reads the list first, and the server keeps the old column as the first type", () => {
    expect(readFileSync(join(root, "client/src/lib/mealSlots.js"), "utf8")).toMatch(/Array\.isArray\(recipe\?\.mealSlots\)/);
    expect(readFileSync(join(root, "server/src/routes/recipes.js"), "utf8")).toMatch(/mealSlots: types\.value, mealSlot: types\.value\[0\]/);
  });
});

// The checks above only mean something if they can fail: these are the mistakes they exist for.
describe("the guard catches the mistakes it is for", () => {
  it("reading the old single column", () => {
    expect(violations("client/src/components/Somewhere.jsx", "const slot = recipe.mealSlot;").length).toBe(1);
    expect(violations("client/src/lib/mealSlots.js", "if (recipe?.mealSlot) return [recipe.mealSlot];")).toEqual([]);
    expect(violations("client/src/components/Somewhere.jsx", "const slots = recipeSlots(recipe);")).toEqual([]);
  });
  it("a second copy of Meals", () => {
    expect(violations("client/src/lib/x.js", 'if (["breakfast", "lunch", "dinner"].includes(slot)) return true;').length).toBe(1);
    expect(violations("client/src/lib/mealSlots.js", 'const x = ["breakfast", "lunch", "dinner"].includes(id);')).toEqual([]);
  });
});
