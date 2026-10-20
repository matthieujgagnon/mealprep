import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Popup } from "./RisoControls.jsx";
import { Pill } from "./RisoPills.jsx";
import { RECIPE_SLOTS } from "../lib/mealSlots.js";
import { t } from "../i18n/index.js";

// "Sort your recipes": a recipe needs at least one meal type, and the ones that were saved
// before that (or that were just imported) have none. This lists them, each with toggle chips for
// the meal types and for « Plat préparé », pre-picked from the title and ingredients (rules on the
// server, no AI) and marked « guess » until the person touches them. Nothing changes until
// Confirm; a recipe left with no type stays in the list, and "Not now" changes nothing. The
// same one-time-list sheet as Inventory's storage list (InventoryStorageSheet): same shell, same
// classes.
//
//   recipes   the recipes with no meal type yet, the one just imported first
//   onApply   ([{ id, mealSlots, isPrepared }]) -> resolves when saved
//   onClose
export function RecipeSortSheet({ recipes, isPhone, onApply, onClose }) {
  const [rows, setRows] = useState({}); // id -> { slots, prepared, guessed }
  const touched = useRef(new Set());
  const asked = useRef(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // A guess for every recipe the sheet has not asked about yet (the sheet stays open while a new
  // import comes in).
  useEffect(() => {
    const fresh = recipes.filter((r) => !asked.current.has(r.id));
    if (fresh.length === 0) return undefined;
    fresh.forEach((r) => asked.current.add(r.id));
    let cancelled = false;
    api
      .suggestRecipeTypes(fresh.map((r) => ({ id: r.id, title: r.title, ingredients: (r.ingredients || []).map((i) => ({ name: i.name })) })))
      .then((found) => {
        if (cancelled) return;
        setRows((prev) => {
          const next = { ...prev };
          for (const s of found) {
            if (touched.current.has(s.id)) continue;
            next[s.id] = { slots: s.slots, prepared: s.prepared, guessed: s.slots.length > 0 || s.prepared };
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipes]);

  const rowOf = (id) => rows[id] || { slots: [], prepared: false, guessed: false };
  const sorted = recipes.filter((r) => rowOf(r.id).slots.length > 0);

  function change(id, patch) {
    touched.current.add(id);
    setRows((prev) => ({ ...prev, [id]: { ...rowOf(id), ...(prev[id] || {}), ...patch, guessed: false } }));
  }
  const toggleSlot = (id, slotId) => {
    const slots = rowOf(id).slots;
    change(id, { slots: RECIPE_SLOTS.map((s) => s.id).filter((x) => (x === slotId ? !slots.includes(x) : slots.includes(x))) });
  };

  async function confirm() {
    if (saving || sorted.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onApply(sorted.map((r) => ({ id: r.id, mealSlots: rowOf(r.id).slots, isPrepared: rowOf(r.id).prepared })));
    } catch (err) {
      setError(err.message || t("recipes.sorting.failed"));
      setSaving(false);
    }
  }

  return (
    <Popup label={t("recipes.sorting.title")} onClose={onClose} isPhone={isPhone}>
      <div className="riso-storagesheet riso-sortsheet">
        <h2 className="riso-storagesheet-title">{t("recipes.sorting.title")}</h2>
        <p className="riso-storagesheet-intro">{t("recipes.sorting.intro")}</p>
        <ul className="riso-storagesheet-list">
          {recipes.map((recipe) => {
            const row = rowOf(recipe.id);
            return (
              <li key={recipe.id} className="riso-storagesheet-row riso-sortsheet-row">
                <div className="riso-storagesheet-who">
                  <span className="riso-storagesheet-name">{recipe.title}</span>
                  {row.guessed && (
                    <Pill size="mini" tone="dash" className="riso-sortsheet-guess">
                      {t("recipes.sorting.guess")}
                    </Pill>
                  )}
                </div>
                <div className="riso-storagesheet-pick riso-sortsheet-chips" role="group" aria-label={t("recipes.sorting.chipsAria", { title: recipe.title })}>
                  {RECIPE_SLOTS.map((slot) => {
                    const on = row.slots.includes(slot.id);
                    return (
                      <button key={slot.id} type="button" role="checkbox" aria-checked={on} className={`re-slot${on ? " on" : ""}`} onClick={() => toggleSlot(recipe.id, slot.id)}>
                        {on ? "✓ " : ""}
                        {slot.label}
                      </button>
                    );
                  })}
                  <button type="button" role="checkbox" aria-checked={row.prepared} className={`re-slot prepared${row.prepared ? " on" : ""}`} onClick={() => change(recipe.id, { prepared: !row.prepared })}>
                    {row.prepared ? "✓ " : ""}
                    {t("preparedMeal.switch")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {error && <p className="riso-storagesheet-error">{error}</p>}
        <div className="riso-storagesheet-actions">
          <button type="button" className="riso-btn" onClick={onClose} disabled={saving}>
            {t("recipes.sorting.notNow")}
          </button>
          <button type="button" className="riso-btn primary" onClick={confirm} disabled={saving || sorted.length === 0}>
            {t("recipes.sorting.confirm", { count: sorted.length })}
          </button>
        </div>
      </div>
    </Popup>
  );
}
