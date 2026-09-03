import { Fragment } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealCard } from "./MealCard.jsx";
import { formatDayHeader, isToday } from "../lib/weeks.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

function PlannerCell({ dayIndex, mealType, entries, staleIds, onCardClick, onRemove, onToggleLeftover }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });

  return (
    <div ref={setNodeRef} className={`planner-cell${isOver ? " drop-active" : ""}`}>
      {entries.length === 0 && <div className="planner-empty-slot">—</div>}
      {entries.map((entry) => (
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
        />
      ))}
    </div>
  );
}

// A leftover card is "stale" once more days have passed since the earliest
// non-leftover placement of that same recipe this week than the recipe's
// fridgeLifeDays allows. Only meaningful within a single week's board — day
// indices are consecutive calendar days within one week, so comparing
// day-of-week positions is equivalent to comparing elapsed days as long as
// the leftover and its source meal are both in the same loaded week. It
// doesn't currently follow a leftover that crosses a week boundary (e.g. a
// Sunday-cooked meal eaten as leftovers the following Monday).
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

export function PlannerBoard({ weekStart, entries, onCardClick, onRemove, onToggleLeftover }) {
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
      {DAYS.map((day, dayIndex) => (
        <div
          key={day}
          className={`planner-day-header${isToday(weekStart, dayIndex) ? " is-today" : ""}`}
        >
          {formatDayHeader(weekStart, dayIndex)}
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
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
