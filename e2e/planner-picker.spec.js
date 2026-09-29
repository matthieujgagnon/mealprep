import { expect, test } from "@playwright/test";

// Covers the planner's empty-slot picker popover: clicking a genuinely
// empty slot opens a small anchored popover with a recipe search, a
// "Skip / eating out" button, and a note field — replacing the old
// below-board drag source grid, which is gone (dragging a card between
// cells is covered by touch-drag.spec.js and the drag machinery in App.jsx).

function uniqueEmail() {
  return `smoke-picker+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUpAndAddRecipe(page, title, ingredient = "carrots") {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="Name (e.g. butter)"]', ingredient);
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("clicking an empty planner slot opens the add-recipe popover, and picking a recipe places it and closes the popover", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Picker Test Chili");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".riso-planner-cell-empty").first().click();
  await expect(page.locator(".riso-add-popover")).toBeVisible();
  await expect(page.locator(".riso-add-popover-row", { hasText: "Picker Test Chili" })).toBeVisible();

  await page.locator(".riso-add-popover-row", { hasText: "Picker Test Chili" }).click();

  await expect(page.locator(".riso-add-popover")).toHaveCount(0);
  await expect(page.locator(".riso-planner-card-name", { hasText: "Picker Test Chili" })).toBeVisible();
});

test("the popover's 'Skip / eating out' button blank-marks the slot, and clicking it again clears it", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Picker Test Stew");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".riso-planner-cell-empty").first().click();
  await page.locator(".riso-add-popover-footer .riso-btn").click();

  await expect(page.locator(".riso-planner-note-text").first()).toHaveText("Skipped");

  await page.locator(".riso-planner-cell-note").first().click();
  await expect(page.locator(".riso-planner-note-text")).toHaveCount(0);
  await expect(page.locator(".riso-planner-cell-empty").first()).toBeVisible();
});

test("the popover's search field filters the recipe list by title", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Chili");

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Picker Test Soup");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "celery");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText("Picker Test Soup")).toBeVisible();

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".riso-planner-cell-empty").first().click();
  await expect(page.locator(".riso-add-popover-row", { hasText: "Picker Test Chili" })).toBeVisible();
  await expect(page.locator(".riso-add-popover-row", { hasText: "Picker Test Soup" })).toBeVisible();

  await page.locator(".riso-add-popover-search").fill("Chili");
  await expect(page.locator(".riso-add-popover-row", { hasText: "Picker Test Chili" })).toBeVisible();
  await expect(page.locator(".riso-add-popover-row", { hasText: "Picker Test Soup" })).toHaveCount(0);
});

test("clicking outside the popover closes it without changing the slot", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Curry");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".riso-planner-cell-empty").first().click();
  await expect(page.locator(".riso-add-popover")).toBeVisible();

  // The big page title is well outside the popover and any cell.
  await page.locator(".riso-planner-title").click();
  await expect(page.locator(".riso-add-popover")).toHaveCount(0);
  await expect(page.locator(".riso-planner-cell-empty").first()).toBeVisible();
});
