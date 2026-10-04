import { recipesLine } from "../lib/groceryList.js";
import { t } from "../i18n/index.js";

// The small line under a grocery item: the recipes it's for ("Tacos, Chili",
// or "Tacos, Chili +1" when there are more than two). The names share one line
// and end in an ellipsis when they're too long; the "+1" never gets cut off.
// A hand-added item has no recipes and shows nothing, but the line is always
// there (`className` sets its fixed height), so every row stays the same size.
export function RecipesLine({ usedIn, className }) {
  const { names, more, all } = recipesLine(usedIn);
  return (
    <span className={className} title={all ? t("grocery.recipesTitle", { recipes: all }) : undefined}>
      {names && (
        <>
          <span className={`${className}-names`}>{names}</span>
          {more > 0 && <span className={`${className}-more`}>+{more}</span>}
        </>
      )}
    </span>
  );
}
