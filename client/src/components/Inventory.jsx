import { useEffect, useMemo, useRef, useState } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { api } from "../api.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { leftoverExpiry } from "../lib/leftovers.js";
import { onShelf } from "../lib/shelves.js";
import { emptyDuplicateShelves, normalizeName, unknownStorageItems } from "../lib/storageList.js";
import { InventoryStorageSheet } from "./InventoryStorageSheet.jsx";
import { removedHowLabel, removedWhenLabel } from "../lib/removedItems.js";
import { ItemPhoto } from "./ItemPhoto.jsx";
import { InventoryItem, InventoryDragPreview } from "./InventoryItems.jsx";
import { InventoryItemForm } from "./InventoryItemForm.jsx";
import { HintStrip, Segmented } from "./RisoControls.jsx";
import { RemovedStrip } from "./RemovedStrip.jsx";
import { LIFTED_CLASS, ReorderGrip, ReorderList, useReorderDrop, useReorderSection } from "./ReorderSections.jsx";
import { gridSortingStrategy } from "../lib/reorderGrid.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { useInventoryView } from "../hooks/useInventoryView.js";
import { useRemovedItems } from "../hooks/useRemovedItems.js";
import { t } from "../i18n/index.js";
// Home shows the same card photo; App.jsx's drag overlay draws the dragged item.
export { ItemPhoto, InventoryDragPreview };

// Fridge and Freezer sit side by side, Pantry after - see the design
// handoff. "Counter" is a fourth USDA location the bundled data supports
// but this app has no dedicated shelf for yet (deferred per the handoff's
// own note that it's optional).
// Leftovers (LEFTOVER items: a cooked meal's portions) have a shelf of their own,
// whether they are kept in the fridge or the freezer (lib/leftovers.js), and so do
// prepared meals (Prepared meals, until one is moved to another shelf).
const SHELF_LOCATIONS = [
  { id: "fridge", get label() { return t("locations.fridge"); } },
  { id: "freezer", get label() { return t("locations.freezer"); } },
  { id: "pantry", get label() { return t("locations.pantry"); } },
  { id: "leftovers", get label() { return t("locations.leftovers"); } },
  { id: "prepared", get label() { return t("locations.prepared"); } },
];

// Which shelf an item is on is `shelfOf` (lib/shelves.js), the one rule: leftovers on Leftovers,
// a prepared meal on Prepared meals until it is moved, an item on the shelf of where it is kept
// unless its owner chose another. Where it is KEPT is a separate field (`location`).

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
  return id === "pantry" || id === "leftovers" ? GRID_COLUMNS : 6;
}

// A shelf is two things to the app's drag setup: where an item is dropped (App.jsx's
// handleDragEnd reads the "inv-shelf-<id>" ids) and a section moved by its ⠿ (the
// shared reorder piece, ReorderSections.jsx, as Grocery's stores). SHELF_DRAG is the
// `type` of the second, which App.jsx's collision rule looks for.
export const SHELF_DRAG = "shelf";
const shelfDragId = (id) => `inv-shelf-${id}`;

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

// The shelves as plain { id, label } choices, in the saved order: the places a
// thing can be kept (Leftovers is a shelf to look at, not a place to choose).
export function shelfOptions(locations, layout) {
  return orderedSections(locations, layout)
    .filter(({ id }) => id !== "leftovers")
    .map(({ id, label }) => ({ id, label }));
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

// Items sorted by days left, soonest first (expired at the top); no date last.
function byDaysLeft(items) {
  return [...items].sort((a, b) => {
    const da = a.expiresAt ? daysUntil(a.expiresAt) : null;
    const db = b.expiresAt ? daysUntil(b.expiresAt) : null;
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}

function ShelfColumn({
  location,
  items,
  shelfIds,
  view,
  onUpdate,
  activeItemId,
  selectedIds,
  onSelect,
  onToggleSelect,
  recipes = [],
  editing,
  onEdit,
  onAddHere,
  onRename,
  onDelete,
  resizable,
  onResize,
  onMoveByKey,
}) {
  const [preview, setPreview] = useState(null);
  const shelfRef = useRef(null);
  const sorted = byDaysLeft(items);

  // Every shelf is a drop target for a dragged item (see App.jsx's handleDragEnd,
  // which routes "inv-shelf-<id>" ids) and moves by its grip like a store on Grocery.
  const shelf = useReorderSection({ id: shelfDragId(location.id), data: { type: SHELF_DRAG, shelf: location.id } });
  const itemOver = shelf.isOver && !!shelf.active?.data.current?.inventoryItemId;

  const span = preview?.span ?? location.span;
  const height = preview ? preview.height : location.height;
  const classes = ["inv-shelf"];
  if (height) classes.push("fixed-height");
  if (itemOver) classes.push("drop-active");
  if (preview) classes.push("resizing");
  if (editing) classes.push("editing");
  if (shelf.lifted) classes.push(LIFTED_CLASS);
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
        shelf.ref(node);
        shelfRef.current = node;
      }}
      className={classes.join(" ")}
      style={{ "--span": span, height: height ? `${height}px` : undefined, ...shelf.style }}
      data-section-id={location.id}
      aria-label={t("inventory.sectionAria", { name: location.label })}
    >
      <div className="inv-shelf-header">
        <ReorderGrip
          asButton
          grip={shelf.grip}
          className="inv-shelf-grip"
          aria-label={t("inventory.moveSection", { name: location.label })}
          title={t("inventory.moveTitle")}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") onMoveByKey(location.id, -1, e);
            if (e.key === "ArrowRight" || e.key === "ArrowDown") onMoveByKey(location.id, 1, e);
          }}
        />
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
      <div className={`inv-shelf-items ${view}`}>
        {sorted.map((item) => (
          <InventoryItem
            key={item.id}
            item={item}
            view={view}
            active={item.id === activeItemId}
            selected={selectedIds.has(item.id)}
            onSelect={() => onSelect(item.id)}
            draggable={!item.isLeftover}
            onToggleSelect={() => onToggleSelect(item.id)}
            onUpdate={onUpdate}
            recipe={item.isLeftover ? recipes.find((r) => r.id === item.recipeId) : null}
            shelfIds={shelfIds}
          />
        ))}
        {sorted.length === 0 && <div className="inv-shelf-empty">{t("inventory.dropHere")}</div>}
      </div>
      {resizable && (
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

// "+ Add section" in the title row: it turns into a field for the new shelf's
// name (Enter adds it, Escape or an empty field cancels), so nothing is made
// until it has a name. The new shelf goes at the end, and the page scrolls to it.
function AddSectionButton({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  function close() {
    setName("");
    setError(null);
    setOpen(false);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return close();
    try {
      await onAdd(trimmed);
      close();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button type="button" className="riso-inv-btn" onClick={() => setOpen(true)}>
        {t("inventory.addSection")}
      </button>
    );
  }
  return (
    <span className="riso-inv-add-section">
      <input
        autoFocus
        aria-label={t("inventory.shelfName")}
        placeholder={t("inventory.shelfNamePlaceholder")}
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") close();
        }}
        onBlur={() => !error && submit()}
      />
      {error && (
        <span className="riso-inv-add-section-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// Compact / Tiles: switches every shelf (remembered per account on this device).
// The shared Segmented control at the design's inset size.
function ViewToggle({ view, onChange }) {
  return (
    <Segmented
      className="inset"
      ariaLabel={t("inventory.viewAria")}
      value={view}
      onChange={onChange}
      options={[
        { id: "compact", label: t("inventory.viewCompact") },
        { id: "tiles", label: t("inventory.viewTiles") },
      ]}
    />
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
  onPutBackRemoved,
  onSetStorage,
  onRestoreRows,
  recipes,
  onFindRecipes,
  onPlanMeal,
  onFindRecipesForSelection,
  locations,
  layout,
  onSaveLayout,
  onAddLocation,
  onRenameLocation,
  onDeleteLocation,
  onToast,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeItemId, setActiveItemId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  // The shelf a shelf's own + opened the form for (the title row's + Add item
  // starts in the fridge).
  const [addLocation, setAddLocation] = useState("fridge");
  const [showScan, setShowScan] = useState(false);
  const [view, setView] = useInventoryView(user.id);
  const [removed] = useRemovedItems();
  const [storageOpen, setStorageOpen] = useState(false);
  const [removedOpen, setRemovedOpen] = useState(false);
  const isPhone = useIsPhone();
  const showToast = onToast;
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (activeItemId && !items.some((i) => i.id === activeItemId)) setActiveItemId(null);
  }, [items, activeItemId]);

  // A pop-up only ever closes itself. Used up, Tossed and Remove take the item off
  // at once (which closes its pop-up, above) and close it again once the server
  // answers; by then another item may be open, and it must stay open.
  const closeItem = (id) => () => setActiveItemId((current) => (current === id ? null : current));

  useEffect(() => {
    if (!activeItemId) return;
    function handleKey(e) {
      if (e.key === "Escape") setActiveItemId(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeItemId]);

  // A drag never opens the item it lifted: the click that follows a drop (or a
  // still hold let go) is swallowed, and so is any click for a moment after it.
  const carrying = useRef(false);
  const calmUntil = useRef(0);
  useDndMonitor({
    onDragStart: (e) => {
      if (e.active.data.current?.inventoryItemId) carrying.current = true;
    },
    onDragEnd: () => {
      if (carrying.current) calmUntil.current = Date.now() + 250;
      carrying.current = false;
    },
    onDragCancel: () => {
      if (carrying.current) calmUntil.current = Date.now() + 250;
      carrying.current = false;
    },
  });
  function swallowClick(e) {
    if (!carrying.current && Date.now() >= calmUntil.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      if (item?.isLeftover) {
        // Leftovers keep the leftover freezer time, from today.
        const now = new Date();
        const recipe = recipes.find((r) => r.id === item.recipeId);
        if (item.location !== "freezer") await onUpdate(id, { location: "freezer", purchasedAt: now.toISOString(), expiresAt: leftoverExpiry(recipe, "freezer", now) });
        continue;
      }
      const freezerData = item?.locations?.freezer;
      if (freezerData) await onUpdate(id, { location: "freezer", expiresAt: freezerData.expiresAt });
    }
  }

  const activeItem = items.find((i) => i.id === activeItemId);
  // "Soon" is today to 3 days (the use-by day itself is not expired); expired
  // items (a day before today or earlier) are counted on their own.
  const soonCount = items.filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0 && daysUntil(i.expiresAt) <= 3).length;
  const expiredCount = items.filter((i) => i.expiresAt && daysUntil(i.expiresAt) < 0).length;

  // Built-in shelves (Fridge/Freezer/Pantry, USDA-backed, and Leftovers) and the
  // user's own custom sections, in the user's order, with their names and sizes.
  const sections = orderedSections(locations, layout);
  // Every shelf that exists: an item that says it is on one that was just deleted is on its default shelf.
  const shelfIds = new Set(sections.map((sec) => sec.id));

  function scrollToShelf(id) {
    document.querySelector(`.inv-shelves [data-section-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // A shelf dropped on another takes that shelf's place and the others close up
  // around it (the shared reorder piece, as Grocery's stores). Saved at once, with
  // the widths and heights as they were.
  function moveSection(id, overId) {
    const from = sections.findIndex((sec) => sec.id === id);
    const to = sections.findIndex((sec) => sec.id === overId);
    if (from < 0 || to < 0 || from === to) return;
    onSaveLayout(layoutPayload(arrayMove(sections, from, to)));
  }
  useReorderDrop(SHELF_DRAG, (carried, target) => moveSection(carried.shelf, target.shelf));

  function moveSectionByKey(id, dir, e) {
    e.preventDefault();
    const i = sections.findIndex((sec) => sec.id === id);
    const target = sections[i + dir];
    if (target) moveSection(id, target.id);
  }

  // The shelves slide to where the 12-column grid will put them (lib/reorderGrid.js).
  const gridRef = useRef(null);
  const shelfStrategy = useMemo(() => gridSortingStrategy({ columns: GRID_COLUMNS, getGrid: () => gridRef.current }), []);

  function updateSection(id, patch) {
    onSaveLayout(layoutPayload(sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec))));
  }

  async function renameSection(sec, name) {
    if (sec.custom) await onRenameLocation(sec.id, name);
    else updateSection(sec.id, { label: name });
  }

  // The one-time list after the move to two fields: items whose storage was lost, and an old shelf
  // that is now an empty copy of a built-in one. Nothing here changes by itself.
  const unknownStorage = unknownStorageItems(items);
  const oldShelves = emptyDuplicateShelves(locations, layout, items).map((shelf) => ({
    id: shelf.id,
    name: shelf.name,
    builtIn: sections.find((sec) => !sec.custom && normalizeName(sec.label) === normalizeName(shelf.name))?.label || shelf.name,
  }));
  const shelfName = (id) => sections.find((sec) => sec.id === id)?.label || "";

  async function confirmStorage(choices) {
    const before = await onSetStorage(choices);
    setStorageOpen(false);
    showToast(t("inventory.storageSheet.done", { count: choices.length }), () => onRestoreRows(before));
  }

  async function deleteOldShelf(shelf) {
    await onDeleteLocation(shelf.id);
    showToast(t("inventory.storageSheet.oldDeleted", { name: shelf.name }), () => onAddLocation(shelf.name));
  }

  async function putBack(entry) {
    try {
      await onPutBackRemoved(entry);
      showToast(t("inventory.removed.putBackDone", { name: entry.item.name }));
    } catch {
      showToast(t("inventory.removed.putBackFailed", { name: entry.item.name }));
    }
  }

  return (
    <div className="riso-theme riso-inv inv-page" data-theme="light">
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
          <ViewToggle view={view} onChange={setView} />
          <button type="button" className="riso-inv-btn" onClick={() => setShowScan(true)}>
            {t("inventory.scanReceipt")}
          </button>
          <AddSectionButton
            onAdd={async (name) => {
              const created = await onAddLocation(name);
              // Scroll to it once it's on the page.
              if (created?.id) setTimeout(() => scrollToShelf(created.id), 50);
            }}
          />
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

      {(unknownStorage.length > 0 || oldShelves.length > 0) && (
        <div className="riso-inv-storagebanner" role="status">
          <span className="riso-inv-storagebanner-text">
            {unknownStorage.length > 0 && t("inventory.storageBanner.unknown", { count: unknownStorage.length })}
            {unknownStorage.length > 0 && oldShelves.length > 0 ? " " : ""}
            {oldShelves.length > 0 && t("inventory.storageBanner.oldShelf", { name: oldShelves[0].name })}
          </span>
          <button type="button" className="riso-inv-btn" onClick={() => setStorageOpen(true)}>
            {t("inventory.storageBanner.review")}
          </button>
        </div>
      )}

      {items.length === 0 && <p className="empty-state">{t("inventory.empty")}</p>}

      <div className="inv-shelves" ref={gridRef} onClickCapture={swallowClick}>
        <ReorderList ids={sections.map((loc) => shelfDragId(loc.id))} strategy={shelfStrategy}>
          {sections.map((loc) => (
            <ShelfColumn
              key={loc.id}
              location={loc}
              items={items.filter((i) => onShelf(i, loc.id, shelfIds))}
              shelfIds={shelfIds}
              view={view}
              onUpdate={onUpdate}
              recipes={recipes}
              activeItemId={activeItemId}
              selectedIds={selectedIds}
              onSelect={setActiveItemId}
              onToggleSelect={toggleSelect}
              editing={editingId === loc.id}
              onEdit={(on) => setEditingId(on ? loc.id : null)}
              onAddHere={() => {
                setAddLocation(loc.id);
                setShowAdd(true);
              }}
              onRename={(name) => renameSection(loc, name)}
              onDelete={() => {
                setEditingId(null);
                onDeleteLocation(loc.id);
              }}
              resizable={!isPhone}
              onResize={({ span, height }) => updateSection(loc.id, { span, height })}
              onMoveByKey={moveSectionByKey}
            />
          ))}
        </ReorderList>
      </div>

      <RemovedStrip
        className="riso-inv-removed"
        collapsible
        open={removedOpen}
        onToggle={() => setRemovedOpen((o) => !o)}
        label={t("inventory.removed.title")}
        items={removed.map((entry) => ({
          key: entry.id,
          name: entry.item.name,
          meta: `${removedHowLabel(entry.how)} · ${removedWhenLabel(entry.removedAt)}`,
          putBackLabel: t("inventory.removed.putBack"),
          ariaLabel: t("inventory.removed.putBackAria", { name: entry.item.name }),
          onPutBack: () => putBack(entry),
        }))}
      />

      {activeItem && (
        <InventoryItemForm
          key={activeItem.id}
          mode="edit"
          item={activeItem}
          sections={sections}
          recipes={recipes}
          onSave={onUpdate}
          onDelete={onDelete}
          onConsume={onConsume}
          onFindRecipes={onFindRecipes}
          onPlanMeal={onPlanMeal}
          onToast={showToast}
          onClose={closeItem(activeItem.id)}
          isPhone={isPhone}
        />
      )}

      {storageOpen && (
        <InventoryStorageSheet
          items={unknownStorage}
          shelfName={shelfName}
          oldShelves={oldShelves}
          isPhone={isPhone}
          onConfirm={confirmStorage}
          onDeleteShelf={deleteOldShelf}
          onClose={() => setStorageOpen(false)}
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
          recipes={recipes}
          onAdd={onAdd}
          onDelete={onDelete}
          onToast={showToast}
          onClose={() => setShowAdd(false)}
          isPhone={isPhone}
        />
      )}
      {showScan && (
        <Modal title={t("inventory.scanReceipt")} onClose={() => setShowScan(false)}>
          <ReceiptScanPanel onRequestInventoryAdd={onRequestInventoryAdd} onDone={() => setShowScan(false)} />
        </Modal>
      )}
    </div>
  );
}
