import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { core, findExpiringSoonInRecipe, findSaleDeal } from "../lib/similarRecipes.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { useDeals } from "../lib/dealsStore.js";
import { HintStrip, PillMenu } from "./RisoControls.jsx";
import { Pill, TimePill } from "./RisoPills.jsx";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { matchesSearch } from "../lib/recipeSearch.js";
import { PROTEINS, recipeUsesProtein } from "../lib/proteins.js";
import { RECIPE_SLOTS, inMealGroup, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { TIME_FILTERS, isUrlLike, matchesTime, proteinOfRecipe, sortRecipes } from "../lib/recipesView.js";
import { t } from "../i18n/index.js";

// The Recipes page, on a phone and on a desktop (design handoff: docs/design/
// riso-v2, "Riso v2 Recipes"). One layout for both: the search bar with
// "+ New recipe" in it, the "how it works" strip, Cookbook / Imported tabs,
// the Protein, Time and Sort menus, the meal chips and a grid of cards (two
// across on a phone). Below 768px the meal chips fold into a fourth menu,
// "Meal", and the four menus share two rows; everything else is the same.

const SORTS = ["recent", "fewest", "quickest"];
const SOURCES = ["cookbook", "imported"];
const sourceOf = (recipe) => (recipe.inCookbook ? "cookbook" : "imported");

// The meal chips are single-choice: the page's one `filter` (which Home's "See
// them" also sets). "all" stands alone; then Meals and the meal types; then
// Makeable now and Uses expiring.
const chip = (id, label) => ({ id, get label() { return label(); } });
const ALL_CHIP = chip("all", () => t("recipes.filters.all"));
const MEAL_CHIPS = [
  chip("meals", () => t("recipes.filters.meals")),
  ...RECIPE_SLOTS.map((slot) => chip(`slot:${slot.id}`, () => t(`recipes.mealTypes.${slot.id}`))),
];
const EXTRA_CHIPS = ["makeable", "expiring"].map((id) => chip(id, () => t(`recipes.filters.${id}`)));

function RecipeCard({ recipe, stats, usesExpiring, onSale, onClick }) {
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
        <div className="rv2-card-meta">
          {totalTime > 0 ? (
            <TimePill minutes={totalTime} />
          ) : (
            <Pill tone="dash">
              <span className="riso-pill-clock" aria-hidden="true">⏱</span>
              {t("recipes.addTime")}
            </Pill>
          )}
          {meta && <span className="riso-recipe-card-meta">{meta.toUpperCase()}</span>}
        </div>
        {(usesExpiring || onSale) && (
          <div className="rv2-card-tags">
            {usesExpiring && <Pill tone="pink">{t("recipes.d.usesExpiring")}</Pill>}
            {onSale && <Pill tone="green">{t("recipes.d.onSale")}</Pill>}
          </div>
        )}
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
  protein,
  onProteinChange,
  onSelectRecipe,
  onImported,
  onNewRecipe,
}) {
  const phone = useIsPhone();
  // Start on the tab that has recipes for what is already set (Home's "See
  // them" opens a protein, a search may be set too), and on Imported when the
  // Cookbook is empty and Imported is not. The Cookbook if both have some.
  const [tab, setTab] = useState(() => {
    const kind = PROTEINS.find((p) => p.id === protein);
    const q = search.trim();
    const text = isUrlLike(q) ? "" : q;
    const count = (source) =>
      recipes.filter(
        (r) => !r.isPlaceholder && sourceOf(r) === source && (!kind || recipeUsesProtein(r, kind)) && (!text || matchesSearch(r, text))
      ).length;
    return count("cookbook") === 0 && count("imported") > 0 ? "imported" : "cookbook";
  });
  const [time, setTime] = useState("any");
  const [sortIndex, setSortIndex] = useState(0);
  const [menu, setMenu] = useState(null); // null | "meal" | "protein" | "time" | "sort"
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [toast, setToast] = useState(false);
  const menusRef = useRef(null);
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
      if (!menusRef.current?.contains(e.target)) setMenu(null);
    };
    const onKey = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // The Meal menu only exists on a phone; going wide closes it.
  useEffect(() => {
    if (!phone) setMenu((cur) => (cur === "meal" ? null : cur));
  }, [phone]);

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

  const mealOptions = [ALL_CHIP, ...MEAL_CHIPS, ...EXTRA_CHIPS].map((c) => ({ id: c.id, label: `${c.label} · ${chipCount(c.id)}` }));
  const currentMeal = [ALL_CHIP, ...MEAL_CHIPS, ...EXTRA_CHIPS].find((c) => c.id === filter) || ALL_CHIP;
  const proteinOptions = [{ id: "", label: t("recipes.d.anyProtein") }, ...PROTEINS.map((p) => ({ id: p.id, label: p.label }))];
  const timeOptions = TIME_FILTERS.map((id) => ({ id, label: t(`recipes.d.time.${id}`) }));
  const sortOptions = SORTS.map((id, i) => ({ id: String(i), label: t(`recipes.sorts.${id}`) }));
  const toggleMenu = (id) => setMenu((cur) => (cur === id ? null : id));
  const pick = (setter) => (id) => {
    setter(id);
    setMenu(null);
  };
  // Protein, Time and Sort, and on a phone Meal in front of them.
  const menus = [
    ...(phone
      ? [{ id: "meal", label: t("recipes.d.mealLabel"), value: currentMeal.label, options: mealOptions, selected: filter, isDefault: filter === "all", onPick: pick(onFilterChange) }]
      : []),
    {
      id: "protein",
      label: t("recipes.protein.label"),
      value: proteinKind ? proteinKind.label : t("recipes.d.anyProtein"),
      options: proteinOptions,
      selected: protein || "",
      isDefault: !proteinKind,
      onPick: pick((id) => onProteinChange(id || null)),
    },
    {
      id: "time",
      label: t("recipes.d.time.label"),
      value: t(`recipes.d.time.${time}`),
      options: timeOptions,
      selected: time,
      isDefault: time === "any",
      onPick: pick(setTime),
    },
    {
      id: "sort",
      label: t("recipes.sort"),
      value: t(`recipes.sorts.${SORTS[sortIndex]}`),
      options: sortOptions,
      selected: String(sortIndex),
      isDefault: sortIndex === 0,
      onPick: pick((id) => setSortIndex(Number(id))),
    },
  ];
  const menuViews = menus.map((m, i) => (
    <PillMenu
      key={m.id}
      {...m}
      phone={phone}
      openLeft={phone && i % 2 === 0}
      open={menu === m.id}
      onToggle={toggleMenu}
    />
  ));

  const countText = filtered
    ? visible.length === 1
      ? t("recipes.d.matchOne")
      : t("recipes.d.matchMany", { count: visible.length })
    : visible.length === 1
      ? t("recipes.d.countOne")
      : t("recipes.d.countMany", { count: visible.length });

  const chipButton = (c) => (
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
  );

  return (
    <div className="riso-theme riso-recipes rv2" data-theme="light">
      <div className="riso-recipes-heading">
        <div className="riso-eyebrow">
          {t("recipes.eyebrow", { count: allRecipes.length, makeable: makeableCount, expiring: expiringCount })}
        </div>
        <h1 className="riso-recipes-title">
          {t("recipes.titleStart")} <span className="accent">{t("recipes.titleAccent")}</span>
        </h1>
      </div>

      {/* The search pill and "+ New recipe" in one bar; on a phone the button sits under the pill. */}
      <form className="riso-recipes-searchbar rv2-searchbar" onSubmit={handleImportSubmit}>
        <div className="rv2-searchpill">
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
          {!isUrl && <span className="rv2-paste">{t("recipes.d.pasteChip")}</span>}
        </div>
        {isUrl ? (
          <button type="submit" className="rv2-new" disabled={importing}>
            {importing ? t("recipes.importing") : t("recipes.importRecipe")}
          </button>
        ) : (
          <button type="button" className="rv2-new" onClick={onNewRecipe}>
            {t("recipes.newRecipe")}
          </button>
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

      <HintStrip
        userId={user.id}
        screenKey="recipes-v3"
        items={[t("recipes.d.hint1"), t("recipes.d.hint2"), t("recipes.d.hint3"), t("recipes.d.hint4")]}
      />

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
        {!phone && (
          <div className="rv2-toolbar" ref={menusRef} role="group" aria-label={t("recipes.d.toolbarAria")}>
            {menuViews}
          </div>
        )}
      </div>

      {phone && (
        <div className="rv2-menu-grid" ref={menusRef} role="group" aria-label={t("recipes.d.toolbarAria")}>
          {menuViews}
        </div>
      )}

      {!phone && (
        <div className="rv2-chips" role="group" aria-label={t("recipes.d.mealAria")}>
          {/* All stands on its own, then a rule, the meal types, a rule, and the two extras. */}
          {chipButton(ALL_CHIP)}
          <span className="rv2-chips-rule" aria-hidden="true" />
          <div className="rv2-chips-cats">
            {MEAL_CHIPS.map(chipButton)}
            <span className="rv2-chips-rule inline" aria-hidden="true" />
            {EXTRA_CHIPS.map(chipButton)}
          </div>
        </div>
      )}

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
            <RecipeCard
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
