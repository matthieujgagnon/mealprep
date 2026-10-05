import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { IncludeSidesToggle, PillMenu } from "./RisoControls.jsx";
import { useIncludeSides } from "../hooks/useIncludeSides.js";
import { Pill, TimePill } from "./RisoPills.jsx";
import { FinderPicker } from "./FinderPicker.jsx";
import { PROTEINS } from "../lib/proteins.js";
import { RECIPE_SLOTS, recipeTotalMinutes } from "../lib/mealSlots.js";
import { rankRecipesForTray } from "../lib/plannerSuggestions.js";
import {
  AVAILABILITY,
  expiringItems,
  findRecipes,
  groupIngredients,
  sharedWords,
  shelvesWithItems,
} from "../lib/finder.js";
import { orderedSections } from "./Inventory.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { formatList } from "../i18n/format.js";
import { t } from "../i18n/index.js";

// The shared recipe finder (design: docs/design/riso-v2, Finder and
// FinderSheet): a search bar, "Cook with" ingredients, filters, the results and
// a recipe pop-out, with "Main meal" for finding recipes that share a recipe's
// ingredients. The Planner uses it as its bottom panel (layout="panel") and
// inside the phone's bottom card (layout="sheet"); Makeable uses it next.
//
// What it shows is kept by `finder`, from useFinder(), so the screen around it
// can steer it. The data comes in as props: the recipes, the inventory, what is
// on hand and the planned meals. Opening a recipe asks the caller (`onOpenPopout`,
// App.jsx's one recipe pop-out) and what the + does is the caller's (`onAdd`).

const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);

// One result: photo with the time and a round + (adds it to the plan), name,
// the have bar and what is left to buy. Dragging it (when `draggable`) onto the
// Planner's board puts it in a slot. Clicking it opens the pop-out.
function ResultCard({ tile, reason, draggable, isOpen, onOpen, onAdd }) {
  const { recipe, stats } = tile;
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${recipe.id}`,
    data: { recipe, fromTray: true },
    disabled: !draggable,
  });
  // Only the pointer listeners: the open button inside is what a keyboard reaches.
  const dragProps = draggable ? listeners : {};
  const nothingToBuy = stats.totalCount > 0 && stats.missingCount === 0;
  const pct = stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      className={`riso-recipe-card fnd-card${nothingToBuy ? " ready" : ""}${isDragging ? " dragging" : ""}${draggable ? " draggable" : ""}${isOpen ? " is-open" : ""}`}
      {...dragProps}
    >
      <button
        type="button"
        className="fnd-card-open"
        aria-label={draggable ? t("tray.dragAria", { title: recipe.title }) : t("planner.open", { title: recipe.title })}
        onClick={(e) => onOpen(recipe, e.currentTarget.closest(".fnd-card").getBoundingClientRect())}
      >
        <span className="riso-recipe-card-photo fnd-card-photo">
          {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} draggable="false" /> : null}
          <TimePill minutes={recipeTotalMinutes(recipe)} className="fnd-card-time" />
        </span>
        <span className="riso-recipe-card-body fnd-card-body">
          <span className="riso-recipe-card-name">{recipe.title}</span>
          {stats.totalCount > 0 && (
            <span className="riso-recipe-card-havebar" aria-hidden="true">
              <span className="riso-recipe-card-havebar-fill" style={{ width: `${pct}%` }} />
            </span>
          )}
          <span className={`riso-recipe-card-havelabel${nothingToBuy ? " ready" : ""}`}>
            {nothingToBuy
              ? t("tray.nothingToBuy")
              : stats.totalCount > 0
                ? t("pills.toBuy", { count: stats.missingCount })
                : t("tray.noIngredients")}
          </span>
          {reason && <span className="fnd-card-reason">{reason}</span>}
        </span>
      </button>
      {onAdd && (
        <button
          type="button"
          className="fnd-card-add"
          title={t("tray.addToPlan")}
          aria-label={t("tray.addTitleToPlan", { title: recipe.title })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onAdd(recipe)}
        >
          +
        </button>
      )}
    </div>
  );
}

// The yellow banner for the Main meal: the recipe, its ingredients grouped and
// switchable (tap one to leave it out of the search), "View recipe" and Cancel,
// and, on the Planner, "Place leftovers".
function MainMealBanner({ bannerRef, recipe, groups, off, onToggle, onView, onCancel, leftovers }) {
  return (
    <section ref={bannerRef} className="fnd-main" aria-label={t("finder.mainMeal")}>
      <div className="fnd-main-photo">{recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}</div>
      <div className="fnd-main-body">
        <span className="fnd-caps">{t("finder.mainMeal")}</span>
        <h3 className="fnd-main-title">{recipe.title}</h3>
        <p className="fnd-main-hint">{t("finder.mainHint")}</p>
        <span className="fnd-caps small">{t("finder.mainIngredients")}</span>
        <div className="fnd-main-groups">
          {groups.map((group) => (
            <div key={group.id} className="fnd-main-group">
              <span className="fnd-main-groupname">{t(`finder.groups.${group.id}`)}</span>
              <div className="fnd-main-items">
                {group.items.map((item) => {
                  const on = !off.has(item.core);
                  return (
                    <button
                      key={item.core}
                      type="button"
                      className={`fnd-ing${on ? "" : " off"}`}
                      aria-pressed={on}
                      onClick={() => onToggle(item.core)}
                    >
                      <span className="fnd-ing-mark" aria-hidden="true">
                        {on ? "✓" : ""}
                      </span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {leftovers && (
          <p className="fnd-main-leftovers">{leftovers.active ? t("finder.leftoversOn") : t("finder.leftoversOff")}</p>
        )}
      </div>
      <div className="fnd-main-actions">
        {leftovers && (
          <button
            type="button"
            className={`fnd-main-btn${leftovers.active ? " on" : ""}`}
            aria-pressed={leftovers.active}
            onClick={leftovers.onToggle}
          >
            {t("finder.placeLeftovers")}
          </button>
        )}
        <button type="button" className="fnd-main-btn" onClick={onView}>
          {t("finder.viewRecipe")}
        </button>
        <button type="button" className="fnd-main-btn dark" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </section>
  );
}

export function Finder({
  finder,
  recipes,
  pantryInventory,
  pantryLocations,
  inventoryLayout,
  haveCores,
  upcomingEntries,
  layout = "panel",
  draggable = false,
  target = null,
  targetLabel = "",
  targetNotice = null,
  onClearTarget,
  onAdd,
  onOpenPopout,
  openId = null,
  leftovers,
}) {
  const sheet = layout === "sheet";
  const [menu, setMenu] = useState(null); // null | "meal" | "protein"
  const [includeSides, setIncludeSides] = useIncludeSides();
  const menusRef = useRef(null);

  const { ranked, expiringCores, nameOf } = useMemo(
    () => rankRecipesForTray({ recipes, upcomingEntries, pantryInventory, haveCores }),
    [recipes, upcomingEntries, pantryInventory, haveCores]
  );
  const expiringSet = useMemo(() => new Set(expiringCores), [expiringCores]);
  const expiring = useMemo(() => expiringItems(pantryInventory), [pantryInventory]);
  const shelves = useMemo(
    () => shelvesWithItems(pantryInventory, orderedSections(pantryLocations, inventoryLayout)),
    [pantryInventory, pantryLocations, inventoryLayout]
  );

  const mainRecipe = finder.mainId ? recipes.find((r) => r.id === finder.mainId) || null : null;
  const mainGroups = useMemo(() => (mainRecipe ? groupIngredients(mainRecipe) : []), [mainRecipe]);
  const base = useMemo(
    () => (mainRecipe ? new Set(mainGroups.flatMap((g) => g.items.map((i) => i.core)).filter((c) => !finder.off.has(c))) : null),
    [mainRecipe, mainGroups, finder.off]
  );
  const pickedKeys = useMemo(() => new Set(finder.picks.map((p) => p.key)), [finder.picks]);

  const { tiles, counts } = useMemo(
    () =>
      findRecipes(
        ranked,
        {
          query: finder.query,
          avail: finder.avail,
          meal: finder.meal,
          protein: finder.protein,
          quick: finder.quick,
          expiring: finder.expiring,
          includeSides,
          picks: pickedKeys,
          base,
          baseId: mainRecipe?.id || null,
        },
        expiringSet
      ),
    [ranked, finder.query, finder.avail, finder.meal, finder.protein, finder.quick, finder.expiring, includeSides, pickedKeys, base, mainRecipe, expiringSet]
  );

  // A menu closes on a click outside it, or Escape.
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

  const showResults = sheet || finder.open || finder.filtered || !!mainRecipe;
  const filtersOn = finder.filtered;

  // What a card says under its bar: what it shares with the Main meal, or what
  // it uses of the Cook with picks.
  function reasonFor(tile) {
    if (mainRecipe) {
      const { names, count } = sharedWords(tile.shared, nameOf);
      if (count === 0) return null;
      return names.length > 0
        ? t("finder.sharesNames", { names: formatList(names.map(lowerFirst)) })
        : t("finder.sharesCount", { count });
    }
    if (pickedKeys.size > 0 && tile.picked.length > 0) {
      const pickNames = new Map(finder.picks.map((p) => [p.key, p.name]));
      return t("tray.uses", { names: formatList(tile.picked.map((c) => lowerFirst(pickNames.get(c) || nameOf(c)))) });
    }
    return null;
  }

  const openRecipe = (recipe, from) => onOpenPopout(recipe, from);

  // Choosing Similar recipes scrolls the page so the Main meal banner is fully
  // in view, right under the board (its top below the app header).
  const bannerRef = useRef(null);
  useEffect(() => {
    if (!finder.mainId) return undefined;
    const frame = requestAnimationFrame(() => bannerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [finder.mainId]);

  const mealOptions = [
    { id: "all", label: t("recipes.filters.all") },
    { id: "meals", label: t("recipes.filters.meals") },
    ...RECIPE_SLOTS.map((slot) => ({ id: slot.id, label: t(`recipes.mealTypes.${slot.id}`) })),
  ];
  const proteinOptions = [{ id: "", label: t("recipes.d.anyProtein") }, ...PROTEINS.map((p) => ({ id: p.id, label: p.label }))];
  const toggleMenu = (id) => setMenu((cur) => (cur === id ? null : id));
  const pickMenu = (setter) => (id) => {
    setter(id);
    setMenu(null);
  };
  const currentMeal = mealOptions.find((o) => o.id === finder.meal) || mealOptions[0];
  const currentProtein = proteinOptions.find((o) => o.id === finder.protein) || proteinOptions[0];

  const countText = filtersOn
    ? tiles.length === 1
      ? t("recipes.d.matchOne")
      : t("recipes.d.matchMany", { count: tiles.length })
    : tiles.length === 1
      ? t("recipes.d.countOne")
      : t("recipes.d.countMany", { count: tiles.length });

  const hint = target ? t("tray.hintTarget", { slot: targetLabel }) : t("finder.hint");

  return (
    <div ref={finder.rootRef} className={`fnd fnd-${layout}`}>
      {targetNotice && <div className="fnd-notice">{targetNotice}</div>}
      {!sheet && <span className="fnd-grab" aria-hidden="true" />}
      {!sheet && (
        <div className="fnd-top">
          <p className="fnd-hint">{hint}</p>
          {showResults && !finder.filtered && !mainRecipe && (
            <button type="button" className="fnd-link" onClick={() => finder.setOpen(false)}>
              {t("finder.collapse")}
            </button>
          )}
        </div>
      )}

      <div className="fnd-searchbar">
        <span className="fnd-searchlabel">{t("recipes.search")}</span>
        {target && (
          <span className="fnd-target">
            <span className="fnd-caps small">{t("finder.addTo")}</span>
            {targetLabel}
            <button type="button" aria-label={t("tray.clearSlot")} onClick={onClearTarget}>
              ×
            </button>
          </span>
        )}
        <input
          ref={finder.inputRef}
          type="text"
          value={finder.query}
          placeholder={t("finder.placeholder")}
          aria-label={t("finder.placeholder")}
          onChange={(e) => finder.setQuery(e.target.value)}
          onFocus={() => finder.setOpen(true)}
        />
        {finder.query && (
          <button type="button" className="fnd-clearq" aria-label={t("finder.clearSearch")} onClick={() => finder.setQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="fnd-with">
        <span className="fnd-caps">{t("finder.with")}</span>
        {finder.picks.map((pick) => (
          <button
            key={pick.key}
            type="button"
            className="fnd-token"
            aria-label={t("finder.removeIngredient", { name: pick.name })}
            onClick={() => finder.togglePick(pick)}
          >
            {pick.name}
            <span className="fnd-token-x" aria-hidden="true">
              ×
            </span>
          </button>
        ))}
        <button
          type="button"
          className="fnd-add-ing"
          aria-expanded={finder.pickerOpen}
          onClick={() => {
            finder.setOpen(true);
            finder.setPickerOpen(!finder.pickerOpen);
          }}
        >
          + {t("finder.addIngredient")} <span aria-hidden="true">▾</span>
        </button>
        {finder.pickerOpen && (
          <FinderPicker
            expiring={expiring}
            shelves={shelves}
            picked={pickedKeys}
            onToggle={finder.togglePick}
            onClose={() => finder.setPickerOpen(false)}
          />
        )}
      </div>

      <div className="fnd-filters" ref={menusRef}>
        <div className="fnd-seg" role="group" aria-label={t("finder.availAria")}>
          {AVAILABILITY.map((id) => (
            <button
              key={id}
              type="button"
              className={`fnd-seg-btn${finder.avail === id ? " active" : ""}`}
              aria-pressed={finder.avail === id}
              onClick={() => finder.setAvail(id)}
            >
              <span className={`fnd-dot ${id === "all" ? "ink" : id === "ready" ? "green" : "yellow"}`} aria-hidden="true" />
              {t(`finder.avail.${id}`)}
              <span className="fnd-seg-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        {finder.avail === "ready" && <IncludeSidesToggle on={includeSides} onChange={setIncludeSides} />}
        <Pill size="chip" selected={finder.expiring} onClick={() => finder.setExpiring(!finder.expiring)}>
          <span className="fnd-dot hot" aria-hidden="true" />
          {t("finder.expiring")}
        </Pill>
        <Pill size="chip" selected={finder.quick} onClick={() => finder.setQuick(!finder.quick)}>
          <span className="fnd-dot ring" aria-hidden="true" />
          {t("finder.quick")}
        </Pill>
        <div className="fnd-menus">
          <PillMenu
            id="meal"
            label={t("recipes.d.mealLabel")}
            value={currentMeal.label}
            options={mealOptions}
            selected={finder.meal}
            isDefault={finder.meal === "all"}
            open={menu === "meal"}
            openLeft={sheet}
            onToggle={toggleMenu}
            onPick={pickMenu(finder.setMeal)}
          />
          <PillMenu
            id="protein"
            label={t("recipes.protein.label")}
            value={currentProtein.label}
            options={proteinOptions}
            selected={finder.protein}
            isDefault={!finder.protein}
            open={menu === "protein"}
            onToggle={toggleMenu}
            onPick={pickMenu((id) => finder.setProtein(id))}
          />
        </div>
      </div>

      {mainRecipe && (
        <MainMealBanner
          bannerRef={bannerRef}
          recipe={mainRecipe}
          groups={mainGroups}
          off={finder.off}
          onToggle={finder.toggleIngredient}
          onView={() => onOpenPopout(mainRecipe)}
          onCancel={() => finder.setMainMeal(null)}
          leftovers={leftovers}
        />
      )}

      {!sheet && !showResults && (
        <div className="fnd-browse">
          <span className="fnd-hint">{t("finder.hint")}</span>
          <button type="button" className="fnd-browse-btn" onClick={() => finder.setOpen(true)}>
            {t("finder.browse")}
          </button>
        </div>
      )}

      {showResults && (
        <>
          {mainRecipe && <h3 className="fnd-results-title">{t("finder.similarTo", { title: mainRecipe.title })}</h3>}
          <div className="fnd-countline">
            <span className="rv2-count" role="status">
              {countText}
            </span>
            {filtersOn && (
              <button type="button" className="rv2-clear" onClick={finder.clearFilters}>
                {t("recipes.d.clearFilters")}
              </button>
            )}
          </div>
          {tiles.length > 0 ? (
            <div className="fnd-grid">
              {tiles.map((tile) => (
                <ResultCard
                  key={tile.recipe.id}
                  tile={tile}
                  reason={reasonFor(tile)}
                  draggable={draggable}
                  isOpen={openId === tile.recipe.id}
                  onOpen={openRecipe}
                  onAdd={onAdd}
                />
              ))}
            </div>
          ) : (
            <p className="fnd-empty">{t("recipes.d.emptyFilters")}</p>
          )}
        </>
      )}
    </div>
  );
}
