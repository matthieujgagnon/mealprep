import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TimePill } from "./RisoPills.jsx";
import { IngredientMarks } from "./RecipePopout.jsx";
import { haveAndBuy } from "../lib/finder.js";
import { formatRecipeTime, recipeSlot, recipeTotalMinutes } from "../lib/mealSlots.js";
import { stepIsHeading, stepText } from "../lib/steps.js";
import { slotLabel } from "../lib/plannerSlots.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { t } from "../i18n/index.js";

// The two cards that open beside a slot on the Planner (design: docs/design/
// riso-v2-planner-desktop, "Adding to a slot" and "Opening and removing a
// planned meal"): the empty slot's card (Recipe / Note / Empty card) and the
// planned meal's card (a preview, then Cook, Use as a base and Replace). They
// share a shell: 440px wide, to the right of the clicked slot when it fits
// inside the board and to the left when it does not; a Breakfast slot's card is
// top-aligned with it, the other rows' cards are bottom-aligned (they open
// upward). Closing: ×, Escape, or a click outside. On a phone (`inline`) the same
// cards, with the same rules, open directly under the tapped slot's row on the
// board and push the rows below down, with a notch pointing at the slot (design:
// docs/design/riso-v2-planner-mobile-v2): the same three tiles in the same
// colours (Recipe blue, Note yellow, Nothing planned white; on the planned meal
// Cook blue, Use as a base yellow, Replace white). The board places the card.

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

function useCloseOutside(ref, anchor, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
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
  }, [ref, anchor, onClose, enabled]);
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

// The card on a phone: under the slot's row, inside the board (which gives it
// its place and the notch's position). Escape closes it.
function InlineShell({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pmi" role="dialog" aria-label={label}>
      <span className="pmi-notch" aria-hidden="true" />
      {children}
    </div>
  );
}

// A tile's glyph above its label, on a phone.
const Glyph = ({ children }) => (
  <span className="pmi-glyph" aria-hidden="true">
    {children}
  </span>
);

const QUICK = ["q1", "q2", "q3", "q4"];

// The empty slot's card. `note` is the existing note's text when a note slot
// was clicked (the card opens on the Note tile with it filled in).
export function SlotCard({ slot, mealIndex, anchor, board, inline = false, inlineTitle, note, onRecipe, onSaveNote, onBlank, onRemoveNote, onClose }) {
  const [mode, setMode] = useState(note != null ? "note" : null); // null | "note"
  const [text, setText] = useState(note || "");
  // "Nothing planned" asks twice: the first click turns the tile ink ("✓ Confirm",
  // with a pink shadow; blue is Recipe), the second marks the slot. Anything else
  // clicked, or Escape, puts the tile back.
  const [confirming, setConfirming] = useState(false);
  const { ref, style } = useBesideSlot({ anchor: inline ? null : anchor, board, mealIndex }, [mode]);
  useCloseOutside(ref, anchor, onClose, !inline);
  const inputRef = useRef(null);
  const blankRef = useRef(null);

  useEffect(() => {
    if (mode === "note") inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!confirming) return undefined;
    // Capture on window, so this Escape cancels the question only and does not
    // also close the card (useCloseOutside listens on document).
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setConfirming(false);
    };
    const onDown = (e) => {
      if (!blankRef.current?.contains(e.target)) setConfirming(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [confirming]);

  const canSave = text.trim() !== "";
  const save = () => canSave && onSaveNote(text.trim());

  const body = (
    <>
      <div className={`riso-slotcard-buttons${inline ? " inline" : ""}`} role="group">
        <button type="button" className="riso-slotcard-btn recipe" onClick={onRecipe}>
          {inline && <Glyph>+</Glyph>}
          {t("planner.slotRecipe")}
        </button>
        <button type="button" className={`riso-slotcard-btn note${mode === "note" ? " selected" : ""}`} aria-pressed={mode === "note"} onClick={() => setMode("note")}>
          {inline && <Glyph>✎</Glyph>}
          {t("planner.slotNote")}
        </button>
        <button
          ref={blankRef}
          type="button"
          className={`riso-slotcard-btn blank${confirming ? " confirming" : ""}`}
          aria-label={confirming ? t("planner.slotConfirmAria", { slot: slotLabel(slot) }) : undefined}
          onClick={() => {
            if (!confirming) {
              setMode(null);
              setConfirming(true);
            } else {
              onBlank();
            }
          }}
        >
          {inline && <Glyph>{confirming ? "✓" : "○"}</Glyph>}
          {confirming ? (inline ? t("planner.slotConfirm") : `✓ ${t("planner.slotConfirm")}`) : t("planner.slotBlank")}
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
    </>
  );

  if (inline) {
    return (
      <InlineShell label={t("tray.addTo", { slot: slotLabel(slot) })} onClose={onClose}>
        <div className="pmi-head">
          <span className="pmi-caps">{inlineTitle}</span>
          <button type="button" className="pmi-close" aria-label={t("common.close")} onClick={onClose}>
            ✕
          </button>
        </div>
        {body}
      </InlineShell>
    );
  }

  return (
    <CardShell cardRef={ref} style={style} label={t("tray.addTo", { slot: slotLabel(slot) })} caps={t("finder.addTo")} title={slotLabel(slot)} onClose={onClose}>
      {body}
    </CardShell>
  );
}

// What a planned meal's status line says on a phone: leftovers and already have
// win; otherwise how much there is to buy.
function statusText(state, buyCount) {
  if (state === "leftover") return t("planner.statusLeftover");
  if (state === "have") return t("planner.statusHave");
  return buyCount === 0 ? t("planner.statusNothingToBuy") : t("planner.statusToBuy", { count: buyCount });
}

// The planned meal's card: a preview of the recipe, and three buttons. On a
// phone (`inline`) it is the compact card under the row: the photo, the slot,
// the name, the time and a status that is also a button: `state` ("none",
// "leftover" or "have") says what the meal is marked as, and tapping the status
// (`onCycle`) steps it plain -> leftovers -> already have -> plain (a computer
// has the round ✓ on the card for that).
export function PlannedCard({ slot, mealIndex, anchor, board, inline = false, inlineTitle, recipe, haveCores, grocery, state = "none", onCycle, onCook, onBase, onReplace, onClose }) {
  const { ref, style } = useBesideSlot({ anchor: inline ? null : anchor, board, mealIndex }, [recipe?.id]);
  useCloseOutside(ref, anchor, onClose, !inline);
  const { have, buy } = haveAndBuy(recipe, haveCores);
  const steps = (recipe.instructions || []).filter((s) => stepText(s).trim());
  const numbered = steps.filter((s) => !stepIsHeading(s));
  const slotName = recipeSlot(recipe);
  let n = 0;

  if (inline) {
    const status = statusText(state, buy.length);
    const time = formatRecipeTime(recipeTotalMinutes(recipe));
    return (
      <InlineShell label={recipe.title} onClose={onClose}>
        <div className="pmi-rec">
          <div className="pmi-photo">{recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}</div>
          <div className="pmi-info">
            <span className="pmi-caps">{inlineTitle}</span>
            <h3 className="pmi-name">{recipe.title}</h3>
            <div className="pmi-facts">
              {time && <span>{time}</span>}
              <button type="button" className={`pmi-status ${state}`} aria-label={t("planner.markStatusAria", { status })} onClick={onCycle}>
                {status}
                <span aria-hidden="true"> ⟳</span>
              </button>
            </div>
          </div>
          <button type="button" className="pmi-close" aria-label={t("common.close")} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="riso-plannedcard-actions inline">
          <button type="button" className="riso-plannedcard-btn primary" onClick={onCook}>
            <Glyph>▶</Glyph>
            {t("planner.cook")}
          </button>
          <button type="button" className="riso-plannedcard-btn base" onClick={onBase}>
            <Glyph>↳</Glyph>
            {t("planner.baseShort")}
          </button>
          <button type="button" className="riso-plannedcard-btn" onClick={onReplace}>
            <Glyph>⇄</Glyph>
            {t("planner.replaceShort")}
          </button>
        </div>
      </InlineShell>
    );
  }

  return (
    <CardShell cardRef={ref} style={style} label={recipe.title} caps={t("planner.plannedMeal")} title={slotLabel(slot)} onClose={onClose}>
      <div className="riso-plannedcard-body">
        <div className="riso-plannedcard-photo">{recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}</div>
        <h3 className="riso-plannedcard-name">{recipe.title}</h3>
        <div className="riso-plannedcard-facts">
          <TimePill minutes={recipeTotalMinutes(recipe)} serves={recipe.baseServings} />
          {slotName && <span className="riso-plannedcard-meal">{t(`recipes.mealTypes.${slotName}`)}</span>}
        </div>
        <IngredientMarks have={have} buy={buy} isOnList={grocery.isOnList} onToggleList={grocery.toggle} headingTag="h4" />
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
