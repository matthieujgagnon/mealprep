// Keeps PriceBaseline in step with Statistics Canada: refreshed when the
// stored prices are more than a week old (StatCan publishes monthly, early
// in the month), from the same hourly check and weekly cron ping as the
// flyer import.
import { prisma } from "./prisma.js";
import { fetchQuebecPrices } from "./statcan.js";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

let lastAttempt = 0;
let running = null;

export async function refreshBaselines({ fetchImpl = fetch } = {}) {
  const prices = await fetchQuebecPrices({ fetchImpl });
  if (prices.length === 0) throw new Error("Statistics Canada returned no Quebec prices");
  await prisma.$transaction([
    ...prices.map((p) => {
      const latest = p.history[p.history.length - 1];
      const data = {
        item: p.item,
        unitBasis: p.unitBasis,
        price: latest.price,
        month: latest.month,
        history: JSON.stringify(p.history.slice(-12)),
      };
      return prisma.priceBaseline.upsert({ where: { product: p.product }, create: { product: p.product, ...data }, update: data });
    }),
    prisma.priceBaseline.deleteMany({ where: { product: { notIn: prices.map((p) => p.product) } } }),
  ]);
  return prices.length;
}

export async function isBaselineRefreshDue(now = Date.now()) {
  if (now - lastAttempt < RETRY_AFTER_MS) return false;
  const newest = await prisma.priceBaseline.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return !newest || now - newest.updatedAt.getTime() > STALE_AFTER_MS;
}

// Refreshes when due; never throws (a failure is logged and retried in
// 6 hours).
export function refreshBaselinesIfDue({ fetchImpl = fetch } = {}) {
  if (running) return running;
  running = (async () => {
    if (!(await isBaselineRefreshDue())) return { refreshed: false };
    lastAttempt = Date.now();
    try {
      return { refreshed: true, products: await refreshBaselines({ fetchImpl }) };
    } catch (err) {
      console.error("Statistics Canada price refresh failed:", err.message);
      return { refreshed: false, error: err.message };
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function loadBaselines() {
  const rows = await prisma.priceBaseline.findMany();
  return rows.map((r) => {
    let history = [];
    try {
      history = JSON.parse(r.history);
    } catch {
      // keep empty
    }
    return { product: r.product, item: r.item, unitBasis: r.unitBasis, price: r.price, month: r.month, history };
  });
}
