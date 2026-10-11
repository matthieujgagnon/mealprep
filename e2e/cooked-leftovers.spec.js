import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

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
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

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

test("from a planned meal's card: the review list, Running low, and the meal leaves the grocery list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  const { entry, weekStart } = await seed(page);
  await page.reload();

  // Sumac isn't in Inventory: it's on the grocery list for tonight's meal.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.locator(".riso-row-name", { hasText: /^Sumac$/ })).toHaveCount(1);

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
  // An "always have" item is listed, switched off, with Running low.
  const oil = sheet.getByRole("checkbox", { name: "Take Huile d'olive out of your Inventory" });
  await expect(oil).toHaveAttribute("aria-checked", "false");
  await expect(sheet.locator(".ck-shelf", { hasText: "NOT IN YOUR INVENTORY" })).toContainText("sumac");
  await oil.getByRole("button", { name: "Running low" }).click();
  await expect(page.locator(".riso-toast")).toContainText("Huile d'olive is on your grocery list");
  await expect(oil.getByRole("button", { name: "✓ On the list" })).toBeDisabled();
  const extras = await (await page.request.get("/api/grocery-extra-items")).json();
  expect(extras.map((e) => e.name)).toEqual(["Huile d'olive"]);

  // Untick the pitas: they stay.
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

test("leftovers: added by hand on the Leftovers shelf, thawed, and planned from the Planner search", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signUp(page);
  const recipe = await (await page.request.post("/api/recipes", { data: SHAWARMA })).json();
  await page.request.post("/api/pantry-inventory", {
    data: { name: SHAWARMA.title, quantity: 2, unit: "portion", location: "freezer", isLeftover: true, recipeId: recipe.id, expiresAt: daysFromNow(60) },
  });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  const shelf = page.locator('.inv-shelf[data-section-id="leftovers"]');
  await expect(shelf).toContainText(SHAWARMA.title);
  await expect(shelf).toContainText("LEFTOVER");
  await expect(shelf).toContainText("2 portions");

  // Freezer leftovers move to the fridge to thaw: the days left start over with the recipe's fridge time.
  await shelf.getByRole("button", { name: "Move to fridge to thaw" }).click();
  await expect(page.locator(".riso-toast")).toContainText(`${SHAWARMA.title} is in the fridge: 3 days left`);
  await expect(shelf.getByRole("button", { name: "Move to fridge to thaw" })).toHaveCount(0);
  let items = await (await page.request.get("/api/pantry-inventory")).json();
  expect(items[0].location).toBe("fridge");
  expect(Math.round((new Date(items[0].expiresAt) - Date.now()) / 86400000)).toBe(3);

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
  expect(Math.round((new Date(pizza.expiresAt) - Date.now()) / 86400000)).toBe(4);

  // The Planner search offers both; placing one plans a leftover meal that eats from it.
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator(".fnd-card.leftover")).toHaveCount(2);
  await page.locator(".fnd-card.leftover", { hasText: `Leftovers · ${SHAWARMA.title} · 2 portions` }).locator(".rpc-add").click();
  await page.locator(".riso-picker").getByRole("button", { name: /^Add to / }).click();
  await expect(page.locator(".riso-toast")).toContainText(`Leftovers of ${SHAWARMA.title} added to`);
  const upcoming = await (await page.request.get(`/api/planner/upcoming?from=${new Date().toISOString().slice(0, 10)}`)).json();
  const planned = upcoming.find((e) => e.isLeftover);
  expect(planned.leftoverItemId).toBe(items.find((i) => i.recipeId === recipe.id).id);
});

test("a planned leftover whose day has passed takes one portion off, once, with Undo", async ({ page }) => {
  await signUp(page);
  const recipe = await (await page.request.post("/api/recipes", { data: SHAWARMA })).json();
  const leftovers = await (
    await page.request.post("/api/pantry-inventory", {
      data: { name: SHAWARMA.title, quantity: 2, unit: "portion", location: "fridge", isLeftover: true, recipeId: recipe.id, expiresAt: daysFromNow(2) },
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
