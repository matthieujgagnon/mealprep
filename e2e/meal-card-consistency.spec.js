import { expect, test } from "@playwright/test";

// Regression coverage for the app-wide visual consistency pass: recipe
// cards (the shared MealCard component) moved from the old light .card
// look to a dark surface everywhere they appear - Recipes, Planner,
// Makeable - matching the Inventory/Recipe-Card/Home/Cook-Mode redesigns.

function uniqueEmail() {
  return `meal-card+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

test("a recipe card on the Recipes tab is a dark surface with legible light text", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Consistency Test Dish");
  await page.fill('input[placeholder="e.g. 4"]', "2");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "flour");
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Combine and bake.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);

  const card = page.locator(".meal-card", { hasText: "Consistency Test Dish" });
  await expect(card).toBeVisible();

  const [cardBg, titleColor] = await page.evaluate(() => {
    const cardEl = [...document.querySelectorAll(".meal-card")].find((el) =>
      el.textContent.includes("Consistency Test Dish")
    );
    const titleEl = cardEl.querySelector(".meal-card-title");
    return [getComputedStyle(cardEl).backgroundColor, getComputedStyle(titleEl).color];
  });

  // Regression check for the exact bug class this pass fixed elsewhere
  // (Home's Makeable-now list): a dark card background with light title
  // text, not the old light .card + dark --ink text.
  expect(cardBg).toBe("rgb(31, 31, 99)"); // --inv-surface2
  expect(titleColor).toBe("rgb(243, 243, 251)"); // --paper
});

test("the same recipe card styling is used in the Planner's drag source grid and Makeable results", async ({
  page,
}) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Shared Card Style Test");
  await page.fill('input[placeholder="e.g. 4"]', "2");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "rice");
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Cook and serve.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);
  const plannerCard = page.locator(".meal-card", { hasText: "Shared Card Style Test" });
  await expect(plannerCard).toHaveCSS("background-color", "rgb(31, 31, 99)");

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.fill('input[placeholder*="ingredient you have"]', "rice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.waitForTimeout(300);
  const makeableCard = page.locator(".meal-card", { hasText: "Shared Card Style Test" });
  await expect(makeableCard).toHaveCSS("background-color", "rgb(31, 31, 99)");
});
