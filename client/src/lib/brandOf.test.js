import { describe, expect, it } from "vitest";
import { brandOf } from "./flyerIngredients.js";

describe("brandOf", () => {
  it("reads the brand from a flyer product name", () => {
    expect(brandOf({ item: "Maple Leaf bacon, 375 g" })).toBe("Maple Leaf");
    expect(brandOf({ item: "Poitrines de poulet désossées Maple Leaf, 500 g" })).toBe("Maple Leaf");
    expect(brandOf({ item: "Yogourt grec Oikos 650 g" })).toBe("Oikos");
  });

  it("writes a shouted or lower-case brand in the usual capitals", () => {
    expect(brandOf({ item: "MAPLE LEAF PRIME bacon" })).toBe("Maple Leaf Prime");
    expect(brandOf({ item: "olymel saucisses" })).toBe("Olymel");
    expect(brandOf({ item: "PC salmon fillets" })).toBe("PC");
  });

  it("is null when the name has no known brand", () => {
    expect(brandOf({ item: "Bananas" })).toBeNull();
    expect(brandOf({ item: "" })).toBeNull();
    expect(brandOf(null)).toBeNull();
  });
});
