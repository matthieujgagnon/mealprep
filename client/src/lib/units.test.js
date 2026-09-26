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
