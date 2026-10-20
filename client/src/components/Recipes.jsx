import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { expiringItemsIn, recipeHave } from "../lib/inventoryMatch.js";
import { HintStrip, IncludeSidesToggle, PillMenu } from "./RisoControls.jsx";
import { RecipePhotoCard } from "./RecipePhotoCard.jsx";
import { useIncludeSides } from "../hooks/useIncludeSides.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { matchesSearch } from "../lib/recipeSearch.js";
import { QUICK_MINUTES } from "../lib/finder.js";
import { bentoLayout } from "../lib/bento.js";
import { captionTime, mealLineColor } from "../lib/photoCard.js";
import { PROTEINS, recipeUsesProtein } from "../lib/proteins.js";
import { RECIPE_SLOTS, hasSlot, inMealGroup, isMakeableMeal, isPreparedRecipe, recipeSlot, recipeSlotCaption, recipeTotalMinutes } from "../lib/mealSlots.js";
import { TIME_FILTERS, isUrlLike, matchesTime, proteinOfRecipe, sortRecipes } from "../lib/recipesView.js";
import { t } from "../i18n/index.js";

// The Recipes page, on a phone and on a desktop (design handoff: docs/design/
// riso-v2, "Riso v2 Recipes", the cards from docs/design/riso-v2-recipe-cards/ and
// the Cookbook's bento grid from docs/design/riso-v2-recipes-bento/). One layout
// for both: the search bar with "+ New recipe" in it, the "how it works" strip,
// the Cookbook / Imported buttons with the Time and Sort menus, one row of chips
// (Tout, Rapide, Repas ▾, Protéine ▾), then the two sections one under the other:
// the Cookbook as a bento grid of photo tiles, and Imported, underneath, as the
// plain grid of photo cards (two across on a phone). Search and every filter
// apply to both. The two buttons scroll to their section.

const SORTS = ["recent", "fewest", "quickest"];
const SCROLL_GAP = 12; // px between the top of the screen (or the pinned header) and a section's heading after a jump
const SOURCES = ["cookbook", "imported"];
const sourceOf = (recipe) => (recipe.inCookbook ? "cookbook" : "imported");

// The Meal menu is single-choice: the page's one `filter` (which Home's "See
// them" also sets). "all" stands alone; then Meals and the meal types.
const chip = (id, label) => ({ id, get label() { return label(); } });
const ALL_CHIP = chip("all", () => t("recipes.filters.all"));
const MEAL_CHIPS = [
  chip("meals", () => t("recipes.filters.meals")),
  ...RECIPE_SLOTS.map((slot) => chip(`slot:${slot.id}`, () => t(`recipes.mealTypes.${slot.id}`))),
  chip("prepared", () => t("recipes.filters.prepared")),
];

// One card (RecipePhotoCard, the same photo card as Makeable's): the meal, the
// protein and the time over the top of the photo, the title over a dark gradient
// at the bottom, and a thin line in the meal's colour. Tapping it opens the
// recipe's card. An Imported card is 3:4, all the same size; a Cookbook tile
// (`tile`, from lib/bento.js) is the same card in the bento grid's size.
function RecipeCard({ recipe, onOpen, tile }) {
  const slot = recipeSlot(recipe); // the first meal type colours the line; the caption says "Lunch +1" when there are more
  const caption = recipeSlotCaption(recipe);
  const protein = proteinOfRecipe(recipe);
  const time = captionTime(recipeTotalMinutes(recipe));
  return (
    <RecipePhotoCard
      variant={tile ? "bento" : "grid"}
      style={tile ? { "--bento-col": `span ${tile.cols}`, "--bento-row": `span ${tile.rows}`, "--bento-title": `${tile.title}px` } : undefined}
      title={recipe.title}
      photoUrl={recipe.photoUrl}
      lineColor={mealLineColor(slot)}
      openLabel={t("planner.open", { title: recipe.title })}
      onOpen={(rect) => onOpen(recipe, rect)}
      caption={
        <>
          <span className="rpc-cap-left">
            {caption && <span className="rpc-cap-meal">{caption}</span>}
            {protein && <span className="rpc-cap-protein">{protein.label}</span>}
          </span>
          {time && <span className="rpc-cap-time">{time}</span>}
        </>
      }
    />
  );
}

export function Recipes({
  user,
  recipes,
  kitchen,
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
  onToast,
}) {
  const phone = useIsPhone();
  // Cookbook and Imported are two sections of one page. The two buttons above them
  // scroll to their section, and the lit one (`tab`) is the section being looked at.
  const [tab, setTab] = useState("cookbook");
  const cookbookRef = useRef(null);
  const importedRef = useRef(null);
  const sectionRef = { cookbook: cookbookRef, imported: importedRef };
  const [jump, setJump] = useState(null); // a section to scroll to once the page has updated (after an import)
  const [time, setTime] = useState("any");
  const [quick, setQuick] = useState(false); // Rapide: half an hour or less, like the finder
  const [sortIndex, setSortIndex] = useState(0);
  const [menu, setMenu] = useState(null); // null | "meal" | "protein" | "time" | "sort"
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [includeSides, setIncludeSides] = useIncludeSides();

  const allRecipes = useMemo(() => recipes.filter((r) => !r.isPlaceholder), [recipes]);
  const query = search.trim();
  const isUrl = isUrlLike(query);

  // What each recipe is, worked out once per change (for the count line at the top):
  // makeable and uses expiring.
  const info = useMemo(() => {
    const map = new Map();
    for (const r of allRecipes) {
      const stats = recipeHave(r, kitchen);
      map.set(r.id, {
        ready: stats.totalCount > 0 && stats.missingCount === 0,
        expiring: expiringItemsIn(r, kitchen.inventory, plannerEntries, allRecipes, 3).length > 0,
      });
    }
    return map;
  }, [allRecipes, kitchen, plannerEntries]);

  function matchesChip(recipe, chipId) {
    switch (chipId) {
      case "all":
        return true;
      case "meals":
        return inMealGroup(recipe, "meals");
      case "prepared":
        return isPreparedRecipe(recipe);
      default:
        return chipId.startsWith("slot:") ? hasSlot(recipe, chipId.slice(5)) : true;
    }
  }

  const proteinKind = PROTEINS.find((p) => p.id === protein) || null;
  const searching = query !== "" && !isUrl;

  // Everything except the Meal menu. Its counts use this, so a choice says how
  // many you'd get by picking it with the other filters kept.
  const beforeChip = allRecipes.filter(
    (r) =>
      (!proteinKind || recipeUsesProtein(r, proteinKind)) &&
      matchesTime(r, time) &&
      (!quick || (recipeTotalMinutes(r) > 0 && recipeTotalMinutes(r) <= QUICK_MINUTES)) &&
      (!searching || matchesSearch(r, query))
  );
  const chipCount = (chipId) => beforeChip.filter((r) => matchesChip(r, chipId)).length;
  const visible = sortRecipes(beforeChip.filter((r) => matchesChip(r, filter)), sortIndex, kitchen);
  // The two sections, each in the order the Sort menu gave.
  const shown = Object.fromEntries(SOURCES.map((id) => [id, visible.filter((r) => sourceOf(r) === id)]));

  const tabCounts = Object.fromEntries(SOURCES.map((id) => [id, allRecipes.filter((r) => sourceOf(r) === id).length]));
  const makeableCount = allRecipes.filter((r) => info.get(r.id).ready && isMakeableMeal(r, includeSides)).length;
  const expiringCount = allRecipes.filter((r) => info.get(r.id).expiring).length;

  const filtered = filter !== "all" || !!proteinKind || time !== "any" || quick || searching;
  // Tout: no meal, no protein and not Rapide (the search and the Time menu are their own).
  const everything = filter === "all" && !proteinKind && !quick;
  function clearFilters() {
    onFilterChange("all");
    onProteinChange(null);
    setTime("any");
    setQuick(false);
    onSearchChange("");
  }
  function pickEverything() {
    onFilterChange("all");
    onProteinChange(null);
    setQuick(false);
  }

  // Scrolls a section's heading to just under the top of the screen: under the app's
  // header too when that one is pinned (it is on a phone), and with no more motion
  // than the person asked for.
  function scrollToSection(id) {
    const section = sectionRef[id].current;
    if (!section) return;
    const header = document.querySelector(".app-header");
    const pinned = header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height : 0;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - pinned - SCROLL_GAP), behavior: calm ? "auto" : "smooth" });
  }
  function pickTab(id) {
    setTab(id);
    scrollToSection(id);
  }

  // The lit button follows the page as it scrolls: Imported once its heading is in the
  // top part of the screen (or the page is scrolled to the end), the Cookbook before.
  useEffect(() => {
    const follow = () => {
      const imported = importedRef.current;
      if (!imported) return;
      const top = imported.getBoundingClientRect().top;
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setTab(top <= window.innerHeight * 0.35 || (atEnd && top < window.innerHeight) ? "imported" : "cookbook");
    };
    window.addEventListener("scroll", follow, { passive: true });
    return () => window.removeEventListener("scroll", follow);
  }, []);

  useEffect(() => {
    if (!jump) return;
    pickTab(jump.id);
    setJump(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);

  // One menu open at a time; a click outside any menu, or Escape, closes it.
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.(".rv2-menu-wrap")) setMenu(null);
    };
    const onKey = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function handleImportSubmit(e) {
    e.preventDefault();
    if (!isUrl || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const recipe = await api.importRecipe(query);
      onImported(recipe);
      // Show the new recipe: Imported (scrolled to), newest first, nothing filtering it out.
      onSearchChange("");
      onFilterChange("all");
      onProteinChange(null);
      setTime("any");
      setQuick(false);
      setSortIndex(0);
      setJump({ id: "imported" });
      onToast(t("recipes.d.importedToast"));
    } catch (err) {
      setImportError(err);
    } finally {
      setImporting(false);
    }
  }

  const mealOptions = [ALL_CHIP, ...MEAL_CHIPS].map((c) => ({ id: c.id, label: `${c.label} · ${chipCount(c.id)}` }));
  const currentMeal = [ALL_CHIP, ...MEAL_CHIPS].find((c) => c.id === filter) || ALL_CHIP;
  const proteinOptions = [{ id: "", label: t("recipes.d.anyProtein") }, ...PROTEINS.map((p) => ({ id: p.id, label: p.label }))];
  const timeOptions = TIME_FILTERS.map((id) => ({ id, label: t(`recipes.d.time.${id}`) }));
  const sortOptions = SORTS.map((id, i) => ({ id: String(i), label: t(`recipes.sorts.${id}`) }));
  const toggleMenu = (id) => setMenu((cur) => (cur === id ? null : id));
  const pick = (setter) => (id) => {
    setter(id);
    setMenu(null);
  };
  // Repas and Protéine are chips in the row of chips (the design); Time and Sort
  // stay beside the tabs on a computer and in two columns under them on a phone.
  const chipMenus = [
    { id: "meal", label: t("recipes.d.mealLabel"), value: currentMeal.label, options: mealOptions, selected: filter, isDefault: filter === "all", onPick: pick(onFilterChange), openLeft: true },
    {
      id: "protein",
      label: t("recipes.protein.label"),
      value: proteinKind ? proteinKind.label : t("recipes.d.anyProtein"),
      options: proteinOptions,
      selected: protein || "",
      isDefault: !proteinKind,
      onPick: pick((id) => onProteinChange(id || null)),
      openLeft: !phone,
    },
  ];
  const menus = [
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
    <PillMenu key={m.id} {...m} phone={phone} openLeft={phone && i % 2 === 0} open={menu === m.id} onToggle={toggleMenu} />
  ));

  const countText = filtered
    ? visible.length === 1
      ? t("recipes.d.matchOne")
      : t("recipes.d.matchMany", { count: visible.length })
    : visible.length === 1
      ? t("recipes.d.countOne")
      : t("recipes.d.countMany", { count: visible.length });

  return (
    <div className="riso-theme riso-recipes rv2" data-theme="light">
      <div className="riso-recipes-heading">
        <div className="riso-recipes-eyebrow-row">
          <div className="riso-eyebrow">
            {t("recipes.eyebrow", { count: allRecipes.length, makeable: makeableCount, expiring: expiringCount })}
          </div>
          {/* The same setting as Makeable's: it only changes the "N makeable" count here, never the list. */}
          <IncludeSidesToggle on={includeSides} onChange={setIncludeSides} />
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

      <HintStrip
        userId={user.id}
        screenKey="recipes-v5"
        items={[t("recipes.d.hint1"), t("recipes.d.hint2"), t("recipes.d.hint3"), t("recipes.d.hint4")]}
      />

      <div className="rv2-tabrow">
        <nav className="rv2-tabs" aria-label={t("recipes.d.tabsAria")}>
          {SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "true" : undefined}
              className={`rv2-tab${tab === id ? " active" : ""}`}
              onClick={() => pickTab(id)}
            >
              {t(`recipes.sources.${id}`)}
              <span className="rv2-tab-count">{tabCounts[id]}</span>
            </button>
          ))}
        </nav>
        {!phone && (
          <div className="rv2-toolbar" role="group" aria-label={t("recipes.d.toolbarAria")}>
            {menuViews}
          </div>
        )}
      </div>

      {phone && (
        <div className="rv2-menu-grid" role="group" aria-label={t("recipes.d.toolbarAria")}>
          {menuViews}
        </div>
      )}

      {/* The design's chips: Tout, Rapide, Repas ▾, Protéine ▾. */}
      <div className="rv2-chips" role="group" aria-label={t("recipes.d.chipsAria")}>
        <button type="button" className={`riso-filter-chip rv2-chip${everything ? " active" : ""}`} aria-pressed={everything} onClick={pickEverything}>
          {t("recipes.d.chipAll")}
        </button>
        <button type="button" className={`riso-filter-chip rv2-chip${quick ? " active" : ""}`} aria-pressed={quick} onClick={() => setQuick(!quick)}>
          {t("finder.quick")}
        </button>
        {chipMenus.map((m) => (
          <PillMenu key={m.id} {...m} variant="chip" phone={false} open={menu === m.id} onToggle={toggleMenu} />
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

      {SOURCES.map((id) => {
        const list = shown[id];
        const layout = bentoLayout(list.length);
        return (
          <section key={id} id={`recipes-${id}`} ref={sectionRef[id]} className="rv2-section" aria-labelledby={`recipes-${id}-title`}>
            <div className="rv2-section-head">
              <h2 id={`recipes-${id}-title`} className="rv2-section-title">
                {t(`recipes.sources.${id}`)}
              </h2>
              <span className="rv2-tab-count">{list.length}</span>
            </div>
            {list.length > 0 ? (
              id === "cookbook" ? (
                <div className="rv2-bento-wrap">
                  <div className="rv2-bento">
                    {list.map((r, i) => (
                      <RecipeCard key={r.id} recipe={r} onOpen={onSelectRecipe} tile={layout[i]} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rv2-grid">
                  {list.map((r) => (
                    <RecipeCard key={r.id} recipe={r} onOpen={onSelectRecipe} />
                  ))}
                </div>
              )
            ) : (
              !isUrl && <p className="riso-recipes-empty">{tabCounts[id] === 0 ? t(`recipes.d.${id}Empty`) : t("recipes.d.emptyFilters")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
