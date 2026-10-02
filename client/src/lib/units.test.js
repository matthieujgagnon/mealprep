import { describe, expect, it } from "vitest";
import { convertIngredient, convertToUnit, getUnitClass, parseQuantityInput } from "./units.js";

describe("parseQuantityInput", () => {
  it("parses a plain decimal", () => {
    expect(parseQuantityInput("0.25")).toBe(0.25);
  });

  it("parses a whole number typed as a string", () => {
    expect(parseQuantityInput("2")).toBe(2);
  });

  it("parses a bare fraction", () => {
    expect(parseQuantityInput("1/4")).toBe(0.25);
  });

  it("parses a mixed number", () => {
    expect(parseQuantityInput("1 1/2")).toBe(1.5);
  });

  it("returns null for empty input", () => {
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("   ")).toBeNull();
    expect(parseQuantityInput(null)).toBeNull();
    expect(parseQuantityInput(undefined)).toBeNull();
  });

  it("returns null for unparseable text", () => {
    expect(parseQuantityInput("a bunch")).toBeNull();
  });

  it("returns null for a zero denominator instead of dividing by zero", () => {
    expect(parseQuantityInput("1/0")).toBeNull();
    expect(parseQuantityInput("1 1/0")).toBeNull();
  });
});

describe("getUnitClass", () => {
  it("classifies weight and volume units", () => {
    expect(getUnitClass("lb")).toBe("weight");
    expect(getUnitClass("g")).toBe("weight");
    expect(getUnitClass("cup")).toBe("volume");
    expect(getUnitClass("ml")).toBe("volume");
  });

  it("returns null for non-convertible units like 'clove' or 'pinch'", () => {
    expect(getUnitClass("clove")).toBeNull();
    expect(getUnitClass("pinch")).toBeNull();
    expect(getUnitClass(null)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(getUnitClass("LB")).toBe("weight");
  });
});

describe("convertToUnit", () => {
  it("converts within the same class", () => {
    expect(convertToUnit(1, "lb", "oz")).toBeCloseTo(16, 1);
    expect(convertToUnit(1000, "g", "kg")).toBe(1);
  });

  it("returns the same quantity when units already match", () => {
    expect(convertToUnit(3, "cup", "cup")).toBe(3);
  });

  it("returns null across classes (no density guessing)", () => {
    expect(convertToUnit(1, "cup", "lb")).toBeNull();
  });

  it("returns null for non-convertible units", () => {
    expect(convertToUnit(1, "clove", "g")).toBeNull();
  });

  it("returns null for missing inputs", () => {
    expect(convertToUnit(null, "g", "kg")).toBeNull();
    expect(convertToUnit(1, null, "kg")).toBeNull();
  });
});

describe("convertIngredient", () => {
  it("leaves quantity untouched when target is 'original'", () => {
    expect(convertIngredient(2, "cup", "original")).toEqual({ quantity: 2, unit: "cup", approximate: false });
  });

  it("converts weight to ounces exactly, marked not approximate", () => {
    const result = convertIngredient(1, "lb", "oz");
    expect(result.approximate).toBe(false);
    expect(result.quantity).toBeCloseTo(16, 1);
    expect(result.unit).toBe("oz");
  });

  it("converts volume to tbsp exactly, marked not approximate", () => {
    const result = convertIngredient(1, "cup", "tbsp");
    expect(result.approximate).toBe(false);
    expect(result.quantity).toBeCloseTo(16, 1);
  });

  it("marks a cross-class conversion (volume -> oz) as approximate", () => {
    const result = convertIngredient(1, "cup", "oz");
    expect(result.approximate).toBe(true);
  });

  it("leaves non-convertible units untouched", () => {
    expect(convertIngredient(2, "clove", "oz")).toEqual({ quantity: 2, unit: "clove", approximate: false });
  });
});

describe("unitLabel", () => {
  it("pluralizes count units and leaves abbreviations alone", async () => {
    const { unitLabel, UNIT_GROUPS } = await import("./units.js");
    expect(unitLabel("unit", 3)).toBe("units");
    expect(unitLabel("unit", 1)).toBe("unit");
    expect(unitLabel("bunch", 2)).toBe("bunches");
    expect(unitLabel("dozen", 2)).toBe("dozen");
    expect(unitLabel("g", 500)).toBe("g");
    expect(unitLabel("l", 2)).toBe("L");
    expect(unitLabel("fl_oz", 4)).toBe("fl oz");
    expect(UNIT_GROUPS[0].units[0]).toBe("unit");
  });
});

describe("inventory amounts in fractions", async () => {
  const { parseQuantityInput, formatFractionQuantity, pickFraction } = await import("./units.js");

  it("reads decimals, fractions, unicode fractions and mixed numbers", () => {
    expect(parseQuantityInput("0.25")).toBe(0.25);
    expect(parseQuantityInput("0,5")).toBe(0.5);
    expect(parseQuantityInput("1/2")).toBe(0.5);
    expect(parseQuantityInput("½")).toBe(0.5);
    expect(parseQuantityInput("1 1/2")).toBe(1.5);
    expect(parseQuantityInput("1½")).toBe(1.5);
    expect(parseQuantityInput("1 ½")).toBe(1.5);
    expect(parseQuantityInput("2 ⅓")).toBeCloseTo(2.333, 3);
    expect(parseQuantityInput("abc")).toBe(null);
    expect(parseQuantityInput("1/0")).toBe(null);
  });

  it("shows fractions where they fit, else up to 2 decimals", () => {
    expect(formatFractionQuantity(0.25)).toBe("¼");
    expect(formatFractionQuantity(1.5)).toBe("1 ½");
    expect(formatFractionQuantity(1 / 3)).toBe("⅓");
    expect(formatFractionQuantity(0.375)).toBe("⅜");
    expect(formatFractionQuantity(3)).toBe("3");
    expect(formatFractionQuantity(0.4)).toBe("0.4");
    expect(formatFractionQuantity(500)).toBe("500");
  });

  it("quick-picks a fraction on top of the whole part when that's bigger", () => {
    expect(pickFraction(2, 0.5)).toBe(2.5);
    expect(pickFraction(2.75, 0.5)).toBe(0.5);
    expect(pickFraction(0, 0.25)).toBe(0.25);
    expect(pickFraction(3.5, 1)).toBe(1);
  });
});
