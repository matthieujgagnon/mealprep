import { expect, test } from "@playwright/test";

// The header nav regressed twice: first the active pill's 3px hard shadow
// was sliced off along its bottom edge (the tab row was a scroll container,
// which clips on both axes), then tabs past the fold silently vanished on
// narrower desktop windows. These pin down both.

const TABS = ["Home", "Recipes", "Planner", "Makeable", "Grocery", "Flyers", "Inventory"];

async function signUp(page, email = `nav+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

for (const width of [1280, 1000, 800]) {
  test(`desktop ${width}px: every tab is fully on screen and nothing clips the active pill`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signUp(page);

    const overflow = await page.locator(".tabs").evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.overflowX, cs.overflowY];
    });
    expect(overflow).toEqual(["visible", "visible"]);

    for (const name of TABS) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await expect(page.locator(".tab.active")).toHaveText("Inventory");
  });
}

test("phone: pills scroll without widening the page, and the avatar menu logs out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  // A long email: Home greets you with its first half, one long word.
  await signUp(page, `nav-phone-with-a-rather-long-account-name+${Date.now()}@example.com`);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".tab.active")).toHaveText("Inventory");

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
});
