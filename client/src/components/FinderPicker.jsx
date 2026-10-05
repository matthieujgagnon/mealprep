import { useState } from "react";
import { foodEmoji } from "../lib/dealEmoji.js";
import { matchesIngredientSearch } from "../lib/finder.js";
import { t } from "../i18n/index.js";

// "Cook with" (the finder's ingredient picker): a search box, "Expiring soon"
// first with the days left, then the user's own Inventory shelves as drawers
// (Fridge, Freezer, Pantry and any shelf they added). Each drawer's name pill
// holds its count ("6", or "1/6" once something is picked). A pick is a light
// blue pill with a small blue ✓. There is no Done button: the × closes it.
//
//   expiring   [{ key, name, days, item }] from lib/finder.js expiringItems
//   shelves    [{ id, label, tone, items: [{ key, name, item }] }]
//   picked     a Set of the picked keys
//   onToggle(item)  picks or unpicks
//   onClose

function ItemPill({ item, picked, onToggle, days }) {
  const emoji = foodEmoji(item.name, item.item?.category);
  return (
    <button
      type="button"
      className={`fnd-item${picked ? " picked" : ""}`}
      aria-pressed={picked}
      onClick={() => onToggle(item)}
    >
      {emoji && (
        <span className="fnd-item-emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      {item.name}
      {days != null && (
        <>
          <span className="fnd-item-rule" aria-hidden="true" />
          <span className="fnd-item-days">{t("finder.daysLeft", { days })}</span>
        </>
      )}
      {picked && (
        <span className="fnd-item-check" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}

export function FinderPicker({ expiring, shelves, picked, onToggle, onClose }) {
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState(() => new Set()); // drawers shut (this visit only)

  const shownExpiring = expiring.filter((item) => matchesIngredientSearch(item.name, search));
  const drawers = shelves
    .map((shelf) => ({ ...shelf, shown: shelf.items.filter((item) => matchesIngredientSearch(item.name, search)) }))
    .filter((shelf) => shelf.shown.length > 0);
  const nothing = shownExpiring.length === 0 && drawers.length === 0;

  function toggleDrawer(id) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fnd-picker" role="group" aria-label={t("finder.pickerTitle")}>
      <div className="fnd-picker-head">
        <span className="fnd-caps">{t("finder.pickerTitle")}</span>
        {picked.size > 0 && <span className="fnd-chosen">{t("finder.chosen", { count: picked.size })}</span>}
        <button type="button" className="fnd-round" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
      </div>

      <input
        type="search"
        className="fnd-picker-search"
        value={search}
        placeholder={t("finder.pickerSearch")}
        aria-label={t("finder.pickerSearch")}
        onChange={(e) => setSearch(e.target.value)}
      />

      {shownExpiring.length > 0 && (
        <div className="fnd-picker-exp">
          <div className="fnd-picker-exphead">
            <span className="fnd-tag hot">{t("finder.expiring")}</span>
            <span className="fnd-caps muted">{t("finder.expiringHelp")}</span>
          </div>
          <div className="fnd-items">
            {shownExpiring.map((item) => (
              <ItemPill key={item.key} item={item} days={item.days} picked={picked.has(item.key)} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}

      {drawers.length > 0 && (
        <div className="fnd-drawers">
          {drawers.map((shelf) => {
            const isClosed = closed.has(shelf.id);
            const pickedHere = shelf.items.filter((item) => picked.has(item.key)).length;
            return (
              <div key={shelf.id} className={`fnd-drawer${isClosed ? " closed" : ""}`}>
                <button
                  type="button"
                  className="fnd-drawer-head"
                  aria-expanded={!isClosed}
                  onClick={() => toggleDrawer(shelf.id)}
                >
                  <span className={`fnd-shelf tone-${shelf.tone}`}>
                    {shelf.label}
                    <span className="fnd-shelf-count">{pickedHere > 0 ? `${pickedHere}/${shelf.items.length}` : shelf.items.length}</span>
                  </span>
                  <span className="fnd-drawer-chev" aria-hidden="true">
                    {isClosed ? "+" : "−"}
                  </span>
                </button>
                {!isClosed && (
                  <div className="fnd-items fnd-drawer-body">
                    {shelf.shown.map((item) => (
                      <ItemPill key={item.key} item={item} picked={picked.has(item.key)} onToggle={onToggle} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nothing && <p className="fnd-picker-empty">{search.trim() ? t("finder.pickerNoMatch") : t("tray.inventoryEmpty")}</p>}
    </div>
  );
}
