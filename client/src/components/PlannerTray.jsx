import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { api } from "../api.js";
import { Segmented } from "./RisoControls.jsx";
import { core, groupDealsByIngredient } from "../lib/similarRecipes.js";
import { capitalize } from "../lib/groceryList.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { DAY_SHORT, MEAL_LABEL } from "../lib/plannerSlots.js";
import {
  formatTrayTime,
  planAroundMatches,
  rankRecipesForTray,
  searchRecipes,
  suggestedGroups,
} from "../lib/plannerSuggestions.js";
import { hideBrokenPhoto } from "../lib/photos.js";

const TABS = [
  { id: "suggested", label: "Suggested" },
  { id: "around", label: "Plan around" },
  { id: "all", label: "All" },
];

export function slotLabel(slot) {
  return `${DAY_SHORT[slot.dayOfWeek]} · ${MEAL_LABEL[slot.mealType]}`;
}

// A recipe in the tray, drawn like a card on the Recipes page: photo with
// the time on it, name, how much of it is on hand. Drag it onto a slot, or
// + drops it in the next empty one.
function TrayTile({ tile, onAdd, onOpen, draggable = true }) {
  const { recipe, stats } = tile;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${recipe.id}`,
    data: { recipe, fromTray: true },
    disabled: !draggable,
  });
  const dragProps = draggable ? { ...listeners, ...attributes, "aria-label": `${recipe.title} - drag onto a slot` } : {};
  const time = formatTrayTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  const nothingToBuy = stats.totalCount > 0 && stats.missingCount === 0;
  const pct = stats.totalCount > 0 ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      className={`riso-tray-tile${isDragging ? " dragging" : ""}${draggable ? "" : " static"}${nothingToBuy ? " ready" : ""}`}
      {...dragProps}
    >
      <button
        type="button"
        className="riso-tray-tile-photo"
        onClick={() => onOpen(recipe)}
        aria-label={`Open ${recipe.title}`}
      >
        {recipe.photoUrl && <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} draggable="false" />}
        {time && <span className="riso-tray-tile-time">⏱ {time.toLowerCase()}</span>}
      </button>
      <button
        type="button"
        className="riso-tray-tile-add"
        title="Add to the plan"
        aria-label={`Add ${recipe.title} to the plan`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onAdd(recipe)}
      >
        +
      </button>
      <div className="riso-tray-tile-info">
        <span className="riso-tray-tile-name">{recipe.title}</span>
        {stats.totalCount > 0 && (
          <span className="riso-tray-tile-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
        <span className={`riso-tray-tile-meta${nothingToBuy ? " ready" : ""}`}>
          {nothingToBuy
            ? "nothing to buy!"
            : stats.totalCount > 0
              ? `${stats.missingCount} to buy · ${stats.matchedCount} of ${stats.totalCount} on hand`
              : "no ingredients listed"}
        </span>
        {tile.reason && <span className="riso-tray-tile-reason">{tile.reason}</span>}
      </div>
    </div>
  );
}

function ChipGroup({ label, tone, names, picked, onToggle }) {
  if (names.length === 0) return null;
  return (
    <div className="riso-tray-chip-group">
      <span className="riso-tray-chip-label">{label}</span>
      <div className="riso-tray-chips">
        {names.map((name) => {
          const on = picked.has(core(name) || name.toLowerCase());
          return (
            <button
              key={name}
              type="button"
              className={`riso-tray-chip ${on ? "on" : tone}`}
              aria-pressed={on}
              onClick={() => onToggle(name)}
            >
              {on && "✓"}
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlannerTray({
  deals: sharedDeals,
  recipes,
  upcomingEntries,
  pantryInventory,
  haveCores,
  target,
  onClearTarget,
  onPlaceRecipe,
  onSaveNote,
  onOpenRecipe,
  tab,
  onTabChange,
  picks,
  onPicksChange,
  message,
  inSheet = false,
}) {
  const [ownDeals, setOwnDeals] = useState([]);
  const [query, setQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  // App passes this week's deals in; loads them itself only when used alone.
  useEffect(() => {
    if (sharedDeals) return;
    api
      .getRealDeals()
      .then(setOwnDeals)
      .catch(() => setOwnDeals([]));
  }, [sharedDeals]);
  const deals = sharedDeals || ownDeals;

  // Selecting a note slot pre-fills its text for editing; selecting an empty
  // slot starts blank.
  useEffect(() => {
    setNoteDraft(target?.note || "");
  }, [target?.dayOfWeek, target?.mealType, target?.note]);

  const dealGroups = groupDealsByIngredient(deals, recipes).filter((g) => g.recipeCount > 0);
  const saleCores = new Set(dealGroups.map((g) => g.core));
  const { ranked, expiringCores } = rankRecipesForTray({
    recipes,
    upcomingEntries,
    pantryInventory,
    haveCores,
    saleCores,
  });

  const pickedCores = new Set(picks.map((p) => core(p) || p.toLowerCase()));
  function togglePick(name) {
    const c = core(name) || name.toLowerCase();
    onPicksChange(
      pickedCores.has(c) ? picks.filter((p) => (core(p) || p.toLowerCase()) !== c) : [...picks, capitalize(name)]
    );
  }

  const expiringNames = expiringCores.slice(0, 8).map(capitalize);
  const saleNames = dealGroups.slice(0, 8).map((g) => g.label);
  const shownCores = new Set([...expiringCores, ...dealGroups.slice(0, 8).map((g) => g.core)]);
  const kitchenNames = [
    ...new Set(
      pantryInventory
        .filter((i) => !i.expiresAt || daysUntil(i.expiresAt) >= 0)
        .map((i) => core(i.name))
        .filter((c) => c && !shownCores.has(c))
    ),
  ]
    .slice(0, 10)
    .map(capitalize);
  const listedCores = new Set([...shownCores, ...kitchenNames.map((n) => core(n) || n.toLowerCase())]);
  const otherPicks = picks.filter((p) => !listedCores.has(core(p) || p.toLowerCase()));

  let groups;
  if (tab === "suggested") {
    groups = suggestedGroups(ranked);
  } else if (tab === "around") {
    const matches = planAroundMatches(ranked, pickedCores);
    groups = [
      {
        id: "matches",
        title: pickedCores.size > 0 ? `MATCHES · ${matches.length}` : "PICK INGREDIENTS ABOVE",
        tone: "paper",
        tiles: matches,
      },
    ];
  } else {
    const all = searchRecipes(ranked, query);
    groups = [{ id: "all", title: `ALL RECIPES · ${all.length}`, tone: "paper", tiles: all }];
  }

  const hint = inSheet
    ? "Tap + on a recipe, or type a note below."
    : target
    ? `Tap + on a recipe to put it in ${slotLabel(target)}, or drag it anywhere.`
    : "Drag a recipe onto the board, or tap + to drop it in the next empty slot.";

  return (
    <aside className={`riso-planner-tray${inSheet ? " in-sheet" : ""}`} aria-label="Add recipes">
      <div className="riso-tray-head">
        <h2 className="riso-tray-title">{inSheet && target ? `Add to ${slotLabel(target)}` : "Add recipes"}</h2>
        {target && !inSheet && (
          <span className="riso-tray-target">
            {slotLabel(target)}
            <button type="button" onClick={onClearTarget} aria-label="Clear selected slot">
              ×
            </button>
          </span>
        )}
      </div>
      <p className="riso-tray-hint">{message || hint}</p>

      {target && (
        <input
          type="text"
          className="riso-tray-note-input"
          value={noteDraft}
          placeholder={inSheet ? "✎ Add a note instead, e.g. Eating out ↵" : "…or type a note, e.g. Eating out ↵"}
          aria-label={`Note for ${slotLabel(target)}`}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && noteDraft.trim()) {
              e.preventDefault();
              onSaveNote(noteDraft.trim());
            } else if (e.key === "Escape") {
              onClearTarget();
            }
          }}
        />
      )}

      <div className="riso-tray-tabs">
        <Segmented options={TABS} value={tab} onChange={onTabChange} />
      </div>

      {tab === "around" && (
        <div className="riso-tray-chip-groups">
          <ChipGroup label="EXPIRING" tone="pink" names={expiringNames} picked={pickedCores} onToggle={togglePick} />
          <ChipGroup label="ON SALE" tone="green" names={saleNames} picked={pickedCores} onToggle={togglePick} />
          <ChipGroup label="IN YOUR KITCHEN" tone="paper" names={kitchenNames} picked={pickedCores} onToggle={togglePick} />
          <ChipGroup label="YOUR PICKS" tone="paper" names={otherPicks} picked={pickedCores} onToggle={togglePick} />
          {expiringNames.length + saleNames.length + kitchenNames.length + otherPicks.length === 0 && (
            <p className="riso-tray-empty">Add items to your Inventory, or upload a flyer, to plan around them.</p>
          )}
        </div>
      )}

      {tab === "all" && (
        <input
          type="search"
          className="riso-tray-search"
          value={query}
          placeholder="Search your recipes"
          aria-label="Search your recipes"
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      <div className="riso-tray-list">
        {groups.length === 0 && <p className="riso-tray-empty">No recipes yet.</p>}
        {groups.map((group) => (
          <div key={group.id} className="riso-tray-group">
            <span className={`riso-tray-group-pill ${group.tone}`}>{group.title}</span>
            <div className="riso-tray-cards">
              {group.tiles.map((t) => (
                <TrayTile key={t.recipe.id} tile={t} onAdd={onPlaceRecipe} onOpen={onOpenRecipe} draggable={!inSheet} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
