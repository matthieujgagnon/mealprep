import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { PrismaClient } from "@prisma/client";
import { cancelAdd, confirmAdd } from "./inventory-confirm.js";

const prisma = new PrismaClient();

// Nothing reaches Inventory without Matt confirming it first: Done shopping
// and a store's "+ Add N to inventory" (Grocery), a receipt, and what the sheet shows.
// Plus the grocery rows: a flyer item opens its deal, a brand shows under the
// name, and every row is the same size.

test.use({ viewport: { width: 1280, height: 1000 } });

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `confirm+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
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
// A grocery row, and the checkbox in it: only the checkbox checks the item off
// (the list's rows: How it works' demo row is one too).
const check = (page, name) => page.locator(".riso-group").getByRole("checkbox", { name: `Check off ${name}`, exact: true });
const row = (page, name) => page.locator(".riso-group .riso-row").filter({ has: page.getByRole("checkbox", { name: `Check off ${name}`, exact: true }) });
// Two taps on the box: queued for Inventory (+).
const queue = async (page, name) => {
  await check(page, name).click();
  await check(page, name).click();
  await expect(row(page, name)).toHaveAttribute("data-step", "2");
};

test("a store's + Add N to inventory opens the sheet for its queued items; cancel adds nothing, confirm adds what was edited", async ({ page }) => {
  await signUp(page);
  await addExtra(page, { name: "Kale", quantity: 2 });
  await addExtra(page, { name: "Rice" });
  await goToGrocery(page);
  await expect(page.locator(".riso-group-foot")).toHaveCount(0); // only a store with something queued has it

  await queue(page, "Kale");
  await check(page, "Rice").click(); // bought, not queued
  await page.getByRole("button", { name: "+ Add 1 to inventory" }).click();

  const sheet = page.locator(".riso-confirm");
  await expect(sheet.locator(".riso-confirm-row")).toHaveCount(1); // just that one item
  await expect(sheet.getByLabel("Name of Kale")).toHaveValue("Kale");
  await expect(sheet.getByLabel("Amount of Kale")).toHaveValue("2");
  await expect(sheet.getByLabel("Shelf for Kale")).not.toHaveValue(""); // a shelf is suggested
  await expect(sheet.getByLabel("Use-by date for Kale")).not.toHaveValue(""); // and a use-by date

  await cancelAdd(page);
  expect(await inventory(page)).toHaveLength(0); // nothing added
  await expect(row(page, "Kale")).toHaveAttribute("data-step", "2"); // the list is as it was

  await page.getByRole("button", { name: "+ Add 1 to inventory" }).click();
  await sheet.getByLabel("Amount of Kale").fill("3");
  await sheet.getByLabel("Shelf for Kale").selectOption("freezer");
  await sheet.getByLabel("Use-by date for Kale").fill("2031-01-15");
  await confirmAdd(page);

  const items = await inventory(page);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: "Kale", quantity: 3, location: "freezer" });
  expect(items[0].expiresAt).toMatch(/^2031-01-15/);
  await expect(row(page, "Kale")).toHaveCount(0); // it left the list
  await expect(row(page, "Rice")).toHaveAttribute("data-step", "1"); // the bought item stayed in the cart
});

test("Done shopping lists every item in the cart; only what's ticked goes in, and the whole cart leaves the list", async ({ page }) => {
  await signUp(page);
  await addExtra(page, { name: "Oats" });
  await addExtra(page, { name: "Honey" });
  await goToGrocery(page);
  await queue(page, "Oats");
  await queue(page, "Honey");
  await page.getByRole("button", { name: "Done shopping · add 2 to inventory" }).click();

  const sheet = page.locator(".riso-confirm");
  await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);
  expect(await inventory(page)).toHaveLength(0); // still nothing: it's only the sheet
  await sheet.getByLabel("Include Honey").uncheck();
  await expect(sheet.getByRole("button", { name: "Add 1 to inventory" })).toBeVisible();
  await confirmAdd(page);

  expect((await inventory(page)).map((i) => i.name)).toEqual(["Oats"]);
  // The shop is over: Honey was bought, just not tracked.
  await expect(row(page, "Honey")).toHaveCount(0);
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

  test("a flyer item opens its deal when tapped; a hand-added item does nothing; only the checkbox checks, and it is 44 px", async ({ page }) => {
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

    // Tapping anywhere else on a hand-added item's row does nothing: only its checkbox checks it.
    await page.locator(".riso-row-name", { hasText: /^Soap$/ }).click();
    await expect(check(page, "Soap")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(".riso-deal-detail-name")).toHaveCount(0);
    // The checkbox is at least 44 by 44 px to tap, on a computer and on a phone.
    for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const box = await check(page, "Soap").boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // The checkbox checks it off and opens nothing.
    await check(page, "Soap").click();
    await expect(check(page, "Soap")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".riso-deal-detail-name")).toHaveCount(0);
  });

  test("the brand shows under the name, and every row is the same height with no name cut", async ({ page }) => {
    await seed(page, await signUp(page));
    const bacon = page.locator(".riso-group .riso-row", { hasText: "Bacon" });
    await expect(bacon.locator(".riso-row-brand")).toHaveText("Maple Leaf");
    // An item with no brand has no brand line at all.
    await expect(page.locator(".riso-group .riso-row", { hasText: "Soap" }).locator(".riso-row-brand")).toHaveCount(0);

    const sizes = async () => {
      const boxes = await page.locator(".riso-group .riso-row").evaluateAll((els) =>
        els.map((e) => {
          const b = e.getBoundingClientRect();
          const name = e.querySelector(".riso-row-name");
          return { h: Math.round(b.height), w: Math.round(b.width), cut: name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight + 1 };
        })
      );
      expect(boxes.length).toBeGreaterThanOrEqual(3);
      expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
      expect(boxes.some((b) => b.cut)).toBe(false); // the long name wraps; nothing is cut off
    };
    await sizes();

    // The same on a phone, and with one row queued ("→ INVENTORY" joins the row).
    await page.setViewportSize({ width: 390, height: 844 });
    await sizes();
    await queue(page, "Soap");
    await expect(row(page, "Soap").locator(".riso-row-queued")).toBeVisible();
    await sizes();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test("Store mode rows are all the same height, with or without a detail line, amount or price", async ({ page }) => {
  const userId = await signUp(page);
  const deal = await prisma.flyerDeal.create({
    data: { userId, store: "Metro", source: "Metro", category: "protein", item: "Maple Leaf bacon, 375 g", matchName: "bacon", price: "$3.99", unitPrice: 3.99, unitBasis: "each", regularPrice: 6.99, isCurrent: true, createdAt: new Date() },
  });
  await addExtra(page, { name: "Bacon", dealId: deal.id, quantity: 2 }); // detail line, amount and price
  await addExtra(page, { name: "Soap" }); // none of them
  await addExtra(page, { name: "Milk", quantity: 2 }); // an amount only
  await addExtra(page, { name: "A very long item name that goes on and on and would otherwise make this row taller than all the others" });
  await goToGrocery(page);

  // Store mode is the phone's shopping view.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  const rows = page.locator(".store-mode-row");
  await expect(rows).toHaveCount(4);
  const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
});

// The Inventory page's layout on a phone and a computer (Matt's Compact + Tiles
// design: no sticky shelf menu any more) is in inventory-compact-tiles.spec.js.
