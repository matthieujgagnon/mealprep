import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_INVITE } from "./invite.js";

// Ingredient names in the language shown (lib/ingredientDisplay.js, ingredientDisplay.txt):
//   - in French a recipe's ingredients read in French on the recipe card, in Cook mode
//     (Before you start and For this step), on Makeable's pills, on the Planner's meal card and
//     on the Grocery rows built from recipes; in English a recipe written in French reads in English;
//   - the recipe itself is never changed: what the server holds is what was saved;
//   - a name that is not in the table is shown exactly as written;
//   - what Matt typed (an Inventory item, a Grocery item) stays exactly as typed;
//   - at 390px in French the long names fit on the card, in Cook mode, on a Grocery row and
//     on Makeable's pills;
//   - the admin's list of names with no translation yet, and the Copy button for prep notes
//     (filling a name in is e2e/ingredient-name-edits.spec.js).
// Set SHOTS_DIR to also save the screenshots (phone in French, computer in English) there.

const prisma = new PrismaClient();
const ADMIN = "e2e-names-admin@example.com";
const PASSWORD = "adminpass123";
test.afterAll(async () => {
  await prisma.$disconnect();
});

// A screenshot waits for the card's opening motion to finish, and brings the first pill or Grocery row into view.
const SHOTS = process.env.SHOTS_DIR;
async function shot(page, name, target = page) {
  if (!SHOTS) return;
  if (name.startsWith("makeable")) await page.locator(".mkc-pill-name").first().scrollIntoViewIfNeeded();
  if (name.startsWith("grocery")) await page.locator(".riso-group [data-gi-name]").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await target.screenshot({ path: `${SHOTS}/${name}.png` });
}

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const today = () => (new Date().getDay() + 6) % 7;

// Written in English, with the long names French makes longer.
const RECIPE = {
  title: "Onion chicken",
  mealSlot: "dinner",
  baseServings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  ingredients: [
    { name: "red onions", quantity: 2, notes: "finely chopped" },
    { name: "garlic cloves", quantity: 4, notes: "minced" },
    { name: "boneless skinless chicken thighs", quantity: 800, unit: "g" },
    { name: "fresh cilantro", quantity: 1, unit: "bunch" },
    { name: "Biryani masala", quantity: 1, unit: "tbsp", notes: "toasted" },
  ],
  instructions: [
    "Chop the red onions and mince the garlic cloves.",
    "Brown the boneless skinless chicken thighs with the Biryani masala.",
    "Finish with the fresh cilantro.",
  ],
};

// The same recipe written in French, read in English.
const RECETTE = {
  title: "Poulet aux oignons",
  mealSlot: "dinner",
  baseServings: 4,
  ingredients: [
    { name: "oignons rouges", quantity: 2, notes: "hachés finement" },
    { name: "gousses d'ail", quantity: 4 },
    { name: "hauts de cuisse de poulet désossés sans peau", quantity: 800, unit: "g" },
    { name: "coriandre fraîche", quantity: 1, unit: "bunch" },
  ],
  instructions: ["Hacher les oignons rouges.", "Faire dorer les hauts de cuisse de poulet.", "Terminer avec la coriandre fraîche."],
};

async function signUp(page, { fr }) {
  const words = fr ? { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" } : { signUp: "Sign up", create: "Create account", home: "Home" };
  await page.goto("/");
  await page.getByRole("button", { name: words.signUp }).click();
  await page.fill('input[type="email"]', `names+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: words.create }).click();
  await expect(page.locator(".tab.active")).toHaveText(words.home);
}

// The recipe is planned for today (the Planner card and the Grocery list), and a copy of it is not
// (a planned one sits in Makeable's collapsed "Meals of the week", an unplanned one shows its pills).
const OTHER = { ...RECIPE, title: "Weeknight skillet" };
async function seed(page, recipe = RECIPE) {
  const saved = await (await page.request.post("/api/recipes", { data: recipe })).json();
  await page.request.post("/api/planner", { data: { recipeId: saved.id, weekStart: mondayOf(new Date()), dayOfWeek: today(), mealType: "dinner" } });
  await page.request.post("/api/recipes", { data: OTHER });
  return saved;
}

const tab = (page, name) => page.getByRole("button", { name, exact: true }).click();

test.describe("in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 1280, height: 900 } });

  test("the recipe card, Cook mode, Makeable, the Planner card and Grocery read in French; what was typed and the saved recipe stay as they were", async ({ page }) => {
    await signUp(page, { fr: true });
    const saved = await seed(page);
    // Typed by hand: stays exactly as typed, here an English name that the table knows.
    await page.request.post("/api/grocery-extra-items", { data: { name: "Red onions", quantity: 1 } });
    await page.request.post("/api/grocery-extra-items", { data: { name: "Papier collant", quantity: 1 } });
    await page.request.post("/api/pantry-inventory", { data: { name: "Chicken thighs", location: "fridge", quantity: 1 } });
    await page.reload();

    // The recipe card: the receipt's rows and their prep notes.
    await tab(page, "Recettes");
    await page.locator(".rpc", { hasText: RECIPE.title }).click();
    const card = page.getByRole("dialog", { name: RECIPE.title });
    const names = card.locator(".riso-rc-buy-name");
    await expect(names).toHaveCount(4);
    await expect(names.filter({ hasText: "Oignons rouges" })).toContainText("hachés finement");
    await expect(names.filter({ hasText: "Gousses d'ail" })).toContainText("hachées finement");
    await expect(names.filter({ hasText: "Coriandre fraîche" })).toHaveCount(1);
    // The Inventory's "Chicken thighs" has the thighs covered: that row is under In your Inventory, in French too.
    await expect(card.locator(".riso-rc-have-name")).toContainText("Hauts de cuisse de poulet désossés sans peau");
    // Not in the table: as written, and so is its note.
    await expect(names.filter({ hasText: "Biryani masala" })).toContainText("toasted");
    await expect(card.locator(".riso-rc-buy-name", { hasText: "Red onions" })).toHaveCount(0);

    // « J'en ai » proposes the recipe's own wording for Inventory, not the French shown (the matcher reads
    // some French spellings less well than the English, so what is stored must not depend on the screen's
    // language), and cancelling adds nothing.
    await names.filter({ hasText: "Coriandre fraîche" }).click();
    await card.getByRole("button", { name: "J'en ai" }).click();
    await expect(page.locator(".riso-confirm-name")).toHaveValue("Fresh cilantro");
    await page.locator(".riso-confirm").getByRole("button", { name: "Annuler" }).click();
    expect(await (await page.request.get("/api/pantry-inventory")).json()).toHaveLength(1); // only the Chicken thighs typed above

    // Cook mode: Before you start (the how line is made from the note in French), then a step.
    await card.getByRole("button", { name: "Commencer à cuisiner" }).click();
    await expect(page.locator(".cm-overlay")).toBeVisible();
    const prep = page.locator(".cm-prep-row");
    await expect(prep.filter({ hasText: "Oignons rouges" }).locator(".cm-prep-how")).toHaveText("Hachez finement");
    await expect(prep.filter({ hasText: "Gousses d'ail" }).locator(".cm-prep-how")).toHaveText("Hachez finement");
    await expect(prep.filter({ hasText: "Biryani masala" }).locator(".cm-prep-how")).toHaveText("Toast");
    await page.getByRole("button", { name: "Commencer l'étape 1" }).click();
    const uses = page.locator(".cm-uses-row");
    await expect(uses.filter({ hasText: "Oignons rouges" })).toContainText("hachés finement");
    await expect(uses.filter({ hasText: "Gousses d'ail" })).toHaveCount(1);
    await page.getByRole("button", { name: "Quitter le mode cuisine" }).click();
    await page.keyboard.press("Escape");

    // Makeable: the missing ingredients as pills (the recipe is planned, so it sits in the week's section).
    await tab(page, "Faisable");
    await expect(page.locator(".mk-title")).toBeVisible();
    const pills = page.locator(".mkc-pill-name");
    await expect(pills.first()).toBeVisible();
    const pillTexts = (await pills.allTextContents()).map((s) => s.toLowerCase());
    expect(pillTexts.some((s) => /oignons rouges|gousses d'ail|coriandre fraîche|hauts de cuisse/.test(s))).toBe(true);
    expect(pillTexts.filter((s) => /red onions|garlic cloves|fresh cilantro|chicken thighs/.test(s))).toEqual([]);

    // The Planner's meal card.
    await tab(page, "Planificateur");
    await page.locator(".riso-planner-cell").filter({ hasText: RECIPE.title }).first().getByRole("button").first().click();
    const planned = page.locator(".riso-slotcard");
    await expect(planned.locator(".ing-marks-buy-pill", { hasText: "Oignons rouges" })).toBeVisible();
    await expect(planned.locator(".ing-marks-buy-pill", { hasText: "Red onions" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Grocery: rows built from the recipe are in French; the two typed ones are as typed.
    await tab(page, "Épicerie");
    const rows = page.locator(".riso-group [data-gi-name]"); // the list itself (not the How it works demo row)
    await expect(rows.filter({ hasText: "Oignons rouges" })).toBeVisible();
    const grocery = await rows.allTextContents();
    expect(grocery).toContain("Oignons rouges");
    expect(grocery).toContain("Gousses d'ail");
    expect(grocery).toContain("Biryani masala");
    expect(grocery).toContain("Red onions"); // typed
    expect(grocery).toContain("Papier collant"); // typed
    expect(grocery.filter((n) => /^(Garlic cloves|Fresh cilantro)$/.test(n))).toEqual([]);

    // Inventory: what was typed is shown as typed.
    await tab(page, "Inventaire");
    await expect(page.locator(":is(.inv-row, .inv-tile)", { hasText: "Chicken thighs" })).toBeVisible();

    // The saved recipe is exactly what was written.
    const back = await (await page.request.get("/api/recipes")).json();
    const mine = back.find((r) => r.id === saved.id);
    expect(mine.ingredients.map(({ name, notes, quantity, unit }) => ({ name, notes, quantity, unit }))).toEqual(
      RECIPE.ingredients.map(({ name, notes, quantity, unit }) => ({ name, notes: notes ?? null, quantity, unit: unit ?? null }))
    );
    expect(mine.instructions).toEqual(RECIPE.instructions);
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 900 } });

  test("a recipe written in French reads in English, and one written in English is as it was written", async ({ page }) => {
    await signUp(page, { fr: false });
    const recette = await (await page.request.post("/api/recipes", { data: RECETTE })).json();
    await page.request.post("/api/recipes", { data: RECIPE });
    await page.request.post("/api/planner", { data: { recipeId: recette.id, weekStart: mondayOf(new Date()), dayOfWeek: today(), mealType: "dinner" } });
    await page.request.post("/api/recipes", { data: { ...RECETTE, title: "Poulet du lundi" } }); // not planned: Makeable shows its pills
    await page.reload();
    await tab(page, "Recipes");

    await page.locator(".rpc", { hasText: RECETTE.title }).click();
    let card = page.getByRole("dialog", { name: RECETTE.title });
    const names = card.locator(".riso-rc-buy-name");
    await expect(names).toHaveCount(4);
    await expect(names.filter({ hasText: "Red onions" })).toContainText("minced");
    await expect(names.filter({ hasText: "Garlic cloves" })).toHaveCount(1);
    await expect(names.filter({ hasText: "Boneless skinless chicken thighs" })).toHaveCount(1);
    await expect(names.filter({ hasText: "Fresh cilantro" })).toHaveCount(1);
    await shot(page, "card-en-from-french");

    // Cook mode: the how line is made from the note in English (« hachés finement » is "minced": "Mince").
    await card.getByRole("button", { name: "Start cooking" }).click();
    const prep = page.locator(".cm-prep-row");
    await expect(prep.filter({ hasText: "Red onions" }).locator(".cm-prep-how")).toHaveText("Mince");
    await shot(page, "cook-prep-en-from-french");
    await page.getByRole("button", { name: "Exit cook mode" }).click();
    await page.keyboard.press("Escape");

    // Makeable's pills and the Grocery rows read in English too.
    await tab(page, "Makeable");
    const pills = (await page.locator(".mkc-pill-name").allTextContents()).map((p) => p.toLowerCase());
    expect(pills.some((p) => /red onions|garlic cloves|fresh cilantro|chicken thighs/.test(p))).toBe(true);
    expect(pills.filter((p) => /oignons|gousses|coriandre|hauts de cuisse/.test(p))).toEqual([]);
    await shot(page, "makeable-en-from-french");
    await tab(page, "Grocery");
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Red onions" })).toBeVisible();
    const rows = await page.locator(".riso-group [data-gi-name]").allTextContents();
    // (Not "Gouss d'ail" or "san peau": the list's English singular rules would mangle French words.)
    expect(rows).toEqual(expect.arrayContaining(["Red onions", "Garlic cloves", "Fresh cilantro", "Boneless skinless chicken thighs"]));
    expect(rows.filter((r) => /oignons|gousses|coriandre/i.test(r))).toEqual([]);
    await shot(page, "grocery-en-from-french");
    await tab(page, "Recipes");

    await page.locator(".rpc", { hasText: RECIPE.title }).click();
    card = page.getByRole("dialog", { name: RECIPE.title });
    await expect(card.locator(".riso-rc-buy-name", { hasText: "Red onions" })).toContainText("finely chopped");
    await expect(card.locator(".riso-rc-buy-name", { hasText: "Biryani masala" })).toContainText("toasted");
    await shot(page, "card-en");
  });
});

test.describe("on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  // Nothing leaves the screen sideways, and the name boxes show all of their text.
  async function fits(page, selector, what) {
    const wider = await page.evaluate(() => document.documentElement.scrollWidth > 390);
    expect(wider, `${what}: the page scrolls sideways`).toBe(false);
    const cut = await page.locator(selector).evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > 391).map((el) => el.textContent.trim().slice(0, 40))
    );
    expect(cut, `${what}: a name is cut`).toEqual([]);
  }

  // A pill's name wraps to a second line before it is cut. One that cannot fit in two lines
  // (« hauts de cuisse de poulet désossés sans peau ») ends in an ellipsis, as a long English
  // one does; every other name is whole, and no pill leaves the screen.
  async function pillsFit(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > 390), "Makeable: the page scrolls sideways").toBe(false);
    const problems = await page.locator(".mkc-pill-name").evaluateAll((names) =>
      names.flatMap((name) => {
        const pill = name.closest(".mkc-pill");
        const text = name.textContent.trim();
        const cut = name.scrollHeight > name.clientHeight + 1;
        const out = [];
        if (pill.getBoundingClientRect().right > 391) out.push(`${text}: leaves the screen`);
        if (cut && text.length <= 28) out.push(`${text}: is cut`);
        return out;
      })
    );
    expect(problems).toEqual([]);
  }

  test("the long French names fit on the card, in Cook mode, on a Grocery row and on Makeable's pills", async ({ page }) => {
    await signUp(page, { fr: true });
    await seed(page);
    await page.reload();

    await tab(page, "Recettes");
    await page.locator(".rpc", { hasText: RECIPE.title }).click();
    const card = page.getByRole("dialog", { name: RECIPE.title });
    await expect(card.locator(".riso-rc-buy-name", { hasText: "Hauts de cuisse de poulet désossés sans peau" })).toBeVisible();
    await fits(page, ".riso-rc-buy-name, .riso-rc-buy-meta", "recipe card");
    await shot(page, "card-fr-390");
    await card.getByRole("button", { name: "Commencer à cuisiner" }).click();
    await expect(page.locator(".cm-prep-row").first()).toBeVisible();
    await fits(page, ".cm-uses-name, .cm-prep-how, .cm-uses-qty", "Cook mode, before you start");
    await shot(page, "cook-prep-fr-390");
    await page.getByRole("button", { name: "Commencer l'étape 1" }).click();
    await page.locator(".cm-uses-row").first().waitFor();
    await fits(page, ".cm-uses-name, .cm-uses-qty", "Cook mode, for this step");
    await shot(page, "cook-step-fr-390");
    await page.getByRole("button", { name: "Quitter le mode cuisine" }).click();
    await page.keyboard.press("Escape");

    await tab(page, "Faisable");
    await expect(page.locator(".mkc-pill-name").first()).toBeVisible();
    await pillsFit(page);
    await shot(page, "makeable-fr-390");

    await tab(page, "Épicerie");
    await expect(page.locator(".riso-group [data-gi-name]", { hasText: "Oignons rouges" })).toBeVisible();
    await fits(page, ".riso-group [data-gi-name]", "Grocery rows");
    await shot(page, "grocery-fr-390");
  });
});

test.describe("the admin's list of names with no translation yet", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 1000 } });

  test("lists the names the table does not know with how many recipes use them, and Copy gives the prep notes' lines to fill in", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await prisma.user.deleteMany({ where: { email: ADMIN } });
    await prisma.user.create({ data: { email: ADMIN, passwordHash: await bcrypt.hash(PASSWORD, 10), locale: "en" } });
    await page.goto("/");
    await page.fill('input[type="email"]', ADMIN);
    await page.fill('input[type="password"]', PASSWORD);
    await page.locator(".riso-auth-submit").click();
    await expect(page.locator(".tab.active")).toHaveText("Home");
    await page.request.post("/api/recipes", { data: RECIPE });
    await page.request.post("/api/recipes", { data: { ...RECIPE, title: "Biryani again", ingredients: [{ name: "biryani masala" }, { name: "Pâte de piment fort" }, { name: "onions", notes: "cut like a pro" }] } });
    await page.goto("/admin");

    const card = page.locator(".riso-admin-names");
    await expect(card.getByRole("heading", { name: "Ingredient names" })).toBeVisible();
    const list = card.getByRole("list", { name: "Ingredient names with no translation" });
    await expect(list.locator("li", { hasText: "Biryani masala" })).toContainText("2 recipes");
    await expect(list.locator("li", { hasText: "Pâte de piment fort" })).toContainText("1 recipe");
    // The ones the table has are not listed.
    await expect(list.locator("li", { hasText: "red onions" })).toHaveCount(0);
    await expect(list.locator("li", { hasText: "garlic cloves" })).toHaveCount(0);

    // A prep note the table does not know is listed too, and Copy gives its line for the table file
    // (names are filled in on this page: see e2e/ingredient-name-edits.spec.js).
    await expect(card.getByRole("list", { name: "Prep notes with no translation" }).locator("li")).toContainText("cut like a pro");
    const copy = card.getByRole("button", { name: "Copy the prep notes as lines of the names table" });
    await copy.click();
    await expect(copy).toContainText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^# \[prep words\]/m);
    expect(copied).toContain("cut like a pro |  |  |  |  # 1 recipe");
    expect(copied).not.toMatch(/biryani masala/i);
    await shot(page, "admin-names-en", card);
  });

  test("a tester does not see the list", async ({ page }) => {
    await signUp(page, { fr: false });
    await page.goto("/admin");
    await expect(page.locator(".riso-admin-names")).toHaveCount(0);
  });
});
