import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { quebecDayIn } from "./quebec-day.js";

// The recipe card (design: docs/design/riso-v2-recipe-card/), the one card every
// page opens in one tap: the receipt (To buy, In your Inventory), servings that
// rescale every amount and move what you'd run short of to To buy, the steps on the
// rail with their timers (four states, several at once), the Similar view and ← Back,
// the ⋯ menu with Delete and its Undo, Notes, the phone layout and its French fit.
// No price shows anywhere until Meal pricing ships.

function uniqueEmail(tag = "card") {
  return `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, lang = "en") {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', uniqueEmail(`card-${lang}`));
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  if (lang !== "en") await page.request.patch("/api/auth/me", { data: { locale: lang } });
}

const ing = (name, quantity = null, unit = null, extra = {}) => ({ name, quantity, unit, ...extra });

const SHAWARMA = {
  title: "Card Shawarma",
  baseServings: 4,
  prepTimeMinutes: 15,
  cookTimeMinutes: 30,
  fridgeLifeDays: 3,
  mealSlot: "dinner",
  sourceUrl: "https://example.com/card-shawarma",
  ingredients: [
    ing("chicken thighs", 900, "g", { notes: "boneless" }),
    ing("plain yogurt", 1, "cup"),
    ing("garlic", 4, "clove"),
    ing("spinach", 2, "cup"),
    ing("cucumber", 1),
    ing("fresh parsley", 0.5, "cup"),
    ing("olive oil", 2, "tbsp"),
    ing("salt"),
  ],
  instructions: [
    "Marinate: Stir 2 tbsp of the yogurt with the garlic, coat the chicken thighs and wait 20 minutes.",
    "Roast: Roast the chicken thighs for 5 minutes at 425°F.",
    "Serve: Serve with the cucumber and the parsley.",
  ],
};

async function seed(page, { recipes = [SHAWARMA], inventory = [], onList = [] } = {}) {
  const made = [];
  for (const r of recipes) {
    const res = await page.request.post("/api/recipes", { data: { instructions: ["Cook it."], ...r } });
    made.push(await res.json());
  }
  for (const [name, quantity, unit, days] of inventory) {
    await page.request.post("/api/pantry-inventory", {
      data: { name, quantity, unit, ...(days != null && { expiresAt: quebecDayIn(days) }) }, // in n Quebec days
    });
  }
  for (const name of onList) await page.request.post("/api/grocery-extra-items", { data: { name, quantity: null, unit: null } });
  await page.reload();
  await expect(page.locator(".tab.active")).toBeVisible();
  return made;
}

const KITCHEN = {
  inventory: [
    ["Chicken thighs", 1200, "g", 6],
    ["Plain yogurt", null, null, 10],
    ["Garlic", 10, "clove", 30],
    ["Spinach", 4, "cup", 2],
  ],
  onList: ["cucumber"],
};

async function openFromRecipes(page, title, recipesTab = "Recipes") {
  await page.getByRole("button", { name: recipesTab, exact: true }).click();
  await page.locator(".rpc", { hasText: title }).first().click();
  const card = page.getByRole("dialog", { name: title });
  await expect(card).toBeVisible();
  return card;
}

const buyRow = (page, name) => page.locator(".riso-rc-buy", { hasText: name });
const haveRow = (page, name) => page.locator(".riso-rc-have", { hasText: name });

test("a recipe opens its card in one tap: the receipt, the facts, the buttons, and no price anywhere", async ({ page }) => {
  await signUp(page);
  await seed(page, { recipes: [SHAWARMA, { title: "No Link Soup", ingredients: [ing("leek", 2)], instructions: ["Simmer 10 minutes."] }], ...KITCHEN });
  const card = await openFromRecipes(page, "Card Shawarma");

  await expect(card.locator(".riso-rc-sticker")).toHaveText("2 things to buy");
  await expect(card.locator(".riso-rc-receipt-head")).toContainText("TO BUY · 2");
  await expect(card.locator(".riso-rc-buy-name")).toHaveText(["Cucumber", "Fresh parsley"]);
  // Green ✓: on your grocery list; white +: not.
  await expect(buyRow(page, "Cucumber").locator(".riso-rc-mark")).toHaveClass(/onlist/);
  await expect(buyRow(page, "Cucumber")).toContainText("ON YOUR LIST");
  await expect(buyRow(page, "Fresh parsley").locator(".riso-rc-mark")).toHaveText("+");
  await expect(buyRow(page, "Fresh parsley")).toContainText(/1\/2 cup/i);

  await expect(card.locator(".riso-rc-have-head")).toContainText("In your Inventory · 4");
  await expect(card.locator(".riso-rc-have-name")).toHaveText(["Chicken thighs boneless", "Plain yogurt", "Garlic", /^SpinachUse soon!$/]);
  await expect(haveRow(page, "Chicken thighs").locator(".riso-rc-have-qty")).toHaveText("900 g");
  await expect(haveRow(page, "Garlic").locator(".riso-rc-have-qty")).toHaveText("4 cloves");
  await expect(card.locator(".riso-rc-staples")).toHaveText("Always have: Olive oil and Salt");

  await expect(card.locator(".riso-rc-facts")).toContainText("45 min");
  await expect(card.locator(".riso-rc-facts")).toContainText("Serves 4");
  await expect(card.locator(".riso-rc-facts")).toContainText("Keeps 3 days");
  await expect(card.locator(".riso-rc-actions button, .riso-rc-actions a")).toHaveText(["Start cooking", "Plan", "Similar recipes", "Open full recipe ↗"]);
  await expect(card.getByRole("link", { name: "Open full recipe ↗" })).toHaveAttribute("href", "https://example.com/card-shawarma");
  await expect(card.locator(".riso-rc-back")).toHaveText("← Recipes");

  // Prices wait for Meal pricing: no $ amount and no Prices switch.
  await expect(card).not.toContainText("$");
  await expect(card.getByRole("switch")).toHaveCount(0);

  // A recipe with no link has no "Open full recipe".
  await card.getByRole("button", { name: "Close" }).click();
  const other = await openFromRecipes(page, "No Link Soup");
  await expect(other.getByRole("link", { name: /Open full recipe/ })).toHaveCount(0);
  await expect(other.locator(".riso-rc-sticker")).toHaveText("1 thing to buy");
});

test("servings go one at a time and rescale every amount; what you'd run short of moves to To buy", async ({ page }) => {
  await signUp(page);
  await seed(page, KITCHEN);
  const card = await openFromRecipes(page, "Card Shawarma");
  const plus = card.getByRole("button", { name: "Increase servings" });
  const minus = card.getByRole("button", { name: "Decrease servings" });
  const chicken = haveRow(page, "Chicken thighs").locator(".riso-rc-have-qty");

  await plus.click();
  await expect(card.locator(".riso-rc-stepper-value")).toHaveText("5 servings");
  await expect(card.locator(".riso-rc-facts")).toContainText("Serves 5");
  await expect(chicken).toHaveText("1125 g");
  await expect(card.locator(".riso-rc-step-body").first()).toContainText("Stir 2 1/2 tbsp");
  await expect(card.locator(".riso-rc-step-body").first()).toContainText("wait 20 minutes");

  for (let i = 0; i < 4; i++) await minus.click();
  await expect(card.locator(".riso-rc-stepper-value")).toHaveText("1 serving");
  await expect(minus).toBeDisabled();

  // 8 servings need 1800 g of chicken; Inventory has 1200 g: 600 g more to buy.
  for (let i = 0; i < 7; i++) await plus.click();
  await expect(card.locator(".riso-rc-stepper-value")).toHaveText("8 servings");
  await expect(chicken).toHaveText("1800 g");
  await expect(buyRow(page, "Chicken thighs")).toContainText(/600 g more/i);
  await expect(card.locator(".riso-rc-sticker")).toHaveText("3 things to buy");
  // Its + puts how much more on the grocery list.
  await buyRow(page, "Chicken thighs").locator(".riso-rc-mark").click();
  await expect(buyRow(page, "Chicken thighs").locator(".riso-rc-mark")).toHaveClass(/onlist/);
  const extras = await (await page.request.get("/api/grocery-extra-items")).json();
  expect(extras.find((x) => x.name === "Chicken thighs")).toMatchObject({ quantity: 600, unit: "g" });
});

test("steps: tap one to make it current, tap it again to move on; the current one says what it uses", async ({ page }) => {
  await signUp(page);
  await seed(page, KITCHEN);
  const card = await openFromRecipes(page, "Card Shawarma");
  const head = card.locator(".riso-rc-steps-head");
  await expect(head).toContainText("STEPS · 3");
  await expect(head).toContainText("STEP 1 OF 3");
  await expect(card.locator(".riso-rc-step.current .riso-rc-step-title")).toHaveText("Marinate");
  await expect(card.locator(".riso-rc-step-uses")).toHaveText("USES · 900 g chicken thighs · 1 cup plain yogurt · 4 cloves garlic");

  await card.locator(".riso-rc-step").nth(1).click();
  await expect(head).toContainText("STEP 2 OF 3");
  await expect(card.locator(".riso-rc-step").nth(0)).toHaveClass(/done/);
  await expect(card.locator(".riso-rc-step").nth(0).locator(".riso-rc-dot")).toHaveText("✓");
  await card.locator(".riso-rc-step").nth(1).click();
  await expect(head).toContainText("STEP 3 OF 3");
  await card.locator(".riso-rc-step").nth(2).click();
  await expect(head).toContainText("ALL DONE");
  await expect(card.locator(".riso-rc-step.done")).toHaveCount(3);
  await card.locator(".riso-rc-step").nth(0).click();
  await expect(head).toContainText("STEP 1 OF 3");
});

test("timers: idle, running, paused and done, several at once, and pressing one never moves the step", async ({ page }) => {
  await page.clock.install();
  await signUp(page);
  await seed(page, KITCHEN);
  const card = await openFromRecipes(page, "Card Shawarma");
  const first = card.locator(".riso-rc-step").nth(0).locator(".riso-rc-timer");
  const second = card.locator(".riso-rc-step").nth(1).locator(".riso-rc-timer");
  const pill = (timer) => timer.locator(".riso-rc-timer-pill");

  await expect(pill(first)).toHaveClass(/idle/);
  await expect(pill(first)).toContainText("Start 20 min");
  await expect(first.locator(".riso-rc-timer-reset")).toHaveCount(0);

  await pill(first).click();
  await page.clock.runFor(3000);
  await expect(pill(first)).toHaveClass(/running/);
  await expect(pill(first)).toContainText(/19:5\d/);
  await expect(first.locator(".riso-rc-timer-reset")).toBeVisible();
  // The timer's own press leaves the current step alone.
  await expect(card.locator(".riso-rc-steps-head")).toContainText("STEP 1 OF 3");

  // A second one runs at the same time.
  await pill(second).click();
  await page.clock.runFor(2000);
  await expect(card.locator(".riso-rc-timer-pill.running")).toHaveCount(2);
  await expect(pill(second)).toContainText(/4:5\d/);

  // Paused: it stops where it is.
  await pill(first).click();
  await expect(pill(first)).toHaveClass(/paused/);
  const at = await pill(first).innerText();
  await page.clock.runFor(3000);
  await expect(pill(first)).toHaveText(at);

  // ↺ puts it back to idle.
  await first.locator(".riso-rc-timer-reset").click();
  await expect(pill(first)).toHaveClass(/idle/);

  // Done: Time's up, in green; pressing it starts it again.
  await page.clock.runFor("05:00");
  await expect(pill(second)).toHaveClass(/done/);
  await expect(pill(second)).toContainText("Time's up");
  await pill(second).click();
  await expect(pill(second)).toHaveClass(/running/);
});

test("Similar recipes: leave ingredients out, open one, and ← Back keeps servings, step and timers", async ({ page }) => {
  await page.clock.install();
  await signUp(page);
  await seed(page, {
    ...KITCHEN,
    recipes: [
      SHAWARMA,
      { title: "Souvlaki Bowls", cookTimeMinutes: 35, ingredients: ["chicken thighs", "plain yogurt", "garlic", "cucumber", "fresh parsley"].map((n) => ing(n)) },
      { title: "Garlic Spinach", cookTimeMinutes: 10, ingredients: ["garlic", "spinach"].map((n) => ing(n)) },
      { title: "Cucumber Salad", cookTimeMinutes: 5, ingredients: ["cucumber", "dill"].map((n) => ing(n)) },
      { title: "Chocolate Cake", cookTimeMinutes: 50, ingredients: ["flour", "cocoa"].map((n) => ing(n)) },
    ],
  });
  const card = await openFromRecipes(page, "Card Shawarma");

  // The footer: the top of the same search, most shared first.
  await expect(card.locator(".riso-rc-strip .rpc-strip-name")).toHaveText(["Souvlaki Bowls", "Garlic Spinach", "Cucumber Salad"]);
  await expect(card.locator(".riso-rc-strip .riso-rc-shared").first()).toHaveText("5 SHARED");

  await card.getByRole("button", { name: "Increase servings" }).click();
  await card.locator(".riso-rc-step").nth(1).click();
  await card.locator(".riso-rc-step").nth(1).locator(".riso-rc-timer-pill").click();

  await card.getByRole("button", { name: "Similar recipes" }).click();
  await expect(card.getByRole("heading", { name: "Similar recipes" })).toBeVisible();
  await expect(card.locator(".riso-rc-sim-banner-title")).toHaveText("Uses the same ingredients as Card Shawarma");
  await expect(card.locator(".riso-rc-sim-chip")).toHaveText(["Chicken thighs", "Plain yogurt", "Garlic", "Spinach", "Cucumber", "Fresh parsley"]);
  await expect(card.getByText("3 RECIPES SHARE ITS INGREDIENTS")).toBeVisible();
  await expect(card.getByText("TAP AN INGREDIENT TO LEAVE IT OUT")).toBeVisible();

  // Leaving cucumber out drops the salad that only shared it.
  await card.locator(".riso-rc-sim-chip", { hasText: "Cucumber" }).click();
  await expect(card.locator(".riso-rc-sim-chip", { hasText: "Cucumber" })).toHaveClass(/off/);
  await expect(card.getByText("1 LEFT OUT")).toBeVisible();
  await expect(card.getByText("2 RECIPES SHARE ITS INGREDIENTS")).toBeVisible();
  await expect(card.locator(".riso-rc-sim-card .rpc-title")).toHaveText(["Souvlaki Bowls", "Garlic Spinach"]);

  await page.clock.runFor(2000);
  await card.getByRole("button", { name: "← Back to Card Shawarma" }).click();
  await expect(card.locator(".riso-rc-stepper-value")).toHaveText("5 servings");
  await expect(card.locator(".riso-rc-steps-head")).toContainText("STEP 2 OF 3");
  await expect(card.locator(".riso-rc-timer-pill.running")).toContainText(/4:[45]\d/);

  // A similar recipe opens its own card.
  await card.getByRole("button", { name: "Similar recipes" }).click();
  await card.locator(".riso-rc-sim-card", { hasText: "Garlic Spinach" }).getByRole("button").click();
  await expect(page.getByRole("dialog", { name: "Garlic Spinach" })).toBeVisible();
});

test("the ⋯ menu, and Delete with Undo: the recipe is only deleted once the message is gone", async ({ page }) => {
  await signUp(page);
  await seed(page, { recipes: [SHAWARMA, { title: "Keep Me", ingredients: [ing("leek")] }] });
  let card = await openFromRecipes(page, "Card Shawarma");
  await card.getByRole("button", { name: "More actions" }).click();
  const menu = card.locator(".riso-rc-menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Plan around this", "Edit recipe", "View original ↗", "Move to Imported", "Delete recipe"]);
  await card.locator(".riso-rc-menu-catcher").click();
  await expect(menu).toHaveCount(0);

  // Delete: gone at once, Undo brings it back.
  await card.getByRole("button", { name: "More actions" }).click();
  await menu.getByRole("menuitem", { name: "Delete recipe" }).click();
  await expect(page.getByRole("dialog", { name: "Card Shawarma" })).toHaveCount(0);
  await expect(page.locator(".rpc", { hasText: "Card Shawarma" })).toHaveCount(0);
  const toast = page.locator(".riso-toast");
  await expect(toast).toContainText("Deleted “Card Shawarma”.");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".rpc", { hasText: "Card Shawarma" })).toBeVisible();
  expect((await (await page.request.get("/api/recipes")).json()).some((r) => r.title === "Card Shawarma")).toBe(true);

  // Delete and let the message go: now it is deleted for good.
  card = await openFromRecipes(page, "Card Shawarma");
  await card.getByRole("button", { name: "More actions" }).click();
  await menu.getByRole("menuitem", { name: "Delete recipe" }).click();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  await expect
    .poll(async () => (await (await page.request.get("/api/recipes")).json()).filter((r) => !r.isPlaceholder).map((r) => r.title))
    .toEqual(["Keep Me"]);
});

test("notes are saved with the recipe", async ({ page }) => {
  await signUp(page);
  await seed(page);
  let card = await openFromRecipes(page, "Card Shawarma");
  await card.getByPlaceholder("Add a note for next time").fill("Less salt, more lemon.");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Card Shawarma" })).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/recipes")).json()).find((r) => r.title === "Card Shawarma")?.notes).toBe("Less salt, more lemon.");
  card = await openFromRecipes(page, "Card Shawarma");
  await expect(card.getByPlaceholder("Add a note for next time")).toHaveValue("Less salt, more lemon.");
});

test("the grocery marks, Add to grocery list, and I have it (which asks first)", async ({ page }) => {
  await signUp(page);
  await seed(page, KITCHEN);
  const card = await openFromRecipes(page, "Card Shawarma");
  const parsley = buyRow(page, "Fresh parsley");

  await parsley.locator(".riso-rc-mark").click();
  await expect(parsley.locator(".riso-rc-mark")).toHaveClass(/onlist/);
  await expect(parsley).toContainText("ON YOUR LIST");
  await parsley.locator(".riso-rc-mark").click();
  await expect(page.locator(".riso-toast")).toContainText("Fresh parsley taken off your grocery list");
  await expect(parsley.locator(".riso-rc-mark")).not.toHaveClass(/onlist/);

  await card.getByRole("button", { name: "Add to grocery list" }).click();
  await expect(page.locator(".riso-toast")).toContainText("1 item added to the grocery list.");
  await expect(card.locator(".riso-rc-all-listed")).toContainText("On your grocery list. View list →");

  // I have it: the Inventory confirmation sheet first; Cancel adds nothing.
  await parsley.locator(".riso-rc-buy-main").click();
  await parsley.getByRole("button", { name: "I have it" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to Inventory" });
  await expect(sheet).toBeVisible();
  // Escape closes the sheet, not the card under it.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(card).toBeVisible();
  const items = await (await page.request.get("/api/pantry-inventory")).json();
  expect(items.some((i) => /parsley/i.test(i.name))).toBe(false);
});

test("every page opens this card in one tap: Planner, Makeable, Home and Grocery", async ({ page }) => {
  await signUp(page);
  const [recipe] = await seed(page, { ...KITCHEN, recipes: [SHAWARMA, { title: "Leek Soup", mealSlot: "dinner", ingredients: [ing("leek", 2)] }] });
  const monday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const today = (new Date().getDay() + 6) % 7;
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: monday, dayOfWeek: today, mealType: "dinner" } });
  await page.reload();
  const card = page.getByRole("dialog", { name: "Card Shawarma" });
  const close = async () => {
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toHaveCount(0);
  };

  // Home: a meal in the week strip.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.locator(".riso-home-week-day, .riso-home-week-meal", { hasText: "Card Shawarma" }).first().click();
  await expect(card).toBeVisible();
  await expect(card.locator(".riso-rc-back")).toHaveText("← Home");
  await close();

  // Planner: a result in the search panel.
  const soup = page.getByRole("dialog", { name: "Leek Soup" });
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("textbox", { name: "Title, ingredient or tag" }).fill("Leek");
  await page.locator(".fnd-card .rpc-open", { hasText: "Leek Soup" }).click();
  await expect(soup).toBeVisible();
  await expect(soup.locator(".riso-rc-back")).toHaveText("← Planner");
  await soup.getByRole("button", { name: "Close" }).click();
  await expect(soup).toHaveCount(0);

  // Makeable: the card's photo.
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.locator(".mkc", { hasText: "Leek Soup" }).first().locator(".rpc-open").click();
  await expect(soup).toBeVisible();
  await expect(soup.locator(".riso-rc-back")).toHaveText("← Makeable");
  await soup.getByRole("button", { name: "Close" }).click();
  await expect(soup).toHaveCount(0);

  // Grocery, By recipe: the recipe's name.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await page.getByRole("button", { name: "By recipe" }).click();
  await page.getByRole("button", { name: "Card Shawarma", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card.locator(".riso-rc-back")).toHaveText("← Grocery");
});

test("the photo gallery flips with the arrow keys and has a clear × to close", async ({ page }) => {
  await signUp(page);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://example.com/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  const photos = ["https://example.com/a.png", "https://example.com/b.png", "https://example.com/c.png"];
  await seed(page, { recipes: [{ title: "Gallery Test", photoUrl: photos[0], photos, ingredients: [ing("quokka beans")] }] });
  const card = await openFromRecipes(page, "Gallery Test");

  const count = card.locator(".riso-rc-photo-count");
  await expect(count).toHaveText("1 / 3 PHOTOS");
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText("2 / 3 PHOTOS");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(count).toHaveText("3 / 3 PHOTOS");

  await count.click();
  const viewer = page.getByRole("dialog", { name: "Photos" });
  await expect(viewer.getByRole("button", { name: "Close photos" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".rc-lightbox-count")).toHaveText("1 / 3");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(card).toBeVisible();
  await count.click();
  await viewer.getByRole("button", { name: "Close photos" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(card).toBeVisible();
});

test.describe("on a phone (390), in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one column, the bar fixed at the bottom, the timer under its step, Similar in the card, and nothing cut", async ({ page }) => {
    await signUp(page, "fr");
    await seed(page, {
      ...KITCHEN,
      recipes: [SHAWARMA, { title: "Souvlaki", ingredients: ["chicken thighs", "garlic", "cucumber"].map((n) => ing(n)) }],
    });
    const card = await openFromRecipes(page, "Card Shawarma", "Recettes");

    const bar = card.locator(".riso-rc-bottombar");
    await expect(bar.getByRole("button")).toHaveText(["Commencer à cuisiner", "Planifier"]);
    await expect.poll(async () => {
      const box = await bar.boundingBox();
      return Math.round(box.y + box.height);
    }).toBe(844);
    await expect(card.locator(".riso-rc-actions").getByRole("button")).toHaveText(["Recettes similaires"]);
    await expect(card.locator(".riso-rc-actions").getByRole("link")).toHaveText("Recette complète ↗");
    await expect(card.locator(".riso-rc-photo .riso-rc-sticker")).toHaveText("2 articles à acheter");
    // The timer sits under the step's text.
    await expect(card.locator(".riso-rc-step").nth(0).locator(".riso-rc-step-text .riso-rc-timer-pill")).toContainText("Démarrer 20 min");
    await card.locator(".riso-rc-step").nth(0).locator(".riso-rc-timer-pill").click();
    await expect(card.locator(".riso-rc-step").nth(0).locator(".riso-rc-timer-pill")).toHaveClass(/running/);

    expect(await fitProblems(page)).toEqual([]);

    await card.getByRole("button", { name: "Recettes similaires" }).click();
    await expect(card.locator(".riso-rc-sim-banner-title")).toHaveText("Utilise les mêmes ingrédients");
    await expect(bar).toHaveCount(0);
    expect(await fitProblems(page)).toEqual([]);
    await card.getByRole("button", { name: "← Retour à la recette" }).click();
    await expect(card.locator(".riso-rc-step").nth(0).locator(".riso-rc-timer-pill")).toHaveClass(/running/);
  });
});

// Whether every button, chip and pill of the card fits its box at 390 px (the French
// words are the long ones), and the page never scrolls sideways.
function fitProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const card = document.querySelector(".riso-rc-card");
    const cardBox = card.getBoundingClientRect();
    for (const el of card.querySelectorAll("button, a, .riso-rc-sticker, .riso-rc-shared, .riso-rc-use-soon")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const name = el.getAttribute("aria-label") || el.textContent.trim();
      if (el.scrollWidth > el.clientWidth + 1) out.push(`"${name}" cuts its text`);
      // The footer's cards scroll sideways on purpose.
      if (!el.closest(".riso-rc-strip-cards") && (r.left < cardBox.left - 1 || r.right > cardBox.right + 1)) out.push(`"${name}" sticks out of the card`);
    }
    if (document.documentElement.scrollWidth > 390) out.push("the page scrolls sideways");
    return out;
  });
}
