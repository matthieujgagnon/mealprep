import { useEffect, useState } from "react";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe } from "../lib/similarRecipes.js";
import { findMatchingDeal } from "../lib/groceryList.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { HintStrip } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { RECIPE_SLOTS, formatRecipeTime, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";

const SLOT_FILTERS = Object.fromEntries(RECIPE_SLOTS.map((s) => [s.label, s.id]));
const FILTERS = ["All", "Makeable now", "Uses expiring", "On sale", ...RECIPE_SLOTS.map((s) => s.label)];
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

// Photo on top (nothing printed over it), then the title and a column of
// chips: total time (yellow, dashed "add time" when unset), then pink
// "uses expiring" and green "on sale" - a recipe can carry both.
function RecipeCard({ recipe, stats, usesExpiring, onSale, onClick }) {
  const totalTime = recipeTotalMinutes(recipe);
  const nothingToBuy = stats.totalCount > 0 && stats.missingCount === 0;
  const pct = stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;

  return (
    <button
      type="button"
      className={`riso-recipe-card${nothingToBuy ? " ready" : ""}`}
      onClick={() => onClick(recipe)}
    >
      <div className="riso-recipe-card-photo">
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}
      </div>
      <div className="riso-recipe-card-body">
        <div className="riso-recipe-card-name">{recipe.title}</div>
        <div className="riso-recipe-card-chips">
          <span className={`riso-recipe-chip time${totalTime > 0 ? "" : " unset"}`}>
            <span className="riso-recipe-chip-clock" aria-hidden="true">⏱</span>
            {totalTime > 0 ? formatRecipeTime(totalTime) : "add time"}
          </span>
          {usesExpiring && <span className="riso-recipe-chip expiring">uses expiring ingredients</span>}
          {onSale && <span className="riso-recipe-chip sale">on sale</span>}
        </div>
        <div className="riso-recipe-card-spacer" />
        {stats.totalCount > 0 && (
          <div className="riso-recipe-card-havebar">
            <div className="riso-recipe-card-havebar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className={`riso-recipe-card-havelabel${nothingToBuy ? " ready" : ""}`}>
          {nothingToBuy
            ? `all ${stats.totalCount} on hand · nothing to buy!`
            : stats.totalCount > 0
              ? `${stats.matchedCount} of ${stats.totalCount} on hand · ${stats.missingCount} to buy`
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
  onNewRecipe,
}) {
  const [sortIndex, setSortIndex] = useState(0);
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
      default:
        return filterId in SLOT_FILTERS ? recipeSlot(recipe) === SLOT_FILTERS[filterId] : true;
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
    // Quickest first; recipes with no time set can't be ranked, so they go last.
    const minutes = (r) => recipeTotalMinutes(r) || Infinity;
    visible = [...visible].sort((a, b) => minutes(a) - minutes(b) || a.title.localeCompare(b.title));
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
          <button type="button" className="riso-recipes-searchbar-btn" onClick={onNewRecipe}>
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

      <HintStrip userId={user.id} screenKey="recipes-v2">
        Type to search your recipes, or paste a link from any recipe site to import it. The yellow chip is
        total prep and cook time; pink and green chips flag expiring and on-sale ingredients. The bar shows
        how many ingredients are already in your Inventory. Cards with a shadow need nothing from the store.
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
        <div className="riso-recipes-sort-group">
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
      </div>

      <div className="riso-recipes-grid">
        {visible.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            stats={recipeHaveStats(r, haveCores)}
            usesExpiring={matchesFilter(r, "Uses expiring")}
            onSale={matchesFilter(r, "On sale")}
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
