import { expect, test as base } from "@playwright/test";
import { addDays, quebecDay, quebecDayOfWeek, quebecMoment, quebecWeekStart } from "./quebec-day.js";

// "Now" for every browser spec. A spec takes its test and expect from here, never from "@playwright/test".
//
// The app counts weeks and "today" on the browser's own clock, and a spec has to count them the same way:
// a spec that takes its Monday from the machine it runs on (UTC in CI) is a week ahead of the browser from
// Sunday 8 p.m. in Quebec, and a day ahead every evening. So a spec asks for the week and the day here,
// counted on the Quebec day (quebec-day.js), and its browser runs in America/Toronto (the `timezoneId` below,
// for every page and every `browser.newContext()`), so the two agree whatever zone the machine is in.
// server/src/e2eClockRule.test.js fails when a spec reads the machine's clock or zone by itself.
//
// `E2E_NOW=2026-10-31T21:30:00-04:00 npx playwright test ...` runs the specs as if it were that moment: the
// browser's clock is set to it when the page is made (the server keeps its own, which the Planner's week routes
// do not read), and the week and the day below come from it. Without it the real clock is used. The browser's
// clock starts at that moment and keeps ticking: a clock that stood still would never let an elapsed-time check
// pass (Inventory's 250 ms calm after a drag swallows taps for ever). A spec that needs a calendar of a given
// shape (a next week row below this one) pins its own date with `page.clock.setFixedTime`, which wins over
// E2E_NOW, and counts from that moment instead of specNow().
//
// Only the browser is moved. The server keeps the real day, so an Inventory item posted without a use-by gets
// one counted from the real day, which a browser set to a day a few weeks later sees as past: give the items a
// spec needs fresh a use-by counted from the same moment, `quebecDayIn(30, specNow())`. And a day the server
// stamps (a member's sign-up, an item's removal) is the real day: a spec that reads one sets its page to
// `realNow()` (`page.clock.setFixedTime(realNow())`).
//
//   todayIndex()      today's day of the week, 0 = Monday ... 6 = Sunday
//   thisMonday()      the Monday of this week, "2026-10-26"
//   mondayAfter(n)    the Monday n weeks after this week's (n < 0: before it). Next week's meals are always still
//                     ahead of today, and last week's days have always passed, whatever day the test runs
//   todayAt(h, m)     the moment it is h:m on today's Quebec day (6 p.m. is when Home shows supper)
//   specNow()         the moment itself
//   realNow(ms)       the machine's real clock, ms later (earlier when negative), which E2E_NOW never moves: for a
//                     row the server dates itself (a reset link that lasts an hour, a flyer sent last week) and for
//                     a touch event's own timestamp. Never for a day the app shows.

const asked = process.env.E2E_NOW ? new Date(process.env.E2E_NOW) : null;
if (asked && Number.isNaN(asked.getTime())) throw new Error(`E2E_NOW is not a date: ${process.env.E2E_NOW}`);

export const specNow = () => asked ?? new Date();
export const todayIndex = (at = specNow()) => quebecDayOfWeek(at);
export const thisMonday = (at = specNow()) => quebecWeekStart(at);
export const mondayAfter = (weeks, at = specNow()) => addDays(quebecWeekStart(at), 7 * weeks);
export const todayAt = (hour, minute = 0, at = specNow()) => quebecMoment(quebecDay(at), hour, minute);
export const realNow = (ms = 0) => new Date(Date.now() + ms);

export const test = base.extend({
  timezoneId: ["America/Toronto", { option: true }],
  page: async ({ page }, use) => {
    if (asked) await page.clock.setSystemTime(asked);
    await use(page);
  },
});
export { expect };
