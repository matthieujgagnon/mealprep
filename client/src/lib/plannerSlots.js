import { currentWeekStart, isPastDay } from "./dates.js";
import { dict, t } from "../i18n/index.js";

// Labels are read when used, so they're always in the current language.
export const MEAL_TYPES = ["breakfast", "lunch", "dinner"].map((id) => ({
  id,
  get label() {
    return t(`meals.${id}`);
  },
}));
export const MEAL_LABEL = {
  get breakfast() {
    return t("meals.breakfast");
  },
  get lunch() {
    return t("meals.lunch");
  },
  get dinner() {
    return t("meals.dinner");
  },
};
export const DAY_SHORT = new Proxy([0, 1, 2, 3, 4, 5, 6], {
  get(target, prop) {
    if (typeof prop === "string" && /^\d$/.test(prop)) return dict().days.short[Number(prop)];
    return Reflect.get(target, prop);
  },
});

// "Wed · Breakfast": a slot in words, on the slot card, the finder's "Add to"
// chip and the phone sheet's title.
export function slotLabel(slot) {
  return `${DAY_SHORT[slot.dayOfWeek]} · ${MEAL_LABEL[slot.mealType]}`;
}

// The weekend as runs of neighbouring days, each drawn as one block with a pink
// dotted line: [5, 6] is one run, [4, 6] is two (Fri, Sun). Days are 0 = Monday.
export function weekendRuns(days) {
  const sorted = [...new Set(days || [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  const runs = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.end === day - 1) last.end = day;
    else runs.push({ start: day, end: day });
  }
  return runs;
}

// "Sat Sun", "Fri Sat Sun": the weekend's days in the app's language, the way
// the weekend pill says them.
export function weekendDaysLabel(days) {
  const sorted = [...new Set(days || [])].sort((a, b) => a - b);
  return sorted.map((d) => dict().days.short[d].replace(/\.$/, "")).join(" ");
}

export function todayIndex() {
  return (new Date().getDay() + 6) % 7; // Monday = 0
}

export function slotKey(dayOfWeek, mealType) {
  return `${dayOfWeek}-${mealType}`;
}

// What "Clear" on a day removes: every meal, note and empty card planned there.
export function entriesOnDay(entries, dayOfWeek) {
  return entries.filter((e) => e.dayOfWeek === dayOfWeek);
}

// The Planner's quiet "Clear" under a day shows only when something is planned
// that day and the day is not before today (today keeps it).
export function canClearDay(entries, weekStart, dayOfWeek) {
  return !isPastDay(weekStart, dayOfWeek) && entriesOnDay(entries, dayOfWeek).length > 0;
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

// True when a written note is only emoji ("🥗", "🍕🍺"), so the card can
// show it big like a picture; any letter or digit keeps it normal text.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\s)+$/u;
export function isEmojiOnly(text) {
  const t = String(text || "").trim();
  return t !== "" && EMOJI_ONLY.test(t) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t);
}
