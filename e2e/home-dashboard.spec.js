import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { addInventoryItem, itemForm } from "./inventory-form.js";
import { quebecDay, quebecDayIn } from "./quebec-day.js";

// The Home tab is now the landing page - covers the pieces that pull data
// from elsewhere in the app (planner, grocery list, inventory) rather than
// re-testing logic already covered by smoke.spec.js/planner-picker.spec.js.

function uniqueEmail() {
  return `smoke-home+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

// These are about supper, which is the card from 3 pm: fix the clock at 6 pm
// so they give the same answer whenever they run. 6 pm on today's Quebec day
// (the day the app counts use-by days in), on this machine's clock (the hour the
// browser reads): from 8 pm in Quebec a UTC machine's own date is already
// tomorrow, and "6 pm tomorrow" made a use-by date of tomorrow say today.
test.beforeEach(async ({ page }) => {
  const [y, m, d] = quebecDay(new Date()).split("-").map(Number);
  await page.clock.setFixedTime(new Date(y, m - 1, d, 18, 0, 0, 0));
});

test("signing up lands on Home, not Recipes", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator(".home-page")).toBeVisible();
  await expect(page.locator(".tab.active")).toHaveText("Home");
});

test("Home's empty tonight card sends you to the Planner tab to add a recipe", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();

  // The tonight card should be in its empty state, with no meal planned.
  await expect(page.getByText("Nothing planned for tonight yet.")).toBeVisible();

  // Clicking "Add a recipe" navigates to the Planner tab (no click-to-search
  // popover — that was tried and reverted; the planner's own search/tag
  // filter and drag-and-drop are the way to place a recipe now).
  await page.getByRole("button", { name: "Add a recipe" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Planner");
  await expect(page.locator(".recipe-picker-popover")).toHaveCount(0);
});

test("the week strip can be switched to show next week", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("This week's")).toBeVisible();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByText("Next week's")).toBeVisible();

  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(page.getByText("This week's")).toBeVisible();
});

test("the grocery summary and inventory cards reflect real data", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();

  // Add an inventory item expiring tomorrow.
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await addInventoryItem(page, "cilantro");
  await expect(page.getByText("cilantro", { exact: true })).toBeVisible();

  await page.getByText("cilantro", { exact: true }).click();
  const tomorrow = quebecDayIn(1); // a Quebec day: from 8 p.m. the UTC date of "now + 24 h" is already the day after
  await itemForm(page).getByLabel("Use-by date").fill(tomorrow);
  await itemForm(page).getByRole("button", { name: "Save changes" }).click();
  await expect(itemForm(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const useUp = page.locator(".riso-useup-row", { hasText: "cilantro" });
  await expect(useUp).toBeVisible();
  await expect(useUp.locator(".riso-useup-badge.pink")).toHaveText("tomorrow!");
  await expect(page.locator(".home-grocery-number")).toHaveText("0");
});
