import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";
import { confirmAdd } from "./inventory-confirm.js";
import { itemForm, pickCompact } from "./inventory-form.js";
import { quebecDayIn } from "./quebec-day.js";

// Where an item is KEPT (Fridge, Freezer, Pantry: its use-by follows it) and which SHELF it shows
// on are two things. These cover what Matt asked for: a prepared meal goes on the Prepared meals
// shelf and still says Freezer or Fridge; moving an item to another shelf never changes where it
// is kept or its use-by date; the ink switch and the caps in the item pop-up; and the one-time list
// that confirms where the items left on shelves of their own are kept.

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-shelf+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  if (french) await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
  return email;
}

const openInventory = async (page) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(Inventory|Inventaire)$/ }).first().click();
  await expect(page.locator(".inv-shelf").first()).toBeVisible();
};
const add = async (page, data) => (await page.request.post("/api/pantry-inventory", { data })).json();
const stock = async (page) => (await (await page.request.get("/api/pantry-inventory")).json());
const find = async (page, name) => (await stock(page)).find((i) => i.name === name);
const shelf = (page, id) => page.locator(`.inv-shelf[data-section-id="${id}"]`);

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("a Freezer item put on a shelf of your own stays in the Freezer, keeps its use-by date, and says so", async ({ page }) => {
    await signUp(page);
    const garage = await (await page.request.post("/api/pantry-locations", { data: { name: "Garage" } })).json();
    const useBy = quebecDayIn(40);
    await add(page, { name: "Ice cream", quantity: 1, unit: "unit", location: "freezer", expiresAt: useBy });
    await openInventory(page);
    await expect(shelf(page, "freezer").getByText("Ice cream")).toBeVisible();
    // On the Freezer shelf the label would only repeat the shelf, so there is none.
    await expect(shelf(page, "freezer").locator(".storage-label")).toHaveCount(0);

    // From the pop-up: Stored in stays Freezer, Shelf becomes Garage; nothing is saved until Save changes.
    await page.getByText("Ice cream", { exact: true }).click();
    await expect(itemForm(page)).toBeVisible();
    await itemForm(page).locator(".riso-itemform-shelf-select").selectOption({ label: "Garage" });
    expect((await find(page, "Ice cream")).shelf).toBeNull();
    await itemForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(itemForm(page)).toHaveCount(0);

    const moved = await find(page, "Ice cream");
    expect(moved).toMatchObject({ location: "freezer", shelf: garage.id });
    expect(moved.expiresAt.slice(0, 10)).toBe(useBy);
    const tile = shelf(page, garage.id).locator(".inv-tile", { hasText: "Ice cream" });
    await expect(tile).toBeVisible();
    await expect(tile.locator(".storage-label")).toHaveText("Freezer");
    await expect(shelf(page, "freezer").getByText("Ice cream")).toHaveCount(0);

    // Changing where it is kept (Stored in) does not move it off the shelf that was chosen.
    await tile.click();
    await itemForm(page).locator(".riso-itemform-loc", { hasText: "Fridge" }).click();
    await itemForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(itemForm(page)).toHaveCount(0);
    expect(await find(page, "Ice cream")).toMatchObject({ location: "fridge", shelf: garage.id });
    await expect(shelf(page, garage.id).locator(".inv-tile", { hasText: "Ice cream" }).locator(".storage-label")).toHaveText("Fridge");
  });

  test("dragging an item to a shelf of your own changes only the shelf; Compact rows say where it is kept too", async ({ page }) => {
    await signUp(page);
    const garage = await (await page.request.post("/api/pantry-locations", { data: { name: "Garage" } })).json();
    const useBy = quebecDayIn(25);
    await add(page, { name: "Frozen peas", quantity: 1, unit: "unit", location: "freezer", expiresAt: useBy });
    await openInventory(page);

    const card = page.locator(".inv-tile", { hasText: "Frozen peas" });
    const from = await card.boundingBox();
    const to = await shelf(page, garage.id).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.waitForTimeout(100);
    await page.mouse.up();

    await expect(shelf(page, garage.id).getByText("Frozen peas")).toBeVisible();
    const moved = await find(page, "Frozen peas");
    expect(moved).toMatchObject({ location: "freezer", shelf: garage.id });
    expect(moved.expiresAt.slice(0, 10)).toBe(useBy);

    await pickCompact(page);
    await expect(shelf(page, garage.id).locator(".inv-row", { hasText: "Frozen peas" }).locator(".storage-label")).toHaveText("Freezer");
  });

  test("a new prepared meal lands on Prepared meals and still says where it is kept; the switch is ink when on, and the pop-up caps follow it", async ({ page }) => {
    await signUp(page);
    await openInventory(page);
    await expect(shelf(page, "prepared")).toBeVisible();

    await page.getByRole("button", { name: "+ Add item" }).click();
    await itemForm(page).getByLabel("Item name").fill("Frozen lasagna");
    await itemForm(page).locator(".riso-itemform-loc", { hasText: "Freezer" }).click();
    // Its name looks like a ready meal, so the switch starts on, in ink and not the blue of "you have it".
    const toggle = itemForm(page).getByRole("switch", { name: "Prepared meal" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(22, 24, 31)");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(22, 24, 31)");
    await toggle.click();
    await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
    await expect(itemForm(page)).toHaveCount(0);

    const lasagna = shelf(page, "prepared").locator(".inv-tile", { hasText: "Frozen lasagna" });
    await expect(lasagna).toBeVisible();
    await expect(lasagna.locator(".storage-label")).toHaveText("Freezer");
    expect(await find(page, "Frozen lasagna")).toMatchObject({ location: "freezer", isPreparedMeal: true, shelf: null });
    await expect(shelf(page, "freezer").getByText("Frozen lasagna")).toHaveCount(0);

    // The pop-up's category caps end with · PREPARED MEALS while the switch is on (display only: nothing saved).
    await lasagna.click();
    const caps = itemForm(page).locator(".riso-itemform-category");
    await expect(caps).toContainText(/· Prepared meals/i);
    expect(await caps.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
    const pop = itemForm(page).getByRole("switch", { name: "Prepared meal" });
    await pop.click();
    await expect(caps).not.toContainText(/Prepared meals/i);
    await pop.click();
    await expect(caps).toContainText(/· Prepared meals/i);
    expect((await find(page, "Frozen lasagna")).isPreparedMeal).toBe(true);
  });

  test("the Prepared meals shelf can be moved off: a prepared meal put on another shelf stays there", async ({ page }) => {
    await signUp(page);
    const garage = await (await page.request.post("/api/pantry-locations", { data: { name: "Garage" } })).json();
    await add(page, { name: "Perogies", quantity: 1, unit: "unit", location: "freezer", isPreparedMeal: true });
    await openInventory(page);
    await expect(shelf(page, "prepared").getByText("Perogies")).toBeVisible();
    await page.getByText("Perogies", { exact: true }).click();
    await itemForm(page).locator(".riso-itemform-shelf-select").selectOption({ label: "Garage" });
    await itemForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(shelf(page, garage.id).getByText("Perogies")).toBeVisible();
    expect(await find(page, "Perogies")).toMatchObject({ location: "freezer", shelf: garage.id });
    await page.reload();
    await expect(shelf(page, garage.id).getByText("Perogies")).toBeVisible();
    await expect(shelf(page, "prepared").getByText("Perogies")).toHaveCount(0);
  });

  test("the confirmation sheet: Shelf and Stored in are separate, and what is confirmed keeps both", async ({ page }) => {
    await signUp(page);
    const garage = await (await page.request.post("/api/pantry-locations", { data: { name: "Garage" } })).json();
    await page.request.post("/api/grocery-extra-items", { data: { name: "Pizza", quantity: 1 } });
    await page.request.post("/api/grocery-extra-items", { data: { name: "Kale", quantity: 1 } });
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).click();
    const box = (name) => page.locator(".riso-group").getByRole("checkbox", { name: `Check off ${name}`, exact: true });
    for (const name of ["Pizza", "Kale"]) {
      await box(name).click();
      await box(name).click(); // two taps: queued for Inventory
    }
    await page.getByRole("button", { name: "+ Add 2 to inventory" }).click();
    const sheet = page.locator(".riso-confirm");
    await expect(sheet.locator(".riso-confirm-row")).toHaveCount(2);

    // Kale: a shelf that is where it is kept has no "Stored in" of its own.
    await expect(sheet.getByLabel("Where Kale is kept")).toHaveCount(0);
    // Pizza: put on Prepared meals, kept in the Freezer.
    await sheet.getByLabel("Shelf for Pizza").selectOption({ label: "Prepared meals" });
    await sheet.getByLabel("Where Pizza is kept").selectOption("freezer");
    await expect(sheet.getByLabel("Where Pizza is kept")).toHaveValue("freezer");
    // And a shelf of their own for Kale, kept in the Fridge.
    await sheet.getByLabel("Shelf for Kale").selectOption({ label: "Garage" });
    await sheet.getByLabel("Where Kale is kept").selectOption("fridge");
    await confirmAdd(page);

    expect(await find(page, "Pizza")).toMatchObject({ location: "freezer", shelf: "prepared" });
    expect(await find(page, "Kale")).toMatchObject({ location: "fridge", shelf: garage.id });
  });

  test("the one-time list: guesses are marked, Not now changes nothing, Confirm sets only where it is kept and Undo puts it back, the old empty shelf is deleted by the person with Undo", async ({ page }) => {
    const email = await signUp(page);
    const user = await prisma.user.findUnique({ where: { email } });
    // What the old one-field setup left: items on a shelf of his own, with where they are kept lost.
    const garage = await prisma.pantryLocation.create({ data: { userId: user.id, name: "Garage", position: 0 } });
    const oldPrepared = await prisma.pantryLocation.create({ data: { userId: user.id, name: "Prepared meals", position: 1 } });
    const useBy = new Date(`${quebecDayIn(30)}T00:00:00.000Z`);
    const mk = (name) =>
      prisma.pantryInventoryItem.create({ data: { userId: user.id, name, core: name.toLowerCase(), quantity: 1, unit: "unit", location: garage.id, shelf: garage.id, expiresAt: useBy } });
    const pizza = await mk("Frozen pizza");
    const rice = await mk("Rice");
    await openInventory(page);

    const banner = page.locator(".riso-inv-storagebanner");
    await expect(banner).toContainText("2 items are on shelves of your own");
    await expect(banner).toContainText("Your old « Prepared meals » shelf is empty");
    // The items still show where the old setup put them.
    await expect(shelf(page, garage.id).getByText("Frozen pizza")).toBeVisible();

    await banner.getByRole("button", { name: "Review" }).click();
    const sheet = page.locator(".riso-storagesheet");
    await expect(sheet).toBeVisible();
    // Two guesses from the names, marked as guesses: pizza in the Freezer, rice in the Pantry.
    await expect(sheet.locator(".riso-storagesheet-guess")).toHaveCount(2);
    const pick = (name) => sheet.getByRole("group", { name: `Where ${name} is kept` });
    await expect(pick("Frozen pizza").getByRole("button", { name: "Freezer" })).toHaveAttribute("aria-pressed", "true");
    await expect(pick("Rice").getByRole("button", { name: "Pantry" })).toHaveAttribute("aria-pressed", "true");

    // Not now changes nothing, and the banner stays.
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toHaveCount(0);
    expect(await prisma.pantryInventoryItem.findUnique({ where: { id: pizza.id } })).toMatchObject({ location: garage.id, shelf: garage.id });
    await expect(banner).toBeVisible();

    // Confirm: only `location` changes. The shelf and the use-by date stay.
    await banner.getByRole("button", { name: "Review" }).click();
    await pick("Rice").getByRole("button", { name: "Fridge" }).click(); // the person changes a guess
    await sheet.getByRole("button", { name: "Confirm 2 items" }).click();
    await expect(page.getByText("2 items updated")).toBeVisible();
    const after = await prisma.pantryInventoryItem.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
    expect(after.map((i) => [i.name, i.location, i.shelf, i.expiresAt.toISOString()])).toEqual([
      ["Frozen pizza", "freezer", garage.id, useBy.toISOString()],
      ["Rice", "fridge", garage.id, useBy.toISOString()],
    ]);
    // They stay on the shelf of their own, now saying where they are kept.
    await expect(shelf(page, garage.id).locator(".inv-tile", { hasText: "Frozen pizza" }).locator(".storage-label")).toHaveText("Freezer");
    await expect(banner).not.toContainText("items are on shelves of your own");

    // Undo puts both back as they were, where they are kept unknown again.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await prisma.pantryInventoryItem.findUnique({ where: { id: rice.id } })).location).toBe(garage.id);
    expect(await prisma.pantryInventoryItem.findUnique({ where: { id: pizza.id } })).toMatchObject({ location: garage.id, shelf: garage.id });
    await expect(banner).toContainText("2 items are on shelves of your own");

    // The old empty « Prepared meals » shelf: the person deletes it from the same list (nothing deletes it for them).
    expect(await prisma.pantryLocation.findUnique({ where: { id: oldPrepared.id } })).not.toBeNull();
    await banner.getByRole("button", { name: "Review" }).click();
    await sheet.getByRole("button", { name: "Delete « Prepared meals »" }).click();
    await expect(page.getByText("Shelf « Prepared meals » deleted")).toBeVisible();
    expect(await prisma.pantryLocation.findUnique({ where: { id: oldPrepared.id } })).toBeNull();
    // Undo brings it back (it shares a built-in shelf's name, which a new shelf may not).
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => prisma.pantryLocation.count({ where: { userId: user.id, name: "Prepared meals" } })).toBe(1);
  });
});

// French, on a phone: the neutral label fits on a 3-across tile and on a Compact row, and the page
// does not scroll sideways.
test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("« Congél. », « Frigo » and « Garde-manger » fit on the tile and the row", async ({ page }) => {
    await signUp(page, { french: true });
    for (const [name, location] of [
      ["Lasagne surgelée", "freezer"],
      ["Pâté chinois", "fridge"],
      ["Soupe en conserve", "pantry"],
    ]) {
      await add(page, { name, quantity: 1, unit: "unit", location, isPreparedMeal: true });
    }
    await openInventory(page);
    const prepared = shelf(page, "prepared");
    await expect(prepared.locator(".inv-tile")).toHaveCount(3);
    await expect(prepared.locator(".storage-label")).toHaveText(["Frigo", "Congél.", "Garde-manger"]);

    const fits = async (selector) => {
      const items = await prepared.locator(selector).all();
      for (const item of items) {
        const outer = await item.boundingBox();
        const label = await item.locator(".storage-label").boundingBox();
        expect(label.x).toBeGreaterThanOrEqual(outer.x - 1);
        expect(label.x + label.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
        expect(label.y + label.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
        // Nothing inside is wider than the tile or the row.
        const overflow = await item.evaluate((el) => [...el.querySelectorAll("*")].filter((c) => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length);
        expect(overflow).toBe(0);
      }
    };
    // Tiles, three across.
    const tiles = await prepared.locator(".inv-tile").all();
    const ys = await Promise.all(tiles.map(async (t) => Math.round((await t.boundingBox()).y)));
    expect(new Set(ys).size).toBe(1);
    await fits(".inv-tile");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await pickCompact(page);
    await expect(prepared.locator(".inv-row")).toHaveCount(3);
    await fits(".inv-row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("the one-time list in French: « à confirmer », « Plus tard » and the buttons fit the screen", async ({ page }) => {
    const email = await signUp(page, { french: true });
    const user = await prisma.user.findUnique({ where: { email } });
    const garage = await prisma.pantryLocation.create({ data: { userId: user.id, name: "Garage", position: 0 } });
    await prisma.pantryInventoryItem.create({
      data: { userId: user.id, name: "Pizza surgelée", core: "pizza surgelee", quantity: 1, unit: "unit", location: garage.id, shelf: garage.id },
    });
    await openInventory(page);
    const banner = page.locator(".riso-inv-storagebanner");
    await expect(banner).toContainText("1 article est sur l'une de vos tablettes");
    await banner.getByRole("button", { name: "Voir" }).click();
    const sheet = page.locator(".riso-storagesheet");
    await expect(sheet.locator(".riso-storagesheet-guess")).toHaveText("à confirmer");
    await expect(sheet.getByRole("button", { name: "Plus tard" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Confirmer 1 article" })).toBeVisible();
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
