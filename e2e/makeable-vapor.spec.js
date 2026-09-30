import { expect, test } from "@playwright/test";

// Covers the Makeable screen's Riso Poster redesign: ingredients typed into
// "ALSO HAVE" group matching recipes into Ready now / One or two short /
// Needs a shop, and each group's card actions (Cook tonight, + Add to
// list, Plan).

function uniqueEmail(tag) {
  return `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipe(page, title, ingredients) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  const nameInputs = page.locator('input[aria-label="Ingredient"]');
  for (let i = 0; i < ingredients.length; i++) {
    if (i > 0) await page.getByRole("button", { name: /\+ Add ingredient/i }).last().click();
    await nameInputs.nth(i).fill(ingredients[i]);
  }
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.locator(".riso-recipe-card", { hasText: title })).toBeVisible();
}

async function addAlsoHave(page, name) {
  const input = page.locator(".riso-makeable-also-have-input");
  await input.fill(name);
  await input.press("Enter");
}

test("a fully-matched recipe lands in Ready now, and a partially-matched one in One or two short", async ({
  page,
}) => {
  await signUp(page, uniqueEmail("makeable-groups"));
  await addRecipe(page, "Riso Pancakes", ["flour", "egg"]);
  await addRecipe(page, "Riso Soup", ["chicken", "carrot", "celery"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  for (const ing of ["flour", "egg", "chicken", "carrot"]) {
    await addAlsoHave(page, ing);
  }
  await page.waitForTimeout(200);

  await expect(page.locator(".riso-makeable-group-title")).toHaveText(["Ready now", "One or two short"]);
  const readyCard = page
    .locator(".riso-makeable-group", { hasText: "Ready now" })
    .locator(".riso-makeable-card", { hasText: "Riso Pancakes" });
  await expect(readyCard).toBeVisible();
  await expect(readyCard.getByRole("button", { name: "Cook tonight", exact: true })).toBeVisible();

  const shortCard = page
    .locator(".riso-makeable-group", { hasText: "One or two short" })
    .locator(".riso-makeable-card", { hasText: "Riso Soup" });
  await expect(shortCard.locator(".riso-makeable-need-list")).toContainText("Celery");
});

test("Cook tonight opens the recipe straight into cook mode", async ({ page }) => {
  await signUp(page, uniqueEmail("makeable-cook"));
  await addRecipe(page, "Riso Cook Tonight Dish", ["salmon"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  await addAlsoHave(page, "salmon");
  await page.waitForTimeout(200);

  await page
    .locator(".riso-makeable-card", { hasText: "Riso Cook Tonight Dish" })
    .getByRole("button", { name: "Cook tonight", exact: true })
    .click();
  await expect(page.locator(".cm-overlay, .cm-screen").first()).toBeVisible();
});

test("the You need box adds one item or all of them, once each", async ({ page }) => {
  await signUp(page, uniqueEmail("makeable-grocery"));
  await addRecipe(page, "Riso Grocery Dish", ["salmon", "broccoli", "leeks"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  await addAlsoHave(page, "salmon");
  await page.waitForTimeout(200);

  const card = page.locator(".riso-makeable-card", { hasText: "Riso Grocery Dish" });
  await expect(card.locator(".riso-makeable-need-count")).toHaveText("2");

  // One item: its + turns into "✓ on list".
  await card.getByRole("button", { name: "Add Broccoli to grocery list" }).click();
  await expect(card.getByRole("button", { name: "Remove Broccoli from grocery list" })).toHaveText("✓ on list");

  // Add all only adds what isn't already there, then reads as done.
  await card.getByRole("button", { name: "+ Add all 2 to list" }).click();
  await expect(card.getByRole("button", { name: "✓ All on your grocery list" })).toBeDisabled();

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText("Broccoli", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Leek", { exact: false })).toHaveCount(1);
});

test("Plan lets you pick the day and the meal", async ({ page }) => {
  await signUp(page, uniqueEmail("makeable-plan"));
  await addRecipe(page, "Riso Plan Dish", ["salmon"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  await addAlsoHave(page, "salmon");
  await page.waitForTimeout(200);

  const card = page.locator(".riso-makeable-card", { hasText: "Riso Plan Dish" });
  await card.getByRole("button", { name: "Plan", exact: true }).click();
  // Sunday is never in the past this week.
  await card.getByRole("button", { name: /^Sun \d+/ }).click();
  await card.getByRole("button", { name: "Lunch", exact: true }).click();
  await card.getByRole("button", { name: "Plan for Sun · Lunch" }).click();
  await expect(card.getByRole("button", { name: "✓ Sun · Lunch" })).toBeVisible();

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  const entries = await (await page.request.get(`/api/planner?week=${week}`)).json();
  const placed = entries.find((e) => e.recipe?.title === "Riso Plan Dish");
  expect(placed).toMatchObject({ dayOfWeek: 6, mealType: "lunch" });
});
