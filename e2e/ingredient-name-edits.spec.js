import fs from "node:fs";
import path from "node:path";
import { expect, mondayAfter, realNow, test } from "./spec-clock.js";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_INVITE } from "./invite.js";
import { quebecDay } from "./quebec-day.js";
import { ROUTE_NAMES, adminLoaded, expectAdminFits, newTag, seedLongAccounts, showLongChange } from "./admin-fit.js";

// Matt's changes to the ingredient names (the Admin page's Ingredient names card; lib/nameSaves.js,
// lib/ingredientDisplay.js, server/src/routes/adminIngredientNames.js):
//   - on a phone (390px, French) Matt gives a name from a recipe that has no translation its
//     French name; the recipe card and the Grocery list show it right away (no reload), it is still there after a
//     reload, and a tester sees it too after a reload and cannot change it (403);
//   - the form refuses a spelling another row already has, and fits the phone;
//   - Matt corrects a built-in row (found by search), sees it tagged Changed with who and when,
//     goes "Back to built-in", and Undo puts his version back; he can hide a built-in row, and
//     the name is a gap again.
// The names are shared by every account, so these tests use a name of their own ("Zorblax paste")
// and the built-in row "cardamom" that no other test reads, and take their changes away at the
// end. The admin account is made in the database (playwright.config.js lists it). The day shown
// beside a change is the Quebec day the server saved it on (the real clock, e2e/spec-clock.js), never this machine's own date.
// Set SHOTS_DIR to also save the screenshots (phone in French, computer in English) there.

const prisma = new PrismaClient();
const ADMIN = "e2e-name-edits-admin@example.com";
const PASSWORD = "adminpass123";

test.describe.configure({ mode: "serial" });

const MINE = { OR: [{ enOne: { startsWith: "zorblax" } }, { replaces: "cardamom" }] };
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

const RECIPE = {
  title: "Zorblax stew",
  mealSlot: "dinner",
  baseServings: 4,
  ingredients: [{ name: "Zorblax paste", quantity: 2, unit: "tbsp" }, { name: "cardamom", quantity: 1, unit: "tsp" }, { name: "onions", quantity: 2 }],
  instructions: ["Stir the Zorblax paste in.", "Simmer."],
};

const WORDS = {
  en: { signUp: "Sign up", create: "Create account", home: "Home", recipes: "Recipes" },
  fr: { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil", recipes: "Recettes" },
};

async function signInAsAdmin(page, lang) {
  await prisma.user.deleteMany({ where: { email: ADMIN } });
  await prisma.user.create({ data: { email: ADMIN, passwordHash: await bcrypt.hash(PASSWORD, 10), locale: lang } });
  await page.goto("/");
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".tab.active")).toHaveText(WORDS[lang].home);
  const recipe = await (await page.request.post("/api/recipes", { data: RECIPE })).json();
  // Planned next week, so it is always ahead and its ingredients are on the Grocery list (the week
  // comes from the Quebec day, never this machine's own date).
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayAfter(1), dayOfWeek: 0, mealType: "dinner" } });
}

async function signUpTester(page, lang) {
  await page.goto("/");
  await page.getByRole("button", { name: WORDS[lang].signUp }).click();
  await page.fill('input[type="email"]', `name-edits+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: WORDS[lang].create }).click();
  await expect(page.locator(".tab.active")).toHaveText(WORDS[lang].home);
}

const tab = (page, name) => page.getByRole("button", { name, exact: true }).first();

async function openCard(page, lang) {
  await tab(page, WORDS[lang].recipes).click();
  await page.locator(".rpc-title", { hasText: RECIPE.title }).first().click();
  const card = page.getByRole("dialog", { name: RECIPE.title });
  await expect(card).toBeVisible();
  return card;
}

// Nothing leaves the screen sideways; every control inside the box is whole.
async function noSidewaysScroll(page, within) {
  const width = page.viewportSize().width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const cramped = await within.evaluate((box, max) =>
    [...box.querySelectorAll("button, h2, p, input, legend, label, span")]
      .filter((e) => e.offsetParent && (e.getBoundingClientRect().right > max + 1 || e.getBoundingClientRect().left < -1))
      .map((e) => `${e.className || e.tagName}: ${(e.textContent || "").trim().slice(0, 40)}`),
  width);
  expect(cramped).toEqual([]);
}

const kept = async (page) => (await (await page.request.get("/api/ingredient-names")).json()).filter((row) => row.enOne.startsWith("zorblax") || row.replaces === "cardamom");

test.describe("on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("Matt gives a name its French; the recipe card shows it at once, it stays after a reload, and a tester sees it too and cannot change it", async ({ page, browser }) => {
    await signInAsAdmin(page, "fr");

    // First the page itself, with the worst case made here so it never depends on the accounts the other specs
    // have made (e2e/admin-fit.js): three accounts with very long emails, and a name changed by one of them
    // ("Modifié par <email>"). All five Admin cards are no wider than the phone.
    const tag = newTag();
    const long = await seedLongAccounts(prisma, tag);
    try {
      await showLongChange(page, tag, long.emails[0]);
      await page.goto("/admin");
      await adminLoaded(page);
      await expect(page.locator(".riso-admin-names .riso-admin-namecard-meta", { hasText: `Modifié par ${long.emails[0]}` })).toHaveCount(1);
      await expectAdminFits(page, { cards: 5, seen: long.emails });
    } finally {
      await page.unroute(ROUTE_NAMES);
      await long.remove();
    }

    await page.goto("/admin");
    const card = page.locator(".riso-admin-names");
    await expect(card.getByRole("heading", { name: "Noms des ingrédients" })).toBeVisible();
    const list = card.getByRole("list", { name: "Noms d'ingrédients sans traduction" });
    await expect(list.locator("li", { hasText: "Zorblax paste" })).toContainText("1 recette");
    await expect(list.locator("li", { hasText: "cardamom" })).toHaveCount(0); // the table knows it
    await shot(card, "names-gaps-fr-phone");

    // The form starts with the English name, its plural guessed, and the cursor where French is missing.
    await card.getByRole("button", { name: "Nommer « Zorblax paste »" }).click();
    const form = page.locator(".riso-namepop");
    await expect(form.getByRole("heading", { name: "Nommer cet ingrédient" })).toBeVisible();
    await expect(form.locator('input[name="enOne"]')).toHaveValue("zorblax paste");
    await expect(form.locator('input[name="enOther"]')).toHaveValue("zorblax pastes");
    await expect(form.locator('input[name="frOne"]')).toBeFocused();
    await form.locator('input[name="frOne"]').fill("pâte de zorblax");
    // Its plural is the same word, and « pâte » says feminine.
    await expect(form.locator('input[name="frOther"]')).toHaveValue("");
    await expect(form.getByRole("button", { name: "Féminin" })).toHaveAttribute("aria-pressed", "true");
    await noSidewaysScroll(page, form);
    await shot(page, "names-form-fr-phone");
    await form.getByRole("button", { name: "Enregistrer pour tout le monde" }).click();

    // A toast with Undo, the gap is gone, and Matt's change is listed with who and when.
    await expect(page.locator(".riso-toast")).toContainText("« pâte de zorblax » enregistré pour tout le monde");
    await expect(list.locator("li", { hasText: "Zorblax paste" })).toHaveCount(0);
    const mine = card.getByRole("list", { name: "Noms que vous avez modifiés" });
    const row = mine.locator("li", { hasText: "zorblax paste → pâte de zorblax" });
    await expect(row).toContainText("Modifié par vous");
    await expect(row).toContainText(String(Number(quebecDay(realNow()).slice(8))));
    await expect(row).toContainText("Ajouté");

    // The recipe card, reached without a reload, already says it in French.
    await page.getByRole("link", { name: "Accueil" }).click();
    let recipe = await openCard(page, "fr");
    await expect(recipe.locator(".riso-rc-buy-name", { hasText: "Pâte de zorblax" })).toHaveCount(1);
    await expect(recipe.locator(".riso-rc-buy-name", { hasText: "Zorblax paste" })).toHaveCount(0);
    // So does the Grocery list (its rows are made while the page is drawn), and what is on the list
    // underneath is still the recipe's own name.
    await page.keyboard.press("Escape");
    await tab(page, "Épicerie").click();
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Pâte de zorblax" })).toHaveCount(1);
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Zorblax paste" })).toHaveCount(0);
    // The recipe itself is as it was written.
    const saved = (await (await page.request.get("/api/recipes")).json()).find((r) => r.title === RECIPE.title);
    expect(saved.ingredients.map((i) => i.name)).toContain("Zorblax paste");
    await expect.poll(async () => (await kept(page)).length).toBe(1);

    // Still there after a reload.
    await page.reload();
    await expect(tab(page, "Épicerie")).toBeVisible();
    recipe = await openCard(page, "fr");
    await expect(recipe.locator(".riso-rc-buy-name", { hasText: "Pâte de zorblax" })).toHaveCount(1);

    // A tester (another account) sees it after a reload, and the server refuses their change.
    const tester = await browser.newContext({ locale: "fr-CA", viewport: { width: 390, height: 844 } });
    const other = await tester.newPage();
    await signUpTester(other, "fr");
    await other.request.post("/api/recipes", { data: RECIPE });
    await other.reload();
    const theirs = await openCard(other, "fr");
    await expect(theirs.locator(".riso-rc-buy-name", { hasText: "Pâte de zorblax" })).toHaveCount(1);
    const listed = await (await other.request.get("/api/ingredient-names")).json();
    expect(listed.find((r) => r.enOne === "zorblax paste")).toBeTruthy();
    expect("updatedBy" in listed[0]).toBe(false); // who changed it is for an admin only
    const refused = await other.request.post("/api/admin/ingredient-names", { data: { enOne: "zorblax x", frOne: "zorblax y", gender: "m" } });
    expect(refused.status()).toBe(403);
    expect((await other.request.delete(`/api/admin/ingredient-names/${listed[0].id}`)).status()).toBe(403);
    await tester.close();
  });

  test("names that arrive after a page is drawn still change what is on it (a slow phone, the Grocery list)", async ({ page }) => {
    await signInAsAdmin(page, "fr");
    const made = await page.request.post("/api/admin/ingredient-names", { data: { enOne: "zorblax paste", enOther: "", frOne: "pâte de zorblax", frOther: "", gender: "f" } });
    expect(made.status()).toBe(201);
    await page.route("**/api/ingredient-names", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.reload();
    await tab(page, "Épicerie").click();
    // As written until the answer comes, then in French without touching anything.
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Zorblax paste" })).toHaveCount(1);
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Pâte de zorblax" })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Zorblax paste" })).toHaveCount(0);
  });

  test("the form says at once when a spelling is already another ingredient's, and the Undo of a save takes the name away", async ({ page }) => {
    await signInAsAdmin(page, "fr");
    await page.goto("/admin");
    const card = page.locator(".riso-admin-names");
    await card.getByRole("button", { name: "Nommer « Zorblax paste »" }).click();
    const form = page.locator(".riso-namepop");
    await form.locator('input[name="frOne"]').fill("échalote");
    await expect(form.getByRole("alert")).toContainText("« échalote » est déjà utilisé pour un autre ingrédient (shallot)");
    await expect(form.getByRole("button", { name: "Enregistrer pour tout le monde" })).toBeDisabled();
    await noSidewaysScroll(page, form);
    await form.locator('input[name="frOne"]').fill("");
    await form.locator('input[name="enOne"]').fill("Garlic");
    await expect(form.getByRole("alert")).toContainText("« Garlic » est déjà utilisé pour un autre ingrédient (garlic)");
    // Something missing is said when Save is pressed.
    await form.locator('input[name="enOne"]').fill("zorblax paste");
    await form.getByRole("button", { name: "Enregistrer pour tout le monde" }).click();
    await expect(form.getByRole("alert")).toContainText("Chaque nom a besoin d'un singulier en anglais et d'un singulier en français.");
    await form.locator('input[name="frOne"]').fill("zorblax pâte");
    await form.getByRole("button", { name: "Enregistrer pour tout le monde" }).click();
    await expect(page.locator(".riso-toast")).toContainText("enregistré pour tout le monde");
    await expect.poll(async () => (await kept(page)).length).toBe(1);

    await page.locator(".riso-toast").getByRole("button", { name: "Annuler" }).click();
    await expect(card.getByRole("list", { name: "Noms d'ingrédients sans traduction" }).locator("li", { hasText: "Zorblax paste" })).toHaveCount(1);
    await expect.poll(async () => (await kept(page)).length).toBe(0);
  });
});

test.describe("on a computer, in English", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 1000 } });

  test("Matt finds a built-in row, corrects it, goes back to the built-in row, and hides one", async ({ page }) => {
    await signInAsAdmin(page, "en");
    await page.goto("/admin");
    const card = page.locator(".riso-admin-names");

    // The search finds a row by any spelling, in either language, accents and capitals ignored.
    await card.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("CARDAMOME");
    const results = card.getByRole("list", { name: "Ingredients found" });
    await expect(results.locator("li")).toHaveCount(1);
    await expect(results.locator("li")).toContainText("cardamom → cardamome");
    await expect(results.locator("li")).toContainText("Built-in");
    await expect(results.locator("li").getByRole("button", { name: "Back to built-in" })).toHaveCount(0);
    await shot(card, "names-search-en");

    // Correct it: the French is Matt's wording now, for everyone.
    await results.locator("li").getByRole("button").first().click();
    const form = page.locator(".riso-namepop");
    await expect(form.locator('input[name="frOne"]')).toHaveValue("cardamome");
    await expect(form.getByRole("button", { name: "Feminine" })).toHaveAttribute("aria-pressed", "true");
    await form.locator('input[name="frOne"]').fill("cardamome verte");
    await form.getByRole("button", { name: "Save for everyone" }).click();
    await expect(page.locator(".riso-toast")).toContainText("“cardamom” saved for everyone");
    await expect(results.locator("li")).toContainText("cardamom → cardamome verte");
    await expect(results.locator("li")).toContainText("Changed");
    await expect(results.locator("li")).toContainText("Changed by you");
    await expect.poll(async () => (await kept(page)).map((r) => r.frOne)).toEqual(["cardamome verte"]);
    await shot(card, "names-changed-en");

    // The French screen says it: a recipe with cardamom reads « cardamome verte ».
    await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
    await page.reload();
    await page.getByRole("link", { name: "Accueil" }).click();
    let recipe = await openCard(page, "fr");
    await expect(recipe.locator(".riso-rc-buy-name", { hasText: "Cardamome verte" })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.request.patch("/api/auth/me", { data: { locale: "en" } });
    await page.goto("/admin");

    // Back to built-in: the built-in French is back at once, and Undo puts his version back.
    await card.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("cardamom");
    await results.locator("li").getByRole("button", { name: "Back to built-in" }).click();
    await expect(page.locator(".riso-toast")).toContainText("“cardamom” is back to the built-in name");
    await expect(results.locator("li")).toContainText("cardamom → cardamome");
    await expect(results.locator("li")).not.toContainText("cardamome verte");
    await expect.poll(async () => (await kept(page)).length).toBe(0);
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(results.locator("li")).toContainText("cardamom → cardamome verte");
    await expect.poll(async () => (await kept(page)).map((r) => r.frOne)).toEqual(["cardamome verte"]);

    // And back for good, from the list of his changes.
    await card.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("");
    const mine = card.getByRole("list", { name: "Names you changed" });
    await expect(mine.locator("li")).toHaveCount(1);
    await mine.locator("li").getByRole("button", { name: "Back to built-in" }).click();
    await expect(card.getByText("You haven't changed a name yet.")).toBeVisible();
    await expect.poll(async () => (await kept(page)).length).toBe(0);
  });

  test("Matt hides a built-in row: the name shows as written again and is a gap to fill; Undo brings the row back", async ({ page }) => {
    await signInAsAdmin(page, "en");
    await page.goto("/admin");
    const card = page.locator(".riso-admin-names");
    const gaps = card.getByRole("list", { name: "Ingredient names with no translation" });
    await expect(gaps.locator("li", { hasText: "cardamom" })).toHaveCount(0);

    await card.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("cardamom");
    await card.getByRole("list", { name: "Ingredients found" }).locator("li").getByRole("button").first().click();
    await page.locator(".riso-namepop").getByRole("button", { name: "Hide this built-in name" }).click();
    await expect(page.locator(".riso-toast")).toContainText("“cardamom” hidden");
    await expect.poll(async () => (await kept(page)).map((r) => r.hidden)).toEqual([true]);
    await card.getByRole("searchbox", { name: "Find an ingredient to correct" }).fill("");
    await expect(gaps.locator("li", { hasText: "cardamom" })).toContainText("1 recipe");
    await expect(card.getByRole("list", { name: "Names you changed" }).locator("li")).toContainText("Hidden");

    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(gaps.locator("li", { hasText: "cardamom" })).toHaveCount(0);
    await expect.poll(async () => (await kept(page)).length).toBe(0);
  });

  test("a tester has no Ingredient names card, and the list loads for them", async ({ page }) => {
    await signUpTester(page, "en");
    await page.goto("/admin");
    await expect(page.locator(".riso-admin-names")).toHaveCount(0);
    expect((await page.request.get("/api/ingredient-names")).status()).toBe(200);
  });
});
