import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { useTheme } from "../hooks/useTheme.js";
import { buildTakeOut } from "../lib/inventoryMatch.js";
import { editedRow, plannedMealFor, startingPortions, takesFrom } from "../lib/cookedView.js";
import { leftoverItem, leftoverKeepDays, linkableCopies, FRIDGE_DAYS } from "../lib/leftovers.js";
import { toDateKey } from "../lib/dates.js";
import { currentMealType } from "../lib/homeWeek.js";
import { DoneModal, LeftoversCard, TakeOutCard } from "./CookedViewParts.jsx";
import { ThemeSwitch } from "./ThemeSwitch.jsx";
import { t } from "../i18n/index.js";

// The finished view: "I cooked this" (« Je l'ai cuisiné »), the one screen behind
// three doors - the last step of Cook mode (full screen, `variant="screen"`), a
// planned meal's card on the Planner and tonight's meal on Home (a sheet over
// the page). Design: docs/design/riso-v2-cook-mode/ (Cook Mode Finished).
//
// Leftovers come first; the Inventory card wakes up once they are added or
// skipped. Then "Remove from inventory" takes the ticked amounts out (items at
// zero leave), or "Not now" leaves Inventory as it was; either way the meal is
// marked cooked in the Planner, so its ingredients leave the grocery list. One
// Undo puts everything back: on each card, and on the toast after the view
// closes. App.jsx renders the one CookedViewHost; open it with `openCooked`.

function useLeftoverPlaces(recipe) {
  return useMemo(
    () => [
      {
        id: "fridge",
        label: t("cookMode.fridge"),
        range: recipe?.fridgeLifeDays && recipe.fridgeLifeDays !== FRIDGE_DAYS ? t("cooked.leftovers.keepDays", { count: leftoverKeepDays(recipe, "fridge") }) : t("cookMode.fridgeRange"),
      },
      { id: "freezer", label: t("cookMode.freezer"), range: t("cookMode.freezerRange") },
    ],
    [recipe]
  );
}

export function CookedView({ recipe, servings, variant, mealType, userId, rows, shelfName, portionsStart, actions, onClose, onBackToStep1 }) {
  const isPhone = useIsPhone();
  const { theme, dark, toggle } = useTheme();
  const places = useLeftoverPlaces(recipe);
  const [lf, setLf] = useState("active"); // "active" | "added" | "none"
  const [portions, setPortions] = useState(portionsStart);
  const [place, setPlace] = useState("fridge");
  const [inv, setInv] = useState("active"); // "active" | "removed" | "skipped"
  const [edits, setEdits] = useState({});
  const [listed, setListed] = useState(() => new Set());
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const shown = rows.map((row) => editedRow(row, edits[row.key]));
  const meal = mealType === "breakfast" || mealType === "lunch" ? mealType : "dinner";
  const screen = variant === "screen";

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const addLeftovers = () =>
    run(async () => {
      if (portions <= 0) {
        setLf("none");
        return;
      }
      await actions.addLeftovers(portions, place);
      setLf("added");
    });

  // Undo on the Leftovers card puts everything back, as the design asks: the
  // leftovers, and the Inventory answer if there was one.
  const undoLeftovers = () =>
    run(async () => {
      await actions.undoAll();
      setLf("active");
      setInv("active");
      setModal(false);
    });

  const finish = (takes) =>
    run(async () => {
      await actions.finish(takes);
      setInv(takes.length > 0 ? "removed" : "skipped");
      setModal(true);
    });

  const undoInventory = () =>
    run(async () => {
      await actions.undoInventory();
      setInv("active");
      setModal(false);
    });

  async function runningLow(name) {
    await actions.runningLow(name, () => setListed((prev) => new Set([...prev].filter((n) => n !== name))));
    setListed((prev) => new Set(prev).add(name));
  }

  // Escape closes the view (not while the pop-up is open: it closes the pop-up).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape" || modal || e.target.closest?.("input")) return;
      onClose({});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  const body = (
    <main className="ck-main">
      <div className="ck-inner">
        <div className="ck-hero">
          <span className="ck-sticker">{t("cookMode.allDone")}</span>
          <h1 className="ck-title">
            {t(`cooked.readyStart.${meal}`)} <span className="accent">{t("cookMode.readyAccent")}</span>
          </h1>
        </div>
        {error && (
          <p className="ck-error" role="alert">
            {t("cooked.failed")}
          </p>
        )}
        <div className="ck-grid">
          <LeftoversCard
            userId={userId}
            recipe={recipe}
            servings={servings}
            state={lf}
            portions={portions}
            place={place}
            places={places}
            busy={busy}
            phone={isPhone}
            onPortions={setPortions}
            onPlace={setPlace}
            onAdd={addLeftovers}
            onNone={() => setLf("none")}
            onUndo={undoLeftovers}
          />
          <div className="ck-then" aria-hidden="true">
            <span className="ck-then-pill">{lf === "active" ? t("cooked.then") : t("cooked.now")}</span>
            <span className="ck-then-arrow">{isPhone ? "↓" : "→"}</span>
          </div>
          <TakeOutCard
            userId={userId}
            rows={shown}
            state={inv}
            dim={lf === "active"}
            busy={busy}
            shelfName={shelfName}
            listed={listed}
            onToggle={(row) => setEdits((prev) => ({ ...prev, [row.key]: { ...prev[row.key], on: !row.on } }))}
            onAmount={(row, amount) => {
              if (amount === undefined) return;
              const on = amount === "all" || (typeof amount === "number" && amount > 0);
              setEdits((prev) => ({ ...prev, [row.key]: { amount, on } }));
            }}
            onRunningLow={runningLow}
            onRemove={() => {
              const takes = takesFrom(shown);
              finish(takes);
            }}
            onNotNow={() => finish([])}
            onUndo={undoInventory}
          />
        </div>
        {screen && onBackToStep1 && (
          <button type="button" className="ck-back riso-press" onClick={onBackToStep1}>
            ← {t("cookMode.backToStep1")}
          </button>
        )}
      </div>
      {modal && (
        <DoneModal
          mealType={meal}
          taken={inv === "removed" ? shown.filter((r) => r.kind === "item" && r.on).length : 0}
          portions={lf === "added" ? portions : 0}
          onBack={() => onClose({ celebrate: true })}
          onStay={() => setModal(false)}
        />
      )}
    </main>
  );

  const meta = [t("cookMode.meta"), t("cookMode.serves", { count: servings })].join(" · ");
  const top = (
    <header className="cm-topbar ck-topbar">
      <div className="cm-title-block">
        <div className="cm-recipe-title">{recipe.title}</div>
        {!isPhone && <div className="cm-meta">{meta}</div>}
      </div>
      {screen && <ThemeSwitch dark={dark} onToggle={toggle} className="cm-theme" />}
      <button type="button" className="cm-exit" aria-label={t("common.close")} title={t("common.close")} onClick={() => onClose({})}>
        ×
      </button>
    </header>
  );

  if (screen) {
    return (
      <div className="cm-overlay riso-theme ck-screen" data-theme={theme} onClick={(e) => e.stopPropagation()}>
        {top}
        {body}
      </div>
    );
  }
  return (
    <div className="ck-sheet-backdrop riso-theme" data-theme="light" onClick={() => onClose({})}>
      <div className="ck-sheet" role="dialog" aria-modal="true" aria-label={t("cooked.button")} onClick={(e) => e.stopPropagation()}>
        {top}
        {body}
      </div>
    </div>
  );
}

// The one finished view in the app. `open` is { recipe, servings, entry?,
// variant, onBackToStep1?, onExitCook? }: a planned meal (`entry`) is the one
// marked cooked; without one (Cook mode) it is this recipe's meal today, else its
// last one earlier this week (`plannedMealFor`). Everything saved here is kept in
// `session` so one Undo can put it all back.
export function CookedViewHost({
  open,
  userId,
  pantryInventory,
  setPantryInventory,
  shelfName,
  customStaples,
  excludedStaples,
  entries,
  addItem,
  setCooked,
  linkMeals,
  runningLow,
  showToast,
  onClosed,
}) {
  const session = useRef({});
  // The list is worked out once, from Inventory as it was when the view opened.
  const rows = useMemo(
    () => (open ? buildTakeOut({ recipe: open.recipe, servings: open.servings, inventory: pantryInventory, customStaples, excludedStaples }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );
  const entry = useMemo(() => (open ? open.entry || plannedMealFor(open.recipe.id, entries, toDateKey(new Date())) : null), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leftover meals already planned for this recipe: they eat from the leftovers
  // added here, and how many there are is where the portions start.
  const copies = useMemo(() => (open ? linkableCopies(open.recipe.id, entries, toDateKey(new Date())) : []), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    session.current = {};
  }, [open]);
  if (!open) return null;
  const { recipe, servings } = open;

  async function putBack(result) {
    const restored = await api.putBackPantryItems(result.before, result.logIds);
    const ids = new Set(restored.map((i) => i.id));
    setPantryInventory((prev) => [...prev.filter((i) => !ids.has(i.id)), ...restored]);
  }

  async function undoInventory(s = session.current) {
    if (s.takeOut) await putBack(s.takeOut);
    if (s.cooked) {
      await setCooked(s.cooked, null);
      open.onMarked?.(s.cooked.id, null);
    }
    s.takeOut = null;
    s.cooked = null;
  }

  async function undoAll(s = session.current) {
    await undoInventory(s);
    if (s.linked?.length) {
      await linkMeals(s.linked, null);
      s.linked = null;
    }
    if (s.leftover) {
      const id = s.leftover.id;
      setPantryInventory((prev) => prev.filter((i) => i.id !== id));
      await api.deletePantryInventoryItem(id);
      s.leftover = null;
    }
  }

  const actions = {
    // The Leftovers card is the confirmation: the item it shows goes in as it is.
    async addLeftovers(portions, place) {
      const item = await addItem(leftoverItem(recipe, portions, place));
      session.current.leftover = item;
      if (copies.length > 0) {
        const ids = copies.map((e) => e.id);
        await linkMeals(ids, item.id);
        session.current.linked = ids;
      }
    },
    async finish(takes) {
      if (takes.length > 0) {
        const result = await api.takeOutPantryItems(takes);
        session.current.takeOut = result;
        const removed = new Set(result.removedIds);
        const changed = new Map(result.items.map((i) => [i.id, i]));
        setPantryInventory((prev) => prev.filter((i) => !removed.has(i.id)).map((i) => changed.get(i.id) || i));
      }
      if (entry) {
        const at = new Date().toISOString();
        await setCooked(entry, at);
        open.onMarked?.(entry.id, at);
        session.current.cooked = entry;
      }
    },
    undoInventory: () => undoInventory(),
    undoAll: () => undoAll(),
    runningLow,
  };

  // × and Escape ({}), "Back to the app" ({ celebrate }) or "Back to step 1"
  // ({ back }): App closes the view (and Cook mode, unless going back to step 1).
  // Whatever was saved gets the shared toast, whose Undo puts it all back.
  function close(how = {}) {
    const s = session.current;
    session.current = {};
    if (s.leftover || s.takeOut || s.cooked) {
      showToast(t("cooked.toast", { title: recipe.title }), () => undoAll(s));
    }
    onClosed(how);
  }

  return (
    <CookedView
      key={open.key}
      recipe={recipe}
      servings={servings}
      variant={open.variant}
      mealType={entry?.mealType || currentMealType()}
      userId={userId}
      rows={rows}
      shelfName={shelfName}
      portionsStart={startingPortions(servings, copies.length)}
      actions={actions}
      onClose={close}
      onBackToStep1={open.onBackToStep1 ? () => close({ back: true }) : null}
    />
  );
}
