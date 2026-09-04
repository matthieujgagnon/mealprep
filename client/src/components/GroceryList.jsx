import { useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { api } from "../api.js";
import { buildGroceryList, findMatchingDeal } from "../lib/groceryList.js";
import { formatWeekRangeLabel, isCurrentWeek } from "../lib/dates.js";

// Persisted so a backgrounded phone tab (very normal while standing in a
// store) doesn't wipe out checkmarks mid-shopping-trip. Keyed by ingredient
// core within a given week, so it naturally carries over between visits as
// long as the same ingredient is still on that week's list — there's a
// "Clear checked items" button for starting a fresh trip once a list has
// gone stale. Scoped per weekStart (not one global key) so checking off
// "eggs" while shopping for this week doesn't also mark it checked on a
// different week's list.
function checkedStorageKey(weekStart) {
  return `mealprep-grocery-checked:${weekStart}`;
}

function loadCheckedFromStorage(weekStart) {
  try {
    const raw = localStorage.getItem(checkedStorageKey(weekStart));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function formatQuantity(qty) {
  if (qty === null || qty === undefined) return "";
  const rounded = Math.round(qty * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  // Plain "1/4" instead of unicode fraction glyphs (¼) — several fonts in the
  // design system (IBM Plex Mono in particular) don't carry those glyphs, so
  // they were rendering as tofu/fallback symbols instead of a fraction. Plain
  // digits render correctly everywhere.
  const fracMap = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 0.33: "1/3", 0.67: "2/3" };
  const nearestFrac = Object.keys(fracMap).find((f) => Math.abs(f - frac) < 0.05);
  if (nearestFrac) return `${whole > 0 ? whole + " " : ""}${fracMap[nearestFrac]}`;
  return String(rounded);
}

// A row can carry more than one "part" when two recipes measured the same
// ingredient in ways that can't be combined into a single number (e.g. "¼
// red onion" and "¼ cup diced red onion" — a fraction of a whole onion isn't
// the same kind of quantity as a cup). Render each part and join them, so
// it's still one row instead of a duplicate line item.
function formatParts(parts) {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((p) => (p.quantity != null ? `${formatQuantity(p.quantity)}${p.unit ? " " + p.unit : ""}` : ""))
    .filter(Boolean)
    .join(" + ");
}

function GroceryItemRow({
  item,
  deals,
  checked,
  onToggle,
  draggable,
  onRemoveStaple,
  onUnassign,
  showSources,
  dragId,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId || `grocery-${item.key}`,
    data: { ingredientCore: item.core },
    disabled: !draggable,
  });

  const deal = findMatchingDeal(item.name, deals);

  return (
    <li
      ref={draggable ? setNodeRef : undefined}
      className={`grocery-item${checked ? " checked" : ""}${isDragging ? " dragging" : ""}${draggable ? " draggable" : ""}`}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <label onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="grocery-item-main">
          <span className="grocery-item-namerow">
            <span className="grocery-item-name">
              {item.name}
              {item.varieties.length > 0 && (
                <span className="grocery-item-variety"> ({item.varieties.join(", ")})</span>
              )}
            </span>
            <span className="grocery-item-qty">{formatParts(item.parts)}</span>
          </span>
          {showSources && item.usedIn?.length > 0 && (
            <span className="grocery-item-sources">Used in: {item.usedIn.join(", ")}</span>
          )}
        </span>
      </label>
      {deal && (
        <span className={`deal-flag${deal.category === "protein" ? " sale" : ""}`}>
          {deal.price} · {deal.store}
        </span>
      )}
      {onRemoveStaple && (
        <button
          className="staple-remove-btn"
          aria-label={`Stop treating ${item.name} as a staple`}
          title="Remove from staples"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveStaple(item.core);
          }}
        >
          ×
        </button>
      )}
      {onUnassign && (
        <button
          className="staple-remove-btn"
          aria-label={`Move ${item.name} back to unsorted`}
          title="Remove from this section"
          onClick={(e) => {
            e.stopPropagation();
            onUnassign(item.core);
          }}
        >
          ×
        </button>
      )}
    </li>
  );
}

function StoreSection({
  section,
  items,
  deals,
  checked,
  onToggle,
  onUnassign,
  onDelete,
  onReorder,
  isFirst,
  isLast,
  showSources,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section-drop-${section.id}` });

  return (
    <div ref={setNodeRef} className={`store-section${isOver ? " drop-active" : ""}`}>
      <div className="store-section-header">
        <p className="store-section-title">{section.name}</p>
        <div className="store-section-reorder">
          <button
            disabled={isFirst}
            aria-label={`Move ${section.name} earlier`}
            title="Move earlier"
            onClick={() => onReorder(section.id, "up")}
          >
            ▲
          </button>
          <button
            disabled={isLast}
            aria-label={`Move ${section.name} later`}
            title="Move later"
            onClick={() => onReorder(section.id, "down")}
          >
            ▼
          </button>
          <button
            className="staple-remove-btn"
            aria-label={`Delete section ${section.name}`}
            title="Delete this section"
            onClick={() => onDelete(section.id)}
          >
            ×
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="staples-empty-hint">Drag items here</p>
      ) : (
        <ul className="grocery-list">
          {items.map((item) => (
            <GroceryItemRow
              key={item.key}
              item={item}
              deals={deals}
              checked={!!checked[item.key]}
              onToggle={() => onToggle(item.key)}
              draggable={false}
              onUnassign={onUnassign}
              showSources={showSources}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StaplesSubsection({ dropId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <div ref={setNodeRef} className={`staples-subsection${isOver ? " drop-active" : ""}`}>
      {children}
    </div>
  );
}

function AddSectionForm({ onCreateSection }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn subtle btn-sm" onClick={() => setOpen(true)}>
        + Add store section
      </button>
    );
  }

  return (
    <form
      className="add-section-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreateSection(name.trim());
        setName("");
        setOpen(false);
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder="e.g. Metro, Super C..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name.trim() && setOpen(false)}
      />
      <button className="btn primary btn-sm" type="submit">
        Add
      </button>
    </form>
  );
}

// Groups shopping items by which recipe(s) they're used in. A shared
// ingredient (e.g. garlic used in two recipes) appears under both headings —
// that's intentional, it shows the full picture of what each recipe needs.
function groupItemsByRecipe(items) {
  const map = new Map();
  for (const item of items) {
    for (const recipeName of item.usedIn) {
      if (!map.has(recipeName)) map.set(recipeName, []);
      map.get(recipeName).push(item);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function GroceryList({
  plannerEntries,
  weekStart,
  customStaples,
  stapleCategories,
  onRemoveStaple,
  grocerySections,
  onCreateSection,
  onDeleteSection,
  onReorderSection,
  onUnassignFromSection,
}) {
  const [deals, setDeals] = useState([]);
  const [checked, setChecked] = useState(() => loadCheckedFromStorage(weekStart));
  const [showStaples, setShowStaples] = useState(true);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    api.getDeals().then((d) => setDeals(d.deals)).catch(() => {});
  }, []);

  // Switching weeks swaps in that week's own checkmarks instead of carrying
  // the previous week's over.
  useEffect(() => {
    setChecked(loadCheckedFromStorage(weekStart));
  }, [weekStart]);

  useEffect(() => {
    try {
      localStorage.setItem(checkedStorageKey(weekStart), JSON.stringify(checked));
    } catch {
      // localStorage unavailable (private browsing, quota, etc.) —
      // checkmarks just won't survive a refresh, same as before this existed.
    }
  }, [checked, weekStart]);

  const { setNodeRef: setStaplesDropRef, isOver: isOverStaples } = useDroppable({
    id: "pantry-staples-drop",
  });

  const items = buildGroceryList(plannerEntries, customStaples, stapleCategories);

  // A core assigned to any store section — excluded from the main unsorted list.
  const assignedCores = new Set(
    grocerySections.flatMap((s) => s.assignments.map((a) => a.core))
  );

  const shoppingItems = items.filter((i) => !i.isStaple && !assignedCores.has(i.core));
  const spiceStaples = items.filter((i) => i.isStaple && i.isSpice);
  const otherStaples = items.filter((i) => i.isStaple && !i.isSpice);
  const stapleCount = spiceStaples.length + otherStaples.length;
  const leftoverCount = plannerEntries.filter((e) => e.isLeftover).length;
  const alreadyHaveCount = plannerEntries.filter((e) => e.alreadyHave).length;

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearChecked() {
    setChecked({});
  }

  const hasChecked = Object.values(checked).some(Boolean);

  function isRemovable(item) {
    return customStaples.includes(item.core);
  }

  function itemsForSection(section) {
    const cores = new Set(section.assignments.map((a) => a.core));
    return items.filter((i) => cores.has(i.core));
  }

  const weekLabel = isCurrentWeek(weekStart)
    ? `this week (${formatWeekRangeLabel(weekStart)})`
    : `the week of ${formatWeekRangeLabel(weekStart)}`;

  if (plannerEntries.length === 0) {
    return (
      <p className="empty-state">
        Nothing planned for {weekLabel} yet — plan a few meals on the Planner
        tab first and your grocery list builds itself.
      </p>
    );
  }

  return (
    <div>
      <p className="grocery-week-label">Groceries for {weekLabel}</p>
      <div className="grocery-note">
        <p>
          <strong>{shoppingItems.length}</strong> item{shoppingItems.length !== 1 ? "s" : ""} to
          buy.
        </p>
        <p>
          Drag an item onto a store section or "Pantry staples" below to sort it.
          {leftoverCount > 0 &&
            ` ${leftoverCount} leftover meal${leftoverCount !== 1 ? "s" : ""} excluded.`}
          {alreadyHaveCount > 0 &&
            ` ${alreadyHaveCount} meal${alreadyHaveCount !== 1 ? "s" : ""} you already have the stuff for excluded.`}
        </p>
      </div>

      <button
        className={`btn btn-sm ${showSources ? "primary" : "subtle"}`}
        style={{ marginBottom: 10 }}
        onClick={() => setShowSources((s) => !s)}
      >
        {showSources ? "✓ " : ""}Group by recipe
      </button>
      {hasChecked && (
        <button
          className="btn btn-sm subtle"
          style={{ marginBottom: 10, marginLeft: 8 }}
          onClick={clearChecked}
        >
          Clear checked items
        </button>
      )}

      {showSources ? (
        groupItemsByRecipe(shoppingItems).map(([recipeName, recipeItems]) => (
          <div key={recipeName} className="grocery-recipe-group">
            <p className="grocery-recipe-heading">{recipeName}</p>
            <ul className="grocery-list">
              {recipeItems.map((item) => (
                <GroceryItemRow
                  key={`${item.key}-${recipeName}`}
                  dragId={`grocery-${item.key}-${recipeName}`}
                  item={item}
                  deals={deals}
                  checked={!!checked[item.key]}
                  onToggle={() => toggle(item.key)}
                  draggable
                />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="grocery-list">
          {shoppingItems.map((item) => (
            <GroceryItemRow
              key={item.key}
              item={item}
              deals={deals}
              checked={!!checked[item.key]}
              onToggle={() => toggle(item.key)}
              draggable
            />
          ))}
        </ul>
      )}

      {grocerySections.length > 0 && (
        <div className="store-sections-row">
          {grocerySections.map((section, i) => (
            <StoreSection
              key={section.id}
              section={section}
              items={itemsForSection(section)}
              deals={deals}
              checked={checked}
              onToggle={toggle}
              onUnassign={onUnassignFromSection}
              onDelete={onDeleteSection}
              onReorder={onReorderSection}
              isFirst={i === 0}
              isLast={i === grocerySections.length - 1}
              showSources={showSources}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <AddSectionForm onCreateSection={onCreateSection} />
      </div>

      <div
        ref={setStaplesDropRef}
        className={`staples-section${isOverStaples ? " drop-active" : ""}`}
      >
        <button className="staples-toggle" onClick={() => setShowStaples((s) => !s)}>
          {showStaples ? "▾" : "▸"} Pantry staples you probably have ({stapleCount})
        </button>

        {showStaples && (
          <>
            {stapleCount === 0 && (
              <p className="staples-empty-hint">Drag items here to remember them as staples</p>
            )}

            {stapleCount > 0 && (
              <>
                <p className="staples-subheading">Spices</p>
                <StaplesSubsection dropId="staple-category-spice-drop">
                  {spiceStaples.length === 0 ? (
                    <p className="staples-empty-hint">Drag a staple here to file it as a spice</p>
                  ) : (
                    <ul className="grocery-list staples-list">
                      {spiceStaples.map((item) => (
                        <GroceryItemRow
                          key={item.key}
                          dragId={`staple-${item.key}`}
                          item={item}
                          deals={deals}
                          checked={!!checked[item.key]}
                          onToggle={() => toggle(item.key)}
                          draggable
                          onRemoveStaple={isRemovable(item) ? onRemoveStaple : null}
                        />
                      ))}
                    </ul>
                  )}
                </StaplesSubsection>

                <p className="staples-subheading">Other staples</p>
                <StaplesSubsection dropId="staple-category-other-drop">
                  {otherStaples.length === 0 ? (
                    <p className="staples-empty-hint">Drag a staple here to file it here instead</p>
                  ) : (
                    <ul className="grocery-list staples-list">
                      {otherStaples.map((item) => (
                        <GroceryItemRow
                          key={item.key}
                          dragId={`staple-${item.key}`}
                          item={item}
                          deals={deals}
                          checked={!!checked[item.key]}
                          onToggle={() => toggle(item.key)}
                          draggable
                          onRemoveStaple={isRemovable(item) ? onRemoveStaple : null}
                        />
                      ))}
                    </ul>
                  )}
                </StaplesSubsection>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
