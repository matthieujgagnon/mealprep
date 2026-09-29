import { useEffect, useState } from "react";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe } from "../lib/similarRecipes.js";
import { findMatchingDeal } from "../lib/groceryList.js";
import { ManualRecipeForm } from "./ManualRecipeForm.jsx";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { HintStrip } from "./RisoControls.jsx";

const FILTERS = ["All", "Makeable now", "Uses expiring", "On sale", "Breakfast", "Lunch", "Supper"];
const SORT_LABELS = ["Recently added", "Fewest missing", "Quickest"];


// Matches on title, tags, and ingredient names — same fields App.jsx's own
// planner-grid search checks, kept as a separate copy since this one never
// needs to run against a URL (the search box doubles as the import field).
function matchesSearch(recipe, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (recipe.title?.toLowerCase().includes(q)) return true;
  if (recipe.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  if (recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))) return true;
  return false;
}

function isUrlLike(text) {
  const q = text.trim();
  return /^https?:\/\//i.test(q) || /\.\w{2,}\//.test(q);
}

function formatTime(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} H${m ? ` ${m} MIN` : ""}`;
  }
  return `${minutes} MIN`;
}


function RecipeCard({ recipe, stats, badge, onClick }) {
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const nothingToBuy = stats.totalCount > 0 && stats.missingCount === 0;
  const pct = stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;

  return (
    <button
      type="button"
      className="riso-recipe-card"
      style={{ boxShadow: nothingToBuy ? "var(--riso-shadow-ready)" : "none" }}
      onClick={() => onClick(recipe)}
    >
      <div className="riso-recipe-card-photo">
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" /> : null}
        {badge && (
          <span className="riso-sticker riso-recipe-card-badge" style={{ background: badge.bg, top: 12, left: 12, transform: "rotate(-4deg)" }}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="riso-recipe-card-body">
        <div className="riso-recipe-card-name">{recipe.title}</div>
        <div className="riso-recipe-card-meta">
          {totalTime > 0 ? `${formatTime(totalTime)} · ` : ""}
          {stats.totalCount} INGREDIENT{stats.totalCount === 1 ? "" : "S"}
        </div>
        <div className="riso-recipe-card-spacer" />
        {stats.totalCount > 0 && (
          <div className="riso-recipe-card-havebar">
            <div className="riso-recipe-card-havebar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="riso-recipe-card-havelabel" style={{ color: nothingToBuy ? "var(--riso-green-text)" : "var(--riso-soft)" }}>
          {nothingToBuy
            ? "nothing to buy!"
            : stats.totalCount > 0
              ? `${stats.missingCount} to buy · ${stats.matchedCount} of ${stats.totalCount} on hand`
              : "no ingredients listed"}
        </div>
      </div>
    </button>
  );
}

export function Recipes({
  user,
  recipes,
  pantryInventory,
  customStaples,
  plannerEntries,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onSelectRecipe,
  onImported,
  onManualCreated,
}) {
  const [sortIndex, setSortIndex] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [deals, setDeals] = useState([]);

  useEffect(() => {
    api.getRealDeals().then(setDeals).catch(() => setDeals([]));
  }, []);

  const allRecipes = recipes.filter((r) => !r.isPlaceholder);
  const query = search.trim();
  const isUrl = isUrlLike(query);

  const haveNames = buildCombinedHave(pantryInventory, customStaples);
  const haveCores = new Set(haveNames.map((n) => core(n)).filter(Boolean));

  function matchesFilter(recipe, filterId) {
    switch (filterId) {
      case "All":
        return true;
      case "Makeable now": {
        const stats = recipeHaveStats(recipe, haveCores);
        return stats.totalCount > 0 && stats.missingCount === 0;
      }
      case "Uses expiring":
        return findExpiringSoonInRecipe(recipe, pantryInventory, plannerEntries, allRecipes, 3).size > 0;
      case "On sale":
        return recipe.ingredients?.some((i) => findMatchingDeal(i.name, deals)) || false;
      case "Breakfast":
      case "Lunch":
      case "Supper":
        return recipe.tags?.some((t) => t.toLowerCase() === filterId.toLowerCase()) || false;
      default:
        return true;
    }
  }

  const filterCounts = Object.fromEntries(
    FILTERS.map((f) => [f, allRecipes.filter((r) => matchesFilter(r, f)).length])
  );

  let visible = allRecipes.filter((r) => matchesFilter(r, filter));
  if (query && !isUrl) visible = visible.filter((r) => matchesSearch(r, query));

  if (sortIndex === 1) {
    // Fewest to buy first; recipes without any ingredient list can't be
    // judged, so they go last. Ties: more of it on hand, then by name.
    const stats = new Map(visible.map((r) => [r.id, recipeHaveStats(r, haveCores)]));
    visible = [...visible].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if ((sa.totalCount === 0) !== (sb.totalCount === 0)) return sa.totalCount === 0 ? 1 : -1;
      if (sa.missingCount !== sb.missingCount) return sa.missingCount - sb.missingCount;
      const fa = sa.totalCount ? sa.matchedCount / sa.totalCount : 0;
      const fb = sb.totalCount ? sb.matchedCount / sb.totalCount : 0;
      if (fa !== fb) return fb - fa;
      return a.title.localeCompare(b.title);
    });
  } else if (sortIndex === 2) {
    visible = [...visible].sort(
      (a, b) => (a.prepTimeMinutes || 0) + (a.cookTimeMinutes || 0) - ((b.prepTimeMinutes || 0) + (b.cookTimeMinutes || 0))
    );
  } else {
    visible = [...visible].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const makeableCount = filterCounts["Makeable now"];
  const expiringCount = filterCounts["Uses expiring"];

  async function handleImportSubmit(e) {
    e.preventDefault();
    if (!isUrl || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const recipe = await api.importRecipe(query);
      onImported(recipe);
      onSearchChange("");
    } catch (err) {
      setImportError(err);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="riso-theme riso-recipes" data-theme="light">
      <div className="riso-recipes-heading">
        <div className="riso-eyebrow">
          {allRecipes.length} RECIPES · {makeableCount} MAKEABLE NOW · {expiringCount} USE EXPIRING ITEMS
        </div>
        <h1 className="riso-recipes-title">
          Your <span className="accent">recipes.</span>
        </h1>
      </div>

      <form className="riso-recipes-searchbar" onSubmit={handleImportSubmit}>
        <div className="riso-recipes-searchbar-label" style={{ background: isUrl ? "var(--riso-yellow)" : "var(--riso-canvas)" }}>
          {isUrl ? "IMPORT" : "SEARCH"}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name, tag or ingredient, or paste a recipe link to import it"
        />
        {isUrl ? (
          <button type="submit" className="riso-recipes-searchbar-btn primary" disabled={importing}>
            {importing ? "Importing…" : "Import recipe"}
          </button>
        ) : (
          <button
            type="button"
            className="riso-recipes-searchbar-btn"
            onClick={() => setShowManualForm((s) => !s)}
          >
            + New recipe
          </button>
        )}
      </form>
      {importError && (
        <p className="import-error">
          {importError.message}
          {importError.needsManualEntry &&
            (importError.message?.startsWith("Failed to fetch")
              ? " — this site is blocking automated requests, so it can't be auto-imported. You can add it manually instead."
              : " — this site doesn't expose structured recipe data, so it can't be auto-imported. You can add it manually instead.")}
        </p>
      )}

      {showManualForm && (
        <ManualRecipeForm
          onCreated={(recipe) => {
            onManualCreated(recipe);
            setShowManualForm(false);
          }}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      <HintStrip userId={user.id} screenKey="recipes">
        Type to search your recipes, or paste a link from any recipe site to import it. The bar on each
        card shows how many ingredients are already in your Inventory. Cards with a shadow need nothing
        from the store.
      </HintStrip>

      <div className="riso-recipes-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`riso-filter-chip${filter === f ? " active" : ""}`}
            onClick={() => onFilterChange(f)}
          >
            {f}
            <span className="riso-filter-chip-count">{filterCounts[f]}</span>
          </button>
        ))}
        <div className="riso-recipes-filters-spacer" />
        <span className="riso-recipes-sort-label">SORT</span>
        <label className="riso-recipes-sort-btn">
          <select aria-label="Sort recipes" value={sortIndex} onChange={(e) => setSortIndex(Number(e.target.value))}>
            {SORT_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
          <span aria-hidden="true">▾</span>
        </label>
      </div>

      <div className="riso-recipes-grid">
        {visible.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            stats={recipeHaveStats(r, haveCores)}
            badge={
              findExpiringSoonInRecipe(r, pantryInventory, plannerEntries, allRecipes, 3).size > 0
                ? { text: "uses expiring!", bg: "var(--riso-hot)" }
                : r.ingredients?.some((i) => findMatchingDeal(i.name, deals))
                  ? { text: "on sale!", bg: "var(--riso-green)" }
                  : null
            }
            onClick={onSelectRecipe}
          />
        ))}
      </div>
      {visible.length === 0 && !isUrl && (
        <p className="riso-recipes-empty">
          {allRecipes.length === 0
            ? "No recipes yet. Paste a link above to import one, or add one by hand."
            : "No recipes match. Paste a link above to import one."}
        </p>
      )}
    </div>
  );
}
