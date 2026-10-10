import { getLang, t } from "./i18n/index.js";
import { afterSaves, noteSave, savesVersion } from "./lib/pendingSaves.js";

const BASE = "/api";

// The grocery list is read by many pages (Grocery, Store mode, Home, the recipe
// pop-out's marks) while changes to it are saved in the background. Two things
// keep a page from showing the list as it was before a change (see
// lib/pendingSaves.js):
//  - a read of grocery data waits for the grocery saves already sent;
//  - a read that was on its way while a save started or ended is read again
//    (it may be older than the change), and only the newer answer is given back.
const areaOf = (path) => (path.startsWith("/grocery") ? "grocery" : null);
const READ_AGAIN = 2; // at most this many more times, so a steady stream of saves cannot hold a read for ever

// Every request says which language the person reads, so the server's
// messages (errors, emails) come back in it.
async function request(path, options = {}) {
  const area = areaOf(path);
  if (!area) return send(path, options);
  if (options.method && options.method !== "GET") return noteSave(area, send(path, options));
  for (let attempt = 0; ; attempt++) {
    await afterSaves(area);
    const seen = savesVersion(area);
    const data = await send(path, options);
    if (savesVersion(area) === seen || attempt >= READ_AGAIN) return data;
  }
}

async function send(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers, "X-Lang": getLang() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || t("common.requestFailed", { status: res.status }));
    err.needsManualEntry = data?.needsManualEntry;
    err.reason = data?.reason ?? null;
    err.code = data?.code ?? null;
    throw err;
  }
  return data;
}

export const api = {
  signup: (email, password, name) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name, locale: getLang() }) }),
  // The account's language ("fr" | "en").
  saveLocale: (locale) => request("/auth/me", { method: "PATCH", body: JSON.stringify({ locale }) }),
  saveWeekend: (weekend) => request("/auth/me", { method: "PATCH", body: JSON.stringify(weekend) }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  // Any failure (401 for "not logged in" included) just means "no session" -
  // callers only need a yes/no, not a thrown exception on the expected
  // first-load case of nobody being logged in yet.
  me: () => request("/auth/me").catch(() => null),
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  listRecipes: () => request("/recipes"),
  getRecipe: (id) => request(`/recipes/${id}`),
  importRecipe: (url) =>
    request("/recipes/import", { method: "POST", body: JSON.stringify({ url }) }),
  createRecipe: (payload) =>
    request("/recipes", { method: "POST", body: JSON.stringify(payload) }),
  updateRecipe: (id, payload) =>
    request(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: "DELETE" }),
  // Reads a recipe link without saving it (the editor's Re-import).
  scrapeRecipe: (url) =>
    request("/recipes/scrape", { method: "POST", body: JSON.stringify({ url }) }),
  parseIngredients: (text) =>
    request("/recipes/parse-ingredients", { method: "POST", body: JSON.stringify({ text }) }),
  // Body is the image itself; returns { url } to store as a recipe photo.
  uploadRecipeImage: (blob) =>
    request("/recipe-images", { method: "POST", headers: { "Content-Type": blob.type }, body: blob }),

  listPlanner: (weekStart) => request(`/planner?week=${encodeURIComponent(weekStart)}`),
  // Every planned meal from `from` (a "YYYY-MM-DD" day) onward, across weeks:
  // what the grocery list is built from.
  // The days in a range that have a planned meal (the phone Planner's calendar dots).
  listPlannedDates: (from, to) => request(`/planner/dates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  listPlannerUpcoming: (from) => request(`/planner/upcoming?from=${encodeURIComponent(from)}`),
  placeOnPlanner: (payload) =>
    request("/planner", { method: "POST", body: JSON.stringify(payload) }),
  markSlotBlank: (weekStart, dayOfWeek, mealType, note) =>
    request("/planner/blank", {
      method: "POST",
      body: JSON.stringify({ weekStart, dayOfWeek, mealType, ...(note ? { note } : {}) }),
    }),
  setPlannerEntryNote: (id, note) =>
    request(`/planner/${id}/note`, { method: "PUT", body: JSON.stringify({ note }) }),
  copyPlannerWeek: (fromWeekStart, toWeekStart) =>
    request("/planner/copy-week", {
      method: "POST",
      body: JSON.stringify({ fromWeekStart, toWeekStart }),
    }),
  updatePlannerEntry: (id, payload) =>
    request(`/planner/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  removeFromPlanner: (id) => request(`/planner/${id}`, { method: "DELETE" }),

  getDeals: () => request("/deals"),
  // Deals to treat as real prices. Without an uploaded flyer the server sends
  // sample deals (isMockData) so the Flyers page has something to show -
  // those must never show up as "on sale" anywhere else.
  // Without each deal's monthly history (see GET /api/deals?lite=1); a
  // detail view fetches that one deal in full with getDeal.
  getRealDeals: () => request("/deals?lite=1").then((d) => (d.isMockData ? [] : d.deals)),
  getDeal: (id) => request(`/deals/${encodeURIComponent(id)}`),
  getImportReport: () => request("/flyers/report"),
  fixPerLbPrices: () => request("/flyers/report/fix-per-lb", { method: "POST" }),
  groceryAisles: (names) => request("/deals/aisles", { method: "POST", body: JSON.stringify({ names }) }),
  dealPhotoUrl: (id) => `${BASE}/deals/${encodeURIComponent(id)}/photo`,
  checkDealPhoto: (id) => request(`/deals/${encodeURIComponent(id)}/photo-check`),
  uploadFlyer: async (store, file) => {
    const form = new FormData();
    form.append("store", store);
    form.append("file", file);
    const res = await fetch(`${BASE}/flyers/upload`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: { "X-Lang": getLang() },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || t("common.requestFailed", { status: res.status }));
    return data;
  },
  clearFlyerDeals: () => request("/flyers", { method: "DELETE" }),
  // Weekly auto-import: where and what to read, and how the last run went.
  getFlyerSettings: () => request("/flyers/settings"),
  updateFlyerSettings: (payload) => request("/flyers/settings", { method: "PUT", body: JSON.stringify(payload) }),
  // Runs the import now; resolves to the updated settings (lastImportOk
  // says whether it worked).
  runFlyerImport: () => request("/flyers/import", { method: "POST" }),
  listFlyerStores: (postalCode) => request(`/flyers/stores?postalCode=${encodeURIComponent(postalCode)}`),
  // The stored file behind a manually-uploaded flyer - used directly as an
  // <iframe> src, so the browser's own PDF/image viewer renders it. Not run
  // through `request()` since this isn't JSON.
  flyerUploadImageUrl: (source) => `${BASE}/flyers/image/${encodeURIComponent(source)}`,

  listWatchlist: () => request("/watchlist"),
  addToWatchlist: (matchName) => request("/watchlist", { method: "POST", body: JSON.stringify({ matchName }) }),
  removeFromWatchlist: (matchName) => request(`/watchlist/${encodeURIComponent(matchName)}`, { method: "DELETE" }),

  listGroceryExtras: () => request("/grocery-extra-items"),
  addGroceryExtra: (item) => request("/grocery-extra-items", { method: "POST", body: JSON.stringify(item) }),
  deleteGroceryExtra: (id) => request(`/grocery-extra-items/${id}`, { method: "DELETE" }),

  listGroceryOverrides: () => request("/grocery-item-overrides"),
  // patch: { quantity?: string | null, removed?: boolean }. Resolves to the
  // saved override, or null once it has nothing left to change.
  setGroceryOverride: (key, patch) =>
    request("/grocery-item-overrides", { method: "PUT", body: JSON.stringify({ key, ...patch }) }),
  // Forgets what's saved about rows whose meals have all left the plan.
  clearGroceryOverrides: (keys) =>
    request("/grocery-item-overrides/clear", { method: "POST", body: JSON.stringify({ keys }) }),

  // The list's saved rows: [{ core, covered, bought, inInventory }] - what
  // each check covers and what "Done shopping" has bought.
  listGroceryChecked: () => request("/grocery-checked"),
  checkGroceryItem: (core, covered) =>
    request("/grocery-checked", { method: "POST", body: JSON.stringify({ core, covered }) }),
  uncheckGroceryItem: (core) => request(`/grocery-checked/${encodeURIComponent(core)}`, { method: "DELETE" }),
  clearGroceryChecked: () => request("/grocery-checked", { method: "DELETE" }),
  // Checked items sent to Inventory: items is [{ core, bought }]. The bought
  // amounts leave the list; hand-added items are deleted.
  markGroceryInInventory: (items) =>
    request("/grocery-checked/in-inventory", { method: "POST", body: JSON.stringify({ items }) }),
  // Keeps the saved rows true to the plan (see tidyChecks).
  tidyGroceryChecked: (set, remove) =>
    request("/grocery-checked/tidy", { method: "POST", body: JSON.stringify({ set, remove }) }),

  listPantryStaples: () => request("/pantry-staples"),
  addPantryStaple: (core) =>
    request("/pantry-staples", { method: "POST", body: JSON.stringify({ core }) }),
  removePantryStaple: (core) =>
    request(`/pantry-staples/${encodeURIComponent(core)}`, { method: "DELETE" }),
  setPantryStapleCategory: (core, category) =>
    request(`/pantry-staples/${encodeURIComponent(core)}`, {
      method: "PUT",
      body: JSON.stringify({ category }),
    }),

  listGrocerySections: () => request("/grocery-sections"),
  reorderGrocerySections: (orderedIds) =>
    request("/grocery-sections/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),
  createGrocerySection: (name) =>
    request("/grocery-sections", { method: "POST", body: JSON.stringify({ name }) }),
  deleteGrocerySection: (id) => request(`/grocery-sections/${id}`, { method: "DELETE" }),
  renameGrocerySection: (id, name) =>
    request(`/grocery-sections/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  assignToGrocerySection: (sectionId, core) =>
    request(`/grocery-sections/${sectionId}/assign`, {
      method: "POST",
      body: JSON.stringify({ core }),
    }),
  unassignFromGrocerySection: (core) =>
    request(`/grocery-sections/assignments/${encodeURIComponent(core)}`, { method: "DELETE" }),

  listPantryInventory: () => request("/pantry-inventory"),
  // Returns { items: [{ name, quantity }] } - extracted candidates only,
  // nothing is saved server-side until each is added individually below.
  parseReceipt: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/receipts/parse`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: { "X-Lang": getLang() },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || t("common.requestFailed", { status: res.status }));
    return data;
  },
  // Returns { expiresAt, category, location } - suggested from the same
  // bundled USDA FoodKeeper product match (the shelf too, when none is given).
  suggestPantryExpiration: (name, location, purchasedAt) =>
    request(
      `/pantry-inventory/suggest?name=${encodeURIComponent(name)}` +
        (location ? `&location=${encodeURIComponent(location)}` : "") +
        (purchasedAt ? `&purchasedAt=${encodeURIComponent(purchasedAt)}` : "")
    ),
  // The last few distinct foods you added or used up, for the Add item form's Recent chips.
  listRecentPantryItems: () => request("/pantry-inventory/recent"),
  addPantryInventoryItem: (item) =>
    request("/pantry-inventory", { method: "POST", body: JSON.stringify(item) }),
  updatePantryInventoryItem: (id, payload) =>
    request(`/pantry-inventory/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deletePantryInventoryItem: (id) => request(`/pantry-inventory/${id}`, { method: "DELETE" }),
  // Removes items like a plain delete, but logs each as "consumed" or
  // "wasted" first - see POST /pantry-inventory/consume.
  consumePantryInventoryItems: (ids, action) =>
    request("/pantry-inventory/consume", { method: "POST", body: JSON.stringify({ ids, action }) }),

  listPantryLocations: () => request("/pantry-locations"),
  addPantryLocation: (name) =>
    request("/pantry-locations", { method: "POST", body: JSON.stringify({ name }) }),
  deletePantryLocation: (id) => request(`/pantry-locations/${id}`, { method: "DELETE" }),
  renamePantryLocation: (id, name) =>
    request(`/pantry-locations/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),

  getInventoryLayout: () => request("/inventory-layout"),
  // sections: [{ sectionId, label?, size }] in display order.
  saveInventoryLayout: (sections) =>
    request("/inventory-layout", { method: "PUT", body: JSON.stringify({ sections }) }),
};
