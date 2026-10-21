import { Switch } from "./RisoControls.jsx";
import { PreparedTag } from "./RisoPills.jsx";
import { t } from "../i18n/index.js";

// The one « Plat préparé » switch, for an Inventory item (components/InventoryItemForm.jsx: a
// ready-made dish is a meal, not an ingredient) and for a recipe (components/RecipeEditor.jsx:
// nothing to cook). Its label IS the shared tag (size L), so the person sees what it will carry; the
// switch is ink when on (blue means "you have it"). `help` is the line under it; `hint` a note
// above that (the name looks like a ready meal), shown when there is one. Docs: docs/design/prepared-tag/.
export function PreparedMealSwitch({ on, onToggle, hint, help = t("preparedMeal.switchHelp") }) {
  return (
    <div className="riso-itemform-prepared">
      <div className="riso-itemform-prepared-row">
        <Switch tone="ink" on={on} onToggle={onToggle} label={t("preparedMeal.switch")} />
        <span className="riso-itemform-prepared-label">
          <PreparedTag size="l" />
        </span>
      </div>
      {hint && <p className="riso-itemform-prepared-hint">{hint}</p>}
      <p className="riso-itemform-prepared-help">{help}</p>
    </div>
  );
}
