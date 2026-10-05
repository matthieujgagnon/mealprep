import { expect, test } from "@playwright/test";
import { confirmAdd } from "./inventory-confirm.js";

// Cook mode (design handoff v3): one step at a time with step segments,
// per-step timers that keep running across step changes, tap-to-check
// "For this step" pills, keyboard nav, and the finished view (Mark as
// cooked, Save leftovers).

function uniqueEmail() {
  return `cook-mode+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

async function addRecipeAndStartCooking(page, { title, servings, ingredientName, steps }) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[aria-label="FRIDGE LIFE"]', servings);
  await page.fill('input[aria-label="Ingredient"]', ingredientName);
  await page.fill('input[aria-label="Quantity"]', "2");
  await page.fill('textarea[placeholder="Describe this step"]', steps);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Start cooking" }).click();
  await page.waitForTimeout(300);
}

test("steps navigate with Next/Previous and the step segments track position", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Nav Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas.\nFlavor: Toss with oil.\nAssemble: Serve hot.",
  });

  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Prep");
  await expect(page.locator(".cm-segment.current")).toHaveCount(1);
  await expect(page.locator(".cm-up-next")).toContainText("UP NEXT · STEP 2 · FLAVOR");

  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 2 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Flavor");
  await expect(page.locator(".cm-segment.done")).toHaveCount(1);

  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");

  // Segments jump straight to a step; the Up next card goes forward one.
  await page.getByRole("tab", { name: "Step 3: Assemble" }).click();
  await expect(page.locator(".cm-step-title")).toHaveText("Assemble");
  await expect(page.getByRole("button", { name: "Finish ✓" })).toBeVisible();
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

test("the timer block starts, adds a minute, resets, and keeps running on another step", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Timer Test",
    servings: "2",
    ingredientName: "chicken",
    steps: "Prep: Season the chicken.\nRoast: Roast for 20 minutes.\nServe: Plate and serve.",
  });

  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator(".cm-timer-time")).toHaveText("20:00");
  await expect(page.locator(".cm-timer-label")).toHaveText("TIMER");

  await page.getByRole("button", { name: "+1 min" }).click();
  await expect(page.locator(".cm-timer-time")).toHaveText("21:00");
  await page.locator(".cm-timer").getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".cm-timer-time")).toHaveText("20:00");

  await page.keyboard.press(" ");
  await expect(page.locator(".cm-timer").getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.locator(".cm-timer-label")).toHaveText("ROASTING…");

  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-running-chip")).toBeVisible();
  await expect(page.locator(".cm-timer")).toHaveCount(0);
});

test("For this step pills show scaled quantities and check off when tapped", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Pills Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas well.\nServe: Plate and serve.",
  });

  const pill = page.locator(".cm-uses-pill");
  await expect(pill.locator(".cm-uses-name")).toHaveText("chickpeas");
  await expect(pill.locator(".cm-uses-qty")).toHaveText("2");
  await pill.click();
  await expect(pill).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Exit cook mode" }).click();
  // 4 -> 8 servings (a clean 2x scale) via the "+" button, four clicks.
  for (let i = 0; i < 4; i++) {
    await page.locator(".riso-rc-servings-stepper button").nth(1).click();
  }
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(page.locator(".cm-uses-qty")).toHaveText("4");
});

test("finishing shows Supper's ready; leftovers go to Inventory and the Planner", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Finish Test",
    servings: "4",
    ingredientName: "pasta",
    steps: "Prep: Boil the pasta.\nServe: Toss with sauce.",
  });

  await page.getByRole("button", { name: "Next step →" }).click();
  await page.getByRole("button", { name: "Finish ✓" }).click();
  await expect(page.getByRole("heading", { name: "Supper's ready." })).toBeVisible();

  const portions = page.locator(".cm-stepper span");
  await expect(portions).toHaveText("3"); // serves 4, minus tonight's
  await page.getByRole("button", { name: "Fewer portions" }).click();
  await expect(portions).toHaveText("2");
  await expect(page.locator(".cm-leftovers-line")).toContainText('show up as "leftover" in the Planner');

  await page.getByRole("button", { name: "Save leftovers" }).click();
  await confirmAdd(page); // nothing goes into Inventory until it is confirmed
  await expect(page.getByRole("button", { name: "✓ Saved to Fridge" })).toBeDisabled();

  await page.getByRole("button", { name: "Exit cook mode" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByText("Cook Mode Finish Test (leftovers)")).toBeVisible();

  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const week = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const entries = await (await page.request.get(`/api/planner?week=${week}`)).json();
  const today = (new Date().getDay() + 6) % 7;
  const expected = Math.min(2, Math.max(0, Math.min(6, today + 3) - today));
  const leftovers = entries.filter((e) => e.isLeftover && e.mealType === "lunch");
  expect(leftovers).toHaveLength(expected);
});

test("Mark as cooked takes the recipe's ingredients out of Inventory", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.request.post("/api/pantry-inventory", { data: { name: "eggs", location: "fridge" } });
  await page.request.post("/api/pantry-inventory", { data: { name: "butter", location: "fridge" } });
  await page.reload();
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Cooked Test",
    servings: "2",
    ingredientName: "eggs",
    steps: "Prep: Whisk the eggs.\nServe: Plate and serve.",
  });

  await page.getByRole("button", { name: "Next step →" }).click();
  await page.getByRole("button", { name: "Finish ✓" }).click();
  await page.getByRole("button", { name: "Mark as cooked" }).click();
  await expect(page.getByRole("button", { name: "✓ Removed from Inventory" })).toBeDisabled();

  const items = await (await page.request.get("/api/pantry-inventory")).json();
  expect(items.map((i) => i.name)).toEqual(["butter"]);
});

test("Exit confirms before closing when a timer is running", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Exit Test",
    servings: "2",
    ingredientName: "bread",
    steps: "Prep: Preheat the oven.\nBake: Bake for 10 minutes.",
  });

  await page.getByRole("button", { name: "Next step →" }).click();
  await page.getByRole("button", { name: "▶ Start timer" }).click();

  let dialogSeen = false;
  page.once("dialog", async (dialog) => {
    dialogSeen = true;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Exit cook mode" }).click();
  await page.waitForTimeout(200);
  expect(dialogSeen).toBe(true);
  await expect(page.locator(".cm-overlay")).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "← Recipe", exact: true }).click();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
});

test("an hour-long timer reads in hours, and a long step with all its ingredients fits without scrolling", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const names = ["beef chuck", "onions", "carrots", "celery", "garlic", "tomato paste", "red wine", "beef stock", "thyme", "bay leaves"];
  const res = await page.request.post("/api/recipes", {
    data: {
      title: "Long Braise",
      baseServings: 4,
      ingredients: names.map((name) => ({ name, quantity: 2, unit: "cup" })),
      instructions: [
        `Braise: Brown the ${names[0]} in batches, then soften the ${names.slice(1, 4).join(", ")} and ${names[4]}; stir in the ${names[5]}, deglaze with the ${names[6]}, add the ${names[7]}, ${names[8]} and ${names[9]}, cover and braise for 90 minutes until the meat falls apart, turning it once halfway and topping up with stock if it looks dry.`,
      ],
    },
  });
  expect(res.ok()).toBeTruthy();

  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await page.getByText("Long Braise", { exact: true }).click();
    await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
    await page.getByRole("button", { name: "Start cooking" }).click();

    await expect(page.locator(".cm-timer-time")).toHaveText("1:30:00");
    await expect(page.locator(".cm-uses-pill")).toHaveCount(names.length);
    // Nothing scrolls: not the page, not the step column.
    const fits = await page.evaluate(() =>
      [".cm-overlay", ".cm-left"].every((sel) => {
        const el = document.querySelector(sel);
        return el.scrollHeight <= el.clientHeight + 1;
      })
    );
    expect(fits).toBe(true);
    // The last ingredient and the Next button are both on screen.
    await expect(page.locator(".cm-uses-pill").last()).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /Finish|Next step/ })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Exit cook mode" }).click();
  }
});
