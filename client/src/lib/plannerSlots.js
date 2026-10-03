import { currentWeekStart } from "./dates.js";
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

// True when a written note is only emoji ("🥗", "🍕🍺"), so the card can
// show it big like a picture; any letter or digit keeps it normal text.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\s)+$/u;
export function isEmojiOnly(text) {
  const t = String(text || "").trim();
  return t !== "" && EMOJI_ONLY.test(t) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t);
}
