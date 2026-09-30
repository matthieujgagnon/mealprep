import { Fragment, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { HintStrip } from "./RisoControls.jsx";
import { currentWeekStart, formatDayLabel, formatWeekRangeLabel, isCurrentWeek, shiftWeek } from "../lib/dates.js";
import { DAY_SHORT, MEAL_LABEL, MEAL_TYPES, isCustomNote, isNoteEntry, slotKey, todayIndex } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { describeDeal, recipeGoodDeals } from "../lib/dealQuality.js";

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// A leftover card is "stale" once more days have passed since the earliest
// non-leftover placement of that same recipe this week than the recipe's
// fridgeLifeDays allows. Compares day-of-week positions within one week.
export function computeStaleLeftoverIds(entries) {
  const stale = new Set();
  const firstCookedDay = new Map();

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const recipeId = entry.recipe?.id;
    if (!recipeId) continue;
    const prevDay = firstCookedDay.get(recipeId);
    if (prevDay === undefined || entry.dayOfWeek < prevDay) firstCookedDay.set(recipeId, entry.dayOfWeek);
  }

  for (const entry of entries) {
    if (!entry.isLeftover) continue;
    const fridgeLifeDays = entry.recipe?.fridgeLifeDays;
    if (!fridgeLifeDays) continue;
    const cookedDay = firstCookedDay.get(entry.recipe?.id);
    if (cookedDay == null) continue;
    if (entry.dayOfWeek - cookedDay > fridgeLifeDays) stale.add(entry.id);
  }

  return stale;
}

function PlannerHeaderNav({ weekStart, onChangeWeek, hasEntries, onCopyLastWeek }) {
  return (
    <div className="riso-planner-nav-row">
      <button
        type="button"
        className="riso-planner-nav-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, -1))}
        aria-label="Previous week"
      >
        ‹
      </button>
      <span className="riso-planner-week-label">{formatWeekRangeLabel(weekStart).replace(/, \d{4}$/, "")}</span>
      <button
        type="button"
        className="riso-planner-nav-arrow"
        onClick={() => onChangeWeek(shiftWeek(weekStart, 1))}
        aria-label="Next week"
      >
        ›
      </button>
      {isCurrentWeek(weekStart) ? (
        <span className="riso-planner-week-badge">this week</span>
      ) : (
        <button type="button" className="riso-chip small" onClick={() => onChangeWeek(currentWeekStart())}>
          This week
        </button>
      )}
      {!hasEntries && (
        <button type="button" className="riso-chip small" onClick={onCopyLastWeek}>
          Copy last week's plan
        </button>
      )}
    </div>
  );
}

// Title row (week nav, title, Fill/Build buttons) and the how-it-works
// strip, rendered full width above the board + tray row.
export function PlannerHeader({
  user,
  weekStart,
  onChangeWeek,
  hasEntries,
  onCopyLastWeek,
  emptyCount,
  onFillEmptySlots,
}) {
  return (
    <>
      <div className="riso-planner-header">
        <div className="riso-planner-header-left">
          <PlannerHeaderNav
            weekStart={weekStart}
            onChangeWeek={onChangeWeek}
            hasEntries={hasEntries}
            onCopyLastWeek={onCopyLastWeek}
          />
          <h1 className="riso-planner-title">
            The week <span className="accent">ahead.</span>
          </h1>
        </div>
        <div className="riso-planner-header-actions">
          <button type="button" className="riso-btn" onClick={onFillEmptySlots} disabled={emptyCount === 0}>
            {emptyCount > 0 ? `Fill ${emptyCount} empty slot${emptyCount === 1 ? "" : "s"}` : "All slots filled ✓"}
          </button>
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="planner-v4">
        Drag a recipe from the tray onto any slot, or drag meals between days to move them. Click an empty
        slot to write on it (like "Hockey pool"); click a blank card again to clear it. The grocery list
        builds itself from what's planned. A blue outline means you already have everything for that meal.
      </HintStrip>
    </>
  );
}

function stateLabel(entry) {
  if (entry.alreadyHave) return "Already have everything (off the grocery list) - click to clear";
  if (entry.isLeftover) return "Leftover (off the grocery list) - click to mark as already have everything";
  return "Click to mark as leftover (keeps it off the grocery list), click again for already have everything";
}

// "on sale: chicken" / "stock-up: chicken +1" - ingredients of a meal that
// are at a good price this week. Meals that buy nothing don't show it.
export function dealChipText(found) {
  const lead = found[0];
  const more = found.length > 1 ? ` +${found.length - 1}` : "";
  return `${lead.quality.level === "stock-up" ? "stock-up" : "on sale"}: ${lead.name}${more}`;
}

function PlannerMealCard({ entry, isPast, isStale, dealsByCore, onClick, onRemove, onCycleState }) {
  const { recipe } = entry;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe, entryId: entry.id },
  });

  // Leftovers and "already have everything" meals add nothing to the
  // grocery list - the card says so.
  const offList = entry.isLeftover || entry.alreadyHave;
  const goodDeals = offList || isPast ? [] : recipeGoodDeals(recipe, dealsByCore);
  const classes = ["riso-planner-card"];
  if (entry.alreadyHave) classes.push("have");
  if (offList) classes.push("off-list");
  if (isPast) classes.push("past");
  if (isDragging) classes.push("dragging");

  return (
    <div
      ref={setNodeRef}
      className={classes.join(" ")}
      onClick={onClick}
      {...listeners}
      {...attributes}
      aria-label={`${recipe.title} - open, or drag to another slot`}
    >
      <div className="riso-planner-card-photo-wrap">
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} className="riso-planner-card-photo" draggable="false" />
        ) : (
          <div className="riso-planner-card-photo placeholder" />
        )}
        {entry.isLeftover && (
          <span className={`riso-planner-card-leftover${isStale ? " stale" : ""}`}>
            {isStale ? "⚠ past fridge life" : "leftover"}
          </span>
        )}
        {offList && (
          <span className="riso-planner-card-offlist" title="Nothing from this meal goes on the grocery list">
            🛒 off the list
          </span>
        )}
      </div>
      <button
        type="button"
        className={`riso-planner-card-have${entry.alreadyHave ? " on" : ""}`}
        aria-label={stateLabel(entry)}
        title={stateLabel(entry)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onCycleState();
        }}
      >
        {entry.alreadyHave ? "✓" : ""}
      </button>
      <button
        type="button"
        className="riso-planner-card-remove"
        aria-label={`Remove ${recipe.title} from this slot`}
        title="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
      <div className="riso-planner-card-body">
        <p className="riso-planner-card-name">{recipe.title}</p>
        {goodDeals.length > 0 && (
          <span
            className={`riso-planner-card-deal ${goodDeals[0].quality.level}`}
            title={goodDeals.map(describeDeal).join("\n")}
          >
            🏷 {dealChipText(goodDeals)}
          </span>
        )}
      </div>
    </div>
  );
}

// A slot you've written on (or clicked to leave blank). Click written text
// to edit it; click a blank card to clear the slot again.
export function NoteTextarea({ initial, label, onSave, className }) {
  return (
    <textarea
      autoFocus
      className={className}
      aria-label={label}
      defaultValue={initial}
      placeholder="Write anything…"
      rows={2}
      maxLength={80}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function PlannerNoteCard({ entry, isPast, editing, onEdit, onSave, onClear }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `planner-${entry.id}`,
    data: { recipe: entry.recipe, entryId: entry.id },
    disabled: editing,
  });
  const text = isCustomNote(entry) ? entry.recipe.title : "";

  if (editing) {
    return (
      <div ref={setNodeRef} className={`riso-planner-note editing${isPast ? " past" : ""}`}>
        <NoteTextarea initial={text} label="Write on this slot" onSave={onSave} className="riso-planner-note-input" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`riso-planner-note${text ? "" : " blank"}${isPast ? " past" : ""}${isDragging ? " dragging" : ""}`}
      onClick={text ? onEdit : onClear}
      title={text ? "Click to edit" : "Click to clear this slot"}
      {...listeners}
      {...attributes}
      aria-label={text ? `${text} - click to edit, or drag to another slot` : "Blank - click to clear"}
    >
      {text && <span className="riso-planner-note-text">{text}</span>}
    </div>
  );
}

function PlannerCell({
  dayIndex,
  mealType,
  entries,
  staleIds,
  dealsByCore,
  isPast,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onEditNote,
  onSaveNote,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });
  // One thing per slot. Older plans can hold two; show the first, and
  // placing or moving into the slot replaces them all.
  const entry = entries[0];

  return (
    <div ref={setNodeRef} className={`riso-planner-cell${isOver ? " drop-active" : ""}`}>
      {!entry ? (
        <button
          type="button"
          className="riso-planner-cell-empty"
          aria-label={`Write on ${MEAL_LABEL[mealType]}, ${DAY_SHORT[dayIndex]}`}
          onClick={() => onWriteInSlot({ dayOfWeek: dayIndex, mealType })}
        />
      ) : isNoteEntry(entry) ? (
        <PlannerNoteCard
          entry={entry}
          isPast={isPast}
          editing={editingNoteId === entry.id}
          onEdit={() => onEditNote(entry.id)}
          onSave={(text) => onSaveNote(entry.id, text)}
          onClear={() => onRemove(entry.id)}
        />
      ) : (
        <PlannerMealCard
          entry={entry}
          isPast={isPast}
          isStale={staleIds.has(entry.id)}
          dealsByCore={dealsByCore}
          onClick={() => onCardClick(entry.recipe)}
          onRemove={() => onRemove(entry.id)}
          onCycleState={() => onCycleState(entry.id)}
        />
      )}
    </div>
  );
}

export function PlannerBoard({
  entries,
  weekStart,
  onCardClick,
  onRemove,
  onCycleState,
  editingNoteId,
  onWriteInSlot,
  onEditNote,
  onSaveNote,
  dealsByCore,
}) {
  const grouped = {};
  for (const entry of entries) (grouped[slotKey(entry.dayOfWeek, entry.mealType)] ||= []).push(entry);

  const staleIds = computeStaleLeftoverIds(entries);
  const today = todayIndex();
  const currentWeek = isCurrentWeek(weekStart);
  const scrollRef = useRef(null);
  const [atWeekend, setAtWeekend] = useState(false);

  return (
    <section className="riso-planner-board">
      <div
        className="riso-planner-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtWeekend(el.scrollLeft + el.clientWidth >= el.scrollWidth - 20);
        }}
      >
        <div className="riso-planner-grid">
          <div className="riso-planner-corner" />
          {DAY_INDICES.map((dayIndex) => {
            const { weekday, dayNum, monthShort, isToday } = formatDayLabel(weekStart, dayIndex);
            return (
              <div key={dayIndex} className={`riso-planner-day-header${isToday ? " is-today" : ""}`}>
                <span className="riso-planner-day-weekday">{isToday ? "TODAY" : weekday.toUpperCase()}</span>
                <span className="riso-planner-day-date">
                  {monthShort} {dayNum}
                </span>
              </div>
            );
          })}

          {MEAL_TYPES.map((meal) => (
            <Fragment key={meal.id}>
              <div className="riso-planner-meal-label">{meal.label}</div>
              {DAY_INDICES.map((dayIndex) => (
                <PlannerCell
                  key={`${dayIndex}-${meal.id}`}
                  dayIndex={dayIndex}
                  mealType={meal.id}
                  entries={grouped[slotKey(dayIndex, meal.id)] || []}
                  staleIds={staleIds}
                  dealsByCore={dealsByCore}
                  isPast={currentWeek && dayIndex < today}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                  editingNoteId={editingNoteId}
                  onWriteInSlot={onWriteInSlot}
                  onEditNote={onEditNote}
                  onSaveNote={onSaveNote}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="riso-planner-legend">
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-have" />
          You already have everything
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-leftover">leftover</span>From an earlier meal
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-card-offlist in-legend">🛒 off the list</span>Adds nothing to the grocery list
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-card-deal good in-legend">🏷 on sale</span>An ingredient is at a good price this week
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-blank" />
          Click an empty slot to write on it
        </span>
        <button
          type="button"
          className="riso-planner-legend-scroll"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ left: atWeekend ? 0 : el.scrollWidth, behavior: "smooth" });
          }}
        >
          {atWeekend ? "← back to the weekdays" : "scroll for the weekend →"}
        </button>
      </div>
    </section>
  );
}

// Above the board: this week's planned meals that use good flyer prices,
// with what's on sale where - so the list can be shopped at the right store.
export function PlannerDealsStrip({ entries, dealsByCore, onOpenRecipe }) {
  const byIngredient = new Map();
  for (const entry of entries) {
    if (!entry.recipe || entry.isLeftover || entry.alreadyHave || isNoteEntry(entry)) continue;
    for (const found of recipeGoodDeals(entry.recipe, dealsByCore)) {
      if (!byIngredient.has(found.core)) byIngredient.set(found.core, { ...found, recipes: [] });
      const row = byIngredient.get(found.core);
      if (!row.recipes.some((r) => r.id === entry.recipe.id)) row.recipes.push(entry.recipe);
    }
  }
  const rows = [...byIngredient.values()].sort(
    (a, b) => (a.quality.level === "stock-up" ? 0 : 1) - (b.quality.level === "stock-up" ? 0 : 1)
  );
  if (rows.length === 0) return null;

  return (
    <section className="riso-planner-deals" aria-label="Good prices in this week's plan">
      <span className="riso-planner-deals-badge">
        {rows.length} good price{rows.length === 1 ? "" : "s"} in your plan
      </span>
      <ul>
        {rows.slice(0, 6).map((row) => (
          <li key={row.core} className={row.quality.level}>
            <strong>{row.name}</strong> {row.deal.price} at {row.deal.store}
            <span className="riso-planner-deals-why"> · {row.quality.reason}</span>
            <span className="riso-planner-deals-for">
              {" "}
              for{" "}
              {row.recipes.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => onOpenRecipe(r)}>
                    {r.title}
                  </button>
                </span>
              ))}
            </span>
          </li>
        ))}
        {rows.length > 6 && <li className="more">and {rows.length - 6} more</li>}
      </ul>
    </section>
  );
}
