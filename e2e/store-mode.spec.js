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
    "rgb(255, 72, 176) 2px 2px 0px 0px",
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

test("Store mode and Cook mode share one light / dark choice", async ({ page }) => {
  await signUp(page);
  const res = await page.request.post("/api/recipes", {
    data: { title: "Shared Theme Soup", baseServings: 2, ingredients: [{ name: "stock", quantity: 1, unit: "cup" }], instructions: ["Prep: Heat the stock."] },
  });
  expect(res.ok()).toBeTruthy();
  await seedList(page); // reloads, so the recipe is there too

  // Dark until someone picks light; a pick in Store mode is saved for both.
  let mode = await openStoreMode(page);
  await expect(mode).toHaveAttribute("data-sm-theme", "dark");
  await mode.getByRole("button", { name: "Light theme" }).click();
  expect(await page.evaluate(() => localStorage.getItem("mealprep-theme"))).toBe("light");
  await mode.getByRole("button", { name: "← List" }).click();

  // Cook mode opens in the choice Store mode saved...
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByText("Shared Theme Soup", { exact: true }).click();
  await page.getByRole("button", { name: /Open the full recipe/ }).click();
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(page.locator(".cm-overlay")).toHaveAttribute("data-theme", "light");

  // ...and a pick there is the one Store mode opens in next.
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.getByRole("button", { name: "Exit cook mode" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  mode = await openStoreMode(page);
  await expect(mode).toHaveAttribute("data-sm-theme", "dark");
});

test("a choice Store mode saved before the switch was shared is still honoured", async ({ page }) => {
  await signUp(page);
  await seedList(page);
  await page.evaluate(() => localStorage.setItem("mealprep-store-mode-theme", "light"));
  const mode = await openStoreMode(page);
  await expect(mode).toHaveAttribute("data-sm-theme", "light");
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

// Real touch input needs hasTouch (set where it is used).
const centre = async (locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Real touch input (Chromium's own): put a finger on `from`, hold still for `holdMs`, then
// move through `path` (points on the screen) and lift. `during` runs while the finger is
// still down at the last point, to look at the drag in progress.
async function drag(page, from, path, { holdMs = 350, during } = {}) {
  const client = await page.context().newCDPSession(page);
  const start = await centre(from);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await page.waitForTimeout(holdMs);
  for (const point of path) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(150);
  if (during) await during();
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
}
const towards = (a, b, steps = 6) =>
  Array.from({ length: steps }, (_, i) => ({ x: a.x + ((b.x - a.x) * (i + 1)) / steps, y: a.y + ((b.y - a.y) * (i + 1)) / steps }));

test.describe("moving an item to another store by dragging it", () => {
  test.use({ hasTouch: true });

  test("press and hold an item, drag it onto another store, and it stays there with Undo; a tap still checks and the lift never does", async ({ page }) => {
    await signUp(page);
    await seedList(page);
    let mode = await openStoreMode(page);
    await expect(mode.locator(".store-mode-hint")).toHaveText("Press and hold an item, then drag it onto another store.");
    const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
    const superC = mode.locator(".store-mode-store", { hasText: "Super C" });
    const beef = metro.locator(".store-mode-row", { hasText: "Ground beef" });

    // No pop-up menu any more, and the browser's own press-and-hold menus are off the rows.
    await expect(mode.getByRole("dialog", { name: /Move/ })).toHaveCount(0);
    await expect(metro.locator(".store-mode-move").first()).toHaveCSS("user-select", "none");
    await expect(metro.locator(".store-mode-move").first()).toHaveCSS("touch-action", "pan-y");
    expect(await beef.evaluate((el) => !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(true); // the browser's menu is cancelled

    // Released on the row it started in (a small drag): nothing moves and the row is not checked.
    const here = await centre(beef);
    await drag(page, beef, towards(here, { x: here.x + 20, y: here.y + 4 }, 3));
    await expect(mode.locator(".store-mode-row.on")).toHaveCount(0);
    await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Ground beef", "Limes", "Rice"]);

    // Dragged onto Super C's sticker: it lights up while the finger is over it, and the item follows.
    const sticker = await centre(superC.locator(".store-mode-sticker"));
    await drag(page, beef, towards(here, sticker), {
      during: async () => {
        await expect(superC).toHaveClass(/drop-over/);
        await expect(metro).not.toHaveClass(/drop-over/);
        await expect(page.locator(".store-drag-chip")).toHaveText("Ground beef");
        await page.screenshot({ path: test.info().outputPath("dragging.png") });
      },
    });
    await expect(superC.locator(".store-mode-name")).toHaveText(["Chicken breasts", "Ground beef"]);
    await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Limes", "Rice"]);
    await expect(metro.locator(".store-mode-badge")).toHaveText("4 LEFT");
    await expect(superC.locator(".store-mode-badge")).toHaveText("2 LEFT");
    await expect(superC.locator(".store-mode-move.moved")).toHaveCount(1);
    await expect(mode.locator(".store-mode-row.on")).toHaveCount(0); // the lift did not check it
    const toast = page.locator(".riso-toast");
    await expect(toast).toContainText("Ground beef moved to Super C");
    await page.screenshot({ path: test.info().outputPath("moved.png") });

    // Undo puts it back.
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Ground beef", "Limes", "Rice"]);
    await expect(superC.locator(".store-mode-name")).toHaveText(["Chicken breasts"]);

    // Dropped on a section (not the sticker): it moves too, for good.
    const row = await centre(metro.locator(".store-mode-row", { hasText: "Ground beef" }));
    const body = await centre(superC.locator(".store-mode-row").first());
    await drag(page, metro.locator(".store-mode-row", { hasText: "Ground beef" }), towards(row, body));
    await expect(superC.locator(".store-mode-name")).toHaveText(["Chicken breasts", "Ground beef"]);

    // A short tap still checks a row (a real tap comes a moment after a drop).
    await page.waitForTimeout(400);
    await metro.locator(".store-mode-row", { hasText: "Limes" }).tap();
    await expect(metro.locator(".store-mode-row.on")).toHaveCount(1);

    // Saved for good: after a reload it is still under Super C.
    await mode.getByRole("button", { name: "← List" }).click();
    await mode.getByRole("button", { name: "Leave without adding" }).click();
    await page.reload();
    mode = await openStoreMode(page);
    await expect(mode.locator(".store-mode-store", { hasText: "Super C" }).locator(".store-mode-name")).toHaveText(["Chicken breasts", "Ground beef"]);
  });

  test("dropping on a folded store works and does not unfold it", async ({ page }) => {
    await signUp(page);
    await seedList(page);
    const mode = await openStoreMode(page);
    const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
    const superC = mode.locator(".store-mode-store", { hasText: "Super C" });
    await superC.getByRole("button", { name: "Fold Super C" }).click();
    await expect(superC.locator(".store-mode-row")).toHaveCount(0);

    const beef = metro.locator(".store-mode-row", { hasText: "Ground beef" });
    const from = await centre(beef);
    await drag(page, beef, towards(from, await centre(superC.locator(".store-mode-sticker"))), {
      during: async () => expect(superC).toHaveClass(/drop-over/),
    });
    await expect(superC.locator(".store-mode-row")).toHaveCount(0); // still folded
    await expect(superC.locator(".store-mode-badge")).toHaveText("2 LEFT");
    await expect(metro.locator(".store-mode-name")).toHaveText(["Cilantro", "Frozen peas", "Limes", "Rice"]);
    await page.waitForTimeout(400); // taps right after a drag are swallowed; a real tap comes later
    await superC.getByRole("button", { name: "Unfold Super C" }).click();
    await expect(superC.locator(".store-mode-name")).toHaveText(["Chicken breasts", "Ground beef"]);
  });

  test("a store with nothing on screen is a drop target in the tray at the bottom while an item is carried", async ({ page }) => {
    await signUp(page);
    await seedList(page);
    await page.request.post("/api/grocery-sections", { data: { name: "Costco" } });
    await page.reload();
    const mode = await openStoreMode(page);
    await expect(mode.locator(".store-mode-tray")).toHaveCount(0); // only while carrying
    const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
    const rice = metro.locator(".store-mode-row", { hasText: "Rice" });
    const from = await centre(rice);
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    await page.waitForTimeout(350);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y - 30 }] });
    const tray = mode.locator(".store-mode-tray");
    await expect(tray).toBeVisible();
    const costco = tray.locator(".store-mode-tray-drop", { hasText: "Costco" });
    await expect(costco).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("tray.png") });
    const target = await centre(costco.locator(".store-mode-sticker"));
    for (const point of towards({ x: from.x, y: from.y - 30 }, target, 6)) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
      await page.waitForTimeout(60);
    }
    await expect(costco).toHaveClass(/drop-over/);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(tray).toHaveCount(0);
    await expect(mode.locator(".store-mode-store", { hasText: "Costco" }).locator(".store-mode-name")).toHaveText(["Rice"]);
    await expect(page.locator(".riso-toast")).toContainText("Rice moved to Costco");
    await expect(mode.locator(".store-mode-row.on")).toHaveCount(0);
  });

  test("a swipe still scrolls the list, and holding near the bottom edge scrolls it while carrying", async ({ page }) => {
    await signUp(page);
    await seedList(page);
    for (let i = 0; i < 18; i++) await page.request.post("/api/grocery-extra-items", { data: { name: `extra item ${String(i).padStart(2, "0")}`, quantity: 1 } });
    await page.reload();
    const mode = await openStoreMode(page);
    const list = mode.locator(".store-mode-list");
    const scrollTop = () => list.evaluate((el) => el.scrollTop);
    expect(await scrollTop()).toBe(0);

    // A swipe (the finger moves at once) scrolls and picks nothing up.
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 600 }] });
    for (let i = 1; i <= 12; i++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 600 - i * 25 }] });
      await page.waitForTimeout(16);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(scrollTop).toBeGreaterThan(100);
    await expect(mode.locator(".store-mode-row.on")).toHaveCount(0);
    await expect(page.locator(".store-drag-chip")).toHaveCount(0);

    // Carried to the bottom edge, the list scrolls by itself.
    await list.evaluate((el) => (el.scrollTop = 0));
    const row = mode.locator(".store-mode-row").first();
    const from = await centre(row);
    const before = await scrollTop();
    await drag(page, row, [{ x: from.x, y: 700 }, { x: from.x, y: 830 }], {
      during: async () => {
        await page.waitForTimeout(900);
        expect(await scrollTop()).toBeGreaterThan(before + 50);
      },
    });
    await expect(mode.locator(".store-mode-row.on")).toHaveCount(0);
  });

  test("there is no drag in All, and no hint", async ({ page }) => {
    await signUp(page);
    await seedList(page);
    const mode = await openStoreMode(page);
    await mode.getByRole("button", { name: "All", exact: true }).click();
    await expect(mode.locator(".store-mode-hint")).toHaveCount(0);
    await expect(mode.locator(".store-mode-move.draggable")).toHaveCount(0);
  });
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
  await expect(sticker).toHaveCSS("box-shadow", "rgb(37, 99, 235) 2px 2px 0px 0px");
  await metro.fill("pink");
  await expect(metro).toHaveCSS("border-top-color", "rgb(196, 18, 63)"); // not a colour: red border, nothing saved
  await expect(sticker).toHaveCSS("box-shadow", "rgb(37, 99, 235) 2px 2px 0px 0px");
  await metro.fill("#0f0");
  await expect(sticker).toHaveCSS("box-shadow", "rgb(0, 255, 0) 2px 2px 0px 0px");
  await sheet.getByRole("button", { name: "Done" }).click();

  // Kept on this device.
  await mode.getByRole("button", { name: "← List" }).click();
  await page.getByRole("button", { name: /I'm at the store/ }).click();
  await expect(page.locator(".store-mode-store", { hasText: "Metro" }).locator(".store-mode-sticker")).toHaveCSS("box-shadow", "rgb(0, 255, 0) 2px 2px 0px 0px");
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
  test.use({ locale: "fr-CA", hasTouch: true });

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

  test("dragging an item to another store reads in French, with Annuler", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await page.fill('input[type="email"]', `store-mode-fr-drag+${Date.now()}@example.com`);
    await page.fill('input[type="password"]', "testpass123");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".tab.active")).toHaveText("Accueil");
    await seedList(page);
    await page.request.post("/api/grocery-sections", { data: { name: "Costco" } });
    await page.reload();
    await page.getByRole("button", { name: "Épicerie", exact: true }).first().click();
    await expect(page.locator(".riso-row").first()).toBeVisible();
    await page.getByRole("button", { name: /Je suis à l.épicerie/ }).click();
    const mode = page.getByRole("dialog", { name: "Mode magasin" });
    await expect(mode.locator(".store-mode-hint")).toHaveText("Appuyez longuement sur un article, puis glissez-le vers un autre magasin.");
    const metro = mode.locator(".store-mode-store", { hasText: "Metro" });
    const superC = mode.locator(".store-mode-store", { hasText: "Super C" });
    const beef = metro.locator(".store-mode-row", { hasText: "Ground beef" });
    const from = await centre(beef);
    await drag(page, beef, towards(from, await centre(superC.locator(".store-mode-sticker"))), {
      during: async () => {
        await expect(page.locator(".store-mode-tray-label")).toHaveText("Déposez ici pour le déplacer vers un autre magasin");
        await page.screenshot({ path: test.info().outputPath("fr-dragging.png") });
      },
    });
    await expect(superC.locator(".store-mode-name")).toHaveText(["Chicken breasts", "Ground beef"]);
    const toast = page.locator(".riso-toast");
    await expect(toast).toContainText("Ground beef déplacé vers Super C");
    await page.screenshot({ path: test.info().outputPath("fr-moved.png") });
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(metro.locator(".store-mode-name", { hasText: "Ground beef" })).toHaveCount(1);
  });
});
