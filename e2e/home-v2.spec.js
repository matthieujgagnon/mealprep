import { expect, test } from "@playwright/test";

// Riso v2 Home: the card that follows the day, the week strip's shadows and
// scroll, To use, and Makeable now stepping aside.

test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const todayIndex = () => (new Date().getDay() + 6) % 7;

// Today at this hour (the browser's clock is fixed there).
function atHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `home-v2+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

test("the top card follows the day: breakfast, lunch, then supper", async ({ page }) => {
  await signUp(page);
  const hero = page.locator(".riso-home-hero");
  for (const [hour, eyebrow, empty] of [
    [8, "This morning · Breakfast", "Nothing planned for this morning yet."],
    [12, "Today · Lunch", "Nothing planned for lunch yet."],
    [18, "Tonight · Supper", "Nothing planned for tonight yet."],
  ]) {
    await page.clock.setFixedTime(atHour(hour));
    await page.reload();
    await expect(hero.locator(".riso-eyebrow")).toHaveText(eyebrow);
    await expect(hero).toContainText(empty);
  }
});

test("a day marked as no meal says so and has no Eating out", async ({ page }) => {
  await signUp(page);
  await page.clock.setFixedTime(atHour(18));
  await page.request.post("/api/planner/blank", {
    data: { weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner" },
  });
  await page.reload();
  const hero = page.locator(".riso-home-hero");
  await expect(hero).toContainText("Marked as no meal planned tonight.");
  await expect(hero.getByRole("button", { name: "Add a recipe" })).toBeVisible();
  await expect(hero.getByRole("button", { name: "Eating out" })).toHaveCount(0);
});

test("the all-meals strip: shadow on today's column and the meal on now only, none on next week", async ({ page }) => {
  await signUp(page);
  await page.clock.setFixedTime(atHour(12));
  await page.reload();
  await page.getByRole("button", { name: "All meals" }).click();
  const shadow = (loc) => loc.evaluate((el) => getComputedStyle(el).boxShadow);

  const today = page.locator(".riso-home-week-col.today");
  await expect(today).toHaveCount(1);
  expect(await shadow(today)).toContain("rgb(255, 72, 176)");
  // Lunch is on now: it alone, in today's column, has the small pink shadow.
  const current = page.locator(".riso-home-week-meal.current");
  await expect(current).toHaveCount(1);
  await expect(today.locator(".riso-home-week-meal.current i")).toHaveText("L");
  expect(await shadow(current)).toContain("rgb(255, 72, 176)");
  const others = page.locator(".riso-home-week-col:not(.today)");
  for (let i = 0; i < (await others.count()); i++) expect(await shadow(others.nth(i))).toBe("none");

  // The choice is remembered.
  await page.reload();
  await expect(page.locator(".riso-home-week-strip.all-meals")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suppers only" })).toBeVisible();

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.locator(".riso-home-week-col.today")).toHaveCount(0);
  await expect(page.locator(".riso-home-week-meal.current")).toHaveCount(0);
  const cols = page.locator(".riso-home-week-col");
  await expect(cols).toHaveCount(7);
  for (let i = 0; i < 7; i++) expect(await shadow(cols.nth(i))).toBe("none");
});

test("Use it up lists everything inside a month, soonest first, and scrolls inside the card", async ({ page }) => {
  await signUp(page);
  const names = [];
  for (let d = 1; d <= 24; d++) {
    const name = `Item ${String(d).padStart(2, "0")}`;
    names.push(name);
    await page.request.post("/api/pantry-inventory", {
      data: { name, location: "fridge", expiresAt: new Date(Date.now() + d * 86400000 + 3600000).toISOString() },
    });
  }
  // Past the month: not listed.
  await page.request.post("/api/pantry-inventory", {
    data: { name: "Rice flour", location: "pantry", expiresAt: new Date(Date.now() + 40 * 86400000).toISOString() },
  });
  await page.reload();
  const card = page.locator(".riso-home-useup");
  const rows = card.locator(".riso-useup-row");
  await expect(rows).toHaveCount(24);
  await expect(rows.locator(".riso-useup-name")).toHaveText(names);
  // Two to three days: pink; up to a week: yellow; later: blue.
  await expect(rows.nth(1).locator(".riso-useup-badge")).toHaveClass(/pink/);
  await expect(rows.nth(5).locator(".riso-useup-badge")).toHaveClass(/yellow/);
  await expect(rows.nth(20).locator(".riso-useup-badge")).toHaveClass(/blue/);
  // No "more" link: the list scrolls inside the card, which stays no taller
  // than the row it sits in.
  await expect(card.getByRole("button", { name: /more to use up/ })).toHaveCount(0);
  const list = card.locator(".riso-home-useup-scroll > .riso-home-rows");
  const { client, scroll } = await list.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(scroll).toBeGreaterThan(client);
  const proteins = page.locator(".riso-home-proteins");
  const [cardBox, proteinsBox] = await Promise.all([card.boundingBox(), proteins.boundingBox()]);
  expect(cardBox.height).toBeLessThanOrEqual(Math.max(proteinsBox.height, 360) + 1);
});

test("this week's suppers: only today has the pink shadow, other planned days a black one", async ({ page }) => {
  await signUp(page);
  await page.clock.setFixedTime(atHour(12));
  const recipe = await (await page.request.post("/api/recipes", { data: { title: "Shadow soup", ingredients: [{ name: "leek" }] } })).json();
  const weekStart = mondayOf(new Date());
  const today = todayIndex();
  const planned = [];
  for (let d = 0; d < 7; d++) {
    if (d === today || d > today) {
      await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: d, mealType: "dinner" } });
      planned.push(d);
    }
  }
  await page.reload();
  const shadow = (loc) => loc.evaluate((el) => getComputedStyle(el).boxShadow);
  const strip = page.locator(".riso-home-week-strip");
  const todayCell = strip.locator(".riso-home-week-day.today");
  await expect(todayCell).toHaveCount(1);
  expect(await shadow(todayCell)).toContain("rgb(255, 72, 176)");
  const others = strip.locator(".riso-home-week-day:not(.today):not(.empty):not(.past)");
  const n = await others.count();
  expect(n).toBe(planned.length - 1);
  for (let i = 0; i < n; i++) {
    const sh = await shadow(others.nth(i));
    expect(sh).not.toContain("rgb(255, 72, 176)");
    expect(sh).not.toBe("none");
  }
  const none = strip.locator(".riso-home-week-day.past, .riso-home-week-day.empty:not(.today)");
  for (let i = 0; i < (await none.count()); i++) expect(await shadow(none.nth(i))).toBe("none");
});

test("Makeable now steps aside when it has nothing, and Proteins on sale fills the row", async ({ page }) => {
  await signUp(page);
  await expect(page.locator(".riso-home-makeable")).toHaveCount(0);
  await expect(page.locator(".riso-home-bottom-row.three")).toHaveCount(0);
  await expect(page.locator(".riso-home-proteins")).toBeVisible();

  await page.request.post("/api/recipes", { data: { title: "Plain toast", ingredients: [{ name: "bread" }], instructions: ["Toast."] } });
  await page.request.post("/api/pantry-inventory", { data: { name: "bread", location: "pantry" } });
  await page.reload();
  await expect(page.locator(".riso-home-makeable .riso-home-makeable-num")).toHaveText("1");
  await expect(page.locator(".riso-home-bottom-row.three")).toHaveCount(1);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("today is in view in the week strip on load", async ({ page }) => {
    await signUp(page);
    // A Friday, so today sits off the left edge of a 7-column strip.
    const friday = new Date(`${mondayOf(new Date())}T12:00:00`);
    friday.setDate(friday.getDate() + 4);
    await page.clock.setFixedTime(friday);
    await page.reload();

    const strip = page.locator(".riso-home-week-strip");
    const today = strip.locator(".riso-home-week-day.today");
    await expect(today).toHaveCount(1);
    const s = await strip.boundingBox();
    const d = await today.boundingBox();
    expect(d.x).toBeGreaterThanOrEqual(s.x - 1);
    expect(d.x + d.width).toBeLessThanOrEqual(s.x + s.width + 1);
    // Only the strip moved, not the page.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The same for the all-meals grid.
    await page.getByRole("button", { name: "All meals" }).click();
    const col = page.locator(".riso-home-week-strip.all-meals .riso-home-week-col.today");
    const c = await col.boundingBox();
    const s2 = await page.locator(".riso-home-week-strip.all-meals").boundingBox();
    expect(c.x).toBeGreaterThanOrEqual(s2.x - 1);
    expect(c.x + c.width).toBeLessThanOrEqual(s2.x + s2.width + 1);
  });
});
