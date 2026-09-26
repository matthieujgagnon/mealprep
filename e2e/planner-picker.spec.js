import { expect, test } from "@playwright/test";

// Covers the planner's meal-placement UX: clicking an empty slot marks it
// blank directly (no popover — this was tried and explicitly reverted after
// user feedback), and the recipe grid below the board can be narrowed by
// search/tag instead of scrolling a long unfiltered list before dragging.

function uniqueEmail() {
  return `smoke-picker+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUpAndAddRecipe(page, title) {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="Name (e.g. butter)"]', "carrots");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("clicking an empty planner slot marks it blank directly, no popover", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Chili");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".planner-empty-card").first().click();

  await expect(page.locator(".recipe-picker-popover")).toHaveCount(0);
  await expect(page.locator(".planner-empty-card.marked").first()).toBeVisible();
});

test("clicking a blank-marked slot clears it back to empty", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Stew");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".planner-empty-card").first().click();
  await expect(page.locator(".planner-empty-card.marked").first()).toBeVisible();

  await page.locator(".planner-empty-card.marked").first().click();
  await expect(page.locator(".planner-empty-card.marked")).toHaveCount(0);
});

test("the cookbook grid below the planner can be filtered by search", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Chili");

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Picker Test Soup");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "celery");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText("Picker Test Soup")).toBeVisible();

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page.getByText("Or drag a recipe from your cookbook")).toBeVisible();
  await expect(page.getByText("Picker Test Chili").last()).toBeVisible();
  await expect(page.getByText("Picker Test Soup").last()).toBeVisible();

  await page.fill(".planner-source-heading + input.recipe-search-input", "Chili");
  await expect(page.getByText("Picker Test Chili").last()).toBeVisible();
  await expect(page.getByText("Picker Test Soup")).toHaveCount(0);
});
