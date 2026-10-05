import { describe, expect, it } from "vitest";
import { rankRecipesForTray } from "./plannerSuggestions.js";
import { haveCoresFor } from "./onHand.js";
import { core } from "./similarRecipes.js";
import {
  availabilityOf,
  categoryOf,
  expiringItems,
  findRecipes,
  groupIngredients,
  haveAndBuy,
  plannedDayOf,
  saleFor,
  shelvesWithItems,
  sharedWords,
} from "./finder.js";

const recipe = (id, title, names, extra = {}) => ({ id, title, ingredients: names.map((name) => ({ name })), ...extra });
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

const recipes = [
  recipe("orzo", "Lemon chicken orzo", ["orzo", "chicken thighs", "spinach", "garlic", "parmesan", "lemon"], { prepTimeMinutes: 10, cookTimeMinutes: 25, mealSlot: "dinner" }),
  recipe("shawarma", "Chicken shawarma bowls", ["chicken", "yogurt", "lemon", "onion", "spinach", "cucumber", "pita"], { cookTimeMinutes: 40, mealSlot: "dinner" }),
  recipe("pancakes", "Buttermilk pancakes", ["flour", "eggs", "buttermilk", "butter"], { cookTimeMinutes: 20, mealSlot: "breakfast" }),
  recipe("salad", "Green salad", ["lettuce", "cucumber"], { cookTimeMinutes: 10, mealSlot: "lunch" }),
];
const inventory = [
  { name: "spinach", location: "fridge", expiresAt: inDays(3) },
  { name: "onion", location: "pantry", expiresAt: inDays(4) },
  { name: "eggs", location: "fridge", expiresAt: inDays(20) },
  { name: "chicken thighs", location: "freezer", expiresAt: inDays(60) },
  { name: "flour", location: "pantry" },
  { name: "paprika", location: "custom-spices" },
  { name: "old milk", location: "fridge", expiresAt: inDays(-2) },
];

function rank() {
  return rankRecipesForTray({
    recipes,
    upcomingEntries: [],
    pantryInventory: inventory,
    haveCores: haveCoresFor(inventory, []),
  });
}

describe("categoryOf", () => {
  it("puts an ingredient in protein, produce, dairy or pantry", () => {
    expect(categoryOf("chicken thighs")).toBe("protein");
    expect(categoryOf("Eggs")).toBe("protein");
    expect(categoryOf("spinach")).toBe("produce");
    expect(categoryOf("Épinards")).toBe("produce");
    expect(categoryOf("parmesan")).toBe("dairy");
    expect(categoryOf("orzo")).toBe("pantry");
  });
});

describe("groupIngredients", () => {
  it("groups a recipe's ingredients in the order protein, produce, dairy, pantry", () => {
    const groups = groupIngredients(recipes[0]);
    expect(groups.map((g) => g.id)).toEqual(["protein", "produce", "dairy", "pantry"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Chicken thighs"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Spinach", "Garlic", "Lemon"]);
  });

  it("leaves out an empty group", () => {
    expect(groupIngredients(recipe("x", "Salad", ["lettuce"])).map((g) => g.id)).toEqual(["produce"]);
  });
});

describe("expiringItems", () => {
  it("lists what goes off within a week, soonest first, with the days left", () => {
    const items = expiringItems(inventory);
    expect(items.map((i) => [i.name, i.days])).toEqual([["Spinach", 3], ["Onion", 4]]);
  });

  it("skips what is already past its date", () => {
    expect(expiringItems(inventory).map((i) => i.name)).not.toContain("Old milk");
  });
});

describe("shelvesWithItems", () => {
  const sections = [
    { id: "fridge", label: "Fridge", custom: false },
    { id: "freezer", label: "Freezer", custom: false },
    { id: "pantry", label: "Pantry", custom: false },
    { id: "custom-spices", label: "Spice rack", custom: true },
    { id: "custom-empty", label: "Garage", custom: true },
  ];

  it("follows the user's own shelves and names, skipping empty ones", () => {
    const shelves = shelvesWithItems(inventory, sections);
    expect(shelves.map((s) => s.label)).toEqual(["Fridge", "Freezer", "Pantry", "Spice rack"]);
    expect(shelves[3].items.map((i) => i.name)).toEqual(["Paprika"]);
  });

  it("gives the built-in shelves their own colours and a custom shelf another", () => {
    const shelves = shelvesWithItems(inventory, sections);
    expect(shelves.map((s) => s.tone)).toEqual(["fridge", "freezer", "pantry", "spice"]);
  });

  it("leaves out food that has gone off", () => {
    const fridge = shelvesWithItems(inventory, sections)[0];
    expect(fridge.items.map((i) => i.name)).toEqual(["Spinach", "Eggs"]);
  });
});

describe("availabilityOf", () => {
  it("is ready with nothing to buy, few with one or two, shop beyond that", () => {
    expect(availabilityOf({ totalCount: 4, missingCount: 0 })).toBe("ready");
    expect(availabilityOf({ totalCount: 4, missingCount: 2 })).toBe("few");
    expect(availabilityOf({ totalCount: 4, missingCount: 3 })).toBe("shop");
    expect(availabilityOf({ totalCount: 0, missingCount: 0 })).toBe("shop");
  });
});

describe("findRecipes", () => {
  it("searches title, tag and ingredient, and counts the three availability choices", () => {
    const { ranked, expiringCores } = rank();
    const { tiles, counts } = findRecipes(ranked, { query: "chicken", avail: "all" }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id).sort()).toEqual(["orzo", "shawarma"]);
    expect(counts.all).toBe(2);
  });

  it("filters by availability and keeps the other counts", () => {
    const { ranked, expiringCores } = rank();
    const all = findRecipes(ranked, { avail: "all" }, new Set(expiringCores));
    const few = findRecipes(ranked, { avail: "few" }, new Set(expiringCores));
    expect(few.tiles.length).toBe(all.counts.few);
    expect(few.counts).toEqual(all.counts);
  });

  it("Ready follows the Makeable now rule: meals only, until pantry and sides are included", () => {
    const side = (id, slot) => ({ recipe: { id, mealSlot: slot, ingredients: [] }, stats: { totalCount: 2, missingCount: 0, matchedCount: 2 }, cores: [] });
    const ranked = [side("soup", "dinner"), side("untyped", null), side("rice", "side"), side("cake", "dessert")];
    const ready = (filters) => findRecipes(ranked, { avail: "ready", ...filters }, new Set());
    expect(ready({}).tiles.map((x) => x.recipe.id).sort()).toEqual(["soup", "untyped"]);
    expect(ready({}).counts.ready).toBe(2);
    expect(ready({ includeSides: true }).counts.ready).toBe(4);
    // Narrowing to Dessert yourself is asking for them.
    expect(ready({ meal: "dessert" }).tiles.map((x) => x.recipe.id)).toEqual(["cake"]);
  });

  it("Expiring soon keeps the recipes that use food going off", () => {
    const { ranked, expiringCores } = rank();
    const { tiles } = findRecipes(ranked, { avail: "all", expiring: true }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id).sort()).toEqual(["orzo", "shawarma"]);
  });

  it("Quick keeps half an hour or less, and Meal keeps one meal type", () => {
    const { ranked, expiringCores } = rank();
    const quick = findRecipes(ranked, { avail: "all", quick: true }, new Set(expiringCores));
    expect(quick.tiles.map((x) => x.recipe.id).sort()).toEqual(["pancakes", "salad"]);
    const breakfast = findRecipes(ranked, { avail: "all", meal: "breakfast" }, new Set(expiringCores));
    expect(breakfast.tiles.map((x) => x.recipe.id)).toEqual(["pancakes"]);
  });

  it("Protein keeps the recipes that use it", () => {
    const { ranked, expiringCores } = rank();
    const { tiles } = findRecipes(ranked, { avail: "all", protein: "chicken" }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id).sort()).toEqual(["orzo", "shawarma"]);
  });

  it("Cook with shows recipes using the picked ingredients, most first", () => {
    const { ranked, expiringCores } = rank();
    const picks = new Set([core("spinach"), core("lemon"), core("cucumber")]);
    const { tiles } = findRecipes(ranked, { avail: "all", picks }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id)).toEqual(["shawarma", "orzo", "salad"]);
    expect(tiles[0].picked).toHaveLength(3);
  });

  it("Cook with also finds a staple such as paprika by the name written in the recipe", () => {
    const withPaprika = [...recipes, recipe("paprika", "Smoky chicken", ["chicken", "smoked paprika"])];
    const { ranked, expiringCores } = rankRecipesForTray({
      recipes: withPaprika,
      upcomingEntries: [],
      pantryInventory: inventory,
      haveCores: haveCoresFor(inventory, []),
    });
    const shelves = shelvesWithItems(inventory, [{ id: "custom-spices", label: "Spice rack", custom: true }]);
    const key = shelves[0].items[0].key;
    expect(key).toBe("~paprika");
    const { tiles } = findRecipes(ranked, { avail: "all", picks: new Set([key]) }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id)).toEqual(["paprika"]);
    expect(tiles[0].picked).toEqual(["~paprika"]);
  });

  it("Main meal shows the recipes sharing its ingredients, most shared first, without itself", () => {
    const { ranked, expiringCores } = rank();
    const base = new Set(groupIngredients(recipes[0]).flatMap((g) => g.items.map((i) => i.core)));
    const { tiles } = findRecipes(ranked, { avail: "all", base, baseId: "orzo" }, new Set(expiringCores));
    expect(tiles.map((x) => x.recipe.id)).toEqual(["shawarma"]);
    expect(tiles[0].shared.sort()).toEqual([core("chicken"), core("lemon"), core("spinach")].sort());
  });

  it("switching an ingredient off the Main meal widens or narrows the search", () => {
    const { ranked, expiringCores } = rank();
    const only = new Set([core("garlic")]);
    const { tiles } = findRecipes(ranked, { avail: "all", base: only, baseId: "orzo" }, new Set(expiringCores));
    expect(tiles).toEqual([]);
  });
});

describe("haveAndBuy", () => {
  it("splits a recipe's ingredients into what is on hand and what to buy", () => {
    const { have, buy } = haveAndBuy(recipes[0], haveCoresFor(inventory, []));
    expect(have.map((i) => i.name)).toEqual(["Chicken thighs", "Spinach"]);
    expect(buy.map((i) => i.name)).toEqual(["Orzo", "Garlic", "Parmesan", "Lemon"]);
  });
});

describe("plannedDayOf", () => {
  const entry = (recipeId, weekStart, dayOfWeek, extra = {}) => ({ recipe: { id: recipeId }, weekStart, dayOfWeek, ...extra });

  it("is the soonest day the recipe is planned, ignoring leftovers", () => {
    const entries = [entry("a", "2026-10-12", 1), entry("a", "2026-10-05", 4), entry("a", "2026-10-05", 2, { isLeftover: true })];
    expect(plannedDayOf("a", entries)).toBe(4);
  });

  it("is null when it is not planned", () => {
    expect(plannedDayOf("b", [entry("a", "2026-10-05", 1)])).toBeNull();
  });
});

describe("sharedWords", () => {
  it("names up to three shared ingredients, and counts more", () => {
    const nameOf = (c) => c.toUpperCase();
    expect(sharedWords(["a", "b"], nameOf)).toEqual({ names: ["A", "B"], count: 2 });
    expect(sharedWords(["a", "b", "c", "d"], nameOf)).toEqual({ names: [], count: 4 });
    expect(sharedWords([], nameOf)).toEqual({ names: [], count: 0 });
  });
});

describe("saleFor", () => {
  it("is null when the flyers have nothing on sale for it, whatever else is in them", () => {
    expect(saleFor("lemon", [])).toBeNull();
    expect(saleFor("lemon", [{ item: "bananas", price: "$1.00", store: "Metro", unitPrice: 1, unitBasis: "each" }])).toBeNull();
  });

  it("reads the store, price and saving from a real deal", () => {
    const deal = {
      id: 1,
      item: "Lemons",
      matchName: "lemon",
      store: "Maxi",
      price: "$0.50",
      unitPrice: 0.5,
      unitBasis: "each",
      regularPrice: 0.9,
    };
    const sale = saleFor("lemon", [deal]);
    expect(sale.store).toBe("Maxi");
    expect(sale.price).toBe("$0.50");
    expect(Math.round(sale.percent)).toBe(44);
  });
});
