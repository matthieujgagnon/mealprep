import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SRC, sourceFiles } from "../i18n/scan.js";
import { allInventoryLinks, findLink, linkKey, linksVersion, setInventoryLinks } from "./inventoryLinks.js";
import { foodsToTeach, haveItemFor, ingredientHave, itemCovers, linkBehind, linksFromItem, matchingItems, recipeHave } from "./inventoryMatch.js";

// « Je l'ai comme… » / "I have it as…": the names Matt taught the matcher.

const link = (recipe, item, id = `${recipe}<-${item}`) => ({
  id,
  recipeName: linkKey(recipe),
  itemName: linkKey(item),
  recipeLabel: recipe,
  itemLabel: item,
});
const teach = (...pairs) => setInventoryLinks(pairs.map(([recipe, item]) => link(recipe, item)));
afterEach(() => setInventoryLinks([]));

describe("the names of a link", () => {
  // The same table is in the server's lib/inventoryLinks.test.js: both sides must fold
  // a name the same way, or a taught link never matches.
  it.each([
    ["Rice wine vinegar", "rice wine vinegar"],
    ["  Rice   wine\tvinegar ", "rice wine vinegar"],
    ["Vinaigre de RIZ", "vinaigre de riz"],
    ["Crème sure", "creme sure"],
    ["Œufs", "oeufs"],
    ["Poivrons rouges", "poivrons rouges"],
    ["Lait 2 %", "lait 2 %"],
  ])("%s is compared as %s", (name, key) => {
    expect(linkKey(name)).toBe(key);
  });

  it("holds the list, and says when it changed", () => {
    const before = linksVersion();
    teach(["rice vinegar", "Mirin"]);
    expect(linksVersion()).toBeGreaterThan(before);
    expect(allInventoryLinks()).toHaveLength(1);
    expect(findLink("mirin", "Rice Vinegar")).toMatchObject({ recipeLabel: "rice vinegar" });
    expect(findLink("mirin", "rice wine")).toBe(null);
    expect(findLink("Rice vinegar", "mirin")).toBe(null);
  });
});

describe("a taught link makes a recipe name count as an Inventory item", () => {
  const onions = { inventory: [{ id: "y", name: "Yellow onion" }] };

  it("is exactly those two names: red onion <- yellow onion does not leak to other onions", () => {
    expect(ingredientHave("red onion", onions)).toBe("need");
    teach(["red onion", "yellow onion"]);
    expect(ingredientHave("red onion", onions)).toBe("have");
    expect(ingredientHave("Red Onion", onions)).toBe("have");
    // Other onions, other names, other items.
    expect(ingredientHave("red onions", onions)).toBe("need");
    expect(ingredientHave("white onion", onions)).toBe("need");
    expect(ingredientHave("shallot", onions)).toBe("need");
    expect(ingredientHave("red onion", { inventory: [{ name: "White onion" }] })).toBe("need");
    expect(itemCovers("white onion", "red onion")).toBe(false);
  });

  it("goes one way: the recipe's name counts as the item, not the item's name as the recipe's", () => {
    teach(["red onion", "yellow onion"]);
    expect(ingredientHave("yellow onion", { inventory: [{ name: "Red onion" }] })).toBe("need");
    expect(itemCovers("red onion", "yellow onion")).toBe(false);
    expect(itemCovers("yellow onion", "red onion")).toBe(true);
  });

  it("takes one hop and no more", () => {
    teach(["mirin", "rice wine"], ["sake", "mirin"]);
    // sake <- mirin, mirin <- rice wine: sake does not become rice wine.
    expect(ingredientHave("sake", { inventory: [{ name: "Rice wine" }] })).toBe("need");
    expect(ingredientHave("sake", { inventory: [{ name: "Mirin" }] })).toBe("have");
    expect(ingredientHave("mirin", { inventory: [{ name: "Rice wine" }] })).toBe("have");
  });

  it("works after the matcher's own rules, so the rules still answer first", () => {
    expect(ingredientHave("rice vinegar", { inventory: [{ name: "Rice wine vinegar" }] })).toBe("have");
    teach(["rice vinegar", "Mirin"]);
    const both = { inventory: [{ name: "Rice wine vinegar" }, { name: "Mirin" }] };
    expect(matchingItems("rice vinegar", both.inventory).map((i) => i.name)).toEqual(["Rice wine vinegar", "Mirin"]);
    expect(linkBehind(["rice vinegar"], both.inventory)).toBe(null);
    expect(linkBehind(["rice vinegar"], [{ name: "Mirin" }])).toMatchObject({ link: { recipeLabel: "rice vinegar", itemLabel: "Mirin" }, item: { name: "Mirin" } });
  });

  it("reads French and English names alike, accents and capitals folded", () => {
    teach(["vinaigre de riz", "Mirin"], ["Crème sure", "Yogourt nature"]);
    expect(ingredientHave("Vinaigre de riz", { inventory: [{ name: "mirin" }] })).toBe("have");
    expect(ingredientHave("creme sure", { inventory: [{ name: "Yogourt  nature" }] })).toBe("have");
  });

  it("never counts a meal, and never an item past its date", () => {
    teach(["red onion", "yellow onion"]);
    expect(ingredientHave("red onion", { inventory: [{ name: "Yellow onion", isLeftover: true }] })).toBe("need");
    expect(ingredientHave("red onion", { inventory: [{ name: "Yellow onion", isPreparedMeal: true }] })).toBe("need");
    expect(ingredientHave("red onion", { inventory: [{ name: "Yellow onion", expiresAt: "2000-01-01" }] })).toBe("need");
    expect(haveItemFor("red onion", [{ id: "a", name: "Yellow onion", expiresAt: "2000-01-01" }, { id: "b", name: "Yellow onion" }]).id).toBe("b");
    expect(linkBehind(["red onion"], [{ name: "Yellow onion", isLeftover: true }])).toBe(null);
  });

  it("answers again as soon as the list changes, even for the same Inventory", () => {
    const kitchen = { inventory: [{ name: "Yellow onion" }] };
    expect(ingredientHave("red onion", kitchen)).toBe("need");
    teach(["red onion", "yellow onion"]);
    expect(ingredientHave("red onion", kitchen)).toBe("have");
    setInventoryLinks([]);
    expect(ingredientHave("red onion", kitchen)).toBe("need");
  });

  it("counts for a whole recipe: the line is had, and Cook with finds the recipe", () => {
    const recipe = { id: "r", ingredients: [{ name: "red onion" }, { name: "rice vinegar" }] };
    const kitchen = { inventory: [{ name: "Yellow onion" }, { name: "Rice wine vinegar" }] };
    expect(recipeHave(recipe, kitchen)).toMatchObject({ missingCount: 1, missing: ["Red onion"] });
    teach(["red onion", "yellow onion"]);
    expect(recipeHave(recipe, kitchen)).toMatchObject({ missingCount: 0, matchedCount: 2 });
  });

  it("is taught for the food that is missing: salt and pepper with salt in Inventory is pepper", () => {
    const inventory = [{ name: "Salt" }];
    expect(foodsToTeach(["salt and pepper"], inventory)).toEqual(["pepper"]);
    expect(foodsToTeach(["rice vinegar"], inventory)).toEqual(["rice vinegar"]);
    expect(foodsToTeach(["salt"], inventory)).toEqual([]);
    expect(foodsToTeach(["water"], inventory)).toEqual([]);
    // Each name of a Grocery row, each food once.
    expect(foodsToTeach(["garlic", "Garlic cloves", "garlic", "salt"], inventory)).toEqual(["garlic", "Garlic cloves"]);
    teach(["pepper", "Peppercorns"]);
    expect(ingredientHave("salt and pepper", { inventory: [{ name: "Salt" }, { name: "Peppercorns" }] })).toBe("have");
  });

  it("an item lists what it also counts as", () => {
    teach(["red onion", "Yellow onion"], ["onion rings", "Yellow onion"], ["rice vinegar", "Mirin"]);
    expect(linksFromItem({ name: "yellow onion" }).map((l) => l.recipeLabel)).toEqual(["red onion", "onion rings"]);
    expect(linksFromItem({ name: "Mirin" }).map((l) => l.recipeLabel)).toEqual(["rice vinegar"]);
    expect(linksFromItem({ name: "Yellow onion", isLeftover: true })).toEqual([]);
    expect(linksFromItem({ name: "Garlic" })).toEqual([]);
  });
});

// Links are read in one place. A link makes a name count only inside the matcher
// (inventoryMatch.js), so every page that says "have it or not" gives the same
// answer. These read the source text, like the other guards.
describe("links are read only inside the matcher", () => {
  const files = sourceFiles().map((file) => ({ name: path.relative(SRC, file), src: fs.readFileSync(file, "utf8") }));
  const using = (pattern) => files.filter((f) => pattern.test(f.src)).map((f) => f.name).sort();

  it("only the matcher looks a link up by its two names", () => {
    expect(using(/\bfindLink\b/)).toEqual(["lib/inventoryLinks.js", "lib/inventoryMatch.js"]);
    expect(using(/\blinksOnItemName\b/)).toEqual(["lib/inventoryLinks.js", "lib/inventoryMatch.js"]);
    expect(using(/\blinksVersion\b/)).toEqual(["lib/inventoryLinks.js", "lib/inventoryMatch.js"]);
  });

  it("only the matcher and the save code read a link's names", () => {
    // `recipeName` and `itemName` are the keys that are compared; pages show the labels.
    expect(using(/(?<!inventory)\.(?:recipeName|itemName)\b/)).toEqual(["lib/inventoryLinks.js", "lib/linkSaves.js"]);
  });

  it("only the save code reads the whole list", () => {
    expect(using(/\ballInventoryLinks\b/)).toEqual(["lib/inventoryLinks.js", "lib/linkSaves.js"]);
  });
});
