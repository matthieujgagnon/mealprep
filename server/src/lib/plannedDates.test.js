import { describe, expect, it } from "vitest";
import { mondayKey, plannedDays, validKey } from "./plannedDates.js";

describe("plannedDays", () => {
  const meal = (weekStart, dayOfWeek, mealType, title, isPlaceholder = false, extra = {}) => ({
    weekStart,
    dayOfWeek,
    mealType,
    isLeftover: extra.isLeftover || false,
    recipe: { title, isPlaceholder, photoUrl: extra.photoUrl },
  });

  it("lists each planned day with its meals in breakfast, lunch, supper order", () => {
    const entries = [
      meal("2026-10-05", 1, "dinner", "Soup", false, { photoUrl: "/photos/soup.jpg", isLeftover: true }),
      meal("2026-10-05", 1, "breakfast", "Oats"),
      meal("2026-10-05", 0, "lunch", "No meal planned", true),
      meal("2026-11-02", 0, "lunch", "Outside"),
    ];
    expect(plannedDays(entries, "2026-10-05", "2026-10-31")).toEqual([
      { date: "2026-10-05", meals: [{ mealType: "lunch", title: "No meal planned", placeholder: true, photoUrl: null, isLeftover: false, prepared: false }] },
      {
        date: "2026-10-06",
        meals: [
          { mealType: "breakfast", title: "Oats", placeholder: false, photoUrl: null, isLeftover: false, prepared: false },
          { mealType: "dinner", title: "Soup", placeholder: false, photoUrl: "/photos/soup.jpg", isLeftover: true, prepared: false },
        ],
      },
    ]);
  });

  it("says a planned meal is a prepared meal: by the Inventory item it eats, or by its note's name", () => {
    const planned = (dayOfWeek, title, extra) => ({
      weekStart: "2026-10-05",
      dayOfWeek,
      mealType: "dinner",
      isLeftover: true,
      recipe: { title, isPlaceholder: true },
      ...extra,
    });
    const entries = [
      planned(0, "Whatever it was renamed", { leftoverItemId: "lasagna" }),
      planned(1, "Plat préparé · Pierogi", { leftoverItemId: "gone" }),
      planned(2, "Prepared meal · Tourtière"),
      planned(3, "Leftovers · pizza", { leftoverItemId: "pizza" }),
      planned(4, "Plat préparé · Not a leftover", { isLeftover: false }),
    ];
    const days = plannedDays(entries, "2026-10-05", "2026-10-11", new Map([["lasagna", { isPreparedMeal: true, imageUrl: null }], ["pizza", { isPreparedMeal: false, imageUrl: null }]]));
    expect(days.map((d) => d.meals[0].prepared)).toEqual([true, true, true, false, false]);
  });

  it("shows a planned prepared meal's photo live from its Inventory item, and the entry's copy once the item is gone", () => {
    const planned = (dayOfWeek, extra) => ({
      weekStart: "2026-10-05",
      dayOfWeek,
      mealType: "dinner",
      isLeftover: true,
      recipe: { title: "Plat préparé · Lasagne", isPlaceholder: true, photoUrl: null },
      ...extra,
    });
    const linked = new Map([
      ["lasagna", { isPreparedMeal: true, imageUrl: "/api/recipe-images/new-photo" }],
      ["nopic", { isPreparedMeal: true, imageUrl: "none" }],
      ["bare", { isPreparedMeal: true, imageUrl: null }],
    ]);
    const entries = [
      planned(0, { leftoverItemId: "lasagna", photoUrl: "/api/recipe-images/old-copy" }), // live wins over the copy
      planned(1, { leftoverItemId: "gone", photoUrl: "/api/recipe-images/old-copy" }), // item gone: the copy
      planned(2, { leftoverItemId: "gone" }), // item gone, no copy: no photo
      planned(3, { leftoverItemId: "nopic", photoUrl: "/api/recipe-images/old-copy" }), // item has no picture: none, not the stale copy
      planned(4, { leftoverItemId: "bare", photoUrl: "/api/recipe-images/old-copy" }),
    ];
    const days = plannedDays(entries, "2026-10-05", "2026-10-11", linked);
    expect(days.map((d) => d.meals[0].photoUrl)).toEqual(["/api/recipe-images/new-photo", "/api/recipe-images/old-copy", null, null, null]);
  });

  it("keeps a real recipe's own photo on a leftover that has one", () => {
    const entries = [
      { weekStart: "2026-10-05", dayOfWeek: 0, mealType: "dinner", isLeftover: true, leftoverItemId: "chili", photoUrl: null, recipe: { title: "Chili", isPlaceholder: false, photoUrl: "/photos/chili.jpg" } },
    ];
    const linked = new Map([["chili", { isPreparedMeal: false, imageUrl: "/api/recipe-images/item" }]]);
    expect(plannedDays(entries, "2026-10-05", "2026-10-11", linked)[0].meals[0].photoUrl).toBe("/photos/chili.jpg");
  });

  it("shows one thing per slot", () => {
    const entries = [meal("2026-10-05", 0, "lunch", "A"), meal("2026-10-05", 0, "lunch", "B")];
    expect(plannedDays(entries, "2026-10-05", "2026-10-11")[0].meals).toHaveLength(1);
  });
});

describe("dates", () => {
  it("knows a real date and the Monday of its week", () => {
    expect(validKey("2026-02-31")).toBeNull();
    expect(validKey("nope")).toBeNull();
    expect(mondayKey("2026-10-04")).toBe("2026-09-28"); // a Sunday
    expect(mondayKey("2026-10-05")).toBe("2026-10-05"); // a Monday
  });
});
