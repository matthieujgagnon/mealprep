import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PILLS,
  captionTime,
  cardButtons,
  cardCaption,
  cardState,
  haveBar,
  namesToAdd,
  pickPills,
  pillFontSize,
  saleCount,
  soonItemFor,
} from "./photoCard.js";
import { addDays, quebecDay } from "./quebecDay.js";

const recipe = (id, names) => ({ id, title: id, ingredients: names.map((name) => ({ name })) });
// A use-by date n Quebec days from today ("2026-10-15"), the way the Inventory
// form saves one. Days left are counted in Quebec calendar days, so a date made
// from the machine clock ("now + n days") lands on the wrong day near midnight.
const inDays = (n) => addDays(quebecDay(), n);

// Noon, 11:30 p.m., midnight and 3:59 a.m. in Quebec (Oct 2026, UTC-4): the
// use-soon strip says the same at every hour, the late ones included.
const TIMES = [
  ["noon", "2026-10-14T16:00:00Z"],
  ["11:30 p.m.", "2026-10-15T03:30:00Z"],
  ["midnight", "2026-10-15T04:00:00Z"],
  ["3:59 a.m.", "2026-10-15T07:59:00Z"],
];

afterEach(() => vi.useRealTimers());

describe("the Recipes card caption", () => {
  it("writes the time in capitals, with hours", () => {
    expect(captionTime(35)).toBe("35 MIN");
    expect(captionTime(240)).toBe("4 H");
    expect(captionTime(75)).toBe("1 H 15 MIN");
    expect(captionTime(0)).toBe("");
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

describe.each(TIMES)("the use-soon strip, at %s in Quebec", (_label, iso) => {
  const celery = recipe("salad", ["celery", "chickpeas"]);
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  });

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
