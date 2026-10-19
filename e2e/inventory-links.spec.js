import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

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
// Set SHOTS_DIR to also save the screenshots of the four pieces there.

const TITLE = "Crispy Wonton Chicken Salad";
const INGREDIENTS = ["boneless skinless chicken breasts", "wonton wrappers", "rice vinegar", "low sodium soy sauce", "tamari", "sesame oil"];
const INVENTORY = ["Rice wine vinegar", "Soy sauce", "Chicken breast", "Toasted sesame oil"];

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const nextMonday = () => {
  const x = new Date(mondayOf(new Date()) + "T12:00:00");
  x.setDate(x.getDate() + 7);
  return mondayOf(x);
};

async function setup(page, { lang = "en" } = {}) {
  const words = lang === "fr" ? { signUp: "S'inscrire", create: "Créer un compte", home: "Accueil" } : { signUp: "Sign up", create: "Create account", home: "Home" };
  await page.goto("/");
  await page.getByRole("button", { name: words.signUp }).click();
  await page.fill('input[type="email"]', `links+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: words.create }).click();
  await expect(page.locator(".tab.active")).toHaveText(words.home);
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: { title: TITLE, mealSlot: "dinner", baseServings: 2, instructions: ["Fry the wontons.", "Toss it all."], ingredients: INGREDIENTS.map((name) => ({ name })) },
    })
  ).json();
  // Next week, so its meal is always ahead and on the Grocery list.
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: nextMonday(), dayOfWeek: 0, mealType: "dinner" } });
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
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".riso-row-name")).toHaveText(["Tamari", "Wonton wrapper"]);
    await page.request.post("/api/planner", { data: { recipeId: (await (await page.request.get("/api/recipes")).json())[0].id, weekStart: mondayOf(new Date()), dayOfWeek: Math.min((new Date().getDay() + 6) % 7, 4), mealType: "dinner" } });
    await page.reload();
    await tab(page, L.en.planner).click();
    const day = Math.min((new Date().getDay() + 6) % 7, 4);
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
    const day = Math.min((new Date().getDay() + 6) % 7, 4);
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
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
    const day = Math.min((new Date().getDay() + 6) % 7, 4);
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: day, mealType: "dinner" } });
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
