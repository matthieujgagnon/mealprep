import { useState } from "react";
import { createPortal } from "react-dom";
import { useDraggable } from "@dnd-kit/core";
import { findSimilarRecipes, computeWeekOverlap, suggestNextRecipes } from "../lib/similarRecipes.js";
import { capitalize } from "../lib/groceryList.js";

// A draggable, clickable reference to a recipe shown inside the popup —
// lets you drag a result straight onto an empty planner slot instead of
// closing the popup, finding the recipe in the grid, and starting a new
// drag from scratch.
function PopupRecipeChip({ recipe, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `popup-recipe-${recipe.id}`,
    data: { recipe },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 60 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`popup-recipe-chip${isDragging ? " dragging" : ""}`}
      onClick={() => onOpen(recipe)}
      {...listeners}
      {...attributes}
    >
      {recipe.photoUrl && <img src={recipe.photoUrl} alt="" className="popup-recipe-chip-photo" />}
      <span className="popup-recipe-chip-title">{recipe.title}</span>
    </div>
  );
}

// Rendered via a portal straight to <body> — see the note that used to live
// here: a plain in-place "position: fixed" popup was landing inside
// whatever stacking/containing context its ancestors happened to create.
// Positioned toward a corner rather than dead-center so more of the
// planner board stays visible behind it — relevant now that its contents
// can include something you might want to drag onto that board.
function Popup({ heading, title, items, itemType, onClose, onOpenRecipe }) {
  return createPortal(
    <div className="modal-overlay popup-overlay" onClick={onClose}>
      <div className="card shared-ingredients-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {heading && <p className="shared-ingredients-context">{heading}</p>}
        <h3 className="shared-ingredients-title">{title}</h3>
        {itemType === "recipes" ? (
          <div className="popup-recipe-list">
            {items.map((recipe) => (
              <PopupRecipeChip
                key={recipe.id}
                recipe={recipe}
                onOpen={(r) => {
                  onOpenRecipe(r);
                  onClose();
                }}
              />
            ))}
          </div>
        ) : (
          <ul className="shared-ingredients-list">
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

function SidebarRecipeChip({ recipe, sharedIngredients, onOpenDetails, onAddAnchor }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sidebar-recipe-${recipe.id}`,
    data: { recipe },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sidebar-recipe-chip${isDragging ? " dragging" : ""}`}
      onClick={() => onOpenDetails({ recipe, sharedIngredients })}
      {...listeners}
      {...attributes}
    >
      {recipe.photoUrl && (
        <img src={recipe.photoUrl} alt="" className="sidebar-chip-photo" />
      )}
      <div className="sidebar-chip-info">
        <span className="sidebar-chip-title">{recipe.title}</span>
        <span className="sidebar-chip-shared">
          {sharedIngredients.slice(0, 3).join(", ")}
          {sharedIngredients.length > 3 && ` +${sharedIngredients.length - 3} more`}
        </span>
      </div>
      {onAddAnchor && (
        <button
          type="button"
          className="sidebar-chip-add-anchor"
          title="Also plan around this recipe"
          onClick={(e) => {
            e.stopPropagation();
            onAddAnchor(recipe);
          }}
        >
          +
        </button>
      )}
      <span className="sidebar-chip-count">{sharedIngredients.length}</span>
    </div>
  );
}

function OverlapScore({ plannerEntries, allRecipes, onSelectIngredient, onSelectRecipe }) {
  const { totalUnique, savedItems, overlapScore, sharedIngredients } =
    computeWeekOverlap(plannerEntries, allRecipes);

  const activeMeals = plannerEntries.filter((e) => !e.isLeftover);
  const suggestions = suggestNextRecipes(plannerEntries, allRecipes, 3);

  if (activeMeals.length < 2) {
    return (
      <div className="sidebar-empty">
        Add 2+ meals to the planner to see your ingredient reuse score.
      </div>
    );
  }

  const scoreColor =
    overlapScore >= 40 ? "var(--sage)" : overlapScore >= 20 ? "var(--tomato)" : "var(--paper-soft)";

  return (
    <div className="sidebar-overlap">
      <div className="sidebar-overlap-score" style={{ color: scoreColor }}>
        <span className="sidebar-overlap-number">{overlapScore}%</span>
        <span className="sidebar-overlap-label">ingredient reuse</span>
      </div>
      <p className="sidebar-overlap-detail">
        {totalUnique} unique ingredients this week.{" "}
        {savedItems > 0 ? (
          <>You're reusing <strong>{savedItems}</strong> ingredient{savedItems !== 1 ? "s" : ""} across meals — that's {savedItems} fewer things to buy.</>
        ) : (
          "No ingredients shared yet — try adding more meals."
        )}
      </p>
      {sharedIngredients.size > 0 && (
        <>
          <p className="sidebar-section-label">Shared this week</p>
          <div className="sidebar-shared-tags">
            {[...sharedIngredients.entries()].slice(0, 8).map(([c, recipes]) => (
              <button
                key={c}
                type="button"
                className="sidebar-shared-tag"
                onClick={() => onSelectIngredient({ core: c, recipes })}
              >
                {capitalize(c)}
              </button>
            ))}
          </div>
        </>
      )}
      {suggestions.length > 0 && (
        <>
          <p className="sidebar-section-label">Good next addition</p>
          <div className="sidebar-suggestions">
            {suggestions.map(({ recipe, sharedIngredients: shared }) => (
              <button
                key={recipe.id}
                type="button"
                className="sidebar-suggestion"
                onClick={() => onSelectRecipe(recipe, shared)}
              >
                {recipe.photoUrl && (
                  <img src={recipe.photoUrl} alt="" className="sidebar-chip-photo" />
                )}
                <div className="sidebar-chip-info">
                  <span className="sidebar-chip-title">{recipe.title}</span>
                  <span className="sidebar-chip-shared">
                    Reuses {shared.slice(0, 2).join(", ")}
                    {shared.length > 2 && ` +${shared.length - 2} more`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PlannerSidebar({
  plannerEntries,
  allRecipes,
  anchorRecipes = [],
  onClearAnchors,
  onRemoveAnchor,
  onAddAnchor,
  onSelectRecipe,
}) {
  const [mode, setMode] = useState("overlap");
  const [popup, setPopup] = useState(null); // { heading, title, items, itemType }
  const hasAnchors = anchorRecipes.length > 0;
  const activeMode = hasAnchors ? "plan-around" : mode;
  const similar = hasAnchors ? findSimilarRecipes(anchorRecipes, allRecipes, 12) : [];

  function openChipDetails({ recipe, sharedIngredients }) {
    const anchorTitles = anchorRecipes.map((r) => r.title).join(" + ");
    setPopup({
      heading: `Shares ingredients with ${anchorTitles}`,
      title: recipe.title,
      items: sharedIngredients,
      itemType: "ingredients",
    });
  }

  function openIngredientDetails({ core, recipes }) {
    setPopup({
      heading: `Used in ${recipes.length} recipe${recipes.length !== 1 ? "s" : ""} this week`,
      title: capitalize(core),
      items: recipes,
      itemType: "recipes",
    });
  }

  return (
    <div className="planner-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab${activeMode === "overlap" ? " active" : ""}`}
          onClick={() => { onClearAnchors?.(); setMode("overlap"); }}
        >
          Week overview
        </button>
        <button
          className={`sidebar-tab${activeMode === "plan-around" ? " active" : ""}`}
          onClick={() => setMode("plan-around")}
        >
          Plan around…
        </button>
      </div>

      {activeMode === "overlap" && (
        <OverlapScore
          plannerEntries={plannerEntries}
          allRecipes={allRecipes}
          onSelectIngredient={openIngredientDetails}
          onSelectRecipe={onSelectRecipe}
        />
      )}

      {activeMode === "plan-around" && (
        <div className="sidebar-plan-around">
          {hasAnchors ? (
            <>
              <div className="sidebar-anchor-header">
                <div>
                  <span className="sidebar-anchor-label">Based on</span>
                  <div className="sidebar-anchor-list">
                    {anchorRecipes.map((r) => (
                      <span key={r.id} className="sidebar-anchor-title-chip">
                        {r.title}
                        <button
                          type="button"
                          onClick={() => onRemoveAnchor?.(r.id)}
                          aria-label={`Stop planning around ${r.title}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <button className="sidebar-anchor-clear" onClick={onClearAnchors}>×</button>
              </div>
              {similar.length === 0 ? (
                <p className="sidebar-empty">
                  No other recipes share ingredients with{" "}
                  {anchorRecipes.length > 1 ? "these yet" : "this one yet"}. Import more recipes to see suggestions.
                </p>
              ) : (
                <>
                  <p className="sidebar-hint">
                    Drag a recipe onto the planner, or tap + on a suggestion to plan around it too.
                  </p>
                  <div className="sidebar-chips">
                    {similar.map(({ recipe, sharedIngredients }) => (
                      <SidebarRecipeChip
                        key={recipe.id}
                        recipe={recipe}
                        sharedIngredients={sharedIngredients}
                        onOpenDetails={openChipDetails}
                        onAddAnchor={onAddAnchor}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="sidebar-empty">
              <p>Click <strong>"Plan around this"</strong> on any recipe to see what else you can make reusing the same ingredients — ranked by overlap.</p>
            </div>
          )}
        </div>
      )}

      {popup && (
        <Popup
          heading={popup.heading}
          title={popup.title}
          items={popup.items}
          itemType={popup.itemType}
          onClose={() => setPopup(null)}
          onOpenRecipe={onSelectRecipe}
        />
      )}
    </div>
  );
}
