import fs from "node:fs";
import path from "node:path";
import { expect, mondayAfter, test, thisMonday, todayIndex } from "./spec-clock.js";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_INVITE } from "./invite.js";
import { openHelp } from "./account-menu.js";
import { itemForm } from "./inventory-form.js";

// « Je l'ai comme… » / "I have it as…" and the matcher's better rules for names it used
// to miss (lib/inventoryMatch.js, lib/inventoryLinks.js):
//   - the recipe says "rice vinegar" and Inventory has "Rice wine vinegar": the line is
//     blue and the Grocery list leaves it under Already at home;
//   - a name the rules don't know ("tamari" and "Soy sauce") is taught from the recipe
//     card's row drawer; it still counts after a reload, it adds nothing to Inventory,
//     and its × (Also counts as, in the Inventory item pop-up) puts it back to To buy;
//   - Undo of a teach and a remove, and the planned-meal card's ≈ button and the
//     Grocery row's link;
//   - at 390px in French the pop-up, the chip button and the Grocery link fit.
//   - for now it is for admins only: a tester (an account not in ADMIN_EMAILS) sees none of
//     those entry points, nor the Help about them, and the server answers 403 to teaching or
//     removing a link and an empty list to reading them. The admin account here is made in
//     the database (playwright.config.js lists it), the same way as e2e/admin.spec.js.
// Set SHOTS_DIR to also save the screenshots of the four pieces there.

const prisma = new PrismaClient();
const ADMIN = "e2e-links-admin@example.com";
const PASSWORD = "adminpass123";

// One admin account is shared, so these tests run one after the other, each on a fresh copy of it.
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await prisma.$disconnect();
});

const TITLE = "Crispy Wonton Chicken Salad";
const INGREDIENTS = ["boneless skinless chicken breasts", "wonton wrappers", "rice vinegar", "low sodium soy sauce", "tamari", "sesame oil"];
const INVENTORY = ["Rice wine vinegar", "Soy sauce", "Chicken breast", "Toasted sesame oil"];

// The signed-in account: the admin by default (a new copy of the account each time, so nothing
// of an earlier test is left), or `admin: false` for a tester who signs up like anyone else.
async function setup(page, { lang = "en", admin = true } = {}) {
  const words = lang === "fr" ? { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" } : { signUp: "Sign up", create: "Create account", home: "Home" };
  await page.goto("/");
  if (admin) {
    await prisma.user.deleteMany({ where: { email: ADMIN } });
    await prisma.user.create({ data: { email: ADMIN, passwordHash: await bcrypt.hash(PASSWORD, 10), locale: lang } });
    await page.fill('input[type="email"]', ADMIN);
    await page.fill('input[type="password"]', PASSWORD);
    await page.locator('input[type="password"]').press("Enter");
  } else {
    await page.getByRole("button", { name: words.signUp }).click();
    await page.fill('input[type="email"]', `links+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
    await page.fill('input[type="password"]', "testpass123");
    await page.fill('input[name="invite"]', E2E_INVITE);
    await page.getByRole("button", { name: words.create }).click();
  }
  await expect(page.locator(".tab.active")).toHaveText(words.home);
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: { title: TITLE, mealSlot: "dinner", baseServings: 2, instructions: ["Fry the wontons.", "Toss it all."], ingredients: INGREDIENTS.map((name) => ({ name })) },
    })
  ).json();
  // Next week, so its meal is always ahead and on the Grocery list.
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayAfter(1), dayOfWeek: 0, mealType: "dinner" } });
  for (const name of INVENTORY) await page.request.post("/api/pantry-inventory", { data: { name, location: "pantry" } });
  await page.reload();
  return recipe;
}

const L = {
  en: { recipes: "Recipes", grocery: "Grocery", inventory: "Inventory", planner: "Planner", haveAs: "I have it as…", alsoCounts: "Also counts as:", gotIt: "Got it" },
  fr: { recipes: "Recettes", grocery: "Épicerie", inventory: "Inventaire", planner: "Planificateur", haveAs: "Je l'ai comme…", alsoCounts: "Compte aussi comme :", gotIt: "Compris" },
};
const tab = (page, name) => page.getByRole("button", { name, exact: true }).first();

async function openCard(page, lang = "en") {
  await tab(page, L[lang].recipes).click();
  await page.locator(".rpc-title", { hasText: TITLE }).first().click();
  const card = page.getByRole("dialog", { name: TITLE });
  await expect(card).toBeVisible();
  return card;
}

const buyRow = (card, name) => card.locator(".riso-rc-buy", { hasText: name });
const haveRow = (card, name) => card.locator(".riso-rc-have", { hasText: name });
const inventoryCount = async (page) => (await (await page.request.get("/api/pantry-inventory")).json()).length;
const links = async (page) => (await (await page.request.get("/api/inventory-links")).json());

async function noSidewaysScroll(page, within) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  const cramped = await within.evaluate((box, width) =>
    [...box.querySelectorAll("button, h2, p, input, .riso-linkpop-name, .riso-linkpop-shelf")]
      .filter((e) => e.offsetParent && (e.getBoundingClientRect().right > width + 1 || e.getBoundingClientRect().left < -1))
      .map((e) => `${e.className || e.tagName}: ${(e.textContent || "").trim().slice(0, 40)}`),
  page.viewportSize().width);
  expect(cramped).toEqual([]);
}

let shot = 0;
async function save(page, locator, name) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await (locator || page).screenshot({ path: path.join(dir, `${name}.png`) });
  shot++;
}

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("the recipe's rice vinegar is the Rice wine vinegar in Inventory: blue on the card, and at home on Grocery", async ({ page }) => {
    await setup(page);
    const card = await openCard(page);
    // The rules, not a link: all four are in Inventory, and the card says nothing about a link.
    await expect(card.locator(".riso-rc-have-head")).toContainText("In your Inventory · 4");
    for (const name of ["Rice vinegar", "Low sodium soy sauce", "Boneless skinless chicken breasts", "Sesame oil"]) await expect(haveRow(card, name)).toHaveCount(1);
    await expect(buyRow(card, "Rice vinegar")).toHaveCount(0);
    await expect(card.locator(".riso-rc-buy")).toHaveText([/Wonton wrappers/, /Tamari/]);
    await haveRow(card, "Rice vinegar").locator(".riso-rc-have-line").click();
    await expect(haveRow(card, "Rice vinegar").locator(".riso-rc-because")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await tab(page, L.en.grocery).click();
    await page.getByRole("button", { name: L.en.gotIt }).click();
    await expect(page.locator(".riso-row-name")).toHaveText(["Tamari", "Wonton wrapper"]);
    const strip = page.locator(".riso-grocery-athome");
    await strip.getByRole("button", { name: /Already at home/ }).click();
    await expect(strip.locator(".riso-removed-name")).toContainText(["Boneless skinless chicken breast", "Low sodium soy sauce", "Rice vinegar", "Sesame oil"]);
  });

  test("teach a name the rules don't know: it counts at once, after a reload, adds nothing to Inventory, and × undoes it", async ({ page }) => {
    await setup(page);
    const before = await inventoryCount(page);
    const card = await openCard(page);
    await expect(buyRow(card, "Tamari")).toHaveCount(1);

    // The drawer has "I have it" and "I have it as…" side by side.
    await buyRow(card, "Tamari").locator(".riso-rc-buy-main").click();
    const drawer = buyRow(card, "Tamari").locator(".riso-rc-drawer");
    await expect(drawer.getByRole("button", { name: "I have it", exact: true })).toBeVisible();
    await save(page, buyRow(card, "Tamari"), "desktop-en-1-drawer-button");
    await drawer.getByRole("button", { name: L.en.haveAs }).click();

    // The shared pop-up: a search box and the Inventory items, no leftovers or prepared meals.
    const pop = page.getByRole("dialog", { name: L.en.haveAs });
    await expect(pop).toBeVisible();
    await expect(pop.locator(".riso-linkpop-name")).toHaveText(["Chicken breast", "Rice wine vinegar", "Soy sauce", "Toasted sesame oil"]);
    await save(page, null, "desktop-en-4-popup");
    await pop.getByRole("searchbox").fill("soy");
    await expect(pop.locator(".riso-linkpop-name")).toHaveText(["Soy sauce"]);
    await pop.getByRole("searchbox").fill("zzz");
    await expect(pop.locator(".riso-linkpop-empty")).toContainText("No item matches");
    await pop.getByRole("searchbox").fill("soy");
    await pop.getByRole("button", { name: /Soy sauce/ }).click();

    // One pick saves at once, with a toast.
    await expect(page.locator(".riso-toast")).toContainText("Soy sauce now counts as Tamari");
    await expect(pop).toHaveCount(0);
    await expect(buyRow(card, "Tamari")).toHaveCount(0);
    await expect(card.locator(".riso-rc-have-head")).toContainText("In your Inventory · 5");
    // Blue because you said so: the drawer says which link.
    await haveRow(card, "Tamari").locator(".riso-rc-have-line").click();
    await expect(haveRow(card, "Tamari").locator(".riso-rc-because")).toContainText("Counts because you said Soy sauce counts as Tamari.");
    // It added nothing to Inventory.
    expect(await inventoryCount(page)).toBe(before);
    await expect.poll(async () => (await links(page)).length).toBe(1);
    expect((await links(page))[0]).toMatchObject({ recipeName: "tamari", itemName: "soy sauce", recipeLabel: "Tamari", itemLabel: "Soy sauce" });

    // Still counts after a reload (the list comes from the server).
    await page.reload();
    const again = await openCard(page);
    await expect(haveRow(again, "Tamari")).toHaveCount(1);
    await expect(buyRow(again, "Tamari")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The Inventory item says it, with a ×.
    await tab(page, L.en.inventory).click();
    await page.getByText("Soy sauce", { exact: true }).first().click();
    const form = page.getByRole("dialog").filter({ hasText: L.en.alsoCounts });
    await expect(form.locator(".riso-itemform-also .riso-linkchip")).toHaveText(["Tamari×"]);
    await form.getByRole("button", { name: "Stop counting Soy sauce as Tamari" }).click();
    await expect(page.locator(".riso-toast")).toContainText("Soy sauce no longer counts as Tamari");
    await expect(form.locator(".riso-itemform-also")).toHaveCount(0);
    await expect.poll(async () => (await links(page)).length).toBe(0);
    await page.keyboard.press("Escape");

    // It is To buy again.
    const last = await openCard(page);
    await expect(buyRow(last, "Tamari")).toHaveCount(1);
    expect(await inventoryCount(page)).toBe(before);
  });

  test("Undo of a teach takes the link away, and Undo of a remove puts it back", async ({ page }) => {
    await setup(page);
    const card = await openCard(page);
    await buyRow(card, "Tamari").locator(".riso-rc-buy-main").click();
    await buyRow(card, "Tamari").getByRole("button", { name: L.en.haveAs }).click();
    await page.getByRole("dialog", { name: L.en.haveAs }).getByRole("button", { name: /Soy sauce/ }).click();
    await expect(haveRow(card, "Tamari")).toHaveCount(1);

    // Undo: To buy again (its drawer still open), and the server has none.
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(buyRow(card, "Tamari")).toHaveCount(1);
    await expect.poll(async () => (await links(page)).length).toBe(0);

    // Teach again, remove from the blue row's drawer, then Undo that.
    await buyRow(card, "Tamari").getByRole("button", { name: L.en.haveAs }).click();
    await page.getByRole("dialog", { name: L.en.haveAs }).getByRole("button", { name: /Soy sauce/ }).click();
    await expect.poll(async () => (await links(page)).length).toBe(1);
    await haveRow(card, "Tamari").locator(".riso-rc-have-line").click();
    await haveRow(card, "Tamari").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator(".riso-toast")).toContainText("Soy sauce no longer counts as Tamari");
    await expect(buyRow(card, "Tamari")).toHaveCount(1);
    await expect.poll(async () => (await links(page)).length).toBe(0);
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(haveRow(card, "Tamari")).toHaveCount(1);
    await expect.poll(async () => (await links(page)).length).toBe(1);
  });

  test("the Grocery row's link, and the planned-meal card's ≈ button, teach the same way", async ({ page }) => {
    await setup(page);
    await tab(page, L.en.grocery).click();
    await page.getByRole("button", { name: L.en.gotIt }).click();
    const row = page.locator(".riso-row", { has: page.locator(".riso-row-name", { hasText: "Tamari" }) });
    await save(page, row, "desktop-en-3-grocery-link");
    await row.getByRole("button", { name: /I have it as/ }).click();
    await page.getByRole("dialog", { name: L.en.haveAs }).getByRole("button", { name: /Soy sauce/ }).click();
    await expect(page.locator(".riso-toast")).toContainText("Soy sauce now counts as Tamari");
    await expect(page.locator(".riso-row-name")).toHaveText(["Wonton wrapper"]);
    // Store mode keeps its rows as they were: no link there.
    await expect(page.locator(".riso-row-haveas")).toHaveCount(1);

    // The planned meal's card: a small button beside the chip of what is still to buy.
    // (Both the teach and its Undo show at once and are saved behind: wait for the teach to land, so
    // the Undo's save is the last one, before looking at what the server has.)
    await expect.poll(async () => (await links(page)).length).toBe(1);
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".riso-row-name")).toHaveText(["Tamari", "Wonton wrapper"]);
    // The Undo shows at once and the save follows: wait until the server has taken the link away before reloading.
    await expect.poll(async () => (await links(page)).length).toBe(0);
    await page.request.post("/api/planner", { data: { recipeId: (await (await page.request.get("/api/recipes")).json())[0].id, weekStart: thisMonday(), dayOfWeek: todayIndex(), mealType: "dinner" } });
    await page.reload();
    await tab(page, L.en.planner).click();
    const day = todayIndex();
    await page.locator(".riso-planner-cell").nth(2 * 7 + day).locator(".riso-planner-card").click();
    const planned = page.getByRole("dialog", { name: TITLE });
    const chip = planned.locator(".ing-marks-buy", { hasText: "Tamari" });
    await expect(chip.locator(".ing-marks-haveas")).toBeVisible();
    await save(page, planned, "desktop-en-2-chip-button");
    await chip.locator(".ing-marks-haveas").click();
    await page.getByRole("dialog", { name: L.en.haveAs }).getByRole("button", { name: /Soy sauce/ }).click();
    await expect(planned.locator(".ing-marks-have .riso-pill", { hasText: "Tamari" })).toHaveCount(1);
    await expect(planned.locator(".ing-marks-buy", { hasText: "Tamari" })).toHaveCount(0);
  });
});

test.describe("the admin's Help", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("names « I have it as… » on the recipe card, the Planner, Grocery and Inventory", async ({ page }) => {
    await setup(page);
    await openHelp(page);
    const help = page.locator(".riso-help");
    await expect(help).toContainText("press I have it as… on the row");
    await expect(help.locator("#help-recipeCard")).toContainText("Remove takes the link away");
    await expect(help.locator("#help-planner")).toContainText("is I have it as… from the recipe card");
    await expect(help.locator("#help-grocery")).toContainText("A row that comes from recipes has a small link");
    await expect(help.locator("#help-inventory")).toContainText("Also counts as lists the recipe names you taught it");
    expect(await help.locator(".riso-help-copy-body", { hasText: "I have it as…" }).count()).toBeGreaterThanOrEqual(2);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("the pop-up, the chip button and the Grocery link fit at 390px", async ({ page }) => {
    await setup(page, { lang: "fr" });

    // The recipe card's drawer button and the pop-up (a bottom sheet).
    const card = await openCard(page, "fr");
    await buyRow(card, "Tamari").locator(".riso-rc-buy-main").click();
    const drawer = buyRow(card, "Tamari").locator(".riso-rc-drawer");
    await expect(drawer.getByRole("button", { name: L.fr.haveAs })).toBeVisible();
    await noSidewaysScroll(page, drawer);
    await save(page, buyRow(card, "Tamari"), "phone-fr-1-drawer-button");
    await drawer.getByRole("button", { name: L.fr.haveAs }).click();
    const pop = page.getByRole("dialog", { name: L.fr.haveAs });
    await expect(pop).toBeVisible();
    await expect(pop.locator(".riso-linkpop-intro")).toContainText("Rien n'est ajouté à l'inventaire");
    await noSidewaysScroll(page, pop);
    await pop.getByRole("searchbox").fill("sauce");
    await expect(pop.locator(".riso-linkpop-name")).toHaveText(["Soy sauce"]);
    await pop.getByRole("searchbox").fill("");
    await save(page, null, "phone-fr-4-popup");
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    // Escape closed only the pop-up: the card is still there.
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");

    // The Grocery row's link.
    await tab(page, L.fr.grocery).click();
    await page.getByRole("button", { name: L.fr.gotIt }).click();
    const row = page.locator(".riso-row", { has: page.locator(".riso-row-name", { hasText: "Tamari" }) });
    await expect(row.getByRole("button", { name: /je l.ai comme/i })).toBeVisible();
    await noSidewaysScroll(page, page.locator(".riso-grocery"));
    await save(page, row, "phone-fr-3-grocery-link");

    // The phone's planned-meal card is the small inline one: it lists no To-buy chips (so
    // there is no chip button on a phone; the recipe card's drawer has the button).
    const recipe = (await (await page.request.get("/api/recipes")).json())[0];
    const day = todayIndex();
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: thisMonday(), dayOfWeek: day, mealType: "dinner" } });
    await page.reload();
    await tab(page, L.fr.planner).click();
    await page.locator(".pmb-cell .riso-planner-card").first().click();
    await expect(page.locator(".pmb-inline")).toBeVisible();
    await expect(page.locator(".ing-marks-haveas")).toHaveCount(0);
  });
});

test.describe("on the narrowest screen that has the planned-meal card's chips, in French", () => {
  // Under 768px the Planner uses the phone's inline card; from 768px the card beside the slot.
  test.use({ locale: "fr-CA", viewport: { width: 768, height: 1000 } });

  test("the chip button beside a To-buy chip fits, with no sideways scroll", async ({ page }) => {
    const recipe = await setup(page, { lang: "fr" });
    const day = todayIndex();
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: thisMonday(), dayOfWeek: day, mealType: "dinner" } });
    await page.reload();
    await tab(page, L.fr.planner).click();
    await page.locator(".riso-planner-cell").nth(2 * 7 + day).locator(".riso-planner-card").click();
    const planned = page.getByRole("dialog", { name: TITLE });
    await expect(planned.locator(".ing-marks-haveas")).toHaveCount(2);
    await expect(planned.locator(".ing-marks-haveas").first()).toHaveAttribute("aria-label", /: je l'ai comme/);
    await noSidewaysScroll(page, planned);
    await save(page, planned, "narrow-fr-2-chip-button");
  });
});

// For now « Je l'ai comme… » is for admins only (HQ task jlc2). A tester is any account that is not
// in ADMIN_EMAILS: signed up like anyone else.
const TAMARI_LINK = { id: "link-1", recipeName: "tamari", itemName: "soy sauce", recipeLabel: "Tamari", itemLabel: "Soy sauce" };

// Even if the server did hand a tester a link, the app offers nothing about it. (The matcher
// reads whatever links it is given, so Tamari is blue here; only the entry points are gone.)
async function serverHandsOverALink(page) {
  await page.route("**/api/inventory-links", (route) => (route.request().method() === "GET" ? route.fulfill({ json: [TAMARI_LINK] }) : route.continue()));
}

test.describe("a tester, on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("sees none of the entry points: the recipe card, the Planner chip, the Grocery row and the item pop-up", async ({ page }) => {
    await serverHandsOverALink(page);
    await setup(page, { admin: false });

    // Recipe card: "I have it" stays, "I have it as…" is gone, and a blue row doesn't say "Counts because you said…".
    const card = await openCard(page);
    await expect(buyRow(card, "Wonton wrappers")).toHaveCount(1);
    await expect(haveRow(card, "Tamari")).toHaveCount(1);
    await buyRow(card, "Wonton wrappers").locator(".riso-rc-buy-main").click();
    const drawer = buyRow(card, "Wonton wrappers").locator(".riso-rc-drawer");
    await expect(drawer.getByRole("button", { name: "I have it", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: L.en.haveAs })).toHaveCount(0);
    await haveRow(card, "Tamari").locator(".riso-rc-have-line").click();
    await expect(haveRow(card, "Tamari").locator(".riso-rc-drawer")).toBeVisible();
    await expect(haveRow(card, "Tamari").locator(".riso-rc-because")).toHaveCount(0);
    await expect(card).not.toContainText("Counts because you said");
    await page.keyboard.press("Escape");

    // Grocery: the row for what is still to buy has no link.
    await tab(page, L.en.grocery).click();
    await page.getByRole("button", { name: L.en.gotIt }).click();
    await expect(page.locator(".riso-row-name")).toHaveText(["Wonton wrapper"]);
    await expect(page.locator(".riso-row-haveas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /I have it as/ })).toHaveCount(0);

    // Planner: the planned meal's To-buy chip has no ≈ button.
    const recipeId = (await (await page.request.get("/api/recipes")).json())[0].id;
    const day = todayIndex();
    await page.request.post("/api/planner", { data: { recipeId, weekStart: thisMonday(), dayOfWeek: day, mealType: "dinner" } });
    await page.reload();
    await tab(page, L.en.planner).click();
    await page.locator(".riso-planner-cell").nth(2 * 7 + day).locator(".riso-planner-card").click();
    const planned = page.getByRole("dialog", { name: TITLE });
    await expect(planned.locator(".ing-marks-buy", { hasText: "Wonton wrappers" })).toHaveCount(1);
    await expect(planned.locator(".ing-marks-haveas")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Inventory: the item pop-up of the item the link points to has no "Also counts as".
    await tab(page, L.en.inventory).click();
    await page.getByText("Soy sauce", { exact: true }).first().click();
    const form = itemForm(page);
    await expect(form.getByLabel("Item name")).toHaveValue("Soy sauce");
    await expect(form.locator(".riso-itemform-also")).toHaveCount(0);
    await expect(form).not.toContainText(L.en.alsoCounts);
  });

  test("gets 403 when it teaches or removes a link, and an empty list when it reads them", async ({ page }) => {
    await setup(page, { admin: false });
    expect((await page.request.post("/api/inventory-links", { data: { recipeName: "Tamari", itemName: "Soy sauce" } })).status()).toBe(403);
    expect((await page.request.delete("/api/inventory-links/anything")).status()).toBe(403);
    expect(await links(page)).toEqual([]);
    // Nothing came of it: the card still lists Tamari to buy and offers no "I have it as…".
    const card = await openCard(page);
    await expect(buyRow(card, "Tamari")).toHaveCount(1);
    await buyRow(card, "Tamari").locator(".riso-rc-buy-main").click();
    await expect(buyRow(card, "Tamari").locator(".riso-rc-drawer").getByRole("button", { name: L.en.haveAs })).toHaveCount(0);
  });

  test("Help doesn't mention « I have it as… », but still explains I have it", async ({ page }) => {
    await setup(page, { admin: false });
    await openHelp(page);
    const help = page.locator(".riso-help");
    await expect(help.locator("#help-recipeCard")).toContainText("Saying you have it");
    await expect(help.locator("#help-recipeCard")).toContainText("nothing is added until you confirm");
    await expect(help.locator("#help-inventory")).toContainText("I have it on a recipe card");
    await expect(help).not.toContainText(/I have it as|Also counts as|Remove takes the link away/);
    await expect(help.locator(".riso-help-copy-body", { hasText: "I have it as…" })).toHaveCount(0);
    await expect(help.locator(".ing-marks-haveas, .riso-row-haveas")).toHaveCount(0);
  });
});

test.describe("a tester, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 1280, height: 1000 } });

  test("Help doesn't mention « Je l'ai comme… », but still explains « J'en ai »", async ({ page }) => {
    await setup(page, { lang: "fr", admin: false });
    await openHelp(page, "Aide");
    const help = page.locator(".riso-help");
    await expect(help.locator("#help-recipeCard")).toContainText("rien n'est ajouté avant que vous confirmiez");
    await expect(help.locator("#help-inventory")).toContainText("« J'en ai » sur la fiche d'une recette");
    await expect(help).not.toContainText(/Je l'ai comme|Compte aussi comme/);
    await expect(help.locator(".riso-help-copy-body", { hasText: /Je l'ai comme/ })).toHaveCount(0);
  });
});
