import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dict, t } from "../i18n/index.js";
import { slotLabel, weekendDaysLabel } from "../lib/plannerSlots.js";

// An empty slot's pop-up card on a computer: "Add to Wed · Breakfast" with
// Recipe, Note and Nothing planned. It sits under the slot that was clicked
// (above it when there is no room), and closes with ×, Escape or a click
// outside. Recipe makes the slot the finder's target; Note and Nothing planned
// fill the slot straight away.
export function SlotCard({ slot, anchor, onRecipe, onNote, onBlank, onClose }) {
  const cardRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const margin = 12;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - margin && rect.top - 8 - height > margin ? rect.top - 8 - height : below;
    setPos({ left: left + window.scrollX, top: top + window.scrollY });
  }, [anchor, slot]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (!cardRef.current?.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={cardRef}
      className="riso-theme riso-slotcard"
      data-theme="light"
      role="dialog"
      aria-label={t("tray.addTo", { slot: slotLabel(slot) })}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="riso-slotcard-head">
        <div>
          <span className="riso-slotcard-caps">{t("finder.addTo")}</span>
          <h2 className="riso-slotcard-title">{slotLabel(slot)}</h2>
        </div>
        <button type="button" className="riso-slotcard-close" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="riso-slotcard-buttons">
        <button type="button" className="riso-slotcard-btn recipe" onClick={onRecipe}>
          <span aria-hidden="true">+</span>
          {t("planner.slotRecipe")}
        </button>
        <button type="button" className="riso-slotcard-btn note" onClick={onNote}>
          <span aria-hidden="true">✎</span>
          {t("planner.slotNote")}
        </button>
        <button type="button" className="riso-slotcard-btn blank" onClick={onBlank}>
          <span aria-hidden="true">○</span>
          {t("planner.slotBlank")}
        </button>
      </div>
    </div>,
    document.body
  );
}

// "Weekend: Sat Sun ▾": which days the board groups as the weekend. It opens a
// row of the seven days to switch on or off; the choice is saved for the
// account (and so follows it to other devices).
export function WeekendControl({ days, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = new Set(days);
  const names = dict().days.long;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(day) {
    const next = selected.has(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    onChange(next);
  }

  return (
    <div className="riso-weekend" ref={wrapRef}>
      <button
        type="button"
        className="riso-weekend-pill"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {days.length > 0 ? t("planner.weekendPill", { days: weekendDaysLabel(days) }) : t("planner.weekendNone")}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="riso-weekend-panel" role="group" aria-label={t("planner.weekendTitle")}>
          <span className="riso-weekend-caps">{t("planner.weekendTitle")}</span>
          <div className="riso-weekend-days">
            {names.map((name, day) => (
              <button
                key={day}
                type="button"
                className={`riso-weekend-day${selected.has(day) ? " on" : ""}`}
                aria-pressed={selected.has(day)}
                onClick={() => toggle(day)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
