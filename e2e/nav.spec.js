import { expect, test } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { openHelp } from "./account-menu.js";

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
  await page.fill('input[name="invite"]', E2E_INVITE);
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

// The app name in the header is the link Home (a real link: the keyboard and screen readers can
// use it), on every page, on a computer and on a phone. It looks like the plain name.
const PAGES = ["Recipes", "Planner", "Makeable", "Grocery", "Flyers", "Inventory"];

test("computer: the app name is the link Home from every page, with the keyboard too, and looks like the plain name", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUp(page);
  const home = page.locator("h1.wordmark").getByRole("link", { name: "Home", exact: true });
  await expect(home).toHaveCount(1);
  await expect(home).toHaveAttribute("href", "/");
  await expect(home).toContainText("matt mo cookbook");

  // The look: the plain name's colour, no underline; only the pointer shows it is a link.
  expect(await home.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).textDecorationLine, getComputedStyle(el).cursor])).toEqual([
    "rgb(22, 24, 31)",
    "none",
    "pointer",
  ]);

  for (const name of PAGES) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".tab.active")).toHaveText(name);
    await home.click();
    await expect(page.locator(".tab.active")).toHaveText("Home");
  }
  await openHelp(page);
  await expect(page.locator(".tab.active")).toHaveCount(0); // Help is not a tab
  await home.click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  // The keyboard: Shift+Tab back through the header from a tab reaches the app name, which shows a
  // focus ring, and Enter on it goes Home.
  const grocery = page.getByRole("button", { name: "Grocery", exact: true });
  await grocery.click();
  await expect(page.locator(".tab.active")).toHaveText("Grocery");
  await grocery.focus();
  for (let i = 0; i < 8 && !(await home.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Shift+Tab");
  await expect(home).toBeFocused();
  expect(await home.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab.active")).toHaveText("Home");
});

test("phone: the app name is the link Home from every page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signUp(page);
  const home = page.locator("h1.wordmark").getByRole("link", { name: "Home", exact: true });
  await expect(home).toBeVisible();
  for (const name of PAGES) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".tab.active")).toHaveText(name);
    await home.click();
    await expect(page.locator(".tab.active")).toHaveText("Home");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the app name asks first when the recipe form has unsaved changes, like the tabs", async ({ page }) => {
  await signUp(page);
  await page.request.post("/api/recipes", {
    data: { title: "Weeknight dal", ingredients: [{ name: "red lentils", quantity: 1, unit: "cup" }], instructions: ["Simmer."] },
  });
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: "Weeknight dal" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit recipe" }).click();
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();
  const home = page.locator("h1.wordmark").getByRole("link", { name: "Home", exact: true });

  // Nothing changed yet: it just goes Home.
  await home.click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  // Changed: it asks. Keep editing stays; Discard goes Home.
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.locator(".rpc", { hasText: "Weeknight dal" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Weeknight red dal");
  await home.click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Leave without saving your changes?");
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toBeVisible();
  await home.click();
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  await expect(page.getByRole("heading", { name: "Edit recipe." })).toHaveCount(0);
});
