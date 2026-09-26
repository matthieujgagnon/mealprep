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

test("adding tonight's dinner from the Home dashboard places it on the planner", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();

  // Add a recipe first so there's something to pick.
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Dashboard Chili");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "beans");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText("Home Dashboard Chili")).toBeVisible();

  // Back to Home - the tonight card should be in its empty state.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByText("Nothing planned for tonight yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add a recipe" }).click();
  await expect(page.locator(".recipe-picker-popover")).toBeVisible();
  await page.fill(".recipe-picker-search", "Chili");
  await page.locator(".recipe-picker-option").click();

  // The tonight card now shows the real recipe instead of the empty state.
  await expect(page.locator(".home-tonight-title")).toHaveText("Home Dashboard Chili");

  // And it's really on the planner, not just shown on Home.
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.getByText("Home Dashboard Chili")).toBeVisible();
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
