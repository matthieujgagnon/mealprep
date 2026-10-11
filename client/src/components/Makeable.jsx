import { useMemo } from "react";
import { Finder } from "./Finder.jsx";
import { plannedDaysThisWeek } from "../lib/finder.js";
import { currentWeekStart } from "../lib/dates.js";
import { t } from "../i18n/index.js";

// The Makeable page ("What can I make?", design: docs/design/riso-v2-makeable):
// the title and the shared Finder as a page (layout="page"). Every recipe is
// sorted by what is missing from the Inventory into "Meals of the week", Ready
// now, One or two short and Needs a shop. Everything it needs comes in as props
// from App.jsx, which also keeps the one recipe pop-out and the one slot picker
// (Plan), so this page never draws its own.
//
//   finder          useFinder(), kept by App so the pop-out's Similar recipes can steer it
//   upcomingEntries every planned meal from today on (this week's make the first section)
//   grocery         { isOnList, add, remove, toggle, addWithUndo }, the real grocery list
//   deals, showSales, onToggleSales   the real Flipp deals and the Show sales switch
//   onCook, onPlan, onOpenFlyerDeal   a card's Cook (openRecipeCard), Plan (the slot picker) and
//                                     the deal card's "See in Flyers"
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
  onOpenPopout,
  popoutId,
  onCook,
  onPlan,
  onOpenFlyerDeal,
}) {
  const plannedDays = useMemo(() => plannedDaysThisWeek(upcomingEntries, currentWeekStart()), [upcomingEntries]);
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
        onOpenPopout={onOpenPopout}
        openId={popoutId}
      />
    </div>
  );
}
