import { useEffect, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { MealCard } from "./MealCard.jsx";

// Same order/labels as the server's flyer-extraction category enum
// (server/src/routes/flyers.js CATEGORIES) — protein/produce first since
// those are what's actually worth planning a meal around.
const CATEGORY_ORDER = ["protein", "produce", "dairy", "bakery", "staple", "other"];
const CATEGORY_LABELS = {
  protein: "Protein",
  produce: "Produce",
  dairy: "Dairy",
  bakery: "Bakery",
  staple: "Staples",
  other: "Other",
};

// Same day/meal vocabulary as PlannerBoard's own picker (dayOfWeek 0=Monday
// per the schema, mealType id matches PlannerEntry.mealType).
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

// A quick way to place a matched recipe onto this week's planner without
// leaving the Flyers tab — click-to-reveal a day+meal picker rather than
// requiring a drag, since there's no planner board in view here to drag
// onto. Sits below the MealCard, not inside it (MealCard stays a plain
// reusable card with its own onClick to open the recipe).
function AddToPlannerButton({ recipe, onAdd }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(0);
  const [meal, setMeal] = useState("dinner");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd(recipe.id, day, meal);
      setAdded(true);
      setOpen(false);
    } finally {
      setAdding(false);
    }
  }

  if (added) {
    return <p className="flyer-added-note">✓ Added to {WEEKDAY_LABELS[day]}</p>;
  }

  if (!open) {
    return (
      <button type="button" className="btn subtle btn-sm flyer-add-btn" onClick={() => setOpen(true)}>
        + Add to planner
      </button>
    );
  }

  return (
    <div className="flyer-add-form">
      <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {WEEKDAY_LABELS.map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
      <select value={meal} onChange={(e) => setMeal(e.target.value)}>
        {MEAL_TYPES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn primary btn-sm" onClick={handleAdd} disabled={adding}>
        {adding ? "…" : "Add"}
      </button>
    </div>
  );
}

function UploadFlyerForm({ onUploaded }) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleUpload(e) {
    e.preventDefault();
    if (!store.trim() || !file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFlyer(store.trim(), file);
      setStore("");
      setFile(null);
      setOpen(false);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn subtle" onClick={() => setOpen(true)}>
        Upload flyer
      </button>
    );
  }

  return (
    <form className="flyer-upload-form" onSubmit={handleUpload}>
      <label className="form-label">
        Store
        <input
          type="text"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="e.g. Metro"
          required
        />
      </label>
      <label className="form-label">
        Flyer PDF
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </label>
      <button type="submit" className="btn primary" disabled={uploading}>
        {uploading ? "Reading flyer…" : "Extract deals"}
      </button>
      <button type="button" className="btn subtle" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="flyer-upload-error">{error}</p>}
    </form>
  );
}

export function FlyerDeals({ recipes, onSelectRecipe, onAddToPlanner }) {
  const [deals, setDeals] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [openOther, setOpenOther] = useState(() => new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [clearing, setClearing] = useState(false);

  function toggleCategory(category) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function clearAllDeals() {
    if (!window.confirm("Clear all uploaded flyer deals? This can't be undone.")) return;
    setClearing(true);
    try {
      await api.clearFlyerDeals();
      setStoreFilter(null);
      setCategoryFilter(null);
      loadDeals();
    } finally {
      setClearing(false);
    }
  }

  function toggleOther(category) {
    setOpenOther((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(loadDeals, []);

  if (!deals) return <p className="empty-state">Loading this week's deals…</p>;

  const visibleDeals = storeFilter
    ? deals.deals.filter((d) => d.store === storeFilter)
    : deals.deals;
  const allGroups = groupDealsByIngredient(visibleDeals, recipes);
  const cookableCount = allGroups.filter((g) => g.recipeCount > 0).length;

  const presentCategories = CATEGORY_ORDER.filter((c) => allGroups.some((g) => g.category === c));
  const visibleGroups = categoryFilter ? allGroups.filter((g) => g.category === categoryFilter) : allGroups;
  // Bucketed by category (in CATEGORY_ORDER) for section display; each
  // bucket keeps groupDealsByIngredient's existing relevance sort within it.
  const sections = CATEGORY_ORDER.map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    groups: visibleGroups.filter((g) => g.category === c),
  })).filter((s) => s.groups.length > 0);

  return (
    <div className="flyer-page">
      <div className="flyer-header">
        <div>
          <h2 className="flyer-heading">Cook what's on sale</h2>
          <p className="flyer-sub">
            {deals.isMockData
              ? "Showing sample data — upload a store's flyer PDF to pull in real deals."
              : `${allGroups.length} ingredient${allGroups.length === 1 ? "" : "s"} on sale — ` +
                `${cookableCount} match recipes in your cookbook.`}
          </p>
        </div>
        <div className="flyer-header-actions">
          {!deals.isMockData && (
            <button type="button" className="btn subtle" onClick={clearAllDeals} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear all deals"}
            </button>
          )}
          <UploadFlyerForm onUploaded={loadDeals} />
        </div>
      </div>

      {deals.stores.length > 1 && (
        <div className="flyer-store-filter">
          <button
            type="button"
            className={`tag-chip${storeFilter === null ? " active" : ""}`}
            onClick={() => setStoreFilter(null)}
          >
            All stores
          </button>
          {deals.stores.map((s) => (
            <button
              key={s}
              type="button"
              className={`tag-chip${storeFilter === s ? " active" : ""}`}
              onClick={() => setStoreFilter((prev) => (prev === s ? null : s))}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {presentCategories.length > 1 && (
        <div className="cat-tabs">
          <button
            type="button"
            className={`cat-tab${categoryFilter === null ? " active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </button>
          {presentCategories.map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-tab${categoryFilter === c ? " active" : ""}`}
              onClick={() => setCategoryFilter((prev) => (prev === c ? null : c))}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {allGroups.length === 0 ? (
        <p className="empty-state">
          No deals yet — upload a store's flyer to get started.
        </p>
      ) : (
        <div className="flyer-matches">
          {sections.map((section) => {
            const cookable = section.groups.filter((g) => g.recipeCount > 0);
            const rest = section.groups.filter((g) => g.recipeCount === 0);
            const isOpen = openOther.has(section.category);
            const isCollapsed = categoryFilter === null && collapsedCategories.has(section.category);
            return (
              <div key={section.category}>
                {categoryFilter === null && (
                  <button
                    type="button"
                    className="cat-eyebrow"
                    onClick={() => toggleCategory(section.category)}
                  >
                    {isCollapsed ? "▸" : "▾"} {section.label}
                  </button>
                )}
                {!isCollapsed && (
                  <>
                    {cookable.map((group, i) => (
                      <section
                        key={group.core}
                        className="flyer-match"
                        style={i > 0 ? { marginTop: 12 } : undefined}
                      >
                        <div className="flyer-match-header">
                          <h3 className="flyer-match-title">{group.label}</h3>
                          <div className="flyer-match-prices">
                            {group.deals.map((d) => (
                              <span key={d.id} className="price-pill">
                                <span className="item">{d.item}</span>
                                <span className="meta">
                                  {d.price} · {d.store}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="flyer-match-count">
                          {group.recipeCount} recipe{group.recipeCount === 1 ? "" : "s"} use
                          {group.recipeCount === 1 ? "s" : ""} this
                        </p>
                        <div className="flyer-match-recipes">
                          {group.recipes.map((r) => (
                            <div key={r.id} className="flyer-recipe-cell">
                              <MealCard recipe={r} compact onClick={() => onSelectRecipe(r)} />
                              <AddToPlannerButton recipe={r} onAdd={onAddToPlanner} />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    {rest.length > 0 && (
                      <div className="flyer-rest" style={cookable.length > 0 ? { marginTop: 12 } : undefined}>
                        <button
                          type="button"
                          className="recipe-section-toggle"
                          onClick={() => toggleOther(section.category)}
                        >
                          {isOpen ? "▾" : "▸"} {rest.length} more ingredient{rest.length === 1 ? "" : "s"} in{" "}
                          {section.label} — nothing in your cookbook uses these
                        </button>
                        {isOpen && (
                          <div className="flyer-rest-prices">
                            {rest.flatMap((g) => g.deals).map((d) => (
                              <span key={d.id} className="price-pill">
                                <span className="item">{d.item}</span>
                                <span className="meta">
                                  {d.price} · {d.store}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
