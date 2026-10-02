import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { freezeTip } from "../lib/foodkeeper.js";
import { loadBaselines } from "../lib/baselines.js";
import { compareToBaseline, findBaseline } from "../lib/statcan.js";
import { tidyDealTitle } from "../lib/dealTitle.js";
import { AISLES, aisleFor } from "../lib/dealAisle.js";
import { buildHistoryIndex, comparablePrice, findHistory, monthlySeries } from "../lib/priceCompare.js";
import { checkDealPhoto, loadDealPhoto } from "../lib/dealPhoto.js";

export const dealsRouter = Router();

// How long each step of a request took, sent as a Server-Timing header so
// the browser's network panel shows where the time goes.
function stageTimer() {
  let last = performance.now();
  const parts = [];
  return {
    mark(name) {
      const now = performance.now();
      parts.push(`${name};dur=${(now - last).toFixed(1)}`);
      last = now;
    },
    header: () => parts.join(", "),
  };
}

// The Riso Poster Flyers redesign's price meter compares a deal's price
// against its own 6-month range - 26 weeks, matching the handoff's "last 26
// weeks" spec exactly rather than a calendar-month approximation.
const SIX_MONTHS_MS = 26 * 7 * 24 * 60 * 60 * 1000;

// Six calendar months ending with `now`'s month, oldest first, as
// "YYYY-MM" keys.
export function lastSixMonths(now = new Date()) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

// Attaches what each deal's price is compared with (see lib/priceCompare.js):
//   sixMonthLow / sixMonthHigh - the usual range, in compareBasis
//   comparePrice / compareBasis - this deal's price on the same footing
//                                 (a 454 g pack becomes a per-lb price)
//   rangeSource - "store" (same store, 6 months of flyers), "stores" (same
//                 product, any store) or "quebec" (Statistics Canada's
//                 monthly Quebec average) - the first one that exists
//   history     - one bar per month for the detail chart; for "quebec",
//                 StatCan's last six published months
//   isNew       - true when none of the three exists yet.
export function withPriceHistory(deals, history, now = new Date(), baselines = []) {
  const cutoff = now.getTime() - SIX_MONTHS_MS;
  const months = lastSixMonths(now);
  const recent = history.filter(
    (row) => row.unitPrice != null && row.unitBasis && (!row.createdAt || new Date(row.createdAt).getTime() >= cutoff)
  );
  const index = buildHistoryIndex(recent, now);

  return deals.map((deal) => {
    const compare = comparablePrice(deal);
    if (!compare) return deal;
    const base = { ...deal, comparePrice: compare.price, compareBasis: compare.basis };

    const found = findHistory(deal, index);
    if (found) {
      const series = monthlySeries(found.entries, months);
      const last = series[series.length - 1];
      last.price = last.price == null ? compare.price : Math.min(last.price, compare.price);
      const prices = [...found.entries.map((e) => e.price), compare.price];
      return {
        ...base,
        isNew: false,
        rangeSource: found.source,
        // How many different weeks of flyer prices the range rests on (this
        // week's included), so a range from 3 weeks says so.
        historyWeeks: new Set([...found.entries.map((e) => e.week), Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))]).size,
        sixMonthLow: Math.min(...prices),
        sixMonthHigh: Math.max(...prices),
        history: series,
      };
    }

    const quebec = findBaseline({ ...deal, unitPrice: compare.price, unitBasis: compare.basis }, baselines);
    const qcSeries = (quebec?.history || []).slice(-6);
    if (qcSeries.length >= 2) {
      const prices = qcSeries.map((m) => m.price);
      return {
        ...base,
        isNew: false,
        rangeSource: "quebec",
        rangeProduct: quebec.product,
        sixMonthLow: Math.min(...prices),
        sixMonthHigh: Math.max(...prices),
        history: qcSeries,
      };
    }

    const series = months.map((month) => ({ month, price: null }));
    series[series.length - 1].price = compare.price;
    return { ...base, isNew: true, history: series };
  });
}

async function attachPriceHistory(userId, deals, baselines) {
  const eligible = deals.filter((d) => d.unitPrice != null && d.unitBasis);
  if (eligible.length === 0) return deals;

  const cutoff = new Date(Date.now() - SIX_MONTHS_MS);
  const history = await prisma.flyerDeal.findMany({
    where: { userId, unitPrice: { not: null }, unitBasis: { not: null }, createdAt: { gte: cutoff } },
    select: { matchName: true, item: true, store: true, unitBasis: true, unitPrice: true, createdAt: true },
  });
  return withPriceHistory(deals, history, new Date(), baselines);
}

// Attaches Quebec's average price for the same product (Statistics Canada,
// see lib/statcan.js) and how this deal compares: `baseline` = { product,
// price, month, pct, verdict }. Only for deals priced in the same unit.
export function attachBaselines(deals, baselines) {
  if (baselines.length === 0) return deals;
  return deals.map((deal) => {
    const compare = comparablePrice(deal);
    if (!compare) return deal;
    const match = findBaseline({ ...deal, unitPrice: compare.price, unitBasis: compare.basis }, baselines);
    if (!match) return deal;
    return {
      ...deal,
      baseline: {
        product: match.product,
        price: match.price,
        month: match.month,
        basis: compare.basis,
        // Statistics Canada's last six published months, so every chart has
        // something to compare with from day one.
        history: (match.history || []).slice(-6),
        ...compareToBaseline(compare.price, match.price),
      },
    };
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

// Building the week's deals with their 6-month history is the slow part
// of the app (one query over every price of the last 26 weeks, then
// matching each deal against them), and the Flyers, Grocery, Home and
// Recipes tabs all ask for it. So it's built once per user and kept until
// something changes: a cheap query over the deal rows (how many, current or
// not, and the newest) plus the Quebec averages decides whether the kept
// copy is still right. An import, upload, clear or anything else that adds
// or retires rows changes that signature, so it's never stale.
const dealsCache = new Map(); // userId -> { sig, full, lite }
const MAX_CACHED_USERS = 50;

async function dealsSignature(userId) {
  const [groups, base] = await Promise.all([
    prisma.flyerDeal.groupBy({ by: ["isCurrent"], where: { userId }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.priceBaseline.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  const deals = groups
    .map((g) => `${g.isCurrent}:${g._count._all}:${g._max.createdAt?.getTime() ?? 0}`)
    .sort()
    .join("|");
  // The date matters too: "ends in 2 days" and the 6 months shift daily.
  return `${deals}#${base._count._all}:${base._max.updatedAt?.getTime() ?? 0}#${new Date().toISOString().slice(0, 10)}`;
}

// The other tabs only need each deal's price and how it compares, not the
// 6 monthly bars - about a third of the full answer.
const LITE_OMIT = new Set(["history", "userId", "createdAt", "isCurrent"]);
const liteDeal = (deal) => {
  const lite = Object.fromEntries(Object.entries(deal).filter(([k]) => !LITE_OMIT.has(k)));
  if (lite.baseline?.history) lite.baseline = { ...lite.baseline, history: undefined };
  return lite;
};

async function buildDeals(userId, timer) {
  const found = await prisma.flyerDeal.findMany({
    where: { userId, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });
  timer.mark("query");
  const rows = found.map((row) => ({ ...row, item: tidyDealTitle(row.item), aisle: aisleFor(row) })); // stored as printed; shown tidy
  timer.mark("tidy");

  if (rows.length === 0) {
    const mock = {
      region: "Montreal, QC (H1W)",
      stores: ["Metro", "Provigo", "Maxi", "Super C", "IGA"],
      weekOf: "2026-08-27",
      deals: MOCK_DEALS.map((d) => ({ ...d, aisle: aisleFor(d) })),
      aisles: AISLES,
      isMockData: true,
    };
    return { full: JSON.stringify(mock), lite: JSON.stringify(mock) };
  }

  const stores = [...new Set(rows.map((r) => r.store))];
  const baselines = await loadBaselines();
  timer.mark("baselines");
  const withHistory = await attachPriceHistory(userId, rows, baselines);
  timer.mark("history");
  const withTips = attachFreezeTips(withHistory);
  timer.mark("freeze");
  const deals = attachBaselines(withTips, baselines);
  timer.mark("quebec");
  const body = { region: "Montreal, QC (H1W)", stores, weekOf: null, aisles: AISLES, isMockData: false };
  return {
    full: JSON.stringify({ ...body, deals }),
    lite: JSON.stringify({ ...body, deals: deals.map(liteDeal) }),
    byId: new Map(deals.map((d) => [d.id, d])),
  };
}

async function getDeals(userId, timer) {
  const sig = await dealsSignature(userId);
  timer.mark("check");
  const kept = dealsCache.get(userId);
  if (kept && kept.sig === sig) {
    timer.mark("cached");
    return kept;
  }
  const built = { sig, ...(await buildDeals(userId, timer)) };
  dealsCache.delete(userId);
  dealsCache.set(userId, built);
  if (dealsCache.size > MAX_CACHED_USERS) dealsCache.delete(dealsCache.keys().next().value);
  return built;
}

// For a change the signature can't see (an edit to existing rows).
export function forgetDeals(userId) {
  dealsCache.delete(userId);
}

export function forgetAllDeals() {
  dealsCache.clear();
}

// This week's deals as GET /api/deals builds them (for the import check).
export async function currentDeals(userId) {
  const built = await getDeals(userId, stageTimer());
  return built.byId ? [...built.byId.values()] : [];
}

// GET /api/deals - this week's flyer specials across nearby stores. Serves
// real deals extracted from uploaded flyers once any exist, falling back to
// sample data before the first upload. isCurrent: true only - a re-upload
// supersedes rather than deletes its previous deals (see isCurrent's
// comment on the FlyerDeal model), so this must filter them out to keep
// showing just what's actually on sale right now; the superseded rows stay
// in the table as price history for later features.
// ?lite=1 leaves out each deal's monthly history (see liteDeal).
dealsRouter.get("/", async (req, res) => {
  const timer = stageTimer();
  const built = await getDeals(req.userId, timer);
  res.set("Server-Timing", timer.header());
  res.type("json").send(req.query.lite ? built.lite : built.full);
});

// GET /api/deals/:id - one current deal with its full history, for a
// detail view opened from a tab that loaded the lite list.
dealsRouter.get("/:id([^/]+)", async (req, res, next) => {
  if (req.params.id === "aisles") return next();
  const built = await getDeals(req.userId, stageTimer());
  const deal = built.byId?.get(req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.json(deal);
});

// POST /api/deals/aisles { names: [...] } - the grocery aisle each name
// belongs in (the same aisles the Flyers page groups by), for the grocery
// list's aisle view and the line under each item.
dealsRouter.post("/aisles", (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.filter((n) => typeof n === "string").slice(0, 500) : [];
  res.json({ aisles: AISLES, byName: Object.fromEntries(names.map((n) => [n, aisleFor({ item: n })])) });
});

// GET /api/deals/:id/photo - the deal's product photo, fetched by the
// server (see lib/dealPhoto.js). 404 when there's none or it can't be
// fetched; the page then shows a food emoji instead.
dealsRouter.get("/:id/photo", async (req, res) => {
  const deal = await prisma.flyerDeal.findFirst({
    where: { id: req.params.id, userId: req.userId },
    select: { imageUrl: true },
  });
  const photo = deal?.imageUrl ? await loadDealPhoto(deal.imageUrl) : null;
  if (!photo) return res.status(404).end();
  res.set("Content-Type", photo.type);
  res.set("Cache-Control", "private, max-age=604800");
  res.send(photo.body);
});

// GET /api/deals/:id/photo-check - why a deal's photo isn't showing: each
// address tried and what it answered. Shown in the deal's detail view.
dealsRouter.get("/:id/photo-check", async (req, res) => {
  const deal = await prisma.flyerDeal.findFirst({
    where: { id: req.params.id, userId: req.userId },
    select: { imageUrl: true },
  });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (!deal.imageUrl) return res.json({ url: null, ok: false, tries: [] });
  res.json(await checkDealPhoto(deal.imageUrl));
});
