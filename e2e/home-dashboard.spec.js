import { expect, test } from "@playwright/test";

// The Home tab is now the landing page - covers the pieces that pull data
// from elsewhere in the app (planner, grocery list, inventory) rather than
// re-testing logic already covered by smoke.spec.js/planner-picker.spec.js.

function uniqueEmail() {
  return `smoke-home+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test("signing up lands on Home, not Recipes", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
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
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("This week's")).toBeVisible();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByText("Next week's")).toBeVisible();

  await page.getByRole("button", { name: "This week" }).click();
  await expect(page.getByText("This week's")).toBeVisible();
});

test("the grocery summary and inventory cards reflect real data", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();

  // Add an inventory item expiring tomorrow.
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.fill('.pantry-add-form input[type="text"]', "cilantro");
  await page.locator('.pantry-add-form button[type="submit"]').click();
  await expect(page.getByText("cilantro")).toBeVisible();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.locator(".pantry-item-date").first().fill(tomorrow);
  await page.locator(".pantry-item-date").first().blur();
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByText("cilantro")).toBeVisible();
  await expect(page.locator(".home-grocery-number")).toHaveText("0");
});
