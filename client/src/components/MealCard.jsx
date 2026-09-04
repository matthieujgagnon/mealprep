import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { canonicalize, STAPLE_WORDS, SPICE_WORDS } from "../lib/groceryList.js";

const STAPLES_SET = new Set([...STAPLE_WORDS, ...SPICE_WORDS]);

// Salt, pepper, and other pantry staples/spices are on hand for virtually
// every recipe — counting them toward "N ingredients" makes that number
// less meaningful (a recipe with 3 real ingredients plus salt and pepper
// shouldn't read as "5 ingredients").
function isStapleIngredient(name) {
  return STAPLES_SET.has(canonicalize(name).core);
}

// dnd-kit hands back a separate ref setter for the draggable half and the
// droppable half of a card that's both — this attaches both to the same DOM
// node, the same way you'd combine any two ref callbacks in React.
function mergeRefs(...refs) {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

export function MealCard({
  recipe,
  onClick,
  dragDisabled,
  dragId,
  dragData,
  onDelete,
  onRemove,
  compact,
  isLeftover,
  isStale,
  alreadyHave,
  onCycleState,
  reorderable,
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const resolvedDragId = dragId || `recipe-${recipe.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: resolvedDragId,
    data: { recipe, ...dragData },
    disabled: dragDisabled,
  });
  // Reorderable grids double as drop targets on their own cards — dropping
  // one card onto another (rather than onto a distinct zone like "cookbook-
  // drop") is how App.jsx's handleDragEnd recognizes "reorder these two."
  const { setNodeRef: setDropRef, isOver: isReorderTarget } = useDroppable({
    id: resolvedDragId,
    disabled: !reorderable,
    data: { recipe },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const ingredientCount =
    recipe.ingredients?.filter((i) => !isStapleIngredient(i.name)).length || 0;

  // A card either offers "delete this recipe entirely" (collection views) or
  // "remove just this placement" (planner cells) — never both — so one small
  // corner button covers either case.
  const cornerAction = onDelete
    ? {
        label: `Delete ${recipe.title}`,
        onClick: (e) => {
          e.stopPropagation();
          if (window.confirm(`Delete "${recipe.title}"? This can't be undone.`)) {
            onDelete(recipe.id);
          }
        },
      }
    : onRemove
    ? {
        label: `Remove ${recipe.title} from this slot`,
        onClick: (e) => {
          e.stopPropagation();
          onRemove();
        },
      }
    : null;

  return (
    <div
      ref={mergeRefs(setNodeRef, setDropRef)}
      style={{ ...style, position: "relative" }}
      className={`card meal-card${isDragging ? " dragging" : ""}${compact ? " compact" : ""}${isLeftover ? " leftover-active" : ""}${isLeftover && isStale ? " leftover-stale" : ""}${alreadyHave ? " already-have-active" : ""}${isReorderTarget ? " reorder-target" : ""}`}
      onClick={() => onClick?.(recipe)}
      {...listeners}
      {...attributes}
    >
      {cornerAction && (
        <button
          className="meal-card-delete"
          aria-label={cornerAction.label}
          onClick={cornerAction.onClick}
        >
          ×
        </button>
      )}
      {onCycleState && (
        <button
          className={`leftover-dot${isLeftover ? " active" : ""}${alreadyHave ? " have-outline" : ""}`}
          aria-label={
            isLeftover
              ? "Marked as leftovers — click to mark as already have it instead"
              : alreadyHave
              ? "Marked as already have it — click to clear"
              : "Mark as leftovers"
          }
          title={
            isLeftover
              ? "Leftovers (not on grocery list) — click for “already have it”"
              : alreadyHave
              ? "Already have it (not on grocery list) — click to clear"
              : "Click to mark as leftovers, click again for “already have it”"
          }
          onClick={(e) => {
            e.stopPropagation();
            onCycleState();
          }}
        />
      )}
      {onCycleState && isLeftover && (
        <span
          className={`leftover-badge${isStale ? " stale" : ""}`}
          title={isStale ? "Past this recipe's fridge life — probably time to toss it" : undefined}
        >
          {isStale ? "⚠ Past fridge life" : "Leftover"}
        </span>
      )}
      {!recipe.isPlaceholder &&
        (recipe.photoUrl && !photoFailed ? (
          <img
            className="meal-card-photo"
            src={recipe.photoUrl}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="meal-card-photo placeholder">no photo</div>
        ))}
      <div className="meal-card-body">
        <p className="meal-card-title">{recipe.title}</p>
        {!compact && (
          <div className="meal-card-stats">
            {totalTime > 0 && <span>⏱ {totalTime} min</span>}
            {ingredientCount > 0 && <span>📝 {ingredientCount} ingredients</span>}
          </div>
        )}
      </div>
    </div>
  );
}
