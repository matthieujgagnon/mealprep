import { expect, test } from "@playwright/test";

// Covers the Riso Recipe Card detail modal: the two-column desktop layout,
// servings-scaled ingredient/step text, inline step timers, the options
// menu, the photo lightbox, and the phone-width tabbed Ingredients/Steps
// layout.

function uniqueEmail() {
  return `rc-redesign+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipe(page, { title, servings, steps }) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[aria-label="FRIDGE LIFE"]', servings);
  await page.fill('input[aria-label="Ingredient"]', "eggs");
  await page.fill('input[aria-label="Quantity"]', "2");
  await page.fill('textarea[placeholder="Describe this step"]', steps);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
  await page.getByText(title, { exact: true }).click();
  await page.waitForTimeout(300);
}

test("servings scaling updates ingredient and step quantities, but not durations", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipe(page, {
    title: "Redesign Roast",
    servings: "4",
    steps: "Prep: Chop 2 onions and mince the garlic.\nRoast for 20 minutes, flipping halfway.",
  });

  await expect(page.locator(".riso-rc-step-title").first()).toHaveText("Prep");
  await expect(page.locator(".riso-rc-step-row").nth(0).locator(".riso-rc-step-text")).toContainText("Chop 2 onions");
  await expect(page.locator(".riso-rc-step-row").nth(1).locator(".riso-rc-step-text")).toContainText("Roast for 20 minutes");

  // Bump servings 4 -> 8: ingredient/step quantities double, durations don't.
  await page.locator(".riso-rc-servings-stepper button").nth(1).click();
  await page.locator(".riso-rc-servings-stepper button").nth(1).click();
  await page.locator(".riso-rc-servings-stepper button").nth(1).click();
  await page.locator(".riso-rc-servings-stepper button").nth(1).click();

  await expect(page.locator(".riso-rc-ingredient-qty").first()).toHaveText("4");
  await expect(page.locator(".riso-rc-step-row").nth(0).locator(".riso-rc-step-text")).toContainText("Chop 4 onions");
  await expect(page.locator(".riso-rc-step-row").nth(1).locator(".riso-rc-step-text")).toContainText("Roast for 20 minutes");
});

test("step timer chip starts a countdown", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipe(page, {
    title: "Redesign Timer Test",
    servings: "2",
    steps: "Simmer for 5 minutes, then serve.",
  });

  const timerChip = page.locator(".riso-rc-timer-chip");
  await expect(timerChip).toHaveCount(1);
  await expect(timerChip).toHaveText("▶ Start 5-minute timer");
  // The details line is sentence case too.
  await expect(page.locator(".riso-rc-meta-line")).toContainText(/Serves \d/);
  await timerChip.click();
  await page.waitForTimeout(1100);
  await expect(timerChip).toContainText("04:5");
});

test("options menu opens and closes on outside click", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipe(page, {
    title: "Redesign Menu Test",
    servings: "2",
    steps: "Serve immediately.",
  });

  await expect(page.locator(".riso-rc-menu")).toHaveCount(0);
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.locator(".riso-rc-menu")).toBeVisible();
  await expect(page.locator(".riso-rc-menu").getByRole("button", { name: "Edit recipe" })).toBeVisible();
  await expect(page.locator(".riso-rc-menu").getByRole("button", { name: "Delete recipe" })).toBeVisible();

  await page.locator(".riso-rc-menu-catcher").click();
  await expect(page.locator(".riso-rc-menu")).toHaveCount(0);
});

test("recipe notes render legibly on the light card", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Redesign Notes Test");
  await page.fill('input[aria-label="FRIDGE LIFE"]', "2");
  await page.fill('input[aria-label="Ingredient"]', "eggs");
  await page.fill('input[aria-label="Quantity"]', "2");
  await page.fill('textarea[placeholder="Describe this step"]', "Serve immediately.");
  await page.fill('textarea[placeholder*="Used less salt"]', "Great with a squeeze of lemon.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
  await page.getByText("Redesign Notes Test", { exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page.locator(".rc-notes-label")).toHaveText("Notes");
  await expect(page.locator(".rc-notes-text")).toHaveText("Great with a squeeze of lemon.");
});

test("phone width shows tabbed Ingredients/Steps layout", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipe(page, {
    title: "Redesign Phone Test",
    servings: "2",
    steps: "Prep: Chop the onions.\nServe hot.",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".riso-rc-phone-tabs")).toBeVisible();

  // Ingredients tab shown by default; steps panel hidden.
  await expect(page.locator(".riso-rc-ingredients-panel")).toBeVisible();
  await expect(page.locator(".riso-rc-steps-wrap")).toBeHidden();

  await page.getByRole("button", { name: /Steps ·/ }).click();
  await expect(page.locator(".riso-rc-steps-wrap")).toBeVisible();
  await expect(page.locator(".riso-rc-ingredients-panel")).toBeHidden();
});
