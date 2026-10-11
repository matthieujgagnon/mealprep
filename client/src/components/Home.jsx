import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { currentWeekStart, formatDayLabel, isPastDay, shiftWeek, toDateKey } from "../lib/dates.js";
import { buildGroceryList, canonicalize } from "../lib/groceryList.js";
import { applyChecks } from "../lib/groceryChecks.js";
import { findSaleDeal } from "../lib/similarRecipes.js";
import { useIncludeSides } from "../hooks/useIncludeSides.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { currentMealType, makeableNow, toUseItems, useBarPct, useTone } from "../lib/homeWeek.js";
import { useDeals } from "../lib/dealsStore.js";
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
// The hero card is about the meal that is on now (see currentMealType).
const HERO_TEXT = {
  breakfast: { eyebrow: "home.thisMorning", marked: "home.markedBlankMorning", nothing: "home.nothingMorning" },
  lunch: { eyebrow: "home.todayLunch", marked: "home.markedBlankMidday", nothing: "home.nothingMidday" },
  dinner: { eyebrow: "home.tonight", marked: "home.markedBlank", nothing: "home.nothingTonight" },
};

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

// "Saturday and Sunday are still open." - the days after today with nothing
// planned for that meal.
function openDaysLine(entries, todayIndex, mealType) {
  if (todayIndex >= 6) return "";
  const open = DAY_INDICES.filter(
    (d) => d > todayIndex && !entries.some((e) => e.dayOfWeek === d && e.mealType === mealType)
  ).map((d) => dict().days.long[d]);
  if (open.length === 0) return t("home.restPlanned");
  const names = formatList(open);
  return t("home.stillOpen", { count: open.length, days: names.charAt(0).toUpperCase() + names.slice(1) });
}

// One "To use" row: the item's Inventory photo, its name and amount, how
// long it has left (a pill coloured by how soon) and a bar to match.
function ToUseRow({ item }) {
  const days = Math.max(0, daysUntil(item.expiresAt));
  const tone = useTone(days);
  const amount = [item.quantity != null ? formatFractionQuantity(item.quantity) : "", unitLabel(item.unit, item.quantity ?? 1)]
    .join(" ")
    .trim();
  return (
    <li className="riso-useup-row">
      <ItemPhoto item={item} />
      <div className="riso-useup-info">
        <div className="riso-useup-top">
          <div className="riso-useup-name-col">
            <span className="riso-useup-name">
              {item.name}
              {item.isLeftover && <span className="inv-card-leftover-tag">{t("cooked.leftovers.tag")}</span>}
            </span>
            {amount && <span className="riso-useup-qty">{amount}</span>}
          </div>
          <span className={`riso-useup-badge ${tone}`}>
            {days === 0 ? t("home.todayBang") : days === 1 ? t("home.tomorrowBang") : t("home.daysLeft", { count: days })}
          </span>
        </div>
        <div className="riso-freshness-bar-track">
          <div className={`riso-freshness-bar-fill ${tone}`} style={{ width: `${useBarPct(days)}%` }} />
        </div>
      </div>
    </li>
  );
}

export function Home({
  user,
  recipes,
  customStaples,
  excludedStaples,
  pantryInventory,
  kitchen,
  onNavigate,
  onSelectRecipe,
  onOpenRecipeCard,
  onFindRecipes,
  onFindProtein,
  onOpenFlyerDeal,
  onPickRecipeFor,
  isOnGroceryList = () => false,
  onAddToGroceryList,
  onRemoveFromGroceryList,
  onCooked,
}) {
  const weekStart = currentWeekStart();
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0
  const nowMeal = currentMealType();

  const [plannerEntries, setPlannerEntries] = useState([]);
  // Every planned meal from today onward, across weeks: what the grocery
  // card is built from (the same list the Grocery tab shows).
  const [upcomingEntries, setUpcomingEntries] = useState([]);
  // The list's saved check rows (see GroceryList); what is checked or bought is worked out from them.
  const [checkRows, setCheckRows] = useState({});
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

  // On a phone the strip scrolls sideways: bring today's column into view
  // (only the strip moves, never the page).
  const stripRef = useRef(null);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const today = strip.querySelector(".today");
    strip.scrollLeft =
      today && strip.scrollWidth > strip.clientWidth ? today.offsetLeft - (strip.clientWidth - today.offsetWidth) / 2 : 0;
  }, [stripWeekOffset, allMeals]);

  useEffect(() => {
    api.listPlanner(weekStart).then(setPlannerEntries).catch(() => setPlannerEntries([]));
    api.listPlannerUpcoming(toDateKey(new Date())).then(setUpcomingEntries).catch(() => setUpcomingEntries([]));
    api
      .listGroceryChecked()
      .then((rows) => setCheckRows(Object.fromEntries(rows.map((row) => [row.core, row]))))
      .catch(() => setCheckRows({}));
    api.listGroceryExtras().then(setExtraItems).catch(() => setExtraItems([]));
    api.listGroceryOverrides().then(setGroceryOverrides).catch(() => setGroceryOverrides([]));
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

  // The same count as Makeable and the recipe card, and the same Makeable now
  // rule and setting as Recipes and Makeable: meals only.
  const [includeSides] = useIncludeSides();
  const { results: makeableResults, ready: readyNow, nearly } = makeableNow(recipes, kitchen, includeSides);
  // Makeable now is optional: with nothing ready and nothing one or two
  // items away it steps aside, and Proteins on sale takes its place.
  const showMakeable = readyNow.length > 0 || nearly.length > 0;

  // Proteins on sale adds a deal's product to the grocery list, or takes it
  // off again; the grocery card above follows.
  function refreshGrocery() {
    api.listGroceryExtras().then(setExtraItems).catch(() => {});
    api.listGroceryOverrides().then(setGroceryOverrides).catch(() => {});
  }
  async function addToList(names, opts) {
    await onAddToGroceryList?.(names, opts);
    refreshGrocery();
  }
  async function removeFromList(name) {
    await onRemoveFromGroceryList?.(name);
    refreshGrocery();
  }

  const groceryItems = buildGroceryList(upcomingEntries, customStaples, {}, excludedStaples, extraItems, groceryOverrides);
  // What's still to buy: what "Done shopping" bought is off the list.
  const { items: toBuy, checked, bought } = applyChecks(
    groceryItems.filter((i) => !i.isStaple && !i.removed),
    checkRows
  );
  const allBought = toBuy.length === 0 && bought.length > 0;
  // After "Done shopping" the card keeps showing the trip: everything bought.
  const totalCount = allBought ? bought.length : toBuy.length;
  const checkedCount = allBought ? bought.length : toBuy.filter((i) => checked[i.key]).length;
  const saleCount = toBuy.filter((i) => !checked[i.key] && findSaleDeal(i.name, deals)).length;
  const groceriesDone = totalCount > 0 && checkedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const hero = HERO_TEXT[nowMeal];
  const todaysMeal = plannerEntries.filter((e) => e.dayOfWeek === todayIndex && e.mealType === nowMeal);
  const tonightBlank = todaysMeal.some(isBlankMarker);
  const tonightEntry = todaysMeal.find((e) => !isBlankMarker(e));
  // A written note ("Hockey pool @ Normal") or eating out - nothing to cook.
  const tonightIsNote = !!tonightEntry?.recipe?.isPlaceholder;
  const tonightMatch = tonightEntry ? makeableResults.find((m) => m.recipe.id === tonightEntry.recipe.id) : null;
  const tonightAllHave = !!tonightMatch && tonightMatch.missingCount === 0;

  function mealFor(dayIndex, mealType) {
    return stripEntries.find((e) => e.dayOfWeek === dayIndex && e.mealType === mealType && !isBlankMarker(e));
  }

  function dinnerFor(dayIndex) {
    return stripEntries.find((e) => e.dayOfWeek === dayIndex && e.mealType === "dinner" && !isBlankMarker(e));
  }

  async function handleEatingOut() {
    if (!restaurantRecipe) return;
    if (tonightEntry) await api.removeFromPlanner(tonightEntry.id);
    await api.placeOnPlanner({ recipeId: restaurantRecipe.id, weekStart, dayOfWeek: todayIndex, mealType: nowMeal });
    const entries = await api.listPlanner(weekStart);
    setPlannerEntries(entries);
    api.listPlannerUpcoming(toDateKey(new Date())).then(setUpcomingEntries).catch(() => {});
  }

  const { shown: useSoonItems, soonest: useSoonest } = toUseItems(pantryInventory, daysUntil);
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
                <div className="riso-eyebrow on-accent">{t(hero.eyebrow)}</div>
                <h2 className="riso-home-hero-title">{tonightNote.text}</h2>
                <div className="riso-home-hero-pills">
                  <span className="riso-home-hero-pill cream">{t("home.notFromRecipe")}</span>
                  <span className="riso-home-hero-pill outline">{t("home.nothingToPrep")}</span>
                </div>
                <p className="riso-home-hero-blurb">
                  {tonightEntry.recipe.title === RESTAURANT_TITLE
                    ? t("home.eatingOutBlurb")
                    : t("home.noteBlurb")}{" "}
                  {openDaysLine(plannerEntries, todayIndex, nowMeal)}
                </p>
                <div className="riso-home-hero-actions">
                  <button
                    type="button"
                    className="riso-btn hot"
                    onClick={() =>
                      onPickRecipeFor?.({ dayOfWeek: todayIndex, mealType: nowMeal, note: tonightEntry.recipe.title })
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
              {tonightEntry.recipe.photoUrl ? (
                <RecipePhoto src={tonightEntry.recipe.photoUrl} alt="" className="riso-home-hero-photo" />
              ) : (
                <div className="riso-home-hero-photo placeholder" aria-hidden="true" />
              )}
              <div className="riso-home-hero-info">
                <div className="riso-eyebrow on-accent">
                  {t(hero.eyebrow)}
                  {tonightEntry.cookedAt && <span className="riso-home-cooked">{t("cooked.status")}</span>}
                </div>
                <h2 className="riso-home-hero-title">{tonightEntry.recipe.title}</h2>
                <p className="riso-home-hero-blurb">
                  {tonightMatch
                    ? tonightAllHave
                      ? t("home.haveAll", { count: tonightMatch.totalCount })
                      : t("home.haveSome", {
                          have: tonightMatch.matchedCount,
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
                    onClick={() => onOpenRecipeCard(tonightEntry.recipe.id)}
                  >
                    {t("home.startCooking")}
                  </button>
                  {onCooked && !tonightEntry.isLeftover && (
                    <button
                      type="button"
                      className="riso-btn outline-on-accent"
                      aria-label={t("cooked.buttonAria", { title: tonightEntry.recipe.title })}
                      onClick={() =>
                        onCooked(tonightEntry, (id, cookedAt) =>
                          setPlannerEntries((prev) => prev.map((e) => (e.id === id ? { ...e, cookedAt } : e)))
                        )
                      }
                    >
                      {t("cooked.button")}
                    </button>
                  )}
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
              <div className="riso-eyebrow on-accent">{t(hero.eyebrow)}</div>
              <p>{tonightBlank ? t(hero.marked) : t(hero.nothing)}</p>
              <div className="riso-home-hero-actions">
                <button type="button" className="riso-btn hot" onClick={() => onNavigate("planner")}>
                  {t("home.addRecipe")}
                </button>
                {restaurantRecipe && !tonightBlank && (
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
              <span className="riso-home-grocery-unit wide">{t("home.allBought", { count: totalCount })}</span>
            </div>
          ) : (
            <div className="riso-home-grocery-count">
              <span className="home-grocery-number">{totalCount - checkedCount}</span>
              <span className="riso-home-grocery-unit">
                {totalCount === 0 ? t("home.nothingYet") : t("home.leftToGrab", { count: totalCount - checkedCount })}
              </span>
            </div>
          )}
          <div className="riso-home-grocery-track">
            <div className="riso-home-grocery-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="riso-home-grocery-line">
            {t("home.inCart", { checked: checkedCount, total: totalCount })}
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
          <div ref={stripRef} className={`riso-home-week-strip all-meals${stripWeekOffset === 1 ? " next" : ""}`}>
            {DAY_INDICES.map((d) => {
              const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
              const past = isPastDay(stripWeekStart, d);
              return (
                <div key={d} className={`riso-home-week-col${isToday ? " today" : ""}${past ? " past" : ""}`}>
                  <span className="riso-home-week-day-label">
                    {weekday.toUpperCase()} {dayNum}
                  </span>
                  {STRIP_MEALS.map((m) => {
                    const entry = mealFor(d, m.id);
                    const title = entry?.recipe.title;
                    // Today's meal that is on now gets the one pink shadow.
                    const current = isToday && m.id === nowMeal ? " current" : "";
                    return entry && !entry.recipe.isPlaceholder ? (
                      <button
                        key={m.id}
                        type="button"
                        className={`riso-home-week-meal${current}`}
                        title={`${m.label}: ${title}`}
                        onClick={(e) => onSelectRecipe(entry.recipe, e.currentTarget.getBoundingClientRect())}
                      >
                        <i>{m.short}</i>
                        <span>{title}</span>
                      </button>
                    ) : entry ? (
                      <div key={m.id} className={`riso-home-week-meal note${current}`} title={`${m.label}: ${title}`}>
                        <i>{m.short}</i>
                        <span>{title}</span>
                      </div>
                    ) : past ? (
                      <div key={m.id} className="riso-home-week-meal empty">
                        <i>{m.short}</i>
                        <span>—</span>
                      </div>
                    ) : (
                      <button
                        key={m.id}
                        type="button"
                        className={`riso-home-week-meal empty${current}`}
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
          <div ref={stripRef} className={`riso-home-week-strip${stripWeekOffset === 1 ? " next" : ""}`}>
            {DAY_INDICES.map((d) => {
              const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
              const entry = dinnerFor(d);
              // Days gone by: greyscale, muted, no shadow (and nothing to plan).
              const state = isToday ? " today" : isPastDay(stripWeekStart, d) ? " past" : "";
              // A custom note or "Restaurant" entry is the placeholder-recipe
              // mechanism (see isCustomNote/isBlankMarker in PlannerBoard.jsx)
              // - there's no real recipe or photo behind it, so it renders as
              // plain text with no click target, instead of a fake recipe card.
              const label = `${weekday.toUpperCase()} ${dayNum}`;
              return entry?.recipe.isPlaceholder ? (
                <div key={d} className={`riso-home-week-day note${state}`}>
                  <div className="riso-home-week-day-body">
                    <span className="riso-home-week-day-label">{label}</span>
                    <span className={`riso-home-week-day-title${LEADING_EMOJI.test(entry.recipe.title) ? " emoji" : ""}`}>
                      {entry.recipe.title}
                    </span>
                  </div>
                </div>
              ) : entry ? (
                <button
                  key={d}
                  type="button"
                  className={`riso-home-week-day${state}`}
                  onClick={(e) => onSelectRecipe(entry.recipe, e.currentTarget.getBoundingClientRect())}
                >
                  {entry.recipe.photoUrl ? (
                    <RecipePhoto src={entry.recipe.photoUrl} alt="" className="riso-home-week-day-photo" />
                  ) : (
                    <div className="riso-home-week-day-photo placeholder" />
                  )}
                  <div className="riso-home-week-day-body">
                    <span className="riso-home-week-day-label">{label}</span>
                    <span className="riso-home-week-day-title">{entry.recipe.title}</span>
                  </div>
                </button>
              ) : state === " past" ? (
                <div key={d} className="riso-home-week-day empty past">
                  <span className="riso-home-week-day-label">{label}</span>
                  <span className="riso-home-week-day-plan">—</span>
                </div>
              ) : (
                <button
                  key={d}
                  type="button"
                  className={`riso-home-week-day empty${state}`}
                  onClick={() => onNavigate("planner")}
                >
                  <span className="riso-home-week-day-label">{label}</span>
                  <span className="riso-home-week-day-plan">{t("home.plan")}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className={`riso-home-bottom-row${showMakeable ? " three" : ""}`}>
        <ProteinsOnSale
          deals={deals}
          recipes={recipes}
          onNavigate={onNavigate}
          onFindProtein={onFindProtein}
          onOpenFlyer={onOpenFlyerDeal}
          isOnGroceryList={isOnGroceryList}
          onAddToList={addToList}
          onRemoveFromList={removeFromList}
        />

        {showMakeable && (
          <section className="riso-home-mini riso-home-makeable">
            <div className="riso-home-mini-header">
              <h3>{t("home.makeableNow")}</h3>
              <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("makeable")}>
                {t("home.allLink")}
              </button>
            </div>
            <div className="riso-home-makeable-count">
              <span className="riso-home-makeable-num">{readyNow.length}</span>
              <span className="riso-home-makeable-sub">
                {t("home.readyNow")}
                <br />
                <span>{t("home.nearly", { count: nearly.length })}</span>
              </span>
            </div>
          </section>
        )}

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
              <div className="riso-home-useup-scroll">
                <ul className="riso-home-rows">
                  {useSoonItems.map((item) => (
                    <ToUseRow key={item.id} item={item} />
                  ))}
                </ul>
              </div>
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
                  onClick={() => onFindRecipes?.(useSoonest.map((i) => i.name).join(", "))}
                >
                  {t("home.cookWithThese")}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
