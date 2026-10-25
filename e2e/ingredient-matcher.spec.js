import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_INVITE } from "./invite.js";

// The ingredient names table (built-in file + Matt's changes) is the one source of French and
// English names for the Inventory matcher and the recipe search, not just for what is shown:
//   - a name Matt gives a recipe's ingredient in the Admin card counts for « J'en ai » at once, with no
//     reload: the recipe card moves it from "to buy" to "in your Inventory", and Undo moves it back;
//   - the form refuses one of the matcher's own words (« poudre ») and warns about a spelling it never
//     reads (« sale »);
//   - the Recipes search box finds either language, without caring about accents: « coriandre »
//     finds "fresh cilantro" and the reverse; so does the Cook with search on the Planner.
// The names are shared by every account, so the admin test uses a name of its own ("Glorbnik root")
// and takes its change away at the end. The admin account is made in the database
// (playwright.config.js lists it). Set SHOTS_DIR to also save the screenshots there.

const prisma = new PrismaClient();
const ADMIN = "e2e-matcher-admin@example.com";
const PASSWORD = "adminpass123";

test.use({ timezoneId: "America/Toronto" });
test.describe.configure({ mode: "serial" });

const MINE = { enOne: { startsWith: "glorbnik" } };
test.beforeEach(async () => {
  await prisma.ingredientNameOverride.deleteMany({ where: MINE });
});
test.afterAll(async () => {
  await prisma.ingredientNameOverride.deleteMany({ where: MINE });
  await prisma.$disconnect();
});

const SHOTS = process.env.SHOTS_DIR;
async function shot(target, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await target.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const tab = (page, name) => page.getByRole("button", { name, exact: true }).first();
const kept = async (page) => (await (await page.request.get("/api/ingredient-names")).json()).filter((row) => row.enOne.startsWith("glorbnik"));

async function signInAsAdmin(page, lang = "en") {
  await prisma.user.deleteMany({ where: { email: ADMIN } });
  await prisma.user.create({ data: { email: ADMIN, passwordHash: await bcrypt.hash(PASSWORD, 10), locale: lang } });
  await page.goto("/");
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".tab.active")).toHaveText(lang === "fr" ? "Accueil" : "Home");
}

async function signUp(page, { signUp: signUpLabel, create, home }) {
  await page.goto("/");
  await page.getByRole("button", { name: signUpLabel }).click();
  await page.fill('input[type="email"]', `matcher-search+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: create }).click();
  await expect(page.locator(".tab.active")).toHaveText(home);
}

async function recipeCard(page, title) {
  await tab(page, "Recipes").click();
  await page.locator(".rpc-title", { hasText: title }).first().click();
  const card = page.getByRole("dialog", { name: title });
  await expect(card).toBeVisible();
  return card;
}

test.describe("on a computer, in English", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 1000 } });

  test("a name Matt gives an ingredient counts for « I have it » at once, without a reload, and Undo takes it back", async ({ page }) => {
    await signInAsAdmin(page);
    const title = "Glorbnik matcher stew";
    await page.request.post("/api/recipes", {
      data: { title, mealSlot: "dinner", baseServings: 4, instructions: ["Simmer."], ingredients: [{ name: "Glorbnik root", quantity: 1 }, { name: "onions", quantity: 2 }] },
    });
    // The Inventory is in French: « Racine de glorbnik » is a name the table does not have yet.
    for (const name of ["Racine de glorbnik", "Oignons"]) await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
    await page.reload();

    let card = await recipeCard(page, title);
    await expect(card.locator(".riso-rc-buy")).toHaveCount(1);
    await expect(card.locator(".riso-rc-buy")).toContainText("Glorbnik root");
    await expect(card.locator(".riso-rc-have")).toHaveCount(1); // the onions
    await page.keyboard.press("Escape");

    // Admin: give the name its French. From here on nothing reloads the page: the marker is gone if it does.
    await page.goto("/admin");
    await page.evaluate(() => {
      window.__noReload = true;
    });
    const names = page.locator(".riso-admin-names");
    await names.getByRole("button", { name: /Name “Glorbnik root”/ }).click();
    const form = page.locator(".riso-namepop");

    // A word the matcher reads on its own is refused; a spelling it never reads is warned about.
    await form.locator('input[name="frOne"]').fill("poudre");
    await expect(form.getByRole("alert")).toContainText("“poudre” is a word “I have it” reads on its own (it means “powder”)");
    await expect(form.getByRole("button", { name: "Save for everyone" })).toBeDisabled();
    await shot(form, "matcher-word-refused-en");
    await form.locator('input[name="frOne"]').fill("racine de glorbnik");
    await form.locator('input[name="frOther"]').fill("racines de glorbnik/sale");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(form.getByRole("status")).toContainText("“I have it” never reads “sale”");
    await form.locator('input[name="frOther"]').fill("racines de glorbnik");
    await expect(form.getByRole("status")).toHaveCount(0);
    await form.getByRole("button", { name: "Save for everyone" }).click();
    await expect(page.locator(".riso-toast")).toContainText("saved for everyone");
    await expect.poll(async () => (await kept(page)).length).toBe(1);

    // Back to the recipe without a reload: the root is in the Inventory now.
    await tab(page, "Home").click();
    card = await recipeCard(page, title);
    await expect(card.locator(".riso-rc-buy")).toHaveCount(0);
    await expect(card.locator(".riso-rc-have")).toHaveCount(2);
    await page.keyboard.press("Escape");

    // Take the change away from the list of his changes: it stops counting, again without a reload.
    await page.goto("/admin");
    await page.evaluate(() => {
      window.__noReload = true;
    });
    await names.getByRole("list", { name: "Names you changed" }).locator("li", { hasText: "glorbnik root" }).getByRole("button", { name: "Remove" }).click();
    await expect.poll(async () => (await kept(page)).length).toBe(0);
    await tab(page, "Home").click();
    card = await recipeCard(page, title);
    await expect(card.locator(".riso-rc-buy")).toHaveCount(1);
    await expect(card.locator(".riso-rc-have")).toHaveCount(1);
    expect(await page.evaluate(() => window.__noReload)).toBe(true);
  });

  test("Hiding a built-in row says it also stops « I have it » from reading its French", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");
    const names = page.locator(".riso-admin-names");
    await names.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("cardamom");
    await names.getByRole("list", { name: "Ingredients found" }).locator("li").getByRole("button").first().click();
    await expect(page.locator(".riso-namepop")).toContainText("Hiding it also stops “I have it” from reading its French names.");
  });
});

test.describe("the Admin form, on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("says what the matcher makes of the names, and the notes fit the screen", async ({ page }) => {
    await signInAsAdmin(page, "fr");
    await page.request.post("/api/recipes", { data: { title: "Glorbnik ragoût", mealSlot: "dinner", baseServings: 2, instructions: ["Mijoter."], ingredients: [{ name: "Glorbnik root" }] } });
    await page.goto("/admin");
    await page.locator(".riso-admin-names").getByRole("button", { name: "Nommer « Glorbnik root »" }).click();
    const form = page.locator(".riso-namepop");
    await form.locator('input[name="frOne"]').fill("poudre");
    await expect(form.getByRole("alert")).toContainText("« poudre » est un mot que « J'en ai » lit à sa façon (il veut dire « powder »)");
    await form.locator('input[name="frOne"]').fill("racine de glorbnik");
    await form.locator('input[name="frOther"]').fill("racines de glorbnik/sale");
    await expect(form.getByRole("status")).toContainText("« J'en ai » ne lit jamais « sale »");
    await shot(page, "matcher-notes-fr-phone");
    const width = page.viewportSize().width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = await form.getByRole("status").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.locator(".riso-namepop").getByRole("button", { name: "Annuler" }).click();
  });
});

test.describe("the Recipes search, on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("finds either language, and does not care about accents", async ({ page }) => {
    await signUp(page, { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" });
    const make = (title, names) => page.request.post("/api/recipes", { data: { title, mealSlot: "dinner", baseServings: 2, instructions: ["Mix."], ingredients: names.map((name) => ({ name })) } });
    await make("Green salad", ["fresh cilantro", "lime"]);
    await make("Salade verte", ["coriandre fraîche", "lime"]);
    await make("Spinach pie", ["spinach", "flour"]);
    await make("Tarte épinards", ["épinards", "farine"]);
    await make("Plain toast", ["bread"]);
    await page.reload();
    await tab(page, "Recettes").click();
    const search = page.locator(".riso-recipes-searchbar input");
    // The cards come newest first; the test cares about which ones are there.
    const shown = async () => (await page.locator(".rpc-title").allTextContents()).sort();

    await search.fill("coriandre");
    await expect.poll(shown).toEqual(["Green salad", "Salade verte"]);
    await search.fill("cilantro");
    await expect.poll(shown).toEqual(["Green salad", "Salade verte"]);
    await search.fill("epinards");
    await expect.poll(shown).toEqual(["Spinach pie", "Tarte épinards"]);
    await search.fill("spinach");
    await expect.poll(shown).toEqual(["Spinach pie", "Tarte épinards"]);
    await search.fill("glorbnik");
    await expect.poll(shown).toEqual([]);
  });
});
