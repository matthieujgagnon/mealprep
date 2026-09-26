import { expect, test } from "@playwright/test";

// Verifies the click-to-search planner picker: clicking an empty slot opens
// a search popover instead of requiring a drag from the (possibly huge)
// cookbook grid, replacing the old drag-only "the only way to place a new
// meal" flow with a click+search path that also works on touch.

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

test("clicking an empty planner slot opens a search popover to place a recipe", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Chili");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  // Click the first empty slot's "+" button.
  await page.locator(".planner-empty-card").first().click();
  await expect(page.locator(".recipe-picker-popover")).toBeVisible();

  // Search narrows the list.
  await page.fill(".recipe-picker-search", "Chili");
  await expect(page.locator(".recipe-picker-option")).toHaveCount(1);
  await expect(page.locator(".recipe-picker-option-title")).toHaveText("Picker Test Chili");

  await page.locator(".recipe-picker-option").click();

  // Popover closes and the recipe is now placed in that slot.
  await expect(page.locator(".recipe-picker-popover")).toHaveCount(0);
  await expect(page.getByText("Picker Test Chili").first()).toBeVisible();
});

test("searching for a nonexistent recipe shows an empty state", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Soup");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".planner-empty-card").first().click();
  await page.fill(".recipe-picker-search", "zzz-no-such-recipe");
  await expect(page.locator(".recipe-picker-empty")).toBeVisible();
  await expect(page.locator(".recipe-picker-option")).toHaveCount(0);
});

test("marking a slot blank from the picker still works", async ({ page }) => {
  await signUpAndAddRecipe(page, "Picker Test Stew");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  await page.locator(".planner-empty-card").first().click();
  await expect(page.locator(".recipe-picker-blank-option")).toBeVisible();
  await page.locator(".recipe-picker-blank-option").click();

  await expect(page.locator(".recipe-picker-popover")).toHaveCount(0);
  await expect(page.locator(".planner-empty-card.marked").first()).toBeVisible();
});
