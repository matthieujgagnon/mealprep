import { useState } from "react";
import { core, findDealsFor, findRecipesByIngredients, findSaleDeal } from "../lib/similarRecipes.js";
import { useDeals } from "../lib/dealsStore.js";
import { SaleTag } from "./SaleTag.jsx";
import { daysUntil } from "../lib/pantryInventory.js";
import { Switch, HintStrip } from "./RisoControls.jsx";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, findNextEmptySlot, todayIndex } from "../lib/plannerSlots.js";
import { formatDayLabel, isCurrentWeek } from "../lib/dates.js";
import { hideBrokenPhoto } from "../lib/photos.js";

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
        ? "a blank card"
        : `"${taken.recipe.title}"`
      : taken.recipe?.title
    : null;

  return (
    <div className="riso-makeable-plan" role="group" aria-label={`Plan ${recipe.title}`}>
      <div className="riso-makeable-plan-head">
        <strong>Plan it</strong>
        <span>PICK A DAY AND A MEAL</span>
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
              aria-label={`${label} ${dayNum}${isToday ? " (today)" : ""}`}
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
        {takenLabel ? `Replaces ${takenLabel} in that slot.` : "That slot is free."}
      </p>
      <div className="riso-makeable-plan-actions">
        <button type="button" className="riso-makeable-plan-close" aria-label="Close" title="Close" onClick={onClose}>
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
          Plan for {DAY_SHORT[day]} · {MEAL_LABEL[meal]}
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
        {ready && <span className="riso-makeable-ready-sticker">nothing to buy!</span>}
      </button>
      <div className="riso-makeable-card-body">
        <div className="riso-makeable-card-info">
          <button type="button" className="riso-makeable-card-name" onClick={onOpen}>
            {recipe.title}
          </button>
          <div className="riso-makeable-card-meta">
            {totalTime > 0 && `${formatMinutes(totalTime)} · `}
            {ingredientCount} INGREDIENT{ingredientCount === 1 ? "" : "S"}
          </div>
          {atRiskUsed.length > 0 && (
            <div className="riso-makeable-card-uses">
              <span className="riso-makeable-uses-pill">use it up</span>
              <span>{atRiskUsed.join(", ")}</span>
            </div>
          )}
        </div>

        {!ready && (
          <div className="riso-makeable-need">
            <div className="riso-makeable-need-head">
              <span className="riso-makeable-need-title">
                You need <span className="riso-makeable-need-count">{missingIngredients.length}</span>
              </span>
              <span className="riso-makeable-need-hint">Add one at a time, or all at once</span>
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
                      aria-label={on ? `Remove ${name} from grocery list` : `Add ${name} to grocery list`}
                      title={on ? "On your grocery list" : "Add to grocery list"}
                    >
                      {on ? "✓ On list" : "+ Add"}
                    </button>
                  </li>
                );
              })}
              {hiddenCount > 0 && (
                <li className="riso-makeable-need-row more">
                  <span className="riso-makeable-need-name">
                    and {hiddenCount} more ingredient{hiddenCount === 1 ? "" : "s"}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="riso-makeable-actions">
          {ready ? (
            <button type="button" className="riso-makeable-action cook" onClick={onCookTonight}>
              Cook tonight
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
              {allOn ? "✓ All on your grocery list" : `+ Add all ${missingIngredients.length} to list`}
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
  const [expiringFirst, setExpiringFirst] = useState(true);
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

  const matches = combinedHave.length > 0 ? findRecipesByIngredients(combinedHave, recipes) : [];
  const withAtRisk = matches.map((m) => ({
    ...m,
    atRiskUsed: m.matchedIngredients.filter((n) => expiringCores.has(core(n))),
  }));

  function sortGroup(items) {
    if (!expiringFirst) return items;
    return [...items].sort((a, b) => {
      const aHas = a.atRiskUsed.length > 0 ? 0 : 1;
      const bHas = b.atRiskUsed.length > 0 ? 0 : 1;
      return aHas - bHas;
    });
  }

  const readyNow = sortGroup(withAtRisk.filter((m) => m.missingIngredients.length === 0));
  const oneOrTwoShort = sortGroup(
    withAtRisk.filter((m) => m.missingIngredients.length >= 1 && m.missingIngredients.length <= 2)
  );
  const needsAShop = sortGroup(withAtRisk.filter((m) => m.missingIngredients.length >= 3));

  const nextSlot = findNextEmptySlot(plannerEntries, weekStart);

  // "Plan" opens a day + meal picker (starting on the next empty slot); once
  // the recipe is on this week's plan the button says where - tapping it
  // again plans it somewhere else too.
  function planState(recipe) {
    const planned = plannerEntries.find((e) => e.recipe?.id === recipe.id);
    return {
      label: planned ? `✓ ${DAY_SHORT[planned.dayOfWeek]} · ${MEAL_LABEL[planned.mealType]}` : "Plan",
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
    { key: "ready", title: "Ready now", note: "NOTHING TO BUY", pillClass: "blue", items: readyNow },
    { key: "short", title: "One or two short", note: "QUICK TOP-UP", pillClass: "yellow", items: oneOrTwoShort },
    { key: "shop", title: "Needs a shop", note: "3 OR MORE MISSING", pillClass: "paper", items: needsAShop },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="riso-theme riso-makeable" data-theme="light">
      <div className="riso-makeable-heading">
        <div className="riso-eyebrow">RANKED BY HOW LITTLE YOU'D NEED TO BUY</div>
        <h1 className="riso-makeable-title">
          What can I <span className="accent">make?</span>
        </h1>
      </div>

      <HintStrip userId={user.id} screenKey="makeable-v2">
        Recipes are matched against what's in your Inventory. Each card lists what you still need; add
        items one by one, or all at once. Add anything else you have on hand below. "Use expiring items first" moves recipes that finish food expiring soon to the top
        of each group.
      </HintStrip>

      <section className="riso-makeable-controls">
        <div className="riso-makeable-toggles">
          <div className="riso-makeable-toggle">
            <Switch on={useInventory} onToggle={() => setUseInventory((v) => !v)} label="Use my inventory" />
            <span className="riso-makeable-toggle-label">Use my inventory</span>
            <span className="riso-makeable-toggle-meta">
              {pantryInventory.length} ITEM{pantryInventory.length === 1 ? "" : "S"}
            </span>
          </div>
          <div className="riso-makeable-toggle-divider" />
          <div className="riso-makeable-toggle">
            <Switch on={expiringFirst} onToggle={() => setExpiringFirst((v) => !v)} label="Use expiring items first" />
            <span className="riso-makeable-toggle-label">Use expiring items first</span>
          </div>
          <div className="riso-makeable-toggle-divider" />
          <div className="riso-makeable-toggle">
            <Switch on={showSales} onToggle={toggleShowSales} label="Show sale tags" />
            <span className="riso-makeable-toggle-label">Show sale tags</span>
          </div>
        </div>

        <form
          className="riso-makeable-also-have"
          onSubmit={(e) => {
            e.preventDefault();
            addAlsoHave(input);
          }}
        >
          <span className="riso-makeable-also-have-label">ALSO HAVE</span>
          {alsoHave.map((name) => (
            <span key={name} className="riso-makeable-also-have-chip">
              {name}
              <button type="button" onClick={() => removeAlsoHave(name)} aria-label={`Remove ${name}`}>
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            className="riso-makeable-also-have-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add an ingredient that isn't in your inventory, then press Enter"
          />
        </form>
      </section>

      {combinedHave.length === 0 ? (
        <p className="riso-makeable-empty">
          Turn on Use my inventory, or add a few ingredients above, to see what you can make.
        </p>
      ) : groups.length === 0 ? (
        <p className="riso-makeable-empty">No recipes match yet — try adding a few more ingredients.</p>
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
                  atRiskUsed={expiringFirst ? atRiskUsed : []}
                  onOpen={() => onSelectRecipe(recipe)}
                  onCookTonight={() => onSelectRecipe(recipe, null, true)}
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
