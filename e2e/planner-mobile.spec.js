import { expect, test } from "@playwright/test";

// The Planner on a phone (design: docs/design/riso-v2-planner-mobile-v2): three
// days at a time on a board that slides under the pinned meal names (pages start
// at Mon, Thu and Fri), page stickers and swipes to change page, the arrows to
// change week, the cards that open under a slot's row, the weekend's settings
// in the calendar, a long press to pick a card or a result up (a trash strip
// while a card is held), and the shared finder as one pill at the bottom.

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
  await expect(page.locator(".pmb")).toBeVisible();
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



const INK = "rgb(22, 24, 31)";
const BLUE = "rgb(35, 35, 255)";
const YELLOW = "rgb(255, 225, 77)";
const PINK = "rgb(255, 72, 176)";

const stickers = (page) => page.locator(".phd-sticker");
const trackX = (page) => page.locator(".pmb-track").evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

test("the board shows three days at a time; the meal names stay pinned; stickers and swipes change the page; ‹ › change the week", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click(); // a week with no "today": it opens on Mon–Wed

  await expect(page.locator(".pmb-day")).toHaveCount(7);
  await expect(page.locator(".pmb-cell")).toHaveCount(21);
  await expect(page.locator(".pmb-meal")).toHaveText(["Breakfast", "Lunch", "Supper"]);
  await expect(page.locator(".phd-range")).toHaveText(/^\w+ \d+ – (?:\w+ )?\d+$/);
  await expect(page.locator(".riso-planner-title")).toHaveText("This week's menu.");
  // Nothing makes the page wider than the screen; 40px of the next day peeks at the right.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const tiles = await page.locator(".pmb-day").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
  expect(tiles.slice(0, 3).every((x) => x >= 14 - 1 && x < 390 - 104)).toBe(true);
  expect(tiles[3]).toBeGreaterThan(340);
  expect(tiles[3]).toBeLessThan(390);

  // Page 1 has one sticker, forward; page 2 has both; page 3 only back. Each names the real days.
  await expect(stickers(page)).toHaveText(["Thu–Sat →"]);
  await stickers(page).click();
  await expect(stickers(page)).toHaveText(["← Mon–Wed", "Fri–Sun →"]);
  await expect.poll(() => trackX(page)).toBe(-336);
  await page.locator(".phd-sticker.forward").click();
  await expect(stickers(page)).toHaveText(["← Thu–Sat"]);
  await expect.poll(() => trackX(page)).toBe(-448);

  // The meal names are at the left edge on every page, while the days slide.
  const names = await page.locator(".pmb-meal").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(names).toEqual([14, 14, 14]);

  // A swipe along the board turns the page too (here, back to Mon–Wed in two swipes right).
  const tile = await center(page.locator(".pmb-day").nth(5));
  await touchDrag(page, tile, { x: tile.x + 200, y: tile.y }, { hold: 0, steps: 8 });
  await expect(stickers(page)).toHaveText(["← Mon–Wed", "Fri–Sun →"]);
  await touchDrag(page, tile, { x: tile.x + 200, y: tile.y }, { hold: 0, steps: 8 });
  await expect(stickers(page)).toHaveText(["Thu–Sat →"]);
  await touchDrag(page, tile, { x: tile.x + 200, y: tile.y }, { hold: 0, steps: 8 }); // already the first page: stays
  await expect(stickers(page)).toHaveText(["Thu–Sat →"]);

  // ‹ › change the week (always one week), and a new week starts on the first page.
  await stickers(page).click();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(stickers(page)).toHaveText(["Thu–Sat →"]);
  await expect(page.locator(".phd-date")).toHaveText(/^\w+ \d+ – (?:\w+ )?\d+/);
  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator(".phd-date")).toHaveText(/this week/);
  await expect(page.locator(".pmb-day.today")).toHaveText(/TODAY/);
});

test("cards: leftover = yellow border and tag, already have = blue border only, no shadow, no ✓ or ×; a note says NOTE; nothing planned is a plain card; past days are faded", async ({ page }) => {
  const recipe = await setup(page);
  const week = nextMonday();
  await plan(page, recipe, week, 0, "dinner");
  await plan(page, recipe, week, 1, "dinner");
  const entries = await (await page.request.get(`/api/planner?week=${week}`)).json();
  await page.request.put(`/api/planner/${entries[0].id}`, { data: { isLeftover: true } });
  await page.request.put(`/api/planner/${entries[1].id}`, { data: { alreadyHave: true } });
  await page.request.post("/api/planner/blank", { data: { weekStart: week, dayOfWeek: 2, mealType: "lunch", note: "Eating out" } });
  await page.request.post("/api/planner/blank", { data: { weekStart: week, dayOfWeek: 2, mealType: "dinner" } });
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  const leftover = page.locator(".pmb-cell .riso-planner-card.leftover");
  await expect(leftover).toHaveCount(1);
  await expect(leftover).toHaveCSS("border-top-color", YELLOW);
  await expect(leftover.locator(".riso-planner-card-leftover")).toHaveText("leftover");
  const have = page.locator(".pmb-cell .riso-planner-card.have");
  await expect(have).toHaveCSS("border-top-color", BLUE);
  await expect(have).toHaveCSS("border-top-width", "3px");
  await expect(have.locator(".riso-planner-card-leftover")).toHaveCount(0);
  for (const card of [leftover, have]) {
    await expect(card).toHaveCSS("box-shadow", "none");
    await expect(card.locator(".riso-planner-card-have")).toBeHidden();
    await expect(card.locator(".riso-planner-card-remove")).toBeHidden();
  }
  // A card is 104 x 104 with the cooking time under its name.
  const box = await leftover.boundingBox();
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([104, 104]);
  // A note: « ✎ NOTE » over its text. Nothing planned: a plain solid card with its own words.
  const note = page.locator(".pmb-cell .riso-planner-note:not(.blank)");
  await expect(note).toContainText("✎ NOTE");
  await expect(note).toContainText("Eating out");
  const blank = page.locator(".pmb-cell .riso-planner-note.blank");
  await expect(blank).toHaveText("Nothing planned");
  await expect(blank).toHaveCSS("border-top-style", "solid");
  // An empty slot is dashed, with « + add ».
  const empty = page.locator(".pmb-empty").first();
  await expect(empty).toHaveText("+ add");
  await expect(empty).toHaveCSS("border-top-style", "dashed");

  // Past days (this week, before today) are faded and cannot be tapped open.
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator(".pmb-cell.past")).toHaveCount(todayIndex() * 3);
  if (todayIndex() > 0) {
    // This week opens on the page with today (Thu–Sat or Fri–Sun later in the week), so
    // turn back to the first page, where Monday is, the way a person would.
    const back = stickers(page).filter({ hasText: "←" });
    while ((await back.count()) > 0) await back.first().click();
    await expect.poll(() => trackX(page)).toBe(0);
    await page.locator(".pmb-cell.past .pmb-empty").first().click({ force: true });
    await expect(page.locator(".pmi")).toHaveCount(0);
  }
});

test("an empty slot's card opens under its row and pushes the rows down; Nothing planned asks twice (ink, pink shadow); a note saves; tapping the slot again closes it", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  const lunchName = () => page.locator(".pmb-meal").nth(1).evaluate((el) => el.getBoundingClientRect().top);
  const before = await lunchName();
  await page.getByRole("button", { name: "Add to Breakfast, Wed" }).click();
  const card = page.getByRole("dialog", { name: "Add to Wed · Breakfast" });
  await expect(card).toBeVisible();
  await expect(card.locator(".pmi-caps")).toHaveText("WED 7 · BREAKFAST".replace("7", String(new Date(Date.now() + 7 * 864e5 - ((new Date().getDay() + 6) % 7) * 864e5 + 2 * 864e5).getDate())));
  // Under the slot's row: below the cell, with the rows under it pushed down by its height.
  const cell = await page.locator(".pmb-cell.selected").boundingBox();
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeGreaterThan(cell.y + cell.height);
  expect(Math.round(cardBox.width)).toBe(362);
  await expect.poll(lunchName).toBeCloseTo(before + cardBox.height + 6, 0);
  await expect(page.locator(".pmb-cell.selected")).toHaveCSS("outline-color", BLUE);
  await expect(card.locator(".pmi-notch")).toBeVisible();
  // The tiles use the desktop's colours.
  await expect(card.getByRole("button", { name: "Recipe" })).toHaveCSS("background-color", BLUE);
  await expect(card.getByRole("button", { name: "Note" })).toHaveCSS("background-color", YELLOW);

  // Nothing planned: the first tap turns the tile ink with a pink shadow and says ✓ Confirm; nothing is saved yet.
  const blank = card.locator(".riso-slotcard-btn.blank");
  await blank.click();
  await expect(blank).toContainText("Confirm");
  await expect(blank).toHaveCSS("background-color", INK);
  expect(await blank.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(PINK);
  expect(await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json()).toHaveLength(0);
  await blank.click();
  await expect(page.locator(".pmi")).toHaveCount(0);
  await expect(page.locator(".pmb-cell .riso-planner-note.blank")).toHaveCount(1);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json()).length).toBe(1);
  await expect.poll(lunchName).toBeCloseTo(before, 0); // the rows are back

  // Closing: ✕, and tapping the same slot again.
  await page.getByRole("button", { name: "Add to Supper, Wed" }).click();
  await expect(page.locator(".pmi")).toHaveCount(1);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".pmi")).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Supper, Wed" }).click();
  await page.getByRole("button", { name: "Add to Supper, Wed" }).click({ force: true });
  await expect(page.locator(".pmi")).toHaveCount(0);

  // A note: the quick pills and Save, from the same card.
  await page.getByRole("button", { name: "Add to Supper, Wed" }).click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("button", { name: "Eating out" }).click();
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".pmi")).toHaveCount(0);
  await expect(page.locator(".riso-planner-note-text", { hasText: "Eating out" })).toBeVisible();
});

test("Recipe makes the slot the search panel's target (a chip in the pill); + fills that slot; Browse and Close open and close the panel", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  const board = await page.locator(".pmb").boundingBox();
  const panel = await page.locator(".riso-planner-finder").boundingBox();
  expect(panel.y).toBeGreaterThan(board.y + board.height - 1);
  // Closed: one pill with the box for typing and Browse, nothing else.
  await expect(page.locator(".fnd-bar-toggle")).toHaveText("Browse");
  await expect(page.locator(".fnd-searchbar input")).toHaveAttribute("placeholder", "Search a recipe");
  await expect(page.locator(".fnd-filters")).toBeHidden();

  await page.getByRole("button", { name: "Add to Supper, Tue" }).click();
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  await expect(page.locator(".pmi")).toHaveCount(0);
  await expect(page.locator(".fnd-target")).toContainText("Tue · Supper");
  await expect(page.locator(".fnd-bar-toggle")).toHaveText("Close"); // opened, aimed at the slot
  await expect(page.getByRole("button", { name: "Cook with…" })).toBeVisible();
  // The page scrolls (smoothly) so the search bar is in view, below the sticky header.
  await expect.poll(async () => (await page.locator(".fnd-searchbar").boundingBox()).y).toBeGreaterThan(100);
  await expect.poll(async () => (await page.locator(".fnd-searchbar").boundingBox()).y).toBeLessThan(500);
  // Repas and Protéine are the shared finder's menus.
  await page.getByRole("button", { name: /^MEAL/ }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add Roast chicken to the plan" }).click();
  await expect(page.locator(".pmb-cell .riso-planner-card")).toHaveCount(1);
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect([entries[0].dayOfWeek, entries[0].mealType]).toEqual([1, "dinner"]);
  await expect(page.getByRole("status").filter({ hasText: "Added to Tue · Supper" })).toBeVisible();

  await page.locator(".fnd-bar-toggle").click();
  await expect(page.locator(".fnd-bar-toggle")).toHaveText("Browse");
});

test("a planned meal's card: the status steps plain -> leftovers -> already have with a toast and Undo; Replace targets the slot; Cook opens the recipe", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.locator(".pmb-cell .riso-planner-card").click();
  const card = page.getByRole("dialog", { name: "Roast chicken" });
  await expect(card).toBeVisible();
  await expect(card.locator(".pmi-name")).toHaveText("Roast chicken");
  await expect(card.getByRole("button", { name: "Cook", exact: true })).toHaveCSS("background-color", BLUE);
  await expect(card.getByRole("button", { name: "Use as a base" })).toHaveCSS("background-color", YELLOW);
  await expect(card.getByRole("button", { name: "Replace" })).toHaveCSS("background-color", "rgb(255, 253, 248)");

  // The status says what there is to buy, and is a button with a ⟳.
  const status = card.locator(".pmi-status");
  await expect(status).toContainText("1 to buy");
  await expect(status).toContainText("⟳");
  await status.click();
  await expect(page.locator(".pmb-cell .riso-planner-card.leftover")).toHaveCount(1);
  await expect(status).toHaveText(/Leftovers/);
  const toast = page.getByRole("status").filter({ hasText: "marked as leftovers" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".pmb-cell .riso-planner-card.leftover")).toHaveCount(0);
  await expect(status).toContainText("1 to buy");
  await status.click();
  await status.click();
  await expect(page.locator(".pmb-cell .riso-planner-card.have")).toHaveCount(1);
  await expect(status).toHaveText(/Already have/);
  await expect(page.getByRole("status").filter({ hasText: "marked as already have" })).toBeVisible();
  await status.click();
  await expect(page.locator(".pmb-cell .riso-planner-card.have, .pmb-cell .riso-planner-card.leftover")).toHaveCount(0);

  await card.getByRole("button", { name: "Replace" }).click();
  await expect(page.locator(".pmi")).toHaveCount(0);
  await expect(page.locator(".fnd-target")).toContainText("Mon · Supper");

  await page.locator(".pmb-cell .riso-planner-card").click();
  await page.getByRole("dialog", { name: "Roast chicken" }).getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
});

test("the weekend's settings are in the calendar and match the desktop after a reload; the band is a dotted outline with an L for the evening before", async ({ page }) => {
  await setup(page);
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await stickers(page).click();
  await page.locator(".phd-sticker.forward").click();

  // No tag on the board: a dotted pink band, with the evening before taken in (an L: six corners).
  await expect(page.locator(".riso-planner-weekend-tag, .riso-planner-weekend-off")).toHaveCount(0);
  await expect(page.locator(".pmb-bands path")).toHaveCount(1);
  expect(((await page.locator(".pmb-bands path").getAttribute("d")) || "").match(/Q/g)).toHaveLength(6);

  await page.locator(".phd-date").click();
  const calendar = page.getByRole("dialog", { name: "Choose a week" });
  const weekend = calendar.getByRole("region", { name: "Weekend" });
  await weekend.scrollIntoViewIfNeeded();
  await expect(weekend.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
  await expect(weekend.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "false");
  await weekend.getByRole("button", { name: "Sat – Sun" }).click(); // the evening before off
  await expect(page.locator(".pmb-bands path")).toHaveCount(1);
  expect(((await page.locator(".pmb-bands path").getAttribute("d")) || "").match(/Q/g)).toHaveLength(4);
  await weekend.getByRole("button", { name: "Wednesday" }).click(); // a second run
  await expect(page.locator(".pmb-bands path")).toHaveCount(2);
  await weekend.getByRole("switch").first().click(); // off
  await expect(page.locator(".pmb-bands path")).toHaveCount(0);
  await weekend.getByRole("switch").first().click();
  await weekend.getByRole("button", { name: "Fri eve – Sun" }).click();
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).weekendDays).toEqual([5, 6]);

  // Saved for the account: the computer shows the same weekend after a reload.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).first().click();
  await expect(page.locator(".riso-planner-weekend")).toHaveCount(1);
  await expect(page.locator(".riso-planner-weekend-eve")).toHaveCount(1);
  await page.locator(".riso-planner-weekend-tag").click();
  await expect(page.getByRole("dialog", { name: "WEEKEND" }).getByRole("button", { name: "Fri eve – Sun" })).toHaveAttribute("aria-pressed", "true");
});

test("a long press picks a planned card up and drops it on a slot (two swap); a result drops on a slot; holding at the edge turns the page; the trash strip removes with Undo", async ({ page }) => {
  const recipe = await setup(page);
  const week = nextMonday();
  await plan(page, recipe, week, 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await page.waitForTimeout(400);
  const cells = page.locator(".pmb-cell");
  // cells are in day order, three meals each: index = day * 3 + meal (0 breakfast, 1 lunch, 2 supper)
  await expect(page.locator(".pm-trash")).toHaveCount(0);

  // A card moves to an empty slot (Mon supper -> Tue supper), by a real touch drag; the trash strip shows while it is held.
  const strip = page.locator(".pm-trash");
  const from = await center(page.locator(".pmb-cell .riso-planner-card"));
  const to = await center(cells.nth(3 + 2));
  const client = await page.context().newCDPSession(page);
  const send = (type, x, y) => client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await send("touchStart", from.x, from.y);
  await page.waitForTimeout(350);
  for (let i = 1; i <= 12; i++) {
    await send("touchMove", from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(16);
  }
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Drop here to remove");
  await expect(cells.nth(3 + 2)).toHaveCSS("outline-color", PINK); // the target slot gets a pink outline
  await send("touchEnd");
  await expect(strip).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).map((e) => e.dayOfWeek)).toEqual([1]);

  // A result from the panel drops on Wed lunch.
  await page.locator(".fnd-searchbar input").click();
  await page.keyboard.type("roast");
  const result = page.locator(".fnd-card", { hasText: "Roast chicken" }).first();
  await result.scrollIntoViewIfNeeded();
  expect(await touchDrag(page, await center(result), await center(cells.nth(6 + 1)))).toBe(0);
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(2);
  await expect(page.locator(".pm-trash")).toHaveCount(0); // a result is not a card on the board: no trash for it

  // Holding a carried card at the right edge turns the page, so it can reach another day.
  await page.evaluate(() => scrollTo(0, 0));
  await expect(stickers(page)).toHaveText(["Thu–Sat →"]);
  const card = await center(page.locator(".pmb-cell .riso-planner-card").first());
  await touchDrag(page, card, { x: 384, y: card.y }, { endHold: 1000, steps: 8 });
  await expect(stickers(page)).toHaveText(["← Mon–Wed", "Fri–Sun →"]);
  await stickers(page).first().click();
  await expect.poll(() => trackX(page)).toBe(0);
  await page.waitForTimeout(400);

  // Trash: carry a card to the strip. It turns pink and says Release; the card comes off, with Undo.
  await page.evaluate(() => scrollTo(0, 0));
  const cardsNow = page.locator(".pmb-cell .riso-planner-card");
  let held = null;
  for (let i = 0; i < (await cardsNow.count()) && !held; i++) {
    const b = await cardsNow.nth(i).boundingBox();
    if (b && b.x >= 0 && b.x + b.width <= 390 && b.y > 120 && b.y + b.height < 700) held = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  expect(held).not.toBeNull();
  await send("touchStart", held.x, held.y);
  await page.waitForTimeout(350);
  for (let i = 1; i <= 12; i++) {
    await send("touchMove", held.x + ((195 - held.x) * i) / 12, held.y + ((805 - held.y) * i) / 12);
    await page.waitForTimeout(16);
  }
  const pill = page.locator(".pm-trash-pill");
  await expect(pill).toHaveClass(/over/);
  await expect(pill).toContainText("Release to remove");
  await send("touchEnd");
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(1);
  const toast = page.getByRole("status").filter({ hasText: "removed from" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(2);
});

test("« Clear » is a small link under each future day that has something planned; the toast has Undo", async ({ page }) => {
  const recipe = await setup(page);
  const week = nextMonday();
  await plan(page, recipe, week, 1, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.locator(".pmb-clear")).toHaveCount(1);
  await expect(page.locator(".pmb-clear")).toHaveText("Clear");
  const clear = await page.locator(".pmb-clear").boundingBox();
  const supper = await page.locator(".pmb-cell").nth(3 + 2).boundingBox();
  expect(clear.y).toBeGreaterThan(supper.y + supper.height);
  await page.locator(".pmb-clear").click();
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(0);
  await page.getByRole("status").filter({ hasText: "cleared" }).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/planner?week=${week}`)).json()).length).toBe(1);
});

test("leftovers can be placed from a Main meal, on the board; the banner is stacked and nothing is cut off at 390px", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, nextMonday(), 0, "dinner");
  await openPlanner(page);
  await page.getByRole("button", { name: "Next week" }).click();

  await page.locator(".pmb-cell .riso-planner-card").click();
  await page.getByRole("dialog", { name: "Roast chicken" }).getByRole("button", { name: "Use as a base" }).click();
  const banner = page.locator(".fnd-main");
  await expect(banner).toContainText("Roast chicken");
  // Stacked: the photo strip on top, then the words and ingredients across the width, the buttons at the bottom.
  await page.waitForTimeout(1200); // the page is scrolling to the banner
  const [b, photo, body, actions] = await page.evaluate(() =>
    [".fnd-main", ".fnd-main-photo", ".fnd-main-body", ".fnd-main-actions"].map((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })
  );
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  expect(photo.width).toBeGreaterThan(b.width - 6);
  expect(body.y).toBeGreaterThan(photo.y + photo.height - 1);
  expect(actions.y).toBeGreaterThan(body.y + body.height - 1);
  for (const button of await banner.locator("button").all()) {
    const bb = await button.boundingBox();
    expect(bb.x + bb.width).toBeLessThanOrEqual(b.x + b.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await expect(page.getByRole("button", { name: "Place leftovers" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Put leftovers on Lunch, Wed" }).click();
  await expect(page.locator(".pmb-cell .riso-planner-card.leftover .riso-planner-card-leftover")).toHaveText("leftover");
  const entries = await (await page.request.get(`/api/planner?week=${nextMonday()}`)).json();
  expect(entries.filter((e) => e.isLeftover)).toHaveLength(1);
  await page.getByRole("button", { name: "Place leftovers" }).click();
  await expect(page.getByRole("button", { name: /Put leftovers on/ })).toHaveCount(0);
});

test("the date pill opens the calendar panel: three dashes a day, a tapped day shows its meals under its row, Show this week opens that week", async ({ page }) => {
  const recipe = await setup(page);
  await plan(page, recipe, mondayOf(new Date()), todayIndex(), "dinner");
  await openPlanner(page);

  // The title is above the controls; the pill says this is the current week and turns blue while the calendar is open.
  const header = page.locator(".phd");
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  const pill = header.locator(".phd-date");
  await expect(pill).toHaveText(/this week/);
  const titleBox = await header.locator(".riso-planner-title").boundingBox();
  const pillBox = await pill.boundingBox();
  expect(pillBox.y).toBeGreaterThan(titleBox.y + titleBox.height - 2);
  await pill.click();
  await expect(pill).toHaveClass(/open/);
  await expect(pill).toHaveCSS("background-color", BLUE);
  const calendar = page.getByRole("dialog", { name: "Choose a week" });
  await expect(calendar).toBeVisible();
  // A panel from under the controls to the bottom, 14px from each side.
  const cal = await calendar.boundingBox();
  const controls = await header.locator(".phd-controls").boundingBox();
  expect(cal.y).toBeGreaterThan(controls.y + controls.height);
  expect(Math.round(cal.x)).toBe(14);
  expect(Math.round(cal.x + cal.width)).toBe(376);
  expect(Math.round(cal.y + cal.height)).toBeGreaterThan(844 - 20);
  await expect(calendar.locator(".wcal-day.today")).toHaveCount(1);
  await expect(calendar.locator(".wcal-week.selected")).toHaveCount(1);
  await expect(calendar.locator(".wcal-dashes i.on")).toHaveCount(1);
  await expect(calendar.locator(".wcal-day.today .wcal-dashes i")).toHaveCount(3);

  // Tapping a day shows its meals under its week's row; a row does not pick the week.
  await calendar.locator(".wcal-day.today").click();
  const preview = calendar.locator(".wcal-preview.inline");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("1 planned");
  await expect(preview).toContainText(recipe.title);
  await expect(preview.locator(".wcal-preview-title")).toHaveText(/^\w+day, \w+ \d+$/); // « Thursday, October 8 »
  await expect(calendar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);

  // Another week: the title does not change; the pill reads the dates; "Go to this week" is in the calendar.
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(header.locator(".riso-planner-title")).toHaveText("This week's menu.");
  await expect(pill).not.toHaveText(/this week/);
  await pill.click();
  await calendar.getByRole("button", { name: "Go to this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(pill).toHaveText(/this week/);

  // Tap a day in the next month, then Show this week: that week opens.
  await pill.click();
  await calendar.getByRole("button", { name: "Next month" }).click();
  await calendar.locator(".wcal-day:not(.out)").nth(14).click();
  await calendar.getByRole("button", { name: "Show this week" }).click();
  await expect(calendar).toHaveCount(0);
  await expect(pill).not.toHaveText(/this week/);
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

test.describe("in French", () => {
  test.use({ locale: "fr-CA" });

  test("the date line, the title on two lines and the stickers are in French, with the real days", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await page.fill('input[type="email"]', `fr+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
    await page.fill('input[type="password"]', "testpass123");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".tab.active")).toHaveText("Accueil");
    await page.request.post("/api/recipes", { data: { title: "Poulet rôti", baseServings: 2, ingredients: [{ name: "poulet", quantity: 500, unit: "g" }] } });
    await page.reload();
    await page.getByRole("button", { name: "Planificateur", exact: true }).first().click();
    await expect(page.locator(".pmb")).toBeVisible();
    await page.getByRole("button", { name: "Semaine suivante" }).click();

    await expect(page.locator(".riso-planner-title")).toHaveText("Le menu de la semaine.");
    const title = await page.locator(".riso-planner-title").boundingBox();
    expect(title.height).toBeGreaterThan(60); // two lines: « Le menu de la » / « semaine. »
    await expect(page.locator(".phd-range")).toHaveText(/\d+ (?:\w+ )?– \d+ \w+/i);
    await expect(page.locator(".pmb-meal")).toHaveText(["Déjeuner", "Dîner", "Souper"]);
    await expect(stickers(page)).toHaveText(["jeu–sam →"]);
    await stickers(page).click();
    await expect(stickers(page)).toHaveText(["← lun–mer", "ven–dim →"]);
    await page.locator(".phd-sticker.forward").click();
    await expect(stickers(page)).toHaveText(["← jeu–sam"]);
    await expect(page.locator(".pmb-empty").first()).toHaveText("+ ajouter");
    // Meal names read at 4.5:1 (--ink-muted on the paper).
    await expect(page.locator(".pmb-meal").first()).toHaveCSS("color", "rgb(94, 91, 82)");
  });
});
