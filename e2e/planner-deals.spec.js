import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Planned meals whose ingredients are at a good flyer price this week get a
// green chip on their Planner card, and a strip above the board lists them.
const prisma = new PrismaClient();
const weeksAgo = (n) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

test("a planned meal using a 6-month-low ingredient says so", async ({ page }) => {
  const email = `planner-deals+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const base = { userId: user.id, store: "Metro", source: "Flipp", category: "protein", item: "Chicken breast", matchName: "chicken breast", unitBasis: "lb" };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, price: "$6.99/lb", unitPrice: 6.99, isCurrent: false, createdAt: weeksAgo(6) },
      { ...base, price: "$4.49/lb", unitPrice: 4.49, isCurrent: true },
    ],
  });
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: { title: "Deal Test Chicken Bowl", ingredients: [{ name: "chicken breasts" }, { name: "rice" }], instructions: ["Cook."] },
    })
  ).json();
  const today = (new Date().getDay() + 6) % 7;
  await page.request.post("/api/planner", {
    data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: today, mealType: "dinner" },
  });

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();

  const card = page.locator(".riso-planner-card", { hasText: "Deal Test Chicken Bowl" });
  await expect(card.locator(".riso-planner-card-deal.stock-up")).toHaveText("🏷 stock-up: chicken breasts");

  const strip = page.getByRole("region", { name: "Good prices in this week's plan" });
  await expect(strip).toContainText("1 good price in your plan");
  await expect(strip).toContainText("chicken breasts $4.49/lb at Metro · 6-month low for Deal Test Chicken Bowl");
  await strip.getByRole("button", { name: "Deal Test Chicken Bowl" }).click();
  await expect(page.locator(".riso-rc-title")).toHaveText("Deal Test Chicken Bowl");
});
