import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { dict, t } from "../i18n/index.js";
import { formatDayLabel, isPastDay } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, canClearDay, isNoteEntry, slotKey } from "../lib/plannerSlots.js";
import {
  COL_W,
  EDGE,
  INLINE_PLANNED_H,
  INLINE_SLOT_H,
  boardGeometry,
  clampPage,
  dayX,
  notchLeft,
  pageAfterSwipe,
  trackX,
  weekendBands,
} from "../lib/plannerPhone.js";
import { PlannerMealCard, PlannerNoteCard, computeStaleLeftoverIds } from "./PlannerBoard.jsx";

// The Planner board on a phone (design: docs/design/riso-v2-planner-mobile-v2).
// Three days in view, seven on a track that slides under the pinned meal names.
// It draws the same cards as the computer's board (PlannerMealCard,
// PlannerNoteCard) and the same drop slots (`day-<d>-<meal>`), so dragging,
// swapping and removing all go through the one setup in App.jsx.
//
//   page, onPageChange  which three days are in view (0 = Mon–Wed, 1 = Thu–Sat,
//                       2 = Fri–Sun); the page stickers in the header and a swipe
//                       along the board change it
//   inline              the card open under a slot, { slot, node, planned }: it
//                       opens under that slot's row and pushes the rows below
//                       it down (the pinned names and the weekend band follow)
//
// The rest is the computer board's: entries, weekStart, weekend, selectedSlot,
// leftoverMode, onCardClick, onNoteClick, onRemove, onClearDay, onEmptyClick.

const EDGE_PAGING_ZONE = 44; // how near the screen's side a dragged card must be to turn the page
const TRASH_H = 84;

function dayName(i) {
  return dict().days.short[i].replace(/\.$/, "").toUpperCase();
}

function PhoneCell({ day, meal, mealType, entry, staleIds, isPast, selected, leftoverMode, x, y, onCardClick, onNoteClick, onRemove, onCycleState, onEmptyClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}-${mealType}` });
  const classes = ["pmb-cell"];
  if (isPast) classes.push("past");
  if (isOver) classes.push("drop-active");
  if (selected) classes.push("selected");

  let inside;
  if (!entry) {
    inside = (
      <button
        type="button"
        className={`pmb-empty${leftoverMode ? " leftover-target" : ""}`}
        disabled={isPast}
        aria-label={leftoverMode ? t("planner.leftoversOnMealDay", { meal: MEAL_LABEL[mealType], day: DAY_SHORT[day] }) : t("planner.emptyAria", { meal: MEAL_LABEL[mealType], day: DAY_SHORT[day] })}
        onClick={(e) => onEmptyClick({ dayOfWeek: day, mealType }, e.currentTarget.closest(".pmb-cell"), meal)}
      >
        {leftoverMode ? t("planner.leftoversCell") : t("planner.addShort")}
      </button>
    );
  } else if (isNoteEntry(entry)) {
    inside = <PlannerNoteCard entry={entry} mealIndex={meal} isPast={isPast} onEdit={isPast ? () => {} : onNoteClick} onRemove={isPast ? () => {} : onRemove} />;
  } else {
    inside = (
      <PlannerMealCard
        entry={entry}
        mealIndex={meal}
        isPast={isPast}
        isStale={staleIds.has(entry.id)}
        onClick={isPast ? () => {} : onCardClick}
        onRemove={onRemove}
        onCycleState={onCycleState}
      />
    );
  }

  return (
    <div ref={setNodeRef} className={classes.join(" ")} style={{ left: x, top: y }}>
      {inside}
    </div>
  );
}

export function PlannerBoardPhone({
  entries,
  weekStart,
  weekend,
  boardRef,
  page,
  onPageChange,
  selectedSlot,
  leftoverMode,
  onCardClick,
  onNoteClick,
  onRemove,
  onClearDay,
  onCycleState,
  onEmptyClick,
  inline,
  leftoverItems = [],
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);
  const staleIds = computeStaleLeftoverIds(entries, leftoverItems);

  const viewportRef = useRef(null);
  const insRef = useRef(null);
  const [dx, setDx] = useState(0); // a finger that is down, along the board
  const [width, setWidth] = useState(390);
  const swipe = useRef(null);
  const swiped = useRef(false);
  const dragging = useRef(false);
  const edge = useRef({ side: 0, timer: null });
  const pageRef = useRef(page);
  pageRef.current = page;

  // The open card's height pushes the rows below it down; it is measured (a note
  // being typed makes it taller), starting from the design's two heights.
  const insKey = inline ? `${inline.slot.dayOfWeek}-${inline.slot.mealType}` : null;
  const [insH, setInsH] = useState(0);
  useLayoutEffect(() => {
    const el = insRef.current;
    if (!inline || !el) {
      setInsH(0);
      return undefined;
    }
    const measure = () => setInsH(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insKey]);

  const openMeal = inline ? MEAL_TYPES.findIndex((m) => m.id === inline.slot.mealType) : -1;
  const open = inline ? { meal: openMeal, height: insH || (inline.planned ? INLINE_PLANNED_H : INLINE_SLOT_H) } : null;
  const geo = boardGeometry(open);
  const bands = weekendBands(weekend, geo);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new week arrives without sliding.
  const shownWeek = useRef(weekStart);
  const instant = shownWeek.current !== weekStart;
  useEffect(() => {
    shownWeek.current = weekStart;
  });

  // The page opens under the open card: bring the card into view.
  useEffect(() => {
    if (insKey) insRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [insKey]);

  // ---- Swipe along the board turns the page ----
  const resetSwipe = () => {
    swipe.current = null;
    setDx(0);
  };
  const onPointerDown = (e) => {
    swiped.current = false;
    if (dragging.current || e.target.closest?.(".pmb-inline")) return;
    swipe.current = { x: e.clientX, y: e.clientY, live: false };
  };
  const onPointerMove = (e) => {
    const s = swipe.current;
    if (!s || dragging.current) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!s.live) {
      if (Math.abs(moveX) < 8 || Math.abs(moveX) < Math.abs(moveY) * 1.5) return;
      s.live = true;
    }
    // At the ends the board resists.
    const p = pageRef.current;
    const blocked = (p === 0 && moveX > 0) || (p === 2 && moveX < 0);
    setDx(blocked ? moveX / 4 : moveX);
  };
  const onPointerUp = () => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.live) return;
    swiped.current = true;
    const moved = dx;
    setDx(0);
    onPageChange(pageAfterSwipe(pageRef.current, moved));
  };
  // A swipe that ends on a card must not also open it.
  const onClickCapture = (e) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  // ---- Dragging a card to the screen's side turns the page ----
  const stopEdge = useCallback(() => {
    clearTimeout(edge.current.timer);
    edge.current = { side: 0, timer: null };
  }, []);
  useDndMonitor({
    onDragStart() {
      dragging.current = true;
      resetSwipe();
    },
    onDragMove(event) {
      const el = viewportRef.current;
      const start = event.activatorEvent;
      if (!el || start?.clientX == null) return;
      const x = start.clientX + event.delta.x;
      const y = start.clientY + event.delta.y;
      const box = el.getBoundingClientRect();
      const inRows = y > box.top - 24 && y < Math.min(box.bottom + 24, window.innerHeight - TRASH_H);
      const side = !inRows ? 0 : x < box.left + EDGE_PAGING_ZONE ? -1 : x > box.right - EDGE_PAGING_ZONE ? 1 : 0;
      if (side === edge.current.side) return;
      stopEdge();
      if (!side) return;
      const turn = () => {
        onPageChange(clampPage(pageRef.current + side));
        edge.current.timer = setTimeout(turn, 800);
      };
      edge.current = { side, timer: setTimeout(turn, 450) };
    },
    onDragEnd() {
      dragging.current = false;
      stopEdge();
    },
    onDragCancel() {
      dragging.current = false;
      stopEdge();
    },
  });
  useEffect(() => stopEdge, [stopEdge]);

  const moving = dx !== 0;
  const selected = (day, mealType) => selectedSlot?.dayOfWeek === day && selectedSlot?.mealType === mealType;

  return (
    <section className="pmb" ref={boardRef} aria-label={t("planner.boardAria")}>
      <div
        ref={viewportRef}
        className="pmb-viewport"
        style={{ height: geo.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={resetSwipe}
        onPointerLeave={(e) => e.pointerType === "mouse" && swipe.current && onPointerUp()}
        onClickCapture={onClickCapture}
      >
        <div className="pmb-track" style={{ transform: `translateX(${trackX(page, dx)}px)`, transition: moving || instant ? "none" : undefined }}>
          <svg className="pmb-bands" width={dayX(6) + COL_W + 40} height={geo.height} aria-hidden="true">
            {bands.map((band) => (
              <path key={band.key} d={band.d} />
            ))}
          </svg>
          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
            const { dayNum, isToday } = formatDayLabel(weekStart, day);
            return (
              <div key={day} className={`pmb-day${isToday ? " today" : ""}${isPastDay(weekStart, day) ? " past" : ""}`} style={{ left: dayX(day) }}>
                <span className="pmb-day-name">{isToday ? t("planner.todayShort") : dayName(day)}</span>
                <span className="pmb-day-num">{dayNum}</span>
              </div>
            );
          })}
          {[0, 1, 2, 3, 4, 5, 6].flatMap((day) =>
            MEAL_TYPES.map((meal, mealIndex) => (
              <PhoneCell
                key={`${day}-${meal.id}`}
                day={day}
                meal={mealIndex}
                mealType={meal.id}
                entry={(grouped[slotKey(day, meal.id)] || [])[0]}
                staleIds={staleIds}
                isPast={isPastDay(weekStart, day)}
                selected={selected(day, meal.id)}
                leftoverMode={leftoverMode && !isPastDay(weekStart, day)}
                x={dayX(day)}
                y={geo.rowTop(mealIndex)}
                onCardClick={onCardClick}
                onNoteClick={onNoteClick}
                onRemove={onRemove}
                onCycleState={onCycleState}
                onEmptyClick={onEmptyClick}
              />
            ))
          )}
          {[0, 1, 2, 3, 4, 5, 6].map(
            (day) =>
              canClearDay(entries, weekStart, day) && (
                <button
                  key={`clear-${day}`}
                  type="button"
                  className="riso-planner-clear pmb-clear"
                  style={{ left: dayX(day), top: geo.viderTop }}
                  aria-label={t("planner.clearDayAria", { day: dict().days.long[day] })}
                  onClick={() => onClearDay(day)}
                >
                  {t("planner.clearDay")}
                </button>
              )
          )}
        </div>

        {/* The meal names stay at the left edge while the days slide. */}
        {MEAL_TYPES.map((meal, mealIndex) => (
          <span key={meal.id} className="pmb-meal" style={{ top: geo.labelTop(mealIndex) }}>
            {meal.label}
          </span>
        ))}

        {inline && (
          <div
            key={insKey}
            ref={insRef}
            className="pmb-inline"
            style={{ top: geo.insertTop, "--pmb-notch": `${notchLeft(inline.slot.dayOfWeek, page, width)}px` }}
          >
            {inline.node}
          </div>
        )}
      </div>
    </section>
  );
}
