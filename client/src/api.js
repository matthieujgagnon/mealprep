const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
  listRecipes: () => request("/recipes"),
  getRecipe: (id) => request(`/recipes/${id}`),
  importRecipe: (url) =>
    request("/recipes/import", { method: "POST", body: JSON.stringify({ url }) }),
  createRecipe: (payload) =>
    request("/recipes", { method: "POST", body: JSON.stringify(payload) }),
  updateRecipe: (id, payload) =>
    request(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: "DELETE" }),

  listPlanner: (weekStart) => request(`/planner?week=${encodeURIComponent(weekStart)}`),
  placeOnPlanner: (payload) =>
    request("/planner", { method: "POST", body: JSON.stringify(payload) }),
  updatePlannerEntry: (id, payload) =>
    request(`/planner/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  removeFromPlanner: (id) => request(`/planner/${id}`, { method: "DELETE" }),
  copyPlannerWeek: (fromWeekStart, toWeekStart) =>
    request("/planner/copy-week", {
      method: "POST",
      body: JSON.stringify({ fromWeekStart, toWeekStart }),
    }),

  getDeals: () => request("/deals"),

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
