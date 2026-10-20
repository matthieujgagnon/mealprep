import { itemCovers, haveItemFor, lineNeed, recipeLines, shortBy } from "./inventoryMatch.js";
import { isPreparedRecipe } from "./mealSlots.js";
import { formatQuantity, unitLabel } from "./units.js";
import { stepIsHeading, stepTimer } from "./steps.js";

// The logic behind the recipe card (components/RecipeDetailModal.jsx; design:
// docs/design/riso-v2-recipe-card/). Nothing here draws; it has unit tests in
// recipeCard.test.js.

// ---- Prices ---------------------------------------------------------------------
//
// Meal pricing (the rules are in docs/design/riso-v2-recipe-card/Meal pricing.md:
// the sale price, else the flyer's regular price, else the median) has not
// shipped. Until it does no ingredient has a price, so the card shows no $ amount
// anywhere and no Prices switch: the receipt's totals, the source tags, the
// estimate in the fact line and the footer's per-serving prices all wait on this.
// The Meal pricing ticket gives each receipt row a `price` and a `source`, saves
// the switch per account, and turns this on.
export const MEAL_PRICING_READY = false;

// Where a price comes from, in the order Meal pricing picks them.
export const PRICE_SOURCES = ["sale", "flyer", "median"];

// The receipt's totals from rows that carry a `price` (a number of dollars, an
// estimate): To buy, From inventory, This meal and per serving, with how many
// rows were priced out of all of them (for an honest "x of y priced"). A row
// without a price adds nothing.
export function receiptTotals(buyRows = [], haveRows = [], servings = 1) {
  const sum = (rows) => rows.reduce((total, row) => total + (Number.isFinite(row.price) ? row.price : 0), 0);
  const priced = [...buyRows, ...haveRows].filter((row) => Number.isFinite(row.price)).length;
  const toBuy = sum(buyRows);
  const fromInventory = sum(haveRows);
  const meal = toBuy + fromInventory;
  return { toBuy, fromInventory, meal, perServing: servings > 0 ? meal / servings : null, priced, total: buyRows.length + haveRows.length };
}

// ---- The receipt ------------------------------------------------------------------

// "900 g", "1 1/2 cups", "2": what a need (lineNeed) comes to. When the amounts of
// one food can't be added up, each is written ("1 cup + 2 tbsp"); "" when none
// is given.
export function amountText(need) {
  const one = (qty, unit) => (qty == null ? "" : `${formatQuantity(qty)}${unit ? ` ${unitLabel(unit, qty)}` : ""}`);
  if (!need) return "";
  if (need.quantity != null) return one(need.quantity, need.unit);
  return (need.parts || [])
    .map((part) => one(part.quantity, part.unit))
    .filter(Boolean)
    .join(" + ");
}

const unique = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];

// The receipt under the photo, at `servings`. Lines come from the one matcher
// (recipeLines, the same lines as recipeHave), so the card agrees with every page:
//   buy      [row]  not in your Inventory, then (`short`) the foods your Inventory
//                   holds too little of at these servings: the difference, in the
//                   recipe's unit ("400 g more")
//   have     [row]  in your Inventory: the amount the recipe uses, the item it
//                   comes from and `soon` (it wears the "Use soon!" sticker)
// A row is { key, name, names, need, amount, notes, groups } (+ short, item, soon).
// `soonItems` are the recipe's expiring items (expiringItemsIn).
export function recipeReceipt(recipe, kitchen, servings, { soonItems = [] } = {}) {
  const scale = (servings || recipe?.baseServings || 1) / (recipe?.baseServings || 1);
  const inventory = kitchen?.inventory || [];
  const lines = recipeLines(recipe, kitchen);
  const matching = { prepared: isPreparedRecipe(recipe) }; // a prepared recipe is had by a prepared meal of that name
  const buy = [];
  const short = [];
  const have = [];
  for (const line of lines) {
    const need = lineNeed(line.ingredients, scale);
    const row = {
      key: line.key,
      name: line.name,
      // The ingredient names the line is made of, as the recipe writes them (the
      // taught names behind a blue row are looked up by these).
      names: unique(line.ingredients.map((ing) => ing.name)),
      need,
      amount: amountText(need),
      notes: unique(line.ingredients.map((ing) => ing.notes)),
      groups: unique(line.ingredients.map((ing) => ing.group)),
    };
    if (!line.had) {
      buy.push(row);
      continue;
    }
    have.push({
      ...row,
      item: haveItemFor(line.name, inventory, matching),
      soon: line.ingredients.some((ing) => soonItems.some((item) => itemCovers(item.name, ing.name))),
    });
    const missing = shortBy(need, line.name, inventory, matching);
    if (missing > 0) {
      const more = { quantity: missing, unit: need.unit, parts: [] };
      short.push({ ...row, key: `${line.key}|more`, short: true, need: more, amount: amountText(more) });
    }
  }
  return { buy: [...buy, ...short], have };
}

// What "Add to grocery list" and a row's + put on the list: the name, and for a
// food you're short of, how much more (the shared add keeps it with the item).
export function groceryItemOf(row) {
  if (!row.short) return row.name;
  return { name: row.name, quantity: row.need.quantity, unit: row.need.unit };
}

// ---- Servings ---------------------------------------------------------------------

// The stepper on the receipt: one at a time, never under 1.
export function stepServings(servings, delta) {
  return Math.max(1, Math.round((servings || 1) + delta));
}

// ---- Steps ------------------------------------------------------------------------

// The steps to draw: every line of the recipe in order, a section label
// ("For the sauce:") as `heading`, the others numbered from 1 with `index`, their
// place among the numbered steps (what the rail and "STEP 2 OF 4" count), and
// `key`, their place in the recipe (what the shared step timers are kept by).
export function cardSteps(instructions = []) {
  let index = 0;
  return instructions.map((step, key) => (stepIsHeading(step) ? { key, step, heading: true } : { key, step, heading: false, index: index++ }));
}

// Where a step is: "done" before the current one, "current", or "todo". `current`
// can be the step count, when every step is done.
export function stepState(index, current) {
  return index < current ? "done" : index === current ? "current" : "todo";
}

// Clicking a step makes it current; clicking the current step marks it done and
// moves to the next one (past the last, everything is done).
export function nextCurrent(clicked, current) {
  return clicked === current ? current + 1 : clicked;
}

// The timer pill's look, from the shared step timers (useStepTimers' stateFor):
// "idle" (▶ Start 20 min), "running" (❚❚ 19:42), "paused" (▶ 19:42) or "done"
// (✓ Time's up). `started` shows the round ↺ beside it. A time changed in Cook
// mode's timer card is the idle pill's new length.
export function timerPill(state) {
  if (!state) return { kind: "idle", started: false };
  if (state.finished) return { kind: "done", started: true };
  if (state.running) return { kind: "running", started: true };
  if (state.paused) return { kind: "paused", started: true };
  return { kind: "idle", started: false };
}

// A step's own timer length in seconds (the first duration its text names), or null.
export function stepSeconds(step) {
  return stepTimer(step)?.seconds ?? null;
}
