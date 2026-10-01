import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { dealEmoji } from "../lib/dealEmoji.js";
import { groceryCore } from "../lib/groceryDedupe.js";
import { invalidateGroceryShared } from "../lib/groceryCache.js";
import { refreshDeals } from "../lib/dealsStore.js";
import {
  buildIngredients,
  foldText,
  RANKS,
  sliceIngredients,
  splitBilingual,
  tilePrice,
  unitLabel,
} from "../lib/flyerIngredients.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { HintStrip, Switch } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";
import { flyerUrl, merchantMatches } from "../lib/flyerLinks.js";

// Same day/meal vocabulary as PlannerBoard's own picker (dayOfWeek 0=Monday
// per the schema, mealType id matches PlannerEntry.mealType).
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
];

const ENDS_SOON_DAYS = 2;
const money = (n) => `$${n.toFixed(2)}`;

// The aisles the "By category" view groups by, in walking order. The server
// sends its own list with the deals (GET /api/deals -> aisles); this is the
// fallback for an older server.
const DEFAULT_AISLES = [
  { id: "produce", label: "Fruits & vegetables" },
  { id: "meat", label: "Meat & poultry" },
  { id: "seafood", label: "Fish & seafood" },
  { id: "dairy", label: "Dairy & eggs" },
  { id: "deli", label: "Deli & ready meals" },
  { id: "bakery", label: "Bakery" },
  { id: "frozen", label: "Frozen" },
  { id: "pantry", label: "Pantry" },
  { id: "snacks", label: "Snacks & sweets" },
  { id: "drinks", label: "Drinks" },
  { id: "household", label: "Household & personal care" },
  { id: "other", label: "Other" },
];
const AISLE_LABEL = Object.fromEntries(DEFAULT_AISLES.map((a) => [a.id, a.label]));

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the choice just isn't remembered.
  }
}

function endsInDays(validUntil) {
  if (!validUntil) return null;
  const days = daysUntil(validUntil);
  return days >= 0 && days <= ENDS_SOON_DAYS ? days : null;
}

// Where this deal's unitPrice sits in its own 6-month range, and the
// verdict/color that position earns - see design_handoff_riso/README.md's
// "Price meter" component spec. null when there's no real range yet
// (isNew, or no unitPrice at all) - the caller shows "NEW" instead.
// "Reg. $6.49 · 31% off" when the flyer states the usual price.
function regularLabel(deal) {
  if (!deal.regularPrice || deal.unitPrice == null) return null;
  const off = Math.round(((deal.regularPrice - deal.unitPrice) / deal.regularPrice) * 100);
  const per = deal.unitBasis && deal.unitBasis !== "each" ? `/${deal.unitBasis}` : "";
  return `Reg. ${money(deal.regularPrice)}${per} · ${off}% off`;
}

// Where a deal's usual range comes from (GET /api/deals -> rangeSource).
const RANGE_SOURCE = {
  store: { short: "6 mo · this store", long: "at this store" },
  stores: { short: "6 mo · all stores", long: "at every store" },
  quebec: { short: "Quebec avg · 6 mo", long: "Quebec average (Statistics Canada)" },
};

// The deal's price on the same footing as its range: per lb / per L when
// the package size is known.
const comparePriceOf = (deal) => deal.comparePrice ?? deal.unitPrice;
const compareBasisOf = (deal) => deal.compareBasis || deal.unitBasis;

function meterFor(deal) {
  if (deal.isNew || deal.sixMonthLow == null || deal.sixMonthHigh == null) return null;
  const { sixMonthLow: low, sixMonthHigh: high } = deal;
  const cur = comparePriceOf(deal);
  const source = RANGE_SOURCE[deal.rangeSource] || RANGE_SOURCE.store;
  const quebec = deal.rangeSource === "quebec";
  // The same price every week isn't a low.
  if (high <= low && !quebec) return { low, high, pos: "50%", dot: "var(--riso-surface)", verdict: "SAME PRICE", good: false, source };
  const t = high > low ? (cur - low) / (high - low) : cur < low ? -1 : cur > high ? 2 : 0.5;
  const clamped = Math.max(0, Math.min(1, t));
  const verdict = quebec
    ? t <= 0.02
      ? "UNDER QC AVG"
      : t < 0.4
        ? "GOOD VS QC"
        : "QC USUAL"
    : t <= 0.05
      ? deal.rangeSource === "stores"
        ? "LOWEST AROUND"
        : "6-MO LOW"
      : t < 0.4
        ? "GOOD PRICE"
        : "USUAL · WAIT";
  const good = t < 0.4;
  return { low, high, pos: `${Math.round(clamped * 100)}%`, dot: good ? "var(--riso-green)" : "var(--riso-surface)", verdict, good, source };
}

function monthLabel(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return "";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

// Web photos come through the app's own server (GET /api/deals/:id/photo),
// since flyer sites may refuse to show their images on another site.
function dealPhotoSrc(deal) {
  if (!deal.imageUrl) return null;
  return /^https?:/i.test(deal.imageUrl) ? api.dealPhotoUrl(deal.id) : deal.imageUrl;
}

function photoHostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "the photo";
  }
}

// The item's own photo from the flyer; a food emoji when there isn't one or
// it won't load.
function DealPhoto({ deal, size }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [deal.imageUrl]);
  const src = dealPhotoSrc(deal);
  return src && !failed ? (
    <img
      className="riso-deal-photo"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
    />
  ) : (
    <div className="riso-deal-photo placeholder" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }} aria-hidden="true">
      {dealEmoji(deal)}
    </div>
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
        {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : <div className="riso-cook-thumb-placeholder">{recipe.title[0]}</div>}
        {savings > 0 && (
          <span className="riso-sticker yellow riso-cook-save">save {money(savings)}</span>
        )}
      </div>
      <div className="riso-cook-body">
        <h4 className="riso-cook-title">{recipe.title}</h4>
        <p className="riso-cook-uses">
          On sale: {usedNames.slice(0, 3).join(", ")}
          {usedNames.length > 3 ? ` +${usedNames.length - 3} more` : ""}.
        </p>
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

const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function endsLabel(days) {
  if (days <= 0) return "ENDS TODAY";
  if (days === 1) return "ENDS TOMORROW";
  return `ENDS IN ${days} DAYS`;
}

// A deal's own detail: its picture, the price, the last 6 months as bars
// (lowest price seen each month) with the lowest/average/highest, any
// storage tip, and add-to-list / watch.
// A flyer item up close: photo, price, how it compares, its 6-month chart.
// Used by the Flyers page and the grocery list's deal tags; `others` lists
// the same product at other stores, and the list/watch buttons show only
// when given a handler.
export function DealDetailModal({ deal, onClose, onList, onToggleWatch, others = [], postalCode }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoCheck, setPhotoCheck] = useState(null);

  // When the photo doesn't show, ask the server what the photo site said.
  useEffect(() => {
    if (!photoFailed || !deal.imageUrl || !/^https?:/i.test(deal.imageUrl)) return;
    let live = true;
    api
      .checkDealPhoto(deal.id)
      .then((r) => live && setPhotoCheck(r))
      .catch((err) => live && setPhotoCheck({ ok: false, tries: [{ reason: err.message }] }));
    return () => {
      live = false;
    };
  }, [photoFailed, deal.id, deal.imageUrl]);

  const meter = meterFor(deal);
  const history = deal.history || [];
  const prices = history.map((m) => m.price).filter((p) => p != null);
  // The same 6-month range the table's meter uses; the bars are each
  // month's lowest price, so a mid-month high only shows up here.
  const low = deal.sixMonthLow ?? (prices.length ? Math.min(...prices) : null);
  const high = deal.sixMonthHigh ?? (prices.length ? Math.max(...prices) : null);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const barMax = prices.length ? Math.max(...prices) : 0;
  const floor = low != null ? low * 0.9 : 0;
  const span = barMax > floor ? barMax - floor : 1;
  const isLow = meter && meter.verdict === "6-MO LOW";
  const unitText = comparePriceOf(deal) != null ? `${money(comparePriceOf(deal))}/${compareBasisOf(deal)}` : null;
  const quebecRange = deal.rangeSource === "quebec";
  // Skip the unit price when the printed price already says the same thing.
  const unit = unitText && unitText.replace(/\s/g, "") !== deal.price.replace(/\s/g, "") ? unitText : null;
  // A manually uploaded flyer keeps its page; Le Rabais items have their own photo.
  const flyerPage =
    !deal.imageUrl && deal.source && !["Le Rabais", "Flipp"].includes(deal.source) ? api.flyerUploadImageUrl(deal.source) : null;
  // This month's bar is green for a good price: by its own history, or
  // - with none yet - against Quebec's average.
  const goodNow = isGoodPrice(deal);

  return (
    <div className="riso-theme riso-deal-backdrop" onClick={onClose}>
      <div
        className="riso-deal-detail"
        role="dialog"
        aria-modal="true"
        aria-label={deal.item}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="riso-deal-detail-photo">
          {deal.imageUrl && !photoFailed ? (
            <img src={dealPhotoSrc(deal)} alt="" onError={() => setPhotoFailed(true)} />
          ) : (
            <span className="riso-deal-detail-letter" aria-hidden="true">
              {dealEmoji(deal)}
            </span>
          )}
          {isLow && <span className="riso-deal-detail-low">6-month low!</span>}
          {photoCheck && (
            <p className="riso-deal-detail-photo-why">
              {photoCheck.ok
                ? "The app's server got this photo, but the page couldn't show it."
                : `Photo didn't load: ${photoHostLabel(photoCheck.url)} ${photoCheck.tries.at(-1)?.reason || "couldn't be read"}.`}{" "}
              {photoCheck.url && (
                <a href={photoCheck.url} target="_blank" rel="noreferrer">
                  Open the photo ↗
                </a>
              )}
            </p>
          )}
          {flyerPage && (
            <a className="riso-deal-detail-page" href={flyerPage} target="_blank" rel="noreferrer">
              See the flyer page ↗
            </a>
          )}
        </div>
        <div className="riso-deal-detail-body">
          <button type="button" className="riso-deal-detail-close" aria-label="Close" title="Close" onClick={onClose}>
            ×
          </button>
          <div className="riso-deal-detail-head">
            <span className="riso-deal-detail-eyebrow">
              {deal.store.toUpperCase()} · {(deal.aisleLabel || AISLE_LABEL[deal.aisle] || "Other").toUpperCase()}
            </span>
            <h3 className="riso-deal-detail-name">{deal.item}</h3>
            {deal.endsInDays != null && <span className="riso-deal-detail-ends">{endsLabel(deal.endsInDays)}</span>}
          </div>
          <div className="riso-deal-detail-price">
            <strong>{deal.price}</strong>
            {unit && <span>{unit}</span>}
          </div>
          {regularLabel(deal) && <p className="riso-deal-detail-reg">{regularLabel(deal)}, says the flyer</p>}
          {deal.baseline && (
            <div className={`riso-deal-detail-avg ${goodNow ? "stock-up" : deal.baseline.verdict === "high" ? "high" : "normal"}`}>
              <div>
                <span className="riso-deal-detail-avg-label">QUEBEC AVERAGE · {monthLabel(deal.baseline.month).toUpperCase()}</span>
                <strong>
                  {money(deal.baseline.price)}/{deal.baseline.basis || compareBasisOf(deal)}
                </strong>
              </div>
              <p>
                <b>{quebecHeadline(deal.baseline, goodNow)}</b>
                {" · "}
                {deal.baseline.pct === 0
                  ? "the same as what it usually costs in Quebec"
                  : `${Math.abs(deal.baseline.pct)}% ${deal.baseline.pct < 0 ? "less" : "more"} than it usually costs in Quebec`}{" "}
                <span className="riso-deal-detail-avg-source">(Statistics Canada: {deal.baseline.product})</span>
              </p>
            </div>
          )}
          {history.length > 0 && (
            <div className="riso-deal-detail-history">
              <div className="riso-deal-detail-history-head">
                <strong>
                  {quebecRange ? "Quebec average, last 6 months" : "Last 6 months"}
                  <small className="riso-deal-detail-history-source">
                    {meter ? ` · ${meter.source.long}` : ""} · per {compareBasisOf(deal)}
                  </small>
                </strong>
                <span className={meter?.good ? "good" : ""}>{meter ? meter.verdict : "NEW · NO HISTORY YET"}</span>
              </div>
              <div className="riso-deal-bars">
                {history.map((m, i) => {
                  const current = !quebecRange && i === history.length - 1;
                  return (
                    <div key={m.month} className="riso-deal-bar-col">
                      <span className="riso-deal-bar-price">{m.price != null ? money(m.price) : "—"}</span>
                      <div
                        className={`riso-deal-bar${m.price == null ? " empty" : ""}${current ? (goodNow ? " now good" : " now") : ""}`}
                        style={{ height: m.price != null ? `${Math.round(18 + ((m.price - floor) / span) * 82)}%` : "12%" }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="riso-deal-bar-months">
                {history.map((m, i) => (
                  <span key={m.month} className={!quebecRange && i === history.length - 1 ? "now" : ""}>
                    {MONTH_SHORT[Number(m.month.slice(5, 7)) - 1]}
                  </span>
                ))}
              </div>
              <div className="riso-deal-stats">
                <div>
                  <span>LOWEST</span>
                  <strong className="good">{low != null ? money(low) : "—"}</strong>
                </div>
                <div>
                  <span>AVERAGE</span>
                  <strong>{avg != null ? money(avg) : "—"}</strong>
                </div>
                <div>
                  <span>HIGHEST</span>
                  <strong>{high != null ? money(high) : "—"}</strong>
                </div>
              </div>
            </div>
          )}
          {deal.freezeTip && <p className="riso-deal-detail-tip">❄ {deal.freezeTip}</p>}
          {others.length > 0 && (
            <div className="riso-deal-detail-others">
              <span className="riso-deal-detail-others-label">ALSO ON SALE</span>
              {others.slice(0, 4).map((o) => (
                <span key={o.id} className="riso-deal-detail-other">
                  {o.store} · {o.price}
                </span>
              ))}
            </div>
          )}
          <a className="riso-deal-detail-flyer" href={flyerUrl(deal.store, postalCode)} target="_blank" rel="noreferrer">
            Open the {deal.store} flyer ↗
          </a>
          {(onList || onToggleWatch) && (
            <div className="riso-deal-detail-actions">
              {onList && (
                <button type="button" className={`riso-deal-detail-list${deal.isListed ? " on" : ""}`} onClick={onList}>
                  {deal.isListed ? "✓ On your grocery list" : "+ Add to grocery list"}
                </button>
              )}
              {onToggleWatch && (
                <button type="button" className={`riso-deal-detail-watch${deal.isWatching ? " on" : ""}`} onClick={onToggleWatch}>
                  {deal.isWatching ? "★ Watching" : "☆ Watch this"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPostal(pc) {
  return pc && pc.length === 6 ? `${pc.slice(0, 3)} ${pc.slice(3)}` : pc || "";
}

function formatWhen(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Where the weekly import reads from: postal code, which stores, on/off.
// The store chips are only the stores Flipp has a grocery flyer from near
// that postal code - a store Flipp doesn't list can't be imported, so a
// saved one that isn't there any more is dropped (and said so).
function ImportSettings({ settings, onSaved, onClose }) {
  const [postalCode, setPostalCode] = useState(formatPostal(settings.postalCode));
  const [stores, setStores] = useState(settings.stores);
  const [autoImport, setAutoImport] = useState(settings.autoImport);
  const [nearby, setNearby] = useState(null);
  const [nearbyError, setNearbyError] = useState(null);
  const [dropped, setDropped] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function loadNearby(pc) {
    setNearby(null);
    setNearbyError(null);
    api
      .listFlyerStores(pc.replace(/\s/g, ""))
      .then((r) => {
        setNearby(r.stores);
        // Keep the picks Flipp lists here, under Flipp's own name.
        setStores((prev) => {
          const kept = [];
          const gone = [];
          for (const s of prev) {
            const match = r.stores.find((m) => merchantMatches(m, s));
            if (match) kept.push(match);
            else gone.push(s);
          }
          setDropped(gone);
          return [...new Set(kept)];
        });
      })
      .catch((err) => setNearbyError(err.message));
  }

  useEffect(() => {
    loadNearby(settings.postalCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOn = (name) => stores.some((s) => s.toLowerCase() === name.toLowerCase());
  const toggle = (name) =>
    setStores((prev) => (isOn(name) ? prev.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...prev, name]));
  const choices = nearby || stores;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateFlyerSettings({ postalCode, stores, autoImport }));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="riso-import-settings">
      <div className="riso-import-settings-row">
        <label className="riso-import-field">
          <span>POSTAL CODE</span>
          <input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
            onBlur={() => /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(postalCode.trim()) && loadNearby(postalCode)}
            placeholder="H2T 2S3"
            maxLength={7}
          />
        </label>
        <div className="riso-import-auto">
          <Switch on={autoImport} onToggle={() => setAutoImport((v) => !v)} label="Import every week" />
          <span>Import every Thursday</span>
        </div>
      </div>
      <div className="riso-import-field">
        <span>STORES {stores.length === 0 ? "· NONE PICKED = EVERY GROCERY FLYER NEAR YOU" : `· ${stores.length} PICKED`}</span>
        <div className="riso-import-stores">
          {choices.map((name) => (
            <button
              key={name}
              type="button"
              className={`riso-chip${isOn(name) ? " active" : ""}`}
              aria-pressed={isOn(name)}
              onClick={() => toggle(name)}
            >
              {isOn(name) ? "✓ " : ""}
              {name}
            </button>
          ))}
        </div>
        <p className="riso-import-note">
          {nearbyError
            ? `${nearbyError}. Your stores are kept as they are until Flipp answers.`
            : nearby
              ? nearby.length
                ? `Flipp has grocery flyers near ${formatPostal(postalCode.replace(/\s/g, ""))} from ${nearby.length} store${nearby.length === 1 ? "" : "s"}.`
                : "Flipp has no grocery flyers near this postal code."
              : "Looking up the stores near you on Flipp…"}
        </p>
        {dropped.length > 0 && (
          <p className="riso-import-note riso-import-dropped">
            Removed {dropped.join(", ")}: Flipp has no flyer from {dropped.length === 1 ? "it" : "them"} near this postal
            code, so {dropped.length === 1 ? "it" : "they"} can't be imported. Save to keep this change.
          </p>
        )}
      </div>
      {error && <p className="riso-error">{error}</p>}
      <div className="riso-import-actions">
        <button type="button" className="riso-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="riso-btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function shortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "—");

// "Did the import work?": what each store's flyer gave this week, the
// prices that couldn't be read, what the prices are compared with, the
// weeks of prices kept for the 6-month history - and a fix for older
// prices saved per item that were per lb (GET /api/flyers/report).
function ImportReport({ onFixed }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixedCount, setFixedCount] = useState(null);

  function load() {
    setError(null);
    api
      .getImportReport()
      .then(setReport)
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function fix() {
    setFixing(true);
    try {
      const { fixed } = await api.fixPerLbPrices();
      setFixedCount(fixed);
      onFixed();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setFixing(false);
    }
  }

  if (error) return <p className="riso-error">Couldn't check the import: {error}</p>;
  if (!report) return <p className="riso-import-note">Checking this week's import…</p>;

  const c = report.compared;
  const comparable = c.store + c.stores + c.quebec + c.none;
  return (
    <div className="riso-report" aria-label="Import check">
      <h4 className="riso-report-title">This week's import</h4>
      {report.stores.length === 0 ? (
        <p className="riso-import-note">No flyer deals yet - Import now pulls this week's.</p>
      ) : (
        <div className="riso-report-table" role="table">
          <div className="riso-report-row head" role="row">
            <span role="columnheader">Store</span>
            <span role="columnheader">From</span>
            <span role="columnheader">Items</span>
            <span role="columnheader">Price read</span>
            <span role="columnheader">Per lb / L</span>
            <span role="columnheader">Photos</span>
            <span role="columnheader">Ends</span>
            <span role="columnheader">Imported</span>
          </div>
          {report.stores.map((s) => (
            <div key={`${s.store}|${s.source}`} className="riso-report-row" role="row">
              <span role="cell">{s.store}</span>
              <span role="cell">{s.source || "Upload"}</span>
              <span role="cell">{s.items}</span>
              <span role="cell" className={s.priced < s.items ? "warn" : ""}>
                {s.priced} · {pct(s.priced, s.items)}
              </span>
              <span role="cell">{s.perUnit}</span>
              <span role="cell">{pct(s.photos, s.items)}</span>
              <span role="cell">{shortDate(s.endsOn)}</span>
              <span role="cell">{shortDate(s.importedAt)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="riso-report-line">
        <b>Compared with:</b> its own 6 months at that store {c.store} · the same product at other stores {c.stores} ·
        Quebec's average {c.quebec} · nothing yet {c.none}
        {comparable > 0 && ` (${pct(comparable - c.none, comparable)} of prices have something to compare with)`}
      </p>

      <p className="riso-report-line">
        <b>Price history:</b>{" "}
        {report.historyWeeks.length === 0
          ? "no earlier weeks stored yet - each import adds one."
          : `${report.historyWeeks.length} earlier week${report.historyWeeks.length === 1 ? "" : "s"} stored, back to ${shortDate(
              report.historyWeeks.at(-1).week
            )}.`}
      </p>
      {report.historyWeeks.length > 0 && (
        <div className="riso-report-weeks">
          {report.historyWeeks.map((w) => (
            <span key={w.week} title={w.sources.join(", ")}>
              {shortDate(w.week)} · {w.rows}
            </span>
          ))}
        </div>
      )}

      {report.unreadableCount > 0 && (
        <details className="riso-report-details">
          <summary>
            {report.unreadableCount} price{report.unreadableCount === 1 ? "" : "s"} couldn't be read (shown, but not compared)
          </summary>
          <ul>
            {report.unreadable.map((u, i) => (
              <li key={i}>
                {u.store}: {u.item} - "{u.price}"
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.fixable.count > 0 && (
        <div className="riso-report-fix">
          <p>
            <b>
              {report.fixable.count} older price{report.fixable.count === 1 ? " was" : "s were"} saved per item but {report.fixable.count === 1 ? "was" : "were"} per lb
            </b>{" "}
            (e.g. {report.fixable.examples.slice(0, 3).map((e) => `${e.store} ${e.item} ${e.price}`).join(", ")}). They throw off the 6-month
            range.
          </p>
          <button type="button" className="riso-btn primary small" onClick={fix} disabled={fixing}>
            {fixing ? "Fixing…" : "Mark them per lb"}
          </button>
        </div>
      )}
      {fixedCount != null && <p className="riso-import-note">Fixed {fixedCount} price{fixedCount === 1 ? "" : "s"}.</p>}
    </div>
  );
}

// The strip under the title: what the weekly import does, how the last
// run went, Import now and its settings.
function AutoImportStrip({ settings, importing, onImport, onSettingsSaved, onDealsChanged }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const where = settings.stores.length ? settings.stores.join(", ") : "every grocery flyer";
  const last = settings.lastImportAt
    ? settings.lastImportOk
      ? `Last import ${formatWhen(settings.lastImportAt)}: ${settings.lastImportCount} deals from ${settings.lastImportSource}.`
      : `Last import ${formatWhen(settings.lastImportAt)} didn't work.`
    : "Nothing imported yet.";

  return (
    <section className={`riso-auto-import${settings.lastImportAt && !settings.lastImportOk ? " failed" : ""}`}>
      <div className="riso-auto-import-main">
        <span className={`riso-auto-import-badge${settings.autoImport ? " on" : ""}`}>
          {settings.autoImport ? "auto-import on" : "auto-import off"}
        </span>
        <div className="riso-auto-import-text">
          <p>
            {settings.autoImport ? "Every Thursday" : "When you press Import now"}, this week's flyers from{" "}
            <strong>{where}</strong> near {formatPostal(settings.postalCode)} are pulled in from Flipp (Le Rabais if Flipp
            is down), and each week's prices are kept for the 6-month history.
          </p>
          <p className="riso-auto-import-last">
            {last}
            {settings.lastImportMessage && <span> {settings.lastImportMessage}</span>}
          </p>
        </div>
        <div className="riso-auto-import-buttons">
          <button type="button" className="riso-btn" onClick={() => setChecking((o) => !o)} aria-expanded={checking}>
            Check import
          </button>
          <button type="button" className="riso-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Settings
          </button>
          <button type="button" className="riso-btn primary" onClick={onImport} disabled={importing}>
            {importing ? "Importing…" : "Import now"}
          </button>
        </div>
      </div>
      {checking && <ImportReport key={settings.lastImportAt || "none"} onFixed={onDealsChanged} />}
      {open && <ImportSettings settings={settings} onSaved={onSettingsSaved} onClose={() => setOpen(false)} />}
    </section>
  );
}

// The last week of deals this page loaded: coming back to Flyers shows it
// straight away while a fresh copy loads.
let lastDeals = null;

// A group shows this many cards until "Show all" (a week is a few hundred
// ingredients; drawing them all at once made the page slow to appear).
const GROUP_PAGE = 12;

const SLICES = [
  { id: "category", label: "Category" },
  { id: "ends", label: "Ends soon" },
  { id: "freeze", label: "Can freeze" },
];
const SLICE_KEY = "flyers-slice";
const COLLAPSED_KEY = "flyers-collapsed";
const RANK_KEY = "flyers-rank";
const LOW_T = 0.05;

// "$0.79/lb" on the same footing the tiles compare on, or the flyer's own
// price text when it couldn't be read as one number.
function priceText(deal) {
  const p = tilePrice(deal);
  if (!p) return deal.price;
  return `${money(p.price)}${p.basis === "each" ? "" : `/${p.basis}`}`;
}

// What you pay at the shelf and, for a pack worked out per lb / per L from
// its size, that figure as well: a $5.99 3 lb bag is "$5.99" and "$2.00/lb",
// so it's never mistaken for 99¢/lb loose apples or read as a $2 price.
function shelfPrice(deal) {
  const p = tilePrice(deal);
  if (!p) return { main: deal.price, unit: "" };
  if (deal.unitBasis === "each" && p.basis !== "each" && deal.unitPrice != null) {
    return { main: money(deal.unitPrice), unit: `${money(p.price)}/${p.basis}` };
  }
  return { main: money(p.price), unit: unitLabel(p.basis) };
}

function endsText(days) {
  if (days <= 0) return "ends today";
  if (days === 1) return "ends tomorrow";
  return `ends in ${days} days`;
}

const cardId = (key) => `flyer-ing-${key.replace(/[^a-z0-9]+/gi, "-")}`;

// The product photo across the top of an ingredient card; a food emoji on
// the striped placeholder when there's none.
function CoverPhoto({ deal }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [deal.imageUrl]);
  const src = dealPhotoSrc(deal);
  return src && !failed ? (
    <img className="riso-ing-cover" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <span className="riso-ing-cover-emoji" aria-hidden="true">
      {dealEmoji(deal)}
    </span>
  );
}

// One of the three briefing panels: up to 4 ingredients, each opening its
// card in the list below.
function BriefPanel({ tone, kicker, title, rows, emptyText, onOpen }) {
  return (
    <section className={`riso-brief ${tone}`}>
      {tone === "accent" && <span className="riso-brief-sticker">real deals!</span>}
      <p className="riso-brief-kicker">{kicker}</p>
      <h3 className="riso-brief-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="riso-brief-empty">{emptyText}</p>
      ) : (
        rows.map(({ g, sub, deal }) => (
          <button key={g.key} type="button" className="riso-brief-row" onClick={() => onOpen(g)}>
            <DealPhoto deal={g.photoDeal} size={56} />
            <span className="riso-brief-row-info">
              <span className="riso-brief-row-name">{g.name}</span>
              <span className="riso-brief-row-sub">{sub}</span>
            </span>
            <span className="riso-brief-row-price">
              <span className="riso-brief-row-amt">{priceText(deal)}</span>
              <span className="riso-brief-row-store">{deal.store}</span>
            </span>
          </button>
        ))
      )}
    </section>
  );
}

// "30% UNDER QC AVG": a no-history deal against Quebec's average price.
function baselineVerdict({ pct }) {
  if (pct <= -1) return `${-pct}% UNDER QC AVG`;
  if (pct >= 1) return `${pct}% OVER QC AVG`;
  return "SAME AS QC AVG";
}

// One test for "good price" everywhere a deal is judged: in the lowest 40%
// of its own 6-month range when it has one, else well under Quebec's
// average. The Quebec banner and the chart's verdict both use it, so they
// can't contradict each other.
function isGoodPrice(deal) {
  const meter = meterFor(deal);
  if (meter) return meter.good;
  return ["good", "stock-up"].includes(deal.baseline?.verdict);
}

// The Quebec banner's headline, judged by isGoodPrice.
function quebecHeadline(baseline, good) {
  if (good) return "Stock-up price";
  return baseline.verdict === "high" ? "Pricier than usual" : "Near the usual price";
}

// Lowest / average / highest over the 6 months.
function historyStats(deal) {
  const history = deal.history || [];
  const prices = history.map((m) => m.price).filter((p) => p != null);
  return {
    history,
    low: deal.sixMonthLow ?? (prices.length ? Math.min(...prices) : null),
    high: deal.sixMonthHigh ?? (prices.length ? Math.max(...prices) : null),
    avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
  };
}

const BAR_MAX = 96;
const BAR_MIN = 26;

// The open card's price history (Flyers v4 update): Quebec's average,
// the last 6 months as bars (0 to the 6-month high) and the lowest,
// average and highest prices.
function PriceHistory({ deal }) {
  const meter = meterFor(deal);
  const good = isGoodPrice(deal);
  const basis = compareBasisOf(deal);
  const { history, low, high, avg } = historyStats(deal);
  const quebecRange = deal.rangeSource === "quebec";
  const ownHistory = !deal.isNew && !quebecRange && history.some((m) => m.price != null);
  const b = deal.baseline;
  // Statistics Canada's monthly Quebec average, drawn as a line on each
  // month, so every chart has 6 months to compare with from day one -
  // even before the weekly imports have built a history of their own.
  const qcByMonth = new Map(!quebecRange && b?.history ? b.history.map((m) => [m.month, m.price]) : []);
  const qcPrices = [...qcByMonth.values()].filter((p) => p != null);
  const showChart = ownHistory || quebecRange || qcPrices.length > 0;
  const scaleMax = Math.max(high ?? 0, ...qcPrices, ...history.map((m) => m.price ?? 0)) || 1;
  const height = (price) => Math.max(BAR_MIN, Math.round((price / scaleMax) * BAR_MAX));
  const qcStats = qcPrices.length
    ? { low: Math.min(...qcPrices), high: Math.max(...qcPrices), avg: qcPrices.reduce((a, c) => a + c, 0) / qcPrices.length }
    : null;
  const stats = ownHistory || quebecRange ? { low, avg, high, label: "" } : qcStats ? { ...qcStats, label: "QC " } : null;
  const weeks = deal.historyWeeks;
  const unit = basis === "each" ? "each" : `per ${basis}`;

  return (
    <div className="riso-ing-history">
      {b && (
        <div className={`riso-ing-qc${good ? " good" : ""}`}>
          <div className="riso-ing-qc-top">
            <span className="riso-ing-qc-label">QUEBEC AVERAGE · {monthLabel(b.month).toUpperCase()}</span>
            <strong>
              {money(b.price)}/{b.basis || basis}
            </strong>
          </div>
          <p className="riso-ing-qc-line">
            <b>{quebecHeadline(b, good)}</b>
            {" · "}
            {b.pct === 0
              ? "the same as what it usually costs in Quebec"
              : `${Math.abs(b.pct)}% ${b.pct < 0 ? "less" : "more"} than it usually costs in Quebec`}
          </p>
          <p className="riso-ing-qc-source">(Statistics Canada: {b.product})</p>
        </div>
      )}
      {showChart ? (
        <>
          <div className="riso-ing-chart-head">
            <span>
              <strong>{quebecRange ? "Quebec average, last 6 months" : "Last 6 months"}</strong>
              <small>
                {" "}
                ·{" "}
                {quebecRange
                  ? "Statistics Canada"
                  : ownHistory
                    ? `cheapest store${weeks ? `, ${weeks} week${weeks === 1 ? "" : "s"} of flyers` : ""}`
                    : "this week's flyer"}{" "}
                · {unit}
              </small>
            </span>
            <span className={`riso-ing-verdict${good ? " good" : ""}`}>
              {meter ? meter.verdict : b ? baselineVerdict(b) : "NO HISTORY YET"}
            </span>
          </div>
          <div className="riso-ing-bars">
            {history.map((m, i) => {
              const now = !quebecRange && i === history.length - 1;
              const qc = qcByMonth.get(m.month);
              return (
                <div key={m.month} className="riso-ing-bar-col">
                  <span className="riso-ing-bar-price">{m.price != null ? money(m.price) : "–"}</span>
                  <span className="riso-ing-bar-slot">
                    <span
                      className={`riso-ing-bar${m.price == null ? " empty" : ""}${now && good ? " good" : ""}`}
                      style={{ height: m.price != null ? height(m.price) : 24 }}
                    />
                    {qc != null && (
                      <span
                        className="riso-ing-qc-mark"
                        style={{ bottom: height(qc) }}
                        title={`Quebec average: ${money(qc)}/${basis}`}
                        aria-label={`Quebec average ${money(qc)}`}
                      />
                    )}
                  </span>
                  <span className="riso-ing-bar-month">{MONTH_SHORT[Number(m.month.slice(5, 7)) - 1]}</span>
                </div>
              );
            })}
          </div>
          {qcByMonth.size > 0 && (
            <p className="riso-ing-legend">
              <span className="riso-ing-legend-bar" /> lowest flyer price that month
              <span className="riso-ing-legend-mark" /> Quebec average (Statistics Canada)
            </p>
          )}
          {stats && (
            <div className="riso-ing-stats">
              <div>
                <span>{stats.label}LOWEST</span>
                <strong className="good">{stats.low != null ? money(stats.low) : "—"}</strong>
              </div>
              <div>
                <span>{stats.label}AVERAGE</span>
                <strong>{stats.avg != null ? money(stats.avg) : "—"}</strong>
              </div>
              <div>
                <span>{stats.label}HIGHEST</span>
                <strong>{stats.high != null ? money(stats.high) : "—"}</strong>
              </div>
            </div>
          )}
          {!ownHistory && !quebecRange && (
            <p className="riso-ing-range-none">No flyer history for this item yet. It builds each week from the imports.</p>
          )}
        </>
      ) : (
        <p className="riso-ing-range-none">No history for this item yet. It builds each week from the imports.</p>
      )}
    </div>
  );
}

const MAX_TILES = 3;

// One ingredient: its photo, names and a price tile per store (the
// cheapest tinted green). Open, it spans the row and lists every store's
// product, cheapest first, with + List and the 6-month range.
function IngredientCard({ g, open, onToggle, isListedAt, onList, onOpenDeal }) {
  const low = g.t != null && g.t <= LOW_T;
  const multi = g.tiles.filter((d) => tilePrice(d)?.basis === g.mainBasis).length > 1;
  // At most 3 tiles: the cheapest stores, shown in the usual store order.
  const tiles =
    g.tiles.length > MAX_TILES
      ? g.tiles.filter((d) => [...g.tiles].sort((a, b) => (tilePrice(a)?.price ?? Infinity) - (tilePrice(b)?.price ?? Infinity)).slice(0, MAX_TILES).includes(d))
      : g.tiles;
  const isBest = (d) => multi && tilePrice(d)?.basis === g.mainBasis && tilePrice(d)?.price === g.lo;
  const sub = [g.sub, g.freeze ? `freezes ${g.freeze}` : null].filter(Boolean).join(" · ");

  return (
    <article id={cardId(g.key)} className={`riso-ing-card${open ? " open" : ""}${low ? " low" : ""}`}>
      <div
        className="riso-ing-main"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${g.name}: every store's price`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="riso-ing-photo">
          <CoverPhoto deal={g.photoDeal} />
          {g.endsIn != null && g.endsIn <= ENDS_SOON_DAYS && (
            <span className="riso-ing-ends">{g.endsIn <= 0 ? "ENDS TODAY" : g.endsIn === 1 ? "ENDS TOMORROW" : `ENDS IN ${g.endsIn}D`}</span>
          )}
          {low && <span className="riso-ing-low">6-MO LOW</span>}
        </div>
        <div className="riso-ing-head">
          <h4 className="riso-ing-name">{g.name}</h4>
          {sub && <p className="riso-ing-sub">{sub}</p>}
        </div>
        <div className={`riso-ing-tiles n${tiles.length}`} style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map((d) => {
            const shelf = shelfPrice(d);
            const best = isBest(d);
            return (
              <div key={d.store} className={`riso-ing-tile${best ? " best" : ""}`}>
                <div className="riso-ing-tile-store">
                  <span>{d.store.toUpperCase()}</span>
                  {best && <span className="riso-ing-dot" title="Cheapest" aria-label="cheapest" />}
                </div>
                <div className="riso-ing-tile-price">{shelf.main}</div>
                <div className="riso-ing-tile-unit">{shelf.unit}</div>
              </div>
            );
          })}
        </div>
        {g.tiles.length > tiles.length && (
          <p className="riso-ing-more">+{g.tiles.length - tiles.length} more store{g.tiles.length - tiles.length === 1 ? "" : "s"}</p>
        )}
      </div>
      {open && (
        <div className="riso-ing-panel">
          <p className="riso-ing-panel-label">ALL STORES, CHEAPEST FIRST</p>
          {g.variants.map((d) => {
            const { en, fr } = splitBilingual(d.item);
            const listed = isListedAt(g, d.store);
            return (
              <div key={d.id} className="riso-ing-variant">
                <DealPhoto deal={d} size={40} />
                <span className="riso-ing-variant-store">{d.store.toUpperCase()}</span>
                <button type="button" className="riso-ing-variant-names" aria-label={`${d.item} details`} onClick={() => onOpenDeal(d)}>
                  <span className="riso-ing-variant-name">{en}</span>
                  {(fr || regularLabel(d)) && <span className="riso-ing-variant-fr">{fr || regularLabel(d)}</span>}
                </button>
                <span className="riso-ing-variant-price">
                  {shelfPrice(d).main}
                  {d.unitBasis === "each" && tilePrice(d) && tilePrice(d).basis !== "each" && (
                    <small> {shelfPrice(d).unit}</small>
                  )}
                </span>
                <button
                  type="button"
                  className={`riso-ing-list${listed ? " on" : ""}`}
                  aria-pressed={listed}
                  aria-label={listed ? `Take ${g.name} at ${d.store} off the grocery list` : `Add ${g.name} at ${d.store} to the grocery list`}
                  onClick={() => onList(g, d)}
                >
                  {listed ? "✓" : "+ List"}
                </button>
              </div>
            );
          })}
          <PriceHistory deal={g.best} />
        </div>
      )}
    </article>
  );
}

export function FlyerDeals({
  user,
  recipes,
  onSelectRecipe,
  onAddToPlanner,
  isOnGroceryList,
  onAddToGroceryList,
  onRemoveFromGroceryList,
}) {
  const [deals, setDeals] = useState(() => lastDeals);
  const [watchlist, setWatchlist] = useState(new Set());
  const [storeFilter, setStoreFilter] = useState(null);
  const [slice, setSlice] = useState(() => readStored(SLICE_KEY, "category"));
  const [rank, setRank] = useState(() => readStored(RANK_KEY, "best"));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [showAllGroups, setShowAllGroups] = useState(() => new Set());
  // Categories you've folded away, remembered on this device. A search
  // opens every category with a match.
  const [collapsed, setCollapsed] = useState(() => new Set(readStored(COLLAPSED_KEY, [])));
  const [sections, setSections] = useState([]);
  const [clearing, setClearing] = useState(false);
  const [importingLeRabais, setImportingLeRabais] = useState(false);
  const [leRabaisError, setLeRabaisError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [importSettings, setImportSettings] = useState(null);
  const [runningImport, setRunningImport] = useState(false);

  // The grocery list caches deals and stores between visits; anything
  // here can change them (an import, + List), so it reloads them next time.
  // Called on arrival and after anything that changes deals (an import, an
  // upload, a fix); the other tabs' shared copy refreshes with it.
  function loadDeals({ changed = false } = {}) {
    if (changed) {
      invalidateGroceryShared();
      refreshDeals();
    }
    api
      .getDeals()
      .then((d) => {
        lastDeals = d;
        setDeals(d);
      })
      .catch(() => setDeals((cur) => cur));
  }
  const reloadChanged = () => loadDeals({ changed: true });

  useEffect(() => {
    loadDeals();
    api.getFlyerSettings().then(setImportSettings).catch(() => setImportSettings(null));
    api
      .listWatchlist()
      .then((items) => setWatchlist(new Set(items.map((i) => i.matchName))))
      .catch(() => setWatchlist(new Set()));
    api
      .listGrocerySections()
      .then(setSections)
      .catch(() => setSections([]));
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

  // The grocery store each listed ingredient is filed under.
  const storeOfCore = useMemo(() => {
    const map = new Map();
    for (const s of sections) for (const a of s.assignments || []) map.set(a.core, s.name);
    return map;
  }, [sections]);
  const sameStore = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

  function isListedAt(g, store) {
    return isOnGroceryList(g.name) && sameStore(storeOfCore.get(groceryCore(g.name)), store);
  }

  function fileUnder(core, sectionId) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        assignments: [...(s.assignments || []).filter((a) => a.core !== core), ...(s.id === sectionId ? [{ core, sectionId }] : [])],
      }))
    );
  }

  // + List puts the ingredient on this week's list under that store; again
  // takes it off.
  async function listAt(g, deal) {
    invalidateGroceryShared();
    const core = groceryCore(g.name);
    if (isListedAt(g, deal.store)) {
      onRemoveFromGroceryList(g.name);
      fileUnder(core, null);
      api.unassignFromGrocerySection(core).catch(() => {});
      return;
    }
    if (!isOnGroceryList(g.name)) await onAddToGroceryList([g.name]);
    try {
      let section = sections.find((s) => sameStore(s.name, deal.store));
      if (!section) {
        section = await api.createGrocerySection(deal.store);
        setSections((prev) => [...prev, section]);
      }
      fileUnder(core, section.id);
      await api.assignToGrocerySection(section.id, core);
    } catch {
      // Still on the list; it just isn't filed under that store.
    }
  }

  async function clearAllDeals() {
    if (!window.confirm("Clear all uploaded flyer deals? This can't be undone.")) return;
    setClearing(true);
    try {
      await api.clearFlyerDeals();
      setStoreFilter(null);
      reloadChanged();
    } finally {
      setClearing(false);
    }
  }

  async function runImport() {
    setRunningImport(true);
    try {
      setImportSettings(await api.runFlyerImport());
      reloadChanged();
    } catch (err) {
      setImportSettings((prev) => (prev ? { ...prev, lastImportOk: false, lastImportAt: new Date().toISOString(), lastImportMessage: err.message } : prev));
    } finally {
      setRunningImport(false);
    }
  }

  async function importLeRabais() {
    setImportingLeRabais(true);
    setLeRabaisError(null);
    try {
      await api.importLeRabaisDeals();
      reloadChanged();
    } catch (err) {
      setLeRabaisError(err.message);
    } finally {
      setImportingLeRabais(false);
    }
  }

  function isCollapsed(name) {
    return collapsed.has(name) && words.length === 0;
  }
  function toggleGroup(name) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeStored(COLLAPSED_KEY, [...next]);
      return next;
    });
  }
  function setAllCollapsed(names, fold) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const n of names) (fold ? next.add(n) : next.delete(n));
      writeStored(COLLAPSED_KEY, [...next]);
      return next;
    });
  }

  function pickSlice(id) {
    setSlice(id);
    writeStored(SLICE_KEY, id);
  }
  function pickRank(id) {
    setRank(id);
    writeStored(RANK_KEY, id);
  }
  function toggleCard(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // A briefing row opens its ingredient's card and brings it into view.
  function openCard(g) {
    setExpanded((prev) => new Set(prev).add(g.key));
    requestAnimationFrame(() => document.getElementById(cardId(g.key))?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const aisles = deals?.aisles?.length ? deals.aisles : DEFAULT_AISLES;
  const aisleLabels = useMemo(() => Object.fromEntries(aisles.map((a) => [a.id, a.label])), [aisles]);
  const stores = deals?.stores || [];

  // Recomputed only when the deals or the store change - not on every
  // click (a week of flyers is 1,500+ items).
  const ingredients = useMemo(
    () => buildIngredients(deals?.deals || [], { store: storeFilter, storeOrder: stores }),
    [deals, storeFilter, stores]
  );
  const groups = useMemo(() => groupDealsByIngredient(deals?.deals || [], recipes), [deals, recipes]);

  if (!deals) return <p className="riso-theme riso-flyers riso-empty">Loading this week's deals…</p>;

  const detailRaw = detailId != null ? deals.deals.find((d) => d.id === detailId) : null;
  const detailDeal = detailRaw && {
    ...detailRaw,
    aisleLabel: aisleLabels[detailRaw.aisle] || "Other",
    isWatching: watchlist.has((detailRaw.matchName || detailRaw.item).trim().toLowerCase()),
    endsInDays: endsInDays(detailRaw.validUntil),
  };

  const words = foldText(query).split(/\s+/).filter(Boolean);
  const shownIngredients = words.length ? ingredients.filter((g) => words.every((w) => g.search.includes(w))) : ingredients;
  const ranked = [...shownIngredients].sort(RANKS[rank]?.sort || RANKS.best.sort);
  const sliced = sliceIngredients(ranked, slice, aisles);

  // The briefing reads the same filtered set, one row per ingredient.
  const bestSort = RANKS.best.sort;
  const lows = shownIngredients
    .filter((g) => g.t != null && g.t <= LOW_T)
    .sort(bestSort)
    .slice(0, 4)
    .map((g) => ({ g, deal: g.best, sub: "6-month low" }));
  const gaps = shownIngredients
    .filter((g) => g.gap > 0)
    .sort(RANKS.gap.sort)
    .slice(0, 4)
    .map((g) => {
      const priciest = [...g.tiles].filter((d) => tilePrice(d)?.basis === g.mainBasis).sort((a, b) => tilePrice(b).price - tilePrice(a).price)[0];
      const per = g.mainBasis && g.mainBasis !== "each" ? `/${g.mainBasis}` : "";
      return { g, deal: g.best, sub: `save ${money(g.hi - g.lo)}${per} vs ${priciest.store.toLowerCase()}` };
    });
  const endingSoon = shownIngredients
    .filter((g) => g.endsIn != null && g.endsIn <= ENDS_SOON_DAYS)
    .sort((a, b) => a.endsIn - b.endsIn || bestSort(a, b))
    .slice(0, 4)
    .map((g) => {
      const deal = g.variants.find((d) => d.validUntil && daysUntil(d.validUntil) === g.endsIn) || g.best;
      return { g, deal, sub: endsText(g.endsIn) };
    });
  const goneBy = new Date(Date.now() + ENDS_SOON_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { weekday: "long" }).toUpperCase();

  // "What to cook": every recipe used by at least one on-sale ingredient,
  // ranked by total savings (each matched deal's sixMonthHigh minus its
  // current price, 0 with no history yet).
  const recipeCookMap = new Map();
  for (const group of groups) {
    if (group.recipeCount === 0) continue;
    const savingsFor = (d) => {
      if (d.unitPrice == null || !(d.sixMonthHigh > 0) || d.isNew) return 0;
      const under = Math.max(0, d.sixMonthHigh - comparePriceOf(d));
      const amount = compareBasisOf(d) === d.unitBasis ? under : d.unitPrice * (under / d.sixMonthHigh);
      return Math.round(amount * 100) / 100;
    };
    const savingsForGroup = Math.max(0, ...group.deals.map(savingsFor));
    for (const recipe of group.recipes) {
      if (!recipeCookMap.has(recipe.id)) recipeCookMap.set(recipe.id, { recipe, savings: 0, usedNames: [] });
      const entry = recipeCookMap.get(recipe.id);
      entry.savings += savingsForGroup;
      entry.usedNames.push(group.label.toLowerCase());
    }
  }
  const cookEntries = [...recipeCookMap.values()].sort((a, b) => b.savings - a.savings).slice(0, 3);

  const itemCount = deals.deals.length;
  const itemCountText = itemCount.toLocaleString("en-CA");

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
          <UploadFlyerForm onUploaded={reloadChanged} />
          <button type="button" className="riso-btn" onClick={importLeRabais} disabled={importingLeRabais}>
            {importingLeRabais ? "Importing…" : "Refresh from Le Rabais"}
          </button>
        </div>
      </div>
      {leRabaisError && <p className="riso-error">{leRabaisError}</p>}

      {importSettings && (
        <AutoImportStrip
          settings={importSettings}
          importing={runningImport}
          onImport={runImport}
          onSettingsSaved={setImportSettings}
          onDealsChanged={reloadChanged}
        />
      )}

      {deals.isMockData && (
        <p className="riso-flyers-sample-note">
          <span className="riso-sticker yellow">sample</span>
          These are example deals so you can see how this page works. Press Import now to pull in this week's real flyers.
        </p>
      )}

      <HintStrip userId={user.id} screenKey="flyers-v4">
        Each card is one ingredient. The tiles show the best price at each store, and the green dot marks the cheapest.
        Click a card to see every store, the French names and the 6-month price range. Until an item has its own
        history, it is compared with Quebec's average price from Statistics Canada. Pink means the deal ends within 2
        days.
      </HintStrip>

      <div className="riso-briefing">
        <BriefPanel
          tone="accent"
          kicker="LOWEST IN 6 MONTHS"
          title="Lows to grab"
          rows={lows}
          emptyText="No 6-month lows this week yet. History builds from each Thursday import."
          onOpen={openCard}
        />
        <BriefPanel
          tone="plain"
          kicker="SAME ITEM, DIFFERENT STORE"
          title="Biggest store gaps"
          rows={gaps}
          emptyText="Only one store has these items."
          onOpen={openCard}
        />
        <BriefPanel
          tone="hot"
          kicker={`GONE BY ${goneBy}`}
          title="Ends soon"
          rows={endingSoon}
          emptyText={`Nothing ends in the next ${ENDS_SOON_DAYS} days.`}
          onOpen={openCard}
        />
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
        <h3 className="riso-whole-flyer-title">The whole flyer</h3>
        <div className="riso-flyer-controls">
          <div className="riso-flyer-controls-row">
            <input
              type="search"
              className="riso-flyer-search"
              value={query}
              placeholder={`Search ${itemCountText} flyer items, e.g. chicken, fromage`}
              aria-label="Search flyer items"
              onChange={(e) => setQuery(e.target.value)}
            />
            {stores.length > 1 && (
              <div className="riso-store-switch" role="group" aria-label="Store">
                {[null, ...stores].map((s) => (
                  <button
                    key={s || "all"}
                    type="button"
                    className={storeFilter === s ? "active" : ""}
                    aria-pressed={storeFilter === s}
                    onClick={() => setStoreFilter(s)}
                  >
                    {s || "All stores"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="riso-flyer-controls-row">
            <span className="riso-flyer-controls-label">SLICE BY</span>
            {SLICES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`riso-slice-chip${slice === c.id ? " active" : ""}`}
                aria-pressed={slice === c.id}
                onClick={() => pickSlice(c.id)}
              >
                {c.label}
              </button>
            ))}
            <span className="riso-flyer-controls-label rank">RANK BY</span>
            {Object.entries(RANKS).map(([id, r]) => (
              <button
                key={id}
                type="button"
                className={`riso-slice-chip${rank === id ? " active" : ""}`}
                aria-pressed={rank === id}
                onClick={() => pickRank(id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="riso-flyer-summary-row">
          <p className="riso-flyer-summary">
            {shownIngredients.length} ingredient{shownIngredients.length === 1 ? "" : "s"} · tap a card for every store,
            bilingual names and the price range
          </p>
          {sliced.length > 1 && !words.length && (
            <span className="riso-flyer-fold">
              <button type="button" onClick={() => setAllCollapsed(sliced.map((g) => g.name), true)}>
                Fold all
              </button>
              <button type="button" onClick={() => setAllCollapsed(sliced.map((g) => g.name), false)}>
                Open all
              </button>
            </span>
          )}
        </div>
        {stores.length > 0 && (
          <p className="riso-flyer-links">
            <span>OPEN THE FLYER</span>
            {(storeFilter ? [storeFilter] : stores).map((s) => (
              <a key={s} href={flyerUrl(s, importSettings?.postalCode)} target="_blank" rel="noreferrer">
                {s} ↗
              </a>
            ))}
          </p>
        )}

        {sliced.length === 0 ? (
          <p className="riso-ing-empty">{words.length ? `Nothing on the flyers matches "${query.trim()}".` : "No ingredients match."}</p>
        ) : (
          sliced.map((group) => (
            <section key={group.name} className="riso-ing-group" aria-label={group.name}>
              <button
                type="button"
                className={`riso-ing-group-head${isCollapsed(group.name) ? " collapsed" : ""}`}
                aria-expanded={!isCollapsed(group.name)}
                onClick={() => toggleGroup(group.name)}
                disabled={words.length > 0}
              >
                <span className="riso-ing-group-caret" aria-hidden="true">
                  {isCollapsed(group.name) ? "▸" : "▾"}
                </span>
                <h4>{group.name}</h4>
                <span className="riso-ing-group-count">{group.items.length}</span>
                <span className="riso-ing-group-rule" />
              </button>
              {!isCollapsed(group.name) && (
              <div className="riso-ing-grid">
                {(showAllGroups.has(group.name) || words.length
                  ? group.items
                  : group.items.filter((g, i) => i < GROUP_PAGE || expanded.has(g.key))
                ).map((g) => (
                  <IngredientCard
                    key={g.key}
                    g={g}
                    open={expanded.has(g.key)}
                    onToggle={() => toggleCard(g.key)}
                    isListedAt={isListedAt}
                    onList={listAt}
                    onOpenDeal={(d) => setDetailId(d.id)}
                  />
                ))}
              </div>
              )}
              {!isCollapsed(group.name) && !showAllGroups.has(group.name) && !words.length && group.items.length > GROUP_PAGE && (
                <button
                  type="button"
                  className="riso-ing-more-btn"
                  onClick={() => setShowAllGroups((prev) => new Set(prev).add(group.name))}
                >
                  Show all {group.items.length} in {group.name}
                </button>
              )}
            </section>
          ))
        )}
      </div>

      {detailDeal && (
        <DealDetailModal
          deal={detailDeal}
          others={(ingredients.find((g) => g.variants.some((d) => d.id === detailDeal.id))?.variants || []).filter((d) => d.id !== detailDeal.id)}
          onClose={() => setDetailId(null)}
          onToggleWatch={() => toggleWatch(detailDeal)}
          postalCode={importSettings?.postalCode}
        />
      )}
    </div>
  );
}
