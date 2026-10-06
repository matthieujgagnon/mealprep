import { expect, test } from "@playwright/test";

// The Planner on a phone: the whole week as a board, three days in view, a
// week pill with a month calendar, and a button to the grocery list.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const todayIndex = () => (new Date().getDay() + 6) % 7;

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() + 7);
  return mondayOf(x);
}

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `pm+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const res = await page.request.post("/api/recipes", {
    data: { title: "Roast chicken", baseServings: 2, ingredients: [{ name: "chicken", quantity: 500, unit: "g" }] },
  });
  return res.json();
}

async function plan(page, recipe, weekStart, dayOfWeek, mealType) {
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek, mealType } });
}

async function openPlanner(page) {
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await expect(page.locator(".rpm-board")).toBeVisible();
}

test("the week is one board: seven days, three meal rows, and the meal labels stay put while it scrolls", async ({ page }) => {
  await setup(page);
  await openPlanner(page);

  await expect(page.locator(".rpm-head")).toHaveCount(7);
  await expect(page.locator(".rpm-mealrow")).toHaveCount(3);
  await expect(page.locator(".rpm-cell")).toHaveCount(21);
  await expect(page.locator(".rpm-head.today .rpm-head-dow")).toHaveText("TODAY");

  // About three days fit; the board is wider than the screen.
  const board = page.locator(".rpm-board");
  const { scrollWidth, clientWidth } = await board.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth).toBeGreaterThan(clientWidth * 1.8);

  // Scroll all the way to Sunday: the labels are still at the left edge.
  await board.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await page.waitForTimeout(400);
  const label = await page.locator(".rpm-meallabel").first().boundingBox();
  expect(label.x).toBeGreaterThanOrEqual(0);
  expect(label.x).toBeLessThan(30);
});

test("a card opens a sheet with its buttons: leftovers, already have it, then clear, and remove", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.locator(".rpm-cell.card").click();
  const sheet = page.locator(".riso-sheet");
  await expect(sheet.getByText("Roast chicken").first()).toBeVisible();
  await expect(sheet.locator(".rpm-sheet-state")).toHaveText("Planned");
  await expect(sheet.getByRole("button", { name: "Open the recipe" })).toBeVisible();

  await sheet.getByRole("button", { name: "Mark as leftovers" }).click();
  await expect(sheet.locator(".rpm-sheet-state")).toHaveText("Leftovers");
  await sheet.getByRole("button", { name: "Mark as already have it" }).click();
  await expect(sheet.locator(".rpm-sheet-state")).toHaveText("Already have it");
  await sheet.getByRole("button", { name: "Clear the mark" }).click();
  await expect(sheet.locator(".rpm-sheet-state")).toHaveText("Planned");

  await sheet.getByRole("button", { name: "Remove from the plan" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".rpm-cell.card")).toHaveCount(0);
  await expect(page.locator(".rpm-cell.empty")).toHaveCount(21);
});

test("an empty cell: the sheet offers recipes or a note instead", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.getByRole("button", { name: "Add to lunch, Wednesday" }).click();
  await page.getByRole("button", { name: "✎ Add a note instead" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Write on lunch" }).fill("Eating out");
  await page.keyboard.press("Enter");
  await expect(page.locator(".rpm-cell.note .rpm-note-text")).toHaveText("Eating out");
});

test("the date pill opens the week calendar: three dashes a day, a tapped day shows its meals under its row, and Show this week opens it", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, mondayOf(new Date()), todayIndex(), "dinner");
  await openPlanner(page);

  // The title is above the controls, and the sticker says this is the current week.
  const header = page.locator(".phd");
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  await expect(header.getByText("this week", { exact: true })).toBeVisible();
  await header.locator(".phd-date").click();
  const calendar = page.getByRole("dialog", { name: "Choose a week" });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".wcal-day.today")).toHaveCount(1);
  await expect(calendar.locator(".wcal-week.selected")).toHaveCount(1);
  // Three dashes a day, one for each meal; the planned supper is the only one filled.
  await expect(calendar.locator(".wcal-dashes i.on")).toHaveCount(1);
  await expect(calendar.locator(".wcal-day.today .wcal-dashes i")).toHaveCount(3);

  // Tapping a day shows its meals inline under its week's row; a row does not pick the week.
  await calendar.locator(".wcal-day.today").click();
  const preview = calendar.locator(".wcal-preview.inline");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("1 planned");
  await expect(preview).toContainText(recipe.title);
  await expect(calendar).toBeVisible();

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);

  // Another week: the title does not change, the sticker goes back to this week.
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  await expect(header.getByText("this week", { exact: true })).toHaveCount(0);
  await header.locator(".phd-date").click();
  await calendar.getByRole("button", { name: "Go to this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(header.getByText("this week", { exact: true })).toBeVisible();

  // Tap a day in the next month, then Show this week: that week opens.
  await header.locator(".phd-date").click();
  await calendar.getByRole("button", { name: "Next month" }).click();
  await calendar.locator(".wcal-day:not(.out)").nth(14).click();
  await calendar.getByRole("button", { name: "Show this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "↩ this week" })).toBeVisible();
});

test("the bottom button shows what's left to buy and opens Grocery", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, mondayOf(new Date()), todayIndex(), "dinner");
  await openPlanner(page);

  const button = page.getByRole("button", { name: /^Make the grocery list/ });
  await expect(button).toHaveText("Make the grocery list · 1");
  await button.click();
  await expect(page.locator(".tab.active")).toHaveText("Grocery");
});

test("the bottom card holds the shared finder: + puts a recipe in the tapped slot, and it saves", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.getByRole("button", { name: "Add to supper, Tuesday" }).click();
  const sheet = page.locator(".riso-sheet");
  await expect(sheet.getByRole("heading", { name: "Add to Tue · Supper" })).toBeVisible();
  await expect(sheet.locator(".fnd-sheet")).toBeVisible();
  // The finder's search, filters and results are all in the card.
  await expect(sheet.getByRole("textbox", { name: "Title, ingredient or tag" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Makeable now/ })).toBeVisible();

  await sheet.getByRole("button", { name: "Add Roast chicken to the plan" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".rpm-cell.card")).toHaveCount(1);
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect(entries).toHaveLength(1);
  expect([entries[0].dayOfWeek, entries[0].mealType]).toEqual([1, "dinner"]);
});

test("a recipe's pop-out opens inside the card, and leftovers can be placed from a Main meal", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.getByRole("button", { name: "Add to lunch, Wednesday" }).click();
  const sheet = page.locator(".riso-sheet");
  await sheet.locator(".fnd-card-open", { hasText: "Roast chicken" }).click();
  const pop = page.getByRole("dialog", { name: "Roast chicken" });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("Serves 2");
  await pop.getByRole("button", { name: "Similar recipes" }).click();
  await expect(sheet.locator(".fnd-main")).toContainText("Roast chicken");

  // Place leftovers closes the card and lets the board's empty slots take them.
  await sheet.getByRole("button", { name: "Place leftovers" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  const bar = page.locator(".rpm-leftoverbar");
  await expect(bar).toContainText("Placing leftovers of Roast chicken");
  await page.getByRole("button", { name: "Put leftovers on lunch, Wednesday" }).click();
  await expect(page.locator(".rpm-leftover")).toHaveText("leftover");
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect(entries.filter((e) => e.isLeftover)).toHaveLength(1);
  await bar.getByRole("button", { name: "Done" }).click();
  await expect(bar).toHaveCount(0);
});

test("the weekend days are grouped in a block on the phone board too", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await expect(page.locator(".rpm-weekend")).toHaveCount(1);
  // No "Thu - Sun" hint and no Fill button: all seven days are on the board.
  await expect(page.locator(".rpm-more")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Fill \d+ empty/ })).toHaveCount(0);
});
