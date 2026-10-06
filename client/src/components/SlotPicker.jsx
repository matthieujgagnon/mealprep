import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { formatDayLabel, formatWeekLabel, isPastDay, shiftWeek } from "../lib/dates.js";
import { MEAL_TYPES, findNextEmptySlot, isCustomNote, isEmojiOnly, isNoteEntry, slotKey, slotLabel, upcomingSlots } from "../lib/plannerSlots.js";
import { weekendLayout } from "../lib/weekend.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { dict, t } from "../i18n/index.js";

// The slot picker (design: docs/design/riso-v2-planner-desktop, "Slot picker"):
// a small week to choose the day and meal in, with ‹ › to move between weeks, a
// line saying whether the slot is free or what it replaces, and the confirm
// button. It is the one way to choose where a recipe goes: App.jsx opens it
// (requestPlan) from the finder's +, and from "Plan" in the recipe pop-out on
// Planner, Recipes and Home, so it works the same from any page.
//
//   recipe        the recipe being placed
//   weekStart     the week it opens on (the one the Planner last showed)
//   entries       that week's entries (a slot holds one thing); other weeks are read here
//   weekend       the account's weekend: its slots are tinted
//   initialSlot   the slot to start on (the chosen target), else the next empty one
//   onConfirm(slot, week), onClose
export function SlotPicker({ recipe, weekStart, entries, weekend, initialSlot, onConfirm, onClose }) {
  const [week, setWeek] = useState(weekStart);
  const [otherEntries, setOtherEntries] = useState(null); // the entries of `week` when it is not `weekStart`
  const [slot, setSlot] = useState(() => initialSlot || findNextEmptySlot(entries, weekStart) || upcomingSlots(weekStart)[0]);
  const names = dict().days.short;
  const layout = useMemo(() => weekendLayout(weekend), [weekend]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Another week's entries are read when you move to it.
  useEffect(() => {
    if (week === weekStart) {
      setOtherEntries(null);
      return undefined;
    }
    let cancelled = false;
    setOtherEntries(null);
    api
      .listPlanner(week)
      .then((rows) => !cancelled && setOtherEntries(rows))
      .catch(() => !cancelled && setOtherEntries([]));
    return () => {
      cancelled = true;
    };
  }, [week, weekStart]);

  const shown = week === weekStart ? entries : otherEntries || [];
  const loading = week !== weekStart && otherEntries === null;
  const bySlot = new Map(shown.map((e) => [slotKey(e.dayOfWeek, e.mealType), e]));
  const taken = bySlot.get(slotKey(slot.dayOfWeek, slot.mealType));
  const takenTitle = taken ? (taken.recipe?.isPlaceholder ? (isCustomNote(taken) ? taken.recipe.title : t("planner.blankName")) : taken.recipe.title) : null;

  return createPortal(
    <div className="riso-theme riso-picker-backdrop" data-theme="light" onClick={onClose}>
      <div className="riso-picker" role="dialog" aria-modal="true" aria-label={t("planner.pickerTitle")} onClick={(e) => e.stopPropagation()}>
        <header className="riso-picker-head">
          <span className="riso-picker-photo">{recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}</span>
          <div className="riso-picker-titlewrap">
            <span className="riso-slotcard-caps">{t("planner.pickerAdd")}</span>
            <h2 className="riso-picker-title">{recipe.title}</h2>
          </div>
          <button type="button" className="riso-slotcard-close" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="riso-picker-weeknav">
          <span className="riso-slotcard-caps">{t("planner.pickerPick")}</span>
          <div className="riso-picker-weekctl" role="group" aria-label={t("planner.weekNavAria")}>
            <button type="button" className="riso-planner-nav-arrow small" onClick={() => setWeek(shiftWeek(week, -1))} aria-label={t("planner.prevWeek")}>
              ‹
            </button>
            <span className="riso-picker-weeklabel">{formatWeekLabel(week)}</span>
            <button type="button" className="riso-planner-nav-arrow small" onClick={() => setWeek(shiftWeek(week, 1))} aria-label={t("planner.nextWeek")}>
              ›
            </button>
          </div>
        </div>
        <div className="riso-picker-grid" role="group" aria-label={t("planner.pickerPick")}>
          <span />
          {names.map((name, day) => {
            const { isToday } = formatDayLabel(week, day);
            return (
              <span key={day} className={`riso-picker-head${isToday ? " today" : ""}`}>
                {isToday ? t("planner.todayShort") : name}
              </span>
            );
          })}
          {MEAL_TYPES.map((meal, mealIndex) => (
            <div key={meal.id} className="riso-picker-row">
              <span className="riso-picker-meal">{meal.label}</span>
              {names.map((name, day) => {
                const entry = bySlot.get(slotKey(day, meal.id));
                const on = slot.dayOfWeek === day && slot.mealType === meal.id;
                const note = entry && isNoteEntry(entry) && isCustomNote(entry) ? entry.recipe.title : null;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`riso-picker-cell${entry ? " filled" : ""}${on ? " on" : ""}${layout.isWeekendSlot(day, mealIndex) ? " weekend" : ""}${isPastDay(week, day) ? " past" : ""}`}
                    aria-pressed={on}
                    aria-label={`${slotLabel({ dayOfWeek: day, mealType: meal.id })}${entry ? `: ${entry.recipe?.title || ""}` : ""}`}
                    onClick={() => setSlot({ dayOfWeek: day, mealType: meal.id })}
                  >
                    {entry && !isNoteEntry(entry) && entry.recipe.photoUrl && <RecipePhoto src={entry.recipe.photoUrl} alt="" />}
                    {note && isEmojiOnly(note) && <span className="riso-picker-emoji">{note}</span>}
                    {on && <span className="riso-picker-plus">+</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className={`riso-picker-status${taken ? " taken" : ""}`} role="status">
          {taken ? t("finder.replaces", { title: takenTitle }) : t("planner.pickerFree")}
        </div>
        <button type="button" className="riso-picker-confirm" disabled={loading} onClick={() => onConfirm(slot, week)}>
          {t("tray.addTo", { slot: slotLabel(slot) })}
        </button>
      </div>
    </div>,
    document.body
  );
}
