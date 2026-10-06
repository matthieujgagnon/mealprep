import { useState } from "react";
import { currentWeekStart, formatWeekLabel, formatWeekRangeLong, isCurrentWeek, shiftWeek, toDateKey } from "../lib/dates.js";
import { weekOf } from "../lib/plannerCalendar.js";
import { pageStickers } from "../lib/plannerPhone.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { t } from "../i18n/index.js";
import { Pill } from "./RisoPills.jsx";
import { WeekCalendar } from "./WeekCalendar.jsx";

// The strip above the Planner board, on a computer and on a phone (design:
// docs/design/riso-v2-planner-header, and docs/design/riso-v2-planner-mobile-v2
// for the phone): the title « Le menu de la semaine. » on its own line, the same
// on every week, then a row of week controls: ‹, the date pill that opens the
// week calendar, ›. On a computer the row ends with the yellow "this week" pill
// ("↩ this week" on another week, which goes back). On a phone it ends with the
// page stickers (« jeu–sam → », « ← lun–mer »), which move the board three days
// at a time; the pill itself says « cette semaine » on this week, a small date
// line sits above the title, and the weekend's settings live in the calendar.
// "Copy last week" lives in the calendar's footer. The dates are written with
// formatWeekLabel, so they read the same everywhere.
//
//   lastWeekCount   how many meals last week has; "Copy last week" is off at 0
//   onCopyLastWeek  fills this week's empty slots from last week (never replaces)
//                   and resolves with how many it copied
//   page, onPage    a phone: which three days the board shows, and how to change it
//   weekend, onWeekendChange   a phone: the weekend setting, shown in the calendar
export function PlannerHeader({ weekStart, onChangeWeek, lastWeekCount, onCopyLastWeek, page = 0, onPage, weekend, onWeekendChange }) {
  const phone = useIsPhone();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const stickers = pageStickers(page);
  const currentWeek = isCurrentWeek(weekStart);

  function goToWeek(key) {
    setCalendarOpen(false);
    onChangeWeek(weekOf(key));
  }

  return (
    <header className="phd">
      {phone && <p className="phd-range">{formatWeekRangeLong(weekStart)}</p>}
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
            {phone && currentWeek ? t("planner.thisWeekBadge") : formatWeekLabel(weekStart)}
            <span className="phd-date-caret" aria-hidden="true">
              {calendarOpen ? "▴" : "▾"}
            </span>
          </button>
          {calendarOpen && (
            <WeekCalendar
              weekStart={weekStart}
              onPick={goToWeek}
              onThisWeek={() => goToWeek(toDateKey(new Date()))}
              onCopyLastWeek={onCopyLastWeek}
              canCopy={lastWeekCount > 0}
              weekend={weekend}
              onWeekendChange={onWeekendChange}
              onClose={() => setCalendarOpen(false)}
            />
          )}
        </div>
        <button type="button" className="riso-planner-nav-arrow" onClick={() => onChangeWeek(shiftWeek(weekStart, 1))} aria-label={t("planner.nextWeek")}>
          ›
        </button>
        {phone ? (
          <div className="phd-stickers">
            {stickers.back && (
              <button type="button" className="phd-sticker back" aria-label={t("planner.pageStickerAria", { days: stickers.back.replace("← ", "") })} onClick={() => onPage(page - 1)}>
                <span>{stickers.back}</span>
              </button>
            )}
            {stickers.forward && (
              <button type="button" className="phd-sticker forward" aria-label={t("planner.pageStickerAria", { days: stickers.forward.replace(" →", "") })} onClick={() => onPage(page + 1)}>
                <span>{stickers.forward}</span>
              </button>
            )}
          </div>
        ) : currentWeek ? (
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
