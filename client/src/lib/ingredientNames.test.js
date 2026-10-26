import { describe, expect, it } from "vitest";
import { canonicalize, singularize } from "./ingredientNames.js";

// The singular of an English plural, for grouping and matching only.

describe("singularize", () => {
  it("takes the plural off a word that ends in e: cheeses, limes, sizes, bases", () => {
    for (const [plural, one] of Object.entries({ cheeses: "cheese", limes: "lime", sizes: "size", bases: "base", olives: "olive", flakes: "flake", grapes: "grape" })) {
      expect(singularize(plural), plural).toBe(one);
    }
  });

  it("takes -es off a real sibilant ending", () => {
    for (const [plural, one] of Object.entries({ glasses: "glass", boxes: "box", peaches: "peach", radishes: "radish", tomatoes: "tomato", potatoes: "potato" })) {
      expect(singularize(plural), plural).toBe(one);
    }
  });

  it("turns -ies into -y, except for the few foods whose singular ends in -ie", () => {
    for (const [plural, one] of Object.entries({ cherries: "cherry", berries: "berry", anchovies: "anchovy", cookies: "cookie", brownies: "brownie", smoothies: "smoothie" })) {
      expect(singularize(plural), plural).toBe(one);
    }
  });

  it("leaves a word that ends in s in the singular alone", () => {
    for (const word of ["asparagus", "hummus", "couscous", "watercress", "bass"]) expect(singularize(word), word).toBe(word);
  });

  it("makes a name and its plural one core", () => {
    for (const [one, many] of [["cheese", "cheeses"], ["cookie", "cookies"], ["lime", "limes"], ["cherry", "cherries"]]) {
      expect(canonicalize(many).core, many).toBe(canonicalize(one).core);
    }
  });
});
