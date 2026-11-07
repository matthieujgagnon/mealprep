import { expect, realNow, test } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { accountButton } from "./account-menu.js";
import { addDays, quebecDay } from "./quebec-day.js";

// Examples: every NEW account starts with example recipes, a planned week and a stocked Inventory,
// tagged « Exemple », and one tap removes them (server/src/lib/examples.js). This spec is the only
// one that signs up with examples ON: the rest of the browser tests run on a server with
// NEW_ACCOUNT_EXAMPLES=off (playwright.config.js), so their accounts start empty as they always did.
// This one runs on the second server (the "examples" project there).

function uniqueEmail(prefix) {
  return `${prefix}+${realNow().getTime()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Sign up|Créer un compte|S'inscrire)$/ }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: /^(Create account|Créer le compte|Créer un compte)$/ }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

const json = async (page, path) => (await page.request.get(path)).json();
const counts = async (page) => (await json(page, "/api/examples")).counts;
const sheet = (page) => page.getByRole("alertdialog");
const banner = (page) => page.locator(".examples-banner");
const FULL = { recipes: 8, plannedMeals: 6, inventoryItems: 12, total: 26 };

test.describe("in English, on a computer", () => {
  test("signup starts the account with the examples, planned from the day it was made, all tagged", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-signup"));
    await expect(banner(page)).toContainText("These are examples.");
    expect(await counts(page)).toEqual(FULL);

    // The planned week: tonight's supper and the days after it, counted in Quebec days from today.
    const today = quebecDay(realNow());
    const upcoming = await json(page, `/api/planner/upcoming?from=${today}`);
    expect(upcoming.map((e) => addDays(e.weekStart, e.dayOfWeek)).sort()).toEqual([0, 1, 1, 1, 2, 3].map((n) => addDays(today, n)));
    expect(upcoming.filter((e) => e.isLeftover)).toHaveLength(1);
    // The Inventory: use-by dates counted the same way, one of them close.
    const inventory = await json(page, "/api/pantry-inventory");
    expect(inventory).toHaveLength(12);
    expect(inventory.find((i) => i.name === "Milk").expiresAt).toBe(`${addDays(today, 2)}T00:00:00.000Z`);

    // Tagged on Recipes, the Planner and Inventory.
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.locator(".rpc .example-tag")).toHaveCount(8);
    await page.getByRole("button", { name: "Planner", exact: true }).click();
    await expect(page.locator(".riso-planner-card .example-tag").first()).toBeVisible();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await expect(page.locator(".inv-tile .example-tag")).toHaveCount(12);
    // The Grocery list fills itself from the plan, with some already at home.
    await page.getByRole("button", { name: "Grocery", exact: true }).click();
    await expect(page.getByText("Already at home", { exact: false }).first()).toBeVisible();
  });

  test("Remove examples: the sheet says what goes, Cancel changes nothing, confirming removes them, Undo puts back the same ones", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-remove"));
    const before = (await json(page, "/api/recipes")).map((r) => r.id).sort();

    await banner(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(sheet(page)).toContainText("Remove the examples?");
    await expect(sheet(page)).toContainText("8 recipes");
    await expect(sheet(page)).toContainText("6 planned meals");
    await expect(sheet(page)).toContainText("12 Inventory items");
    await expect(sheet(page)).toContainText("Anything you added or changed stays.");
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await counts(page)).toEqual(FULL);

    await banner(page).getByRole("button", { name: "Remove examples" }).click();
    await sheet(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(page.locator(".riso-toast")).toContainText("Examples removed.");
    await expect(banner(page)).toHaveCount(0);
    expect(await counts(page)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0, total: 0 });
    expect(await json(page, "/api/pantry-inventory")).toHaveLength(0);
    expect((await json(page, "/api/pantry-inventory/removed"))).toEqual([]); // not "used up": nothing in Recently removed

    await page.locator(".riso-toast-undo").click();
    await expect(banner(page)).toBeVisible();
    expect(await counts(page)).toEqual(FULL);
    expect((await json(page, "/api/recipes")).map((r) => r.id).sort()).toEqual(before);
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.getByText("Sheet-pan chicken and vegetables").first()).toBeVisible();
  });

  test("removal takes the examples and nothing else: a sample the person edited stays, and so does what they made", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-keeps"));
    const recipes = await json(page, "/api/recipes");
    const soup = recipes.find((r) => r.title === "Split pea and ham soup");
    const edited = await page.request.put(`/api/recipes/${soup.id}`, { data: { notes: "Less salt next time." } });
    expect(edited.ok()).toBe(true);
    const mine = await (
      await page.request.post("/api/recipes", { data: { title: "My own soup", ingredients: [{ name: "carrots" }], mealSlots: ["lunch"] } })
    ).json();
    const myItem = await (await page.request.post("/api/pantry-inventory", { data: { name: "My own rice", quantity: 1, unit: "kg", location: "pantry" } })).json();

    await page.reload();
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(sheet(page)).toContainText("7 recipes"); // the edited one is theirs now
    await expect(sheet(page)).toContainText("12 Inventory items");
    await sheet(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(banner(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.getByText("Split pea and ham soup")).toBeVisible();
    await expect(page.getByText("My own soup")).toBeVisible();
    await expect(page.getByText("Sheet-pan chicken and vegetables")).toHaveCount(0);
    await expect(page.locator(".rpc .example-tag")).toHaveCount(0); // the edited sample is not tagged any more
    const left = await json(page, "/api/recipes");
    expect(left.map((r) => r.id).sort()).toEqual([soup.id, mine.id, ...left.filter((r) => r.isPlaceholder).map((r) => r.id)].sort());
    expect((await json(page, "/api/pantry-inventory")).map((i) => i.id)).toEqual([myItem.id]);
  });

  test("doing something to an example takes its tag off at once, and it drops out of what Remove examples will take", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-lift"));
    const recipes = await json(page, "/api/recipes");
    const salad = recipes.find((r) => r.title === "Chickpea and cucumber salad");
    const inventory = await json(page, "/api/pantry-inventory");
    const eggs = inventory.find((i) => i.name === "Eggs");
    // The person plans a sample recipe and changes an amount: both are theirs now.
    const planned = await page.request.post("/api/planner", { data: { recipeId: salad.id, weekStart: "2031-01-06", dayOfWeek: 0, mealType: "lunch" } });
    expect(planned.ok()).toBe(true);
    expect((await page.request.put(`/api/pantry-inventory/${eggs.id}`, { data: { quantity: 6 } })).ok()).toBe(true);

    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.locator(".rpc .example-tag")).toHaveCount(7);
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await expect(page.locator(".inv-tile .example-tag")).toHaveCount(11);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await banner(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(sheet(page)).toContainText("7 recipes");
    await expect(sheet(page)).toContainText("11 Inventory items");
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
  });

  test("Add examples on an account with none: the sheet lists what it adds, Cancel adds nothing, confirming adds the set once", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-add"));
    await banner(page).getByRole("button", { name: "Remove examples" }).click();
    await sheet(page).getByRole("button", { name: "Remove examples" }).click();
    await expect(banner(page)).toHaveCount(0);

    await (await accountButton(page, "Add examples")).click();
    await expect(sheet(page)).toContainText("Add examples?");
    await expect(sheet(page)).toContainText("8 recipes");
    await expect(sheet(page)).toContainText("In your Inventory: Milk, Eggs, Cheddar");
    await expect(sheet(page)).toContainText("count as real stock");
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    expect(await counts(page)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0, total: 0 });
    expect(await json(page, "/api/pantry-inventory")).toHaveLength(0);

    await (await accountButton(page, "Add examples")).click();
    await sheet(page).getByRole("button", { name: "Add the examples" }).click();
    await expect(page.locator(".riso-toast")).toContainText("Examples added.");
    await expect(banner(page)).toBeVisible();
    expect(await counts(page)).toEqual(FULL);
    // With examples there, the menu offers Remove, not Add.
    await expect(await accountButton(page, "Remove examples")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add examples", exact: true })).toHaveCount(0);
  });
});

test.describe("in French, on a 390 px phone", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 } });

  const fits = async (page, locator) => {
    const box = await locator.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    return box;
  };
  const pageFits = (page) =>
    page.evaluate(() => ({ tall: document.documentElement.scrollHeight - innerHeight, wide: document.documentElement.scrollWidth - innerWidth }));

  test("the banner is slim and Home still fits the window; the sheets fit the screen", async ({ page }) => {
    await signUp(page, uniqueEmail("ex-fr"));
    await expect(banner(page)).toContainText("Ce sont des exemples.");
    const bar = await fits(page, banner(page));
    expect(bar.height).toBeLessThanOrEqual(72); // slim: at most two short lines
    await fits(page, banner(page).getByRole("button", { name: "Retirer les exemples" }));
    expect(await pageFits(page)).toEqual({ tall: 0, wide: 0 }); // the page never scrolls: Home is exactly the window

    await banner(page).getByRole("button", { name: "Retirer les exemples" }).click();
    await expect(sheet(page)).toContainText("Retirer les exemples?");
    await expect(sheet(page)).toContainText("8 recettes");
    await expect(sheet(page)).toContainText("6 repas planifiés");
    await expect(sheet(page)).toContainText("12 articles de l'inventaire");
    await expect(sheet(page)).toContainText("Ce que vous avez ajouté ou modifié reste.");
    await fits(page, sheet(page));
    await fits(page, sheet(page).getByRole("button", { name: "Annuler" }));
    await fits(page, sheet(page).getByRole("button", { name: "Retirer les exemples" }));
    expect((await pageFits(page)).wide).toBe(0);
    await sheet(page).getByRole("button", { name: "Retirer les exemples" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await pageFits(page)).toEqual({ tall: 0, wide: 0 });

    // The account menu now says Add, and its sheet fits too, with the whole Inventory list.
    await (await accountButton(page, "Ajouter des exemples")).click();
    await expect(sheet(page)).toContainText("Ajouter des exemples?");
    await expect(sheet(page)).toContainText("Dans votre inventaire : Lait, Œufs, Cheddar");
    await fits(page, sheet(page));
    await fits(page, sheet(page).getByRole("button", { name: "Ajouter les exemples" }));
    expect((await pageFits(page)).wide).toBe(0);
    await sheet(page).getByRole("button", { name: "Ajouter les exemples" }).click();
    await expect(banner(page)).toBeVisible();
    // The examples are in French: the recipes' text and the Inventory's names.
    expect((await json(page, "/api/pantry-inventory")).some((i) => i.name === "Œufs")).toBe(true);
    await page.getByRole("button", { name: "Recettes", exact: true }).click();
    await expect(page.getByText("Poulet et légumes sur plaque").first()).toBeVisible();
  });
});
