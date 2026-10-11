import { Fragment, useLayoutEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatDayLabel, isCurrentWeek, isPastDay } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, canClearDay, isCustomNote, isEmojiOnly, isNoteEntry, slotKey } from "../lib/plannerSlots.js";
import { formatRecipeTime, recipeTotalMinutes } from "../lib/mealSlots.js";
import { PlannerLegend } from "./PlannerLegend.jsx";
import { weekendLayout } from "../lib/weekend.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { leftoverIsStale } from "../lib/leftovers.js";
import { dict, t } from "../i18n/index.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// A leftover card is "stale" (the pink "past fridge life" sticker) once it is past
// its keep time (lib/leftovers.js, the one rule): a leftover that eats from Inventory
// leftovers (`items`) after their use-by date; one that doesn't yet, when more days
// have passed since the earliest non-leftover placement of the same recipe this week
// than the recipe keeps in the fridge (its own days, else 4).
export function computeStaleLeftoverIds(entries, items = []) {
  const stale = new Set();
  const firstCookedDay = new Map();
  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const recipeId = entry.recipe?.id;
    if (!recipeId) continue;
    const prevDay = firstCookedDay.get(recipeId);
    if (prevDay === undefined || entry.dayOfWeek < prevDay) firstCookedDay.set(recipeId, entry.dayOfWeek);
  }

  for (const entry of entries) {
    if (!entry.isLeftover || entry.cookedAt) continue;
    const item = entry.leftoverItemId ? itemById.get(entry.leftoverItemId) : null;
    if (leftoverIsStale(entry, { item, cookedDay: firstCookedDay.get(entry.recipe?.id) })) stale.add(entry.id);
  }

  return stale;
}

function stateLabel(entry) {
  if (entry.alreadyHave) return t("planner.stateHave");
  if (entry.isLeftover) return t("planner.stateLeftover");
  return t("planner.stateNone");
}

// The slot a card sits in: a cell of the computer's grid, or of the phone board.
function cellOf(e) {
  return e.currentTarget.closest(".riso-planner-cell, .pmb-cell");
}

// A planned meal's card in a slot. The computer board and the phone board both
// draw it (the phone's CSS makes it 104 x 104, hides the round ✓ and the ×, and
// shows the cooking time).
export function PlannerMealCard({ entry, mealIndex, isPast, isStale, onClick, onRemove, onCycleState }) {
  const { recipe } = entry;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe, entryId: entry.id },
  });

  const classes = ["riso-planner-card"];
  if (entry.alreadyHave) classes.push("have");
  else if (entry.isLeftover) classes.push("leftover");
  if (isPast) classes.push("past");
  if (isDragging) classes.push("dragging");

  return (
    <div
      ref={setNodeRef}
      className={classes.join(" ")}
      onClick={(e) => onClick(entry, cellOf(e), mealIndex)}
      {...listeners}
      {...attributes}
      aria-label={t("planner.cardAria", { title: recipe.title })}
    >
      <div className="riso-planner-card-photo-wrap">
        {recipe.photoUrl ? (
          <RecipePhoto src={recipe.photoUrl} alt="" className="riso-planner-card-photo" draggable="false" />
        ) : (
          <div className="riso-planner-card-photo placeholder" />
        )}
        {entry.isLeftover && (
          <span className={`riso-planner-card-leftover${isStale ? " stale" : ""}`}>
            {isStale ? t("planner.pastFridge") : t("planner.leftover")}
          </span>
        )}
        {entry.cookedAt && !entry.isLeftover && <span className="riso-planner-card-cooked">{t("cooked.status")}</span>}
      </div>
      <button
        type="button"
        className={`riso-planner-card-have${entry.alreadyHave ? " on" : ""}`}
        aria-label={stateLabel(entry)}
        title={stateLabel(entry)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCycleState(entry.id);
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
          onRemove(entry.id);
        }}
      >
        ×
      </button>
      <div className="riso-planner-card-body">
        <p className="riso-planner-card-name">{recipe.title}</p>
        <span className="riso-planner-card-time">{formatRecipeTime(recipeTotalMinutes(recipe))}</span>
      </div>
    </div>
  );
}

// A slot you've written on (or marked "no meal planned"). Neither has a ×: click
// written text to edit it in the slot's card (which has Remove note); click a
// blank card to clear it (the toast has Undo).
export function PlannerNoteCard({ entry, mealIndex, isPast, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe: entry.recipe, entryId: entry.id },
  });
  const text = isCustomNote(entry) ? entry.recipe.title : "";

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-note${text ? "" : " blank"}${isPast ? " past" : ""}${isDragging ? " dragging" : ""}`}
      onClick={(e) => (text ? onEdit(entry, cellOf(e), mealIndex) : onRemove(entry.id))}
      title={text ? t("planner.clickToEdit") : t("planner.clickToClear")}
      {...listeners}
      {...attributes}
      aria-label={text ? t("planner.noteAria", { text }) : t("planner.blankAria")}
    >
      {text && <span className="riso-planner-note-label">{t("planner.noteTag")}</span>}
      {text ? <span className={`riso-planner-note-text${isEmojiOnly(text) ? " emoji" : ""}`}>{text}</span> : <span className="riso-planner-note-blank">{t("planner.slotBlank")}</span>}
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
  offset,
  onCardClick,
  onNoteClick,
  onRemove,
  onCycleState,
  onEmptyClick,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  // One thing per slot. Older plans can hold two; show the first, and
  // placing or moving into the slot replaces them all.
  const entry = entries[0];

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-cell${isPast ? " past" : ""}${isOver ? " drop-active" : ""}${selected ? " selected" : ""}`}
      style={{ gridColumn: dayIndex + 2, gridRow: mealIndex + 2, transform: `translate(${offset.x}px, ${offset.y}px)` }}
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
          onClick={(e) => onEmptyClick({ dayOfWeek: dayIndex, mealType }, cellOf(e), mealIndex)}
        >
          <span aria-hidden="true" className="riso-planner-cell-plus">
            {leftoverMode ? t("planner.leftoversCell") : "+"}
          </span>
        </button>
      ) : isNoteEntry(entry) ? (
        <PlannerNoteCard entry={entry} mealIndex={mealIndex} isPast={isPast} onEdit={onNoteClick} onRemove={onRemove} />
      ) : (
        <PlannerMealCard
          entry={entry}
          mealIndex={mealIndex}
          isPast={isPast}
          isStale={staleIds.has(entry.id)}
          onClick={onCardClick}
          onRemove={onRemove}
          onCycleState={onCycleState}
        />
      )}
    </div>
  );
}

// The Souper-only segment of a weekend block that takes in the evening before:
// a dotted panel with a rounded corner that joins the main block.
function EveSegment({ plate }) {
  const m = plate.eveMargin;
  return (
    <div
      className="riso-planner-weekend-eve"
      aria-hidden="true"
      style={{
        gridColumn: `${plate.start + 1} / span 1`,
        gridRow: "4 / 5",
        margin: `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`,
      }}
    >
      <span className="riso-planner-weekend-eve-join" />
      <svg width="22" height="22" viewBox="0 0 22 22" className="riso-planner-weekend-eve-arc">
        <path className="fill" d="M0 20 A20 20 0 0 0 20 0 L22 0 L22 22 L0 22 Z" />
        <path className="line" d="M0 20 A20 20 0 0 0 20 0" />
      </svg>
    </div>
  );
}

export function PlannerBoard({
  entries,
  weekStart,
  weekend,
  boardRef,
  selectedSlot,
  leftoverMode,
  onCardClick,
  onNoteClick,
  onRemove,
  onClearDay,
  onCycleState,
  onEmptyClick,
  onWeekendMenu,
  overlay,
  leftoverItems = [],
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries, leftoverItems);
  const scrollRef = useRef(null);
  const layout = weekendLayout(weekend);
  const currentWeek = isCurrentWeek(weekStart);

  // All seven days fit on a computer; in a narrow window the board scrolls
  // sideways and opens with today in the middle (the first day for any other
  // week).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const today = el.querySelector(".riso-planner-day-header.is-today");
    el.scrollLeft = currentWeek && today ? Math.max(0, today.offsetLeft - (el.clientWidth - today.offsetWidth) / 2) : 0;
  }, [weekStart, currentWeek]);

  return (
    <section className="riso-planner-board" ref={boardRef}>
      {!layout.on && (
        <button type="button" className="riso-planner-weekend-off" data-weekend-toggle onClick={onWeekendMenu}>
          + {t("planner.weekendTag")}
        </button>
      )}
      {overlay}
      <div className="riso-planner-scroll" ref={scrollRef} style={{ paddingRight: layout.padRight, paddingBottom: layout.padBottom }}>
        <div className="riso-planner-grid">
          {/* Each run of weekend days is one dotted block behind the headers and
              slots it covers; the first carries the WEEKEND tag that opens the menu. */}
          {layout.plates.map((plate, index) => (
            <Fragment key={plate.key}>
              <div
                className="riso-planner-weekend"
                style={{
                  gridColumn: `${plate.start + 2} / span ${plate.end - plate.start + 1}`,
                  gridRow: "1 / span 4",
                  margin: `${plate.margin.top}px ${plate.margin.right}px ${plate.margin.bottom}px ${plate.margin.left}px`,
                  borderRadius: plate.eve ? "22px 22px 22px 0" : "22px",
                }}
              >
                {index === 0 && (
                  <button type="button" className="riso-planner-weekend-tag" data-weekend-toggle onClick={onWeekendMenu}>
                    {t("planner.weekendTag")}
                    <span className="riso-planner-weekend-tag-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                )}
              </div>
              {plate.eve && <EveSegment plate={plate} />}
            </Fragment>
          ))}
          <div className="riso-planner-corner" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAY_INDICES.map((dayIndex) => {
            const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
            return (
              <div
                key={dayIndex}
                className={`riso-planner-day-header${isToday ? " is-today" : ""}${isPastDay(weekStart, dayIndex) ? " past" : ""}`}
                style={{ gridColumn: dayIndex + 2, gridRow: 1, transform: `translateX(${layout.shiftX[dayIndex]}px)` }}
              >
                <span className="riso-planner-day-weekday">{(isToday ? t("planner.todayShort") : weekday).toUpperCase()}</span>
                <span className="riso-planner-day-date">{t("dates.monthDay", { month: monthShort, day: dayNum })}</span>
              </div>
            );
          })}

          {MEAL_TYPES.map((meal, mealIndex) => (
            <Fragment key={meal.id}>
              <div className="riso-planner-meal-label" style={{ gridColumn: 1, gridRow: mealIndex + 2 }}>
                <span>{meal.label}</span>
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
                  offset={{ x: layout.shiftX[dayIndex], y: layout.shiftY(dayIndex, mealIndex) }}
                  onCardClick={onCardClick}
                  onNoteClick={onNoteClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                  onEmptyClick={onEmptyClick}
                />
              ))}
            </Fragment>
          ))}

          {/* A small, quiet "Clear" under each day that has something planned
              (not before today): the whole day comes off, with the toast's Undo. */}
          {DAY_INDICES.map((dayIndex) => (
            <div
              key={`clear-${dayIndex}`}
              className="riso-planner-clear-cell"
              style={{ gridColumn: dayIndex + 2, gridRow: MEAL_TYPES.length + 2, transform: `translateX(${layout.shiftX[dayIndex]}px)` }}
            >
              {canClearDay(entries, weekStart, dayIndex) && (
                <button
                  type="button"
                  className="riso-planner-clear"
                  aria-label={t("planner.clearDayAria", { day: dict().days.long[dayIndex] })}
                  onClick={() => onClearDay(dayIndex)}
                >
                  {t("planner.clearDay")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <PlannerLegend weekendOn={layout.on} />
    </section>
  );
}
