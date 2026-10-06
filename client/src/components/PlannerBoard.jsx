import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";
import { formatDayLabel, isCurrentWeek, isPastDay } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, PHONE_PAGE_STARTS, canClearDay, isCustomNote, isEmojiOnly, isNoteEntry, pageOfDay, slotKey, todayIndex } from "../lib/plannerSlots.js";
import { PlannerLegend } from "./PlannerLegend.jsx";
import { weekendLayout } from "../lib/weekend.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { dict, t } from "../i18n/index.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// The phone board (design: docs/design/riso-v2-planner-header, "Board changes on
// phone"): the same grid, three days in view, a sticky meal column the days
// slide under, and a nav row above it. Sizes are px and match the CSS.
const PHONE_LABEL = 56;
const PHONE_GAP = 8;
const PHONE_EDGE = 28; // how close to the edge a dragged card must be to page the board
const clampPage = (p) => Math.min(PHONE_PAGE_STARTS.length - 1, Math.max(0, p));

// "MON" / "LUN": a day's short name for the nav label.
const shortDayName = (i) => dict().days.short[i].replace(/\.$/, "").toUpperCase();

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
          <RecipePhoto src={recipe.photoUrl} alt="" className="riso-planner-card-photo" draggable="false" />
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
  onClearDay,
  onCycleState,
  onEmptyClick,
  onWeekendMenu,
  overlay,
  phone = false,
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const scrollRef = useRef(null);
  const layout = weekendLayout(weekend, phone ? { gap: PHONE_GAP } : undefined);
  const currentWeek = isCurrentWeek(weekStart);

  // All seven days fit on a computer; in a narrow window the board scrolls
  // sideways and opens with today in the middle (the first day for any other
  // week).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || phone) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const today = el.querySelector(".riso-planner-day-header.is-today");
    el.scrollLeft = currentWeek && today ? Math.max(0, today.offsetLeft - (el.clientWidth - today.offsetWidth) / 2) : 0;
  }, [weekStart, currentWeek, phone]);

  // ---- Phone: three days at a time ----
  const [page, setPage] = useState(() => pageOfDay(isCurrentWeek(weekStart) ? todayIndex() : 0));
  const [colW, setColW] = useState(84);
  const seen = useRef({ week: null, col: null });
  const swipe = useRef(null);
  const dragHappened = useRef(false);
  const edge = useRef({ side: 0, timer: null });
  const shiftKey = layout.shiftX.join();

  // The weekend nudges the columns to the right, a little more for each day, and
  // its dotted block reaches past the last one: that room is kept on every page.
  const reserve = Math.max(...PHONE_PAGE_STARTS.map((start) => layout.shiftX[start + 2] - layout.shiftX[start])) + (layout.on ? 10 : 0);

  // The columns are sized so exactly three days fit beside the meal labels.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!phone || !el) return undefined;
    const measure = () => setColW(Math.max(60, Math.floor((el.clientWidth - PHONE_LABEL - PHONE_GAP * 3 - reserve) / 3)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone, reserve]);

  // The page with today opens first (the first page for another week); paging
  // is a scroll, smooth unless the week or the width just changed.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!phone || !el) return;
    const weekChanged = seen.current.week !== weekStart;
    const instant = weekChanged || seen.current.col !== colW || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    seen.current = { week: weekStart, col: colW };
    const want = weekChanged ? pageOfDay(currentWeek ? todayIndex() : 0) : page;
    if (want !== page) setPage(want);
    const start = PHONE_PAGE_STARTS[want];
    el.scrollTo({ left: start * (colW + PHONE_GAP) + layout.shiftX[start], behavior: instant ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, weekStart, page, colW, shiftKey]);

  // Dragging a card toward the left or right edge pages the board once it has
  // rested there for a moment, so a card can be carried to any day.
  const stopEdge = useCallback(() => {
    clearTimeout(edge.current.timer);
    edge.current = { side: 0, timer: null };
  }, []);
  useDndMonitor({
    onDragStart() {
      dragHappened.current = true;
    },
    onDragMove(event) {
      const el = scrollRef.current;
      const start = event.activatorEvent;
      if (!phone || !el || start?.clientX == null) return;
      const x = start.clientX + event.delta.x;
      const y = start.clientY + event.delta.y;
      const box = el.getBoundingClientRect();
      const inRows = y > box.top - 24 && y < box.bottom + 24;
      const side = !inRows ? 0 : x < box.left + PHONE_LABEL + PHONE_EDGE ? -1 : x > box.right - PHONE_EDGE ? 1 : 0;
      if (side === edge.current.side) return;
      stopEdge();
      if (!side) return;
      const turn = () => {
        setPage((p) => clampPage(p + side));
        edge.current.timer = setTimeout(turn, 800);
      };
      edge.current = { side, timer: setTimeout(turn, 450) };
    },
    onDragEnd: stopEdge,
    onDragCancel: stopEdge,
  });

  const firstDay = PHONE_PAGE_STARTS[page];
  const lastDay = firstDay + 2;
  const pageLabel = `${shortDayName(firstDay)} ${formatDayLabel(weekStart, firstDay).dayNum} – ${shortDayName(lastDay)} ${formatDayLabel(weekStart, lastDay).dayNum}`;

  // A swipe along the board turns the page; one that was really a drag does not.
  const swipeHandlers = phone
    ? {
        onTouchStart: (e) => {
          dragHappened.current = false;
          swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        },
        onTouchEnd: (e) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from || dragHappened.current) return;
          const dx = e.changedTouches[0].clientX - from.x;
          const dy = e.changedTouches[0].clientY - from.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage((p) => clampPage(p + (dx < 0 ? 1 : -1)));
        },
      }
    : {};

  return (
    <section className={`riso-planner-board${phone ? " paged" : ""}`} ref={boardRef} style={phone ? { "--rpm-col": `${colW}px` } : undefined}>
      {!layout.on && (
        <button type="button" className="riso-planner-weekend-off" data-weekend-toggle onClick={onWeekendMenu}>
          + {t("planner.weekendTag")}
        </button>
      )}
      {overlay}
      {phone && (
        <div className="riso-planner-pagenav">
          <button type="button" className="riso-planner-pagebtn" aria-label={t("planner.pagePrev")} disabled={page === 0} onClick={() => setPage((p) => clampPage(p - 1))}>
            ‹
          </button>
          <span className="riso-planner-pagelabel" role="status">
            {pageLabel}
          </span>
          <button
            type="button"
            className="riso-planner-pagebtn next"
            aria-label={t("planner.pageNext")}
            disabled={page === PHONE_PAGE_STARTS.length - 1}
            onClick={() => setPage((p) => clampPage(p + 1))}
          >
            ›
          </button>
        </div>
      )}
      <div className="riso-planner-scroll" ref={scrollRef} style={{ paddingRight: layout.padRight, paddingBottom: layout.padBottom }} {...swipeHandlers}>
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
          <div className="riso-planner-corner" style={{ gridColumn: 1, gridRow: 1 }} {...(phone ? { "data-drop-block": "" } : {})} />
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
              <div className="riso-planner-meal-label" style={{ gridColumn: 1, gridRow: mealIndex + 2 }} {...(phone ? { "data-drop-block": "" } : {})}>
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

          {phone && <div className="riso-planner-corner" style={{ gridColumn: 1, gridRow: MEAL_TYPES.length + 2 }} data-drop-block="" />}
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
