import { expect, test } from "@playwright/test";
import { saveRecipe } from "./recipe-form.js";
import { confirmAdd } from "./inventory-confirm.js";

// Cook mode (design 2c, docs/design/riso-v2-cook-mode): one step at a time with
// the step rail, per-step timers that keep running across step changes,
// tap-to-check "For this step" rows, keyboard nav, the shared light / dark
// switch, and the finished view (Mark as cooked, Save leftovers).

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
          "Préparation: Coupez les hauts de cuisse de poulet en dés.",
          "Rôtir: Étalez les hauts de cuisse de poulet sur la plaque, arrosez d'huile d'olive et saupoudrez d'épices shawarma. Faites rôtir 25 minutes, en retournant à mi-cuisson.",
          "Sauce au yogourt: Mélangez le yogourt.",
        ],
      },
      { fr: true }
    );
    await page.getByRole("tab", { name: /Étape 2/ }).click();
    await expect(page.locator(".cm-step-title")).toHaveText("Rôtir");

    for (const theme of ["dark", "light"]) {
      if ((await page.locator(".cm-overlay").getAttribute("data-theme")) !== theme) {
        await page.locator(".cm-theme").click();
      }
      await page.locator(".cm-timer-main").click(); // "Pause" / "▶ Lancer la minuterie" both have to fit
      await page.locator(".cm-uses-row").first().click();
      const problems = await page.evaluate(() => {
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
        if (document.documentElement.scrollWidth > 390) out.push("the page scrolls sideways");
        return out;
      });
      expect(problems, theme).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`cook-fr-phone-${theme}.png`) });
    }
  });
});
