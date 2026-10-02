import { expect, test } from "@playwright/test";

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
  await expect(page.getByText(email)).toBeVisible();
}

async function addItem(page, name, location) {
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', name);
  if (location) {
    await page.locator(".modal-content select").nth(1).selectOption(location);
  }
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator(".modal-close").click();
}

test("items land on the right shelf and clicking one opens the edit panel", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Shrimp", "fridge");
  await expect(page.locator(".inv-shelf", { hasText: "Fridge" }).getByText("Shrimp")).toBeVisible();

  await page.getByText("Shrimp", { exact: true }).click();
  await expect(page.locator(".inv-panel")).toBeVisible();
  await expect(page.locator(".inv-panel-header input")).toHaveValue("Shrimp");
  await expect(page.locator(".inv-storage-pill").first()).toBeVisible();
});

test("the item name in the edit panel can be renamed", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await addItem(page, "Shrimp", "fridge");
  await page.getByText("Shrimp", { exact: true }).click();
  const nameInput = page.locator(".inv-panel-header input");
  await expect(nameInput).toHaveValue("Shrimp");

  await nameInput.fill("Shrimp, peeled");
  await nameInput.press("Enter");
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

  // A shelf is addable even with zero items in the whole inventory; it
  // opens ready to rename.
  await page.getByRole("button", { name: "+ Add shelf" }).click();
  await expect(page.getByLabel("Section name")).toHaveValue("New shelf");
  await page.getByLabel("Section name").fill("Garage Freezer");
  await page.keyboard.press("Enter");
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" })).toBeVisible();
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" }).locator(".inv-shelf-empty")).toHaveText("Drop items here");

  // The new section shows up as a location option on the add form itself.
  // Custom location ids are server-generated, not a fixed slug - select by
  // visible label instead of guessing the id.
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', "Elk");
  await page.locator(".modal-content select").nth(1).selectOption({ label: "Garage Freezer" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator(".modal-close").click();

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
  await expect.poll(order).toEqual(["Fridge section", "Freezer section", "Pantry section"]);
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
  await expect.poll(order).toEqual(["Pantry section", "Kitchen fridge section", "Freezer section"]);

  // The grip also moves with the arrow keys.
  await page.getByRole("button", { name: 'Move the "Freezer" section' }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(order).toEqual(["Pantry section", "Freezer section", "Kitchen fridge section"]);

  // A new shelf renames too.
  await page.getByRole("button", { name: "+ Add shelf" }).click();
  await page.getByLabel("Section name").fill("Garage freezer");
  await page.keyboard.press("Enter");
  await expect(page.locator(".inv-shelf", { hasText: "Garage freezer" })).toBeVisible();

  // Everything survives a reload, and the new names show in the add form.
  const fridgeWidth = (await fridge.boundingBox()).width;
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect
    .poll(order)
    .toEqual(["Pantry section", "Freezer section", "Kitchen fridge section", "Garage freezer section"]);
  await expect.poll(async () => Math.round((await fridge.boundingBox()).width)).toBe(Math.round(fridgeWidth));
  await page.getByRole("button", { name: "+ Add item" }).click();
  await expect(page.locator(".modal-content select").nth(1).locator("option")).toHaveText([
    "Pantry",
    "Freezer",
    "Kitchen fridge",
    "Garage freezer",
  ]);
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
  await expect(page.getByText(email)).toBeVisible();
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

  await expect(page.getByText("6 items · 1 to use soon · 1 expired")).toBeVisible();
  const card = (name) => page.locator(".inv-card").filter({ hasText: name });
  // Expired: pink-tinted card, full pink line, the quiet tag.
  await expect(card("Bbq sauce")).toHaveClass(/expired/);
  await expect(card("Bbq sauce").locator(".inv-card-expired")).toHaveText("Expired");
  await expect(card("Bbq sauce").locator(".inv-card-line-fill.pink")).toHaveAttribute("style", /height: 100%/);
  await expect(card("Bbq sauce").locator(".inv-card-qty")).toHaveText("0.25 cup");
  // Days left set the line's colour; no tag, no label.
  await expect(card("Cilantro").locator(".inv-card-line-fill.pink")).toHaveCount(1);
  await expect(card("Greek yogurt").locator(".inv-card-line-fill.yellow")).toHaveCount(1);
  await expect(card("Eggs").locator(".inv-card-line-fill.blue")).toHaveCount(1);
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

  // A photo added in the detail panel shows on the card.
  await card("Eggs").click();
  await page.locator(".inv-panel").getByLabel("Item photo").setInputFiles({
    name: "eggs.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(card("Eggs").locator("img.inv-card-photo")).toHaveAttribute("src", /\/api\/recipe-images\//);
  await expect(page.locator(".inv-panel").getByRole("button", { name: "Change photo" })).toBeVisible();
  // Removing it brings back the stock photo, which can be hidden too.
  const panel = page.locator(".inv-panel");
  await panel.getByRole("button", { name: "Remove photo" }).click();
  await expect(card("Eggs").locator("img.inv-card-photo.generic")).toHaveAttribute("src", /ingredients\/Egg-Small\.png$/);
  await expect(panel.getByText("Stock photo from TheMealDB")).toBeVisible();
  await panel.getByRole("button", { name: "Hide it" }).click();
  await expect(card("Eggs").locator(".inv-card-photo.placeholder")).toHaveText("🥚");
  await panel.getByRole("button", { name: "Show the stock photo" }).click();
  await expect(card("Eggs").locator("img.inv-card-photo.generic")).toHaveCount(1);
  // Or a link to any picture.
  await panel.getByRole("button", { name: "Paste a link" }).click();
  await panel.getByLabel("Photo link").fill("https://example.com/eggs.png");
  await panel.getByLabel("Photo link").press("Enter");
  await expect(card("Eggs").locator("img.inv-card-photo")).toHaveAttribute("src", "https://example.com/eggs.png");
  await expect(card("Eggs").locator("img.inv-card-photo")).not.toHaveClass(/generic/);
});

test("the amount can be changed right on the card, without opening the item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-qty+${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  const add = (data) => page.request.post("/api/pantry-inventory", { data: { location: "fridge", ...data } });
  await add({ name: "Greek yogurt", quantity: 500, unit: "g" });
  await add({ name: "Cilantro", quantity: 1, unit: "bunch" });
  await add({ name: "Mystery jam" });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const card = (name) => page.locator(".inv-card").filter({ hasText: name });
  const saved = async (name) =>
    (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === name).quantity;

  // + steps by 50 g; Enter saves.
  await card("Greek yogurt").getByRole("button", { name: /Change the amount of Greek yogurt/ }).click();
  await card("Greek yogurt").getByRole("button", { name: "More Greek yogurt" }).click();
  await expect(card("Greek yogurt").getByLabel("Amount of Greek yogurt (g)")).toHaveValue("550");
  await card("Greek yogurt").getByLabel("Amount of Greek yogurt (g)").press("Enter");
  await expect(card("Greek yogurt").locator(".inv-card-qty")).toHaveText("550 g");
  await expect(page.locator(".inv-panel")).toHaveCount(0);
  await expect.poll(() => saved("Greek yogurt")).toBe(550);

  // Typing a fraction and tapping away saves too.
  await card("Cilantro").locator(".inv-card-qty").click();
  await card("Cilantro").getByLabel("Amount of Cilantro (bunch)").fill("1/2");
  await page.locator(".riso-inv-title").click();
  await expect(card("Cilantro").locator(".inv-card-qty")).toHaveText("0.5 bunch");
  await expect.poll(() => saved("Cilantro")).toBe(0.5);

  // Escape puts it back.
  await card("Cilantro").locator(".inv-card-qty").click();
  await card("Cilantro").getByLabel("Amount of Cilantro (bunch)").fill("9");
  await card("Cilantro").getByLabel("Amount of Cilantro (bunch)").press("Escape");
  await expect(card("Cilantro").locator(".inv-card-qty")).toHaveText("0.5 bunch");

  // An item with no amount yet can get one.
  await card("Mystery jam").getByRole("button", { name: "Change the amount of Mystery jam" }).click();
  await card("Mystery jam").getByLabel("Amount of Mystery jam").fill("2");
  await card("Mystery jam").getByLabel("Amount of Mystery jam").press("Enter");
  await expect(card("Mystery jam").locator(".inv-card-qty-num")).toHaveText("2");
  await expect(page.locator(".inv-panel")).toHaveCount(0);
});
