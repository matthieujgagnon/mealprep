import { expect, specNow, test } from "./spec-clock.js";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";
import { quebecDayIn } from "./quebec-day.js";

// A shelf's edit mode (✎): Delete shelf on every shelf (a shelf you added, a built-in one, the old
// copy), the "Old copy, empty" tag on Matt's old « Prepared meals » shelf (the section the
// shelf migration left beside the built-in one), the name field's focus (a computer only: on a phone
// its keyboard would cover the controls under it), and a long name that must not push the + and ✎
// out of a narrow shelf. Matt reported "I can't delete a shelf" and then asked for the built-in ones
// too: these keep every shelf deletable, on a phone and on a computer. (What deleting does, the sheet,
// Undo and Bring back are in inventory-shelf-delete.spec.js.)

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-shelf-edit+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
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
const find = async (page, name) => (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === name);
const makeShelf = async (page, name) => (await page.request.post("/api/pantry-locations", { data: { name } })).json();
const layoutRow = async (page, id) => (await (await page.request.get("/api/inventory-layout")).json()).find((r) => r.sectionId === id);
const shelf = (page, id) => page.locator(`.inv-shelf[data-section-id="${id}"]`);
const pencil = (card) => card.locator(".inv-shelf-edit:not(.inv-shelf-add)");
const doneEditing = (card) => card.locator(".inv-shelf-edit.on");
const deleteShelf = (card) => card.getByRole("button", { name: /^(Delete shelf|Supprimer la tablette)$/ });
const nameField = (card) => card.locator(".inv-shelf-name-input");

// Is the button inside its shelf, and is it the thing a tap on it would hit (not a neighbour's header on top)?
const reachable = async (button) => {
  await button.scrollIntoViewIfNeeded();
  return button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = el.closest(".inv-shelf").getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { inside: r.left >= s.left - 1 && r.right <= s.right + 1, onTop: hit === el || el.contains(hit) };
  });
};
const pageScrollsSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const SCREENS = [
  { name: "a computer", viewport: { width: 1280, height: 800 }, phone: false },
  { name: "a phone", viewport: { width: 390, height: 844 }, phone: true },
];

for (const screen of SCREENS) {
  test.describe(`on ${screen.name}`, () => {
    test.use({ viewport: screen.viewport });

    test("a shelf made with + Add section has Delete in edit mode, and deleting it hides it: its items show on the shelf picked and nothing is written to them", async ({ page }) => {
      await signUp(page);
      await openInventory(page);

      // Made the way Matt makes one.
      await page.getByRole("button", { name: "+ Add section" }).click();
      await page.getByLabel("Shelf name").fill("Garage");
      await page.keyboard.press("Enter");
      let garage;
      await expect
        .poll(async () => {
          garage = (await (await page.request.get("/api/pantry-locations")).json()).find((l) => l.name === "Garage");
          return !!garage;
        })
        .toBe(true);

      // A Freezer item put on it: only its shelf is the section, it is still kept in the Freezer.
      const useBy = quebecDayIn(40, specNow());
      const chicken = await add(page, { name: "Chicken breast", quantity: 1, unit: "unit", location: "freezer", expiresAt: useBy });
      await page.request.put(`/api/pantry-inventory/${chicken.id}`, { data: { shelf: garage.id } });
      await openInventory(page);
      await expect(shelf(page, garage.id).getByText("Chicken breast")).toBeVisible();

      await pencil(shelf(page, garage.id)).click();
      await expect(deleteShelf(shelf(page, garage.id))).toBeVisible();
      await expect(shelf(page, garage.id).locator(".inv-shelf-controls-note")).toContainText("Delete shelf asks where its items go.");
      await deleteShelf(shelf(page, garage.id)).click();
      // It asks where the items go, and starts on Pantry.
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByLabel("Move to")).toHaveValue("pantry");
      await sheet.getByRole("button", { name: "Delete shelf" }).click();
      await expect(shelf(page, garage.id)).toHaveCount(0);
      // The shelf goes from the screen at once and the save follows: wait until the server has it
      // before looking at the items or reloading.
      await expect.poll(async () => (await layoutRow(page, garage.id))?.hidden).toBe(true);

      // The item shows on Pantry, still kept in the Freezer (it says so), same use-by day, and nothing
      // is written onto it: its shelf is still the one it was put on.
      await expect(shelf(page, "pantry").getByText("Chicken breast")).toBeVisible();
      await expect(shelf(page, "pantry").locator(".inv-tile", { hasText: "Chicken breast" }).locator(".storage-label")).toHaveText("Freezer");
      expect(await find(page, "Chicken breast")).toMatchObject({ location: "freezer", shelf: garage.id });
      expect((await find(page, "Chicken breast")).expiresAt.slice(0, 10)).toBe(useBy);
      // It is still gone after a reload, and the shelf itself is still in the database (hidden, not deleted).
      await openInventory(page);
      await expect(shelf(page, garage.id)).toHaveCount(0);
      await expect(shelf(page, "pantry").getByText("Chicken breast")).toBeVisible();
      expect(await prisma.pantryLocation.findUnique({ where: { id: garage.id } })).not.toBeNull();
    });

    test(`tapping ✎ ${screen.phone ? "does not put the cursor in the name (its keyboard would cover Delete)" : "puts the cursor in the name"}, and Delete is there`, async ({ page }) => {
      await signUp(page);
      const garage = await makeShelf(page, "Garage");
      await openInventory(page);
      const card = shelf(page, garage.id);
      await pencil(card).click();
      await expect(nameField(card)).toBeVisible();
      await expect(deleteShelf(card)).toBeVisible();
      if (screen.phone) {
        await expect(nameField(card)).not.toBeFocused();
        // Renaming is still a tap on the name.
        await nameField(card).click();
        await expect(nameField(card)).toBeFocused();
      } else {
        await expect(nameField(card)).toBeFocused();
      }
    });

    test("Matt's migrated shelves: the old empty « Prepared meals » is tagged and can be deleted; the built-in one can be deleted too", async ({ page }) => {
      const email = await signUp(page);
      const user = await prisma.user.findUnique({ where: { email } });
      // What the shelf migration left: his old section, now empty, beside the built-in Prepared meals (with a meal on it).
      const old = await prisma.pantryLocation.create({ data: { userId: user.id, name: "Prepared meals", position: 0 } });
      await add(page, { name: "Frozen lasagna", quantity: 2, unit: "unit", location: "freezer", isPreparedMeal: true });
      await openInventory(page);

      // Two shelves with the same name, and only one of them is the old copy.
      await expect(page.locator(".inv-shelf-title", { hasText: "Prepared meals" })).toHaveCount(2);
      await expect(shelf(page, "prepared").getByText("Frozen lasagna")).toBeVisible();
      await expect(shelf(page, "prepared").locator(".inv-shelf-oldtag")).toHaveCount(0);
      await expect(shelf(page, old.id).locator(".inv-shelf-oldtag")).toHaveText("Old copy, empty");
      await expect(page.locator(".inv-shelf-oldtag")).toHaveCount(1);

      // The built-in one has Delete like any other shelf.
      await pencil(shelf(page, "prepared")).click();
      await expect(shelf(page, "prepared").locator(".inv-shelf-controls-note")).toContainText("Delete shelf asks where its items go.");
      await expect(deleteShelf(shelf(page, "prepared"))).toBeVisible();
      await doneEditing(shelf(page, "prepared")).click();

      // The old copy: Delete in edit mode. It hides the old copy (nothing is deleted) and leaves the
      // built-in shelf and its meal alone.
      await pencil(shelf(page, old.id)).click();
      await expect(deleteShelf(shelf(page, old.id))).toBeVisible();
      await deleteShelf(shelf(page, old.id)).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete shelf" }).click();
      await expect(shelf(page, old.id)).toHaveCount(0);
      await expect.poll(() => prisma.inventorySectionLayout.findFirst({ where: { userId: user.id, sectionId: old.id } })).toMatchObject({ hidden: true });
      expect(await prisma.pantryLocation.findUnique({ where: { id: old.id } })).not.toBeNull();
      await expect(page.locator(".inv-shelf-title", { hasText: "Prepared meals" })).toHaveCount(1);
      await expect(shelf(page, "prepared").getByText("Frozen lasagna")).toBeVisible();
      await expect(page.locator(".inv-shelf-oldtag")).toHaveCount(0);
    });

    test("a long shelf name does not push the + and ✎ out of a narrow shelf", async ({ page }) => {
      await signUp(page);
      const long = "A very long shelf name for the garage ok"; // 40 characters, the most a name takes
      const cellar = await makeShelf(page, long);
      // The narrowest shelf (3 of 12 columns, a quarter), first, with the half-width Fridge right beside it: a
      // button pushed past the narrow shelf's edge is under the Fridge's header.
      await page.request.put("/api/inventory-layout", {
        data: {
          sections: [
            { sectionId: cellar.id, size: "c12:3" },
            { sectionId: "fridge", size: "c12:6" },
            { sectionId: "freezer", size: "c12:6" },
            { sectionId: "pantry", size: "c12:12" },
            { sectionId: "leftovers", size: "c12:12" },
            { sectionId: "prepared", size: "c12:6" },
          ],
        },
      });
      await openInventory(page);
      const card = shelf(page, cellar.id);
      // The + and ✎ stay on the shelf, and a tap on them reaches them.
      for (const button of [card.locator(".inv-shelf-add"), pencil(card)]) {
        expect(await reachable(button)).toEqual({ inside: true, onTop: true });
      }
      expect(await pageScrollsSideways(page)).toBeLessThanOrEqual(0);
      // The name gives way with … and keeps its full text for a hover.
      const title = card.locator(".inv-shelf-title");
      await expect(title).toHaveAttribute("title", long);
      expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      // And ✎ still opens edit mode, with Delete.
      await pencil(card).click();
      await expect(deleteShelf(card)).toBeVisible();
    });
  });
}

// French, on a phone: the edit controls, the line under them and the tag fit the screen.
test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the edit controls, « Supprimer la tablette », its line and the tag fit 390 px", async ({ page }) => {
    const email = await signUp(page, { french: true });
    const user = await prisma.user.findUnique({ where: { email } });
    const garage = await makeShelf(page, "Garage");
    const old = await prisma.pantryLocation.create({ data: { userId: user.id, name: "Prepared meals", position: 1 } });
    await add(page, { name: "Lasagne surgelée", quantity: 2, unit: "unit", location: "freezer", isPreparedMeal: true });
    await openInventory(page);

    const fits = async (card) => {
      const outer = await card.boundingBox();
      // Every button, the line under them and the tag are inside the shelf.
      for (const part of await card.locator(".inv-shelf-controls button, .inv-shelf-controls-note, .inv-shelf-oldtag, .inv-shelf-header > *").all()) {
        const box = await part.boundingBox();
        if (!box) continue;
        expect(box.x).toBeGreaterThanOrEqual(outer.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
      }
      // (the controls are only there in edit mode)
      const controls = card.locator(".inv-shelf-controls");
      if (await controls.count()) expect(await controls.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await pageScrollsSideways(page)).toBeLessThanOrEqual(0);
    };

    // A shelf you added: Pleine largeur, Moitié, Tiers, Hauteur auto and « Supprimer la tablette ».
    const own = shelf(page, garage.id);
    await pencil(own).click();
    await expect(deleteShelf(own)).toHaveText("Supprimer la tablette");
    await expect(deleteShelf(own)).toBeVisible();
    await expect(own.locator(".inv-shelf-controls-note")).toContainText("Supprimer la tablette demande où vont ses articles.");
    await fits(own);
    await doneEditing(own).click();

    // The old copy: its tag, and Delete in edit mode.
    const copy = shelf(page, old.id);
    await expect(copy.locator(".inv-shelf-oldtag")).toHaveText("Ancienne copie, vide");
    await fits(copy);
    await pencil(copy).click();
    await expect(deleteShelf(copy)).toBeVisible();
    await fits(copy);
    await doneEditing(copy).click();

    // The built-in one has it too, with the same line.
    const builtIn = shelf(page, "prepared");
    await pencil(builtIn).click();
    await expect(builtIn.locator(".inv-shelf-controls-note")).toContainText("Supprimer la tablette demande où vont ses articles.");
    await expect(deleteShelf(builtIn)).toHaveText("Supprimer la tablette");
    await fits(builtIn);
  });
});
