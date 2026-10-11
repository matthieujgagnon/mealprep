import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { saveRecipe } from "./recipe-form.js";

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
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
}

async function addRecipe(page, { title, servings, steps }) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[aria-label="FRIDGE LIFE"]', servings);
  await page.fill('input[aria-label="Ingredient"]', "eggs");
  await page.fill('input[aria-label="Quantity"]', "2");
  await page.fill('textarea[placeholder="Describe this step"]', steps);
  await saveRecipe(page);
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
  await expect(page.locator(".riso-rc-modal")).toBeVisible();
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

test("step timer starts a countdown", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipe(page, {
    title: "Redesign Timer Test",
    servings: "2",
    steps: "Simmer for 5 minutes, then serve.",
  });

  const timer = page.locator(".riso-rc-timer");
  await expect(timer).toHaveCount(1);
  await expect(timer.locator(".riso-rc-timer-time")).toHaveText("⏱ 5:00");
  // The details line is sentence case too.
  await expect(page.locator(".riso-rc-meta-line")).toContainText(/Serves \d/);
  await timer.getByRole("button", { name: "▶ Start" }).click();
  await expect(timer.locator(".riso-rc-timer-time")).toContainText("4:5");
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
  await saveRecipe(page);
  await page.getByText("Redesign Notes Test", { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();

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

test("the photo gallery flips with the arrow keys and has a clear × to close", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://example.com/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  const photos = ["https://example.com/a.png", "https://example.com/b.png", "https://example.com/c.png"];
  await page.request.post("/api/recipes", {
    data: { title: "Gallery Test", photoUrl: photos[0], photos, ingredients: [{ name: "quokka beans" }], instructions: ["Cook it."] },
  });
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByText("Gallery Test", { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();

  // On the card, ← → flip the cover photo.
  const count = page.locator(".riso-rc-photo-count");
  await expect(count).toHaveText("1 / 3 PHOTOS");
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText("2 / 3 PHOTOS");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(count).toHaveText("3 / 3 PHOTOS");

  // In the viewer too; Escape closes the viewer only, the × closes it too.
  await count.click();
  const viewer = page.getByRole("dialog", { name: "Photos" });
  await expect(viewer.getByRole("button", { name: "Close photos" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".rc-lightbox-count")).toHaveText("1 / 3");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(page.locator(".riso-rc-modal")).toBeVisible();
  await count.click();
  await viewer.getByRole("button", { name: "Close photos" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.locator(".riso-rc-modal")).toBeVisible();

  // "+ Grocery list" on a missing ingredient puts it on the list: its dot turns green
  // and the button becomes "Take off grocery list".
  await page.locator(".riso-rc-ingredient-row", { hasText: "quokka beans" }).click();
  const add = page.getByRole("button", { name: "+ Grocery list" });
  await add.hover();
  await add.click();
  await expect(page.getByRole("button", { name: "Take off grocery list" })).toBeVisible();
  await expect(page.locator(".riso-rc-ingredient-dot.onlist")).toHaveCount(1);
});
