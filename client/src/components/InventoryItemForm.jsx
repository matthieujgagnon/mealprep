import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { BottomSheet } from "./RisoControls.jsx";
import { ItemPhoto, photoFor } from "./ItemPhoto.jsx";
import { UnitSelect } from "./UnitSelect.jsx";
import { categoryLabel } from "../lib/pantryInventory.js";
import { formatFractionQuantity, parseQuantityInput, unitLabel } from "../lib/units.js";
import { isImageFile, uploadPhoto } from "../lib/photoUpload.js";
import {
  ADD_QUICK,
  EDIT_QUICK,
  USE_BY_CHIPS,
  buildAddPayload,
  buildEditPatch,
  commitQuantity,
  dateFromDays,
  daysFromDate,
  expiryTag,
  lineForDays,
  rangeText,
  startDays,
  stepQuantity,
  useByKind,
} from "../lib/inventoryForm.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../i18n/format.js";

// The one form behind "+ Add item" and a tapped item card (design handoff:
// docs/design/inventory-item-form/README.md). Add mode adds as many items as you
// like (Enter or "Add and next" keeps the form open); Edit mode works on a copy of
// the item that only Save changes commits. Typing an item in here counts as
// confirming it, so Add goes straight to Inventory (see CLAUDE.md).

function Step({ n, children }) {
  return (
    <div className="riso-itemform-step">
      <span className="riso-itemform-step-n">{n}</span>
      <span className="riso-itemform-label">{children}</span>
    </div>
  );
}

// The photo box: drop a picture, upload one, or paste a link. Only http(s) links.
function PhotoPanel({ item, photo, onChange, optional }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [link, setLink] = useState("");
  const own = photo && photo !== "none" ? photo : null;
  const generic = !own && photoFor({ name: item.name, imageUrl: photo });
  const hidden = photo === "none";

  async function attach(file) {
    if (!file) return;
    if (!isImageFile(file)) return setError(t("inventory.pickImage"));
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadPhoto(file));
    } catch (err) {
      setError(err.message || t("inventory.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function applyLink() {
    const url = link.trim();
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url)) return setError(t("inventory.linkHttp"));
    setError(null);
    setLink("");
    onChange(url);
  }

  return (
    <div>
      <div className="riso-itemform-label">{optional ? t("inventory.form.photoOptional") : t("inventory.form.photo")}</div>
      <div
        className="riso-itemform-photo"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach(e.dataTransfer.files?.[0]);
        }}
      >
        {own ? (
          <div className="riso-itemform-photo-row">
            <img className="riso-itemform-thumb" src={own} alt="" />
            <button type="button" className="riso-itemform-small" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? t("inventory.uploading") : t("inventory.changePhoto")}
            </button>
            <button type="button" className="link-btn subtle" onClick={() => onChange(null)}>
              {t("inventory.removePhoto")}
            </button>
          </div>
        ) : (
          <>
            <div className="riso-itemform-drop">{t("inventory.form.dropPicture")}</div>
            <button type="button" className="riso-itemform-pillbtn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? t("inventory.uploading") : t("inventory.form.uploadPhoto")}
            </button>
            <div className="riso-itemform-or">{t("inventory.form.or")}</div>
            <div className="riso-itemform-linkrow">
              <input
                type="url"
                value={link}
                placeholder={t("inventory.form.linkPlaceholder")}
                aria-label={t("inventory.photoLink")}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
              />
              <button type="button" className="riso-itemform-pillbtn small" onClick={applyLink}>
                {t("inventory.form.use")}
              </button>
            </div>
          </>
        )}
        {error && <div className="riso-itemform-error" role="alert">{error}</div>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label={t("inventory.itemPhoto")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            attach(file);
          }}
        />
      </div>
      {generic && !hidden && (
        <div className="riso-itemform-stock">
          {t("inventory.stockPhoto")}{" "}
          <button type="button" className="link-btn subtle" onClick={() => onChange("none")}>
            {t("inventory.hideIt")}
          </button>
        </div>
      )}
      {hidden && photoFor({ name: item.name, imageUrl: null }) && (
        <div className="riso-itemform-stock">
          <button type="button" className="link-btn subtle" onClick={() => onChange(null)}>
            {t("inventory.showStock")}
          </button>
        </div>
      )}
    </div>
  );
}

export function InventoryItemForm({
  mode,
  item,
  sections,
  defaultLocation = "fridge",
  recipes = [],
  isStaple,
  isStapleFor,
  onToggleStaple,
  onAdd,
  onSave,
  onDelete,
  onConsume,
  onFindRecipes,
  onToast,
  onClose,
  isPhone,
}) {
  const edit = mode === "edit";
  const labelFor = Object.fromEntries(sections.map((s) => [s.id, s.label]));
  const startLoc = edit ? item.location : sections.some((s) => s.id === defaultLocation) ? defaultLocation : sections[0]?.id || "fridge";
  const savedDate = edit && item.expiresAt ? String(item.expiresAt).slice(0, 10) : "";
  // A saved date that isn't USDA's own figure for this food is the user's date.
  const usdaDate = edit && item.locations?.[item.location]?.expiresAt ? String(item.locations[item.location].expiresAt).slice(0, 10) : null;

  const [name, setName] = useState(edit ? item.name : "");
  const [qtyText, setQtyText] = useState(edit ? formatFractionQuantity(item.quantity ?? 0) : "1");
  const [qtyDraft, setQtyDraft] = useState(null);
  const [unit, setUnit] = useState(edit ? item.unit || "" : "");
  const [loc, setLoc] = useState(startLoc);
  const [locTouched, setLocTouched] = useState(false);
  const [opts, setOpts] = useState(edit ? item.locations || {} : {});
  const [category, setCategory] = useState(edit ? item.category : "Other");
  const [expiresAt, setExpiresAt] = useState(edit ? savedDate : dateFromDays(startDays(null, startLoc).days));
  const [custom, setCustom] = useState(edit ? !!savedDate && savedDate !== usdaDate : false);
  const [staple, setStaple] = useState(edit ? !!isStaple : false);
  const [photo, setPhoto] = useState(edit ? item.imageUrl ?? null : null);
  const [recent, setRecent] = useState([]);
  const [added, setAdded] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);
  const qtyTouched = useRef(false);
  const stapleTouched = useRef(false);
  // What the lookup needs when it comes back a moment later.
  const live = useRef({});
  live.current = { loc, locTouched, custom };

  // Recent foods (add mode).
  useEffect(() => {
    if (edit) return undefined;
    let cancelled = false;
    api
      .listRecentPantryItems()
      .then((rows) => !cancelled && setRecent(rows))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [edit]);

  // Look up USDA's shelf life for every shelf as the name settles (add mode): the
  // shelf cards show it, the shelf and the use-by date follow it until you choose
  // your own.
  useEffect(() => {
    if (edit) return undefined;
    const q = name.trim();
    let cancelled = false;
    const timer = setTimeout(
      () => {
        if (!q) {
          setOpts({});
          if (!live.current.custom) setExpiresAt(dateFromDays(startDays(null, live.current.loc).days));
          return;
        }
        api
          .suggestPantryExpiration(q)
          .then((res) => {
            if (cancelled) return;
            const locations = res.locations || {};
            setOpts(locations);
            if (res.category) setCategory(res.category);
            const cur = live.current;
            let nextLoc = cur.loc;
            if (!cur.locTouched && res.location && sections.some((s) => s.id === res.location)) {
              nextLoc = res.location;
              setLoc(nextLoc);
            }
            if (!cur.custom) setExpiresAt(dateFromDays(startDays(locations[nextLoc], nextLoc).days));
          })
          .catch(() => {});
      },
      q ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, edit]);

  // Already a pantry staple, in add mode.
  useEffect(() => {
    if (edit || stapleTouched.current || !isStapleFor) return;
    setStaple(isStapleFor(name));
  }, [name, edit, isStapleFor]);

  // Escape closes the desktop modal (the phone sheet does its own).
  useEffect(() => {
    if (isPhone) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPhone, onClose]);

  function chooseLocation(id) {
    setLoc(id);
    setLocTouched(true);
    if (!custom) setExpiresAt(dateFromDays(startDays(opts[id], id).days));
  }

  function useRecent(row, fillName) {
    if (fillName) setName(row.name);
    if (row.quantity != null) {
      setQtyText(formatFractionQuantity(row.quantity));
      setUnit(row.unit || "");
      qtyTouched.current = true;
    }
    if (row.location && sections.some((s) => s.id === row.location)) {
      setLoc(row.location);
      setLocTouched(true);
    }
    nameRef.current?.focus();
  }

  function changeName(value) {
    setName(value);
    const same = !edit && !qtyTouched.current && recent.find((r) => r.name.toLowerCase() === value.trim().toLowerCase());
    if (same) useRecent(same, false);
  }

  function setUseBy(dateStr) {
    setExpiresAt(dateStr);
    setCustom(true);
  }

  function stepQty(dir) {
    qtyTouched.current = true;
    setQtyText(stepQuantity(qtyDraft ?? qtyText, unit, dir));
    setQtyDraft(null);
  }

  function commitQty() {
    if (qtyDraft == null) return;
    qtyTouched.current = true;
    setQtyText(commitQuantity(qtyDraft, qtyText));
    setQtyDraft(null);
  }

  const days = daysFromDate(expiresAt);
  const tag = expiryTag(days);
  const line = lineForDays(days);
  const here = startDays(opts[loc], loc);
  const kind = useByKind({ days, custom, usda: here.usda });
  const trimmed = name.trim();
  const qtyNum = parseQuantityInput(qtyText);
  const unitText = unit ? unitLabel(unit, qtyNum) : "";
  const place = t(`inventory.form.place.${loc}`) === `inventory.form.place.${loc}` ? labelFor[loc] || "" : t(`inventory.form.place.${loc}`);
  const dateText = expiresAt
    ? formatDate(new Date(`${expiresAt}T12:00:00`), { month: "short", day: "numeric", year: Math.abs(days ?? 0) > 300 ? "numeric" : undefined })
    : "";
  const noteVars = { date: dateText, item: trimmed || t("inventory.form.thisItem"), place, range: opts[loc] ? rangeText(opts[loc]) : "" };
  // Nothing typed yet: no claim about a food, just the date.
  const bare = !edit && !trimmed && (kind === "usda" || kind === "rough");
  const note = bare ? t("inventory.form.noteBare", noteVars) : {
    none: t("inventory.form.noteNone"),
    expired: t("inventory.form.noteExpired", noteVars),
    custom: t("inventory.form.noteCustom", noteVars),
    usda: t("inventory.form.noteUsda", noteVars),
    rough: t("inventory.form.noteRough", noteVars),
  }[kind];
  const tagText = {
    none: t("inventory.form.tagNone"),
    expired: t("inventory.form.tagExpired"),
    tomorrow: t("inventory.form.tagTomorrow"),
    days: t("inventory.form.tagDays", { count: tag.count }),
    months: t("inventory.form.tagMonths", { count: tag.count }),
  }[tag.kind];

  const cards = edit ? sections.filter((s) => opts[s.id] || s.id === item.location) : sections;
  const canFreeze = edit && !!opts.freezer && item.location !== "freezer";
  const recipeCount = edit
    ? recipes.filter((r) => !r.isPlaceholder && r.ingredients?.some((i) => i.name?.toLowerCase().includes(item.name.toLowerCase()))).length
    : 0;

  async function submitAdd(keepOpen) {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await onAdd(buildAddPayload({ name, qtyText, unit, location: loc, category, expiresAt, photo }));
      const core = trimmed.toLowerCase();
      // The form carries on only once the star is saved, so an item opened
      // right after shows it. The item is in by now: a star that fails says so
      // rather than reporting the add as failed (adding again would double it).
      if (staple !== !!isStapleFor?.(core)) {
        try {
          await onToggleStaple({ core });
        } catch {
          onToast(t("inventory.form.stapleFailed", { name: trimmed }));
        }
      }
      setAdded((rows) => [...rows, { id: created?.id, name: trimmed, qtyText, unit, loc }]);
      onToast(t("inventory.form.toastAdded", { name: trimmed, location: labelFor[loc] || "" }));
      if (keepOpen) {
        setName("");
        setQtyText("1");
        setQtyDraft(null);
        setUnit("");
        setPhoto(null);
        setCategory("Other");
        setOpts({});
        setCustom(false);
        qtyTouched.current = false;
        stapleTouched.current = false;
        setExpiresAt(dateFromDays(startDays(null, loc).days));
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || t("inventory.form.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function undo(row) {
    setAdded((rows) => rows.filter((r) => r !== row));
    if (row.id) {
      try {
        await onDelete(row.id);
      } catch {
        /* already gone */
      }
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const patch = buildEditPatch(item, { name, qtyText, unit, location: loc, expiresAt, photo });
      if (Object.keys(patch).length > 0) await onSave(item.id, patch);
      // "Changes saved" and closing wait for the star too, so reopening the
      // item shows it as saved. A failure keeps the form open with its message.
      if (staple !== !!isStaple) await onToggleStaple(item);
      onToast(t("inventory.form.toastSaved"));
      onClose();
    } catch (err) {
      setError(err.message || t("inventory.form.saveFailed"));
      setBusy(false);
    }
  }

  async function finish(action) {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "freeze") {
        await onSave(item.id, { location: "freezer", expiresAt: opts.freezer.expiresAt });
        onToast(t("inventory.form.toastFrozen", { name: item.name }));
      } else if (action === "remove") {
        await onDelete(item.id);
        onToast(t("inventory.form.toastRemoved", { name: item.name }));
      } else {
        await onConsume([item.id], action);
        onToast(t(action === "consumed" ? "inventory.form.toastUsedUp" : "inventory.form.toastTossed", { name: item.name }));
      }
      onClose();
    } catch (err) {
      setError(err.message || t("inventory.form.saveFailed"));
      setBusy(false);
    }
  }

  const quick = edit ? EDIT_QUICK : ADD_QUICK;
  const previewItem = { name: trimmed, category, imageUrl: photo };

  const body = (
    <div className="riso-itemform">
      <div className="riso-itemform-header">
        {edit ? (
          <>
            <input
              className="riso-itemform-name"
              value={name}
              aria-label={t("inventory.itemName")}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="riso-itemform-category">{categoryLabel(category)}</span>
          </>
        ) : (
          <>
            <h2 className="riso-itemform-title">
              {t("inventory.form.addTitleLead")} <span className="accent">{t("inventory.form.addTitleAccent")}</span>
            </h2>
            <span className="riso-itemform-hint">{t("inventory.form.addHint")}</span>
          </>
        )}
      </div>

      <div className="riso-itemform-cols">
        <div className="riso-itemform-main">
          {!edit && (
            <div className="riso-itemform-block">
              <Step n={1}>{t("inventory.form.stepName")}</Step>
              <input
                ref={nameRef}
                autoFocus
                className="riso-itemform-nameinput"
                type="text"
                value={name}
                placeholder={t("inventory.namePlaceholder")}
                aria-label={t("inventory.itemName")}
                onChange={(e) => changeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitAdd(true);
                  }
                }}
              />
              {!trimmed && recent.length > 0 && (
                <div className="riso-itemform-recent" role="group" aria-label={t("inventory.form.recentAria")}>
                  <span className="riso-itemform-recent-label">{t("inventory.form.recent")}</span>
                  {recent.map((r) => (
                    <button key={r.name} type="button" className="riso-itemform-chip small" onClick={() => useRecent(r, true)}>
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="riso-itemform-block">
            <Step n={edit ? 1 : 2}>{edit ? t("inventory.form.stepLeft") : t("inventory.form.stepHowMuch")}</Step>
            <div className="riso-itemform-qty">
              <button type="button" className="riso-itemform-round" aria-label={t("inventory.form.less")} onClick={() => stepQty(-1)}>
                −
              </button>
              <input
                className="riso-itemform-qtyinput"
                type="text"
                inputMode="decimal"
                aria-label={t("inventory.quantity")}
                value={qtyDraft ?? qtyText}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={commitQty}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setQtyDraft(null);
                  }
                }}
              />
              <button type="button" className="riso-itemform-round" aria-label={t("inventory.form.more")} onClick={() => stepQty(1)}>
                +
              </button>
              <UnitSelect
                className="riso-itemform-unit"
                value={unit}
                onChange={(u) => setUnit(u)}
                emptyLabel={t("inventory.noMeasure")}
                aria-label={t("inventory.measure")}
              />
            </div>
            <div className="riso-itemform-quick">
              {quick.map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  className="riso-itemform-chip small"
                  aria-label={t("inventory.setTo", { value: label })}
                  onClick={() => {
                    qtyTouched.current = true;
                    setQtyText(formatFractionQuantity(v));
                    setQtyDraft(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="riso-itemform-block">
            <Step n={edit ? 2 : 3}>
              {edit ? t("inventory.form.stepStored") : t("inventory.form.stepWhere")} · {t("same.usda")}
            </Step>
            <div className={`riso-itemform-locs${edit ? " wide" : ""}`}>
              {cards.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`riso-itemform-loc${loc === s.id ? " on" : ""}`}
                  aria-pressed={loc === s.id}
                  onClick={() => chooseLocation(s.id)}
                >
                  <span className="riso-itemform-loc-name">{s.label}</span>
                  {opts[s.id] && <span className="riso-itemform-loc-range">{rangeText(opts[s.id])}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="riso-itemform-block">
            <Step n={edit ? 3 : 4}>{t("inventory.form.stepUseBy")}</Step>
            <div className="riso-itemform-useby">
              {USE_BY_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`riso-itemform-chip${days === c.days && expiresAt ? " on" : ""}`}
                  aria-pressed={days === c.days && !!expiresAt}
                  onClick={() => setUseBy(dateFromDays(c.days))}
                >
                  {t(`inventory.form.useByChips.${c.id}`)}
                </button>
              ))}
              <button
                type="button"
                className={`riso-itemform-chip${!expiresAt ? " on" : ""}`}
                aria-pressed={!expiresAt}
                onClick={() => setUseBy("")}
              >
                {t("inventory.form.noDateChip")}
              </button>
              <label className="riso-itemform-chip dashed">
                {t("inventory.pickDate")}
                <input
                  type="date"
                  aria-label={t("inventory.useByDate")}
                  value={expiresAt}
                  onChange={(e) => setUseBy(e.target.value)}
                />
              </label>
            </div>
            <p className="riso-itemform-note">{note}</p>
          </div>

          {edit && (
            <div className="riso-itemform-block">
              <div className="riso-itemform-label">{t("inventory.form.doneWithIt")}</div>
              <div className="riso-itemform-done">
                <button type="button" className="riso-itemform-chip big used" onClick={() => finish("consumed")} disabled={busy}>
                  {t("inventory.usedUp")}
                </button>
                <button type="button" className="riso-itemform-chip big tossed" onClick={() => finish("wasted")} disabled={busy}>
                  {t("inventory.tossed")}
                </button>
                {canFreeze && (
                  <button type="button" className="riso-itemform-chip big freeze" onClick={() => finish("freeze")} disabled={busy}>
                    {t("inventory.freeze")}
                  </button>
                )}
              </div>
              {isPhone && (
                <button type="button" className="riso-itemform-remove" onClick={() => finish("remove")} disabled={busy}>
                  {t("inventory.form.remove")}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="riso-itemform-side">
          <div>
            <div className="riso-itemform-label">{t("inventory.form.previewLabel", { location: labelFor[loc] || "" })}</div>
            <div className="inv-card active riso-itemform-card" aria-hidden="true">
              {line && !line.expired && (
                <span className="inv-card-line">
                  <span className={`inv-card-line-fill ${line.color}`} style={{ height: line.height }} />
                </span>
              )}
              <div className="inv-card-body">
                {trimmed || photo ? <ItemPhoto item={previewItem} /> : <span className="inv-card-photo placeholder stripes">{t("inventory.form.photo")}</span>}
                <div className="inv-card-main">
                  <span className={`inv-card-name${trimmed ? "" : " empty"}`}>{trimmed || t("inventory.form.itemNamePlaceholder")}</span>
                </div>
                <span className="inv-card-qty">
                  <span className="inv-card-qty-num">{qtyText}</span>
                  {unitText && <span className="inv-card-qty-unit"> {unitText}</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="riso-itemform-tagrow">
            <span className={`riso-itemform-tag ${tag.tone}`}>{tagText}</span>
            <span className="riso-itemform-sorted">{days == null ? t("inventory.form.lastOnShelf") : t("inventory.form.sortedBy")}</span>
          </div>

          <button
            type="button"
            className={`riso-itemform-staple${staple ? " on" : ""}`}
            aria-pressed={staple}
            onClick={() => {
              stapleTouched.current = true;
              setStaple((v) => !v);
            }}
          >
            {staple ? t("inventory.staple") : t("inventory.markStaple")}
          </button>

          <PhotoPanel item={{ name: trimmed }} photo={photo} onChange={setPhoto} optional={!edit} />

          {edit && (
            <div className="riso-itemform-recipes">
              {t("home.recipesUse", { count: recipeCount, name: item.name })}{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onClose();
                  onFindRecipes(item.name);
                }}
              >
                {t("home.seeThem")}
              </button>
            </div>
          )}

          {!edit && added.length > 0 && (
            <div className="riso-itemform-tray">
              <div className="riso-itemform-label">
                {t("inventory.form.addedThisTime")} · {added.length}
              </div>
              {added.map((row, i) => {
                const q = parseQuantityInput(row.qtyText);
                return (
                  <div key={row.id || i} className="riso-itemform-tray-row">
                    <span className="riso-itemform-tray-check" aria-hidden="true">✓</span>
                    <span className="riso-itemform-tray-name">{row.name}</span>
                    <span className="riso-itemform-tray-meta">
                      {row.qtyText}
                      {row.unit ? ` ${unitLabel(row.unit, q)}` : ""} · {labelFor[row.loc] || ""}
                    </span>
                    <button type="button" className="link-btn subtle" onClick={() => undo(row)}>
                      {t("inventory.form.undo")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="riso-itemform-error" role="alert">{error}</div>}

      <div className="riso-itemform-footer">
        {edit ? (
          !isPhone && (
            <button type="button" className="riso-itemform-remove" onClick={() => finish("remove")} disabled={busy}>
              {t("inventory.form.remove")}
            </button>
          )
        ) : (
          <button type="button" className="riso-itemform-btn quiet" onClick={onClose}>
            {added.length > 0 ? t("inventory.done") : t("common.cancel")}
          </button>
        )}
        <span className="riso-itemform-spacer" />
        {edit ? (
          <>
            <button type="button" className="riso-itemform-btn quiet" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="button" className="riso-itemform-btn primary" onClick={save} disabled={busy || !trimmed}>
              {t("inventory.form.saveChanges")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="riso-itemform-btn" onClick={() => submitAdd(true)} disabled={busy || !trimmed}>
              {t("inventory.form.addAndNext")}
            </button>
            <button type="button" className="riso-itemform-btn primary" onClick={() => submitAdd(false)} disabled={busy || !trimmed}>
              {t("inventory.form.addToInventory")}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const label = edit ? t("inventory.editName", { name: item.name }) : t("inventory.addItemTitle");
  if (isPhone) {
    return (
      <BottomSheet label={label} onClose={onClose}>
        {body}
      </BottomSheet>
    );
  }
  return (
    <div className="riso-itemform-overlay" onClick={onClose}>
      <div className="riso-itemform-modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="riso-itemform-close" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
        {body}
      </div>
    </div>
  );
}
