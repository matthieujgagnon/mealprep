import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatWeekdayMonthDay, parseDateKey, toDateKey } from "../lib/dates.js";
import { gridRange, inWeek, monthGrid, monthOf, shiftMonth } from "../lib/plannerCalendar.js";
import { MEAL_TYPES, MEAL_LABEL } from "../lib/plannerSlots.js";
import { dict, t } from "../i18n/index.js";

// The week calendar: what the week picker opens, on a computer and on a phone.
// A month, with three small bars under each day, one for each meal (breakfast,
// lunch, supper), filled when that meal is planned, so you see how full each day
// is. The shown week is yellow, today pink. Hovering a day lists its meals;
// tapping a day goes to its week.
//
//   weekStart   the Monday of the week shown ("YYYY-MM-DD")
//   onPick(key) a day was chosen
//   onThisWeek  "Go to this week"
//   onClose     Escape (and the caller closes it on a click outside)
// A day's meals as { breakfast: "Oats", dinner: "Soup" }: a note shows its
// text, a "no meal planned" card says so.
function mealsByType(meals) {
  return Object.fromEntries(meals.map((m) => [m.mealType, m.placeholder && m.title === "No meal planned" ? t("planner.blankName") : m.title]));
}

export function WeekCalendar({ weekStart, onPick, onThisWeek, onClose }) {
  const [month, setMonth] = useState(() => monthOf(weekStart));
  const [planned, setPlanned] = useState(() => new Map()); // "YYYY-MM-DD" -> { breakfast: "Oats", ... }
  const today = toDateKey(new Date());

  useEffect(() => {
    const { from, to } = gridRange(month);
    let cancelled = false;
    api
      .listPlannedDates(from, to)
      .then((days) => !cancelled && setPlanned(new Map(days.map((day) => [day.date, mealsByType(day.meals)]))))
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
          const meals = planned.get(key);
          const cls = [
            "rpm-cal-day",
            inMonth ? "" : "out",
            key === today ? "today" : inWeek(key, weekStart) ? "week" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const summary = meals ? MEAL_TYPES.filter((m) => meals[m.id]).map((m) => `${m.label}: ${meals[m.id]}`) : [];
          return (
            <button
              key={key}
              type="button"
              className={cls}
              onClick={() => onPick(key)}
              aria-label={[formatWeekdayMonthDay(date), ...summary].join(", ")}
            >
              {date.getDate()}
              <span className="rpm-cal-bars" aria-hidden="true">
                {MEAL_TYPES.map((m) => (
                  <span key={m.id} className={meals?.[m.id] ? "on" : ""} />
                ))}
              </span>
              {summary.length > 0 && (
                <span className="rpm-cal-tip" aria-hidden="true">
                  <b>{formatWeekdayMonthDay(date)}</b>
                  {MEAL_TYPES.filter((m) => meals[m.id]).map((m) => (
                    <span key={m.id}>
                      {MEAL_LABEL[m.id]} · {meals[m.id]}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="rpm-cal-legend">
        <span>
          <i className="bars" />
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
