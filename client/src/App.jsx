import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { api } from "./api.js";
import { currentWeekStart, shiftWeek } from "./lib/dates.js";
import { buildGroceryList, capitalize } from "./lib/groceryList.js";
import { coresOnGroceryList, groceryCore } from "./lib/groceryDedupe.js";
import { core, suggestNextRecipes } from "./lib/similarRecipes.js";
import { Home } from "./components/Home.jsx";
import { ManualRecipeForm } from "./components/ManualRecipeForm.jsx";
import { Recipes } from "./components/Recipes.jsx";
import { RecipeDetailModal } from "./components/RecipeDetailModal.jsx";
import { PlannerBoard, PlannerHeader, findNextEmptySlot } from "./components/PlannerBoard.jsx";
import { PlannerSidebar } from "./components/PlannerSidebar.jsx";
import { GroceryList } from "./components/GroceryList.jsx";
import { FlyerDeals } from "./components/FlyerDeals.jsx";
import { WhatCanIMake } from "./components/WhatCanIMake.jsx";
import { Inventory } from "./components/Inventory.jsx";

// Rendered inside <DragOverlay> — a floating copy that actually follows the
// cursor, independent of wherever the real (now-dimmed) source element sits.
// Without this, dnd-kit still tracks the drag internally and drop zones
// still light up correctly, but nothing visibly moves with the pointer —
// which reads as "it doesn't drag, it just highlights where I'm dropping."
function DragPreview({ active }) {
  const recipe = active?.data.current?.recipe;
  const ingredientCore = active?.data.current?.ingredientCore;
  const inventoryItem = active?.data.current?.inventoryItem;

  if (recipe) {
    return (
      <div className="card meal-card compact drag-preview">
        {recipe.photoUrl ? (
          <img className="meal-card-photo" src={recipe.photoUrl} alt="" />
        ) : (
          <div className="meal-card-photo placeholder">no photo</div>
        )}
        <div className="meal-card-body">
          <p className="meal-card-title">{recipe.title}</p>
        </div>
      </div>
    );
  }

  if (ingredientCore) {
    return <div className="drag-preview-chip">{capitalize(ingredientCore)}</div>;
  }

  if (inventoryItem) {
    return <div className="drag-preview-chip">{inventoryItem.name}</div>;
  }

  return null;
}

export default function App({ user, onLogout }) {
  const [tab, setTab] = useState("home"); // "home" | "collection" | "planner"
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef(null);
  useEffect(() => {
    if (!avatarMenuOpen) return undefined;
    const close = (event) => {
      if (!avatarRef.current?.contains(event.target)) setAvatarMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [avatarMenuOpen]);
  // The phone nav is a horizontally scrolling pill row - keep the active pill
  // on screen when the tab changes from elsewhere (e.g. Home's "Open list →").
  useEffect(() => {
    document.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const [recipes, setRecipes] = useState([]);
  const [plannerEntries, setPlannerEntries] = useState([]);
  const [weekStart, setWeekStart] = useState(currentWeekStart()); // Monday, "YYYY-MM-DD" — which week the Planner and Grocery List tabs are showing
  const [activeRecipe, setActiveRecipe] = useState(null);
  // Ingredient names shared with the current week's plan, when the open
  // recipe was opened from a "good next addition" suggestion — null the
  // rest of the time. Set alongside activeRecipe by openRecipe() below.
  const [activeRecipeSharedWith, setActiveRecipeSharedWith] = useState(null);
  // true when the currently-open recipe should skip straight to cook mode —
  // set by Makeable's "Cook tonight" action, cleared on every other open.
  const [activeRecipeStartCooking, setActiveRecipeStartCooking] = useState(false);
  const [planAroundIngredients, setPlanAroundIngredients] = useState([]); // sidebar's "Plan around…" tab — plain ingredient names, not recipes
  const [customStaples, setCustomStaples] = useState([]);
  const [excludedStaples, setExcludedStaples] = useState([]); // cores explicitly removed from the built-in staple list (e.g. "salt")
  const [stapleCategories, setStapleCategories] = useState({}); // core -> "spice" | "other" override
  const [pantryInventory, setPantryInventory] = useState([]);
  const [pantryLocations, setPantryLocations] = useState([]); // user-added storage sections beyond Fridge/Pantry/Freezer
  const [loadError, setLoadError] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeFilter, setRecipeFilter] = useState("All");
  const [plannerExtraItems, setPlannerExtraItems] = useState([]); // manually-added grocery items for weekStart — just for the "Build grocery list · n" count
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState(null); // the dnd-kit `active` object for whatever's currently being dragged, for <DragOverlay>
  // Which droppable id a drag is currently hovering, tracked only to drive
  // the Imported -> Cookbook live-reflow preview below (dnd-kit's own
  // useSortable already handles reflow for same-grid drags on its own).
  const [dragOverId, setDragOverId] = useState(null);

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

  // Loads everything the app needs on first render. Tracked with
  // Promise.allSettled (rather than each call swallowing its own error)
  // so a single failure - a Render cold-start timeout, a network blip - is
  // surfaced with a retry instead of just leaving the app silently empty.
  function loadInitialData() {
    setLoadError(false);
    Promise.allSettled([
      api.listRecipes().then(setRecipes),
      api.listPantryStaples().then((list) => {
        setCustomStaples(list.filter((s) => !s.excluded).map((s) => s.core));
        setExcludedStaples(list.filter((s) => s.excluded).map((s) => s.core));
        setStapleCategories(
          Object.fromEntries(list.filter((s) => s.category).map((s) => [s.core, s.category]))
        );
      }),
      api.listPantryInventory().then(setPantryInventory),
      api.listPantryLocations().then(setPantryLocations),
    ]).then((results) => {
      if (results.some((r) => r.status === "rejected")) setLoadError(true);
    });
  }

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.listPlanner(weekStart).then(setPlannerEntries).catch(() => setLoadError(true));
  }, [weekStart]);

  // Hand-added grocery items for the week. Re-fetched on tab change too,
  // since the Grocery and Home tabs add/remove items through their own
  // state. Drives the "Build grocery list · n" count and the de-duplication
  // below.
  useEffect(() => {
    api.listGroceryExtras(weekStart).then(setPlannerExtraItems).catch(() => setPlannerExtraItems([]));
  }, [weekStart, tab]);

  const groceryCores = coresOnGroceryList(plannerEntries, plannerExtraItems);

  function isOnGroceryList(name) {
    return groceryCores.has(groceryCore(name));
  }

  // Adds only what isn't already on this week's list (from a planned recipe
  // or added earlier), so tapping "+ Add all" twice, or adding an item a
  // planned recipe already needs, never makes a duplicate row.
  async function addToGroceryList(names) {
    const seen = new Set(groceryCores);
    const created = [];
    for (const name of names) {
      const c = groceryCore(name);
      if (seen.has(c)) continue;
      seen.add(c);
      created.push(await api.addGroceryExtra(weekStart, { name, quantity: null, unit: null }));
    }
    if (created.length > 0) setPlannerExtraItems((prev) => [...prev, ...created]);
  }

  // Only hand-added rows can be taken back off - a planned recipe's
  // ingredients stay on the list for as long as it's planned.
  async function removeFromGroceryList(name) {
    const c = groceryCore(name);
    const matches = plannerExtraItems.filter((item) => groceryCore(item.name) === c);
    await Promise.all(matches.map((item) => api.deleteGroceryExtra(item.id)));
    setPlannerExtraItems((prev) => prev.filter((item) => !matches.includes(item)));
  }

  function handleImported(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
  }

  function handleManualCreated(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
  }

  async function handleDeleteRecipe(id) {
    await api.deleteRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setPlannerEntries((prev) => prev.filter((e) => e.recipeId !== id));
  }

  async function handleLogout() {
    await api.logout();
    onLogout();
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

  // Single entry point for opening the recipe detail modal. sharedWith is
  // only ever passed by the "good next addition" suggestion click — every
  // other caller passes just the recipe, which naturally clears any
  // leftover context from a previous suggestion-opened recipe.
  function openRecipe(recipe, sharedWith, startCooking) {
    setActiveRecipe(recipe);
    setActiveRecipeSharedWith(sharedWith || null);
    setActiveRecipeStartCooking(!!startCooking);
  }

  // Keeps the recipes list AND the currently-open modal in sync after an
  // in-modal edit (currently just tags) — otherwise the tag filter bar
  // wouldn't see new tags until a full page reload.
  function handleRecipeUpdated(updated) {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    setActiveRecipe((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }

  async function handleAddPantryItem(item) {
    const created = await api.addPantryInventoryItem(item);
    setPantryInventory((prev) => [...prev, created]);
  }

  async function handleUpdatePantryItem(id, payload) {
    const updated = await api.updatePantryInventoryItem(id, payload);
    setPantryInventory((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  async function handleDeletePantryItem(id) {
    setPantryInventory((prev) => prev.filter((i) => i.id !== id));
    await api.deletePantryInventoryItem(id);
  }

  // "Used up"/"Tossed" on the Inventory page - removes the items like a
  // plain delete, but also logs each removal (see PantryConsumptionLog) so
  // a future waste report has real history.
  async function handleConsumePantryItems(ids, action) {
    const idSet = new Set(ids);
    setPantryInventory((prev) => prev.filter((i) => !idSet.has(i.id)));
    await api.consumePantryInventoryItems(ids, action);
  }

  async function handleAddPantryLocation(name) {
    const created = await api.addPantryLocation(name);
    setPantryLocations((prev) => [...prev, created]);
  }

  // Items still in a deleted section move back to Pantry server-side (see
  // POST /pantry-locations/:id) - mirrored here so the shelves don't show a
  // stale/missing column for them until the next full reload.
  async function handleDeletePantryLocation(id) {
    setPantryLocations((prev) => prev.filter((l) => l.id !== id));
    setPantryInventory((prev) => prev.map((i) => (i.location === id ? { ...i, location: "pantry" } : i)));
    await api.deletePantryLocation(id);
  }

  // Drag a card from one Inventory shelf onto another - the drag-and-drop
  // equivalent of clicking a storage pill in the edit panel, but reachable
  // for any location including a custom section (pills only cover the
  // three USDA-backed ones). Recomputes expiresAt from the target's own
  // USDA range when it's a built-in location with data for this item;
  // dropped onto a custom section (or a built-in one with no data for this
  // item), the date is left as-is rather than guessed.
  async function handleMoveInventoryItem(itemId, newLocation) {
    const item = pantryInventory.find((i) => i.id === itemId);
    if (!item || item.location === newLocation) return;
    const targetData = item.locations?.[newLocation];
    const payload = { location: newLocation, ...(targetData ? { expiresAt: targetData.expiresAt } : {}) };
    setPantryInventory((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...payload } : i)));
    const updated = await api.updatePantryInventoryItem(itemId, payload);
    setPantryInventory((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
  }

  async function handleDragEnd(event) {
    setIsDragActive(false);
    setActiveDragItem(null);
    const { active, over } = event;
    if (!over) return;

    const inventoryItemId = active.data.current?.inventoryItemId;
    if (inventoryItemId) {
      const shelfMatch = /^inv-shelf-(.+)$/.exec(over.id);
      if (shelfMatch) await handleMoveInventoryItem(inventoryItemId, shelfMatch[1]);
      return;
    }

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

    const cellMatch = /^day-(\d)-(breakfast|lunch|dinner)$/.exec(over.id);
    if (!cellMatch) return;

    await handleAddToPlanner(recipeId, Number(cellMatch[1]), cellMatch[2]);
  }

  // Shared by the planner drag-and-drop above and any quick "add to
  // planner" action elsewhere (e.g. the Flyers tab) that isn't dragging
  // onto a visible planner cell.
  async function handleAddToPlanner(recipeId, dayOfWeek, mealType) {
    const entry = await api.placeOnPlanner({ recipeId, weekStart, dayOfWeek, mealType });
    setPlannerEntries((prev) => [...prev, entry]);
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
  }

  // Sets/edits a custom note ("sandwich", "ordering food") on a blank slot.
  // A note lives on a placeholder recipe's title (server-side), not a
  // separate field, so writing one is either placing a new blank/note
  // entry (no entryId yet) or repointing an existing one at a different
  // placeholder recipe (entryId given) - see PUT /api/planner/:id/note.
  async function handleSetPlannerNote({ entryId, dayIndex, mealType, note }) {
    if (entryId) {
      const updated = await api.setPlannerEntryNote(entryId, note);
      setPlannerEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
    } else {
      const entry = await api.markSlotBlank(weekStart, dayIndex, mealType, note);
      setPlannerEntries((prev) => [...prev, entry]);
    }
  }

  async function handleCopyLastWeek() {
    const fromWeekStart = shiftWeek(weekStart, -1);
    const copied = await api.copyPlannerWeek(fromWeekStart, weekStart);
    setPlannerEntries(copied);
  }

  // "Fill empty slots": walks every day/meal slot in order and, for each
  // still-empty one, places whatever suggestNextRecipes says best extends
  // the week's ingredient reuse so far — appending a synthetic (never
  // persisted) entry to a local working copy after each placement so later
  // suggestions in the same pass see it, the same way a person filling the
  // board in by hand would build on their own earlier picks. Falls back to
  // any not-yet-used recipe when there's no shared-ingredient basis yet
  // (e.g. a completely blank week), so the button always does something.
  async function handleFillEmptySlots() {
    if (plannableRecipes.length === 0) return;
    let workingEntries = plannerEntries.map((e) => ({ ...e }));
    let syntheticId = -1;
    for (let i = 0; i < 21; i++) {
      const slot = findNextEmptySlot(workingEntries);
      if (!slot) break;
      const suggestion = suggestNextRecipes(workingEntries, plannableRecipes, 1)[0];
      let picked = suggestion?.recipe;
      if (!picked) {
        const plannedIds = new Set(
          workingEntries.filter((e) => !e.recipe?.isPlaceholder).map((e) => e.recipe?.id)
        );
        picked = plannableRecipes.find((r) => !plannedIds.has(r.id)) || plannableRecipes[0];
      }
      if (!picked) break;
      await handleAddToPlanner(picked.id, slot.dayOfWeek, slot.mealType);
      workingEntries = [
        ...workingEntries,
        {
          id: `fill-temp-${syntheticId--}`,
          recipeId: picked.id,
          recipe: picked,
          dayOfWeek: slot.dayOfWeek,
          mealType: slot.mealType,
          isLeftover: false,
          alreadyHave: false,
        },
      ];
    }
  }

  const plannableRecipes = recipes.filter((r) => !r.isPlaceholder);

  // "Build grocery list · n" in the Planner header — mirrors exactly how
  // GroceryList.jsx derives its own shoppingItems count (just the non-staple
  // items; there's no more manual store-section exclusion), so the number
  // matches once you actually get to the Grocery tab.
  const groceryToBuyCount = buildGroceryList(
    plannerEntries,
    customStaples,
    stapleCategories,
    excludedStaples,
    plannerExtraItems
  ).filter((i) => !i.isStaple).length;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => {
        setIsDragActive(true);
        setActiveDragItem(event.active);
      }}
      onDragOver={(event) => {
        setDragOverId(event.over?.id ?? null);
      }}
      onDragEnd={(event) => {
        setDragOverId(null);
        return handleDragEnd(event);
      }}
      onDragCancel={() => {
        setIsDragActive(false);
        setActiveDragItem(null);
        setDragOverId(null);
      }}
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
        <header className="app-header riso-theme">
          <h1 className="wordmark">
            matt mo <span>cookbook</span>
          </h1>
          <div className="app-header-avatar" ref={avatarRef}>
            <button
              type="button"
              className="app-header-avatar-btn"
              aria-label="Account"
              aria-expanded={avatarMenuOpen}
              onClick={() => setAvatarMenuOpen((open) => !open)}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </button>
            {avatarMenuOpen && (
              <div className="app-header-avatar-menu">
                <span className="app-header-avatar-name">{user.name || user.email}</span>
                <button type="button" className="btn subtle btn-sm" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
          <nav className="tabs">
            <button
              className={`tab${tab === "home" ? " active" : ""}`}
              onClick={() => setTab("home")}
            >
              Home
            </button>
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
              Grocery
            </button>
            <button
              className={`tab${tab === "flyers" ? " active" : ""}`}
              onClick={() => setTab("flyers")}
            >
              Flyers
            </button>
            <button
              className={`tab${tab === "inventory" ? " active" : ""}`}
              onClick={() => setTab("inventory")}
            >
              Inventory
            </button>
          </nav>
          <div className="app-header-account">
            <span className="app-header-account-name">{user.name || user.email}</span>
            <button type="button" className="btn subtle btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        {loadError && (
          <div className="load-error-banner">
            Couldn't load everything — check your connection.
            <button type="button" className="btn subtle btn-sm" onClick={loadInitialData}>
              Try again
            </button>
          </div>
        )}

        {tab === "flyers" && (
          <FlyerDeals
            user={user}
            recipes={recipes}
            customStaples={customStaples}
            weekStart={weekStart}
            onSelectRecipe={openRecipe}
            onAddToPlanner={handleAddToPlanner}
          />
        )}

        {tab === "makeable" && (
          <WhatCanIMake
            user={user}
            recipes={recipes}
            plannerEntries={plannerEntries}
            onSelectRecipe={openRecipe}
            pantryInventory={pantryInventory}
            customStaples={customStaples}
            weekStart={weekStart}
            onAddToPlanner={handleAddToPlanner}
            isOnGroceryList={isOnGroceryList}
            onAddToGroceryList={addToGroceryList}
            onRemoveFromGroceryList={removeFromGroceryList}
          />
        )}

        {tab === "inventory" && (
          <Inventory
            user={user}
            items={pantryInventory}
            onAdd={handleAddPantryItem}
            onUpdate={handleUpdatePantryItem}
            onDelete={handleDeletePantryItem}
            onConsume={handleConsumePantryItems}
            customStaples={customStaples}
            onMarkStaple={handleMarkStaple}
            onUnmarkStaple={handleRemoveStaple}
            recipes={recipes}
            onFindRecipes={(query) => {
              setRecipeSearch(query);
              setRecipeFilter("All");
              setTab("collection");
            }}
            onFindRecipesForSelection={() => setTab("makeable")}
            locations={pantryLocations}
            onAddLocation={handleAddPantryLocation}
            onDeleteLocation={handleDeletePantryLocation}
          />
        )}

        {tab === "home" && (
          <Home
            user={user}
            recipes={recipes}
            customStaples={customStaples}
            excludedStaples={excludedStaples}
            pantryInventory={pantryInventory}
            onNavigate={setTab}
            onSelectRecipe={openRecipe}
            onFindRecipes={(query) => {
              setRecipeSearch(query);
              setRecipeFilter("All");
              setTab("collection");
            }}
          />
        )}

        {tab === "collection" && (
          <Recipes
            user={user}
            recipes={recipes}
            pantryInventory={pantryInventory}
            customStaples={customStaples}
            plannerEntries={plannerEntries}
            search={recipeSearch}
            onSearchChange={setRecipeSearch}
            filter={recipeFilter}
            onFilterChange={setRecipeFilter}
            onSelectRecipe={openRecipe}
            onImported={handleImported}
            onManualCreated={handleManualCreated}
          />
        )}

        {tab === "planner" && (
          <div className="riso-theme riso-planner" data-theme="light">
            {plannableRecipes.length === 0 ? (
              <p className="riso-planner-empty">
                Import or add a recipe first, then click a meal slot here to add it.
              </p>
            ) : (
              <>
                <PlannerHeader
                  user={user}
                  weekStart={weekStart}
                  onChangeWeek={setWeekStart}
                  hasEntries={plannerEntries.length > 0}
                  onCopyLastWeek={handleCopyLastWeek}
                  onFillEmptySlots={handleFillEmptySlots}
                  fillDisabled={plannableRecipes.length === 0}
                  groceryCount={groceryToBuyCount}
                  onGoToGrocery={() => setTab("grocery")}
                />
                <div className="riso-planner-row">
                  <PlannerBoard
                    entries={plannerEntries}
                    weekStart={weekStart}
                    plannableRecipes={plannableRecipes}
                    onCardClick={openRecipe}
                    onRemove={handleRemoveFromPlanner}
                    onCycleState={handleCycleMealState}
                    onMarkBlank={handleMarkBlank}
                    onSetNote={handleSetPlannerNote}
                    onAddToPlanner={handleAddToPlanner}
                  />
                  <PlannerSidebar
                    plannerEntries={plannerEntries}
                    allRecipes={recipes}
                    planAroundIngredients={planAroundIngredients}
                    onAddIngredient={(name) =>
                      setPlanAroundIngredients((prev) => (prev.includes(name) ? prev : [...prev, name]))
                    }
                    onRemoveIngredient={(name) =>
                      setPlanAroundIngredients((prev) => prev.filter((n) => n !== name))
                    }
                    onSetIngredients={setPlanAroundIngredients}
                    pantryInventory={pantryInventory}
                    onSelectRecipe={openRecipe}
                    onQuickAdd={(recipe, dayOfWeek, mealType) => handleAddToPlanner(recipe.id, dayOfWeek, mealType)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {tab === "grocery" && (
          <GroceryList
            user={user}
            plannerEntries={plannerEntries}
            weekStart={weekStart}
            customStaples={customStaples}
            excludedStaples={excludedStaples}
            stapleCategories={stapleCategories}
            onAddPantryItem={handleAddPantryItem}
          />
        )}

        {activeRecipe && (
          <RecipeDetailModal
            recipe={activeRecipe}
            sharedWithWeek={activeRecipeSharedWith}
            startInCookMode={activeRecipeStartCooking}
            onClose={() => openRecipe(null)}
            allRecipes={recipes}
            plannerEntries={plannerEntries}
            pantryInventory={pantryInventory}
            customStaples={customStaples}
            weekStart={weekStart}
            onSelectRecipe={openRecipe}
            onRecipeUpdated={handleRecipeUpdated}
            onDelete={async (id) => {
              await handleDeleteRecipe(id);
              openRecipe(null);
            }}
            onPlanAround={(recipe) => {
              // Seed "Plan around…" with this recipe's non-staple ingredient
              // names, deduped by canonical core — the sidebar tab works
              // off plain ingredient names now, not recipe anchors.
              const seen = new Set();
              const names = [];
              for (const ing of recipe.ingredients || []) {
                const c = core(ing.name);
                if (!c || seen.has(c)) continue;
                seen.add(c);
                names.push(capitalize(c));
              }
              setPlanAroundIngredients(names);
              openRecipe(null);
              setWeekStart(currentWeekStart());
              setTab("planner");
            }}
            onAddPantryItem={handleAddPantryItem}
            onDeletePantryItem={handleDeletePantryItem}
            onAddToGroceryList={addToGroceryList}
            onNavigate={(t) => {
              openRecipe(null);
              setTab(t);
            }}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragItem && <DragPreview active={activeDragItem} />}
      </DragOverlay>
    </DndContext>
  );
}
