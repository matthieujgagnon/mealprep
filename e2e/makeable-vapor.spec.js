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
  const nameInputs = page.locator('input[placeholder="Name (e.g. butter)"]');
  for (let i = 0; i < ingredients.length; i++) {
    if (i > 0) await page.getByRole("button", { name: /\+ Add ingredient/i }).last().click();
    await nameInputs.nth(i).fill(ingredients[i]);
  }
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await expect(page.getByText(title).first()).toBeVisible();
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
  await expect(shortCard.locator(".riso-makeable-need-text")).toContainText("Celery");
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

test("+ Add to list sends a recipe's missing ingredients to the grocery list", async ({ page }) => {
  await signUp(page, uniqueEmail("makeable-grocery"));
  await addRecipe(page, "Riso Grocery Dish", ["salmon", "broccoli"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  await addAlsoHave(page, "salmon");
  await page.waitForTimeout(200);

  const card = page.locator(".riso-makeable-card", { hasText: "Riso Grocery Dish" });
  await expect(card.locator(".riso-makeable-need-text")).toContainText("Broccoli");
  await card.getByRole("button", { name: /Add \d+ to list/ }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText("Broccoli", { exact: false }).first()).toBeVisible();
});

test("Plan places a recipe onto the planner without opening a picker", async ({ page }) => {
  await signUp(page, uniqueEmail("makeable-plan"));
  await addRecipe(page, "Riso Plan Dish", ["salmon"]);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForTimeout(200);
  await addAlsoHave(page, "salmon");
  await page.waitForTimeout(200);

  await page
    .locator(".riso-makeable-card", { hasText: "Riso Plan Dish" })
    .getByRole("button", { name: "Plan", exact: true })
    .click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText("Riso Plan Dish").first()).toBeVisible();
});
