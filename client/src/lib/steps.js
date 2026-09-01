export function stepText(step) {
  return typeof step === "string" ? step : step?.text || "";
}

export function stepImage(step) {
  return typeof step === "string" ? null : step?.image || null;
}
