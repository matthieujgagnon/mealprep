import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDayLabel, isPastDay } from "../lib/dates.js";
import { MEAL_TYPES, isCustomNote, isEmojiOnly, isNoteEntry, slotKey, slotLabel } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { dict, t } from "../i18n/index.js";

// The slot picker (design: docs/design/riso-v2-planner-desktop, "Slot picker"):
// when a result's + is pressed and no slot is chosen, a small week to pick the
// slot in, a line saying whether it is free or what it replaces, and the
// confirm button. It opens on the slot the + would have used (`initialSlot`).
//
//   recipe        the recipe being placed
//   entries       the week's entries (a slot holds one thing)
//   weekStart     the week shown
//   layout        weekendLayout(...): the weekend's slots are tinted
//   onConfirm(slot), onClose
export function SlotPicker({ recipe, entries, weekStart, layout, initialSlot, onConfirm, onClose }) {
  const [slot, setSlot] = useState(initialSlot);
  const names = dict().days.short;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bySlot = new Map(entries.map((e) => [slotKey(e.dayOfWeek, e.mealType), e]));
  const taken = bySlot.get(slotKey(slot.dayOfWeek, slot.mealType));
  const takenTitle = taken ? (taken.recipe?.isPlaceholder ? (isCustomNote(taken) ? taken.recipe.title : t("planner.blankName")) : taken.recipe.title) : null;

  return createPortal(
    <div className="riso-theme riso-picker-backdrop" data-theme="light" onClick={onClose}>
      <div className="riso-picker" role="dialog" aria-modal="true" aria-label={t("planner.pickerTitle")} onClick={(e) => e.stopPropagation()}>
        <header className="riso-picker-head">
          <span className="riso-picker-photo">{recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}</span>
          <div className="riso-picker-titlewrap">
            <span className="riso-slotcard-caps">{t("planner.pickerAdd")}</span>
            <h2 className="riso-picker-title">{recipe.title}</h2>
          </div>
          <button type="button" className="riso-slotcard-close" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </header>

        <span className="riso-slotcard-caps">{t("planner.pickerPick")}</span>
        <div className="riso-picker-grid" role="group" aria-label={t("planner.pickerPick")}>
          <span />
          {names.map((name, day) => {
            const { isToday } = formatDayLabel(weekStart, day);
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
                    className={`riso-picker-cell${entry ? " filled" : ""}${on ? " on" : ""}${layout.isWeekendSlot(day, mealIndex) ? " weekend" : ""}${isPastDay(weekStart, day) ? " past" : ""}`}
                    aria-pressed={on}
                    aria-label={`${slotLabel({ dayOfWeek: day, mealType: meal.id })}${entry ? `: ${entry.recipe?.title || ""}` : ""}`}
                    onClick={() => setSlot({ dayOfWeek: day, mealType: meal.id })}
                  >
                    {entry && !isNoteEntry(entry) && entry.recipe.photoUrl && <img src={entry.recipe.photoUrl} alt="" onError={hideBrokenPhoto} />}
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
        <button type="button" className="riso-picker-confirm" onClick={() => onConfirm(slot)}>
          {t("tray.addTo", { slot: slotLabel(slot) })}
        </button>
      </div>
    </div>,
    document.body
  );
}
