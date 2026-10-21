import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Popup, Segmented } from "./RisoControls.jsx";
import { Pill } from "./RisoPills.jsx";
import { STORAGES, isStorage, shelfOf } from "../lib/shelves.js";
import { storageChoices } from "../lib/storageList.js";
import { t } from "../i18n/index.js";

// The one-time list that follows the move to two fields (where an item is KEPT, which SHELF it is
// on: lib/shelves.js). Items that were moved to a shelf of their own lost where they were kept, so
// each is listed with Fridge / Freezer / Pantry, pre-picked from its name and marked « guess »
// until the person picks. Confirm sets only that (never the shelf or the use-by date) and has an
// Undo (the caller's toast); "Not now" changes nothing. If an old shelf is now an empty copy of a
// built-in one (Matt's old « Prepared meals »), the same sheet offers to delete it, with Undo.
//
//   items       the items whose storage is not known yet (lib/storageList.js)
//   shelfName   id -> the shelf's name, for the line under each name
//   shelfIds    the shelves as the page shows them (lib/shelves.js `shelfSetOf`), so an item on a
//               deleted shelf is named by the shelf it moved to
//   oldShelves  [{ id, name, builtIn }] empty copies of a built-in shelf, `builtIn` its name
//   onConfirm   (choices: [{ id, location }]) -> resolves when saved
//   onDeleteShelf  (shelf) -> resolves when deleted
export function InventoryStorageSheet({ items, shelfName, shelfIds, oldShelves = [], isPhone, onConfirm, onDeleteShelf, onClose }) {
  const [picks, setPicks] = useState({});
  const [guessed, setGuessed] = useState(() => new Set()); // ids whose pick is still a guess
  const touched = useRef(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [gone, setGone] = useState(() => new Set()); // old shelves deleted from this sheet

  // A guess for each item from its name (the USDA rules, the same the Add form starts from).
  useEffect(() => {
    let cancelled = false;
    for (const item of items) {
      api
        .suggestPantryExpiration(item.name)
        .then((res) => {
          if (cancelled || touched.current.has(item.id) || !isStorage(res.location)) return;
          setPicks((p) => ({ ...p, [item.id]: res.location }));
          setGuessed((g) => new Set(g).add(item.id));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // The list is fixed for as long as the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(id, storage) {
    touched.current.add(id);
    setPicks((p) => ({ ...p, [id]: storage }));
    setGuessed((g) => {
      const next = new Set(g);
      next.delete(id);
      return next;
    });
  }

  const choices = storageChoices(items, picks);
  const shelves = oldShelves.filter((shelf) => !gone.has(shelf.id));

  async function confirm() {
    if (saving || choices.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(choices);
    } catch (err) {
      setError(err.message || t("inventory.storageSheet.failed"));
      setSaving(false);
    }
  }

  async function removeShelf(shelf) {
    setError(null);
    try {
      await onDeleteShelf(shelf);
      setGone((g) => new Set(g).add(shelf.id));
    } catch (err) {
      setError(err.message || t("inventory.storageSheet.failed"));
    }
  }

  return (
    <Popup label={t("inventory.storageSheet.title")} onClose={onClose} isPhone={isPhone}>
      <div className="riso-storagesheet">
        {items.length > 0 && (
          <>
            <h2 className="riso-storagesheet-title">{t("inventory.storageSheet.title")}</h2>
            <p className="riso-storagesheet-intro">{t("inventory.storageSheet.intro")}</p>
            <ul className="riso-storagesheet-list">
              {items.map((item) => (
                <li key={item.id} className="riso-storagesheet-row">
                  <div className="riso-storagesheet-who">
                    <span className="riso-storagesheet-name">{item.name}</span>
                    <span className="riso-storagesheet-shelf">{shelfName(shelfOf(item, shelfIds))}</span>
                  </div>
                  <div className="riso-storagesheet-pick">
                    <Segmented
                      className="inset"
                      ariaLabel={t("inventory.form.keptAria", { name: item.name })}
                      value={picks[item.id] || ""}
                      onChange={(id) => pick(item.id, id)}
                      options={STORAGES.map((id) => ({ id, label: t(`inventory.storage.short.${id}`) }))}
                    />
                    {guessed.has(item.id) && (
                      <Pill size="mini" tone="dash" className="riso-storagesheet-guess">
                        {t("inventory.storageSheet.guess")}
                      </Pill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {shelves.length > 0 && (
          <div className="riso-storagesheet-old">
            <h3 className="riso-storagesheet-subtitle">{t("inventory.storageSheet.oldTitle")}</h3>
            {shelves.map((shelf) => (
              <div key={shelf.id} className="riso-storagesheet-oldrow">
                <p>{t("inventory.storageSheet.oldLine", { name: shelf.name, builtIn: shelf.builtIn })}</p>
                <button type="button" className="riso-btn small" onClick={() => removeShelf(shelf)}>
                  {t("inventory.storageSheet.oldDelete", { name: shelf.name })}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="riso-storagesheet-error">{error}</p>}
        <div className="riso-storagesheet-actions">
          <button type="button" className="riso-btn" onClick={onClose} disabled={saving}>
            {t("inventory.storageSheet.notNow")}
          </button>
          {items.length > 0 && (
            <button type="button" className="riso-btn primary" onClick={confirm} disabled={saving || choices.length === 0}>
              {t("inventory.storageSheet.confirm", { count: choices.length })}
            </button>
          )}
        </div>
      </div>
    </Popup>
  );
}
