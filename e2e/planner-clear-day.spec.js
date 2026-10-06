import { expect, test } from "@playwright/test";

// Fix batch 4: "Clear" under a day on the Planner (desktop and phone), and the
// quieter Recipes cards (no have-bar, one small "to buy" line, more recipe info).

const todayIndex = () => (new Date().getDay() + 6) % 7;

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function setup(page, lang) {
  if (lang) await page.addInitScript((l) => localStorage.setItem("mealprep-lang", l), lang);
  await page.goto("/");
  await page.getByRole("button", { name: /^(Sign up|Créer un compte|S'inscrire)$/ }).click();
  await page.fill('input[type="email"]', `clear+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.locator("form button[type=submit], form .riso-btn").last().click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

const post = (page, url, data) => page.request.post(url, { data }).then((r) => r.json());
const weekEntries = async (page, week) => (await page.request.get(`/api/planner?week=${week}`)).json();

async function seedPlan(page) {
  const week = mondayOf(new Date());
  const today = todayIndex();
  const chicken = await post(page, "/api/recipes", {
    title: "Roast chicken with lemon and herbs",
    baseServings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 45,
    mealSlot: "dinner",
    ingredients: [{ name: "chicken" }, { name: "lemon" }],
    instructions: ["Roast it."],
  });
  await post(page, "/api/planner", { recipeId: chicken.id, weekStart: week, dayOfWeek: today, mealType: "dinner", isLeftover: true });
  await post(page, "/api/planner/blank", { weekStart: week, dayOfWeek: today, mealType: "lunch", note: "Eating out" });
  await post(page, "/api/planner/blank", { weekStart: week, dayOfWeek: today, mealType: "breakfast" });
  if (today > 0) await post(page, "/api/planner", { recipeId: chicken.id, weekStart: week, dayOfWeek: 0, mealType: "dinner" });
  return { week, today, chicken };
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("Clear under a day empties it with Undo, and hides on empty and past days", async ({ page }) => {
    await setup(page);
    const { week, today } = await seedPlan(page);
    await page.reload();
    await page.getByRole("button", { name: "Planner", exact: true }).first().click();
    await expect(page.locator(".riso-planner-day-header")).toHaveCount(7);

    // One Clear: today. Other days are empty, and Monday (past, when it is not
    // Monday) has a meal but no button.
    await expect(page.locator(".riso-planner-clear")).toHaveCount(1);
    await expect(page.locator(".riso-planner-clear")).toHaveText("Clear");
    await page.screenshot({ path: test.info().outputPath("desktop-en-planner-clear.png") });

    await page.locator(".riso-planner-clear").click();
    await expect.poll(async () => (await weekEntries(page, week)).filter((e) => e.dayOfWeek === today).length).toBe(0);
    if (today > 0) expect((await weekEntries(page, week)).filter((e) => e.dayOfWeek === 0)).toHaveLength(1);
    await expect(page.locator(".riso-planner-clear")).toHaveCount(0);
    const toast = page.getByRole("status").filter({ hasText: "cleared" });
    await expect(toast).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("desktop-en-planner-cleared-toast.png") });

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await weekEntries(page, week)).filter((e) => e.dayOfWeek === today).length).toBe(3);
    const back = (await weekEntries(page, week)).filter((e) => e.dayOfWeek === today);
    expect(back.find((e) => e.mealType === "dinner").isLeftover).toBe(true);
    expect(back.find((e) => e.mealType === "lunch").recipe.title).toBe("Eating out");
    await expect(page.locator(".riso-planner-clear")).toHaveCount(1);
  });

  test("Recipes cards: no have-bar, one small to-buy line, time, servings, meal type and protein; same height in a row", async ({ page }) => {
    await setup(page);
    await seedPlan(page);
    await post(page, "/api/recipes", { title: "Plain toast", mealSlot: "breakfast", baseServings: 1, ingredients: [{ name: "bread" }], instructions: ["Toast."] });
    await post(page, "/api/recipes", {
      title: "A very long recipe title that goes on and on and on across several lines of the card",
      mealSlot: "lunch",
      baseServings: 2,
      prepTimeMinutes: 10,
      ingredients: [{ name: "beef" }],
      instructions: ["Cook."],
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();

    const cards = page.locator(".riso-recipe-card");
    await expect(cards).toHaveCount(3);
    await expect(page.locator(".riso-recipe-card-havebar, .riso-recipe-card-havelabel")).toHaveCount(0);

    const chicken = cards.filter({ hasText: "Roast chicken" });
    await expect(chicken.locator(".riso-pill.tone-yellow")).toContainText("1 h");
    await expect(chicken).toContainText("Serves 4");
    await expect(chicken).toContainText("Supper");
    await expect(chicken).toContainText(/chicken/i);
    await expect(chicken.locator(".rv2-card-buy")).toHaveText("2 to buy");

    // Same height for every card in a row.
    const boxes = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ y: Math.round(r.y), h: Math.round(r.height) })));
    const firstRow = boxes.filter((b) => b.y === boxes[0].y);
    expect(firstRow.length).toBeGreaterThan(1);
    expect(new Set(firstRow.map((b) => b.h)).size).toBe(1);
    await page.locator(".rv2-grid").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: test.info().outputPath("desktop-en-recipes-cards.png") });
  });
});

test.describe("phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("« Vider » sits at the bottom of the day's column, under supper; the Recipes cards stay the same height", async ({ page }) => {
    await setup(page, "fr");
    const { week, today } = await seedPlan(page);
    await page.reload();
    await page.getByRole("button", { name: "Planificateur", exact: true }).first().click();
    await expect(page.locator(".rpm-board")).toBeVisible();

    await expect(page.locator(".rpm-clear")).toHaveCount(1);
    await expect(page.locator(".rpm-clear")).toHaveText("Vider");
    // Under supper: lower than the supper cell of the same day.
    const clear = await page.locator(".rpm-clear").boundingBox();
    const supper = await page.locator(".rpm-mealrow").nth(2).locator(".rpm-cell").nth(today).boundingBox();
    expect(clear.y).toBeGreaterThan(supper.y + supper.height - 1);
    expect(Math.abs(clear.x + clear.width / 2 - (supper.x + supper.width / 2))).toBeLessThan(6);
    await page.locator(".rpm-clear").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("phone-fr-planner-clear.png") });

    await page.locator(".rpm-clear").click();
    await expect.poll(async () => (await weekEntries(page, week)).filter((e) => e.dayOfWeek === today).length).toBe(0);
    const toast = page.getByRole("status").filter({ hasText: "vidée" });
    await expect(toast).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("phone-fr-planner-cleared-toast.png") });
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect.poll(async () => (await weekEntries(page, week)).filter((e) => e.dayOfWeek === today).length).toBe(3);

    await post(page, "/api/recipes", { title: "Pain grillé", mealSlot: "breakfast", baseServings: 1, ingredients: [{ name: "pain" }], instructions: ["Griller."] });
    await page.reload();
    await page.getByRole("button", { name: "Recettes", exact: true }).first().click();
    const cards = page.locator(".riso-recipe-card");
    await expect(cards).toHaveCount(2);
    const boxes = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ y: Math.round(r.y), h: Math.round(r.height), right: r.right })));
    expect(new Set(boxes.filter((b) => b.y === boxes[0].y).map((b) => b.h)).size).toBe(1);
    expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(390);
    await page.locator(".rv2-grid").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: test.info().outputPath("phone-fr-recipes-cards.png") });
  });
});
