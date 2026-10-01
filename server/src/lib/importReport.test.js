import { describe, expect, it } from "vitest";
import { buildImportReport, findPerLbSavedEach } from "./importReport.js";

const now = new Date("2026-10-01T12:00:00Z");
const weeksAgo = (n) => new Date(now.getTime() - n * 7 * 864e5);

const current = [
  { id: "a", store: "Metro", source: "Flipp", item: "McIntosh apples, 3 lb bag", matchName: "mcintosh apples", price: "$5.99", unitPrice: 5.99, unitBasis: "each", imageUrl: "x", validUntil: "2026-10-07", createdAt: now, rangeSource: "store" },
  { id: "b", store: "Super C", source: "Flipp", item: "McIntosh apples", matchName: "mcintosh apples", price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb", validUntil: "2026-10-07", createdAt: now, isNew: true },
  { id: "c", store: "Super C", source: "Flipp", item: "Mystery deal", matchName: "mystery deal", price: "2 for", unitPrice: null, unitBasis: null, createdAt: now },
];
const history = [
  // Saved per item before the fix, but per lb (close to this week's 99¢/lb).
  { id: "h1", store: "Super C", source: "Flipp", item: "McIntosh apples", matchName: "mcintosh apples", price: "$1.09", unitPrice: 1.09, unitBasis: "each", createdAt: weeksAgo(1) },
  // A real pack price: left alone.
  { id: "h2", store: "Super C", source: "Flipp", item: "McIntosh apples", matchName: "mcintosh apples", price: "$5.49", unitPrice: 5.49, unitBasis: "each", createdAt: weeksAgo(2) },
  // Other store: left alone.
  { id: "h3", store: "Metro", source: "Flipp", item: "McIntosh apples", matchName: "mcintosh apples", price: "$0.99", unitPrice: 0.99, unitBasis: "each", createdAt: weeksAgo(1) },
  { id: "h4", store: "Metro", source: "Flipp", item: "Pommes", matchName: "apples", price: "$1.29/lb", unitPrice: 1.29, unitBasis: "lb", createdAt: weeksAgo(3) },
];

describe("buildImportReport", () => {
  const report = buildImportReport(current, history);

  it("counts each store's items, readable prices, per-lb prices and photos", () => {
    expect(report.stores).toEqual([
      expect.objectContaining({ store: "Metro", items: 1, priced: 1, perUnit: 1, photos: 1, endsOn: "2026-10-07" }),
      expect.objectContaining({ store: "Super C", items: 2, priced: 1, perUnit: 1, photos: 0 }),
    ]);
    expect(report.unreadable).toEqual([{ store: "Super C", item: "Mystery deal", price: "2 for" }]);
  });

  it("says what this week's prices are compared with", () => {
    expect(report.compared).toEqual({ store: 1, stores: 0, quebec: 0, none: 1 });
  });

  it("lists the stored weeks of prices, newest first", () => {
    expect(report.historyWeeks.map((w) => w.rows)).toEqual([2, 1, 1]);
    expect(report.historyWeeks[0].sources).toEqual(["Flipp"]);
  });
});

describe("findPerLbSavedEach", () => {
  it("finds old per-lb prices saved per item, at the same store only", () => {
    expect(findPerLbSavedEach(current, history).map((r) => r.id)).toEqual(["h1"]);
  });
});
