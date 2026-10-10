import { useEffect, useRef } from "react";
import { formatQuantity, unitLabel } from "../lib/units.js";
import { stepTitle } from "../lib/steps.js";
import { t } from "../i18n/index.js";

// The pieces of Cook mode's step view (design: docs/design/riso-v2-cook-mode/):
// the step rail, the "For this step" rows and the timer card. CookMode.jsx
// holds the state and puts them on the page.

// The numbered dots joined by a dotted line. Done dots are ink with a ✓, the current
// one is blue and bigger, and the rest are plain. `side` is the computer's column down
// the left, with each step's title under its dot; `top` is the phone's row under the
// top bar, with no titles. A dot jumps to its step. It scrolls to keep the current one
// in view when there are more steps than room.
export function StepRail({ steps, stepIndex, variant, onGo }) {
  const currentRef = useRef(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [stepIndex, variant]);

  return (
    <div className={`cm-rail ${variant}`} role="tablist" aria-label={t("cookMode.steps")}>
      <div className="cm-rail-track">
        {steps.map((step, i) => {
          const title = stepTitle(step);
          const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
          return (
            <div key={i} className={`cm-rail-item ${state}`}>
              <button
                type="button"
                role="tab"
                ref={state === "current" ? currentRef : null}
                aria-selected={state === "current"}
                aria-label={title ? t("cookMode.stepLabelTitle", { n: i + 1, title }) : t("cookMode.stepLabel", { n: i + 1 })}
                title={t("cookMode.stepLabel", { n: i + 1 })}
                className="cm-rail-tab"
                onClick={() => onGo(i)}
              >
                <span className="cm-rail-dot" aria-hidden="true">
                  {state === "done" ? "✓" : i + 1}
                </span>
                {variant === "side" && title && (
                  <span className="cm-rail-label" aria-hidden="true">
                    {title}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// What this step uses, one row each: the round check, the amount (scaled to the
// servings) in a column that lines up, and the name with its prep note after it.
// Tapping a row checks it off; `checked` is keyed `${stepIndex}:${name}`.
export function StepIngredients({ items, stepIndex, scale, checked, onToggle }) {
  const keyOf = (ing) => `${stepIndex}:${ing.name}`;
  const done = items.filter((ing) => checked[keyOf(ing)]).length;
  return (
    <div className="cm-uses">
      <div className="cm-uses-head">
        <span className="cm-uses-label">{t("cookMode.forThisStep")}</span>
        <span className="cm-uses-count">
          {done} / {items.length}
        </span>
      </div>
      <div className="cm-uses-list">
        {items.map((ing) => {
          const on = !!checked[keyOf(ing)];
          const qty = ing.quantity != null ? ing.quantity * scale : null;
          return (
            <button key={ing.id || ing.name} type="button" aria-pressed={on} className={`cm-uses-row${on ? " on" : ""}`} onClick={() => onToggle(keyOf(ing))}>
              <span className="cm-uses-dot" aria-hidden="true">
                {on ? "✓" : ""}
              </span>
              <span className="cm-uses-qty">
                {qty != null && (
                  <>
                    {formatQuantity(qty)}
                    {ing.unit ? ` ${unitLabel(ing.unit, qty)}` : ""}
                  </>
                )}
              </span>
              <span className="cm-uses-name">
                {ing.name}
                {ing.notes && <span className="cm-uses-prep">, {ing.notes}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The step's timer: yellow in light, a black card with yellow type in dark. Its label
// says what is happening ("ROASTING…"), then the time, then Start / Pause with +1 min
// and a round ↺ that starts it over.
export function TimerCard({ label, time, mainLabel, onMain, onPlusMinute, onReset }) {
  return (
    <div className="cm-timer">
      <div className="cm-timer-readout">
        <span className="cm-timer-label">{label}</span>
        <span className="cm-timer-time">{time}</span>
      </div>
      <div className="cm-timer-actions">
        <button type="button" className="cm-timer-main" onClick={onMain}>
          {mainLabel}
        </button>
        <button type="button" className="cm-timer-btn" onClick={onPlusMinute}>
          {t("cookMode.plusMinute")}
        </button>
        <button type="button" className="cm-timer-btn cm-timer-reset" aria-label={t("cookMode.reset")} title={t("cookMode.reset")} onClick={onReset}>
          ↺
        </button>
      </div>
    </div>
  );
}
