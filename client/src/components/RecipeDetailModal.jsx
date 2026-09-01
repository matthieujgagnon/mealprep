import { useState } from "react";
import { api } from "../api.js";
import { stepText, stepImage, stepIsHeading, stepHeadingText } from "../lib/steps.js";
import { findSimilarRecipes, findUnusedPerishables, isPerishable } from "../lib/similarRecipes.js";
import { CookMode } from "./CookMode.jsx";
import { ManualRecipeForm } from "./ManualRecipeForm.jsx";

function formatQuantity(qty) {
  if (qty === null || qty === undefined) return "";
  const rounded = Math.round(qty * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  // Plain "1/4" rather than unicode fraction glyphs — IBM Plex Mono doesn't
  // carry those glyphs, so they were rendering as fallback/tofu symbols.
  const fracMap = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 0.33: "1/3", 0.67: "2/3" };
  const nearestFrac = Object.keys(fracMap).find((f) => Math.abs(f - frac) < 0.05);
  if (nearestFrac) {
    return `${whole > 0 ? whole + " " : ""}${fracMap[nearestFrac]}`;
  }
  return String(rounded);
}

// Ingredients are already sorted by position server-side, and group
// assignment happened in that same order, so same-group ingredients are
// already adjacent — just cluster consecutive runs.
function clusterByGroup(ingredients) {
  const clusters = [];
  for (const ing of ingredients) {
    const last = clusters[clusters.length - 1];
    if (last && last.group === ing.group) {
      last.items.push(ing);
    } else {
      clusters.push({ group: ing.group, items: [ing] });
    }
  }
  return clusters;
}

export function RecipeDetailModal({
  recipe,
  onClose,
  allRecipes = [],
  plannerEntries = [],
  onSelectRecipe,
  onRecipeUpdated,
  onDelete,
  onPlanAround,
}) {
  const defaultServings = recipe.baseServings || 4;
  const [servings, setServings] = useState(defaultServings);
  const [cookModeOn, setCookModeOn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activePhoto, setActivePhoto] = useState(
    recipe.photoUrl || recipe.photos?.[0] || null
  );
  const [brokenPhotos, setBrokenPhotos] = useState(new Set());
  const [tagInput, setTagInput] = useState("");
  const [fridgeLifeDays, setFridgeLifeDays] = useState(recipe.fridgeLifeDays ?? "");

  const unusedPerishables = findUnusedPerishables(recipe, plannerEntries, allRecipes);

  const scale = servings / (recipe.baseServings || 1);
  const gallery = recipe.photos?.length ? recipe.photos : recipe.photoUrl ? [recipe.photoUrl] : [];
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const ingredientClusters = clusterByGroup(recipe.ingredients);
  const similar = findSimilarRecipes(recipe, allRecipes, 4);

  async function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || (recipe.tags || []).includes(tag)) {
      setTagInput("");
      return;
    }
    const updated = await api.updateRecipe(recipe.id, { tags: [...(recipe.tags || []), tag] });
    onRecipeUpdated?.(updated);
    setTagInput("");
  }

  async function removeTag(tag) {
    const updated = await api.updateRecipe(recipe.id, {
      tags: (recipe.tags || []).filter((t) => t !== tag),
    });
    onRecipeUpdated?.(updated);
  }

  async function saveFridgeLifeDays() {
    const value = fridgeLifeDays === "" ? null : Number(fridgeLifeDays);
    if (value === (recipe.fridgeLifeDays ?? null)) return;
    const updated = await api.updateRecipe(recipe.id, { fridgeLifeDays: value });
    onRecipeUpdated?.(updated);
  }

  function handleDeleteClick() {
    if (window.confirm(`Delete "${recipe.title}"? This can't be undone.`)) {
      onDelete?.(recipe.id);
    }
  }

  if (editing) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="card modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          <h2 className="recipe-modal-title">Edit recipe</h2>
          <ManualRecipeForm
            recipe={recipe}
            onSaved={(updated) => {
              onRecipeUpdated?.(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 className="recipe-modal-title">{recipe.title}</h2>
        <div className="recipe-modal-stats-row">
          <div className="recipe-modal-stats">
            {totalTime > 0 && <span>⏱ {totalTime} min</span>}
            <span>🍽 serves {recipe.baseServings}</span>
          </div>
          <div className="recipe-modal-actions">
            {onPlanAround && !recipe.isPlaceholder && (
              <button
                className="btn subtle btn-sm plan-around-btn"
                onClick={() => {
                  onPlanAround(recipe);
                  onClose();
                }}
              >
                🔀 Plan around this
              </button>
            )}
            {!recipe.isPlaceholder && (
              <button className="btn subtle btn-sm" onClick={() => setEditing(true)}>
                ✎ Edit
              </button>
            )}
            {onDelete && (
              <button className="btn subtle btn-sm delete-recipe-btn" onClick={handleDeleteClick}>
                🗑 Delete
              </button>
            )}
          </div>
        </div>

        {!recipe.isPlaceholder && (
          <div className="fridge-life-editor">
            🧊
            <input
              type="number"
              min="0"
              value={fridgeLifeDays}
              onChange={(e) => setFridgeLifeDays(e.target.value)}
              onBlur={saveFridgeLifeDays}
              placeholder="—"
              aria-label="Days good in the fridge as leftovers"
              title="How many days this keeps well as a fridge leftover"
            />
            days good in the fridge as leftovers
          </div>
        )}

        <div className="tag-editor">
          {(recipe.tags || []).map((tag) => (
            <span key={tag} className="tag-chip editable">
              {tag}
              <button aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
                ×
              </button>
            </span>
          ))}
          <input
            className="tag-input"
            type="text"
            placeholder="+ tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={() => tagInput.trim() && addTag()}
          />
        </div>

        {activePhoto && (
          <img
            src={activePhoto}
            alt={recipe.title}
            className="recipe-modal-photo"
            style={{ marginBottom: gallery.length > 1 ? 8 : 18 }}
            onError={() => {
              const next = gallery.find((u) => u !== activePhoto && !brokenPhotos.has(u));
              setBrokenPhotos((prev) => new Set(prev).add(activePhoto));
              if (next) setActivePhoto(next);
            }}
          />
        )}

        {gallery.filter((u) => !brokenPhotos.has(u)).length > 1 && (
          <div className="recipe-modal-gallery">
            {gallery
              .filter((u) => !brokenPhotos.has(u))
              .map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  onClick={() => setActivePhoto(url)}
                  onError={() => setBrokenPhotos((prev) => new Set(prev).add(url))}
                  className={`recipe-modal-thumb${url === activePhoto ? " active" : ""}`}
                />
              ))}
          </div>
        )}

        <div className="control-group">
          <span className="control-label">Servings</span>
          <div className="servings-stepper">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
            >
              −
            </button>
            <span className="count">{servings}</span>
            <button onClick={() => setServings((s) => s + 1)} aria-label="Increase servings">
              +
            </button>
          </div>
          {servings !== defaultServings && (
            <button className="btn subtle btn-sm" onClick={() => setServings(defaultServings)}>
              Reset to {defaultServings}
            </button>
          )}
        </div>

        <p className="section-label">Ingredients</p>
        {unusedPerishables.length > 0 && (
          <div className="perishable-warning">
            <span className="perishable-warning-icon">⏳</span>
            <span>
              <strong>Use it up:</strong> {unusedPerishables.join(", ")} — these are perishable and not used in any other meal you've planned this week.
            </span>
          </div>
        )}
        {ingredientClusters.map((cluster, ci) => (
          <div key={ci}>
            {cluster.group && <p className="ingredient-group-heading">{cluster.group}</p>}
            <ul className="ingredient-list">
              {cluster.items.map((ing) => {
                const scaledQty = ing.quantity != null ? ing.quantity * scale : null;
                const perishable = isPerishable(ing.name);
                return (
                  <li key={ing.id || ing.name} className={perishable ? "perishable-row" : ""}>
                    <span>
                      {ing.name}
                      {ing.notes && <span className="ingredient-notes">, {ing.notes}</span>}
                      {perishable && <span className="perishable-dot" title="Perishable ingredient" />}
                    </span>
                    <span className="qty">
                      {scaledQty != null
                        ? `${formatQuantity(scaledQty)}${ing.unit ? " " + ing.unit : ""}`
                        : ing.unit || ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {recipe.instructions?.length > 0 && (
          <>
            <div className="section-label-row">
              <p className="section-label">Instructions</p>
              <button className="btn primary btn-sm" onClick={() => setCookModeOn(true)}>
                👩‍🍳 Start Cooking
              </button>
            </div>
            <ol className="instructions-list">
              {(() => {
                let stepNumber = 0;
                return recipe.instructions.map((step, i) => {
                  if (stepIsHeading(step)) {
                    return (
                      <li key={i} className="step-heading">
                        {stepHeadingText(step)}
                      </li>
                    );
                  }
                  stepNumber++;
                  const text = stepText(step);
                  const image = stepImage(step);
                  return (
                    <li key={i} className="step-block">
                      <span className="step-block-number">{stepNumber}</span>
                      <div className="step-block-content">
                        {image && <img src={image} alt="" className="step-block-image" />}
                        <p>{text}</p>
                      </div>
                    </li>
                  );
                });
              })()}
            </ol>
          </>
        )}

        {similar.length > 0 && (
          <>
            <p className="section-label">Recipes with similar ingredients</p>
            <div className="similar-recipes-row">
              {similar.map(({ recipe: match, sharedCount }) => (
                <button
                  key={match.id}
                  className="similar-recipe-card"
                  onClick={() => onSelectRecipe?.(match)}
                >
                  {match.photoUrl ? (
                    <img src={match.photoUrl} alt="" />
                  ) : (
                    <div className="similar-recipe-photo-placeholder" />
                  )}
                  <span className="similar-recipe-title">{match.title}</span>
                  <span className="similar-recipe-shared">
                    {sharedCount} shared ingredient{sharedCount !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {recipe.sourceUrl && (
          <div className="recipe-modal-footer">
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="source-link-btn"
              title={recipe.sourceUrl}
            >
              🔗 View original recipe
            </a>
          </div>
        )}
      </div>
      {cookModeOn && <CookMode recipe={recipe} onExit={() => setCookModeOn(false)} />}
    </div>
  );
}
