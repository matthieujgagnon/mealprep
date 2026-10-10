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

test.describe("Recipes on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the search pill and + New recipe stack; Cookbook and Imported share a line; Time and Sort share a row under them and the chips (All, Quick, Meal, Protein) one more; no sideways scroll", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry");
    const pad = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${pad.id}`, { inCookbook: false });
    await goRecipes(page);

    const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; });
    // The button is under the search pill, the full width of it.
    const pill = await box(page.locator(".rv2-searchpill"));
    const add = await box(page.getByRole("button", { name: "+ New recipe" }));
    expect(add.top).toBeGreaterThan(pill.top + pill.h - 1);
    expect(add.w).toBe(pill.w);
    // Cookbook and Imported side by side.
    const tabs = [await box(page.getByRole("tab", { name: /^Cookbook/ })), await box(page.getByRole("tab", { name: /^Imported/ }))];
    expect(tabs[0].top).toBe(tabs[1].top);
    expect(tabs.every((b) => b.right <= 390)).toBe(true);
    // Time and Sort side by side, the same size.
    const menus = [];
    for (const name of [/^TIME/, /^SORT/]) menus.push(await box(page.getByRole("button", { name })));
    expect(menus[0].top).toBe(menus[1].top);
    expect(menus[0].w).toBe(menus[1].w);
    expect(menus.every((m) => m.right <= 390)).toBe(true);
    // The chips: All, Quick, Meal and Protein on one row under them.
    const chips = [];
    for (const name of [/^All$/, /^Quick$/, /^MEAL/, /^PROTEIN/]) chips.push(await box(page.locator(".rv2-chips").getByRole("button", { name })));
    expect(new Set(chips.map((c) => c.top)).size).toBe(1);
    expect(chips[0].top).toBeGreaterThan(menus[0].top);
    expect(chips.every((c) => c.right <= 390 && c.h >= 40)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("the cards sit two across, with no folding sections", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry");
    await recipe(page, "Beef stew");
    await recipe(page, "Fish pie");
    await goRecipes(page);
    await expect(page.locator(".riso-recipes-head")).toHaveCount(0);
    const cards = page.locator(".rpc");
    await expect(cards).toHaveCount(3);
    const lefts = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) }; }));
    expect(lefts[0].top).toBe(lefts[1].top); // two on the first row
    expect(lefts[2].top).toBeGreaterThan(lefts[0].top); // the third wraps
    expect(lefts[2].left).toBe(lefts[0].left);
    expect(lefts[0].w).toBe(lefts[1].w);
    expect(lefts[0].w).toBeLessThan(200);
  });

  test("the Meal chip picks a meal type, and a click outside closes it", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Chicken curry");
    await recipe(page, "Toast", { mealSlot: "breakfast" });
    await goRecipes(page);
    const meal = page.getByRole("button", { name: /^MEAL/ });
    await meal.click();
    await page.getByRole("option", { name: /^Breakfast/ }).click();
    await expect(meal).toContainText("Breakfast");
    await expect(page.locator(".rpc-title")).toHaveText(["Toast"]);
    await meal.click();
    await expect(page.getByRole("listbox", { name: /^MEAL/ })).toBeVisible();
    await page.locator(".riso-recipes-title").click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });
});

test.describe("Add to Cookbook and Move to Imported", () => {
  test("from the recipe page and from its ⋯ menu, with no dragging", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signUp(page);
    const made = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${made.id}`, { inCookbook: false });
    await goRecipes(page);
    await page.getByRole("tab", { name: /^Imported/ }).click();
    await expect(page.locator(".rv2-grid")).toContainText("Pad thai");

    await page.locator(".rpc", { hasText: "Pad thai" }).click();

    await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
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
    await expect(page.locator(".rv2-grid")).toContainText("Pad thai");
  });

  test("on a phone, in French", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    const made = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${made.id}`, { inCookbook: false });
    await page.reload();
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await page.getByRole("button", { name: "Recettes", exact: true }).click();
    // Pad thai is an imported recipe: open that tab, as its English twin does.
    await page.getByRole("tab", { name: /^Importées/ }).click();
    await page.locator(".rpc", { hasText: "Pad thai" }).click();
    await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
    await page.getByRole("button", { name: "Plus d'actions" }).click();
    await page.locator(".riso-rc-menu").getByRole("button", { name: "Ajouter à mon livre de recettes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ajoutée à votre livre de recettes." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Déplacer vers Importées" }).first()).toBeVisible();
  });
});

test.describe("The Recipes page's starting tab", () => {
  // The recipes are held back until the test lets them through, so the page is
  // open before they arrive.
  async function openRecipesBeforeTheyArrive(page) {
    await signUp(page);
    const made = await recipe(page, "Pad thai");
    await api(page, "PUT", `/api/recipes/${made.id}`, { inCookbook: false });
    let letThrough;
    const gate = new Promise((resolve) => (letThrough = resolve));
    await page.route("**/api/recipes", async (route) => {
      if (route.request().method() === "GET") await gate;
      await route.continue();
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.getByRole("tab", { name: /^Cookbook/ })).toHaveAttribute("aria-selected", "true");
    return letThrough;
  }

  test("is picked once the recipes have arrived: Imported when the Cookbook is empty", async ({ page }) => {
    const letThrough = await openRecipesBeforeTheyArrive(page);
    letThrough();
    await expect(page.getByRole("tab", { name: /^Imported/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".rpc", { hasText: "Pad thai" })).toBeVisible();
  });

  test("stays where the person tapped, even if the recipes then arrive", async ({ page }) => {
    const letThrough = await openRecipesBeforeTheyArrive(page);
    await page.getByRole("tab", { name: /^Cookbook/ }).click();
    letThrough();
    await expect(page.getByRole("tab", { name: /^Imported/ })).toContainText("1");
    // Let the page finish reacting to them (two frames), then look: it must not have moved.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page.getByRole("tab", { name: /^Cookbook/ })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Step timers", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("tap the time to edit it; start, pause, resume and reset; Cook mode uses the edited time", async ({ page }) => {
    await signUp(page);
    await recipe(page, "Boiled eggs", { instructions: ["Boil the eggs for 5 minutes.", "Serve."] });
    await goRecipes(page);
    await page.locator(".rpc", { hasText: "Boiled eggs" }).click();
    await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();

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
    await page.locator(".rpc", { hasText: "Boiled eggs" }).click();
    await page.getByRole("button", { name: /Open the full recipe|Ouvrir la recette complète/ }).click();
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

  test("on a phone: every cell of the week board measures the same", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await expect(page.locator(".pmb")).toBeVisible();
    const sizes = await page.locator(".pmb-cell > *").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      })
    );
    expect(sizes).toHaveLength(21);
    expect(new Set(sizes).size, sizes.join(" ")).toBe(1);
    // Something of each kind is really on the board.
    for (const cls of [".riso-planner-card", ".riso-planner-note", ".pmb-empty"]) {
      await expect(page.locator(cls).first()).toBeVisible();
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
    expect(before).toBe("none");
    // Not a 0.96 shrink you'd call a jump: it eases in, to a matrix with a scale under 1.
    await expect
      .poll(async () => {
        const pressed = await box.evaluate((e) => getComputedStyle(e).transform);
        const scale = pressed.match(/matrix\(([-\d.]+)/);
        return scale ? Number(scale[1]) : 1;
      })
      .toBeLessThan(1);
    await page.mouse.up();
  });

  test("on a computer the whole grocery row lights up under the pointer", async ({ page }) => {
    await groceryWithItem(page);
    const row = page.locator(".riso-row").first();
    const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    // Point at the row's empty middle: not the checkbox, not a button.
    const b = await row.locator(".riso-row-main").boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => row.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(before);
  });

  test("checking a grocery item pops the box once", async ({ page }) => {
    await groceryWithItem(page);
    const box = page.locator(".riso-row", { has: page.getByRole("checkbox", { name: "Check off Chicken", exact: true }) }).locator(".riso-row-check");
    await expect(box).not.toHaveClass(/pop/);
    // The pop is over in a fraction of a second, and on a busy machine the test's own steps can
    // take longer than that. So the page writes down what the box does, as it does it: each time
    // `pop` comes on (and which animation it has then), and each time it goes off.
    await box.evaluate((el) => {
      el.popLog = [];
      let had = el.classList.contains("pop");
      new MutationObserver(() => {
        const has = el.classList.contains("pop");
        if (has !== had) el.popLog.push(has ? `on: ${getComputedStyle(el).animationName}` : "off");
        had = has;
      }).observe(el, { attributes: true, attributeFilter: ["class"] });
    });
    await page.getByRole("checkbox", { name: "Check off Chicken", exact: true }).click();
    await expect(box).toHaveClass(/on/);
    // Once, then it settles.
    await expect.poll(() => box.evaluate((el) => el.popLog)).toEqual(["on: riso-check-pop", "off"]);
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
