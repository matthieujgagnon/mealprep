import { useEffect, useState } from "react";
import { DndContext, MeasuringStrategy, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { api } from "./api.js";
import { currentWeekStart, shiftWeek } from "./lib/dates.js";
import { ImportRecipeForm } from "./components/ImportRecipeForm.jsx";
import { ManualRecipeForm } from "./components/ManualRecipeForm.jsx";
import { MealCard } from "./components/MealCard.jsx";
import { RecipeDetailModal } from "./components/RecipeDetailModal.jsx";
import { PlannerBoard } from "./components/PlannerBoard.jsx";
import { PlannerSidebar } from "./components/PlannerSidebar.jsx";
import { GroceryList } from "./components/GroceryList.jsx";
import { DealsPanel } from "./components/DealsPanel.jsx";
import { WhatCanIMake } from "./components/WhatCanIMake.jsx";

function CookbookDropZone({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: "cookbook-drop" });
  return (
    <div ref={setNodeRef} className={`cookbook-drop-zone${isOver ? " drop-active" : ""}`}>
      {children}
    </div>
  );
}

function RecipeCategorySection({
  category,
  recipes,
  isFirst,
  isLast,
  onReorder,
  onDelete,
  onSelectRecipe,
  onDeleteRecipe,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `category-drop-${category.id}` });
  return (
    <div ref={setNodeRef} className={`recipe-category-section${isOver ? " drop-active" : ""}`}>
      <div className="recipe-category-header">
        <h3 className="recipe-category-title">{category.name}</h3>
        <div className="reorder-buttons">
          <button disabled={isFirst} title="Move up" onClick={() => onReorder(category.id, "up")}>
            ▲
          </button>
          <button disabled={isLast} title="Move down" onClick={() => onReorder(category.id, "down")}>
            ▼
          </button>
        </div>
        <button
          className="staple-remove-btn"
          title="Delete this category"
          onClick={() => onDelete(category.id)}
        >
          ×
        </button>
      </div>
      {recipes.length === 0 ? (
        <p className="staples-empty-hint">Drag a recipe here</p>
      ) : (
        <div className="collection-grid">
          {recipes.map((r) => (
            <MealCard
              key={r.id}
              recipe={r}
              dragId={`cookbook-${r.id}`}
              onClick={onSelectRecipe}
              onDelete={() => onDeleteRecipe(r)}
              reorderable
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UncategorizedDropZone({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: "category-drop-none" });
  return (
    <div ref={setNodeRef} className={`recipe-category-section${isOver ? " drop-active" : ""}`}>
      {children}
    </div>
  );
}

function AddCategoryForm({ onCreate }) {
  const [name, setName] = useState("");
  return (
    <form
      className="add-section-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate(name.trim());
        setName("");
      }}
    >
      <input
        type="text"
        placeholder="New category (e.g. Breakfast)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="btn subtle">
        + Add category
      </button>
    </form>
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
  const [weekStart, setWeekStart] = useState(currentWeekStart()); // Monday, "YYYY-MM-DD" — which week the Planner and Grocery List tabs are showing
  const [plannedWeeks, setPlannedWeeks] = useState([]); // every weekStart that has at least one placement, for the week-jump picker
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [anchorRecipes, setAnchorRecipes] = useState([]); // for "plan around this" — can hold 2+ recipes at once
  const [showManualForm, setShowManualForm] = useState(false);
  const [customStaples, setCustomStaples] = useState([]);
  const [excludedStaples, setExcludedStaples] = useState([]); // cores explicitly removed from the built-in staple list (e.g. "salt")
  const [stapleCategories, setStapleCategories] = useState({}); // core -> "spice" | "other" override
  const [grocerySections, setGrocerySections] = useState([]);
  const [recipeCategories, setRecipeCategories] = useState([]);
  const [activeTagFilter, setActiveTagFilter] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  // A distance-based activation constraint (start dragging after 8px of
  // movement) is fine for a mouse, but on a touchscreen it means any quick
  // vertical swipe to scroll the page — which is also "more than 8px of
  // movement" — gets grabbed as a drag instead. A delay-based constraint
  // fixes this the way most touch apps handle reorderable lists: the
  // gesture only becomes a drag if the finger stays roughly still for a
  // moment first; a swipe that starts moving right away is left alone and
  // scrolls normally. This is dnd-kit's own documented fix for exactly
  // this conflict.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  useEffect(() => {
    api.listRecipes().then(setRecipes).catch(() => {});
    api.listPantryStaples().then((list) => {
      setCustomStaples(list.filter((s) => !s.excluded).map((s) => s.core));
      setExcludedStaples(list.filter((s) => s.excluded).map((s) => s.core));
      setStapleCategories(
        Object.fromEntries(list.filter((s) => s.category).map((s) => [s.core, s.category]))
      );
    }).catch(() => {});
    api.listGrocerySections().then(setGrocerySections).catch(() => {});
    api.listRecipeCategories().then(setRecipeCategories).catch(() => {});
    api.listPlannerWeeks().then(setPlannedWeeks).catch(() => {});
  }, []);

  useEffect(() => {
    api.listPlanner(weekStart).then(setPlannerEntries).catch(() => {});
  }, [weekStart]);

  // Keeps the week-jump list in sync locally instead of refetching the whole
  // list on every placement — cheap since it's just tracking which weeks are
  // non-empty, not the placements themselves.
  function notePlannedWeek(ws) {
    setPlannedWeeks((prev) => (prev.includes(ws) ? prev : [...prev, ws].sort()));
  }

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
    // Dragging a previously-removed default (e.g. salt) back onto the
    // staples section un-removes it — see pantryStaplesRouter's POST handler.
    setExcludedStaples((prev) => prev.filter((c) => c !== core));
  }

  // Un-marks a staple. For one the user added themselves this just drops
  // it from customStaples. For one of the app's built-in defaults (never in
  // customStaples to begin with) it instead records the exclusion so the
  // built-in list stops re-adding it on every render.
  async function handleRemoveStaple(core) {
    await api.removePantryStaple(core);
    setCustomStaples((prev) => prev.filter((c) => c !== core));
    setExcludedStaples((prev) => (prev.includes(core) ? prev : [...prev, core]));
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

  async function handleReorderSection(id, direction) {
    const currentOrder = grocerySections.map((s) => s.id);
    const index = currentOrder.indexOf(id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[index], newOrder[swapWith]] = [newOrder[swapWith], newOrder[index]];

    setGrocerySections((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      return newOrder.map((sid) => byId.get(sid));
    });

    await api.reorderGrocerySections(newOrder);
  }

  async function handleCreateRecipeCategory(name) {
    const category = await api.createRecipeCategory(name);
    setRecipeCategories((prev) => [...prev, category]);
  }

  async function handleDeleteRecipeCategory(id) {
    await api.deleteRecipeCategory(id);
    setRecipeCategories((prev) => prev.filter((c) => c.id !== id));
    // Recipes in this category become uncategorized server-side (onDelete:
    // SetNull) — reflect that locally too instead of waiting for a refetch.
    setRecipes((prev) =>
      prev.map((r) => (r.categoryId === id ? { ...r, categoryId: null } : r))
    );
  }

  async function handleReorderRecipeCategory(id, direction) {
    const currentOrder = recipeCategories.map((c) => c.id);
    const index = currentOrder.indexOf(id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[index], newOrder[swapWith]] = [newOrder[swapWith], newOrder[index]];

    setRecipeCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      return newOrder.map((cid) => byId.get(cid));
    });

    await api.reorderRecipeCategories(newOrder);
  }

  async function handleAssignRecipeCategory(recipeId, categoryId) {
    await api.updateRecipe(recipeId, { categoryId });
    setRecipes((prev) => prev.map((r) => (r.id === recipeId ? { ...r, categoryId } : r)));
  }

  // Recomputes the dragged recipe's new position among just the given
  // subset (the grid it's visibly part of), then refetches the full list —
  // simpler and safer than hand-splicing local state, since `position` is a
  // single global column shared across every grid a recipe could appear in.
  async function handleReorderRecipes(subset, oldIndex, newIndex) {
    const reordered = [...subset];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    await api.reorderRecipes(reordered.map((r) => r.id));
    api.listRecipes().then(setRecipes).catch(() => {});
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
    // rather than creating a brand new placement. Always within the
    // currently-viewed week — the board only ever shows one week's cells as
    // drop targets, so a cross-week move isn't reachable via drag.
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

    // Dropped onto another recipe card (not a named zone like "cookbook-
    // drop") — reorder within whichever grid both cards are shown in. The
    // dragId prefix says which grid ("recipe-" = Imported, "cookbook-" =
    // Cookbook); within Cookbook, only recipes sharing the dragged one's
    // category actually sit in the same visible grid together.
    const overRecipe = over.data.current?.recipe;
    if (overRecipe && overRecipe.id !== recipeId) {
      const draggedRecipe = recipes.find((r) => r.id === recipeId);
      if (draggedRecipe) {
        const subset = String(active.id).startsWith("cookbook-")
          ? cookbookRecipes.filter((r) => (r.categoryId || null) === (draggedRecipe.categoryId || null))
          : importedRecipes;
        const oldIndex = subset.findIndex((r) => r.id === recipeId);
        const newIndex = subset.findIndex((r) => r.id === overRecipe.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          await handleReorderRecipes(subset, oldIndex, newIndex);
        }
      }
      return;
    }

    if (over.id === "cookbook-drop") {
      handleAddToCookbook(recipeId);
      return;
    }

    const categoryMatch = /^category-drop-(.+)$/.exec(over.id);
    if (categoryMatch) {
      handleAssignRecipeCategory(recipeId, categoryMatch[1] === "none" ? null : categoryMatch[1]);
      return;
    }

    const cellMatch = /^day-(\d)-(breakfast|lunch|dinner)$/.exec(over.id);
    if (!cellMatch) return;

    const dayOfWeek = Number(cellMatch[1]);
    const mealType = cellMatch[2];
    const entry = await api.placeOnPlanner({ recipeId, weekStart, dayOfWeek, mealType });
    setPlannerEntries((prev) => [...prev, entry]);
    notePlannedWeek(weekStart);
  }

  async function handleRemoveFromPlanner(entryId) {
    await api.removeFromPlanner(entryId);
    setPlannerEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  // One control cycles a placed card through three states: plain -> leftover
  // -> already have it -> back to plain. isLeftover/alreadyHave stay two
  // separate booleans server-side, but the UI only ever has one of them true
  // at a time, driven from this single handler.
  async function handleCycleMealState(entryId) {
    const entry = plannerEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = entry.isLeftover
      ? { isLeftover: false, alreadyHave: true }
      : entry.alreadyHave
      ? { isLeftover: false, alreadyHave: false }
      : { isLeftover: true, alreadyHave: false };
    await api.updatePlannerEntry(entryId, next);
    setPlannerEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...next } : e)));
  }

  async function handleMarkBlank(dayOfWeek, mealType) {
    const entry = await api.markSlotBlank(weekStart, dayOfWeek, mealType);
    setPlannerEntries((prev) => [...prev, entry]);
    notePlannedWeek(weekStart);
  }

  async function handleCopyLastWeek() {
    const fromWeekStart = shiftWeek(weekStart, -1);
    const copied = await api.copyPlannerWeek(fromWeekStart, weekStart);
    setPlannerEntries(copied);
    if (copied.length > 0) notePlannedWeek(weekStart);
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
              className={`tab${tab === "makeable" ? " active" : ""}`}
              onClick={() => setTab("makeable")}
            >
              Makeable
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

        {tab === "makeable" && (
          <WhatCanIMake
            recipes={recipes}
            plannerEntries={plannerEntries}
            onSelectRecipe={setActiveRecipe}
          />
        )}

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
                      reorderable
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
                ) : recipeCategories.length === 0 ? (
                  <div className="collection-grid">
                    {cookbookRecipes.map((r) => (
                      <MealCard
                        key={r.id}
                        recipe={r}
                        dragId={`cookbook-${r.id}`}
                        onClick={setActiveRecipe}
                        onDelete={() => handleRemoveFromCookbook(r)}
                        reorderable
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <UncategorizedDropZone>
                      {cookbookRecipes.filter((r) => !r.categoryId).length > 0 ? (
                        <div className="collection-grid">
                          {cookbookRecipes
                            .filter((r) => !r.categoryId)
                            .map((r) => (
                              <MealCard
                                key={r.id}
                                recipe={r}
                                dragId={`cookbook-${r.id}`}
                                onClick={setActiveRecipe}
                                onDelete={() => handleRemoveFromCookbook(r)}
                                reorderable
                              />
                            ))}
                        </div>
                      ) : (
                        <p className="staples-empty-hint">Drag a recipe here to remove it from a category</p>
                      )}
                    </UncategorizedDropZone>
                    {recipeCategories.map((cat, i) => (
                      <RecipeCategorySection
                        key={cat.id}
                        category={cat}
                        recipes={cookbookRecipes.filter((r) => r.categoryId === cat.id)}
                        isFirst={i === 0}
                        isLast={i === recipeCategories.length - 1}
                        onReorder={handleReorderRecipeCategory}
                        onDelete={handleDeleteRecipeCategory}
                        onSelectRecipe={setActiveRecipe}
                        onDeleteRecipe={handleRemoveFromCookbook}
                      />
                    ))}
                  </>
                )}
              </CookbookDropZone>
              {cookbookRecipes.length > 0 && (
                <AddCategoryForm onCreate={handleCreateRecipeCategory} />
              )}
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
                  <span className="leftover-dot-demo" /> Tap the dot on a placed card to cycle it: leftovers (green), then "already have it" (blue outline), then back to plain — either way it stays on your calendar but won't be added to the grocery list again. Click an empty slot to mark it as intentionally blank.
                </p>
                <div className="planner-layout">
                  <div className="planner-main">
                    <PlannerBoard
                      entries={plannerEntries}
                      weekStart={weekStart}
                      plannedWeeks={plannedWeeks}
                      onChangeWeek={setWeekStart}
                      onCopyLastWeek={handleCopyLastWeek}
                      onCardClick={setActiveRecipe}
                      onRemove={handleRemoveFromPlanner}
                      onCycleState={handleCycleMealState}
                      onMarkBlank={handleMarkBlank}
                    />
                  </div>
                  <PlannerSidebar
                    plannerEntries={plannerEntries}
                    allRecipes={recipes}
                    anchorRecipes={anchorRecipes}
                    onClearAnchors={() => setAnchorRecipes([])}
                    onRemoveAnchor={(id) =>
                      setAnchorRecipes((prev) => prev.filter((r) => r.id !== id))
                    }
                    onAddAnchor={(recipe) =>
                      setAnchorRecipes((prev) =>
                        prev.some((r) => r.id === recipe.id) ? prev : [...prev, recipe]
                      )
                    }
                    onSelectRecipe={setActiveRecipe}
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
            weekStart={weekStart}
            customStaples={customStaples}
            excludedStaples={excludedStaples}
            stapleCategories={stapleCategories}
            onRemoveStaple={handleRemoveStaple}
            grocerySections={grocerySections}
            onCreateSection={handleCreateSection}
            onDeleteSection={handleDeleteSection}
            onReorderSection={handleReorderSection}
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
              setAnchorRecipes([recipe]);
              setActiveRecipe(null);
              setWeekStart(currentWeekStart());
              setTab("planner");
            }}
          />
        )}
      </div>
    </DndContext>
  );
}
