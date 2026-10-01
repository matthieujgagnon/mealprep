import { describe, expect, it } from "vitest";
import { buildIngredients, ingredientKeyOf, sliceIngredients, splitBilingual, RANKS } from "./flyerIngredients.js";

const deal = (id, store, item, unitPrice, unitBasis = "each", extra = {}) => ({
  id,
  store,
  item,
  matchName: item.toLowerCase(),
  price: `$${unitPrice}`,
  unitPrice,
  unitBasis,
  aisle: "produce",
  ...extra,
});

describe("splitBilingual", () => {
  it("splits English | French names", () => {
    expect(splitBilingual("Kiwis | kiwis")).toEqual({ en: "Kiwis", fr: "kiwis" });
    expect(splitBilingual("Bananas")).toEqual({ en: "Bananas", fr: null });
  });
});

describe("ingredientKeyOf", () => {
  it("drops brand, size and filler words", () => {
    expect(ingredientKeyOf({ item: "Maple Leaf Bacon, 375 g" })).toBe("bacon");
    expect(ingredientKeyOf({ item: "Fresh boneless chicken breasts" })).toBe("chicken breast");
    expect(ingredientKeyOf({ item: "Bananas | bananes importées" })).toBe("banana");
  });
});

describe("buildIngredients", () => {
  const today = new Date(2026, 9, 1);
  const deals = [
    deal(1, "Metro", "Bananas | bananes", 0.89, "lb", { validUntil: "2026-10-03" }),
    deal(2, "Super C", "Bananas", 0.79, "lb", { imageUrl: "https://x/b.jpg" }),
    deal(3, "Maxi", "Bananas", 0.84, "lb"),
    deal(4, "Metro", "Maple Leaf bacon, 375 g", 5.99, "each", { aisle: "meat" }),
    deal(5, "Super C", "Bacon", 4.99, "each", { aisle: "meat", sixMonthLow: 4.99, sixMonthHigh: 7.99 }),
    deal(6, "Metro", "Peanut butter", 3.99, "each", { aisle: "pantry" }),
    deal(7, "Metro", "Butter", 4.49, "each", { aisle: "dairy" }),
  ];
  const list = buildIngredients(deals, { storeOrder: ["Metro", "Super C", "Maxi"], today });
  const byKey = Object.fromEntries(list.map((g) => [g.key, g]));

  it("groups the same ingredient across stores, with each store's tile", () => {
    const bananas = byKey.banana;
    expect(bananas.name).toBe("Bananas");
    expect(bananas.sub).toBe("bananes");
    expect(bananas.tiles.map((d) => d.store)).toEqual(["Metro", "Super C", "Maxi"]);
    expect(bananas.best.store).toBe("Super C");
    expect(bananas.lo).toBe(0.79);
    expect(bananas.gap).toBeCloseTo(0.1 / 0.89, 5);
    expect(bananas.photoDeal.id).toBe(2);
    expect(bananas.endsIn).toBe(2);
  });

  it("puts branded bacon with bacon but keeps peanut butter apart from butter", () => {
    expect(byKey.bacon.variants.map((d) => d.id)).toEqual([5, 4]);
    expect(byKey["peanut butter"].variants).toHaveLength(1);
    expect(byKey.butter.variants).toHaveLength(1);
  });

  it("scores by range position and store gap", () => {
    expect(byKey.bacon.t).toBe(0);
    expect(byKey.bacon.score).toBeCloseTo(0.6 + 0.4 * (1 / 5.99), 5);
    expect(byKey.butter.score).toBe(0);
    expect([...list].sort(RANKS.best.sort)[0].key).toBe("bacon");
  });

  it("keeps only one store's prices when a store is picked", () => {
    const superC = buildIngredients(deals, { store: "Super C", today });
    expect(superC.map((g) => g.key).sort()).toEqual(["bacon", "banana"]);
    expect(superC.find((g) => g.key === "banana").gap).toBe(0);
  });

  it("slices by aisle, by end date and by freezing", () => {
    const aisles = [
      { id: "produce", label: "Fruits & vegetables" },
      { id: "meat", label: "Meat & poultry" },
      { id: "dairy", label: "Dairy & eggs" },
      { id: "pantry", label: "Pantry" },
    ];
    expect(sliceIngredients(list, "category", aisles).map((g) => g.name)).toEqual([
      "Fruits & vegetables",
      "Meat & poultry",
      "Dairy & eggs",
      "Pantry",
    ]);
    expect(sliceIngredients(list, "ends", aisles)[0]).toMatchObject({ name: "Ends within 2 days" });
    expect(sliceIngredients(list, "freeze", aisles).map((g) => g.name)).toEqual(["Eat fresh"]);
  });

  it("compares a bag with loose apples per lb, not $5.99 against 99 cents", () => {
    const apples = buildIngredients(
      [
        deal(20, "Metro", "McIntosh apples, 3 lb bag", 5.99, "each", { comparePrice: 2.0, compareBasis: "lb" }),
        deal(21, "Super C", "McIntosh apples", 0.99, "lb"),
      ],
      { storeOrder: ["Metro", "Super C"], today }
    )[0];
    expect(apples.mainBasis).toBe("lb");
    expect(apples.best.store).toBe("Super C");
    expect(apples.lo).toBe(0.99);
    expect(apples.hi).toBe(2.0);
    expect(apples.gap).toBeCloseTo((2.0 - 0.99) / 2.0, 5);
  });
});
