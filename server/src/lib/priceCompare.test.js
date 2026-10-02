import { describe, expect, it } from "vitest";
import { comparablePrice, packageSize, productWords } from "./priceCompare.js";
import { withPriceHistory } from "../routes/deals.js";

const NOW = new Date("2026-09-30T12:00:00Z");
const weeksAgo = (n) => new Date(NOW.getTime() - n * 7 * 24 * 60 * 60 * 1000);

describe("package sizes and comparable prices", () => {
  it("reads weights, volumes, multipacks and ranges", () => {
    expect(packageSize("Butter, 454 g")).toEqual({ grams: 454 });
    expect(packageSize("Milk 2%, 4 L")).toEqual({ ml: 4000 });
    expect(packageSize("Coca-Cola, 12 × 355 mL")).toEqual({ ml: 4260 });
    expect(packageSize("Superfries, 650–750 g")).toEqual({ grams: 700 });
    expect(packageSize("Seedless navel oranges (3 lb)").grams).toBeCloseTo(1360.8, 0);
    expect(packageSize("Lemons")).toBeNull();
  });

  it("turns a pack price into per lb or per L", () => {
    expect(comparablePrice({ item: "Butter, 454 g", unitPrice: 4.99, unitBasis: "each" })).toEqual({ price: 4.99, basis: "lb" });
    expect(comparablePrice({ item: "Milk, 4 L", unitPrice: 6.29, unitBasis: "each" })).toEqual({ price: 1.57, basis: "L" });
    expect(comparablePrice({ item: "Chicken thighs", unitPrice: 3.49, unitBasis: "lb" })).toEqual({ price: 3.49, basis: "lb" });
    expect(comparablePrice({ item: "Cucumbers", unitPrice: 1, unitBasis: "each" })).toEqual({ price: 1, basis: "each" });
  });

  it("prices a counted bag per item, but not a carton of eggs", () => {
    expect(comparablePrice({ item: "SAC D'AVOCATS DÉLICES DU MARCHÉ, 5 UN. | FARMER'S MARKET™ AVOCADO BAG", unitPrice: 4.5, unitBasis: "each" })).toEqual({ price: 0.9, basis: "each" });
    expect(comparablePrice({ item: "mini concombres | mini cucumbers, 6 un. bag", unitPrice: 2.99, unitBasis: "each" })).toEqual({ price: 0.5, basis: "each" });
    expect(comparablePrice({ item: "GROS ŒUFS BLANCS SANS NOM®, 12 UN.", unitPrice: 3.99, unitBasis: "each" })).toEqual({ price: 3.99, basis: "each" });
  });

  it("names a product without brand, size or plurals", () => {
    expect(productWords("PC Black Label Salmon Fillets, 400 g")).toEqual(["fillet", "salmon"]);
    expect(productWords("Seedless Navel Oranges (3 lb)")).toEqual(["navel", "orange", "seedless"]);
  });
});

describe("price comparisons from day one", () => {
  const deal = { id: "d", store: "Metro", item: "PC salmon fillets, 454 g", matchName: "salmon fillets", unitPrice: 7.99, unitBasis: "each" };

  it("uses the same product at other stores when this store has no history", () => {
    const history = [
      { store: "Maxi", matchName: "Atlantic salmon fillets", item: "x", unitPrice: 11.99, unitBasis: "lb", createdAt: weeksAgo(6) },
      { store: "IGA", matchName: "salmon fillets", item: "x", unitPrice: 9.99, unitBasis: "lb", createdAt: weeksAgo(2) },
      { ...deal, createdAt: NOW },
    ];
    const [out] = withPriceHistory([deal], history, NOW);
    expect(out).toMatchObject({ isNew: false, rangeSource: "stores", comparePrice: 7.98, compareBasis: "lb", sixMonthLow: 7.98, sixMonthHigh: 9.99 });
  });

  it("falls back to Statistics Canada's last six months for Quebec", () => {
    const steak = { id: "s", store: "Metro", item: "Beef striploin steak", matchName: "beef striploin steak", unitPrice: 9.99, unitBasis: "lb" };
    const baselines = [
      {
        product: "Beef striploin cuts, per kilogram",
        item: "beef striploin cuts",
        unitBasis: "lb",
        price: 14.5,
        month: "2026-08",
        history: ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((month, i) => ({ month, price: 13 + i * 0.3 })),
      },
      { product: "Ground beef, per kilogram", item: "ground beef", unitBasis: "lb", price: 7, month: "2026-08", history: [{ month: "2026-07", price: 7 }, { month: "2026-08", price: 7.2 }] },
    ];
    const [out] = withPriceHistory([steak], [steak], NOW, baselines);
    // "Beef striploin cuts" stands for any striploin cut, steaks included.
    expect(out).toMatchObject({ isNew: false, rangeSource: "quebec", rangeProduct: "Beef striploin cuts, per kilogram", sixMonthLow: 13, sixMonthHigh: 14.5 });
    expect(out.history).toHaveLength(6);
  });

  it("never borrows another product's prices", () => {
    const rows = (matchName, price, weeks) => weeks.map((w) => ({ store: "Maxi", matchName, item: matchName, unitPrice: price, unitBasis: "lb", createdAt: weeksAgo(w) }));
    const history = [...rows("chicken", 3.49, [2, 5]), ...rows("chicken breasts", 6.99, [3, 6]), ...rows("salmon", 9.99, [2, 4])];
    const pie = { id: "p", store: "Metro", item: "PÂTÉ AU POULET", matchName: "chicken pie", unitPrice: 5.99, unitBasis: "lb" };
    const breasts = { id: "b", store: "Metro", item: "x", matchName: "boneless chicken breasts", unitPrice: 4.99, unitBasis: "lb" };
    const fillets = { id: "f", store: "Metro", item: "x", matchName: "salmon fillets", unitPrice: 8.99, unitBasis: "lb" };
    const [p, b, f] = withPriceHistory([pie, breasts, fillets], history, NOW);
    expect(p.isNew).toBe(true);
    expect(b).toMatchObject({ rangeSource: "stores", sixMonthHigh: 6.99 });
    expect(f.isNew).toBe(true);
  });

  it("stays new when nothing compares", () => {
    const odd = { id: "o", store: "Metro", item: "Dragon fruit", matchName: "dragon fruit", unitPrice: 3, unitBasis: "each" };
    const [out] = withPriceHistory([odd], [odd], NOW, []);
    expect(out.isNew).toBe(true);
    expect(out.rangeSource).toBeUndefined();
  });
});

describe("bag vs loose", () => {
  it("prices a sized bag per lb, so it lines up with a per-lb price", () => {
    expect(comparablePrice({ item: "McIntosh Apples, 3 lb bag", unitPrice: 5.99, unitBasis: "each" })).toEqual({ price: 2.0, basis: "lb" });
    expect(comparablePrice({ item: "McIntosh Apples", unitPrice: 0.99, unitBasis: "lb" })).toEqual({ price: 0.99, basis: "lb" });
    // Without a size, a bag can't be compared with a per-lb price at all.
    expect(comparablePrice({ item: "McIntosh Apples, bag", unitPrice: 5.99, unitBasis: "each" })).toEqual({ price: 5.99, basis: "each" });
  });
});
