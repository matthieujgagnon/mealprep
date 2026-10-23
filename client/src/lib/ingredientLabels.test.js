import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/index.js";
import { buildGroceryList } from "./groceryList.js";
import { recipeReceipt } from "./recipeCard.js";
import { buildPrep } from "./cookPrep.js";

// The names a screen DRAWS are in the language shown (lib/ingredientDisplay.js); what the
// screens READ stays the recipe's own words. These check the two sides of that on the
// pieces the screens are built from.

afterEach(() => setLang("en"));

const recipe = () => ({
  id: "r1",
  title: "Poulet à l'ail",
  baseServings: 4,
  instructions: [],
  ingredients: [
    { id: "i1", name: "red onions", quantity: 2, unit: null, notes: "finely chopped", group: null },
    { id: "i2", name: "garlic cloves", quantity: 4, unit: null, notes: null, group: null },
    { id: "i3", name: "boneless skinless chicken thighs", quantity: 800, unit: "g", notes: null, group: null },
    { id: "i4", name: "Biryani masala", quantity: 1, unit: "tbsp", notes: "toasted", group: null },
  ],
});
const entry = (r) => ({ recipe: r, servings: 4 });

describe("the grocery list's rows", () => {
  it("are shown in French, with the recipe's own name kept for everything that looks things up", () => {
    setLang("fr");
    const items = buildGroceryList([entry(recipe())]);
    const byName = (name) => items.find((i) => i.name.toLowerCase() === name);
    expect(byName("red onions").label).toBe("Oignons rouges");
    expect(byName("garlic cloves").label).toBe("Gousses d'ail");
    expect(byName("biryani masala").label).toBe("Biryani masala"); // not in the table: as written
    expect(items.every((i) => i.name === i.name.trim() && i.name.length > 0)).toBe(true);
  });

  it("are shown in English as before", () => {
    const items = buildGroceryList([entry(recipe())]);
    expect(items.map((i) => i.label)).toEqual(items.map((i) => i.name));
  });

  it("read a French recipe in English without the English singular rules mangling the French words", () => {
    const labels = buildGroceryList([
      entry({
        id: "r2",
        title: "Poulet",
        baseServings: 4,
        instructions: [],
        ingredients: [
          { name: "gousses d'ail", quantity: 4 },
          { name: "hauts de cuisse de poulet désossés sans peau", quantity: 800, unit: "g" },
          { name: "pâte de piment fort", quantity: 1 },
        ],
      }),
    ]).map((i) => i.label);
    expect(labels).toContain("Garlic cloves");
    expect(labels).toContain("Boneless skinless chicken thighs");
  });

  it("show a row typed by hand exactly as typed, in either language", () => {
    for (const lang of ["fr", "en"]) {
      setLang(lang);
      const items = buildGroceryList([], [{ id: "x1", name: "Red onions", quantity: 1, unit: null }, { id: "x2", name: "garlic", quantity: null, unit: null }]);
      expect(items.map((i) => i.label).sort()).toEqual(["Red onions", "garlic"]);
    }
  });

  it("are in A to Z order of the words shown", () => {
    setLang("fr");
    const labels = buildGroceryList([entry(recipe())]).map((i) => i.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("leave the recipe as it was", () => {
    setLang("fr");
    const r = recipe();
    buildGroceryList([entry(r)]);
    expect(r).toEqual(recipe());
  });
});

describe("a recipe's lines", () => {
  it("keep the recipe's own name and notes, whatever language is shown", () => {
    const rows = (lang) => {
      setLang(lang);
      return recipeReceipt(recipe(), { inventory: [] }, 4).buy.map((row) => [row.name, row.notes, row.names]);
    };
    expect(rows("fr")).toEqual(rows("en"));
    expect(rows("fr").flatMap(([, notes]) => notes)).toContain("finely chopped");
  });
});

describe("Cook mode's prep page", () => {
  it("groups a recipe's notes by what they ask for in the recipe's own words, in either language", () => {
    const groups = (lang) => {
      setLang(lang);
      return buildPrep(recipe().ingredients, []).groups.map((g) => [g.id, g.rows.map((r) => r.ingredient.name)]);
    };
    expect(groups("fr")).toEqual(groups("en"));
  });
});
