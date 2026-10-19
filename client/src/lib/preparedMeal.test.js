import { afterAll, describe, expect, it, vi } from "vitest";
import { haveItemFor, ingredientHave, matchingItems, recipeHave, recipesUsingItem, expiringSoon } from "./inventoryMatch.js";
import { rankRecipesForTray } from "./plannerSuggestions.js";
import { expiringItems, findRecipes, makeableSections, shelvesWithItems, similarTo } from "./finder.js";
import { makeableNow, toUseItems, useUpRecipeCounts } from "./homeWeek.js";
import { buildGroceryList } from "./groceryList.js";
import { splitAtHome } from "./groceryAtHome.js";
import { mealTitle, plannableMeals, preparedEntryIds } from "./leftovers.js";
import { isMealItem, isPreparedMeal } from "./mealItem.js";
import { daysUntil } from "./pantryInventory.js";
import { buildAddPayload, buildEditPatch } from "./inventoryForm.js";
import { addDays, quebecDay } from "./quebecDay.js";

// A fixed clock: 11:30 p.m. in Quebec on Oct 14, 2026, already Oct 15 in UTC. Days left
// are Quebec calendar days, so use-by dates are Quebec days ("2026-10-17").
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-15T03:30:00Z"));
afterAll(() => vi.useRealTimers());

const inDays = (n) => addDays(quebecDay(), n);
const recipe = (id, title, names, extra = {}) => ({
  id,
  title,
  baseServings: 2,
  ingredients: names.map((name) => ({ name, quantity: 1, unit: "" })),
  mealSlot: "dinner",
  cookTimeMinutes: 20,
  ...extra,
});

// Matt's frozen pre-prepared meal, untagged and tagged as a prepared meal.
const PASTRY_NAME = "Chicken, Broccoli and Cheddar Puff Pastry";
const untagged = { id: "pastry", name: PASTRY_NAME, location: "freezer", quantity: 2, unit: "box", expiresAt: inDays(2) };
const prepared = { ...untagged, isPreparedMeal: true };
const kitchen = (...inventory) => ({ inventory });

const plainChicken = recipe("plain", "Plain chicken", ["chicken"]);
const bowl = recipe("bowl", "Chicken rice bowl", ["chicken breast", "rice"]);
const stirFry = recipe("stirfry", "Chicken broccoli stir-fry", ["chicken breast", "broccoli", "cheddar cheese"]);
const salad = recipe("salad", "Green salad", ["lettuce", "cucumber"], { mealSlot: "lunch" });
const recipes = [plainChicken, bowl, stirFry, salad];

describe("a prepared meal is a meal: one rule", () => {
  it("a leftover or a prepared meal is a meal; an ingredient is not", () => {
    expect(isMealItem({ isLeftover: true })).toBe(true);
    expect(isMealItem(prepared)).toBe(true);
    expect(isMealItem(untagged)).toBe(false);
    expect(isPreparedMeal(prepared)).toBe(true);
    expect(isPreparedMeal({ isLeftover: true, isPreparedMeal: true })).toBe(false);
  });
});

describe("the matcher: a prepared pastry is never chicken, broccoli or cheddar", () => {
  it.each(["chicken", "chicken breast", "Poulet", "broccoli", "cheddar", "cheddar cheese", "puff pastry"])("%s", (ingredient) => {
    expect(haveItemFor(ingredient, [prepared])).toBeNull();
    expect(matchingItems(ingredient, [prepared])).toEqual([]);
    expect(ingredientHave(ingredient, kitchen(prepared))).toBe("need");
  });

  it("the same item NOT tagged still counts as chicken, as before", () => {
    expect(haveItemFor("chicken", [untagged])).toBe(untagged);
    expect(haveItemFor("Poulet", [untagged])).toBe(untagged);
    expect(ingredientHave("chicken breast", kitchen(untagged))).toBe("have");
  });

  it("a recipe next to Inventory: tagged, nothing is had from it; untagged, chicken is", () => {
    expect(recipeHave(stirFry, kitchen(prepared))).toMatchObject({ matchedCount: 0, missingCount: 3 });
    expect(recipeHave(stirFry, kitchen(untagged))).toMatchObject({ matchedCount: 1, missingCount: 2 });
  });

  it("an ordinary chicken still counts next to a tagged pastry", () => {
    const chicken = { id: "c", name: "Chicken breasts", location: "fridge", expiresAt: inDays(5) };
    expect(haveItemFor("chicken", [prepared, chicken])).toBe(chicken);
  });

  it("is not in the 'going off soon' list that recipes use", () => {
    expect(expiringSoon([prepared], 3)).toEqual([]);
    expect(expiringSoon([untagged], 3)).toEqual([untagged]);
  });
});

describe("Similar recipes: a recipe's missing count never counts the pastry", () => {
  const stats = (tray, id) => tray.ranked.find((x) => x.recipe.id === id).stats;

  it("tagged, the recipes sharing chicken do not have it; untagged, they do", () => {
    const tagged = rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: kitchen(prepared) });
    const plain = rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: kitchen(untagged) });
    expect(stats(tagged, "stirfry").matchedCount).toBe(0);
    expect(stats(plain, "stirfry").matchedCount).toBe(1);
    // A tagged pastry changes nothing: the Similar list and the ranking are those of an empty Inventory.
    const empty = rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: kitchen() });
    const ids = (list) => list.map((x) => x.recipe.id);
    expect(ids(similarTo(bowl, tagged.ranked))).toEqual(ids(similarTo(bowl, empty.ranked)));
    expect(similarTo(bowl, tagged.ranked).map((x) => x.stats.missingCount)).toEqual(similarTo(bowl, empty.ranked).map((x) => x.stats.missingCount));
    expect(ids(tagged.ranked)).toEqual(ids(empty.ranked));
  });
});

describe("Use it up", () => {
  const cabbage = { id: "cab", name: "Chicken stock", location: "fridge", expiresAt: inDays(10) };

  it("shows a prepared meal first when it is about to expire, but never searches recipes for it", () => {
    const { shown, soonest } = toUseItems([cabbage, prepared], daysUntil);
    expect(shown[0]).toBe(prepared);
    expect(soonest).toEqual([cabbage]);
    // Untagged, it is an ingredient: it counts for "Cook with these" and is not put first.
    const asIngredient = toUseItems([cabbage, untagged], daysUntil);
    expect(asIngredient.soonest).toContain(untagged);
  });

  it("'N recipes use these' counts only ingredients, through the one matcher", () => {
    const spinach = { id: "s", name: "Épinards", location: "fridge", expiresAt: inDays(2) };
    const soup = recipe("soup", "Spinach soup", ["spinach", "chicken breast"]);
    const withTagged = useUpRecipeCounts([...recipes, soup], [prepared, spinach]);
    // Only the spinach counts (French name, English recipe): one recipe uses it.
    expect(withTagged).toEqual({ usesOne: 1, usesTwo: 0 });
    // Untagged, the pastry is chicken too: the soup now uses two of them.
    expect(useUpRecipeCounts([...recipes, soup], [untagged, spinach])).toEqual({ usesOne: 5 - 1, usesTwo: 1 });
  });
});

describe("Cook with (the finder's shelves and expiring list)", () => {
  const sections = [{ id: "freezer", label: "Freezer" }];

  it("a prepared meal is not a pick; the same item untagged is", () => {
    expect(shelvesWithItems([prepared], sections)).toEqual([]);
    expect(shelvesWithItems([untagged], sections)[0].items).toHaveLength(1);
    expect(expiringItems([prepared])).toEqual([]);
    expect(expiringItems([untagged])).toHaveLength(1);
  });
});

describe("Proteins", () => {
  it("never look at Inventory: the chicken filter finds the same recipes either way", () => {
    const ids = (k) =>
      findRecipes(rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: k }).ranked, { protein: "chicken" })
        .tiles.map((x) => x.recipe.id)
        .sort();
    expect(ids(kitchen(prepared))).toEqual(ids(kitchen()));
    expect(ids(kitchen(untagged))).toEqual(ids(kitchen()));
    expect(ids(kitchen())).toEqual(["bowl", "plain", "stirfry"]);
  });
});

describe("Makeable", () => {
  it("a recipe of just chicken is not makeable from a tagged pastry, and is from an untagged one", () => {
    const ready = (k) => makeableNow(recipes, k, true).ready.map((m) => m.recipe.id);
    expect(ready(kitchen(prepared))).toEqual([]);
    expect(ready(kitchen(untagged))).toEqual(["plain"]);
  });

  it("the Makeable page puts it under 'needs a shop' when tagged", () => {
    const sections = (k) => {
      const tiles = findRecipes(rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: k }).ranked, { makeable: true, includeSides: true }).tiles;
      return Object.fromEntries(makeableSections(tiles, new Map()).map((s) => [s.id, s.tiles.map((x) => x.recipe.id).sort()]));
    };
    expect(sections(kitchen(prepared)).ready).toBeUndefined();
    expect(sections(kitchen(untagged)).ready).toEqual(["plain"]);
  });
});

describe("the Grocery list's 'Already at home'", () => {
  const plan = [
    {
      id: "m1",
      dayOfWeek: 0,
      mealType: "dinner",
      recipe: { id: "stirfry", title: "Stir-fry", baseServings: 2, ingredients: [{ name: "chicken breast", quantity: 1, unit: "" }, { name: "broccoli", quantity: 1, unit: "" }] },
    },
  ];
  const names = (list) => list.map((i) => i.name);

  it("keeps the chicken on the list when the pastry is tagged, and folds it under 'Already at home' when it is not", () => {
    const tagged = splitAtHome(buildGroceryList(plan, [], []), kitchen(prepared));
    expect(names(tagged.toBuy)).toEqual(["Broccoli", "Chicken breast"]);
    expect(tagged.atHome).toEqual([]);
    const plain = splitAtHome(buildGroceryList(plan, [], []), kitchen(untagged));
    expect(names(plain.toBuy)).toEqual(["Broccoli"]);
    expect(names(plain.atHome.map((r) => r.item))).toEqual(["Chicken breast"]);
  });
});

describe("the item pop-up's 'N of your recipes use X'", () => {
  it("counts through the matcher (French names, varieties), and is nothing for a meal", () => {
    const poulet = { id: "p", name: "Poulet", location: "fridge" };
    expect(recipesUsingItem(poulet, recipes).map((r) => r.id)).toEqual(["plain", "bowl", "stirfry"]);
    expect(recipesUsingItem(prepared, recipes)).toEqual([]);
    expect(recipesUsingItem({ id: "l", name: "Chicken stew", isLeftover: true }, recipes)).toEqual([]);
  });
});

describe("planning a prepared meal, through the leftovers path", () => {
  const leftover = { id: "l", name: "Chili", isLeftover: true, quantity: 2, unit: "portion", expiresAt: inDays(1) };
  const lasagna = { id: "las", name: "Lasagna", isPreparedMeal: true, quantity: 2, unit: "box", expiresAt: inDays(5) };
  const eaten = { id: "e", name: "Perogies", isPreparedMeal: true, quantity: 0, expiresAt: inDays(3) };

  it("is offered with the leftovers in the Planner search, soonest use-by first", () => {
    const items = [lasagna, leftover, eaten, prepared, { id: "chk", name: "Chicken", quantity: 1, expiresAt: inDays(1) }];
    expect(plannableMeals(items, []).map((r) => r.item.id)).toEqual(["l", "pastry", "las"]);
    expect(plannableMeals(items, [], "lasa").map((r) => r.item.id)).toEqual(["las"]);
  });

  it("is named « Plat préparé · name · amount » and leftovers keep their name", () => {
    expect(mealTitle(lasagna)).toBe("Prepared meal · Lasagna · 2 boxes");
    expect(mealTitle({ ...lasagna, quantity: 1 })).toBe("Prepared meal · Lasagna · 1 box");
    expect(mealTitle({ ...lasagna, quantity: null, unit: null })).toBe("Prepared meal · Lasagna");
    expect(mealTitle(leftover)).toBe("Leftovers · Chili · 2 portions");
  });

  it("a planned meal eating one is a prepared meal: by its Inventory item, else by its note's name", () => {
    const entry = (id, extra) => ({ id, isLeftover: true, recipe: { isPlaceholder: true, title: "x" }, ...extra });
    const entries = [
      entry("a", { leftoverItemId: "las" }),
      entry("b", { leftoverItemId: "l" }),
      entry("c", { leftoverItemId: "gone", recipe: { isPlaceholder: true, title: "Plat préparé · Pierogi" } }),
      entry("d", { leftoverItemId: "gone", recipe: { isPlaceholder: true, title: "Restes · pizza" } }),
      entry("e", { isLeftover: false, leftoverItemId: "las" }),
    ];
    expect([...preparedEntryIds(entries, [lasagna, leftover])].sort()).toEqual(["a", "c"]);
  });
});

describe("the Prepared meal switch is saved with the item", () => {
  const base = { name: "Lasagna", qtyText: "1", unit: "box", location: "freezer", category: "Other", expiresAt: "2026-12-01", photo: null };

  it("Add item sends the flag only when it is on", () => {
    expect(buildAddPayload({ ...base, isPreparedMeal: true }).isPreparedMeal).toBe(true);
    expect(buildAddPayload({ ...base, isPreparedMeal: false })).not.toHaveProperty("isPreparedMeal");
    expect(buildAddPayload(base)).not.toHaveProperty("isPreparedMeal");
  });

  it("Save changes sends it only when it changed", () => {
    const item = { name: "Lasagna", quantity: 1, unit: "box", location: "freezer", expiresAt: "2026-12-01", imageUrl: null };
    expect(buildEditPatch(item, { ...base, isPreparedMeal: true })).toEqual({ isPreparedMeal: true });
    expect(buildEditPatch({ ...item, isPreparedMeal: true }, { ...base, isPreparedMeal: true })).toEqual({});
    expect(buildEditPatch({ ...item, isPreparedMeal: true }, { ...base, isPreparedMeal: false })).toEqual({ isPreparedMeal: false });
    // A leftover's form never sends it.
    expect(buildEditPatch(item, { ...base, isPreparedMeal: undefined })).toEqual({});
  });
});
