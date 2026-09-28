import { expect, test } from "@playwright/test";

// Regression coverage for the Flyers screen's Riso neubrutalist redesign -
// its own design system (like Makeable's Cobalt Vapor), not the shared
// dark .meal-card look used on Recipes/Planner. Runs against the sample
// deals (MOCK_DEALS in server/src/routes/deals.js) shown before any real
// flyer is uploaded, since flyer upload itself depends on the Gemini API.

function uniqueEmail() {
  return `flyers-riso+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipe(page, { title, ingredient }) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="e.g. 4"]', "4");
  await page.fill('input[placeholder="Name (e.g. butter)"]', ingredient);
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Cook it.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);
}

test("Flyers renders the Riso theme with sample deals and store/category filters", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await expect(page.locator(".riso-flyers")).toBeVisible();
  await expect(page.getByText("deals, sorted.")).toBeVisible();

  // Sample data spans several stores/categories - both filter rows show.
  await expect(page.getByRole("button", { name: "All stores" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Metro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Protein", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Metro" }).click();
  await expect(page.getByRole("button", { name: "Metro" })).toHaveClass(/active/);
  await page.getByRole("button", { name: "All stores" }).click();
  await expect(page.getByRole("button", { name: "All stores" })).toHaveClass(/active/);
});

test("a matched deal shows a cookable group with a Riso recipe tile, and Plan it adds to the planner", async ({
  page,
}) => {
  await signUp(page, uniqueEmail());
  // MOCK_DEALS includes "Boneless chicken breast" (protein, Metro) - matches
  // a recipe with a "chicken breast" ingredient via the same ingredient-core
  // matching groupDealsByIngredient always used.
  await addRecipe(page, { title: "Riso Flyers Test Dish", ingredient: "chicken breast" });

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  const group = page.locator(".riso-group", { hasText: "Chicken" });
  await expect(group).toBeVisible();
  await expect(group.locator(".riso-recipe-tile", { hasText: "Riso Flyers Test Dish" })).toBeVisible();

  await group.getByRole("button", { name: "+ Plan it" }).click();
  await group.getByRole("button", { name: "Add" }).click();
  await expect(group.locator(".riso-added-note")).toHaveText("✓ Added to Mon");

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".meal-card", { hasText: "Riso Flyers Test Dish" }).first()).toBeVisible();
});

test("the upload form and Le Rabais import buttons render in the Riso style", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh from Le Rabais" })).toBeVisible();

  await page.getByRole("button", { name: "Upload flyer" }).click();
  await expect(page.locator(".riso-upload-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract deals" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".riso-upload-form")).toHaveCount(0);
});
