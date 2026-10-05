import { expect, test } from "@playwright/test";

// The Riso v2 Planner: a board of 7 days by 3 meals with one shared recipe
// finder under it (search, filters, Cook with, Main meal, the recipe pop-out).
// One thing per slot - placing replaces, moving swaps.

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
  const email = `planner+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.fill('input[type="email"]', email);
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
  created.email = email;
  return created;
}

async function openPlanner(page) {
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-planner-board")).toBeVisible();
}

// Slots for a day in the visible Mon-Fri part of the board.
function visibleDay() {
  return Math.min(todayIndex(), 4);
}

function cell(page, day, meal) {
  return page.locator(".riso-planner-cell").nth(MEALS.indexOf(meal) * 7 + day);
}

async function slotCardFor(page, day, meal) {
  await cell(page, day, meal).locator(".riso-planner-cell-empty").click();
  const card = page.getByRole("dialog", { name: /^Add to / });
  await expect(card).toBeVisible();
  return card;
}

// Shows the board's lower rows and the finder's first results together, so a
// drag between them never has to scroll the page.
async function scrollBetween(page) {
  await page.evaluate(() => window.scrollTo(0, 450));
  await page.waitForTimeout(300);
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

async function weekEntries(page, week = mondayOf(new Date())) {
  return (await page.request.get(`/api/planner?week=${week}`)).json();
}

test("clicking an empty slot opens its card with Recipe, Note and Nothing planned", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const card = await slotCardFor(page, day, "lunch");
  await expect(card.getByRole("button", { name: /Recipe/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /Note/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /Nothing planned/ })).toBeVisible();
  await expect(cell(page, day, "lunch").locator(".riso-planner-cell-empty.selected")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  expect(await weekEntries(page)).toHaveLength(0);
});

test("Nothing planned marks the slot blank; clicking the blank card clears it", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "lunch");
  const card = await slotCardFor(page, day, "lunch");
  await card.getByRole("button", { name: /Nothing planned/ }).click();

  await expect(target.locator(".riso-planner-note.blank")).toBeVisible();
  await expect(target.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await target.locator(".riso-planner-note.blank").click();
  await expect(target.locator(".riso-planner-cell-empty")).toBeVisible();
  expect(await weekEntries(page)).toHaveLength(0);
});

test("the card's Recipe makes the slot the search panel's target, and + puts the recipe there", async ({ page }) => {
  await setup(page, [{ title: "Target Stew" }]);
  await openPlanner(page);

  const day = visibleDay();
  const card = await slotCardFor(page, day, "breakfast");
  await card.getByRole("button", { name: /Recipe/ }).click();

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  await expect(page.locator(".fnd-target")).toContainText(`${DAYS[day]} · Breakfast`);
  await expect(page.locator(".fnd-searchbar input")).toBeFocused();
  await page.getByRole("button", { name: "Add Target Stew to the plan" }).click();

  await expect(cell(page, day, "breakfast").locator(".riso-planner-card-name")).toHaveText("Target Stew");
  await expect(page.locator(".fnd-target")).toHaveCount(0);
  const entries = await weekEntries(page);
  expect(entries).toHaveLength(1);
  expect([entries[0].dayOfWeek, entries[0].mealType]).toEqual([day, "breakfast"]);
});

test("with no slot chosen, + fills the next empty upcoming slot, supper first", async ({ page }) => {
  await setup(page, [{ title: "Next Slot Stew" }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await page.getByRole("button", { name: "Add Next Slot Stew to the plan" }).click();
  await expect(page.locator(".riso-planner-card-name", { hasText: "Next Slot Stew" })).toBeVisible();

  const entries = await weekEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0].dayOfWeek).toBe(todayIndex());
  expect(entries[0].mealType).toBe("dinner");
});

test("an empty slot takes typed text from its Note button, which can be edited and cleared", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "breakfast");
  const card = await slotCardFor(page, day, "breakfast");
  await card.getByRole("button", { name: /Note/ }).click();
  const input = target.getByRole("textbox", { name: "Write on this slot" });
  await expect(input).toBeFocused();
  await input.fill("Hockey pool @ Normal");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Hockey pool @ Normal");
  await expect(target).not.toContainText("NOTE");

  await target.locator(".riso-planner-note").click();
  await expect(input).toHaveValue("Hockey pool @ Normal");
  await input.fill("Work breakfast");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  // Clearing the text leaves a blank card; clicking that empties the slot.
  await target.locator(".riso-planner-note").click();
  await input.fill("");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note.blank")).toBeVisible();
  await target.locator(".riso-planner-note.blank").click();
  await expect(target.locator(".riso-planner-cell-empty")).toBeVisible();
});

test("emoji from the keyboard's emoji picker land on a slot's note", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "dinner");
  const card = await slotCardFor(page, day, "dinner");
  await card.getByRole("button", { name: /Note/ }).click();
  const input = target.getByRole("textbox", { name: "Write on this slot" });
  await input.fill("Fries night ");

  // Opening the Mac emoji picker (or Windows' Win+.) takes focus from the
  // whole window, which blurs the textarea: the card must stay open.
  await input.evaluate((el) => {
    const realHasFocus = document.hasFocus.bind(document);
    document.hasFocus = () => false;
    el.blur();
    document.hasFocus = realHasFocus;
  });
  await expect(input).toBeVisible();

  // The picked emoji arrives once focus is back; Enter while it's still
  // being composed doesn't save half of it.
  await input.focus();
  await page.keyboard.insertText("🍟");
  await input.evaluate((el) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }))
  );
  await expect(input).toBeVisible();
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Fries night 🍟");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Fries night 🍟");
  await expect(target.locator(".riso-planner-note-text.emoji")).toHaveCount(0);

  // Only an emoji: shown big, like a picture.
  await target.locator(".riso-planner-note").click();
  await input.fill("🥗");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text.emoji")).toHaveText("🥗");
  await expect(target.locator(".riso-planner-note-text")).toHaveCSS("font-size", "56px");
});

test("dragging a recipe from the bottom panel onto a filled slot replaces it", async ({ page }) => {
  const [first] = await setup(page, [{ title: "Old Meal" }, { title: "New Meal" }]);
  const day = visibleDay();
  await page.request.post("/api/planner", {
    data: { recipeId: first.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" },
  });
  await openPlanner(page);
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("New Meal");
  await scrollBetween(page);

  const tile = page.locator(".fnd-card", { hasText: "New Meal" });
  const target = cell(page, day, "dinner");
  await drag(page, tile, target);

  await expect(target.locator(".riso-planner-card-name")).toHaveText("New Meal");
  await expect(page.locator(".riso-planner-card-name", { hasText: "Old Meal" })).toHaveCount(0);
  expect(await weekEntries(page)).toHaveLength(1);
});

test("dragging a recipe from the bottom panel onto an empty slot saves it there", async ({ page }) => {
  await setup(page, [{ title: "Dragged Dinner" }]);
  await openPlanner(page);
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Dragged");
  await scrollBetween(page);

  const day = visibleDay();
  await drag(page, page.locator(".fnd-card", { hasText: "Dragged Dinner" }), cell(page, day, "dinner"));

  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Dragged Dinner");
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Dragged Dinner");
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

test("there is no Fill button, no how-it-works strip, no scroll-for-the-weekend button and no banner", async ({ page }) => {
  await setup(page, [{ title: "Pancakes" }]);
  await openPlanner(page);

  await expect(page.getByRole("button", { name: /Fill \d+ empty slot|All slots filled/ })).toHaveCount(0);
  await expect(page.locator(".riso-hint-strip")).toHaveCount(0);
  await expect(page.getByText(/scroll for the weekend/i)).toHaveCount(0);
  await expect(page.getByText(/meals planned/i)).toHaveCount(0);
  // All seven days are on the board.
  await expect(page.locator(".riso-planner-day-header")).toHaveCount(7);
});

test("Expiring soon keeps the recipes that use food going off", async ({ page }) => {
  await setup(page, [
    { title: "Spinach Pie", ingredients: [{ name: "spinach" }, { name: "flour" }] },
    { title: "Plain Rice", ingredients: [{ name: "rice" }] },
  ]);
  await page.request.post("/api/pantry-inventory", {
    data: { name: "spinach", location: "fridge", expiresAt: new Date(Date.now() + 2 * 86400000).toISOString() },
  });
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(2);

  await page.getByRole("button", { name: "Expiring soon", exact: true }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(1);
  await expect(page.locator(".fnd-card", { hasText: "Spinach Pie" })).toBeVisible();
});

test("Cook with lists expiring food first, then the user's own shelves, and finds recipes using the pick", async ({ page }) => {
  await setup(page, [
    { title: "Spinach Pie", ingredients: [{ name: "spinach" }, { name: "flour" }] },
    { title: "Paprika Chicken", ingredients: [{ name: "paprika" }, { name: "chicken" }] },
    { title: "Plain Rice", ingredients: [{ name: "rice" }] },
  ]);
  const shelf = await (await page.request.post("/api/pantry-locations", { data: { name: "Spice rack" } })).json();
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
  await page.request.post("/api/pantry-inventory", { data: { name: "spinach", location: "fridge", expiresAt: inDays(2) } });
  await page.request.post("/api/pantry-inventory", { data: { name: "ice cream", location: "freezer", expiresAt: inDays(90) } });
  await page.request.post("/api/pantry-inventory", { data: { name: "paprika", location: shelf.id, expiresAt: inDays(300) } });
  await openPlanner(page);

  await page.getByRole("button", { name: /Add an ingredient/ }).click();
  const picker = page.getByRole("group", { name: "INGREDIENTS IN YOUR KITCHEN" });
  await expect(picker.getByText("Expiring soon", { exact: true })).toBeVisible();
  await expect(picker.locator(".fnd-picker-exp .fnd-item", { hasText: "Spinach" })).toContainText("2d");
  // Fridge, Freezer and the user's own Spice rack: drawers, each with its count.
  await expect(picker.locator(".fnd-drawer .fnd-shelf")).toHaveText(["Fridge1", "Freezer1", "Spice rack1"]);

  await picker.locator(".fnd-drawer .fnd-item", { hasText: "Paprika" }).click();
  await expect(picker.locator(".fnd-chosen")).toHaveText("1 chosen");
  await expect(picker.locator(".fnd-drawer", { hasText: "Spice rack" }).locator(".fnd-shelf-count")).toHaveText("1/1");
  await expect(page.locator(".fnd-card")).toHaveCount(1);
  await expect(page.locator(".fnd-card", { hasText: "Paprika Chicken" })).toContainText("Uses paprika");
  // There is no Done button: the × closes the picker, and the pick stays.
  await expect(picker.getByRole("button", { name: "Done" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Close" }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".fnd-token", { hasText: "Paprika" })).toBeVisible();
});

test("clicking a filled slot opens only that recipe's pop-out; only the × removes the meal", async ({ page }) => {
  const [recipe] = await setup(page, [
    {
      title: "Pop Soup",
      prepTimeMinutes: 10,
      cookTimeMinutes: 25,
      baseServings: 4,
      mealSlot: "dinner",
      instructions: ["Chop.", "Simmer."],
      ingredients: [{ name: "flour" }, { name: "zucchini" }],
    },
  ]);
  const day = visibleDay();
  await page.request.post("/api/planner", {
    data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" },
  });
  await openPlanner(page);

  await cell(page, day, "dinner").locator(".riso-planner-card").click();
  const pop = page.getByRole("dialog", { name: "Pop Soup" });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("35 min");
  await expect(pop).toContainText("Serves 4");
  await expect(pop).toContainText("Supper");
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  await expect(pop).toContainText(`Planned ${DAYS[day]}`);
  await expect(pop.getByText("Steps · 2")).toBeVisible();
  await expect(pop.getByRole("button", { name: "Similar recipes" })).toBeVisible();
  await expect(pop.getByRole("button", { name: "Open the full recipe →" })).toBeVisible();

  // Closing it takes nothing off the plan; the × on the card does.
  await pop.getByRole("button", { name: "Close" }).click();
  await expect(pop).toHaveCount(0);
  expect(await weekEntries(page)).toHaveLength(1);
  await cell(page, day, "dinner").getByRole("button", { name: /Remove Pop Soup/ }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-cell-empty")).toBeVisible();
  expect(await weekEntries(page)).toHaveLength(0);
});

test("Open the full recipe goes to the recipe card", async ({ page }) => {
  await setup(page, [{ title: "Full Card Pie" }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Full Card Pie" }).click();
  await page.getByRole("button", { name: "Open the full recipe →" }).click();
  await expect(page.getByRole("dialog", { name: /Full Card Pie/ }).or(page.locator(".riso-rc-title", { hasText: "Full Card Pie" })).first()).toBeVisible();
});

test("what to buy in the pop-out is shared with the Grocery list", async ({ page }) => {
  await setup(page, [{ title: "Zucchini Bake", ingredients: [{ name: "zucchini" }] }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Zucchini Bake" }).click();
  const pop = page.getByRole("dialog", { name: "Zucchini Bake" });

  await pop.getByRole("button", { name: "Add zucchini to grocery list" }).click();
  await expect(pop.getByRole("button", { name: "Remove zucchini from grocery list" })).toHaveAttribute("aria-pressed", "true");
  await pop.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText(/zucchini/i).first()).toBeVisible();

  // Taken off the list on the Grocery page, it shows as not added in the pop-out.
  await page.getByRole("button", { name: /^Remove zucchini/i }).first().click();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Zucchini Bake" }).click();
  await expect(page.getByRole("dialog", { name: "Zucchini Bake" }).getByRole("button", { name: "Add zucchini to grocery list" })).toBeVisible();
});

test("Main meal finds recipes sharing its ingredients, and leftovers can be placed on empty slots", async ({ page }) => {
  const [main] = await setup(page, [
    { title: "Chicken Orzo", ingredients: [{ name: "chicken" }, { name: "orzo" }, { name: "lemon" }] },
    { title: "Lemon Chicken Salad", ingredients: [{ name: "chicken" }, { name: "lemon" }, { name: "lettuce" }] },
    { title: "Lettuce Wraps", ingredients: [{ name: "lettuce" }, { name: "cucumber" }] },
  ]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Chicken Orzo" }).click();
  await page.getByRole("button", { name: "Similar recipes" }).click();

  const banner = page.locator(".fnd-main");
  await expect(banner).toContainText("Main meal");
  await expect(banner).toContainText("Chicken Orzo");
  // Ingredients grouped: protein, produce, dairy, pantry.
  await expect(banner.locator(".fnd-main-groupname")).toHaveText(["Protein", "Produce", "Pantry"]);
  // Only the recipe that shares ingredients shows, and says what it shares.
  await expect(page.locator(".fnd-card")).toHaveCount(1);
  await expect(page.locator(".fnd-card", { hasText: "Lemon Chicken Salad" })).toContainText("shares chicken and lemon");

  // Switching an ingredient off narrows the search.
  await banner.getByRole("button", { name: "Chicken" }).click();
  await expect(page.locator(".fnd-card", { hasText: "Lemon Chicken Salad" })).toContainText("shares lemon");
  await banner.getByRole("button", { name: "Chicken" }).click();

  // Leftovers go on empty slots with the existing leftover flag.
  await banner.getByRole("button", { name: "Place leftovers" }).click();
  const day = visibleDay();
  await cell(page, day, "lunch").locator(".riso-planner-cell-empty").click();
  await expect(cell(page, day, "lunch").locator(".riso-planner-card-leftover")).toHaveText("leftover");
  await expect(cell(page, day, "lunch").locator(".riso-planner-card-name")).toHaveText("Chicken Orzo");
  const entries = await weekEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ recipeId: main.id, isLeftover: true, dayOfWeek: day, mealType: "lunch" });

  // Cancel clears the Main meal.
  await banner.getByRole("button", { name: "Cancel" }).click();
  await expect(banner).toHaveCount(0);
});

test("the weekend is set by the user, drawn as grouped blocks, and saved with the account", async ({ page, playwright }) => {
  const recipes = await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  // Saturday and Sunday by default: one block.
  const pill = page.getByRole("button", { name: /^Weekend:/ });
  await expect(pill).toHaveText(/Weekend: Sat Sun/);
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);

  await pill.click();
  await page.getByRole("button", { name: "Friday" }).click();
  await expect(pill).toHaveText(/Weekend: Fri Sat Sun/);
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);
  // Saturday off leaves Friday and Sunday: two blocks.
  await page.getByRole("button", { name: "Saturday" }).click();
  await expect(pill).toHaveText(/Weekend: Fri Sun/);
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(2);

  // Saved: it survives a reload, and another device (a fresh login) reads it too.
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Weekend:/ })).toHaveText(/Weekend: Fri Sun/);
  const other = await playwright.request.newContext({ baseURL: "http://localhost:4000" });
  await other.post("/api/auth/login", { data: { email: recipes.email, password: "testpass123" } });
  const me = await (await other.get("/api/auth/me")).json();
  expect(me.weekendDays).toEqual([4, 6]);
  const bad = await other.patch("/api/auth/me", { data: { weekendDays: [9] } });
  expect(bad.status()).toBe(400);
  await other.dispose();
});

test("today's header is pink and the board opens with today in view", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await page.setViewportSize({ width: 820, height: 1000 }); // narrow enough that the board scrolls sideways
  await openPlanner(page);

  const today = page.locator(".riso-planner-day-header.is-today");
  await expect(today).toHaveCount(1);
  await expect(today).toHaveCSS("background-color", "rgb(255, 72, 176)");
  await expect(today).toContainText("TODAY");
  const scroller = await page.locator(".riso-planner-scroll").boundingBox();
  const box = await today.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(scroller.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(scroller.x + scroller.width + 1);
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

test("past days are black and white; today and later keep their colour", async ({ page }) => {
  const [recipe] = await setup(page, [{ title: "Old soup" }]);
  const lastWeek = mondayOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: lastWeek, dayOfWeek: 6, mealType: "dinner" } });
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner" } });
  await openPlanner(page);

  const todayCell = page.locator(".riso-planner-cell").filter({ has: page.locator(".riso-planner-card") });
  await expect(todayCell).toHaveCount(1);
  await expect(todayCell).not.toHaveClass(/\bpast\b/);
  await expect(page.locator(".riso-planner-cell.past")).toHaveCount(todayIndex() * 3);
  await expect(page.locator(".riso-planner-day-header.past")).toHaveCount(todayIndex());

  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator(".riso-planner-cell.past")).toHaveCount(21);
  const card = page.locator(".riso-planner-cell.past", { has: page.locator(".riso-planner-card") });
  await expect(card).toHaveCSS("filter", "grayscale(1)");
});

test("on a phone, a meal card with an emoji is the same size as a recipe card with a photo", async ({ page }) => {
  const [recipe] = await setup(page, [{ title: "Photo stew", photoUrl: "/photo-does-not-matter.jpg" }]);
  await page.request.post("/api/planner", {
    data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner" },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".rpm")).toBeVisible();

  // Tap today's empty breakfast, choose "Add a note instead", and write only an emoji.
  const day = (await page.locator(".rpm-head.today").getAttribute("aria-label")).split(" ")[0];
  await page.getByRole("button", { name: `Add to breakfast, ${day}` }).click();
  await page.getByRole("button", { name: "✎ Add a note instead" }).click();
  await page.getByRole("textbox", { name: "Write on breakfast" }).fill("🥞");
  await page.keyboard.press("Enter");
  await expect(page.locator(".rpm-note-text.emoji")).toBeVisible();

  const meal = await page.locator(".rpm-cell.card").boundingBox();
  const note = await page.locator(".rpm-cell.note:not(.blank)").boundingBox();
  expect(Math.round(note.height)).toBe(Math.round(meal.height));
  expect(Math.round(note.width)).toBe(Math.round(meal.width));
  await page.screenshot({ path: test.info().outputPath("planner-phone-emoji-card.png") });
});
