import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Regression coverage for the Flyers screen's Riso Poster "11a Weekly
// briefing" redesign (design_handoff_riso/README.md). Real (non-mock) deals
// only ever come from the upload/Le Rabais routes, both of which depend on
// services unreachable from this sandbox (Gemini, lerabais.com) - so, like
// password-reset.spec.js's reset-token seeding, deals with real price
// history are seeded directly via Prisma, standing in for "a few weeks of
// real uploads" rather than exercising the upload route itself.

const prisma = new PrismaClient();

function uniqueEmail() {
  return `flyers-riso+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function addRecipe(page, title, ingredientName) {
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', title);
  await page.fill('input[aria-label="FRIDGE LIFE"]', "4");
  await page.fill('input[aria-label="Ingredient"]', ingredientName);
  await page.fill('input[aria-label="Quantity"]', "1");
  await page.fill('textarea[placeholder="Describe this step"]', "Cook it.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes." })).toBeVisible();
}

async function openFlyers(page) {
  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await expect(page.locator(".riso-flyer-controls")).toBeVisible();
}

// One ingredient's card, and the same card opened to every store's product.
const card = (page, name) => page.locator(".riso-ing-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
async function openCard(page, name) {
  await page.getByRole("button", { name: `${name}: every store's price` }).click();
  await expect(card(page, name).locator(".riso-ing-panel")).toBeVisible();
  return card(page, name);
}

const weeksAgo = (n) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);

// Three weeks of "chicken breast" @ Metro (decreasing - today is a 6-month
// low) plus one brand-new item with zero history, for one user.
async function seedChickenHistory(userId) {
  await prisma.flyerDeal.createMany({
    data: [
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$6.99/lb",
        unitPrice: 6.99, unitBasis: "lb", isCurrent: false, createdAt: weeksAgo(8),
      },
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$5.49/lb",
        unitPrice: 5.49, unitBasis: "lb", isCurrent: false, createdAt: weeksAgo(4),
      },
      {
        userId, store: "Metro", source: "Metro", category: "protein",
        item: "Chicken breast", matchName: "chicken breast", price: "$4.49/lb",
        unitPrice: 4.49, unitBasis: "lb", isCurrent: true, createdAt: new Date(),
      },
      {
        userId, store: "IGA", source: "IGA", category: "produce",
        item: "Bell peppers", matchName: "bell peppers", price: "$1.49/lb",
        unitPrice: 1.49, unitBasis: "lb", isCurrent: true, createdAt: new Date(),
      },
    ],
  });
}

test("Flyers shows sample data with the Riso layout before any real flyer exists", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await openFlyers(page);
  await expect(page.getByText("deals, sorted.")).toBeVisible();
  // Sample deals fill the layout (so the page shows how it works) under a
  // clear "sample" note...
  await expect(page.locator(".riso-flyers-sample-note")).toContainText("example deals");
  await expect(page.locator(".riso-brief")).toHaveCount(3);
  await expect(page.locator(".riso-ing-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload flyer" })).toBeVisible();

  // ...but never count as real prices anywhere else.
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(page.getByText("No deals yet")).toBeVisible();
});

test("real deals show as ingredient cards with a 6-month low, a freeze tip and the briefing", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await openFlyers(page);
  const lows = page.locator(".riso-brief.accent");
  await expect(lows).toContainText("Lows to grab");
  await expect(lows.locator(".riso-brief-row")).toHaveText([/Chicken breast.*6-month low.*\$4\.49\/lb.*Metro/i]);

  const chicken = card(page, "Chicken breast");
  await expect(chicken.locator(".riso-ing-low")).toHaveText("6-MO LOW");
  await expect(chicken.locator(".riso-ing-sub")).toContainText("freezes");
  await expect(chicken.locator(".riso-ing-tile")).toHaveText([/METRO\s*\$4\.49\s*per lb/]);

  const opened = await openCard(page, "Chicken breast");
  // Price history: 6 monthly bars (this month green - a good price) and
  // the lowest, average and highest prices.
  await expect(opened.locator(".riso-ing-verdict")).toHaveText("6-MO LOW");
  await expect(opened.locator(".riso-ing-bar-col")).toHaveCount(6);
  await expect(opened.locator(".riso-ing-bar.good")).toHaveCount(1);
  await expect(opened.locator(".riso-ing-stats")).toContainText("LOWEST$4.49");
  await expect(opened.locator(".riso-ing-stats")).toContainText("HIGHEST$6.99");

  const peppers = await openCard(page, "Bell peppers");
  await expect(peppers.locator(".riso-ing-range-none")).toHaveText("No history for this item yet. It builds each week from the imports.");
  await expect(peppers.locator(".riso-ing-bars")).toHaveCount(0);
});

test("the same ingredient at several stores is one card, cheapest tile in green", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "produce", unitBasis: "lb", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Metro", item: "Bananas | bananes importées", matchName: "bananas", price: "$0.89/lb", unitPrice: 0.89 },
      { ...base, store: "Super C", item: "Bananas", matchName: "bananas", price: "$0.79/lb", unitPrice: 0.79 },
      { ...base, store: "Maxi", item: "Bananas", matchName: "bananas", price: "$0.84/lb", unitPrice: 0.84 },
      { ...base, store: "Metro", item: "Kiwis | kiwis", matchName: "kiwis", price: "$3.99", unitPrice: 3.99, unitBasis: "each" },
    ],
  });

  await openFlyers(page);
  const bananas = card(page, "Bananas");
  await expect(bananas.locator(".riso-ing-sub")).toContainText("bananes importées");
  await expect(bananas.locator(".riso-ing-tile")).toHaveCount(3);
  await expect(bananas.locator(".riso-ing-tile.best")).toHaveText(/SUPER C\s*\$0\.79/);
  await expect(page.locator(".riso-brief.plain .riso-brief-row")).toHaveText([/Bananas.*save \$0\.10\/lb vs metro/i]);

  // Open: every store's product, cheapest first.
  const opened = await openCard(page, "Bananas");
  await expect(opened.locator(".riso-ing-variant-store")).toHaveText(["SUPER C", "MAXI", "METRO"]);

  // One store at a time: an ingredient it doesn't carry disappears.
  await page.locator(".riso-store-switch").getByRole("button", { name: "Super C" }).click();
  await expect(card(page, "Kiwis")).toHaveCount(0);
  await expect(card(page, "Bananas").locator(".riso-ing-tile")).toHaveCount(1);

  // Slice and rank.
  await page.locator(".riso-store-switch").getByRole("button", { name: "All stores" }).click();
  await page.getByRole("button", { name: "Can freeze" }).click();
  await expect(page.locator(".riso-ing-group-head h4").first()).toHaveText("Freezes well");
  await expect(page.getByRole("region", { name: "Freezes well" })).toContainText("Bananas");
  await page.getByRole("button", { name: "A to Z" }).click();
  await expect(page.locator(".riso-ing-name")).toHaveText(["Bananas", "Kiwis"]);
});

test("watching from the detail view persists", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await openFlyers(page);
  let chicken = await openCard(page, "Chicken breast");
  await chicken.getByRole("button", { name: "Chicken breast details" }).click();
  const detail = page.getByRole("dialog", { name: "Chicken breast" });
  await detail.getByRole("button", { name: "☆ Watch this" }).click();
  await expect(detail.getByRole("button", { name: "★ Watching" })).toBeVisible();
  await detail.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await openFlyers(page);
  chicken = await openCard(page, "Chicken breast");
  await chicken.getByRole("button", { name: "Chicken breast details" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "★ Watching" })).toBeVisible();
});

test("+ List puts the ingredient on this week's list under that store", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await openFlyers(page);
  const chicken = await openCard(page, "Chicken breast");
  await chicken.getByRole("button", { name: "Add Chicken breast at Metro to the grocery list" }).click();
  await expect(chicken.locator(".riso-ing-list")).toHaveText("✓");
  // The button doesn't open the detail view.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Metro store" }).getByRole("button", { name: "Check off Chicken breast", exact: true })
  ).toBeVisible();

  // Again takes it off.
  await openFlyers(page);
  const again = await openCard(page, "Chicken breast");
  await again.getByRole("button", { name: "Take Chicken breast at Metro off the grocery list" }).click();
  await expect(again.locator(".riso-ing-list")).toHaveText("+ List");
});

test("a briefing row opens its card, and the detail view keeps the 6-month history", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);

  await openFlyers(page);
  await page.locator(".riso-brief.accent .riso-brief-row", { hasText: "Chicken breast" }).click();
  const chicken = card(page, "Chicken breast");
  await expect(chicken.locator(".riso-ing-panel")).toBeVisible();
  await chicken.getByRole("button", { name: "Chicken breast details" }).click();

  const detail = page.getByRole("dialog", { name: "Chicken breast" });
  await expect(detail).toContainText("METRO · MEAT & POULTRY");
  await expect(detail.locator(".riso-deal-detail-price strong")).toHaveText("$4.49/lb");
  await expect(detail.locator(".riso-deal-detail-history-head span")).toHaveText("6-MO LOW");
  await expect(detail.locator(".riso-deal-bar-col")).toHaveCount(6);
  await expect(detail.locator(".riso-deal-bar.now.good")).toHaveCount(1);
  await expect(detail.locator(".riso-deal-stats")).toContainText("LOWEST$4.49");
  await expect(detail.locator(".riso-deal-stats")).toContainText("HIGHEST$6.99");
  await expect(detail).toContainText("❄ Freezes");
  await expect(detail.locator(".riso-deal-detail-low")).toHaveText("6-month low!");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a matching recipe appears in What to cook with a save sticker", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await seedChickenHistory(user.id);
  await addRecipe(page, "Riso Cook Test Dish", "chicken breast");

  await openFlyers(page);
  const cook = page.locator(".riso-cook-card", { hasText: "Riso Cook Test Dish" });
  await expect(cook).toBeVisible();
  await expect(cook.locator(".riso-sticker")).toContainText("save $2.50");
});

test("a deal with no history yet is compared with Quebec's average price", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  // A made-up product so this shared (all-accounts) row can't touch other tests.
  const product = `Quokkafruit ${Date.now()}, per kilogram`;
  await prisma.priceBaseline.create({
    data: { product, item: product.split(",")[0].toLowerCase(), unitBasis: "lb", price: 5.0, month: "2026-08" },
  });
  try {
    await prisma.flyerDeal.create({
      data: {
        userId: user.id, store: "Metro", source: "Flipp", category: "produce",
        item: `${product.split(",")[0]} bunch`, matchName: `${product.split(",")[0].toLowerCase()} bunch`,
        price: "$3.50/lb", unitPrice: 3.5, unitBasis: "lb", isCurrent: true,
      },
    });

    await openFlyers(page);
    const name = await page.locator(".riso-ing-name", { hasText: "Quokkafruit" }).innerText();
    const fruit = await openCard(page, name);
    // The Quebec average banner, green for a good price.
    const qc = fruit.locator(".riso-ing-qc");
    await expect(qc).toHaveClass(/good/);
    await expect(qc).toContainText("QUEBEC AVERAGE · AUG 2026");
    await expect(qc).toContainText("$5.00/lb");
    await expect(qc).toContainText("Stock-up price · 30% less than it usually costs in Quebec");
    await expect(fruit.locator(".riso-ing-range-none")).toContainText("No history for this item yet");

    await fruit.getByRole("button", { name: /Quokkafruit .* details/ }).click();
    const avg = page.getByRole("dialog").locator(".riso-deal-detail-avg");
    await expect(avg).toHaveClass(/stock-up/);
    await expect(avg).toContainText("QUEBEC AVERAGE · AUG 2026");
    await expect(avg).toContainText("$5.00/lb");
    await expect(avg).toContainText("Stock-up price · 30% less than it usually costs in Quebec");
  } finally {
    await prisma.priceBaseline.delete({ where: { product } });
  }
});

test("cards show the product photo or a food emoji, and the detail says why a photo didn't load", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const photo =
    "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
  const base = { userId: user.id, store: "Metro", source: "Flipp", price: "$9.99", unitPrice: 9.99, unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, category: "protein", item: "PC BLACK LABEL SALMON FILLETS (400G)", matchName: "salmon fillets", imageUrl: photo },
      { ...base, category: "produce", item: "Seedless Navel Oranges 3 Lb", matchName: "oranges", imageUrl: "http://127.0.0.1:9/missing.jpg" },
    ],
  });

  await openFlyers(page);
  await expect(card(page, "Salmon fillets").locator("img.riso-ing-cover")).toHaveAttribute("src", photo);
  const oranges = card(page, "Oranges");
  await expect(oranges.locator(".riso-ing-cover-emoji")).toHaveText("🍊");

  // The tidy flyer name is in the open card; its detail says why the photo didn't show.
  const opened = await openCard(page, "Oranges");
  await expect(opened.locator(".riso-ing-variant-name")).toHaveText("Seedless navel oranges, 3 lb");
  await opened.getByRole("button", { name: "Seedless navel oranges, 3 lb details" }).click();
  const why = page.getByRole("dialog").locator(".riso-deal-detail-photo-why");
  await expect(why).toContainText("Photo didn't load: 127.0.0.1");
  await expect(why.getByRole("link", { name: "Open the photo ↗" })).toHaveAttribute("href", "http://127.0.0.1:9/missing.jpg");
});

test("cards group by aisle, and search finds French or English names", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, store: "Metro", source: "Flipp", category: "other", price: "$3.99", unitPrice: 3.99, unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, item: "Baby spinach | épinards bébé", matchName: "spinach" },
      { ...base, item: "Lean ground beef", matchName: "ground beef" },
      { ...base, item: "Paper towels, 6 rolls", matchName: "paper towels" },
    ],
  });

  await openFlyers(page);
  await expect(page.locator(".riso-ing-group-head h4")).toHaveText(["Fruits & vegetables", "Meat & poultry", "Household & personal care"]);

  // Accents don't matter.
  await page.getByLabel("Search flyer items").fill("epinards");
  await expect(page.locator(".riso-ing-name")).toHaveText(["Spinach"]);
  await page.getByLabel("Search flyer items").fill("beef");
  await expect(page.locator(".riso-ing-name")).toHaveText(["Ground beef"]);
});

test("a deal with no history at its own store is compared with other stores, per lb", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "dairy", unitBasis: "each" };
  await prisma.flyerDeal.createMany({
    data: [
      // Earlier weeks, at other stores (Le Rabais' past weeks look like this).
      { ...base, store: "Maxi", source: "Le Rabais", item: "Beurre salé, 454 g", matchName: "Salted Butter (454 g)", price: "$6.99", unitPrice: 6.99, isCurrent: false, createdAt: weeksAgo(5) },
      { ...base, store: "IGA", source: "Le Rabais", item: "Beurre salé, 454 g", matchName: "Salted Butter (454 g)", price: "$5.99", unitPrice: 5.99, isCurrent: false, createdAt: weeksAgo(2) },
      // This week at Metro: a new item there, with the flyer's own "save".
      { ...base, store: "Metro", item: "LACTANTIA SALTED BUTTER 454 G", matchName: "salted butter", price: "$4.49", unitPrice: 4.49, regularPrice: 6.49, isCurrent: true },
    ],
  });

  await openFlyers(page);
  const butter = card(page, "Salted butter");
  await expect(butter.locator(".riso-ing-tile")).toHaveText([/METRO\s*\$4\.49\s*\$4\.49\/lb/]);
  const opened = await openCard(page, "Salted butter");
  await expect(opened.locator(".riso-ing-variant-fr")).toHaveText("Reg. $6.49 · 31% off");
  await expect(opened.locator(".riso-ing-chart-head")).toContainText("cheapest store, 3 weeks of flyers · per lb");
  await expect(opened.locator(".riso-ing-verdict")).toHaveText("LOWEST AROUND");
});

test("on the grocery list, a sale item's tag shows where it's cheapest, wherever it's filed, and opens the flyer item", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const recipe = await (
    await page.request.post("/api/recipes", { data: { title: "BLT", ingredients: [{ name: "bacon" }, { name: "lemon juice" }, { name: "red bell pepper" }] } })
  ).json();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart, dayOfWeek: 2, mealType: "dinner" } });
  const base = { userId: user.id, source: "Flipp", category: "other", unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Super C", item: "Maple Leaf bacon, 375 g", matchName: "maple leaf bacon", price: "$3.99", unitPrice: 3.99 },
      { ...base, store: "Metro", item: "Bacon, 500 g", matchName: "bacon", price: "$5.99", unitPrice: 5.99 },
      // Shares words with list items but isn't them.
      { ...base, store: "Metro", item: "Orange juice", matchName: "orange juice", price: "$2.99", unitPrice: 2.99 },
      { ...base, store: "Maxi", item: "Red pepper flakes", matchName: "red pepper flakes", price: "$2.49", unitPrice: 2.49 },
    ],
  });

  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  const bacon = page.getByRole("button", { name: "Check off Bacon", exact: true });
  await expect(bacon.locator(".riso-row-deal")).toHaveText("Super C$3.99");
  await expect(page.getByRole("button", { name: "Check off Lemon juice", exact: true }).locator(".riso-row-deal")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check off Red bell pepper", exact: true }).locator(".riso-row-deal")).toHaveCount(0);

  await bacon.locator(".riso-row-deal").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Maple Leaf bacon, 375 g");
  await expect(dialog.locator(".riso-deal-detail-others")).toContainText("Metro · $5.99");
  // Opening it didn't check the item off.
  await expect(bacon).toHaveAttribute("aria-pressed", "false");

  // Aisles: lemon juice is pantry, red bell pepper is produce.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "By aisle" }).click();
  await expect(page.locator(".riso-group", { hasText: "Pantry" })).toContainText("Lemon juice");
  await expect(page.locator(".riso-group", { hasText: "Fruits & vegetables" })).toContainText("Red bell pepper");
});

test("a bag of apples isn't compared as equal to loose apples per lb, and the import check finds and fixes old per-lb prices", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "produce", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Metro", item: "McIntosh apples, 3 lb bag", matchName: "mcintosh apples", price: "$5.99", unitPrice: 5.99, unitBasis: "each", imageUrl: "https://example.com/a.jpg" },
      { ...base, store: "Super C", item: "McIntosh apples", matchName: "mcintosh apples", price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb" },
      // Last week's Super C price, saved per item before the price reader was fixed.
      { ...base, store: "Super C", item: "McIntosh apples", matchName: "mcintosh apples", price: "$1.09", unitPrice: 1.09, unitBasis: "each", isCurrent: false, createdAt: weeksAgo(1) },
    ],
  });

  await openFlyers(page);
  const apples = card(page, "Mcintosh apples");
  // The bag shows what you pay and what that is per lb; loose is cheapest.
  await expect(apples.locator(".riso-ing-tile")).toHaveText([/METRO\s*\$5\.99\s*\$2\.00\/lb/, /SUPER C\s*\$0\.99\s*per lb/]);
  await expect(apples.locator(".riso-ing-tile.best")).toContainText("SUPER C");

  // The import check: per-store counts, and the old per-lb price to fix.
  await page.getByRole("button", { name: "Check import" }).click();
  const report = page.getByLabel("Import check");
  await expect(report.getByRole("row", { name: /Metro/ })).toContainText("100%");
  await expect(report).toContainText("1 earlier week stored");
  await expect(report.locator(".riso-report-fix")).toContainText("1 older price was saved per item but was per lb");
  await report.getByRole("button", { name: "Mark them per lb" }).click();
  await expect(report).toContainText("Fixed 1 price.");
  await expect(report.locator(".riso-report-fix")).toHaveCount(0);
  const fixed = await prisma.flyerDeal.findFirst({ where: { userId: user.id, isCurrent: false } });
  expect(fixed).toMatchObject({ unitBasis: "lb", price: "$1.09/lb" });
});

test("every chart shows Quebec's monthly average for 6 months, and how many weeks of flyers it rests on", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const name = `Wombatberry ${Date.now()}`;
  const product = `${name}, per kilogram`;
  // Statistics Canada's last 6 months, ending last month.
  const months = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  await prisma.priceBaseline.create({
    data: {
      product, item: name.toLowerCase(), unitBasis: "lb", price: 4.0, month: months.at(-1),
      history: JSON.stringify(months.map((month, i) => ({ month, price: 4 + i * 0.1 }))),
    },
  });
  try {
    const base = { userId: user.id, store: "Metro", source: "Flipp", category: "produce", item: name, matchName: name.toLowerCase(), unitBasis: "lb" };
    await prisma.flyerDeal.createMany({
      data: [
        { ...base, price: "$3.99/lb", unitPrice: 3.99, isCurrent: false, createdAt: weeksAgo(3) },
        { ...base, price: "$2.99/lb", unitPrice: 2.99, isCurrent: true },
      ],
    });
    await openFlyers(page);
    const shown = await page.locator(".riso-ing-name", { hasText: "Wombatberry" }).innerText();
    const opened = await openCard(page, shown);
    await expect(opened.locator(".riso-ing-chart-head")).toContainText("cheapest store, 2 weeks of flyers · per lb");
    await expect(opened.locator(".riso-ing-bar-col")).toHaveCount(6);
    // The 5 Statistics Canada months inside the chart's 6 months.
    await expect(opened.locator(".riso-ing-qc-mark")).toHaveCount(5);
    await expect(opened.locator(".riso-ing-legend")).toContainText("Quebec average (Statistics Canada)");
  } finally {
    await prisma.priceBaseline.delete({ where: { product } });
  }
});

test("categories fold away, stay folded, and a search opens them", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, store: "Metro", source: "Flipp", category: "other", price: "$3.99", unitPrice: 3.99, unitBasis: "each", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, item: "Baby spinach", matchName: "spinach" },
      { ...base, item: "Lean ground beef", matchName: "ground beef" },
    ],
  });
  await openFlyers(page);
  const produce = page.getByRole("button", { name: /Fruits & vegetables/ });
  await expect(produce).toHaveAttribute("aria-expanded", "true");
  await produce.click();
  await expect(produce).toHaveAttribute("aria-expanded", "false");
  await expect(card(page, "Spinach")).toHaveCount(0);
  await expect(card(page, "Ground beef")).toBeVisible();

  // Remembered after a reload.
  await page.reload();
  await openFlyers(page);
  await expect(card(page, "Spinach")).toHaveCount(0);

  // A search opens it; Open all brings everything back.
  await page.getByLabel("Search flyer items").fill("spinach");
  await expect(card(page, "Spinach")).toBeVisible();
  await page.getByLabel("Search flyer items").fill("");
  await page.getByRole("button", { name: "Fold all" }).click();
  await expect(page.locator(".riso-ing-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Open all" }).click();
  await expect(page.locator(".riso-ing-card")).toHaveCount(2);
});
