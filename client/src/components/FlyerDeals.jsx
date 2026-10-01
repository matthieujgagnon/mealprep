import { Fragment, useEffect, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { dealEmoji } from "../lib/dealEmoji.js";
import { canonicalize } from "../lib/groceryList.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { HintStrip, Segmented, Switch } from "./RisoControls.jsx";
import { hideBrokenPhoto } from "../lib/photos.js";

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

// FlyerDeal.category, in a grocery-aisle-ish walking order rather than
// alphabetical - for the "whole flyer" table's optional By category
// grouping (see groupByCategory below). Anything outside this list (there
// shouldn't be any, but old rows or a schema change) falls in at the end
// via the `?? 99` in the sort compare.
const CATEGORY_ORDER = ["produce", "dairy", "protein", "bakery", "staple", "other"];
const CATEGORY_LABELS = {
  produce: "Produce",
  dairy: "Dairy",
  protein: "Meat & protein",
  bakery: "Bakery",
  staple: "Pantry staples",
  other: "Other",
};

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

// How far this deal is under (or over) Quebec's average price for the same
// product (Statistics Canada), for deals with no history of their own yet.
function baselineLabel(baseline) {
  if (!baseline) return null;
  const { pct } = baseline;
  if (pct <= -1) return `${-pct}% UNDER QC AVG`;
  if (pct >= 1) return `${pct}% OVER QC AVG`;
  return "SAME AS QC AVG";
}

const BASELINE_VERDICT = {
  "stock-up": "Stock-up price",
  good: "Good price",
  normal: "About usual",
  high: "Pricier than usual",
};

function monthLabel(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return "";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

function isStapleDeal(deal, customStaples) {
  const core = canonicalize(deal.matchName || deal.item).core;
  return (customStaples || []).some((s) => canonicalize(s).core === core);
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

const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function endsLabel(days) {
  if (days <= 0) return "ENDS TODAY";
  if (days === 1) return "ENDS TOMORROW";
  return `ENDS IN ${days} DAYS`;
}

// A deal's own detail: its picture, the price, the last 6 months as bars
// (lowest price seen each month) with the lowest/average/highest, any
// storage tip, and add-to-list / watch.
function DealDetailModal({ deal, onClose, onList, onToggleWatch }) {
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
  const unitText = deal.unitPrice != null ? `${money(deal.unitPrice)}/${deal.unitBasis}` : null;
  // Skip the unit price when the printed price already says the same thing.
  const unit = unitText && unitText.replace(/\s/g, "") !== deal.price.replace(/\s/g, "") ? unitText : null;
  // A manually uploaded flyer keeps its page; Le Rabais items have their own photo.
  const flyerPage =
    !deal.imageUrl && deal.source && !["Le Rabais", "Flipp"].includes(deal.source) ? api.flyerUploadImageUrl(deal.source) : null;
  // This month's bar is green for a good price: by its own history, or
  // - with none yet - against Quebec's average.
  const goodNow = meter ? meter.good : ["good", "stock-up"].includes(deal.baseline?.verdict);

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
              {deal.store.toUpperCase()} · {(CATEGORY_LABELS[deal.category] || "Other").toUpperCase()}
            </span>
            <h3 className="riso-deal-detail-name">{deal.item}</h3>
            {deal.endsInDays != null && <span className="riso-deal-detail-ends">{endsLabel(deal.endsInDays)}</span>}
          </div>
          <div className="riso-deal-detail-price">
            <strong>{deal.price}</strong>
            {unit && <span>{unit}</span>}
          </div>
          {deal.baseline && (
            <div className={`riso-deal-detail-avg ${deal.baseline.verdict}`}>
              <div>
                <span className="riso-deal-detail-avg-label">QUEBEC AVERAGE · {monthLabel(deal.baseline.month).toUpperCase()}</span>
                <strong>
                  {money(deal.baseline.price)}/{deal.unitBasis}
                </strong>
              </div>
              <p>
                <b>{BASELINE_VERDICT[deal.baseline.verdict]}</b>
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
                <strong>Last 6 months</strong>
                <span className={meter?.good ? "good" : ""}>{meter ? meter.verdict : "NEW · NO HISTORY YET"}</span>
              </div>
              <div className="riso-deal-bars">
                {history.map((m, i) => {
                  const current = i === history.length - 1;
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
                  <span key={m.month} className={i === history.length - 1 ? "now" : ""}>
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
          <div className="riso-deal-detail-actions">
            <button type="button" className={`riso-deal-detail-list${deal.isListed ? " on" : ""}`} onClick={onList}>
              {deal.isListed ? "✓ On your grocery list" : "+ Add to grocery list"}
            </button>
            <button type="button" className={`riso-deal-detail-watch${deal.isWatching ? " on" : ""}`} onClick={onToggleWatch}>
              {deal.isWatching ? "★ Watching" : "☆ Watch this"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceMeter({ deal }) {
  const meter = meterFor(deal);
  if (!meter && deal.baseline) {
    return (
      <span className={`riso-meter-new vs-avg${deal.baseline.pct <= -10 ? " good" : ""}`} title={`Quebec average: ${deal.baseline.product}`}>
        {baselineLabel(deal.baseline)}
      </span>
    );
  }
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

// One "whole flyer" table row - shared between the flat list and the By
// category grouped view, so the two only ever differ in what wraps around
// this, never in the row itself.
function DealRow({ deal: d, onOpen, onToggleList }) {
  return (
    <div
      className="riso-table-row clickable"
      role="button"
      tabIndex={0}
      aria-label={`${d.item} details`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="riso-table-item">
        <DealPhoto deal={d} size={48} />
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
        <span className="riso-table-details">Details →</span>
        <button
          type="button"
          className={`riso-list-pill${d.isListed ? " on" : ""}`}
          aria-label={d.isListed ? `Remove ${d.item} from grocery list` : `Add ${d.item} to grocery list`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleList();
          }}
        >
          {d.isListed ? "✓ Listed" : "+ List"}
        </button>
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
// The store chips come from the flyers Flipp actually has near that postal
// code, plus whatever was picked before.
function ImportSettings({ settings, onSaved, onClose }) {
  const [postalCode, setPostalCode] = useState(formatPostal(settings.postalCode));
  const [stores, setStores] = useState(settings.stores);
  const [autoImport, setAutoImport] = useState(settings.autoImport);
  const [nearby, setNearby] = useState(null);
  const [nearbyError, setNearbyError] = useState(null);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function loadNearby(pc) {
    setNearby(null);
    setNearbyError(null);
    api
      .listFlyerStores(pc.replace(/\s/g, ""))
      .then((r) => setNearby(r.stores))
      .catch((err) => setNearbyError(err.message));
  }

  useEffect(() => {
    loadNearby(settings.postalCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOn = (name) => stores.some((s) => s.toLowerCase() === name.toLowerCase());
  const toggle = (name) =>
    setStores((prev) => (isOn(name) ? prev.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...prev, name]));
  const choices = [...new Set([...stores, ...(nearby || [])])];

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
          <form
            className="riso-import-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim() && !isOn(custom.trim())) setStores((prev) => [...prev, custom.trim()]);
              setCustom("");
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ Another store" aria-label="Another store" />
          </form>
        </div>
        <p className="riso-import-note">
          {nearbyError
            ? `${nearbyError}. You can still type store names; the import will try them.`
            : nearby
              ? nearby.length
                ? `Flipp has grocery flyers near ${formatPostal(postalCode.replace(/\s/g, ""))} from ${nearby.length} store${nearby.length === 1 ? "" : "s"}.`
                : "Flipp has no grocery flyers near this postal code."
              : "Looking up the stores near you on Flipp…"}
        </p>
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

// The strip under the title: what the weekly import does, how the last
// run went, Import now and its settings.
function AutoImportStrip({ settings, importing, onImport, onSettingsSaved }) {
  const [open, setOpen] = useState(false);
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
          <button type="button" className="riso-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Settings
          </button>
          <button type="button" className="riso-btn primary" onClick={onImport} disabled={importing}>
            {importing ? "Importing…" : "Import now"}
          </button>
        </div>
      </div>
      {open && <ImportSettings settings={settings} onSaved={onSettingsSaved} onClose={() => setOpen(false)} />}
    </section>
  );
}

export function FlyerDeals({
  user,
  recipes,
  customStaples,
  onSelectRecipe,
  onAddToPlanner,
  isOnGroceryList,
  onAddToGroceryList,
  onRemoveFromGroceryList,
}) {
  const [deals, setDeals] = useState(null);
  const [watchlist, setWatchlist] = useState(new Set());
  const [storeFilter, setStoreFilter] = useState(null);
  const [chipFilter, setChipFilter] = useState("everything");
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importingLeRabais, setImportingLeRabais] = useState(false);
  const [leRabaisError, setLeRabaisError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [importSettings, setImportSettings] = useState(null);
  const [runningImport, setRunningImport] = useState(false);

  function loadDeals() {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }

  useEffect(() => {
    loadDeals();
    api.getFlyerSettings().then(setImportSettings).catch(() => setImportSettings(null));
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

  // The grocery list works in plain ingredient names, so a deal goes on
  // (and comes off) under its matchName.
  function toggleListed(deal) {
    const name = deal.matchName || deal.item;
    if (isOnGroceryList(name)) onRemoveFromGroceryList(name);
    else onAddToGroceryList([name]);
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

  async function runImport() {
    setRunningImport(true);
    try {
      setImportSettings(await api.runFlyerImport());
      loadDeals();
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
    isListed: isOnGroceryList(d.matchName || d.item),
  }));
  const detailDeal = detailId != null ? allDeals.find((d) => d.id === detailId) : null;

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

  // Grouped view for the "whole flyer" table - same rows as the flat list,
  // just bucketed by FlyerDeal.category so a long flyer (50+ items) is
  // easier to scan than one undivided list. Off by default, matching the
  // approved mock's own flat table; a toggle switches it on.
  const categoryGroups = CATEGORY_ORDER.map((cat) => ({
    id: cat,
    label: CATEGORY_LABELS[cat],
    deals: visibleDeals.filter((d) => (d.category || "other") === cat),
  })).filter((g) => g.deals.length > 0);

  // Best deals: where each price sits in its own 6-month range, or - with
  // no history yet - how far under Quebec's average it is (10% under
  // counts like the top of the "good" range, 40% under like a 6-month low).
  const dealScore = (d) =>
    !d.isNew && d.sixMonthHigh != null
      ? (d.unitPrice - d.sixMonthLow) / (d.sixMonthHigh - d.sixMonthLow || 1)
      : d.baseline && d.baseline.pct <= -10
        ? Math.max(0, (d.baseline.pct + 40) / 75)
        : null;
  const withUnitPrice = allDeals.filter((d) => d.unitPrice != null && d.unitBasis);
  const bestDeals = withUnitPrice
    .map((d) => ({ d, score: dealScore(d) }))
    .filter((x) => x.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((x) => x.d);

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
        />
      )}

      {deals.isMockData && (
        <p className="riso-flyers-sample-note">
          <span className="riso-sticker yellow">sample</span>
          These are example deals so you can see how this page works. Press Import now to pull in this
          week's real flyers.
        </p>
      )}
      <>
          <HintStrip userId={user.id} screenKey="flyers-v2">
            Deals are compared with the last 6 months of prices. On the meter, a green dot toward
            the left means it's a real deal; until an item has its own history, it's compared with
            Quebec's average price from Statistics Canada instead. Pink means the deal ends within 2 days. Click any item
            to see its price history, add it to your list or watch it.
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
                    <button key={d.id} type="button" className="riso-deal-row" onClick={() => setDetailId(d.id)}>
                      <DealPhoto deal={d} size={52} />
                      <div className="riso-deal-row-info">
                        <span className="riso-deal-row-name">{d.item}</span>
                        <span className="riso-deal-row-meta">
                          {d.price} · {d.store}
                        </span>
                      </div>
                      <div className="riso-deal-row-price">
                        <span className="price-amt">{d.price.split("/")[0]}</span>
                        <span className="riso-deal-row-verdict">{meterFor(d)?.verdict || baselineLabel(d.baseline)}</span>
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
              <Segmented
                options={[
                  { id: "flat", label: "All" },
                  { id: "category", label: "By category" },
                ]}
                value={groupByCategory ? "category" : "flat"}
                onChange={(id) => setGroupByCategory(id === "category")}
              />
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
                {groupByCategory
                  ? categoryGroups.map((group) => (
                      <Fragment key={group.id}>
                        <div className="riso-table-group-head">
                          <span>{group.label}</span>
                          <span className="riso-table-group-count">{group.deals.length}</span>
                        </div>
                        {group.deals.map((d) => (
                          <DealRow key={d.id} deal={d} onOpen={() => setDetailId(d.id)} onToggleList={() => toggleListed(d)} />
                        ))}
                      </Fragment>
                    ))
                  : visibleDeals.map((d) => (
                      <DealRow key={d.id} deal={d} onOpen={() => setDetailId(d.id)} onToggleList={() => toggleListed(d)} />
                    ))}
              </div>
            )}
          </div>
      </>

      {detailDeal && (
        <DealDetailModal
          deal={detailDeal}
          onClose={() => setDetailId(null)}
          onList={() => toggleListed(detailDeal)}
          onToggleWatch={() => toggleWatch(detailDeal)}
        />
      )}
    </div>
  );
}
