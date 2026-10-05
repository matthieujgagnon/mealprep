import { expect, test } from "@playwright/test";
import { addInventoryItem, itemForm } from "./inventory-form.js";
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
  await addInventoryItem(page, "test ingredient");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  // Makeable now is just the count and a link to Makeable (the one-tap add
  // lives on the Makeable screen).
  const card = page.locator(".riso-home-makeable");
  await expect(card.locator(".riso-home-makeable-num")).toHaveText("1");
  await expect(card).toContainText("ready to cook now");
  await expect(card.locator(".riso-nearly-row")).toHaveCount(0);
  await card.getByRole("button", { name: "All →" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Makeable");
});

test("an open protein links to your recipes that use it, and that opens Recipes filtered to it", async ({ page }) => {
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

  // The seeded deal is "Boneless chicken breast": opening Chicken ends with
  // a link saying how many recipes use it.
  await page.getByRole("button", { name: /^Chicken:/ }).click();
  const link = page.locator(".riso-protein-recipes-link");
  await expect(link).toHaveText("See your recipe with chicken →");

  await link.click();
  await expect(page.locator(".tab.active")).toHaveText("Recipes");
  await expect(page.getByText("Home Redesign Chicken Dish")).toBeVisible();
  await expect(page.getByRole("button", { name: /^PROTEIN/ })).toContainText("Chicken");
  await expect(page.locator(".riso-recipes-searchbar input")).toHaveValue("");
});

test("Home shows the proteins on sale this week, each kind's best buy, and opens its card", async ({ page }) => {
  // Rows: emoji, product, store · saving, price per lb; the cheapest is the
  // "Best deal", the rest say how good a buy they are. Every kind always has
  // a row: one with nothing this week says so.
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
  const chicken = block.getByRole("button", { name: /^Chicken:/ });
  await expect(chicken).toContainText("2 products");
  await expect(chicken).toContainText("$4.87/lb");
  await expect(chicken.locator(".riso-protein-best")).toHaveText("Best deal");
  await expect(block).not.toContainText("pie");
  const fish = block.getByRole("button", { name: /^Fish:/ });
  await expect(fish).toContainText("$9.99/lb");
  await expect(fish.locator(".riso-protein-verdict")).toBeVisible();
  // Nothing to compare ground beef with: still shown, with its price, but
  // there is no real sale to open.
  const beef = block.locator(".riso-protein-card.none", { hasText: "Beef" });
  await expect(beef).toContainText("$5.97/lb");
  await expect(beef.locator(".riso-protein-verdict")).toHaveText("Can't tell yet");
  await expect(block.getByRole("button", { name: /^Beef:/ })).toHaveCount(0);
  // Every other kind has its card, saying there is no deal.
  for (const [kind, emoji] of [["Pork", "🐖"], ["Seafood", "🦐"], ["Turkey", "🦃"], ["Lamb", "🐑"], ["Tofu", "⬜"]]) {
    const none = block.locator(".riso-protein-card.none", { hasText: kind });
    await expect(none).toContainText("No deal this week");
    await expect(none).toContainText(emoji);
  }
  await expect(block.locator(".riso-protein-card")).toHaveCount(8);

  // Opening a protein lists its real sales only, blurs the rest of the page,
  // and a product opens its details.
  await chicken.click();
  await expect(chicken).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".riso-protein-scrim")).toHaveCount(1);
  await expect(fish).toHaveClass(/dimmed/);
  const products = block.locator(".riso-protein-product");
  await expect(products).toHaveCount(2);
  await expect(products.first()).toContainText("Chicken breasts");
  await expect(products.first()).toContainText("Super C");
  await expect(products.first().locator(".riso-protein-off")).toHaveText("43% off");
  await expect(products.nth(1)).toContainText("Chicken legs");
  await products.first().locator(".riso-protein-product-head").click();
  const detail = products.first().locator(".riso-protein-detail");
  await expect(detail).toContainText("Reg. price");
  await expect(detail).toContainText("$8.49/lb");
  await expect(detail.getByRole("link", { name: "Open the flyer" })).toHaveAttribute("href", /superc\.ca/);

  // Add to list puts the product on the grocery list, and the card says so.
  await detail.getByRole("button", { name: "+ Add to list" }).click();
  await expect(detail.getByRole("button", { name: "✓ On list" })).toBeDisabled();

  // Esc, or tapping outside, closes it.
  await page.keyboard.press("Escape");
  await expect(page.locator(".riso-protein-scrim")).toHaveCount(0);
  await expect(block.locator(".riso-protein-panel")).toHaveCount(0);
  await chicken.click();
  await page.locator(".riso-protein-scrim").click({ position: { x: 5, y: 5 } });
  await expect(block.locator(".riso-protein-panel")).toHaveCount(0);

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("Chicken breasts", { exact: true }).first()).toBeVisible();
});

test("Use it up finds recipes for those items; Makeable now counts the ones one or two items away", async ({ page }) => {
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
  await makeable.getByRole("button", { name: "All →" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Makeable");
});
