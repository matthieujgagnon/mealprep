import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";
import { saveAnswered } from "./saves.js";
import { cancelAdd } from "./inventory-confirm.js";

const prisma = new PrismaClient();

// The Grocery list in Matt's design (docs/design/riso-v2-grocery/README.md):
// the checkbox's three steps (to buy, bought ✓, queued +), saved with the list
// one tap after another; each store's "+ Add N to inventory" footer and Done
// shopping, both through the Inventory confirmation; Store mode's one tap;
// the sale price that opens the deal card; the desktop grid, the phone cart
// bar and the live How it works strip.

function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// Signs up in the browser's language (French with a fr-CA locale).
async function signUp(page, fr = false) {
  await page.goto("/");
  await page.getByRole("button", { name: fr ? "S'inscrire" : "Sign up" }).click();
  await page.fill('input[type="email"]', `three-steps+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: fr ? "Créer un compte" : "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText(fr ? "Accueil" : "Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

// The design's sample list: Super C (a store you made), Metro and IGA, two items
// on sale at Metro and one at IGA, and two items you typed in.
async function seed(page, userId) {
  const recipes = [
    ["Pasta e fagioli", [["diced tomatoes", 2, "can"]]],
    ["Sheet-pan chicken shawarma", [["chicken thighs", 900, "g"]]],
    ["Buttermilk pancakes", [["milk 2%", 750, "ml"]]],
    ["Lentil salad with feta", [["old cheddar, thinly sliced", 350, "g"]]],
    ["Salmon rice bowls", [["salmon fillets", 450, "g"], ["cilantro", 1, "bunch"]]],
  ];
  for (const [i, [title, ingredients]] of recipes.entries()) {
    const r = await (
      await page.request.post("/api/recipes", {
        data: { title, baseServings: 2, ingredients: ingredients.map(([name, quantity, unit]) => ({ name, quantity, unit })) },
      })
    ).json();
    await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: nextMonday(), dayOfWeek: i, mealType: "dinner" } });
  }
  const deal = (store, item, matchName, price, unitPrice, unitBasis, category) => ({
    userId, store, source: store, category, item, matchName, price, unitPrice, unitBasis, regularPrice: unitPrice * 1.4, isCurrent: true,
  });
  await prisma.flyerDeal.createMany({
    data: [
      deal("Metro", "Tomates en dés Unico | Unico diced tomatoes", "diced tomatoes", "$2.49", 2.49, "each", "pantry"),
      deal("Metro", "Hauts de cuisse de poulet | Chicken thighs", "chicken thighs", "$2.99/lb", 2.99, "lb", "meat"),
      deal("IGA", "Filets de saumon | Salmon fillets", "salmon fillets", "$9.99/lb", 9.99, "lb", "seafood"),
    ],
  });
  await page.request.post("/api/grocery-extra-items", { data: { name: "lemons", quantity: 2 } });
  await page.request.post("/api/grocery-extra-items", { data: { name: "aluminum foil", quantity: 1 } });
  const superC = await (await page.request.post("/api/grocery-sections", { data: { name: "Super C" } })).json();
  for (const core of ["old cheddar", "cilantro", "aluminum foil"]) {
    await page.request.post(`/api/grocery-sections/${superC.id}/assign`, { data: { core } });
  }
}

async function openGrocery(page) {
  await page.reload();
  await page.getByRole("button", { name: /^(Grocery|Épicerie)$/ }).first().click();
  await expect(page.locator(".riso-group .riso-row").first()).toBeVisible();
}

// The row's box (the only thing that checks it) and the row, by the item's name
// (in the list, not How it works' demo row).
const label = (name) => new RegExp(`^(Check off|Cocher) (?:${name})$`, "i");
const box = (page, name) => page.locator(".riso-group").getByRole("checkbox", { name: label(name) }).first();
const row = (page, name) => page.locator(".riso-group .riso-row").filter({ has: page.getByRole("checkbox", { name: label(name) }) });
const step = (page, name) => row(page, name).first().getAttribute("data-step");
const group = (page, store) => page.locator(".riso-group").filter({ has: page.locator(".riso-group-name", { hasText: new RegExp(`^${store}$`) }) });
const inventory = async (page) => await (await page.request.get("/api/pantry-inventory")).json();
const savedChecks = async (page) => Object.fromEntries((await (await page.request.get("/api/grocery-checked")).json()).map((r) => [r.core, r]));

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("each tap moves the box to the next step, and it stays that way after a reload", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);

    const lemons = box(page, "lemons");
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "0");
    await expect(lemons).toHaveAttribute("title", "Mark as bought");

    // (Each tap shows at once and is saved behind: the saves are waited for before a reload.)
    const lemonsQueued = saveAnswered(page, "POST", "/api/grocery-checked", '"queued":true');
    await lemons.click();
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "1");
    await expect(row(page, "lemons")).toHaveClass(/checked/);
    await expect(row(page, "lemons").locator(".riso-row-check")).toHaveText("✓");
    await expect(lemons).toHaveAttribute("title", "Queue for inventory");

    await lemons.click();
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "2");
    await expect(row(page, "lemons")).toHaveClass(/queued/);
    await expect(row(page, "lemons").locator(".riso-row-check")).toHaveText("+");
    await expect(row(page, "lemons").locator(".riso-row-queued")).toHaveText("→ INVENTORY");
    await expect(lemons).toHaveAttribute("title", "Put back on the list");
    // Queued is still in the cart.
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("1");

    await lemonsQueued;
    await openGrocery(page);
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "2");

    const lemonsBackOnList = saveAnswered(page, "DELETE", "/api/grocery-checked/");
    await box(page, "lemons").click();
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "0");
    await lemonsBackOnList;
    await openGrocery(page);
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "0");
    expect(await savedChecks(page)).toEqual({});
  });

  test("quick taps on a slow connection: the last tap is what's saved", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    // The first save of each round is the slowest, so sent together the saves
    // would land out of order (a later tap's save before an earlier one's).
    let posts = 0;
    let answered = 0;
    await page.route("**/api/grocery-checked**", async (route) => {
      if (route.request().method() === "POST" && posts++ === 0) await new Promise((r) => setTimeout(r, 1500));
      await route.fallback();
    });
    page.on("response", (res) => {
      if (res.url().includes("/api/grocery-checked") && res.request().method() !== "GET") answered++;
    });
    await box(page, "lemons").click();
    await box(page, "lemons").click();
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "2");
    // Once both saves have answered, the server keeps the last tap: queued.
    await expect.poll(() => answered, { timeout: 8000 }).toBe(2);
    const lemonsKey = "extra-" + (await extraId(page, "lemons"));
    expect((await savedChecks(page))[lemonsKey]?.queued).toBe(true);
    await openGrocery(page);
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "2");

    // Three quick taps come all the way back to the list (the last save is a quick DELETE).
    posts = 0;
    answered = 0;
    for (let i = 0; i < 3; i++) await box(page, "Milk 2%").click();
    await expect(row(page, "Milk 2%")).toHaveAttribute("data-step", "0");
    await expect.poll(() => answered, { timeout: 8000 }).toBe(3);
    expect((await savedChecks(page))["milk 2%"]).toBeUndefined();
    await openGrocery(page);
    await expect(row(page, "Milk 2%")).toHaveAttribute("data-step", "0");
  });

  test("a store's + Add N to inventory adds exactly its queued items through the sheet, then they leave the list", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);

    const superC = group(page, "Super C");
    await expect(superC.locator(".riso-group-foot")).toHaveCount(0); // nothing queued yet
    await box(page, "Old cheddar").click(); // bought
    await box(page, "Old cheddar").click(); // queued
    await box(page, "Cilantro").click(); // bought only
    await box(page, "Milk 2%").click();
    await box(page, "Milk 2%").click(); // queued, but in Metro

    const foot = superC.locator(".riso-group-foot");
    await expect(foot).toContainText("1 queued · Old cheddar");
    await foot.getByRole("button", { name: "+ Add 1 to inventory" }).click();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.locator(".riso-confirm-row")).toHaveCount(1);
    await expect(sheet.getByLabel("Name of Old cheddar")).toHaveValue("Old cheddar");

    // Cancel: nothing added, the list as it was.
    await cancelAdd(page);
    expect(await inventory(page)).toHaveLength(0);
    await expect(row(page, "Old cheddar")).toHaveAttribute("data-step", "2");

    const cheddarBought = saveAnswered(page, "POST", "/api/grocery-checked/in-inventory");
    await foot.getByRole("button", { name: "+ Add 1 to inventory" }).click();
    await sheet.getByRole("button", { name: "Add 1 to inventory" }).click();
    await sheet.waitFor({ state: "detached" });
    await expect.poll(async () => (await inventory(page)).map((i) => i.name)).toEqual(["Old cheddar"]);
    await expect(row(page, "Old cheddar")).toHaveCount(0);
    // The bought one stays in the cart, the other store's queued one too.
    await expect(row(page, "Cilantro")).toHaveAttribute("data-step", "1");
    await expect(row(page, "Milk 2%")).toHaveAttribute("data-step", "2");
    await expect(superC.locator(".riso-group-foot")).toHaveCount(0);
    await cheddarBought;
    await openGrocery(page);
    await expect(row(page, "Old cheddar")).toHaveCount(0);
  });

  test("Done shopping opens the sheet with + ticked and ✓ unticked, then clears the whole cart", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await box(page, "Milk 2%").click();
    await box(page, "Milk 2%").click(); // queued
    await box(page, "Cilantro").click(); // bought
    await box(page, "lemons").click(); // bought, typed in

    await page.getByRole("button", { name: "Done shopping · add 1 to inventory" }).click();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.locator(".riso-confirm-row")).toHaveCount(3);
    await expect(sheet.getByLabel("Include Milk 2%")).toBeChecked();
    await expect(sheet.getByLabel("Include Cilantro")).not.toBeChecked();
    await expect(sheet.getByLabel("Include lemons")).not.toBeChecked();
    await cancelAdd(page);
    await expect(row(page, "Cilantro")).toHaveAttribute("data-step", "1"); // as it was

    await page.getByRole("button", { name: "Done shopping · add 1 to inventory" }).click();
    await sheet.getByLabel("Include Cilantro").check(); // tick a bought one too
    // The cart is cleared at once and the save follows (it takes the typed-in lemons off too): wait for
    // it before the page is reloaded.
    const cartBought = saveAnswered(page, "POST", "/api/grocery-checked/in-inventory");
    await sheet.getByRole("button", { name: "Add 2 to inventory" }).click();
    await sheet.waitFor({ state: "detached" });
    await expect.poll(async () => (await inventory(page)).map((i) => i.name).sort()).toEqual(["Cilantro", "Milk 2%"]);
    // Everything in the cart left the list, the untracked lemons too.
    for (const name of ["Milk 2%", "Cilantro", "lemons"]) await expect(row(page, name)).toHaveCount(0);
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("0");
    await cartBought;
    await openGrocery(page);
    for (const name of ["Milk 2%", "Cilantro", "lemons"]) await expect(row(page, name)).toHaveCount(0);
  });

  test("a cart of only bought items: Done, add nothing clears it and adds nothing", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await box(page, "Cilantro").click();
    await page.getByRole("button", { name: "Done shopping", exact: true }).click();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.getByLabel("Include Cilantro")).not.toBeChecked();
    const cilantroBought = saveAnswered(page, "POST", "/api/grocery-checked/in-inventory");
    await sheet.getByRole("button", { name: "Done, add nothing" }).click();
    await sheet.waitFor({ state: "detached" });
    await expect(row(page, "Cilantro")).toHaveCount(0);
    expect(await inventory(page)).toHaveLength(0);
    await cilantroBought;
    await openGrocery(page);
    await expect(row(page, "Cilantro")).toHaveCount(0);
  });

  test("the sale price opens that deal's card, See in Flyers → goes to it, and the price hides once checked", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    const price = row(page, "Chicken thigh").locator(".riso-row-deal");
    await expect(price).toHaveText("$2.99/lb›");
    await price.click();
    const card = page.locator(".riso-deal-detail");
    await expect(card).toContainText(/chicken thighs/i);
    await card.getByRole("button", { name: "See in Flyers →" }).click();
    await expect(page.locator(".tab.active")).toHaveText("Flyers");
    await expect(page.locator(".riso-deal-detail")).toContainText(/chicken thighs/i);

    await openGrocery(page);
    await box(page, "Chicken thigh").click();
    await expect(row(page, "Chicken thigh").locator(".riso-row-deal")).toHaveCount(0);
    // By aisle, the store follows the price.
    await page.getByRole("button", { name: "By aisle", exact: true }).click();
    await expect(row(page, "Salmon fillet").locator(".riso-row-deal")).toHaveText("$9.99/lbIGA›");
  });

  test("names start with a capital, typed-in items say Added by you, and the heading and rows share one grid", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await expect(row(page, "lemons").locator(".riso-row-name")).toHaveText("Lemons");
    await expect(row(page, "lemons").locator(".riso-row-mine")).toHaveText("Added by you");
    await expect(row(page, "Chicken thigh").locator(".riso-row-mine")).toHaveCount(0);
    await expect(page.locator(".riso-row-toinv")).toHaveCount(0); // no per-row + Inventory any more

    const metro = group(page, "Metro");
    await expect(metro.locator(".riso-group-col")).toHaveText(["ON SALE", "RECIPE", "BUY"]);
    await expect(metro.locator(".riso-group-count")).toHaveText("4 TO BUY · 2 ON SALE");
    const lines = await metro.evaluate((g) => {
      const x = (el) => Math.round(el.getBoundingClientRect().left);
      const r = (el) => Math.round(el.getBoundingClientRect().right);
      const cols = [...g.querySelectorAll(".riso-group-col")];
      const rows = [...g.querySelectorAll(".riso-row")].map((row) => ({
        sale: x(row.querySelector(".riso-row-slot")),
        recipe: x(row.querySelector(".riso-row-needcol")),
        buy: r(row.querySelector(".riso-row-qty")),
        height: Math.round(row.getBoundingClientRect().height),
      }));
      return { sale: x(cols[0]), recipe: x(cols[1]), buy: r(cols[2]), rows };
    });
    for (const r of lines.rows) {
      expect(r.sale).toBe(lines.sale);
      expect(r.recipe).toBe(lines.recipe);
      expect(Math.abs(r.buy - lines.buy)).toBeLessThanOrEqual(1);
      expect(r.height).toBeGreaterThanOrEqual(68);
    }
    // A store you made has its × in the heading; a flyer store doesn't.
    await expect(group(page, "Super C").locator(".riso-group-remove")).toHaveCount(1);
    await expect(metro.locator(".riso-group-remove")).toHaveCount(0);
  });

  test("How it works: the demo row steps by itself until it's tapped, then each tap moves it on; Got it closes it for good", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    const hint = page.locator(".riso-hint-strip.has-title");
    await expect(hint.locator(".riso-hint-title")).toHaveText("Each checkbox has three steps.");
    const demo = hint.locator(".riso-row");
    await expect(demo).toHaveAttribute("data-step", "1", { timeout: 4000 });
    await expect(hint.locator(".riso-ghint-step.on")).toContainText("Click once");
    await expect(demo).toHaveAttribute("data-step", "2", { timeout: 4000 });
    await expect(demo.locator(".riso-row-queued")).toHaveText("→ INVENTORY");
    await expect(hint.locator(".riso-ghint-step.on")).toContainText("Click twice");

    await demo.getByRole("checkbox").click();
    await expect(demo).toHaveAttribute("data-step", "0");
    await expect(hint.locator(".riso-ghint-caption")).toHaveText("KEEP CLICKING");
    await page.waitForTimeout(2200); // the timer stopped
    await expect(demo).toHaveAttribute("data-step", "0");
    await demo.getByRole("checkbox").click();
    await expect(demo).toHaveAttribute("data-step", "1");
    expect(await savedChecks(page)).toEqual({}); // the demo saves nothing

    // Only By store shows it.
    await page.getByRole("button", { name: "By aisle", exact: true }).click();
    await expect(hint).toHaveCount(0);
    await page.getByRole("button", { name: "By store", exact: true }).click();
    await hint.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toHaveCount(0);
    await openGrocery(page);
    await expect(page.locator(".riso-hint-strip")).toHaveCount(0);
  });

  test("screenshot: By store in English, a queued item and its store's footer", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    // (The taps show at once and are saved behind: wait for the saves before the page is reloaded.)
    const cheddarQueued = saveAnswered(page, "POST", "/api/grocery-checked", '"queued":true');
    const cilantroBought = saveAnswered(page, "POST", "/api/grocery-checked", '"core":"cilantro"');
    await box(page, "Old cheddar").click();
    await box(page, "Old cheddar").click();
    await box(page, "Cilantro").click();
    await Promise.all([cheddarQueued, cilantroBought]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGrocery(page);
    await expect(group(page, "Super C").locator(".riso-group-foot")).toBeVisible();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath("desktop-en-by-store.png"), fullPage: true });
    await page.getByRole("button", { name: "By aisle", exact: true }).click();
    await expect(page.locator(".riso-group-foot")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("desktop-en-by-aisle.png"), fullPage: true });
    await page.getByRole("button", { name: "By recipe", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("desktop-en-by-recipe.png"), fullPage: true });
  });
});

test.describe("on a phone, in French", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the cart is a small bar at the top, the footer stacks, nothing runs off the screen", async ({ page }) => {
    const userId = await signUp(page, true);
    await seed(page, userId);
    await openGrocery(page);
    await box(page, "Vieux cheddar|Old cheddar").first().tap();
    await box(page, "Vieux cheddar|Old cheddar").first().tap();
    await box(page, "Coriandre|Cilantro").first().tap();

    const bar = page.locator(".riso-grocery-cartbar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".riso-grocery-cartbar-num")).toHaveText("2");
    await expect(bar.getByRole("button", { name: "Terminé" })).toBeEnabled();
    await expect(page.locator(".riso-grocery-cart")).toHaveCount(0); // the desktop card isn't drawn
    // Under How it works, above the add field.
    const top = async (sel) => (await page.locator(sel).first().boundingBox()).y;
    expect(await top(".riso-hint-strip")).toBeLessThan(await top(".riso-grocery-cartbar"));
    expect(await top(".riso-grocery-cartbar")).toBeLessThan(await top(".riso-grocery-add"));

    const foot = page.locator(".riso-group-foot");
    await expect(foot.getByRole("button", { name: "+ Ajouter 1 à l'inventaire" })).toBeVisible();
    const [line, button] = await Promise.all([foot.locator(".riso-group-foot-text").boundingBox(), foot.locator(".riso-group-foot-btn").boundingBox()]);
    expect(button.y).toBeGreaterThan(line.y + line.height - 1); // stacked
    expect(button.height).toBeGreaterThanOrEqual(44);

    // No sideways scroll, and no French label runs out of its button.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll(".riso-grocery button, .riso-grocery .riso-group-foot-btn")]
        .filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 1)
        .map((b) => b.textContent)
    );
    expect(overflowing).toEqual([]);

    // Got it: the bar moves up to just above the add field.
    await page.locator(".riso-hint-strip").getByRole("button", { name: "Compris" }).tap();
    expect(await top(".riso-grocery-cartbar")).toBeLessThan(await top(".riso-grocery-add"));

    // Terminé opens the same sheet, the queued one ticked; its French buttons fit.
    await bar.getByRole("button", { name: "Terminé" }).tap();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);
    await expect(sheet.getByLabel("Inclure Cilantro")).not.toBeChecked();
    await sheet.getByLabel("Inclure Old cheddar").uncheck(); // the queued one: now nothing is ticked
    const go = sheet.getByRole("button", { name: "Terminé, rien à ajouter" });
    await expect(go).toBeVisible();
    expect(await go.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
    await sheet.getByRole("button", { name: "Annuler" }).tap();
    await sheet.waitFor({ state: "detached" });
    await expect(row(page, "Old cheddar")).toHaveAttribute("data-step", "2"); // cancel left the list as it was
  });

  test("screenshot: By store in French, a queued item and its store's footer", async ({ page }) => {
    const userId = await signUp(page, true);
    await seed(page, userId);
    await openGrocery(page);
    // (The taps show at once and are saved behind: wait for the saves before the page is reloaded.)
    const cheddarQueued = saveAnswered(page, "POST", "/api/grocery-checked", '"queued":true');
    const cilantroBought = saveAnswered(page, "POST", "/api/grocery-checked", '"core":"cilantro"');
    await box(page, "Vieux cheddar|Old cheddar").first().tap();
    await box(page, "Vieux cheddar|Old cheddar").first().tap();
    await box(page, "Coriandre|Cilantro").first().tap();
    await Promise.all([cheddarQueued, cilantroBought]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGrocery(page);
    await expect(page.locator(".riso-group-foot")).toBeVisible();
    // A window as tall as the page, so the sticky "Je suis à l'épicerie" sits at the end of the list.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 390, height });
    await page.screenshot({ path: test.info().outputPath("phone-fr-by-store.png"), fullPage: true });
  });
});

test.describe("Store mode", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("one tap is in or out of the cart; a queued item shows +; what to queue is chosen at the till", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await box(page, "Milk 2%").tap();
    await box(page, "Milk 2%").tap(); // queued on the list

    // « Je suis à l'épicerie » is in the cart bar at the top of the list (a small copy of the bar docks at
    // the bottom once the bar has scrolled away; see grocery-check-feedback.spec.js).
    await page.locator(".riso-grocery-cartbar").getByRole("button", { name: /I'm at the store/ }).tap();
    const mode = page.getByRole("dialog", { name: "Store mode" });
    const storeRow = (name) => mode.locator(".store-mode-row").filter({ hasText: name });
    await expect(storeRow("Milk 2%")).toHaveAttribute("data-step", "2");
    await expect(storeRow("Milk 2%").locator(".store-mode-check")).toHaveText("+");
    await page.screenshot({ path: test.info().outputPath("phone-en-store-mode.png") });

    await storeRow("Cilantro").tap();
    await expect(storeRow("Cilantro")).toHaveAttribute("data-step", "1");
    await storeRow("Cilantro").tap(); // a second tap takes it out again
    await expect(storeRow("Cilantro")).toHaveAttribute("data-step", "0");
    await storeRow("Cilantro").tap();
    await storeRow("Milk 2%").tap(); // out of the cart
    await expect(storeRow("Milk 2%")).toHaveAttribute("data-step", "0");
    await storeRow("Milk 2%").tap(); // back in, bought
    await expect(storeRow("Milk 2%")).toHaveAttribute("data-step", "1");

    // The Colours pill is small to see, with a 44 px tap area.
    const colours = mode.getByRole("button", { name: "Colours" });
    const pill = await colours.boundingBox();
    expect(pill.height).toBeLessThan(36);
    const tapArea = await colours.evaluate((b) => {
      const after = getComputedStyle(b, "::after");
      const r = b.getBoundingClientRect();
      return r.height - parseFloat(getComputedStyle(b).borderTopWidth) * 2 - parseFloat(after.top) - parseFloat(after.bottom);
    });
    expect(Math.round(tapArea)).toBeGreaterThanOrEqual(44);

    await mode.getByRole("button", { name: "← List" }).tap();
    await expect(mode.locator(".store-mode-sheet-title")).toHaveText("2 items in your cart");
    await mode.getByRole("button", { name: "Add to inventory" }).tap();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);
    await expect(sheet.getByLabel("Include Cilantro")).not.toBeChecked();
    await sheet.getByLabel("Include Cilantro").check();
    await sheet.getByRole("button", { name: "Add 1 to inventory" }).tap();
    await sheet.waitFor({ state: "detached" });
    await expect(mode.locator(".store-mode-sheet-title")).toHaveText("Added to your inventory");
    await expect.poll(async () => (await inventory(page)).map((i) => i.name)).toEqual(["Cilantro"]);
    await expect(storeRow("Cilantro")).toHaveCount(0);
    await expect(storeRow("Milk 2%")).toHaveCount(0); // bought, not tracked: off the list too
  });
});

// The hand-added item's id, for its saved check ("extra-<id>").
async function extraId(page, name) {
  const extras = await (await page.request.get("/api/grocery-extra-items")).json();
  return extras.find((x) => x.name === name)?.id;
}
