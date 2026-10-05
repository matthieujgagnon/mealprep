import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InStockPill, TimePill } from "./RisoPills.jsx";
import { haveAndBuy } from "../lib/finder.js";
import { recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { stepIsHeading, stepText } from "../lib/steps.js";
import { slotLabel } from "../lib/plannerSlots.js";
import { hideBrokenPhoto } from "../lib/photos.js";
import { t } from "../i18n/index.js";

// The two cards that open beside a slot on the Planner (design: docs/design/
// riso-v2-planner-desktop, "Adding to a slot" and "Opening and removing a
// planned meal"): the empty slot's card (Recipe / Note / Empty card) and the
// planned meal's card (a preview, then Cook, Use as a base and Replace). They
// share a shell: 440px wide, to the right of the clicked slot when it fits
// inside the board and to the left when it does not; a Breakfast slot's card is
// top-aligned with it, the other rows' cards are bottom-aligned (they open
// upward). Closing: ×, Escape, or a click outside.

const GAP = 16;
const MARGIN = 12;

function useBesideSlot({ anchor, board, mealIndex }, deps) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card || !anchor?.isConnected) return;
    const cell = anchor.getBoundingClientRect();
    const limit = (board?.getBoundingClientRect() || { right: window.innerWidth, left: 0 });
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left = cell.right + GAP;
    if (left + width > limit.right) left = cell.left - GAP - width;
    left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    let top = mealIndex === 0 ? cell.top : cell.bottom - height;
    top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - height - MARGIN));
    setPos({ left: left + window.scrollX, top: top + window.scrollY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, board, mealIndex, ...deps]);

  return { ref, style: pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" } };
}

function useCloseOutside(ref, anchor, onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [ref, anchor, onClose]);
}

function CardShell({ cardRef, style, label, caps, title, onClose, children }) {
  return createPortal(
    <div ref={cardRef} className="riso-theme riso-slotcard" data-theme="light" role="dialog" aria-label={label} style={style}>
      <div className="riso-slotcard-head">
        <div>
          <span className="riso-slotcard-caps">{caps}</span>
          <h2 className="riso-slotcard-title">{title}</h2>
        </div>
        <button type="button" className="riso-slotcard-close" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </div>,
    document.body
  );
}

const QUICK = ["q1", "q2", "q3", "q4"];

// The empty slot's card. `note` is the existing note's text when a note slot
// was clicked (the card opens on the Note tile with it filled in).
export function SlotCard({ slot, mealIndex, anchor, board, note, onRecipe, onSaveNote, onBlank, onRemoveNote, onClose }) {
  const [mode, setMode] = useState(note != null ? "note" : null); // null | "note" | "blank"
  const [text, setText] = useState(note || "");
  const { ref, style } = useBesideSlot({ anchor, board, mealIndex }, [mode]);
  useCloseOutside(ref, anchor, onClose);
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === "note") inputRef.current?.focus();
  }, [mode]);

  const canSave = text.trim() !== "";
  const save = () => canSave && onSaveNote(text.trim());

  return (
    <CardShell
      cardRef={ref}
      style={style}
      label={t("tray.addTo", { slot: slotLabel(slot) })}
      caps={t("finder.addTo")}
      title={slotLabel(slot)}
      onClose={onClose}
    >
      <div className="riso-slotcard-buttons" role="group">
        <button type="button" className="riso-slotcard-btn recipe" onClick={onRecipe}>
          {t("planner.slotRecipe")}
        </button>
        <button type="button" className={`riso-slotcard-btn note${mode === "note" ? " selected" : ""}`} aria-pressed={mode === "note"} onClick={() => setMode("note")}>
          {t("planner.slotNote")}
        </button>
        <button type="button" className={`riso-slotcard-btn blank${mode === "blank" ? " selected" : ""}`} aria-pressed={mode === "blank"} onClick={() => setMode("blank")}>
          {t("planner.slotBlank")}
        </button>
      </div>

      {mode === "note" && (
        <div className="riso-slotcard-form">
          <input
            ref={inputRef}
            type="text"
            className="riso-slotcard-input"
            value={text}
            maxLength={80}
            placeholder={t("planner.noteType")}
            aria-label={t("planner.writeOnSlot")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // mid-emoji or accent: not a save
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <div className="riso-slotcard-quick">
            {QUICK.map((key) => (
              <button
                key={key}
                type="button"
                className="riso-slotcard-quickpill"
                onClick={() => {
                  setText(t(`planner.${key}`));
                  inputRef.current?.focus();
                }}
              >
                {t(`planner.${key}`)}
              </button>
            ))}
          </div>
          <button type="button" className={`riso-slotcard-save${canSave ? " ready" : ""}`} disabled={!canSave} onClick={save}>
            {t("planner.saveNote")}
          </button>
          {note != null && (
            <button type="button" className="riso-slotcard-remove" onClick={onRemoveNote}>
              {t("planner.removeNote")}
            </button>
          )}
        </div>
      )}

      {mode === "blank" && (
        <div className="riso-slotcard-blank">
          <strong>{t("planner.blankName")}</strong>
          <p>{t("planner.blankText")}</p>
          <button type="button" className="riso-slotcard-save ready" onClick={onBlank}>
            {t("planner.blankButton")}
          </button>
        </div>
      )}
    </CardShell>
  );
}

// The planned meal's card: a preview of the recipe, and three buttons.
export function PlannedCard({ slot, mealIndex, anchor, board, recipe, haveCores, grocery, onCook, onBase, onReplace, onClose }) {
  const { ref, style } = useBesideSlot({ anchor, board, mealIndex }, [recipe?.id]);
  useCloseOutside(ref, anchor, onClose);
  const { have, buy } = haveAndBuy(recipe, haveCores);
  const steps = (recipe.instructions || []).filter((s) => stepText(s).trim());
  const numbered = steps.filter((s) => !stepIsHeading(s));
  const slotName = recipeSlot(recipe);
  let n = 0;

  return (
    <CardShell
      cardRef={ref}
      style={style}
      label={recipe.title}
      caps={t("planner.plannedMeal")}
      title={slotLabel(slot)}
      onClose={onClose}
    >
      <div className="riso-plannedcard-body">
        <div className="riso-plannedcard-photo">{recipe.photoUrl ? <img src={recipe.photoUrl} alt="" onError={hideBrokenPhoto} /> : null}</div>
        <h3 className="riso-plannedcard-name">{recipe.title}</h3>
        <div className="riso-plannedcard-facts">
          <TimePill minutes={recipeTotalMinutes(recipe)} serves={recipe.baseServings} />
          {slotName && <span className="riso-plannedcard-meal">{t(`recipes.mealTypes.${slotName}`)}</span>}
        </div>
        {have.length > 0 && (
          <section>
            <h4 className="fnd-pop-caps">{t("finder.youHave", { count: have.length })}</h4>
            <div className="fnd-pop-pills">
              {have.map((item) => (
                <InStockPill key={item.core}>{item.name}</InStockPill>
              ))}
            </div>
          </section>
        )}
        {buy.length > 0 ? (
          <section>
            <h4 className="fnd-pop-caps">{t("finder.toBuy", { count: buy.length })}</h4>
            <div className="fnd-pop-pills">
              {buy.map((item) => {
                const listed = grocery.isOnList(item.name);
                return (
                  <button
                    key={item.core}
                    type="button"
                    className={`riso-pill size-chip tone-yellow has-mark fnd-buy-pill${listed ? " listed" : ""}`}
                    aria-pressed={listed}
                    aria-label={listed ? t("makeable.removeFromList", { name: item.name }) : t("makeable.addToList", { name: item.name })}
                    onClick={() => (listed ? grocery.remove(item.name) : grocery.add([item.name]))}
                  >
                    <span className="riso-pill-mark" aria-hidden="true">
                      {listed ? "✓" : "+"}
                    </span>
                    {item.name}
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="fnd-pop-allhere">{t("finder.allHere")}</p>
        )}
        {steps.length > 0 && (
          <section className="fnd-pop-steps">
            <h4 className="fnd-pop-stepshead">{t("finder.steps", { count: numbered.length })}</h4>
            <ol className="fnd-pop-steplist">
              {steps.map((step, i) =>
                stepIsHeading(step) ? null : (
                  <li key={i} value={(n += 1)}>
                    {stepText(step)}
                  </li>
                )
              )}
            </ol>
          </section>
        )}
      </div>
      <div className="riso-plannedcard-actions">
        <button type="button" className="riso-plannedcard-btn primary" onClick={onCook}>
          {t("planner.cook")}
        </button>
        <button type="button" className="riso-plannedcard-btn" onClick={onBase}>
          {t("planner.useAsBase")}
        </button>
        <button type="button" className="riso-plannedcard-btn" onClick={onReplace}>
          {t("planner.replaceRecipe")}
        </button>
      </div>
    </CardShell>
  );
}
