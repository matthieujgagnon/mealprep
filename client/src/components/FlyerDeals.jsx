import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { groupDealsByIngredient } from "../lib/similarRecipes.js";
import { dealEmoji } from "../lib/dealEmoji.js";
import { groceryCore } from "../lib/groceryDedupe.js";
import { invalidateGroceryShared } from "../lib/groceryCache.js";
import { refreshDeals } from "../lib/dealsStore.js";
import {
  brandOf,
  buildIngredients,
  foldText,
  RANKS,
  sliceIngredients,
  splitBilingual,
  tilePrice,
  unitLabel,
  dealVerdict,
  ingredientNames,
  savingText,
} from "../lib/flyerIngredients.js";
import { daysUntil } from "../lib/pantryInventory.js";
import { HintStrip, Switch } from "./RisoControls.jsx";
import { flyerUrl, merchantMatches } from "../lib/flyerLinks.js";
import { dict, getLang, t, tx } from "../i18n/index.js";
import { formatDate, formatDayRange, formatMoney, formatMonthDay, formatNumber, formatShortDay, localizePrice } from "../i18n/format.js";

const ENDS_SOON_DAYS = 2;
const money = (n) => formatMoney(n);

// The aisles the "By category" view groups by, in walking order. The server
// sends its own list with the deals (GET /api/deals -> aisles); this is the
// fallback for an older server. Their names are the app's own (aisles.*).
const DEFAULT_AISLES = [
  "produce", "meat", "seafood", "dairy", "deli", "bakery", "frozen", "pantry", "snacks", "drinks", "household", "other",
].map((id) => ({ id }));
const aisleLabel = (id) => t(`aisles.${id || "other"}`);

// "Sep" / "SEPT" for the chart's months.
const monthShort = (month) => dict().months.short[Number(String(month).slice(5, 7)) - 1].replace(/\.$/, "").toUpperCase();

// How a flyer photo check went, in the app's language (see the server's
// checkDealPhoto); older answers carry only the English reason.
function photoWhy(attempt) {
  if (!attempt) return t("flyers.photoUnreadable");
  if (attempt.code) return t(`flyers.photoWhy.${attempt.code}`, { status: attempt.status, detail: attempt.detail });
  return attempt.reason || t("flyers.photoUnreadable");
}

// What the weekly import found, in the app's language (lastImportInfo),
// or the sentence an older import saved.
function importNote(settings) {
  const info = settings.lastImportInfo;
  if (!info) return settings.lastImportMessage || null;
  const failure = (f) => `${f.store}: ${f.code ? t(`flyers.flipp.${f.code}`, f.vars) : f.message}`;
  if (!info.ok) {
    const why =
      info.code === "storesFailed"
        ? (info.vars?.failures || []).map(failure).join("; ")
        : info.code
          ? t(`flyers.flipp.${info.code}`, info.vars)
          : info.detail;
    return t("flyers.importFailed", { why });
  }
  const photos = info.photos === info.count ? t("flyers.importNoteAll") : formatNumber(info.photos);
  const note = t("flyers.importNote", { stores: info.stores, count: info.count, photos });
  const failed = info.failures ? info.failures.map(failure).join("; ") : info.failed;
  return failed ? `${note} ${t("flyers.importNoteFailed", { failed })}` : note;
}

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
  return t("flyers.regular", { price: `${money(deal.regularPrice)}${per}`, off });
}

// Where a deal's usual range comes from (GET /api/deals -> rangeSource).
const RANGE_SOURCE = {
  store: { get long() { return t("flyers.rangeStoreLong"); } },
  stores: { get long() { return t("flyers.rangeStoresLong"); } },
  quebec: { get long() { return t("flyers.rangeQuebecLong"); } },
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
  if (high <= low && !quebec) {
    return { low, high, pos: "50%", dot: "var(--riso-surface)", key: "same", verdict: t("flyers.meterSame"), good: false, source };
  }
  const at = high > low ? (cur - low) / (high - low) : cur < low ? -1 : cur > high ? 2 : 0.5;
  const clamped = Math.max(0, Math.min(1, at));
  const key = quebec
    ? at <= 0.02
      ? "underQc"
      : at < 0.4
        ? "goodQc"
        : "usualQc"
    : at <= 0.05
      ? deal.rangeSource === "stores"
        ? "lowestAround"
        : "low6"
      : at < 0.4
        ? "good"
        : "usual";
  const verdict = t(`flyers.meter${key[0].toUpperCase()}${key.slice(1)}`);
  const good = at < 0.4;
  return { low, high, pos: `${Math.round(clamped * 100)}%`, dot: good ? "var(--riso-green)" : "var(--riso-surface)", key, verdict, good, source };
}

function monthLabel(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return "";
  return formatDate(new Date(Date.UTC(y, m - 1, 1)), { month: "short", year: "numeric", timeZone: "UTC" });
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
    return t("flyers.thePhoto");
  }
}

// The item's own photo from the flyer; a food emoji when there isn't one or
// it won't load.
export function DealPhoto({ deal, size }) {
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
        {t("flyers.uploadFlyer")}
      </button>
    );
  }

  return (
    <form className="riso-upload-form" onSubmit={handleUpload}>
      <label className="form-label">
        {t("flyers.uploadStore")}
        <input
          type="text"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder={t("flyers.uploadStorePlaceholder")}
          required
        />
      </label>
      <label className="form-label">
        {t("flyers.uploadFile")}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </label>
      <button type="submit" className="riso-btn primary" disabled={uploading}>
        {uploading ? t("flyers.reading") : t("flyers.extract")}
      </button>
      <button type="button" className="riso-btn" onClick={() => setOpen(false)}>
        {t("flyers.cancel")}
      </button>
      {error && <p className="riso-error">{error}</p>}
    </form>
  );
}

function endsLabel(days) {
  return endsText(days).toUpperCase();
}

// A deal's own detail: its picture, the price, the last 6 months as bars
// (lowest price seen each month) with the lowest/average/highest, any
// storage tip, and add-to-list / watch.
// A flyer item up close: photo, price, how it compares, its 6-month chart.
// Used by the Flyers page, the grocery list's deal tags, the recipe card's sale
// tag and the sale marks on a Makeable card (DealDetailHost in SaleTag.jsx);
// `others` lists the same product at other stores, and the list / watch /
// "See in Flyers" buttons show only when given a handler.
export function DealDetailModal({ deal, onClose, onList, onToggleWatch, onOpenCirculaires, others = [], postalCode, onOpenOther }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoCheck, setPhotoCheck] = useState(null);
  // Opening another product from "Also on sale" swaps the deal in place.
  useEffect(() => {
    setPhotoFailed(false);
    setPhotoCheck(null);
  }, [deal.id]);

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
  const isLow = meter && meter.key === "low6";
  const unitText = comparePriceOf(deal) != null ? `${money(comparePriceOf(deal))}/${compareBasisOf(deal)}` : null;
  const quebecRange = deal.rangeSource === "quebec";
  // Skip the unit price when the printed price already says the same thing.
  const unit = unitText && unitText.replace(/\s/g, "") !== localizePrice(deal.price).replace(/\s/g, "") ? unitText : null;
  // A manually uploaded flyer keeps its page; imported items have their own photo.
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
          {isLow && <span className="riso-deal-detail-low">{t("flyers.lowBadge")}</span>}
          {photoCheck && (
            <p className="riso-deal-detail-photo-why">
              {photoCheck.ok
                ? t("flyers.photoServerOk")
                : t("flyers.photoFailed", { host: photoHostLabel(photoCheck.url), reason: photoWhy(photoCheck.tries.at(-1)) })}{" "}
              {photoCheck.url && (
                <a href={photoCheck.url} target="_blank" rel="noreferrer">
                  {t("flyers.openPhoto")}
                </a>
              )}
            </p>
          )}
          {flyerPage && (
            <a className="riso-deal-detail-page" href={flyerPage} target="_blank" rel="noreferrer">
              {t("flyers.seePage")}
            </a>
          )}
        </div>
        <div className="riso-deal-detail-body">
          <button
            type="button"
            className="riso-deal-detail-close"
            aria-label={t("flyers.close")}
            title={t("flyers.close")}
            onClick={onClose}
          >
            ×
          </button>
          <div className="riso-deal-detail-head">
            <span className="riso-deal-detail-eyebrow">
              {deal.store.toUpperCase()} · {aisleLabel(deal.aisle).toUpperCase()}
            </span>
            <h3 className="riso-deal-detail-name">{deal.item}</h3>
            {brandOf(deal) && <span className="riso-deal-detail-brand">{t("grocery.brand", { brand: brandOf(deal) })}</span>}
            {deal.endsInDays != null && <span className="riso-deal-detail-ends">{endsLabel(deal.endsInDays)}</span>}
          </div>
          <div className="riso-deal-detail-price">
            <strong>{localizePrice(deal.price)}</strong>
            {unit && <span>{unit}</span>}
          </div>
          {regularLabel(deal) && <p className="riso-deal-detail-reg">{t("flyers.saysFlyer", { regular: regularLabel(deal) })}</p>}
          <Verdict deal={deal} />
          {deal.baseline && (
            <div className={`riso-deal-detail-avg ${goodNow ? "stock-up" : deal.baseline.verdict === "high" ? "high" : "normal"}`}>
              <div>
                <span className="riso-deal-detail-avg-label">
                  {t("flyers.quebecAverage", { month: monthLabel(deal.baseline.month).toUpperCase() })}
                </span>
                <strong>
                  {money(deal.baseline.price)}/{deal.baseline.basis || compareBasisOf(deal)}
                </strong>
              </div>
              <p>
                <b>{quebecHeadline(deal.baseline, goodNow)}</b>
                {" · "}
                {quebecCompare(deal.baseline)}{" "}
                <span className="riso-deal-detail-avg-source">{t("flyers.statcanSource", { product: statcanName(deal.baseline) })}</span>
              </p>
            </div>
          )}
          {history.length > 0 && (
            <div className="riso-deal-detail-history">
              <div className="riso-deal-detail-history-head">
                <strong>
                  {quebecRange ? t("flyers.quebecLast6") : t("flyers.last6")}
                  <small className="riso-deal-detail-history-source">
                    {meter ? ` · ${meter.source.long}` : ""} · {unitLabel(compareBasisOf(deal))}
                  </small>
                </strong>
                <span className={meter?.good ? "good" : ""}>{meter ? meter.verdict : t("flyers.newNoHistory")}</span>
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
                    {monthShort(m.month)}
                  </span>
                ))}
              </div>
              {/* With only this week's price, a lowest / average / highest of
                  the same number reads like a real average - it isn't. */}
              {!quebecRange && history.filter((m) => m.price != null).length <= 1 ? (
                <p className="riso-deal-stats-none">{t("flyers.onlyThisWeek")}</p>
              ) : (
              <div className="riso-deal-stats">
                <div>
                  <span>{t("flyers.lowest")}</span>
                  <strong className="good">{low != null ? money(low) : "—"}</strong>
                </div>
                <div>
                  <span>{t("flyers.average")}</span>
                  <strong>{avg != null ? money(avg) : "—"}</strong>
                </div>
                <div>
                  <span>{t("flyers.highest")}</span>
                  <strong>{high != null ? money(high) : "—"}</strong>
                </div>
              </div>
              )}
            </div>
          )}
          {deal.freezeTip && <p className="riso-deal-detail-tip">❄ {freezeText(deal)}</p>}
          {others.length > 0 && (
            <div className="riso-deal-detail-others">
              <span className="riso-deal-detail-others-label">{t("flyers.alsoOnSale")}</span>
              {others.slice(0, 4).map((o) =>
                onOpenOther ? (
                  <button
                    key={o.id}
                    type="button"
                    className="riso-deal-detail-other"
                    title={t("flyers.openAt", { item: o.item, store: o.store })}
                    onClick={() => onOpenOther(o)}
                  >
                    {o.store} · {localizePrice(o.price)} →
                  </button>
                ) : (
                  <span key={o.id} className="riso-deal-detail-other">
                    {o.store} · {localizePrice(o.price)}
                  </span>
                )
              )}
            </div>
          )}
          <a className="riso-deal-detail-flyer" href={flyerUrl(deal.store, postalCode)} target="_blank" rel="noreferrer">
            {t("flyers.openFlyer", { store: deal.store })}
          </a>
          {onOpenCirculaires && (
            <button type="button" className="riso-deal-detail-circulaires" onClick={onOpenCirculaires}>
              {t("flyers.seeInFlyers")}
            </button>
          )}
          {(onList || onToggleWatch) && (
            <div className="riso-deal-detail-actions">
              {onList && (
                <button type="button" className={`riso-deal-detail-list${deal.isListed ? " on" : ""}`} onClick={onList}>
                  {deal.isListed ? t("flyers.onList") : t("flyers.addToList")}
                </button>
              )}
              {onToggleWatch && (
                <button type="button" className={`riso-deal-detail-watch${deal.isWatching ? " on" : ""}`} onClick={onToggleWatch}>
                  {deal.isWatching ? t("flyers.watching") : t("flyers.watch")}
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
  return formatShortDay(new Date(iso));
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
          <span>{t("flyers.postalCode")}</span>
          <input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
            onBlur={() => /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(postalCode.trim()) && loadNearby(postalCode)}
            placeholder="H2T 2S3"
            maxLength={7}
          />
        </label>
        <div className="riso-import-auto">
          <Switch on={autoImport} onToggle={() => setAutoImport((v) => !v)} label={t("flyers.importWeekly")} />
          <span>{t("flyers.importThursday")}</span>
        </div>
      </div>
      <div className="riso-import-field">
        <span>{stores.length === 0 ? t("flyers.storesNone") : t("flyers.storesPicked", { count: stores.length })}</span>
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
            ? t("flyers.nearbyError", { error: nearbyError })
            : nearby
              ? nearby.length
                ? t("flyers.nearbyCount", { postal: formatPostal(postalCode.replace(/\s/g, "")), count: nearby.length })
                : t("flyers.nearbyNone")
              : t("flyers.nearbyLooking")}
        </p>
        {dropped.length > 0 && (
          <p className="riso-import-note riso-import-dropped">
            {t("flyers.dropped", { count: dropped.length, stores: dropped.join(", ") })}
          </p>
        )}
      </div>
      {error && <p className="riso-error">{error}</p>}
      <div className="riso-import-actions">
        <button type="button" className="riso-btn" onClick={onClose}>
          {t("flyers.cancel")}
        </button>
        <button type="button" className="riso-btn primary" onClick={save} disabled={saving}>
          {saving ? t("flyers.saving") : t("flyers.save")}
        </button>
      </div>
    </div>
  );
}

function shortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return formatMonthDay(d);
}

const pct = (n, total) => (total ? formatNumber(n / total, { style: "percent", maximumFractionDigits: 0 }) : "—");

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

  if (error) return <p className="riso-error">{t("flyers.reportError", { error })}</p>;
  if (!report) return <p className="riso-import-note">{t("flyers.reportChecking")}</p>;

  const c = report.compared;
  const comparable = c.store + c.stores + c.quebec + c.none;
  return (
    <div className="riso-report" aria-label={t("flyers.reportAria")}>
      <h4 className="riso-report-title">{t("flyers.reportTitle")}</h4>
      {report.stores.length === 0 ? (
        <p className="riso-import-note">{t("flyers.reportNone")}</p>
      ) : (
        <div className="riso-report-table" role="table">
          <div className="riso-report-row head" role="row">
            <span role="columnheader">{t("flyers.colStore")}</span>
            <span role="columnheader">{t("flyers.colFrom")}</span>
            <span role="columnheader">{t("flyers.colItems")}</span>
            <span role="columnheader">{t("flyers.colPriceRead")}</span>
            <span role="columnheader">{t("flyers.colPerUnit")}</span>
            <span role="columnheader">{t("flyers.colPhotos")}</span>
            <span role="columnheader">{t("flyers.colEnds")}</span>
            <span role="columnheader">{t("flyers.colImported")}</span>
          </div>
          {report.stores.map((s) => (
            <div key={`${s.store}|${s.source}`} className="riso-report-row" role="row">
              <span role="cell" className="store">{s.store}</span>
              <span role="cell" data-label={t("flyers.colFrom")}>{s.source || t("flyers.upload")}</span>
              <span role="cell" data-label={t("flyers.colItems")}>{s.items}</span>
              <span role="cell" data-label={t("flyers.colPriceRead")} className={s.priced < s.items ? "warn" : ""}>
                {s.priced} · {pct(s.priced, s.items)}
              </span>
              <span role="cell" data-label={t("flyers.colPerUnit")}>{s.perUnit}</span>
              <span role="cell" data-label={t("flyers.colPhotos")}>{pct(s.photos, s.items)}</span>
              <span role="cell" data-label={t("flyers.colEnds")}>{shortDate(s.endsOn)}</span>
              <span role="cell" data-label={t("flyers.colImported")}>{shortDate(s.importedAt)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="riso-report-line">
        <b>{t("flyers.comparedLabel")}</b>{" "}
        {t("flyers.comparedLine", { store: c.store, stores: c.stores, quebec: c.quebec, none: c.none })}
        {comparable > 0 && ` ${t("flyers.comparedShare", { pct: pct(comparable - c.none, comparable) })}`}
      </p>

      <p className="riso-report-line">
        <b>{t("flyers.historyLabel")}</b>{" "}
        {report.historyWeeks.length === 0
          ? t("flyers.historyNone")
          : t("flyers.historyWeeks", { count: report.historyWeeks.length, date: shortDate(report.historyWeeks.at(-1).week) })}
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
          <summary>{t("flyers.unreadable", { count: report.unreadableCount })}</summary>
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
            <b>{t("flyers.fixableHead", { count: report.fixable.count })}</b>{" "}
            {t("flyers.fixableExamples", {
              examples: report.fixable.examples
                .slice(0, 3)
                .map((e) => `${e.store} ${e.item} ${localizePrice(e.price)}`)
                .join(", "),
            })}
          </p>
          <button type="button" className="riso-btn primary small" onClick={fix} disabled={fixing}>
            {fixing ? t("flyers.fixing") : t("flyers.markPerLb")}
          </button>
        </div>
      )}
      {fixedCount != null && <p className="riso-import-note">{t("flyers.fixed", { count: fixedCount })}</p>}
    </div>
  );
}

// The strip under the title: what the weekly import does, how the last
// run went, Import now and its settings.
function AutoImportStrip({ settings, importing, onImport, onSettingsSaved, onDealsChanged }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const where = settings.stores.length ? settings.stores.join(", ") : t("flyers.everyFlyer");
  const last = settings.lastImportAt
    ? settings.lastImportOk
      ? t("flyers.lastOk", {
          when: formatWhen(settings.lastImportAt),
          count: settings.lastImportCount,
          source: settings.lastImportSource,
        })
      : t("flyers.lastFailed", { when: formatWhen(settings.lastImportAt) })
    : t("flyers.nothingYet");
  const note = importNote(settings);

  return (
    <section className={`riso-auto-import${settings.lastImportAt && !settings.lastImportOk ? " failed" : ""}`}>
      <div className="riso-auto-import-main">
        <span className={`riso-auto-import-badge${settings.autoImport ? " on" : ""}`}>
          {settings.autoImport ? t("flyers.autoOn") : t("flyers.autoOff")}
        </span>
        <div className="riso-auto-import-text">
          <p>
            {tx("flyers.autoText", {
              when: settings.autoImport ? t("flyers.everyThursday") : t("flyers.whenYouPress"),
              where: <strong>{where}</strong>,
              postal: formatPostal(settings.postalCode),
            })}
          </p>
          <p className="riso-auto-import-last">
            {last}
            {note && <span> {note}</span>}
          </p>
        </div>
        <div className="riso-auto-import-buttons">
          <button type="button" className="riso-btn" onClick={() => setChecking((o) => !o)} aria-expanded={checking}>
            {t("flyers.checkImport")}
          </button>
          <button type="button" className="riso-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {t("flyers.settings")}
          </button>
          <button type="button" className="riso-btn primary" onClick={onImport} disabled={importing}>
            {importing ? t("flyers.importing") : t("flyers.importNow")}
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
  { id: "category", get label() { return t("flyers.sliceCategory"); } },
  { id: "ends", get label() { return t("flyers.sliceEnds"); } },
  { id: "freeze", get label() { return t("flyers.sliceFreeze"); } },
];
const SLICE_KEY = "flyers-slice";
const COLLAPSED_KEY = "flyers-collapsed";
const RANK_KEY = "flyers-rank";
const SALES_KEY = "flyers-sales-only";

const LOW_T = 0.05;

// Quebec's average against this price, in words.
function quebecCompare(baseline) {
  if (baseline.pct === 0) return t("flyers.sameAsQuebec");
  return t(baseline.pct < 0 ? "flyers.lessThanQuebec" : "flyers.moreThanQuebec", { pct: Math.abs(baseline.pct) });
}

// Statistics Canada's own name for the product, in French when it gave one.
function statcanName(baseline) {
  return (getLang() === "fr" && baseline.productFr) || baseline.product;
}

// "Freezes 3–6 months." from the USDA range the server sends.
function freezeText(deal) {
  if (!deal.freezeRange) return deal.freezeTip;
  return t("flyers.freezes", { range: formatDayRange(deal.freezeRange.min, deal.freezeRange.max) });
}

// "$0.79/lb" on the same footing the tiles compare on, or the flyer's own
// price text when it couldn't be read as one number.
function priceText(deal) {
  const p = tilePrice(deal);
  if (!p) return localizePrice(deal.price);
  return `${money(p.price)}${p.basis === "each" ? "" : `/${p.basis}`}`;
}

// What you pay at the shelf and, for a pack worked out per lb / per L from
// its size, that figure as well: a $5.99 3 lb bag is "$5.99" and "$2.00/lb",
// so it's never mistaken for 99¢/lb loose apples or read as a $2 price.
function shelfPrice(deal) {
  const p = tilePrice(deal);
  if (!p) return { main: localizePrice(deal.price), unit: "" };
  if (deal.unitBasis === "each" && p.basis !== "each" && deal.unitPrice != null) {
    return { main: money(deal.unitPrice), unit: `${money(p.price)}/${p.basis}` };
  }
  return { main: money(p.price), unit: unitLabel(p.basis) };
}

function endsText(days) {
  if (days <= 0) return t("flyers.endsToday");
  if (days === 1) return t("flyers.endsTomorrow");
  return t("flyers.endsInDays", { count: days });
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
      {tone === "accent" && <span className="riso-brief-sticker">{t("flyers.realDeals")}</span>}
      <p className="riso-brief-kicker">{kicker}</p>
      <h3 className="riso-brief-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="riso-brief-empty">{emptyText}</p>
      ) : (
        rows.map(({ g, sub, deal }) => (
          <button
            key={g.key}
            type="button"
            className="riso-brief-row"
            onClick={() => onOpen(deal)}
            aria-label={t("flyers.briefAria", { name: ingredientNames(g).name, price: priceText(deal), store: deal.store })}
          >
            <DealPhoto deal={g.photoDeal} size={56} />
            <span className="riso-brief-row-info">
              <span className="riso-brief-row-name">{ingredientNames(g).name}</span>
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
  if (pct <= -1) return t("flyers.baselineUnder", { pct: -pct });
  if (pct >= 1) return t("flyers.baselineOver", { pct });
  return t("flyers.baselineSame");
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
  if (good) return t("flyers.headlineStockUp");
  return baseline.verdict === "high" ? t("flyers.headlinePricier") : t("flyers.headlineNear");
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
  const stats = ownHistory || quebecRange ? { low, avg, high, qc: false } : qcStats ? { ...qcStats, qc: true } : null;
  const weeks = deal.historyWeeks;
  const unit = unitLabel(basis);

  return (
    <div className="riso-ing-history">
      {b && (
        <div className={`riso-ing-qc${good ? " good" : ""}`}>
          <div className="riso-ing-qc-top">
            <span className="riso-ing-qc-label">{t("flyers.quebecAverage", { month: monthLabel(b.month).toUpperCase() })}</span>
            <strong>
              {money(b.price)}/{b.basis || basis}
            </strong>
          </div>
          <p className="riso-ing-qc-line">
            <b>{quebecHeadline(b, good)}</b>
            {" · "}
            {quebecCompare(b)}
          </p>
          <p className="riso-ing-qc-source">{t("flyers.statcanSource", { product: statcanName(b) })}</p>
        </div>
      )}
      {showChart ? (
        <>
          <div className="riso-ing-chart-head">
            <span>
              <strong>{quebecRange ? t("flyers.quebecLast6") : t("flyers.last6")}</strong>
              <small>
                {" "}
                ·{" "}
                {quebecRange
                  ? t("flyers.statcan")
                  : ownHistory
                    ? weeks
                      ? `${t("flyers.cheapestStore")}, ${t("flyers.weeksOfFlyers", { count: weeks })}`
                      : t("flyers.cheapestStore")
                    : t("flyers.thisWeeksFlyer")}{" "}
                · {unit}
              </small>
            </span>
            <span className={`riso-ing-verdict${good ? " good" : ""}`}>
              {meter ? meter.verdict : b ? baselineVerdict(b) : t("flyers.noHistoryYet")}
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
                        title={t("flyers.qcMarkTitle", { price: `${money(qc)}/${basis}` })}
                        aria-label={t("flyers.qcMarkAria", { price: money(qc) })}
                      />
                    )}
                  </span>
                  <span className="riso-ing-bar-month">{monthShort(m.month)}</span>
                </div>
              );
            })}
          </div>
          {qcByMonth.size > 0 && (
            <p className="riso-ing-legend">
              <span className="riso-ing-legend-bar" /> {t("flyers.legendBar")}
              <span className="riso-ing-legend-mark" /> {t("flyers.legendMark")}
            </p>
          )}
          {stats && (
            <div className="riso-ing-stats">
              <div>
                <span>{stats.qc ? t("flyers.qcLowest") : t("flyers.lowest")}</span>
                <strong className="good">{stats.low != null ? money(stats.low) : "—"}</strong>
              </div>
              <div>
                <span>{stats.qc ? t("flyers.qcAverage") : t("flyers.average")}</span>
                <strong>{stats.avg != null ? money(stats.avg) : "—"}</strong>
              </div>
              <div>
                <span>{stats.qc ? t("flyers.qcHighest") : t("flyers.highest")}</span>
                <strong>{stats.high != null ? money(stats.high) : "—"}</strong>
              </div>
            </div>
          )}
          {!ownHistory && !quebecRange && (
            <p className="riso-ing-range-none">{t("flyers.noFlyerHistory")}</p>
          )}
        </>
      ) : (
        <p className="riso-ing-range-none">{t("flyers.noHistory")}</p>
      )}
    </div>
  );
}

const MAX_TILES = 3;

// One ingredient: its photo, names and a price tile per store (the
// cheapest tinted green). Open, it spans the row and lists every store's
// product, cheapest first, with + List and the 6-month range.
// "Stock up · Its lowest price in 6 months, and it freezes." - the plain
// answer to "would I buy it?" (see dealVerdict).
function Verdict({ deal, compact = false }) {
  const v = dealVerdict(deal);
  if (!v) return null;
  if (compact) {
    return (
      <p className={`riso-verdict ${v.key}`} title={v.reason}>
        <b>{v.label}</b> <span>{v.reason}</span>
      </p>
    );
  }
  return (
    <div className={`riso-deal-verdict ${v.key}`}>
      <span className="riso-deal-verdict-label">{t("flyers.wouldIBuy")}</span>
      <strong>{v.label}</strong>
      <p>{v.reason}</p>
    </div>
  );
}

function IngredientCard({ g, open, onToggle, isListedAt, onList, onOpenDeal }) {
  const low = g.t != null && g.t <= LOW_T;
  const multi = g.tiles.filter((d) => tilePrice(d)?.basis === g.mainBasis).length > 1;
  // At most 3 tiles: the cheapest stores, shown in the usual store order.
  const tiles =
    g.tiles.length > MAX_TILES
      ? g.tiles.filter((d) => [...g.tiles].sort((a, b) => (tilePrice(a)?.price ?? Infinity) - (tilePrice(b)?.price ?? Infinity)).slice(0, MAX_TILES).includes(d))
      : g.tiles;
  const isBest = (d) => multi && tilePrice(d)?.basis === g.mainBasis && tilePrice(d)?.price === g.lo;
  const names = ingredientNames(g);
  const sub = [names.sub, g.freeze ? t("flyers.freezesShort", { range: g.freeze }) : null].filter(Boolean).join(" · ");

  return (
    <article id={cardId(g.key)} className={`riso-ing-card${open ? " open" : ""}${low ? " low" : ""}`}>
      <div
        className="riso-ing-main"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={t("flyers.cardAria", { name: names.name })}
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
            <span className="riso-ing-ends">
              {g.endsIn <= 1 ? endsLabel(g.endsIn) : t("flyers.endsInShort", { count: g.endsIn })}
            </span>
          )}
          {low && <span className="riso-ing-low">{t("flyers.lowTag")}</span>}
          {g.saving && (
            <span className="riso-ing-save" title={`${g.saving.deal.store}: ${savingText(g.saving)}`}>
              {g.saving.pct != null ? t("flyers.pctOff", { pct: Math.round(g.saving.pct * 100) }) : g.saving.why.toUpperCase()}
            </span>
          )}
        </div>
        <div className="riso-ing-head">
          <h4 className="riso-ing-name">{names.name}</h4>
          {sub && <p className="riso-ing-sub">{sub}</p>}
          <Verdict deal={g.saving?.deal || g.best} compact />
        </div>
        <div className={`riso-ing-tiles n${tiles.length}`} style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map((d) => {
            const shelf = shelfPrice(d);
            const best = isBest(d);
            return (
              <div key={d.store} className={`riso-ing-tile${best ? " best" : ""}`}>
                <div className="riso-ing-tile-store">
                  <span>{d.store.toUpperCase()}</span>
                  {best && <span className="riso-ing-dot" title={t("flyers.cheapest")} aria-label={t("flyers.cheapestAria")} />}
                </div>
                <div className="riso-ing-tile-price">{shelf.main}</div>
                <div className={`riso-ing-tile-unit${shelf.unit.includes("/") ? " per" : ""}`}>{shelf.unit}</div>
              </div>
            );
          })}
        </div>
        {g.tiles.length > tiles.length && (
          <p className="riso-ing-more">{t("flyers.moreStores", { count: g.tiles.length - tiles.length })}</p>
        )}
      </div>
      {open && (
        <div className="riso-ing-panel">
          <p className="riso-ing-panel-label">{t("flyers.allStores")}</p>
          {g.variants.map((d) => {
            const halves = splitBilingual(d.item);
            // Each product's name in the app's language first, the other under it.
            const [en, fr] = getLang() === "fr" && halves.fr ? [halves.fr, halves.en] : [halves.en, halves.fr];
            const listed = isListedAt(g, d.store);
            return (
              <div key={d.id} className="riso-ing-variant">
                <DealPhoto deal={d} size={40} />
                <span className="riso-ing-variant-store">{d.store.toUpperCase()}</span>
                <button type="button" className="riso-ing-variant-names" aria-label={t("flyers.detailsAria", { item: d.item })} onClick={() => onOpenDeal(d)}>
                  <span className="riso-ing-variant-name">{en}</span>
                  {brandOf(d) && <span className="riso-ing-variant-brand">{brandOf(d)}</span>}
                  {(fr || regularLabel(d)) && <span className="riso-ing-variant-fr">{fr || regularLabel(d)}</span>}
                </button>
                <span className="riso-ing-variant-price">
                  {shelfPrice(d).main}
                  {d.unitBasis === "each" && tilePrice(d) && tilePrice(d).basis !== "each" ? (
                    <small className="per">{shelfPrice(d).unit}</small>
                  ) : (
                    shelfPrice(d).unit && <small>{shelfPrice(d).unit}</small>
                  )}
                </span>
                <button
                  type="button"
                  className={`riso-ing-list${listed ? " on" : ""}`}
                  aria-pressed={listed}
                  aria-label={
                    listed ? t("flyers.takeOff", { name: names.name, store: d.store }) : t("flyers.addAt", { name: names.name, store: d.store })
                  }
                  onClick={() => onList(g, d)}
                >
                  {listed ? "✓" : t("flyers.plusList")}
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
  isOnGroceryList,
  onAddToGroceryList,
  onRemoveFromGroceryList,
  openDealId = null,
  onDealOpened,
}) {
  const [deals, setDeals] = useState(() => lastDeals);
  const [watchlist, setWatchlist] = useState(new Set());
  const [storeFilter, setStoreFilter] = useState(null);
  const [slice, setSlice] = useState(() => readStored(SLICE_KEY, "category"));
  const [rank, setRank] = useState(() => readStored(RANK_KEY, "best"));
  const [salesOnly, setSalesOnly] = useState(() => readStored(SALES_KEY, "no") === "yes");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [showAllGroups, setShowAllGroups] = useState(() => new Set());
  // Categories you've folded away, remembered on this device. A search
  // opens every category with a match.
  const [collapsed, setCollapsed] = useState(() => new Set(readStored(COLLAPSED_KEY, [])));
  const [sections, setSections] = useState([]);
  const [clearing, setClearing] = useState(false);
  // A deal Home asked for opens straight away (its card shows once the
  // deals are in).
  const [detailId, setDetailId] = useState(openDealId);
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
    if (openDealId != null) onDealOpened?.();
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

  // An ingredient goes on the list under the name it's shown with (French
  // in French); one put there in the other language still counts.
  const listNames = (g) => [...new Set([ingredientNames(g).name, g.name])];
  const listedName = (g) => listNames(g).find((n) => isOnGroceryList(n)) || null;

  function isListedAt(g, store) {
    const name = listedName(g);
    return !!name && sameStore(storeOfCore.get(groceryCore(name)), store);
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
    if (isListedAt(g, deal.store)) {
      const name = listedName(g);
      const core = groceryCore(name);
      onRemoveFromGroceryList(name);
      fileUnder(core, null);
      api.unassignFromGrocerySection(core).catch(() => {});
      return;
    }
    const name = listedName(g) || ingredientNames(g).name;
    const core = groceryCore(name);
    if (!isOnGroceryList(name)) await onAddToGroceryList([name], { dealId: deal.id });
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
    if (!window.confirm(t("flyers.clearConfirm"))) return;
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

  function isCollapsed(name) {
    return collapsed.has(name) && words.length === 0;
  }

  // "Jump to": a sticky row of the categories, so with everything open
  // you can go straight to Meat & poultry instead of scrolling past the
  // fruit. Jumping opens a folded category first. The chip of the
  // category on screen is highlighted as you scroll.
  const groupRefs = useRef(new Map());
  const jumpBarRef = useRef(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const jumpLock = useRef(0);
  const controlsRef = useRef(null);
  // Where the sticky bar sits: under the sticky search panel on a wide
  // screen, at the very top on a phone (where the panel scrolls away).
  function barBottom() {
    const bar = jumpBarRef.current;
    if (!bar) return 0;
    return (parseFloat(getComputedStyle(bar).top) || 0) + bar.getBoundingClientRect().height;
  }
  function jumpTo(name) {
    if (collapsed.has(name)) toggleGroup(name);
    setActiveGroup(name);
    jumpLock.current = Date.now() + 1000;
    requestAnimationFrame(() => {
      const el = groupRefs.current.get(name);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - barBottom() - 12;
      window.scrollTo({ top, behavior: "smooth" });
    });
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
  function toggleSalesOnly() {
    setSalesOnly((on) => {
      writeStored(SALES_KEY, on ? "no" : "yes");
      return !on;
    });
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

  const aisles = deals?.aisles?.length ? deals.aisles : DEFAULT_AISLES;
  const stores = deals?.stores || [];

  // Recomputed only when the deals or the store change - not on every
  // click (a week of flyers is 1,500+ items).
  // Savings and freezer times are worded in the app's language, so a
  // language change recomputes too.
  const lang = getLang();
  const ingredients = useMemo(
    () => buildIngredients(deals?.deals || [], { store: storeFilter, storeOrder: stores }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, storeFilter, stores, lang]
  );
  const groups = useMemo(() => groupDealsByIngredient(deals?.deals || [], recipes), [deals, recipes]);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      if (Date.now() < jumpLock.current) return;
      const line = barBottom() + 24;
      let current = null;
      for (const [name, el] of groupRefs.current) {
        if (el && el.getBoundingClientRect().top <= line) current = name;
      }
      setActiveGroup(current ?? groupRefs.current.keys().next().value ?? null);
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [deals, slice, rank, storeFilter, salesOnly, query, collapsed]);
  // The bar sits just under the sticky search panel, however tall it is.
  useEffect(() => {
    const panel = controlsRef.current;
    const bar = jumpBarRef.current;
    if (!panel || !bar || typeof ResizeObserver === "undefined") return undefined;
    const set = () => bar.style.setProperty("--flyer-controls-h", `${panel.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(panel);
    return () => ro.disconnect();
  });
  // Keep the highlighted chip visible in the bar.
  useEffect(() => {
    const chip = jumpBarRef.current?.querySelector(".riso-jump-chip.active");
    chip?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeGroup]);
  if (!deals) return <p className="riso-theme riso-flyers riso-empty">{t("flyers.loading")}</p>;

  const detailRaw = detailId != null ? deals.deals.find((d) => d.id === detailId) : null;
  const detailDeal = detailRaw && {
    ...detailRaw,
    isWatching: watchlist.has((detailRaw.matchName || detailRaw.item).trim().toLowerCase()),
    endsInDays: endsInDays(detailRaw.validUntil),
  };

  const words = foldText(query).split(/\s+/).filter(Boolean);
  const shownIngredients = ingredients.filter(
    (g) => (!salesOnly || g.onSale) && (!words.length || words.every((w) => g.search.includes(w)))
  );
  const ranked = [...shownIngredients].sort(RANKS[rank]?.sort || RANKS.best.sort);
  const sliced = sliceIngredients(ranked, slice, aisles);

  // The briefing reads the same filtered set, one row per ingredient.
  const bestSort = RANKS.best.sort;
  // This week's best deals: 6-month lows first, then the biggest savings
  // (off the flyer's regular price, under Quebec's average).
  const lowRows = shownIngredients
    .filter((g) => g.t != null && g.t <= LOW_T)
    .sort(bestSort)
    .map((g) => ({ g, deal: g.best, sub: t("flyers.lowSub") }));
  const saleRows = shownIngredients
    .filter((g) => g.saving?.pct != null && !lowRows.some((r) => r.g === g))
    .sort((a, b) => b.saving.pct - a.saving.pct)
    .map((g) => ({ g, deal: g.saving.deal, sub: savingText(g.saving) }));
  const lows = [...lowRows, ...saleRows].slice(0, 4);
  const gaps = shownIngredients
    .filter((g) => g.gap > 0)
    .sort(RANKS.gap.sort)
    .slice(0, 4)
    .map((g) => {
      const priciest = [...g.tiles].filter((d) => tilePrice(d)?.basis === g.mainBasis).sort((a, b) => tilePrice(b).price - tilePrice(a).price)[0];
      const per = g.mainBasis && g.mainBasis !== "each" ? `/${g.mainBasis}` : "";
      return { g, deal: g.best, sub: t("flyers.gapSub", { amount: `${money(g.hi - g.lo)}${per}`, store: priciest.store.toLowerCase() }) };
    });
  const endingSoon = shownIngredients
    .filter((g) => g.endsIn != null && g.endsIn <= ENDS_SOON_DAYS)
    .sort((a, b) => a.endsIn - b.endsIn || bestSort(a, b))
    .slice(0, 4)
    .map((g) => {
      const deal = g.variants.find((d) => d.validUntil && daysUntil(d.validUntil) === g.endsIn) || g.best;
      return { g, deal, sub: endsText(g.endsIn) };
    });
  const goneBy = formatDate(new Date(Date.now() + ENDS_SOON_DAYS * 24 * 60 * 60 * 1000), { weekday: "long" }).toUpperCase();

  const itemCount = deals.deals.length;
  const itemCountText = formatNumber(itemCount);

  return (
    <div className="riso-theme riso-flyers">
      <div className="riso-flyers-header">
        <div>
          <p className="riso-eyebrow">
            {[
              stores.join(" + "),
              t("flyers.itemsCount", { count: itemCount }),
              ...(deals.weekOf ? [t("flyers.weekOf", { date: /^\d{4}-\d{2}-\d{2}$/.test(deals.weekOf) ? formatMonthDay(deals.weekOf) : deals.weekOf })] : []),
            ].join(" · ")}
          </p>
          <h2 className="riso-flyers-title">
            {t("flyers.title")} <span className="accent">{t("flyers.titleAccent")}</span>
          </h2>
        </div>
        <div className="riso-flyers-actions">
          {!deals.isMockData && (
            <button type="button" className="riso-btn" onClick={clearAllDeals} disabled={clearing}>
              {clearing ? t("flyers.clearing") : t("flyers.clearAll")}
            </button>
          )}
          <UploadFlyerForm onUploaded={reloadChanged} />
        </div>
      </div>

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
          <span className="riso-sticker yellow">{t("flyers.sample")}</span>
          {t("flyers.sampleNote")}
        </p>
      )}

      <HintStrip userId={user.id} screenKey="flyers-v4">
        {t("flyers.hint")}
      </HintStrip>

      <div className="riso-briefing">
        <BriefPanel
          tone="accent"
          kicker={t("flyers.bestKicker")}
          title={t("flyers.bestTitle")}
          rows={lows}
          emptyText={t("flyers.bestEmpty")}
          onOpen={(deal) => setDetailId(deal.id)}
        />
        <BriefPanel
          tone="plain"
          kicker={t("flyers.gapKicker")}
          title={t("flyers.gapTitle")}
          rows={gaps}
          emptyText={t("flyers.gapEmpty")}
          onOpen={(deal) => setDetailId(deal.id)}
        />
        <BriefPanel
          tone="hot"
          kicker={t("flyers.goneBy", { day: goneBy })}
          title={t("flyers.endsTitle")}
          rows={endingSoon}
          emptyText={t("flyers.endsEmpty", { count: ENDS_SOON_DAYS })}
          onOpen={(deal) => setDetailId(deal.id)}
        />
      </div>

      <div className="riso-whole-flyer">
        <h3 className="riso-whole-flyer-title">{t("flyers.wholeFlyer")}</h3>
        <div className="riso-flyer-controls" ref={controlsRef}>
          <div className="riso-flyer-controls-row">
            <input
              type="search"
              className="riso-flyer-search"
              value={query}
              placeholder={t("flyers.searchPlaceholder", { count: itemCountText })}
              aria-label={t("flyers.searchAria")}
              onChange={(e) => setQuery(e.target.value)}
            />
            {stores.length > 1 && (
              <div className="riso-store-switch" role="group" aria-label={t("flyers.storeAria")}>
                {[null, ...stores].map((s) => (
                  <button
                    key={s || "all"}
                    type="button"
                    className={storeFilter === s ? "active" : ""}
                    aria-pressed={storeFilter === s}
                    onClick={() => setStoreFilter(s)}
                  >
                    {s || t("flyers.allStoresChip")}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="riso-flyer-controls-row">
            <button
              type="button"
              className={`riso-slice-chip sale${salesOnly ? " active" : ""}`}
              aria-pressed={salesOnly}
              onClick={toggleSalesOnly}
              title={t("flyers.salesOnlyTitle")}
            >
              {t("flyers.salesOnly")}
            </button>
            <span className="riso-flyer-controls-label">{t("flyers.sliceBy")}</span>
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
            <span className="riso-flyer-controls-label rank">{t("flyers.rankBy")}</span>
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
          <p className="riso-flyer-summary">{t("flyers.summary", { count: shownIngredients.length })}</p>
          {sliced.length > 1 && !words.length && (
            <span className="riso-flyer-fold">
              <button type="button" onClick={() => setAllCollapsed(sliced.map((g) => g.id), true)}>
                {t("flyers.foldAll")}
              </button>
              <button type="button" onClick={() => setAllCollapsed(sliced.map((g) => g.id), false)}>
                {t("flyers.openAll")}
              </button>
            </span>
          )}
        </div>
        {stores.length > 0 && (
          <p className="riso-flyer-links">
            <span>{t("flyers.openTheFlyer")}</span>
            {(storeFilter ? [storeFilter] : stores).map((s) => (
              <a key={s} href={flyerUrl(s, importSettings?.postalCode)} target="_blank" rel="noreferrer">
                {s} ↗
              </a>
            ))}
          </p>
        )}

        {sliced.length > 1 && !words.length && (
          <nav className="riso-jump-bar" aria-label={t("flyers.jumpAria")} ref={jumpBarRef}>
            <span className="riso-jump-label">{t("flyers.jumpTo")}</span>
            <div className="riso-jump-chips">
              {sliced.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`riso-jump-chip${activeGroup === group.id ? " active" : ""}${isCollapsed(group.id) ? " folded" : ""}`}
                  aria-current={activeGroup === group.id ? "true" : undefined}
                  onClick={() => jumpTo(group.id)}
                >
                  {group.name} <span>{group.items.length}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="riso-jump-top"
              aria-label={t("flyers.backToTop")}
              title={t("flyers.backToTop")}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              ↑
            </button>
          </nav>
        )}

        {sliced.length === 0 ? (
          <p className="riso-ing-empty">
            {words.length ? t("flyers.nothingMatches", { query: query.trim() }) : t("flyers.noIngredients")}
          </p>
        ) : (
          sliced.map((group) => (
            <section
              key={group.id}
              className="riso-ing-group"
              aria-label={group.name}
              data-group={group.id}
              ref={(el) => {
                if (el) groupRefs.current.set(group.id, el);
                else groupRefs.current.delete(group.id);
              }}
            >
              <button
                type="button"
                className={`riso-ing-group-head${isCollapsed(group.id) ? " collapsed" : ""}`}
                aria-expanded={!isCollapsed(group.id)}
                onClick={() => toggleGroup(group.id)}
                disabled={words.length > 0}
              >
                <span className="riso-ing-group-caret" aria-hidden="true">
                  {isCollapsed(group.id) ? "▸" : "▾"}
                </span>
                <h4>{group.name}</h4>
                <span className="riso-ing-group-count">{group.items.length}</span>
                <span className="riso-ing-group-rule" />
              </button>
              {!isCollapsed(group.id) && (
              <div className="riso-ing-grid">
                {(showAllGroups.has(group.id) || words.length
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
              {!isCollapsed(group.id) && !showAllGroups.has(group.id) && !words.length && group.items.length > GROUP_PAGE && (
                <button
                  type="button"
                  className="riso-ing-more-btn"
                  onClick={() => setShowAllGroups((prev) => new Set(prev).add(group.id))}
                >
                  {t("flyers.showAll", { count: group.items.length, group: group.name })}
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
          onOpenOther={(o) => setDetailId(o.id)}
          postalCode={importSettings?.postalCode}
        />
      )}
    </div>
  );
}
