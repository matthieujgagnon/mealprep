import { clearDeals, useDeals } from "./lib/dealsStore.js";
import { useFinder } from "./hooks/useFinder.js";
import { useShowSales } from "./hooks/useShowSales.js";
import { clearGroceryShared } from "./lib/groceryCache.js";
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
import { getEventCoordinates } from "@dnd-kit/utilities";
import { api } from "./api.js";
import { dict, t } from "./i18n/index.js";
import { LanguageSwitch } from "./components/RisoControls.jsx";
import { currentWeekStart, isPastDay, shiftWeek, toDateKey } from "./lib/dates.js";
import { buildGroceryList, capitalize } from "./lib/groceryList.js";
import { coresOnGroceryList, groceryCore, newGroceryItemCount, removedRecipeRows } from "./lib/groceryDedupe.js";
import { Help } from "./components/Help.jsx";
import { Home } from "./components/Home.jsx";
import { RecipeEditor } from "./components/RecipeEditor.jsx";
import { Recipes } from "./components/Recipes.jsx";
import { RecipeDetailModal } from "./components/RecipeDetailModal.jsx";
import { Planner } from "./components/Planner.jsx";
import { Toast } from "./components/Toast.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";
import { RecipePopoutHost } from "./components/RecipePopout.jsx";
import { SlotPicker } from "./components/SlotPicker.jsx";
import { weekendFrom } from "./lib/weekend.js";
import { useIsPhone } from "./hooks/useIsPhone.js";
import { useHeaderTightness } from "./hooks/useHeaderTightness.js";
import { entriesOnDay, findNextEmptySlot, isCustomNote, slotLabel, todayIndex } from "./lib/plannerSlots.js";
import { haveCoresFor } from "./lib/onHand.js";
import { GroceryList } from "./components/GroceryList.jsx";
import { FlyerDeals } from "./components/FlyerDeals.jsx";
import { Makeable } from "./components/Makeable.jsx";
import { Inventory, InventoryDragPreview, shelfOptions } from "./components/Inventory.jsx";
import { InventoryConfirmSheet } from "./components/InventoryConfirm.jsx";
import { TRASH_ID } from "./components/TrashZone.jsx";

// Rendered inside <DragOverlay> — a floating copy that actually follows the
// cursor, independent of wherever the real (now-dimmed) source element sits.
// Without this, dnd-kit still tracks the drag internally and drop zones
// still light up correctly, but nothing visibly moves with the pointer —
// which reads as "it doesn't drag, it just highlights where I'm dropping."
function DragPreview({ active, copy = false }) {
  const recipe = active?.data.current?.recipe;
  const ingredientCore = active?.data.current?.ingredientCore;
  const inventoryItem = active?.data.current?.inventoryItem;

  // A grocery item carried in Store mode.
  const storeDrag = active?.data.current?.storeDrag;
  if (storeDrag) {
    return <div className="drag-preview-chip store-drag-chip">{storeDrag.name}</div>;
  }

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
      <div className={`riso-theme riso-planner-drag-preview${copy ? " copy" : ""}`}>
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
    // A grocery item carried in Store mode lands on whatever is on top under the
    // finger: a store's sticky sticker stays over the rows of the next store.
    if (active.data.current?.storeDrag) {
      for (const el of under) {
        const top = visible.find((c) => c.node.current.contains(el));
        if (top) return [{ id: top.id, data: { droppableContainer: top } }];
      }
      return [];
    }
    const hits = pointerWithin({ ...args, droppableContainers: visible });
    if (hits.length > 0 || !active.data.current?.sortable) return hits;
  }
  return rectIntersection(args);
}

// The grocery item carried in Store mode is a small chip, held just above the
// finger (the overlay is as wide as the row it came from, so it would otherwise
// slide off the screen as the finger moves).
function centreAboveFinger({ activatorEvent, draggingNodeRect, transform }) {
  const start = activatorEvent && getEventCoordinates(activatorEvent);
  if (!start || !draggingNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2 - 44,
  };
}

export default function App({ user, onLogout }) {
  const [tab, setTab] = useState("home"); // "home" | "collection" | "planner" | ... | "help" (not in the nav: opened from the account area)
  const isPhone = useIsPhone();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef(null);
  const headerRef = useRef(null);
  // On a computer the header tightens, as far as it takes, to stay on one row
  // with the logo, the tabs, FR | EN and the avatar. The key is what changes
  // how wide the tabs are.
  const headerLevel = useHeaderTightness(headerRef, {
    enabled: !isPhone,
    resetKey: t("app.nav.planner"),
  });
  useEffect(() => {
    if (!avatarMenuOpen) return undefined;
    const close = (event) => {
      if (!avatarRef.current?.contains(event.target)) setAvatarMenuOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setAvatarMenuOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
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
  // The shared recipe pop-out (one for every page): { recipeId, from } or null.
  const [popout, setPopout] = useState(null);
  // The shared slot picker: { recipe } while it is open.
  const [pickerFor, setPickerFor] = useState(null);
  const [plannerMainId, setPlannerMainId] = useState(null); // a recipe to open the Planner's finder on as its Main meal ("Plan around this")
  const [plannerTarget, setPlannerTarget] = useState(null); // the slot the finder is adding to { dayOfWeek, mealType }
  // The Planner's weekend ({ on, days, eve }; days 0 = Monday), saved with the
  // account so every device shows the same.
  const [weekend, setWeekend] = useState(() => weekendFrom(user));
  const [toast, setToast] = useState(null); // { id, message, undo? } the one toast (with Undo) at the bottom of every page
  const [customStaples, setCustomStaples] = useState([]);
  const [excludedStaples, setExcludedStaples] = useState([]); // cores explicitly removed from the built-in staple list (e.g. "salt")
  const [stapleCategories, setStapleCategories] = useState({}); // core -> "spice" | "other" override
  const [pantryInventory, setPantryInventory] = useState([]);
  const [pantryLocations, setPantryLocations] = useState([]); // user-added storage sections beyond Fridge/Pantry/Freezer
  const [inventoryLayout, setInventoryLayout] = useState([]); // section order/size/built-in names (InventorySectionLayout)
  const [loadError, setLoadError] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeFilter, setRecipeFilter] = useState("all");
  // The Flyers deal to open as soon as that page shows ("Open the flyer" on
  // Home's Proteins on sale); Flyers clears it once it has taken it.
  const [flyerDealId, setFlyerDealId] = useState(null);
  const [recipeProtein, setRecipeProtein] = useState(null); // a protein id (see lib/proteins.js) or null
  // The recipe editor on the Recipes tab: { recipe } to edit one (full page),
  // { recipe: null } for a new one (a pop-up over the Recipes page), null
  // when closed.
  const [recipeEditor, setRecipeEditor] = useState(null);
  const editorDirty = useRef(false);
  const [upcomingTick, setUpcomingTick] = useState(0); // bumped when the plan changes in a week that is not on screen
  const makeableFinder = useFinder(); // the Makeable page's search and filters; kept here so the pop-out's Similar recipes can steer them
  const [makeableSales, toggleMakeableSales] = useShowSales();
  const { deals } = useDeals();
  const [upcomingEntries, setUpcomingEntries] = useState([]); // every planned meal from today onward, across weeks: what the grocery list is built from
  const [plannerExtraItems, setPlannerExtraItems] = useState([]); // manually-added grocery items
  const [groceryOverrides, setGroceryOverrides] = useState([]); // removed rows / own quantities (GroceryItemOverride)
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState(null); // the dnd-kit `active` object for whatever's currently being dragged, for <DragOverlay>
  // Which droppable id a drag is currently hovering, tracked only to drive
  // the Imported -> Cookbook live-reflow preview below (dnd-kit's own
  // useSortable already handles reflow for same-grid drags on its own).
  const [dragOverId, setDragOverId] = useState(null);

  // Option (Mac) / Alt (Windows) held while a planned recipe is dragged: the drop makes
  // a leftover copy in the target slot instead of moving the card. `optionHeld` is
  // read at the drop (a ref, so it is never stale); `copyDrag` only drives the "+"
  // cursor and badge while it is held.
  const optionHeld = useRef(false);
  const [copyDrag, setCopyDrag] = useState(false);

  // A finger that has held still long enough to pick something up must carry it
  // without the page scrolling under it: once a drag is live, touch moves are not
  // handed to the browser's scroll (which would cancel the drag). Before the drag
  // starts a touch scrolls the page as usual. The listener is always on (and
  // reads a ref) so it is already in place for the very first move.
  const dragLive = useRef(false);
  useEffect(() => {
    const onTouchMove = (e) => {
      if (dragLive.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => window.removeEventListener("touchmove", onTouchMove);
  }, []);
  const draggingPlannedRecipe = !!activeDragItem?.data.current?.entryId && !activeDragItem.data.current?.recipe?.isPlaceholder;
  useEffect(() => {
    if (!isDragActive) {
      optionHeld.current = false;
      setCopyDrag(false);
      return undefined;
    }
    const sync = (held) => {
      optionHeld.current = held;
      setCopyDrag(held && draggingPlannedRecipe);
    };
    const onKey = (e) => {
      if (e.key !== "Alt") return;
      e.preventDefault(); // letting go of Alt must not focus the browser's menu bar
      sync(e.type === "keydown");
    };
    const onPointer = (e) => sync(e.altKey);
    const onBlur = () => sync(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("blur", onBlur);
    };
  }, [isDragActive, draggingPlannedRecipe]);
  useEffect(() => {
    document.body.classList.toggle("riso-copy-drag", copyDrag);
    return () => document.body.classList.remove("riso-copy-drag");
  }, [copyDrag]);

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

  // What's on the grocery list: the upcoming meals, hand-added items and
  // removed rows. Re-fetched on tab change, since the Grocery and Home tabs
  // and the Planner change them through their own state. Drives the grocery
  // de-duplication below.
  useEffect(() => {
    const today = toDateKey(new Date());
    api.listPlannerUpcoming(today).then(setUpcomingEntries).catch(() => setUpcomingEntries([]));
    api.listGroceryExtras().then(setPlannerExtraItems).catch(() => setPlannerExtraItems([]));
    api.listGroceryOverrides().then(setGroceryOverrides).catch(() => setGroceryOverrides([]));
  }, [tab, plannerEntries, upcomingTick]);

  const groceryCores = coresOnGroceryList(upcomingEntries, plannerExtraItems, groceryOverrides);

  function isOnGroceryList(name) {
    return groceryCores.has(groceryCore(name));
  }

  // Adds only what isn't already on the list (from a planned recipe
  // or added earlier), so tapping "+ Add all" twice, or adding an item a
  // planned recipe already needs, never makes a duplicate row.
  async function addToGroceryList(names, { dealId = null } = {}) {
    const seen = new Set(groceryCores);
    const removedRows = removedRecipeRows(upcomingEntries, groceryOverrides);
    const created = [];
    for (const name of names) {
      const c = groceryCore(name);
      if (seen.has(c)) continue;
      seen.add(c);
      if (removedRows.has(c)) {
        // A planned recipe already needs it but it was removed - bring
        // that row back rather than adding a second one.
        await setGroceryOverride(removedRows.get(c), { removed: false });
        continue;
      }
      created.push(await api.addGroceryExtra({ name, quantity: null, unit: null, ...(dealId && { dealId }) }));
    }
    if (created.length > 0) setPlannerExtraItems((prev) => [...prev, ...created]);
  }

  async function setGroceryOverride(key, patch) {
    const saved = await api.setGroceryOverride(key, patch);
    setGroceryOverrides((prev) => [...prev.filter((o) => o.key !== key), ...(saved ? [saved] : [])]);
  }

  // Hand-added rows are deleted; a planned recipe's row is removed until the
  // meals that need it leave the plan (the recipe itself is untouched).
  async function removeFromGroceryList(name) {
    const c = groceryCore(name);
    const matches = plannerExtraItems.filter((item) => groceryCore(item.name) === c);
    await Promise.all(matches.map((item) => api.deleteGroceryExtra(item.id)));
    setPlannerExtraItems((prev) => prev.filter((item) => !matches.includes(item)));
    const recipeRow = buildGroceryList(upcomingEntries, [], {}, [], [], groceryOverrides).find(
      (item) => item.core === c && !item.removed
    );
    if (recipeRow) await setGroceryOverride(recipeRow.key, { removed: true });
  }

  // The ✓ on an ingredient (recipe pop-out, planned meal's card, full recipe card):
  // on the list -> take it off, with the shared Undo toast; off the list -> put it
  // back. Undo goes through `latestGrocery` because the list has changed by then.
  const latestGrocery = useRef({});
  latestGrocery.current = { addToGroceryList, removeFromGroceryList };
  async function toggleGroceryItem(name) {
    if (!isOnGroceryList(name)) {
      await addToGroceryList([name]);
      return;
    }
    await removeFromGroceryList(name);
    showToast(t("grocery.takenOff", { name }), () => latestGrocery.current.addToGroceryList([name]));
  }

  // Makeable's À acheter: put some items on the list and say so; Undo takes those items off again.
  async function addToGroceryListWithUndo(names) {
    await addToGroceryList(names);
    showToast(t("finder.listed", { count: names.length }), () => names.forEach((name) => latestGrocery.current.removeFromGroceryList(name)));
  }

  // One set of grocery functions for every page that shows an ingredient's marks.
  const grocery = {
    isOnList: isOnGroceryList,
    add: addToGroceryList,
    remove: removeFromGroceryList,
    toggle: toggleGroceryItem,
    addWithUndo: addToGroceryListWithUndo,
  };

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
  // `leaveFor` is the tab waiting on the "leave without saving?" pop-up.
  const [leaveFor, setLeaveFor] = useState(null);
  function goToTab(next) {
    if (recipeEditor && editorDirty.current) {
      setLeaveFor(next);
      return;
    }
    setRecipeEditor(null);
    editorDirty.current = false;
    setTab(next);
  }

  async function handleDeleteRecipe(id) {
    await api.deleteRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setPlannerEntries((prev) => prev.filter((e) => e.recipeId !== id));
    setUpcomingEntries((prev) => prev.filter((e) => e.recipeId !== id));
  }

  async function handleLogout() {
    await api.logout();
    clearDeals();
    clearGroceryShared();
    onLogout();
  }

  // What the account area offers besides the language switch and the name.
  // Shown in the avatar menu. A new entry (the Admin link) shows up there by
  // being added here.
  const accountActions = [
    { id: "help", label: t("app.help"), current: tab === "help", onSelect: () => goToTab("help") },
    { id: "logout", label: t("app.logOut"), onSelect: handleLogout },
  ];

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

  // A deal's card on the Flyers page: Home's "Open the flyer" and the deal card's
  // "See in Flyers" on Makeable.
  function openFlyerDeal(deal) {
    setFlyerDealId(deal.id);
    setPopout(null);
    setTab("flyers");
  }

  // Single entry point for opening the recipe detail modal. sharedWith is
  // only ever passed by the "good next addition" suggestion click — every
  // other caller passes just the recipe, which naturally clears any
  // leftover context from a previous suggestion-opened recipe.
  function openRecipe(recipe, sharedWith) {
    setActiveRecipe(recipe);
    setActiveRecipeSharedWith(sharedWith || null);
  }

  // Every "Cook" and "Open the full recipe" goes through here, so they all land
  // on the same thing: the recipe's card on the Recipes page. The pop-out and
  // anything open on top of the page closes first.
  function openRecipeCard(recipeOrId) {
    const recipe = typeof recipeOrId === "string" ? recipes.find((r) => r.id === recipeOrId) : recipeOrId;
    if (!recipe) return;
    setPopout(null);
    setPickerFor(null);
    if (tab !== "collection") goToTab("collection");
    openRecipe(recipe);
  }

  // The one recipe pop-out (Plan, Cook, Similar recipes, the to-buy toggles).
  // `from` is the box of the card it grows out of.
  function openPopout(recipeOrId, from = null) {
    const recipeId = typeof recipeOrId === "string" ? recipeOrId : recipeOrId?.id;
    setPopout(recipeId ? { recipeId, from } : null);
  }

  // The one slot picker: "Plan" in the pop-out and the finder's + (when no slot
  // is chosen) open it. It starts on the chosen target slot, else the next empty one.
  function requestPlan(recipe) {
    setPopout(null);
    setPickerFor({ recipe });
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
    return created;
  }

  // The only way anything but Inventory's own add form reaches Inventory: it
  // opens the confirmation sheet and resolves with the `ref`s of the rows that
  // were added (an empty list when nothing was), or null if it was cancelled
  // before anything was. Nothing is added until the sheet is confirmed.
  const [inventoryAsk, setInventoryAsk] = useState(null);
  function requestInventoryAdd(drafts, { title, intro } = {}) {
    return new Promise((resolve) => {
      setInventoryAsk({ drafts, title, intro, added: [], resolve });
    });
  }

  async function confirmInventoryAdd(rows) {
    const ask = inventoryAsk;
    const failed = [];
    for (const { ref, ...item } of rows) {
      try {
        await handleAddPantryItem(item);
        ask.added.push(ref);
      } catch {
        failed.push(ref);
      }
    }
    if (failed.length > 0) {
      // Keep what went in out of the sheet, so a retry doesn't add it twice.
      const error = new Error(t("inventoryConfirm.failed"));
      error.added = rows.map((r) => r.ref).filter((r) => !failed.includes(r));
      throw error;
    }
    ask.resolve(ask.added);
    setInventoryAsk(null);
  }

  function cancelInventoryAdd() {
    inventoryAsk.resolve(inventoryAsk.added.length > 0 ? inventoryAsk.added : null);
    setInventoryAsk(null);
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
    const copying = optionHeld.current;
    setIsDragActive(false);
    setActiveDragItem(null);
    const { active, over } = event;
    if (!over) return;

    // A grocery item dropped on a store in Store mode (Grocery saves the move).
    const storeDrag = active.data.current?.storeDrag;
    if (storeDrag) {
      const store = over.data.current?.storeDrop;
      if (store != null) storeDrag.drop(store);
      return;
    }

    // A planned card dropped on the phone Planner's trash strip comes off the plan
    // (the toast has Undo).
    if (over.id === TRASH_ID) {
      const trashed = active.data.current?.entryId;
      if (trashed) await handleRemoveWithUndo(trashed);
      return;
    }

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

    const entryId = active.data.current?.entryId;
    if (entryId) {
      // With Option held, a planned recipe is copied as leftovers into an empty slot
      // (the original stays put).
      const source = plannerEntries.find((e) => e.id === entryId);
      if (copying && source && !source.recipe?.isPlaceholder) {
        if (entriesInSlot(slot).length > 0) showToast(t("planner.copyNeedsEmpty"));
        else await handlePlaceLeftover(source.recipe, slot);
        return;
      }
      // A meal or note dragged between slots: the two slots swap.
      await handleMoveEntry(entryId, slot);
      return;
    }

    // A recipe dragged in from the tray replaces whatever was in the slot.
    const recipeId = active.data.current?.recipe?.id;
    if (recipeId) {
      const added = itemsAddedBy(recipeId, weekStart, slot);
      announcePlacement(await handlePlaceRecipe(recipeId, slot), slot, added);
    }
  }

  function entriesInSlot(slot) {
    return plannerEntries.filter((e) => e.dayOfWeek === slot.dayOfWeek && e.mealType === slot.mealType);
  }

  // One thing per slot: placing a recipe replaces whatever was there.
  // Resolves with the new entry and what it replaced (or null), for the toast's Undo.
  // `week` is the week to place in (the one on screen unless the slot picker
  // was moved to another).
  async function handlePlaceRecipe(recipeId, slot, week = weekStart) {
    const inView = week === weekStart;
    const weekEntries = inView ? plannerEntries : await api.listPlanner(week);
    const existing = weekEntries.filter((e) => e.dayOfWeek === slot.dayOfWeek && e.mealType === slot.mealType);
    await Promise.all(existing.map((e) => api.removeFromPlanner(e.id)));
    const entry = await api.placeOnPlanner({ recipeId, weekStart: week, ...slot });
    if (inView) setPlannerEntries((prev) => [...prev.filter((e) => !existing.includes(e)), entry]);
    else setUpcomingTick((n) => n + 1);
    return { entry, replaced: existing[0] || null };
  }

  // How many things putting this recipe in that slot adds to the grocery list
  // (the list follows the plan by itself; this is only for the toast). Nothing
  // for a day that has passed: the list is built from today on.
  function itemsAddedBy(recipeId, week, slot) {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || isPastDay(week, slot.dayOfWeek)) return 0;
    return newGroceryItemCount({ recipe }, groceryCores, customStaples, excludedStaples);
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

  // ---- The one toast, with Undo, at the bottom of every page ----
  function showToast(message, undo) {
    setToast({ id: Date.now() + Math.random(), message, undo });
  }

  // A meal put back as it was (a removed one, or the one a new meal replaced):
  // the same recipe or note in the same slot, with its leftover and
  // already-have marks.
  async function restoreEntry(snap) {
    let entry;
    if (snap.recipe?.isPlaceholder) {
      entry = await api.markSlotBlank(snap.weekStart, snap.dayOfWeek, snap.mealType, isCustomNote(snap) ? snap.recipe.title : undefined);
    } else {
      entry = await api.placeOnPlanner({
        recipeId: snap.recipeId || snap.recipe.id,
        weekStart: snap.weekStart,
        dayOfWeek: snap.dayOfWeek,
        mealType: snap.mealType,
        servings: snap.servings,
        isLeftover: snap.isLeftover,
        alreadyHave: snap.alreadyHave,
      });
    }
    if (entry.weekStart === weekStart) setPlannerEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry]);
    else setUpcomingTick((n) => n + 1);
    return entry;
  }

  async function dropEntry(id) {
    setPlannerEntries((prev) => prev.filter((e) => e.id !== id));
    await api.removeFromPlanner(id);
    setUpcomingTick((n) => n + 1);
  }

  // After something is put in a slot: "Added to Tue · Supper" or "<old meal>
  // replaced", with Undo (take it out again and put back what it replaced).
  // `added` is how many grocery items it put on the list (nothing is said for 0).
  function announcePlacement({ entry, replaced }, slot, added = 0) {
    const key = `planner.${replaced ? "toastReplaced" : "toastAdded"}${added > 0 ? "List" : ""}`;
    showToast(
      t(key, { title: replaced?.recipe.title, slot: slotLabel(slot), count: added }),
      async () => {
        await dropEntry(entry.id);
        if (replaced) await restoreEntry(replaced);
      }
    );
  }

  // The finder's + and the slot picker's confirm: the slot it is adding to
  // (`slotOverride`, from the picker, in `weekOverride`), else the chosen
  // target, otherwise the next empty upcoming slot (supper first). Resolves
  // with the slot it used, or null when the week has no free slot.
  async function handlePlanRecipe(recipe, slotOverride, weekOverride) {
    const week = weekOverride || weekStart;
    const slot = slotOverride || plannerTarget || findNextEmptySlot(plannerEntries, weekStart);
    if (!slot) return null;
    const { dayOfWeek, mealType } = slot;
    const added = itemsAddedBy(recipe.id, week, { dayOfWeek, mealType });
    const placed = await handlePlaceRecipe(recipe.id, { dayOfWeek, mealType }, week);
    setPlannerTarget(null);
    announcePlacement(placed, { dayOfWeek, mealType }, added);
    return { dayOfWeek, mealType };
  }

  // "Nothing planned" on an empty slot's card: the slot is marked as planned
  // with no meal (eating out, skipping). Clicking the blank card clears it.
  async function handleMarkBlank(slot) {
    const existing = entriesInSlot(slot);
    await Promise.all(existing.map((e) => api.removeFromPlanner(e.id)));
    const saved = await api.markSlotBlank(weekStart, slot.dayOfWeek, slot.mealType);
    setPlannerEntries((prev) => [...prev.filter((e) => !existing.includes(e)), saved]);
    announcePlacement({ entry: saved, replaced: existing[0] || null }, slot);
  }

  // The slot card's Save on its Note tab: a note on the slot, replacing what
  // was there (a note is changed in place).
  async function handleSaveSlotNote(slot, text) {
    const note = text.trim();
    if (!note) return;
    const existing = entriesInSlot(slot);
    const existingNote = existing.find((e) => e.recipe?.isPlaceholder);
    const others = existing.filter((e) => e !== existingNote);
    await Promise.all(others.map((e) => api.removeFromPlanner(e.id)));
    let saved;
    if (existingNote) saved = await api.setPlannerEntryNote(existingNote.id, note);
    else saved = await api.markSlotBlank(weekStart, slot.dayOfWeek, slot.mealType, note);
    setPlannerEntries((prev) => [...prev.filter((e) => !others.includes(e) && e !== existingNote), saved]);
    announcePlacement({ entry: saved, replaced: existingNote ? null : others[0] || null }, slot);
  }

  // Leftovers of a recipe on an empty slot: the same recipe, flagged as a
  // leftover, so nothing from it goes on the grocery list again.
  async function handlePlaceLeftover(recipe, slot) {
    if (entriesInSlot(slot).length > 0) return;
    const entry = await api.placeOnPlanner({ recipeId: recipe.id, weekStart, ...slot, isLeftover: true });
    setPlannerEntries((prev) => [...prev, entry]);
    showToast(t("planner.leftoversAdded", { title: recipe.title, slot: slotLabel(slot) }), () => dropEntry(entry.id));
  }

  // The × on a card (or a blank card clicked again): off the plan, with Undo.
  async function handleRemoveWithUndo(entryId) {
    const snap = plannerEntries.find((e) => e.id === entryId);
    await handleRemoveFromPlanner(entryId);
    if (snap) {
      const name = snap.recipe?.isPlaceholder ? (isCustomNote(snap) ? snap.recipe.title : t("planner.blankName")) : snap.recipe?.title;
      showToast(t("planner.toastRemoved", { title: name, slot: slotLabel(snap) }), () => restoreEntry(snap));
    }
  }

  // "Clear" under a day: every meal, note and empty card planned that day comes
  // off the plan at once, with Undo (each one back as it was, leftover and
  // already-have marks included). No question first: Undo covers a mistake.
  async function handleClearDay(dayOfWeek) {
    const snaps = entriesOnDay(plannerEntries, dayOfWeek);
    if (snaps.length === 0) return;
    await Promise.all(snaps.map((e) => handleRemoveFromPlanner(e.id)));
    const long = dict().days.long[dayOfWeek];
    showToast(t("planner.toastDayCleared", { day: long }), async () => {
      for (const snap of snaps) await restoreEntry(snap);
    });
  }

  // The weekend menu saves with every click, so saves go one after another:
  // the last choice is the one the account keeps, whatever the network does.
  const weekendSaves = useRef(Promise.resolve());
  function handleSaveWeekend(next) {
    const before = weekend;
    setWeekend(next);
    weekendSaves.current = weekendSaves.current
      .then(() => api.saveWeekend({ weekendDays: next.days, weekendOn: next.on, weekendEve: next.eve }))
      .catch(() => setWeekend(before));
  }

  async function handleRemoveFromPlanner(entryId) {
    setPlannerEntries((prev) => prev.filter((e) => e.id !== entryId));
    await api.removeFromPlanner(entryId);
  }

  // One control cycles a placed card through three states: plain -> leftover
  // -> already have it -> back to plain. isLeftover/alreadyHave stay two
  // separate booleans server-side, but the UI only ever has one of them true
  // at a time, driven from this single handler.
  // With `toast` (a phone's status tap) the shared toast says what changed, and
  // its Undo puts the old mark back.
  async function handleCycleMealState(entryId, { toast = false } = {}) {
    const entry = plannerEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = entry.isLeftover
      ? { isLeftover: false, alreadyHave: true }
      : entry.alreadyHave
      ? { isLeftover: false, alreadyHave: false }
      : { isLeftover: true, alreadyHave: false };
    const apply = async (flags) => {
      await api.updatePlannerEntry(entryId, flags);
      setPlannerEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...flags } : e)));
    };
    await apply(next);
    if (toast) {
      const key = next.alreadyHave ? "toastMarkedHave" : next.isLeftover ? "toastMarkedLeftover" : "toastMarkedPlain";
      showToast(t(`planner.${key}`, { title: entry.recipe?.title }), () => apply({ isLeftover: !!entry.isLeftover, alreadyHave: !!entry.alreadyHave }));
    }
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

  // "Copy last week": last week's meals into this week's EMPTY slots only (the
  // server never replaces anything). The toast says how many, with Undo, and the
  // week calendar's button gets the count.
  async function handleCopyLastWeek() {
    const { entries, createdIds } = await api.copyPlannerWeek(shiftWeek(weekStart, -1), weekStart);
    setPlannerEntries(entries);
    if (createdIds.length === 0) {
      showToast(t("planner.toastCopiedNone"));
      return 0;
    }
    showToast(t("planner.toastCopied", { count: createdIds.length }), async () => {
      await Promise.all(createdIds.map((id) => api.removeFromPlanner(id)));
      setPlannerEntries((prev) => prev.filter((e) => !createdIds.includes(e.id)));
    });
    return createdIds.length;
  }

  const plannableRecipes = recipes.filter((r) => !r.isPlaceholder);
  const pantryHaveCores = haveCoresFor(pantryInventory, customStaples);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // The page scrolls when a held card nears its top or bottom edge, except over
      // the phone Planner's trash strip, which sits in the bottom edge.
      autoScroll={dragOverId === TRASH_ID ? false : { threshold: { x: 0.06, y: 0.12 } }}
      onDragStart={(event) => {
        dragLive.current = true;
        setIsDragActive(true);
        setActiveDragItem(event.active);
        // Option already held when the drag starts.
        const held = !!event.activatorEvent?.altKey;
        optionHeld.current = held;
        const data = event.active.data.current;
        setCopyDrag(held && !!data?.entryId && !data?.recipe?.isPlaceholder);
      }}
      onDragOver={(event) => {
        setDragOverId(event.over?.id ?? null);
      }}
      onDragEnd={(event) => {
        dragLive.current = false;
        setDragOverId(null);
        return handleDragEnd(event);
      }}
      onDragCancel={() => {
        dragLive.current = false;
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
        <header ref={headerRef} className={`app-header riso-theme${headerLevel >= 1 ? " is-tight" : ""}${headerLevel >= 2 ? " is-tighter" : ""}`}>
          <h1 className="wordmark">
            matt mo <span>cookbook</span>
          </h1>
          {/* FR | EN right in the header, next to the avatar. The name, Help and
              Log out are in the avatar's menu, on a phone and on a computer. */}
          <div className="app-header-phone-tools">
            <LanguageSwitch />
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
                  {accountActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="btn subtle btn-sm"
                      aria-current={action.current ? "page" : undefined}
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        action.onSelect();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
        </header>

        {loadError && (
          <div className="load-error-banner">
            {t("app.loadError")}
            <button type="button" className="btn subtle btn-sm" onClick={loadInitialData}>
              {t("app.tryAgain")}
            </button>
          </div>
        )}

        {tab === "help" && <Help />}

        {inventoryAsk && (
          <InventoryConfirmSheet
            drafts={inventoryAsk.drafts}
            sections={shelfOptions(pantryLocations, inventoryLayout)}
            title={inventoryAsk.title}
            intro={inventoryAsk.intro}
            onConfirm={confirmInventoryAdd}
            onCancel={cancelInventoryAdd}
          />
        )}

        {tab === "flyers" && (
          <FlyerDeals
            user={user}
            recipes={recipes}
            customStaples={customStaples}
            isOnGroceryList={isOnGroceryList}
            onAddToGroceryList={addToGroceryList}
            onRemoveFromGroceryList={removeFromGroceryList}
            openDealId={flyerDealId}
            onDealOpened={() => setFlyerDealId(null)}
          />
        )}

        {tab === "makeable" && (
          <Makeable
            finder={makeableFinder}
            recipes={recipes}
            pantryInventory={pantryInventory}
            pantryLocations={pantryLocations}
            inventoryLayout={inventoryLayout}
            haveCores={pantryHaveCores}
            upcomingEntries={upcomingEntries}
            grocery={grocery}
            deals={deals}
            showSales={makeableSales}
            onToggleSales={toggleMakeableSales}
            onOpenPopout={openPopout}
            popoutId={popout?.recipeId}
            onCook={openRecipeCard}
            onPlan={requestPlan}
            onOpenFlyerDeal={openFlyerDeal}
          />
        )}

        {tab === "inventory" && (
          <Inventory
            user={user}
            items={pantryInventory}
            onAdd={handleAddPantryItem}
            onRequestInventoryAdd={requestInventoryAdd}
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
              setRecipeProtein(null);
              setTab("collection");
            }}
            onFindRecipesForSelection={() => setTab("makeable")}
            locations={pantryLocations}
            layout={inventoryLayout}
            onSaveLayout={handleSaveInventoryLayout}
            onRenameLocation={handleRenamePantryLocation}
            onAddLocation={handleAddPantryLocation}
            onDeleteLocation={handleDeletePantryLocation}
            onToast={showToast}
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
            onSelectRecipe={openPopout}
            onOpenRecipeCard={openRecipeCard}
            onFindRecipes={(query) => {
              setRecipeSearch(query);
              setRecipeFilter("all");
              setRecipeProtein(null);
              setTab("collection");
            }}
            // "See them" on Proteins on sale: Recipes with that protein's filter on.
            onFindProtein={(proteinId) => {
              setRecipeSearch("");
              setRecipeFilter("all");
              setRecipeProtein(proteinId);
              setTab("collection");
            }}
            // "Open the flyer" on Proteins on sale: that deal's card on Flyers.
            onOpenFlyerDeal={openFlyerDeal}
            onPickRecipeFor={(slot) => {
              setWeekStart(currentWeekStart());
              setPlannerTarget(slot);
              setTab("planner");
            }}
            isOnGroceryList={isOnGroceryList}
            onAddToGroceryList={addToGroceryList}
            onRemoveFromGroceryList={removeFromGroceryList}
          />
        )}

        {tab === "collection" && recipeEditor && (
          <RecipeEditor
            key={recipeEditor.recipe?.id || "new"}
            popup={!recipeEditor.recipe}
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

        {tab === "collection" && !recipeEditor?.recipe && (
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
            protein={recipeProtein}
            onProteinChange={setRecipeProtein}
            onSelectRecipe={openPopout}
            onImported={handleImported}
            onNewRecipe={() => openRecipeEditor(null)}
            onToast={showToast}
          />
        )}

        {tab === "planner" && (
          <div className="riso-theme riso-planner" data-theme="light">
            {plannableRecipes.length === 0 ? (
              <p className="riso-planner-empty">{t("app.plannerEmpty")}</p>
            ) : (
              <Planner
                user={user}
                recipes={plannableRecipes}
                entries={plannerEntries}
                weekStart={weekStart}
                onChangeWeek={setWeekStart}
                weekend={weekend}
                onWeekendChange={handleSaveWeekend}
                pantryInventory={pantryInventory}
                pantryLocations={pantryLocations}
                inventoryLayout={inventoryLayout}
                haveCores={pantryHaveCores}
                grocery={grocery}
                target={plannerTarget}
                onTargetChange={setPlannerTarget}
                initialMainId={plannerMainId}
                onInitialMainConsumed={() => setPlannerMainId(null)}
                actions={{
                  placeRecipe: handlePlanRecipe,
                  placeLeftover: handlePlaceLeftover,
                  markBlank: handleMarkBlank,
                  removeEntry: handleRemoveWithUndo,
                  clearDay: handleClearDay,
                  saveSlotNote: handleSaveSlotNote,
                  toast: showToast,
                  cycleState: handleCycleMealState,
                  copyLastWeek: handleCopyLastWeek,
                }}
                onOpenPopout={openPopout}
                popoutId={popout?.recipeId}
                onRequestPlan={requestPlan}
                onOpenRecipeCard={openRecipeCard}
              />
            )}
          </div>
        )}

        {tab === "grocery" && (
          <GroceryList
            user={user}
            customStaples={customStaples}
            excludedStaples={excludedStaples}
            stapleCategories={stapleCategories}
            onRequestInventoryAdd={requestInventoryAdd}
            onToast={showToast}
          />
        )}

        {activeRecipe && (
          <RecipeDetailModal
            recipe={activeRecipe}
            sharedWithWeek={activeRecipeSharedWith}
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
              // Opens the Planner's finder on this recipe as its Main meal:
              // recipes that share its ingredients.
              setPlannerMainId(recipe.id);
              openRecipe(null);
              setWeekStart(currentWeekStart());
              setTab("planner");
            }}
            onRequestInventoryAdd={requestInventoryAdd}
            onDeletePantryItem={handleDeletePantryItem}
            onAddToGroceryList={addToGroceryList}
            grocery={grocery}
            onConsumePantryItems={handleConsumePantryItems}
            onPlanLeftovers={handlePlanLeftovers}
            onNavigate={(t) => {
              openRecipe(null);
              setTab(t);
            }}
          />
        )}
        {popout && (
          <RecipePopoutHost
            recipe={recipes.find((r) => r.id === popout.recipeId) || null}
            from={popout.from}
            haveCores={pantryHaveCores}
            plannedEntries={[...plannerEntries, ...upcomingEntries]}
            grocery={grocery}
            deals={deals}
            showSales={tab === "makeable" && makeableSales}
            onPlan={() => requestPlan(recipes.find((r) => r.id === popout.recipeId))}
            onCook={tab === "makeable" ? undefined : () => openRecipeCard(popout.recipeId)}
            onSimilar={() => {
              setPopout(null);
              // On Makeable, Similar recipes re-sorts that page; elsewhere it opens the Planner's Main meal.
              if (tab === "makeable") {
                makeableFinder.setMainMeal(popout.recipeId);
                return;
              }
              setPlannerMainId(popout.recipeId);
              if (tab !== "planner") {
                setWeekStart(currentWeekStart());
                goToTab("planner");
              }
            }}
            onOpenFull={() => openRecipeCard(popout.recipeId)}
            onClose={() => setPopout(null)}
          />
        )}
        {pickerFor && (
          <SlotPicker
            recipe={pickerFor.recipe}
            weekStart={weekStart}
            entries={plannerEntries}
            weekend={weekend}
            initialSlot={plannerTarget}
            onConfirm={async (slot, week) => {
              const { recipe } = pickerFor;
              setPickerFor(null);
              if (!(await handlePlanRecipe(recipe, slot, week))) showToast(t("app.slotsFull"));
            }}
            onClose={() => setPickerFor(null)}
          />
        )}
        {leaveFor && (
          <ConfirmDialog
            message={t("app.leaveUnsaved")}
            stayLabel={t("editor.keepEditing")}
            leaveLabel={t("editor.discard")}
            onStay={() => setLeaveFor(null)}
            onLeave={() => {
              const next = leaveFor;
              setLeaveFor(null);
              setRecipeEditor(null);
              editorDirty.current = false;
              setTab(next);
            }}
          />
        )}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
      <DragOverlay dropAnimation={null} modifiers={activeDragItem?.data.current?.storeDrag ? [centreAboveFinger] : undefined}>
        {activeDragItem && <DragPreview active={activeDragItem} copy={copyDrag} />}
      </DragOverlay>
    </DndContext>
  );
}
