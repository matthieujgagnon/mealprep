import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// The Makeable page, Riso v2 (designs: docs/design/riso-v2-makeable and, for the
// cards, docs/design/riso-v2-recipe-cards): the shared Finder as a page. Sections
// by what is missing from Inventory (planned recipes only in Meals of the week),
// the photo card with its pink use-soon strip, tickable pills, sale marks that
// open the shared deal card, buttons that change with the situation, À acheter and
// the ticks on the real grocery list with Undo, and the shared pop-out and slot picker.

const prisma = new PrismaClient();
test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function signUp(page, tag) {
  const email = `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  return email;
}

// Recipes: [title, ingredients, extra]; inventory: a name, or [name, days to use-by].
// Returns the recipes by title.
async function seed(page, recipes, inventory) {
  const made = {};
  for (const [title, ingredients, extra] of recipes) {
    const res = await page.request.post("/api/recipes", {
      data: { title, instructions: ["Cook it."], ingredients: ingredients.map((name) => ({ name })), ...extra },
    });
    made[title] = await res.json();
  }
  for (const item of inventory) {
    const [name, days] = Array.isArray(item) ? item : [item, null];
    // An hour short of whole days, because the app counts days rounding up.
    const expiresAt = days == null ? undefined : new Date(Date.now() + days * 86400000 - 3600000).toISOString();
    await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge", ...(expiresAt && { expiresAt }) } });
  }
  await page.reload();
  return made;
}

async function openMakeable(page) {
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await expect(page.locator(".mk-title")).toBeVisible();
}

const card = (page, title) => page.locator(".mkc", { has: page.locator(".rpc-title", { hasText: title }) });

test("sections by what is missing; planned recipes only in Meals of the week; nothing to buy has a green outline", async ({ page }) => {
  await signUp(page, "makeable-sections");
  const made = await seed(
    page,
    [
      ["Riso Pancakes", ["flour", "egg"]],
      ["Riso Soup", ["chicken", "carrot", "celery"]],
      ["Riso Stew", ["lamb", "quince", "barley", "turnip"]],
      ["Riso Planned", ["flour", "egg"], { mealSlot: "dinner" }],
      ["Riso Brownies", ["flour", "egg"], { mealSlot: "dessert" }],
    ],
    ["flour", "egg", "chicken", "carrot"]
  );
  // Planned this week (Sunday is never in the past).
  await page.request.post("/api/planner", { data: { recipeId: made["Riso Planned"].id, weekStart: mondayOf(new Date()), dayOfWeek: 6, mealType: "dinner" } });
  await page.reload();
  await openMakeable(page);

  // Meals only, until pantry and sides are included: the dessert is out of every section.
  await expect(page.locator(".fnd-sec-title")).toHaveText(["Meals of the week", "Ready now", "One or two short", "Needs a shop"]);
  await expect(page.locator(".fnd-sec.ready .rpc-title")).toHaveText(["Riso Pancakes"]);
  await expect(page.locator(".fnd-sec.few .rpc-title")).toHaveText(["Riso Soup"]);
  await expect(page.locator(".fnd-sec.shop .rpc-title")).toHaveText(["Riso Stew"]);
  await expect(page.getByText("Riso Brownies")).toHaveCount(0);

  // In your week starts closed; planned recipes are not repeated in the other sections.
  await expect(page.locator(".fnd-sec.week .mkc")).toHaveCount(0);
  await expect(page.locator(".fnd-sec.week .fnd-sec-count")).toHaveText("1");
  await page.locator(".fnd-sec.week .fnd-sec-toggle").click();
  await expect(page.locator(".fnd-sec.week .rpc-title")).toHaveText(["Riso Planned"]);
  await expect(page.locator(".fnd-sec.ready").getByText("Riso Planned")).toHaveCount(0);

  // The green outline is for nothing to buy.
  await expect(card(page, "Riso Pancakes")).toHaveClass(/is-ready/);
  await expect(card(page, "Riso Pancakes")).toHaveCSS("border-top-color", "rgb(16, 201, 92)");
  await expect(card(page, "Riso Soup")).toHaveCSS("border-top-color", "rgb(22, 24, 31)");

  // Include pantry and sides brings the dessert back (the same setting as every page).
  await page.getByRole("button", { name: "Include pantry and sides" }).click();
  await expect(page.locator(".fnd-sec.ready .rpc-title")).toHaveCount(2);
  await expect(page.locator(".fnd-sec.ready").getByText("Riso Brownies")).toBeVisible();
});

test("the four states: buttons, pills (proteins left), the bar, and cards keep their own height", async ({ page }) => {
  await signUp(page, "makeable-states");
  await seed(
    page,
    [
      ["Riso Ready", ["egg", "spinach"], { baseServings: 4, mealSlot: "dinner", prepTimeMinutes: 25 }],
      ["Riso Two Short", ["egg", "spinach", "parsley", "leeks"], { baseServings: 2 }],
      ["Riso Needs Shop", ["egg", "beef", "quince", "barley", "turnip"]],
    ],
    ["egg", "spinach"]
  );
  await openMakeable(page);

  const ready = card(page, "Riso Ready");
  await expect(ready.locator(".mkc-btn")).toHaveText(["Cook", "Plan"]);
  await expect(ready.locator(".mkc-btn").first()).toHaveClass(/main/);
  await expect(ready.locator(".mkc-buy")).toHaveCount(0); // nothing to buy: no list, no empty gap
  await expect(ready.locator(".mkc-serves")).toHaveText("Serves 4");
  await expect(ready.locator(".mkc-progress span").nth(0)).toHaveText("2/2 ingredients");
  await expect(ready.locator(".mkc-progress span").nth(1)).toHaveText("Complete");
  await expect(ready.locator(".rpc-caption")).toHaveText("Supper · 25 MIN");

  const few = card(page, "Riso Two Short");
  await expect(few.locator(".mkc-btn")).toHaveText(["To buy", "Plan"]);
  await expect(few.locator(".mkc-btn").first()).toHaveClass(/main/);
  await expect(few.locator(".mkc-pill")).toHaveCount(2);
  await expect(few.locator(".mkc-progress span").nth(1)).toHaveText("2 missing");

  const shop = card(page, "Riso Needs Shop");
  await expect(shop.locator(".mkc-btn")).toHaveText(["Plan", "To buy"]); // it can't be cooked yet: no Cook
  await expect(shop.locator(".mkc-btn").first()).toHaveClass(/main/);
  // The protein is in the left column, everything else in the right one.
  const cols = shop.locator(".mkc-col");
  await expect(cols.nth(0).locator(".mkc-pill-name")).toHaveText(["beef"]);
  await expect(cols.nth(1).locator(".mkc-pill-name")).toHaveText(["quince", "barley", "turnip"]);

  // Cards keep their natural height: a card with more on it is taller.
  const heights = await page.locator(".mkc").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBeGreaterThan(1);
});

test("ticks and À acheter change the real grocery list, with Undo, and Grocery agrees", async ({ page }) => {
  await signUp(page, "makeable-grocery");
  await seed(page, [["Riso Grocery Dish", ["salmon", "broccoli", "leeks"]]], ["salmon"]);
  await openMakeable(page);

  const dish = card(page, "Riso Grocery Dish");
  const tick = (name) => dish.getByRole("button", { name: new RegExp(`(Add|Take) ${name} (to|off)`) });
  await expect(dish.locator(".mkc-pill")).toHaveCount(2);

  // One tick puts that item on the list; ticking again takes it off with the shared Undo toast.
  await tick("broccoli").click();
  await expect(tick("broccoli")).toHaveAttribute("aria-pressed", "true");
  await expect(tick("broccoli")).toHaveText("✓");
  await tick("broccoli").click();
  const off = page.getByRole("status").filter({ hasText: "taken off your grocery list" });
  await expect(off).toBeVisible();
  await off.getByRole("button", { name: "Undo" }).click();
  await expect(tick("broccoli")).toHaveAttribute("aria-pressed", "true");

  // À acheter adds what is not there yet (just the leeks), says so with Undo, and turns into ✓ Added.
  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  const added = page.getByRole("status").filter({ hasText: "1 item added to the grocery list." });
  await expect(added).toBeVisible();
  await expect(dish.getByRole("button", { name: "✓ Added" })).toHaveClass(/done/);
  await expect(dish.getByRole("link", { name: "Undo" })).toHaveCount(0); // no separate Undo link on the card
  await added.getByRole("button", { name: "Undo" }).click();
  await expect(tick("leeks")).toHaveAttribute("aria-pressed", "false");
  await expect(tick("broccoli")).toHaveAttribute("aria-pressed", "true"); // Undo took off only what it had added
  await expect(dish.getByRole("button", { name: "To buy", exact: true })).toBeVisible();

  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  await expect(dish.getByRole("button", { name: "✓ Added" })).toBeVisible();

  // Grocery shows the same two items; taking one off there is seen here.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("Broccoli", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Leek", { exact: false })).toHaveCount(1);
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await page.waitForLoadState("networkidle"); // the grocery list is re-read on a tab change; let it settle first
  await expect(dish.getByRole("button", { name: "✓ Added" })).toBeVisible();
});

test("at most four pills, then +N that opens the recipe; À acheter still adds everything", async ({ page }) => {
  await signUp(page, "makeable-more");
  await seed(page, [["Riso Big Shop", ["kale", "leeks", "parsnip", "radish", "turnip", "quince"]]], []);
  await openMakeable(page);
  const dish = card(page, "Riso Big Shop");
  await expect(dish.locator(".mkc-pill:not(.mkc-more)")).toHaveCount(4);
  await expect(dish.locator(".mkc-more")).toHaveText("+2");
  await dish.getByRole("button", { name: "To buy", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "6 items added to the grocery list." })).toBeVisible();

  await dish.locator(".mkc-more").click();
  await expect(page.getByRole("dialog", { name: "Riso Big Shop" })).toBeVisible();
});

test("the strip shows only for something expiring in 3 days or less, with the days written out", async ({ page }) => {
  await signUp(page, "makeable-soon");
  await seed(
    page,
    [
      ["Riso Soon Salad", ["celery", "chickpeas"]],
      ["Riso Tomorrow Salad", ["radish", "chickpeas"]],
      ["Riso Today Salad", ["fennel", "chickpeas"]],
      ["Riso Later Salad", ["lettuce", "chickpeas"]],
    ],
    [["celery", 2], ["radish", 1], ["fennel", 0], ["lettuce", 5], "chickpeas"]
  );
  await openMakeable(page);
  await expect(card(page, "Riso Soon Salad").locator(".mkc-soon")).toHaveText("Celery expires in 2 days");
  await expect(card(page, "Riso Tomorrow Salad").locator(".mkc-soon")).toHaveText("Radish expires in 1 day");
  await expect(card(page, "Riso Today Salad").locator(".mkc-soon")).toHaveText("Fennel expires today");
  await expect(card(page, "Riso Later Salad").locator(".mkc-soon")).toHaveCount(0); // 5 days: no strip
  await expect(card(page, "Riso Soon Salad").locator(".mkc-soon")).toHaveCSS("background-color", "rgb(255, 233, 245)");
});

test("sale marks come only from real deals, open the shared deal card, and Show sales is on to begin with", async ({ page }) => {
  const email = await signUp(page, "makeable-sales");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seed(page, [["Riso Mango Chicken", ["mangoes", "quokka beans", "chicken"]]], ["chicken"]);
  const base = { userId: user.id, source: "Flipp", category: "produce", unitBasis: "each", isCurrent: true };
  const deals = await Promise.all([
    prisma.flyerDeal.create({ data: { ...base, store: "Maxi", item: "Mangoes", matchName: "mangoes", price: "$1.50", unitPrice: 1.5, regularPrice: 2.49 } }),
    // In the flyer at its regular price: not a sale.
    prisma.flyerDeal.create({ data: { ...base, store: "IGA", item: "Quokka beans", matchName: "quokka beans", price: "$2.99", unitPrice: 2.99 } }),
  ]);
  await page.reload();
  await openMakeable(page);

  const dish = card(page, "Riso Mango Chicken");
  const sales = page.getByRole("button", { name: "Show sales", exact: true });
  await expect(sales).toHaveAttribute("aria-pressed", "true");
  await expect(dish.locator(".mkc-sale")).toHaveCount(1);
  await expect(dish.locator(".mkc-pill", { hasText: "mangoes" }).locator(".mkc-sale")).toBeVisible();
  await expect(dish.locator(".mkc-pill", { hasText: "quokka beans" }).locator(".mkc-sale")).toHaveCount(0);
  await expect(dish.locator(".mkc-salesum")).toHaveText("%1 on sale");

  // The mark opens the same deal card as Flyers and Grocery, with its own way to the Flyers page.
  await dish.locator(".mkc-sale").click();
  const detail = page.locator(".riso-deal-detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator(".riso-deal-detail-name")).toHaveText("Mangoes");
  await expect(dish.locator(".mkc-sale")).toHaveClass(/open/);

  // Its list button is the same grocery list as the tick.
  await detail.getByRole("button", { name: "+ Add to grocery list" }).click();
  await expect(dish.getByRole("button", { name: /^Take mangoes off/ })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByRole("button", { name: "✓ On your grocery list" })).toBeVisible();

  await detail.getByRole("button", { name: "See in Flyers →" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Flyers");
  await expect(page.locator(".riso-deal-detail-name")).toHaveText("Mangoes");
  expect(deals[0].id).toBeTruthy();

  // Back on Makeable, turning Show sales off hides the marks and the count; the choice is remembered.
  await page.keyboard.press("Escape");
  await openMakeable(page);
  await page.getByRole("button", { name: "Show sales", exact: true }).click();
  await expect(dish.locator(".mkc-sale")).toHaveCount(0);
  await expect(dish.locator(".mkc-salesum")).toHaveCount(0);
  await page.reload();
  await openMakeable(page);
  await expect(page.getByRole("button", { name: "Show sales", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("tapping the photo or the title opens the pop-out; Cook opens the recipe card; Plan opens the slot picker", async ({ page }) => {
  await signUp(page, "makeable-popout");
  const made = await seed(page, [["Riso Plan Dish", ["salmon"]], ["Riso Cook Dish", ["salmon", "leeks"]]], ["salmon"]);
  await openMakeable(page);

  // The photo and the title are one tap target.
  await card(page, "Riso Plan Dish").locator(".rpc-open").click();
  const pop = page.getByRole("dialog", { name: "Riso Plan Dish" });
  await expect(pop.locator(".fnd-pop-actions button")).toHaveText(["Plan", "Similar recipes", "Open the full recipe →"]);
  await page.keyboard.press("Escape");

  // Plan on the card: the shared slot picker.
  await card(page, "Riso Plan Dish").getByRole("button", { name: "Plan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await picker.getByRole("button", { name: "Next week" }).click();
  await picker.getByRole("button", { name: /^Add to .*Supper$/ }).click();
  const nextWeek = mondayOf(new Date(Date.now() + 7 * 86400000));
  await expect
    .poll(async () => (await (await page.request.get(`/api/planner?week=${nextWeek}`)).json()).map((e) => e.recipe?.id))
    .toEqual([made["Riso Plan Dish"].id]);

  // Cook on a ready card: the recipe's card on the Recipes page.
  await card(page, "Riso Plan Dish").getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.locator(".riso-rc-actions")).toBeVisible();
});

test("Similar recipes (from the pop-out) sets the base on this page; cards say what they share", async ({ page }) => {
  await signUp(page, "makeable-similar");
  await seed(
    page,
    [
      ["Riso Lemon Chicken", ["chicken", "lemon", "garlic"]],
      ["Riso Lemon Fish", ["cod", "lemon"]],
      ["Riso Porridge", ["oats", "milk"]],
    ],
    ["chicken", "lemon", "garlic", "cod", "oats", "milk"]
  );
  await openMakeable(page);

  await card(page, "Riso Lemon Chicken").locator(".rpc-open").click();
  await page.getByRole("dialog", { name: "Riso Lemon Chicken" }).getByRole("button", { name: "Similar recipes" }).click();
  const banner = page.locator(".fnd-main");
  await expect(banner).toContainText("Riso Lemon Chicken");
  await expect(page.locator(".tab.active")).toHaveText("Makeable");
  await expect(page.locator(".fnd-results-title")).toHaveText("Recipes similar to Riso Lemon Chicken");
  await expect(page.locator(".mkc .rpc-title")).toHaveText(["Riso Lemon Fish"]);
  await expect(card(page, "Riso Lemon Fish").locator(".mkc-reason")).toHaveText("shares lemon");
  await expect(banner.getByRole("button", { name: "Cancel" })).toHaveCount(0);

  // The X closes it and the page is whole again.
  await banner.getByRole("button", { name: "Close the Main meal" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".mkc .rpc-title")).toHaveCount(3);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one card per row with touch sizes; the chip row is sticky; no sideways scroll", async ({ page }) => {
    await signUp(page, "makeable-phone");
    const names = ["parsley", "leeks", "kale", "radish", "turnip", "quince"];
    await seed(
      page,
      [["Riso Phone One", ["salmon", ...names.slice(0, 2)]], ["Riso Phone Two", ["salmon", ...names.slice(2)]], ["Riso Phone Three", ["salmon", "beef"]], ["Riso Phone Four", ["salmon", "lamb"]]],
      ["salmon"]
    );
    await openMakeable(page);

    // One card per row, the full width.
    const columns = await page.locator(".fnd-sec.few .fnd-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The four designed chips first, then the others, in one line.
    const chips = page.locator(".fnd-chips");
    await expect(chips).toBeVisible();
    const labels = await chips.locator("button").evaluateAll((els) => els.map((e) => ({ text: e.innerText.trim(), left: Math.round(e.getBoundingClientRect().left), h: Math.round(e.getBoundingClientRect().height) })));
    const byPlace = labels.sort((a, b) => a.left - b.left);
    expect(byPlace.slice(0, 4).map((l) => l.text)).toEqual(["All", "Ready now", "1 or 2 short", "Quick"]);
    expect(byPlace.slice(4).map((l) => l.text)).toEqual(["Expiring soon", "Show sales"]);
    expect(new Set(labels.map((l) => l.h))).toEqual(new Set([40]));

    // Touch sizes: pills 40px, buttons 44px, the tick and the % keep a 40px tap area.
    const dish = card(page, "Riso Phone One");
    await dish.scrollIntoViewIfNeeded();
    expect(await dish.locator(".mkc-pill").first().evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(40);
    expect(await dish.locator(".mkc-btn").first().evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(44);
    const tickBox = await dish.locator(".mkc-tick").first().boundingBox();
    expect(tickBox.width).toBeGreaterThanOrEqual(26);
    const hits = await dish.locator(".mkc-tick").first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const at = (x, y) => document.elementFromPoint(x, y)?.closest(".mkc-tick") === el;
      return [at(cx - 19, cy), at(cx + 19, cy), at(cx, cy - 19), at(cx, cy + 19)];
    });
    expect(hits).toEqual([true, true, true, true]);

    // Scrolling down keeps the chips pinned right under the app header.
    await page.evaluate(() => window.scrollTo(0, 1200));
    const header = await page.locator(".app-header").evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
    const top = await chips.evaluate((e) => Math.round(e.getBoundingClientRect().top));
    expect(Math.abs(top - header)).toBeLessThanOrEqual(8);
    await expect(chips).toBeInViewport();
  });
});
