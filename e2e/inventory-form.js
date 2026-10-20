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

// Fill the open Add form: the name, and where it goes if given. Fridge, Freezer and Pantry are the
// "Stored in" cards (where it is KEPT); any other shelf (Prepared meals, a section of their own)
// is the separate Shelf choice under them.
export async function fillAddForm(page, name, { shelf } = {}) {
  const form = itemForm(page);
  await form.getByLabel("Item name").fill(name);
  if (!shelf) return;
  const label = SHELVES[shelf] || shelf;
  if (/^(fridge|freezer|pantry)$/i.test(label)) await shelfCard(page, shelf).click();
  else await form.locator(".riso-itemform-shelf-select").selectOption({ label });
}

// "+ Add item" (or a shelf's own +, if already open skip), then add one item and
// close the form.
export async function addInventoryItem(page, name, shelf, { open = true } = {}) {
  if (open) await page.getByRole("button", { name: "+ Add item" }).click();
  await fillAddForm(page, name, { shelf });
  await itemForm(page).getByRole("button", { name: "Add to inventory" }).click();
  await expect(itemForm(page)).toHaveCount(0);
}

// Inventory opens on Tiles. The tests about Compact's rows (the row itself, the
// amount on the row, the days under a leftover's name) pick it first; the choice
// is kept for the account on this device, so once per account is enough.
export async function pickCompact(page) {
  const compact = page.getByRole("button", { name: "Compact", exact: true });
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
}
