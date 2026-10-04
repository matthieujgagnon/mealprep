import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { cancelAdd, confirmAdd } from "./inventory-confirm.js";

const prisma = new PrismaClient();

// Nothing reaches Inventory without Matt confirming it first: Done shopping
// and a row's "To inventory" (Grocery), a receipt, and what the sheet shows.
// Plus the grocery rows: a flyer item opens its deal, a brand shows under the
// name, and every row is the same size.

test.use({ viewport: { width: 1280, height: 1000 } });

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `confirm+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

const inventory = async (page) => await (await page.request.get("/api/pantry-inventory")).json();
const addExtra = (page, data) => page.request.post("/api/grocery-extra-items", { data });
const goToGrocery = async (page) => {
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
};
const row = (page, name) => page.getByRole("button", { name: `Check off ${name}`, exact: true });

test("a checked item's To inventory opens the sheet for that item; cancel adds nothing, confirm adds what was edited", async ({ page }) => {
  await signUp(page);
  await addExtra(page, { name: "Kale", quantity: 2 });
  await addExtra(page, { name: "Rice" });
  await goToGrocery(page);
  await expect(page.getByRole("button", { name: /^To inventory$/ })).toHaveCount(0); // only checked rows have it

  await row(page, "Kale").click();
  await row(page, "Rice").click();
  await page.getByRole("button", { name: "Add Kale to Inventory" }).click();

  const sheet = page.locator(".riso-confirm");
  await expect(sheet.locator(".riso-confirm-row")).toHaveCount(1); // just that one item
  await expect(sheet.getByLabel("Name of Kale")).toHaveValue("Kale");
  await expect(sheet.getByLabel("Amount of Kale")).toHaveValue("2");
  await expect(sheet.getByLabel("Shelf for Kale")).not.toHaveValue(""); // a shelf is suggested
  await expect(sheet.getByLabel("Use-by date for Kale")).not.toHaveValue(""); // and a use-by date

  await cancelAdd(page);
  expect(await inventory(page)).toHaveLength(0); // nothing added
  await expect(row(page, "Kale")).toHaveAttribute("aria-pressed", "true"); // the list is as it was

  await page.getByRole("button", { name: "Add Kale to Inventory" }).click();
  await sheet.getByLabel("Amount of Kale").fill("3");
  await sheet.getByLabel("Shelf for Kale").selectOption("freezer");
  await sheet.getByLabel("Use-by date for Kale").fill("2031-01-15");
  await confirmAdd(page);

  const items = await inventory(page);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: "Kale", quantity: 3, location: "freezer" });
  expect(items[0].expiresAt).toMatch(/^2031-01-15/);
  await expect(row(page, "Kale")).toHaveCount(0); // it left the list
  await expect(row(page, "Rice")).toBeVisible(); // the other checked item stayed
});

test("Done shopping lists every checked item; a row switched off stays on the list", async ({ page }) => {
  await signUp(page);
  await addExtra(page, { name: "Oats" });
  await addExtra(page, { name: "Honey" });
  await goToGrocery(page);
  await row(page, "Oats").click();
  await row(page, "Honey").click();
  await page.getByRole("button", { name: "Done shopping · add 2 to inventory" }).click();

  const sheet = page.locator(".riso-confirm");
  await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);
  expect(await inventory(page)).toHaveLength(0); // still nothing: it's only the sheet
  await sheet.getByLabel("Include Honey").uncheck();
  await expect(sheet.getByRole("button", { name: "Add 1 to inventory" })).toBeVisible();
  await confirmAdd(page);

  expect((await inventory(page)).map((i) => i.name)).toEqual(["Oats"]);
  await expect(row(page, "Honey")).toHaveAttribute("aria-pressed", "true");
});

test("a receipt goes through the same sheet, and cancelling it adds nothing", async ({ page }) => {
  await signUp(page);
  await page.route("**/api/receipts/parse", (route) =>
    route.fulfill({ json: { items: [{ name: "Milk", quantity: 1 }, { name: "Loyalty coupon", quantity: 1 }] } })
  );
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Scan receipt" }).click();
  await page.locator('.riso-receipt input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: Buffer.from("x") });

  const sheet = page.locator(".riso-confirm");
  await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);
  await cancelAdd(page);
  expect(await inventory(page)).toHaveLength(0);

  await page.getByRole("button", { name: "Review 2 items" }).click(); // no second read of the receipt
  await sheet.getByLabel("Include Loyalty coupon").uncheck();
  await confirmAdd(page);
  expect((await inventory(page)).map((i) => i.name)).toEqual(["Milk"]);
});

test.describe("grocery rows", () => {
  async function seed(page, userId) {
    const deal = await prisma.flyerDeal.create({
      data: { userId, store: "Metro", source: "Metro", category: "protein", item: "Maple Leaf bacon, 375 g", matchName: "bacon", price: "$3.99", unitPrice: 3.99, unitBasis: "each", regularPrice: 6.99, isCurrent: true, createdAt: new Date() },
    });
    await addExtra(page, { name: "Bacon", dealId: deal.id }); // added from the flyer
    await addExtra(page, { name: "Soap" }); // typed by hand
    await addExtra(page, { name: "A very long item name that goes on and on and would otherwise make this row taller than all the others in the list" });
    await goToGrocery(page);
  }

  test("a flyer item opens its deal when tapped, a hand-added item doesn't", async ({ page }) => {
    await seed(page, await signUp(page));
    await page.getByRole("button", { name: "Open the flyer deal for Bacon" }).click();
    await expect(page.locator(".riso-deal-detail-name")).toContainText("Maple Leaf bacon");
    await expect(page.locator(".riso-deal-detail-brand")).toContainText("Maple Leaf");
    await page.locator(".riso-deal-detail-close").click();
    await expect(page.locator(".riso-deal-detail-name")).toHaveCount(0);

    // Its check circle still checks it off, without opening the deal.
    await page.getByRole("checkbox", { name: "Check off Bacon" }).click();
    await expect(page.locator(".riso-deal-detail-name")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Check off Bacon" })).toHaveAttribute("aria-checked", "true");

    // A hand-added item checks off and opens nothing.
    await row(page, "Soap").click();
    await expect(row(page, "Soap")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".riso-deal-detail-name")).toHaveCount(0);
  });

  test("the brand shows under the name, and every row is the same size", async ({ page }) => {
    await seed(page, await signUp(page));
    const bacon = page.locator(".riso-row", { hasText: "Bacon" });
    await expect(bacon.locator(".riso-row-brand")).toHaveText("Maple Leaf");
    await expect(page.locator(".riso-row", { hasText: "Soap" }).locator(".riso-row-brand")).toHaveText("");

    const sizes = async () => {
      const boxes = await page.locator(".riso-row").evaluateAll((els) =>
        els.map((e) => {
          const b = e.getBoundingClientRect();
          const slot = e.querySelector(".riso-row-slot").getBoundingClientRect();
          return { h: Math.round(b.height), w: Math.round(b.width), slot: Math.round(slot.width), name: e.querySelector(".riso-row-name").scrollWidth > e.querySelector(".riso-row-name").clientWidth };
        })
      );
      expect(boxes.length).toBeGreaterThanOrEqual(3);
      expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.slot)).size).toBe(1);
      expect(boxes.some((b) => b.name)).toBe(true); // the long name is cut off with an ellipsis, not grown
    };
    await sizes();

    // The same on a phone, and with one row checked ("To inventory" takes the tag's place).
    await page.setViewportSize({ width: 390, height: 844 });
    await row(page, "Soap").click();
    await expect(page.getByRole("button", { name: "Add Soap to Inventory" })).toBeVisible();
    const heights = await page.locator(".riso-row").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("inventory on a phone", () => {
  test.use({ viewport: { width: 390, height: 700 } });

  test("one continuous scroll through every shelf, with the chips pinned to jump between them", async ({ page }) => {
    await signUp(page);
    for (const [name, location] of [["Milk", "fridge"], ["Peas", "freezer"], ["Pasta", "pantry"]]) {
      for (let i = 0; i < 6; i++) await page.request.post("/api/pantry-inventory", { data: { name: `${name} ${i}`, location } });
    }
    await page.reload();
    await page.getByRole("button", { name: "Inventory", exact: true }).click();

    await expect(page.locator(".inv-shelf")).toHaveCount(3); // all of them on the page at once
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const chips = page.locator(".riso-inv-shelf-pin");
    const header = await page.locator(".app-header").boundingBox();
    await expect.poll(async () => Math.round((await chips.boundingBox()).y)).toBe(Math.round(header.y + header.height));

    await page.getByRole("tab", { name: /^Freezer/ }).click();
    await expect(page.locator('.inv-shelf[data-section-id="freezer"]')).toBeInViewport();
    await expect(page.getByRole("tab", { name: /^Freezer/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /^Pantry/ }).click();
    await expect(page.getByRole("tab", { name: /^Pantry/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('.inv-shelf[data-section-id="pantry"]')).toBeInViewport();
  });
});
