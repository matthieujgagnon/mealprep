import { expect, test } from "@playwright/test";

// A handful of end-to-end checks against a real server + real Postgres,
// covering the critical path across the app's main feature areas. Not
// exhaustive - just enough to catch "the whole thing is broken" before it
// reaches anyone using the app, complementing the unit tests (which check
// pure logic) and the manual Playwright verification done for every change
// during development.

function uniqueEmail(prefix) {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
}

test("sign up creates an account and loads the app", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-signup"));
  await expect(page.getByRole("button", { name: "Recipes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planner", exact: true })).toBeVisible();
});

test("add a manual recipe and see it in the cookbook", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-recipe"));
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();

  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Smoke Test Soup");
  await page.fill('input[aria-label="Ingredient"]', "carrots");
  await page.getByRole("button", { name: "Save recipe" }).click();

  await expect(page.getByText("Smoke Test Soup")).toBeVisible();
});

test("add a pantry inventory item and mark it a staple", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-inventory"));
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('.pantry-add-form input[type="text"]', "canned tomatoes");
  await page.locator('.pantry-add-form button[type="submit"]').click();
  await page.locator(".modal-close").click();
  await expect(page.getByText("canned tomatoes")).toBeVisible();

  await page.getByText("canned tomatoes", { exact: true }).click();
  const stapleButton = page.getByRole("button", { name: "☆ Mark as pantry staple" });
  await expect(stapleButton).toBeVisible();
  await stapleButton.click();
  await expect(page.getByRole("button", { name: "★ Pantry staple" })).toBeVisible();
});

test("add an extra grocery item and check it off", async ({ page }) => {
  await signUp(page, uniqueEmail("smoke-grocery"));
  await page.getByRole("button", { name: "Grocery", exact: true }).click();

  // The Riso redesign's add field is one free-text input ("2 lemons") parsed
  // into quantity + name, rather than separate name/qty/unit fields.
  await page.fill('.riso-grocery-add input', "paper towels");
  await page.locator(".riso-grocery-add-btn").click();
  await page.waitForTimeout(300);

  const row = page.locator(".riso-row").filter({ has: page.locator(".riso-row-name", { hasText: "paper towels" }) });
  await expect(row).toBeVisible();

  // Only the checkbox checks it off: tapping the name does nothing.
  await row.locator(".riso-row-name").click();
  await expect(row).not.toHaveClass(/checked/);

  // Checking it off strikes it through and sinks it to the bottom of its group.
  await row.getByRole("checkbox").click();
  await expect(row).toHaveClass(/checked/);
  await expect(row.locator(".riso-row-name")).toHaveClass(/struck/);
});
