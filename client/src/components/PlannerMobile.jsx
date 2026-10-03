import { useState } from "react";
import { BottomSheet } from "./RisoControls.jsx";
import { PlannerTray } from "./PlannerTray.jsx";
import { NoteTextarea, computeStaleLeftoverIds } from "./PlannerBoard.jsx";
import {
  addDays,
  formatDayLabel,
  formatWeekRangeLabel,
  formatWeekdayMonthDay,
  isCurrentWeek,
  isPastDay,
  parseDateKey,
  shiftWeek,
} from "../lib/dates.js";
import { MEAL_TYPES, isCustomNote, isEmojiOnly, isNoteEntry, slotKey, todayIndex } from "../lib/plannerSlots.js";
import { recipeHaveStats } from "../lib/onHand.js";
import { formatTrayTime } from "../lib/plannerSuggestions.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { dict, t } from "../i18n/index.js";

function MealRow({ entry, haveCores, isStale, onOpen, onSwap, onRemove, onCycleState }) {
  const { recipe } = entry;
  const stats = recipeHaveStats(recipe, haveCores);
  const time = formatTrayTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  const buy =
    entry.isLeftover || entry.alreadyHave
      ? t("planner.nothingToBuyCaps")
      : stats.missingCount > 0
        ? t("planner.toBuyCaps", { count: stats.missingCount })
        : t("planner.nothingToBuyCaps");
  return (
    <div className={`rpm-meal${entry.alreadyHave ? " have" : ""}`}>
      <button type="button" className="rpm-meal-photo" onClick={onOpen} aria-label={t("planner.open", { title: recipe.title })}>
        {recipe.photoUrl && <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} />}
        {entry.isLeftover && <span className={`rpm-leftover${isStale ? " stale" : ""}`}>{isStale ? t("planner.pastFridge") : t("planner.leftover")}</span>}
      </button>
      <button
        type="button"
        className={`rpm-have${entry.alreadyHave ? " on" : ""}`}
        onClick={onCycleState}
        aria-label={
          entry.alreadyHave
            ? t("planner.mobileHave")
            : entry.isLeftover
            ? t("planner.mobileLeftover")
            : t("planner.mobileNone")
        }
      >
        {entry.alreadyHave ? "✓" : ""}
      </button>
      <div className="rpm-meal-info">
        <button type="button" className="rpm-meal-name" onClick={onOpen}>
          {recipe.title}
        </button>
        <span className="rpm-meal-meta">{time ? `${time} · ${buy}` : buy}</span>
        <div className="rpm-meal-actions">
          <button type="button" className="rpm-chip" onClick={onSwap}>
            {t("planner.swap")}
          </button>
          <button type="button" className="rpm-chip round" onClick={onRemove} aria-label={t("planner.removeTitle", { title: recipe.title })}>
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlannerMobile({
  entries,
  weekStart,
  onChangeWeek,
  haveCores,
  target,
  onSelectSlot,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onEditNote,
  onSaveNote,
  emptyCount,
  onFillEmptySlots,
  trayProps,
}) {
  const currentWeek = isCurrentWeek(weekStart);
  const [day, setDay] = useState(currentWeek ? todayIndex() : 0);
  const grouped = {};
  for (const e of entries) (grouped[slotKey(e.dayOfWeek, e.mealType)] ||= []).push(e);
  const staleIds = computeStaleLeftoverIds(entries);
  const date = parseDateKey(addDays(weekStart, day));

  function changeWeek(w) {
    onChangeWeek(w);
    setDay(w === weekStart ? day : 0);
  }

  return (
    <div className="rpm">
      <div className="rpm-head">
        <h1 className="riso-planner-title">
          {t("planner.title")} <span className="accent">{t("planner.titleAccent")}</span>
        </h1>
        <div className="rpm-week-nav">
          <button type="button" className="riso-planner-nav-arrow" onClick={() => changeWeek(shiftWeek(weekStart, -1))} aria-label={t("planner.prevWeek")}>
            ‹
          </button>
          <span className="rpm-week-sticker">{formatWeekRangeLabel(weekStart, { year: false }).toLowerCase()}</span>
          <button type="button" className="riso-planner-nav-arrow" onClick={() => changeWeek(shiftWeek(weekStart, 1))} aria-label={t("planner.nextWeek")}>
            ›
          </button>
        </div>
      </div>

      <div className="rpm-days" role="tablist" aria-label={t("planner.dayAria")}>
        {dict().days.long.map((name, i) => {
          const { weekday, dayNum, isToday } = formatDayLabel(weekStart, i);
          const filled = MEAL_TYPES.filter((m) => grouped[slotKey(i, m.id)]?.length).length;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={i === day}
              aria-label={`${name} ${dayNum}`}
              className={`rpm-day${i === day ? " selected" : ""}${isToday ? " today" : ""}${isPastDay(weekStart, i) ? " past" : ""}`}
              onClick={() => setDay(i)}
            >
              <span className="rpm-day-dow">{(isToday ? t("days.today") : weekday).toUpperCase()}</span>
              <span className="rpm-day-num">{dayNum}</span>
              <span className="rpm-day-dots" aria-hidden="true">
                {[0, 1, 2].map((k) => (
                  <span key={k} className={k < filled ? "on" : ""} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="rpm-date">{formatWeekdayMonthDay(date)}</h2>

      {MEAL_TYPES.map((meal) => {
        const entry = (grouped[slotKey(day, meal.id)] || [])[0];
        const slot = { dayOfWeek: day, mealType: meal.id };
        return (
          <section key={meal.id} className={`rpm-slot${isPastDay(weekStart, day) ? " past" : ""}`}>
            <span className="rpm-slot-label">{meal.label.toUpperCase()}</span>
            {!entry ? (
              <div className="rpm-empty-row">
                <button
                  type="button"
                  className="rpm-empty"
                  aria-label={t("planner.writeOnMeal", { meal: meal.label.toLowerCase() })}
                  onClick={() => onWriteInSlot(slot)}
                />
                <button type="button" className="rpm-chip" onClick={() => onSelectSlot(slot)}>
                  {t("planner.addRecipeChip")}
                </button>
              </div>
            ) : isNoteEntry(entry) ? (
              editingNoteId === entry.id ? (
                <div className="rpm-note editing">
                  <NoteTextarea
                    initial={isCustomNote(entry) ? entry.recipe.title : ""}
                    label={t("planner.writeOnMeal", { meal: meal.label.toLowerCase() })}
                    onSave={(text) => onSaveNote(entry.id, text)}
                    className="riso-planner-note-input"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={`rpm-note${isCustomNote(entry) ? "" : " blank"}`}
                  onClick={() => (isCustomNote(entry) ? onEditNote(entry.id) : onRemove(entry.id))}
                  aria-label={isCustomNote(entry) ? t("planner.tapEditAria", { title: entry.recipe.title }) : t("planner.blankTapAria")}
                >
                  {isCustomNote(entry) && <span className={`rpm-note-text${isEmojiOnly(entry.recipe.title) ? " emoji" : ""}`}>{entry.recipe.title}</span>}
                </button>
              )
            ) : (
              <MealRow
                entry={entry}
                haveCores={haveCores}
                isStale={staleIds.has(entry.id)}
                onOpen={() => onCardClick(entry.recipe)}
                onSwap={() => onSelectSlot(slot)}
                onRemove={() => onRemove(entry.id)}
                onCycleState={() => onCycleState(entry.id)}
              />
            )}
          </section>
        );
      })}

      <div className="riso-planner-legend rpm-legend">
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-have" />
          {t("planner.alreadyHaveIt")}
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-leftover">{t("planner.leftover")}</span>
          {t("planner.legendLeftover")}
        </span>
      </div>

      <div className="rpm-actions">
        {emptyCount > 0 && (
          <button type="button" className="riso-btn" onClick={onFillEmptySlots}>
            {t("planner.fillEmpty", { count: emptyCount })}
          </button>
        )}

      </div>

      {target && (
        <BottomSheet label={t("planner.suggestions")} onClose={() => onSelectSlot(null)}>
          <PlannerTray {...trayProps} target={target} inSheet />
        </BottomSheet>
      )}
    </div>
  );
}
