import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Every grocery row can be removed (recipe rows until their meals leave the
// plan, with a way back) and can carry your own amount next to the recipe's.

test.use({ viewport: { width: 1280, height: 1000 } });

// Next week's Monday: its meals are always still ahead, whatever day the
// test runs (the list only covers meals from today on).
function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `grocery-edit+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: {
        title: "Garlic lemon pasta",
        baseServings: 2,
        ingredients: [
          { name: "garlic", quantity: 4, unit: "clove" },
          { name: "lemon", quantity: 1 },
          { name: "spaghetti", quantity: 1500, unit: "g" },
        ],
      },
    })
  ).json();
  await page.request.post("/api/planner", {
    data: { recipeId: recipe.id, weekStart: nextMonday(), dayOfWeek: 0, mealType: "dinner" },
  });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
}

const row = (page, name) => page.getByRole("button", { name: `Check off ${name}`, exact: true });

test("recipe amounts read naturally and your own amount shows beside them", async ({ page }) => {
  await setup(page);
  await expect(row(page, "Garlic")).toContainText("4 cloves");
  await expect(row(page, "Spaghetti")).toContainText("1 1/2 kg");

  await page.getByRole("button", { name: "Edit amount of Garlic", exact: true }).click();
  await page.getByLabel("Amount of Garlic").fill("1 head");
  await page.keyboard.press("Enter");
  await expect(row(page, "Garlic")).toContainText("1 head");
  await expect(row(page, "Garlic")).toContainText("recipe: 4 cloves");

  // Editing the amount doesn't check the item off.
  await expect(row(page, "Garlic")).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Garlic")).toContainText("1 head");

  // Back to the recipe amount.
  await page.getByRole("button", { name: "Edit amount of Garlic", exact: true }).click();
  await page.getByRole("button", { name: "use recipe amount" }).click();
  await expect(row(page, "Garlic")).not.toContainText("1 head");
  await expect(row(page, "Garlic")).toContainText("4 cloves");
});

test("any row can be removed, and a removed recipe row can be put back", async ({ page }) => {
  await setup(page);
  await expect(page.getByText(/3 TO BUY/)).toBeVisible();

  await page.getByRole("button", { name: "Remove Lemon", exact: true }).click();
  await expect(row(page, "Lemon")).toHaveCount(0);
  await expect(page.getByText(/2 TO BUY/)).toBeVisible();
  await expect(page.locator(".riso-grocery-removed")).toContainText("Lemon");

  // Hand-added rows delete outright.
  await page.fill('input[placeholder="Add an item, e.g. 2 lemons"]', "paper towels");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(row(page, "paper towels")).toBeVisible();
  await page.getByRole("button", { name: "Remove paper towels", exact: true }).click();
  await expect(row(page, "paper towels")).toHaveCount(0);

  // Removal is saved.
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Lemon")).toHaveCount(0);

  await page.getByRole("button", { name: "Put Lemon back on the list" }).click();
  await expect(row(page, "Lemon")).toBeVisible();
  await expect(page.locator(".riso-grocery-removed")).toHaveCount(0);
});

test("Share copies what's left to buy as a text list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await page.evaluate(() => {
    // Desktop browsers without a share sheet fall back to the clipboard.
    delete navigator.share;
  });
  await row(page, "Lemon").click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("Copied - paste it anywhere")).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("Grocery list");
  expect(text).toContain("- Garlic (4 cloves)");
  expect(text).not.toContain("Lemon"); // already in the cart
});

test("a leftover meal adds nothing to the list, and there's no Left off card", async ({ page }) => {
  await setup(page);
  const soup = await (
    await page.request.post("/api/recipes", { data: { title: "Leftover soup", ingredients: [{ name: "leek", quantity: 2 }] } })
  ).json();
  await page.request.post("/api/planner", {
    data: { recipeId: soup.id, weekStart: nextMonday(), dayOfWeek: 1, mealType: "lunch", isLeftover: true },
  });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Lemon")).toBeVisible();
  await expect(row(page, "Leek")).toHaveCount(0);
  await expect(page.getByText("Left off this week")).toHaveCount(0);
});

test("Clear empties the Removed strip and the rows stay off the list", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Remove Lemon", exact: true }).click();
  await expect(page.locator(".riso-grocery-removed")).toContainText("Lemon");
  await page.locator(".riso-grocery-removed").getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(".riso-grocery-removed")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Garlic")).toBeVisible();
  await expect(row(page, "Lemon")).toHaveCount(0);
  await expect(page.locator(".riso-grocery-removed")).toHaveCount(0);
});

test("checked items never show as unchecked while the list loads", async ({ page }) => {
  await setup(page);
  await row(page, "Garlic").click();
  await expect(row(page, "Garlic")).toHaveAttribute("aria-pressed", "true");
  // Slow the checkmarks down: the rows must wait for them.
  await page.route("**/api/grocery-checked", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  const garlic = row(page, "Garlic");
  await garlic.waitFor();
  expect(await garlic.getAttribute("aria-pressed")).toBe("true");
});

test("stores: add one and drag an item into it; it stays there", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add store" }).click();
  await page.getByLabel("Store name").fill("Costco");
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  const costco = page.getByRole("region", { name: "Costco store" });
  await expect(costco).toContainText("Drag items here");

  // The whole row drags (not only its grip).
  const from = await row(page, "Garlic").locator(".riso-row-name").boundingBox();
  const to = await costco.boundingBox();
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 25, from.y + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(costco.getByRole("button", { name: "Check off Garlic", exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Costco store" }).getByRole("button", { name: "Check off Garlic", exact: true })
  ).toBeVisible();
});

test("Done shopping keeps items bought, adds them to Inventory once, and says the groceries are done", async ({ page }) => {
  await setup(page);
  for (const name of ["Garlic", "Lemon", "Spaghetti"]) await row(page, name).click();
  // Everything in the cart: the card goes dark before Done shopping.
  await expect(page.locator(".riso-grocery-cart")).toHaveClass(/done/);
  await page.getByRole("button", { name: "Done shopping · add 3 to inventory" }).click();
  await expect(page.getByText("Groceries done ✓")).toBeVisible();
  // Still checked after a reload, and not added a second time.
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Garlic")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Groceries done ✓")).toBeVisible();
  const inventory = await (await page.request.get("/api/pantry-inventory")).json();
  expect(inventory.filter((i) => /garlic/i.test(i.name))).toHaveLength(1);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".riso-home-grocery")).toContainText("Groceries done ✓");
});

test("stores reorder by dragging their heading and keep that order", async ({ page }) => {
  await setup(page);
  for (const name of ["Costco", "Adonis"]) {
    await page.getByRole("button", { name: "+ Add store" }).click();
    await page.getByLabel("Store name").fill(name);
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await expect(page.getByRole("region", { name: `${name} store` })).toBeVisible();
  }
  const names = () => page.locator(".riso-group .riso-group-name").allInnerTexts();
  const before = await names();
  expect(before.indexOf("Adonis")).toBeGreaterThan(before.indexOf("Costco"));

  const grip = await page.getByLabel("Reorder the Adonis store").boundingBox();
  const costco = await page.getByRole("region", { name: "Costco store" }).boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 10, grip.y - 10, { steps: 4 });
  await page.mouse.move(costco.x + 60, costco.y + 5, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = await names();
    return after.indexOf("Adonis") < after.indexOf("Costco");
  }).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect.poll(async () => {
    const after = await names();
    return after.indexOf("Adonis") < after.indexOf("Costco");
  }).toBe(true);
});

test("the list waits for stores and deals, so items never show in Any store first", async ({ page }) => {
  await setup(page);
  // A store of your own, and a flyer at Metro: unfiled items belong in Metro.
  await page.request.post("/api/grocery-sections", { data: { name: "Costco" } });
  const me = await (await page.request.get("/api/auth/me")).json();
  await prisma.flyerDeal.create({
    data: {
      userId: me.id, store: "Metro", source: "Flipp", category: "dairy", item: "Butter",
      matchName: "butter", price: "$4.99", unitPrice: 4.99, unitBasis: "each", isCurrent: true,
    },
  });
  const storeNames = () => page.locator(".riso-group-name").allInnerTexts();

  // Deals answer slowly; before, the list drew without them and put every
  // item in "Any store" until they arrived.
  await page.route("**/api/deals?lite=1", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await page.waitForTimeout(600);
  expect(await storeNames()).not.toContain("Any store");
  await expect(page.locator(".riso-grocery-loading")).toBeVisible();

  const metro = page.getByRole("region", { name: "Metro store" });
  await expect(metro.getByRole("button", { name: "Check off Garlic", exact: true })).toBeVisible();
  expect(await storeNames()).not.toContain("Any store");

  // Coming back to the tab shows it straight away, already in place.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(metro.getByRole("button", { name: "Check off Garlic", exact: true })).toBeVisible({ timeout: 500 });
  expect(await storeNames()).not.toContain("Any store");
});
