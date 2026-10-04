import { useEffect, useRef, useState } from "react";
import { GroceryItem } from "./GroceryItem.jsx";
import { useEqualRowHeight } from "../hooks/useEqualRowHeight.js";
import { brandOf } from "../lib/flyerIngredients.js";
import { getLang, t } from "../i18n/index.js";

// The list while you shop (Design4 "Riso Store Mode"): one store at a
// time, what's left there grouped by section in walking order (or A to Z),
// a big count and a progress bar, light or dark. Tapping a row checks it
// off; checked rows fade and sink to the bottom of their section.

const THEME_KEY = "mealprep-store-mode-theme";
const SORT_KEY = "mealprep-store-mode-sort";
const AISLE_ORDER = ["produce", "meat", "seafood", "dairy", "deli", "bakery", "frozen", "pantry", "snacks", "drinks", "household", "other"];

function readStored(key, fallback, allowed) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export function StoreMode({
  rows,
  stores,
  checked,
  onToggle,
  onDone,
  onClose,
  storeLabel = (s) => s,
  aisleLabel = (id) => id,
  aisleOrder = [],
  sendCount = 0,
}) {
  const firstWithItems = stores.find((s) => rows.some((r) => r.store === s && !checked[r.item.key])) || stores[0];
  const [store, setStore] = useState(firstWithItems);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => readStored(THEME_KEY, "dark", ["dark", "light"]));
  const [sort, setSort] = useState(() => readStored(SORT_KEY, "section", ["section", "az"]));

  useEffect(() => {
    // Escape closes the Inventory confirmation first, not Store mode under it.
    const onKey = (e) => e.key === "Escape" && !document.querySelector(".riso-confirm") && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function pickTheme(next) {
    setTheme(next);
    writeStored(THEME_KEY, next);
  }
  function pickSort(next) {
    setSort(next);
    writeStored(SORT_KEY, next);
  }

  // Every row is as tall as the one with the longest name (names are never cut).
  const listRef = useRef(null);
  useEqualRowHeight(listRef, { pad: 14 });

  const here = rows.filter((r) => r.store === store);
  const left = here.filter((r) => !checked[r.item.key]).length;
  const pct = here.length > 0 ? Math.round(((here.length - left) / here.length) * 100) : 0;
  const isOn = (r) => (checked[r.item.key] ? 1 : 0);
  const byName = (a, b) => a.item.name.localeCompare(b.item.name, getLang());

  // Sections in the store's walking order; checked rows sink within each.
  const order = [...aisleOrder, ...AISLE_ORDER.filter((id) => !aisleOrder.includes(id))];
  const groups =
    sort === "section"
      ? order
          .map((id) => ({ id, rows: here.filter((r) => (r.category || "other") === id) }))
          .filter((g) => g.rows.length > 0)
          .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => isOn(a) - isOn(b) || byName(a, b)) }))
      : [{ id: "all", rows: [...here].sort((a, b) => isOn(a) - isOn(b) || byName(a, b)) }];

  return (
    <div className="riso-theme store-mode" data-sm-theme={theme} role="dialog" aria-modal="true" aria-label={t("storeMode.aria")}>
      <header className="store-mode-head">
        <div className="store-mode-top">
          <button type="button" className="store-mode-back" onClick={onClose}>
            {t("storeMode.back")}
          </button>
          <div className="store-mode-stores" role="tablist" aria-label={t("storeMode.storeAria")}>
            {stores.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={s === store} className={s === store ? "on" : ""} onClick={() => setStore(s)}>
                {storeLabel(s)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="store-mode-theme"
            onClick={() => pickTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? t("storeMode.toLight") : t("storeMode.toDark")}
            title={theme === "dark" ? t("storeMode.toLight") : t("storeMode.toDark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        <div className="store-mode-summary">
          <span className="store-mode-num">{left}</span>
          <div className="store-mode-progress">
            <span className="store-mode-at">{t("storeMode.leftAt", { count: left, store: storeLabel(store) })}</span>
            <div className="store-mode-track" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="store-mode-sort" role="group" aria-label={t("storeMode.sortAria")}>
            {[
              ["section", t("storeMode.sortSection")],
              ["az", t("same.az")],
            ].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={sort === id} className={sort === id ? "on" : ""} onClick={() => pickSort(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="store-mode-list" ref={listRef}>
        {here.length === 0 && <p className="store-mode-empty">{t("storeMode.nothingFor", { store: storeLabel(store) })}</p>}
        {groups.map((group) => (
          <section key={group.id} className="store-mode-group" aria-label={sort === "section" ? aisleLabel(group.id) : undefined}>
            {sort === "section" && (
              <div className="store-mode-section">
                <span className="store-mode-section-pill">{aisleLabel(group.id)}</span>
                <span className="store-mode-section-rule" />
                <span className="store-mode-section-left">
                  {t("storeMode.sectionLeft", { count: group.rows.filter((r) => !checked[r.item.key]).length })}
                </span>
              </div>
            )}
            {group.rows.map(({ item, deal, flyerDeal }) => (
              <GroceryItem
                key={item.key}
                variant="store"
                item={item}
                checked={!!checked[item.key]}
                deal={deal}
                brand={brandOf(deal || flyerDeal)}
                onToggle={() => onToggle(item.key)}
              />
            ))}
          </section>
        ))}
      </div>

      <footer className="store-mode-foot">
        <button
          type="button"
          className="store-mode-done"
          disabled={sendCount === 0 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              // Cancelling the Inventory confirmation keeps you in Store mode.
              if (await onDone()) onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("storeMode.done", { count: sendCount })}
        </button>
      </footer>
    </div>
  );
}
