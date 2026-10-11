import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { PrismaClient } from "@prisma/client";
import { langSwitch } from "./account-menu.js";

const prisma = new PrismaClient();

// Home's Proteins on sale by general protein (the count and "See your recipes"
// cover every kind of it), and the recipes line under each grocery item.

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Next week's Monday: its meals are always still ahead, whatever day the test runs.
function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return dateKey(x);
}

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `polish-e+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

const recipe = async (page, title, ingredients, extra = {}) =>
  await (
    await page.request.post("/api/recipes", {
      data: { title, mealSlot: "dinner", baseServings: 2, ingredients: ingredients.map((name) => ({ name })), ...extra },
    })
  ).json();

test.describe("Proteins on sale, by general protein", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  async function seed(page) {
    const userId = await signUp(page);
    const row = (item, matchName, unitPrice, extra = {}) => ({
      userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
      unitPrice, unitBasis: "lb", isCurrent: true, createdAt: new Date(), ...extra,
    });
    await prisma.flyerDeal.createMany({
      data: [
        // Three kinds of chicken, three fish, two cuts of beef: one card each.
        row("Boneless chicken breasts", "boneless chicken breasts", 4.99, { regularPrice: 8.99 }),
        row("Chicken thighs", "chicken thighs", 2.49, { regularPrice: 4.99, store: "Super C" }),
        row("Chicken drumsticks", "chicken drumsticks", 1.99, { regularPrice: 3.49 }),
        row("Atlantic salmon", "atlantic salmon", 9.99, { regularPrice: 14.99 }),
        row("Cod fillets", "cod fillets", 8.99, { regularPrice: 12.99 }),
        row("Tilapia fillets", "tilapia fillets", 6.99, { regularPrice: 9.99 }),
        row("Lean ground beef", "lean ground beef", 5.97, { regularPrice: 7.99 }),
        row("Striploin steak", "striploin steak", 11.99, { regularPrice: 15.99 }),
      ],
    });
    // Recipes using different kinds of chicken, fish and beef - and none that don't.
    await recipe(page, "Curry", ["chicken thighs", "rice"]);
    await recipe(page, "BBQ legs", ["chicken drumsticks"]);
    await recipe(page, "Roast", ["whole chicken"]);
    await recipe(page, "Lemon chicken", ["boneless chicken breasts"]);
    await recipe(page, "Fish and chips", ["cod fillets", "potatoes"]);
    await recipe(page, "Salmon bowl", ["salmon"]);
    await recipe(page, "Chili", ["lean ground beef", "beans"]);
    await recipe(page, "Plain rice", ["rice"]);
    await page.reload();
  }

  test("one card per general protein, with its best deal, and the specific item under the name", async ({ page }) => {
    await seed(page);
    const block = page.locator(".riso-home-proteins");
    await expect(block.locator(".riso-protein-card")).toHaveCount(8);
    const names = await block.locator(".riso-protein-name").allInnerTexts();
    expect(names.sort()).toEqual(["Beef", "Chicken", "Fish", "Lamb", "Pork", "Seafood", "Tofu", "Turkey"].sort());

    // Chicken: the general name as the title and how many products are on
    // sale under it; opening it lists them, the thighs (the biggest saving) first.
    const chicken = block.getByRole("button", { name: /^Chicken:/ });
    await expect(chicken.locator(".riso-protein-name")).toHaveText("Chicken");
    await expect(chicken.locator(".riso-protein-count")).toHaveText("3 products");
    await chicken.click();
    const products = block.locator(".riso-protein-product");
    await expect(products).toHaveCount(3);
    await expect(products.first()).toContainText("Chicken thighs");
    await expect(products.first()).toContainText("Super C");
    await expect(products.first()).toContainText("50% off");
    await chicken.click();

    const fish = block.getByRole("button", { name: /^Fish:/ });
    await expect(fish.locator(".riso-protein-name")).toHaveText("Fish");
    await fish.click();
    await expect(block.locator(".riso-protein-product").first()).toContainText("Atlantic salmon");
    await fish.click();
    await expect(block.locator(".riso-protein-card.none", { hasText: "Pork" })).toContainText("No deal this week");
  });

  test("an open protein counts every recipe that uses any kind of it, and See your recipes opens a filter chip with those same recipes", async ({ page }) => {
    await seed(page);
    const block = page.locator(".riso-home-proteins");
    const link = page.locator(".riso-protein-recipes-link");

    for (const [kind, count, word, titles] of [
      ["Chicken", 4, "chicken", ["BBQ legs", "Curry", "Lemon chicken", "Roast"]],
      ["Fish", 2, "fish", ["Fish and chips", "Salmon bowl"]],
      ["Beef", 1, "beef", ["Chili"]],
    ]) {
      await block.getByRole("button", { name: new RegExp(`^${kind}:`) }).click();
      await expect(link).toHaveText(count === 1 ? `See your recipe with ${word} →` : `See your ${count} recipes with ${word} →`);
      await link.click();
      await expect(page.locator(".tab.active")).toHaveText("Recipes");
      // A chip with the protein's name, not a long search.
      await expect(page.locator(".riso-recipes-searchbar input")).toHaveValue("");
      await expect(page.getByRole("button", { name: /^PROTEIN/ })).toContainText(kind);
      // The same recipes, no more and no fewer.
      expect((await page.locator(".rpc-title").allInnerTexts()).sort()).toEqual([...titles].sort());
      await page.getByRole("button", { name: "Home", exact: true }).click();
    }
  });

  test("names, the link and the count are in French too", async ({ page }) => {
    await seed(page);
    await langSwitch(page).getByRole("button", { name: "Français" }).click();
    const block = page.locator(".riso-home-proteins");
    const names = await block.locator(".riso-protein-name").allInnerTexts();
    expect(names.sort()).toEqual(["Agneau", "Bœuf", "Dinde", "Fruits de mer", "Poisson", "Porc", "Poulet", "Tofu"].sort());
    await block.getByRole("button", { name: /^Poulet :/ }).click();
    await expect(page.locator(".riso-protein-recipes-link")).toHaveText("Voir vos 4 recettes avec du poulet →");
  });
});

test.describe("The recipes an item is for, in Grocery", () => {
  async function seed(page) {
    await signUp(page);
    const week = nextMonday();
    const meals = [
      ["Tacos", ["onion", "tomato"]],
      ["Chili with a really long name that goes on and on", ["onion", "carrot"]],
      ["Soup", ["onion"]],
    ];
    for (const [i, [title, ingredients]] of meals.entries()) {
      const r = await recipe(page, title, ingredients);
      await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: week, dayOfWeek: i, mealType: "dinner" } });
    }
    await page.request.post("/api/grocery-extra-items", { data: { name: "paper towels", quantity: 1 } });
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).first().click();
    await expect(page.locator(".riso-row").first()).toBeVisible();
  }
  // A row by its item's name, in either language.
  const rowFor = (page, name) => page.locator(".riso-row").filter({ has: page.locator(".riso-row-name", { hasText: new RegExp(`^${name}$`, "i") }) });

  test.describe("on a computer", () => {
    test.use({ viewport: { width: 1280, height: 1000 } });

    test("shows the recipes under each item, '+1' past two, and nothing for an item you added", async ({ page }) => {
      await seed(page);
      // Three recipes use onion: the first two and "+1".
      const onion = rowFor(page, "Onion").locator(".riso-row-recipes");
      await expect(onion.locator(".riso-row-recipes-names")).toHaveText("Tacos, Chili with a really long name that goes on and on");
      await expect(onion.locator(".riso-row-recipes-more")).toHaveText("+1");
      // One recipe: just its name; no "+".
      await expect(rowFor(page, "Tomato").locator(".riso-row-recipes")).toHaveText("Tacos");
      await expect(rowFor(page, "Carrot").locator(".riso-row-recipes-more")).toHaveCount(0);
      // A hand-added item shows nothing: no meta line at all.
      await expect(rowFor(page, "Paper towels").locator(".riso-row-recipes")).toHaveCount(0);
      // The recipes sit on the meta line under the item's name, left-aligned with it, in a
      // different (monospace) font and a lighter gray than the name.
      const rowOnion = rowFor(page, "Onion");
      const look = await rowOnion.evaluate((e) => {
        const name = e.querySelector(".riso-row-name");
        const rec = e.querySelector(".riso-row-recipes");
        const nb = name.getBoundingClientRect();
        const rb = rec.getBoundingClientRect();
        const lum = (c) => c.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
        return {
          underName: rb.top >= nb.bottom - 1,
          alignedLeft: Math.abs(rb.left - nb.left) < 2,
          recipesFont: getComputedStyle(rec).fontFamily,
          recipesStyle: ((c) => [c.fontFamily, c.fontSize, c.letterSpacing, c.color].join("|"))(getComputedStyle(rec)),
          nameFont: getComputedStyle(name).fontFamily,
          recipesSize: parseFloat(getComputedStyle(rec).fontSize),
          nameSize: parseFloat(getComputedStyle(name).fontSize),
          recipesLum: lum(getComputedStyle(rec).color),
          nameLum: lum(getComputedStyle(name).color),
        };
      });
      expect(look.underName).toBe(true);
      expect(look.alignedLeft).toBe(true);
      // The item's own name is never cut off because of the recipes.
      for (const n of ["Onion", "Carrot", "Tomato"]) {
        const nm = rowFor(page, n).locator(".riso-row-name");
        expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth + 2), n).toBe(true);
      }
      expect(look.recipesFont).not.toBe(look.nameFont);
      expect(look.recipesStyle).toContain("DM Mono"); // small monospace capitals
      expect(look.recipesSize).toBeLessThan(look.nameSize);
      expect(look.recipesLum).toBeGreaterThan(look.nameLum); // grayer (lighter) than the name
      // The tooltip lists them all.
      await expect(onion).toHaveAttribute("title", /Tacos, Chili with a really long name that goes on and on, Soup/);
    });

    test("every row and the number to buy are the same size, with or without recipes", async ({ page }) => {
      await seed(page);
      const sizes = await page.locator(".riso-row").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const qty = e.querySelector(".riso-row-qty").getBoundingClientRect();
          return `${Math.round(r.height)}x${Math.round(qty.width)}x${Math.round(qty.height)}`;
        })
      );
      expect(sizes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(sizes).size, sizes.join(" ")).toBe(1);
      expect(sizes[0].startsWith("68x")).toBe(true); // the desktop row height of the design
      // The "+1" is always fully there, and the names end in an ellipsis when short of room.
      const names = rowFor(page, "Onion").locator(".riso-row-recipes-names");
      expect(await names.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toBeVisible();
    });

    test("the recipes line is in the aisle and recipe views too", async ({ page }) => {
      await seed(page);
      await page.getByRole("button", { name: "By aisle" }).click();
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toHaveText("+1");
      await page.getByRole("button", { name: "By recipe" }).click();
      await expect(rowFor(page, "Tomato").first().locator(".riso-row-recipes")).toHaveText("Tacos");
    });
  });

  test.describe("on a phone, in French", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("rows keep one height, and Store mode rows too (name and number only)", async ({ page }) => {
      await seed(page);
      await langSwitch(page).getByRole("button", { name: "Français" }).click();
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toHaveText("+1");
      const heights = await page.locator(".riso-row").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(new Set(heights).size, heights.join(" ")).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      for (const n of ["Onion", "Carrot", "Tomato"]) {
        const nm = rowFor(page, n).locator(".riso-row-name");
        expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth + 2), n).toBe(true);
      }
      // The long recipe name is cut off, the "+1" is not.
      const names = rowFor(page, "Onion").locator(".riso-row-recipes-names");
      expect(await names.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
      await expect(rowFor(page, "Onion").locator(".riso-row-recipes-more")).toBeVisible();

      await page.getByRole("button", { name: /Je suis à l.épicerie/ }).click();
      const mode = page.getByRole("dialog", { name: "Mode magasin" });
      await expect(mode).toBeVisible();
      const rows = mode.locator(".store-mode-row");
      await expect(rows.first()).toBeVisible();
      const rowHeights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(rowHeights.length).toBeGreaterThanOrEqual(4);
      expect(new Set(rowHeights).size, rowHeights.join(" ")).toBe(1);
      const onionRow = mode.locator(".store-mode-row", { has: page.locator(".store-mode-name", { hasText: /^Onion$/ }) });
      expect(await onionRow.locator(".store-mode-name").evaluate((e) => e.scrollWidth <= e.clientWidth + 2)).toBe(true);
      // Only the name and the number: no recipes line, in Store mode.
      await expect(onionRow.locator(".store-mode-recipes")).toHaveCount(0);
      await expect(onionRow.locator(".store-mode-main > *")).toHaveCount(1);
      // An item you added is the same height as the rest.
      await expect(mode.locator(".store-mode-row", { hasText: "Paper towels" })).toHaveCount(1);
    });
  });
});

test.describe("Recipes protein filter: a sauce or stock is not the protein", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  async function seed(page) {
    await signUp(page);
    await recipe(page, "Pad thai", ["rice noodles", "fish sauce", "lime"]); // fish sauce only
    await recipe(page, "Fish curry", ["fish sauce", "cod fillets"]);
    await recipe(page, "Rice", ["rice", "chicken stock"]); // stock only
    await recipe(page, "Soupe", ["bouillon de poulet", "carottes"]);
    await recipe(page, "Roast chicken", ["whole chicken"]);
    await recipe(page, "Stir fry", ["oyster sauce", "broccoli"]);
    await recipe(page, "Bœuf et bouillon", ["bouillon de bœuf", "bœuf haché"]);
    await recipe(page, "Salad", ["lettuce"]);
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(page.locator(".rpc").first()).toBeVisible();
  }
  const names = async (page) => (await page.locator(".rpc-title").allInnerTexts()).sort();
  // The Protein menu in the toolbar.
  const chooseProtein = async (page, name) => {
    await page.getByRole("button", { name: /^PROTEIN/ }).click();
    await page.getByRole("option", { name, exact: true }).click();
  };

  test("filtering by Fish leaves out a recipe whose only fish is fish sauce", async ({ page }) => {
    await seed(page);
    await chooseProtein(page, "Fish");
    await expect(page.getByRole("button", { name: /^PROTEIN/ })).toContainText("Fish");
    expect(await names(page)).toEqual(["Fish curry"]);
  });

  test("Chicken and Beef leave out stock, broth and bouillon", async ({ page }) => {
    await seed(page);
    await chooseProtein(page, "Chicken");
    expect(await names(page)).toEqual(["Roast chicken"]);
    await chooseProtein(page, "Beef");
    expect(await names(page)).toEqual(["Bœuf et bouillon"]); // the real bœuf haché counts, the bouillon doesn't add to it
    await chooseProtein(page, "Seafood");
    expect(await names(page)).toEqual([]); // oyster sauce isn't seafood
  });

  test("the chip clears the filter, and the filter works with the other filters", async ({ page }) => {
    await seed(page);
    await chooseProtein(page, "Chicken");
    await expect(page.locator(".rpc-title")).toHaveCount(1);
    // "Any protein" in the menu, or Clear filters, takes it off.
    await chooseProtein(page, "Any protein");
    await expect(page.locator(".rpc-title")).toHaveCount(8);
    await chooseProtein(page, "Chicken");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(".rpc-title")).toHaveCount(8);
    // With a search too: both apply.
    await chooseProtein(page, "Fish");
    await page.locator(".riso-recipes-searchbar input").fill("pad");
    await expect(page.locator(".rpc-title")).toHaveCount(0);
  });

  test("Home and the filter always agree on the count", async ({ page }) => {
    await seed(page);
    // Only a protein with a real sale opens, so give each one a sale.
    const me = await (await page.request.get("/api/auth/me")).json();
    const deal = (item, unitPrice, regularPrice) => ({
      userId: me.user?.id ?? me.id, store: "Metro", source: "Metro", category: "protein", item, matchName: item.toLowerCase(),
      price: `$${unitPrice}/lb`, unitPrice, unitBasis: "lb", regularPrice, isCurrent: true, createdAt: new Date(),
    });
    await prisma.flyerDeal.createMany({
      data: [deal("Whole chicken", 2.49, 4.49), deal("Cod fillets", 8.99, 12.99), deal("Lean ground beef", 5.97, 8.99)],
    });
    await page.reload();
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    for (const kind of ["Chicken", "Fish", "Beef"]) {
      await chooseProtein(page, kind);
      const shown = await page.locator(".rpc-title").count();
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`^${kind}:`) }).click();
      await expect(page.locator(".riso-protein-recipes-link")).toContainText(shown === 1 ? "See your recipe with" : `See your ${shown} recipes with`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Recipes", exact: true }).click();
    }
  });

  test.describe("on a phone, in French", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the Protein menu fits, shows the choice, and clears it", async ({ page }) => {
      await seed(page);
      await langSwitch(page).getByRole("button", { name: "Français" }).click();
      const menu = page.getByRole("button", { name: /^PROTÉINE/ });
      await menu.click();
      await page.getByRole("option", { name: "Poisson", exact: true }).click();
      await expect(menu).toContainText("Poisson");
      const box = await menu.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await menu.click();
      await page.getByRole("option", { name: "Toute protéine", exact: true }).click();
      await expect(menu).toContainText("Toute protéine");
    });
  });
});
