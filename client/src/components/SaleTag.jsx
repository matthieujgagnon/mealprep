import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings, savingText as savingWords } from "../lib/flyerIngredients.js";
import { DealDetailModal } from "./FlyerDeals.jsx";
import { t } from "../i18n/index.js";
import { formatUnitPrice, localizePrice } from "../i18n/format.js";

// "Super C $3.99": where an ingredient is on sale this week, next to it
// wherever it's something to buy (Recipe card, Makeable) - see
// findSaleDeal for what counts as on sale. Tapping it opens the deal's own
// card, the same one Flyers and the Grocery list open.
export function SaleTag({ deal, others = [] }) {
  const [open, setOpen] = useState(null);
  if (!deal) return null;
  const perUnit =
    deal.unitBasis === "each" && deal.compareBasis && deal.compareBasis !== "each" && deal.comparePrice != null
      ? ` · ${formatUnitPrice(deal.comparePrice, deal.compareBasis)}`
      : "";
  const saving = dealSavings(deal);
  const savingText = saving ? ` · ${savingWords(saving)}` : "";

  // The list has each deal without its 6-month history; the card opens
  // straight away and fills in the chart when it arrives.
  function openCard(e) {
    e.stopPropagation();
    show(deal);
  }
  function show(d) {
    setOpen(d);
    api
      .getDeal(d.id)
      .then((full) => setOpen((cur) => (cur?.id === d.id ? { ...cur, ...full } : cur)))
      .catch(() => {});
  }

  return (
    <>
      {/* A span, not a button: it sits inside rows that are buttons. */}
      <span
        role="button"
        tabIndex={0}
        className="riso-sale-tag"
        title={t("saleTag.title", { item: deal.item, perUnit, saving: savingText })}
        aria-label={t("saleTag.label", { store: deal.store, price: localizePrice(deal.price) })}
        onClick={openCard}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCard(e);
          }
        }}
      >
        <span className="riso-sale-tag-store">{deal.store}</span>
        <span className="riso-sale-tag-price">{localizePrice(deal.price)}</span>
      </span>
      {open &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <DealDetailModal
              deal={open}
              others={[deal, ...others].filter((d) => d.id !== open.id)}
              onOpenOther={show}
              onClose={() => setOpen(null)}
            />
          </div>,
          document.body
        )}
    </>
  );
}
