// Which store the grocery list files an item under. One rule for the Grocery page
// (components/GroceryList.jsx) and the recipe card's To buy rows, so the store a
// recipe names is the store the list shows.

// Per-item "which store do I usually get this at" choice, kept in this browser
// (there is no server schema for it).
export const STORE_PREF_KEY = "mealprep-grocery-store-pref";
export const DEFAULT_STORE = "Metro";
export const ANY_STORE = "Any store"; // unfiled items with no sale, once you've made stores of your own

export function loadStorePrefs() {
  try {
    const raw = localStorage.getItem(STORE_PREF_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// The stores in the list's order: your own stores (`sections`, in your order),
// then any store with a flyer deal. Items you haven't filed land in the first
// flyer store, or with no flyers in "Any store" once you've made stores of your
// own (`fallbackStore`).
export function storeSetup(sections = [], deals = []) {
  const flyerStores = [...new Set(deals.map((d) => d.store).filter(Boolean))];
  const fallbackStore = flyerStores[0] || (sections.length > 0 ? ANY_STORE : DEFAULT_STORE);
  const storeOrder = sections.map((s) => s.name);
  for (const store of flyerStores) if (!storeOrder.includes(store)) storeOrder.push(store);
  if (!storeOrder.includes(fallbackStore)) storeOrder.unshift(fallbackStore);
  const assignedStore = new Map(sections.flatMap((s) => (s.assignments || []).map((a) => [a.core, s.name])));
  return { flyerStores, fallbackStore, storeOrder, assignedStore };
}

// An item's store (`core` is its grocery key): where you filed it, else the store
// you picked for it, else the store of its flyer deal, else the fallback. A manual
// choice always wins, so moving a sale item never looks like it did nothing.
export function storeFor(core, deal, { assignedStore, storePrefs = {}, storeOrder = [], fallbackStore }) {
  const assigned = assignedStore?.get(core);
  if (assigned) return assigned;
  const pref = storePrefs[core];
  if (pref && storeOrder.includes(pref)) return pref;
  if (deal?.store) return deal.store;
  return fallbackStore;
}

// The store to name beside an item outside the Grocery page: its real store, or
// null when the list only puts it in a catch-all: "Any store", or the default
// store before you have any store or flyer.
export function namedStoreFor(core, deal, setup, storePrefs = {}) {
  const store = storeFor(core, deal, { ...setup, storePrefs });
  const placeholder =
    store === ANY_STORE || (store === DEFAULT_STORE && setup.flyerStores.length === 0 && setup.assignedStore.size === 0 && !storePrefs[core]);
  return placeholder ? null : store;
}
