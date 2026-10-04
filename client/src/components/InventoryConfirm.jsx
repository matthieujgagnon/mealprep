import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { parseQuantityInput } from "../lib/units.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { t } from "../i18n/index.js";

// The one confirmation sheet in front of everything that adds to Inventory
// (Done shopping in Grocery and Store mode, a grocery item's "To inventory"
// button, a receipt import, "I have it" on a recipe, leftovers from Cook
// mode). Nothing reaches Inventory until it's confirmed here: each row shows
// what would be added - name, amount, shelf and use-by date - and any of
// them can be changed or the row switched off. Cancel adds nothing. (Typing
// an item into Inventory's own add form already counts as confirming.)
//
// `drafts`: [{ ref, name, quantity?, unit?, location?, expiresAt?, category? }].
// `ref` is handed back for each row that was added. A missing shelf or
// use-by date is filled in from the USDA FoodKeeper suggestion, and stays
// editable.

let rowId = 0;
function toRow(draft) {
  return {
    id: ++rowId,
    ref: draft.ref,
    on: true,
    name: draft.name || "",
    quantity: draft.quantity != null ? String(draft.quantity) : "",
    unit: draft.unit || "",
    location: draft.location || "",
    expiresAt: draft.expiresAt ? String(draft.expiresAt).slice(0, 10) : "",
    category: draft.category || null,
    // What the person typed wins over a later suggestion.
    locationTouched: !!draft.location,
    dateTouched: !!draft.expiresAt,
  };
}

function ConfirmRow({ row, sections, onChange }) {
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
          if (!now.dateTouched) patch.expiresAt = expiresAt ? expiresAt.slice(0, 10) : "";
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

  return (
    <li className={`riso-confirm-row${row.on ? "" : " off"}`}>
      <input
        type="checkbox"
        className="riso-confirm-on"
        checked={row.on}
        onChange={(e) => onChange({ on: e.target.checked })}
        aria-label={t("inventoryConfirm.include", { name: row.name })}
      />
      <input
        type="text"
        className="riso-confirm-name"
        aria-label={t("inventoryConfirm.nameAria", { name: row.name })}
        value={row.name}
        disabled={!row.on}
        onChange={(e) => onChange({ name: e.target.value })}
      />
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
      <select
        className="riso-confirm-shelf"
        aria-label={t("inventoryConfirm.shelfAria", { name: row.name })}
        value={row.location}
        disabled={!row.on}
        onChange={(e) => onChange({ location: e.target.value, locationTouched: true })}
      >
        {!row.location && <option value="">…</option>}
        {sections.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
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

export function InventoryConfirmSheet({ drafts, sections, title, intro, onConfirm, onCancel }) {
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
    if (count === 0 || saving) return;
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
            category: r.category || undefined,
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
            <ConfirmRow key={row.id} row={row} sections={sections} onChange={(patch) => patchRow(row.id, patch)} />
          ))}
        </ul>
        {error && <p className="riso-confirm-error">{error}</p>}
        <div className="riso-confirm-actions">
          <button type="button" className="btn subtle" onClick={onCancel} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn primary riso-confirm-go" onClick={confirm} disabled={saving || count === 0}>
            {saving ? t("inventoryConfirm.adding") : t("inventoryConfirm.confirm", { count })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
