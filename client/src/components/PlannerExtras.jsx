import { useEffect, useRef } from "react";
import { Switch } from "./RisoControls.jsx";
import { WEEKEND_PRESETS, presetIsOn, weekendSummary } from "../lib/weekend.js";
import { dict, t } from "../i18n/index.js";

// The weekend's settings, in one place: a switch to show the weekend, any days
// in any order, a switch for the evening before, and three presets. Every change
// is saved at once (for the account). The computer shows it in the menu under
// the "WEEKEND ▾" tag (WeekendMenu below); a phone shows it in the week
// calendar's "Fin de semaine" section (`inCalendar`: the title is the switch's
// label, the days are one letter each, and the line above them says what is set).
export function WeekendSettings({ weekend, onChange, inCalendar = false }) {
  const names = dict().days.short;
  const picked = new Set(weekend.days);
  const showing = weekend.on;

  function toggleDay(day) {
    const days = picked.has(day) ? weekend.days.filter((d) => d !== day) : [...weekend.days, day].sort((a, b) => a - b);
    onChange({ ...weekend, on: true, days });
  }

  const dayLabel = (day) => (inCalendar ? dict().days.long[day].charAt(0).toUpperCase() : names[day]);
  const summary = weekendSummary(weekend) || t("planner.weekendOffWord");

  return (
    <>
      <div className="riso-weekendmenu-row">
        <span className={`riso-weekendmenu-label${inCalendar ? " title" : ""}`}>{inCalendar ? t("planner.legendWeekend") : t("planner.weekendShow")}</span>
        <Switch on={weekend.on} onToggle={() => onChange({ ...weekend, on: !weekend.on })} label={t("planner.weekendShow")} />
      </div>
      <span className="riso-weekendmenu-caps">{inCalendar ? `${t("planner.weekendDays")} · ${summary}` : t("planner.weekendDays")}</span>
      <div className={`riso-weekendmenu-days${showing ? "" : " dim"}`} role="group" aria-label={t("planner.weekendDays")}>
        {names.map((name, day) => (
          <button
            key={day}
            type="button"
            className={`riso-weekendmenu-day${showing && picked.has(day) ? " on" : ""}`}
            aria-pressed={showing && picked.has(day)}
            aria-label={inCalendar ? dict().days.long[day] : undefined}
            onClick={() => toggleDay(day)}
          >
            {dayLabel(day)}
          </button>
        ))}
      </div>
      <div className={`riso-weekendmenu-row${showing ? "" : " dim"}`}>
        <span className="riso-weekendmenu-label small">{inCalendar ? t("planner.weekendEveShort") : t("planner.weekendEveSwitch")}</span>
        <Switch
          on={weekend.eve}
          onToggle={() => onChange({ ...weekend, on: true, eve: !weekend.eve })}
          label={t("planner.weekendEveSwitch")}
        />
      </div>
      <span className="riso-weekendmenu-caps">{t("planner.weekendPresetsCaps")}</span>
      <div className="riso-weekendmenu-presets">
        {WEEKEND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`riso-weekendmenu-preset${presetIsOn(preset, weekend) ? " on" : ""}`}
            aria-pressed={presetIsOn(preset, weekend)}
            onClick={() => onChange({ on: true, days: preset.days, eve: preset.eve })}
          >
            {t(`planner.weekendPresets.${preset.id}`)}
          </button>
        ))}
      </div>
    </>
  );
}

// The weekend menu under the "WEEKEND ▾" tag, on a computer. A click outside, or
// Escape, closes it.
export function WeekendMenu({ weekend, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      // The tag that opens it toggles it, so a click on that is not "outside".
      if (!ref.current?.contains(e.target) && !e.target.closest?.("[data-weekend-toggle]")) onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="riso-weekendmenu" ref={ref} role="dialog" aria-label={t("planner.weekendTag")}>
      <WeekendSettings weekend={weekend} onChange={onChange} />
      <p className="riso-weekendmenu-note">{t("planner.weekendNote")}</p>
    </div>
  );
}
