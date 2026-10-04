import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings, dealVerdict, savingText as savingWords, tilePrice } from "../lib/flyerIngredients.js";
import { proteinName, proteinRows, proteinSearchQuery, recipesUsingProtein } from "../lib/proteins.js";
import { DealDetailModal } from "./FlyerDeals.jsx";
import { t } from "../i18n/index.js";
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

function savingText(deal) {
  const s = dealSavings(deal);
  return s ? savingWords(s) : null;
}

// Home's "Proteins on sale": one row for every general protein, always (chicken,
// beef, pork, fish, seafood, turkey, lamb & veal, tofu), whatever specific cuts
// the flyers have under it. A protein with a real deal shows its general name
// with its best buy under it (the product, store and saving) and the price per
// lb; the cheapest per lb is the "Best deal", the others say how good a buy
// they are. One on a flyer with nothing to compare its price to says "Can't
// tell yet"; one with nothing says "No deal this week". Tapping a row selects
// that protein (tap it again, or another, to change); a bar slides up at the
// bottom of the screen with how many of your recipes use any kind of it and a
// link to those same recipes in Recipes. A selected row with a deal has a "See
// the deal" button for its deal card, with the protein's other items under
// "Also on sale".
export function ProteinsOnSale({ deals, recipes = [], onNavigate, onFindRecipes }) {
  const [open, setOpen] = useState(null); // { deal, others }
  const [selectedId, setSelectedId] = useState(null);
  const rows = proteinRows(deals);
  const perLb = (d) => {
    const p = tilePrice(d);
    return p?.basis === "lb" ? p.price : Infinity;
  };
  const cheapest = rows
    .filter((k) => k.status === "deal")
    .reduce((best, k) => (best == null || perLb(k.best) < perLb(best.best) ? k : best), null);

  const selected = rows.find((k) => k.protein.id === selectedId)?.protein || null;
  const using = selected ? recipesUsingProtein(recipes, selected) : [];

  function show(deal, others) {
    setOpen({ deal, others });
    api
      .getDeal(deal.id)
      .then((full) => setOpen((cur) => (cur?.deal.id === deal.id ? { ...cur, deal: { ...cur.deal, ...full } } : cur)))
      .catch(() => {});
  }

  return (
    <section className="riso-home-mini riso-home-proteins" aria-label={t("proteins.label")}>
      <div className="riso-home-mini-header">
        <h3>{t("proteins.title")}</h3>
        <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("flyers")}>
          {t("proteins.flyersLink")}
        </button>
      </div>
      {deals.length === 0 && <p className="riso-empty-note">{t("proteins.noDeals")}</p>}
      <ul className="riso-home-rows riso-protein-list">
        {rows.map((k) => {
          const { protein, best, onSale, all, status } = k;
          const isSelected = selectedId === protein.id;
          const toggle = () => setSelectedId((cur) => (cur === protein.id ? null : protein.id));
          if (!best) {
            return (
              <li key={protein.id}>
                <div className={`riso-protein-card none${isSelected ? " selected" : ""}`}>
                  <button
                    type="button"
                    className="riso-protein-row"
                    aria-pressed={isSelected}
                    onClick={toggle}
                    aria-label={t("proteins.rowLabelNone", { kind: protein.label })}
                  >
                    <span className="riso-protein-emoji" aria-hidden="true">
                      {protein.emoji}
                    </span>
                    <span className="riso-protein-item">
                      <span className="riso-protein-name">{protein.label}</span>
                      <span className="riso-protein-meta">{t("proteins.noDeal")}</span>
                    </span>
                  </button>
                </div>
              </li>
            );
          }
          const verdict = dealVerdict(best);
          const others = all.filter((d) => d.id !== best.id);
          const { amount, unit } = priceParts(best);
          const saving = savingText(best);
          return (
            <li key={protein.id}>
              <div className={`riso-protein-card${isSelected ? " selected" : ""}`}>
                <button
                  type="button"
                  className="riso-protein-row"
                  aria-pressed={isSelected}
                  onClick={toggle}
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
                    <span className="riso-protein-meta">
                      {proteinName(best)} · {best.store}
                      {saving ? ` · ${saving}` : ""}
                      {onSale.length > 1 ? t("proteins.more", { count: onSale.length - 1 }) : ""}
                    </span>
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
                </button>
                {isSelected && (
                  <button type="button" className="riso-protein-deal-link" onClick={() => show(best, others)}>
                    {t("proteins.seeDeal")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="riso-home-mini-spacer" />
      {selected &&
        createPortal(
          <div className="riso-theme riso-protein-bar-wrap" data-theme="light">
            {using.length > 0 ? (
              <button
                type="button"
                className="riso-protein-bar"
                onClick={() => onFindRecipes?.(proteinSearchQuery(selected))}
              >
                <span>{t("proteins.barUse", { count: using.length, name: t(`proteins.useName.${selected.id}`) })}</span>
                <span className="riso-protein-bar-go">{t("home.seeThem")}</span>
              </button>
            ) : (
              <div className="riso-protein-bar none" role="status">
                {t("proteins.barNone", { name: t(`proteins.useNameNone.${selected.id}`) })}
              </div>
            )}
          </div>,
          document.body
        )}
      {open &&
        createPortal(
          <DealDetailModal
            deal={open.deal}
            others={open.others}
            onOpenOther={(d) => show(d, [open.deal, ...open.others].filter((o) => o.id !== d.id))}
            onClose={() => setOpen(null)}
          />,
          document.body
        )}
    </section>
  );
}
