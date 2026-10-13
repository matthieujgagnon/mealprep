import { afterEach, describe, expect, it, vi } from "vitest";
import { leftoverExpiry, leftoverIsStale, leftoverItem, plannableLeftovers, thawPatch } from "./leftovers.js";
import { buildAddPayload, dateFromDays, expiryTag, lineForDays, useByKind } from "./inventoryForm.js";
import { daysUntil, formatExpiry } from "./pantryInventory.js";
import { toUseItems } from "./homeWeek.js";
import { quebecDay } from "./quebecDay.js";
import { setLang, t } from "../i18n/index.js";

afterEach(() => vi.useRealTimers());

// 9 a.m., 3 p.m. and 11 p.m. in Quebec on Oct 12, 2026. At 11 p.m. it is already Oct 13 in UTC.
const TIMES = [
  ["9 a.m.", "2026-10-12T13:00:00Z"],
  ["3 p.m.", "2026-10-12T19:00:00Z"],
  ["11 p.m.", "2026-10-13T03:00:00Z"],
];
const recipe = { id: "r", title: "Shawarma", fridgeLifeDays: 3 };

describe("a leftover's use-by is a Quebec calendar day", () => {
  it.each(TIMES)("put away at %s for the fridge's 4 days, it expires on the 16th", (_label, iso) => {
    const now = new Date(iso);
    expect(leftoverExpiry({}, "fridge", now)).toBe("2026-10-16");
    expect(leftoverExpiry(recipe, "fridge", now)).toBe("2026-10-15");
    expect(leftoverExpiry({}, "freezer", now)).toBe("2026-12-26");
    expect(thawPatch({}, now)).toMatchObject({ location: "fridge", expiresAt: "2026-10-16" });
    expect(leftoverItem({ ...recipe, fridgeLifeDays: 0 }, 2, "fridge", now).expiresAt).toBe("2026-10-16");
  });

  it.each(TIMES)("added by hand at %s, the saved date shows 4 days left, then 3, 2, 1 and 0 on the day", (_label, iso) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    // The Inventory form picks the date from Quebec's today and the server keeps a bare date as midnight UTC.
    const payload = buildAddPayload({ name: "Pizza", qtyText: "1", unit: "portion", location: "fridge", category: "Other", expiresAt: dateFromDays(4) });
    const saved = new Date(payload.expiresAt).toISOString();
    expect(daysUntil(saved)).toBe(4);
    // Each Quebec day later (at the same hour), one day fewer: 0 on the 16th itself, then past.
    for (const [later, left] of [[1, 3], [2, 2], [3, 1], [4, 0], [5, -1]]) {
      vi.setSystemTime(new Date(new Date(iso).getTime() + later * 86400000));
      expect(daysUntil(saved)).toBe(left);
    }
  });

  it("a leftover from the finished view keeps the same Quebec day however late it is put away", () => {
    const evening = leftoverItem({ id: "r", title: "Chili" }, 3, "fridge", new Date("2026-10-13T03:00:00Z"));
    expect(evening.expiresAt).toBe("2026-10-16");
    expect(quebecDay(new Date("2026-10-13T03:00:00Z"))).toBe("2026-10-12");
  });
});

describe("leftoverIsStale", () => {
  const entry = (weekStart, dayOfWeek) => ({ isLeftover: true, weekStart, dayOfWeek, recipe: { fridgeLifeDays: 4 } });

  it("is late only when the meal's day comes after the use-by day", () => {
    const item = { expiresAt: "2026-10-16" };
    expect(leftoverIsStale(entry("2026-10-12", 4), { item })).toBe(false); // Fri Oct 16, the use-by day itself
    expect(leftoverIsStale(entry("2026-10-12", 5), { item })).toBe(true); // Sat Oct 17
  });

  it("reads a use-by moment late in the Quebec evening as that Quebec day, not the next UTC day", () => {
    // 11 p.m. on Oct 16 in Quebec is 03:00 on Oct 17 in UTC.
    const item = { expiresAt: "2026-10-17T03:00:00.000Z" };
    expect(leftoverIsStale(entry("2026-10-12", 4), { item })).toBe(false); // Oct 16
    expect(leftoverIsStale(entry("2026-10-12", 5), { item })).toBe(true); // Oct 17: the 17th is already past the 16th
  });
});

describe("plannableLeftovers", () => {
  it("lists the soonest use-by day first, whether the date is a day or a moment", () => {
    const items = [
      { id: "a", name: "Pizza", isLeftover: true, quantity: 1, expiresAt: "2026-10-16T00:00:00.000Z" },
      { id: "b", name: "Chili", isLeftover: true, quantity: 2, expiresAt: "2026-10-17T03:00:00.000Z" }, // the 16th, 11 p.m. in Quebec
      { id: "c", name: "Soup", isLeftover: true, quantity: 1, expiresAt: "2026-10-15T00:00:00.000Z" },
    ];
    expect(plannableLeftovers(items, []).map((r) => r.item.id)).toEqual(["c", "a", "b"]);
  });
});

// The use-by day itself is not expired: it says "today", and only the next day is expired.
describe("on the use-by day itself", () => {
  const savedDay = "2026-10-16T00:00:00.000Z"; // use by the 16th, as a typed or picked day is saved
  const meal = (dayOfWeek) => ({ isLeftover: true, weekStart: "2026-10-12", dayOfWeek, recipe: { fridgeLifeDays: 4 } });

  afterEach(() => setLang("en"));

  it.each([
    ["9 a.m.", "2026-10-16T13:00:00Z"],
    ["11 p.m.", "2026-10-17T03:00:00Z"],
  ])("at %s Quebec time it is today, not expired, everywhere that counts days left", (_label, iso) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    const days = daysUntil(savedDay);
    expect(days).toBe(0);

    // The add form's tag, note and line, and Inventory's card (they all read these).
    expect(expiryTag(days)).toEqual({ kind: "today", tone: "hot" });
    // The life-left bar: a pink stub on the use-by day, not the full expired bar.
    expect(lineForDays(days)).toEqual({ color: "pink", height: "8%", width: "8%" });
    expect(useByKind({ days, custom: true, usda: false })).toBe("custom");
    expect(formatExpiry(savedDay)).toBe("Expires today");

    // Home's Use it up still lists it.
    expect(toUseItems([{ name: "Pizza", isLeftover: true, expiresAt: savedDay }], daysUntil).shown).toHaveLength(1);

    // The Planner's past-fridge-life check: a meal on the use-by day (Fri the 16th) is fine, the next day is late.
    expect(leftoverIsStale(meal(4), { item: { expiresAt: savedDay } })).toBe(false);
    expect(leftoverIsStale(meal(5), { item: { expiresAt: savedDay } })).toBe(true);
  });

  it("is the same for a use-by moment worked out from a time, at 9 a.m. and 11 p.m.", () => {
    // 5 p.m. on the 16th in Quebec.
    for (const iso of ["2026-10-16T13:00:00Z", "2026-10-17T03:00:00Z"]) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(iso));
      expect(daysUntil("2026-10-16T21:00:00.000Z")).toBe(0);
    }
  });

  it("is expired only from the next day, at 9 a.m. and at 11 p.m.", () => {
    for (const iso of ["2026-10-17T13:00:00Z", "2026-10-18T03:00:00Z"]) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(iso));
      const days = daysUntil(savedDay);
      expect(days).toBe(-1);
      expect(expiryTag(days).kind).toBe("expired");
      expect(lineForDays(days)).toEqual({ expired: true, color: "pink", height: "100%", width: "100%" });
      expect(toUseItems([{ name: "Pizza", expiresAt: savedDay }], daysUntil).shown).toHaveLength(0);
    }
  });

  it("says today in English and in Quebec French with the app's own wording", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T03:00:00Z")); // 11 p.m. on the 16th
    expect(formatExpiry(savedDay)).toBe("Expires today");
    expect(t("days.today")).toBe("Today");
    expect(t("home.todayBang")).toBe("today!");
    setLang("fr");
    expect(formatExpiry(savedDay)).toBe("Expire aujourd'hui");
    expect(t("days.today")).toBe("Aujourd'hui");
    expect(t("home.todayBang")).toBe("aujourd'hui!");
  });
});
