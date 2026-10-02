import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api.js";
import { groceryShared } from "../lib/groceryCache.js";
import { useDeals } from "../lib/dealsStore.js";
import { buildGroceryList, formatAmount } from "../lib/groceryList.js";
import { findDealsFor } from "../lib/similarRecipes.js";
import { parseQuantityInput } from "../lib/units.js";
import { currentWeekStart, formatWeekRangeLabel, isCurrentWeek, parseDateKey, shiftWeek } from "../lib/dates.js";
import { dealSavings } from "../lib/flyerIngredients.js";
import { Segmented, HintStrip } from "./RisoControls.jsx";
import { StoreMode } from "./StoreMode.jsx";
import { DealDetailModal } from "./FlyerDeals.jsx";

// Per-item "which store do I usually get this at" preference — new in the
// Riso redesign (there's no server schema for it yet). Lasting-but-not-
// critical, so it lives in localStorage the same way Makeable's "also have"
// list does (see WhatCanIMake.jsx) rather than round-tripping to the server
// for something this low-stakes. Hint-strip dismissal itself goes through
// the shared per-user-per-screen mechanism (RisoControls.jsx's <HintStrip>,
// lib/hints.js) instead of its own key.
const STORE_PREF_KEY = "mealprep-grocery-store-pref";
const DEFAULT_STORE = "Metro";
const ANY_STORE = "Any store"; // unfiled items with no sale, once you've made stores of your own

// The last loaded state of each week's list, so coming back to the tab shows
// it straight away instead of every item unchecked until the server answers.
const weekCache = new Map();

const DAY_MS = 24 * 60 * 60 * 1000;
function daysUntilKey(key) {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const d = parseDateKey(key);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / DAY_MS);
}
function longDay(key) {
  return parseDateKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
// "ends today", "ends tomorrow", "ends Wed"
function endsLabel(key, left) {
  if (left != null && left < 0) return "ended";
  if (left === 0) return "ends today";
  if (left === 1) return "ends tomorrow";
  return `ends ${parseDateKey(key).toLocaleDateString("en-US", { weekday: "short" })}`;
}

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

// Groups shopping items by which recipe(s) they're used in. A shared
// ingredient (e.g. garlic used in two recipes) appears under both headings —
// that's intentional, it shows the full picture of what each recipe needs.
// A manually-added item isn't used in any recipe (usedIn is always empty for
// those), so it gets its own catch-all heading instead of silently vanishing
// from this view.
const MANUAL_GROUP_LABEL = "Added by you";

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

// The deal tag: where this item is cheapest this week and at what price,
// whichever store's list it's on. Tapping it opens the flyer item.
function DealTag({ deal, onOpen }) {
  if (!deal) return null;
  return (
    <button
      type="button"
      className="riso-row-deal"
      title={`On sale at ${deal.store} - see the flyer item`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <span className="riso-row-deal-store">{deal.store}</span>
      <span className="riso-row-deal-price">{deal.price}</span>
    </button>
  );
}

function GroceryRow({ item, checked, onToggle, deal, onOpenDeal, store, showStore, sub, onDelete, onPush, onSetQuantity, dragging, rowRef, dragProps }) {
  return (
    <div
      ref={rowRef}
      className={`riso-row${checked ? " checked" : ""}${dragging ? " dragging" : ""}${dragProps ? " draggable" : ""}`}
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
      {...dragProps}
    >
      {dragProps && (
        <span className="riso-row-grip" aria-hidden="true" title="Drag to another store">
          ⠿
        </span>
      )}
      <span className={`riso-row-check${checked ? " on" : ""}`}>{checked ? "✓" : ""}</span>
      <span className="riso-row-main">
        <span className="riso-row-namerow">
          <span className={`riso-row-name${checked ? " struck" : ""}`}>
            {item.name}
            {item.varieties.length > 0 && ` (${item.varieties.join(", ")})`}
          </span>
          {item.pushedFrom && (
            <span className="riso-row-carried" title={`Pushed from the week of ${formatWeekRangeLabel(item.pushedFrom)}`}>
              from last week
            </span>
          )}
        </span>
        {sub && <span className="riso-row-sub">{sub}</span>}
      </span>
      {deal ? (
        <DealTag deal={deal} onOpen={onOpenDeal} />
      ) : (
        showStore && <span className="riso-row-store static">{store}</span>
      )}
      <QuantityCell item={item} onSave={onSetQuantity} />
      {onPush && !checked && (
        <button
          type="button"
          className="riso-row-push"
          aria-label={`Push ${item.name} to next week`}
          title="Not this week: push it to next week's list"
          onClick={(e) => {
            e.stopPropagation();
            onPush();
          }}
        >
          →
        </button>
      )}
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

// In "By store", the whole row drags into another store (a press-and-hold
// on a phone; a click still checks it off).
function DraggableGroceryRow(props) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `grocery-${props.item.key}`,
    data: { type: "item", item: props.item },
  });
  return <GroceryRow {...props} rowRef={setNodeRef} dragProps={listeners} dragging={isDragging} />;
}

// One store's list. Its heading drags to reorder the stores; items drop
// anywhere on it.
function StoreGroup({ storeName, children, className }) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging, isOver, active } = useSortable({
    id: `store:${storeName}`,
    data: { type: "store", store: storeName },
  });
  const itemOver = isOver && active?.data.current?.type === "item";
  return (
    <section
      ref={setNodeRef}
      className={`${className}${itemOver ? " drop-active" : ""}${isDragging ? " store-dragging" : ""}`}
      aria-label={`${storeName} store`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children({ handleRef: setActivatorNodeRef, handleProps: { ...listeners, ...attributes } })}
    </section>
  );
}

// A store's heading. Stores you made can be renamed (click the name) or
// removed (their items go back to where they'd land on their own).
function StoreGroupHead({ group, section, onRename, onRemove, handleRef, handleProps }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  return (
    <div className="riso-group-head" style={{ background: "var(--riso-track)" }}>
      <span
        ref={handleRef}
        className="riso-group-grip"
        title="Drag to reorder your stores"
        {...handleProps}
        aria-label={`Reorder the ${group.name} store`}
      >
        ⠿
      </span>
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
  onChangeWeek,
  customStaples,
  excludedStaples,
  stapleCategories,
  onAddPantryItem,
}) {
  // Deals and stores decide which store each item sits in, so the list
  // waits for both (see `ready` below) - drawing it before they arrived
  // put items in "Any store" for a moment, then moved them.
  const { deals: allDeals, loaded: dealsLoaded } = useDeals();
  // The deals that still run during the week on screen: none for a past
  // week, and for next week only the ones whose flyer hasn't ended by then.
  const deals = useMemo(() => {
    if (weekStart < currentWeekStart()) return [];
    return allDeals.filter((d) => !d.validUntil || d.validUntil >= weekStart);
  }, [allDeals, weekStart]);
  const nextWeek = shiftWeek(weekStart, 1);
  // "Push to next week" on an item whose sale ends before then asks first.
  const [pushAsk, setPushAsk] = useState(null); // { item, deal }
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
  const [sections, setSections] = useState(() => groceryShared.sections || []);
  const [sectionsLoaded, setSectionsLoaded] = useState(() => groceryShared.sections != null);
  const [loadedWeek, setLoadedWeek] = useState(null);
  const [draggingItem, setDraggingItem] = useState(null);
  // The flyer item open in the detail view (tapping a row's deal tag).
  const [openDeal, setOpenDeal] = useState(null);
  const [watchlist, setWatchlist] = useState(() => new Set());
  const [shareNote, setShareNote] = useState(null);
  const [addValue, setAddValue] = useState("");
  const [view, setView] = useState("store");
  const [storeMode, setStoreMode] = useState(false);
  const [storePrefs, setStorePrefs] = useState(loadStorePrefs);
  // core -> grocery aisle label ("Fruits & vegetables", "Pantry", ...),
  // fetched lazily (see the effect below) and cached here so flipping
  // between views never re-fetches a core it already has.
  const [categoryCache, setCategoryCache] = useState({});
  const [aisleOrder, setAisleOrder] = useState([]);
  // Tracks which items have already been sent to the pantry this "Done
  // shopping" pass, purely to stop a double-click from adding the same item
  // twice before `checked` resets — not persisted, a stray re-add on reload
  // is harmless (you bought it again).
  const [pantryAddedKeys, setPantryAddedKeys] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    api
      .listGrocerySections()
      .then((rows) => !cancelled && setSections(rows))
      .catch(() => {})
      .finally(() => !cancelled && setSectionsLoaded(true));
    api
      .listWatchlist()
      .then((rows) => !cancelled && setWatchlist(new Set(rows.map((r) => r.matchName))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Stores change here (add, rename, drag, file an item); keep the shared
  // copy in step so the next visit starts from them.
  useEffect(() => {
    if (sectionsLoaded) groceryShared.sections = sections;
  }, [sectionsLoaded, sections]);

  // The list has each deal without its 6-month history; the detail view
  // opens straight away and fills in the chart when it arrives.
  function openDealDetail(deal, name) {
    setOpenDeal({ deal, name });
    api
      .getDeal(deal.id)
      .then((full) => setOpenDeal((cur) => (cur?.deal.id === deal.id ? { ...cur, deal: { ...cur.deal, ...full } } : cur)))
      .catch(() => {});
  }

  async function toggleWatch(deal) {
    const key = (deal.matchName || deal.item).trim().toLowerCase();
    const watching = watchlist.has(key);
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (watching) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      if (watching) await api.removeFromWatchlist(key);
      else await api.addToWatchlist(key);
    } catch {
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (watching) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

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
  const ready = loaded && dealsLoaded && sectionsLoaded;
  useEffect(() => {
    if (loaded) weekCache.set(weekStart, { checked, extraItems, overrides, inInventory });
  }, [loaded, weekStart, checked, extraItems, overrides, inInventory]);

  const items = buildGroceryList(plannerEntries, customStaples, stapleCategories, excludedStaples, extraItems, overrides);
  const shoppingItems = items.filter((i) => !i.isStaple && !i.removed);
  const hiddenKeys = new Set(overrides.filter((o) => o.hidden).map((o) => o.key));
  const removedItems = items.filter((i) => !i.isStaple && i.removed && !i.movedTo && !hiddenKeys.has(i.key));
  const pushedItems = items.filter((i) => !i.isStaple && i.removed && i.movedTo);

  // Each item's grocery aisle ("Fruits & vegetables", "Pantry", ...) - the
  // same aisles the Flyers page groups by - for the aisle view and the line
  // under each item. Asked for only the items it doesn't know yet.
  useEffect(() => {
    const byCore = new Map(shoppingItems.map((i) => [i.core, i.name]));
    const missing = [...byCore.keys()].filter((core) => !(core in categoryCache));
    if (missing.length === 0) return;
    let cancelled = false;
    api
      .groceryAisles(missing.map((core) => byCore.get(core)))
      .then(({ aisles, byName }) => {
        if (cancelled) return;
        const labels = Object.fromEntries(aisles.map((a, i) => [a.id, { label: a.label, order: i }]));
        setAisleOrder(aisles.map((a) => a.label));
        setCategoryCache((prev) => {
          const next = { ...prev };
          for (const core of missing) next[core] = labels[byName[byCore.get(core)]]?.label || "Other";
          return next;
        });
      })
      .catch(() => {
        // Couldn't ask: file them under "Other" rather than wait forever.
        if (cancelled) return;
        setCategoryCache((prev) => ({ ...prev, ...Object.fromEntries(missing.map((core) => [core, prev[core] || "Other"])) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoppingItems.map((i) => i.core).sort().join("|")]);
  // The aisle view waits for every item's aisle, so nothing sits under
  // "Other" for a moment and then moves.
  const aislesReady = shoppingItems.every((i) => i.core in categoryCache);

  // Each item's best flyer deal, looked up once per change of list or
  // deals rather than three times per item on every render.
  const itemNamesKey = shoppingItems.map((i) => i.name).join("|");
  const bestDealByName = useMemo(() => {
    const map = new Map();
    for (const name of itemNamesKey ? itemNamesKey.split("|") : []) {
      if (!map.has(name)) map.set(name, findDealsFor(name, deals)[0] || null);
    }
    return map;
  }, [itemNamesKey, deals]);
  const bestDeal = (item) => bestDealByName.get(item.name) ?? null;

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

  // Saves the stores in this order. Flyer stores in it become stores of
  // your own (so they keep their place); the virtual "Any store" bucket
  // isn't one.
  async function saveStoreOrder(order) {
    let current = [...sections];
    for (const name of order) {
      if (name === ANY_STORE || current.some((sec) => sec.name === name)) continue;
      current.push(await api.createGrocerySection(name));
    }
    const ordered = order.map((name) => current.find((sec) => sec.name === name)).filter(Boolean);
    const all = [...ordered, ...current.filter((sec) => !ordered.includes(sec))].map((sec, position) => ({ ...sec, position }));
    setSections((prev) =>
      all.map((sec) => ({ ...sec, assignments: prev.find((p) => p.id === sec.id)?.assignments || sec.assignments || [] }))
    );
    await api.reorderGrocerySections(all.map((sec) => sec.id));
    return all;
  }

  // Filing an item under a store saves it for every week (by ingredient).
  // A flyer store you haven't made your own yet becomes one on first use -
  // in the place it's shown, so the stores don't jump around.
  async function moveToStore(item, storeName) {
    if (storeForItem(item, bestDeal(item)) === storeName) return;
    if (storeName === ANY_STORE) {
      setSections((prev) => prev.map((s) => ({ ...s, assignments: (s.assignments || []).filter((a) => a.core !== item.core) })));
      await api.unassignFromGrocerySection(item.core);
      return;
    }
    let section = sectionByName.get(storeName);
    if (!section) {
      const all = await saveStoreOrder(storeOrder);
      section = all.find((sec) => sec.name === storeName);
      if (!section) return;
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
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  // Stores reorder by their middles; an item lands in whichever store the
  // pointer is over.
  function collisionDetection(args) {
    if (args.active.data.current?.type === "store") return closestCenter(args);
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
  }

  function handleDragEnd(e) {
    setDraggingItem(null);
    const active = e.active.data.current;
    const over = e.over?.data.current;
    if (!active || !over?.store) return;
    if (active.type === "store") {
      const names = groups.map((g) => g.name);
      const from = names.indexOf(active.store);
      const to = names.indexOf(over.store);
      if (from < 0 || to < 0 || from === to) return;
      const moved = arrayMove(names, from, to);
      // Stores not shown this week keep their place after the ones shown.
      saveStoreOrder([...moved, ...storeOrder.filter((n) => !moved.includes(n))]);
    } else if (active.item) {
      moveToStore(active.item, over.store);
    }
  }

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

  // "→": off this week's list, onto next week's. A sale that ends before
  // next week is worth a second look first.
  async function pushItem(item, deal, { force = false } = {}) {
    if (!force && deal?.validUntil && deal.validUntil < nextWeek) {
      setPushAsk({ item, deal });
      return;
    }
    setPushAsk(null);
    const single = item.parts.length === 1 ? item.parts[0] : { quantity: null, unit: null };
    const quantityText = item.customQuantity || (item.parts.length > 1 ? formatAmount(item.parts) : null);
    setOverrides((prev) => [
      ...prev.filter((o) => o.key !== item.key),
      { ...(prev.find((o) => o.key === item.key) || { key: item.key, quantity: null }), removed: true, movedTo: nextWeek },
    ]);
    try {
      const { override } = await api.pushGroceryItem({
        fromWeek: weekStart,
        toWeek: nextWeek,
        key: item.key,
        name: item.name,
        quantity: single.quantity,
        unit: single.unit,
        quantityText,
      });
      setOverrides((now) => [...now.filter((o) => o.key !== item.key), override]);
    } catch {
      setOverrides((now) => now.filter((o) => !(o.key === item.key && o.movedTo === nextWeek)));
    }
    weekCache.delete(nextWeek);
  }

  async function pullBack(item) {
    setOverrides((prev) =>
      prev.map((o) => (o.key === item.key ? { ...o, removed: false, movedTo: null } : o)).filter((o) => o.removed || o.quantity)
    );
    await api.pullBackGroceryItem(weekStart, item.key).catch(() => {});
    weekCache.delete(item.movedTo);
    const [extras, overrideRows] = await Promise.all([api.listGroceryExtras(weekStart), api.listGroceryOverrides(weekStart)]).catch(() => [null, null]);
    if (extras) setExtraItems(extras);
    if (overrideRows) setOverrides(overrideRows);
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
      const deal = bestDeal(item);
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
      // Walking order through the store, like the Flyers page.
      const rank = (key) => (aisleOrder.includes(key) ? aisleOrder.indexOf(key) : aisleOrder.length);
      order.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
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
    const deal = bestDeal(item);
    return { item, deal, store: storeForItem(item, deal) };
  });
  const storesWithItems = storeOrder.filter((st) => storeRows.some((r) => r.store === st));

  const doneCount = shoppingItems.filter((i) => checked[i.key]).length;
  const toSendCount = shoppingItems.filter((i) => checked[i.key] && !inInventory.has(i.key)).length;
  const allBought = shoppingItems.length > 0 && shoppingItems.every((i) => checked[i.key] && inInventory.has(i.key));
  // Everything's in the cart: the card goes dark even before "Done shopping".
  const allInCart = shoppingItems.length > 0 && shoppingItems.every((i) => checked[i.key]);
  const totalCount = shoppingItems.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // The sidebar's On sale list: what on this list is on sale, the saving,
  // and when each sale ends (soonest first), so you know what to buy first.
  const onSaleRows = shoppingItems
    .map((item) => ({ item, deal: bestDeal(item) }))
    .filter((r) => r.deal && !checked[r.item.key])
    .map((r) => ({ ...r, saving: dealSavings(r.deal), ends: r.deal.validUntil || null }))
    .sort((a, b) => (a.ends || "9999").localeCompare(b.ends || "9999") || (b.saving?.pct ?? 0) - (a.saving?.pct ?? 0));
  // Pushed to next week while on sale now, with the sale over by then.
  const missedSales = pushedItems
    .map((item) => ({ item, deal: findDealsFor(item.name, deals)[0] || null }))
    .filter((r) => r.deal?.validUntil && r.deal.validUntil < (r.item.movedTo || nextWeek));

  const weekLabel = isCurrentWeek(weekStart)
    ? formatWeekRangeLabel(weekStart)
    : `week of ${formatWeekRangeLabel(weekStart)}`;
  const subLabel = `${weekLabel.toUpperCase()} · ${totalCount - doneCount} TO BUY`;

  const hintText =
    view === "store"
      ? "Sale items start in the store with the deal; the green tag shows where it's cheapest and opens the flyer item. Drag an item into another store and it stays there every week; drag a store by its ⠿ to reorder your stores. Add your own stores below the list."
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
        {onChangeWeek && (
          <div className="riso-planner-nav-row riso-grocery-week-nav" role="group" aria-label="Week">
            <button type="button" className="riso-planner-nav-arrow" onClick={() => onChangeWeek(shiftWeek(weekStart, -1))} aria-label="Previous week">
              ‹
            </button>
            <span className="riso-planner-week-label">{formatWeekRangeLabel(weekStart).replace(/, \d{4}$/, "")}</span>
            <button type="button" className="riso-planner-nav-arrow" onClick={() => onChangeWeek(shiftWeek(weekStart, 1))} aria-label="Next week">
              ›
            </button>
            {isCurrentWeek(weekStart) ? (
              <span className="riso-planner-week-badge">this week</span>
            ) : (
              <button type="button" className="riso-chip small" onClick={() => onChangeWeek(currentWeekStart())}>
                This week
              </button>
            )}
          </div>
        )}
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

          {!ready || (view === "aisle" && !aislesReady) ? (
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
              collisionDetection={collisionDetection}
              onDragStart={(e) => setDraggingItem(e.active.data.current?.type === "item" ? e.active.data.current.item : null)}
              onDragCancel={() => setDraggingItem(null)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={groups.map((g) => `store:${g.name}`)} strategy={verticalListSortingStrategy}>
                {groups.map((group) => {
                  const section = sectionByName.get(group.name);
                  return (
                    <StoreGroup key={group.key} storeName={group.name} className="riso-group">
                      {({ handleRef, handleProps }) => (
                        <>
                          <StoreGroupHead
                            group={group}
                            section={section}
                            onRename={(name) => renameStore(section, name)}
                            onRemove={() => removeStore(section)}
                            handleRef={handleRef}
                            handleProps={handleProps}
                          />
                          {group.sorted.length === 0 && <p className="riso-group-empty">Drag items here</p>}
                          {group.sorted.map((row) => (
                            <DraggableGroceryRow
                              key={`${group.key}-${row.item.key}`}
                              item={row.item}
                              checked={!!checked[row.item.key]}
                              onToggle={() => toggle(row.item.key)}
                              deal={row.deal}
                              onOpenDeal={() => openDealDetail(row.deal, row.item.name)}
                              store={row.store}
                              sub={subLineFor(row)}
                              onDelete={() => removeItem(row.item)}
                              onPush={() => pushItem(row.item, row.deal)}
                              onSetQuantity={(quantity) => setOverride(row.item.key, { quantity })}
                            />
                          ))}
                        </>
                      )}
                    </StoreGroup>
                  );
                })}
              </SortableContext>
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
                    deal={row.deal}
                    onOpenDeal={() => openDealDetail(row.deal, row.item.name)}
                    store={row.store}
                    showStore
                    sub={subLineFor(row)}
                    onDelete={() => removeItem(row.item)}
                    onPush={() => pushItem(row.item, row.deal)}
                    onSetQuantity={(quantity) => setOverride(row.item.key, { quantity })}
                  />
                ))}
              </section>
            ))
          )}

          {pushedItems.length > 0 && (
            <div className="riso-grocery-removed pushed" aria-label="Pushed to next week">
              <span className="riso-grocery-removed-label">Pushed to next week</span>
              {pushedItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="riso-grocery-removed-chip"
                  aria-label={`Bring ${item.name} back to this week`}
                  title="Bring it back to this week"
                  onClick={() => pullBack(item)}
                >
                  {item.name} <span aria-hidden="true">↺</span>
                </button>
              ))}
            </div>
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
          <section className={`riso-grocery-cart${allInCart ? " done" : ""}`}>
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

          <section className="riso-grocery-sale">
            <span className="riso-sticker yellow" style={{ top: -14, right: 18, transform: "rotate(5deg)" }}>
              save!
            </span>
            <div className="riso-eyebrow">On sale{onSaleRows.length > 0 ? ` · ${onSaleRows.length} on this list` : ""}</div>
            {onSaleRows.length > 0 ? (
              <>
                <ul className="riso-grocery-sale-list">
                  {onSaleRows.map(({ item, deal, saving, ends }) => {
                    const left = ends ? daysUntilKey(ends) : null;
                    return (
                      <li key={item.key}>
                        <button type="button" className="riso-grocery-sale-row" onClick={() => openDealDetail(deal, item.name)}>
                          <span className="riso-grocery-sale-name">{item.name}</span>
                          <span className="riso-grocery-sale-price">{deal.price}</span>
                          <span className="riso-grocery-sale-meta">
                            {deal.store}
                            {saving?.pct != null ? ` · ${Math.round(saving.pct * 100)}% off` : ""}
                          </span>
                          {ends && (
                            <span className={`riso-grocery-sale-ends${left != null && left <= 2 ? " soon" : ""}`}>
                              {endsLabel(ends, left)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="riso-grocery-sale-copy">Soonest-ending first. Tap one for the flyer item.</p>
              </>
            ) : (
              <>
                <p className="riso-grocery-sale-amt">No deals {isCurrentWeek(weekStart) || weekStart > currentWeekStart() ? "yet" : "that week"}</p>
                <p className="riso-grocery-sale-copy">
                  {weekStart < currentWeekStart()
                    ? "Past weeks' flyers are over."
                    : "Nothing on this list matches a flyer deal that runs this week."}
                </p>
              </>
            )}
            {missedSales.length > 0 && (
              <div className="riso-grocery-sale-missed">
                <p>Pushed to next week, but the sale ends before then:</p>
                {missedSales.map(({ item, deal }) => (
                  <button key={item.key} type="button" className="riso-grocery-removed-chip" onClick={() => pullBack(item)}>
                    {item.name} · {deal.store} {deal.price} — bring back <span aria-hidden="true">↺</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      {pushAsk && (
        <div className="riso-push-ask-overlay" onClick={() => setPushAsk(null)}>
          <div className="riso-push-ask" role="dialog" aria-label="The sale ends before next week" onClick={(e) => e.stopPropagation()}>
            <p className="riso-eyebrow">Sale ends first</p>
            <p className="riso-push-ask-text">
              <strong>{pushAsk.item.name}</strong> is {pushAsk.deal.price} at {pushAsk.deal.store} until{" "}
              {longDay(pushAsk.deal.validUntil)}. Next week's list starts {longDay(nextWeek)}, after the sale.
            </p>
            <div className="riso-push-ask-actions">
              <button type="button" className="riso-push-ask-keep" onClick={() => setPushAsk(null)}>
                Keep it this week
              </button>
              <button type="button" className="riso-push-ask-go" onClick={() => pushItem(pushAsk.item, pushAsk.deal, { force: true })}>
                Push anyway
              </button>
            </div>
          </div>
        </div>
      )}
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
      {openDeal && (
        <DealDetailModal
          deal={{ ...openDeal.deal, isWatching: watchlist.has((openDeal.deal.matchName || openDeal.deal.item).trim().toLowerCase()) }}
          others={findDealsFor(openDeal.name, deals).filter((d) => d.id !== openDeal.deal.id)}
          onClose={() => setOpenDeal(null)}
          onToggleWatch={() => toggleWatch(openDeal.deal)}
          onOpenOther={(o) => openDealDetail(o, openDeal.name)}
        />
      )}
    </div>
  );
}
