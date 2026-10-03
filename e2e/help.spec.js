import { expect, test } from "@playwright/test";

// The Help screen: reachable from the header on a computer and from the
// account button on a phone, in English and in Quebec French. Its FAQ opens
// and closes by keyboard and by touch, the credits name every outside
// source, and a long French menu never widens the page.

const SECTIONS = {
  en: ["Home", "Recipes", "Recipe card", "Cook mode", "Planner", "Makeable", "Grocery and Store mode", "Flyers", "Inventory", "Account"],
  fr: ["Accueil", "Recettes", "Fiche de recette", "Mode cuisine", "Planificateur", "Faisable", "Épicerie et mode magasin", "Circulaires", "Inventaire", "Compte"],
};

async function signUp(page, lang) {
  const word = lang === "fr" ? { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" } : { signUp: "Sign up", create: "Create account", home: "Home" };
  await page.goto("/");
  await page.getByRole("button", { name: word.signUp }).click();
  await page.fill('input[type="email"]', `help+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: word.create }).click();
  await expect(page.locator(".tab.active")).toHaveText(word.home);
}

async function expectCredits(page) {
  const credits = page.locator("#help-credits");
  await expect(credits.locator(".riso-help-source")).toHaveCount(6);
  for (const name of ["Statistics Canada|Statistique Canada", "USDA FoodKeeper", "TheMealDB", "Flipp", "Le Rabais", "Google Gemini"]) {
    await expect(credits.locator(".riso-help-source-name", { hasText: new RegExp(name) })).toHaveCount(1);
  }
  // The credit is the Statistics Canada Open Licence's "adapted" wording; the
  // Open Government Licence – Canada line isn't used by any source.
  await expect(credits.locator(".riso-help-licence")).toHaveCount(1);
  await expect(credits).not.toContainText(/Open Government Licen[cs]e|Licence du gouvernement ouvert/);
  await expect(credits).not.toContainText(/\[[^\]]*\]/); // no placeholders left
}

test.describe("desktop, English", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 900 } });

  test("Help opens from the header; every section, the FAQ and the credits are there", async ({ page }) => {
    await signUp(page, "en");
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await expect(page.locator(".riso-help h1")).toContainText("How this works.");
    for (const title of SECTIONS.en) {
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: "Questions and answers" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Sources and credits" })).toBeVisible();
    await expectCredits(page);
    await expect(page.locator("#help-credits .riso-help-licence")).toHaveText(
      "Adapted from Statistics Canada, Monthly average retail prices for selected products, 18-10-0245-01, most recent monthly data published. This does not constitute an endorsement by Statistics Canada of this product."
    );
    const licence = page.getByRole("link", { name: /Statistics Canada Open Licence/ });
    await expect(licence).toHaveAttribute("href", "https://statcan.gc.ca/reference/licence");
    await page.screenshot({ path: test.info().outputPath("help-desktop-en.png"), fullPage: true });
  });

  test("a FAQ question opens and closes with the keyboard", async ({ page }) => {
    await signUp(page, "en");
    await page.getByRole("button", { name: "Help", exact: true }).click();
    const question = page.getByRole("button", { name: /Where do flyer deals come from/ });
    const answer = page.locator("#" + (await question.getAttribute("aria-controls")));
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await expect(answer).toBeHidden();

    await question.focus();
    await page.keyboard.press("Enter");
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("Stock up");

    await page.keyboard.press("Space");
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await expect(answer).toBeHidden();
  });

  test("a menu pill jumps to its section, and the Help button shows it's the current page", async ({ page }) => {
    await signUp(page, "en");
    const help = page.getByRole("button", { name: "Help", exact: true });
    await help.click();
    await expect(help).toHaveAttribute("aria-current", "page");
    await page.getByRole("navigation", { name: "Help sections" }).getByRole("button", { name: "Sources and credits" }).click();
    await expect(page.locator("#help-credits")).toBeInViewport();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".tab.active")).toHaveText("Home");
  });
});

test.describe("phone, Quebec French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Help opens from the account button; the long French menu stays inside the screen", async ({ page }) => {
    await signUp(page, "fr");
    await page.getByRole("button", { name: "Compte" }).tap();
    await page.getByRole("button", { name: "Aide", exact: true }).tap();
    await expect(page.locator(".riso-help h1")).toContainText("Comment ça marche.");

    for (const title of SECTIONS.fr) {
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Every pill sits fully inside the 390 px screen, even the longest French ones.
    const pills = page.getByRole("navigation", { name: "Sections de l'aide" }).getByRole("button");
    expect(await pills.count()).toBe(12);
    for (const box of await pills.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: test.info().outputPath("help-phone-fr-top.png") });
  });

  test("FAQ answers open and close by touch, and the credits are in French", async ({ page }) => {
    await signUp(page, "fr");
    await page.getByRole("button", { name: "Compte" }).tap();
    await page.getByRole("button", { name: "Aide", exact: true }).tap();

    const question = page.getByRole("button", { name: /Pourquoi un article n'est-il pas sur ma liste d'épicerie/ });
    const answer = page.locator("#" + (await question.getAttribute("aria-controls")));
    await question.scrollIntoViewIfNeeded();
    await question.tap();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(answer).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("help-phone-fr-faq.png") });
    await question.tap();
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await expect(answer).toBeHidden();

    await page.getByRole("navigation", { name: "Sections de l'aide" }).getByRole("button", { name: "Sources et crédits" }).tap();
    await expect(page.locator("#help-credits")).toBeInViewport();
    await expectCredits(page);
    await expect(page.locator("#help-credits .riso-help-licence")).toHaveText(
      "Adapté de Statistique Canada, tableau 18-10-0245-01, données mensuelles les plus récentes publiées. Cela ne constitue pas une approbation de ce produit par Statistique Canada."
    );
    await expect(page.getByRole("link", { name: /Licence ouverte de Statistique Canada/ })).toHaveAttribute(
      "href",
      "https://www.statcan.gc.ca/fr/reference/licence"
    );
    await page.screenshot({ path: test.info().outputPath("help-phone-fr-credits.png") });
  });
});
