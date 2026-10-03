import { useEffect, useState } from "react";
import { formatAmount } from "../lib/groceryList.js";
import { t } from "../i18n/index.js";
import { localizePrice } from "../i18n/format.js";

// Extra-large list for use in the shop (Riso Mobile.dc.html "Store mode"):
// full-screen on ink, one store at a time, big rows, checked items sink.
export function StoreMode({ rows, stores, checked, onToggle, onDone, onClose, storeLabel = (s) => s }) {
  const firstWithItems = stores.find((s) => rows.some((r) => r.store === s && !checked[r.item.key])) || stores[0];
  const [store, setStore] = useState(firstWithItems);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const here = rows.filter((r) => r.store === store);
  const left = here.filter((r) => !checked[r.item.key]).length;
  const pct = here.length > 0 ? Math.round(((here.length - left) / here.length) * 100) : 0;
  const sorted = [...here].sort((a, b) => (checked[a.item.key] ? 1 : 0) - (checked[b.item.key] ? 1 : 0));
  const doneCount = rows.filter((r) => checked[r.item.key]).length;

  return (
    <div className="riso-theme store-mode" role="dialog" aria-modal="true" aria-label={t("storeMode.aria")}>
      <header className="store-mode-head">
        <div className="store-mode-top">
          <button type="button" className="store-mode-back" onClick={onClose}>
            {t("storeMode.back")}
          </button>
          {stores.length > 1 && (
            <div className="store-mode-stores" role="tablist" aria-label={t("storeMode.storeAria")}>
              {stores.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={s === store} className={s === store ? "on" : ""} onClick={() => setStore(s)}>
                  {storeLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="store-mode-count">
          <span className="store-mode-num">{left}</span>
          <span className="store-mode-at">{t("storeMode.leftAt", { count: left, store: storeLabel(store) })}</span>
        </div>
        <div className="store-mode-track" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
      </header>

      <ul className="store-mode-list">
        {sorted.length === 0 && <li className="store-mode-empty">{t("storeMode.nothingFor", { store: storeLabel(store) })}</li>}
        {sorted.map(({ item, deal }) => {
          const on = !!checked[item.key];
          const qty = item.customQuantity || formatAmount(item.parts);
          return (
            <li key={item.key}>
              <button type="button" className={`store-mode-row${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(item.key)}>
                <span className="store-mode-check">{on ? "✓" : ""}</span>
                <span className="store-mode-info">
                  <span className="store-mode-name">{item.name}</span>
                  {qty && <span className="store-mode-qty">{qty}</span>}
                </span>
                {deal?.price && <span className="store-mode-sale">{localizePrice(deal.price)}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="store-mode-foot">
        <button
          type="button"
          className="store-mode-done"
          disabled={doneCount === 0 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDone();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("storeMode.done", { count: doneCount })}
        </button>
      </footer>
    </div>
  );
}
