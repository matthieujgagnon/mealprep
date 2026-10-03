import { useState } from "react";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe } from "../lib/similarRecipes.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { HintStrip } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { RECIPE_SLOTS, formatRecipeTime, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { t } from "../i18n/index.js";

// Filter ids stay the same in both languages; labels follow the language.
const FILTERS = [
  ...["all", "makeable", "expiring"].map((id) => ({
    id,
    get label() {
      return t(`recipes.filters.${id}`);
    },
  })),
  ...RECIPE_SLOTS.map((slot) => ({
    id: `slot:${slot.id}`,
    slot: slot.id,
    get label() {
      return slot.label;
    },
  })),
];
const SORTS = ["recent", "fewest", "quickest"];


// Matches on title, tags, and ingredient names — same fields App.jsx's own
// planner-grid search checks, kept as a separate copy since this one never
// needs to run against a URL (the search box doubles as the import field).
// Commas mean "any of": "parsley, spinach" (Home's Cook with these) finds
// recipes using either.
function matchesSearch(recipe, query) {
  const terms = query
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;
  return terms.some(
    (q) =>
      recipe.title?.toLowerCase().includes(q) ||
      recipe.tags?.some((t) => t.toLowerCase().includes(q)) ||
      recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))
  );
}

function isUrlLike(text) {
  const q = text.trim();
  return /^https?:\/\//i.test(q) || /\.\w{2,}\//.test(q);
}

// Photo on top (nothing printed over it), then the title and a column of
// chips: total time (yellow, dashed "add time" when unset), then pink
// "uses expiring". Sales show on the ingredients inside the recipe card,
// not here: nearly every recipe has something on sale, so a chip on every
// card said nothing.
function RecipeCard({ recipe, stats, usesExpiring, onClick }) {
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
            {totalTime > 0 ? formatRecipeTime(totalTime) : t("recipes.addTime")}
          </span>
          {usesExpiring && <span className="riso-recipe-chip expiring">{t("recipes.usesExpiring")}</span>}
        </div>
        <div className="riso-recipe-card-spacer" />
        {stats.totalCount > 0 && (
          <div className="riso-recipe-card-havebar">
            <div className="riso-recipe-card-havebar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className={`riso-recipe-card-havelabel${nothingToBuy ? " ready" : ""}`}>
          {nothingToBuy
            ? t("recipes.allOnHand", { count: stats.totalCount })
            : stats.totalCount > 0
              ? t("recipes.someOnHand", { have: stats.matchedCount, total: stats.totalCount, buy: stats.missingCount })
              : t("recipes.noIngredients")}
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

  const allRecipes = recipes.filter((r) => !r.isPlaceholder);
  const query = search.trim();
  const isUrl = isUrlLike(query);

  const haveNames = buildCombinedHave(pantryInventory, customStaples);
  const haveCores = new Set(haveNames.map((n) => core(n)).filter(Boolean));

  function matchesFilter(recipe, filterId) {
    switch (filterId) {
      case "all":
        return true;
      case "makeable": {
        const stats = recipeHaveStats(recipe, haveCores);
        return stats.totalCount > 0 && stats.missingCount === 0;
      }
      case "expiring":
        return findExpiringSoonInRecipe(recipe, pantryInventory, plannerEntries, allRecipes, 3).size > 0;
      default:
        return filterId.startsWith("slot:") ? recipeSlot(recipe) === filterId.slice(5) : true;
    }
  }

  const filterCounts = Object.fromEntries(
    FILTERS.map((f) => [f.id, allRecipes.filter((r) => matchesFilter(r, f.id)).length])
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

  const makeableCount = filterCounts.makeable;
  const expiringCount = filterCounts.expiring;

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
      <div className="riso-recipes-heading-row">
        <div className="riso-recipes-heading">
          <div className="riso-eyebrow">
            {t("recipes.eyebrow", { count: allRecipes.length, makeable: makeableCount, expiring: expiringCount })}
          </div>
          <h1 className="riso-recipes-title">
            {t("recipes.titleStart")} <span className="accent">{t("recipes.titleAccent")}</span>
          </h1>
        </div>
        <div className="riso-recipes-sort-group">
          <span className="riso-recipes-sort-label">{t("recipes.sort")}</span>
          <label className="riso-recipes-sort-btn">
            <select aria-label={t("recipes.sortLabel")} value={sortIndex} onChange={(e) => setSortIndex(Number(e.target.value))}>
              {SORTS.map((id, i) => (
                <option key={id} value={i}>
                  {t(`recipes.sorts.${id}`)}
                </option>
              ))}
            </select>
            <span aria-hidden="true">▾</span>
          </label>
        </div>
      </div>

      <form className="riso-recipes-searchbar" onSubmit={handleImportSubmit}>
        <div className="riso-recipes-searchbar-label" style={{ background: isUrl ? "var(--riso-yellow)" : "var(--riso-canvas)" }}>
          {isUrl ? t("recipes.import") : t("recipes.search")}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("recipes.searchPlaceholder")}
        />
        {isUrl ? (
          <button type="submit" className="riso-recipes-searchbar-btn primary" disabled={importing}>
            {importing ? t("recipes.importing") : t("recipes.importRecipe")}
          </button>
        ) : (
          <button type="button" className="riso-recipes-searchbar-btn" onClick={onNewRecipe}>
            {t("recipes.newRecipe")}
          </button>
        )}
      </form>
      {importError && (
        <p className="import-error">
          {importError.message}
          {importError.needsManualEntry &&
            (importError.reason === "noData" ? t("recipes.noData") : t("recipes.blocked"))}
        </p>
      )}

      <HintStrip userId={user.id} screenKey="recipes-v2">
        {t("recipes.hint")}
      </HintStrip>

      <div className="riso-recipes-filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`riso-filter-chip${filter === f.id ? " active" : ""}`}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
            <span className="riso-filter-chip-count">{filterCounts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="riso-recipes-grid">
        {visible.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            stats={recipeHaveStats(r, haveCores)}
            usesExpiring={matchesFilter(r, "expiring")}
            onClick={onSelectRecipe}
          />
        ))}
      </div>
      {visible.length === 0 && !isUrl && (
        <p className="riso-recipes-empty">
          {allRecipes.length === 0 ? t("recipes.emptyNone") : t("recipes.emptyNoMatch")}
        </p>
      )}
    </div>
  );
}
