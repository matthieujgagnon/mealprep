import { dict, t } from "../i18n/index.js";
import { weekendRuns } from "./plannerSlots.js";

// The Planner's weekend (design: docs/design/riso-v2-planner-desktop, "Weekend
// marker"): any days the user picks, shown as one block for each run of
// neighbouring days, optionally also taking in the supper the evening before a
// run, and switched on or off. It is saved for the account (User.weekendDays,
// weekendOn, weekendEve). Days are 0 = Monday ... 6 = Sunday; meals are
// 0 = breakfast, 1 = lunch, 2 = supper.

export const DEFAULT_WEEKEND = { on: true, days: [5, 6], eve: true };

// The presets in the weekend menu: a name key under planner.weekendPresets, the
// days and whether the evening before is in.
export const WEEKEND_PRESETS = [
  { id: "friEve", days: [5, 6], eve: true },
  { id: "satSun", days: [5, 6], eve: false },
  { id: "sunMon", days: [0, 6], eve: false },
];

// What the account says (or the defaults), as { on, days, eve } with clean days.
export function weekendFrom(user) {
  const days = Array.isArray(user?.weekendDays) ? [...new Set(user.weekendDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b) : DEFAULT_WEEKEND.days;
  return { on: user?.weekendOn ?? DEFAULT_WEEKEND.on, days, eve: user?.weekendEve ?? DEFAULT_WEEKEND.eve };
}

export function sameWeekend(a, b) {
  return a.on === b.on && a.eve === b.eve && a.days.join() === b.days.join();
}

// Whether a preset is what is set right now.
export function presetIsOn(preset, weekend) {
  return weekend.on && weekend.eve === preset.eve && weekend.days.join() === [...preset.days].sort((a, b) => a - b).join();
}

// A run starts the evening before when that is switched on, the run does not
// start on Monday, and the day before is not itself a weekend day.
export function takesEve(run, days, eve) {
  return eve && run.start > 0 && !days.includes(run.start - 1);
}

// Everything the board needs to draw the weekend, all in px (the design's
// numbers): `shiftX[i]` and `shiftY(i, meal)` nudge columns and slots so the
// block can breathe; `plates` are the dotted panels, each with the margins that
// place it round the shifted cells, and (when it takes the evening before) the
// margins of its Souper-only segment. `padRight` and `padBottom` make room for
// the shifts inside the scrolling board.
export function weekendLayout(weekend, { gap = 12, outset = 8, startShift = 4, extraDayShift = 4, rowShift = 4 } = {}) {
  const days = weekend.days;
  const on = weekend.on && days.length > 0;
  const runs = on ? weekendRuns(days) : [];
  const eveRuns = runs.filter((r) => takesEve(r, days, weekend.eve));
  const eveDays = new Set(eveRuns.map((r) => r.start - 1));
  const inWeekend = (i) => on && days.includes(i);

  const shiftX = [];
  let x = 0;
  for (let i = 0; i < 7; i++) {
    const isW = inWeekend(i);
    const prevW = i > 0 && inWeekend(i - 1);
    if (isW && !prevW) x += startShift;
    else if (isW && prevW) x += extraDayShift;
    else if (!isW && (prevW || eveDays.has(i))) x += startShift;
    shiftX[i] = x;
  }
  const maxX = Math.max(0, ...shiftX);

  // Is this slot inside the block (a weekend day, or the supper before one)?
  const isWeekendSlot = (i, meal) => inWeekend(i) || (on && meal === 2 && eveDays.has(i));
  const shiftY = (i, meal) => (isWeekendSlot(i, meal) || eveDays.has(i) ? rowShift * meal : 0);

  const plates = runs.map((run) => {
    const eveRun = takesEve(run, days, weekend.eve);
    const a = run.start;
    const b = run.end;
    return {
      key: a,
      start: a,
      end: b,
      eve: eveRun,
      margin: { top: -outset, right: -(shiftX[b] + outset), bottom: -(rowShift * 2 + outset), left: shiftX[a] - outset },
      eveMargin: eveRun
        ? { top: rowShift * 2 - outset, right: outset - gap - shiftX[a], bottom: -(rowShift * 2 + outset), left: shiftX[a - 1] - outset }
        : null,
    };
  });

  return {
    on,
    runs,
    plates,
    shiftX,
    shiftY,
    isWeekendSlot,
    padRight: maxX + outset + 10,
    padBottom: outset + rowShift * 2 + 6,
  };
}

// "Fri eve + Sat–Sun", "Sat–Sun, Wed": the weekend in words, for the legend and
// the "how it works" line.
export function weekendSummary(weekend) {
  const days = weekend.days;
  if (!weekend.on || days.length === 0) return "";
  const name = (i) => dict().days.short[i];
  return weekendRuns(days)
    .map((run) => {
      const range = run.start === run.end ? name(run.start) : `${name(run.start)}–${name(run.end)}`;
      return takesEve(run, days, weekend.eve) ? `${name(run.start - 1)} ${t("planner.weekendEve")} + ${range}` : range;
    })
    .join(", ");
}
