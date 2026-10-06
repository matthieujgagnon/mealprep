import { useEffect, useRef, useState } from "react";
import { GroceryItem } from "./GroceryItem.jsx";
import { useDndMonitor } from "@dnd-kit/core";
import { AddedSheet, ColoursSheet, DraggableRow, DropTray, LeaveSheet, StoreConfetti, StoreDropZone, StoreSticker } from "./StoreModeParts.jsx";
import { useEqualRowHeight } from "../hooks/useEqualRowHeight.js";
import { capitalize } from "../lib/groceryList.js";
import { brandOf } from "../lib/flyerIngredients.js";
import { colorOfStore, readStoreColors, writeStoreColors } from "../lib/storeColors.js";
import { getLang, t } from "../i18n/index.js";

// The list while you shop (design: docs/design/riso-v2-store-mode, "Store
// Mode"): one scrolling list in a section for each store, each under a coloured
// sticker that folds it away, with a big count and a progress bar above it, light
// or dark. Tapping a row checks it off, and it stays where it is. All turns the
// stores off (one list), Aisle groups by section of the store, Hide done takes
// the checked ones out of view. Leaving with items checked asks about adding them
// to Inventory, which always goes through the Inventory confirmation (`onDone`).
// Press and hold a row, then drag it onto another store (its section or its
// sticker, folded or not) to file it there for good, with Undo (`onMove`, `onToast`).

const THEME_KEY = "mealprep-store-mode-theme";
const AISLE_ORDER = ["produce", "meat", "seafood", "dairy", "deli", "bakery", "frozen", "pantry", "snacks", "drinks", "household", "other"];

function readTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function writeTheme(value) {
  try {
    localStorage.setItem(THEME_KEY, value);
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
  moveTargets = stores, // every store an item can be moved to (not only those with items today)
  onMove,
  onToast,
}) {
  const [theme, setTheme] = useState(readTheme);
  const [colors, setColors] = useState(readStoreColors);
  const [flat, setFlat] = useState(false);
  const [aisle, setAisle] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [sheet, setSheet] = useState(null); // null | "colours" | "leave" | "added"
  const [flash, setFlash] = useState(null); // the key of the item just moved
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const dark = theme === "dark";

  useEffect(() => {
    // Escape closes a sheet first, and the Inventory confirmation before Store mode under it.
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".riso-confirm")) return;
      if (sheet) setSheet(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, sheet]);

  // Every row is as tall as the one with the longest name (names are never cut).
  const listRef = useRef(null);
  useEqualRowHeight(listRef, { pad: 14 });

  const total = rows.length;
  const left = rows.filter((r) => !checked[r.item.key]).length;
  const pct = total > 0 ? Math.round(((total - left) / total) * 100) : 0;
  const celebrate = total > 0 && left === 0;

  const byName = (a, b) => a.item.name.localeCompare(b.item.name, getLang());
  const order = [...aisleOrder, ...AISLE_ORDER.filter((id) => !aisleOrder.includes(id))];
  const shown = (list) => (hideDone ? list.filter((r) => !checked[r.item.key]) : list);
  // A store's rows A to Z, or in its sections in walking order (A to Z in each).
  // Checking a row never moves it.
  const sectionsOf = (list) =>
    aisle
      ? order
          .map((id) => ({ id, rows: list.filter((r) => (r.category || "other") === id).sort(byName) }))
          .filter((g) => g.rows.length > 0)
      : [{ id: "", rows: [...list].sort(byName) }];

  // Dragging needs somewhere to drop: stores in view (not in All) and more than one store.
  const canDrag = !!onMove && !flat && moveTargets.length > 1;
  const groups = flat
    ? shown(rows).length > 0
      ? [{ store: null, sections: sectionsOf(shown(rows)) }]
      : []
    : stores
        .map((store) => {
          const here = rows.filter((r) => r.store === store);
          return {
            store,
            left: here.filter((r) => !checked[r.item.key]).length,
            visible: shown(here).length,
            sections: collapsed[store] ? [] : sectionsOf(shown(here)),
          };
        })
        .filter((g) => g.visible > 0);

  // Dropping an item on another store saves it there for good (Grocery's own rule,
  // the same as dragging it there on the Grocery page). A folded store stays folded;
  // otherwise the item is scrolled to and ringed in its new place. Undo puts it back.
  const latestMove = useRef(onMove);
  latestMove.current = onMove;
  async function dropOn(row, store) {
    if (!onMove || store === row.store) return;
    await onMove(row.item, store);
    setFlash(row.item.key);
    // Undo runs later, so it asks the latest `onMove` (the one made after this move was saved).
    onToast?.(t("storeMode.moved", { name: capitalize(row.item.name), store: storeLabel(store) }), () => latestMove.current(row.item, row.store));
  }

  // A drag never checks the row it lifted from: the click that follows a drop (it
  // can land on the row it started in) is swallowed, and so is any click for a moment
  // after it, since the row may have been redrawn in another store.
  const carrying = useRef(false);
  const calmUntil = useRef(0);
  useDndMonitor({
    onDragStart: (e) => {
      if (e.active.data.current?.storeDrag) carrying.current = true;
    },
    onDragEnd: () => {
      if (carrying.current) calmUntil.current = Date.now() + 200;
      carrying.current = false;
    },
    onDragCancel: () => {
      if (carrying.current) calmUntil.current = Date.now() + 200;
      carrying.current = false;
    },
  });
  function swallowClick(e) {
    if (!carrying.current && Date.now() >= calmUntil.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    if (!flash) return undefined;
    const el = listRef.current?.querySelector(`[data-move-key="${CSS.escape(flash)}"]`);
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  function setColor(name, hex) {
    setColors((prev) => {
      const next = { ...prev, [name]: hex };
      writeStoreColors(next);
      return next;
    });
  }
  function resetColors() {
    writeStoreColors({});
    setColors({});
  }
  function pickTheme() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    writeTheme(next);
  }

  function leave() {
    if (sendCount > 0) setSheet("leave");
    else onClose();
  }

  // Adding opens the Inventory confirmation; cancelling it leaves the sheet as it was.
  async function addChecked() {
    if (busy) return;
    const count = sendCount;
    setBusy(true);
    try {
      if (await onDone()) {
        setAdded(count);
        setSheet("added");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="riso-theme store-mode" data-sm-theme={theme} role="dialog" aria-modal="true" aria-label={t("storeMode.aria")}>
      <header className="store-mode-head">
        <div className="store-mode-top">
          <button type="button" className="store-mode-back" onClick={leave}>
            {t("storeMode.back")}
          </button>
          <span className="store-mode-spacer" />
          <button type="button" className="store-mode-colours" onClick={() => setSheet("colours")}>
            {t("storeMode.colours")}
          </button>
          <button
            type="button"
            className="store-mode-theme"
            onClick={pickTheme}
            aria-label={dark ? t("storeMode.toLight") : t("storeMode.toDark")}
            title={dark ? t("storeMode.toLight") : t("storeMode.toDark")}
          >
            {dark ? "☀" : "☾"}
          </button>
        </div>

        <div className="store-mode-summary">
          <span className={`store-mode-num${celebrate ? " pulse" : ""}`}>{left}</span>
          <div className="store-mode-progress">
            <span className="store-mode-at">{t("storeMode.leftOnList")}</span>
            <div className="store-mode-track" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="store-mode-list" ref={listRef} onClickCapture={swallowClick}>
        <div className="store-mode-toolbar">
          <div className="store-mode-toggles" role="group" aria-label={t("storeMode.viewAria")}>
            <button type="button" aria-pressed={flat} className={flat ? "on" : ""} onClick={() => setFlat(!flat)}>
              {t("storeMode.all")}
            </button>
            <button type="button" aria-pressed={aisle} className={aisle ? "on" : ""} onClick={() => setAisle(!aisle)}>
              {t("storeMode.aisle")}
            </button>
          </div>
          <button type="button" className={`store-mode-hide${hideDone ? " on" : ""}`} aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)}>
            {t("storeMode.hideDone")}
          </button>
        </div>

        {canDrag && total > 0 && <p className="store-mode-hint">{t("storeMode.moveHint")}</p>}
        {total === 0 && <p className="store-mode-empty">{t("storeMode.empty")}</p>}

        {groups.map((group) => (
          <StoreDropZone
            key={group.store ?? "all"}
            store={group.store ?? ""}
            className="store-mode-store"
            data-store={group.store ?? undefined}
          >
            {group.store != null && (
              <div className="store-mode-store-head">
                <button
                  type="button"
                  className="store-mode-store-toggle"
                  aria-expanded={!collapsed[group.store]}
                  aria-label={t(collapsed[group.store] ? "storeMode.expandAria" : "storeMode.collapseAria", { store: storeLabel(group.store) })}
                  onClick={() => setCollapsed((c) => ({ ...c, [group.store]: !c[group.store] }))}
                >
                  <span className={`store-mode-chevron${collapsed[group.store] ? " folded" : ""}`} aria-hidden="true">
                    <span />
                  </span>
                  <StoreSticker name={storeLabel(group.store)} color={colorOfStore(colors, group.store)} dark={dark} />
                </button>
                <span className="store-mode-badge">{t("storeMode.leftBadge", { count: group.left })}</span>
              </div>
            )}
            {group.sections.map((section) => (
              <div key={section.id || "list"} className="store-mode-group">
                {aisle && <div className="store-mode-aisle">{aisleLabel(section.id)}</div>}
                {section.rows.map((row) => (
                  <DraggableRow
                    key={row.item.key}
                    itemKey={row.item.key}
                    flash={flash === row.item.key}
                    drag={canDrag ? { name: capitalize(row.item.name), from: row.store, drop: (store) => dropOn(row, store) } : null}
                  >
                    <GroceryItem
                      variant="store"
                      item={row.item}
                      checked={!!checked[row.item.key]}
                      deal={row.deal}
                      brand={brandOf(row.deal || row.flyerDeal)}
                      onToggle={() => onToggle(row.item.key)}
                    />
                  </DraggableRow>
                ))}
              </div>
            ))}
          </StoreDropZone>
        ))}
        {canDrag && (
          <DropTray
            stores={moveTargets.filter((store) => !groups.some((g) => g.store === store))}
            colors={colors}
            dark={dark}
            storeLabel={storeLabel}
          />
        )}
      </div>

      {celebrate && <StoreConfetti />}
      {sheet === "colours" && (
        <ColoursSheet stores={stores} colors={colors} dark={dark} storeLabel={storeLabel} onColor={setColor} onReset={resetColors} onClose={() => setSheet(null)} />
      )}
      {sheet === "leave" && (
        <LeaveSheet count={sendCount} busy={busy} onAdd={addChecked} onLeave={onClose} onKeep={() => setSheet(null)} />
      )}
      {sheet === "added" && <AddedSheet count={added} onBack={() => setSheet(null)} />}
    </div>
  );
}
