import { useEffect, useState } from "react";
import { api } from "../api.js";
import { matchDealsToRecipes } from "../lib/similarRecipes.js";
import { MealCard } from "./MealCard.jsx";

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
      <button type="button" className="btn subtle" onClick={() => setOpen(true)}>
        Upload flyer
      </button>
    );
  }

  return (
    <form className="flyer-upload-form" onSubmit={handleUpload}>
      <label className="form-label">
        Store
        <input
          type="text"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="e.g. Metro"
          required
        />
      </label>
      <label className="form-label">
        Flyer PDF
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </label>
      <button type="submit" className="btn primary" disabled={uploading}>
        {uploading ? "Reading flyer…" : "Extract deals"}
      </button>
      <button type="button" className="btn subtle" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="flyer-upload-error">{error}</p>}
    </form>
  );
}

export function FlyerDeals({ recipes, onSelectRecipe }) {
  const [deals, setDeals] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [showOther, setShowOther] = useState(false);

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(loadDeals, []);

  if (!deals) return <p className="empty-state">Loading this week's deals…</p>;

  const visibleDeals = storeFilter
    ? deals.deals.filter((d) => d.store === storeFilter)
    : deals.deals;
  const { matched, unmatched } = matchDealsToRecipes(visibleDeals, recipes);

  return (
    <div className="flyer-page">
      <div className="flyer-header">
        <div>
          <h2 className="flyer-heading">Cook what's on sale</h2>
          <p className="flyer-sub">
            {deals.isMockData
              ? "Showing sample data — upload a store's flyer PDF to pull in real deals."
              : `${matched.length} ingredient${matched.length === 1 ? "" : "s"} on sale ` +
                `match recipes in your cookbook.`}
          </p>
        </div>
        <UploadFlyerForm onUploaded={loadDeals} />
      </div>

      {deals.stores.length > 1 && (
        <div className="flyer-store-filter">
          <button
            type="button"
            className={`tag-chip${storeFilter === null ? " active" : ""}`}
            onClick={() => setStoreFilter(null)}
          >
            All stores
          </button>
          {deals.stores.map((s) => (
            <button
              key={s}
              type="button"
              className={`tag-chip${storeFilter === s ? " active" : ""}`}
              onClick={() => setStoreFilter((prev) => (prev === s ? null : s))}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {matched.length === 0 ? (
        <p className="empty-state">
          Nothing on sale matches your cookbook right now — upload another store's
          flyer, or add recipes that use what's on special.
        </p>
      ) : (
        <div className="flyer-matches">
          {matched.map((group) => (
            <section key={group.core} className="flyer-match">
              <div className="flyer-match-header">
                <h3 className="flyer-match-title">{group.label}</h3>
                <div className="flyer-match-prices">
                  {group.deals.map((d) => (
                    <span key={d.id} className="price-tag">
                      <span className="item">{d.item}</span>
                      <span className="price">{d.price}</span>
                      <span className="store">{d.store}</span>
                    </span>
                  ))}
                </div>
              </div>
              <p className="flyer-match-count">
                {group.recipeCount} recipe{group.recipeCount === 1 ? "" : "s"} use
                {group.recipeCount === 1 ? "s" : ""} this
              </p>
              <div className="flyer-match-recipes">
                {group.recipes.map((r) => (
                  <MealCard key={r.id} recipe={r} compact onClick={() => onSelectRecipe(r)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {unmatched.length > 0 && (
        <section className="flyer-other">
          <button
            type="button"
            className="recipe-section-toggle"
            onClick={() => setShowOther((s) => !s)}
          >
            {showOther ? "▾" : "▸"} Other deals ({unmatched.length}) — nothing in your
            cookbook uses these
          </button>
          {showOther && (
            <div className="deals-row">
              {unmatched.map((d) => (
                <div key={d.id} className="price-tag">
                  <span className="item">{d.item}</span>
                  <span className="price">{d.price}</span>
                  <span className="store">{d.store}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
