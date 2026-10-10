// The light or dark choice shared by the full-screen modes (Store mode and Cook
// mode): one saved value for this browser, so a choice made in one is the other's
// too. Dark until someone picks light. The button that changes it is
// components/ThemeSwitch.jsx, and hooks/useTheme.js ties the two together.

export const THEME_KEY = "mealprep-theme";
// Store mode saved its choice here before the switch was shared. It is read when
// the shared one isn't set yet, so an existing choice isn't lost.
export const LEGACY_THEME_KEY = "mealprep-store-mode-theme";
export const DEFAULT_THEME = "dark";

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const valid = (value) => (value === "light" || value === "dark" ? value : null);

export function readTheme(storage = browserStorage()) {
  try {
    return valid(storage?.getItem(THEME_KEY)) ?? valid(storage?.getItem(LEGACY_THEME_KEY)) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeTheme(theme, storage = browserStorage()) {
  const value = valid(theme);
  if (!value) return;
  try {
    storage?.setItem(THEME_KEY, value);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export const otherTheme = (theme) => (theme === "dark" ? "light" : "dark");
