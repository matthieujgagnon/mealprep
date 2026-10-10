import { expect } from "@playwright/test";

// Presses "Save recipe" in the new-recipe pop-up and waits until the pop-up has
// closed. Nothing else says the save is done: the page behind the pop-up (its
// "Your recipes." heading) is already on screen, the pop-up's live preview shows
// the recipe's title, and the Save button only changes to "Saving…" while the
// recipe is on its way. Clicking the title before the pop-up is gone clicks the
// preview.
export async function saveRecipe(page) {
  await page.getByRole("button", { name: /^(Save recipe|Enregistrer la recette)$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
