// Temporary: audits this week's live flyers with the app's own code.
import { fetchFlippDeals } from "../../server/src/lib/flipp.js";
import { fetchQuebecPrices, findBaseline, compareToBaseline } from "../../server/src/lib/statcan.js";
import { comparablePrice } from "../../server/src/lib/priceCompare.js";
import { aisleFor } from "../../server/src/lib/dealAisle.js";
import { buildIngredients, ingredientKeyOf } from "../../client/src/lib/flyerIngredients.js";

const raw = new Map();
const fetchImpl = async (url, opts) => {
  const res = await fetch(url, opts);
  if (/\/items\/\d+/.test(url) && res.ok) {
    const body = await res.clone().json().catch(() => null);
    const d = body?.item ?? body;
    if (d?.id) raw.set(String(d.id), d);
  }
  return res;
};

const { deals, flyers, failed } = await fetchFlippDeals({ postalCode: "H2T2S3", stores: ["Metro", "IGA", "Maxi", "Super C", "Provigo"], fetchImpl });
console.log("FLYERS", JSON.stringify(flyers), "FAILED", JSON.stringify(failed), "DEALS", deals.length);
const baselines = (await fetchQuebecPrices({ months: 6 }).catch((e) => (console.log("STATCAN FAIL", e.message), []))).map((b) => ({ ...b, price: b.history.at(-1)?.price, month: b.history.at(-1)?.month }));
console.log("BASELINES", baselines.length, baselines.map((b) => `${b.product}=${b.price}/${b.unitBasis}`).join(" ; "));

const rows = deals.map((d) => {
  const cmp = comparablePrice(d);
  const b = cmp ? findBaseline({ ...d, unitPrice: cmp.price, unitBasis: cmp.basis }, baselines) : null;
  const vs = b ? compareToBaseline(cmp.price, b.price) : null;
  return { ...d, aisle: aisleFor(d), cmp, b, vs, key: ingredientKeyOf(d) };
});
const meat = rows.filter((r) => ["meat", "seafood", "deli"].includes(r.aisle) || r.category === "protein");
console.log("=== PROTEIN ROWS", meat.length);
for (const r of meat) {
  console.log(["P", r.store, r.aisle, r.item, `m=${r.matchName}`, `k=${r.key}`, r.price, r.cmp ? `${r.cmp.price}/${r.cmp.basis}` : "-", r.regularPrice ?? "", r.b ? `${r.b.product} ${r.vs.pct}%` : ""].join(" | "));
}
console.log("=== BASELINE MATCHES (non-protein)");
for (const r of rows.filter((r) => r.b && !meat.includes(r))) console.log(["B", r.store, r.item, `m=${r.matchName}`, `${r.cmp.price}/${r.cmp.basis}`, `${r.b.product} ${r.vs.pct}%`].join(" | "));
console.log("=== GROUPS (protein)");
const groups = buildIngredients(meat.map((r, i) => ({ ...r, id: i })));
for (const g of groups.sort((a, b) => b.variants.length - a.variants.length)) {
  if (g.variants.length < 2) continue;
  console.log(`G | ${g.name} (${g.variants.length}) | ${g.variants.map((v) => v.item).join(" ;; ")}`);
}
console.log("=== POINTS / LOYALTY");
for (const [id, d] of raw) {
  const text = `${d.name} ${d.description || ""} ${d.sale_story || ""} ${d.pre_price_text || ""} ${d.price_text || ""} ${d.post_price_text || ""}`;
  if (/points|optimum|moi |scene|valeur de|value of|bonus/i.test(text)) {
    console.log("L |", JSON.stringify({ name: d.name, price: d.price ?? d.current_price, pre: d.pre_price_text, pt: d.price_text, post: d.post_price_text, story: d.sale_story, desc: (d.description || "").slice(0, 160), disc: (d.disclaimer_text || "").slice(0, 120), merchant: d.merchant_name }));
  }
}
console.log("=== SAMPLE RAW KEYS", JSON.stringify(Object.keys([...raw.values()][0] || {})));
