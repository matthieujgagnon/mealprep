import { useEffect, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { canonicalize } from "../lib/groceryList.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { HintStrip } from "./RisoControls.jsx";

// Same day/meal vocabulary as PlannerBoard's own picker (dayOfWeek 0=Monday
// per the schema, mealType id matches PlannerEntry.mealType).
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Supper" },
];

const ENDS_SOON_DAYS = 2;
const money = (n) => `$${n.toFixed(2)}`;

function endsInDays(validUntil) {
  if (!validUntil) return null;
  const days = daysUntil(validUntil);
  return days >= 0 && days <= ENDS_SOON_DAYS ? days : null;
}

function endsSoonLabel(days) {
  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days}d`;
}

// Where this deal's unitPrice sits in its own 6-month range, and the
// verdict/color that position earns - see design_handoff_riso/README.md's
// "Price meter" component spec. null when there's no real range yet
// (isNew, or no unitPrice at all) - the caller shows "NEW" instead.
function meterFor(deal) {
  if (deal.isNew || deal.sixMonthLow == null || deal.sixMonthHigh == null) return null;
  const { sixMonthLow: low, sixMonthHigh: high, unitPrice: cur } = deal;
  const t = high > low ? (cur - low) / (high - low) : 0;
  const clamped = Math.max(0, Math.min(1, t));
  const verdict = t <= 0.02 ? "6-MO LOW" : t < 0.4 ? "GOOD PRICE" : "USUAL · WAIT";
  const good = t < 0.4;
  return { low, high, pos: `${Math.round(clamped * 100)}%`, dot: good ? "var(--riso-green)" : "var(--riso-surface)", verdict, good };
}

function isStapleDeal(deal, customStaples) {
  const core = canonicalize(deal.matchName || deal.item).core;
  return (customStaples || []).some((s) => canonicalize(s).core === core);
}

function DealPhoto({ deal, size }) {
  return deal.imageUrl ? (
    <img className="riso-deal-photo" src={deal.imageUrl} alt="" style={{ width: size, height: size }} />
  ) : (
    <div className="riso-deal-photo placeholder" style={{ width: size, height: size }}>
      {(deal.item || "?")[0]}
    </div>
  );
}

function StarButton({ active, onClick, small }) {
  return (
    <button
      type="button"
      className={`riso-star-btn${active ? " active" : ""}${small ? " small" : ""}`}
      onClick={onClick}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      title={active ? "On your watchlist" : "Watch this item"}
    >
      ★
    </button>
  );
}

function AddToPlannerButton({ recipe, onAdd, label }) {
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

  if (added) return <p className="riso-added-note">✓ Added to {WEEKDAY_LABELS[day]}</p>;

  if (!open) {
    return (
      <button type="button" className="riso-btn primary small" onClick={() => setOpen(true)}>
        {label || "+ Plan it"}
      </button>
    );
  }

  return (
    <div className="riso-plan-form">
      <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {WEEKDAY_LABELS.map((l, i) => (
          <option key={l} value={i}>
            {l}
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
      <button type="button" className="riso-btn primary small" onClick={handleAdd} disabled={adding}>
        {adding ? "…" : "Add"}
      </button>
    </div>
  );
}

function CookCard({ entry, onOpen, onAdd }) {
  const { recipe, savings, usedNames } = entry;
  return (
    <div className="riso-cook-card">
      <div className="riso-cook-thumb">
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" /> : <div className="riso-cook-thumb-placeholder">{recipe.title[0]}</div>}
        {savings > 0 && (
          <span className="riso-sticker yellow" style={{ top: -10, right: 10, transform: "rotate(4deg)" }}>
            save {money(savings)}
          </span>
        )}
      </div>
      <div className="riso-cook-body">
        <h4 className="riso-cook-title">{recipe.title}</h4>
        <p className="riso-cook-uses">Uses {usedNames.join(", ")}, on sale.</p>
        <div className="riso-cook-actions">
          <AddToPlannerButton recipe={recipe} onAdd={onAdd} />
          <button type="button" className="riso-btn small" onClick={() => onOpen(recipe)}>
            View recipe
          </button>
        </div>
      </div>
    </div>
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
        <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="e.g. Metro" required />
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

function DealPreviewModal({ deal, onClose }) {
  const [imageFailed, setImageFailed] = useState(false);

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
          <img className="riso-preview-image" src={deal.imageUrl} alt={deal.item} onError={() => setImageFailed(true)} />
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

function PriceMeter({ deal }) {
  const meter = meterFor(deal);
  if (!meter) return <span className="riso-meter-new">NEW</span>;
  return (
    <div className="riso-meter">
      <div className="riso-meter-track">
        <span className="riso-meter-dot" style={{ left: meter.pos, background: meter.dot }} />
      </div>
      <div className="riso-meter-labels">
        <span>{money(meter.low)}</span>
        <span style={{ color: meter.good ? "var(--riso-green-text)" : "var(--riso-muted)" }}>{meter.verdict}</span>
        <span>{money(meter.high)}</span>
      </div>
    </div>
  );
}

export function FlyerDeals({ user, recipes, customStaples, weekStart, onSelectRecipe, onAddToPlanner }) {
  const [deals, setDeals] = useState(null);
  const [watchlist, setWatchlist] = useState(new Set());
  const [storeFilter, setStoreFilter] = useState(null);
  const [chipFilter, setChipFilter] = useState("everything");
  const [clearing, setClearing] = useState(false);
  const [importingLeRabais, setImportingLeRabais] = useState(false);
  const [leRabaisError, setLeRabaisError] = useState(null);
  const [previewDeal, setPreviewDeal] = useState(null);

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(() => {
    loadDeals();
    api
      .listWatchlist()
      .then((items) => setWatchlist(new Set(items.map((i) => i.matchName))))
      .catch(() => setWatchlist(new Set()));
  }, []);

  async function toggleWatch(deal) {
    const key = (deal.matchName || deal.item).trim().toLowerCase();
    const watching = watchlist.has(key);
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (watching) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      if (watching) await api.removeFromWatchlist(key);
      else await api.addToWatchlist(key);
    } catch {
      // Revert on failure - the optimistic toggle above assumed success.
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (watching) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  async function addToGroceryList(deal) {
    await api.addGroceryExtra(weekStart, { name: deal.matchName || deal.item, quantity: null, unit: null });
  }

  async function clearAllDeals() {
    if (!window.confirm("Clear all uploaded flyer deals? This can't be undone.")) return;
    setClearing(true);
    try {
      await api.clearFlyerDeals();
      setStoreFilter(null);
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

  if (!deals) return <p className="riso-theme riso-flyers riso-empty">Loading this week's deals…</p>;

  const allDeals = deals.deals.map((d) => ({
    ...d,
    isWatching: watchlist.has((d.matchName || d.item).trim().toLowerCase()),
    endsInDays: endsInDays(d.validUntil),
    isStaple: isStapleDeal(d, customStaples),
  }));

  const groups = groupDealsByIngredient(allDeals, recipes);
  const dealIdToGroup = new Map();
  groups.forEach((g) => g.deals.forEach((d) => dealIdToGroup.set(d.id, g)));

  const visibleByStore = storeFilter ? allDeals.filter((d) => d.store === storeFilter) : allDeals;
  const visibleDeals = visibleByStore.filter((d) => {
    if (chipFilter === "recipes") return dealIdToGroup.get(d.id)?.recipeCount > 0;
    if (chipFilter === "watchlist") return d.isWatching;
    if (chipFilter === "stockup") return d.isStaple;
    if (chipFilter === "endssoon") return d.endsInDays != null;
    return true;
  });

  const withUnitPrice = allDeals.filter((d) => d.unitPrice != null && d.unitBasis);
  const bestDeals = [...withUnitPrice]
    .filter((d) => !d.isNew)
    .sort((a, b) => {
      const ta = (a.unitPrice - a.sixMonthLow) / (a.sixMonthHigh - a.sixMonthLow || 1);
      const tb = (b.unitPrice - b.sixMonthLow) / (b.sixMonthHigh - b.sixMonthLow || 1);
      return ta - tb;
    })
    .slice(0, 4);

  const stockUpDeals = allDeals
    .filter((d) => d.isStaple && !d.isNew && d.sixMonthHigh != null && d.unitPrice != null)
    .filter((d) => (d.unitPrice - d.sixMonthLow) / (d.sixMonthHigh - d.sixMonthLow || 1) < 0.4)
    .slice(0, 3);

  const endingSoonDeals = allDeals.filter((d) => d.endsInDays != null).sort((a, b) => a.endsInDays - b.endsInDays).slice(0, 3);

  // "What to cook": every recipe used by at least one on-sale ingredient,
  // ranked by total savings (sum of each matched deal's sixMonthHigh minus
  // its current price - "usual" vs "sale," per the handoff's savings
  // formula - contributing 0 when there's no history yet to compare
  // against, rather than guessing a baseline).
  const recipeCookMap = new Map();
  for (const group of groups) {
    if (group.recipeCount === 0) continue;
    const best = group.deals.reduce((min, d) => (d.unitPrice != null && (min == null || d.unitPrice < min.unitPrice) ? d : min), null);
    const savingsForGroup = best && best.sixMonthHigh != null ? Math.max(0, best.sixMonthHigh - best.unitPrice) : 0;
    for (const recipe of group.recipes) {
      if (!recipeCookMap.has(recipe.id)) recipeCookMap.set(recipe.id, { recipe, savings: 0, usedNames: [] });
      const entry = recipeCookMap.get(recipe.id);
      entry.savings += savingsForGroup;
      entry.usedNames.push(group.label.toLowerCase());
    }
  }
  const cookEntries = [...recipeCookMap.values()].sort((a, b) => b.savings - a.savings).slice(0, 3);

  const stores = deals.stores;
  const itemCount = deals.deals.length;

  const chips = [
    { id: "everything", label: "Everything" },
    { id: "recipes", label: "My recipes" },
    { id: "watchlist", label: "★ Watchlist" },
    { id: "stockup", label: "Stock up" },
    { id: "endssoon", label: "Ends soon" },
  ];

  return (
    <div className="riso-theme riso-flyers">
      <div className="riso-flyers-header">
        <div>
          <p className="riso-eyebrow">
            {stores.join(" + ")} · {itemCount} items{deals.weekOf ? ` · week of ${deals.weekOf}` : ""}
          </p>
          <h2 className="riso-flyers-title">
            This week's <span className="accent">deals, sorted.</span>
          </h2>
        </div>
        <div className="riso-flyers-actions">
          {!deals.isMockData && (
            <button type="button" className="riso-btn" onClick={clearAllDeals} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear all deals"}
            </button>
          )}
          <UploadFlyerForm onUploaded={loadDeals} />
          <button type="button" className="riso-btn primary" onClick={importLeRabais} disabled={importingLeRabais}>
            {importingLeRabais ? "Importing…" : "Refresh from Le Rabais"}
          </button>
        </div>
      </div>
      {leRabaisError && <p className="riso-error">{leRabaisError}</p>}

      {deals.isMockData ? (
        <p className="riso-flyers-sub">Showing sample data — upload a store's flyer PDF to pull in real deals.</p>
      ) : (
        <>
          <HintStrip userId={user.id} screenKey="flyers">
            Deals are compared with the last 6 months of prices. On the meter, a green dot toward
            the left means it's a real deal. Pink means the deal ends within 2 days. Star an item
            to watch it.
          </HintStrip>

          <div className="riso-flyers-top-row">
            <section className="riso-block accent">
              <span className="riso-sticker yellow" style={{ top: -14, right: 22, transform: "rotate(5deg)" }}>
                real deals!
              </span>
              <p className="riso-eyebrow on-accent">This week's best deals</p>
              <h3 className="riso-block-title">The lowest prices in 6 months</h3>
              <div className="riso-block-rows">
                {bestDeals.length === 0 ? (
                  <p className="riso-block-empty">Not enough price history yet — check back after a few more uploads.</p>
                ) : (
                  bestDeals.map((d) => (
                    <button key={d.id} type="button" className="riso-deal-row" onClick={() => setPreviewDeal(d)}>
                      <DealPhoto deal={d} size={52} />
                      <div className="riso-deal-row-info">
                        <span className="riso-deal-row-name">{d.item}</span>
                        <span className="riso-deal-row-meta">
                          {d.price} · {d.store}
                        </span>
                      </div>
                      <div className="riso-deal-row-price">
                        <span className="price-amt">{d.price.split("/")[0]}</span>
                        <span className="riso-deal-row-verdict">{meterFor(d)?.verdict}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="riso-block">
              <p className="riso-eyebrow">Stock up</p>
              <h3 className="riso-block-title">Pantry staples at a low</h3>
              <div className="riso-block-rows plain">
                {stockUpDeals.length === 0 ? (
                  <p className="riso-block-empty">No staples at a low price right now.</p>
                ) : (
                  stockUpDeals.map((d) => (
                    <div key={d.id} className="riso-dash-row">
                      <div className="riso-deal-row-info">
                        <span className="riso-deal-row-name">{d.item}</span>
                        <span className="riso-deal-row-meta">
                          {d.price} · {d.store}
                        </span>
                      </div>
                      <span className="riso-deal-row-price-amt">{d.price.split("/")[0]}</span>
                      {d.isWatching && <span className="riso-watch-dot" title="On your watchlist">★</span>}
                    </div>
                  ))
                )}
              </div>
              <p className="riso-block-note">These are the lowest prices in 6 months and they keep for a long time. ★ marks items on your watchlist.</p>
            </section>

            <section className="riso-block hot">
              <p className="riso-eyebrow on-pink">Ends soon</p>
              <h3 className="riso-block-title">Gone by {WEEKDAY_LABELS[Math.min(6, new Date().getDay() + ENDS_SOON_DAYS - 1)] || "soon"}</h3>
              <div className="riso-block-rows">
                {endingSoonDeals.length === 0 ? (
                  <p className="riso-block-empty">Nothing ends in the next {ENDS_SOON_DAYS} days.</p>
                ) : (
                  endingSoonDeals.map((d) => (
                    <div key={d.id} className="riso-deal-row static">
                      <div className="riso-deal-row-info">
                        <span className="riso-deal-row-name">{d.item}</span>
                        <span className="riso-deal-row-meta">
                          {endsSoonLabel(d.endsInDays)} · {d.store}
                        </span>
                      </div>
                      <span className="riso-deal-row-price-amt">{d.price.split("/")[0]}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {cookEntries.length > 0 && (
            <div className="riso-cook-section">
              <div className="riso-cook-header">
                <p className="riso-eyebrow">What to cook</p>
                <h3 className="riso-block-title">Meals built on this week's deals</h3>
              </div>
              <div className="riso-cook-grid">
                {cookEntries.map((entry) => (
                  <CookCard key={entry.recipe.id} entry={entry} onOpen={onSelectRecipe} onAdd={onAddToPlanner} />
                ))}
              </div>
            </div>
          )}

          <div className="riso-whole-flyer">
            <div className="riso-whole-flyer-header">
              <h3 className="riso-block-title">The whole flyer</h3>
              <div className="riso-chip-row">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`riso-chip${chipFilter === c.id ? " active" : ""}`}
                    onClick={() => setChipFilter(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {stores.length > 1 && (
              <div className="riso-chip-row">
                <button
                  type="button"
                  className={`riso-chip small${storeFilter === null ? " active" : ""}`}
                  onClick={() => setStoreFilter(null)}
                >
                  All stores
                </button>
                {stores.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`riso-chip small${storeFilter === s ? " active" : ""}`}
                    onClick={() => setStoreFilter((prev) => (prev === s ? null : s))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {visibleDeals.length === 0 ? (
              <p className="riso-empty">No deals match this filter.</p>
            ) : (
              <div className="riso-table">
                <div className="riso-table-row riso-table-header">
                  <div>Item</div>
                  <div>Store</div>
                  <div>Price</div>
                  <div>Per unit</div>
                  <div>Vs 6-month range</div>
                  <div />
                </div>
                {visibleDeals.map((d) => (
                  <div key={d.id} className="riso-table-row">
                    <div className="riso-table-item">
                      <button type="button" className="riso-deal-photo-btn" onClick={() => setPreviewDeal(d)}>
                        <DealPhoto deal={d} size={48} />
                      </button>
                      <div className="riso-table-item-info">
                        <div className="riso-table-item-name">
                          <span>{d.item}</span>
                          {d.isWatching && <span className="riso-watch-badge">★ WATCHING</span>}
                          {d.endsInDays != null && <span className="riso-ends-badge">{endsSoonLabel(d.endsInDays).toUpperCase()}</span>}
                        </div>
                        {d.freezeTip && <div className="riso-table-freeze">❄ {d.freezeTip}</div>}
                      </div>
                    </div>
                    <div className="riso-table-store">{d.store}</div>
                    <div className="riso-table-price">{d.price}</div>
                    <div className="riso-table-unit">{d.unitPrice != null ? `$${d.unitPrice.toFixed(2)}/${d.unitBasis}` : "—"}</div>
                    <div>
                      <PriceMeter deal={d} />
                    </div>
                    <div className="riso-table-actions">
                      <button type="button" className="riso-btn primary small" onClick={() => addToGroceryList(d)}>
                        + List
                      </button>
                      <StarButton active={d.isWatching} onClick={() => toggleWatch(d)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <DealPreviewModal deal={previewDeal} onClose={() => setPreviewDeal(null)} />
    </div>
  );
}
