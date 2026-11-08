import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { addDays, quebecDay } from "./quebecDay.js";
import { mondayKey } from "./plannedDates.js";
import { normalizeLang } from "./i18n.js";
import { EXAMPLE_ITEMS, EXAMPLE_PLAN, EXAMPLE_RECIPES, examplePhoto } from "./exampleContent.js";

// Examples: what a new account starts with (recipes, a planned week, a stocked Inventory, all
// from lib/exampleContent.js), tagged « Exemple » and removable in one tap.
//
// HOW THEY ARE MARKED. Every example row has `isExample: true` (Recipe, PlannerEntry and
// PantryInventoryItem). The mark comes off, in the same save, when the person does something to
// the row: edits a recipe, plans it again, cooks it; moves or changes or cooks a planned meal;
// edits an Inventory item, changes where it is kept, or cooks from it (`liftMark`, called by the
// routes that save those). Time passing never lifts it: the app's own steps (a past day settling a
// planned prepared meal) leave it. `server/src/exampleMarkRule.test.js` lists every place that
// writes those three tables and fails when a new one has not said what it does to the mark.
//
// REMOVAL deletes only rows that still have the mark, and a marked recipe also stays when a
// planned meal that is not an example, or an Inventory leftover that is not an example, still uses
// it (deleting a recipe deletes its planned meals, so this is what keeps the person's own meals
// safe). Before it deletes, it saves an exact copy of what it removes (ExampleRemoval, one per
// account) and UNDO puts back exactly that copy, same ids, mark on, and nothing else: nothing a
// browser sends is trusted. The copy is replaced by the next removal, deleted by Undo or by adding
// examples again, and ignored after a day.
//
// Nothing here writes to Recently removed, the used-up log or Grocery: examples are not "used
// up", and the Grocery list is worked out from the plan.

// The signup and « Ajouter des exemples » switch: NEW_ACCOUNT_EXAMPLES=off stops new accounts
// getting examples without a deploy (the browser tests' server runs with it off, except one).
export const examplesEnabled = (env = process.env) => String(env.NEW_ACCOUNT_EXAMPLES ?? "").trim().toLowerCase() !== "off";

// Signup waits at most this long for the examples; past it the account is made without them.
export const EXAMPLES_TIMEOUT_MS = 10_000;

// How long Undo can still put the examples back.
export const UNDO_KEEP_MS = 24 * 60 * 60 * 1000;

const exampleLang = (lang) => normalizeLang(lang) || "fr";
const newId = () => randomUUID();

// 0 = Monday ... 6 = Sunday, for a "YYYY-MM-DD" day.
const dayOfWeekOf = (key) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;

// The rows of the examples for one account, ready for createMany, with their ids made here so each
// table is one insert. Days are Quebec days counted from the day `now` falls on; a use-by date is
// the day itself (midnight UTC, the way a typed use-by date is saved).
export function buildExampleRows(userId, { lang = "fr", now = new Date() } = {}) {
  const language = exampleLang(lang);
  const today = quebecDay(now);
  const recipes = [];
  const ingredients = [];
  const idOf = new Map();
  for (const spec of EXAMPLE_RECIPES) {
    const id = newId();
    idOf.set(spec.slug, id);
    const photo = examplePhoto(spec.slug);
    recipes.push({
      id,
      userId,
      title: spec.title[language],
      notes: spec.notes[language],
      photoUrl: photo,
      photos: JSON.stringify([photo]),
      inCookbook: true,
      inImported: false,
      baseServings: spec.servings,
      prepTimeMinutes: spec.prep ?? null,
      cookTimeMinutes: spec.cook ?? null,
      fridgeLifeDays: spec.fridgeLifeDays ?? null,
      instructions: JSON.stringify(spec.steps[language]),
      tags: "[]",
      mealSlots: spec.mealSlots,
      isPrepared: spec.isPrepared === true,
      isExample: true,
    });
    spec.ingredients.forEach((ingredient, position) => {
      ingredients.push({
        id: newId(),
        recipeId: id,
        name: ingredient.name[language],
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        notes: ingredient.notes?.[language] ?? null,
        group: null,
        position,
      });
    });
  }
  const entries = EXAMPLE_PLAN.map((plan) => {
    const day = addDays(today, plan.day);
    return {
      id: newId(),
      userId,
      weekStart: mondayKey(day),
      dayOfWeek: dayOfWeekOf(day),
      mealType: plan.meal,
      recipeId: idOf.get(plan.recipe),
      isLeftover: plan.leftover === true,
      position: 0,
      isExample: true,
    };
  });
  const items = EXAMPLE_ITEMS.map((spec) => {
    const name = spec.name[language];
    return {
      id: newId(),
      userId,
      name,
      core: name.toLowerCase(),
      category: spec.category,
      quantity: spec.quantity,
      unit: spec.unit ?? null,
      location: spec.kept,
      shelf: null,
      purchasedAt: now,
      expiresAt: new Date(`${addDays(today, spec.days)}T00:00:00.000Z`),
      isPreparedMeal: spec.prepared === true,
      isExample: true,
    };
  });
  return { recipes, ingredients, entries, items };
}

// What adding the examples would add, for the « Ajouter des exemples » sheet: the counts and the
// Inventory names in the language they would be made in.
export function exampleSummary(lang) {
  const language = exampleLang(lang);
  return {
    recipes: EXAMPLE_RECIPES.length,
    plannedMeals: EXAMPLE_PLAN.length,
    inventoryItems: EXAMPLE_ITEMS.length,
    itemNames: EXAMPLE_ITEMS.map((spec) => spec.name[language]),
  };
}

const marked = (userId) => ({ userId, isExample: true });

// Whether the account has any example row left.
export async function hasExamples(db, userId) {
  const [recipe, entry, item] = await Promise.all([
    db.recipe.findFirst({ where: marked(userId), select: { id: true } }),
    db.plannerEntry.findFirst({ where: marked(userId), select: { id: true } }),
    db.pantryInventoryItem.findFirst({ where: marked(userId), select: { id: true } }),
  ]);
  return !!(recipe || entry || item);
}

// Adds the examples to an account, in one transaction (all of them or none), in `lang`. Refuses
// (returns null) when the account already has examples. Resolves with the counts added.
export async function createExamples(userId, { lang = "fr", now = new Date(), db = prisma } = {}) {
  if (await hasExamples(db, userId)) return null;
  const rows = buildExampleRows(userId, { lang, now });
  await db.$transaction(
    async (tx) => {
      await tx.exampleRemoval.deleteMany({ where: { userId } });
      await tx.recipe.createMany({ data: rows.recipes });
      await tx.ingredient.createMany({ data: rows.ingredients });
      await tx.plannerEntry.createMany({ data: rows.entries });
      await tx.pantryInventoryItem.createMany({ data: rows.items });
    },
    { maxWait: 5000, timeout: EXAMPLES_TIMEOUT_MS }
  );
  return { recipes: rows.recipes.length, plannedMeals: rows.entries.length, inventoryItems: rows.items.length };
}

// What « Retirer les exemples » would take, by id: every marked planned meal and Inventory item,
// and every marked recipe that nothing of the person's own still uses. A marked recipe that
// something of theirs uses stays (`keptRecipes`); it is theirs.
export async function planRemoval(db, userId) {
  const [recipes, entries, items] = await Promise.all([
    db.recipe.findMany({ where: marked(userId), select: { id: true } }),
    db.plannerEntry.findMany({ where: marked(userId), select: { id: true } }),
    db.pantryInventoryItem.findMany({ where: marked(userId), select: { id: true } }),
  ]);
  const recipeIds = recipes.map((r) => r.id);
  const inUse = new Set();
  if (recipeIds.length > 0) {
    const [meals, leftovers] = await Promise.all([
      db.plannerEntry.findMany({ where: { userId, isExample: false, recipeId: { in: recipeIds } }, select: { recipeId: true } }),
      db.pantryInventoryItem.findMany({ where: { userId, isExample: false, recipeId: { in: recipeIds } }, select: { recipeId: true } }),
    ]);
    for (const m of meals) inUse.add(m.recipeId);
    for (const l of leftovers) inUse.add(l.recipeId);
  }
  return {
    recipes: recipeIds.filter((id) => !inUse.has(id)),
    keptRecipes: recipeIds.filter((id) => inUse.has(id)),
    entries: entries.map((e) => e.id),
    items: items.map((i) => i.id),
  };
}

const countsOf = (plan) => ({ recipes: plan.recipes.length, plannedMeals: plan.entries.length, inventoryItems: plan.items.length });
const totalOf = (counts) => counts.recipes + counts.plannedMeals + counts.inventoryItems;

// The numbers the banner, the account menu and the confirm sheet show: exactly what removing the
// examples would take right now.
export async function exampleCounts(userId, db = prisma) {
  const counts = countsOf(await planRemoval(db, userId));
  return { ...counts, total: totalOf(counts) };
}

// Removes the examples (see the top of the file). Resolves with the counts removed.
export async function removeExamples(userId, db = prisma) {
  return db.$transaction(async (tx) => {
    const plan = await planRemoval(tx, userId);
    const none = { recipes: 0, plannedMeals: 0, inventoryItems: 0 };
    if (totalOf(countsOf(plan)) === 0) {
      // Nothing to take; a marked recipe the person uses is theirs, so it stops wearing the mark.
      await tx.recipe.updateMany({ where: { userId, isExample: true, id: { in: plan.keptRecipes } }, data: { isExample: false } });
      return none;
    }
    const [recipes, entries, items] = await Promise.all([
      tx.recipe.findMany({ where: { userId, id: { in: plan.recipes } }, include: { ingredients: true } }),
      tx.plannerEntry.findMany({ where: { userId, id: { in: plan.entries } } }),
      tx.pantryInventoryItem.findMany({ where: { userId, id: { in: plan.items } } }),
    ]);
    // Dates become text here, so the copy is plain JSON.
    const snapshot = JSON.parse(JSON.stringify({ recipes, entries, items }));
    await tx.exampleRemoval.upsert({ where: { userId }, create: { userId, snapshot }, update: { snapshot, removedAt: new Date() } });

    const entriesGone = await tx.plannerEntry.deleteMany({ where: { userId, isExample: true, id: { in: plan.entries } } });
    const itemsGone = await tx.pantryInventoryItem.deleteMany({ where: { userId, isExample: true, id: { in: plan.items } } });
    // The recipe goes only while no planned meal and no leftover uses it: the guard is in the delete itself.
    const recipesGone = await tx.recipe.deleteMany({
      where: { userId, isExample: true, id: { in: plan.recipes }, plannerEntries: { none: {} }, leftoverItems: { none: {} } },
    });
    await tx.recipe.updateMany({ where: { userId, isExample: true, id: { in: plan.keptRecipes } }, data: { isExample: false } });
    return { recipes: recipesGone.count, plannedMeals: entriesGone.count, inventoryItems: itemsGone.count };
  });
}

// The fields Undo puts back, by table (the copy is JSON, so these dates are text again).
const RECIPE_FIELDS = ["title", "sourceUrl", "photoUrl", "photos", "notes", "inCookbook", "inImported", "isPlaceholder", "baseServings", "prepTimeMinutes", "cookTimeMinutes", "fridgeLifeDays", "instructions", "tags", "mealSlots", "isPrepared", "hiddenFromMakeable", "position"];
const INGREDIENT_FIELDS = ["name", "quantity", "unit", "notes", "group", "position"];
const ENTRY_FIELDS = ["weekStart", "dayOfWeek", "mealType", "servings", "isLeftover", "alreadyHave", "position", "leftoverItemId", "photoUrl"];
const ITEM_FIELDS = ["name", "core", "category", "quantity", "unit", "location", "shelf", "imageUrl", "isLeftover", "isPreparedMeal"];

const pick = (from, fields) => Object.fromEntries(fields.filter((f) => from[f] !== undefined).map((f) => [f, from[f]]));
const when = (value) => (value ? new Date(value) : undefined);

// Puts back what the last removal took, exactly: the same rows with the same ids and the mark on.
// A row that exists again by the same id is left as it is. Resolves with the counts put back, or
// null when there is nothing to undo (no copy, or one older than a day).
export async function undoRemoval(userId, { db = prisma, now = new Date() } = {}) {
  const saved = await db.exampleRemoval.findUnique({ where: { userId } });
  if (!saved) return null;
  if (now.getTime() - new Date(saved.removedAt).getTime() > UNDO_KEEP_MS) {
    await db.exampleRemoval.deleteMany({ where: { userId } });
    return null;
  }
  const { recipes = [], entries = [], items = [] } = saved.snapshot || {};
  return db.$transaction(async (tx) => {
    const have = async (table, list) => new Set((await tx[table].findMany({ where: { id: { in: list.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
    const [haveRecipes, haveEntries, haveItems] = await Promise.all([have("recipe", recipes), have("plannerEntry", entries), have("pantryInventoryItem", items)]);

    const newRecipes = recipes.filter((r) => !haveRecipes.has(r.id));
    await tx.recipe.createMany({
      data: newRecipes.map((r) => ({ ...pick(r, RECIPE_FIELDS), id: r.id, userId, createdAt: when(r.createdAt), updatedAt: when(r.updatedAt), isExample: true })),
    });
    await tx.ingredient.createMany({
      data: newRecipes.flatMap((r) => (r.ingredients || []).map((g) => ({ ...pick(g, INGREDIENT_FIELDS), id: g.id, recipeId: r.id }))),
    });
    // A planned meal needs its recipe: one whose recipe is gone is not put back.
    const recipeIds = new Set((await tx.recipe.findMany({ where: { userId, id: { in: entries.map((e) => e.recipeId) } }, select: { id: true } })).map((r) => r.id));
    const newEntries = entries.filter((e) => !haveEntries.has(e.id) && recipeIds.has(e.recipeId));
    await tx.plannerEntry.createMany({
      data: newEntries.map((e) => ({ ...pick(e, ENTRY_FIELDS), id: e.id, userId, recipeId: e.recipeId, cookedAt: when(e.cookedAt) ?? null, createdAt: when(e.createdAt), isExample: true })),
    });
    const newItems = items.filter((s) => !haveItems.has(s.id));
    await tx.pantryInventoryItem.createMany({
      data: newItems.map((s) => ({ ...pick(s, ITEM_FIELDS), id: s.id, userId, purchasedAt: when(s.purchasedAt), expiresAt: when(s.expiresAt) ?? null, createdAt: when(s.createdAt), isExample: true })),
    });
    await tx.exampleRemoval.deleteMany({ where: { userId } });
    return { recipes: newRecipes.length, plannedMeals: newEntries.length, inventoryItems: newItems.length };
  });
}

// Takes the example mark off rows the person has just done something to. Called by the routes
// that save a recipe, a planned meal or an Inventory item for the person (never by the app's own
// steps), in the same request as the save. Ids not marked are ignored.
export async function liftMark(db, userId, { recipeIds = [], entryIds = [], itemIds = [] } = {}) {
  const lift = (table, ids) => (ids.length > 0 ? db[table].updateMany({ where: { userId, isExample: true, id: { in: ids } }, data: { isExample: false } }) : null);
  await Promise.all([lift("recipe", recipeIds), lift("plannerEntry", entryIds), lift("pantryInventoryItem", itemIds)]);
}
