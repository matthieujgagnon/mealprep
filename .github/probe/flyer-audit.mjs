// Temporary: audits this week's live flyers with the app's own code.
import { fetchFlippDeals } from "../../server/src/lib/flipp.js";
import { fetchQuebecPrices, findBaseline, compareToBaseline } from "../../server/src/lib/statcan.js";
import { comparablePrice } from "../../server/src/lib/priceCompare.js";
import { aisleFor } from "../../server/src/lib/dealAisle.js";
import { buildIngredients, ingredientKeyOf } from "../../client/src/lib/flyerIngredients.js";
import { proteinsOnSale, proteinName } from "../../client/src/lib/proteins.js";

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
  return { ...d, aisle: aisleFor(d), cmp, b, vs, key: ingredientKeyOf(d), comparePrice: cmp?.price, compareBasis: cmp?.basis, baseline: b ? { product: b.product, pct: vs.pct } : undefined };
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
console.log("=== NOT PRICES");
for (const r of rows.filter((r) => r.unitPrice == null)) console.log(["N", r.store, r.item, r.price].join(" | "));
console.log("=== EXTREME vs QUEBEC (|pct| >= 60)");
for (const r of rows.filter((r) => r.vs && Math.abs(r.vs.pct) >= 60)) console.log(["X", r.store, r.item, `m=${r.matchName}`, `${r.cmp.price}/${r.cmp.basis}`, `${r.b.product} ${r.vs.pct}%`].join(" | "));
console.log("=== DASHBOARD PROTEINS");
for (const k of proteinsOnSale(rows.map((r, i) => ({ ...r, id: i })))) {
  console.log(["D", k.protein.label, k.best ? `${proteinName(k.best)} @ ${k.best.store} ${k.best.cmp?.price}/${k.best.cmp?.basis} reg=${k.best.regularPrice ?? ""} qc=${k.best.baseline?.pct ?? ""}` : "none", `onSale=${k.onSale.length}/${k.all.length}`, k.onSale.slice(1, 6).map(proteinName).join(", ")].join(" | "));
}

console.log("=== RAW REGULAR (per-lb items with a regular price)");
for (const r of rows.filter((r) => r.unitBasis === "lb" && r.regularPrice != null)) {
  const d = [...raw.values()].find((x) => x.name && r.item.startsWith(String(x.name).trim().replace(/[\s,;]+$/, "").slice(0, 30)));
  console.log("R |", r.store, "|", r.item, "|", r.price, "| reg", r.regularPrice, "|", JSON.stringify(d ? { price: d.price ?? d.current_price, pre: d.pre_price_text, pt: d.price_text, post: d.post_price_text, story: d.sale_story, orig: d.original_price, doff: d.dollars_off, poff: d.percent_off, desc: (d.description || "").slice(0, 140), disc: (d.disclaimer_text || "").slice(0, 100) } : null));
}
