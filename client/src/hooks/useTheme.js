import { useState } from "react";
import { otherTheme, readTheme, writeTheme } from "../lib/theme.js";

// The light or dark choice of a full-screen mode (Store mode, Cook mode): read
// from the one saved value when the mode opens, and saved again when changed.
// `<ThemeSwitch dark={dark} onToggle={toggle} />` is the button.
export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  function toggle() {
    const next = otherTheme(theme);
    setTheme(next);
    writeTheme(next);
  }
  return { theme, dark: theme === "dark", toggle };
}
