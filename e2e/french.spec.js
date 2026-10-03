import { expect, test } from "@playwright/test";

// The whole app in Quebec French: a browser set to French gets French
// without asking, every screen (and its buttons' labels, tooltips and
// placeholders) says it in French, and the choice follows the account.

test.use({ locale: "fr-CA", viewport: { width: 1280, height: 900 } });

// English words that would mean a screen still talks English. Everything
// this test adds is in French, so any of these on screen is the app's own
// text. (Words that are French too - "photo", "minutes", "plan", "date" -
// can't tell, and store names and the flyers' own English product names
// are fine.)
// (Word edges are letters in any alphabet: "import" isn't in "importées".)
const ENGLISH =
  /(?<!\p{L})(the|and|with|your|you|add|remove|delete|edit|save|cancel|close|open|recipes?|planner|grocery|groceries|inventory|flyers?|home|week|today|tomorrow|items?|ingredients?|search|shelf|shelves|fridge|freezer|pantry|deals?|sale|price|buy|days?|months?|show|hide|drag|click|tap|pick|back|next|previous|loading|nothing|yet|none|stores?|left|leftovers?|dinner|lunch|breakfast|snack|cook|servings?|already|make|import|settings)(?!\p{L})/iu;

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

const inDays = (n) => new Date(Date.now() + n * 864e5 + 3600e3).toISOString();

async function signUpInFrench(page) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
  await page.getByRole("button", { name: "S'inscrire" }).click();
  await page.fill('input[type="email"]', `fr+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
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
  await expect(page.locator(".riso-rc-step-row").first()).toBeVisible();
  await expectAllFrench(page, "fiche-recette");
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
  await expect(page.locator(".riso-makeable-title")).toBeVisible();
  await expectAllFrench(page, "faisable");

  // Grocery list, its aisle view and store mode.
  await page.getByRole("button", { name: "Épicerie", exact: true }).click();
  await expect(page.locator(".riso-row").first()).toBeVisible();
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
  await expect(page.locator(".inv-card").first()).toBeVisible();
  await expectAllFrench(page, "inventaire");
  await page.locator(".inv-card", { hasText: "persil" }).click();
  await expect(page.locator(".inv-panel")).toBeVisible();
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
  await page.getByRole("button", { name: /Je suis au magasin/ }).click();
  await expect(page.getByRole("dialog", { name: "Mode magasin" })).toBeVisible();
  await expectAllFrench(page, "tel-mode-magasin");
  await page.getByRole("button", { name: "← Liste" }).click();
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
  await page.locator(".app-header-account .riso-lang-switch").getByRole("button", { name: "English" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).locale).toBe("en");

  // A fresh browser (no saved choice) in French still opens in English
  // once logged in to this account.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  // And back to French.
  await page.locator(".app-header-account .riso-lang-switch").getByRole("button", { name: "Français" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Accueil");
  await expect.poll(async () => (await (await page.request.get("/api/auth/me")).json()).locale).toBe("fr");
});
