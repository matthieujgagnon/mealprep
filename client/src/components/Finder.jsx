import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { IncludeSidesToggle, PillMenu } from "./RisoControls.jsx";
import { useIncludeSides } from "../hooks/useIncludeSides.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { Pill } from "./RisoPills.jsx";
import { FinderPicker } from "./FinderPicker.jsx";
import { SectionHeader } from "./FinderTiles.jsx";
import { MakeableCard } from "./MakeableCard.jsx";
import { RecipePhotoCard } from "./RecipePhotoCard.jsx";
import { PROTEINS } from "../lib/proteins.js";
import { RECIPE_SLOTS, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { cardCaption, haveBar, soonItemFor } from "../lib/photoCard.js";
import { rankRecipesForTray } from "../lib/plannerSuggestions.js";
import {
  AVAILABILITY,
  expiringItems,
  findRecipes,
  groupIngredients,
  makeableSections,
  sharedWords,
  shelvesWithItems,
} from "../lib/finder.js";
import { orderedSections } from "./Inventory.jsx";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { leftoverTitle, plannableLeftovers } from "../lib/leftovers.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { formatList } from "../i18n/format.js";
import { t } from "../i18n/index.js";

// The shared recipe finder (design: docs/design/riso-v2, Finder and
// FinderSheet): a search bar, "Cook with" ingredients, filters, the results and
// a recipe pop-out, with "Main meal" for finding recipes that share a recipe's
// ingredients. The Planner uses it as its bottom panel (layout="panel") and
// inside a bottom card (layout="sheet"); Makeable is layout="page"
// (docs/design/riso-v2-makeable/): the results are in sections (planned this
// week, ready, one or two short, needs a shop), each one a MakeableCard
// (docs/design/riso-v2-recipe-cards/), and Show sales and the Makeable now rule
// apply to the whole page.
//
// What it shows is kept by `finder`, from useFinder(), so the screen around it
// can steer it. The data comes in as props: the recipes, the inventory, what is
// on hand and the planned meals. Opening a recipe asks the caller (`onOpenPopout`,
// App.jsx's one recipe pop-out) and what the + does is the caller's (`onAdd`).

const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);

// One result in the Planner's panel: the shared photo card (RecipePhotoCard,
// variant "finder"; design: docs/design/riso-v2-planner-search-cards/). The photo
// has « MEAL · TIME », the name and a round + (adds it to the plan); under it an
// info row (have/total, COMPLETE or N MISSING), what the card shares with the
// Main meal or the Cook with picks (`reason`) when there is one, and a thin
// progress bar. No pills, no buttons. The whole card opens the pop-out, and
// dragging it (when `draggable`) onto the Planner's board puts it in a slot. A
// recipe with nothing missing has the blue outline ("you have it all"). (The
// Makeable page draws MakeableCard instead.)
function ResultCard({ tile, reason, draggable, isOpen, onOpen, onAdd }) {
  const { recipe, stats } = tile;
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${recipe.id}`,
    data: { recipe, fromTray: true },
    disabled: !draggable,
  });
  // Only the pointer listeners: the open button inside is what a keyboard reaches.
  const dragProps = draggable ? listeners : {};
  const bar = haveBar(stats);
  const slot = recipeSlot(recipe);
  const caption = cardCaption(slot ? t(`recipes.mealTypes.${slot}`) : "", recipeTotalMinutes(recipe));

  return (
    <RecipePhotoCard
      variant="finder"
      cardRef={setNodeRef}
      className={`fnd-card${isDragging ? " dragging" : ""}${draggable ? " draggable" : ""}${isOpen ? " is-open" : ""}`}
      ready={bar.state === "complete"}
      title={recipe.title}
      photoUrl={recipe.photoUrl}
      caption={caption}
      openLabel={draggable ? t("tray.dragAria", { title: recipe.title }) : t("planner.open", { title: recipe.title })}
      onOpen={(rect) => onOpen(recipe, rect)}
      action={
        onAdd ? (
          <button
            type="button"
            className="rpc-add"
            title={t("tray.addToPlan")}
            aria-label={t("tray.addTitleToPlan", { title: recipe.title })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onAdd(recipe)}
          >
            +
          </button>
        ) : null
      }
      {...dragProps}
    >
      <span className="rpc-info">
        {bar.state === "none" ? (
          <span>{t("tray.noIngredients")}</span>
        ) : (
          <>
            <span>{bar.text}</span>
            <span>{bar.state === "complete" ? t("makeable.card.complete") : t("makeable.card.missing", { count: bar.missing })}</span>
          </>
        )}
      </span>
      {reason && <span className="rpc-reason">{reason}</span>}
      {bar.state !== "none" && (
        <span className="rpc-bar" aria-hidden="true">
          <span style={{ width: `${bar.pct}%` }} />
        </span>
      )}
    </RecipePhotoCard>
  );
}

// Leftovers in Inventory, on the Planner (`onAddLeftover`): « Restes · Chili · 2
// portions ». The same photo card as a recipe; placing one plans a leftover meal
// that eats one of its portions, and puts nothing on the grocery list. The whole
// card and its + add it (into the chosen slot, else the slot picker); it drags onto
// a slot like a recipe.
function LeftoverResultCard({ entry, draggable, onAdd }) {
  const { item, recipe } = entry;
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `leftover-${item.id}`,
    data: { leftoverItem: item, fromTray: true },
    disabled: !draggable,
  });
  const title = leftoverTitle(item);
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  const caption = [t("cooked.leftovers.tag"), days != null ? t("finder.leftoverDays", { count: Math.max(0, days) }) : null].filter(Boolean).join(" · ");
  return (
    <RecipePhotoCard
      variant="finder"
      cardRef={setNodeRef}
      className={`fnd-card leftover${isDragging ? " dragging" : ""}${draggable ? " draggable" : ""}`}
      ready
      title={title}
      photoUrl={item.imageUrl && item.imageUrl !== "none" ? item.imageUrl : recipe?.photoUrl}
      caption={caption}
      openLabel={t("finder.leftoverAdd", { title })}
      onOpen={() => onAdd(entry)}
      action={
        <button
          type="button"
          className="rpc-add"
          title={t("tray.addToPlan")}
          aria-label={t("finder.leftoverAdd", { title })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onAdd(entry)}
        >
          +
        </button>
      }
      {...(draggable ? listeners : {})}
    >
      <span className="rpc-info">
        <span>{t("finder.leftoverInfo")}</span>
      </span>
    </RecipePhotoCard>
  );
}

// The yellow banner for the Main meal: the recipe, its ingredients grouped and
// switchable (tap one to leave it out of the search), "View recipe" and Cancel,
// and, on the Planner, "Place leftovers". On the Makeable page (`page`) a ✕ in the
// corner closes it and there is no Cancel.
function MainMealBanner({ bannerRef, recipe, groups, off, onToggle, onView, onCancel, leftovers, page }) {
  return (
    <section ref={bannerRef} className="fnd-main" aria-label={t("finder.mainMeal")}>
      {page && (
        <button type="button" className="fnd-main-x" aria-label={t("finder.closeMain")} title={t("finder.closeMain")} onClick={onCancel}>
          ×
        </button>
      )}
      <div className="fnd-main-photo">{recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}</div>
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
        {!page && (
          <button type="button" className="fnd-main-btn dark" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
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
  onAddLeftover,
  plannedDays,
  grocery,
  deals,
  showSales = false,
  onToggleSales,
  onCook,
  onPlan,
  onOpenFlyerDeal,
}) {
  const sheet = layout === "sheet";
  const page = layout === "page";
  const [weekOpen, setWeekOpen] = useState(false); // "Meals of the week", closed to begin with
  const phone = useIsPhone();
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
          makeable: page,
        },
        expiringSet
      ),
    [page, ranked, finder.query, finder.avail, finder.meal, finder.protein, finder.quick, finder.expiring, includeSides, pickedKeys, base, mainRecipe, expiringSet]
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

  const showResults = sheet || page || finder.open || finder.filtered || !!mainRecipe;
  // On the Planner, Inventory's leftovers come first (not with a Main meal, which
  // is about other recipes).
  const leftoverTiles = useMemo(
    () => (onAddLeftover && !mainRecipe ? plannableLeftovers(pantryInventory, recipes, finder.query) : []),
    [onAddLeftover, mainRecipe, pantryInventory, recipes, finder.query]
  );
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

  // Makeable page: the sections, and for each card the soonest thing it uses that
  // goes off within 3 days (the pink strip).
  const sections = useMemo(() => (page ? makeableSections(tiles, plannedDays || new Map()) : []), [page, tiles, plannedDays]);
  const soonByRecipe = useMemo(() => {
    const map = new Map();
    if (!page) return map;
    const planned = upcomingEntries || [];
    for (const tile of tiles) map.set(tile.recipe.id, soonItemFor(tile.recipe, pantryInventory, planned, recipes));
    return map;
  }, [page, tiles, pantryInventory, upcomingEntries, recipes]);

  function renderTile(tile) {
    return (
      <MakeableCard
        key={tile.recipe.id}
        tile={tile}
        soon={soonByRecipe.get(tile.recipe.id) || null}
        reason={reasonFor(tile)}
        grocery={grocery}
        deals={deals}
        showSales={showSales}
        onOpen={openRecipe}
        onCook={onCook}
        onPlan={onPlan}
        onOpenCirculaires={onOpenFlyerDeal}
      />
    );
  }

  // On the Makeable page on a phone the chip row pins right under the sticky app
  // header (the same measure Inventory's shelf pill uses).
  useEffect(() => {
    if (!page || !phone) return undefined;
    const header = document.querySelector(".app-header");
    const root = finder.rootRef.current;
    if (!header || !root) return undefined;
    const measure = () => root.style.setProperty("--fnd-sticky-top", `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [page, phone, finder.rootRef]);

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

  const compact = !sheet && !page; // a computer's panel and a phone's panel have the grab bar, the hint and Browse; the sheet and the page don't
  return (
    <div ref={finder.rootRef} className={`fnd fnd-${layout}${showResults ? " is-open" : ""}`}>
      {targetNotice && <div className="fnd-notice">{targetNotice}</div>}
      {compact && <span className="fnd-grab" aria-hidden="true" />}
      {compact && (
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
          placeholder={t(phone && !sheet ? "finder.placeholderShort" : "finder.placeholder")}
          aria-label={t("finder.placeholder")}
          onChange={(e) => finder.setQuery(e.target.value)}
          onFocus={() => finder.setOpen(true)}
        />
        {finder.query && (
          <button type="button" className="fnd-clearq" aria-label={t("finder.clearSearch")} onClick={() => finder.setQuery("")}>
            ×
          </button>
        )}
        {/* A phone's Browse / Close sits inside the bar (a computer has the Browse
            button under it). With a Main meal the banner's own Cancel closes it. */}
        {compact && !mainRecipe && (
          <button
            type="button"
            className={`fnd-bar-toggle${showResults ? " open" : ""}`}
            onClick={() => {
              if (showResults) {
                finder.setOpen(false);
                if (finder.filtered) finder.clearFilters();
              } else finder.setOpen(true);
            }}
          >
            {showResults ? t("common.close") : t("finder.browse")}
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
          {compact && phone ? t("finder.cookWith") : `+ ${t("finder.addIngredient")}`} <span aria-hidden="true">▾</span>
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
        {/* The chips are one row of their own (on the Makeable phone page it is the sticky, sideways-scrolling one); the menus stay outside it so they can open. */}
        <div className="fnd-chips">
          <div className="fnd-seg" role="group" aria-label={t("finder.availAria")}>
            {AVAILABILITY.map((id) => (
              <button
                key={id}
                type="button"
                className={`fnd-seg-btn${finder.avail === id ? " active" : ""}`}
                aria-pressed={finder.avail === id}
                onClick={() => finder.setAvail(compact && phone && finder.avail === id && id !== "all" ? "all" : id)}
              >
                <span className={`fnd-dot ${id === "all" ? "ink" : id === "ready" ? "green" : "yellow"}`} aria-hidden="true" />
                {t(page && phone ? `finder.availShort.${id}` : `finder.avail.${id}`)}
                <span className="fnd-seg-count">{counts[id]}</span>
              </button>
            ))}
          </div>
          {!page && finder.avail === "ready" && <IncludeSidesToggle on={includeSides} onChange={setIncludeSides} />}
          <Pill size="chip" className="fnd-expiring" selected={finder.expiring} onClick={() => finder.setExpiring(!finder.expiring)}>
            <span className="fnd-dot hot" aria-hidden="true" />
            {t("finder.expiring")}
          </Pill>
          <Pill size="chip" className="fnd-quick" selected={finder.quick} onClick={() => finder.setQuick(!finder.quick)}>
            <span className="fnd-dot ring" aria-hidden="true" />
            {t("finder.quick")}
          </Pill>
          {page && (
            <>
              <span className="fnd-divider" aria-hidden="true" />
              <Pill size="chip" className="fnd-sales" selected={showSales} onClick={onToggleSales}>
                <span className="fnd-dot green" aria-hidden="true" />
                {t("makeable.showSales")}
              </Pill>
            </>
          )}
        </div>
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
          page={page}
        />
      )}

      {compact && !showResults && (
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
            {page && <IncludeSidesToggle on={includeSides} onChange={setIncludeSides} />}
          </div>
          {page && tiles.length > 0 ? (
            sections.map((section) => {
              const week = section.id === "week";
              const open = !week || weekOpen;
              return (
                <section key={section.id} className={`fnd-sec ${section.id}`} aria-label={t(`finder.sections.${section.id}`)}>
                  <SectionHeader id={section.id} count={section.tiles.length} open={open} onToggle={week ? () => setWeekOpen(!weekOpen) : null} />
                  {open && (
                    <>
                      <p className="fnd-sec-desc">{t(`finder.sectionsNote.${section.id}`)}</p>
                      <div className="fnd-grid">{section.tiles.map(renderTile)}</div>
                    </>
                  )}
                </section>
              );
            })
          ) : tiles.length > 0 || leftoverTiles.length > 0 ? (
            <div className="fnd-grid">
              {leftoverTiles.map((entry) => (
                <LeftoverResultCard key={entry.item.id} entry={entry} draggable={draggable} onAdd={onAddLeftover} />
              ))}
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
            <p className="fnd-empty">{t(page ? "finder.noMatch" : "recipes.d.emptyFilters")}</p>
          )}
        </>
      )}
    </div>
  );
}
