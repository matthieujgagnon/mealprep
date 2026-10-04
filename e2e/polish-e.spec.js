import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { langSwitch } from "./account-menu.js";

const prisma = new PrismaClient();

// Home's Proteins on sale by general protein (the count and "See them" cover
// every kind of it), and the recipes line under each grocery item.

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Next week's Monday: its meals are always still ahead, whatever day the test runs.
function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return dateKey(x);
}

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `polish-e+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

const recipe = async (page, title, ingredients, extra = {}) =>
  await (
    await page.request.post("/api/recipes", {
      data: { title, mealSlot: "dinner", baseServings: 2, ingredients: ingredients.map((name) => ({ name })), ...extra },
    })
  ).json();

test.describe("Proteins on sale, by general protein", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  async function seed(page) {
    const userId = await signUp(page);
    const row = (item, matchName, unitPrice, extra = {}) => ({
      userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
      unitPrice, unitBasis: "lb", isCurrent: true, createdAt: new Date(), ...extra,
    });
    await prisma.flyerDeal.createMany({
      data: [
        // Three kinds of chicken, three fish, two cuts of beef: one card each.
        row("Boneless chicken breasts", "boneless chicken breasts", 4.99, { regularPrice: 8.99 }),
        row("Chicken thighs", "chicken thighs", 2.49, { regularPrice: 4.99, store: "Super C" }),
        row("Chicken drumsticks", "chicken drumsticks", 1.99, { regularPrice: 3.49 }),
        row("Atlantic salmon", "atlantic salmon", 9.99, { regularPrice: 14.99 }),
        row("Cod fillets", "cod fillets", 8.99, { regularPrice: 12.99 }),
        row("Tilapia fillets", "tilapia fillets", 6.99, { regularPrice: 9.99 }),
        row("Lean ground beef", "lean ground beef", 5.97, { regularPrice: 7.99 }),
        row("Striploin steak", "striploin steak", 11.99, { regularPrice: 15.99 }),
      ],
    });
    // Recipes using different kinds of chicken, fish and beef - and none that don't.
    await recipe(page, "Curry", ["chicken thighs", "rice"]);
    await recipe(page, "BBQ legs", ["chicken drumsticks"]);
    await recipe(page, "Roast", ["whole chicken"]);
    await recipe(page, "Lemon chicken", ["boneless chicken breasts"]);
    await recipe(page, "Fish and chips", ["cod fillets", "potatoes"]);
    await recipe(page, "Salmon bowl", ["salmon"]);
    await recipe(page, "Chili", ["lean ground beef", "beans"]);
    await recipe(page, "Plain rice", ["rice"]);
    await page.reload();
  }

  test("one card per general protein, with its best deal, and the specific item under the name", async ({ page }) => {
    await seed(page);
    const block = page.locator(".riso-home-proteins");
    await expect(block.locator(".riso-protein-row")).toHaveCount(8);
    const names = await block.locator(".riso-protein-name").allInnerTexts();
    expect(names.sort()).toEqual(["Beef", "Chicken", "Fish", "Lamb & veal", "Pork", "Seafood", "Tofu", "Turkey"].sort());

    // Chicken: the general name as the title, its best buy (the thighs, the
    // biggest saving) under it, and the other two kinds as "+2 more".
    const chicken = block.getByRole("button", { name: /^Chicken:/ });
    await expect(chicken.locator(".riso-protein-name")).toHaveText("Chicken");
    await expect(chicken.locator(".riso-protein-meta")).toContainText("Chicken thighs");
    await expect(chicken.locator(".riso-protein-meta")).toContainText("Super C");
    await expect(chicken.locator(".riso-protein-meta")).toContainText("+2 more");
    await expect(block.getByRole("button", { name: /^Fish:/ }).locator(".riso-protein-name")).toHaveText("Fish");
    await expect(block.getByRole("button", { name: /^Fish:/ }).locator(".riso-protein-meta")).toContainText("Atlantic salmon");
    await expect(block.getByRole("button", { name: "Pork: no deal this week" })).toContainText("No deal this week");
  });

  test("the bar counts every recipe that uses any kind of it, and See them opens those same recipes", async ({ page }) => {
    await seed(page);
    const block = page.locator(".riso-home-proteins");
    const bar = page.locator(".riso-protein-bar");

    for (const [kind, count, word, titles] of [
      ["Chicken", 4, "chicken", ["BBQ legs", "Curry", "Lemon chicken", "Roast"]],
      ["Fish", 2, "fish", ["Fish and chips", "Salmon bowl"]],
      ["Beef", 1, "beef", ["Chili"]],
    ]) {
      await block.getByRole("button", { name: new RegExp(`^${kind}:`) }).click();
      await expect(bar).toContainText(count === 1 ? `1 of your recipes uses ${word}.` : `${count} of your recipes use ${word}.`);
      await bar.click();
      await expect(page.locator(".tab.active")).toHaveText("Recipes");
      // The same recipes, no more and no fewer.
      expect(await page.locator(".riso-recipe-card-name").allInnerTexts()).toEqual(expect.arrayContaining(titles));
      await expect(page.locator(".riso-recipe-card-name")).toHaveCount(titles.length);
      await page.getByRole("button", { name: "Home", exact: true }).click();
    }
  });

  test("names, the bar and the count are in French too", async ({ page }) => {
    await seed(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    const block = page.locator(".riso-home-proteins");
    const names = await block.locator(".riso-protein-name").allInnerTexts();
    expect(names.sort()).toEqual(["Agneau et veau", "Bœuf", "Dinde", "Fruits de mer", "Poisson", "Porc", "Poulet", "Tofu"].sort());
    await block.getByRole("button", { name: /^Poulet :/ }).click();
    await expect(page.locator(".riso-protein-bar")).toContainText("4 de vos recettes utilisent du poulet.");
    await expect(page.locator(".riso-protein-bar")).toContainText("Les voir →");
  });
});

test.describe("The recipes an item is for, in Grocery", () => {
  async function seed(page) {
    await signUp(page);
    const week = nextMonday();
    const meals = [
      ["Tacos", ["onion", "tomato"]],
      ["Chili with a really long name that goes on and on", ["onion", "carrot"]],
      ["Soup", ["onion"]],
    ];
    for (const [i, [title, ingredients]] of meals.entries()) {
      const r = await recipe(page, title, ingredients);
      await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: week, dayOfWeek: i, mealType: "dinner" } });
    }
    await page.request.post("/api/grocery-extra-items", { data: { name: "paper towels", quantity: 1 } });
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
    await expect(page.locator(".riso-row").first()).toBeVisible();
  }
  // A row by its item's name, in either language.
  const rowFor = (page, name) => page.locator(".riso-row").filter({ has: page.locator(".riso-row-name", { hasText: new RegExp(`^${name}$`, "i") }) });

  test.describe("on a computer", () => {
    test.use({ viewport: { width: 1280, height: 1000 } });

    test("shows the recipes under each item, '+1' past two, and nothing for an item you added", async ({ page }) => {
      await seed(page);
      // Three recipes use onion: the first two and "+1".
      const onion = rowFor(page, "Onion").locator(".riso-row-recipes");
      await expect(onion.locator(".riso-row-recipes-names")).toHaveText("Tacos, Chili with a really long name that goes on and on");
      await expect(onion.locator(".riso-row-recipes-more")).toHaveText("+1");
      // One recipe: just its name; no "+".
      await expect(rowFor(page, "Tomato").locator(".riso-row-recipes")).toHaveText("Tacos");
      await expect(rowFor(page, "Carrot").locator(".riso-row-recipes-more")).toHaveCount(0);
      // A hand-added item shows nothing.
      await expect(rowFor(page, "Paper towels").locator(".riso-row-recipes")).toHaveText("");
      // The tooltip lists them all.
      await expect(onion).toHaveAttribute("title", /Tacos, Chili with a really long name that goes on and on, Soup/);
    });

    test("every row, tag and amount is the same size, with or without recipes", async ({ page }) => {
      await seed(page);
      const sizes = await page.locator(".riso-row").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const slot = e.querySelector(".riso-row-slot").getBoundingClientRect();
          return `${Math.round(r.height)}x${Math.round(slot.width)}x${Math.round(slot.height)}`;
        })
      );
      expect(sizes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(sizes).size, sizes.join(" ")).toBe(1);
      // The long name ends in an ellipsis and the "+1" is still fully there.
      const names = rowFor(page, "Onion").locator(".riso-row-recipes-names");
      expect(await names.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false); // fits at 1280...
    });

    test("the recipes line is in the aisle and recipe views too", async ({ page }) => {
      await seed(page);
      await page.getByRole("button", { name: "By aisle" }).click();
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toHaveText("+1");
      await page.getByRole("button", { name: "By recipe" }).click();
      await expect(rowFor(page, "Tomato").first().locator(".riso-row-recipes")).toHaveText("Tacos");
    });
  });

  test.describe("on a phone, in French", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("rows keep one size, and Store mode rows too, the long list cut off with an ellipsis", async ({ page }) => {
      await seed(page);
      await langSwitch(page).getByRole("button", { name: "Français" }).click();
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toHaveText("+1");
      const heights = await page.locator(".riso-row").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(new Set(heights).size, heights.join(" ")).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      // The long recipe name is cut off, the "+1" is not.
      const names = rowFor(page, "Onion").locator(".riso-row-recipes-names");
      expect(await names.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toBeVisible();

      await page.getByRole("button", { name: /Je suis au magasin/ }).click();
      const mode = page.getByRole("dialog", { name: "Mode magasin" });
      await expect(mode).toBeVisible();
      const rows = mode.locator(".store-mode-row");
      await expect(rows.first()).toBeVisible();
      const rowHeights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(rowHeights.length).toBeGreaterThanOrEqual(4);
      expect(new Set(rowHeights).size, rowHeights.join(" ")).toBe(1);
      const onionRow = mode.locator(".store-mode-row", { has: page.locator(".store-mode-name", { hasText: /^Onion$/ }) });
      const cut = onionRow.locator(".store-mode-recipes-names");
      expect(await cut.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // "…"
      expect(await cut.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
      await expect(onionRow.locator(".store-mode-recipes-more")).toHaveText("+1");
      // An item you added shows no recipes line, and is still the same height.
      await expect(mode.locator(".store-mode-row", { hasText: "Paper towels" }).locator(".store-mode-recipes")).toHaveCount(1);
      await expect(mode.locator(".store-mode-row", { hasText: "Paper towels" }).locator(".store-mode-recipes")).toBeHidden();
    });
  });
});
