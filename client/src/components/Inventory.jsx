import { useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { api } from "../api.js";
import { LOCATIONS, daysUntil } from "../lib/pantryInventory.js";
import { HintStrip } from "./RisoControls.jsx";

// Fridge and Freezer sit side by side, Pantry after - see the design
// handoff. "Counter" is a fourth USDA location the bundled data supports
// but this app has no dedicated shelf for yet (deferred per the handoff's
// own note that it's optional).
const SHELF_LOCATIONS = [
  { id: "fridge", label: "Fridge" },
  { id: "freezer", label: "Freezer" },
  { id: "pantry", label: "Pantry" },
];

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
function AddInventoryItemForm({ onAdd, onDone, locations }) {
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
      <select value={unit} onChange={(e) => setUnit(e.target.value)}>
        <option value="">unit</option>
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <select value={location} onChange={(e) => setLocation(e.target.value)}>
        {LOCATIONS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
        {(locations || []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
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
function ReceiptScanPanel({ onAdd, onDone, locations }) {
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
                {LOCATIONS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
                {(locations || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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

function ItemCard({ item, active, selected, onSelect, onToggleSelect }) {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const urgent = isUrgent(item);
  const pct =
    item.expiresAt && item.shelfLifeDays
      ? Math.min(100, Math.max(6, (Math.max(days, 0) / item.shelfLifeDays) * 100))
      : null;

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
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`inv-card${active ? " active" : ""}${selected ? " selected" : ""}${
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
        <span className="inv-card-name">{item.name}</span>
        {urgent ? (
          <span className="inv-card-urgent-sticker">{urgentLabel(item)}</span>
        ) : (
          <span className="inv-card-expiry">{expiryChip(item)}</span>
        )}
      </div>
      {(item.quantity != null || item.unit) && (
        <div className="inv-card-qty">
          {item.quantity ?? ""} {item.unit || ""}
        </div>
      )}
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

function ShelfColumn({ location, items, activeItemId, selectedIds, onSelect, onToggleSelect, onDeleteLocation }) {
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

  // Pantry spans the full grid width with its own auto-fill sub-grid (it
  // tends to hold far more items than Fridge/Freezer) - see the design
  // handoff. Custom sections keep the plain single-column layout, same as
  // Fridge/Freezer, since the handoff never designed for an arbitrary
  // number of them.
  const wide = location.id === "pantry";

  return (
    <div ref={setNodeRef} className={`inv-shelf${wide ? " wide" : ""}${isOver ? " drop-active" : ""}`}>
      <div className="inv-shelf-header">
        <span>{location.label}</span>
        <span className="inv-shelf-count">{items.length}</span>
        {location.custom && (
          <button
            type="button"
            className="inv-shelf-remove"
            aria-label={`Remove the "${location.label}" section`}
            title={items.length > 0 ? "Items here move back to Pantry" : "Remove this section"}
            onClick={() => onDeleteLocation(location.id)}
          >
            ×
          </button>
        )}
        <span className="inv-shelf-note">Soonest first</span>
      </div>
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
              onToggleSelect={() => onToggleSelect(item.id)}
            />
          ))}
        </div>
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

function EditPanel({ item, recipes, onUpdate, onDelete, onFindRecipes, isStaple, onToggleStaple }) {
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
        <h3>{item.name}</h3>
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
            {item.unit ? ` ${item.unit}` : ""}
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
                <span>{l.label}</span>
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
  onAddLocation,
  onDeleteLocation,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeItemId, setActiveItemId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showScan, setShowScan] = useState(false);
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

  // Built-in shelves (Fridge/Freezer/Pantry, USDA-backed) followed by the
  // user's own custom sections, in creation order.
  const shelfLocations = [
    ...SHELF_LOCATIONS,
    ...(locations || []).map((l) => ({ id: l.id, label: l.name, custom: true })),
  ];

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

      <div className="inv-shelves">
        {shelfLocations.map((loc) => (
          <ShelfColumn
            key={loc.id}
            location={loc}
            items={items.filter((i) => i.location === loc.id)}
            activeItemId={activeItemId}
            selectedIds={selectedIds}
            onSelect={setActiveItemId}
            onToggleSelect={toggleSelect}
            onDeleteLocation={onDeleteLocation}
          />
        ))}
        <AddSectionTile onAdd={onAddLocation} />
      </div>

      {activeItem && (
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
          <AddInventoryItemForm onAdd={onAdd} locations={locations} />
        </Modal>
      )}
      {showScan && (
        <Modal title="Scan receipt" onClose={() => setShowScan(false)}>
          <ReceiptScanPanel onAdd={onAdd} onDone={() => setShowScan(false)} locations={locations} />
        </Modal>
      )}
    </div>
  );
}
