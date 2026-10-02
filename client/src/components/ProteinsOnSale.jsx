import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { dealSavings, dealVerdict, tilePrice } from "../lib/flyerIngredients.js";
import { proteinName, proteinsOnSale } from "../lib/proteins.js";
import { DealDetailModal } from "./FlyerDeals.jsx";

function perLbText(deal) {
  const p = tilePrice(deal);
  if (!p) return deal.price;
  const unit = p.basis === "each" ? " ea" : `/${p.basis}`;
  return `$${p.price.toFixed(2)}${unit}`;
}

function savingText(deal) {
  const s = dealSavings(deal);
  if (!s) return null;
  return s.pct != null ? `${Math.round(s.pct * 100)}% ${s.why}` : s.why;
}

// Home's "Proteins on sale this week": chicken, beef, pork, fish... each
// with its best buy of the week (a plain cut, not a pie or a sausage), its
// price per lb, the store and whether it's worth buying. Tapping a row
// opens that deal's card, with the kind's other sale items under "Also on
// sale".
export function ProteinsOnSale({ deals, onNavigate, footer = null }) {
  const [open, setOpen] = useState(null); // { deal, others }
  const kinds = proteinsOnSale(deals);

  function show(deal, others) {
    setOpen({ deal, others });
    api
      .getDeal(deal.id)
      .then((full) => setOpen((cur) => (cur?.deal.id === deal.id ? { ...cur, deal: { ...cur.deal, ...full } } : cur)))
      .catch(() => {});
  }

  return (
    <section className="riso-home-mini riso-home-proteins" aria-label="Proteins on sale this week">
      <div className="riso-home-mini-header">
        <h3>Proteins on sale</h3>
        <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("flyers")}>
          Flyers →
        </button>
      </div>
      {deals.length === 0 ? (
        <p className="riso-empty-note">No flyer deals loaded yet.</p>
      ) : kinds.length === 0 ? (
        <p className="riso-empty-note">No meat or fish on this week's flyers.</p>
      ) : (
        <ul className="riso-protein-list">
          {kinds.map(({ protein, best, onSale, all }) => {
            if (!best) {
              return (
                <li key={protein.id} className="riso-protein-row none">
                  <span className="riso-protein-kind">
                    <span aria-hidden="true">{protein.emoji}</span> {protein.label}
                  </span>
                  <span className="riso-protein-none">Nothing really on sale</span>
                </li>
              );
            }
            const verdict = dealVerdict(best);
            const others = all.filter((d) => d.id !== best.id);
            const more = onSale.length - 1;
            return (
              <li key={protein.id}>
                <button
                  type="button"
                  className="riso-protein-row"
                  onClick={() => show(best, others)}
                  aria-label={`${protein.label}: ${proteinName(best)} at ${best.store}, ${perLbText(best)}. ${verdict?.label || ""}`}
                >
                  <span className="riso-protein-kind">
                    <span aria-hidden="true">{protein.emoji}</span> {protein.label}
                  </span>
                  <span className="riso-protein-item">
                    <span className="riso-protein-name">{proteinName(best)}</span>
                    <span className="riso-protein-meta">
                      {best.store}
                      {savingText(best) ? ` · ${savingText(best)}` : ""}
                      {more > 0 ? ` · +${more} more` : ""}
                    </span>
                  </span>
                  <span className="riso-protein-price">{perLbText(best)}</span>
                  {verdict && <span className={`riso-protein-verdict ${verdict.key}`}>{verdict.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {footer}
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
