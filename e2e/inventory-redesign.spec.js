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
  await expect(page.locator(".inv-panel-header")).toContainText("Shrimp");
  await expect(page.locator(".inv-storage-pill").first()).toBeVisible();
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

  // A section is addable even with zero items in the whole inventory - the
  // shelves grid isn't gated behind having something to show yet.
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.fill(".inv-add-section-tile.form input", "Garage Freezer");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" })).toBeVisible();

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

  await page.locator(".inv-shelf", { hasText: "Garage Freezer" }).locator(".inv-shelf-remove").click();
  await expect(page.locator(".inv-shelf", { hasText: "Garage Freezer" })).toHaveCount(0);
  await expect(page.locator(".inv-shelf", { hasText: "Pantry" }).getByText("Elk")).toBeVisible();
});

test("dragging a card from one shelf to another moves it", async ({ page }) => {
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
