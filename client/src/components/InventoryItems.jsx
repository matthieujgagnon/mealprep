import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { formatFractionQuantity, parseQuantityInput, unitLabel } from "../lib/units.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { daysUntil } from "../lib/pantryInventory.js";
import { lineForDays, qtyStep } from "../lib/inventoryForm.js";
import { ItemPhoto } from "./ItemPhoto.jsx";
import { t } from "../i18n/index.js";

// One Inventory item, in the two views of Matt's design
// (docs/design/riso-v2-inventory-compact-tiles/README.md):
//  - Compact: a 48px row with the shelf-life strip down its left edge, the
//    thumbnail, the name (and the Expired pill under it), the amount and the box.
//  - Tiles: a white photo well with the box and the Expired tag on it, a two-line
//    name, the amount, and the shelf-life bar along the bottom.
// Days left are Quebec days (`daysUntil`): the use-by day says "today" and is not
// expired; Expired is from the day after. The strip and the bar show the life left
// (`lineForDays`). Clicking an item opens the item pop-up; the box only selects.

// Days left, or null with no use-by date.
export function daysLeftOf(item) {
  return item.expiresAt ? daysUntil(item.expiresAt) : null;
}

// What a screen reader hears after the name, and the leftover line shows.
function daysLabel(days) {
  if (days == null) return "";
  if (days < 0) return t("inventory.expired");
  if (days === 0) return t("expiry.today").toLowerCase();
  if (days === 1) return t("inventory.useByTomorrow");
  return t("inventory.daysLeft", { count: days });
}

const amountText = (quantity) => formatFractionQuantity(quantity);

// The amount and its measure. In Compact it is a button: tap it to change them
// right there (− / typed / + and the unit); Enter or tapping away saves, Escape
// puts it back. Its clicks and drags stay off the row, so editing never opens the
// pop-up or starts a drag. In Tiles (`still`) it is plain text, and a tap opens
// the pop-up, which has the amount.
function CardQuantity({ item, onUpdate, still = false, onEditing }) {
  const [draft, setDraft] = useState(null);
  const inputRef = useRef(null);
  const editing = draft !== null;
  const step = qtyStep(draft?.unit ?? item.unit);
  const unit = item.unit ? unitLabel(item.unit, item.quantity) : "";

  useEffect(() => {
    if (editing) inputRef.current?.select();
    onEditing?.(editing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (still) {
    return (
      <span className="inv-qty">
        {item.quantity != null && <span className="inv-qty-num">{amountText(item.quantity)}</span>}
        {item.quantity != null && unit && <span className="inv-qty-unit"> {unit}</span>}
      </span>
    );
  }

  const keep = (e) => e.stopPropagation();
  function save() {
    if (!draft) return;
    setDraft(null);
    const patch = {};
    const next = parseQuantityInput(draft.qty);
    if (next != null && next >= 0 && next !== item.quantity) patch.quantity = next;
    if ((draft.unit || null) !== (item.unit || null)) patch.unit = draft.unit || null;
    if (Object.keys(patch).length) onUpdate(item.id, patch);
  }
  function bump(dir) {
    const current = parseQuantityInput(draft.qty) ?? item.quantity ?? 0;
    setDraft({ ...draft, qty: amountText(Math.max(0, Math.round((current + dir * step) * 100) / 100)) });
    inputRef.current?.focus();
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`inv-qty${item.quantity == null ? " empty" : ""}`}
        onClick={(e) => {
          keep(e);
          setDraft({ qty: item.quantity == null ? "" : amountText(item.quantity), unit: item.unit || "" });
        }}
        onPointerDown={keep}
        onKeyDown={keep}
        aria-label={
          item.quantity != null
            ? t("inventory.changeAmountNow", { name: item.name, amount: `${amountText(item.quantity)}${unit ? ` ${unit}` : ""}` })
            : t("inventory.changeAmount", { name: item.name })
        }
      >
        {item.quantity != null ? <span className="inv-qty-num">{amountText(item.quantity)}</span> : <span className="inv-qty-unit">{t("inventory.addQty")}</span>}
        {item.quantity != null && unit && <span className="inv-qty-unit"> {unit}</span>}
      </button>
    );
  }

  const onKeys = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") save();
    if (e.key === "Escape") setDraft(null);
  };
  return (
    <span
      className="inv-qty-edit"
      onClick={keep}
      onPointerDown={keep}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) save();
      }}
    >
      <button type="button" onClick={() => bump(-1)} aria-label={t("inventory.less", { name: item.name })}>
        −
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft.qty}
        onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
        onKeyDown={onKeys}
        aria-label={t("inventory.amountOf", { name: item.name })}
      />
      <button type="button" onClick={() => bump(1)} aria-label={t("inventory.more", { name: item.name })}>
        +
      </button>
      <UnitSelect
        className="inv-card-unit"
        value={draft.unit}
        onChange={(u) => setDraft({ ...draft, unit: u })}
        onKeyDown={onKeys}
        emptyLabel="—"
        aria-label={t("inventory.measureOf", { name: item.name })}
      />
    </span>
  );
}

// The 16px box: selects without opening the pop-up or starting a drag.
function SelectBox({ item, selected, onToggle }) {
  return (
    <span
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      className={`inv-check${selected ? " on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      aria-label={t("inventory.select", { name: item.name })}
    >
      {selected ? "✓" : ""}
    </span>
  );
}

// A leftover shows its recipe's photo when it has none of its own.
function photoItemOf(item, recipe) {
  return item.isLeftover && !item.imageUrl && recipe?.photoUrl ? { ...item, imageUrl: recipe.photoUrl } : item;
}

function ExpiredTag() {
  return <span className="inv-expired">{t("inventory.expiredTag")}</span>;
}

function LeftoverTag() {
  return <span className="inv-card-leftover-tag">{t("cooked.leftovers.tag")}</span>;
}

// The item as Compact draws it (a row) or Tiles (a tile). `drag` is the
// draggable's props, or null for a copy that doesn't drag (the drag preview).
function ItemFace({ item, view, line, days, recipe, selected, onToggleSelect, onUpdate, drag, className, onClick, label }) {
  const [editing, setEditing] = useState(false);
  const leftover = !!item.isLeftover;
  const photoItem = photoItemOf(item, recipe);
  const where = leftover ? t(`locations.${item.location}`) : "";
  const unit = item.unit ? unitLabel(item.unit, item.quantity) : "";

  if (view === "tiles") {
    return (
      <div {...drag} className={`inv-tile ${className}`} onClick={onClick} aria-label={label}>
        <div className={`inv-tile-well${leftover && photoItem.imageUrl ? " dish" : ""}`}>
          <ItemPhoto item={photoItem} />
        </div>
        {onToggleSelect && <SelectBox item={item} selected={selected} onToggle={onToggleSelect} />}
        {(line?.expired || leftover) && (
          <span className="inv-tile-tags">
            {line?.expired && <ExpiredTag />}
            {leftover && <LeftoverTag />}
          </span>
        )}
        <div className="inv-tile-text">
          <span className="inv-tile-name">{item.name}</span>
          <span className="inv-qty">
            {item.quantity != null && <span className="inv-qty-num">{amountText(item.quantity)}</span>}
            {item.quantity != null && unit && <span className="inv-qty-unit"> {unit}</span>}
            {where && <span className="inv-qty-unit"> · {where}</span>}
          </span>
        </div>
        <span className="inv-tile-bar" aria-hidden="true">
          {line && <span className={`inv-life ${line.color}`} style={{ width: line.width }} />}
        </span>
      </div>
    );
  }

  return (
    <div {...drag} className={`inv-row ${className}${editing ? " editing" : ""}`} onClick={onClick} aria-label={label}>
      {line?.height && (
        <span className="inv-row-strip" aria-hidden="true">
          <span className={`inv-life ${line.color}`} style={{ height: line.height }} />
        </span>
      )}
      <div className="inv-row-body">
        <span className="inv-row-thumb">
          <ItemPhoto item={photoItem} />
        </span>
        <div className="inv-row-main">
          <span className="inv-row-name">{item.name}</span>
          {(line?.expired || leftover) && (
            <span className="inv-row-tags">
              {line?.expired && <ExpiredTag />}
              {leftover && <LeftoverTag />}
              {leftover && (
                <span className="inv-row-where">
                  {where}
                  {days != null && days >= 0 ? ` · ${daysLabel(days)}` : ""}
                </span>
              )}
            </span>
          )}
        </div>
        {onUpdate ? (
          <CardQuantity item={item} onUpdate={onUpdate} onEditing={setEditing} />
        ) : (
          <CardQuantity item={item} still />
        )}
        {onToggleSelect && <SelectBox item={item} selected={selected} onToggle={onToggleSelect} />}
      </div>
    </div>
  );
}

// An item on a shelf: drags onto any other shelf (App.jsx's handleDragEnd, through
// the "inv-shelf-<id>" drop targets). The app's one drag setup picks it up after a
// short hold (200 ms), so on a phone a swipe still scrolls and a press-and-hold
// carries it. Leftovers stay on their own shelf.
export function InventoryItem({ item, view, active, selected, onSelect, onToggleSelect, onUpdate, draggable = true, recipe }) {
  const days = daysLeftOf(item);
  const line = lineForDays(days);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inv-item-${item.id}`,
    data: { inventoryItemId: item.id, inventoryItem: item, inventoryView: view, inventoryRecipe: recipe || null },
    disabled: !draggable,
  });
  const classes = [
    active && "active",
    isDragging && "dragging",
    line?.expired && "expired",
    item.isLeftover && "leftover",
    draggable && "draggable",
  ]
    .filter(Boolean)
    .join(" ");
  const label = `${item.name}${days != null ? `, ${daysLabel(days)}` : ""}`;
  return (
    <ItemFace
      item={item}
      view={view}
      line={line}
      days={days}
      recipe={recipe}
      selected={selected}
      onToggleSelect={onToggleSelect}
      onUpdate={view === "tiles" ? null : onUpdate}
      drag={{ ref: setNodeRef, ...(draggable ? { ...attributes, ...listeners } : {}), onContextMenu: (e) => draggable && e.preventDefault() }}
      className={classes}
      onClick={onSelect}
      label={label}
    />
  );
}

// The item that follows the pointer while it is dragged to another shelf
// (App.jsx's DragOverlay): the same row or tile, without its controls.
export function InventoryDragPreview({ item, view = "compact", recipe }) {
  const days = daysLeftOf(item);
  return (
    <div className={`riso-theme inv-drag-preview ${view}`} data-theme="light">
      <ItemFace item={item} view={view} line={lineForDays(days)} days={days} recipe={recipe} drag={{}} className="lifted" />
    </div>
  );
}
