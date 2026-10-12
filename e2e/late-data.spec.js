import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

// Pages that decided before their data arrived (on a slow phone):
//  - the slot picker picked its starting slot when it opened, and never again
//    if the week's meals arrived later;
//  - the Grocery list read the upcoming meals before a Planner save had landed.
// Each test holds one answer back to make the phone slow.

test.use({ viewport: { width: 1280, height: 1000 } });

// A Wednesday at noon: the first upcoming slot is Wednesday's supper, whatever day it really is.
const FIXED_NOW = new Date(2026, 9, 7, 12, 0, 0);
const WEEK = "2026-10-05";
const WEDNESDAY = 2;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `late+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

const recipe = async (page, title, ingredients = [{ name: "rice", quantity: 1, unit: "cup" }]) =>
  await (await page.request.post("/api/recipes", { data: { title, baseServings: 2, ingredients } })).json();

// A promise the test opens when it chooses.
function gate() {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test("the slot picker starts on the next empty slot even when the week loads after it opens", async ({ page }) => {
  await signUp(page);
  const stew = await recipe(page, "Late Week Stew");
  const here = await recipe(page, "Already Planned");
  // Wednesday's supper, the first upcoming slot, is taken.
  await page.request.post("/api/planner", { data: { recipeId: here.id, weekStart: WEEK, dayOfWeek: WEDNESDAY, mealType: "dinner" } });

  // A slow phone: the Planner's week does not arrive until the test lets it.
  const week = gate();
  await page.route(/\/api\/planner\?week=/, async (route) => {
    await week.promise;
    await route.continue();
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.reload();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: stew.title }).first().click();
  await page.getByRole("dialog", { name: stew.title }).getByRole("button", { name: "Plan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker).toBeVisible();

  // The picker does not know what is free yet, so it holds the confirm button.
  await expect(picker.getByRole("button", { name: /^Add to / })).toBeDisabled();

  // The week arrives: supper is taken, so it moves to lunch, which is free.
  week.open();
  await expect(picker.getByRole("button", { name: `Add to ${DAYS[WEDNESDAY]} · Lunch` })).toBeEnabled();
  await expect(picker.getByRole("status")).toHaveText("Free slot");
  await expect(picker.locator('.riso-picker-cell[aria-pressed="true"]')).toHaveCount(1);
  await expect(picker.getByRole("button", { name: new RegExp(`^${DAYS[WEDNESDAY]} · Supper: Already Planned`) })).toHaveAttribute("aria-pressed", "false");

  await picker.getByRole("button", { name: `Add to ${DAYS[WEDNESDAY]} · Lunch` }).click();
  await expect(picker).toHaveCount(0);
  await expect
    .poll(async () => (await (await page.request.get(`/api/planner?week=${WEEK}`)).json()).map((e) => `${e.recipe.title} ${e.dayOfWeek} ${e.mealType}`).sort())
    .toEqual([`Already Planned ${WEDNESDAY} dinner`, `Late Week Stew ${WEDNESDAY} lunch`]);
});

test("a slot the person picked is kept when the week arrives", async ({ page }) => {
  await signUp(page);
  const stew = await recipe(page, "Picked Stew");
  const here = await recipe(page, "Already Planned");
  await page.request.post("/api/planner", { data: { recipeId: here.id, weekStart: WEEK, dayOfWeek: WEDNESDAY, mealType: "dinner" } });

  const week = gate();
  await page.route(/\/api\/planner\?week=/, async (route) => {
    await week.promise;
    await route.continue();
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.reload();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: stew.title }).first().click();
  await page.getByRole("dialog", { name: stew.title }).getByRole("button", { name: "Plan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker).toBeVisible();

  // The person taps Friday's breakfast before the week has arrived.
  await picker.getByRole("button", { name: new RegExp(`^${DAYS[4]} · Breakfast`) }).click();
  week.open();
  await expect(picker.getByRole("button", { name: `Add to ${DAYS[4]} · Breakfast` })).toBeEnabled();
  await expect(picker.getByRole("button", { name: new RegExp(`^${DAYS[4]} · Breakfast`) })).toHaveAttribute("aria-pressed", "true");
});

test("plan a meal and open Grocery right away: its ingredients are there", async ({ page }) => {
  await signUp(page);
  await recipe(page, "Kohlrabi Slaw", [{ name: "kohlrabi", quantity: 2, unit: "" }]);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Kohlrabi");
  await page.getByRole("button", { name: "Add Kohlrabi Slaw to the plan" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker.getByRole("button", { name: /^Add to / })).toBeEnabled();

  // A slow phone: the save that puts the meal on the plan has not landed yet.
  const saved = gate();
  await page.route(/\/api\/planner$/, async (route) => {
    if (route.request().method() === "POST") await saved.promise;
    await route.continue();
  });
  await picker.getByRole("button", { name: /^Add to / }).click();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();

  // If Grocery read the meals now it would get none. Wait to see whether it asks (it should not
  // until the save has landed), then let the save through.
  await page.waitForResponse((r) => r.url().includes("/api/planner/upcoming"), { timeout: 1500 }).catch(() => null);
  saved.open();

  await expect(page.getByRole("checkbox", { name: /Check off kohlrabi/i })).toBeVisible();
});
