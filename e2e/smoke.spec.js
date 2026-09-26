import { expect, test } from "@playwright/test";

// A handful of end-to-end checks against a real server + real Postgres,
// covering the critical path across the app's main feature areas. Not
// exhaustive - just enough to catch "the whole thing is broken" before it
// reaches anyone using the app, complementing the unit tests (which check
// pure logic) and the manual Playwright verification done for every change
// during development.

function uniqueEmail(prefix) {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

test("sign up creates an account and loads the app", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-signup"));
  await expect(page.getByRole("button", { name: "Recipes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planner" })).toBeVisible();
});

test("add a manual recipe and see it in the cookbook", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-recipe"));
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();

  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Smoke Test Soup");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "carrots");
  await page.getByRole("button", { name: "Save to cookbook" }).click();

  await expect(page.getByText("Smoke Test Soup")).toBeVisible();
});

test("add a pantry inventory item and mark it a staple", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-inventory"));
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await page.fill('.pantry-add-form input[type="text"]', "canned tomatoes");
  await page.locator('.pantry-add-form button[type="submit"]').click();
  await expect(page.getByText("canned tomatoes")).toBeVisible();

  const starButton = page.locator(".pantry-item-staple-toggle").first();
  await expect(starButton).toHaveText("☆");
  await starButton.click();
  await expect(starButton).toHaveText("★");
});

test("add an extra grocery item and check it off", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-grocery"));
  await page.getByRole("button", { name: "Grocery List", exact: true }).click();

  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.fill('.add-section-form input[placeholder="e.g. Paper towels"]', "paper towels");
  await page.locator(".add-section-form button[type='submit']").click();

  await expect(page.getByText("paper towels")).toBeVisible();
});
