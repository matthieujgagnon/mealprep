import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InStockPill, MealChip, Pill, PlannedPill, SalePill, TimePill } from "./RisoPills.jsx";
import { recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { haveAndBuy, plannedDayOf, saleFor } from "../lib/finder.js";
import { stepIsHeading, stepHeadingText, stepText } from "../lib/steps.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { t } from "../i18n/index.js";

// A recipe's pop-out (design: docs/design/riso-v2, Finder): time and servings,
// the meal, the day it is planned, what you have (green ✓), what to buy
// (yellow; tap to put it on, or take it off, the grocery list; IngredientMarks
// below says what the blue and green ✓ mean), the steps, and
// four buttons: Plan (first: it opens the slot picker), Cook, Similar recipes
// and Open the full recipe (Cook and the full recipe both open the recipe's card
// on the Recipes page, through App's openRecipeCard).
//
// This file holds the two halves of the one pop-out:
//   RecipePopout      the look. Props:
//     recipe        the recipe
//     plannedDay    0 = Monday when it is planned this week or later, else null
//     have, buy     [{ core, name }] from lib/finder.js haveAndBuy
//     isOnList(name)  whether that ingredient is on the grocery list
//     onToggleList(name)  puts it on the list, or takes it off
//     saleOf(name)  optional: the real flyer deal for an ingredient (lib/finder.js
//                   saleFor), shown as a green pill next to it
//     onPlan, onCook, onSimilar, onOpenFull   the four buttons (each optional)
//     onClose, from (the box of the card it grows out of)
//   RecipePopoutHost  works the lists out from the data every page already has
//     (haveCores, plannedEntries, the grocery functions) and renders RecipePopout.
//     App.jsx renders the one host, so Planner, Recipes and Home open the same pop-out.

const CLOSE_MS = 300;

function PopSection({ className = "", children }) {
  return <section className={`fnd-pop-section ${className}`.trim()}>{children}</section>;
}

// The ingredient marks, one piece for the pop-out and the Planner's meal card
// (so every page agrees). A round ✓ says where an ingredient stands:
//   blue ✓    in your Inventory (the "you have" pills)
//   green ✓   not in Inventory, but on your grocery list; tap to take it off
//             (the caller's onToggleList shows the Undo toast), tap again to put it back
//   + (white) not in Inventory and not on the list; tap to put it on the list
// `Section` is the wrapper each caller already uses; `headingTag` the heading level.
export function IngredientMarks({ have, buy, isOnList, onToggleList, saleOf, Section = "section", headingTag: H = "h3" }) {
  return (
    <>
      {have.length > 0 && (
        <Section>
          <H className="fnd-pop-caps">{t("finder.youHave", { count: have.length })}</H>
          <div className="fnd-pop-pills fnd-pop-have">
            {have.map((item) => (
              <InStockPill key={item.core} title={t("finder.haveTitle")}>
                {item.name}
              </InStockPill>
            ))}
          </div>
        </Section>
      )}

      {buy.length > 0 ? (
        <Section>
          <H className="fnd-pop-caps">{t("finder.toBuy", { count: buy.length })}</H>
          <div className="fnd-pop-pills">
            {buy.map((item) => {
              const listed = isOnList(item.name);
              const sale = saleOf?.(item.name);
              return (
                <span key={item.core} className="fnd-pop-buy">
                  <button
                    type="button"
                    className={`riso-pill size-chip tone-yellow has-mark fnd-buy-pill${listed ? " listed" : ""}`}
                    aria-pressed={listed}
                    aria-label={listed ? t("finder.takeOffListAria", { name: item.name }) : t("makeable.addToList", { name: item.name })}
                    title={listed ? t("finder.onListTitle") : t("makeable.addToListTitle")}
                    onClick={() => onToggleList(item.name)}
                  >
                    <span className="riso-pill-mark" aria-hidden="true">
                      {listed ? "✓" : "+"}
                    </span>
                    {item.name}
                  </button>
                  {sale && <SalePill size="tag" percent={sale.percent} store={sale.store} price={sale.price} />}
                </span>
              );
            })}
          </div>
        </Section>
      ) : (
        <p className="fnd-pop-allhere">{t("finder.allHere")}</p>
      )}
    </>
  );
}

export function RecipePopout({ recipe, plannedDay, have, buy, isOnList, onToggleList, saleOf, onPlan, onCook, onSimilar, onOpenFull, onClose: close, from }) {
  const closeRef = useRef(null);
  const popRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState(null);

  // The card the pop-out grows out of (and shrinks back into): the origin of
  // its scale is that card's centre.
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el || !from) return;
    const box = el.getBoundingClientRect();
    setOrigin(`${from.left + from.width / 2 - box.left}px ${from.top + from.height / 2 - box.top}px`);
  }, [from]);

  // Closing plays the animation backwards first (not with reduced motion).
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const onClose = () => {
    if (closing) return;
    if (reduced) {
      close();
      return;
    }
    setClosing(true);
    setTimeout(close, CLOSE_MS);
  };

  // The latest close, so the key listener and the focus are set up once.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && latestClose.current();
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  const steps = (recipe.instructions || []).filter((s) => stepText(s).trim());
  const numbered = steps.filter((s) => !stepIsHeading(s));
  const slot = recipeSlot(recipe);
  let stepNumber = 0;

  return createPortal(
    <div className={`riso-theme fnd-pop-backdrop${closing ? " closing" : ""}`} data-theme="light" onClick={onClose}>
      <div
        ref={popRef}
        className={`fnd-pop${closing ? " closing" : ""}`}
        style={origin ? { transformOrigin: origin } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={recipe.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fnd-pop-head">
          <div className="fnd-pop-titlewrap">
            <h2 className="fnd-pop-title">{recipe.title}</h2>
            <div className="fnd-pop-facts">
              <TimePill minutes={recipeTotalMinutes(recipe)} serves={recipe.baseServings} />
              {!recipeTotalMinutes(recipe) && recipe.baseServings ? (
                <Pill size="fact">{t("pills.serves", { count: recipe.baseServings })}</Pill>
              ) : null}
              {slot && <MealChip mealType={slot} />}
            </div>
          </div>
          <button ref={closeRef} type="button" className="fnd-pop-close" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="fnd-pop-body">
          <div className="fnd-pop-photo">
            {recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}
          </div>

          <div className="fnd-pop-info">
            {plannedDay != null && (
              <div className="fnd-pop-planned">
                <PlannedPill dayOfWeek={plannedDay} />
              </div>
            )}

            <IngredientMarks
              have={have}
              buy={buy}
              isOnList={isOnList}
              onToggleList={onToggleList}
              saleOf={saleOf}
              Section={PopSection}
            />

            <section className="fnd-pop-section fnd-pop-steps">
              <h3 className="fnd-pop-stepshead">{t("finder.steps", { count: numbered.length })}</h3>
              {steps.length > 0 ? (
                <ol className="fnd-pop-steplist">
                  {steps.map((step, i) => {
                    if (stepIsHeading(step)) {
                      return (
                        <li key={i} className="fnd-pop-stephead">
                          {stepHeadingText(step)}
                        </li>
                      );
                    }
                    stepNumber += 1;
                    return (
                      <li key={i} value={stepNumber}>
                        {stepText(step)}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="fnd-pop-nosteps">{t("finder.noSteps")}</p>
              )}
            </section>
          </div>
        </div>

        <footer className="fnd-pop-actions">
          {onPlan && (
            <button type="button" className="fnd-pop-btn primary" onClick={onPlan}>
              {t("finder.plan")}
            </button>
          )}
          {onCook && (
            <button type="button" className="fnd-pop-btn" onClick={onCook}>
              {t("planner.cook")}
            </button>
          )}
          {onSimilar && (
            <button type="button" className="fnd-pop-btn" onClick={onSimilar}>
              {t("finder.similar")}
            </button>
          )}
          {onOpenFull && (
            <button type="button" className="fnd-pop-btn soft" onClick={onOpenFull}>
              {t("finder.openFull")}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

// The pop-out with its lists worked out. `recipe` may be null (then nothing shows).
//   haveCores      what is on hand (lib/onHand.js haveCoresFor)
//   plannedEntries this week's and the upcoming entries, for the "Planned Wednesday" pill
//   grocery        { isOnList, add, remove, toggle } (toggle takes an item off the list
//                  with the Undo toast, or puts it back: App.jsx toggleGroceryItem)
//   deals, showSales  optional: green sale pills next to the things to buy
export function RecipePopoutHost({ recipe, from, haveCores, plannedEntries, grocery, deals, showSales = false, ...actions }) {
  const lists = useMemo(() => (recipe ? haveAndBuy(recipe, haveCores) : { have: [], buy: [] }), [recipe, haveCores]);
  if (!recipe) return null;
  return (
    <RecipePopout
      recipe={recipe}
      from={from}
      plannedDay={plannedDayOf(recipe.id, plannedEntries || [])}
      have={lists.have}
      buy={lists.buy}
      isOnList={grocery.isOnList}
      onToggleList={grocery.toggle}
      saleOf={showSales ? (name) => saleFor(name, deals) : undefined}
      {...actions}
    />
  );
}
