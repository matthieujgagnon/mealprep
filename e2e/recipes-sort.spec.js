import { expect, test } from "@playwright/test";

// "Fewest missing" puts what you can make with the least shopping first.

test.use({ viewport: { width: 1280, height: 1000 } });

test("Fewest missing sorts by items to buy, with unknown recipes last", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-sort+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  const recipes = [
    { title: "Needs three", ingredients: [{ name: "fennel" }, { name: "leek" }, { name: "halibut" }] },
    { title: "No ingredients yet", ingredients: [] },
    { title: "Needs one", ingredients: [{ name: "eggs" }, { name: "spinach" }, { name: "feta" }] },
    { title: "Needs nothing", ingredients: [{ name: "eggs" }, { name: "spinach" }] },
  ];
  for (const r of recipes) await page.request.post("/api/recipes", { data: r });
  for (const name of ["eggs", "spinach"]) {
    await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
  }

  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByLabel("Sort recipes").selectOption({ label: "Fewest missing" });

  const names = page.locator(".riso-recipe-card-name");
  await expect(names).toHaveText(["Needs nothing", "Needs one", "Needs three", "No ingredients yet"]);
  await expect(page.locator(".riso-recipe-card", { hasText: "Needs one" })).toContainText("1 to buy");
});

test("cards show the total time, and Quickest puts recipes without a time last", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-time+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  for (const r of [
    { title: "Slow braise", prepTimeMinutes: 20, cookTimeMinutes: 160 },
    { title: "No time given" },
    { title: "Quick salad", prepTimeMinutes: 10 },
  ]) {
    await page.request.post("/api/recipes", { data: { ingredients: [{ name: "lettuce" }], ...r } });
  }
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByLabel("Sort recipes").selectOption({ label: "Quickest" });

  await expect(page.locator(".riso-recipe-card-name")).toHaveText(["Quick salad", "Slow braise", "No time given"]);
  await expect(page.locator(".riso-recipe-card", { hasText: "Slow braise" }).locator(".riso-recipe-chip.time")).toHaveText("⏱3 h");
  await expect(page.locator(".riso-recipe-card", { hasText: "No time given" }).locator(".riso-recipe-chip.time")).toHaveText("⏱add time");
});

test("an ingredient can be a count of units", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-unit+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Stuffed peppers");
  await page.fill('input[aria-label="Ingredient"]', "red bell pepper");
  await page.fill('input[aria-label="Quantity"]', "3");
  await page.getByLabel("Unit").first().selectOption("unit");
  await page.fill('textarea[placeholder="Describe this step"]', "Stuff them.");
  await page.getByRole("button", { name: "Save recipe" }).click();

  await page.locator(".riso-recipe-card", { hasText: "Stuffed peppers" }).click();
  await expect(page.locator(".riso-rc-ingredient-qty").first()).toHaveText("3 units");
});

test("any photo can be made the cover, and photos keep their order", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `recipes-photo+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Two photo stew");
  await page.getByLabel("Photo URL").fill("https://example.com/first.jpg");
  await page.getByLabel("Photo URL").press("Enter");
  await page.getByLabel("Photo URL").fill("https://example.com/second.jpg");
  await page.getByLabel("Photo URL").press("Enter");
  await expect(page.locator(".re-photo")).toHaveCount(2);
  await expect(page.locator(".re-photo").first()).toHaveClass(/cover/);
  await page.getByRole("button", { name: "Make this the cover photo" }).click();
  await expect(page.locator(".re-photo").nth(1)).toHaveClass(/cover/);
  await page.fill('input[aria-label="Ingredient"]', "beef");
  await page.fill('textarea[placeholder="Describe this step"]', "Stew it.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.locator(".riso-recipe-card", { hasText: "Two photo stew" })).toBeVisible();

  const recipes = await (await page.request.get("/api/recipes")).json();
  const saved = recipes.find((r) => r.title === "Two photo stew");
  expect(saved.photoUrl).toBe("https://example.com/second.jpg");
  expect(saved.photos).toEqual(["https://example.com/first.jpg", "https://example.com/second.jpg"]);
});
