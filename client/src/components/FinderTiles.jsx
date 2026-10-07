import { SalePill } from "./RisoPills.jsx";
import { foodEmoji } from "../lib/dealEmoji.js";
import { saleFor } from "../lib/finder.js";
import { t } from "../i18n/index.js";

// The pieces the Makeable page (Finder layout="page") adds to a result tile:
// the two buttons under it, the "À acheter" popover, the "On your list" strip
// and a section's header. Design: docs/design/riso-v2-makeable/. They read the
// real grocery list through `grocery` ({ isOnList, add, remove, toggle } from
// App.jsx), so Grocery, the pop-out and these always agree.

// Similar recipes, and (only when something is missing) À acheter. The À acheter
// button is green when everything missing is on the list, and lighter green
// when "Show sales" is on and some of what is missing is on sale.
export function TileActions({ buy, grocery, deals, showSales, popOpen, short, onSimilar, onToggleBuy }) {
  const allOn = buy.length > 0 && buy.every((name) => grocery.isOnList(name));
  const someOnSale = showSales && buy.some((name) => saleFor(name, deals));
  return (
    <div className="fnd-card-actions">
      <button type="button" className="fnd-act" onClick={onSimilar}>
        {t(short ? "finder.similarShort" : "finder.similar")}
      </button>
      {buy.length > 0 && (
        <button
          type="button"
          className={`fnd-act buy${allOn ? " done" : someOnSale ? " sale" : ""}`}
          aria-expanded={popOpen}
          onClick={onToggleBuy}
        >
          {t("finder.toBuyButton")}
        </button>
      )}
    </div>
  );
}

// "ON YOUR LIST · 3": the items on the grocery list that some recipe on the page
// is missing, as chips that take the item off the list (the shared Undo toast),
// and a link to Grocery. This tile's own items come first; at most `MAX_CHIPS`
// are drawn, the rest are counted.
const MAX_CHIPS = 6;
export function ListStrip({ names, grocery, onOpenGrocery }) {
  const shown = names.slice(0, MAX_CHIPS);
  const more = names.length - shown.length;
  return (
    <div className="fnd-liststrip">
      <span className="fnd-caps small muted">{t("finder.onYourList", { count: names.length })}</span>
      <div className="fnd-liststrip-chips">
        {shown.map((name) => (
          <button
            key={name}
            type="button"
            className="fnd-listchip"
            aria-label={t("finder.takeOffListAria", { name })}
            onClick={() => grocery.toggle(name)}
          >
            {name}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        {more > 0 && <span className="fnd-listmore">+{more}</span>}
      </div>
      {onOpenGrocery && (
        <button type="button" className="fnd-listlink" onClick={onOpenGrocery}>
          {t("finder.openGrocery")}
        </button>
      )}
    </div>
  );
}

// The popover under a tile: one row per missing ingredient with + Ajouter (✓ Ajouté
// once it is on the real list; tap again to take it off), the sale line when
// "Show sales" is on and a real Flipp deal matches, and "Add all · N".
export function GroceryPopover({ buy, grocery, deals, showSales, onAdd }) {
  const left = buy.filter((name) => !grocery.isOnList(name));
  return (
    <div className="fnd-buypop" role="group" aria-label={t("finder.listCaps")}>
      <span className="fnd-caps small muted">{t("finder.listCaps")}</span>
      {buy.map((name) => {
        const on = grocery.isOnList(name);
        const sale = showSales ? saleFor(name, deals) : null;
        const emoji = foodEmoji(name) || "🛒";
        return (
          <div key={name} className="fnd-buyrow">
            <span className="fnd-buyrow-emoji" aria-hidden="true">
              {emoji}
            </span>
            <span className="fnd-buyrow-text">
              <span className="fnd-buyrow-name">{name}</span>
              {sale && (
                <span className="fnd-buyrow-sale">
                  <SalePill size="tag" percent={sale.percent} store={sale.store} price={sale.price} />
                </span>
              )}
            </span>
            <button
              type="button"
              className={`fnd-buyrow-add${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={on ? t("finder.takeOffListAria", { name }) : t("makeable.addToList", { name })}
              onClick={() => (on ? grocery.toggle(name) : onAdd([name]))}
            >
              {on ? t("finder.addedMark") : t("finder.addOne")}
            </button>
          </div>
        );
      })}
      {left.length > 0 && (
        <div className="fnd-buypop-foot">
          <button type="button" className="fnd-buypop-all" onClick={() => onAdd(left)}>
            {t("finder.addAllN", { count: left.length })}
          </button>
        </div>
      )}
    </div>
  );
}

// A section's header: title, count badge, a rule, and its description. The
// "week" section is collapsible (a chevron, closed by default).
export function SectionHeader({ id, count, open, onToggle }) {
  const title = (
    <>
      {onToggle && (
        <span className={`fnd-sec-chev${open ? "" : " closed"}`} aria-hidden="true" />
      )}
      <h2 className="fnd-sec-title">{t(`finder.sections.${id}`)}</h2>
      <span className={`fnd-sec-count ${id}`}>{count}</span>
    </>
  );
  return (
    <div className="fnd-sec-head">
      {onToggle ? (
        <button type="button" className="fnd-sec-toggle" aria-expanded={open} onClick={onToggle}>
          {title}
        </button>
      ) : (
        <div className="fnd-sec-toggle plain">{title}</div>
      )}
      <span className="fnd-sec-rule" aria-hidden="true" />
    </div>
  );
}
