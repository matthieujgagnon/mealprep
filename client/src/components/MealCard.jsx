import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { canonicalize, STAPLE_WORDS, SPICE_WORDS } from "../lib/groceryList.js";

const STAPLES_SET = new Set([...STAPLE_WORDS, ...SPICE_WORDS]);

// Salt, pepper, and other pantry staples/spices are on hand for virtually
// every recipe — counting them toward "N ingredients" makes that number
// less meaningful (a recipe with 3 real ingredients plus salt and pepper
// shouldn't read as "5 ingredients").
function isStapleIngredient(name) {
  return STAPLES_SET.has(canonicalize(name).core);
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
  onToggleLeftover,
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId || `recipe-${recipe.id}`,
    data: { recipe, ...dragData },
    disabled: dragDisabled,
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
      ref={setNodeRef}
      style={{ ...style, position: "relative" }}
      className={`card meal-card${isDragging ? " dragging" : ""}${compact ? " compact" : ""}${isLeftover ? " leftover-active" : ""}${isLeftover && isStale ? " leftover-stale" : ""}`}
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
      {onToggleLeftover && (
        <button
          className={`leftover-dot${isLeftover ? " active" : ""}`}
          aria-label={isLeftover ? "Marked as leftovers — click to unmark" : "Mark as leftovers"}
          title={isLeftover ? "Leftovers (not on grocery list)" : "Mark as leftovers"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLeftover();
          }}
        />
      )}
      {onToggleLeftover && isLeftover && (
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
