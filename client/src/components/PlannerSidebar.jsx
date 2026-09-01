import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { findSimilarRecipes, computeWeekOverlap } from "../lib/similarRecipes.js";

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

function OverlapScore({ plannerEntries, allRecipes }) {
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
              <span key={c} className="sidebar-shared-tag" title={`Used in: ${recipes.join(", ")}`}>
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PlannerSidebar({ plannerEntries, allRecipes, anchorRecipe, onClearAnchor }) {
  const [mode, setMode] = useState("overlap");
  const [expandedChip, setExpandedChip] = useState(null); // { recipe, sharedIngredients }
  const activeMode = anchorRecipe ? "plan-around" : mode;
  const similar = anchorRecipe ? findSimilarRecipes(anchorRecipe, allRecipes, 12) : [];

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
        <OverlapScore plannerEntries={plannerEntries} allRecipes={allRecipes} />
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
                        onOpenDetails={setExpandedChip}
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

      {expandedChip && (
        <div className="modal-overlay" onClick={() => setExpandedChip(null)}>
          <div className="card shared-ingredients-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setExpandedChip(null)} aria-label="Close">
              ×
            </button>
            <p className="shared-ingredients-context">Shares ingredients with {anchorRecipe?.title}</p>
            <h3 className="shared-ingredients-title">{expandedChip.recipe.title}</h3>
            <ul className="shared-ingredients-list">
              {expandedChip.sharedIngredients.map((ing) => (
                <li key={ing}>{ing}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
