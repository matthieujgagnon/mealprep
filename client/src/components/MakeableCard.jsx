import { useState } from "react";
import { RecipePhotoCard } from "./RecipePhotoCard.jsx";
import { DealDetailHost } from "./SaleTag.jsx";
import { foodEmoji } from "../lib/dealEmoji.js";
import { saleFor } from "../lib/finder.js";
import { findDealsFor } from "../lib/similarRecipes.js";
import { recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { captionTime, cardButtons, cardState, namesToAdd, pickPills, pillFontSize, saleCount } from "../lib/photoCard.js";
import { t } from "../i18n/index.js";

// The Makeable card (design: docs/design/riso-v2-recipe-cards/): the shared photo
// card (RecipePhotoCard, variant "panel") with a white panel under the photo:
//   - a pink "use soon" strip when something the recipe uses goes off within 3 days
//   - À acheter: what is missing as tickable pills (proteins left, the rest right),
//     at most four and a "+N" pill, each with a green % when it is really on sale
//   - the servings and the buttons for the situation (Cook + Plan when ready,
//     À acheter + Plan when one or two are short, Plan + À acheter when it needs
//     a shop), and "N on sale" at the end of the row
//   - the ingredient bar: have/total and COMPLETE or N MISSING
// Everything reads and writes the real thing: `grocery` is App.jsx's one set of
// grocery functions (a tick and À acheter change the list Grocery shows, and the
// shared toast offers Undo), sale marks come from the real Flipp `deals` and open
// the shared deal card, Cook is openRecipeCard, Plan is the slot picker.
//
//   tile        a finder result: { recipe, stats, nameOf, shared, picked }
//   soon        { name, days } from useSoonItem, or null
//   reason      the line the finder adds when sorting by a Main meal or Cook with
//   showSales   the Show sales switch: the % marks and "N on sale"
//   onOpen(recipe, rect)  tapping the photo, the title or the +N pill
//   onCook(recipe), onPlan(recipe), onOpenCirculaires(deal)

function MissingPill({ name, grocery, sale, showSale, saleOpen, onOpenSale }) {
  const on = grocery.isOnList(name);
  const label = name.toLocaleLowerCase();
  return (
    <span className="mkc-pill" style={{ fontSize: `${pillFontSize(label)}px` }}>
      <button
        type="button"
        className={`mkc-tick${on ? " on" : ""}`}
        aria-pressed={on}
        aria-label={on ? t("finder.takeOffListAria", { name: label }) : t("makeable.addToList", { name: label })}
        onClick={() => grocery.toggle(name)}
      >
        {on ? "✓" : ""}
      </button>
      <span className="mkc-emoji" aria-hidden="true">
        {foodEmoji(name) || "🛒"}
      </span>
      <span className="mkc-pill-name">{label}</span>
      {sale && showSale && (
        <button
          type="button"
          className={`mkc-sale${saleOpen ? " open" : ""}`}
          title={t("makeable.card.seeSale", { name: label })}
          aria-label={t("makeable.card.seeSale", { name: label })}
          onClick={onOpenSale}
        >
          %
        </button>
      )}
    </span>
  );
}

export function MakeableCard({ tile, soon, reason, grocery, deals, showSales, onOpen, onCook, onPlan, onOpenCirculaires }) {
  const { recipe, stats } = tile;
  const [saleName, setSaleName] = useState(null); // the missing ingredient whose deal card is open

  const names = stats.missing.map((core) => tile.nameOf(core));
  const state = cardState(stats);
  const ready = state === "ready";
  const allListed = names.length > 0 && names.every((name) => grocery.isOnList(name));
  const { left, right, more } = pickPills(names);
  const twoColumns = right.length > 0; // a recipe with no protein (or only proteins) is one column: its pills get the whole width
  const saleOf = (name) => saleFor(name, deals);
  const onSale = saleCount(names, saleOf);
  const slot = recipeSlot(recipe);
  const meal = slot ? t(`recipes.mealTypes.${slot}`) : "";
  const time = captionTime(recipeTotalMinutes(recipe));
  const open = (rect) => onOpen(recipe, rect);

  const pill = (item) => (
    <MissingPill
      key={item.name}
      name={item.name}
      grocery={grocery}
      sale={saleOf(item.name)}
      showSale={showSales}
      saleOpen={saleName === item.name}
      onOpenSale={() => setSaleName(item.name)}
    />
  );

  function button({ id, tone }) {
    if (id === "buy") {
      return allListed ? (
        <button key={id} type="button" className="mkc-btn done" aria-disabled>
          {t("makeable.card.added")}
        </button>
      ) : (
        <button key={id} type="button" className={`mkc-btn ${tone}`} onClick={() => grocery.addWithUndo(namesToAdd(names, grocery.isOnList))}>
          {t("makeable.card.buy")}
        </button>
      );
    }
    return (
      <button key={id} type="button" className={`mkc-btn ${tone}`} onClick={() => (id === "cook" ? onCook(recipe) : onPlan(recipe))}>
        {t(id === "cook" ? "makeable.card.cook" : "makeable.card.plan")}
      </button>
    );
  }

  // "+2": the ones that did not fit; it opens the recipe, which lists them all.
  const morePill =
    more > 0 ? (
      <button
        type="button"
        className="mkc-pill mkc-more"
        aria-label={t("makeable.card.moreAria", { count: more })}
        onClick={(e) => open(e.currentTarget.closest(".rpc").getBoundingClientRect())}
      >
        +{more}
      </button>
    ) : null;

  const saleInfo = saleName ? saleOf(saleName) : null;
  const emojiSoon = soon ? foodEmoji(soon.name) : null;

  return (
    <RecipePhotoCard
      variant="panel"
      className="mkc"
      ready={ready}
      title={recipe.title}
      photoUrl={recipe.photoUrl}
      caption={[meal, time].filter(Boolean).join(" · ")}
      openLabel={t("planner.open", { title: recipe.title })}
      onOpen={open}
    >
      {soon && (
        <div className="mkc-soon">
          <span className="mkc-soon-dot" aria-hidden="true" />
          {emojiSoon && (
            <span className="mkc-soon-emoji" aria-hidden="true">
              {emojiSoon}
            </span>
          )}
          <span className="mkc-soon-name">{soon.name}</span>{" "}
          <span className="mkc-soon-when">{soon.days === 0 ? t("makeable.card.useSoonToday") : t("makeable.card.useSoonDays", { count: soon.days })}</span>
        </div>
      )}
      <div className={`mkc-panel${soon ? " has-soon" : ""}`}>
        {reason && <span className="mkc-reason">{reason}</span>}
        {names.length > 0 && (
          <div className="mkc-buy">
            <span className="mkc-cap">{t("makeable.card.toBuy")}</span>
            <div className={`mkc-cols${twoColumns ? "" : " single"}`}>
              <div className="mkc-col">
                {left.map(pill)}
                {!twoColumns && morePill}
              </div>
              {twoColumns && (
                <div className="mkc-col">
                  {right.map(pill)}
                  {morePill}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mkc-foot">
          {recipe.baseServings > 0 && <span className="mkc-serves">{t("pills.serves", { count: recipe.baseServings })}</span>}
          <div className="mkc-actions">
            {cardButtons(state).filter((b) => b.id !== "buy" || names.length > 0).map(button)}
            {showSales && onSale > 0 && (
              <span className="mkc-salesum">
                <span className="mkc-salemark" aria-hidden="true">
                  %
                </span>
                {t("makeable.card.onSale", { count: onSale })}
              </span>
            )}
          </div>
        </div>
        <div className="mkc-progress">
          <span>{t("makeable.card.haveOf", { have: stats.matchedCount, total: stats.totalCount })}</span>
          <span>{ready ? t("makeable.card.complete") : t("makeable.card.missing", { count: stats.missingCount })}</span>
        </div>
        <div className="mkc-bar" aria-hidden="true">
          <div style={{ width: `${stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0}%` }} />
        </div>
      </div>
      {saleInfo && (
        <DealDetailHost
          key={saleInfo.deal.id}
          deal={saleInfo.deal}
          others={findDealsFor(saleName, deals).filter((d) => d.id !== saleInfo.deal.id)}
          listed={grocery.isOnList(saleName)}
          onList={() => (grocery.isOnList(saleName) ? grocery.toggle(saleName) : grocery.add([saleName], { dealId: saleInfo.deal.id }))}
          onOpenCirculaires={(deal) => {
            setSaleName(null);
            onOpenCirculaires(deal);
          }}
          onClose={() => setSaleName(null)}
        />
      )}
    </RecipePhotoCard>
  );
}
