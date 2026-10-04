import { expect, test } from "@playwright/test";
import { confirmAdd } from "./inventory-confirm.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Store mode (Design4): one store at a time, grouped by section in
// walking order or A to Z, checked rows fade and sink, light or dark
// (remembered on the device), and Done adds what's checked to Inventory.

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

test("Store mode groups each store's list by section, sorts A to Z, and remembers the theme", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  const mode = await openStoreMode(page);

  // Metro: its sale items and the unfiled ones, by section in walking order.
  await mode.getByRole("tab", { name: "Metro" }).click();
  await expect(mode.locator(".store-mode-num")).toHaveText("5");
  await expect(mode.locator(".store-mode-section-pill")).toHaveText(["Fruits & vegetables", "Meat & poultry", "Frozen", "Pantry"]);
  const beef = mode.locator(".store-mode-row", { hasText: "Ground beef" });
  await expect(beef.locator(".store-mode-sale")).toHaveText("Metro$5.44/lb");
  await expect(beef.locator(".store-mode-brand")).toHaveText("Irresistibles");
  await page.screenshot({ path: test.info().outputPath("dark-section.png") });

  // Checking a row fades it, counts down and sinks it to the bottom of its
  // section; Done counts what goes to Inventory.
  const produce = mode.locator(".store-mode-group", { has: page.locator(".store-mode-section-pill", { hasText: "Fruits & vegetables" }) });
  await expect(produce.locator(".store-mode-name")).toHaveText(["Cilantro", "Limes"]);
  await produce.locator(".store-mode-row", { hasText: "Cilantro" }).click();
  await expect(produce.locator(".store-mode-name")).toHaveText(["Limes", "Cilantro"]);
  await expect(produce.locator(".store-mode-row.on")).toHaveText(/Cilantro/);
  await expect(produce.locator(".store-mode-section-left")).toHaveText("1 LEFT");
  await expect(mode.locator(".store-mode-num")).toHaveText("4");
  await expect(mode.getByRole("button", { name: "Done · add 1 to inventory" })).toBeEnabled();

  // A to Z: one list, no sections, checked rows last.
  await mode.getByRole("button", { name: "A–Z" }).click();
  await expect(mode.locator(".store-mode-section")).toHaveCount(0);
  await expect(mode.locator(".store-mode-name")).toHaveText(["Frozen peas", "Ground beef", "Limes", "Rice", "Cilantro"]);

  // Another store: its own list and count.
  await mode.getByRole("tab", { name: "Super C" }).click();
  await expect(mode.locator(".store-mode-num")).toHaveText("1");
  await expect(mode.locator(".store-mode-name")).toHaveText(["Chicken breasts"]);

  // Light theme, remembered next time.
  await expect(mode).toHaveAttribute("data-sm-theme", "dark");
  await mode.getByRole("button", { name: "Light theme" }).click();
  await expect(mode).toHaveAttribute("data-sm-theme", "light");
  await mode.getByRole("tab", { name: "Metro" }).click();
  await mode.getByRole("button", { name: "Section" }).click();
  await page.screenshot({ path: test.info().outputPath("light-section.png") });
  await mode.getByRole("button", { name: "← List" }).click();
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  await expect(page.getByRole("dialog", { name: "Store mode" })).toHaveAttribute("data-sm-theme", "light");

  // Done adds the checked item to Inventory and closes.
  await page.getByRole("button", { name: "Done · add 1 to inventory" }).click();
  await confirmAdd(page);
  await expect(page.getByRole("dialog", { name: "Store mode" })).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/pantry-inventory")).json()).map((i) => i.name.toLowerCase())).toContain("cilantro");
  // What was bought leaves the list (a hand-added item is deleted).
  await expect(page.getByRole("checkbox", { name: "Check off Cilantro", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Check off limes", exact: true })).toBeVisible();
});

test.describe("in French", () => {
  test.use({ locale: "fr-CA" });

  test("Store mode reads in French, with the French half of the flyer name", async ({ page }) => {
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
    await mode.getByRole("tab", { name: "Metro" }).click();
    await expect(mode.locator(".store-mode-at")).toHaveText("restants chez Metro");
    await expect(mode.locator(".store-mode-section-pill").first()).toHaveText("Fruits et légumes");
    await expect(mode.locator(".store-mode-section-left").first()).toHaveText("2 RESTANTS");
    const beef = mode.locator(".store-mode-row", { hasText: "Ground beef" });
    await expect(beef.locator(".store-mode-brand")).toHaveText("Irresistibles");
    await expect(beef.locator(".store-mode-sale")).toHaveText(/^Metro5,44\s\$\/lb$/);
    await expect(mode.getByRole("button", { name: "Rayon" })).toHaveAttribute("aria-pressed", "true");
    await expect(mode.getByRole("button", { name: "Terminé · ajouter 0 à l'inventaire" })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath("fr-dark.png") });
  });
});
