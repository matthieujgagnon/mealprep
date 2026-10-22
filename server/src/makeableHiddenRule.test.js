import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// « Masquer de Faisable » is Matt's own choice for ONE recipe (`Recipe.hiddenFromMakeable`). Whether a
// recipe is hidden is read in ONE place, `isHiddenFromMakeable` in client/src/lib/mealSlots.js, and
// every Makeable decision goes through `isMakeableMeal` (which asks it) or, in the finder, through
// `isHiddenFromMakeable` itself. Nothing else reads the column off a recipe, so Home, Recipes,
// Makeable and the finder cannot disagree about which recipes are hidden. These tests read the
// source text, so they only know the patterns below.
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

// The only files that mention the column's name, and why.
const MAY_MENTION_COLUMN = {
  "client/src/lib/mealSlots.js": "isHiddenFromMakeable is the one reader",
  "client/src/components/RecipeEditor.jsx": "the form's own state and what it saves; its start value comes from isHiddenFromMakeable",
  "client/src/App.jsx": "sends the choice when the card's menu or Makeable's Show again changes it",
  "server/src/lib/mealTypes.js": "readHiddenFromMakeable checks a request's yes or no",
  "server/src/routes/recipes.js": "writes the column for POST and PUT /api/recipes",
};

// What is wrong with one source file.
export function violations(path, text) {
  const out = [];
  if (!(path in MAY_MENTION_COLUMN) && /\bhiddenFromMakeable\b/.test(text)) {
    out.push("reads hiddenFromMakeable itself; ask isHiddenFromMakeable (client/src/lib/mealSlots.js) or isMakeableMeal");
  }
  return out;
}

describe("a recipe hidden from Makeable is read in one place", () => {
  it("no client or server code reads the column outside the places meant to", () => {
    const found = [];
    for (const dir of ["client/src", "server/src"]) {
      for (const path of files(join(root, dir))) {
        const rel = relative(root, path);
        for (const message of violations(rel, readFileSync(path, "utf8"))) found.push(`${rel}: ${message}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the places that may mention the column are the ones that are meant to", () => {
    for (const path of Object.keys(MAY_MENTION_COLUMN)) expect(readFileSync(join(root, path), "utf8")).toMatch(/\bhiddenFromMakeable\b/);
  });

  it("the Makeable rule and the finder both ask the one reader", () => {
    const rule = readFileSync(join(root, "client/src/lib/mealSlots.js"), "utf8");
    expect(rule).toMatch(/export function isMakeableMeal[\s\S]*?!isHiddenFromMakeable\(recipe\)/);
    // The finder skips the kind rule when it is off, so it must ask for the hiding itself.
    expect(readFileSync(join(root, "client/src/lib/finder.js"), "utf8")).toMatch(/isHiddenFromMakeable\(x\.recipe\)/);
  });

  it("hiding is not a meal type: the Meals rule does not read it", () => {
    const rule = readFileSync(join(root, "client/src/lib/mealSlots.js"), "utf8");
    const meals = rule.match(/export function isMealRecipe[\s\S]*?\n}/)[0];
    expect(meals).not.toMatch(/idden/);
  });
});

// The checks above only mean something if they can fail: these are the mistakes they exist for.
describe("the guard catches the mistakes it is for", () => {
  it("a page reading the column off a recipe", () => {
    expect(violations("client/src/components/Home.jsx", "const ready = recipes.filter((r) => !r.hiddenFromMakeable);").length).toBe(1);
    expect(violations("client/src/lib/homeWeek.js", "if (recipe.hiddenFromMakeable) return false;").length).toBe(1);
  });
  it("the one reader and the places that save it are fine", () => {
    expect(violations("client/src/lib/mealSlots.js", "return recipe?.hiddenFromMakeable === true;")).toEqual([]);
    expect(violations("server/src/routes/recipes.js", "const hidden = readHiddenFromMakeable(req.body.hiddenFromMakeable);")).toEqual([]);
    expect(violations("client/src/components/Home.jsx", "const hidden = isHiddenFromMakeable(recipe);")).toEqual([]);
  });
});
