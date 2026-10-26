import { expect, test, thisMonday } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";

// Fix batch 7: the Planner's week calendar and its day pop-up stay inside the window on
// every side, at every computer width (1280 down to 768), in English and French; and the
// grey bar that sat above the recipe search on a computer is gone (the phone keeps its
// dashed line between the board and the search).

async function setUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `edges+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  // A recipe with a long name, planned on a few days, so the day card has photos and long text.
  const recipe = await (
    await page.request.post("/api/recipes", { data: { title: "A fairly long recipe name for the day card", ingredients: [{ name: "flour" }], instructions: ["Cook it."] } })
  ).json();
  const week = thisMonday();
  for (const [dayOfWeek, mealType] of [[0, "breakfast"], [0, "dinner"], [3, "lunch"], [6, "dinner"]]) {
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: week, dayOfWeek, mealType } });
  }
  await page.reload();
  if (french) await page.getByRole("button", { name: "Français" }).click();
  await page.locator(".tabs .tab").nth(2).click(); // Planner
}

const rect = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});

// Inside the window (a pixel of slack for rounding), on all four sides.
function expectInside(box, view, what) {
  expect(box.left, `${what}: left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.top, `${what}: top edge`).toBeGreaterThanOrEqual(-1);
  expect(box.right, `${what}: right edge`).toBeLessThanOrEqual(view.width + 1);
  expect(box.bottom, `${what}: bottom edge`).toBeLessThanOrEqual(view.height + 1);
}

for (const french of [false, true]) {
  for (const width of [1280, 1100, 900, 768]) {
    test(`the calendar and its day card stay inside the window at ${width}px, in ${french ? "French" : "English"}`, async ({ page }) => {
      const view = { width, height: 800 };
      await page.setViewportSize(view);
      await setUp(page, { french });
      await page.locator(".phd-date").click();
      const calendar = page.locator(".wcal");
      await expect(calendar).toBeVisible();
      expectInside(await rect(calendar), view, "the calendar");

      // Days in each corner and the middle of the month grid.
      const days = calendar.locator(".wcal-day");
      const count = await days.count();
      for (const index of [0, 6, 17, count - 7, count - 1]) {
        await days.nth(index).hover();
        const card = page.locator(".wcal-preview.beside");
        await expect(card).toBeVisible();
        const box = await rect(card);
        expectInside(box, view, `the day card for day ${index}`);
        // Beside the calendar, not on top of it: there is always room on one side from 768 up.
        const cal = await rect(calendar);
        expect(box.right <= cal.left + 1 || box.left >= cal.right - 1, `the day card for day ${index} is beside the calendar`).toBe(true);
      }
    });
  }
}

test("the day card stays inside the window when the page is scrolled and the window is short", async ({ page }) => {
  const view = { width: 1280, height: 560 };
  await page.setViewportSize(view);
  await setUp(page);
  await page.locator(".phd-date").click();
  await page.evaluate(() => window.scrollTo(0, 220));
  const days = page.locator(".wcal .wcal-day");
  const last = (await days.count()) - 1;
  await days.nth(last - 5).hover();
  const card = page.locator(".wcal-preview.beside");
  await expect(card).toBeVisible();
  expectInside(await rect(card), view, "the day card on a short, scrolled window");
  // Scrolled further, the calendar is partly above the window: the card still is not.
  await page.evaluate(() => window.scrollTo(0, 400));
  await days.nth(last).hover();
  await expect(card).toBeVisible();
  expectInside(await rect(card), view, "the day card after scrolling");
});

test("there is no line above the recipe search on a computer, and the phone keeps its dashed line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setUp(page);
  await expect(page.locator(".riso-planner-finder .fnd-searchbar")).toBeVisible();
  await expect(page.locator(".fnd-grab")).toHaveCount(0);
  // The panel starts with its hint, then the search: nothing drawn between the top edge and the hint.
  const finder = page.locator(".riso-planner-finder");
  expect(await finder.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid"); // the card's own outline, as before

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".fnd-grab")).toHaveCount(0);
  const phone = await finder.evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, width: getComputedStyle(el).borderTopWidth }));
  expect(phone).toEqual({ style: "dashed", width: "2px" }); // the line between the board and the search stays on a phone
});
