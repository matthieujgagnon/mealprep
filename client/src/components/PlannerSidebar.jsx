import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { Segmented } from "./RisoControls.jsx";
import {
  computeWeekOverlap,
  suggestNextRecipes,
  findRecipesByIngredients,
  findAtRiskPerishables,
  groupDealsByIngredient,
  core,
} from "../lib/similarRecipes.js";
import { capitalize } from "../lib/groceryList.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { findNextEmptySlot } from "./PlannerBoard.jsx";

const FULL_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Rendered via a portal straight to <body>, the same reason PlannerBoard's
// predecessor used one: a plain in-place popup lands inside whatever
// stacking/containing context its ancestors happen to create, which the
// sidebar (itself inside a flex row) very much has.
function RisoPopup({ heading, title, items, itemType, onClose, onOpenRecipe }) {
  return createPortal(
    <div className="modal-overlay riso-popup-overlay" onClick={onClose}>
      <div className="riso-popup" onClick={(e) => e.stopPropagation()}>
        <button className="riso-popup-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {heading && <p className="riso-popup-heading">{heading}</p>}
        <h3 className="riso-popup-title">{title}</h3>
        {itemType === "recipes" ? (
          <div className="riso-popup-recipe-list">
            {items.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="riso-popup-recipe-row"
                onClick={() => {
                  onOpenRecipe(recipe);
                  onClose();
                }}
              >
                {recipe.photoUrl && <img src={recipe.photoUrl} alt="" className="riso-popup-recipe-photo" />}
                <span>{recipe.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="riso-popup-ingredient-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}

function WeekOverviewTab({ plannerEntries, allRecipes, pantryInventory, onSelectIngredient, onQuickAdd, onOpenRecipe }) {
  const { savedItems, sharedIngredients } = computeWeekOverlap(plannerEntries, allRecipes);
  const activeMeals = plannerEntries.filter((e) => !e.isLeftover && !e.recipe?.isPlaceholder);

  if (activeMeals.length < 2) {
    return (
      <p className="riso-planner-empty">
        Add 2+ meals to the planner to see how many ingredients you're reusing across the week.
      </p>
    );
  }

  const nextSlot = findNextEmptySlot(plannerEntries);
  const suggestions = nextSlot ? suggestNextRecipes(plannerEntries, allRecipes, 3) : [];

  // A perishable this week's plan only uses once (so nothing else finishes
  // it off), cross-referenced against real inventory expiry — reuses
  // findAtRiskPerishables rather than inventing a second waste-tracking
  // system, per the design handoff's own note about this footnote.
  const atRiskCores = new Set(findAtRiskPerishables(plannerEntries, allRecipes).map((n) => n.toLowerCase()));
  let footnote = null;
  const expiringAtRisk = pantryInventory
    .filter((item) => item.expiresAt)
    .map((item) => ({ item, days: daysUntil(item.expiresAt) }))
    .filter(({ item, days }) => days >= 0 && days <= 3 && atRiskCores.has(core(item.name)))
    .sort((a, b) => a.days - b.days);
  if (expiringAtRisk.length > 0) {
    const { item, days } = expiringAtRisk[0];
    const itemCore = core(item.name);
    const usedEntry = plannerEntries.find(
      (e) =>
        !e.isLeftover &&
        !e.alreadyHave &&
        !e.recipe?.isPlaceholder &&
        e.recipe.ingredients?.some((ing) => core(ing.name) === itemCore)
    );
    const dayWord = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    footnote = usedEntry
      ? `${capitalize(itemCore)} expires ${dayWord} and only ${FULL_WEEKDAYS[usedEntry.dayOfWeek]}'s ${usedEntry.recipe.title} uses it.`
      : `${capitalize(itemCore)} expires ${dayWord} — use it up before it goes to waste.`;
  }

  return (
    <div className="riso-planner-overview">
      <div className="riso-planner-overview-score">
        <span className="riso-planner-overview-number">{savedItems}</span>
        <span className="riso-planner-overview-copy">
          ingredient{savedItems === 1 ? "" : "s"} shared across meals, so {savedItems} fewer thing
          {savedItems === 1 ? "" : "s"} to buy
        </span>
      </div>

      {sharedIngredients.size > 0 && (
        <div className="riso-planner-section">
          <p className="riso-planner-section-label">Shared this week</p>
          <div className="riso-planner-shared-row">
            {[...sharedIngredients.entries()].slice(0, 8).map(([c, recipes]) => (
              <button
                key={c}
                type="button"
                className="riso-planner-shared-chip"
                onClick={() => onSelectIngredient({ core: c, recipes })}
              >
                {capitalize(c)} · {recipes.length}
              </button>
            ))}
          </div>
        </div>
      )}

      {nextSlot && suggestions.length > 0 && (
        <div className="riso-planner-section">
          <p className="riso-planner-section-label">Good for {FULL_WEEKDAYS[nextSlot.dayOfWeek]}</p>
          <div className="riso-planner-suggestions">
            {suggestions.map(({ recipe, sharedIngredients: shared }) => (
              <div key={recipe.id} className="riso-planner-suggestion-row">
                <button type="button" className="riso-planner-suggestion-main" onClick={() => onOpenRecipe(recipe)}>
                  {recipe.photoUrl ? (
                    <img src={recipe.photoUrl} alt="" className="riso-planner-suggestion-photo" />
                  ) : (
                    <span className="riso-planner-suggestion-photo placeholder" />
                  )}
                  <span className="riso-planner-suggestion-info">
                    <span className="riso-planner-suggestion-name">{recipe.title}</span>
                    <span className="riso-planner-suggestion-why">
                      Reuses {shared.slice(0, 2).join(", ")}
                      {shared.length > 2 && ` +${shared.length - 2} more`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="riso-planner-suggestion-add"
                  aria-label={`Add ${recipe.title} to ${FULL_WEEKDAYS[nextSlot.dayOfWeek]}`}
                  onClick={() => onQuickAdd(recipe, nextSlot.dayOfWeek, nextSlot.mealType)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {footnote && <div className="riso-planner-footnote">{footnote}</div>}
    </div>
  );
}

function PlanAroundTab({
  plannerEntries,
  allRecipes,
  planAroundIngredients,
  onAddIngredient,
  onRemoveIngredient,
  onSetIngredients,
  pantryInventory,
  onQuickAdd,
  onOpenRecipe,
}) {
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [deals, setDeals] = useState([]);
  const [previewRecipe, setPreviewRecipe] = useState(null);

  useEffect(() => {
    api
      .getDeals()
      .then((d) => setDeals(d.deals))
      .catch(() => setDeals([]));
  }, []);

  const nextSlot = findNextEmptySlot(plannerEntries);

  const expiringItems = pantryInventory.filter(
    (item) => item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= 7
  );

  const dealGroups = groupDealsByIngredient(deals, allRecipes);
  const storeCounts = new Map();
  for (const deal of deals) storeCounts.set(deal.store, (storeCounts.get(deal.store) || 0) + 1);
  const topStore = [...storeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  function commitIngredient() {
    const name = ingredientDraft.trim();
    if (name) onAddIngredient(capitalize(name));
    setIngredientDraft("");
    setAddingIngredient(false);
  }

  const results = planAroundIngredients.length > 0 ? findRecipesByIngredients(planAroundIngredients, allRecipes) : [];

  return (
    <div className="riso-planner-around">
      <p className="riso-planner-around-intro">
        Pick ingredients to build the week around. The suggestions fill your empty slots.
      </p>

      <div className="riso-planner-ingredient-row">
        {planAroundIngredients.map((name) => (
          <span key={name} className="riso-planner-ingredient-chip">
            {name}
            <button type="button" onClick={() => onRemoveIngredient(name)} aria-label={`Remove ${name}`}>
              ×
            </button>
          </span>
        ))}
        {addingIngredient ? (
          <input
            autoFocus
            type="text"
            className="riso-planner-ingredient-input"
            value={ingredientDraft}
            placeholder="e.g. shrimp"
            onChange={(e) => setIngredientDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitIngredient();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setAddingIngredient(false);
                setIngredientDraft("");
              }
            }}
            onBlur={commitIngredient}
          />
        ) : (
          <button type="button" className="riso-planner-add-ingredient-chip" onClick={() => setAddingIngredient(true)}>
            + Ingredient
          </button>
        )}
      </div>

      <p className="riso-planner-section-label">Quick picks</p>
      <div className="riso-planner-quickpicks">
        <button
          type="button"
          className="riso-planner-quickpick-row"
          disabled={expiringItems.length === 0}
          onClick={() => onSetIngredients(expiringItems.map((i) => capitalize(i.name)))}
        >
          <span>Expiring this week</span>
          <span className="riso-planner-quickpick-badge pink">{expiringItems.length} items</span>
        </button>
        <button
          type="button"
          className="riso-planner-quickpick-row"
          disabled={dealGroups.length === 0}
          onClick={() => onSetIngredients(dealGroups.map((g) => g.label))}
        >
          <span>On sale{topStore ? ` at ${topStore}` : ""}</span>
          <span className="riso-planner-quickpick-badge green">{dealGroups.length} items</span>
        </button>
      </div>

      {planAroundIngredients.length === 0 ? (
        <p className="riso-planner-empty">Add an ingredient, or use a quick pick, to see recipe suggestions.</p>
      ) : results.length === 0 ? (
        <p className="riso-planner-empty">No recipes match those ingredients yet.</p>
      ) : (
        <div className="riso-planner-suggestions">
          {results.slice(0, 12).map(({ recipe, matchedCount, totalCount, missingIngredients }) => (
            <div key={recipe.id} className="riso-planner-suggestion-row">
              <button
                type="button"
                className="riso-planner-suggestion-main"
                onClick={() => setPreviewRecipe({ recipe, matchedCount, totalCount, missingIngredients })}
              >
                {recipe.photoUrl ? (
                  <img src={recipe.photoUrl} alt="" className="riso-planner-suggestion-photo" />
                ) : (
                  <span className="riso-planner-suggestion-photo placeholder" />
                )}
                <span className="riso-planner-suggestion-info">
                  <span className="riso-planner-suggestion-name">{recipe.title}</span>
                  <span className="riso-planner-suggestion-why">
                    {matchedCount} of {totalCount} ingredients
                  </span>
                </span>
              </button>
              {nextSlot && (
                <button
                  type="button"
                  className="riso-planner-suggestion-add"
                  aria-label={`Add ${recipe.title} to ${FULL_WEEKDAYS[nextSlot.dayOfWeek]}`}
                  onClick={() => onQuickAdd(recipe, nextSlot.dayOfWeek, nextSlot.mealType)}
                >
                  +
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {previewRecipe && (
        <RisoPopup
          heading={`Uses ${previewRecipe.matchedCount} of ${previewRecipe.totalCount} ingredients you picked`}
          title={previewRecipe.recipe.title}
          items={
            previewRecipe.missingIngredients.length > 0
              ? previewRecipe.missingIngredients
              : ["Nothing missing — you picked them all."]
          }
          itemType="ingredients"
          onClose={() => setPreviewRecipe(null)}
          onOpenRecipe={onOpenRecipe}
        />
      )}
    </div>
  );
}

export function PlannerSidebar({
  plannerEntries,
  allRecipes,
  planAroundIngredients = [],
  onAddIngredient,
  onRemoveIngredient,
  onSetIngredients,
  pantryInventory = [],
  onSelectRecipe,
  onQuickAdd,
}) {
  const [mode, setMode] = useState("overview");
  const [popup, setPopup] = useState(null); // { heading, title, items, itemType }

  function openIngredientDetails({ core: c, recipes }) {
    setPopup({
      heading: `Used in ${recipes.length} recipe${recipes.length !== 1 ? "s" : ""} this week`,
      title: capitalize(c),
      items: recipes,
      itemType: "recipes",
    });
  }

  return (
    <aside className="riso-planner-sidebar">
      <Segmented
        options={[
          { id: "overview", label: "Week overview" },
          { id: "around", label: "Plan around…" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "overview" ? (
        <WeekOverviewTab
          plannerEntries={plannerEntries}
          allRecipes={allRecipes}
          pantryInventory={pantryInventory}
          onSelectIngredient={openIngredientDetails}
          onQuickAdd={onQuickAdd}
          onOpenRecipe={onSelectRecipe}
        />
      ) : (
        <PlanAroundTab
          plannerEntries={plannerEntries}
          allRecipes={allRecipes}
          planAroundIngredients={planAroundIngredients}
          onAddIngredient={onAddIngredient}
          onRemoveIngredient={onRemoveIngredient}
          onSetIngredients={onSetIngredients}
          pantryInventory={pantryInventory}
          onQuickAdd={onQuickAdd}
          onOpenRecipe={onSelectRecipe}
        />
      )}

      {popup && (
        <RisoPopup
          heading={popup.heading}
          title={popup.title}
          items={popup.items}
          itemType={popup.itemType}
          onClose={() => setPopup(null)}
          onOpenRecipe={onSelectRecipe}
        />
      )}
    </aside>
  );
}
