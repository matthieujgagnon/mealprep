import { describe, expect, it } from "vitest";
import { dealEmoji } from "./dealEmoji.js";

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
