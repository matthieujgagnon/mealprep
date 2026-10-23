import { InStockPill, SalePill } from "./RisoPills.jsx";
import { useInventoryLinks } from "./InventoryLinkPopup.jsx";
import { useIngredientNames } from "../lib/ingredientDisplay.js";
import { t } from "../i18n/index.js";

// The ingredient marks for the Planner's planned-meal card (so it agrees with the
// recipe card and every other page). A round ✓ says where an ingredient stands:
//   blue ✓    in your Inventory (the "you have" pills)
//   green ✓   not in Inventory, but on your grocery list; tap to take it off
//             (the caller's onToggleList shows the Undo toast), tap again to put it back
//   + (white) not in Inventory and not on the list; tap to put it on the list
// `have` and `buy` are [{ key, name }] from lib/inventoryMatch.js recipeHave.
// `saleOf(name)` (optional) gives a real flyer deal's green pill. `Section` is the
// wrapper each caller uses; `headingTag` the heading level.
// Beside each thing to buy a small ≈ button opens "I have it as…" (you keep it under
// another name; it links the two names and adds nothing to Inventory).
export function IngredientMarks({ have, buy, isOnList, onToggleList, saleOf, Section = "section", headingTag: H = "h3" }) {
  const links = useInventoryLinks();
  // What is drawn is in the language shown; the list, the sale lookup and the link keep the recipe's own name.
  const shown = useIngredientNames().name;
  return (
    <>
      {have.length > 0 && (
        <Section>
          <H className="ing-marks-caps">{t("finder.youHave", { count: have.length })}</H>
          <div className="ing-marks-pills ing-marks-have">
            {have.map((item) => (
              <InStockPill key={item.key} title={t("finder.haveTitle")}>
                {shown(item.name)}
              </InStockPill>
            ))}
          </div>
        </Section>
      )}

      {buy.length > 0 ? (
        <Section>
          <H className="ing-marks-caps">{t("finder.toBuy", { count: buy.length })}</H>
          <div className="ing-marks-pills">
            {buy.map((item) => {
              const listed = isOnList(item.name);
              const sale = saleOf?.(item.name);
              return (
                <span key={item.key} className="ing-marks-buy">
                  <button
                    type="button"
                    className={`riso-pill size-chip tone-yellow has-mark ing-marks-buy-pill${listed ? " listed" : ""}`}
                    aria-pressed={listed}
                    aria-label={listed ? t("finder.takeOffListAria", { name: shown(item.name) }) : t("makeable.addToList", { name: shown(item.name) })}
                    title={listed ? t("finder.onListTitle") : t("makeable.addToListTitle")}
                    onClick={() => onToggleList(item.name)}
                  >
                    <span className="riso-pill-mark" aria-hidden="true">
                      {listed ? "✓" : "+"}
                    </span>
                    {shown(item.name)}
                  </button>
                  {sale && <SalePill size="tag" percent={sale.percent} store={sale.store} price={sale.price} />}
                  {links && (
                    <button
                      type="button"
                      className="ing-marks-haveas"
                      aria-label={t("links.haveAsAria", { name: shown(item.name) })}
                      title={t("links.chipTitle")}
                      onClick={() => links.ask([item.name], { label: shown(item.name) })}
                    >
                      <span aria-hidden="true">≈</span>
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </Section>
      ) : (
        <p className="ing-marks-allhere">{t("finder.allHere")}</p>
      )}
    </>
  );
}
