import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { parseQuantityInput, unitLabel } from "../lib/units.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { api } from "../api.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { lineForDays, qtyStep } from "../lib/inventoryForm.js";
import { ItemPhoto } from "./ItemPhoto.jsx";
import { InventoryItemForm, InventoryToast } from "./InventoryItemForm.jsx";
import { HintStrip } from "./RisoControls.jsx";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { t } from "../i18n/index.js";
// Home shows the same card photo.
export { ItemPhoto };

// Fridge and Freezer sit side by side, Pantry after - see the design
// handoff. "Counter" is a fourth USDA location the bundled data supports
// but this app has no dedicated shelf for yet (deferred per the handoff's
// own note that it's optional).
const SHELF_LOCATIONS = [
  { id: "fridge", get label() { return t("locations.fridge"); } },
  { id: "freezer", get label() { return t("locations.freezer"); } },
  { id: "pantry", get label() { return t("locations.pantry"); } },
];

// Shelves sit on a 12-column grid (Riso Inventory handoff): Fridge and
// Freezer at half, Pantry the whole row. A width snaps to whole columns,
// never under a quarter, and 10 or more fills the row; a height is any
// size from 200px, or "auto" - as tall as its items.
const GRID_COLUMNS = 12;
const MIN_SPAN = 3;
const MIN_HEIGHT = 200;
function snapSpan(n) {
  const cols = Math.round(n);
  if (cols >= 10) return GRID_COLUMNS;
  return Math.max(MIN_SPAN, cols);
}
// Saved as "c12:<columns>"; anything else is an older 6-column size.
const LEGACY_SPAN = { third: 2, half: 3, full: 6 };
function spanOf(size, id) {
  const m = /^c12:(\d+)$/.exec(String(size || ""));
  if (m) return snapSpan(Number(m[1]));
  const n = LEGACY_SPAN[size] ?? parseInt(size, 10);
  if (n >= 1 && n <= 6) return snapSpan(n * 2);
  return id === "pantry" ? GRID_COLUMNS : 6;
}

// Built-in shelves plus custom sections, in the user's saved order (anything
// not in the saved layout yet - a brand-new section - goes at the end), with
// their names, widths (in grid columns) and heights.
export function orderedSections(locations, layout) {
  const all = [
    ...SHELF_LOCATIONS.map((l) => ({ id: l.id, defaultLabel: l.label, custom: false })),
    ...(locations || []).map((l) => ({ id: l.id, defaultLabel: l.name, custom: true })),
  ];
  const saved = new Map((layout || []).map((row) => [row.sectionId, row]));
  const position = (sec) => (saved.has(sec.id) ? saved.get(sec.id).position : Infinity);
  return all
    .map((sec, i) => ({ sec, i }))
    .sort((a, b) => position(a.sec) - position(b.sec) || a.i - b.i)
    .map(({ sec }) => {
      const row = saved.get(sec.id);
      return {
        id: sec.id,
        custom: sec.custom,
        label: sec.custom ? sec.defaultLabel : row?.label || sec.defaultLabel,
        defaultLabel: sec.defaultLabel,
        span: spanOf(row?.size, sec.id),
        height: row?.height ? Math.max(MIN_HEIGHT, row.height) : null,
      };
    });
}

// The shelves as plain { id, label } choices, in the saved order.
export function shelfOptions(locations, layout) {
  return orderedSections(locations, layout).map(({ id, label }) => ({ id, label }));
}

function layoutPayload(sections) {
  return sections.map((s) => ({
    sectionId: s.id,
    label: !s.custom && s.label !== s.defaultLabel ? s.label : null,
    size: `c12:${s.span}`,
    height: s.height,
  }));
}

// Upload a receipt photo/PDF and let Gemini read it into candidate items.
// What it read goes to the same Inventory confirmation sheet as every other
// way of adding: OCR'd receipt text is noisy enough (coupons, loyalty lines,
// misread brand names) that nothing is added until each row has been checked,
// edited or switched off there. Cancelling the sheet adds nothing, and the
// items stay here to review again without reading the receipt twice.
function ReceiptScanPanel({ onRequestInventoryAdd, onDone }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [found, setFound] = useState(null); // the items Gemini read, once parsed

  async function review(items) {
    const added = await onRequestInventoryAdd(
      items.map((it, i) => ({ ref: i, name: it.name, quantity: it.quantity ?? null })),
      { title: t("inventoryConfirm.receiptTitle"), intro: t("inventoryConfirm.receiptIntro") }
    );
    if (added?.length) onDone?.();
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { items } = await api.parseReceipt(file);
      setFound(items);
      if (items.length > 0) review(items);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="riso-receipt">
      <label className={`riso-receipt-drop${uploading ? " busy" : ""}`}>
        <span className="riso-receipt-drop-title">{t("inventory.receiptLabel")}</span>
        <span className="riso-receipt-drop-hint">{uploading ? t("inventory.reading") : t("inventory.receiptHint")}</span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {found && !uploading && (
        <div className="riso-receipt-found">
          <p>{found.length > 0 ? t("inventory.found", { count: found.length }) : t("inventory.foundNone")}</p>
          {found.length > 0 && (
            <button type="button" className="btn primary" onClick={() => review(found)}>
              {t("inventory.reviewFound", { count: found.length })}
            </button>
          )}
        </div>
      )}
      {error && <p className="riso-confirm-error">{error}</p>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay riso-inv-form-overlay" onClick={onClose}>
      <div className="card modal-content riso-inv-form-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close riso-inv-form-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
        <h3 className="riso-inv-form-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// The expiry line down the card's left edge: how close the date is on a
// 4-week scale, filling up from the bottom as it nears (nearly full the day
// before, at least 8% so it stays visible), pink within 3 days, yellow
// within a week, blue after that. No line from 28 days on, with no date,
// or once expired (the Expired tag says it).
function expiryLine(item) {
  if (!item.expiresAt) return null;
  const d = daysUntil(item.expiresAt);
  const line = lineForDays(d);
  if (!line) return null;
  if (line.expired) return { expired: true, label: t("inventory.expired") };
  return { ...line, label: d === 1 ? t("inventory.useByTomorrow") : t("inventory.daysLeft", { count: d }) };
}

// The card's amount and its measure: tap it to change them right there
// (− / typed / + and the unit). Enter or tapping away saves, Escape puts
// it back. Its clicks and drags stay off the card, so editing never opens
// the panel or starts a drag.
function CardQuantity({ item, onUpdate }) {
  const [draft, setDraft] = useState(null);
  const inputRef = useRef(null);
  const editing = draft !== null;
  const step = qtyStep(draft?.unit ?? item.unit);
  const unit = item.unit ? unitLabel(item.unit, item.quantity) : "";

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

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
    setDraft({ ...draft, qty: String(Math.max(0, Math.round((current + dir * step) * 100) / 100)) });
    inputRef.current?.focus();
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`inv-card-qty${item.quantity == null ? " empty" : ""}`}
        onClick={(e) => {
          keep(e);
          setDraft({ qty: item.quantity == null ? "" : String(item.quantity), unit: item.unit || "" });
        }}
        onPointerDown={keep}
        onKeyDown={keep}
        aria-label={
          item.quantity != null
            ? t("inventory.changeAmountNow", { name: item.name, amount: `${item.quantity}${unit ? ` ${unit}` : ""}` })
            : t("inventory.changeAmount", { name: item.name })
        }
      >
        {item.quantity != null ? (
          <span className="inv-card-qty-num">{item.quantity}</span>
        ) : (
          <span className="inv-card-qty-unit">{t("inventory.addQty")}</span>
        )}
        {item.quantity != null && unit && <span className="inv-card-qty-unit"> {unit}</span>}
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
      className="inv-card-qty-edit"
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

// The card that follows the pointer while an item is dragged to another
// shelf (App.jsx's DragOverlay): the same card, without its controls.
export function InventoryDragPreview({ item }) {
  const unit = item.unit ? unitLabel(item.unit, item.quantity) : "";
  return (
    <div className="riso-theme inv-drag-preview" data-theme="light">
      <div className={`inv-card${daysUntilOrNull(item) <= 0 ? " expired" : ""}`}>
        <div className="inv-card-body">
          <ItemPhoto item={item} />
          <div className="inv-card-main">
            <span className="inv-card-name">{item.name}</span>
          </div>
          {item.quantity != null && (
            <span className="inv-card-qty">
              <span className="inv-card-qty-num">{item.quantity}</span>
              {unit && <span className="inv-card-qty-unit"> {unit}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function daysUntilOrNull(item) {
  return item.expiresAt ? daysUntil(item.expiresAt) : Infinity;
}

function ItemCard({ item, active, selected, onSelect, onToggleSelect, onUpdate, draggable = true }) {
  const line = expiryLine(item);

  // Draggable onto any other shelf (see App.jsx's handleDragEnd, routed via
  // the "inv-shelf-<location>" droppable ids below). PointerSensor's
  // activation distance (App.jsx) keeps a quick click a click.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inv-item-${item.id}`,
    data: { inventoryItemId: item.id, inventoryItem: item },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={`inv-card${active ? " active" : ""}${isDragging ? " dragging" : ""}${line?.expired ? " expired" : ""}`}
      onClick={onSelect}
      aria-label={`${item.name}${line ? `, ${line.label}` : ""}`}
    >
      {line && !line.expired && (
        <span className="inv-card-line" aria-hidden="true">
          <span className={`inv-card-line-fill ${line.color}`} style={{ height: line.height }} />
        </span>
      )}
      <div className="inv-card-body">
        <ItemPhoto item={item} />
        <div className="inv-card-main">
          <span className="inv-card-name">{item.name}</span>
          {line?.expired && <span className="inv-card-expired">{t("inventory.expiredTag")}</span>}
        </div>
        <CardQuantity item={item} onUpdate={onUpdate} />
        <span
          role="checkbox"
          aria-checked={selected}
          tabIndex={0}
          className={`inv-card-check${selected ? " on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }
          }}
          aria-label={t("inventory.select", { name: item.name })}
        >
          {selected ? "✓" : ""}
        </span>
      </div>
    </div>
  );
}

const WIDTH_PRESETS = [
  { id: "full", span: GRID_COLUMNS, get label() { return t("inventory.widthFull"); } },
  { id: "half", span: 6, get label() { return t("inventory.widthHalf"); } },
  { id: "third", span: 4, get label() { return t("inventory.widthThird"); } },
];

// A shelf's header in edit mode: its name as an input, the size presets
// and (for your own shelves) Delete shelf.
function useShelfEditor({ location, span, height, onRename, onResize, onDelete, onDone }) {
  const [name, setName] = useState(location.label);
  const [error, setError] = useState(null);
  useEffect(() => setName(location.label), [location.label]);

  async function commitName() {
    const next = name.trim();
    if (!next || next === location.label) {
      setName(location.label);
      return;
    }
    try {
      await onRename(next);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return {
    nameInput: (
      <input
        className="inv-shelf-name-input"
        aria-label={t("inventory.sectionName")}
        value={name}
        maxLength={40}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            await commitName();
            onDone();
          }
          if (e.key === "Escape") {
            setName(location.label);
            onDone();
          }
        }}
      />
    ),
    commitName,
    controls: (
      <div className="inv-shelf-controls">
        {WIDTH_PRESETS.map((p) => (
          <button key={p.id} type="button" className={span === p.span ? "on" : ""} onClick={() => onResize({ span: p.span, height })}>
            {p.label}
          </button>
        ))}
        <button type="button" className={height ? "" : "on"} onClick={() => onResize({ span, height: null })}>
          {t("inventory.autoHeight")}
        </button>
        {location.custom && (
          <button type="button" className="danger" onClick={onDelete}>
            {t("inventory.deleteShelf")}
          </button>
        )}
        <span className="inv-shelf-controls-note">
          {location.custom ? `${t("inventory.itemsToPantry")} ` : ""}
          {t("inventory.dragBetween")}
        </span>
        {error && <p className="inv-section-editor-error">{error}</p>}
      </div>
    ),
  };
}

// Drag the corner grip to resize: the width snaps to whole columns of 12
// (at least 3; 10 or more fills the row), the height is free from 200px
// and the items scroll inside. Double-click (or Home) goes back to auto
// height; arrow keys change it a step at a time.
function ResizeHandle({ label, span, height, shelfRef, onPreview, onCommit }) {
  function measure() {
    const shelf = shelfRef.current;
    const grid = shelf?.parentElement;
    if (!grid) return null;
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    const gap = parseFloat(style.columnGap) || 0;
    return { cols, gap, colWidth: (grid.clientWidth - gap * (cols - 1)) / cols, shelf };
  }

  function onPointerDown(e) {
    const m = measure();
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = m.shelf.getBoundingClientRect().width;
    const startHeight = m.shelf.getBoundingClientRect().height;
    let next = { span, height };
    document.body.classList.add("no-select");
    const move = (ev) => {
      const widthNow = startWidth + (ev.clientX - startX);
      const newSpan = m.cols === GRID_COLUMNS ? snapSpan((widthNow + m.gap) / (m.colWidth + m.gap)) : span;
      const newHeight = Math.max(MIN_HEIGHT, Math.round((startHeight + (ev.clientY - startY)) / 10) * 10);
      next = { span: newSpan, height: newHeight };
      onPreview(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("no-select");
      onPreview(null);
      if (next.span !== span || next.height !== height) onCommit(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKeyDown(e) {
    const shelfHeight = Math.round(shelfRef.current?.getBoundingClientRect().height || 300);
    const h = height ?? shelfHeight;
    const steps = {
      ArrowLeft: { span: snapSpan(span - 1), height },
      ArrowRight: { span: snapSpan(span + 1), height },
      ArrowUp: { span, height: Math.max(MIN_HEIGHT, h - 40) },
      ArrowDown: { span, height: h + 40 },
    };
    if (e.key in steps) {
      e.preventDefault();
      onCommit(steps[e.key]);
    } else if (e.key === "Home" || e.key === "Delete") {
      e.preventDefault();
      onCommit({ span, height: null });
    }
  }

  return (
    <button
      type="button"
      className="inv-shelf-resize"
      aria-label={label}
      title={t("inventory.resizeTitle")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onCommit({ span, height: null })}
      onKeyDown={onKeyDown}
    />
  );
}

function ShelfColumn({
  location,
  items,
  onUpdate,
  activeItemId,
  selectedIds,
  onSelect,
  onToggleSelect,
  draggable = true,
  editing,
  onEdit,
  onAddHere,
  onRename,
  onDelete,
  arrangeable,
  onResize,
  onStartMove,
  onMoveByKey,
  moveState,
}) {
  const [preview, setPreview] = useState(null);
  const shelfRef = useRef(null);
  const sorted = [...items].sort((a, b) => {
    const da = a.expiresAt ? daysUntil(a.expiresAt) : null;
    const db = b.expiresAt ? daysUntil(b.expiresAt) : null;
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  // Every shelf is a drop target for a dragged card (see App.jsx's
  // handleDragEnd, which routes "inv-shelf-<id>" ids).
  const { setNodeRef, isOver } = useDroppable({ id: `inv-shelf-${location.id}` });

  const span = preview?.span ?? location.span;
  const height = preview ? preview.height : location.height;
  const classes = ["inv-shelf"];
  if (height) classes.push("fixed-height");
  if (isOver) classes.push("drop-active");
  if (preview) classes.push("resizing");
  if (editing) classes.push("editing");
  if (moveState?.id === location.id) classes.push("moving");
  if (moveState?.overId === location.id) classes.push(moveState.after ? "drop-after" : "drop-before");
  const sizeLabel = `${span}/${GRID_COLUMNS} · ${height ? `${height}PX` : t("inventory.sizeAuto")}`;

  const editor = useShelfEditor({
    location,
    span: location.span,
    height: location.height,
    onRename,
    onResize,
    onDelete,
    onDone: () => onEdit(false),
  });

  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        shelfRef.current = node;
      }}
      className={classes.join(" ")}
      style={{ "--span": span, height: height ? `${height}px` : undefined }}
      data-section-id={location.id}
      aria-label={t("inventory.sectionAria", { name: location.label })}
    >
      <div className="inv-shelf-header">
        {arrangeable && (
          <button
            type="button"
            className="inv-shelf-grip"
            aria-label={t("inventory.moveSection", { name: location.label })}
            title={t("inventory.moveTitle")}
            onPointerDown={(e) => onStartMove(location.id, e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") onMoveByKey(location.id, -1, e);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") onMoveByKey(location.id, 1, e);
            }}
          >
            ⠿
          </button>
        )}
        {editing ? editor.nameInput : <h3 className="inv-shelf-title">{location.label}</h3>}
        <span className="inv-shelf-count">{items.length}</span>
        <span className="inv-shelf-spacer" />
        {(editing || preview) && <span className="inv-shelf-size">{sizeLabel}</span>}
        {!editing && onAddHere && (
          <button
            type="button"
            className="inv-shelf-edit inv-shelf-add"
            aria-label={t("inventory.addItemTo", { name: location.label })}
            title={t("inventory.addTo", { name: location.label })}
            onClick={onAddHere}
          >
            +
          </button>
        )}
        <button
          type="button"
          className={`inv-shelf-edit${editing ? " on" : ""}`}
          aria-label={
            editing ? t("inventory.doneEditing", { name: location.label }) : t("inventory.editSection", { name: location.label })
          }
          title={editing ? t("inventory.done") : t("inventory.editShelf")}
          onMouseDown={(e) => editing && e.preventDefault()}
          onClick={async () => {
            if (editing) await editor.commitName();
            onEdit(!editing);
          }}
        >
          {editing ? "✓" : "✎"}
        </button>
      </div>
      {editing && editor.controls}
      <div className="inv-shelf-items">
        {sorted.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            active={item.id === activeItemId}
            selected={selectedIds.has(item.id)}
            onSelect={() => onSelect(item.id)}
            draggable={draggable}
            onToggleSelect={() => onToggleSelect(item.id)}
            onUpdate={onUpdate}
          />
        ))}
        {sorted.length === 0 && <div className="inv-shelf-empty">{t("inventory.dropHere")}</div>}
      </div>
      {arrangeable && (
        <ResizeHandle
          label={t("inventory.resizeSection", { name: location.label })}
          span={location.span}
          height={location.height}
          shelfRef={shelfRef}
          onPreview={setPreview}
          onCommit={onResize}
        />
      )}
    </section>
  );
}

// "+ Add shelf" at the end of the grid makes a new shelf and opens it
// ready to rename.
// The little round + beside the shelf pill: it turns into a field for the new
// shelf's name (Enter adds it, Escape cancels).
function AddShelfSegment({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    try {
      await onAdd(trimmed);
      setName("");
      setError(null);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inv-shelf-edit inv-shelf-add add-shelf"
        aria-label={t("inventory.addShelf")}
        title={t("inventory.addShelf")}
        onClick={() => setOpen(true)}
      >
        +
      </button>
    );
  }
  return (
    <span className="add-shelf form">
      <input
        autoFocus
        aria-label={t("inventory.shelfName")}
        placeholder={t("inventory.shelfNamePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setName("");
            setError(null);
            setOpen(false);
          }
        }}
        onBlur={() => !error && submit()}
      />
      {error && <span className="add-shelf-error" role="alert">{error}</span>}
    </span>
  );
}

function FloatingActionBar({ count, onFindRecipes, onConsume, onFreeze, onClear }) {
  return (
    <div className="inv-action-bar">
      <span className="inv-action-count">{t("inventory.selected", { count })}</span>
      <button type="button" className="inv-action-btn primary" onClick={onFindRecipes}>
        {t("inventory.findRecipes")}
      </button>
      <button type="button" className="inv-action-btn" onClick={() => onConsume("consumed")}>
        {t("inventory.usedUp")}
      </button>
      <button type="button" className="inv-action-btn" onClick={() => onConsume("wasted")}>
        {t("inventory.tossed")}
      </button>
      <button type="button" className="inv-action-btn" onClick={onFreeze}>
        {t("inventory.freeze")}
      </button>
      <button type="button" className="inv-action-btn" onClick={onClear} aria-label={t("inventory.clearSelection")}>
        ×
      </button>
    </div>
  );
}

export function Inventory({
  user,
  items,
  onAdd,
  onRequestInventoryAdd,
  onUpdate,
  onDelete,
  onConsume,
  customStaples,
  onMarkStaple,
  onUnmarkStaple,
  recipes,
  onFindRecipes,
  onFindRecipesForSelection,
  locations,
  layout,
  onSaveLayout,
  onAddLocation,
  onRenameLocation,
  onDeleteLocation,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeItemId, setActiveItemId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  // The shelf a shelf's own + opened the form for (the toolbar's + Add
  // item starts in the fridge).
  const [addLocation, setAddLocation] = useState("fridge");
  const [showScan, setShowScan] = useState(false);
  const isPhone = useIsPhone();
  // The small yellow message after adding, saving or finishing an item.
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  // The shelf chips are pinned at the top while you scroll (under the header on
  // a phone): tapping one scrolls to its shelf, and the chip of the shelf you're
  // looking at is the lit one. The same on a phone and on a computer.
  const [currentShelf, setCurrentShelf] = useState("fridge");
  const currentShelfRef = useRef(currentShelf);
  currentShelfRef.current = currentShelf;
  // While a tapped chip scrolls its shelf into place, that chip stays lit.
  const jumpLock = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const staples = new Set(customStaples || []);

  useEffect(() => {
    if (activeItemId && !items.some((i) => i.id === activeItemId)) setActiveItemId(null);
  }, [items, activeItemId]);

  useEffect(() => {
    if (!activeItemId) return;
    function handleKey(e) {
      if (e.key === "Escape") setActiveItemId(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeItemId]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStaple(item) {
    if (staples.has(item.core)) onUnmarkStaple(item.core);
    else onMarkStaple(item.core);
  }

  async function handleConsumeSelected(action) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    await onConsume(ids, action);
  }

  async function handleFreezeSelected() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      const freezerData = item?.locations?.freezer;
      if (freezerData) await onUpdate(id, { location: "freezer", expiresAt: freezerData.expiresAt });
    }
  }

  const activeItem = items.find((i) => i.id === activeItemId);
  // "Soon" is 1 to 3 days; expired items are counted on their own.
  const soonCount = items.filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 1 && daysUntil(i.expiresAt) <= 3).length;
  const expiredCount = items.filter((i) => i.expiresAt && daysUntil(i.expiresAt) <= 0).length;

  // Built-in shelves (Fridge/Freezer/Pantry, USDA-backed) and the user's own
  // custom sections, in the user's order, with their names and sizes.
  const sections = orderedSections(locations, layout);
  const shelfLocations = sections;

  // The height of the sticky app header, so the chips pin right under it and a
  // jump lands the shelf just below the chips.
  const rootRef = useRef(null);
  useEffect(() => {
    if (!isPhone) return undefined;
    const header = document.querySelector(".app-header");
    const root = rootRef.current;
    if (!header || !root) return undefined;
    const measure = () => root.style.setProperty("--inv-sticky-top", `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [isPhone]);

  // Light the chip of the shelf whose top has passed the line under the chips
  // (the lowest top that has; shelves side by side on a computer tie, and the
  // first of them wins).
  const shelfIds = shelfLocations.map((loc) => loc.id).join("|");
  useEffect(() => {
    let frame = 0;
    let settle = 0;
    const update = () => {
      frame = 0;
      if (jumpLock.current && Date.now() < jumpLock.current.until) {
        setCurrentShelf(jumpLock.current.id);
        // Look again once the jump is over.
        clearTimeout(settle);
        settle = setTimeout(onScroll, jumpLock.current.until - Date.now() + 30);
        return;
      }
      const pin = document.querySelector(".riso-inv-shelf-pin");
      const line = (pin ? pin.getBoundingClientRect().bottom : 0) + 12;
      let current = null;
      let currentTop = -Infinity;
      const tops = {};
      for (const id of shelfIds.split("|")) {
        const el = document.querySelector(`.inv-shelves [data-section-id="${id}"]`);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        tops[id] = top;
        if (current === null) {
          current = id;
          currentTop = top;
        } else if (top <= line && (currentTop > line || top > currentTop)) {
          current = id;
          currentTop = top;
        }
      }
      // Shelves side by side share a top: keep the one already lit (the one you
      // tapped) rather than jumping to the first of them.
      const lit = currentShelfRef.current;
      if (lit && lit !== current && tops[lit] !== undefined && Math.abs(tops[lit] - currentTop) < 3) current = lit;
      // Near the bottom the last shelf may be too short to reach the line.
      const ids = shelfIds.split("|");
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 12) current = ids[ids.length - 1];
      if (current) setCurrentShelf(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [shelfIds, items.length]);

  function jumpToShelf(id) {
    setCurrentShelf(id);
    jumpLock.current = { id, until: Date.now() + 1000 };
    document.querySelector(`.inv-shelves [data-section-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function moveSectionTo(id, overId, after) {
    if (!overId || overId === id) return;
    const moving = sections.find((sec) => sec.id === id);
    const rest = sections.filter((sec) => sec.id !== id);
    const at = rest.findIndex((sec) => sec.id === overId) + (after ? 1 : 0);
    rest.splice(at, 0, moving);
    onSaveLayout(layoutPayload(rest));
  }

  function moveSectionByKey(id, dir, e) {
    e.preventDefault();
    const i = sections.findIndex((sec) => sec.id === id);
    const target = sections[i + dir];
    if (target) moveSectionTo(id, target.id, dir > 0);
  }

  // Drag a section by its grip onto another one: it lands before or after
  // it, whichever half of that section the pointer is over.
  const [moveState, setMoveState] = useState(null);
  function startMove(id, e) {
    e.preventDefault();
    let state = { id, overId: null, after: false };
    setMoveState(state);
    document.body.classList.add("no-select");
    const move = (ev) => {
      const over = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((el) => el.closest?.("[data-section-id]"))
        .find(Boolean);
      const overId = over?.dataset.sectionId;
      if (!overId || overId === id) {
        state = { id, overId: null, after: false };
      } else {
        const r = over.getBoundingClientRect();
        const sameRow = r.width < (over.parentElement?.clientWidth || 0) - 4;
        const after = sameRow ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
        state = { id, overId, after };
      }
      setMoveState(state);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("no-select");
      setMoveState(null);
      moveSectionTo(state.id, state.overId, state.after);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function updateSection(id, patch) {
    onSaveLayout(layoutPayload(sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec))));
  }

  async function renameSection(sec, name) {
    if (sec.custom) await onRenameLocation(sec.id, name);
    else updateSection(sec.id, { label: name });
  }

  return (
    <div ref={rootRef} className="riso-theme riso-inv inv-page" data-theme="light">
      <div className="riso-inv-header">
        <div className="riso-inv-title-block">
          <p className="riso-inv-summary">
            <span>{t("inventory.itemCount", { count: items.length })}</span>
            <span>{t("inventory.soonCount", { count: soonCount })}</span>
            {expiredCount > 0 && <span className="expired">{t("inventory.expiredCount", { count: expiredCount })}</span>}
          </p>
          <h1 className="riso-inv-title">
            {t("inventory.title")} <span className="accent">{t("inventory.titleAccent")}</span>
          </h1>
        </div>
        <div className="riso-inv-header-actions">
          <button type="button" className="riso-inv-btn" onClick={() => setShowScan(true)}>
            {t("inventory.scanReceipt")}
          </button>
          <button
            type="button"
            className="riso-inv-btn primary"
            onClick={() => {
              setAddLocation("fridge");
              setShowAdd(true);
            }}
          >
            {t("inventory.addItem")}
          </button>
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="inventory-v2">
        {t("inventory.hint")}
      </HintStrip>

      {items.length === 0 && <p className="empty-state">{t("inventory.empty")}</p>}

      <div className="riso-inv-shelf-pin">
        <div className="riso-inv-shelf-bar">
          <div className="riso-inv-shelf-switch" role="tablist" aria-label={t("inventory.shelfAria")}>
            {shelfLocations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                role="tab"
                aria-selected={currentShelf === loc.id}
                className={currentShelf === loc.id ? "on" : ""}
                onClick={() => jumpToShelf(loc.id)}
              >
                {loc.label} <span>{items.filter((i) => i.location === loc.id).length}</span>
              </button>
            ))}
          </div>
          {/* The round + sits beside the pill, not inside it. */}
          <AddShelfSegment
            onAdd={async (name) => {
              const created = await onAddLocation(name);
              // Scroll to it once it's on the page.
              if (created?.id) setTimeout(() => jumpToShelf(created.id), 50);
            }}
          />
        </div>
      </div>

      <div className="inv-shelves">
        {shelfLocations
          .map((loc) => (
            <ShelfColumn
              key={loc.id}
              location={loc}
              items={items.filter((i) => i.location === loc.id)}
              onUpdate={onUpdate}
              activeItemId={activeItemId}
              selectedIds={selectedIds}
              onSelect={setActiveItemId}
              onToggleSelect={toggleSelect}
              draggable={!isPhone}
              editing={editingId === loc.id}
              onEdit={(on) => setEditingId(on ? loc.id : null)}
              onAddHere={() => {
                setAddLocation(loc.id);
                setShowAdd(true);
              }}
              onRename={(name) => renameSection(loc, name)}
              onDelete={() => {
                setEditingId(null);
                setCurrentShelf("fridge");
                onDeleteLocation(loc.id);
              }}
              arrangeable={!isPhone}
              onResize={({ span, height }) => updateSection(loc.id, { span, height })}
              onStartMove={startMove}
              onMoveByKey={moveSectionByKey}
              moveState={moveState}
            />
          ))}
      </div>

      {activeItem && (
        <InventoryItemForm
          key={activeItem.id}
          mode="edit"
          item={activeItem}
          sections={sections}
          recipes={recipes}
          isStaple={staples.has(activeItem.core)}
          onToggleStaple={toggleStaple}
          onSave={onUpdate}
          onDelete={onDelete}
          onConsume={onConsume}
          onFindRecipes={onFindRecipes}
          onToast={showToast}
          onClose={() => setActiveItemId(null)}
          isPhone={isPhone}
        />
      )}

      {selectedIds.size > 0 && (
        <FloatingActionBar
          count={selectedIds.size}
          onFindRecipes={onFindRecipesForSelection}
          onConsume={handleConsumeSelected}
          onFreeze={handleFreezeSelected}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {showAdd && (
        <InventoryItemForm
          key={addLocation}
          mode="add"
          sections={sections}
          defaultLocation={addLocation}
          isStapleFor={(n) => staples.has(String(n).trim().toLowerCase())}
          onToggleStaple={toggleStaple}
          onAdd={onAdd}
          onDelete={onDelete}
          onToast={showToast}
          onClose={() => setShowAdd(false)}
          isPhone={isPhone}
        />
      )}
      <InventoryToast message={toast} />
      {showScan && (
        <Modal title={t("inventory.scanReceipt")} onClose={() => setShowScan(false)}>
          <ReceiptScanPanel onRequestInventoryAdd={onRequestInventoryAdd} onDone={() => setShowScan(false)} />
        </Modal>
      )}
    </div>
  );
}
