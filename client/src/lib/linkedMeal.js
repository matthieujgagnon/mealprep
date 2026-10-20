import { isNoteEntry } from "./plannerSlots.js";
import { isPreparedMeal, isPreparedNoteTitle, preparedNoteName } from "./mealItem.js";
import { formatFractionQuantity, unitLabel } from "./units.js";

// A planned prepared meal, or leftovers typed in by hand, has no recipe: the Planner holds
// it as a note (« Plat préparé · Lasagne », « Restes · pizza ») flagged `isLeftover` and
// linked to its Inventory item by `leftoverItemId`. This is what the Planner draws it as:
// a photo card like a recipe's (design: docs/design/prepared-tag/), never the note card.
//
// The ONE place that decides it, for the computer board, the phone board and Home's week
// strip (the calendar's day list gets the same answer from the server, plannedDays):
//   - a prepared meal is always a photo card (the striped placeholder when it has no photo);
//   - leftovers typed by hand are a photo card when their item has a photo, else the note.
// The photo is read live through the link, so a changed photo shows. The copy the entry
// keeps (`entry.photoUrl`) is only the fallback once the item has left Inventory (the last
// box was eaten).

const real = (url) => (url && url !== "none" ? url : null);
const LEFTOVER_NOTE_LEADS = ["Leftovers · ", "Restes · "];

// The name a note card shows without its « Restes · » / « Plat préparé · » lead: the card's
// sticker already says what it is.
function plainName(title) {
  const lead = LEFTOVER_NOTE_LEADS.find((l) => title.startsWith(l));
  return lead ? title.slice(lead.length) : preparedNoteName(title);
}

// "4 portions", "1 sac": what is left of the item, in the unit it was typed in. "" when it
// has no amount, or has left Inventory.
function amountOf(item) {
  if (!item || item.quantity == null) return "";
  return [formatFractionQuantity(item.quantity), unitLabel(item.unit, item.quantity)].filter(Boolean).join(" ");
}

// How a planned meal is drawn, or null when it stays a note (or a recipe card):
//   { prepared, name, photoUrl, fit, amount, item }
// `items` are the Inventory items (App's pantryInventory).
export function linkedMeal(entry, items = []) {
  if (!entry?.isLeftover || !isNoteEntry(entry)) return null;
  const item = entry.leftoverItemId ? items.find((i) => i.id === entry.leftoverItemId) || null : null;
  const title = entry.recipe?.title || "";
  const prepared = item ? isPreparedMeal(item) : isPreparedNoteTitle(title);
  if (!item && !entry.leftoverItemId && !prepared) return null;
  const photoUrl = item ? real(item.imageUrl) : real(entry.photoUrl);
  if (!prepared && !photoUrl) return null;
  return { prepared, name: plainName(title), photoUrl, fit: prepared ? "contain" : "cover", amount: amountOf(item), item };
}

// Every planned meal that is drawn as a linked photo card, by entry id.
export function linkedMeals(entries, items = []) {
  const out = new Map();
  for (const entry of entries || []) {
    const meal = linkedMeal(entry, items);
    if (meal) out.set(entry.id, meal);
  }
  return out;
}
