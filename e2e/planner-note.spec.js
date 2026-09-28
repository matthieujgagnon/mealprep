import { expect, test } from "@playwright/test";

// Covers the planner's custom-note feature: a small pencil button on any
// no-recipe slot (empty, or already blank-marked) opens an inline text
// input for writing something like "sandwich", "ordering food", or "at a
// friend's" instead of picking a real recipe. Notes are stored as the
// title of a hidden placeholder recipe (see server/src/routes/planner.js),
// the same mechanism the plain "No meal planned" blank marker uses.

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
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="Name (e.g. butter)"]', "carrots");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("the pencil button on an empty slot writes a custom note instead of picking a recipe", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Chili");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const slot = page.locator(".planner-empty-card-wrap").first();
  await slot.locator(".planner-note-edit-btn").click();

  const input = slot.locator(".planner-note-input");
  await expect(input).toBeVisible();
  await input.fill("Sandwich");
  await input.press("Enter");

  const noteCard = page.locator(".planner-empty-card.has-note").first();
  await expect(noteCard).toBeVisible();
  await expect(noteCard.locator(".planner-note-text")).toHaveText("Sandwich");
  // Writing a note is not the same flow as picking a recipe - no picker
  // popover, matching the same "no popover" guarantee as the plain blank
  // marker (see planner-picker.spec.js).
  await expect(page.locator(".recipe-picker-popover")).toHaveCount(0);
});

test("the pencil button can edit an existing note, and the change persists across reload", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Stew");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const slot = page.locator(".planner-empty-card-wrap").first();
  await slot.locator(".planner-note-edit-btn").click();
  await slot.locator(".planner-note-input").fill("Ordering food");
  await slot.locator(".planner-note-input").press("Enter");
  await expect(slot.locator(".planner-note-text")).toHaveText("Ordering food");

  await slot.locator(".planner-note-edit-btn").click();
  const input = slot.locator(".planner-note-input");
  await expect(input).toHaveValue("Ordering food");
  await input.fill("Going to a friend's");
  await input.press("Enter");
  await expect(slot.locator(".planner-note-text")).toHaveText("Going to a friend's");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.locator(".planner-note-text").first()).toHaveText("Going to a friend's");
});

test("a note card's pencil button also works on an already blank-marked slot, and clicking the card body still clears it", async ({
  page,
}) => {
  await signUpAndAddRecipe(page, "Note Test Soup");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  // Mark blank the plain way (direct click, no note) first.
  const slot = page.locator(".planner-empty-card-wrap").first();
  await slot.locator(".planner-empty-card").click();
  await expect(slot.locator(".planner-empty-card.marked")).toBeVisible();
  await expect(slot.locator(".planner-note-text")).toHaveCount(0);

  // Now add a note onto that already-blank-marked slot via the pencil.
  await slot.locator(".planner-note-edit-btn").click();
  await slot.locator(".planner-note-input").fill("At a friend's");
  await slot.locator(".planner-note-input").press("Enter");
  await expect(slot.locator(".planner-note-text")).toHaveText("At a friend's");

  // Clicking the card body (not the pencil) still clears it entirely.
  await slot.locator(".planner-empty-card").click();
  await expect(page.locator(".planner-empty-card.marked")).toHaveCount(0);
  await expect(page.locator(".planner-note-text")).toHaveCount(0);
});

test("pressing Escape while editing a note cancels without saving", async ({ page }) => {
  await signUpAndAddRecipe(page, "Note Test Curry");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const slot = page.locator(".planner-empty-card-wrap").first();
  await slot.locator(".planner-note-edit-btn").click();
  await slot.locator(".planner-note-input").fill("Should not save");
  await slot.locator(".planner-note-input").press("Escape");

  await expect(slot.locator(".planner-note-input")).toHaveCount(0);
  await expect(page.locator(".planner-note-text")).toHaveCount(0);
  await expect(slot.locator(".planner-empty-card.marked")).toHaveCount(0);
});
