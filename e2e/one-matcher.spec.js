import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

// One matcher everywhere (lib/inventoryMatch.js): the same recipe, next to an
// Inventory written in French, gives the same answer on Makeable, the recipe
// card and the Planner (its search and the planned
// meal's card). Salt, oil and « sel et poivre » are ingredients like any other: had
// because « Sel », « Huile d'olive » and « Poivre noir » are in Inventory; the garlic
// written twice is one line; a leftover never counts.

const INGREDIENTS = [
  "boneless skinless chicken thighs",
  "garlic cloves",
  "kosher salt",
  "yellow onion",
  "minced garlic",
  "basmati rice",
  "olive oil",
  "sel et poivre",
  "fresh cilantro",
  "lime",
];
const INVENTORY = ["Hauts de cuisse de poulet", "Ail", "Oignons", "Riz", "Coriandre", "Sel", "Huile d'olive", "Poivre noir"];
const TITLE = "Garlic chicken and rice";

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const todayIndex = () => (new Date().getDay() + 6) % 7;

async function signUp(page, { signUp: signUpLabel, create, home }) {
  await page.goto("/");
  await page.getByRole("button", { name: signUpLabel }).click();
  await page.fill('input[type="email"]', `matcher+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: create }).click();
  await expect(page.locator(".tab.active")).toHaveText(home);
}

async function seed(page) {
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: { title: TITLE, mealSlot: "dinner", instructions: ["Cook it."], ingredients: INGREDIENTS.map((name) => ({ name })) },
    })
  ).json();
  for (const name of INVENTORY) await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
  // A leftover of a chicken dish: never counts as chicken.
  await page.request.post("/api/pantry-inventory", { data: { name: "Poulet au beurre (restes)", location: "fridge", isLeftover: true } });
  await page.reload();
  return recipe;
}

const tab = (page, name) => page.getByRole("button", { name, exact: true }).first();

// Makeable and the recipe card it opens, in the language given.
async function checkMakeableAndCard(page, L) {
  await tab(page, L.makeable).click();
  const card = page.locator(".fnd-sec.few .mkc", { has: page.locator(".rpc-title", { hasText: TITLE }) });
  await expect(card).toBeVisible();
  await expect(card.locator(".mkc-progress span")).toHaveText([L.eightOfNine, L.oneMissing]);
  await expect(card.locator(".mkc-pill-name")).toHaveText([/lime/i]);

  // The recipe card, in one tap: the same numbers, eight you have and the lime to buy.
  await card.locator(".rpc-title").click();
  const rc = page.getByRole("dialog", { name: TITLE });
  await expect(rc.locator(".riso-rc-have-head")).toContainText(L.inInventory);
  await expect(rc.locator(".riso-rc-have")).toHaveCount(8);
  await expect(rc.locator(".riso-rc-sticker")).toHaveText(L.oneToBuy);
  await expect(rc.locator(".riso-rc-buy")).toHaveCount(1);
  await expect(rc.locator(".riso-rc-buy")).toContainText(/lime/i);
  await expect(rc.locator(".riso-rc-buy .riso-rc-mark")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(rc).toHaveCount(0);
}

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("Makeable, the recipe card and the Planner agree, with a French Inventory", async ({ page }) => {
    await signUp(page, { signUp: "Sign up", create: "Create account", home: "Home" });
    const recipe = await seed(page);
    await checkMakeableAndCard(page, {
      makeable: "Makeable",
      eightOfNine: "8/9 ingredients",
      oneMissing: "1 missing",
      inInventory: "In your Inventory · 8",
      oneToBuy: "1 thing to buy",
    });

    // The Planner's search card says the same.
    await tab(page, "Planner").click();
    await page.getByRole("button", { name: "Browse" }).click();
    const result = page.locator(".fnd-card", { has: page.locator(".rpc-title", { hasText: TITLE }) });
    await expect(result.locator(".rpc-info > span")).toHaveText(["8/9", "1 missing"]);

    // And so does the planned meal's card.
    const day = Math.min(todayIndex(), 4);
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
    await page.reload();
    await tab(page, "Planner").click();
    await page.locator(".riso-planner-cell").nth(2 * 7 + day).locator(".riso-planner-card").click();
    const planned = page.getByRole("dialog", { name: TITLE });
    await expect(planned.locator(".ing-marks-have .riso-pill")).toHaveCount(8);
    await expect(planned.locator(".ing-marks-buy-pill")).toHaveCount(1);
    await expect(planned.locator(".ing-marks-buy-pill")).toContainText(/lime/i);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  test("the same answer at 390px, with no sideways scroll", async ({ page }) => {
    await signUp(page, { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" });
    const recipe = await seed(page);
    await checkMakeableAndCard(page, {
      makeable: "Faisable",
      eightOfNine: "8/9 ingrédients",
      oneMissing: "1 manquant",
      inInventory: "Dans votre inventaire · 8",
      oneToBuy: "1 article à acheter",
    });

    // The planned meal's card on the phone board: « 1 à acheter ».
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner" } });
    await page.reload();
    await tab(page, "Planificateur").click();
    await expect(page.locator(".pmb")).toBeVisible();
    await page.locator(".pmb-cell .riso-planner-card").first().click();
    await expect(page.getByRole("dialog", { name: TITLE }).locator(".pmi-status")).toContainText("1 à acheter");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
