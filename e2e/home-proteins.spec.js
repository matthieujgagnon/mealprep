import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { addDays, quebecDay } from "./quebec-day.js";
import { langSwitch } from "./account-menu.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Home's Proteins on sale card, Matt's redesign (design:
// docs/design/riso-v2-home-proteins/): a row for each protein with something on
// sale, a pop-out of its products as cards (three across, two on a phone), a
// details strip for the one tapped (with Add to list, which Undo takes back,
// and See in Flyers), the other rows blurred while it is open, and the states the
// design doesn't draw (loading, no data, a failed load). The logic itself is
// unit-tested in lib/proteins.test.js; the older checks (the recipes link, the
// Best deal, "Can't tell yet") are in home-redesign.spec.js and polish-e.spec.js.

// A flyer's end day is a Quebec day, so "in N days" is counted from the Quebec day (e2e/quebec-day.js).
const dateIn = (days) => addDays(quebecDay(new Date()), days);

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `home-proteins+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

// A plain gradient standing in for a flyer photo.
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3c6a5"/><stop offset="1" stop-color="#c9774a"/></linearGradient></defs><rect width="200" height="120" fill="url(#g)"/></svg>'
  );

// Four chicken sales (so a second line of cards shows), fish, pork and tofu with
// nothing to compare, and a non-protein that must not count.
async function seed(userId) {
  const row = (item, matchName, unitPrice, extra = {}) => ({
    userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
    unitPrice, unitBasis: "lb", isCurrent: true, createdAt: new Date(), ...extra,
  });
  await prisma.flyerDeal.createMany({
    data: [
      row("Poitrines de poulet désossées | Boneless chicken breasts", "boneless chicken breasts", 4.87, { store: "Super C", regularPrice: 8.49, validUntil: dateIn(1), imageUrl: PHOTO }),
      row("Cuisses de poulet | Chicken thighs", "chicken thighs", 2.49, { store: "Metro", regularPrice: 4.99, validUntil: dateIn(3) }),
      row("Pilons de poulet | Chicken drumsticks", "chicken drumsticks", 1.99, { store: "IGA", regularPrice: 3.49 }),
      row("Poulet entier | Whole chicken", "whole chicken", 2.29, { store: "Maxi", regularPrice: 3.19 }),
      row("Filet de saumon Atlantique | Atlantic salmon fillet", "atlantic salmon fillet", 9.99, { store: "Maxi", regularPrice: 14.99, validUntil: dateIn(0) }),
      row("Longe de porc | Pork loin", "pork loin", 3.49, { store: "Super C", regularPrice: 4.69 }),
      row("Firm tofu", "firm tofu", 2.99, { store: "IGA", price: "$2.99", unitBasis: "each" }),
      row("Bananas", "bananas", 0.69, { category: "produce" }),
    ],
  });
}

// What the flyers give for the first chicken product only: a Quebec average
// (Statistics Canada's table isn't reachable in tests, so it is added to the
// answer the page asks for).
async function withQuebecAverage(page) {
  await page.route(DEALS_URL, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const deal of body.deals || []) {
      if (deal.matchName === "boneless chicken breasts") deal.baseline = { product: "Chicken breasts, per kilogram", price: 8.8, month: "2026-09", basis: "lb", pct: -45, verdict: "stock-up" };
    }
    await route.fulfill({ response, json: body });
  });
}

// The one answer the Home card asks for (the lite list of this week's deals).
const DEALS_URL = /\/api\/deals\?lite=1/;

const card = (page) => page.locator(".riso-home-proteins");
// Proteins on sale is on Home's second screen: go there (at once, not smoothly) before measuring where a row sits.
async function onScreenTwo(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector(".home-scroller");
    scroller.style.scrollBehavior = "auto";
    scroller.scrollTop = document.querySelector('[data-screen="2"]').offsetTop;
    scroller.style.scrollBehavior = "";
  });
  await expect(card(page)).toBeInViewport();
}
// A kind's row (a button), not one of the product cards in its pop-out.
const rowButton = (page, kind) =>
  card(page).locator("button.riso-protein-card", { has: page.locator(".riso-protein-name", { hasText: new RegExp(`^${kind}$`) }) });

test.describe("Proteins on sale on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("a row opens a pop-out under it with three product cards across, the best buy first with a green shadow", async ({ page }) => {
    await withQuebecAverage(page);
    await seedAndLoad(page);
    await onScreenTwo(page);
    const chicken = rowButton(page, "Chicken");
    await expect(chicken).toContainText("4 products");
    const below = rowButton(page, "Fish");
    const belowBefore = await below.boundingBox();
    const rowBox = await chicken.boundingBox();

    await chicken.click();
    const panel = card(page).locator(".riso-protein-panel");
    await expect(panel).toBeVisible();
    // Right under the row, the width of the row, and the rows below don't move.
    const panelBox = await panel.boundingBox();
    expect(Math.abs(panelBox.y - (rowBox.y + rowBox.height))).toBeLessThanOrEqual(2);
    expect(Math.abs(panelBox.width - rowBox.width)).toBeLessThanOrEqual(5);
    expect(await below.boundingBox()).toEqual(belowBefore);

    // Three across, then the fourth on a second line; best buy (the biggest saving) first.
    const cards = panel.locator(".riso-protein-pcard");
    await expect(cards).toHaveCount(4);
    const boxes = await cards.evaluateAll((els) => els.map((e) => ({ x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) })));
    expect(new Set(boxes.slice(0, 3).map((b) => b.y)).size).toBe(1);
    expect(new Set(boxes.slice(0, 3).map((b) => b.x)).size).toBe(3);
    expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[3].x).toBe(boxes[0].x);
    await expect(cards.first()).toContainText("Chicken thighs"); // 50% off
    await expect(cards.first()).toHaveClass(/best/);
    const shadows = await cards.evaluateAll((els) => els.map((e) => getComputedStyle(e).boxShadow));
    expect(shadows[0]).toMatch(/16, 201, 92/); // --riso-green
    expect(shadows[0]).toMatch(/5px 5px 0px/);
    for (const s of shadows.slice(1)) expect(s).toBe("none");

    // The other rows blur and dim; the open one doesn't. They fade over 0.15 s,
    // from whenever the browser next draws, so wait for the end of the fade.
    await expect(rowButton(page, "Fish")).toHaveClass(/dimmed/);
    await expect(rowButton(page, "Pork")).toHaveClass(/dimmed/);
    await expect(chicken).not.toHaveClass(/dimmed/);
    await expect(rowButton(page, "Fish")).toHaveCSS("filter", "blur(3px)");
    await expect(rowButton(page, "Fish")).toHaveCSS("opacity", "0.55");
  });

  test("a product with a photo shows it; one without gets the striped paper with the kind's emoji", async ({ page }) => {
    await seedAndLoad(page);
    await rowButton(page, "Chicken").click();
    const cards = card(page).locator(".riso-protein-pcard");
    const breasts = cards.filter({ hasText: "Chicken breasts" });
    await expect(breasts.locator("img.riso-deal-photo")).toBeVisible();
    const thighs = cards.filter({ hasText: "Chicken thighs" });
    await expect(thighs.locator("img")).toHaveCount(0);
    await expect(thighs.locator(".riso-deal-photo.placeholder")).toHaveText("🍗");
    expect(await thighs.locator(".riso-deal-photo.placeholder").evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("repeating-linear-gradient");
    // The photo area is 96px high on a computer.
    expect((await thighs.locator(".riso-protein-pcard-photo").boundingBox()).height).toBeCloseTo(96, 0);
  });

  test("a tapped product opens its strip: only the values the flyers give, and one card at a time", async ({ page }) => {
    await withQuebecAverage(page);
    await seedAndLoad(page);
    await rowButton(page, "Chicken").click();
    const cards = card(page).locator(".riso-protein-pcard");
    const strip = card(page).locator(".riso-protein-detail");

    // Breasts: regular price, ends tomorrow and Quebec's average, in green.
    await cards.filter({ hasText: "Chicken breasts" }).click();
    await expect(strip).toContainText("Chicken breasts · Super C");
    const values = strip.locator(".riso-protein-stats > div");
    await expect(values).toHaveCount(3);
    await expect(values.nth(0)).toContainText("Reg. price");
    await expect(values.nth(0)).toContainText("$8.49/lb");
    await expect(values.nth(1)).toContainText("Ends");
    await expect(values.nth(1)).toContainText("tomorrow");
    await expect(values.nth(2)).toContainText("Quebec average");
    await expect(values.nth(2).locator(".riso-protein-stat-val")).toHaveText("−45%");
    await expect(values.nth(2).locator(".riso-protein-stat-val")).toHaveClass(/good/);
    await expect(cards.filter({ hasText: "Chicken breasts" })).toHaveAttribute("aria-expanded", "true");

    // Drumsticks: the flyer has no end date and there is no Quebec average: those two are left out, not dashes.
    await cards.filter({ hasText: "Chicken drumsticks" }).click();
    await expect(strip).toHaveCount(1);
    await expect(strip).toContainText("Chicken drumsticks · IGA");
    await expect(strip.locator(".riso-protein-stats > div")).toHaveCount(1);
    await expect(strip).toContainText("$3.49/lb");
    await expect(strip).not.toContainText("Quebec average");
    await expect(strip).not.toContainText("Ends");
    await expect(cards.filter({ hasText: "Chicken breasts" })).toHaveAttribute("aria-expanded", "false");

    // Tapping the same card again closes the strip.
    await cards.filter({ hasText: "Chicken drumsticks" }).click();
    await expect(strip).toHaveCount(0);

    // A product that ends today says so.
    await page.keyboard.press("Escape");
    await rowButton(page, "Fish").click();
    await card(page).locator(".riso-protein-pcard").first().click();
    await expect(card(page).locator(".riso-protein-detail")).toContainText("today");
  });

  test("rows are buttons: Enter opens one, Esc closes it and focus goes back to the row", async ({ page }) => {
    await seedAndLoad(page);
    const chicken = rowButton(page, "Chicken");
    expect(await chicken.evaluate((e) => e.tagName)).toBe("BUTTON");
    await chicken.focus();
    await page.keyboard.press("Enter");
    await expect(chicken).toHaveAttribute("aria-expanded", "true");
    await expect(card(page).getByRole("region", { name: "Chicken products on sale" })).toBeVisible();
    // Tab goes into the cards.
    await page.keyboard.press("Tab");
    await expect(card(page).locator(".riso-protein-pcard").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card(page).locator(".riso-protein-panel")).toHaveCount(0);
    await expect(chicken).toBeFocused();

    // Only one is open at a time: opening Fish from the keyboard closes Chicken.
    await page.keyboard.press("Enter");
    await rowButton(page, "Fish").focus();
    await page.keyboard.press("Enter");
    await expect(rowButton(page, "Fish")).toHaveAttribute("aria-expanded", "true");
    await expect(chicken).toHaveAttribute("aria-expanded", "false");
    await expect(card(page).locator(".riso-protein-panel")).toHaveCount(1);

    // Clicking outside closes it and gives the row its focus back.
    await page.locator(".riso-protein-scrim").click({ position: { x: 5, y: 5 } });
    await expect(card(page).locator(".riso-protein-panel")).toHaveCount(0);
    await expect(rowButton(page, "Fish")).toBeFocused();
  });

  test("Add to list, then \"On list\" takes it off with the Undo toast, and Undo puts it back", async ({ page }) => {
    await seedAndLoad(page);
    await rowButton(page, "Pork").click();
    await card(page).locator(".riso-protein-pcard").first().click();
    const strip = card(page).locator(".riso-protein-detail");
    const count = page.locator(".home-grocery-number");
    const before = Number(await count.textContent());

    await strip.getByRole("button", { name: "+ Add to list" }).click();
    await expect(strip.getByRole("button", { name: "✓ On list" })).toBeVisible();
    await expect(count).toHaveText(String(before + 1));

    await strip.getByRole("button", { name: "✓ On list" }).click();
    await expect(strip.getByRole("button", { name: "+ Add to list" })).toBeVisible();
    await expect(count).toHaveText(String(before));
    const toast = page.locator(".riso-toast");
    await expect(toast).toContainText("taken off your grocery list");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(strip.getByRole("button", { name: "✓ On list" })).toBeVisible();
    await expect(count).toHaveText(String(before + 1));

    // And it is really on the list, with its flyer deal.
    const extras = await (await page.request.get("/api/grocery-extra-items")).json();
    expect(extras.filter((e) => /pork/i.test(e.name))).toHaveLength(1);
  });

  test("two quick taps on Add to list add it once", async ({ page }) => {
    await seedAndLoad(page);
    await rowButton(page, "Pork").click();
    await card(page).locator(".riso-protein-pcard").first().click();
    const add = card(page).locator(".riso-protein-detail").getByRole("button", { name: "+ Add to list" });
    await add.dblclick();
    await expect(card(page).locator(".riso-protein-detail").getByRole("button", { name: "✓ On list" })).toBeVisible();
    const extras = await (await page.request.get("/api/grocery-extra-items")).json();
    expect(extras.filter((e) => /pork/i.test(e.name))).toHaveLength(1);
  });

  test("a kind with a price but nothing to compare it with still opens and shows its prices", async ({ page }) => {
    await seedAndLoad(page);
    const tofu = rowButton(page, "Tofu");
    await expect(tofu).toContainText("Can't tell yet");
    await expect(tofu.locator(".riso-protein-best")).toHaveCount(0);
    await tofu.click();
    const cards = card(page).locator(".riso-protein-pcard");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Firm tofu");
    await expect(cards.first()).toContainText("$2.99");
    // Nothing is a sale there: no sale pill, no green shadow, and the strip has nothing to compare.
    await expect(cards.first().locator(".riso-protein-off")).toHaveCount(0);
    await expect(cards.first()).not.toHaveClass(/best/);
    await cards.first().click();
    await expect(card(page).locator(".riso-protein-stats")).toHaveCount(0);
    await expect(card(page).locator(".riso-protein-detail").getByRole("button", { name: "See in Flyers →" })).toBeVisible();
  });

  test("the rows come in the design's order, and a kind with nothing on sale has none", async ({ page }) => {
    await seedAndLoad(page);
    await expect(card(page).locator(".riso-protein-name")).toHaveText(["Chicken", "Fish", "Pork", "Tofu"]);
    await expect(card(page).getByText("No deal this week")).toHaveCount(0);
  });
});

test.describe("Proteins on sale on a wide screen", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("two columns of rows from 1560 px; an open row and its pop-out take both columns", async ({ page }) => {
    await seedAndLoad(page);
    const chicken = rowButton(page, "Chicken");
    const fish = rowButton(page, "Fish");
    const [c, f] = [await chicken.boundingBox(), await fish.boundingBox()];
    expect(f.x).toBeGreaterThan(c.x + c.width); // beside it, not under it
    expect(Math.abs(f.y - c.y)).toBeLessThanOrEqual(1);
    const list = await card(page).locator(".riso-protein-list").boundingBox();

    // A row in the right column opens over both columns, from the left edge to the right.
    await fish.click();
    const open = await fish.boundingBox();
    const panel = await card(page).locator(".riso-protein-panel").boundingBox();
    expect(Math.abs(open.x - list.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(open.width - list.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(panel.x - list.x)).toBeLessThanOrEqual(5);
    expect(Math.abs(panel.width - list.width)).toBeLessThanOrEqual(8);
  });
});

test.describe("Proteins on sale on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one column of rows and two product cards across, inside the screen", async ({ page }) => {
    await seedAndLoad(page);
    const chicken = rowButton(page, "Chicken");
    await chicken.scrollIntoViewIfNeeded();
    await chicken.click();
    const panel = card(page).locator(".riso-protein-panel");
    const cards = panel.locator(".riso-protein-pcard");
    await expect(cards).toHaveCount(4);
    const xs = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(2); // two columns
    expect(xs[2]).toBe(xs[0]);
    expect((await cards.first().locator(".riso-protein-pcard-photo").boundingBox()).height).toBeCloseTo(84, 0);
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // The strip comes into view when a product is tapped.
    await cards.nth(3).click();
    const strip = card(page).locator(".riso-protein-detail");
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("button", { name: "+ Add to list" })).toBeInViewport();
  });

  test("in French everything fits: words, buttons, the strip and the page", async ({ page }) => {
    await withQuebecAverage(page);
    await seedAndLoad(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await expect(card(page).getByRole("heading", { name: "Protéines en rabais" })).toBeVisible();
    const chicken = rowButton(page, "Poulet");
    await chicken.scrollIntoViewIfNeeded();
    // The real wording, not the design README's guesses.
    await expect(chicken).toContainText("Meilleure aubaine");
    await expect(rowButton(page, "Poisson")).toContainText("Faites des réserves");
    await expect(rowButton(page, "Tofu")).toContainText("Difficile à dire");
    await chicken.click();
    const cards = card(page).locator(".riso-protein-pcard");
    await expect(cards.first()).toContainText("50 % de rabais");
    // The product is named from the French half of the flyer's name.
    await cards.filter({ hasText: "Poitrines de poulet" }).click();
    const strip = card(page).locator(".riso-protein-detail");
    await expect(strip).toContainText("Poitrines de poulet");
    await expect(strip).toContainText("Prix courant");
    await expect(strip).toContainText("Moyenne du Québec");
    await expect(strip).toContainText("demain");
    await expect(strip.getByRole("button", { name: "+ Ajouter à la liste" })).toBeVisible();
    await expect(strip.getByRole("button", { name: "Voir dans Circulaires →" })).toBeVisible();
    expect(await fitProblems(page)).toEqual([]);

    await strip.getByRole("button", { name: "+ Ajouter à la liste" }).click();
    await expect(strip.getByRole("button", { name: "✓ Sur la liste" })).toBeVisible();
    expect(await fitProblems(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("proteins-phone-fr.png") });
  });
});

test.describe("Proteins on sale: loading, nothing to show and a failed load", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("while the deals load, quiet grey rows; then the rows", async ({ page }) => {
    await signUp(page).then(seed);
    await page.route(DEALS_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.reload();
    const loading = card(page).getByRole("status", { name: "Loading this week's flyers…" });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading.locator(".riso-protein-card.skeleton")).toHaveCount(3);
    await expect(card(page)).not.toContainText("No flyer deals loaded yet.");
    await expect(rowButton(page, "Chicken")).toBeVisible();
    await expect(loading).toHaveCount(0);
  });

  test("no flyer data at all is one calm line, with the Flyers link still there", async ({ page }) => {
    await signUp(page);
    await page.reload();
    await expect(card(page)).toContainText("No flyer deals loaded yet.");
    await expect(card(page).locator(".riso-protein-card")).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Flyers →" })).toBeVisible();
  });

  test("flyers with no protein on sale say so", async ({ page }) => {
    const userId = await signUp(page);
    await prisma.flyerDeal.create({
      data: { userId, store: "Metro", source: "Metro", category: "produce", item: "Bananas", matchName: "bananas", price: "$0.69/lb", unitPrice: 0.69, unitBasis: "lb", isCurrent: true, createdAt: new Date() },
    });
    await page.reload();
    await expect(card(page)).toContainText("No proteins on sale this week.");
    await expect(card(page).locator(".riso-protein-card")).toHaveCount(0);
  });

  test("a failed load says so and Try again loads them", async ({ page }) => {
    await signUp(page).then(seed);
    let fail = true;
    await page.route(DEALS_URL, (route) => (fail ? route.abort() : route.continue()));
    await page.reload();
    await expect(card(page)).toContainText("Couldn't load this week's flyers.");
    await expect(card(page)).not.toContainText("No flyer deals loaded yet.");
    await expect(card(page).locator(".riso-protein-card")).toHaveCount(0);
    fail = false;
    await card(page).getByRole("button", { name: "Try again" }).click();
    await expect(rowButton(page, "Chicken")).toBeVisible();
    await expect(card(page)).not.toContainText("Couldn't load");
  });

  test("in French the same lines", async ({ page }) => {
    await signUp(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await expect(card(page)).toContainText("Aucune aubaine de circulaire chargée pour l'instant.");
    await page.route(DEALS_URL, (route) => route.abort());
    await page.reload();
    await expect(card(page)).toContainText("Impossible de charger les circulaires de la semaine.");
    await expect(card(page).getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

async function seedAndLoad(page) {
  const userId = await signUp(page);
  await seed(userId);
  await page.reload();
  await expect(rowButton(page, "Chicken").or(rowButton(page, "Poulet"))).toBeVisible();
}

// Whether every button, pill and value in the card fits its box at 390 px (the
// French words are the long ones), and the page never scrolls sideways.
function fitProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const root = document.querySelector(".riso-home-proteins");
    const rootBox = root.getBoundingClientRect();
    for (const el of root.querySelectorAll("button, a, .riso-protein-off, .riso-protein-best, .riso-protein-verdict, .riso-protein-stat-cap, .riso-protein-stat-val, .riso-protein-pcard-name")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const name = el.getAttribute("aria-label") || el.textContent.trim();
      if (el.scrollWidth > el.clientWidth + 1) out.push(`"${name}" cuts its text`);
      if (r.left < rootBox.left - 1 || r.right > rootBox.right + 1) out.push(`"${name}" sticks out of the card`);
    }
    for (const el of root.querySelectorAll(".riso-protein-detail button")) {
      const parent = el.closest(".riso-protein-detail").getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.right > parent.right + 1) out.push(`"${el.textContent.trim()}" sticks out of the strip`);
    }
    if (document.documentElement.scrollWidth > 390) out.push("the page scrolls sideways");
    return out;
  });
}
