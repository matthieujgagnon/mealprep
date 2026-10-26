import { expect, mondayAfter, test } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { saveAnswered } from "./saves.js";

// The Grocery list respects Inventory: what your planned meals need that Inventory
// already holds is folded under the list as "Already at home" (« Déjà à la maison »),
// with "Put back on the list" for an item you need more of. It is the one matcher
// (lib/inventoryMatch.js), so salt and oil are ordinary ingredients: at home when they
// are in Inventory, on the list when they are not. Water from the tap is never listed.

test.use({ viewport: { width: 1280, height: 1000 } });

async function setup(page, inventory) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `at-home+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  const recipe = await (
    await page.request.post("/api/recipes", {
      data: {
        title: "Lemon pasta",
        baseServings: 2,
        ingredients: [
          { name: "spaghetti", quantity: 500, unit: "g" },
          { name: "lemon", quantity: 1 },
          { name: "olive oil", quantity: 2, unit: "tbsp" },
          { name: "salt and pepper, to taste" },
          { name: "water", quantity: 2, unit: "cup" },
        ],
      },
    })
  ).json();
  await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayAfter(1), dayOfWeek: 0, mealType: "dinner" } });
  for (const name of inventory) await page.request.post("/api/pantry-inventory", { data: { name, location: "pantry" } });
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  // A new account sees the "how it works" hint, with an example row of its own.
  await page.getByRole("button", { name: "Got it" }).click();
}

const rowNames = (page) => page.locator(".riso-row-name");
const strip = (page) => page.locator(".riso-grocery-athome");

test("what Inventory holds waits under Already at home; the rest stays on the list", async ({ page }) => {
  await setup(page, ["Olive oil", "Sea salt"]);

  // On the list: what is not in Inventory. Salt and pepper are two rows; water is never listed.
  await expect(rowNames(page)).toHaveText(["Lemon", "Pepper", "Spaghetti"]);

  // Folded to begin with, with how many.
  await expect(strip(page).locator(".riso-removed-label")).toHaveText("Already at home");
  await expect(strip(page).locator(".riso-removed-count")).toHaveText("2");
  await expect(strip(page).locator(".riso-removed-row")).toHaveCount(0);

  await strip(page).getByRole("button", { name: /Already at home/ }).click();
  await expect(strip(page).locator(".riso-removed-name")).toHaveText(["Olive oil", "Salt"]);
  // Each says which Inventory item covers it: "In your Inventory", or its other name.
  await expect(strip(page).locator(".riso-removed-meta")).toHaveText(["In your Inventory", "Sea salt"]);
  await expect(page.getByText("Water", { exact: true })).toHaveCount(0);

  // Put back on the list: the row joins the list, and stays after a reload. (It joins at once and the
  // save follows: wait for it before reloading.)
  const kept = saveAnswered(page, "PUT", "/api/grocery-item-overrides", '"key":"salt"');
  await strip(page).getByRole("button", { name: "Put Salt back on the list" }).click();
  await expect(rowNames(page)).toHaveText(["Lemon", "Pepper", "Salt", "Spaghetti"]);
  await expect(strip(page).locator(".riso-removed-name")).toHaveText(["Olive oil"]);
  await kept;
  await page.reload();
  await page.getByRole("button", { name: "Grocery", exact: true }).click();
  await expect(rowNames(page)).toHaveText(["Lemon", "Pepper", "Salt", "Spaghetti"]);
});

test("with nothing in Inventory, salt and oil are on the list like anything else", async ({ page }) => {
  await setup(page, []);
  await expect(rowNames(page)).toHaveText(["Lemon", "Olive oil", "Pepper", "Salt", "Spaghetti"]);
  await expect(strip(page)).toHaveCount(0);
});

test("a food added to Inventory moves off the list, and in French the section is « Déjà à la maison »", async ({ page }) => {
  await setup(page, ["Poivre"]);
  await expect(rowNames(page)).toHaveText(["Lemon", "Olive oil", "Salt", "Spaghetti"]);
  await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
  await page.reload();
  await page.getByRole("button", { name: "Épicerie", exact: true }).click();
  await expect(strip(page).locator(".riso-removed-label")).toHaveText("Déjà à la maison");
  await strip(page).getByRole("button", { name: /Déjà à la maison/ }).click();
  await expect(strip(page).locator(".riso-removed-putback")).toContainText("Remettre sur la liste");
  // The recipe's "pepper" reads « Poivre » in French, the same as the Inventory item that covers it,
  // so the line under it says where it is rather than saying the name twice.
  await expect(strip(page).locator(".riso-removed-name")).toHaveText(["Poivre"]);
  await expect(strip(page).locator(".riso-removed-meta")).toHaveText(["Dans votre inventaire"]);
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the open section and its « Remettre sur la liste » buttons fit, with no sideways scroll", async ({ page }) => {
    await setup(page, ["Olive oil", "Salt", "Vegetable oil"]);
    await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
    await page.reload();
    await page.getByRole("button", { name: "Épicerie", exact: true }).click();
    await strip(page).getByRole("button", { name: /Déjà à la maison/ }).click();
    await expect(strip(page).locator(".riso-removed-putback")).toHaveCount(2);

    const cramped = await strip(page).evaluate((box) =>
      [...box.querySelectorAll("button, .riso-removed-name, .riso-removed-meta")]
        .filter((e) => e.offsetParent && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > window.innerWidth + 1))
        .map((e) => e.textContent.trim())
    );
    expect(cramped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
