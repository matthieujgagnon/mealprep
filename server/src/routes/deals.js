import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { freezeTip } from "../lib/foodkeeper.js";

export const dealsRouter = Router();

// The Riso Poster Flyers redesign's price meter compares a deal's price
// against its own 6-month range - 26 weeks, matching the handoff's "last 26
// weeks" spec exactly rather than a calendar-month approximation.
const SIX_MONTHS_MS = 26 * 7 * 24 * 60 * 60 * 1000;

// Same key a deal is grouped/compared under everywhere else (matchName,
// falling back to item for pre-matchName rows) plus store and unitBasis -
// price history is only ever compared within the same unit basis (see
// FlyerDeal.unitBasis's own comment), and per store since two stores'
// prices for the same ingredient aren't the same "deal."
function historyKey(deal) {
  return `${(deal.matchName || deal.item).trim().toLowerCase()}|${deal.store}|${deal.unitBasis}`;
}

// Attaches sixMonthLow/sixMonthHigh/isNew to each deal that has a usable
// unitPrice, computed from every deal (isCurrent true or false) sharing its
// historyKey within the last 26 weeks - including the deal's own current
// price, so a first-ever upload's only data point is its own price (low ==
// high == current), not an empty range. isNew is true only when there's
// truly nothing but the current price to compare against, per the
// handoff's "no history yet -> hide the meter, show NEW" behavior.
async function attachPriceHistory(userId, deals) {
  const eligible = deals.filter((d) => d.unitPrice != null && d.unitBasis);
  if (eligible.length === 0) return deals;

  const cutoff = new Date(Date.now() - SIX_MONTHS_MS);
  const history = await prisma.flyerDeal.findMany({
    where: { userId, unitPrice: { not: null }, unitBasis: { not: null }, createdAt: { gte: cutoff } },
    select: { matchName: true, item: true, store: true, unitBasis: true, unitPrice: true },
  });

  const ranges = new Map();
  for (const row of history) {
    const key = historyKey(row);
    const range = ranges.get(key);
    if (!range) {
      ranges.set(key, { low: row.unitPrice, high: row.unitPrice, count: 1 });
    } else {
      range.low = Math.min(range.low, row.unitPrice);
      range.high = Math.max(range.high, row.unitPrice);
      range.count += 1;
    }
  }

  return deals.map((deal) => {
    if (deal.unitPrice == null || !deal.unitBasis) return deal;
    const range = ranges.get(historyKey(deal));
    if (!range || range.count < 2) return { ...deal, isNew: true };
    return { ...deal, sixMonthLow: range.low, sixMonthHigh: range.high, isNew: false };
  });
}

// Attaches a "Freezes N months." tip (see foodkeeper.js's freezeTip) to
// every deal whose matched FoodKeeper entry has freezer data - meat/fish
// mostly, per the bundled dataset. Independent of price history, so it
// runs over every deal, not just the ones with a usable unitPrice.
function attachFreezeTips(deals) {
  return deals.map((deal) => {
    const tip = freezeTip(deal.matchName || deal.item);
    return tip ? { ...deal, freezeTip: tip } : deal;
  });
}

// Sample data shown until at least one real flyer has been uploaded via
// POST /api/flyers/upload - structured the way real flyer items look, so it
// reads the same as the real thing before any deals exist yet.
const MOCK_DEALS = [
  { id: "d1", store: "Metro", category: "protein", item: "Boneless chicken breast", price: "$4.99/lb", validUntil: "2026-09-03" },
  { id: "d2", store: "Provigo", category: "protein", item: "Ground beef, extra lean", price: "$5.49/lb", validUntil: "2026-09-03" },
  { id: "d3", store: "Super C", category: "produce", item: "Bell peppers", price: "$1.49/lb", validUntil: "2026-09-03" },
  { id: "d4", store: "Maxi", category: "produce", item: "Broccoli crowns", price: "$1.99/lb", validUntil: "2026-09-03" },
  { id: "d5", store: "IGA", category: "protein", item: "Atlantic salmon fillet", price: "$9.99/lb", validUntil: "2026-09-03" },
  { id: "d6", store: "Metro", category: "staple", item: "Pasta, 900g", price: "$1.99", validUntil: "2026-09-03" },
  { id: "d7", store: "Provigo", category: "produce", item: "Roma tomatoes", price: "$1.29/lb", validUntil: "2026-09-03" },
  { id: "d8", store: "Super C", category: "staple", item: "Rice, 2kg bag", price: "$3.99", validUntil: "2026-09-03" },
];

// GET /api/deals - this week's flyer specials across nearby stores. Serves
// real deals extracted from uploaded flyers once any exist, falling back to
// sample data before the first upload. isCurrent: true only - a re-upload
// supersedes rather than deletes its previous deals (see isCurrent's
// comment on the FlyerDeal model), so this must filter them out to keep
// showing just what's actually on sale right now; the superseded rows stay
// in the table as price history for later features.
dealsRouter.get("/", async (req, res) => {
  const rows = await prisma.flyerDeal.findMany({
    where: { userId: req.userId, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    return res.json({
      region: "Montreal, QC (H1W)",
      stores: ["Metro", "Provigo", "Maxi", "Super C", "IGA"],
      weekOf: "2026-08-27",
      deals: MOCK_DEALS,
      isMockData: true,
    });
  }

  const stores = [...new Set(rows.map((r) => r.store))];
  const deals = attachFreezeTips(await attachPriceHistory(req.userId, rows));
  res.json({
    region: "Montreal, QC (H1W)",
    stores,
    weekOf: null,
    deals,
    isMockData: false,
  });
});
