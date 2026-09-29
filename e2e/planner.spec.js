import { expect, test } from "@playwright/test";

// The v3 Planner: a board of slots beside an "Add recipes" tray. One thing
// per slot - placing replaces, moving swaps.

test.use({ viewport: { width: 1440, height: 1100 } });

const MEALS = ["breakfast", "lunch", "dinner"];
const todayIndex = () => (new Date().getDay() + 6) % 7;

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function setup(page, recipes) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `planner+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const created = [];
  for (const r of recipes) {
    const res = await page.request.post("/api/recipes", {
      data: { ingredients: [{ name: "flour" }], ...r },
    });
    created.push(await res.json());
  }
  return created;
}

async function openPlanner(page) {
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-planner-board")).toBeVisible();
}

// Slots for a day in the visible Mon-Fri part of the board, so a drag
// never has to scroll the grid.
function visibleDay() {
  return Math.min(todayIndex(), 4);
}

function cell(page, day, meal) {
  return page.locator(".riso-planner-cell").nth(MEALS.indexOf(meal) * 7 + day);
}

async function drag(page, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

test("selecting an empty slot and tapping + puts the recipe there", async ({ page }) => {
  await setup(page, [{ title: "Slot Chili" }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "All", exact: true }).click();

  const day = visibleDay();
  const target = cell(page, day, "lunch");
  await target.getByRole("button", { name: "+ add" }).click();
  await expect(target.getByRole("button", { name: "pick a recipe →" })).toBeVisible();
  await expect(page.locator(".riso-tray-target")).toBeVisible();

  await page.getByRole("button", { name: "Add Slot Chili to the plan" }).click();
  await expect(target.locator(".riso-planner-card-name")).toHaveText("Slot Chili");
  await expect(page.locator(".riso-tray-target")).toHaveCount(0);
});

test("with no slot selected, + fills the next empty upcoming slot, supper first", async ({ page }) => {
  await setup(page, [{ title: "Next Slot Stew" }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Add Next Slot Stew to the plan" }).click();
  await expect(page.locator(".riso-planner-card-name", { hasText: "Next Slot Stew" })).toBeVisible();

  const entries = await (await page.request.get(`/api/planner?week=${mondayOf(new Date())}`)).json();
  expect(entries).toHaveLength(1);
  expect(entries[0].dayOfWeek).toBe(todayIndex());
  expect(entries[0].mealType).toBe("dinner");
});

test("a selected slot takes a typed note, which can be edited and removed", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "breakfast");
  await target.getByRole("button", { name: "+ add" }).click();
  const input = page.getByPlaceholder("…or type a note, e.g. Eating out ↵");
  await input.fill("Brunch out");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Brunch out");

  await target.locator(".riso-planner-note").click();
  await expect(input).toHaveValue("Brunch out");
  await input.fill("Work breakfast");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  await target.getByRole("button", { name: 'Remove note "Work breakfast"' }).click();
  await expect(target.getByRole("button", { name: "+ add" })).toBeVisible();
});

test("dragging a recipe from the tray onto a filled slot replaces it", async ({ page }) => {
  const [first] = await setup(page, [{ title: "Old Meal" }, { title: "New Meal" }]);
  const day = visibleDay();
  await page.request.post("/api/planner", {
    data: { recipeId: first.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "lunch" },
  });
  await openPlanner(page);
  await page.getByRole("button", { name: "All", exact: true }).click();

  const tile = page.locator(".riso-tray-tile", { hasText: "New Meal" });
  const target = cell(page, day, "lunch");
  await drag(page, tile, target);

  await expect(target.locator(".riso-planner-card-name")).toHaveText("New Meal");
  await expect(page.locator(".riso-planner-card-name", { hasText: "Old Meal" })).toHaveCount(0);
  const entries = await (await page.request.get(`/api/planner?week=${mondayOf(new Date())}`)).json();
  expect(entries).toHaveLength(1);
});

test("dragging a meal onto another meal swaps the two slots", async ({ page }) => {
  const [a, b] = await setup(page, [{ title: "Meal A" }, { title: "Meal B" }]);
  const day = visibleDay();
  const weekStart = mondayOf(new Date());
  await page.request.post("/api/planner", { data: { recipeId: a.id, weekStart, dayOfWeek: day, mealType: "breakfast" } });
  await page.request.post("/api/planner", { data: { recipeId: b.id, weekStart, dayOfWeek: day, mealType: "lunch" } });
  await openPlanner(page);

  await drag(page, page.locator(".riso-planner-card", { hasText: "Meal A" }), cell(page, day, "lunch"));

  await expect(cell(page, day, "lunch").locator(".riso-planner-card-name")).toHaveText("Meal A");
  await expect(cell(page, day, "breakfast").locator(".riso-planner-card-name")).toHaveText("Meal B");
});

test("Fill empty slots fills the rest of the week, breakfast from breakfast recipes", async ({ page }) => {
  await setup(page, [{ title: "Pancakes", tags: ["breakfast"] }, { title: "Curry" }]);
  await openPlanner(page);

  const fill = page.getByRole("button", { name: /^Fill \d+ empty slots?$/ });
  await expect(fill).toBeVisible();
  await fill.click();
  await expect(page.getByRole("button", { name: "All slots filled ✓" })).toBeDisabled();

  const entries = await (await page.request.get(`/api/planner?week=${mondayOf(new Date())}`)).json();
  const upcomingDays = 7 - todayIndex();
  expect(entries).toHaveLength(upcomingDays * 3);
  for (const e of entries) {
    expect(e.dayOfWeek).toBeGreaterThanOrEqual(todayIndex());
    expect(e.recipe.title).toBe(e.mealType === "breakfast" ? "Pancakes" : "Curry");
  }
});

test("Suggested favours recipes that use expiring food", async ({ page }) => {
  await setup(page, [
    { title: "Spinach Pie", ingredients: [{ name: "spinach" }, { name: "flour" }] },
    { title: "Plain Rice", ingredients: [{ name: "rice" }] },
  ]);
  await page.request.post("/api/pantry-inventory", {
    data: { name: "spinach", location: "fridge", expiresAt: new Date(Date.now() + 2 * 86400000).toISOString() },
  });
  await openPlanner(page);

  const group = page.locator(".riso-tray-group", { hasText: "USES WHAT'S EXPIRING" });
  await expect(group.locator(".riso-tray-tile", { hasText: "Spinach Pie" })).toContainText("Uses spinach");
});

test("the check on a meal card marks it leftover, then already have it", async ({ page }) => {
  const [a] = await setup(page, [{ title: "Toggle Meal" }]);
  const day = visibleDay();
  await page.request.post("/api/planner", {
    data: { recipeId: a.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" },
  });
  await openPlanner(page);

  const card = page.locator(".riso-planner-card", { hasText: "Toggle Meal" });
  await card.hover();
  await card.locator(".riso-planner-card-have").click();
  await expect(card.locator(".riso-planner-card-leftover")).toHaveText("leftover");
  await card.locator(".riso-planner-card-have").click();
  await expect(card).toHaveClass(/\bhave\b/);
});
