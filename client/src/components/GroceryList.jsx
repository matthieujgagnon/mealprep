import { useEffect, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { api } from "../api.js";
import { buildGroceryList, findMatchingDeal, formatAmount } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { formatWeekRangeLabel, isCurrentWeek } from "../lib/dates.js";
import { Segmented, HintStrip } from "./RisoControls.jsx";
import { StoreMode } from "./StoreMode.jsx";

// Per-item "which store do I usually get this at" preference — new in the
// Riso redesign (there's no server schema for it yet). Lasting-but-not-
// critical, so it lives in localStorage the same way Makeable's "also have"
// list does (see WhatCanIMake.jsx) rather than round-tripping to the server
// for something this low-stakes. Hint-strip dismissal itself goes through
// the shared per-user-per-screen mechanism (RisoControls.jsx's <HintStrip>,
// lib/hints.js) instead of its own key.
const STORE_PREF_KEY = "mealprep-grocery-store-pref";
const DEFAULT_STORE = "Metro";
const ANY_STORE = "Any store"; // unfiled items, once you've made stores of your own // matches the placeholder store name used elsewhere (FlyerDeals' upload form) when nothing else is known yet

// The last loaded state of each week's list, so coming back to the tab shows
// it straight away instead of every item unchecked until the server answers.
const weekCache = new Map();

function loadStorePrefs() {
  try {
    const raw = localStorage.getItem(STORE_PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Free-text "2 lemons" -> { name: "lemons", quantity: 2 }. Deliberately
// simple (a leading quantity, then the rest is the name) rather than a real
// parser — good enough for "2 lemons"/"1/2 cup sugar"/"paper towels" without
// trying to also recognize a unit in the middle of the phrase.
function parseAddInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s+(.+)$/);
  if (match) {
    return { name: match[2].trim(), quantity: parseQuantityInput(match[1]) };
  }
  return { name: trimmed, quantity: null };
}

function formatStoreList(stores) {
  if (stores.length === 0) return "";
  if (stores.length === 1) return stores[0];
  if (stores.length === 2) return `${stores[0]} and ${stores[1]}`;
  return `${stores.slice(0, -1).join(", ")} and ${stores[stores.length - 1]}`;
}

// Groups shopping items by which recipe(s) they're used in. A shared
// ingredient (e.g. garlic used in two recipes) appears under both headings —
// that's intentional, it shows the full picture of what each recipe needs.
// A manually-added item isn't used in any recipe (usedIn is always empty for
// those), so it gets its own catch-all heading instead of silently vanishing
// from this view.
const MANUAL_GROUP_LABEL = "Added by you";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_NAMES = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };

const VIEWS = [
  { id: "store", label: "By store" },
  { id: "aisle", label: "By aisle" },
  { id: "recipe", label: "By recipe" },
];

// The amount cell: your own amount when you've set one (with what the
// recipes call for underneath), otherwise the recipe amount. Tap to edit;
// clearing it goes back to the recipe amount.
function QuantityCell({ item, onSave }) {
  const [editing, setEditing] = useState(false);
  const recipeAmount = formatAmount(item.parts);
  const [draft, setDraft] = useState("");

  function start(e) {
    e.stopPropagation();
    setDraft(item.customQuantity || recipeAmount);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    // Typing the recipe amount back in is the same as "no override".
    const value = !next || next === recipeAmount ? null : next;
    if (value !== (item.customQuantity || null)) onSave(value);
  }

  if (editing) {
    return (
      <span className="riso-row-qty editing" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          aria-label={`Amount of ${item.name}`}
          value={draft}
          placeholder="e.g. 2 packs"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        {item.customQuantity && recipeAmount && (
          <button
            type="button"
            className="riso-row-qty-reset"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(false);
              onSave(null);
            }}
          >
            use recipe amount
          </button>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`riso-row-qty${item.customQuantity ? " custom" : ""}${!item.customQuantity && !recipeAmount ? " empty" : ""}`}
      title="Tap to set your own amount"
      aria-label={`Edit amount of ${item.name}`}
      onClick={start}
    >
      {item.customQuantity ? (
        <>
          <span className="riso-row-qty-mine">{item.customQuantity}</span>
          {recipeAmount && !item.isManual && <span className="riso-row-qty-recipe">recipe: {recipeAmount}</span>}
        </>
      ) : (
        <span className="riso-row-qty-mine">{recipeAmount || "+ amount"}</span>
      )}
    </button>
  );
}

function GroceryRow({ item, checked, onToggle, sale, store, onCycleStore, canCycleStore, sub, onDelete, onSetQuantity, dragHandle, dragging }) {
  return (
    <div
      className={`riso-row${checked ? " checked" : ""}${dragging ? " dragging" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Check off ${item.name}`}
      aria-pressed={checked}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {dragHandle}
      <span className={`riso-row-check${checked ? " on" : ""}`}>{checked ? "✓" : ""}</span>
      <span className="riso-row-main">
        <span className="riso-row-namerow">
          <span className={`riso-row-name${checked ? " struck" : ""}`}>
            {item.name}
            {item.varieties.length > 0 && ` (${item.varieties.join(", ")})`}
          </span>
        </span>
        {sub && <span className="riso-row-sub">{sub}</span>}
      </span>
      {sale && <span className="riso-row-sale">{sale}</span>}
      {canCycleStore ? (
        <button
          type="button"
          className="riso-row-store"
          title="This item's store - tap to switch it to another store you shop at"
          onClick={(e) => {
            e.stopPropagation();
            onCycleStore();
          }}
        >
          {store} ⇄
        </button>
      ) : (
        <span
          className="riso-row-store static"
          title="This item's store. Upload a flyer from another store (Flyers tab) to be able to switch it."
        >
          {store}
        </span>
      )}
      <QuantityCell item={item} onSave={onSetQuantity} />
      <button
        type="button"
        className="riso-row-delete"
        aria-label={`Remove ${item.name}`}
        title={item.isManual ? "Delete this item" : "Remove from this week's list (the recipe isn't changed)"}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
    </div>
  );
}

// In "By store", a row can be dragged by its grip into another store.
function DraggableGroceryRow(props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `grocery-${props.item.key}`,
    data: { item: props.item },
  });
  const handle = (
    <span
      ref={setNodeRef}
      className="riso-row-grip"
      aria-label={`Move ${props.item.name} to another store`}
      title="Drag to another store"
      onClick={(e) => e.stopPropagation()}
      {...listeners}
      {...attributes}
    >
      ⠿
    </span>
  );
  return <GroceryRow {...props} dragHandle={handle} dragging={isDragging} />;
}

function StoreGroup({ storeName, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id: `grocery-store-${storeName}`, data: { store: storeName } });
  return (
    <section ref={setNodeRef} className={`${className}${isOver ? " drop-active" : ""}`} aria-label={`${storeName} store`}>
      {children}
    </section>
  );
}

// A store's heading. Stores you made can be renamed (click the name) or
// removed (their items go back to where they'd land on their own).
function StoreGroupHead({ group, section, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  return (
    <div className="riso-group-head" style={{ background: "var(--riso-track)" }}>
      {editing ? (
        <input
          autoFocus
          className="riso-group-name-input"
          aria-label="Store name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            setEditing(false);
            if (name.trim() && name.trim() !== group.name) await onRename(name.trim()).catch(() => setName(group.name));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(group.name);
              setEditing(false);
            }
          }}
        />
      ) : section ? (
        <button type="button" className="riso-group-name as-button" title="Rename this store" onClick={() => setEditing(true)}>
          {group.name}
        </button>
      ) : (
        <p className="riso-group-name">{group.name}</p>
      )}
      <span className="riso-group-count">{group.count}</span>
      {section && (
        <button type="button" className="riso-group-remove" aria-label={`Remove the ${group.name} store`} title="Remove this store" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

function AddStoreForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  if (!open) {
    return (
      <button type="button" className="riso-grocery-add-store" onClick={() => setOpen(true)}>
        + Add store
      </button>
    );
  }
  return (
    <form
      className="riso-grocery-add-store form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
          await onAdd(name.trim());
          setName("");
          setOpen(false);
          setError(null);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <input autoFocus aria-label="Store name" placeholder="e.g. Costco" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="riso-grocery-add-btn">
        Add
      </button>
      <button type="button" className="riso-grocery-add-store-cancel" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="riso-grocery-add-store-error">{error}</p>}
    </form>
  );
}

export function GroceryList({
  user,
  plannerEntries,
  weekStart,
  customStaples,
  excludedStaples,
  stapleCategories,
  onAddPantryItem,
  onShopForEntry,
}) {
  const [deals, setDeals] = useState([]);
  // Which ingredient cores are checked off this week — lives on the server
  // (see api.listGroceryChecked/checkGroceryItem) so checking something off
  // on one device shows up on another instead of being stuck in that one
  // browser's localStorage.
  const [checked, setChecked] = useState({});
  const [extraItems, setExtraItems] = useState([]);
  const [overrides, setOverrides] = useState([]);
  // Checked items already added to Inventory by "Done shopping" - they stay
  // checked (you bought them) but are never added twice.
  const [inInventory, setInInventory] = useState(() => new Set());
  // Your own stores/sections (GrocerySection) and which ingredient goes where.
  const [sections, setSections] = useState([]);
  const [loadedWeek, setLoadedWeek] = useState(null);
  const [draggingItem, setDraggingItem] = useState(null);
  const [shareNote, setShareNote] = useState(null);
  const [addValue, setAddValue] = useState("");
  const [view, setView] = useState("store");
  const [storeMode, setStoreMode] = useState(false);
  const [storePrefs, setStorePrefs] = useState(loadStorePrefs);
  // core -> USDA FoodKeeper category string ("Produce", "Dairy Products &
  // Eggs", ...), fetched lazily (see the effect below) and cached here so
  // flipping between views never re-fetches a core it already has.
  const [categoryCache, setCategoryCache] = useState({});
  // Tracks which items have already been sent to the pantry this "Done
  // shopping" pass, purely to stop a double-click from adding the same item
  // twice before `checked` resets — not persisted, a stray re-add on reload
  // is harmless (you bought it again).
  const [pantryAddedKeys, setPantryAddedKeys] = useState(() => new Set());

  useEffect(() => {
    api.getRealDeals().then(setDeals).catch(() => {});
  }, []);

  // Everything week-specific (checkmarks, hand-added items, removed rows /
  // own amounts, what's gone to Inventory) loads together, and the list
  // waits for it - showing the rows first made every item flash unchecked.
  // A week seen before shows its cached state straight away.
  useEffect(() => {
    let cancelled = false;
    const cached = weekCache.get(weekStart);
    if (cached) {
      setChecked(cached.checked);
      setExtraItems(cached.extraItems);
      setOverrides(cached.overrides);
      setInInventory(cached.inInventory);
      setLoadedWeek(weekStart);
    } else {
      setLoadedWeek(null);
    }
    const fallback = (p, value) => p.catch(() => value);
    Promise.all([
      fallback(api.listGroceryChecked(weekStart), []),
      fallback(api.listGroceryExtras(weekStart), []),
      fallback(api.listGroceryOverrides(weekStart), []),
      fallback(api.listGroceryInInventory(weekStart), []),
    ]).then(([cores, extras, overrideRows, sent]) => {
      if (cancelled) return;
      setChecked(Object.fromEntries(cores.map((c) => [c, true])));
      setExtraItems(extras);
      setOverrides(overrideRows);
      setInInventory(new Set(sent));
      setLoadedWeek(weekStart);
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const loaded = loadedWeek === weekStart;
  useEffect(() => {
    if (loaded) weekCache.set(weekStart, { checked, extraItems, overrides, inInventory });
  }, [loaded, weekStart, checked, extraItems, overrides, inInventory]);

  useEffect(() => {
    api.listGrocerySections().then(setSections).catch(() => setSections([]));
  }, []);

  const items = buildGroceryList(plannerEntries, customStaples, stapleCategories, excludedStaples, extraItems, overrides);
  const shoppingItems = items.filter((i) => !i.isStaple && !i.removed);
  const hiddenKeys = new Set(overrides.filter((o) => o.hidden).map((o) => o.key));
  const removedItems = items.filter((i) => !i.isStaple && i.removed && !hiddenKeys.has(i.key));

  // Categories feed the aisle grouping itself AND the sub-line text shown in
  // the store and recipe views ("PRODUCE · SHRIMP TACOS" / "PRODUCE"), so
  // this can't wait for the user to actually switch to "By aisle" — the
  // default "By store" view needs it too. It's still lazy in every other
  // sense: it only ever asks for cores it doesn't already have cached, never
  // refetches when switching views back and forth, and reuses the existing
  // single-item suggest endpoint via Promise.all rather than a new batch
  // endpoint.
  useEffect(() => {
    const byCore = new Map(shoppingItems.map((i) => [i.core, i.name]));
    const missing = [...byCore.keys()].filter((core) => !(core in categoryCache));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((core) =>
        api
          .suggestPantryExpiration(byCore.get(core), "pantry")
          .then((r) => [core, r.category || "Other"])
          .catch(() => [core, "Other"])
      )
    ).then((pairs) => {
      if (cancelled) return;
      setCategoryCache((prev) => {
        const next = { ...prev };
        for (const [core, cat] of pairs) next[core] = cat;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoppingItems.map((i) => i.core).sort().join("|")]);

  // The stores the user actually shops at, in the order they first appear in
  // this week's flyer deals — there's no saved "my stores" list in the
  // schema, so this is derived instead. Falls back to a single default
  // bucket before any deals have ever been uploaded.
  // Your own stores (in your order) plus any store with a flyer deal. Items
  // you haven't filed land in the first flyer store - or, with no flyers,
  // in "Any store" once you've made stores of your own.
  const flyerStores = [...new Set(deals.map((d) => d.store).filter(Boolean))];
  const fallbackStore = flyerStores[0] || (sections.length > 0 ? ANY_STORE : DEFAULT_STORE);
  const storeOrder = (() => {
    const seen = sections.map((s) => s.name);
    for (const store of flyerStores) if (!seen.includes(store)) seen.push(store);
    if (!seen.includes(fallbackStore)) seen.unshift(fallbackStore);
    return seen;
  })();
  const sectionByName = new Map(sections.map((s) => [s.name, s]));
  const assignedStore = new Map(sections.flatMap((s) => (s.assignments || []).map((a) => [a.core, s.name])));

  // A manual "move to another store" tap always wins once set — otherwise
  // tapping the chip on a sale item would look like it did nothing, since
  // the sale would keep re-claiming the item back every render. Absent an
  // explicit preference, sale beats default store.
  function storeForItem(item, deal) {
    const assigned = assignedStore.get(item.core);
    if (assigned) return assigned;
    const pref = storePrefs[item.core];
    if (pref && storeOrder.includes(pref)) return pref;
    if (deal?.store) return deal.store;
    return fallbackStore;
  }

  function persistStorePrefs(next) {
    setStorePrefs(next);
    try {
      localStorage.setItem(STORE_PREF_KEY, JSON.stringify(next));
    } catch {
      // best-effort
    }
  }

  function cycleStore(item, currentStore) {
    const idx = storeOrder.indexOf(currentStore);
    moveToStore(item, storeOrder[(idx + 1) % storeOrder.length]);
  }

  // Filing an item under a store saves it for every week (by ingredient).
  // A flyer store you haven't made your own yet becomes one on first use.
  async function moveToStore(item, storeName) {
    if (storeForItem(item, findMatchingDeal(item.name, deals)) === storeName) return;
    if (storeName === ANY_STORE) {
      setSections((prev) => prev.map((s) => ({ ...s, assignments: (s.assignments || []).filter((a) => a.core !== item.core) })));
      await api.unassignFromGrocerySection(item.core);
      return;
    }
    let section = sectionByName.get(storeName);
    if (!section) {
      section = await api.createGrocerySection(storeName);
      setSections((prev) => [...prev, section]);
    }
    const core = item.core;
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        assignments: [
          ...(s.assignments || []).filter((a) => a.core !== core),
          ...(s.id === section.id ? [{ core, sectionId: s.id }] : []),
        ],
      }))
    );
    await api.assignToGrocerySection(section.id, core);
    if (storePrefs[core]) {
      const { [core]: _dropped, ...rest } = storePrefs;
      persistStorePrefs(rest);
    }
  }

  async function addStore(name) {
    const section = await api.createGrocerySection(name);
    setSections((prev) => [...prev, section]);
  }

  async function renameStore(section, name) {
    const saved = await api.renameGrocerySection(section.id, name);
    setSections((prev) => prev.map((s) => (s.id === section.id ? saved : s)));
  }

  async function removeStore(section) {
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    await api.deleteGrocerySection(section.id);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  // Optimistic: flip the checkbox immediately, then persist — reverting if
  // the request fails, so a dropped connection doesn't leave the UI showing
  // a check that never actually saved.
  async function toggle(key) {
    const wasChecked = !!checked[key];
    setChecked((prev) => ({ ...prev, [key]: !wasChecked }));
    // Unchecking deletes the server row, "added to Inventory" mark included.
    if (wasChecked) {
      setInInventory((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
    try {
      if (wasChecked) await api.uncheckGroceryItem(weekStart, key);
      else await api.checkGroceryItem(weekStart, key);
    } catch {
      setChecked((prev) => ({ ...prev, [key]: wasChecked }));
    }
  }

  async function clearChecked() {
    setChecked({});
    await api.clearGroceryChecked(weekStart);
  }

  async function addToPantry(item) {
    if (!onAddPantryItem || pantryAddedKeys.has(item.key)) return;
    setPantryAddedKeys((prev) => new Set(prev).add(item.key));
    try {
      // Your own amount wins ("2 packs" -> 2 packs), else the recipe amount.
      const own = item.customQuantity?.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s*(.*)$/);
      await onAddPantryItem({
        name: item.name,
        quantity: own ? parseQuantityInput(own[1]) : item.customQuantity ? null : item.parts?.[0]?.quantity ?? null,
        unit: own ? own[2].trim() || null : item.customQuantity ? null : item.parts?.[0]?.unit ?? null,
      });
    } catch {
      setPantryAddedKeys((prev) => {
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
    }
  }

  // Checking something off is exactly the moment you know you bought it, so
  // "Done shopping" is when every checked item lands in Inventory (with a
  // USDA use-by date, via the same suggest logic the pantry-add endpoint
  // already runs). Items stay checked afterwards - the list shows the week
  // as bought - and are remembered as added so they're never added twice.
  async function handleDoneShopping() {
    const toAdd = shoppingItems.filter((i) => checked[i.key] && !inInventory.has(i.key));
    for (const item of toAdd) {
      await addToPantry(item);
    }
    const keys = toAdd.map((i) => i.key);
    if (keys.length === 0) return;
    setInInventory((prev) => new Set([...prev, ...keys]));
    await api.markGroceryInInventory(weekStart, keys).catch(() => {});
  }

  // Plain-text copy of what's still to buy, grouped like the list on screen.
  function listAsText() {
    const lines = [`Grocery list · ${formatWeekRangeLabel(weekStart)}`];
    for (const group of groups) {
      const open = group.sorted.filter((r) => !checked[r.item.key]);
      if (open.length === 0) continue;
      lines.push("", group.name);
      for (const { item } of open) {
        const amount = item.customQuantity || formatAmount(item.parts);
        lines.push(`- ${item.name}${amount ? ` (${amount})` : ""}`);
      }
    }
    return lines.join("\n");
  }

  async function handleShare() {
    const text = listAsText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Grocery list", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote("Copied - paste it anywhere");
    } catch (err) {
      if (err?.name === "AbortError") return; // closed the share sheet
      setShareNote("Couldn't share - try again");
    }
    setTimeout(() => setShareNote(null), 2500);
  }

  async function addStapleToList(item) {
    const created = await api.addGroceryExtra(weekStart, {
      name: item.name,
      quantity: item.parts?.[0]?.quantity ?? null,
      unit: item.parts?.[0]?.unit ?? null,
    });
    setExtraItems((prev) =>
      prev.some((i) => i.id === created.id) ? prev.map((i) => (i.id === created.id ? created : i)) : [...prev, created]
    );
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    const parsed = parseAddInput(addValue);
    if (!parsed || !parsed.name) return;
    const created = await api.addGroceryExtra(weekStart, { name: parsed.name, quantity: parsed.quantity, unit: null });
    // The server hands back the existing row (quantity merged) for a name
    // already on the list, so replace rather than append.
    setExtraItems((prev) =>
      prev.some((i) => i.id === created.id) ? prev.map((i) => (i.id === created.id ? created : i)) : [...prev, created]
    );
    setAddValue("");
  }

  async function deleteExtraItem(id) {
    setExtraItems((prev) => prev.filter((i) => i.id !== id));
    await api.deleteGroceryExtra(id);
  }

  // Optimistic, like toggle() above: the row changes right away, then the
  // server's answer (or the previous state, on failure) wins.
  async function setOverride(key, patch) {
    const prev = overrides;
    const current = prev.find((o) => o.key === key) || { key, quantity: null, removed: false };
    setOverrides([...prev.filter((o) => o.key !== key), { ...current, ...patch }]);
    try {
      const saved = await api.setGroceryOverride(weekStart, key, patch);
      setOverrides((now) => [...now.filter((o) => o.key !== key), ...(saved ? [saved] : [])]);
    } catch {
      setOverrides(prev);
    }
  }

  function removeItem(item) {
    if (item.isManual) deleteExtraItem(item.manualId);
    else setOverride(item.key, { removed: true });
  }

  // "Clear" on the removed strip: they stay off the list, just not listed.
  function clearRemoved() {
    for (const item of removedItems) setOverride(item.key, { hidden: true });
  }

  // Builds the groups for whichever view is active. Every row already knows
  // its own store/deal/category, computed once here rather than re-derived
  // per row.
  function buildGroups() {
    const rows = shoppingItems.map((item) => {
      const deal = findMatchingDeal(item.name, deals);
      return { item, deal, store: storeForItem(item, deal), category: categoryCache[item.core] || null };
    });

    const buckets = new Map();
    let order = [];

    if (view === "store") {
      order = [...storeOrder];
      for (const store of storeOrder) buckets.set(store, []);
      for (const row of rows) {
        if (!buckets.has(row.store)) {
          buckets.set(row.store, []);
          order.push(row.store);
        }
        buckets.get(row.store).push(row);
      }
    } else if (view === "aisle") {
      for (const row of rows) {
        const key = row.category || "Other";
        if (!buckets.has(key)) {
          buckets.set(key, []);
          order.push(key);
        }
        buckets.get(key).push(row);
      }
      order.sort((a, b) => a.localeCompare(b));
    } else {
      for (const row of rows) {
        const names = row.item.usedIn.length > 0 ? row.item.usedIn : [MANUAL_GROUP_LABEL];
        for (const name of names) {
          if (!buckets.has(name)) {
            buckets.set(name, []);
            order.push(name);
          }
          buckets.get(name).push(row);
        }
      }
      order.sort((a, b) => {
        if (a === MANUAL_GROUP_LABEL) return 1;
        if (b === MANUAL_GROUP_LABEL) return -1;
        return a.localeCompare(b);
      });
    }

    return order
      .filter((key) => buckets.get(key)?.length > 0 || (view === "store" && sectionByName.has(key)))
      .map((key) => {
        const groupRows = buckets.get(key);
        const sales = groupRows.filter((r) => r.deal).length;
        const remaining = groupRows.filter((r) => !checked[r.item.key]).length;
        const sorted = [...groupRows].sort((a, b) => (checked[a.item.key] ? 1 : 0) - (checked[b.item.key] ? 1 : 0));
        return {
          key,
          name: key,
          sorted,
          count: `${remaining} LEFT${view === "store" && sales ? ` · ${sales} ON SALE` : ""}`,
        };
      });
  }

  function subLineFor(row) {
    const category = row.category || "";
    if (view === "aisle") return row.item.usedIn.join(" · ").toUpperCase();
    if (view === "store") {
      const first = row.item.usedIn[0] || "";
      return category ? `${category}${first ? " · " + first : ""}`.toUpperCase() : first.toUpperCase();
    }
    return category.toUpperCase();
  }

  const groups = buildGroups();
  const storeRows = shoppingItems.map((item) => {
    const deal = findMatchingDeal(item.name, deals);
    return { item, deal, store: storeForItem(item, deal) };
  });
  const storesWithItems = storeOrder.filter((st) => storeRows.some((r) => r.store === st));

  const doneCount = shoppingItems.filter((i) => checked[i.key]).length;
  const toSendCount = shoppingItems.filter((i) => checked[i.key] && !inInventory.has(i.key)).length;
  const allBought = shoppingItems.length > 0 && shoppingItems.every((i) => checked[i.key] && inInventory.has(i.key));
  const leftoverEntries = plannerEntries.filter((e) => e.isLeftover && e.recipe && !e.recipe.isPlaceholder);
  const alreadyHaveEntries = plannerEntries.filter((e) => e.alreadyHave && e.recipe && !e.recipe.isPlaceholder);
  const stapleItems = items.filter((i) => i.isStaple);
  const manualCores = new Set(extraItems.map((x) => items.find((i) => i.manualId === x.id)?.core).filter(Boolean));
  const leftOffCount = leftoverEntries.length + alreadyHaveEntries.length + stapleItems.length;
  const totalCount = shoppingItems.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const onSaleRows = shoppingItems
    .map((item) => ({ item, deal: findMatchingDeal(item.name, deals) }))
    .filter((r) => r.deal && !checked[r.item.key]);
  const onSaleStores = [...new Set(onSaleRows.map((r) => r.deal.store).filter(Boolean))];

  const weekLabel = isCurrentWeek(weekStart)
    ? formatWeekRangeLabel(weekStart)
    : `week of ${formatWeekRangeLabel(weekStart)}`;
  const subLabel = `${weekLabel.toUpperCase()} · ${totalCount - doneCount} TO BUY`;

  const hintText =
    view === "store"
      ? "Sale items go to the store with the deal. Drag an item by its ⠿ grip into another store (or tap its store tag), and it stays there every week. Add your own stores below the list."
      : "This list is built from your Planner. Tap an item to check it off. Checked items drop to the bottom.";

  return (
    <div className="riso-theme riso-grocery" data-theme="light">
      <div className="riso-grocery-header">
        <div className="riso-grocery-title-block">
          <div className="riso-eyebrow">{subLabel}</div>
          <h1 className="riso-grocery-title">
            Grocery <span className="accent">list.</span>
          </h1>
        </div>
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <div className="riso-grocery-share-wrap">
          <button
            type="button"
            className="riso-grocery-share"
            onClick={handleShare}
            disabled={totalCount - doneCount === 0}
            title="Send what's left to buy as a text list"
          >
            Share
          </button>
          {shareNote && (
            <span className="riso-grocery-share-note" role="status">
              {shareNote}
            </span>
          )}
        </div>
      </div>

      <div className="riso-grocery-body">
        <div className="riso-grocery-main">
          <HintStrip userId={user.id} screenKey="grocery">
            {hintText}
          </HintStrip>

          <form className="riso-grocery-add" onSubmit={handleAddSubmit}>
            <input
              type="text"
              placeholder="Add an item, e.g. 2 lemons"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
            />
            <button type="submit" className="riso-grocery-add-btn">
              Add
            </button>
          </form>

          {!loaded ? (
            <div className="riso-grocery-loading" aria-busy="true" aria-label="Loading your list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="riso-grocery-loading-row" />
              ))}
            </div>
          ) : plannerEntries.length === 0 && extraItems.length === 0 && sections.length === 0 ? (
            <p className="riso-empty">
              Nothing planned for {weekLabel} yet — plan a few meals on the Planner tab and your
              grocery list builds itself. You can still add items by hand above.
            </p>
          ) : groups.length === 0 ? (
            <p className="riso-empty">Nothing to buy — everything's a leftover, already on hand, or a pantry staple.</p>
          ) : view === "store" ? (
            <DndContext
              sensors={sensors}
              onDragStart={(e) => setDraggingItem(e.active.data.current?.item || null)}
              onDragCancel={() => setDraggingItem(null)}
              onDragEnd={(e) => {
                setDraggingItem(null);
                const store = e.over?.data.current?.store;
                const item = e.active.data.current?.item;
                if (store && item) moveToStore(item, store);
              }}
            >
              {groups.map((group) => {
                const section = sectionByName.get(group.name);
                return (
                  <StoreGroup key={group.key} storeName={group.name} className="riso-group">
                    <StoreGroupHead
                      group={group}
                      section={section}
                      onRename={(name) => renameStore(section, name)}
                      onRemove={() => removeStore(section)}
                    />
                    {group.sorted.length === 0 && <p className="riso-group-empty">Drag items here</p>}
                    {group.sorted.map((row) => (
                      <DraggableGroceryRow
                        key={`${group.key}-${row.item.key}`}
                        item={row.item}
                        checked={!!checked[row.item.key]}
                        onToggle={() => toggle(row.item.key)}
                        sale={row.deal?.price || ""}
                        store={row.store}
                        onCycleStore={() => cycleStore(row.item, row.store)}
                        canCycleStore={storeOrder.length > 1}
                        sub={subLineFor(row)}
                        onDelete={() => removeItem(row.item)}
                        onSetQuantity={(quantity) => setOverride(row.item.key, { quantity })}
                      />
                    ))}
                  </StoreGroup>
                );
              })}
              <AddStoreForm onAdd={addStore} />
              <DragOverlay dropAnimation={null}>
                {draggingItem && <div className="riso-grocery-drag-chip">{draggingItem.name}</div>}
              </DragOverlay>
            </DndContext>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="riso-group">
                <div className="riso-group-head" style={{ background: "var(--riso-canvas)" }}>
                  <p className="riso-group-name">{group.name}</p>
                  <span className="riso-group-count">{group.count}</span>
                </div>
                {group.sorted.map((row) => (
                  <GroceryRow
                    key={`${group.key}-${row.item.key}`}
                    item={row.item}
                    checked={!!checked[row.item.key]}
                    onToggle={() => toggle(row.item.key)}
                    sale={row.deal?.price || ""}
                    store={row.store}
                    onCycleStore={() => cycleStore(row.item, row.store)}
                    canCycleStore={storeOrder.length > 1}
                    sub={subLineFor(row)}
                    onDelete={() => removeItem(row.item)}
                    onSetQuantity={(quantity) => setOverride(row.item.key, { quantity })}
                  />
                ))}
              </section>
            ))
          )}

          {removedItems.length > 0 && (
            <div className="riso-grocery-removed">
              <span className="riso-grocery-removed-label">Removed this week</span>
              {removedItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="riso-grocery-removed-chip"
                  aria-label={`Put ${item.name} back on the list`}
                  onClick={() => setOverride(item.key, { removed: false })}
                >
                  {item.name} <span aria-hidden="true">↺</span>
                </button>
              ))}
              <button type="button" className="riso-grocery-removed-clear" onClick={clearRemoved}>
                Clear
              </button>
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <button type="button" className="riso-grocery-store-btn" onClick={() => setStoreMode(true)}>
            I'm at the store <span>BIG MODE</span>
          </button>
        )}

        <aside className="riso-grocery-aside">
          <section className={`riso-grocery-cart${allBought ? " done" : ""}`}>
            <div className="riso-eyebrow on-pink">In the cart</div>
            <div className="riso-grocery-cart-count">
              <span className="riso-grocery-cart-num">{doneCount}</span>
              <span className="riso-grocery-cart-label">of {totalCount} items</span>
            </div>
            <div className="riso-grocery-cart-track">
              <div className="riso-grocery-cart-fill" style={{ width: `${pct}%` }} />
            </div>
            {allBought ? (
              <p className="riso-grocery-cart-done">Groceries done ✓ Everything's in your Inventory.</p>
            ) : (
              <button type="button" className="riso-grocery-cart-btn" disabled={toSendCount === 0} onClick={handleDoneShopping}>
                Done shopping · add {toSendCount} to inventory
              </button>
            )}
            <p className="riso-grocery-cart-note">
              Checked items go to the Fridge, Freezer or Pantry with a USDA use-by date.
            </p>
          </section>

          {leftOffCount > 0 && (
            <section className="riso-grocery-excluded">
              <div className="riso-eyebrow">Left off this week</div>
              <p className="riso-grocery-excluded-intro">
                Not on your list because you won't need to buy {leftOffCount === 1 ? "it" : "them"}. Changed your
                mind? Put it back.
              </p>
              {[
                { title: "Leftovers", note: "made earlier", entries: leftoverEntries },
                { title: "Already have the food", note: "marked on the planner", entries: alreadyHaveEntries },
              ].map(
                ({ title, note, entries }) =>
                  entries.length > 0 && (
                    <div key={title} className="riso-grocery-review-group">
                      <p className="riso-grocery-review-title">
                        {title} <span>· {note}</span>
                      </p>
                      {entries.map((e) => (
                        <div key={e.id} className="riso-grocery-review-row">
                          <span>
                            {e.recipe.title}
                            <small>
                              {DAY_NAMES[e.dayOfWeek]} {MEAL_NAMES[e.mealType]}
                            </small>
                          </span>
                          <button type="button" onClick={() => onShopForEntry?.(e.id)}>
                            Shop for it
                          </button>
                        </div>
                      ))}
                    </div>
                  )
              )}
              {stapleItems.length > 0 && (
                <div className="riso-grocery-review-group">
                  <p className="riso-grocery-review-title">
                    Pantry staples <span>· you keep these</span>
                  </p>
                  <div className="riso-grocery-staple-chips">
                    {stapleItems.map((item) => {
                      const onList = manualCores.has(item.core);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`riso-grocery-staple-chip${onList ? " on" : ""}`}
                          disabled={onList}
                          aria-label={onList ? `${item.name} is on the list` : `Add ${item.name} to the list`}
                          title={formatAmount(item.parts) || undefined}
                          onClick={() => addStapleToList(item)}
                        >
                          {onList ? "✓" : "+"} {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="riso-grocery-sale">
            <span className="riso-sticker yellow" style={{ top: -14, right: 18, transform: "rotate(5deg)" }}>
              save!
            </span>
            <div className="riso-eyebrow">On sale</div>
            {onSaleRows.length > 0 ? (
              <>
                <p className="riso-grocery-sale-amt">
                  {onSaleRows.length} item{onSaleRows.length !== 1 ? "s" : ""} on sale
                </p>
                <p className="riso-grocery-sale-copy">
                  {onSaleRows.length} item{onSaleRows.length !== 1 ? "s" : ""} on this list{" "}
                  {onSaleRows.length !== 1 ? "are" : "is"} on sale at {formatStoreList(onSaleStores)}. They're
                  already sorted under the store with the deal.
                </p>
              </>
            ) : (
              <>
                <p className="riso-grocery-sale-amt">No deals yet</p>
                <p className="riso-grocery-sale-copy">Nothing on this list matches a current flyer deal.</p>
              </>
            )}
          </section>
        </aside>
      </div>
      {storeMode && (
        <StoreMode
          rows={storeRows}
          stores={storesWithItems.length > 0 ? storesWithItems : storeOrder}
          checked={checked}
          onToggle={toggle}
          onDone={handleDoneShopping}
          onClose={() => setStoreMode(false)}
        />
      )}
    </div>
  );
}
