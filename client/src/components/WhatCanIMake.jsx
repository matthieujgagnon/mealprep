import { useEffect, useState } from "react";
import { findRecipesByIngredients, findAtRiskPerishables } from "../lib/similarRecipes.js";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { api } from "../api.js";
import { MealCard } from "./MealCard.jsx";

// Persisted the same way grocery checkmarks are — if you're standing at the
// fridge checking what you've got, a backgrounded phone tab shouldn't wipe
// the list you just built.
const STORAGE_KEY = "mealprep-have-ingredients";

function loadHaveFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const LOCATIONS = [
  { id: "fridge", label: "Fridge" },
  { id: "pantry", label: "Pantry" },
  { id: "freezer", label: "Freezer" },
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

// The add form fetches a suggested expiration from the bundled USDA
// FoodKeeper data as soon as there's enough to look up (a name and a
// location) - always shown as an editable date input, never locked in,
// since the suggestion is a starting point, not an authority.
function AddPantryItemForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("fridge");
  const [expiresAt, setExpiresAt] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);

  // Re-fetch the suggestion whenever the name or location settles, so
  // picking a different storage location (e.g. fridge -> freezer) updates
  // the date without the user having to retype anything.
  useEffect(() => {
    if (!name.trim()) return;
    let cancelled = false;
    setSuggesting(true);
    const timer = setTimeout(() => {
      api
        .suggestPantryExpiration(name.trim(), location)
        .then(({ expiresAt: suggested }) => {
          if (!cancelled && suggested) setExpiresAt(suggested.slice(0, 10));
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
  }, [name, location]);

  if (!open) {
    return (
      <button type="button" className="btn subtle btn-sm" onClick={() => setOpen(true)}>
        + Add to pantry
      </button>
    );
  }

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
        expiresAt: expiresAt || null,
      });
      setName("");
      setQuantity("");
      setUnit("");
      setExpiresAt("");
      setOpen(false);
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
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        title={suggesting ? "Looking up a suggested date…" : "Expiration date"}
      />
      <button className="btn primary btn-sm" type="submit" disabled={adding}>
        Add
      </button>
      <button type="button" className="btn subtle btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function PantryInventoryRow({ item, onUpdate, onDelete }) {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const statusClass = days !== null && days < 0 ? " expired" : days !== null && days <= 2 ? " expiring" : "";

  return (
    <li className={`pantry-item${statusClass}`}>
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
        aria-label={`Remove ${item.name} from pantry`}
        title="Remove from pantry"
        onClick={() => onDelete(item.id)}
      >
        ×
      </button>
    </li>
  );
}

function PantryInventorySection({ items, onAdd, onUpdate, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...items].sort((a, b) => {
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return new Date(a.expiresAt) - new Date(b.expiresAt);
  });

  return (
    <div className="pantry-inventory-section">
      <button type="button" className="staples-toggle" onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? "▸" : "▾"} Your pantry inventory ({items.length})
      </button>
      {!collapsed && (
        <>
          <AddPantryItemForm onAdd={onAdd} />
          {sorted.length === 0 ? (
            <p className="staples-empty-hint">
              Nothing tracked yet — add what's in your fridge, pantry, or freezer above.
            </p>
          ) : (
            <ul className="pantry-list">
              {sorted.map((item) => (
                <PantryInventoryRow key={item.id} item={item} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function WhatCanIMake({
  recipes,
  plannerEntries,
  onSelectRecipe,
  pantryInventory,
  onAddPantryItem,
  onUpdatePantryItem,
  onDeletePantryItem,
}) {
  const [have, setHave] = useState(loadHaveFromStorage);
  const [input, setInput] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(have));
    } catch {
      // best-effort — not worth surfacing an error over
    }
  }, [have]);

  function addIngredient(raw) {
    const name = raw.trim();
    if (!name) return;
    if (have.some((h) => h.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    setHave((prev) => [...prev, name]);
    setInput("");
  }

  function removeIngredient(name) {
    setHave((prev) => prev.filter((h) => h !== name));
  }

  // Anything in the real pantry inventory that isn't expired counts as
  // "have" for matching purposes too - additive to the typed quick-list
  // above, never replacing it, so a one-off "what if I also had X" check
  // still works exactly like it always has.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nonExpiredInventoryNames = pantryInventory
    .filter((item) => !item.expiresAt || new Date(item.expiresAt) >= today)
    .map((item) => item.name);
  const combinedHave = [
    ...have,
    ...nonExpiredInventoryNames.filter(
      (n) => !have.some((h) => h.toLowerCase() === n.toLowerCase())
    ),
  ];

  const allAtRisk = findAtRiskPerishables(plannerEntries, recipes);
  const atRisk = allAtRisk.filter(
    (name) => !combinedHave.some((h) => h.toLowerCase() === name.toLowerCase())
  );

  // Ingredients currently in "have" that came from the expiring-soon list
  // (as opposed to typed in by hand). Picking 2+ of these is a specific
  // ask — "what uses both of these up together" — so once there are 2+,
  // narrow results down to recipes containing all of them, rather than the
  // usual closest-match ranking used for the rest of the "have" list.
  const selectedAtRisk = have.filter((h) =>
    allAtRisk.some((name) => name.toLowerCase() === h.toLowerCase())
  );

  let results = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes) : [];
  if (selectedAtRisk.length >= 2) {
    results = results.filter((r) =>
      selectedAtRisk.every((name) =>
        r.matchedIngredients.some((m) => m.toLowerCase() === name.toLowerCase())
      )
    );
  }

  // Ingredient vocabulary for autocomplete — every ingredient name that's
  // ever shown up in the cookbook, so typing matches what the app actually
  // knows about.
  const vocabulary = [
    ...new Set(recipes.flatMap((r) => (r.ingredients || []).map((i) => i.name))),
  ].sort();

  return (
    <div className="makeable-page">
      <p className="makeable-intro">
        Add what you've got on hand — we'll show what you can already make,
        ranked by how close you are, with what's still missing.
      </p>

      <form
        className="makeable-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          addIngredient(input);
        }}
      >
        <input
          type="text"
          list="makeable-ingredient-vocabulary"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add an ingredient you have…"
        />
        <datalist id="makeable-ingredient-vocabulary">
          {vocabulary.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <button type="submit" className="btn primary btn-sm">
          + Add
        </button>
      </form>

      {atRisk.length > 0 && (
        <div className="makeable-at-risk">
          <span className="makeable-at-risk-label">Expiring soon this week:</span>
          {atRisk.map((name) => (
            <button
              key={name}
              type="button"
              className="tag-chip"
              onClick={() => addIngredient(name)}
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {have.length > 0 && (
        <div className="makeable-have-chips">
          {have.map((name) => (
            <span key={name} className="tag-chip editable">
              {name}
              <button type="button" onClick={() => removeIngredient(name)} aria-label={`Remove ${name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <PantryInventorySection
        items={pantryInventory}
        onAdd={onAddPantryItem}
        onUpdate={onUpdatePantryItem}
        onDelete={onDeletePantryItem}
      />

      {selectedAtRisk.length >= 2 && (
        <p className="makeable-and-hint">
          Showing recipes that use all of: {selectedAtRisk.join(", ")}
        </p>
      )}

      {combinedHave.length === 0 ? (
        <p className="empty-state">Add a few ingredients above to see what you can make.</p>
      ) : results.length === 0 ? (
        <p className="empty-state">
          {selectedAtRisk.length >= 2
            ? "No recipe uses all of those together — try removing one."
            : "No recipes match yet — try adding a few more ingredients."}
        </p>
      ) : (
        <div className="makeable-results">
          {results.map(({ recipe, missingIngredients }) => (
            <div key={recipe.id} className="makeable-result">
              <MealCard recipe={recipe} onClick={() => onSelectRecipe(recipe)} />
              {missingIngredients.length === 0 ? (
                <p className="makeable-ready">✓ You have everything for this</p>
              ) : (
                <p className="makeable-missing">
                  Missing {missingIngredients.length}: {missingIngredients.slice(0, 3).join(", ")}
                  {missingIngredients.length > 3 && ` +${missingIngredients.length - 3} more`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
