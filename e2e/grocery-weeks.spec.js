import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The grocery list's week picker, "→ next week" (with a second look when
// the item's sale ends first, and a way back), and the On sale list.

test.use({ viewport: { width: 1280, height: 1000 } });

const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return key(x);
}
function plusDays(k, n) {
  const [y, m, d] = k.split("-").map(Number);
  return key(new Date(y, m - 1, d + n));
}

test("pick the week, push items to next week (sales ask first), bring them back; On sale lists what to buy first", async ({ page }) => {
  const email = `grocery-weeks+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  const thisWeek = mondayOf(new Date());
  const nextWeek = plusDays(thisWeek, 7);
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: {
        title: "Garlic lemon pasta",
        baseServings: 2,
        ingredients: [
          { name: "garlic", quantity: 4, unit: "clove" },
          { name: "lemon", quantity: 1 },
          { name: "spaghetti", quantity: 500, unit: "g" },
        ],
      },
    })
  ).json();
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: thisWeek, dayOfWeek: 0, mealType: "dinner" } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "produce", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      // Ends today: over before next week.
      { ...base, store: "Maxi", item: "Lemons", matchName: "lemons", price: "$0.50", unitPrice: 0.5, unitBasis: "each", regularPrice: 0.99, validUntil: key(new Date()) },
      // Still on next Wednesday.
      { ...base, store: "Metro", category: "staple", item: "Barilla spaghetti, 900 g", matchName: "spaghetti", price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 3.49, validUntil: plusDays(nextWeek, 2) },
    ],
  });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  const row = (name) => page.getByRole("button", { name: `Check off ${name}`, exact: true });
  await expect(row("Garlic")).toBeVisible();

  // On sale: both, the one ending today first, with its saving.
  const sale = page.locator(".riso-grocery-sale");
  await expect(sale.locator(".riso-grocery-sale-row")).toHaveCount(2);
  // Each row shows the flyer item's picture (an emoji when it has none).
  await expect(sale.locator(".riso-grocery-sale-row .riso-deal-photo")).toHaveCount(2);
  await expect(sale.locator(".riso-grocery-sale-row").first()).toContainText("Lemon");
  await expect(sale.locator(".riso-grocery-sale-row").first()).toContainText("ends today");
  await expect(sale.locator(".riso-grocery-sale-row").nth(1)).toContainText("43% off");

  // Garlic (no sale) goes straight to next week.
  await page.getByRole("button", { name: "Push Garlic to next week" }).click();
  await expect(row("Garlic")).toHaveCount(0);
  const pushed = page.getByLabel("Pushed to next week");
  await expect(pushed.getByRole("button", { name: "Bring Garlic back to this week" })).toBeVisible();

  // Lemon's sale ends first: it asks.
  await page.getByRole("button", { name: "Push Lemon to next week" }).click();
  const ask = page.getByRole("dialog", { name: "The sale ends before next week" });
  await expect(ask).toContainText("$0.50 at Maxi");
  await ask.getByRole("button", { name: "Keep it this week" }).click();
  await expect(row("Lemon")).toBeVisible();
  await page.getByRole("button", { name: "Push Lemon to next week" }).click();
  await ask.getByRole("button", { name: "Push anyway" }).click();
  await expect(row("Lemon")).toHaveCount(0);
  await expect(sale.locator(".riso-grocery-sale-missed")).toContainText("Lemon · Maxi $0.50");

  // Next week has them, marked as carried over; Lemon's sale is over by then.
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(row("Garlic")).toBeVisible();
  await expect(row("Lemon")).toBeVisible();
  await expect(row("Garlic")).toContainText("from last week");
  await expect(row("Lemon").locator(".riso-row-deal")).toHaveCount(0);

  // Back to this week; bring Garlic back.
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(row("Spaghetti")).toBeVisible();
  await pushed.getByRole("button", { name: "Bring Garlic back to this week" }).click();
  await expect(row("Garlic")).toBeVisible();
  const nextExtras = await (await page.request.get(`/api/grocery-extra-items?week=${nextWeek}`)).json();
  expect(nextExtras.map((e) => e.name)).toEqual(["Lemon"]);
});
