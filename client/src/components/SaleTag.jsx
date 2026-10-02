import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings } from "../lib/flyerIngredients.js";
import { DealDetailModal } from "./FlyerDeals.jsx";

// "Super C $3.99": where an ingredient is on sale this week, next to it
// wherever it's something to buy (Recipe card, Makeable) - see
// findSaleDeal for what counts as on sale. Tapping it opens the deal's own
// card, the same one Flyers and the Grocery list open.
export function SaleTag({ deal }) {
  const [open, setOpen] = useState(null);
  if (!deal) return null;
  const perUnit =
    deal.unitBasis === "each" && deal.compareBasis && deal.compareBasis !== "each" && deal.comparePrice != null
      ? ` · $${deal.comparePrice.toFixed(2)}/${deal.compareBasis}`
      : "";
  const saving = dealSavings(deal);
  const savingText = saving ? (saving.pct != null ? ` · ${Math.round(saving.pct * 100)}% ${saving.why}` : ` · ${saving.why}`) : "";

  // The list has each deal without its 6-month history; the card opens
  // straight away and fills in the chart when it arrives.
  function openCard(e) {
    e.stopPropagation();
    setOpen(deal);
    api
      .getDeal(deal.id)
      .then((full) => setOpen((cur) => (cur ? { ...cur, ...full } : cur)))
      .catch(() => {});
  }

  return (
    <>
      {/* A span, not a button: it sits inside rows that are buttons. */}
      <span
        role="button"
        tabIndex={0}
        className="riso-sale-tag"
        title={`On sale: ${deal.item}${perUnit}${savingText}`}
        aria-label={`On sale at ${deal.store}, ${deal.price}: see the deal`}
        onClick={openCard}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCard(e);
          }
        }}
      >
        <span className="riso-sale-tag-store">{deal.store}</span>
        <span className="riso-sale-tag-price">{deal.price}</span>
      </span>
      {open &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <DealDetailModal deal={open} onClose={() => setOpen(null)} />
          </div>,
          document.body
        )}
    </>
  );
}
