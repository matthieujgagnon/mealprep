import { t } from "../i18n/index.js";

// The round ☀ / ☾ button that switches a full-screen mode between light and dark:
// the one in Store mode's top row and in Cook mode's top bar. It takes the colour
// of the text around it. Use it with `useTheme()` (hooks/useTheme.js), which keeps
// the choice for both.
export function ThemeSwitch({ dark, onToggle, className = "" }) {
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button type="button" className={`riso-theme-switch${className ? ` ${className}` : ""}`} onClick={onToggle} aria-label={label} title={label}>
      {dark ? "☀" : "☾"}
    </button>
  );
}
