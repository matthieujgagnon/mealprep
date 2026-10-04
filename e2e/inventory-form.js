import { expect } from "@playwright/test";

// The Inventory item form (Add item and Edit item): one component, found by its
// class. These open it, fill it and press its buttons.

export const itemForm = (page) => page.locator(".riso-itemform");

const SHELVES = { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry" };

// The shelf card with this name ("freezer" or "Garage Freezer").
export function shelfCard(page, shelf) {
  const label = SHELVES[shelf] || shelf;
  return itemForm(page)
    .locator(".riso-itemform-loc")
    .filter({ has: page.locator(".riso-itemform-loc-name", { hasText: new RegExp(`^${label}$`, "i") }) });
}

// Fill the open Add form: the name, and the shelf if given.
export async function fillAddForm(page, name, { shelf } = {}) {
  const form = itemForm(page);
  await form.getByLabel("Item name").fill(name);
  if (shelf) await shelfCard(page, shelf).click();
}

// "+ Add item" (or a shelf's own +, if already open skip), then add one item and
// close the form.
export async function addInventoryItem(page, name, shelf, { open = true } = {}) {
  if (open) await page.getByRole("button", { name: "+ Add item" }).click();
  await fillAddForm(page, name, { shelf });
  await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
  await expect(itemForm(page)).toHaveCount(0);
}
