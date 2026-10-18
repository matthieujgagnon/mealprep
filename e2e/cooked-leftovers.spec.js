import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { addDays, asSavedDay, quebecDay, quebecDayIn } from "./quebec-day.js";
import { langSwitch } from "./account-menu.js";
import { pickCompact } from "./inventory-form.js";

// "I cooked this" (components/CookedView.jsx) from the Planner and Home, and the one
// leftovers system: LEFTOVER items on Inventory's Leftovers shelf, added by hand,
// thawed, planned from the Planner search, and a portion taken off once a planned
// leftover's day has passed. (Cook mode's own door: cook-mode-redesign.spec.js.)

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const todayIndex = () => (new Date().getDay() + 6) % 7;

// Today at this hour (the browser's clock is fixed there), so Home shows supper.
function atHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `cooked+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

const SHAWARMA = {
  title: "Sheet-pan shawarma",
  baseServings: 4,
  fridgeLifeDays: 3,
  instructions: ["Roast: Roast the chicken.", "Serve: Warm the pitas."],
  ingredients: [
    { name: "chicken thighs", quantity: 900, unit: "g" },
    { name: "pitas", quantity: 4, unit: "" },
    { name: "olive oil", quantity: 2, unit: "tbsp" },
    { name: "sumac", quantity: 1, unit: "tsp" },
  ],
};

// The recipe, its Inventory and tonight's supper, through the API.
async function seed(page) {
  const recipe = await (await page.request.post("/api/recipes", { data: SHAWARMA })).json();
  const add = (data) => page.request.post("/api/pantry-inventory", { data });
  await add({ name: "Hauts de cuisse de poulet", quantity: 1.2, unit: "kg", location: "fridge" });
  await add({ name: "Pitas", quantity: 6, unit: "unit", location: "pantry" });
  await add({ name: "Huile d'olive", quantity: 1, unit: "l", location: "pantry" });
  const weekStart = mondayOf(new Date());
  const entry = await (await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: todayIndex(), mealType: "dinner" } })).json();
  return { recipe, entry, weekStart };
}

const inventory = async (page) => (await (await page.request.get("/api/pantry-inventory")).json()).map((i) => `${i.name} ${i.quantity}`).sort();

test("from a planned meal's card: the review list, and the meal leaves the grocery list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  const { entry, weekStart } = await seed(page);
  await page.reload();

  // Sumac isn't in Inventory: it's on the grocery list for tonight's meal. The oil is in
  // Inventory (as « Huile d'olive »): it waits under Already at home instead.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.locator(".riso-row-name", { hasText: /^Sumac$/ })).toHaveCount(1);
  await expect(page.locator(".riso-row-name", { hasText: /^Olive oil$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.locator(".riso-planner-card").first().click();
  await page.getByRole("button", { name: `I cooked ${SHAWARMA.title}` }).click();
  const sheet = page.locator(".ck-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "No leftovers" }).click();

  // Matched in both languages, scaled to the servings, converted to the item's unit.
  const chicken = sheet.getByRole("checkbox", { name: "Take Hauts de cuisse de poulet out of your Inventory" });
  await expect(chicken).toHaveAttribute("aria-checked", "true");
  await expect(chicken).toContainText("− 0.9 kg");
  await expect(chicken).toContainText("0.3 kg left after");
  // Oil is an Inventory item like the rest: listed and switched on.
  const oil = sheet.getByRole("checkbox", { name: "Take Huile d'olive out of your Inventory" });
  await expect(oil).toHaveAttribute("aria-checked", "true");
  await expect(sheet.locator(".ck-shelf", { hasText: "NOT IN YOUR INVENTORY" })).toContainText("sumac");

  // Untick the oil and the pitas: they stay.
  await oil.click();
  await sheet.getByRole("checkbox", { name: "Take Pitas out of your Inventory" }).click();
  await sheet.getByRole("button", { name: "Remove from inventory" }).click();
  await expect(page.getByRole("dialog", { name: "Enjoy your supper" })).toContainText("1 ingredient taken out");
  expect(await inventory(page)).toEqual(["Hauts de cuisse de poulet 0.3", "Huile d'olive 1", "Pitas 6"]);

  // The meal is marked cooked; its ingredients leave the grocery list.
  const week = await (await page.request.get(`/api/planner?week=${weekStart}`)).json();
  expect(week.find((e) => e.id === entry.id).cookedAt).toBeTruthy();
  await page.getByRole("button", { name: "Back to the app" }).click();
  await expect(page.locator(".riso-planner-card-cooked")).toHaveText("✓ Cooked");
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.locator(".riso-row-name", { hasText: /^Chicken thigh/ })).toHaveCount(0);
  await expect(page.locator(".riso-row-name", { hasText: /^Sumac$/ })).toHaveCount(0);
});

// How long a recipe's leftovers keep is set in Edit recipe (the ⋯ menu no longer has it): the form
// shows the days the recipe has, saves a change with the rest of the form, and the finished view's
// Leftovers card then adds leftovers that keep for the new days.
test("Leftovers keep is in Edit recipe: a change there is what the Leftovers card adds to Inventory", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  await page.clock.setFixedTime(atHour(12));
  const { recipe } = await seed(page);
  await page.reload();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: SHAWARMA.title }).first().click();
  const card = page.getByRole("dialog", { name: SHAWARMA.title });
  await card.getByRole("button", { name: "More actions" }).click();
  const menu = card.locator(".riso-rc-menu");
  await expect(menu.getByRole("menuitem", { name: /Leftovers keep/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Edit recipe" }).click();

  const days = page.getByLabel("LEFTOVERS KEEP", { exact: true });
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();
  await expect(days).toHaveValue("3");
  await expect(page.getByText("Used for leftovers in Inventory.")).toBeVisible();
  await page.getByRole("button", { name: "More leftover days" }).click();
  await expect(days).toHaveValue("4");
  await days.fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".riso-rc-facts")).toContainText("Keeps 5 days");
  expect((await (await page.request.get(`/api/recipes/${recipe.id}`)).json()).fridgeLifeDays).toBe(5);

  // The Leftovers card says how long they keep, and adds them for that long. No reload first: a
  // planned meal shows the recipe as it was just saved (the recipe store).
  await page.getByRole("dialog", { name: SHAWARMA.title }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.locator(".riso-planner-card").first().click();
  await page.getByRole("button", { name: `I cooked ${SHAWARMA.title}` }).click();
  const sheet = page.locator(".ck-sheet");
  await expect(sheet.getByText("5 DAYS")).toBeVisible();
  await sheet.getByRole("button", { name: "+ Add to Inventory" }).click();
  await expect
    .poll(async () => (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.isLeftover)?.expiresAt)
    .toBe(asSavedDay(addDays(quebecDay(atHour(12)), 5)));
});

test("from tonight's meal on Home: Not now leaves Inventory as it was, the meal is cooked, and Undo puts it back", async ({ page }) => {
  await signUp(page);
  await page.clock.setFixedTime(atHour(19));
  const { entry, weekStart } = await seed(page);
  await page.reload();
  const before = await inventory(page);

  await page.locator(".riso-home-hero-actions").getByRole("button", { name: `I cooked ${SHAWARMA.title}` }).click();
  const sheet = page.locator(".ck-sheet");
  await expect(sheet.getByRole("heading", { name: "Supper's ready." })).toBeVisible();
  await sheet.getByRole("button", { name: "No leftovers" }).click();
  await sheet.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog", { name: "Enjoy your supper" })).toContainText("Your Inventory was left as it was.");
  await page.getByRole("button", { name: "Stay on this page" }).click();
  await expect(sheet.getByText("Inventory left as it was")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  expect(await inventory(page)).toEqual(before);
  await expect(page.locator(".riso-home-cooked")).toHaveText("✓ Cooked");
  let week = await (await page.request.get(`/api/planner?week=${weekStart}`)).json();
  expect(week.find((e) => e.id === entry.id).cookedAt).toBeTruthy();

  await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
  await expect(async () => {
    week = await (await page.request.get(`/api/planner?week=${weekStart}`)).json();
    expect(week.find((e) => e.id === entry.id).cookedAt).toBeNull();
  }).toPass();
});

// 11 p.m. on Oct 12 in Quebec: already Oct 13 in UTC, which is where a use-by day used to go wrong.
const LATE_EVENING = new Date("2026-10-13T03:00:00Z");

test("leftovers: added by hand on the Leftovers shelf, thawed, and planned from the Planner search", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signUp(page);
  // The clock is frozen late in the Quebec evening, and use-by days are checked as Quebec calendar days.
  await page.clock.setFixedTime(LATE_EVENING);
  const today = quebecDay(LATE_EVENING);
  const recipe = await (await page.request.post("/api/recipes", { data: SHAWARMA })).json();
  await page.request.post("/api/pantry-inventory", {
    data: { name: SHAWARMA.title, quantity: 2, unit: "portion", location: "freezer", isLeftover: true, recipeId: recipe.id, expiresAt: quebecDayIn(60) },
  });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await pickCompact(page);

  const shelf = page.locator('.inv-shelf[data-section-id="leftovers"]');
  await expect(shelf).toContainText(SHAWARMA.title);
  await expect(shelf).toContainText("LEFTOVER");
  await expect(shelf).toContainText("2 portions");

  // Freezer leftovers move to the fridge to thaw (in the item's pop-up): the days
  // left start over with the recipe's fridge time, and Undo puts them back.
  await shelf.locator(".inv-row", { hasText: SHAWARMA.title }).click();
  await page.locator(".riso-itemform").getByRole("button", { name: "Move to fridge to thaw" }).click();
  await expect(page.locator(".riso-toast")).toContainText(`${SHAWARMA.title} is in the fridge: 3 days left`);
  await expect(page.locator(".riso-itemform")).toHaveCount(0);
  let items = await (await page.request.get("/api/pantry-inventory")).json();
  expect(items[0].location).toBe("fridge");
  expect(items[0].expiresAt).toBe(asSavedDay(addDays(today, 3)));
  await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await (await page.request.get("/api/pantry-inventory")).json())[0].location).toBe("freezer");
  await shelf.locator(".inv-row", { hasText: SHAWARMA.title }).click();
  await page.locator(".riso-itemform").getByRole("button", { name: "Move to fridge to thaw" }).click();
  await expect.poll(async () => (await (await page.request.get("/api/pantry-inventory")).json())[0].location).toBe("fridge");

  // Leftovers by hand: the shelf's + opens the item form in its Leftovers mode.
  await shelf.getByRole("button", { name: "Add an item to Leftovers" }).click();
  const form = page.locator(".riso-itemform");
  await expect(form.getByRole("button", { name: "Leftovers", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(form.locator(".riso-itemform-loc-name")).toHaveText(["Fridge", "Freezer"]);
  await form.getByRole("textbox", { name: "Item name" }).fill("Pizza");
  await form.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.locator(".riso-toast")).toContainText("Pizza added to Leftovers");
  await expect(form).toHaveCount(0);
  items = await (await page.request.get("/api/pantry-inventory")).json();
  const pizza = items.find((i) => i.name === "Pizza");
  expect(pizza).toMatchObject({ isLeftover: true, unit: "portion", location: "fridge", quantity: 1 });
  expect(pizza.expiresAt).toBe(asSavedDay(addDays(today, 4)));
  await expect(shelf.locator(".inv-row", { hasText: "Pizza" })).toContainText("4 days left");

  // The Planner search offers both; placing one plans a leftover meal that eats from it.
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator(".fnd-card.leftover")).toHaveCount(2);
  await page.locator(".fnd-card.leftover", { hasText: `Leftovers · ${SHAWARMA.title} · 2 portions` }).locator(".rpc-add").click();
  await page.locator(".riso-picker").getByRole("button", { name: /^Add to / }).click();
  await expect(page.locator(".riso-toast")).toContainText(`Leftovers of ${SHAWARMA.title} added to`);
  const upcoming = await (await page.request.get(`/api/planner/upcoming?from=${today}`)).json();
  const planned = upcoming.find((e) => e.isLeftover);
  expect(planned.leftoverItemId).toBe(items.find((i) => i.recipeId === recipe.id).id);
});

// A fridge leftover typed into Inventory's Leftovers form keeps its 4 days at any hour in Quebec:
// it shows 4 days left and expires on the Quebec day four days on.
test.describe("a fridge leftover added by hand, in a Quebec browser", () => {
  test.use({ viewport: { width: 1280, height: 1000 }, timezoneId: "America/Toronto" });

  for (const [label, at] of [
    ["9 a.m.", "2026-10-12T13:00:00Z"],
    ["3 p.m.", "2026-10-12T19:00:00Z"],
    ["11 p.m.", "2026-10-13T03:00:00Z"],
  ]) {
    test(`at ${label} it shows 4 days left and expires on the right Quebec day`, async ({ page }) => {
      await signUp(page);
      await page.clock.setFixedTime(new Date(at));
      await page.reload();
      await page.getByRole("button", { name: "Inventory", exact: true }).click();
      await pickCompact(page);

      const shelf = page.locator('.inv-shelf[data-section-id="leftovers"]');
      await shelf.getByRole("button", { name: "Add an item to Leftovers" }).click();
      const form = page.locator(".riso-itemform");
      await form.getByRole("textbox", { name: "Item name" }).fill("Pizza");
      await form.getByRole("button", { name: "Add to inventory" }).click();
      await expect(page.locator(".riso-toast")).toContainText("Pizza added to Leftovers");

      const items = await (await page.request.get("/api/pantry-inventory")).json();
      const pizza = items.find((i) => i.name === "Pizza");
      expect(pizza.expiresAt).toBe(asSavedDay(addDays(quebecDay(at), 4)));
      await expect(shelf.locator(".inv-row", { hasText: "Pizza" })).toContainText("4 days left");
    });
  }

  test("the evening before its use-by day it says use by tomorrow, not expired", async ({ page }) => {
    await signUp(page);
    // Use by the 16th. A day typed in is saved as midnight UTC, which is 8 p.m. on the 15th in Quebec.
    await page.request.post("/api/pantry-inventory", {
      data: { name: "Pizza", quantity: 1, unit: "portion", location: "fridge", isLeftover: true, expiresAt: "2026-10-16" },
    });
    await page.clock.setFixedTime(new Date("2026-10-16T01:00:00Z")); // 9 p.m. on the 15th in Quebec
    await page.reload();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await pickCompact(page);
    const card = page.locator('.inv-shelf[data-section-id="leftovers"] .inv-row', { hasText: "Pizza" });
    await expect(card).toContainText("use by tomorrow");
    await expect(card).not.toContainText(/expired/i);
  });

  // The use-by day itself is not expired: it says it expires today, on the Inventory card, in the
  // add/edit form and in Home's Use it up, from the morning to the end of the Quebec evening.
  for (const [label, at] of [
    ["9 a.m.", "2026-10-16T13:00:00Z"],
    ["11 p.m.", "2026-10-17T03:00:00Z"],
  ]) {
    test(`on its use-by day, at ${label}, it says today and is not expired`, async ({ page }) => {
      await signUp(page);
      await page.request.post("/api/pantry-inventory", {
        data: { name: "Pizza", quantity: 1, unit: "portion", location: "fridge", isLeftover: true, expiresAt: "2026-10-16" },
      });
      await page.clock.setFixedTime(new Date(at));
      await page.reload();

      // Home's Use it up lists it as today.
      await expect(page.locator(".riso-useup-row", { hasText: "Pizza" }).locator(".riso-useup-badge")).toHaveText("today!");

      await page.getByRole("button", { name: "Inventory", exact: true }).click();
      await pickCompact(page);
      const card = page.locator('.inv-shelf[data-section-id="leftovers"] .inv-row', { hasText: "Pizza" });
      await expect(card).toContainText("expires today");
      await expect(card).not.toHaveClass(/expired/);
      await expect(card.locator(".inv-expired")).toHaveCount(0);
      await expect(card.locator(".inv-life.pink")).toHaveCount(1);

      await card.click();
      await expect(page.locator(".riso-itemform .riso-itemform-tag")).toHaveText("Today");
    });
  }

  test("in Quebec French it says aujourd'hui on its use-by day, and expiré only the next day", async ({ page }) => {
    await signUp(page);
    await page.request.post("/api/pantry-inventory", {
      data: { name: "Pizza", quantity: 1, unit: "portion", location: "fridge", isLeftover: true, expiresAt: "2026-10-16" },
    });
    // The account's language is saved when the switch is pressed, so it is French after a reload.
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/auth/me") && r.request().method() === "PATCH"),
      langSwitch(page).getByRole("button", { name: "Français" }).click(),
    ]);
    await page.clock.setFixedTime(new Date("2026-10-17T03:00:00Z")); // 11 p.m. on the 16th in Quebec
    await page.reload();
    await expect(page.locator(".riso-useup-row", { hasText: "Pizza" }).locator(".riso-useup-badge")).toHaveText("aujourd'hui!");
    await page.getByRole("button", { name: "Inventaire", exact: true }).click();
    await pickCompact(page);
    const card = page.locator('.inv-shelf[data-section-id="leftovers"] .inv-row', { hasText: "Pizza" });
    await expect(card).toContainText("expire aujourd'hui");
    await expect(card.locator(".inv-expired")).toHaveCount(0);
    await card.click();
    await expect(page.locator(".riso-itemform .riso-itemform-tag")).toHaveText("Aujourd'hui");

    // The next day (the 17th) it is expired.
    await page.clock.setFixedTime(new Date("2026-10-17T13:00:00Z"));
    await page.reload();
    await page.getByRole("button", { name: "Inventaire", exact: true }).click();
    await expect(page.locator('.inv-shelf[data-section-id="leftovers"] .inv-row', { hasText: "Pizza" }).locator(".inv-expired")).toHaveCount(1);
  });
});

test("a planned leftover whose day has passed takes one portion off, once, with Undo", async ({ page }) => {
  await signUp(page);
  const recipe = await (await page.request.post("/api/recipes", { data: SHAWARMA })).json();
  const leftovers = await (
    await page.request.post("/api/pantry-inventory", {
      data: { name: SHAWARMA.title, quantity: 2, unit: "portion", location: "fridge", isLeftover: true, recipeId: recipe.id, expiresAt: quebecDayIn(2) },
    })
  ).json();
  const lastWeek = mondayOf(new Date(Date.now() - 7 * 86400000));
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: lastWeek, dayOfWeek: 6, mealType: "lunch", isLeftover: true, leftoverItemId: leftovers.id } });

  await page.reload();
  await expect(page.locator(".riso-toast")).toContainText(`1 portion of leftovers taken off: ${SHAWARMA.title}`);
  const left = async () => (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.id === leftovers.id)?.quantity;
  expect(await left()).toBe(1);

  await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(left).toBe(2);
  // Counted once: coming back doesn't take it again.
  await page.reload();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  expect(await left()).toBe(2);
});
