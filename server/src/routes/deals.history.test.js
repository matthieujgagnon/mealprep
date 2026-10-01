import { describe, expect, it } from "vitest";
import { lastSixMonths, withPriceHistory } from "./deals.js";

const NOW = new Date("2026-09-30T12:00:00Z");
const row = (unitPrice, createdAt, extra = {}) => ({
  matchName: "chicken breast",
  item: "Poitrine de poulet",
  store: "Metro",
  unitBasis: "lb",
  unitPrice,
  createdAt: new Date(createdAt),
  ...extra,
});

describe("withPriceHistory", () => {
  it("lists the last six months oldest first", () => {
    expect(lastSixMonths(NOW)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("gives each month its lowest price, null when nothing was seen, and the range", () => {
    const current = row(4.49, "2026-09-25");
    const history = [
      row(5.99, "2026-05-03"),
      row(6.49, "2026-05-20"),
      row(7.99, "2026-07-10"),
      row(4.49, "2026-09-25"),
      row(2.0, "2026-07-10", { store: "Super C" }), // another store: not the same deal
      row(1.0, "2026-07-10", { unitBasis: "each" }), // another unit: not comparable
      row(0.5, "2025-12-01"), // older than six months
    ];
    const [deal] = withPriceHistory([current], history, NOW);
    expect(deal.history).toEqual([
      { month: "2026-04", price: null },
      { month: "2026-05", price: 5.99 },
      { month: "2026-06", price: null },
      { month: "2026-07", price: 7.99 },
      { month: "2026-08", price: null },
      { month: "2026-09", price: 4.49 },
    ]);
    expect(deal).toMatchObject({ sixMonthLow: 4.49, sixMonthHigh: 7.99, isNew: false });
  });

  it("marks a first-time price as new, with only this month filled in", () => {
    const current = row(3.99, "2026-09-29");
    const [deal] = withPriceHistory([current], [current], NOW);
    expect(deal.isNew).toBe(true);
    expect(deal.history.map((m) => m.price)).toEqual([null, null, null, null, null, 3.99]);
  });

  it("stays new when this week's flyer was imported several times", () => {
    const current = row(12.99, "2026-09-30T10:00:00Z");
    const history = [row(12.99, "2026-09-30T09:00:00Z"), row(12.99, "2026-09-30T09:30:00Z"), current];
    const [deal] = withPriceHistory([current], history, NOW);
    expect(deal.isNew).toBe(true);
    expect(deal.sixMonthLow).toBeUndefined();
  });

  it("leaves deals without a unit price alone", () => {
    const deal = { item: "Flowers", unitPrice: null, unitBasis: null };
    expect(withPriceHistory([deal], [], NOW)).toEqual([deal]);
  });
});
