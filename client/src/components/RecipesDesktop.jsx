import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe, findSaleDeal } from "../lib/similarRecipes.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { useDeals } from "../lib/dealsStore.js";
import { HintStrip } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { matchesSearch } from "../lib/recipeSearch.js";
import { PROTEINS, recipeUsesProtein } from "../lib/proteins.js";
import { RECIPE_SLOTS, formatRecipeTime, inMealGroup, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { TIME_FILTERS, isUrlLike, matchesTime, proteinOfRecipe, sortRecipes } from "../lib/recipesView.js";
import { t } from "../i18n/index.js";

// The Recipes page from 768px up (design handoff:
// docs/design/recipes-direction-a/README.md): Cookbook / Imported tabs, a
// toolbar of Protein, Time and Sort menus, one row of meal-type chips (plus
// Makeable now, Uses expiring and Meals), a count line, and a grid of cards.

const SORTS = ["recent", "fewest", "quickest"];
const SOURCES = ["cookbook", "imported"];
const sourceOf = (recipe) => (recipe.inCookbook ? "cookbook" : "imported");

// The meal chips are single-choice: the page's one `filter` (which Home's "See
// them" also sets). "all", the meal types, then the three extra chips.
const MEAL_CHIPS = [
  { id: "all", get label() { return t("recipes.filters.all"); } },
  ...RECIPE_SLOTS.map((slot) => ({ id: `slot:${slot.id}`, get label() { return t(`recipes.mealTypes.${slot.id}`); } })),
];
const EXTRA_CHIPS = ["makeable", "expiring", "meals"].map((id) => ({ id, get label() { return t(`recipes.filters.${id}`); } }));

// A dropdown in the toolbar: label, value, ▾. Yellow when it isn't on its
// default option. Only one is open at a time (the page keeps `open`).
function ToolbarMenu({ id, label, value, options, selected, isDefault, open, onToggle, onPick }) {
  return (
    <div className="rv2-menu-wrap">
      <button
        type="button"
        className={`rv2-drop${isDefault ? "" : " set"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <span className="rv2-drop-label">{label}</span>
        <span className="rv2-drop-value">{value}</span>
        <span className="rv2-drop-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="rv2-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === selected}
              className={`rv2-menu-item${o.id === selected ? " selected" : ""}`}
              onClick={() => onPick(o.id)}
            >
              {o.label}
              {o.id === selected && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeCardV2({ recipe, stats, usesExpiring, onSale, onClick }) {
  const totalTime = recipeTotalMinutes(recipe);
  const nothingToBuy = stats.totalCount > 0 && stats.missingCount === 0;
  const pct = stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;
  const slot = recipeSlot(recipe);
  const protein = proteinOfRecipe(recipe);
  const meta = [slot ? t(`recipes.mealTypes.${slot}`) : null, protein?.label].filter(Boolean).join(" · ");

  return (
    <button type="button" className={`riso-recipe-card${nothingToBuy ? " ready" : ""}`} onClick={() => onClick(recipe)}>
      <div className="riso-recipe-card-photo">
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}
      </div>
      <div className="riso-recipe-card-body">
        <div className="riso-recipe-card-name">{recipe.title}</div>
        <div className="rv2-card-chips">
          <span className={`riso-recipe-chip time${totalTime > 0 ? "" : " unset"}`}>
            <span className="riso-recipe-chip-clock" aria-hidden="true">⏱</span>
            {totalTime > 0 ? formatRecipeTime(totalTime) : t("recipes.addTime")}
          </span>
          {meta && <span className="riso-recipe-card-meta">{meta.toUpperCase()}</span>}
          {usesExpiring && <span className="riso-recipe-chip expiring">{t("recipes.d.usesExpiring")}</span>}
          {onSale && <span className="riso-recipe-chip sale">{t("recipes.d.onSale")}</span>}
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

export function RecipesDesktop({
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
  // Opened with a protein or a search already set (Home's "See them"): start on
  // the tab that has recipes for it, the Cookbook if both do.
  const [tab, setTab] = useState(() => {
    const kind = PROTEINS.find((p) => p.id === protein);
    const q = search.trim();
    if (!kind && (!q || isUrlLike(q))) return "cookbook";
    const count = (source) =>
      recipes.filter(
        (r) => !r.isPlaceholder && sourceOf(r) === source && (!kind || recipeUsesProtein(r, kind)) && (!q || matchesSearch(r, q))
      ).length;
    return count("cookbook") === 0 && count("imported") > 0 ? "imported" : "cookbook";
  });
  const [time, setTime] = useState("any");
  const [sortIndex, setSortIndex] = useState(0);
  const [menu, setMenu] = useState(null); // null | "protein" | "time" | "sort"
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [toast, setToast] = useState(false);
  const toolbarRef = useRef(null);
  const { deals } = useDeals();

  const allRecipes = useMemo(() => recipes.filter((r) => !r.isPlaceholder), [recipes]);
  const query = search.trim();
  const isUrl = isUrlLike(query);

  const haveCores = useMemo(() => new Set(buildCombinedHave(pantryInventory, customStaples).map((n) => core(n)).filter(Boolean)), [pantryInventory, customStaples]);

  // What each recipe is, worked out once per change: makeable, uses expiring,
  // on sale (a real saving on any ingredient), and its stats.
  const info = useMemo(() => {
    const map = new Map();
    for (const r of allRecipes) {
      const stats = recipeHaveStats(r, haveCores);
      map.set(r.id, {
        stats,
        makeable: stats.totalCount > 0 && stats.missingCount === 0,
        expiring: findExpiringSoonInRecipe(r, pantryInventory, plannerEntries, allRecipes, 3).size > 0,
        onSale: (r.ingredients || []).some((i) => i?.name && findSaleDeal(i.name, deals)),
      });
    }
    return map;
  }, [allRecipes, haveCores, pantryInventory, plannerEntries, deals]);

  function matchesChip(recipe, chipId) {
    switch (chipId) {
      case "all":
        return true;
      case "makeable":
        return info.get(recipe.id).makeable;
      case "expiring":
        return info.get(recipe.id).expiring;
      case "meals":
        return inMealGroup(recipe, "meals");
      default:
        return chipId.startsWith("slot:") ? recipeSlot(recipe) === chipId.slice(5) : true;
    }
  }

  const proteinKind = PROTEINS.find((p) => p.id === protein) || null;
  const searching = query !== "" && !isUrl;

  // Everything except the meal chip. The chips' counts use this, so a chip
  // says how many you'd get by picking it with the other filters kept.
  const beforeChip = allRecipes.filter(
    (r) =>
      sourceOf(r) === tab &&
      (!proteinKind || recipeUsesProtein(r, proteinKind)) &&
      matchesTime(r, time) &&
      (!searching || matchesSearch(r, query))
  );
  const chipCount = (chipId) => beforeChip.filter((r) => matchesChip(r, chipId)).length;
  const visible = sortRecipes(beforeChip.filter((r) => matchesChip(r, filter)), sortIndex, haveCores);

  const tabCounts = Object.fromEntries(SOURCES.map((id) => [id, allRecipes.filter((r) => sourceOf(r) === id).length]));
  const makeableCount = allRecipes.filter((r) => info.get(r.id).makeable).length;
  const expiringCount = allRecipes.filter((r) => info.get(r.id).expiring).length;

  const filtered = filter !== "all" || !!proteinKind || time !== "any" || searching;
  function clearFilters() {
    onFilterChange("all");
    onProteinChange(null);
    setTime("any");
    onSearchChange("");
  }

  function pickTab(id) {
    setTab(id);
    onFilterChange("all");
  }

  // One menu open at a time; a click outside, or Escape, closes it.
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => {
      if (!toolbarRef.current?.contains(e.target)) setMenu(null);
    };
    const onKey = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleImportSubmit(e) {
    e.preventDefault();
    if (!isUrl || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const recipe = await api.importRecipe(query);
      onImported(recipe);
      // Show the new recipe: Imported, newest first, nothing filtering it out.
      onSearchChange("");
      onFilterChange("all");
      onProteinChange(null);
      setTime("any");
      setTab("imported");
      setSortIndex(0);
      setToast(true);
    } catch (err) {
      setImportError(err);
    } finally {
      setImporting(false);
    }
  }

  const proteinOptions = [{ id: "", label: t("recipes.d.anyProtein") }, ...PROTEINS.map((p) => ({ id: p.id, label: p.label }))];
  const timeOptions = TIME_FILTERS.map((id) => ({ id, label: t(`recipes.d.time.${id}`) }));
  const sortOptions = SORTS.map((id, i) => ({ id: String(i), label: t(`recipes.sorts.${id}`) }));
  const toggleMenu = (id) => setMenu((cur) => (cur === id ? null : id));
  const pick = (setter) => (id) => {
    setter(id);
    setMenu(null);
  };

  const countText = filtered
    ? visible.length === 1
      ? t("recipes.d.matchOne")
      : t("recipes.d.matchMany", { count: visible.length })
    : visible.length === 1
      ? t("recipes.d.countOne")
      : t("recipes.d.countMany", { count: visible.length });

  return (
    <div className="riso-theme riso-recipes rv2" data-theme="light">
      <div className="riso-recipes-heading-row">
        <div className="riso-recipes-heading">
          <div className="riso-eyebrow">
            {t("recipes.eyebrow", { count: allRecipes.length, makeable: makeableCount, expiring: expiringCount })}
          </div>
          <h1 className="riso-recipes-title">
            {t("recipes.titleStart")} <span className="accent">{t("recipes.titleAccent")}</span>
          </h1>
        </div>
        <button type="button" className="rv2-new" onClick={onNewRecipe}>
          {t("recipes.newRecipe")}
        </button>
      </div>

      <form className="riso-recipes-searchbar" onSubmit={handleImportSubmit}>
        <div className="riso-recipes-searchbar-label" style={{ background: isUrl ? "var(--riso-yellow)" : "var(--riso-canvas)" }}>
          {isUrl ? t("recipes.import") : t("recipes.search")}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("recipes.d.searchPlaceholder")}
          aria-label={t("recipes.d.searchPlaceholder")}
        />
        {isUrl ? (
          <button type="submit" className="riso-recipes-searchbar-btn primary" disabled={importing}>
            {importing ? t("recipes.importing") : t("recipes.importRecipe")}
          </button>
        ) : (
          <span className="rv2-paste">{t("recipes.d.pasteChip")}</span>
        )}
      </form>
      {isUrl && (
        <p className="rv2-linkfound">
          <span className="rv2-linkfound-dot" aria-hidden="true" />
          {t("recipes.d.linkFound")}
        </p>
      )}
      {importError && (
        <p className="import-error">
          {importError.message}
          {importError.needsManualEntry && (importError.reason === "noData" ? t("recipes.noData") : t("recipes.blocked"))}
        </p>
      )}
      {toast && (
        <div className="rv2-toast" role="status">
          {t("recipes.d.importedToast")}
        </div>
      )}

      <HintStrip userId={user.id} screenKey="recipes-v2">
        {t("recipes.d.hint")}
      </HintStrip>

      <div className="rv2-tabrow">
        <div className="rv2-tabs" role="tablist" aria-label={t("recipes.d.tabsAria")}>
          {SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`rv2-tab${tab === id ? " active" : ""}`}
              onClick={() => pickTab(id)}
            >
              {t(`recipes.sources.${id}`)}
              <span className="rv2-tab-count">{tabCounts[id]}</span>
            </button>
          ))}
        </div>
        <div className="rv2-toolbar" ref={toolbarRef} role="group" aria-label={t("recipes.d.toolbarAria")}>
          <ToolbarMenu
            id="protein"
            label={t("recipes.protein.label")}
            value={(proteinKind ? proteinKind.label : t("recipes.d.anyProtein"))}
            options={proteinOptions}
            selected={protein || ""}
            isDefault={!proteinKind}
            open={menu === "protein"}
            onToggle={toggleMenu}
            onPick={pick((id) => onProteinChange(id || null))}
          />
          <ToolbarMenu
            id="time"
            label={t("recipes.d.time.label")}
            value={t(`recipes.d.time.${time}`)}
            options={timeOptions}
            selected={time}
            isDefault={time === "any"}
            open={menu === "time"}
            onToggle={toggleMenu}
            onPick={pick(setTime)}
          />
          <ToolbarMenu
            id="sort"
            label={t("recipes.sort")}
            value={t(`recipes.sorts.${SORTS[sortIndex]}`)}
            options={sortOptions}
            selected={String(sortIndex)}
            isDefault={sortIndex === 0}
            open={menu === "sort"}
            onToggle={toggleMenu}
            onPick={pick((id) => setSortIndex(Number(id)))}
          />
        </div>
      </div>

      <div className="rv2-chips" role="group" aria-label={t("recipes.d.mealAria")}>
        {MEAL_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`riso-filter-chip rv2-chip${filter === c.id ? " active" : ""}`}
            aria-pressed={filter === c.id}
            onClick={() => onFilterChange(c.id)}
          >
            {c.label}
            <span className="riso-filter-chip-count">{chipCount(c.id)}</span>
          </button>
        ))}
        <span className="rv2-chips-gap" aria-hidden="true" />
        {EXTRA_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`riso-filter-chip rv2-chip${filter === c.id ? " active" : ""}`}
            aria-pressed={filter === c.id}
            onClick={() => onFilterChange(c.id)}
          >
            {c.label}
            <span className="riso-filter-chip-count">{chipCount(c.id)}</span>
          </button>
        ))}
      </div>

      <div className="rv2-countline">
        <span className="rv2-count" role="status">{countText}</span>
        {filtered && (
          <button type="button" className="rv2-clear" onClick={clearFilters}>
            {t("recipes.d.clearFilters")}
          </button>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="rv2-grid">
          {visible.map((r) => (
            <RecipeCardV2
              key={r.id}
              recipe={r}
              stats={info.get(r.id).stats}
              usesExpiring={info.get(r.id).expiring}
              onSale={info.get(r.id).onSale}
              onClick={onSelectRecipe}
            />
          ))}
        </div>
      ) : (
        !isUrl && (
          <p className="riso-recipes-empty">
            {beforeChip.length === 0 && !filtered && tabCounts[tab] === 0 ? t("recipes.emptyNone") : t("recipes.d.emptyFilters")}
          </p>
        )
      )}
    </div>
  );
}
