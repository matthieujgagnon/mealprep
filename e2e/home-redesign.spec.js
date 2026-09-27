import { expect, test } from "@playwright/test";

// Covers the Home page's own light/dark toggle (scoped to Home only, the
// rest of the app stays dark) and the "N of your recipes use X" sale-deal
// link, both new in this redesign pass.

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

test("Home defaults to dark and the toggle switches to light without affecting other tabs", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await expect(page.locator(".home-page")).toHaveAttribute("data-theme", "dark");

  await page.locator(".home-theme-toggle").click();
  await expect(page.locator(".home-page")).toHaveAttribute("data-theme", "light");

  // Switching tabs and back doesn't affect the shared header/other tabs -
  // only the Home page content carries the theme attribute.
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator("[data-theme]")).toHaveCount(0);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".home-page")).toHaveAttribute("data-theme", "light");
});

test("the theme choice persists across a reload", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.locator(".home-theme-toggle").click();
  await expect(page.locator(".home-page")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator(".home-page")).toHaveAttribute("data-theme", "light");
});

test("a makeable recipe's title is legible against the dark Makeable-now card", async ({ page }) => {
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
  await expect(page.locator(".home-makeable-list .meal-card-title")).toHaveText("Home Redesign Test Dish");

  // Regression check for the exact bug this redesign fixed: the title
  // inherited --ink (a dark navy meant for a light card) after its card's
  // background was overridden to a dark surface, making it unreadable. A
  // plain inequality check wouldn't catch that (both colors were dark, just
  // different) - assert the title actually resolves to --paper (light
  // text), not merely "not equal to the background".
  const titleColor = await page.evaluate(() => {
    const title = document.querySelector(".home-makeable-list .meal-card-title");
    return getComputedStyle(title).color;
  });
  expect(titleColor).toBe("rgb(243, 243, 251)"); // --paper
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
