import { describe, expect, it } from "vitest";
import {
  MAX_PILLS,
  captionTime,
  cardButtons,
  cardCaption,
  cardState,
  haveBar,
  mealLineColor,
  namesToAdd,
  pickPills,
  pillFontSize,
  saleCount,
  soonItemFor,
} from "./photoCard.js";

const recipe = (id, names) => ({ id, title: id, ingredients: names.map((name) => ({ name })) });
const inDays = (n) => new Date(Date.now() + n * 86400000 - 3600000).toISOString(); // daysUntil rounds up, so an hour short is exactly n days

describe("the Recipes card caption and meal line", () => {
  it("writes the time in capitals, with hours", () => {
    expect(captionTime(35)).toBe("35 MIN");
    expect(captionTime(240)).toBe("4 H");
    expect(captionTime(75)).toBe("1 H 15 MIN");
    expect(captionTime(0)).toBe("");
  });

  it("colours only breakfast, lunch and supper", () => {
    expect(mealLineColor("dinner")).toBe("var(--riso-accent)");
    expect(mealLineColor("lunch")).toBe("var(--riso-hot)");
    expect(mealLineColor("breakfast")).toBe("var(--riso-yellow)");
    expect(mealLineColor("dessert")).toBeNull();
    expect(mealLineColor(null)).toBeNull();
  });
});

describe("the pills on a Makeable card", () => {
  it("puts proteins on the left and the rest on the right", () => {
    const { left, right, more } = pickPills(["nouilles", "bœuf", "gingembre", "anis étoilé"]);
    expect(left.map((p) => p.name)).toEqual(["bœuf"]);
    expect(right.map((p) => p.name)).toEqual(["nouilles", "gingembre", "anis étoilé"]);
    expect(more).toBe(0);
  });

  it("keeps one column when there is no protein", () => {
    const { left, right } = pickPills(["parmesan", "lemon"]);
    expect(left.map((p) => p.name)).toEqual(["parmesan", "lemon"]);
    expect(right).toEqual([]);
  });

  it("shows at most four and counts the others, proteins first", () => {
    const { left, right, more } = pickPills(["parsley", "carrot", "celery", "chicken", "leeks", "kale"]);
    expect(left.length + right.length).toBe(MAX_PILLS);
    expect(left.map((p) => p.name)).toEqual(["chicken"]);
    expect(right.map((p) => p.name)).toEqual(["parsley", "carrot", "celery"]);
    expect(more).toBe(2);
  });

  it("makes a long name's text smaller instead of cutting it", () => {
    expect(pillFontSize("parmesan")).toBe(12);
    expect(pillFontSize("citron")).toBe(13);
    expect(pillFontSize("gingembre")).toBe(10.5);
    expect(pillFontSize("anis étoilé")).toBe(10.5);
    expect(pillFontSize("feta")).toBe(13);
  });
});

describe("the buttons follow the situation", () => {
  const ids = (state) => cardButtons(state).map((b) => `${b.id}:${b.tone}`);
  it("ready: Cook then Plan", () => expect(ids("ready")).toEqual(["cook:main", "plan:plain"]));
  it("one or two short: To buy then Plan", () => expect(ids("few")).toEqual(["buy:main", "plan:plain"]));
  it("needs a shop: Plan first, no Cook", () => expect(ids("shop")).toEqual(["plan:main", "buy:plain"]));

  it("reads the state from what is missing", () => {
    expect(cardState({ totalCount: 5, missingCount: 0 })).toBe("ready");
    expect(cardState({ totalCount: 6, missingCount: 2 })).toBe("few");
    expect(cardState({ totalCount: 6, missingCount: 4 })).toBe("shop");
  });
});

describe("the grocery list and the sale summary", () => {
  it("adds only what is not on the list yet", () => {
    const on = new Set(["leeks"]);
    expect(namesToAdd(["salmon", "leeks", "kale"], (n) => on.has(n))).toEqual(["salmon", "kale"]);
  });

  it("counts the missing ingredients that are really on sale", () => {
    const sale = (name) => (name === "mangoes" ? { percent: 40 } : null);
    expect(saleCount(["mangoes", "beans"], sale)).toBe(1);
    expect(saleCount([], sale)).toBe(0);
  });
});

describe("the use-soon strip", () => {
  const celery = recipe("salad", ["celery", "chickpeas"]);

  it("names the soonest ingredient going off within 3 days", () => {
    const inventory = [
      { name: "celery", expiresAt: inDays(2) },
      { name: "chickpeas", expiresAt: inDays(1) },
    ];
    expect(soonItemFor(celery, inventory, [], [celery])).toEqual({ name: "Chickpeas", days: 1 });
  });

  it("says nothing when the soonest is 4 days away or more", () => {
    const inventory = [{ name: "celery", expiresAt: inDays(4) }];
    expect(soonItemFor(celery, inventory, [], [celery])).toBeNull();
  });

  it("ignores an ingredient the recipe doesn't use, and food that is already gone", () => {
    const inventory = [
      { name: "milk", expiresAt: inDays(1) },
      { name: "celery", expiresAt: inDays(-2) },
    ];
    expect(soonItemFor(celery, inventory, [], [celery])).toBeNull();
  });

  it("leaves out food another planned meal already uses", () => {
    const soup = recipe("soup", ["celery", "carrot"]);
    const inventory = [{ name: "celery", expiresAt: inDays(2) }];
    const planned = [{ recipeId: "soup", recipe: soup }];
    expect(soonItemFor(celery, inventory, planned, [celery, soup])).toBeNull();
  });
});

describe("the caption over a photo", () => {
  it("writes the meal and the time, either one alone, or nothing", () => {
    expect(cardCaption("Souper", 90)).toBe("Souper · 1 H 30 MIN");
    expect(cardCaption("", 35)).toBe("35 MIN");
    expect(cardCaption("Dîner", 0)).toBe("Dîner");
    expect(cardCaption("", 0)).toBe("");
  });
});

describe("the have bar and the Planner finder card's info row", () => {
  it("counts what you have, and says complete when nothing is missing", () => {
    expect(haveBar({ matchedCount: 6, missingCount: 0, totalCount: 6 })).toMatchObject({ text: "6/6", pct: 100, state: "complete", missing: 0 });
  });

  it("says how many are missing and fills the bar by what you have", () => {
    expect(haveBar({ matchedCount: 4, missingCount: 2, totalCount: 6 })).toMatchObject({ text: "4/6", pct: 67, state: "missing", missing: 2 });
    expect(haveBar({ matchedCount: 0, missingCount: 3, totalCount: 3 })).toMatchObject({ text: "0/3", pct: 0, state: "missing" });
  });

  it("has no bar and is not complete when the recipe lists no ingredients", () => {
    expect(haveBar({ matchedCount: 0, missingCount: 0, totalCount: 0 })).toMatchObject({ pct: 0, state: "none" });
  });
});
