import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  stepText,
  stepImage,
  stepIsHeading,
  stepHeadingText,
  stepTitle,
  stepBody,
  stepTimer,
  scaleStepText,
} from "../lib/steps.js";
import { findSimilarRecipes, findExpiringSoonInRecipe, isPerishable, core } from "../lib/similarRecipes.js";
import { formatQuantity } from "../lib/units.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { CookMode } from "./CookMode.jsx";
import { ManualRecipeForm } from "./ManualRecipeForm.jsx";

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

// Everything that counts as "have" without being typed in — same rule
// Home.jsx and WhatCanIMake.jsx use: non-expired inventory, plus custom
// pantry staples. Kept independent here rather than imported, matching
// how those two already each keep their own copy.
function buildCombinedHave(pantryInventory, customStaples) {
  const inStock = pantryInventory
    .filter((item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0)
    .map((item) => item.name);
  const haveLower = new Set(inStock.map((n) => n.toLowerCase()));
  const stapleExtra = (customStaples || []).filter((s) => !haveLower.has(s.toLowerCase()));
  return [...inStock, ...stapleExtra];
}

function formatMinutes(totalMinutes) {
  const m = Math.round(totalMinutes);
  if (m < 60) return `${m} MIN`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} HR` : `${h}H ${rem}M`;
}

// The "⋯" menu — Edit / View original recipe / Delete. A transparent
// full-screen catcher behind the menu closes it on any outside click,
// simpler than tracking a ref and a document-level listener for what's
// only ever open a few seconds at a time.
function OptionsMenu({ onEdit, onDelete, sourceUrl, onClose }) {
  return (
    <>
      <div className="rc-menu-catcher" onClick={onClose} />
      <div className="rc-menu">
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            View original recipe ↗
          </a>
        )}
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </>
  );
}

function PhotoLightbox({ photos, index, onIndex, onClose }) {
  const url = photos[index];
  return (
    <div className="rc-lightbox-overlay" onClick={onClose}>
      <button className="modal-close" onClick={onClose} aria-label="Close photo viewer">
        ×
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          className="rc-lightbox-arrow left"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + photos.length) % photos.length);
          }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}
      <img src={url} alt="" className="rc-lightbox-photo" onClick={(e) => e.stopPropagation()} />
      {photos.length > 1 && (
        <button
          type="button"
          className="rc-lightbox-arrow right"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % photos.length);
          }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}
      {photos.length > 1 && (
        <span className="rc-lightbox-count">
          {index + 1} / {photos.length}
        </span>
      )}
    </div>
  );
}

// A step's own inline countdown, started from its timer chip. Independent
// per step (this is a scrollable list, not the one-step-at-a-time cook
// mode, so there's no "keep running across step changes" concept here —
// that's cook mode's own job).
function StepTimerChip({ timer }) {
  const [remaining, setRemaining] = useState(timer.seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      setRunning(false);
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [running, remaining]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const finished = remaining <= 0;

  return (
    <button
      type="button"
      className={`rc-timer-chip${running ? " running" : ""}${finished ? " done" : ""}`}
      onClick={() => {
        if (finished) {
          setRemaining(timer.seconds);
          setRunning(true);
        } else {
          setRunning((r) => !r);
        }
      }}
    >
      {finished ? "✓ DONE" : running ? `⏸ ${mm}:${ss}` : `▶ ${timer.label} TIMER`}
    </button>
  );
}

function StepRow({ step, number, scale }) {
  if (stepIsHeading(step)) {
    return <li className="rc-step-heading">{stepHeadingText(step)}</li>;
  }

  const title = stepTitle(step);
  const body = scale === 1 ? stepBody(step) : scaleStepText(step, scale);
  const image = stepImage(step);
  const timer = stepTimer(step);

  return (
    <li className="rc-step-row">
      <span className="rc-step-number">{number}</span>
      <div className="rc-step-content">
        {title && <div className="rc-step-title">{title}</div>}
        <p className="rc-step-text">{body}</p>
        {timer && <StepTimerChip timer={timer} />}
      </div>
      {image && <img src={image} alt="" className="rc-step-thumb" />}
    </li>
  );
}

export function RecipeDetailModal({
  recipe,
  onClose,
  allRecipes = [],
  plannerEntries = [],
  pantryInventory = [],
  customStaples = [],
  weekStart,
  onSelectRecipe,
  onRecipeUpdated,
  onDelete,
  onPlanAround,
  sharedWithWeek, // ingredient names reused from this week's plan — only set when opened from a "good next addition" suggestion
}) {
  const defaultServings = recipe.baseServings || 4;
  const [servings, setServings] = useState(defaultServings);
  const [cookModeOn, setCookModeOn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [brokenPhotos, setBrokenPhotos] = useState(new Set());
  const [tagInput, setTagInput] = useState("");
  const [phoneTab, setPhoneTab] = useState("ingredients");
  const [addingMissing, setAddingMissing] = useState(false);
  const [addedMissing, setAddedMissing] = useState(false);

  const scale = servings / (recipe.baseServings || 1);
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const ingredientClusters = clusterByGroup(recipe.ingredients);
  const similar = findSimilarRecipes(recipe, allRecipes, 4);

  // Step photos live in the steps below, not the hero gallery — the same
  // image otherwise showed up twice (see the design handoff's own note on
  // this). Falls back to the single legacy photoUrl for older recipes that
  // predate the multi-photo gallery.
  const stepImageUrls = new Set((recipe.instructions || []).map(stepImage).filter(Boolean));
  const rawGallery = recipe.photos?.length ? recipe.photos : recipe.photoUrl ? [recipe.photoUrl] : [];
  const gallery = [...new Set(rawGallery)].filter((u) => !stepImageUrls.has(u) && !brokenPhotos.has(u));
  const heroPhoto = gallery[activePhotoIndex] ?? gallery[0] ?? null;

  const combinedHave = buildCombinedHave(pantryInventory, customStaples);
  const haveCores = new Set(combinedHave.map((n) => core(n)).filter(Boolean));
  const expiringSoonCores = findExpiringSoonInRecipe(recipe, pantryInventory, plannerEntries, allRecipes);

  const allIngredients = recipe.ingredients || [];
  const haveCount = allIngredients.filter((ing) => {
    const c = core(ing.name);
    return c === null || haveCores.has(c);
  }).length;
  const missingIngredients = allIngredients.filter((ing) => {
    const c = core(ing.name);
    return c !== null && !haveCores.has(c);
  });

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

  function handleDeleteClick() {
    setMenuOpen(false);
    if (window.confirm(`Delete "${recipe.title}"? This can't be undone.`)) {
      onDelete?.(recipe.id);
    }
  }

  async function handleAddMissingToGroceryList() {
    if (missingIngredients.length === 0 || !weekStart) return;
    setAddingMissing(true);
    try {
      for (const ing of missingIngredients) {
        await api.addGroceryExtra(weekStart, { name: ing.name, quantity: null, unit: null });
      }
      setAddedMissing(true);
    } finally {
      setAddingMissing(false);
    }
  }

  if (editing) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="card modal-content wide-modal" onClick={(e) => e.stopPropagation()}>
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
      <div className="card modal-content rc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="rc-header">
          <div className="rc-header-left">
            <h2 className="rc-title">{recipe.title}</h2>
            {!recipe.isPlaceholder && (
              <div className="rc-meta-line">
                {[
                  totalTime > 0 && formatMinutes(totalTime),
                  `SERVES ${recipe.baseServings || defaultServings}`,
                  recipe.fridgeLifeDays && `LEFTOVERS KEEP ${recipe.fridgeLifeDays} DAY${recipe.fridgeLifeDays === 1 ? "" : "S"}`,
                ]
                  .filter(Boolean)
                  .map((part, i) => (
                    <span key={i}>
                      {i > 0 && <span className="rc-meta-sep">·</span>}
                      {part}
                    </span>
                  ))}
              </div>
            )}
            <div className="tag-editor">
              {(recipe.tags || []).map((tag) => (
                <span key={tag} className="rc-tag-chip">
                  {tag}
                  <button aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
                    ×
                  </button>
                </span>
              ))}
              <input
                className="rc-tag-input"
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
          </div>
          <div className="rc-header-right">
            {recipe.instructions?.length > 0 && (
              <button type="button" className="rc-btn-primary" onClick={() => setCookModeOn(true)}>
                Start cooking
              </button>
            )}
            {onPlanAround && !recipe.isPlaceholder && (
              <button
                type="button"
                className="rc-btn-secondary"
                onClick={() => {
                  onPlanAround(recipe);
                  onClose();
                }}
              >
                Plan around this
              </button>
            )}
            {!recipe.isPlaceholder && (
              <div className="rc-menu-wrap">
                <button
                  type="button"
                  className="rc-btn-icon"
                  aria-label="More actions"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋯
                </button>
                {menuOpen && (
                  <OptionsMenu
                    onEdit={() => {
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                    onDelete={handleDeleteClick}
                    sourceUrl={recipe.sourceUrl}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {sharedWithWeek?.length > 0 && (
          <p className="shared-with-week-note">
            Reuses {sharedWithWeek.length === 1 ? "an ingredient" : "ingredients"} from this
            week's plan: {sharedWithWeek.join(", ")}
          </p>
        )}

        {heroPhoto && (
          <div className="rc-hero-wrap">
            <img
              src={heroPhoto}
              alt={recipe.title}
              className="rc-hero-photo"
              onClick={() => setLightboxOpen(true)}
              onError={() => setBrokenPhotos((prev) => new Set(prev).add(heroPhoto))}
            />
            {gallery.length > 1 && (
              <button type="button" className="rc-hero-count" onClick={() => setLightboxOpen(true)}>
                {activePhotoIndex + 1} / {gallery.length} PHOTOS
              </button>
            )}
          </div>
        )}

        {lightboxOpen && heroPhoto && (
          <PhotoLightbox
            photos={gallery}
            index={activePhotoIndex}
            onIndex={setActivePhotoIndex}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        <div className="rc-phone-tabs">
          <button
            type="button"
            className={phoneTab === "ingredients" ? "active" : ""}
            onClick={() => setPhoneTab("ingredients")}
          >
            Ingredients · {allIngredients.length}
          </button>
          <button
            type="button"
            className={phoneTab === "steps" ? "active" : ""}
            onClick={() => setPhoneTab("steps")}
          >
            Steps · {recipe.instructions?.length || 0}
          </button>
        </div>

        <div className="rc-body">
          <aside className={`rc-ingredients-panel${phoneTab === "steps" ? " rc-phone-hidden" : ""}`}>
            <div className="rc-panel-header">
              <h3>Ingredients</h3>
              <div className="rc-servings-stepper">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  aria-label="Decrease servings"
                >
                  −
                </button>
                <span>{servings} servings</span>
                <button type="button" onClick={() => setServings((s) => s + 1)} aria-label="Increase servings">
                  +
                </button>
              </div>
            </div>

            {allIngredients.length > 0 && (
              <>
                <div className="rc-have-meter">
                  <span>
                    You have {haveCount} of {allIngredients.length}
                  </span>
                  <div className="rc-have-track">
                    <div
                      className="rc-have-fill"
                      style={{ width: `${allIngredients.length ? (haveCount / allIngredients.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </>
            )}

            {ingredientClusters.map((cluster, ci) => (
              <div key={ci}>
                {cluster.group && <p className="ingredient-group-heading">{cluster.group}</p>}
                <ul className="rc-ingredient-list">
                  {cluster.items.map((ing) => {
                    const scaledQty = ing.quantity != null ? ing.quantity * scale : null;
                    const c = core(ing.name);
                    const have = c === null || haveCores.has(c);
                    const useSoon = c !== null && expiringSoonCores.has(c);
                    return (
                      <li key={ing.id || ing.name} className="rc-ingredient-row">
                        <span className={`rc-ingredient-dot${have ? " have" : ""}`}>{have && "✓"}</span>
                        <span className="rc-ingredient-name">
                          {ing.name}
                          {ing.notes && <span className="ingredient-notes"> {ing.notes}</span>}
                          {isPerishable(ing.name) && <span className="perishable-dot" title="Perishable ingredient" />}
                        </span>
                        {useSoon && <span className="rc-use-soon-badge">USE SOON</span>}
                        <span className="rc-ingredient-qty">
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

            {missingIngredients.length > 0 && weekStart && (
              <button
                type="button"
                className="rc-add-missing-btn"
                onClick={handleAddMissingToGroceryList}
                disabled={addingMissing}
              >
                {addedMissing
                  ? "Added to grocery list ✓"
                  : addingMissing
                  ? "Adding…"
                  : `Add ${missingIngredients.length} missing to grocery list`}
              </button>
            )}

            {expiringSoonCores.size > 0 && (
              <p className="rc-use-soon-footnote">
                {expiringSoonCores.size} use-soon item{expiringSoonCores.size === 1 ? "" : "s"} aren't in any
                other meal this week. This recipe uses {expiringSoonCores.size === 1 ? "it" : "them"} up.
              </p>
            )}
          </aside>

          <div className={`rc-steps-wrap${phoneTab === "ingredients" ? " rc-phone-hidden" : ""}`}>
            {recipe.instructions?.length > 0 && (
              <>
                <h3 className="rc-steps-heading">Steps</h3>
                <ol className="rc-step-list">
                  {(() => {
                    let stepNumber = 0;
                    return recipe.instructions.map((step, i) => {
                      if (!stepIsHeading(step)) stepNumber++;
                      return (
                        <StepRow key={i} step={step} number={stepIsHeading(step) ? null : stepNumber} scale={scale} />
                      );
                    });
                  })()}
                </ol>
              </>
            )}

            {recipe.notes && (
              <div className="rc-notes">
                <p className="rc-notes-label">Notes</p>
                <p className="rc-notes-text">{recipe.notes}</p>
              </div>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <div className="rc-footer">
            <div className="rc-footer-header">
              <h3>Uses the same ingredients</h3>
              {recipe.sourceUrl && (
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="rc-footer-link">
                  View original recipe ↗
                </a>
              )}
            </div>
            <div className="rc-similar-grid">
              {similar.map(({ recipe: match, sharedCount }) => (
                <button key={match.id} type="button" className="rc-similar-card" onClick={() => onSelectRecipe?.(match)}>
                  {match.photoUrl ? (
                    <img src={match.photoUrl} alt="" />
                  ) : (
                    <div className="rc-similar-photo-placeholder" />
                  )}
                  <span className="rc-similar-info">
                    <span className="rc-similar-title">{match.title}</span>
                    <span className="rc-similar-shared">
                      {sharedCount} SHARED
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {cookModeOn && <CookMode recipe={recipe} onExit={() => setCookModeOn(false)} />}
    </div>
  );
}
