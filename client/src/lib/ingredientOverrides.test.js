import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n/index.js";
import {
  conflicts,
  effectiveIngredientRows,
  getIngredientOverrides,
  ingredientName,
  ingredientNote,
  ingredientOverridesVersion,
  ingredientRows,
  isKnownIngredient,
  setIngredientOverrides,
  subscribeIngredientOverrides,
} from "./ingredientDisplay.js";
import { buildGroceryList } from "./groceryList.js";
import { ingredientGaps } from "./ingredientGaps.js";
import { ingredientHave, itemCovers } from "./inventoryMatch.js";

// Matt's changes to the ingredient names (the Admin page's Ingredient names card) sit on top of
// the built-in table: one reader, so every screen follows. Removing a change goes back to the
// built-in row.

afterEach(() => {
  setIngredientOverrides([]);
  setLang("en");
});

const added = { id: "a1", replaces: null, hidden: false, enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m" };
const replace = { id: "r1", replaces: "garlic clove", hidden: false, enOne: "garlic clove", enOther: "garlic cloves", frOne: "caïeu d'ail", frOther: "caïeux d'ail", gender: "m" };
const fr = (name) => ingredientName(name, "fr");
const en = (name) => ingredientName(name, "en");

describe("an ingredient Matt added", () => {
  it("is shown in French, and French in English, as soon as it is set", () => {
    expect(fr("biryani masala")).toBe("biryani masala"); // not in the table: as written
    expect(isKnownIngredient("biryani masala")).toBe(false);
    setIngredientOverrides([added]);
    expect(fr("biryani masala")).toBe("masala biryani");
    expect(en("masala biryani")).toBe("biryani masala");
    expect(isKnownIngredient("biryani masala")).toBe(true);
  });

  it("takes the describing words and the note of any other name", () => {
    setIngredientOverrides([{ ...added, gender: "f" }]);
    expect(fr("fresh biryani masala")).toBe("masala biryani fraîche");
    expect(ingredientNote("finely chopped", "biryani masala", "fr")).toBe("hachée finement");
  });

  it("leaves the gaps list: it is no longer a name with no translation", () => {
    const recipes = [{ id: "r", ingredients: [{ name: "Biryani masala" }, { name: "Schnitzel crumbs" }] }];
    expect(ingredientGaps(recipes).names.map((n) => n.name)).toEqual(["Biryani masala", "Schnitzel crumbs"]);
    setIngredientOverrides([added]);
    expect(ingredientGaps(recipes).names.map((n) => n.name)).toEqual(["Schnitzel crumbs"]);
  });

  it("is on the Grocery rows built from recipes", () => {
    const entry = { recipe: { id: "r1", title: "T", baseServings: 4, instructions: [], ingredients: [{ id: "i1", name: "Biryani masala", quantity: 1, unit: "tbsp", notes: null, group: null }] }, servings: 4 };
    setLang("fr");
    expect(buildGroceryList([entry])[0].label).toBe("Biryani masala");
    setIngredientOverrides([added]);
    const row = buildGroceryList([entry])[0];
    expect(row.label).toBe("Masala biryani");
    expect(row.name.toLowerCase()).toBe("biryani masala"); // what lookups read is still the recipe's own
  });
});

describe("a built-in row Matt replaced", () => {
  it("is shown his way, and goes back to the built-in row when the change is removed", () => {
    expect(fr("garlic cloves")).toBe("gousses d'ail");
    setIngredientOverrides([replace]);
    expect(fr("garlic cloves")).toBe("caïeux d'ail");
    expect(fr("garlic clove")).toBe("caïeu d'ail");
    expect(en("caïeu d'ail")).toBe("garlic clove");
    setIngredientOverrides([]);
    expect(fr("garlic cloves")).toBe("gousses d'ail");
    expect(fr("garlic clove")).toBe("gousse d'ail");
  });

  it("no longer reads the built-in French of that row", () => {
    setIngredientOverrides([replace]);
    expect(en("gousse d'ail")).toBe("gousse d'ail"); // not read: shown as written
    expect(isKnownIngredient("gousse d'ail")).toBe(false);
  });

  it("makes the describing words agree with the gender he gave", () => {
    setIngredientOverrides([{ ...replace, frOne: "ail frais haché", gender: "m" }]);
    expect(fr("garlic clove")).toBe("ail frais haché");
    setIngredientOverrides([{ ...replace, frOne: "gousse", frOther: "gousses", gender: "f" }]);
    expect(fr("frozen garlic cloves")).toBe("gousses surgelées");
    setIngredientOverrides([{ ...replace, frOne: "gousse", frOther: "gousses", gender: "m" }]);
    expect(fr("frozen garlic cloves")).toBe("gousses surgelés");
  });
});

describe("a built-in row Matt hid", () => {
  it("is not read at all, so the name is shown as written, and is listed as a gap again", () => {
    setIngredientOverrides([{ id: "h1", replaces: "shallot", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" }]);
    expect(fr("shallots")).toBe("shallots");
    expect(en("échalote")).toBe("échalote");
    expect(isKnownIngredient("shallot")).toBe(false);
    expect(ingredientGaps([{ id: "r", ingredients: [{ name: "shallots" }] }]).names).toEqual([{ name: "shallots", recipes: 1 }]);
    setIngredientOverrides([]);
    expect(fr("shallots")).toBe("échalotes");
  });
});

describe("a change that clashes with the built-in table", () => {
  it("wins, and the built-in table's own clash list is left alone", () => {
    // A spelling on two rows can't be saved (the server and the form refuse it), but if it ever is
    // here, Matt's row is the one that is read.
    setIngredientOverrides([{ id: "c1", replaces: null, hidden: false, enOne: "onion", enOther: "onions", frOne: "oignon jaune", frOther: "oignons jaunes", gender: "m" }]);
    expect(fr("onions")).toBe("oignons jaunes");
    expect(conflicts).toEqual([]);
  });
});

describe("the list in use", () => {
  it("is the built-in rows with the changes applied, Matt's first", () => {
    expect(effectiveIngredientRows()).toEqual(ingredientRows);
    setIngredientOverrides([added, replace]);
    const rows = effectiveIngredientRows();
    expect(rows).toHaveLength(ingredientRows.length + 1);
    expect(rows.slice(0, 2).map((row) => row.override.id)).toEqual(["a1", "r1"]);
    expect(rows.filter((row) => !row.override)).toHaveLength(ingredientRows.length - 1);
  });

  it("keeps the built-in rows as they are in the file", () => {
    const before = ingredientRows.map((row) => row.line);
    setIngredientOverrides([added, replace]);
    expect(ingredientRows.map((row) => row.line)).toEqual(before);
  });
});

describe("telling the screens", () => {
  it("moves the version and calls every listener on a change, until it is stopped", () => {
    const listener = vi.fn();
    const stop = subscribeIngredientOverrides(listener);
    const start = ingredientOverridesVersion();
    setIngredientOverrides([added]);
    expect(ingredientOverridesVersion()).toBe(start + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getIngredientOverrides()).toEqual([added]);
    stop();
    setIngredientOverrides([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("forgets the names it remembered", () => {
    expect(fr("biryani masala")).toBe("biryani masala");
    setIngredientOverrides([added]);
    expect(fr("biryani masala")).toBe("masala biryani");
    setIngredientOverrides([]);
    expect(fr("biryani masala")).toBe("biryani masala");
  });

  it("takes anything that is not a list as no changes", () => {
    setIngredientOverrides(null);
    expect(getIngredientOverrides()).toEqual([]);
  });
});

describe("the Inventory matcher", () => {
  const hide = (key) => ({ id: `h-${key}`, replaces: key, hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" });

  it("reads the changes: an ingredient Matt adds counts as soon as it is saved", () => {
    expect(itemCovers("chou-rave", "kohlrabi")).toBe(false);
    setIngredientOverrides([{ id: "k1", replaces: null, hidden: false, enOne: "kohlrabi", enOther: "kohlrabis", frOne: "chou-rave", frOther: "choux-raves", gender: "m" }]);
    expect(itemCovers("chou-rave", "kohlrabi")).toBe(true);
    expect(itemCovers("kohlrabi", "choux-raves")).toBe(true);
    setIngredientOverrides([]);
    expect(itemCovers("chou-rave", "kohlrabi")).toBe(false);
  });

  it("reads a spelling Matt gives a built-in row, and forgets one he took off it", () => {
    expect(itemCovers("Gousse d'ail", "garlic clove")).toBe(true);
    expect(itemCovers("caïeu d'ail", "garlic clove")).toBe(false);
    setIngredientOverrides([replace]);
    expect(itemCovers("caïeu d'ail", "garlic clove")).toBe(true);
    // The row now has its own spellings: the built-in « gousse d'ail » is no longer one of them.
    expect(itemCovers("Gousse d'ail", "garlic clove")).toBe(false);
    setIngredientOverrides([]);
    expect(itemCovers("Gousse d'ail", "garlic clove")).toBe(true);
  });

  it("stops reading the French of a built-in row Matt hides, and reads it again when it is back", () => {
    expect(itemCovers("échalote", "shallots")).toBe(true);
    setIngredientOverrides([hide("shallot")]);
    expect(itemCovers("échalote", "shallots")).toBe(false);
    setIngredientOverrides([]);
    expect(itemCovers("échalote", "shallots")).toBe(true);
  });

  it("answers again for an Inventory it has already answered for", () => {
    const kitchen = { inventory: [{ id: 1, name: "Chou-rave", quantity: 1, unit: null }] };
    expect(ingredientHave("kohlrabi", kitchen)).toBe("need");
    setIngredientOverrides([{ id: "k1", replaces: null, hidden: false, enOne: "kohlrabi", enOther: "kohlrabis", frOne: "chou-rave", frOther: "choux-raves", gender: "m" }]);
    expect(ingredientHave("kohlrabi", kitchen)).toBe("have");
    setIngredientOverrides([]);
    expect(ingredientHave("kohlrabi", kitchen)).toBe("need");
  });

  it("keeps its own rules ahead of a name: « poudre » stays powder whatever a row says", () => {
    setIngredientOverrides([{ id: "p1", replaces: null, hidden: false, enOne: "talc", enOther: "=", frOne: "poudre", frOther: "=", gender: "f" }]);
    expect(itemCovers("poudre de chili", "chili powder")).toBe(true);
    expect(itemCovers("poudre", "talc")).toBe(false);
  });

  it("reads the list through lib/ingredientList.js, never the display helper, and no second French list", () => {
    const source = fs.readFileSync(new URL("./inventoryMatch.js", import.meta.url), "utf8");
    expect(source).toMatch(/from "\.\/ingredientList\.js"/);
    expect(source).toMatch(/from "\.\/frenchReading\.js"/);
    expect(source).not.toMatch(/ingredientDisplay\.js|nameSaves/);
    expect(source).not.toMatch(/KITCHEN_FR|bilingual\.js/);
  });
});
