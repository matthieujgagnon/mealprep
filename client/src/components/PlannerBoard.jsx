import { Fragment } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { HintStrip } from "./RisoControls.jsx";
import { currentWeekStart, formatDayLabel, formatWeekRangeLabel, isCurrentWeek, shiftWeek } from "../lib/dates.js";
import { MEAL_TYPES, isBlankMarker, isCustomNote, isNoteEntry, slotKey, todayIndex } from "../lib/plannerSlots.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// A leftover card is "stale" once more days have passed since the earliest
// non-leftover placement of that same recipe this week than the recipe's
// fridgeLifeDays allows. Compares day-of-week positions within one week.
export function computeStaleLeftoverIds(entries) {
  const stale = new Set();
  const firstCookedDay = new Map();

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const recipeId = entry.recipe?.id;
    if (!recipeId) continue;
    const prevDay = firstCookedDay.get(recipeId);
    if (prevDay === undefined || entry.dayOfWeek < prevDay) firstCookedDay.set(recipeId, entry.dayOfWeek);
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

function PlannerHeaderNav({ weekStart, onChangeWeek, hasEntries, onCopyLastWeek }) {
  return (
    <div className="riso-planner-nav-row">
      <button
        type="button"
        className="riso-planner-nav-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, -1))}
        aria-label="Previous week"
      >
        ‹
      </button>
      <span className="riso-planner-week-label">{formatWeekRangeLabel(weekStart).replace(/, \d{4}$/, "")}</span>
      <button
        type="button"
        className="riso-planner-nav-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, 1))}
        aria-label="Next week"
      >
        ›
      </button>
      {isCurrentWeek(weekStart) ? (
        <span className="riso-planner-week-badge">this week</span>
      ) : (
        <button type="button" className="riso-chip small" onClick={() => onChangeWeek(currentWeekStart())}>
          This week
        </button>
      )}
      {!hasEntries && (
        <button type="button" className="riso-chip small" onClick={onCopyLastWeek}>
          Copy last week's plan
        </button>
      )}
    </div>
  );
}

// Title row (week nav, title, Fill/Build buttons) and the how-it-works
// strip, rendered full width above the board + tray row.
export function PlannerHeader({
  user,
  weekStart,
  onChangeWeek,
  hasEntries,
  onCopyLastWeek,
  emptyCount,
  onFillEmptySlots,
  groceryCount,
  onGoToGrocery,
}) {
  return (
    <>
      <div className="riso-planner-header">
        <div className="riso-planner-header-left">
          <PlannerHeaderNav
            weekStart={weekStart}
            onChangeWeek={onChangeWeek}
            hasEntries={hasEntries}
            onCopyLastWeek={onCopyLastWeek}
          />
          <h1 className="riso-planner-title">
            The week <span className="accent">ahead.</span>
          </h1>
        </div>
        <div className="riso-planner-header-actions">
          <button type="button" className="riso-btn" onClick={onFillEmptySlots} disabled={emptyCount === 0}>
            {emptyCount > 0 ? `Fill ${emptyCount} empty slot${emptyCount === 1 ? "" : "s"}` : "All slots filled ✓"}
          </button>
          <button type="button" className="riso-btn primary" onClick={onGoToGrocery}>
            Build grocery list · {groceryCount}
          </button>
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="planner-v3">
        Drag a recipe from the tray onto any slot, or click an empty slot and pick one. Drag meals between
        days to move them. A blue outline means you already have everything for that meal, so it stays off
        the grocery list.
      </HintStrip>
    </>
  );
}

function stateLabel(entry) {
  if (entry.alreadyHave) return "Already have everything - click to clear";
  if (entry.isLeftover) return "Leftover - click to mark as already have everything";
  return "Click to mark as leftover, click again for already have everything";
}

function PlannerMealCard({ entry, isPast, isStale, onClick, onRemove, onCycleState }) {
  const { recipe } = entry;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe, entryId: entry.id },
  });

  const classes = ["riso-planner-card"];
  if (entry.alreadyHave) classes.push("have");
  if (isPast) classes.push("past");
  if (isDragging) classes.push("dragging");

  return (
    <div
      ref={setNodeRef}
      className={classes.join(" ")}
      onClick={onClick}
      {...listeners}
      {...attributes}
      aria-label={`${recipe.title} - open, or drag to another slot`}
    >
      <div className="riso-planner-card-photo-wrap">
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" className="riso-planner-card-photo" draggable="false" />
        ) : (
          <div className="riso-planner-card-photo placeholder" />
        )}
        {entry.isLeftover && (
          <span className={`riso-planner-card-leftover${isStale ? " stale" : ""}`}>
            {isStale ? "⚠ past fridge life" : "leftover"}
          </span>
        )}
      </div>
      <button
        type="button"
        className={`riso-planner-card-have${entry.alreadyHave ? " on" : ""}`}
        aria-label={stateLabel(entry)}
        title={stateLabel(entry)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCycleState();
        }}
      >
        {entry.alreadyHave ? "✓" : ""}
      </button>
      <button
        type="button"
        className="riso-planner-card-remove"
        aria-label={`Remove ${recipe.title} from this slot`}
        title="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
      <div className="riso-planner-card-body">
        <p className="riso-planner-card-name">{recipe.title}</p>
      </div>
    </div>
  );
}

function PlannerNoteCard({ entry, isPast, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe: entry.recipe, entryId: entry.id },
  });
  const text = isCustomNote(entry) ? entry.recipe.title : "Skipped";

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-note${isPast ? " past" : ""}${isDragging ? " dragging" : ""}`}
      onClick={onEdit}
      title="Click to edit the note"
      {...listeners}
      {...attributes}
      aria-label={`Note: ${text} - edit, or drag to another slot`}
    >
      <button
        type="button"
        className="riso-planner-note-remove"
        aria-label={`Remove note "${text}"`}
        title="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
      <span className="riso-planner-note-label">✎ NOTE</span>
      <span className="riso-planner-note-text">{text}</span>
    </div>
  );
}

function PlannerCell({
  dayIndex,
  mealType,
  entries,
  staleIds,
  isPast,
  selected,
  onSelect,
  onCardClick,
  onRemove,
  onCycleState,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  // One thing per slot. Older plans can hold two; show the first, and
  // placing or moving into the slot replaces them all.
  const entry = entries[0];

  return (
    <div ref={setNodeRef} className={`riso-planner-cell${isOver ? " drop-active" : ""}`}>
      {!entry ? (
        <button
          type="button"
          className={`riso-planner-cell-empty${selected ? " selected" : ""}`}
          aria-pressed={selected}
          onClick={() => onSelect(selected ? null : { dayOfWeek: dayIndex, mealType })}
        >
          {selected ? "pick a recipe →" : "+ add"}
        </button>
      ) : isNoteEntry(entry) ? (
        <PlannerNoteCard
          entry={entry}
          isPast={isPast}
          onEdit={() => onSelect({ dayOfWeek: dayIndex, mealType, note: isBlankMarker(entry) ? "" : entry.recipe.title })}
          onRemove={() => onRemove(entry.id)}
        />
      ) : (
        <PlannerMealCard
          entry={entry}
          isPast={isPast}
          isStale={staleIds.has(entry.id)}
          onClick={() => onCardClick(entry.recipe)}
          onRemove={() => onRemove(entry.id)}
          onCycleState={() => onCycleState(entry.id)}
        />
      )}
    </div>
  );
}

export function PlannerBoard({ entries, weekStart, target, onSelectSlot, onCardClick, onRemove, onCycleState }) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const today = todayIndex();
  const currentWeek = isCurrentWeek(weekStart);

  return (
    <section className="riso-planner-board">
      <div className="riso-planner-scroll">
        <div className="riso-planner-grid">
          <div className="riso-planner-corner" />
          {DAY_INDICES.map((dayIndex) => {
            const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
            return (
              <div key={dayIndex} className={`riso-planner-day-header${isToday ? " is-today" : ""}`}>
                <span className="riso-planner-day-weekday">{isToday ? "TODAY" : weekday.toUpperCase()}</span>
                <span className="riso-planner-day-date">
                  {monthShort} {dayNum}
                </span>
              </div>
            );
          })}

          {MEAL_TYPES.map((meal) => (
            <Fragment key={meal.id}>
              <div className="riso-planner-meal-label">{meal.label}</div>
              {DAY_INDICES.map((dayIndex) => (
                <PlannerCell
                  key={`${dayIndex}-${meal.id}`}
                  dayIndex={dayIndex}
                  mealType={meal.id}
                  entries={grouped[slotKey(dayIndex, meal.id)] || []}
                  staleIds={staleIds}
                  isPast={currentWeek && dayIndex < today}
                  selected={target?.dayOfWeek === dayIndex && target?.mealType === meal.id}
                  onSelect={onSelectSlot}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="riso-planner-legend">
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-have" />
          You already have everything
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-leftover">leftover</span>From an earlier meal
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-note">✎ NOTE</span>Your own text
        </span>
        <span className="riso-planner-legend-scroll">scroll for the weekend →</span>
      </div>
    </section>
  );
}
