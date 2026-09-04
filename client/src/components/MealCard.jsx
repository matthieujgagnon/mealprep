import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  alreadyHave,
  onCycleState,
  reorderable,
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const resolvedDragId = dragId || `recipe-${recipe.id}`;
  // useSortable combines the draggable and droppable halves App.jsx used to
  // wire up separately, and — as long as this card sits inside a matching
  // <SortableContext> — animates its siblings sliding apart live while a
  // card hovers over the grid, instead of the old drop-only reorder that
  // just toggled a static border. No transform-follow on the dragged card
  // itself here — App.jsx's <DragOverlay> renders the floating copy that
  // actually tracks the cursor; this card just dims via .dragging while
  // that's happening (see App.jsx's DragPreview).
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver: isReorderTarget,
    transform,
    transition,
  } = useSortable({
    id: resolvedDragId,
    data: { recipe, ...dragData },
    disabled: { draggable: dragDisabled, droppable: !reorderable },
  });
  const sortableStyle = reorderable
    ? { transform: CSS.Transform.toString(transform), transition }
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
      style={{ position: "relative", ...sortableStyle }}
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
