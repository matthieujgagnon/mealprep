import { Fragment } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealCard } from "./MealCard.jsx";
import {
  currentWeekStart,
  formatDayLabel,
  formatWeekRangeLabel,
  isCurrentWeek,
  mondayOf,
  parseDateKey,
  shiftWeek,
  toDateKey,
} from "../lib/dates.js";

const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

// Prev/next/today navigation, a jump-to-any-date picker, a quick-jump list
// of weeks that already have something planned, and (only when this week's
// board is empty) a one-click way to start from last week's shape instead
// of a blank grid.
function WeekNav({ weekStart, plannedWeeks, hasEntries, onChangeWeek, onCopyLastWeek }) {
  function handleDatePick(e) {
    const value = e.target.value;
    if (!value) return;
    onChangeWeek(toDateKey(mondayOf(parseDateKey(value))));
  }

  return (
    <div className="planner-week-nav">
      <button
        type="button"
        className="planner-week-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, -1))}
        aria-label="Previous week"
      >
        ‹
      </button>
      <div className="planner-week-label-group">
        <span className="planner-week-label">{formatWeekRangeLabel(weekStart)}</span>
        {isCurrentWeek(weekStart) && <span className="planner-week-current-badge">This week</span>}
      </div>
      <button
        type="button"
        className="planner-week-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, 1))}
        aria-label="Next week"
      >
        ›
      </button>

      {!isCurrentWeek(weekStart) && (
        <button type="button" className="btn subtle btn-sm" onClick={() => onChangeWeek(currentWeekStart())}>
          Today
        </button>
      )}

      <input
        type="date"
        className="planner-week-picker"
        value={weekStart}
        onChange={handleDatePick}
        aria-label="Jump to the week containing a date"
      />

      {plannedWeeks.length > 0 && (
        <select
          className="planner-week-picker"
          value={plannedWeeks.includes(weekStart) ? weekStart : ""}
          onChange={(e) => e.target.value && onChangeWeek(e.target.value)}
          aria-label="Jump to a week you've already planned"
        >
          <option value="">Jump to a planned week…</option>
          {plannedWeeks.map((ws) => (
            <option key={ws} value={ws}>
              {formatWeekRangeLabel(ws)}
            </option>
          ))}
        </select>
      )}

      {!hasEntries && (
        <button type="button" className="btn subtle btn-sm" onClick={onCopyLastWeek}>
          Copy last week's plan
        </button>
      )}
    </div>
  );
}

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

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

export function PlannerBoard({
  entries,
  weekStart,
  plannedWeeks,
  onChangeWeek,
  onCopyLastWeek,
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
    <>
      <WeekNav
        weekStart={weekStart}
        plannedWeeks={plannedWeeks}
        hasEntries={entries.length > 0}
        onChangeWeek={onChangeWeek}
        onCopyLastWeek={onCopyLastWeek}
      />
      <div className="planner-grid">
        <div className="planner-grid-corner" />
        {DAY_INDICES.map((dayIndex) => {
          const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
          return (
            <div
              key={dayIndex}
              className={`planner-day-header${isToday ? " is-today" : ""}`}
            >
              <span className="planner-day-weekday">{weekday}</span>
              <span className="planner-day-date">
                {monthShort} {dayNum}
              </span>
            </div>
          );
        })}

        {MEAL_TYPES.map((meal) => (
          <Fragment key={meal.id}>
            <div className="planner-meal-label">{meal.label}</div>
            {DAY_INDICES.map((dayIndex) => (
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
    </>
  );
}
