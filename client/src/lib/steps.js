export function stepText(step) {
  return typeof step === "string" ? step : step?.text || "";
}

export function stepImage(step) {
  return typeof step === "string" ? null : step?.image || null;
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
