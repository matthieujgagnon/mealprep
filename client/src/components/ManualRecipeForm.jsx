import { useEffect, useState } from "react";
import { api } from "../api.js";
import { stepText, stepImage } from "../lib/steps.js";
import { UNIT_OPTIONS } from "../lib/groceryList.js";
import { parseQuantityInput } from "../lib/units.js";
import { estimateFridgeLifeDays } from "../lib/fridgeLife.js";

const emptyIngredient = () => ({ name: "", quantity: "", unit: "", notes: "" });

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
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({
          name: ing.name || "",
          quantity: ing.quantity ?? "",
          unit: ing.unit || "",
          notes: ing.notes || "",
        }))
      : [emptyIngredient()]
  );
  const [instructionsText, setInstructionsText] = useState(
    recipe?.instructions?.map(stepText).join("\n") || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Live one-time smart default: as ingredients are typed in, suggest a
  // fridge-life value based on what's most perishable in the list. Only
  // applies while creating a new recipe and only until the user edits the
  // field themselves — see fridgeLifeTouched above.
  useEffect(() => {
    if (isEditing || fridgeLifeTouched) return;
    const names = ingredients.map((ing) => ing.name).filter(Boolean);
    if (names.length === 0) return;
    setFridgeLifeDays(String(estimateFridgeLifeDays(names)));
  }, [ingredients, isEditing, fridgeLifeTouched]);

  function updateIngredient(i, field, value) {
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing))
    );
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
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

  // A step keeps its already-imported photo only if its text is unchanged —
  // otherwise we'd be attaching an old picture to a rewritten step. New or
  // edited lines just don't get a photo here (add one by re-importing, or
  // this is a manual recipe with no photos to begin with).
  //
  // Also strips leading "* " / "- " / "• " bullet markers, since pasting a
  // recipe from another app or a PDF usually brings those along and they'd
  // otherwise show up literally in each step's text. Section headers like
  // "1. Make the Sauce:" are left as-is here — they're detected and rendered
  // as headings (no step number) at display time, not parsed out here.
  function buildInstructions() {
    const lines = instructionsText
      .split("\n")
      .map((s) => s.trim().replace(/^[*\-•]\s*/, "").trim())
      .filter(Boolean);
    const originalSteps = recipe?.instructions || [];
    return lines.map((text) => {
      const matchingOriginal = originalSteps.find((step) => stepText(step) === text);
      const image = matchingOriginal ? stepImage(matchingOriginal) : null;
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
        baseServings: Number(baseServings) || 4,
        prepTimeMinutes: prepTimeMinutes !== "" ? Number(prepTimeMinutes) : null,
        cookTimeMinutes: cookTimeMinutes !== "" ? Number(cookTimeMinutes) : null,
        fridgeLifeDays: fridgeLifeDays !== "" ? Number(fridgeLifeDays) : null,
        instructions: buildInstructions(),
        ingredients: ingredients
          .filter((ing) => ing.name.trim())
          .map((ing, i) => ({
            name: ing.name.trim(),
            quantity: parseQuantityInput(ing.quantity),
            unit: ing.unit.trim() || null,
            notes: ing.notes.trim() || null,
            position: i,
          })),
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
          {url.trim() && <img src={url.trim()} alt="" className="photo-row-preview" />}
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
      {ingredients.map((ing, i) => (
        <div className="form-row ingredient-row" key={i}>
          <input
            type="text"
            placeholder="Name (e.g. butter)"
            value={ing.name}
            onChange={(e) => updateIngredient(i, "name", e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Qty (1/4)"
            value={ing.quantity}
            onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            value={ing.unit}
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
            value={ing.notes}
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
        </div>
      ))}
      <button type="button" className="btn subtle" onClick={addIngredientRow}>
        + Add ingredient
      </button>

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
      {isEditing && recipe.instructions?.some(stepImage) && (
        <p className="form-hint">
          Steps with an imported photo keep it as long as you don't change that
          step's text.
        </p>
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
