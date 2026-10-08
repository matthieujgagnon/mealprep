import { expect, test } from "@playwright/test";

// Matt's review of the desktop Planner (#125, #126): the shared recipe pop-out
// (Plan first, Cook), the shared slot picker with week arrows, the Makeable now
// rule, the drag highlight and Similar recipes.

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
  await page.fill('input[type="email"]', `fixes+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const created = [];
  for (const r of recipes) {
    const res = await page.request.post("/api/recipes", { data: { ingredients: [{ name: "flour" }], instructions: ["Cook it."], ...r } });
    created.push(await res.json());
  }
  await page.reload();
  return created;
}

const weekEntries = async (page, week) => (await page.request.get(`/api/planner?week=${week}`)).json();
const cell = (page, day, meal) => page.locator(".riso-planner-cell").nth(MEALS.indexOf(meal) * 7 + day);

test("on Recipes a card opens the pop-out with Plan first; Plan opens the slot picker, which can move to next week, and the toast has Undo", async ({ page }) => {
  await setup(page, [{ title: "Plan From Recipes", ingredients: [{ name: "zucchini" }] }]);
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: "Plan From Recipes" }).click();
  const pop = page.getByRole("dialog", { name: "Plan From Recipes" });
  await expect(pop.locator(".fnd-pop-actions button")).toHaveText(["Plan", "Cook", "Similar recipes", "Open the full recipe →"]);

  await pop.getByRole("button", { name: "Plan", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Next week" }).click();
  await picker.getByRole("button", { name: /^Add to .*Supper$/ }).click();

  const nextWeek = mondayOf(new Date(Date.now() + 7 * 86400000));
  await expect.poll(async () => (await weekEntries(page, nextWeek)).length).toBe(1);
  expect(await weekEntries(page, mondayOf(new Date()))).toHaveLength(0);
  const toast = page.getByRole("status").filter({ hasText: "Added to" });
  await expect(toast).toContainText("1 item added to your list");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await weekEntries(page, nextWeek)).length).toBe(0);
});

test("the pop-out's Cook opens the recipe's card on the Recipes page, not Cook mode", async ({ page }) => {
  await setup(page, [{ title: "Cook From Home" }]);
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: "Cook From Home" }).click();
  await page.getByRole("dialog", { name: "Cook From Home" }).getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.locator(".riso-rc-actions")).toBeVisible();
  await expect(page.locator(".cm-overlay")).toHaveCount(0);
});

test("Makeable now counts meals only; Include pantry and sides brings the rest back, on every page", async ({ page }) => {
  await setup(page, [
    { title: "Chicken Dinner", mealSlot: "dinner", ingredients: [{ name: "chicken" }] },
    { title: "Plain Rice", mealSlot: "side", ingredients: [{ name: "rice" }] },
    { title: "Pickled Onions", mealSlot: "prep", ingredients: [{ name: "onion" }] },
    { title: "No Type Yet", ingredients: [{ name: "egg" }] },
  ]);
  for (const name of ["chicken", "rice", "onion", "egg"]) {
    await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
  }
  await page.reload();
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await expect(page.locator(".mk-page .rpc-title")).toHaveCount(2);
  await page.getByRole("button", { name: "Include pantry and sides" }).click();
  await expect(page.locator(".mk-page .rpc-title")).toHaveCount(4);

  // The same setting is on Home (the card's count). Recipes has no Makeable now chip any more.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".riso-home-makeable-num")).toHaveText("4");
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Makeable now/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Makeable", exact: true }).click();
  await expect(page.locator(".mk-page .rpc-title")).toHaveCount(4);
});

test("while dragging, only the slot under the recipe gets a pink border and no fill", async ({ page }) => {
  await setup(page, [{ title: "Drag Me" }]);
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await page.evaluate(() => window.scrollTo(0, 530));
  const from = await page.locator(".fnd-card", { hasText: "Drag Me" }).boundingBox();
  const target = cell(page, Math.min(todayIndex(), 4), "dinner");
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.waitForTimeout(150);

  const style = (loc) =>
    loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, bg: s.backgroundColor, outline: s.outlineStyle };
    });
  const over = await style(target.locator(".riso-planner-cell-empty"));
  expect(over.border).toBe("rgb(255, 72, 176)");
  expect(over.bg).toBe("rgba(0, 0, 0, 0)");
  expect((await style(target)).outline).toBe("none");
  await expect(target.locator(".riso-planner-cell-plus")).toBeVisible();
  // No other slot turns pink.
  const others = page.locator(".riso-planner-cell:not(.drop-active) .riso-planner-cell-empty");
  for (let i = 0; i < Math.min(await others.count(), 6); i++) {
    expect((await style(others.nth(i))).border).not.toBe("rgb(255, 72, 176)");
  }
  await page.mouse.up();
});

test("Similar recipes scrolls the page so the Main meal banner is fully in view", async ({ page }) => {
  await setup(page, [{ title: "Base Dish", ingredients: [{ name: "chicken" }, { name: "lemon" }] }, { title: "Lemon Cousin", ingredients: [{ name: "lemon" }] }]);
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await page.locator(".fnd-card-open", { hasText: "Base Dish" }).click();
  await page.getByRole("button", { name: "Similar recipes" }).click();
  const banner = page.locator(".fnd-main");
  await expect(banner).toBeVisible();
  await expect(banner).toBeInViewport({ ratio: 1 });
});
