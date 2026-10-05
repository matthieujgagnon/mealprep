import { useLayoutEffect, useRef, useState } from "react";
import { BottomSheet } from "./RisoControls.jsx";
import { NoteTextarea, computeStaleLeftoverIds } from "./PlannerBoard.jsx";
import { PlannerCalendar } from "./PlannerCalendar.jsx";
import { useGroceryToBuyCount } from "../hooks/useGroceryToBuyCount.js";
import {
  formatDayLabel,
  formatWeekRangeLabel,
  isCurrentWeek,
  isPastDay,
  shiftWeek,
  toDateKey,
} from "../lib/dates.js";
import { centerScroll, weekOf } from "../lib/plannerCalendar.js";
import { MEAL_TYPES, isCustomNote, isEmojiOnly, isNoteEntry, slotKey, slotLabel, todayIndex, weekendRuns } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { dict, t } from "../i18n/index.js";

// The Planner on a phone (design handoff:
// docs/design/planner-mobile-and-recipes/README.md): the whole week as a board
// of seven day columns, three in view, scrolling sideways with the meal labels
// staying put; a week pill that opens a month calendar; and a button at the
// bottom that goes to the grocery list. No drag and drop on a phone: tapping a
// card or an empty cell opens the bottom card, with the shared recipe finder in
// it (Planner.jsx hands it in as `finder`).

const COL = 104;
const GAP = 8;
const PAD = 18; // the page's side gutter on a phone

// "25 MIN", "1 H", "1 H 30".
function cellTime(minutes) {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} MIN`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} H${rest ? ` ${rest}` : ""}`;
}

// "jeu." -> "JEU"
const shortDay = (i) => dict().days.short[i].replace(/\.$/, "").toUpperCase();

function Cell({ entry, slot, meal, dayName, past, stale, editing, leftoverMode, onTap, onEditNote, onSaveNote, onRemove }) {
  if (!entry) {
    return (
      <button
        type="button"
        className={`rpm-cell empty${past ? " past" : ""}${leftoverMode ? " leftover-target" : ""}`}
        aria-label={
          leftoverMode
            ? t("planner.leftoversOnMealDay", { meal: meal.label.toLowerCase(), day: dayName })
            : t("planner.emptyAria", { meal: meal.label.toLowerCase(), day: dayName })
        }
        onClick={() => onTap(slot)}
      >
        {leftoverMode ? t("planner.leftoversCell") : t("planner.addCell")}
      </button>
    );
  }
  if (isNoteEntry(entry)) {
    const custom = isCustomNote(entry);
    if (editing) {
      return (
        <div className={`rpm-cell note editing${past ? " past" : ""}`}>
          <NoteTextarea
            initial={custom ? entry.recipe.title : ""}
            label={t("planner.writeOnMeal", { meal: meal.label.toLowerCase() })}
            onSave={(text) => onSaveNote(entry.id, text)}
            className="riso-planner-note-input"
          />
        </div>
      );
    }
    return (
      <button
        type="button"
        className={`rpm-cell note${custom ? "" : " blank"}${past ? " past" : ""}`}
        onClick={() => (custom ? onEditNote(entry.id) : onRemove(entry.id))}
        aria-label={custom ? t("planner.tapEditAria", { title: entry.recipe.title }) : t("planner.blankTapAria")}
      >
        {custom && <span className="rpm-note-label">{t("same.noteCaps")}</span>}
        {custom && <span className={`rpm-note-text${isEmojiOnly(entry.recipe.title) ? " emoji" : ""}`}>{entry.recipe.title}</span>}
      </button>
    );
  }
  const { recipe } = entry;
  const time = cellTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  return (
    <button
      type="button"
      className={`rpm-cell card${entry.alreadyHave ? " have" : ""}${past ? " past" : ""}`}
      aria-label={t("planner.cellAria", { title: recipe.title, meal: meal.label.toLowerCase(), day: dayName })}
      onClick={() => onTap(slot)}
    >
      <span className="rpm-cell-photo">
        {recipe.photoUrl && <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} />}
        {entry.alreadyHave && <span className="rpm-cell-have" aria-hidden="true">✓</span>}
        {entry.isLeftover && <span className={`rpm-leftover${stale ? " stale" : ""}`}>{stale ? t("planner.pastFridge") : t("planner.leftover")}</span>}
      </span>
      <span className="rpm-cell-body">
        <span className="rpm-cell-title">{recipe.title}</span>
        {time && <span className="rpm-cell-time">{time}</span>}
      </span>
    </button>
  );
}

export function PlannerMobile({
  entries,
  weekStart,
  onChangeWeek,
  weekend,
  target,
  onSelectSlot,
  onOpenRecipe,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onMarkBlank,
  onEditNote,
  onSaveNote,
  leftoverMode,
  leftoverTitle,
  onLeftoverCell,
  onLeftoverDone,
  finder,
  customStaples,
  excludedStaples,
  onOpenGrocery,
}) {
  const currentWeek = isCurrentWeek(weekStart);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const boardRef = useRef(null);
  const buyCount = useGroceryToBuyCount({ customStaples, excludedStaples, refreshKey: entries });

  const grouped = {};
  for (const e of entries) (grouped[slotKey(e.dayOfWeek, e.mealType)] ||= []).push(e);
  const staleIds = computeStaleLeftoverIds(entries);

  // The week's board opens with today's column in the middle (the first day for
  // another week), the same as the desktop planner.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.scrollLeft = currentWeek ? centerScroll({ day: todayIndex(), viewWidth: board.clientWidth, col: COL, gap: GAP, pad: PAD }) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const targetEntry = target ? (grouped[slotKey(target.dayOfWeek, target.mealType)] || [])[0] : null;
  const targetRecipeEntry = targetEntry && !isNoteEntry(targetEntry) ? targetEntry : null;
  const sheetState = targetRecipeEntry ? (targetRecipeEntry.alreadyHave ? "have" : targetRecipeEntry.isLeftover ? "leftover" : "none") : null;
  const nextMark = { none: "sheetMarkLeftover", leftover: "sheetMarkHave", have: "sheetClear" };

  function goToWeek(key) {
    setCalendarOpen(false);
    onChangeWeek(weekOf(key));
  }

  return (
    <div className="rpm">
      <div className="rpm-top">
        <span className="rpm-range">{formatWeekRangeLabel(weekStart, { year: false })}</span>
        <h1 className="riso-planner-title">
          {t("planner.title")} <span className="accent">{t("planner.titleAccent")}</span>
        </h1>
      </div>

      <div className="rpm-weekrow-wrap">
        {calendarOpen && <div className="rpm-backdrop" onClick={() => setCalendarOpen(false)} />}
        <div className="rpm-weekrow">
          <button type="button" className="rpm-round" onClick={() => onChangeWeek(shiftWeek(weekStart, -1))} aria-label={t("planner.prevWeek")}>
            ‹
          </button>
          <button
            type="button"
            className={`rpm-weekpill${calendarOpen ? " open" : ""}`}
            aria-expanded={calendarOpen}
            onClick={() => setCalendarOpen((open) => !open)}
          >
            {currentWeek ? t("planner.thisWeek").toLowerCase() : formatWeekRangeLabel(weekStart, { year: false }).toLowerCase()}{" "}
            <span aria-hidden="true">{calendarOpen ? "▴" : "▾"}</span>
          </button>
          <button type="button" className="rpm-round" onClick={() => onChangeWeek(shiftWeek(weekStart, 1))} aria-label={t("planner.nextWeek")}>
            ›
          </button>
        </div>
        {calendarOpen && (
          <PlannerCalendar
            weekStart={weekStart}
            onPick={goToWeek}
            onThisWeek={() => goToWeek(toDateKey(new Date()))}
            onClose={() => setCalendarOpen(false)}
          />
        )}
      </div>

      <div className="rpm-boardwrap">
        <div className="rpm-board" ref={boardRef} role="group" aria-label={t("planner.boardAria")}>
          <div className="rpm-board-inner">
            {weekendRuns(weekend.on ? weekend.days : []).map((run) => (
              <div
                key={run.start}
                className="rpm-weekend"
                aria-hidden="true"
                style={{
                  left: PAD + run.start * (COL + GAP) - 5,
                  width: (run.end - run.start + 1) * COL + (run.end - run.start) * GAP + 10,
                }}
              />
            ))}
            <div className="rpm-heads">
              {dict().days.long.map((name, i) => {
                const { dayNum, isToday } = formatDayLabel(weekStart, i);
                return (
                  <div key={name} className={`rpm-head${isToday ? " today" : ""}${isPastDay(weekStart, i) ? " past" : ""}`} aria-label={`${name} ${dayNum}`}>
                    <span className="rpm-head-dow">{isToday ? t("planner.todayShort") : shortDay(i)}</span>
                    <span className="rpm-head-num">{dayNum}</span>
                  </div>
                );
              })}
            </div>
            {MEAL_TYPES.map((meal) => (
              <div key={meal.id} className="rpm-mealrow">
                <span className="rpm-meallabel">{meal.label}</span>
                <div className="rpm-cells">
                  {dict().days.long.map((dayName, i) => {
                    const entry = (grouped[slotKey(i, meal.id)] || [])[0];
                    return (
                      <Cell
                        key={i}
                        entry={entry}
                        slot={{ dayOfWeek: i, mealType: meal.id }}
                        meal={meal}
                        dayName={dayName}
                        past={isPastDay(weekStart, i)}
                        stale={!!entry && staleIds.has(entry.id)}
                        editing={!!entry && editingNoteId === entry.id}
                        leftoverMode={leftoverMode && !isPastDay(weekStart, i)}
                        onTap={(slot) => (leftoverMode && !entry ? onLeftoverCell(slot) : onSelectSlot(slot))}
                        onEditNote={onEditNote}
                        onSaveNote={onSaveNote}
                        onRemove={onRemove}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <span className="rpm-fade" aria-hidden="true" />
      </div>

      <div className="rpm-bottombar">
        {leftoverMode ? (
          <div className="rpm-leftoverbar" role="status">
            <span>{t("planner.leftoversBar", { title: leftoverTitle })}</span>
            <button type="button" onClick={onLeftoverDone}>
              {t("common.done")}
            </button>
          </div>
        ) : (
          <button type="button" className="rpm-makelist" onClick={onOpenGrocery}>
            {t("planner.makeList", { count: buyCount })}
          </button>
        )}
      </div>

      {target && (
        <BottomSheet label={t("planner.suggestions")} onClose={() => onSelectSlot(null)}>
          <h2 className="rpm-sheet-title-main">{t("tray.addTo", { slot: slotLabel(target) })}</h2>
          {targetRecipeEntry && (
            <div className="rpm-sheet-card">
              <div className="rpm-sheet-head">
                <strong className="rpm-sheet-title">{targetRecipeEntry.recipe.title}</strong>
                <span className="rpm-sheet-state">{t(`planner.sheetState.${sheetState}`)}</span>
              </div>
              <div className="rpm-sheet-actions">
                <button type="button" className="rpm-chip" onClick={() => onOpenRecipe(targetRecipeEntry.recipe)}>
                  {t("planner.sheetOpen")}
                </button>
                <button type="button" className="rpm-chip" onClick={() => onCycleState(targetRecipeEntry.id)}>
                  {t(`planner.${nextMark[sheetState]}`)}
                </button>
                <button
                  type="button"
                  className="rpm-chip"
                  onClick={() => {
                    onRemove(targetRecipeEntry.id);
                    onSelectSlot(null);
                  }}
                >
                  {t("planner.sheetRemove")}
                </button>
              </div>
            </div>
          )}
          {!targetEntry && (
            <div className="rpm-sheet-quick">
              <button
                type="button"
                className="rpm-sheet-note"
                onClick={() => {
                  onSelectSlot(null);
                  onWriteInSlot(target);
                }}
              >
                {t("planner.sheetNote")}
              </button>
              <button
                type="button"
                className="rpm-sheet-note"
                onClick={() => {
                  onSelectSlot(null);
                  onMarkBlank(target);
                }}
              >
                {t("planner.slotBlank")}
              </button>
            </div>
          )}
          {finder}
        </BottomSheet>
      )}
    </div>
  );
}
