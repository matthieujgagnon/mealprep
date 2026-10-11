import { describe, expect, it } from "vitest";
import { TO_USE_DAYS, currentMealType, toUseItems, useBarPct, useTone } from "./homeWeek.js";

describe("currentMealType", () => {
  it("is breakfast in the morning, lunch around noon and supper after", () => {
    expect(currentMealType(new Date(2026, 9, 5, 8))).toBe("breakfast");
    expect(currentMealType(new Date(2026, 9, 5, 9, 59))).toBe("breakfast");
    expect(currentMealType(new Date(2026, 9, 5, 10))).toBe("lunch");
    expect(currentMealType(new Date(2026, 9, 5, 14, 59))).toBe("lunch");
    expect(currentMealType(new Date(2026, 9, 5, 15))).toBe("dinner");
    expect(currentMealType(new Date(2026, 9, 5, 22))).toBe("dinner");
  });
});

describe("useTone", () => {
  it("colours by days left", () => {
    expect(useTone(0)).toBe("pink");
    expect(useTone(3)).toBe("pink");
    expect(useTone(4)).toBe("yellow");
    expect(useTone(7)).toBe("yellow");
    expect(useTone(8)).toBe("blue");
    expect(useTone(12)).toBe("blue");
  });
});

describe("useBarPct", () => {
  it("is nearly full on the last day and never empty", () => {
    expect(useBarPct(0)).toBe(96);
    expect(useBarPct(1)).toBe(86);
    expect(useBarPct(5)).toBe(29);
    expect(useBarPct(30)).toBe(8);
  });
});

describe("toUseItems", () => {
  const base = new Date(2026, 9, 5).getTime();
  const at = (n) => new Date(base + n * 86400000).toISOString();
  const daysUntil = (iso) => Math.round((new Date(iso).getTime() - base) / 86400000);

  it("shows everything inside the window, soonest first", () => {
    const items = [29, 1, 4, 2, 6, 3, 5].map((n) => ({ id: n, expiresAt: at(n) }));
    const { shown, soonest } = toUseItems(items, daysUntil);
    expect(shown.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 29]);
    expect(soonest.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("covers a month", () => {
    expect(TO_USE_DAYS).toBe(30);
  });

  it("leaves out what is past its date, undated, or beyond the window", () => {
    const items = [
      { id: "past", expiresAt: at(-1) },
      { id: "none", expiresAt: null },
      { id: "far", expiresAt: at(TO_USE_DAYS + 1) },
      { id: "ok", expiresAt: at(TO_USE_DAYS) },
    ];
    const { shown } = toUseItems(items, daysUntil);
    expect(shown.map((i) => i.id)).toEqual(["ok"]);
    expect(toUseItems(undefined, daysUntil)).toEqual({ shown: [], soonest: [] });
  });

  it("puts leftovers about to expire first, and searches recipes with the rest", () => {
    const items = [
      { id: "milk", expiresAt: at(1) },
      { id: "chili", isLeftover: true, expiresAt: at(2) },
      { id: "soup", isLeftover: true, expiresAt: at(20) },
      { id: "eggs", expiresAt: at(4) },
    ];
    const { shown, soonest } = toUseItems(items, daysUntil);
    expect(shown.map((i) => i.id)).toEqual(["chili", "milk", "eggs", "soup"]);
    expect(soonest.map((i) => i.id)).toEqual(["milk", "eggs"]);
  });
});
