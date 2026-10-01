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
        height: row?.height ? Math.max(MIN_HEIGHT, row.height) : null,
      };
    });
}

function layoutPayload(sections) {
  return sections.map((s) => ({
    sectionId: s.id,
    label: !s.custom && s.label !== s.defaultLabel ? s.label : null,
    size: `c12:${s.span}`,
    height: s.height,
  }));
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

const LOCATION_WORD = { fridge: "fridge", freezer: "freezer", pantry: "pantry" };

// The card's storage tip, from the USDA FoodKeeper ranges the server sends
// (item.locations): in the freezer "Keeps 3-6 months frozen"; elsewhere
// "Freeze for 3-6 months" when it freezes, else "5-7 days in the fridge".
function storageTip(item) {
  const here = item.locations?.[item.location];
  const freezer = item.locations?.freezer;
  if (item.location === "freezer") return here ? `Keeps ${here.rangeLabel} frozen` : null;
  if (freezer) return `Freeze for ${freezer.rangeLabel}`;
  if (here && LOCATION_WORD[item.location]) return `${here.rangeLabel} in the ${LOCATION_WORD[item.location]}`;
  return null;
}

// The status strip's fill: days left on a 4-week scale, pink within 3
// days, yellow within a week, blue after that. Nothing from 28 days on,
// or with no date.
const STRIP_DAYS = 28;
function stripFor(item) {
  if (!item.expiresAt) return null;
  const d = daysUntil(item.expiresAt);
  if (d >= STRIP_DAYS) return null;
  const color = d <= 3 ? "pink" : d <= 7 ? "yellow" : "blue";
  const label = d < 0 ? "expired!" : d === 0 ? "today!" : d === 1 ? "tomorrow!" : d <= 7 ? `${d} days` : `${d}D`;
  return { pct: `${Math.max(8, (Math.max(d, 0) / STRIP_DAYS) * 100)}%`, color, label };
}

function ItemCard({ item, active, selected, onSelect, onToggleSelect, draggable = true }) {
  const strip = stripFor(item);
  const tip = storageTip(item);

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
      className={`inv-card${active ? " active" : ""}${isDragging ? " dragging" : ""}`}
      onClick={onSelect}
      aria-label={`${item.name}${strip ? `, ${strip.label}` : ""}`}
    >
      <div className="inv-card-strip">
        {strip && (
          <>
            <span className={`inv-card-fill ${strip.color}`} style={{ width: strip.pct }} />
            <span className="inv-card-days">{strip.label}</span>
          </>
        )}
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
          aria-label={`Select ${item.name}`}
        >
          {selected ? "✓" : ""}
        </span>
      </div>
      <div className="inv-card-body">
        <div className="inv-card-main">
          <span className="inv-card-name">{item.name}</span>
          {(item.quantity != null || item.unit) && (
            <span className="inv-card-qty">
              {item.quantity ?? ""} {unitLabel(item.unit, item.quantity)}
            </span>
          )}
        </div>
        {tip && (
          <div className="inv-card-tip">
            {tip}
            <span className="inv-card-source">USDA</span>
          </div>
        )}
      </div>
    </div>
  );
}

const WIDTH_PRESETS = [
  { label: "Full width", span: GRID_COLUMNS },
  { label: "Half", span: 6 },
  { label: "Third", span: 4 },
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
        aria-label="Section name"
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
          <button key={p.label} type="button" className={span === p.span ? "on" : ""} onClick={() => onResize({ span: p.span, height })}>
            {p.label}
          </button>
        ))}
        <button type="button" className={height ? "" : "on"} onClick={() => onResize({ span, height: null })}>
          Auto height
        </button>
        {location.custom && (
          <button type="button" className="danger" onClick={onDelete}>
            Delete shelf
          </button>
        )}
        <span className="inv-shelf-controls-note">
          {location.custom ? "Its items move to the Pantry. " : ""}Drag cards between shelves any time.
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
      title="Drag to resize. Double-click for auto height."
      onPointerDown={onPointerDown}
      onDoubleClick={() => onCommit({ span, height: null })}
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
  editing,
  onEdit,
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
  const sizeLabel = `${span}/${GRID_COLUMNS} · ${height ? `${height}PX` : "AUTO"}`;

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
      aria-label={`${location.label} section`}
    >
      <div className="inv-shelf-header">
        {arrangeable && (
          <button
            type="button"
            className="inv-shelf-grip"
            aria-label={`Move the "${location.label}" section`}
            title="Drag to move this shelf (arrow keys work too)"
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
        <button
          type="button"
          className={`inv-shelf-edit${editing ? " on" : ""}`}
          aria-label={editing ? `Done editing the "${location.label}" section` : `Edit the "${location.label}" section`}
          title={editing ? "Done" : "Edit shelf"}
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
          />
        ))}
        {sorted.length === 0 && <div className="inv-shelf-empty">Drop items here</div>}
      </div>
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
    </section>
  );
}

// "+ Add shelf" at the end of the grid makes a new shelf and opens it
// ready to rename.
function AddSectionTile({ onAdd }) {
  const [adding, setAdding] = useState(false);
  return (
    <button
      type="button"
      className="inv-add-section-tile"
      disabled={adding}
      onClick={async () => {
        setAdding(true);
        try {
          await onAdd();
        } finally {
          setAdding(false);
        }
      }}
    >
      {adding ? "Adding…" : "+ Add shelf"}
    </button>
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

  // Grams go 50 at a time, bottles and loaves a quarter at a time.
  const step = item.unit === "g" || item.unit === "ml" ? 50 : item.unit === "bottle" || item.unit === "loaf" ? 0.25 : 1;
  function adjustQty(dir) {
    const next = Math.max(0, Math.round(((item.quantity ?? 0) + dir * step) * 100) / 100);
    onUpdate(item.id, { quantity: next });
  }
  const dateRef = useRef(null);
  function pickDate() {
    const input = dateRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }
  const tip = storageTip(item);

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
    : "No date yet.";

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
          <button type="button" onClick={() => adjustQty(-1)} aria-label={`Decrease quantity by ${step}`}>
            −
          </button>
          <span>
            {item.quantity ?? 0}
            {item.unit ? ` ${unitLabel(item.unit, item.quantity ?? 0)}` : ""}
          </span>
          <button type="button" onClick={() => adjustQty(1)} aria-label={`Increase quantity by ${step}`}>
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

      {tip && (
        <div className="inv-panel-tip">
          <span>❄ {tip}</span>
          <span className="inv-panel-tip-source">
            SOURCE
            <br />
            USDA FOODKEEPER
          </span>
        </div>
      )}

      <p className="inv-use-by">
        {useByText}{" "}
        <button type="button" className="link-btn" onClick={pickDate}>
          Pick a date
        </button>
        <input
          ref={dateRef}
          type="date"
          className="inv-use-by-picker"
          aria-label="Use-by date"
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

  // A new shelf is named "New shelf" (or "New shelf 2"...) and opens in
  // rename mode.
  async function addShelf() {
    const taken = new Set(sections.map((sec) => sec.label.toLowerCase()));
    let name = "New shelf";
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New shelf ${n}`;
    const created = await onAddLocation(name);
    if (created?.id) {
      setEditingId(created.id);
      if (isPhone) setPhoneShelf(created.id);
    }
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

      <HintStrip userId={user.id} screenKey="inventory-v2">
        Shelves are sorted by what expires first. Click an item to edit it. Storage tips come from USDA
        FoodKeeper. Tick several to mark them used up, tossed or frozen all at once. Pink means use it within 3
        days.
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
              editing={editingId === loc.id}
              onEdit={(on) => setEditingId(on ? loc.id : null)}
              onRename={(name) => renameSection(loc, name)}
              onDelete={() => {
                setEditingId(null);
                if (isPhone) setPhoneShelf("fridge");
                onDeleteLocation(loc.id);
              }}
              arrangeable={!isPhone}
              onResize={({ span, height }) => updateSection(loc.id, { span, height })}
              onStartMove={startMove}
              onMoveByKey={moveSectionByKey}
              moveState={moveState}
            />
          ))}
        <AddSectionTile onAdd={addShelf} />
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
