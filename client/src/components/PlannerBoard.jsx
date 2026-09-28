import { Fragment, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { HintStrip } from "./RisoControls.jsx";
import {
  currentWeekStart,
  formatDayLabel,
  formatWeekRangeLabel,
  isCurrentWeek,
  mondayOf,
  parseDateKey,
  shiftWeek,
  toDateKey,
} from "../lib/dates.js";

const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];
const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

// The "no meal planned" marker is a real (hidden) placeholder recipe under
// the hood — see server/src/routes/planner.js's POST /blank — so it can be
// placed on the planner the same way any other recipe is, with no schema
// change needed. This just recognizes it here to render it differently from
// a normal meal card.
export function isBlankMarker(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title === "No meal planned";
}

// A custom note ("sandwich", "ordering food", "at a friend's") is the same
// placeholder-recipe mechanism as the blank marker, just with the user's
// own text as the title instead of the fixed "No meal planned" one — see
// PUT /api/planner/:id/note.
export function isCustomNote(entry) {
  return entry.recipe?.isPlaceholder && entry.recipe?.title !== "No meal planned";
}

// The first day+mealType (Mon breakfast, Mon lunch, ... Sun dinner) with
// nothing planned yet. Shared by "Fill empty slots" (which needs the whole
// walk), the sidebar's "good for {day}" suggestions, and its "plan around"
// quick-add — all three need to agree on the exact same ordering, so this
// is the one place that ordering lives.
const MEAL_ORDER = ["breakfast", "lunch", "dinner"];
export function findNextEmptySlot(entries) {
  const filled = new Set(entries.map((e) => `${e.dayOfWeek}-${e.mealType}`));
  for (let day = 0; day < 7; day++) {
    for (const mealType of MEAL_ORDER) {
      if (!filled.has(`${day}-${mealType}`)) return { dayOfWeek: day, mealType };
    }
  }
  return null;
}

// A leftover card is "stale" once more days have passed since the earliest
// non-leftover placement of that same recipe this week than the recipe's
// fridgeLifeDays allows. Only meaningful within a single week's board — the
// planner has no real calendar dates, just Mon–Sun slots, so this compares
// day-of-week positions rather than actual elapsed days.
export function computeStaleLeftoverIds(entries) {
  const stale = new Set();
  const firstCookedDay = new Map();

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const recipeId = entry.recipe?.id;
    if (!recipeId) continue;
    const prevDay = firstCookedDay.get(recipeId);
    if (prevDay === undefined || entry.dayOfWeek < prevDay) {
      firstCookedDay.set(recipeId, entry.dayOfWeek);
    }
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
  function handleDatePick(e) {
    const value = e.target.value;
    if (!value) return;
    onChangeWeek(toDateKey(mondayOf(parseDateKey(value))));
  }

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
      <span className="riso-planner-week-label">{formatWeekRangeLabel(weekStart)}</span>
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
          Today
        </button>
      )}
      <input
        type="date"
        className="riso-planner-date-picker"
        value={weekStart}
        onChange={handleDatePick}
        aria-label="Jump to the week containing a date"
      />
      {!hasEntries && (
        <button type="button" className="riso-chip small" onClick={onCopyLastWeek}>
          Copy last week's plan
        </button>
      )}
    </div>
  );
}

// The page-level title row (week nav, big title, Fill/Build buttons) plus
// the dismissible "how it works" strip — rendered once, full width, above
// the board+sidebar row (which is why this is a separate export from
// PlannerBoard: the row below needs the board and the sidebar as siblings,
// not this header, in the same flex context).
export function PlannerHeader({
  user,
  weekStart,
  onChangeWeek,
  hasEntries,
  onCopyLastWeek,
  onFillEmptySlots,
  fillDisabled,
  groceryCount,
  onGoToGrocery,
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
          <button type="button" className="riso-btn" onClick={onFillEmptySlots} disabled={fillDisabled}>
            Fill empty slots
          </button>
          <button type="button" className="riso-btn primary" onClick={onGoToGrocery}>
            Build grocery list · {groceryCount}
          </button>
        </div>
      </div>

      <HintStrip userId={user.id} screenKey="planner">
        Drag recipes between slots. Click an empty slot to add a meal, or type a note like "Work
        lunch". Build grocery list collects everything you still need, skipping leftovers and
        meals you already have food for.
      </HintStrip>
    </>
  );
}

// Case-insensitive substring match on the title only — the popover is a
// quick "find the recipe I'm thinking of" search, not the fuller
// title/tag/ingredient search the Recipes tab offers.
function matchesTitle(recipe, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return recipe.title?.toLowerCase().includes(q) ?? false;
}

// Anchored under the empty slot that opened it. Subsumes what used to be
// "click to mark blank" for a truly empty cell: search+pick a recipe, mark
// the slot skipped/eating-out, or write a custom note instead — all without
// leaving the board.
function PlannerAddPopover({ recipes, onPick, onSkip, onNote }) {
  const [query, setQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const filtered = recipes.filter((r) => matchesTitle(r, query)).slice(0, 30);

  return (
    <div className="riso-add-popover" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        className="riso-add-popover-search"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="riso-add-popover-list">
        {filtered.length === 0 ? (
          <p className="riso-add-popover-empty">No recipes match.</p>
        ) : (
          filtered.map((r) => (
            <button key={r.id} type="button" className="riso-add-popover-row" onClick={() => onPick(r)}>
              {r.photoUrl ? (
                <img src={r.photoUrl} alt="" className="riso-add-popover-row-photo" />
              ) : (
                <span className="riso-add-popover-row-photo placeholder" />
              )}
              <span className="riso-add-popover-row-title">{r.title}</span>
            </button>
          ))
        )}
      </div>
      <div className="riso-add-popover-footer">
        <button type="button" className="riso-btn small full" onClick={onSkip}>
          Skip / eating out
        </button>
        <form
          className="riso-add-popover-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (noteDraft.trim()) onNote(noteDraft.trim());
          }}
        >
          <input
            type="text"
            className="riso-add-popover-note-input"
            placeholder="…or write a note, e.g. sandwich"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
        </form>
      </div>
    </div>
  );
}

// A genuinely empty cell (no entry at all). Clicking it opens the recipe
// picker popover — closes on an outside click, Escape, or a successful pick.
function PlannerEmptySlot({ dayIndex, mealType, plannableRecipes, onAddToPlanner, onMarkBlank, onSetNote }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="riso-planner-cell-empty-wrap" ref={wrapRef}>
      <button type="button" className="riso-planner-cell-empty" onClick={() => setOpen((o) => !o)}>
        + add
      </button>
      {open && (
        <PlannerAddPopover
          recipes={plannableRecipes}
          onPick={(recipe) => {
            onAddToPlanner(recipe.id, dayIndex, mealType);
            setOpen(false);
          }}
          onSkip={() => {
            onMarkBlank(dayIndex, mealType);
            setOpen(false);
          }}
          onNote={(note) => {
            onSetNote({ entryId: null, dayIndex, mealType, note });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// The dashed no-recipe slot once it's already blank-marked or carrying a
// custom note. The small pencil button keeps the same inline-edit behavior
// the planner has always had for this case — only a truly empty slot (see
// PlannerEmptySlot above) changed its default-click behavior.
function PlannerNoteSlot({ noteText, onClear, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(noteText);

  function startEdit() {
    setDraft(noteText);
    setEditing(true);
  }
  function commit() {
    onSave(draft.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="riso-planner-cell-note-wrap">
        <div className="riso-planner-cell-note editing">
          <input
            autoFocus
            type="text"
            className="riso-planner-note-input"
            value={draft}
            placeholder="e.g. sandwich, ordering food…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            onBlur={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="riso-planner-cell-note-wrap">
      <button
        type="button"
        className="riso-planner-cell-note"
        title={`${noteText || "Skipped"} — click to clear`}
        onClick={onClear}
      >
        <span className="riso-planner-note-label">✎ NOTE</span>
        <span className="riso-planner-note-text">{noteText || "Skipped"}</span>
      </button>
      <button
        type="button"
        className="riso-planner-note-edit-btn"
        aria-label="Edit note"
        title="Edit note (e.g. “sandwich”, “ordering food”)"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
      >
        ✎
      </button>
    </div>
  );
}

// The filled-slot Riso meal card — photo top 60%, name clamped to 2 lines
// below it, a leftover sticker and an "already have it" check circle. Keeps
// the same dnd-kit wiring the old MealCard-based cell used (dragId
// "planner-{entryId}", dragData {entryId}) so repositioning between cells
// via App.jsx's handleDragEnd keeps working unchanged.
function PlannerMealCard({ entry, isToday, isPast, isStale, onClick, onRemove, onCycleState }) {
  const { recipe } = entry;
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `planner-${entry.id}`,
    data: { recipe, entryId: entry.id },
    disabled: { draggable: false, droppable: true },
  });

  const style = {};
  if (isPast) style.opacity = 0.5;
  if (isToday) style.boxShadow = "var(--riso-shadow-today)";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`riso-planner-card${isDragging ? " dragging" : ""}`}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <div className="riso-planner-card-photo-wrap">
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" className="riso-planner-card-photo" />
        ) : (
          <div className="riso-planner-card-photo placeholder" />
        )}
        {entry.isLeftover && (
          <span className={`riso-planner-card-leftover${isStale ? " stale" : ""}`}>
            {isStale ? "⚠ past fridge life" : "leftover"}
          </span>
        )}
      </div>
      {entry.alreadyHave && (
        <span className="riso-planner-card-have" title="Already have it — not added to groceries">
          ✓
        </span>
      )}
      <button
        type="button"
        className="riso-planner-card-status"
        aria-label={
          entry.isLeftover
            ? "Marked as leftovers — click to mark as already have it instead"
            : entry.alreadyHave
            ? "Marked as already have it — click to clear"
            : "Click to mark as leftovers, click again for “already have it”"
        }
        title="Cycle: plain → leftover → already have it"
        onClick={(e) => {
          e.stopPropagation();
          onCycleState();
        }}
      >
        {entry.isLeftover ? "L" : entry.alreadyHave ? "✓" : ""}
      </button>
      <button
        type="button"
        className="riso-planner-card-remove"
        aria-label={`Remove ${recipe.title} from this slot`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
      <div className="riso-planner-card-body">
        <p className="riso-planner-card-name">{recipe.title}</p>
      </div>
    </div>
  );
}

function PlannerCell({
  dayIndex,
  mealType,
  entries,
  staleIds,
  plannableRecipes,
  isToday,
  isPast,
  onCardClick,
  onRemove,
  onCycleState,
  onMarkBlank,
  onSetNote,
  onAddToPlanner,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}-${mealType}` });

  return (
    <div ref={setNodeRef} className={`riso-planner-cell${isOver ? " drop-active" : ""}`}>
      {entries.length === 0 && (
        <PlannerEmptySlot
          dayIndex={dayIndex}
          mealType={mealType}
          plannableRecipes={plannableRecipes}
          onAddToPlanner={onAddToPlanner}
          onMarkBlank={onMarkBlank}
          onSetNote={onSetNote}
        />
      )}
      {entries.map((entry) =>
        isBlankMarker(entry) || isCustomNote(entry) ? (
          <PlannerNoteSlot
            key={entry.id}
            noteText={isCustomNote(entry) ? entry.recipe.title : ""}
            onClear={() => onRemove(entry.id)}
            onSave={(note) => onSetNote({ entryId: entry.id, dayIndex, mealType, note })}
          />
        ) : (
          <PlannerMealCard
            key={entry.id}
            entry={entry}
            isToday={isToday}
            isPast={isPast}
            isStale={staleIds.has(entry.id)}
            onClick={() => onCardClick(entry.recipe)}
            onRemove={() => onRemove(entry.id)}
            onCycleState={() => onCycleState(entry.id)}
          />
        )
      )}
    </div>
  );
}

// The board card itself — the grid, day headers and legend. Rendered as a
// flex sibling of <PlannerSidebar> (see App.jsx), with <PlannerHeader>
// (above) covering the page-level title/nav/buttons.
export function PlannerBoard({
  entries,
  weekStart,
  plannableRecipes,
  onCardClick,
  onRemove,
  onCycleState,
  onMarkBlank,
  onSetNote,
  onAddToPlanner,
}) {
  const grouped = {};
  for (const entry of entries) {
    const key = `${entry.dayOfWeek}-${entry.mealType}`;
    (grouped[key] ||= []).push(entry);
  }

  const staleIds = computeStaleLeftoverIds(entries);
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0
  const currentWeek = isCurrentWeek(weekStart);

  return (
    <section className="riso-planner-board">
      <div className="riso-planner-scroll">
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
                  entries={grouped[`${dayIndex}-${meal.id}`] || []}
                  staleIds={staleIds}
                  plannableRecipes={plannableRecipes}
                  isToday={currentWeek && dayIndex === todayIndex}
                  isPast={currentWeek && dayIndex < todayIndex}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onCycleState={onCycleState}
                  onMarkBlank={onMarkBlank}
                  onSetNote={onSetNote}
                  onAddToPlanner={onAddToPlanner}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="riso-planner-legend">
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-check">✓</span>Already have it, not added to groceries
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-leftover">leftover</span>From an earlier meal
        </span>
        <span className="riso-planner-legend-item">
          <span className="riso-planner-legend-note">✎ NOTE</span>Your own text, like "Brunch out"
        </span>
        <span className="riso-planner-legend-scroll">scroll for the weekend →</span>
      </div>
    </section>
  );
}
