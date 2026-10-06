import { expect, test } from "@playwright/test";
import { cancelAdd, confirmAdd } from "./inventory-confirm.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Store mode (design: docs/design/riso-v2-store-mode): one scrolling list in a
// section for each store (a coloured sticker that folds it away), All / Aisle /
// Hide done, checked rows fade but never move, light or dark and the sticker
// colours (kept on the device), and leaving with items checked asks about adding
// them to Inventory, always through the Inventory confirmation.

test.use({ viewport: { width: 390, height: 844 } });

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `store-mode+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

// A week at two stores: on sale at Metro (ground beef, limes) and Super C
// (chicken breasts), and the rest unfiled (they land in the first store).
async function seedList(page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  const deal = (store, item, matchName, price, unitPrice, unitBasis, category) => ({
    userId, store, source: store, category, item, matchName, price, unitPrice, unitBasis, regularPrice: unitPrice * 1.4, isCurrent: true,
    // Metro's flyer is the newer one, so it is the first store (where unfiled items land) on every run.
    createdAt: new Date(Date.now() - (store === "Metro" ? 0 : 60_000)),
  });
  await prisma.flyerDeal.createMany({
    data: [
      deal("Metro", "Bœuf haché mi-maigre Irresistibles | Irresistibles medium ground beef", "medium ground beef", "$5.44/lb", 5.44, "lb", "meat"),
      deal("Metro", "Limes | Limes", "limes", "$0.88", 0.88, "each", "produce"),
      deal("Super C", "Poitrines de poulet Maple Leaf | Maple Leaf chicken breasts", "chicken breasts", "$4.87/lb", 4.87, "lb", "meat"),
    ],
  });
  for (const [name, quantity] of [["ground beef", 1], ["limes", 2], ["chicken breasts", 2], ["rice", 1], ["cilantro", 1], ["frozen peas", 1]]) {
    await page.request.post("/api/grocery-extra-items", { data: { name, quantity } });
  }
  await page.reload();
}

async function openStoreMode(page) {
  await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
  await expect(page.locator(".riso-row").first()).toBeVisible();
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  const mode = page.getByRole("dialog", { name: "Store mode" });
  await expect(mode).toBeVisible();
  return mode;
}

test("Store mode is one list with a section for each store, in a sticker you can fold away", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);

  // No tabs, no Done button: the stores are sections of one list.
  await expect(mode.getByRole("tab")).toHaveCount(0);
  await expect(mode.locator(".store-mode-sticker")).toHaveText(["Metro", "Super C"]);
  await expect(mode.locator(".store-mode-badge")).toHaveText(["5 LEFT", "1 LEFT"]);
  await expect(mode.locator(".store-mode-num")).toHaveText("6");
  await expect(mode.locator(".store-mode-at")).toHaveText("left on the list");

  // Items are A to Z in each store, and show only the name and the number.
  const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
  await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Ground beef", "Limes", "Rice"]);
  const beef = metro.locator(".store-mode-row", { hasText: "Ground beef" });
  await expect(beef.locator(".store-mode-sale, .store-mode-brand")).toHaveCount(0);
  await expect(beef.locator(".store-mode-qty")).toHaveText("1");
  await page.screenshot({ path: test.info().outputPath("dark-default.png") });

  // The sticker is the store's colour: black with a coloured shadow in the dark theme.
  const sticker = metro.locator(".store-mode-sticker");
  expect(await sticker.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).boxShadow])).toEqual([
    "rgb(0, 0, 0)",
    "rgb(255, 72, 176) 3px 3px 0px 0px",
  ]);

  // Tapping the sticker folds the store; the count stays.
  await metro.getByRole("button", { name: "Fold Metro" }).click();
  await expect(metro.locator(".store-mode-row")).toHaveCount(0);
  await expect(metro.locator(".store-mode-badge")).toHaveText("5 LEFT");
  await page.screenshot({ path: test.info().outputPath("dark-folded.png") });
  await metro.getByRole("button", { name: "Unfold Metro" }).click();
  await expect(metro.locator(".store-mode-row")).toHaveCount(5);
});

test("All, Aisle and Hide done are three separate switches, none on at first", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);
  const all = mode.getByRole("button", { name: "All", exact: true });
  const aisle = mode.getByRole("button", { name: "Aisle", exact: true });
  const hide = mode.getByRole("button", { name: "Hide done" });
  for (const button of [all, aisle, hide]) await expect(button).toHaveAttribute("aria-pressed", "false");

  // Aisle: the store's items under their aisle's name, in walking order.
  await aisle.click();
  const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
  await expect(metro.locator(".store-mode-aisle")).toHaveText(["Fruits & vegetables", "Meat & poultry", "Frozen", "Pantry"]);
  await page.screenshot({ path: test.info().outputPath("dark-aisle.png") });

  // All: no store headers, one list (still by aisle while Aisle is on).
  await all.click();
  await expect(mode.locator(".store-mode-sticker")).toHaveCount(0);
  await expect(mode.locator(".store-mode-row")).toHaveCount(6);
  await aisle.click();
  await expect(mode.locator(".store-mode-aisle")).toHaveCount(0);
  await expect(mode.locator(".store-mode-name")).toHaveText(["Chicken breasts", "Cilantro", "Frozen peas", "Ground beef", "Limes", "Rice"]);
  await all.click();

  // Hide done takes the checked ones out of view (and a store with none left); the count still counts them.
  await mode.locator(".store-mode-row", { hasText: "Chicken breasts" }).click();
  await hide.click();
  await expect(mode.locator(".store-mode-row", { hasText: "Chicken breasts" })).toHaveCount(0);
  await expect(mode.locator(".store-mode-sticker")).toHaveText(["Metro"]);
  await expect(mode.locator(".store-mode-num")).toHaveText("5");
  await hide.click();
  await expect(mode.locator(".store-mode-sticker")).toHaveText(["Metro", "Super C"]);
});

test("a checked row fades and strikes through but never moves; the count and the pink bar follow; the theme is remembered", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);
  const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
  await expect(mode.locator(".store-mode-track div")).toHaveCSS("width", "0px");

  await metro.locator(".store-mode-row", { hasText: "Cilantro" }).click();
  await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Ground beef", "Limes", "Rice"]); // same order
  const row = metro.locator(".store-mode-row", { hasText: "Cilantro" });
  await expect(row).toHaveClass(/\bon\b/);
  await expect(row).toHaveCSS("opacity", "0.45");
  await expect(row.locator(".store-mode-name")).toHaveCSS("text-decoration-line", "line-through");
  await expect(row.locator(".store-mode-check")).toHaveText("✓");
  await expect(mode.locator(".store-mode-num")).toHaveText("5");
  await expect(metro.locator(".store-mode-badge")).toHaveText("4 LEFT");
  await expect(mode.locator(".store-mode-track div")).not.toHaveCSS("width", "0px");
  await expect(mode.locator(".store-mode-track div")).toHaveCSS("background-color", "rgb(255, 72, 176)");

  // Light theme, with the sticker in its own colour, and remembered next time.
  await expect(mode).toHaveAttribute("data-sm-theme", "dark");
  await mode.getByRole("button", { name: "Light theme" }).click();
  await expect(mode).toHaveAttribute("data-sm-theme", "light");
  expect(await metro.locator(".store-mode-sticker").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 72, 176)");
  await page.screenshot({ path: test.info().outputPath("light-checked.png") });
  await mode.getByRole("button", { name: "← List" }).click(); // something is checked: it asks
  await mode.getByRole("button", { name: "Leave without adding" }).click();
  await expect(page.getByRole("dialog", { name: "Store mode" })).toHaveCount(0);
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  await expect(page.getByRole("dialog", { name: "Store mode" })).toHaveAttribute("data-sm-theme", "light");
  // Leaving without adding kept the check.
  await expect(page.locator(".store-mode-row.on")).toHaveCount(1);
});

test("leaving: with nothing checked ← List just goes back; with items checked it asks, and adding goes through the Inventory confirmation", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  let mode = await openStoreMode(page);
  await mode.getByRole("button", { name: "← List" }).click();
  await expect(page.getByRole("dialog", { name: "Store mode" })).toHaveCount(0);

  mode = await openStoreMode(page);
  await mode.locator(".store-mode-row", { hasText: "Cilantro" }).click();
  await mode.locator(".store-mode-row", { hasText: "Limes" }).click();
  await mode.getByRole("button", { name: "← List" }).click();
  const ask = mode.getByRole("dialog", { name: "Add 2 checked items to your inventory?" });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Fridge, Freezer or Pantry");
  await page.screenshot({ path: test.info().outputPath("dark-leave-sheet.png") });

  // Keep shopping: back to the list, checks kept.
  await ask.getByRole("button", { name: "Keep shopping" }).click();
  await expect(ask).toHaveCount(0);
  await expect(mode.locator(".store-mode-row.on")).toHaveCount(2);

  // Add: the Inventory confirmation opens first; cancelling it adds nothing and keeps the question.
  await mode.getByRole("button", { name: "← List" }).click();
  await ask.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.locator(".riso-confirm")).toBeVisible();
  await cancelAdd(page);
  await expect(ask).toBeVisible();
  expect(await (await page.request.get("/api/pantry-inventory")).json()).toHaveLength(0);

  // Confirm: the items go in, a sheet says so, and they are off the list.
  await ask.getByRole("button", { name: "Add to inventory" }).click();
  await confirmAdd(page);
  const added = mode.getByRole("dialog", { name: "Added to your inventory" });
  await expect(added).toContainText("2 items are now in the Fridge, Freezer or Pantry with a use-by date.");
  await page.screenshot({ path: test.info().outputPath("dark-added-sheet.png") });
  await added.getByRole("button", { name: "Back to the list" }).click();
  await expect(mode.locator(".store-mode-row", { hasText: /Cilantro|Limes/ })).toHaveCount(0);
  await expect(mode.locator(".store-mode-num")).toHaveText("4");
  await expect.poll(async () => (await (await page.request.get("/api/pantry-inventory")).json()).map((i) => i.name.toLowerCase()).sort()).toEqual(["cilantro", "limes"]);
});

test("the sticker colours: change one with a hex or RGB code, see a bad one, reset; they stay on the device", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);
  await mode.getByRole("button", { name: "Colours" }).click();
  const sheet = mode.getByRole("dialog", { name: "Store colours" });
  await expect(sheet.locator(".store-mode-colour-row")).toHaveCount(2);
  await expect(sheet.getByRole("textbox", { name: "Colour of Metro" })).toHaveValue("#FF48B0");
  await expect(sheet.getByRole("textbox", { name: "Colour of Super C" })).toHaveValue("#FFE14D");
  await page.screenshot({ path: test.info().outputPath("dark-colours-sheet.png") });

  const metro = sheet.getByRole("textbox", { name: "Colour of Metro" });
  await metro.fill("37, 99, 235");
  const sticker = mode.locator(".store-mode-store", { hasText: "Metro" }).locator(".store-mode-sticker");
  await expect(sticker).toHaveCSS("box-shadow", "rgb(37, 99, 235) 3px 3px 0px 0px");
  await metro.fill("pink");
  await expect(metro).toHaveCSS("border-top-color", "rgb(196, 18, 63)"); // not a colour: red border, nothing saved
  await expect(sticker).toHaveCSS("box-shadow", "rgb(37, 99, 235) 3px 3px 0px 0px");
  await metro.fill("#0f0");
  await expect(sticker).toHaveCSS("box-shadow", "rgb(0, 255, 0) 3px 3px 0px 0px");
  await sheet.getByRole("button", { name: "Done" }).click();

  // Kept on this device.
  await mode.getByRole("button", { name: "← List" }).click();
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  await expect(page.locator(".store-mode-store", { hasText: "Metro" }).locator(".store-mode-sticker")).toHaveCSS("box-shadow", "rgb(0, 255, 0) 3px 3px 0px 0px");
  expect(await page.evaluate(() => localStorage.getItem("mealprep-store-colors"))).toContain("#00FF00");

  // Reset goes back to the defaults.
  await page.getByRole("button", { name: "Colours" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("textbox", { name: "Colour of Metro" })).toHaveValue("#FF48B0");
  expect(await page.evaluate(() => localStorage.getItem("mealprep-store-colors"))).toBeNull();
});

test("finishing the whole list sets off the confetti and makes the count pulse", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);
  await expect(page.getByTestId("store-confetti")).toHaveCount(0);
  const rows = mode.locator(".store-mode-row");
  for (let i = 0; i < 6; i++) await rows.nth(i).click();
  await expect(mode.locator(".store-mode-num")).toHaveText("0");
  await expect(page.getByTestId("store-confetti")).toBeVisible();
  expect(await page.getByTestId("store-confetti").locator("span").count()).toBe(240 + 150 + 22);
  await expect(mode.locator(".store-mode-num")).toHaveClass(/pulse/);
  // It never gets in the way of a tap.
  await expect(page.getByTestId("store-confetti")).toHaveCSS("pointer-events", "none");
  await page.screenshot({ path: test.info().outputPath("dark-confetti.png") });
  // Un-checking one stops it.
  await rows.first().click();
  await expect(page.getByTestId("store-confetti")).toHaveCount(0);
});

test.describe("in French", () => {
  test.use({ locale: "fr-CA" });

  test("Store mode reads in French", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await page.fill('input[type="email"]', `store-mode-fr+${Date.now()}@example.com`);
    await page.fill('input[type="password"]', "testpass123");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".tab.active")).toHaveText("Accueil");
    await seedList(page);

    await page.getByRole("button", { name: "Épicerie", exact: true }).first().click();
    await expect(page.locator(".riso-row").first()).toBeVisible();
    await page.getByRole("button", { name: /Je suis à l.épicerie/ }).click();
    const mode = page.getByRole("dialog", { name: "Mode magasin" });
    await expect(mode.locator(".store-mode-at")).toHaveText("restants sur la liste");
    await expect(mode.locator(".store-mode-badge").first()).toHaveText("5 RESTANTS");
    await expect(mode.locator(".store-mode-badge").nth(1)).toHaveText("1 RESTANT");
    await expect(mode.getByRole("button", { name: "Tout", exact: true })).toBeVisible();
    await expect(mode.getByRole("button", { name: "Rayon", exact: true })).toBeVisible();
    await expect(mode.getByRole("button", { name: "Masquer cochés" })).toBeVisible();
    await mode.getByRole("button", { name: "Rayon", exact: true }).click();
    await expect(mode.locator(".store-mode-aisle").first()).toHaveText("Fruits et légumes");
    await page.screenshot({ path: test.info().outputPath("fr-dark.png") });

    await mode.locator(".store-mode-row", { hasText: "Cilantro" }).click();
    await mode.getByRole("button", { name: "← Liste" }).click();
    const ask = mode.getByRole("dialog", { name: "Ajouter 1 article coché à votre inventaire ?" });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole("button", { name: "Ajouter à l'inventaire" })).toBeVisible();
    await expect(ask.getByRole("button", { name: "Quitter sans ajouter" })).toBeVisible();
    await expect(ask.getByRole("button", { name: "Continuer les achats" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("fr-leave-sheet.png") });
    await ask.getByRole("button", { name: "Continuer les achats" }).click();
    await mode.getByRole("button", { name: "Couleurs" }).click();
    await expect(mode.getByRole("dialog", { name: "Couleurs des magasins" })).toBeVisible();
  });
});
