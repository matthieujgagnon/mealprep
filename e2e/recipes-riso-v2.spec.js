import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { langSwitch } from "./account-menu.js";

const prisma = new PrismaClient();

// Riso v2 Recipes: the search bar with "+ New recipe" in it, the bulleted
// "how it works" strip, the chip order, every filter and menu alone and
// together, on a desktop and on a phone, and Home's "See them".

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-v2+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

const recipe = (page, title, mealSlot, ingredients, extra = {}) =>
  page.request.post("/api/recipes", { data: { title, mealSlot, ingredients: ingredients.map((name) => ({ name })), ...extra } });

async function seedRecipes(page) {
  await recipe(page, "Chicken bowls", "dinner", ["chicken thighs", "rice"], { prepTimeMinutes: 10, cookTimeMinutes: 25 }); // 35 min
  await recipe(page, "Slow chicken soup", "dinner", ["chicken thighs", "carrot"], { prepTimeMinutes: 20, cookTimeMinutes: 200 }); // 3 h 40
  await recipe(page, "Chicken wrap", "lunch", ["chicken thighs", "tortilla"], { prepTimeMinutes: 10, cookTimeMinutes: 10 }); // 20 min
  await recipe(page, "Salmon bake", "dinner", ["salmon fillet", "lemon"], { prepTimeMinutes: 10, cookTimeMinutes: 20 });
  await recipe(page, "Oat bowl", "breakfast", ["oats"], { prepTimeMinutes: 5 });
}

const goRecipes = async (page) => {
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".rv2-grid")).toBeVisible();
};
const names = (page) => page.locator(".riso-recipe-card-name");
const menu = (page, label) => page.getByRole("button", { name: new RegExp(`^${label}`) });
async function choose(page, label, option) {
  await menu(page, label).click();
  await page.getByRole("option", { name: option }).click();
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("+ New recipe sits inside the search bar, a link swaps it for Import, and the strip is four bullets", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    const bar = page.locator(".riso-recipes-searchbar");
    await expect(bar.getByRole("button", { name: "+ New recipe" })).toBeVisible();
    await expect(page.locator(".riso-recipes-heading").getByRole("button")).toHaveCount(0);
    await expect(page.locator(".riso-hint-list li")).toHaveCount(4);

    await bar.locator("input").fill("https://example.com/some-recipe");
    await expect(bar.getByRole("button", { name: "Import recipe" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "+ New recipe" })).toHaveCount(0);
    await bar.locator("input").fill("");

    await bar.getByRole("button", { name: "+ New recipe" }).click();
    await expect(page.getByRole("heading", { name: "New recipe." })).toBeVisible();
  });

  test("the chips run All, a rule, Meals and the meal types, a rule, Makeable now and Uses expiring", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    const labels = await page.locator(".rv2-chips .rv2-chip").evaluateAll((els) => els.map((e) => e.firstChild.textContent));
    expect(labels[0]).toBe("All");
    expect(labels[1]).toBe("Meals");
    expect(labels.slice(-2)).toEqual(["Makeable now", "Uses expiring"]);
    expect(labels).toContain("Breakfast");
    expect(labels).toContain("Supper");
    await expect(page.locator(".rv2-chips-rule")).toHaveCount(2);
    // The rules sit where the groups change: after All, and before Makeable now.
    const order = await page.locator(".rv2-chips").evaluate((root) =>
      [...root.querySelectorAll(".rv2-chip, .rv2-chips-rule")].map((e) => (e.classList.contains("rv2-chips-rule") ? "|" : e.firstChild.textContent))
    );
    expect(order[1]).toBe("|");
    expect(order[order.length - 3]).toBe("|");
  });

  test("Protein, Time, a meal chip and a search work alone, together, and clear together", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    await expect(names(page)).toHaveCount(5);

    await choose(page, "PROTEIN", "Chicken");
    await expect(names(page)).toHaveCount(3);
    await choose(page, "TIME", "Under 45 min");
    await expect(names(page)).toHaveCount(2); // the 3 h soup drops out
    await page.getByRole("button", { name: /^Supper/ }).click();
    await expect(names(page)).toHaveText(["Chicken bowls"]);
    await expect(page.locator(".rv2-count")).toHaveText("1 RECIPE MATCHES");
    await page.locator(".riso-recipes-searchbar input").fill("wrap");
    await expect(names(page)).toHaveCount(0);
    await expect(page.locator(".riso-recipes-empty")).toHaveText("No recipes match these filters.");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(names(page)).toHaveCount(5);
    await expect(menu(page, "PROTEIN")).toContainText("Any protein");
    await expect(menu(page, "TIME")).toContainText("Any time");
    await expect(page.locator(".riso-recipes-searchbar input")).toHaveValue("");

    // Sort on its own: quickest first, the one with no time last is not in this set.
    await choose(page, "SORT", "Quickest");
    await expect(names(page).first()).toHaveText("Oat bowl");
  });

  test("nothing is laid over a card's photo (the planned day lives in the recipe pop-out, not here)", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    await expect(page.locator(".riso-recipe-card-photo *:not(img)")).toHaveCount(0);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Repas, Protéine, Temps and Tri work alone and together, and Effacer les filtres resets them", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await expect(names(page)).toHaveCount(5);
    await expect(page.locator(".rv2-chips")).toHaveCount(0);

    await choose(page, "PROTÉINE", "Poulet");
    await expect(names(page)).toHaveCount(3);
    await choose(page, "TEMPS", "Moins de 45 min");
    await expect(names(page)).toHaveCount(2);
    await choose(page, "REPAS", /^Souper/);
    await expect(names(page)).toHaveText(["Chicken bowls"]);
    await expect(menu(page, "REPAS")).toContainText("Souper");

    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(names(page)).toHaveCount(5);
    await expect(menu(page, "REPAS")).toContainText("Toutes");
    await choose(page, "TRI", "Les plus rapides");
    await expect(names(page).first()).toHaveText("Oat bowl");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("Home's See them opens Recipes with that protein set", async ({ page }) => {
    const userId = await signUp(page);
    await recipe(page, "Crispy tofu bowl", "dinner", ["extra-firm tofu", "rice"]);
    await recipe(page, "Miso soup", "lunch", ["silken tofu", "miso"]);
    await recipe(page, "Plain rice", "side", ["rice"]);
    await prisma.flyerDeal.create({
      data: { userId, store: "Metro", source: "Metro", category: "protein", item: "Firm tofu", matchName: "firm tofu", price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 3.49, isCurrent: true, createdAt: new Date() },
    });
    await page.reload();
    const row = page.locator("button.riso-protein-card", { hasText: "Tofu" });
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.locator(".riso-protein-recipes-link").click();
    await expect(page.locator(".tab.active")).toHaveText("Recipes");
    await expect(menu(page, "PROTEIN")).toContainText("Tofu");
    await expect(names(page)).toHaveCount(2);
    await choose(page, "PROTEIN", "Any protein");
    await expect(names(page)).toHaveCount(3);
  });
});
