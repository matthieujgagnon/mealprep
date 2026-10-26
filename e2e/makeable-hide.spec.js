import { expect, specNow, test, thisMonday } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { quebecDayIn } from "./quebec-day.js";

// « Masquer de Faisable » / "Hide from Makeable": Matt's own choice for one recipe (avocado toast: two
// ingredients, always "ready"). It is set from the recipe card's ⋯ menu (toast with Undo) or the
// editor's switch, and saved on the recipe. Makeable stops suggesting it: out of Ready now, the
// suggestion sections and every Makeable count (Makeable, Home, Recipes' "makeable now"). It stays on
// Recipes and in the Planner's search, stays in Meals of the week when it is planned this week, and is
// listed under the Makeable cards in "Hidden from Makeable" with "Show again". The meal-colour line
// is gone from the cards.

test.use({ viewport: { width: 1280, height: 1000 } });

async function signUp(page, tag, lang = "en") {
  const email = `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  if (lang !== "en") await page.request.patch("/api/auth/me", { data: { locale: lang } });
  return email;
}

// Avocado toast and Chicken rice are both "ready"; Beef stew is one short (no onion).
const RECIPES = [
  ["Avocado toast", ["bread", "avocado"], { mealSlots: ["breakfast"] }],
  ["Chicken rice", ["chicken", "rice"], { mealSlots: ["dinner"] }],
  ["Beef stew", ["beef", "carrot", "potato", "onion"], { mealSlots: ["dinner"] }],
];
const INVENTORY = ["bread", "avocado", "chicken", "rice", "beef", "carrot", "potato"];

async function seed(page, { hidden = [], planned = [] } = {}) {
  const made = {};
  for (const [title, ingredients, extra] of RECIPES) {
    const res = await page.request.post("/api/recipes", {
      data: { title, instructions: ["Cook it."], ingredients: ingredients.map((name) => ({ name })), ...extra },
    });
    made[title] = await res.json();
  }
  for (const name of INVENTORY) await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge", expiresAt: quebecDayIn(30, specNow()) } });
  for (const title of hidden) await page.request.put(`/api/recipes/${made[title].id}`, { data: { hiddenFromMakeable: true } });
  // Planned this week (Sunday is never in the past).
  for (const title of planned) {
    await page.request.post("/api/planner", { data: { recipeId: made[title].id, weekStart: thisMonday(), dayOfWeek: 6, mealType: "breakfast" } });
  }
  await page.reload();
  await expect(page.locator(".tab.active")).toBeVisible();
  return made;
}

async function openMakeable(page, name = "Makeable") {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".mk-title")).toBeVisible();
}

const card = (page, title) => page.locator(".mkc", { has: page.locator(".rpc-title", { hasText: title }) });
const ready = (page) => page.locator(".fnd-sec.ready .rpc-title");
const chipCount = (page, name) => page.locator(".fnd-seg-btn", { hasText: name }).locator(".fnd-seg-count");
const toast = (page) => page.locator(".riso-toast");

// The recipe card of a Makeable card, with its ⋯ menu open.
async function openMenu(page, title) {
  await card(page, title).locator(".rpc-open").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "More actions" }).click();
  return dialog;
}

test("hide avocado toast from its ⋯ menu: it leaves Makeable and its counts, Undo brings it back, a reload keeps it, and it stays everywhere else", async ({ page }) => {
  await signUp(page, "hide-flow");
  await seed(page);

  // Both are ready to begin with, on Makeable, on Home and in Recipes' count.
  await expect(page.locator(".riso-home-makeable-num")).toHaveText("2");
  await openMakeable(page);
  await expect(ready(page)).toHaveText(["Avocado toast", "Chicken rice"]);
  await expect(chipCount(page, "Makeable now")).toHaveText("2");
  await expect(page.locator(".mk-hidden")).toHaveCount(0); // nothing is hidden: no strip

  // Hide it from the recipe card's ⋯ menu. The item sits before Delete.
  const dialog = await openMenu(page, "Avocado toast");
  await expect(dialog.locator(".riso-rc-menu").getByRole("menuitem")).toHaveText(["Plan around this", "Edit recipe", "Move to Imported", "Hide from Makeable", "Delete recipe"]);
  await dialog.getByRole("menuitem", { name: "Hide from Makeable" }).click();
  await expect(toast(page)).toContainText("“Avocado toast” is hidden from Makeable.");
  // Behind the card, Makeable already left it out, and its counts.
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await expect(chipCount(page, "Makeable now")).toHaveText("1");
  await expect(chipCount(page, "All")).toHaveText("2");

  // Undo puts it back, and the menu offers Hide again.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(ready(page)).toHaveText(["Avocado toast", "Chicken rice"]);
  await expect(page.locator(".mk-hidden")).toHaveCount(0);
  await dialog.getByRole("button", { name: "More actions" }).click();
  await expect(dialog.getByRole("menuitem", { name: "Hide from Makeable" })).toBeVisible();

  // Hide it for good, and let the card go.
  await dialog.getByRole("menuitem", { name: "Hide from Makeable" }).click();
  await expect(toast(page)).toContainText("is hidden from Makeable.");
  await expect.poll(async () => (await (await page.request.get("/api/recipes")).json()).find((r) => r.title === "Avocado toast").hiddenFromMakeable).toBe(true);
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);

  // A reload keeps the choice: Makeable, its counts, Home and Recipes' count all agree.
  await page.reload();
  await expect(page.locator(".tab.active")).toBeVisible();
  await expect(page.locator(".riso-home-makeable-num")).toHaveText("1");
  await openMakeable(page);
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await expect(page.locator(".fnd-sec.few .rpc-title")).toHaveText(["Beef stew"]);
  await expect(chipCount(page, "All")).toHaveText("2");
  await expect(chipCount(page, "Makeable now")).toHaveText("1");
  await expect(chipCount(page, "1 or 2 to buy")).toHaveText("1");
  // The pantry-and-sides setting is about kinds of recipes: it does not bring it back.
  await page.getByRole("button", { name: "Include sides, desserts and prepared" }).click();
  await expect(page.locator(".fnd-card .rpc-title, .mkc .rpc-title")).not.toContainText(["Avocado toast"]);
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await page.getByRole("button", { name: "Include sides, desserts and prepared" }).click();

  // "Hidden from Makeable" lists it under the cards, closed to begin with.
  const strip = page.locator(".mk-hidden");
  await expect(strip.locator(".riso-removed-count")).toHaveText("1");
  await expect(strip.locator(".riso-removed-row")).toHaveCount(0);
  await strip.getByRole("button", { name: /Hidden from Makeable/ }).click();
  await expect(strip.locator(".riso-removed-row")).toHaveCount(1);
  await expect(strip.locator(".riso-removed-name")).toHaveText("Avocado toast");
  await expect(strip.locator(".riso-removed-meta")).toHaveText("Breakfast");
  await expect(strip.locator(".riso-removed-name")).toHaveCSS("text-decoration-line", "none"); // hidden, not removed: no strike-through

  // Still in Recipes, where nothing was hidden, and no meal-colour line on any card.
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".rpc", { hasText: "Avocado toast" })).toBeVisible();
  await expect(page.locator(".rpc", { hasText: "Avocado toast" }).locator(".rpc-cap-meal")).toHaveText("Breakfast");
  await expect(page.getByText(/3 RECIPES · 1 MAKEABLE NOW/)).toBeVisible();
  await expect(page.locator(".rpc-line")).toHaveCount(0);

  // Still in the Planner's search, which is not Makeable; only its Makeable now chip leaves it.
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.locator(".fnd-card .rpc-title").first()).toBeVisible();
  expect((await page.locator(".fnd-card .rpc-title").allTextContents()).sort()).toEqual(["Avocado toast", "Beef stew", "Chicken rice"]);
  await page.locator(".fnd-seg-btn", { hasText: "Makeable now" }).click();
  await expect(page.locator(".fnd-card .rpc-title")).toHaveText(["Chicken rice"]);

  // Show again brings it back, with Undo, and the strip goes.
  await openMakeable(page);
  await strip.getByRole("button", { name: /Hidden from Makeable/ }).click();
  await strip.getByRole("button", { name: "Show “Avocado toast” on Makeable again" }).click();
  await expect(toast(page)).toContainText("“Avocado toast” is back on Makeable.");
  await expect(ready(page)).toHaveText(["Avocado toast", "Chicken rice"]);
  await expect(page.locator(".mk-hidden")).toHaveCount(0);
  await expect(page.locator(".rpc-line")).toHaveCount(0);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await expect(page.locator(".mk-hidden .riso-removed-count")).toHaveText("1");
});

test("a hidden recipe planned this week stays in Meals of the week, and is out of Ready now and its count", async ({ page }) => {
  await signUp(page, "hide-planned");
  await seed(page, { hidden: ["Avocado toast"], planned: ["Avocado toast"] });
  await openMakeable(page);

  await expect(page.locator(".fnd-sec-title")).toHaveText(["Meals of the week", "Ready now", "One or two short"]);
  await expect(page.locator(".fnd-sec.week .fnd-sec-count")).toHaveText("1");
  await page.locator(".fnd-sec.week .fnd-sec-toggle").click();
  await expect(page.locator(".fnd-sec.week .rpc-title")).toHaveText(["Avocado toast"]);
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await expect(chipCount(page, "Makeable now")).toHaveText("1");
  // The Makeable now chip leaves it out too; the other chips' counts never counted it.
  await page.locator(".fnd-seg-btn", { hasText: "Makeable now" }).click();
  await expect(page.locator(".fnd-sec-title")).toHaveText(["Ready now"]);
  await expect(page.getByText("Avocado toast", { exact: true })).toHaveCount(0);
  // It can still be shown again from the list.
  await expect(page.locator(".mk-hidden .riso-removed-count")).toHaveText("1");
});

test("the editor has the same choice: a switch, saved with the recipe", async ({ page }) => {
  await signUp(page, "hide-editor");
  await seed(page);
  await openMakeable(page);

  const dialog = await openMenu(page, "Avocado toast");
  await dialog.getByRole("menuitem", { name: "Edit recipe" }).click();
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();
  const hide = page.getByRole("switch", { name: "Hide from Makeable" });
  await expect(hide).toHaveAttribute("aria-checked", "false");
  await hide.click();
  await expect(hide).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(async () => (await (await page.request.get("/api/recipes")).json()).find((r) => r.title === "Avocado toast").hiddenFromMakeable).toBe(true);
  await page.reload();
  await openMakeable(page);
  await expect(ready(page)).toHaveText(["Chicken rice"]);
  await expect(page.locator(".mk-hidden .riso-removed-count")).toHaveText("1");

  // The recipe card's menu now offers to show it again, and the server refuses a choice that is not a yes or no.
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: "Avocado toast" }).first().click();
  const card2 = page.getByRole("dialog", { name: "Avocado toast" });
  await card2.getByRole("button", { name: "More actions" }).click();
  await expect(card2.getByRole("menuitem", { name: "Show in Makeable" })).toBeVisible();
  const recipes = await (await page.request.get("/api/recipes")).json();
  const bad = await page.request.put(`/api/recipes/${recipes.find((r) => r.title === "Avocado toast").id}`, { data: { hiddenFromMakeable: "yes" } });
  expect(bad.status()).toBe(400);
});

// Every word of it in French, at the phone's width: the menu item, the toast, the list and the editor's switch fit.
test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("« Masquer de Faisable », the list and « Afficher de nouveau » fit at 390 px", async ({ page }) => {
    await signUp(page, "hide-fr", "fr");
    await seed(page);
    await openMakeable(page, "Faisable");
    await expect(ready(page)).toHaveText(["Avocado toast", "Chicken rice"]);

    await card(page, "Avocado toast").locator(".rpc-open").click();
    const dialog = page.getByRole("dialog", { name: "Avocado toast" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Plus d'actions" }).click();
    const menu = dialog.locator(".riso-rc-menu");
    const hide = menu.getByRole("menuitem", { name: "Masquer de Faisable" });
    await expect(hide).toBeVisible();
    expect(await fitProblems(page, ".riso-rc-menu")).toEqual([]);
    await hide.click();
    await expect(toast(page)).toContainText("« Avocado toast » est masquée de Faisable.");
    await expect(ready(page)).toHaveText(["Chicken rice"]);
    await dialog.getByRole("button", { name: "Fermer" }).first().click();
    await expect(dialog).toHaveCount(0);

    // The list, closed then open, and its button in French.
    const strip = page.locator(".mk-hidden");
    await strip.scrollIntoViewIfNeeded();
    await expect(strip.getByRole("button", { name: /Masquées de Faisable/ })).toBeVisible();
    await strip.getByRole("button", { name: /Masquées de Faisable/ }).click();
    await expect(strip.locator(".riso-removed-name")).toHaveText("Avocado toast");
    const again = strip.getByRole("button", { name: "Afficher de nouveau « Avocado toast » dans Faisable" });
    await expect(again).toContainText("Afficher de nouveau");
    expect(await fitProblems(page, ".mk-hidden")).toEqual([]);

    // The editor's switch and its words fit too.
    await page.getByRole("button", { name: "Recettes", exact: true }).click();
    await page.locator(".rpc", { hasText: "Avocado toast" }).first().click();
    const card2 = page.getByRole("dialog", { name: "Avocado toast" });
    await card2.getByRole("button", { name: "Plus d'actions" }).click();
    await expect(card2.getByRole("menuitem", { name: "Afficher dans Faisable" })).toBeVisible();
    expect(await fitProblems(page, ".riso-rc-menu")).toEqual([]);
    await card2.getByRole("menuitem", { name: "Modifier la recette" }).click();
    const hideSwitch = page.getByRole("switch", { name: "Masquer de Faisable" });
    await hideSwitch.scrollIntoViewIfNeeded();
    await expect(hideSwitch).toHaveAttribute("aria-checked", "true");
    expect(await fitProblems(page, ".re-page")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// Whether every button and line of text inside `root` fits its box and the window at 390 px, and the
// page never scrolls sideways.
function fitProblems(page, root) {
  return page.evaluate((selector) => {
    const out = [];
    const box = document.querySelector(selector);
    if (!box) return [`${selector} is not on the page`];
    for (const el of box.querySelectorAll("button, a, [role='menuitem'], .riso-removed-name, .riso-removed-meta, .re-switch-text")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const name = el.getAttribute("aria-label") || el.textContent.trim();
      if (el.scrollWidth > el.clientWidth + 1) out.push(`"${name}" cuts its text`);
      if (r.left < -1 || r.right > window.innerWidth + 1) out.push(`"${name}" sticks out of the window`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth) out.push("the page scrolls sideways");
    return out;
  }, root);
}
