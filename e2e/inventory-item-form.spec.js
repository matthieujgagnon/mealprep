import { expect, test } from "@playwright/test";
import { addInventoryItem, fillAddForm, itemForm, shelfCard } from "./inventory-form.js";

// The Inventory item form (design handoff: docs/design/inventory-item-form/): one form
// for "+ Add item" and for a tapped item card. Add keeps going until you're done; Edit
// works on a copy that only Save changes commits.

test.use({ viewport: { width: 1280, height: 1000 } });

async function setup(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `item-form+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
}

const inventory = async (page) => await (await page.request.get("/api/pantry-inventory")).json();
const toast = (page) => page.locator(".riso-toast");
const note = (page) => itemForm(page).locator(".riso-itemform-note");
const card = (page, name) => page.locator(".inv-card").filter({ hasText: name }).first();

test("Add and next adds the item, keeps the form open and the shelf, and lists it under Added this time", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  const form = itemForm(page);
  await expect(form.getByRole("heading", { name: "Add item." })).toBeVisible();
  await expect(form.getByRole("button", { name: "Add and next" })).toBeDisabled(); // no name yet
  await expect(form.getByRole("button", { name: "Add to inventory" })).toBeDisabled();

  await fillAddForm(page, "Lemons", { shelf: "pantry" });
  await form.getByLabel("Quantity", { exact: true }).fill("3");
  await form.getByLabel("Quantity", { exact: true }).press("Enter");
  await form.getByRole("button", { name: "Add and next" }).click();
  await expect(toast(page)).toHaveText("Lemons added to Pantry");

  // Still open: the name and amount are fresh, the shelf is kept.
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Item name")).toHaveValue("");
  await expect(form.getByLabel("Quantity", { exact: true })).toHaveValue("1");
  await expect(shelfCard(page, "pantry")).toHaveAttribute("aria-pressed", "true");
  await expect(form.locator(".riso-itemform-tray")).toContainText("Lemons");
  await expect(form.getByRole("button", { name: "Done" })).toBeVisible(); // Cancel became Done

  // Enter in the name field does the same.
  await form.getByLabel("Item name").fill("Limes");
  await form.getByLabel("Item name").press("Enter");
  await expect(form.locator(".riso-itemform-tray-row")).toHaveCount(2);

  // Undo takes the item back out.
  await form.locator(".riso-itemform-tray-row", { hasText: "Limes" }).getByRole("button", { name: "Undo" }).click();
  await expect(form.locator(".riso-itemform-tray-row")).toHaveCount(1);
  await expect.poll(async () => (await inventory(page)).map((i) => i.name)).toEqual(["Lemons"]);

  await form.getByRole("button", { name: "Done" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".inv-shelf", { hasText: "Pantry" }).getByText("Lemons")).toBeVisible();
  expect((await inventory(page))[0]).toMatchObject({ name: "Lemons", quantity: 3, location: "pantry" });
});

test("Add to inventory adds and closes; Cancel adds nothing", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  await fillAddForm(page, "Nope");
  await itemForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(itemForm(page)).toHaveCount(0);
  expect(await inventory(page)).toHaveLength(0);

  await addInventoryItem(page, "Yes", "freezer");
  await expect(toast(page)).toHaveText("Yes added to Freezer");
  expect(await inventory(page)).toHaveLength(1);
});

test("Recent chips offer what you added before, and tapping one fills the form", async ({ page }) => {
  await setup(page);
  await page.request.post("/api/pantry-inventory", { data: { name: "Greek yogurt", quantity: 500, unit: "g", location: "freezer" } });
  await page.request.post("/api/pantry-inventory", { data: { name: "Butter", quantity: 2, unit: "block", location: "fridge" } });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Add item" }).click();
  const form = itemForm(page);
  const chips = form.locator(".riso-itemform-recent .riso-itemform-chip");
  await expect(chips).toHaveText(["Butter", "Greek yogurt"]); // newest first
  await chips.filter({ hasText: "Greek yogurt" }).click();
  await expect(form.getByLabel("Item name")).toHaveValue("Greek yogurt");
  await expect(form.getByLabel("Quantity", { exact: true })).toHaveValue("500");
  await expect(form.getByLabel("Measure")).toHaveValue("g");
  await expect(shelfCard(page, "freezer")).toHaveAttribute("aria-pressed", "true");
  // They're only for an empty name.
  await expect(form.locator(".riso-itemform-recent")).toHaveCount(0);
});

test("USDA shelf life shows on each shelf card, and the use-by date follows the shelf", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  const form = itemForm(page);
  await fillAddForm(page, "chicken breast");
  await expect(shelfCard(page, "fridge").locator(".riso-itemform-loc-range")).not.toHaveText(/^\s*$/);
  await expect(shelfCard(page, "freezer").locator(".riso-itemform-loc-range")).not.toHaveText(/^\s*$/);
  await expect(note(page)).toContainText("USDA estimate for chicken breast in the fridge");

  // Moving it to the freezer moves the date, until you pick your own.
  const dateInput = form.getByLabel("Use-by date");
  const fridgeDate = await dateInput.inputValue();
  await shelfCard(page, "freezer").click();
  await expect(note(page)).toContainText("in the freezer");
  expect(await dateInput.inputValue()).not.toBe(fridgeDate);
  await form.getByRole("button", { name: "1 week" }).click();
  await expect(note(page)).toContainText("Your date.");
  const mine = await dateInput.inputValue();
  await shelfCard(page, "fridge").click();
  expect(await dateInput.inputValue()).toBe(mine); // your date stays
});

test("a food USDA doesn't know gets a rough guess, and says so", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  const form = itemForm(page);
  await expect(note(page)).toHaveText(/^Use by [A-Z][a-z]{2} \d+\.$/); // nothing typed: just the date
  await fillAddForm(page, "Xylo widget");
  await expect(note(page)).toContainText("A rough guess for the fridge: USDA has no data on Xylo widget.");
  await expect(form.getByLabel("Use-by date")).not.toHaveValue("");
  await shelfCard(page, "pantry").click();
  await expect(note(page)).toContainText("for the pantry");

  await form.getByRole("button", { name: "No date" }).click();
  await expect(note(page)).toHaveText("No date. It will sit at the end of the shelf.");
  await expect(form.locator(".riso-itemform-tag")).toHaveText("No date");
  await expect(form.locator(".riso-itemform-sorted")).toHaveText("Last on the shelf");
  await form.getByRole("button", { name: "2 weeks" }).click();
  await expect(form.locator(".riso-itemform-tag")).toHaveText("14 days");
  await form.getByLabel("Use-by date").fill("2020-01-01");
  await expect(note(page)).toContainText("Expired");
  await expect(form.locator(".riso-itemform-tag")).toHaveText("Expired");
});

test("the preview is the real card: name, amount, expiry line, and a photo from a link", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  const form = itemForm(page);
  const preview = form.locator(".riso-itemform-card");
  await expect(preview).toContainText("Item name"); // the placeholder
  await fillAddForm(page, "Sourdough");
  await form.getByLabel("Quantity", { exact: true }).fill("1/2");
  await form.getByLabel("Quantity", { exact: true }).press("Enter");
  await form.getByLabel("Measure").selectOption("loaf");
  await form.getByRole("button", { name: "3 days" }).click();
  await expect(preview).toContainText("Sourdough");
  await expect(preview.locator(".inv-card-qty")).toHaveText("½ loaf");
  await expect(preview.locator(".inv-card-line-fill.pink")).toHaveCount(1);
  expect((await preview.boundingBox()).height).toBe(88);

  // Only http(s) links.
  await form.getByLabel("Photo link").fill("javascript:alert(1)");
  await form.getByRole("button", { name: "Use", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("starts with http");
  await form.getByLabel("Photo link").fill("https://example.com/bread.png");
  await form.getByLabel("Photo link").press("Enter");
  await expect(preview.locator("img.inv-card-photo")).toHaveAttribute("src", "https://example.com/bread.png");
  await form.getByRole("button", { name: "Add to inventory" }).click();
  await expect(form).toHaveCount(0);
  expect((await inventory(page))[0]).toMatchObject({ name: "Sourdough", quantity: 0.5, unit: "loaf", imageUrl: "https://example.com/bread.png" });
});

test("a pantry staple can be marked while adding", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ Add item" }).click();
  await fillAddForm(page, "Salt");
  await itemForm(page).getByRole("button", { name: "☆ Mark as pantry staple" }).click();
  await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
  await expect(itemForm(page)).toHaveCount(0);
  await card(page, "Salt").click();
  await expect(itemForm(page).getByRole("button", { name: "★ Pantry staple" })).toBeVisible();
});

test("Edit: Done with it? has Used up, Tossed and (when it freezes) Freeze, and each shows a message", async ({ page }) => {
  await setup(page);
  for (const name of ["chicken breast", "Salt", "Rice"]) await page.request.post("/api/pantry-inventory", { data: { name, location: "fridge", quantity: 1 } });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await card(page, "Salt").click();
  const form = itemForm(page);
  await expect(form.locator(".riso-itemform-name")).toHaveValue("Salt");
  await expect(form.getByRole("button", { name: "Used up" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Tossed" })).toBeVisible();
  await form.getByRole("button", { name: "Used up" }).click();
  await expect(toast(page)).toHaveText("Salt marked as used up");
  await expect(form).toHaveCount(0);
  await expect(card(page, "Salt")).toHaveCount(0);

  await card(page, "Rice").click();
  await form.getByRole("button", { name: "Tossed" }).click();
  await expect(toast(page)).toHaveText("Rice tossed");
  await expect(card(page, "Rice")).toHaveCount(0);

  await card(page, "chicken breast").click();
  await form.getByRole("button", { name: "Freeze", exact: true }).click();
  await expect(toast(page)).toHaveText("chicken breast moved to the freezer");
  await expect(page.locator(".inv-shelf", { hasText: "Freezer" }).getByText("chicken breast")).toBeVisible();
  // Already frozen: no Freeze button.
  await card(page, "chicken breast").click();
  await expect(form.getByRole("button", { name: "Freeze", exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Remove (typo or duplicate)" }).click();
  await expect(toast(page)).toHaveText("chicken breast removed");
  expect(await inventory(page)).toHaveLength(0);
});

test("Edit: shelf, use-by date and amount save together with Save changes, and Cancel keeps the item as it was", async ({ page }) => {
  await setup(page);
  await page.request.post("/api/pantry-inventory", { data: { name: "chicken breast", location: "fridge", quantity: 2, unit: "lb" } });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await card(page, "chicken breast").click();
  const form = itemForm(page);
  // Only shelves that make sense for it.
  await expect(form.locator(".riso-itemform-loc-name")).toHaveText(["Fridge", "Freezer", "Pantry"].slice(0, await form.locator(".riso-itemform-loc").count()));

  await shelfCard(page, "freezer").click();
  await form.getByRole("button", { name: "3 months" }).click();
  await form.getByRole("button", { name: "More" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  expect((await inventory(page))[0]).toMatchObject({ location: "fridge", quantity: 2 });

  await card(page, "chicken breast").click();
  await shelfCard(page, "freezer").click();
  await form.getByRole("button", { name: "3 months" }).click();
  await form.getByRole("button", { name: "More" }).click();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(toast(page)).toHaveText("Changes saved");
  const saved = (await inventory(page))[0];
  expect(saved).toMatchObject({ location: "freezer", quantity: 3 });
  const days = Math.round((new Date(saved.expiresAt) - Date.now()) / 86400000);
  expect(days).toBeGreaterThanOrEqual(89);
  expect(days).toBeLessThanOrEqual(91);
});

test("the server lists recent foods and shelf life for every shelf", async ({ page }) => {
  await setup(page);
  await page.request.post("/api/pantry-inventory", { data: { name: "Milk", quantity: 1, unit: "l", location: "fridge" } });
  const recent = await (await page.request.get("/api/pantry-inventory/recent")).json();
  expect(recent[0]).toMatchObject({ name: "Milk", quantity: 1, unit: "l", location: "fridge" });
  const suggest = await (await page.request.get("/api/pantry-inventory/suggest?name=chicken%20breast")).json();
  expect(Object.keys(suggest.locations).sort()).toEqual(["fridge", "freezer", "pantry"].sort());
  expect(suggest.locations.fridge.defaultDays).toBeGreaterThan(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the form is a bottom sheet with the buttons always in reach and touch-size chips", async ({ page }) => {
    await setup(page);
    await page.getByRole("button", { name: "+ Add item" }).click();
    const sheet = page.getByRole("dialog", { name: "Add item" });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    // The footer stays in view without scrolling the sheet.
    const primary = await itemForm(page).getByRole("button", { name: "Add to inventory" }).boundingBox();
    expect(primary.y + primary.height).toBeLessThanOrEqual(844);
    await expect(itemForm(page).getByRole("button", { name: "Add to inventory" })).toBeInViewport();
    for (const label of ["Set to 1", "Set to ½"]) {
      const chip = await itemForm(page).getByRole("button", { name: label, exact: true }).boundingBox();
      expect(chip.height).toBeGreaterThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await fillAddForm(page, "Bananas");
    await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
    await expect(itemForm(page)).toHaveCount(0);
    await card(page, "Bananas").click();
    await expect(page.getByRole("dialog", { name: "Edit Bananas" })).toBeVisible();
    await itemForm(page).getByRole("button", { name: "Cancel" }).click();
    await expect(itemForm(page)).toHaveCount(0);
  });
});
