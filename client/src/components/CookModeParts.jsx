import { useEffect, useRef } from "react";
import { formatQuantity, unitLabel } from "../lib/units.js";
import { stepTitle } from "../lib/steps.js";
import { t } from "../i18n/index.js";

// The pieces of Cook mode's step view (design: docs/design/riso-v2-cook-mode/) and its
// "Before you start" page (design: docs/design/riso-v2-cook-mode-prep/): the step rail,
// the "For this step" rows, the prep list and Do first card, and the timer card.
// CookMode.jsx holds the state and puts them on the page.

// The numbered dots joined by a dotted line. Done dots are ink with a ✓, the current
// one is blue and bigger, and the rest are plain. `side` is the computer's column down
// the left, with each step's title under its dot; `top` is the phone's row under the
// top bar, with no titles. A dot jumps to its step. It scrolls to keep the current one
// in view when there are more steps than room. A recipe with a "Before you start" page
// gives `prepLabel` ("Get ready"): the rail then starts with a dot "0" for that page,
// which is page -1 here (`stepIndex` -1), so it is current there and done (✓) after it.
export function StepRail({ steps, stepIndex, variant, onGo, prepLabel }) {
  const currentRef = useRef(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [stepIndex, variant]);

  return (
    <div className={`cm-rail ${variant}`} role="tablist" aria-label={t("cookMode.steps")}>
      <div className="cm-rail-track">
        {(prepLabel ? [null, ...steps] : steps).map((step, at) => {
          const i = prepLabel ? at - 1 : at; // the step's place; -1 is the prep page
          const title = step === null ? prepLabel : stepTitle(step);
          const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
          return (
            <div key={i} className={`cm-rail-item ${state}${i < 0 ? " prep" : ""}`}>
              <button
                type="button"
                role="tab"
                ref={state === "current" ? currentRef : null}
                aria-selected={state === "current"}
                aria-label={i < 0 ? prepLabel : title ? t("cookMode.stepLabelTitle", { n: i + 1, title }) : t("cookMode.stepLabel", { n: i + 1 })}
                title={i < 0 ? prepLabel : t("cookMode.stepLabel", { n: i + 1 })}
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

// An ingredient's amount for the servings: "2 tbsp", "900 g", "" when it has none.
function amountText(ing, scale) {
  const qty = ing.quantity != null ? ing.quantity * scale : null;
  if (qty == null) return "";
  return `${formatQuantity(qty)}${ing.unit ? ` ${unitLabel(ing.unit, qty)}` : ""}`;
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
          return (
            <button key={ing.id || ing.name} type="button" aria-pressed={on} className={`cm-uses-row${on ? " on" : ""}`} onClick={() => onToggle(keyOf(ing))}>
              <span className="cm-uses-dot" aria-hidden="true">
                {on ? "✓" : ""}
              </span>
              <span className="cm-uses-qty">{amountText(ing, scale)}</span>
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

// "STEP 2" or "STEPS 2 · 3": the steps that use an ingredient (the same matching as
// "For this step"). Nothing when no step does.
export function stepTag(stepNumbers) {
  if (!stepNumbers.length) return null;
  return stepNumbers.length === 1
    ? t("cookMode.prep.step", { n: stepNumbers[0] })
    : t("cookMode.prep.steps", { list: stepNumbers.join(" · ") });
}

const upperFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// The "Before you start" list: a header for each group (its name and how many), then one
// row for each ingredient, drawn like a "For this step" row (the round check, the amount,
// the name) with its how line under the name and the steps that use it: at the right on a
// computer, on its own line under the how line on a phone. `isOn` and `onToggle` are the
// same ticks "For this step" keeps, so a tick here shows there.
export function PrepList({ groups, scale, phone, isOn, onToggle }) {
  return (
    <div className="cm-prep-list">
      {groups.map((group) => {
        const name = t(`cookMode.prep.groups.${group.id}`);
        return (
          <section key={group.id} className="cm-prep-group" aria-label={name}>
            <div className="cm-prep-head">
              <span className="cm-prep-group-name">{name}</span>
              <span className="cm-prep-group-count">{t("cookMode.prep.count", { count: group.rows.length })}</span>
            </div>
            {group.rows.map((row, i) => {
              const on = isOn(row);
              const tag = stepTag(row.stepNumbers);
              return (
                <button key={`${row.ingredient.name}:${i}`} type="button" aria-pressed={on} className={`cm-uses-row cm-prep-row${on ? " on" : ""}`} onClick={() => onToggle(row)}>
                  <span className="cm-uses-dot" aria-hidden="true">
                    {on ? "✓" : ""}
                  </span>
                  <span className="cm-uses-qty">{amountText(row.ingredient, scale)}</span>
                  <span className="cm-prep-text">
                    <span className="cm-uses-name">{upperFirst(row.ingredient.name)}</span>
                    <span className="cm-prep-how">{row.how}</span>
                    {phone && tag && <span className="cm-prep-tag">{tag}</span>}
                  </span>
                  {!phone && tag && <span className="cm-prep-tag">{tag}</span>}
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// The recipe's own preheat sentence, in a card (under the photo on a computer, above the
// list on a phone).
export function DoFirstCard({ text }) {
  return (
    <div className="cm-prep-first">
      <span className="cm-prep-first-label">{t("cookMode.prep.doFirst")}</span>
      <span className="cm-prep-first-text">{text}</span>
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
