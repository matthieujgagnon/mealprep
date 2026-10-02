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

test("an expired item's pill is pink on a plain grey strip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  const email = `inv-expired+${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.request.post("/api/pantry-inventory", {
    data: { name: "Bbq sauce", location: "fridge", expiresAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  });
  await page.request.post("/api/pantry-inventory", {
    data: { name: "Yogurt", location: "fridge", expiresAt: new Date(Date.now() + 2 * 86400000).toISOString() },
  });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const card = (name) => page.locator(".inv-card").filter({ hasText: name });
  await expect(card("Bbq sauce").locator(".inv-card-days")).toHaveText("expired!");
  await expect(card("Bbq sauce").locator(".inv-card-days")).toHaveClass(/expired/);
  await expect(card("Bbq sauce").locator(".inv-card-strip")).toHaveClass(/expired/);
  await expect(card("Bbq sauce").locator(".inv-card-fill")).toHaveCount(0);
  // Not expired yet: the coloured fill, plain pill.
  await expect(card("Yogurt").locator(".inv-card-fill.pink")).toHaveCount(1);
  await expect(card("Yogurt").locator(".inv-card-days")).not.toHaveClass(/expired/);
});
