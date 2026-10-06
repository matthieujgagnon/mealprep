import { expect, test } from "@playwright/test";

// Fix batch 3: the round ✓ on an ingredient (blue = in Inventory, green = on the grocery
// list), the Planner card borders, Option-drag leftovers and the "Confirm" tile.

test.use({ viewport: { width: 1440, height: 1100 } });

const BLUE = "rgb(35, 35, 255)";
const GREEN = "rgb(16, 201, 92)";
const YELLOW = "rgb(255, 225, 77)";

const MEALS = ["breakfast", "lunch", "dinner"];
const cell = (page, day, meal) => page.locator(".riso-planner-cell").nth(MEALS.indexOf(meal) * 7 + day);

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function setup(page, recipes) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `marks+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const created = [];
  for (const r of recipes) {
    const res = await page.request.post("/api/recipes", { data: { ingredients: [{ name: "flour" }], instructions: ["Cook it."], ...r } });
    created.push(await res.json());
  }
  return created;
}

const place = (page, recipe, dayOfWeek, mealType, extra = {}) =>
  page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek, mealType, ...extra } });
const weekEntries = async (page) => (await page.request.get(`/api/planner?week=${mondayOf(new Date())}`)).json();
const markColor = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

async function openPopout(page, title) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".riso-recipe-card", { hasText: title }).click();
  return page.getByRole("dialog", { name: title });
}

test("pop-out: blue ✓ in Inventory, green ✓ on the list; a tap takes it off (Undo) and puts it back", async ({ page }) => {
  await setup(page, [{ title: "Marks Stew", ingredients: [{ name: "quokka beans" }, { name: "wombat stew" }] }]);
  await page.request.post("/api/pantry-inventory", { data: { name: "wombat stew", location: "fridge" } });
  await page.reload();
  const pop = await openPopout(page, "Marks Stew");

  expect(await markColor(pop.locator(".fnd-pop-have .riso-pill-mark"))).toBe(BLUE);
  const buy = pop.locator(".fnd-buy-pill", { hasText: "quokka beans" });
  await expect(buy).toHaveAttribute("aria-pressed", "false");

  await buy.click(); // on the list: green
  await expect(buy).toHaveAttribute("aria-pressed", "true");
  expect(await markColor(buy.locator(".riso-pill-mark"))).toBe(GREEN);

  await buy.click(); // off the list, with the shared Undo toast
  await expect(buy).toHaveAttribute("aria-pressed", "false");
  const toast = page.getByRole("status").filter({ hasText: "taken off your grocery list" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(buy).toHaveAttribute("aria-pressed", "true");

  // The Grocery page shows the same list.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("quokka beans").first()).toBeVisible();
});

test("the full recipe card and the pop-out agree on what is on the list", async ({ page }) => {
  await setup(page, [{ title: "Card Marks", ingredients: [{ name: "quokka beans" }, { name: "wombat stew" }] }]);
  await page.request.post("/api/pantry-inventory", { data: { name: "wombat stew", location: "fridge" } });
  await page.reload();
  const pop = await openPopout(page, "Card Marks");
  await pop.getByRole("button", { name: /Open the full recipe/ }).click();

  const have = page.locator(".riso-rc-ingredient-line", { hasText: "wombat stew" }).locator(".riso-rc-ingredient-dot");
  expect(await markColor(have)).toBe(BLUE);
  const dot = page.locator(".riso-rc-ingredient-line", { hasText: "quokka beans" }).locator(".riso-rc-ingredient-dot");
  await expect(dot).toHaveAttribute("aria-pressed", "false");
  await dot.click();
  await expect(dot).toHaveAttribute("aria-pressed", "true");
  expect(await markColor(dot)).toBe(GREEN);
  await expect(page.locator(".riso-rc-legend")).toContainText("On your grocery list");

  // Everything missing is on the list now, so the card says so instead of offering to add.
  await expect(page.locator(".riso-rc-planned-note")).toContainText("on your grocery list");
  await dot.click();
  await page.getByRole("status").filter({ hasText: "taken off your grocery list" }).getByRole("button", { name: "Undo" }).click();
  await expect(dot).toHaveAttribute("aria-pressed", "true");

  // Close the card; the pop-out marks the same item green.
  await page.keyboard.press("Escape");
  const again = await openPopout(page, "Card Marks");
  await expect(again.locator(".fnd-buy-pill", { hasText: "quokka beans" })).toHaveAttribute("aria-pressed", "true");
});

test("Planner: already have is a blue border only, leftovers a yellow border only, no shadows", async ({ page }) => {
  const [plain, have, left] = await setup(page, [{ title: "Plain Meal" }, { title: "Have Meal" }, { title: "Left Meal" }]);
  await place(page, plain, 0, "dinner");
  await place(page, have, 1, "dinner", { alreadyHave: true });
  await place(page, left, 2, "dinner", { isLeftover: true });
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();

  const look = (day) =>
    cell(page, day, "dinner")
      .locator(".riso-planner-card")
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: s.borderTopColor, width: s.borderTopWidth, shadow: s.boxShadow };
      });
  const a = await look(0);
  const b = await look(1);
  const c = await look(2);
  expect(b.border).toBe(BLUE);
  expect(b.shadow).toBe("none");
  expect(c.border).toBe(YELLOW);
  expect(c.shadow).toBe("none");
  expect(a.border).not.toBe(BLUE);
  expect(a.border).not.toBe(YELLOW);
  expect(a.shadow).toBe("none");
  await expect(page.locator(".plg")).toContainText("Ingredients on hand, nothing to buy");
  await expect(page.locator(".plg")).toContainText("Leftovers, nothing to buy");
});

async function drag(page, from, to, { alt }) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
  if (alt) await expect(page.locator("body")).toHaveClass(/riso-copy-drag/);
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
}

test("Option-drag copies a planned recipe as leftovers (Undo); a plain drag still moves it", async ({ page }) => {
  const [dish] = await setup(page, [{ title: "Copy Me" }]);
  await place(page, dish, 1, "dinner");
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  const source = cell(page, 1, "dinner").locator(".riso-planner-card");
  await expect(source).toBeVisible();

  await drag(page, source, cell(page, 3, "lunch"), { alt: true });
  await expect.poll(async () => (await weekEntries(page)).length).toBe(2);
  const entries = await weekEntries(page);
  const original = entries.find((e) => e.dayOfWeek === 1 && e.mealType === "dinner");
  const copy = entries.find((e) => e.dayOfWeek === 3 && e.mealType === "lunch");
  expect(original.isLeftover).toBe(false);
  expect(copy.isLeftover).toBe(true);
  await expect(cell(page, 3, "lunch").locator(".riso-planner-card.leftover")).toBeVisible();
  await expect(cell(page, 1, "dinner").locator(".riso-planner-card")).toBeVisible();

  const toast = page.getByRole("status").filter({ hasText: "Leftovers of Copy Me" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(1);

  // Without Option the card moves.
  await drag(page, source, cell(page, 4, "lunch"), { alt: false });
  await expect.poll(async () => (await weekEntries(page)).map((e) => `${e.dayOfWeek}-${e.mealType}`)).toEqual(["4-lunch"]);
});

test("Nothing planned: the tile turns ink with a pink shadow and says ✓ Confirm; a second click marks the slot; Escape cancels", async ({ page }) => {
  await setup(page, [{ title: "Any Recipe" }]);
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await cell(page, 2, "lunch").locator(".riso-planner-cell-empty").click();
  const card = page.locator(".riso-slotcard");
  const tile = card.locator(".riso-slotcard-btn.blank");
  await expect(tile).toHaveText("Nothing planned");

  await tile.click();
  await expect(tile).toHaveText("✓ Confirm");
  await expect(tile).toHaveCSS("background-color", "rgb(22, 24, 31)");
  expect(await tile.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("rgb(255, 72, 176)");
  await expect(card.locator(".riso-slotcard-save")).toHaveCount(0);
  expect(await weekEntries(page)).toHaveLength(0);

  // Escape puts the tile back and leaves the card open.
  await page.keyboard.press("Escape");
  await expect(tile).toHaveText("Nothing planned");
  await expect(card).toBeVisible();

  // So does clicking something else in the card.
  await tile.click();
  await expect(tile).toHaveText("✓ Confirm");
  await card.getByRole("button", { name: "Note", exact: true }).click();
  await expect(tile).toHaveText("Nothing planned");

  await tile.click();
  await tile.click();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(1);
  const toast = page.getByRole("status").filter({ hasText: "Added to" });
  await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
});
