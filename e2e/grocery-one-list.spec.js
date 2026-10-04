import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The grocery list is one list that's always there: every planned meal from
// today on, across weeks, with no week arrows, week dates or push to next
// week. A removal lasts until the meals that need the item leave the plan.

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
const todayIndex = (new Date().getDay() + 6) % 7;

async function signUp(page) {
  const email = `grocery-one-list+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  return email;
}

const recipe = async (page, title, ingredients) =>
  (await (await page.request.post("/api/recipes", { data: { title, baseServings: 2, ingredients } })).json());
const place = async (page, recipeId, weekStart, dayOfWeek) =>
  (await (await page.request.post("/api/planner", { data: { recipeId, weekStart, dayOfWeek, mealType: "dinner" } })).json());
// A grocery row, and the checkbox in it: only the checkbox checks the item off.
const check = (page, name) => page.getByRole("checkbox", { name: `Check off ${name}`, exact: true });
const row = (page, name) => page.locator(".riso-row").filter({ has: check(page, name) });
const openGrocery = (page) => page.getByRole("button", { name: "Grocery", exact: true }).click();

test("one list for every meal from today on, across weeks, amounts merged; no week controls", async ({ page }) => {
  await signUp(page);
  const thisWeek = mondayOf(new Date());
  const pasta = await recipe(page, "Garlic lemon pasta", [
    { name: "garlic", quantity: 4, unit: "clove" },
    { name: "lemon", quantity: 1 },
    { name: "spaghetti", quantity: 500, unit: "g" },
  ]);
  const chicken = await recipe(page, "Lemon garlic chicken", [
    { name: "garlic", quantity: 2, unit: "clove" },
    { name: "chicken breast", quantity: 600, unit: "g" },
  ]);
  const soup = await recipe(page, "Old soup", [{ name: "leek", quantity: 2 }]);
  const lastWeek = plusDays(thisWeek, -7);
  await place(page, soup.id, lastWeek, 3); // already happened
  await place(page, pasta.id, thisWeek, todayIndex); // today
  await place(page, chicken.id, plusDays(thisWeek, 14), 2); // two weeks ahead
  await page.reload();
  await openGrocery(page);

  // Garlic from two meals in two different weeks is one row, amounts added.
  await expect(row(page, "Garlic")).toContainText("6 cloves");
  await expect(page.locator(".riso-row-name", { hasText: /^Garlic$/ })).toHaveCount(1);
  await expect(row(page, "Chicken breast")).toBeVisible();
  await expect(row(page, "Spaghetti")).toBeVisible();
  // A meal from before today is off the list.
  await expect(row(page, "Leek")).toHaveCount(0);
  await expect(page.getByText(/4 TO BUY/)).toBeVisible();

  // No week arrows, week dates or push to next week.
  await expect(page.locator(".riso-grocery-header .riso-planner-nav-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Previous|Next) week$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "This week", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /to next week/ })).toHaveCount(0);
  await expect(page.locator(".riso-grocery-header")).not.toContainText(/\b(Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\b/);
});

test("a removal stays until the meals that need the item leave the plan; restoring brings it back", async ({ page }) => {
  await signUp(page);
  const nextWeek = plusDays(mondayOf(new Date()), 7);
  const pasta = await recipe(page, "Garlic lemon pasta", [{ name: "garlic", quantity: 4, unit: "clove" }, { name: "lemon", quantity: 1 }]);
  const entryA = await place(page, pasta.id, nextWeek, 0);
  const entryB = await place(page, pasta.id, plusDays(nextWeek, 7), 0);
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Lemon")).toContainText("2");

  await page.getByRole("button", { name: "Remove Lemon", exact: true }).click();
  await expect(row(page, "Lemon")).toHaveCount(0);
  await expect(page.locator(".riso-grocery-removed")).toContainText("Lemon");

  // Still off after a reload, and while one of its meals is still planned.
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Lemon")).toHaveCount(0);
  await page.request.delete(`/api/planner/${entryA.id}`);
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Garlic")).toBeVisible();
  await expect(row(page, "Lemon")).toHaveCount(0);

  // The chip brings it back.
  await page.getByRole("button", { name: "Put Lemon back on the list" }).click();
  await expect(row(page, "Lemon")).toBeVisible();

  // Remove it again, then let every meal that needs it leave the plan: the
  // saved removal goes with them, so a later meal that needs it starts fresh.
  await page.getByRole("button", { name: "Remove Lemon", exact: true }).click();
  await expect(row(page, "Lemon")).toHaveCount(0);
  await page.request.delete(`/api/planner/${entryB.id}`);
  await page.reload();
  await openGrocery(page);
  await expect(page.locator(".riso-grocery-loading")).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/grocery-item-overrides")).json()).length).toBe(0);
  await place(page, pasta.id, nextWeek, 2);
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Lemon")).toBeVisible();
  await expect(page.locator(".riso-grocery-removed")).toHaveCount(0);
});

test("manual items, checks and store moves stay until changed, whichever days pass", async ({ page }) => {
  await signUp(page);
  const pasta = await recipe(page, "Garlic pasta", [{ name: "garlic", quantity: 4, unit: "clove" }]);
  await place(page, pasta.id, plusDays(mondayOf(new Date()), 7), 1);
  await page.request.post("/api/grocery-sections", { data: { name: "Costco" } });
  await page.reload();
  await openGrocery(page);

  await page.fill('input[placeholder="Add an item, e.g. 2 lemons"]', "paper towels");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await check(page, "paper towels").click();
  await check(page, "Garlic").click();
  await expect(check(page, "Garlic")).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await openGrocery(page);
  await expect(check(page, "paper towels")).toHaveAttribute("aria-checked", "true");
  await expect(check(page, "Garlic")).toHaveAttribute("aria-checked", "true");

  // Deleting a manual item deletes it, and what was saved about it.
  await page.getByRole("button", { name: "Remove paper towels", exact: true }).click();
  await expect(row(page, "paper towels")).toHaveCount(0);
  await expect(page.locator(".riso-grocery-removed")).toHaveCount(0);
  const checked = await (await page.request.get("/api/grocery-checked")).json();
  expect(checked.map((c) => c.core)).toEqual(["garlic"]);
});

test("On sale lists what to buy first, soonest-ending first", async ({ page }) => {
  const email = await signUp(page);
  const thisWeek = mondayOf(new Date());
  const pasta = await recipe(page, "Garlic lemon pasta", [
    { name: "garlic", quantity: 4, unit: "clove" },
    { name: "lemon", quantity: 1 },
    { name: "spaghetti", quantity: 500, unit: "g" },
  ]);
  await place(page, pasta.id, thisWeek, todayIndex);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "produce", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Maxi", item: "Lemons", matchName: "lemons", price: "$0.50", unitPrice: 0.5, unitBasis: "each", regularPrice: 0.99, validUntil: key(new Date()) },
      { ...base, store: "Metro", category: "staple", item: "Barilla spaghetti, 900 g", matchName: "spaghetti", price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 3.49, validUntil: plusDays(thisWeek, 9) },
    ],
  });
  await page.reload();
  await openGrocery(page);
  const sale = page.locator(".riso-grocery-sale");
  await expect(sale.locator(".riso-grocery-sale-row")).toHaveCount(2);
  await expect(sale.locator(".riso-grocery-sale-row .riso-deal-photo")).toHaveCount(2);
  await expect(sale.locator(".riso-grocery-sale-row").first()).toContainText("Lemon");
  await expect(sale.locator(".riso-grocery-sale-row").first()).toContainText("ends today");
  await expect(sale.locator(".riso-grocery-sale-row").nth(1)).toContainText("43% off");
  // Both tags are one solid green pill, evenly spaced, with a normal price.
  const tag = row(page, "Lemon").locator(".riso-row-deal");
  await expect(tag).toHaveText("Maxi$0.50");
  const look = await tag.evaluate((el) => {
    const store = el.querySelector(".riso-row-deal-store");
    const price = el.querySelector(".riso-row-deal-price");
    const bg = (n) => getComputedStyle(n).backgroundColor;
    return {
      pill: bg(el),
      storeBg: bg(store),
      priceBg: bg(price),
      priceFont: getComputedStyle(price).fontFamily,
      spacing: getComputedStyle(price).letterSpacing,
    };
  });
  expect(look.storeBg).toBe("rgba(0, 0, 0, 0)");
  expect(look.priceBg).toBe("rgba(0, 0, 0, 0)");
  expect(look.pill).not.toBe("rgba(0, 0, 0, 0)");
  expect(look.priceFont).not.toMatch(/mono/i);
  expect(look.spacing).toBe("normal");
});
