import { useState } from "react";
import { Popup } from "./RisoControls.jsx";
import { normalizeName } from "../lib/storageList.js";
import { t } from "../i18n/index.js";

// The two sheets for deleting and bringing back a shelf on Inventory, both in the shared Popup (the
// bottom sheet on a phone, a centred panel on a computer), in the one-time list's look.
//
// ANY shelf can be deleted, built-in or Matt's own, and deleting is HIDING it: nothing is deleted
// from the database and nothing is written onto an item (lib/shelves.js). The sheet only asks
// where the shelf's items, and new items that would have gone there, show meanwhile.

// "Delete « Freezer »?": where its N items go, picked from the shelves that are left. The last
// shelf that can hold ingredients cannot be deleted: `choices` is empty and the sheet says so.
//
//   shelf     { id, label }
//   count     how many items show on it now
//   choices   [{ id, label }] the shelves they can go to (lib/shelfDelete.js `moveChoices`)
//   initial   the shelf picked to begin with (`defaultMoveTarget`)
//   onConfirm (targetId) -> resolves when saved, rejects with a message when not
export function DeleteShelfSheet({ shelf, count, choices, initial, isPhone, onConfirm, onClose }) {
  const [target, setTarget] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const last = choices.length === 0;
  const title = t("inventory.shelfSheet.title", { name: shelf.label });

  async function confirm() {
    if (saving || !target) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(target);
    } catch (err) {
      setError(err.message || t("inventory.shelfSheet.failed"));
      setSaving(false);
    }
  }

  return (
    <Popup label={title} onClose={onClose} isPhone={isPhone} narrow>
      <div className="riso-storagesheet riso-shelfsheet">
        <h2 className="riso-storagesheet-title">{title}</h2>
        {last ? (
          <p className="riso-storagesheet-intro riso-shelfsheet-last">{t("inventory.shelfSheet.last")}</p>
        ) : (
          <>
            <p className="riso-storagesheet-intro">{count > 0 ? t("inventory.shelfSheet.intro", { count }) : t("inventory.shelfSheet.introEmpty")}</p>
            <select
              className="riso-shelfsheet-select"
              aria-label={t("inventory.shelfSheet.moveTo")}
              value={target ?? ""}
              onChange={(e) => setTarget(e.target.value)}
              disabled={saving}
              autoFocus={!isPhone}
            >
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
            <p className="riso-storagesheet-intro">{t("inventory.shelfSheet.keepNote")}</p>
          </>
        )}
        {error && (
          <p className="riso-storagesheet-error" role="alert">
            {error}
          </p>
        )}
        <div className="riso-storagesheet-actions">
          {last ? (
            <button type="button" className="riso-btn primary" onClick={onClose}>
              {t("common.gotIt")}
            </button>
          ) : (
            <>
              <button type="button" className="riso-btn" onClick={onClose} disabled={saving}>
                {t("common.cancel")}
              </button>
              <button type="button" className="riso-btn primary" onClick={confirm} disabled={saving || !target}>
                {t("inventory.deleteShelf")}
              </button>
            </>
          )}
        </div>
      </div>
    </Popup>
  );
}

// "+ Add section" when a shelf is deleted: a new shelf's name, and "Bring back" for each deleted one
// (built-in or Matt's own), with what returns to it. A deleted shelf keeps its name, so a new shelf
// cannot take it: the sheet says to bring it back instead.
//
//   hidden       [{ id, label, count }] (lib/shelfDelete.js `hiddenShelves`)
//   onAdd        (name) -> resolves when added, rejects with a message when not
//   onBringBack  (shelf) -> resolves when it is back
export function AddShelfSheet({ hidden, isPhone, onAdd, onBringBack, onClose }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const trimmed = name.trim();
  const clash = trimmed ? hidden.find((shelf) => normalizeName(shelf.label) === normalizeName(trimmed)) : null;

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err.message || t("inventory.shelfSheet.failed"));
      setBusy(false);
    }
  }

  const add = () => trimmed && !clash && run(() => onAdd(trimmed));

  return (
    <Popup label={t("inventory.addShelfSheet.title")} onClose={onClose} isPhone={isPhone} narrow>
      <div className="riso-storagesheet riso-shelfsheet">
        <h2 className="riso-storagesheet-title">{t("inventory.addShelfSheet.title")}</h2>
        <div className="riso-shelfsheet-new">
          <input
            className="riso-shelfsheet-input"
            aria-label={t("inventory.shelfName")}
            placeholder={t("inventory.shelfNamePlaceholder")}
            value={name}
            maxLength={40}
            // On a phone the keyboard would cover the list of deleted shelves under it.
            autoFocus={!isPhone}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button type="button" className="riso-btn primary" onClick={add} disabled={busy || !trimmed || !!clash}>
            {t("inventory.addShelfSheet.add")}
          </button>
        </div>
        {clash && <p className="riso-storagesheet-error">{t("inventory.addShelfSheet.hiddenName", { name: clash.label })}</p>}
        <div className="riso-storagesheet-old">
          <h3 className="riso-storagesheet-subtitle">{t("inventory.addShelfSheet.backTitle")}</h3>
          <ul className="riso-storagesheet-list">
            {hidden.map((shelf) => (
              <li key={shelf.id} className="riso-storagesheet-row">
                <div className="riso-storagesheet-who">
                  <span className="riso-storagesheet-name">{shelf.label}</span>
                  {shelf.count > 0 && <span className="riso-storagesheet-shelf">{t("inventory.addShelfSheet.backLine", { count: shelf.count })}</span>}
                </div>
                <button
                  type="button"
                  className="riso-btn small"
                  aria-label={t("inventory.addShelfSheet.bringBackAria", { name: shelf.label })}
                  disabled={busy}
                  onClick={() => run(() => onBringBack(shelf))}
                >
                  {t("inventory.addShelfSheet.bringBack")}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {error && (
          <p className="riso-storagesheet-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Popup>
  );
}
