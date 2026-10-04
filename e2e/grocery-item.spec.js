import { expect, test } from "@playwright/test";
import { cancelAdd } from "./inventory-confirm.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The grocery item (design handoff: docs/design/grocery-item/README.md): one
// component drawn the same in By store, By aisle, By recipe and Store mode.
// Left to right: the checkbox, the name with its meta line under it, then the
// recipe quantity (read-only, with its unit), how many to buy (a plain number)
// and the remove ×. Every item in a view is the same height; no name is cut.

function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const LONG = "Extra virgin cold pressed olive oil from the Mediterranean, unfiltered";

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `grocery-item+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const recipes = [
    ["Tacos", [["ground beef", 350, "g"], ["tortillas", 8, null]]],
    ["Chili", [["ground beef", 400, "g"], ["black beans", 2, "can"]]],
    ["Salad", [[LONG, 3, "tbsp"], ["lemon", 2, null]]],
  ];
  for (const [i, [title, ingredients]] of recipes.entries()) {
    const r = await (
      await page.request.post("/api/recipes", {
        data: { title, baseServings: 2, ingredients: ingredients.map(([name, quantity, unit]) => ({ name, quantity, unit })) },
      })
    ).json();
    await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: nextMonday(), dayOfWeek: i, mealType: "dinner" } });
  }
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  const deal = (store, item, matchName, price, unitPrice, unitBasis, category) => ({
    userId, store, source: store, category, item, matchName, price, unitPrice, unitBasis, regularPrice: unitPrice * 1.4, isCurrent: true,
  });
  await prisma.flyerDeal.createMany({
    data: [
      deal("Metro", "Bœuf haché | Ground beef", "ground beef", "$8.99/lb", 8.99, "lb", "meat"),
      deal("Super C", "Citrons | Lemons", "lemon", "$1.99", 1.99, "each", "produce"),
    ],
  });
  await page.request.post("/api/grocery-extra-items", { data: { name: "Toilet paper", quantity: 2 } });
  await page.request.post("/api/grocery-sections", { data: { name: "Costco" } });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
  await expect(page.locator(".riso-row").first()).toBeVisible();
}

const check = (page, name) => page.getByRole("checkbox", { name: `Check off ${name}`, exact: true });
const row = (page, name) => page.locator(".riso-row").filter({ has: check(page, name) });
const heights = (locator) => locator.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("every view draws the same item, parts in the same order", async ({ page }) => {
    await setup(page);
    for (const view of [null, "By aisle", "By recipe"]) {
      if (view) await page.getByRole("button", { name: view, exact: true }).click();
      const beef = row(page, "Ground beef").first();
      await expect(beef).toBeVisible();
      await expect(beef.locator(".riso-row-recipes")).toContainText("Tacos");
      // Recipe quantity: read-only, with its unit. How many to buy: a number.
      await expect(beef.locator(".riso-row-need.wide")).toHaveText("750 g");
      await expect(beef.locator(".riso-row-qty")).toHaveValue("1");
      const order = await beef.evaluate((e) => {
        const left = (sel) => e.querySelector(sel).getBoundingClientRect().left;
        return [left(".riso-row-check-hit"), left(".riso-row-name"), left(".riso-row-need.wide"), left(".riso-row-qty"), left(".riso-row-delete")];
      });
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // The aisle and the store are not repeated on the row.
      await expect(beef.locator(".riso-row-sub, .riso-row-store, .riso-row-grip")).toHaveCount(0);
    }
  });

  test("the number is a round pill, and the sale tags line up in one column on the right", async ({ page }) => {
    await setup(page);
    const qty = await page.locator(".riso-row-qty").first().boundingBox();
    expect(Math.abs(qty.width - qty.height)).toBeLessThanOrEqual(1);
    expect(await page.locator(".riso-row-qty").first().evaluate((e) => getComputedStyle(e).borderRadius)).toBe("50%");
    const tags = page.locator(".riso-row-deal");
    await expect(tags).toHaveCount(2);
    const spots = await page.locator(".riso-row").evaluateAll((rows) =>
      rows
        .map((r) => ({ tag: r.querySelector(".riso-row-deal"), name: r.querySelector(".riso-row-name"), qty: r.querySelector(".riso-row-qty") }))
        .filter((x) => x.tag)
        .map((x) => ({ left: Math.round(x.tag.getBoundingClientRect().left), afterName: x.tag.getBoundingClientRect().left >= x.name.getBoundingClientRect().right, beforeQty: x.tag.getBoundingClientRect().right <= x.qty.getBoundingClientRect().left }))
    );
    expect(new Set(spots.map((x) => x.left)).size).toBe(1); // the same left edge on every row
    expect(spots.every((x) => x.afterName && x.beforeQty)).toBe(true);
    // The recipe quantity pills and the numbers line up too.
    const centers = await page.locator(".riso-row-need.wide").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.parentElement.getBoundingClientRect().left)))]);
    expect(centers).toHaveLength(1);
    const qtyLefts = await page.locator(".riso-row-qty").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(qtyLefts).toHaveLength(1);
  });

  test("a hand-added item shows only its name and its number", async ({ page }) => {
    await setup(page);
    const paper = row(page, "Toilet paper");
    await expect(paper.locator(".riso-row-qty")).toHaveValue("2");
    await expect(paper.locator(".riso-row-need")).toHaveCount(0);
    await expect(paper.locator(".riso-row-meta")).toHaveCount(0);
  });

  test("every row is the same height (68 or more), and the longest name is not cut", async ({ page }) => {
    await setup(page);
    for (const view of [null, "By aisle", "By recipe"]) {
      if (view) await page.getByRole("button", { name: view, exact: true }).click();
      const h = await heights(page.locator(".riso-row"));
      expect(h.length).toBeGreaterThanOrEqual(5);
      expect(new Set(h).size, h.join(" ")).toBe(1);
      expect(h[0]).toBeGreaterThanOrEqual(68);
      const cut = await page.locator(".riso-row-name").evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1));
      expect(cut).toBe(false);
    }
  });

  test("the whole row lights up under the pointer, and only the box checks it", async ({ page }) => {
    await setup(page);
    const beef = row(page, "Ground beef");
    const bg = () => beef.evaluate((e) => getComputedStyle(e).backgroundColor);
    const before = await bg();
    await beef.locator(".riso-row-main").hover();
    await expect.poll(bg).not.toBe(before);
    await beef.locator(".riso-row-main").click();
    await expect(check(page, "Ground beef")).toHaveAttribute("aria-checked", "false");
    await check(page, "Ground beef").click();
    await expect(check(page, "Ground beef")).toHaveAttribute("aria-checked", "true");
  });

  test("+ Inventory shows only on a checked row and opens the confirmation sheet first", async ({ page }) => {
    await setup(page);
    await expect(page.locator(".riso-row-toinv")).toHaveCount(0);
    await check(page, "Lemon").click();
    const button = row(page, "Lemon").locator(".riso-row-toinv");
    await expect(button).toHaveText("+ Inventory");
    await button.click();
    await expect(page.locator(".riso-confirm .riso-confirm-row")).toHaveCount(1);
    await cancelAdd(page);
    expect(await (await page.request.get("/api/pantry-inventory")).json()).toHaveLength(0);
    await expect(check(page, "Lemon")).toHaveAttribute("aria-checked", "true");
  });

  test("a store's × asks first, and only a store you made has one", async ({ page }) => {
    await setup(page);
    const groups = page.locator(".riso-group");
    const costco = groups.filter({ hasText: "Costco" });
    await expect(page.getByRole("button", { name: /^Remove the .* store$/ })).toHaveCount(1); // Costco's only
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Remove the Costco store" }).click();
    await expect(costco).toHaveCount(1); // said no: it stays
    page.once("dialog", (d) => {
      expect(d.message()).toContain("Costco");
      d.accept();
    });
    await page.getByRole("button", { name: "Remove the Costco store" }).click();
    await expect(costco).toHaveCount(0);
  });

  test("with reduced motion, nothing animates on a row", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    await check(page, "Lemon").click();
    const durations = await row(page, "Lemon").evaluate((e) => {
      const box = e.querySelector(".riso-row-check");
      return [getComputedStyle(e).transitionDuration, getComputedStyle(box).animationName];
    });
    expect(durations[0]).toMatch(/^0s/);
    expect(durations[1]).toBe("none");
  });

  test("the number is a plain number, and units stay in the recipe quantity", async ({ page }) => {
    await setup(page);
    const beans = row(page, "Black bean");
    await expect(beans.locator(".riso-row-need.wide")).toHaveText("2 cans");
    await expect(beans.locator(".riso-row-qty")).toHaveValue("2");
    await beans.locator(".riso-row-qty").fill("");
    await beans.locator(".riso-row-qty").pressSequentially("3 cans");
    await expect(beans.locator(".riso-row-qty")).toHaveValue("3");
    await page.keyboard.press("Enter");
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
    await expect(row(page, "Black bean").locator(".riso-row-qty")).toHaveValue("3");
    await expect(row(page, "Black bean").locator(".riso-row-need.wide")).toHaveText("2 cans");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("rows are 108 or more, all one height, the recipe quantity is under the name, and a checked row keeps its name", async ({ page }) => {
    await setup(page);
    const h = await heights(page.locator(".riso-row"));
    expect(new Set(h).size, h.join(" ")).toBe(1);
    expect(h[0]).toBeGreaterThanOrEqual(108);
    const beef = row(page, "Ground beef");
    await expect(beef.locator(".riso-row-need.wide")).toBeHidden();
    await expect(beef.locator(".riso-row-need.narrow")).toHaveText("750 g");
    const under = await beef.evaluate((e) => e.querySelector(".riso-row-need.narrow").getBoundingClientRect().top >= e.querySelector(".riso-row-name").getBoundingClientRect().bottom - 1);
    expect(under).toBe(true);

    await check(page, "Lemon").click();
    await expect(row(page, "Lemon").locator(".riso-row-toinv")).toBeVisible();
    const after = await heights(page.locator(".riso-row"));
    expect(new Set(after).size, after.join(" ")).toBe(1);
    const cut = await page.locator(".riso-row-name").evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1));
    expect(cut).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Tap targets are 44 px.
    for (const sel of [".riso-row-check-hit", ".riso-row-delete"]) {
      const box = await beef.locator(sel).boundingBox();
      expect(box.width, sel).toBeGreaterThanOrEqual(44);
      expect(box.height, sel).toBeGreaterThanOrEqual(44);
    }
  });

  test("on a phone the sale tag is narrow and sits just left of the number, on the same line", async ({ page }) => {
    await setup(page);
    await expect(page.locator(".riso-row-deal")).toHaveCount(2);
    const spots = await page.locator(".riso-row").evaluateAll((rows) =>
      rows
        .filter((r) => r.querySelector(".riso-row-deal"))
        .map((r) => {
          const tag = r.querySelector(".riso-row-deal").getBoundingClientRect();
          const qty = r.querySelector(".riso-row-qty").getBoundingClientRect();
          const name = r.querySelector(".riso-row-name").getBoundingClientRect();
          return {
            leftOfNumber: tag.right <= qty.left && qty.left - tag.right < 16,
            sameLine: Math.abs(tag.top + tag.height / 2 - (qty.top + qty.height / 2)) < 6,
            narrow: tag.width <= 100,
            afterName: tag.left >= name.right,
            rightEdge: Math.round(tag.right),
          };
        })
    );
    for (const x of spots) {
      expect(x.leftOfNumber).toBe(true);
      expect(x.sameLine).toBe(true);
      expect(x.narrow).toBe(true);
      expect(x.afterName).toBe(true);
    }
    expect(new Set(spots.map((x) => x.rightEdge)).size).toBe(1); // lined up
  });

  test("Store mode draws the same item at 120 px, and the whole row checks it", async ({ page }) => {
    await setup(page);
    await page.getByRole("button", { name: /I'm at the store/ }).click();
    const mode = page.getByRole("dialog", { name: "Store mode" });
    await expect(mode).toBeVisible();
    const rows = mode.locator(".store-mode-row");
    const h = await heights(rows);
    expect(h.length).toBeGreaterThanOrEqual(5);
    expect(new Set(h).size, h.join(" ")).toBe(1);
    expect(h[0]).toBeGreaterThanOrEqual(120);
    const beef = rows.filter({ has: page.locator(".store-mode-name", { hasText: /^Ground beef$/ }) });
    await expect(beef.locator(".store-mode-recipes")).toContainText("Tacos");
    await expect(beef.locator(".store-mode-need")).toHaveText("750 g");
    await expect(beef.locator(".store-mode-qty")).toHaveText("1");
    await expect(beef.locator(".riso-row-delete, .riso-row-toinv")).toHaveCount(0); // no × and no inventory button here
    // No sale tag here, and a checked row's box is pink in the dark theme.
    await expect(mode.locator(".store-mode-sale, .riso-row-deal")).toHaveCount(0);
    // The dark theme is dark all the way through: a dark row, light text, a dark number pill.
    const look = await beef.evaluate((e) => {
      const c = (sel) => getComputedStyle(e.querySelector(sel));
      return { row: getComputedStyle(e).backgroundColor, name: c(".store-mode-name").color, qty: c(".store-mode-qty").backgroundColor };
    });
    expect(look).toEqual({ row: "rgb(17, 17, 21)", name: "rgb(244, 241, 234)", qty: "rgb(21, 21, 27)" });
    await beef.click();
    await expect(beef).toHaveClass(/\bon\b/);
    const box = await beef.locator(".store-mode-check").evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopColor]);
    expect(box).toEqual(["rgb(255, 72, 176)", "rgb(255, 255, 255)"]); // pink, with a white border
    const cut = await mode.locator(".store-mode-name").evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1));
    expect(cut).toBe(false);
  });
});
