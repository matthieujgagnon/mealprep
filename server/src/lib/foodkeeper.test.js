import { describe, expect, it } from "vitest";
import { findBestMatch, suggestLocation } from "./foodkeeper.js";

const matchName = (q) => findBestMatch(q)?.name;

describe("findBestMatch", () => {
  it("maps fresh produce to the fresh entry, not a derived product", () => {
    expect(matchName("lemon")).toMatch(/^Citrus fruit/);
    expect(matchName("lemons")).toMatch(/^Citrus fruit/);
    expect(matchName("lime")).toMatch(/^Citrus fruit/);
    expect(matchName("orange")).toMatch(/^Citrus fruit/);
    expect(matchName("onion")).toMatch(/^Onions/);
    expect(matchName("apple")).toBe("Apples");
    expect(matchName("avocado")).toBe("Avocados");
    expect(matchName("mushrooms")).toBe("Mushrooms");
    expect(matchName("potatoes")).toBe("Potatoes");
  });

  it("still finds the derived product when it's what was named", () => {
    expect(matchName("lemon juice")).toBe("Lemon juice");
    expect(matchName("dried mushrooms")).toBe("Mushrooms (dried)");
    expect(matchName("onion powder")).toMatch(/^Onion powder/);
  });

  it("keeps multi-word cuts on the plain product", () => {
    expect(matchName("chicken breast")).toMatch(/^Chicken parts/);
    expect(matchName("chicken thigh")).toMatch(/^Chicken parts/);
    expect(matchName("greek yogurt")).toBe("Yogurt");
    expect(matchName("ground beef")).toBe("Beef (ground)");
  });
});

describe("suggestLocation", () => {
  it("files items where they're kept", () => {
    expect(suggestLocation("rice")).toBe("pantry");
    expect(suggestLocation("canned tomatoes")).toBe("pantry");
    expect(suggestLocation("frozen peas")).toBe("freezer");
    expect(suggestLocation("chicken thighs")).toBe("fridge");
    expect(suggestLocation("lemons")).toBe("fridge");
    expect(suggestLocation("something unknown")).toBe("fridge");
  });
});

describe("everyday names", () => {
  it("matches entries whose only keyword is a phrase", () => {
    expect(matchName("cream cheese")).toBe("Cream cheese");
    expect(matchName("chicken stock")).toMatch(/^Chicken broth/);
  });

  it("maps common names the USDA data files differently", () => {
    expect(matchName("feta")).toMatch(/^Cheese \(soft/);
    expect(matchName("mango")).toMatch(/^Papaya, mango/);
    expect(matchName("sugar")).toBeUndefined();
    expect(suggestLocation("sugar")).toBe("pantry");
  });

  it("uses the food's own freezer guidance for frozen items", () => {
    expect(matchName("frozen peas")).toMatch(/^Beans and peas/);
    expect(matchName("frozen shrimp")).toMatch(/^Shrimp/);
    expect(suggestLocation("frozen peas")).toBe("freezer");
  });
});
