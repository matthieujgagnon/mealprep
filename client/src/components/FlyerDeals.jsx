import { useEffect, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { daysUntil } from "../lib/pantryInventory.js";

// Same order/labels as the server's flyer-extraction category enum
// (server/src/routes/flyers.js CATEGORIES) — protein/produce first since
// those are what's actually worth planning a meal around.
const CATEGORY_ORDER = ["protein", "produce", "dairy", "bakery", "staple", "other"];
const CATEGORY_LABELS = {
  protein: "Protein",
  produce: "Produce",
  dairy: "Dairy",
  bakery: "Bakery",
  staple: "Staples",
  other: "Other",
};

// Same day/meal vocabulary as PlannerBoard's own picker (dayOfWeek 0=Monday
// per the schema, mealType id matches PlannerEntry.mealType).
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

// A deal ends "soon" once it's down to its last 2 days — matches the Riso
// design exploration's pink "ends soon" sticker threshold.
const ENDS_SOON_DAYS = 2;

function endsSoonLabel(validUntil) {
  if (!validUntil) return null;
  const days = daysUntil(validUntil);
  if (days < 0 || days > ENDS_SOON_DAYS) return null;
  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days}d`;
}

// A quick way to place a matched recipe onto this week's planner without
// leaving the Flyers tab — click-to-reveal a day+meal picker rather than
// requiring a drag, since there's no planner board in view here to drag
// onto.
function AddToPlannerButton({ recipe, onAdd }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(0);
  const [meal, setMeal] = useState("dinner");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd(recipe.id, day, meal);
      setAdded(true);
      setOpen(false);
    } finally {
      setAdding(false);
    }
  }

  if (added) {
    return <p className="riso-added-note">✓ Added to {WEEKDAY_LABELS[day]}</p>;
  }

  if (!open) {
    return (
      <button type="button" className="riso-btn small" onClick={() => setOpen(true)}>
        + Plan it
      </button>
    );
  }

  return (
    <div className="riso-plan-form">
      <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {WEEKDAY_LABELS.map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
      <select value={meal} onChange={(e) => setMeal(e.target.value)}>
        {MEAL_TYPES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <button type="button" className="riso-btn small primary" onClick={handleAdd} disabled={adding}>
        {adding ? "…" : "Add"}
      </button>
    </div>
  );
}

// A compact recipe tile in the Riso style — this screen has its own design
// (like Makeable's Cobalt Vapor cards), rather than reusing the shared dark
// .meal-card look used on Recipes/Planner.
function RisoRecipeTile({ recipe, onOpen, onAdd }) {
  return (
    <div className="riso-recipe-tile">
      <button
        type="button"
        className="riso-recipe-thumb-btn"
        onClick={() => onOpen(recipe)}
        aria-label={`View ${recipe.title}`}
      >
        {recipe.photoUrl ? (
          <img src={recipe.photoUrl} alt="" />
        ) : (
          <div className="riso-recipe-thumb-placeholder">{recipe.title[0]}</div>
        )}
      </button>
      <div className="riso-recipe-body">
        <button type="button" className="riso-recipe-title" onClick={() => onOpen(recipe)}>
          {recipe.title}
        </button>
        <AddToPlannerButton recipe={recipe} onAdd={onAdd} />
      </div>
    </div>
  );
}

// Shows the flyer photo behind a deal: Le Rabais deals carry their own
// per-item photo (deal.imageUrl, scraped straight from the source), while a
// manually-uploaded flyer has no per-item location to crop, so this instead
// shows the whole page you uploaded via <iframe> - the browser's own
// PDF/image viewer renders it, so there's no rendering work done here.
function DealPreviewModal({ deal, onClose }) {
  const [imageFailed, setImageFailed] = useState(false);

  // Reset the failure flag as soon as a different deal is opened, so an
  // earlier broken image doesn't carry over and hide a working one.
  useEffect(() => {
    setImageFailed(false);
  }, [deal]);

  if (!deal) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-content riso-preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="riso-preview-title">
          {deal.item} <span className="riso-preview-store">— {deal.store}</span>
        </h3>
        {imageFailed ? (
          <p className="riso-preview-missing">No flyer image available for this item.</p>
        ) : deal.imageUrl ? (
          <img
            className="riso-preview-image"
            src={deal.imageUrl}
            alt={deal.item}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <iframe
            className="riso-preview-frame"
            src={api.flyerUploadImageUrl(deal.source || deal.store)}
            title={`${deal.source || deal.store} flyer`}
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

// Sample data (shown before any real flyer has been uploaded/imported) has
// nothing behind it to preview, so it stays a plain, non-interactive pill.
function DealPricePill({ deal, isBestPrice, onPreview, previewable }) {
  const className = `riso-price${isBestPrice ? " best-price" : ""}`;
  const ends = endsSoonLabel(deal.validUntil);
  const body = (
    <>
      {(isBestPrice || ends) && (
        <div className="riso-badge-row">
          {isBestPrice && <span className="riso-best-badge">Best price</span>}
          {ends && <span className="riso-ends-badge">{ends}</span>}
        </div>
      )}
      <span className="item">{deal.item}</span>
      <span className="meta">
        <span className="price-amt">{deal.price}</span> · {deal.store}
      </span>
    </>
  );
  if (!previewable) return <span className={className}>{body}</span>;
  return (
    <button type="button" className={className} onClick={() => onPreview(deal)}>
      {body}
    </button>
  );
}

function UploadFlyerForm({ onUploaded }) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleUpload(e) {
    e.preventDefault();
    if (!store.trim() || !file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFlyer(store.trim(), file);
      setStore("");
      setFile(null);
      setOpen(false);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="riso-btn" onClick={() => setOpen(true)}>
        Upload flyer
      </button>
    );
  }

  return (
    <form className="riso-upload-form" onSubmit={handleUpload}>
      <label className="form-label">
        Store (or a name for this upload, e.g. "Le Rabais")
        <input
          type="text"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="e.g. Metro"
          required
        />
      </label>
      <label className="form-label">
        Flyer PDF or photo
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </label>
      <button type="submit" className="riso-btn primary" disabled={uploading}>
        {uploading ? "Reading…" : "Extract deals"}
      </button>
      <button type="button" className="riso-btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="riso-error">{error}</p>}
    </form>
  );
}

export function FlyerDeals({ recipes, onSelectRecipe, onAddToPlanner }) {
  const [deals, setDeals] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [openOther, setOpenOther] = useState(() => new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [clearing, setClearing] = useState(false);
  const [importingLeRabais, setImportingLeRabais] = useState(false);
  const [leRabaisError, setLeRabaisError] = useState(null);
  const [previewDeal, setPreviewDeal] = useState(null);

  function toggleCategory(category) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function clearAllDeals() {
    if (!window.confirm("Clear all uploaded flyer deals? This can't be undone.")) return;
    setClearing(true);
    try {
      await api.clearFlyerDeals();
      setStoreFilter(null);
      setCategoryFilter(null);
      loadDeals();
    } finally {
      setClearing(false);
    }
  }

  async function importLeRabais() {
    setImportingLeRabais(true);
    setLeRabaisError(null);
    try {
      await api.importLeRabaisDeals();
      loadDeals();
    } catch (err) {
      setLeRabaisError(err.message);
    } finally {
      setImportingLeRabais(false);
    }
  }

  function toggleOther(category) {
    setOpenOther((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(loadDeals, []);

  if (!deals) return <p className="riso-theme riso-flyers riso-empty">Loading this week's deals…</p>;

  const visibleDeals = storeFilter
    ? deals.deals.filter((d) => d.store === storeFilter)
    : deals.deals;
  const allGroups = groupDealsByIngredient(visibleDeals, recipes);
  const cookableCount = allGroups.filter((g) => g.recipeCount > 0).length;

  const presentCategories = CATEGORY_ORDER.filter((c) => allGroups.some((g) => g.category === c));
  const visibleGroups = categoryFilter ? allGroups.filter((g) => g.category === categoryFilter) : allGroups;
  // Bucketed by category (in CATEGORY_ORDER) for section display; each
  // bucket keeps groupDealsByIngredient's existing relevance sort within it.
  const sections = CATEGORY_ORDER.map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    groups: visibleGroups.filter((g) => g.category === c),
  })).filter((s) => s.groups.length > 0);

  return (
    <div className="riso-theme riso-flyers">
      <div className="riso-flyers-header">
        <div>
          <p className="riso-eyebrow">
            {deals.stores.join(" · ")} {deals.weekOf ? `· week of ${deals.weekOf}` : ""}
          </p>
          <h2 className="riso-flyers-title">
            This week's <span className="accent">deals, sorted.</span>
          </h2>
          <p className="riso-flyers-sub">
            {deals.isMockData
              ? "Showing sample data — upload a store's flyer PDF to pull in real deals."
              : `${allGroups.length} ingredient${allGroups.length === 1 ? "" : "s"} on sale — ` +
                `${cookableCount} match recipes in your cookbook.`}
          </p>
        </div>
        <div className="riso-flyers-actions">
          {!deals.isMockData && (
            <button type="button" className="riso-btn" onClick={clearAllDeals} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear all deals"}
            </button>
          )}
          <button type="button" className="riso-btn" onClick={importLeRabais} disabled={importingLeRabais}>
            {importingLeRabais ? "Importing…" : "Refresh from Le Rabais"}
          </button>
          <UploadFlyerForm onUploaded={loadDeals} />
        </div>
      </div>
      {leRabaisError && <p className="riso-error">{leRabaisError}</p>}

      {deals.stores.length > 1 && (
        <div className="riso-chip-row">
          <button
            type="button"
            className={`riso-chip${storeFilter === null ? " active" : ""}`}
            onClick={() => setStoreFilter(null)}
          >
            All stores
          </button>
          {deals.stores.map((s) => (
            <button
              key={s}
              type="button"
              className={`riso-chip${storeFilter === s ? " active" : ""}`}
              onClick={() => setStoreFilter((prev) => (prev === s ? null : s))}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {presentCategories.length > 1 && (
        <div className="riso-chip-row">
          <button
            type="button"
            className={`riso-chip${categoryFilter === null ? " active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </button>
          {presentCategories.map((c) => (
            <button
              key={c}
              type="button"
              className={`riso-chip${categoryFilter === c ? " active" : ""}`}
              onClick={() => setCategoryFilter((prev) => (prev === c ? null : c))}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {allGroups.length === 0 ? (
        <p className="riso-empty">No deals yet — upload a store's flyer to get started.</p>
      ) : (
        <div className="riso-groups">
          {sections.map((section) => {
            const cookable = section.groups.filter((g) => g.recipeCount > 0);
            const rest = section.groups.filter((g) => g.recipeCount === 0);
            const isOpen = openOther.has(section.category);
            const isCollapsed = categoryFilter === null && collapsedCategories.has(section.category);
            return (
              <div key={section.category}>
                {categoryFilter === null && (
                  <button
                    type="button"
                    className="riso-cat-eyebrow"
                    onClick={() => toggleCategory(section.category)}
                  >
                    {isCollapsed ? "▸" : "▾"} {section.label}
                  </button>
                )}
                {!isCollapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {cookable.map((group) => (
                      <section key={group.core} className="riso-group">
                        <div className="riso-group-header">
                          <h3 className="riso-group-title">{group.label}</h3>
                          <div className="riso-group-prices">
                            {group.deals.map((d) => (
                              <DealPricePill
                                key={d.id}
                                deal={d}
                                isBestPrice={group.bestPriceDealIds.has(d.id)}
                                onPreview={setPreviewDeal}
                                previewable={!deals.isMockData}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="riso-group-count">
                          {group.recipeCount} recipe{group.recipeCount === 1 ? "" : "s"} use
                          {group.recipeCount === 1 ? "s" : ""} this
                        </p>
                        <div className="riso-recipe-grid">
                          {group.recipes.map((r) => (
                            <RisoRecipeTile key={r.id} recipe={r} onOpen={onSelectRecipe} onAdd={onAddToPlanner} />
                          ))}
                        </div>
                      </section>
                    ))}
                    {rest.length > 0 && (
                      <div className="riso-rest">
                        <button
                          type="button"
                          className="riso-rest-toggle"
                          onClick={() => toggleOther(section.category)}
                        >
                          {isOpen ? "▾" : "▸"} {rest.length} more ingredient{rest.length === 1 ? "" : "s"} in{" "}
                          {section.label} — nothing in your cookbook uses these
                        </button>
                        {isOpen && (
                          <div className="riso-rest-prices">
                            {rest.flatMap((g) => g.deals.map((d) => ({ d, g }))).map(({ d, g }) => (
                              <DealPricePill
                                key={d.id}
                                deal={d}
                                isBestPrice={g.bestPriceDealIds.has(d.id)}
                                onPreview={setPreviewDeal}
                                previewable={!deals.isMockData}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DealPreviewModal deal={previewDeal} onClose={() => setPreviewDeal(null)} />
    </div>
  );
}
