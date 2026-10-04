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
  await expect(proteins).toContainText("2 of your recipes use firm tofu");
});

test.describe("Recipes", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("Meals hides breakfast, sides and pantry prep; SORT lives in the chips row", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry", "dinner", ["chicken"]);
    await recipe(page, "Lunch wrap", "lunch", ["tortilla"]);
    await recipe(page, "Pancakes", "breakfast", ["flour"]);
    await recipe(page, "Garlic rice", "side", ["rice"]);
    await recipe(page, "Pickled onions", "prep", ["onion"]);
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    await expect(page.locator(".riso-recipes-heading-row").getByLabel("Sort recipes")).toHaveCount(0);
    await expect(page.locator(".riso-recipes-filter-chips").getByLabel("Sort recipes")).toBeVisible();

    await page.getByRole("button", { name: /^Meals/ }).click();
    await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Lunch wrap", "Chicken curry"]);
  });

  test("Cookbook and Imported are split under their own headings and chips", async ({ page }) => {
    const userId = await signUp(page);
    await recipe(page, "Grandma's lasagna", "dinner", ["pasta"]); // by hand: Cookbook
    await prisma.recipe.create({
      data: { userId, title: "Imported pad thai", inCookbook: false, inImported: true, instructions: "[]", ingredients: { create: [{ name: "noodles" }] } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    await expect(page.locator(".riso-recipes-section > .riso-recipes-head")).toHaveText([/Cookbook\s*1/, /Imported\s*1/]);
    await expect(page.locator(".riso-recipes-section").first()).toContainText("Grandma's lasagna");
    await expect(page.locator(".riso-recipes-section").nth(1)).toContainText("Imported pad thai");

    const group = page.getByRole("group", { name: "Cookbook or imported" });
    await group.getByRole("button", { name: /^Imported/ }).click();
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
    await expect(page.getByRole("group", { name: "Cookbook or imported" }).getByRole("button", { name: /^Cookbook/ })).toContainText("2");
    await expect(page.getByRole("group", { name: "Cookbook or imported" }).getByRole("button", { name: /^Imported/ })).toContainText("0");
  });
});

test.describe("Recipes sections", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("the Cookbook is split by meal type, empty ones are hidden, and every header folds", async ({ page }) => {
    const userId = await signUp(page);
    await recipe(page, "Chicken curry", "dinner", ["chicken"]);
    await recipe(page, "Pasta bake", "dinner", ["pasta"]);
    await recipe(page, "Pancakes", "breakfast", ["flour"]);
    await recipe(page, "Garlic rice", "side", ["rice"]);
    await prisma.recipe.create({
      data: { userId, title: "Imported pad thai", inCookbook: false, inImported: true, instructions: "[]", ingredients: { create: [{ name: "noodles" }] } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    const head = (name) => page.locator(".riso-recipes-head", { hasText: name });
    const cookbook = page.locator(".riso-recipes-section", { has: head("Cookbook") }).first();
    const sub = (name) => cookbook.locator(".riso-recipes-subsection", { has: head(name) });
    await expect(head("Cookbook").first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".riso-recipes-section > .riso-recipes-head")).toHaveText([/Cookbook\s*4/, /Imported\s*1/]);
    // Breakfast, Dinner and Sides have recipes; Lunch and the others are hidden.
    await expect(cookbook.locator(".riso-recipes-subsection > .riso-recipes-head")).toHaveText([/Breakfast\s*1/, /Dinner\s*2/, /Sides\s*1/]);
    await expect(sub("Dinner").locator(".riso-recipe-card")).toHaveCount(2);

    // The header folds its section, and the count stays.
    await head("Dinner").click();
    await expect(head("Dinner")).toHaveAttribute("aria-expanded", "false");
    await expect(sub("Dinner").locator(".riso-recipe-card")).toHaveCount(0);
    await expect(head("Dinner")).toContainText("2");
    await head("Dinner").click();
    await expect(sub("Dinner").locator(".riso-recipe-card")).toHaveCount(2);
    await head("Imported").click();
    await expect(page.locator(".riso-recipes-section", { hasText: "Imported pad thai" })).toHaveCount(0);
    await head("Imported").click();
    await expect(page.locator(".riso-recipes-section", { hasText: "Imported pad thai" })).toHaveCount(1);

    // The toggles and filters narrow what's inside the sections, and the counts follow.
    const chips = page.locator(".riso-recipes-filter-chips").last();
    await chips.getByRole("button", { name: /^Dinner/ }).click();
    await expect(page.locator(".riso-recipes-section > .riso-recipes-head")).toHaveText([/Cookbook\s*2/]);
    await expect(cookbook.locator(".riso-recipes-subsection > .riso-recipes-head")).toHaveText([/Dinner\s*2/]);
    await chips.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("group", { name: "Cookbook or imported" }).getByRole("button", { name: /^Imported/ }).click();
    await expect(page.locator(".riso-recipes-section > .riso-recipes-head")).toHaveText([/Imported\s*1/]);
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
