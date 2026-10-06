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
      { date: "2026-10-05", meals: [{ mealType: "lunch", title: "No meal planned", placeholder: true, photoUrl: null, isLeftover: false }] },
      {
        date: "2026-10-06",
        meals: [
          { mealType: "breakfast", title: "Oats", placeholder: false, photoUrl: null, isLeftover: false },
          { mealType: "dinner", title: "Soup", placeholder: false, photoUrl: "/photos/soup.jpg", isLeftover: true },
        ],
      },
    ]);
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
