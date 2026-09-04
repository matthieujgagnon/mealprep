import { useEffect, useState } from "react";
import { findRecipesByIngredients, findAtRiskPerishables } from "../lib/similarRecipes.js";
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

export function WhatCanIMake({ recipes, plannerEntries, onSelectRecipe }) {
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

  const allAtRisk = findAtRiskPerishables(plannerEntries, recipes);
  const atRisk = allAtRisk.filter(
    (name) => !have.some((h) => h.toLowerCase() === name.toLowerCase())
  );

  // Ingredients currently in "have" that came from the expiring-soon list
  // (as opposed to typed in by hand). Picking 2+ of these is a specific
  // ask — "what uses both of these up together" — so once there are 2+,
  // narrow results down to recipes containing all of them, rather than the
  // usual closest-match ranking used for the rest of the "have" list.
  const selectedAtRisk = have.filter((h) =>
    allAtRisk.some((name) => name.toLowerCase() === h.toLowerCase())
  );

  let results = have.length > 0 ? findRecipesByIngredients(have, recipes) : [];
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

      {selectedAtRisk.length >= 2 && (
        <p className="makeable-and-hint">
          Showing recipes that use all of: {selectedAtRisk.join(", ")}
        </p>
      )}

      {have.length === 0 ? (
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
