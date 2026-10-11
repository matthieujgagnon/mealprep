import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dealVerdict } from "../lib/flyerIngredients.js";
import { proteinProduct, proteinRows, recipesUsingProtein } from "../lib/proteins.js";
import { DealPhoto } from "./FlyerDeals.jsx";
import { t } from "../i18n/index.js";

// One product on sale under a protein, as a card: its photo (the striped paper
// with the kind's emoji when the flyer has none), name, store, price and what it
// saves. The first card of a kind that has real sales is its best buy and gets the
// green shadow. Tapping it opens its details strip under the grid.
function ProductCard({ deal, facts, emoji, best, open, onToggle }) {
  return (
    <li>
      <button type="button" className={`riso-protein-pcard${best ? " best" : ""}${open ? " open" : ""}`} aria-expanded={open} onClick={onToggle}>
        <span className="riso-protein-pcard-photo">
          <DealPhoto deal={deal} fill emoji={emoji} />
        </span>
        <span className="riso-protein-pcard-body">
          <span className="riso-protein-pcard-name">{facts.name}</span>
          <span className="riso-protein-pcard-store">{facts.store}</span>
          <span className="riso-protein-pcard-foot">
            <span className="riso-protein-pcard-price">
              {facts.amount}
              {facts.unit && <small>{facts.unit}</small>}
            </span>
            {facts.off && <span className="riso-protein-off">{facts.off}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

// The strip for the product that was tapped: when the sale ends, the regular price
// and Quebec's average (each left out when the flyers don't give it), then Add to
// list (tap "On list" to take it off again, with the shared Undo toast) and the
// deal's card on the Flyers page.
function DetailStrip({ deal, facts, listed, busy, onToggleList, onOpenFlyer, stripRef }) {
  const titleId = useId();
  const cols = [
    facts.regular && { cap: t("proteins.regularCap"), val: facts.regular },
    facts.ends && { cap: t("proteins.endsCap"), val: facts.ends },
    facts.qc && { cap: t("proteins.qcCap"), val: facts.qc.text, good: facts.qc.good },
  ].filter(Boolean);
  return (
    <div className="riso-protein-detail" role="group" aria-labelledby={titleId} ref={stripRef}>
      <span className="riso-protein-detail-title" id={titleId}>
        {facts.name} · {facts.store}
      </span>
      {cols.length > 0 && (
        <div className="riso-protein-stats" style={{ "--stat-cols": cols.length }}>
          {cols.map((c) => (
            <div key={c.cap}>
              <span className="riso-protein-stat-cap">{c.cap}</span>
              <span className={`riso-protein-stat-val${c.good ? " good" : ""}`}>{c.val}</span>
            </div>
          ))}
        </div>
      )}
      <div className="riso-protein-detail-actions">
        <button type="button" className={`riso-protein-add${listed ? " listed" : ""}`} aria-busy={busy} onClick={onToggleList}>
          {listed ? t("proteins.onList") : t("proteins.addToList")}
        </button>
        <button type="button" className="riso-protein-flyer" onClick={() => onOpenFlyer?.(deal)}>
          {t("flyers.seeInFlyers")}
        </button>
      </div>
    </div>
  );
}

// Home's "Proteins on sale": a row for each kind of protein with something on
// this week's flyers (Chicken, Seafood, Fish, Beef, Pork, Tofu, Turkey, Lamb, in
// that order; a kind with no sale has no row), each with its best buy's price, how
// good a buy it is and how many products are on sale. One row says "Best deal":
// the one whose best buy saves the most. A kind on a flyer with nothing to compare
// its price to says "Can't tell yet" and still opens, onto its prices.
//
// A row is a button. It opens a pop-out under it with every product as a card,
// best buy first (see proteinRows); the other rows blur and dim, and only one
// is open at a time. Tap outside, the row again or press Esc to close it, and
// focus goes back to the row. A line at the bottom opens Recipes with that
// protein's filter on (the same match counts and filters, see
// recipeUsesProtein).
//
// While the deals load the card shows quiet placeholder rows; with none loaded, or
// none that are proteins, or the load failed (with Try again), it says so in one
// line.
export function ProteinsOnSale({
  deals,
  loaded = true,
  failed = false,
  onRetry,
  recipes = [],
  onNavigate,
  onFindProtein,
  onOpenFlyer,
  isOnGroceryList = () => false,
  onToggleOnList,
}) {
  const [openId, setOpenId] = useState(null);
  const [productId, setProductId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const busyRef = useRef(false);
  const rowRefs = useRef({});
  const stripRef = useRef(null);
  const panelId = useId();
  const rows = proteinRows(deals);

  const opened = rows.find((k) => k.protein.id === openId) || null;
  const using = opened ? recipesUsingProtein(recipes, opened.protein) : [];
  const product = opened?.products.find((d) => d.id === productId) || null;

  function close({ focus = true } = {}) {
    const id = openId;
    setOpenId(null);
    setProductId(null);
    if (focus && id) rowRefs.current[id]?.focus({ preventScroll: true });
  }

  // The kind went away under it (new deals came in): nothing is open any more.
  useEffect(() => {
    if (openId && !opened) {
      setOpenId(null);
      setProductId(null);
    }
  }, [openId, opened]);

  useEffect(() => {
    if (!openId) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  // A tapped product's strip is under the grid: bring it into view in the pop-out.
  useEffect(() => {
    if (productId) stripRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [productId]);

  // The name a product is on the list under: the one it shows, or its English one
  // (put there before the language changed).
  const listedName = (facts) => [facts.name, facts.english].find((n) => isOnGroceryList(n)) || null;

  // One save at a time: a second tap while the first is still saving is ignored,
  // so two quick taps can't add twice or race an add with a removal.
  async function toggleOnList(deal, facts) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onToggleOnList?.(listedName(facts) || facts.name, { dealId: deal.id });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry?.();
    } finally {
      setRetrying(false);
    }
  }

  const empty = rows.length === 0;
  const loading = !loaded && deals.length === 0;
  const loadFailed = loaded && failed && deals.length === 0;

  return (
    <section className={`riso-home-mini riso-home-proteins${opened ? " has-open" : ""}`} aria-label={t("proteins.label")}>
      <div className="riso-home-mini-header">
        <h3>{t("proteins.title")}</h3>
        <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("flyers")}>
          {t("proteins.flyersLink")}
        </button>
      </div>
      {loading && (
        <div className="riso-protein-skeleton" role="status" aria-busy="true" aria-label={t("proteins.loading")}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="riso-protein-card skeleton" />
          ))}
        </div>
      )}
      {loadFailed && (
        <div className="riso-protein-note" role="status">
          <p className="riso-empty-note">{t("proteins.loadFailed")}</p>
          <button type="button" className="riso-protein-retry" aria-busy={retrying} onClick={retry}>
            {t("proteins.tryAgain")}
          </button>
        </div>
      )}
      {loaded && !loadFailed && empty && (
        <p className="riso-empty-note" role="status">
          {deals.length === 0 ? t("proteins.noDeals") : t("proteins.noneOnSale")}
        </p>
      )}
      {!empty && (
        <ul className="riso-home-rows riso-protein-list">
          {rows.map((k) => {
            const { protein, best, products, status } = k;
            const isOpen = opened?.protein.id === protein.id;
            const dimmed = !!opened && !isOpen;
            const verdict = dealVerdict(best);
            const bestFacts = proteinProduct(best);
            return (
              <li key={protein.id} className={`riso-protein-item-li${isOpen ? " open" : ""}`}>
                <button
                  type="button"
                  ref={(el) => {
                    rowRefs.current[protein.id] = el;
                  }}
                  className={`riso-protein-card${isOpen ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onClick={() => {
                    setOpenId(isOpen ? null : protein.id);
                    setProductId(null);
                  }}
                  aria-label={t("proteins.rowLabel", {
                    kind: protein.label,
                    name: bestFacts.name,
                    store: best.store,
                    price: `${bestFacts.amount}${bestFacts.unit}`,
                    verdict: verdict?.label || "",
                  })}
                >
                  <span className="riso-protein-emoji" aria-hidden="true">
                    {protein.emoji}
                  </span>
                  <span className="riso-protein-item">
                    <span className="riso-protein-name">{protein.label}</span>
                    <span className="riso-protein-count">{t("proteins.products", { count: products.length })}</span>
                  </span>
                  <span className="riso-protein-right">
                    <span className="riso-protein-price">
                      {bestFacts.amount}
                      {bestFacts.unit && <small>{bestFacts.unit}</small>}
                    </span>
                    {k.bestDeal ? (
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
                  <div className="riso-protein-panel" id={panelId} role="region" aria-label={t("proteins.panelLabel", { kind: protein.label })}>
                    <ul className="riso-protein-grid">
                      {products.map((deal, i) => (
                        <ProductCard
                          key={deal.id}
                          deal={deal}
                          facts={proteinProduct(deal)}
                          emoji={protein.emoji}
                          best={status === "deal" && i === 0}
                          open={productId === deal.id}
                          onToggle={() => setProductId((cur) => (cur === deal.id ? null : deal.id))}
                        />
                      ))}
                    </ul>
                    {product && (
                      <DetailStrip
                        deal={product}
                        facts={proteinProduct(product)}
                        listed={!!listedName(proteinProduct(product))}
                        busy={busy}
                        stripRef={stripRef}
                        onToggleList={() => toggleOnList(product, proteinProduct(product))}
                        onOpenFlyer={onOpenFlyer}
                      />
                    )}
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
      )}
      <div className="riso-home-mini-spacer" />
      {opened && createPortal(<div className="riso-protein-scrim" aria-hidden="true" onClick={() => close()} />, document.body)}
    </section>
  );
}
