import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
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
const MEAL_LABELS = Object.fromEntries(MEAL_TYPES.map((m) => [m.id, m.label]));
const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Click-to-search alternative to dragging a recipe in from the (possibly
// huge) cookbook grid below the board — search narrows it instantly instead
// of scrolling to find one card among many, and this works the same on
// touch as it does with a mouse, unlike drag-and-drop.
function RecipePickerPopover({ dayIndex, mealType, recipes, canMarkBlank, onPick, onMarkBlank, onClose }) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const q = query.trim().toLowerCase();
  const filtered = q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;

  async function handlePick(recipe) {
    setSubmitting(true);
    setError(null);
    try {
      await onPick(recipe);
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleMarkBlank() {
    setSubmitting(true);
    setError(null);
    try {
      await onMarkBlank();
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-content recipe-picker-popover" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="recipe-picker-title">
          Add a recipe{" "}
          <span className="recipe-picker-slot">
            — {WEEKDAY_LABELS[dayIndex]}, {MEAL_LABELS[mealType]}
          </span>
        </h3>
        <input
          autoFocus
          type="text"
          className="recipe-picker-search"
          placeholder="Search your cookbook…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={submitting}
        />
        {error && <p className="import-error">{error}</p>}
        <div className="recipe-picker-list">
          {canMarkBlank && (
            <button
              type="button"
              className="recipe-picker-blank-option"
              onClick={handleMarkBlank}
              disabled={submitting}
            >
              — No meal planned
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="recipe-picker-empty">No recipes match "{query}".</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className="recipe-picker-option"
                onClick={() => handlePick(r)}
                disabled={submitting}
              >
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt="" className="recipe-picker-option-photo" />
                ) : (
                  <div className="recipe-picker-option-photo placeholder" />
                )}
                <span className="recipe-picker-option-title">{r.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Prev/next/today navigation, a jump-to-any-date picker, and (only when
// this week's board is empty) a one-click way to start from last week's
// shape instead of a blank grid.
function WeekNav({ weekStart, hasEntries, onChangeWeek, onCopyLastWeek }) {
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
  plannableRecipes,
  onCardClick,
  onRemove,
  onCycleState,
  onMarkBlank,
  onAddToPlanner,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasBlankMarker = entries.some(isBlankMarker);

  return (
    <div ref={setNodeRef} className={`planner-cell${isOver ? " drop-active" : ""}`}>
      {entries.length === 0 && (
        <button
          type="button"
          className="card meal-card compact planner-empty-card"
          title="Add a recipe"
          onClick={() => setPickerOpen(true)}
        >
          +
        </button>
      )}
      {entries.map((entry) =>
        isBlankMarker(entry) ? (
          <button
            key={entry.id}
            type="button"
            className="card meal-card compact planner-empty-card marked"
            title="No meal planned — click to clear"
            onClick={() => onRemove(entry.id)}
          />
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
            alreadyHave={entry.alreadyHave}
            onCycleState={() => onCycleState(entry.id)}
          />
        )
      )}
      {entries.length > 0 && !hasBlankMarker && (
        <button
          type="button"
          className="planner-cell-add-more"
          title="Add another recipe to this slot"
          onClick={() => setPickerOpen(true)}
        >
          + Add another
        </button>
      )}
      {pickerOpen && (
        <RecipePickerPopover
          dayIndex={dayIndex}
          mealType={mealType}
          recipes={plannableRecipes}
          canMarkBlank={entries.length === 0}
          onPick={(recipe) => onAddToPlanner(recipe.id, dayIndex, mealType)}
          onMarkBlank={() => onMarkBlank(dayIndex, mealType)}
          onClose={() => setPickerOpen(false)}
        />
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
  plannableRecipes,
  onChangeWeek,
  onCopyLastWeek,
  onCardClick,
  onRemove,
  onCycleState,
  onMarkBlank,
  onAddToPlanner,
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
                plannableRecipes={plannableRecipes}
                onCardClick={onCardClick}
                onRemove={onRemove}
                onCycleState={onCycleState}
                onMarkBlank={onMarkBlank}
                onAddToPlanner={onAddToPlanner}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
}
