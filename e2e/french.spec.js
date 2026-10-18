import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { saveRecipe } from "./recipe-form.js";
import { PrismaClient } from "@prisma/client";
import { langSwitch } from "./account-menu.js";
import { quebecDayIn } from "./quebec-day.js";

const prisma = new PrismaClient();

// The whole app in Quebec French: a browser set to French gets French
// without asking, every screen (and its buttons' labels, tooltips and
// placeholders) says it in French, and the choice follows the account.

test.use({ locale: "fr-CA", viewport: { width: 1280, height: 900 } });

// English words that would mean a screen still talks English. Everything
// this test adds is in French, so any of these on screen is the app's own
// text. (Words that are French too - "photo", "minutes", "plan", "date", and "item" (Quebec French says "un item") -
// can't tell, and store names and the flyers' own English product names
// are fine.)
// (Word edges are letters in any alphabet: "import" isn't in "importées".)
const ENGLISH =
  /(?<!\p{L})(the|and|with|your|you|add|remove|delete|edit|save|cancel|close|open|recipes?|planner|grocery|groceries|inventory|flyers?|home|week|today|tomorrow|ingredients?|search|shelf|shelves|fridge|freezer|pantry|deals?|sale|price|buy|days?|months?|show|hide|drag|click|tap|pick|back|next|previous|loading|nothing|yet|none|stores?|left|leftovers?|dinner|lunch|breakfast|snack|cook|servings?|already|make|import|settings)(?!\p{L})/iu;

// Visible text, and the labels, tooltips and placeholders of everything
// on the page, that read English.
async function englishOn(page) {
  return page.evaluate((source) => {
    const re = new RegExp(source, "iu");
    const hits = new Set();
    const shown = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue.trim();
      if (text && re.test(text) && shown(walker.currentNode.parentElement)) hits.add(text);
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder]")) {
      for (const attr of ["aria-label", "title", "placeholder"]) {
        const value = el.getAttribute(attr);
        if (value && re.test(value)) hits.add(`${attr}="${value}"`);
      }
    }
    return [...hits];
  }, ENGLISH.source);
}

async function expectAllFrench(page, screen) {
  await page.screenshot({ path: test.info().outputPath(`${screen}.png`), fullPage: true });
  expect(await englishOn(page), screen).toEqual([]);
}

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// A use-by day n Quebec days from today ("2026-10-15"): days left are Quebec days.
const inDays = (n) => quebecDayIn(n);

async function signUpInFrench(page) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
  await page.getByRole("button", { name: "S'inscrire" }).click();
  await page.fill('input[type="email"]', `fr+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Accueil");
}

// A week with something in every screen, all of it in French.
async function seedKitchen(page) {
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: {
        title: "Salade de pois chiches",
        mealSlot: "dinner",
        prepTimeMinutes: 15,
        cookTimeMinutes: 10,
        baseServings: 4,
        ingredients: [
          { name: "pois chiches", quantity: 2, unit: "cup" },
          { name: "persil", quantity: 1, unit: "bunch" },
          { name: "citron", quantity: 1 },
          { name: "huile d'olive", quantity: 2, unit: "tbsp" },
        ],
        instructions: ["Rincer les pois chiches.", "Mélanger le tout et laisser reposer 10 minutes."],
      },
    })
  ).json();
  await page.request.post("/api/recipes", {
    data: { title: "Soupe aux lentilles", mealSlot: "lunch", ingredients: [{ name: "lentilles" }, { name: "carottes" }] },
  });
  await page.request.post("/api/pantry-inventory", {
    data: { name: "persil", location: "fridge", quantity: 1, unit: "bunch", expiresAt: inDays(1) },
  });
  await page.request.post("/api/pantry-inventory", { data: { name: "pois chiches", location: "pantry", quantity: 2 } });
  await page.request.post("/api/pantry-inventory", { data: { name: "citron", location: "fridge", quantity: 3, expiresAt: inDays(-1) } });
  const weekStart = mondayOf(new Date());
  const today = (new Date().getDay() + 6) % 7;
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: today, mealType: "dinner" } });
  await page.request.post("/api/planner/blank", {
    data: { weekStart, dayOfWeek: (today + 1) % 7, mealType: "dinner", note: "Pool de hockey" },
  });
  return recipe;
}

test("every screen speaks French, with nothing left in English", async ({ page }) => {
  await signUpInFrench(page);
  await seedKitchen(page);
  await page.reload();
  await expect(page.locator(".riso-home-hero")).toBeVisible();
  await expect(page).toHaveTitle(/livre de recettes|matt mo/i);
  await expectAllFrench(page, "accueil");

  // Recipes, a recipe's card, cook mode and the editor.
  await page.getByRole("button", { name: "Recettes", exact: true }).click();
  await expect(page.getByText("Salade de pois chiches").first()).toBeVisible();
  await expectAllFrench(page, "recettes");
  await page.getByText("Salade de pois chiches").first().click();
  // A recipe opens its card in one tap: Commencer à cuisiner, then Planifier.
  await expect(page.locator(".riso-rc-actions button").first()).toHaveText("Commencer à cuisiner");
  await expect(page.locator(".riso-rc-actions button").nth(1)).toHaveText("Planifier");
  await expect(page.locator(".riso-rc-step").first()).toBeVisible();
  await expectAllFrench(page, "fiche-recette");
  await page.getByRole("button", { name: "Recettes similaires" }).click();
  await expect(page.locator(".riso-rc-sim")).toBeVisible();
  await expectAllFrench(page, "fiche-recette-similaires");
  await page.getByRole("button", { name: /← Retour à/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /nouvelle recette/i }).click();
  await expect(page.locator(".re-title")).toBeVisible();
  await expectAllFrench(page, "editeur");
  await page.getByRole("button", { name: "Annuler" }).click();

  // Planner, with its tray.
  await page.getByRole("button", { name: "Planificateur", exact: true }).click();
  await expect(page.locator(".riso-planner-board")).toBeVisible();
  await expectAllFrench(page, "planificateur");

  // What can I make.
  await page.getByRole("button", { name: "Faisable", exact: true }).click();
  await expect(page.locator(".mk-title")).toBeVisible();
  await expectAllFrench(page, "faisable");

  // Grocery list, its aisle view and store mode.
  await page.getByRole("button", { name: "Épicerie", exact: true }).click();
  await expect(page.locator(".riso-group .riso-row").first()).toBeVisible();
  await expectAllFrench(page, "epicerie");
  await page.getByRole("button", { name: "Par rayon" }).click();
  await expect(page.locator(".riso-group-name").first()).toBeVisible();
  await expectAllFrench(page, "epicerie-rayons");

  // Flyers (the sample deals), an ingredient's card, a deal's own card,
  // the import settings and the import check.
  await page.getByRole("button", { name: "Circulaires", exact: true }).click();
  await expect(page.locator(".riso-ing-card").first()).toBeVisible();
  await expectAllFrench(page, "circulaires");
  await page.locator(".riso-ing-main").first().click();
  await expect(page.locator(".riso-ing-panel")).toBeVisible();
  await expectAllFrench(page, "circulaire-carte");
  await page.locator(".riso-ing-variant-names").first().click();
  await expect(page.locator(".riso-deal-detail")).toBeVisible();
  await expectAllFrench(page, "aubaine");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Paramètres" }).click();
  await expect(page.locator(".riso-import-settings")).toBeVisible();
  await page.getByRole("button", { name: "Vérifier l'importation" }).click();
  await expect(page.locator(".riso-report, .riso-error, .riso-import-note").first()).toBeVisible();
  await expectAllFrench(page, "importation");

  // Inventory, an item's panel and the add form.
  await page.getByRole("button", { name: "Inventaire", exact: true }).click();
  await expect(page.locator(":is(.inv-row, .inv-tile)").first()).toBeVisible();
  await expectAllFrench(page, "inventaire");
  await page.locator(":is(.inv-row, .inv-tile)", { hasText: "persil" }).click();
  await expect(page.locator(".riso-itemform")).toBeVisible();
  await expectAllFrench(page, "inventaire-article");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Ajouter un article" }).click();
  await expectAllFrench(page, "inventaire-ajout");
});

test("on a phone too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUpInFrench(page);
  await seedKitchen(page);
  await page.reload();
  await expect(page.locator(".riso-home-hero")).toBeVisible();
  await expectAllFrench(page, "tel-accueil");
  for (const [tab, name] of [
    ["Planificateur", "tel-planificateur"],
    ["Épicerie", "tel-epicerie"],
    ["Inventaire", "tel-inventaire"],
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await expectAllFrench(page, name);
  }

  // FR | EN sits right in the phone header, next to the avatar.
  const phoneSwitch = page.locator(".app-header-phone-tools .riso-lang-switch");
  await expect(phoneSwitch).toBeVisible();
  await phoneSwitch.getByRole("button", { name: "English" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Inventory");
  await phoneSwitch.getByRole("button", { name: "Français" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Inventaire");

  // Store mode, on the grocery list.
  await page.getByRole("button", { name: "Épicerie", exact: true }).first().click();
  await page.getByRole("button", { name: /Je suis à l.épicerie/ }).click();
  await expect(page.getByRole("dialog", { name: "Mode magasin" })).toBeVisible();
  await expectAllFrench(page, "tel-mode-magasin");
  await page.getByRole("button", { name: "← Liste" }).click();
});

// The recipe form's "Leftovers keep" field (it used to be "Fridge life", and is no longer in the ⋯
// menu): its French label is the longest of the form's steppers, so nothing in them may be cut off.
for (const [where, size] of [
  ["computer", { width: 1280, height: 900 }],
  ["phone", { width: 390, height: 844 }],
]) {
  test(`the recipe form's « Les restes se gardent » field reads French and fits, on a ${where}`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUpInFrench(page);
    await page.getByRole("button", { name: "Recettes", exact: true }).first().click();
    await page.getByRole("button", { name: "+ Nouvelle recette" }).click();

    const field = page.locator(".re-stepper", { hasText: "LES RESTES SE GARDENT" });
    await expect(field).toBeVisible();
    await expect(field.getByLabel("LES RESTES SE GARDENT", { exact: true })).toBeVisible();
    await expect(field.getByRole("button", { name: "Moins : jours de conservation des restes" })).toBeVisible();
    await expect(field.getByRole("button", { name: "Plus : jours de conservation des restes" })).toBeVisible();
    await expect(field).toContainText("Utilisé pour les restes dans l'inventaire.");
    await expect(field).toContainText("JOURS");

    // No label, number, button or help line in the form's steppers runs out of its box.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll(".re-stepper")]
        .flatMap((el) => [...el.querySelectorAll(".re-label, .re-help, .re-stepper-unit, button, input")])
        .filter((e) => e.offsetParent && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1))
        .map((e) => e.textContent || e.getAttribute("aria-label"))
    );
    expect(cut).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    expect(await englishOn(page)).toEqual([]);
  });
}

// The Feedback form (the avatar menu's « Envoyer un commentaire »), the « Signaler un problème » link
// beside the load error, Help's last card and the crash page: all French, and no label, button or
// line runs out of its box (« Quelque chose ne marche pas » is the longest label).
async function cutOff(page, selector, { tall = true } = {}) {
  return page.evaluate(
    ([sel, checkHeight]) =>
      [...document.querySelectorAll(sel)]
        .filter(
          (e) =>
            e.offsetParent &&
            (e.scrollWidth > e.clientWidth + 1 || (checkHeight && e.scrollHeight > e.clientHeight + 1) || e.getBoundingClientRect().right > window.innerWidth + 1)
        )
        .map((e) => e.textContent.trim().slice(0, 40)),
    [selector, tall]
  );
}

for (const [where, size] of [
  ["computer", { width: 1280, height: 900 }],
  ["phone", { width: 390, height: 844 }],
]) {
  test(`the Feedback form, its link beside an error and Help's last card read French and fit, on a ${where}`, async ({ page }) => {
    await page.setViewportSize(size);
    // The Planner can't be read when the app opens, so the red bar shows.
    await page.route((url) => url.pathname === "/api/planner", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
    await signUpInFrench(page);

    const banner = page.locator(".load-error-banner");
    await expect(banner).toContainText("Impossible de tout charger");
    await expect(banner.getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(await cutOff(page, ".load-error-banner, .load-error-banner button")).toEqual([]);
    await banner.getByRole("button", { name: "Signaler un problème" }).click();

    const form = page.getByRole("dialog", { name: "Envoyer un commentaire" });
    await expect(form.getByRole("button", { name: "Quelque chose ne marche pas" })).toHaveAttribute("aria-pressed", "true");
    await expect(form.getByRole("button", { name: "Une idée" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Autre" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Annuler" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Envoyer", exact: true })).toBeDisabled();
    await form.getByLabel("Votre message").fill("x".repeat(1850));
    await expect(form.getByText("1850 / 2000")).toBeVisible();
    await expectAllFrench(page, `commentaire-${where}`);
    expect(await cutOff(page, ".riso-feedback label, .riso-feedback legend, .riso-feedback button, .riso-feedback p")).toEqual([]);
    expect(await cutOff(page, ".riso-feedback h2", { tall: false })).toEqual([]); // tight line spacing: width only
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    await form.getByRole("button", { name: "Annuler" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abandonner" }).click();
    await expect(form).toBeHidden();

    // The avatar menu names it, and Help's last card has the same button.
    await page.locator(".app-header").getByRole("button", { name: "Compte" }).click();
    await expect(page.getByRole("button", { name: "Envoyer un commentaire", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    const card = page.locator("#help-feedback");
    await expect(card.getByRole("heading", { name: "Un problème, ou une idée?" })).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await expectAllFrench(page, `aide-commentaire-${where}`);
    expect(await cutOff(page, "#help-feedback p, #help-feedback button")).toEqual([]);
    expect(await cutOff(page, "#help-feedback h2", { tall: false })).toEqual([]);
    await expect(page.locator("#help-account")).toContainText("Un problème, ou une idée?");
  });
}

test("the crash page reads French and fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route((url) => url.pathname === "/api/planner/upcoming", (route) => route.fulfill({ status: 200, json: { oups: "pas une liste" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "S'inscrire" }).click();
  await page.fill('input[type="email"]', `crash+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Créer un compte" }).click();

  const crash = page.locator(".riso-crash");
  await expect(crash.getByRole("heading", { name: "Quelque chose s'est mal passé." })).toBeVisible();
  await expect(crash.getByRole("button", { name: "Recharger" })).toBeVisible();
  await expect(crash.getByRole("button", { name: "Signaler un problème" })).toBeVisible();
  await expectAllFrench(page, "page-erreur");
  expect(await cutOff(page, ".riso-crash p, .riso-crash button")).toEqual([]);
  expect(await cutOff(page, ".riso-crash h1", { tall: false })).toEqual([]); // tight line spacing: width only
});

// The app name in the header is the link Home, named « Accueil » in French.
test("the app name is the link « Accueil »", async ({ page }) => {
  await signUpInFrench(page);
  await page.getByRole("button", { name: "Inventaire", exact: true }).first().click();
  await expect(page.locator(".tab.active")).toHaveText("Inventaire");
  await page.locator("h1.wordmark").getByRole("link", { name: "Accueil", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Accueil");
});

test("the language follows the account, and the server answers in it", async ({ page }) => {
  // A wrong password is turned down in French.
  await page.goto("/");
  await page.fill('input[type="email"]', "personne@example.com");
  await page.fill('input[type="password"]', "mauvais-mot-de-passe");
  await page.locator(".riso-auth-submit").click();
  await expect(page.getByText("Courriel ou mot de passe incorrect.")).toBeVisible();

  await signUpInFrench(page);
  expect((await (await page.request.get("/api/auth/me")).json()).locale).toBe("fr");

  // Switching to English changes the app straight away and is saved.
  await langSwitch(page).getByRole("button", { name: "English" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).locale).toBe("en");

  // A fresh browser (no saved choice) in French still opens in English
  // once logged in to this account.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  // And back to French.
  await langSwitch(page).getByRole("button", { name: "Français" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Accueil");
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).locale).toBe("fr");
});

test("a French recipe reads its measures, and meets French flyer deals", async ({ page }) => {
  await signUpInFrench(page);
  const me = await (await page.request.get("/api/auth/me")).json();
  await prisma.flyerDeal.create({
    data: {
      userId: me.user?.id ?? me.id,
      store: "Metro",
      source: "Metro",
      category: "meat",
      item: "Poitrines de poulet désossées | Boneless chicken breasts",
      matchName: "boneless chicken breasts",
      price: "$4.99/lb",
      unitPrice: 4.99,
      unitBasis: "lb",
      regularPrice: 7.99,
      isCurrent: true,
    },
  });
  await page.reload();

  // Pasting a French list fills in amount, measure, food and note.
  await page.getByRole("button", { name: "Recettes", exact: true }).click();
  await page.getByRole("button", { name: /nouvelle recette/i }).click();
  await page.getByLabel("TITRE").fill("Poulet au citron");
  await page.getByRole("button", { name: "Coller une liste complète" }).click();
  await page
    .getByLabel("Liste d'ingrédients")
    .fill("2 tasses de bouillon de poulet\n1 c. à soupe d'huile d'olive\n3 gousses d'ail, hachées\n500 g de poitrines de poulet");
  await page.getByRole("button", { name: "Ajouter ceux-ci" }).click();
  await expect(page.locator('input[aria-label="Ingrédient"]')).toHaveCount(4);
  await expect(page.locator('input[aria-label="Ingrédient"]').nth(0)).toHaveValue("Bouillon de poulet");
  await expect(page.locator('input[aria-label="Ingrédient"]').nth(1)).toHaveValue("Huile d'olive");
  await expect(page.locator('input[aria-label="Ingrédient"]').nth(2)).toHaveValue("Ail");
  await expect(page.getByRole("textbox", { name: "Note", exact: true }).nth(2)).toHaveValue("hachées");
  await expect(page.locator('input[aria-label="Ingrédient"]').nth(3)).toHaveValue("Poitrines de poulet");
  await expect(page.locator('input[aria-label="Quantité"]').nth(0)).toHaveValue("2");
  await saveRecipe(page);

  // The chicken is on sale: the recipe's card says so, from the French
  // half of the flyer's name.
  await page.getByText("Poulet au citron").first().click();
  await expect(page.locator(".riso-sale-tag", { hasText: "Metro" }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // + Liste on the flyer card puts the French name on the grocery list,
  // in the Metro store, with its sale price.
  await page.getByRole("button", { name: "Circulaires", exact: true }).click();
  const card = page.locator(".riso-ing-card", { hasText: "Poitrines de poulet désossées" });
  await card.locator(".riso-ing-main").click();
  await card.getByRole("button", { name: /Ajouter Poitrines de poulet désossées/ }).click();
  await page.getByRole("button", { name: "Épicerie", exact: true }).click();
  const row = page.locator(".riso-group .riso-row", { hasText: "Poitrines de poulet désossées" });
  await expect(row).toBeVisible();
  await expect(page.getByRole("region", { name: "Magasin Metro" })).toContainText("Poitrines de poulet désossées");
  await expect(row.locator(".riso-row-deal")).toContainText("$");
});

