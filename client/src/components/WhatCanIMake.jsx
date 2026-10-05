import { useState } from "react";
import { core, findDealsFor, findRecipesByIngredients, findSaleDeal } from "../lib/similarRecipes.js";
import { useDeals } from "../lib/dealsStore.js";
import { SaleTag } from "./SaleTag.jsx";
import { daysUntil } from "../lib/pantryInventory.js";
import { Switch, HintStrip, IncludeSidesToggle } from "./RisoControls.jsx";
import { useIncludeSides } from "../hooks/useIncludeSides.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, findNextEmptySlot, todayIndex } from "../lib/plannerSlots.js";
import { formatDayLabel, isCurrentWeek } from "../lib/dates.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { MEAL_GROUPS, inMealGroup, isMakeableMeal, makeableRuleOn } from "../lib/mealSlots.js";
import { MAKEABLE_SORTS, sortMakeable } from "../lib/makeableOrder.js";
import { matchesSearch } from "../lib/recipeSearch.js";
import { t, tx } from "../i18n/index.js";

const ALSO_HAVE_STORAGE_KEY = "mealprep-makeable-also-have";
const SHOW_SALES_STORAGE_KEY = "mealprep-makeable-show-sales";

function loadShowSales() {
  try {
    return localStorage.getItem(SHOW_SALES_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function loadAlsoHave() {
  try {
    const raw = localStorage.getItem(ALSO_HAVE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}


// Matches the design mock's own time formatter exactly (e.g. "1 H 30 MIN",
// not "1 H 30 MIN" with the zero-minutes remainder dropped).
function formatMinutes(m) {
  if (m >= 60) return `${Math.floor(m / 60)} H ${m % 60} MIN`;
  return `${m} MIN`;
}

// Rows shown in a card's "You need" box before the rest collapse into one
// dashed "and n more ingredients" row (a big shop would otherwise make one
// card several times taller than its neighbours).
const NEED_ROWS_SHOWN = 4;

// "Plan it" opens inside the card: pick the day and the meal, then place
// it. The note under the meals says whether that slot is free or what
// planning there replaces.
function PlanPicker({ recipe, weekStart, plannerEntries, initialSlot, onPlace, onClose }) {
  const firstDay = isCurrentWeek(weekStart) ? todayIndex() : 0;
  const [day, setDay] = useState(initialSlot?.dayOfWeek ?? firstDay);
  const [meal, setMeal] = useState(initialSlot?.mealType ?? "dinner");
  const [busy, setBusy] = useState(false);
  const occupant = (d, m) => plannerEntries.find((e) => e.dayOfWeek === d && e.mealType === m);
  const taken = occupant(day, meal);
  const takenLabel = taken
    ? taken.recipe?.isPlaceholder
      ? taken.recipe.title === "No meal planned"
        ? t("makeable.blankCard")
        : t("makeable.quoted", { title: taken.recipe.title })
      : taken.recipe?.title
    : null;

  return (
    <div className="riso-makeable-plan" role="group" aria-label={t("makeable.planAria", { title: recipe.title })}>
      <div className="riso-makeable-plan-head">
        <strong>{t("makeable.planIt")}</strong>
        <span>{t("makeable.pickDayMeal")}</span>
      </div>
      <div className="riso-makeable-plan-days">
        {DAY_SHORT.map((label, d) => {
          const { dayNum, isToday } = formatDayLabel(weekStart, d);
          const past = d < firstDay;
          return (
            <button
              key={label}
              type="button"
              className={`riso-makeable-plan-day${d === day ? " on" : ""}${isToday ? " today" : ""}`}
              disabled={past}
              aria-pressed={d === day}
              aria-label={t(isToday ? "makeable.dayAriaToday" : "makeable.dayAria", { day: label, num: dayNum })}
              onClick={() => setDay(d)}
            >
              <span>{label.slice(0, 2).toUpperCase()}</span>
              <strong>{dayNum}</strong>
            </button>
          );
        })}
      </div>
      <div className="riso-makeable-plan-meals">
        {MEAL_TYPES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`riso-makeable-plan-meal${m.id === meal ? " on" : ""}`}
            aria-pressed={m.id === meal}
            onClick={() => setMeal(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="riso-makeable-plan-note">
        {takenLabel ? t("makeable.replaces", { what: takenLabel }) : t("makeable.slotFree")}
      </p>
      <div className="riso-makeable-plan-actions">
        <button type="button" className="riso-makeable-plan-close" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
          ×
        </button>
        <button
          type="button"
          className="riso-makeable-plan-go"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onPlace(recipe.id, { dayOfWeek: day, mealType: meal });
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("makeable.planFor", { day: DAY_SHORT[day], meal: MEAL_LABEL[meal] })}
        </button>
      </div>
    </div>
  );
}

// Photo on top, then the title, then (when something's missing) "You need
// n" with a + Add pill per item, and one right-aligned row of same-size
// actions pinned to the bottom so cards in a row line up.
function MakeableCard({ recipe, missingIngredients, atRiskUsed, onOpen, onCookTonight, planFor, pickerProps, groceryProps, showSales }) {
  const { deals } = useDeals();
  const [planning, setPlanning] = useState(false);
  const plan = planFor(recipe);
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const ingredientCount = recipe.ingredients?.length || 0;
  const ready = missingIngredients.length === 0;
  const { isOnGroceryList, onAdd, onRemove } = groceryProps;
  const shown = missingIngredients.slice(0, NEED_ROWS_SHOWN);
  const hiddenCount = missingIngredients.length - shown.length;
  const allOn = !ready && missingIngredients.every(isOnGroceryList);

  const planButton = (
    <button
      type="button"
      className={`riso-makeable-action plan${plan.planned ? " done" : ""}`}
      onClick={() => setPlanning((p) => !p)}
      aria-expanded={planning}
    >
      {plan.label}
    </button>
  );

  return (
    <div className="riso-makeable-card">
      <button type="button" className="riso-makeable-card-photo" onClick={onOpen} title={recipe.title}>
        {recipe.photoUrl && <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} />}
        {ready && <span className="riso-makeable-ready-sticker">{t("makeable.nothingToBuy")}</span>}
      </button>
      <div className="riso-makeable-card-body">
        <div className="riso-makeable-card-info">
          <button type="button" className="riso-makeable-card-name" onClick={onOpen}>
            {recipe.title}
          </button>
          <div className="riso-makeable-card-meta">
            {totalTime > 0 && `${formatMinutes(totalTime)} · `}
            {t("makeable.ingredientCount", { count: ingredientCount })}
          </div>
          {atRiskUsed.length > 0 && (
            <div className="riso-makeable-card-uses">
              <span className="riso-makeable-uses-pill">{t("makeable.useItUp")}</span>
              <span>{atRiskUsed.join(", ")}</span>
            </div>
          )}
        </div>

        {!ready && (
          <div className="riso-makeable-need">
            <div className="riso-makeable-need-head">
              <span className="riso-makeable-need-title">
                {tx("makeable.youNeed", {
                  count: <span className="riso-makeable-need-count">{missingIngredients.length}</span>,
                })}
              </span>
              <span className="riso-makeable-need-hint">{t("makeable.addHint")}</span>
            </div>
            <ul className="riso-makeable-need-list">
              {shown.map((name) => {
                const on = isOnGroceryList(name);
                return (
                  <li key={name} className="riso-makeable-need-row">
                    <span className="riso-makeable-need-name">{name}</span>
                    {showSales && <SaleTag deal={findSaleDeal(name, deals)} others={findDealsFor(name, deals)} />}
                    <button
                      type="button"
                      className={`riso-makeable-need-add${on ? " on" : ""}`}
                      onClick={() => (on ? onRemove(name) : onAdd([name]))}
                      aria-label={on ? t("makeable.removeFromList", { name }) : t("makeable.addToList", { name })}
                      title={on ? t("makeable.onListTitle") : t("makeable.addToListTitle")}
                    >
                      {on ? t("makeable.onList") : t("makeable.add")}
                    </button>
                  </li>
                );
              })}
              {hiddenCount > 0 && (
                <li className="riso-makeable-need-row more">
                  <span className="riso-makeable-need-name">
                    {t("makeable.andMore", { count: hiddenCount })}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="riso-makeable-actions">
          {ready ? (
            <button type="button" className="riso-makeable-action cook" onClick={onCookTonight}>
              {t("makeable.cookTonight")}
            </button>
          ) : (
            <button
              type="button"
              className={`riso-makeable-action add-all${allOn ? " done" : ""}`}
              onClick={() =>
                allOn
                  ? missingIngredients.forEach((name) => onRemove(name))
                  : onAdd(missingIngredients.filter((name) => !isOnGroceryList(name)))
              }
            >
              {allOn ? t("makeable.allOnList") : t("makeable.addAll", { count: missingIngredients.length })}
            </button>
          )}
          {planButton}
        </div>

        {planning && (
          <PlanPicker recipe={recipe} {...pickerProps} initialSlot={plan.nextSlot} onClose={() => setPlanning(false)} />
        )}
      </div>
    </div>
  );
}

export function WhatCanIMake({
  user,
  recipes,
  plannerEntries,
  onSelectRecipe,
  onOpenRecipeCard,
  pantryInventory,
  customStaples,
  weekStart,
  onPlaceOnPlanner,
  isOnGroceryList,
  onAddToGroceryList,
  onRemoveFromGroceryList,
}) {
  const groceryProps = {
    isOnGroceryList,
    onAdd: onAddToGroceryList,
    onRemove: onRemoveFromGroceryList,
  };
  const [useInventory, setUseInventory] = useState(true);
  const [includeSides, setIncludeSides] = useIncludeSides();
  // The order is the Sort control and nothing else (see makeableOrder.js).
  const [sort, setSort] = useState("useItUp");
  const [mealType, setMealType] = useState("all"); // "all" or a key of MEAL_GROUPS
  const [query, setQuery] = useState("");
  const [alsoHave, setAlsoHave] = useState(loadAlsoHave);
  // The "Super C $3.99" sale tags on each card, on by default; remembered
  // on this device.
  const [showSales, setShowSales] = useState(loadShowSales);
  function toggleShowSales() {
    setShowSales((on) => {
      try {
        localStorage.setItem(SHOW_SALES_STORAGE_KEY, on ? "off" : "on");
      } catch {
        // best-effort
      }
      return !on;
    });
  }
  const [input, setInput] = useState("");

  function persistAlsoHave(next) {
    setAlsoHave(next);
    try {
      localStorage.setItem(ALSO_HAVE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort
    }
  }

  function addAlsoHave(raw) {
    const name = raw.trim();
    if (!name) return;
    if (alsoHave.some((h) => h.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    persistAlsoHave([...alsoHave, name]);
    setInput("");
  }

  function removeAlsoHave(name) {
    persistAlsoHave(alsoHave.filter((h) => h !== name));
  }

  const nonExpiredInventoryNames = pantryInventory
    .filter((item) => !(item.expiresAt && daysUntil(item.expiresAt) < 0))
    .map((item) => item.name);

  const alsoHaveLower = new Set(alsoHave.map((h) => h.toLowerCase()));
  const inventoryExtra = useInventory
    ? nonExpiredInventoryNames.filter((n) => !alsoHaveLower.has(n.toLowerCase()))
    : [];
  const afterInventoryLower = new Set([...alsoHaveLower, ...inventoryExtra.map((n) => n.toLowerCase())]);
  const stapleExtra = (customStaples || []).filter((s) => !afterInventoryLower.has(s.toLowerCase()));
  const combinedHave = [...alsoHave, ...inventoryExtra, ...stapleExtra];

  // "Use it up" = inventory actually expiring within 3 days (the same "use
  // soon" line as the Recipe card and Inventory), not a guess from the plan.
  const expiringCores = new Set(
    (useInventory ? pantryInventory : [])
      .filter((item) => item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= 3)
      .map((item) => core(item.name))
      .filter(Boolean)
  );

  // No cap: a search or a meal-type chip has to be able to reach every recipe.
  const matches = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes, Infinity) : [];
  const withAtRisk = matches.map((m) => ({
    ...m,
    atRiskUsed: m.matchedIngredients.filter((n) => expiringCores.has(core(n))),
  }));

  // Makeable now counts meals only (isMakeableMeal) unless pantry and sides are
  // included; picking the Sides, Desserts or Snacks chip is asking for them.
  const NON_MEAL_CHIP_SLOT = { sides: "side", desserts: "dessert", snacks: "snack" };
  const ruleOn = makeableRuleOn(includeSides, NON_MEAL_CHIP_SLOT[mealType]);
  const mealsOnly = withAtRisk.filter((m) => isMakeableMeal(m.recipe, includeSides));
  const mealTypeCounts = Object.fromEntries(
    Object.keys(MEAL_GROUPS).map((id) => [id, withAtRisk.filter((m) => inMealGroup(m.recipe, id)).length])
  );
  const searched = query.trim();
  const shown = withAtRisk.filter(
    (m) =>
      (!ruleOn || isMakeableMeal(m.recipe)) &&
      (mealType === "all" || inMealGroup(m.recipe, mealType)) &&
      (!searched || matchesSearch(m.recipe, searched))
  );

  const readyNow = sortMakeable(shown.filter((m) => m.missingIngredients.length === 0), sort);
  const oneOrTwoShort = sortMakeable(
    shown.filter((m) => m.missingIngredients.length >= 1 && m.missingIngredients.length <= 2),
    sort
  );
  const needsAShop = sortMakeable(shown.filter((m) => m.missingIngredients.length >= 3), sort);

  const nextSlot = findNextEmptySlot(plannerEntries, weekStart);

  // "Plan" opens a day + meal picker (starting on the next empty slot); once
  // the recipe is on this week's plan the button says where - tapping it
  // again plans it somewhere else too.
  function planState(recipe) {
    const planned = plannerEntries.find((e) => e.recipe?.id === recipe.id);
    return {
      label: planned ? `✓ ${DAY_SHORT[planned.dayOfWeek]} · ${MEAL_LABEL[planned.mealType]}` : t("makeable.plan"),
      planned: !!planned,
      nextSlot,
    };
  }
  const pickerProps = {
    weekStart,
    plannerEntries,
    onPlace: (recipeId, slot) => onPlaceOnPlanner?.(recipeId, slot),
  };

  const groups = [
    { key: "ready", title: t("makeable.groupReady"), note: t("makeable.groupReadyNote"), pillClass: "blue", items: readyNow },
    {
      key: "short",
      title: t("makeable.groupShort"),
      note: t("makeable.groupShortNote"),
      pillClass: "yellow",
      items: oneOrTwoShort,
    },
    { key: "shop", title: t("makeable.groupShop"), note: t("makeable.groupShopNote"), pillClass: "paper", items: needsAShop },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="riso-theme riso-makeable" data-theme="light">
      <div className="riso-makeable-heading">
        <div className="riso-eyebrow">{t("makeable.eyebrow")}</div>
        <h1 className="riso-makeable-title">
          {t("makeable.title")} <span className="accent">{t("makeable.titleAccent")}</span>
        </h1>
      </div>

      <HintStrip userId={user.id} screenKey="makeable-v2">
        {t("makeable.hint")}
      </HintStrip>

      <section className="riso-makeable-controls">
        <div className="riso-makeable-toggles">
          <div className="riso-makeable-toggle">
            <Switch on={useInventory} onToggle={() => setUseInventory((v) => !v)} label={t("makeable.useInventory")} />
            <span className="riso-makeable-toggle-label">{t("makeable.useInventory")}</span>
            <span className="riso-makeable-toggle-meta">{t("makeable.itemCount", { count: pantryInventory.length })}</span>
          </div>
          <div className="riso-makeable-toggle-divider" />
          <div className="riso-makeable-toggle">
            <Switch on={showSales} onToggle={toggleShowSales} label={t("makeable.showSales")} />
            <span className="riso-makeable-toggle-label">{t("makeable.showSales")}</span>
          </div>
        </div>

        <form
          className="riso-makeable-also-have"
          onSubmit={(e) => {
            e.preventDefault();
            addAlsoHave(input);
          }}
        >
          <span className="riso-makeable-also-have-label">{t("makeable.alsoHave")}</span>
          {alsoHave.map((name) => (
            <span key={name} className="riso-makeable-also-have-chip">
              {name}
              <button type="button" onClick={() => removeAlsoHave(name)} aria-label={t("makeable.removeName", { name })}>
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            className="riso-makeable-also-have-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("makeable.alsoPlaceholder")}
          />
        </form>
      </section>

      {combinedHave.length > 0 && (
        <div className="riso-makeable-find">
          <div className="riso-recipes-searchbar">
            <div className="riso-recipes-searchbar-label">{t("recipes.search")}</div>
            <input
              type="text"
              aria-label={t("makeable.searchLabel")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("makeable.searchPlaceholder")}
            />
          </div>
          <div className="riso-recipes-filter-chips">
            {["all", ...Object.keys(MEAL_GROUPS)].map((id) => (
              <button
                key={id}
                type="button"
                className={`riso-filter-chip${mealType === id ? " active" : ""}`}
                aria-pressed={mealType === id}
                onClick={() => setMealType(id)}
              >
                {t(`makeable.types.${id}`)}
                <span className="riso-filter-chip-count">{id === "all" ? mealsOnly.length : mealTypeCounts[id]}</span>
              </button>
            ))}
            <IncludeSidesToggle on={includeSides} onChange={setIncludeSides} />
            <div className="riso-recipes-sort-group">
              <span className="riso-recipes-sort-label">{t("recipes.sort")}</span>
              <label className="riso-recipes-sort-btn">
                <select aria-label={t("makeable.sortLabel")} value={sort} onChange={(e) => setSort(e.target.value)}>
                  {MAKEABLE_SORTS.map((id) => (
                    <option key={id} value={id}>
                      {id === "az" ? t("same.az") : t(`makeable.sorts.${id}`)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">▾</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {combinedHave.length === 0 ? (
        <p className="riso-makeable-empty">{t("makeable.emptyNone")}</p>
      ) : groups.length === 0 ? (
        <p className="riso-makeable-empty">{withAtRisk.length > 0 ? t("makeable.noMatchFilters") : t("makeable.noMatch")}</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="riso-makeable-group">
            <div className="riso-makeable-group-header">
              <h2 className="riso-makeable-group-title">{group.title}</h2>
              <span className={`riso-makeable-group-pill ${group.pillClass}`}>{group.items.length}</span>
              <span className="riso-makeable-group-note">{group.note}</span>
            </div>
            <div className="riso-makeable-grid">
              {group.items.map(({ recipe, missingIngredients, atRiskUsed }) => (
                <MakeableCard
                  key={recipe.id}
                  recipe={recipe}
                  missingIngredients={missingIngredients}
                  atRiskUsed={atRiskUsed}
                  onOpen={() => onSelectRecipe(recipe)}
                  onCookTonight={() => onOpenRecipeCard(recipe.id)}
                  planFor={planState}
                  pickerProps={pickerProps}
                  groceryProps={groceryProps}
                  showSales={showSales}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
