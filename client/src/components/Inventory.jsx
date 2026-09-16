import { useEffect, useState } from "react";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { api } from "../api.js";

const LOCATIONS = [
  { id: "fridge", label: "Fridge" },
  { id: "pantry", label: "Pantry" },
  { id: "freezer", label: "Freezer" },
];

// Mirrors server/src/lib/foodkeeper.js's CATEGORIES exactly (the 13 labels
// that actually occur in the bundled USDA FoodKeeper data, plus "Other") -
// the order here is also the section order the list groups into.
const CATEGORIES = [
  "Produce",
  "Meat",
  "Poultry",
  "Seafood",
  "Dairy Products & Eggs",
  "Grains, Beans & Pasta",
  "Baked Goods",
  "Condiments, Sauces & Canned Goods",
  "Beverages",
  "Deli & Prepared Foods",
  "Food Purchased Frozen",
  "Shelf Stable Foods",
  "Vegetarian Proteins",
  "Other",
];

function daysUntil(dateStr) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return "No date set";
  const days = daysUntil(expiresAt);
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days}d`;
}

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

function InventoryRow({ item, checked, onToggleChecked, onUpdate, onDelete }) {
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

function CategorySection({ category, items, checkedIds, onToggleChecked, onUpdate, onDelete }) {
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Inventory({ items, onAdd, onUpdate, onDelete, onDeleteMany }) {
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  function toggleChecked(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          />
        ))
      )}
    </div>
  );
}
