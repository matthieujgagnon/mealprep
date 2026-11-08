import { t } from "../i18n/index.js";

// The bar at the top of Home while the account still has examples: « Ce sont des exemples. Retirer
// les exemples » / "These are examples. Remove examples". One tap on the button opens the sheet that
// says exactly what goes (App.jsx). Slim on purpose: Home is exactly the window tall.
export function ExamplesBanner({ onRemove }) {
  return (
    <div className="riso-theme examples-banner" data-theme="light" role="status">
      <span className="examples-banner-text">{t("examples.banner")}</span>
      <button type="button" className="examples-banner-btn" onClick={onRemove}>
        {t("examples.remove")}
      </button>
    </div>
  );
}
