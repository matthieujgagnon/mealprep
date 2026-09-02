import { useEffect, useState } from "react";
import { DndContext, MeasuringStrategy, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { api } from "./api.js";
import { ImportRecipeForm } from "./components/ImportRecipeForm.jsx";
import { ManualRecipeForm } from "./components/ManualRecipeForm.jsx";
import { MealCard } from "./components/MealCard.jsx";
import { RecipeDetailModal } from "./components/RecipeDetailModal.jsx";
import { PlannerBoard } from "./components/PlannerBoard.jsx";
import { PlannerSidebar } from "./components/PlannerSidebar.jsx";
import { GroceryList } from "./components/GroceryList.jsx";
import { DealsPanel } from "./components/DealsPanel.jsx";

function CookbookDropZone({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: "cookbook-drop" });
  return (
    <div ref={setNodeRef} className={`cookbook-drop-zone${isOver ? " drop-active" : ""}`}>
      {children}
    </div>
  );
}

// Matches on title, tags, and ingredient names — client-side only, no API
// call, so it stays fast even as the cookbook grows. Case-insensitive,
// substring match rather than exact-word, so "chick" finds "chickpea".
function matchesRecipeSearch(recipe, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (recipe.title?.toLowerCase().includes(q)) return true;
  if (recipe.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  if (recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))) return true;
  return false;
}

export default function App() {
  const [tab, setTab] = useState("collection"); // "collection" | "planner"
  const [recipes, setRecipes] = useState([]);
  const [plannerEntries, setPlannerEntries] = useState([]);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [anchorRecipe, setAnchorRecipe] = useState(null); // for detail modal
  const [showManualForm, setShowManualForm] = useState(false);
  const [customStaples, setCustomStaples] = useState([]);
  const [stapleCategories, setStapleCategories] = useState({}); // core -> "spice" | "other" override
  const [grocerySections, setGrocerySections] = useState([]);
  const [activeTagFilter, setActiveTagFilter] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  // Require a small pointer movement before a drag "activates" — otherwise
  // the drag sensor grabs every click and cards never open.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    api.listRecipes().then(setRecipes).catch(() => {});
    api.listPlanner().then(setPlannerEntries).catch(() => {});
    api.listPantryStaples().then((list) => {
      setCustomStaples(list.map((s) => s.core));
      setStapleCategories(
        Object.fromEntries(list.filter((s) => s.category).map((s) => [s.core, s.category]))
      );
    }).catch(() => {});
    api.listGrocerySections().then(setGrocerySections).catch(() => {});
  }, []);

  function handleImported(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
  }

  function handleManualCreated(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
    setShowManualForm(false);
  }

  async function handleDeleteRecipe(id) {
    await api.deleteRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setPlannerEntries((prev) => prev.filter((e) => e.recipeId !== id));
  }

  // Removing from Imported: if the recipe is ALSO in the cookbook, just unflag
  // it from Imported (it stays in My Cookbook). Otherwise it'd have nowhere
  // left to live, so delete it outright.
  async function handleRemoveFromImported(recipe) {
    if (recipe.inCookbook) {
      await api.updateRecipe(recipe.id, { inImported: false });
      setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? { ...r, inImported: false } : r)));
    } else {
      await handleDeleteRecipe(recipe.id);
    }
  }

  // Removing from the Cookbook: if the recipe is ALSO an import, just unflag it
  // (it stays in Imported). If it only ever lived in the cookbook, delete it —
  // otherwise it'd become an orphaned recipe with nowhere to find it.
  async function handleRemoveFromCookbook(recipe) {
    if (recipe.inImported) {
      await api.updateRecipe(recipe.id, { inCookbook: false });
      setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? { ...r, inCookbook: false } : r)));
    } else {
      await handleDeleteRecipe(recipe.id);
    }
  }

  async function handleAddToCookbook(recipeId) {
    const updated = await api.updateRecipe(recipeId, { inCookbook: true, inImported: false });
    setRecipes((prev) => prev.map((r) => (r.id === recipeId ? { ...r, inCookbook: true, inImported: false } : r)));
  }

  async function handleMarkStaple(core) {
    if (customStaples.includes(core)) return; // already a staple
    await api.addPantryStaple(core);
    setCustomStaples((prev) => [...prev, core]);
  }

  async function handleRemoveStaple(core) {
    await api.removePantryStaple(core);
    setCustomStaples((prev) => prev.filter((c) => c !== core));
    setStapleCategories((prev) => {
      const { [core]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function handleSetStapleCategory(core, category) {
    await api.setPantryStapleCategory(core, category);
    setCustomStaples((prev) => (prev.includes(core) ? prev : [...prev, core]));
    setStapleCategories((prev) => ({ ...prev, [core]: category }));
  }

  // Keeps the recipes list AND the currently-open modal in sync after an
  // in-modal edit (currently just tags) — otherwise the tag filter bar
  // wouldn't see new tags until a full page reload.
  function handleRecipeUpdated(updated) {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    setActiveRecipe((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }

  async function handleCreateSection(name) {
    const section = await api.createGrocerySection(name);
    setGrocerySections((prev) => [...prev, { ...section, assignments: [] }]);
  }

  async function handleDeleteSection(id) {
    await api.deleteGrocerySection(id);
    setGrocerySections((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAssignToSection(sectionId, core) {
    await api.assignToGrocerySection(sectionId, core);
    setGrocerySections((prev) =>
      prev.map((s) => ({
        ...s,
        // Remove any prior assignment of this ingredient from every section
        // (it's globally unique), then add it to the target section.
        assignments:
          s.id === sectionId
            ? [...s.assignments.filter((a) => a.core !== core), { core }]
            : s.assignments.filter((a) => a.core !== core),
      }))
    );
  }

  async function handleUnassignFromSection(core) {
    await api.unassignFromGrocerySection(core);
    setGrocerySections((prev) =>
      prev.map((s) => ({ ...s, assignments: s.assignments.filter((a) => a.core !== core) }))
    );
  }

  async function handleDragEnd(event) {
    setIsDragActive(false);
    const { active, over } = event;
    if (!over) return;

    if (over.id === "pantry-staples-drop") {
      const core = active.data.current?.ingredientCore;
      if (core) handleMarkStaple(core);
      return;
    }

    if (over.id === "staple-category-spice-drop" || over.id === "staple-category-other-drop") {
      const core = active.data.current?.ingredientCore;
      if (core) handleSetStapleCategory(core, over.id === "staple-category-spice-drop" ? "spice" : "other");
      return;
    }

    const sectionMatch = /^section-drop-(.+)$/.exec(over.id);
    if (sectionMatch) {
      const core = active.data.current?.ingredientCore;
      if (core) handleAssignToSection(sectionMatch[1], core);
      return;
    }

    // Moving an existing planner placement to a different day/meal slot,
    // rather than creating a brand new placement.
    const entryId = active.data.current?.entryId;
    if (entryId) {
      const cellMatch = /^day-(\d)-(breakfast|lunch|dinner)$/.exec(over.id);
      if (!cellMatch) return;
      const dayOfWeek = Number(cellMatch[1]);
      const mealType = cellMatch[2];
      await api.updatePlannerEntry(entryId, { dayOfWeek, mealType });
      setPlannerEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, dayOfWeek, mealType } : e))
      );
      return;
    }

    const recipeId = active.data.current?.recipe?.id;
    if (!recipeId) return;

    if (over.id === "cookbook-drop") {
      handleAddToCookbook(recipeId);
      return;
    }

    const cellMatch = /^day-(\d)-(breakfast|lunch|dinner)$/.exec(over.id);
    if (!cellMatch) return;

    const dayOfWeek = Number(cellMatch[1]);
    const mealType = cellMatch[2];
    const entry = await api.placeOnPlanner({ recipeId, dayOfWeek, mealType });
    setPlannerEntries((prev) => [...prev, entry]);
  }

  async function handleRemoveFromPlanner(entryId) {
    await api.removeFromPlanner(entryId);
    setPlannerEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  async function handleToggleLeftover(entryId, isLeftover) {
    await api.updatePlannerEntry(entryId, { isLeftover });
    setPlannerEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, isLeftover } : e))
    );
  }

  const importedRecipes = recipes
    .filter((r) => r.inImported && !r.isPlaceholder)
    .filter((r) => !activeTagFilter || r.tags?.includes(activeTagFilter))
    .filter((r) => matchesRecipeSearch(r, recipeSearch));
  const cookbookRecipes = recipes
    .filter((r) => r.inCookbook && !r.isPlaceholder)
    .filter((r) => !activeTagFilter || r.tags?.includes(activeTagFilter))
    .filter((r) => matchesRecipeSearch(r, recipeSearch));
  const plannableRecipes = recipes.filter((r) => !r.isPlaceholder);
  const allTags = [...new Set(recipes.flatMap((r) => r.tags || []))].sort();

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => setIsDragActive(true)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setIsDragActive(false)}
      // Re-measures droppable rects continuously while dragging instead of
      // only once at drag start. The default (measure-once) can miss a
      // droppable whose actual position settles slightly late — a flex-wrap
      // row of store sections is exactly that case, since the last section's
      // position depends on how many sections came before it wrapping onto
      // the row. This is dnd-kit's own documented fix for "some drop
      // targets don't register reliably."
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className={`app${isDragActive ? " dnd-active" : ""}`}>
        <header className="app-header">
          <h1 className="wordmark">
            The Matt Mo <span>Cookbook</span>
          </h1>
          <nav className="tabs">
            <button
              className={`tab${tab === "collection" ? " active" : ""}`}
              onClick={() => setTab("collection")}
            >
              Recipes
            </button>
            <button
              className={`tab${tab === "planner" ? " active" : ""}`}
              onClick={() => setTab("planner")}
            >
              Planner
            </button>
            <button
              className={`tab${tab === "grocery" ? " active" : ""}`}
              onClick={() => setTab("grocery")}
            >
              Grocery List
            </button>
          </nav>
        </header>

        <DealsPanel />

        {tab === "collection" && (
          <>
            <ImportRecipeForm onImported={handleImported} />

            <input
              type="text"
              className="recipe-search-input"
              placeholder="🔍 Search recipes by name, tag, or ingredient…"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
            />

            {allTags.length > 0 && (
              <div className="tag-filter-bar">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={`tag-chip${activeTagFilter === tag ? " active" : ""}`}
                    onClick={() => setActiveTagFilter((prev) => (prev === tag ? null : tag))}
                  >
                    {tag}
                  </button>
                ))}
                {activeTagFilter && (
                  <button className="tag-chip clear" onClick={() => setActiveTagFilter(null)}>
                    Clear filter ×
                  </button>
                )}
              </div>
            )}

            <section className="recipe-section">
              <div className="recipe-section-header">
                <h2 className="recipe-section-title">Imported</h2>
              </div>
              {importedRecipes.length === 0 ? (
                <p className="empty-state">
                  {recipeSearch || activeTagFilter
                    ? "No imported recipes match your search."
                    : "No imported recipes yet — paste a URL above."}
                </p>
              ) : (
                <div className="collection-grid">
                  {importedRecipes.map((r) => (
                    <MealCard
                      key={r.id}
                      recipe={r}
                      onClick={setActiveRecipe}
                      onDelete={() => handleRemoveFromImported(r)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="recipe-section">
              <div className="recipe-section-header">
                <h2 className="recipe-section-title">My Cookbook</h2>
                {!showManualForm && (
                  <button className="btn primary" onClick={() => setShowManualForm(true)}>
                    + Add a recipe
                  </button>
                )}
              </div>

              {showManualForm && (
                <ManualRecipeForm
                  onCreated={handleManualCreated}
                  onCancel={() => setShowManualForm(false)}
                />
              )}

              <CookbookDropZone>
                {cookbookRecipes.length === 0 && !showManualForm ? (
                  <p className="empty-state">
                    {recipeSearch || activeTagFilter
                      ? "No cookbook recipes match your search."
                      : "Drag a recipe here from Imported, or add one by hand — recipes you save stay separate from your imports."}
                  </p>
                ) : (
                  <div className="collection-grid">
                    {cookbookRecipes.map((r) => (
                      <MealCard
                        key={r.id}
                        recipe={r}
                        dragId={`cookbook-${r.id}`}
                        onClick={setActiveRecipe}
                        onDelete={() => handleRemoveFromCookbook(r)}
                      />
                    ))}
                  </div>
                )}
              </CookbookDropZone>
            </section>
          </>
        )}

        {tab === "planner" && (
          <>
            {plannableRecipes.length === 0 ? (
              <p className="empty-state">
                Import or add a recipe first, then drag it onto a meal slot here.
              </p>
            ) : (
              <>
                <p className="planner-tip">
                  <span className="leftover-dot-demo" /> Tap the dot on a placed card to mark it as leftovers — stays on your calendar but won't be added to the grocery list again.
                </p>
                <div className="planner-layout">
                  <div className="planner-main">
                    <PlannerBoard
                      entries={plannerEntries}
                      onCardClick={setActiveRecipe}
                      onRemove={handleRemoveFromPlanner}
                      onToggleLeftover={handleToggleLeftover}
                    />
                  </div>
                  <PlannerSidebar
                    plannerEntries={plannerEntries}
                    allRecipes={recipes}
                    anchorRecipe={anchorRecipe}
                    onClearAnchor={() => setAnchorRecipe(null)}
                  />
                </div>
                <h3 className="planner-source-heading">Drag a recipe onto the board</h3>
                <div className="collection-grid" style={{ marginTop: 12 }}>
                  {plannableRecipes.map((r) => (
                    <MealCard key={r.id} recipe={r} onClick={setActiveRecipe} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "grocery" && (
          <GroceryList
            plannerEntries={plannerEntries}
            customStaples={customStaples}
            stapleCategories={stapleCategories}
            onRemoveStaple={handleRemoveStaple}
            grocerySections={grocerySections}
            onCreateSection={handleCreateSection}
            onDeleteSection={handleDeleteSection}
            onUnassignFromSection={handleUnassignFromSection}
          />
        )}

        {activeRecipe && (
          <RecipeDetailModal
            recipe={activeRecipe}
            onClose={() => setActiveRecipe(null)}
            allRecipes={recipes}
            plannerEntries={plannerEntries}
            onSelectRecipe={setActiveRecipe}
            onRecipeUpdated={handleRecipeUpdated}
            onDelete={async (id) => {
              await handleDeleteRecipe(id);
              setActiveRecipe(null);
            }}
            onPlanAround={(recipe) => {
              setAnchorRecipe(recipe);
              setActiveRecipe(null);
              setTab("planner");
            }}
          />
        )}
      </div>
    </DndContext>
  );
}
