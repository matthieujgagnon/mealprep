import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOVED_KEEP_DAYS, snapshotOf, stillKept } from "./removedItems.js";

describe("Recently removed", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps an item 7 Quebec days, counted in Quebec days not hours", () => {
    expect(REMOVED_KEEP_DAYS).toBe(7);
    // Removed Oct 13 at 11 p.m. in Quebec (already Oct 14 in UTC).
    const removedAt = new Date("2026-10-14T03:00:00Z");
    expect(stillKept(removedAt, new Date("2026-10-20T15:00:00Z"))).toBe(true);
    // Oct 20 at 11:30 p.m. in Quebec: still the 7th day.
    expect(stillKept(removedAt, new Date("2026-10-21T03:30:00Z"))).toBe(true);
    // Oct 21 in Quebec: gone.
    expect(stillKept(removedAt, new Date("2026-10-21T04:30:00Z"))).toBe(false);
  });

  it("copies the row as plain JSON, dates as ISO strings and missing fields as null", () => {
    const row = {
      id: "abc",
      userId: "u1",
      name: "Milk 2%",
      core: "milk 2%",
      category: "Dairy Products & Eggs",
      quantity: 0.5,
      unit: "l",
      location: "fridge",
      purchasedAt: new Date("2026-10-10T12:00:00Z"),
      expiresAt: new Date("2026-10-16T00:00:00Z"),
      imageUrl: undefined,
      isLeftover: false,
      createdAt: new Date("2026-10-10T12:00:00Z"),
    };
    expect(snapshotOf(row)).toEqual({
      id: "abc",
      name: "Milk 2%",
      core: "milk 2%",
      category: "Dairy Products & Eggs",
      quantity: 0.5,
      unit: "l",
      location: "fridge",
      shelf: null,
      purchasedAt: "2026-10-10T12:00:00.000Z",
      expiresAt: "2026-10-16T00:00:00.000Z",
      imageUrl: null,
      isLeftover: false,
      isPreparedMeal: null,
      recipeId: null,
      createdAt: "2026-10-10T12:00:00.000Z",
    });
  });

  it("keeps both where it was kept and which shelf it was on, so Put back brings back both", () => {
    expect(snapshotOf({ id: "i", name: "Lasagna", location: "freezer", shelf: "prepared" })).toMatchObject({ location: "freezer", shelf: "prepared" });
  });

  it("keeps the Prepared meal flag, so Put back brings a tagged lasagna back tagged", () => {
    expect(snapshotOf({ id: "lasagna", name: "Lasagna", isPreparedMeal: true }).isPreparedMeal).toBe(true);
  });
});
