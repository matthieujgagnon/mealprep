const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.needsManualEntry = data?.needsManualEntry;
    throw err;
  }
  return data;
}

export const api = {
  signup: (email, password, name) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name }) }),
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
    const res = await fetch(`${BASE}/flyers/upload`, { method: "POST", body: form, credentials: "include" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
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

  listGroceryExtras: (weekStart) =>
    request(`/grocery-extra-items?week=${encodeURIComponent(weekStart)}`),
  addGroceryExtra: (weekStart, item) =>
    request("/grocery-extra-items", { method: "POST", body: JSON.stringify({ weekStart, ...item }) }),
  deleteGroceryExtra: (id) => request(`/grocery-extra-items/${id}`, { method: "DELETE" }),

  listGroceryOverrides: (weekStart) =>
    request(`/grocery-item-overrides?week=${encodeURIComponent(weekStart)}`),
  // patch: { quantity?: string | null, removed?: boolean }. Resolves to the
  // saved override, or null once it has nothing left to change.
  setGroceryOverride: (weekStart, key, patch) =>
    request("/grocery-item-overrides", { method: "PUT", body: JSON.stringify({ weekStart, key, ...patch }) }),

  listGroceryChecked: (weekStart) =>
    request(`/grocery-checked?week=${encodeURIComponent(weekStart)}`),
  checkGroceryItem: (weekStart, core) =>
    request("/grocery-checked", { method: "POST", body: JSON.stringify({ weekStart, core }) }),
  uncheckGroceryItem: (weekStart, core) =>
    request(`/grocery-checked/${encodeURIComponent(weekStart)}/${encodeURIComponent(core)}`, {
      method: "DELETE",
    }),
  clearGroceryChecked: (weekStart) =>
    request(`/grocery-checked?week=${encodeURIComponent(weekStart)}`, { method: "DELETE" }),
  // Checked items "Done shopping" already put in Inventory.
  listGroceryInInventory: (weekStart) =>
    request(`/grocery-checked/in-inventory?week=${encodeURIComponent(weekStart)}`),
  markGroceryInInventory: (weekStart, cores) =>
    request("/grocery-checked/in-inventory", { method: "POST", body: JSON.stringify({ weekStart, cores }) }),

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
    const res = await fetch(`${BASE}/receipts/parse`, { method: "POST", body: form, credentials: "include" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },
  // Returns { expiresAt, category } - both suggested from the same bundled
  // USDA FoodKeeper product match.
  suggestPantryExpiration: (name, location, purchasedAt) =>
    request(
      `/pantry-inventory/suggest?name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}` +
        (purchasedAt ? `&purchasedAt=${encodeURIComponent(purchasedAt)}` : "")
    ),
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
