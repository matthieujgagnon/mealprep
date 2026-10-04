import { expect, test } from "@playwright/test";
import { confirmAdd } from "./inventory-confirm.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A check covers the amount the row showed when it was checked, and "Done
// shopping" clears checks: bought amounts leave the list, and a meal added
// later that needs more shows only the extra, unchecked.

test.use({ viewport: { width: 1280, height: 1000 } });

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Next week's Monday: its meals are always still ahead, whatever day the test runs.
function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return dateKey(x);
}

async function signUp(page) {
  const email = `grocery-checks+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  return email;
}

const recipe = async (page, title, ingredients) =>
  await (await page.request.post("/api/recipes", { data: { title, baseServings: 2, ingredients } })).json();
const place = async (page, recipeId, dayOfWeek) =>
  await page.request.post("/api/planner", { data: { recipeId, weekStart: nextMonday(), dayOfWeek, mealType: "dinner" } });
// A grocery row, and the checkbox in it: only the checkbox checks the item off.
const check = (page, name) => page.getByRole("checkbox", { name: `Check off ${name}`, exact: true });
const row = (page, name) => page.locator(".riso-row").filter({ has: check(page, name) });
const openGrocery = (page) => page.getByRole("button", { name: "Grocery", exact: true }).first().click();
const modeRow = (page, name) =>
  page.getByRole("dialog", { name: "Store mode" }).locator(".store-mode-row", { has: page.locator(".store-mode-name", { hasText: new RegExp(`^${name}$`) }) });
const doneButton = (page, count) => page.getByRole("button", { name: `Done shopping · add ${count} to inventory` });

// A roast (500 g chicken, rice) on Monday, and a soup (200 g more chicken) ready to add.
async function setup(page) {
  const email = await signUp(page);
  const roast = await recipe(page, "Roast chicken", [
    { name: "chicken", quantity: 500, unit: "g" },
    { name: "rice", quantity: 2, unit: "cup" },
  ]);
  const soup = await recipe(page, "Chicken soup", [{ name: "chicken", quantity: 200, unit: "g" }]);
  await place(page, roast.id, 0);
  await page.reload();
  await openGrocery(page);
  return { email, soup };
}

test("Done shopping takes the bought items off the list; a later meal shows only the extra, unchecked", async ({ page }) => {
  const { soup } = await setup(page);
  await expect(row(page, "Chicken")).toContainText("500 g");

  // Only the chicken is checked: it goes, the rice stays.
  await check(page, "Chicken").click();
  await doneButton(page, 1).click();
  await confirmAdd(page);
  await expect(row(page, "Chicken")).toHaveCount(0);
  await expect(row(page, "Rice")).toBeVisible();
  await expect(check(page, "Rice")).toHaveAttribute("aria-checked", "false");

  // A later meal needs 200 g more chicken: just that, unchecked.
  await place(page, soup.id, 2);
  await page.reload();
  await openGrocery(page);
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "false");
  await expect(row(page, "Chicken")).toContainText("+200 g");
  await expect(row(page, "Chicken")).not.toContainText("700");

  // Buying that leaves the list again, and Inventory got both trips.
  await check(page, "Chicken").click();
  await expect(row(page, "Chicken")).toContainText("200 g");
  await doneButton(page, 1).click();
  await confirmAdd(page);
  await expect(row(page, "Chicken")).toHaveCount(0);
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Chicken")).toHaveCount(0);
  const inventory = await (await page.request.get("/api/pantry-inventory")).json();
  const grams = inventory.filter((i) => /chicken/i.test(i.name)).reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  expect(grams).toBe(700);
});

test("everything bought empties the list and says so, also on Home", async ({ page }) => {
  await setup(page);
  await check(page, "Chicken").click();
  await check(page, "Rice").click();
  await doneButton(page, 2).click();
  await confirmAdd(page);
  await expect(page.locator(".riso-grocery-cart-done")).toBeVisible();
  await expect(page.locator(".riso-empty")).toHaveText("Groceries done ✓ Everything's in your Inventory.");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".riso-home-grocery")).toContainText("Groceries done ✓");
});

test("a check without Done shopping covers what it showed: more needed later shows the extra, unchecked", async ({ page }) => {
  const { soup } = await setup(page);
  await check(page, "Chicken").click();
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "true");

  await place(page, soup.id, 2);
  await page.reload();
  await openGrocery(page);
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "false");
  await expect(row(page, "Chicken")).toContainText("+200 g");
  // The rice check wasn't touched by any of this.
  await check(page, "Rice").click();
  await expect(check(page, "Rice")).toHaveAttribute("aria-checked", "true");

  // Checking the grown row covers the new total.
  await check(page, "Chicken").click();
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "true");
  await expect(row(page, "Chicken")).toContainText("700 g");
  await page.reload();
  await openGrocery(page);
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "true");
});

test("unchecking clears the check, and a row that was bought keeps what was bought", async ({ page }) => {
  const { soup } = await setup(page);
  await check(page, "Rice").click();
  await check(page, "Rice").click();
  await expect(check(page, "Rice")).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await openGrocery(page);
  await expect(check(page, "Rice")).toHaveAttribute("aria-checked", "false");

  // Bought chicken, then a meal that needs more: checking and unchecking the
  // extra leaves the bought 500 g bought.
  await check(page, "Chicken").click();
  await doneButton(page, 1).click();
  await confirmAdd(page);
  await place(page, soup.id, 2);
  await page.reload();
  await openGrocery(page);
  await check(page, "Chicken").click();
  await check(page, "Chicken").click();
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "false");
  await expect(row(page, "Chicken")).toContainText("+200 g");
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "Chicken")).toContainText("+200 g");
});

test("a checked hand-added item leaves the list when Done shopping is pressed", async ({ page }) => {
  await setup(page);
  await page.fill('input[placeholder="Add an item, e.g. 2 lemons"]', "paper towels");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await check(page, "paper towels").click();
  await doneButton(page, 1).click();
  await confirmAdd(page);
  await expect(row(page, "paper towels")).toHaveCount(0);
  await expect(row(page, "Chicken")).toBeVisible();
  expect(await (await page.request.get("/api/grocery-extra-items")).json()).toEqual([]);
  await page.reload();
  await openGrocery(page);
  await expect(row(page, "paper towels")).toHaveCount(0);
});

test("a check made before amounts were saved still works, and is saved with its amount", async ({ page }) => {
  const { email, soup } = await setup(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  // How a check looked before: just the ingredient, nothing about amounts.
  await prisma.groceryCheckedItem.create({ data: { userId: user.id, core: "chicken" } });
  await prisma.groceryCheckedItem.create({ data: { userId: user.id, core: "rice", inInventory: true } });
  await page.reload();
  await openGrocery(page);
  // The old check still shows checked; the item "Done shopping" had already sent is bought.
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "true");
  await expect(row(page, "Rice")).toHaveCount(0);
  await expect
    .poll(async () => (await (await page.request.get("/api/grocery-checked")).json()).find((c) => c.core === "chicken")?.covered)
    .toMatchObject({ parts: [{ quantity: 500, unit: "g" }] });

  // From then on a bigger need shows up.
  await place(page, soup.id, 2);
  await page.reload();
  await openGrocery(page);
  await expect(check(page, "Chicken")).toHaveAttribute("aria-checked", "false");
  await expect(row(page, "Chicken")).toContainText("+200 g");
});

test("a bought item is forgotten once no planned meal needs it", async ({ page }) => {
  await setup(page);
  await check(page, "Chicken").click();
  await doneButton(page, 1).click();
  await confirmAdd(page);
  await expect(row(page, "Chicken")).toHaveCount(0);
  expect((await (await page.request.get("/api/grocery-checked")).json()).map((c) => c.core)).toEqual(["chicken"]);

  // Take the meal off the plan: the purchase is forgotten with it.
  const planned = await (await page.request.get(`/api/planner/upcoming?from=${dateKey(new Date())}`)).json();
  for (const entry of planned) await page.request.delete(`/api/planner/${entry.id}`);
  await page.reload();
  await openGrocery(page);
  await expect.poll(async () => (await (await page.request.get("/api/grocery-checked")).json()).length).toBe(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Store mode: Done clears the checks, and a later meal's extra shows unchecked", async ({ page }) => {
    const { soup } = await setup(page);
    await page.getByRole("button", { name: /I'm at the store/ }).click();
    const mode = page.getByRole("dialog", { name: "Store mode" });
    await modeRow(page, "Chicken").click();
    await mode.getByRole("button", { name: "Done · add 1 to inventory" }).click();
    await confirmAdd(page);
    await expect(mode).toHaveCount(0);
    await expect(row(page, "Chicken")).toHaveCount(0);

    await place(page, soup.id, 2);
    await page.reload();
    await openGrocery(page);
    await expect(row(page, "Chicken")).toContainText("+200 g");
    await page.getByRole("button", { name: /I'm at the store/ }).click();
    const extra = modeRow(page, "Chicken");
    await expect(extra).not.toHaveClass(/\bon\b/);
    await expect(extra.locator(".store-mode-qty")).toHaveText("1"); // just the name and the number here
    // The page itself doesn't scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
