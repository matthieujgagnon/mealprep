import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { itemForm } from "./inventory-form.js";
import { quebecDayIn } from "./quebec-day.js";

// Matt's Inventory design (docs/design/riso-v2-inventory-compact-tiles/): the
// title row with the Compact / Tiles choice (remembered on this device, per
// account), the days-left rule in both views, Recently removed with Put back,
// and the page on a phone (16px sides, full-width shelves, Compact one column,
// Tiles three across, press-and-hold drag for items and shelves).

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: french ? "S'inscrire" : "Sign up" }).click();
  await page.fill('input[type="email"]', `inv-ct+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: french ? "Créer un compte" : "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

const add = (page, data) => page.request.post("/api/pantry-inventory", { data: { location: "fridge", ...data } });
const stock = async (page) => (await page.request.get("/api/pantry-inventory")).json();

async function openInventory(page, label = "Inventory") {
  await page.reload();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator(".inv-shelf").first()).toBeVisible();
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("the title row, and Compact / Tiles remembered after a reload for this account", async ({ page }) => {
    await signUp(page);
    await add(page, { name: "Eggs", quantity: 8, expiresAt: quebecDayIn(10) });
    await openInventory(page);

    // Title row: the view choice, Scan receipt, + Add section, + Add item, in that order.
    await expect(page.locator(".riso-inv-header-actions > *")).toHaveText(["CompactTiles", "Scan receipt", "+ Add section", "+ Add item"]);
    // No pinned shelf menu any more.
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".inv-row")).toHaveCount(1);

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.locator(".inv-tile")).toHaveCount(1);
    await expect(page.locator(".inv-row")).toHaveCount(0);
    await openInventory(page);
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".inv-tile")).toHaveCount(1);
    // Kept in this browser, for this account only.
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(await page.evaluate((id) => localStorage.getItem(`mealprep-inventory-view:${id}`), me.id)).toBe("tiles");

    // Clicking a tile opens the pop-up; Escape closes it.
    await page.locator(".inv-tile", { hasText: "Eggs" }).click();
    await expect(itemForm(page)).toBeVisible();
    await expect(page.locator(".inv-tile", { hasText: "Eggs" })).toHaveClass(/active/);
  });

  test("on the use-by day an item says today in both views; Expired only from the next day", async ({ page }) => {
    await signUp(page);
    await add(page, { name: "Milk", quantity: 1, unit: "l", expiresAt: quebecDayIn(0) });
    await add(page, { name: "Cream", quantity: 1, unit: "cup", expiresAt: quebecDayIn(-1) });
    await openInventory(page);

    // "To use soon" counts the use-by day; expired is its own count.
    await expect(page.locator(".riso-inv-summary")).toHaveText("2 items1 to use soon1 expired");
    const milk = page.locator(".inv-row", { hasText: "Milk" });
    await expect(milk).toHaveAttribute("aria-label", "Milk, expires today");
    await expect(milk).not.toHaveClass(/expired/);
    await expect(milk.locator(".inv-expired")).toHaveCount(0);
    await expect(milk.locator(".inv-life.pink")).toHaveAttribute("style", /height: 8%/);
    const cream = page.locator(".inv-row", { hasText: "Cream" });
    await expect(cream).toHaveClass(/expired/);
    await expect(cream.locator(".inv-expired")).toHaveText("Expired");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.locator(".inv-tile", { hasText: "Milk" }).locator(".inv-expired")).toHaveCount(0);
    await expect(page.locator(".inv-tile", { hasText: "Milk" }).locator(".inv-life.pink")).toHaveAttribute("style", /width: 8%/);
    await expect(page.locator(".inv-tile", { hasText: "Cream" }).locator(".inv-expired")).toHaveText("Expired");
    // Expired first, then today.
    await expect(page.locator(".inv-tile-name")).toHaveText(["Cream", "Milk"]);
  });

  test("Recently removed: used up, tossed, deleted and cooked items, Put back as they were, and they count nowhere", async ({ page }) => {
    await signUp(page);
    const kale = await (await add(page, { name: "Kale", quantity: 1, unit: "bunch", expiresAt: quebecDayIn(1) })).json();
    await add(page, { name: "Bread", location: "freezer", quantity: 0.5, unit: "loaf", expiresAt: quebecDayIn(40) });
    await add(page, { name: "Mlik", quantity: 1 });
    const rice = await (await add(page, { name: "Rice", location: "pantry", quantity: 1, unit: "kg", expiresAt: quebecDayIn(300) })).json();
    await openInventory(page);
    await expect(page.locator(".riso-inv-removed")).toHaveCount(0); // nothing removed yet: no strip

    // Used up from the bulk bar.
    await page.locator(".inv-row", { hasText: "Kale" }).locator(".inv-check").click();
    await page.locator(".inv-action-bar").getByRole("button", { name: "Used up" }).click();
    // Tossed and Remove from the item's pop-up.
    await page.locator(".inv-row", { hasText: "Bread" }).click();
    await itemForm(page).getByRole("button", { name: "Tossed" }).click();
    await expect(itemForm(page)).toHaveCount(0);
    await page.locator(".inv-row", { hasText: "Mlik" }).click();
    await itemForm(page).getByRole("button", { name: /^Remove/ }).click();
    await expect(itemForm(page)).toHaveCount(0);
    // "I cooked this" taking the rice out to zero.
    await page.request.post("/api/pantry-inventory/take-out", { data: { takes: [{ id: rice.id, amount: "all" }] } });
    await openInventory(page);

    await expect(page.locator(".inv-row")).toHaveCount(0);
    await expect(page.locator(".riso-inv-summary")).toHaveText("0 items0 to use soon");
    // Quiet and collapsed until opened.
    const strip = page.locator(".riso-inv-removed");
    await expect(strip.getByRole("button", { name: /Recently removed/ })).toHaveAttribute("aria-expanded", "false");
    await expect(strip.locator(".riso-removed-row")).toHaveCount(0);
    await expect(strip.locator(".riso-removed-count")).toHaveText("4");
    await strip.getByRole("button", { name: /Recently removed/ }).click();
    await expect(strip.locator(".riso-removed-name")).toHaveText(["Rice", "Mlik", "Bread", "Kale"]);
    await expect(strip.locator(".riso-removed-meta")).toHaveText(["Cooked · today", "Deleted · today", "Tossed · today", "Used up · today"]);
    await page.locator(".riso-inv-removed").screenshot({ path: test.info().outputPath("recently-removed-desktop-en.png") });

    // Removed items count nowhere: not in Inventory, and not on Home's Use it up.
    expect((await stock(page)).map((i) => i.name)).toEqual([]);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".riso-useup-row", { hasText: "Kale" })).toHaveCount(0);

    // Put back: same row, same shelf, amount and use-by date; it leaves the list.
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await strip.getByRole("button", { name: /Recently removed/ }).click();
    await strip.getByRole("button", { name: "Put Kale back in your Inventory" }).click();
    await expect(page.locator(".riso-toast")).toContainText("Kale is back in your Inventory");
    await expect(page.locator('.inv-shelf[data-section-id="fridge"] .inv-row', { hasText: "Kale" })).toBeVisible();
    await expect(strip.locator(".riso-removed-name")).toHaveText(["Rice", "Mlik", "Bread"]);
    const back = (await stock(page)).find((i) => i.name === "Kale");
    expect(back).toMatchObject({ id: kale.id, location: "fridge", quantity: 1, unit: "bunch", expiresAt: kale.expiresAt });
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".riso-useup-row", { hasText: "Kale" })).toHaveCount(1);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA", hasTouch: true, isMobile: true });

  async function seed(page) {
    for (let i = 0; i < 4; i++) await add(page, { name: `Lait ${i}`, quantity: 1, unit: "l", expiresAt: quebecDayIn(i + 2) });
    await add(page, { name: "Pois", location: "freezer", quantity: 500, unit: "g", expiresAt: quebecDayIn(90) });
    await add(page, { name: "Riz", location: "pantry", quantity: 2, unit: "kg" });
  }

  test("16px sides, every shelf full width, Compact one column, Tiles three across, nothing wider than the screen", async ({ page }) => {
    await signUp(page, { french: true });
    await seed(page);
    await openInventory(page, "Inventaire");

    const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await noScroll()).toBeLessThanOrEqual(390);
    // The buttons wrap and stay inside the screen.
    for (const box of await page.locator(".riso-inv-header-actions > *").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(16 - 1);
      expect(box.right).toBeLessThanOrEqual(390 - 16 + 1);
    }
    const shelves = await page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (const s of shelves) {
      expect(Math.round(s.left)).toBe(16);
      expect(Math.round(s.right)).toBe(390 - 16);
    }
    // Compact: one column.
    const rowLefts = await page.locator('.inv-shelf[data-section-id="fridge"] .inv-row').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(rowLefts).size).toBe(1);
    await page.screenshot({ path: test.info().outputPath("inventory-compact-phone-fr.png"), fullPage: true });

    // Tiles: exactly three across.
    await page.getByRole("button", { name: "Tuiles" }).click();
    const tileLefts = await page.locator('.inv-shelf[data-section-id="fridge"] .inv-tile').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(tileLefts).size).toBe(3);
    expect(await noScroll()).toBeLessThanOrEqual(390);
    await page.screenshot({ path: test.info().outputPath("inventory-tiles-phone-fr.png"), fullPage: true });
  });

  // A real held-then-moved touch (CDP), as a finger does: past the app's 200 ms hold.
  async function holdAndDrag(page, client, from, to, steps = 12) {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    await page.waitForTimeout(300);
    for (let i = 1; i <= steps; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
  }
  const middle = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

  test("press and hold carries an item to another shelf, and a shelf by its grip; a tap still opens the item", async ({ page, context }) => {
    await signUp(page, { french: true });
    await add(page, { name: "Crevettes", quantity: 1, unit: "lb", expiresAt: quebecDayIn(1) });
    await add(page, { name: "Pois", location: "freezer", quantity: 500, unit: "g", expiresAt: quebecDayIn(90) });
    await openInventory(page, "Inventaire");
    const client = await context.newCDPSession(page);

    // An item: Fridge -> Freezer.
    const row = page.locator(".inv-row", { hasText: "Crevettes" });
    const freezer = page.locator('.inv-shelf[data-section-id="freezer"]');
    await holdAndDrag(page, client, middle(await row.boundingBox()), middle(await freezer.boundingBox()));
    await expect(freezer.locator(".inv-row", { hasText: "Crevettes" })).toBeVisible();
    await expect.poll(async () => (await stock(page)).find((i) => i.name === "Crevettes").location).toBe("freezer");
    await expect(itemForm(page)).toHaveCount(0); // the drag never opened the item

    // A shelf: hold the Freezer's grip, then move it above the Fridge.
    const order = () => page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.dataset.sectionId));
    await expect.poll(order).toEqual(["fridge", "freezer", "pantry", "leftovers"]);
    const grip = page.getByRole("button", { name: 'Déplacer la section « Congélateur »' });
    const fridge = await page.locator('.inv-shelf[data-section-id="fridge"]').boundingBox();
    await holdAndDrag(page, client, middle(await grip.boundingBox()), { x: fridge.x + fridge.width / 2, y: fridge.y + 12 });
    await expect.poll(order).toEqual(["freezer", "fridge", "pantry", "leftovers"]);

    // A quick tap still opens the item's pop-up.
    await page.locator(".inv-row", { hasText: "Pois" }).tap();
    await expect(itemForm(page)).toBeVisible();
  });
});
