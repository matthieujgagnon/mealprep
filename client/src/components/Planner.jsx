import { useEffect, useMemo, useRef, useState } from "react";
import { Finder } from "./Finder.jsx";
import { HintStrip } from "./RisoControls.jsx";
import { PlannerBoard, PlannerHeader } from "./PlannerBoard.jsx";
import { PlannerMobile } from "./PlannerMobile.jsx";
import { WeekendMenu } from "./PlannerExtras.jsx";
import { PlannedCard, SlotCard } from "./PlannerCards.jsx";
import { useFinder } from "../hooks/useFinder.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { api } from "../api.js";
import { currentWeekStart, shiftWeek } from "../lib/dates.js";
import { isCustomNote, slotLabel, todayIndex } from "../lib/plannerSlots.js";
import { weekendSummary } from "../lib/weekend.js";
import { t } from "../i18n/index.js";

// The Planner tab (design: docs/design/riso-v2-planner-desktop): the week
// board with the one shared recipe finder under it. A computer shows the finder
// as a panel below the board, always on; a phone shows the same finder inside
// the bottom card that opens when a slot is tapped.
//
// App.jsx owns the planner's data and what changes it (so the board and every
// other tab stay in step), and the pieces every page shares: the recipe pop-out,
// the slot picker and the toast. This component owns what is on screen here:
// the finder, the cards that open beside a slot, the weekend menu and the
// leftovers mode. Only one overlay is open at a time: `overlay` is
//   { type: "slot", slot, el, mealIndex, note, entryId }  an empty slot's card (or a note's, to edit)
//   { type: "planned", entry, slot, el, mealIndex }       a planned meal's card
//   { type: "weekend" }                                   the weekend menu
// and the shared recipe pop-out and slot picker (App.jsx) are above them.
//
//   actions.placeRecipe(recipe, slot?)  puts a recipe in `slot`, else the target
//                                       slot, else the next empty one; resolves
//                                       with the slot, or null when the week is
//                                       full (App shows the toast and its Undo)
//   actions.placeLeftover(recipe, slot), markBlank(slot), saveSlotNote(slot, text),
//   actions.removeEntry(id), clearDay(dayOfWeek), cycleState(id), toast(message, undo?),
//   actions.writeInSlot(slot), editNote(id), saveNote(id, text)  (a phone writes on the slot),
//   actions.copyLastWeek()  fills the empty slots from last week
//   onOpenPopout(recipe, from?)  opens the shared recipe pop-out
//   onRequestPlan(recipe)        opens the shared slot picker
//   onOpenRecipeCard(recipeId)   "Cook": the recipe's card on the Recipes page

export function Planner({
  user,
  recipes,
  entries,
  weekStart,
  onChangeWeek,
  weekend,
  onWeekendChange,
  pantryInventory,
  pantryLocations,
  inventoryLayout,
  haveCores,
  grocery,
  target,
  onTargetChange,
  initialMainId,
  onInitialMainConsumed,
  editingNoteId,
  actions,
  onOpenPopout,
  popoutId,
  onRequestPlan,
  onOpenRecipeCard,
  onOpenGrocery,
  customStaples,
  excludedStaples,
}) {
  const phone = useIsPhone();
  const finder = useFinder();
  const [overlay, setOverlay] = useState(null);
  const [leftoverMode, setLeftoverMode] = useState(false);
  const boardRef = useRef(null);

  const mainRecipe = finder.mainId ? recipes.find((r) => r.id === finder.mainId) || null : null;

  // Home's "Add a recipe" arrives here with a target slot already chosen.
  useEffect(() => {
    if (target && !phone) finder.focusSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Similar recipes" (from any pop-out) and "Plan around this" on a recipe card
  // arrive with a Main meal to open the finder on.
  useEffect(() => {
    if (initialMainId) {
      finder.setMainMeal(initialMainId);
      onInitialMainConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMainId]);

  // How many meals last week has: "Copy last week" is off when it is empty.
  const [lastWeekCount, setLastWeekCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .listPlanner(shiftWeek(weekStart, -1))
      .then((rows) => !cancelled && setLastWeekCount(rows.length))
      .catch(() => !cancelled && setLastWeekCount(0));
    return () => {
      cancelled = true;
    };
  }, [weekStart, entries]);

  // Leftovers only make sense while there is a Main meal.
  useEffect(() => {
    if (!mainRecipe) setLeftoverMode(false);
  }, [mainRecipe]);

  // One overlay at a time: the recipe pop-out opening closes the others.
  useEffect(() => {
    if (popoutId) setOverlay(null);
  }, [popoutId]);

  // The meals from today on: what the finder's ranking counts as already planned.
  const upcomingPlanner = useMemo(
    () => entries.filter((e) => weekStart !== currentWeekStart() || e.dayOfWeek >= todayIndex()),
    [entries, weekStart]
  );

  function open(next) {
    setOverlay(next);
  }
  const close = () => setOverlay(null);

  // A slot's current meal in words, for "Replaces ..." (nothing for an empty slot).
  function titleInSlot(slot) {
    const entry = slot && entries.find((e) => e.dayOfWeek === slot.dayOfWeek && e.mealType === slot.mealType);
    if (!entry) return null;
    if (!entry.recipe?.isPlaceholder) return entry.recipe.title;
    return isCustomNote(entry) ? entry.recipe.title : t("planner.blankName");
  }

  // Puts a recipe in the target slot, else the next empty one (a phone's + works this way).
  async function plan(recipe) {
    const slot = await actions.placeRecipe(recipe);
    if (!slot) actions.toast(t("app.slotsFull"));
  }

  // A computer's +: into the target slot when there is one, else the shared slot
  // picker, to choose where.
  function add(recipe) {
    if (target) plan(recipe);
    else onRequestPlan(recipe);
  }

  async function placeLeftover(slot) {
    if (mainRecipe) await actions.placeLeftover(mainRecipe, slot);
  }

  function handleEmptyClick(slot, el, mealIndex) {
    if (leftoverMode && mainRecipe) {
      placeLeftover(slot);
      return;
    }
    open({ type: "slot", slot, el, mealIndex, note: null });
  }

  function handleNoteClick(entry, el, mealIndex) {
    open({ type: "slot", slot: { dayOfWeek: entry.dayOfWeek, mealType: entry.mealType }, el, mealIndex, note: entry.recipe.title, entryId: entry.id });
  }

  function handleCardClick(entry, el, mealIndex) {
    open({ type: "planned", entry, slot: { dayOfWeek: entry.dayOfWeek, mealType: entry.mealType }, el, mealIndex });
  }

  const leftovers = mainRecipe
    ? {
        active: leftoverMode,
        onToggle: () => {
          setLeftoverMode((on) => !on);
          // On a phone the card covers the board: close it so the slots show.
          if (phone) onTargetChange(null);
        },
      }
    : undefined;

  const replacing = target ? titleInSlot(target) : null;
  const finderNode = (layoutName) => (
    <Finder
      finder={finder}
      recipes={recipes}
      pantryInventory={pantryInventory}
      pantryLocations={pantryLocations}
      inventoryLayout={inventoryLayout}
      haveCores={haveCores}
      upcomingEntries={upcomingPlanner}
      layout={layoutName}
      draggable={layoutName === "panel"}
      target={target}
      targetLabel={target ? slotLabel(target) : ""}
      targetNotice={replacing ? t("finder.replaces", { title: replacing }) : null}
      onClearTarget={() => onTargetChange(null)}
      onAdd={layoutName === "panel" ? add : plan}
      onOpenPopout={onOpenPopout}
      openId={popoutId}
      leftovers={leftovers}
    />
  );

  if (phone) {
    return (
      <PlannerMobile
        entries={entries}
        weekStart={weekStart}
        onChangeWeek={(w) => {
          onChangeWeek(w);
          onTargetChange(null);
        }}
        weekend={weekend}
        target={target}
        onSelectSlot={onTargetChange}
        onOpenRecipe={(recipe) => onOpenPopout(recipe)}
        onRemove={actions.removeEntry}
        onClearDay={actions.clearDay}
        onCycleState={actions.cycleState}
        editingNoteId={editingNoteId}
        onWriteInSlot={actions.writeInSlot}
        onMarkBlank={actions.markBlank}
        onEditNote={actions.editNote}
        onSaveNote={actions.saveNote}
        leftoverMode={leftoverMode}
        leftoverTitle={mainRecipe?.title}
        onLeftoverCell={placeLeftover}
        onLeftoverDone={() => setLeftoverMode(false)}
        finder={finderNode("sheet")}
        customStaples={customStaples}
        excludedStaples={excludedStaples}
        onOpenGrocery={onOpenGrocery}
      />
    );
  }

  const summary = weekendSummary(weekend);
  const hintLines = [
    t("planner.hint1"),
    t("planner.hint2"),
    t("planner.hint3"),
    t("planner.hint4"),
    summary ? t("planner.hint5", { summary }) : t("planner.hint5Off"),
  ];

  return (
    <>
      <PlannerHeader
        weekStart={weekStart}
        onChangeWeek={(w) => {
          onChangeWeek(w);
          onTargetChange(null);
          close();
        }}
        lastWeekCount={lastWeekCount}
        onCopyLastWeek={actions.copyLastWeek}
      />
      <PlannerBoard
        entries={entries}
        weekStart={weekStart}
        weekend={weekend}
        boardRef={boardRef}
        selectedSlot={overlay?.type === "slot" || overlay?.type === "planned" ? overlay.slot : target}
        leftoverMode={leftoverMode}
        onCardClick={handleCardClick}
        onNoteClick={handleNoteClick}
        onRemove={actions.removeEntry}
        onClearDay={actions.clearDay}
        onCycleState={actions.cycleState}
        onEmptyClick={handleEmptyClick}
        onWeekendMenu={() => open(overlay?.type === "weekend" ? null : { type: "weekend" })}
        overlay={overlay?.type === "weekend" ? <WeekendMenu weekend={weekend} onChange={onWeekendChange} onClose={close} /> : null}
      />
      <HintStrip userId={user.id} screenKey="planner-v7" items={hintLines} />
      <section className="riso-planner-finder" aria-label={t("finder.panelAria")}>
        {finderNode("panel")}
      </section>

      {overlay?.type === "slot" && (
        <SlotCard
          key={`${overlay.slot.dayOfWeek}-${overlay.slot.mealType}`}
          slot={overlay.slot}
          mealIndex={overlay.mealIndex}
          anchor={overlay.el}
          board={boardRef.current}
          note={overlay.note}
          onRecipe={() => {
            const { slot } = overlay;
            close();
            onTargetChange(slot);
            finder.focusSearch();
          }}
          onSaveNote={async (text) => {
            const { slot } = overlay;
            close();
            await actions.saveSlotNote(slot, text);
          }}
          onBlank={async () => {
            const { slot } = overlay;
            close();
            await actions.markBlank(slot);
          }}
          onRemoveNote={async () => {
            const { entryId } = overlay;
            close();
            await actions.removeEntry(entryId);
          }}
          onClose={close}
        />
      )}
      {overlay?.type === "planned" && (
        <PlannedCard
          slot={overlay.slot}
          mealIndex={overlay.mealIndex}
          anchor={overlay.el}
          board={boardRef.current}
          recipe={overlay.entry.recipe}
          haveCores={haveCores}
          grocery={grocery}
          onCook={() => {
            const { recipe } = overlay.entry;
            close();
            onOpenRecipeCard(recipe.id);
          }}
          onBase={() => {
            const { recipe } = overlay.entry;
            close();
            finder.setMainMeal(recipe.id);
            setLeftoverMode(true);
          }}
          onReplace={() => {
            const { slot } = overlay;
            close();
            onTargetChange(slot);
            finder.focusSearch();
          }}
          onClose={close}
        />
      )}
    </>
  );
}
