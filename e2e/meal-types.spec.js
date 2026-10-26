import { expect, mondayAfter, specNow, test, thisMonday, todayIndex } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { chooseMealType } from "./recipe-form.js";
import { quebecDayIn } from "./quebec-day.js";

// A recipe is several meal types at once and can be « Plat préparé » (croissants: a breakfast AND
// nothing to cook). Covers: Chow Mein as a lunch and a supper found under both and counted once;
// a recipe that cannot be saved without a type; Makeable's Meals (breakfast, lunch, supper, not
// prepared) hiding a prepared recipe until the toggle; the Recipes toggle changing only the count; a
// prepared recipe had by a prepared Inventory meal of that name (and by nothing else); the grocery
// list; the day-passes step with its Undo; the sort sheet (banner, guesses marked, Not now,
// Confirm, an import landing in it); and the French phone-width checks. Frozen to far-past days so
// "a day has passed" holds whatever day it is run.

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `meal-types+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  if (french) await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
}

const post = async (page, url, data) => (await page.request.post(url, { data })).json();
const recipe = (page, title, ingredients, extra = {}) =>
  post(page, "/api/recipes", { title, instructions: ["Do it."], ingredients: ingredients.map((name) => ({ name, quantity: 2, unit: "unit" })), ...extra });
const inventory = (page, data) => post(page, "/api/pantry-inventory", { quantity: 4, unit: "unit", location: "freezer", expiresAt: quebecDayIn(30, specNow()), ...data });
const recipesOf = async (page) => (await page.request.get("/api/recipes")).json();
const find = async (page, title) => (await recipesOf(page)).find((r) => r.title === title);
const stockOf = async (page, name) => (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === name);

const go = async (page, name) => {
  await page.goto("/");
  await page.getByRole("button", { name, exact: true }).first().click();
};
const eyebrow = (page) => page.locator(".riso-recipes-heading .riso-eyebrow");
const toggle = (page) => page.getByRole("button", { name: /^(Include sides, desserts and prepared|Inclure accompagnements, desserts et plats préparés)$/ });
const mealMenu = (page) => page.locator(".rv2-chips").getByRole("button", { name: /^(MEAL|REPAS)/ });

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("Chow Mein as a lunch and a supper: found under both, counted once, and the card says Lunch +1", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chow Mein", ["noodles", "cabbage"], { mealSlots: ["dinner"] });
    await recipe(page, "Tomato soup", ["tomatoes"], { mealSlots: ["dinner"] });
    await go(page, "Recipes");

    // Open Chow Mein's editor and turn Lunch on too.
    await page.locator(".rpc", { hasText: "Chow Mein" }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit recipe" }).click();
    const chips = page.locator("#re-slots .re-slot");
    await expect(chips.nth(2)).toHaveAttribute("aria-checked", "true"); // Supper, as it was
    await chips.nth(1).click(); // Lunch
    await expect(chips.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#re-slots + .re-help")).toContainText("lunch, supper");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".riso-rc-title")).toHaveText("Chow Mein");
    await page.keyboard.press("Escape");

    const saved = await find(page, "Chow Mein");
    expect(saved.mealSlots).toEqual(["lunch", "dinner"]);
    expect(saved.mealSlot).toBe("lunch"); // the old column follows the first

    // Recipes: under Lunch and under Supper, once in the totals, and the small card says the first type and +1.
    await go(page, "Recipes");
    await mealMenu(page).click();
    await expect(page.getByRole("option", { name: /^Lunch · 1$/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Supper · 2$/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^All · 2$/ })).toBeVisible(); // two recipes, not three placements
    await page.getByRole("option", { name: /^Lunch/ }).click();
    await expect(page.locator(".rpc-title")).toHaveText(["Chow Mein"]);
    await expect(page.locator(".rpc", { hasText: "Chow Mein" }).locator(".rpc-cap-meal")).toHaveText("Lunch +1");
    await mealMenu(page).click();
    await page.getByRole("option", { name: /^Supper/ }).click();
    await expect.poll(async () => (await page.locator(".rpc-title").allTextContents()).sort()).toEqual(["Chow Mein", "Tomato soup"]);
    await expect(eyebrow(page)).toContainText("2 RECIPES");

    // The finder (Makeable's page, the same Meal menu as the Planner's search) offers it for either.
    await page.getByRole("button", { name: "Makeable", exact: true }).click();
    for (const meal of [/^Lunch/, /^Supper/]) {
      await page.getByRole("button", { name: /^MEAL/ }).click();
      await page.getByRole("option", { name: meal }).click();
      await expect(page.locator(".mk-page .rpc-title", { hasText: "Chow Mein" })).toHaveCount(1);
    }
  });

  test("a recipe cannot be saved without a meal type", async ({ page }) => {
    await signUp(page);
    await go(page, "Recipes");
    await page.getByRole("button", { name: "+ New recipe" }).click();
    await page.fill('input[placeholder="Grandma\'s lasagna"]', "No type yet");
    await expect(page.locator("#re-slots .re-slot.on")).toHaveCount(0);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("alert")).toContainText("Pick at least one meal type first.");
    expect(await find(page, "No type yet")).toBeUndefined();
    // Any number of types can be on; with one on, it saves.
    await page.locator("#re-slots .re-slot").nth(0).click();
    await page.locator("#re-slots .re-slot").nth(1).click();
    await page.locator("#re-slots .re-slot").nth(0).click();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await find(page, "No type yet")).mealSlots).toEqual(["lunch"]);
    // The server refuses an empty list too.
    const made = await find(page, "No type yet");
    const res = await page.request.put(`/api/recipes/${made.id}`, { data: { mealSlots: [] } });
    expect(res.status()).toBe(400);
  });

  test("Croissants tagged prepared: Makeable hides it until the toggle; Recipes shows it with the tag and the toggle only changes the count", async ({ page }) => {
    await signUp(page);
    await inventory(page, { name: "Croissants", isPreparedMeal: true });
    await recipe(page, "Croissants", ["croissants"], { mealSlots: ["breakfast"] });
    await recipe(page, "Oatmeal", ["oats"], { mealSlots: ["breakfast"] });
    await inventory(page, { name: "Oats", isPreparedMeal: false, location: "pantry" });

    // Not tagged yet: an ordinary recipe. A prepared meal in Inventory is never an ingredient, so it is not had.
    await go(page, "Makeable");
    await expect(page.locator(".mk-page .rpc-title", { hasText: "Oatmeal" })).toHaveCount(1);
    await expect(page.locator(".fnd-sec.ready .rpc-title", { hasText: "Croissants" })).toHaveCount(0);

    // Tag it: Recipes > Croissants > Edit > Prepared meal switch.
    await go(page, "Recipes");
    await page.locator(".rpc", { hasText: "Croissants" }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit recipe" }).click();
    // A one-ingredient recipe looks like a prepared meal: said, not switched on for you.
    await expect(page.getByText("Looks like a prepared meal.")).toBeVisible();
    const switchEl = page.getByRole("switch", { name: "Prepared meal" });
    await expect(switchEl).toHaveAttribute("aria-checked", "false");
    await switchEl.click();
    await expect(switchEl).toHaveAttribute("aria-checked", "true");
    // Ink (#16181F) when on, not the blue of "you have it" (after its short colour change).
    await expect.poll(() => switchEl.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(22, 24, 31)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".riso-rc-title")).toHaveText("Croissants");
    await expect(page.locator(".riso-rc-facts .prepared-tag")).toBeVisible(); // the L tag leads the facts row in the pop-out
    await page.keyboard.press("Escape");
    expect((await find(page, "Croissants")).isPrepared).toBe(true);

    // Recipes: still listed, with the shared tag; the count line has Oatmeal and the prepared Croissants (had by the prepared meal) only with the toggle.
    await go(page, "Recipes");
    await expect(page.locator(".rpc", { hasText: "Croissants" }).locator(".prepared-tag")).toBeVisible();
    await expect(page.locator(".rpc")).toHaveCount(2);
    await expect(eyebrow(page)).toContainText("1 MAKEABLE NOW");
    await toggle(page).click();
    await expect(eyebrow(page)).toContainText("2 MAKEABLE NOW");
    await expect(page.locator(".rpc")).toHaveCount(2); // the list is never narrowed by it
    await toggle(page).click();
    await expect(eyebrow(page)).toContainText("1 MAKEABLE NOW");

    // Makeable: Meals only by default; the toggle (the same setting) brings the prepared recipe back, ready, with the tag.
    await page.getByRole("button", { name: "Makeable", exact: true }).click();
    await expect(page.locator(".mk-page .rpc-title", { hasText: "Croissants" })).toHaveCount(0);
    await toggle(page).click();
    await expect(page.locator(".fnd-sec.ready .rpc", { hasText: "Croissants" }).locator(".prepared-tag")).toBeVisible();
    // Prepared is a Meal-menu choice of its own.
    await page.getByRole("button", { name: /^MEAL/ }).click();
    await page.getByRole("option", { name: /^Prepared/ }).click();
    await expect(page.locator(".mk-page .rpc-title")).toHaveText(["Croissants"]);

    // Meals still means breakfast, lunch, supper and not prepared.
    await go(page, "Recipes");
    await mealMenu(page).click();
    await page.getByRole("option", { name: /^Meals · 1$/ }).click();
    await expect(page.locator(".rpc-title")).toHaveText(["Oatmeal"]);
  });

  test("a prepared recipe is had only by a prepared meal of that name, and its ingredient stays on the grocery list until then", async ({ page }) => {
    await signUp(page);
    const croissants = await recipe(page, "Croissants", ["croissants"], { mealSlots: ["breakfast"], isPrepared: true });
    await inventory(page, { name: "Croissants" }); // an ingredient of that name is not it
    await post(page, "/api/planner", { recipeId: croissants.id, weekStart: "2099-01-05", dayOfWeek: 1, mealType: "breakfast" });
    await go(page, "Grocery");
    await expect(page.locator(".riso-group .riso-row", { hasText: "Croissant" })).toHaveCount(1);
    await expect(page.getByText("Already at home")).toHaveCount(0);

    // The prepared meal in Inventory: the row goes under Already at home.
    await inventory(page, { name: "Croissants", isPreparedMeal: true });
    await go(page, "Grocery");
    await expect(page.locator(".riso-group .riso-row", { hasText: "Croissant" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Already at home/ })).toBeVisible();
  });

  test("when a planned prepared recipe's day passes, one box comes off the prepared meal, with a message and Undo", async ({ page }) => {
    await signUp(page);
    const croissants = await recipe(page, "Croissants", ["croissants"], { mealSlots: ["breakfast"], isPrepared: true });
    const meal = await inventory(page, { name: "Croissants", isPreparedMeal: true, quantity: 4 });
    const weekStart = mondayAfter(-4); // a Wednesday a month ago: the day has passed whatever day the test runs
    const entry = await post(page, "/api/planner", { recipeId: croissants.id, weekStart, dayOfWeek: 2, mealType: "breakfast" });

    await page.goto("/"); // the app opens: the day has passed
    const toast = page.getByText(/1 meal taken off your Inventory: Croissants/);
    await expect(toast).toBeVisible();
    await expect.poll(async () => (await stockOf(page, "Croissants")).quantity).toBe(3);
    const settled = (await (await page.request.get(`/api/planner?week=${weekStart}`)).json()).find((e) => e.id === entry.id);
    expect(settled.cookedAt).not.toBeNull();

    // Undo puts the box back; the meal stays settled, so it is not taken again.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await stockOf(page, "Croissants")).quantity).toBe(4);
    await page.goto("/");
    await page.waitForTimeout(800);
    expect((await stockOf(page, "Croissants")).quantity).toBe(4);
    expect((await stockOf(page, "Croissants")).id).toBe(meal.id);
  });

  test("a recipe with no meal type yet: a banner and a sheet with guesses marked, Not now changes nothing, Confirm sorts them", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Fluffy pancakes", ["flour", "eggs", "milk"]);
    await recipe(page, "Pickled shallots", ["shallots", "vinegar"]);
    await recipe(page, "Croissants", ["croissants"]);
    await recipe(page, "Matt's thing", ["mystery", "other"]);
    await go(page, "Recipes");

    const banner = page.locator(".riso-recipes-sortbanner");
    await expect(banner).toContainText("4 recipes have no meal type yet.");
    await banner.getByRole("button", { name: "Sort them" }).click();
    const sheet = page.locator(".riso-sortsheet");
    await expect(sheet).toBeVisible();
    const row = (title) => sheet.locator(".riso-sortsheet-row", { hasText: title });
    const on = (title) => row(title).locator(".re-slot.on");

    // Guesses from the titles and ingredients (rules, no AI), marked as guesses.
    await expect(on("Fluffy pancakes")).toHaveText(["✓ Breakfast"]);
    await expect(on("Pickled shallots")).toHaveText(["✓ Pantry / Prep"]);
    await expect(on("Croissants")).toHaveText(["✓ Breakfast", "✓ Prepared meal"]);
    await expect(on("Matt's thing")).toHaveCount(0); // the rules cannot decide: left to the person
    await expect(sheet.locator(".riso-sortsheet-guess")).toHaveCount(3);
    await expect(sheet.getByRole("button", { name: "Confirm 3 recipes" })).toBeVisible();

    // Not now changes nothing.
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toHaveCount(0);
    expect((await recipesOf(page)).every((r) => r.mealSlots.length === 0 && r.isPrepared === false)).toBe(true);
    await expect(banner).toContainText("4 recipes");

    // Confirm: pancakes get a second type, then the three are saved; the fourth stays.
    await banner.getByRole("button", { name: "Sort them" }).click();
    await row("Fluffy pancakes").getByRole("checkbox", { name: "Lunch" }).click();
    await expect(row("Fluffy pancakes").locator(".riso-sortsheet-guess")).toHaveCount(0); // touched: no longer a guess
    await sheet.getByRole("button", { name: "Confirm 3 recipes" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText("3 recipes sorted")).toBeVisible();
    expect((await find(page, "Fluffy pancakes")).mealSlots).toEqual(["breakfast", "lunch"]);
    expect(await find(page, "Pickled shallots")).toMatchObject({ mealSlots: ["prep"], isPrepared: false });
    expect(await find(page, "Croissants")).toMatchObject({ mealSlots: ["breakfast"], isPrepared: true });
    expect((await find(page, "Matt's thing")).mealSlots).toEqual([]);
    await expect(banner).toContainText("1 recipe has no meal type yet.");

    // The last one is picked by hand.
    await banner.getByRole("button", { name: "Sort them" }).click();
    await expect(sheet.getByRole("button", { name: "Confirm 0 recipes" })).toBeDisabled();
    await row("Matt's thing").getByRole("checkbox", { name: "Supper" }).click();
    await sheet.getByRole("button", { name: "Confirm 1 recipe" }).click();
    await expect(banner).toHaveCount(0);
    expect((await find(page, "Matt's thing")).mealSlots).toEqual(["dinner"]);
  });

  test("an import lands in the sort sheet", async ({ page }) => {
    await signUp(page);
    // The importer reaches the real web: here it hands back a recipe saved with no type, as an import is.
    await page.route("**/api/recipes/import", async (route) => {
      const made = await recipe(page, "Imported crêpes", ["farine", "oeufs", "lait"], { inCookbook: false });
      await route.fulfill({ json: made });
    });
    await go(page, "Recipes");
    await page.locator(".rv2-searchpill input").fill("https://example.com/crepes");
    await page.getByRole("button", { name: "Import recipe" }).click();
    const sheet = page.locator(".riso-sortsheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".riso-sortsheet-row", { hasText: "Imported crêpes" }).locator(".re-slot.on")).toHaveText(["✓ Breakfast"]);
    await sheet.getByRole("button", { name: "Confirm 1 recipe" }).click();
    await expect(sheet).toHaveCount(0);
    expect((await find(page, "Imported crêpes")).mealSlots).toEqual(["breakfast"]);
  });
});

// French, on a phone: the chips, the switch and the new tag fit, and the page does not scroll sideways.
test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  test("the editor's chips and the Plat préparé switch fit", async ({ page }) => {
    await signUp(page, { french: true });
    await go(page, "Recettes");
    await page.getByRole("button", { name: "+ Nouvelle recette" }).click();
    const sheet = page.getByRole("dialog", { name: "Nouvelle recette." });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const chips = sheet.locator("#re-slots .re-slot");
    await expect(chips).toHaveCount(7);
    const sheetBox = await sheet.boundingBox();
    for (const chip of await chips.all()) {
      const b = await chip.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(sheetBox.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
    }
    await chips.nth(1).click();
    await chips.nth(2).click();
    await expect(chips.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(chips.nth(2)).toHaveAttribute("aria-checked", "true");
    const row = sheet.locator(".riso-itemform-prepared-row");
    await row.scrollIntoViewIfNeeded();
    const rowBox = await row.boundingBox();
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
    await expect(row.locator(".prepared-tag")).toHaveText("plat préparé");
    expect(await row.locator(".prepared-tag").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await noSideScroll(page);
  });

  test("the sort sheet fits in French", async ({ page }) => {
    await signUp(page, { french: true });
    await recipe(page, "Crêpes bretonnes", ["farine", "oeufs", "lait"]);
    await recipe(page, "Croissants", ["croissants"]);
    await go(page, "Recettes");
    await page.locator(".riso-recipes-sortbanner").getByRole("button", { name: "Les trier" }).click();
    const sheet = page.locator(".riso-sortsheet");
    await expect(sheet.locator(".riso-sortsheet-guess").first()).toHaveText("à confirmer");
    await expect(sheet.getByRole("button", { name: "Plus tard" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Confirmer 2 recettes" })).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    for (const chip of await sheet.locator(".re-slot").all()) {
      const b = await chip.boundingBox();
      expect(b.x + b.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
    }
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await noSideScroll(page);
  });

  test("a prepared recipe on the 104px Planner card holds the whole tag, in French", async ({ page }) => {
    await signUp(page, { french: true });
    const croissants = await recipe(page, "Croissants au beurre", ["croissants"], { mealSlots: ["breakfast"], isPrepared: true });
    await post(page, "/api/planner", { recipeId: croissants.id, weekStart: thisMonday(), dayOfWeek: todayIndex(), mealType: "breakfast" });
    await page.goto("/");
    await page.getByRole("button", { name: "Planificateur", exact: true }).first().click();
    const card = page.locator(".pmb-cell .riso-planner-card", { has: page.locator(".prepared-tag") });
    await expect(card).toHaveCount(1);
    const cardBox = await card.boundingBox();
    expect([Math.round(cardBox.width), Math.round(cardBox.height)]).toEqual([104, 104]);
    const tag = card.locator(".prepared-tag");
    await expect(tag).toHaveText("plat préparé");
    const tagBox = await tag.boundingBox();
    expect(tagBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
    expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    expect(await tag.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await noSideScroll(page);
  });
});
