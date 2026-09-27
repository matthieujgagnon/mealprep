import { useEffect, useState } from "react";
import { api } from "../api.js";
import { MealCard } from "./MealCard.jsx";
import { currentWeekStart, formatDayLabel, shiftWeek } from "../lib/dates.js";
import { buildGroceryList, findMatchingDeal } from "../lib/groceryList.js";
import { findRecipesByIngredients } from "../lib/similarRecipes.js";
import { daysUntil, formatExpiry } from "../lib/pantryInventory.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const RESTAURANT_TITLE = "🍽️ Restaurant";
const THEME_STORAGE_KEY = "mealprep-home-theme";

// Home has its own light/dark toggle, independent of the rest of the app
// (which stays on the fixed dark theme) — scoped to this page only, so the
// preference lives in its own localStorage key rather than the server.
function loadStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "dark";
  } catch {
    return "dark";
  }
}

// Recipes with an ingredient matching this deal — same crude word-overlap
// heuristic findMatchingDeal uses, just checked from the other side (find
// recipes for a deal, instead of a deal for one ingredient). Also keeps the
// matching ingredient's own name off each hit: the deal's own text (e.g.
// "Boneless chicken breast") is usually a poor search query for
// matchesRecipeSearch's substring check — a shorter recipe ingredient name
// like "chicken breast" is a substring of the deal text, not the reverse,
// so passing the deal text back in as a search query would go the wrong way.
function matchRecipesForDeal(deal, recipes) {
  return recipes
    .map((recipe) => ({ recipe, ingredientName: recipe.ingredients?.find((i) => findMatchingDeal(i.name, [deal]))?.name }))
    .filter((m) => m.ingredientName);
}

function isBlankMarker(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title === "No meal planned";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Everything that counts as "have" without being typed in — same rule
// WhatCanIMake.jsx uses: non-expired inventory, plus custom pantry staples.
// Kept independent here rather than imported, since Home only ever needs
// the plain combined list (no typed-in quick list, no exclusion toggles).
function buildCombinedHave(pantryInventory, customStaples) {
  const inStock = pantryInventory
    .filter((item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0)
    .map((item) => item.name);
  const haveLower = new Set(inStock.map((n) => n.toLowerCase()));
  const stapleExtra = (customStaples || []).filter((s) => !haveLower.has(s.toLowerCase()));
  return [...inStock, ...stapleExtra];
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
}) {
  const weekStart = currentWeekStart();
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0

  const [theme, setTheme] = useState(loadStoredTheme);
  const [plannerEntries, setPlannerEntries] = useState([]);
  const [checked, setChecked] = useState({});
  const [extraItems, setExtraItems] = useState([]);
  const [deals, setDeals] = useState([]);

  // The week strip can look ahead to next week without disturbing the
  // "tonight" card or the grocery card above, which are always about the
  // real current week.
  const [stripWeekOffset, setStripWeekOffset] = useState(0);
  const stripWeekStart = shiftWeek(weekStart, stripWeekOffset);
  const [stripEntries, setStripEntries] = useState([]);

  useEffect(() => {
    api.listPlanner(weekStart).then(setPlannerEntries).catch(() => setPlannerEntries([]));
    api
      .listGroceryChecked(weekStart)
      .then((cores) => setChecked(Object.fromEntries(cores.map((c) => [c, true]))))
      .catch(() => setChecked({}));
    api.listGroceryExtras(weekStart).then(setExtraItems).catch(() => setExtraItems([]));
    api.getDeals().then((d) => setDeals(d.deals)).catch(() => setDeals([]));
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

  function toggleTheme(next) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private browsing, etc.) — theme just
      // won't persist across visits, which is fine as a fallback.
    }
  }

  const restaurantRecipe = recipes.find((r) => r.isPlaceholder && r.title === RESTAURANT_TITLE);

  const combinedHave = buildCombinedHave(pantryInventory, customStaples);
  const makeableResults = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes) : [];
  const makeableNow = makeableResults.filter((m) => m.missingIngredients.length === 0).slice(0, 3);

  const groceryItems = buildGroceryList(plannerEntries, customStaples, {}, excludedStaples, extraItems);
  const toBuy = groceryItems.filter((i) => !i.isStaple);
  const checkedCount = toBuy.filter((i) => checked[i.core]).length;
  const saleCount = toBuy.filter((i) => !checked[i.core] && findMatchingDeal(i.name, deals)).length;
  const progressPct = toBuy.length > 0 ? Math.round((checkedCount / toBuy.length) * 100) : 0;

  const todaysDinner = plannerEntries.filter((e) => e.dayOfWeek === todayIndex && e.mealType === "dinner");
  const tonightBlank = todaysDinner.some(isBlankMarker);
  const tonightEntry = todaysDinner.find((e) => !isBlankMarker(e));
  const tonightMatch = tonightEntry ? makeableResults.find((m) => m.recipe.id === tonightEntry.recipe.id) : null;

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

  const dealsShown = deals.slice(0, 3).map((d) => ({ ...d, matches: matchRecipesForDeal(d, recipes) }));
  const topDealMatch = dealsShown.filter((d) => d.matches.length > 0).sort((a, b) => b.matches.length - a.matches.length)[0];

  return (
    <div className="home-page" data-theme={theme}>
      <div className="home-greeting">
        <div className="home-greeting-text">
          <h1 className="home-greeting-title">
            {greeting()}, {user.name || user.email.split("@")[0]}
          </h1>
          <span className="home-greeting-date">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
        </div>
        <button
          type="button"
          className="home-theme-toggle"
          onClick={() => toggleTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch Home to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className={`home-theme-toggle-pill${theme === "light" ? " active" : ""}`}>Light</span>
          <span className={`home-theme-toggle-pill${theme === "dark" ? " active" : ""}`}>Dark</span>
        </button>
      </div>

      <div className="home-top-row">
        <section className="home-card home-tonight-card">
          <div className="home-eyebrow">Tonight · Supper</div>
          {tonightEntry ? (
            <div className="home-tonight-body">
              {tonightEntry.recipe.photoUrl ? (
                <img src={tonightEntry.recipe.photoUrl} alt="" className="home-tonight-photo" />
              ) : (
                <div className="home-tonight-photo placeholder">no photo</div>
              )}
              <div className="home-tonight-info">
                <h2 className="home-tonight-title">{tonightEntry.recipe.title}</h2>
                <p className="home-tonight-blurb">
                  {tonightEntry.recipe.isPlaceholder
                    ? "Eating out tonight."
                    : tonightMatch
                    ? `You have all ${tonightMatch.totalCount} ingredients.`
                    : tonightEntry.recipe.ingredients?.length
                    ? `You're missing some ingredients for this one.`
                    : null}
                </p>
                <div className="home-eyebrow home-tonight-stats">
                  {[
                    (tonightEntry.recipe.prepTimeMinutes || 0) + (tonightEntry.recipe.cookTimeMinutes || 0) > 0 &&
                      `${(tonightEntry.recipe.prepTimeMinutes || 0) + (tonightEntry.recipe.cookTimeMinutes || 0)} min`,
                    tonightEntry.recipe.ingredients?.length && `${tonightEntry.recipe.ingredients.length} ingredients`,
                    tonightEntry.recipe.baseServings && `serves ${tonightEntry.recipe.baseServings}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="home-tonight-actions">
                  <button type="button" className="btn primary" onClick={() => onSelectRecipe(tonightEntry.recipe)}>
                    Open recipe
                  </button>
                  {!tonightEntry.recipe.isPlaceholder && (
                    <button type="button" className="btn subtle" onClick={() => onNavigate("planner")}>
                      Swap meal
                    </button>
                  )}
                  {!tonightEntry.recipe.isPlaceholder && restaurantRecipe && (
                    <button type="button" className="btn subtle" onClick={handleEatingOut}>
                      Eating out
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="home-tonight-empty">
              <p>{tonightBlank ? "Marked as no meal planned tonight." : "Nothing planned for tonight yet."}</p>
              <div className="home-tonight-actions">
                <button type="button" className="btn primary" onClick={() => onNavigate("planner")}>
                  Add a recipe
                </button>
                {restaurantRecipe && (
                  <button type="button" className="btn subtle" onClick={handleEatingOut}>
                    Eating out
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="home-card home-grocery-card">
          <div className="home-card-header">
            <h3>Grocery list</h3>
            <button type="button" className="home-card-link" onClick={() => onNavigate("grocery")}>
              Open →
            </button>
          </div>
          <div className="home-grocery-count">
            <span className="home-grocery-number">{toBuy.length}</span>
            <span className="home-grocery-unit">items for this week</span>
          </div>
          <div className="home-progress-track">
            <div className="home-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="home-eyebrow">
            {checkedCount} of {toBuy.length} checked off
          </div>
          {saleCount > 0 && (
            <p className="home-grocery-sale">
              {saleCount} item{saleCount === 1 ? "" : "s"} on your list {saleCount === 1 ? "is" : "are"} on sale this
              week.
            </p>
          )}
        </section>
      </div>

      <section className="home-card home-week-card">
        <div className="home-card-header">
          <h3>
            {stripWeekOffset === 0 ? "This week's" : "Next week's"} suppers{" "}
            <span className="home-card-header-sub">
              · {DAY_INDICES.filter((d) => dinnerFor(d)).length} of 7 planned
            </span>
          </h3>
          <button type="button" className="home-card-link" onClick={() => onNavigate("planner")}>
            Open planner →
          </button>
        </div>
        <div className="home-week-toggle">
          <button
            type="button"
            className={`home-week-toggle-btn${stripWeekOffset === 0 ? " active" : ""}`}
            onClick={() => setStripWeekOffset(0)}
          >
            This week
          </button>
          <button
            type="button"
            className={`home-week-toggle-btn${stripWeekOffset === 1 ? " active" : ""}`}
            onClick={() => setStripWeekOffset(1)}
          >
            Next week
          </button>
        </div>
        <div className="home-week-strip">
          {DAY_INDICES.map((d) => {
            const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
            const entry = dinnerFor(d);
            return entry ? (
              <button
                key={d}
                type="button"
                className={`home-week-day${isToday ? " today" : ""}`}
                onClick={() => onSelectRecipe(entry.recipe)}
              >
                {entry.recipe.photoUrl ? (
                  <img src={entry.recipe.photoUrl} alt="" className="home-week-day-photo" />
                ) : (
                  <div className="home-week-day-photo placeholder" />
                )}
                <div className="home-week-day-body">
                  <span className="home-week-day-label">{weekday.toUpperCase()} {dayNum}</span>
                  <span className="home-week-day-title">{entry.recipe.title}</span>
                </div>
              </button>
            ) : (
              <button
                key={d}
                type="button"
                className={`home-week-day empty${isToday ? " today" : ""}`}
                onClick={() => onNavigate("planner")}
              >
                <span className="home-week-day-label">{weekday.toUpperCase()} {dayNum}</span>
                <span className="home-week-day-plan">+ Plan</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="home-bottom-row">
        <section className="home-card home-mini-card">
          <div className="home-card-header">
            <h3>Use soon</h3>
            <button type="button" className="home-card-link" onClick={() => onNavigate("inventory")}>
              Inventory →
            </button>
          </div>
          {pantryInventory.filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0).length === 0 ? (
            <p className="home-empty-note">Nothing expiring soon.</p>
          ) : (
            <div className="home-use-soon-list">
              {pantryInventory
                .filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0)
                .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
                .slice(0, 3)
                .map((item) => (
                  <div key={item.id} className="home-use-soon-row">
                    <span>{item.name}</span>
                    <span className={`home-expiry-badge${daysUntil(item.expiresAt) <= 1 ? " soon" : ""}`}>
                      {formatExpiry(item.expiresAt)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="home-card home-mini-card">
          <div className="home-card-header">
            <h3>Makeable now</h3>
            <button type="button" className="home-card-link" onClick={() => onNavigate("makeable")}>
              All →
            </button>
          </div>
          {makeableNow.length === 0 ? (
            <p className="home-empty-note">Nothing fully makeable with what's on hand yet.</p>
          ) : (
            <div className="home-makeable-list">
              {makeableNow.map(({ recipe }) => (
                <MealCard key={recipe.id} recipe={recipe} compact onClick={() => onSelectRecipe(recipe)} />
              ))}
            </div>
          )}
        </section>

        <section className="home-card home-mini-card">
          <div className="home-card-header">
            <h3>On sale this week</h3>
            <button type="button" className="home-card-link" onClick={() => onNavigate("flyers")}>
              Flyers →
            </button>
          </div>
          {deals.length === 0 ? (
            <p className="home-empty-note">No flyer deals loaded yet.</p>
          ) : (
            <div className="home-sale-list">
              {dealsShown.map((d) => (
                <div key={d.id} className="home-sale-row">
                  <span>{d.item}</span>
                  <span className="home-sale-price">{d.price}</span>
                </div>
              ))}
            </div>
          )}
          {topDealMatch && (
            <p className="home-sale-footer">
              {topDealMatch.matches.length} of your recipes use {topDealMatch.item.toLowerCase()}.{" "}
              <button
                type="button"
                className="home-card-link"
                onClick={() => onFindRecipes?.(topDealMatch.matches[0].ingredientName)}
              >
                See them →
              </button>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
