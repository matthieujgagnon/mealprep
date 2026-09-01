import { useState } from "react";
import { api } from "../api.js";
import { stepText, stepImage } from "../lib/steps.js";

const emptyIngredient = () => ({ name: "", quantity: "", unit: "" });

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
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({
          name: ing.name || "",
          quantity: ing.quantity ?? "",
          unit: ing.unit || "",
        }))
      : [emptyIngredient()]
  );
  const [instructionsText, setInstructionsText] = useState(
    recipe?.instructions?.map(stepText).join("\n") || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
  function buildInstructions() {
    const lines = instructionsText.split("\n").map((s) => s.trim()).filter(Boolean);
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
            quantity: ing.quantity !== "" ? Number(ing.quantity) : null,
            unit: ing.unit.trim() || null,
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
            onChange={(e) => setFridgeLifeDays(e.target.value)}
            placeholder="e.g. 4"
          />
        </label>
      </div>

      <p className="form-section-label">Ingredients</p>
      {ingredients.map((ing, i) => (
        <div className="form-row ingredient-row" key={i}>
          <input
            type="text"
            placeholder="Name (e.g. flour)"
            value={ing.name}
            onChange={(e) => updateIngredient(i, "name", e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            type="number"
            placeholder="Qty"
            value={ing.quantity}
            onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            placeholder="Unit"
            value={ing.unit}
            onChange={(e) => updateIngredient(i, "unit", e.target.value)}
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
