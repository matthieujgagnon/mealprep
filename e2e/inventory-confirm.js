// The Inventory confirmation sheet that opens in front of every way of adding
// to Inventory (see CLAUDE.md). These find it and press its buttons.

export const confirmSheet = (page) => page.getByRole("dialog", { name: /Add .*to Inventory|Add to Inventory/i });

// Press "Add N to inventory" on the open sheet and wait for it to close.
export async function confirmAdd(page) {
  const sheet = page.locator(".riso-confirm");
  await sheet.getByRole("button", { name: /^Add \d+ to inventory$/ }).click();
  await sheet.waitFor({ state: "detached" });
}

// Press Cancel on the open sheet and wait for it to close.
export async function cancelAdd(page) {
  const sheet = page.locator(".riso-confirm");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await sheet.waitFor({ state: "detached" });
}
