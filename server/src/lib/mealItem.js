// "This Inventory item is a meal": a LEFTOVER (a cooked meal kept in portions) or a
// PREPARED MEAL (a ready-made dish the person tagged, like a frozen lasagna). The one
// rule for "not an ingredient" and "can be planned as a meal" on the server.
// client/src/lib/mealItem.js is the same rule for the browser, and a test keeps the
// two in step. Use `item.isLeftover` on its own only where something is truly
// leftover-only (portions, fridge life, the Leftovers shelf).
export function isMealItem(item) {
  return !!item && (item.isLeftover === true || item.isPreparedMeal === true);
}

// A prepared meal has no recipe, so the Planner holds it as a note named « Plat préparé ·
// lasagne » / "Prepared meal · lasagna" (planner.preparedNote). When the Inventory item
// it eats from has left Inventory (the last box was eaten), the note's name still says
// what it was. The same two leads are in client/src/lib/mealItem.js, and a test keeps
// them equal to the strings.
export const PREPARED_NOTE_LEADS = ["Prepared meal · ", "Plat préparé · "];
export function isPreparedNoteTitle(title) {
  return typeof title === "string" && PREPARED_NOTE_LEADS.some((lead) => title.startsWith(lead));
}
