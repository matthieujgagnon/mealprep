import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { saveRecipe } from "./recipe-form.js";

// The recipe form's photo tiles on a phone. Like every other drag in the app, a tile is picked up
// by a press that holds still (hooks/useHeldDrag.js): a swipe along the page scrolls it, a held
// tile is carried. These dispatch real touch events through CDP (Chromium's own input
// pipeline), the way e2e/touch-drag.spec.js does: a mouse never meets the browser's decision to
// take a touch for a page scroll, which is what used to cancel this drag.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `photos+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

// The new-recipe form with three uploaded photos.
async function openFormWithPhotos(page) {
  await signUp(page);
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await expect(page.getByRole("heading", { name: "New recipe." })).toBeVisible();
  await page.getByLabel("Choose photos").setInputFiles(["a", "b", "c"].map((n) => ({ name: `${n}.png`, mimeType: "image/png", buffer: PNG })));
  const tiles = page.locator(".re-photo:not(.uploading)");
  await expect(tiles).toHaveCount(3);
  await tiles.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  return tiles;
}

const urls = (tiles) => tiles.evaluateAll((els) => els.map((e) => e.dataset.url));
const centre = async (tile) => {
  const box = await tile.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// How far the form has scrolled: the page and every scrolling box around the tile.
const scrolled = (tile) =>
  tile.evaluate((el) => {
    let sum = window.scrollY;
    for (let node = el.parentElement; node; node = node.parentElement) sum += node.scrollTop;
    return sum;
  });

// A finger on `from` that holds for `hold` ms, then moves to `to` and lifts. Resolves with how
// many `pointercancel`s the page saw: the browser takes the touch for a page scroll by cancelling it.
async function touch(page, { from, to, hold, steps = 14 }) {
  const client = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => client.send("Input.dispatchTouchEvent", { type, touchPoints });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => {
    window.__cancels = 0;
    document.addEventListener("pointercancel", () => window.__cancels++, true);
  });
  await send("touchStart", [from]);
  if (hold) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
    await frame();
  }
  await send("touchEnd", []);
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__cancels);
}

test("press-and-hold a photo tile and drag it to reorder: the browser does not take the touch, and the order is saved", async ({ page }) => {
  const tiles = await openFormWithPhotos(page);
  const [first, second, third] = await urls(tiles);
  expect(new Set([first, second, third]).size).toBe(3);

  // The first tile onto the third (the tiles are two across, so this is down the page).
  const cancels = await touch(page, { from: await centre(tiles.nth(0)), to: await centre(tiles.nth(2)), hold: 300 });
  expect(cancels).toBe(0);
  expect(await urls(tiles)).toEqual([second, third, first]);

  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Photo order");
  await saveRecipe(page);
  const saved = (await (await page.request.get("/api/recipes")).json()).find((r) => r.title === "Photo order");
  expect(saved.photos).toEqual([second, third, first]);
});

test("a tile moved sideways reorders too", async ({ page }) => {
  const tiles = await openFormWithPhotos(page);
  const [first, second, third] = await urls(tiles);
  const cancels = await touch(page, { from: await centre(tiles.nth(0)), to: await centre(tiles.nth(1)), hold: 300 });
  expect(cancels).toBe(0);
  expect(await urls(tiles)).toEqual([second, first, third]);
});

test("a plain swipe that starts on a photo tile scrolls the form and does not move the photo", async ({ page }) => {
  const tiles = await openFormWithPhotos(page);
  const before = await urls(tiles);
  const start = await centre(tiles.nth(2));
  const scrollBefore = await scrolled(tiles.nth(2));
  // No hold: the finger moves at once, 160 px up the page.
  await touch(page, { from: start, to: { x: start.x, y: start.y - 160 }, hold: 0, steps: 10 });
  expect(await scrolled(tiles.nth(2))).toBeGreaterThan(scrollBefore);
  expect(await urls(tiles)).toEqual(before);
});

test("a tap on a photo tile still makes it the cover", async ({ page }) => {
  const tiles = await openFormWithPhotos(page);
  await tiles.nth(1).tap();
  await expect(tiles.nth(1)).toHaveClass(/cover/);
});
