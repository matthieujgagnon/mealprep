import { describe, expect, it } from "vitest";
import {
  buildAddPayload,
  buildEditPatch,
  commitQuantity,
  dateFromDays,
  daysFromDate,
  expiryTag,
  fallbackDays,
  lineForDays,
  qtyStep,
  startDays,
  stepQuantity,
  useByKind,
} from "./inventoryForm.js";

const TODAY = new Date(2026, 9, 4); // Oct 4, 2026

describe("dates and days", () => {
  it("goes between days from today and a date", () => {
    expect(dateFromDays(14, TODAY)).toBe("2026-10-18");
    expect(dateFromDays(30, TODAY)).toBe("2026-11-03");
    expect(daysFromDate("2026-10-18", TODAY)).toBe(14);
    expect(daysFromDate("2026-10-03", TODAY)).toBe(-1);
    expect(daysFromDate("", TODAY)).toBeNull();
  });
});

describe("how long a food lasts", () => {
  it("uses USDA's middle figure when there is one, else a rough guess for the shelf", () => {
    expect(startDays({ defaultDays: 10.5 }, "fridge")).toEqual({ days: 11, usda: true });
    expect(startDays(null, "fridge")).toEqual({ days: 14, usda: false });
    expect(startDays(null, "freezer")).toEqual({ days: 90, usda: false });
    expect(startDays(null, "pantry")).toEqual({ days: 180, usda: false });
    expect(fallbackDays("a-shelf-of-your-own")).toBe(180);
  });

  it("says which sentence goes under the chips", () => {
    expect(useByKind({ days: null, custom: false, usda: true })).toBe("none");
    expect(useByKind({ days: 0, custom: false, usda: true })).toBe("expired");
    expect(useByKind({ days: 5, custom: true, usda: true })).toBe("custom");
    expect(useByKind({ days: 5, custom: false, usda: true })).toBe("usda");
    expect(useByKind({ days: 5, custom: false, usda: false })).toBe("rough");
  });
});

describe("the amount", () => {
  it("steps by 50 for g and ml, a quarter for bottles and loaves, else 1, never below 0", () => {
    expect(qtyStep("g")).toBe(50);
    expect(qtyStep("ml")).toBe(50);
    expect(qtyStep("loaf")).toBe(0.25);
    expect(qtyStep("each")).toBe(1);
    expect(stepQuantity("1", "each", 1)).toBe("2");
    expect(stepQuantity("0", "each", -1)).toBe("0");
    expect(stepQuantity("250", "g", -1)).toBe("200");
    expect(stepQuantity("1/2", "loaf", 1)).toBe("¾");
    expect(stepQuantity("", "each", 1)).toBe("1");
  });

  it("takes decimals and fractions, and puts back what it can't read", () => {
    expect(commitQuantity("0.25", "1")).toBe("¼");
    expect(commitQuantity("1 1/2", "1")).toBe("1 ½");
    expect(commitQuantity("1½", "1")).toBe("1 ½");
    expect(commitQuantity("2,5", "1")).toBe("2 ½");
    expect(commitQuantity("2,3", "1")).toBe("2.3");
    expect(commitQuantity("abc", "3")).toBe("3");
    expect(commitQuantity("-2", "3")).toBe("3");
  });
});

describe("the preview", () => {
  it("tags how soon it expires", () => {
    expect(expiryTag(null)).toEqual({ kind: "none", tone: "none" });
    expect(expiryTag(0)).toEqual({ kind: "expired", tone: "hot" });
    expect(expiryTag(1)).toEqual({ kind: "tomorrow", tone: "hot" });
    expect(expiryTag(2)).toEqual({ kind: "days", count: 2, tone: "hot" });
    expect(expiryTag(7)).toEqual({ kind: "days", count: 7, tone: "warn" });
    expect(expiryTag(27)).toEqual({ kind: "days", count: 27, tone: "plain" });
    expect(expiryTag(59)).toEqual({ kind: "days", count: 59, tone: "plain" });
    expect(expiryTag(90)).toEqual({ kind: "months", count: 3, tone: "plain" });
  });

  it("draws the line like the shelf card: fuller as it nears, pink, yellow, blue, none from 28 days", () => {
    expect(lineForDays(null)).toBeNull();
    expect(lineForDays(28)).toBeNull();
    expect(lineForDays(0)).toEqual({ expired: true });
    expect(lineForDays(14)).toEqual({ height: "50%", color: "blue" });
    expect(lineForDays(3)).toEqual({ height: "89%", color: "pink" });
    expect(lineForDays(7)).toEqual({ height: "75%", color: "yellow" });
  });
});

describe("what gets saved", () => {
  it("builds the new item", () => {
    expect(buildAddPayload({ name: " Milk ", qtyText: "1 1/2", unit: "L", location: "fridge", category: "Dairy", expiresAt: "2026-10-18", photo: "" })).toEqual({
      name: "Milk", quantity: 1.5, unit: "L", location: "fridge", category: "Dairy", expiresAt: "2026-10-18",
    });
    const bare = buildAddPayload({ name: "Rice", qtyText: "", unit: "", location: "pantry", category: "", expiresAt: "", photo: "https://x.test/a.png" });
    expect(bare).toMatchObject({ quantity: 1, unit: null, category: "Other", expiresAt: null, imageUrl: "https://x.test/a.png" });
  });

  it("sends only what changed", () => {
    const item = { name: "Milk", quantity: 1, unit: "L", location: "fridge", expiresAt: "2026-10-18T00:00:00.000Z", imageUrl: null };
    const same = { name: "Milk", qtyText: "1", unit: "L", location: "fridge", expiresAt: "2026-10-18", photo: null };
    expect(buildEditPatch(item, same)).toEqual({});
    expect(buildEditPatch(item, { ...same, name: "Oat milk", qtyText: "½", location: "freezer", expiresAt: "", photo: "/api/recipe-images/a1" })).toEqual({
      name: "Oat milk", quantity: 0.5, location: "freezer", expiresAt: null, imageUrl: "/api/recipe-images/a1",
    });
  });
});
