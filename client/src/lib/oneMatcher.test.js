import { describe, expect, it } from "vitest";
import { ingredientHave, recipeHave } from "./inventoryMatch.js";
import { rankRecipesForTray } from "./plannerSuggestions.js";
import { availabilityOf, findRecipes, makeableSections } from "./finder.js";
import { cardState, haveBar } from "./photoCard.js";
import { makeableNow } from "./homeWeek.js";
import { sortRecipes } from "./recipesView.js";

// One recipe, checked the way each page checks it, gives the same answer
// everywhere: the recipe card (its ✓ and its numbers), Makeable (section,
// count, pills, buttons), the recipe pop-out and the Planner's meal card (what
// you have, what to buy), the Planner's search, Home's Makeable now and the
// Recipes page. All of them read lib/inventoryMatch.js.

const recipe = (id, title, names) => ({ id, title, mealSlot: "dinner", ingredients: names.map((name) => ({ name })) });

const garlicChicken = recipe("garlic-chicken", "Garlic chicken and rice", [
  "boneless skinless chicken thighs",
  "garlic cloves",
  "kosher salt",
  "yellow onion",
  "minced garlic",
  "basmati rice",
  "olive oil",
  "salt and pepper",
  "fresh cilantro",
  "lime",
]);
const pouletCitron = recipe("poulet-citron", "Poulet au citron", ["Poitrines de poulet", "ail", "citron", "sel", "poivre", "huile d'olive", "bouillon de poulet"]);
const recipes = [garlicChicken, pouletCitron];

const kitchen = (names) => ({ inventory: names.map((name) => ({ name, location: "fridge" })), customStaples: [], excludedStaples: [] });
const KITCHENS = {
  English: kitchen(["Chicken thighs", "Chicken breasts", "Garlic", "Onion", "Rice", "Cilantro", "Lemons", "Chicken stock"]),
  French: kitchen(["Hauts de cuisse de poulet", "Poulet", "Ail", "Oignons", "Riz", "Coriandre", "Citrons", "Bouillon de poulet"]),
};

// What each page shows for one recipe, worked out the way that page does.
function everyPage(r, k) {
  const all = recipes.includes(r) ? recipes : [...recipes, r];
  // The recipe card: a ✓ beside each ingredient, and its numbers.
  const card = recipeHave(r, k);
  const cardMarks = Object.fromEntries(r.ingredients.map((ing) => [ing.name, ingredientHave(ing.name, k) !== "need"]));

  // The Planner's search and the Makeable page: the ranking, then the finder.
  const { ranked } = rankRecipesForTray({ recipes: all, upcomingEntries: [], kitchen: k });
  const panel = findRecipes(ranked, { avail: "all" }).tiles.find((x) => x.recipe.id === r.id);
  const page = findRecipes(ranked, { makeable: true }).tiles.find((x) => x.recipe.id === r.id);
  const section = makeableSections([page], new Map())[0].id;

  // The pop-out and the planned meal's card both draw recipeHave's lists.
  const popout = recipeHave(r, k);

  // Home's Makeable now, and the Recipes page's "Fewest missing" sort.
  const home = makeableNow(all, k, false);
  const homeState = home.ready.some((m) => m.recipe.id === r.id) ? "ready" : home.nearly.some((m) => m.recipe.id === r.id) ? "few" : "shop";
  const sorted = sortRecipes(all, 1, k).map((x) => x.id);

  return { card, cardMarks, panel, page, section, popout, homeState, sorted };
}

describe.each(Object.keys(KITCHENS))("one answer everywhere, %s Inventory", (lang) => {
  const k = KITCHENS[lang];

  it("Garlic chicken and rice: 5 of 6, only the lime to buy, on every page", () => {
    const p = everyPage(garlicChicken, k);
    // Recipe card numbers.
    expect(p.card).toMatchObject({ matchedCount: 5, totalCount: 6, missingCount: 1, missing: ["Lime"] });
    // Recipe card ✓: everything but the lime (salt, oil, salt and pepper are always had).
    expect(Object.entries(p.cardMarks).filter(([, had]) => !had).map(([name]) => name)).toEqual(["lime"]);
    // Pop-out and planned-meal card.
    expect(p.popout.have.map((i) => i.name)).toEqual(["Boneless skinless chicken thighs", "Garlic cloves", "Yellow onion", "Basmati rice", "Fresh cilantro"]);
    expect(p.popout.buy.map((i) => i.name)).toEqual(["Lime"]);
    // Planner search card: "5/6", "1 missing".
    expect(haveBar(p.panel.stats)).toMatchObject({ text: "5/6", missing: 1, state: "missing" });
    // Makeable: One or two short, the lime as its one pill, To buy first.
    expect(p.section).toBe("few");
    expect(p.page.stats.missing).toEqual(["Lime"]);
    expect(cardState(p.page.stats)).toBe("few");
    // Home: one or two short too.
    expect(p.homeState).toBe("few");
    // All of them are the same numbers.
    for (const stats of [p.panel.stats, p.page.stats]) {
      expect(stats).toMatchObject({ matchedCount: p.card.matchedCount, totalCount: p.card.totalCount, missingCount: p.card.missingCount, missing: p.card.missing });
    }
  });

  it("Poulet au citron: ready everywhere, French staples left out", () => {
    const p = everyPage(pouletCitron, k);
    expect(p.card).toMatchObject({ matchedCount: 4, totalCount: 4, missingCount: 0 });
    expect(Object.values(p.cardMarks).every(Boolean)).toBe(true);
    expect(p.popout.buy).toEqual([]);
    expect(haveBar(p.panel.stats)).toMatchObject({ text: "4/4", state: "complete" });
    expect(p.section).toBe("ready");
    expect(availabilityOf(p.page.stats)).toBe("ready");
    expect(p.homeState).toBe("ready");
    // Fewest missing puts the ready recipe first.
    expect(p.sorted[0]).toBe("poulet-citron");
  });
});

describe("what the old rule got wrong, now the same everywhere", () => {
  it("a leftover never counts as its main ingredient", () => {
    const k = kitchen([]);
    k.inventory.push({ name: "Chicken curry (leftovers)", isLeftover: true });
    const p = everyPage(recipe("tacos", "Chicken tacos", ["chicken"]), k);
    expect(p.card.missing).toEqual(["Chicken"]);
    expect(p.cardMarks.chicken).toBe(false);
  });

  it("chicken breasts don't count for chicken thighs", () => {
    const p = everyPage(recipe("thighs", "Thighs", ["chicken thighs", "lime"]), kitchen(["Chicken breasts", "Lime"]));
    expect(p.popout.buy.map((i) => i.name)).toEqual(["Chicken thighs"]);
    expect(p.page.stats.missing).toEqual(["Chicken thighs"]);
  });
});
