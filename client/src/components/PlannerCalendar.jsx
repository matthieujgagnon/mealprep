import { useEffect, useState } from "react";
import { api } from "../api.js";
import { parseDateKey, toDateKey } from "../lib/dates.js";
import { gridRange, inWeek, monthGrid, monthOf, shiftMonth } from "../lib/plannerCalendar.js";
import { dict, t } from "../i18n/index.js";

// The month calendar under the week pill: a dot under each day with a meal,
// the shown week in yellow, today in pink. Tapping a day goes to its week.
export function PlannerCalendar({ weekStart, onPick, onThisWeek, onClose }) {
  const [month, setMonth] = useState(() => monthOf(weekStart));
  const [planned, setPlanned] = useState(() => new Set());
  const today = toDateKey(new Date());

  useEffect(() => {
    const { from, to } = gridRange(month);
    let cancelled = false;
    api
      .listPlannedDates(from, to)
      .then((days) => !cancelled && setPlanned(new Set(days)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="rpm-cal" role="dialog" aria-label={t("planner.calendarAria")}>
      <span className="rpm-cal-caret" aria-hidden="true" />
      <div className="rpm-cal-head">
        <h2 className="rpm-cal-title">
          {dict().months.long[month.month].toLowerCase()} <span className="accent">{month.year}</span>
        </h2>
        <div className="rpm-cal-nav">
          <button type="button" className="rpm-round" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t("planner.calPrevMonth")}>
            ‹
          </button>
          <button type="button" className="rpm-round" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t("planner.calNextMonth")}>
            ›
          </button>
        </div>
      </div>
      <div className="rpm-cal-dows" aria-hidden="true">
        {dict().days.long.map((name, i) => (
          <span key={i}>{name.charAt(0).toUpperCase()}</span>
        ))}
      </div>
      <div className="rpm-cal-grid">
        {monthGrid(month).flat().map((key) => {
          const date = parseDateKey(key);
          const inMonth = date.getMonth() === month.month;
          const cls = [
            "rpm-cal-day",
            inMonth ? "" : "out",
            key === today ? "today" : inWeek(key, weekStart) ? "week" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={key} type="button" className={cls} onClick={() => onPick(key)} aria-label={`${key}${planned.has(key) ? " •" : ""}`}>
              {date.getDate()}
              {planned.has(key) && <span className="rpm-cal-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="rpm-cal-legend">
        <span>
          <i className="dot" />
          {t("planner.legendPlanned")}
        </span>
        <span>
          <i className="swatch" />
          {t("planner.legendToday")}
        </span>
      </div>
      <button type="button" className="rpm-cal-go" onClick={onThisWeek}>
        {t("planner.goThisWeek")}
      </button>
    </div>
  );
}
