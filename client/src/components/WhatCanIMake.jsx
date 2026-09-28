import { useState } from "react";
import { findRecipesByIngredients, findAtRiskPerishables } from "../lib/similarRecipes.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { api } from "../api.js";

// Vapor theme preference, shared across every screen as it migrates - see
// index.css's .vp-theme token block. Default light per the design handoff.
const THEME_STORAGE_KEY = "mealprep-vp-theme";
const ALSO_HAVE_STORAGE_KEY = "mealprep-makeable-also-have";
const HINT_DISMISSED_KEY = "mealprep-makeable-hint-dismissed";

function loadStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function loadAlsoHave() {
  try {
    const raw = localStorage.getItem(ALSO_HAVE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadHintDismissed() {
  try {
    return localStorage.getItem(HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner"];

// The first day+mealType this week with nothing planned yet - same order
// PlannerBoard's own grid walks (Mon breakfast, Mon lunch, Mon dinner, Tue
// breakfast, ...). Falls back to Monday breakfast if the whole week is
// already full, which just stacks a second card into that slot - the
// planner already supports more than one entry per cell.
function findNextEmptySlot(plannerEntries) {
  const filled = new Set(plannerEntries.map((e) => `${e.dayOfWeek}-${e.mealType}`));
  for (let day = 0; day < 7; day++) {
    for (const mealType of MEAL_TYPES) {
      if (!filled.has(`${day}-${mealType}`)) return { dayOfWeek: day, mealType };
    }
  }
  return { dayOfWeek: 0, mealType: "breakfast" };
}

function Toggle({ checked, onChange, label, meta }) {
  return (
    <label className="vp-toggle-row">
      <span
        className={`vp-toggle${checked ? " on" : ""}`}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        <span className="vp-toggle-knob" />
      </span>
      <span className="vp-toggle-label">
        {label}
        {meta != null && <span className="vp-toggle-meta">{meta}</span>}
      </span>
    </label>
  );
}

function MakeableCard({ recipe, matchedIngredients, missingIngredients, atRiskUsed, onOpen, onCookTonight, onPlan, onAddMissing }) {
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const ingredientCount = recipe.ingredients?.length || 0;
  const ready = missingIngredients.length === 0;

  return (
    <div className="vp-card">
      <button type="button" className="vp-card-thumb-btn" onClick={onOpen} title={recipe.title}>
        {recipe.photoUrl ? (
          <img className="vp-card-thumb" src={recipe.photoUrl} alt="" />
        ) : (
          <div className="vp-card-thumb vp-card-thumb-placeholder" />
        )}
      </button>
      <div className="vp-card-body">
        <button type="button" className="vp-card-title" onClick={onOpen}>
          {recipe.title}
        </button>
        <p className="vp-card-meta">
          {totalTime > 0 && `${totalTime} MIN · `}
          {ingredientCount} INGREDIENT{ingredientCount === 1 ? "" : "S"}
        </p>
        {atRiskUsed.length > 0 && (
          <p className="vp-card-uses">Uses {atRiskUsed.join(", ")}</p>
        )}
        {!ready && (
          <div className="vp-card-need">
            <span className="vp-card-need-label">NEED</span> · {missingIngredients.join(", ")}
          </div>
        )}
        <div className="vp-card-actions">
          {ready ? (
            <button type="button" className="vp-btn-card vp-btn-card-primary" onClick={onCookTonight}>
              Cook tonight
            </button>
          ) : (
            <button type="button" className="vp-btn-card vp-btn-card-secondary" onClick={onAddMissing}>
              + Add {missingIngredients.length} to list
            </button>
          )}
          <button type="button" className="vp-btn-card vp-btn-card-secondary" onClick={onPlan}>
            Plan
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatCanIMake({
  recipes,
  plannerEntries,
  onSelectRecipe,
  pantryInventory,
  customStaples,
  weekStart,
  onAddToPlanner,
}) {
  const [theme, setTheme] = useState(loadStoredTheme);
  const [useInventory, setUseInventory] = useState(true);
  const [expiringFirst, setExpiringFirst] = useState(true);
  const [alsoHave, setAlsoHave] = useState(loadAlsoHave);
  const [input, setInput] = useState("");
  const [hintDismissed, setHintDismissed] = useState(loadHintDismissed);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // best-effort
      }
      return next;
    });
  }

  function persistAlsoHave(next) {
    setAlsoHave(next);
    try {
      localStorage.setItem(ALSO_HAVE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort
    }
  }

  function addAlsoHave(raw) {
    const name = raw.trim();
    if (!name) return;
    if (alsoHave.some((h) => h.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    persistAlsoHave([...alsoHave, name]);
    setInput("");
  }

  function removeAlsoHave(name) {
    persistAlsoHave(alsoHave.filter((h) => h !== name));
  }

  function dismissHint() {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_DISMISSED_KEY, "1");
    } catch {
      // best-effort
    }
  }

  const nonExpiredInventoryNames = pantryInventory
    .filter((item) => !(item.expiresAt && daysUntil(item.expiresAt) < 0))
    .map((item) => item.name);

  const alsoHaveLower = new Set(alsoHave.map((h) => h.toLowerCase()));
  const inventoryExtra = useInventory
    ? nonExpiredInventoryNames.filter((n) => !alsoHaveLower.has(n.toLowerCase()))
    : [];
  const afterInventoryLower = new Set([...alsoHaveLower, ...inventoryExtra.map((n) => n.toLowerCase())]);
  const stapleExtra = (customStaples || []).filter((s) => !afterInventoryLower.has(s.toLowerCase()));
  const combinedHave = [...alsoHave, ...inventoryExtra, ...stapleExtra];

  const atRiskNames = findAtRiskPerishables(plannerEntries, recipes);
  const atRiskLower = new Set(atRiskNames.map((n) => n.toLowerCase()));

  const matches = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes) : [];
  const withAtRisk = matches.map((m) => ({
    ...m,
    atRiskUsed: m.matchedIngredients.filter((n) => atRiskLower.has(n.toLowerCase())),
  }));

  function sortGroup(items) {
    if (!expiringFirst) return items;
    return [...items].sort((a, b) => {
      const aHas = a.atRiskUsed.length > 0 ? 0 : 1;
      const bHas = b.atRiskUsed.length > 0 ? 0 : 1;
      return aHas - bHas;
    });
  }

  const readyNow = sortGroup(withAtRisk.filter((m) => m.missingIngredients.length === 0));
  const oneOrTwoShort = sortGroup(
    withAtRisk.filter((m) => m.missingIngredients.length >= 1 && m.missingIngredients.length <= 2)
  );
  const needsAShop = sortGroup(withAtRisk.filter((m) => m.missingIngredients.length >= 3));

  async function handleAddMissing(missingIngredients) {
    if (!weekStart || missingIngredients.length === 0) return;
    for (const name of missingIngredients) {
      await api.addGroceryExtra(weekStart, { name, quantity: null, unit: null });
    }
  }

  function handlePlan(recipe) {
    const { dayOfWeek, mealType } = findNextEmptySlot(plannerEntries);
    onAddToPlanner?.(recipe.id, dayOfWeek, mealType);
  }

  const groups = [
    { key: "ready", title: "Ready now", note: "Nothing to buy", items: readyNow },
    { key: "short", title: "One or two short", note: "Quick top-up", items: oneOrTwoShort },
    { key: "shop", title: "Needs a shop", note: null, items: needsAShop },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="vp-theme vp-makeable" data-theme={theme}>
      <div className="vp-makeable-header">
        <div>
          <h1 className="vp-page-title">Makeable</h1>
          <p className="vp-page-subtitle">Ranked by how little you'd need to buy.</p>
        </div>
        <button type="button" className="vp-theme-toggle" onClick={toggleTheme}>
          <span className={theme === "light" ? "active" : ""}>Light</span>
          <span className={theme === "dark" ? "active" : ""}>Dark</span>
        </button>
      </div>

      {!hintDismissed && (
        <div className="vp-hint-strip">
          <span className="vp-hint-icon">i</span>
          <p className="vp-hint-text">
            Recipes are matched against what's in your Inventory. Add anything else you have on
            hand below. Use expiring items first moves recipes that use up food expiring soon to
            the top of each group.
          </p>
          <button type="button" className="vp-hint-dismiss" onClick={dismissHint}>
            Got it
          </button>
        </div>
      )}

      <div className="vp-control-card">
        <div className="vp-toggle-row-group">
          <Toggle
            checked={useInventory}
            onChange={setUseInventory}
            label="Use my inventory"
            meta={`${pantryInventory.length} item${pantryInventory.length === 1 ? "" : "s"}`}
          />
          <Toggle checked={expiringFirst} onChange={setExpiringFirst} label="Use expiring items first" />
        </div>

        <form
          className="vp-also-have"
          onSubmit={(e) => {
            e.preventDefault();
            addAlsoHave(input);
          }}
        >
          <span className="vp-also-have-label">ALSO HAVE</span>
          {alsoHave.map((name) => (
            <span key={name} className="vp-chip">
              {name}
              <button type="button" onClick={() => removeAlsoHave(name)} aria-label={`Remove ${name}`}>
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            className="vp-also-have-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add an ingredient that isn't in your inventory"
          />
        </form>
      </div>

      {combinedHave.length === 0 ? (
        <p className="vp-empty-state">Turn on Use my inventory, or add a few ingredients above, to see what you can make.</p>
      ) : groups.length === 0 ? (
        <p className="vp-empty-state">No recipes match yet — try adding a few more ingredients.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="vp-group">
            <div className="vp-group-header">
              <h2 className="vp-group-title">{group.title}</h2>
              <span className="vp-group-count">{group.items.length}</span>
              {group.note && <span className="vp-group-note">{group.note}</span>}
            </div>
            <div className="vp-grid">
              {group.items.map(({ recipe, matchedIngredients, missingIngredients, atRiskUsed }) => (
                <MakeableCard
                  key={recipe.id}
                  recipe={recipe}
                  matchedIngredients={matchedIngredients}
                  missingIngredients={missingIngredients}
                  atRiskUsed={atRiskUsed}
                  onOpen={() => onSelectRecipe(recipe)}
                  onCookTonight={() => onSelectRecipe(recipe, null, true)}
                  onPlan={() => handlePlan(recipe)}
                  onAddMissing={() => handleAddMissing(missingIngredients)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
