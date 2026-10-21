import { expect } from "@playwright/test";

// A recipe is never saved without a meal type: the editor's chips (any number can be on). If none is
// on yet, this picks Supper (the third chip, whatever the language).
export async function chooseMealType(page) {
  if ((await page.locator("#re-slots .re-slot.on").count()) === 0) await page.locator("#re-slots .re-slot").nth(2).click();
}

// Presses "Save recipe" in the new-recipe pop-up and waits until the pop-up has
// closed. Nothing else says the save is done: the page behind the pop-up (its
// "Your recipes." heading) is already on screen, the pop-up's live preview shows
// the recipe's title, and the Save button only changes to "Saving…" while the
// recipe is on its way. Clicking the title before the pop-up is gone clicks the
// preview. A recipe with no meal type yet gets Supper first (it cannot be saved without one).
export async function saveRecipe(page) {
  await chooseMealType(page);
  await page.getByRole("button", { name: /^(Save recipe|Enregistrer la recette)$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
