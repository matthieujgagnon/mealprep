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
} from "../lib/steps.js";
import { findSimilarRecipes, findExpiringSoonInRecipe, isPerishable, core, coversIngredient, findSaleDeal, findDealsFor } from "../lib/similarRecipes.js";
import { useDeals } from "../lib/dealsStore.js";
import { SaleTag } from "./SaleTag.jsx";
import { formatQuantity, unitLabel } from "../lib/units.js";
import { daysUntil, formatExpiry, LOCATIONS } from "../lib/pantryInventory.js";
import { CookMode } from "./CookMode.jsx";
import { StepTimer } from "./StepTimer.jsx";
import { useStepTimers } from "../hooks/useStepTimers.js";
import { buildCombinedHave } from "../lib/onHand.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { formatRecipeTime } from "../lib/mealSlots.js";
import { isPastDay } from "../lib/dates.js";
import { dict, t } from "../i18n/index.js";
import { formatList } from "../i18n/format.js";

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
  return formatRecipeTime(Math.round(totalMinutes));
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

// The "⋯" menu — Edit / View original / Add to Cookbook (or Move to
// Imported) / Leftovers keep… / Delete. A
// transparent full-screen catcher behind the menu closes it on any
// outside click, simpler than tracking a ref and a document-level
// listener for what's only ever open a few seconds at a time.
function OptionsMenu({ onEdit, onDelete, onEditLeftoverDays, onMove, inCookbook, fridgeLifeDays, sourceUrl, onClose }) {
  return (
    <>
      <div className="riso-rc-menu-catcher" onClick={onClose} />
      <div className="riso-rc-menu">
        <button type="button" onClick={onEdit}>
          {t("recipeCard.editRecipe")}
        </button>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            {t("recipeCard.viewOriginal")}
          </a>
        )}
        <button type="button" onClick={onMove}>
          {inCookbook ? t("recipeCard.moveToImported") : t("recipeCard.addToCookbook")}
        </button>
        <button type="button" onClick={onEditLeftoverDays}>
          {t("recipeCard.leftoversKeep", {
            days: fridgeLifeDays ? t("recipeCard.days", { count: fridgeLifeDays }) : t("recipeCard.notSet"),
          })}
        </button>
        <div className="riso-rc-menu-divider" />
        <button type="button" className="danger" onClick={onDelete}>
          {t("recipeCard.deleteRecipe")}
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
    <div className="rc-lightbox-overlay" role="dialog" aria-label={t("recipeCard.photos")} onClick={onClose}>
      <button
        type="button"
        className="rc-lightbox-close"
        onClick={onClose}
        aria-label={t("recipeCard.closePhotos")}
        title={t("recipeCard.closeEsc")}
      >
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
          aria-label={t("recipeCard.prevPhoto")}
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
          aria-label={t("recipeCard.nextPhoto")}
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

function StepRow({ step, number, scale, stepKey, stepTimers }) {
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
        {timer && <StepTimer timerKey={stepKey} seconds={timer.seconds} stepTimers={stepTimers} />}
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
  onList,
  onToggleList,
  onRequestInventoryAdd,
  onRemoveFromInventory,
  onNavigate,
  pantryInventory,
}) {
  const have = status !== "need";
  const matched = have ? findMatchedPantryItem(ing, pantryInventory) : null;
  const where = (matched ? locationLabel(matched.location) : t("recipeCard.inventory")).toLowerCase();

  let why;
  if (status === "need") {
    why = onList ? t("recipeCard.whyOnList") : t("recipeCard.whyNeed");
  } else if (status === "soon") {
    const expiry = matched?.expiresAt ? formatExpiry(matched.expiresAt).toLowerCase() : t("recipeCard.soon");
    why = t("recipeCard.whySoon", { where, expiry });
  } else {
    why = t("recipeCard.whyHave", { where });
  }

  return (
    <div className="riso-rc-ingredient">
      <div className="riso-rc-ingredient-line">
        {have ? (
          // Blue ✓: in your Inventory (it follows Inventory by itself).
          <span className="riso-rc-ingredient-dot have" aria-hidden="true" onClick={onToggle}>
            ✓
          </span>
        ) : (
          // Green ✓: on your grocery list; empty +: not on it. Tapping either toggles the list.
          <button
            type="button"
            className={`riso-rc-ingredient-dot toggle${onList ? " onlist" : ""}`}
            aria-pressed={onList}
            aria-label={onList ? t("finder.takeOffListAria", { name: ing.name }) : t("makeable.addToList", { name: ing.name })}
            title={onList ? t("finder.onListTitle") : t("makeable.addToListTitle")}
            onClick={() => onToggleList(ing.name)}
          >
            {onList ? "✓" : "+"}
          </button>
        )}
        <button type="button" className="riso-rc-ingredient-row" aria-expanded={isOpen} onClick={onToggle}>
          <span className="riso-rc-ingredient-name">
            {ing.name}
            {ing.notes && <span className="riso-rc-ingredient-note"> {ing.notes}</span>}
            {isPerishable(ing.name) && <span className="perishable-dot" title={t("recipeCard.perishable")} />}
          </span>
          {status === "soon" && <span className="riso-rc-use-soon-sticker">{t("recipeCard.useSoon")}</span>}
          {status === "need" && <SaleTag deal={deal} others={saleOthers} />}
          <span className="riso-rc-ingredient-qty">
            {scaledQty != null
              ? `${formatQuantity(scaledQty)}${ing.unit ? " " + unitLabel(ing.unit, scaledQty) : ""}`
              : unitLabel(ing.unit)}
          </span>
        </button>
      </div>
      {isOpen && (
        <div className="riso-rc-ingredient-explainer">
          <p>{why}</p>
          <div className="riso-rc-ingredient-actions">
            {status === "need" ? (
              <>
                <button type="button" className={`riso-rc-ing-action primary${onList ? " added" : ""}`} onClick={() => onToggleList(ing.name)}>
                  {onList ? t("recipeCard.takeOffList") : t("recipeCard.addOne")}
                </button>
                <button type="button" className="riso-rc-ing-action" onClick={() => onRequestInventoryAdd([{ ref: ing.name, name: ing.name }], { title: t("inventoryConfirm.haveItTitle") })}>
                  {t("recipeCard.haveIt")}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="riso-rc-ing-action" onClick={() => onRemoveFromInventory(ing)}>
                  {t("recipeCard.outOfIt")}
                </button>
                <button type="button" className="riso-rc-ing-action" onClick={() => onNavigate?.("inventory")}>
                  {t("recipeCard.openInventory")}
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
  onRequestInventoryAdd,
  onDeletePantryItem,
  onAddToGroceryList,
  grocery, // { isOnList(name), toggle(name) } from App: the one grocery list every page reads
  onConsumePantryItems,
  onPlanLeftovers,
  onNavigate,
  sharedWithWeek, // ingredient names reused from this week's plan — only set when opened from a "good next addition" suggestion
}) {
  const defaultServings = recipe.baseServings || 4;
  const [servings, setServings] = useState(defaultServings);
  const [cookModeOn, setCookModeOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [brokenPhotos, setBrokenPhotos] = useState(new Set());
  const [tagInput, setTagInput] = useState("");
  const [phoneTab, setPhoneTab] = useState("ingredients");
  const [addingMissing, setAddingMissing] = useState(false);
  const [openIngredientKey, setOpenIngredientKey] = useState(null);
  const [moveNote, setMoveNote] = useState(null); // "cookbook" | "imported" | "error" once a move is done
  const [moving, setMoving] = useState(false);
  const { deals } = useDeals();
  // Shared with Cook mode: a time edited or a timer started here carries over.
  const stepTimers = useStepTimers({ title: recipe.title, recipeId: recipe.id });


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
  // The "use soon!" key only means something when an ingredient wears it.
  const anyUseSoon = allIngredients.some((ing) => ingredientStatus(ing) === "soon");

  // Already scheduled in the currently-viewed week, today or later: the
  // grocery list covers every planned meal from today on, so the "already
  // on your grocery list" copy is only true for those.
  const plannedEntry = weekStart
    ? plannerEntries.find((e) => e.recipe?.id === recipe.id && !e.recipe?.isPlaceholder && !isPastDay(weekStart, e.dayOfWeek))
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
    if (window.confirm(t("recipeCard.confirmDelete", { title: recipe.title }))) {
      onDelete?.(recipe.id);
    }
  }

  // Add to Cookbook / Move to Imported: no dragging, the same on phone and
  // desktop. The recipe keeps everything else; only where it lives changes.
  async function handleMove() {
    setMenuOpen(false);
    if (moving) return;
    const toCookbook = !recipe.inCookbook;
    setMoving(true);
    setMoveNote(null);
    try {
      const updated = await api.updateRecipe(recipe.id, { inCookbook: toCookbook });
      onRecipeUpdated?.(updated);
      setMoveNote(toCookbook ? "cookbook" : "imported");
    } catch {
      setMoveNote("error");
    } finally {
      setMoving(false);
    }
  }

  function handleEditLeftoverDays() {
    setMenuOpen(false);
    const input = window.prompt(t("recipeCard.promptLeftovers"), recipe.fridgeLifeDays ?? "");
    if (input === null) return;
    const days = input.trim() === "" ? null : Math.max(0, Math.round(Number(input)));
    if (input.trim() !== "" && Number.isNaN(days)) return;
    api.updateRecipe(recipe.id, { fridgeLifeDays: days }).then((updated) => onRecipeUpdated?.(updated));
  }

  // The missing ingredients that are not on the grocery list yet (the list is App's,
  // so this always agrees with Grocery and the pop-out).
  const notOnList = missingIngredients.filter((ing) => !grocery.isOnList(ing.name));

  async function handleAddMissingToGroceryList() {
    if (notOnList.length === 0 || !weekStart) return;
    setAddingMissing(true);
    try {
      await onAddToGroceryList(notOnList.map((ing) => ing.name));
    } finally {
      setAddingMissing(false);
    }
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
      ? t("recipeCard.thingsToBuy", { count: missingIngredients.length })
      : t("recipeCard.nothingToBuy");
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
            {t("recipeCard.back")}
          </button>
          <div className="riso-rc-hero-actions">
            {!recipe.isPlaceholder && (
              <div className="riso-rc-menu-wrap">
                <button
                  type="button"
                  className="riso-rc-round-btn"
                  aria-label={t("recipeCard.moreActions")}
                  title={t("recipeCard.more")}
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
                    onMove={handleMove}
                    inCookbook={!!recipe.inCookbook}
                    fridgeLifeDays={recipe.fridgeLifeDays}
                    sourceUrl={recipe.sourceUrl}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            )}
            <button
              type="button"
              className="riso-rc-round-btn"
              title={t("recipeCard.closeEsc")}
              aria-label={t("recipeCard.close")}
              onClick={onClose}
            >
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
              title={t("recipeCard.openPhotos")}
              onClick={() => setLightboxOpen(true)}
            >
              {t("recipeCard.photoCount", { n: activePhotoIndex + 1, total: gallery.length })}
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
              {t("recipeCard.reuses", { count: sharedWithWeek.length, items: formatList(sharedWithWeek) })}
            </p>
          )}

          <div className="riso-rc-titlebar">
            <div className="riso-rc-titlebar-main">
              <h1 className="riso-rc-title">{recipe.title}</h1>
              {!recipe.isPlaceholder && (
                <div className="riso-rc-meta-line">
                  {[
                    totalTime > 0 && formatMinutes(totalTime),
                    t("recipeCard.serves", { count: recipe.baseServings || defaultServings }),
                    recipe.fridgeLifeDays && t("recipeCard.keepsDays", { count: recipe.fridgeLifeDays }),
                    recipe.sourceUrl && t("recipeCard.from", { site: new URL(recipe.sourceUrl).hostname.replace(/^www\./, "") }),
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
                    <button aria-label={t("recipeCard.removeTag", { tag })} onClick={() => removeTag(tag)}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="riso-rc-tag-input"
                  type="text"
                  placeholder={t("recipeCard.addTag")}
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
                    {t("recipeCard.startCooking")}
                  </button>
                )}
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={t("recipeCard.opensInTab", { site: new URL(recipe.sourceUrl).hostname.replace(/^www\./, "") })}
                    className="riso-rc-btn-open-original"
                  >
                    {t("recipeCard.openOriginal")}
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
                  {t("recipeCard.planAround")}
                </button>
              )}
              {!recipe.isPlaceholder && (
                <>
                  <button type="button" className="riso-rc-btn-secondary" disabled={moving} onClick={handleMove}>
                    {recipe.inCookbook ? t("recipeCard.moveToImported") : t("recipeCard.addToCookbook")}
                  </button>
                  {moveNote && (
                    <p className="riso-rc-move-note" role="status">
                      {t(`recipeCard.moveNote.${moveNote}`)}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="riso-rc-phone-tabs">
            <button
              type="button"
              className={phoneTab === "ingredients" ? "active" : ""}
              onClick={() => setPhoneTab("ingredients")}
            >
              {t("recipeCard.ingredientsTab", { count: allIngredients.length })}
            </button>
            <button
              type="button"
              className={phoneTab === "steps" ? "active" : ""}
              onClick={() => setPhoneTab("steps")}
            >
              {t("recipeCard.stepsTab", { count: recipe.instructions?.length || 0 })}
            </button>
          </div>

          <div className="riso-rc-body">
            <aside className={`riso-rc-ingredients-panel${phoneTab === "steps" ? " rc-phone-hidden" : ""}`}>
              <div className="riso-rc-panel-header">
                <h3>{t("recipeCard.ingredients")}</h3>
                <div className="riso-rc-servings-stepper">
                  <button
                    type="button"
                    onClick={() => setServings((s) => Math.max(1, s - 1))}
                    aria-label={t("recipeCard.decreaseServings")}
                  >
                    −
                  </button>
                  <span>{t("recipeCard.servings", { count: servings })}</span>
                  <button type="button" onClick={() => setServings((s) => s + 1)} aria-label={t("recipeCard.increaseServings")}>
                    +
                  </button>
                </div>
              </div>

              {allIngredients.length > 0 && (
                <div className="riso-rc-have-meter">
                  <div className="riso-rc-have-label">
                    {t("recipeCard.haveOf", { have: haveCount, total: allIngredients.length })}
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
                <span className="riso-rc-why-sticker">{t("recipeCard.why")}</span>
                <p>{t("recipeCard.whyNote")}</p>
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
                          onList={grocery.isOnList(ing.name)}
                          onToggleList={grocery.toggle}
                          onRequestInventoryAdd={onRequestInventoryAdd}
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
                  {t("recipeCard.inInventory")}
                </span>
                <span>
                  <span className="riso-rc-legend-dot onlist" />
                  {t("recipeCard.onGroceryList")}
                </span>
                <span>
                  <span className="riso-rc-legend-dot" />
                  {t("recipeCard.needToBuy")}
                </span>
                {anyUseSoon && (
                  <span>
                    <span className="riso-rc-legend-sticker">{t("recipeCard.useSoon")}</span>
                    {t("recipeCard.expiresSoon")}
                  </span>
                )}
              </div>

              {missingIngredients.length > 0 && weekStart && (
                notOnList.length === 0 ? (
                  <div className="riso-rc-planned-note">
                    <span className="riso-rc-planned-check">✓</span>
                    <p>
                      {plannedEntry
                        ? t("recipeCard.planned", {
                            count: missingIngredients.length,
                            day: dict().days.long[plannedEntry.dayOfWeek],
                            meal: t(`meals.${plannedEntry.mealType}`).toLowerCase(),
                          })
                        : t("recipeCard.allOnList", { count: missingIngredients.length })}{" "}
                      <button type="button" className="riso-rc-planned-link" onClick={() => onNavigate?.("grocery")}>
                        {t("recipeCard.viewList")}
                      </button>
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="riso-rc-add-missing-btn"
                    onClick={handleAddMissingToGroceryList}
                    disabled={addingMissing}
                  >
                    {addingMissing ? t("recipeCard.adding") : t("recipeCard.addMissing", { count: notOnList.length })}
                  </button>
                )
              )}
            </aside>

            <div className={`riso-rc-steps-wrap${phoneTab === "ingredients" ? " rc-phone-hidden" : ""}`}>
              {recipe.instructions?.length > 0 && (
                <>
                  <div className="riso-rc-steps-header">
                    <h3>{t("recipeCard.steps")}</h3>
                    <span>{t("recipeCard.stepsNote")}</span>
                  </div>
                  <ol className="riso-rc-step-list">
                    {(() => {
                      let stepNumber = 0;
                      return recipe.instructions.map((step, i) => {
                        if (!stepIsHeading(step)) stepNumber++;
                        return (
                          <StepRow key={i} step={step} number={stepIsHeading(step) ? null : stepNumber} scale={scale} stepKey={i} stepTimers={stepTimers} />
                        );
                      });
                    })()}
                  </ol>
                </>
              )}

              {recipe.notes && (
                <div className="rc-notes">
                  <p className="rc-notes-label">{t("recipeCard.notes")}</p>
                  <p className="rc-notes-text">{recipe.notes}</p>
                </div>
              )}
            </div>
          </div>

          {similar.length > 0 && (
            <div className="riso-rc-similar">
              <div className="riso-rc-similar-header">
                <h3>{t("recipeCard.similarTitle")}</h3>
                <span>{t("recipeCard.similarNote")}</span>
              </div>
              <div className="riso-rc-similar-grid">
                {similar.map(({ recipe: match, sharedCount }) => (
                  <button key={match.id} type="button" className="riso-rc-similar-card" onClick={() => onSelectRecipe?.(match)}>
                    {match.photoUrl ? (
                      <RecipePhoto src={match.photoUrl} alt="" />
                    ) : (
                      <div className="riso-rc-similar-photo-placeholder" />
                    )}
                    <span className="riso-rc-similar-info">
                      <span className="riso-rc-similar-title">{match.title}</span>
                      <span className="riso-rc-similar-shared">{t("recipeCard.shared", { count: sharedCount })}</span>
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
          onRequestInventoryAdd={onRequestInventoryAdd}
          pantryInventory={pantryInventory}
          onConsumePantryItems={onConsumePantryItems}
          onPlanLeftovers={onPlanLeftovers}
          stepTimers={stepTimers}
        />
      )}
    </div>
  );
}
