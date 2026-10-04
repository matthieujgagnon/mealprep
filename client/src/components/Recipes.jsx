import { useState } from "react";
import { RecipesDesktop } from "./RecipesDesktop.jsx";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe } from "../lib/similarRecipes.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { HintStrip } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { matchesSearch } from "../lib/recipeSearch.js";
import { PROTEINS, recipeUsesProtein } from "../lib/proteins.js";
import { RECIPE_SLOTS, formatRecipeTime, inMealGroup, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { isUrlLike, sortRecipes } from "../lib/recipesView.js";
import { t } from "../i18n/index.js";

// Filter ids stay the same in both languages; labels follow the language.
const FILTERS = [
  ...["all", "makeable", "expiring", "meals"].map((id) => ({
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

// Where a recipe lives: the Cookbook is the core recipes Matt cooks again and
// again (written by hand, or moved there from an import); Imported is the
// rest, saved from a link. Recipe.inCookbook says which.
const SOURCES = ["cookbook", "imported"];
const sourceOf = (recipe) => (recipe.inCookbook ? "cookbook" : "imported");

// Inside the Cookbook, recipes sit under a meal type. These come first (the
// four everyone has); snacks, desserts and pantry prep follow, then recipes
// with no meal type yet. Empty ones are hidden.
const MEAL_TYPE_IDS = [...RECIPE_SLOTS.map((slot) => slot.id), "none"];
const mealTypeOf = (recipe) => {
  const slot = recipeSlot(recipe);
  return MEAL_TYPE_IDS.includes(slot) ? slot : "none";
};

// Which sections are folded stays folded between visits, like the Flyers.
const COLLAPSED_KEY = "recipes-collapsed";
function readCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY));
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}
function writeCollapsed(set) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    // Private mode: the folds just aren't remembered.
  }
}

// A section's header, in the Flyers' collapsible style: arrow, title, count
// and a rule. Cookbook and Imported are a blue band; the meal types inside
// the Cookbook are plain, smaller headers. Folded titles go muted.
function SectionHead({ id, title, count, collapsed, disabled, sub, onToggle }) {
  return (
    <button
      type="button"
      className={`riso-ing-group-head riso-recipes-head${sub ? " sub" : " top"}${collapsed ? " collapsed" : ""}`}
      aria-expanded={!collapsed}
      aria-controls={`recipes-section-${id}`}
      onClick={() => onToggle(id)}
      disabled={disabled}
    >
      <span className="riso-ing-group-caret" aria-hidden="true">
        {collapsed ? "▸" : "▾"}
      </span>
      <h2>{title}</h2>
      <span className="riso-ing-group-count">{count}</span>
      <span className="riso-ing-group-rule" />
    </button>
  );
}

function RecipeGrid({ recipes, haveCores, matchesFilter, onSelect }) {
  return (
    <div className="riso-recipes-grid">
      {recipes.map((r) => (
        <RecipeCard
          key={r.id}
          recipe={r}
          stats={recipeHaveStats(r, haveCores)}
          usesExpiring={matchesFilter(r, "expiring")}
          onClick={onSelect}
        />
      ))}
    </div>
  );
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

// Below 768px: Cookbook and Imported as folding sections, with the meal types
// inside the Cookbook. From 768px up the page is RecipesDesktop.
function RecipesPhone({
  user,
  recipes,
  pantryInventory,
  customStaples,
  plannerEntries,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  protein,
  onProteinChange,
  onSelectRecipe,
  onImported,
  onNewRecipe,
}) {
  const [sortIndex, setSortIndex] = useState(0);
  const [source, setSource] = useState(null); // null (both) | "cookbook" | "imported"
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);

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
      case "meals":
        return inMealGroup(recipe, "meals");
      default:
        return filterId.startsWith("slot:") ? recipeSlot(recipe) === filterId.slice(5) : true;
    }
  }

  const filterCounts = Object.fromEntries(
    FILTERS.map((f) => [f.id, allRecipes.filter((r) => matchesFilter(r, f.id)).length])
  );

  // The protein filter (Home's "See them" opens it). It uses the same match as
  // Home's count, recipeUsesProtein, so the two always agree.
  const proteinKind = PROTEINS.find((p) => p.id === protein) || null;
  const proteinCounts = Object.fromEntries(PROTEINS.map((p) => [p.id, allRecipes.filter((r) => recipeUsesProtein(r, p)).length]));

  const sourceCounts = Object.fromEntries(SOURCES.map((id) => [id, allRecipes.filter((r) => sourceOf(r) === id).length]));

  let visible = allRecipes.filter(
    (r) => matchesFilter(r, filter) && (!source || sourceOf(r) === source) && (!proteinKind || recipeUsesProtein(r, proteinKind))
  );
  if (query && !isUrl) visible = visible.filter((r) => matchesSearch(r, query));

  visible = sortRecipes(visible, sortIndex, haveCores);

  // Cookbook and Imported are always their own sections (the Cookbook first),
  // each with the count of what the toggles, filters and search leave in it.
  // The Cookbook is split again by meal type; Imported is one grid.
  const sections = SOURCES.map((id) => {
    const recipesHere = visible.filter((r) => sourceOf(r) === id);
    const groups =
      id === "cookbook"
        ? MEAL_TYPE_IDS.map((typeId) => ({ id: `cookbook:${typeId}`, typeId, recipes: recipesHere.filter((r) => mealTypeOf(r) === typeId) })).filter(
            (g) => g.recipes.length > 0
          )
        : null;
    return { id, recipes: recipesHere, groups };
  }).filter((sec) => sec.recipes.length > 0);

  // While searching, everything stays open so a match is never folded away.
  const searching = query !== "" && !isUrl;
  const isFolded = (id) => collapsed.has(id) && !searching;
  function toggleFold(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsed(next);
      return next;
    });
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

      <div className="riso-recipes-source-row">
        <div className="riso-recipes-filter-chips riso-recipes-source-chips" role="group" aria-label={t("recipes.sourceLabel")}>
          {SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              className={`riso-filter-chip${source === id ? " active" : ""}`}
              aria-pressed={source === id}
              onClick={() => setSource((cur) => (cur === id ? null : id))}
            >
              {t(`recipes.sources.${id}`)}
              <span className="riso-filter-chip-count">{sourceCounts[id]}</span>
            </button>
          ))}
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

      <div className="riso-recipes-protein-row">
        <div className="riso-recipes-sort-group">
          <span className="riso-recipes-sort-label">{t("recipes.protein.label")}</span>
          <label className="riso-recipes-sort-btn">
            <select aria-label={t("recipes.protein.aria")} value={protein || ""} onChange={(e) => onProteinChange(e.target.value || null)}>
              <option value="">{t("recipes.protein.all")}</option>
              {PROTEINS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t("recipes.protein.option", { name: p.label, count: proteinCounts[p.id] })}
                </option>
              ))}
            </select>
            <span aria-hidden="true">▾</span>
          </label>
        </div>
        {proteinKind && (
          <button
            type="button"
            className="riso-filter-chip active riso-recipes-protein-chip"
            aria-label={t("recipes.protein.clear", { name: proteinKind.label })}
            title={t("recipes.protein.clear", { name: proteinKind.label })}
            onClick={() => onProteinChange(null)}
          >
            <span aria-hidden="true">{proteinKind.emoji}</span> {proteinKind.label}
            <span className="riso-recipes-protein-x" aria-hidden="true">×</span>
          </button>
        )}
      </div>

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

      {sections.map((section) => (
        <section key={section.id} className="riso-recipes-section" aria-label={t(`recipes.sources.${section.id}`)}>
          <SectionHead
            id={section.id}
            title={t(`recipes.sources.${section.id}`)}
            count={section.recipes.length}
            collapsed={isFolded(section.id)}
            disabled={searching}
            onToggle={toggleFold}
          />
          {!isFolded(section.id) && (
            <div id={`recipes-section-${section.id}`} className="riso-recipes-section-body">
              {section.groups ? (
                section.groups.map((group) => (
                  <section key={group.id} className="riso-recipes-subsection" aria-label={t(`recipes.mealTypes.${group.typeId}`)}>
                    <SectionHead
                      id={group.id}
                      sub
                      title={t(`recipes.mealTypes.${group.typeId}`)}
                      count={group.recipes.length}
                      collapsed={isFolded(group.id)}
                      disabled={searching}
                      onToggle={toggleFold}
                    />
                    {!isFolded(group.id) && (
                      <div id={`recipes-section-${group.id}`}>
                        <RecipeGrid recipes={group.recipes} haveCores={haveCores} matchesFilter={matchesFilter} onSelect={onSelectRecipe} />
                      </div>
                    )}
                  </section>
                ))
              ) : (
                <RecipeGrid recipes={section.recipes} haveCores={haveCores} matchesFilter={matchesFilter} onSelect={onSelectRecipe} />
              )}
            </div>
          )}
        </section>
      ))}
      {visible.length === 0 && !isUrl && (
        <p className="riso-recipes-empty">
          {allRecipes.length === 0 ? t("recipes.emptyNone") : t("recipes.emptyNoMatch")}
        </p>
      )}
    </div>
  );
}

export function Recipes(props) {
  const isPhone = useIsPhone();
  return isPhone ? <RecipesPhone {...props} /> : <RecipesDesktop {...props} />;
}
