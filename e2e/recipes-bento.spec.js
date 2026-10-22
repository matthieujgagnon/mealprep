import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { langSwitch } from "./account-menu.js";

// The Recipes page's Cookbook as a bento grid and Imported as its own section
// (design: docs/design/riso-v2-recipes-bento/). The 8-tile pattern, the first
// result always the big tile, the last incomplete group closed so there is no
// gap, the 1100 px switch to same-size tiles, two across on a phone, Imported as
// the plain cards under the Cookbook, the buttons that scroll to a section, and
// the French fit. (The sizes themselves are unit-tested in lib/bento.test.js.)

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `bento+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

// A plain gradient stands in for a recipe's real photo.
const photo = (n) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${(n * 47) % 360},55%,62%)'/><stop offset='1' stop-color='hsl(${(n * 47 + 40) % 360},60%,40%)'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/></svg>`
  )}`;
const MEALS = ["dinner", "lunch", "breakfast", "dinner", "dinner", "lunch", "dinner", "breakfast"];

async function makeRecipe(page, title, n, extra = {}) {
  const res = await page.request.post("/api/recipes", {
    data: {
      title,
      mealSlot: MEALS[n % MEALS.length],
      photoUrl: photo(n),
      prepTimeMinutes: 10 + n,
      cookTimeMinutes: 20,
      ingredients: [{ name: n % 3 === 0 ? "chicken thighs" : "rice" }],
      instructions: ["Cook it."],
      ...extra,
    },
  });
  return res.json();
}
const imported = async (page, title, n) => {
  const made = await makeRecipe(page, title, n);
  const res = await page.request.put(`/api/recipes/${made.id}`, { data: { inCookbook: false } });
  return res.json();
};
const cookbook = async (page, count, prefix = "Tile") => {
  for (let i = 1; i <= count; i++) await makeRecipe(page, `${prefix} ${i}`, i);
};

const goRecipes = async (page) => {
  await page.reload();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".riso-recipes")).toBeVisible();
};
const jumpButton = (page, name) => page.locator(".rv2-tabs").getByRole("button", { name });

// Where each tile of the Cookbook's grid sits, in grid cells (column, row, columns,
// rows) and the size of its title, and how many cells of the grid nothing fills.
async function bentoCells(page) {
  const found = await page.locator(".rv2-bento").evaluate((grid) => {
    const box = grid.getBoundingClientRect();
    const css = getComputedStyle(grid);
    const padL = parseFloat(css.paddingLeft);
    const padT = parseFloat(css.paddingTop);
    const gap = parseFloat(css.columnGap);
    const rowH = parseFloat(css.gridAutoRows);
    const columns = css.gridTemplateColumns.split(" ").length;
    const colW = (box.width - padL - parseFloat(css.paddingRight) - (columns - 1) * gap) / columns;
    const tiles = [...grid.children].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        col: Math.round((r.left - box.left - padL) / (colW + gap)),
        row: Math.round((r.top - box.top - padT) / (rowH + gap)),
        cols: Math.round((r.width + gap) / (colW + gap)),
        rows: Math.round((r.height + gap) / (rowH + gap)),
        title: getComputedStyle(el.querySelector(".rpc-title")).fontSize,
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    });
    return { columns, tiles };
  });
  const rows = Math.max(0, ...found.tiles.map((t) => t.row + t.rows));
  const filled = new Set();
  for (const t of found.tiles) for (let y = 0; y < t.rows; y++) for (let x = 0; x < t.cols; x++) filled.add(`${t.row + y},${t.col + x}`);
  return { ...found, shapes: found.tiles.map((t) => `${t.cols}x${t.rows}`), rows, empty: rows * found.columns - filled.size };
}

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 700 } });

  test("the Cookbook is the design's 8-tile pattern with no gap, titles sized by tile", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 8);
    await goRecipes(page);
    await expect(page.locator(".rv2-bento .rpc")).toHaveCount(8);
    const grid = await bentoCells(page);
    expect(grid.columns).toBe(4);
    expect(grid.shapes).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "2x1", "1x1", "3x1"]);
    expect(grid.tiles.map((t) => t.title)).toEqual(["34px", "18px", "18px", "26px", "26px", "26px", "18px", "30px"]);
    expect(grid.rows).toBe(4);
    expect(grid.empty).toBe(0);
    // The rows are 300 px and the gap 28 px: the big tile is 2 rows and a gap tall.
    expect(grid.tiles[0].height).toBe(2 * 300 + 28);
    expect(grid.tiles[1].height).toBe(300);
    expect(grid.tiles[0]).toMatchObject({ col: 0, row: 0 });
  });

  test("a tile has the meal, the protein and the time on top and the title at the bottom, with no meal-colour line", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 3);
    await goRecipes(page);
    const tile = page.locator(".rpc-bento", { hasText: "Tile 3" });
    await expect(tile.locator(".rpc-cap-meal")).toHaveText("Supper"); // the app's word, not "Dinner"
    await expect(tile.locator(".rpc-cap-protein")).toHaveText("Chicken"); // 3 uses chicken thighs
    await expect(tile.locator(".rpc-cap-time")).toHaveText("33 MIN");
    const lunch = page.locator(".rpc-bento", { hasText: "Tile 1" });
    await expect(lunch.locator(".rpc-cap-meal")).toHaveText("Lunch");
    await expect(lunch.locator(".rpc-cap-protein")).toHaveCount(0); // no protein, no protein word
    const breakfast = page.locator(".rpc-bento", { hasText: "Tile 2" });
    await expect(breakfast.locator(".rpc-cap-meal")).toHaveText("Breakfast");
    // The meal type is the caption's words only: no line in the meal's colour on any tile.
    await expect(page.locator(".rpc-line")).toHaveCount(0);
    // A tile opens the recipe card.
    await tile.click();
    await expect(page.getByRole("dialog", { name: "Tile 3" })).toBeVisible();
  });

  test("search re-flows the results through the pattern: the first is always the big tile, and no count leaves a gap", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 8);
    await goRecipes(page);
    const search = page.locator(".riso-recipes-searchbar input");
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await search.fill(Array.from({ length: n }, (_, i) => `Tile ${i + 1}`).join(", "));
      await expect(page.locator(".rv2-bento .rpc")).toHaveCount(n);
      const grid = await bentoCells(page);
      expect(grid.empty, `${n} results`).toBe(0);
      expect(grid.tiles[0].rows, `${n} results`).toBe(2);
      expect(grid.tiles[0].cols, `${n} results`).toBeGreaterThanOrEqual(2);
      expect(grid.tiles[0].title, `${n} results`).toBe("34px");
    }
    // The stretched ends, as agreed.
    await search.fill("Tile 1, Tile 2");
    expect((await bentoCells(page)).shapes).toEqual(["2x2", "2x2"]);
    await search.fill("Tile 1, Tile 2, Tile 3, Tile 4, Tile 5, Tile 6");
    expect((await bentoCells(page)).shapes).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "3x2"]);
  });

  test("Imported is its own section under the Cookbook, with its heading and count, as the plain same-size cards", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 3);
    await imported(page, "Imported A", 4);
    await imported(page, "Imported B", 5);
    await goRecipes(page);

    const cookbookSection = page.locator("#recipes-cookbook");
    const importedSection = page.locator("#recipes-imported");
    await expect(cookbookSection.getByRole("heading", { name: "Cookbook" })).toBeVisible();
    await expect(cookbookSection.locator(".rv2-section-head .rv2-tab-count")).toHaveText("3");
    await expect(importedSection.getByRole("heading", { name: "Imported" })).toBeVisible();
    await expect(importedSection.locator(".rv2-section-head .rv2-tab-count")).toHaveText("2");
    await expect(cookbookSection.locator(".rpc-title")).toHaveCount(3);
    await expect(importedSection.locator(".rpc-title")).toHaveCount(2);
    expect((await cookbookSection.boundingBox()).y).toBeLessThan((await importedSection.boundingBox()).y);
    expect((await cookbookSection.boundingBox()).y + (await cookbookSection.boundingBox()).height).toBeLessThanOrEqual((await importedSection.boundingBox()).y + 1);

    // Imported keeps today's card: no bento tile, every card the same 3:4.
    await expect(importedSection.locator(".rpc-bento")).toHaveCount(0);
    await expect(importedSection.locator(".rpc-grid")).toHaveCount(2);
    const sizes = await importedSection.locator(".rpc").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
    expect(new Set(sizes.map((s) => s.join("x"))).size).toBe(1);
    expect(Math.abs(sizes[0][1] / sizes[0][0] - 4 / 3)).toBeLessThan(0.02);
    // An imported card opens the recipe card too.
    await importedSection.locator(".rpc", { hasText: "Imported A" }).click();
    await expect(page.getByRole("dialog", { name: "Imported A" })).toBeVisible();
  });

  test("search and filters apply to both sections, and each says so when nothing is left", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 3, "Cook"); // Cook 1..3
    await imported(page, "Imported Cook", 4);
    await imported(page, "Imported Plain", 5);
    await goRecipes(page);
    await expect(page.locator(".rv2-count")).toHaveText("5 RECIPES");

    await page.locator(".riso-recipes-searchbar input").fill("cook");
    await expect(page.locator("#recipes-cookbook .rpc-title")).toHaveCount(3);
    await expect(page.locator("#recipes-imported .rpc-title")).toHaveText(["Imported Cook"]);
    await expect(page.locator(".rv2-count")).toHaveText("4 RECIPES MATCH");
    // Each section's own count follows the search; the buttons keep the totals.
    await expect(page.locator("#recipes-imported .rv2-section-head .rv2-tab-count")).toHaveText("1");
    await expect(jumpButton(page, /^Imported/)).toContainText("2");

    await page.locator(".riso-recipes-searchbar input").fill("plain");
    await expect(page.locator("#recipes-cookbook .riso-recipes-empty")).toHaveText("No recipes match these filters.");
    await expect(page.locator("#recipes-imported .rpc-title")).toHaveText(["Imported Plain"]);
  });

  test("the empty sections say what to do", async ({ page }) => {
    await signUp(page);
    await goRecipes(page);
    await expect(page.locator("#recipes-cookbook .riso-recipes-empty")).toHaveText("Nothing in your Cookbook yet. Add a recipe by hand, or move one here from Imported.");
    await expect(page.locator("#recipes-imported .riso-recipes-empty")).toHaveText("Nothing imported yet. Paste a link above to import a recipe.");

    await imported(page, "Only imported", 2);
    await goRecipes(page);
    await expect(page.locator("#recipes-cookbook .riso-recipes-empty")).toBeVisible();
    await expect(page.locator("#recipes-imported .rpc-title")).toHaveText(["Only imported"]);
    // The page opens on the Cookbook, even though only Imported has recipes: nothing jumps.
    await expect(jumpButton(page, /^Cookbook/)).toHaveAttribute("aria-current", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("the Imported button scrolls to its section and lights up, Cookbook scrolls back, and scrolling by hand follows", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 8);
    for (let i = 0; i < 8; i++) await imported(page, `Imported ${i + 1}`, i + 10);
    await goRecipes(page);
    const importedTop = () => page.locator("#recipes-imported").evaluate((el) => Math.round(el.getBoundingClientRect().top));

    await expect(jumpButton(page, /^Cookbook/)).toHaveAttribute("aria-current", "true");
    await expect(jumpButton(page, /^Imported/)).not.toHaveAttribute("aria-current", "true");
    expect(await importedTop()).toBeGreaterThan(700);

    await jumpButton(page, /^Imported/).click();
    await expect.poll(importedTop).toBeLessThan(40);
    await expect(jumpButton(page, /^Imported/)).toHaveAttribute("aria-current", "true");
    await expect(jumpButton(page, /^Cookbook/)).not.toHaveAttribute("aria-current", "true");

    await jumpButton(page, /^Cookbook/).click();
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#recipes-cookbook").getBoundingClientRect().top))).toBeLessThan(40);
    await expect(jumpButton(page, /^Cookbook/)).toHaveAttribute("aria-current", "true");

    // By hand: to the end of the page, then back to the top.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(jumpButton(page, /^Imported/)).toHaveAttribute("aria-current", "true");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(jumpButton(page, /^Cookbook/)).toHaveAttribute("aria-current", "true");
  });

  test("importing a link scrolls to Imported, where the new recipe is first", async ({ page }) => {
    await signUp(page);
    await cookbook(page, 8);
    for (let i = 1; i <= 7; i++) await imported(page, i === 1 ? "Imported old" : `Imported older ${i}`, 10 + i); // enough to scroll to
    await goRecipes(page);
    const fresh = await imported(page, "Imported fresh", 12); // the page does not know it yet
    await page.route("**/api/recipes/import", (route) => route.fulfill({ json: { ...fresh, createdAt: new Date(Date.now() + 60_000).toISOString() } }));
    await page.locator(".riso-recipes-searchbar input").fill("https://example.com/fresh");
    await page.getByRole("button", { name: "Import recipe" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported. Find it under Imported" })).toBeVisible();
    await expect(page.locator("#recipes-imported .rpc-title").first()).toHaveText("Imported fresh");
    await expect.poll(() => page.locator("#recipes-imported").evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(40);
    await expect(jumpButton(page, /^Imported/)).toHaveAttribute("aria-current", "true");
  });
});

test.describe("narrower than 1100 px", () => {
  test("the switch is at the design's 1100 px of window: 4 columns of mixed tiles at 1100, same-size tiles at 1099", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await signUp(page);
    await cookbook(page, 8);
    await goRecipes(page);
    expect((await bentoCells(page)).shapes).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "2x1", "1x1", "3x1"]);

    await page.setViewportSize({ width: 1099, height: 800 });
    const narrow = await bentoCells(page);
    expect(new Set(narrow.tiles.map((t) => `${t.width}x${t.height}`)).size).toBe(1);
    expect(narrow.tiles[0].height).toBe(340);
    expect(narrow.tiles.every((t) => t.title === "20px")).toBe(true);
    expect(narrow.tiles.every((t) => t.cols === 1 && t.rows === 1)).toBe(true);
  });

  test("on a tablet every tile is the same size, 340 px tall", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await signUp(page);
    await cookbook(page, 5);
    await goRecipes(page);
    const grid = await bentoCells(page);
    expect(grid.columns).toBeGreaterThanOrEqual(2);
    expect(new Set(grid.tiles.map((t) => `${t.width}x${t.height}`)).size).toBe(1);
    expect(grid.tiles[0].height).toBe(340);
  });

  test("on a phone the jump stops under the pinned header, not behind it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await cookbook(page, 8);
    for (let i = 1; i <= 8; i++) await imported(page, `Imported ${i}`, 10 + i);
    await goRecipes(page);
    expect(await page.locator(".app-header").evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
    await jumpButton(page, /^Imported/).click();
    // The heading's distance under the header: not behind it (0 or more), and close to it.
    const under = () =>
      page.evaluate(() => Math.round(document.querySelector("#recipes-imported .rv2-section-head").getBoundingClientRect().top - document.querySelector(".app-header").getBoundingClientRect().bottom));
    await expect.poll(under).toBeGreaterThanOrEqual(0);
    await expect.poll(under).toBeLessThan(30);
    await expect(jumpButton(page, /^Imported/)).toHaveAttribute("aria-current", "true");
  });

  test("on a phone, in French: two across like the Imported cards, 3:4, nothing cut off", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await cookbook(page, 5);
    await imported(page, "Importée 1", 20);
    await imported(page, "Importée 2", 21);
    await goRecipes(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    await expect(page.locator("#recipes-cookbook").getByRole("heading", { name: "Livre de recettes" })).toBeVisible();
    await expect(page.locator("#recipes-imported").getByRole("heading", { name: "Importées" })).toBeVisible();

    const grid = await bentoCells(page);
    expect(grid.columns).toBe(2);
    expect(new Set(grid.tiles.map((t) => `${t.width}x${t.height}`)).size).toBe(1);
    expect(Math.abs(grid.tiles[0].height / grid.tiles[0].width - 4 / 3)).toBeLessThan(0.02);
    expect(grid.tiles.every((t) => t.title === "16px")).toBe(true);
    const imp = await page.locator("#recipes-imported .rpc").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(imp[0]).toBe(grid.tiles[0].width); // the same two-across width as the Cookbook's

    // The French buttons and headings fit: no sideways scroll, nothing cut off.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const cut = await page
      .locator(".rv2-tabs button, .rv2-section-head, .rv2-chips button")
      .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
    expect(cut).toEqual([]);

    // Importées jumps to its section.
    await page.locator(".rv2-tabs").getByRole("button", { name: /^Importées/ }).click();
    await expect(page.locator(".rv2-tabs").getByRole("button", { name: /^Importées/ })).toHaveAttribute("aria-current", "true");
  });
});
