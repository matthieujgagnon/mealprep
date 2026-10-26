import { expect, test } from "./spec-clock.js";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";

// Fix batch 7: every page opens at its top. Opening a page from the header (a tab, the
// app name, Back and Forward) starts it at the top, and Home on its first screen;
// tapping the tab you are already on scrolls that page smoothly back up. The scrolls
// that are on purpose (Recipes' section buttons, Flyers' Jump to and back-to-top, a link
// that opens a page at a given spot) are not touched.

const prisma = new PrismaClient();

const TABS = { home: 0, recipes: 1, planner: 2, makeable: 3, grocery: 4, flyers: 5, inventory: 6 };
const tab = (page, name) => page.locator(".tabs .tab").nth(TABS[name]);
const scrollY = (page) => page.evaluate(() => window.scrollY);
const toBottom = (page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
const homeTop = (page) => page.evaluate(() => document.querySelector(".home-scroller").scrollTop);

async function signUp(page) {
  const email = `page-top+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText(/Home|Accueil/);
  return email;
}

// Flyers with a week of deals, as it is for a real account (seeded straight into the database,
// like flyers-riso.spec.js: the real imports need services that are out of reach here).
async function seedDeals(email) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, store: "Metro", source: "Flipp", category: "other", price: "$3.99", unitPrice: 3.99, unitBasis: "each", isCurrent: true };
  const fruit = ["apples", "pears", "plums", "kiwis", "lemons", "limes", "oranges", "grapes", "carrots", "onions", "leeks", "beets", "celery", "spinach", "lettuce", "cabbage"];
  await prisma.flyerDeal.createMany({
    data: [...fruit.map((f) => ({ ...base, item: f, matchName: f })), { ...base, item: "Lean ground beef", matchName: "ground beef" }, { ...base, item: "Cheddar cheese", matchName: "cheddar cheese" }],
  });
}

// Enough recipes that Recipes and Makeable are both far taller than the window, and deals on Flyers.
async function signUpWithRecipes(page, count = 40) {
  const email = await signUp(page);
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, "0");
    await page.request.post("/api/recipes", {
      data: { title: `Page top recipe ${n}`, ingredients: [{ name: "flour" }, { name: `herb ${i % 5}` }], instructions: ["Cook it."] },
    });
  }
  await seedDeals(email);
  await page.reload();
  return email;
}

// Flyers is drawn and has its deals: its jump bar is there. (It used to scroll the page down to
// that bar as soon as it appeared, so the top has to be read after that.)
async function flyersLoaded(page) {
  await expect(page.locator(".riso-jump-chip").first()).toBeVisible();
  await page.waitForTimeout(400);
}

// What window.scrollTo was asked, so a test can tell a smooth scroll from a jump.
const watchScrolls = (page) =>
  page.evaluate(() => {
    window.__scrolls = [];
    const real = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      window.__scrolls.push(args);
      return real(...args);
    };
  });
const askedSmooth = (page) => page.evaluate(() => window.__scrolls.some((a) => a[0] && a[0].behavior === "smooth"));

for (const [label, viewport] of [
  ["a computer", { width: 1280, height: 720 }],
  ["a phone", { width: 390, height: 844 }],
]) {
  test.describe(`on ${label}`, () => {
    test.use({ viewport });

    test("opening a page from the header starts at its top, whatever the page before was scrolled to", async ({ page }) => {
      await signUpWithRecipes(page);
      await tab(page, "recipes").click();
      await expect(page.locator(".rpc").first()).toBeVisible();
      await toBottom(page);
      expect(await scrollY(page)).toBeGreaterThan(500);

      // The headline case (Matt, Oct 19): Recipes, far down, then Flyers.
      await tab(page, "flyers").click();
      await flyersLoaded(page);
      expect(await scrollY(page)).toBe(0);

      // Recipes and Makeable are both tall: the old position would still be there.
      await tab(page, "recipes").click();
      await toBottom(page);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(500);
      await tab(page, "makeable").click();
      await expect(tab(page, "makeable")).toHaveClass(/active/);
      await expect.poll(() => scrollY(page)).toBe(0);

      // Every page, each one entered from a page scrolled as far down as it goes.
      for (const to of ["recipes", "planner", "grocery", "inventory", "flyers", "makeable", "home"]) {
        if (to !== "home") await toBottom(page);
        await tab(page, to).click();
        await expect(tab(page, to)).toHaveClass(/active/);
        if (to === "flyers") await flyersLoaded(page);
        await expect.poll(() => scrollY(page), { message: `${to} opens at its top` }).toBe(0);
      }
    });

    test("Home starts on its first screen, however it is reached", async ({ page }) => {
      await signUp(page);
      const toScreenTwo = () =>
        page.evaluate(() => {
          const scroller = document.querySelector(".home-scroller");
          scroller.style.scrollBehavior = "auto";
          scroller.scrollTop = document.querySelector('[data-screen="2"]').offsetTop;
          scroller.style.scrollBehavior = "";
        });
      await toScreenTwo();
      expect(await homeTop(page)).toBeGreaterThan(100);
      await tab(page, "recipes").click();
      await tab(page, "home").click();
      await expect.poll(() => homeTop(page)).toBe(0);
      expect(await scrollY(page)).toBe(0);

      // The app name is the way home too.
      await toScreenTwo();
      await tab(page, "inventory").click();
      await page.locator("h1.wordmark a").click();
      await expect(tab(page, "home")).toHaveClass(/active/);
      await expect.poll(() => homeTop(page)).toBe(0);
    });

    test("tapping the tab you are already on scrolls that page smoothly back to the top; switching pages does not animate", async ({ page }) => {
      await signUpWithRecipes(page);
      await tab(page, "recipes").click();
      await expect(page.locator(".rpc").first()).toBeVisible();
      await toBottom(page);
      expect(await scrollY(page)).toBeGreaterThan(500);

      await watchScrolls(page);
      await tab(page, "recipes").click();
      await expect.poll(() => scrollY(page)).toBe(0);
      expect(await askedSmooth(page)).toBe(true);

      // Changing page is a jump, never an animation.
      await toBottom(page);
      await watchScrolls(page);
      await tab(page, "makeable").click();
      await expect.poll(() => scrollY(page)).toBe(0);
      expect(await askedSmooth(page)).toBe(false);

      // On Home it is the first screen again.
      await tab(page, "home").click();
      await page.evaluate(() => {
        const scroller = document.querySelector(".home-scroller");
        scroller.style.scrollBehavior = "auto";
        scroller.scrollTop = document.querySelector('[data-screen="2"]').offsetTop;
        scroller.style.scrollBehavior = "";
      });
      expect(await homeTop(page)).toBeGreaterThan(100);
      await tab(page, "home").click();
      await expect.poll(() => homeTop(page)).toBe(0);
    });
  });
}

test.describe("the scrolls that are on purpose stay", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("a link that opens a page at a given spot lands there, not at the top: Plan around this from far down Recipes", async ({ page }) => {
    await signUpWithRecipes(page);
    await tab(page, "recipes").click();
    await expect(page.locator(".rpc").first()).toBeVisible();
    await toBottom(page);
    await page.locator(".rpc", { hasText: "Page top recipe 40" }).first().click();
    const card = page.getByRole("dialog", { name: "Page top recipe 40" });
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Plan around this" }).click();
    await expect(tab(page, "planner")).toHaveClass(/active/);
    const banner = page.locator(".fnd-main");
    await expect(banner).toBeVisible();
    await expect(banner).toBeInViewport({ ratio: 1 });
    expect(await scrollY(page)).toBeGreaterThan(100); // it scrolled to the banner, not to the top
  });

  test("Recipes' Imported button and Flyers' back-to-top button still scroll on their own page", async ({ page }) => {
    await signUpWithRecipes(page, 12);
    // A recipe in Imported (it has a source link) so that section has a heading to jump to.
    await page.request.post("/api/recipes", {
      data: { title: "Imported one", ingredients: [{ name: "flour" }], instructions: ["Cook it."], sourceUrl: "https://example.com/imported-one" },
    });
    await page.reload();
    await tab(page, "recipes").click();
    await expect(page.locator(".rpc").first()).toBeVisible();
    expect(await scrollY(page)).toBe(0);
    await page.locator(".rv2-tabs").getByRole("button", { name: /^Imported/ }).click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(100);

    // Flyers: back-to-top (an arrow in the Jump to bar).
    await tab(page, "flyers").click();
    await flyersLoaded(page);
    expect(await scrollY(page)).toBe(0); // opened at its top, from the Imported section of Recipes
    await page.getByRole("button", { name: "Open all" }).click();
    await page.getByRole("navigation", { name: "Jump to a category" }).getByRole("button", { name: /Dairy & eggs/ }).click();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
    await page.getByRole("button", { name: "Back to the top" }).click();
    await expect.poll(() => scrollY(page)).toBe(0);
  });
});
