import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

// The Planner finder's results are photo cards (design:
// docs/design/riso-v2-planner-search-cards/): « MEAL · TIME » on the photo, the
// name over it, a round +, an info row (have/total, COMPLETE or N MISSING) and a
// thin bar; no pills or buttons. A recipe with nothing missing has the blue
// outline. The whole card opens the pop-out and the + still adds to a slot.

test.use({ viewport: { width: 1280, height: 1000 } });

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `searchcards+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const recipes = [
    ["Card Soup", ["chicken", "carrot", "celery"]],
    ["Card Toast", ["tomato", "cucumber"]],
    ["Card Plain", []],
  ];
  for (const [title, names] of recipes) {
    await page.request.post("/api/recipes", {
      data: { title, instructions: ["Cook it."], mealSlot: "dinner", prepTimeMinutes: 30, ingredients: names.map((name) => ({ name })) },
    });
  }
  for (const name of ["tomato", "cucumber", "chicken", "carrot"]) {
    await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge" } });
  }
  await page.reload();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator(".riso-planner-board, .pmb").first()).toBeVisible();
  await page.getByRole("button", { name: "Browse" }).click();
}

const card = (page, title) => page.locator(".fnd-card", { has: page.locator(".rpc-title", { hasText: title }) });

test("a result is a photo card: label, info row, bar, a blue outline when complete, no pills or buttons", async ({ page }) => {
  await setup(page);

  const soup = card(page, "Card Soup");
  await expect(soup.locator(".rpc-caption")).toHaveText(/^Supper · 30 MIN$/);
  await expect(soup.locator(".rpc-info > span")).toHaveText(["2/3", "1 missing"]);
  await expect(soup).toHaveCSS("border-top-color", "rgb(22, 24, 31)");
  const bar = await soup.locator(".rpc-bar").boundingBox();
  const fill = await soup.locator(".rpc-bar > span").boundingBox();
  expect(Math.round((fill.width / bar.width) * 100)).toBe(67); // 2 of 3

  const toast = card(page, "Card Toast");
  await expect(toast.locator(".rpc-info > span")).toHaveText(["2/2", "Complete"]);
  await expect(toast).toHaveCSS("border-top-color", "rgb(35, 35, 255)"); // blue: you already have everything
  await expect(toast).not.toHaveCSS("border-top-color", "rgb(16, 201, 92)"); // not the grocery-list green

  // A recipe with no ingredients says so and has no bar.
  await expect(card(page, "Card Plain").locator(".rpc-info")).toHaveText("no ingredients listed");
  await expect(card(page, "Card Plain").locator(".rpc-bar")).toHaveCount(0);

  // The Makeable card's pills and buttons are not on this card.
  await expect(page.locator(".fnd-card .mkc-pill, .fnd-card .mkc-btn, .fnd-card .mkc-panel")).toHaveCount(0);
  // Four across on a computer.
  const columns = await page.locator(".fnd-panel .fnd-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(4);
});

test("the whole card opens the pop-out, and the + adds to the next empty slot", async ({ page }) => {
  await setup(page);

  // The info row is part of the open button too.
  await card(page, "Card Soup").locator(".rpc-info").click();
  const popout = page.getByRole("dialog", { name: "Card Soup" });
  await expect(popout).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popout).toHaveCount(0);

  // The + opens the slot picker when no slot is chosen (the same as before).
  await card(page, "Card Toast").getByRole("button", { name: "Add Card Toast to the plan" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a slot" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: /^Add to / }).click();
  await expect(page.locator(".riso-planner-card-name", { hasText: "Card Toast" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("two across, photo 190px, and a + that has a 40px place to tap", async ({ page }) => {
    await setup(page);
    const columns = await page.locator(".fnd-panel .fnd-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(2);
    const soup = card(page, "Card Soup");
    await soup.scrollIntoViewIfNeeded();
    expect((await soup.locator(".rpc-photo").boundingBox()).height).toBe(190);
    const plus = soup.locator(".rpc-add");
    expect((await plus.boundingBox()).width).toBe(28);
    // The invisible tap area around it.
    const area = await plus.evaluate((el) => {
      const box = getComputedStyle(el, "::after");
      return { w: parseFloat(box.width), h: parseFloat(box.height) };
    });
    expect(area.w).toBeGreaterThanOrEqual(40);
    expect(area.h).toBeGreaterThanOrEqual(40);
  });
});
