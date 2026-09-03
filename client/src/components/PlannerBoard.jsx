import { Fragment } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealCard } from "./MealCard.jsx";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

// The "no meal planned" marker is a real (hidden) placeholder recipe under
// the hood — see server/src/routes/planner.js's POST /blank — so it can be
// placed on the planner the same way any other recipe is, with no schema
// change needed. This just recognizes it here to render it differently from
// a normal meal card.
function isBlankMarker(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title === "No meal planned";
}

function PlannerCell({
  dayIndex,
  mealType,
  entries,
  staleIds,
  onCardClick,
  onRemove,
  onToggleLeftover,
  onToggleAlreadyHave,
  onMarkBlank,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });

  return (
    <div ref={setNodeRef} className={`planner-cell${isOver ? " drop-active" : ""}`}>
      {entries.length === 0 && (
        <button
          type="button"
          className="planner-empty-slot"
          title="Mark as no meal planned"
          onClick={() => onMarkBlank(dayIndex, mealType)}
        >
          —
        </button>
      )}
      {entries.map((entry) =>
        isBlankMarker(entry) ? (
          <button
            key={entry.id}
            type="button"
            className="planner-blank-slot"
            title="No meal planned — click to clear"
            onClick={() => onRemove(entry.id)}
          >
            ✕
          </button>
        ) : (
          <MealCard
            key={entry.id}
            recipe={entry.recipe}
            dragId={`planner-${entry.id}`}
            dragData={{ entryId: entry.id }}
            compact
            onClick={() => onCardClick(entry.recipe)}
            onRemove={() => onRemove(entry.id)}
            isLeftover={entry.isLeftover}
            isStale={staleIds.has(entry.id)}
            onToggleLeftover={() => onToggleLeftover(entry.id, !entry.isLeftover)}
            alreadyHave={entry.alreadyHave}
            onToggleAlreadyHave={() => onToggleAlreadyHave(entry.id, !entry.alreadyHave)}
          />
        )
      )}
    </div>
  );
}

// A leftover card is "stale" once more days have passed since the earliest
// non-leftover placement of that same recipe this week than the recipe's
// fridgeLifeDays allows. Only meaningful within a single week's board — the
// planner has no real calendar dates, just Mon–Sun slots, so this compares
// day-of-week positions rather than actual elapsed days.
function computeStaleLeftoverIds(entries) {
  const stale = new Set();
  const firstCookedDay = new Map();

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const recipeId = entry.recipe?.id;
    if (!recipeId) continue;
    const prevDay = firstCookedDay.get(recipeId);
    if (prevDay === undefined || entry.dayOfWeek < prevDay) {
      firstCookedDay.set(recipeId, entry.dayOfWeek);
    }
  }

  for (const entry of entries) {
    if (!entry.isLeftover) continue;
    const fridgeLifeDays = entry.recipe?.fridgeLifeDays;
    if (!fridgeLifeDays) continue;
    const cookedDay = firstCookedDay.get(entry.recipe?.id);
    if (cookedDay == null) continue;
    if (entry.dayOfWeek - cookedDay > fridgeLifeDays) stale.add(entry.id);
  }

  return stale;
}

export function PlannerBoard({
  entries,
  onCardClick,
  onRemove,
  onToggleLeftover,
  onToggleAlreadyHave,
  onMarkBlank,
}) {
  // Group entries by "dayIndex-mealType" for quick lookup per cell
  const grouped = {};
  for (const entry of entries) {
    const key = `${entry.dayOfWeek}-${entry.mealType}`;
    (grouped[key] ||= []).push(entry);
  }

  const staleIds = computeStaleLeftoverIds(entries);

  return (
    <div className="planner-grid">
      <div className="planner-grid-corner" />
      {DAYS.map((day) => (
        <div key={day} className="planner-day-header">
          {day}
        </div>
      ))}

      {MEAL_TYPES.map((meal) => (
        <Fragment key={meal.id}>
          <div className="planner-meal-label">{meal.label}</div>
          {DAYS.map((_, dayIndex) => (
            <PlannerCell
              key={`${dayIndex}-${meal.id}`}
              dayIndex={dayIndex}
              mealType={meal.id}
              entries={grouped[`${dayIndex}-${meal.id}`] || []}
              staleIds={staleIds}
              onCardClick={onCardClick}
              onRemove={onRemove}
              onToggleLeftover={onToggleLeftover}
              onToggleAlreadyHave={onToggleAlreadyHave}
              onMarkBlank={onMarkBlank}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
