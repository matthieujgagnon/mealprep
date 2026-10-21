import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

// A recipe lives in one place, the recipe store (client/src/lib/recipeStore.js), and every
// planned meal shows it through `useLiveEntries`. These tests save, delete and put back a
// recipe and look at the pages that hold planned meals (the Planner, Home, Grocery) without
// ever reloading: before the store, the Planner kept the recipe as it was loaded and Home and
// Grocery kept a deleted recipe's meals until you left and came back.

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
  await page.fill('input[type="email"]', `store+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

const TITLE = "Store shawarma";
const RECIPE = {
  title: TITLE,
  baseServings: 4,
  mealSlots: ["dinner"], // a recipe is not saved again without a meal type (Edit recipe)
  fridgeLifeDays: 3,
  instructions: ["Roast: Roast the chicken.", "Serve: Warm the pitas."],
  ingredients: [
    { name: "chicken thighs", quantity: 900, unit: "g" },
    { name: "pitas", quantity: 4, unit: "" },
    { name: "sumac", quantity: 1, unit: "tsp" },
  ],
};

// The recipe, planned for tonight's supper, through the API; the app is then loaded with both.
async function seed(page) {
  const recipe = await (await page.request.post("/api/recipes", { data: RECIPE })).json();
  await page.request.post("/api/planner", {
    data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner" },
  });
  await page.reload();
  return recipe;
}

// Edit recipe from the recipes page: a new title and Leftovers keep 5 days, saved with the form.
async function editRecipe(page, newTitle) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: TITLE }).first().click();
  const card = page.getByRole("dialog", { name: TITLE });
  await card.getByRole("button", { name: "More actions" }).click();
  await card.locator(".riso-rc-menu").getByRole("menuitem", { name: "Edit recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', newTitle);
  await page.getByLabel("LEFTOVERS KEEP", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  const saved = page.getByRole("dialog", { name: newTitle });
  await expect(saved.locator(".riso-rc-facts")).toContainText("Keeps 5 days");
  await saved.getByRole("button", { name: "Close" }).click();
  await expect(saved).toHaveCount(0);
}

test("a recipe saved in Edit recipe is the new one on the Planner card and in the finished view, with no reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  await page.clock.setFixedTime(atHour(12));
  await seed(page);
  const edited = `${TITLE}, saved`;
  await editRecipe(page, edited);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  const planned = page.locator(".riso-planner-card").first();
  await expect(planned).toContainText(edited);
  await planned.click();
  await expect(page.locator(".riso-plannedcard-name")).toHaveText(edited);

  // The finished view is opened from the Planner's own copy of the meal: it says 5 days, not 3.
  await page.getByRole("button", { name: `I cooked ${edited}` }).click();
  await expect(page.locator(".ck-sheet").getByText("5 DAYS")).toBeVisible();
  await expect(page.locator(".ck-sheet").getByText("3 DAYS")).toHaveCount(0);
});

test("Home and Cook mode show the saved recipe at once", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  await page.clock.setFixedTime(atHour(19));
  await seed(page);
  const edited = `${TITLE}, saved`;
  await editRecipe(page, edited);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const hero = page.locator(".riso-home-hero");
  await expect(hero.locator(".riso-home-hero-title")).toHaveText(edited);
  await expect(page.locator(".riso-home-week-day-title", { hasText: edited })).toHaveCount(1);

  await hero.getByRole("button", { name: "Start cooking" }).click();
  await page.getByRole("dialog", { name: edited }).getByRole("button", { name: "Start cooking" }).click();
  await expect(page.locator(".cm-recipe-title")).toHaveText(edited);
});

test("deleting a recipe takes its meals off Home, Grocery and the Planner at once, and Undo puts them back on every page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  await page.clock.setFixedTime(atHour(19));
  const recipe = await seed(page);
  const toast = page.locator(".riso-toast");
  const sumac = page.locator(".riso-row-name", { hasText: /^Sumac$/ });

  // Delete from the card opened on Home: the card goes, and so does tonight's meal under it.
  await expect(page.locator(".riso-home-hero-title")).toHaveText(TITLE);
  await page.locator(".riso-home-hero").getByRole("button", { name: "Start cooking" }).click();
  const card = page.getByRole("dialog", { name: TITLE });
  await card.getByRole("button", { name: "More actions" }).click();
  await card.locator(".riso-rc-menu").getByRole("menuitem", { name: "Delete recipe" }).click();
  await expect(toast).toContainText(`Deleted “${TITLE}”.`);
  await expect(page.locator(".riso-home-hero-title", { hasText: TITLE })).toHaveCount(0);
  await expect(page.locator(".riso-home-week-day-title", { hasText: TITLE })).toHaveCount(0);

  // Still on the server for these five seconds, yet Grocery and the Planner do not show it.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.locator(".riso-grocery-loading-row")).toHaveCount(0);
  await expect(sumac).toHaveCount(0);
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-planner-card")).toHaveCount(0);

  // Undo: the meal is back on the Planner, in Grocery and on Home, with no reload.
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".riso-planner-card", { hasText: TITLE })).toHaveCount(1);
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(sumac).toHaveCount(1);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".riso-home-hero-title")).toHaveText(TITLE);
  expect((await (await page.request.get(`/api/recipes/${recipe.id}`)).json()).title).toBe(TITLE);
});

test("a deleted recipe stays off every page once the delete has gone through", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUp(page);
  await page.clock.setFixedTime(atHour(19));
  const recipe = await seed(page);

  await page.locator(".riso-home-hero").getByRole("button", { name: "Start cooking" }).click();
  const card = page.getByRole("dialog", { name: TITLE });
  await card.getByRole("button", { name: "More actions" }).click();
  await card.locator(".riso-rc-menu").getByRole("menuitem", { name: "Delete recipe" }).click();
  await expect(page.locator(".riso-toast")).toBeVisible();
  await expect(page.locator(".riso-toast")).toHaveCount(0, { timeout: 8000 });
  await expect.poll(async () => (await page.request.get(`/api/recipes/${recipe.id}`)).status()).toBe(404);

  await expect(page.locator(".riso-home-hero-title", { hasText: TITLE })).toHaveCount(0);
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.locator(".riso-row-name", { hasText: /^Sumac$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-planner-card")).toHaveCount(0);
});
