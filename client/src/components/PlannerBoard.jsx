import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { currentWeekStart, formatDayLabel, formatWeekLabel, isCurrentWeek, isPastDay, shiftWeek, toDateKey } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, isCustomNote, isEmojiOnly, isNoteEntry, slotKey } from "../lib/plannerSlots.js";
import { WeekCalendar } from "./WeekCalendar.jsx";
import { Pill } from "./RisoPills.jsx";
import { weekOf } from "../lib/plannerCalendar.js";
import { weekendLayout, weekendSummary } from "../lib/weekend.js";
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

// The header: the week picker at the left (the arrows, the week pill that opens
// the week calendar, "this week" when another week is shown, and "Copy last
// week"), then the title. The pill and the calendar say the week with
// formatWeekLabel, so the dates read the same everywhere.
//
//   lastWeekCount   how many meals last week has; "Copy last week" is off at 0
//   onCopyLastWeek  fills this week's empty slots from last week (never replaces)
export function PlannerHeader({ weekStart, onChangeWeek, lastWeekCount, onCopyLastWeek }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const wrapRef = useRef(null);
  const currentWeek = isCurrentWeek(weekStart);
  const canCopy = lastWeekCount > 0;

  useEffect(() => {
    if (!calendarOpen) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen]);

  function goToWeek(key) {
    setCalendarOpen(false);
    onChangeWeek(weekOf(key));
  }

  return (
    <div className="riso-planner-header">
      <div className="riso-planner-header-actions">
        <div className="riso-planner-weekpicker" ref={wrapRef}>
          <div className="riso-planner-nav-row">
            <button
              type="button"
              className="riso-planner-nav-arrow"
              onClick={() => onChangeWeek(shiftWeek(weekStart, -1))}
              aria-label={t("planner.prevWeek")}
            >
              ‹
            </button>
            <button
              type="button"
              className={`riso-planner-weekpill${calendarOpen ? " open" : ""}`}
              aria-expanded={calendarOpen}
              aria-haspopup="dialog"
              onClick={() => setCalendarOpen((open) => !open)}
            >
              {formatWeekLabel(weekStart)} <span aria-hidden="true">{calendarOpen ? "▴" : "▾"}</span>
            </button>
            <button
              type="button"
              className="riso-planner-nav-arrow"
              onClick={() => onChangeWeek(shiftWeek(weekStart, 1))}
              aria-label={t("planner.nextWeek")}
            >
              ›
            </button>
            {currentWeek ? (
              <Pill size="tag" tone="yellow" sticker>
                {t("planner.thisWeekBadge")}
              </Pill>
            ) : (
              <Pill size="chip" onClick={() => onChangeWeek(currentWeekStart())}>
                {t("planner.thisWeek")}
              </Pill>
            )}
            <Pill
              size="chip"
              className="riso-planner-copy"
              disabled={!canCopy}
              title={canCopy ? t("planner.copyLastWeekHint") : t("planner.copyLastWeekNone")}
              onClick={onCopyLastWeek}
            >
              {t("planner.copyLastWeek")}
            </Pill>
            {!canCopy && <span className="riso-planner-copy-note">{t("planner.copyLastWeekNone")}</span>}
          </div>
          {calendarOpen && (
            <div className="riso-planner-calpop">
              <WeekCalendar
                weekStart={weekStart}
                onPick={goToWeek}
                onThisWeek={() => goToWeek(toDateKey(new Date()))}
                onClose={() => setCalendarOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
      <h1 className="riso-planner-title">
        {t("planner.title")} <span className="accent">{t("planner.titleAccent")}</span>
      </h1>
    </div>
  );
}

function stateLabel(entry) {
  if (entry.alreadyHave) return t("planner.stateHave");
  if (entry.isLeftover) return t("planner.stateLeftover");
  return t("planner.stateNone");
}

function cellOf(e) {
  return e.currentTarget.closest(".riso-planner-cell");
}

function PlannerMealCard({ entry, mealIndex, isPast, isStale, onClick, onRemove, onCycleState }) {
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

// A slot you've written on (or marked "no meal planned"). Neither has a ×: click
// written text to edit it in the slot's card (which has Remove note); click a
// blank card to clear it (the toast has Undo).
function PlannerNoteCard({ entry, mealIndex, isPast, onEdit, onRemove }) {
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
  onCycleState,
  onEmptyClick,
  onWeekendMenu,
  overlay,
  legendExtra,
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const scrollRef = useRef(null);
  const layout = weekendLayout(weekend);
  const currentWeek = isCurrentWeek(weekStart);
  const summary = weekendSummary(weekend);

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
        </div>
      </div>

      <div className="riso-planner-legend">
        {layout.on && (
          <span className="riso-planner-legend-item">
            <i className="riso-planner-legend-swatch weekend" aria-hidden="true" />
            {t("planner.legendWeekend", { summary })}
          </span>
        )}
        <span className="riso-planner-legend-item">
          <i className="riso-planner-legend-swatch today" aria-hidden="true" />
          {t("planner.legendTodayName")}
        </span>
        <span className="riso-planner-legend-item">
          <i className="riso-planner-legend-swatch have" aria-hidden="true" />
          {t("planner.legendHave")}
        </span>
        <span className="riso-planner-legend-item">
          <i className="riso-planner-legend-swatch leftover" aria-hidden="true" />
          {t("planner.legendLeftover")}
        </span>
        {legendExtra}
      </div>
    </section>
  );
}
