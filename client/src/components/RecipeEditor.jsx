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
      <button type="button" className="re-handle" aria-label="Drag to reorder" title="Drag to reorder" {...attributes} {...listeners}>
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
      aria-label={isCover ? "Cover photo" : "Make this the cover photo"}
      onClick={onCover}
    >
      {broken ? (
        <span className="re-photo-broken">Couldn't load this photo</span>
      ) : (
        <img src={photo.url} alt="" draggable={false} onError={() => setBroken(true)} />
      )}
      {isCover && <span className="re-photo-cover">Cover</span>}
      <button
        type="button"
        className="re-photo-remove"
        aria-label="Remove photo"
        title="Remove photo"
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
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => onChange(String(Math.max(0, n - step)))}>
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
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(String(n + step))}>
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
      setPhotoMessage("Only JPEG, PNG, WebP or GIF pictures can be added.");
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
    else setPhotoMessage("That didn't look like a picture. Try saving it first, then drop the file.");
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
      setReimport({ busy: false, message: "Add the recipe's link first (starting with https://)." });
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
        filled.push("title");
      }
      if (s.photos.length === 0 && scraped.photos?.length) {
        const photos = scraped.photos.map((u) => ({ id: makeLocalId(), url: u }));
        patch.photos = photos;
        patch.coverId = photos[Math.max(0, scraped.photos.indexOf(scraped.photoUrl))].id;
        filled.push("photos");
      }
      if (!s.prep && scraped.prepTimeMinutes) {
        patch.prep = String(scraped.prepTimeMinutes);
        filled.push("prep time");
      }
      if (!s.cook && scraped.cookTimeMinutes) {
        patch.cook = String(scraped.cookTimeMinutes);
        filled.push("cook time");
      }
      if (!s.rows.some((r) => !r.isSection && r.name.trim()) && scraped.ingredients?.length) {
        patch.rows = ingredientsToRows(scraped.ingredients);
        filled.push("ingredients");
        // Servings go with the ingredient amounts they were written for.
        if (scraped.baseServings) patch.servings = String(scraped.baseServings);
      }
      if (!s.steps.some((st) => st.text.trim()) && scraped.instructions?.length) {
        patch.steps = instructionsToSteps(scraped.instructions);
        filled.push("steps");
      }
      if (!s.fridge && scraped.fridgeLifeDays) patch.fridge = String(scraped.fridgeLifeDays);
      set(patch);
      setReimport({
        busy: false,
        message: filled.length
          ? `Filled in ${filled.join(", ")} from the link.`
          : "Nothing was empty, so nothing changed.",
      });
    } catch (err) {
      setReimport({ busy: false, message: err.message });
    }
  }

  async function handleSave() {
    if (!payload.title) {
      setError("Give the recipe a title first.");
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
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
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
    { ok: !!payload.title, label: "Title" },
    { ok: total > 0, label: "Prep or cook time", hint: "Add a time so it can be sorted" },
    { ok: !!state.mealSlot, label: "Planner slot", hint: "Pick a planner slot" },
    { ok: state.photos.length > 0, label: "At least one photo" },
    { ok: payload.ingredients.length > 0 && stepCount > 0, label: "Ingredients and steps" },
  ];

  let stepNumber = 0;

  return (
    <div className="riso-theme re-page" data-theme="light">
      <div className="re-heading">
        <button type="button" className="riso-eyebrow re-back" onClick={handleCancel}>
          ← RECIPES · {isNew ? "NEW" : "EDITING"}
        </button>
        <h1 className="re-title">
          {isNew ? "New" : "Edit"} <span className="accent">recipe.</span>
        </h1>
      </div>

      <div className="re-layout">
        <div className="re-form">
          {/* 1. The basics */}
          <section className="re-section">
            <div className="re-section-head">
              <span className="re-num">1</span>
              <h2>The basics</h2>
            </div>
            <label className="re-field">
              <span className="re-label">TITLE</span>
              <input
                className="re-title-input"
                value={state.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Grandma's lasagna"
              />
            </label>
            <div className="re-field">
              <span className="re-label">RECIPE LINK</span>
              <div className="re-link-row">
                <input
                  className="re-pill-input"
                  type="url"
                  aria-label="Recipe link"
                  value={state.sourceUrl}
                  onChange={(e) => set({ sourceUrl: e.target.value })}
                  placeholder="https://…"
                />
                <button type="button" className="re-btn" onClick={handleReimport} disabled={reimport.busy}>
                  {reimport.busy ? "Reading…" : "↻ Re-import"}
                </button>
              </div>
              <span className="re-help">
                {reimport.message ||
                  "Shown as “Open original” on the recipe card. Re-import refills any empty fields; it won't overwrite what you've edited."}
              </span>
            </div>
            <div className="re-field">
              <span className="re-label">PLANNER SLOT · WHERE DOES IT SIT ON THE CALENDAR? PICK ONE</span>
              <div className="re-slots" role="radiogroup" aria-label="Planner slot">
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
                <h2>Photos</h2>
              </div>
              <span className="re-count">
                {state.photos.length} PHOTO{state.photos.length === 1 ? "" : "S"}
              </span>
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
                      <span>Adding…</span>
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
                      Drop a picture here
                    </button>
                    <span className="re-zone-or">OR</span>
                    <input
                      className="re-zone-url"
                      aria-label="Photo URL"
                      placeholder="Paste a photo URL and press Enter"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const url = e.currentTarget.value.trim();
                        if (/^https?:\/\/\S+$/i.test(url)) {
                          addPhotoUrls([url]);
                          e.currentTarget.value = "";
                          setPhotoMessage(null);
                        } else {
                          setPhotoMessage("That link should start with https://");
                        }
                      }}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      hidden
                      aria-label="Choose photos"
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
              {photoMessage || "Drag photos to reorder them. Click one to make it the cover. Tap “Drop a picture here” to pick one from your device."}
            </span>
          </section>

          {/* 3. Time and servings */}
          <section className="re-section">
            <div className="re-section-head spread">
              <div className="re-section-title">
                <span className="re-num">3</span>
                <h2>Time and servings</h2>
              </div>
              <div className="re-total">
                <span>TOTAL</span>
                <strong>{total ? formatRecipeTime(total) : "not set"}</strong>
              </div>
            </div>
            <div className="re-steppers">
              <Stepper label="SERVINGS" value={state.servings} step={1} help="Scales the grocery list." onChange={(v) => set({ servings: v })} />
              <Stepper label="PREP" unit="MIN" accent value={state.prep} step={5} help="Chopping, measuring, marinating." onChange={(v) => set({ prep: v })} />
              <Stepper label="COOK" unit="MIN" accent value={state.cook} step={5} help="Time on the stove or in the oven." onChange={(v) => set({ cook: v })} />
              <Stepper
                label="FRIDGE LIFE"
                unit="DAYS"
                value={state.fridge}
                step={1}
                help={!fridgeTouched && state.fridge ? "Guessed from the ingredients. Change it any time." : "Used for leftovers in Inventory."}
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
                <h2>Ingredients</h2>
              </div>
              <span className="re-count">{payload.ingredients.length} INGREDIENTS · DRAG ⠿ TO REORDER</span>
            </div>
            <div className="re-ing-grid re-ing-labels" aria-hidden="true">
              <span />
              <span>QTY</span>
              <span>UNIT</span>
              <span>INGREDIENT</span>
              <span>NOTE</span>
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
                          aria-label="Section name"
                          placeholder="Section name, e.g. Dressing"
                          value={row.name}
                          style={{ width: `${Math.max(22, row.name.length + 4)}ch` }}
                          onChange={(e) => updateRow(row._id, "name", e.target.value)}
                        />
                        <button type="button" className="re-x" aria-label="Remove section" onClick={() => removeRow(row._id)}>
                          ×
                        </button>
                      </SortableRow>
                    ) : (
                      <SortableRow key={row._id} id={row._id} className="re-ing-grid re-ing-row">
                        <input
                          className="re-box re-qty"
                          aria-label="Quantity"
                          inputMode="decimal"
                          placeholder="1 1/2"
                          value={row.quantity}
                          onChange={(e) => updateRow(row._id, "quantity", e.target.value)}
                        />
                        <UnitSelect
                          className="re-box re-unit"
                          aria-label="Unit"
                          emptyLabel="—"
                          value={row.unit}
                          onChange={(u) => updateRow(row._id, "unit", u)}
                        />
                        <input
                          className="re-box re-name"
                          aria-label="Ingredient"
                          placeholder="Ingredient"
                          value={row.name}
                          onChange={(e) => updateRow(row._id, "name", e.target.value)}
                        />
                        <AutoTextarea
                          className="re-note"
                          aria-label="Note"
                          placeholder="e.g. melted"
                          value={row.notes}
                          onChange={(e) => updateRow(row._id, "notes", e.target.value.replace(/\n/g, " "))}
                        />
                        <button type="button" className="re-x" aria-label="Remove ingredient" onClick={() => removeRow(row._id)}>
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
                + Add ingredient
              </button>
              <button type="button" className="re-btn" onClick={() => set((s) => ({ rows: [...s.rows, emptyIngredientSection()] }))}>
                + Add section
              </button>
              <button type="button" className="re-btn dashed" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
                Paste a whole list
              </button>
            </div>
            {pasteOpen && (
              <div className="re-paste">
                <textarea
                  aria-label="Ingredient list"
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"One ingredient per line, e.g.\n2 cups flour\n1 tbsp butter, melted\nFor the sauce:\n3 tbsp soy sauce"}
                />
                <div className="re-actions">
                  <button type="button" className="re-btn primary" onClick={addPastedList} disabled={pasteBusy || !pasteText.trim()}>
                    {pasteBusy ? "Reading…" : "Add these"}
                  </button>
                  <button type="button" className="re-btn" onClick={() => setPasteOpen(false)}>
                    Close
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
                <h2>Instructions</h2>
              </div>
              <span className="re-count">
                {stepCount} STEP{stepCount === 1 ? "" : "S"} · DRAG ⠿ TO REORDER
              </span>
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
                              aria-label="Section heading"
                              placeholder="Section title, e.g. Sauce"
                              value={step.text}
                              style={{ width: `${Math.max(22, step.text.length + 4)}ch` }}
                              onChange={(e) => updateStep(step._id, { text: e.target.value })}
                            />
                          </div>
                          <button type="button" className="re-x" aria-label="Remove heading" onClick={() => removeStep(step._id)}>
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
                            aria-label={`Step ${stepNumber}`}
                            placeholder="Describe this step"
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
                                <button type="button" aria-label="Remove step photo" onClick={() => updateStep(step._id, { image: null })}>
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
                                + photo
                              </button>
                            )}
                          </div>
                        </div>
                        <button type="button" className="re-x" aria-label="Delete step" onClick={() => removeStep(step._id)}>
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
              aria-label="Choose a step photo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && stepPhotoTarget.current) setStepPhotoFromFile(stepPhotoTarget.current, file);
                e.target.value = "";
              }}
            />
            <div className="re-steps-foot">
              <button type="button" className="re-btn primary" onClick={() => set((s) => ({ steps: [...s.steps, emptyStep()] }))}>
                + Add step
              </button>
              <button type="button" className="re-btn" onClick={() => set((s) => ({ steps: [...s.steps, emptyStepHeading()] }))}>
                + Add section heading
              </button>
              <span className="re-help">Headings split a long recipe into parts, like “Make the sauce”.</span>
            </div>
            <span className="re-help">
              Times like “20 minutes” in a step become timers in cook mode. Importing a link fills these in for you.
            </span>
          </section>

          {/* 6. Notes */}
          <section className="re-section">
            <div className="re-section-head">
              <span className="re-num">6</span>
              <h2>Your notes</h2>
              <span className="re-count muted">OPTIONAL</span>
            </div>
            <textarea
              className="re-notes"
              aria-label="Your notes"
              value={state.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Used less salt than called for. Great with rice."
            />
          </section>
        </div>

        <aside className="re-preview">
          <span className="re-label">HOW IT LOOKS IN YOUR COOKBOOK</span>
          <div className="re-preview-card">
            <div className="re-preview-photo">
              {cover && <img key={cover.url} src={cover.url} alt="" onError={hideBrokenPhoto} />}
              <span className={`re-preview-time${total ? "" : " unset"}`}>
                <span aria-hidden="true">⏱</span>
                {total ? formatRecipeTime(total) : "add time"}
              </span>
            </div>
            <div className="re-preview-body">
              <strong>{state.title.trim() || "Untitled recipe"}</strong>
              <span className="re-preview-meta">
                {payload.ingredients.length} INGREDIENTS · SERVES {Number(state.servings) || 4}
              </span>
              <div className="riso-recipe-card-havebar">
                <div className="riso-recipe-card-havebar-fill" style={{ width: `${havePct}%` }} />
              </div>
              <span className="re-preview-have">
                {stats.totalCount
                  ? `${stats.missingCount} to buy · ${stats.matchedCount} on hand`
                  : "no ingredients yet"}
              </span>
            </div>
          </div>
          <div className="re-checklist">
            <div className="re-checklist-head">
              <strong>Ready to plan?</strong>
              <span>
                {checks.filter((c) => c.ok).length} OF {checks.length}
              </span>
            </div>
            {checks.map((c) => (
              <div key={c.label} className={`re-check${c.ok ? " ok" : ""}`}>
                <span className="re-check-dot">{c.ok ? "✓" : ""}</span>
                <span>{c.ok ? c.label : c.hint || c.label}</span>
              </div>
            ))}
          </div>
          <p className="re-help">The card sorts by total time. Set prep and cook time so this recipe shows up under “Quickest”.</p>
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
              UNSAVED CHANGES
            </span>
          ) : (
            <span className="re-unsaved muted">NO CHANGES YET</span>
          )}
          <span className="re-savebar-spacer" />
          <button type="button" className="re-btn big" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="re-btn primary big" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Save recipe" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
