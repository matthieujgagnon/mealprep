import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { fold } from "../lib/bilingual.js";
import { isMealItem } from "../lib/mealItem.js";
import { LOCATIONS } from "../lib/pantryInventory.js";
import { t } from "../i18n/index.js";
import { Popup } from "./RisoControls.jsx";

// « Je l'ai comme… » / "I have it as…": a recipe names something you keep under another
// name (the recipe says "rice vinegar", you have "Rice wine vinegar"), and one pick
// links the two names. It adds nothing to Inventory (so it has no confirmation sheet;
// CLAUDE.md), it only teaches the matcher (lib/inventoryLinks.js).
//
// App.jsx keeps it open or closed and provides InventoryLinksContext, whose value is
//   ask(names, { label })   opens the pop-up for these recipe names ("Rice vinegar")
//   remove(links)           stops counting an item as a recipe name (with an Undo)
// A place that offers it reads `useInventoryLinks()` (null when there is nothing to
// open, so it shows nothing). The pop-up is the shared Popup (the bottom sheet on a
// phone) with a search box over your Inventory items, never leftovers or prepared meals.

export const InventoryLinksContext = createContext(null);
export const useInventoryLinks = () => useContext(InventoryLinksContext);

const shelfLabel = (id) => LOCATIONS.find((l) => l.id === id)?.label || id || "";

// label    the recipe's name for it, as shown ("Rice vinegar")
// items    your Inventory items (meals are left out here)
// onPick   called with the Inventory item that counts as `label`
// onClose
export function InventoryLinkPopup({ label, items, onPick, onClose }) {
  const isPhone = useIsPhone();
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  // Escape closes this pop-up and only this one: the card or page under it keeps its
  // own state (taken in the capture phase, as the Feedback form does).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const usable = useMemo(
    () => items.filter((item) => !isMealItem(item)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [items]
  );
  const wanted = fold(query).trim();
  const shown = wanted ? usable.filter((item) => fold(item.name).includes(wanted)) : usable;

  return createPortal(
    <div className="riso-theme riso-link-layer" data-theme="light">
      <Popup label={t("links.popupTitle")} onClose={onClose} isPhone={isPhone} narrow>
        <div className="riso-linkpop">
          <header className="riso-linkpop-head">
            <h2 className="riso-linkpop-title">{t("links.popupTitle")}</h2>
            <p className="riso-linkpop-intro">{t("links.popupIntro", { name: label })}</p>
          </header>
          <input
            ref={boxRef}
            type="search"
            className="riso-linkpop-search"
            value={query}
            placeholder={t("links.search")}
            aria-label={t("links.search")}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {shown.length > 0 ? (
            <ul className="riso-linkpop-list">
              {shown.map((item) => (
                <li key={item.id}>
                  <button type="button" className="riso-linkpop-item" onClick={() => onPick(item)}>
                    <span className="riso-linkpop-name">{item.name}</span>
                    <span className="riso-linkpop-shelf">{shelfLabel(item.location)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="riso-linkpop-empty">{usable.length === 0 ? t("links.none") : t("links.noMatch", { query: query.trim() })}</p>
          )}
        </div>
      </Popup>
    </div>,
    document.body
  );
}
