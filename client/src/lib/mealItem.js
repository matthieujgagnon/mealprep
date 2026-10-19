// "This Inventory item is a meal": a LEFTOVER (a cooked meal kept in portions) or a
// PREPARED MEAL (a ready-made dish the person tagged, like a frozen lasagna). The
// one rule for "not an ingredient" and "can be planned as a meal", on every page.
// server/src/lib/mealItem.js is the same rule for the server, and a test keeps the
// two in step.
//
// Use `item.isLeftover` on its own only where something is truly leftover-only:
// portions, fridge life, the Leftovers shelf, "cooked from a recipe". A planned
// meal's own `isLeftover` (the Planner's yellow card) is a different flag and is
// not read through this.
export function isMealItem(item) {
  return !!item && (item.isLeftover === true || item.isPreparedMeal === true);
}

// A prepared meal (tagged by the person), as opposed to a leftover.
export function isPreparedMeal(item) {
  return !!item && item.isPreparedMeal === true && item.isLeftover !== true;
}

// A prepared meal has no recipe, so the Planner holds it as a note named « Plat préparé ·
// lasagne » / "Prepared meal · lasagna" (planner.preparedNote). When the Inventory item
// it eats from has left Inventory (the last box was eaten), the note's name still says
// what it was. server/src/lib/mealItem.js has the same two leads, and a test keeps them
// equal to the strings.
export const PREPARED_NOTE_LEADS = ["Prepared meal · ", "Plat préparé · "];
export function isPreparedNoteTitle(title) {
  return typeof title === "string" && PREPARED_NOTE_LEADS.some((lead) => title.startsWith(lead));
}
// The meal's own name in such a note: « Lasagne » from « Plat préparé · Lasagne ».
export function preparedNoteName(title) {
  const lead = PREPARED_NOTE_LEADS.find((l) => typeof title === "string" && title.startsWith(l));
  return lead ? title.slice(lead.length) : title;
}
