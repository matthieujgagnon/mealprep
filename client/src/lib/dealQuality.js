// Which flyer deals are actually good prices, and which planned meals use
// them. A deal counts when its price sits low in its own 6-month range, or
// - with no history yet - well under Quebec's average for the product
// (Statistics Canada; see server/src/lib/statcan.js).
import { core, dealCore } from "./similarRecipes.js";

// { level: "stock-up" | "good", reason } or null for an ordinary price.
export function dealQuality(deal) {
  if (!deal || deal.unitPrice == null) return null;
  if (!deal.isNew && deal.sixMonthLow != null && deal.sixMonthHigh != null) {
    const t = (deal.unitPrice - deal.sixMonthLow) / (deal.sixMonthHigh - deal.sixMonthLow || 1);
    if (t <= 0.02) return { level: "stock-up", reason: "6-month low" };
    if (t < 0.4) return { level: "good", reason: "good price for 6 months" };
    return null;
  }
  const b = deal.baseline;
  if (b?.verdict === "stock-up") return { level: "stock-up", reason: `${-b.pct}% under the Quebec average` };
  if (b?.verdict === "good") return { level: "good", reason: `${-b.pct}% under the Quebec average` };
  return null;
}

const RANK = { "stock-up": 0, good: 1 };

// The best good deal per ingredient core: stock-up prices first, then the
// cheaper one.
export function goodDealsByCore(deals) {
  const byCore = new Map();
  for (const deal of deals || []) {
    const quality = dealQuality(deal);
    if (!quality) continue;
    const c = dealCore(deal.matchName || deal.item);
    if (!c) continue;
    const current = byCore.get(c);
    if (
      !current ||
      RANK[quality.level] < RANK[current.quality.level] ||
      (RANK[quality.level] === RANK[current.quality.level] && deal.unitPrice < current.deal.unitPrice)
    ) {
      byCore.set(c, { deal, quality });
    }
  }
  return byCore;
}

// A recipe's ingredients that are at a good price this week, stock-up
// first: [{ core, name, deal, quality }].
export function recipeGoodDeals(recipe, byCore) {
  if (!recipe || recipe.isPlaceholder || !byCore || byCore.size === 0) return [];
  const seen = new Set();
  const found = [];
  for (const ing of recipe.ingredients || []) {
    const c = core(ing.name);
    if (!c || seen.has(c) || !byCore.has(c)) continue;
    seen.add(c);
    found.push({ core: c, name: ing.name.trim().toLowerCase(), ...byCore.get(c) });
  }
  return found.sort((a, b) => RANK[a.quality.level] - RANK[b.quality.level]);
}

// "chicken breast $4.49/lb at Metro (6-month low)"
export function describeDeal({ name, deal, quality }) {
  return `${name} ${deal.price} at ${deal.store} (${quality.reason})`;
}
