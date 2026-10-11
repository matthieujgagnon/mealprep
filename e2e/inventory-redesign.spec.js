import { expect, test } from "@playwright/test";
import { addInventoryItem, fillAddForm, itemForm, shelfCard } from "./inventory-form.js";

// Covers the shelves + edit panel + select-and-act Inventory redesign:
// items grouped into Fridge/Freezer/Pantry columns, an edit panel opened by
// clicking a card, and the floating action bar's bulk actions.

function uniqueEmail() {
  return `inv-redesign+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
}

const addItem = (page, name, shelf) => addInventoryItem(page, name, shelf);

test("items land on the right shelf and clicking one opens the edit panel", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Shrimp", "fridge");
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp")).toBeVisible();

  await page.getByText("Shrimp", { exact: true }).click();
  await expect(itemForm(page)).toBeVisible();
  await expect(itemForm(page).locator(".riso-itemform-name")).toHaveValue("Shrimp");
  await expect(itemForm(page).locator(".riso-itemform-loc").first()).toBeVisible();
});

test("a shelf's + adds an item straight to that shelf", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await page.getByRole("button", { name: "Add an item to Freezer" }).click();
  await expect(shelfCard(page, "freezer")).toHaveAttribute("aria-pressed", "true");
  await fillAddForm(page, "Frozen peas");
  await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
  await expect(itemForm(page)).toHaveCount(0);
  await expect(page.locator(".inv-shelf", { hasText: "Freezer" }).getByText("Frozen peas")).toBeVisible();

  // The toolbar's + Add item still starts in the fridge.
  await page.getByRole("button", { name: "+ Add item" }).click();
  await expect(shelfCard(page, "fridge")).toHaveAttribute("aria-pressed", "true");
});

test("the form's amount takes fractions and has quick-pick chips, and nothing saves until Save changes", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await addItem(page, "Olive oil", "pantry");
  await page.getByText("Olive oil", { exact: true }).click();
  const form = itemForm(page);
  const qty = form.getByLabel("Quantity", { exact: true });

  await qty.fill("1 1/2");
  await qty.press("Enter");
  await expect(qty).toHaveValue("1 ½");
  await qty.fill("¼");
  await qty.press("Enter");
  await expect(qty).toHaveValue("¼");
  // Nonsense goes back to the last amount.
  await qty.fill("lots");
  await qty.press("Enter");
  await expect(qty).toHaveValue("¼");

  // The quick chips set the amount; the + and − step it.
  await form.getByRole("button", { name: "Set to ½" }).click();
  await expect(qty).toHaveValue("½");
  await form.getByRole("button", { name: "More" }).click();
  await expect(qty).toHaveValue("1 ½");
  await form.getByRole("button", { name: "Set to 1" }).click();
  await expect(qty).toHaveValue("1");

  // Nothing has been saved yet: Cancel leaves the item as it was.
  await form.getByRole("button", { name: "Set to ¾" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(itemForm(page)).toHaveCount(0);
  await expect(page.locator(".inv-card", { hasText: "Olive oil" }).locator(".inv-card-qty")).toHaveText("1");

  // Save changes keeps it.
  await page.getByText("Olive oil", { exact: true }).click();
  await itemForm(page).getByRole("button", { name: "Set to ¾" }).click();
  await itemForm(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".riso-toast")).toHaveText("Changes saved");
  await expect(page.locator(".inv-card", { hasText: "Olive oil" }).locator(".inv-card-qty")).toHaveText("0.75");
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".inv-card", { hasText: "Olive oil" }).locator(".inv-card-qty")).toHaveText("0.75");
});

test("the item name in the form can be renamed, and saves with Save changes", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Shrimp", "fridge");
  await page.getByText("Shrimp", { exact: true }).click();
  const nameInput = itemForm(page).locator(".riso-itemform-name");
  await expect(nameInput).toHaveValue("Shrimp");

  await nameInput.fill("Shrimp, peeled");
  await itemForm(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp, peeled")).toBeVisible();

  // Persists after a reload, confirming it actually saved server-side.
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp, peeled")).toBeVisible();
});

test("selecting items shows the floating action bar, and Used up removes them", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Rice", "pantry");
  await expect(page.getByText("Rice", { exact: true })).toBeVisible();

  await expect(page.locator(".inv-action-bar")).toHaveCount(0);
  await page.locator(".inv-card-check").first().click();
  await expect(page.locator(".inv-action-bar")).toBeVisible();
  await expect(page.locator(".inv-action-count")).toHaveText("1 selected");

  await page.getByRole("button", { name: "Used up" }).click();
  await expect(page.locator(".inv-action-bar")).toHaveCount(0);
  await expect(page.locator(".inv-card")).toHaveCount(0);
});

test("custom sections can be added, used, and removed (items fall back to Pantry)", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  // A shelf is addable from the round + beside the shelf pill (outside it), even with zero items.
  await expect(page.locator(".riso-inv-shelf-switch").getByRole("button", { name: "Add a shelf" })).toHaveCount(0);
  const pill = await page.locator(".riso-inv-shelf-switch").boundingBox();
  const plus = await page.getByRole("button", { name: "Add a shelf" }).boundingBox();
  expect(plus.x).toBeGreaterThanOrEqual(pill.x + pill.width); // to the right of the pill
  expect(pill.width).toBeGreaterThan(1000); // the full width less the round +, on a computer too
  await page.getByRole("button", { name: "Add a shelf" }).click();
  await page.getByLabel("Shelf name").fill("Garage Freezer");
  await page.keyboard.press("Enter");
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" })).toBeVisible();
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" }).locator(".inv-shelf-empty")).toHaveText("Drop items here");

  // The new section shows up as a location option on the add form itself.
  // Custom location ids are server-generated, not a fixed slug - select by
  // visible label instead of guessing the id.
  await addItem(page, "Elk", "Garage Freezer");

  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" }).getByText("Elk")).toBeVisible();

  await page.getByRole("button", { name: 'Edit the "Garage Freezer" section' }).click();
  await page.getByRole("button", { name: "Delete shelf" }).click();
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" })).toHaveCount(0);
  await expect(page.locator(".inv-shelf", { hasText: "Pantry" }).getByText("Elk")).toBeVisible();
});

test("sections can be renamed, dragged to move and resized, and the layout is saved", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const order = () => page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await expect.poll(order).toEqual(["Fridge section", "Freezer section", "Pantry section", "Leftovers section"]);
  // No arrow or size buttons any more.
  await expect(page.getByRole("button", { name: /Move section earlier|Width 1\/3/ })).toHaveCount(0);

  // Rename a built-in section.
  await page.getByRole("button", { name: 'Edit the "Fridge" section' }).click();
  await page.getByLabel("Section name").fill("Kitchen fridge");
  await page.getByRole("button", { name: 'Done editing the "Fridge" section' }).click();
  // (A shelf being edited shows its name in an input, so find it by its label.)
  const fridge = page.getByRole("region", { name: "Kitchen fridge section" });
  await expect(fridge).toBeVisible();

  // Whole columns of the 12-column grid.
  const grid = await page.locator(".inv-shelves").boundingBox();
  const col = (grid.width - 20 * 11) / 12;
  const columns = async () => Math.round(((await fridge.boundingBox()).width + 20) / (col + 20));
  const isWhole = async () => {
    const w = (await fridge.boundingBox()).width;
    return Math.abs(w - ((await columns()) * (col + 20) - 20)) < 3;
  };
  await expect.poll(columns).toBe(6);

  // Drag the corner handle left and down: narrower by whole columns, and a
  // fixed height (items scroll inside).
  const handle = page.getByRole("button", { name: 'Resize the "Kitchen fridge" section' });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 200, hb.y + 120, { steps: 10 });
  await page.mouse.up();
  await expect.poll(columns).toBeLessThan(6);
  expect(await isWhole()).toBe(true);
  await expect(fridge).toHaveClass(/fixed-height/);
  expect(parseInt(await fridge.evaluate((el) => el.style.height), 10)).toBeGreaterThanOrEqual(200);

  // Edit mode's presets: a third of the row, back to auto height.
  await page.getByRole("button", { name: 'Edit the "Kitchen fridge" section' }).click();
  await fridge.getByRole("button", { name: "Third" }).click();
  await fridge.getByRole("button", { name: "Auto height" }).click();
  await expect(fridge.locator(".inv-shelf-size")).toHaveText("4/12 · AUTO");
  await page.getByRole("button", { name: 'Done editing the "Kitchen fridge" section' }).click();
  await expect.poll(columns).toBe(4);
  await expect(fridge).not.toHaveClass(/fixed-height/);

  // Drag Pantry by its grip onto the left half of the fridge: it goes first.
  const grip = page.getByRole("button", { name: 'Move the "Pantry" section' });
  const gb = await grip.boundingBox();
  const fb = await fridge.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb.x + 20, fb.y + fb.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(order).toEqual(["Pantry section", "Kitchen fridge section", "Freezer section", "Leftovers section"]);

  // The grip also moves with the arrow keys.
  await page.getByRole("button", { name: 'Move the "Freezer" section' }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(order).toEqual(["Pantry section", "Freezer section", "Kitchen fridge section", "Leftovers section"]);

  // A new shelf is added after the others.
  await page.getByRole("button", { name: "Add a shelf" }).click();
  await page.getByLabel("Shelf name").fill("Garage freezer");
  await page.keyboard.press("Enter");
  await expect(page.locator(".inv-shelf", { hasText: "Garage freezer" })).toBeVisible();

  // Everything survives a reload, and the new names show in the add form.
  const fridgeWidth = (await fridge.boundingBox()).width;
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect
    .poll(order)
    .toEqual(["Pantry section", "Freezer section", "Kitchen fridge section", "Leftovers section", "Garage freezer section"]);
  await expect.poll(async () => Math.round((await fridge.boundingBox()).width)).toBe(Math.round(fridgeWidth));
  await page.getByRole("button", { name: "+ Add item" }).click();
  await expect(itemForm(page).locator(".riso-itemform-loc-name")).toHaveText(["Pantry", "Freezer", "Kitchen fridge", "Garage freezer"]);
});


test("dragging a card from one shelf to another moves it", async ({ page }) => {
  // Pantry sits in its own full-width row below Fridge/Freezer in the Riso
  // layout (see the design handoff), which pushes it below the fold at the
  // default 1280x720 viewport - a raw page.mouse sequence (needed for
  // dnd-kit's PointerSensor, see below) doesn't auto-scroll like .click()
  // does, so both shelves need to already be on screen.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Shrimp", "fridge");
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp")).toBeVisible();

  const card = page.locator(".inv-card", { hasText: "Shrimp" });
  const targetShelf = page.locator(".inv-shelf", { hasText: "Pantry" });
  const cardBox = await card.boundingBox();
  const targetBox = await targetShelf.boundingBox();

  // Manual pointer sequence rather than Playwright's dragTo() - dnd-kit's
  // PointerSensor needs real move events past its activation delay/
  // tolerance (see App.jsx's sensors config), not a single native
  // dragstart/dragend pair.
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 20, cardBox.y + cardBox.height / 2, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.waitForTimeout(100);
  // What follows the pointer is the item's card, not the old name chip.
  await expect(page.locator(".inv-drag-preview .inv-card")).toContainText("Shrimp");
  await expect(page.locator(".drag-preview-chip")).toHaveCount(0);
  await page.mouse.up();

  await expect(page.locator(".inv-shelf", { hasText: "Pantry" }).getByText("Shrimp")).toBeVisible();
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp")).toHaveCount(0);
});

test("item cards: one row with photo, name and amount; the expiry line on the left; a quiet Expired tag", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-cards+${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
  const day = 86400000;
  const add = (data) => page.request.post("/api/pantry-inventory", { data });
  await add({ name: "Bbq sauce", location: "fridge", quantity: 0.25, unit: "cup", expiresAt: new Date(Date.now() - 3 * day).toISOString() });
  await add({ name: "Cilantro", location: "fridge", quantity: 1, unit: "bunch", expiresAt: new Date(Date.now() + 2 * day).toISOString() });
  await add({ name: "Greek yogurt", location: "fridge", quantity: 500, unit: "g", expiresAt: new Date(Date.now() + 6 * day).toISOString() });
  await add({ name: "Eggs", location: "fridge", quantity: 8, expiresAt: new Date(Date.now() + 14 * day).toISOString() });
  await add({ name: "Basmati rice", location: "pantry", quantity: 2, unit: "kg", expiresAt: new Date(Date.now() + 600 * day).toISOString() });
  await add({ name: "Xylo widget", location: "pantry", category: "Other", expiresAt: null });
  // Only an uploaded photo or a web link is kept as a photo.
  const bad = await add({ name: "Odd", imageUrl: "javascript:alert(1)" });
  expect(bad.status()).toBe(400);
  // TheMealDB's stock photos, served locally; Cilantro's fails to load.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://www.themealdb.com/**", (route) =>
    route.request().url().includes("Cilantro") ? route.abort() : route.fulfill({ contentType: "image/png", body: png })
  );
  await page.route("https://example.com/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await expect(page.locator(".riso-inv-summary")).toHaveText("6 items1 to use soon1 expired"); // three parts, the dots between them are drawn by CSS
  const card = (name) => page.locator(".inv-card").filter({ hasText: name });
  // Expired: pink-tinted card and the quiet tag - no line.
  await expect(card("Bbq sauce")).toHaveClass(/expired/);
  await expect(card("Bbq sauce").locator(".inv-card-expired")).toHaveText("Expired");
  await expect(card("Bbq sauce").locator(".inv-card-line")).toHaveCount(0);
  await expect(card("Bbq sauce").locator(".inv-card-qty")).toHaveText("0.25 cup");
  // Days left set the line's colour; no tag, no label.
  await expect(card("Cilantro").locator(".inv-card-line-fill.pink")).toHaveCount(1);
  await expect(card("Greek yogurt").locator(".inv-card-line-fill.yellow")).toHaveCount(1);
  await expect(card("Eggs").locator(".inv-card-line-fill.blue")).toHaveCount(1);
  // The closer the date, the fuller the line.
  const fill = async (name) => parseFloat(await card(name).locator(".inv-card-line-fill").evaluate((el) => el.style.height));
  expect(await fill("Cilantro")).toBeGreaterThan(await fill("Greek yogurt"));
  expect(await fill("Greek yogurt")).toBeGreaterThan(await fill("Eggs"));
  expect(await fill("Cilantro")).toBeGreaterThan(85);
  await expect(card("Cilantro").locator(".inv-card-expired")).toHaveCount(0);
  // No line at all with 28+ days or no date.
  await expect(card("Basmati rice").locator(".inv-card-line")).toHaveCount(0);
  await expect(card("Xylo widget").locator(".inv-card-line")).toHaveCount(0);
  // No photo of its own: TheMealDB's stock photo of the ingredient; if that
  // won't load, a food emoji; with no match, the first letter.
  await expect(card("Basmati rice").locator("img.inv-card-photo.generic")).toHaveAttribute(
    "src",
    "https://www.themealdb.com/images/ingredients/Basmati%20Rice-Small.png"
  );
  await expect(card("Cilantro").locator(".inv-card-photo.placeholder")).toHaveText("🌿");
  await expect(card("Xylo widget").locator(".inv-card-photo.letter")).toHaveText("X");
  await expect(page.locator(".inv-card").getByText("USDA")).toHaveCount(0);
  // Every card is the same height.
  const heights = await page.locator(".inv-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBe(88);

  // A photo added in the item form shows in its preview, and on the card once saved.
  await card("Eggs").click();
  const form = itemForm(page);
  const preview = form.locator(".riso-itemform-card");
  await form.getByLabel("Item photo").setInputFiles({
    name: "eggs.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(preview.locator("img.inv-card-photo")).toHaveAttribute("src", /\/api\/recipe-images\//);
  await expect(form.getByRole("button", { name: "Change photo" })).toBeVisible();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form).toHaveCount(0);
  await expect(card("Eggs").locator("img.inv-card-photo")).toHaveAttribute("src", /\/api\/recipe-images\//);
  // Removing it brings back the stock photo, which can be hidden too.
  await card("Eggs").click();
  await form.getByRole("button", { name: "Remove photo" }).click();
  await expect(preview.locator("img.inv-card-photo.generic")).toHaveAttribute("src", /ingredients\/Egg-Small\.png$/);
  await expect(form.getByText("Stock photo ·")).toBeVisible();
  await form.getByRole("button", { name: "Hide it" }).click();
  await expect(preview.locator(".inv-card-photo.placeholder")).toHaveText("🥚");
  await form.getByRole("button", { name: "Show the stock photo" }).click();
  await expect(preview.locator("img.inv-card-photo.generic")).toHaveCount(1);
  // Or a link to any picture.
  await form.getByLabel("Photo link").fill("https://example.com/eggs.png");
  await form.getByLabel("Photo link").press("Enter");
  await expect(preview.locator("img.inv-card-photo")).toHaveAttribute("src", "https://example.com/eggs.png");
  await expect(preview.locator("img.inv-card-photo")).not.toHaveClass(/generic/);
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form).toHaveCount(0);
  await expect(card("Eggs").locator("img.inv-card-photo")).toHaveAttribute("src", "https://example.com/eggs.png");
});

test("the amount can be changed right on the card, without opening the item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-qty+${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible(); // signed in (the name may be inside the account menu)
  const add = (data) => page.request.post("/api/pantry-inventory", { data: { location: "fridge", ...data } });
  await add({ name: "Greek yogurt", quantity: 500, unit: "g" });
  await add({ name: "Cilantro", quantity: 1, unit: "bunch" });
  await add({ name: "Mystery jam" });
  await add({ name: "Aged cheddar", quantity: 1 });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const card = (name) => page.locator(".inv-card").filter({ hasText: name });
  const saved = async (name) =>
    (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === name).quantity;

  // + steps by 50 g; Enter saves.
  await card("Greek yogurt").getByRole("button", { name: /Change the amount of Greek yogurt/ }).click();
  await card("Greek yogurt").getByRole("button", { name: "More Greek yogurt" }).click();
  await expect(card("Greek yogurt").getByLabel("Amount of Greek yogurt")).toHaveValue("550");
  await card("Greek yogurt").getByLabel("Amount of Greek yogurt").press("Enter");
  await expect(card("Greek yogurt").locator(".inv-card-qty")).toHaveText("550 g");
  await expect(itemForm(page)).toHaveCount(0);
  await expect.poll(() => saved("Greek yogurt")).toBe(550);

  // Typing a fraction and tapping away saves too.
  await card("Cilantro").locator(".inv-card-qty").click();
  await card("Cilantro").getByLabel("Amount of Cilantro").fill("1/2");
  await page.locator(".riso-inv-title").click();
  await expect(card("Cilantro").locator(".inv-card-qty")).toHaveText("0.5 bunch");
  await expect.poll(() => saved("Cilantro")).toBe(0.5);

  // Escape puts it back.
  await card("Cilantro").locator(".inv-card-qty").click();
  await card("Cilantro").getByLabel("Amount of Cilantro").fill("9");
  await card("Cilantro").getByLabel("Amount of Cilantro").press("Escape");
  await expect(card("Cilantro").locator(".inv-card-qty")).toHaveText("0.5 bunch");

  // An item with no amount yet can get one, and a measure with it.
  await card("Mystery jam").getByRole("button", { name: "Change the amount of Mystery jam" }).click();
  await card("Mystery jam").getByLabel("Amount of Mystery jam").fill("2");
  await card("Mystery jam").getByLabel("Measure of Mystery jam").selectOption("jar");
  await card("Mystery jam").getByLabel("Amount of Mystery jam").press("Enter");
  await expect(card("Mystery jam").locator(".inv-card-qty")).toHaveText("2 jars");
  await expect(itemForm(page)).toHaveCount(0);
  const jam = (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === "Mystery jam");
  expect([jam.quantity, jam.unit]).toEqual([2, "jar"]);

  // Changing only the measure: 550 g of yogurt is really 550 ml.
  await card("Greek yogurt").locator(".inv-card-qty").click();
  await card("Greek yogurt").getByLabel("Measure of Greek yogurt").selectOption("ml");
  await page.locator(".riso-inv-title").click();
  await expect(card("Greek yogurt").locator(".inv-card-qty")).toHaveText("550 ml");
  await expect.poll(() => saved("Greek yogurt")).toBe(550);

  // The item form has the measure too, next to the amount, and saves it with Save changes.
  await card("Cilantro").click();
  await itemForm(page).getByLabel("Measure").selectOption("cup");
  await itemForm(page).getByRole("button", { name: "Save changes" }).click();
  await expect(itemForm(page)).toHaveCount(0);
  await expect(card("Cilantro").locator(".inv-card-qty")).toHaveText("0.5 cup");
  const cilantro = (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === "Cilantro");
  expect(cilantro.unit).toBe("cup");

  // A block of cheese.
  await page.keyboard.press("Escape");
  await card("Aged cheddar").locator(".inv-card-qty").click();
  await card("Aged cheddar").getByLabel("Measure of Aged cheddar").selectOption("block");
  await card("Aged cheddar").getByLabel("Amount of Aged cheddar").fill("2");
  await card("Aged cheddar").getByLabel("Amount of Aged cheddar").press("Enter");
  await expect(card("Aged cheddar").locator(".inv-card-qty")).toHaveText("2 blocks");
});
