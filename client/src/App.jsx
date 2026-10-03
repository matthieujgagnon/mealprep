import { clearDeals } from "./lib/dealsStore.js";
import { groceryShared } from "./lib/groceryCache.js";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { api } from "./api.js";
import { t } from "./i18n/index.js";
import { LanguageSwitch } from "./components/RisoControls.jsx";
import { currentWeekStart, shiftWeek } from "./lib/dates.js";
import { buildGroceryList, capitalize } from "./lib/groceryList.js";
import { coresOnGroceryList, groceryCore, removedRecipeRows } from "./lib/groceryDedupe.js";
import { core } from "./lib/similarRecipes.js";
import { Home } from "./components/Home.jsx";
import { RecipeEditor } from "./components/RecipeEditor.jsx";
import { Recipes } from "./components/Recipes.jsx";
import { RecipeDetailModal } from "./components/RecipeDetailModal.jsx";
import { PlannerBoard, PlannerHeader } from "./components/PlannerBoard.jsx";
import { PlannerTray } from "./components/PlannerTray.jsx";
import { PlannerMobile } from "./components/PlannerMobile.jsx";
import { useIsPhone } from "./hooks/useIsPhone.js";
import { emptyUpcomingSlots, findNextEmptySlot, isCustomNote, todayIndex } from "./lib/plannerSlots.js";
import { isBreakfastRecipe, isPrepRecipe, isSideRecipe, rankRecipesForTray } from "./lib/plannerSuggestions.js";
import { haveCoresFor } from "./lib/onHand.js";
import { GroceryList } from "./components/GroceryList.jsx";
import { FlyerDeals } from "./components/FlyerDeals.jsx";
import { WhatCanIMake } from "./components/WhatCanIMake.jsx";
import { Inventory, InventoryDragPreview } from "./components/Inventory.jsx";

// Rendered inside <DragOverlay> — a floating copy that actually follows the
// cursor, independent of wherever the real (now-dimmed) source element sits.
// Without this, dnd-kit still tracks the drag internally and drop zones
// still light up correctly, but nothing visibly moves with the pointer —
// which reads as "it doesn't drag, it just highlights where I'm dropping."
function DragPreview({ active }) {
  const recipe = active?.data.current?.recipe;
  const ingredientCore = active?.data.current?.ingredientCore;
  const inventoryItem = active?.data.current?.inventoryItem;

  if (recipe && (active.data.current?.entryId || active.data.current?.fromTray)) {
    if (recipe.isPlaceholder) {
      return (
        <div className="riso-theme riso-planner-drag-preview note">
          <span className="riso-planner-note-label">{t("app.dragNote")}</span>
          <span className="riso-planner-note-text">
            {recipe.title === "No meal planned" ? t("app.skipped") : recipe.title}
          </span>
        </div>
      );
    }
    return (
      <div className="riso-theme riso-planner-drag-preview">
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" /> : <span className="photo-placeholder" />}
        <span className="riso-planner-drag-preview-name">{recipe.title}</span>
      </div>
    );
  }

  if (recipe) {
    return (
      <div className="card meal-card compact drag-preview">
        {recipe.photoUrl ? (
          <img className="meal-card-photo" src={recipe.photoUrl} alt="" />
        ) : (
          <div className="meal-card-photo placeholder">{t("app.noPhoto")}</div>
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
    return <InventoryDragPreview item={inventoryItem} />;
  }

  return null;
}

// Only a drop target actually visible under the pointer counts. dnd-kit's
// default (largest overlap with the dragged box) picked the wrong slot for
// anything wider than a slot, and a plain point-in-rect test still "hits"
// targets clipped out of view: the Planner's Saturday/Sunday slots sit under
// the tray, so starting a drag there made them the target, dnd-kit
// auto-scrolled the board toward the weekend, and the drop landed two days
// off. elementsFromPoint skips clipped content. Sortable lists keep the
// overlap fallback so the preview doesn't flicker in the gaps between items.
function collisionDetection(args) {
  const { pointerCoordinates, droppableContainers, active } = args;
  if (pointerCoordinates) {
    const under = document.elementsFromPoint(pointerCoordinates.x, pointerCoordinates.y);
    const visible = droppableContainers.filter(
      (c) => c.node.current && under.some((el) => c.node.current.contains(el))
    );
    const hits = pointerWithin({ ...args, droppableContainers: visible });
    if (hits.length > 0 || !active.data.current?.sortable) return hits;
  }
  return rectIntersection(args);
}

export default function App({ user, onLogout }) {
  const [tab, setTab] = useState("home"); // "home" | "collection" | "planner"
  const isPhone = useIsPhone();
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
  const [planAroundIngredients, setPlanAroundIngredients] = useState([]);
  const [plannerTarget, setPlannerTarget] = useState(null); // selected slot { dayOfWeek, mealType, note? }
  const [editingNoteId, setEditingNoteId] = useState(null); // blank/written card being typed on
  const [plannerTrayTab, setPlannerTrayTab] = useState("suggested");
  const [trayMessage, setTrayMessage] = useState(null);
  useEffect(() => {
    if (!plannerTarget) return undefined;
    const onKey = (e) => e.key === "Escape" && setPlannerTarget(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [plannerTarget]); // sidebar's "Plan around…" tab — plain ingredient names, not recipes
  const [customStaples, setCustomStaples] = useState([]);
  const [excludedStaples, setExcludedStaples] = useState([]); // cores explicitly removed from the built-in staple list (e.g. "salt")
  const [stapleCategories, setStapleCategories] = useState({}); // core -> "spice" | "other" override
  const [pantryInventory, setPantryInventory] = useState([]);
  const [pantryLocations, setPantryLocations] = useState([]); // user-added storage sections beyond Fridge/Pantry/Freezer
  const [inventoryLayout, setInventoryLayout] = useState([]); // section order/size/built-in names (InventorySectionLayout)
  const [loadError, setLoadError] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeFilter, setRecipeFilter] = useState("all");
  // The full-page recipe editor on the Recipes tab: { recipe } to edit one,
  // { recipe: null } for a new one, null when closed.
  const [recipeEditor, setRecipeEditor] = useState(null);
  const editorDirty = useRef(false);
  const [plannerExtraItems, setPlannerExtraItems] = useState([]); // manually-added grocery items for weekStart
  const [groceryOverrides, setGroceryOverrides] = useState([]); // this week's removed rows / own quantities (GroceryItemOverride)
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
      api.getInventoryLayout().then(setInventoryLayout),
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
  // state. Drives the grocery de-duplication below.
  useEffect(() => {
    api.listGroceryExtras(weekStart).then(setPlannerExtraItems).catch(() => setPlannerExtraItems([]));
    api.listGroceryOverrides(weekStart).then(setGroceryOverrides).catch(() => setGroceryOverrides([]));
  }, [weekStart, tab]);

  const groceryCores = coresOnGroceryList(plannerEntries, plannerExtraItems, groceryOverrides);

  function isOnGroceryList(name) {
    return groceryCores.has(groceryCore(name));
  }

  // Adds only what isn't already on this week's list (from a planned recipe
  // or added earlier), so tapping "+ Add all" twice, or adding an item a
  // planned recipe already needs, never makes a duplicate row.
  async function addToGroceryList(names) {
    const seen = new Set(groceryCores);
    const removedRows = removedRecipeRows(plannerEntries, groceryOverrides);
    const created = [];
    for (const name of names) {
      const c = groceryCore(name);
      if (seen.has(c)) continue;
      seen.add(c);
      if (removedRows.has(c)) {
        // A planned recipe already needs it but it was removed for this
        // week - bring that row back rather than adding a second one.
        await setGroceryOverride(removedRows.get(c), { removed: false });
        continue;
      }
      created.push(await api.addGroceryExtra(weekStart, { name, quantity: null, unit: null }));
    }
    if (created.length > 0) setPlannerExtraItems((prev) => [...prev, ...created]);
  }

  async function setGroceryOverride(key, patch) {
    const saved = await api.setGroceryOverride(weekStart, key, patch);
    setGroceryOverrides((prev) => [...prev.filter((o) => o.key !== key), ...(saved ? [saved] : [])]);
  }

  // Hand-added rows are deleted; a planned recipe's row is removed for this
  // week only (the recipe itself is untouched).
  async function removeFromGroceryList(name) {
    const c = groceryCore(name);
    const matches = plannerExtraItems.filter((item) => groceryCore(item.name) === c);
    await Promise.all(matches.map((item) => api.deleteGroceryExtra(item.id)));
    setPlannerExtraItems((prev) => prev.filter((item) => !matches.includes(item)));
    const recipeRow = buildGroceryList(plannerEntries, [], {}, [], [], groceryOverrides).find(
      (item) => item.core === c && !item.removed
    );
    if (recipeRow) await setGroceryOverride(recipeRow.key, { removed: true });
  }

  function handleImported(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
  }

  function openRecipeEditor(recipe) {
    editorDirty.current = false;
    setActiveRecipe(null);
    setRecipeEditor({ recipe: recipe || null });
    setTab("collection");
  }

  // An edit goes back to the recipe's card (where it was opened from); a
  // new recipe goes back to the list, where it now sits first.
  function handleEditorSaved(saved, isNew) {
    setRecipeEditor(null);
    if (isNew) {
      setRecipes((prev) => [saved, ...prev]);
      return;
    }
    setRecipes((prev) => prev.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)));
    openRecipe(saved);
  }

  function handleEditorCancel() {
    const editing = recipeEditor?.recipe;
    setRecipeEditor(null);
    if (editing) openRecipe(recipes.find((r) => r.id === editing.id) || editing);
  }

  // Header nav: leaving the editor with unsaved changes asks first.
  function goToTab(next) {
    if (recipeEditor && editorDirty.current && !window.confirm(t("app.leaveUnsaved"))) return;
    setRecipeEditor(null);
    editorDirty.current = false;
    setTab(next);
  }

  async function handleDeleteRecipe(id) {
    await api.deleteRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setPlannerEntries((prev) => prev.filter((e) => e.recipeId !== id));
  }

  async function handleLogout() {
    await api.logout();
    clearDeals();
    groceryShared.sections = null;
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
    return created;
  }

  // Items still in a deleted section move back to Pantry server-side (see
  // POST /pantry-locations/:id) - mirrored here so the shelves don't show a
  // stale/missing column for them until the next full reload.
  async function handleDeletePantryLocation(id) {
    setPantryLocations((prev) => prev.filter((l) => l.id !== id));
    setPantryInventory((prev) => prev.map((i) => (i.location === id ? { ...i, location: "pantry" } : i)));
    setInventoryLayout((prev) => prev.filter((s) => s.sectionId !== id));
    await api.deletePantryLocation(id);
  }

  async function handleRenamePantryLocation(id, name) {
    const saved = await api.renamePantryLocation(id, name);
    setPantryLocations((prev) => prev.map((l) => (l.id === id ? saved : l)));
  }

  // Optimistic - the new order/sizes show right away; a failed save
  // restores the previous layout.
  // Saves go out one at a time, in order (a rename then a quick drag used to
  // race each other); only the newest one's answer is applied.
  const layoutSaves = useRef({ chain: Promise.resolve(), latest: 0 });
  function handleSaveInventoryLayout(sections) {
    const prev = inventoryLayout;
    setInventoryLayout(sections.map((s, position) => ({ ...s, sectionId: s.sectionId, position })));
    const ticket = ++layoutSaves.current.latest;
    layoutSaves.current.chain = layoutSaves.current.chain.then(async () => {
      try {
        const saved = await api.saveInventoryLayout(sections);
        if (ticket === layoutSaves.current.latest) setInventoryLayout(saved);
      } catch {
        if (ticket === layoutSaves.current.latest) setInventoryLayout(prev);
      }
    });
    return layoutSaves.current.chain;
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

    const cellMatch = /^day-(\d)-(breakfast|lunch|dinner)$/.exec(over.id);
    if (!cellMatch) return;
    const slot = { dayOfWeek: Number(cellMatch[1]), mealType: cellMatch[2] };

    // A meal or note dragged between slots: the two slots swap.
    const entryId = active.data.current?.entryId;
    if (entryId) {
      await handleMoveEntry(entryId, slot);
      return;
    }

    // A recipe dragged in from the tray replaces whatever was in the slot.
    const recipeId = active.data.current?.recipe?.id;
    if (recipeId) await handlePlaceRecipe(recipeId, slot);
  }

  function entriesInSlot(slot) {
    return plannerEntries.filter((e) => e.dayOfWeek === slot.dayOfWeek && e.mealType === slot.mealType);
  }

  // One thing per slot: placing a recipe replaces whatever was there.
  async function handlePlaceRecipe(recipeId, slot) {
    const existing = entriesInSlot(slot);
    await Promise.all(existing.map((e) => api.removeFromPlanner(e.id)));
    const entry = await api.placeOnPlanner({ recipeId, weekStart, ...slot });
    setPlannerEntries((prev) => [...prev.filter((e) => !existing.includes(e)), entry]);
  }

  async function handleMoveEntry(entryId, slot) {
    const moving = plannerEntries.find((e) => e.id === entryId);
    if (!moving || (moving.dayOfWeek === slot.dayOfWeek && moving.mealType === slot.mealType)) return;
    const from = { dayOfWeek: moving.dayOfWeek, mealType: moving.mealType };
    const displaced = entriesInSlot(slot);
    await Promise.all([
      api.updatePlannerEntry(entryId, slot),
      ...displaced.map((e) => api.updatePlannerEntry(e.id, from)),
    ]);
    setPlannerEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, ...slot } : displaced.includes(e) ? { ...e, ...from } : e))
    );
  }

  // The tray's "+": the selected slot if there is one, otherwise the next
  // empty upcoming slot (dinner first).
  async function handlePlaceFromTray(recipe) {
    const slot = plannerTarget || findNextEmptySlot(plannerEntries, weekStart);
    if (!slot) {
      setTrayMessage(t("app.slotsFull"));
      return;
    }
    setTrayMessage(null);
    await handlePlaceRecipe(recipe.id, slot);
    setPlannerTarget(null);
  }

  async function handleSaveTrayNote(note) {
    if (!plannerTarget) return;
    const slot = { dayOfWeek: plannerTarget.dayOfWeek, mealType: plannerTarget.mealType };
    const existing = entriesInSlot(slot);
    const existingNote = existing.find((e) => e.recipe?.isPlaceholder);
    const others = existing.filter((e) => e !== existingNote);
    await Promise.all(others.map((e) => api.removeFromPlanner(e.id)));
    let saved;
    if (existingNote) saved = await api.setPlannerEntryNote(existingNote.id, note);
    else saved = await api.markSlotBlank(weekStart, slot.dayOfWeek, slot.mealType, note);
    setPlannerEntries((prev) => [
      ...prev.filter((e) => !others.includes(e) && e !== existingNote),
      saved,
    ]);
    setPlannerTarget(null);
  }

  // Clicking an empty slot turns it into a blank card to write on. The card
  // (and its text box) shows at once, so nothing typed is lost while the
  // server saves it; the real entry swaps in underneath when it arrives.
  const pendingBlanks = useRef(new Map()); // temp id -> Promise<saved entry>
  function handleWriteInSlot(slot) {
    const tempId = `pending-${Date.now()}`;
    const temp = {
      id: tempId,
      weekStart,
      ...slot,
      recipe: { id: null, title: "No meal planned", isPlaceholder: true, ingredients: [] },
    };
    setPlannerEntries((prev) => [...prev, temp]);
    setEditingNoteId(tempId);
    const created = api.markSlotBlank(weekStart, slot.dayOfWeek, slot.mealType);
    pendingBlanks.current.set(tempId, created);
    created
      .then((saved) => {
        setPlannerEntries((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
        setEditingNoteId((id) => (id === tempId ? saved.id : id));
      })
      .catch(() => setPlannerEntries((prev) => prev.filter((e) => e.id !== tempId)))
      .finally(() => pendingBlanks.current.delete(tempId));
  }

  // Saves what was typed on a blank/written card ("" leaves it blank).
  async function handleSaveNote(entryId, text) {
    setEditingNoteId((id) => (id === entryId ? null : id));
    let id = entryId;
    let entry = plannerEntries.find((e) => e.id === entryId);
    if (pendingBlanks.current.has(entryId)) {
      entry = await pendingBlanks.current.get(entryId);
      id = entry.id;
    }
    const next = text.trim();
    const current = entry && isCustomNote(entry) ? entry.recipe.title : "";
    if (!entry || next === current) return;
    // Shown right away; the server copy replaces it.
    setPlannerEntries((prev) =>
      prev.map((e) =>
        e.id === id || e.id === entryId ? { ...e, recipe: { ...e.recipe, title: next || "No meal planned" } } : e
      )
    );
    const saved = await api.setPlannerEntryNote(id, next);
    setPlannerEntries((prev) => prev.map((e) => (e.id === id ? saved : e)));
  }

  async function handleRemoveFromPlanner(entryId) {
    setPlannerEntries((prev) => prev.filter((e) => e.id !== entryId));
    const pending = pendingBlanks.current.get(entryId);
    const id = pending ? (await pending).id : entryId;
    setPlannerEntries((prev) => prev.filter((e) => e.id !== id));
    await api.removeFromPlanner(id);
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

  // Cook mode's "Save leftovers" (fridge): each portion becomes a leftover
  // lunch over the next few days - inside the 3-4 day fridge window - in
  // whatever lunch slots are still empty this week.
  async function handlePlanLeftovers(recipe, portions) {
    const week = currentWeekStart();
    const entries = week === weekStart ? plannerEntries : await api.listPlanner(week);
    const filled = new Set(entries.map((e) => `${e.dayOfWeek}-${e.mealType}`));
    const today = todayIndex();
    const days = [];
    for (let d = today + 1; d <= Math.min(6, today + 3) && days.length < portions; d++) {
      if (!filled.has(`${d}-lunch`)) days.push(d);
    }
    const created = await Promise.all(
      days.map((dayOfWeek) =>
        api.placeOnPlanner({ recipeId: recipe.id, weekStart: week, dayOfWeek, mealType: "lunch", isLeftover: true })
      )
    );
    if (week === weekStart) setPlannerEntries((prev) => [...prev, ...created]);
  }

  async function handleCopyLastWeek() {
    const fromWeekStart = shiftWeek(weekStart, -1);
    const copied = await api.copyPlannerWeek(fromWeekStart, weekStart);
    setPlannerEntries(copied);
  }

  const plannableRecipes = recipes.filter((r) => !r.isPlaceholder);
  const upcomingPlannerEntries = plannerEntries.filter(
    (e) => weekStart !== currentWeekStart() || e.dayOfWeek >= todayIndex()
  );
  const pantryHaveCores = haveCoresFor(pantryInventory, customStaples);
  const fillPlan = planFill();

  // "Fill empty slots": every empty upcoming slot gets the best-ranked recipe
  // (the tray's own ranking), breakfast slots from breakfast-tagged recipes,
  // cycling so one recipe isn't repeated all week. Breakfast slots stay
  // empty when there are no breakfast recipes.
  function planFill() {
    const empty = emptyUpcomingSlots(plannerEntries, weekStart);
    if (empty.length === 0 || plannableRecipes.length === 0) return [];
    const { ranked } = rankRecipesForTray({
      recipes: plannableRecipes,
      upcomingEntries: upcomingPlannerEntries,
      pantryInventory,
      haveCores: pantryHaveCores,
    });
    const breakfast = ranked.filter((x) => isBreakfastRecipe(x.recipe));
    const other = ranked.filter((x) => !isBreakfastRecipe(x.recipe) && !isPrepRecipe(x.recipe) && !isSideRecipe(x.recipe));
    const mains = other.length > 0 ? other : ranked.filter((x) => !isPrepRecipe(x.recipe) && !isSideRecipe(x.recipe));
    let b = 0;
    let o = 0;
    const plan = [];
    for (const slot of empty) {
      if (slot.mealType === "breakfast") {
        if (breakfast.length === 0) continue;
        plan.push({ slot, recipe: breakfast[b++ % breakfast.length].recipe });
      } else {
        if (mains.length === 0) continue;
        plan.push({ slot, recipe: mains[o++ % mains.length].recipe });
      }
    }
    return plan;
  }

  const trayProps = {
    recipes: plannableRecipes,
    upcomingEntries: upcomingPlannerEntries,
    pantryInventory,
    haveCores: pantryHaveCores,
    onClearTarget: () => setPlannerTarget(null),
    onPlaceRecipe: handlePlaceFromTray,
    onSaveNote: handleSaveTrayNote,
    onOpenRecipe: openRecipe,
    tab: plannerTrayTab,
    onTabChange: setPlannerTrayTab,
    picks: planAroundIngredients,
    onPicksChange: setPlanAroundIngredients,
    message: trayMessage,
  };

  async function handleFillEmptySlots() {
    const created = await Promise.all(
      fillPlan.map(({ slot, recipe }) => api.placeOnPlanner({ recipeId: recipe.id, weekStart, ...slot }))
    );
    setPlannerEntries((prev) => [...prev, ...created]);
    setPlannerTarget(null);
  }


  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ threshold: { x: 0.06, y: 0.12 } }}
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
              aria-label={t("app.account")}
              aria-expanded={avatarMenuOpen}
              onClick={() => setAvatarMenuOpen((open) => !open)}
            >
              {(user.name || user.email).charAt(0).toUpperCase()}
            </button>
            {avatarMenuOpen && (
              <div className="app-header-avatar-menu">
                <span className="app-header-avatar-name">{user.name || user.email}</span>
                <LanguageSwitch />
                <button type="button" className="btn subtle btn-sm" onClick={handleLogout}>
                  {t("app.logOut")}
                </button>
              </div>
            )}
          </div>
          <nav className="tabs" aria-label={t("app.nav.label")}>
            <button
              className={`tab${tab === "home" ? " active" : ""}`}
              onClick={() => goToTab("home")}
            >
              {t("app.nav.home")}
            </button>
            <button
              className={`tab${tab === "collection" ? " active" : ""}`}
              onClick={() => goToTab("collection")}
            >
              {t("app.nav.recipes")}
            </button>
            <button
              className={`tab${tab === "planner" ? " active" : ""}`}
              onClick={() => goToTab("planner")}
            >
              {t("app.nav.planner")}
            </button>
            <button
              className={`tab${tab === "makeable" ? " active" : ""}`}
              onClick={() => goToTab("makeable")}
            >
              {t("app.nav.makeable")}
            </button>
            <button
              className={`tab${tab === "grocery" ? " active" : ""}`}
              onClick={() => goToTab("grocery")}
            >
              {t("app.nav.grocery")}
            </button>
            <button
              className={`tab${tab === "flyers" ? " active" : ""}`}
              onClick={() => goToTab("flyers")}
            >
              {t("app.nav.flyers")}
            </button>
            <button
              className={`tab${tab === "inventory" ? " active" : ""}`}
              onClick={() => goToTab("inventory")}
            >
              {t("app.nav.inventory")}
            </button>
          </nav>
          <div className="app-header-account">
            <LanguageSwitch />
            <span className="app-header-account-name">{user.name || user.email}</span>
            <button type="button" className="btn subtle btn-sm" onClick={handleLogout}>
              {t("app.logOut")}
            </button>
          </div>
        </header>

        {loadError && (
          <div className="load-error-banner">
            {t("app.loadError")}
            <button type="button" className="btn subtle btn-sm" onClick={loadInitialData}>
              {t("app.tryAgain")}
            </button>
          </div>
        )}

        {tab === "flyers" && (
          <FlyerDeals
            user={user}
            recipes={recipes}
            customStaples={customStaples}
            isOnGroceryList={isOnGroceryList}
            onAddToGroceryList={addToGroceryList}
            onRemoveFromGroceryList={removeFromGroceryList}
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
            onPlaceOnPlanner={handlePlaceRecipe}
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
              setRecipeFilter("all");
              setTab("collection");
            }}
            onFindRecipesForSelection={() => setTab("makeable")}
            locations={pantryLocations}
            layout={inventoryLayout}
            onSaveLayout={handleSaveInventoryLayout}
            onAddLocation={handleAddPantryLocation}
            onRenameLocation={handleRenamePantryLocation}
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
              setRecipeFilter("all");
              setTab("collection");
            }}
            onPickRecipeFor={(slot) => {
              setWeekStart(currentWeekStart());
              setPlannerTarget(slot);
              setTrayMessage(null);
              setTab("planner");
            }}
            isOnGroceryList={isOnGroceryList}
            onAddToGroceryList={addToGroceryList}
          />
        )}

        {tab === "collection" && recipeEditor && (
          <RecipeEditor
            key={recipeEditor.recipe?.id || "new"}
            recipe={recipeEditor.recipe}
            pantryInventory={pantryInventory}
            customStaples={customStaples}
            onSaved={handleEditorSaved}
            onCancel={handleEditorCancel}
            onDirtyChange={(d) => {
              editorDirty.current = d;
            }}
          />
        )}

        {tab === "collection" && !recipeEditor && (
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
            onNewRecipe={() => openRecipeEditor(null)}
          />
        )}

        {tab === "planner" && (
          <div className="riso-theme riso-planner" data-theme="light">
            {plannableRecipes.length === 0 ? (
              <p className="riso-planner-empty">{t("app.plannerEmpty")}</p>
            ) : (
              <>
                {isPhone ? (
                  <PlannerMobile
                    entries={plannerEntries}
                    weekStart={weekStart}
                    onChangeWeek={(w) => {
                      setWeekStart(w);
                      setPlannerTarget(null);
                    }}
                    haveCores={pantryHaveCores}
                    target={plannerTarget}
                    onSelectSlot={(slot) => {
                      setPlannerTarget(slot);
                      setTrayMessage(null);
                    }}
                    onCardClick={openRecipe}
                    onRemove={handleRemoveFromPlanner}
                    onCycleState={handleCycleMealState}
                    editingNoteId={editingNoteId}
                    onWriteInSlot={handleWriteInSlot}
                    onEditNote={setEditingNoteId}
                    onSaveNote={handleSaveNote}
                    emptyCount={fillPlan.length}
                    onFillEmptySlots={handleFillEmptySlots}
                    trayProps={trayProps}
                  />
                ) : (
                  <>
                    <PlannerHeader
                      user={user}
                      weekStart={weekStart}
                      onChangeWeek={(w) => {
                        setWeekStart(w);
                        setPlannerTarget(null);
                      }}
                      hasEntries={plannerEntries.length > 0}
                      onCopyLastWeek={handleCopyLastWeek}
                      emptyCount={fillPlan.length}
                      onFillEmptySlots={handleFillEmptySlots}
                    />
                    <div className="riso-planner-row">
                      <PlannerBoard
                        entries={plannerEntries}
                        weekStart={weekStart}
                        onCardClick={openRecipe}
                        onRemove={handleRemoveFromPlanner}
                        onCycleState={handleCycleMealState}
                        editingNoteId={editingNoteId}
                        onWriteInSlot={handleWriteInSlot}
                        onEditNote={setEditingNoteId}
                        onSaveNote={handleSaveNote}
                      />
                      <PlannerTray {...trayProps} target={plannerTarget} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === "grocery" && (
          <GroceryList
            user={user}
            plannerEntries={plannerEntries}
            weekStart={weekStart}
            onChangeWeek={setWeekStart}
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
            onEdit={openRecipeEditor}
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
              setPlannerTrayTab("around");
              openRecipe(null);
              setWeekStart(currentWeekStart());
              setTab("planner");
            }}
            onAddPantryItem={handleAddPantryItem}
            onDeletePantryItem={handleDeletePantryItem}
            onAddToGroceryList={addToGroceryList}
            onConsumePantryItems={handleConsumePantryItems}
            onPlanLeftovers={handlePlanLeftovers}
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
