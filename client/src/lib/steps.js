import { t } from "../i18n/index.js";
import { formatQuantity } from "./units.js";
import { mentions, textWords } from "./ingredientMatch.js";

export function stepText(step) {
  return typeof step === "string" ? step : step?.text || "";
}

export function stepImage(step) {
  return typeof step === "string" ? null : step?.image || null;
}

// A short label prefix on an otherwise-normal step ("Prep: Chop the onions
// and mince the garlic.") — distinct from stepIsHeading below, which is a
// step that's *only* a label with nothing else on the line. Both can key
// off the same "short text ending in a colon" shape without conflicting,
// since a titled step always has more text after the colon.
// Letters in any language (a French recipe's "Rôtir:" or "Préparation :"), and French
// writes a space before the colon.
const STEP_TITLE_PREFIX = /^(\p{L}[\p{L} ]{1,24}?)[ \u00a0\u202f]?:\s+(?=\S)/u;

export function stepTitle(step) {
  const m = STEP_TITLE_PREFIX.exec(stepText(step));
  return m ? m[1].trim() : null;
}

export function stepBody(step) {
  return stepText(step).replace(STEP_TITLE_PREFIX, "");
}

// True if a step's text reads like a section header ("Make the Sauce:",
// "1. Prepare for Baking:") rather than an actual instruction — used to
// render it as a heading instead of a numbered step. This is a display-time
// heuristic, not a stored flag, so it works retroactively on any recipe
// (manual, imported, or already saved) without needing a schema change.
export function stepIsHeading(step) {
  const text = stepText(step).trim();
  if (!text.endsWith(":")) return false;
  const withoutNumber = text.replace(/^\d+[.)]\s*/, "");
  return withoutNumber.length > 0 && withoutNumber.length < 60;
}

// Display text for a heading step, with any leading "1." numbering and the
// trailing colon stripped — the UI supplies its own visual distinction.
export function stepHeadingText(step) {
  return stepText(step).replace(/^\d+[.)]\s*/, "").replace(/:\s*$/, "").trim();
}

// The first "N minutes"/"N hours" mentioned in a step — good enough for a
// single timer chip per step (multi-timer steps are rare, and the first
// duration mentioned is almost always the one that matters for pacing the
// rest of the step). Returns null when the step doesn't mention a duration.
const DURATION_RE = /\b(\d+)\s*(hour|hr|heure|minute|min)s?\b/i;

export function stepTimer(step) {
  const m = DURATION_RE.exec(stepText(step));
  if (!m) return null;
  const n = Number(m[1]);
  const isHours = m[2][0].toLowerCase() === "h";
  const seconds = isHours ? n * 3600 : n * 60;
  return { seconds, label: durationLabel(seconds) };
}

// A countdown's readout: "4:05", or with hours once it's an hour or more
// ("1:30:00", not "90:00").
export function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// A time split for editing, minutes and seconds ("1:30:00" is 90 minutes):
// 5400 -> { minutes: 90, seconds: 0 }. Hours aren't a field of their own, so
// a long timer can still be typed in minutes.
export function clockParts(totalSeconds) {
  const total = Math.max(0, Math.round(Number(totalSeconds) || 0));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

// The other way: what two fields hold, in seconds. Empty or junk reads as 0,
// seconds past 59 roll into minutes ("0 min 90 s" is 1:30), and nothing goes
// below zero or above 99 hours.
export function secondsFromParts(minutes, seconds) {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return Math.min(m * 60 + s, 99 * 3600);
}

// "3-minute", "20-minute", "1-hour", "1 h 30 min": the timer chip reads
// "Start 20-minute timer" (never MIN or HR in capitals). In French "20
// minutes", "1 heure": "Minuterie de 20 minutes".
export function durationLabel(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("steps.minutes", { count: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : t("steps.hours", { count: h });
}

const FRACTION_GLYPHS = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };
// A standalone number a step's prose might scale with servings: a mixed
// number ("1 1/2"), a plain fraction ("1/2"), a decimal, a plain integer,
// or one of the common fraction glyphs a pasted-in recipe sometimes uses.
const NUMBER_TOKEN_RE = /\b(\d+\s+\d\/\d|\d+\/\d|\d+\.\d+|\d+|[½⅓⅔¼¾⅛])\b/g;

function parseNumberToken(token) {
  if (token in FRACTION_GLYPHS) return FRACTION_GLYPHS[token];
  if (token.includes(" ")) {
    const [whole, frac] = token.split(" ");
    const [n, d] = frac.split("/").map(Number);
    return Number(whole) + n / d;
  }
  if (token.includes("/")) {
    const [n, d] = token.split("/").map(Number);
    return n / d;
  }
  return Number(token);
}

// Skip a duration ("20 minutes", "1 hr") right after the number — doubling
// servings doesn't mean doubling the time something roasts or rests.
const AFTER_DURATION_RE = /^\s*(hours?|hrs?|heures?|minutes?|mins?)\b/i;

// Scales the standalone numbers in a step's instruction text by the same
// factor the ingredient list scales by (servings / baseServings) — "add 2
// eggs" at double servings reads as "add 4 eggs". Deliberately narrow: only
// bare numbers are touched, not ones embedded in a larger word or a
// reference like "step 2"; a temperature ("350°F"), percentage ("2% milk"),
// or duration ("20 minutes") is detected below and left alone too, since
// scaling those would print a wrong instruction rather than just an
// unscaled one.
export function scaleStepText(step, scale) {
  const text = stepBody(step);
  if (!text || scale === 1) return text;
  return text.replace(NUMBER_TOKEN_RE, (match, _group, offset, full) => {
    // Skip numbers that are actually a temperature ("350°F"), a duration
    // ("20 minutes"), or a step/page reference ("step 2") — recognizable by
    // what follows them.
    const after = full.slice(offset + match.length, offset + match.length + 10);
    if (/^\s*[°%]/.test(after)) return match;
    if (AFTER_DURATION_RE.test(after)) return match;
    const value = parseNumberToken(match);
    if (!Number.isFinite(value)) return match;
    return formatQuantity(value * scale);
  });
}

// Which of the recipe's ingredients this step's text actually mentions, by the one
// matching in ingredientMatch.js (whole words, plural or singular, short names, and the
// other language's word for a food). It doesn't try to resolve a reference to an earlier
// step's output ("the seasoned chickpeas from step 2") since the recipe data has no
// structured link between steps to resolve that from. Cook mode's "For this step" rows
// and the prep page's step tags both come from this.
export function stepIngredients(step, ingredients) {
  const words = textWords(stepBody(step));
  return (ingredients || []).filter((ing) => mentions(words, ing.name));
}
