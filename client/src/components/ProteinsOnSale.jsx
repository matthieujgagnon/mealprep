import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings, dealVerdict, savingText as savingWords, tilePrice } from "../lib/flyerIngredients.js";
import { flyerUrl } from "../lib/flyerLinks.js";
import { parseDateKey } from "../lib/dates.js";
import { proteinName, proteinRows, recipesUsingProtein } from "../lib/proteins.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { DealPhoto } from "./FlyerDeals.jsx";
import { dict, t } from "../i18n/index.js";
import { formatMoney, localizePrice, perUnit } from "../i18n/format.js";

// { amount: "$2.99", unit: "/lb" } - the price per lb (or each); "2,99 $"
// and "/lb" or " ch." in French.
function priceParts(deal) {
  const p = tilePrice(deal);
  if (!p) return { amount: localizePrice(deal.price), unit: "" };
  return { amount: formatMoney(p.price), unit: perUnit(p.basis) };
}

function perLbText(deal) {
  const { amount, unit } = priceParts(deal);
  return `${amount}${unit}`;
}

// "50% off" - or the flyer's own words ("$3.00 off") when it gives no percent.
function offText(deal) {
  const s = dealSavings(deal);
  if (!s) return null;
  return s.pct != null ? t("proteins.offPct", { pct: Math.round(s.pct * 100) }) : savingWords(s);
}

// The regular price on the same footing as the price shown (per lb, per
// each). The flyer states it in the unit of its own price.
function regularText(deal) {
  const p = tilePrice(deal);
  if (!deal.regularPrice || !p || !deal.unitPrice) return null;
  return `${formatMoney(deal.regularPrice * (p.price / deal.unitPrice))}${perUnit(p.basis)}`;
}

// "today", "tomorrow", then the weekday ("Wednesday").
function endsText(validUntil) {
  if (!validUntil) return null;
  const days = daysUntil(validUntil);
  if (days < 0) return null;
  if (days === 0) return t("proteins.endsToday");
  if (days === 1) return t("proteins.endsTomorrow");
  const name = dict().days.long[(parseDateKey(String(validUntil).slice(0, 10)).getDay() + 6) % 7];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// How the price sits against Quebec's average (Statistics Canada), when we
// know it: "-45%", "+12%" or "near average".
function quebecText(deal) {
  const pct = deal.baseline?.pct;
  if (pct == null) return null;
  if (pct <= -1) return { text: t("proteins.qcLess", { pct: Math.abs(pct) }), good: true };
  if (pct >= 1) return { text: t("proteins.qcMore", { pct }), good: false };
  return { text: t("proteins.qcNear"), good: false };
}

// One product on sale under a protein: photo, name, store, price and what
// it saves. Tapping it opens its details (regular price, when it ends,
// Quebec's average) with "Add to list" and a link to the store's flyer.
function ProductRow({ deal, open, onToggle, listed, onAdd, postalCode }) {
  const { amount, unit } = priceParts(deal);
  const off = offText(deal);
  const regular = regularText(deal);
  const ends = endsText(deal.validUntil);
  const qc = quebecText(deal);
  const name = proteinName(deal);
  return (
    <li className={`riso-protein-product${open ? " open" : ""}`}>
      <button type="button" className="riso-protein-product-head" aria-expanded={open} onClick={onToggle}>
        <DealPhoto deal={deal} size={36} />
        <span className="riso-protein-product-text">
          <span className="riso-protein-product-name">{name}</span>
          <span className="riso-protein-product-store">
            {deal.store} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
          </span>
        </span>
        <span className="riso-protein-product-right">
          <span className="riso-protein-product-price">
            {amount}
            {unit && <small>{unit}</small>}
          </span>
          {off && <span className="riso-protein-off">{off}</span>}
        </span>
      </button>
      {open && (
        <div className="riso-protein-detail">
          <div className="riso-protein-stats">
            <div>
              <span className="riso-protein-stat-cap">{t("proteins.regularCap")}</span>
              <span className="riso-protein-stat-val">{regular || "—"}</span>
            </div>
            <div>
              <span className="riso-protein-stat-cap">{t("proteins.endsCap")}</span>
              <span className="riso-protein-stat-val">{ends || "—"}</span>
            </div>
            <div>
              <span className="riso-protein-stat-cap">{t("proteins.qcCap")}</span>
              <span className={`riso-protein-stat-val${qc?.good ? " good" : ""}`}>{qc?.text || "—"}</span>
            </div>
          </div>
          <div className="riso-protein-detail-actions">
            <button
              type="button"
              className={`riso-protein-add${listed ? " listed" : ""}`}
              disabled={listed}
              onClick={() => onAdd(deal, name)}
            >
              {listed ? t("proteins.onList") : t("proteins.addToList")}
            </button>
            <a className="riso-protein-flyer" href={flyerUrl(deal.store, postalCode)} target="_blank" rel="noreferrer">
              {t("proteins.openFlyer")}
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

// Home's "Proteins on sale": one card for every general protein, always
// (chicken, beef, pork, fish, seafood, turkey, lamb, tofu), whatever specific
// cuts the flyers have under it. A protein with a real sale shows its price
// per lb for the best buy, the "Best deal" tag on the cheapest per lb (the
// others say how good a buy they are) and how many products are on sale.
// Tapping it opens a panel of those products - only real sales, see
// proteinRows - and the rest of the page blurs until it closes (tap
// outside, the same card, or Esc). A protein on a flyer with nothing to
// compare its price to says "Can't tell yet" and one with nothing says "No
// deal this week"; neither opens. The panel ends with a link that opens
// Recipes with that protein's filter on (the same match counts and filters,
// see recipeUsesProtein).
export function ProteinsOnSale({ deals, recipes = [], onNavigate, onFindProtein, isOnGroceryList = () => false, onAddToList }) {
  const [openId, setOpenId] = useState(null);
  const [productId, setProductId] = useState(null);
  // Only needed for a store that has no flyer page of its own.
  const [postalCode, setPostalCode] = useState(null);
  const rows = proteinRows(deals);
  const perLb = (d) => {
    const p = tilePrice(d);
    return p?.basis === "lb" ? p.price : Infinity;
  };
  const cheapest = rows
    .filter((k) => k.status === "deal")
    .reduce((best, k) => (best == null || perLb(k.best) < perLb(best.best) ? k : best), null);

  const opened = rows.find((k) => k.status === "deal" && k.protein.id === openId) || null;
  const using = opened ? recipesUsingProtein(recipes, opened.protein) : [];

  function close() {
    setOpenId(null);
    setProductId(null);
  }

  useEffect(() => {
    if (!openId) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  useEffect(() => {
    if (!openId || postalCode != null) return;
    api
      .getFlyerSettings()
      .then((s) => setPostalCode(s?.postalCode || ""))
      .catch(() => setPostalCode(""));
  }, [openId, postalCode]);

  return (
    <section
      className={`riso-home-mini riso-home-proteins${opened ? " has-open" : ""}`}
      aria-label={t("proteins.label")}
    >
      <div className="riso-home-mini-header">
        <h3>{t("proteins.title")}</h3>
        <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("flyers")}>
          {t("proteins.flyersLink")}
        </button>
      </div>
      {deals.length === 0 && <p className="riso-empty-note">{t("proteins.noDeals")}</p>}
      <ul className="riso-home-rows riso-protein-list">
        {rows.map((k) => {
          const { protein, best, onSale, status } = k;
          const isOpen = opened?.protein.id === protein.id;
          const dimmed = !!opened && !isOpen;
          if (status !== "deal") {
            return (
              <li key={protein.id}>
                <div className={`riso-protein-card none${dimmed ? " dimmed" : ""}`}>
                  <span className="riso-protein-emoji" aria-hidden="true">
                    {protein.emoji}
                  </span>
                  <span className="riso-protein-item">
                    <span className="riso-protein-name">{protein.label}</span>
                    <span className="riso-protein-meta">
                      {best ? `${proteinName(best)} · ${best.store}` : t("proteins.noDeal")}
                    </span>
                  </span>
                  {best && (
                    <span className="riso-protein-right">
                      <span className="riso-protein-price">
                        {priceParts(best).amount}
                        {priceParts(best).unit && <small>{priceParts(best).unit}</small>}
                      </span>
                      <span className="riso-protein-verdict unknown">{dealVerdict(best)?.label}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          }
          const verdict = dealVerdict(best);
          const { amount, unit } = priceParts(best);
          return (
            <li key={protein.id} className={`riso-protein-item-li${isOpen ? " open" : ""}`}>
              <button
                type="button"
                className={`riso-protein-card${isOpen ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenId(isOpen ? null : protein.id);
                  setProductId(null);
                }}
                aria-label={t("proteins.rowLabel", {
                  kind: protein.label,
                  name: proteinName(best),
                  store: best.store,
                  price: perLbText(best),
                  verdict: verdict?.label || "",
                })}
              >
                <span className="riso-protein-emoji" aria-hidden="true">
                  {protein.emoji}
                </span>
                <span className="riso-protein-item">
                  <span className="riso-protein-name">{protein.label}</span>
                  <span className="riso-protein-count">{t("proteins.products", { count: onSale.length })}</span>
                </span>
                <span className="riso-protein-right">
                  <span className="riso-protein-price">
                    {amount}
                    {unit && <small>{unit}</small>}
                  </span>
                  {k === cheapest ? (
                    <span className="riso-protein-best">{t("proteins.bestDeal")}</span>
                  ) : (
                    verdict && <span className={`riso-protein-verdict ${verdict.key}`}>{verdict.label}</span>
                  )}
                </span>
                <span className="riso-protein-chevron" aria-hidden="true">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="riso-protein-panel" role="region" aria-label={t("proteins.panelLabel", { kind: protein.label })}>
                  <ul className="riso-protein-products">
                    {onSale.map((deal) => (
                      <ProductRow
                        key={deal.id}
                        deal={deal}
                        open={productId === deal.id}
                        onToggle={() => setProductId((cur) => (cur === deal.id ? null : deal.id))}
                        listed={isOnGroceryList(proteinName(deal))}
                        onAdd={(d, name) => onAddToList?.([name], { dealId: d.id })}
                        postalCode={postalCode}
                      />
                    ))}
                  </ul>
                  <div className="riso-protein-recipes">
                    {using.length > 0 ? (
                      <button type="button" className="riso-protein-recipes-link" onClick={() => onFindProtein?.(protein.id)}>
                        {t("proteins.seeRecipes", { count: using.length, name: t(`proteins.useName.${protein.id}`) })}
                      </button>
                    ) : (
                      <p role="status">{t("proteins.barNone", { name: t(`proteins.useNameNone.${protein.id}`) })}</p>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="riso-home-mini-spacer" />
      {opened && createPortal(<div className="riso-protein-scrim" aria-hidden="true" onClick={close} />, document.body)}
    </section>
  );
}
