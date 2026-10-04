import { expect, test } from "@playwright/test";
import { langSwitch } from "./account-menu.js";

// Polish D: the Recipes toolbar and section headers, Add to Cookbook / Move to
// Imported, step timers, equal Planner cards, and button feedback.

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = (d) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dateKey(x);
};
function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return dateKey(x);
}

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `polish-d+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

const api = async (page, method, url, data) => await (await page.request.fetch(url, { method, data })).json();
const recipe = (page, title, extra = {}) =>
  api(page, "POST", "/api/recipes", { title, mealSlot: "dinner", ingredients: [{ name: "flour" }], ...extra });
const goRecipes = async (page) => {
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".riso-recipes")).toBeVisible();
};
const SVG = (c) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='30'><rect width='40' height='30' fill='${c}'/></svg>`)}`;

test.describe("Recipes toolbar and headers on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Cookbook, Imported and Sort share one line, every control the same size, with no sideways scroll", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry");
    const pad = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${pad.id}`, { inCookbook: false });
    await goRecipes(page);

    const row = page.locator(".riso-recipes-source-row");
    const boxes = await row.locator(".riso-filter-chip, .riso-recipes-sort-btn").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), h: Math.round(r.height), right: Math.round(r.right) };
      })
    );
    expect(boxes).toHaveLength(3); // Cookbook, Imported, the sort button
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1); // one line
    expect(boxes.every((b) => b.right <= 390)).toBe(true);
    // The same height as the filter chips under them.
    const chipHeight = await page.locator(".riso-recipes-filter-chips:not(.riso-recipes-source-chips) .riso-filter-chip").first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
    expect(new Set([...boxes.map((b) => b.h), chipHeight])).toEqual(new Set([32]));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(row.getByLabel("Sort recipes")).toBeVisible();
  });

  test("Cookbook and Imported are bigger, bolder bands; the meal types inside are plain smaller headers", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry");
    await goRecipes(page);
    const top = page.locator(".riso-recipes-section > .riso-recipes-head").first();
    const sub = page.locator(".riso-recipes-subsection > .riso-recipes-head").first();
    const look = (loc) =>
      loc.evaluate((e) => {
        const h2 = getComputedStyle(e.querySelector("h2"));
        return { size: parseFloat(h2.fontSize), weight: Number(h2.fontWeight), bg: getComputedStyle(e).backgroundColor, pad: parseFloat(getComputedStyle(e).paddingTop) };
      });
    const [a, b] = [await look(top), await look(sub)];
    expect(a.size).toBeGreaterThan(b.size);
    expect(a.weight).toBeGreaterThanOrEqual(b.weight);
    expect(a.bg).not.toBe("rgba(0, 0, 0, 0)"); // a coloured band
    expect(b.bg).toBe("rgba(0, 0, 0, 0)");
    expect(a.pad).toBeGreaterThan(0);
  });
});

test.describe("Add to Cookbook and Move to Imported", () => {
  test("from the recipe page and from its ⋯ menu, with no dragging", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signUp(page);
    const made = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${made.id}`, { inCookbook: false });
    await goRecipes(page);
    await expect(page.locator(".riso-recipes-section", { hasText: "Imported" })).toContainText("Pad thai");

    await page.locator(".riso-recipe-card", { hasText: "Pad thai" }).click();
    // On the recipe page.
    await page.getByRole("button", { name: "Add to my Cookbook" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your Cookbook." })).toBeVisible();
    expect((await api(page, "GET", `/api/recipes`)).find((r) => r.id === made.id).inCookbook).toBe(true);
    await expect(page.getByRole("button", { name: "Add to my Cookbook" })).toHaveCount(0);

    // From the ⋯ menu, back the other way.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.locator(".riso-rc-menu").getByRole("button", { name: "Move to Imported" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved to Imported." })).toBeVisible();
    expect((await api(page, "GET", `/api/recipes`)).find((r) => r.id === made.id).inCookbook).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.locator(".riso-recipes-section", { hasText: "Imported" })).toContainText("Pad thai");
  });

  test("on a phone, in French", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    const made = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${made.id}`, { inCookbook: false });
    await page.reload();
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await page.getByRole("button", { name: "Recettes", exact: true }).click();
    await page.locator(".riso-recipe-card", { hasText: "Pad thai" }).click();
    await page.getByRole("button", { name: "Plus d'actions" }).click();
    await page.locator(".riso-rc-menu").getByRole("button", { name: "Ajouter à mon livre de recettes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ajoutée à votre livre de recettes." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Déplacer vers Importées" }).first()).toBeVisible();
  });
});

test.describe("Step timers", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("tap the time to edit it; start, pause, resume and reset; Cook mode uses the edited time", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Boiled eggs", { instructions: ["Boil the eggs for 5 minutes.", "Serve."] });
    await goRecipes(page);
    await page.locator(".riso-recipe-card", { hasText: "Boiled eggs" }).click();

    const timer = page.locator(".riso-rc-timer");
    await expect(timer.locator(".riso-rc-timer-time")).toHaveText("⏱ 5:00");

    // Edit: 1 minute 30 seconds.
    await timer.locator(".riso-rc-timer-time").click();
    await expect(page.getByLabel("Minutes")).toHaveValue("5");
    await expect(page.getByLabel("Seconds")).toHaveValue("0");
    await page.getByLabel("Minutes").fill("1");
    await page.getByLabel("Seconds").fill("30");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(timer.locator(".riso-rc-timer-time")).toHaveText("⏱ 1:30");

    // Cancel leaves it alone.
    await timer.locator(".riso-rc-timer-time").click();
    await page.getByLabel("Minutes").fill("9");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(timer.locator(".riso-rc-timer-time")).toHaveText("⏱ 1:30");

    // Start, then pause: it stops where it is, and resumes from there.
    await timer.getByRole("button", { name: "▶ Start" }).click();
    await expect(timer.locator(".riso-rc-timer-time")).toContainText(/1:2\d/, { timeout: 4000 });
    await timer.getByRole("button", { name: "⏸ Pause" }).click();
    const paused = await timer.locator(".riso-rc-timer-time").innerText();
    await page.waitForTimeout(1300);
    await expect(timer.locator(".riso-rc-timer-time")).toHaveText(paused);
    await expect(timer.getByRole("button", { name: "▶ Resume" })).toBeVisible();

    // Reset goes back to the edited time.
    await timer.getByRole("button", { name: "Reset" }).click();
    await expect(timer.locator(".riso-rc-timer-time")).toHaveText("⏱ 1:30");
    await expect(timer.getByRole("button", { name: "▶ Start" })).toBeVisible();

    // Cook mode shows the same edited time.
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page.locator(".cm-timer-time")).toHaveText("1:30");
  });

  test("a timer started on the card keeps running in Cook mode", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Boiled eggs", { instructions: ["Boil the eggs for 5 minutes."] });
    await goRecipes(page);
    await page.locator(".riso-recipe-card", { hasText: "Boiled eggs" }).click();
    await page.locator(".riso-rc-timer").getByRole("button", { name: "▶ Start" }).click();
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page.locator(".cm-timer-time")).toHaveText(/4:5\d/, { timeout: 4000 });
    await expect(page.locator(".cm-timer-main")).toHaveText("Pause");
  });
});

test.describe("Planner cards are one size", () => {
  async function seed(page) {
    await signUp(page);
    const week = mondayOf(new Date());
    const photo = await recipe(page, "Chicken tikka masala with rice and a very long name", { photoUrl: SVG("#2a4bd7") });
    const plain = await recipe(page, "Pancakes");
    for (const [day, meal, r] of [[0, "dinner", photo], [0, "breakfast", plain], [1, "lunch", photo]]) {
      await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: week, dayOfWeek: day, mealType: meal } });
    }
    for (const [day, meal, note] of [
      [0, "lunch", "🍕"],
      [1, "dinner", "Out for supper at grandma's place, bring dessert and a card"],
      [2, "breakfast", undefined],
      [3, "lunch", "Leftovers"],
    ]) {
      await page.request.post("/api/planner/blank", { data: { weekStart: week, dayOfWeek: day, mealType: meal, note } });
    }
    await page.reload();
    await page.getByRole("button", { name: "Planner", exact: true }).click();
  }

  test("on desktop: photo, emoji, written, blank and empty slots all measure the same", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seed(page);
    await expect(page.locator(".riso-planner-cell").first()).toBeVisible();
    const sizes = await page.locator(".riso-planner-cell > *").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      })
    );
    expect(sizes).toHaveLength(21);
    expect(new Set(sizes).size).toBe(1);
    // Something of each kind is really on the board.
    for (const cls of [".riso-planner-card", ".riso-planner-note", ".riso-planner-cell-empty"]) {
      await expect(page.locator(cls).first()).toBeVisible();
    }
  });

  test("on a phone: the same for every slot of a day", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    for (const day of [0, 1, 2, 3, 4]) {
      await page.locator(".rpm-day").nth(day).click();
      const heights = await page.locator(".rpm-slot > :not(.rpm-slot-label)").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(heights).toHaveLength(3);
      expect(new Set(heights).size, `day ${day}: ${heights}`).toBe(1);
    }
  });
});

test.describe("Button feedback", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function groceryWithItem(page) {
    await signUp(page);
    const r = await recipe(page, "Roast chicken", { baseServings: 2, ingredients: [{ name: "chicken", quantity: 500, unit: "g" }] });
    await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: nextMonday(), dayOfWeek: 0, mealType: "dinner" } });
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
  }

  test("a button presses in softly, over about 220 ms", async ({ page }) => {
    await groceryWithItem(page);
    const box = page.getByRole("checkbox", { name: "Check off Chicken", exact: true });
    const duration = await box.evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration) * 1000);
    // Slow and soft: about 200 to 250 ms, easing out.
    expect(duration).toBeGreaterThanOrEqual(200);
    expect(duration).toBeLessThanOrEqual(250);
    expect(await box.evaluate((e) => getComputedStyle(e).transitionTimingFunction)).toMatch(/cubic-bezier/);
    const before = await box.evaluate((e) => getComputedStyle(e).transform);
    const b = await box.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const pressed = await box.evaluate((e) => getComputedStyle(e).transform);
    await page.mouse.up();
    expect(before).toBe("none");
    expect(pressed).not.toBe("none");
    // Not a 0.96 shrink you'd call a jump: a matrix with a scale under 1.
    expect(Number(pressed.match(/matrix\(([-\d.]+)/)[1])).toBeLessThan(1);
  });

  test("on a computer the whole grocery row lights up under the pointer", async ({ page }) => {
    await groceryWithItem(page);
    const row = page.locator(".riso-row").first();
    const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    // Point at the row's empty middle: not the checkbox, not a button.
    const b = await row.locator(".riso-row-main").boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(400);
    const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(after).not.toBe(before);
  });

  test("checking a grocery item pops the box once", async ({ page }) => {
    await groceryWithItem(page);
    const box = page.locator(".riso-row", { has: page.getByRole("checkbox", { name: "Check off Chicken", exact: true }) }).locator(".riso-row-check");
    await expect(box).not.toHaveClass(/pop/);
    await page.getByRole("checkbox", { name: "Check off Chicken", exact: true }).click();
    await expect(box).toHaveClass(/on/);
    await expect(box).toHaveClass(/pop/);
    expect(await box.evaluate((e) => getComputedStyle(e).animationName)).toBe("riso-check-pop");
    await expect(box).not.toHaveClass(/pop/, { timeout: 2000 }); // once, then it settles
  });

  test("with reduce motion on, nothing animates or transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await groceryWithItem(page);
    const hit = page.getByRole("checkbox", { name: "Check off Chicken", exact: true });
    expect(await hit.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
    await hit.click();
    const box = page.locator(".riso-row", { has: hit }).locator(".riso-row-check");
    await expect(box).toHaveClass(/on/);
    expect(await box.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  });
});
