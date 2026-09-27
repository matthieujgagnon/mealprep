import { useEffect, useState } from "react";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { api } from "../api.js";
import { CATEGORIES, LOCATIONS, daysUntil, formatExpiry } from "../lib/pantryInventory.js";

// The add form fetches a suggested expiration date and category from the
// bundled USDA FoodKeeper data as soon as there's enough to look up (a name
// and a location) - both always shown as editable, never locked in, since
// the suggestion is a starting point, not an authority.
function AddInventoryItemForm({ onAdd }) {
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
      </select>
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setCategoryTouched(true);
        }}
        title="Category"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
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
function ImportReceiptForm({ onAdd }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn subtle" onClick={() => setOpen(true)}>
        Import from receipt
      </button>
    );
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
              </select>
            </li>
          ))}
        </ul>
        {error && <p className="flyer-upload-error">{error}</p>}
        <div className="receipt-review-actions">
          <button type="button" className="btn primary" onClick={handleAddSelected} disabled={saving || selectedCount === 0}>
            {saving ? "Adding…" : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"} to inventory`}
          </button>
          <button
            type="button"
            className="btn subtle"
            onClick={() => {
              setPending(null);
              setOpen(false);
            }}
          >
            Cancel
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
      <button type="button" className="btn subtle" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

function InventoryRow({ item, checked, onToggleChecked, onUpdate, onDelete, isStaple, onToggleStaple }) {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const statusClass = days !== null && days < 0 ? " expired" : days !== null && days <= 2 ? " expiring" : "";

  return (
    <li className={`pantry-item${statusClass}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggleChecked(item.id)}
        aria-label={`Select ${item.name}`}
      />
      <span className="pantry-item-main">
        <span className="pantry-item-name">
          {item.name}
          {item.quantity != null && (
            <span className="grocery-item-qty" style={{ marginLeft: 8 }}>
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
        </span>
        <span className="pantry-item-meta">
          {LOCATIONS.find((l) => l.id === item.location)?.label || item.location}
        </span>
      </span>
      <select
        className="pantry-item-category"
        value={CATEGORIES.includes(item.category) ? item.category : "Other"}
        onChange={(e) => onUpdate(item.id, { category: e.target.value })}
        title="Category"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="date"
        className="pantry-item-date"
        value={item.expiresAt ? item.expiresAt.slice(0, 10) : ""}
        onChange={(e) => onUpdate(item.id, { expiresAt: e.target.value || null })}
      />
      <span className={`deal-flag${statusClass === " expired" ? " sale" : ""}`}>{formatExpiry(item.expiresAt)}</span>
      <button
        type="button"
        className={`pantry-item-staple-toggle${isStaple ? " active" : ""}`}
        aria-label={isStaple ? `Unmark ${item.name} as a pantry staple` : `Mark ${item.name} as a pantry staple`}
        title={
          isStaple
            ? "This is a pantry staple — always counted as \"have\", never on the shopping list"
            : "Mark as a pantry staple — always counted as \"have\", never on the shopping list"
        }
        onClick={() => onToggleStaple(item)}
      >
        {isStaple ? "★" : "☆"}
      </button>
      <button
        type="button"
        className="staple-remove-btn"
        aria-label={`Remove ${item.name} from inventory`}
        title="Remove from inventory"
        onClick={() => onDelete(item.id)}
      >
        ×
      </button>
    </li>
  );
}

function CategorySection({ category, items, checkedIds, onToggleChecked, onUpdate, onDelete, staples, onToggleStaple }) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...items].sort((a, b) => {
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return new Date(a.expiresAt) - new Date(b.expiresAt);
  });

  return (
    <div className="pantry-inventory-section">
      <button type="button" className="staples-toggle" onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? "▸" : "▾"} {category} ({items.length})
      </button>
      {!collapsed && (
        <ul className="pantry-list">
          {sorted.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              checked={checkedIds.has(item.id)}
              onToggleChecked={onToggleChecked}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isStaple={staples.has(item.core)}
              onToggleStaple={onToggleStaple}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Inventory({
  items,
  onAdd,
  onUpdate,
  onDelete,
  onDeleteMany,
  customStaples,
  onMarkStaple,
  onUnmarkStaple,
}) {
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const staples = new Set(customStaples || []);

  function toggleChecked(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A deliberate, per-item call - not inferred from category or location,
  // since what actually counts as "always have it, never shop for it" is a
  // judgment only the person stocking the pantry can make.
  function toggleStaple(item) {
    if (staples.has(item.core)) onUnmarkStaple(item.core);
    else onMarkStaple(item.core);
  }

  async function handleRemoveSelected() {
    if (checkedIds.size === 0) return;
    await onDeleteMany([...checkedIds]);
    setCheckedIds(new Set());
  }

  const grouped = CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => (CATEGORIES.includes(item.category) ? item.category : "Other") === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="makeable-page">
      <p className="makeable-intro">
        Everything actually in your fridge, pantry, and freezer right now — with
        real, USDA-backed expiration suggestions.
      </p>

      <AddInventoryItemForm onAdd={onAdd} />
      <ImportReceiptForm onAdd={onAdd} />

      {checkedIds.size > 0 && (
        <div className="inventory-bulk-bar">
          <span>{checkedIds.size} selected</span>
          <button type="button" className="btn danger btn-sm" onClick={handleRemoveSelected}>
            Remove selected
          </button>
          <button type="button" className="btn subtle btn-sm" onClick={() => setCheckedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-state">
          Nothing tracked yet — add what's in your fridge, pantry, or freezer above.
        </p>
      ) : (
        grouped.map((g) => (
          <CategorySection
            key={g.category}
            category={g.category}
            items={g.items}
            checkedIds={checkedIds}
            onToggleChecked={toggleChecked}
            onUpdate={onUpdate}
            onDelete={onDelete}
            staples={staples}
            onToggleStaple={toggleStaple}
          />
        ))
      )}
    </div>
  );
}
