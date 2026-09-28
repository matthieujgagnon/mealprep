import { expect, test } from "@playwright/test";

// Covers the redesigned cook mode (full screen, one step at a time): step
// navigation, the segmented progress bar, per-step timers that keep running
// across step changes, "THIS STEP USES" ingredient pills, keyboard nav, and
// the finish sheet that logs leftovers to inventory.

function uniqueEmail() {
  return `cook-mode+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipeAndStartCooking(page, { title, servings, ingredientName, steps }) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="e.g. 4"]', servings);
  await page.fill('input[placeholder="Name (e.g. butter)"]', ingredientName);
  await page.fill('input[placeholder="Qty (1/4)"]', "2");
  await page.fill('textarea[placeholder*="Preheat oven"]', steps);
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);
  await page.getByText(title, { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Start cooking" }).click();
  await page.waitForTimeout(300);
}

test("steps navigate with Next/Back and the progress bar tracks position", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Nav Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas.\nFlavor: Toss with oil.\nAssemble: Serve hot.",
  });

  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Prep");
  await expect(page.locator(".cm-progress-bar.current")).toHaveCount(1);

  await page.getByRole("button", { name: /Next:/ }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 2 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Flavor");
  await expect(page.locator(".cm-progress-bar.done")).toHaveCount(1);

  await page.locator(".cm-nav-btn:not(.primary)").click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
});

test("arrow keys navigate steps", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Keyboard Test",
    servings: "2",
    ingredientName: "rice",
    steps: "Prep: Rinse the rice.\nCook: Simmer until tender.",
  });

  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 2");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 2 OF 2");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 2");
});

test("a step's timer keeps running after navigating away and shows a chip in the top bar", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Timer Test",
    servings: "2",
    ingredientName: "chicken",
    steps: "Prep: Season the chicken.\nRoast: Roast for 20 minutes.\nServe: Plate and serve.",
  });

  await page.getByRole("button", { name: /Next:/ }).click();
  await expect(page.locator(".cm-timer-card")).toBeVisible();
  await expect(page.locator(".cm-timer-time")).toHaveText("20:00");

  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.locator(".cm-nav-btn:not(.primary)").click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-running-chip")).toBeVisible();
  await expect(page.locator(".cm-timer-card")).toHaveCount(0);
});

test("THIS STEP USES pills show ingredients mentioned in the step, with scaled quantities", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Pills Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas well.\nServe: Plate and serve.",
  });

  await expect(page.locator(".cm-uses-pill")).toHaveText("chickpeas 2");

  await page.getByRole("button", { name: "Exit" }).click();
  // 4 -> 8 servings (a clean 2x scale) via the "+" button, four clicks.
  for (let i = 0; i < 4; i++) {
    await page.locator(".rc-servings-stepper button").nth(1).click();
  }
  await page.getByRole("button", { name: "Start cooking" }).click();
  await page.waitForTimeout(200);
  await expect(page.locator(".cm-uses-pill")).toHaveText("chickpeas 4");
});

test("finishing the last step opens the leftovers sheet and logs the item to inventory", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Finish Test",
    servings: "4",
    ingredientName: "pasta",
    steps: "Prep: Boil the pasta.\nServe: Toss with sauce.",
  });

  await page.getByRole("button", { name: /Next:/ }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("How many portions are left?")).toBeVisible();
  await expect(page.locator(".cm-finish-stepper span")).toHaveText("3"); // servings 4 - 1

  await page.locator(".cm-finish-stepper button").nth(1).click();
  await expect(page.locator(".cm-finish-stepper span")).toHaveText("4");

  await page.getByRole("button", { name: "Save 4 portions" }).click();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);

  await page.locator(".modal-close").click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByText("Cook Mode Finish Test (leftovers)")).toBeVisible();
});

test("Skip on the leftovers sheet closes cook mode without logging anything", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Skip Test",
    servings: "2",
    ingredientName: "eggs",
    steps: "Prep: Whisk the eggs.\nServe: Plate and serve.",
  });

  await page.getByRole("button", { name: /Next:/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator(".cm-finish-sheet").getByRole("button", { name: "Skip" }).click();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);

  await page.locator(".modal-close").click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByText("Cook Mode Skip Test (leftovers)")).toHaveCount(0);
});

test("Exit confirms before closing when a timer is running", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Exit Test",
    servings: "2",
    ingredientName: "bread",
    steps: "Prep: Preheat the oven.\nBake: Bake for 10 minutes.",
  });

  await page.getByRole("button", { name: /Next:/ }).click();
  await page.getByRole("button", { name: "Start timer" }).click();

  let dialogSeen = false;
  page.once("dialog", async (dialog) => {
    dialogSeen = true;
    await dialog.dismiss();
  });
  await page.locator(".cm-exit-btn").click();
  await page.waitForTimeout(200);
  expect(dialogSeen).toBe(true);
  await expect(page.locator(".cm-overlay")).toBeVisible(); // dismissed - still open

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator(".cm-exit-btn").click();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
});
