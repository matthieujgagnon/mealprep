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

  listRecipes: () => request("/recipes"),
  getRecipe: (id) => request(`/recipes/${id}`),
  importRecipe: (url) =>
    request("/recipes/import", { method: "POST", body: JSON.stringify({ url }) }),
  createRecipe: (payload) =>
    request("/recipes", { method: "POST", body: JSON.stringify(payload) }),
  updateRecipe: (id, payload) =>
    request(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: "DELETE" }),
  reorderRecipes: (orderedIds) =>
    request("/recipes/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),

  listPlanner: (weekStart) => request(`/planner?week=${encodeURIComponent(weekStart)}`),
  placeOnPlanner: (payload) =>
    request("/planner", { method: "POST", body: JSON.stringify(payload) }),
  markSlotBlank: (weekStart, dayOfWeek, mealType) =>
    request("/planner/blank", {
      method: "POST",
      body: JSON.stringify({ weekStart, dayOfWeek, mealType }),
    }),
  copyPlannerWeek: (fromWeekStart, toWeekStart) =>
    request("/planner/copy-week", {
      method: "POST",
      body: JSON.stringify({ fromWeekStart, toWeekStart }),
    }),
  updatePlannerEntry: (id, payload) =>
    request(`/planner/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  removeFromPlanner: (id) => request(`/planner/${id}`, { method: "DELETE" }),

  getDeals: () => request("/deals"),
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
  importLeRabaisDeals: () => request("/flyers/import-le-rabais", { method: "POST" }),

  listGroceryExtras: (weekStart) =>
    request(`/grocery-extra-items?week=${encodeURIComponent(weekStart)}`),
  addGroceryExtra: (weekStart, item) =>
    request("/grocery-extra-items", { method: "POST", body: JSON.stringify({ weekStart, ...item }) }),
  deleteGroceryExtra: (id) => request(`/grocery-extra-items/${id}`, { method: "DELETE" }),

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
  listRecipeCategories: () => request("/recipe-categories"),
  createRecipeCategory: (name) =>
    request("/recipe-categories", { method: "POST", body: JSON.stringify({ name }) }),
  deleteRecipeCategory: (id) => request(`/recipe-categories/${id}`, { method: "DELETE" }),
  reorderRecipeCategories: (orderedIds) =>
    request("/recipe-categories/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),
  createGrocerySection: (name) =>
    request("/grocery-sections", { method: "POST", body: JSON.stringify({ name }) }),
  deleteGrocerySection: (id) => request(`/grocery-sections/${id}`, { method: "DELETE" }),
  assignToGrocerySection: (sectionId, core) =>
    request(`/grocery-sections/${sectionId}/assign`, {
      method: "POST",
      body: JSON.stringify({ core }),
    }),
  unassignFromGrocerySection: (core) =>
    request(`/grocery-sections/assignments/${encodeURIComponent(core)}`, { method: "DELETE" }),
};
