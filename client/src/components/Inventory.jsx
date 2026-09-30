import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { parseQuantityInput, unitLabel } from "../lib/units.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { api } from "../api.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { BottomSheet, HintStrip } from "./RisoControls.jsx";
import { useIsPhone } from "../hooks/useIsPhone.js";

// Fridge and Freezer sit side by side, Pantry after - see the design
// handoff. "Counter" is a fourth USDA location the bundled data supports
// but this app has no dedicated shelf for yet (deferred per the handoff's
// own note that it's optional).
const SHELF_LOCATIONS = [
  { id: "fridge", label: "Fridge" },
  { id: "freezer", label: "Freezer" },
  { id: "pantry", label: "Pantry" },
];

// Sections sit on a 6-column grid. Pantry spans the full row by default (it
// tends to hold the most); every other section starts at half.
const GRID_COLUMNS = 6;
// Preset sizes, so sections line up: widths of 1/3, 1/2, 2/3 or the whole
// row, heights in fixed steps (or "fit" - as tall as its items).
const SPAN_STEPS = [2, 3, 4, 6];
const SPAN_LABEL = { 2: "1/3", 3: "1/2", 4: "2/3", 6: "Full" };
const HEIGHT_STEPS = [240, 360, 480, 600, 720, 840];
const nearest = (steps, value) => steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best));
const LEGACY_SPAN = { third: 2, half: 3, full: 6 };
function spanOf(size, id) {
  const n = LEGACY_SPAN[size] ?? parseInt(size, 10);
  if (n >= 1 && n <= GRID_COLUMNS) return nearest(SPAN_STEPS, n);
  return id === "pantry" ? 6 : 3;
}

// Built-in shelves plus custom sections, in the user's saved order (anything
// not in the saved layout yet - a brand-new section - goes at the end), with
// their names, widths (in grid columns) and heights.
function orderedSections(locations, layout) {
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
        height: row?.height ? nearest(HEIGHT_STEPS, row.height) : null,
      };
    });
}

function layoutPayload(sections) {
  return sections.map((s) => ({
    sectionId: s.id,
    label: !s.custom && s.label !== s.defaultLabel ? s.label : null,
    size: String(s.span),
    height: s.height,
  }));
}

function isUrgent(item) {
  if (!item.expiresAt) return false;
  return daysUntil(item.expiresAt) <= 3;
}

// Card/panel expiry chip - a compact variant of formatExpiry's fuller
// sentence, matching the design handoff's exact label rules.
function expiryChip(item) {
  if (!item.expiresAt) return "+ DATE";
  const d = daysUntil(item.expiresAt);
  if (d < 0) return "EXPIRED";
  if (d === 0) return "TODAY";
  if (d === 1) return "TOMORROW";
  if (d < 60) return `${d}D`;
  if (d < 365) return `${Math.round(d / 30)}MO`;
  return `${Math.round(d / 365)}Y`;
}

// Urgent items (<=3 days, per isUrgent) swap the calm DM Mono label for a
// tilted pink sticker instead, matching the handoff's "tomorrow!"/"{n}
// days" copy.
function urgentLabel(item) {
  const d = daysUntil(item.expiresAt);
  if (d < 0) return "expired!";
  if (d === 0) return "today!";
  if (d === 1) return "tomorrow!";
  return `${d} days`;
}

// The add form fetches a suggested expiration date and category from the
// bundled USDA FoodKeeper data as soon as there's enough to look up (a name
// and a location) - both always shown as editable, never locked in, since
// the suggestion is a starting point, not an authority.
function AddInventoryItemForm({ onAdd, onDone, sections }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("fridge");
  const [category, setCategory] = useState("Other");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);

  // Re-fetch the suggestion whenever the name or location settles, so
  // picking a different storage location (e.g. fridge -> freezer) updates
  // the date without the user having to retype anything. Category isn't
  // location-dependent but comes back from the same call, so it's applied
  // here too - unless the user already picked one by hand for this item.
  useEffect(() => {
    if (!name.trim()) return;
    let cancelled = false;
    setSuggesting(true);
    const timer = setTimeout(() => {
      api
        .suggestPantryExpiration(name.trim(), location)
        .then(({ expiresAt: suggested, category: suggestedCategory }) => {
          if (cancelled) return;
          if (suggested) setExpiresAt(suggested.slice(0, 10));
          if (suggestedCategory && !categoryTouched) setCategory(suggestedCategory);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSuggesting(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, location]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await onAdd({
        name: name.trim(),
        quantity: parseQuantityInput(quantity),
        unit: unit || null,
        location,
        category,
        expiresAt: expiresAt || null,
      });
      setName("");
      setQuantity("");
      setUnit("");
      setCategory("Other");
      setCategoryTouched(false);
      setExpiresAt("");
      onDone?.();
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className="pantry-add-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        type="text"
        placeholder="e.g. Chicken breast"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        placeholder="Qty"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        style={{ width: 56 }}
      />
      <UnitSelect aria-label="Unit" value={unit} onChange={setUnit} emptyLabel="unit" />
      <select value={location} onChange={(e) => setLocation(e.target.value)}>
        {sections.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        title={suggesting ? "Looking up a suggested date…" : "Expiration date"}
      />
      <button className="btn primary btn-sm" type="submit" disabled={adding}>
        Add
      </button>
    </form>
  );
}

// Upload a receipt photo/PDF, let Gemini read it into candidate item names,
// then let the user review/edit/deselect before anything actually hits the
// database - OCR'd receipt text is noisy enough (coupons, loyalty lines,
// misread brand names) that a blind bulk-add would just make a mess to
// clean up later. Each accepted row goes through the same onAdd as the
// manual form above, so it gets the same suggested category/expiration.
function ReceiptScanPanel({ onAdd, onDone, sections }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // [{ name, quantity, location, selected }] once parsed
  const [saving, setSaving] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { items } = await api.parseReceipt(file);
      setPending(
        items.map((it) => ({ name: it.name, quantity: it.quantity, location: "fridge", selected: true }))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function updateRow(i, patch) {
    setPending((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function handleAddSelected() {
    const selected = pending.filter((row) => row.selected && row.name.trim());
    if (selected.length === 0) return;
    setSaving(true);
    try {
      for (const row of selected) {
        await onAdd({ name: row.name.trim(), quantity: row.quantity ?? null, location: row.location });
      }
      setPending(null);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (pending) {
    const selectedCount = pending.filter((row) => row.selected).length;
    return (
      <div className="receipt-review">
        <p className="receipt-review-intro">
          Found {pending.length} item{pending.length === 1 ? "" : "s"} — uncheck anything that isn't
          actually food, fix any misread names, then add the rest.
        </p>
        <ul className="receipt-review-list">
          {pending.map((row, i) => (
            <li key={i} className="receipt-review-row">
              <input
                type="checkbox"
                checked={row.selected}
                onChange={(e) => updateRow(i, { selected: e.target.checked })}
                aria-label={`Include ${row.name}`}
              />
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                disabled={!row.selected}
              />
              <select
                value={row.location}
                onChange={(e) => updateRow(i, { location: e.target.value })}
                disabled={!row.selected}
              >
                {sections.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {error && <p className="flyer-upload-error">{error}</p>}
        <div className="receipt-review-actions">
          <button type="button" className="btn primary" onClick={handleAddSelected} disabled={saving || selectedCount === 0}>
            {saving ? "Adding…" : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"} to inventory`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flyer-upload-form">
      <label className="form-label">
        Receipt photo or PDF
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {uploading && <p className="receipt-review-intro">Reading…</p>}
      {error && <p className="flyer-upload-error">{error}</p>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay riso-inv-form-overlay" onClick={onClose}>
      <div className="card modal-content riso-inv-form-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close riso-inv-form-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="riso-inv-form-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ItemCard({ item, active, selected, onSelect, onToggleSelect, draggable = true }) {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const urgent = isUrgent(item);
  // Items with no tracked date get the same pink-sticker treatment as a
  // real countdown (reading "+ DATE" instead of a day count) - a nudge to
  // set one, per the design handoff. It's cosmetic only: `urgent` (not
  // `showSticker`) still gates the card's ink shadow and the freshness
  // bar's color, and the "N to use soon" count only ever counts real
  // countdowns (see soonCount in the Inventory component below).
  const showSticker = urgent || !item.expiresAt;
  // USDA range when there is one; otherwise the span from purchase to the
  // date the user set (milk has no USDA fridge range - it's on the carton).
  const span =
    item.shelfLifeDays ||
    (item.expiresAt && item.purchasedAt ? (new Date(item.expiresAt) - new Date(item.purchasedAt)) / 86400000 : 0);
  const pct = item.expiresAt && span > 0 ? Math.min(100, Math.max(6, (Math.max(days, 0) / span) * 100)) : null;

  // A fridge item close to expiring that would keep much longer in the
  // freezer gets a one-line nudge, using the freezer range already
  // computed server-side (see pantryInventory.js's GET / enrichment) - no
  // extra lookup needed here.
  const freezeTip =
    urgent && item.location === "fridge" && item.locations?.freezer
      ? `Freeze it to keep until ${new Date(item.locations.freezer.expiresAt).toLocaleDateString("en-US", {
          month: "long",
        })}.`
      : null;

  // Draggable onto any other shelf column (see App.jsx's handleDragEnd,
  // routed via the "inv-shelf-<location>" droppable id below) - the
  // general-purpose way to move an item, since the edit panel's storage
  // pills only cover the three USDA-backed locations, not custom sections.
  // PointerSensor's activation delay (App.jsx) is what keeps a quick click
  // working as a click rather than always starting a drag.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inv-item-${item.id}`,
    data: { inventoryItemId: item.id, inventoryItem: item },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={`inv-card${active ? " active" : ""}${urgent && !active ? " urgent" : ""}${
        isDragging ? " dragging" : ""
      }`}
      onClick={onSelect}
    >
      <div className="inv-card-top">
        <span
          role="checkbox"
          aria-checked={selected}
          tabIndex={0}
          className={`inv-card-check${selected ? " on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }
          }}
          aria-label={`Select ${item.name}`}
        >
          {selected ? "✓" : ""}
        </span>
        <div className="inv-card-main">
          <span className="inv-card-name">{item.name}</span>
          {(item.quantity != null || item.unit) && (
            <span className="inv-card-qty">
              {item.quantity ?? ""} {unitLabel(item.unit, item.quantity)}
            </span>
          )}
        </div>
        {showSticker ? (
          <span className="inv-card-urgent-sticker">{urgent ? urgentLabel(item) : expiryChip(item)}</span>
        ) : (
          <span className="inv-card-expiry">{expiryChip(item)}</span>
        )}
      </div>
      {pct !== null && (
        <div className="inv-freshness-track">
          <div
            className={`inv-freshness-fill${days !== null && days <= 3 ? " urgent" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {freezeTip && <p className="inv-card-tip">{freezeTip}</p>}
    </div>
  );
}

// Header controls for a section: rename, move earlier/later, size, remove.
function SectionEditor({ location, onRename, onDelete, onDone }) {
  const [name, setName] = useState(location.label);
  const [error, setError] = useState(null);

  async function commitName() {
    const next = name.trim();
    if (!next || next === location.label) {
      setName(location.label);
      return true;
    }
    try {
      await onRename(next);
      setError(null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  return (
    <div className="inv-section-editor">
      <input
        aria-label="Section name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && (await commitName())) onDone();
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="inv-section-editor-row">
        {location.custom && (
          <button type="button" className="inv-section-editor-remove" onClick={onDelete}>
            Remove
          </button>
        )}
        <button
          type="button"
          className="inv-section-editor-done"
          onMouseDown={(e) => e.preventDefault()}
          onClick={async () => {
            if (await commitName()) onDone();
          }}
        >
          Done
        </button>
      </div>
      {error && <p className="inv-section-editor-error">{error}</p>}
    </div>
  );
}

// Drag the corner handle to resize: the width snaps to 1/3, 1/2, 2/3 or
// full, the height to fixed steps, so neighbouring sections line up (cards
// scroll inside a section shorter than they are). Arrow keys step through
// the same sizes; Home goes back to fitting its items.
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
      const newSpan =
        m.cols === GRID_COLUMNS ? nearest(SPAN_STEPS, (widthNow + m.gap) / (m.colWidth + m.gap)) : span;
      const newHeight = nearest(HEIGHT_STEPS, startHeight + (ev.clientY - startY));
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
    const shelfHeight = Math.round(shelfRef.current?.getBoundingClientRect().height || 240);
    const si = SPAN_STEPS.indexOf(span);
    const hi = HEIGHT_STEPS.indexOf(nearest(HEIGHT_STEPS, height ?? shelfHeight));
    const steps = {
      ArrowLeft: { span: SPAN_STEPS[Math.max(0, si - 1)], height },
      ArrowRight: { span: SPAN_STEPS[Math.min(SPAN_STEPS.length - 1, si + 1)], height },
      ArrowUp: { span, height: HEIGHT_STEPS[Math.max(0, hi - 1)] },
      ArrowDown: { span, height: HEIGHT_STEPS[Math.min(HEIGHT_STEPS.length - 1, hi + (height ? 1 : 0))] },
    };
    if (e.key in steps) {
      e.preventDefault();
      onCommit(steps[e.key]);
    } else if (e.key === "Home" || e.key === "Delete") {
      e.preventDefault();
      onCommit({ span, height: null }); // back to fitting its items
    }
  }

  return (
    <button
      type="button"
      className="inv-shelf-resize"
      aria-label={label}
      title="Drag to resize (arrow keys work too)"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function ShelfColumn({
  location,
  items,
  activeItemId,
  selectedIds,
  onSelect,
  onToggleSelect,
  draggable = true,
  editorProps,
  arrangeable,
  onResize,
  onStartMove,
  onMoveByKey,
  moveState,
}) {
  const [editing, setEditing] = useState(false);
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

  // Every shelf is a drop target for a dragged card (see ItemCard above and
  // App.jsx's handleDragEnd, which routes "inv-shelf-<id>" ids) - built-in
  // and custom sections work identically here.
  const { setNodeRef, isOver } = useDroppable({ id: `inv-shelf-${location.id}` });

  const span = preview?.span ?? location.span;
  const height = preview ? preview.height : location.height;
  // A wide section lays its cards out in their own grid.
  const wide = span >= 4;
  const classes = ["inv-shelf"];
  if (wide) classes.push("wide");
  if (height) classes.push("fixed-height");
  if (isOver) classes.push("drop-active");
  if (preview) classes.push("resizing");
  const sizeBadge = preview ? `${SPAN_LABEL[span] || span} · ${height ? `${height}px` : "fit"}` : null;
  if (moveState?.id === location.id) classes.push("moving");
  if (moveState?.overId === location.id) classes.push(moveState.after ? "drop-after" : "drop-before");

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        shelfRef.current = node;
      }}
      className={classes.join(" ")}
      style={{ "--span": span, "--span-md": span >= 4 ? 2 : 1, height: height ? `${height}px` : undefined }}
      data-section-id={location.id}
      aria-label={`${location.label} section`}
    >
      {editing ? (
        <SectionEditor location={location} {...editorProps} onDone={() => setEditing(false)} />
      ) : (
        <div className="inv-shelf-header">
          {arrangeable && (
            <button
              type="button"
              className="inv-shelf-grip"
              aria-label={`Move the "${location.label}" section`}
              title="Drag to move this section (arrow keys work too)"
              onPointerDown={(e) => onStartMove(location.id, e)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") onMoveByKey(location.id, -1, e);
                if (e.key === "ArrowRight" || e.key === "ArrowDown") onMoveByKey(location.id, 1, e);
              }}
            >
              ⠿
            </button>
          )}
          <span className="inv-shelf-title">{location.label}</span>
          <span className="inv-shelf-count">{items.length}</span>
          <span className="inv-shelf-note">Soonest first</span>
          <button
            type="button"
            className="inv-shelf-edit"
            aria-label={`Edit the "${location.label}" section`}
            title="Rename this section"
            onClick={() => setEditing(true)}
          >
            ✎<span className="inv-shelf-edit-text"> Edit section</span>
          </button>
        </div>
      )}
      {sorted.length === 0 ? (
        <div className="inv-shelf-empty">Nothing here yet</div>
      ) : (
        <div className={`inv-shelf-items${wide ? " grid" : ""}`}>
          {sorted.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              selected={selectedIds.has(item.id)}
              onSelect={() => onSelect(item.id)}
              draggable={draggable}
              onToggleSelect={() => onToggleSelect(item.id)}
            />
          ))}
        </div>
      )}
      {sizeBadge && <span className="inv-shelf-size-badge">{sizeBadge}</span>}
      {arrangeable && (
        <ResizeHandle
          label={`Resize the "${location.label}" section`}
          span={location.span}
          height={location.height}
          shelfRef={shelfRef}
          onPreview={setPreview}
          onCommit={onResize}
        />
      )}
    </div>
  );
}

// A trailing tile in the shelves grid for creating a new custom section
// (e.g. "Garage Freezer", "Wine Cellar") - plain storage bins with no USDA
// backing, so items in one just don't get a freshness bar or a suggested
// expiry (same as any item whose name has no FoodKeeper match at all).
function AddSectionTile({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="inv-add-section-tile" onClick={() => setOpen(true)}>
        + Add section
      </button>
    );
  }

  return (
    <form className="inv-add-section-tile form" onSubmit={handleSubmit}>
      <input
        autoFocus
        type="text"
        placeholder="e.g. Garage Freezer"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
      />
      <div className="inv-add-section-actions">
        <button type="submit" className="btn primary btn-sm" disabled={saving || !name.trim()}>
          Add
        </button>
        <button type="button" className="btn subtle btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditPanel({ item, recipes, onUpdate, onDelete, onFindRecipes, isStaple, onToggleStaple, labelFor = {} }) {
  const [nameDraft, setNameDraft] = useState(item.name);

  // Resync the draft when a different item opens (or this one's name
  // changes from elsewhere) - without this, switching straight from one
  // item's edit panel to another's would carry the previous item's typed
  // text over.
  useEffect(() => {
    setNameDraft(item.name);
  }, [item.id, item.name]);

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onUpdate(item.id, { name: trimmed });
    else setNameDraft(item.name);
  }

  function adjustQty(delta) {
    const next = Math.max(0, (item.quantity ?? 0) + delta);
    onUpdate(item.id, { quantity: next });
  }

  // Union of every location with real USDA data for this item, plus its
  // current location even if that one happens to have none (e.g. an item
  // whose only guidance is "use the date on the package") - so the panel
  // never ends up with no pill selected.
  const pillLocations = SHELF_LOCATIONS.filter(
    (l) => item.locations?.[l.id] || l.id === item.location
  );

  const useByText = item.expiresAt
    ? `Use by ${new Date(item.expiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: daysUntil(item.expiresAt) > 300 ? "numeric" : undefined,
      })}.`
    : "No date yet. Pick a storage spot above to use the USDA estimate, or pick a date.";

  const recipeCount = recipes.filter(
    (r) => !r.isPlaceholder && r.ingredients?.some((i) => i.name?.toLowerCase().includes(item.name.toLowerCase()))
  ).length;

  return (
    <aside className="inv-panel">
      <div className="inv-panel-header">
        <input
          type="text"
          className="inv-panel-name-input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setNameDraft(item.name);
              e.currentTarget.blur();
            }
          }}
          aria-label="Item name"
        />
        <span className="inv-panel-category">{item.category}</span>
      </div>

      <div>
        <div className="inv-panel-label">Quantity</div>
        <div className="inv-qty-stepper">
          <button type="button" onClick={() => adjustQty(-1)} aria-label="Decrease quantity">
            −
          </button>
          <span>
            {item.quantity ?? 0}
            {item.unit ? ` ${unitLabel(item.unit, item.quantity ?? 0)}` : ""}
          </span>
          <button type="button" onClick={() => adjustQty(1)} aria-label="Increase quantity">
            +
          </button>
        </div>
      </div>

      <div>
        <div className="inv-panel-label">Stored in · USDA</div>
        <div className="inv-storage-pills">
          {pillLocations.map((l) => {
            const data = item.locations?.[l.id];
            const active = item.location === l.id;
            return (
              <button
                key={l.id}
                type="button"
                className={`inv-storage-pill${active ? " active" : ""}`}
                disabled={active}
                onClick={() => onUpdate(item.id, { location: l.id, expiresAt: data ? data.expiresAt : null })}
              >
                <span>{labelFor[l.id] || l.label}</span>
                {data && <span className="inv-storage-pill-range">{data.rangeLabel}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="inv-use-by">
        {useByText}{" "}
        <input
          type="date"
          className="inv-use-by-picker"
          value={item.expiresAt ? item.expiresAt.slice(0, 10) : ""}
          onChange={(e) => onUpdate(item.id, { expiresAt: e.target.value || null })}
        />
      </p>

      <div className="inv-panel-staple">
        <button type="button" className={`btn subtle btn-sm${isStaple ? " active" : ""}`} onClick={() => onToggleStaple(item)}>
          {isStaple ? "★ Pantry staple" : "☆ Mark as pantry staple"}
        </button>
      </div>

      <div className="inv-panel-footer">
        {recipeCount} of your recipes use {item.name}.{" "}
        <button type="button" className="link-btn" onClick={() => onFindRecipes(item.name)}>
          See them →
        </button>
        <br />
        <button type="button" className="link-btn subtle" onClick={() => onDelete(item.id)}>
          Remove (typo or duplicate, not used/tossed)
        </button>
      </div>
    </aside>
  );
}

function FloatingActionBar({ count, onFindRecipes, onConsume, onFreeze, onClear }) {
  return (
    <div className="inv-action-bar">
      <span className="inv-action-count">{count} selected</span>
      <button type="button" className="inv-action-btn primary" onClick={onFindRecipes}>
        Find recipes
      </button>
      <button type="button" className="inv-action-btn" onClick={() => onConsume("consumed")}>
        Used up
      </button>
      <button type="button" className="inv-action-btn" onClick={() => onConsume("wasted")}>
        Tossed
      </button>
      <button type="button" className="inv-action-btn" onClick={onFreeze}>
        Freeze
      </button>
      <button type="button" className="inv-action-btn" onClick={onClear} aria-label="Clear selection">
        ×
      </button>
    </div>
  );
}

export function Inventory({
  user,
  items,
  onAdd,
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
  const [showScan, setShowScan] = useState(false);
  const isPhone = useIsPhone();
  const [phoneShelf, setPhoneShelf] = useState("fridge");
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
  const soonCount = items.filter((i) => i.expiresAt && daysUntil(i.expiresAt) <= 3).length;

  // Built-in shelves (Fridge/Freezer/Pantry, USDA-backed) and the user's own
  // custom sections, in the user's order, with their names and sizes.
  const sections = orderedSections(locations, layout);
  const shelfLocations = sections;
  const labelFor = Object.fromEntries(sections.map((sec) => [sec.id, sec.label]));

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
    <div className="riso-theme riso-inv inv-page" data-theme="light">
      <div className="riso-inv-header">
        <div className="riso-inv-title-block">
          <p className="riso-eyebrow">
            {items.length} item{items.length === 1 ? "" : "s"} · {soonCount} to use soon
          </p>
          <h1 className="riso-inv-title">
            What you've <span className="accent">got.</span>
          </h1>
        </div>
        <div className="riso-inv-header-actions">
          <button type="button" className="riso-inv-btn" onClick={() => setShowScan(true)}>
            Scan receipt
          </button>
          <button type="button" className="riso-inv-btn primary" onClick={() => setShowAdd(true)}>
            + Add item
          </button>
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="inventory">
        Each shelf is sorted by what expires first. Click an item to edit it. Tick several to mark them
        used up, tossed or frozen all at once. Pink means use it within 3 days.
      </HintStrip>

      {items.length === 0 && (
        <p className="empty-state">
          Nothing tracked yet — add what's in your fridge, pantry, or freezer above.
        </p>
      )}

      {isPhone && (
        <div className="riso-inv-shelf-switch" role="tablist" aria-label="Shelf">
          {shelfLocations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              role="tab"
              aria-selected={phoneShelf === loc.id}
              className={phoneShelf === loc.id ? "on" : ""}
              onClick={() => setPhoneShelf(loc.id)}
            >
              {loc.label} <span>{items.filter((i) => i.location === loc.id).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="inv-shelves">
        {shelfLocations
          .filter((loc) => !isPhone || loc.id === phoneShelf)
          .map((loc) => (
            <ShelfColumn
              key={loc.id}
              location={loc}
              items={items.filter((i) => i.location === loc.id)}
              activeItemId={activeItemId}
              selectedIds={selectedIds}
              onSelect={setActiveItemId}
              onToggleSelect={toggleSelect}
              draggable={!isPhone}
              editorProps={{
                onRename: (name) => renameSection(loc, name),
                onDelete: () => {
                  if (isPhone) setPhoneShelf("fridge");
                  onDeleteLocation(loc.id);
                },
              }}
              arrangeable={!isPhone}
              onResize={({ span, height }) => updateSection(loc.id, { span, height })}
              onStartMove={startMove}
              onMoveByKey={moveSectionByKey}
              moveState={moveState}
            />
          ))}
        <AddSectionTile onAdd={onAddLocation} />
      </div>

      {activeItem && isPhone && (
        <BottomSheet label={`Edit ${activeItem.name}`} onClose={() => setActiveItemId(null)}>
          <EditPanel
            item={activeItem}
            recipes={recipes}
            onUpdate={onUpdate}
            onDelete={(id) => {
              setActiveItemId(null);
              onDelete(id);
            }}
            onFindRecipes={onFindRecipes}
            isStaple={staples.has(activeItem.core)}
            onToggleStaple={toggleStaple}
            labelFor={labelFor}
          />
        </BottomSheet>
      )}

      {activeItem && !isPhone && (
        <div className="riso-inv-edit-overlay" onClick={() => setActiveItemId(null)}>
          <div className="riso-inv-edit-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="riso-inv-edit-close"
              onClick={() => setActiveItemId(null)}
              aria-label="Close"
            >
              ×
            </button>
            <EditPanel
              item={activeItem}
              recipes={recipes}
              onUpdate={onUpdate}
              onDelete={(id) => {
                setActiveItemId(null);
                onDelete(id);
              }}
              onFindRecipes={onFindRecipes}
              isStaple={staples.has(activeItem.core)}
              onToggleStaple={toggleStaple}
              labelFor={labelFor}
            />
          </div>
        </div>
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
        <Modal title="Add item" onClose={() => setShowAdd(false)}>
          <AddInventoryItemForm onAdd={onAdd} sections={sections} />
        </Modal>
      )}
      {showScan && (
        <Modal title="Scan receipt" onClose={() => setShowScan(false)}>
          <ReceiptScanPanel onAdd={onAdd} onDone={() => setShowScan(false)} sections={sections} />
        </Modal>
      )}
    </div>
  );
}
