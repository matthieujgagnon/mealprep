import { expect, test } from "@playwright/test";

// The recipe editor (design handoff: Riso Recipe Editor.dc.html). A new recipe
// opens as a pop-up over the Recipes page; editing one is the full page.
// Covers planner slot, pasted steps and ingredient lists, uploaded photos,
// re-import that only fills empty fields, and the unsaved-changes guard.

async function signUp(page) {
  const email = `editor+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
}

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);

test("a new recipe with a slot, pasted steps and a pasted ingredient list", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await expect(page.getByRole("heading", { name: "New recipe." })).toBeVisible();

  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Quick pickled shallots");
  await page.getByRole("radio", { name: "Pantry / Prep" }).click();
  await expect(page.getByText("Doesn't take a meal slot on the calendar.")).toBeVisible();

  await page.getByRole("button", { name: "Paste a whole list" }).click();
  await page.getByLabel("Ingredient list").fill("3 shallots, thinly sliced\n1 cup rice vinegar\nBrine:\n2 tbsp sugar");
  await page.getByRole("button", { name: "Add these" }).click();
  await expect(page.locator('input[aria-label="Ingredient"]')).toHaveCount(3);
  await expect(page.getByLabel("Section name")).toHaveValue("Brine");

  await page
    .getByLabel("Step 1")
    .fill("Slice the shallots.\nBring the brine to a boil:\nPour it over and let cool for 20 minutes.");
  await expect(page.getByLabel("Step 2")).toHaveValue("Pour it over and let cool for 20 minutes.");
  await expect(page.getByLabel("Section heading")).toHaveValue("Bring the brine to a boil");
  await expect(page.locator(".re-timer")).toHaveText("⏱ 20 min");

  await page.getByRole("button", { name: "More prep" }).click();
  await expect(page.locator(".re-total strong")).toHaveText("5 min");
  await expect(page.locator(".re-unsaved")).toHaveText("UNSAVED CHANGES");

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();

  await page.locator(".riso-filter-chip", { hasText: /Pantry \/ Prep/ }).click();
  const card = page.locator(".riso-recipe-card", { hasText: "Quick pickled shallots" });
  await expect(card).toBeVisible();
  await expect(card.locator(".rv2-card-meta .riso-pill").first()).toHaveText("⏱5 min");

  const recipes = await (await page.request.get("/api/recipes")).json();
  const saved = recipes.find((r) => r.title === "Quick pickled shallots");
  expect(saved.mealSlot).toBe("prep");
  expect(saved.instructions).toEqual([
    "Slice the shallots.",
    "Bring the brine to a boil:",
    "Pour it over and let cool for 20 minutes.",
  ]);
  expect(saved.ingredients.map((i) => [i.name, i.quantity, i.unit, i.notes, i.group])).toEqual([
    ["Shallots", 3, null, "thinly sliced", null],
    ["Rice vinegar", 1, "cup", null, null],
    ["Sugar", 2, "tbsp", null, "Brine"],
  ]);
});

test("editing from the recipe card: uploaded photo, save returns to the card", async ({ page }) => {
  await signUp(page);
  await page.request.post("/api/recipes", {
    data: { title: "Weeknight dal", ingredients: [{ name: "red lentils", quantity: 1, unit: "cup" }], instructions: ["Simmer."] },
  });
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".riso-recipe-card", { hasText: "Weeknight dal" }).click();
  await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Edit recipe" }).click();
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();

  await page.getByLabel("Choose photos").setInputFiles({ name: "dal.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".re-photo.cover img")).toHaveAttribute("src", /^\/api\/recipe-images\//);
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Weeknight red dal");

  // Leaving with unsaved changes asks first, in the app's own pop-up (not the
  // browser's); Keep editing stays in the editor.
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Leave without saving your changes?");
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".riso-rc-title")).toHaveText("Weeknight red dal");
  const src = await page.locator(".riso-rc-hero-photo").getAttribute("src");
  expect(src).toMatch(/^\/api\/recipe-images\//);
  const image = await page.request.get(src);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("re-import fills only the empty fields", async ({ page }) => {
  await signUp(page);
  await page.route("**/api/recipes/scrape", (route) =>
    route.fulfill({
      json: {
        title: "Scraped title",
        photoUrl: "https://example.com/b.jpg",
        photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        baseServings: 6,
        ingredients: [{ name: "Onion", quantity: 1, unit: null, notes: "diced", group: null, position: 0 }],
        instructions: ["Chop.", "Cook for 30 minutes."],
        fridgeLifeDays: 4,
      },
    })
  );
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "My own title");
  await page.getByLabel("PREP", { exact: true }).fill("5");
  await page.getByLabel("Recipe link").fill("https://example.com/soup");
  await page.getByRole("button", { name: "↻ Re-import" }).click();
  await expect(page.getByText("Filled in photos, cook time, ingredients, steps from the link.")).toBeVisible();

  await expect(page.locator('input[placeholder="Grandma\'s lasagna"]')).toHaveValue("My own title");
  await expect(page.getByLabel("PREP", { exact: true })).toHaveValue("5");
  await expect(page.getByLabel("COOK", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("SERVINGS", { exact: true })).toHaveValue("6");
  await expect(page.locator(".re-photo")).toHaveCount(2);
  await expect(page.locator(".re-photo").nth(1)).toHaveClass(/cover/);
  await expect(page.locator('input[aria-label="Ingredient"]')).toHaveValue("Onion");
  await expect(page.getByLabel("Step 2")).toHaveValue("Cook for 30 minutes.");
});

test("photos drag to reorder, and the cover moves with its photo", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  for (const u of ["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg"]) {
    await page.getByLabel("Photo URL").fill(u);
    await page.getByLabel("Photo URL").press("Enter");
  }
  const tiles = page.locator(".re-photo");
  await tiles.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = await tiles.nth(0).boundingBox();
  const to = await tiles.nth(2).boundingBox();
  await page.mouse.move(from.x + 40, from.y + 60);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 5 });
  await page.mouse.move(to.x + 60, to.y + 60, { steps: 10 });
  await page.mouse.up();

  expect(await tiles.evaluateAll((els) => els.map((e) => e.dataset.url))).toEqual([
    "https://example.com/2.jpg",
    "https://example.com/3.jpg",
    "https://example.com/1.jpg",
  ]);
  await expect(page.locator(".re-photo.cover")).toHaveAttribute("data-url", "https://example.com/1.jpg");
});

test("+ New recipe is a pop-up over Recipes; x, Escape and the dimmed area close it, asking first (in the app's own pop-up) when something is typed", async ({ page }) => {
  await signUp(page);
  const dialog = page.getByRole("dialog", { name: "New recipe." });
  const title = page.locator('input[placeholder="Grandma\'s lasagna"]');
  const ask = page.getByRole("alertdialog");
  let browserDialogs = 0;
  page.on("dialog", (d) => {
    browserDialogs += 1;
    return d.dismiss();
  });

  await page.getByRole("button", { name: "+ New recipe" }).click();
  await expect(dialog).toBeVisible();
  // The Recipes page is still there behind it, dimmed and blurred.
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeAttached();
  const overlay = page.locator(".re-overlay");
  expect(await overlay.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur");

  // Nothing typed: closes without asking, by x, Escape or the dimmed area.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await overlay.click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
  await expect(ask).toHaveCount(0);

  // Something typed: each way asks, and each way of keeping it loses nothing.
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await title.fill("Lost-if-careless chili");
  await page.keyboard.press("Escape");
  await expect(ask).toContainText("Leave without saving your changes?");
  await expect(ask.getByRole("button", { name: "Keep editing" })).toBeFocused();
  // Escape closes only the question.
  await page.keyboard.press("Escape");
  await expect(ask).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toHaveCount(0);
  await overlay.click({ position: { x: 4, y: 4 } });
  await expect(ask).toBeVisible();
  // A tap on the dimmed area behind the question keeps the form too.
  await page.locator(".riso-ask-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(ask).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue("Lost-if-careless chili");

  // Discard throws it away and goes back to Recipes.
  await page.keyboard.press("Escape");
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
  expect(browserDialogs).toBe(0);
});

test("the new-recipe pop-up is white and its sections are paper cards with an edge", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
  const popup = page.locator(".re-popup");
  const section = page.locator(".re-popup .re-section").first();
  expect(await css(popup, "backgroundColor")).toBe("rgb(255, 253, 248)");
  expect(await css(section, "backgroundColor")).toBe("rgb(244, 241, 234)");
  expect(await css(section, "borderTopWidth")).toBe("2px");
  expect(await css(section, "boxShadow")).not.toBe("none");
});

test("a recipe typed in the pop-up saves and lands first in the list", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Popup pancakes");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".riso-recipe-card", { hasText: "Popup pancakes" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("+ New recipe is a sheet that fills the screen from the bottom, Save pinned", async ({ page }) => {
    await signUp(page);
    await page.getByRole("button", { name: "+ New recipe" }).click();
    const sheet = page.getByRole("dialog", { name: "New recipe." });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400); // the slide up
    const box = await sheet.boundingBox();
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(388);
    expect(box.y + box.height).toBeGreaterThanOrEqual(843);
    expect(box.height).toBeGreaterThan(800);
    await expect(page.getByRole("button", { name: "Save recipe" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
  });
});
