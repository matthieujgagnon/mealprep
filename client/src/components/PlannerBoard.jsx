import { Fragment, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { HintStrip } from "./RisoControls.jsx";
import { currentWeekStart, formatDayLabel, formatWeekRangeLabel, isCurrentWeek, isPastDay, shiftWeek } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, isCustomNote, isNoteEntry, slotKey } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";

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
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="planner-v5">
        Drag a recipe from the tray onto any slot, or drag meals between days to move them. Click an empty
        slot to write on it (like "Hockey pool"); click a blank card again to clear it. The grocery list
        builds itself from what's planned. The round button on a card marks it as leftovers, then as
        already have everything (blue outline); either way nothing from that meal goes on the grocery list.
      </HintStrip>
    </>
  );
}

function stateLabel(entry) {
  if (entry.alreadyHave) return "Already have everything (off the grocery list) - click to clear";
  if (entry.isLeftover) return "Leftover (off the grocery list) - click to mark as already have everything";
  return "Click to mark as leftover (keeps it off the grocery list), click again for already have everything";
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
          <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-planner-card-photo" draggable="false" />
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

// A slot you've written on (or clicked to leave blank). Click written text
// to edit it; click a blank card to clear the slot again.
// Typing on a slot: Enter or Escape (or clicking away) saves. Opening the
// emoji picker (Ctrl+Cmd+Space / the 🌐 key on a Mac, Win+. on Windows)
// takes focus from the whole window, which also blurs the textarea - that
// isn't "done typing", so the card stays open for the emoji to land in.
export function NoteTextarea({ initial, label, onSave, className }) {
  return (
    <textarea
      autoFocus
      className={className}
      aria-label={label}
      defaultValue={initial}
      placeholder="Write anything…"
      rows={2}
      maxLength={80}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (!document.hasFocus()) return;
        onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // mid-emoji or accent: not a save
        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function PlannerNoteCard({ entry, isPast, editing, onEdit, onSave, onClear }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe: entry.recipe, entryId: entry.id },
    disabled: editing,
  });
  const text = isCustomNote(entry) ? entry.recipe.title : "";

  if (editing) {
    return (
      <div ref={setNodeRef} className={`riso-planner-note editing${isPast ? " past" : ""}`}>
        <NoteTextarea initial={text} label="Write on this slot" onSave={onSave} className="riso-planner-note-input" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-note${text ? "" : " blank"}${isPast ? " past" : ""}${isDragging ? " dragging" : ""}`}
      onClick={text ? onEdit : onClear}
      title={text ? "Click to edit" : "Click to clear this slot"}
      {...listeners}
      {...attributes}
      aria-label={text ? `${text} - click to edit, or drag to another slot` : "Blank - click to clear"}
    >
      {text && <span className="riso-planner-note-text">{text}</span>}
    </div>
  );
}

function PlannerCell({
  dayIndex,
  mealType,
  entries,
  staleIds,
  isPast,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onEditNote,
  onSaveNote,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  // One thing per slot. Older plans can hold two; show the first, and
  // placing or moving into the slot replaces them all.
  const entry = entries[0];

  return (
    <div ref={setNodeRef} className={`riso-planner-cell${isPast ? " past" : ""}${isOver ? " drop-active" : ""}`}>
      {!entry ? (
        <button
          type="button"
          className="riso-planner-cell-empty"
          aria-label={`Write on ${MEAL_LABEL[mealType]}, ${DAY_SHORT[dayIndex]}`}
          onClick={() => onWriteInSlot({ dayOfWeek: dayIndex, mealType })}
        />
      ) : isNoteEntry(entry) ? (
        <PlannerNoteCard
          entry={entry}
          isPast={isPast}
          editing={editingNoteId === entry.id}
          onEdit={() => onEditNote(entry.id)}
          onSave={(text) => onSaveNote(entry.id, text)}
          onClear={() => onRemove(entry.id)}
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

export function PlannerBoard({
  entries,
  weekStart,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onEditNote,
  onSaveNote,
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const scrollRef = useRef(null);
  const [atWeekend, setAtWeekend] = useState(false);

  return (
    <section className="riso-planner-board">
      <div
        className="riso-planner-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtWeekend(el.scrollLeft + el.clientWidth >= el.scrollWidth - 20);
        }}
      >
        <div className="riso-planner-grid">
          <div className="riso-planner-corner" />
          {DAY_INDICES.map((dayIndex) => {
            const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
            return (
              <div key={dayIndex} className={`riso-planner-day-header${isToday ? " is-today" : ""}${isPastDay(weekStart, dayIndex) ? " past" : ""}`}>
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
                  isPast={isPastDay(weekStart, dayIndex)}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                  editingNoteId={editingNoteId}
                  onWriteInSlot={onWriteInSlot}
                  onEditNote={onEditNote}
                  onSaveNote={onSaveNote}
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
          <span className="riso-planner-legend-blank" />
          Click an empty slot to write on it
        </span>
        <button
          type="button"
          className="riso-planner-legend-scroll"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ left: atWeekend ? 0 : el.scrollWidth, behavior: "smooth" });
          }}
        >
          {atWeekend ? "← back to the weekdays" : "scroll for the weekend →"}
        </button>
      </div>
    </section>
  );
}
