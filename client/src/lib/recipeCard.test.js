import { describe, expect, it } from "vitest";
import { setLang } from "../i18n/index.js";
import { rankRecipesForTray } from "./plannerSuggestions.js";
import { bySimilarity, similarTo } from "./finder.js";
import { lineNeed, recipeHave, shortBy } from "./inventoryMatch.js";
import {
  MEAL_PRICING_READY,
  amountText,
  cardSteps,
  groceryItemOf,
  nextCurrent,
  receiptTotals,
  recipeReceipt,
  stepServings,
  stepState,
  timerPill,
} from "./recipeCard.js";
import { ANY_STORE, DEFAULT_STORE, namedStoreFor, storeFor, storeSetup } from "./groceryStores.js";

setLang("en");

const ing = (name, quantity = null, unit = null, extra = {}) => ({ name, quantity, unit, ...extra });
const kitchen = (inventory) => ({ inventory, customStaples: [], excludedStaples: [] });
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

const shawarma = {
  id: "shawarma",
  title: "Sheet-pan chicken shawarma",
  baseServings: 4,
  ingredients: [
    ing("chicken thighs", 900, "g", { notes: "boneless" }),
    ing("plain yogurt", 1, "cup"),
    ing("red onion", 1),
    ing("garlic", 4, "cloves", { notes: "minced" }),
    ing("cucumber", 1, null, { group: "To serve" }),
    ing("olive oil", 2, "tbsp"),
    ing("salt"),
  ],
};

describe("the receipt", () => {
  const inv = kitchen([
    { name: "Chicken thighs", quantity: 1200, unit: "g", location: "fridge", expiresAt: inDays(2) },
    { name: "Plain yogurt", quantity: null, location: "fridge" },
    { name: "Red onions", quantity: 3, location: "pantry" },
    { name: "Garlic", quantity: 10, unit: "cloves", location: "pantry" },
  ]);

  it("splits what to buy from what is in your Inventory, with the staples apart", () => {
    const r = recipeReceipt(shawarma, inv, 4);
    expect(r.buy.map((row) => row.name)).toEqual(["Cucumber"]);
    expect(r.have.map((row) => row.name)).toEqual(["Chicken thighs", "Plain yogurt", "Red onion", "Garlic"]);
    expect(r.staples).toEqual(["Olive oil", "Salt"]);
    expect(r.have[0].amount).toBe("900 g");
    expect(r.have[0].notes).toEqual(["boneless"]);
    expect(r.buy[0].groups).toEqual(["To serve"]);
  });

  it("is the same count as every other page at the recipe's own servings", () => {
    const r = recipeReceipt(shawarma, inv, 4);
    const counts = recipeHave(shawarma, inv);
    expect(r.buy.length).toBe(counts.missingCount);
    expect(r.have.length).toBe(counts.matchedCount);
  });

  it("rescales every amount with the servings", () => {
    const r = recipeReceipt(shawarma, inv, 2);
    expect(r.have.find((row) => row.name === "Chicken thighs").amount).toBe("450 g");
    expect(r.have.find((row) => row.name === "Garlic").amount).toBe("2 cloves");
  });

  it("moves what you'd run short of to To buy, as how much more", () => {
    const r = recipeReceipt(shawarma, inv, 8);
    const more = r.buy.filter((row) => row.short);
    // 1800 g needed, 1200 g in the fridge; 8 cloves of 10 is enough; 2 onions of 3 too.
    expect(more.map((row) => [row.name, row.amount])).toEqual([["Chicken thighs", "600 g"]]);
    // It stays in Inventory too, with the whole amount the recipe uses.
    expect(r.have.find((row) => row.name === "Chicken thighs").amount).toBe("1800 g");
    expect(groceryItemOf(more[0])).toEqual({ name: "Chicken thighs", quantity: 600, unit: "g" });
    expect(groceryItemOf(r.buy[0])).toBe("Cucumber");
  });

  it("never guesses a shortage it can't measure", () => {
    // The yogurt has no amount in Inventory; a cup can't be weighed.
    const r = recipeReceipt(shawarma, inv, 40);
    expect(r.buy.some((row) => row.short && row.name === "Plain yogurt")).toBe(false);
  });

  it("marks the expiring items it uses", () => {
    const soonItems = [inv.inventory[0]];
    const r = recipeReceipt(shawarma, inv, 4, { soonItems });
    expect(r.have.filter((row) => row.soon).map((row) => row.name)).toEqual(["Chicken thighs"]);
  });

  it("adds up one food written twice", () => {
    const twice = { baseServings: 2, ingredients: [ing("garlic cloves", 2, "cloves"), ing("minced garlic", 1, "cloves")] };
    const need = lineNeed(twice.ingredients, 1);
    expect(need.quantity).toBe(3);
    expect(recipeReceipt(twice, kitchen([]), 2).buy.map((row) => row.amount)).toEqual(["3 cloves"]);
  });

  it("writes amounts that can't be added up one after the other", () => {
    expect(amountText(lineNeed([ing("rice", 1, "cup"), ing("rice", 200, "g")]))).toBe("1 cup + 200 g");
    expect(amountText(lineNeed([ing("parsley")]))).toBe("");
  });

  it("counts only items still good", () => {
    const old = kitchen([{ name: "Chicken thighs", quantity: 2000, unit: "g", expiresAt: inDays(-1) }]);
    expect(shortBy(lineNeed([ing("chicken thighs", 900, "g")]), "chicken thighs", old.inventory)).toBe(null);
  });
});

describe("prices wait for Meal pricing", () => {
  it("are off: no $ amount and no switch show", () => {
    expect(MEAL_PRICING_READY).toBe(false);
  });

  it("add up only the rows that have a price", () => {
    const totals = receiptTotals([{ price: 2 }, {}], [{ price: 6 }], 4);
    expect(totals).toEqual({ toBuy: 2, fromInventory: 6, meal: 8, perServing: 2, priced: 2, total: 3 });
  });
});

describe("servings", () => {
  it("go one at a time and never under 1", () => {
    expect(stepServings(4, 1)).toBe(5);
    expect(stepServings(3, -1)).toBe(2);
    expect(stepServings(1, -1)).toBe(1);
    expect(stepServings(12, 1)).toBe(13);
  });
});

describe("steps", () => {
  const steps = cardSteps(["For the chicken:", "Marinate: Stir it 20 minutes.", "Roast for 25 minutes.", "Serve."]);

  it("number the steps and keep section labels apart", () => {
    expect(steps.map((s) => (s.heading ? "label" : s.index))).toEqual(["label", 0, 1, 2]);
    expect(steps[1].key).toBe(1);
  });

  it("move on when the current one is clicked", () => {
    expect(nextCurrent(2, 0)).toBe(2);
    expect(nextCurrent(1, 1)).toBe(2);
    expect(stepState(0, 1)).toBe("done");
    expect(stepState(1, 1)).toBe("current");
    expect(stepState(2, 1)).toBe("todo");
    // Past the last step every step is done.
    expect(stepState(2, 3)).toBe("done");
  });

  it("have four timer states", () => {
    expect(timerPill({ total: 60, remaining: 60, running: false, finished: false, paused: false }).kind).toBe("idle");
    expect(timerPill({ total: 60, remaining: 42, running: true, finished: false, paused: false })).toEqual({ kind: "running", started: true });
    expect(timerPill({ total: 60, remaining: 42, running: false, finished: false, paused: true })).toEqual({ kind: "paused", started: true });
    expect(timerPill({ total: 60, remaining: 0, running: false, finished: true, paused: false })).toEqual({ kind: "done", started: true });
  });
});

describe("similar recipes, one rule", () => {
  const r = (id, title, names, minutes) => ({ id, title, cookTimeMinutes: minutes, ingredients: names.map((name) => ing(name)) });
  const recipes = [
    shawarma,
    r("souvlaki", "Chicken souvlaki", ["chicken thighs", "plain yogurt", "red onion", "garlic", "cucumber"], 35),
    r("pitas", "Lemon garlic chicken pitas", ["chicken thighs", "garlic", "lemon", "plain yogurt", "red onion"], 30),
    r("wraps", "Veggie wraps", ["red onion", "cucumber", "tortillas"], 40),
    r("cake", "Chocolate cake", ["flour", "cocoa", "eggs"], 50),
  ];
  const k = kitchen([{ name: "lemon" }]);
  const { ranked } = rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: k });

  it("puts the most shared first, then the fewest missing, then the quickest", () => {
    // Souvlaki and pitas share 4 or 5 each; pitas has the lemon in Inventory.
    expect(similarTo(shawarma, ranked).map((x) => x.recipe.id)).toEqual(["souvlaki", "pitas", "wraps"]);
  });

  it("leaves out the ingredients you tap off", () => {
    const out = similarTo(shawarma, ranked, ["cucumber"]);
    expect(out.map((x) => [x.recipe.id, x.shared.length])).toEqual([
      ["pitas", 4],
      ["souvlaki", 4],
      ["wraps", 1],
    ]);
  });

  it("breaks ties on time", () => {
    const a = { recipe: { cookTimeMinutes: 40 }, shared: [1, 2], stats: { missingCount: 1 }, score: 0 };
    const b = { recipe: { cookTimeMinutes: 20 }, shared: [1, 2], stats: { missingCount: 1 }, score: 0 };
    const none = { recipe: {}, shared: [1, 2], stats: { missingCount: 1 }, score: 0 };
    expect([a, none, b].sort(bySimilarity)).toEqual([b, a, none]);
  });
});

describe("the store a To buy row names", () => {
  const deals = [{ store: "Metro" }, { store: "IGA" }];
  const sections = [{ name: "Costco", assignments: [{ core: "rice" }] }];

  it("is the store the grocery list files it under", () => {
    const setup = storeSetup(sections, deals);
    expect(storeFor("rice", null, { ...setup, storePrefs: {} })).toBe("Costco");
    expect(storeFor("lemon", { store: "IGA" }, { ...setup, storePrefs: {} })).toBe("IGA");
    expect(storeFor("lemon", { store: "IGA" }, { ...setup, storePrefs: { lemon: "Metro" } })).toBe("Metro");
    expect(storeFor("parsley", null, { ...setup, storePrefs: {} })).toBe("Metro");
  });

  it("is left out when the list only has a catch-all", () => {
    expect(namedStoreFor("parsley", null, storeSetup([], []))).toBe(null);
    expect(storeFor("parsley", null, { ...storeSetup([], []), storePrefs: {} })).toBe(DEFAULT_STORE);
    expect(namedStoreFor("parsley", null, storeSetup(sections, []))).toBe(null);
    expect(storeFor("parsley", null, { ...storeSetup(sections, []), storePrefs: {} })).toBe(ANY_STORE);
    expect(namedStoreFor("parsley", null, storeSetup([], deals))).toBe("Metro");
  });
});
