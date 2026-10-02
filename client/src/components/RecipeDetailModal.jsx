import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  stepImage,
  stepIsHeading,
  stepHeadingText,
  stepTitle,
  stepBody,
  stepTimer,
  scaleStepText,
  formatClock,
} from "../lib/steps.js";
import { findSimilarRecipes, findExpiringSoonInRecipe, isPerishable, core, coversIngredient, findSaleDeal, findDealsFor } from "../lib/similarRecipes.js";
import { useDeals } from "../lib/dealsStore.js";
import { SaleTag } from "./SaleTag.jsx";
import { formatQuantity, unitLabel } from "../lib/units.js";
import { daysUntil, formatExpiry, LOCATIONS } from "../lib/pantryInventory.js";
import { CookMode } from "./CookMode.jsx";
import { buildCombinedHave } from "../lib/onHand.js";
import { hideBrokenPhoto } from "../lib/photos.js";

const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEAL_LABEL = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };

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


function formatMinutes(totalMinutes) {
  const m = Math.round(totalMinutes);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h} h${rem ? ` ${rem} min` : ""}`;
  }
  return `${m} min`;
}

function locationLabel(locationId) {
  return LOCATIONS.find((l) => l.id === locationId)?.label || locationId;
}

// The first non-expired inventory item matching this ingredient's core —
// used only to describe *where* it lives in the tap-to-open explainer.
function findMatchedPantryItem(ing, pantryInventory) {
  const c = core(ing.name);
  if (c === null) return null;
  return pantryInventory.find((item) => coversIngredient(item.name, ing.name) && (!item.expiresAt || daysUntil(item.expiresAt) >= 0)) || null;
}

// The "⋯" menu — Edit / View original / Leftovers keep… / Delete. A
// transparent full-screen catcher behind the menu closes it on any
// outside click, simpler than tracking a ref and a document-level
// listener for what's only ever open a few seconds at a time.
function OptionsMenu({ onEdit, onDelete, onEditLeftoverDays, fridgeLifeDays, sourceUrl, onClose }) {
  return (
    <>
      <div className="riso-rc-menu-catcher" onClick={onClose} />
      <div className="riso-rc-menu">
        <button type="button" onClick={onEdit}>
          Edit recipe
        </button>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            View original ↗
          </a>
        )}
        <button type="button" onClick={onEditLeftoverDays}>
          Leftovers keep… {fridgeLifeDays ? `${fridgeLifeDays} day${fridgeLifeDays === 1 ? "" : "s"}` : "not set"}
        </button>
        <div className="riso-rc-menu-divider" />
        <button type="button" className="danger" onClick={onDelete}>
          Delete recipe
        </button>
      </div>
    </>
  );
}

// The full-size photo viewer: ← → flip through the photos, Escape (or the
// ×, or a click outside the photo) closes it - and only it, not the recipe.
function PhotoLightbox({ photos, index, onIndex, onClose }) {
  const url = photos[index];
  useEffect(() => {
    function onKey(e) {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (e.key !== "Escape" && !step) return;
      // Caught on the way down, before the recipe card's own Escape.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      else if (photos.length > 1) onIndex((index + step + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div className="rc-lightbox-overlay" role="dialog" aria-label="Photos" onClick={onClose}>
      <button type="button" className="rc-lightbox-close" onClick={onClose} aria-label="Close photos" title="Close (Esc)">
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

  const finished = remaining <= 0;

  return (
    <button
      type="button"
      className={`riso-rc-timer-chip${running ? " running" : ""}${finished ? " done" : ""}`}
      onClick={() => {
        if (finished) {
          setRemaining(timer.seconds);
          setRunning(true);
        } else {
          setRunning((r) => !r);
        }
      }}
    >
      {finished ? "✓ Done" : running ? `⏸ ${formatClock(remaining)}` : `▶ Start ${timer.label} timer`}
    </button>
  );
}

function StepRow({ step, number, scale }) {
  if (stepIsHeading(step)) {
    return <li className="riso-rc-step-heading">{stepHeadingText(step)}</li>;
  }

  const title = stepTitle(step);
  const body = scale === 1 ? stepBody(step) : scaleStepText(step, scale);
  const image = stepImage(step);
  const timer = stepTimer(step);

  return (
    <li className="riso-rc-step-row">
      <span className="riso-rc-step-number">{number}</span>
      <div className="riso-rc-step-content">
        {title && <div className="riso-rc-step-title">{title}</div>}
        <p className="riso-rc-step-text">{body}</p>
        {timer && <StepTimerChip timer={timer} />}
      </div>
      {image && <img src={image} alt="" className="riso-rc-step-thumb" />}
    </li>
  );
}

function IngredientRow({
  ing,
  status,
  deal,
  saleOthers,
  scaledQty,
  isOpen,
  onToggle,
  onAddOneToGroceryList,
  onAddPantryItem,
  onRemoveFromInventory,
  onNavigate,
  pantryInventory,
}) {
  const have = status !== "need";
  const matched = have ? findMatchedPantryItem(ing, pantryInventory) : null;
  // "+ Grocery list" turns into a quiet "On grocery list ✓" once it's added.
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  async function addToList() {
    setAdding(true);
    try {
      await onAddOneToGroceryList(ing);
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }
  const where = matched ? locationLabel(matched.location) : "inventory";

  let why;
  if (status === "need") {
    why = "Not in your inventory, so it's unchecked. If you already have some, mark it and it's added to Inventory.";
  } else if (status === "soon") {
    const expiry = matched?.expiresAt ? formatExpiry(matched.expiresAt).toLowerCase() : "soon";
    why = `In your ${where}. No other meal this week uses it, so this recipe is a good way to finish it (${expiry}).`;
  } else {
    why = `In your ${where}. Checked automatically. Cooking this recipe takes it out of Inventory.`;
  }

  return (
    <div className="riso-rc-ingredient">
      <button type="button" className="riso-rc-ingredient-row" onClick={onToggle}>
        <span className={`riso-rc-ingredient-dot${have ? " have" : ""}`}>{have && "✓"}</span>
        <span className="riso-rc-ingredient-name">
          {ing.name}
          {ing.notes && <span className="riso-rc-ingredient-note"> {ing.notes}</span>}
          {isPerishable(ing.name) && <span className="perishable-dot" title="Perishable ingredient" />}
        </span>
        {status === "soon" && <span className="riso-rc-use-soon-sticker">use soon!</span>}
        {status === "need" && <SaleTag deal={deal} others={saleOthers} />}
        <span className="riso-rc-ingredient-qty">
          {scaledQty != null
            ? `${formatQuantity(scaledQty)}${ing.unit ? " " + unitLabel(ing.unit, scaledQty) : ""}`
            : unitLabel(ing.unit)}
        </span>
      </button>
      {isOpen && (
        <div className="riso-rc-ingredient-explainer">
          <p>{why}</p>
          <div className="riso-rc-ingredient-actions">
            {status === "need" ? (
              <>
                <button
                  type="button"
                  className={`riso-rc-ing-action primary${added ? " added" : ""}`}
                  onClick={addToList}
                  disabled={adding || added}
                >
                  {added ? "On grocery list ✓" : adding ? "Adding…" : "+ Grocery list"}
                </button>
                <button type="button" className="riso-rc-ing-action" onClick={() => onAddPantryItem({ name: ing.name })}>
                  I have it
                </button>
              </>
            ) : (
              <>
                <button type="button" className="riso-rc-ing-action" onClick={() => onRemoveFromInventory(ing)}>
                  I'm out of this
                </button>
                <button type="button" className="riso-rc-ing-action" onClick={() => onNavigate?.("inventory")}>
                  Open in Inventory
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
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
  onEdit,
  onDelete,
  onPlanAround,
  onAddPantryItem,
  onDeletePantryItem,
  onAddToGroceryList,
  onConsumePantryItems,
  onPlanLeftovers,
  onNavigate,
  sharedWithWeek, // ingredient names reused from this week's plan — only set when opened from a "good next addition" suggestion
  startInCookMode, // true when opened via Makeable's "Cook tonight" - skips straight to cook mode instead of the detail view
}) {
  const defaultServings = recipe.baseServings || 4;
  const [servings, setServings] = useState(defaultServings);
  const [cookModeOn, setCookModeOn] = useState(!!startInCookMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [brokenPhotos, setBrokenPhotos] = useState(new Set());
  const [tagInput, setTagInput] = useState("");
  const [phoneTab, setPhoneTab] = useState("ingredients");
  const [addingMissing, setAddingMissing] = useState(false);
  const [addedMissing, setAddedMissing] = useState(false);
  const [openIngredientKey, setOpenIngredientKey] = useState(null);
  const { deals } = useDeals();


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

  // Open on the cover photo (photoUrl), wherever it sits in the gallery.
  const coverIndex = Math.max(0, gallery.indexOf(recipe.photoUrl));

  // Escape closes the card; ← → flip the cover photo (the photo viewer
  // handles its own keys while it's open). Typing in a field is left alone.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") return onClose();
      if (lightboxOpen || gallery.length < 2) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) setActivePhotoIndex((i) => (i + step + gallery.length) % gallery.length);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.length, lightboxOpen]);
  const coverKey = `${recipe.id}|${coverIndex}`;
  const [seenCoverKey, setSeenCoverKey] = useState(null);
  if (seenCoverKey !== coverKey) {
    setSeenCoverKey(coverKey);
    setActivePhotoIndex(coverIndex);
  }

  const combinedHave = buildCombinedHave(pantryInventory, customStaples);
  const haveCores = new Set(combinedHave.map((n) => core(n)).filter(Boolean));
  const expiringSoonCores = findExpiringSoonInRecipe(recipe, pantryInventory, plannerEntries, allRecipes);

  function ingredientStatus(ing) {
    const c = core(ing.name);
    if (c === null) return "have";
    if (!haveCores.has(c) || !combinedHave.some((n) => coversIngredient(n, ing.name))) return "need";
    if (expiringSoonCores.has(c)) return "soon";
    return "have";
  }

  const allIngredients = recipe.ingredients || [];
  const haveCount = allIngredients.filter((ing) => ingredientStatus(ing) !== "need").length;
  const missingIngredients = allIngredients.filter((ing) => ingredientStatus(ing) === "need");

  // Already scheduled *for the currently-viewed week* — matches the same
  // week `weekStart` would add grocery extras to, which is exactly what
  // the "already on your grocery list" copy needs to stay true.
  const plannedEntry = weekStart
    ? plannerEntries.find((e) => e.recipe?.id === recipe.id && !e.recipe?.isPlaceholder)
    : null;

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

  function handleEditLeftoverDays() {
    setMenuOpen(false);
    const input = window.prompt("Leftovers keep for how many days?", recipe.fridgeLifeDays ?? "");
    if (input === null) return;
    const days = input.trim() === "" ? null : Math.max(0, Math.round(Number(input)));
    if (input.trim() !== "" && Number.isNaN(days)) return;
    api.updateRecipe(recipe.id, { fridgeLifeDays: days }).then((updated) => onRecipeUpdated?.(updated));
  }

  async function handleAddMissingToGroceryList() {
    if (missingIngredients.length === 0 || !weekStart) return;
    setAddingMissing(true);
    try {
      await onAddToGroceryList(missingIngredients.map((ing) => ing.name));
      setAddedMissing(true);
    } finally {
      setAddingMissing(false);
    }
  }

  async function handleAddOneToGroceryList(ing) {
    if (!weekStart) return;
    await onAddToGroceryList([ing.name]);
  }

  async function handleRemoveFromInventory(ing) {
    const c = core(ing.name);
    if (c === null || !onDeletePantryItem) return;
    const matches = pantryInventory.filter((item) => core(item.name) === c);
    for (const item of matches) {
      await onDeletePantryItem(item.id);
    }
  }

  const stickerText = recipe.isPlaceholder
    ? null
    : missingIngredients.length > 0
      ? `${missingIngredients.length} thing${missingIngredients.length === 1 ? "" : "s"} to buy`
      : "nothing to buy!";
  const stickerBg = missingIngredients.length > 0 ? "var(--riso-yellow)" : "var(--riso-green)";

  return (
    <div className="modal-overlay riso-theme" onClick={onClose}>
      <div className="riso-rc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="riso-rc-hero">
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt={recipe.title}
              className="riso-rc-hero-photo"
              onClick={() => setLightboxOpen(true)}
              onError={() => setBrokenPhotos((prev) => new Set(prev).add(heroPhoto))}
            />
          ) : (
            <div className="riso-rc-hero-photo placeholder" />
          )}
          <button type="button" className="riso-rc-back" onClick={onClose}>
            ← Recipes
          </button>
          <div className="riso-rc-hero-actions">
            {!recipe.isPlaceholder && (
              <div className="riso-rc-menu-wrap">
                <button
                  type="button"
                  className="riso-rc-round-btn"
                  aria-label="More actions"
                  title="More"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋯
                </button>
                {menuOpen && (
                  <OptionsMenu
                    onEdit={() => {
                      setMenuOpen(false);
                      onEdit?.(recipe);
                    }}
                    onDelete={handleDeleteClick}
                    onEditLeftoverDays={handleEditLeftoverDays}
                    fridgeLifeDays={recipe.fridgeLifeDays}
                    sourceUrl={recipe.sourceUrl}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            )}
            <button type="button" className="riso-rc-round-btn" title="Close (Esc)" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          {stickerText && (
            <span className="riso-sticker riso-rc-hero-sticker" style={{ background: stickerBg }}>
              {stickerText}
            </span>
          )}
          {gallery.length > 1 && (
            <button
              type="button"
              className="riso-rc-photo-count"
              title="Open the photos (← → to flip)"
              onClick={() => setLightboxOpen(true)}
            >
              {activePhotoIndex + 1} / {gallery.length} PHOTOS
            </button>
          )}
        </div>

        {lightboxOpen && heroPhoto && (
          <PhotoLightbox
            photos={gallery}
            index={activePhotoIndex}
            onIndex={setActivePhotoIndex}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        <div className="riso-rc-content">
          {sharedWithWeek?.length > 0 && (
            <p className="shared-with-week-note">
              Reuses {sharedWithWeek.length === 1 ? "an ingredient" : "ingredients"} from this
              week's plan: {sharedWithWeek.join(", ")}
            </p>
          )}

          <div className="riso-rc-titlebar">
            <div className="riso-rc-titlebar-main">
              <h1 className="riso-rc-title">{recipe.title}</h1>
              {!recipe.isPlaceholder && (
                <div className="riso-rc-meta-line">
                  {[
                    totalTime > 0 && formatMinutes(totalTime),
                    `Serves ${recipe.baseServings || defaultServings}`,
                    recipe.fridgeLifeDays && `Leftovers keep ${recipe.fridgeLifeDays} day${recipe.fridgeLifeDays === 1 ? "" : "s"}`,
                    recipe.sourceUrl && `From ${new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")}`,
                  ]
                    .filter(Boolean)
                    .map((part, i) => (
                      <span key={i}>
                        {i > 0 && <span className="riso-rc-meta-sep">·</span>}
                        {part}
                      </span>
                    ))}
                </div>
              )}
              <div className="riso-rc-tags">
                {(recipe.tags || []).map((tag) => (
                  <span key={tag} className="riso-rc-tag-chip">
                    {tag}
                    <button aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="riso-rc-tag-input"
                  type="text"
                  placeholder="+ Tag"
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
            <div className="riso-rc-actions">
              <div className="riso-rc-actions-row">
                {recipe.instructions?.length > 0 && (
                  <button type="button" className="riso-rc-btn-primary" onClick={() => setCookModeOn(true)}>
                    Start cooking
                  </button>
                )}
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`Opens ${new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")} in a new tab`}
                    className="riso-rc-btn-open-original"
                  >
                    Open original ↗
                  </a>
                )}
              </div>
              {onPlanAround && !recipe.isPlaceholder && (
                <button
                  type="button"
                  className="riso-rc-btn-secondary"
                  onClick={() => {
                    onPlanAround(recipe);
                    onClose();
                  }}
                >
                  Plan around this
                </button>
              )}
            </div>
          </div>

          <div className="riso-rc-phone-tabs">
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

          <div className="riso-rc-body">
            <aside className={`riso-rc-ingredients-panel${phoneTab === "steps" ? " rc-phone-hidden" : ""}`}>
              <div className="riso-rc-panel-header">
                <h3>Ingredients</h3>
                <div className="riso-rc-servings-stepper">
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
                <div className="riso-rc-have-meter">
                  <div className="riso-rc-have-label">
                    You have {haveCount} of {allIngredients.length} in your inventory
                  </div>
                  <div className="riso-rc-have-track">
                    <div
                      className="riso-rc-have-fill"
                      style={{ width: `${allIngredients.length ? (haveCount / allIngredients.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="riso-rc-why-note">
                <span className="riso-rc-why-sticker">why?</span>
                <p>Checks come from your Inventory, so they update on their own. Tap any ingredient to see where it is or to change it.</p>
              </div>

              <div className="riso-rc-ingredient-list">
                {ingredientClusters.map((cluster, ci) => (
                  <div key={ci}>
                    {cluster.group && <p className="ingredient-group-heading">{cluster.group}</p>}
                    {cluster.items.map((ing) => {
                      const key = ing.id || ing.name;
                      const scaledQty = ing.quantity != null ? ing.quantity * scale : null;
                      return (
                        <IngredientRow
                          key={key}
                          ing={ing}
                          status={ingredientStatus(ing)}
                          deal={findSaleDeal(ing.name, deals)}
                          saleOthers={findDealsFor(ing.name, deals)}
                          scaledQty={scaledQty}
                          isOpen={openIngredientKey === key}
                          onToggle={() => setOpenIngredientKey((prev) => (prev === key ? null : key))}
                          onAddOneToGroceryList={handleAddOneToGroceryList}
                          onAddPantryItem={onAddPantryItem}
                          onRemoveFromInventory={handleRemoveFromInventory}
                          onNavigate={onNavigate}
                          pantryInventory={pantryInventory}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="riso-rc-legend">
                <span>
                  <span className="riso-rc-legend-dot have" />
                  In inventory
                </span>
                <span>
                  <span className="riso-rc-legend-dot" />
                  Need to buy
                </span>
                <span>
                  <span className="riso-rc-legend-sticker">use soon!</span>
                  Expires in 3 days or less
                </span>
              </div>

              {missingIngredients.length > 0 && weekStart && (
                plannedEntry ? (
                  <div className="riso-rc-planned-note">
                    <span className="riso-rc-planned-check">✓</span>
                    <p>
                      Planned for {WEEKDAY_FULL[plannedEntry.dayOfWeek]} {MEAL_LABEL[plannedEntry.mealType] || plannedEntry.mealType}, so
                      the {missingIngredients.length} missing item{missingIngredients.length === 1 ? " is" : "s are"} already on your
                      grocery list.{" "}
                      <button type="button" className="riso-rc-planned-link" onClick={() => onNavigate?.("grocery")}>
                        View list →
                      </button>
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`riso-rc-add-missing-btn${addedMissing ? " added" : ""}`}
                    onClick={handleAddMissingToGroceryList}
                    disabled={addingMissing || addedMissing}
                  >
                    {addedMissing
                      ? "Added to grocery list ✓"
                      : addingMissing
                        ? "Adding…"
                        : `Add ${missingIngredients.length} missing to grocery list`}
                  </button>
                )
              )}
            </aside>

            <div className={`riso-rc-steps-wrap${phoneTab === "ingredients" ? " rc-phone-hidden" : ""}`}>
              {recipe.instructions?.length > 0 && (
                <>
                  <div className="riso-rc-steps-header">
                    <h3>Steps</h3>
                    <span>Quantities in the steps follow the servings.</span>
                  </div>
                  <ol className="riso-rc-step-list">
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
            <div className="riso-rc-similar">
              <div className="riso-rc-similar-header">
                <h3>Uses the same ingredients</h3>
                <span>Cook one of these next to finish what's left.</span>
              </div>
              <div className="riso-rc-similar-grid">
                {similar.map(({ recipe: match, sharedCount }) => (
                  <button key={match.id} type="button" className="riso-rc-similar-card" onClick={() => onSelectRecipe?.(match)}>
                    {match.photoUrl ? (
                      <img src={match.photoUrl} alt="" onError={hideBrokenPhoto} />
                    ) : (
                      <div className="riso-rc-similar-photo-placeholder" />
                    )}
                    <span className="riso-rc-similar-info">
                      <span className="riso-rc-similar-title">{match.title}</span>
                      <span className="riso-rc-similar-shared">{sharedCount} SHARED</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {cookModeOn && (
        <CookMode
          recipe={recipe}
          servings={servings}
          onExit={() => setCookModeOn(false)}
          onAddPantryItem={onAddPantryItem}
          pantryInventory={pantryInventory}
          onConsumePantryItems={onConsumePantryItems}
          onPlanLeftovers={onPlanLeftovers}
        />
      )}
    </div>
  );
}
