import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// The Makeable page, Riso v2 (design: docs/design/riso-v2-makeable): the shared
// Finder as a page. Sections by what is missing from Inventory (planned
// recipes only in Meals of the week), a pink shadow on the ones that are a go,
// À acheter on the real grocery list with Undo, sales only from real Flipp
// deals, and the shared pop-out and slot picker.

const prisma = new PrismaClient();
test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function signUp(page, tag) {
  const email = `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  return email;
}

// Recipes: [title, ingredients, extra]; inventory: names. Returns the recipes by title.
async function seed(page, recipes, inventory) {
  const made = {};
  for (const [title, ingredients, extra] of recipes) {
    const res = await page.request.post("/api/recipes", {
      data: { title, instructions: ["Cook it."], ingredients: ingredients.map((name) => ({ name })), ...extra },
    });
    made[title] = await res.json();
  }
  for (const name of inventory) await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
  await page.reload();
  return made;
}

async function openMakeable(page) {
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await expect(page.locator(".mk-title")).toBeVisible();
}

const tile = (page, title) => page.locator(".fnd-tile", { has: page.locator(".riso-recipe-card-name", { hasText: title }) });

test("sections by what is missing; planned recipes only in Meals of the week; a go has a pink shadow", async ({ page }) => {
  await signUp(page, "makeable-sections");
  const made = await seed(
    page,
    [
      ["Riso Pancakes", ["flour", "egg"]],
      ["Riso Soup", ["chicken", "carrot", "celery"]],
      ["Riso Stew", ["lamb", "quince", "barley", "turnip"]],
      ["Riso Planned", ["flour", "egg"], { mealSlot: "dinner" }],
      ["Riso Brownies", ["flour", "egg"], { mealSlot: "dessert" }],
    ],
    ["flour", "egg", "chicken", "carrot"]
  );
  // Planned this week (Sunday is never in the past).
  await page.request.post("/api/planner", { data: { recipeId: made["Riso Planned"].id, weekStart: mondayOf(new Date()), dayOfWeek: 6, mealType: "dinner" } });
  await page.reload();
  await openMakeable(page);

  // Meals only, until pantry and sides are included: the dessert is out of every section.
  await expect(page.locator(".fnd-sec-title")).toHaveText(["Meals of the week", "Ready now", "One or two short", "Needs a shop"]);
  await expect(page.locator(".fnd-sec.ready .riso-recipe-card-name")).toHaveText(["Riso Pancakes"]);
  await expect(page.locator(".fnd-sec.few .riso-recipe-card-name")).toHaveText(["Riso Soup"]);
  await expect(page.locator(".fnd-sec.shop .riso-recipe-card-name")).toHaveText(["Riso Stew"]);
  await expect(page.getByText("Riso Brownies")).toHaveCount(0);

  // In your week starts closed; planned recipes are not repeated in the other sections.
  await expect(page.locator(".fnd-sec.week .fnd-card")).toHaveCount(0);
  await expect(page.locator(".fnd-sec.week .fnd-sec-count")).toHaveText("1");
  await page.locator(".fnd-sec.week .fnd-sec-toggle").click();
  await expect(page.locator(".fnd-sec.week .riso-recipe-card-name")).toHaveText(["Riso Planned"]);
  await expect(page.locator(".fnd-sec.ready").getByText("Riso Planned")).toHaveCount(0);

  // The pink shadow is for a go: nothing to buy and not planned.
  await expect(tile(page, "Riso Pancakes").locator(".fnd-card")).toHaveCSS("box-shadow", /rgb\(255, 72, 176\)/);
  await expect(tile(page, "Riso Planned").locator(".fnd-card")).not.toHaveCSS("box-shadow", /rgb\(255, 72, 176\)/);
  await expect(tile(page, "Riso Soup").locator(".fnd-card")).not.toHaveCSS("box-shadow", /rgb\(255, 72, 176\)/);

  // Include pantry and sides brings the dessert back (the same setting as every page).
  await page.getByRole("button", { name: "Include pantry and sides" }).click();
  await expect(page.locator(".fnd-sec.ready .riso-recipe-card-name")).toHaveCount(2);
  await expect(page.locator(".fnd-sec.ready").getByText("Riso Brownies")).toBeVisible();
});

test("À acheter adds and removes items on the real grocery list, with Undo, and Grocery agrees", async ({ page }) => {
  await signUp(page, "makeable-grocery");
  await seed(page, [["Riso Grocery Dish", ["salmon", "broccoli", "leeks"]]], ["salmon"]);
  await openMakeable(page);

  const dish = tile(page, "Riso Grocery Dish");
  await expect(dish.getByText(/Missing/)).toHaveCount(0); // what is missing is in À acheter and the pop-out, not on the tile
  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  await expect(page.locator(".fnd-buypop")).toBeVisible();

  // One item, then Undo takes it off again.
  const pop = page.locator(".fnd-buypop");
  await pop.getByRole("button", { name: "Add Broccoli to grocery list" }).click();
  await expect(pop.getByRole("button", { name: "Take Broccoli off your grocery list" })).toHaveText("✓ Added");
  const toast = page.getByRole("status").filter({ hasText: "1 item added to the grocery list." });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(pop.getByRole("button", { name: "Add Broccoli to grocery list" })).toHaveText("+ Add");

  // Add all adds what is not there yet, once.
  await pop.getByRole("button", { name: "Add Broccoli to grocery list" }).click();
  await pop.getByRole("button", { name: "Add all · 1" }).click();
  await expect(pop.getByRole("button", { name: "Add all · 1" })).toHaveCount(0);

  // The strip under the tile reads the real list; its × takes an item off.
  await page.locator(".fnd-scrim").click({ position: { x: 5, y: 5 } });
  await expect(dish.locator(".fnd-liststrip")).toContainText("ON YOUR LIST · 2");
  await expect(dish.getByRole("button", { name: "To buy", exact: true })).toHaveClass(/done/);

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("Broccoli", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Leek", { exact: false })).toHaveCount(1);

  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForLoadState("networkidle"); // the grocery list is re-read on a tab change; let it settle first
  await dish.locator(".fnd-liststrip").getByRole("button", { name: "Take Leeks off your grocery list" }).click();
  await expect(dish.locator(".fnd-liststrip")).toContainText("ON YOUR LIST · 1");
  await expect(page.getByRole("status").filter({ hasText: "taken off your grocery list" })).toBeVisible();
});

test("Show sales is off to begin with, and the tags come only from real flyer deals", async ({ page }) => {
  const email = await signUp(page, "makeable-sales");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seed(page, [["Riso Mango Chicken", ["mangoes", "quokka beans", "chicken"]]], ["chicken"]);
  const base = { userId: user.id, source: "Flipp", category: "produce", unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Maxi", item: "Mangoes", matchName: "mangoes", price: "$1.50", unitPrice: 1.5, regularPrice: 2.49 },
      // In the flyer at its regular price: not a sale.
      { ...base, store: "IGA", item: "Quokka beans", matchName: "quokka beans", price: "$2.99", unitPrice: 2.99 },
    ],
  });
  await page.reload();
  await openMakeable(page);

  const dish = tile(page, "Riso Mango Chicken");
  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  await expect(page.locator(".fnd-buyrow")).toHaveCount(2);
  await expect(page.locator(".fnd-buyrow-sale")).toHaveCount(0);
  await page.locator(".fnd-scrim").click({ position: { x: 5, y: 5 } });

  const sales = page.getByRole("button", { name: "Show sales", exact: true });
  await expect(sales).toHaveAttribute("aria-pressed", "false");
  await sales.click();
  await expect(dish.getByRole("button", { name: "To buy", exact: true })).toHaveClass(/sale/);
  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  await expect(page.locator(".fnd-buyrow", { hasText: "Mangoes" }).locator(".fnd-buyrow-sale")).toContainText("Maxi");
  await expect(page.locator(".fnd-buyrow", { hasText: "Quokka beans" }).locator(".fnd-buyrow-sale")).toHaveCount(0);
  await page.locator(".fnd-scrim").click({ position: { x: 5, y: 5 } });

  // The pop-out opened from Makeable shows the same pill, and the choice is remembered.
  await dish.locator(".fnd-card-open").click();
  await expect(page.getByRole("dialog", { name: "Riso Mango Chicken" }).locator(".fnd-pop-buy", { hasText: "Mangoes" })).toContainText("Maxi");
  await page.keyboard.press("Escape");
  await page.reload();
  await openMakeable(page);
  await expect(page.getByRole("button", { name: "Show sales", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the pop-out has no Cook; Plan opens the slot picker; Open the full recipe opens its card", async ({ page }) => {
  await signUp(page, "makeable-popout");
  const made = await seed(page, [["Riso Plan Dish", ["salmon"]]], ["salmon"]);
  await openMakeable(page);

  await tile(page, "Riso Plan Dish").locator(".fnd-card-open").click();
  const pop = page.getByRole("dialog", { name: "Riso Plan Dish" });
  await expect(pop.locator(".fnd-pop-actions button")).toHaveText(["Plan", "Similar recipes", "Open the full recipe →"]);

  await pop.getByRole("button", { name: "Plan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await picker.getByRole("button", { name: "Next week" }).click();
  await picker.getByRole("button", { name: /^Add to .*Supper$/ }).click();
  const nextWeek = mondayOf(new Date(Date.now() + 7 * 86400000));
  await expect
    .poll(async () => (await (await page.request.get(`/api/planner?week=${nextWeek}`)).json()).map((e) => e.recipe?.id))
    .toEqual([made["Riso Plan Dish"].id]);

  await tile(page, "Riso Plan Dish").locator(".fnd-card-open").click();
  await page.getByRole("dialog", { name: "Riso Plan Dish" }).getByRole("button", { name: /Open the full recipe/ }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.locator(".riso-rc-actions")).toBeVisible();
});

test("Similar recipes sets the base on this page, with a yellow banner that has an X", async ({ page }) => {
  await signUp(page, "makeable-similar");
  await seed(
    page,
    [
      ["Riso Lemon Chicken", ["chicken", "lemon", "garlic"]],
      ["Riso Lemon Fish", ["cod", "lemon"]],
      ["Riso Porridge", ["oats", "milk"]],
    ],
    ["chicken", "lemon", "garlic", "cod", "oats", "milk"]
  );
  await openMakeable(page);

  // From a tile: the base is out of the results, a recipe sharing lemon stays.
  await tile(page, "Riso Lemon Chicken").getByRole("button", { name: "Similar recipes" }).click();
  const banner = page.locator(".fnd-main");
  await expect(banner).toContainText("Riso Lemon Chicken");
  await expect(page.locator(".tab.active")).toHaveText("Makeable");
  await expect(page.locator(".fnd-results-title")).toHaveText("Recipes similar to Riso Lemon Chicken");
  await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Riso Lemon Fish"]);
  await expect(page.getByText("shares lemon")).toBeVisible();
  await expect(banner.getByRole("button", { name: "Cancel" })).toHaveCount(0);

  // The X closes it and the page is whole again.
  await banner.getByRole("button", { name: "Close the Main meal" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".riso-recipe-card-name")).toHaveCount(3);

  // From the pop-out it stays on Makeable too.
  await tile(page, "Riso Porridge").locator(".fnd-card-open").click();
  await page.getByRole("dialog", { name: "Riso Porridge" }).getByRole("button", { name: "Similar recipes" }).click();
  await expect(page.locator(".fnd-main")).toContainText("Riso Porridge");
  await expect(page.locator(".tab.active")).toHaveText("Makeable");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("two tiles across, the short button names, and the menus", async ({ page }) => {
    await signUp(page, "makeable-phone");
    await seed(page, [["Riso Phone One", ["salmon", "leeks"]], ["Riso Phone Two", ["salmon", "kale"]]], ["salmon"]);
    await openMakeable(page);

    const columns = await page.locator(".fnd-sec.few .fnd-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(2);
    await expect(page.getByPlaceholder("Search a recipe")).toBeVisible();
    await expect(page.locator(".fnd-seg-btn")).toHaveText([/^All/, /^Makeable/, /^1 or 2/]);
    await expect(tile(page, "Riso Phone One").getByRole("button", { name: "Similar", exact: true })).toBeVisible();
    // No sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
