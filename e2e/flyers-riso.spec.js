import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Regression coverage for the Flyers screen's Riso Poster "11a Weekly
// briefing" redesign (design_handoff_riso/README.md). Real (non-mock) deals
// only ever come from the upload/Le Rabais routes, both of which depend on
// services unreachable from this sandbox (Gemini, lerabais.com) - so, like
// password-reset.spec.js's reset-token seeding, deals with real price
// history are seeded directly via Prisma, standing in for "a few weeks of
// real uploads" rather than exercising the upload route itself.

const prisma = new PrismaClient();

function uniqueEmail() {
  return `flyers-riso+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipe(page, title, ingredientName) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[placeholder="e.g. 4"]', "4");
  await page.fill('input[placeholder="Name (e.g. butter)"]', ingredientName);
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Cook it.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(300);
}

const weeksAgo = (n) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);

// Three weeks of "chicken breast" @ Metro (decreasing - today is a 6-month
// low) plus one brand-new item with zero history, for one user.
async function seedChickenHistory(userId) {
  await prisma.flyerDeal.createMany({
    data: [
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$6.99/lb",
        unitPrice: 6.99, unitBasis: "lb", isCurrent: false, createdAt: weeksAgo(8),
      },
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$5.49/lb",
        unitPrice: 5.49, unitBasis: "lb", isCurrent: false, createdAt: weeksAgo(4),
      },
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$4.49/lb",
        unitPrice: 4.49, unitBasis: "lb", isCurrent: true, createdAt: new Date(),
      },
      {
        userId, store: "IGA", source: "IGA", category: "produce",
        item: "Bell peppers", matchName: "bell peppers", price: "$1.49/lb",
        unitPrice: 1.49, unitBasis: "lb", isCurrent: true, createdAt: new Date(),
      },
    ],
  });
}

test("Flyers shows sample data with the Riso layout before any real flyer exists", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await expect(page.locator(".riso-flyers")).toBeVisible();
  await expect(page.getByText("deals, sorted.")).toBeVisible();
  await expect(page.getByText("Showing sample data")).toBeVisible();
  // The real-deals sections (best deals/stock up/ends soon/table) only
  // render once there's real (non-mock) data.
  await expect(page.locator(".riso-block")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload flyer" })).toBeVisible();
});

test("real deals show a price meter, a freeze tip, and a best-deals block", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);

  await expect(page.locator(".riso-block.accent")).toContainText("The lowest prices in 6 months");
  await expect(page.locator(".riso-block.accent")).toContainText("Chicken breast");

  const row = page.locator(".riso-table-row", { hasText: "Chicken breast" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("6-MO LOW");
  await expect(row.locator(".riso-table-freeze")).toContainText("Freezes");

  const newRow = page.locator(".riso-table-row", { hasText: "Bell peppers" });
  await expect(newRow).toContainText("NEW");
});

test("the ★ watchlist toggle persists and the Watchlist filter narrows the table", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);

  const chickenRow = page.locator(".riso-table-row", { hasText: "Chicken breast" });
  await chickenRow.locator(".riso-star-btn").click();
  await expect(chickenRow.locator(".riso-star-btn.active")).toBeVisible();
  await expect(chickenRow.locator(".riso-watch-badge")).toHaveText("★ WATCHING");

  await page.reload();
  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.locator(".riso-table-row", { hasText: "Chicken breast" }).locator(".riso-star-btn.active")).toBeVisible();

  await page.getByRole("button", { name: "★ Watchlist" }).click();
  const rows = page.locator(".riso-table-row:not(.riso-table-header)");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Chicken breast");
});

test("+ List adds a deal's ingredient to this week's grocery list", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);

  await page
    .locator(".riso-table-row", { hasText: "Chicken breast" })
    .locator(".riso-btn.primary.small", { hasText: "+ List" })
    .click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Grocery List", exact: true }).click();
  await expect(page.getByText("chicken breast")).toBeVisible();
});

test("a matching recipe appears in What to cook with a save sticker", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);
  await addRecipe(page, "Riso Cook Test Dish", "chicken breast");

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);

  const card = page.locator(".riso-cook-card", { hasText: "Riso Cook Test Dish" });
  await expect(card).toBeVisible();
  await expect(card.locator(".riso-sticker")).toContainText("save $2.50");
});
