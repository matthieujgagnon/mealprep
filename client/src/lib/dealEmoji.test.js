import { describe, expect, it } from "vitest";
import { dealEmoji, foodEmoji } from "./dealEmoji.js";

describe("dealEmoji", () => {
  it("matches the item, in English or French", () => {
    expect(dealEmoji({ item: "Boneless chicken breasts" })).toBe("🍗");
    expect(dealEmoji({ item: "Citrons", matchName: "lemons" })).toBe("🍋");
    expect(dealEmoji({ item: "Pommes de terre jaunes" })).toBe("🥔");
    expect(dealEmoji({ item: "Pommes Gala" })).toBe("🍎");
  });

  it("falls back to the category, then a cart", () => {
    expect(dealEmoji({ item: "Tofu ferme", category: "protein" })).toBe("🍗");
    expect(dealEmoji({ item: "Paper towels", category: "other" })).toBe("🛒");
  });
});

describe("foodEmoji (Inventory cards)", () => {
  it("matches the name, then the USDA category, else nothing", () => {
    expect(foodEmoji("Cilantro", "Produce")).toBe("🌿");
    expect(foodEmoji("Frozen peas", "Food Purchased Frozen")).toBe("🫛");
    expect(foodEmoji("Chickpeas", "Grains, Beans & Pasta")).toBe("🫘");
    expect(foodEmoji("Pork taco leftovers", "Deli & Prepared Foods")).toBe("🍱");
    expect(foodEmoji("Bbq sauce", "Condiments, Sauces & Canned Goods")).toBe("🥫");
    expect(foodEmoji("Smoked paprika", "Shelf Stable Foods")).toBe("🌶️");
    expect(foodEmoji("Xylo mystery jar", "other")).toBe(null);
  });
});
