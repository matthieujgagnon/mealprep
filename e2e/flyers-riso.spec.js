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
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[aria-label="FRIDGE LIFE"]', "4");
  await page.fill('input[aria-label="Ingredient"]', ingredientName);
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Cook it.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
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
  // Sample deals fill the layout (so the page shows how it works) under a
  // clear "sample" note...
  await expect(page.locator(".riso-flyers-sample-note")).toContainText("example deals");
  await expect(page.locator(".riso-block").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload flyer" })).toBeVisible();

  // ...but never count as real prices anywhere else.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("No deals yet")).toBeVisible();
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

test("watching from the detail view persists and the Watchlist filter narrows the table", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);

  const chickenRow = page.locator(".riso-table-row", { hasText: "Chicken breast" });
  await chickenRow.click();
  const detail = page.getByRole("dialog", { name: "Chicken breast" });
  await detail.getByRole("button", { name: "☆ Watch this" }).click();
  await expect(detail.getByRole("button", { name: "★ Watching" })).toBeVisible();
  await detail.getByRole("button", { name: "Close" }).click();
  await expect(chickenRow.locator(".riso-watch-badge")).toHaveText("★ WATCHING");

  await page.reload();
  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.locator(".riso-table-row", { hasText: "Chicken breast" }).locator(".riso-watch-badge")).toBeVisible();

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

  const row = page.locator(".riso-table-row", { hasText: "Chicken breast" });
  await row.locator(".riso-list-pill").click();
  await expect(row.locator(".riso-list-pill")).toHaveText("✓ Listed");
  // The pill doesn't open the detail view.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("chicken breast")).toBeVisible();
});

test("clicking a deal opens its detail with the 6-month history", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.locator(".riso-block.accent .riso-deal-row", { hasText: "Chicken breast" }).click();

  const detail = page.getByRole("dialog", { name: "Chicken breast" });
  await expect(detail).toContainText("METRO · MEAT & PROTEIN");
  await expect(detail.locator(".riso-deal-detail-price strong")).toHaveText("$4.49/lb");
  await expect(detail.locator(".riso-deal-detail-history-head span")).toHaveText("6-MO LOW");
  await expect(detail.locator(".riso-deal-bar-col")).toHaveCount(6);
  await expect(detail.locator(".riso-deal-bar.now.good")).toHaveCount(1);
  await expect(detail.locator(".riso-deal-stats")).toContainText("LOWEST$4.49");
  await expect(detail.locator(".riso-deal-stats")).toContainText("HIGHEST$6.99");
  await expect(detail).toContainText("❄ Freezes");
  await expect(detail.locator(".riso-deal-detail-low")).toHaveText("6-month low!");

  await detail.getByRole("button", { name: "+ Add to grocery list" }).click();
  await expect(detail.getByRole("button", { name: "✓ On your grocery list" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".riso-table-row", { hasText: "Chicken breast" }).locator(".riso-list-pill")).toHaveText("✓ Listed");
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

test("a deal with no history yet is compared with Quebec's average price", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  // A made-up product so this shared (all-accounts) row can't touch other tests.
  const product = `Quokkafruit ${Date.now()}, per kilogram`;
  await prisma.priceBaseline.create({
    data: { product, item: product.split(",")[0].toLowerCase(), unitBasis: "lb", price: 5.0, month: "2026-08" },
  });
  try {
    await prisma.flyerDeal.create({
      data: {
        userId: user.id, store: "Metro", source: "Flipp", category: "produce",
        item: `${product.split(",")[0]} bunch`, matchName: `${product.split(",")[0].toLowerCase()} bunch`,
        price: "$3.50/lb", unitPrice: 3.5, unitBasis: "lb", isCurrent: true,
      },
    });

    await page.getByRole("button", { name: "Flyers", exact: true }).click();
    const row = page.locator(".riso-table-row", { hasText: "Quokkafruit" });
    await expect(row.locator(".riso-meter-new.vs-avg.good")).toHaveText("30% UNDER QC AVG");
    await expect(page.locator(".riso-block.accent")).toContainText("Quokkafruit");

    await row.click();
    const avg = page.getByRole("dialog").locator(".riso-deal-detail-avg");
    await expect(avg).toHaveClass(/stock-up/);
    await expect(avg).toContainText("QUEBEC AVERAGE · AUG 2026");
    await expect(avg).toContainText("$5.00/lb");
    await expect(avg).toContainText("Stock-up price · 30% less than it usually costs in Quebec");
  } finally {
    await prisma.priceBaseline.delete({ where: { product } });
  }
});

test("deal names read the same way, with the product photo or a food emoji", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const photo =
    "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
  const base = { userId: user.id, store: "Metro", source: "Flipp", price: "$9.99", unitPrice: 9.99, unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, category: "protein", item: "PC BLACK LABEL SALMON FILLETS (400G)", matchName: "salmon fillets", imageUrl: photo },
      { ...base, category: "produce", item: "Seedless Navel Oranges 3 Lb", matchName: "oranges", imageUrl: "http://127.0.0.1:9/missing.jpg" },
    ],
  });

  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  const salmon = page.locator(".riso-table-row", { hasText: "PC black label salmon fillets, 400 g" });
  await expect(salmon.locator("img.riso-deal-photo")).toHaveAttribute("src", photo);
  const oranges = page.locator(".riso-table-row", { hasText: "Seedless navel oranges, 3 lb" });
  await expect(oranges.locator(".riso-deal-photo.placeholder")).toHaveText("🍊");

  // The detail view says why the photo didn't show.
  await oranges.click();
  const why = page.getByRole("dialog").locator(".riso-deal-detail-photo-why");
  await expect(why).toContainText("Photo didn't load: 127.0.0.1");
  await expect(why.getByRole("link", { name: "Open the photo ↗" })).toHaveAttribute("href", "http://127.0.0.1:9/missing.jpg");
});
