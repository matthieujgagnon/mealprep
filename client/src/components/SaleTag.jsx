import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings, savingText as savingWords } from "../lib/flyerIngredients.js";
import { DealDetailModal } from "./FlyerDeals.jsx";
import { t } from "../i18n/index.js";
import { formatUnitPrice, localizePrice } from "../i18n/format.js";

// A deal's own card (DealDetailModal) over the page, for the places that only
// have the deal and no state of their own: the recipe card's sale tag and the
// sale marks on a Makeable card. The list has each deal without its 6-month history; the card
// opens straight away and fills in the chart when it arrives. `others` are the
// same product at other stores (tapping one swaps the card in place). The
// buttons show only when given a handler: `onList` (with `listed` for its
// state) and `onOpenCirculaires`, which goes to that deal on the Flyers page.
export function DealDetailHost({ deal, others = [], listed, onList, onOpenCirculaires, onClose }) {
  const [open, setOpen] = useState(deal);
  function show(d) {
    setOpen(d);
    api
      .getDeal(d.id)
      .then((full) => setOpen((cur) => (cur?.id === d.id ? { ...cur, ...full } : cur)))
      .catch(() => {});
  }
  useEffect(() => {
    show(deal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <DealDetailModal
        deal={listed === undefined ? open : { ...open, isListed: listed }}
        others={[deal, ...others].filter((d) => d.id !== open.id)}
        onOpenOther={show}
        onList={onList}
        onOpenCirculaires={onOpenCirculaires ? () => onOpenCirculaires(open) : undefined}
        onClose={onClose}
      />
    </div>,
    document.body
  );
}

// "Super C $3.99": where an ingredient is on sale this week, next to it
// wherever it's something to buy (Recipe card) - see findSaleDeal for what
// counts as on sale. Tapping it opens the deal's own card, the same one Flyers
// and the Grocery list open.
export function SaleTag({ deal, others = [] }) {
  const [open, setOpen] = useState(false);
  if (!deal) return null;
  const perUnit =
    deal.unitBasis === "each" && deal.compareBasis && deal.compareBasis !== "each" && deal.comparePrice != null
      ? ` · ${formatUnitPrice(deal.comparePrice, deal.compareBasis)}`
      : "";
  const saving = dealSavings(deal);
  const savingText = saving ? ` · ${savingWords(saving)}` : "";

  function openCard(e) {
    e.stopPropagation();
    setOpen(true);
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
      {open && <DealDetailHost deal={deal} others={others} onClose={() => setOpen(false)} />}
    </>
  );
}
