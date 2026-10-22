import { useEffect, useMemo, useState } from "react";
import { Finder } from "./Finder.jsx";
import { RemovedStrip } from "./RemovedStrip.jsx";
import { plannedDaysThisWeek } from "../lib/finder.js";
import { currentWeekStart } from "../lib/dates.js";
import { isHiddenFromMakeable, recipeSlotCaption } from "../lib/mealSlots.js";
import { t } from "../i18n/index.js";

// The Makeable page ("What can I make?", design: docs/design/riso-v2-makeable):
// the title and the shared Finder as a page (layout="page"). Every recipe is
// sorted by what is missing from the Inventory into "Meals of the week", Ready
// now, One or two short and Needs a shop. Everything it needs comes in as props
// from App.jsx, which also keeps the one recipe card and the one slot picker
// (Plan), so this page never draws its own. Under the finder, a recipe the person hid
// (« Masquer de Faisable », from the recipe card's ⋯ menu or the editor) is listed in the
// shared RemovedStrip, closed to begin with, with « Afficher de nouveau » to bring it back.
//
//   finder          useFinder(), kept by App so the search stays when you come back to the page
//   upcomingEntries every planned meal from today on (this week's make the first section)
//   grocery         { isOnList, add, remove, toggle, addWithUndo }, the real grocery list
//   deals, showSales, onToggleSales   the real Flipp deals and the Show sales switch
//   onCook, onPlan, onOpenFlyerDeal   a card's Cook (openRecipeCard), Plan (the slot picker) and
//                                     the deal card's "See in Flyers"
//   onShowAgain(recipe)   a hidden recipe's « Afficher de nouveau » (App.jsx handleSetMakeableHidden, toast with Undo)
export function Makeable({
  finder,
  recipes,
  pantryInventory,
  pantryLocations,
  inventoryLayout,
  kitchen,
  upcomingEntries,
  grocery,
  deals,
  showSales,
  onToggleSales,
  onOpenRecipe,
  openRecipeId,
  onCook,
  onPlan,
  onOpenFlyerDeal,
  onShowAgain,
}) {
  const plannedDays = useMemo(() => plannedDaysThisWeek(upcomingEntries, currentWeekStart()), [upcomingEntries]);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const hidden = useMemo(
    () => recipes.filter((r) => !r.isPlaceholder && isHiddenFromMakeable(r)).sort((a, b) => a.title.localeCompare(b.title)),
    [recipes]
  );
  // The strip goes when the last hidden recipe is shown again; the next one starts it closed.
  useEffect(() => {
    if (hidden.length === 0) setHiddenOpen(false);
  }, [hidden.length]);
  return (
    <div className="riso-theme mk-page" data-theme="light">
      <h1 className="mk-title">
        {t("makeable.title")} <span className="accent">{t("makeable.titleAccent")}</span>
      </h1>
      <Finder
        layout="page"
        finder={finder}
        recipes={recipes}
        pantryInventory={pantryInventory}
        pantryLocations={pantryLocations}
        inventoryLayout={inventoryLayout}
        kitchen={kitchen}
        upcomingEntries={upcomingEntries}
        plannedDays={plannedDays}
        grocery={grocery}
        deals={deals}
        showSales={showSales}
        onToggleSales={onToggleSales}
        onCook={onCook}
        onPlan={onPlan}
        onOpenFlyerDeal={onOpenFlyerDeal}
        onOpenRecipe={onOpenRecipe}
        openId={openRecipeId}
      />
      <RemovedStrip
        className="mk-hidden"
        label={t("makeable.hidden.label")}
        collapsible
        open={hiddenOpen}
        onToggle={() => setHiddenOpen(!hiddenOpen)}
        items={hidden.map((recipe) => ({
          key: recipe.id,
          name: recipe.title,
          meta: recipeSlotCaption(recipe) || t("makeable.hidden.noType"),
          putBackLabel: t("makeable.hidden.showAgain"),
          ariaLabel: t("makeable.hidden.showAgainAria", { title: recipe.title }),
          onPutBack: () => onShowAgain?.(recipe),
        }))}
      />
    </div>
  );
}
