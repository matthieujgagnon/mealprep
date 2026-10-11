import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { PrismaClient } from "@prisma/client";
import { langSwitch } from "./account-menu.js";

const prisma = new PrismaClient();

// Riso v2 Recipes: the search bar with "+ New recipe" in it, the bulleted
// "how it works" strip, the row of chips (All, Quick, Meal ▾, Protein ▾; design:
// docs/design/riso-v2-recipe-cards), every filter and menu alone and together,
// the photo cards, on a desktop and on a phone, and Home's "See them".

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-v2+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
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
const names = (page) => page.locator(".rpc-title");
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

  test("the chips are All, Quick, Meal and Protein; Makeable now and Uses expiring are gone", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    const chips = page.locator(".rv2-chips");
    await expect(chips.locator(".rv2-chip")).toHaveText(["All", "Quick"]);
    await expect(chips.locator(".rv2-drop")).toHaveText([/^MEAL/, /^PROTEIN/]);
    await expect(chips.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Makeable now|Uses expiring/ })).toHaveCount(0);
    // Time and Sort stay beside the tabs.
    await expect(page.locator(".rv2-toolbar .rv2-drop")).toHaveText([/^TIME/, /^SORT/]);

    // Quick is half an hour or less (the finder's rule), All puts everything back.
    await chips.getByRole("button", { name: "Quick", exact: true }).click();
    await expect(names(page)).toHaveCount(3); // wrap 20, salmon 30, oats 5
    await expect(chips.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "false");
    await chips.getByRole("button", { name: "All", exact: true }).click();
    await expect(names(page)).toHaveCount(5);
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
    await choose(page, "MEAL", /^Supper/);
    await expect(names(page)).toHaveText(["Chicken bowls"]);
    await expect(page.locator(".rv2-count")).toHaveText("1 RECIPE MATCHES");
    await page.locator(".riso-recipes-searchbar input").fill("wrap");
    await expect(names(page)).toHaveCount(0);
    await expect(page.locator(".riso-recipes-empty")).toHaveText("No recipes match these filters.");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(names(page)).toHaveCount(5);
    await expect(menu(page, "PROTEIN")).toContainText("Any protein");
    await expect(menu(page, "TIME")).toContainText("Any time");
    await expect(menu(page, "MEAL")).not.toHaveClass(/set/);
    await expect(page.locator(".riso-recipes-searchbar input")).toHaveValue("");

    // Sort on its own: quickest first, the one with no time last is not in this set.
    await choose(page, "SORT", "Quickest");
    await expect(names(page).first()).toHaveText("Oat bowl");
  });

  test("a card is a 3:4 photo: meal, protein and time on top, the title at the bottom, a meal-colour line; all the same size", async ({ page }) => {
    await signUp(page);
    await seedRecipes(page);
    await goRecipes(page);
    const bowls = page.locator(".rpc", { hasText: "Chicken bowls" });
    await expect(bowls.locator(".rpc-cap-meal")).toHaveText("Supper");
    await expect(bowls.locator(".rpc-cap-protein")).toHaveText("Chicken");
    await expect(bowls.locator(".rpc-cap-time")).toHaveText("35 MIN");
    await expect(bowls.locator(".rpc-line")).toHaveCSS("background-color", "rgb(35, 35, 255)"); // supper is blue
    await expect(page.locator(".rpc", { hasText: "Chicken wrap" }).locator(".rpc-line")).toHaveCSS("background-color", "rgb(255, 72, 176)"); // lunch is pink
    await expect(page.locator(".rpc", { hasText: "Oat bowl" }).locator(".rpc-cap-protein")).toHaveCount(0); // no protein, no line
    // The old card's pills, servings and "to buy" line are not here.
    await expect(page.locator(".rpc .riso-pill, .rpc .rpc-buy")).toHaveCount(0);
    // All the cards have the same size, 3:4.
    const boxes = await page.locator(".rpc").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
    expect(new Set(boxes.map((b) => b.join("x"))).size).toBe(1);
    expect(Math.abs(boxes[0][1] / boxes[0][0] - 4 / 3)).toBeLessThan(0.02);
    // Tapping a card opens the recipe's pop-out.
    await bowls.click();
    await expect(page.getByRole("dialog", { name: "Chicken bowls" })).toBeVisible();
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
    // The same chips as on a computer: Tout, Rapide, Repas, Protéine; two cards across.
    await expect(page.locator(".rv2-chips .rv2-chip")).toHaveText(["Tout", "Rapide"]);
    await expect(page.locator(".rv2-chips .rv2-drop")).toHaveText([/^REPAS/, /^PROTÉINE/]);
    expect(await page.locator(".rv2-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);

    await choose(page, "PROTÉINE", "Poulet");
    await expect(names(page)).toHaveCount(3);
    await choose(page, "TEMPS", "Moins de 45 min");
    await expect(names(page)).toHaveCount(2);
    await choose(page, "REPAS", /^Souper/);
    await expect(names(page)).toHaveText(["Chicken bowls"]);
    await expect(menu(page, "REPAS")).toContainText("Souper");

    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(names(page)).toHaveCount(5);
    await expect(menu(page, "REPAS")).not.toHaveClass(/set/);
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
