import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { formatShortWeekdayMonthDay, formatWeekLabel, parseDateKey, toDateKey } from "../lib/dates.js";
import { gridRange, inWeek, monthOf, monthWeeks, shiftMonth } from "../lib/plannerCalendar.js";
import { MEAL_TYPES } from "../lib/plannerSlots.js";
import { dict, t } from "../i18n/index.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { Pill } from "./RisoPills.jsx";

// The week calendar: what the Planner's date pill opens, on a computer and on a
// phone (design: docs/design/riso-v2-planner-header). A month drawn as weeks:
// each day has three small dashes, one for each meal (breakfast, lunch, supper),
// blue when that meal is planned. The shown week is yellow, today pink.
//
// On a computer a row picks that week, and hovering a day shows its meals, with
// photos, in a card to the left. On a phone a row does not pick: tapping a day
// shows the card under its row, with "Show this week".
//
// The footer has "Go to this week" and "Copy last week".
//
//   weekStart         the Monday of the week shown ("YYYY-MM-DD")
//   onPick(key)       a week was chosen (any day in it)
//   onThisWeek        "Go to this week"
//   onCopyLastWeek    fills the shown week's empty slots from last week; it
//                     resolves with how many meals it copied
//   canCopy           whether last week has anything to copy
//   onClose           Escape or a click outside
//
// A day's meals as { breakfast: { title, photoUrl, isLeftover }, ... }: a note
// shows its text, a "no meal planned" card says so.
function mealsByType(meals) {
  return Object.fromEntries(
    meals.map((m) => [
      m.mealType,
      { title: m.placeholder && m.title === "No meal planned" ? t("planner.blankName") : m.title, photoUrl: m.photoUrl, isLeftover: m.isLeftover },
    ])
  );
}

// One day's meals, three rows (breakfast, lunch, supper). `beside` is the card
// to the left of the calendar on a computer, `inline` the one under a week's row
// on a phone (with the button).
function DayPreview({ date, meals, inline, onShowWeek }) {
  const count = MEAL_TYPES.filter((m) => meals?.[m.id]).length;
  return (
    <div className={`wcal-preview ${inline ? "inline" : "beside"}`} aria-hidden={inline ? undefined : "true"}>
      <div className="wcal-preview-head">
        <span className="wcal-preview-title">{formatShortWeekdayMonthDay(date)}</span>
        <span className="wcal-preview-count">{count ? t("planner.previewPlanned", { count }) : t("planner.previewNothing")}</span>
      </div>
      {MEAL_TYPES.map((m) => {
        const meal = meals?.[m.id];
        return (
          <div key={m.id} className="wcal-meal">
            <span className={`wcal-photo${meal ? "" : " empty"}`}>
              {meal?.photoUrl && <img src={meal.photoUrl} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
            </span>
            <span className="wcal-meal-text">
              <span className="wcal-meal-slot">{m.label}</span>
              <span className={`wcal-meal-name${meal ? "" : " none"}`}>{meal ? meal.title : "—"}</span>
            </span>
            {meal?.isLeftover && (
              <Pill size="tag" tone="yellow" sticker>
                {t("planner.leftover")}
              </Pill>
            )}
          </div>
        );
      })}
      {inline && (
        <button type="button" className="wcal-show-week" onClick={onShowWeek}>
          {t("planner.previewShowWeek")}
        </button>
      )}
    </div>
  );
}

export function WeekCalendar({ weekStart, onPick, onThisWeek, onCopyLastWeek, canCopy = true, onClose }) {
  const phone = useIsPhone();
  const [month, setMonth] = useState(() => monthOf(weekStart));
  const [planned, setPlanned] = useState(() => new Map()); // "YYYY-MM-DD" -> { breakfast: { title, ... }, ... }
  const [hovered, setHovered] = useState(null); // a day's key: hovered on a computer, tapped on a phone
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  const today = toDateKey(new Date());

  const load = useCallback(() => {
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

  useEffect(() => load(), [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copyLastWeek() {
    const count = await onCopyLastWeek();
    if (!count) return;
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    load(); // the dashes follow the copy
  }

  const hoveredDate = hovered ? parseDateKey(hovered) : null;

  return (
    <>
      <div className="wcal-backdrop" onClick={onClose} />
      <span className="wcal-caret" aria-hidden="true" />
      <div className="wcal" role="dialog" aria-label={t("planner.calendarAria")}>
        <div className="wcal-head">
          <h2 className="wcal-title">
            {dict().months.long[month.month].toLowerCase()} <span className="accent">{month.year}</span>
          </h2>
          <div className="wcal-nav">
            <button type="button" className="riso-planner-nav-arrow large" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t("planner.calPrevMonth")}>
              ‹
            </button>
            <button type="button" className="riso-planner-nav-arrow large" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t("planner.calNextMonth")}>
              ›
            </button>
          </div>
        </div>
        <div className="wcal-dows" aria-hidden="true">
          {dict().days.long.map((name, i) => (
            <span key={i}>{name.charAt(0).toUpperCase()}</span>
          ))}
        </div>
        <div className="wcal-weeks" onMouseLeave={phone ? undefined : () => setHovered(null)}>
          {monthWeeks(month).map((week) => {
            const selected = inWeek(week[0], weekStart);
            const showHere = phone && hovered && week.includes(hovered);
            const days = week.map((key) => {
              const date = parseDateKey(key);
              const meals = planned.get(key);
              const cls = [
                "wcal-day",
                date.getMonth() === month.month ? "" : "out",
                key === today ? "today" : "",
                hovered === key ? "hover" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const content = (
                <>
                  <span className="wcal-num">{date.getDate()}</span>
                  <span className="wcal-dashes" aria-hidden="true">
                    {MEAL_TYPES.map((m) => (
                      <i key={m.id} className={meals?.[m.id] ? "on" : ""} />
                    ))}
                  </span>
                </>
              );
              if (!phone) {
                return (
                  <span key={key} className={cls} onMouseEnter={() => setHovered(key)}>
                    {content}
                  </span>
                );
              }
              const summary = MEAL_TYPES.filter((m) => meals?.[m.id]).map((m) => `${m.label}: ${meals[m.id].title}`);
              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  onClick={() => setHovered(hovered === key ? null : key)}
                  aria-expanded={hovered === key}
                  aria-label={[formatShortWeekdayMonthDay(date), ...summary].join(", ")}
                >
                  {content}
                </button>
              );
            });
            return (
              <Fragment key={week[0]}>
                {phone ? (
                  <div className={`wcal-week${selected ? " selected" : ""}`}>{days}</div>
                ) : (
                  <button
                    type="button"
                    className={`wcal-week${selected ? " selected" : ""}`}
                    aria-label={t("planner.pickWeekAria", { week: formatWeekLabel(week[0]) })}
                    onClick={() => onPick(week[0])}
                  >
                    {days}
                  </button>
                )}
                {showHere && <DayPreview inline date={hoveredDate} meals={planned.get(hovered)} onShowWeek={() => onPick(week[0])} />}
              </Fragment>
            );
          })}
        </div>
        <div className="wcal-legend">
          <span>
            <i className="dash" />
            {t("planner.legendPlanned")}
          </span>
          <span>
            <i className="today" />
            {t("planner.legendToday")}
          </span>
        </div>
        <div className="wcal-foot">
          <button type="button" className="wcal-btn" onClick={onThisWeek}>
            {t("planner.goThisWeek")}
          </button>
          <button
            type="button"
            className="wcal-btn"
            disabled={!canCopy}
            title={canCopy ? t("planner.copyLastWeekHint") : t("planner.copyLastWeekNone")}
            onClick={copyLastWeek}
          >
            <span aria-hidden="true">{copied ? "✓" : "↺"}</span>
            {copied ? t("planner.copied") : t("planner.copyLastWeek")}
          </button>
        </div>
        {!phone && hoveredDate && <DayPreview date={hoveredDate} meals={planned.get(hovered)} />}
      </div>
    </>
  );
}
