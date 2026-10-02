import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A real (uploaded-flyer) deal for the signed-in user - sample deals never
// count as "on sale" outside the Flyers page.
async function seedRealDeal(page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  await prisma.flyerDeal.create({
    data: {
      userId, store: "Metro", source: "Metro", category: "meat",
      item: "Boneless chicken breast", matchName: "boneless chicken breast", price: "$4.99/lb",
      unitPrice: 4.99, unitBasis: "lb", regularPrice: 7.99, isCurrent: true, createdAt: new Date(),
    },
  });
  await page.reload();
}

// Covers pieces specific to the Home redesign: the "N of your recipes use
// X" sale-deal link, and the Riso Poster "Makeable now" row (its own plain
// row design, not the shared dark .meal-card — see makeable-vapor.spec.js's
// header comment for the same precedent on the Makeable tab). Home's old
// light/dark toggle was removed when Home moved to the Riso Poster design:
// design_handoff_riso/README.md's fidelity note says light ("paper") is the
// only mode designed so far ("black paper" dark mode is future work), so
// there's currently nothing for a toggle to switch to.

function uniqueEmail() {
  return `home-redesign+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

test("a makeable recipe shows as a Riso-styled row with its title legible on paper", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Test Dish");
  await page.fill('input[aria-label="FRIDGE LIFE"]', "2");
  await page.fill('input[aria-label="Ingredient"]', "test ingredient");
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Combine and serve.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();

  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', "test ingredient");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator(".modal-close").click();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const row = page.locator(".riso-makeable-row", { hasText: "Home Redesign Test Dish" });
  await expect(row).toBeVisible();

  const titleColor = await row.locator(".riso-makeable-row-title").evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).toBe("rgb(22, 24, 31)"); // --riso-ink, legible on the paper-colored row
});

test("the sale-deal footer link filters Recipes to a matching ingredient", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await seedRealDeal(page);

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Chicken Dish");
  await page.fill('input[aria-label="FRIDGE LIFE"]', "2");
  await page.fill('input[aria-label="Ingredient"]', "chicken breast");
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Grill until done.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.waitForTimeout(400);

  // The seeded deal is "Boneless chicken breast" - matches
  // findMatchingDeal's word-overlap heuristic against "chicken breast".
  const footerLink = page.getByRole("button", { name: "See them →" });
  await expect(footerLink).toBeVisible();
  await expect(page.getByText(/of your recipes use chicken breast/)).toBeVisible();

  await footerLink.click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.getByText("Home Redesign Chicken Dish")).toBeVisible();
});

test("Home shows the proteins on sale this week, each kind's best buy, and opens its card", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  const row = (item, matchName, unitPrice, extra = {}) => ({
    userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
    unitPrice, unitBasis: "lb", isCurrent: true, createdAt: new Date(), ...extra,
  });
  await prisma.flyerDeal.createMany({
    data: [
      row("POITRINES DE POULET FRAIS DÉSOSSÉES", "fresh boneless chicken breasts", 4.87, { store: "Super C", regularPrice: 8.49 }),
      row("FRESH CHICKEN LEGS", "fresh chicken legs", 1.97, { regularPrice: 2.49 }),
      // A pie and a points offer aren't chicken on sale.
      row("PÂTÉ AU POULET IRRÉSISTIBLE, 1,2 kg", "chicken pie", 1.13, { regularPrice: 4.99 }),
      { ...row("Poulet entier", "whole chicken", 1), unitPrice: null, unitBasis: null, price: "Points offer" },
      row("BŒUF HACHÉ MAIGRE", "lean ground beef", 5.97),
      row("filet de saumon Atlantique frais | fresh Atlantic salmon fillet", "fresh atlantic salmon fillet", 9.99, { regularPrice: 13.99 }),
    ],
  });
  await page.reload();

  const block = page.locator(".riso-home-proteins");
  await expect(block.getByRole("heading", { name: "Proteins on sale" })).toBeVisible();
  const chicken = block.locator(".riso-protein-row", { hasText: "Chicken" });
  await expect(chicken).toContainText("Chicken breasts");
  await expect(chicken).toContainText("Super C");
  await expect(chicken).toContainText("$4.87/lb");
  await expect(chicken).toContainText("Stock up");
  await expect(chicken).toContainText("+1 more");
  await expect(block).not.toContainText("pie");
  await expect(block.locator(".riso-protein-row", { hasText: "Beef" })).toContainText("Nothing really on sale");
  await expect(block.locator(".riso-protein-row", { hasText: "Fish" })).toContainText("$9.99/lb");

  await chicken.click();
  const modal = page.locator(".riso-deal-detail, [role=dialog]").first();
  await expect(modal).toContainText(/poitrines de poulet/i);
  await expect(modal.locator(".riso-deal-detail-other", { hasText: "Metro" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});
