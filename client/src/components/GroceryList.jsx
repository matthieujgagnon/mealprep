import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, closestCenter, pointerWithin, rectIntersection, useDraggable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { api } from "../api.js";
import { groceryShared } from "../lib/groceryCache.js";
import { GROCERY, afterSaves, savesVersion } from "../lib/pendingSaves.js";
import { saveInOrder } from "../lib/saveInOrder.js";
import { daysBetween, quebecDay } from "../lib/quebecDay.js";
import { useDeals } from "../lib/dealsStore.js";
import { useLiveEntries } from "../lib/recipeStore.js";
import { buildGroceryList } from "../lib/groceryList.js";
import {
  BOUGHT,
  QUEUED,
  TO_BUY,
  applyChecks,
  boughtSnapshot,
  checkSnapshot,
  nextStep,
  recipeAmountLabel,
  setCovered,
  stepOf,
  tidyChecks,
} from "../lib/groceryChecks.js";
import { staleOverrideKeys } from "../lib/groceryDedupe.js";
import { findDealsFor } from "../lib/similarRecipes.js";
import { ANY_STORE, STORE_PREF_KEY, loadStorePrefs, storeFor, storeSetup } from "../lib/groceryStores.js";
import { parseQuantityInput } from "../lib/units.js";
import { parseDateKey, toDateKey } from "../lib/dates.js";
import { brandOf, dealSavings } from "../lib/flyerIngredients.js";
import { Segmented, HintStrip } from "./RisoControls.jsx";
import { StoreMode } from "./StoreMode.jsx";
import { GroceryItem } from "./GroceryItem.jsx";
import { GroceryCart, GroceryHowItWorks, GroupFooter } from "./GroceryParts.jsx";
import { RemovedStrip } from "./RemovedStrip.jsx";
import { LIFTED_CLASS, ReorderGrip, ReorderList, useReorderSection, useReorderSensors } from "./ReorderSections.jsx";
import { useEqualRowHeight } from "../hooks/useEqualRowHeight.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { useStickyDodge } from "../hooks/useStickyDodge.js";
import { displayQuantity, inventoryAmount } from "../lib/groceryQuantity.js";
import { DealDetailModal, DealPhoto } from "./FlyerDeals.jsx";
import { t } from "../i18n/index.js";
import { formatWeekday, localizePrice } from "../i18n/format.js";

// Which store an item is filed under, and the per-item store choice kept in this
// browser, are lib/groceryStores.js: the recipe card names the same store.

// What a store is called on screen: your own and flyer stores by their
// name, the catch-all bucket in the app's language.
export function storeLabel(name) {
  return name === ANY_STORE ? t("grocery.anyStore") : name;
}

// A grocery aisle by its id ("produce" -> "Fruits & vegetables").
function aisleLabel(id) {
  return t(`aisles.${id || "other"}`);
}

// Days from today to a "2026-10-15" day, in Quebec days like every other count of days left.
function daysUntilKey(key) {
  return daysBetween(quebecDay(), key);
}
// "ends today", "ends tomorrow", "ends Wed"
function endsLabel(key, left) {
  if (left != null && left < 0) return t("grocery.ended");
  if (left === 0) return t("grocery.endsToday");
  if (left === 1) return t("grocery.endsTomorrow");
  return t("grocery.endsOn", { day: formatWeekday(parseDateKey(key), "short") });
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
  { id: "store", get label() { return t("grocery.viewStore"); } },
  { id: "aisle", get label() { return t("grocery.viewAisle"); } },
  { id: "recipe", get label() { return t("grocery.viewRecipe"); } },
];

// One item in a list: the shared GroceryItem, with the brand worked out from
// the flyer product it's on sale as (or was added from).
function GroceryRow({ deal, flyerDeal, ...props }) {
  return <GroceryItem {...props} deal={deal} flyerDeal={flyerDeal} brand={brandOf(deal || flyerDeal)} />;
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

// One store's list. Its heading's grip drags to reorder the stores (the shared
// reorder piece, ReorderSections.jsx, which Inventory's shelves use too); items
// drop anywhere on it.
function StoreGroup({ storeName, children, className }) {
  const store = useReorderSection({ id: `store:${storeName}`, data: { type: "store", store: storeName } });
  const itemOver = store.isOver && store.active?.data.current?.type === "item";
  return (
    <section
      ref={store.ref}
      className={`${className}${itemOver ? " drop-active" : ""}${store.lifted ? ` ${LIFTED_CLASS}` : ""}`}
      aria-label={t("grocery.storeAria", { store: storeLabel(storeName) })}
      style={store.style}
    >
      {children({ grip: store.grip })}
    </section>
  );
}

// A group's heading, on the same grid as its rows on a computer (design:
// docs/design/riso-v2-grocery, §3): the name and its count ("3 TO BUY · 2 ON
// SALE"), then the column labels ON SALE, RECIPE and BUY, and the × on a store you
// made. By store it has the grip ⠿ that drags the store to reorder (`grip`),
// and a store you made can be renamed (click the name) or removed (its items go
// back to where they'd land on their own). By recipe, the name opens the recipe
// (`onOpenName`). On a phone the labels are left out.
function GroupHead({ group, section, onRename, onRemove, onOpenName, grip }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  let title;
  if (editing) {
    title = (
      <input
        autoFocus
        className="riso-group-name-input"
        aria-label={t("grocery.storeName")}
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
    );
  } else if (section) {
    title = (
      <button type="button" className="riso-group-name as-button" title={t("grocery.renameStore")} onClick={() => setEditing(true)}>
        {group.label}
      </button>
    );
  } else if (onOpenName) {
    title = (
      <button type="button" className="riso-group-name as-button" title={t("grocery.openRecipe")} onClick={onOpenName}>
        {group.label}
      </button>
    );
  } else {
    title = <p className="riso-group-name">{group.label}</p>;
  }
  return (
    <div className="riso-group-head">
      <div className="riso-group-title">
        {grip && (
          <ReorderGrip
            grip={grip}
            className="riso-group-grip"
            title={t("grocery.reorderStores")}
            aria-label={t("grocery.reorderStore", { store: group.label })}
          />
        )}
        {title}
        <span className="riso-group-count">{group.count}</span>
      </div>
      <span className="riso-group-col" aria-hidden="true">
        {t("grocery.colOnSale")}
      </span>
      <span className="riso-group-col" aria-hidden="true">
        {t("grocery.colRecipe")}
      </span>
      <span className="riso-group-col buy" aria-hidden="true">
        {t("grocery.colBuy")}
      </span>
      {section ? (
        <button type="button" className="riso-group-remove" aria-label={t("grocery.removeStoreAria", { store: group.label })}
          title={t("grocery.removeStore")}
          onClick={() => {
            if (window.confirm(t("grocery.confirmRemoveStore", { store: group.label }))) onRemove();
          }}
        >
          ×
        </button>
      ) : (
        <span className="riso-group-remove-slot" aria-hidden="true" />
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
        {t("grocery.addStore")}
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
      <input
        autoFocus
        aria-label={t("grocery.storeName")}
        placeholder={t("grocery.storePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="riso-grocery-add-btn">
        {t("grocery.add")}
      </button>
      <button type="button" className="riso-grocery-add-store-cancel" onClick={() => setOpen(false)}>
        {t("grocery.cancel")}
      </button>
      {error && <p className="riso-grocery-add-store-error">{error}</p>}
    </form>
  );
}

export function GroceryList({
  user,
  customStaples,
  excludedStaples,
  stapleCategories,
  onRequestInventoryAdd,
  onToast,
  onOpenRecipe, // (recipe title): the recipe's card, from a By recipe heading
  onOpenFlyerDeal, // (deal): the deal card's "See in Flyers →", that deal on the Flyers page
}) {
  // Deals and stores decide which store each item sits in, so the list
  // waits for both (see `ready` below) - drawing it before they arrived
  // put items in "Any store" for a moment, then moved them.
  const { deals: allDeals, loaded: dealsLoaded } = useDeals();
  // The deals still running today: a flyer ends on a Quebec day, like the "ends today" it shows.
  const today = toDateKey(new Date());
  const dealsDay = quebecDay();
  const deals = useMemo(() => allDeals.filter((d) => !d.validUntil || d.validUntil >= dealsDay), [allDeals, dealsDay]);
  // Every planned meal from today onward, across all weeks: the list is built
  // from these, so a meal drops off the list once its day has passed.
  // The planned meals as the server sent them. The list is drawn from `entries`: the same
  // meals read through the recipe store, so an edited recipe's ingredients and a deleted
  // one's removal show at once, even on the copy kept from the last visit. What is written
  // back to the server (the two tidy-ups below) goes by `entryRows`, as the server has them:
  // a recipe deleted a moment ago can still be put back with Undo.
  const [entryRows, setEntries] = useState([]);
  const entries = useLiveEntries(entryRows);
  // The saved check rows, by row key - live on the server (see
  // api.listGroceryChecked/checkGroceryItem) so checking something off on one
  // device shows up on another instead of being stuck in that one browser's
  // localStorage. A row says what its check covers and what "Done shopping"
  // has bought; `checked` below is worked out from them and the list.
  const [checkRows, setCheckRows] = useState({});
  const [extraItems, setExtraItems] = useState([]);
  const [overrides, setOverrides] = useState([]);
  // Your own stores/sections (GrocerySection) and which ingredient goes where.
  const [sections, setSections] = useState(() => groceryShared.sections || []);
  const [sectionsLoaded, setSectionsLoaded] = useState(() => groceryShared.sections != null);
  const [loaded, setLoaded] = useState(false);
  // The server has answered everything this visit (not just the cache), so
  // what's on screen is the whole truth and stale saved rows can be cleared.
  const [fresh, setFresh] = useState(false);
  const [draggingItem, setDraggingItem] = useState(null);
  // The flyer item open in the detail view (tapping a row's deal tag).
  const [openDeal, setOpenDeal] = useState(null);
  const [watchlist, setWatchlist] = useState(() => new Set());
  const [shareNote, setShareNote] = useState(null);
  const [addValue, setAddValue] = useState("");
  const [view, setView] = useState("store");
  const [storeMode, setStoreMode] = useState(false);
  const [storePrefs, setStorePrefs] = useState(loadStorePrefs);
  // core -> grocery aisle id ("produce", "pantry", ...; shown as
  // "Fruits & vegetables", "Pantry"),
  // fetched lazily (see the effect below) and cached here so flipping
  // between views never re-fetches a core it already has.
  const [categoryCache, setCategoryCache] = useState({});
  const [aisleOrder, setAisleOrder] = useState([]);
  // True while a confirmation sheet for grocery items is open or sending, so
  // a double click can't open two or add the same items twice.
  const doneShopping = useRef(false);

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

  // Everything the list is made of (planned meals, checkmarks and what's been
  // bought, hand-added items, removed rows / own amounts) loads
  // together, and the list waits for it - showing the rows first made every
  // item flash unchecked. A visit after the first shows the last loaded
  // state straight away.
  useEffect(() => {
    let cancelled = false;
    const cached = groceryShared.list;
    if (cached) {
      setEntries(cached.entries);
      setCheckRows(cached.checkRows);
      setExtraItems(cached.extraItems);
      setOverrides(cached.overrides);
      setLoaded(true);
    }
    // Something added, removed or checked while this loads (the add field is
    // there from the start) is saved on its own, and the answers below can be
    // older than it. So when a save started or ended during the load, load
    // again rather than put the older list over the person's change.
    (async () => {
      for (let attempt = 0; ; attempt++) {
        await afterSaves("grocery");
        const seen = savesVersion("grocery");
        const results = await Promise.allSettled([
          api.listPlannerUpcoming(today),
          api.listGroceryChecked(),
          api.listGroceryExtras(),
          api.listGroceryOverrides(),
        ]);
        if (cancelled) return;
        if (savesVersion("grocery") !== seen && attempt < 2) continue;
        const value = (i, fallback) => (results[i].status === "fulfilled" ? results[i].value : fallback);
        setEntries(value(0, cached?.entries ?? []));
        setCheckRows(Object.fromEntries(value(1, []).map((row) => [row.core, row])));
        setExtraItems(value(2, []));
        setOverrides(value(3, []));
        setFresh(results.every((r) => r.status === "fulfilled"));
        setLoaded(true);
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = loaded && dealsLoaded && sectionsLoaded;
  useEffect(() => {
    if (loaded) groceryShared.list = { entries: entryRows, checkRows, extraItems, overrides };
  }, [loaded, entryRows, checkRows, extraItems, overrides]);

  // A removal (or own amount) on a recipe row lasts only while a planned meal
  // still needs the item: once the meals that needed it have left the plan,
  // the saved row is cleared, so a later meal that needs it starts fresh.
  useEffect(() => {
    if (!loaded || !fresh) return;
    const stale = staleOverrideKeys(entryRows, overrides);
    if (stale.length === 0) return;
    setOverrides((prev) => prev.filter((o) => !stale.includes(o.key)));
    api.clearGroceryOverrides(stale).catch(() => {});
  }, [loaded, fresh, entryRows, overrides]);

  const items = buildGroceryList(entries, customStaples, stapleCategories, excludedStaples, extraItems, overrides);

  // Saved checks and purchases follow the plan: once no planned meal needs an
  // item, its row goes, so a later meal starts fresh; amounts the meals no
  // longer need are cut back; and checks from before amounts were saved get
  // theirs.
  useEffect(() => {
    if (!loaded || !fresh) return;
    const { set, remove } = tidyChecks(buildGroceryList(entryRows, customStaples, stapleCategories, excludedStaples, extraItems, overrides), checkRows);
    if (set.length === 0 && remove.length === 0) return;
    setCheckRows((prev) => {
      const next = { ...prev };
      for (const key of remove) delete next[key];
      for (const { key, covered, bought } of set) next[key] = { core: key, covered, bought, inInventory: false, queued: !!covered && !!prev[key]?.queued };
      return next;
    });
    api
      .tidyGroceryChecked(
        set.map(({ key, covered, bought }) => ({ core: key, covered, bought })),
        remove
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fresh, entryRows, extraItems, checkRows]);
  // What's left to buy: rows already bought are gone, and a row that needs
  // more than was checked or bought shows only the extra, unchecked.
  const applied = applyChecks(
    items.filter((i) => !i.isStaple && !i.removed),
    checkRows
  );
  const shoppingItems = applied.items;
  // In the cart: bought ✓ or queued + (the checkbox's second and third steps).
  const checked = applied.checked;
  const queued = applied.queued;
  const boughtCount = applied.bought.length;
  const hiddenKeys = new Set(overrides.filter((o) => o.hidden).map((o) => o.key));
  const removedItems = items.filter((i) => !i.isStaple && i.removed && !hiddenKeys.has(i.key));

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
        const known = new Set(aisles.map((a) => a.id));
        setAisleOrder(aisles.map((a) => a.id));
        setCategoryCache((prev) => {
          const next = { ...prev };
          for (const core of missing) {
            const id = byName[byCore.get(core)];
            next[core] = known.has(id) ? id : "other";
          }
          return next;
        });
      })
      .catch(() => {
        // Couldn't ask: file them under "Other" rather than wait forever.
        if (cancelled) return;
        setCategoryCache((prev) => ({ ...prev, ...Object.fromEntries(missing.map((core) => [core, prev[core] || "other"])) }));
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
  // The flyer deal an item was added from, when it was added from one and the
  // deal is still around (else its best match by name): tapping the row opens
  // it. An item added by hand, or from a recipe, has none.
  const flyerDealFor = (item) => {
    if (!item.dealId) return null;
    return allDeals.find((d) => d.id === item.dealId) || bestDeal(item);
  };

  // The stores the user actually shops at, in the order they first appear in
  // the flyer deals — there's no saved "my stores" list in the
  // schema, so this is derived instead. Falls back to a single default
  // bucket before any deals have ever been uploaded.
  // Your own stores (in your order) plus any store with a flyer deal. Items
  // you haven't filed land in the first flyer store - or, with no flyers,
  // in "Any store" once you've made stores of your own.
  const storeSet = storeSetup(sections, deals);
  const { storeOrder } = storeSet;
  const sectionByName = new Map(sections.map((s) => [s.name, s]));

  // A manual "move to another store" tap always wins once set — otherwise
  // tapping the chip on a sale item would look like it did nothing, since
  // the sale would keep re-claiming the item back every render. Absent an
  // explicit preference, sale beats default store.
  function storeForItem(item, deal) {
    return storeFor(item.core, deal, { ...storeSet, storePrefs });
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

  // Filing an item under a store saves it for good (by ingredient).
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

  const sensors = useReorderSensors();

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

  // One item's saves go out in the order of the taps, and a read of the list
  // waits for them (lib/saveInOrder.js, lib/pendingSaves.js).
  const checkSaves = useRef(null);
  if (!checkSaves.current) checkSaves.current = saveInOrder({ area: GROCERY });

  // Optimistic: the box moves at once, then the save goes out after the ones
  // already sent for the same item, so the last tap is what the server keeps,
  // even on a slow phone. If a save fails and no tap came after it, the row goes
  // back to how it was before that tap. A check covers what the row shows now.
  function setStep(key, step) {
    const item = shoppingItems.find((i) => i.key === key);
    if (!item) return;
    const before = checkRows[key];
    const covered = step === TO_BUY ? null : checkSnapshot(item);
    const isQueued = step === QUEUED;
    setCheckRows((prev) => setCovered(prev, key, covered, isQueued));
    checkSaves.current
      .run(key, () => (covered ? api.checkGroceryItem(key, covered, isQueued) : api.uncheckGroceryItem(key)))
      .then(({ ok, latest }) => {
        if (ok || !latest) return;
        setCheckRows((prev) => {
          const next = { ...prev };
          if (before) next[key] = before;
          else delete next[key];
          return next;
        });
      });
  }

  // A tap of a list row's box: to buy -> bought ✓ -> queued + -> to buy.
  const cycle = (key) => setStep(key, nextStep(stepOf(key, checked, queued)));
  // A tap in Store mode: in or out of the cart (to buy <-> bought ✓). What to
  // queue is chosen at the till, in Done shopping's sheet.
  const toggleCart = (key) => setStep(key, checked[key] ? TO_BUY : BOUGHT);

  // What goes to the confirmation sheet for one grocery item (see
  // inventoryAmount: the recipe quantity, with its unit, unless you set a
  // number that counts things).
  function inventoryDraft(item) {
    const { quantity, unit } = inventoryAmount(item);
    return { ref: item.key, name: item.name, quantity, unit };
  }

  // Everything that sends grocery items to Inventory comes here: a group's
  // "+ Add N to inventory" (its queued items, every row ticked) and "Done
  // shopping" on this page and in Store mode (`cart`: everything in the cart,
  // the queued ones ticked and the bought ones not, so they can still be
  // ticked). It opens the confirmation sheet, and only what's confirmed goes in
  // (with a USDA use-by date, as suggested in the sheet) and leaves the list.
  // Done shopping can be confirmed with nothing ticked ("Done, add nothing"),
  // and once confirmed the rest of the cart leaves the list too, as bought: the
  // shop is over, those just aren't tracked. What was bought is remembered, so a
  // meal added later that needs more shows only the extra, unchecked. A
  // hand-added item that leaves is just deleted. Cancelling leaves the list
  // exactly as it was. Resolves with how many went into Inventory, or null when
  // the list didn't change.
  async function sendToInventory(list, { cart = false } = {}) {
    if (doneShopping.current || list.length === 0 || !onRequestInventoryAdd) return null;
    doneShopping.current = true;
    try {
      const drafts = list.map((item) => ({ ...inventoryDraft(item), ...(cart && !queued[item.key] ? { on: false } : {}) }));
      const added = await onRequestInventoryAdd(drafts, cart ? { confirmNone: t("grocery.doneAddNothing") } : undefined);
      const inInventory = added?.length ? list.filter((i) => added.includes(i.key)) : [];
      const sent = cart && added?.confirmed ? list : inInventory;
      if (sent.length === 0) return null;
      const manualKeys = new Set(sent.filter((i) => i.isManual).map((i) => i.key));
      setCheckRows((prev) => {
        const next = { ...prev };
        for (const item of sent) {
          if (item.isManual) delete next[item.key];
          else next[item.key] = { core: item.key, covered: null, bought: boughtSnapshot(item), inInventory: false };
        }
        return next;
      });
      setExtraItems((prev) => prev.filter((x) => !manualKeys.has(`extra-${x.id}`)));
      await api
        .markGroceryInInventory(sent.map((i) => ({ core: i.key, bought: i.isManual ? null : boughtSnapshot(i) })))
        .catch(() => {});
      return inInventory.length;
    } finally {
      doneShopping.current = false;
    }
  }

  const handleDoneShopping = () => sendToInventory(shoppingItems.filter((i) => checked[i.key]), { cart: true });

  // Plain-text copy of what's still to buy, grouped like the list on screen.
  function listAsText() {
    const lines = [t("grocery.shareTitle")];
    for (const group of groups) {
      const open = group.sorted.filter((r) => !checked[r.item.key]);
      if (open.length === 0) continue;
      lines.push("", group.label);
      for (const { item } of open) {
        // How many to buy, and what the recipes need with its unit.
        const need = item.isManual ? "" : recipeAmountLabel(item);
        lines.push(`- ${item.name} × ${displayQuantity(item)}${need ? ` (${need})` : ""}`);
      }
    }
    return lines.join("\n");
  }

  async function handleShare() {
    const text = listAsText();
    try {
      if (navigator.share) {
        await navigator.share({ title: t("grocery.shareTitle"), text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote(t("grocery.copied"));
    } catch (err) {
      if (err?.name === "AbortError") return; // closed the share sheet
      setShareNote(t("grocery.shareFailed"));
    }
    setTimeout(() => setShareNote(null), 2500);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    const parsed = parseAddInput(addValue);
    if (!parsed || !parsed.name) return;
    const created = await api.addGroceryExtra({ name: parsed.name, quantity: parsed.quantity, unit: null });
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

  // Optimistic, like setStep() above: the row changes right away, then the
  // server's answer (or the previous state, on failure) wins.
  async function setOverride(key, patch) {
    const prev = overrides;
    const current = prev.find((o) => o.key === key) || { key, quantity: null, removed: false };
    setOverrides([...prev.filter((o) => o.key !== key), { ...current, ...patch }]);
    try {
      const saved = await api.setGroceryOverride(key, patch);
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
        const key = row.category || "other";
        if (!buckets.has(key)) {
          buckets.set(key, []);
          order.push(key);
        }
        buckets.get(key).push(row);
      }
      // Walking order through the store, like the Flyers page.
      const rank = (key) => (aisleOrder.includes(key) ? aisleOrder.indexOf(key) : aisleOrder.length);
      order.sort((a, b) => rank(a) - rank(b) || aisleLabel(a).localeCompare(aisleLabel(b)));
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
        const label =
          view === "store"
            ? storeLabel(key)
            : view === "aisle"
              ? aisleLabel(key)
              : key === MANUAL_GROUP_LABEL
                ? t("grocery.addedByYou")
                : key;
        const left = t("grocery.groupToBuy", { count: remaining });
        return {
          key,
          name: key,
          label,
          sorted,
          count: sales ? `${left} · ${t("grocery.groupOnSale", { count: sales })}` : left,
        };
      });
  }

  const groups = buildGroups();
  // Every item in the view is as tall as the one with the longest name.
  const listRef = useRef(null);
  useEqualRowHeight(listRef);
  const storeRows = shoppingItems.map((item) => {
    const deal = bestDeal(item);
    return { item, deal, flyerDeal: flyerDealFor(item), store: storeForItem(item, deal), category: categoryCache[item.core] || null };
  });
  const storesWithItems = storeOrder.filter((st) => storeRows.some((r) => r.store === st));

  // In the cart: every row bought ✓ or queued +, all waiting for "Done shopping".
  const doneCount = shoppingItems.filter((i) => checked[i.key]).length;
  const toSendCount = doneCount;
  // The queued ones: what Done shopping's sheet ticks to begin with.
  const queuedCount = shoppingItems.filter((i) => queued[i.key]).length;
  // Everything on the list is bought: it's empty, and says so.
  const allBought = shoppingItems.length === 0 && boughtCount > 0;
  // Everything's in the cart: the card goes dark even before "Done shopping".
  const allInCart = shoppingItems.length > 0 && shoppingItems.every((i) => checked[i.key]);
  const totalCount = shoppingItems.length;
  // Once everything is bought the card keeps showing the trip: all of them.
  const cartDone = allBought ? boughtCount : doneCount;
  const cartTotal = allBought ? boughtCount : totalCount;
  const pct = cartTotal > 0 ? Math.round((cartDone / cartTotal) * 100) : 0;

  // The sidebar's On sale list: what on this list is on sale, the saving,
  // and when each sale ends (soonest first), so you know what to buy first.
  const onSaleRows = shoppingItems
    .map((item) => ({ item, deal: bestDeal(item) }))
    .filter((r) => r.deal && !checked[r.item.key])
    .map((r) => ({ ...r, saving: dealSavings(r.deal), ends: r.deal.validUntil || null }))
    .sort((a, b) => (a.ends || "9999").localeCompare(b.ends || "9999") || (b.saving?.pct ?? 0) - (a.saving?.pct ?? 0));

  const subLabel = t("grocery.subLabel", { count: totalCount - doneCount, sales: onSaleRows.length });

  const phone = useIsPhone();
  // The phone's sticky "I'm at the store" never sits on the cart bar, a store's
  // "+ Add N to inventory" or the list's last row: it slides away while one is
  // under it (hooks/useStickyDodge.js).
  const storeBtnRef = useRef(null);
  const storeBtnAside = useStickyDodge(storeBtnRef, () => {
    const main = listRef.current;
    if (!main) return [];
    const rows = main.querySelectorAll(".riso-group .riso-row");
    return [
      ...main.querySelectorAll(".riso-grocery-cartbar, .riso-group-foot-btn:not(.sample)"),
      ...(rows.length > 0 ? [rows[rows.length - 1]] : []),
    ];
  });
  const cart = (
    <GroceryCart
      bar={phone}
      count={cartDone}
      pct={pct}
      done={allInCart || allBought}
      allBought={allBought}
      queuedCount={queuedCount}
      onDone={handleDoneShopping}
    />
  );

  // One row of a group, the same in every view (only By store's rows drag).
  function renderRow(group, row, Row = GroceryRow) {
    return (
      <Row
        key={`${group.key}-${row.item.key}`}
        item={row.item}
        checked={!!checked[row.item.key]}
        queued={!!queued[row.item.key]}
        onToggle={() => cycle(row.item.key)}
        deal={row.deal}
        dealStore={view !== "store"}
        flyerDeal={flyerDealFor(row.item)}
        onOpenDeal={(d) => openDealDetail(d, row.item.name)}
        onDelete={() => removeItem(row.item)}
        onSetQuantity={(quantity) => setOverride(row.item.key, { quantity })}
      />
    );
  }

  // Under a group with something queued: the one button that adds those (§2).
  function renderFooter(group) {
    const items = group.sorted.map((r) => r.item).filter((item) => queued[item.key]);
    return items.length > 0 && <GroupFooter items={items} onAdd={() => sendToInventory(items)} />;
  }

  return (
    <div className="riso-theme riso-grocery" data-theme="light">
      <div className="riso-grocery-header">
        <div className="riso-grocery-title-block">
          <div className="riso-eyebrow">{subLabel}</div>
          <h1 className="riso-grocery-title">
            {t("grocery.title")} <span className="accent">{t("grocery.titleAccent")}</span>
          </h1>
        </div>
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <div className="riso-grocery-share-wrap">
          <button
            type="button"
            className="riso-grocery-share"
            onClick={handleShare}
            disabled={totalCount - doneCount === 0}
            title={t("grocery.shareHint")}
          >
            {t("grocery.share")}
          </button>
          {shareNote && (
            <span className="riso-grocery-share-note" role="status">
              {shareNote}
            </span>
          )}
        </div>
      </div>

      <div className="riso-grocery-body">
        <div className="riso-grocery-main" ref={listRef}>
          {view === "store" && (
            <HintStrip userId={user.id} screenKey="grocery-v2" title={t("grocery.hint.title")}>
              <GroceryHowItWorks />
            </HintStrip>
          )}

          {phone && cart}

          <form className="riso-grocery-add" onSubmit={handleAddSubmit}>
            <input
              type="text"
              placeholder={t("grocery.addPlaceholder")}
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
            />
            <button type="submit" className="riso-grocery-add-btn">
              {t("grocery.add")}
            </button>
          </form>

          {!ready || (view === "aisle" && !aislesReady) ? (
            <div className="riso-grocery-loading" aria-busy="true" aria-label={t("grocery.loading")}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="riso-grocery-loading-row" />
              ))}
            </div>
          ) : entries.length === 0 && extraItems.length === 0 && sections.length === 0 ? (
            <p className="riso-empty">{t("grocery.nothingPlanned")}</p>
          ) : groups.length === 0 ? (
            <p className="riso-empty">{allBought ? t("grocery.groceriesDone") : t("grocery.nothingToBuy")}</p>
          ) : view === "store" ? (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={(e) => setDraggingItem(e.active.data.current?.type === "item" ? e.active.data.current.item : null)}
              onDragCancel={() => setDraggingItem(null)}
              onDragEnd={handleDragEnd}
            >
              <ReorderList ids={groups.map((g) => `store:${g.name}`)}>
                {groups.map((group) => {
                  const section = sectionByName.get(group.name);
                  return (
                    <StoreGroup key={group.key} storeName={group.name} className="riso-group">
                      {({ grip }) => (
                        <>
                          <GroupHead
                            group={group}
                            section={section}
                            onRename={(name) => renameStore(section, name)}
                            onRemove={() => removeStore(section)}
                            grip={grip}
                          />
                          {group.sorted.length === 0 && <p className="riso-group-empty">{t("grocery.dragHere")}</p>}
                          {group.sorted.map((row) => renderRow(group, row, DraggableGroceryRow))}
                          {renderFooter(group)}
                        </>
                      )}
                    </StoreGroup>
                  );
                })}
              </ReorderList>
              <AddStoreForm onAdd={addStore} />
              <DragOverlay dropAnimation={null}>
                {draggingItem && <div className="riso-grocery-drag-chip">{draggingItem.name}</div>}
              </DragOverlay>
            </DndContext>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="riso-group">
                {/* By recipe: the recipe's name opens its card. */}
                <GroupHead
                  group={group}
                  onOpenName={view === "recipe" && group.name !== MANUAL_GROUP_LABEL && onOpenRecipe ? () => onOpenRecipe(group.name) : null}
                />
                {group.sorted.map((row) => renderRow(group, row))}
                {renderFooter(group)}
              </section>
            ))
          )}

          <RemovedStrip
            className="riso-grocery-removed"
            label={t("grocery.removedLabel")}
            items={removedItems.map((item) => ({
              key: item.key,
              name: item.name,
              ariaLabel: t("grocery.putBackAria", { name: item.name }),
              onPutBack: () => setOverride(item.key, { removed: false }),
            }))}
            onClear={clearRemoved}
            clearLabel={t("grocery.clear")}
          />
        </div>

        {totalCount > 0 && (
          <button
            type="button"
            ref={storeBtnRef}
            className={`riso-grocery-store-btn${storeBtnAside ? " dodge" : ""}`}
            tabIndex={storeBtnAside ? -1 : undefined}
            onClick={() => setStoreMode(true)}
          >
            {t("grocery.atStore")} <span>{t("grocery.bigMode")}</span>
          </button>
        )}

        <aside className="riso-grocery-aside">
          {!phone && cart}

          <section className="riso-grocery-sale">
            <span className="riso-sticker yellow" style={{ top: -14, right: 18, transform: "rotate(5deg)" }}>
              {t("grocery.saveSticker")}
            </span>
            <div className="riso-eyebrow">
              {onSaleRows.length > 0 ? t("grocery.onSaleCount", { count: onSaleRows.length }) : t("grocery.onSale")}
            </div>
            {onSaleRows.length > 0 ? (
              <>
                <ul className="riso-grocery-sale-list">
                  {onSaleRows.map(({ item, deal, saving, ends }) => {
                    const left = ends ? daysUntilKey(ends) : null;
                    return (
                      <li key={item.key}>
                        <button type="button" className="riso-grocery-sale-row" onClick={() => openDealDetail(deal, item.name)}>
                          <span className="riso-grocery-sale-photo">
                            <DealPhoto deal={deal} size={44} />
                          </span>
                          <span className="riso-grocery-sale-name">{item.name}</span>
                          <span className="riso-grocery-sale-price">{localizePrice(deal.price)}</span>
                          <span className="riso-grocery-sale-meta">
                            {saving?.pct != null
                              ? `${deal.store} · ${t("grocery.pctOff", { pct: Math.round(saving.pct * 100) })}`
                              : deal.store}
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
                <p className="riso-grocery-sale-copy">{t("grocery.saleCopy")}</p>
              </>
            ) : (
              <>
                <p className="riso-grocery-sale-amt">{t("grocery.noDealsYet")}</p>
                <p className="riso-grocery-sale-copy">{t("grocery.noMatchDeals")}</p>
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
          queued={queued}
          onToggle={toggleCart}
          onDone={handleDoneShopping}
          onClose={() => setStoreMode(false)}
          storeLabel={storeLabel}
          aisleLabel={aisleLabel}
          aisleOrder={aisleOrder}
          sendCount={toSendCount}
          moveTargets={storeOrder}
          onMove={moveToStore}
          onToast={onToast}
        />
      )}
      {openDeal && (
        <DealDetailModal
          deal={{ ...openDeal.deal, isWatching: watchlist.has((openDeal.deal.matchName || openDeal.deal.item).trim().toLowerCase()) }}
          others={findDealsFor(openDeal.name, deals).filter((d) => d.id !== openDeal.deal.id)}
          onClose={() => setOpenDeal(null)}
          onToggleWatch={() => toggleWatch(openDeal.deal)}
          onOpenOther={(o) => openDealDetail(o, openDeal.name)}
          onOpenCirculaires={onOpenFlyerDeal ? () => onOpenFlyerDeal(openDeal.deal) : undefined}
        />
      )}
    </div>
  );
}
