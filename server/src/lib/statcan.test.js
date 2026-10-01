import { describe, expect, it } from "vitest";
import {
  compareToBaseline,
  coordinate,
  fetchQuebecPrices,
  findBaseline,
  parseProductName,
  readCubeMetadata,
} from "./statcan.js";
import { attachBaselines } from "../routes/deals.js";

// Shaped like StatCan's WDS answers for table 18-10-0245-01.
const METADATA = [
  {
    status: "SUCCESS",
    object: {
      productId: "18100245",
      dimension: [
        {
          dimensionPositionId: 1,
          dimensionNameEn: "Geography",
          member: [
            { memberId: 1, memberNameEn: "Canada" },
            { memberId: 6, memberNameEn: "Quebec" },
          ],
        },
        {
          dimensionPositionId: 2,
          dimensionNameEn: "Products",
          member: [
            { memberId: 3, memberNameEn: "Chicken breasts, per kilogram" },
            { memberId: 9, memberNameEn: "Milk, 2 litres" },
            { memberId: 12, memberNameEn: "Eggs, 12 units" },
            { memberId: 20, memberNameEn: "Infant formula, 900 grams" },
            { memberId: 30, memberNameEn: "Toilet paper, 12 rolls" },
          ],
        },
      ],
    },
  },
];

function point(month, value) {
  return { refPer: `${month}-01`, value, decimals: 2, scalarFactorCode: 0, statusCode: 0 };
}

function fakeFetch(url, init) {
  const body = JSON.parse(init.body);
  let data;
  if (url.endsWith("/getCubeMetadata")) data = METADATA;
  else
    data = body.map((req) => {
      const product = Number(req.coordinate.split(".")[1]);
      const series = {
        3: [point("2026-06", 13.2), point("2026-07", 12.9), point("2026-08", null)],
        9: [point("2026-08", 6.1)],
        12: [point("2026-08", 4.5)],
        20: [point("2026-08", 40)],
      }[product];
      return series
        ? { status: "SUCCESS", object: { productId: 18100245, coordinate: req.coordinate, vectorDataPoint: series } }
        : { status: "FAILED", object: "no data" };
    });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

describe("Statistics Canada table", () => {
  it("finds Quebec and the product list", () => {
    const meta = readCubeMetadata(METADATA);
    expect(meta.quebecId).toBe(6);
    expect(meta.products.map((p) => p.id)).toEqual([3, 9, 12, 20, 30]);
  });

  it("builds a ten-part coordinate", () => {
    expect(coordinate([[1, 6], [2, 3]])).toBe("6.3.0.0.0.0.0.0.0.0");
  });

  it("reads product sizes into the app's unit bases", () => {
    expect(parseProductName("Chicken breasts, per kilogram")).toMatchObject({ item: "chicken breasts", basis: "lb" });
    expect(parseProductName("Milk, 2 litres")).toEqual({ item: "milk", basis: "L", factor: 0.5 });
    expect(parseProductName("Butter, 454 grams")).toMatchObject({ item: "butter", basis: "lb" });
    expect(parseProductName("Butter, 454 grams").factor).toBeCloseTo(0.999, 3);
    expect(parseProductName("Eggs, 12 units")).toEqual({ item: "eggs", basis: "each", factor: 1 });
    expect(parseProductName("Cucumber, unit")).toEqual({ item: "cucumber", basis: "each", factor: 1 });
    expect(parseProductName("Toilet paper, 12 rolls")).toBe(null);
    expect(parseProductName("Coffee")).toBe(null);
  });

  it("fetches Quebec's prices, converted and oldest first", async () => {
    const prices = await fetchQuebecPrices({ fetchImpl: fakeFetch });
    expect(prices.map((p) => p.product)).toEqual([
      "Chicken breasts, per kilogram",
      "Milk, 2 litres",
      "Eggs, 12 units",
      "Infant formula, 900 grams",
    ]);
    expect(prices[0]).toEqual({
      product: "Chicken breasts, per kilogram",
      item: "chicken breasts",
      unitBasis: "lb",
      history: [
        { month: "2026-06", price: 5.99 },
        { month: "2026-07", price: 5.85 },
      ],
    });
    expect(prices[1].history).toEqual([{ month: "2026-08", price: 3.05 }]);
  });
});

describe("matching deals to the Quebec average", () => {
  const baselines = [
    { product: "Chicken breasts, per kilogram", item: "chicken breasts", unitBasis: "lb", price: 5.85, month: "2026-07" },
    { product: "Chicken, whole, per kilogram", item: "chicken", unitBasis: "lb", price: 3.1, month: "2026-07" },
    { product: "Milk, 2 litres", item: "milk", unitBasis: "L", price: 3.05, month: "2026-08" },
  ];

  it("picks the most specific product with the same unit", () => {
    const deal = { matchName: "boneless skinless chicken breasts", unitPrice: 4.49, unitBasis: "lb" };
    expect(findBaseline(deal, baselines).product).toBe("Chicken breasts, per kilogram");
    expect(findBaseline({ matchName: "chicken drumsticks", unitPrice: 2, unitBasis: "lb" }, baselines).product).toBe(
      "Chicken, whole, per kilogram"
    );
    expect(findBaseline({ matchName: "chicken breasts", unitPrice: 9, unitBasis: "each" }, baselines)).toBe(null);
    expect(findBaseline({ matchName: "almond milk", unitPrice: null, unitBasis: null }, baselines)).toBe(null);
  });

  it("matches the product, not a word in another product's name", () => {
    const more = [
      ...baselines,
      { product: "Apples, per kilogram", item: "apples", unitBasis: "lb", price: 2.73, month: "2026-08" },
      { product: "Butter, 454 grams", item: "butter", unitBasis: "lb", price: 5.7, month: "2026-08" },
    ];
    const at = (matchName, unitBasis = "lb") => findBaseline({ matchName, unitPrice: 1, unitBasis }, more)?.item ?? null;
    expect(at("apples")).toBe("apples");
    expect(at("spartan apples")).toBe("apples");
    expect(at("première moisson apple-cinnamon bread")).toBe(null);
    expect(at("selection butter")).toBe("butter");
    expect(at("butter puff pastry")).toBe(null);
    expect(at("cedar coconut milk", "L")).toBe(null);
    expect(at("eagle brand condensed milk", "L")).toBe(null);
    expect(at("lactose free milk", "L")).toBe("milk");
  });

  it("rates a price against the average", () => {
    expect(compareToBaseline(4.49, 5.85)).toEqual({ pct: -23, verdict: "good" });
    expect(compareToBaseline(4.0, 5.85)).toEqual({ pct: -32, verdict: "stock-up" });
    expect(compareToBaseline(5.85, 5.85)).toEqual({ pct: 0, verdict: "normal" });
    expect(compareToBaseline(7, 5.85)).toEqual({ pct: 20, verdict: "high" });
  });

  it("attaches the average to deals that have one", () => {
    const deals = [
      { id: 1, matchName: "chicken breasts", unitPrice: 4.49, unitBasis: "lb" },
      { id: 2, matchName: "flowers", unitPrice: 9.99, unitBasis: "each" },
    ];
    const [a, b] = attachBaselines(deals, baselines);
    expect(a.baseline).toEqual({ product: "Chicken breasts, per kilogram", price: 5.85, month: "2026-07", basis: "lb", history: [], pct: -23, verdict: "good" });
    expect(b.baseline).toBeUndefined();
  });

  it("compares a pack price per lb with a per-kilogram average", () => {
    const [deal] = attachBaselines([{ id: 3, item: "Chicken breasts, 908 g", matchName: "chicken breasts", unitPrice: 8.99, unitBasis: "each" }], baselines);
    expect(deal.baseline).toMatchObject({ basis: "lb", pct: -23 });
  });
});
