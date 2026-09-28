import { expect, test } from "@playwright/test";

// Covers pieces specific to the Home redesign: the "N of your recipes use
// X" sale-deal link, and the Riso Poster "Makeable now" row (its own plain
// row design, not the shared dark .meal-card — see makeable-vapor.spec.js's
// header comment for the same precedent on the Makeable tab). Home's old
// light/dark toggle was removed when Home moved to the Riso Poster design:
// design_handoff_riso/README.md's fidelity note says light ("paper") is the
// only mode designed so far ("black paper" dark mode is future work), so
// there's currently nothing for a toggle to switch to.

function uniqueEmail() {
  return `home-redesign+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

test("a makeable recipe shows as a Riso-styled row with its title legible on paper", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Test Dish");
  await page.fill('input[placeholder="e.g. 4"]', "2");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "test ingredient");
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Combine and serve.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', "test ingredient");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator(".modal-close").click();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const row = page.locator(".riso-makeable-row", { hasText: "Home Redesign Test Dish" });
  await expect(row).toBeVisible();

  const titleColor = await row.locator(".riso-makeable-row-title").evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).toBe("rgb(22, 24, 31)"); // --riso-ink, legible on the paper-colored row
});

test("the sale-deal footer link filters Recipes to a matching ingredient", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Chicken Dish");
  await page.fill('input[placeholder="e.g. 4"]', "2");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "chicken breast");
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Grill until done.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.waitForTimeout(400);

  // The seeded flyer deals include "Boneless chicken breast" - matches
  // findMatchingDeal's word-overlap heuristic against "chicken breast".
  const footerLink = page.getByRole("button", { name: "See them →" });
  await expect(footerLink).toBeVisible();
  await expect(page.getByText(/of your recipes use boneless chicken breast/)).toBeVisible();

  await footerLink.click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.getByText("Home Redesign Chicken Dish")).toBeVisible();
});

test("On sale deals render as Riso price tags", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await expect(page.locator(".riso-price-tag").first()).toBeVisible();
  await expect(page.locator(".riso-price-tag-amount").first()).toBeVisible();
});
