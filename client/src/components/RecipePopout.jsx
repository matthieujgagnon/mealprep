import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { InStockPill, MealChip, Pill, PlannedPill, SalePill, TimePill } from "./RisoPills.jsx";
import { recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { stepIsHeading, stepHeadingText, stepText } from "../lib/steps.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { t } from "../i18n/index.js";

// A recipe's pop-out (design: docs/design/riso-v2, Finder): time and servings,
// the meal, the day it is planned, what you have (green ✓), what to buy
// (yellow; tap to put it on, or take it off, the grocery list), the steps, and
// three buttons: Plan, Similar recipes and Open the full recipe. Shared by the
// Planner's finder and, next, Makeable.
//
//   recipe        the recipe
//   plannedDay    0 = Monday when it is planned this week or later, else null
//   have, buy     [{ core, name }] from lib/finder.js haveAndBuy
//   isOnList(name)  whether that ingredient is on the grocery list
//   onToggleList(name)  puts it on the list, or takes it off
//   saleOf(name)  optional: the real flyer deal for an ingredient (lib/finder.js
//                 saleFor), shown as a green pill next to it
//   plan          optional: { label, onClick } for the blue Plan button
//   onSimilar, onOpenFull, onClose

export function RecipePopout({ recipe, plannedDay, have, buy, isOnList, onToggleList, saleOf, plan, onSimilar, onOpenFull, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const steps = (recipe.instructions || []).filter((s) => stepText(s).trim());
  const numbered = steps.filter((s) => !stepIsHeading(s));
  const slot = recipeSlot(recipe);
  let stepNumber = 0;

  return createPortal(
    <div className="riso-theme fnd-pop-backdrop" data-theme="light" onClick={onClose}>
      <div
        className="fnd-pop"
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
            {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}
          </div>

          <div className="fnd-pop-info">
            {plannedDay != null && (
              <div className="fnd-pop-planned">
                <PlannedPill dayOfWeek={plannedDay} />
              </div>
            )}

            {have.length > 0 && (
              <section className="fnd-pop-section">
                <h3 className="fnd-pop-caps">{t("finder.youHave", { count: have.length })}</h3>
                <div className="fnd-pop-pills">
                  {have.map((item) => (
                    <InStockPill key={item.core}>{item.name}</InStockPill>
                  ))}
                </div>
              </section>
            )}

            {buy.length > 0 ? (
              <section className="fnd-pop-section">
                <h3 className="fnd-pop-caps">{t("finder.toBuy", { count: buy.length })}</h3>
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
                          aria-label={listed ? t("makeable.removeFromList", { name: item.name }) : t("makeable.addToList", { name: item.name })}
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
              </section>
            ) : (
              <p className="fnd-pop-allhere">{t("finder.allHere")}</p>
            )}

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
          {plan && (
            <button type="button" className="fnd-pop-btn primary" onClick={plan.onClick}>
              {plan.label}
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
