import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { parseQuantityInput } from "../lib/units.js";
import { expiryDay } from "../lib/quebecDay.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { PreparedTag } from "./RisoPills.jsx";
import { STORAGES, followHidden, isStorage } from "../lib/shelves.js";
import { t } from "../i18n/index.js";

// The one confirmation sheet in front of everything that adds to Inventory
// (Done shopping in Grocery and Store mode, a grocery item's "To inventory"
// button, a receipt import, "I have it" on a recipe, leftovers from Cook
// mode). Nothing reaches Inventory until it's confirmed here: each row shows
// what would be added - name, amount, shelf and use-by date - and any of
// them can be changed or the row switched off. Cancel adds nothing. (Typing
// an item into Inventory's own add form already counts as confirming.)
//
// `drafts`: [{ ref, name, quantity?, unit?, location?, shelf?, expiresAt?, category?, isPreparedMeal?, on? }].
// `ref` is handed back for each row that was added. `location` is where it is KEPT (fridge,
// freezer, pantry: the use-by comes from it) and `shelf` the shelf it shows on (lib/shelves.js);
// a row's Shelf choice is one control, and a second "Stored in" choice appears under it when the
// shelf is not Fridge, Freezer or Pantry (Prepared meals, a section of their own), so both are
// said before anything is added. A shelf that was deleted is not offered: a row whose own shelf is
// deleted shows on the shelf its items moved to (`shelfIds`, lib/shelves.js) and says where it is
// kept in that second choice. A missing storage or use-by date is filled in from the USDA
// FoodKeeper suggestion, and stays editable. A draft with `on: false` starts switched off (Done shopping: the
// items bought ✓ but not queued for Inventory), and can be switched on.
// `confirmNone`: the button's words when every row is off, for a caller that
// can be confirmed with nothing added (Done shopping, which still clears the
// cart); without it the button waits for a row.

let rowId = 0;
function toRow(draft) {
  return {
    id: ++rowId,
    ref: draft.ref,
    on: draft.on !== false,
    name: draft.name || "",
    quantity: draft.quantity != null ? String(draft.quantity) : "",
    unit: draft.unit || "",
    // Where it is kept. A draft that names one of the person's own sections is naming the shelf.
    location: isStorage(draft.location) ? draft.location : "",
    shelf: draft.shelf || (draft.location && !isStorage(draft.location) ? draft.location : ""),
    expiresAt: expiryDay(draft.expiresAt) || "",
    category: draft.category || null,
    // A prepared recipe's "I have it" adds a prepared meal (the row says so); anything else is an ingredient.
    prepared: draft.isPreparedMeal === true,
    // What the person typed wins over a later suggestion.
    locationTouched: isStorage(draft.location),
    dateTouched: !!draft.expiresAt,
  };
}

function ConfirmRow({ row, sections, shelfIds, onChange }) {
  const [suggesting, setSuggesting] = useState(false);
  const latest = useRef(row);
  latest.current = row;

  // Suggest the shelf, use-by date and category once the name (and shelf)
  // settle, without overwriting anything the person set.
  useEffect(() => {
    if (!row.name.trim()) return undefined;
    let cancelled = false;
    setSuggesting(true);
    const timer = setTimeout(() => {
      api
        .suggestPantryExpiration(row.name.trim(), row.location || undefined)
        .then(({ expiresAt, category, location }) => {
          if (cancelled) return;
          const now = latest.current;
          const patch = {};
          if (!now.location && location) patch.location = location;
          if (!now.dateTouched) patch.expiresAt = expiryDay(expiresAt) || "";
          if (category) patch.category = category;
          if (Object.keys(patch).length > 0) onChange(patch);
        })
        .catch(() => {})
        .finally(() => !cancelled && setSuggesting(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.name, row.location]);

  // The shelf the row will show on, and whether it is not the shelf of where it is kept (a chosen
  // shelf, or its own shelf is deleted): then where it is kept is said too.
  const own = row.shelf || row.location;
  const shown = own ? followHidden(own, shelfIds) : "";
  const showKept = !!row.shelf || (isStorage(row.location) && shown !== row.location);

  function pickShelf(id) {
    // Fridge, Freezer or Pantry says where it is kept; any other shelf only says which shelf.
    if (!isStorage(id)) return onChange({ shelf: id });
    // The shelf a deleted one moved its items to is where this row already shows: it stays kept
    // where it was, and only follows the shelf again.
    if (isStorage(row.location) && row.location !== id && followHidden(row.location, shelfIds) === id) return onChange({ shelf: "" });
    onChange({ location: id, shelf: "", locationTouched: true });
  }

  return (
    <li className={`riso-confirm-row${row.on ? "" : " off"}`}>
      <input
        type="checkbox"
        className="riso-confirm-on"
        checked={row.on}
        onChange={(e) => onChange({ on: e.target.checked })}
        aria-label={t("inventoryConfirm.include", { name: row.name })}
      />
      <span className="riso-confirm-namecell">
        <input
          type="text"
          className="riso-confirm-name"
          aria-label={t("inventoryConfirm.nameAria", { name: row.name })}
          value={row.name}
          disabled={!row.on}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {row.prepared && <PreparedTag size="s" className="riso-confirm-prepared" />}
      </span>
      <span className="riso-confirm-amount">
        <input
          type="text"
          inputMode="decimal"
          aria-label={t("inventoryConfirm.amountAria", { name: row.name })}
          placeholder={t("inventoryConfirm.amount")}
          value={row.quantity}
          disabled={!row.on}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
        <UnitSelect
          aria-label={t("inventoryConfirm.unitAria", { name: row.name })}
          value={row.unit}
          onChange={(unit) => onChange({ unit })}
          emptyLabel={t("inventory.unitEmpty")}
          disabled={!row.on}
        />
      </span>
      <span className="riso-confirm-shelfcell">
        <select
          className="riso-confirm-shelf"
          aria-label={t("inventoryConfirm.shelfAria", { name: row.name })}
          value={shown}
          disabled={!row.on}
          onChange={(e) => pickShelf(e.target.value)}
        >
          {!row.shelf && !row.location && <option value="">…</option>}
          {sections.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {showKept && (
          <span className="riso-confirm-kept">
            <span className="riso-confirm-kept-label">{t("inventory.form.stepStored")}</span>
            <select
              aria-label={t("inventory.form.keptAria", { name: row.name })}
              value={row.location}
              disabled={!row.on}
              onChange={(e) => onChange({ location: e.target.value, locationTouched: true })}
            >
              {!row.location && <option value="">…</option>}
              {STORAGES.map((id) => (
                <option key={id} value={id}>
                  {t(`inventory.storage.short.${id}`)}
                </option>
              ))}
            </select>
          </span>
        )}
      </span>
      <input
        type="date"
        className="riso-confirm-date"
        aria-label={t("inventoryConfirm.dateAria", { name: row.name })}
        title={suggesting ? t("inventory.lookingUp") : t("inventory.expirationDate")}
        value={row.expiresAt}
        disabled={!row.on}
        onChange={(e) => onChange({ expiresAt: e.target.value, dateTouched: true })}
      />
    </li>
  );
}

export function InventoryConfirmSheet({ drafts, sections, shelfIds, title, intro, confirmNone, onConfirm, onCancel }) {
  const [rows, setRows] = useState(() => drafts.map(toRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const count = rows.filter((r) => r.on && r.name.trim()).length;

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onCancel]);

  function patchRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function confirm() {
    if ((count === 0 && !confirmNone) || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(
        rows
          .filter((r) => r.on && r.name.trim())
          .map((r) => ({
            ref: r.ref,
            name: r.name.trim(),
            quantity: parseQuantityInput(r.quantity),
            unit: r.unit || null,
            location: r.location || undefined,
            shelf: r.shelf || undefined,
            category: r.category || undefined,
            isPreparedMeal: r.prepared || undefined,
            expiresAt: r.expiresAt || null,
          }))
      );
    } catch (err) {
      // Rows that did go in leave the sheet, so trying again can't add them twice.
      if (err.added?.length) setRows((prev) => prev.filter((r) => !err.added.includes(r.ref)));
      setError(err.message || t("inventoryConfirm.failed"));
      setSaving(false);
    }
  }

  // In the page body, above everything (Store mode, the receipt popup, Cook mode).
  return createPortal(
    <div className="riso-theme modal-overlay riso-inv-form-overlay riso-confirm-overlay" data-theme="light" onClick={() => !saving && onCancel()}>
      <div
        className="card modal-content riso-inv-form-modal riso-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title || t("inventoryConfirm.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close riso-inv-form-close" onClick={onCancel} disabled={saving} aria-label={t("common.close")}>
          ×
        </button>
        <h3 className="riso-inv-form-title">{title || t("inventoryConfirm.title")}</h3>
        <p className="riso-confirm-intro">{intro || t("inventoryConfirm.intro")}</p>
        <div className="riso-confirm-head" aria-hidden="true">
          <span />
          <span>{t("inventoryConfirm.colName")}</span>
          <span>{t("inventoryConfirm.colAmount")}</span>
          <span>{t("inventoryConfirm.colShelf")}</span>
          <span>{t("inventoryConfirm.colDate")}</span>
        </div>
        <ul className="riso-confirm-list">
          {rows.map((row) => (
            <ConfirmRow key={row.id} row={row} sections={sections} shelfIds={shelfIds} onChange={(patch) => patchRow(row.id, patch)} />
          ))}
        </ul>
        {error && <p className="riso-confirm-error">{error}</p>}
        <div className="riso-confirm-actions">
          <button type="button" className="btn subtle" onClick={onCancel} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn primary riso-confirm-go" onClick={confirm} disabled={saving || (count === 0 && !confirmNone)}>
            {saving ? t("inventoryConfirm.adding") : count === 0 && confirmNone ? confirmNone : t("inventoryConfirm.confirm", { count })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
