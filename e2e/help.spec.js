import { expect, test } from "@playwright/test";
import { accountButton, langSwitch, openHelp } from "./account-menu.js";

// The Help screen: reachable from the header on a computer and from the
// account button on a phone, in English and in Quebec French. Its FAQ opens
// and closes by keyboard and by touch, the credits name every outside
// source, and a long French menu never widens the page.

const STATCAN = {
  en: {
    table: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501",
    licence: "https://www.statcan.gc.ca/en/terms-conditions/open-licence",
  },
  fr: {
    table: "https://www150.statcan.gc.ca/t1/tbl1/fr/tv.action?pid=1810024501",
    licence: "https://www.statcan.gc.ca/fr/avis/licence-ouverte",
  },
};

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

// Every credit's link buttons: full width of their card, words on the left,
// the arrow on the right and level with the words (never alone on a line).
async function expectCreditLinks(page) {
  const links = page.locator("#help-credits .riso-help-source-link");
  expect(await links.count()).toBe(7); // six sources, Statistics Canada has two
  for (const box of await links.evaluateAll((els) =>
    els.map((el) => {
      const card = el.closest(".riso-help-source").getBoundingClientRect();
      const link = el.getBoundingClientRect();
      const label = el.querySelector(".riso-help-source-link-label").getBoundingClientRect();
      const arrow = el.querySelector(".riso-help-source-link-arrow").getBoundingClientRect();
      const cs = getComputedStyle(el);
      const inner = card.width - 2 * 2 - 2 * 16; // card border and padding
      return { fullWidth: Math.abs(link.width - inner), arrowRight: link.right - arrow.right, arrowLeftOfLabel: arrow.left - label.right,
        arrowMid: Math.abs(arrow.top + arrow.height / 2 - (link.top + link.height / 2)), labelBottom: label.bottom, arrowBottom: arrow.bottom, linkBottom: link.bottom, linkTop: link.top, borderBottom: cs.borderBottomWidth };
    })
  )) {
    expect(box.fullWidth).toBeLessThanOrEqual(1);
    expect(box.arrowRight).toBeLessThanOrEqual(22); // 18px padding and 2px border
    expect(box.arrowLeftOfLabel).toBeGreaterThanOrEqual(0); // beside the words, not below them
    expect(box.arrowMid).toBeLessThanOrEqual(1); // vertically centred
  }
}

// The button copies in Help sentences: pictures only. They are not links or
// buttons (so focus skips them) and no [[mark]] is left showing.
async function expectCopiesAreOnlyPictures(page) {
  const copies = page.locator(".riso-help-card .riso-help-copy");
  expect(await copies.count()).toBeGreaterThan(40);
  expect(await page.locator(".riso-help-copy button, .riso-help-copy a, .riso-help-copy [tabindex], .riso-help-copy [role=button]").count()).toBe(0);
  await expect(page.locator(".riso-help")).not.toContainText(/\[\[|\]\]/);
}

test.describe("desktop, English", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 900 } });

  test("Help opens from the header; every section, the FAQ and the credits are there", async ({ page }) => {
    await signUp(page, "en");
    await openHelp(page);
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
    const credits = page.locator("#help-credits");
    await expect(credits.getByRole("link", { name: /Statistics Canada Open Licence/ })).toHaveAttribute("href", STATCAN.en.licence);
    await expect(credits.getByRole("link", { name: /Visit Statistics Canada/ })).toHaveAttribute("href", STATCAN.en.table);
    await page.screenshot({ path: test.info().outputPath("help-desktop-en.png"), fullPage: true });
  });


  test("buttons named in the text are drawn in the sentence, as pictures that do nothing", async ({ page }) => {
    await signUp(page, "en");
    await openHelp(page);
    await expectCopiesAreOnlyPictures(page);

    // The Grocery and Store mode lines show the real labels inside the sentences.
    const grocery = page.locator("#help-grocery");
    await expect(grocery.locator("li", { hasText: "Choose a view" }).locator(".riso-segmented")).toHaveText("By storeBy aisleBy recipe");
    await expect(grocery.locator("li", { hasText: "Press" }).locator(".riso-grocery-store-btn")).toContainText("I'm at the store");
    await expect(grocery.locator("li", { hasText: "A checked item shows" }).locator(".riso-row-toinv")).toHaveText("+ Inventory");
    await expect(grocery.locator("li", { hasText: "Press Done shopping" })).toContainText("Done shopping · add 3 to inventory to send every checked item");
    // An icon is hidden from screen readers; a labelled copy is just words.
    await expect(page.locator("#help-planner .riso-planner-nav-arrow").first()).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#help-recipes li", { hasText: "press" }).locator(".riso-help-copy").first()).not.toHaveAttribute("aria-hidden", /.*/);

    // Tapping a copy does nothing: still on Help, nothing was opened.
    const before = page.url();
    await grocery.locator(".riso-grocery-store-btn").click({ force: true });
    await expect(page.locator(".store-mode")).toHaveCount(0);
    await expect(page.locator(".riso-help h1")).toBeVisible();
    expect(page.url()).toBe(before);

    // Tabbing never stops on one.
    await page.locator(".riso-help h1").click();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest(".riso-help-copy"))).toBe(false);
    }
    await expectCreditLinks(page);
    await page.locator("#help-grocery").screenshot({ path: test.info().outputPath("help-grocery-desktop-en.png") });
  });

  test("a FAQ question opens and closes with the keyboard", async ({ page }) => {
    await signUp(page, "en");
    await openHelp(page);
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
    await openHelp(page);
    const help = await accountButton(page, "Help");
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


  test("the button copies wear French labels and wrap cleanly on a phone", async ({ page }) => {
    await signUp(page, "fr");
    await page.getByRole("button", { name: "Compte" }).tap();
    await page.getByRole("button", { name: "Aide", exact: true }).tap();
    await expectCopiesAreOnlyPictures(page);

    const grocery = page.locator("#help-grocery");
    await expect(grocery.locator("li", { hasText: "Choisissez une vue" }).locator(".riso-segmented")).toHaveText("Par magasinPar rayonPar recette");
    await expect(grocery.locator("li", { hasText: "Appuyez sur" }).locator(".riso-grocery-store-btn")).toContainText("Je suis à l'épicerie");
    await expect(page.locator("#help-flyers")).toContainText("Faites des réserves");

    // Nothing pokes out of its card or the screen, and no copy is cut off.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const out = await page.evaluate(() =>
      [...document.querySelectorAll(".riso-help-copy")].filter((el) => {
        if (!el.offsetWidth) return false; // in a closed FAQ answer
        const r = el.getBoundingClientRect();
        const card = el.closest(".riso-help-card").getBoundingClientRect();
        return r.left < card.left || r.right > card.right;
      }).length
    );
    expect(out).toBe(0);
    await grocery.scrollIntoViewIfNeeded();
    await grocery.screenshot({ path: test.info().outputPath("help-grocery-phone-fr.png") });
    await page.locator("#help-flyers").screenshot({ path: test.info().outputPath("help-flyers-phone-fr.png") });
    await page.locator("#help-planner").screenshot({ path: test.info().outputPath("help-planner-phone-fr.png") });

    await expectCreditLinks(page);
    await page.locator("#help-credits").screenshot({ path: test.info().outputPath("help-credits-phone-fr.png") });
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
      "Adapté de Statistique Canada, « Prix de détail moyens mensuels pour certains produits » (tableau 18-10-0245-01), données mensuelles les plus récentes publiées. Cela ne constitue pas une approbation de ce produit par Statistique Canada."
    );
    const credits = page.locator("#help-credits");
    await expect(credits.getByRole("link", { name: /Licence ouverte de Statistique Canada/ })).toHaveAttribute("href", STATCAN.fr.licence);
    await expect(credits.getByRole("link", { name: /Visiter Statistique Canada/ })).toHaveAttribute("href", STATCAN.fr.table);
    await page.screenshot({ path: test.info().outputPath("help-phone-fr-credits.png") });
  });
});

test.describe("desktop, switching language on the Help page", () => {
  test.use({ locale: "en-CA", viewport: { width: 1280, height: 900 } });

  test("the Statistics Canada links follow the language without a reload", async ({ page }) => {
    await signUp(page, "en");
    await openHelp(page);
    const credits = page.locator("#help-credits");
    const links = credits.locator(".riso-help-source", { hasText: /Statistics Canada|Statistique Canada/ }).locator("a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", STATCAN.en.table);
    await expect(links.nth(1)).toHaveAttribute("href", STATCAN.en.licence);

    await page.evaluate(() => {
      window.__noReload = true;
    });
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await expect(links.nth(0)).toHaveAttribute("href", STATCAN.fr.table);
    await expect(links.nth(1)).toHaveAttribute("href", STATCAN.fr.licence);
    await expect(credits.locator(".riso-help-licence")).toContainText("« Prix de détail moyens mensuels pour certains produits » (tableau 18-10-0245-01)");

    await langSwitch(page).getByRole("button", { name: "English" }).click();
    await expect(links.nth(0)).toHaveAttribute("href", STATCAN.en.table);
    await expect(links.nth(1)).toHaveAttribute("href", STATCAN.en.licence);
    expect(await page.evaluate(() => window.__noReload)).toBe(true); // same page load throughout
  });
});
