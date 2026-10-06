import { useState } from "react";
import { currentWeekStart, formatWeekLabel, isCurrentWeek, shiftWeek, toDateKey } from "../lib/dates.js";
import { weekOf } from "../lib/plannerCalendar.js";
import { t } from "../i18n/index.js";
import { Pill } from "./RisoPills.jsx";
import { WeekCalendar } from "./WeekCalendar.jsx";

// The strip above the Planner board, on a computer and on a phone (design:
// docs/design/riso-v2-planner-header): the title at the left, the week controls
// at the right (‹, the date pill that opens the week calendar, ›, and the yellow
// "this week" pill, which reads "↩ this week" on another week and goes back).
// The title is the same on every week. "Copy last week" lives in the calendar's
// footer. The dates are written with formatWeekLabel, so they read the same
// everywhere.
//
//   lastWeekCount   how many meals last week has; "Copy last week" is off at 0
//   onCopyLastWeek  fills this week's empty slots from last week (never replaces)
//                   and resolves with how many it copied
export function PlannerHeader({ weekStart, onChangeWeek, lastWeekCount, onCopyLastWeek }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentWeek = isCurrentWeek(weekStart);

  function goToWeek(key) {
    setCalendarOpen(false);
    onChangeWeek(weekOf(key));
  }

  return (
    <header className="phd">
      <h1 className="riso-planner-title">
        {t("planner.title")} <span className="accent">{t("planner.titleAccent")}</span>
      </h1>
      <div className="phd-controls">
        <button type="button" className="riso-planner-nav-arrow" onClick={() => onChangeWeek(shiftWeek(weekStart, -1))} aria-label={t("planner.prevWeek")}>
          ‹
        </button>
        <div className="phd-pick">
          <button
            type="button"
            className={`phd-date${calendarOpen ? " open" : ""}`}
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
            onClick={() => setCalendarOpen((open) => !open)}
          >
            {formatWeekLabel(weekStart)}
            <span className="phd-date-caret" aria-hidden="true">
              {calendarOpen ? "▲" : "▾"}
            </span>
          </button>
          {calendarOpen && (
            <WeekCalendar
              weekStart={weekStart}
              onPick={goToWeek}
              onThisWeek={() => goToWeek(toDateKey(new Date()))}
              onCopyLastWeek={onCopyLastWeek}
              canCopy={lastWeekCount > 0}
              onClose={() => setCalendarOpen(false)}
            />
          )}
        </div>
        <button type="button" className="riso-planner-nav-arrow" onClick={() => onChangeWeek(shiftWeek(weekStart, 1))} aria-label={t("planner.nextWeek")}>
          ›
        </button>
        {currentWeek ? (
          <Pill size="tag" tone="yellow" sticker>
            {t("planner.thisWeekBadge")}
          </Pill>
        ) : (
          <Pill size="tag" tone="yellow" sticker onClick={() => onChangeWeek(currentWeekStart())}>
            {t("planner.thisWeekBack")}
          </Pill>
        )}
      </div>
    </header>
  );
}
