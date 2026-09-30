import { currentWeekStart } from "./dates.js";

export const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
];
export const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function todayIndex() {
  return (new Date().getDay() + 6) % 7; // Monday = 0
}

export function slotKey(dayOfWeek, mealType) {
  return `${dayOfWeek}-${mealType}`;
}

// The "no meal planned" marker and custom notes are placeholder recipes under
// the hood (see server/src/routes/planner.js POST /blank), so they sit in a
// slot like any meal.
export function isBlankMarker(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title === "No meal planned";
}

export function isCustomNote(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title !== "No meal planned";
}

export function isNoteEntry(entry) {
  return !!entry.recipe?.isPlaceholder;
}

// Slots in the order "+" and "Fill empty slots" use them: upcoming days
// first (today onward for this week - earlier days are already gone), and
// within a day dinner, then lunch, then breakfast.
export function upcomingSlots(weekStart) {
  const first = weekStart === currentWeekStart() ? todayIndex() : 0;
  const slots = [];
  for (let day = first; day < 7; day++) {
    for (const mealType of ["dinner", "lunch", "breakfast"]) slots.push({ dayOfWeek: day, mealType });
  }
  return slots;
}

export function emptyUpcomingSlots(entries, weekStart) {
  const filled = new Set(entries.map((e) => slotKey(e.dayOfWeek, e.mealType)));
  return upcomingSlots(weekStart).filter((s) => !filled.has(slotKey(s.dayOfWeek, s.mealType)));
}

export function findNextEmptySlot(entries, weekStart) {
  return emptyUpcomingSlots(entries, weekStart)[0] || null;
}
