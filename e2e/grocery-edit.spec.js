import { expect, test } from "@playwright/test";

// Every grocery row can be removed (recipe rows for this week only, with a
// way back) and can carry your own amount next to the recipe's.

test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
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
    data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: 0, mealType: "dinner" },
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

  // Removal is saved for the week.
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

test("Review what's left off lists leftovers and staples, and puts them back", async ({ page }) => {
  await setup(page);
  const soup = await (
    await page.request.post("/api/recipes", { data: { title: "Leftover soup", ingredients: [{ name: "leek", quantity: 2 }] } })
  ).json();
  const fries = await (
    await page.request.post("/api/recipes", { data: { title: "Fries", ingredients: [{ name: "potatoes" }, { name: "salt" }] } })
  ).json();
  const week = mondayOf(new Date());
  await page.request.post("/api/planner", {
    data: { recipeId: soup.id, weekStart: week, dayOfWeek: 1, mealType: "lunch", isLeftover: true },
  });
  await page.request.post("/api/planner", { data: { recipeId: fries.id, weekStart: week, dayOfWeek: 2, mealType: "lunch" } });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(row(page, "Leek")).toHaveCount(0);

  await page.getByRole("button", { name: "Review what's left off →" }).click();
  const review = page.locator(".riso-grocery-review");
  await expect(review).toContainText("Leftover soup");
  await review.locator(".riso-grocery-review-row", { hasText: "Salt" }).getByRole("button", { name: "+ List" }).click();
  await expect(row(page, "Salt")).toBeVisible();

  await review.locator(".riso-grocery-review-row", { hasText: "Leftover soup" }).getByRole("button", { name: "Shop for it" }).click();
  await expect(row(page, "Leek")).toBeVisible();
});

test("Done shopping keeps items bought, adds them to Inventory once, and says the groceries are done", async ({ page }) => {
  await setup(page);
  for (const name of ["Garlic", "Lemon", "Spaghetti"]) await row(page, name).click();
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
