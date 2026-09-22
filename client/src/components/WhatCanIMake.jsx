import { useEffect, useState } from "react";
import { findRecipesByIngredients, findAtRiskPerishables } from "../lib/similarRecipes.js";
import { CATEGORIES, daysUntil, formatExpiry } from "../lib/pantryInventory.js";
import { MealCard } from "./MealCard.jsx";

// Persisted the same way grocery checkmarks are — if you're standing at the
// fridge checking what you've got, a backgrounded phone tab shouldn't wipe
// the list you just built.
const STORAGE_KEY = "mealprep-have-ingredients";
// Opt-out lists (not opt-in) so a newly-added inventory item or category is
// counted by default - only an explicit exclusion should be persisted.
const EXCLUDED_INVENTORY_KEY = "mealprep-excluded-inventory-ids";
const EXCLUDED_CATEGORIES_KEY = "mealprep-excluded-inventory-categories";

function loadHaveFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadSetFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function itemCategory(item) {
  return CATEGORIES.includes(item.category) ? item.category : "Other";
}

function MakeableInventoryRow({ item, counted, onToggle }) {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const expired = days !== null && days < 0;
  const statusClass = expired ? " expired" : days !== null && days <= 2 ? " expiring" : "";

  return (
    <li className={`pantry-item${statusClass}`}>
      <input
        type="checkbox"
        checked={counted}
        disabled={expired}
        onChange={() => onToggle(item.id)}
        aria-label={`Count ${item.name} toward what you can make`}
        title={expired ? "Expired — not counted" : "Count toward what you can make"}
      />
      <span className="pantry-item-main">
        <span className="pantry-item-name">{item.name}</span>
        <span className="pantry-item-meta">{itemCategory(item)}</span>
      </span>
      <span className={`deal-flag${statusClass === " expired" ? " sale" : ""}`}>{formatExpiry(item.expiresAt)}</span>
    </li>
  );
}

export function WhatCanIMake({
  recipes,
  plannerEntries,
  onSelectRecipe,
  pantryInventory,
  customStaples,
  onOpenInventory,
}) {
  const [have, setHave] = useState(loadHaveFromStorage);
  const [input, setInput] = useState("");
  const [excludedInventoryIds, setExcludedInventoryIds] = useState(() => loadSetFromStorage(EXCLUDED_INVENTORY_KEY));
  const [excludedCategories, setExcludedCategories] = useState(() => loadSetFromStorage(EXCLUDED_CATEGORIES_KEY));
  // Deliberately not persisted like the two exclusion sets above - this is a
  // momentary "what can I make from just what's about to go bad" lens, not
  // a standing preference, so it resets to showing everything on reload.
  const [expiringOnly, setExpiringOnly] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(have));
    } catch {
      // best-effort — not worth surfacing an error over
    }
  }, [have]);

  useEffect(() => {
    try {
      localStorage.setItem(EXCLUDED_INVENTORY_KEY, JSON.stringify([...excludedInventoryIds]));
    } catch {
      // best-effort
    }
  }, [excludedInventoryIds]);

  useEffect(() => {
    try {
      localStorage.setItem(EXCLUDED_CATEGORIES_KEY, JSON.stringify([...excludedCategories]));
    } catch {
      // best-effort
    }
  }, [excludedCategories]);

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

  function toggleInventoryItem(id) {
    setExcludedInventoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(category) {
    setExcludedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // Which categories actually show up in the inventory right now - no point
  // offering a "Beverages" filter chip when nothing in stock is a beverage.
  const presentCategories = CATEGORIES.filter((cat) => pantryInventory.some((item) => itemCategory(item) === cat));

  const visibleInventory = pantryInventory
    .filter((item) => !excludedCategories.has(itemCategory(item)))
    .filter((item) => {
      if (!expiringOnly) return true;
      if (!item.expiresAt) return false;
      return daysUntil(item.expiresAt) <= 2;
    })
    .sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt) - new Date(b.expiresAt);
    });

  const countedInventory = visibleInventory.filter((item) => {
    const expired = item.expiresAt && daysUntil(item.expiresAt) < 0;
    return !expired && !excludedInventoryIds.has(item.id);
  });

  // Everything that counts as "have" without being typed: filtered/selected
  // inventory, plus custom pantry staples (soy sauce, flour, whatever you've
  // marked as always-on-hand on the grocery list) - additive to the typed
  // quick-list above, never replacing it, so a one-off "what if I also had
  // X" check still works exactly like it always has.
  const haveLower = new Set(have.map((h) => h.toLowerCase()));
  const inventoryExtra = countedInventory
    .map((item) => item.name)
    .filter((n) => !haveLower.has(n.toLowerCase()));
  const afterInventoryLower = new Set([...haveLower, ...inventoryExtra.map((n) => n.toLowerCase())]);
  const stapleExtra = (customStaples || []).filter((s) => !afterInventoryLower.has(s.toLowerCase()));
  const combinedHave = [...have, ...inventoryExtra, ...stapleExtra];

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

      {pantryInventory.length > 0 && (
        <div className="pantry-inventory-section">
          <div className="makeable-inventory-header">
            <span>
              Your inventory — {countedInventory.length}/{pantryInventory.length} counted
            </span>
            <button type="button" className="makeable-inventory-manage" onClick={onOpenInventory}>
              Manage →
            </button>
          </div>

          {presentCategories.length > 1 && (
            <div className="makeable-inventory-filters">
              {presentCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tag-chip filter${excludedCategories.has(cat) ? " excluded" : ""}`}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <label className="makeable-expiring-toggle">
            <input
              type="checkbox"
              checked={expiringOnly}
              onChange={(e) => setExpiringOnly(e.target.checked)}
            />
            Only count what's expiring soon
          </label>

          {visibleInventory.length === 0 ? (
            <p className="staples-empty-hint">Nothing matches these filters.</p>
          ) : (
            <ul className="pantry-list">
              {visibleInventory.map((item) => (
                <MakeableInventoryRow
                  key={item.id}
                  item={item}
                  counted={countedInventory.includes(item)}
                  onToggle={toggleInventoryItem}
                />
              ))}
            </ul>
          )}
        </div>
      )}

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
