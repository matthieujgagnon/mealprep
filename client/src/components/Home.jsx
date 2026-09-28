import { useEffect, useState } from "react";
import { api } from "../api.js";
import { currentWeekStart, formatDayLabel, shiftWeek } from "../lib/dates.js";
import { buildGroceryList, findMatchingDeal, canonicalize } from "../lib/groceryList.js";
import { findRecipesByIngredients } from "../lib/similarRecipes.js";
import { daysUntil, formatExpiry } from "../lib/pantryInventory.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const RESTAURANT_TITLE = "🍽️ Restaurant";

// Small deterministic rotation set for the Riso Poster "stickers" - a
// fixed-angle sticker looks static/printed, but a fully random one would
// re-roll (and visually jitter) on every re-render.
const STICKER_ROTATIONS = [-5, 3, -2];

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
function buildCombinedHave(pantryInventory, customStaples) {
  const inStock = pantryInventory
    .filter((item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0)
    .map((item) => item.name);
  const haveLower = new Set(inStock.map((n) => n.toLowerCase()));
  const stapleExtra = (customStaples || []).filter((s) => !haveLower.has(s.toLowerCase()));
  return [...inStock, ...stapleExtra];
}

// True when this expiring item's core ingredient appears in any recipe
// planned for the current week — used for "Use it up"'s footer nudge.
function usedThisWeek(itemName, plannerEntries) {
  const core = canonicalize(itemName).core;
  return plannerEntries.some(
    (e) => !isBlankMarker(e) && e.recipe.ingredients?.some((i) => canonicalize(i.name).core === core)
  );
}

function StickerCircle({ item, index, tone }) {
  const days = daysUntil(item.expiresAt);
  const unit = days === 1 ? "DAY" : "DAYS";
  return (
    <div
      className={`riso-sticker-circle ${tone}`}
      style={{ transform: `rotate(${STICKER_ROTATIONS[index]}deg)` }}
    >
      <span className="riso-sticker-circle-num">{Math.max(0, days)}</span>
      <span className="riso-sticker-circle-unit">{unit}</span>
    </div>
  );
}

function MakeableRow({ recipe, onOpen }) {
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  return (
    <button type="button" className="riso-makeable-row" onClick={() => onOpen(recipe)}>
      {recipe.photoUrl ? (
        <img src={recipe.photoUrl} alt="" className="riso-makeable-row-thumb" />
      ) : (
        <div className="riso-makeable-row-thumb placeholder">{recipe.title[0]}</div>
      )}
      <span className="riso-makeable-row-title">{recipe.title}</span>
      {totalTime > 0 && <span className="riso-makeable-row-time">{totalTime} min</span>}
    </button>
  );
}

function PriceTag({ deal, index }) {
  const rotation = index % 2 === 0 ? 1.5 : -1.5;
  const [amount, ...unitParts] = deal.price.split("/");
  const unit = unitParts.length ? `/${unitParts.join("/")}` : "";
  return (
    <div className="riso-price-tag" style={{ transform: `rotate(${rotation}deg)` }}>
      <span className="riso-price-tag-hole" />
      <div className="riso-price-tag-inner">
        <span className="riso-price-tag-amount">
          {amount}
          {unit && <span className="riso-price-tag-unit">{unit}</span>}
        </span>
        <span className="riso-price-tag-body">
          <span className="riso-price-tag-item">{deal.item}</span>
          <span className="riso-price-tag-store">{deal.store}</span>
        </span>
      </div>
    </div>
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
}) {
  const weekStart = currentWeekStart();
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0

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
  const tonightAllHave = !!tonightMatch && tonightMatch.missingIngredients.length === 0;

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

  const useSoonItems = pantryInventory
    .filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
    .slice(0, 3);
  const soonestUnused = useSoonItems.length > 0 && !usedThisWeek(useSoonItems[0].name, plannerEntries) ? useSoonItems[0] : null;

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
              nothing to buy!
            </span>
          )}
          {tonightEntry ? (
            <div className="riso-home-hero-body">
              {tonightEntry.recipe.photoUrl ? (
                <img src={tonightEntry.recipe.photoUrl} alt="" className="riso-home-hero-photo" />
              ) : (
                <div className="riso-home-hero-photo placeholder">no photo</div>
              )}
              <div className="riso-home-hero-info">
                <div className="riso-eyebrow on-accent">Tonight · Supper</div>
                <h2 className="riso-home-hero-title">{tonightEntry.recipe.title}</h2>
                <p className="riso-home-hero-blurb">
                  {tonightEntry.recipe.isPlaceholder
                    ? "Eating out tonight."
                    : tonightMatch
                    ? `You have all ${tonightMatch.totalCount} ingredients.`
                    : tonightEntry.recipe.ingredients?.length
                    ? "You're missing some ingredients for this one."
                    : null}
                </p>
                <div className="riso-home-hero-actions">
                  <button
                    type="button"
                    className="riso-btn hot"
                    onClick={() => onSelectRecipe(tonightEntry.recipe, null, true)}
                  >
                    Start cooking
                  </button>
                  {!tonightEntry.recipe.isPlaceholder && (
                    <button type="button" className="riso-btn outline-on-accent" onClick={() => onNavigate("planner")}>
                      Swap
                    </button>
                  )}
                  {!tonightEntry.recipe.isPlaceholder && restaurantRecipe && (
                    <button type="button" className="riso-btn outline-on-accent" onClick={handleEatingOut}>
                      Eating out
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="riso-home-hero-empty">
              <div className="riso-eyebrow on-accent">Tonight · Supper</div>
              <p>{tonightBlank ? "Marked as no meal planned tonight." : "Nothing planned for tonight yet."}</p>
              <div className="riso-home-hero-actions">
                <button type="button" className="riso-btn hot" onClick={() => onNavigate("planner")}>
                  Add a recipe
                </button>
                {restaurantRecipe && (
                  <button type="button" className="riso-btn outline-on-accent" onClick={handleEatingOut}>
                    Eating out
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="riso-home-grocery">
          <div className="riso-eyebrow on-pink">Grocery list</div>
          <div className="riso-home-grocery-count">
            <span className="home-grocery-number">{toBuy.length}</span>
            <span className="riso-home-grocery-unit">things to grab this week</span>
          </div>
          <div className="riso-home-grocery-track">
            <div className="riso-home-grocery-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="riso-home-grocery-line">
            {checkedCount} in the cart{saleCount > 0 ? ` · ${saleCount} on sale` : ""}
          </p>
          <button type="button" className="riso-btn ink full" onClick={() => onNavigate("grocery")}>
            Open list →
          </button>
        </section>
      </div>

      <section className="riso-home-week">
        <div className="riso-home-week-header">
          <h3>
            {stripWeekOffset === 0 ? "This week's" : "Next week's"} suppers{" "}
            <span className="riso-home-week-sub">
              · {DAY_INDICES.filter((d) => dinnerFor(d)).length} of 7 planned
            </span>
          </h3>
          <div className="riso-chip-row">
            <button
              type="button"
              className={`riso-chip small${stripWeekOffset === 0 ? " active" : ""}`}
              onClick={() => setStripWeekOffset(0)}
            >
              This week
            </button>
            <button
              type="button"
              className={`riso-chip small${stripWeekOffset === 1 ? " active" : ""}`}
              onClick={() => setStripWeekOffset(1)}
            >
              Next week
            </button>
          </div>
        </div>
        <div className="riso-home-week-strip">
          {DAY_INDICES.map((d) => {
            const { weekday, dayNum, isToday } = formatDayLabel(stripWeekStart, d);
            const entry = dinnerFor(d);
            return entry ? (
              <button
                key={d}
                type="button"
                className={`riso-home-week-day${isToday ? " today" : ""}`}
                onClick={() => onSelectRecipe(entry.recipe)}
              >
                {entry.recipe.photoUrl ? (
                  <img src={entry.recipe.photoUrl} alt="" className="riso-home-week-day-photo" />
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
            ) : (
              <button
                key={d}
                type="button"
                className={`riso-home-week-day empty${isToday ? " today" : ""}`}
                onClick={() => onNavigate("planner")}
              >
                <span className="riso-home-week-day-label">
                  {weekday.toUpperCase()} {dayNum}
                </span>
                <span className="riso-home-week-day-plan">+ plan</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="riso-home-bottom-row">
        <section className="riso-home-mini">
          <div className="riso-home-mini-header">
            <h3>Use it up</h3>
            <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("inventory")}>
              Inventory →
            </button>
          </div>
          {useSoonItems.length === 0 ? (
            <p className="riso-empty-note">Nothing expiring soon.</p>
          ) : (
            <>
              <div className="riso-sticker-grid">
                {useSoonItems.map((item, i) => (
                  <div key={item.id} className="riso-sticker-cell">
                    <StickerCircle item={item} index={i} tone={i === 0 ? "pink" : i === 1 ? "yellow" : "plain"} />
                    <span className="riso-sticker-cell-name">{item.name}</span>
                  </div>
                ))}
              </div>
              {soonestUnused && (
                <p className="riso-home-mini-footer">
                  {soonestUnused.name} isn't in any meal this week.{" "}
                  <button type="button" className="riso-home-mini-link" onClick={() => onFindRecipes?.(soonestUnused.name)}>
                    Find a recipe
                  </button>
                </p>
              )}
            </>
          )}
        </section>

        <section className="riso-home-mini">
          <div className="riso-home-mini-header">
            <h3>Makeable now</h3>
            <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("makeable")}>
              All →
            </button>
          </div>
          {makeableNow.length === 0 ? (
            <p className="riso-empty-note">Nothing fully makeable with what's on hand yet.</p>
          ) : (
            <div className="home-makeable-list">
              {makeableNow.map(({ recipe }) => (
                <MakeableRow key={recipe.id} recipe={recipe} onOpen={onSelectRecipe} />
              ))}
            </div>
          )}
        </section>

        <section className="riso-home-mini">
          <div className="riso-home-mini-header">
            <h3>On sale</h3>
            <button type="button" className="riso-home-mini-link" onClick={() => onNavigate("flyers")}>
              Flyers →
            </button>
          </div>
          {deals.length === 0 ? (
            <p className="riso-empty-note">No flyer deals loaded yet.</p>
          ) : (
            <div className="riso-price-tag-list">
              {dealsShown.map((d, i) => (
                <PriceTag key={d.id} deal={d} index={i} />
              ))}
            </div>
          )}
          {topDealMatch && (
            <p className="riso-home-mini-footer">
              {topDealMatch.matches.length} of your recipes use {topDealMatch.item.toLowerCase()}.{" "}
              <button
                type="button"
                className="riso-home-mini-link"
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
