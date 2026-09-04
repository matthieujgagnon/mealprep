import { useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api.js";
import { stepText, stepImage, stepIsHeading } from "../lib/steps.js";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { estimateFridgeLifeDays } from "../lib/fridgeLife.js";

// A client-only id for drag-and-drop tracking — never sent to the server.
// Needs to be stable across reorders (unlike the array index used as the
// React `key` elsewhere), which is what @dnd-kit/sortable keys off of.
function makeLocalId() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${Math.random().toString(36).slice(2)}`;
}

const emptyIngredient = () => ({ _id: makeLocalId(), name: "", quantity: "", unit: "", notes: "" });
const emptySection = () => ({ _id: makeLocalId(), isSection: true, name: "" });

// Strips a single layer of wrapping parens from a notes value, if present —
// e.g. someone typing "(melted)" out of habit from the placeholder text
// ("Notes (e.g. melted)" is a format example, not a literal instruction to
// include parens). Keeps stored notes consistent with the scraper, which
// does the same normalization for imported recipes.
function stripWrappingParens(text) {
  if (!text) return text;
  const trimmed = text.trim();
  const match = trimmed.match(/^\(([^()]+)\)$/);
  return match ? match[1].trim() : trimmed;
}

// Reconstructs the mixed section+ingredient list the form edits from a
// flat ingredients array — each ingredient carries its own `group` string
// (or null), so a section header is inserted right before the first
// ingredient of each new group as the list is walked in position order.
function buildInitialItems(ingredients) {
  if (!ingredients || ingredients.length === 0) return [emptyIngredient()];
  const items = [];
  let lastGroup; // undefined sentinel — distinct from a real "no group" (null)
  for (const ing of ingredients) {
    const group = ing.group || null;
    if (group && group !== lastGroup) {
      items.push({ _id: makeLocalId(), isSection: true, name: group });
    }
    lastGroup = group;
    items.push({
      _id: makeLocalId(),
      name: ing.name || "",
      quantity: ing.quantity ?? "",
      unit: ing.unit || "",
      notes: stripWrappingParens(ing.notes || ""),
    });
  }
  return items;
}

// Flattens the mixed section+ingredient list back into a plain ingredients
// array for the API — each ingredient's `group` becomes whichever section
// header most recently preceded it (null if none yet).
function buildIngredientsPayload(items) {
  let currentGroup = null;
  const result = [];
  for (const item of items) {
    if (item.isSection) {
      currentGroup = item.name.trim() || null;
      continue;
    }
    if (!item.name.trim()) continue;
    result.push({
      name: item.name.trim(),
      quantity: parseQuantityInput(item.quantity),
      unit: item.unit.trim() || null,
      notes: stripWrappingParens(item.notes.trim()) || null,
      group: currentGroup,
      position: result.length,
    });
  }
  return result;
}

// Some scraped/pasted photo URLs are slow, blocked by the source site's
// hotlink protection, or just dead — a plain <img> just sits there looking
// like it's stuck loading forever with no way to tell what happened. This
// shows an explicit "couldn't load" state on a real error, and also gives up
// after a timeout so a hung request doesn't look identical to one that's
// still legitimately loading.
function PhotoPreview({ url }) {
  const [status, setStatus] = useState("loading"); // "loading" | "loaded" | "failed"

  useEffect(() => {
    setStatus("loading");
    const timeout = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "failed" : s));
    }, 8000);
    return () => clearTimeout(timeout);
  }, [url]);

  if (status === "failed") {
    return (
      <div className="photo-row-preview photo-row-preview-failed" title="Couldn't load this image">
        ⚠
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`photo-row-preview${status === "loading" ? " loading" : ""}`}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("failed")}
    />
  );
}

// Wraps one ingredient or section row so it can be dragged by its handle to
// reorder. The whole row isn't draggable — only the handle carries the
// drag listeners — so clicking into the name/qty/notes inputs still just
// focuses them instead of fighting a drag gesture.
function SortableRow({ id, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      <button
        type="button"
        className="drag-handle"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

// Works in two modes:
//   - create (no `recipe` prop): blank form, calls api.createRecipe, then onCreated(recipe)
//   - edit (`recipe` prop passed): pre-filled from the existing recipe, calls
//     api.updateRecipe, then onSaved(updated)
export function ManualRecipeForm({ recipe, onCreated, onSaved, onCancel }) {
  const isEditing = !!recipe;

  const [title, setTitle] = useState(recipe?.title || "");
  const [photos, setPhotos] = useState(
    recipe?.photos?.length ? recipe.photos : recipe?.photoUrl ? [recipe.photoUrl] : [""]
  );
  const [baseServings, setBaseServings] = useState(recipe?.baseServings || 4);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(recipe?.prepTimeMinutes ?? "");
  const [cookTimeMinutes, setCookTimeMinutes] = useState(recipe?.cookTimeMinutes ?? "");
  const [fridgeLifeDays, setFridgeLifeDays] = useState(recipe?.fridgeLifeDays ?? "");
  // Once the user types into the fridge-life field themselves, stop
  // overwriting it — the suggestion is a one-time starting point, not
  // something that should fight the user's own edit as they keep typing
  // ingredients.
  const [fridgeLifeTouched, setFridgeLifeTouched] = useState(isEditing);
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length ? buildInitialItems(recipe.ingredients) : [emptyIngredient()]
  );
  const [notes, setNotes] = useState(recipe?.notes || "");
  const [instructionsText, setInstructionsText] = useState(
    recipe?.instructions?.map(stepText).join("\n") || ""
  );
  // Step text -> photo URL. Pre-filled from the recipe's existing step
  // images (if editing an imported recipe) so this one map is the single
  // source of truth for every step photo, imported or manually added here.
  const [stepPhotoOverrides, setStepPhotoOverrides] = useState(() => {
    const initial = {};
    for (const step of recipe?.instructions || []) {
      const img = stepImage(step);
      if (img) initial[stepText(step)] = img;
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Live one-time smart default: as ingredients are typed in, suggest a
  // fridge-life value based on what's most perishable in the list. Only
  // applies while creating a new recipe and only until the user edits the
  // field themselves — see fridgeLifeTouched above.
  useEffect(() => {
    if (isEditing || fridgeLifeTouched) return;
    const names = ingredients.filter((i) => !i.isSection).map((ing) => ing.name).filter(Boolean);
    if (names.length === 0) return;
    setFridgeLifeDays(String(estimateFridgeLifeDays(names)));
  }, [ingredients, isEditing, fridgeLifeTouched]);

  function updateSectionName(i, value) {
    setIngredients((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, name: value } : item))
    );
  }

  function updateIngredient(i, field, value) {
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing))
    );
  }

  // Distance-based (not delay-based) activation is fine here, unlike the
  // planner cards — the drag trigger is a dedicated handle button, not
  // overlapping any scrollable content, so there's no swipe-to-scroll
  // gesture to protect against.
  const ingredientSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleIngredientDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setIngredients((prev) => {
      const oldIndex = prev.findIndex((item) => item._id === active.id);
      const newIndex = prev.findIndex((item) => item._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }

  function addSectionRow() {
    setIngredients((prev) => [...prev, emptySection()]);
  }

  function removeIngredientRow(i) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updatePhoto(i, value) {
    setPhotos((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }

  function addPhotoRow() {
    setPhotos((prev) => [...prev, ""]);
  }

  function removePhotoRow(i) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  // A step's photo is looked up by its exact text — stable across reordering
  // or inserting new lines (unlike an index), and consistent with how an
  // imported photo already only survives if the step's text is unchanged.
  // Pre-filled from the recipe's existing step images when editing, so this
  // one map is the single source of truth for every step photo, imported
  // or manually added.
  function updateStepPhoto(text, url) {
    setStepPhotoOverrides((prev) => {
      const next = { ...prev };
      if (url.trim()) next[text] = url.trim();
      else delete next[text];
      return next;
    });
  }

  // A step keeps its photo only if its text is unchanged — otherwise we'd
  // be attaching an old picture to a rewritten step. Also strips leading
  // "* " / "- " / "• " bullet markers, since pasting a recipe from another
  // app or a PDF usually brings those along and they'd otherwise show up
  // literally in each step's text. Section headers like "1. Make the
  // Sauce:" are left as-is here — they're detected and rendered as
  // headings (no step number) at display time, not parsed out here.
  function cleanInstructionLines() {
    return instructionsText
      .split("\n")
      .map((s) => s.trim().replace(/^[*\-•]\s*/, "").trim())
      .filter(Boolean);
  }

  function buildInstructions() {
    return cleanInstructionLines().map((text) => {
      const image = stepPhotoOverrides[text];
      return image ? { text, image } : text;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const cleanedPhotos = photos.map((p) => p.trim()).filter(Boolean);
      const payload = {
        title: title.trim(),
        photoUrl: cleanedPhotos[0] || null,
        photos: cleanedPhotos,
        notes: notes.trim() || null,
        baseServings: Number(baseServings) || 4,
        prepTimeMinutes: prepTimeMinutes !== "" ? Number(prepTimeMinutes) : null,
        cookTimeMinutes: cookTimeMinutes !== "" ? Number(cookTimeMinutes) : null,
        fridgeLifeDays: fridgeLifeDays !== "" ? Number(fridgeLifeDays) : null,
        instructions: buildInstructions(),
        ingredients: buildIngredientsPayload(ingredients),
      };

      if (isEditing) {
        const updated = await api.updateRecipe(recipe.id, payload);
        onSaved?.(updated);
      } else {
        const created = await api.createRecipe(payload);
        onCreated?.(created);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card manual-form" onSubmit={handleSubmit}>
      <label className="form-label">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Grandma's lasagna"
        />
      </label>

      <p className="form-section-label">Photos</p>
      {photos.map((url, i) => (
        <div className="form-row photo-row" key={i}>
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => updatePhoto(i, e.target.value)}
            style={{ flex: 1 }}
          />
          {url.trim() && <PhotoPreview url={url.trim()} />}
          {photos.length > 1 && (
            <button
              type="button"
              className="btn subtle"
              style={{ padding: "6px 10px" }}
              onClick={() => removePhotoRow(i)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn subtle" onClick={addPhotoRow}>
        + Add photo
      </button>

      <div className="form-row" style={{ marginTop: 16 }}>
        <label className="form-label">
          Servings
          <input
            type="number"
            min="1"
            value={baseServings}
            onChange={(e) => setBaseServings(e.target.value)}
          />
        </label>
        <label className="form-label">
          Prep (min)
          <input
            type="number"
            min="0"
            value={prepTimeMinutes}
            onChange={(e) => setPrepTimeMinutes(e.target.value)}
          />
        </label>
        <label className="form-label">
          Cook (min)
          <input
            type="number"
            min="0"
            value={cookTimeMinutes}
            onChange={(e) => setCookTimeMinutes(e.target.value)}
          />
        </label>
        <label className="form-label">
          Fridge life (days)
          <input
            type="number"
            min="0"
            value={fridgeLifeDays}
            onChange={(e) => {
              setFridgeLifeTouched(true);
              setFridgeLifeDays(e.target.value);
            }}
            placeholder="e.g. 4"
          />
        </label>
      </div>
      {!isEditing && !fridgeLifeTouched && fridgeLifeDays !== "" && (
        <p className="form-hint">
          Suggested based on the ingredients so far — edit the number above
          any time.
        </p>
      )}

      <p className="form-section-label">Ingredients</p>
      <p className="form-hint">Drag the ⠿ handle to reorder.</p>
      <DndContext
        sensors={ingredientSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleIngredientDragEnd}
      >
        <SortableContext items={ingredients.map((item) => item._id)} strategy={verticalListSortingStrategy}>
          {ingredients.map((item, i) =>
            item.isSection ? (
              <SortableRow id={item._id} className="form-row section-row" key={item._id}>
                <input
                  type="text"
                  placeholder="Section name (e.g. Dressing)"
                  value={item.name}
                  onChange={(e) => updateSectionName(i, e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn subtle"
                  style={{ padding: "6px 10px" }}
                  onClick={() => removeIngredientRow(i)}
                >
                  ×
                </button>
              </SortableRow>
            ) : (
              <SortableRow id={item._id} className="form-row ingredient-row" key={item._id}>
                <input
                  type="text"
                  placeholder="Name (e.g. butter)"
                  value={item.name}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  style={{ flex: 2 }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Qty (1/4)"
                  value={item.quantity}
                  onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  value={item.unit}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">(none)</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Notes (e.g. melted)"
                  value={item.notes}
                  onChange={(e) => updateIngredient(i, "notes", e.target.value)}
                  style={{ flex: 1 }}
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    className="btn subtle"
                    style={{ padding: "6px 10px" }}
                    onClick={() => removeIngredientRow(i)}
                  >
                    ×
                  </button>
                )}
              </SortableRow>
            )
          )}
        </SortableContext>
      </DndContext>
      <div className="form-row" style={{ gap: 8 }}>
        <button type="button" className="btn subtle" onClick={addIngredientRow}>
          + Add ingredient
        </button>
        <button type="button" className="btn subtle" onClick={addSectionRow}>
          + Add section
        </button>
      </div>

      <label className="form-label" style={{ marginTop: 16 }}>
        Instructions (one step per line)
        <textarea
          rows={5}
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder={"Preheat oven to 350°F\nMix dry ingredients…"}
        />
      </label>
      <p className="form-hint">
        Paste freely — bullet markers (*, -) are stripped automatically, and a
        line ending in a colon (like "Make the Sauce:") is shown as a section
        heading instead of a numbered step.
      </p>

      <label className="form-label" style={{ marginTop: 16 }}>
        Notes (optional)
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={"Used less salt than called for. Great with rice."}
        />
      </label>

      {cleanInstructionLines().filter((line) => !stepIsHeading(line)).length > 0 && (
        <>
          <p className="form-section-label" style={{ marginTop: 16 }}>
            Step photos (optional)
          </p>
          {cleanInstructionLines()
            .filter((line) => !stepIsHeading(line))
            .map((line, i) => (
              <div className="form-row step-photo-row" key={i}>
                <span className="step-photo-preview-text">{line}</span>
                <input
                  type="url"
                  placeholder="Photo URL…"
                  value={stepPhotoOverrides[line] || ""}
                  onChange={(e) => updateStepPhoto(line, e.target.value)}
                  style={{ flex: 1 }}
                />
                {stepPhotoOverrides[line] && <PhotoPreview url={stepPhotoOverrides[line]} />}
              </div>
            ))}
        </>
      )}

      {error && <p className="import-error">{error}</p>}

      <div className="form-row" style={{ marginTop: 16 }}>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : isEditing ? "Save changes" : "Save to cookbook"}
        </button>
        <button className="btn subtle" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
