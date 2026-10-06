import { expect, test } from "@playwright/test";

// The Planner on a phone: the same page as on a computer. The board shows three
// days at a time (pages start at Mon, Thu and Fri), the weekend, the cards and
// the finder are the shared ones, an empty slot or a meal opens its card as a
// sheet from the bottom, and a long press picks a card or a result up to drag it.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const todayIndex = () => (new Date().getDay() + 6) % 7;

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() + 7);
  return mondayOf(x);
}

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `pm+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const res = await page.request.post("/api/recipes", {
    data: { title: "Roast chicken", baseServings: 2, ingredients: [{ name: "chicken", quantity: 500, unit: "g" }] },
  });
  return res.json();
}

async function plan(page, recipe, weekStart, dayOfWeek, mealType) {
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek, mealType } });
}

async function openPlanner(page) {
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await expect(page.locator(".riso-planner-board.paged")).toBeVisible();
}

// A real touch drag (Chromium's own input pipeline, not a mouse): hold still, then move.
async function touchDrag(page, from, to, { hold = 320, steps = 14, endHold = 0 } = {}) {
  const client = await page.context().newCDPSession(page);
  const send = (type, x, y) => client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await page.evaluate(() => {
    window.__cancels = 0;
    document.addEventListener("pointercancel", () => window.__cancels++, true);
  });
  await send("touchStart", from.x, from.y);
  await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  if (endHold) await page.waitForTimeout(endHold);
  await send("touchEnd");
  await page.waitForTimeout(500);
  return page.evaluate(() => window.__cancels);
}

const center = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};


test("the board shows three days at a time, with a nav row, the meal names stay put, and today's page opens first", async ({ page }) => {
  await setup(page);
  await openPlanner(page);

  // All seven days are on the board, three meal rows; the page that has today opens first.
  await expect(page.locator(".riso-planner-day-header")).toHaveCount(7);
  await expect(page.locator(".riso-planner-meal-label")).toHaveCount(3);
  await expect(page.locator(".riso-planner-cell")).toHaveCount(21);
  await expect(page.locator(".riso-planner-day-header.is-today")).toHaveText(/TODAY/);
  const label = page.locator(".riso-planner-pagelabel");
  await expect(label).toHaveText(/^[A-Z]{3} \d+ – [A-Z]{3} \d+$/);

  // Exactly three days fit beside the meal names; nothing makes the page wider than the screen.
  const scroll = page.locator(".riso-planner-scroll");
  const box = await scroll.boundingBox();
  const heads = await page.locator(".riso-planner-day-header").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const labelRight = (await page.locator(".riso-planner-meal-label").first().boundingBox()).x + 56;
  const todayBox = await page.locator(".riso-planner-day-header.is-today").boundingBox();
  expect(todayBox.x).toBeGreaterThanOrEqual(box.x);
  expect(todayBox.x + todayBox.width).toBeLessThanOrEqual(box.x + box.width + 1);
  const inView = heads.filter((r) => r.left >= labelRight - 2 && r.right <= box.x + box.width + 1);
  expect(inView).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The yellow › and the plain ‹ page the board (Mon–Wed, Thu–Sat, Fri–Sun), each dim at its end.
  const prev = page.getByRole("button", { name: "Earlier days" });
  const next = page.getByRole("button", { name: "Later days" });
  await expect(next).toHaveClass(/next/);
  for (let i = 0; i < 3 && (await prev.isEnabled()); i++) await prev.click();
  await expect(label).toHaveText(/^MON \d+ – WED \d+$/);
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(label).toHaveText(/^THU \d+ – SAT \d+$/);
  await next.click();
  await expect(label).toHaveText(/^FRI \d+ – SUN \d+$/);
  await expect(next).toBeDisabled();
  // The meal names are still at the left edge of the board.
  const names = await page.locator(".riso-planner-meal-label").first().boundingBox();
  expect(names.x).toBeLessThan(box.x + 2);

  // A swipe along the board turns the page too.
  await page.locator(".riso-planner-scroll").evaluate((el) => {
    const touch = (type, x) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: 100 })], touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: 100 })] }));
    touch("touchstart", 300);
    touch("touchend", 120);
    touch("touchstart", 120);
    touch("touchend", 300);
  });
  await expect(label).toHaveText(/^THU/);
});

test("cards look like the desktop: a leftover has the yellow border and the tag, already-have only the blue border, no shadow, no round ✓", async ({ page }) => {
  const recipe = await setup(page);
  const week = nextMonday();
  await plan(page, recipe, week, 0, "dinner");
  await plan(page, recipe, week, 1, "dinner");
  const entries = await (await page.request.get(`/api/planner?week=${week}`)).json();
  await page.request.put(`/api/planner/${entries[0].id}`, { data: { isLeftover: true } });
  await page.request.put(`/api/planner/${entries[1].id}`, { data: { alreadyHave: true } });
  await page.request.post("/api/planner/blank", { data: { weekStart: week, dayOfWeek: 2, mealType: "lunch", note: "Eating out" } });
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  const leftover = page.locator(".riso-planner-card.leftover");
  await expect(leftover).toHaveCount(1);
  await expect(leftover).toHaveCSS("border-top-color", "rgb(255, 225, 77)");
  await expect(leftover.locator(".riso-planner-card-leftover")).toHaveText("leftover");
  const have = page.locator(".riso-planner-card.have");
  await expect(have).toHaveCSS("border-top-color", "rgb(35, 35, 255)");
  await expect(have.locator(".riso-planner-card-leftover")).toHaveCount(0);
  for (const card of [leftover, have]) {
    await expect(card).toHaveCSS("box-shadow", "none");
    await expect(card.locator(".riso-planner-card-have")).toBeHidden();
  }
  // Recipe cards have their ×; notes and empty cards do not.
  await expect(leftover.locator(".riso-planner-card-remove")).toBeVisible();
  await expect(page.locator(".riso-planner-note .riso-planner-note-remove")).toHaveCount(0);
  await expect(page.locator(".riso-planner-cell-empty .riso-planner-card-remove")).toHaveCount(0);
});

test("the bottom grocery button is gone", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, mondayOf(new Date()), todayIndex(), "dinner");
  await openPlanner(page);
  await expect(page.getByRole("button", { name: /Make the grocery list/ })).toHaveCount(0);
  await expect(page.locator(".rpm-bottombar")).toHaveCount(0);
});

test("a photo that fails to load does not hide the next photo shown in the same card", async ({ page }) => {
  await setup(page);
  const upload = await page.request.post("/api/recipe-images", {
    headers: { "Content-Type": "image/png" },
    data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  const { url } = await upload.json();
  const broken = await (await page.request.post("/api/recipes", { data: { title: "Broken photo", baseServings: 2, photoUrl: "/api/recipe-images/does-not-exist", ingredients: [{ name: "x" }] } })).json();
  const good = await (await page.request.post("/api/recipes", { data: { title: "Good photo", baseServings: 2, photoUrl: url, ingredients: [{ name: "x" }] } })).json();
  await plan(page, broken, mondayOf(new Date()), 6, "dinner");
  await plan(page, good, nextMonday(), 6, "dinner");
  await openPlanner(page);

  const card = page.locator(".riso-planner-card");
  await expect(card.locator("img")).toHaveCSS("visibility", "hidden");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(card).toContainText("Good photo");
  await expect(card.locator("img")).toHaveCSS("visibility", "visible");
});

test("an empty slot opens the desktop's add card as a sheet; Nothing planned asks twice; a note saves", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.getByRole("button", { name: "Add to Lunch, Wed" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to Wed · Lunch" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Recipe", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Note", exact: true })).toBeVisible();

  // Nothing planned: the first tap turns the tile blue and says Confirm, nothing is saved yet.
  const blank = sheet.locator(".riso-slotcard-btn.blank");
  await blank.click();
  await expect(blank).toHaveText("Confirm");
  await expect(blank).toHaveClass(/confirming/);
  expect(await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json()).toHaveLength(0);
  await blank.click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".riso-planner-note.blank")).toHaveCount(1);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json()).length).toBe(1);

  // A note: the quick pills and Save, from the same card.
  await page.getByRole("button", { name: "Add to Supper, Wed" }).click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("button", { name: "Eating out" }).click();
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".riso-planner-note-text", { hasText: "Eating out" })).toBeVisible();
});

test("Recipe makes the slot the search panel's target and scrolls to it; the panel is at the bottom of the page and + fills that slot", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  const board = await page.locator(".riso-planner-board").boundingBox();
  const panel = await page.locator(".riso-planner-finder").boundingBox();
  expect(panel.y).toBeGreaterThan(board.y + board.height - 1);

  await page.getByRole("button", { name: "Add to Supper, Tue" }).click();
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".fnd-target")).toContainText("Tue · Supper");
  // The page scrolls (smoothly) so the search bar is in view, below the sticky header.
  await expect.poll(async () => (await page.locator(".fnd-searchbar").boundingBox()).y).toBeGreaterThan(100);
  await expect.poll(async () => (await page.locator(".fnd-searchbar").boundingBox()).y).toBeLessThan(500);

  await page.getByRole("button", { name: "Add Roast chicken to the plan" }).click();
  await expect(page.locator(".riso-planner-card")).toHaveCount(1);
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect([entries[0].dayOfWeek, entries[0].mealType]).toEqual([1, "dinner"]);
  await expect(page.getByRole("status").filter({ hasText: "Added to Tue · Supper" })).toBeVisible();
});

test("a planned meal opens the desktop's planned-meal card as a sheet: Cook opens the recipe card, the mark steps through, Replace targets the slot", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.locator(".riso-planner-card").click();
  const sheet = page.getByRole("dialog", { name: "Roast chicken" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cook", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Use as a base for other meals" })).toBeVisible();

  // Plain -> leftovers (yellow) -> already have (blue) -> plain.
  await sheet.getByRole("button", { name: "Mark as leftovers" }).click();
  await expect(page.locator(".riso-planner-card.leftover")).toHaveCount(1);
  await sheet.getByRole("button", { name: "Mark as already have it" }).click();
  await expect(page.locator(".riso-planner-card.have")).toHaveCount(1);
  await sheet.getByRole("button", { name: "Clear the mark" }).click();
  await expect(page.locator(".riso-planner-card.have, .riso-planner-card.leftover")).toHaveCount(0);

  await sheet.getByRole("button", { name: "Replace this recipe" }).click();
  await expect(page.locator(".riso-sheet")).toHaveCount(0);
  await expect(page.locator(".fnd-target")).toContainText("Mon · Supper");

  await page.locator(".riso-planner-card").click();
  await page.getByRole("dialog", { name: "Roast chicken" }).getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
});

test("the weekend is the desktop's: tag and menu, the evening before, and it matches after a reload", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Later days" }).click();
  await page.getByRole("button", { name: "Later days" }).click();

  // Default: Fri eve + Sat–Sun, one dotted block with the L-shaped evening before, and the tag.
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(1);
  const tag = page.locator(".riso-planner-weekend-tag");
  await expect(tag).toBeVisible();
  await tag.click();
  const menu = page.getByRole("dialog", { name: "WEEKEND" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Sat – Sun" }).click();
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(0);

  // Hide it: the dashed + WEEKEND pill brings it back; the choice is saved for the account.
  await menu.getByRole("switch").first().click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(0);
  await expect(page.locator(".riso-planner-weekend-off")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(0);
  await page.locator(".riso-planner-weekend-off").click();
  await page.getByRole("dialog", { name: "WEEKEND" }).getByRole("button", { name: "Fri eve – Sun" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(1);
});

test("a long press picks a planned card up and drops it on a slot; a result drops on a slot; holding at the edge turns the page", async ({ page }) => {
  const recipe = await setup(page);
  const week = nextMonday();
  await plan(page, recipe, week, 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await page.setViewportSize({ width: 390, height: 1500 });
  await page.waitForTimeout(400);

  // A card moves to an empty slot (Mon supper -> Tue supper), by a real touch drag.
  let cancels = await touchDrag(page, await center(page.locator(".riso-planner-card")), await center(page.locator(".riso-planner-cell").nth(14 + 1)));
  expect(cancels).toBe(0);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).map((e) => e.dayOfWeek)).toEqual([1]);

  // A result from the panel drops on Wed lunch.
  await page.locator(".fnd-searchbar input").click();
  await page.keyboard.type("roast");
  const result = page.locator(".fnd-card", { hasText: "Roast chicken" }).first();
  await result.scrollIntoViewIfNeeded();
  cancels = await touchDrag(page, await center(result), await center(page.locator(".riso-planner-cell").nth(7 + 2)));
  expect(cancels).toBe(0);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(2);

  // Holding a carried card at the right edge turns the page, so it can reach another day.
  await page.evaluate(() => scrollTo(0, 0));
  const label = page.locator(".riso-planner-pagelabel");
  await expect(label).toHaveText(/^MON/);
  const scroll = await page.locator(".riso-planner-scroll").boundingBox();
  const from = await center(page.locator(".riso-planner-card").first());
  await touchDrag(page, from, { x: scroll.x + scroll.width - 6, y: from.y }, { endHold: 1000, steps: 8 });
  await expect(label).not.toHaveText(/^MON/);
});

test("leftovers can be placed from a Main meal, on the board, and turned off again", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.locator(".riso-planner-card").click();
  await page.getByRole("dialog", { name: "Roast chicken" }).getByRole("button", { name: "Use as a base for other meals" }).click();
  await expect(page.locator(".fnd-main")).toContainText("Roast chicken");
  await expect(page.getByRole("button", { name: "Place leftovers" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Put leftovers on Lunch, Wed" }).click();
  await expect(page.locator(".riso-planner-card.leftover .riso-planner-card-leftover")).toHaveText("leftover");
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect(entries.filter((e) => e.isLeftover)).toHaveLength(1);
  await page.getByRole("button", { name: "Place leftovers" }).click();
  await expect(page.getByRole("button", { name: /Put leftovers on/ })).toHaveCount(0);
});

test("the date pill opens the week calendar: three dashes a day, a tapped day shows its meals under its row, and Show this week opens it", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, mondayOf(new Date()), todayIndex(), "dinner");
  await openPlanner(page);

  // The title is above the controls, and the sticker says this is the current week.
  const header = page.locator(".phd");
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  await expect(header.getByText("this week", { exact: true })).toBeVisible();
  await header.locator(".phd-date").click();
  const calendar = page.getByRole("dialog", { name: "Choose a week" });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".wcal-day.today")).toHaveCount(1);
  await expect(calendar.locator(".wcal-week.selected")).toHaveCount(1);
  // Three dashes a day, one for each meal; the planned supper is the only one filled.
  await expect(calendar.locator(".wcal-dashes i.on")).toHaveCount(1);
  await expect(calendar.locator(".wcal-day.today .wcal-dashes i")).toHaveCount(3);

  // Tapping a day shows its meals inline under its week's row; a row does not pick the week.
  await calendar.locator(".wcal-day.today").click();
  const preview = calendar.locator(".wcal-preview.inline");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("1 planned");
  await expect(preview).toContainText(recipe.title);
  await expect(calendar).toBeVisible();

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);

  // Another week: the title does not change, the sticker goes back to this week.
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  await expect(header.getByText("this week", { exact: true })).toHaveCount(0);
  await header.locator(".phd-date").click();
  await calendar.getByRole("button", { name: "Go to this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(header.getByText("this week", { exact: true })).toBeVisible();

  // Tap a day in the next month, then Show this week: that week opens.
  await header.locator(".phd-date").click();
  await calendar.getByRole("button", { name: "Next month" }).click();
  await calendar.locator(".wcal-day:not(.out)").nth(14).click();
  await calendar.getByRole("button", { name: "Show this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "↩ this week" })).toBeVisible();
});
