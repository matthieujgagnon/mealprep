import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";
import { quebecDayIn } from "./quebec-day.js";

// Any shelf can be deleted, the five built-in ones too, and deleting is HIDING it: Delete shelf asks
// where its items go (a short sheet), the items show on that shelf, new items that would have gone
// there follow, Undo and "Bring back" (in + Add section) put everything back, and nothing is ever
// written onto an item or deleted from the database. Where an item is KEPT and its use-by date
// never change. The last shelf can't go.

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-shelf-del+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
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
const add = async (page, data) => (await page.request.post("/api/pantry-inventory", { data: { quantity: 1, unit: "unit", ...data } })).json();
const stock = async (page) => (await (await page.request.get("/api/pantry-inventory")).json());
const find = async (page, name) => (await stock(page)).find((i) => i.name === name);
// Every Inventory row as it is stored: what must not change when a shelf is deleted.
const rows = async (page) =>
  (await stock(page))
    .map(({ id, name, location, shelf, expiresAt, isLeftover, isPreparedMeal }) => ({ id, name, location, shelf, expiresAt, isLeftover, isPreparedMeal }))
    .sort((a, b) => a.id.localeCompare(b.id));
const layout = async (page) => (await page.request.get("/api/inventory-layout")).json();
const layoutRow = async (page, id) => (await layout(page)).find((r) => r.sectionId === id);
const shelf = (page, id) => page.locator(`.inv-shelf[data-section-id="${id}"]`);
const pencil = (card) => card.locator(".inv-shelf-edit:not(.inv-shelf-add)");
const deleteButton = (card) => card.getByRole("button", { name: /^(Delete shelf|Supprimer la tablette)$/ });
const order = (page) => page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.getAttribute("data-section-id")));
const toast = (page) => page.locator(".riso-toast");
const dialog = (page) => page.getByRole("dialog");
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Deletes a shelf the way Matt does: ✎, Delete shelf, then the sheet's own Delete shelf.
async function deleteVia(page, id, { pick } = {}) {
  await pencil(shelf(page, id)).click();
  await deleteButton(shelf(page, id)).click();
  const sheet = dialog(page);
  await expect(sheet).toBeVisible();
  if (pick) await sheet.getByLabel(/^(Move to|Déplacer vers)$/).selectOption({ label: pick });
  await sheet.getByRole("button", { name: /^(Delete shelf|Supprimer la tablette)$/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(shelf(page, id)).toHaveCount(0);
}

// + Add section, then Bring back for one deleted shelf.
async function bringBack(page, name) {
  await page.getByRole("button", { name: /^(\+ Add section|\+ Ajouter une section)$/ }).click();
  await dialog(page).getByRole("button", { name: new RegExp(`^(Bring back|Ramener) ${name}$|${name}`) }).click();
  await expect(dialog(page)).toHaveCount(0);
}

const SEED = {
  peas: { name: "Frozen peas", location: "freezer" },
  milk: { name: "Milk", location: "fridge" },
  rice: { name: "Rice", location: "pantry" },
  lasagna: { name: "Lasagna", location: "freezer", isPreparedMeal: true },
  chili: { name: "Chili", location: "fridge", isLeftover: true, unit: "portion", quantity: 2 },
};

// Each built-in shelf in turn: what its items do, where they go by default, and a new item that would
// have landed on it.
const CASES = [
  { id: "freezer", name: "Freezer", target: "fridge", targetName: "Fridge", moved: ["Frozen peas"], kept: { "Frozen peas": "Freezer" }, fresh: { name: "Frozen corn", location: "freezer" } },
  { id: "fridge", name: "Fridge", target: "pantry", targetName: "Pantry", moved: ["Milk"], kept: { Milk: "Fridge" }, fresh: { name: "Yogurt", location: "fridge" } },
  { id: "pantry", name: "Pantry", target: "fridge", targetName: "Fridge", moved: ["Rice"], kept: { Rice: "Pantry" }, fresh: { name: "Flour", location: "pantry" } },
  { id: "leftovers", name: "Leftovers", target: "fridge", targetName: "Fridge", moved: ["Chili"], kept: {}, fresh: { name: "Soup", location: "fridge", isLeftover: true, unit: "portion", quantity: 1 } },
  { id: "prepared", name: "Prepared meals", target: "freezer", targetName: "Freezer", moved: ["Lasagna"], kept: {}, fresh: { name: "Pizza", location: "freezer", isPreparedMeal: true } },
];

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  for (const c of CASES) {
    test(`${c.name}: delete it, its items and new ones show on ${c.targetName}, Undo and Bring back put it all back`, async ({ page }) => {
      test.setTimeout(90_000);
      await signUp(page);
      const useBy = quebecDayIn(30);
      for (const seed of Object.values(SEED)) await add(page, { expiresAt: useBy, ...seed });
      const garage = await (await page.request.post("/api/pantry-locations", { data: { name: "Spices" } })).json();
      const cumin = await add(page, { name: "Cumin", location: "pantry", expiresAt: useBy });
      await page.request.put(`/api/pantry-inventory/${cumin.id}`, { data: { shelf: garage.id } });
      await openInventory(page);
      const before = await rows(page);
      const places = await order(page);

      // Delete shelf asks where its items go, and starts on a sensible default.
      await pencil(shelf(page, c.id)).click();
      await expect(shelf(page, c.id).locator(".inv-shelf-controls-note")).toContainText("Delete shelf asks where its items go.");
      await deleteButton(shelf(page, c.id)).click();
      const sheet = dialog(page);
      await expect(sheet).toContainText(`Delete « ${c.name} »?`);
      await expect(sheet.getByLabel("Move to")).toHaveValue(c.target);
      await expect(sheet).toContainText("Where things are kept and their use-by dates don't change");
      // The picker never offers the shelf itself or Leftovers.
      const offered = await sheet.getByLabel("Move to").locator("option").allTextContents();
      expect(offered).not.toContain(c.name);
      expect(offered).not.toContain("Leftovers");
      // Cancel changes nothing.
      await sheet.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(shelf(page, c.id)).toHaveCount(1);
      expect(await layoutRow(page, c.id)).toBeUndefined();

      // (Delete shelf closes edit mode, so ✎ again.)
      await pencil(shelf(page, c.id)).click();
      await deleteButton(shelf(page, c.id)).click();
      await dialog(page).getByRole("button", { name: "Delete shelf" }).click();
      await expect(shelf(page, c.id)).toHaveCount(0);

      // The items show on the shelf they moved to, and a frozen one still says Freezer.
      await expect(toast(page)).toContainText(`Shelf « ${c.name} » deleted.`);
      await expect(toast(page)).toContainText(`« ${c.targetName} »`);
      for (const name of c.moved) await expect(shelf(page, c.target).getByText(name, { exact: true })).toBeVisible();
      for (const [name, storage] of Object.entries(c.kept)) {
        await expect(shelf(page, c.target).locator(".inv-tile", { hasText: name }).locator(".storage-label")).toHaveText(storage);
      }
      // Nothing is written onto any item: where it is kept, its shelf and its use-by day are exactly as they were.
      expect(await rows(page)).toEqual(before);
      expect(await layoutRow(page, c.id)).toMatchObject({ hidden: true, movedTo: c.target });

      // Undo: the shelf is back where it was, with its items.
      await toast(page).getByRole("button", { name: "Undo" }).click();
      await expect(shelf(page, c.id)).toHaveCount(1);
      expect(await order(page)).toEqual(places);
      for (const name of c.moved) await expect(shelf(page, c.id).getByText(name, { exact: true })).toBeVisible();
      // (The page shows the shelf at once and the server a moment later, so wait for the server.)
      await expect.poll(async () => layoutRow(page, c.id)).toMatchObject({ hidden: false, movedTo: null });
      expect(await rows(page)).toEqual(before);

      // Delete again, this time for good: after a reload it is still gone, and a new item that
      // would have landed on it follows (still only saying where it is kept).
      await deleteVia(page, c.id);
      const fresh = await add(page, { expiresAt: useBy, ...c.fresh });
      await openInventory(page);
      await expect(shelf(page, c.id)).toHaveCount(0);
      await expect(shelf(page, c.target).getByText(c.fresh.name, { exact: true })).toBeVisible();
      expect(await find(page, c.fresh.name)).toMatchObject({ location: c.fresh.location, shelf: null });
      expect((await find(page, c.fresh.name)).expiresAt.slice(0, 10)).toBe(useBy);

      // Nothing was deleted from the database: the layout row is still there with its place.
      const hidden = await layoutRow(page, c.id);
      expect(hidden).toMatchObject({ hidden: true, movedTo: c.target });
      expect(await prisma.inventorySectionLayout.count({ where: { sectionId: c.id, hidden: true } })).toBeGreaterThan(0);

      // + Add section lists it under Bring back, with what returns to it.
      await page.getByRole("button", { name: "+ Add section" }).click();
      await expect(dialog(page)).toContainText("Bring back a deleted shelf");
      await expect(dialog(page).locator(".riso-storagesheet-row", { hasText: c.name })).toContainText(/\d+ items? go(es)? back to it/);
      await dialog(page).getByRole("button", { name: `Bring back ${c.name}` }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(shelf(page, c.id)).toHaveCount(1);
      await expect(toast(page)).toContainText(`Shelf « ${c.name} » is back.`);
      expect(await order(page)).toEqual(places);
      // Its rule is back: the items, and the new one, are on it again.
      for (const name of [...c.moved, c.fresh.name]) await expect(shelf(page, c.id).getByText(name, { exact: true })).toBeVisible();
      // Every row is exactly as it was, and the new one is only what it was added as.
      const after = await rows(page);
      expect(after.filter((r) => r.id !== fresh.id)).toEqual(before);
      expect(after.find((r) => r.id === fresh.id)).toMatchObject({ name: c.fresh.name, location: c.fresh.location, shelf: null });
      expect(await layoutRow(page, c.id)).toMatchObject({ hidden: false, movedTo: null });
      // With nothing deleted, + Add section is the plain name field again.
      await page.getByRole("button", { name: "+ Add section" }).click();
      await expect(page.getByLabel("Shelf name")).toBeVisible();
    });
  }

  test("a shelf of Matt's own, with the picker: hidden, never deleted, and its items come back with it", async ({ page }) => {
    await signUp(page);
    const useBy = quebecDayIn(30);
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page.getByRole("button", { name: "+ Add section" }).click();
    await page.getByLabel("Shelf name").fill("Spices");
    await page.keyboard.press("Enter");
    await expect(page.locator(".inv-shelf", { hasText: "Spices" })).toBeVisible();
    const spices = (await (await page.request.get("/api/pantry-locations")).json()).find((l) => l.name === "Spices");
    const cumin = await add(page, { name: "Cumin", location: "pantry", expiresAt: useBy });
    const ice = await add(page, { name: "Ice cubes", location: "freezer", expiresAt: useBy });
    for (const item of [cumin, ice]) await page.request.put(`/api/pantry-inventory/${item.id}`, { data: { shelf: spices.id } });
    await openInventory(page);
    const before = await rows(page);

    await pencil(shelf(page, spices.id)).click();
    await deleteButton(shelf(page, spices.id)).click();
    // Its own shelf starts on Pantry; Matt picks Fridge instead.
    await expect(dialog(page).getByLabel("Move to")).toHaveValue("pantry");
    await expect(dialog(page)).toContainText("Its 2 items, and anything new that would go there, move to:");
    await dialog(page).getByLabel("Move to").selectOption({ label: "Fridge" });
    await dialog(page).getByRole("button", { name: "Delete shelf" }).click();
    await expect(shelf(page, spices.id)).toHaveCount(0);
    await expect(shelf(page, "fridge").getByText("Cumin", { exact: true })).toBeVisible();
    await expect(shelf(page, "fridge").locator(".inv-tile", { hasText: "Ice cubes" }).locator(".storage-label")).toHaveText("Freezer");
    await expect(shelf(page, "fridge").locator(".inv-tile", { hasText: "Cumin" }).locator(".storage-label")).toHaveText("Pantry");

    // The shelf row is still in the database, and so are its items, exactly as they were.
    expect(await prisma.pantryLocation.findUnique({ where: { id: spices.id } })).not.toBeNull();
    expect(await rows(page)).toEqual(before);
    expect(await layoutRow(page, spices.id)).toMatchObject({ hidden: true, movedTo: "fridge" });

    // A new shelf can't take its name: the sheet says to bring it back instead.
    await page.getByRole("button", { name: "+ Add section" }).click();
    await dialog(page).getByLabel("Shelf name").fill("spices");
    await expect(dialog(page)).toContainText("« Spices » is a deleted shelf: bring it back below instead.");
    await expect(dialog(page).getByRole("button", { name: "Add shelf" })).toBeDisabled();
    await dialog(page).getByRole("button", { name: "Bring back Spices" }).click();
    await expect(shelf(page, spices.id).getByText("Cumin", { exact: true })).toBeVisible();
    await expect(shelf(page, spices.id).getByText("Ice cubes", { exact: true })).toBeVisible();
    expect(await rows(page)).toEqual(before);
  });

  test("the last shelf that can hold ingredients can't be deleted: the sheet says so, and the server refuses too", async ({ page }) => {
    await signUp(page);
    await add(page, { name: "Rice", location: "pantry" });
    await openInventory(page);
    for (const id of ["fridge", "freezer", "prepared"]) await deleteVia(page, id);
    // Only Pantry (and Leftovers, which only holds leftovers) is left.
    await pencil(shelf(page, "pantry")).click();
    await deleteButton(shelf(page, "pantry")).click();
    const sheet = dialog(page);
    await expect(sheet).toContainText("This is your last shelf. Items need a shelf to sit on, so add another shelf first.");
    await expect(sheet.getByLabel("Move to")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Delete shelf" })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Got it" }).click();
    await expect(shelf(page, "pantry")).toHaveCount(1);
    expect(await layoutRow(page, "pantry")).not.toMatchObject({ hidden: true });

    // The server says no to the same thing from anywhere else (an old tab).
    const sections = (await layout(page)).map((r) => ({ sectionId: r.sectionId, size: r.size, hidden: r.hidden, movedTo: r.movedTo }));
    const refused = await page.request.put("/api/inventory-layout", { data: { sections: sections.map((s) => (s.sectionId === "pantry" ? { ...s, hidden: true, movedTo: null } : s)) } });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("lastShelf");
    // Adding a shelf of his own makes Pantry deletable again.
    await page.getByRole("button", { name: "+ Add section" }).click();
    await dialog(page).getByLabel("Shelf name").fill("Garage");
    await dialog(page).getByRole("button", { name: "Add shelf" }).click();
    await expect(page.locator(".inv-shelf", { hasText: "Garage" })).toBeVisible();
    await deleteVia(page, "pantry");
    await expect(page.locator(".inv-shelf", { hasText: "Garage" }).getByText("Rice", { exact: true })).toBeVisible();
  });

  test("a drop on the shelf an item shows on only because of a redirect never changes where it is kept", async ({ page }) => {
    await signUp(page);
    const useBy = quebecDayIn(25);
    await add(page, { name: "Frozen peas", location: "freezer", expiresAt: useBy });
    await openInventory(page);
    await deleteVia(page, "freezer");
    const peas = page.locator(".inv-tile", { hasText: "Frozen peas" });
    await expect(shelf(page, "fridge").getByText("Frozen peas", { exact: true })).toBeVisible();

    async function drag(to) {
      const from = await peas.boundingBox();
      const target = await to.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(250);
      await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.waitForTimeout(100);
      await page.mouse.up();
    }

    // Dropped on Fridge, where it already shows: nothing changes (it stays frozen, same use-by day).
    await drag(shelf(page, "fridge"));
    await page.waitForTimeout(500);
    const still = await find(page, "Frozen peas");
    expect(still).toMatchObject({ location: "freezer", shelf: null });
    expect(still.expiresAt.slice(0, 10)).toBe(useBy);
    await expect(shelf(page, "fridge").locator(".inv-tile", { hasText: "Frozen peas" }).locator(".storage-label")).toHaveText("Freezer");

    // The drag itself works: dropped on Pantry it is kept there now.
    await drag(shelf(page, "pantry"));
    await expect(shelf(page, "pantry").getByText("Frozen peas", { exact: true })).toBeVisible();
    expect(await find(page, "Frozen peas")).toMatchObject({ location: "pantry" });
  });

  test("the item pop-up still offers Fridge, Freezer and Pantry to keep something in, with Freezer deleted", async ({ page }) => {
    await signUp(page);
    await add(page, { name: "Chicken breast", location: "freezer", expiresAt: quebecDayIn(40) });
    await openInventory(page);
    await deleteVia(page, "freezer");
    // Add item: Stored in lists all three; the Shelf choice lists only the shelves that are left.
    await page.getByRole("button", { name: "+ Add item" }).click();
    const form = page.locator(".riso-itemform");
    await expect(form.locator(".riso-itemform-loc")).toHaveCount(3);
    await expect(form.locator(".riso-itemform-loc", { hasText: "Freezer" })).toBeVisible();
    const shelfOptions = await form.locator(".riso-itemform-shelf-select option").allTextContents();
    expect(shelfOptions).toEqual(["Fridge", "Pantry", "Prepared meals"]);
    await form.locator(".riso-itemform-loc", { hasText: "Freezer" }).click();
    await expect(form.locator(".riso-itemform-shelf-select")).toHaveValue("fridge");
    await expect(form.locator(".riso-itemform-shelf-hint")).toContainText("The « Freezer » shelf is deleted, so this shows on « Fridge ».");
  });
});

// French, on a phone: the sheet, the toast and the edit controls fit 390 px.
test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Supprimer la tablette: the edit controls, the sheet, the last-shelf sheet, Ramener and the toast fit 390 px", async ({ page }) => {
    test.setTimeout(90_000);
    await signUp(page, { french: true });
    await add(page, { name: "Pois surgelés", location: "freezer", expiresAt: quebecDayIn(30) });
    await add(page, { name: "Lait", location: "fridge", expiresAt: quebecDayIn(10) });
    await openInventory(page);

    const within = async (locator) => {
      const box = await locator.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(391);
    };
    const fitsInside = async (container) => {
      const outer = await container.boundingBox();
      for (const part of await container.locator("button, select, input, p, h2, h3, li").all()) {
        const box = await part.boundingBox();
        if (!box) continue;
        expect(box.x).toBeGreaterThanOrEqual(outer.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
      }
      expect(await container.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    };

    // A built-in shelf has Supprimer la tablette in its edit mode, and its line fits the shelf.
    const freezer = shelf(page, "freezer");
    await pencil(freezer).click();
    await expect(deleteButton(freezer)).toHaveText("Supprimer la tablette");
    await expect(freezer.locator(".inv-shelf-controls-note")).toContainText("Supprimer la tablette demande où vont ses articles.");
    await fitsInside(freezer.locator(".inv-shelf-controls"));
    await deleteButton(freezer).click();

    // The sheet, in French.
    const sheet = dialog(page);
    await expect(sheet).toContainText("Supprimer « Congélateur » ?");
    await expect(sheet).toContainText("Son 1 article, et tout nouvel article qui irait là, passe sur :");
    await expect(sheet.getByLabel("Déplacer vers")).toHaveValue("fridge");
    await expect(sheet).toContainText("ce qui est congelé dit toujours Congél.");
    await fitsInside(sheet);
    await within(sheet);
    await sheet.getByRole("button", { name: "Supprimer la tablette" }).click();
    await expect(shelf(page, "freezer")).toHaveCount(0);

    // The toast fits, and the item says it is still frozen.
    await expect(toast(page)).toContainText("Tablette « Congélateur » supprimée.");
    await within(toast(page));
    await expect(shelf(page, "fridge").locator(".inv-tile", { hasText: "Pois surgelés" }).locator(".storage-label")).toHaveText("Congél.");

    // Ramener: the Add a shelf sheet lists it with what returns.
    await page.getByRole("button", { name: "+ Ajouter une section" }).click();
    const add2 = dialog(page);
    await expect(add2).toContainText("Ramener une tablette supprimée");
    await expect(add2).toContainText("1 article y retourne");
    await fitsInside(add2);
    await within(add2);
    await add2.getByLabel("Nom de la tablette").fill("congélateur");
    await expect(add2).toContainText("« Congélateur » est une tablette supprimée : ramenez-la plus bas.");
    await fitsInside(add2);
    await add2.getByRole("button", { name: "Ramener « Congélateur »" }).click();
    await expect(shelf(page, "freezer")).toHaveCount(1);
    await expect(toast(page)).toContainText("Tablette « Congélateur » de retour.");

    // The last-shelf sheet, in French.
    for (const id of ["fridge", "freezer", "prepared"]) await deleteVia(page, id);
    await pencil(shelf(page, "pantry")).click();
    await deleteButton(shelf(page, "pantry")).click();
    const last = dialog(page);
    await expect(last).toContainText("C'est votre dernière tablette.");
    await fitsInside(last);
    await within(last);
    await last.getByRole("button", { name: "Compris" }).click();
  });
});
