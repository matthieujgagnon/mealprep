import { recipesLine } from "../lib/groceryList.js";
import { t } from "../i18n/index.js";

// The small line under a grocery item: the recipes it's for ("Tacos, Chili",
// or "Tacos +2" when there are three or more). The names share one line
// and end in an ellipsis when they're too long; the "+2" never gets cut off.
// A hand-added item has no recipes, and GroceryItem leaves the line out (its
// meta line says "Added by you" instead); every row stays the same size anyway
// (useEqualRowHeight).
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
