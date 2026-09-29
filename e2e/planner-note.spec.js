import { expect, test } from "@playwright/test";

// Covers the planner's custom-note feature: once a slot is blank-marked (or
// carries a note), a small pencil button opens an inline text input for
// writing something like "sandwich", "ordering food", or "at a friend's"
// instead of picking a real recipe. Notes are stored as the title of a
// hidden placeholder recipe (see server/src/routes/planner.js), the same
// mechanism the plain "Skipped" blank marker uses. A genuinely empty slot's
// own click behavior — opening the add-recipe popover — is covered by
// planner-picker.spec.js.

function uniqueEmail() {
  return `planner-note+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
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
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="Name (e.g. butter)"]', "carrots");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

// Blank-marks the first empty slot via the add popover's "Skip / eating
// out" button, and returns a stable locator for that cell (position-based,
// not content-based — the cell's own children change shape as it's
// skipped/noted/cleared, so filtering by what's inside it would go stale).
async function skipFirstSlot(page) {
  const cell = page.locator(".riso-planner-cell").first();
  await cell.locator(".riso-planner-cell-empty").click();
  await page.locator(".riso-add-popover-footer .riso-btn").click();
  return cell;
}

test("the pencil button on a skipped slot writes a custom note instead of picking a recipe", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Chili");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const cell = await skipFirstSlot(page);
  await cell.locator(".riso-planner-note-edit-btn").click();

  const input = cell.locator(".riso-planner-note-input");
  await expect(input).toBeVisible();
  await input.fill("Sandwich");
  await input.press("Enter");

  await expect(cell.locator(".riso-planner-note-text")).toHaveText("Sandwich");
  // Writing a note is not the same flow as picking a recipe — no recipe
  // popover stays open.
  await expect(page.locator(".riso-add-popover")).toHaveCount(0);
});

test("the pencil button can edit an existing note, and the change persists across reload", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Stew");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const cell = await skipFirstSlot(page);
  await cell.locator(".riso-planner-note-edit-btn").click();
  await cell.locator(".riso-planner-note-input").fill("Ordering food");
  await cell.locator(".riso-planner-note-input").press("Enter");
  await expect(cell.locator(".riso-planner-note-text")).toHaveText("Ordering food");

  await cell.locator(".riso-planner-note-edit-btn").click();
  const input = cell.locator(".riso-planner-note-input");
  await expect(input).toHaveValue("Ordering food");
  await input.fill("Going to a friend's");
  await input.press("Enter");
  await expect(cell.locator(".riso-planner-note-text")).toHaveText("Going to a friend's");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.locator(".riso-planner-note-text").first()).toHaveText("Going to a friend's");
});

test("a note card's pencil button also works on a plain skipped slot, and clicking the card body still clears it", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Soup");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  // Skip the plain way first (no custom note yet).
  const cell = await skipFirstSlot(page);
  await expect(cell.locator(".riso-planner-note-text")).toHaveText("Skipped");

  // Now add a note onto that already-skipped slot via the pencil.
  await cell.locator(".riso-planner-note-edit-btn").click();
  await cell.locator(".riso-planner-note-input").fill("At a friend's");
  await cell.locator(".riso-planner-note-input").press("Enter");
  await expect(cell.locator(".riso-planner-note-text")).toHaveText("At a friend's");

  // Clicking the card body (not the pencil) clears it entirely, back to a
  // genuinely empty (dashed "+ add") slot.
  await cell.locator(".riso-planner-cell-note").click();
  await expect(cell.locator(".riso-planner-cell-note-wrap")).toHaveCount(0);
  await expect(cell.locator(".riso-planner-cell-empty")).toBeVisible();
});

test("pressing Escape while editing a note cancels without saving", async ({ page }) => {
  await signUpAndAddRecipe(page, "Note Test Curry");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const cell = await skipFirstSlot(page);
  await cell.locator(".riso-planner-note-edit-btn").click();
  await cell.locator(".riso-planner-note-input").fill("Should not save");
  await cell.locator(".riso-planner-note-input").press("Escape");

  await expect(cell.locator(".riso-planner-note-input")).toHaveCount(0);
  await expect(cell.locator(".riso-planner-note-text")).toHaveText("Skipped");
});
