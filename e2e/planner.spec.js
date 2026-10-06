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
  await page.evaluate(() => window.scrollTo(0, 530));
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
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
});

test("Nothing planned marks the slot blank; clicking the blank card clears it", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "lunch");
  const card = await slotCardFor(page, day, "lunch");
  await card.getByRole("button", { name: /Nothing planned/ }).click();
  // The first click only turns the tile ink ("✓ Confirm"); nothing is saved until it is pressed again.
  await expect(card.getByRole("button", { name: /Confirm/ })).toHaveText("✓ Confirm");
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
  await card.getByRole("button", { name: /^Confirm/ }).click();

  await expect(target.locator(".riso-planner-note.blank")).toBeVisible();
  await target.locator(".riso-planner-note.blank").click();
  await expect(target.locator(".riso-planner-cell-empty")).toBeVisible();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
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

test("the pop-out's Plan comes first and opens the slot picker, on the next empty slot, supper first", async ({ page }) => {
  await setup(page, [{ title: "Next Slot Stew" }]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Next Slot Stew" }).click();
  const buttons = page.getByRole("dialog", { name: "Next Slot Stew" }).locator(".fnd-pop-actions button");
  await expect(buttons.first()).toHaveText("Plan");
  await buttons.first().click();
  await page.getByRole("dialog", { name: "Pick a slot" }).getByRole("button", { name: /^Add to / }).click();
  await expect(page.locator(".riso-planner-card-name", { hasText: "Next Slot Stew" })).toBeVisible();

  const entries = await weekEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0].dayOfWeek).toBe(todayIndex());
  expect(entries[0].mealType).toBe("dinner");
});

test("with no slot chosen, + opens the slot picker; a free slot is confirmed there and saved", async ({ page }) => {
  await setup(page, [{ title: "Picker Pie" }, { title: "Already Here" }]);
  const [, here] = await (await page.request.get("/api/recipes")).json().then((r) => [0, r.find((x) => x.title === "Already Here")]);
  const day = visibleDay();
  await page.request.post("/api/planner", { data: { recipeId: here.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "lunch" } });
  await openPlanner(page);
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Picker");

  await page.getByRole("button", { name: "Add Picker Pie to the plan" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("Picker Pie");
  // It opens on the next empty slot (supper first), which is free.
  await expect(picker.getByRole("status")).toHaveText("Free slot");
  await expect(picker.getByRole("button", { name: /Add to .* · Supper/ })).toBeVisible();

  // A taken slot says what it replaces.
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  await picker.getByRole("button", { name: new RegExp(`^${DAYS[day]} · Lunch: Already Here`) }).click();
  await expect(picker.getByRole("status")).toHaveText("Replaces Already Here");

  // Pick a free slot and confirm.
  await picker.getByRole("button", { name: new RegExp(`^${DAYS[day]} · Breakfast`) }).click();
  await picker.getByRole("button", { name: `Add to ${DAYS[day]} · Breakfast` }).click();
  await expect(picker).toHaveCount(0);
  await expect(cell(page, day, "breakfast").locator(".riso-planner-card-name")).toHaveText("Picker Pie");
  const entries = await weekEntries(page);
  expect(entries.find((e) => e.recipe.title === "Picker Pie")).toMatchObject({ dayOfWeek: day, mealType: "breakfast" });
});

test("the card's Note tab saves typed text; a note is edited in the same card and removed with Remove note", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "breakfast");
  const card = await slotCardFor(page, day, "breakfast");
  await card.getByRole("button", { name: /Note/ }).click();
  const input = card.getByRole("textbox", { name: "Write on this slot" });
  await expect(input).toBeFocused();
  // Save waits for text; a quick note fills the box; the limit is 80 characters.
  await expect(card.getByRole("button", { name: "Save note" })).toBeDisabled();
  await card.getByRole("button", { name: "Eating out" }).click();
  await expect(input).toHaveValue("Eating out");
  await input.fill("Hockey pool @ Normal");
  await input.press("Enter");
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Hockey pool @ Normal");
  await expect(card).toHaveCount(0);

  // Clicking the note opens the same card on the Note tab, filled in.
  await target.locator(".riso-planner-note").click();
  const edit = page.getByRole("dialog", { name: /^Add to / });
  await expect(edit.getByRole("textbox", { name: "Write on this slot" })).toHaveValue("Hockey pool @ Normal");
  await edit.getByRole("textbox", { name: "Write on this slot" }).fill("Work breakfast");
  await edit.getByRole("button", { name: "Save note" }).click();
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(target.locator(".riso-planner-note-text")).toHaveText("Work breakfast");

  // A note has no ×; its card has Remove note, and the toast has Undo.
  await expect(target.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await target.locator(".riso-planner-note").click();
  await page.getByRole("button", { name: "Remove note" }).click();
  await expect(target.locator(".riso-planner-cell-empty")).toBeVisible();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
});

test("emoji from the keyboard's emoji picker land on a slot's note", async ({ page }) => {
  await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  const day = visibleDay();
  const target = cell(page, day, "dinner");
  const card = await slotCardFor(page, day, "dinner");
  await card.getByRole("button", { name: /Note/ }).click();
  const input = card.getByRole("textbox", { name: "Write on this slot" });
  await input.fill("Fries night ");

  // Opening the Mac emoji picker (or Windows' Win+.) takes focus from the
  // whole window, which blurs the box: the card must stay open, nothing saved.
  await input.evaluate((el) => {
    const realHasFocus = document.hasFocus.bind(document);
    document.hasFocus = () => false;
    el.blur();
    document.hasFocus = realHasFocus;
  });
  await expect(input).toBeVisible();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);

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

  // Only an emoji: shown big, like a picture (40px).
  await target.locator(".riso-planner-note").click();
  const edit = page.getByRole("dialog", { name: /^Add to / });
  await edit.getByRole("textbox", { name: "Write on this slot" }).fill("🥗");
  await edit.getByRole("button", { name: "Save note" }).click();
  await expect(target.locator(".riso-planner-note-text.emoji")).toHaveText("🥗");
  await expect(target.locator(".riso-planner-note-text")).toHaveCSS("font-size", "40px");
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

test("there is no Fill button, no scroll-for-the-weekend button and no banner; the how-it-works card can be dismissed", async ({ page }) => {
  await setup(page, [{ title: "Pancakes" }]);
  await openPlanner(page);

  await expect(page.getByRole("button", { name: /Fill \d+ empty slot|All slots filled/ })).toHaveCount(0);
  await expect(page.getByText(/scroll for the weekend/i)).toHaveCount(0);
  await expect(page.getByText(/meals planned/i)).toHaveCount(0);
  // All seven days are on the board, and the legend says what the colours mean.
  await expect(page.locator(".riso-planner-day-header")).toHaveCount(7);
  await expect(page.locator(".plg")).toContainText("Weekend");
  await expect(page.locator(".plg")).toContainText("Today");

  // The how-it-works card is back, with five lines, and "Got it" hides it for good.
  const hint = page.locator(".riso-hint-strip");
  await expect(hint.locator("li")).toHaveCount(5);
  await expect(hint).toContainText("Click an empty slot: choose a recipe, a note or an empty card.");
  await expect(hint).toContainText("The weekend (Fri eve + Sat–Sun) is changed with its tag");
  await hint.getByRole("button", { name: "Got it" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-hint-strip")).toHaveCount(0);
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

test("clicking a filled slot opens its planned-meal card; only the × removes the meal, with Undo", async ({ page }) => {
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
  const card = page.getByRole("dialog", { name: "Pop Soup" });
  await expect(card).toBeVisible();
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  await expect(card).toContainText("PLANNED MEAL");
  await expect(card).toContainText(`${DAYS[day]} · Supper`);
  await expect(card).toContainText("35 min");
  await expect(card).toContainText("Serves 4");
  await expect(card.getByText("Steps · 2")).toBeVisible();
  await expect(card.getByRole("button", { name: "Cook", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Use as a base for other meals" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Replace this recipe" })).toBeVisible();

  // Closing it takes nothing off the plan; the × on the card does, with Undo.
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);
  expect(await weekEntries(page)).toHaveLength(1);
  await cell(page, day, "dinner").getByRole("button", { name: /Remove Pop Soup/ }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-cell-empty")).toBeVisible();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
  const toast = page.getByRole("status").filter({ hasText: "Pop Soup removed from" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Pop Soup");
  expect(await weekEntries(page)).toHaveLength(1);
});

test("the planned-meal card's Cook opens the recipe's card on the Recipes page", async ({ page }) => {
  const [recipe] = await setup(page, [{ title: "Cook Me", instructions: ["Step one.", "Step two."] }]);
  const day = visibleDay();
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
  await openPlanner(page);
  await cell(page, day, "dinner").locator(".riso-planner-card").click();
  await page.getByRole("dialog", { name: "Cook Me" }).getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.locator(".riso-rc-actions")).toBeVisible();
  await expect(page.locator(".cm-topbar")).toHaveCount(0);
});

test("Replace this recipe targets that slot with a Replaces notice; the new meal replaces it, and Undo puts the old one back", async ({ page }) => {
  const [old] = await setup(page, [{ title: "Old Stew" }, { title: "Fresh Curry" }]);
  const day = visibleDay();
  await page.request.post("/api/planner", { data: { recipeId: old.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
  await openPlanner(page);
  await cell(page, day, "dinner").locator(".riso-planner-card").click();
  await page.getByRole("dialog", { name: "Old Stew" }).getByRole("button", { name: "Replace this recipe" }).click();

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  await expect(page.locator(".fnd-target")).toContainText(`${DAYS[day]} · Supper`);
  await expect(page.locator(".fnd-notice")).toHaveText("Replaces Old Stew");
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Fresh");
  await page.getByRole("button", { name: "Add Fresh Curry to the plan" }).click();

  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Fresh Curry");
  const toast = page.getByRole("status").filter({ hasText: "Old Stew replaced" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Old Stew");
  const entries = await weekEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0].recipe.title).toBe("Old Stew");
});

test("Use as a base makes the meal the Main meal and lets empty slots take its leftovers", async ({ page }) => {
  const [base] = await setup(page, [
    { title: "Base Chicken", ingredients: [{ name: "chicken" }, { name: "rice" }] },
    { title: "Chicken Wraps", ingredients: [{ name: "chicken" }, { name: "tortilla" }] },
  ]);
  const day = visibleDay();
  await page.request.post("/api/planner", { data: { recipeId: base.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
  await openPlanner(page);
  await cell(page, day, "dinner").locator(".riso-planner-card").click();
  await page.getByRole("dialog", { name: "Base Chicken" }).getByRole("button", { name: "Use as a base for other meals" }).click();

  const banner = page.locator(".fnd-main");
  await expect(banner).toContainText("Base Chicken");
  await expect(banner.getByRole("button", { name: "Place leftovers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fnd-card", { hasText: "Chicken Wraps" })).toContainText("shares chicken");

  // Every empty slot now takes leftovers; the toast says where, and Undo takes them off.
  await cell(page, day, "breakfast").locator(".riso-planner-cell-empty").click();
  await expect(cell(page, day, "breakfast").locator(".riso-planner-card-leftover")).toHaveText("leftover");
  const toast = page.getByRole("status").filter({ hasText: "Leftovers of Base Chicken added to" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, day, "breakfast").locator(".riso-planner-cell-empty")).toBeVisible();
  await banner.getByRole("button", { name: "Cancel" }).click();
  await expect(banner).toHaveCount(0);
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
  await expect(pop.getByRole("button", { name: "Take zucchini off your grocery list" })).toHaveAttribute("aria-pressed", "true");
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

test("the weekend menu: days in any order, the evening before, presets, off; all saved with the account", async ({ page, playwright }) => {
  const recipes = await setup(page, [{ title: "Unused" }]);
  await openPlanner(page);

  // Friday supper through Sunday by default: one block, plus the Friday supper segment.
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(1);
  await expect(page.locator(".plg")).toContainText("Weekend");

  await page.locator(".riso-planner-weekend-tag").click();
  const menu = page.getByRole("dialog", { name: "WEEKEND" });
  await expect(menu).toBeVisible();
  // The evening before off: no segment.
  await menu.getByRole("switch", { name: "Include the evening before" }).click();
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(0);
  await expect(page.locator(".plg")).toContainText("Weekend");

  // Any days, in any order: Wednesday and Sunday make two blocks.
  await menu.getByRole("button", { name: "Sat", exact: true }).click();
  await menu.getByRole("button", { name: "Wed", exact: true }).click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(2);
  await expect(page.locator(".plg")).toContainText("Weekend");

  // A preset sets days and the evening together.
  await menu.getByRole("button", { name: "Sun – Mon" }).click();
  await expect(menu.getByRole("button", { name: "Sun – Mon" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(2); // Monday and Sunday are apart
  await menu.getByRole("button", { name: "Fri eve – Sun" }).click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);

  // Saved: it survives a reload, and a fresh login on another device reads it too.
  await menu.getByRole("button", { name: "Sat – Sun" }).click();
  // Every click saves, in order: wait for the last one to reach the account.
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).weekendEve).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".plg")).toContainText("Weekend");
  const other = await playwright.request.newContext({ baseURL: "http://localhost:4000" });
  await other.post("/api/auth/login", { data: { email: recipes.email, password: "testpass123" } });
  const me = await (await other.get("/api/auth/me")).json();
  expect(me).toMatchObject({ weekendDays: [5, 6], weekendOn: true, weekendEve: false });
  expect((await other.patch("/api/auth/me", { data: { weekendDays: [9] } })).status()).toBe(400);
  expect((await other.patch("/api/auth/me", { data: { weekendOn: "yes" } })).status()).toBe(400);

  // Off: no blocks and no legend line for the weekend; a dashed "+ WEEKEND" pill brings the menu back.
  await page.locator(".riso-planner-weekend-tag").click();
  await page.getByRole("dialog", { name: "WEEKEND" }).getByRole("switch", { name: "Show the weekend" }).click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(0);
  await expect(page.locator(".riso-planner-weekend-off")).toHaveText("+ WEEKEND");
  await expect(page.locator(".plg")).not.toContainText("Weekend");
  expect((await (await other.get("/api/auth/me")).json()).weekendOn).toBe(false);
  await page.keyboard.press("Escape");
  await page.locator(".riso-planner-weekend-off").click();
  await expect(page.getByRole("dialog", { name: "WEEKEND" })).toBeVisible();
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
  await expect(page.locator(".pmb")).toBeVisible();

  // Tap today's empty breakfast, choose Note, and write only an emoji.
  await page.locator(".pmb-cell").nth(todayIndex() * 3).getByRole("button").click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Write on this slot" }).fill("🥞");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".riso-planner-note-text.emoji")).toBeVisible();

  const meal = await page.locator(".pmb-cell .riso-planner-card").boundingBox();
  const note = await page.locator(".pmb-cell .riso-planner-note:not(.blank)").boundingBox();
  expect(Math.round(note.height)).toBe(Math.round(meal.height));
  expect(Math.round(note.width)).toBe(Math.round(meal.width));
  await page.screenshot({ path: test.info().outputPath("planner-phone-emoji-card.png") });
});

test("the title is on its own line with the week controls under it; Copy last week is in the calendar and fills only empty slots, with Undo", async ({ page }) => {
  const [recipe, other] = await setup(page, [{ title: "Copy Me", ingredients: [{ name: "zucchini" }] }, { title: "Already There" }]);
  const lastWeek = mondayOf(new Date(Date.now() - 7 * 86400000));
  const thisWeek = mondayOf(new Date());
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: lastWeek, dayOfWeek: 0, mealType: "dinner" } });
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: lastWeek, dayOfWeek: 1, mealType: "dinner" } });
  // This week already has something in Tuesday's supper (a leftover): it must not be replaced.
  await page.request.post("/api/planner", { data: { recipeId: other.id, weekStart: thisWeek, dayOfWeek: 1, mealType: "dinner", isLeftover: true } });
  await openPlanner(page);

  // The title is the same on every week and has a line to itself; the date pill and the sticker are under it.
  const header = page.locator(".phd");
  const title = header.locator(".riso-planner-title");
  await expect(title).toHaveText("This week's menu.");
  const pill = header.locator(".phd-date");
  const pillBox = await pill.boundingBox();
  const titleBox = await title.boundingBox();
  expect(pillBox.y).toBeGreaterThan(titleBox.y + titleBox.height - 2);
  expect(Math.round(pillBox.x)).toBeLessThanOrEqual(Math.round(titleBox.x) + 70);
  await expect(pill).toHaveText(/^[A-Z][a-z]{2} \d{1,2} – (?:[A-Z][a-z]{2} )?\d{1,2}/);
  await expect(header.getByText("this week", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy last week" })).toHaveCount(0); // it lives in the calendar

  // The pill opens the week calendar: three dashes a day, today pink, the shown week yellow.
  await pill.click();
  const calendar = page.getByRole("dialog", { name: "Choose a week" });
  await expect(calendar).toBeVisible();
  await expect(pill).toHaveClass(/open/);
  await expect(calendar.locator(".wcal-day.today")).toHaveCount(1);
  await expect(calendar.locator(".wcal-day.today .wcal-dashes i")).toHaveCount(3);
  await expect(calendar.locator(".wcal-week.selected")).toHaveCount(1);
  // Hovering a planned day shows its meals in a card to the left, with the leftover tag.
  await calendar.locator(".wcal-week.selected .wcal-day").nth(1).hover();
  const preview = calendar.locator(".wcal-preview.beside");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("1 planned");
  await expect(preview).toContainText("Already There");
  await expect(preview.locator(".riso-pill")).toHaveText("leftover");
  const calBox = await calendar.boundingBox();
  const previewBox = await preview.boundingBox();
  expect(previewBox.x + previewBox.width).toBeLessThan(calBox.x);

  // Copy last week, from the calendar's footer: it fills the empty slot only, and says how many.
  const dashesBefore = await calendar.locator(".wcal-dashes i.on").count();
  await calendar.getByRole("button", { name: "Copy last week" }).click();
  const toast = page.getByRole("status").filter({ hasText: "Copied 1 meal from last week" });
  await expect(toast).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(calendar.locator(".wcal-dashes i.on")).toHaveCount(dashesBefore + 1); // the dashes follow the copy
  await expect(cell(page, 0, "dinner").locator(".riso-planner-card-name")).toHaveText("Copy Me");
  await expect(cell(page, 1, "dinner").locator(".riso-planner-card-name")).toHaveText("Already There");
  expect(await weekEntries(page)).toHaveLength(2);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(1);
  await expect(cell(page, 1, "dinner").locator(".riso-planner-card-name")).toHaveText("Already There");

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);

  // Picking a week row opens that week; the sticker then says "↩ this week" and goes back.
  await pill.click();
  await calendar.locator(".wcal-week.selected + .wcal-week").click(); // the week after the shown one
  await expect(calendar).toHaveCount(0);
  await expect(title).toHaveText("This week's menu.");
  await expect(header.getByText("this week", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "↩ this week" }).click();
  await expect(header.getByText("this week", { exact: true })).toBeVisible();

  // With nothing to copy from, Copy last week is off in the calendar.
  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("button", { name: "Previous week" }).click();
  await pill.click();
  await expect(calendar.getByRole("button", { name: "Copy last week" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // The desktop board has no "Make the grocery list" button.
  await expect(page.getByRole("button", { name: /^Make the grocery list/ })).toHaveCount(0);
});

test("the Meal and Protein menus open like the Recipes page menus and filter the results", async ({ page }) => {
  await setup(page, [
    { title: "Chicken Soup", mealSlot: "dinner", ingredients: [{ name: "chicken" }] },
    { title: "Plain Toast", mealSlot: "breakfast", ingredients: [{ name: "bread" }] },
  ]);
  await openPlanner(page);
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(2);

  await page.getByRole("button", { name: /MEAL/ }).click();
  await page.getByRole("option", { name: /^Breakfast/ }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(1);
  await expect(page.locator(".fnd-card", { hasText: "Plain Toast" })).toBeVisible();

  await page.getByRole("button", { name: /PROTEIN/ }).click();
  await page.getByRole("option", { name: "Chicken" }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".fnd-card")).toHaveCount(2);
});

test("every way of adding ends with a message and Undo; dropping on a slot too", async ({ page }) => {
  await setup(page, [{ title: "Toast Tacos" }]);
  await openPlanner(page);
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Toast");
  await scrollBetween(page);

  const day = visibleDay();
  await drag(page, page.locator(".fnd-card", { hasText: "Toast Tacos" }), cell(page, day, "dinner"));
  await expect(cell(page, day, "dinner").locator(".riso-planner-card-name")).toHaveText("Toast Tacos");
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const toast = page.getByRole("status").filter({ hasText: `Added to ${DAYS[day]} · Supper` });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, day, "dinner").locator(".riso-planner-cell-empty")).toBeVisible();
  await expect.poll(async () => (await weekEntries(page)).length).toBe(0);
  // The message goes by itself after five seconds.
  await drag(page, page.locator(".fnd-card", { hasText: "Toast Tacos" }), cell(page, day, "dinner"));
  await expect(page.getByRole("status").filter({ hasText: "Added to" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Added to" })).toHaveCount(0, { timeout: 8000 });
});

test("only one overlay is open at a time", async ({ page }) => {
  const [recipe] = await setup(page, [{ title: "Overlay Pie" }]);
  const day = visibleDay();
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
  await openPlanner(page);

  await cell(page, day, "breakfast").locator(".riso-planner-cell-empty").click();
  await expect(page.getByRole("dialog", { name: /^Add to / })).toHaveCount(1);
  await page.locator(".riso-planner-weekend-tag").click();
  await expect(page.getByRole("dialog", { name: /^Add to / })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "WEEKEND" })).toHaveCount(1);
  await cell(page, day, "dinner").locator(".riso-planner-card").click();
  await expect(page.getByRole("dialog", { name: "WEEKEND" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Overlay Pie" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a card's round button still marks leftover, already have, and the past-fridge-life warning shows", async ({ page }) => {
  const [recipe] = await setup(page, [{ title: "Fridge Stew", fridgeLifeDays: 1 }]);
  const weekStart = mondayOf(new Date());
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: 0, mealType: "dinner" } });
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: 3, mealType: "lunch", isLeftover: true } });
  await openPlanner(page);
  await expect(page.locator(".riso-planner-card-leftover.stale")).toHaveText("⚠ past fridge life");
});
