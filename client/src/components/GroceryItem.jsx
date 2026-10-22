import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { playRow } from "../lib/checkMotion.js";
import { recipeAmountLabel } from "../lib/groceryChecks.js";
import { cleanQuantityTyping, displayQuantity, quantityToSave } from "../lib/groceryQuantity.js";
import { RecipesLine } from "./RecipesLine.jsx";
import { localizePrice } from "../i18n/format.js";
import { t } from "../i18n/index.js";

// The one grocery item, drawn the same in By store, By aisle, By recipe, Store
// mode and Grocery's How it works demo (design handoffs:
// docs/design/grocery-item/README.md, and the list's row in
// docs/design/riso-v2-grocery/README.md). Left to right: the checkbox, the
// text column (the name alone on its line, then a meta line: "→ INVENTORY" when
// queued, "Added by you", the brand, the recipes, and on a phone the recipe
// quantity) and, in a list, the columns: the sale price, the recipe quantity
// (desktop), how many to buy, and the remove ×. On a computer they are the
// shared grid of the store header (ON SALE, RECIPE, BUY).
//
// The checkbox has three steps (lib/groceryChecks.js): to buy, bought ✓
// (`checked`) and queued for Inventory + (`checked` and `queued`). Each tap of
// the box calls `onToggle` (with the row's element, so the list can fly the name chip from
// it), and the list moves it to the next step. When the step changes while the row is on
// screen it plays its own part of the motion (lib/checkMotion.js: the box, the tint, the
// drawn strike-through, the "→ INVENTORY" label); a row that opens already checked doesn't.
// The chip, the counts, the footer and the toast are the list's
// (hooks/useCheckFeedback.js). Design: docs/design/riso-v2-grocery-check-feedback/README.md.
//
//   variant "line"   a row in a list. Only the checkbox checks it; a flyer item's
//                    row opens its deal. Sized by CSS (--gi-min, --gi-h). Without
//                    `onSetQuantity` the number is static, and without `onDelete`
//                    there is no × (the How it works demo).
//   variant "store"  a row in Store mode. The whole row checks it (in or out of
//                    the cart), no ×, the number is static.
//
// The two forms share every part and every rule here, and differ only in their
// CSS (class names: riso-row-* for a list, store-mode-* for Store mode). Names
// are never cut: they wrap, and the view sizes every row for its longest
// (useEqualRowHeight).

const cls = (variant, part) => (variant === "store" ? `store-mode-${part}` : `riso-row-${part}`);

const capitalizeFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// What the next tap of the box does, as its tooltip.
const STEP_TIPS = ["grocery.stepTipBuy", "grocery.stepTipQueue", "grocery.stepTipPutBack"];

// How many to buy: a plain number, edited in place.
function QuantityInput({ item, onSave }) {
  const shown = displayQuantity(item);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  function commit() {
    if (draft.trim() === shown) return; // nothing changed
    const next = quantityToSave(draft, item);
    if (next === undefined) setDraft(shown); // not a number: back to what it was
    else onSave(next);
  }

  return (
    <input
      className={`riso-row-qty${draft.length > 3 ? " long" : ""}`}
      inputMode="decimal"
      autoComplete="off"
      aria-label={t("grocery.quantityOf", { name: item.name })}
      title={t("grocery.setOwnAmount")}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(cleanQuantityTyping(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(shown);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function GroceryItem({
  variant = "line",
  item,
  checked,
  queued = false, // checked and waiting to go into Inventory (the box shows +)
  deal, // the best sale on it (store, price), shown while it isn't checked
  dealStore = false, // name the sale's store after its price (By aisle, By recipe)
  brand = "",
  flyerDeal = null, // an item added from a flyer deal: its row opens that deal
  onHaveAs, // "I have it as…" on a row that comes from recipes (not in Store mode): links its recipe names to an Inventory item
  onToggle,
  onOpenDeal,
  onDelete,
  onSetQuantity,
  dragging = false,
  rowRef,
  dragProps,
}) {
  const store = variant === "store";
  const isQueued = checked && queued;
  const step = !checked ? 0 : isQueued ? 2 : 1;
  const c = (part) => cls(variant, part);

  // The row's own element (for the motion and for the chip), kept next to the drag
  // setup's ref when the list gives one.
  const rootRef = useRef(null);
  const setRoot = useCallback(
    (el) => {
      rootRef.current = el;
      if (typeof rowRef === "function") rowRef(el);
      else if (rowRef) rowRef.current = el;
    },
    [rowRef]
  );
  const lastStep = useRef(step);
  useLayoutEffect(() => {
    const from = lastStep.current;
    lastStep.current = step;
    if (from !== step) playRow(rootRef.current, from, step, { store });
  }, [step, store]);
  const mark = isQueued ? "+" : checked ? "✓" : "";
  const label = item.name + (item.varieties?.length > 0 ? ` (${item.varieties.join(", ")})` : "");
  // Names always start with a capital ("lemons" -> "Lemons").
  const shownName = capitalizeFirst(label);
  const hasRecipes = (item.usedIn || []).length > 0;
  // What the recipes need, with its unit: the only place a unit shows. Not for
  // an item you added yourself.
  const recipeQty = item.isManual ? "" : recipeAmountLabel(item);
  // The sale price: only in a list (Store mode shows none), and not once it's checked.
  const showDeal = !store && !checked && !!deal?.price;
  const mine = !!item.isManual;
  // Store mode shows the name and the number to buy, nothing else.
  const haveAs = !store && !mine && hasRecipes && !!onHaveAs;
  const hasMeta = !store && (isQueued || mine || !!brand || hasRecipes || !!recipeQty);
  const afterQueued = mine || !!brand || hasRecipes;

  const metaLine = hasMeta && (
    <span className={c("meta")}>
      {isQueued && (
        <span className="riso-row-queued" data-gi-label>
          {t("grocery.queuedLabel")}
        </span>
      )}
      {isQueued && afterQueued && <span className={c("dot")} aria-hidden="true" />}
      {mine && <span className="riso-row-mine">{t("grocery.addedByYou")}</span>}
      {brand && (
        <span className={c("brand")} title={t("grocery.brand", { brand })}>
          {brand}
        </span>
      )}
      {brand && hasRecipes && <span className={c("dot")} aria-hidden="true" />}
      {hasRecipes && <RecipesLine usedIn={item.usedIn} className={c("recipes")} />}
      {recipeQty && (
        <span className="riso-row-need narrow" title={t("grocery.recipeQtyTitle")}>
          {recipeQty}
        </span>
      )}
      {haveAs && (
        <button
          type="button"
          className="riso-row-haveas"
          aria-label={t("links.haveAsAria", { name: shownName })}
          onClick={(e) => {
            e.stopPropagation();
            onHaveAs();
          }}
        >
          {t("links.haveAs")}
        </button>
      )}
    </span>
  );

  // The sale price: a green dot, the price underlined and ›; it opens the deal's
  // card. In By aisle and By recipe the store follows the price.
  const dealTag = showDeal && (
    <button
      type="button"
      className="riso-row-deal"
      title={t("grocery.onSaleAt", { store: deal.store })}
      aria-label={t("grocery.salePriceAria", { name: shownName, price: localizePrice(deal.price), store: deal.store })}
      onClick={(e) => {
        e.stopPropagation();
        onOpenDeal(deal);
      }}
    >
      <span className="riso-row-deal-dot" aria-hidden="true" />
      <span className="riso-row-deal-price">{localizePrice(deal.price)}</span>
      {dealStore && <span className="riso-row-deal-store">{deal.store}</span>}
      <span className="riso-row-deal-go" aria-hidden="true">
        ›
      </span>
    </button>
  );

  const text = (
    <span className={c("main")} data-gi-text>
      <span className={`${c("name")}${checked ? " struck" : ""}`} data-gi-name title={label}>
        <span className="mm-strike" data-gi-strike>
          {shownName}
        </span>
      </span>
      {metaLine}
    </span>
  );

  if (store) {
    return (
      <button
        type="button"
        ref={setRoot}
        data-gi-row
        data-gi-key={item.key}
        data-step={step}
        className={`store-mode-row${checked ? " on" : ""}${isQueued ? " queued" : ""}`}
        aria-pressed={checked}
        onClick={() => onToggle(rootRef.current)}
      >
        <span className="store-mode-check" data-gi-box aria-hidden="true">
          {mark && (
            <span className="mm-mark" data-gi-mark>
              {mark}
            </span>
          )}
        </span>
        {text}
        <span className="store-mode-qty">{displayQuantity(item)}</span>
      </button>
    );
  }

  return (
    <div
      ref={setRoot}
      data-gi-row
      data-gi-key={item.key}
      data-step={step}
      className={`riso-row${checked ? " checked" : ""}${isQueued ? " queued" : ""}${dragging ? " dragging" : ""}${dragProps ? " draggable" : ""}${flyerDeal ? " opens-deal" : ""}`}
      {...(flyerDeal
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": t("grocery.openDeal", { name: item.name }),
            onClick: () => onOpenDeal(flyerDeal),
            onKeyDown: (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDeal(flyerDeal);
              }
            },
          }
        : {})}
      {...dragProps}
    >
      <button
        type="button"
        className="riso-row-check-hit"
        role="checkbox"
        aria-checked={checked}
        aria-label={t("grocery.checkOff", { name: item.name })}
        title={t(STEP_TIPS[step])}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(rootRef.current);
        }}
      >
        <span className={`riso-row-check${checked ? " on" : ""}${isQueued ? " queued" : ""}`} data-gi-box>
          {mark && (
            <span className="mm-mark" data-gi-mark>
              {mark}
            </span>
          )}
        </span>
      </button>
      {text}
      <span className="riso-row-right">
        <span className="riso-row-slot">{dealTag}</span>
        <span className="riso-row-needcol">
          {recipeQty && (
            <span className="riso-row-need wide" title={t("grocery.recipeQtyTitle")}>
              {recipeQty}
            </span>
          )}
        </span>
        <span className="riso-row-qtycol">
          {onSetQuantity ? (
            <QuantityInput item={item} onSave={onSetQuantity} />
          ) : (
            <span className="riso-row-qty">{displayQuantity(item)}</span>
          )}
        </span>
        {onDelete && (
          <button
            type="button"
            className="riso-row-delete"
            aria-label={t("grocery.removeAria", { name: item.name })}
            title={item.isManual ? t("grocery.deleteItem") : t("grocery.removeFromList")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
        )}
      </span>
    </div>
  );
}
