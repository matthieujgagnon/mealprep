import { useEffect, useMemo, useState } from "react";
import { Finder } from "./Finder.jsx";
import { PlannerBoard, PlannerHeader } from "./PlannerBoard.jsx";
import { PlannerMobile } from "./PlannerMobile.jsx";
import { SlotCard, WeekendControl } from "./PlannerExtras.jsx";
import { useFinder } from "../hooks/useFinder.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { currentWeekStart } from "../lib/dates.js";
import { slotLabel, todayIndex } from "../lib/plannerSlots.js";
import { t } from "../i18n/index.js";

// The Planner tab (design: docs/design/riso-v2, "Riso v2 Recipe Finder Live"):
// the week board with the one shared recipe finder under it. A computer shows
// the finder as a panel below the board, always on; a phone shows the same
// finder inside the bottom card that opens when a slot is tapped.
//
// App.jsx owns the planner's data and what changes it (so the board and every
// other tab stay in step); this component owns what is on screen: the finder,
// the empty slot's card, the leftovers mode and the little messages.
//
//   actions.placeRecipe(recipe)   puts a recipe in the target slot, else the next
//                                 empty one; resolves with the slot, or null when
//                                 the week is full
//   actions.placeLeftover(recipe, slot), markBlank(slot), writeInSlot(slot),
//   actions.removeEntry(id), cycleState(id), editNote(id), saveNote(id, text),
//   actions.copyLastWeek()

export function Planner({
  recipes,
  entries,
  upcomingEntries,
  weekStart,
  onChangeWeek,
  weekendDays,
  onWeekendDaysChange,
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
  onOpenRecipe,
  onOpenGrocery,
  customStaples,
  excludedStaples,
}) {
  const phone = useIsPhone();
  const finder = useFinder();
  const [slotCard, setSlotCard] = useState(null); // { slot, el }: an empty slot's card on a computer
  const [leftoverMode, setLeftoverMode] = useState(false);
  const [message, setMessage] = useState(null);

  const mainRecipe = finder.mainId ? recipes.find((r) => r.id === finder.mainId) || null : null;

  // "Plan around this" on a recipe card, and Home's "Add a recipe", arrive here
  // with a Main meal or a target slot already chosen.
  useEffect(() => {
    if (initialMainId) {
      finder.setMainMeal(initialMainId);
      onInitialMainConsumed?.();
    }
    if (target && !phone) finder.focusSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leftovers only make sense while there is a Main meal.
  useEffect(() => {
    if (!mainRecipe) setLeftoverMode(false);
  }, [mainRecipe]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [message]);

  // The meals from today on: what the finder's ranking counts as already planned.
  const upcomingPlanner = useMemo(
    () => entries.filter((e) => weekStart !== currentWeekStart() || e.dayOfWeek >= todayIndex()),
    [entries, weekStart]
  );
  const plannedEntries = useMemo(() => [...entries, ...upcomingEntries], [entries, upcomingEntries]);

  async function plan(recipe) {
    const slot = await actions.placeRecipe(recipe);
    if (slot) setMessage(t("planner.added", { title: recipe.title, slot: slotLabel(slot) }));
    else setMessage(t("app.slotsFull"));
  }

  async function placeLeftover(slot) {
    if (!mainRecipe) return;
    await actions.placeLeftover(mainRecipe, slot);
    setMessage(t("planner.leftoversAdded", { title: mainRecipe.title, slot: slotLabel(slot) }));
  }

  function handleEmptyClick(slot, el) {
    if (leftoverMode && mainRecipe) {
      placeLeftover(slot);
      return;
    }
    setSlotCard({ slot, el });
  }

  function chooseRecipeForSlot() {
    const { slot } = slotCard;
    setSlotCard(null);
    onTargetChange(slot);
    finder.focusSearch();
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

  const finderNode = (layout) => (
    <Finder
      finder={finder}
      recipes={recipes}
      pantryInventory={pantryInventory}
      pantryLocations={pantryLocations}
      inventoryLayout={inventoryLayout}
      haveCores={haveCores}
      upcomingEntries={upcomingPlanner}
      plannedEntries={plannedEntries}
      grocery={grocery}
      layout={layout}
      draggable={layout === "panel"}
      target={target}
      targetLabel={target ? slotLabel(target) : ""}
      onClearTarget={() => onTargetChange(null)}
      planLabel={target ? t("tray.addTo", { slot: slotLabel(target) }) : t("finder.addNext")}
      onPlan={plan}
      onOpenFull={onOpenRecipe}
      leftovers={leftovers}
    />
  );

  const toast = message && (
    <div className="riso-planner-toast" role="status">
      {message}
    </div>
  );

  if (phone) {
    return (
      <>
        <PlannerMobile
          entries={entries}
          weekStart={weekStart}
          onChangeWeek={(w) => {
            onChangeWeek(w);
            onTargetChange(null);
          }}
          weekendDays={weekendDays}
          target={target}
          onSelectSlot={onTargetChange}
          onOpenRecipe={(recipe) => finder.setPopoutId(recipe.id)}
          onRemove={actions.removeEntry}
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
        {toast}
      </>
    );
  }

  return (
    <>
      <PlannerHeader
        weekStart={weekStart}
        onChangeWeek={(w) => {
          onChangeWeek(w);
          onTargetChange(null);
          setSlotCard(null);
        }}
        hasEntries={entries.length > 0}
        onCopyLastWeek={actions.copyLastWeek}
        actions={<WeekendControl days={weekendDays} onChange={onWeekendDaysChange} />}
      />
      {toast}
      <PlannerBoard
        entries={entries}
        weekStart={weekStart}
        weekendDays={weekendDays}
        selectedSlot={slotCard?.slot || target}
        leftoverMode={leftoverMode}
        onCardClick={(recipe) => finder.setPopoutId(recipe.id)}
        onRemove={actions.removeEntry}
        onCycleState={actions.cycleState}
        editingNoteId={editingNoteId}
        onEmptyClick={handleEmptyClick}
        onEditNote={actions.editNote}
        onSaveNote={actions.saveNote}
      />
      <section className="riso-planner-finder" aria-label={t("finder.panelAria")}>
        {finderNode("panel")}
      </section>
      {slotCard && (
        <SlotCard
          slot={slotCard.slot}
          anchor={slotCard.el}
          onRecipe={chooseRecipeForSlot}
          onNote={() => {
            const { slot } = slotCard;
            setSlotCard(null);
            actions.writeInSlot(slot);
          }}
          onBlank={() => {
            const { slot } = slotCard;
            setSlotCard(null);
            actions.markBlank(slot);
          }}
          onClose={() => setSlotCard(null)}
        />
      )}
    </>
  );
}
