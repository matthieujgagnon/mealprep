import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { accountButton, langSwitch } from "./account-menu.js";

const prisma = new PrismaClient();

// The header on one row at every desktop width, Tofu on Home, the Recipes
// filters (Meals, Cookbook / Imported, SORT in the chips row) and Makeable's
// meal-type chips, search and sort.

async function signUp(page, name = "Matt") {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[placeholder="e.g. Matt"]', name);
  await page.fill('input[type="email"]', `polish+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

const recipe = (page, title, mealSlot, ingredients, extra = {}) =>
  page.request.post("/api/recipes", { data: { title, mealSlot, ingredients: ingredients.map((name) => ({ name })), ...extra } });

async function oneRow(page) {
  const header = await page.locator(".app-header").boundingBox();
  const logo = await page.locator(".wordmark").boundingBox();
  expect(header.height).toBeLessThan(logo.height + 70); // one row of 36px pills, not two
  for (const sel of [".tabs", ".riso-lang-switch:visible"]) {
    const box = await page.locator(`.app-header ${sel}`).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);
    expect(box.y).toBeLessThan(logo.y + logo.height); // beside the logo, not under it
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

test.describe("header", () => {
  test("stays on one row from 1024px up, in English and French", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signUp(page, "Matthieu Gagnon");
    for (const lang of ["English", "Français"]) {
      await langSwitch(page).getByRole("button", { name: lang }).click();
      for (const width of [1024, 1100, 1200, 1280, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await oneRow(page);
      }
    }
  });

  test("stays on one row even with a much wider font than the app's own", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signUp(page, "Matthieu Gagnon");
    // The app's web fonts load from the network and differ between machines;
    // a wide system font stands in for the worst of them.
    await page.addStyleTag({ content: '.app-header *, .wordmark { font-family: "DejaVu Sans", Verdana, sans-serif !important; }' });
    for (const lang of ["English", "Français"]) {
      await langSwitch(page).getByRole("button", { name: lang }).click();
      for (const width of [1024, 1100, 1200, 1280, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await oneRow(page);
      }
    }
  });

  test("the name, Help and Log out are always in the avatar menu, in both languages; FR | EN stays out", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await signUp(page, "Matt");
    await expect(langSwitch(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Help", exact: true })).toHaveCount(0); // not inline, even with room
    await expect(page.getByRole("button", { name: "Log out", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Account" }).click();
    const menu = page.locator(".app-header-avatar-menu");
    await expect(menu).toContainText("Matt");
    await expect(menu.getByRole("button", { name: "Help", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await page.getByRole("button", { name: "Compte" }).click();
    await expect(menu.getByRole("button", { name: "Aide", exact: true })).toBeVisible();
    await (await accountButton(page, "Se déconnecter")).click();
    await expect(page.getByRole("button", { name: "S'inscrire" })).toBeVisible();
  });
});

test("Home lists Tofu, and recipes with any kind of tofu match it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const userId = await signUp(page, "Matt");
  await recipe(page, "Crispy tofu bowl", "dinner", ["extra-firm tofu", "rice"]);
  await recipe(page, "Miso soup", "lunch", ["silken tofu", "miso"]);
  await recipe(page, "Plain rice", "side", ["rice"]);
  await prisma.flyerDeal.create({
    data: { userId, store: "Metro", source: "Metro", category: "protein", item: "Firm tofu", matchName: "firm tofu", price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 3.49, isCurrent: true, createdAt: new Date() },
  });
  await page.reload();
  const proteins = page.locator(".riso-home-proteins");
  await expect(proteins.getByRole("button", { name: /Tofu: Firm tofu at Metro/ })).toBeVisible();
  await expect(proteins.getByRole("button", { name: /Tofu: Firm tofu at Metro/ }).locator(".riso-protein-emoji")).toHaveText("⬜"); // its own emoji, not the beans
  // Every kind has a row; the ones with nothing this week say so.
  await expect(proteins.locator(".riso-protein-row")).toHaveCount(8);
  await expect(proteins.getByRole("button", { name: "Chicken: no deal this week" })).toContainText("No deal this week");

  // Selecting it shows the bar with the count of recipes Recipes then lists.
  const row = proteins.getByRole("button", { name: /Tofu: Firm tofu at Metro/ });
  const bar = page.locator(".riso-protein-bar");
  await expect(bar).toHaveCount(0);
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(bar).toContainText("2 of your recipes use tofu.");
  // The same bar in French, with the right article.
  await langSwitch(page).getByRole("button", { name: "Français" }).click();
  await expect(bar).toContainText("2 de vos recettes utilisent du tofu.");
  await expect(bar).toContainText("Les voir →");
  await langSwitch(page).getByRole("button", { name: "English" }).click();
  // Tapping it again deselects and hides the bar.
  await row.click();
  await expect(bar).toHaveCount(0);

  await row.click();
  await bar.click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.locator(".riso-recipe-card-name")).toHaveCount(2);
  // A Tofu chip you can clear, not a long search.
  await expect(page.locator(".riso-recipes-searchbar input")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^PROTEIN/ })).toContainText("Tofu");
});

test("Home shows a tofu deal that has no regular price, and Tofu says so when it has none", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const userId = await signUp(page, "Matt");
  await page.reload();
  const proteins = page.locator(".riso-home-proteins");
  await expect(proteins.getByRole("button", { name: "Tofu: no deal this week" })).toContainText("No deal this week");
  // Smoked tofu with nothing to compare it with is still this week's tofu.
  await prisma.flyerDeal.create({
    data: { userId, store: "IGA", source: "IGA", category: "protein", item: "Smoked tofu, 350 g", matchName: "smoked tofu", price: "$2.99", unitPrice: 2.99, unitBasis: "each", isCurrent: true, createdAt: new Date() },
  });
  await page.reload();
  const tofu = proteins.getByRole("button", { name: /^Tofu: Smoked tofu at IGA/ });
  await expect(tofu).toBeVisible();
  await expect(tofu).toContainText("$3.87/lb"); // 350 g at $2.99, per lb like the rest
  await expect(proteins.locator(".riso-protein-row")).toHaveCount(8);
});

test.describe("Proteins on sale bar on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("says none use it when no recipe does, with no arrow, and stays inside the screen", async ({ page }) => {
    const userId = await signUp(page, "Matt");
    await prisma.flyerDeal.create({
      data: { userId, store: "Metro", source: "Metro", category: "protein", item: "Tofu ferme", matchName: "tofu ferme", price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 3.49, isCurrent: true, createdAt: new Date() },
    });
    await page.reload();
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    const row = page.locator(".riso-home-proteins .riso-protein-row", { hasText: "Tofu ferme" });
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const bar = page.locator(".riso-protein-bar");
    await expect(bar).toHaveText("Aucune de vos recettes n'utilise de tofu pour l'instant.");
    await expect(bar).not.toContainText("→");
    await page.waitForTimeout(400); // the slide-up
    const box = await bar.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: test.info().outputPath("proteins-bar-phone-fr.png") });
    await row.click();
    await expect(bar).toHaveCount(0);
  });
});

test.describe("Recipes", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("Meals hides breakfast, sides and pantry prep; Protein, Time and Sort sit beside the tabs", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry", "dinner", ["chicken"]);
    await recipe(page, "Lunch wrap", "lunch", ["tortilla"]);
    await recipe(page, "Pancakes", "breakfast", ["flour"]);
    await recipe(page, "Garlic rice", "side", ["rice"]);
    await recipe(page, "Pickled onions", "prep", ["onion"]);
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    await expect(page.locator(".riso-recipes-heading-row").getByRole("button", { name: /^SORT/ })).toHaveCount(0);
    await expect(page.locator(".rv2-tabrow").getByRole("button", { name: /^SORT/ })).toBeVisible();

    await page.getByRole("button", { name: /^Meals/ }).click();
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Lunch wrap", "Chicken curry"]);
  });

  test("Cookbook and Imported are tabs with their own counts", async ({ page }) => {
    const userId = await signUp(page);
    await recipe(page, "Grandma's lasagna", "dinner", ["pasta"]); // by hand: Cookbook
    await prisma.recipe.create({
      data: { userId, title: "Imported pad thai", inCookbook: false, inImported: true, instructions: "[]", ingredients: { create: [{ name: "noodles" }] } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    const tabs = page.getByRole("tablist", { name: "Cookbook or Imported" });
    await expect(tabs.getByRole("tab")).toHaveText([/Cookbook\s*1/, /Imported\s*1/]);
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Grandma's lasagna"]);
    await tabs.getByRole("tab", { name: /^Imported/ }).click();
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Imported pad thai"]);

    // An import can be moved to the Cookbook from its editor.
    await page.locator(".riso-recipe-card", { hasText: "Imported pad thai" }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: "Edit recipe" }).click();
    await page.getByRole("radio", { name: "Cookbook" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".riso-rc-title")).toHaveText("Imported pad thai");
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-overlay")).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /^Cookbook/ })).toContainText("2");
    await expect(tabs.getByRole("tab", { name: /^Imported/ })).toContainText("0");
  });
});

test.describe("Recipes meal chips", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("meal chips count what the other filters leave, switching tabs starts over at All, and Clear filters resets", async ({ page }) => {
    const userId = await signUp(page);
    await recipe(page, "Chicken curry", "dinner", ["chicken"], { prepTimeMinutes: 30 });
    await recipe(page, "Pasta bake", "dinner", ["pasta"], { prepTimeMinutes: 90 });
    await recipe(page, "Pancakes", "breakfast", ["flour"]);
    await recipe(page, "Garlic rice", "side", ["rice"]);
    await prisma.recipe.create({
      data: { userId, title: "Imported pad thai", inCookbook: false, inImported: true, instructions: "[]", ingredients: { create: [{ name: "noodles" }] } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    const chips = page.locator(".rv2-chips");
    const chip = (name) => chips.getByRole("button", { name });
    await expect(page.locator(".rv2-count")).toHaveText("4 RECIPES");
    await expect(chip(/^All\s*4$/)).toBeVisible();
    await expect(chip(/^Breakfast\s*1$/)).toBeVisible();
    await expect(chip(/^Supper\s*2$/)).toBeVisible();
    await expect(chip(/^Sides\s*1$/)).toBeVisible();
    await expect(chip(/^Lunch\s*0$/)).toBeVisible();

    // Picking Supper filters the grid and the count line says so.
    await chip(/^Supper/).click();
    await expect(page.locator(".riso-recipe-card-name")).toHaveCount(2);
    await expect(page.locator(".rv2-count")).toHaveText("2 RECIPES MATCH");

    // A time limit changes the other chips' counts but not the one you picked.
    await page.getByRole("button", { name: /^TIME/ }).click();
    await page.getByRole("option", { name: "Under 1 hour" }).click();
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Chicken curry"]);
    await expect(page.locator(".rv2-count")).toHaveText("1 RECIPE MATCHES");
    await expect(chip(/^Supper\s*1$/)).toBeVisible();

    // Clear filters: everything back, the tab and sort stay.
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(".rv2-count")).toHaveText("4 RECIPES");
    await expect(chip(/^All/)).toHaveAttribute("aria-pressed", "true");

    // Switching tab starts over at All.
    await chip(/^Sides/).click();
    await page.getByRole("tab", { name: /^Imported/ }).click();
    await expect(chip(/^All/)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Imported pad thai"]);

    // Nothing matches: the dashed box says so.
    await chip(/^Breakfast/).click();
    await expect(page.locator(".riso-recipes-empty")).toHaveText("No recipes match these filters.");
  });
});

test.describe("Makeable", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("filters by meal type, and search and sort reorder the results, avocado toast included", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Avocado toast", "breakfast", ["avocado", "bread"], { prepTimeMinutes: 5 });
    await recipe(page, "Brownies", "dessert", ["chocolate", "flour"], { prepTimeMinutes: 40 });
    await recipe(page, "Chicken curry", "dinner", ["chicken", "rice"], { prepTimeMinutes: 20 });
    await recipe(page, "Garlic rice", "side", ["rice", "garlic"], { prepTimeMinutes: 10 });
    for (const name of ["avocado", "bread", "chocolate", "flour", "chicken", "rice", "garlic"]) {
      await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
    }
    await page.reload();
    await page.getByRole("button", { name: "Makeable", exact: true }).click();
    const names = page.locator(".riso-makeable-card-name");
    await expect(names).toHaveCount(4);

    const chips = page.locator(".riso-makeable .riso-recipes-filter-chips");
    await chips.getByRole("button", { name: /^Meals/ }).click();
    await expect(names).toHaveText(["Chicken curry"]);
    await chips.getByRole("button", { name: /^Desserts/ }).click();
    await expect(names).toHaveText(["Brownies"]);
    await chips.getByRole("button", { name: /^Sides/ }).click();
    await expect(names).toHaveText(["Garlic rice"]);
    await chips.getByRole("button", { name: /^All/ }).click();

    // Sort: avocado toast is first by title and by time, last by neither once another sort puts it elsewhere.
    const sort = page.getByLabel("Sort recipes");
    await sort.selectOption({ label: "A–Z" });
    await expect(names).toHaveText(["Avocado toast", "Brownies", "Chicken curry", "Garlic rice"]);
    await sort.selectOption({ label: "Quickest" });
    await expect(names).toHaveText(["Avocado toast", "Garlic rice", "Chicken curry", "Brownies"]);

    // Search narrows the list.
    await page.getByLabel("Search these recipes").fill("rice");
    await expect(names).toHaveText(["Garlic rice", "Chicken curry"]);
  });
});
