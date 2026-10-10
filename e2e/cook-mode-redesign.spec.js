import { expect, test } from "@playwright/test";
import { saveRecipe } from "./recipe-form.js";
import { confirmAdd } from "./inventory-confirm.js";

// Cook mode (design 2c, docs/design/riso-v2-cook-mode): one step at a time with
// the step rail, per-step timers that keep running across step changes,
// tap-to-check "For this step" rows, keyboard nav, the shared light / dark
// switch, and the finished view (Mark as cooked, Save leftovers). Also the "Before you
// start" page (docs/design/riso-v2-cook-mode-prep) a recipe with prep notes opens on.

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
  await saveRecipe(page);
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
  await page.getByRole("button", { name: "Start cooking" }).click();
}

test("steps navigate with Next/Previous and the step rail tracks position", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Nav Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas.\nFlavor: Toss with oil.\nAssemble: Serve hot.",
  });

  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Prep");
  await expect(page.locator(".cm-rail-item.current")).toHaveCount(1);
  await expect(page.locator(".cm-rail-item.done")).toHaveCount(0);
  await expect(page.locator(".cm-rail-label")).toHaveText(["Prep", "Flavor", "Assemble"]);
  await expect(page.locator(".cm-up-next")).toContainText("UP NEXT · STEP 2 · FLAVOR");

  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 2 OF 3");
  await expect(page.locator(".cm-step-title")).toHaveText("Flavor");
  await expect(page.locator(".cm-rail-item.done")).toHaveCount(1);

  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");

  // A dot jumps straight to its step; Up next goes forward one.
  await page.getByRole("tab", { name: "Step 3: Assemble" }).click();
  await expect(page.locator(".cm-step-title")).toHaveText("Assemble");
  // The last step: Next says Finish, and there is no Up next.
  await expect(page.getByRole("button", { name: "Finish ✓" })).toBeVisible();
  await expect(page.locator(".cm-up-next")).toHaveCount(0);
  await page.getByRole("tab", { name: "Step 1: Prep" }).click();
  await page.locator(".cm-up-next").click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 2 OF 3");
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

test("For this step rows show scaled quantities and check off when tapped", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Pills Test",
    servings: "4",
    ingredientName: "chickpeas",
    steps: "Prep: Rinse the chickpeas well.\nServe: Plate and serve.",
  });

  const row = page.locator(".cm-uses-row");
  await expect(row.locator(".cm-uses-name")).toHaveText("chickpeas");
  await expect(row.locator(".cm-uses-qty")).toHaveText("2");
  await expect(page.locator(".cm-uses-count")).toHaveText("0 / 1");
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-uses-count")).toHaveText("1 / 1");

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

test("closing Cook mode with a timer running asks nothing, and the timer carries on on the recipe card", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await addRecipeAndStartCooking(page, {
    title: "Cook Mode Exit Test",
    servings: "2",
    ingredientName: "bread",
    steps: "Prep: Preheat the oven.\nBake: Bake for 10 minutes.",
  });

  await page.getByRole("button", { name: "Next step →" }).click();
  await page.getByRole("button", { name: "▶ Start timer" }).click();

  // The timers belong to the recipe card, so closing loses nothing: no question, neither
  // the browser's box nor the app's.
  let dialogSeen = false;
  page.on("dialog", async (dialog) => {
    dialogSeen = true;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Exit cook mode" }).click();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
  expect(dialogSeen).toBe(false);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  // The card's own timer for that step is still running...
  await expect(page.locator(".riso-rc-timer-btn.primary", { hasText: "Pause" })).toBeVisible();
  // ...and Cook mode picks it up where it was.
  await page.getByRole("button", { name: "Start cooking" }).click();
  await page.getByRole("tab", { name: "Step 2: Bake" }).click();
  await expect(page.locator(".cm-timer-main")).toHaveText("Pause");

  // Escape closes it the same way.
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
  expect(dialogSeen).toBe(false);
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
    await expect(page.locator(".cm-uses-row")).toHaveCount(names.length);
    // Nothing scrolls: not the page, not the step column.
    const fits = await page.evaluate(() =>
      [".cm-overlay", ".cm-left"].every((sel) => {
        const el = document.querySelector(sel);
        return el.scrollHeight <= el.clientHeight + 1;
      })
    );
    expect(fits).toBe(true);
    // The last ingredient and the Next button are both on screen.
    await expect(page.locator(".cm-uses-row").last()).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /Finish|Next step/ })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Exit cook mode" }).click();
  }
});

// A recipe made through the API, opened in Cook mode the way a person gets there.
async function cookFromApi(page, recipe, { fr = false } = {}) {
  const res = await page.request.post("/api/recipes", { data: { baseServings: 4, ...recipe } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: fr ? "Recettes" : "Recipes", exact: true }).click();
  await page.getByText(recipe.title, { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
  await page.getByRole("button", { name: fr ? "Commencer à cuisiner" : "Start cooking" }).click();
  await expect(page.locator(".cm-overlay")).toBeVisible();
}

test("a long step is drawn in short paragraphs, never split after an abbreviation, and the saved recipe is untouched", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const saved = "Prep: Preheat to 350 °F. Line a sheet with 2 tbsp. Olive oil, then bake 10 min. Rest 5 minutes. Serve!";
  await cookFromApi(page, { title: "Cook Mode Paragraphs", ingredients: [{ name: "olive oil", quantity: 2, unit: "tbsp" }], instructions: [saved] });

  // A period right after °F ends a sentence; after "tbsp." and "min." it doesn't.
  const drawn = await page.locator(".cm-step-text").evaluate((el) => el.textContent);
  expect(drawn).toBe("Preheat to 350 °F.\n\nLine a sheet with 2 tbsp. Olive oil, then bake 10 min. Rest 5 minutes.\n\nServe!");

  const recipes = await (await page.request.get("/api/recipes")).json();
  expect(recipes.find((r) => r.title === "Cook Mode Paragraphs").instructions).toEqual([saved]);
});

test("Cook mode opens dark like Store mode; the shared ☀ / ☾ switch changes it and the choice is kept; the finished view stays light", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, { title: "Cook Mode Theme", ingredients: [{ name: "rice", quantity: 1, unit: "cup" }], instructions: ["Prep: Rinse the rice.", "Serve: Plate the rice."] });

  const overlay = page.locator(".cm-overlay");
  await expect(overlay).toHaveAttribute("data-theme", "dark");
  // The dark colours are tokens: the page is black, the cards #111115, the type ink.
  await expect(overlay).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator(".cm-topbar")).toHaveCSS("background-color", "rgb(17, 17, 21)");

  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(overlay).toHaveAttribute("data-theme", "light");
  await expect(overlay).toHaveCSS("background-color", "rgb(244, 241, 234)");
  expect(await page.evaluate(() => localStorage.getItem("mealprep-theme"))).toBe("light");

  // Kept: closed and opened again, it is still light.
  await page.getByRole("button", { name: "Exit cook mode" }).click();
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(overlay).toHaveAttribute("data-theme", "light");

  // The finished view is still the earlier one, light, and has no switch.
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(overlay).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Next step →" }).click();
  await page.getByRole("button", { name: "Finish ✓" }).click();
  await expect(page.getByRole("heading", { name: "Supper's ready." })).toBeVisible();
  await expect(overlay).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".riso-theme-switch")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to step 1" }).click();
  await expect(overlay).toHaveAttribute("data-theme", "dark");
});

test("the step rail scrolls with many steps, and a very long recipe still reaches every step", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const steps = Array.from({ length: 16 }, (_, i) => `Step number ${String.fromCharCode(65 + i)}: Do thing ${i + 1} carefully.`);
  await cookFromApi(page, { title: "Cook Mode Sixteen", ingredients: [{ name: "thing", quantity: 1, unit: "" }], instructions: steps });
  await expect(page.locator(".cm-rail-item")).toHaveCount(16);
  await page.getByRole("tab", { name: /^Step 16/ }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 16 OF 16");
  // The current dot is brought into view even though the rail has more dots than room.
  await expect(page.locator(".cm-rail-item.current")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Finish ✓" })).toBeVisible();
});

const PREP_RECIPE = {
  title: "Prep Page Chicken",
  ingredients: [
    { name: "chicken thighs", quantity: 900, unit: "g", notes: "diced" },
    { name: "olive oil", quantity: 2, unit: "tbsp" },
    { name: "garlic", quantity: 3, unit: "clove", notes: "minced" },
    { name: "lemon", quantity: 1, unit: "", notes: "zest and juice" },
    { name: "butter", quantity: 2, unit: "tbsp", notes: "room temperature" },
    { name: "soy sauce", quantity: 2, unit: "tbsp", notes: "low sodium" },
    { name: "salt", quantity: 1, unit: "tsp", notes: "to taste" },
  ],
  instructions: [
    "Prep: Preheat the oven to 425°F. Mix the olive oil and coat the chicken.",
    "Roast: Spread the chicken on the pan with the garlic. Roast 25 minutes.",
    "Sauce: Stir the garlic, the lemon and the butter together.",
  ],
};

test("a recipe with prep notes opens on Before you start: groups, how lines, step tags and Do first", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, PREP_RECIPE);

  await expect(page.locator(".cm-prep-col")).toBeVisible();
  await expect(page.locator(".cm-prep-intro .cm-step-count")).toHaveText("BEFORE YOU START · 4 TO PREP");
  await expect(page.locator(".cm-prep-intro .cm-step-title")).toHaveText("Get everything ready");

  // Only ingredients with a prep note; "low sodium" and "to taste" are not preparation.
  await expect(page.locator(".cm-prep-row")).toHaveCount(4);
  await expect(page.locator(".cm-prep-group-name")).toHaveText(["CUT", "SQUEEZE / ZEST", "OTHER"]);
  await expect(page.locator(".cm-prep-group-count")).toHaveText(["2 ingredients", "1 ingredient", "1 ingredient"]);
  await expect(page.locator(".cm-prep-row .cm-uses-name")).toHaveText(["Chicken thighs", "Garlic", "Lemon", "Butter"]);
  await expect(page.locator(".cm-prep-row .cm-uses-qty")).toHaveText(["900 g", "3 cloves", "1", "2 tbsp"]);
  await expect(page.locator(".cm-prep-how")).toHaveText(["Dice", "Mince", "Zest and juice", "Room temperature"]);
  await expect(page.locator(".cm-prep-tag")).toHaveText(["STEPS 1 · 2", "STEPS 2 · 3", "STEP 3", "STEP 3"]);

  // Do first is the recipe's own sentence with both units, beside the photo.
  await expect(page.locator(".cm-prep-first-label")).toHaveText("DO FIRST");
  await expect(page.locator(".cm-prep-first-text")).toHaveText("Preheat the oven to 425 °F (220 °C).");

  // The rail starts with a dot 0, the current one; there is no Previous; Up next previews step 1.
  await expect(page.locator(".cm-rail-item")).toHaveCount(4);
  await expect(page.locator(".cm-rail-item.current .cm-rail-dot")).toHaveText("0");
  await expect(page.locator(".cm-rail-item.current .cm-rail-label")).toHaveText("Get ready");
  await expect(page.locator(".cm-prev")).toHaveCount(0);
  await expect(page.locator(".cm-up-next-label")).toHaveText("THEN · STEP 1 · PREP");
  await expect(page.locator(".cm-up-next-text")).toHaveText("Preheat the oven to 425°F. Mix the olive oil and coat the chicken.");

  // Start step 1 moves on; Previous (and dot 0) come back; nothing is lost.
  await page.getByRole("button", { name: "Start step 1" }).click();
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await expect(page.locator(".cm-rail-item.done .cm-rail-dot")).toHaveText("✓");
  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.locator(".cm-prep-col")).toBeVisible();
  await page.getByRole("button", { name: "Start step 1" }).click();
  await page.getByRole("tab", { name: "Get ready" }).click();
  await expect(page.locator(".cm-prep-col")).toBeVisible();

  // The saved recipe is untouched.
  const recipes = await (await page.request.get("/api/recipes")).json();
  const saved = recipes.find((r) => r.title === PREP_RECIPE.title);
  expect(saved.instructions).toEqual(PREP_RECIPE.instructions);
  expect(saved.ingredients.map((i) => i.notes ?? null)).toEqual(PREP_RECIPE.ingredients.map((i) => i.notes ?? null));
});

test("ticks on the prep page are the ones in For this step, and never touch Inventory", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, PREP_RECIPE);

  const prepRow = (name) => page.locator(".cm-prep-row").filter({ hasText: name });
  const stepRow = (name) => page.locator(".cm-uses-row").filter({ hasText: name });

  // Not required: Start step 1 works with nothing ticked. Tick chicken (steps 1 and 2) and garlic (2 and 3).
  await prepRow("Chicken thighs").click();
  await prepRow("Garlic").click();
  await expect(prepRow("Chicken thighs")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-prep-row.on")).toHaveCount(2);

  await page.getByRole("button", { name: "Start step 1" }).click();
  await expect(stepRow("chicken thighs")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(stepRow("chicken thighs")).toHaveAttribute("aria-pressed", "true");
  await expect(stepRow("garlic")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(stepRow("garlic")).toHaveAttribute("aria-pressed", "true");

  // Unticking it in one step leaves the prep row unticked (it is ticked only when every step has it).
  await stepRow("garlic").click();
  await page.getByRole("tab", { name: "Get ready" }).click();
  await expect(prepRow("Garlic")).toHaveAttribute("aria-pressed", "false");
  await expect(prepRow("Chicken thighs")).toHaveAttribute("aria-pressed", "true");
  // Tapping it again ticks it in every step it is used in.
  await prepRow("Garlic").click();
  await expect(prepRow("Garlic")).toHaveAttribute("aria-pressed", "true");

  // An ingredient no step uses keeps its tick on this page.
  await prepRow("Butter").click();
  await expect(prepRow("Butter")).toHaveAttribute("aria-pressed", "true");

  const inventory = await (await page.request.get("/api/pantry-inventory")).json();
  expect(inventory).toEqual([]);
});

test("a recipe with no prep notes skips the page and opens on step 1, even with a preheat step", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, {
    title: "No Prep Notes",
    ingredients: [
      { name: "soy sauce", quantity: 2, unit: "tbsp", notes: "low sodium" },
      { name: "salt", quantity: 1, unit: "tsp", notes: "to taste" },
      { name: "canned tomatoes", quantity: 1, unit: "can", notes: "796 ml" },
      { name: "rice", quantity: 1, unit: "cup" },
    ],
    instructions: ["Bake: Preheat the oven to 400F and bake the rice.", "Serve: Plate the rice."],
  });
  await expect(page.locator(".cm-prep-col")).toHaveCount(0);
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 2");
  await expect(page.locator(".cm-rail-item")).toHaveCount(2);
  await expect(page.locator(".cm-prev")).toBeDisabled();
});

test("a step 1 that is just Prep stays as it is, and the Do first card is left out when no step preheats", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, {
    title: "Prep Step One",
    ingredients: [{ name: "onions", quantity: 2, unit: "", notes: "diced" }],
    instructions: ["Prep: Dice the onions.", "Cook: Fry the onions 10 minutes."],
  });
  await expect(page.locator(".cm-prep-first")).toHaveCount(0);
  await expect(page.locator(".cm-prep-tag")).toHaveText("STEPS 1 · 2");
  await page.getByRole("button", { name: "Start step 1" }).click();
  await expect(page.locator(".cm-step-title")).toHaveText("Prep");
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 2");
});

test("the arrow keys and Escape work on the prep page", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await cookFromApi(page, PREP_RECIPE);
  await page.keyboard.press("ArrowLeft"); // nothing before it
  await expect(page.locator(".cm-prep-col")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".cm-prep-col")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
});

test("the prep page is light or dark with the shared switch, and a long list scrolls with the bars in place", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const names = Array.from({ length: 18 }, (_, i) => `vegetable ${String.fromCharCode(97 + i)}`);
  await cookFromApi(page, {
    title: "Prep Long List",
    ingredients: names.map((name) => ({ name, quantity: 1, unit: "", notes: "finely chopped" })),
    instructions: ["Prep: Chop everything.", "Cook: Cook it."],
  });
  const overlay = page.locator(".cm-overlay");
  await expect(overlay).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".cm-prep-first")).toHaveCount(0);
  await expect(page.locator(".cm-photo")).toHaveCSS("background-color", "rgb(27, 27, 33)");
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(overlay).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".cm-prep-row").first()).toHaveCSS("border-bottom-color", "rgb(189, 182, 166)");

  // 18 rows are taller than the screen: the middle column scrolls, the top and bottom bars stay.
  const col = page.locator(".cm-prep-col");
  const scrolls = await col.evaluate((el) => el.scrollHeight > el.clientHeight + 40);
  expect(scrolls).toBe(true);
  await col.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await col.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect(page.locator(".cm-prep-row").last()).toBeInViewport();
  await expect(page.getByRole("button", { name: "Start step 1" })).toBeInViewport();
  await expect(page.locator(".cm-topbar")).toBeInViewport();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the prep page has no photo, Do first comes first, tags sit under the how line and a long list scrolls", async ({ page }) => {
    await signUp(page, uniqueEmail());
    const extra = Array.from({ length: 12 }, (_, i) => ({ name: `herb ${String.fromCharCode(97 + i)}`, quantity: 1, unit: "bunch", notes: "roughly chopped" }));
    await cookFromApi(page, { ...PREP_RECIPE, title: "Prep Phone", ingredients: [...PREP_RECIPE.ingredients, ...extra] });

    await expect(page.locator(".cm-prep-col")).toBeVisible();
    await expect(page.locator(".cm-photo")).toHaveCount(0);
    await expect(page.locator(".cm-phone-steps .cm-step-title")).toHaveText("Get everything ready");
    await expect(page.locator(".cm-rail.top .cm-rail-item.current .cm-rail-dot")).toHaveText("0");
    await expect(page.locator(".cm-prev")).toHaveCount(0);

    // Do first sits above the groups; each tag is under its how line.
    const firstTop = (await page.locator(".cm-prep-first").boundingBox()).y;
    const listTop = (await page.locator(".cm-prep-list").boundingBox()).y;
    expect(firstTop).toBeLessThan(listTop);
    const row = page.locator(".cm-prep-row").filter({ hasText: "Chicken thighs" });
    const how = (await row.locator(".cm-prep-how").boundingBox()).y;
    const tag = (await row.locator(".cm-prep-tag").boundingBox()).y;
    expect(tag).toBeGreaterThan(how);

    // Scrolls; the button stays; nothing sideways.
    const col = page.locator(".cm-prep-col");
    expect(await col.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true);
    await col.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator(".cm-prep-row").last()).toBeInViewport();
    await expect(page.getByRole("button", { name: "Start step 1" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Start step 1 fills the width of the bar and moves on.
    await page.getByRole("button", { name: "Start step 1" }).click();
    await expect(page.locator(".cm-step-count")).toHaveText("STEP 1 OF 3");
  });
});

test.describe("phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("every button and the quantities fit at 390 px, in light and dark", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await page.fill('input[type="email"]', uniqueEmail());
    await page.fill('input[type="password"]', "testpass123");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".tab.active")).toHaveText("Accueil");

    await cookFromApi(
      page,
      {
        title: "Poulet shawarma",
        ingredients: [
          { name: "hauts de cuisse de poulet", quantity: 900, unit: "g", notes: "en dés" },
          { name: "huile d'olive", quantity: 2, unit: "tbsp" },
          { name: "épices shawarma", quantity: 1.5, unit: "tbsp" },
        ],
        instructions: [
          "Préparation: Préchauffez le four à 220 °C et tapissez une plaque. Coupez les hauts de cuisse de poulet en dés.",
          "Rôtir: Étalez les hauts de cuisse de poulet sur la plaque, arrosez d'huile d'olive et saupoudrez d'épices shawarma. Faites rôtir 25 minutes, en retournant à mi-cuisson.",
          "Sauce au yogourt: Mélangez le yogourt.",
        ],
      },
      { fr: true }
    );
    // The chicken has a prep note, so Cook mode opens on « Avant de commencer » first.
    await expect(page.locator(".cm-prep-col")).toBeVisible();
    await expect(page.locator(".cm-phone-steps .cm-step-title")).toHaveText("Préparez tout");
    await expect(page.locator(".cm-prep-intro .cm-step-count")).toHaveText("AVANT DE COMMENCER · 1 À PRÉPARER");
    await expect(page.locator(".cm-prep-group-name")).toHaveText("COUPER");
    await expect(page.locator(".cm-prep-group-count")).toHaveText("1 ingrédient");
    await expect(page.locator(".cm-prep-how")).toHaveText("Coupez en dés");
    await expect(page.locator(".cm-prep-tag")).toHaveText("ÉTAPES 1 · 2");
    await expect(page.locator(".cm-prep-first-label")).toHaveText("D'ABORD");
    await expect(page.locator(".cm-prep-first-text")).toHaveText("Préchauffez le four à 220 °C (425 °F) et tapissez une plaque.");
    await expect(page.locator(".cm-rail-item.current .cm-rail-dot")).toHaveText("0");
    await expect(page.getByRole("button", { name: "Commencer l'étape 1" })).toBeVisible();

    for (const theme of ["dark", "light"]) {
      if ((await page.locator(".cm-overlay").getAttribute("data-theme")) !== theme) {
        await page.locator(".cm-theme").click();
      }
      await page.locator(".cm-prep-row").first().click(); // ticked and not ticked both have to fit
      expect(await fitProblems(page), `prep page, ${theme}`).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`cook-fr-phone-prep-${theme}.png`) });
      await page.locator(".cm-prep-row").first().click();
    }

    await page.getByRole("tab", { name: /Étape 2/ }).click();
    await expect(page.locator(".cm-step-title")).toHaveText("Rôtir");

    for (const theme of ["dark", "light"]) {
      if ((await page.locator(".cm-overlay").getAttribute("data-theme")) !== theme) {
        await page.locator(".cm-theme").click();
      }
      await page.locator(".cm-timer-main").click(); // "Pause" / "▶ Lancer la minuterie" both have to fit
      await page.locator(".cm-uses-row").first().click();
      const problems = await fitProblems(page);
      expect(problems, theme).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`cook-fr-phone-${theme}.png`) });
    }
  });
});

// Whether every button, amount and row fits its box at 390 px (the French words are the long ones).
function fitProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const inside = (el, box, name) => {
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) out.push(`${name} sticks out of its box`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${name} cuts its text`);
    };
    for (const b of document.querySelectorAll(".cm-timer button")) inside(b, document.querySelector(".cm-timer"), `timer button "${b.textContent}"`);
    for (const b of document.querySelectorAll(".cm-bottom button")) inside(b, document.querySelector(".cm-bottom"), `bottom button "${b.textContent}"`);
    for (const b of document.querySelectorAll(".cm-topbar button")) inside(b, document.querySelector(".cm-topbar"), `top bar button "${b.getAttribute("aria-label") || b.textContent}"`);
    // The amount never runs under the check, and no row is wider than the column.
    for (const row of document.querySelectorAll(".cm-uses-row")) {
      const q = row.querySelector(".cm-uses-qty");
      const d = row.querySelector(".cm-uses-dot");
      if (q.scrollWidth > q.clientWidth + 1) out.push(`amount "${q.textContent}" is cut`);
      if (q.getBoundingClientRect().left < d.getBoundingClientRect().right) out.push(`amount "${q.textContent}" runs under the check`);
    }
    // The prep page's how line and tag stay inside their row.
    for (const el of document.querySelectorAll(".cm-prep-row .cm-prep-how, .cm-prep-row .cm-prep-tag, .cm-prep-first-text")) {
      const box = el.closest(".cm-prep-row, .cm-prep-first");
      if (el.getBoundingClientRect().right > box.getBoundingClientRect().right + 1) out.push(`"${el.textContent}" runs past its row`);
    }
    if (document.documentElement.scrollWidth > 390) out.push("the page scrolls sideways");
    return out;
  });
}
