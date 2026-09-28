// "How it works" hint strips (design_handoff_riso) are dismissed per user
// per screen - there's no server-side per-user-preference table for this,
// so it's saved in localStorage keyed by both, the same durability
// tradeoff Home's/Makeable's own local theme toggles already accept.
const KEY_PREFIX = "mealprep-hint-dismissed";

export function isHintDismissed(userId, screenKey) {
  try {
    return localStorage.getItem(`${KEY_PREFIX}-${userId}-${screenKey}`) === "1";
  } catch {
    return false;
  }
}

export function dismissHint(userId, screenKey) {
  try {
    localStorage.setItem(`${KEY_PREFIX}-${userId}-${screenKey}`, "1");
  } catch {
    // localStorage unavailable (private browsing, etc.) - the strip just
    // reappears next visit, which is a harmless fallback.
  }
}
