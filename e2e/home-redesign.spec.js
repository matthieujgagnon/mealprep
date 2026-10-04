import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A real (uploaded-flyer) deal for the signed-in user - sample deals never
// count as "on sale" outside the Flyers page.
async function seedRealDeal(page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  await prisma.flyerDeal.create({
    data: {
      userId, store: "Metro", source: "Metro", category: "meat",
      item: "Boneless chicken breast", matchName: "boneless chicken breast", price: "$4.99/lb",
      unitPrice: 4.99, unitBasis: "lb", regularPrice: 7.99, isCurrent: true, createdAt: new Date(),
    },
  });
  await page.reload();
}

// Covers pieces specific to the Home redesign: the "N of your recipes use
// X" sale-deal link, and the Riso Poster "Makeable now" row (its own plain
// row design, not the shared dark .meal-card — see makeable-vapor.spec.js's
// header comment for the same precedent on the Makeable tab). Home's old
// light/dark toggle was removed when Home moved to the Riso Poster design:
// design_handoff_riso/README.md's fidelity note says light ("paper") is the
// only mode designed so far ("black paper" dark mode is future work), so
// there's currently nothing for a toggle to switch to.

function uniqueEmail() {
  return `home-redesign+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
}

test("Makeable now counts what's ready and lists it with a ready tag", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Test Dish");
  await page.fill('input[aria-label="FRIDGE LIFE"]', "2");
  await page.fill('input[aria-label="Ingredient"]', "test ingredient");
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Combine and serve.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();

  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', "test ingredient");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator(".modal-close").click();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const card = page.locator(".riso-home-makeable");
  await expect(card.locator(".riso-home-makeable-num")).toHaveText("1");
  const row = card.locator(".riso-nearly-row", { hasText: "Home Redesign Test Dish" });
  await expect(row).toBeVisible();
  await expect(row.locator(".riso-nearly-tag")).toHaveText("ready");
  await expect(row.getByRole("button", { name: /\+ List|Add .* to the grocery list/ })).toHaveCount(0);
});

test("selecting a protein on sale shows its recipe count, and the bar opens Recipes filtered to it", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await seedRealDeal(page);

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Home Redesign Chicken Dish");
  await page.fill('input[aria-label="FRIDGE LIFE"]', "2");
  await page.fill('input[aria-label="Ingredient"]', "chicken breast");
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Grill until done.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.waitForTimeout(400);

  // The seeded deal is "Boneless chicken breast": tapping its row selects
  // Chicken, and a bar at the bottom says how many recipes use it.
  await page.getByRole("button", { name: /^Chicken:/ }).click();
  const bar = page.locator(".riso-protein-bar");
  await expect(bar).toContainText("1 of your recipes uses chicken.");
  await expect(bar).toContainText("See them →");

  await bar.click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.getByText("Home Redesign Chicken Dish")).toBeVisible();
});

test("Home shows the proteins on sale this week, each kind's best buy, and opens its card", async ({ page }) => {
  // Rows: emoji, product, store · saving, price per lb; the cheapest is the
  // "Best deal", the rest say how good a buy they are. One line under them
  // names the kinds not worth buying and the ones not on any flyer.
  await signUp(page, uniqueEmail());
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  const row = (item, matchName, unitPrice, extra = {}) => ({
    userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
    unitPrice, unitBasis: "lb", isCurrent: true, createdAt: new Date(), ...extra,
  });
  await prisma.flyerDeal.createMany({
    data: [
      row("POITRINES DE POULET FRAIS DÉSOSSÉES", "fresh boneless chicken breasts", 4.87, { store: "Super C", regularPrice: 8.49 }),
      row("FRESH CHICKEN LEGS", "fresh chicken legs", 1.97, { regularPrice: 2.49 }),
      // A pie and a points offer aren't chicken on sale.
      row("PÂTÉ AU POULET IRRÉSISTIBLE, 1,2 kg", "chicken pie", 1.13, { regularPrice: 4.99 }),
      { ...row("Poulet entier", "whole chicken", 1), unitPrice: null, unitBasis: null, price: "Points offer" },
      row("BŒUF HACHÉ MAIGRE", "lean ground beef", 5.97),
      row("filet de saumon Atlantique frais | fresh Atlantic salmon fillet", "fresh atlantic salmon fillet", 9.99, { regularPrice: 13.99 }),
    ],
  });
  await page.reload();

  const block = page.locator(".riso-home-proteins");
  await expect(block.getByRole("heading", { name: "Proteins on sale" })).toBeVisible();
  const chicken = block.locator(".riso-protein-row", { hasText: "Chicken" });
  await expect(chicken).toContainText("Chicken breasts");
  await expect(chicken).toContainText("Super C");
  await expect(chicken).toContainText("$4.87/lb");
  await expect(chicken.locator(".riso-protein-best")).toHaveText("Best deal");
  await expect(chicken).toContainText("+1 more");
  await expect(block).not.toContainText("pie");
  const fish = block.getByRole("button", { name: /^Fish:/ });
  await expect(fish).toContainText("$9.99/lb");
  await expect(fish.locator(".riso-protein-verdict")).toBeVisible();
  const asides = block.locator(".riso-protein-asides");
  await expect(asides).toContainText(/ground beef \$5\.97\/lb · not worth it/i);
  await expect(asides).toContainText(/Pork, Seafood, Turkey, Lamb & veal, Tofu none/i);

  // Tapping a row selects it; "See the deal" on the selected row opens its card.
  await chicken.click();
  await expect(chicken).toHaveAttribute("aria-pressed", "true");
  await block.getByRole("button", { name: "See the deal →" }).click();
  const modal = page.locator(".riso-deal-detail, [role=dialog]").first();
  await expect(modal).toContainText(/poitrines de poulet/i);
  await expect(modal.locator(".riso-deal-detail-other", { hasText: "Metro" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Use it up finds recipes for those items; Makeable now puts what's missing on the list", async ({ page }) => {
  await signUp(page, uniqueEmail());
  const soon = new Date(Date.now() + 2 * 86400000 + 3600000).toISOString();
  for (const name of ["parsley", "cucumber", "chickpeas"]) {
    await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge", expiresAt: soon } });
  }
  for (const r of [
    { title: "Tzatziki chickpea salad", ingredients: [{ name: "chickpeas" }, { name: "cucumber" }, { name: "dill" }] },
    { title: "Parsley pesto", ingredients: [{ name: "parsley" }, { name: "pine nuts" }] },
    { title: "Toast", ingredients: [{ name: "bread" }] },
  ]) {
    await page.request.post("/api/recipes", { data: r });
  }
  await page.reload();

  const useUp = page.locator(".riso-home-useup");
  await expect(useUp.locator(".riso-useup-row")).toHaveCount(3);
  await expect(useUp).toContainText("1 recipe uses two or more of these.");
  await useUp.getByRole("button", { name: "Cook with these →" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
  await expect(page.locator(".riso-recipe-card-name")).toHaveCount(2);
  await expect(page.locator(".riso-recipe-card", { hasText: "Parsley pesto" })).toBeVisible();
  await expect(page.locator(".riso-recipe-card", { hasText: "Toast" })).toHaveCount(0);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  const makeable = page.locator(".riso-home-makeable");
  await expect(makeable.locator(".riso-home-makeable-num")).toHaveText("0");
  await expect(makeable).toContainText("2 are one or two items away");
  const tz = makeable.locator(".riso-nearly-row", { hasText: "Tzatziki chickpea salad" });
  await expect(tz).toContainText("missing 1");
  await expect(tz).toContainText("Dill");
  await tz.getByRole("button", { name: "Add Dill to the grocery list" }).click();
  await expect(tz.locator(".riso-nearly-listed")).toHaveText("✓ Listed");
  await makeable.getByRole("button", { name: "Add all 1 missing to list" }).click();
  await expect(makeable).toContainText("Everything they're missing is on your list ✓");

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Check off Dill", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Check off Pine nuts?$/ })).toBeVisible();
});
