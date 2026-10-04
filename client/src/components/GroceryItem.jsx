import { useEffect, useState } from "react";
import { useJustChecked } from "../hooks/useJustChecked.js";
import { recipeAmountLabel } from "../lib/groceryChecks.js";
import { cleanQuantityTyping, displayQuantity, quantityToSave } from "../lib/groceryQuantity.js";
import { RecipesLine } from "./RecipesLine.jsx";
import { localizePrice } from "../i18n/format.js";
import { t } from "../i18n/index.js";

// The one grocery item, drawn the same in By store, By aisle, By recipe and
// Store mode (design handoff: docs/design/grocery-item/README.md). Left to
// right: the checkbox, the text column (the name alone on its line, then a
// meta line of brand, recipes, the recipe quantity on a phone and in Store mode, and the sale
// tag) and, in a list, the right cluster: "+ Inventory" once checked, the
// recipe quantity (desktop), how many to buy, and the remove ×.
//
//   variant "line"   a row in a list. Only the checkbox checks it; a flyer item's
//                    row opens its deal. Sized by CSS (--gi-min, --gi-h).
//   variant "store"  a row in Store mode. The whole row checks it, no × and no
//                    inventory button, the number is static.
//
// The two forms share every part and every rule here, and differ only in their
// CSS (class names: riso-row-* for a list, store-mode-* for Store mode). Names
// are never cut: they wrap, and the view sizes every row for its longest
// (useEqualRowHeight).

const cls = (variant, part) => (variant === "store" ? `store-mode-${part}` : `riso-row-${part}`);

const capitalizeFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

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
  deal, // the best sale on it (store, price), shown while it isn't checked
  brand = "",
  flyerDeal = null, // an item added from a flyer deal: its row opens that deal
  onToggle,
  onOpenDeal,
  onToInventory,
  onDelete,
  onSetQuantity,
  dragging = false,
  rowRef,
  dragProps,
}) {
  const store = variant === "store";
  const justChecked = useJustChecked(checked);
  const c = (part) => cls(variant, part);
  const label = item.name + (item.varieties?.length > 0 ? ` (${item.varieties.join(", ")})` : "");
  const shownName = store ? capitalizeFirst(label) : label;
  const hasRecipes = (item.usedIn || []).length > 0;
  // What the recipes need, with its unit: the only place a unit shows. Not for
  // an item you added yourself.
  const recipeQty = item.isManual ? "" : recipeAmountLabel(item);
  // The sale tag: only in a list (Store mode shows none), and not once it's checked.
  const showDeal = !store && !checked && !!deal?.price;
  const hasMeta = !!brand || hasRecipes || !!recipeQty;

  const metaLine = hasMeta && (
    <span className={c("meta")}>
      {brand && (
        <span className={c("brand")} title={t("grocery.brand", { brand })}>
          {brand}
        </span>
      )}
      {brand && hasRecipes && <span className={c("dot")} aria-hidden="true" />}
      <RecipesLine usedIn={item.usedIn} className={c("recipes")} />
      {recipeQty && (
        <span className={store ? "store-mode-need" : "riso-row-need narrow"} title={t("grocery.recipeQtyTitle")}>
          {recipeQty}
        </span>
      )}
    </span>
  );

  const dealTag = showDeal && (
    <button
      type="button"
      className="riso-row-deal"
      title={t("grocery.onSaleAt", { store: deal.store })}
      onClick={(e) => {
        e.stopPropagation();
        onOpenDeal(deal);
      }}
    >
      <span className="riso-row-deal-store">{deal.store}</span>
      <span className="riso-row-deal-div" aria-hidden="true" />
      <span className="riso-row-deal-price">{localizePrice(deal.price)}</span>
    </button>
  );

  const text = (
    <span className={c("main")} data-gi-text>
      <span className={`${c("name")}${checked ? " struck" : ""}`} title={label}>
        {shownName}
      </span>
      {metaLine}
    </span>
  );

  if (store) {
    return (
      <button
        type="button"
        ref={rowRef}
        data-gi-row
        className={`store-mode-row${checked ? " on" : ""}`}
        aria-pressed={checked}
        onClick={onToggle}
      >
        <span className={`store-mode-check${justChecked ? " pop" : ""}`} aria-hidden="true">
          {checked ? "✓" : ""}
        </span>
        {text}
        <span className="store-mode-qty">{displayQuantity(item)}</span>
      </button>
    );
  }

  return (
    <div
      ref={rowRef}
      data-gi-row
      className={`riso-row${checked ? " checked" : ""}${dragging ? " dragging" : ""}${dragProps ? " draggable" : ""}${flyerDeal ? " opens-deal" : ""}${showDeal ? " has-deal" : ""}`}
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
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className={`riso-row-check${checked ? " on" : ""}${justChecked ? " pop" : ""}`}>{checked ? "✓" : ""}</span>
      </button>
      {text}
      <span className="riso-row-right">
        <span className="riso-row-slot">
          {checked && (
            <button
              type="button"
              className="riso-row-toinv"
              aria-label={t("grocery.toInventoryAria", { name: item.name })}
              onClick={(e) => {
                e.stopPropagation();
                onToInventory();
              }}
            >
              {t("grocery.toInventory")}
            </button>
          )}
          {dealTag}
        </span>
        <span className="riso-row-needcol">
          {recipeQty && (
            <span className="riso-row-need wide" title={t("grocery.recipeQtyTitle")}>
              {recipeQty}
            </span>
          )}
        </span>
        <span className="riso-row-qtycol">
          <QuantityInput item={item} onSave={onSetQuantity} />
        </span>
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
      </span>
    </div>
  );
}
