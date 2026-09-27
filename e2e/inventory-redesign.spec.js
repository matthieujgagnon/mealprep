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
