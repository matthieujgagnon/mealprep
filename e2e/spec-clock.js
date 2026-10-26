import { expect, test as base } from "@playwright/test";
import { addDays, quebecDayOfWeek, quebecWeekStart } from "./quebec-day.js";

// "Now" for the specs that depend on which day it is (the Planner, the week calendar).
//
// The Planner counts weeks and "today" on the browser's own clock, and a spec has to count them the
// same way: a spec that takes its Monday from the machine it runs on (UTC in CI) is a week ahead of
// the browser from Sunday 8 p.m. in Quebec, and a day ahead every evening. So a spec asks for the
// week and the day here, counted on the Quebec day (quebec-day.js), and runs its browser in
// America/Toronto (`test.use({ timezoneId: "America/Toronto" })`) so the two agree.
//
// `E2E_NOW=2026-10-31T21:30:00-04:00 npx playwright test ...` runs the specs that use this file as
// if it were that moment: the browser's clock is frozen to it (the server keeps its own, which the
// Planner's week routes do not read), and the week and the day below come from it. Without it the
// real clock is used. A spec that needs a calendar of a given shape (a next week row below this
// one) pins its own date with `page.clock.setFixedTime`, which wins over E2E_NOW.
//
// Only the browser is frozen. The server keeps the real day, so an Inventory item posted without a
// use-by gets one counted from the real day, which a browser frozen a few days later sees as past:
// give the items a spec needs fresh a use-by counted from the same moment, `quebecDayIn(30, specNow())`.
//
//   todayIndex()      today's day of the week, 0 = Monday ... 6 = Sunday
//   thisMonday()      the Monday of this week, "2026-10-26"
//   mondayAfter(n)    the Monday n weeks after this week's (n < 0: before it)
//   specNow()         the moment itself

const asked = process.env.E2E_NOW ? new Date(process.env.E2E_NOW) : null;
if (asked && Number.isNaN(asked.getTime())) throw new Error(`E2E_NOW is not a date: ${process.env.E2E_NOW}`);

export const specNow = () => asked ?? new Date();
export const todayIndex = (at = specNow()) => quebecDayOfWeek(at);
export const thisMonday = (at = specNow()) => quebecWeekStart(at);
export const mondayAfter = (weeks, at = specNow()) => addDays(quebecWeekStart(at), 7 * weeks);

export const test = base.extend({
  page: async ({ page }, use) => {
    if (asked) await page.clock.setFixedTime(asked);
    await use(page);
  },
});
export { expect };
