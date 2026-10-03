import { useEffect, useState } from "react";
import { api } from "../api.js";
import { currentWeekStart, formatDayLabel, isPastDay, shiftWeek } from "../lib/dates.js";
import { buildGroceryList, canonicalize } from "../lib/groceryList.js";
import { findBestDeal, findRecipesByIngredients } from "../lib/similarRecipes.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { buildCombinedHave } from "../lib/onHand.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { useDeals } from "../lib/dealsStore.js";
import { proteinName, proteinsOnSale } from "../lib/proteins.js";
import { foodEmoji } from "../lib/dealEmoji.js";
import { formatFractionQuantity, unitLabel } from "../lib/units.js";
import { ProteinsOnSale } from "./ProteinsOnSale.jsx";
import { ItemPhoto } from "./Inventory.jsx";
import { dict, t } from "../i18n/index.js";
import { formatList } from "../i18n/format.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const ALL_MEALS_KEY = "mealprep-home-all-meals";
const STRIP_MEALS = ["breakfast", "lunch", "dinner"].map((id) => ({
  id,
  get short() {
    return t(`home.stripShort.${id}`);
  },
  get label() {
    return t(`meals.${id}`);
  },
}));
const RESTAURANT_TITLE = "🍽️ Restaurant";

// "Use it up" bar: a week's scale, nearly full on the last day (the
// design's 96% today, 86% tomorrow, 30% at five days).
function useUpPct(daysLeft) {
  return Math.max(8, Math.min(96, Math.round((1 - daysLeft / 7) * 100)));
}

function matchRecipesForDeal(deal, recipes) {
  return recipes
    .map((recipe) => ({ recipe, ingredientName: recipe.ingredients?.find((i) => findBestDeal(i.name, [deal]))?.name }))
    .filter((m) => m.ingredientName);
}

function isBlankMarker(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title === "No meal planned";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 18) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

// A written meal ("Fries night", "🍽️ Restaurant"): its own leading emoji,
// else one for the food it names, else a plate.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s*/u;
function noteParts(title) {
  const m = LEADING_EMOJI.exec(title || "");
  const text = m ? title.slice(m[0].length) : title || "";
  return { emoji: m ? m[1] : foodEmoji(text) || "🍽️", text };
}

// "Saturday and Sunday are still open." - the dinners left to plan after
// today.
function openDaysLine(entries, todayIndex) {
  if (todayIndex >= 6) return "";
  const open = DAY_INDICES.filter(
    (d) => d > todayIndex && !entries.some((e) => e.dayOfWeek === d && e.mealType === "dinner")
  ).map((d) => dict().days.long[d]);
  if (open.length === 0) return t("home.restPlanned");
  const names = formatList(open);
  return t("home.stillOpen", { count: open.length, days: names.charAt(0).toUpperCase() + names.slice(1) });
}

// One "Use it up" row: the item's Inventory photo, its name and amount,
// how long it has left (pink today, yellow tomorrow, plain after) and a bar.
function UseItUpRow({ item }) {
  const days = Math.max(0, daysUntil(item.expiresAt));
  const tone = days === 0 ? "pink" : days === 1 ? "yellow" : "ink";
  const amount = [item.quantity != null ? formatFractionQuantity(item.quantity) : "", unitLabel(item.unit, item.quantity ?? 1)]
    .join(" ")
    .trim();
  return (
    <li className="riso-useup-row">
      <ItemPhoto item={item} />
      <div className="riso-useup-info">
        <div className="riso-useup-top">
          <div className="riso-useup-name-col">
            <span className="riso-useup-name">{item.name}</span>
            {amount && <span className="riso-useup-qty">{amount}</span>}
          </div>
          {days <= 1 ? (
            <span className={`riso-useup-badge ${tone}`}>{days === 0 ? t("home.todayBang") : t("home.tomorrowBang")}</span>
          ) : (
            <span className="riso-useup-days">{t("home.daysLeft", { count: days })}</span>
          )}
        </div>
        <div className="riso-freshness-bar-track">
          <div className={`riso-freshness-bar-fill ${tone}`} style={{ width: `${useUpPct(days)}%` }} />
        </div>
      </div>
    </li>
  );
}

// One of the recipes closest to makeable: what it's missing, and "+ List"
// to put those on the grocery list.
function NearlyRow({ match, onOpen, listed, onList }) {
  const { recipe, missingIngredients: missing } = match;
  const ready = missing.length === 0;
  return (
    <li className="riso-nearly-row">
      <button type="button" className="riso-nearly-open" onClick={() => onOpen(recipe)}>
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-nearly-thumb" />
        ) : (
          <span className="riso-nearly-thumb placeholder">{recipe.title[0]}</span>
        )}
        <span className="riso-nearly-info">
          <span className="riso-nearly-title">{recipe.title}</span>
          <span className="riso-nearly-missing">
            <span className={`riso-nearly-tag${ready ? " ready" : ""}`}>
              {ready ? t("home.ready") : t("home.missingN", { count: missing.length })}
            </span>
            {ready ? t("home.haveEverything") : missing.join(", ")}
          </span>
        </span>
      </button>
      {!ready &&
        (listed ? (
          <span className="riso-nearly-listed">{t("home.listed")}</span>
        ) : (
          <button
            type="button"
            className="riso-nearly-list"
            onClick={() => onList(missing)}
            aria-label={t("home.addToList", { items: formatList(missing) })}
          >
            {t("home.plusList")}
          </button>
        ))}
    </li>
  );
}

export function Home({
  user,
  recipes,
  customStaples,
  excludedStaples,
  pantryInventory,
  onNavigate,
  onSelectRecipe,
  onFindRecipes,
  onPickRecipeFor,
  isOnGroceryList = () => false,
  onAddToGroceryList,
}) {
  const weekStart = currentWeekStart();
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0

  const [plannerEntries, setPlannerEntries] = useState([]);
  const [checked, setChecked] = useState({});
  const [extraItems, setExtraItems] = useState([]);
  const [groceryOverrides, setGroceryOverrides] = useState([]);
  const { deals } = useDeals();

  // The week strip can look ahead to next week without disturbing the
  // "tonight" card or the grocery card above, which are always about the
  // real current week.
  const [stripWeekOffset, setStripWeekOffset] = useState(0);
  const stripWeekStart = shiftWeek(weekStart, stripWeekOffset);
  const [stripEntries, setStripEntries] = useState([]);
  // The week strip shows dinners; "all meals" (a quiet link, remembered on
  // this device) shows breakfast and lunch too.
  const [allMeals, setAllMeals] = useState(() => {
    try {
      return localStorage.getItem(ALL_MEALS_KEY) === "1";
    } catch {
      return false;
    }
  });
  function toggleAllMeals() {
    setAllMeals((on) => {
      try {
        localStorage.setItem(ALL_MEALS_KEY, on ? "0" : "1");
      } catch {
        // best-effort
      }
      return !on;
    });
  }

  useEffect(() => {
    api.listPlanner(weekStart).then(setPlannerEntries).catch(() => setPlannerEntries([]));
    api
      .listGroceryChecked(weekStart)
      .then((cores) => setChecked(Object.fromEntries(cores.map((c) => [c, true]))))
      .catch(() => setChecked({}));
    api.listGroceryExtras(weekStart).then(setExtraItems).catch(() => setExtraItems([]));
    api.listGroceryOverrides(weekStart).then(setGroceryOverrides).catch(() => setGroceryOverrides([]));
    // weekStart is always "today's" Monday here — this only needs to run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stripWeekOffset === 0) {
      setStripEntries(plannerEntries);
      return;
    }
    api.listPlanner(stripWeekStart).then(setStripEntries).catch(() => setStripEntries([]));
  }, [stripWeekOffset, stripWeekStart, plannerEntries]);

  const restaurantRecipe = recipes.find((r) => r.isPlaceholder && r.title === RESTAURANT_TITLE);

  const combinedHave = buildCombinedHave(pantryInventory, customStaples);
  const makeableResults = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes, recipes.length) : [];
  const readyNow = makeableResults.filter((m) => m.missingIngredients.length === 0);
  const nearly = makeableResults.filter((m) => m.missingIngredients.length > 0 && m.missingIngredients.length <= 2);
  // The three closest to makeable, or what's ready when nothing is close.
  const nearlyRows = (nearly.length > 0 ? nearly : readyNow).slice(0, 3);
  const listedAll = (names) => names.every((n) => isOnGroceryList(n));
  const missingToList = [
    ...new Set(nearlyRows.flatMap((m) => m.missingIngredients).filter((n) => !isOnGroceryList(n))),
  ];

  async function addToList(names) {
    await onAddToGroceryList?.(names);
    api.listGroceryExtras(weekStart).then(setExtraItems).catch(() => {});
    api.listGroceryOverrides(weekStart).then(setGroceryOverrides).catch(() => {});
  }

  const groceryItems = buildGroceryList(plannerEntries, customStaples, {}, excludedStaples, extraItems, groceryOverrides);
  const toBuy = groceryItems.filter((i) => !i.isStaple && !i.removed);
  const checkedCount = toBuy.filter((i) => checked[i.key]).length;
  const saleCount = toBuy.filter((i) => !checked[i.key] && findBestDeal(i.name, deals)).length;
  const groceriesDone = toBuy.length > 0 && checkedCount === toBuy.length;
  const progressPct = toBuy.length > 0 ? Math.round((checkedCount / toBuy.length) * 100) : 0;

  const todaysDinner = plannerEntries.filter((e) => e.dayOfWeek === todayIndex && e.mealType === "dinner");
  const tonightBlank = todaysDinner.some(isBlankMarker);
  const tonightEntry = todaysDinner.find((e) => !isBlankMarker(e));
  // A written note ("Hockey pool @ Normal") or eating out - nothing to cook.
  const tonightIsNote = !!tonightEntry?.recipe?.isPlaceholder;
  const tonightMatch = tonightEntry ? makeableResults.find((m) => m.recipe.id === tonightEntry.recipe.id) : null;
  const tonightAllHave = !!tonightMatch && tonightMatch.missingIngredients.length === 0;

  function mealFor(dayIndex, mealType) {
    return stripEntries.find((e) => e.dayOfWeek === dayIndex && e.mealType === mealType && !isBlankMarker(e));
  }

  function dinnerFor(dayIndex) {
    return stripEntries.find((e) => e.dayOfWeek === dayIndex && e.mealType === "dinner" && !isBlankMarker(e));
  }

  async function handleEatingOut() {
    if (!restaurantRecipe) return;
    if (tonightEntry) await api.removeFromPlanner(tonightEntry.id);
    await api.placeOnPlanner({ recipeId: restaurantRecipe.id, weekStart, dayOfWeek: todayIndex, mealType: "dinner" });
    const entries = await api.listPlanner(weekStart);
    setPlannerEntries(entries);
  }

  // The proteins on sale that the most recipes use.
  const proteinDeals = proteinsOnSale(deals)
    .map((k) => k.best)
    .filter(Boolean)
    .map((d) => ({ ...d, matches: matchRecipesForDeal(d, recipes) }));
  const topDealMatch = proteinDeals.filter((d) => d.matches.length > 0).sort((a, b) => b.matches.length - a.matches.length)[0];

  const useSoonItems = pantryInventory
    .filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
    .slice(0, 3);
  // Recipes that would use up two or more of them (or at least one).
  const useSoonCores = useSoonItems.map((i) => canonicalize(i.name).core);
  const usesOf = (recipe) =>
    new Set((recipe.ingredients || []).map((i) => canonicalize(i.name).core).filter((c) => useSoonCores.includes(c))).size;
  const realRecipes = recipes.filter((r) => !r.isPlaceholder);
  const usesTwo = realRecipes.filter((r) => usesOf(r) >= 2).length;
  const usesOne = realRecipes.filter((r) => usesOf(r) >= 1).length;

  const tonightNote = tonightIsNote ? noteParts(tonightEntry.recipe.title) : null;

  return (
    <div className="riso-theme riso-home home-page" data-theme="light">
      <div className="riso-home-greeting">
        <h1 className="riso-home-greeting-title">
          {greeting()},
          <br />
          <span className="accent">{user.name || user.email.split("@")[0]}.</span>
        </h1>
      </div>

      <div className="riso-home-top-row">
        <section className="riso-home-hero">
          {tonightAllHave && (
            <span className="riso-sticker yellow" style={{ top: -14, right: 26, transform: "rotate(6deg)" }}>
              {t("home.nothingToBuy")}
            </span>
          )}
          {tonightNote ? (
            <div className="riso-home-hero-body note">
              <div className="riso-home-hero-emoji" aria-hidden="true">
                {tonightNote.emoji}
              </div>
              <div className="riso-home-hero-info">
                <div className="riso-eyebrow on-accent">{t("home.tonight")}</div>
                <h2 className="riso-home-hero-title">{tonightNote.text}</h2>
                <div className="riso-home-hero-pills">
                  <span className="riso-home-hero-pill cream">{t("home.notFromRecipe")}</span>
                  <span className="riso-home-hero-pill outline">{t("home.nothingToPrep")}</span>
                </div>
                <p className="riso-home-hero-blurb">
                  {tonightEntry.recipe.title === RESTAURANT_TITLE
                    ? t("home.eatingOutBlurb")
                    : t("home.noteBlurb")}{" "}
                  {openDaysLine(plannerEntries, todayIndex)}
                </p>
                <div className="riso-home-hero-actions">
                  <button
                    type="button"
                    className="riso-btn hot"
                    onClick={() =>
                      onPickRecipeFor?.({ dayOfWeek: todayIndex, mealType: "dinner", note: tonightEntry.recipe.title })
                    }
                  >
                    {t("home.pickRecipe")}
                  </button>
                  <button type="button" className="riso-btn outline-on-accent" onClick={() => onNavigate("planner")}>
                    {t("home.changeInPlanner")}
                  </button>
                </div>
              </div>
            </div>
          ) : tonightEntry ? (
            <div className="riso-home-hero-body">
              {tonightEntry.recipe.photoUrl && (
                <img src={tonightEntry.recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-home-hero-photo" />
              )}
              <div className="riso-home-hero-info">
                <div className="riso-eyebrow on-accent">{t("home.tonight")}</div>
                <h2 className="riso-home-hero-title">{tonightEntry.recipe.title}</h2>
                <p className="riso-home-hero-blurb">
                  {tonightMatch
                    ? tonightAllHave
                      ? t("home.haveAll", { count: tonightMatch.totalCount })
                      : t("home.haveSome", {
                          have: tonightMatch.totalCount - tonightMatch.missingIngredients.length,
                          total: tonightMatch.totalCount,
                        })
                    : tonightEntry.recipe.ingredients?.length
                    ? t("home.missingSome")
                    : null}
                </p>
                <div className="riso-home-hero-actions">
                  <button
                    type="button"
                    className="riso-btn hot"
                    onClick={() => onSelectRecipe(tonightEntry.recipe, null, true)}
                  >
                    {t("home.startCooking")}
                  </button>
                  <button type="button" className="riso-btn outline-on-accent" onClick={() => onNavigate("planner")}>
                    {t("home.swap")}
                  </button>
                  {restaurantRecipe && (
                    <button type="button" className="riso-btn outline-on-accent" onClick={handleEatingOut}>
                      {t("home.eatingOut")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="riso-home-hero-empty">
              <div className="riso-eyebrow on-accent">{t("home.tonight")}</div>
              <p>{tonightBlank ? t("home.markedBlank") : t("home.nothingTonight")}</p>
              <div className="riso-home-hero-actions">
                <button type="button" className="riso-btn hot" onClick={() => onNavigate("planner")}>
                  {t("home.addRecipe")}
                </button>
                {restaurantRecipe && (
                  <button type="button" className="riso-btn outline-on-accent" onClick={handleEatingOut}>
                    {t("home.eatingOut")}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className={`riso-home-grocery${groceriesDone ? " done" : ""}`}>
          <div className="riso-eyebrow on-pink">{t("home.groceryList")}</div>
          {groceriesDone ? (
            <div className="riso-home-grocery-done">
              <span className="riso-home-grocery-done-title">{t("home.groceriesDone")}</span>
              <span className="riso-home-grocery-unit wide">{t("home.allBought", { count: toBuy.length })}</span>
            </div>
          ) : (
            <div className="riso-home-grocery-count">
              <span className="home-grocery-number">{toBuy.length - checkedCount}</span>
              <span className="riso-home-grocery-unit">
                {toBuy.length === 0 ? t("home.nothingYet") : t("home.leftToGrab", { count: toBuy.length - checkedCount })}
              </span>
            </div>
          )}
          <div className="riso-home-grocery-track">
            <div className="riso-home-grocery-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="riso-home-grocery-line">
            {t("home.inCart", { checked: checkedCount, total: toBuy.length })}
            {saleCount > 0 ? t("home.onSale", { count: saleCount }) : ""}
          </p>
          <button
            type="button"
            className={`riso-btn ${groceriesDone ? "hot" : "ink"} full`}
            onClick={() => onNavigate("grocery")}
          >
            {t("home.openList")}
          </button>
        </section>
      </div>

      <section className="riso-home-week">
        <div className="riso-home-week-header">
          <h3>
            {t(`home.weekTitle.${stripWeekOffset === 0 ? "this" : "next"}${allMeals ? "Meals" : "Dinners"}`)}{" "}
            <span className="riso-home-week-sub">
              ·{" "}
              {allMeals
                ? t("home.plannedOf", {
                    planned: DAY_INDICES.reduce((n, d) => n + STRIP_MEALS.filter((m) => mealFor(d, m.id)).length, 0),
                    total: 21,
                  })
                : t("home.plannedOf", { planned: DAY_INDICES.filter((d) => dinnerFor(d)).length, total: 7 })}
            </span>
          </h3>
          <div className="riso-chip-row">
            <button
              type="button"
              className={`riso-chip small${stripWeekOffset === 0 ? " active" : ""}`}
              onClick={() => setStripWeekOffset(0)}
            >
              {t("home.thisWeek")}
            </button>
            <button
              type="button"
              className={`riso-chip small${stripWeekOffset === 1 ? " active" : ""}`}
              onClick={() => setStripWeekOffset(1)}
            >
              {t("home.nextWeek")}
            </button>
            <button type="button" className="riso-home-week-toggle" aria-pressed={allMeals} onClick={toggleAllMeals}>
              {allMeals ? t("home.dinnersOnly") : t("home.allMeals")}
            </button>
          </div>
        </div>
        {allMeals ? (
          <div className="riso-home-week-strip all-meals">
            {DAY_INDICES.map((d) => {
              const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
              const past = isPastDay(stripWeekStart, d);
              return (
                <div key={d} className={`riso-home-week-col${isToday ? " today" : ""}${past ? " past" : ""}`}>
                  <span className="riso-home-week-day-label">
                    {isToday ? t("home.today") : weekday.toUpperCase()} {dayNum}
                  </span>
                  {STRIP_MEALS.map((m) => {
                    const entry = mealFor(d, m.id);
                    const title = entry?.recipe.title;
                    return entry && !entry.recipe.isPlaceholder ? (
                      <button
                        key={m.id}
                        type="button"
                        className="riso-home-week-meal"
                        title={`${m.label}: ${title}`}
                        onClick={() => onSelectRecipe(entry.recipe)}
                      >
                        <i>{m.short}</i>
                        <span>{title}</span>
                      </button>
                    ) : entry ? (
                      <div key={m.id} className="riso-home-week-meal note" title={`${m.label}: ${title}`}>
                        <i>{m.short}</i>
                        <span>{title}</span>
                      </div>
                    ) : (
                      <button
                        key={m.id}
                        type="button"
                        className="riso-home-week-meal empty"
                        aria-label={t("home.planMeal", { meal: m.label.toLowerCase(), day: dict().days.long[d] })}
                        onClick={() => onNavigate("planner")}
                      >
                        <i>{m.short}</i>
                        <span>—</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
        <div className="riso-home-week-strip">
          {DAY_INDICES.map((d) => {
            const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
            const entry = dinnerFor(d);
            // Days gone by: greyscale, muted, no shadow (and nothing to plan).
            const state = isToday ? " today" : isPastDay(stripWeekStart, d) ? " past" : "";
            // A custom note or "Restaurant" entry is the placeholder-recipe
            // mechanism (see isCustomNote/isBlankMarker in PlannerBoard.jsx)
            // - there's no real recipe or photo behind it, so it renders as
            // plain text with no click target, instead of a fake recipe card.
            return entry?.recipe.isPlaceholder ? (
              <div key={d} className={`riso-home-week-day note${state}`}>
                <div className="riso-home-week-day-body">
                  <span className="riso-home-week-day-label">
                    {weekday.toUpperCase()} {dayNum}
                  </span>
                  <span className="riso-home-week-day-title">{entry.recipe.title}</span>
                </div>
              </div>
            ) : entry ? (
              <button
                key={d}
                type="button"
                className={`riso-home-week-day${state}`}
                onClick={() => onSelectRecipe(entry.recipe)}
              >
                {entry.recipe.photoUrl ? (
                  <img src={entry.recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-home-week-day-photo" />
                ) : (
                  <div className="riso-home-week-day-photo placeholder" />
                )}
                <div className="riso-home-week-day-body">
                  <span className="riso-home-week-day-label">
                    {weekday.toUpperCase()} {dayNum}
                  </span>
                  <span className="riso-home-week-day-title">{entry.recipe.title}</span>
                </div>
              </button>
            ) : state === " past" ? (
              <div key={d} className="riso-home-week-day empty past">
                <span className="riso-home-week-day-label">
                  {weekday.toUpperCase()} {dayNum}
                </span>
                <span className="riso-home-week-day-plan">—</span>
              </div>
            ) : (
              <button
                key={d}
                type="button"
                className={`riso-home-week-day empty${state}`}
                onClick={() => onNavigate("planner")}
              >
                <span className="riso-home-week-day-label">
                  {weekday.toUpperCase()} {dayNum}
                </span>
                <span className="riso-home-week-day-plan">{t("home.plan")}</span>
              </button>
            );
          })}
        </div>
        )}
      </section>

      <div className="riso-home-bottom-row">
        <section className="riso-home-mini riso-home-useup">
          <div className="riso-home-mini-header">
            <h3>{t("home.useItUp")}</h3>
            <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("inventory")}>
              {t("home.inventoryLink")}
            </button>
          </div>
          {useSoonItems.length === 0 ? (
            <p className="riso-empty-note">{t("home.nothingExpiring")}</p>
          ) : (
            <>
              <ul className="riso-home-rows">
                {useSoonItems.map((item) => (
                  <UseItUpRow key={item.id} item={item} />
                ))}
              </ul>
              <div className="riso-home-mini-spacer" />
              <p className="riso-home-mini-note">
                {usesTwo > 0
                  ? t("home.usesTwo", { count: usesTwo })
                  : usesOne > 0
                  ? t("home.usesOne", { count: usesOne })
                  : t("home.usesNone")}
              </p>
              {usesOne > 0 && (
                <button
                  type="button"
                  className="riso-btn ink full"
                  onClick={() => onFindRecipes?.(useSoonItems.map((i) => i.name).join(", "))}
                >
                  {t("home.cookWithThese")}
                </button>
              )}
            </>
          )}
        </section>

        <section className="riso-home-mini riso-home-makeable">
          <div className="riso-home-mini-header">
            <h3>{t("home.makeableNow")}</h3>
            <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("makeable")}>
              {t("home.allLink")}
            </button>
          </div>
          {combinedHave.length === 0 ? (
            <p className="riso-empty-note">{t("home.addInventory")}</p>
          ) : (
            <>
              <div className="riso-home-makeable-count">
                <span className="riso-home-makeable-num">{readyNow.length}</span>
                <span className="riso-home-makeable-sub">
                  {t("home.readyNow")}
                  <br />
                  <span>{t("home.nearly", { count: nearly.length })}</span>
                </span>
              </div>
              {nearlyRows.length > 0 && (
                <ul className="riso-home-rows ruled">
                  {nearlyRows.map((m) => (
                    <NearlyRow
                      key={m.recipe.id}
                      match={m}
                      onOpen={onSelectRecipe}
                      listed={listedAll(m.missingIngredients)}
                      onList={addToList}
                    />
                  ))}
                </ul>
              )}
              <div className="riso-home-mini-spacer" />
              {nearly.length > 0 &&
                (missingToList.length > 0 ? (
                  <button type="button" className="riso-btn full" onClick={() => addToList(missingToList)}>
                    {t("home.addAllMissing", { count: missingToList.length })}
                  </button>
                ) : (
                  <p className="riso-home-mini-note">{t("home.allOnList")}</p>
                ))}
            </>
          )}
        </section>

        <ProteinsOnSale
          deals={deals}
          onNavigate={onNavigate}
          footer={
            topDealMatch && (
              <p className="riso-home-mini-footer">
                {t("home.recipesUse", { count: topDealMatch.matches.length, name: proteinName(topDealMatch).toLowerCase() })}{" "}
                <button
                  type="button"
                  className="riso-home-mini-link"
                  onClick={() => onFindRecipes?.(topDealMatch.matches[0].ingredientName)}
                >
                  {t("home.seeThem")}
                </button>
              </p>
            )
          }
        />
      </div>
    </div>
  );
}
