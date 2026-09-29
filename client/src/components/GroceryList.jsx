import { useEffect, useState } from "react";
import { api } from "../api.js";
import { buildGroceryList, findMatchingDeal } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { formatWeekRangeLabel, isCurrentWeek } from "../lib/dates.js";
import { Segmented, HintStrip } from "./RisoControls.jsx";

// Per-item "which store do I usually get this at" preference — new in the
// Riso redesign (there's no server schema for it yet). Lasting-but-not-
// critical, so it lives in localStorage the same way Makeable's "also have"
// list does (see WhatCanIMake.jsx) rather than round-tripping to the server
// for something this low-stakes. Hint-strip dismissal itself goes through
// the shared per-user-per-screen mechanism (RisoControls.jsx's <HintStrip>,
// lib/hints.js) instead of its own key.
const STORE_PREF_KEY = "mealprep-grocery-store-pref";
const DEFAULT_STORE = "Metro"; // matches the placeholder store name used elsewhere (FlyerDeals' upload form) when nothing else is known yet

function loadStorePrefs() {
  try {
    const raw = localStorage.getItem(STORE_PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function formatQuantity(qty) {
  if (qty === null || qty === undefined) return "";
  const rounded = Math.round(qty * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  // Plain "1/4" instead of unicode fraction glyphs (¼) — several fonts in the
  // design system don't carry those glyphs, so they'd render as tofu.
  const fracMap = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 0.33: "1/3", 0.67: "2/3" };
  const nearestFrac = Object.keys(fracMap).find((f) => Math.abs(f - frac) < 0.05);
  if (nearestFrac) return `${whole > 0 ? whole + " " : ""}${fracMap[nearestFrac]}`;
  return String(rounded);
}

// A row can carry more than one "part" when two recipes measured the same
// ingredient in ways that can't be combined into a single number — see
// buildGroceryList's own comment on `parts`.
function formatParts(parts) {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((p) => (p.quantity != null ? `${formatQuantity(p.quantity)}${p.unit ? " " + p.unit : ""}` : ""))
    .filter(Boolean)
    .join(" + ");
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

const VIEWS = [
  { id: "store", label: "By store" },
  { id: "aisle", label: "By aisle" },
  { id: "recipe", label: "By recipe" },
];

function GroceryRow({ item, checked, onToggle, sale, store, onCycleStore, canCycleStore, sub, onDeleteManual }) {
  return (
    <div
      className={`riso-row${checked ? " checked" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
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
      <span className="riso-row-qty">{formatParts(item.parts)}</span>
      {item.isManual && (
        <button
          type="button"
          className="riso-row-delete"
          aria-label={`Delete ${item.name}`}
          title="Delete this item"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteManual(item.manualId);
          }}
        >
          ×
        </button>
      )}
    </div>
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
}) {
  const [deals, setDeals] = useState([]);
  // Which ingredient cores are checked off this week — lives on the server
  // (see api.listGroceryChecked/checkGroceryItem) so checking something off
  // on one device shows up on another instead of being stuck in that one
  // browser's localStorage.
  const [checked, setChecked] = useState({});
  const [extraItems, setExtraItems] = useState([]);
  const [addValue, setAddValue] = useState("");
  const [view, setView] = useState("store");
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
    api.getDeals().then((d) => setDeals(d.deals)).catch(() => {});
  }, []);

  // Switching weeks swaps in that week's own checkmarks instead of carrying
  // the previous week's over.
  useEffect(() => {
    api.listGroceryChecked(weekStart)
      .then((cores) => setChecked(Object.fromEntries(cores.map((c) => [c, true]))))
      .catch(() => setChecked({}));
  }, [weekStart]);

  // Manually-added items are week-scoped too, same as checked state above.
  useEffect(() => {
    api.listGroceryExtras(weekStart).then(setExtraItems).catch(() => setExtraItems([]));
  }, [weekStart]);

  const items = buildGroceryList(plannerEntries, customStaples, stapleCategories, excludedStaples, extraItems);
  const shoppingItems = items.filter((i) => !i.isStaple);
  const stapleCount = items.filter((i) => i.isStaple).length;
  const leftoverCount = plannerEntries.filter((e) => e.isLeftover).length;
  const alreadyHaveCount = plannerEntries.filter((e) => e.alreadyHave).length;

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
  const storeOrder = (() => {
    const seen = [];
    for (const d of deals) {
      if (d.store && !seen.includes(d.store)) seen.push(d.store);
    }
    return seen.length > 0 ? seen : [DEFAULT_STORE];
  })();

  // A manual "move to another store" tap always wins once set — otherwise
  // tapping the chip on a sale item would look like it did nothing, since
  // the sale would keep re-claiming the item back every render. Absent an
  // explicit preference, sale beats default store.
  function storeForItem(item, deal) {
    const pref = storePrefs[item.core];
    if (pref && storeOrder.includes(pref)) return pref;
    if (deal?.store) return deal.store;
    return storeOrder[0];
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
    const next = storeOrder[(idx + 1) % storeOrder.length];
    persistStorePrefs({ ...storePrefs, [item.core]: next });
  }

  // Optimistic: flip the checkbox immediately, then persist — reverting if
  // the request fails, so a dropped connection doesn't leave the UI showing
  // a check that never actually saved.
  async function toggle(key) {
    const wasChecked = !!checked[key];
    setChecked((prev) => ({ ...prev, [key]: !wasChecked }));
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
      await onAddPantryItem({
        name: item.name,
        quantity: item.parts?.[0]?.quantity ?? null,
        unit: item.parts?.[0]?.unit ?? null,
        location: "fridge",
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
  // "Done shopping" is when every checked item actually lands in Inventory
  // (with a USDA use-by date, via the same suggest logic the pantry-add
  // endpoint already runs) — then the list clears for next week.
  async function handleDoneShopping() {
    const toAdd = shoppingItems.filter((i) => checked[i.key]);
    for (const item of toAdd) {
      await addToPantry(item);
    }
    await clearChecked();
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
      .filter((key) => buckets.get(key)?.length > 0)
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

  const doneCount = shoppingItems.filter((i) => checked[i.key]).length;
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
      ? "Sale items go to the store with the deal. Everything else goes to your usual store. Tap a store tag to move an item."
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
        <button type="button" className="riso-grocery-share" title="Coming soon">
          Share
        </button>
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

          {plannerEntries.length === 0 && extraItems.length === 0 ? (
            <p className="riso-empty">
              Nothing planned for {weekLabel} yet — plan a few meals on the Planner tab and your
              grocery list builds itself. You can still add items by hand above.
            </p>
          ) : groups.length === 0 ? (
            <p className="riso-empty">Nothing to buy — everything's a leftover, already on hand, or a pantry staple.</p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="riso-group">
                <div className="riso-group-head" style={{ background: view === "store" ? "var(--riso-track)" : "var(--riso-canvas)" }}>
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
                    onDeleteManual={deleteExtraItem}
                  />
                ))}
              </section>
            ))
          )}
        </div>

        <aside className="riso-grocery-aside">
          <section className="riso-grocery-cart">
            <div className="riso-eyebrow on-pink">In the cart</div>
            <div className="riso-grocery-cart-count">
              <span className="riso-grocery-cart-num">{doneCount}</span>
              <span className="riso-grocery-cart-label">of {totalCount} items</span>
            </div>
            <div className="riso-grocery-cart-track">
              <div className="riso-grocery-cart-fill" style={{ width: `${pct}%` }} />
            </div>
            <button type="button" className="riso-grocery-cart-btn" disabled={doneCount === 0} onClick={handleDoneShopping}>
              Done shopping · add {doneCount} to inventory
            </button>
            <p className="riso-grocery-cart-note">
              Checked items go to the Fridge, Freezer or Pantry with a USDA use-by date.
            </p>
          </section>

          <section className="riso-grocery-excluded">
            <div className="riso-eyebrow">Not on the list</div>
            <div className="riso-grocery-excluded-rows">
              <div className="riso-grocery-excluded-row">
                <span>Leftover meals</span>
                <span>{leftoverCount}</span>
              </div>
              <div className="riso-grocery-excluded-row">
                <span>Meals you already have food for</span>
                <span>{alreadyHaveCount}</span>
              </div>
              <div className="riso-grocery-excluded-row">
                <span>Pantry staples (salt, oil…)</span>
                <span>{stapleCount}</span>
              </div>
            </div>
            <button
              type="button"
              className="riso-grocery-excluded-link"
              title="Coming soon"
              onClick={(e) => e.preventDefault()}
            >
              Review what's left off →
            </button>
          </section>

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
    </div>
  );
}
