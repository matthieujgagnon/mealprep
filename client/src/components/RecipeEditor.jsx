import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api.js";
import { UnitSelect } from "./UnitSelect.jsx";
import { RECIPE_SLOTS, formatRecipeTime, slotHint } from "../lib/mealSlots.js";
import { stepHeadingText, stepIsHeading, stepTimer } from "../lib/steps.js";
import { estimateFridgeLifeDays } from "../lib/fridgeLife.js";
import { buildCombinedHave, recipeHaveStats } from "../lib/onHand.js";
import { core } from "../lib/similarRecipes.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { droppedImageUrl, isImageFile, uploadPhoto } from "../lib/photoUpload.js";
import {
  emptyIngredient,
  emptyIngredientSection,
  emptyStep,
  emptyStepHeading,
  ingredientsToRows,
  instructionsToSteps,
  makeLocalId,
  rowsToIngredients,
  stepsToInstructions,
} from "../lib/recipeForm.js";
import { t } from "../i18n/index.js";

// A textarea that grows to fit what's typed, so long notes and steps show
// in full instead of scrolling inside a small box.
function AutoTextarea({ value, className, inputRef, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (inputRef) inputRef(el);
      }}
      rows={1}
      value={value}
      className={className}
      {...rest}
    />
  );
}

// One sortable row; only the ⠿ handle starts a drag, so typing in the
// row's fields never fights the gesture.
function SortableRow({ id, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className}${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="re-handle"
        aria-label={t("editor.dragToReorder")}
        title={t("editor.dragToReorder")}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

// A photo tile: the whole tile drags to reorder; a click makes it the cover.
function SortablePhoto({ photo, isCover, onCover, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const [broken, setBroken] = useState(false);
  return (
    <div
      ref={setNodeRef}
      className={`re-photo${isCover ? " cover" : ""}${isDragging ? " dragging" : ""}`}
      data-url={photo.url}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={isCover ? t("editor.coverPhoto") : t("editor.makeCover")}
      onClick={onCover}
    >
      {broken ? (
        <span className="re-photo-broken">{t("editor.photoBroken")}</span>
      ) : (
        <img src={photo.url} alt="" draggable={false} onError={() => setBroken(true)} />
      )}
      {isCover && <span className="re-photo-cover">{t("editor.cover")}</span>}
      <button
        type="button"
        className="re-photo-remove"
        aria-label={t("editor.removePhoto")}
        title={t("editor.removePhoto")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    </div>
  );
}

function Stepper({ label, value, unit, help, step, accent, onChange }) {
  const n = Number(value) || 0;
  return (
    <div className="re-stepper">
      <span className="re-label">{label}</span>
      <div className="re-stepper-pill">
        <button
          type="button"
          aria-label={t("editor.less", { what: label.toLowerCase() })}
          onClick={() => onChange(String(Math.max(0, n - step)))}
        >
          −
        </button>
        <label className="re-stepper-value">
          <input
            type="text"
            inputMode="numeric"
            aria-label={label}
            value={value}
            placeholder="0"
            className={accent ? "accent" : ""}
            onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          />
          {unit && <span className="re-stepper-unit">{unit}</span>}
        </label>
        <button type="button" aria-label={t("editor.more", { what: label.toLowerCase() })} onClick={() => onChange(String(n + step))}>
          +
        </button>
      </div>
      <span className="re-help">{help}</span>
    </div>
  );
}

function initialState(recipe) {
  const urls = recipe?.photos?.length ? recipe.photos : recipe?.photoUrl ? [recipe.photoUrl] : [];
  const photos = [...new Set(urls)].map((url) => ({ id: makeLocalId(), url }));
  const coverIdx = recipe?.photoUrl ? photos.findIndex((p) => p.url === recipe.photoUrl) : 0;
  return {
    title: recipe?.title || "",
    sourceUrl: recipe?.sourceUrl || "",
    mealSlot: recipe?.mealSlot || null,
    photos,
    coverId: photos[Math.max(0, coverIdx)]?.id || null,
    servings: String(recipe?.baseServings || 4),
    prep: recipe?.prepTimeMinutes != null ? String(recipe.prepTimeMinutes) : "",
    cook: recipe?.cookTimeMinutes != null ? String(recipe.cookTimeMinutes) : "",
    fridge: recipe?.fridgeLifeDays != null ? String(recipe.fridgeLifeDays) : "",
    rows: ingredientsToRows(recipe?.ingredients),
    steps: instructionsToSteps(recipe?.instructions),
    notes: recipe?.notes || "",
  };
}

function toPayload(s) {
  const photos = s.photos.map((p) => p.url);
  const cover = s.photos.find((p) => p.id === s.coverId)?.url || photos[0] || null;
  const num = (v) => (v === "" ? null : Number(v));
  return {
    title: s.title.trim(),
    sourceUrl: s.sourceUrl.trim() || null,
    mealSlot: s.mealSlot,
    photoUrl: cover,
    photos,
    baseServings: Number(s.servings) || 4,
    prepTimeMinutes: num(s.prep),
    cookTimeMinutes: num(s.cook),
    fridgeLifeDays: num(s.fridge),
    ingredients: rowsToIngredients(s.rows),
    instructions: stepsToInstructions(s.steps),
    notes: s.notes.trim() || null,
  };
}

export function RecipeEditor({ recipe, pantryInventory = [], customStaples = [], onSaved, onCancel, onDirtyChange }) {
  const isNew = !recipe;
  const [state, setState] = useState(() => initialState(recipe));
  const initialPayload = useRef(JSON.stringify(toPayload(initialState(recipe))));
  const [fridgeTouched, setFridgeTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [reimport, setReimport] = useState({ busy: false, message: null });
  const [uploading, setUploading] = useState(0);
  const [photoMessage, setPhotoMessage] = useState(null);
  const [zoneOver, setZoneOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const fileInputRef = useRef(null);
  const stepFileRef = useRef(null);
  const stepPhotoTarget = useRef(null);

  const latest = useRef(state);
  latest.current = state;
  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));

  const payload = toPayload(state);
  const dirty = JSON.stringify(payload) !== initialPayload.current;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // New recipes get a fridge-life guess from the ingredients until the
  // field is changed by hand.
  const ingredientNames = state.rows.filter((r) => !r.isSection && r.name.trim()).map((r) => r.name);
  const namesKey = ingredientNames.join("|");
  useEffect(() => {
    if (fridgeTouched || ingredientNames.length === 0) return;
    set({ fridge: String(estimateFridgeLifeDays(ingredientNames)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, fridgeTouched]);

  const handleSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const photoSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  function reorder(key) {
    return ({ active, over }) => {
      if (!over || active.id === over.id) return;
      set((s) => {
        const list = s[key];
        const idKey = key === "photos" ? "id" : "_id";
        const from = list.findIndex((x) => x[idKey] === active.id);
        const to = list.findIndex((x) => x[idKey] === over.id);
        if (from === -1 || to === -1) return {};
        return { [key]: arrayMove(list, from, to) };
      });
    };
  }

  // --- photos ---------------------------------------------------------
  function addPhotoUrls(urls) {
    set((s) => {
      const have = new Set(s.photos.map((p) => p.url));
      const added = urls.filter((u) => !have.has(u)).map((url) => ({ id: makeLocalId(), url }));
      const photos = [...s.photos, ...added];
      return { photos, coverId: s.coverId || photos[0]?.id || null };
    });
  }

  async function addPhotoFiles(files) {
    const images = [...files].filter(isImageFile);
    if (images.length === 0) {
      setPhotoMessage(t("editor.onlyImages"));
      return;
    }
    setPhotoMessage(null);
    setUploading((n) => n + images.length);
    for (const file of images) {
      try {
        addPhotoUrls([await uploadPhoto(file)]);
      } catch (err) {
        setPhotoMessage(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function handleZoneDrop(e) {
    e.preventDefault();
    setZoneOver(false);
    if (e.dataTransfer.files?.length) {
      addPhotoFiles(e.dataTransfer.files);
      return;
    }
    const url = droppedImageUrl(e.dataTransfer);
    if (url) addPhotoUrls([url]);
    else setPhotoMessage(t("editor.notAPicture"));
  }

  function removePhoto(id) {
    set((s) => {
      const photos = s.photos.filter((p) => p.id !== id);
      return { photos, coverId: s.coverId === id ? photos[0]?.id || null : s.coverId };
    });
  }

  // --- ingredients ----------------------------------------------------
  function updateRow(id, field, value) {
    set((s) => ({ rows: s.rows.map((r) => (r._id === id ? { ...r, [field]: value } : r)) }));
  }

  function removeRow(id) {
    set((s) => {
      const rows = s.rows.filter((r) => r._id !== id);
      return { rows: rows.length ? rows : [emptyIngredient()] };
    });
  }

  async function addPastedList() {
    if (!pasteText.trim()) return;
    setPasteBusy(true);
    try {
      const { ingredients } = await api.parseIngredients(pasteText);
      const added = ingredientsToRows(ingredients);
      set((s) => {
        const kept = s.rows.filter((r) => r.isSection || r.name.trim() || r.quantity || r.notes);
        return { rows: [...kept, ...added] };
      });
      setPasteText("");
      setPasteOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setPasteBusy(false);
    }
  }

  // --- steps ----------------------------------------------------------
  function updateStep(id, patch) {
    set((s) => ({ steps: s.steps.map((st) => (st._id === id ? { ...st, ...patch } : st)) }));
  }

  // Several lines typed or pasted into one step become separate steps (a
  // short line ending in ":" becomes a heading); Enter starts a new step.
  const stepInputs = useRef(new Map());
  const focusStepId = useRef(null);
  useEffect(() => {
    if (!focusStepId.current) return;
    const el = stepInputs.current.get(focusStepId.current);
    focusStepId.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  function changeStepText(id, value) {
    if (!value.includes("\n")) {
      updateStep(id, { text: value });
      return;
    }
    const clean = (line) => line.trim().replace(/^[*\-•]\s*/, "").trim();
    const [first, ...rest] = value.split(/\r?\n/);
    const added = rest
      .map(clean)
      .filter((line, i) => line || i === rest.length - 1)
      .map((line) =>
        stepIsHeading(line)
          ? { _id: makeLocalId(), head: true, text: stepHeadingText(line) }
          : { _id: makeLocalId(), text: line, image: null }
      );
    set((s) => {
      const at = s.steps.findIndex((st) => st._id === id);
      if (at === -1) return {};
      const steps = [...s.steps];
      steps.splice(at, 1, { ...steps[at], text: first.trim() ? clean(first) : first }, ...added);
      return { steps };
    });
    const last = added[added.length - 1];
    if (last && !last.head) focusStepId.current = last._id;
  }

  function removeStep(id) {
    set((s) => {
      const steps = s.steps.filter((st) => st._id !== id);
      return { steps: steps.length ? steps : [emptyStep()] };
    });
  }

  async function setStepPhotoFromFile(id, file) {
    if (!isImageFile(file)) return;
    try {
      updateStep(id, { image: await uploadPhoto(file) });
    } catch (err) {
      setError(err.message);
    }
  }

  function handleStepDrop(id, e) {
    const file = e.dataTransfer.files?.[0];
    const url = file ? null : droppedImageUrl(e.dataTransfer);
    if (!file && !url) return; // a plain text drop: let the textarea have it
    e.preventDefault();
    if (file) setStepPhotoFromFile(id, file);
    else updateStep(id, { image: url });
  }

  // --- re-import ------------------------------------------------------
  // Fills only what's still empty; anything already typed stays.
  async function handleReimport() {
    const url = state.sourceUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setReimport({ busy: false, message: t("editor.linkFirst") });
      return;
    }
    setReimport({ busy: true, message: null });
    try {
      const scraped = await api.scrapeRecipe(url);
      const s = latest.current;
      const patch = {};
      const filled = [];
      if (!s.title.trim() && scraped.title) {
        patch.title = scraped.title;
        filled.push(t("editor.filledFields.title"));
      }
      if (s.photos.length === 0 && scraped.photos?.length) {
        const photos = scraped.photos.map((u) => ({ id: makeLocalId(), url: u }));
        patch.photos = photos;
        patch.coverId = photos[Math.max(0, scraped.photos.indexOf(scraped.photoUrl))].id;
        filled.push(t("editor.filledFields.photos"));
      }
      if (!s.prep && scraped.prepTimeMinutes) {
        patch.prep = String(scraped.prepTimeMinutes);
        filled.push(t("editor.filledFields.prep"));
      }
      if (!s.cook && scraped.cookTimeMinutes) {
        patch.cook = String(scraped.cookTimeMinutes);
        filled.push(t("editor.filledFields.cook"));
      }
      if (!s.rows.some((r) => !r.isSection && r.name.trim()) && scraped.ingredients?.length) {
        patch.rows = ingredientsToRows(scraped.ingredients);
        filled.push(t("editor.filledFields.ingredients"));
        // Servings go with the ingredient amounts they were written for.
        if (scraped.baseServings) patch.servings = String(scraped.baseServings);
      }
      if (!s.steps.some((st) => st.text.trim()) && scraped.instructions?.length) {
        patch.steps = instructionsToSteps(scraped.instructions);
        filled.push(t("editor.filledFields.steps"));
      }
      if (!s.fridge && scraped.fridgeLifeDays) patch.fridge = String(scraped.fridgeLifeDays);
      set(patch);
      setReimport({
        busy: false,
        message: filled.length
          ? t("editor.filled", { fields: filled.join(", ") })
          : t("editor.nothingEmpty"),
      });
    } catch (err) {
      setReimport({ busy: false, message: err.message });
    }
  }

  async function handleSave() {
    if (!payload.title) {
      setError(t("editor.titleFirst"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = isNew ? await api.createRecipe(payload) : await api.updateRecipe(recipe.id, payload);
      initialPayload.current = JSON.stringify(payload);
      onDirtyChange?.(false);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm(t("editor.leaveUnsaved"))) return;
    onDirtyChange?.(false);
    onCancel();
  }

  // --- preview --------------------------------------------------------
  const total = (Number(state.prep) || 0) + (Number(state.cook) || 0);
  const cover = state.photos.find((p) => p.id === state.coverId) || state.photos[0];
  const haveCores = useMemo(
    () => new Set(buildCombinedHave(pantryInventory, customStaples).map((n) => core(n)).filter(Boolean)),
    [pantryInventory, customStaples]
  );
  const stats = recipeHaveStats({ ingredients: payload.ingredients }, haveCores);
  const havePct = stats.totalCount ? Math.round((stats.matchedCount / stats.totalCount) * 100) : 0;
  const stepCount = payload.instructions.filter((st) => typeof st !== "string" || !st.endsWith(":")).length;
  const checks = [
    { id: "title", ok: !!payload.title, label: t("editor.checks.title") },
    { id: "time", ok: total > 0, label: t("editor.checks.time"), hint: t("editor.checks.timeHint") },
    { id: "slot", ok: !!state.mealSlot, label: t("editor.checks.slot"), hint: t("editor.checks.slotHint") },
    { id: "photo", ok: state.photos.length > 0, label: t("editor.checks.photo") },
    { id: "body", ok: payload.ingredients.length > 0 && stepCount > 0, label: t("editor.checks.body") },
  ];

  let stepNumber = 0;

  return (
    <div className="riso-theme re-page" data-theme="light">
      <div className="re-heading">
        <button type="button" className="riso-eyebrow re-back" onClick={handleCancel}>
          {t("editor.back", { mode: isNew ? t("editor.modeNew") : t("editor.modeEditing") })}
        </button>
        <h1 className="re-title">
          {isNew ? t("editor.titleNew") : t("editor.titleEdit")} <span className="accent">{t("editor.titleAccent")}</span>
        </h1>
      </div>

      <div className="re-layout">
        <div className="re-form">
          {/* 1. The basics */}
          <section className="re-section">
            <div className="re-section-head">
              <span className="re-num">1</span>
              <h2>{t("editor.basics")}</h2>
            </div>
            <label className="re-field">
              <span className="re-label">{t("editor.titleLabel")}</span>
              <input
                className="re-title-input"
                value={state.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder={t("editor.titlePlaceholder")}
              />
            </label>
            <div className="re-field">
              <span className="re-label">{t("editor.linkLabel")}</span>
              <div className="re-link-row">
                <input
                  className="re-pill-input"
                  type="url"
                  aria-label={t("editor.linkAria")}
                  value={state.sourceUrl}
                  onChange={(e) => set({ sourceUrl: e.target.value })}
                  placeholder="https://…"
                />
                <button type="button" className="re-btn" onClick={handleReimport} disabled={reimport.busy}>
                  {reimport.busy ? t("editor.reading") : t("editor.reimport")}
                </button>
              </div>
              <span className="re-help">
                {reimport.message || t("editor.linkHelp")}
              </span>
            </div>
            <div className="re-field">
              <span className="re-label">{t("editor.slotLabel")}</span>
              <div className="re-slots" role="radiogroup" aria-label={t("editor.slotAria")}>
                {RECIPE_SLOTS.map((slot) => {
                  const on = state.mealSlot === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`re-slot${on ? " on" : ""}`}
                      onClick={() => set({ mealSlot: on ? null : slot.id })}
                    >
                      {on ? "✓ " : ""}
                      {slot.label}
                    </button>
                  );
                })}
              </div>
              <span className="re-help">{slotHint(state.mealSlot)}</span>
            </div>
          </section>

          {/* 2. Photos */}
          <section className="re-section">
            <div className="re-section-head spread">
              <div className="re-section-title">
                <span className="re-num">2</span>
                <h2>{t("editor.photos")}</h2>
              </div>
              <span className="re-count">{t("editor.photoCount", { count: state.photos.length })}</span>
            </div>
            <DndContext sensors={photoSensors} collisionDetection={closestCenter} onDragEnd={reorder("photos")}>
              <SortableContext items={state.photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="re-photos">
                  {state.photos.map((photo) => (
                    <SortablePhoto
                      key={photo.id}
                      photo={photo}
                      isCover={photo.id === (cover?.id || null)}
                      onCover={() => set({ coverId: photo.id })}
                      onRemove={() => removePhoto(photo.id)}
                    />
                  ))}
                  {Array.from({ length: uploading }, (_, i) => (
                    <div key={`up-${i}`} className="re-photo uploading">
                      <span>{t("editor.adding")}</span>
                    </div>
                  ))}
                  <div
                    className={`re-photo-zone${zoneOver ? " over" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setZoneOver(true);
                    }}
                    onDragLeave={() => setZoneOver(false)}
                    onDrop={handleZoneDrop}
                  >
                    <button type="button" className="re-zone-title" onClick={() => fileInputRef.current?.click()}>
                      {t("editor.dropHere")}
                    </button>
                    <span className="re-zone-or">{t("editor.or")}</span>
                    <input
                      className="re-zone-url"
                      aria-label={t("editor.photoUrl")}
                      placeholder={t("editor.photoUrlPlaceholder")}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const url = e.currentTarget.value.trim();
                        if (/^https?:\/\/\S+$/i.test(url)) {
                          addPhotoUrls([url]);
                          e.currentTarget.value = "";
                          setPhotoMessage(null);
                        } else {
                          setPhotoMessage(t("editor.httpsOnly"));
                        }
                      }}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      hidden
                      aria-label={t("editor.choosePhotos")}
                      onChange={(e) => {
                        if (e.target.files?.length) addPhotoFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </SortableContext>
            </DndContext>
            <span className="re-help">
              {photoMessage || t("editor.photosHelp")}
            </span>
          </section>

          {/* 3. Time and servings */}
          <section className="re-section">
            <div className="re-section-head spread">
              <div className="re-section-title">
                <span className="re-num">3</span>
                <h2>{t("editor.timeServings")}</h2>
              </div>
              <div className="re-total">
                <span>{t("editor.total")}</span>
                <strong>{total ? formatRecipeTime(total) : t("editor.notSet")}</strong>
              </div>
            </div>
            <div className="re-steppers">
              <Stepper
                label={t("editor.servings")}
                value={state.servings}
                step={1}
                help={t("editor.servingsHelp")}
                onChange={(v) => set({ servings: v })}
              />
              <Stepper
                label={t("editor.prep")}
                unit={t("editor.minUnit")}
                accent
                value={state.prep}
                step={5}
                help={t("editor.prepHelp")}
                onChange={(v) => set({ prep: v })}
              />
              <Stepper
                label={t("editor.cook")}
                unit={t("editor.minUnit")}
                accent
                value={state.cook}
                step={5}
                help={t("editor.cookHelp")}
                onChange={(v) => set({ cook: v })}
              />
              <Stepper
                label={t("editor.fridge")}
                unit={t("editor.daysUnit")}
                value={state.fridge}
                step={1}
                help={!fridgeTouched && state.fridge ? t("editor.fridgeGuessed") : t("editor.fridgeHelp")}
                onChange={(v) => {
                  setFridgeTouched(true);
                  set({ fridge: v });
                }}
              />
            </div>
          </section>

          {/* 4. Ingredients */}
          <section className="re-section">
            <div className="re-section-head spread">
              <div className="re-section-title">
                <span className="re-num">4</span>
                <h2>{t("editor.ingredients")}</h2>
              </div>
              <span className="re-count">{t("editor.ingredientCount", { count: payload.ingredients.length })}</span>
            </div>
            <div className="re-ing-grid re-ing-labels" aria-hidden="true">
              <span />
              <span>{t("editor.qty")}</span>
              <span>{t("editor.unit")}</span>
              <span>{t("editor.ingredient")}</span>
              <span>{t("editor.note")}</span>
              <span />
            </div>
            <DndContext sensors={handleSensors} collisionDetection={closestCenter} onDragEnd={reorder("rows")}>
              <SortableContext items={state.rows.map((r) => r._id)} strategy={verticalListSortingStrategy}>
                <div className="re-rows">
                  {state.rows.map((row) =>
                    row.isSection ? (
                      <SortableRow key={row._id} id={row._id} className="re-ing-section">
                        <input
                          className="re-heading-pill"
                          aria-label={t("editor.sectionName")}
                          placeholder={t("editor.sectionPlaceholder")}
                          value={row.name}
                          style={{ width: `${Math.max(22, row.name.length + 4)}ch` }}
                          onChange={(e) => updateRow(row._id, "name", e.target.value)}
                        />
                        <button type="button" className="re-x" aria-label={t("editor.removeSection")} onClick={() => removeRow(row._id)}>
                          ×
                        </button>
                      </SortableRow>
                    ) : (
                      <SortableRow key={row._id} id={row._id} className="re-ing-grid re-ing-row">
                        <input
                          className="re-box re-qty"
                          aria-label={t("editor.quantity")}
                          inputMode="decimal"
                          placeholder="1 1/2"
                          value={row.quantity}
                          onChange={(e) => updateRow(row._id, "quantity", e.target.value)}
                        />
                        <UnitSelect
                          className="re-box re-unit"
                          aria-label={t("editor.unitAria")}
                          emptyLabel="—"
                          value={row.unit}
                          onChange={(u) => updateRow(row._id, "unit", u)}
                        />
                        <input
                          className="re-box re-name"
                          aria-label={t("editor.ingredientAria")}
                          placeholder={t("editor.ingredientPlaceholder")}
                          value={row.name}
                          onChange={(e) => updateRow(row._id, "name", e.target.value)}
                        />
                        <AutoTextarea
                          className="re-note"
                          aria-label={t("editor.noteAria")}
                          placeholder={t("editor.notePlaceholder")}
                          value={row.notes}
                          onChange={(e) => updateRow(row._id, "notes", e.target.value.replace(/\n/g, " "))}
                        />
                        <button type="button" className="re-x" aria-label={t("editor.removeIngredient")} onClick={() => removeRow(row._id)}>
                          ×
                        </button>
                      </SortableRow>
                    )
                  )}
                </div>
              </SortableContext>
            </DndContext>
            <div className="re-actions">
              <button type="button" className="re-btn soft" onClick={() => set((s) => ({ rows: [...s.rows, emptyIngredient()] }))}>
                {t("editor.addIngredient")}
              </button>
              <button type="button" className="re-btn" onClick={() => set((s) => ({ rows: [...s.rows, emptyIngredientSection()] }))}>
                {t("editor.addSection")}
              </button>
              <button type="button" className="re-btn dashed" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
                {t("editor.pasteList")}
              </button>
            </div>
            {pasteOpen && (
              <div className="re-paste">
                <textarea
                  aria-label={t("editor.pasteAria")}
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={t("editor.pastePlaceholder")}
                />
                <div className="re-actions">
                  <button type="button" className="re-btn primary" onClick={addPastedList} disabled={pasteBusy || !pasteText.trim()}>
                    {pasteBusy ? t("editor.reading") : t("editor.addThese")}
                  </button>
                  <button type="button" className="re-btn" onClick={() => setPasteOpen(false)}>
                    {t("editor.close")}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 5. Instructions */}
          <section className="re-section">
            <div className="re-section-head spread">
              <div className="re-section-title">
                <span className="re-num">5</span>
                <h2>{t("editor.instructions")}</h2>
              </div>
              <span className="re-count">{t("editor.stepCount", { count: stepCount })}</span>
            </div>
            <DndContext sensors={handleSensors} collisionDetection={closestCenter} onDragEnd={reorder("steps")}>
              <SortableContext items={state.steps.map((st) => st._id)} strategy={verticalListSortingStrategy}>
                <div className="re-steps">
                  {state.steps.map((step, i) => {
                    if (step.head) {
                      return (
                        <SortableRow key={step._id} id={step._id} className={`re-step head${i > 0 ? " spaced" : ""}`}>
                          <div className="re-step-main">
                            <input
                              className="re-heading-pill"
                              aria-label={t("editor.headingAria")}
                              placeholder={t("editor.headingPlaceholder")}
                              value={step.text}
                              style={{ width: `${Math.max(22, step.text.length + 4)}ch` }}
                              onChange={(e) => updateStep(step._id, { text: e.target.value })}
                            />
                          </div>
                          <button type="button" className="re-x" aria-label={t("editor.removeHeading")} onClick={() => removeStep(step._id)}>
                            ×
                          </button>
                        </SortableRow>
                      );
                    }
                    stepNumber += 1;
                    const timer = stepTimer(step.text);
                    return (
                      <SortableRow key={step._id} id={step._id} className="re-step">
                        <span className="re-step-num">{stepNumber}</span>
                        <div className="re-step-main" onDrop={(e) => handleStepDrop(step._id, e)}>
                          <AutoTextarea
                            className="re-step-text"
                            aria-label={t("editor.stepAria", { n: stepNumber })}
                            placeholder={t("editor.stepPlaceholder")}
                            value={step.text}
                            inputRef={(el) => {
                              if (el) stepInputs.current.set(step._id, el);
                              else stepInputs.current.delete(step._id);
                            }}
                            onChange={(e) => changeStepText(step._id, e.target.value)}
                          />
                          <div className="re-step-extras">
                            {timer && <span className="re-timer">⏱ {formatRecipeTime(timer.seconds / 60)}</span>}
                            {step.image ? (
                              <span className="re-step-photo">
                                <img src={step.image} alt="" />
                                <button
                                  type="button"
                                  aria-label={t("editor.removeStepPhoto")}
                                  onClick={() => updateStep(step._id, { image: null })}
                                >
                                  ×
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="re-add-photo"
                                onClick={() => {
                                  stepPhotoTarget.current = step._id;
                                  stepFileRef.current?.click();
                                }}
                              >
                                {t("editor.addPhoto")}
                              </button>
                            )}
                          </div>
                        </div>
                        <button type="button" className="re-x" aria-label={t("editor.deleteStep")} onClick={() => removeStep(step._id)}>
                          ×
                        </button>
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
            <input
              ref={stepFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              aria-label={t("editor.chooseStepPhoto")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && stepPhotoTarget.current) setStepPhotoFromFile(stepPhotoTarget.current, file);
                e.target.value = "";
              }}
            />
            <div className="re-steps-foot">
              <button type="button" className="re-btn primary" onClick={() => set((s) => ({ steps: [...s.steps, emptyStep()] }))}>
                {t("editor.addStep")}
              </button>
              <button type="button" className="re-btn" onClick={() => set((s) => ({ steps: [...s.steps, emptyStepHeading()] }))}>
                {t("editor.addHeading")}
              </button>
              <span className="re-help">{t("editor.headingsHelp")}</span>
            </div>
            <span className="re-help">{t("editor.timersHelp")}</span>
          </section>

          {/* 6. Notes */}
          <section className="re-section">
            <div className="re-section-head">
              <span className="re-num">6</span>
              <h2>{t("editor.notes")}</h2>
              <span className="re-count muted">{t("editor.optional")}</span>
            </div>
            <textarea
              className="re-notes"
              aria-label={t("editor.notes")}
              value={state.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder={t("editor.notesPlaceholder")}
            />
          </section>
        </div>

        <aside className="re-preview">
          <span className="re-label">{t("editor.previewLabel")}</span>
          <div className="re-preview-card">
            <div className="re-preview-photo">
              {cover && <img key={cover.url} src={cover.url} alt="" onError={hideBrokenPhoto} />}
              <span className={`re-preview-time${total ? "" : " unset"}`}>
                <span aria-hidden="true">⏱</span>
                {total ? formatRecipeTime(total) : t("editor.addTime")}
              </span>
            </div>
            <div className="re-preview-body">
              <strong>{state.title.trim() || t("editor.untitled")}</strong>
              <span className="re-preview-meta">
                {t("editor.previewMeta", { count: payload.ingredients.length, servings: Number(state.servings) || 4 })}
              </span>
              <div className="riso-recipe-card-havebar">
                <div className="riso-recipe-card-havebar-fill" style={{ width: `${havePct}%` }} />
              </div>
              <span className="re-preview-have">
                {stats.totalCount
                  ? t("editor.previewHave", { buy: stats.missingCount, have: stats.matchedCount })
                  : t("editor.noIngredients")}
              </span>
            </div>
          </div>
          <div className="re-checklist">
            <div className="re-checklist-head">
              <strong>{t("editor.readyToPlan")}</strong>
              <span>{t("editor.checksOf", { done: checks.filter((c) => c.ok).length, total: checks.length })}</span>
            </div>
            {checks.map((c) => (
              <div key={c.id} className={`re-check${c.ok ? " ok" : ""}`}>
                <span className="re-check-dot">{c.ok ? "✓" : ""}</span>
                <span>{c.ok ? c.label : c.hint || c.label}</span>
              </div>
            ))}
          </div>
          <p className="re-help">{t("editor.sortHelp")}</p>
        </aside>
      </div>

      <div className="re-savebar">
        <div className="re-savebar-inner">
          {error ? (
            <span className="re-error" role="alert">
              {error}
            </span>
          ) : dirty ? (
            <span className="re-unsaved">
              <span className="re-unsaved-dot" />
              {t("editor.unsaved")}
            </span>
          ) : (
            <span className="re-unsaved muted">{t("editor.noChanges")}</span>
          )}
          <span className="re-savebar-spacer" />
          <button type="button" className="re-btn big" onClick={handleCancel}>
            {t("editor.cancel")}
          </button>
          <button type="button" className="re-btn primary big" onClick={handleSave} disabled={saving}>
            {saving ? t("editor.saving") : isNew ? t("editor.saveRecipe") : t("editor.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
