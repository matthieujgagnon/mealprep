import { useEffect, useRef } from "react";
import { Switch } from "./RisoControls.jsx";
import { WEEKEND_PRESETS, presetIsOn } from "../lib/weekend.js";
import { dict, t } from "../i18n/index.js";

// The weekend menu under the "WEEKEND ▾" tag: a switch to show the weekend, any
// days in any order, a switch for the evening before, and three presets. Every
// change is saved at once (for the account). A click outside, or Escape,
// closes it.
export function WeekendMenu({ weekend, onChange, onClose }) {
  const ref = useRef(null);
  const names = dict().days.short;
  const picked = new Set(weekend.days);
  const showing = weekend.on;

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

  function toggleDay(day) {
    const days = picked.has(day) ? weekend.days.filter((d) => d !== day) : [...weekend.days, day].sort((a, b) => a - b);
    onChange({ ...weekend, on: true, days });
  }

  return (
    <div className="riso-weekendmenu" ref={ref} role="dialog" aria-label={t("planner.weekendTag")}>
      <div className="riso-weekendmenu-row">
        <span className="riso-weekendmenu-label">{t("planner.weekendShow")}</span>
        <Switch on={weekend.on} onToggle={() => onChange({ ...weekend, on: !weekend.on })} label={t("planner.weekendShow")} />
      </div>
      <span className="riso-weekendmenu-caps">{t("planner.weekendDays")}</span>
      <div className={`riso-weekendmenu-days${showing ? "" : " dim"}`} role="group" aria-label={t("planner.weekendDays")}>
        {names.map((name, day) => (
          <button
            key={day}
            type="button"
            className={`riso-weekendmenu-day${showing && picked.has(day) ? " on" : ""}`}
            aria-pressed={showing && picked.has(day)}
            onClick={() => toggleDay(day)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={`riso-weekendmenu-row${showing ? "" : " dim"}`}>
        <span className="riso-weekendmenu-label small">{t("planner.weekendEveSwitch")}</span>
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
      <p className="riso-weekendmenu-note">{t("planner.weekendNote")}</p>
    </div>
  );
}
