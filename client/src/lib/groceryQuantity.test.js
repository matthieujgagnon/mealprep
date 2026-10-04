import { describe, expect, it } from "vitest";
import { cleanQuantityTyping, defaultQuantity, displayQuantity, inventoryAmount, isCountUnit, ownAmount, quantityToSave } from "./groceryQuantity.js";

const recipeItem = (parts, extra = {}) => ({ name: "x", parts, usedIn: ["Tacos"], ...extra });
const manual = (quantity, extra = {}) => ({ name: "x", isManual: true, parts: [{ quantity, unit: null }], quantity, usedIn: [], ...extra });

describe("how many to buy", () => {
  it("starts at the recipe's number when it counts things, else at 1", () => {
    expect(defaultQuantity(recipeItem([{ quantity: 3, unit: "can" }]))).toBe("3");
    expect(defaultQuantity(recipeItem([{ quantity: 4, unit: null }]))).toBe("4");
    expect(defaultQuantity(recipeItem([{ quantity: 350, unit: "g" }]))).toBe("1");
    expect(defaultQuantity(recipeItem([{ quantity: 750, unit: "ml" }]))).toBe("1");
    expect(defaultQuantity(recipeItem([{ quantity: 1, unit: "cup" }, { quantity: 2, unit: "tbsp" }]))).toBe("1");
    expect(defaultQuantity(recipeItem([{ quantity: null, unit: null }]))).toBe("1");
  });

  it("a hand-added item starts at its own number, or 1", () => {
    expect(defaultQuantity(manual(2))).toBe("2");
    expect(defaultQuantity(manual(null))).toBe("1");
    expect(defaultQuantity(manual(0.5))).toBe("1/2");
  });

  it("shows your number when you've set one, even from an older amount with a unit", () => {
    expect(displayQuantity(recipeItem([{ quantity: 350, unit: "g" }], { customQuantity: "3" }))).toBe("3");
    expect(displayQuantity(recipeItem([{ quantity: 350, unit: "g" }], { customQuantity: "2 packs" }))).toBe("2");
    expect(displayQuantity(recipeItem([{ quantity: 350, unit: "g" }], { customQuantity: "1/2" }))).toBe("1/2");
    expect(displayQuantity(recipeItem([{ quantity: 350, unit: "g" }]))).toBe("1");
  });

  it("splits an older amount into its number and its unit text", () => {
    expect(ownAmount("2 packs")).toEqual({ text: "2", quantity: 2, unitText: "packs" });
    expect(ownAmount("1,5 kg")).toMatchObject({ quantity: 1.5, unitText: "kg" });
    expect(ownAmount("a few")).toBeNull();
    expect(ownAmount(null)).toBeNull();
  });

  it("knows a counted unit from a measured one", () => {
    for (const u of [null, "", "can", "box", "bunch", "unit", "head", "dozen"]) expect(isCountUnit(u), String(u)).toBe(true);
    for (const u of ["g", "kg", "ml", "l", "cup", "tbsp", "lb", "oz", "pinch"]) expect(isCountUnit(u), u).toBe(false);
  });
});

describe("saving what you typed", () => {
  const item = recipeItem([{ quantity: 350, unit: "g" }]);
  it("saves a number, and nothing when it's the starting number", () => {
    expect(quantityToSave("3", item)).toBe("3");
    expect(quantityToSave(" 1/2 ", item)).toBe("1/2");
    expect(quantityToSave("1", item)).toBeNull();
    expect(quantityToSave("", item)).toBeNull();
  });
  it("won't take what isn't a number", () => {
    expect(quantityToSave("two", item)).toBeUndefined();
    expect(quantityToSave("0", item)).toBeUndefined();
    expect(quantityToSave("3 g", item)).toBeUndefined();
  });
  it("lets only digits, a point, a comma and a slash be typed", () => {
    expect(cleanQuantityTyping("3 boîtes")).toBe("3");
    expect(cleanQuantityTyping("1/2")).toBe("1/2");
    expect(cleanQuantityTyping("abc")).toBe("");
  });
});

describe("what goes to the Inventory sheet", () => {
  it("is the recipe quantity, as before, when you haven't set your own", () => {
    expect(inventoryAmount(recipeItem([{ quantity: 350, unit: "g" }]))).toEqual({ quantity: 350, unit: "g" });
    expect(inventoryAmount(manual(2))).toEqual({ quantity: 2, unit: null });
  });
  it("keeps an older own amount with its unit", () => {
    expect(inventoryAmount(recipeItem([{ quantity: 350, unit: "g" }], { customQuantity: "2 packs" }))).toEqual({ quantity: 2, unit: "packs" });
  });
  it("uses your number with the recipe's unit when the recipe counts things", () => {
    expect(inventoryAmount(recipeItem([{ quantity: 3, unit: "can" }], { customQuantity: "4" }))).toEqual({ quantity: 4, unit: "can" });
    expect(inventoryAmount(manual(null, { customQuantity: "3" }))).toEqual({ quantity: 3, unit: null });
  });
  it("keeps the recipe quantity when it's a weight or a volume, whatever number you typed", () => {
    expect(inventoryAmount(recipeItem([{ quantity: 350, unit: "g" }], { customQuantity: "2" }))).toEqual({ quantity: 350, unit: "g" });
  });
});
