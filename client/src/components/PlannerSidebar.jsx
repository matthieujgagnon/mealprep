import { useState } from "react";
import { createPortal } from "react-dom";
import { useDraggable } from "@dnd-kit/core";
import { findSimilarRecipes, computeWeekOverlap } from "../lib/similarRecipes.js";
import { capitalize } from "../lib/groceryList.js";

// Rendered via a portal straight to <body> — this sidebar lives inside the
// planner's flex layout, and a plain in-place "position: fixed" modal here
// was landing inside whatever stacking/containing context its ancestors
// happen to create, instead of centered over the whole page. A portal
// sidesteps that entirely: the popup's DOM position no longer has anything
// to do with where in the tree it was declared.
function Popup({ heading, title, items, onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="card shared-ingredients-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {heading && <p className="shared-ingredients-context">{heading}</p>}
        <h3 className="shared-ingredients-title">{title}</h3>
        <ul className="shared-ingredients-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

function SidebarRecipeChip({ recipe, sharedIngredients, onOpenDetails }) {
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
      <span className="sidebar-chip-count">{sharedIngredients.length}</span>
    </div>
  );
}

function OverlapScore({ plannerEntries, allRecipes, onSelectIngredient }) {
  const { totalUnique, savedItems, overlapScore, sharedIngredients } =
    computeWeekOverlap(plannerEntries, allRecipes);

  const activeMeals = plannerEntries.filter((e) => !e.isLeftover);

  if (activeMeals.length < 2) {
    return (
      <div className="sidebar-empty">
        Add 2+ meals to the planner to see your ingredient reuse score.
      </div>
    );
  }

  const scoreColor =
    overlapScore >= 40 ? "var(--sage)" : overlapScore >= 20 ? "var(--mustard)" : "var(--paper-soft)";

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
    </div>
  );
}

export function PlannerSidebar({ plannerEntries, allRecipes, anchorRecipe, onClearAnchor }) {
  const [mode, setMode] = useState("overlap");
  const [popup, setPopup] = useState(null); // { heading, title, items }
  const activeMode = anchorRecipe ? "plan-around" : mode;
  const similar = anchorRecipe ? findSimilarRecipes(anchorRecipe, allRecipes, 12) : [];

  function openChipDetails({ recipe, sharedIngredients }) {
    setPopup({
      heading: `Shares ingredients with ${anchorRecipe?.title}`,
      title: recipe.title,
      items: sharedIngredients,
    });
  }

  function openIngredientDetails({ core, recipes }) {
    setPopup({
      heading: `Used in ${recipes.length} recipe${recipes.length !== 1 ? "s" : ""} this week`,
      title: capitalize(core),
      items: recipes,
    });
  }

  return (
    <div className="planner-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab${activeMode === "overlap" ? " active" : ""}`}
          onClick={() => { onClearAnchor?.(); setMode("overlap"); }}
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
        />
      )}

      {activeMode === "plan-around" && (
        <div className="sidebar-plan-around">
          {anchorRecipe ? (
            <>
              <div className="sidebar-anchor-header">
                <div>
                  <span className="sidebar-anchor-label">Based on</span>
                  <span className="sidebar-anchor-title">{anchorRecipe.title}</span>
                </div>
                <button className="sidebar-anchor-clear" onClick={onClearAnchor}>×</button>
              </div>
              {similar.length === 0 ? (
                <p className="sidebar-empty">
                  No other recipes share ingredients with this one yet. Import more recipes to see suggestions.
                </p>
              ) : (
                <>
                  <p className="sidebar-hint">
                    Drag a recipe onto the planner. Numbers show shared ingredients.
                  </p>
                  <div className="sidebar-chips">
                    {similar.map(({ recipe, sharedIngredients }) => (
                      <SidebarRecipeChip
                        key={recipe.id}
                        recipe={recipe}
                        sharedIngredients={sharedIngredients}
                        onOpenDetails={openChipDetails}
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
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
