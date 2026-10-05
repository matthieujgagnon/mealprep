import { Fragment, useLayoutEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { currentWeekStart, formatDayLabel, formatWeekRangeLabel, isCurrentWeek, isPastDay, shiftWeek } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, isCustomNote, isEmojiOnly, isNoteEntry, slotKey, weekendRuns } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { t } from "../i18n/index.js";

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
        aria-label={t("planner.prevWeek")}
      >
        ‹
      </button>
      <span className="riso-planner-week-label">{formatWeekRangeLabel(weekStart, { year: false })}</span>
      <button
        type="button"
        className="riso-planner-nav-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, 1))}
        aria-label={t("planner.nextWeek")}
      >
        ›
      </button>
      {isCurrentWeek(weekStart) ? (
        <span className="riso-planner-week-badge">{t("planner.thisWeekBadge")}</span>
      ) : (
        <button type="button" className="riso-chip small" onClick={() => onChangeWeek(currentWeekStart())}>
          {t("planner.thisWeek")}
        </button>
      )}
      {!hasEntries && (
        <button type="button" className="riso-chip small" onClick={onCopyLastWeek}>
          {t("planner.copyLastWeek")}
        </button>
      )}
    </div>
  );
}

// Title row: the week's arrows, the title and, at the right, the weekend pill.
export function PlannerHeader({ weekStart, onChangeWeek, hasEntries, onCopyLastWeek, actions }) {
  return (
    <div className="riso-planner-header">
      <div className="riso-planner-header-left">
        <PlannerHeaderNav
          weekStart={weekStart}
          onChangeWeek={onChangeWeek}
          hasEntries={hasEntries}
          onCopyLastWeek={onCopyLastWeek}
        />
        <h1 className="riso-planner-title">
          {t("planner.title")} <span className="accent">{t("planner.titleAccent")}</span>
        </h1>
      </div>
      <div className="riso-planner-header-actions">{actions}</div>
    </div>
  );
}

function stateLabel(entry) {
  if (entry.alreadyHave) return t("planner.stateHave");
  if (entry.isLeftover) return t("planner.stateLeftover");
  return t("planner.stateNone");
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
      aria-label={t("planner.cardAria", { title: recipe.title })}
    >
      <div className="riso-planner-card-photo-wrap">
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-planner-card-photo" draggable="false" />
        ) : (
          <div className="riso-planner-card-photo placeholder" />
        )}
        {entry.isLeftover && (
          <span className={`riso-planner-card-leftover${isStale ? " stale" : ""}`}>
            {isStale ? t("planner.pastFridge") : t("planner.leftover")}
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
        aria-label={t("planner.removeFromSlot", { title: recipe.title })}
        title={t("planner.remove")}
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
      placeholder={t("planner.writeAnything")}
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
        <NoteTextarea initial={text} label={t("planner.writeOnSlot")} onSave={onSave} className="riso-planner-note-input" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-note${text ? "" : " blank"}${isPast ? " past" : ""}${isDragging ? " dragging" : ""}`}
      onClick={text ? onEdit : onClear}
      title={text ? t("planner.clickToEdit") : t("planner.clickToClear")}
      {...listeners}
      {...attributes}
      aria-label={text ? t("planner.noteAria", { text }) : t("planner.blankAria")}
    >
      {text && <span className={`riso-planner-note-text${isEmojiOnly(text) ? " emoji" : ""}`}>{text}</span>}
    </div>
  );
}

function PlannerCell({
  dayIndex,
  mealIndex,
  mealType,
  entries,
  staleIds,
  isPast,
  selected,
  leftoverMode,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onEmptyClick,
  onEditNote,
  onSaveNote,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  // One thing per slot. Older plans can hold two; show the first, and
  // placing or moving into the slot replaces them all.
  const entry = entries[0];

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-cell${isPast ? " past" : ""}${isOver ? " drop-active" : ""}`}
      style={{ gridColumn: dayIndex + 2, gridRow: mealIndex + 2 }}
    >
      {!entry ? (
        <button
          type="button"
          className={`riso-planner-cell-empty${selected ? " selected" : ""}${leftoverMode ? " leftover-target" : ""}`}
          aria-label={
            leftoverMode
              ? t("planner.leftoversOnMealDay", { meal: MEAL_LABEL[mealType], day: DAY_SHORT[dayIndex] })
              : t("planner.emptyAria", { meal: MEAL_LABEL[mealType], day: DAY_SHORT[dayIndex] })
          }
          onClick={(e) => onEmptyClick({ dayOfWeek: dayIndex, mealType }, e.currentTarget)}
        >
          {(selected || leftoverMode) && <span aria-hidden="true">{leftoverMode ? t("planner.leftoversCell") : "+"}</span>}
        </button>
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
  weekendDays,
  selectedSlot,
  leftoverMode,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onEmptyClick,
  onEditNote,
  onSaveNote,
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const scrollRef = useRef(null);
  const runs = weekendRuns(weekendDays);
  const currentWeek = isCurrentWeek(weekStart);

  // All seven days fit on a computer; on a narrow window, where the board
  // scrolls sideways, it opens with today in the middle (the first day for
  // any other week).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const today = el.querySelector(".riso-planner-day-header.is-today");
    el.scrollLeft = currentWeek && today ? Math.max(0, today.offsetLeft - (el.clientWidth - today.offsetWidth) / 2) : 0;
  }, [weekStart, currentWeek]);

  return (
    <section className="riso-planner-board">
      <div className="riso-planner-scroll" ref={scrollRef}>
        <div className="riso-planner-grid">
          {/* Each run of weekend days is one block with a pink dotted line, drawn
              behind the headers and slots it covers. */}
          {runs.map((run) => (
            <div
              key={run.start}
              className="riso-planner-weekend"
              aria-hidden="true"
              style={{ gridColumn: `${run.start + 2} / ${run.end + 3}`, gridRow: "1 / 5" }}
            />
          ))}
          <div className="riso-planner-corner" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAY_INDICES.map((dayIndex) => {
            const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
            return (
              <div
                key={dayIndex}
                className={`riso-planner-day-header${isToday ? " is-today" : ""}${isPastDay(weekStart, dayIndex) ? " past" : ""}`}
                style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
              >
                <span className="riso-planner-day-weekday">{(isToday ? t("days.today") : weekday).toUpperCase()}</span>
                <span className="riso-planner-day-date">{t("dates.monthDay", { month: monthShort, day: dayNum })}</span>
              </div>
            );
          })}

          {MEAL_TYPES.map((meal, mealIndex) => (
            <Fragment key={meal.id}>
              <div className="riso-planner-meal-label" style={{ gridColumn: 1, gridRow: mealIndex + 2 }}>
                {meal.label}
              </div>
              {DAY_INDICES.map((dayIndex) => (
                <PlannerCell
                  key={`${dayIndex}-${meal.id}`}
                  dayIndex={dayIndex}
                  mealIndex={mealIndex}
                  mealType={meal.id}
                  entries={grouped[slotKey(dayIndex, meal.id)] || []}
                  staleIds={staleIds}
                  isPast={isPastDay(weekStart, dayIndex)}
                  selected={selectedSlot?.dayOfWeek === dayIndex && selectedSlot?.mealType === meal.id}
                  leftoverMode={leftoverMode && !isPastDay(weekStart, dayIndex)}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                  editingNoteId={editingNoteId}
                  onEmptyClick={onEmptyClick}
                  onEditNote={onEditNote}
                  onSaveNote={onSaveNote}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
